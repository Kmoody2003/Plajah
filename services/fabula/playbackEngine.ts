// ═══════════════════════════════════════════════════════════════════════════
// playbackEngine — Fabula's timeline PLAYBACK core.
//
// WHY THIS EXISTS. Playback used to be N independent <audio>/<video> elements,
// each free-running on its own clock, synced to a wall-clock transport only at
// cut boundaries. Every element was a race: a play() rejection after remount
// churn, a MediaElementSource on a suspended context, or a cold load at a cut
// meant silence or black — permanently, because nothing watched or retried.
//
// THE MODEL NOW (how every serious browser NLE works):
//   1. ONE AudioContext is the master clock.
//   2. Every audio source on the timeline (a-track clips AND the embedded audio
//      of v-track video clips) is DECODED ONCE into an AudioBuffer and scheduled
//      sample-accurately with AudioBufferSourceNodes — gapless by construction.
//      Fades and clip volume are gain ramps; each track has a full mixer strip
//      (EQ → comp → pan → fader → analyser → master) matching audioGraph's
//      element strips, so meters/sends/limiter behave identically.
//   3. The transport playhead DERIVES from ctx.currentTime (see clock()).
//   4. <video> elements are slaved to that clock with playbackRate micro-nudges
//      (no visible seeks) and clamped at their source's end (no wrap/loop).
//
// Anything the engine cannot decode (exotic codec, oversized file, no CORS)
// lands in `unplayable` and the old element path takes over for just that clip —
// reliability first, never silence.
// ═══════════════════════════════════════════════════════════════════════════

import {
  getAudioCtx, resumeAudioCtx, meterRegistry, EQ_BANDS,
  getMasterInput, getFxSends, needsCors,
} from './audioGraph';
import { getBytes as mediaGetBytes } from './mediaStore';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── pure schedule planning (unit-tested — tests/playbackPlan.test.ts) ────────

export interface PlanEntry {
  clipId: string;
  url: string;
  assetId?: string;  // resolved asset id — unlocks the IndexedDB-bytes decode rescue
  trackId: string;
  when: number;      // seconds from t0 until this clip starts (0 = already inside it)
  offset: number;    // seconds into the SOURCE to start from
  dur: number;       // seconds to play
  vol: number;       // clip gain (clip.audio.vol)
  fadeIn: number;    // remaining fade-in, in seconds from this entry's start (0 = none)
  fadeInFrom: number;// gain value at entry start when joining mid-fade (0..1)
  fadeOut: number;   // fade-out length at the clip's tail
  eq?: number[];
  comp?: any;
}

/** Everything audible from t0 onward. Pure — shared by the engine and its tests. */
export function planPlayback(clips: any[], mediaPool: any[], t0: number): PlanEntry[] {
  const out: PlanEntry[] = [];
  for (const c of clips || []) {
    if (!c?.assetId || c.disabled) continue;
    const isA = /^a\d+$/.test(c.trackId || '');
    const isV = /^v\d+$/.test(c.trackId || '');
    if (!isA && !isV) continue;
    let asset = (mediaPool || []).find((a) => a.id === c.assetId);
    let extra = 0;
    if (asset?.type === 'multicam') {
      const ang = asset.angles?.[c.angle || 0];
      extra = ang?.offset || 0;
      asset = ang ? (mediaPool || []).find((a) => a.id === ang.assetId) : null;
    }
    if (!asset?.url) continue;
    if (isA && asset.type !== 'audio' && asset.type !== 'video') continue;
    // v-track video with a LINKED audio clip (c.av) plays its sound via that a-clip.
    if (isV && (asset.type !== 'video' || c.av)) continue;
    const end = c.start + c.duration;
    if (end <= t0 + 0.005) continue;                    // already behind the playhead
    const skip = Math.max(0, t0 - c.start);             // joining mid-clip
    const fadeIn = c.fx?.fadeIn || 0;
    out.push({
      clipId: c.id, url: asset.url, assetId: asset.id, trackId: c.trackId,
      when: Math.max(0, c.start - t0),
      offset: (c.srcIn || 0) + extra + skip,
      dur: Math.max(0.01, c.duration - skip),
      vol: c.audio?.vol == null ? 1 : c.audio.vol,
      fadeIn: Math.max(0, fadeIn - skip),
      fadeInFrom: fadeIn > 0 ? clamp(skip / fadeIn, 0, 1) : 1,
      fadeOut: c.fx?.fadeOut || 0,
      eq: c.audio?.eq, comp: c.audio?.comp,
    });
  }
  return out;
}

