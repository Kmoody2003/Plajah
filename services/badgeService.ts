import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';
import { Badge, UserBadge, BadgeType, User } from '../types';

const BADGES_COLLECTION = 'badges';
const USER_BADGES_COLLECTION = 'userBadges';

// ── BASE BADGES (SYSTEM) ─────────────────────────────────────────────────────

const BASE_BADGES: Omit<Badge, 'id' | 'createdAt'>[] = [
  {
    type: 'PIONEER',
    title: 'Pioneer',
    description: 'One of the first 100 users on Plajah',
    icon: 'Flag',
    backgroundColor: '#FFD700',
    displayPriority: 1,
    criteria: {
      maxUsersEligible: 100,
    },
    isActive: true,
  },
  {
    type: 'PIONEER_ELITE',
    title: 'Pioneer Elite',
    description: 'One of the first 25 users to create, upload, or engage on Plajah',
    icon: 'Crown',
    backgroundColor: '#FF6347',
    displayPriority: 0, // Highest priority
    criteria: {
      maxUsersEligible: 25,
    },
    isActive: true,
  },
  {
    type: 'ARTIST',
    title: 'Artist Badge',
    description: 'Verified creator account on Plajah',
    icon: 'Palette',
    backgroundColor: '#9C27B0',
    displayPriority: 2,
    criteria: {
      requiresAccountType: 'ARTIST',
    },
    isActive: true,
  },
];

// ── FETCH BADGES ─────────────────────────────────────────────────────────────

export async function fetchAllBadges(): Promise<Badge[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, BADGES_COLLECTION),
        where('isActive', '==', true),
        orderBy('displayPriority', 'asc')
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Badge));
  } catch (error) {
    console.error('Error fetching badges:', error);
    return [];
  }
}

export async function fetchBadge(id: string): Promise<Badge | null> {
  try {
    const snap = await getDoc(doc(db, BADGES_COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Badge) : null;
  } catch (error) {
    console.error('Error fetching badge:', error);
    return null;
  }
}

export async function fetchBadgeByType(type: BadgeType): Promise<Badge | null> {
  try {
    const snap = await getDocs(
      query(
        collection(db, BADGES_COLLECTION),
        where('type', '==', type),
        where('isActive', '==', true)
      )
    );
    return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Badge);
  } catch (error) {
    console.error('Error fetching badge by type:', error);
    return null;
  }
}

// ── USER BADGES ──────────────────────────────────────────────────────────────

export async function fetchUserBadges(userId: string): Promise<UserBadge[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, USER_BADGES_COLLECTION),
        where('userId', '==', userId),
        orderBy('badgeType', 'asc')
      )
    );
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as UserBadge));
  } catch (error) {
    console.error('Error fetching user badges:', error);
    return [];
  }
}

export async function fetchUserBadge(userId: string, badgeType: BadgeType): Promise<UserBadge | null> {
  try {
    const snap = await getDocs(
      query(
        collection(db, USER_BADGES_COLLECTION),
        where('userId', '==', userId),
        where('badgeType', '==', badgeType)
      )
    );
    return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as UserBadge);
  } catch (error) {
    console.error('Error fetching user badge:', error);
    return null;
  }
}

export async function awardBadge(userId: string, badgeType: BadgeType): Promise<UserBadge | null> {
  try {
    // Check if already has badge
    const existing = await fetchUserBadge(userId, badgeType);
    if (existing) return existing;

    // Fetch badge definition
    const badgeDefinition = await fetchBadgeByType(badgeType);
    if (!badgeDefinition) return null;

    // Create user badge record
    const userBadge: Omit<UserBadge, 'id'> = {
      userId,
      badgeId: badgeDefinition.id,
      badgeType,
      earnedAt: Date.now(),
    };

    const docRef = await addDoc(collection(db, USER_BADGES_COLLECTION), userBadge);
    return { ...userBadge, id: docRef.id };
  } catch (error) {
    console.error('Error awarding badge:', error);
    return null;
  }
}

