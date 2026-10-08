// inventoryCore — the PURE inventory rules shared by the server order spine, the dashboards, the POS
// register/kiosk and the public storefront. No Firebase / DOM imports on purpose: one definition of
// "how many can I sell", "what does this line cost" and "what needs restocking" everywhere, and it's
// unit-testable (tests/inventoryCore.test.ts).
//
// Design rules this encodes:
//  • Stock lives at TWO levels. `stock` = total on hand (what the storefront list reads). For products
//    with variants, `variantStock[variantId]` is the LIVE per-variant truth — a map (not the variants[]
//    array) because Firestore can atomically increment a map field but NOT an array element.
//    `variants[].stock` stays as the legacy/display fallback.
//  • Not everything has inventory: print-on-demand, digital and external-link products are UNTRACKED —
//    they're always sellable and never show stock numbers (the #1 "why does my POD hoodie say 0" bug).
//  • Prices are DOLLARS on the product, CENTS on the wire. Variant price = base + priceModifier.

import type { StoreProduct, StoreProductVariant, StoreProductCategory } from '../types';

// ── Tracking + availability ───────────────────────────────────────────────────

const UNTRACKED_FULFILLMENT = new Set(['printful', 'gelato', 'api', 'external']);
const SAFE_FIELD_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const DEFAULT_LOW_STOCK = 5;
/** At/below this many left, the storefront shows "Only N left" (real scarcity, never fake). */
export const SCARCITY_AT = 5;

type P = Pick<StoreProduct, 'isDigital' | 'fulfillmentSource' | 'trackInventory'>;

/** Does this product have countable inventory? POD / digital / external-link products don't. */
export function isTracked(p: Partial<P>): boolean {
  if (typeof p.trackInventory === 'boolean') return p.trackInventory;
  if (p.isDigital) return false;
  return !UNTRACKED_FULFILLMENT.has(String(p.fulfillmentSource || ''));
}

export const isSafeVariantId = (id: string): boolean => SAFE_FIELD_ID.test(id);

/** Live on-hand for one variant: the atomic `variantStock` map wins over the variants[] snapshot. */
export function variantStockOf(p: Pick<StoreProduct, 'variantStock'>, v: StoreProductVariant): number {
  const live = p.variantStock?.[v.id];
  return Math.max(0, typeof live === 'number' ? live : (v.stock ?? 0));
}

/** variants[] with live stock overlaid — what every reader should render. */
export function liveVariants(p: Pick<StoreProduct, 'variants' | 'variantStock'>): StoreProductVariant[] {
  return (p.variants || []).map(v => ({ ...v, stock: variantStockOf(p, v) }));
}

/** Total sellable units across the product (variants summed when present). Infinity if untracked. */
export function totalStock(p: StoreProduct): number {
  if (!isTracked(p)) return Infinity;
  if (p.variants?.length) return liveVariants(p).reduce((s, v) => s + v.stock, 0);
  return Math.max(0, p.stock ?? 0);
}

/** How many of this product/variant can be sold right now. Infinity = unlimited (untracked/backorder). */
export function availableFor(p: StoreProduct, variantId?: string): number {
  if (!isTracked(p) || p.allowBackorder) return Infinity;
  if (p.variants?.length) {
    const v = p.variants.find(x => x.id === variantId);
    return v ? variantStockOf(p, v) : 0;
  }
  return Math.max(0, p.stock ?? 0);
}

export type StockStatus = 'UNTRACKED' | 'OUT' | 'LOW' | 'OK';

export function stockStatus(p: StoreProduct): StockStatus {
  if (!isTracked(p)) return 'UNTRACKED';
  const total = totalStock(p);
  if (total <= 0) return 'OUT';
  const t = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : DEFAULT_LOW_STOCK;
  if (total <= t) return 'LOW';
  // A product can look healthy in total while one size is gone — that's still a restock signal.
  if (p.variants?.length && liveVariants(p).some(v => v.stock <= 0)) return 'LOW';
  return 'OK';
}

