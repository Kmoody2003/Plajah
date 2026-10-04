// refundCore — PURE refund/return planning for the register. Given the original order, the refunds
// already issued against it and a refund request, decide exactly what each line refunds (money + tax),
// what goes back on the shelf, and which tender each cent returns to. The server is authoritative;
// the client runs the same function to preview.
//
// Invariants (tested): never refund more qty than was sold less already-refunded; the LAST unit of a
// line refunds the exact remainder (no penny drift across partial refunds); tax is refunded in
// proportion to the line; tips are not refunded; total refunded can never exceed what was paid.

import { allocateProportional } from './taxCore';
import { type Tender, tenderKey, isStoredValueTender } from './tenderCore';

export interface OrderLine {
  productId: string; variantId?: string | null; title: string; qty: number;
  /** What the customer paid for the whole line (after discount, incl. tax if exclusive), cents. */
  chargeCents: number;
  /** Tax inside chargeCents. */
  taxCents: number;
}
export interface RefundLineRecord { index: number; qty: number; amountCents: number; taxCents: number; restock?: boolean }
export interface RefundRecord { lines: RefundLineRecord[]; allocations: { type: string; kind?: string; amountCents: number; tenderIndex?: number }[] }
export type RefundMethod = 'ORIGINAL' | 'CASH' | 'STORE_CREDIT';
export interface RefundRequestLine { index: number; qty: number; restock?: boolean }

export interface RefundPlan {
  lines: RefundLineRecord[];
  amountCents: number;
  taxCents: number;
  allocations: { type: string; kind?: string; amountCents: number; tenderIndex?: number }[];
  restock: { productId: string; variantId?: string; qty: number; title: string }[];
}
export type RefundResult = { ok: true; plan: RefundPlan } | { ok: false; error: string };

export const REFUND_REASONS = ['CUSTOMER_RETURN', 'DEFECTIVE', 'WRONG_ITEM', 'PRICE_ADJUST', 'EXCHANGE', 'OTHER'] as const;
export type RefundReason = typeof REFUND_REASONS[number];
export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
  CUSTOMER_RETURN: 'Customer return', DEFECTIVE: 'Defective / damaged', WRONG_ITEM: 'Wrong item', PRICE_ADJUST: 'Price adjustment', EXCHANGE: 'Exchange', OTHER: 'Other',
};

/** Per-line qty/amount already refunded across prior refunds. */
export function refundedSoFar(lines: OrderLine[], prior: RefundRecord[]) {
  const qty = lines.map(() => 0), amt = lines.map(() => 0), tax = lines.map(() => 0);
  for (const r of prior) for (const l of r.lines || []) {
    if (l.index >= 0 && l.index < lines.length) { qty[l.index] += l.qty; amt[l.index] += l.amountCents; tax[l.index] += l.taxCents; }
  }
  return { qty, amt, tax };
}

