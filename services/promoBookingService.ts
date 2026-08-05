// promoBookingService — the artist↔business cross-promo marketplace. Creators set their own rates
// for a commercial spot on their Artist Radio / FAST channel, or a cross-promotion; businesses
// browse the artist directory and book at that rate. The creator accepts/declines. (Payment on
// accept is a fast-follow via the existing Stripe live-tip/destination-charge rail.)

import { collection, query, where, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth, updateUserProfile, searchUserProfiles } from './backendService';
import type { PromoBooking, UserProfile } from '../types';

export type PromoKind = PromoBooking['kind'];
export const PROMO_LABEL: Record<PromoKind, string> = {
  RADIO_AD: 'Radio commercial', FAST_AD: 'FAST channel spot', CROSS_PROMO: 'Cross-promotion',
};

/** Creator: save the rates businesses can book. */
export async function setCreatorPromoRates(rates: NonNullable<UserProfile['promoRates']>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  await updateUserProfile(uid, { promoRates: rates });
}

/** The rate for a given kind from a creator's profile (0 = not offered). */
export function rateFor(profile: Pick<UserProfile, 'promoRates'>, kind: PromoKind): number {
  const r = profile.promoRates;
  if (!r) return 0;
  return kind === 'RADIO_AD' ? (r.radioAd || 0) : kind === 'FAST_AD' ? (r.fastAd || 0) : (r.crossPromo || 0);
}

/** Artist directory for businesses — creators who accept promo bookings. */
export async function fetchPromoArtists(queryText = ' '): Promise<UserProfile[]> {
  try {
    const results = await searchUserProfiles(queryText);
    return (results || []).filter((a: any) => a?.promoRates?.acceptsPromo);
  } catch { return []; }
}

/** Business: request a promo booking from a creator at their set rate. */
export async function requestPromoBooking(
  business: { uid: string; name: string },
  creator: { uid: string; name: string },
  kind: PromoKind,
  rate: number,
  message?: string,
): Promise<string> {
  const rec: Omit<PromoBooking, 'id'> = {
    businessUid: business.uid, businessName: business.name,
    creatorUid: creator.uid, creatorName: creator.name,
    kind, rate, message: (message || '').slice(0, 500),
    status: 'PENDING', createdAt: Date.now(),
  };
  const ref = await addDoc(collection(db, 'promoBookings'), rec);
  return ref.id;
}

const mapBooking = (id: string, x: any): PromoBooking => ({ id, ...x } as PromoBooking);

/** Creator inbox: promo requests sent to me. */
export async function fetchCreatorPromoRequests(): Promise<PromoBooking[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'promoBookings'), where('creatorUid', '==', uid)));
    return snap.docs.map(d => mapBooking(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/** Business: my sent promo requests. */
export async function fetchBusinessPromoRequests(businessUid: string): Promise<PromoBooking[]> {
  try {
    const snap = await getDocs(query(collection(db, 'promoBookings'), where('businessUid', '==', businessUid)));
    return snap.docs.map(d => mapBooking(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/** Creator: accept or decline a request. */
export async function respondToPromoBooking(id: string, status: 'ACCEPTED' | 'DECLINED'): Promise<void> {
  await updateDoc(doc(db, 'promoBookings', id), { status, respondedAt: Date.now() });
}
