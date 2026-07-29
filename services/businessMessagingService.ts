// businessMessagingService — Phase 1 of business → customer messaging: in-app push + the
// notification inbox (NO SMS yet). A customer opts in per business, split into TRANSACTIONAL
// (order/account) and PROMO (deals). Broadcasts reuse createNotification(), which already writes the
// in-app notification AND fires a push (honoring the recipient's global push prefs). The granular
// per-business, per-category opt-in is also the consent spine the later SMS/TCPA phase will require.

import { collection, doc, getDoc, getDocs, query, where, setDoc, addDoc } from 'firebase/firestore';
import { db, auth, createNotification } from './backendService';
import type { BusinessSubscription, BusinessBroadcast } from '../types';

const subCol = (businessUid: string) => collection(db, 'businesses', businessUid, 'subscribers');

/** The signed-in customer's opt-in state for a business (null if never subscribed). */
export async function getMyBusinessSubscription(businessUid: string): Promise<BusinessSubscription | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'businesses', businessUid, 'subscribers', uid));
    return snap.exists() ? (snap.data() as BusinessSubscription) : null;
  } catch { return null; }
}

/** Set / update the signed-in customer's opt-in for a business. Passing all-false effectively opts out. */
export async function setBusinessSubscription(
  businessUid: string,
  prefs: Pick<BusinessSubscription, 'transactional' | 'promo' | 'push' | 'email'>,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to manage business updates.');
  const existing = await getMyBusinessSubscription(businessUid);
  await setDoc(doc(db, 'businesses', businessUid, 'subscribers', uid), {
    customerUid: uid,
    businessUid,
    transactional: !!prefs.transactional,
    promo: !!prefs.promo,
    push: prefs.push ?? true,
    email: !!prefs.email,
    optInAt: existing?.optInAt || Date.now(),
  } satisfies BusinessSubscription, { merge: true });
}

/** Subscribers opted into a given category for a business. */
export async function listBusinessSubscribers(
  businessUid: string,
  category: 'TRANSACTIONAL' | 'PROMO',
): Promise<BusinessSubscription[]> {
  try {
    const field = category === 'PROMO' ? 'promo' : 'transactional';
    const snap = await getDocs(query(subCol(businessUid), where(field, '==', true)));
    return snap.docs.map(d => d.data() as BusinessSubscription);
  } catch { return []; }
}

export interface BroadcastInput { category: 'TRANSACTIONAL' | 'PROMO'; title: string; body: string; link?: string; }

/**
 * Send a business broadcast to everyone opted into that category. Phase 1 fans out client-side via
 * createNotification (in-app + push). Fine for early, modest lists; move to a server batch job once a
 * business has thousands of subscribers. Returns how many recipients were notified.
 */
export async function sendBusinessBroadcast(
  business: { uid: string; name: string; photo?: string },
  input: BroadcastInput,
): Promise<{ recipientCount: number }> {
  const subs = await listBusinessSubscribers(business.uid, input.category);
  const MAX = 500; // client-side safety cap; log if we hit it so nothing is silently dropped
  const targets = subs.slice(0, MAX);
  await Promise.all(targets.map(s => createNotification({
    userId: s.customerUid,
    senderId: business.uid,
    senderName: business.name,
    senderPhoto: business.photo || '',
    type: input.category === 'PROMO' ? 'BUSINESS_PROMO' : 'BUSINESS_UPDATE',
    title: input.title,
    message: input.body,
    link: input.link || 'PROFILE',
    targetId: business.uid,
  } as any).catch(() => {})));

  const record: Omit<BusinessBroadcast, 'id'> = {
    businessUid: business.uid,
    category: input.category,
    title: input.title,
    body: input.body,
    link: input.link,
    sentAt: Date.now(),
    recipientCount: targets.length,
  };
  try { await addDoc(collection(db, 'businesses', business.uid, 'broadcasts'), record); } catch { /* */ }
  if (subs.length > MAX) console.warn(`[businessMessaging] broadcast capped at ${MAX}/${subs.length}; use a server batch for large lists.`);
  return { recipientCount: targets.length };
}

/**
 * Transactional one-off: "your order is ready" (or any account update) to a single customer. Only
 * fires if the customer opted into transactional updates from this business. Wire this to your order
 * status → 'READY' transition (or call it from an order-management button).
 */
export async function notifyOrderReady(
  business: { uid: string; name: string; photo?: string },
  customerUid: string,
  orderLabel: string,
  link?: string,
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'businesses', business.uid, 'subscribers', customerUid));
    if (!(snap.exists() && (snap.data() as BusinessSubscription).transactional)) return false;
    await createNotification({
      userId: customerUid,
      senderId: business.uid,
      senderName: business.name,
      senderPhoto: business.photo || '',
      type: 'BUSINESS_UPDATE',
      title: `${business.name}: order ready`,
      message: `${orderLabel} is ready.`,
      link: link || 'PROFILE',
      targetId: business.uid,
    } as any);
    return true;
  } catch { return false; }
}