/** Variants at/below the product's alert level (sold-out first) — the "which size?" answer. */
export function variantAlerts(p: StoreProduct): StoreProductVariant[] {
  if (!isTracked(p) || !p.variants?.length) return [];
  const t = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : DEFAULT_LOW_STOCK;
  return liveVariants(p).filter(v => v.stock <= t).sort((a, b) => a.stock - b.stock);
}

/** Storefront scarcity/sold-out label for a product (or one variant). Never shows numbers for untracked. */
export function storefrontBadge(p: StoreProduct, variantId?: string): { soldOut: boolean; left?: number; label: string | null } {
  if (!isTracked(p) || p.allowBackorder) return { soldOut: false, label: null };
  const n = variantId || !p.variants?.length ? availableFor(p, variantId) : totalStock(p);
  if (n <= 0) return { soldOut: true, label: 'Sold out' };
  if (n <= SCARCITY_AT) return { soldOut: false, left: n, label: `Only ${n} left` };
  return { soldOut: false, label: null };
}

// ── Pricing + line resolution (used by the server spine AND the client for previews) ─────────────

export const unitPriceCents = (p: Pick<StoreProduct, 'price' | 'variants'>, variantId?: string): number => {
  const mod = variantId ? (p.variants?.find(v => v.id === variantId)?.priceModifier || 0) : 0;
  return Math.max(0, Math.round(((p.price || 0) + mod) * 100));
};

export interface ResolvedLine {
  productId: string;
  variantId?: string;
  variantName?: string;
  title: string;
  qty: number;
  unitAmount: number;     // cents
  tracked: boolean;
  image?: string;
}
export type LineResult = { ok: true; line: ResolvedLine } | { ok: false; code: 'NOT_FOUND' | 'UNAVAILABLE' | 'WRONG_SELLER' | 'BAD_PRICE' | 'NEED_VARIANT' | 'BAD_VARIANT' | 'SOLD_OUT' | 'INSUFFICIENT'; error: string; available?: number };

/**
 * Price + stock-check ONE requested line against the product as stored. The single place the "can
 * this be sold, and for how much" decision is made — create-order, pos-sale and the cart all use it.
 */
export function resolveLine(
  p: StoreProduct | null | undefined,
  req: { productId: string; variantId?: string; qty: number },
  opts: { sellerId?: string; allowInactive?: boolean; ignoreStock?: boolean } = {},
): LineResult {
  if (!p) return { ok: false, code: 'NOT_FOUND', error: `Product not found: ${req.productId}` };
  if (!opts.allowInactive && p.isActive === false) return { ok: false, code: 'UNAVAILABLE', error: `Unavailable: ${p.title || req.productId}` };
  if (opts.sellerId && p.sellerId && p.sellerId !== opts.sellerId) return { ok: false, code: 'WRONG_SELLER', error: 'An item does not belong to this shop.' };
  const qty = Math.max(1, Math.min(99, Math.floor(Number(req.qty) || 0)));

  let variant: StoreProductVariant | undefined;
  if (p.variants?.length) {
    if (!req.variantId) return { ok: false, code: 'NEED_VARIANT', error: `Choose an option for ${p.title}.` };
    variant = p.variants.find(v => v.id === req.variantId);
    if (!variant) return { ok: false, code: 'BAD_VARIANT', error: `That option of ${p.title} is no longer available.` };
  }
  const unitAmount = unitPriceCents(p, variant?.id);
  if (!(unitAmount > 0)) return { ok: false, code: 'BAD_PRICE', error: `Invalid price for ${p.title}` };

  const avail = availableFor(p, variant?.id);
  const name = variant ? `${p.title} (${variant.name})` : p.title;
  // The register never blocks on a wrong count — the item is in the cashier's hand. It sells, goes
  // negative, and is flagged for a recount (see the ledger) instead of stopping the line.
  if (!opts.ignoreStock && avail <= 0) return { ok: false, code: 'SOLD_OUT', error: `${name} is sold out.`, available: 0 };
  if (!opts.ignoreStock && qty > avail) return { ok: false, code: 'INSUFFICIENT', error: `Only ${avail} of ${name} left.`, available: avail };

  return { ok: true, line: {
    productId: p.id, variantId: variant?.id, variantName: variant?.name,
    title: p.title || 'Item', qty, unitAmount, tracked: isTracked(p), image: p.images?.[0],
  } };
}