/** Solo derives to mute: if ANY track is soloed, non-soloed tracks mute (pure, tested). */
export function effectiveTrack(trackId: string, settings: Record<string, any>): any {
  const ts = settings?.[trackId] || {};
  const anySolo = Object.values(settings || {}).some((t: any) => t && t.solo);
  return anySolo && !ts.solo ? { ...ts, mute: true } : ts;
}

// ── decoded-buffer cache ─────────────────────────────────────────────────────

const MAX_CACHE_BYTES = 384 * 1024 * 1024;   // decoded PCM budget (~16 min stereo @48k)
const MAX_FETCH_BYTES = 220 * 1024 * 1024;   // don't pull giant video files just for audio

interface CacheEntry { buf: AudioBuffer; bytes: number; at: number; }
const bufCache = new Map<string, CacheEntry>();
const decoding = new Map<string, Promise<AudioBuffer | null>>();
const unplayable = new Set<string>();
const unplayableWhy = new Map<string, string>();

// ── ENGINE WATCHDOG ──────────────────────────────────────────────────────────
// On some machines (Windows + Bluetooth/USB audio, device switches, exclusive-
// mode apps) the AudioContext's clock STALLS mid-session — sometimes while still
// reporting state 'running'. A frozen clock is catastrophic: scheduled audio goes
// silent AND the video sync yanks every clip backwards in a few-frame loop (the
// element runs ahead of a frozen `expected`). The watchdog measures real clock
// progress against wall time; on a stall it tries resume(), and if the context
// stays dead it PERMANENTLY demotes the engine for this session: wall-clock
// transport + direct (un-routed) element audio — degraded but always audible.
let engineDead = false;
const watchdog = { lastWall: 0, lastCtx: 0, stallMs: 0 };
export function engineIsDead(): boolean { return engineDead; }
function declareEngineDead(reason: string) {
  if (engineDead) return;
  engineDead = true;
  console.warn('[playbackEngine] AudioContext unusable (' + reason + ') — demoting to direct element playback for this session.');
  stopPlayback();
  notify(); // re-render: elements mount everywhere, video elements unmute
}

const listeners = new Set<() => void>();
/** Subscribe to engine-state changes (decode failures → element fallbacks re-render). */
export function subscribePlayback(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const notify = () => { for (const cb of [...listeners]) { try { cb(); } catch { /* */ } } };

function cacheBytes(): number { let n = 0; for (const e of bufCache.values()) n += e.bytes; return n; }
function evictLRU(needed: number) {
  while (cacheBytes() + needed > MAX_CACHE_BYTES && bufCache.size) {
    let oldest: string | null = null; let at = Infinity;
    for (const [k, e] of bufCache) if (e.at < at) { at = e.at; oldest = k; }
    if (!oldest) break;
    bufCache.delete(oldest);
  }
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  // A hung fetch (cold cloud URL) must not leave a clip silently "pending" forever —
  // time out and hand the clip to the element fallback, which streams progressively.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  let res: Response;
  try { res = await fetch(url, { ...(needsCors(url) ? { mode: 'cors' as RequestMode } : {}), signal: ac.signal }); }
  finally { clearTimeout(timer); }
  if (!res.ok) throw new Error('http ' + res.status);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_FETCH_BYTES) throw new Error('too large to decode');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_FETCH_BYTES) throw new Error('too large to decode');
  return bytes;
}

