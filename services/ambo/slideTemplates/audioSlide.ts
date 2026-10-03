// audioSlide — playback controller and live drawers for Ambo Audio slides.
//
// Taking an audio slide plays its file. ONE controller per slide host (each
// output window builds its own source, so its own host):
//
//   program window (host.audible)  an <audio> element routed through the Ambo
//                                  mixer's 'slides' strip (metered, limited,
//                                  feeds every visualizer). CORS → /api/proxy →
//                                  direct (unrouted) fallback, like VideoSource.
//   every other window             no sound. Animates from the take clock,
//                                  corrected by the program window's position
//                                  over a BroadcastChannel when it is around.
//   gallery / thumbnail (no host)  a still, representative frame; no media.
//
// Drawers (registered on import, see live.ts):
//   audio.waveform    precomputed band peaks (djWaveformAnalysis) + playhead,
//                     live shimmer from the master analyser
//   audio.progress    one of the treatments in audioProgressStyles
//   audio.transcript  timed cues (transcriptParse), current line highlighted
//   audio.viz         any platform visualizer (GeneratorSource/ShaderSource)
//                     drawn into a region or the whole ground
//
// At the end everything settles (full bar, final line held) instead of
// snapping away; the slide stays until the operator clears it.
import { registerLiveDrawer, onHostDispose, type LiveEnv, type SlideHost } from './live';
import type { SlideObj, SlideTheme } from './types';
import { lay } from './layout';
import { fontCss, ensureFontsLoaded } from '../../tela/telaFonts';
import { otherAudioFactor, subscribeAudioPriority } from '../audioPriority';
import { analyzeSpectrum } from '../../djWaveformAnalysis';
import { parseTranscript, timeCues, cueIndexAt, cueProgress, parseClock, cuesToLines, type Cue } from './transcriptParse';
import {
  drawProgress, isProgressStyle, chapterMarks, progressAt, rgba,
  type ProgressPaint, type ProgressState, type ProgressStyle,
} from './audioProgressStyles';

type Ctx = CanvasRenderingContext2D;
const nowSec = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : (v || 0);
const TAU = Math.PI * 2;

// ── field parsing (pure, tested) ────────────────────────────────────────────
/** "80" / "80%" / "0.8" → 0.8; empty → 1. */
export function parseVolume(s: string | undefined): number {
  const v = parseFloat(String(s ?? '').replace('%', ''));
  if (!Number.isFinite(v)) return 1;
  return clamp01(v > 1 ? v / 100 : v);
}
export const parseToggle = (s: string | undefined) => /^\s*(1|true|on|yes|loop)\b/i.test(s || '');
/** "90" / "1:30" → seconds; bad → 0. */
export function parseStartSec(s: string | undefined): number {
  const v = parseClock(String(s ?? '').trim());
  return Number.isFinite(v) && v > 0 ? v : 0;
}
/** Visualizer field: '' / none / off → null; 'auto' → the theme's pick; anything else is a mode id. */
export function resolveVizMode(field: string | undefined, th: Pick<SlideTheme, 'director' | 'dark' | 'id'>): string | null {
  const f = (field || '').trim();
  if (!f || /^(none|off)\b/i.test(f)) return null;
  if (/^auto\b/i.test(f)) {
    switch (th.director) {
      case 'the Classical Mind': return th.dark ? 'STUDIO_AURORA' : 'LUMINANCE';
      case 'the Futurist': return th.dark ? 'NEBULA' : 'STUDIO_CHROME';
      case 'the Baroque Dramatist': return 'LIQUID';
      case 'the Radical Minimalist': return th.dark ? 'WAVEFORM' : 'STUDIO_RIPPLE';
      case 'the Rebellious Hand': return th.dark ? 'STUDIO_KINETIC' : 'STUDIO_BAUHAUS';
      default: return 'STUDIO_RIPPLE';
    }
  }
  return f;
}

const needsCors = (url: string) => {
  if (!/^https?:/i.test(url)) return false;
  try { return new URL(url, location.href).origin !== location.origin; } catch { return false; }
};
const proxied = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

// ── waveform analysis (async, cached by URL) ────────────────────────────────
export interface WaveData { n: number; lo: Float32Array; mid: Float32Array; hi: Float32Array; lvl: Float32Array; dur: number }
const COLS = 900;
const waves = new Map<string, WaveData | 'pending' | 'failed'>();
const waveListeners = new Set<() => void>();

/** Reduce per-frame band arrays (0..255) to COLS columns (max per column). */
function columns(arrs: Uint8Array[], frames: number): Float32Array[] {
  return arrs.map(a => {
    const out = new Float32Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const f0 = Math.floor(c / COLS * frames), f1 = Math.max(f0 + 1, Math.floor((c + 1) / COLS * frames));
      let m = 0;
      for (let f = f0; f < f1 && f < a.length; f++) if (a[f] > m) m = a[f];
      out[c] = m / 255;
    }
    return out;
  });
}
function norm(a: Float32Array): Float32Array {
  const s = Array.from(a).sort((x, y) => x - y), ref = s[Math.floor(s.length * .98)] || 1;
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1, a[i] / ref);
  return a;
}
/** O(n) band split for long files: one-pole filters, RMS per column. */
function cheapBands(buf: AudioBuffer): WaveData {
  const d = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, sr = buf.sampleRate, n = d.length;
  const kLo = 1 - Math.exp(-TAU * 180 / sr), kMid = 1 - Math.exp(-TAU * 2000 / sr);
  const lo = new Float32Array(COLS), mid = new Float32Array(COLS), hi = new Float32Array(COLS), lvl = new Float32Array(COLS);
  let l1 = 0, l2 = 0;
  for (let c = 0; c < COLS; c++) {
    const i0 = Math.floor(c / COLS * n), i1 = Math.floor((c + 1) / COLS * n);
    let a = 0, b = 0, h = 0, v = 0;
    for (let i = i0; i < i1; i++) {
      const x = d1 ? (d[i] + d1[i]) * .5 : d[i];
      l1 += (x - l1) * kLo; l2 += (x - l2) * kMid;
      a += l1 * l1; b += (l2 - l1) * (l2 - l1); h += (x - l2) * (x - l2); v += x * x;
    }
    const m = Math.max(1, i1 - i0);
    lo[c] = Math.sqrt(a / m); mid[c] = Math.sqrt(b / m); hi[c] = Math.sqrt(h / m); lvl[c] = Math.sqrt(v / m);
  }
  return { n: COLS, lo: norm(lo), mid: norm(mid), hi: norm(hi), lvl: norm(lvl), dur: buf.duration };
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const tries = needsCors(url) ? [url, proxied(url)] : [url];
  let last: unknown = null;
  for (const u of tries) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.arrayBuffer();
    } catch (e) { last = e; }
  }
  throw last || new Error('fetch failed');
}