export function planRefund(
  order: { lines: OrderLine[]; tenders: Tender[] },
  prior: RefundRecord[],
  req: { lines: RefundRequestLine[]; method: RefundMethod },
): RefundResult {
  const done = refundedSoFar(order.lines, prior);
  const asked = new Map<number, RefundRequestLine>();
  for (const r of req.lines || []) {
    const q = Math.floor(Number(r.qty));
    if (!Number.isInteger(r.index) || r.index < 0 || r.index >= order.lines.length) return { ok: false, error: 'That item is not on the original order.' };
    if (!(q > 0)) continue;
    const cur = asked.get(r.index);
    asked.set(r.index, { index: r.index, qty: (cur?.qty || 0) + q, restock: r.restock ?? cur?.restock });
  }
  if (!asked.size) return { ok: false, error: 'Pick at least one item to refund.' };

  const lines: RefundLineRecord[] = [];
  const restock: RefundPlan['restock'] = [];
  for (const a of asked.values()) {
    const l = order.lines[a.index];
    const remaining = l.qty - done.qty[a.index];
    if (a.qty > remaining) return { ok: false, error: remaining <= 0 ? `${l.title} was already fully refunded.` : `Only ${remaining} of ${l.title} can still be refunded.` };
    const last = a.qty === remaining;
    const amount = last ? l.chargeCents - done.amt[a.index] : Math.round(l.chargeCents * a.qty / l.qty);
    const tax = last ? l.taxCents - done.tax[a.index] : Math.round(l.taxCents * a.qty / l.qty);
    lines.push({ index: a.index, qty: a.qty, amountCents: Math.max(0, amount), taxCents: Math.max(0, Math.min(tax, amount)), restock: !!a.restock });
    if (a.restock) restock.push({ productId: l.productId, variantId: l.variantId || undefined, qty: a.qty, title: l.title });
  }
  const amountCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = lines.reduce((s, l) => s + l.taxCents, 0);
  if (amountCents <= 0) return { ok: false, error: 'Nothing to refund on those items.' };

  // Capacity left on each original tender (tips are inside tender amounts, so capacity >= merchandise).
  const used = order.tenders.map(() => 0);
  prior.forEach(r => (r.allocations || []).forEach(al => { if (typeof al.tenderIndex === 'number' && al.tenderIndex < used.length) used[al.tenderIndex] += al.amountCents; }));
  const cap = order.tenders.map((t, i) => Math.max(0, t.amountCents - used[i]));
  const capTotal = cap.reduce((a, b) => a + b, 0);
  if (amountCents > capTotal) return { ok: false, error: 'That is more than the customer paid.' };

  let allocations: RefundPlan['allocations'] = [];
  if (req.method === 'STORE_CREDIT') {
    // SNAP-paid portions may only go back to the EBT card, never to store credit (benefits would become spendable anywhere).
    const nonSnapCap = order.tenders.reduce((s, t, i) => s + (tenderKey(t) === 'EBT_SNAP' ? 0 : cap[i]), 0);
    if (amountCents > nonSnapCap) return { ok: false, error: 'Part of this was paid with EBT SNAP and must go back to the EBT card - choose "Original payment".' };
    allocations = [{ type: 'STORE_CREDIT', amountCents }];
  } else if (req.method === 'CASH') {
    // Neither SNAP nor stored-value portions can be turned into cash (stored value goes back to its card or to store credit).
    const nonSnapCap = order.tenders.reduce((s, t, i) => s + (tenderKey(t) === 'EBT_SNAP' || isStoredValueTender(t) ? 0 : cap[i]), 0);
    if (amountCents > nonSnapCap) return { ok: false, error: 'Part of this was paid with EBT SNAP or a gift card/wallet and cannot be refunded as cash - choose "Original payment".' };
    allocations = [{ type: 'CASH', amountCents }];
  } else {
    const shares = allocateProportional(amountCents, cap);
    // largest-remainder can overshoot a tiny cap by 1c - push any excess to tenders with room
    let spill = 0;
    shares.forEach((s, i) => { if (s > cap[i]) { spill += s - cap[i]; shares[i] = cap[i]; } });
    for (let i = 0; spill > 0 && i < shares.length; i++) { const room = cap[i] - shares[i]; const m = Math.min(room, spill); shares[i] += m; spill -= m; }
    allocations = shares.map((s, i) => ({ type: order.tenders[i].type, kind: order.tenders[i].kind, amountCents: s, tenderIndex: i })).filter(a => a.amountCents > 0);
  }
  return { ok: true, plan: { lines, amountCents, taxCents, allocations, restock } };
}

/** Refunds at/above the threshold need a manager. */
export const refundNeedsManager = (amountCents: number, thresholdCents = 5000): boolean => amountCents >= Math.max(0, thresholdCents);

/** Deterministic idempotency key for restocking one refund line (create-once ledger id). */
export const restockMoveId = (refundId: string, productId: string, variantId?: string | null): string =>
  `rf_${refundId}_${productId}_${variantId || 'base'}`.slice(0, 200);

// ── Concurrency-safe commit + doc parsing + loyalty clawback ─────────────────────────────────────

import { casUpdate, type CasStore } from './casCore';
import { parseTenders } from './tenderCore';

/** Per-line shape out of a stored order doc (`items` is a JSON string on the order). */
export function orderLinesFromDoc(o: any): OrderLine[] {
  let items: any[] = []; try { items = JSON.parse(String(o?.items || '[]')); } catch { /* none */ }
  return items.map(i => {
    const qty = Math.max(1, Math.round(Number(i.qty) || 1));
    return {
      productId: String(i.productId || ''), variantId: i.variantId || null, title: String(i.title || 'Item'), qty,
      chargeCents: i.chargeCents !== undefined ? Math.round(Number(i.chargeCents) || 0) : Math.round(Number(i.unitAmount) || 0) * qty,
      taxCents: Math.round(Number(i.taxCents) || 0),
    };
  });
}
export interface RefundLogEntry extends RefundRecord { id: string; amountCents: number; taxCents: number; at: number }
export const refundLogOf = (o: any): RefundLogEntry[] => { try { const v = typeof o?.refundLog === 'string' ? JSON.parse(o.refundLog) : o?.refundLog; return Array.isArray(v) ? v : []; } catch { return []; } };

export function planFromOrderDoc(o: any, req: { lines: RefundRequestLine[]; method: RefundMethod }): RefundResult {
  const tenders = parseTenders(o?.tenders, o?.tender, Math.round(Number(o?.paidCents ?? o?.totalCents) || 0));
  return planRefund({ lines: orderLinesFromDoc(o), tenders }, refundLogOf(o), req);
}

