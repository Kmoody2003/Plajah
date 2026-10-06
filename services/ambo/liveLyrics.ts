// liveLyrics — words from a live source become LYRICS-layer lines, on screen as they are heard.
//
// It registers itself as a third lyric clock ('live') next to the audio playlist
// and the DJ deck, so every existing lyric look, the output windows, templates
// and visualizers that read the LYRICS layer work with no new rendering path.
//
// Sources: the default mic, a chosen audio input, any registered MediaStream
// (NDI/SRT/stream audio the app has), or a media URL (an account/station stream
// that a browser can play). Speech → lines: words are grouped into short
// display lines that grow in place as words arrive and roll to a new line at
// `maxWords` or after a pause.

import { registerLyricClock, type LyricTrackMeta } from './lyricFeed';
import { publishCaption } from './liveCaptionStore';
import { startLiveTranscription, type TranscribeSource, type TranscriberHandle } from './liveTranscriber';

export type LiveLyricSource =
  | { kind: 'mic' }
  | { kind: 'device'; deviceId: string }
  | { kind: 'stream'; id: string }
  | { kind: 'url'; url: string };

export interface LiveLyricsPrefs { source: LiveLyricSource; maxWords: number; keepLines: number; pauseMs: number; }
export interface LiveLyricsState {
  running: boolean; starting: boolean; status: string; error: string; level: number;
  /** The last few lines, for a status readout and the control preview. */
  lines: Array<{ time: number; text: string }>;
}

const KEY = 'ambo_live_lyrics_v1';
const DEFAULTS: LiveLyricsPrefs = { source: { kind: 'mic' }, maxWords: 9, keepLines: 24, pauseMs: 1500 };
function readPrefs(): LiveLyricsPrefs { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }

let prefs = readPrefs();
let state: LiveLyricsState = { running: false, starting: false, status: 'Off', error: '', level: 0, lines: [] };
const subs = new Set<() => void>();
const emit = () => { for (const fn of subs) { try { fn(); } catch { /* */ } } };
const set = (p: Partial<LiveLyricsState>) => { state = { ...state, ...p }; emit(); };

export const getLiveLyricsPrefs = () => prefs;
export const getLiveLyricsState = () => state;
export const subscribeLiveLyrics = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export function setLiveLyricsPrefs(p: Partial<LiveLyricsPrefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* */ }
  emit();
}

// ── registered audio streams (NDI/SRT/stream audio, program mix …) ──────────
const streams = new Map<string, { label: string; stream: MediaStream }>();
export function registerLiveAudioStream(id: string, label: string, stream: MediaStream | null) {
  if (stream) streams.set(id, { label, stream }); else streams.delete(id);
  emit();
}
export const listLiveAudioStreams = () => [...streams].map(([id, v]) => ({ id, label: v.label }));

// ── line assembly (pure; exported for tests) ────────────────────────────────

export interface LineBuilder {
  push(text: string, nowSec: number): void;
  lines(): Array<{ time: number; text: string }>;
  reset(): void;
}
export function createLineBuilder(maxWords: number, keep: number, pauseSec: number): LineBuilder {
  let out: Array<{ time: number; text: string }> = [];
  let curWords = 0;
  let lastAt = -1e9;
  return {
    push(text, nowSec) {
      const words = text.split(/\s+/).filter(Boolean);
      for (const w of words) {
        const startNew = !out.length || curWords >= maxWords || nowSec - lastAt > pauseSec;
        if (startNew) { out.push({ time: nowSec, text: w }); curWords = 1; }
        else { out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + ' ' + w }; curWords++; }
        lastAt = nowSec;
      }
      if (out.length > keep) out = out.slice(-keep);
    },
    lines: () => out,
    reset() { out = []; curWords = 0; lastAt = -1e9; },
  };
}

let builder = createLineBuilder(prefs.maxWords, prefs.keepLines, prefs.pauseMs / 1000);
let t0 = 0;
let session = 0;
let handle: TranscriberHandle | null = null;
let mediaEl: HTMLMediaElement | null = null;
const nowSec = () => (performance.now() - t0) / 1000;

