// ─── Live → Short pipeline ("clip this") ─────────────────────────────────────
//
// Blueprint Part 1C.3. Streams already archive to Reello via
// backendService.saveStreamArchive() → `stream_archives/{id}` (Mux asset +
// playback id, startedAt/endedAt). This closes the Twitch-clips gap: pick in/out
// points on a live or just-ended stream and publish the result as a Reello short
// that carries attribution back to the stream and its creator.
//
// ── WHAT IS REAL vs WHAT IS NOT ─────────────────────────────────────────────
// REAL, working today:
//   • in/out point selection against the archive's Mux playback id
//   • a persisted clip record (`live_clips/{id}`) with full attribution
//   • a published Reello Video doc for the clip, playing the SOURCE asset with
//     the clip's in/out carried on the doc — i.e. a *virtual* clip: the player
//     starts at startSec and stops at endSec. It genuinely plays the right range.
//   • provenance stamped so the clip always resolves back to the origin stream.
//
// NOT REAL YET (deliberately not faked):
//   • no standalone encoded asset is produced. See TODO(encode) on publishClip().
//     Clip records carry `encodeStatus: 'VIRTUAL'` until that lands; nothing in
//     this module ever claims a render happened.

import { db, auth } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, limit as qlimit,
} from 'firebase/firestore';
import { StreamArchive, Video } from '../types';

const strip = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
};

export const LIVE_CLIPS_COLLECTION = 'live_clips';

/** How the clip's media is currently served. */
export type ClipEncodeStatus =
  /** Plays the source asset, trimmed by the player to [startSec, endSec]. No render. */
  | 'VIRTUAL'
  /** A real encode was requested (server-side) and is in flight. */
  | 'ENCODING'
  /** A standalone asset exists — clipPlaybackId is populated. */
  | 'READY'
  | 'FAILED';

export interface LiveClip {
  id: string;
  /** Source stream archive (`stream_archives/{id}`), when clipped from an archive. */
  archiveId?: string;
  /** Source live stream id, when clipped while still live. */
  streamId?: string;
  /** Mux playback id of the SOURCE asset — what the virtual clip plays. */
  sourcePlaybackId?: string;
  sourceAssetId?: string;
  /** Attribution — always carried, never optional in practice. */
  sourceTitle: string;
  sourceOwnerId: string;
  sourceOwnerName: string;
  sourceOwnerPhoto?: string;
  /** In/out points, seconds from the start of the source. */
  startSec: number;
  endSec: number;
  durationSec: number;
  title: string;
  /** The clipper (may differ from the streamer — that's the point of clips). */
  clippedBy: string;
  clippedByName: string;
  createdAt: number;
  encodeStatus: ClipEncodeStatus;
  /** Set only when encodeStatus === 'READY'. */
  clipPlaybackId?: string;
  clipAssetId?: string;
  /** The published Reello short, once published. */
  videoId?: string;
}

export const MIN_CLIP_SEC = 3;
export const MAX_CLIP_SEC = 120;

/** Clamp an in/out selection into a legal clip window. Pure — safe for UI use. */
export function normalizeRange(startSec: number, endSec: number, sourceDurationSec?: number): { startSec: number; endSec: number } {
  const cap = sourceDurationSec && sourceDurationSec > 0 ? sourceDurationSec : Number.MAX_SAFE_INTEGER;
  let s = Math.max(0, Math.min(startSec, cap));
  let e = Math.max(s + MIN_CLIP_SEC, Math.min(endSec, cap));
  if (e - s > MAX_CLIP_SEC) e = s + MAX_CLIP_SEC;
  if (e > cap) { e = cap; s = Math.max(0, e - MIN_CLIP_SEC); }
  return { startSec: Math.round(s * 10) / 10, endSec: Math.round(e * 10) / 10 };
}

export const formatClock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
};

/** Playable source URL for the clip's scrubber/preview. */
export function clipSourceUrl(clip: Pick<LiveClip, 'sourcePlaybackId' | 'clipPlaybackId' | 'encodeStatus'>): string {
  if (clip.encodeStatus === 'READY' && clip.clipPlaybackId) return `https://stream.mux.com/${clip.clipPlaybackId}.m3u8`;
  return clip.sourcePlaybackId ? `https://stream.mux.com/${clip.sourcePlaybackId}.m3u8` : '';
}

