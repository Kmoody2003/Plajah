// commerceBus — the ONE place the commerce surfaces talk to each other.
//
// Inventory, storefront, kiosk, POS register, org merch shop and digital signage all sit on the same
// Firestore data (storeProducts keyed by sellerId, businesses/{uid}/offers, storeOrders, signageSlides).
// This module gives every surface the same LIVE view of it:
//
//   • subscribeCatalog / subscribeOffers / subscribeOrders / subscribeSignage — Firestore onSnapshot
//     listeners (via safeSnapshot), SHARED + ref-counted per key: ten widgets watching one seller's
//     catalog cost one listener. Late subscribers get the last snapshot immediately.
//   • emitCommerce / onCommerce — a same-device instant channel (BroadcastChannel 'plajah-commerce',
//     window CustomEvent for the same tab, localStorage 'storage' event as the cross-tab fallback).
//     Firestore stays the source of truth; the channel only lets a second window (the signage TV, the
//     kiosk) react the instant the register rings a sale, before the snapshot round-trip lands.
//   • priceBoard / activeDeals / dealHeadline — PURE helpers (unit-tested in tests/commerceBus.test.ts)
//     built on inventoryCore so a menu board, a kiosk and the storefront agree on "sold out".
//
// Firebase is imported lazily inside the listeners so the pure helpers load in node tests without
// initialising the app.

import type { StoreProduct, DigitalSignageSlide } from '../types';
import type { BusinessOffer } from './offersCore';
import type { StoreOrderRecord } from './businessOpsService';
import { storefrontBadge } from './inventoryCore';

// ── Pure helpers ──────────────────────────────────────────────────────────────

export type BoardStatus = 'in' | 'low' | 'out';

export interface PriceBoardRow {
  id: string;
  title: string;
  /** Base price in dollars (variant modifiers ignored; see `hasOptions`). */
  price: number;
  compareAtPrice?: number;
  status: BoardStatus;
  /** Storefront badge text ("Sold out", "Only 3 left") or null. */
  badge: string | null;
  image?: string;
  category: string;
  hasOptions: boolean;
}

export interface PriceBoardOptions {
  /** Inventory category (StoreProductCategory) or a product tag, case-insensitive. */
  category?: string;
  /** Explicit products, rendered in this order. */
  productIds?: string[];
  hideSoldOut?: boolean;
}

