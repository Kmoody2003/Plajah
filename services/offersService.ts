// offersService — lightweight in-store deals a business can run. Offers live at
// `businesses/{businessUid}/offers/{id}` (owner writes; public read so the register + storefront can
// evaluate them). The register auto-applies the single best eligible offer to a ticket at checkout.
//
// Kinds:
//   PERCENT  — value% off the subtotal (e.g. 10 = 10% off)
//   AMOUNT   — flat $ off (value in dollars), only once the subtotal clears any minimum
// membersOnly offers apply only when a recognized Plajah customer is attached to the ticket.

import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './backendService';

export type OfferKind = 'PERCENT' | 'AMOUNT';

export interface BusinessOffer {
  id: string;
  label: string;
  kind: OfferKind;
  value: number;                 // percent (PERCENT) or dollars (AMOUNT)
  minSubtotalCents?: number;     // eligibility floor
  membersOnly?: boolean;         // requires an attached loyalty customer
  active: boolean;
}

export async function fetchOffers(businessUid: string): Promise<BusinessOffer[]> {
  try {
    const snap = await getDocs(collection(db, 'businesses', businessUid, 'offers'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as BusinessOffer[];
  } catch { return []; }
}

export async function saveOffer(businessUid: string, offer: Omit<BusinessOffer, 'id'> & { id?: string }): Promise<string> {
  const id = offer.id || `offer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { id: _drop, ...rest } = offer as any;
  await setDoc(doc(db, 'businesses', businessUid, 'offers', id), rest, { merge: true });
  return id;
}

export async function deleteOffer(businessUid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'businesses', businessUid, 'offers', id));
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

/** Seed a couple of demo deals so a demo business shows auto-apply at checkout. Idempotent-ish:
 *  only seeds when the business has no offers yet. */
export async function seedDemoOffers(businessUid: string): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== businessUid) return;
  const existing = await fetchOffers(businessUid);
  if (existing.length) return;
  await saveOffer(businessUid, { label: 'Members save 10%', kind: 'PERCENT', value: 10, membersOnly: true, active: true });
  await saveOffer(businessUid, { label: '$5 off $40+', kind: 'AMOUNT', value: 5, minSubtotalCents: 4000, active: true });
}
