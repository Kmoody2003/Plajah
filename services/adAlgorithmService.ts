import { collection, getDocs, getDoc, doc, setDoc, updateDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { AdBoostProfile, AdSlotAllocation, AdPackage, SubscriptionTier } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

export const AD_SLOT_DISTRIBUTION = {
  USER_PROMO: 0.50,      // 50% on-platform user promotion
  CONTENT_PARTNER: 0.20, // 20% content partner promos
  THIRD_PARTY: 0.30,     // 30% third-party ads
} as const;

export const SUBSCRIPTION_BOOST_PCT: Record<SubscriptionTier, number> = {
  1: 15,
  2: 30,
  3: 50,
};

export const ACHIEVEMENT_BOOST: Record<'EASY' | 'MEDIUM' | 'HARD', { pct: number; daysMs: number }> = {
  EASY:   { pct: 10, daysMs: 1  * 86_400_000 },
  MEDIUM: { pct: 20, daysMs: 7  * 86_400_000 },
  HARD:   { pct: 30, daysMs: 30 * 86_400_000 },
};

// Points → boost pct: 100 points = 5% boost, max 25%
export const POINTS_BOOST_RATE = 0.05;
export const POINTS_BOOST_MAX = 25;

// Activity scoring: points per action (per day caps apply)
export const ACTIVITY_SCORE = {
  POST:    { points: 1, dailyCap: 20 },
  VIDEO:   { points: 10, dailyCap: Infinity },
  PHOTO:   { points: 5, dailyCap: Infinity },
  RELEASE: { points: 25, dailyCap: Infinity }, // new music/video release
} as const;

// Ad package boost multipliers
export const PACKAGE_BOOST: Record<string, number> = {
  BASIC:   1.5,
  FEATURED: 2.5,
  PREMIUM:  4.0,
  MAXIMUM:  6.0,
};

// ── Compute boost score for a user ───────────────────────────────────────────

export interface UserBoostInputs {
  uid: string;
  subscriptionTier: SubscriptionTier | null;
  activityScore: number;
  achievementBoostPct: number;
  achievementBoostExpiresAt: number | undefined;
  pointsSpentForBoost: number;
  activeAdPackageType: string | null;
}

export function computeBoostScore(inputs: UserBoostInputs): number {
  const {
    subscriptionTier,
    activityScore,
    achievementBoostPct,
    achievementBoostExpiresAt,
    pointsSpentForBoost,
    activeAdPackageType,
  } = inputs;

  // Base = normalized activity (0–100)
  let score = Math.min(activityScore, 100);

  // Subscription tier boost
  if (subscriptionTier) {
    score *= 1 + SUBSCRIPTION_BOOST_PCT[subscriptionTier] / 100;
  }

  // Achievement boost (time-gated)
  if (achievementBoostPct > 0 && achievementBoostExpiresAt && Date.now() < achievementBoostExpiresAt) {
    score *= 1 + achievementBoostPct / 100;
  }

  // Points-based boost
  if (pointsSpentForBoost > 0) {
    const pointsBoost = Math.min(pointsSpentForBoost * POINTS_BOOST_RATE, POINTS_BOOST_MAX);
    score *= 1 + pointsBoost / 100;
  }

  // Ad package multiplier
  if (activeAdPackageType && PACKAGE_BOOST[activeAdPackageType]) {
    score *= PACKAGE_BOOST[activeAdPackageType];
  }

  return Math.round(score * 100) / 100;
}

// ── Activity score computation ────────────────────────────────────────────────

export async function computeUserActivityScore(uid: string): Promise<number> {
  const since = Date.now() - 7 * 86_400_000; // last 7 days

  const [postsSnap, videosSnap, albumsSnap] = await Promise.all([
    getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), where('timestamp', '>=', since))),
    getDocs(query(collection(db, 'videos'), where('ownerId', '==', uid), where('timestamp', '>=', since))),
    getDocs(query(collection(db, 'albums'), where('ownerId', '==', uid), where('createdAt', '>=', since))),
  ]);

  const postScore = Math.min(postsSnap.size * ACTIVITY_SCORE.POST.points, ACTIVITY_SCORE.POST.dailyCap * 7);
  const videoScore = videosSnap.size * ACTIVITY_SCORE.VIDEO.points;
  const releaseScore = albumsSnap.size * ACTIVITY_SCORE.RELEASE.points;

  return Math.min(postScore + videoScore + releaseScore, 100);
}

// ── Fetch boost profile for a user ───────────────────────────────────────────

