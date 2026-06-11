import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, addDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';
import type {
  SanctuaryTier, SanctuaryMembership, SanctuaryExclusiveContent,
  SanctuaryCreatorConfig,
} from '../types';

// ── TIERS ─────────────────────────────────────────────────────────────────────

export const saveSanctuaryTier = async (tier: Omit<SanctuaryTier, 'id' | 'memberCount' | 'createdAt'>): Promise<string> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const ref = doc(collection(db, 'sanctuaryTiers'));
  const now = Date.now();
  const full: SanctuaryTier = {
    ...tier,
    id: ref.id,
    creatorId: auth.currentUser.uid,
    memberCount: 0,
    createdAt: now,
  };
  await setDoc(ref, full);
  return ref.id;
};

export const updateSanctuaryTier = async (tierId: string, updates: Partial<SanctuaryTier>): Promise<void> => {
  await updateDoc(doc(db, 'sanctuaryTiers', tierId), updates);
};

export const deleteSanctuaryTier = async (tierId: string): Promise<void> => {
  await deleteDoc(doc(db, 'sanctuaryTiers', tierId));
};

export const fetchCreatorTiers = async (creatorId: string): Promise<SanctuaryTier[]> => {
  const q = query(
    collection(db, 'sanctuaryTiers'),
    where('creatorId', '==', creatorId),
    where('isActive', '==', true),
    orderBy('sortOrder', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryTier));
};

export const listenToCreatorTiers = (creatorId: string, callback: (tiers: SanctuaryTier[]) => void) => {
  const q = query(
    collection(db, 'sanctuaryTiers'),
    where('creatorId', '==', creatorId),
    orderBy('sortOrder', 'asc'),
  );
  return onSnapshot(q,
    snap => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryTier))); },
    err => console.warn('[sanctuary] tiers listener:', err.message),
  );
};

// ── MEMBERSHIPS ───────────────────────────────────────────────────────────────

export const joinSanctuaryTier = async (
  tier: SanctuaryTier,
  billingCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY',
): Promise<string> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const ref = doc(collection(db, 'sanctuaryMemberships'));
  const now = Date.now();
  const membership: SanctuaryMembership = {
    id: ref.id,
    tierId: tier.id,
    tierName: tier.name,
    tierColor: tier.color,
    creatorId: tier.creatorId,
    memberId: auth.currentUser.uid,
    memberName: auth.currentUser.displayName || 'Anonymous',
    memberPhoto: auth.currentUser.photoURL || '',
    billingCycle,
    status: 'ACTIVE',
    startedAt: now,
    renewsAt: now + (billingCycle === 'MONTHLY' ? 30 * 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000),
  };
  await setDoc(ref, membership);
  await updateDoc(doc(db, 'sanctuaryTiers', tier.id), { memberCount: increment(1) });
  return ref.id;
};

export const cancelMembership = async (membershipId: string, tierId: string): Promise<void> => {
  await updateDoc(doc(db, 'sanctuaryMemberships', membershipId), {
    status: 'CANCELLED',
    cancelledAt: Date.now(),
  });
  await updateDoc(doc(db, 'sanctuaryTiers', tierId), { memberCount: increment(-1) });
};

export const fetchMyMemberships = async (): Promise<SanctuaryMembership[]> => {
  if (!auth.currentUser) return [];
  const q = query(
    collection(db, 'sanctuaryMemberships'),
    where('memberId', '==', auth.currentUser.uid),
    where('status', '==', 'ACTIVE'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryMembership));
};

export const fetchCreatorMembers = async (creatorId: string): Promise<SanctuaryMembership[]> => {
  const q = query(
    collection(db, 'sanctuaryMemberships'),
    where('creatorId', '==', creatorId),
    where('status', '==', 'ACTIVE'),
    orderBy('startedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryMembership));
};

export const checkMembership = async (creatorId: string): Promise<SanctuaryMembership | null> => {
  if (!auth.currentUser) return null;
  const q = query(
    collection(db, 'sanctuaryMemberships'),
    where('creatorId', '==', creatorId),
    where('memberId', '==', auth.currentUser.uid),
    where('status', '==', 'ACTIVE'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as SanctuaryMembership;
};

// ── EXCLUSIVE CONTENT ─────────────────────────────────────────────────────────

export const publishExclusiveContent = async (
  content: Omit<SanctuaryExclusiveContent, 'id' | 'publishedAt' | 'likesCount' | 'commentsCount'>,
): Promise<string> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const ref = doc(collection(db, 'sanctuaryContent'));
  const now = Date.now();
  await setDoc(ref, {
    ...content,
    id: ref.id,
    publishedAt: now,
    likesCount: 0,
    commentsCount: 0,
  });
  return ref.id;
};

export const fetchCreatorExclusiveContent = async (creatorId: string): Promise<SanctuaryExclusiveContent[]> => {
  const q = query(
    collection(db, 'sanctuaryContent'),
    where('creatorId', '==', creatorId),
    orderBy('publishedAt', 'desc'),
    limit(30),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryExclusiveContent));
};

export const listenToExclusiveContent = (creatorId: string, callback: (items: SanctuaryExclusiveContent[]) => void) => {
  const q = query(
    collection(db, 'sanctuaryContent'),
    where('creatorId', '==', creatorId),
    orderBy('publishedAt', 'desc'),
    limit(30),
  );
  return onSnapshot(q,
    snap => { callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryExclusiveContent))); },
    err => console.warn('[sanctuary] content listener:', err.message),
  );
};

export const likeExclusiveContent = async (contentId: string): Promise<void> => {
  await updateDoc(doc(db, 'sanctuaryContent', contentId), { likesCount: increment(1) });
};

export const deleteExclusiveContent = async (contentId: string): Promise<void> => {
  await deleteDoc(doc(db, 'sanctuaryContent', contentId));
};