async function analyse(url: string): Promise<void> {
  try {
    const bytes = await fetchBytes(url);
    if (bytes.byteLength > 160e6) throw new Error('too large to analyse');
    const OAC = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
    if (!OAC) throw new Error('no OfflineAudioContext');
    const big = bytes.byteLength > 20e6;
    const ctx = new OAC(1, 1, big ? 8000 : 22050);
    const buf: AudioBuffer = await new Promise((res, rej) => { const p = ctx.decodeAudioData(bytes, res, rej); if (p?.then) p.then(res, rej); });
    let data: WaveData | null = null;
    if (!big && buf.duration <= 900) {
      const A = await analyzeSpectrum(buf);
      if (A && A.frames > 0) {
        const [lo, mid, hi, lvl] = columns([A.low, A.mid, A.high, A.level], A.frames);
        data = { n: COLS, lo, mid, hi, lvl: norm(lvl), dur: buf.duration };
      }
    }
    waves.set(url, data || cheapBands(buf));
  } catch (e) {
    waves.set(url, 'failed');
    if (typeof console !== 'undefined') console.warn('[ambo] audio slide: waveform analysis failed', url.slice(0, 80), e);
  }
  waveListeners.forEach(f => { try { f(); } catch { /* */ } });
}
/** Band peaks for a URL: data, undefined while analysing, null if it failed. Starts analysis on first ask. */
export function waveFor(url: string): WaveData | null | undefined {
  const w = waves.get(url);
  if (w === 'failed') return null;
  if (w === 'pending') return undefined;
  if (w) return w;
  waves.set(url, 'pending');
  setTimeout(() => void analyse(url), 0);
  return undefined;
}
export function onWaveAnalysed(fn: () => void): () => void { waveListeners.add(fn); return () => waveListeners.delete(fn); }

/** A believable stand-in waveform (gallery, while analysing, analysis failed). */
const sampleCache = new Map<number, WaveData>();
export function sampleWave(seed: number): WaveData {
  let w = sampleCache.get(seed);
  if (w) return w;
  const n = 400, lo = new Float32Array(n), mid = new Float32Array(n), hi = new Float32Array(n), lvl = new Float32Array(n);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) {
    const t = i / n, phrase = .55 + .45 * Math.sin(t * Math.PI * 7 + seed) * Math.sin(t * Math.PI * 1.3 + 1);
    const env = Math.min(1, t * 14, (1 - t) * 10);
    const beat = (i % 8 < 2) ? 1 : .55;
    lvl[i] = clamp01(env * (.35 + .5 * Math.abs(phrase) + rnd() * .2));
    lo[i] = clamp01(lvl[i] * beat * (.75 + rnd() * .25));
    mid[i] = clamp01(lvl[i] * (.55 + rnd() * .35));
    hi[i] = clamp01(lvl[i] * (.25 + rnd() * .4));
  }
  w = { n, lo, mid, hi, lvl, dur: 0 };
  sampleCache.set(seed, w);
  return w;
}

// ── live analyser (master mix → reactive shimmer) ───────────────────────────
const liveFreq = new Uint8Array(256);
let liveAt = -1, liveLevel = 0;
function readLive(now: number): { level: number; freq: Uint8Array } {
  if (Math.abs(now - liveAt) < .004) return { level: liveLevel, freq: liveFreq };
  liveAt = now;
  try {
    const an = typeof window !== 'undefined' ? (window as any).getAmboMasterAnalyser?.() : null;
    if (!an) { liveLevel = 0; liveFreq.fill(0); return { level: 0, freq: liveFreq }; }
    an.getByteFrequencyData(liveFreq);
    let s = 0; for (let i = 0; i < 128; i++) s += liveFreq[i];
    liveLevel = clamp01(s / 128 / 255 * 1.5);
  } catch { liveLevel = 0; }
  return { level: liveLevel, freq: liveFreq };
}

// ── playback controller ─────────────────────────────────────────────────────
export interface PlayState {
  /** Media time (s), including startSec. */
  pos: number; startSec: number; dur: number; known: boolean;
  p: number; elapsed: number; remaining: number;
  playing: boolean; ended: boolean; endedFor: number;
  level: number;
  status: 'still' | 'empty' | 'loading' | 'playing' | 'blocked' | 'ended' | 'error';
  url: string;
}

const SYNC_CHANNEL = 'ambo-slide-audio-v1';
interface SyncMsg { t: 'slideAudio'; key: string; pos: number; dur: number; playing: boolean; ended: boolean; at: number }

