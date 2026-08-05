// ─── Sounds — the Chora ↔ Reello link ("use this sound") ─────────────────────
//
// Blueprint Part 1B.2. Two directions, one graph:
//
//   Video.soundTrackId   → the Chora track a short uses as its sound
//   Track.soundOfVideoId → the Reello video a track was extracted from
//
// "Videos using this sound" is deliberately a SINGLE-FIELD equality query
// (where('soundTrackId','==',trackId)) so it needs no composite index — ordering
// is done in JS. See getVideosUsingSound().
//
// Sound identity: a sound is keyed by its trackId. Chora tracks live embedded in
// album documents as often as they do in the top-level `tracks` collection, so we
// keep a small denormalized registry at `sounds/{trackId}` written whenever a sound
// is attached or extracted. That gives every surface (chips, rails, future Chora
// sound pages) a cheap single-doc read for the display title/cover without having
// to know where the canonical track lives. Everything degrades silently: a missing
// registry doc just means a less specific label, never an error.

import { db, auth } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, limit as qlimit,
  increment, serverTimestamp,
} from 'firebase/firestore';
import { Track, Video } from '../types';

/** Firestore rejects undefined values outright — strip before every write. */
const strip = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
};

export const SOUNDS_COLLECTION = 'sounds';

/** Denormalized display record for a sound. Written on attach/extract. */
export interface SoundRecord {
  /** Same id as the Chora Track this sound points at. */
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  /** Playable audio (or the source video's media URL when audio-only isn't extracted yet). */
  url?: string;
  coverUrl?: string;
  duration?: number;
  /** Set when the sound was extracted from a Reello video (mirrors Track.soundOfVideoId). */
  soundOfVideoId?: string;
  /** True when the audio is still the source video's media (no audio-only render yet). */
  isVideoAudio?: boolean;
  /** Best-effort counter; the rail is the source of truth. */
  usageCount?: number;
  createdBy?: string;
  createdAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert the denormalized sound record. Safe to call repeatedly. */
export async function registerSound(sound: SoundRecord): Promise<void> {
  if (!sound?.id) return;
  try {
    await setDoc(
      doc(db, SOUNDS_COLLECTION, sound.id),
      strip({ ...sound, createdBy: sound.createdBy ?? auth.currentUser?.uid, createdAt: sound.createdAt ?? Date.now() }),
      { merge: true },
    );
  } catch { /* non-fatal — the link on the video still works */ }
}

/**
 * Resolve a sound for display. Tries the registry first, then the top-level
 * `tracks/{id}` doc. Returns null when neither exists so callers can render a
 * generic "Original sound" label rather than an error.
 */
export async function getSound(trackId: string): Promise<SoundRecord | null> {
  if (!trackId) return null;
  try {
    const snap = await getDoc(doc(db, SOUNDS_COLLECTION, trackId));
    if (snap.exists()) return { id: snap.id, ...(snap.data() as any) } as SoundRecord;
  } catch { /* fall through to tracks */ }
  try {
    const snap = await getDoc(doc(db, 'tracks', trackId));
    if (snap.exists()) {
      const t = snap.data() as Track;
      return strip({
        id: snap.id,
        title: t.title,
        artist: t.artist,
        artistId: t.artistId,
        url: t.url,
        coverUrl: t.albumCover || t.images?.[0],
        duration: t.duration,
        soundOfVideoId: t.soundOfVideoId,
      }) as SoundRecord;
    }
  } catch { /* unreadable — degrade to null */ }
  return null;
}

/** Build a SoundRecord from an in-memory Chora Track (no reads). */
export function soundFromTrack(track: Track): SoundRecord {
  return strip({
    id: track.id,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    url: track.url,
    coverUrl: track.albumCover || track.images?.[0],
    duration: track.duration,
    soundOfVideoId: track.soundOfVideoId,
  }) as SoundRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attach — an existing Chora track becomes a short's sound
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach an existing Chora Track to a Reello video as its sound.
 * Writes Video.soundTrackId and registers the sound for display.
 * Returns false when the write fails (caller keeps its optimistic UI honest).
 */
export async function attachSoundToVideo(videoId: string, track: Track): Promise<boolean> {
  if (!videoId || !track?.id) return false;
  try {
    await updateDoc(doc(db, 'videos', videoId), strip({ soundTrackId: track.id }));
  } catch {
    return false;
  }
  await registerSound(soundFromTrack(track));
  bumpUsage(track.id, 1);
  return true;
}

/** Remove the sound link from a video. */
export async function detachSoundFromVideo(videoId: string, trackId?: string): Promise<boolean> {
  if (!videoId) return false;
  try {
    // Firestore has no "undefined" — clear with an empty string so the field is
    // present-but-falsy and every consumer's `if (video.soundTrackId)` guard holds.
    await updateDoc(doc(db, 'videos', videoId), { soundTrackId: '' });
  } catch {
    return false;
  }
  if (trackId) bumpUsage(trackId, -1);
  return true;
}

function bumpUsage(trackId: string, by: number): void {
  // Fire-and-forget; the rail count is authoritative, this is only for sorting hints.
  setDoc(doc(db, SOUNDS_COLLECTION, trackId), { usageCount: increment(by), updatedAt: serverTimestamp() }, { merge: true })
    .catch(() => { /* non-fatal */ });
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract — a video's audio becomes a reusable sound
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractSoundResult {
  track: Track;
  /**
   * False when the sound still points at the source video's media URL because no
   * audio-only asset was rendered. Callers should say so in the UI rather than
   * implying a real extraction happened.
   */
  audioRendered: boolean;
}

/**
 * Extract a video's audio into a Chora Track ("use this sound" from a short).
 *
 * HONEST SCOPE: this creates the sound *record* and the Chora ↔ Reello link
 * (Track.soundOfVideoId), and points playback at the source video's media URL —
 * browsers happily play the audio track of an MP4/HLS source, so the sound is
 * genuinely usable today. It does NOT produce a standalone audio-only asset.
 *
 * TODO(encode): render an audio-only rendition and replace SoundRecord.url. With
 * Mux this is an audio-only static rendition on the source asset; for direct-URL
 * uploads it needs a server-side ffmpeg pass. Until then `audioRendered` is false
 * and `isVideoAudio` is true on the record.
 */
export async function extractSoundFromVideo(video: Video, opts?: { title?: string }): Promise<ExtractSoundResult | null> {
  if (!video?.id) return null;
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const trackId = `sound_${video.id}`;
  const sourceUrl = (video as any).verticalVideoUrl || (video as any).videoUrl || (video as any).url
    || (video.muxPlaybackId ? `https://stream.mux.com/${video.muxPlaybackId}.m3u8` : undefined);
  const cover = video.thumbnailUrl || (video as any).coverImageUrl
    || (video.muxPlaybackId ? `https://image.mux.com/${video.muxPlaybackId}/thumbnail.png?width=640&height=640&time=5` : undefined);

  const track: Track = strip({
    id: trackId,
    title: opts?.title || `Original sound — ${video.title || 'Untitled'}`,
    artist: (video as any).artist || (video as any).ownerName || 'Plajah creator',
    artistId: (video as any).ownerId || (video as any).userId,
    url: sourceUrl || '',
    videoUrl: sourceUrl,
    mediaKind: 'AUDIO',
    soundOfVideoId: video.id,
    albumCover: cover,
    duration: video.duration,
  }) as Track;

  try {
    await setDoc(doc(db, 'tracks', trackId), strip({ ...track, createdAt: Date.now(), ownerId: uid }), { merge: true });
  } catch {
    return null;
  }

  await registerSound(strip({
    ...soundFromTrack(track),
    isVideoAudio: true,
    createdBy: uid,
  }) as SoundRecord);

  // The source short is, by definition, the first video using its own sound.
  try { await updateDoc(doc(db, 'videos', video.id), { soundTrackId: trackId }); } catch { /* non-fatal */ }

  return { track, audioRendered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// The rail — "videos using this sound"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Videos using a given sound. Single-field equality only — NO composite index
 * required. Sorting and the private-video filter happen in JS on purpose; adding
 * `orderBy('timestamp')` here would demand an index and fail silently in prod.
 */
export async function getVideosUsingSound(trackId: string, max = 60): Promise<Video[]> {
  if (!trackId) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'videos'),
      where('soundTrackId', '==', trackId),
      qlimit(max),
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) } as Video))
      .filter(v => !v.isPrivate)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
}

/** Count for the rail header. Uses the same index-free query. */
export async function countVideosUsingSound(trackId: string): Promise<number> {
  return (await getVideosUsingSound(trackId, 200)).length;
}