/** Poster frame at the clip's in-point. */
export function clipThumbnailUrl(clip: Pick<LiveClip, 'sourcePlaybackId' | 'startSec'>): string {
  if (!clip.sourcePlaybackId) return '';
  return `https://image.mux.com/${clip.sourcePlaybackId}/thumbnail.png?width=640&height=360&time=${Math.max(0, Math.floor(clip.startSec || 0))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateClipInput {
  archive?: StreamArchive;
  /** For clipping a stream that is still live (no archive doc yet). */
  live?: { streamId: string; playbackId?: string; assetId?: string; title: string; ownerId: string; ownerName: string; ownerPhoto?: string };
  startSec: number;
  endSec: number;
  title?: string;
}

/**
 * Persist a clip record with full attribution. Does NOT publish a short — call
 * publishClipAsShort() for that, so "mark the moment" and "post it" stay separate
 * actions (Twitch's clip flow does the same).
 */
export async function createClip(input: CreateClipInput): Promise<LiveClip | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const src = input.archive;
  const live = input.live;
  if (!src && !live) return null;

  const sourceDuration = src?.durationMs ? src.durationMs / 1000 : undefined;
  const { startSec, endSec } = normalizeRange(input.startSec, input.endSec, sourceDuration);

  const id = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clip: LiveClip = strip({
    id,
    archiveId: src?.id,
    streamId: live?.streamId,
    sourcePlaybackId: src?.muxPlaybackId || live?.playbackId || undefined,
    sourceAssetId: src?.muxAssetId || live?.assetId || undefined,
    sourceTitle: src?.title || live?.title || 'Live stream',
    sourceOwnerId: src?.ownerId || live?.ownerId || '',
    sourceOwnerName: src?.ownerName || live?.ownerName || 'Creator',
    sourceOwnerPhoto: src?.ownerPhoto || live?.ownerPhoto,
    startSec,
    endSec,
    durationSec: Math.round((endSec - startSec) * 10) / 10,
    title: (input.title || '').trim() || `${src?.title || live?.title || 'Live'} — clip`,
    clippedBy: user.uid,
    clippedByName: user.displayName || 'Someone',
    createdAt: Date.now(),
    encodeStatus: 'VIRTUAL',
  }) as LiveClip;

  try {
    await setDoc(doc(db, LIVE_CLIPS_COLLECTION, id), strip(clip as any));
  } catch {
    return null;
  }
  return clip;
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publish a clip as a Reello short.
 *
 * The Video doc plays the SOURCE Mux asset and carries the clip's in/out points
 * plus attribution back to the origin stream and creator via `provenance`
 * (originVideoId = the archive/stream id, originOwnerId = the streamer). Players
 * that honour remixStartSec/remixEndSec will trim; players that don't simply play
 * the source from the top — degraded, never broken.
 *
 * TODO(encode): produce a standalone asset instead of a virtual clip. With Mux
 * this is a single server call —
 *     mux.video.assets.create({
 *       inputs: [{ url: `mux://assets/${sourceAssetId}`, start_time: startSec, end_time: endSec }],
 *       playback_policy: ['public'],
 *     })
 * — but it needs a new authenticated endpoint (e.g. POST /api/mux/clip) in
 * server.ts, which this change set does not own. Once it exists: call it here,
 * set encodeStatus 'ENCODING', poll for the playback id, then write
 * clipPlaybackId + encodeStatus 'READY' and repoint the Video's url. Until then
 * the record stays 'VIRTUAL' and the UI says so.
 */
export async function publishClipAsShort(clip: LiveClip): Promise<string | null> {
  const user = auth.currentUser;
  if (!user || !clip?.id) return null;

  const videoId = `video_${clip.id}`;
  const video: Partial<Video> & { id: string; timestamp: number } = strip({
    id: videoId,
    ownerId: user.uid,
    // Firestore rules cap video titles at 200 chars — clamp so a long stream
    // title can never make the write fail.
    title: (clip.title || 'Clip').slice(0, 180),
    description: `Clipped from “${clip.sourceTitle}” by ${clip.sourceOwnerName} · ${formatClock(clip.startSec)}–${formatClock(clip.endSec)}`,
    url: clipSourceUrl(clip),
    muxPlaybackId: clip.clipPlaybackId || clip.sourcePlaybackId,
    muxAssetId: clip.clipAssetId || clip.sourceAssetId,
    thumbnailUrl: clipThumbnailUrl(clip),
    artist: user.displayName || 'Creator',
    genre: 'Live',
    duration: clip.durationSec,
    isRello: true,
    isPrivate: false,
    likesCount: 0,
    commentsCount: 0,
    timestamp: Date.now(),
    tags: ['clip', 'live'],
    // In/out points ride on the existing remix fields — a clip IS a licensed
    // excerpt of another piece of Plajah media, which is exactly what these mean.
    remixStartSec: clip.startSec,
    remixEndSec: clip.endSec,
    provenance: strip({
      originVideoId: clip.archiveId || clip.streamId,
      originOwnerId: clip.sourceOwnerId,
      stampedAt: Date.now(),
    }),
  }) as any;

  try {
    await setDoc(doc(db, 'videos', videoId), strip(video as any));
    await updateDoc(doc(db, LIVE_CLIPS_COLLECTION, clip.id), { videoId });
  } catch {
    return null;
  }
  return videoId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/** Clips taken from one stream archive. Single-field query — no composite index. */
export async function getClipsForArchive(archiveId: string, max = 50): Promise<LiveClip[]> {
  if (!archiveId) return [];
  try {
    const snap = await getDocs(query(collection(db, LIVE_CLIPS_COLLECTION), where('archiveId', '==', archiveId), qlimit(max)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as LiveClip)).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Clips a user has taken. Single-field query — no composite index. */
export async function getClipsByUser(userId: string, max = 50): Promise<LiveClip[]> {
  if (!userId) return [];
  try {
    const snap = await getDocs(query(collection(db, LIVE_CLIPS_COLLECTION), where('clippedBy', '==', userId), qlimit(max)));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as LiveClip)).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getClip(clipId: string): Promise<LiveClip | null> {
  if (!clipId) return null;
  try {
    const snap = await getDoc(doc(db, LIVE_CLIPS_COLLECTION, clipId));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as LiveClip) : null;
  } catch {
    return null;
  }
}
