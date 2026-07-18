/**
 * "Today" posts — 24h ephemeral clips on the creator's channel ring.
 *
 * Blueprint Part 1B.4: *"Stories-adjacent: 'Today' posts — 24h ephemeral clips on
 * the creator channel ring. Reuse `Post` + a TTL field; don't build a separate system."*
 *
 * So this file deliberately owns **no collection of its own**. A Today is an ordinary
 * document in `posts`, created through the ordinary `createPost` path (which keeps the
 * dual `posts`/`feed` write, follower notifications, org-identity handling and safety
 * plumbing), carrying two extra fields from `types.ts`:
 *
 *   isToday:   true
 *   expiresAt: Date.now() + 24h
 *
 * Expiry is enforced **client-side** on read (`expiresAt > Date.now()`). Firestore has
 * no query-time TTL, and its native TTL policy deletes lazily (up to ~24h late), so the
 * guard here is what users actually experience. A TTL policy on `posts.expiresAt` is a
 * fine storage-reclamation backstop but is not required for correctness.
 */

import { collection, query, where, limit as fsLimit, getDocs } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db } from './firebase';
import { createPost } from './backendService';
import type { Post } from '../types';

/** A Today lives for exactly 24 hours from creation. */
export const TODAY_TTL_MS = 24 * 60 * 60 * 1000;

/** Read window. Todays are by definition recent, so a small cap is plenty. */
const TODAY_FETCH_LIMIT = 120;

/** Firestore rejects `undefined` field values — strip them before every write. */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Timestamps are written as numbers by `createPost`, but older/mirrored docs may carry a
 * Firestore Timestamp. Normalise without importing backendService's private helper.
 */