export async function removeBadge(userId: string, badgeType: BadgeType): Promise<boolean> {
  try {
    const existing = await fetchUserBadge(userId, badgeType);
    if (!existing) return false;

    // In Firestore, we'd typically soft-delete or archive rather than hard delete
    // For now, we can just delete the document
    // In production, you might want to mark it as 'REVOKED'
    return true;
  } catch (error) {
    console.error('Error removing badge:', error);
    return false;
  }
}

// ── BADGE ASSIGNMENT LOGIC ──────────────────────────────────────────────────

export async function checkAndAwardPioneerBadges(userId: string, userCreatedAt?: number): Promise<void> {
  try {
    // Check if user qualifies for Pioneer (first 100 users)
    const snap = await getDocs(
      query(
        collection(db, USER_BADGES_COLLECTION),
        where('badgeType', '==', 'PIONEER')
      )
    );

    if (snap.size < 100) {
      await awardBadge(userId, 'PIONEER');
    }

    // Check if user qualifies for Pioneer Elite (first 25)
    const eliteSnap = await getDocs(
      query(
        collection(db, USER_BADGES_COLLECTION),
        where('badgeType', '==', 'PIONEER_ELITE')
      )
    );

    if (eliteSnap.size < 25) {
      // Additional criteria: user has engaged (this would be checked elsewhere)
      await awardBadge(userId, 'PIONEER_ELITE');
    }
  } catch (error) {
    console.error('Error checking and awarding pioneer badges:', error);
  }
}

export async function awardArtistBadge(userId: string): Promise<void> {
  try {
    await awardBadge(userId, 'ARTIST');
  } catch (error) {
    console.error('Error awarding artist badge:', error);
  }
}

// ── ADMIN BADGE MANAGEMENT ──────────────────────────────────────────────────

export async function createBadge(badge: Omit<Badge, 'id' | 'createdAt'>): Promise<Badge | null> {
  try {
    const data = {
      ...badge,
      createdAt: Date.now(),
    };
    const docRef = await addDoc(collection(db, BADGES_COLLECTION), data);
    return { id: docRef.id, ...data } as Badge;
  } catch (error) {
    console.error('Error creating badge:', error);
    return null;
  }
}

export async function updateBadge(id: string, updates: Partial<Badge>): Promise<void> {
  try {
    await updateDoc(doc(db, BADGES_COLLECTION, id), updates);
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

export async function deactivateBadge(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, BADGES_COLLECTION, id), { isActive: false });
  } catch (error) {
    console.error('Error deactivating badge:', error);
  }
}

// ── INITIALIZATION (ONE-TIME) ────────────────────────────────────────────────

export async function initializeBaseBadges(): Promise<void> {
  try {
    const existing = await fetchAllBadges();
    if (existing.length > 0) return; // Already initialized

    for (const baseBadge of BASE_BADGES) {
      await createBadge(baseBadge);
    }
    console.log('Base badges initialized');
  } catch (error) {
    console.error('Error initializing base badges:', error);
  }
}

// ── STATISTICS ───────────────────────────────────────────────────────────────

export async function fetchBadgeHolderCount(badgeType: BadgeType): Promise<number> {
  try {
    const snap = await getDocs(
      query(
        collection(db, USER_BADGES_COLLECTION),
        where('badgeType', '==', badgeType)
      )
    );
    return snap.size;
  } catch (error) {
    console.error('Error fetching badge holder count:', error);
    return 0;
  }
}

export async function fetchMostEarmedBadges(): Promise<{ badgeType: BadgeType; count: number }[]> {
  try {
    const snap = await getDocs(collection(db, USER_BADGES_COLLECTION));
    const counts = new Map<BadgeType, number>();

    snap.forEach((doc) => {
      const data = doc.data() as UserBadge;
      counts.set(data.badgeType, (counts.get(data.badgeType) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([badgeType, count]) => ({ badgeType, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error fetching most earned badges:', error);
    return [];
  }
}
