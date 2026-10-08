// inventoryService — the Firestore side of inventory for BOTH audiences (business dashboard + creator
// merch shelf). The rules live in inventoryCore.ts; this file is persistence:
//   • saveProduct   — one transactional create/update that can't clobber a sale that lands mid-edit
//   • adjustStock   — receive / damage / recount with a ledger entry
//   • bulk ops, CSV import, photo upload (+ AI listing draft), sales velocity, waitlist ("notify me").

import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, where, orderBy, limit as qlimit,
  runTransaction, writeBatch,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { StoreProduct, StoreProductVariant, StoreProductCategory } from '../types';
import {
  saleLinesFromOrder, mergeProductData, summarizeSales, isTracked, variantStockOf, liveVariants,
  type StockMove, type StockReason, type ProductDraft, type SalesSummary,
} from './inventoryCore';

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));      // Firestore rejects undefined field values
const newMoveRef = () => doc(collection(db, 'stockMoves'));

export const sellerProducts = async (sellerId: string): Promise<StoreProduct[]> => {
  // Equality-only query + client sort: where+orderBy on another field would need a composite index.
  const snap = await getDocs(query(collection(db, 'storeProducts'), where('sellerId', '==', sellerId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

// ── Save (create / update) ────────────────────────────────────────────────────

export interface SaveProductArgs {
  sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG';
  /** Existing product id (omit to create). */
  id?: string;
  /** What the editor opened with — stock edits are applied as DELTAS against this, so a sale that
   *  landed while the editor was open is never overwritten. */
  original?: StoreProduct;
  /** Everything except stock (title, price, images, options, fulfillment …). */
  fields: Partial<StoreProduct>;
  /** Variants as edited (metadata + the stock number shown in the editor). */
  variants: StoreProductVariant[];
  /** Single-stock count as edited (ignored when variants exist). */
  baseStock: number;
}

export async function saveProduct(a: SaveProductArgs): Promise<string> {
  const now = Date.now(), by = auth.currentUser?.uid;
  const ref = a.id ? doc(db, 'storeProducts', a.id) : doc(collection(db, 'storeProducts'));
  const hasVariants = a.variants.length > 0;
  const tracked = isTracked({ ...a.original, ...a.fields } as StoreProduct);
  let wasOut = false, nowIn = false;

  await runTransaction(db, async tx => {
    const cur = a.id ? ((await tx.get(ref)).data() as StoreProduct | undefined) : undefined;
    const moves: Omit<StockMove, 'id'>[] = [];
    const mv = (variant: StoreProductVariant | undefined, before: number, after: number, reason: StockReason) => {
      if (after === before || !tracked) return;
      moves.push({ sellerId: a.sellerId, productId: ref.id, productTitle: String(a.fields.title ?? cur?.title ?? ''), variantId: variant?.id, variantName: variant?.name, delta: after - before, before, after, reason, by, at: now });
    };

    let stock: number; let variantStock: Record<string, number> | undefined; let variants: StoreProductVariant[] | undefined;
    if (hasVariants) {
      // Per variant: live-now + (edited − opened). New variants take the edited number as-is.
      variantStock = {}; variants = [];
      for (const v of a.variants) {
        const openedV = a.original?.variants?.find(x => x.id === v.id);
        const curV = cur?.variants?.find(x => x.id === v.id);
        let next = Math.max(0, Math.floor(v.stock || 0));
        let before = 0;
        if (cur && curV) {
          const live = variantStockOf(cur, curV);
          const opened = openedV ? variantStockOf(a.original!, openedV) : live;
          before = live;
          // Apply the seller's EDIT as a delta on top of what's live now. A lowered count can't push a
          // sale-drained variant below zero; an untouched one (delta 0) keeps whatever it is, even if oversold.
          const delta = next - opened;
          next = delta === 0 ? live : Math.max(0, live + delta);
        }
        mv(v, before, next, cur ? 'ADJUST' : 'INITIAL');
        variantStock[v.id] = next;
        variants.push({ ...v, stock: next });
      }
      stock = Object.values(variantStock).reduce((s, n) => s + n, 0);
    } else {
      const edited = Math.max(0, Math.floor(a.baseStock || 0));
      if (cur) {
        const live = Number(cur.stock ?? 0), opened = Number(a.original?.stock ?? live);
        const delta = edited - opened;
        stock = delta === 0 ? live : Math.max(0, live + delta);
        mv(undefined, live, stock, 'ADJUST');
      } else { stock = edited; mv(undefined, 0, stock, 'INITIAL'); }
    }

    wasOut = !!cur && isTracked(cur) && (cur.variants?.length ? liveVariants(cur).reduce((s, v) => s + v.stock, 0) : Number(cur.stock ?? 0)) <= 0;
    nowIn = stock > 0;
    const data: any = mergeProductData(cur, a.fields, {
      id: ref.id, sellerId: a.sellerId, sellerName: a.sellerName, sellerType: a.sellerType,
      stock, variants: hasVariants ? variants : [], variantStock: hasVariants ? variantStock : {},
      createdAt: cur?.createdAt || now, updatedAt: now,
    });
    if (!hasVariants) { delete data.variants; delete data.variantStock; }
    tx.set(ref, data);
    for (const m of moves) tx.set(newMoveRef(), strip({ ...m, id: undefined }));
  });
  // Sold out → back in stock through the editor: tell the shoppers who asked (best-effort).
  if (tracked && wasOut && nowIn) notifyRestocked({ id: ref.id, title: String(a.fields.title ?? a.original?.title ?? 'Item'), sellerId: a.sellerId, sellerName: a.sellerName } as StoreProduct).catch(() => {});
  return ref.id;
}

// ── Stock adjustments (receive / damage / recount) ────────────────────────────

export interface AdjustArgs {
  product: StoreProduct; variantId?: string;
  /** Add (+) or remove (−) units… */
  delta?: number;
  /** …or set the count outright (recount). */
  setTo?: number;
  reason: StockReason; note?: string;
}

/** Transactionally adjust one product/variant's count + write the ledger. Returns the new on-hand. */
export async function adjustStock(a: AdjustArgs): Promise<number> {
  const ref = doc(db, 'storeProducts', a.product.id);
  const by = auth.currentUser?.uid;
  let before = 0, after = 0;
  await runTransaction(db, async tx => {
    const p = { id: ref.id, ...((await tx.get(ref)).data() as any) } as StoreProduct;
    const upd: any = { updatedAt: Date.now() };
    let variant: StoreProductVariant | undefined;
    if (p.variants?.length) {
      variant = p.variants.find(v => v.id === a.variantId);
      if (!variant) throw new Error('Pick which option you are adjusting.');
      before = variantStockOf(p, variant);
      after = a.setTo != null ? Math.max(0, Math.floor(a.setTo)) : Math.max(0, before + Math.round(a.delta || 0));
      const map: Record<string, number> = {};
      for (const v of p.variants) map[v.id] = v.id === variant.id ? after : variantStockOf(p, v);
      upd.variantStock = map;
      upd.variants = p.variants.map(v => ({ ...v, stock: map[v.id] }));
      upd.stock = Object.values(map).reduce((s, n) => s + n, 0);
    } else {
      before = Number(p.stock ?? 0);
      after = a.setTo != null ? Math.max(0, Math.floor(a.setTo)) : Math.max(0, before + Math.round(a.delta || 0));
      upd.stock = after;
    }
    tx.update(ref, strip(upd));
    if (after !== before) {
      tx.set(newMoveRef(), strip({
        sellerId: p.sellerId, productId: p.id, productTitle: p.title, variantId: variant?.id, variantName: variant?.name,
        delta: after - before, before, after, reason: a.reason, note: a.note?.slice(0, 200), by, at: Date.now(),
      }));
    }
  });
  // Back in stock after being sold out → tell the people who asked (best-effort, never blocks).
  if (before <= 0 && after > 0) notifyRestocked(a.product).catch(() => {});
  return after;
}

export async function fetchStockMoves(sellerId: string, max = 150): Promise<StockMove[]> {
  const col = collection(db, 'stockMoves');
  try {
    const snap = await getDocs(query(col, where('sellerId', '==', sellerId), orderBy('at', 'desc'), qlimit(max)));
    return snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as StockMove));
  } catch {
    // Composite index (sellerId+at) may not be deployed yet — fall back to a client sort.
    try {
      const snap = await getDocs(query(col, where('sellerId', '==', sellerId)));
      return snap.docs.map(d => ({ ...(d.data() as any), id: d.id } as StockMove)).sort((a, b) => b.at - a.at).slice(0, max);
    } catch { return []; }
  }
}

// ── Bulk ops ──────────────────────────────────────────────────────────────────

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function bulkPatch(ids: string[], patch: Partial<StoreProduct>): Promise<void> {
  for (const part of chunk(ids, 400)) {
    const b = writeBatch(db);
    for (const id of part) b.update(doc(db, 'storeProducts', id), strip({ ...patch, updatedAt: Date.now() }));
    await b.commit();
  }
}
export async function bulkPriceChange(products: StoreProduct[], percent: number): Promise<void> {
  const f = 1 + percent / 100;
  for (const part of chunk(products, 400)) {
    const b = writeBatch(db);
    for (const p of part) b.update(doc(db, 'storeProducts', p.id), { price: Math.max(0.5, Math.round((p.price || 0) * f * 100) / 100), updatedAt: Date.now() });
    await b.commit();
  }
}
export async function bulkDelete(ids: string[]): Promise<void> {
  for (const part of chunk(ids, 400)) {
    const b = writeBatch(db);
    for (const id of part) b.delete(doc(db, 'storeProducts', id));
    await b.commit();
  }
}

// ── CSV import ────────────────────────────────────────────────────────────────

export async function importDrafts(
  drafts: ProductDraft[],
  who: { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG' },
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const now = Date.now();
  let done = 0;
  for (const part of chunk(drafts, 200)) {
    const b = writeBatch(db);
    part.forEach((d, i) => {
      const ref = doc(collection(db, 'storeProducts'));
      const variants = d.variants?.length ? d.variants : undefined;
      b.set(ref, strip({
        id: ref.id, sellerId: who.sellerId, sellerName: who.sellerName, sellerType: who.sellerType,
        title: d.title, description: d.description, category: d.category as StoreProductCategory, price: d.price,
        images: d.images, stock: variants ? variants.reduce((s, v) => s + (v.stock || 0), 0) : d.stock,
        variants, variantStock: variants ? Object.fromEntries(variants.map(v => [v.id, v.stock || 0])) : undefined,
        sku: d.sku, barcode: d.barcode, costPrice: d.costPrice, tags: d.tags, isDigital: d.category === 'DIGITAL', isActive: d.isActive,
        lowStockThreshold: 5, createdAt: now - i, updatedAt: now,   // keeps the CSV's order when sorted newest-first
      }));
    });
    await b.commit();
    done += part.length; onProgress?.(done, drafts.length);
  }
  return done;
}

// ── Upgrade old merch ─────────────────────────────────────────────────────────

/**
 * Promote items from the OLD merch shelf (which could display but never actually take payment) into the
 * working shop in one batch. Non-destructive: the old `merch` docs stay; each new storeProducts doc carries
 * `legacyMerchId` so the unified list (and the profile) show the new one and never both. Upgraded items go
 * live (a sold-out one simply reads "Sold out" instead of vanishing).
 */
export async function upgradeLegacyMerch(
  legacy: StoreProduct[],
  who: { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG' },
): Promise<number> {
  const now = Date.now();
  let n = 0;
  for (const part of chunk(legacy, 200)) {
    const b = writeBatch(db);
    part.forEach((p, i) => {
      const ref = doc(collection(db, 'storeProducts'));
      b.set(ref, strip({
        ...p, id: ref.id, sellerId: who.sellerId, sellerName: who.sellerName, sellerType: who.sellerType,
        legacyMerchId: p.legacyMerchId, isActive: true, lowStockThreshold: p.lowStockThreshold ?? 5,
        createdAt: p.createdAt || now - i, updatedAt: now,
      }));
    });
    await b.commit();
    n += part.length;
  }
  return n;
}

// ── Photos (+ AI listing draft) ───────────────────────────────────────────────

/** Upload product photos (optimised derivatives). Returns display URLs in the order given. */
export async function uploadProductPhotos(files: File[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to upload photos.');
  const { uploadImageWithDerivatives } = await import('./backendService');
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.type.startsWith('image/')) continue;
    const up = await uploadImageWithDerivatives(`users/${uid}/store/${Date.now()}_${i}`, f);
    urls.push(up.display);
    onProgress?.(i + 1, files.length);
  }
  return urls;
}

async function fileToJpegBase64(file: File, maxEdge = 1024): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}

export interface ListingDraft { title: string; description: string; category: StoreProductCategory; tags: string[] }

/** Look at the product photo (and any typed hint) and draft the listing. null on any failure — it's a shortcut, never a gate. */
export async function draftListingFromPhoto(file: File | null, hint = ''): Promise<ListingDraft | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;
    const parts: any[] = [{ text:
      'You write product listings for a small independent shop. Look at the product photo' + (hint ? ` (the seller calls it: "${hint}")` : '') +
      '. Return ONLY JSON: {"title": string (max 60 chars, no ALL CAPS, no emoji), "description": string (2 short sentences, concrete, honest — only what the photo supports), ' +
      '"category": one of APPAREL|MUSIC|ACCESSORIES|DIGITAL|COLLECTIBLES|BOOKS|ELECTRONICS|HOME|ART|OTHER, "tags": string[] (max 5, lowercase)}.' }];
    if (file) parts.push({ inlineData: { mimeType: 'image/jpeg', data: await fileToJpegBase64(file) } });
    const res = await fetch('/api/ai/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], config: { responseMimeType: 'application/json' } }),
    });
    if (!res.ok) return null;
    const { text } = await res.json();
    const j = JSON.parse(String(text || '').replace(/^```json|```$/g, '').trim());
    const cats = ['APPAREL', 'MUSIC', 'ACCESSORIES', 'DIGITAL', 'COLLECTIBLES', 'BOOKS', 'ELECTRONICS', 'HOME', 'ART', 'OTHER'];
    if (!j?.title) return null;
    return {
      title: String(j.title).slice(0, 80), description: String(j.description || '').slice(0, 600),
      category: (cats.includes(j.category) ? j.category : 'OTHER') as StoreProductCategory,
      tags: Array.isArray(j.tags) ? j.tags.map((t: any) => String(t).toLowerCase()).slice(0, 5) : [],
    };
  } catch { return null; }
}

