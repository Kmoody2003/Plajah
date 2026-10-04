// offersCore - PURE offer evaluation, shared by the register UI and the server (which re-evaluates the
// business's real offers so a client can never claim an inflated "auto" discount).

export type OfferKind = 'PERCENT' | 'AMOUNT';
export interface BusinessOffer {
  id: string;
  label: string;
  kind: OfferKind;
  value: number;                 // percent (PERCENT) or dollars (AMOUNT)
  minSubtotalCents?: number;
  membersOnly?: boolean;
  active: boolean;
}

/** The discount an offer yields on a subtotal, or 0 if ineligible. */
export function offerDiscountCents(o: BusinessOffer, subtotalCents: number, hasMember: boolean): number {
  if (!o.active) return 0;
  if (o.membersOnly && !hasMember) return 0;
  if (o.minSubtotalCents && subtotalCents < o.minSubtotalCents) return 0;
  if (subtotalCents <= 0) return 0;
  const raw = o.kind === 'PERCENT'
    ? Math.round(subtotalCents * (Math.max(0, Math.min(100, o.value)) / 100))
    : Math.round(Math.max(0, o.value) * 100);
  return Math.min(subtotalCents, raw);
}

/** Pick the single best eligible offer for a ticket (largest discount wins). */
export function bestOffer(offers: BusinessOffer[], subtotalCents: number, hasMember: boolean): { offer: BusinessOffer; discountCents: number } | null {
  let best: { offer: BusinessOffer; discountCents: number } | null = null;
  for (const o of offers) {
    const d = offerDiscountCents(o, subtotalCents, hasMember);
    if (d > 0 && (!best || d > best.discountCents)) best = { offer: o, discountCents: d };
  }
  return best;
}
