/**
 * hashtagService — hashtag feeds, trending, autocomplete and the rollup docs.
 *
 * Data:
 *  - posts.hashtags: string[]            (written by the composer at create)
 *  - hashtags/{tag}: { tag, count, lastUsed }  best-effort rollup (client +1)
 *
 * Trending is computed CLIENT-SIDE from the last N hours of posts (one
 * single-field range query on `timestamp`, <=300 docs, memoised 5 min per
 * window). That is cheaper and more honest than all-time rollup counts, and
 * rankTrending() weights distinct authors so one account can't trend a tag.
 * The rollup docs only power autocomplete + the tag header's total count.
 */
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, setDoc, increment, documentId,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Post } from '../types';
import { normalizeHashtag, rankTrending, type TrendingTag } from './postingLogic';

const toMillis = (v: any): number =>
  typeof v === 'number' ? v : typeof v?.toMillis === 'function' ? v.toMillis() : 0;

const asPost = (d: any): Post => ({ id: d.id, ...d.data(), sourceCollection: 'posts', timestamp: toMillis(d.data().timestamp) } as Post);

/** Best-effort rollup bump for tags a post just used. Never throws. */
export function recordHashtags(tags: string[]): void {
  for (const raw of (tags || []).slice(0, 10)) {
    const tag = normalizeHashtag(raw);
    if (!tag) continue;
    setDoc(doc(db, 'hashtags', tag), { tag, count: increment(1), lastUsed: Date.now() }, { merge: true }).catch(() => {});
  }
}

export interface HashtagPage { posts: Post[]; nextCursor: number | null }

/**
 * Newest-first public posts for a tag. Needs the composite index
 * posts(hashtags ARRAY_CONTAINS, timestamp DESC) — added to firestore.indexes.json.
 * `cursor` = `nextCursor` of the previous page (a post timestamp).
 */
export async function fetchPostsByHashtag(tag: string, cursor: number | null = null, pageSize = 20): Promise<HashtagPage> {
  const t = normalizeHashtag(tag);
  if (!t) return { posts: [], nextCursor: null };
  const base = [where('hashtags', 'array-contains', t), orderBy('timestamp', 'desc')] as const;
  const q = cursor
    ? query(collection(db, 'posts'), ...base, startAfter(cursor), limit(pageSize))
    : query(collection(db, 'posts'), ...base, limit(pageSize));
  const snap = await getDocs(q);
  const posts = snap.docs.map(asPost).filter(p => p.isPublic !== false);
  const last = snap.docs[snap.docs.length - 1];
  return { posts, nextCursor: snap.docs.length === pageSize && last ? toMillis(last.data().timestamp) : null };
}

const trendCache = new Map<number, { at: number; rows: TrendingTag[] }>();
const TREND_TTL_MS = 5 * 60_000;

/** Trending tags in the last `windowHours` (default 24), memoised for 5 minutes. */
export async function fetchTrendingHashtags(windowHours = 24, max = 8): Promise<TrendingTag[]> {
  const now = Date.now();
  const hit = trendCache.get(windowHours);
  if (hit && now - hit.at < TREND_TTL_MS) return hit.rows.slice(0, max);
  try {
    const snap = await getDocs(query(
      collection(db, 'posts'),
      where('timestamp', '>=', now - windowHours * 3600_000),
      orderBy('timestamp', 'desc'),
      limit(300),
    ));
    const rows = rankTrending(snap.docs.map(asPost), now, windowHours, 20);
    trendCache.set(windowHours, { at: now, rows });
    return rows.slice(0, max);
  } catch {
    return hit?.rows.slice(0, max) ?? [];
  }
}

export interface HashtagInfo { tag: string; count: number; lastUsed: number }

/** Rollup totals for the tag header (null if the tag has never been recorded). */
export async function fetchHashtagInfo(tag: string): Promise<HashtagInfo | null> {
  const t = normalizeHashtag(tag);
  if (!t) return null;
  try {
    const d = await getDoc(doc(db, 'hashtags', t));
    if (!d.exists()) return null;
    const x = d.data() as any;
    return { tag: t, count: Number(x.count) || 0, lastUsed: toMillis(x.lastUsed) };
  } catch { return null; }
}

/** Autocomplete: known tags starting with `prefix`, most-used first. */
export async function suggestHashtags(prefix: string, max = 6): Promise<HashtagInfo[]> {
  const p = normalizeHashtag(prefix || '') ?? (prefix ? prefix.toLowerCase().replace(/^#/, '') : '');
  if (!p) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'hashtags'),
      orderBy(documentId()),
      where(documentId(), '>=', p),
      where(documentId(), '<=', p + ''),
      limit(20),
    ));
    return snap.docs
      .map(d => ({ tag: d.id, count: Number((d.data() as any).count) || 0, lastUsed: toMillis((d.data() as any).lastUsed) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, max);
  } catch { return []; }
}
