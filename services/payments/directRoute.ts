// Plajah never holds a seller's money. Every sale is routed one of two ways before the buyer can pay:
//   direct: a destination charge. Stripe settles it to the seller and Plajah only receives its application fee.
//   split:  the sale has collaborators, and a destination charge can only pay one account. The charge is tied
//           to transfers sent as soon as it succeeds (services/splitPayouts.ts), so it only passes through.
// Either way, everyone being paid must be able to receive money first, or the buyer isn't charged at all.
import type { SaleBreakdown } from './saleFees';

export type SaleRoute = { route: 'direct' | 'split'; destination: string };
export type RouteCheck = ({ ok: true } & SaleRoute) | { ok: false; error: string };

export interface RouteDeps {
  accountOf(uid: string): Promise<string | undefined>;
  /** False when the account is missing at Stripe or can't take payouts. */
  canReceive(account: string): Promise<boolean>;
}

export async function checkSaleRoute(deps: RouteDeps, sellerUid: string, collaborators: Array<{ creatorUid: string }>, noun = 'creator'): Promise<RouteCheck> {
  const destination = await deps.accountOf(sellerUid);
  if (!destination || !(await deps.canReceive(destination))) return { ok: false, error: `This ${noun} has not finished setting up payouts, so they can't be paid yet.` };
  for (const c of collaborators) {
    const account = await deps.accountOf(c.creatorUid);
    if (!account || !(await deps.canReceive(account))) return { ok: false, error: `A collaborator on this sale has not finished setting up payouts, so it can't be sold yet.` };
  }
  return { ok: true, route: collaborators.length ? 'split' : 'direct', destination };
}

/** Fees for a sale with its own published cut and no processing pass-through, such as a Lorea book. */
export function fixedCutBreakdown(grossCents: number, feePct: number): SaleBreakdown {
  const gross = Math.max(0, Math.round(grossCents));
  const platformFeeCents = Math.round(gross * feePct / 100);
  return { feePct, platformFeeCents, processingCents: 0, sellerCents: gross - platformFeeCents, applicationFeeCents: platformFeeCents };
}

/** Stamped on the checkout and subscription, so the webhook records what this charge actually withheld. */
export function saleMeta(route: SaleRoute, fees: SaleBreakdown): Record<string, string> {
  return { route: route.route, platformFeePct: String(fees.feePct), platformFeeCents: String(fees.platformFeeCents), processingCents: String(fees.processingCents) };
}

export function feesFromMeta(meta: Record<string, string>): SaleBreakdown | null {
  if (meta.platformFeeCents === undefined) return null;
  const platformFeeCents = parseInt(meta.platformFeeCents, 10) || 0, processingCents = parseInt(meta.processingCents || '0', 10) || 0;
  return { feePct: Number(meta.platformFeePct) || 0, platformFeeCents, processingCents, sellerCents: 0, applicationFeeCents: platformFeeCents + processingCents };
}

/** The payment_intent_data fields for a one-time checkout. A split sale has none: its transfers follow the charge. */
export function paymentRouting(route: SaleRoute, fees: SaleBreakdown): Record<string, unknown> {
  if (route.route !== 'direct') return {};
  return { transfer_data: { destination: route.destination }, ...(fees.applicationFeeCents > 0 ? { application_fee_amount: fees.applicationFeeCents } : {}) };
}

/** The subscription_data fields for a recurring checkout. Stripe takes a percentage here, to two decimals. */
export function subscriptionRouting(route: SaleRoute, grossCents: number, fees: SaleBreakdown): Record<string, unknown> {
  if (route.route !== 'direct') return {};
  const pct = grossCents > 0 ? Math.round(fees.applicationFeeCents / grossCents * 10000) / 100 : 0;
  return { transfer_data: { destination: route.destination }, ...(pct > 0 ? { application_fee_percent: Math.min(pct, 100) } : {}) };
}