async function decodeUrl(url: string, assetId?: string): Promise<AudioBuffer | null> {
  const hit = bufCache.get(url);
  if (hit) { hit.at = Date.now(); return hit.buf; }
  if (unplayable.has(url)) return null;
  const pending = decoding.get(url);
  if (pending) return pending;
  const p = (async () => {
    const ctx = getAudioCtx();
    if (!ctx) return null;
    let firstErr: any = null;
    // Stage 1: fetch the asset's URL and decode it.
    try {
      const bytes = await fetchBytes(url);
      const buf = await ctx.decodeAudioData(bytes.slice(0));
      const pcm = buf.length * buf.numberOfChannels * 4;
      evictLRU(pcm);
      bufCache.set(url, { buf, bytes: pcm, at: Date.now() });
      return buf;
    } catch (e) { firstErr = e; }
    // Stage 2 (rescue): decode straight from the LOCAL bytes in the media substrate —
    // sidesteps every fetch-level failure (CORS, tokens, dead blob URLs, network).
    if (assetId) {
      try {
        const blob = await mediaGetBytes('studio:blob:' + assetId);
        if (blob && blob.size && blob.size <= MAX_FETCH_BYTES) {
          const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
          const pcm = buf.length * buf.numberOfChannels * 4;
          evictLRU(pcm);
          bufCache.set(url, { buf, bytes: pcm, at: Date.now() });
          console.info('[playbackEngine] rescued from local bytes:', url);
          return buf;
        }
      } catch (e2) { if (!firstErr) firstErr = e2; }
    }
    const why = (firstErr && (firstErr.message || String(firstErr))) || 'unknown';
    console.warn('[playbackEngine] cannot decode — element fallback for', url, '·', why);
    unplayable.add(url);
    unplayableWhy.set(url, why);
    notify();                                   // let React mount the element fallback
    return null;
  })().finally(() => { decoding.delete(url); });
  decoding.set(url, p);
  return p;
}

/** True when the ENGINE owns this url's audio (decoded or in flight). The element
 *  path should stand down for these; unplayable urls stay on elements. */
export function enginePlayable(url: string | null | undefined): boolean {
  if (!url || engineDead) return false;
  return !unplayable.has(url);
}

/** Background-decode every audio source the timeline references (project open / edits). */
export function warmAudio(clips: any[], mediaPool: any[]) {
  try {
    const seen = new Set<string>();
    for (const e of planPlayback(clips, mediaPool, 0)) {
      if (seen.has(e.url)) continue;
      seen.add(e.url);
      void decodeUrl(e.url, e.assetId);
      if (seen.size >= 32) break;
    }
  } catch { /* warm is best-effort */ }
}

// ── track strips (mixer parity with audioGraph's element strips) ─────────────

interface TrackBus {
  input: GainNode; eq: BiquadFilterNode[]; comp: DynamicsCompressorNode; mk: GainNode;
  pan: StereoPannerNode | null; gain: GainNode; analyser: AnalyserNode;
  sendR: GainNode; sendD: GainNode; meterBuf: Float32Array;
}
const trackBuses = new Map<string, TrackBus>();

function applyBand(eq: BiquadFilterNode[], vals?: number[]) {
  eq.forEach((f, i) => { f.gain.value = clamp((vals && vals[i]) || 0, -24, 24); });
}
function applyComp(c: DynamicsCompressorNode, mk: GainNode, s?: any) {
  const on = !!s?.on;
  c.threshold.value = on ? clamp(s.threshold ?? -24, -100, 0) : 0;
  c.ratio.value = on ? clamp(s.ratio ?? 3, 1, 20) : 1;
  c.attack.value = clamp(s?.attack ?? 0.003, 0, 1);
  c.release.value = clamp(s?.release ?? 0.25, 0, 1);
  c.knee.value = on ? clamp(s?.knee ?? 30, 0, 40) : 0;
  mk.gain.value = on ? Math.pow(10, (s?.makeup || 0) / 20) : 1;
}