/**
 * The atomic increments to apply when `qty` of a line sells. Empty for untracked products; for
 * variants it ALSO decrements the per-variant map entry. `soldCount` always climbs (best-seller sort).
 */
export function planDecrement(p: StoreProduct, variantId: string | undefined, qty: number): Record<string, number> {
  const q = Math.abs(Math.round(qty));
  const inc: Record<string, number> = { soldCount: q };
  if (!isTracked(p)) return inc;
  inc.stock = -q;
  if (variantId && p.variants?.length && isSafeVariantId(variantId)) inc[`variantStock.${variantId}`] = -q;
  return inc;
}

/** The variantStock map to seed for products that predate it (so the first atomic decrement is correct). */
export function variantStockSeed(p: StoreProduct): Record<string, number> | null {
  if (!p.variants?.length) return null;
  const map: Record<string, number> = { ...(p.variantStock || {}) };
  let changed = !p.variantStock;
  for (const v of p.variants) {
    if (!isSafeVariantId(v.id)) continue;
    if (typeof map[v.id] !== 'number') { map[v.id] = Math.max(0, v.stock ?? 0); changed = true; }
  }
  return changed ? map : null;
}

// ── Stock movements (the ledger) ──────────────────────────────────────────────

export type StockReason = 'RECEIVE' | 'SALE' | 'POS_SALE' | 'OFFLINE_SALE' | 'RETURN' | 'DAMAGE' | 'LOST' | 'COUNT' | 'ADJUST' | 'INITIAL';
export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  RECEIVE: 'Received', SALE: 'Online sale', POS_SALE: 'Register sale', OFFLINE_SALE: 'Sold in person', RETURN: 'Customer return',
  DAMAGE: 'Damaged', LOST: 'Lost / stolen', COUNT: 'Recount', ADJUST: 'Manual adjust', INITIAL: 'Starting stock',
};
export interface StockMove {
  id: string;
  sellerId: string;
  productId: string;
  productTitle: string;
  variantId?: string;
  variantName?: string;
  delta: number;
  before: number;
  after: number;
  reason: StockReason;
  note?: string;
  orderId?: string;
  by?: string;
  at: number;
}

// ── Totals + insight ──────────────────────────────────────────────────────────

export interface InventoryTotals { products: number; live: number; units: number; retailValue: number; costValue: number; low: number; out: number; untracked: number }

export function inventoryTotals(products: StoreProduct[]): InventoryTotals {
  const t: InventoryTotals = { products: products.length, live: 0, units: 0, retailValue: 0, costValue: 0, low: 0, out: 0, untracked: 0 };
  for (const p of products) {
    if (p.isActive !== false) t.live++;
    const s = stockStatus(p);
    if (s === 'UNTRACKED') { t.untracked++; continue; }
    if (s === 'OUT') t.out++;
    if (s === 'LOW') t.low++;
    const n = totalStock(p);
    t.units += n;
    t.retailValue += n * (p.price || 0);
    t.costValue += n * (p.costPrice || 0);
  }
  return t;
}

export const marginPct = (price: number, cost?: number): number | null =>
  cost && cost > 0 && price > 0 ? Math.round(((price - cost) / price) * 100) : null;

export interface SaleLine { productId: string; variantId?: string; qty: number; cents: number; at: number; title?: string }
const PAID = new Set(['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED', 'COMPLETED']);