/** Live price-board rows for a seller's catalog using the inventoryCore stock rules. Inactive products never show. */
export function priceBoard(products: StoreProduct[], opts: PriceBoardOptions = {}): PriceBoardRow[] {
  const cat = (opts.category || '').trim().toLowerCase();
  let list = products.filter(p => p && p.isActive !== false);
  if (opts.productIds?.length) {
    const order = new Map(opts.productIds.map((id, i) => [id, i]));
    list = list.filter(p => order.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  } else {
    list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }
  if (cat) {
    list = list.filter(p => String(p.category || '').toLowerCase() === cat
      || (p.tags || []).some(t => String(t).toLowerCase() === cat));
  }
  const rows = list.map<PriceBoardRow>(p => {
    const b = storefrontBadge(p);
    // Customer-facing scarcity only ("Only N left"); a one-size-gone restock signal stays an inventory concern.
    const status: BoardStatus = b.soldOut ? 'out' : b.left != null ? 'low' : 'in';
    const compare = typeof p.compareAtPrice === 'number' && p.compareAtPrice > p.price ? p.compareAtPrice : undefined;
    return {
      id: p.id, title: p.title || 'Untitled', price: Number(p.price) || 0, compareAtPrice: compare,
      status, badge: b.label, image: p.images?.[0], category: String(p.category || 'OTHER'),
      hasOptions: !!p.variants?.length,
    };
  });
  return opts.hideSoldOut ? rows.filter(r => r.status !== 'out') : rows;
}

/** Offers that are live right now. Honours optional startsAt/endsAt (ms) if an offer carries them. */
export function activeDeals(offers: BusinessOffer[], now: number = Date.now()): BusinessOffer[] {
  return (offers || []).filter(o => {
    if (!o || !o.active) return false;
    const x = o as BusinessOffer & { startsAt?: number; endsAt?: number };
    if (typeof x.startsAt === 'number' && now < x.startsAt) return false;
    if (typeof x.endsAt === 'number' && now >= x.endsAt) return false;
    return true;
  });
}

/** Short human headline for an offer ("10% off", "$5 off $40+", "Members: 10% off"). */
export function dealHeadline(o: BusinessOffer): string {
  const v = o.kind === 'PERCENT' ? `${Math.max(0, Math.min(100, o.value))}% off` : `$${fmtNum(o.value)} off`;
  const min = o.minSubtotalCents ? ` $${fmtNum(o.minSubtotalCents / 100)}+` : '';
  return `${o.membersOnly ? 'Members: ' : ''}${v}${min}`;
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Display money for boards: whole dollars drop the cents ($5), otherwise two places ($4.50). */
export const boardPrice = (dollars: number): string => `$${fmtNum(Math.round((dollars || 0) * 100) / 100)}`;

/**
 * Optimistically apply a SALE heard on the same-device channel to a catalog snapshot, so a second screen
 * flips to "Only 2 left" / "Sold out" before the Firestore snapshot lands. Untracked products are left
 * alone (inventoryCore never counts them). The next real snapshot replaces this.
 */
export function applySaleLocally(products: StoreProduct[], lines: { productId: string; variantId?: string; qty: number }[]): StoreProduct[] {
  if (!lines?.length) return products;
  const byId = new Map<string, { variantId?: string; qty: number }[]>();
  for (const l of lines) { if (l && l.productId && l.qty > 0) (byId.get(l.productId) || byId.set(l.productId, []).get(l.productId)!).push(l); }
  return products.map(p => {
    const ls = byId.get(p.id);
    if (!ls) return p;
    const total = ls.reduce((n, l) => n + l.qty, 0);
    const next: StoreProduct = { ...p, stock: Math.max(0, (p.stock ?? 0) - total) };
    if (p.variants?.length) {
      const vs = { ...(p.variantStock || {}) };
      for (const l of ls) {
        if (!l.variantId) continue;
        const v = p.variants.find(x => x.id === l.variantId);
        const cur = typeof vs[l.variantId] === 'number' ? vs[l.variantId] : (v?.stock ?? 0);
        vs[l.variantId] = Math.max(0, cur - l.qty);
      }
      next.variantStock = vs;
    }
    return next;
  });
}

// ── Shared, ref-counted Firestore listeners ───────────────────────────────────

type Listener<T> = (v: T) => void;
interface Channel<T> {
  subs: Set<Listener<T>>;
  errSubs: Set<(e: unknown) => void>;
  last?: T;
  stop: () => void;
}
const channels = new Map<string, Channel<any>>();

type Starter<T> = (emit: (v: T) => void, fail: (e: unknown) => void) => () => void;

function shared<T>(key: string, start: Starter<T>, cb: Listener<T>, onError?: (e: unknown) => void): () => void {
  let ch = channels.get(key) as Channel<T> | undefined;
  if (!ch) {
    const fresh: Channel<T> = { subs: new Set(), errSubs: new Set(), stop: () => {} };
    channels.set(key, fresh);
    fresh.stop = start(
      v => { fresh.last = v; fresh.subs.forEach(s => { try { s(v); } catch (e) { console.warn('[commerceBus] subscriber threw', e); } }); },
      e => { fresh.errSubs.forEach(s => { try { s(e); } catch { /* */ } }); },
    );
    ch = fresh;
  } else if (ch.last !== undefined) {
    const v = ch.last;
    queueMicrotask(() => { if (ch!.subs.has(cb)) cb(v); });
  }
  ch.subs.add(cb);
  if (onError) ch.errSubs.add(onError);
  let done = false;
  return () => {
    if (done) return; done = true;
    const c = channels.get(key) as Channel<T> | undefined;
    if (!c) return;
    c.subs.delete(cb);
    if (onError) c.errSubs.delete(onError);
    if (c.subs.size === 0) { channels.delete(key); try { c.stop(); } catch { /* */ } }
  };
}

/** Run an onSnapshot registration after lazily loading Firebase; the returned stop works before/after load. */
function lazySnapshot(register: (fs: typeof import('firebase/firestore'), db: any, onSnapshot: typeof import('./safeSnapshot').onSnapshot) => () => void, fail: (e: unknown) => void): () => void {
  let unsub: (() => void) | null = null;
  let stopped = false;
  Promise.all([import('firebase/firestore'), import('./firebase'), import('./safeSnapshot')])
    .then(([fs, fb, ss]) => { if (!stopped) unsub = register(fs, fb.db, ss.onSnapshot); })
    .catch(fail);
  return () => { stopped = true; if (unsub) { try { unsub(); } catch { /* */ } } };
}

export interface SubscribeOpts { onError?: (e: unknown) => void }

const newestFirst = (a: { createdAt?: number }, b: { createdAt?: number }) => (b.createdAt || 0) - (a.createdAt || 0);

/** Live: every storeProducts doc for a seller (active AND hidden — filter per surface), newest first. */
export function subscribeCatalog(sellerUid: string, cb: (products: StoreProduct[]) => void, opts: SubscribeOpts = {}): () => void {
  if (!sellerUid) { queueMicrotask(() => cb([])); return () => {}; }
  return shared<StoreProduct[]>(`catalog:${sellerUid}`, (emit, fail) => lazySnapshot((fs, db, onSnapshot) =>
    // Equality-only query + client sort (no composite index needed).
    onSnapshot(fs.query(fs.collection(db, 'storeProducts'), fs.where('sellerId', '==', sellerUid)),
      snap => emit(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreProduct)).sort(newestFirst)),
      fail), fail), cb, opts.onError);
}