// ── Sales velocity (drives "days of cover" + restock suggestions) ─────────────

export interface SellerPulse { sales: SalesSummary; toFulfil: number; oversold: number }

/** One read of the seller's orders → sales velocity (restock math) + what needs action right now. */
export async function fetchSellerPulse(sellerId: string, days = 30): Promise<SellerPulse> {
  try {
    const snap = await getDocs(query(collection(db, 'storeOrders'), where('sellerId', '==', sellerId)));
    const docs = snap.docs.map(d => d.data() as any);
    return {
      sales: summarizeSales(docs.flatMap(d => saleLinesFromOrder(d)), days),
      toFulfil: docs.filter(d => d.status === 'CONFIRMED' || d.status === 'PREPARING').length,
      oversold: docs.filter(d => d.oversold === true && d.status !== 'CANCELLED' && d.status !== 'REFUNDED').length,
    };
  } catch { return { sales: summarizeSales([], days), toFulfil: 0, oversold: 0 }; }
}

// ── Back-in-stock waitlist ────────────────────────────────────────────────────

export async function joinWaitlist(productId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to get notified.');
  await setDoc(doc(db, 'storeProducts', productId, 'waitlist', uid), { uid, at: Date.now() });
}
export async function leaveWaitlist(productId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) await deleteDoc(doc(db, 'storeProducts', productId, 'waitlist', uid)).catch(() => {});
}
export async function isOnWaitlist(productId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try { return (await getDoc(doc(db, 'storeProducts', productId, 'waitlist', uid))).exists(); } catch { return false; }
}
/** Seller-side: how many people are waiting for this item. */
export async function waitlistCount(productId: string): Promise<number> {
  try { return (await getDocs(collection(db, 'storeProducts', productId, 'waitlist'))).size; } catch { return 0; }
}

