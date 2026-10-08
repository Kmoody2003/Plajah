// drawerCore - PURE cash-drawer + end-of-day math, and the sales-report aggregations. Shared by the
// server (authoritative close) and the dashboard (live Z-report / Sales tab). Integer cents throughout.
//
//   expected cash = starting float + cash sales (net of change) - cash refunds + paid-ins - paid-outs - drops
//   variance      = counted - expected   (negative = short, positive = over)

import { parseTenders, tenderKey, tenderLabel, isStoredValueTender, type Tender } from './tenderCore';

export type MovementType = 'PAID_IN' | 'PAID_OUT' | 'DROP';
export interface DrawerMovement { type: MovementType; amountCents: number; note?: string; at: number; by?: string }
export const MOVEMENT_LABEL: Record<MovementType, string> = { PAID_IN: 'Cash in', PAID_OUT: 'Paid out', DROP: 'Safe drop' };
export const movementSign = (t: MovementType): 1 | -1 => (t === 'PAID_IN' ? 1 : -1);

/** Order/refund as the math sees them (use normalizeOrder / normalizeRefund on raw Firestore docs). */
export interface ZOrder {
  id: string; createdAt: number; staffId?: string; staffName?: string; tenders: Tender[];
  subtotalCents: number; discountCents: number; taxCents: number; tipCents: number; totalCents: number;
  /** Gift cards sold + wallet reloads on this ticket: a LIABILITY, paid for by the tenders but not revenue, not taxed, not in items. */
  storedValueSoldCents?: number;
  items: { productId: string; title: string; qty: number; chargeCents: number; taxCents: number; netCents?: number }[];
}
export interface ZRefund {
  id: string; createdAt: number; staffId?: string; staffName?: string; amountCents: number; taxCents: number;
  allocations: { type: string; kind?: string; amountCents: number }[];
}

const parseJson = (v: any, fallback: any) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; } };
const n = (v: any) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

export function normalizeOrder(d: any): ZOrder {
  const items = parseJson(d?.items, []) as any[];
  const total = n(d?.totalCents);
  const tip = n(d?.tipCents);
  return {
    id: String(d?.id || ''), createdAt: n(d?.createdAt), staffId: d?.staffId, staffName: d?.staffName,
    tenders: parseTenders(d?.tenders, d?.tender, total + tip),
    subtotalCents: n(d?.subtotalCents), discountCents: n(d?.discountCents ?? (n(d?.offerDiscountCents) + n(d?.redeemCents))),
    taxCents: n(d?.taxCents), tipCents: tip, totalCents: total, storedValueSoldCents: Math.max(0, n(d?.storedValueSoldCents)),
    items: (Array.isArray(items) ? items : []).map(i => ({
      productId: String(i.productId || ''), title: String(i.title || ''), qty: n(i.qty),
      chargeCents: i.chargeCents !== undefined ? n(i.chargeCents) : n(i.unitAmount) * n(i.qty), taxCents: n(i.taxCents), netCents: i.netCents !== undefined ? n(i.netCents) : undefined,
    })),
  };
}
export function normalizeRefund(d: any): ZRefund {
  return {
    id: String(d?.id || ''), createdAt: n(d?.createdAt), staffId: d?.staffId, staffName: d?.staffName,
    amountCents: n(d?.amountCents), taxCents: n(d?.taxCents),
    allocations: (parseJson(d?.allocations, []) as any[]).map(a => ({ type: String(a.type), kind: a.kind, amountCents: n(a.amountCents) })),
  };
}

/** Cash that actually stayed in the drawer from a sale: cash amounts are stored net of change already. */
export const orderCash = (o: ZOrder): number => o.tenders.filter(t => t.type === 'CASH').reduce((s, t) => s + t.amountCents, 0);
export const refundCash = (r: ZRefund): number => r.allocations.filter(a => a.type === 'CASH').reduce((s, a) => s + a.amountCents, 0);

export function expectedCash(startFloatCents: number, orders: ZOrder[], refunds: ZRefund[], movements: DrawerMovement[]): number {
  const sales = orders.reduce((s, o) => s + orderCash(o), 0);
  const ref = refunds.reduce((s, r) => s + refundCash(r), 0);
  const mv = movements.reduce((s, m) => s + movementSign(m.type) * m.amountCents, 0);
  return Math.round(startFloatCents) + sales - ref + mv;
}
export const cashVariance = (countedCents: number, expectedCents: number): number => Math.round(countedCents) - Math.round(expectedCents);
export function varianceLabel(v: number): string {
  return v === 0 ? 'Balanced' : v < 0 ? `Short $${(-v / 100).toFixed(2)}` : `Over $${(v / 100).toFixed(2)}`;
}