/** Live: a business's offers (businesses/{uid}/offers). */
export function subscribeOffers(sellerUid: string, cb: (offers: BusinessOffer[]) => void, opts: SubscribeOpts = {}): () => void {
  if (!sellerUid) { queueMicrotask(() => cb([])); return () => {}; }
  return shared<BusinessOffer[]>(`offers:${sellerUid}`, (emit, fail) => lazySnapshot((fs, db, onSnapshot) =>
    onSnapshot(fs.collection(db, 'businesses', sellerUid, 'offers'),
      snap => emit(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as BusinessOffer[]),
      fail), fail), cb, opts.onError);
}

/** Map a server-spine storeOrders doc (items stored as a JSON string) — mirrors businessOpsService. */
export function mapOrderDoc(id: string, x: any): StoreOrderRecord {
  let items: StoreOrderRecord['items'] = [];
  try { items = typeof x.items === 'string' ? JSON.parse(x.items || '[]') : (Array.isArray(x.items) ? x.items : []); } catch { /* */ }
  return {
    id, businessUid: x.businessUid || x.sellerId, customerUid: x.customerUid || x.buyerId,
    status: x.status || 'PENDING_PAYMENT', items,
    subtotalCents: x.subtotalCents || 0, shippingCents: x.shippingCents || 0, totalCents: x.totalCents || undefined,
    fulfillment: x.fulfillment || 'PICKUP',
    note: x.note, customerName: x.customerName, customerEmail: x.customerEmail, createdAt: x.createdAt || 0, paidAt: x.paidAt,
    ship: x.shipLine1 ? { name: x.shipName || '', line1: x.shipLine1, line2: x.shipLine2 || undefined, city: x.shipCity || '', state: x.shipState || '', postal: x.shipPostal || '', country: x.shipCountry || '' } : undefined,
    trackingNumber: x.trackingNumber || undefined, trackingCarrier: x.trackingCarrier || undefined,
    oversold: x.oversold === true, source: x.source,
  };
}

