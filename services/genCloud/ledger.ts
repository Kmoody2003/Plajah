// services/genCloud/ledger.ts — the credit ledger. Pure functions over one ledger document.
//
// Rules (from the pricing plan):
//   • monthly credits are spent oldest-expiring first, then bonus, then pack credits;
//   • monthly credits roll over for the plan's rolloverMonths and never exceed 3 months' worth;
//   • pack credits last 12 months; bought credits are never cashable or transferable
//     (they are Plajah's own service, not held money — see feedback-no-held-money);
//   • a job HOLDS credits on submit, SETTLES on success, RELEASES on failure — failures cost nothing;
//   • a lapsed subscription freezes monthly credits for 30 days (back on resubscribe), then they expire.
// Every mutation is idempotent on its key (period, purchase id, job id) so webhook/job retries are safe.
// Persistence (a server-only Firestore doc per user or team pool, written in a transaction) is a
// separate store; this file never does I/O.

import { PLAN_GRANTS, ROLLOVER_CAP_MONTHS, type PlanId } from './tiers';

export type BucketSource = 'monthly' | 'bonus' | 'pack';

export interface Bucket {
  id: string;            // m:<period> | p:<purchaseId> | b:<grantId>
  source: BucketSource;
  remaining: number;
  granted: number;
  grantedAt: number;
  expiresAt: number;
}

export interface Hold { jobId: string; credits: number; draws: Array<{ bucketId: string; amount: number }>; at: number }

export interface Ledger {
  owner: string;          // uid or team pool id
  buckets: Bucket[];
  holds: Record<string, Hold>;
  /** Set while the subscription is lapsed; monthly credits are frozen, then expire 30 days after. */
  lapsedAt?: number;
  /** Job ids already settled (bounded list) — a duplicate settle is a no-op. */
  settled: string[];
}

export const DAY = 86_400_000;
export const MONTH = 30 * DAY;
export const PACK_LIFETIME = 365 * DAY;
export const LAPSE_GRACE = 30 * DAY;
const SETTLED_KEEP = 500;
const ORDER: Record<BucketSource, number> = { monthly: 0, bonus: 1, pack: 2 };

export class LedgerError extends Error {
  constructor(public code: 'insufficient' | 'unknown_job', msg: string) { super(msg); }
}

export const emptyLedger = (owner: string): Ledger => ({ owner, buckets: [], holds: {}, settled: [] });

const clone = (l: Ledger): Ledger => ({ ...l, buckets: l.buckets.map(b => ({ ...b })), holds: { ...l.holds }, settled: [...l.settled] });

function spendable(b: Bucket, l: Ledger, now: number): boolean {
  if (b.remaining <= 0 || b.expiresAt <= now) return false;
  if (b.source === 'monthly' && l.lapsedAt !== undefined) return false;
  return true;
}

export function balance(l: Ledger, now: number) {
  const live = l.buckets.filter(b => spendable(b, l, now));
  const sum = (s: BucketSource) => live.filter(b => b.source === s).reduce((t, b) => t + b.remaining, 0);
  const held = Object.values(l.holds).reduce((t, h) => t + h.credits, 0);
  const frozen = l.lapsedAt !== undefined
    ? l.buckets.filter(b => b.source === 'monthly' && b.remaining > 0 && b.expiresAt > now).reduce((t, b) => t + b.remaining, 0) : 0;
  return { available: sum('monthly') + sum('bonus') + sum('pack'), monthly: sum('monthly'), bonus: sum('bonus'), pack: sum('pack'), held, frozen };
}

/** Drop expired and empty buckets; expire frozen monthly credits after the grace period. */
export function prune(l: Ledger, now: number): Ledger {
  const out = clone(l);
  if (out.lapsedAt !== undefined && now - out.lapsedAt >= LAPSE_GRACE) {
    out.buckets = out.buckets.filter(b => b.source !== 'monthly');
  }
  const heldIds = new Set(Object.values(out.holds).flatMap(h => h.draws.map(d => d.bucketId)));
  out.buckets = out.buckets.filter(b => heldIds.has(b.id) || (b.remaining > 0 && b.expiresAt > now));
  return out;
}

