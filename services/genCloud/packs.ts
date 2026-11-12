// services/genCloud/packs.ts — credit packs sold through Stripe Checkout. Pure.
//
// A pack is Plajah's own service (not held money): credits are never cashable or transferable and
// last 12 months (ledger.ts PACK_LIFETIME). Base value is 1 credit = $0.01; bigger packs carry a
// small bonus, kept small enough that even with Stripe's fee every engine still clears its cost
// (packMarginCheck, enforced by the test suite).
//
// Flow: POST /api/gen-cloud/packs/checkout → Stripe Checkout (metadata type=gencloud_pack) →
// checkout.session.completed → packFromSession() validates → ledger grantPack(cs_<session id>),
// idempotent so Stripe redeliveries never double-grant. charge.refunded → revokePack().

import { CREDIT_USD, MARKUP_FLOOR } from './pricing';

export type PackId = 'pack-1000' | 'pack-2600' | 'pack-5400' | 'pack-11000';

export interface CreditPack { id: PackId; name: string; credits: number; priceCents: number; bonusPct: number }

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack-1000',  name: '1,000 credits',  credits: 1000,  priceCents: 1000,  bonusPct: 0 },
  { id: 'pack-2600',  name: '2,600 credits',  credits: 2600,  priceCents: 2500,  bonusPct: 4 },
  { id: 'pack-5400',  name: '5,400 credits',  credits: 5400,  priceCents: 5000,  bonusPct: 8 },
  { id: 'pack-11000', name: '11,000 credits', credits: 11000, priceCents: 10000, bonusPct: 10 },
];

export const getPack = (id: unknown): CreditPack | undefined => CREDIT_PACKS.find(p => p.id === id);

/** Stripe's US card fee, used only for the margin check. */
export const stripeFeeCents = (cents: number) => Math.round(cents * 0.029) + 30;

/**
 * Worst case for a pack: every credit spent on the thinnest route (cost = credit value / MARKUP_FLOOR).
 * Returns what Plajah keeps per pack after provider cost and Stripe's fee. Must stay positive.
 */
export function packMarginCents(p: CreditPack, floor = MARKUP_FLOOR): number {
  const worstProviderCents = (p.credits * CREDIT_USD * 100) / floor;
  return Math.round(p.priceCents - stripeFeeCents(p.priceCents) - worstProviderCents);
}

export const STRIPE_PACK_TYPE = 'gencloud_pack';

/** The metadata stamped on the Checkout Session (all strings, per Stripe). */
export function packMetadata(p: CreditPack, uid: string, owner: string): Record<string, string> {
  return { type: STRIPE_PACK_TYPE, uid, owner, packId: p.id, credits: String(p.credits) };
}

export interface PackGrant { owner: string; uid: string; purchaseId: string; credits: number; paymentIntentId: string }

const idOf = (v: any): string => (typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : '');

/**
 * Turn a completed Checkout Session into a grant, or null when it isn't a paid credit pack.
 * Credits come from OUR catalog by pack id and the paid amount must match the catalog price, so a
 * stale or edited session can never mint credits.
 */
export function packFromSession(session: any): PackGrant | null {
  const m = session?.metadata || {};
  if (m.type !== STRIPE_PACK_TYPE || session.mode !== 'payment' || session.payment_status !== 'paid') return null;
  const pack = getPack(m.packId);
  if (!pack || !m.owner || !m.uid) return null;
  if (Number(session.amount_total) !== pack.priceCents) {
    console.warn('[genCloud] pack amount mismatch', session.id, session.amount_total, pack.priceCents);
    return null;
  }
  return { owner: String(m.owner), uid: String(m.uid), purchaseId: `cs_${session.id}`, credits: pack.credits, paymentIntentId: idOf(session.payment_intent) };
}

/** Credits to take back for a refund: proportional to the refunded share of the charge. */
export function refundRevokeTarget(credits: number, amountRefunded: number, amount: number): number {
  if (!(amount > 0) || !(amountRefunded > 0)) return 0;
  return Math.min(credits, Math.round(credits * Math.min(1, amountRefunded / amount)));
}
