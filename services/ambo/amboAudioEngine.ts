// amboAudioEngine — Ambo's mixer, on the SAME audio device as Chora, DJ mode,
// Melos and Fabula.
//
// Plajah's "unified audio engine" is a shared DEVICE (platformAudio: one
// AudioContext, one output per product) plus a shared FX CORE (Melos's device
// catalogue, also used by Fabula) and shared METERS (MeterBridge). Each app
// builds its own graph on that. This is Ambo's:
//
//   playlist ─ clip FX (per file) ┐
//   slides   ───────────────────┤  each strip: input → inserts → pan → fader
//   video    ───────────────────┤               → mute/solo → meter → master
//   dj deck  ───────────────────┘
//
//   master: input → Master EQ (SpectraEQ) → Pressing (MasteringChain)
//           → master inserts → fader → Peak Limiter (Melos device) → makeup
//           → meter tap (MeterBridge) + visualizer analyser → platformAudio('ambo')
//
// The master analyser drives every visualizer in the studio; output windows
// (separate windows, no access to this context) get a compact spectrum over a
// BroadcastChannel and see it through the same `getAmboMasterAnalyser()` hook.
//
// MEDIA ELEMENTS: createMediaElementSource is once-per-element, and a
// cross-origin element WITHOUT CORS plays SILENCE through the graph (no
// error). Callers set crossOrigin before src (see `needsCors`).

import { platformAudio } from '../mediaEngine/audioRuntime';
import {
  FxChainHost, deviceByType, SpectraEQ, defaultSpectra, MasteringChain, defaultMastering,
  type SpectraState, type MasteringState,
} from '../fabula/audioFx';
import type { FxInstance } from '../melos/beats/fx/devices';

export type AmboChannelId = 'playlist' | 'slides' | 'video' | 'dj';

export const AMBO_CHANNELS: Array<{ id: AmboChannelId; label: string; color: string }> = [
  { id: 'playlist', label: 'Playlist', color: '#D0BCFF' },
  { id: 'slides', label: 'Slide Audio', color: '#2BE0A8' },
  { id: 'video', label: 'Video', color: '#00DAF3' },
  { id: 'dj', label: 'DJ Deck', color: '#FF8C00' },
];

export interface ChannelState { gainDb: number; pan: number; mute: boolean; solo: boolean; inserts: FxInstance[] }
export interface LimiterState { on: boolean; ceiling: number; release: number; character: number; gain: number }
export interface MasterState {
  gainDb: number;
  inserts: FxInstance[];
  eq: SpectraState;
  mastering: MasteringState;
  limiter: LimiterState;
}
/**
 * Live input that DRIVES THE VISUALS ONLY. It feeds a visuals-only bus and is
 * never connected to the master, the speakers, the stream or any output — so a
 * band mic or a line from the desk can make the screens dance without being
 * played back into the room.
 */
export interface LiveInState { enabled: boolean; deviceId: string | null; gainDb: number }
export type VizFollow = 'mix' | 'live' | 'both';
export interface MixerState { channels: Record<AmboChannelId, ChannelState>; master: MasterState; liveIn: LiveInState; vizFollow: VizFollow }

const KEY = 'ambo_mixer_v1';
const FILE_FX_KEY = 'ambo_file_fx_v1';
export const AMBO_AUDIO_CHANNEL = 'ambo-audio-v1';

const dbToGain = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20));

