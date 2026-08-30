// publicStats.ts — the PUBLIC half of the metrics rollup (client read side).
//
// One document per piece of content, `publicStats/{contentId}`, holding only the numbers a
// viewer is allowed to see: the play count and the thumbs tally. Written exclusively by the
// server (/api/metrics/events and /api/metrics/rating); the client is denied write by rules,
// because a client-writable counter is a forgeable counter.
//
// This is deliberately NOT `contentStats` — that rollup also carries watch-time and the retention
// curve, and Firestore rules cannot restrict which fields a read returns. Publishing one number
// without publishing all of them requires a separate document, which is what this is.
//
// WHEN THERE IS NO DATA, THERE IS NO NUMBER. Every reader here returns null (not 0, not a guess)
// for content that has never been played, so callers can render an honest blank instead of a
// confident fiction. That is the whole point of this module.

import { doc, getDoc } from 'firebase/firestore';
// Repo rule: subscriptions go through safeSnapshot, never firebase/firestore directly — a corrupted
// watch stream throws synchronously from registration and takes the subscribing React tree with it.
import { onSnapshot } from './safeSnapshot';
import { db, auth } from './backendService';

export interface PublicStats {
  contentId: string;
  /** Total plays/views/listens across the platform. */
  plays: number;
  /** Thumbs tally. Both zero means nobody has voted — NOT "0% liked". */
  up: number;
  down: number;
}

/** Share of thumbs that are up, 0-100. `null` when nobody has voted — do not render a percentage. */
export function positiveShare(s: Pick<PublicStats, 'up' | 'down'> | null | undefined): number | null {
  if (!s) return null;
  const total = (s.up || 0) + (s.down || 0);
  if (total <= 0) return null;
  return Math.round((s.up / total) * 100);
}

function shape(id: string, data: any): PublicStats {
  return {
    contentId: id,
    plays: Number(data?.plays) || 0,
    up: Number(data?.up) || 0,
    down: Number(data?.down) || 0,
  };
}

// A detail page can mount the same counter several times (hero, stats panel, share card). The
// cache keeps that to one read; it is per-session and never negative-cached, so a title that
// crosses its first play still picks the number up on the next navigation.
const cache = new Map<string, PublicStats>();

/** Read one content's public numbers. Returns null if the doc does not exist yet. */
export async function fetchPublicStats(contentId: string): Promise<PublicStats | null> {
  if (!contentId) return null;
  const hit = cache.get(contentId);
  if (hit) return hit;
  try {
    const snap = await getDoc(doc(db, 'publicStats', contentId));
    if (!snap.exists()) return null;
    const out = shape(contentId, snap.data());
    cache.set(contentId, out);
    return out;
  } catch {
    return null;   // a stats read must never break the page it decorates
  }
}

/**
 * Read many at once, for list surfaces (track rows, Reello rails).
 *
 * Fires the gets in parallel rather than one query: `publicStats` has no field to filter a
 * where-in on beyond the doc id, and a 30-id `in` query would need chunking for no gain over
 * parallel point reads of documents this small.
 *
 * Only content that HAS stats appears in the returned map. A missing key means no data, which a
 * caller should render as blank rather than as zero.
 */
export async function fetchPublicStatsMany(contentIds: string[]): Promise<Record<string, PublicStats>> {
  const ids = Array.from(new Set(contentIds.filter(Boolean)));
  if (!ids.length) return {};
  const out: Record<string, PublicStats> = {};
  const misses: string[] = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit) out[id] = hit; else misses.push(id);
  }
  if (misses.length) {
    const snaps = await Promise.all(
      misses.map(id => getDoc(doc(db, 'publicStats', id)).catch(() => null)),
    );
    snaps.forEach((snap, i) => {
      if (!snap?.exists()) return;
      const s = shape(misses[i], snap.data());
      cache.set(misses[i], s);
      out[misses[i]] = s;
    });
  }
  return out;
}

/** Live subscription, for a detail page where the count should tick up as it is watched. */
export function subscribePublicStats(
  contentId: string,
  cb: (stats: PublicStats | null) => void,
): () => void {
  if (!contentId) { cb(null); return () => {}; }
  return onSnapshot(
    doc(db, 'publicStats', contentId),
    snap => {
      if (!snap.exists()) { cb(null); return; }
      const s = shape(contentId, snap.data());
      cache.set(contentId, s);
      cb(s);
    },
    () => cb(null),
  );
}

/**
 * Record this viewer's thumbs vote in the PUBLIC tally.
 *
 * The caller still writes the viewer's own users/{uid}/titleRatings/{id} doc — that is their
 * private "what did I press" state and drives the button's filled/unfilled look. This call is the
 * other half: the server dedupes against the voter's previous vote and applies only the delta, so
 * pressing the same thumb twice or switching sides cannot inflate the score.
 *
 * Pass rating: null to retract a vote.
 */
export async function submitRating(
  contentId: string,
  contentType: 'track' | 'album' | 'video' | 'film' | 'book' | 'article' | 'post' | 'podcast',
  rating: 'UP' | 'DOWN' | null,
): Promise<PublicStats | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken().catch(() => null);
    if (!token) return null;
    const res = await fetch('/api/metrics/rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ contentId, contentType, rating }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const s = shape(contentId, { ...json, plays: cache.get(contentId)?.plays || 0 });
    cache.set(contentId, s);
    return s;
  } catch {
    return null;
  }
}

/** Compact count for display: 1234 -> "1.2K", 4200000 -> "4.2M". */
export function formatCount(n?: number | null): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

/** Drop cached counts — call on sign-out, so nothing carries across accounts. */
export function resetPublicStatsCache(): void {
  cache.clear();
}
