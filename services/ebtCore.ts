// ebtCore — PURE SNAP/EBT eligibility rules for the register. "Connected-mode elevation": Plajah does
// NOT process EBT. The cashier rings the sale in Plajah, swipes the card on the merchant's own
// SNAP-authorised terminal, and types the approval reference (+ optional remaining balance) back in so
// it lands on the order and receipt. These helpers decide how much of a ticket MAY go on SNAP.
//
// SNAP can pay for eligible foods only - never tax (SNAP is tax-exempt), tips, hot/prepared food,
// alcohol, tobacco, or non-food. Eligibility is the owner's per-product flag (`snapEligible`); we
// do not ship the USDA list.

import { computeTax, type TaxSettings, type TaxLineIn } from './taxCore';

export type EbtLine = TaxLineIn;

/**
 * Max cents that may be tendered on EBT SNAP for this ticket: the eligible lines' share AFTER the
 * ticket discount is spread proportionally (a basket discount reduces the eligible part too).
 */
export function snapEligibleSubtotal(lines: EbtLine[], discountCents = 0, settings?: TaxSettings): number {
  return computeTax(lines, settings || { defaultRateBps: 0 }, { discountCents, snapCents: Number.MAX_SAFE_INTEGER }).snapCoveredCents;
}

export interface EbtGuidance {
  hasEligible: boolean;
  snapMaxCents: number;
  /** What remains for cash/card if SNAP covers its max (includes tax on the non-eligible part). */
  remainderCents: number;
  totalAfterSnapCents: number;
  message: string;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Cashier guidance: 'Put $X on EBT SNAP / $Y remains for cash or card'. */
export function ebtGuidance(lines: EbtLine[], settings: TaxSettings, discountCents = 0): EbtGuidance {
  const full = computeTax(lines, settings, { discountCents });
  const max = snapEligibleSubtotal(lines, discountCents, settings);
  if (max <= 0) return { hasEligible: false, snapMaxCents: 0, remainderCents: full.totalCents, totalAfterSnapCents: full.totalCents, message: '' };
  const withSnap = computeTax(lines, settings, { discountCents, snapCents: max });
  const remainder = Math.max(0, withSnap.totalCents - max);
  return {
    hasEligible: true, snapMaxCents: max, remainderCents: remainder, totalAfterSnapCents: withSnap.totalCents,
    message: remainder > 0
      ? `Put ${money(max)} on EBT SNAP / ${money(remainder)} remains for cash or card`
      : `Put ${money(max)} on EBT SNAP - nothing remains`,
  };
}

/** One-tap defaults for a corner store / grocery: sets taxClass + snapEligible + age gate together. */
export interface RegisterPreset { id: string; label: string; taxClass: string; snapEligible: boolean; ageRestricted?: number }
export const GROCERY_PACK: RegisterPreset[] = [
  { id: 'staple', label: 'Staple food (SNAP eligible)', taxClass: 'GROCERY_FOOD', snapEligible: true },
  { id: 'snack', label: 'Snacks / soda (SNAP eligible)', taxClass: 'GROCERY_FOOD', snapEligible: true },
  { id: 'hot', label: 'Hot / prepared food (not SNAP)', taxClass: 'PREPARED_FOOD', snapEligible: false },
  { id: 'alcohol', label: 'Beer / wine / liquor (21+)', taxClass: 'STANDARD', snapEligible: false, ageRestricted: 21 },
  { id: 'tobacco', label: 'Tobacco / vape (21+)', taxClass: 'STANDARD', snapEligible: false, ageRestricted: 21 },
  { id: 'household', label: 'Household / non-food', taxClass: 'STANDARD', snapEligible: false },
];
