import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, addDoc, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './firebase';
import type {
  SanctuaryTier, SanctuaryMembership, SanctuaryExclusiveContent,
  SanctuaryCreatorConfig, Sanctuary, SanctuaryPost, SanctuaryPurchase,
  SanctuaryGate, SanctuaryAccessType, SanctuaryChatMessage,
  SanctuaryGalleryItem, SanctuaryEvent, SanctuaryPledge,
} from '../types';

const stripUndefined = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ── TIERS ─────────────────────────────────────────────────────────────────────

export const saveSanctuaryTier = async (tier: Omit<SanctuaryTier, 'id' | 'memberCount' | 'createdAt'>): Promise<string> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const ref = doc(collection(db, 'sanctuaryTiers'));
  const now = Date.now();
  const full: SanctuaryTier = {
    ...tier,
    id: ref.id,
    // Honor an explicit creatorId (org-owned sanctuaries) — falls back to the user.
    creatorId: tier.creatorId || auth.currentUser.uid,
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

// ── SANCTUARY IDENTITY (one per account; doc id == ownerId) ─────────────────────

export const fetchSanctuary = async (ownerId: string): Promise<Sanctuary | null> => {
  const snap = await getDoc(doc(db, 'sanctuaries', ownerId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Sanctuary) : null;
};

export const listenToSanctuary = (ownerId: string, callback: (s: Sanctuary | null) => void) =>
  onSnapshot(doc(db, 'sanctuaries', ownerId),
    snap => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Sanctuary) : null),
    err => console.warn('[sanctuary] identity listener:', err.message),
  );

/** Create or update the caller's Sanctuary. Doc id is the owner id so every
 *  account has at most one — a standard, discoverable space. */
export const createOrUpdateSanctuary = async (
  data: Partial<Sanctuary> & { ownerId?: string },
): Promise<Sanctuary> => {
  if (!auth.currentUser) throw new Error('Not authenticated');
  const ownerId = data.ownerId || auth.currentUser.uid;
  const ref = doc(db, 'sanctuaries', ownerId);
  const existing = await getDoc(ref);
  const now = Date.now();
  if (existing.exists()) {
    const updates = stripUndefined({ ...data, id: ownerId, ownerId, updatedAt: now });
    await updateDoc(ref, updates);
    return { ...(existing.data() as Sanctuary), ...updates } as Sanctuary;
  }
  const full: Sanctuary = stripUndefined({
    id: ownerId,
    ownerId,
    ownerType: data.ownerType || 'USER',
    ownerName: data.ownerName || auth.currentUser.displayName || 'Creator',
    ownerPhoto: data.ownerPhoto || auth.currentUser.photoURL || '',
    name: data.name || `${auth.currentUser.displayName || 'My'} Sanctuary`,
    handle: data.handle,
    tagline: data.tagline,
    about: data.about,
    bannerUrl: data.bannerUrl,
    avatarUrl: data.avatarUrl,
    accentColor: data.accentColor,
    visibility: data.visibility || 'PUBLIC',
    accessModel: data.accessModel || 'MIXED',
    welcomeMessage: data.welcomeMessage,
    campaign: data.campaign,
    memberCount: 0,
    contentCount: 0,
    isEnabled: data.isEnabled ?? true,
    createdAt: now,
    updatedAt: now,
  }) as Sanctuary;
  await setDoc(ref, full);
  return full;
};

/** The sanctuaries a user owns. One-per-account today, so this returns [it] or []. */
export const fetchUserSanctuaries = async (uid: string): Promise<Sanctuary[]> => {
  const s = await fetchSanctuary(uid);
  return s ? [s] : [];
};

/** Public sanctuaries for the discovery hub. */
export const fetchPublicSanctuaries = async (max = 40): Promise<Sanctuary[]> => {
  try {
    const q = query(
      collection(db, 'sanctuaries'),
      where('visibility', '==', 'PUBLIC'),
      where('isEnabled', '==', true),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Sanctuary));
  } catch (e) {
    console.warn('[sanctuary] fetchPublicSanctuaries:', (e as Error).message);
    return [];
  }
};