/** Notify everyone waiting, then clear the list. Seller-initiated (called after a restock). */
export async function notifyRestocked(product: StoreProduct): Promise<number> {
  const snap = await getDocs(collection(db, 'storeProducts', product.id, 'waitlist'));
  if (snap.empty) return 0;
  const { createNotification } = await import('./backendService');
  let n = 0;
  for (const d of snap.docs) {
    const uid = (d.data() as any).uid || d.id;
    await createNotification({
      userId: uid, senderId: product.sellerId, senderName: product.sellerName || 'Shop', senderPhoto: product.sellerPhoto || '',
      type: 'SYSTEM', title: `Back in stock: ${product.title}`, message: `${product.title} is available again — grab it before it sells out.`,
      link: 'STORE', targetId: product.id,
    } as any).catch(() => {});
    await deleteDoc(d.ref).catch(() => {});
    n++;
  }
  return n;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

/** Match a typed/scanned SKU or barcode to a product (and variant). */
export function findByCode(products: StoreProduct[], code: string): { product: StoreProduct; variantId?: string } | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  for (const p of products) {
    if ((p.sku || '').toLowerCase() === c || (p.barcode || '').toLowerCase() === c) return { product: p };
    const v = liveVariants(p).find(x => (x.sku || '').toLowerCase() === c || (x.barcode || '').toLowerCase() === c);
    if (v) return { product: p, variantId: v.id };
  }
  return null;
}
