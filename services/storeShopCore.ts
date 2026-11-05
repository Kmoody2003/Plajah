// storeShopCore — PURE rules for the online store, shared by the server and the shop screens.
//
//   • Shop settings: return policy, shipping rates/countries/processing time, contact email.
//   • Shipping quotes for checkout (domestic, express, international, free-over threshold).
//   • Discount codes (percent / amount / free shipping, minimums, use limits, expiry).
//   • Online refunds: adapts a paid online order (items + tax + shipping) onto refundCore.planRefund,
//     so partial/full refunds keep refundCore's invariants (never more than was paid, no penny drift).
//   • Order emails, packing slips, the orders CSV and the sales report.
//
// Nothing here touches Firestore, Stripe or the network.

import { allocateProportional } from './taxCore';
import { planRefund, orderLinesFromDoc, refundLogOf, refundedSoFar, type OrderLine, type RefundRequestLine, type RefundResult } from './refundCore';
import type { Tender } from './tenderCore';

// ── Shop settings ─────────────────────────────────────────────────────────────────────────────

export interface ShopReturnPolicy {
  /** false = all sales final (still shown to buyers, so they know before paying). */
  accepts: boolean;
  /** Days after delivery a buyer can start a return. */
  windowDays: number;
  /** true = buyer pays return shipping; false = the shop does. */
  buyerPaysReturnShipping: boolean;
  /** Percent kept on returned items (0 = none). */
  restockingFeePct: number;
  /** Extra conditions in the shop's own words ("unworn, tags on"). */
  notes: string;
}
export interface ShopShipping {
  /** Business days to pack an order before it ships. */
  processingDaysMin: number;
  processingDaysMax: number;
  /** ISO country the shop ships from; domestic rates apply here. */
  domesticCountry: string;
  standardCents: number;
  /** Added per item after the first (0 = one flat price per order). */
  additionalItemCents: number;
  /** Free standard shipping at or above this subtotal (0 = never free). */
  freeOverCents: number;
  /** Optional faster domestic option (0 = not offered). */
  expressCents: number;
  international: boolean;
  internationalCents: number;
  internationalAdditionalCents: number;
  /** ISO country codes the shop ships to besides the domestic one. */
  countries: string[];
  /** Offer local pickup instead of shipping. */
  pickup: boolean;
  pickupNote: string;
  /** Charge sales tax on shipping (many US states require it). */
  taxShipping: boolean;
}
export interface ShopSettings {
  returns: ShopReturnPolicy;
  shipping: ShopShipping;
  /** Where buyers can reach the shop. Shown on product pages, order emails and packing slips. */
  contactEmail: string;
  /** Return address printed on shipping labels (never shown to buyers). */
  shipFrom: ShipFromAddress;
  /** The box most orders go out in; the label weight adds the items' weights to it. */
  parcel: ShopParcel;
  /** Print-on-demand: send paid orders straight to production (false = leave a draft at the printer to review). */
  printfulAutoSubmit: boolean;
  updatedAt: number;
}
export interface ShipFromAddress { name: string; street1: string; street2: string; city: string; state: string; zip: string; country: string; phone: string; email: string }
export interface ShopParcel { lengthIn: number; widthIn: number; heightIn: number; /** Box + packing material, ounces. */ packagingOz: number; /** Used when an item has no weight. */ defaultItemOz: number }

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  returns: { accepts: true, windowDays: 30, buyerPaysReturnShipping: true, restockingFeePct: 0, notes: '' },
  shipping: {
    processingDaysMin: 1, processingDaysMax: 3, domesticCountry: 'US',
    standardCents: 599, additionalItemCents: 0, freeOverCents: 5000, expressCents: 0,
    international: false, internationalCents: 1999, internationalAdditionalCents: 500, countries: [],
    pickup: false, pickupNote: '', taxShipping: false,
  },
  contactEmail: '',
  shipFrom: { name: '', street1: '', street2: '', city: '', state: '', zip: '', country: 'US', phone: '', email: '' },
  parcel: { lengthIn: 10, widthIn: 8, heightIn: 4, packagingOz: 3, defaultItemOz: 8 },
  printfulAutoSubmit: false,
  updatedAt: 0,
};