// ── SANCTUARY FEED (gated posts) ────────────────────────────────────────────────

export const createSanctuaryPost = async (
  post: Partial<SanctuaryPost> & { sanctuaryId: string },
): Promise<SanctuaryPost | null> => {
  if (!auth.currentUser) return null;
  const ref = doc(collection(db, 'sanctuaryPosts'));
  const full: SanctuaryPost = stripUndefined({
    id: ref.id,
    sanctuaryId: post.sanctuaryId,
    authorId: auth.currentUser.uid,
    authorName: auth.currentUser.displayName || 'Creator',
    authorPhoto: auth.currentUser.photoURL || '',
    content: post.content || '',
    attachments: post.attachments,
    accessType: post.accessType || 'TIER',
    requiredTierIds: post.requiredTierIds,
    oneTimePrice: post.oneTimePrice,
    isPinned: post.isPinned ?? false,
    likes: [],
    commentCount: 0,
    timestamp: Date.now(),
  }) as SanctuaryPost;
  await setDoc(ref, full);
  return full;
};

export const listenToSanctuaryPosts = (sanctuaryId: string, callback: (posts: SanctuaryPost[]) => void) => {
  const q = query(collection(db, 'sanctuaryPosts'), where('sanctuaryId', '==', sanctuaryId), limit(100));
  return onSnapshot(q,
    snap => {
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryPost));
      posts.sort((a, b) => ((b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0)) || (b.timestamp - a.timestamp));
      callback(posts);
    },
    err => console.warn('[sanctuary] posts listener:', err.message),
  );
};

export const deleteSanctuaryPost = async (postId: string): Promise<void> => {
  await deleteDoc(doc(db, 'sanctuaryPosts', postId));
};

export const likeSanctuaryPost = async (postId: string, liked: boolean): Promise<void> => {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'sanctuaryPosts', postId), {
    likes: liked ? arrayUnion(auth.currentUser.uid) : arrayRemove(auth.currentUser.uid),
  });
};

// ── À LA CARTE (one-time unlocks of a single item) ──────────────────────────────

export const unlockContent = async (
  sanctuaryId: string, itemId: string, amount: number,
  itemType: 'CONTENT' | 'POST' | 'CHAT' = 'CONTENT',
): Promise<SanctuaryPurchase | null> => {
  if (!auth.currentUser) return null;
  const ref = doc(collection(db, 'sanctuaryPurchases'));
  const purchase: SanctuaryPurchase = {
    id: ref.id,
    sanctuaryId,
    buyerId: auth.currentUser.uid,
    itemId,
    itemType,
    amount,
    purchasedAt: Date.now(),
  };
  await setDoc(ref, purchase);
  return purchase;
};

export const fetchMyPurchases = async (sanctuaryId?: string): Promise<SanctuaryPurchase[]> => {
  if (!auth.currentUser) return [];
  const clauses = [where('buyerId', '==', auth.currentUser.uid)];
  if (sanctuaryId) clauses.push(where('sanctuaryId', '==', sanctuaryId));
  const snap = await getDocs(query(collection(db, 'sanctuaryPurchases'), ...clauses));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryPurchase));
};

// ── GALLERY (gated media wall) ──────────────────────────────────────────────────

export const addSanctuaryGalleryItem = async (
  item: Partial<SanctuaryGalleryItem> & { sanctuaryId: string; url: string; type: SanctuaryGalleryItem['type'] },
): Promise<SanctuaryGalleryItem | null> => {
  if (!auth.currentUser) return null;
  const ref = doc(collection(db, 'sanctuaryGallery'));
  const full: SanctuaryGalleryItem = stripUndefined({
    id: ref.id,
    sanctuaryId: item.sanctuaryId,
    uploaderId: auth.currentUser.uid,
    uploaderName: auth.currentUser.displayName || 'Creator',
    type: item.type,
    url: item.url,
    thumbnailUrl: item.thumbnailUrl,
    title: item.title,
    accessType: item.accessType || 'TIER',
    requiredTierIds: item.requiredTierIds,
    oneTimePrice: item.oneTimePrice,
    timestamp: Date.now(),
  }) as SanctuaryGalleryItem;
  await setDoc(ref, full);
  return full;
};

