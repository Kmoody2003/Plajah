// Tiny shared synthesis toolkit for the Living Books audio engine. Everything here only needs a BaseAudioContext, so the exact same
// code runs live (AudioContext) and in offline renders (OfflineAudioContext) used by the verification tests.
// Import-safe in Node: nothing touches window/document at module load.

export type Ctx = BaseAudioContext;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const semitoneRatio = (st: number) => Math.pow(2, st / 12);
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const EPS = 0.0001;

// ───────────── deterministic randomness ─────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Order-independent hash of a few integers: lets seeded variation be a pure function of (seed, pass, track, note). */
export function hash32(...nums: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= (n | 0) + 0x9e3779b9 + ((h << 6) >>> 0) + (h >>> 2);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}
export const rngFrom = (...nums: number[]) => mulberry32(hash32(...nums));

// ───────────── buffers: noise + reverb impulse ─────────────
type NoiseColor = 'white' | 'pink' | 'brown';
const noiseCache = new WeakMap<object, Map<string, AudioBuffer>>();

export function getNoise(c: Ctx, color: NoiseColor = 'white', seconds = 4): AudioBuffer {
  let m = noiseCache.get(c);
  if (!m) { m = new Map(); noiseCache.set(c, m); }
  const key = `${color}:${seconds}`;
  const hit = m.get(key);
  if (hit) return hit;
  const loopLen = Math.max(1, Math.floor(c.sampleRate * seconds));
  const xf = Math.min(loopLen >> 2, Math.floor(c.sampleRate * 0.08));
  const len = loopLen + xf;                         // generate extra, then fold the tail into the head so the loop is seamless
  const raw = new Float32Array(len);
  const r = mulberry32(color === 'white' ? 11 : color === 'pink' ? 23 : 37);
  if (color === 'white') {
    for (let i = 0; i < len; i++) raw[i] = r() * 2 - 1;
  } else if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (r() * 2 - 1)) / 1.02; raw[i] = last * 3.5; }
  }
  const buf = c.createBuffer(1, loopLen, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < loopLen; i++) d[i] = raw[i];
  for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = raw[i] * k + raw[loopLen + i] * (1 - k); }   // head blends into the continuation of the tail
  let sum = 0; for (let i = 0; i < loopLen; i++) sum += d[i] * d[i];
  const g = 0.3 / (Math.sqrt(sum / loopLen) || 1);
  for (let i = 0; i < loopLen; i++) d[i] = clamp(d[i] * g, -1, 1);
  m.set(key, buf);
  return buf;
}

/** Generated reverb impulse: exponentially decaying filtered noise, decorrelated per channel. */
export function makeImpulse(c: Ctx, seconds = 2.2, decay = 3.2, seed = 99): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = mulberry32(seed + ch * 7919);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const w = r() * 2 - 1;
      lp += (w - lp) * (0.55 - 0.4 * t);            // the tail gets darker, like a real room
      const pre = i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1;
      d[i] = lp * Math.pow(1 - t, decay) * pre;
    }
  }
  return buf;
}

// ───────────── the per-sound synthesis context ─────────────
export interface SynthCtx {
  c: Ctx;
  out: AudioNode;
  /** start time (seconds, in c's timeline) */
  t: number;
  /** pitch ratio (semitone shift + random detune already applied) */
  pr: number;
  /** duration scale */
  ds: number;
  rnd: () => number;
  /** reduced-sound: nothing may start with a click or a sudden onset */
  soft?: boolean;
  /** latest scheduled end (seconds after t), maintained by tone()/noise() so callers know when a sound is over */
  end: number;
}

export function makeSynth(c: Ctx, out: AudioNode, t: number, o: { pitch?: number; variation?: number; durationScale?: number; seed?: number; soft?: boolean } = {}): SynthCtx {
  const rnd = mulberry32((o.seed ?? Math.floor(Math.random() * 1e9)) >>> 0);
  const vr = clamp(o.variation ?? 0.25, 0, 1);
  const detune = (rnd() * 2 - 1) * vr * 0.6;                      // +/- 60 cents at full variation
  return { c, out, t, pr: semitoneRatio((o.pitch ?? 0) + detune), ds: clamp(o.durationScale ?? 1, 0.25, 4), rnd, soft: o.soft, end: 0 };
}