class AudioController {
  el: HTMLAudioElement | null = null;
  private meta: HTMLAudioElement | null = null;
  private detach: ((el: HTMLMediaElement) => void) | null = null;
  private routed = false;
  private attempt = 0;
  private status: PlayState['status'] = 'loading';
  private endedAt = -1;
  private disposed = false;
  private offPrio: (() => void) | null = null;
  private retry: (() => void) | null = null;
  private bc: BroadcastChannel | null = null;
  private remote: SyncMsg | null = null;
  private lastPost = 0;
  private metaDur = 0;
  private liveOn = false;
  private memo: { at: number; s: PlayState } | null = null;
  readonly startSec: number; readonly loop: boolean; readonly volume: number;
  readonly key: string;

  constructor(private host: SlideHost, readonly url: string, fields: Record<string, string>) {
    this.startSec = parseStartSec(fields.startSec);
    this.loop = parseToggle(fields.loop);
    this.volume = parseVolume(fields.volume);
    this.key = `${host.templateId}|${url}|${this.startSec}`;
    try { this.bc = new BroadcastChannel(SYNC_CHANNEL); } catch { this.bc = null; }
    if (host.audible) void this.startAudible();
    else {
      if (this.bc) this.bc.onmessage = e => { const m = e.data as SyncMsg; if (m?.t === 'slideAudio' && m.key === this.key) this.remote = m; };
      this.loadMeta();
    }
    void waveFor(url);
  }

  private loadMeta() {
    try {
      const a = new Audio(); a.preload = 'metadata'; a.muted = true;
      a.addEventListener('loadedmetadata', () => { if (Number.isFinite(a.duration)) this.metaDur = a.duration; }, { once: true });
      a.src = this.url; this.meta = a;
    } catch { this.meta = null; }
  }

  private async startAudible() {
    try {
      const m = await import('../amboAudioEngine');
      const eng = m.amboAudio;
      this.detach = el => eng.detachElement(el);
      if (this.disposed) return;
      this.play(el => eng.attachElement(el, 'slides'));
    } catch {
      if (!this.disposed) this.play(null);
    }
    this.offPrio = subscribeAudioPriority(() => this.applyVolume());
  }

  /** CORS → same-origin proxy → direct (plays, but unrouted: a non-CORS element is silent through WebAudio). */
  private play(attach: ((el: HTMLMediaElement) => boolean) | null) {
    const cross = needsCors(this.url);
    const plan: Array<{ src: string; cors: boolean; route: boolean }> = cross
      ? [{ src: this.url, cors: true, route: true }, { src: proxied(this.url), cors: false, route: true }, { src: this.url, cors: false, route: false }]
      : [{ src: this.url, cors: false, route: true }];
    const step = plan[Math.min(this.attempt, plan.length - 1)];
    const a = new Audio();
    if (step.cors) a.crossOrigin = 'anonymous';
    a.preload = 'auto';
    a.loop = this.loop;
    this.el = a;
    this.applyVolume();
    a.addEventListener('loadedmetadata', () => { if (this.startSec > 0 && this.startSec < (a.duration || Infinity)) { try { a.currentTime = this.startSec; } catch { /* */ } } }, { once: true });
    a.addEventListener('playing', () => { this.status = 'playing'; this.endedAt = -1; });
    a.addEventListener('ended', () => { if (!this.loop) { this.status = 'ended'; this.endedAt = nowSec(); this.post(true); } });
    a.addEventListener('error', () => {
      if (this.disposed || this.el !== a) return;
      try { if (this.routed) this.detach?.(a); } catch { /* */ }
      this.routed = false;
      if (this.attempt < plan.length - 1) { this.attempt++; try { a.src = ''; } catch { /* */ } this.play(attach); }
      else this.status = 'error';
    });
    a.src = step.src;
    if (attach && step.route) { try { this.routed = attach(a); } catch { this.routed = false; } }
    void a.play().catch(() => {
      if (this.disposed || this.el !== a) return;
      if (this.status !== 'error') this.status = 'blocked';
      // Autoplay needs a prior gesture — retry on the next one rather than staying silent.
      const retry = () => { if (!this.disposed && this.el === a) void a.play().then(() => { this.status = 'playing'; }).catch(() => {}); };
      this.retry = retry;
      try { window.addEventListener('pointerdown', retry, { once: true }); window.addEventListener('keydown', retry, { once: true }); } catch { /* */ }
    });
  }

  private applyVolume() {
    const a = this.el; if (!a) return;
    const exit = 1 - clamp01(this.host.exitP);
    try { a.volume = clamp01(this.volume * otherAudioFactor() * exit); } catch { /* */ }
  }

  private post(force = false) {
    if (!this.bc || !this.el) return;
    const now = Date.now();
    if (!force && now - this.lastPost < 250) return;
    this.lastPost = now;
    const a = this.el;
    try { this.bc.postMessage({ t: 'slideAudio', key: this.key, pos: a.currentTime, dur: Number.isFinite(a.duration) ? a.duration : 0, playing: !a.paused && !a.ended, ended: a.ended && !this.loop, at: now } satisfies SyncMsg); } catch { /* */ }
  }