export const listenToSanctuaryGallery = (sanctuaryId: string, callback: (items: SanctuaryGalleryItem[]) => void) => {
  const q = query(collection(db, 'sanctuaryGallery'), where('sanctuaryId', '==', sanctuaryId), limit(100));
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryGalleryItem)).sort((a, b) => b.timestamp - a.timestamp)),
    err => console.warn('[sanctuary] gallery listener:', err.message),
  );
};

export const deleteSanctuaryGalleryItem = async (itemId: string): Promise<void> => {
  await deleteDoc(doc(db, 'sanctuaryGallery', itemId));
};

// ── EVENTS (scheduled member sessions) ──────────────────────────────────────────

export const createSanctuaryEvent = async (
  ev: Partial<SanctuaryEvent> & { sanctuaryId: string; title: string; scheduledAt: number },
): Promise<SanctuaryEvent | null> => {
  if (!auth.currentUser) return null;
  const ref = doc(collection(db, 'sanctuaryEvents'));
  const full: SanctuaryEvent = stripUndefined({
    id: ref.id,
    sanctuaryId: ev.sanctuaryId,
    hostId: auth.currentUser.uid,
    title: ev.title,
    description: ev.description,
    type: ev.type || 'LIVESTREAM',
    scheduledAt: ev.scheduledAt,
    accessType: ev.accessType || 'TIER',
    requiredTierIds: ev.requiredTierIds,
    attendeeIds: [],
    isLive: false,
    timestamp: Date.now(),
  }) as SanctuaryEvent;
  await setDoc(ref, full);
  return full;
};

export const listenToSanctuaryEvents = (sanctuaryId: string, callback: (events: SanctuaryEvent[]) => void) => {
  const q = query(collection(db, 'sanctuaryEvents'), where('sanctuaryId', '==', sanctuaryId), limit(50));
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryEvent)).sort((a, b) => a.scheduledAt - b.scheduledAt)),
    err => console.warn('[sanctuary] events listener:', err.message),
  );
};

export const rsvpSanctuaryEvent = async (eventId: string, attending: boolean): Promise<void> => {
  if (!auth.currentUser) return;
  await updateDoc(doc(db, 'sanctuaryEvents', eventId), {
    attendeeIds: attending ? arrayUnion(auth.currentUser.uid) : arrayRemove(auth.currentUser.uid),
  });
};

export const deleteSanctuaryEvent = async (eventId: string): Promise<void> => {
  await deleteDoc(doc(db, 'sanctuaryEvents', eventId));
};

// ── MEMBER CHAT (open lounge or à la carte paid channel) ────────────────────────

export const sendSanctuaryChat = async (
  sanctuaryId: string, content: string, channelId?: string,
): Promise<void> => {
  if (!auth.currentUser || !content.trim()) return;
  const ref = doc(collection(db, 'sanctuaryChat'));
  const msg: SanctuaryChatMessage = stripUndefined({
    id: ref.id,
    sanctuaryId,
    channelId,
    senderId: auth.currentUser.uid,
    senderName: auth.currentUser.displayName || 'Member',
    senderPhoto: auth.currentUser.photoURL || '',
    content: content.trim(),
    timestamp: Date.now(),
  }) as SanctuaryChatMessage;
  await setDoc(ref, msg);
};