export function sanitizeMovement(raw: any, now: number, by?: string): { ok: true; m: DrawerMovement } | { ok: false; error: string } {
  const type = String(raw?.type || '').toUpperCase() as MovementType;
  if (!['PAID_IN', 'PAID_OUT', 'DROP'].includes(type)) return { ok: false, error: 'Pick cash in, paid out or safe drop.' };
  const amountCents = n(raw?.amountCents);
  if (!(amountCents > 0) || amountCents > 100_000_000) return { ok: false, error: 'Enter an amount above $0.' };
  return { ok: true, m: { type, amountCents, note: String(raw?.note || '').slice(0, 120), at: now, ...(by ? { by } : {}) } };
}

// ── Z report ────────────────────────────────────────────────────────────────────
export interface ZReport {
  from: number; to: number; saleCount: number; refundCount: number;
  grossSalesCents: number; discountsCents: number; refundsNetCents: number; netSalesCents: number;
  taxCollectedCents: number; tipsCents: number;
  /** Stored value: sold (liability up, not revenue), redeemed as a tender (liability down), and store credit issued by refunds. */
  storedValue: { soldCents: number; redeemedCents: number; creditIssuedCents: number };
  byTender: { key: string; label: string; salesCents: number; refundsCents: number; netCents: number }[];
  byStaff: { staffId: string; name: string; sales: number; salesCents: number; refunds: number; refundsCents: number }[];
  topItems: { productId: string; title: string; qty: number; revenueCents: number }[];
  cash: { startFloatCents: number; salesCents: number; refundsCents: number; inCents: number; outCents: number; dropsCents: number; expectedCents: number; countedCents?: number; varianceCents?: number };
}

export function buildZReport(orders: ZOrder[], refunds: ZRefund[], movements: DrawerMovement[], startFloatCents: number, range: { from: number; to: number }, countedCents?: number): ZReport {
  const inR = (t: number) => t >= range.from && t <= range.to;
  const os = orders.filter(o => inR(o.createdAt)), rs = refunds.filter(r => inR(r.createdAt));
  const gross = os.reduce((s, o) => s + o.subtotalCents, 0);
  const disc = os.reduce((s, o) => s + o.discountCents, 0);
  const refAmt = rs.reduce((s, r) => s + r.amountCents, 0), refTax = rs.reduce((s, r) => s + r.taxCents, 0);
  const tax = os.reduce((s, o) => s + o.taxCents, 0) - refTax;
  const tips = os.reduce((s, o) => s + o.tipCents, 0);

  const tmap = new Map<string, { key: string; label: string; salesCents: number; refundsCents: number }>();
  for (const o of os) for (const t of o.tenders) {
    const k = tenderKey(t), cur = tmap.get(k) || { key: k, label: tenderLabel(t), salesCents: 0, refundsCents: 0 };
    cur.salesCents += t.amountCents; tmap.set(k, cur);
  }
  for (const r of rs) for (const a of r.allocations) {
    const k = a.type === 'EXTERNAL' ? (a.kind || 'OTHER') : a.type;
    const cur = tmap.get(k) || { key: k, label: tenderLabel({ type: a.type as any, kind: a.kind as any }), salesCents: 0, refundsCents: 0 };
    cur.refundsCents += a.amountCents; tmap.set(k, cur);
  }
  const smap = new Map<string, ZReport['byStaff'][number]>();
  const staff = (id?: string, name?: string) => { const k = id || 'unknown'; if (!smap.has(k)) smap.set(k, { staffId: k, name: name || 'Unknown', sales: 0, salesCents: 0, refunds: 0, refundsCents: 0 }); return smap.get(k)!; };
  for (const o of os) { const s = staff(o.staffId, o.staffName); s.sales++; s.salesCents += o.totalCents; }
  for (const r of rs) { const s = staff(r.staffId, r.staffName); s.refunds++; s.refundsCents += r.amountCents; }
  const imap = new Map<string, ZReport['topItems'][number]>();
  for (const o of os) for (const i of o.items) {
    const cur = imap.get(i.productId || i.title) || { productId: i.productId, title: i.title, qty: 0, revenueCents: 0 };
    cur.qty += i.qty; cur.revenueCents += i.chargeCents - i.taxCents; imap.set(i.productId || i.title, cur);
  }
  const cashSales = os.reduce((s, o) => s + orderCash(o), 0), cashRef = rs.reduce((s, r) => s + refundCash(r), 0);
  const sum = (t: MovementType) => movements.filter(m => m.type === t).reduce((s, m) => s + m.amountCents, 0);
  const expected = expectedCash(startFloatCents, os, rs, movements);
  return {
    from: range.from, to: range.to, saleCount: os.length, refundCount: rs.length,
    grossSalesCents: gross, discountsCents: disc, refundsNetCents: refAmt - refTax, netSalesCents: gross - disc - (refAmt - refTax),
    taxCollectedCents: tax, tipsCents: tips,
    storedValue: {
      soldCents: os.reduce((a, o) => a + (o.storedValueSoldCents || 0), 0),
      redeemedCents: os.reduce((a, o) => a + o.tenders.filter(t => isStoredValueTender(t)).reduce((x, t) => x + t.amountCents, 0), 0),
      creditIssuedCents: rs.reduce((a, r) => a + r.allocations.filter(x => x.type === 'STORE_CREDIT').reduce((x, y) => x + y.amountCents, 0), 0),
    },
    byTender: [...tmap.values()].map(t => ({ ...t, netCents: t.salesCents - t.refundsCents })).sort((a, b) => b.salesCents - a.salesCents),
    byStaff: [...smap.values()].sort((a, b) => b.salesCents - a.salesCents),
    topItems: [...imap.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10),
    cash: { startFloatCents, salesCents: cashSales, refundsCents: cashRef, inCents: sum('PAID_IN'), outCents: sum('PAID_OUT'), dropsCents: sum('DROP'), expectedCents: expected,
      ...(countedCents !== undefined ? { countedCents, varianceCents: cashVariance(countedCents, expected) } : {}) },
  };
}

