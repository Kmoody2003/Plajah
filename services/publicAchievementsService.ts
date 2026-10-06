/**
 * publicAchievementsService — the opt-in public achievement showcase that powers ACHIEVEMENT feed cards.
 *
 *   users/{uid}.shareAchievements   boolean, default ON (undefined === on); false = nothing is published and
 *                                   anything already published is retracted. Private accounts never publish.
 *   publicAchievements/{uid}_{achievementId}   see publicAchievementsCore + the firestore.rules block.
 *
 * Call sites for the lead:
 *   - Settings toggle:  setShareAchievements(uid, on)   (surfaced in components/safety/PrivacySettings.tsx — see report)
 *   - After an unlock:  publishAchievement(uid, achievement, earnedAt)   (wired inside achievementService.unlockAchievement)
 *   - Once per session: syncPublicAchievements(uid)  — idempotent backfill of existing unlocks (throttled by `maybeSync…`)
 *
 * Everything here is best-effort and never throws into the caller.
 */

import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, limit } from 'firebase/firestore';
import { db } from './firebase';
import { fetchAllAchievements, fetchUserAchievements } from './achievementService';
import {
  isShareableAchievement, sharingEnabled, publicAchievementId, buildPublicAchievementDoc, planBackfill, type AchievementLike,
} from './publicAchievementsCore';

export * from './publicAchievementsCore';

const COL = 'publicAchievements';

async function readProfileFlags(uid: string): Promise<{ shareAchievements?: boolean; isPrivate?: boolean } | null> {
  try {
    const s = await getDoc(doc(db, 'users', uid));
    return s.exists() ? (s.data() as any) : null;
  } catch { return null; }
}

/** Publish one earned achievement (idempotent upsert). Returns true when written. */
export async function publishAchievement(uid: string, a: AchievementLike, earnedAt: number = Date.now(), knownProfile?: { shareAchievements?: boolean; isPrivate?: boolean } | null): Promise<boolean> {
  try {
    if (!uid || !isShareableAchievement(a)) return false;
    const profile = knownProfile ?? await readProfileFlags(uid);
    if (!sharingEnabled(profile)) return false;
    await setDoc(doc(db, COL, publicAchievementId(uid, a.id)), buildPublicAchievementDoc(uid, a, earnedAt));
    return true;
  } catch (e) {
    console.warn('[publicAchievements] publish failed:', (e as Error)?.message?.slice(0, 120));
    return false;
  }
}

/** Remove everything this user has published (toggle OFF). */
export async function retractPublicAchievements(uid: string): Promise<number> {
  try {
    const snap = await getDocs(query(collection(db, COL), where('userId', '==', uid), limit(200)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    return snap.size;
  } catch { return 0; }
}

/**
 * Backfill: publish the user's existing unlocks that are not yet public. Idempotent; cheap when nothing is new
 * (1 profile read, 1 unlocked query, 1 published query, 1 catalog read). Returns how many were written.
 */
export async function syncPublicAchievements(uid: string): Promise<number> {
  try {
    const profile = await readProfileFlags(uid);
    if (!sharingEnabled(profile)) return 0;
    const [unlocked, catalogList, pubSnap] = await Promise.all([
      fetchUserAchievements(uid),
      fetchAllAchievements(),
      getDocs(query(collection(db, COL), where('userId', '==', uid), limit(300))),
    ]);
    const catalog = new Map<string, AchievementLike>(catalogList.map(a => [a.id, a as unknown as AchievementLike]));
    const published = new Set<string>(pubSnap.docs.map(d => String(d.data().achievementId)));
    const todo = planBackfill(unlocked, catalog, published);
    const results = await Promise.all(todo.map(t => publishAchievement(uid, t.achievement, t.earnedAt, profile)));
    return results.filter(Boolean).length;
  } catch { return 0; }
}

/** `syncPublicAchievements` at most once per device per 24h (localStorage; silently skipped when unavailable). */
export async function maybeSyncPublicAchievements(uid: string): Promise<number> {
  const key = `plajah_pubach_sync:${uid}`;
  try {
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 24 * 3600_000) return 0;
    localStorage.setItem(key, String(Date.now()));
  } catch { /* storage unavailable — fall through and sync */ }
  return syncPublicAchievements(uid);
}

/** The settings toggle. ON also backfills; OFF retracts everything already public. */
export async function setShareAchievements(uid: string, on: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { shareAchievements: on });
  if (on) void syncPublicAchievements(uid); else void retractPublicAchievements(uid);
}
