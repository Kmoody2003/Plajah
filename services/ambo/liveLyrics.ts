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

import { getLyricClock, registerLyricClock, type LyricTrackMeta } from './lyricFeed';
import { publishCaption } from './liveCaptionStore';
import { startMusicTranscription, type TranscribeSource, type TranscriberHandle } from './liveTranscriber';
import { amboAudio } from './amboAudioEngine';

export type LiveLyricSource =
  | { kind: 'auto' }
  | { kind: 'mic' }
  | { kind: 'device'; deviceId: string }
  | { kind: 'playlist' }
  | { kind: 'dj' }
  | { kind: 'program' }
  | { kind: 'system' }
  | { kind: 'stream'; id: string }
  | { kind: 'url'; url: string };

export interface LiveLyricsPrefs { source: LiveLyricSource; maxWords: number; keepLines: number; pauseMs: number; }
export interface LiveLyricsState {
  running: boolean; starting: boolean; progress: number; status: string; error: string; level: number;
  /** The last few lines, for a status readout and the control preview. */
  lines: Array<{ time: number; text: string }>;
  /** What 'auto' resolved to right now (dj / playlist / mic), for the readout. */
  autoResolved?: 'dj' | 'playlist' | 'mic';
}

const KEY = 'ambo_live_lyrics_v1';
const AUTO_MIGRATED = 'ambo_live_lyrics_auto_v2';
const DEFAULTS: LiveLyricsPrefs = { source: { kind: 'auto' }, maxWords: 9, keepLines: 24, pauseMs: 1500 };
function readPrefs(): LiveLyricsPrefs {
  try {
    const p: LiveLyricsPrefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    // older builds defaulted to (and saved) "mic"; move those to auto once
    if (!localStorage.getItem(AUTO_MIGRATED)) {
      localStorage.setItem(AUTO_MIGRATED, '1');
      if (p.source?.kind === 'mic') { p.source = { kind: 'auto' }; localStorage.setItem(KEY, JSON.stringify(p)); }
    }
    return p;
  } catch { return { ...DEFAULTS }; }
}

let prefs = readPrefs();
let state: LiveLyricsState = { running: false, starting: false, progress: 0, status: 'Off', error: '', level: 0, lines: [] };
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

/** What 'auto' means right now: the DJ deck if it's playing, else the playlist if playing, else the mic. */
export function autoTarget(): 'dj' | 'playlist' | 'mic' {
  try {
    if (getLyricClock('dj')?.isPlaying() && amboAudio.channelStream('dj')) return 'dj';
    if (getLyricClock('bus')?.isPlaying() && amboAudio.channelStream('playlist')) return 'playlist';
  } catch { /* */ }
  return 'mic';
}

function resolve(src: LiveLyricSource): Promise<TranscribeSource> {
  if (src.kind === 'auto') return resolve({ kind: autoTarget() });
  if (src.kind === 'mic') return Promise.resolve({ kind: 'mic' });
  if (src.kind === 'device') return Promise.resolve({ kind: 'device', deviceId: src.deviceId });
  if (src.kind === 'playlist') {
    const stream = amboAudio.channelStream('playlist');
    return stream ? Promise.resolve({ kind: 'stream', stream }) : Promise.reject(new Error('Audio playlist channel has no active audio stream'));
  }
  if (src.kind === 'dj') {
    const stream = amboAudio.channelStream('dj');
    return stream ? Promise.resolve({ kind: 'stream', stream }) : Promise.reject(new Error('DJ deck channel has no active audio stream'));
  }
  if (src.kind === 'program') {
    const stream = amboAudio.programStream();
    return stream ? Promise.resolve({ kind: 'stream', stream }) : Promise.reject(new Error('Program audio mix has no active audio stream'));
  }
  if (src.kind === 'system') {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      return Promise.reject(new Error('System audio capture is not supported in this browser'));
    }
    return navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }).then(ms => {
      // Screen/tab sharing: stop the video track so only system audio is transcribed
      ms.getVideoTracks().forEach(t => t.stop());
      if (!ms.getAudioTracks().length) {
        throw new Error('No audio track selected in system screen share dialog. Be sure to check "Share audio".');
      }
      return { kind: 'stream' as const, stream: ms };
    });
  }
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