export const listenToSanctuaryChat = (
  sanctuaryId: string, callback: (msgs: SanctuaryChatMessage[]) => void, channelId?: string,
) => {
  const q = query(collection(db, 'sanctuaryChat'), where('sanctuaryId', '==', sanctuaryId), limit(200));
  return onSnapshot(q,
    snap => {
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as SanctuaryChatMessage))
        .filter(m => (channelId ? m.channelId === channelId : !m.channelId))
        .sort((a, b) => a.timestamp - b.timestamp);
      callback(msgs);
    },
    err => console.warn('[sanctuary] chat listener:', err.message),
  );
};

// ── CROWDFUNDING CAMPAIGN (Kickstarter / GoFundMe) ──────────────────────────────

export const contributeToCampaign = async (sanctuaryId: string, amount: number): Promise<void> => {
  if (!auth.currentUser || amount <= 0) return;
  await updateDoc(doc(db, 'sanctuaries', sanctuaryId), {
    'campaign.raisedAmount': increment(amount),
    'campaign.backerCount': increment(1),
    updatedAt: Date.now(),
  });
};

// Real Stripe pledges are recorded server-side (webhook); the campaign's live
// totals are summed from them so the banner reflects money actually collected.
export const listenToSanctuaryPledges = (sanctuaryId: string, callback: (pledges: SanctuaryPledge[]) => void) => {
  const q = query(collection(db, 'sanctuaryPledges'), where('sanctuaryId', '==', sanctuaryId), limit(500));
  return onSnapshot(q,
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as SanctuaryPledge))),
    err => console.warn('[sanctuary] pledges listener:', err.message),
  );
};

// ── ACCESS CHECK (pure; usable anywhere a gate applies) ─────────────────────────

interface AccessCtx {
  isOwner?: boolean;
  membership?: SanctuaryMembership | null;   // the viewer's active membership in this sanctuary
  purchasedItemIds?: Set<string> | string[]; // items the viewer already unlocked à la carte
}

/** Does the viewer have access to a gated item? Owners always do; otherwise it
 *  depends on the access type: FREE → yes, TIER → active membership in a required
 *  tier, ONE_TIME → a recorded purchase of this item. */
export const hasAccess = (
  gate: { accessType?: SanctuaryAccessType; requiredTierIds?: string[]; isPublicPreview?: boolean },
  itemId: string,
  ctx: AccessCtx = {},
): boolean => {
  if (ctx.isOwner) return true;
  const type = gate.accessType || (gate.isPublicPreview ? 'FREE' : 'TIER');
  if (type === 'FREE' || gate.isPublicPreview) return true;
  if (type === 'ONE_TIME') {
    const owned = ctx.purchasedItemIds instanceof Set
      ? ctx.purchasedItemIds
      : new Set(ctx.purchasedItemIds || []);
    return owned.has(itemId);
  }
  // TIER
  if (!ctx.membership || ctx.membership.status !== 'ACTIVE') return false;
  const required = gate.requiredTierIds || [];
  return required.length === 0 || required.includes(ctx.membership.tierId);
};

/** Convenience for a portable SanctuaryGate carried by any platform asset. */
export const hasSanctuaryAccess = (gate: SanctuaryGate, itemId: string, ctx: AccessCtx = {}): boolean =>
  hasAccess({ accessType: gate.accessType, requiredTierIds: gate.requiredTierIds }, itemId, ctx);

/** Resolve a gate for the current viewer by fetching their membership + purchases
 *  in the gate's sanctuary. Use for gated content that lives anywhere on the
 *  platform (a track, a film, a post) — not just inside the sanctuary view. */
export const resolveGateAccess = async (gate: SanctuaryGate, itemId: string): Promise<boolean> => {
  if (gate.accessType === 'FREE') return true;
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  if (uid === gate.sanctuaryId) return true; // the owner
  const [membership, purchases] = await Promise.all([
    checkMembership(gate.sanctuaryId).catch(() => null),
    fetchMyPurchases(gate.sanctuaryId).catch(() => []),
  ]);
  return hasSanctuaryAccess(gate, itemId, {
    membership,
    purchasedItemIds: new Set(purchases.map(p => p.itemId)),
  });
};