function getTrackBus(trackId: string): TrackBus | null {
  const hit = trackBuses.get(trackId);
  if (hit) return hit;
  const ctx = getAudioCtx();
  const master = getMasterInput();
  if (!ctx || !master) return null;
  const input = ctx.createGain();
  const eq = EQ_BANDS.map((b) => { const f = ctx.createBiquadFilter(); f.type = b.type; f.frequency.value = b.f; f.Q.value = b.q || 1; return f; });
  const comp = ctx.createDynamicsCompressor(); const mk = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
  const chain: AudioNode[] = [input, ...eq, comp, mk, ...(pan ? [pan] : []), gain, analyser, master];
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  const fx = getFxSends();
  const sendR = ctx.createGain(); sendR.gain.value = 0;
  const sendD = ctx.createGain(); sendD.gain.value = 0;
  if (fx) { gain.connect(sendR); sendR.connect(fx.reverbSend); gain.connect(sendD); sendD.connect(fx.delaySend); }
  const bus: TrackBus = { input, eq, comp, mk, pan, gain, analyser, sendR, sendD, meterBuf: new Float32Array(analyser.fftSize) };
  trackBuses.set(trackId, bus);
  // this bus owns the track's meter from now on (created lazily — register here, not at start)
  meterRegistry.set(trackId, () => {
    try { bus.analyser.getFloatTimeDomainData(bus.meterBuf); let p = 0; for (let i = 0; i < bus.meterBuf.length; i++) { const a = Math.abs(bus.meterBuf[i]); if (a > p) p = a; } return p; } catch { return 0; }
  });
  return bus;
}

function applyTrack(bus: TrackBus, ts: any) {
  applyBand(bus.eq, ts?.eq);
  applyComp(bus.comp, bus.mk, ts?.comp);
  if (bus.pan) bus.pan.pan.value = clamp(ts?.pan || 0, -1, 1);
  const muted = !!ts?.mute;
  bus.gain.gain.value = muted ? 0 : Math.max(0, ts?.vol == null ? 1 : ts.vol);
  bus.sendR.gain.value = muted ? 0 : clamp(ts?.sendReverb || 0, 0, 1);
  bus.sendD.gain.value = muted ? 0 : clamp(ts?.sendDelay || 0, 0, 1);
}

// ── the transport engine ─────────────────────────────────────────────────────

interface LiveSource { node: AudioBufferSourceNode; gain: GainNode; }

const state = {
  running: false,
  session: 0,          // bumps on every start/stop — async decodes check they still apply
  t0: 0,               // timeline seconds at ctxStart
  ctxStart: 0,         // ctx.currentTime anchor
  sources: [] as LiveSource[],
  trackSettings: {} as Record<string, any>,
  lastStartTry: 0,
  planned: 0, scheduled: 0, pending: 0,   // last-start diagnostics
};

/** Diagnostics for the current/last playback session — what got scheduled vs stuck. */
export function engineStats() {
  const soloed = Object.entries(state.trackSettings || {}).filter(([, t]: any) => t && t.solo).map(([k]) => k);
  return {
    running: state.running, dead: engineDead, planned: state.planned, scheduled: state.scheduled,
    pending: state.pending, unplayable: [...unplayable], soloed,
    reasons: [...unplayableWhy.entries()].map(([u, why]) => `${why} ← ${u.slice(0, 120)}`),
  };
}

export function engineRunning(): boolean { return state.running; }

/** The master playback clock: timeline seconds, derived from the audio hardware clock.
 *  If the context clock stalls (see watchdog), the clock GLIDES on wall time instead of
 *  freezing — the transport and video sync never see the stall (audio may rejoin late;
 *  a sustained stall demotes the engine entirely). Monotone by construction. */
const clockGlide = { wall: 0, val: 0 };
export function engineClock(): number {
  const ctx = getAudioCtx();
  if (!ctx || !state.running) return state.t0;
  const raw = state.t0 + Math.max(0, ctx.currentTime - state.ctxStart);
  const now = performance.now();
  if (clockGlide.wall > 0 && raw <= clockGlide.val + 0.0005) {
    clockGlide.val += Math.min(0.25, (now - clockGlide.wall) / 1000);
    clockGlide.wall = now;
    return clockGlide.val;
  }
  clockGlide.wall = now; clockGlide.val = raw;
  return raw;
}

