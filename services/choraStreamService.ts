// choraStreamService — the client side of the Chora transcode pipeline (Step 1).
//
// The transcode worker writes a flat `choraStreams/{trackId}` doc (status + rendition URLs). This
// module reads + caches those, and lets the player resolve a track to the right playable URL for the
// user's quality tier — falling back to the original `track.url` whenever a stream isn't ready yet, so
// nothing breaks during rollout. It also exposes `enqueueTranscode` for the upload flow + backfill.

import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './backendService';

export type ChoraQuality = 'data' | 'high' | 'lossless';
export interface ChoraStream {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  hls?: string;   // AAC-LC 256 HLS (default gapless stream)
  low?: string;   // HE-AAC/AAC progressive (data-saver)
  flac?: string;  // lossless
  loudnessLufs?: number;
  durationSec?: number;
}

const cache = new Map<string, ChoraStream | null>();   // trackId → stream (null = looked up, none)
const inflight = new Map<string, Promise<ChoraStream | null>>();

/** Read a track's stream doc (cached). Returns null if there's no ready transcode. */
export async function getTrackStream(trackId: string): Promise<ChoraStream | null> {
  if (!trackId) return null;
  if (cache.has(trackId)) return cache.get(trackId)!;
  if (inflight.has(trackId)) return inflight.get(trackId)!;
  const p = (async () => {
    try {
      const snap = await getDoc(doc(db, 'choraStreams', trackId));
      const data = snap.exists() ? (snap.data() as ChoraStream) : null;
      cache.set(trackId, data && data.status ? data : null);
      return cache.get(trackId)!;
    } catch { cache.set(trackId, null); return null; }
    finally { inflight.delete(trackId); }
  })();
  inflight.set(trackId, p);
  return p;
}

/** Synchronous cache peek — the player uses this to stay inside the autoplay gesture. */
export function peekTrackStream(trackId: string): ChoraStream | null | undefined {
  return cache.get(trackId);
}

/** Warm the cache for a set of track ids (e.g. when an album loads), so play is instant-HLS. */
export function prefetchTrackStreams(trackIds: string[]): void {
  for (const id of trackIds) if (id && !cache.has(id) && !inflight.has(id)) getTrackStream(id).catch(() => {});
}

/** Pick the playable URL for a ready stream at the chosen quality; null if not ready. */
export function pickStreamUrl(s: ChoraStream | null | undefined, quality: ChoraQuality): { url: string; isHls: boolean } | null {
  if (!s || s.status !== 'ready') return null;
  if (quality === 'lossless' && s.flac) return { url: s.flac, isHls: false };
  if (quality === 'data' && s.low) return { url: s.low, isHls: false };
  if (s.hls) return { url: s.hls, isHls: true };           // 'high' default
  if (s.low) return { url: s.low, isHls: false };
  if (s.flac) return { url: s.flac, isHls: false };
  return null;
}

/** User's audio-quality tier, persisted. Default 'high' (AAC-LC 256 HLS). */
export function getQuality(): ChoraQuality {
  try { const q = localStorage.getItem('chora:quality'); if (q === 'data' || q === 'high' || q === 'lossless') return q; } catch { /* */ }
  return 'high';
}
export function setQuality(q: ChoraQuality): void { try { localStorage.setItem('chora:quality', q); } catch { /* */ } }

/** Enqueue a track for transcode on the server (fire-and-forget from upload/backfill). */
export async function enqueueTranscode(trackId: string, srcUrl: string): Promise<boolean> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;
    const res = await fetch('/api/chora/transcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ trackId, srcUrl }),
    });
    return res.ok;
  } catch { return false; }
}

/** Backfill: enqueue an album's not-yet-transcoded music tracks, throttled. Returns how many were
 *  queued. Skips tracks already 'ready'/'processing'. Call from an admin action per album, or loop
 *  over `fetchAllPublicAlbums()`. Sequential + gentle so it never stampedes the transcode server. */
export async function enqueueAlbumTranscodes(tracks: { id?: string; url?: string }[], gapMs = 1500): Promise<number> {
  let n = 0;
  for (const t of tracks || []) {
    if (!t?.id || typeof t.url !== 'string' || !/^https?:/i.test(t.url)) continue;
    const s = await getTrackStream(t.id);
    if (s && (s.status === 'ready' || s.status === 'processing')) continue;
    if (await enqueueTranscode(t.id, t.url)) { n++; cache.delete(t.id); await new Promise(r => setTimeout(r, gapMs)); }
  }
  return n;
}