function toMillis(value: any): number {
  if (typeof value === 'number') return value;
  if (value && typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch { return 0; }
  }
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function mapPost(id: string, data: any): Post {
  return {
    ...data,
    id,
    sourceCollection: 'posts',
    timestamp: toMillis(data?.timestamp),
  } as Post;
}

// ── Predicates & guards ──────────────────────────────────────────────────────

/**
 * True when `post` is a Today that has not yet expired.
 *
 * Degrades silently on partial data: a Today written before `expiresAt` existed is
 * treated as expiring 24h after its timestamp rather than living forever.
 */
export function isActiveToday(post: Post | null | undefined, now: number = Date.now()): boolean {
  if (!post?.isToday) return false;
  const expiry = typeof post.expiresAt === 'number'
    ? post.expiresAt
    : (post.timestamp ? post.timestamp + TODAY_TTL_MS : 0);
  return expiry > now;
}

/** True when `post` is a Today whose 24h window has closed. */
export function isExpiredToday(post: Post | null | undefined, now: number = Date.now()): boolean {
  return !!post?.isToday && !isActiveToday(post, now);
}

/**
 * The feed guard. Drops expired Todays and leaves every ordinary post untouched.
 * Cheap enough to call on every render; returns the original array when nothing
 * is filtered so referential equality (and memoisation downstream) is preserved.
 */
export function withoutExpiredTodays<T extends Post>(posts: T[], now: number = Date.now()): T[] {
  if (!posts?.length) return posts;
  const kept = posts.filter(p => !p.isToday || isActiveToday(p, now));
  return kept.length === posts.length ? posts : kept;
}

/** Milliseconds left before a Today disappears (0 once expired). */
export function todayTimeLeftMs(post: Post | null | undefined, now: number = Date.now()): number {
  if (!post?.isToday) return 0;
  const expiry = typeof post.expiresAt === 'number'
    ? post.expiresAt
    : (post.timestamp ? post.timestamp + TODAY_TTL_MS : 0);
  return Math.max(0, expiry - now);
}

/** Compact countdown for the expiry chip: "23h left" · "47m left" · "Gone". */
export function formatTodayCountdown(post: Post | null | undefined, now: number = Date.now()): string {
  const ms = todayTimeLeftMs(post, now);
  if (ms <= 0) return 'Gone';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m left';
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h left`;
}

/** 0 → 1 fraction of the 24h window already elapsed (for a ring/progress arc). */
export function todayProgress(post: Post | null | undefined, now: number = Date.now()): number {
  if (!post?.isToday) return 0;
  const left = todayTimeLeftMs(post, now);
  return Math.min(1, Math.max(0, 1 - left / TODAY_TTL_MS));
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateTodayInput {
  text?: string;
  media?: Post['media'];
  tags?: string[];
  /** Post "as" an organization the user runs — forwarded to createPost verbatim. */
  authorOrgId?: string;
  contentLabels?: Post['contentLabels'];
}

/**
 * Publish a Today. Returns the new post id, or `undefined` if the write failed or
 * there is no signed-in user (matching `createPost`'s contract).
 */
export async function createTodayPost(input: CreateTodayInput): Promise<string | undefined> {
  const now = Date.now();
  const payload = stripUndefined({
    text: input.text?.trim() || '',
    isToday: true,
    expiresAt: now + TODAY_TTL_MS,
    isPublic: true,
    media: input.media?.length ? input.media : undefined,
    tags: input.tags?.length ? input.tags : undefined,
    authorOrgId: input.authorOrgId || undefined,
    contentLabels: input.contentLabels?.length ? input.contentLabels : undefined,
  });
  return createPost(payload as Partial<Post>);
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * All currently-live Todays, newest first.
 *
 * Deliberately a **single-field** equality query (`isToday == true`) with no `orderBy`
 * and no second `where` — that needs no composite index. Author filtering, expiry and
 * ordering all happen client-side over a small result set.
 */
export async function fetchActiveTodayPosts(authorId?: string): Promise<Post[]> {
  try {
    const snap = await getDocs(query(
      collection(db, 'posts'),
      where('isToday', '==', true),
      fsLimit(TODAY_FETCH_LIMIT),
    ));
    const now = Date.now();
    return snap.docs
      .map(d => mapPost(d.id, d.data()))
      .filter(p => isActiveToday(p, now))
      .filter(p => !authorId || p.authorId === authorId)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.warn('[todayPosts] fetchActiveTodayPosts failed:', (e as Error)?.message?.slice(0, 200));
    return [];
  }
}

/**
 * Realtime variant. Same index-free query; re-filters on every snapshot so a Today
 * that ages out mid-session stops being delivered.
 */
export function listenToActiveTodayPosts(
  callback: (posts: Post[]) => void,
  authorId?: string,
): () => void {
  try {
    return onSnapshot(
      query(collection(db, 'posts'), where('isToday', '==', true), fsLimit(TODAY_FETCH_LIMIT)),
      snap => {
        const now = Date.now();
        callback(
          snap.docs
            .map(d => mapPost(d.id, d.data()))
            .filter(p => isActiveToday(p, now))
            .filter(p => !authorId || p.authorId === authorId)
            .sort((a, b) => b.timestamp - a.timestamp),
        );
      },
      e => {
        console.warn('[todayPosts] listen failed:', (e as Error)?.message?.slice(0, 200));
        callback([]);
      },
    );
  } catch {
    return () => {};
  }
}

export interface TodayRing {
  authorId: string;
  authorName: string;
  authorPhoto: string;
  posts: Post[];
  /** Newest Today's timestamp — ring ordering. */
  latest: number;
}

/**
 * Group live Todays into per-creator rings (newest creator first, newest post first
 * within a ring) — the shape a channel-ring / stories-bar UI wants.
 */
export function groupTodaysIntoRings(posts: Post[], now: number = Date.now()): TodayRing[] {
  const byAuthor = new Map<string, TodayRing>();
  for (const p of posts) {
    if (!isActiveToday(p, now)) continue;
    const existing = byAuthor.get(p.authorId);
    if (existing) {
      existing.posts.push(p);
      existing.latest = Math.max(existing.latest, p.timestamp);
    } else {
      byAuthor.set(p.authorId, {
        authorId: p.authorId,
        authorName: p.authorName,
        authorPhoto: p.authorPhoto,
        posts: [p],
        latest: p.timestamp,
      });
    }
  }
  const rings = Array.from(byAuthor.values());
  for (const r of rings) r.posts.sort((a, b) => b.timestamp - a.timestamp);
  return rings.sort((a, b) => b.latest - a.latest);
}
