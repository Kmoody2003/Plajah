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
import { registerCatalogSongs, searchSongs, getSong } from './songLibrary';
import { getLiveLyricsState } from './liveLyrics';
import { getExtractedLyrics } from './vocalLyricExtractor';
import { publishLyricCue } from './liveCaptionStore';

/** bus = audio playlist · dj = DJ deck · live = raw transcription · follow = song follower (live audio aligned to a song's lyrics). */
export type LyricSourceId = 'bus' | 'dj' | 'live' | 'follow';

export interface LyricTrackMeta {
  id?: string;
  title: string;
  artist?: string;
  /** `adlib` marks a line the singer improvised (song follower) — drawn in the adlib colour. */
  timeCodedLyrics?: Array<{ time: number; text: string; adlib?: boolean }>;
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
export function normalizeLyrics(raw?: Array<{ time: number; text: string; adlib?: boolean }> | null): LyricLine[] {
  const list = (raw || []).filter(l => l && typeof l.time === 'number' && (l.text || '').trim());
  if (!list.length) return [];
  const maxT = Math.max(...list.map(l => l.time));
  // >7200 can only be ms (a 2-hour set in seconds is 7200; any song over 7 s in ms exceeds it).
  const scale = maxT > 7200 ? 0.001 : 1;
  return list
    .map(l => (l.adlib ? { time: l.time * scale, text: l.text.trim(), adlib: true } : { time: l.time * scale, text: l.text.trim() }))
    .sort((a, b) => a.time - b.time);
}

/** The library calls this with every catalogue track it loads. */
export function rememberLyrics(tracks: Array<{ id?: string; title?: string; artist?: string; timeCodedLyrics?: Array<{ time: number; text: string }> }>): void {
  for (const t of tracks) {
    if (!t.id || !t.timeCodedLyrics?.length) continue;
    known.set(t.id, normalizeLyrics(t.timeCodedLyrics));
  }
  // …and the Lyrics tab / song detection can find them by words.
  try { registerCatalogSongs(tracks); } catch { /* */ }
}

/** Lower-case, accent/punctuation-free title for comparing a track to a library song. */
const normTitle = (s: string) => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export function lyricsFor(track: LyricTrackMeta | null | undefined): LyricLine[] {
  if (!track) return [];
  if (track.timeCodedLyrics?.length) return normalizeLyrics(track.timeCodedLyrics);
  const fromKnown = (track.id && known.get(track.id)) || [];
  if (fromKnown.length) return fromKnown;
  // Lyrics transcribed from the isolated vocals of the actual audio (background, progressive).
  const extracted = getExtractedLyrics(track as any);
  if (extracted.length) return normalizeLyrics(extracted);

  // Match against local & catalog song library by EXACT (normalized) title — a loose first-hit match would show
  // some other song's words and stop the real lyrics from ever being extracted.
  if (track.title) {
    const want = normTitle(track.title);
    const hits = want ? searchSongs(track.title) : [];
    const match = hits.find(s => normTitle(s.title) === want);
    if (match && match.lines.length) {
      if (match.timeCodedLyrics?.length) return normalizeLyrics(match.timeCodedLyrics);
      const dur = (track as any).duration && Number((track as any).duration) > 0 ? Number((track as any).duration) : match.lines.length * 3.8;
      const step = Math.max(2.5, dur / Math.max(1, match.lines.length));
      return match.lines.map((t, idx) => ({
        time: idx * step,
        text: t,
      }));
    }
  }
  return [];
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
  const sameLines = !!sameSong && prev!.lines.length === lines.length;
  if (prev && sameSong && sameLines && prev.styleId === styleId && prev.clock.playing === playing && Math.abs(prev.clock.rate - rate) < 1e-3) {
    if (Math.abs(lyricClockPos(prev.clock, now) - pos) <= tolerance) return prev;
  }
  const clock: LyricClock = { anchorMs: now, anchorPos: pos, rate, playing };
  // A title card only for real song metadata — never a file name or a placeholder like "Local Audio File".
  const realMeta = !!track.artist && !/^(?:local audio file|unknown|various)/i.test(track.artist)
    && !!track.title && !/\.(?:mp3|wav|m4a|aac|flac|ogg|opus|wma|aiff?)$/i.test(track.title) && src !== 'live';
  return {
    kind: 'LYRICS',
    lines: sameLines ? prev!.lines : lines,
    styleId,
    title: realMeta ? track.title : '',
    artist: realMeta ? track.artist : undefined,
    trackId: track.id ?? track.title,
    bpm: grid?.bpm ?? track.bpm,
    firstBeat: grid?.firstBeat,
    clock,
  };
}

// ── lyric cue broadcast ──────────────────────────────────────────────────────
// Whatever track is playing publishes its current lyric line (with neighbours) to every window, so a slide's
// live transcript region (empty template text) shows the song's words in step with the music.
const CUE_SOURCES: LyricSourceId[] = ['dj', 'bus', 'follow', 'live'];
let cueTimer: ReturnType<typeof setInterval> | null = null;
export function startLyricCueBroadcast(): void {
  if (cueTimer || typeof window === 'undefined') return;
  cueTimer = setInterval(() => {
    for (const id of CUE_SOURCES) {
      const c = clocks.get(id);
      if (!c || !c.isPlaying()) continue;
      const lines = lyricsFor(c.track());
      if (!lines.length) continue;
      const pos = c.getTime() + 0.05;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) { if (lines[i].time <= pos) idx = i; else break; }
      const from = Math.max(0, idx - 1), to = Math.min(lines.length, Math.max(idx, 0) + 3);
      const win = lines.slice(from, to);
      publishLyricCue(win.map(l => l.text), Math.max(0, idx) - from, win.map(l => l.time), c.getTime(), c.rate() || 1, true);
      return;
    }
  }, 250);
}
startLyricCueBroadcast();
