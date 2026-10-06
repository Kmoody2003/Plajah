/**
 * trendingService — "Trending now": velocity-ranked posts, windowed to the last 24h.
 *
 *   const { posts, loading } = useTrendingPosts({ hiddenUids, viewerProfile });   // hook
 *   const posts = await fetchTrendingPosts({ hiddenUids });                       // one-shot
 *
 * Source: the newest `scanLimit` (150) public posts inside the window —
 * `where('timestamp','>=', since) + orderBy('timestamp','desc')`, a single-field range on one field, served
 * by the automatic index (no composite). Ranked client-side with forYouRanker.rankTrending:
 * engagement / (ageHours+2)^1.3, engagement = likes + 3·comments + weighted shares/deep actions.
 * Cheap: one query, no per-post reads.
 *
 * `fetchTopScoredFeed(n)` additionally exposes the server-maintained `feed` score ordering
 * (`orderBy(score desc, timestamp desc)`), which needs the composite index feed(score desc, timestamp desc)
 * — added to firestore.indexes.json (it was missing; fetchFeed in backendService used the same query unindexed).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { filterPostsForViewer } from './contentSafety';
import { rankTrending, type TrendingOptions } from './forYouRanker';
import { toMillisLoose } from './feedPaginationCore';
import type { Post, FeedItem, UserProfile } from '../types';

export interface FetchTrendingOptions extends Omit<TrendingOptions, 'hiddenUids'> {
  hiddenUids?: ReadonlySet<string>;
  viewerProfile?: UserProfile | null;
  /** Posts scanned inside the window (default 150). */
  scanLimit?: number;
  now?: number;
}

export async function fetchTrendingPosts(o: FetchTrendingOptions = {}): Promise<Post[]> {
  const now = o.now ?? Date.now();
  const windowMs = o.windowMs ?? 24 * 3_600_000;
  const snap = await getDocs(query(
    collection(db, 'posts'),
    where('timestamp', '>=', now - windowMs),
    orderBy('timestamp', 'desc'),
    limit(o.scanLimit ?? 150),
  ));
  const posts = snap.docs.map(d => {
    const data = d.data();
    return { id: d.id, ...data, sourceCollection: 'posts', timestamp: toMillisLoose(data.timestamp) } as Post;
  });
  const ranked = rankTrending(posts, now, { windowMs, minEngagement: o.minEngagement, limit: o.limit, hiddenUids: o.hiddenUids });
  return filterPostsForViewer(ranked, o.viewerProfile);
}

/** Server-scored `feed` docs (score desc). Requires the feed(score, timestamp) composite index. */
export async function fetchTopScoredFeed(n = 20): Promise<FeedItem[]> {
  const snap = await getDocs(query(collection(db, 'feed'), orderBy('score', 'desc'), orderBy('timestamp', 'desc'), limit(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), sourceCollection: 'feed', timestamp: toMillisLoose(d.data().timestamp) }) as unknown as FeedItem);
}

export function useTrendingPosts(o: FetchTrendingOptions & { enabled?: boolean; refreshMs?: number } = {}) {
  const { enabled = true, refreshMs = 5 * 60_000 } = o;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const opts = useRef(o); opts.current = o;
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    const run = () => fetchTrendingPosts(opts.current)
      .then(p => { if (!cancelled) { setPosts(p); setError(null); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e as Error); setLoading(false); } });
    setLoading(true);
    run();
    const t = setInterval(run, refreshMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [enabled, refreshMs, nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);
  return { posts, loading, error, refresh };
}
