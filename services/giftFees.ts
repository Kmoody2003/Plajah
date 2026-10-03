// giftFees — PURE donor-covers-the-fee math (no imports; used by server.ts and the donate UI).
//
// The donor is charged gift + fee so the church receives EXACTLY the gift amount. The platform keeps the
// fee (application_fee_amount on the destination charge), which pays Stripe's processing fee.
// Gross-up solves: gross - (gross * RATE + FIXED) = gift  →  gross = (gift + FIXED) / (1 - RATE).
// Default is Stripe's standard US card pricing (2.9% + 30¢); override with STRIPE_FEE_RATE / STRIPE_FEE_FIXED_CENTS.

export const DEFAULT_FEE_RATE = 0.029;
export const DEFAULT_FEE_FIXED_CENTS = 30;

export interface FeeParams { rate?: number; fixedCents?: number }

export function grossUpCents(giftCents: number, p: FeeParams = {}): { giftCents: number; feeCents: number; grossCents: number } {
  const rate = p.rate ?? DEFAULT_FEE_RATE;
  const fixed = p.fixedCents ?? DEFAULT_FEE_FIXED_CENTS;
  const gift = Math.max(0, Math.round(giftCents));
  if (gift === 0) return { giftCents: 0, feeCents: 0, grossCents: 0 };
  const gross = Math.ceil((gift + fixed) / (1 - rate));
  return { giftCents: gift, feeCents: gross - gift, grossCents: gross };
}

/** Dollars helper for the UI: what the donor pays in total and how much of it is the fee. */
export function grossUpDollars(gift: number, p?: FeeParams): { gift: number; fee: number; total: number } {
  const r = grossUpCents(Math.round(gift * 100), p);
  return { gift: r.giftCents / 100, fee: r.feeCents / 100, total: r.grossCents / 100 };
}

/** Recover the gift amount from a charged gross when the fee was covered by the donor. */
export function giftCentsFromGross(grossCents: number, feeCoveredCents: number): number {
  return Math.max(0, Math.round(grossCents) - Math.max(0, Math.round(feeCoveredCents || 0)));
}

/** Stripe's subscription `application_fee_percent` has 2-decimal precision — floor so the church never gets less than the gift. */
export function applicationFeePercent(feeCents: number, grossCents: number): number {
  if (!grossCents) return 0;
  return Math.floor((feeCents / grossCents) * 10000) / 100;
}