export type EnvShape = 'perc' | 'swell' | 'flat';

/** Schedule an envelope on `g` from time t0 over dur seconds. */
export function applyEnv(g: GainNode, t0: number, dur: number, peak: number, shape: EnvShape, a: number, rel?: number) {
  const p = g.gain;
  const att = Math.max(0.001, a);
  p.setValueAtTime(EPS, t0);
  p.linearRampToValueAtTime(Math.max(EPS, peak), t0 + Math.min(att, dur * 0.9));
  if (shape === 'perc') {
    p.exponentialRampToValueAtTime(EPS, t0 + dur);
  } else {
    const r = clamp(rel ?? dur * 0.3, 0.005, dur * 0.9);
    p.setValueAtTime(Math.max(EPS, peak), t0 + Math.max(att, dur - r));
    p.linearRampToValueAtTime(EPS, t0 + dur);
  }
}

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** frequency multiplier over u = 0..1 across the note (boing wobble, whale song, yawn): overrides f2 */
  curve?: (u: number) => number;
  f2?: number;                      // glide target (exponential) reached at `bendEnd` fraction of dur (default 1)
  bendEnd?: number;
  at?: number; dur: number;
  a?: number; rel?: number; peak?: number; shape?: EnvShape;
  lp?: number; lpEnd?: number; q?: number;
  bp?: number; bpQ?: number;
  vibHz?: number; vibCents?: number; vibDelay?: number;
  fmRatio?: number; fmIndex?: number;     // simple FM: modulator at f*ratio, depth = index*f Hz
  detuneCents?: number;
  /** don't apply the sound-level pitch ratio (used for fixed-formant bits) */
  fixed?: boolean;
}

/** One oscillator voice with envelope, optional filter, vibrato, FM. Returns the envelope node. */
export function tone(s: SynthCtx, o: ToneOpts): GainNode {
  const { c } = s;
  const at = s.t + (o.at ?? 0) * s.ds;
  const dur = Math.max(0.01, o.dur * s.ds);
  const k = o.fixed ? 1 : s.pr;
  const f = o.f * k;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, at);
  if (o.curve) {
    const n = 96; const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) arr[i] = Math.max(20, f * o.curve(i / (n - 1)));
    osc.frequency.setValueCurveAtTime(arr, at, dur);
  } else if (o.f2 != null && Math.abs(o.f2 - o.f) > 1e-6) {
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2 * k), at + dur * clamp(o.bendEnd ?? 1, 0.05, 1));
  }
  if (o.detuneCents) osc.detune.value = o.detuneCents;
  const stops: Array<AudioScheduledSourceNode> = [osc];
  if (o.vibHz && o.vibCents) {
    const lfo = c.createOscillator(); lfo.frequency.value = o.vibHz;
    const depth = c.createGain();
    const vd = (o.vibDelay ?? 0) * s.ds;
    if (vd > 0) { depth.gain.setValueAtTime(0, at); depth.gain.linearRampToValueAtTime(o.vibCents, at + vd + 0.25); }
    else depth.gain.value = o.vibCents;
    lfo.connect(depth); depth.connect(osc.detune);
    lfo.start(at); lfo.stop(at + dur + 0.05); stops.push(lfo);
  }
  if (o.fmRatio && o.fmIndex) {
    const mod = c.createOscillator(); mod.frequency.value = f * o.fmRatio;
    const md = c.createGain(); md.gain.setValueAtTime(f * o.fmIndex, at);
    md.gain.exponentialRampToValueAtTime(Math.max(1, f * o.fmIndex * 0.1), at + dur);   // brightness decays
    mod.connect(md); md.connect(osc.frequency);
    mod.start(at); mod.stop(at + dur + 0.05); stops.push(mod);
  }
  let node: AudioNode = osc;
  if (o.lp) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q ?? 0.7;
    lp.frequency.setValueAtTime(o.lp * (o.fixed ? 1 : 1), at);
    if (o.lpEnd) lp.frequency.exponentialRampToValueAtTime(Math.max(40, o.lpEnd), at + dur);
    node.connect(lp); node = lp;
  }
  if (o.bp) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.bp; bp.Q.value = o.bpQ ?? 2;
    node.connect(bp); node = bp;
  }
  const env = c.createGain();
  const a = s.soft ? Math.max(o.a ?? 0.002, 0.012) : (o.a ?? 0.004);
  applyEnv(env, at, dur, o.peak ?? 0.5, o.shape ?? 'perc', a, o.rel);
  node.connect(env); env.connect(s.out);
  osc.start(at);
  for (const n of stops) n.stop(at + dur + 0.05);
  s.end = Math.max(s.end, (at - s.t) + dur + 0.05);
  return env;
}