export const needsCors = (url?: string | null) => {
  if (!url || !/^https?:/i.test(url)) return false;
  try { return new URL(url, location.href).origin !== location.origin; } catch { return false; }
};
export const proxied = (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`;

function defaults(): MixerState {
  const ch = (): ChannelState => ({ gainDb: 0, pan: 0, mute: false, solo: false, inserts: [] });
  return {
    channels: { playlist: ch(), slides: ch(), video: ch(), dj: ch() },
    master: {
      gainDb: 0,
      inserts: [],
      eq: { ...defaultSpectra(), on: false },
      mastering: defaultMastering(),
      // On by default: a presenter feeding a PA must never clip it.
      limiter: { on: true, ceiling: -1, release: 120, character: 0, gain: 0 },
    },
    liveIn: { enabled: false, deviceId: null, gainDb: 0 },
    vizFollow: 'both',
  };
}

function load(): MixerState {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw);
    for (const c of AMBO_CHANNELS) d.channels[c.id] = { ...d.channels[c.id], ...(s.channels?.[c.id] || {}) };
    d.master = { ...d.master, ...(s.master || {}), limiter: { ...d.master.limiter, ...(s.master?.limiter || {}) } };
    d.liveIn = { ...d.liveIn, ...(s.liveIn || {}) };
    if (s.vizFollow === 'mix' || s.vizFollow === 'live' || s.vizFollow === 'both') d.vizFollow = s.vizFollow;
  } catch { /* */ }
  return d;
}

interface Strip {
  input: GainNode;
  pre: FxChainHost | null;     // per-file FX (playlist only)
  inserts: FxChainHost;
  pan: StereoPannerNode;
  fader: GainNode;
  mute: GainNode;
  analyser: AnalyserNode;
  buf: Float32Array;
  held: number;
  heldAt: number;
}

/** Peak hold with a TIME-based fall (~300 ms), independent of how often it's read. */
function hold(prev: number, prevAt: number, p: number, now: number): number {
  const decayed = prev * Math.exp(-Math.max(0, now - prevAt) / 300);
  return Math.max(p, decayed);
}

class AmboAudioEngine {
  private ctx: AudioContext | null = null;
  private strips = new Map<AmboChannelId, Strip>();
  private m: {
    input: GainNode; eq: SpectraEQ; press: MasteringChain; inserts: FxChainHost; fader: GainNode;
    limiter: ReturnType<NonNullable<ReturnType<typeof deviceByType>>['create']> | null;
    makeup: GainNode; meter: AnalyserNode; viz: AnalyserNode; buf: Float32Array; held: number; heldAt: number;
  } | null = null;
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private vizNodes: { vizMix: GainNode; vizLive: GainNode } | null = null;
  private live: { stream: MediaStream; src: MediaStreamAudioSourceNode; gain: GainNode; analyser: AnalyserNode; buf: Float32Array; held: number; heldAt: number } | null = null;
  private liveError: string | null = null;
  private liveStarting = false;
  private listeners = new Set<() => void>();
  private snapshot: MixerState;
  private chan: BroadcastChannel | null = null;
  private vizTimer: ReturnType<typeof setInterval> | null = null;
  private fileFx: Record<string, FxInstance[]>;
  state: MixerState;

  constructor() {
    this.state = load();
    this.snapshot = this.state;
    try { this.fileFx = JSON.parse(localStorage.getItem(FILE_FX_KEY) || '{}'); } catch { this.fileFx = {}; }
  }

  // ── lifecycle ──
  /** Build the graph on first use. Safe to call repeatedly. */
  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    let ctx: AudioContext;
    try { ctx = platformAudio.getContext(); } catch { return null; }
    this.ctx = ctx;
    const resume = () => { if (ctx.state === 'suspended') void ctx.resume().catch(() => {}); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, resume, { capture: true, passive: true });
    resume();

    // master
    const input = ctx.createGain();
    const eq = new SpectraEQ(ctx);
    const press = new MasteringChain(ctx);
    const inserts = new FxChainHost(ctx);
    const fader = ctx.createGain();
    const makeup = ctx.createGain();
    const meter = ctx.createAnalyser(); meter.fftSize = 256; meter.smoothingTimeConstant = 0.2;
    const viz = ctx.createAnalyser(); viz.fftSize = 512; viz.smoothingTimeConstant = 0.6;
    let limiter = null;
    try { limiter = deviceByType('limiter')?.create(ctx) ?? null; } catch { limiter = null; }
    input.connect(eq.input); eq.output.connect(press.input); press.output.connect(inserts.input);
    inserts.output.connect(fader);
    makeup.connect(meter);
    // Visuals bus: program mix + (optionally) live input → viz analyser. The
    // analyser is a dead end — nothing here reaches platformAudio's output.
    const vizMix = ctx.createGain(), vizLive = ctx.createGain(), vizSum = ctx.createGain();
    makeup.connect(vizMix); vizMix.connect(vizSum); vizLive.connect(vizSum); vizSum.connect(viz);
    this.vizNodes = { vizMix, vizLive };
    makeup.connect(platformAudio.output('ambo'));
    this.m = { input, eq, press, inserts, fader, limiter, makeup, meter, viz, buf: new Float32Array(256), held: 0, heldAt: 0 };
    this.patchLimiter();

    for (const c of AMBO_CHANNELS) this.strips.set(c.id, this.makeStrip(c.id));
    this.applyAll();

    // Visualizers: the studio reads this analyser directly…
    (window as any).getAmboMasterAnalyser = () => this.m?.viz ?? null;
    // …output windows get the spectrum over the wire.
    try { this.chan = new BroadcastChannel(AMBO_AUDIO_CHANNEL); } catch { this.chan = null; }
    const freq = new Uint8Array(256), wave = new Uint8Array(512);
    this.vizTimer = setInterval(() => {
      if (!this.m || !this.chan) return;
      this.m.viz.getByteFrequencyData(freq);
      this.m.viz.getByteTimeDomainData(wave);
      const w2 = new Uint8Array(256);
      for (let i = 0; i < 256; i++) w2[i] = wave[i * 2];
      try { this.chan.postMessage({ t: 'spectrum', freq, wave: w2, sr: ctx.sampleRate }); } catch { /* */ }
    }, 33);
    void this.resumeLiveIfPermitted();
    return ctx;
  }

  private makeStrip(id: AmboChannelId): Strip {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const pre = id === 'playlist' ? new FxChainHost(ctx) : null;
    const inserts = new FxChainHost(ctx);
    const pan = ctx.createStereoPanner();
    const fader = ctx.createGain();
    const mute = ctx.createGain();
    const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
    if (pre) { input.connect(pre.input); pre.output.connect(inserts.input); } else input.connect(inserts.input);
    inserts.output.connect(pan); pan.connect(fader); fader.connect(mute); mute.connect(analyser); mute.connect(this.m!.input);
    return { input, pre, inserts, pan, fader, mute, analyser, buf: new Float32Array(256), held: 0, heldAt: 0 };
  }

  private patchLimiter() {
    const m = this.m;
    if (!m) return;
    try { m.fader.disconnect(); } catch { /* */ }
    try { m.limiter?.output.disconnect(); } catch { /* */ }
    const L = this.state.master.limiter;
    if (L.on && m.limiter) {
      m.limiter.setParams({ gain: L.gain, ceiling: L.ceiling, release: L.release, character: L.character });
      m.fader.connect(m.limiter.input);
      m.limiter.output.connect(m.makeup);
    } else {
      m.fader.connect(m.makeup);
    }
  }

  private applyAll() {
    if (!this.ctx || !this.m) return;
    const S = this.state;
    const anySolo = AMBO_CHANNELS.some(c => S.channels[c.id].solo);
    for (const c of AMBO_CHANNELS) {
      const st = this.strips.get(c.id);
      const cs = S.channels[c.id];
      if (!st) continue;
      st.inserts.setChain(cs.inserts);
      st.pan.pan.value = Math.max(-1, Math.min(1, cs.pan));
      st.fader.gain.setTargetAtTime(dbToGain(cs.gainDb), this.ctx.currentTime, 0.015);
      const audible = !cs.mute && (!anySolo || cs.solo);
      st.mute.gain.setTargetAtTime(audible ? 1 : 0, this.ctx.currentTime, 0.01);
    }
    this.m.inserts.setChain(S.master.inserts);
    this.m.eq.setState(S.master.eq);
    this.m.press.setState(S.master.mastering);
    this.m.fader.gain.setTargetAtTime(dbToGain(S.master.gainDb), this.ctx.currentTime, 0.015);
    this.patchLimiter();
    if (this.vizNodes) {
      const t = this.ctx.currentTime;
      this.vizNodes.vizMix.gain.setTargetAtTime(S.vizFollow === 'live' ? 0 : 1, t, 0.02);
      this.vizNodes.vizLive.gain.setTargetAtTime(S.vizFollow === 'mix' ? 0 : 1, t, 0.02);
    }
    if (this.live) this.live.gain.gain.setTargetAtTime(dbToGain(S.liveIn.gainDb), this.ctx.currentTime, 0.02);
  }

  // ── state / subscription ──
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  private commit(next: MixerState) {
    this.state = next;
    this.snapshot = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* */ }
    this.applyAll();
    for (const fn of this.listeners) { try { fn(); } catch { /* */ } }
  }
  setChannel(id: AmboChannelId, patch: Partial<ChannelState>) {
    this.commit({ ...this.state, channels: { ...this.state.channels, [id]: { ...this.state.channels[id], ...patch } } });
  }
  setMaster(patch: Partial<MasterState>) {
    this.commit({ ...this.state, master: { ...this.state.master, ...patch } });
  }
  setLimiter(patch: Partial<LimiterState>) {
    this.setMaster({ limiter: { ...this.state.master.limiter, ...patch } });
  }

  setVizFollow(v: VizFollow) { this.commit({ ...this.state, vizFollow: v }); }
  setLiveIn(patch: Partial<LiveInState>) {
    const prev = this.state.liveIn;
    const next = { ...prev, ...patch };
    this.commit({ ...this.state, liveIn: next });
    if (!next.enabled) this.stopLive();
    // Open on enable or device change — not on a gain tweak (a failed device
    // shouldn't re-prompt every time the fader moves).
    else if (patch.enabled || (patch.deviceId !== undefined && patch.deviceId !== prev.deviceId)) void this.startLive();
  }
  liveStatus(): { on: boolean; error: string | null; label: string | null } {
    return { on: !!this.live, error: this.liveError, label: this.live?.stream.getAudioTracks()[0]?.label ?? null };
  }

  /** Open the input device. Music-friendly: no echo cancel / NS / AGC. */
  async startLive(): Promise<void> {
    const ctx = this.ensure();
    if (!ctx || !this.vizNodes || this.liveStarting) return;
    this.liveStarting = true;
    this.stopLive(false);
    try {
      const id = this.state.liveIn.deviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(id ? { deviceId: { exact: id } } : {}),
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          channelCount: { ideal: 2 },
        },
        video: false,
      });
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = dbToGain(this.state.liveIn.gainDb);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.2;
      // Input → gain → meter + visuals bus. Deliberately NOT to any strip or
      // the master: the live input is never heard.
      src.connect(gain); gain.connect(analyser); gain.connect(this.vizNodes.vizLive);
      this.live = { stream, src, gain, analyser, buf: new Float32Array(256), held: 0, heldAt: 0 };
      this.liveError = null;
      // Unplugging the interface ends the track — reflect it.
      stream.getAudioTracks()[0]?.addEventListener('ended', () => { this.stopLive(false); this.liveError = 'Input device disconnected'; this.emit(); });
    } catch (e: any) {
      this.liveError = e?.name === 'NotAllowedError' ? 'Microphone permission was denied' : e?.name === 'OverconstrainedError' ? 'That input device is no longer available' : (e?.message || 'Could not open the input');
      this.live = null;
    } finally {
      this.liveStarting = false;
      this.emit();
    }
  }

  stopLive(notify = true) {
    const L = this.live;
    if (L) {
      try { L.src.disconnect(); L.gain.disconnect(); } catch { /* */ }
      for (const t of L.stream.getTracks()) { try { t.stop(); } catch { /* */ } }
    }
    this.live = null;
    if (notify) this.emit();
  }

  /** Re-open the input on load only if permission was already granted (no surprise prompt). */
  async resumeLiveIfPermitted() {
    if (!this.state.liveIn.enabled || this.live) return;
    try {
      const p = await (navigator as any).permissions?.query?.({ name: 'microphone' });
      if (p?.state === 'granted') await this.startLive();
    } catch { /* permissions API unavailable: wait for the operator */ }
  }

  private emit() { this.snapshot = { ...this.state }; for (const fn of this.listeners) { try { fn(); } catch { /* */ } } }

  // ── routing ──
  /** The input node for a channel (DJ deck connects here). */
  channelInput(id: AmboChannelId): AudioNode | null {
    this.ensure();
    return this.strips.get(id)?.input ?? null;
  }

  /**
   * Route a media element into a channel. Once per element (the browser
   * forbids a second MediaElementSource). Returns false if it couldn't be
   * routed — the element then still plays directly, just unmixed/unmetered.
   */
  attachElement(el: HTMLMediaElement, id: AmboChannelId): boolean {
    const ctx = this.ensure();
    const strip = this.strips.get(id);
    if (!ctx || !strip) return false;
    const existing = this.sources.get(el);
    if (existing) {
      try { existing.disconnect(); existing.connect(strip.input); return true; } catch { return false; }
    }
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(strip.input);
      this.sources.set(el, src);
      return true;
    } catch { return false; }
  }

  detachElement(el: HTMLMediaElement) {
    const src = this.sources.get(el);
    if (src) { try { src.disconnect(); } catch { /* */ } }
  }

  // ── per-file FX (follows the file into any playlist or queue) ──
  fileFxFor(trackId?: string): FxInstance[] { return (trackId && this.fileFx[trackId]) || []; }
  setFileFx(trackId: string, fx: FxInstance[]) {
    this.fileFx = { ...this.fileFx, [trackId]: fx };
    if (!fx.length) delete this.fileFx[trackId];
    try { localStorage.setItem(FILE_FX_KEY, JSON.stringify(this.fileFx)); } catch { /* */ }
    if (this.currentFile === trackId) this.applyFileFx(trackId);
    for (const fn of this.listeners) { try { fn(); } catch { /* */ } }
  }
  private currentFile: string | null = null;
  /** The playlist calls this when it changes song. */
  applyFileFx(trackId: string | null) {
    this.currentFile = trackId;
    this.strips.get('playlist')?.pre?.setChain(this.fileFxFor(trackId ?? undefined));
  }

  // ── metering ──
  private peak(an: AnalyserNode, buf: Float32Array): number {
    an.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    let m = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; }
    return m;
  }
  /** Peak 0..1+ with hold/decay, per channel or 'master'. */
  meter(id: AmboChannelId | 'master' | 'live'): number {
    const now = performance.now();
    if (id === 'live') {
      const L = this.live;
      if (!L) return 0;
      const p = this.peak(L.analyser, L.buf);
      L.held = hold(L.held, L.heldAt, p, now); L.heldAt = now;
      return L.held;
    }
    if (id === 'master') {
      if (!this.m) return 0;
      const p = this.peak(this.m.meter, this.m.buf);
      this.m.held = hold(this.m.held, this.m.heldAt, p, now); this.m.heldAt = now;
      return this.m.held;
    }
    const s = this.strips.get(id);
    if (!s) return 0;
    const p = this.peak(s.analyser, s.buf);
    s.held = hold(s.held, s.heldAt, p, now); s.heldAt = now;
    return s.held;
  }
  /** Limiter gain reduction in dB (positive). */
  limiterReduction(): number {
    try { return Math.abs(this.m?.limiter?.gr?.() ?? 0); } catch { return 0; }
  }
  /** For MeterBridge (BS.1770 loudness, true peak, spectrum) — post-limiter. */
  masterMeterTap = () => (this.ensure() && this.m ? { ctx: this.ctx!, node: this.m.makeup as AudioNode } : null);
  isRunning() { return !!this.ctx && this.ctx.state === 'running'; }
}

export const amboAudio = new AmboAudioEngine();

/**
 * Output windows: present the studio's spectrum (sent over the wire) as an
 * analyser-shaped object, so visualizers there react to the music too.
 */
export function installRemoteAmboAnalyser(): () => void {
  let ch: BroadcastChannel | null = null;
  try { ch = new BroadcastChannel(AMBO_AUDIO_CHANNEL); } catch { return () => {}; }
  const freq = new Uint8Array(256), wave = new Uint8Array(256).fill(128);
  let last = 0;
  // Consumers (Flux, Typo, Pixels) read `analyser.context.sampleRate`; a real AnalyserNode has it, so the stand-in must too.
  const context = { sampleRate: 48000, currentTime: 0 };
  ch.onmessage = (e) => {
    const m = e.data;
    if (m?.t !== 'spectrum') return;
    if (typeof m.sr === 'number' && m.sr > 8000) context.sampleRate = m.sr;
    freq.set(m.freq.subarray ? m.freq.subarray(0, 256) : m.freq);
    wave.set(m.wave.subarray ? m.wave.subarray(0, 256) : m.wave);
    last = Date.now();
  };
  const fake = {
    context,
    fftSize: 512,
    frequencyBinCount: 256,
    getByteFrequencyData(arr: Uint8Array) {
      // Studio gone quiet or closed: decay rather than freeze on the last frame.
      if (Date.now() - last > 500) for (let i = 0; i < freq.length; i++) freq[i] = Math.floor(freq[i] * 0.9);
      arr.set(freq.subarray(0, Math.min(arr.length, freq.length)));
    },
    getByteTimeDomainData(arr: Uint8Array) {
      for (let i = 0; i < arr.length; i++) arr[i] = wave[Math.floor((i / arr.length) * wave.length)];
    },
    getFloatFrequencyData(arr: Float32Array) { for (let i = 0; i < arr.length; i++) arr[i] = (freq[i % 256] / 255) * 100 - 100; },
    getFloatTimeDomainData(arr: Float32Array) { for (let i = 0; i < arr.length; i++) arr[i] = (wave[Math.floor((i / arr.length) * 256)] - 128) / 128; },
  };
  (window as any).getAmboMasterAnalyser = () => fake;
  return () => { try { ch?.close(); } catch { /* */ } delete (window as any).getAmboMasterAnalyser; };
}