// ── Sales report (today / 7d / 30d) ─────────────────────────────────────────────
export type ReportRange = 'TODAY' | '7D' | '30D';
export function rangeBounds(r: ReportRange, now = Date.now()): { from: number; to: number } {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return { from: r === 'TODAY' ? start : start - (r === '7D' ? 6 : 29) * 86_400_000, to: now };
}

export interface SalesReport {
  netSalesCents: number; orderCount: number; avgTicketCents: number; refundsCents: number;
  byItem: { productId: string; title: string; qty: number; revenueCents: number; costCents: number; marginCents: number | null }[];
  byStaff: ZReport['byStaff'];
  byDay: { day: string; salesCents: number }[];
  marginCents: number | null;   // only over items with a known cost
}

/** `costCentsById` = costPrice * 100 per unit for products that have one. */
export function buildSalesReport(orders: ZOrder[], refunds: ZRefund[], range: { from: number; to: number }, costCentsById: Record<string, number> = {}): SalesReport {
  const z = buildZReport(orders, refunds, [], 0, range);
  const os = orders.filter(o => o.createdAt >= range.from && o.createdAt <= range.to);
  const imap = new Map<string, SalesReport['byItem'][number]>();
  let margin = 0, anyCost = false;
  for (const o of os) for (const i of o.items) {
    const k = i.productId || i.title;
    const cur = imap.get(k) || { productId: i.productId, title: i.title, qty: 0, revenueCents: 0, costCents: 0, marginCents: null };
    const rev = i.chargeCents - i.taxCents;
    cur.qty += i.qty; cur.revenueCents += rev;
    const unitCost = costCentsById[i.productId];
    if (unitCost !== undefined) { cur.costCents += unitCost * i.qty; cur.marginCents = (cur.marginCents || 0) + rev - unitCost * i.qty; margin += rev - unitCost * i.qty; anyCost = true; }
    imap.set(k, cur);
  }
  const dmap = new Map<string, number>();
  for (const o of os) { const day = new Date(o.createdAt).toISOString().slice(0, 10); dmap.set(day, (dmap.get(day) || 0) + o.subtotalCents - o.discountCents); }
  return {
    netSalesCents: z.netSalesCents, orderCount: os.length, avgTicketCents: os.length ? Math.round(os.reduce((s, o) => s + o.totalCents, 0) / os.length) : 0,
    refundsCents: z.refundsNetCents, byItem: [...imap.values()].sort((a, b) => b.revenueCents - a.revenueCents), byStaff: z.byStaff,
    byDay: [...dmap.entries()].sort().map(([day, salesCents]) => ({ day, salesCents })), marginCents: anyCost ? margin : null,
  };
}
