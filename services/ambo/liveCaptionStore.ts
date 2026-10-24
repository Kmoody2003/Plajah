// liveCaptionStore — the rolling live transcript, mirrored into every window.
//
// The studio window owns the microphone/transcriber (liveLyrics); output windows
// and template thumbnails only need the current words. The studio publishes over
// a BroadcastChannel; every window that imports this module mirrors the latest.
import { cleanLines, cleanTranscript } from './cleanSpeech';

export interface CaptionState { lines: string[]; at: number; live: boolean }

const CH = 'ambo-live-caption-v1';
let cur: CaptionState = { lines: [], at: 0, live: false };
const subs = new Set<() => void>();
let ch: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    ch = new BroadcastChannel(CH);
    (ch as unknown as { unref?: () => void }).unref?.();   // node (tests): don't hold the process open
    ch.onmessage = e => { if (e.data && Array.isArray(e.data.lines)) { cur = e.data; subs.forEach(fn => { try { fn(); } catch { /* */ } }); } };
  }
} catch { /* */ }

export const getCaption = () => cur;
export const subscribeCaption = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function publishCaption(lines: string[], live: boolean): void {
  // clean speech: profanity never leaves the studio — output windows only ever receive filtered lines
  cur = { lines: cleanLines(lines), at: Date.now(), live };
  try { ch?.postMessage(cur); } catch { /* */ }
  subs.forEach(fn => { try { fn(); } catch { /* */ } });
}

// ── Lyric cue: the playing track's current lyric line (+ neighbours), mirrored into every window ──
// Published ~4×/s by the window that owns the players (lyricFeed.ts); consumers treat it as stale after ~1.5 s,
// so it vanishes by itself when the music stops.
export interface LyricCue { lines: string[]; cur: number; at: number; times: number[]; pos: number; rate: number; playing: boolean }
const CUE_CH = 'ambo-lyric-cue-v1';
let cue: LyricCue = { lines: [], cur: -1, at: 0, times: [], pos: 0, rate: 1, playing: false };
let cueCh: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    cueCh = new BroadcastChannel(CUE_CH);
    (cueCh as unknown as { unref?: () => void }).unref?.();
    cueCh.onmessage = e => { if (e.data && Array.isArray(e.data.lines)) cue = e.data; };
  }
} catch { /* */ }
export const getLyricCue = () => cue;
export function publishLyricCue(lines: string[], curIdx: number, times: number[] = [], pos = 0, rate = 1, playing = true): void {
  // map (not filter) so cur/times stay aligned with the line indices
  cue = { lines: lines.map(l => cleanTranscript(l)), cur: curIdx, at: Date.now(), times, pos, rate, playing };
  try { cueCh?.postMessage(cue); } catch { /* */ }
}

// ── Continuous live feed from any active speech recognizer (Windows 11 / mic / NPU) ──
import { subscribeTranscript } from './liveTranscriber';

const MAX_WORDS_PER_LINE = 7;
const MAX_KEPT_LINES = 4;
let rollingWords: string[] = [];
let rollingLines: string[] = [];
let lastWordTime = 0;
let silenceTimer: ReturnType<typeof setTimeout> | null = null;

try {
  subscribeTranscript((text, final) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const now = Date.now();
    if (now - lastWordTime > 2400 && rollingWords.length > 0) {
      rollingLines.push(rollingWords.join(' '));
      rollingWords = [];
    }
    lastWordTime = now;

    for (const w of words) {
      rollingWords.push(w);
      if (rollingWords.length >= MAX_WORDS_PER_LINE) {
        rollingLines.push(rollingWords.join(' '));
        rollingWords = [];
      }
    }
    if (final && rollingWords.length > 0) {
      rollingLines.push(rollingWords.join(' '));
      rollingWords = [];
    }
    if (rollingLines.length > MAX_KEPT_LINES) {
      rollingLines = rollingLines.slice(-MAX_KEPT_LINES);
    }
    const displayLines = rollingWords.length > 0
      ? [...rollingLines, rollingWords.join(' ')].slice(-MAX_KEPT_LINES)
      : rollingLines.slice(-MAX_KEPT_LINES);

    publishCaption(displayLines, true);

    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      publishCaption(displayLines, false);
    }, 6000);
  });
} catch { /* tests / SSR */ }
