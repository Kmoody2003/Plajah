// Lyric sync — the ONE implementation.
//
// This logic was written for the Album Creator's Caption Sync card; the Melos Project view needs
// exactly the same behaviour, so it lives here instead of being forked. Both surfaces import
// these, and the player reads the result through src/lib/captions.ts getActiveCaption().
//
// Timestamps are SECONDS (what getActiveCaption expects). Some legacy records store ms —
// services/fabula/fabulaMusic.ts autodetects with `maxT > 1000 ? 0.001 : 1`; new writes are
// always seconds.

import { auth } from './firebase';

export interface TimedLyricLine { time: number; text: string }

/** Something that carries lyrics — an album Track or a ProjectTrack, they share these fields. */
export interface LyricCarrier {
  lyrics?: string;
  timeCodedLyrics?: TimedLyricLine[];
}

/**
 * The lines to stamp. Prefers the typed lyrics box; falls back to the text already inside the
 * synced captions — without that fallback, a transcribed track locked you out of hand-syncing
 * entirely (the editor read `lyrics`, found nothing, and refused to open).
 */
export function lyricLinesFor(track: LyricCarrier): string[] {
  const typed = (track.lyrics || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (typed.length) return typed;
  return (track.timeCodedLyrics || []).map((l) => (l.text || '').trim()).filter(Boolean);
}

/** Pull transcribed text into the editable lyrics field so it can be corrected by hand. */
export function transcriptionToText(track: LyricCarrier): string {
  return (track.timeCodedLyrics || []).map((l) => (l.text || '').trim()).filter(Boolean).join('\n');
}

/**
 * Carry a lyrics-box correction onto already-synced timings, preserving every timestamp.
 *
 * Only applies to a *correction*: same number of lines, and most lines untouched. A wholesale
 * rewrite, or added/removed lines, can't be mapped onto the old timings without guessing which
 * line belongs to which moment — those are left alone and surfaced as needing a re-sync rather
 * than silently mangled.
 */
export function reconcileTimedLyricText(track: LyricCarrier, lyrics: string): TimedLyricLine[] | null {
  const timed = track.timeCodedLyrics;
  if (!timed || timed.length === 0) return null;
  const lines = lyrics.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length !== timed.length) return null;
  const changed = lines.reduce((n, line, i) => n + (line !== (timed[i].text || '').trim() ? 1 : 0), 0);
  if (changed === 0) return null;
  if (changed > Math.max(1, Math.floor(lines.length / 2))) return null; // a rewrite, not a fix
  return timed.map((l, i) => ({ ...l, text: lines[i] }));
}

/** Whether the lyrics box and the synced captions have drifted apart, and how badly. */
export function timedLyricDrift(track: LyricCarrier): 'none' | 'text' | 'count' {
  const timed = track.timeCodedLyrics;
  if (!timed || timed.length === 0) return 'none';
  const lines = (track.lyrics || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return 'none';            // nothing typed yet — not a divergence
  if (lines.length !== timed.length) return 'count';
  return lines.some((l, i) => l !== (timed[i].text || '').trim()) ? 'text' : 'none';
}

/** Force the typed words onto the existing timings by line order (user-confirmed). */
export function applyLyricsToTimings(track: LyricCarrier): TimedLyricLine[] | null {
  const timed = track.timeCodedLyrics;
  if (!timed || timed.length === 0) return null;
  const lines = (track.lyrics || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length !== timed.length) return null;
  return timed.map((l, i) => ({ ...l, text: lines[i] }));
}

/** Nudge one line's timestamp by delta seconds, keeping it ordered and non-negative. */
export function nudgeLyricTime(list: TimedLyricLine[], index: number, delta: number): TimedLyricLine[] {
  const next = [...list];
  if (!next[index]) return list;
  next[index] = { ...next[index], time: Math.max(0, Math.round((next[index].time + delta) * 100) / 100) };
  return next;
}

/** Set one line's timestamp outright (typed input, seconds). */
export function setLyricTime(list: TimedLyricLine[], index: number, seconds: number): TimedLyricLine[] {
  const next = [...list];
  if (!next[index] || !isFinite(seconds)) return list;
  next[index] = { ...next[index], time: Math.max(0, Math.round(seconds * 100) / 100) };
  return next;
}

/** Parse a timestamp field that may be `m:ss.s` or plain seconds. */
export function parseTimeInput(raw: string): number {
  const s = raw.trim();
  if (s.includes(':')) {
    const [m, sec] = s.split(':');
    const mins = parseFloat(m), secs = parseFloat(sec);
    if (isFinite(mins) && isFinite(secs)) return mins * 60 + secs;
    return NaN;
  }
  return parseFloat(s);
}

/**
 * Auto-transcribe and time-code a track — the SAME `/api/ai/captions` endpoint the album player's
 * "Sync Lyrics" and the post-publish caption pass use (windowed transcription: short audio windows
 * anchored by ffmpeg, so timings can't accumulate drift).
 *
 * Needs a URL the SERVER can fetch, so the audio must already be somewhere public/durable —
 * an https locker URL, not an OPFS key or a blob:. Returns null on any failure, because a track
 * that keeps its plain lyrics is far better than one with confidently wrong timings.
 */
export async function transcribeCaptions(
  audioUrl: string,
  meta: { title?: string; artist?: string } = {},
): Promise<TimedLyricLine[] | null> {
  if (!/^https?:/i.test(audioUrl)) return null;
  try {
    const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const res = await fetch('/api/ai/captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ audioUrl, title: meta.title, artist: meta.artist }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const captions = data?.captions;
    return Array.isArray(captions) && captions.length > 0 ? (captions as TimedLyricLine[]) : null;
  } catch {
    return null;
  }
}