/** Flatten an order doc (spine shape: items = JSON string of {qty,unitAmount}; legacy: items[] of {quantity,price}). */
export function saleLinesFromOrder(o: any): SaleLine[] {
  if (!o || !PAID.has(String(o.status))) return [];
  let items: any[] = [];
  try { items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (Array.isArray(o.items) ? o.items : []); } catch { items = []; }
  const at = Number(o.paidAt || o.createdAt || 0);
  return items.filter(i => i?.productId).map(i => ({
    productId: String(i.productId),
    variantId: i.variantId ? String(i.variantId) : undefined,
    qty: Number(i.qty ?? i.quantity ?? 0) || 0,
    cents: i.unitAmount != null ? Number(i.unitAmount) * (Number(i.qty ?? 1) || 1) : Math.round(Number(i.price || 0) * 100 * (Number(i.quantity ?? 1) || 1)),
    at, title: i.title,
  }));
}

export interface SalesSummary {
  days: number;
  units: number;
  revenueCents: number;
  perDay: Map<string, number>;       // `${productId}|${variantId||''}` → units/day
  perDayProduct: Map<string, number>;
  top: { productId: string; title: string; units: number; cents: number }[];
}

export function summarizeSales(lines: SaleLine[], days = 30, now = Date.now()): SalesSummary {
  const since = now - days * 86_400_000;
  const perV = new Map<string, number>(), perP = new Map<string, number>();
  const prod = new Map<string, { title: string; units: number; cents: number }>();
  let units = 0, revenueCents = 0;
  for (const l of lines) {
    if (l.at < since) continue;
    units += l.qty; revenueCents += l.cents;
    perV.set(`${l.productId}|${l.variantId || ''}`, (perV.get(`${l.productId}|${l.variantId || ''}`) || 0) + l.qty);
    perP.set(l.productId, (perP.get(l.productId) || 0) + l.qty);
    const e = prod.get(l.productId) || { title: l.title || '', units: 0, cents: 0 };
    e.units += l.qty; e.cents += l.cents; if (l.title) e.title = l.title; prod.set(l.productId, e);
  }
  const norm = (m: Map<string, number>) => { for (const [k, v] of m) m.set(k, v / days); return m; };
  return {
    days, units, revenueCents, perDay: norm(perV), perDayProduct: norm(perP),
    top: [...prod.entries()].map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.cents - a.cents).slice(0, 5),
  };
}

export const daysOfCover = (onHand: number, perDay: number): number => (perDay > 0 ? onHand / perDay : Infinity);

export interface RestockItem {
  product: StoreProduct;
  variant?: StoreProductVariant;
  onHand: number;
  perDay: number;
  cover: number;           // days; Infinity = no recent sales
  suggest: number;         // units to order to cover (lead + cover window)
  urgency: 'OUT' | 'SOON' | 'LOW';
}

/**
 * What should I reorder? Looks at each tracked product (per-variant when it has them): sold-out first,
 * then anything that will run out within the supplier lead time, then plain low-stock.
 * `suggest` = sales-rate × (lead + cover window) − on-hand, with a floor so "low" never suggests 0.
 */