/** Inharmonic / harmonic partial stack (bells, chimes, glass, marimba, music box). Higher partials fade faster. */
export function partials(s: SynthCtx, o: { f: number; parts: Array<[ratio: number, amp: number, decay?: number]>; at?: number; dur: number; peak?: number; a?: number; type?: OscillatorType; lp?: number }) {
  for (const [ratio, amp, dm] of o.parts) {
    const fr = o.f * ratio;
    if (fr * s.pr > 15000) continue;
    tone(s, { type: o.type ?? 'sine', f: o.f * ratio, at: o.at, dur: o.dur * (dm ?? 1), a: o.a ?? 0.002, peak: (o.peak ?? 0.5) * amp, lp: o.lp });
  }
}

export interface NoiseOpts {
  color?: NoiseColor;
  at?: number; dur: number;
  a?: number; rel?: number; peak?: number; shape?: EnvShape;
  bp?: [f0: number, f1: number, q?: number];
  lp?: [f0: number, f1?: number];
  hp?: [f0: number, f1?: number];
  amHz?: number; amDepth?: number;
}

export function noise(s: SynthCtx, o: NoiseOpts): GainNode {
  const { c } = s;
  const at = s.t + (o.at ?? 0) * s.ds;
  const dur = Math.max(0.005, o.dur * s.ds);
  const src = c.createBufferSource();
  src.buffer = getNoise(c, o.color ?? 'white');
  src.loop = true;
  const off = s.rnd() * 2;
  let node: AudioNode = src;
  const sweep = (type: BiquadFilterType, f0: number, f1: number | undefined, q: number) => {
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(20, f0), at);
    if (f1 != null && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    node.connect(f); node = f;
  };
  if (o.hp) sweep('highpass', o.hp[0], o.hp[1], 0.7);
  if (o.bp) sweep('bandpass', o.bp[0], o.bp[1], o.bp[2] ?? 1);
  if (o.lp) sweep('lowpass', o.lp[0], o.lp[1], 0.7);
  const stops: AudioScheduledSourceNode[] = [src];
  if (o.amHz) {
    const am = c.createGain(); const depth = clamp(o.amDepth ?? 0.8, 0, 1);
    am.gain.value = 1 - depth / 2;
    const lfo = c.createOscillator(); lfo.frequency.value = o.amHz;
    const lg = c.createGain(); lg.gain.value = depth / 2;
    lfo.connect(lg); lg.connect(am.gain); lfo.start(at); lfo.stop(at + dur + 0.05); stops.push(lfo);
    node.connect(am); node = am;
  }
  const env = c.createGain();
  const a = s.soft ? Math.max(o.a ?? 0.002, 0.015) : (o.a ?? 0.003);
  applyEnv(env, at, dur, o.peak ?? 0.5, o.shape ?? 'perc', a, o.rel);
  node.connect(env); env.connect(s.out);
  src.start(at, off);
  for (const n of stops) n.stop(at + dur + 0.05);
  s.end = Math.max(s.end, (at - s.t) + dur + 0.05);
  return env;
}

/** Equal-power pan node if the platform has one (all current browsers), else a pass-through. */
export function makePanner(c: Ctx, pan: number): AudioNode {
  const p = clamp(pan, -1, 1);
  if (typeof (c as any).createStereoPanner === 'function') {
    const n = c.createStereoPanner(); n.pan.value = p; return n;
  }
  return c.createGain();
}