let progressTimer: any = null;

export async function startLiveLyrics(): Promise<void> {
  if (state.running || state.starting) return;
  const my = ++session;
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }

  let currentProgress = 0.15;
  set({ starting: true, running: false, progress: currentProgress, error: '', status: 'Getting ready…', lines: [] });

  progressTimer = setInterval(() => {
    if (session !== my || state.running) {
      clearInterval(progressTimer);
      progressTimer = null;
      return;
    }
    if (currentProgress < 0.88) {
      currentProgress = Math.min(0.88, currentProgress + 0.04);
      set({ progress: currentProgress });
    }
  }, 160);

  builder = createLineBuilder(prefs.maxWords, prefs.keepLines, prefs.pauseMs / 1000);
  t0 = performance.now();
  let startedOn: 'dj' | 'playlist' | 'mic' | undefined;
  try {
    if (prefs.source.kind === 'auto') startedOn = autoTarget();
    const src = await resolve(prefs.source.kind === 'auto' ? { kind: startedOn! } : prefs.source);
    currentProgress = Math.max(currentProgress, 0.35);
    set({ progress: currentProgress, status: 'Connecting audio…' });

    const h = await startMusicTranscription(src, {
      onWords: text => {
        builder.push(text, nowSec());
        set({ lines: builder.lines().slice(-4) });
        publishCaption(builder.lines().slice(-6).map(l => l.text), true);
      },
      onStatus: s => set({ status: s }),
      onProgress: (p, s) => {
        currentProgress = Math.max(currentProgress, p);
        set({ progress: currentProgress, status: s });
      },
      onLevel: l => { if (Math.abs(l - state.level) > 0.08) set({ level: l }); },
      onError: m => set({ error: m }),
    }, 'en-US', 'Live lyrics');

    if (my !== session) { h.stop(); return; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }

    handle = h;
    registerLyricClock('live', {
      getTime: () => rebased().base === 0 && !builder.lines().length ? 0 : nowSec() - rebased().base,
      isPlaying: () => true,
      rate: () => 1,
      track,
    });
    const keep = /^Listening ·|Switching|Downloading|Loading/.test(state.status);
    set({ running: true, starting: false, progress: 1.0, status: keep ? state.status : 'Listening', autoResolved: startedOn });
    if (prefs.source.kind === 'auto') startAutoWatch(my, startedOn!);
  } catch (e) {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    mediaEl?.pause(); mediaEl = null;
    set({ running: false, starting: false, progress: 0, status: 'Off', error: state.error || String((e as Error)?.message || 'Could not start live lyrics') });
  }
}

// ── auto source: follow whatever is actually playing ────────────────────────
let autoTimer: any = null;
function startAutoWatch(my: number, current: 'dj' | 'playlist' | 'mic') {
  if (autoTimer) clearInterval(autoTimer);
  let pending: string | null = null;
  autoTimer = setInterval(() => {
    if (session !== my || !state.running || prefs.source.kind !== 'auto') { clearInterval(autoTimer); autoTimer = null; return; }
    const want = autoTarget();
    if (want === current) { pending = null; return; }
    // must hold for two checks so the gap between tracks doesn't bounce to the mic
    if (pending !== want) { pending = want; return; }
    clearInterval(autoTimer); autoTimer = null;
    stopLiveLyrics();
    void startLiveLyrics();
  }, 1500);
}

export function stopLiveLyrics(): void {
  session++;
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  try { handle?.stop(); } catch { /* */ }
  handle = null;
  if (mediaEl) { mediaEl.pause(); mediaEl.removeAttribute('src'); mediaEl = null; }
  registerLyricClock('live', null);
  publishCaption([], false);
  set({ running: false, starting: false, progress: 0, status: 'Off', level: 0 });
}
