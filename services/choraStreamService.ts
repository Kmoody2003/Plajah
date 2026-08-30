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
  /** Server-written epoch ms. Needed to tell a live transcode from one that died mid-run. */
  updatedAt?: number;
  error?: string;
}

/** How long a 'processing' doc may sit before we assume the job died and allow a retry.
 *  Comfortably above Cloud Run's 300s request timeout — the longest a real job can survive —
 *  so a genuinely running transcode is never interrupted by a competing retry. */
const PROCESSING_STALE_MS = 15 * 60 * 1000;

/** Did this 'processing' job die without ever writing its result? */
export function isStaleProcessing(s: ChoraStream | null | undefined): boolean {
  if (!s || s.status !== 'processing') return false;
  // No timestamp at all means it predates updatedAt being written — old enough by definition.
  if (!s.updatedAt) return true;
  return Date.now() - s.updatedAt > PROCESSING_STALE_MS;
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

/** Force a fresh read (busts the cache) — the admin backfill UI uses this to poll live status. */
export async function refreshTrackStream(trackId: string): Promise<ChoraStream | null> {
  cache.delete(trackId);
  return getTrackStream(trackId);
}

/** Warm the cache for a set of track ids (e.g. when an album loads), so play is instant-HLS. */
export function prefetchTrackStreams(trackIds: string[]): void {
  for (const id of trackIds) if (id && !cache.has(id) && !inflight.has(id)) getTrackStream(id).catch(() => {});
}

/** Re-home a stored media URL onto the current secure origin.
 *
 *  The server-side backfill (/api/chora/transcode-admin) built these URLs from the request's
 *  own protocol+host, which resolved to the INTERNAL Cloud Run host over http — so docs got
 *  baked with `http://plajah-api-….run.app/api/chora/media/…`. On the https app the browser
 *  blocks that as mixed content and the track silently won't play. Rewrite any chora media URL
 *  back onto window.location.origin (→ https://plajah.com, which Hosting proxies to Cloud Run),
 *  and upgrade any other http URL to https. Fixes every already-transcoded track with no data
 *  migration, and is a no-op for URLs that were already correct. */
function secureMediaUrl(u?: string): string | undefined {
  if (!u) return u;
  try {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || 'https://plajah.com';
    const parsed = new URL(u, origin);
    const idx = parsed.pathname.indexOf('/api/chora/media');
    if (idx !== -1) return origin + parsed.pathname.slice(idx) + parsed.search;
    if (parsed.protocol === 'http:') { parsed.protocol = 'https:'; return parsed.toString(); }
    return u;
  } catch { return u; }
}

/** Pick the playable URL for a ready stream at the chosen quality; null if not ready. */
export function pickStreamUrl(s: ChoraStream | null | undefined, quality: ChoraQuality): { url: string; isHls: boolean } | null {
  if (!s || s.status !== 'ready') return null;
  if (quality === 'lossless' && s.flac) return { url: secureMediaUrl(s.flac)!, isHls: false };
  if (quality === 'data' && s.low) return { url: secureMediaUrl(s.low)!, isHls: false };
  if (s.hls) return { url: secureMediaUrl(s.hls)!, isHls: true };           // 'high' default
  if (s.low) return { url: secureMediaUrl(s.low)!, isHls: false };
  if (s.flac) return { url: secureMediaUrl(s.flac)!, isHls: false };
  return null;
}

/** User's audio-quality tier, persisted. Default 'high' (AAC-LC 256 HLS). */
export function getQuality(): ChoraQuality {
  try { const q = localStorage.getItem('chora:quality'); if (q === 'data' || q === 'high' || q === 'lossless') return q; } catch { /* */ }
  return 'high';
}
export function setQuality(q: ChoraQuality): void {
  try { localStorage.setItem('chora:quality', q); } catch { /* */ }
  // Let the player live-switch the current track to the new tier (see GlobalPlayerContext).
  try { window.dispatchEvent(new CustomEvent('chora:quality-changed', { detail: q })); } catch { /* SSR / no window */ }
}

/** Enqueue a track for transcode on the server.
 *
 *  NOTE: /api/chora/transcode is SYNCHRONOUS — it runs the whole ffmpeg job inside the request,
 *  so this resolves only when the transcode finishes (or the platform kills it). That is why the
 *  timeout below matters: without it a hung request blocks forever, and because the backfill loop
 *  is sequential, ONE hung track silently stalls the entire catalogue run. */
export async function enqueueTranscode(trackId: string, srcUrl: string): Promise<boolean> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return false;
    // Slightly beyond Cloud Run's own 300s ceiling: past that the request is already dead and
    // waiting longer only holds up every track behind it.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 320_000);
    try {
      const res = await fetch('/api/chora/transcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trackId, srcUrl }),
        signal: ac.signal,
      });
      return res.ok;
    } finally { clearTimeout(timer); }
  } catch { return false; }
}

/**
 * Ask the server to queue an album's tracks for transcoding. ONE request, returns immediately.
 *
 * This is the replacement for calling enqueueTranscode() per track from the browser. That pattern
 * made the PAGE the driver of a ~150s server job: publishing a large album fired dozens of
 * concurrent long requests and then abandoned them on navigation, stranding each doc at
 * 'processing'. Here the browser only says "these need doing" and leaves; the work is claimed and
 * run by services/choraTranscodeWorker on the server.
 */
export async function enqueueAlbumForTranscode(albumId: string): Promise<number> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token || !albumId) return 0;
    const res = await fetch('/api/chora/enqueue-album', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ albumId }),
    });
    if (!res.ok) return 0;
    const json = await res.json().catch(() => null);
    return Number(json?.queued) || 0;
  } catch {
    return 0;   // publish must never fail because the transcode queue did
  }
}

/** Backfill: enqueue an album's not-yet-transcoded music tracks, throttled. Returns how many were
 *  queued. Skips tracks already 'ready', and 'processing' ones that are still plausibly alive —
 *  a 'processing' doc older than PROCESSING_STALE_MS is treated as a dead job and retried.
 *  Call from an admin action per album, or loop over `fetchAllPublicAlbums()`. Sequential +
 *  gentle so it never stampedes the transcode server. */
export async function enqueueAlbumTranscodes(tracks: { id?: string; url?: string }[], gapMs = 1500): Promise<number> {
  let n = 0;
  for (const t of tracks || []) {
    if (!t?.id || typeof t.url !== 'string' || !/^https?:/i.test(t.url)) continue;
    const s = await getTrackStream(t.id);
    if (s?.status === 'ready') continue;
    // 'processing' is written BEFORE the transcode starts and only overwritten when it finishes.
    // Cloud Run kills the request at 300s, and an instance restart or a crash kills it sooner —
    // in every one of those cases neither the success nor the failure write ever happens and the
    // doc is pinned to 'processing' forever. Skipping those unconditionally meant one timeout
    // permanently removed a track from every future backfill, which is why backfill appeared to
    // do nothing: it was skipping exactly the tracks that still needed the work.
    if (s?.status === 'processing' && !isStaleProcessing(s)) continue;
    if (await enqueueTranscode(t.id, t.url)) { n++; cache.delete(t.id); await new Promise(r => setTimeout(r, gapMs)); }
  }
  return n;
}
