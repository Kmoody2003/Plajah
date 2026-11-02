import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, runTransaction, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';
import {
  PlajahPlusSubscription, SubscriptionTier
} from '../types';

const COLLECTION = 'plajahPlusSubscriptions';

// ── Fetch current user's subscription ────────────────────────────────────────

export async function fetchMySubscription(): Promise<PlajahPlusSubscription | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const q = query(
    collection(db, COLLECTION),
    where('subscriberId', '==', uid),
    where('status', 'in', ['active', 'trialing', 'past_due']),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as PlajahPlusSubscription;
}

// ── Subscribe to subscription updates in real-time ───────────────────────────

export function listenToMySubscription(
  callback: (sub: PlajahPlusSubscription | null) => void
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { callback(null); return () => {}; }

  const q = query(
    collection(db, COLLECTION),
    where('subscriberId', '==', uid),
    where('status', 'in', ['active', 'trialing', 'past_due']),
    limit(1)
  );

  return onSnapshot(q, snap => {
    if (snap.empty) { callback(null); return; }
    callback({ id: snap.docs[0].id, ...snap.docs[0].data() } as PlajahPlusSubscription);
  });
}

// ── Check if a user has an active subscription ───────────────────────────────

export async function hasActiveSubscription(uid: string): Promise<boolean> {
  const q = query(
    collection(db, COLLECTION),
    where('subscriberId', '==', uid),
    where('status', 'in', ['active', 'trialing']),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ── Get subscription tier benefits ───────────────────────────────────────────

export function getSubscriptionBenefits(tier: SubscriptionTier) {
  const map = {
    1: { storageGb: 50, monthlyPoints: 100, transactionDiscount: 10, merchDiscount: 10, sanctuaryDiscount: 10, adBoost: 15 },
    2: { storageGb: 75, monthlyPoints: 300, transactionDiscount: 15, merchDiscount: 15, sanctuaryDiscount: 15, adBoost: 30 },
    3: { storageGb: 100, monthlyPoints: 1000, transactionDiscount: 20, merchDiscount: 20, sanctuaryDiscount: 20, adBoost: 50 },
  };
  return map[tier];
}

// ── List subscribers for a creator ───────────────────────────────────────────

export async function fetchCreatorSubscribers(creatorId: string): Promise<PlajahPlusSubscription[]> {
  const q = query(
    collection(db, COLLECTION),
    where('boundCreatorId', '==', creatorId),
    where('status', 'in', ['active', 'trialing']),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PlajahPlusSubscription));
}

// ── Listen to subscriptions on a creator's profile (for counter display) ─────

export function listenToCreatorSubscriberCount(
  creatorId: string,
  callback: (count: number) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('boundCreatorId', '==', creatorId),
    where('status', 'in', ['active', 'trialing'])
  );
  return onSnapshot(q, snap => callback(snap.size));
}

// ── Award monthly points (called by server/Cloud Function) ───────────────────

export async function awardMonthlyPoints(uid: string, tier: SubscriptionTier): Promise<void> {
  const points = getSubscriptionBenefits(tier).monthlyPoints;
  const ref = doc(db, 'users', uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const current = snap.data().points || 0;
    tx.update(ref, { points: current + points, updatedAt: Date.now() });
  });
}

// ── Apply subscription discount to a price ───────────────────────────────────

export function applySubscriptionDiscount(
  price: number,
  tier: SubscriptionTier | null,
  type: 'transaction' | 'merch' | 'sanctuary'
): number {
  if (!tier) return price;
  const benefits = getSubscriptionBenefits(tier);
  const discountPct = type === 'transaction'
    ? benefits.transactionDiscount
    : type === 'merch'
      ? benefits.merchDiscount
      : benefits.sanctuaryDiscount;
  return +(price * (1 - discountPct / 100)).toFixed(2);
}

// ── Morph subscription — get creator share recipients ───────────────────────

export function resolveMorphRecipients(
  sub: PlajahPlusSubscription,
  allCreatorIds: string[]
): string[] {
  if (!sub.isMorph) return sub.boundCreatorId ? [sub.boundCreatorId] : [];

  if (sub.morphMode === 'RANDOM' || !sub.morphCreatorIds?.length) {
    const shuffled = [...allCreatorIds].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  return sub.morphCreatorIds.slice(0, 3);
}

// ── Subscription tier from Stripe price ID ───────────────────────────────────

export function tierFromPriceId(priceId: string): SubscriptionTier {
  const map: Record<string, SubscriptionTier> = {
    [import.meta.env.VITE_STRIPE_PRICE_TIER1 || 'tier1']: 1,
    [import.meta.env.VITE_STRIPE_PRICE_TIER2 || 'tier2']: 2,
    [import.meta.env.VITE_STRIPE_PRICE_TIER3 || 'tier3']: 3,
  };
  return map[priceId] ?? 1;
}