/** Grant one billing period's allowance. `period` like "2026-12"; repeat calls are no-ops. */
export function grantMonthly(l: Ledger, plan: PlanId, period: string, periodStart: number, now: number): Ledger {
  const g = PLAN_GRANTS[plan];
  const id = `m:${period}`;
  if (!g.monthlyCredits || l.buckets.some(b => b.id === id)) return l;
  const out = prune(clone(l), now);
  delete out.lapsedAt; // paying again unfreezes rolled-over credits
  out.buckets.push({ id, source: 'monthly', remaining: g.monthlyCredits, granted: g.monthlyCredits,
    grantedAt: now, expiresAt: periodStart + (g.rolloverMonths + 1) * MONTH });
  // Cap: trim the oldest monthly credits beyond 3 months' worth.
  const cap = g.monthlyCredits * ROLLOVER_CAP_MONTHS;
  const monthly = out.buckets.filter(b => b.source === 'monthly').sort((a, b) => b.grantedAt - a.grantedAt);
  let kept = 0;
  for (const b of monthly) {
    const room = Math.max(0, cap - kept);
    if (b.remaining > room) b.remaining = room;
    kept += b.remaining;
  }
  return out;
}

export function grantPack(l: Ledger, purchaseId: string, credits: number, now: number): Ledger {
  const id = `p:${purchaseId}`;
  if (credits <= 0 || l.buckets.some(b => b.id === id)) return l;
  const out = clone(l);
  out.buckets.push({ id, source: 'pack', remaining: credits, granted: credits, grantedAt: now, expiresAt: now + PACK_LIFETIME });
  return out;
}

export function grantBonus(l: Ledger, grantId: string, credits: number, now: number, lifetime = 90 * DAY): Ledger {
  const id = `b:${grantId}`;
  if (credits <= 0 || l.buckets.some(b => b.id === id)) return l;
  const out = clone(l);
  out.buckets.push({ id, source: 'bonus', remaining: credits, granted: credits, grantedAt: now, expiresAt: now + lifetime });
  return out;
}

/** Reserve credits for a job. Same jobId twice returns the ledger unchanged. */
export function hold(l: Ledger, jobId: string, credits: number, now: number): Ledger {
  if (l.holds[jobId] || l.settled.includes(jobId)) return l;
  const out = clone(l);
  const order = out.buckets
    .filter(b => spendable(b, out, now))
    .sort((a, b) => ORDER[a.source] - ORDER[b.source] || a.expiresAt - b.expiresAt);
  const total = order.reduce((t, b) => t + b.remaining, 0);
  if (total < credits) throw new LedgerError('insufficient', `need ${credits} credits, have ${total}`);
  let left = credits;
  const draws: Hold['draws'] = [];
  for (const b of order) {
    if (!left) break;
    const take = Math.min(b.remaining, left);
    b.remaining -= take; left -= take;
    draws.push({ bucketId: b.id, amount: take });
  }
  out.holds[jobId] = { jobId, credits, draws, at: now };
  return out;
}

/** The job succeeded: the held credits are spent. */
export function settle(l: Ledger, jobId: string): Ledger {
  if (l.settled.includes(jobId)) return l;
  if (!l.holds[jobId]) throw new LedgerError('unknown_job', `no hold for ${jobId}`);
  const out = clone(l);
  delete out.holds[jobId];
  out.settled = [...out.settled, jobId].slice(-SETTLED_KEEP);
  return out;
}

/** The job failed: give every credit back to the bucket it came from. */
export function release(l: Ledger, jobId: string): Ledger {
  const h = l.holds[jobId];
  if (!h) return l;
  const out = clone(l);
  for (const d of h.draws) {
    const b = out.buckets.find(x => x.id === d.bucketId);
    if (b) b.remaining += d.amount;
  }
  delete out.holds[jobId];
  return out;
}

export function lapse(l: Ledger, now: number): Ledger {
  if (l.lapsedAt !== undefined) return l;
  return { ...clone(l), lapsedAt: now };
}