  state(): PlayState {
    const now = nowSec();
    if (this.memo && Math.abs(this.memo.at - now) < .004) return this.memo.s;
    const wave = waves.get(this.url);
    const waveDur = wave && typeof wave === 'object' ? wave.dur : 0;
    let pos = this.startSec, dur = 0, playing = false, ended = false;
    if (this.host.audible) {
      const a = this.el;
      if (a) {
        this.applyVolume();
        dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : waveDur;
        pos = a.readyState >= 1 ? a.currentTime : this.startSec;
        playing = !a.paused && !a.ended;
        ended = this.status === 'ended';
        if (ended && dur) pos = dur;
        this.post();
      }
    } else {
      const r = this.remote && Date.now() - this.remote.at < 2000 ? this.remote : null;
      dur = r?.dur || this.metaDur || waveDur;
      if (r) {
        pos = r.pos + (r.playing ? (Date.now() - r.at) / 1000 : 0);
        playing = r.playing; ended = r.ended;
      } else {
        pos = this.startSec + Math.max(0, this.host.shownSec);
        playing = true;
      }
      if (dur > 0 && pos >= dur) {
        if (this.loop) pos = this.startSec + ((pos - this.startSec) % Math.max(.1, dur - this.startSec));
        else { pos = dur; ended = true; playing = false; }
      }
      if (ended && this.endedAt < 0) this.endedAt = now;
      if (!ended) this.endedAt = -1;
      this.status = ended ? 'ended' : 'playing';
    }
    const known = dur > this.startSec;
    const p = known ? progressAt(pos, this.startSec, dur) : 0;
    const endedFor = ended && this.endedAt >= 0 ? now - this.endedAt : 0;
    const level = playing ? readLive(now).level : 0;
    const s: PlayState = {
      pos, startSec: this.startSec, dur, known, p: ended ? 1 : p,
      elapsed: Math.max(0, pos - this.startSec), remaining: known ? Math.max(0, dur - pos) : 0,
      playing, ended, endedFor, level, status: this.status, url: this.url,
    };
    // Full redraws while the file is live; settle back to the cached path ~2 s after the end.
    const want = !this.disposed && (this.status === 'loading' || this.status === 'playing' || this.status === 'blocked' || (ended && endedFor < 2));
    if (want !== this.liveOn) { this.liveOn = want; try { this.host.requestLive(want); } catch { /* */ } }
    this.memo = { at: now, s };
    return s;
  }

  dispose() {
    this.disposed = true;
    try { if (this.liveOn) this.host.requestLive(false); } catch { /* */ }
    this.offPrio?.();
    if (this.retry) { try { window.removeEventListener('pointerdown', this.retry); window.removeEventListener('keydown', this.retry); } catch { /* */ } }
    const a = this.el;
    if (a) {
      try { a.pause(); } catch { /* */ }
      if (this.routed) { try { this.detach?.(a); } catch { /* */ } }
      try { a.removeAttribute('src'); a.load(); } catch { /* */ }
    }
    if (this.meta) { try { this.meta.removeAttribute('src'); this.meta.load(); } catch { /* */ } }
    try { this.bc?.close(); } catch { /* */ }
    this.el = null; this.meta = null; this.bc = null;
  }
}

const controllers = new Map<string, AudioController>();
/** The host's controller (created on first draw; released with the host). */
function controllerFor(host: SlideHost): AudioController | null {
  const url = (host.fields.audioUrl || '').trim();
  let c = controllers.get(host.id);
  if (c && c.url !== url) { c.dispose(); controllers.delete(host.id); c = undefined; }
  if (!url) return null;
  if (!c) {
    if (typeof Audio === 'undefined') return null;
    c = new AudioController(host, url, host.fields);
    controllers.set(host.id, c);
    onHostDispose(host.id, () => { controllers.get(host.id)?.dispose(); controllers.delete(host.id); });
  }
  return c;
}

/** Gallery still: 40 % through a half-hour message. */
const STILL_DUR = 1860;
function stillState(): PlayState {
  return { pos: STILL_DUR * .4, startSec: 0, dur: STILL_DUR, known: true, p: .4, elapsed: STILL_DUR * .4, remaining: STILL_DUR * .6, playing: false, ended: false, endedFor: 0, level: 0, status: 'still', url: '' };
}
const EMPTY: PlayState = { pos: 0, startSec: 0, dur: 0, known: false, p: 0, elapsed: 0, remaining: 0, playing: false, ended: false, endedFor: 0, level: 0, status: 'empty', url: '' };

/** The play state every audio drawer reads this frame. */
export function playStateFor(env: LiveEnv): PlayState {
  const host = env.host;
  if (!host) return stillState();
  const c = controllerFor(host);
  return c ? c.state() : EMPTY;
}

/** Test / diagnostics: the element and state behind a host. */
export function audioSlideDebug(hostId: string): { el: HTMLAudioElement | null; state: PlayState | null } | null {
  const c = controllers.get(hostId);
  return c ? { el: c.el, state: c.state() } : null;
}

// ── fonts & paint ───────────────────────────────────────────────────────────
const fontAsked = new Set<string>();
function ensureThemeFonts(th: SlideTheme) {
  if (fontAsked.has(th.id) || typeof document === 'undefined') return;
  fontAsked.add(th.id);
  try {
    ensureFontsLoaded([th.t.label, th.t.display, th.t.text, th.t.accent]);
    const fonts = (document as any).fonts;
    if (fonts?.load) for (const [k, w] of [[th.t.label, th.t.labelWeight], [th.t.display, th.t.displayWeight], [th.t.text, th.t.textWeight], [th.t.accent, th.t.accentWeight ?? 400]] as Array<[string, number]>)
      void fonts.load(`${w} 32px ${fontCss(k)}`).catch(() => null);
  } catch { /* */ }
}

function paintFor(env: LiveEnv, onPanel: boolean): ProgressPaint {
  const th = env.th, c = th.c;
  ensureThemeFonts(th);
  return {
    ink: onPanel ? c.panelInk : c.ink, muted: onPanel ? c.panelMuted : c.muted,
    accent: c.accent, accent2: c.accent2, accent3: c.accent3, ground: onPanel && /^#/.test(c.panel) ? c.panel : c.ground,
    dark: onPanel ? !/^#(f|e|d)/i.test(c.panel) && th.dark : th.dark,
    label: fontCss(th.t.label), labelWeight: th.t.labelWeight,
    num: fontCss(th.t.display), numWeight: th.t.displayWeight, numItalic: !!th.t.displayItalic,
    u: lay(env.W, env.H).u,
  };
}

/** Media clock: seconds since take on a live host (runs even under reduced motion — the audio does), else the ambient clock. */
const clockOf = (env: LiveEnv) => env.host ? Math.max(0, env.host.shownSec) : env.t;
const str = (v: unknown, d = '') => typeof v === 'string' ? v : d;
const num = (v: unknown, d: number) => typeof v === 'number' && Number.isFinite(v) ? v : d;