/** Live: a seller's storeOrders, newest first. Queries sellerId (the field the rules gate reads on). */
export function subscribeOrders(sellerUid: string, cb: (orders: StoreOrderRecord[]) => void, opts: SubscribeOpts & { limit?: number } = {}): () => void {
  if (!sellerUid) { queueMicrotask(() => cb([])); return () => {}; }
  const max = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : 0;
  return shared<StoreOrderRecord[]>(`orders:${sellerUid}`, (emit, fail) => lazySnapshot((fs, db, onSnapshot) =>
    onSnapshot(fs.query(fs.collection(db, 'storeOrders'), fs.where('sellerId', '==', sellerUid)),
      snap => emit(snap.docs.map(d => mapOrderDoc(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
      fail), fail), max ? (list => cb(list.slice(0, max))) : cb, opts.onError);
}

/** Live: a business page's signage slides (ALL — filter isActive per display), ordered by `order`. */
export function subscribeSignage(businessPageId: string, cb: (slides: DigitalSignageSlide[]) => void, opts: SubscribeOpts = {}): () => void {
  if (!businessPageId) { queueMicrotask(() => cb([])); return () => {}; }
  return shared<DigitalSignageSlide[]>(`signage:${businessPageId}`, (emit, fail) => lazySnapshot((fs, db, onSnapshot) =>
    // Equality-only + client sort: where(businessId)+orderBy(order) would need a composite index.
    onSnapshot(fs.query(fs.collection(db, 'signageSlides'), fs.where('businessId', '==', businessPageId)),
      snap => emit(snap.docs.map(d => ({ id: d.id, ...d.data() } as DigitalSignageSlide)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
      fail), fail), cb, opts.onError);
}

// ── Same-device instant channel ───────────────────────────────────────────────

export interface CommerceLine { productId: string; variantId?: string; qty: number }

export type CommerceEvent =
  | { type: 'SALE'; sellerUid: string; orderId: string; lines: CommerceLine[]; totalCents?: number; source?: 'POS' | 'KIOSK' | 'STORE' }
  | { type: 'STOCK'; sellerUid: string; productId: string }
  | { type: 'PRICE'; sellerUid: string; productId: string; price?: number }
  | { type: 'DEAL'; sellerUid: string; offerId?: string }
  | { type: 'ORDER'; sellerUid: string; orderId: string; status: string }
  | { type: 'SIGNAGE_PUSH'; businessId: string; slideId?: string };

export type CommerceEnvelope = CommerceEvent & { at: number; origin: string };

const CHANNEL = 'plajah-commerce';
const WIN_EVENT = 'plajah:commerce';
const LS_KEY = 'plajah_commerce_evt';
const ORIGIN = `t_${Math.random().toString(36).slice(2, 10)}`;
let bc: BroadcastChannel | null | undefined;

function channel(): BroadcastChannel | null {
  if (bc !== undefined) return bc;
  try { bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch { bc = null; }
  return bc;
}

/** Fire a commerce event to every surface on this device (this tab + other tabs/windows). */
export function emitCommerce(evt: CommerceEvent): void {
  const env: CommerceEnvelope = { ...evt, at: Date.now(), origin: ORIGIN } as CommerceEnvelope;
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent(WIN_EVENT, { detail: env })); } catch { /* */ }
  }
  const ch = channel();
  if (ch) { try { ch.postMessage(env); return; } catch { /* fall through */ } }
  try { localStorage.setItem(LS_KEY, JSON.stringify(env)); } catch { /* private mode */ }
}

/** Listen for commerce events from any surface on this device. Returns an unsubscribe. */
export function onCommerce(cb: (evt: CommerceEnvelope) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const seen = new Set<string>();
  const deliver = (env: CommerceEnvelope | null | undefined) => {
    if (!env || typeof env !== 'object' || !('type' in env)) return;
    const k = `${env.origin}:${env.at}:${env.type}`;
    if (seen.has(k)) return;
    seen.add(k); if (seen.size > 200) seen.clear();
    try { cb(env); } catch (e) { console.warn('[commerceBus] onCommerce handler threw', e); }
  };
  const onWin = (e: Event) => deliver((e as CustomEvent).detail);
  const onMsg = (e: MessageEvent) => deliver(e.data);
  const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY && e.newValue) { try { deliver(JSON.parse(e.newValue)); } catch { /* */ } } };
  window.addEventListener(WIN_EVENT, onWin);
  window.addEventListener('storage', onStorage);
  // A dedicated BroadcastChannel per listener: the shared one is the sender, and a channel never hears itself.
  let rx: BroadcastChannel | null = null;
  try { rx = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch { rx = null; }
  rx?.addEventListener('message', onMsg);
  return () => {
    window.removeEventListener(WIN_EVENT, onWin);
    window.removeEventListener('storage', onStorage);
    if (rx) { rx.removeEventListener('message', onMsg); try { rx.close(); } catch { /* */ } }
  };
}

// ── Merch → one catalog ───────────────────────────────────────────────────────

export interface MerchProductInput {
  title: string;
  description?: string;
  price: number;
  images?: string[];
  category?: StoreProduct['category'];
  stock?: number;
  isDigital?: boolean;
  fulfillmentSource?: StoreProduct['fulfillmentSource'];
  printfulSyncProductId?: number;
  printfulVariantId?: number;
  externalStoreUrl?: string;
}

/**
 * Create a merch item as a canonical storeProducts doc (through inventoryService.saveProduct, so the
 * INITIAL stock-ledger move is written) — it then shows in inventory, POS, kiosk, storefront and signage.
 * sellerId must be the signed-in uid (storeProducts rules). Emits STOCK on this device.
 */
export async function publishMerchProduct(m: MerchProductInput, who: { sellerId: string; sellerName: string; sellerType: 'USER' | 'ORG' }): Promise<StoreProduct> {
  const { saveProduct } = await import('./inventoryService');
  const pod = m.fulfillmentSource && m.fulfillmentSource !== 'manual';
  const fields: Partial<StoreProduct> = JSON.parse(JSON.stringify({
    title: m.title, description: m.description || '', price: Number(m.price) || 0,
    images: (m.images || []).filter(Boolean), category: m.category || 'APPAREL',
    isDigital: !!m.isDigital, isActive: true,
    fulfillmentSource: m.fulfillmentSource || 'manual',
    printfulSyncProductId: m.printfulSyncProductId, printfulVariantId: m.printfulVariantId,
    externalStoreUrl: m.externalStoreUrl,
    lowStockThreshold: pod ? undefined : 5,
  }));
  const baseStock = pod ? 0 : Math.max(0, Math.floor(m.stock ?? 0));
  const id = await saveProduct({ ...who, fields, variants: [], baseStock });
  const now = Date.now();
  emitCommerce({ type: 'STOCK', sellerUid: who.sellerId, productId: id });
  return { ...(fields as StoreProduct), id, sellerId: who.sellerId, sellerName: who.sellerName, sellerType: who.sellerType, stock: baseStock, createdAt: now, updatedAt: now };
}
