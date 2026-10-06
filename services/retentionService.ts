/**
 * retentionService — fetchers + writers for gentle retention features.
 * The math is pure and tested in services/postingLogic.ts.
 *
 *  - Streak:      users/{uid}/retention/state.activeDays (YYYY-MM-DD, cap 120)
 *  - Milestones:  users/{uid}/retention/state.achieved   (ids shown once)
 *  - Weekly recap: computed on demand from follows + posts (no stored copy)
 *  - Digest:      one in-app notification per user per 7 days, guarded by
 *                 users/{uid}.lastDigestAt. createNotification also fires
 *                 sendPushToUser (push-first), so the digest is delivered as
 *                 push too. Client-triggered: runs when the user opens the app.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { createNotification, createPost } from './backendService';
import type { Post } from '../types';
import {
  computeStreak, recordActiveDay, dayKey, detectMilestones, buildWeeklyRecap, digestDue, stripUndefined,
  WEEK_MS, type StreakInfo, type MilestoneDef, type WeeklyRecap,
} from './postingLogic';

const ms = (v: any): number => (typeof v === 'number' ? v : typeof v?.toMillis === 'function' ? v.toMillis() : 0);
const stateRef = (uid: string) => doc(db, 'users', uid, 'retention', 'state');

interface RetentionState { activeDays?: string[]; achieved?: string[] }

async function readState(uid: string): Promise<RetentionState> {
  try { const s = await getDoc(stateRef(uid)); return s.exists() ? (s.data() as RetentionState) : {}; } catch { return {}; }
}

// ── Streak ───────────────────────────────────────────────────────────────────

/** Record today as active (one write per day at most) and return the streak. */
export async function touchStreak(uid: string, now = Date.now()): Promise<StreakInfo> {
  const today = dayKey(now);
  const st = await readState(uid);
  let days = st.activeDays || [];
  if (!days.includes(today)) {
    days = recordActiveDay(days, today);
    setDoc(stateRef(uid), { activeDays: days }, { merge: true }).catch(() => {});
  }
  return computeStreak(days, today);
}

// ── Milestones ───────────────────────────────────────────────────────────────

/** Milestones the user has reached but not yet been shown. */
export async function fetchPendingMilestones(uid: string): Promise<MilestoneDef[]> {
  try {
    const [st, userSnap, postsSnap] = await Promise.all([
      readState(uid),
      getDoc(doc(db, 'users', uid)),
      getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(100))),
    ]);
    const posts = postsSnap.docs.map(d => d.data() as any);
    return detectMilestones({
      postCount: posts.length,
      followerCount: Number((userSnap.data() as any)?.followerCount) || 0,
      topPostLikes: posts.reduce((m, p) => Math.max(m, Number(p.likesCount) || 0), 0),
    }, st.achieved || []);
  } catch { return []; }
}

/** Mark milestones as shown so they never reappear. */
export async function acknowledgeMilestones(uid: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const st = await readState(uid);
  const achieved = [...new Set([...(st.achieved || []), ...ids])];
  await setDoc(stateRef(uid), { achieved }, { merge: true }).catch(() => {});
}

/** Optional "share it" action for <MilestoneCard>: posts a short celebratory note. */
export async function postMilestone(def: MilestoneDef): Promise<string | undefined> {
  return createPost({ text: `${def.emoji} ${def.title}. ${def.body}` } as Partial<Post>);
}

// ── Weekly recap ─────────────────────────────────────────────────────────────

/**
 * "Your circle this week". Four cheap reads: followers (by followingId),
 * following ids (by followerId), own recent posts, and the last 7 days of
 * posts (<=150) filtered client-side to people you follow. `hidden` = uids to
 * exclude (blocked/muted; pass useSocialSafety().hidden when available).
 */
export async function fetchWeeklyRecap(uid: string, hidden?: { has(uid: string): boolean }, now = Date.now()): Promise<WeeklyRecap> {
  const since = now - WEEK_MS;
  const [followersSnap, followingSnap, ownSnap, recentSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followingId', '==', uid), limit(300))),
    getDocs(query(collection(db, 'follows'), where('followerId', '==', uid), limit(300))),
    getDocs(query(collection(db, 'posts'), where('authorId', '==', uid), orderBy('timestamp', 'desc'), limit(50))),
    getDocs(query(collection(db, 'posts'), where('timestamp', '>=', since), orderBy('timestamp', 'desc'), limit(150))),
  ]);
  const toPost = (d: any) => ({ id: d.id, ...d.data(), timestamp: ms(d.data().timestamp) });
  return buildWeeklyRecap({
    now, viewerUid: uid,
    followerTimestamps: followersSnap.docs.map(d => ({ followerId: String((d.data() as any).followerId), at: ms((d.data() as any).timestamp) })),
    ownPosts: ownSnap.docs.map(toPost),
    recentPosts: recentSnap.docs.map(toPost),
    followingIds: new Set(followingSnap.docs.map(d => String((d.data() as any).followingId))),
    hidden,
  });
}

/**
 * Send the weekly in-app digest (and push) at most once per 7 days per user.
 * Claims the slot FIRST (lastDigestAt) so concurrent tabs can't double-send.
 * Skips (without consuming the slot) when there is nothing worth saying.
 * Returns true if a digest notification was created.
 */
export async function maybeSendWeeklyDigest(uid: string, displayName: string, photo: string, recap?: WeeklyRecap, now = Date.now()): Promise<boolean> {
  try {
    const uRef = doc(db, 'users', uid);
    const last = ms((await getDoc(uRef)).data()?.lastDigestAt);
    if (!digestDue(last, now)) return false;
    const r = recap ?? await fetchWeeklyRecap(uid, undefined, now);
    if (!r.hasContent) return false;
    await updateDoc(uRef, { lastDigestAt: now });
    const bits: string[] = [];
    if (r.newFollowerCount) bits.push(`${r.newFollowerCount} new follower${r.newFollowerCount === 1 ? '' : 's'}`);
    if (r.repliesReceived) bits.push(`${r.repliesReceived} repl${r.repliesReceived === 1 ? 'y' : 'ies'}`);
    if (r.missed.length) bits.push(`${r.missed.length} post${r.missed.length === 1 ? '' : 's'} you may have missed`);
    await createNotification(stripUndefined({
      userId: uid, senderId: uid, senderName: displayName || 'Plajah', senderPhoto: photo || '',
      type: 'SYSTEM' as const,
      title: 'Your circle this week',
      message: bits.length ? bits.join(' · ') : `${r.likesReceived} likes on your posts this week`,
      link: 'FEED',
    }));
    return true;
  } catch { return false; }
}