// ── audio.waveform ──────────────────────────────────────────────────────────
function bandMax(a: Float32Array, i0: number, i1: number): number {
  let m = 0; for (let i = Math.max(0, i0); i < i1 && i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
function emptyNote(ctx: Ctx, o: SlideObj, P: ProgressPaint, text: string) {
  const cy = o.y + o.h / 2;
  ctx.setLineDash([P.u * .3, P.u * .7]); ctx.strokeStyle = rgba(P.muted, .55); ctx.lineWidth = Math.max(1, P.u * .14);
  ctx.beginPath(); ctx.moveTo(o.x, cy); ctx.lineTo(o.x + o.w, cy); ctx.stroke(); ctx.setLineDash([]);
  const size = Math.max(P.u * 1.2, Math.min(o.h * .22, P.u * 1.8));
  ctx.font = `${P.labelWeight} ${size}px ${P.label}`;
  const tw = ctx.measureText(text).width + size * 2.4, th = size * 2.2;
  ctx.fillStyle = P.dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = rgba(P.accent, .7); ctx.lineWidth = Math.max(1, P.u * .1);
  ctx.beginPath(); ctx.roundRect?.(o.x + o.w / 2 - tw / 2, cy - th / 2, tw, th, th / 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, o.x + o.w / 2, cy);
}

registerLiveDrawer('audio.waveform', (ctx, o, env) => {
  const props = o.live?.props || {};
  const P = paintFor(env, !!props.onPanel);
  const st = playStateFor(env);
  const seed = num(props.seed, 7);
  if (st.status === 'empty') { emptyNote(ctx, o, P, 'Add audio'); return; }
  const real = st.url ? waveFor(st.url) : null;
  const W = real || sampleWave(seed);
  const pending = !!st.url && real === undefined;
  const style = str(props.style, 'spectral');
  const live = env.host && st.playing ? readLive(nowSec()) : null;
  const x0 = o.x, y0 = o.y, w = o.w, h = o.h;
  const base = style === 'bottom' ? y0 + h : y0 + h / 2;
  const half = style === 'bottom' ? h : h / 2;
  const scroll = style === 'scroll' && st.known && W.dur > 0;
  // Overview maps x → fraction of the file; scroll keeps the playhead centred over a ~16 s window.
  const winSec = 16;
  const frac = (xFrac: number) => scroll ? (st.pos - winSec / 2 + xFrac * winSec) / st.dur : xFrac;
  const playX = scroll ? x0 + w / 2 : x0 + w * st.p;
  const bw = style === 'line' ? 1 : Math.max(2, Math.min(P.u * .55, w / 90));
  const gap = style === 'line' ? 0 : style === 'blocks' ? bw * .5 : bw * .6;
  const n = Math.max(16, Math.floor(w / (bw + gap)));
  const quant = style === 'blocks' ? Math.max(4, Math.round(h / (P.u * .9))) : 0;
  const alphaP = pending ? .35 : 1;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const f0 = frac(i / n), f1 = frac((i + 1) / n);
    if (f1 < 0 || f0 > 1) { if (style === 'line') pts.push(0); continue; }
    const c0 = Math.floor(f0 * W.n), c1 = Math.max(c0 + 1, Math.ceil(f1 * W.n));
    let lo = bandMax(W.lo, c0, c1), mi = bandMax(W.mid, c0, c1), hi = bandMax(W.hi, c0, c1);
    const bx = x0 + i * (bw + gap);
    const played = bx + bw / 2 <= playX;
    // Live shimmer near the playhead: the bars there breathe with the mix.
    if (live && live.level > .01) {
      const d = Math.abs(bx - playX) / (w * .07);
      if (d < 1) { const k = (1 - d) * (1 - d) * live.level * (.6 + .4 * (live.freq[(i * 7) % 96] / 255)); lo = Math.min(1, lo * (1 + k)); mi = Math.min(1, mi * (1 + k * .9)); hi = Math.min(1, hi * (1 + k * 1.2)); }
    } else if (!env.host || pending) {
      const k = .04 * Math.sin(clockOf(env) * 2.4 + i * .35); lo += k * lo; mi += k * mi;
    }
    if (style === 'line') { pts.push(Math.max(lo, mi)); continue; }
    const q = (v: number) => quant ? Math.ceil(v * quant) / quant : v;
    const colA = played ? 1 : .32;
    const vLo = Math.max(.04, q(lo)), vMi = Math.max(.03, q(mi * .8)), vHi = Math.max(.02, q(hi * .55));
    const r = style === 'pill' ? bw / 2 : 0;
    const bar = (v: number, color: string, a: number) => {
      ctx.fillStyle = rgba(color, a * alphaP);
      const hh = Math.max(1, v * half);
      if (r && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, base - (style === 'bottom' ? hh : hh), bw, style === 'bottom' ? hh : hh * 2, r); ctx.fill(); }
      else ctx.fillRect(bx, base - hh, bw, style === 'bottom' ? hh : hh * 2);
    };
    if (style === 'spectral' || style === 'scroll') {
      bar(vLo, played ? P.accent2 : P.muted, colA * .9);
      bar(vMi, played ? P.accent : P.muted, colA);
      bar(vHi, played ? P.ink : P.muted, colA * (played ? .85 : .7));
    } else {
      bar(Math.max(vLo, vMi), played ? P.accent : P.muted, colA);
    }
  }
  if (style === 'line' && pts.length) {
    const tr = (sign: number, upTo: number) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) { const px = x0 + w * i / (pts.length - 1); if (px > upTo + 1) break; const py = base - sign * pts[i] * half * .92; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    };
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.2, P.u * .16);
    ctx.strokeStyle = rgba(P.muted, .45 * alphaP); tr(1, x0 + w); ctx.stroke(); tr(-1, x0 + w); ctx.stroke();
    ctx.strokeStyle = rgba(P.accent, alphaP); tr(1, playX); ctx.stroke(); tr(-1, playX); ctx.stroke();
  }
  if (pending) {
    // Analysing: a soft scan travelling across the stand-in.
    const sx = x0 + ((clockOf(env) * .35) % 1) * w;
    const g = ctx.createLinearGradient(sx - w * .1, 0, sx + w * .1, 0);
    g.addColorStop(0, rgba(P.accent, 0)); g.addColorStop(.5, rgba(P.accent, .25)); g.addColorStop(1, rgba(P.accent, 0));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
  }
  // Playhead.
  if (props.playhead !== false && !(st.ended && !scroll)) {
    const lw = Math.max(1.5, P.u * .18), glow = .25 + (live ? live.level * .6 : 0);
    ctx.fillStyle = rgba(P.accent, glow); ctx.fillRect(playX - lw * 2.5, y0, lw * 5, h);
    ctx.fillStyle = P.ink; ctx.fillRect(playX - lw / 2, y0, lw, h);
    ctx.beginPath(); ctx.arc(playX, y0, lw * 1.8, 0, TAU); ctx.fill();
  }
});