/** Lines re-based so the first kept line is ~0 (lyricFeed treats times > 7200 as ms). */
function rebased(): { lines: Array<{ time: number; text: string }>; base: number } {
  const l = builder.lines();
  const base = l.length ? Math.max(0, l[0].time - 0.01) : 0;
  return { lines: l.map(x => ({ time: x.time - base, text: x.text })), base };
}

function track(): LyricTrackMeta | null {
  const { lines } = rebased();
  // The id changes with every line change so lyricFeed re-reads the lines instead of reusing its cache.
  const version = lines.length + ':' + (lines[lines.length - 1]?.text.length ?? 0);
  return { id: `live-${session}-${version}`, title: 'Live transcription', timeCodedLyrics: lines };
}

function resolve(src: LiveLyricSource): Promise<TranscribeSource> {
  if (src.kind === 'mic') return Promise.resolve({ kind: 'mic' });
  if (src.kind === 'device') return Promise.resolve({ kind: 'device', deviceId: src.deviceId });
  if (src.kind === 'stream') {
    const s = streams.get(src.id);
    return s ? Promise.resolve({ kind: 'stream', stream: s.stream }) : Promise.reject(new Error('That audio stream is no longer available'));
  }
  // A playable URL: captureStream() the element. Needs CORS-clean media; HLS needs a browser that plays it natively.
  return new Promise((resolveP, rejectP) => {
    const el = document.createElement('audio');
    el.crossOrigin = 'anonymous'; el.src = src.url; el.autoplay = true;
    mediaEl = el;
    el.onerror = () => rejectP(new Error('That stream could not be played (needs CORS access and a browser-playable format)'));
    el.onplaying = () => {
      try {
        const cap = (el as any).captureStream?.() as MediaStream | undefined;
        if (!cap || !cap.getAudioTracks().length) throw new Error('no audio');
        resolveP({ kind: 'stream', stream: cap });
      } catch { rejectP(new Error('This browser cannot read audio from that stream')); }
    };
    el.play().catch(() => rejectP(new Error('The stream would not start')));
  });
}

export async function startLiveLyrics(): Promise<void> {
  if (state.running || state.starting) return;
  const my = ++session;
  set({ starting: true, error: '', status: 'Starting…', lines: [] });
  builder = createLineBuilder(prefs.maxWords, prefs.keepLines, prefs.pauseMs / 1000);
  t0 = performance.now();
  try {
    const src = await resolve(prefs.source);
    const h = await startLiveTranscription(src, {
      onWords: text => { builder.push(text, nowSec()); set({ lines: builder.lines().slice(-4) }); publishCaption(builder.lines().slice(-6).map(l => l.text), true); },
      onStatus: s => set({ status: s }),
      onLevel: l => { if (Math.abs(l - state.level) > 0.08) set({ level: l }); },
      onError: m => set({ error: m }),
    });
    if (my !== session) { h.stop(); return; }
    handle = h;
    registerLyricClock('live', {
      getTime: () => rebased().base === 0 && !builder.lines().length ? 0 : nowSec() - rebased().base,
      isPlaying: () => true,
      rate: () => 1,
      track,
    });
    set({ running: true, starting: false, status: 'Listening' });
  } catch (e) {
    mediaEl?.pause(); mediaEl = null;
    set({ running: false, starting: false, status: 'Off', error: state.error || String((e as Error)?.message || 'Could not start live lyrics') });
  }
}

export function stopLiveLyrics(): void {
  session++;
  try { handle?.stop(); } catch { /* */ }
  handle = null;
  if (mediaEl) { mediaEl.pause(); mediaEl.removeAttribute('src'); mediaEl = null; }
  registerLyricClock('live', null);
  publishCaption([], false);
  set({ running: false, starting: false, status: 'Off', level: 0 });
}