function scheduleEntry(e: PlanEntry, buf: AudioBuffer, lateBy = 0) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const bus = getTrackBus(e.trackId);
  if (!bus) return;
  applyTrack(bus, effectiveTrack(e.trackId, state.trackSettings));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const cg = ctx.createGain();
  // clip stage: gain (vol + fades) → clip EQ → clip comp → track bus
  let head: AudioNode = cg;
  if (e.eq && e.eq.some((v) => v)) {
    const eq = EQ_BANDS.map((b) => { const f = ctx.createBiquadFilter(); f.type = b.type; f.frequency.value = b.f; f.Q.value = b.q || 1; return f; });
    applyBand(eq, e.eq);
    let prev: AudioNode = cg;
    for (const f of eq) { prev.connect(f); prev = f; }
    head = prev;
  }
  if (e.comp?.on) {
    const c = ctx.createDynamicsCompressor(); const mk = ctx.createGain();
    applyComp(c, mk, e.comp);
    head.connect(c); c.connect(mk); head = mk;
  }
  src.connect(cg); head.connect(bus.input);
  // fades as sample-accurate ramps (matches the export's mixAudio envelope)
  const at = state.ctxStart + e.when + lateBy;         // lateBy: late-join decode catches up
  const vol = Math.max(0, e.vol);
  const g = cg.gain;
  if (e.fadeIn > 0 || e.fadeInFrom < 1) {
    g.setValueAtTime(vol * e.fadeInFrom, at);
    if (e.fadeIn > 0) g.linearRampToValueAtTime(vol, at + e.fadeIn);
  } else g.setValueAtTime(vol, at);
  if (e.fadeOut > 0 && e.dur > e.fadeOut) {
    g.setValueAtTime(vol, at + e.dur - e.fadeOut);
    g.linearRampToValueAtTime(0, at + e.dur);
  }
  const offset = clamp(e.offset, 0, Math.max(0, buf.duration - 0.01));
  const dur = Math.min(e.dur, Math.max(0.01, buf.duration - offset));
  try {
    src.start(Math.max(at, ctx.currentTime), offset, dur);
    state.sources.push({ node: src, gain: cg });
  } catch { /* start in the past / bad params — skip this one, never crash playback */ }
}

/** Start scheduled playback of the whole timeline from t0 (idempotent while running). */
let stateHookInstalled = false;
export function startPlayback(opts: { clips: any[]; mediaPool: any[]; trackSettings?: Record<string, any>; t0: number }): boolean {
  if (engineDead) return false;                        // demoted — wall clock + elements
  const now = Date.now();
  if (state.running) return true;
  if (now - state.lastStartTry < 300) return false;    // restart-guard (tick retries)
  state.lastStartTry = now;
  const ctx = getAudioCtx();
  if (!ctx) return false;
  if (!stateHookInstalled) {
    stateHookInstalled = true;
    try { ctx.addEventListener('statechange', () => { if (ctx.state === 'suspended' && state.running) ctx.resume().catch(() => {}); }); } catch { /* */ }
  }
  resumeAudioCtx();
  if (ctx.state !== 'running') return false;           // no gesture yet — tick will retry
  watchdog.lastWall = 0; watchdog.stallMs = 0;
  clockGlide.wall = 0; clockGlide.val = 0;
  const session = ++state.session;
  state.running = true;
  state.t0 = Math.max(0, opts.t0);
  state.ctxStart = ctx.currentTime + 0.06;             // scheduling headroom
  state.trackSettings = opts.trackSettings || {};
  state.sources = [];
  const plan = planPlayback(opts.clips, opts.mediaPool, state.t0);
  state.planned = plan.length; state.scheduled = 0; state.pending = 0;
  for (const e of plan) {
    const cached = bufCache.get(e.url);
    if (cached) { cached.at = Date.now(); scheduleEntry(e, cached.buf); state.scheduled++; continue; }
    state.pending++;
    // late-join: decode now, then splice in at the correct source offset for the CURRENT clock
    void decodeUrl(e.url, e.assetId).then((buf) => {
      if (state.session === session) state.pending = Math.max(0, state.pending - 1);
      if (!buf || !state.running || state.session !== session) return;
      if (state.session === session) state.scheduled++;
      const nowTl = engineClock();
      const startTl = state.t0 + e.when;
      if (nowTl < startTl - 0.05) { scheduleEntry(e, buf); return; }         // still ahead — schedule as planned
      const missed = nowTl - startTl;
      if (missed >= e.dur - 0.05) return;                                     // clip already over
      scheduleEntry({ ...e, when: nowTl - state.t0, offset: e.offset + missed, dur: e.dur - missed, fadeIn: Math.max(0, e.fadeIn - missed), fadeInFrom: e.fadeIn > 0 ? clamp(missed / e.fadeIn, 0, 1) : 1 }, buf);
    });
  }
  return true;
}