export function restockPlan(products: StoreProduct[], sales: SalesSummary, opts: { leadDays?: number; coverDays?: number } = {}): RestockItem[] {
  const lead = opts.leadDays ?? 14, cover = opts.coverDays ?? 30;
  const out: RestockItem[] = [];
  for (const p of products) {
    if (!isTracked(p) || (p.isActive === false && totalStock(p) > 0 && !(sales.perDayProduct.get(p.id) || 0))) continue; // hidden + not selling = not a restock signal
    const t = typeof p.lowStockThreshold === 'number' ? p.lowStockThreshold : DEFAULT_LOW_STOCK;
    const rows: { variant?: StoreProductVariant; onHand: number; perDay: number }[] = p.variants?.length
      ? liveVariants(p).map(v => ({ variant: v, onHand: v.stock, perDay: sales.perDay.get(`${p.id}|${v.id}`) || 0 }))
      : [{ onHand: Math.max(0, p.stock ?? 0), perDay: sales.perDayProduct.get(p.id) || 0 }];
    for (const r of rows) {
      const c = daysOfCover(r.onHand, r.perDay);
      const urgency: RestockItem['urgency'] | null = r.onHand <= 0 ? 'OUT' : c <= lead ? 'SOON' : r.onHand <= t ? 'LOW' : null;
      if (!urgency) continue;
      // A variant that's out but has never sold isn't urgent noise — only flag it if the product sells.
      if (urgency === 'OUT' && r.variant && r.perDay === 0 && (sales.perDayProduct.get(p.id) || 0) === 0 && totalStock(p) > 0) continue;
      const need = Math.ceil(r.perDay * (lead + cover) - r.onHand);
      out.push({ product: p, variant: r.variant, onHand: r.onHand, perDay: r.perDay, cover: c, urgency, suggest: Math.max(need, urgency === 'LOW' ? t * 2 : 1) });
    }
  }
  const rank = { OUT: 0, SOON: 1, LOW: 2 } as const;
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.cover - b.cover);
}

// ── Options → variant matrix (sizes × colors) ─────────────────────────────────

export const SIZE_PRESETS = {
  Tees: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
  'Kids': ['2T', '3T', '4T', 'XS', 'S', 'M'],
  Hats: ['One size'],
  Shoes: ['7', '8', '9', '10', '11', '12'],
} as const;
export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' }, { name: 'White', hex: '#f5f5f5' }, { name: 'Navy', hex: '#1f2a44' },
  { name: 'Heather Gray', hex: '#9aa0a6' }, { name: 'Red', hex: '#d62839' }, { name: 'Forest', hex: '#2f5d3a' },
  { name: 'Sand', hex: '#d9c7a3' }, { name: 'Orange', hex: '#ff8c00' }, { name: 'Purple', hex: '#6b0099' },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12) || 'x';
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36).slice(0, 4); };

/** Stable, Firestore-field-safe variant id derived from its option values (so regenerating keeps ids). */
export const variantIdFor = (name: string): string => `v_${slug(name)}${hash(name.toLowerCase())}`;

/** Short unique-ish SKU like `HOOD-LG-BLK`. */
export function suggestSku(title: string, variantName?: string, taken: Set<string> = new Set()): string {
  const head = (title.match(/[A-Za-z0-9]+/g) || ['ITEM']).join('').toUpperCase().slice(0, 4).padEnd(3, 'X');
  const tail = (variantName ? variantName.split(/[\s/]+/).filter(Boolean).map(w => (/^\d/.test(w) ? w : w.slice(0, 3)).toUpperCase()).join('-') : '');
  let base = tail ? `${head}-${tail}` : head;
  let sku = base, n = 2;
  while (taken.has(sku)) sku = `${base}-${n++}`;
  return sku;
}

/**
 * Build the full variant list from option lists. `existing` variants are matched by name
 * (case-insensitively) so adding "XL" to a product that already has S/M/L keeps the S/M/L counts.
 */
export function buildVariantMatrix(opts: {
  title: string; sizes: string[]; colors: string[];
  existing?: StoreProductVariant[]; defaultStock?: number; autoSku?: boolean;
}): StoreProductVariant[] {
  const sizes = opts.sizes.filter(Boolean), colors = opts.colors.filter(Boolean);
  const names: string[] = sizes.length && colors.length
    ? sizes.flatMap(s => colors.map(c => `${s} / ${c}`))
    : sizes.length ? sizes : colors;
  if (!names.length) return [];
  const byName = new Map((opts.existing || []).map(v => [v.name.trim().toLowerCase(), v]));
  const taken = new Set((opts.existing || []).map(v => v.sku).filter(Boolean) as string[]);
  return names.map(name => {
    const prev = byName.get(name.trim().toLowerCase());
    if (prev) return prev;
    const sku = opts.autoSku === false ? undefined : suggestSku(opts.title, name, taken);
    if (sku) taken.add(sku);
    return { id: variantIdFor(name), name, sku, stock: opts.defaultStock ?? 0 };
  });
}