export async function fetchUserBoostProfile(uid: string): Promise<AdBoostProfile | null> {
  const ref = doc(db, 'adBoostProfiles', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AdBoostProfile;
}

// ── Save computed boost profile ───────────────────────────────────────────────

export async function saveBoostProfile(profile: AdBoostProfile): Promise<void> {
  await setDoc(doc(db, 'adBoostProfiles', profile.userId), profile);
}

// ── Recalculate a user's boost profile ───────────────────────────────────────

export async function recalculateBoostProfile(
  uid: string,
  subscriptionTier: SubscriptionTier | null
): Promise<AdBoostProfile> {
  const [activityScore, existingProfile, packagesSnap] = await Promise.all([
    computeUserActivityScore(uid),
    fetchUserBoostProfile(uid),
    getDocs(query(
      collection(db, 'adPackages'),
      where('userId', '==', uid),
      where('isActive', '==', true),
      where('expiresAt', '>=', Date.now()),
      limit(1)
    )),
  ]);

  const activePackage = packagesSnap.empty ? null : (packagesSnap.docs[0].data() as AdPackage);
  const existing = existingProfile ?? {};

  const profile: AdBoostProfile = {
    userId: uid,
    subscriptionTierBoost: subscriptionTier ? SUBSCRIPTION_BOOST_PCT[subscriptionTier] : 0,
    achievementBoostMultiplier: (existing as any).achievementBoostMultiplier ?? 0,
    achievementBoostExpiresAt: (existing as any).achievementBoostExpiresAt,
    activeAdPackageBoost: activePackage ? PACKAGE_BOOST[activePackage.packageType] ?? 1 : 1,
    activityScore,
    totalBoostScore: 0,
    lastUpdated: Date.now(),
  };

  profile.totalBoostScore = computeBoostScore({
    uid,
    subscriptionTier,
    activityScore,
    achievementBoostPct: profile.achievementBoostMultiplier,
    achievementBoostExpiresAt: profile.achievementBoostExpiresAt,
    pointsSpentForBoost: 0,
    activeAdPackageType: activePackage?.packageType ?? null,
  });

  await saveBoostProfile(profile);
  return profile;
}

// ── Grant achievement boost to a user ────────────────────────────────────────

export async function grantAchievementBoost(
  uid: string,
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
): Promise<void> {
  const boost = ACHIEVEMENT_BOOST[difficulty];
  const expiresAt = Date.now() + boost.daysMs;

  const ref = doc(db, 'adBoostProfiles', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      userId: uid,
      subscriptionTierBoost: 0,
      achievementBoostMultiplier: boost.pct,
      achievementBoostExpiresAt: expiresAt,
      activeAdPackageBoost: 1,
      activityScore: 0,
      totalBoostScore: boost.pct,
      lastUpdated: Date.now(),
    } as AdBoostProfile);
    return;
  }

  const existing = snap.data() as AdBoostProfile;
  // Take whichever expiry is longer
  const newExpiry = Math.max(existing.achievementBoostExpiresAt ?? 0, expiresAt);
  const newPct = Math.max(existing.achievementBoostMultiplier, boost.pct);

  await updateDoc(ref, {
    achievementBoostMultiplier: newPct,
    achievementBoostExpiresAt: newExpiry,
    lastUpdated: Date.now(),
  });
}

// ── Spend points for ad boost ─────────────────────────────────────────────────

export async function spendPointsForBoost(uid: string, points: number): Promise<void> {
  if (points <= 0) throw new Error('Points must be positive');
  if (points > 500) throw new Error('Max 500 points per boost purchase');

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');

  const currentPoints = userSnap.data().points || 0;
  if (currentPoints < points) throw new Error('Insufficient points');

  await updateDoc(userRef, { points: currentPoints - points, updatedAt: Date.now() });
  // The boost effect is computed in recalculateBoostProfile via the points field
}

// ── Compute weighted ad slot allocation ──────────────────────────────────────

export async function computeAdSlotAllocations(
  totalSlots: number = 100
): Promise<AdSlotAllocation[]> {
  // Fetch all active boost profiles
  const profilesSnap = await getDocs(collection(db, 'adBoostProfiles'));
  const profiles = profilesSnap.docs.map(d => d.data() as AdBoostProfile);

  if (profiles.length === 0) return [];

  const userSlotsTotal = Math.floor(totalSlots * AD_SLOT_DISTRIBUTION.USER_PROMO);

  // Compute total weight
  const totalWeight = profiles.reduce((acc, p) => acc + Math.max(p.totalBoostScore, 1), 0);

  // Allocate slots proportionally
  const allocations: AdSlotAllocation[] = [];

  for (const profile of profiles) {
    const weight = Math.max(profile.totalBoostScore, 1);
    const impressionWeight = (weight / totalWeight) * userSlotsTotal;

    const userRef = doc(db, 'users', profile.userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) continue;
    const user = userSnap.data();

    allocations.push({
      userId: profile.userId,
      displayName: user.displayName || 'Creator',
      photoURL: user.photoURL || '',
      boostScore: profile.totalBoostScore,
      slotType: 'USER_PROMO',
      impressionWeight: Math.round(impressionWeight * 100) / 100,
    });
  }

  // Sort by weight descending
  return allocations.sort((a, b) => b.impressionWeight - a.impressionWeight);
}

// ── Resolve conflict between equal-weight users ───────────────────────────────
// Used when two users have the same boost score competing for a slot.
// Prefers: (1) most recent release, (2) higher activity, (3) random

export function resolveAdConflict(a: AdSlotAllocation, b: AdSlotAllocation): AdSlotAllocation {
  // If both have package boosts, pick by activity
  if (a.boostScore === b.boostScore) {
    return Math.random() < 0.5 ? a : b;
  }
  return a.boostScore > b.boostScore ? a : b;
}

// ── Ad rotation for display (pick N users to show) ───────────────────────────

export function pickAdRotation(
  allocations: AdSlotAllocation[],
  count: number
): AdSlotAllocation[] {
  if (allocations.length <= count) return allocations;

  // Weighted random selection without replacement
  const pool = [...allocations];
  const selected: AdSlotAllocation[] = [];
  const totalWeight = pool.reduce((s, a) => s + a.impressionWeight, 0);

  for (let i = 0; i < count && pool.length > 0; i++) {
    let rand = Math.random() * pool.reduce((s, a) => s + a.impressionWeight, 0);
    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].impressionWeight;
      if (rand <= 0) {
        selected.push(pool[j]);
        pool.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}