export function stopPlayback() {
  if (!state.running) return;
  state.t0 = engineClock();                            // freeze the clock where we stopped
  state.running = false;
  state.session++;
  for (const s of state.sources) { try { s.node.stop(); } catch { /* */ } try { s.node.disconnect(); s.gain.disconnect(); } catch { /* */ } }
  state.sources = [];
}

/** Live mixer changes while playing (fader/pan/mute/solo/eq/comp/sends). */
export function setEngineTracks(trackSettings: Record<string, any>) {
  state.trackSettings = trackSettings || {};
  for (const [tid, bus] of trackBuses) applyTrack(bus, effectiveTrack(tid, state.trackSettings));
}

// ── video slaving: drift-correct the live <video> elements to the clock ──────

interface LiveVideo { el: HTMLVideoElement; clipStart: number; offset: number; srcDur?: number; }
const liveVideos = new Map<string, LiveVideo>();
let lastSync = 0;

export function registerLiveVideo(clipId: string, v: LiveVideo) { liveVideos.set(clipId, v); }
export function unregisterLiveVideo(clipId: string) { liveVideos.delete(clipId); }

/** Called from the transport rAF. Cheap (throttled to ~6Hz). playbackRate nudges, not seeks,
 *  so corrections are invisible; hard resync only past 0.4s. Clamps at the source's end so a
 *  clip longer than its file FREEZES on the last frame instead of wrapping/looping. */
export function syncLiveVideos(clock: number, rate: number) {
  const now = performance.now();
  // Watchdog: is the audio clock actually advancing? (runs every call, pre-throttle)
  if (state.running && !engineDead) {
    const ctx = getAudioCtx();
    if (ctx) {
      if (watchdog.lastWall > 0) {
        const wallDt = now - watchdog.lastWall;
        const ctxDt = (ctx.currentTime - watchdog.lastCtx) * 1000;
        if (wallDt > 40 && ctxDt < wallDt * 0.5) {
          watchdog.stallMs += wallDt;
          if (watchdog.stallMs > 700) resumeAudioCtx();
          if (watchdog.stallMs > 2500) declareEngineDead('clock stalled ' + Math.round(watchdog.stallMs) + 'ms; state=' + ctx.state);
        } else if (ctxDt >= wallDt * 0.5) watchdog.stallMs = 0;
      }
      watchdog.lastWall = now; watchdog.lastCtx = ctx.currentTime;
    }
  }
  if (now - lastSync < 160) return;
  lastSync = now;
  for (const [, v] of liveVideos) {
    const el = v.el;
    if (!el || el.readyState < 2) continue;
    // The element's own duration is the ONLY truth. mediaPool durations are frequently
    // placeholders (imports default to 5s) — clamping on those pause/seek-looped real
    // clips at the fake end: the "few frames repeating like a jump cut" glitch.
    const srcDur = (Number.isFinite(el.duration) && el.duration > 0.2) ? el.duration : 0;
    let expected = clock - v.clipStart + v.offset;
    if (srcDur > 0 && expected >= srcDur - 0.05) {     // past the source's end → freeze, never loop
      if (!el.paused) { try { el.pause(); } catch { /* */ } }
      if (Math.abs(el.currentTime - (srcDur - 0.05)) > 0.1) { try { el.currentTime = Math.max(0, srcDur - 0.05); } catch { /* */ } }
      continue;
    }
    if (rate <= 0) {                                    // reverse shuttle: step-seek backward
      try { el.pause(); if (Math.abs(el.currentTime - expected) > 0.12) el.currentTime = Math.max(0, expected); } catch { /* */ }
      continue;
    }
    if (el.paused) { el.play().catch(() => { /* retried next pass */ }); }
    const drift = el.currentTime - expected;            // + = video ahead of timeline
    try {
      if (Math.abs(drift) > 0.4) { el.currentTime = expected + 0.04; el.playbackRate = rate; }
      else if (drift < -0.08) el.playbackRate = Math.min(4, rate * 1.08);
      else if (drift > 0.08) el.playbackRate = Math.max(0.25, rate * 0.92);
      else el.playbackRate = rate;
    } catch { /* rate/seek unsupported mid-load — next pass */ }
  }
}
