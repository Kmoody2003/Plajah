// lyricFeed — follows a playing Chora track and produces the LYRICS layer.
//
// Two players can drive lyrics: the independent audio playlist (audioBus) and
// the DJ deck. Each registers a CLOCK here (current position, playing, rate,
// and the track). The feed turns the clock into a LyricClock anchor — "at wall
// time X the song was at Y, moving at rate R" — which is all an output window
// needs to animate the type in step. The anchor is re-issued only when it
// would drift (seek, pause, tempo change, next song), not every frame, so the
// BroadcastChannel isn't flooded.
//
// Lyrics come from Chora's `timeCodedLyrics` ({time, text}; on-platform times
// are sometimes milliseconds — normalised here). The library registers the
// catalogue's lyrics so a song queued from a snapshot still resolves.

import type { LayerContent, LyricClock } from './showModel';
import { lyricClockPos } from './showModel';
import type { LyricLine } from './lyricStyles';

export type LyricSourceId = 'bus' | 'dj' | 'live';

export interface LyricTrackMeta {
  id?: string;
  title: string;
  artist?: string;
  timeCodedLyrics?: Array<{ time: number; text: string }>;
  bpm?: number;
}

export interface LyricClockSource {
  getTime(): number;
  isPlaying(): boolean;
  rate(): number;
  track(): LyricTrackMeta | null;
  /** Beat grid when known (DJ deck) — lets kinetic looks pulse on the beat. */
  grid?(): { bpm: number; firstBeat: number } | null;
}

const clocks = new Map<LyricSourceId, LyricClockSource>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; for (const fn of listeners) { try { fn(); } catch { /* */ } } };

export function registerLyricClock(id: LyricSourceId, src: LyricClockSource | null): void {
  if (src) clocks.set(id, src); else clocks.delete(id);
  emit();
}
export function getLyricClock(id: LyricSourceId): LyricClockSource | null { return clocks.get(id) ?? null; }
export function subscribeLyricClocks(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function lyricClocksVersion(): number { return version; }

// ── lyrics ───────────────────────────────────────────────────────────────────

const known = new Map<string, LyricLine[]>();

/** Seconds, sorted, blank lines dropped. Chora sometimes stores milliseconds. */
export function normalizeLyrics(raw?: Array<{ time: number; text: string }> | null): LyricLine[] {
  const list = (raw || []).filter(l => l && typeof l.time === 'number' && (l.text || '').trim());
  if (!list.length) return [];
  const maxT = Math.max(...list.map(l => l.time));
  // >7200 can only be ms (a 2-hour set in seconds is 7200; any song over 7 s in ms exceeds it).
  const scale = maxT > 7200 ? 0.001 : 1;
  return list.map(l => ({ time: l.time * scale, text: l.text.trim() })).sort((a, b) => a.time - b.time);
}

/** The library calls this with every catalogue track it loads. */
export function rememberLyrics(tracks: Array<{ id?: string; timeCodedLyrics?: Array<{ time: number; text: string }> }>): void {
  for (const t of tracks) {
    if (!t.id || !t.timeCodedLyrics?.length) continue;
    known.set(t.id, normalizeLyrics(t.timeCodedLyrics));
  }
}

export function lyricsFor(track: LyricTrackMeta | null | undefined): LyricLine[] {
  if (!track) return [];
  if (track.timeCodedLyrics?.length) return normalizeLyrics(track.timeCodedLyrics);
  return (track.id && known.get(track.id)) || [];
}

// ── layer building ───────────────────────────────────────────────────────────

export interface LyricFeedState {
  ok: boolean;
  reason?: 'no-player' | 'no-track' | 'no-lyrics';
  track?: LyricTrackMeta | null;
  lines?: LyricLine[];
  pos?: number;
  playing?: boolean;
}

export function readFeed(src: LyricSourceId): LyricFeedState {
  const c = clocks.get(src);
  if (!c) return { ok: false, reason: 'no-player' };
  const track = c.track();
  if (!track) return { ok: false, reason: 'no-track' };
  const lines = lyricsFor(track);
  if (!lines.length) return { ok: false, reason: 'no-lyrics', track };
  return { ok: true, track, lines, pos: c.getTime(), playing: c.isPlaying() };
}

/**
 * The LYRICS content for this moment, or `prev` unchanged when the existing
 * anchor still predicts the song position (within `tolerance` seconds) — so the
 * caller can skip a broadcast entirely.
 */
export function nextLyricsContent(
  src: LyricSourceId, styleId: string, prev: Extract<LayerContent, { kind: 'LYRICS' }> | null, tolerance = 0.12,
): Extract<LayerContent, { kind: 'LYRICS' }> | null {
  const c = clocks.get(src);
  if (!c) return null;
  const track = c.track();
  const lines = lyricsFor(track);
  if (!track || !lines.length) return null;
  const now = Date.now();
  const pos = c.getTime();
  const playing = c.isPlaying();
  const rate = playing ? (c.rate() || 1) : 1;
  const grid = c.grid?.() ?? null;
  const sameSong = prev && prev.trackId === (track.id ?? track.title);
  if (prev && sameSong && prev.styleId === styleId && prev.clock.playing === playing && Math.abs(prev.clock.rate - rate) < 1e-3) {
    if (Math.abs(lyricClockPos(prev.clock, now) - pos) <= tolerance) return prev;
  }
  const clock: LyricClock = { anchorMs: now, anchorPos: pos, rate, playing };
  return {
    kind: 'LYRICS',
    lines: sameSong ? prev!.lines : lines,
    styleId,
    title: track.title,
    artist: track.artist,
    trackId: track.id ?? track.title,
    bpm: grid?.bpm ?? track.bpm,
    firstBeat: grid?.firstBeat,
    clock,
  };
}