export type CommitResult =
  | { ok: true; duplicate: boolean; entry: RefundLogEntry; fullyRefunded: boolean; priorNetCents: number }
  | { ok: false; error: string; code?: string };

/**
 * Atomically apply a refund to the ORDER DOC. The "already refunded" state (`refundLog`) lives on the order
 * and is updated with a compare-and-swap, so two concurrent refunds can never both pass the paid amount: the
 * loser re-reads, sees the first refund, and is re-planned (usually rejected). Re-sending the same
 * `refundId` is a no-op that returns the original entry (idempotent retries).
 * `gate` runs on every attempt (e.g. manager-approval threshold).
 */
export async function commitRefund(
  store: CasStore, orderKey: string,
  req: { refundId: string; lines: RefundRequestLine[]; method: RefundMethod; sellerId?: string; gate?: (plan: RefundPlan) => { ok: true } | { ok: false; error: string; code?: string }; now?: number },
): Promise<CommitResult> {
  const out = await casUpdate<CommitResult>(store, orderKey, (cur) => {
    if (!cur || (req.sellerId && cur.sellerId !== req.sellerId)) return { abort: true, result: { ok: false, error: 'Order not found.' } };
    if (cur.source !== undefined && cur.source !== 'POS') return { abort: true, result: { ok: false, error: 'Online orders are refunded from the Orders tab.', code: 'ONLINE_ORDER' } };
    const log = refundLogOf(cur);
    const lines = orderLinesFromDoc(cur);
    const dup = log.find(e => e.id === req.refundId);
    if (dup) {
      const done = refundedSoFar(lines, log);
      return { abort: true, result: { ok: true, duplicate: true, entry: dup, fullyRefunded: lines.every((l, i) => done.qty[i] >= l.qty), priorNetCents: log.filter(e => e !== dup && log.indexOf(e) < log.indexOf(dup)).reduce((s, e) => s + e.amountCents - e.taxCents, 0) } };
    }
    const plan = planFromOrderDoc(cur, { lines: req.lines, method: req.method });
    if (plan.ok === false) return { abort: true, result: { ok: false, error: plan.error } };
    const g = req.gate ? req.gate(plan.plan) : { ok: true as const };
    if (g.ok === false) return { abort: true, result: { ok: false, error: g.error, code: g.code } };
    const entry: RefundLogEntry = { id: req.refundId, lines: plan.plan.lines, allocations: plan.plan.allocations, amountCents: plan.plan.amountCents, taxCents: plan.plan.taxCents, at: req.now ?? Date.now() };
    const nextLog = [...log, entry];
    const done = refundedSoFar(lines, nextLog);
    const full = lines.every((l, i) => done.qty[i] >= l.qty);
    return {
      patch: { refundLog: JSON.stringify(nextLog), refundedCents: nextLog.reduce((s, e) => s + e.amountCents, 0), refundCount: nextLog.length, ...(full ? { status: 'REFUNDED' } : { partiallyRefunded: true }) },
      result: { ok: true, duplicate: false, entry, fullyRefunded: full, priorNetCents: log.reduce((s, e) => s + e.amountCents - e.taxCents, 0) },
    };
  });
  if (out.ok === true) return out.result;
  if (out.reason === 'ABORT' && out.result) return out.result;
  return { ok: false, error: out.reason === 'CONFLICT' ? 'The register is busy - try the refund again.' : 'Could not record the refund. Nothing was changed.', code: out.reason };
}

/**
 * Loyalty points to take back for a refund. Points were earned on the pre-tax paid amount, so the take-back
 * is cumulative-proportional: after refunding X% of the order's net, X% of the earned points are gone.
 * Cumulative targets mean partial refunds add up to exactly `earned` and never over-claw.
 */
export function clawbackPoints(a: { earnedPoints: number; orderNetCents: number; priorRefundNetCents: number; thisRefundNetCents: number }): number {
  if (!(a.earnedPoints > 0) || !(a.orderNetCents > 0)) return 0;
  const target = (net: number) => Math.round(a.earnedPoints * Math.min(1, Math.max(0, net) / a.orderNetCents));
  return Math.max(0, target(a.priorRefundNetCents + a.thisRefundNetCents) - target(a.priorRefundNetCents));
}
/** Apply a clawback to a balance: never below zero. */
export const applyClawback = (balance: number, claw: number): { newBalance: number; clawed: number } => {
  const clawed = Math.max(0, Math.min(Math.round(balance), Math.round(claw)));
  return { newBalance: Math.round(balance) - clawed, clawed };
};