// ── audio.progress ──────────────────────────────────────────────────────────
const chapterMemo = new Map<string, number[]>();
registerLiveDrawer('audio.progress', (ctx, o, env) => {
  const props = o.live?.props || {};
  const P = paintFor(env, !!props.onPanel);
  const st = playStateFor(env);
  const style: ProgressStyle = isProgressStyle(str(props.style)) ? str(props.style) as ProgressStyle : 'bar';
  let chapters: number[] = [];
  if (style === 'chapters') {
    const text = str(props.transcript);
    const key = `${text.length}|${text.slice(0, 40)}|${Math.round(st.dur)}|${st.startSec}`;
    chapters = chapterMemo.get(key) || [];
    if (!chapterMemo.has(key)) {
      const parsed = parseTranscript(text);
      chapters = chapterMarks(parsed.timed ? parsed.cues.map(c => c.start) : [], st.startSec, st.dur || STILL_DUR);
      if (chapterMemo.size > 30) chapterMemo.clear();
      chapterMemo.set(key, chapters);
    }
  }
  const s: ProgressState = {
    p: st.p, elapsed: st.elapsed, remaining: st.remaining, known: st.known, ended: st.ended,
    playing: st.playing, level: st.level, t: clockOf(env), endedFor: st.endedFor, chapters,
  };
  drawProgress(ctx, style, o.x, o.y, o.w, o.h, s, P, num(props.seed, 3));
});

// ── audio.transcript ────────────────────────────────────────────────────────
interface Wrapped { lines: string[]; chars: number }
const wrapMemo = new Map<string, Wrapped>();
function wrap(ctx: Ctx, font: string, text: string, maxW: number): Wrapped {
  const key = `${font}|${Math.round(maxW)}|${text}`;
  const hit = wrapMemo.get(key);
  if (hit) return hit;
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width <= maxW || !line) line = probe;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  const res = { lines, chars: text.length };
  if (wrapMemo.size > 600) wrapMemo.clear();
  wrapMemo.set(key, res);
  return res;
}
const cuesMemo = new Map<string, Cue[]>();
function cuesFor(text: string, t0: number, dur: number): Cue[] {
  const key = `${Math.round(dur * 10)}|${t0}|${text}`;
  let c = cuesMemo.get(key);
  if (!c) { c = timeCues(parseTranscript(text), t0, dur > t0 ? dur : t0 + 120); if (cuesMemo.size > 40) cuesMemo.clear(); cuesMemo.set(key, c); }
  return c;
}
const ease = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);

/** Draw wrapped lines with an optional karaoke fill through `fill` (0..1 of the characters). */
function drawLines(ctx: Ctx, lines: string[], x: number, y: number, w: number, lh: number, align: CanvasTextAlign, base: string, hot: string | null, fill: number) {
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  let done = fill * total;
  lines.forEach((ln, i) => {
    const by = y + lh * (i + .8);
    ctx.fillStyle = base; ctx.fillText(ln, ax, by);
    if (hot && done > 0) {
      const k = Math.min(1, done / Math.max(1, ln.length));
      done -= ln.length;
      const lw = ctx.measureText(ln).width, lx = align === 'center' ? ax - lw / 2 : align === 'right' ? ax - lw : ax;
      ctx.save(); ctx.beginPath(); ctx.rect(lx - 2, by - lh, lw * k + 2, lh * 1.3); ctx.clip();
      ctx.fillStyle = hot; ctx.fillText(ln, ax, by); ctx.restore();
    }
  });
}

