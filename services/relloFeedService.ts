// ─── Reello feed blending ──────────────────────────────────────────────────────
// Pure helpers (no fetch, no side effects) that assemble the Reello feed order
// from already-fetched buckets. Composition target:
//   ~40% interest-scored · 30% followed creators · 20% trending · 10% fresh
// De-duplicated by id, variety preserved by round-robin interleaving.

import { Video } from '../types';

/**
 * Engagement-velocity score: rewards likes/comments/plays weighted by recency,
 * so a video that earned its engagement recently ranks above an older one with
 * the same raw counts. Pure — safe to sort with.
 */
function trendingScore(v: Video, now: number): number {
  const likes    = v.likesCount    || 0;
  const comments = v.commentsCount || 0;
  const plays    = v.playsCount    || 0;
  // Comments are the strongest signal of active engagement, then likes, then plays.
  const engagement = comments * 3 + likes * 2 + plays * 0.05;
  const ageHours = Math.max(1, (now - (v.timestamp || now)) / 3_600_000);
  // Gravity decay (à la Hacker News) — velocity, not raw volume.
  return engagement / Math.pow(ageHours + 2, 1.4);
}

/** Sort videos by engagement velocity (highest first). Pure, no fetch. */
export function computeTrending(videos: Video[]): Video[] {
  const now = Date.now();
  return [...videos].sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
}

/** Sort videos newest-first by timestamp. */
function computeFresh(videos: Video[]): Video[] {
  return [...videos].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

interface BlendParams {
  interestVideos: Video[];
  followedVideos: Video[];
  recentVideos: Video[];
}

/**
 * Blend the buckets into one feed order. Weights roughly:
 * 40% interest, 30% followed, 20% trending, 10% fresh — trending & fresh both
 * derive from `recentVideos`. Interleaves by weighted round-robin so the feed
 * has variety instead of long runs of a single bucket, and de-dupes by id.
 */
export function blendRelloFeed(params: BlendParams): Video[] {
  const interest = params.interestVideos.slice();
  const followed = params.followedVideos.slice();
  const trending = computeTrending(params.recentVideos);
  const fresh    = computeFresh(params.recentVideos);

  // Each source contributes on its own cursor; weights set how often it's picked.
  const sources: { queue: Video[]; weight: number; credit: number }[] = [
    { queue: interest, weight: 0.4, credit: 0 },
    { queue: followed, weight: 0.3, credit: 0 },
    { queue: trending, weight: 0.2, credit: 0 },
    { queue: fresh,    weight: 0.1, credit: 0 },
  ];

  const seen = new Set<string>();
  const out: Video[] = [];

  const remaining = () => sources.some(s => s.queue.length > 0);

  while (remaining()) {
    // Give every source its weighted credit, then draw from the one with the
    // most accumulated credit that still has items — classic weighted round-robin.
    for (const s of sources) s.credit += s.weight;

    const pick = sources
      .filter(s => s.queue.length > 0)
      .sort((a, b) => b.credit - a.credit)[0];
    if (!pick) break;

    pick.credit -= 1;
    // Advance this source's cursor to the next not-yet-emitted video.
    let next: Video | undefined;
    while (pick.queue.length > 0) {
      const candidate = pick.queue.shift()!;
      if (!seen.has(candidate.id)) { next = candidate; break; }
    }
    if (next) { seen.add(next.id); out.push(next); }
  }

  return out;
}