// ── CSV import (Shopify / Square / Etsy / generic) ────────────────────────────

export interface ProductDraft {
  title: string; description: string; price: number; stock: number; sku?: string; barcode?: string;
  costPrice?: number; images: string[]; category: StoreProductCategory; tags: string[]; isActive: boolean;
  variants?: StoreProductVariant[];
}
export type CsvFormat = 'shopify' | 'square' | 'etsy' | 'generic';

/** RFC-4180-ish CSV parse (quotes, escaped quotes, CRLF, BOM, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

export function detectCsvFormat(headers: string[]): CsvFormat {
  const h = new Set(headers.map(x => x.trim().toLowerCase()));
  if (h.has('handle') && (h.has('title') || h.has('variant price'))) return 'shopify';
  if (h.has('item name') && (h.has('variation name') || h.has('token'))) return 'square';
  if (h.has('title') && h.has('price') && h.has('quantity') && (h.has('image1') || h.has('currency_code'))) return 'etsy';
  return 'generic';
}

const money = (s: string | undefined): number => {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const intOf = (s: string | undefined): number => { const n = parseInt(String(s ?? '').replace(/[^0-9\-]/g, ''), 10); return Number.isFinite(n) ? Math.max(0, n) : 0; };
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const truthy = (s: string | undefined, dflt = true) => { const v = String(s ?? '').trim().toLowerCase(); return v === '' ? dflt : !['false', 'no', '0', 'draft', 'archived', 'n'].includes(v); };

export function guessCategory(...hints: (string | undefined)[]): StoreProductCategory {
  const t = hints.filter(Boolean).join(' ').toLowerCase();
  if (/shirt|tee|hood|sweat|jacket|hat|cap|beanie|sock|apparel|clothing|dress|pant/.test(t)) return 'APPAREL';
  if (/vinyl|cd\b|cassette|album|record|music|audio/.test(t)) return 'MUSIC';
  if (/book|zine|novel|magazine|print book/.test(t)) return 'BOOKS';
  if (/poster|print|art|canvas|painting/.test(t)) return 'ART';
  if (/mug|candle|home|decor|blanket|pillow|coffee|tea/.test(t)) return 'HOME';
  if (/sticker|pin|patch|keychain|tote|bag|accessor|jewel/.test(t)) return 'ACCESSORIES';
  if (/digital|download|preset|template|ebook/.test(t)) return 'DIGITAL';
  if (/collect|figure|limited|signed/.test(t)) return 'COLLECTIBLES';
  if (/electronic|cable|speaker|headphone/.test(t)) return 'ELECTRONICS';
  return 'OTHER';
}

const ALIASES: Record<string, string[]> = {
  title: ['title', 'name', 'product', 'product name', 'item', 'item name'],
  description: ['description', 'body', 'body (html)', 'details'],
  price: ['price', 'variant price', 'amount', 'retail'],
  stock: ['stock', 'quantity', 'qty', 'inventory', 'on hand', 'variant inventory qty'],
  sku: ['sku', 'variant sku'],
  barcode: ['barcode', 'upc', 'ean', 'gtin', 'variant barcode'],
  cost: ['cost', 'cost per item', 'unit cost'],
  image: ['image', 'image url', 'image src', 'photo', 'picture', 'image1'],
  category: ['category', 'type', 'product category'],
  tags: ['tags', 'tag'],
};

export function rowsToDrafts(rows: string[][], format?: CsvFormat): { format: CsvFormat; drafts: ProductDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  if (rows.length < 2) return { format: 'generic', drafts: [], warnings: ['The file has no product rows.'] };
  const headers = rows[0].map(x => x.trim());
  const fmt = format || detectCsvFormat(headers);
  const lower = headers.map(x => x.toLowerCase());
  const idx = (...names: string[]) => { for (const n of names) { const i = lower.indexOf(n.toLowerCase()); if (i >= 0) return i; } return -1; };
  const idxPrefix = (p: string) => lower.findIndex(x => x.startsWith(p));
  const col = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const body = rows.slice(1);
  const drafts: ProductDraft[] = [];

  const finishVariants = (title: string, vs: StoreProductVariant[], prices: number[]): { price: number; variants?: StoreProductVariant[] } => {
    if (vs.length <= 1 && (vs[0]?.name === '' || /^default( title)?$/i.test(vs[0]?.name || '') || vs.length === 0)) return { price: prices[0] || 0 };
    const base = Math.min(...prices.filter(p => p > 0), Infinity);
    const basePrice = Number.isFinite(base) ? base : 0;
    return { price: basePrice, variants: vs.map((v, i) => ({ ...v, id: variantIdFor(v.name || `option ${i + 1}`), priceModifier: prices[i] > basePrice ? Math.round((prices[i] - basePrice) * 100) / 100 : undefined })) };
  };

  if (fmt === 'shopify') {
    const iH = idx('handle'), iT = idx('title'), iB = idx('body (html)'), iType = idx('type'), iTags = idx('tags'), iPub = idx('published');
    const iO1 = idx('option1 value'), iO2 = idx('option2 value'), iSku = idx('variant sku'), iP = idx('variant price');
    const iQ = idx('variant inventory qty'), iImg = idx('image src'), iVimg = idx('variant image'), iCost = idx('cost per item'), iBar = idx('variant barcode');
    const groups = new Map<string, string[][]>();
    for (const r of body) { const h = col(r, iH); if (!h) continue; (groups.get(h) || groups.set(h, []).get(h)!).push(r); }
    for (const [handle, rs] of groups) {
      const first = rs.find(r => col(r, iT)) || rs[0];
      const title = col(first, iT) || handle;
      const vs: StoreProductVariant[] = [], prices: number[] = [];
      const images: string[] = [];
      for (const r of rs) {
        const img = col(r, iImg); if (img && !images.includes(img)) images.push(img);
        const o1 = col(r, iO1), o2 = col(r, iO2);
        if (!o1 && !col(r, iP)) continue;                 // image-only continuation row
        vs.push({ id: '', name: [o1, o2].filter(Boolean).join(' / '), sku: col(r, iSku) || undefined, stock: intOf(col(r, iQ)), imageUrl: col(r, iVimg) || undefined });
        prices.push(money(col(r, iP)));
      }
      const fin = finishVariants(title, vs, prices);
      const cost = money(col(rs.find(r => col(r, iCost)) || first, iCost));
      drafts.push({
        title, description: stripHtml(col(first, iB)), price: fin.price, stock: fin.variants ? fin.variants.reduce((s, v) => s + v.stock, 0) : (vs[0]?.stock ?? 0),
        sku: fin.variants ? undefined : vs[0]?.sku, barcode: col(first, iBar) || undefined, costPrice: cost || undefined, images,
        category: guessCategory(col(first, iType), title), tags: col(first, iTags).split(',').map(s => s.trim()).filter(Boolean),
        isActive: truthy(col(first, iPub)), variants: fin.variants,
      });
    }
  } else if (fmt === 'square') {
    const iT = idx('item name'), iV = idx('variation name'), iD = idx('description'), iC = idx('categories', 'category', 'reporting category');
    const iSku = idx('sku'), iP = idx('price'), iQ = idxPrefix('current quantity'), iImg = idx('image', 'image url'), iBar = idx('gtin', 'upc');
    const groups = new Map<string, string[][]>();
    for (const r of body) { const t = col(r, iT); if (!t) continue; (groups.get(t) || groups.set(t, []).get(t)!).push(r); }
    for (const [title, rs] of groups) {
      const vs = rs.map(r => ({ id: '', name: col(r, iV) === 'Regular' ? '' : col(r, iV), sku: col(r, iSku) || undefined, stock: intOf(col(r, iQ)) } as StoreProductVariant));
      const prices = rs.map(r => money(col(r, iP)));
      const fin = finishVariants(title, vs, prices);
      const f = rs[0];
      drafts.push({ title, description: col(f, iD), price: fin.price, stock: fin.variants ? fin.variants.reduce((s, v) => s + v.stock, 0) : (vs[0]?.stock ?? 0),
        sku: fin.variants ? undefined : vs[0]?.sku, barcode: col(f, iBar) || undefined, images: col(f, iImg) ? [col(f, iImg)] : [],
        category: guessCategory(col(f, iC), title), tags: [], isActive: true, variants: fin.variants });
    }
  } else {
    // Etsy + generic: one row per product.
    const iT = idx(...ALIASES.title), iD = idx(...ALIASES.description), iP = idx(...ALIASES.price), iQ = idx(...ALIASES.stock);
    const iSku = idx(...ALIASES.sku), iBar = idx(...ALIASES.barcode), iCost = idx(...ALIASES.cost), iCat = idx(...ALIASES.category), iTags = idx(...ALIASES.tags);
    const imgCols = lower.map((x, i) => (/^(image\d*|image url|image src|photo|picture)$/.test(x) ? i : -1)).filter(i => i >= 0);
    if (iT < 0) warnings.push('Couldn\'t find a title/name column — rename one column "title".');
    if (iP < 0) warnings.push('Couldn\'t find a price column — rename one column "price".');
    if (fmt === 'etsy' && lower.some(x => x.startsWith('variation'))) warnings.push('Etsy variations aren\'t in the export — add sizes/colors after import.');
    for (const r of body) {
      const title = col(r, iT); if (!title) continue;
      drafts.push({ title, description: col(r, iD), price: money(col(r, iP)), stock: intOf(col(r, iQ)), sku: col(r, iSku) || undefined, barcode: col(r, iBar) || undefined,
        costPrice: money(col(r, iCost)) || undefined, images: imgCols.map(i => col(r, i)).filter(u => /^https?:\/\//.test(u)),
        category: guessCategory(col(r, iCat), title), tags: col(r, iTags).split(/[,;]/).map(s => s.trim()).filter(Boolean), isActive: true });
    }
  }

  for (const d of drafts) {
    if (!(d.price > 0)) warnings.push(`"${d.title}" has no price — set one before publishing.`);
    d.isActive = d.isActive && d.price > 0;           // never auto-publish a $0 item
  }
  if (!drafts.length) warnings.push('No products found in that file.');
  return { format: fmt, drafts, warnings };
}

export const CSV_TEMPLATE = 'title,price,stock,sku,category,description,image,cost\nLogo Tee,28,40,TEE-LOGO,apparel,Soft ringspun cotton tee,https://example.com/tee.jpg,9.50\n';

// ── Shipping helpers ──────────────────────────────────────────────────────────

export const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Other'] as const;
/** Public tracking page for the common carriers (null when we can't build one). */
export function trackingUrl(carrier: string | undefined, number: string | undefined): string | null {
  const n = encodeURIComponent((number || '').trim());
  if (!n) return null;
  switch ((carrier || '').toLowerCase()) {
    case 'usps': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case 'ups': return `https://www.ups.com/track?tracknum=${n}`;
    case 'fedex': return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case 'dhl': return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${n}`;
    default: return null;
  }
}

/**
 * The document saveProduct writes: the live doc, overlaid by the edited fields, then server-controlled
 * identity/stock fields. `undefined` is stripped (Firestore rejects it) AFTER it overrides the live value,
 * so an edited field set to undefined is removed and one set to false / 0 / 'STANDARD' is stored. The editor
 * sends explicit values for the register fields (taxClass / snapEligible / ageRestricted) so the stored doc is
 * deterministic. Pure so it is unit-tested.
 */
export function mergeProductData(cur: Partial<StoreProduct> | undefined, fields: Partial<StoreProduct>, base: Record<string, any>): Record<string, any> {
  return JSON.parse(JSON.stringify({ ...(cur || {}), ...fields, ...base }));
}