registerLiveDrawer('audio.transcript', (ctx, o, env) => {
  const props = o.live?.props || {};
  const text = str(props.text);
  if (!text.trim()) return;
  const st = playStateFor(env);
  const th = env.th, c = th.c, onPanel = !!props.onPanel;
  ensureThemeFonts(th);
  const ink = onPanel ? c.panelInk : c.ink, muted = onPanel ? c.panelMuted : c.muted;
  const hot = str(props.hot) === 'accent' ? c.accent : ink;
  const fam = str(props.family, fontCss(th.t.text)), weight = num(props.weight, th.t.textWeight), italic = props.italic ? 'italic ' : '';
  let size = num(props.size, 32);
  const leading = num(props.leading, 1.3), align = (str(props.align, 'left') as CanvasTextAlign), mode = str(props.mode, 'scroll');
  const maxLines = Math.max(1, num(props.maxLines, 3));
  const dur = st.known ? st.dur : (st.status === 'still' ? STILL_DUR : 0);
  const cues = cuesFor(text, st.startSec, dur || st.startSec + 120);
  if (!cues.length) return;
  const still = cues[Math.min(cues.length - 1, Math.floor(cues.length * .4))];
  const t = st.status === 'still' ? still.start + (still.end - still.start) * .45 : st.ended ? Infinity : st.pos;
  const idx = cueIndexAt(cues, t);
  const cur = Math.max(0, idx), upcoming = idx < 0;
  const fillOf = (i: number) => upcoming ? 0 : i < cur ? 1 : i === cur ? (st.ended ? 1 : cueProgress(cues[i], t)) : 0;
  ctx.save();
  ctx.beginPath(); ctx.rect(o.x - size * .2, o.y - size * .1, o.w + size * .4, o.h + size * .3); ctx.clip();
  if (mode === 'single' || mode === 'karaoke') {
    // One phrase at a time, shrunk to fit; the previous one lifts away as the next arrives.
    let font = `${italic}${weight} ${size}px ${fam}`, wr = wrap(ctx, font, cues[cur].text, o.w);
    for (let k = 0; k < 10 && (wr.lines.length > maxLines || wr.lines.length * size * leading > o.h); k++) { size *= .9; font = `${italic}${weight} ${size}px ${fam}`; wr = wrap(ctx, font, cues[cur].text, o.w); }
    const lh = size * leading, since = upcoming || st.status === 'still' ? 9 : t - cues[cur].start, k = ease(since / .45);
    const blockH = wr.lines.length * lh, y = o.y + (o.h - blockH) / 2;
    if (k < 1 && cur > 0) {
      const pw = wrap(ctx, font, cues[cur - 1].text, o.w), py = o.y + (o.h - pw.lines.length * lh) / 2 - k * lh * .8;
      ctx.globalAlpha = (1 - k) * .8; ctx.font = font;
      drawLines(ctx, pw.lines, o.x, py, o.w, lh, align, ink, null, 0);
    }
    ctx.globalAlpha = upcoming ? .55 : k; ctx.font = font;
    drawLines(ctx, wr.lines, o.x, y + (1 - k) * lh * .6, o.w, lh, align, mode === 'karaoke' ? rgba(muted, .9) : ink, mode === 'karaoke' ? hot : null, fillOf(cur));
    ctx.restore();
    return;
  }
  // Scroll: the whole transcript as a column; the current phrase rides a reading line.
  const font = `${italic}${weight} ${size}px ${fam}`, lh = size * leading, gapH = lh * .4;
  const blocks = cues.map(q => wrap(ctx, font, q.text, o.w));
  const tops: number[] = []; let acc = 0;
  for (const b of blocks) { tops.push(acc); acc += b.lines.length * lh + gapH; }
  const anchor = o.y + Math.min(o.h * .34, lh * 1.2);
  const since = upcoming || st.status === 'still' ? 9 : t - cues[cur].start, k = ease(since / .55);
  const from = cur > 0 ? tops[cur - 1] : tops[cur], off = from + (tops[cur] - from) * k;
  ctx.font = font;
  for (let i = Math.max(0, cur - 3); i < blocks.length; i++) {
    const y = anchor + tops[i] - off;
    if (y > o.y + o.h + lh) break;
    if (y + blocks[i].lines.length * lh < o.y - lh) continue;
    const isCur = i === cur && !upcoming;
    // Fade toward the top and bottom edges of the column.
    const mid = y + blocks[i].lines.length * lh / 2, dist = Math.abs(mid - (anchor + lh)) / Math.max(lh, o.h);
    ctx.globalAlpha = isCur ? 1 : Math.max(.12, (i < cur ? .5 : .75) - dist * .9);
    drawLines(ctx, blocks[i].lines, o.x, y, o.w, lh, align, isCur ? rgba(muted, .95) : muted, isCur ? hot : null, isCur ? fillOf(i) : 0);
  }
  ctx.restore();
});

// ── audio.viz ───────────────────────────────────────────────────────────────
/**
 * The template editor's visualizer value → a layer content (mirrors
 * resolveVisualizerValue in AmboTemplateVisualizerPicker): a generator mode id,
 * 'MILKDROP:<preset>' (GeneratorSource handles the prefix), or
 * 'SHADER:<library name>' looked up in the Pixels shader library (loaded lazily,
 * only when such a value is used). Unknown shader → null (procedural fallback).
 */
export async function resolveVizContent(v: string): Promise<{ kind: 'GENERATOR'; mode: string } | { kind: 'SHADER'; src: string; name: string } | null> {
  if (!v) return null;
  if (/^SHADER:/i.test(v)) {
    const name = v.slice('SHADER:'.length);
    try {
      const lib: Array<{ name: string; src: string }> = (await import('../../../components/plajahPixels/components/ShaderPanel')).SHADER_LIBRARY as any;
      const hit = lib.find(s => s.name === name);
      return hit ? { kind: 'SHADER', src: hit.src, name } : null;
    } catch { return null; }
  }
  return { kind: 'GENERATOR', mode: v };
}

interface VizEntry { src: { frame(t: number): CanvasImageSource | null; dispose(): void } | null; mode: string; failed: boolean }
const vizSources = new Map<string, VizEntry>();
function vizFor(host: SlideHost, mode: string, w: number, h: number): VizEntry {
  const key = `${host.id}|${mode}`;
  let e = vizSources.get(key);
  if (e) return e;
  e = { src: null, mode, failed: false };
  vizSources.set(key, e);
  const entry = e;
  const k = Math.min(1, 1280 / Math.max(1, w), 720 / Math.max(1, h)), vw = Math.max(64, Math.round(w * k)), vh = Math.max(36, Math.round(h * k));
  void (async () => {
    const m = await import('../layerSources');
    const content = await resolveVizContent(mode);
    if (!vizSources.has(key)) return;
    if (!content) { entry.failed = true; return; }
    entry.src = content.kind === 'SHADER'
      ? new m.ShaderSource(content as any, vw, vh)
      : new m.GeneratorSource(content as any, vw, vh);
  })().catch(() => { entry.failed = true; });
  onHostDispose(host.id, () => { const v = vizSources.get(key); vizSources.delete(key); try { v?.src?.dispose(); } catch { /* */ } });
  return e;
}