const MAX_RATE_CENTS = 50000;
const int = (v: any, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const bool = (v: any, d: boolean) => (typeof v === 'boolean' ? v : d);
const text = (v: any, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
export const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const country = (v: any) => { const c = String(v || '').trim().toUpperCase(); return /^[A-Z]{2}$/.test(c) ? c : ''; };

/** Clean any stored or submitted settings into a complete, safe ShopSettings. Unknown keys are dropped. */
export function parseShopSettings(raw: any): ShopSettings {
  let r: any = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  r = r && typeof r === 'object' ? r : {};
  const d = DEFAULT_SHOP_SETTINGS, rr = r.returns || {}, sh = r.shipping || {};
  const domestic = country(sh.domesticCountry) || d.shipping.domesticCountry;
  const min = int(sh.processingDaysMin, d.shipping.processingDaysMin, 0, 60);
  const countries = Array.isArray(sh.countries)
    ? [...new Set(sh.countries.map(country).filter((c: string) => c && c !== domestic))].slice(0, 60) as string[] : [];
  const email = text(r.contactEmail, 120);
  return {
    returns: {
      accepts: bool(rr.accepts, d.returns.accepts),
      windowDays: int(rr.windowDays, d.returns.windowDays, 1, 365),
      buyerPaysReturnShipping: bool(rr.buyerPaysReturnShipping, d.returns.buyerPaysReturnShipping),
      restockingFeePct: int(rr.restockingFeePct, 0, 0, 50),
      notes: text(rr.notes, 600),
    },
    shipping: {
      processingDaysMin: min,
      processingDaysMax: Math.max(min, int(sh.processingDaysMax, d.shipping.processingDaysMax, 0, 90)),
      domesticCountry: domestic,
      standardCents: int(sh.standardCents, d.shipping.standardCents, 0, MAX_RATE_CENTS),
      additionalItemCents: int(sh.additionalItemCents, 0, 0, MAX_RATE_CENTS),
      freeOverCents: int(sh.freeOverCents, d.shipping.freeOverCents, 0, 10_000_000),
      expressCents: int(sh.expressCents, 0, 0, MAX_RATE_CENTS),
      international: bool(sh.international, false) && countries.length > 0,
      internationalCents: int(sh.internationalCents, d.shipping.internationalCents, 0, MAX_RATE_CENTS),
      internationalAdditionalCents: int(sh.internationalAdditionalCents, d.shipping.internationalAdditionalCents, 0, MAX_RATE_CENTS),
      countries,
      pickup: bool(sh.pickup, false),
      pickupNote: text(sh.pickupNote, 300),
      taxShipping: bool(sh.taxShipping, false),
    },
    contactEmail: isEmail(email) ? email : '',
    shipFrom: (() => {
      const f = r.shipFrom || {}, fe = text(f.email, 120);
      return { name: text(f.name, 80), street1: text(f.street1, 120), street2: text(f.street2, 120), city: text(f.city, 60), state: text(f.state, 40), zip: text(f.zip, 20), country: country(f.country) || domestic, phone: text(f.phone, 30), email: isEmail(fe) ? fe : '' };
    })(),
    parcel: (() => {
      const p = r.parcel || {}, dp = d.parcel;
      return { lengthIn: int(p.lengthIn, dp.lengthIn, 1, 108), widthIn: int(p.widthIn, dp.widthIn, 1, 108), heightIn: int(p.heightIn, dp.heightIn, 1, 108), packagingOz: int(p.packagingOz, dp.packagingOz, 0, 1600), defaultItemOz: int(p.defaultItemOz, dp.defaultItemOz, 1, 1600) };
    })(),
    printfulAutoSubmit: bool(r.printfulAutoSubmit, false),
    updatedAt: int(r.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

// ── Shipping labels (the seller's own Shippo account) ─────────────────────────────────────────

/** True when the return address has what a carrier needs. */
export const shipFromReady = (f: ShipFromAddress) => !!(f.name && f.street1 && f.city && f.zip && f.country && (f.country !== 'US' || f.state));

/** Label weight: the box plus each item's weight (grams on the product), or the default when an item has none. */
export function parcelWeightOz(p: ShopParcel, items: { qty: number; weightGrams?: number }[]): number {
  const oz = items.reduce((s, i) => s + Math.max(1, Math.floor(i.qty || 1)) * (i.weightGrams && i.weightGrams > 0 ? i.weightGrams / 28.3495 : p.defaultItemOz), 0);
  return Math.max(1, Math.ceil(oz + p.packagingOz));
}

/** The Shippo shipment request (rates come back on it). */
export function shippoShipment(from: ShipFromAddress, to: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal?: string; country?: string; email?: string }, parcel: ShopParcel, weightOz: number, orderId: string) {
  return {
    address_from: { name: from.name, street1: from.street1, street2: from.street2 || undefined, city: from.city, state: from.state, zip: from.zip, country: from.country, phone: from.phone || undefined, email: from.email || undefined },
    address_to: { name: to.name || 'Customer', street1: to.line1 || '', street2: to.line2 || undefined, city: to.city || '', state: to.state || '', zip: to.postal || '', country: to.country || 'US', email: to.email || undefined },
    parcels: [{ length: String(parcel.lengthIn), width: String(parcel.widthIn), height: String(parcel.heightIn), distance_unit: 'in', weight: String(weightOz), mass_unit: 'oz' }],
    metadata: `Plajah order ${shortOrderId(orderId)}`,
    async: false,
  };
}
export interface LabelRate { id: string; carrier: string; service: string; amount: string; currency: string; days: number | null }
/** Shippo's rates, cheapest first. */
export const shippoRates = (shipment: any): LabelRate[] => (Array.isArray(shipment?.rates) ? shipment.rates : [])
  .map((r: any) => ({ id: String(r.object_id || ''), carrier: String(r.provider || ''), service: String(r.servicelevel?.name || r.servicelevel?.token || ''), amount: String(r.amount || ''), currency: String(r.currency || 'USD'), days: Number.isFinite(Number(r.estimated_days)) ? Number(r.estimated_days) : null }))
  .filter((r: LabelRate) => r.id && Number(r.amount) > 0)
  .sort((a: LabelRate, b: LabelRate) => Number(a.amount) - Number(b.amount));

// ── Print on demand (the seller's own Printful account) ──────────────────────────────────────

/** The printer's id for an ordered line: the variant's own id, else the product's. */
export function printerVariantId(product: { variants?: { id: string; externalId?: string }[]; printfulVariantId?: number; fulfillmentExternalId?: string } | null, variantId?: string | null): string {
  const v = variantId ? product?.variants?.find(x => x.id === variantId) : undefined;
  return String(v?.externalId || product?.printfulVariantId || product?.fulfillmentExternalId || '').trim();
}
/** Printful order body for the printed lines of an order. Numeric ids are sync variants; others are your external variant ids. */
export function printfulOrderBody(orderId: string, to: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal?: string; country?: string; email?: string }, lines: { printerId: string; qty: number; retailCents?: number }[]) {
  return {
    external_id: orderId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32),
    shipping: 'STANDARD',
    recipient: { name: to.name || 'Customer', address1: to.line1 || '', address2: to.line2 || undefined, city: to.city || '', state_code: to.state || undefined, country_code: to.country || 'US', zip: to.postal || '', email: to.email || undefined },
    items: lines.map(l => ({ ...(/^\d+$/.test(l.printerId) ? { sync_variant_id: Number(l.printerId) } : { external_variant_id: l.printerId }), quantity: l.qty, ...(l.retailCents ? { retail_price: (l.retailCents / 100).toFixed(2) } : {}) })),
  };
}
/** Tracking out of a Printful order (first shipment with a number). */
export function printfulTracking(order: any): { carrier: string; number: string; url: string } | null {
  const s = (Array.isArray(order?.shipments) ? order.shipments : []).find((x: any) => x?.tracking_number);
  return s ? { carrier: String(s.carrier || s.service || ''), number: String(s.tracking_number), url: String(s.tracking_url || '') } : null;
}

// ── Chargebacks ───────────────────────────────────────────────────────────────────────────────

/**
 * What a seller gives back when a buyer's bank pulls a payment: their share of the disputed amount (what was
 * transferred to them, pro rata) plus the bank's dispute fee. Capped at what they were sent.
 */
export function sellerDisputeShare(a: { disputeCents: number; chargeCents: number; applicationFeeCents: number; disputeFeeCents?: number }): number {
  const charge = Math.max(0, Math.round(a.chargeCents));
  if (!charge) return 0;
  const transferred = Math.max(0, charge - Math.max(0, Math.round(a.applicationFeeCents)));
  const share = Math.round(Math.min(charge, Math.max(0, a.disputeCents)) * transferred / charge);
  return Math.min(transferred, share + Math.max(0, Math.round(a.disputeFeeCents || 0)));
}

const money = (c: number) => `$${(Math.max(0, Math.round(c)) / 100).toFixed(2)}`;
const days = (a: number, b: number) => (a === b ? `${a} business day${a === 1 ? '' : 's'}` : `${a}–${b} business days`);

/** The return policy as buyers read it. */
export function returnPolicyText(r: ShopReturnPolicy): string {
  if (!r.accepts) return `All sales are final. This shop doesn't accept returns.${r.notes ? ` ${r.notes}` : ''}`;
  const parts = [
    `Returns accepted within ${r.windowDays} day${r.windowDays === 1 ? '' : 's'} of delivery.`,
    r.buyerPaysReturnShipping ? 'The buyer pays return shipping.' : 'The shop pays return shipping.',
  ];
  if (r.restockingFeePct > 0) parts.push(`A ${r.restockingFeePct}% restocking fee applies.`);
  parts.push('Refunds go back to the original payment.');
  if (r.notes) parts.push(r.notes);
  return parts.join(' ');
}

/** The shipping policy as buyers read it. */
export function shippingPolicyText(s: ShopShipping): string {
  const parts = [`Ships in ${days(s.processingDaysMin, s.processingDaysMax)}.`];
  const per = s.additionalItemCents ? `, plus ${money(s.additionalItemCents)} for each extra item` : '';
  parts.push(s.standardCents === 0 ? `Free standard shipping in ${s.domesticCountry}.` : `Standard shipping in ${s.domesticCountry}: ${money(s.standardCents)}${per}.`);
  if (s.freeOverCents > 0 && s.standardCents > 0) parts.push(`Free standard shipping on orders of ${money(s.freeOverCents)} or more.`);
  if (s.expressCents > 0) parts.push(`Express shipping: ${money(s.expressCents)}.`);
  if (s.international && s.countries.length) parts.push(`Also ships to ${s.countries.join(', ')} from ${money(s.internationalCents)}. Import duties and taxes may be charged by the buyer's country.`);
  else parts.push(`Ships within ${s.domesticCountry} only.`);
  if (s.pickup) parts.push(`Local pickup available${s.pickupNote ? `: ${s.pickupNote}` : '.'}`);
  return parts.join(' ');
}

// ── Shipping quotes ───────────────────────────────────────────────────────────────────────────

export interface ShipOption { id: 'standard' | 'express' | 'international'; label: string; amountCents: number }
export type ShipQuote = { ok: true; country: string; options: ShipOption[] } | { ok: false; error: string; code: 'NO_SHIP_COUNTRY' };

/**
 * What a buyer pays to ship `itemCount` physical items to `toCountry`, given the merchandise subtotal after discounts.
 * Stripe Checkout can't change the rate once the address is typed, so the buyer picks the country first and the
 * session only accepts addresses there.
 */
export function quoteShipping(s: ShopShipping, a: { itemCount: number; subtotalCents: number; toCountry?: string; freeShipping?: boolean }): ShipQuote {
  const n = Math.max(1, Math.floor(a.itemCount || 1));
  const to = country(a.toCountry) || s.domesticCountry;
  if (to === s.domesticCountry) {
    const free = a.freeShipping || (s.freeOverCents > 0 && a.subtotalCents >= s.freeOverCents);
    const std = free ? 0 : s.standardCents + s.additionalItemCents * (n - 1);
    const options: ShipOption[] = [{ id: 'standard', label: std ? 'Standard shipping' : 'Free shipping', amountCents: std }];
    if (s.expressCents > 0) options.push({ id: 'express', label: 'Express shipping', amountCents: s.expressCents + s.additionalItemCents * (n - 1) });
    return { ok: true, country: to, options };
  }
  if (!s.international || !s.countries.includes(to)) return { ok: false, error: `This shop doesn't ship to ${to} yet.`, code: 'NO_SHIP_COUNTRY' };
  const amt = a.freeShipping ? 0 : s.internationalCents + s.internationalAdditionalCents * (n - 1);
  return { ok: true, country: to, options: [{ id: 'international', label: amt ? 'International shipping' : 'Free shipping', amountCents: amt }] };
}

// ── Discount codes ────────────────────────────────────────────────────────────────────────────

export interface ShopCode {
  code: string;
  kind: 'PCT' | 'AMOUNT' | 'FREE_SHIP';
  /** PCT: 1–100. AMOUNT: cents off. FREE_SHIP: ignored. */
  value: number;
  minSubtotalCents: number;
  /** 0 = unlimited. */
  maxUses: number;
  uses: number;
  /** ms epoch, 0 = never. */
  expiresAt: number;
  active: boolean;
  createdAt: number;
}

export const normalizeCode = (s: any) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);

/** Validate a code the seller is creating. */
export function parseShopCode(raw: any, now = Date.now()): { ok: true; code: ShopCode } | { ok: false; error: string } {
  const code = normalizeCode(raw?.code);
  if (code.length < 3) return { ok: false, error: 'Codes need at least 3 letters or numbers.' };
  const kind = raw?.kind === 'AMOUNT' ? 'AMOUNT' : raw?.kind === 'FREE_SHIP' ? 'FREE_SHIP' : 'PCT';
  const value = kind === 'PCT' ? int(raw?.value, 0, 0, 100) : kind === 'AMOUNT' ? int(raw?.value, 0, 0, 1_000_000) : 0;
  if (kind !== 'FREE_SHIP' && value <= 0) return { ok: false, error: kind === 'PCT' ? 'Enter a percent from 1 to 100.' : 'Enter an amount off.' };
  const expiresAt = int(raw?.expiresAt, 0, 0, Number.MAX_SAFE_INTEGER);
  if (expiresAt && expiresAt <= now) return { ok: false, error: 'The end date is already past.' };
  return { ok: true, code: { code, kind, value, minSubtotalCents: int(raw?.minSubtotalCents, 0, 0, 10_000_000), maxUses: int(raw?.maxUses, 0, 0, 1_000_000), uses: 0, expiresAt, active: raw?.active !== false, createdAt: now } };
}

/** Whether a stored code applies to this cart, and what it takes off the merchandise. */
export function applyShopCode(c: Partial<ShopCode> | null | undefined, subtotalCents: number, now = Date.now()):
  { ok: true; discountCents: number; freeShipping: boolean; code: string } | { ok: false; error: string } {
  if (!c || !c.code) return { ok: false, error: 'That code isn’t valid for this shop.' };
  if (c.active === false) return { ok: false, error: 'That code is no longer active.' };
  if (c.expiresAt && c.expiresAt <= now) return { ok: false, error: 'That code has expired.' };
  if (c.maxUses && (c.uses || 0) >= c.maxUses) return { ok: false, error: 'That code has been used up.' };
  if (c.minSubtotalCents && subtotalCents < c.minSubtotalCents) return { ok: false, error: `That code needs an order of ${money(c.minSubtotalCents)} or more.` };
  const sub = Math.max(0, Math.round(subtotalCents));
  const discountCents = c.kind === 'PCT' ? Math.round(sub * Math.min(100, Number(c.value) || 0) / 100)
    : c.kind === 'AMOUNT' ? Math.min(sub, Math.round(Number(c.value) || 0)) : 0;
  return { ok: true, discountCents, freeShipping: c.kind === 'FREE_SHIP', code: String(c.code) };
}

// ── Online refunds ────────────────────────────────────────────────────────────────────────────

export const ONLINE_SHIPPED = new Set(['OUT_FOR_DELIVERY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'PICKED_UP']);
export const ONLINE_CANCELLABLE = new Set(['CONFIRMED', 'PREPARING', 'READY']);

/**
 * The order as refundCore sees it: one line per item with its own tax, plus a "Shipping" line (with its tax)
 * when shipping was charged, and a single card tender for what the buyer actually paid.
 * Orders from before per-line tax was stored get the order's tax spread over the items.
 */
export function onlineRefundOrder(o: any): { lines: OrderLine[]; tenders: Tender[]; shippingIndex: number } {
  const lines = orderLinesFromDoc(o);
  const orderTax = Math.max(0, Math.round(Number(o?.taxCents) || 0));
  const shipTax = Math.max(0, Math.round(Number(o?.shippingTaxCents) || 0));
  const lineTax = lines.reduce((s, l) => s + l.taxCents, 0);
  if (orderTax > 0 && lineTax === 0 && !o?.taxInclusive) {
    const share = allocateProportional(orderTax - shipTax, lines.map(l => l.chargeCents));
    lines.forEach((l, i) => { l.taxCents = share[i]; l.chargeCents += share[i]; });
  }
  const shipping = Math.max(0, Math.round(Number(o?.shippingCents) || 0));
  let shippingIndex = -1;
  if (shipping > 0) {
    shippingIndex = lines.length;
    lines.push({ productId: '', variantId: null, title: 'Shipping', qty: 1, chargeCents: shipping + shipTax, taxCents: shipTax });
  }
  const paid = Math.max(0, Math.round(Number(o?.totalCents) || 0));
  return { lines, tenders: paid > 0 ? [{ type: 'CARD', amountCents: paid } as Tender] : [], shippingIndex };
}

/** Plan a refund of chosen lines (the shipping line is `shippingIndex`). */
export function planOnlineRefund(o: any, lines: RefundRequestLine[]): RefundResult {
  const ord = onlineRefundOrder(o);
  return planRefund({ lines: ord.lines, tenders: ord.tenders }, refundLogOf(o), { lines, method: 'ORIGINAL' });
}

/** Every line (and shipping) that hasn't been refunded yet: the request for a full refund or a cancel. */
export function remainingRefundLines(o: any, restock = true): RefundRequestLine[] {
  const ord = onlineRefundOrder(o);
  const done = refundedSoFar(ord.lines, refundLogOf(o));
  return ord.lines.map((l, i) => ({ index: i, qty: l.qty - done.qty[i], restock: restock && i !== ord.shippingIndex }))
    .filter(r => r.qty > 0);
}

/** What the buyer paid that hasn't come back to them yet. */
export const refundableCents = (o: any) => Math.max(0, Math.round(Number(o?.totalCents) || 0) - Math.round(Number(o?.refundedCents) || 0));

/**
 * A refund made outside Plajah (Stripe dashboard) shows up only as the charge's new refunded total. Returns the
 * log entry that brings the order up to that total, or null if Plajah already recorded it.
 */
export function externalRefundEntry(o: any, chargeRefundedCents: number, id: string, at: number) {
  const recorded = Math.round(Number(o?.refundedCents) || 0);
  const diff = Math.round(chargeRefundedCents) - recorded;
  if (diff <= 0) return null;
  return { id, lines: [], allocations: [{ type: 'CARD', amountCents: diff, tenderIndex: 0 }], amountCents: diff, taxCents: 0, at, external: true };
}

// ── Order emails ──────────────────────────────────────────────────────────────────────────────

export type OrderEmailKind = 'CONFIRMED' | 'NEW_ORDER' | 'SHIPPED' | 'REFUNDED' | 'CANCELLED' | 'DISPUTE';
export interface OrderEmailData {
  shopName: string;
  orderId: string;
  lines: { title: string; qty: number; variantName?: string | null; amountCents?: number }[];
  subtotalCents?: number;
  discountCents?: number;
  shippingCents?: number;
  taxCents?: number;
  totalCents?: number;
  refundCents?: number;
  ship?: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal?: string; country?: string } | null;
  tracking?: { carrier?: string; number?: string; url?: string | null } | null;
  /** Where the buyer (or seller) can open this order. */
  orderUrl?: string;
  downloads?: { title: string; url: string }[];
  returnPolicy?: string;
  contactEmail?: string;
  customerName?: string;
  processing?: string;
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const shortOrderId = (id: string) => String(id || '').replace(/^so_\d+_/, '').toUpperCase().slice(0, 10) || String(id);
const addrLines = (a: OrderEmailData['ship']) => (a && a.line1 ? [a.name, a.line1, a.line2, [a.city, a.state, a.postal].filter(Boolean).join(', '), a.country].filter(Boolean) as string[] : []);

/** Subject, plain text and HTML for one order email. */
export function orderEmail(kind: OrderEmailKind, d: OrderEmailData): { subject: string; text: string; html: string } {
  const no = shortOrderId(d.orderId);
  const shop = d.shopName || 'the shop';
  const head: Record<OrderEmailKind, [string, string]> = {
    CONFIRMED: [`Your order from ${shop} (#${no})`, `Thanks for your order! ${shop} has it and will get it ready${d.processing ? ` (${d.processing})` : ''}.`],
    NEW_ORDER: [`New order #${no}${d.totalCents ? ` · ${money(d.totalCents)}` : ''}`, `You have a new paid order${d.customerName ? ` from ${d.customerName}` : ''}. Open your Orders tab to pack it.`],
    SHIPPED: [`Your ${shop} order has shipped (#${no})`, `Good news: your order is on its way.`],
    REFUNDED: [`Refund from ${shop} (#${no})`, `${shop} refunded ${money(d.refundCents || 0)} to your original payment. It can take 5–10 business days to show on your statement.`],
    CANCELLED: [`Your ${shop} order was cancelled (#${no})`, `${shop} cancelled this order and refunded ${money(d.refundCents || 0)} to your original payment. It can take 5–10 business days to show on your statement.`],
    DISPUTE: [`A buyer disputed order #${no}`, `The buyer's bank opened a dispute (chargeback) on this order. Gather proof of delivery, tracking and any messages with the buyer, then reply to Plajah support with them before the deadline.`],
  };
  const [subject, intro] = head[kind];
  const items = d.lines.map(l => `${l.qty} × ${l.title}${l.variantName ? ` (${l.variantName})` : ''}${typeof l.amountCents === 'number' ? ` — ${money(l.amountCents)}` : ''}`);
  const totals: [string, number | undefined][] = kind === 'REFUNDED' || kind === 'CANCELLED' ? [['Refunded', d.refundCents]]
    : [['Subtotal', d.subtotalCents], ['Discount', d.discountCents ? -d.discountCents : undefined], ['Shipping', d.shippingCents], ['Tax', d.taxCents], ['Total', d.totalCents]];
  const shownTotals = totals.filter(([, v]) => typeof v === 'number' && (v !== 0 || ['Total', 'Shipping'].includes(String(v))));
  const fmtT = (v: number) => (v < 0 ? `-${money(-v)}` : money(v));
  const addr = addrLines(d.ship);
  const trackLine = d.tracking?.number ? `${d.tracking.carrier ? `${d.tracking.carrier} ` : ''}${d.tracking.number}` : '';
  const showPolicy = kind === 'CONFIRMED' && d.returnPolicy;

  const txt = [
    intro, '', `Order #${no}`, ...items,
    ...(shownTotals.length ? ['', ...shownTotals.map(([k, v]) => `${k}: ${fmtT(v as number)}`)] : []),
    ...(trackLine ? ['', `Tracking: ${trackLine}${d.tracking?.url ? ` — ${d.tracking.url}` : ''}`] : []),
    ...(addr.length && kind !== 'REFUNDED' ? ['', kind === 'NEW_ORDER' ? 'Ship to:' : 'Shipping to:', ...addr] : []),
    ...(d.downloads?.length ? ['', 'Your downloads:', ...d.downloads.map(x => `${x.title}: ${x.url}`)] : []),
    ...(d.orderUrl ? ['', `View your order: ${d.orderUrl}`] : []),
    ...(showPolicy ? ['', `Returns: ${d.returnPolicy}`] : []),
    ...(d.contactEmail && kind !== 'NEW_ORDER' && kind !== 'DISPUTE' ? ['', `Questions? Email ${shop} at ${d.contactEmail}.`] : []),
  ].join('\n');

  const row = (k: string, v: string, b = false) => `<tr><td style="padding:3px 0;${b ? 'font-weight:700' : ''}">${esc(k)}</td><td style="padding:3px 0;text-align:right;${b ? 'font-weight:700' : ''}">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f">
<div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:16px;padding:24px">
<p style="margin:0 0 4px;font-size:13px;color:#86868b">${esc(shop)}</p>
<h1 style="margin:0 0 12px;font-size:20px">${esc(subject.replace(/\s*\(#.*\)$/, ''))}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${esc(intro)}</p>
<p style="margin:0 0 6px;font-size:13px;color:#86868b">Order #${esc(no)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${d.lines.map(l => row(`${l.qty} × ${l.title}${l.variantName ? ` (${l.variantName})` : ''}`, typeof l.amountCents === 'number' ? money(l.amountCents) : '')).join('')}</table>
${shownTotals.length ? `<hr style="border:0;border-top:1px solid #e5e5ea;margin:12px 0"><table style="width:100%;border-collapse:collapse;font-size:14px">${shownTotals.map(([k, v]) => row(k, fmtT(v as number), k === 'Total' || k === 'Refunded')).join('')}</table>` : ''}
${trackLine ? `<p style="margin:16px 0 0;font-size:14px"><b>Tracking:</b> ${esc(trackLine)}${d.tracking?.url ? ` · <a href="${esc(d.tracking.url)}">Track package</a>` : ''}</p>` : ''}
${addr.length && kind !== 'REFUNDED' ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5"><b>${kind === 'NEW_ORDER' ? 'Ship to' : 'Shipping to'}</b><br>${addr.map(esc).join('<br>')}</p>` : ''}
${d.downloads?.length ? `<p style="margin:16px 0 0;font-size:14px"><b>Your downloads</b><br>${d.downloads.map(x => `<a href="${esc(x.url)}">${esc(x.title)}</a>`).join('<br>')}</p>` : ''}
${d.orderUrl ? `<p style="margin:20px 0 0"><a href="${esc(d.orderUrl)}" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:600">View order</a></p>` : ''}
${showPolicy ? `<p style="margin:20px 0 0;font-size:12px;color:#86868b;line-height:1.5"><b>Returns:</b> ${esc(d.returnPolicy)}</p>` : ''}
${d.contactEmail && kind !== 'NEW_ORDER' && kind !== 'DISPUTE' ? `<p style="margin:12px 0 0;font-size:12px;color:#86868b">Questions? Email <a href="mailto:${esc(d.contactEmail)}">${esc(d.contactEmail)}</a>.</p>` : ''}
</div><p style="text-align:center;font-size:11px;color:#86868b;margin:12px 0 0">Sold on Plajah</p></div></body></html>`;
  return { subject, text: txt, html };
}

// ── Packing slip ──────────────────────────────────────────────────────────────────────────────

export interface SlipOrder {
  id: string; createdAt: number; customerName?: string; note?: string;
  items: { title: string; qty: number; variantName?: string | null; sku?: string }[];
  ship?: OrderEmailData['ship'];
}
/** A printable packing slip (no prices, like most shops send in the box). */
export function packingSlipHtml(o: SlipOrder, shop: { name: string; contactEmail?: string; returnPolicy?: string }): string {
  const addr = addrLines(o.ship);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip #${esc(shortOrderId(o.id))}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px 4px;font-size:14px}th{font-size:12px;text-transform:uppercase;color:#555}.m{color:#555;font-size:13px}.box{display:flex;justify-content:space-between;gap:24px;margin-top:20px}.chk{width:18px;height:18px;border:1.5px solid #333;display:inline-block}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:8px 14px">Print</button>
<h1>${esc(shop.name)}</h1><div class="m">Packing slip · Order #${esc(shortOrderId(o.id))} · ${esc(new Date(o.createdAt || Date.now()).toLocaleDateString('en-US'))}</div>
<div class="box"><div><b>Ship to</b><br>${addr.length ? addr.map(esc).join('<br>') : esc(o.customerName || 'Pickup')}</div>${shop.contactEmail ? `<div class="m" style="text-align:right">Questions?<br>${esc(shop.contactEmail)}</div>` : ''}</div>
<table><thead><tr><th style="width:28px"></th><th>Item</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>
${o.items.map(i => `<tr><td><span class="chk"></span></td><td>${esc(i.title)}${i.variantName ? ` <span class="m">(${esc(i.variantName)})</span>` : ''}</td><td class="m">${esc(i.sku || '')}</td><td style="text-align:right">${esc(i.qty)}</td></tr>`).join('')}
</tbody></table>
${o.note ? `<p><b>Buyer note:</b> ${esc(o.note)}</p>` : ''}
${shop.returnPolicy ? `<p class="m" style="margin-top:24px"><b>Returns:</b> ${esc(shop.returnPolicy)}</p>` : ''}
<p class="m" style="margin-top:24px">Thank you for your order!</p></body></html>`;
}

// ── Orders CSV + sales report ─────────────────────────────────────────────────────────────────

export interface ReportOrder {
  id: string; status: string; createdAt: number; paidAt?: number; source?: string;
  customerName?: string; customerEmail?: string; fulfillment?: string;
  items: { productId?: string; title: string; qty: number; unitAmount?: number; variantName?: string | null; chargeCents?: number }[];
  subtotalCents: number; discountCents?: number; shippingCents?: number; taxCents?: number; totalCents?: number; refundedCents?: number;
  discountCode?: string;
  ship?: { name?: string; line1?: string; line2?: string; city?: string; state?: string; postal?: string; country?: string };
  trackingCarrier?: string; trackingNumber?: string;
}
export const isPaidOrder = (o: { status: string }) => o.status !== 'PENDING_PAYMENT' && o.status !== 'EXPIRED';

/** One CSV cell; formula-looking values get a leading apostrophe so spreadsheets don't run them. */
export const csvCell = (v: any) => {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dollars = (c?: number) => ((Math.round(Number(c) || 0)) / 100).toFixed(2);

export function ordersCsv(orders: ReportOrder[]): string {
  const head = ['Date', 'Order', 'Status', 'Channel', 'Customer', 'Email', 'Items', 'Units', 'Subtotal', 'Discount', 'Code', 'Shipping', 'Tax', 'Total', 'Refunded', 'Net', 'Ship name', 'Address', 'City', 'State', 'Postal', 'Country', 'Carrier', 'Tracking'];
  const rows = orders.filter(isPaidOrder).map(o => {
    const total = o.totalCents ?? o.subtotalCents;
    return [
      new Date(o.paidAt || o.createdAt).toISOString().slice(0, 10), o.id, o.status, o.source === 'POS' ? 'In store' : 'Online',
      o.customerName || '', o.customerEmail || '',
      o.items.map(i => `${i.qty}x ${i.title}${i.variantName ? ` (${i.variantName})` : ''}`).join('; '),
      o.items.reduce((s, i) => s + (Number(i.qty) || 0), 0),
      dollars(o.subtotalCents), dollars(o.discountCents), o.discountCode || '', dollars(o.shippingCents), dollars(o.taxCents), dollars(total), dollars(o.refundedCents), dollars(total - (o.refundedCents || 0)),
      o.ship?.name || '', [o.ship?.line1, o.ship?.line2].filter(Boolean).join(' '), o.ship?.city || '', o.ship?.state || '', o.ship?.postal || '', o.ship?.country || '',
      o.trackingCarrier || '', o.trackingNumber || '',
    ].map(csvCell).join(',');
  });
  return [head.join(','), ...rows].join('\r\n');
}

export interface SalesReport {
  orders: number; units: number;
  grossCents: number; refundsCents: number; netCents: number;
  merchandiseCents: number; discountCents: number; shippingCents: number; taxCents: number;
  averageOrderCents: number;
  byProduct: { key: string; title: string; units: number; cents: number }[];
  byDay: { day: string; cents: number; orders: number }[];
}

/** Totals for paid orders placed in [from, to]. Tax collected is shown so the seller can file it. */
export function salesReport(orders: ReportOrder[], from: number, to: number): SalesReport {
  const inRange = orders.filter(o => isPaidOrder(o) && (o.paidAt || o.createdAt) >= from && (o.paidAt || o.createdAt) <= to);
  const prod = new Map<string, { key: string; title: string; units: number; cents: number }>();
  const day = new Map<string, { day: string; cents: number; orders: number }>();
  let units = 0, gross = 0, refunds = 0, merch = 0, disc = 0, ship = 0, tax = 0;
  for (const o of inRange) {
    const total = o.totalCents ?? o.subtotalCents;
    gross += total; refunds += o.refundedCents || 0; merch += o.subtotalCents || 0; disc += o.discountCents || 0; ship += o.shippingCents || 0; tax += o.taxCents || 0;
    for (const i of o.items) {
      const q = Number(i.qty) || 0; units += q;
      const key = `${i.productId || i.title}`;
      const p = prod.get(key) || { key, title: i.title, units: 0, cents: 0 };
      p.units += q; p.cents += i.chargeCents !== undefined ? Number(i.chargeCents) || 0 : (Number(i.unitAmount) || 0) * q;
      prod.set(key, p);
    }
    const d = new Date(o.paidAt || o.createdAt).toISOString().slice(0, 10);
    const dd = day.get(d) || { day: d, cents: 0, orders: 0 };
    dd.cents += total; dd.orders += 1; day.set(d, dd);
  }
  return {
    orders: inRange.length, units, grossCents: gross, refundsCents: refunds, netCents: gross - refunds,
    merchandiseCents: merch, discountCents: disc, shippingCents: ship, taxCents: tax,
    averageOrderCents: inRange.length ? Math.round(gross / inRange.length) : 0,
    byProduct: [...prod.values()].sort((a, b) => b.cents - a.cents),
    byDay: [...day.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// ── Size charts ───────────────────────────────────────────────────────────────────────────────

export interface SizeChart { unit: 'in' | 'cm'; columns: string[]; rows: { size: string; values: string[] }[]; note?: string }
/** Clean a seller's size chart: up to 8 measurements × 15 sizes. Empty → null. */
export function parseSizeChart(raw: any): SizeChart | null {
  if (!raw || typeof raw !== 'object') return null;
  const columns = (Array.isArray(raw.columns) ? raw.columns : []).map((c: any) => text(c, 24)).filter(Boolean).slice(0, 8);
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((r: any) => ({ size: text(r?.size, 16), values: columns.map((_: string, i: number) => text(r?.values?.[i], 16)) }))
    .filter((r: { size: string }) => r.size).slice(0, 15);
  if (!columns.length || !rows.length) return null;
  return { unit: raw.unit === 'cm' ? 'cm' : 'in', columns, rows, ...(text(raw.note, 200) ? { note: text(raw.note, 200) } : {}) };
}