/** A still, audio-shaped visual in the theme's colours (gallery, loading, unavailable). */
function proceduralViz(ctx: Ctx, x: number, y: number, w: number, h: number, th: SlideTheme, t: number, level: number) {
  const c = th.c, cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * .32;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .6);
  g.addColorStop(0, rgba(c.accent, th.dark ? .28 : .2)); g.addColorStop(.5, rgba(c.accent3, th.dark ? .12 : .08)); g.addColorStop(1, rgba(c.accent3, 0));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const n = 96;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = TAU * i / n + t * .05, v = .3 + .7 * Math.abs(Math.sin(i * .37 + t * 1.1) * Math.sin(i * .11 + 1.3)) * (1 + level);
    ctx.strokeStyle = rgba(i % 3 ? c.accent : c.accent2, .55);
    ctx.lineWidth = Math.max(1, R * TAU / n * .45);
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * R * (1 + v * .45), cy + Math.sin(a) * R * (1 + v * .45)); ctx.stroke();
  }
  ctx.strokeStyle = rgba(c.ink, .25); ctx.lineWidth = Math.max(1, R * .01);
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * (.55 + k * .14 + .02 * Math.sin(t + k)), 0, TAU); ctx.stroke(); }
}

registerLiveDrawer('audio.viz', (ctx, o, env) => {
  const props = o.live?.props || {};
  const th = env.th;
  const mode = resolveVizMode(str(props.mode), th);
  if (!mode) return;
  const shape = str(props.shape, 'rect'), opacity = num(props.opacity, th.dark ? .9 : .6);
  const st = playStateFor(env);
  ctx.save();
  ctx.beginPath();
  if (shape === 'circle') ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, TAU);
  else if (shape === 'round' && ctx.roundRect) ctx.roundRect(o.x, o.y, o.w, o.h, Math.min(o.w, o.h) * .08);
  else ctx.rect(o.x, o.y, o.w, o.h);
  ctx.clip();
  let img: CanvasImageSource | null = null;
  if (env.host) {
    const v = vizFor(env.host, mode, o.w, o.h);
    try { img = v.src ? v.src.frame(clockOf(env)) : null; } catch { img = null; }
  }
  if (img) {
    ctx.globalAlpha *= opacity;
    if (th.dark) ctx.globalCompositeOperation = 'screen';
    else { ctx.globalCompositeOperation = 'multiply'; ctx.filter = 'invert(1) hue-rotate(180deg) saturate(1.2)'; }
    try { ctx.drawImage(img, o.x, o.y, o.w, o.h); } catch { /* */ }
    ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.globalAlpha *= Math.min(1, opacity + .1);
    proceduralViz(ctx, o.x, o.y, o.w, o.h, th, env.host ? clockOf(env) : 0, st.level);
  }
  // Melt the region's edges into the ground so it reads as part of the page.
  const fade = str(props.fade, 'none');
  if (fade !== 'none') {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const gc = /^#/.test(th.c.ground) ? th.c.ground : '#000000';
    if (fade === 'bottom' || fade === 'edges') {
      const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
      g.addColorStop(0, rgba(gc, fade === 'edges' ? .85 : 0)); g.addColorStop(.3, rgba(gc, 0)); g.addColorStop(.7, rgba(gc, 0)); g.addColorStop(1, rgba(gc, .9));
      ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
    }
    if (fade === 'edges' || fade === 'sides') {
      const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
      g.addColorStop(0, rgba(gc, .85)); g.addColorStop(.18, rgba(gc, 0)); g.addColorStop(.82, rgba(gc, 0)); g.addColorStop(1, rgba(gc, .85));
      ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }
  ctx.restore();
});

// ── transcription hook ──────────────────────────────────────────────────────
/**
 * Fill a transcript from the audio itself: on-device Whisper (transformers.js,
 * the same CDN build Live Translation uses) with segment timestamps, returned
 * as "m:ss text" lines ready for the transcript field. Heavy (one-time model
 * download, WebGPU when available) — call it from an explicit operator action.
 */
const TF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
export async function transcribeAudioUrl(url: string, onStatus?: (s: string) => void): Promise<string> {
  onStatus?.('Reading audio…');
  const bytes = await fetchBytes(url);
  const OAC = (globalThis as any).OfflineAudioContext;
  const ctx = new OAC(1, 1, 16000);
  const buf: AudioBuffer = await ctx.decodeAudioData(bytes);
  const pcm = buf.getChannelData(0);
  onStatus?.('Loading speech recognition… (one-time download)');
  const tf: any = await import(/* @vite-ignore */ TF_CDN);
  const asr = await tf.pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { device: (navigator as any).gpu ? 'webgpu' : 'wasm' });
  onStatus?.('Transcribing…');
  const out = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  const chunks: Array<{ timestamp: [number, number | null]; text: string }> = (Array.isArray(out) ? out[0] : out)?.chunks || [];
  const cues: Cue[] = chunks.map(ch => ({ start: ch.timestamp[0] || 0, end: ch.timestamp[1] ?? (ch.timestamp[0] || 0) + 3, text: (ch.text || '').trim() })).filter(c => c.text);
  onStatus?.('Done');
  return cues.length ? cuesToLines(cues) : ((Array.isArray(out) ? out[0]?.text : out?.text) || '');
}

/** Diagnostics: visualizer sources behind live hosts. */
export function audioVizDebug(): Array<{ key: string; path: string | null; failed: boolean }> {
  return [...vizSources.entries()].map(([key, v]) => ({ key, path: (v.src as any)?.renderPath ?? null, failed: v.failed }));
}
