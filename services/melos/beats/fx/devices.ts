// The Pressing — the FX device library.
//
// A single framework behind three surfaces: the per-track insert strip, the master rack, and
// the unified "Suite" (an Ozone/RX-style single-window stack of these same devices). Every
// device is native Web Audio (or a tiny WaveShaper/worklet), shaped exactly like MasteringChain
// and SpectraEQ — an `input`/`output` pair, `setParams`, `dispose` — so the offline album render
// rebuilds any chain node-for-node and prints what the room heard.
//
// Devices are modelled after iZotope Ozone (tonal/dynamic/stereo) and RX (repair) modules but
// named generically. A device is: a serializable FxInstance ({type, params, on}) the doc stores,
// plus a live FxNode the engine builds. The descriptor carries the knob list the UI renders, so
// adding a device is one entry in DEVICES — no UI edit.

import { AMP_MODELS, CAB_MODELS, MIC_MODELS, PEDAL_MODELS, ampModelAt, cabModelAt, micModelAt, pedalModelAt } from './ampModels';
import { designHilbertFir } from './firEq';
import { IR_LIBRARY, irByIndex, getCachedIr, loadIr } from './irLibrary';

export type FxCategory = 'eq' | 'dynamics' | 'saturation' | 'stereo' | 'space' | 'mod' | 'dj' | 'repair' | 'utility' | 'amp';

export interface FxParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string;
  /** log = frequency-style knob response; lin = default. */
  curve?: 'lin' | 'log';
  format?: (v: number) => string;
}

export interface FxDescriptor {
  type: string;
  label: string;
  category: FxCategory;
  blurb: string;               // one line the UI shows under the name
  color: string;               // accent for the device header
  params: FxParamSpec[];
  create(ctx: BaseAudioContext): FxNode;
}

/** The live device — the same contract as MasteringChain, so the chain host is device-agnostic. */
export interface FxNode {
  readonly input: AudioNode;
  readonly output: AudioNode;
  /** Spectrum tap at the input (the OG signal) — the rack draws this as the "before" ghost. */
  readonly pre?: AnalyserNode;
  /** Spectrum tap at the output (the affected signal) — drawn as the "after" curve. */
  readonly post?: AnalyserNode;
  setParams(p: Record<string, number>): void;
  /** Live gain reduction (dB, ≤0) for dynamics devices — for the GR meter. */
  gr?(): number;
  /** Tempo-synced devices (Gater, Beatmasher, synced LFOs) take the transport BPM here. */
  setTempo?(bpm: number): void;
  dispose(): void;
}

/**
 * Base for every device: an input/output pair plus two AnalyserNode taps (input = dry/OG,
 * output = affected). The taps are passive branches — connecting a node to an analyser does not
 * alter the main signal path — so every device gets before/after visualization for free.
 */
abstract class FxBase implements FxNode {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly pre: AnalyserNode;
  readonly post: AnalyserNode;
  protected ctx: BaseAudioContext;
  private extra: AudioNode[] = [];
  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.pre = ctx.createAnalyser(); this.pre.fftSize = 2048; this.pre.smoothingTimeConstant = 0.7;
    this.post = ctx.createAnalyser(); this.post.fftSize = 2048; this.post.smoothingTimeConstant = 0.7;
    this.input.connect(this.pre);
    this.output.connect(this.post);
  }
  /** Register internal nodes so the base disposer cleans them up. */
  protected own<T extends AudioNode>(n: T): T { this.extra.push(n); return n; }
  abstract setParams(p: Record<string, number>): void;
  dispose(): void {
    for (const n of [this.input, this.output, this.pre, this.post, ...this.extra]) { try { n.disconnect(); } catch { /* */ } }
  }
}

/** The serializable form stored on a track / the master — never holds AudioNodes. */
export interface FxInstance {
  id: string;
  type: string;
  on: boolean;
  params: Record<string, number>;
}

const fxUid = () => `fx${Math.random().toString(36).slice(2, 9)}`;
const dbToGain = (db: number) => Math.pow(10, db / 20);
const clampHz = (v: number) => Math.max(16, Math.min(22000, v));
const equalPowerMix = (dry: GainNode, wet: GainNode, mix: number, wetTrim = 1) => {
  const x = Math.max(0, Math.min(1, mix));
  dry.gain.value = Math.cos(x * Math.PI * 0.5);
  wet.gain.value = Math.sin(x * Math.PI * 0.5) * wetTrim;
};

// ── shared shaper curves ────────────────────────────────────────────────────
function driveCurve(amount: number, asym: number, n = 2048): Float32Array {
  const c = new Float32Array(n);
  const g = 1 + amount * 8;
  const b = asym * 0.5;
  const norm = Math.tanh(g * (1 + b)) - Math.tanh(g * b);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (Math.tanh(g * (x + b)) - Math.tanh(g * b)) / Math.max(1e-6, norm);
  }
  return c;
}

/** A transparent WaveShaper curve (linear ramp) — a 2-point curve WebAudio interpolates to identity. */
const IDENTITY_CURVE = new Float32Array([-1, 1]);

/** Full-wave rectifier |x| — as a WaveShaper it doubles a tone's fundamental (an octave-up ghost), the
 *  cheap-and-musical trick behind octave-fuzz and shimmer-reverb feedback. */
const ABS_CURVE = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.abs(x); } return c; })();

/** A soft-clip curve that brickwalls to ±ceil (linear) with a `hardness`-controlled knee. Paired with a
 *  4× WaveShaper oversample it catches inter-sample peaks — true-peak safety. Normalised so full-scale
 *  input maps exactly to ceil. */
function ceilingClipCurve(ceil: number, hardness: number, n = 4096): Float32Array {
  const c = new Float32Array(n);
  const d = 1 + hardness * 8;
  const norm = Math.tanh(d / Math.max(0.05, ceil));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = (ceil * Math.tanh((d * x) / Math.max(0.05, ceil))) / norm;
  }
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Equalizer — 4-band parametric + HP/LP (Ozone Equalizer analogue).
// Its params double as an analytic curve the rack overlays on the RTA — see eqCurveDb().
// ═══════════════════════════════════════════════════════════════════════════
class EqDevice extends FxBase {
  private hp: BiquadFilterNode;
  private b1: BiquadFilterNode; private b2: BiquadFilterNode;
  private b3: BiquadFilterNode; private b4: BiquadFilterNode;
  private lp: BiquadFilterNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.hp = this.own(ctx.createBiquadFilter()); this.hp.type = 'highpass'; this.hp.Q.value = 0.7;
    this.b1 = this.own(ctx.createBiquadFilter()); this.b1.type = 'lowshelf';
    this.b2 = this.own(ctx.createBiquadFilter()); this.b2.type = 'peaking';
    this.b3 = this.own(ctx.createBiquadFilter()); this.b3.type = 'peaking';
    this.b4 = this.own(ctx.createBiquadFilter()); this.b4.type = 'highshelf';
    this.lp = this.own(ctx.createBiquadFilter()); this.lp.type = 'lowpass'; this.lp.Q.value = 0.7;
    this.input.connect(this.hp); this.hp.connect(this.b1); this.b1.connect(this.b2);
    this.b2.connect(this.b3); this.b3.connect(this.b4); this.b4.connect(this.lp);
    this.lp.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    this.hp.frequency.value = clampHz(p.hp ?? 20);
    this.lp.frequency.value = clampHz(p.lp ?? 20000);
    this.b1.frequency.value = clampHz(p.f1 ?? 120); this.b1.gain.value = p.g1 ?? 0;
    this.b2.frequency.value = clampHz(p.f2 ?? 500); this.b2.gain.value = p.g2 ?? 0; this.b2.Q.value = Math.max(0.1, p.q2 ?? 1);
    this.b3.frequency.value = clampHz(p.f3 ?? 3000); this.b3.gain.value = p.g3 ?? 0; this.b3.Q.value = Math.max(0.1, p.q3 ?? 1);
    this.b4.frequency.value = clampHz(p.f4 ?? 10000); this.b4.gain.value = p.g4 ?? 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Dynamics — compressor with makeup (Ozone Dynamics single-band analogue)
// ═══════════════════════════════════════════════════════════════════════════
class CompDevice extends FxBase {
  private comp: DynamicsCompressorNode;
  private color: WaveShaperNode;   // the "voicing" — a touch of harmonic character per model
  private makeup: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.comp = this.own(ctx.createDynamicsCompressor());
    this.color = this.own(ctx.createWaveShaper()); this.color.oversample = '2x'; this.color.curve = IDENTITY_CURVE;
    this.makeup = this.own(ctx.createGain());
    this.input.connect(this.comp); this.comp.connect(this.color); this.color.connect(this.makeup); this.makeup.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    // character: 0 Clean/VCA (transparent), 1 FET (fast + hard knee + odd harmonics), 2 Opto (slow,
    // program-dependent release + soft knee + gentle warmth).
    const character = Math.round(p.character ?? 0);
    let attack = Math.max(0, (p.attack ?? 10) / 1000);
    let release = Math.max(0.001, (p.release ?? 180) / 1000);
    let knee = p.knee ?? 12;
    if (character === 1) { attack *= 0.6; knee = Math.min(knee, 3); this.color.curve = driveCurve(0.10, 0.12); }
    else if (character === 2) { release *= 1.6; knee = Math.max(knee, 18); this.color.curve = driveCurve(0.06, 0); }
    else { this.color.curve = IDENTITY_CURVE; }
    this.comp.threshold.value = p.threshold ?? -18;
    this.comp.ratio.value = Math.max(1, p.ratio ?? 2);
    this.comp.attack.value = attack;
    this.comp.release.value = release;
    this.comp.knee.value = knee;
    this.makeup.gain.value = dbToGain(p.makeup ?? 0);
  }
  gr(): number { return this.comp.reduction; }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Gate / Expander (RX-adjacent noise gate; downward expansion)
// ═══════════════════════════════════════════════════════════════════════════
class GateDevice extends FxBase {
  private detector: AnalyserNode; private amp: GainNode; private buf: Float32Array;
  private threshold = -50; private range = 40; private attack = 0.001; private release = 0.12;
  private timer: ReturnType<typeof setInterval>;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.detector = this.own(ctx.createAnalyser()); this.detector.fftSize = 256; this.detector.smoothingTimeConstant = 0;
    this.amp = this.own(ctx.createGain()); this.buf = new Float32Array(this.detector.fftSize);
    this.input.connect(this.detector); this.input.connect(this.amp); this.amp.connect(this.output);
    // Control-rate detector with AudioParam smoothing: the detector makes the decision, while
    // Web Audio performs the gain ramp on the render thread without zipper noise.
    this.timer = setInterval(() => {
      this.detector.getFloatTimeDomainData(this.buf); let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length); const db = rms > 1e-7 ? 20 * Math.log10(rms) : -140;
      const target = db >= this.threshold ? 1 : dbToGain(-this.range * Math.min(1, (this.threshold - db) / 18));
      const tc = target > this.amp.gain.value ? this.attack : this.release;
      this.amp.gain.setTargetAtTime(target, this.ctx.currentTime, Math.max(0.001, tc));
    }, 8);
  }
  setParams(p: Record<string, number>): void {
    this.threshold = Math.max(-80, Math.min(0, p.threshold ?? -50));
    this.range = Math.max(0, Math.min(80, p.range ?? 40));
    this.attack = Math.max(0.0002, (p.attack ?? 1) / 1000);
    this.release = Math.max(0.01, (p.release ?? 120) / 1000);
  }
  dispose(): void { clearInterval(this.timer); super.dispose(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Glue Comp — SSL-style program-dependent bus compressor, with a parallel
// mix so you can compress hard and blend the transients back in.
// ═══════════════════════════════════════════════════════════════════════════
class GlueCompDevice extends FxBase {
  private comp: DynamicsCompressorNode;
  private makeup: GainNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.comp = this.own(ctx.createDynamicsCompressor());
    this.makeup = this.own(ctx.createGain());
    this.dry = this.own(ctx.createGain());
    this.wet = this.own(ctx.createGain());
    this.comp.knee.value = 6; // soft SSL-ish knee — glue, not clamp
    // parallel: input → dry → out ; input → comp → makeup → wet → out
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.comp); this.comp.connect(this.makeup); this.makeup.connect(this.wet); this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    this.comp.ratio.value = Math.max(1.5, p.ratio ?? 4);      // SSL: 2 / 4 / 10
    this.comp.threshold.value = Math.max(-60, Math.min(0, p.threshold ?? -20));
    this.comp.attack.value = Math.max(0.0001, (p.attack ?? 10) / 1000);   // 0.1–30 ms
    this.comp.release.value = Math.max(0.05, (p.release ?? 300) / 1000);  // 0.1–1.2 s
    this.makeup.gain.value = dbToGain(p.makeup ?? 0);
    const mix = Math.max(0, Math.min(1, (p.mix ?? 100) / 100));
    this.wet.gain.value = mix; this.dry.gain.value = 1 - mix;
  }
  gr(): number { return this.comp.reduction; }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Upward Expander — lift the quiet parts (the inverse of a gate): adds
// depth and life to a mix or a reverb tail without touching the loud material.
// ═══════════════════════════════════════════════════════════════════════════
class UpwardExpanderDevice extends FxBase {
  private detector: AnalyserNode; private amp: GainNode; private buf: Float32Array;
  private threshold = -40; private amount = 6; private attack = 0.01; private release = 0.15;
  private timer: ReturnType<typeof setInterval>;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.detector = this.own(ctx.createAnalyser()); this.detector.fftSize = 256; this.detector.smoothingTimeConstant = 0;
    this.amp = this.own(ctx.createGain()); this.buf = new Float32Array(this.detector.fftSize);
    this.input.connect(this.detector); this.input.connect(this.amp); this.amp.connect(this.output);
    this.timer = setInterval(() => {
      this.detector.getFloatTimeDomainData(this.buf); let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length); const db = rms > 1e-7 ? 20 * Math.log10(rms) : -140;
      // Below threshold (and above a −70 dB floor so it doesn't lift pure noise) → boost, more the
      // further below, capped at `amount`.
      let boostDb = 0;
      if (db < this.threshold && db > -70) boostDb = Math.min(this.amount, (this.threshold - db) * (this.amount / 24));
      const target = dbToGain(boostDb);
      const tc = target > this.amp.gain.value ? this.attack : this.release;
      this.amp.gain.setTargetAtTime(target, this.ctx.currentTime, Math.max(0.001, tc));
    }, 8);
  }
  setParams(p: Record<string, number>): void {
    this.threshold = Math.max(-70, Math.min(0, p.threshold ?? -40));
    this.amount = Math.max(0, Math.min(18, p.amount ?? 6));
    this.attack = Math.max(0.001, (p.attack ?? 10) / 1000);
    this.release = Math.max(0.02, (p.release ?? 150) / 1000);
  }
  dispose(): void { clearInterval(this.timer); super.dispose(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Multiband Dynamics — 3-band compressor. Linkwitz-Riley 4th-order
// crossovers (two cascaded Q=0.707 biquads per split) so the bands sum flat;
// each band has its own threshold, one shared ratio/attack/release.
// ═══════════════════════════════════════════════════════════════════════════
class MultibandDevice extends FxBase {
  private loLP1: BiquadFilterNode; private loLP2: BiquadFilterNode;
  private midHP1: BiquadFilterNode; private midHP2: BiquadFilterNode; private midLP1: BiquadFilterNode; private midLP2: BiquadFilterNode;
  private hiHP1: BiquadFilterNode; private hiHP2: BiquadFilterNode;
  private lo: DynamicsCompressorNode; private mid: DynamicsCompressorNode; private hi: DynamicsCompressorNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const bq = (type: BiquadFilterType) => { const f = this.own(ctx.createBiquadFilter()); f.type = type; f.Q.value = 0.7071; return f; };
    this.loLP1 = bq('lowpass'); this.loLP2 = bq('lowpass');
    this.midHP1 = bq('highpass'); this.midHP2 = bq('highpass'); this.midLP1 = bq('lowpass'); this.midLP2 = bq('lowpass');
    this.hiHP1 = bq('highpass'); this.hiHP2 = bq('highpass');
    this.lo = this.own(ctx.createDynamicsCompressor()); this.mid = this.own(ctx.createDynamicsCompressor()); this.hi = this.own(ctx.createDynamicsCompressor());
    for (const c of [this.lo, this.mid, this.hi]) c.knee.value = 6;
    this.input.connect(this.loLP1); this.loLP1.connect(this.loLP2); this.loLP2.connect(this.lo); this.lo.connect(this.output);
    this.input.connect(this.midHP1); this.midHP1.connect(this.midHP2); this.midHP2.connect(this.midLP1); this.midLP1.connect(this.midLP2); this.midLP2.connect(this.mid); this.mid.connect(this.output);
    this.input.connect(this.hiHP1); this.hiHP1.connect(this.hiHP2); this.hiHP2.connect(this.hi); this.hi.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const xl = Math.max(40, Math.min(1000, p.crossLow ?? 200));
    const xh = Math.max(1000, Math.min(14000, p.crossHigh ?? 2500));
    for (const f of [this.loLP1, this.loLP2, this.midHP1, this.midHP2]) f.frequency.value = (f === this.loLP1 || f === this.loLP2) ? xl : xl;
    for (const f of [this.midLP1, this.midLP2, this.hiHP1, this.hiHP2]) f.frequency.value = xh;
    const ratio = Math.max(1, p.ratio ?? 3), atk = Math.max(0.0001, (p.attack ?? 15) / 1000), rel = Math.max(0.02, (p.release ?? 200) / 1000);
    const set = (c: DynamicsCompressorNode, thr: number) => { c.threshold.value = Math.max(-60, Math.min(0, thr)); c.ratio.value = ratio; c.attack.value = atk; c.release.value = rel; };
    set(this.lo, p.loThresh ?? -24); set(this.mid, p.midThresh ?? -22); set(this.hi, p.hiThresh ?? -20);
  }
  gr(): number { return Math.min(this.lo.reduction, this.mid.reduction, this.hi.reduction); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Exciter / Saturator (Ozone Exciter + Vintage Tape analogue)
// ═══════════════════════════════════════════════════════════════════════════
class SaturatorDevice extends FxBase {
  private preG: GainNode;
  private shaper: WaveShaperNode;
  private dc: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  private lastKey = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.preG = this.own(ctx.createGain());
    this.shaper = this.own(ctx.createWaveShaper()); this.shaper.oversample = '4x';
    this.dc = this.own(ctx.createBiquadFilter()); this.dc.type = 'highpass'; this.dc.frequency.value = 5;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.preG); this.preG.connect(this.shaper); this.shaper.connect(this.dc);
    this.dc.connect(this.wet); this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const drive = Math.max(0, Math.min(1, p.drive ?? 0.3));
    const asym = Math.max(0, Math.min(0.4, p.warmth ?? 0.15));
    const mix = Math.max(0, Math.min(1, p.mix ?? 0.5));
    const key = `${drive.toFixed(3)}:${asym.toFixed(3)}`;
    if (key !== this.lastKey) { this.lastKey = key; this.shaper.curve = drive < 0.005 ? null : driveCurve(drive, asym); }
    // Drive must increase level into the non-linearity; changing only the curve made the first
    // half of the control feel nearly static on normal programme material.
    this.preG.gain.value = dbToGain(drive * 24);
    equalPowerMix(this.dry, this.wet, mix, dbToGain((p.output ?? 0) - drive * 9));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Imager — M/S stereo width with a bass-mono maker (Ozone Imager analogue)
// ═══════════════════════════════════════════════════════════════════════════
class ImagerDevice extends FxBase {
  private sHp: BiquadFilterNode; private sGain: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const split = this.own(ctx.createChannelSplitter(2));
    const midL = this.own(ctx.createGain()); midL.gain.value = 0.5;
    const midR = this.own(ctx.createGain()); midR.gain.value = 0.5;
    const sL = this.own(ctx.createGain()); sL.gain.value = 0.5;
    const sRInv = this.own(ctx.createGain()); sRInv.gain.value = -0.5;
    this.sHp = this.own(ctx.createBiquadFilter()); this.sHp.type = 'highpass'; this.sHp.Q.value = 0.5;
    this.sGain = this.own(ctx.createGain());
    const merge = this.own(ctx.createChannelMerger(2));
    this.input.connect(split);
    const mid = this.own(ctx.createGain());
    split.connect(midL, 0); split.connect(midR, 1);
    midL.connect(mid); midR.connect(mid);
    const side = this.own(ctx.createGain());
    split.connect(sL, 0); split.connect(sRInv, 1);
    sL.connect(side); sRInv.connect(side);
    side.connect(this.sHp); this.sHp.connect(this.sGain);
    mid.connect(merge, 0, 0); mid.connect(merge, 0, 1);
    this.sGain.connect(merge, 0, 0);
    const inv = this.own(ctx.createGain()); inv.gain.value = -1;
    this.sGain.connect(inv); inv.connect(merge, 0, 1);
    merge.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    this.sGain.gain.value = Math.max(0, Math.min(2, (p.width ?? 100) / 100));
    this.sHp.frequency.value = (p.monoBelow ?? 0) > 20 ? clampHz(p.monoBelow) : 16;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: De-hum — tracking comb of notch filters (RX De-hum analogue)
// ═══════════════════════════════════════════════════════════════════════════
class DehumDevice extends FxBase {
  private notches: BiquadFilterNode[] = [];
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    let node: AudioNode = this.input;
    for (let i = 0; i < 8; i++) {
      const n = this.own(ctx.createBiquadFilter()); n.type = 'notch'; n.Q.value = 30;
      node.connect(n); node = n; this.notches.push(n);
    }
    node.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const f0 = p.fundamental ?? 60;
    const harmonics = Math.round(p.harmonics ?? 6);
    const q = Math.max(5, p.q ?? 30);
    this.notches.forEach((n, i) => {
      const active = i < harmonics;
      n.frequency.value = clampHz(f0 * (i + 1));
      n.Q.value = active ? q : 0.0001; // Q≈0 → notch does nothing
      n.gain.value = 0;
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: De-ess — split-band high-frequency compressor (RX/Ozone De-ess analogue)
// ═══════════════════════════════════════════════════════════════════════════
class DeessDevice extends FxBase {
  private lowLp: BiquadFilterNode;
  private hiHp: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    // Split at the crossover; the high band is compressed, then summed back with the low band.
    this.lowLp = this.own(ctx.createBiquadFilter()); this.lowLp.type = 'lowpass';
    this.hiHp = this.own(ctx.createBiquadFilter()); this.hiHp.type = 'highpass';
    this.comp = this.own(ctx.createDynamicsCompressor());
    this.comp.knee.value = 2; this.comp.attack.value = 0.0005; this.comp.release.value = 0.04;
    this.input.connect(this.lowLp); this.lowLp.connect(this.output);
    this.input.connect(this.hiHp); this.hiHp.connect(this.comp); this.comp.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const xover = clampHz(p.frequency ?? 6000);
    this.lowLp.frequency.value = xover; this.hiHp.frequency.value = xover;
    this.comp.threshold.value = p.threshold ?? -28;
    this.comp.ratio.value = Math.max(1, p.amount ?? 5);
  }
  gr(): number { return this.comp.reduction; }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Reverb — convolution with a procedurally generated impulse (space)
// ═══════════════════════════════════════════════════════════════════════════
class ReverbDevice extends FxBase {
  private conv: ConvolverNode;
  private dry: GainNode; private wet: GainNode;
  private preDelay: DelayNode; private damp: BiquadFilterNode; private lowCut: BiquadFilterNode;
  private lastKey = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.conv = this.own(ctx.createConvolver());
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.preDelay = this.own(ctx.createDelay(0.5));
    this.lowCut = this.own(ctx.createBiquadFilter()); this.lowCut.type = 'highpass'; this.lowCut.frequency.value = 90;
    this.damp = this.own(ctx.createBiquadFilter()); this.damp.type = 'lowpass'; this.damp.frequency.value = 9000;
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.preDelay); this.preDelay.connect(this.lowCut); this.lowCut.connect(this.conv);
    this.conv.connect(this.damp); this.damp.connect(this.wet); this.wet.connect(this.output);
  }
  private makeIR(seconds: number, decay: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const rt60 = Math.max(0.15, decay);
    const len = Math.max(1, Math.floor(Math.min(12, Math.max(seconds, rt60 * 1.15)) * sr));
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, progress = i / len;
        // Exponential late field plus discrete early reflections. Separate channel seeds make
        // the tail spacious without phasey channel duplication.
        const noise = Math.random() * 2 - 1;
        last = last * (ch ? 0.31 : 0.27) + noise * (ch ? 0.69 : 0.73);
        const tail = last * Math.exp(-6.91 * t / rt60);
        const early = ([0.011, 0.019, 0.031, 0.047, 0.071].some((x) => Math.abs(t - x * Math.max(0.35, seconds / 1.8) * (ch ? 1.13 : 1)) < 1 / sr)) ? (1 - progress) * 0.9 : 0;
        d[i] = tail * 0.62 + early;
      }
    }
    return buf;
  }
  setParams(p: Record<string, number>): void {
    const size = Math.max(0.1, Math.min(6, p.size ?? 1.8));
    const decay = Math.max(0.5, Math.min(8, p.decay ?? 3));
    const key = `${size.toFixed(2)}:${decay.toFixed(2)}`;
    if (key !== this.lastKey) { this.lastKey = key; this.conv.buffer = this.makeIR(size, decay); }
    this.preDelay.delayTime.value = Math.max(0, Math.min(0.2, (p.preDelay ?? 20) / 1000));
    this.damp.frequency.value = clampHz(p.damping ?? 9000);
    this.lowCut.frequency.value = clampHz(p.lowCut ?? 90);
    const mix = Math.max(0, Math.min(1, (p.mix ?? 25) / 100));
    // Equal-power crossfade: 50% no longer creates the perceived level dip of a linear fade.
    equalPowerMix(this.dry, this.wet, mix, dbToGain(p.wetGain ?? 3));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Delay — feedback delay with tone in the loop (delay)
// ═══════════════════════════════════════════════════════════════════════════
class DelayDevice extends FxBase {
  private delay: DelayNode; private delayR: DelayNode; private fb: GainNode; private fbR: GainNode;
  private tone: BiquadFilterNode; private toneR: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = this.own(ctx.createDelay(2)); this.delayR = this.own(ctx.createDelay(2));
    this.fb = this.own(ctx.createGain()); this.fbR = this.own(ctx.createGain());
    this.tone = this.own(ctx.createBiquadFilter()); this.tone.type = 'lowpass'; this.tone.frequency.value = 4000;
    this.toneR = this.own(ctx.createBiquadFilter()); this.toneR.type = 'lowpass'; this.toneR.frequency.value = 4000;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    const merge = this.own(ctx.createChannelMerger(2));
    this.input.connect(this.delay); this.delay.connect(this.tone); this.tone.connect(merge, 0, 0);
    this.input.connect(this.delayR); this.delayR.connect(this.toneR); this.toneR.connect(merge, 0, 1);
    merge.connect(this.wet); this.wet.connect(this.output);
    this.tone.connect(this.fb); this.fb.connect(this.delay);
    this.toneR.connect(this.fbR); this.fbR.connect(this.delayR);
  }
  setParams(p: Record<string, number>): void {
    const time = Math.max(0.001, Math.min(2, (p.time ?? 350) / 1000));
    const spread = Math.max(0, Math.min(0.5, (p.spread ?? 12) / 100));
    this.delay.delayTime.value = time; this.delayR.delayTime.value = Math.min(2, time * (1 + spread));
    this.fb.gain.value = this.fbR.gain.value = Math.max(0, Math.min(0.985, (p.feedback ?? 35) / 100));
    this.tone.frequency.value = clampHz(p.tone ?? 4000);
    this.toneR.frequency.value = clampHz((p.tone ?? 4000) * 0.92);
    const mix = Math.max(0, Math.min(1, (p.mix ?? 25) / 100));
    equalPowerMix(this.dry, this.wet, mix, dbToGain(p.wetGain ?? 0));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Gain / Trim utility
// ═══════════════════════════════════════════════════════════════════════════
class TrimDevice extends FxBase {
  constructor(ctx: BaseAudioContext) { super(ctx); this.input.connect(this.output); }
  setParams(p: Record<string, number>): void { this.output.gain.value = dbToGain(p.gain ?? 0); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Amp Rack — pedals → preamp stages → tone stack → power amp → cab → mic
//
// The whole rig in one device, so it inserts on any track, rides in the Suite, and prints in
// the offline render like everything else. Signal path mirrors a real backline:
//
//   in ─ gate ─ pedal1 ─ pedal2 ─ [preamp stage ×N with inter-stage coupling + bright cap]
//        ─ tone stack (bass shelf / mid peak / treble shelf, per-model scoop)
//        ─ power amp (sag compressor + presence & resonance shelves)
//        ─ cab filter network ─ mic tilt + peak ─ master
//
// Every stage is oversampled where it clips (WaveShaper '4x'), and the whole thing is native
// nodes so an OfflineAudioContext rebuilds it identically.
// ═══════════════════════════════════════════════════════════════════════════

/** One clipping stage: pre-filter → shaper → post-filter, the shape real pedal circuits have. */
function clipCurve(hardness: number, asym: number, n = 2048): Float32Array {
  const c = new Float32Array(n);
  const k = 1 + hardness * 14;         // hardness → how square the knee gets
  const b = asym * 0.5;
  const norm = Math.tanh(k * (1 + b)) - Math.tanh(k * b);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y = (Math.tanh(k * (x + b)) - Math.tanh(k * b)) / Math.max(1e-6, norm);
    if (hardness > 0.6) { // hard-clip blend for fuzz-class circuits
      const t = (hardness - 0.6) / 0.4;
      y = y * (1 - t) + Math.max(-1, Math.min(1, x * (1 + hardness * 8))) * t;
    }
    c[i] = y;
  }
  return c;
}

class AmpRigDevice extends FxBase {
  // pedals
  private pedals: { pre: BiquadFilterNode; mid: BiquadFilterNode; drive: GainNode; shaper: WaveShaperNode; tone: BiquadFilterNode; level: GainNode; dry: GainNode; wet: GainNode; key: string }[] = [];
  // preamp
  private stageIn: GainNode;
  private stages: { drive: GainNode; shaper: WaveShaperNode; coupling: BiquadFilterNode; key: string }[] = [];
  private bright: BiquadFilterNode;
  // tone stack
  private bass: BiquadFilterNode; private mid: BiquadFilterNode; private treble: BiquadFilterNode; private scoop: BiquadFilterNode;
  // power amp
  private sag: DynamicsCompressorNode;
  private presence: BiquadFilterNode; private resonance: BiquadFilterNode;
  // cab + mic
  private cabLowCut: BiquadFilterNode; private cabBump: BiquadFilterNode; private cabNotch: BiquadFilterNode;
  private cabPresence: BiquadFilterNode; private cabRolloff: BiquadFilterNode;
  private micTilt: BiquadFilterNode; private micPeak: BiquadFilterNode;
  private mic2Tilt: BiquadFilterNode; private mic2Peak: BiquadFilterNode; private mic2Gain: GainNode;
  private cabWet: GainNode; private cabDry: GainNode;
  private master: GainNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const bq = (type: BiquadFilterType, f: number, q = 0.7) => {
      const n = this.own(ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; return n;
    };
    // Two pedal slots.
    for (let i = 0; i < 2; i++) {
      const pre = bq('highpass', 720, 0.7);
      const mid = bq('peaking', 720, 0.8);
      const drive = this.own(ctx.createGain());
      const shaper = this.own(ctx.createWaveShaper()); shaper.oversample = '4x';
      const tone = bq('lowpass', 3200, 0.7);
      const level = this.own(ctx.createGain());
      const dry = this.own(ctx.createGain()); const wet = this.own(ctx.createGain());
      pre.connect(mid); mid.connect(drive); drive.connect(shaper); shaper.connect(tone); tone.connect(level); level.connect(wet);
      this.pedals.push({ pre, mid, drive, shaper, tone, level, dry, wet, key: '' });
    }
    this.stageIn = this.own(ctx.createGain());
    this.bright = bq('highshelf', 2000, 0.7);
    for (let i = 0; i < 4; i++) {
      const drive = this.own(ctx.createGain());
      const shaper = this.own(ctx.createWaveShaper()); shaper.oversample = '4x';
      const coupling = bq('highpass', 60, 0.7);
      drive.connect(shaper); shaper.connect(coupling);
      this.stages.push({ drive, shaper, coupling, key: '' });
    }
    this.bass = bq('lowshelf', 100);
    this.scoop = bq('peaking', 500, 0.7);
    this.mid = bq('peaking', 600, 0.8);
    this.treble = bq('highshelf', 3000);
    this.sag = this.own(ctx.createDynamicsCompressor());
    this.presence = bq('highshelf', 5000);
    this.resonance = bq('peaking', 100, 0.9);
    this.cabLowCut = bq('highpass', 80, 0.8);
    this.cabBump = bq('peaking', 120, 1.1);
    this.cabNotch = bq('peaking', 1600, 1.8);
    this.cabPresence = bq('peaking', 3200, 1.1);
    this.cabRolloff = bq('lowpass', 5000, 1.4);
    this.micTilt = bq('highshelf', 3000);
    this.micPeak = bq('peaking', 5500, 1.2);
    this.mic2Tilt = bq('highshelf', 3000);
    this.mic2Peak = bq('peaking', 5500, 1.2);
    this.mic2Gain = this.own(ctx.createGain());
    this.cabWet = this.own(ctx.createGain());
    this.cabDry = this.own(ctx.createGain());
    this.master = this.own(ctx.createGain());
    // Fixed wiring for the amp + cab section; the pedal/stage counts repatch in setParams.
    this.bright.connect(this.stageIn);
    this.bass.connect(this.scoop); this.scoop.connect(this.mid); this.mid.connect(this.treble);
    this.treble.connect(this.sag);
    this.sag.connect(this.resonance); this.resonance.connect(this.presence);
    this.presence.connect(this.cabLowCut); this.presence.connect(this.cabDry);
    this.cabLowCut.connect(this.cabBump); this.cabBump.connect(this.cabNotch); this.cabNotch.connect(this.cabPresence);
    this.cabPresence.connect(this.cabRolloff); this.cabRolloff.connect(this.micTilt); this.micTilt.connect(this.micPeak);
    this.micPeak.connect(this.cabWet);
    // second mic — a parallel tap off the same cab, blended in
    this.cabRolloff.connect(this.mic2Tilt); this.mic2Tilt.connect(this.mic2Peak); this.mic2Peak.connect(this.mic2Gain);
    this.cabWet.connect(this.master); this.mic2Gain.connect(this.master); this.cabDry.connect(this.master);
    this.master.connect(this.output);
  }

  setParams(p: Record<string, number>): void {
    const amp = ampModelAt(p.amp ?? 4);
    const cab = cabModelAt(p.cab ?? 3);
    const mic = micModelAt(p.mic ?? 0);
    const gain = Math.max(0, Math.min(1, p.gain ?? 0.5));

    // ── pedals ──
    let node: AudioNode = this.input;
    try { this.input.disconnect(); } catch { /* */ }
    for (const pd of this.pedals) { try { pd.wet.disconnect(); pd.dry.disconnect(); pd.level.disconnect(); } catch { /* */ } }
    for (let i = 0; i < this.pedals.length; i++) {
      const slot = this.pedals[i];
      const on = (p[`pedal${i + 1}On`] ?? 0) > 0.5;
      if (!on) continue;
      const model = pedalModelAt(p[`pedal${i + 1}`] ?? 0);
      const drv = Math.max(0, Math.min(1, p[`pedal${i + 1}Drive`] ?? 0.4));
      slot.pre.frequency.value = clampHz(model.preHpHz);
      slot.mid.frequency.value = clampHz(model.midHz); slot.mid.gain.value = model.midDb; slot.mid.Q.value = model.midQ;
      slot.drive.gain.value = 1 + drv * 18;
      const key = `${model.id}:${drv.toFixed(2)}`;
      if (key !== slot.key) { slot.key = key; slot.shaper.curve = clipCurve(model.hardness, model.asym); }
      slot.tone.frequency.value = clampHz(model.toneHz);
      // Level compensation: heavy drive shouldn't just get louder.
      slot.level.gain.value = 1 / (1 + drv * 2.2);
      node.connect(slot.pre);
      slot.wet.gain.value = 1;
      node = slot.wet;
    }

    // ── preamp: bright cap then N cascaded stages ──
    this.bright.gain.value = amp.brightDb * (1 - gain); // the cap's effect fades as gain comes up
    node.connect(this.bright);
    let chain: AudioNode = this.stageIn;
    try { this.stageIn.disconnect(); } catch { /* */ }
    for (const st of this.stages) { try { st.coupling.disconnect(); } catch { /* */ } }
    const stageCount = Math.max(1, Math.min(this.stages.length, amp.stages));
    for (let i = 0; i < stageCount; i++) {
      const st = this.stages[i];
      // Later stages see progressively more drive — that's what makes a 4-stage amp sing.
      const stageDrive = 1 + gain * amp.driveScale * (0.6 + 0.4 * (i / Math.max(1, stageCount - 1)));
      st.drive.gain.value = stageDrive;
      const key = `${amp.id}:${i}`;
      if (key !== st.key) { st.key = key; st.shaper.curve = clipCurve(0.3 + i * 0.06, amp.asym); }
      st.coupling.frequency.value = clampHz(amp.couplingHz * (1 + i * 0.15));
      chain.connect(st.drive);
      chain = st.coupling;
    }
    chain.connect(this.bass);

    // ── tone stack: the player's three knobs on top of the amp's fixed voicing ──
    const knob = (v: number | undefined) => (Math.max(0, Math.min(1, v ?? 0.5)) - 0.5) * 2; // -1..1
    this.bass.frequency.value = clampHz(amp.bassHz); this.bass.gain.value = knob(p.bass) * 12;
    this.scoop.frequency.value = clampHz(amp.midHz * 0.8); this.scoop.gain.value = amp.scoopDb; this.scoop.Q.value = 0.8;
    this.mid.frequency.value = clampHz(amp.midHz); this.mid.Q.value = amp.midQ; this.mid.gain.value = knob(p.mid) * 12;
    this.treble.frequency.value = clampHz(amp.trebleHz); this.treble.gain.value = knob(p.treble) * 12;

    // ── power amp: sag + presence/resonance ──
    const sagAmt = Math.max(0, Math.min(1, p.sagAmt ?? amp.sag));
    this.sag.threshold.value = -30 + (1 - sagAmt) * 24;   // more sag = earlier droop
    this.sag.ratio.value = 1.5 + sagAmt * 4;
    this.sag.knee.value = 12;
    this.sag.attack.value = 0.004 + sagAmt * 0.012;        // supply droop is not instant
    this.sag.release.value = 0.09 + sagAmt * 0.25;
    this.presence.frequency.value = clampHz(amp.presenceHz); this.presence.gain.value = knob(p.presence) * 9;
    this.resonance.frequency.value = clampHz(amp.resonanceHz); this.resonance.gain.value = knob(p.resonance) * 9; this.resonance.Q.value = 0.9;

    // ── cab + mic ──
    const direct = cab.id === 'direct';
    this.cabDry.gain.value = direct ? 1 : 0;
    this.cabWet.gain.value = direct ? 0 : 1;
    this.cabLowCut.frequency.value = clampHz(cab.lowCutHz);
    this.cabBump.frequency.value = clampHz(cab.bumpHz); this.cabBump.gain.value = cab.bumpDb;
    this.cabNotch.frequency.value = clampHz(cab.notchHz); this.cabNotch.gain.value = cab.notchDb; this.cabNotch.Q.value = cab.notchQ;
    // Mic position: cap (0) is bright and peaky, edge (1) is dark and round.
    const edge = Math.max(0, Math.min(1, p.micEdge ?? 0.4));
    this.cabPresence.frequency.value = clampHz(cab.presenceHz);
    this.cabPresence.gain.value = cab.presenceDb * (1 - edge) - edge * 2;
    this.cabRolloff.frequency.value = clampHz(cab.rolloffHz * (1 - edge * 0.25));
    this.cabRolloff.Q.value = cab.rolloffQ;
    this.micTilt.gain.value = mic.tiltDb;
    this.micPeak.frequency.value = clampHz(mic.peakHz); this.micPeak.gain.value = mic.peakDb * (1 - edge * 0.5);
    // Second mic + blend (0 = mic 1 only, 1 = mic 2 only) — the classic 57+121 dual-mic move.
    const mic2 = micModelAt(p.mic2 ?? 1);
    const blend = Math.max(0, Math.min(1, p.micBlend ?? 0));
    this.mic2Tilt.gain.value = mic2.tiltDb;
    this.mic2Peak.frequency.value = clampHz(mic2.peakHz); this.mic2Peak.gain.value = mic2.peakDb * (1 - edge * 0.5);
    this.cabWet.gain.value = direct ? 0 : (1 - blend);
    this.mic2Gain.gain.value = direct ? 0 : blend;

    // ── master, with automatic level compensation so gain changes stay comparable ──
    const comp = 1 / (1 + gain * amp.driveScale * 0.32);
    this.master.gain.value = Math.max(0, Math.min(1, p.master ?? 0.7)) * 2 * comp * dbToGain(amp.outputTrimDb);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Pristine — the AI-song repair pass (Suno/Udio cleanup)
//
// Neural music generators (Suno, Udio) share a artifact profile because they all decode from a
// neural codec, and the research digest (§6) characterises it precisely:
//   · a hard bandwidth cliff — Suno generates at 32 kHz, so everything above ~16 kHz is either
//     missing or upsampler grid noise
//   · "birdies"/shimmer — flickering high-Q bins, worst around 5–7 kHz
//   · diffusion hiss in the 8–16 kHz band
//   · softened drum transients from codec time-smearing
//   · a narrow, unstable stereo image
//
// This device fixes what native Web Audio can honestly fix, in that order:
//   kill the dead band above the cliff → tame the shimmer band dynamically → de-hiss with a
//   gentle high shelf → rebuild the missing top by generating harmonics from the surviving
//   band (SBR-style: band-pass the 6–14 kHz that DID survive, distort it to create octave-up
//   content, high-pass and blend it back) → restore transients → re-widen.
//
// What it is NOT: the ML tier (Apollo/AP-BWE-class codec restoration, phase-coherence
// de-warble) needs a trained model and belongs in an offline WebGPU pass. Those are the planned
// upgrade; everything here is real-time DSP that runs in the live chain and in the render.
// ═══════════════════════════════════════════════════════════════════════════
class PristineDevice extends FxBase {
  private cliff: BiquadFilterNode;          // remove the dead/aliased band above the codec cliff
  private shimmerSplit: BiquadFilterNode;   // the 5–7 kHz birdie band
  private shimmerComp: DynamicsCompressorNode;
  private shimmerRest: BiquadFilterNode;
  private hiss: BiquadFilterNode;           // gentle de-hiss shelf in the diffusion band
  // HF rebuild (spectral band replication, the cheap real-time tier).
  private sbrBand: BiquadFilterNode;
  private sbrShaper: WaveShaperNode;
  private sbrHp: BiquadFilterNode;
  private sbrGain: GainNode;
  // Transient restoration: a fast/slow envelope difference drives an attack emphasis.
  private punch: DynamicsCompressorNode;
  private punchMix: GainNode;
  private body: GainNode;
  // Stereo re-imaging.
  private imager: ImagerDevice;
  private sumIn: GainNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const bq = (t: BiquadFilterType, f: number, q = 0.7) => {
      const n = this.own(ctx.createBiquadFilter()); n.type = t; n.frequency.value = f; n.Q.value = q; return n;
    };
    this.cliff = bq('lowpass', 15800, 0.9);
    this.shimmerSplit = bq('bandpass', 6000, 1.2);
    this.shimmerRest = bq('notch', 6000, 1.2);
    this.shimmerComp = this.own(ctx.createDynamicsCompressor());
    this.shimmerComp.knee.value = 6; this.shimmerComp.attack.value = 0.002; this.shimmerComp.release.value = 0.06;
    this.hiss = bq('highshelf', 9000);
    this.sbrBand = bq('bandpass', 9000, 0.8);
    this.sbrShaper = this.own(ctx.createWaveShaper()); this.sbrShaper.oversample = '4x';
    // A squaring-ish curve generates strong 2nd-harmonic content — the octave-up that rebuilds
    // the band the generator never produced.
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = x * Math.abs(x); }
    this.sbrShaper.curve = curve;
    this.sbrHp = bq('highpass', 13000, 0.7);
    this.sbrGain = this.own(ctx.createGain()); this.sbrGain.gain.value = 0;
    this.punch = this.own(ctx.createDynamicsCompressor());
    this.punch.threshold.value = -34; this.punch.ratio.value = 1.6; this.punch.knee.value = 8;
    this.punch.attack.value = 0.02;   // let the attack THROUGH, clamp what follows
    this.punch.release.value = 0.12;
    this.punchMix = this.own(ctx.createGain()); this.punchMix.gain.value = 0;
    this.body = this.own(ctx.createGain());
    this.sumIn = this.own(ctx.createGain());
    this.imager = new ImagerDevice(ctx);

    // input → cliff → [shimmer band comp + rest] → hiss → sum
    this.input.connect(this.cliff);
    this.cliff.connect(this.shimmerSplit); this.shimmerSplit.connect(this.shimmerComp); this.shimmerComp.connect(this.hiss);
    this.cliff.connect(this.shimmerRest); this.shimmerRest.connect(this.hiss);
    this.hiss.connect(this.sumIn);
    // HF rebuild branch, fed from the surviving band
    this.hiss.connect(this.sbrBand); this.sbrBand.connect(this.sbrShaper); this.sbrShaper.connect(this.sbrHp);
    this.sbrHp.connect(this.sbrGain); this.sbrGain.connect(this.sumIn);
    // transient branch (parallel emphasis) + body
    this.sumIn.connect(this.body); this.body.connect(this.imager.input);
    this.sumIn.connect(this.punch); this.punch.connect(this.punchMix); this.punchMix.connect(this.imager.input);
    this.imager.output.connect(this.output);
  }

  setParams(p: Record<string, number>): void {
    const cliffHz = clampHz(p.cliff ?? 15800);
    this.cliff.frequency.value = cliffHz;
    // Shimmer: compress the birdie band. `shimmer` 0..1 → threshold and ratio.
    const shimmer = Math.max(0, Math.min(1, p.shimmer ?? 0.5));
    this.shimmerSplit.frequency.value = clampHz(p.shimmerHz ?? 6000);
    this.shimmerRest.frequency.value = clampHz(p.shimmerHz ?? 6000);
    this.shimmerComp.threshold.value = -18 - shimmer * 26;
    this.shimmerComp.ratio.value = 1 + shimmer * 7;
    // De-hiss: a gentle shelf, never a gate — musical noise is worse than hiss.
    this.hiss.gain.value = -(Math.max(0, Math.min(1, p.dehiss ?? 0.3)) * 9);
    // HF rebuild: generate from just under the cliff, land just above it.
    const rebuild = Math.max(0, Math.min(1, p.rebuild ?? 0.4));
    this.sbrBand.frequency.value = clampHz(cliffHz * 0.55);
    this.sbrHp.frequency.value = clampHz(cliffHz * 0.9);
    this.sbrGain.gain.value = rebuild * 0.5;
    // Transients: parallel attack emphasis.
    const punch = Math.max(0, Math.min(1, p.transients ?? 0.35));
    this.punchMix.gain.value = punch * 0.9;
    this.body.gain.value = 1 - punch * 0.25;
    // Stereo: AI mixes come back narrow; widen but keep the bass mono.
    this.imager.setParams({ width: p.width ?? 115, monoBelow: p.monoBelow ?? 110 });
  }

  dispose(): void { this.imager.dispose(); super.dispose(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULATION SET — chorus / flanger / phaser / tremolo / auto-pan / vibrato /
// rotary / comb / ring-mod. The standard DAW rack (Bitwig's modulation family),
// all native nodes so the offline render prints them identically.
// ═══════════════════════════════════════════════════════════════════════════

/** An LFO: oscillator → depth gain. Modulates any AudioParam it's connected to. */
class Lfo {
  readonly osc: OscillatorNode;
  readonly depth: GainNode;
  constructor(ctx: BaseAudioContext, type: OscillatorType = 'sine') {
    this.osc = ctx.createOscillator(); this.osc.type = type;
    this.depth = ctx.createGain(); this.depth.gain.value = 0;
    this.osc.connect(this.depth);
    this.osc.start();
  }
  set(rateHz: number, depth: number): void {
    this.osc.frequency.value = Math.max(0.01, Math.min(40, rateHz));
    this.depth.gain.value = depth;
  }
  dispose(): void { try { this.osc.stop(); this.osc.disconnect(); this.depth.disconnect(); } catch { /* */ } }
}

class ChorusDevice extends FxBase {
  private d1: DelayNode; private d2: DelayNode;
  private lfo: Lfo; private inv: GainNode;
  private p1: StereoPannerNode; private p2: StereoPannerNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.d1 = this.own(ctx.createDelay(0.1)); this.d2 = this.own(ctx.createDelay(0.1));
    this.lfo = new Lfo(ctx);
    this.inv = this.own(ctx.createGain()); this.inv.gain.value = -1; // 180° for the second voice
    this.p1 = this.own(ctx.createStereoPanner()); this.p2 = this.own(ctx.createStereoPanner());
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.lfo.depth.connect(this.d1.delayTime);
    this.lfo.depth.connect(this.inv); this.inv.connect(this.d2.delayTime);
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.d1); this.d1.connect(this.p1); this.p1.connect(this.wet);
    this.input.connect(this.d2); this.d2.connect(this.p2); this.p2.connect(this.wet);
    this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const base = 0.012 + Math.max(0, Math.min(1, p.delay ?? 0.4)) * 0.02;
    this.d1.delayTime.value = base; this.d2.delayTime.value = base * 1.15;
    this.lfo.set(p.rate ?? 0.8, Math.max(0, Math.min(1, p.depth ?? 0.5)) * 0.006);
    const spread = Math.max(0, Math.min(1, p.spread ?? 0.7));
    this.p1.pan.value = -spread; this.p2.pan.value = spread;
    const mix = Math.max(0, Math.min(1, (p.mix ?? 50) / 100));
    equalPowerMix(this.dry, this.wet, mix, 0.5); // two wet voices sum at the bus
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class FlangerDevice extends FxBase {
  private delay: DelayNode; private fb: GainNode; private lfo: Lfo;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = this.own(ctx.createDelay(0.05));
    this.fb = this.own(ctx.createGain());
    this.lfo = new Lfo(ctx);
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.lfo.depth.connect(this.delay.delayTime);
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.delay); this.delay.connect(this.wet); this.wet.connect(this.output);
    this.delay.connect(this.fb); this.fb.connect(this.delay);
  }
  setParams(p: Record<string, number>): void {
    const center = 0.0015 + Math.max(0, Math.min(1, p.center ?? 0.35)) * 0.008;
    this.delay.delayTime.value = center;
    this.lfo.set(p.rate ?? 0.25, Math.max(0, Math.min(1, p.depth ?? 0.6)) * center * 0.9);
    // Negative feedback flips the comb — the "jet" flavour switch.
    this.fb.gain.value = Math.max(-0.92, Math.min(0.92, (p.feedback ?? 55) / 100));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 50) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class PhaserDevice extends FxBase {
  private stages: BiquadFilterNode[] = [];
  private lfo: Lfo; private fb: GainNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.lfo = new Lfo(ctx);
    this.fb = this.own(ctx.createGain());
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    let node: AudioNode = this.input;
    for (let i = 0; i < 12; i++) {
      const ap = this.own(ctx.createBiquadFilter()); ap.type = 'allpass'; ap.Q.value = 0.55;
      this.lfo.depth.connect(ap.frequency);
      node.connect(ap); node = ap; this.stages.push(ap);
    }
    node.connect(this.wet); this.wet.connect(this.output);
    node.connect(this.fb); this.fb.connect(this.stages[0]);
    this.input.connect(this.dry); this.dry.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const center = clampHz(p.center ?? 900);
    const active = Math.max(2, Math.min(12, Math.round(p.stages ?? 4)));
    this.stages.forEach((ap, i) => {
      ap.frequency.value = center * (1 + i * 0.4);
      ap.Q.value = i < active ? 0.55 : 0.0001; // parked stages pass through flat
    });
    this.lfo.set(p.rate ?? 0.4, Math.max(0, Math.min(1, p.depth ?? 0.6)) * center * 0.8);
    this.fb.gain.value = Math.max(0, Math.min(0.85, (p.feedback ?? 30) / 100));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 50) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class TremoloDevice extends FxBase {
  private amp: GainNode; private lfo: Lfo;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.amp = this.own(ctx.createGain());
    this.lfo = new Lfo(ctx);
    this.lfo.depth.connect(this.amp.gain);
    this.input.connect(this.amp); this.amp.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const depth = Math.max(0, Math.min(1, p.depth ?? 0.6));
    this.amp.gain.value = 1 - depth * 0.5;
    this.lfo.set(p.rate ?? 5, depth * 0.5);
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class AutoPanDevice extends FxBase {
  private pan: StereoPannerNode; private lfo: Lfo;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.pan = this.own(ctx.createStereoPanner());
    this.lfo = new Lfo(ctx);
    this.lfo.depth.connect(this.pan.pan);
    this.input.connect(this.pan); this.pan.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    this.lfo.set(p.rate ?? 1, Math.max(0, Math.min(1, p.depth ?? 0.8)));
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class VibratoDevice extends FxBase {
  private delay: DelayNode; private lfo: Lfo;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = this.own(ctx.createDelay(0.05));
    this.delay.delayTime.value = 0.008;
    this.lfo = new Lfo(ctx);
    this.lfo.depth.connect(this.delay.delayTime);
    this.input.connect(this.delay); this.delay.connect(this.output); // 100% wet — that's vibrato
  }
  setParams(p: Record<string, number>): void {
    this.lfo.set(p.rate ?? 5, Math.max(0, Math.min(1, p.depth ?? 0.4)) * 0.004);
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class RotaryDevice extends FxBase {
  // Leslie-style: crossover split; the horn gets fast vibrato+tremolo, the drum a slower wobble.
  private lowLp: BiquadFilterNode; private hiHp: BiquadFilterNode;
  private hornDelay: DelayNode; private hornAmp: GainNode; private drumAmp: GainNode;
  private hornLfo: Lfo; private hornTrem: Lfo; private drumLfo: Lfo;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.lowLp = this.own(ctx.createBiquadFilter()); this.lowLp.type = 'lowpass'; this.lowLp.frequency.value = 800;
    this.hiHp = this.own(ctx.createBiquadFilter()); this.hiHp.type = 'highpass'; this.hiHp.frequency.value = 800;
    this.hornDelay = this.own(ctx.createDelay(0.05)); this.hornDelay.delayTime.value = 0.004;
    this.hornAmp = this.own(ctx.createGain()); this.drumAmp = this.own(ctx.createGain());
    this.hornLfo = new Lfo(ctx); this.hornTrem = new Lfo(ctx); this.drumLfo = new Lfo(ctx);
    this.hornLfo.depth.connect(this.hornDelay.delayTime);
    this.hornTrem.depth.connect(this.hornAmp.gain);
    this.drumLfo.depth.connect(this.drumAmp.gain);
    this.input.connect(this.hiHp); this.hiHp.connect(this.hornDelay); this.hornDelay.connect(this.hornAmp); this.hornAmp.connect(this.output);
    this.input.connect(this.lowLp); this.lowLp.connect(this.drumAmp); this.drumAmp.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const speed = Math.max(0, Math.min(1, p.speed ?? 0.5));
    const horn = 0.8 + speed * 6.2;             // chorale → tremolo speeds
    const drum = horn * 0.85;                   // the bass rotor lags the horn — the Leslie feel
    const depth = Math.max(0, Math.min(1, p.depth ?? 0.6));
    this.hornLfo.set(horn, depth * 0.0022);
    this.hornTrem.set(horn, depth * 0.35); this.hornAmp.gain.value = 1 - depth * 0.35;
    this.drumLfo.set(drum, depth * 0.2); this.drumAmp.gain.value = 1 - depth * 0.2;
  }
  dispose(): void { this.hornLfo.dispose(); this.hornTrem.dispose(); this.drumLfo.dispose(); super.dispose(); }
}

class CombDevice extends FxBase {
  private delay: DelayNode; private fb: GainNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = this.own(ctx.createDelay(0.1));
    this.fb = this.own(ctx.createGain());
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.delay); this.delay.connect(this.wet); this.wet.connect(this.output);
    this.delay.connect(this.fb); this.fb.connect(this.delay);
  }
  setParams(p: Record<string, number>): void {
    const freq = Math.max(25, Math.min(2000, p.freq ?? 220));
    this.delay.delayTime.value = 1 / freq;
    // Signed feedback: + rings at f, − rings at f/2 odd harmonics (the hollow flavour).
    this.fb.gain.value = Math.max(-0.95, Math.min(0.95, (p.feedback ?? 70) / 100));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 50) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
}

class RingModDevice extends FxBase {
  private ring: GainNode; private osc: OscillatorNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.ring = this.own(ctx.createGain()); this.ring.gain.value = 0; // carrier drives the gain
    this.osc = ctx.createOscillator(); this.osc.start();
    this.osc.connect(this.ring.gain);
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.ring); this.ring.connect(this.wet); this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    this.osc.frequency.value = Math.max(1, Math.min(8000, p.freq ?? 300));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 100) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { try { this.osc.stop(); this.osc.disconnect(); } catch { /* */ } super.dispose(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// DJ / PERFORMANCE SET — the Traktor rack, rebuilt: the sweepable performance
// filter with an LFO, the Gater, and the Beatmasher (loop-freeze stutter).
// Gater and Beatmasher sync to the transport via setTempo.
// ═══════════════════════════════════════════════════════════════════════════

const DIVISIONS = [1, 2, 4, 8] as const; // cycles per beat: 1/4, 1/8, 1/16, 1/32
const divisionLabel = (v: number) => ['1/4', '1/8', '1/16', '1/32'][Math.max(0, Math.min(3, Math.round(v)))];

class AutoFilterDevice extends FxBase {
  private shaper: WaveShaperNode;
  private filter: BiquadFilterNode;
  private lfo: Lfo;
  private lastDrive = -1;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.shaper = this.own(ctx.createWaveShaper()); this.shaper.oversample = '2x';
    this.filter = this.own(ctx.createBiquadFilter());
    this.lfo = new Lfo(ctx);
    this.lfo.depth.connect(this.filter.frequency);
    this.input.connect(this.shaper); this.shaper.connect(this.filter); this.filter.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const mode = Math.round(p.mode ?? 0);
    this.filter.type = mode === 1 ? 'highpass' : mode === 2 ? 'bandpass' : 'lowpass';
    const cutoff = clampHz(p.cutoff ?? 1200);
    this.filter.frequency.value = cutoff;
    this.filter.Q.value = Math.max(0.3, Math.min(18, p.res ?? 2));
    const drive = Math.max(0, Math.min(1, p.drive ?? 0));
    if (drive !== this.lastDrive) { this.lastDrive = drive; this.shaper.curve = drive < 0.01 ? null : driveCurve(drive * 0.7, 0.1); }
    this.lfo.set(p.rate ?? 0.5, Math.max(0, Math.min(1, p.depth ?? 0)) * cutoff * 0.85);
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class GaterDevice extends FxBase {
  private amp: GainNode;
  private lfo: Lfo;
  private square: WaveShaperNode;
  private depthG: GainNode;
  private bpm = 120;
  private lastP: Record<string, number> = {};
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.amp = this.own(ctx.createGain());
    this.lfo = new Lfo(ctx);
    this.square = this.own(ctx.createWaveShaper());
    // Steep sigmoid → the sine LFO becomes a smoothed square (clickless gate edges).
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 14); }
    this.square.curve = curve;
    this.depthG = this.own(ctx.createGain());
    this.lfo.depth.gain.value = 1;
    this.lfo.depth.connect(this.square); this.square.connect(this.depthG); this.depthG.connect(this.amp.gain);
    this.input.connect(this.amp); this.amp.connect(this.output);
  }
  setTempo(bpm: number): void { this.bpm = bpm; this.setParams(this.lastP); }
  setParams(p: Record<string, number>): void {
    this.lastP = p;
    const depth = Math.max(0, Math.min(1, p.depth ?? 0.9));
    const cyclesPerBeat = DIVISIONS[Math.max(0, Math.min(3, Math.round(p.division ?? 2)))];
    this.lfo.osc.frequency.value = (this.bpm / 60) * cyclesPerBeat;
    // gate swings ±0.5·depth around 1−0.5·depth → floor at 1−depth, ceiling at 1.
    this.amp.gain.value = 1 - depth * 0.5;
    this.depthG.gain.value = depth * 0.5;
  }
  dispose(): void { this.lfo.dispose(); super.dispose(); }
}

class BeatmasherDevice extends FxBase {
  // Loop-freeze stutter: engage → the last slice loops (input muted, feedback ≈ 1).
  private inGate: GainNode;
  private delay: DelayNode;
  private fb: GainNode;
  private loopHp: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  private bpm = 120;
  private lastP: Record<string, number> = {};
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.inGate = this.own(ctx.createGain());
    this.delay = this.own(ctx.createDelay(4));
    this.fb = this.own(ctx.createGain());
    this.loopHp = this.own(ctx.createBiquadFilter()); this.loopHp.type = 'highpass'; this.loopHp.frequency.value = 25;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.inGate); this.inGate.connect(this.delay);
    this.delay.connect(this.loopHp); this.loopHp.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.wet); this.wet.connect(this.output);
  }
  setTempo(bpm: number): void { this.bpm = bpm; this.setParams(this.lastP); }
  setParams(p: Record<string, number>): void {
    this.lastP = p;
    const on = (p.mash ?? 0) > 0.5;
    const beatsPerSlice = 4 / DIVISIONS[Math.max(0, Math.min(3, Math.round(p.length ?? 1)))]; // 1/4→1 beat …
    const slice = Math.max(0.02, Math.min(4, (60 / this.bpm) * beatsPerSlice));
    // Only move the slice length while NOT frozen — changing delayTime mid-freeze warps the loop
    // (which is also a classic Beatmasher move, so pitch/warp rides the Length knob when held).
    this.delay.delayTime.value = slice;
    this.inGate.gain.value = on ? 0 : 1;
    this.fb.gain.value = on ? 0.995 : 0;
    this.dry.gain.value = on ? 0 : 1;
    this.wet.gain.value = on ? 1 : 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Stutter — a PATTERN-driven Beatmasher. A 16-step grid (a bitmask param
// the Stutter editor writes) says which steps re-trigger the captured slice; the
// clock is tempo-synced to the chosen division. Dry steps keep capturing so the
// next active step has fresh audio to loop. `gate` sets the slice length (a
// shorter slice re-loops within the step = a faster, glitchier stutter).
// ═══════════════════════════════════════════════════════════════════════════
class StutterDevice extends FxBase {
  private inGate: GainNode; private delay: DelayNode; private fb: GainNode; private hp: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  private bpm = 120; private lastP: Record<string, number> = {};
  private pattern = 0; private division = 4; private gate = 1; private on = false;
  private stepIdx = 0; private timer: ReturnType<typeof setInterval> | null = null;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.inGate = this.own(ctx.createGain());
    this.delay = this.own(ctx.createDelay(1));
    this.fb = this.own(ctx.createGain());
    this.hp = this.own(ctx.createBiquadFilter()); this.hp.type = 'highpass'; this.hp.frequency.value = 25;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.inGate); this.inGate.connect(this.delay);
    this.delay.connect(this.hp); this.hp.connect(this.fb); this.fb.connect(this.delay);
    this.delay.connect(this.wet); this.wet.connect(this.output);
    this.dry.gain.value = 1; this.inGate.gain.value = 1;
  }
  private stepDur(): number { return (60 / this.bpm) / this.division; } // division = cycles per beat
  private idle(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.inGate.gain.value = 1; this.fb.gain.value = 0; this.dry.gain.value = 1; this.wet.gain.value = 0; }
  private restart(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (!this.on || this.pattern === 0) { this.idle(); return; }
    const dur = this.stepDur();
    this.delay.delayTime.value = Math.max(0.02, dur * this.gate);
    const tick = () => {
      const active = (this.pattern >> (this.stepIdx & 15)) & 1;
      this.inGate.gain.value = active ? 0 : 1;   // freeze on an active step
      this.fb.gain.value = active ? 0.995 : 0;
      this.dry.gain.value = active ? 0 : 1;
      this.wet.gain.value = active ? 1 : 0;
      this.stepIdx = (this.stepIdx + 1) & 15;
    };
    tick();
    this.timer = setInterval(tick, dur * 1000);
  }
  setTempo(bpm: number): void { this.bpm = bpm; if (this.on) this.restart(); }
  setParams(p: Record<string, number>): void {
    this.lastP = p;
    this.pattern = Math.max(0, Math.round(p.pattern ?? 0)) & 0xFFFF;
    this.division = DIVISIONS[Math.max(0, Math.min(3, Math.round(p.division ?? 2)))]; // default 1/16
    this.gate = Math.max(0.1, Math.min(1, (p.gate ?? 100) / 100));
    this.on = (p.on ?? 0) > 0.5;
    this.restart();
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); super.dispose(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY ADDITIONS — Peak Limiter, Transient Control, Bit-8 crusher.
// ═══════════════════════════════════════════════════════════════════════════

class LimiterDevice extends FxBase {
  private drive: GainNode;
  private comp: DynamicsCompressorNode;
  private ceilingG: GainNode;
  private clip: WaveShaperNode;   // 4× oversampled soft-clip → catches inter-sample (true) peaks
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.drive = this.own(ctx.createGain());
    this.comp = this.own(ctx.createDynamicsCompressor());
    this.comp.knee.value = 0; this.comp.ratio.value = 20; this.comp.attack.value = 0.001;
    this.ceilingG = this.own(ctx.createGain());
    this.clip = this.own(ctx.createWaveShaper()); this.clip.oversample = '4x';
    this.input.connect(this.drive); this.drive.connect(this.comp); this.comp.connect(this.ceilingG); this.ceilingG.connect(this.clip); this.clip.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const ceiling = Math.max(-12, Math.min(0, p.ceiling ?? -0.3));
    // character: 0 Transparent, 1 Glue (slower release), 2 Loud (fast + harder clip).
    const character = Math.round(p.character ?? 0);
    this.drive.gain.value = dbToGain(Math.max(0, p.gain ?? 0));
    this.comp.threshold.value = ceiling;
    let release = Math.max(0.01, (p.release ?? 80) / 1000);
    if (character === 1) release *= 1.8; else if (character === 2) release *= 0.4;
    this.comp.release.value = release;
    this.ceilingG.gain.value = dbToGain(Math.min(0, ceiling));
    // True-peak-safe brickwall: soft-clip to the ceiling, 4× oversampled so inter-sample peaks are
    // caught (a plain sample-domain limiter overshoots them). Harder knee = louder/more aggressive.
    const ceilLin = dbToGain(ceiling);
    const hardness = character === 2 ? 0.9 : character === 1 ? 0.35 : 0.6;
    this.clip.curve = ceilingClipCurve(ceilLin, hardness);
  }
  gr(): number { return this.comp.reduction; }
}

class TransientDevice extends FxBase {
  // Parallel attack emphasis + sustain trim — the honest native-node transient designer.
  private punch: DynamicsCompressorNode;
  private punchMix: GainNode;
  private body: GainNode;
  private polarity: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.punch = this.own(ctx.createDynamicsCompressor());
    this.punch.threshold.value = -34; this.punch.ratio.value = 12; this.punch.knee.value = 6;
    this.punch.attack.value = 0.02; this.punch.release.value = 0.14;
    this.punchMix = this.own(ctx.createGain());
    this.body = this.own(ctx.createGain());
    this.polarity = this.own(ctx.createGain()); this.polarity.gain.value = -1;
    this.input.connect(this.body); this.body.connect(this.output);
    // original minus its slow/strongly-compressed body approximates an attack-only residual.
    this.input.connect(this.punchMix); this.input.connect(this.punch); this.punch.connect(this.polarity); this.polarity.connect(this.punchMix); this.punchMix.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const attack = Math.max(-1, Math.min(1, p.attack ?? 0.4));
    const sustain = Math.max(-1, Math.min(1, p.sustain ?? 0));
    // +attack: add the clamped-tail branch (attack pokes through). −attack: duck the body.
    this.punchMix.gain.value = Math.max(0, attack) * 1.5;
    this.body.gain.value = (1 + sustain * 0.65) * (1 + Math.min(0, attack) * 0.65);
  }
  gr(): number { return this.punch.reduction; }
}

class BitcrushDevice extends FxBase {
  private shaper: WaveShaperNode;
  private rate: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  private lastBits = -1;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.shaper = this.own(ctx.createWaveShaper());
    this.rate = this.own(ctx.createBiquadFilter()); this.rate.type = 'lowpass'; this.rate.Q.value = 4;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.shaper); this.shaper.connect(this.rate); this.rate.connect(this.wet); this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const bits = Math.max(1, Math.min(16, Math.round(p.bits ?? 8)));
    if (bits !== this.lastBits) {
      this.lastBits = bits;
      const steps = Math.pow(2, bits);
      const curve = new Float32Array(4096);
      for (let i = 0; i < 4096; i++) {
        const x = (i / 4095) * 2 - 1;
        curve[i] = Math.round(x * steps * 0.5) / (steps * 0.5);
      }
      this.shaper.curve = curve;
    }
    // "Rate" as a resonant lowpass — the downsample aliasing flavour without a worklet.
    this.rate.frequency.value = clampHz(p.rateHz ?? 12000);
    const mix = Math.max(0, Math.min(1, (p.mix ?? 100) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Spaces — the flagship convolution reverb.
//
// A bank of modeled impulse responses of the world's great reverberant spaces —
// synthesized (multi-band decay + space-specific early-reflection patterns +
// decorrelated stereo), not recordings, so the whole bank ships in zero bytes
// and regenerates at any sample rate. Each space defines RT60 per band, an
// early-reflection character, and a tonal tilt; Size stretches the room, Damp
// pulls the high band down faster (soft furnishings), Width narrows the tail.
// ═══════════════════════════════════════════════════════════════════════════

interface SpaceDef {
  id: string; label: string;
  rtLow: number; rtMid: number; rtHigh: number;  // RT60 seconds per band
  erCount: number; erSpanMs: number; erGain: number; // early-reflection pattern
  tilt: number;   // −1 dark … +1 bright overall voicing
  seed: number;
}

export const REVERB_SPACES: SpaceDef[] = [
  { id: 'wood-room', label: 'Wood Room', rtLow: 0.5, rtMid: 0.45, rtHigh: 0.3, erCount: 10, erSpanMs: 22, erGain: 0.7, tilt: 0.1, seed: 11 },
  { id: 'chamber', label: 'Echo Chamber', rtLow: 1.7, rtMid: 1.6, rtHigh: 1.2, erCount: 8, erSpanMs: 18, erGain: 0.5, tilt: 0.2, seed: 21 },
  { id: 'plate', label: 'Studio Plate', rtLow: 2.4, rtMid: 2.8, rtHigh: 2.6, erCount: 0, erSpanMs: 0, erGain: 0, tilt: 0.5, seed: 31 },
  { id: 'opera', label: 'Opera House', rtLow: 2.0, rtMid: 1.8, rtHigh: 1.2, erCount: 14, erSpanMs: 42, erGain: 0.45, tilt: 0, seed: 41 },
  { id: 'concert-hall', label: 'Grand Concert Hall', rtLow: 2.6, rtMid: 2.2, rtHigh: 1.5, erCount: 16, erSpanMs: 55, erGain: 0.4, tilt: -0.1, seed: 51 },
  { id: 'stone-chapel', label: 'Stone Chapel', rtLow: 3.0, rtMid: 3.2, rtHigh: 2.0, erCount: 12, erSpanMs: 38, erGain: 0.55, tilt: 0.15, seed: 61 },
  { id: 'cathedral', label: 'Gothic Cathedral', rtLow: 7.5, rtMid: 6.5, rtHigh: 3.4, erCount: 18, erSpanMs: 90, erGain: 0.45, tilt: -0.15, seed: 71 },
  { id: 'taj', label: 'Marble Dome (Taj)', rtLow: 9.0, rtMid: 8.5, rtHigh: 5.5, erCount: 9, erSpanMs: 75, erGain: 0.6, tilt: 0.3, seed: 81 },
  { id: 'mausoleum', label: 'Hamilton Mausoleum', rtLow: 11, rtMid: 9.5, rtHigh: 4.5, erCount: 8, erSpanMs: 70, erGain: 0.5, tilt: -0.2, seed: 91 },
  { id: 'cistern', label: 'Underground Cistern', rtLow: 12, rtMid: 10, rtHigh: 3.0, erCount: 6, erSpanMs: 60, erGain: 0.4, tilt: -0.5, seed: 101 },
  { id: 'canyon', label: 'Canyon', rtLow: 5.5, rtMid: 5.0, rtHigh: 2.5, erCount: 5, erSpanMs: 320, erGain: 0.8, tilt: -0.1, seed: 111 },
  { id: 'cave', label: 'Lava Cave', rtLow: 4.0, rtMid: 3.2, rtHigh: 1.2, erCount: 22, erSpanMs: 48, erGain: 0.6, tilt: -0.6, seed: 121 },
];

/** Deterministic per-space rng so a preset always sounds like itself. */
function spaceRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSpaceIR(ctx: BaseAudioContext, space: SpaceDef, size: number, damp: number, width: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const rtLow = space.rtLow * size;
  const rtMid = space.rtMid * size;
  const rtHigh = Math.max(0.1, space.rtHigh * size * (1 - damp * 0.75));
  const seconds = Math.min(10, Math.max(rtLow, rtMid, rtHigh) * 0.75 + 0.1);
  const len = Math.max(64, Math.floor(seconds * sr));
  const buf = ctx.createBuffer(2, len, sr);
  const kLow = 6.91 / (rtLow * sr), kMid = 6.91 / (rtMid * sr), kHigh = 6.91 / (rtHigh * sr);
  // One-pole crossovers at ~250 Hz and ~2.5 kHz.
  const aLow = 1 - Math.exp(-2 * Math.PI * 250 / sr);
  const aHigh = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
  const chans: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const rng = spaceRng(space.seed + ch * 7919);
    const d = buf.getChannelData(ch);
    let lp1 = 0, lp2 = 0;
    for (let i = 0; i < len; i++) {
      const x = rng() * 2 - 1;
      lp1 += aLow * (x - lp1);          // low band
      lp2 += aHigh * (x - lp2);         // low+mid band
      const low = lp1, mid = lp2 - lp1, high = x - lp2;
      const tiltHi = 1 + space.tilt * 0.6, tiltLo = 1 - space.tilt * 0.4;
      d[i] = low * tiltLo * Math.exp(-kLow * i) + mid * Math.exp(-kMid * i) + high * tiltHi * Math.exp(-kHigh * i);
    }
    // Early reflections: sparse signed taps over the space's own span, fading with distance.
    const erSpan = Math.max(1, Math.floor((space.erSpanMs / 1000) * size * sr));
    for (let e = 0; e < space.erCount; e++) {
      const at = Math.floor(rng() * erSpan);
      if (at < len) d[at] += (rng() > 0.5 ? 1 : -1) * space.erGain * (1 - e / Math.max(1, space.erCount)) * (0.5 + rng() * 0.5);
    }
    // Fade-in over ~3 ms so the direct-sound spike never clicks.
    const fade = Math.min(len, Math.floor(sr * 0.003));
    for (let i = 0; i < fade; i++) d[i] *= i / fade;
    chans.push(d);
  }
  // Width: crossmix the decorrelated channels toward mono.
  const w = Math.max(0, Math.min(1, width));
  if (w < 1) {
    const [l, r] = chans;
    for (let i = 0; i < len; i++) {
      const m = (l[i] + r[i]) * 0.5, s = (l[i] - r[i]) * 0.5 * w;
      l[i] = m + s; r[i] = m - s;
    }
  }
  // Normalize to a sane wet level.
  let peak = 1e-6;
  for (const c of chans) for (let i = 0; i < len; i++) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
  const g = 0.5 / peak;
  for (const c of chans) for (let i = 0; i < len; i++) c[i] *= g;
  return buf;
}

class SpacesDevice extends FxBase {
  private conv: ConvolverNode;
  private preDelay: DelayNode;
  private dry: GainNode; private wet: GainNode;
  private lastKey = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.conv = this.own(ctx.createConvolver());
    this.preDelay = this.own(ctx.createDelay(0.5));
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.preDelay); this.preDelay.connect(this.conv); this.conv.connect(this.wet); this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    // Source 1 = a real recorded IR from the library; 0 = a modelled space (the default, zero-byte).
    if ((p.irMode ?? 0) > 0.5) {
      const def = irByIndex(p.irIndex ?? 0);
      const key = `ir:${def?.id ?? '?'}`;
      if (def && key !== this.lastKey) {
        this.lastKey = key;
        irIntoConvolver(this.ctx, this.conv, def.id, () => this.lastKey === key);
      }
    } else {
      const space = REVERB_SPACES[Math.max(0, Math.min(REVERB_SPACES.length - 1, Math.round(p.space ?? 6)))];
      const size = Math.max(0.25, Math.min(2, p.size ?? 1));
      const damp = Math.max(0, Math.min(1, p.damp ?? 0.2));
      const width = Math.max(0, Math.min(1, (p.width ?? 100) / 100));
      const key = `mdl:${space.id}:${size.toFixed(2)}:${damp.toFixed(2)}:${width.toFixed(2)}`;
      if (key !== this.lastKey) { this.lastKey = key; this.conv.buffer = makeSpaceIR(this.ctx, space, size, damp, width); }
    }
    this.preDelay.delayTime.value = Math.max(0, Math.min(0.25, (p.preDelay ?? 15) / 1000));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 30) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
}

/** Point a ConvolverNode at a library IR: use the decoded buffer if it's cached (deterministic for the
 *  offline render), else drop in a modelled placeholder now and hot-swap the real IR once it decodes.
 *  `stillWanted()` is checked on resolve so a stale load never clobbers a newer selection. */
function irIntoConvolver(ctx: BaseAudioContext, conv: ConvolverNode, id: string, stillWanted: () => boolean): void {
  const cached = getCachedIr(id, ctx.sampleRate);
  if (cached) { conv.buffer = cached; return; }
  conv.buffer = makeSpaceIR(ctx, REVERB_SPACES[0], 1, 0.3, 1); // placeholder until the real IR decodes
  void loadIr(ctx, id).then((buf) => { if (buf && stillWanted()) conv.buffer = buf; });
}

/** A reversed clone of an IR (so a shared/cached buffer is never mutated in place). */
function reversedCopy(ctx: BaseAudioContext, src: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const s = src.getChannelData(ch), d = out.getChannelData(ch), n = s.length;
    for (let i = 0; i < n; i++) d[i] = s[n - 1 - i];
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATIVE WAVE — the sound-design tools: a single-sideband Frequency Shifter,
// an analog-style channel Vocoder, a granular Freeze/Cloud, and a saturating
// Console EQ colour. All sample-accurate (osc/convolver/biquad/waveshaper), so
// the offline album render reproduces them — no control-rate detectors here.
// Original voicings; no trademarked model names.
// ═══════════════════════════════════════════════════════════════════════════

// DEVICE: Frequency Shifter — a TRUE single-sideband shift (every partial moves by the same number of
// Hz, so harmonic ratios break — inharmonic, metallic, distinct from a pitch shifter and from ring-mod).
// Method: build the analytic signal x + j·H(x) with an FIR Hilbert transformer (90° phase), then
// SSB-modulate — out = x·cos(ωt) − H(x)·sin(ωt). cos/sin come from two PeriodicWave oscillators started
// together (a locked 90° quadrature pair). The Hilbert conv delays by (taps-1)/2, so the direct (cos)
// path takes a matching DelayNode. Down-shift flips the sin path's sign (cos is even, sin is odd).
class FreqShifterDevice extends FxBase {
  private conv: ConvolverNode; private dryDelay: DelayNode;
  private cosMul: GainNode; private sinMul: GainNode; private sinInv: GainNode; private sum: GainNode;
  private cosOsc: OscillatorNode; private sinOsc: OscillatorNode;
  private dry: GainNode; private wet: GainNode; private fb: GainNode; private fbDelay: DelayNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const { kernel, delay } = designHilbertFir(511);
    this.conv = this.own(ctx.createConvolver()); this.conv.normalize = false;
    const ir = ctx.createBuffer(1, kernel.length, ctx.sampleRate); ir.getChannelData(0).set(kernel); this.conv.buffer = ir;
    this.dryDelay = this.own(ctx.createDelay(1)); this.dryDelay.delayTime.value = delay / ctx.sampleRate;
    this.cosMul = this.own(ctx.createGain()); this.cosMul.gain.value = 0; // osc drives this
    this.sinMul = this.own(ctx.createGain()); this.sinMul.gain.value = 0;
    this.sinInv = this.own(ctx.createGain()); this.sinInv.gain.value = -1;
    this.sum = this.own(ctx.createGain());
    // quadrature pair: real→cos (real coeff), imag→sin (imag coeff). disableNormalization keeps both at amplitude 1.
    this.cosOsc = ctx.createOscillator();
    this.sinOsc = ctx.createOscillator();
    this.cosOsc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]), { disableNormalization: true }));
    this.sinOsc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1]), { disableNormalization: true }));
    this.cosOsc.start(); this.sinOsc.start();
    // real path: delayed input · cos
    this.input.connect(this.dryDelay); this.dryDelay.connect(this.cosMul); this.cosMul.connect(this.sum);
    // imag path: Hilbert(input) · sin, inverted for up-shift
    this.input.connect(this.conv); this.conv.connect(this.sinMul); this.sinMul.connect(this.sinInv); this.sinInv.connect(this.sum);
    this.cosOsc.connect(this.cosMul.gain); this.sinOsc.connect(this.sinMul.gain);
    // wet/dry + a feedback loop that re-shifts (spiralling cascade — a signature freq-shifter move)
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.fb = this.own(ctx.createGain()); this.fb.gain.value = 0;
    this.fbDelay = this.own(ctx.createDelay(0.05)); this.fbDelay.delayTime.value = 0.02;
    this.sum.connect(this.wet); this.wet.connect(this.output);
    this.sum.connect(this.fbDelay); this.fbDelay.connect(this.fb); this.fb.connect(this.input);
    this.input.connect(this.dry); this.dry.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const shift = Math.max(-2000, Math.min(2000, p.shift ?? 100));
    this.cosOsc.frequency.value = Math.abs(shift);
    this.sinOsc.frequency.value = Math.abs(shift);
    this.sinInv.gain.value = shift >= 0 ? -1 : 1; // up subtracts, down adds
    this.fb.gain.value = Math.max(0, Math.min(0.9, p.feedback ?? 0));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 100) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { try { this.cosOsc.stop(); this.sinOsc.stop(); this.cosOsc.disconnect(); this.sinOsc.disconnect(); } catch { /* */ } super.dispose(); }
}

// DEVICE: Vocoder — a classic analog-style channel vocoder as an insert. The channel IS the modulator
// (voice, drums, a pad); an internal carrier (detuned saws + a breath of noise for consonants) is
// sculpted by the modulator's moving spectrum. Per band: bandpass the modulator → full-wave rectify
// (WaveShaper |x|) → smooth (lowpass envelope follower) → that control signal drives the gain of the
// carrier's matching bandpass. Everything is audio-rate — NO setInterval — so it renders offline too.
const VOC_BANDS = 20; // log-spaced 150 Hz … 7 kHz
class VocoderDevice extends FxBase {
  private sawA: OscillatorNode; private sawB: OscillatorNode; private noise: AudioBufferSourceNode;
  private noiseGain: GainNode; private carSum: GainNode;
  private vcas: GainNode[] = []; private envGains: GainNode[] = []; private carBPs: BiquadFilterNode[] = [];
  private dry: GainNode; private wet: GainNode;
  private centers: number[] = [];
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    // full-wave rectifier curve |x| — shared array, but each band gets its OWN WaveShaper node so the
    // bands stay separate (one shared node would sum every band's envelope into one control signal).
    const rectCurve = new Float32Array(1024);
    for (let i = 0; i < rectCurve.length; i++) { const x = (i / (rectCurve.length - 1)) * 2 - 1; rectCurve[i] = Math.abs(x); }
    // internal carrier: two saws a hair apart + noise
    this.sawA = ctx.createOscillator(); this.sawA.type = 'sawtooth'; this.sawA.frequency.value = 110;
    this.sawB = ctx.createOscillator(); this.sawB.type = 'sawtooth'; this.sawB.frequency.value = 110; this.sawB.detune.value = 8;
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource(); this.noise.buffer = nb; this.noise.loop = true;
    this.noiseGain = this.own(ctx.createGain()); this.noiseGain.gain.value = 0.08;
    this.carSum = this.own(ctx.createGain());
    this.sawA.connect(this.carSum); this.sawB.connect(this.carSum); this.noise.connect(this.noiseGain); this.noiseGain.connect(this.carSum);
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    for (let i = 0; i < VOC_BANDS; i++) {
      const f = 150 * Math.pow(7000 / 150, i / (VOC_BANDS - 1));
      this.centers.push(f);
      const q = 4.5;
      // modulator analysis: bandpass → rectify → envelope lowpass → env control gain
      const modBP = this.own(ctx.createBiquadFilter()); modBP.type = 'bandpass'; modBP.frequency.value = f; modBP.Q.value = q;
      const rect = this.own(ctx.createWaveShaper()); rect.curve = rectCurve; rect.oversample = '2x'; // per-band rectifier
      const envLP = this.own(ctx.createBiquadFilter()); envLP.type = 'lowpass'; envLP.frequency.value = 18; // ~9ms follower
      const envGain = this.own(ctx.createGain()); envGain.gain.value = 8; // envelope depth → VCA drive
      this.input.connect(modBP); modBP.connect(rect); rect.connect(envLP); envLP.connect(envGain);
      // carrier synthesis: bandpass at the same centre, gain driven by the envelope
      const carBP = this.own(ctx.createBiquadFilter()); carBP.type = 'bandpass'; carBP.frequency.value = f; carBP.Q.value = q;
      const vca = this.own(ctx.createGain()); vca.gain.value = 0;
      this.carSum.connect(carBP); carBP.connect(vca); vca.connect(this.wet);
      envGain.connect(vca.gain);
      this.vcas.push(vca); this.envGains.push(envGain); this.carBPs.push(carBP);
    }
    this.wet.connect(this.output);
    this.sawA.start(); this.sawB.start(); this.noise.start();
  }
  setParams(p: Record<string, number>): void {
    const pitch = Math.max(40, Math.min(400, p.carrier ?? 110));
    this.sawA.frequency.value = pitch; this.sawB.frequency.value = pitch;
    this.sawB.detune.value = Math.max(0, Math.min(40, p.detune ?? 8));
    this.noiseGain.gain.value = Math.max(0, Math.min(0.5, p.breath ?? 0.08));
    const depth = Math.max(1, Math.min(20, p.depth ?? 8));
    for (const g of this.envGains) g.gain.value = depth;
    const q = Math.max(2, Math.min(14, p.tightness ?? 4.5));
    for (const bp of this.carBPs) bp.Q.value = q;
    const mix = Math.max(0, Math.min(1, (p.mix ?? 100) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { try { this.sawA.stop(); this.sawB.stop(); this.noise.stop(); this.sawA.disconnect(); this.sawB.disconnect(); this.noise.disconnect(); } catch { /* */ } super.dispose(); }
}

// DEVICE: Freeze / Cloud — a granular smear. A modulated multi-tap delay cloud: several short taps at
// slightly different, LFO-jittered delay times with a long feedback loop create a shimmering sustain
// out of a moment of input — the "freeze" pad. `freeze` pushes feedback toward unity (infinite hold);
// `spray` widens the tap jitter (grain scatter); `size` sets the grain/tap window. Self-contained delay
// network — renders offline.
const CLOUD_TAPS = 4;
class FreezeCloudDevice extends FxBase {
  private taps: { delay: DelayNode; lfo: Lfo; pan: StereoPannerNode }[] = [];
  private fb: GainNode; private fbSum: GainNode; private tone: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.fbSum = this.own(ctx.createGain());
    this.fb = this.own(ctx.createGain()); this.fb.gain.value = 0.5;
    this.tone = this.own(ctx.createBiquadFilter()); this.tone.type = 'lowpass'; this.tone.frequency.value = 6000;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    // input + feedback feed the tap cloud
    const cloudIn = this.own(ctx.createGain());
    this.input.connect(cloudIn);
    this.tone.connect(this.fb); this.fb.connect(cloudIn); // feedback path (tone-shaped)
    for (let i = 0; i < CLOUD_TAPS; i++) {
      const delay = this.own(ctx.createDelay(2));
      const base = 0.05 + i * 0.037;
      delay.delayTime.value = base;
      const lfo = new Lfo(ctx); lfo.depth.connect(delay.delayTime);
      const pan = this.own(ctx.createStereoPanner()); pan.pan.value = (i / (CLOUD_TAPS - 1)) * 2 - 1;
      cloudIn.connect(delay); delay.connect(pan); pan.connect(this.wet); delay.connect(this.fbSum);
      this.taps.push({ delay, lfo, pan });
    }
    this.fbSum.connect(this.tone); // sum of taps → tone → feedback gain
    this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const size = Math.max(0.02, Math.min(1.5, (p.size ?? 200) / 1000)); // grain window seconds
    const spray = Math.max(0, Math.min(1, p.spray ?? 0.3));
    const rate = Math.max(0.05, Math.min(4, p.rate ?? 0.4));
    const freeze = Math.max(0, Math.min(1, p.freeze ?? 0.5));
    this.taps.forEach((t, i) => {
      t.delay.delayTime.value = size * (0.5 + i / CLOUD_TAPS);
      t.lfo.set(rate * (0.7 + i * 0.15), spray * size * 0.4);
    });
    this.tone.frequency.value = clampHz(p.tone ?? 6000);
    this.fb.gain.value = 0.3 + freeze * 0.69; // up to ~0.99 = near-infinite hold
    const mix = Math.max(0, Math.min(1, (p.mix ?? 45) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { for (const t of this.taps) t.lfo.dispose(); super.dispose(); }
}

// DEVICE: Console EQ — a musical, fixed-band "colour" EQ (broad Pultec/console-style curves) with an
// always-on transformer saturation stage. Where the surgical EQ is precise, this one flatters: wide
// shelves, gentle bells, and even-harmonic warmth baked in. The classic trick — a low shelf that boosts
// and cuts at once for a scooped-yet-fat bottom — is why the low band has separate boost/cut.
class ConsoleEqDevice extends FxBase {
  private lowBoost: BiquadFilterNode; private lowCut: BiquadFilterNode;
  private lowMid: BiquadFilterNode; private highMid: BiquadFilterNode; private high: BiquadFilterNode;
  private color: WaveShaperNode; private makeup: GainNode;
  private lastDrive = -1;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const bq = (type: BiquadFilterType, f: number, q = 0.7) => { const b = this.own(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.lowBoost = bq('lowshelf', 90);
    this.lowCut = bq('peaking', 250, 1.2);
    this.lowMid = bq('peaking', 500, 0.8);
    this.highMid = bq('peaking', 3000, 0.7);
    this.high = bq('highshelf', 12000);
    this.color = this.own(ctx.createWaveShaper()); this.color.oversample = '2x'; this.color.curve = driveCurve(0.06, 0.08);
    this.makeup = this.own(ctx.createGain());
    this.input.connect(this.lowBoost); this.lowBoost.connect(this.lowCut); this.lowCut.connect(this.lowMid);
    this.lowMid.connect(this.highMid); this.highMid.connect(this.high); this.high.connect(this.color);
    this.color.connect(this.makeup); this.makeup.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const cl = (v: number) => Math.max(-15, Math.min(15, v));
    this.lowBoost.frequency.value = clampHz(p.lowFreq ?? 90);
    this.lowBoost.gain.value = cl(p.lowBoost ?? 0);
    this.lowCut.frequency.value = clampHz((p.lowFreq ?? 90) * 2.6);
    this.lowCut.gain.value = -Math.max(0, Math.min(15, p.lowCut ?? 0));
    this.lowMid.frequency.value = clampHz(p.lowMidFreq ?? 500); this.lowMid.gain.value = cl(p.lowMid ?? 0);
    this.highMid.frequency.value = clampHz(p.highMidFreq ?? 3000); this.highMid.gain.value = cl(p.highMid ?? 0);
    this.high.frequency.value = clampHz(p.highFreq ?? 12000); this.high.gain.value = cl(p.high ?? 0);
    const drive = Math.max(0, Math.min(1, p.drive ?? 0.2));
    if (drive !== this.lastDrive) { this.lastDrive = drive; this.color.curve = driveCurve(0.04 + drive * 0.4, 0.08); }
    this.makeup.gain.value = dbToGain(Math.max(-12, Math.min(12, p.output ?? 0)));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELAY WAVE — a Replika-class creative delay + a shimmer/cosmos delay-reverb.
// ═══════════════════════════════════════════════════════════════════════════

// DEVICE: Creative Delay — a multi-mode stereo delay (Modern / Tape / Analog / Diffuse) with a
// cross-feedback matrix (dial in ping-pong), a coloured feedback path (saturation + LP/HP tone +
// allpass diffusion), wow/flutter modulation, and input ducking. Every repeat runs through the colour
// chain, so Tape/Analog darken and smear progressively — real BBD/tape behaviour, not a static echo.
const ECHO_MODE = ['Modern', 'Tape', 'Analog', 'Diffuse'];
class CreativeDelayDevice extends FxBase {
  private dL: DelayNode; private dR: DelayNode;
  private fbL: GainNode; private fbR: GainNode;
  private strL: GainNode; private crL: GainNode; private strR: GainNode; private crR: GainNode;
  private lpL: BiquadFilterNode; private lpR: BiquadFilterNode; private hpL: BiquadFilterNode; private hpR: BiquadFilterNode;
  private satL: WaveShaperNode; private satR: WaveShaperNode;
  private apL: BiquadFilterNode[] = []; private apR: BiquadFilterNode[] = [];
  private wow: Lfo;
  private duckRect: WaveShaperNode; private duckLP: BiquadFilterNode; private duckScale: GainNode; private wetDuck: GainNode;
  private panL: StereoPannerNode; private panR: StereoPannerNode;
  private dry: GainNode; private wet: GainNode;
  private lastMode = -1;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const MAX = 4;
    this.dL = this.own(ctx.createDelay(MAX)); this.dR = this.own(ctx.createDelay(MAX));
    this.fbL = this.own(ctx.createGain()); this.fbR = this.own(ctx.createGain());
    this.strL = this.own(ctx.createGain()); this.crL = this.own(ctx.createGain());
    this.strR = this.own(ctx.createGain()); this.crR = this.own(ctx.createGain());
    this.lpL = this.own(ctx.createBiquadFilter()); this.lpL.type = 'lowpass';
    this.lpR = this.own(ctx.createBiquadFilter()); this.lpR.type = 'lowpass';
    this.hpL = this.own(ctx.createBiquadFilter()); this.hpL.type = 'highpass';
    this.hpR = this.own(ctx.createBiquadFilter()); this.hpR.type = 'highpass';
    this.satL = this.own(ctx.createWaveShaper()); this.satL.oversample = '2x';
    this.satR = this.own(ctx.createWaveShaper()); this.satR.oversample = '2x';
    for (let i = 0; i < 2; i++) {
      const a = this.own(ctx.createBiquadFilter()); a.type = 'allpass'; a.Q.value = 0.0001; this.apL.push(a);
      const b = this.own(ctx.createBiquadFilter()); b.type = 'allpass'; b.Q.value = 0.0001; this.apR.push(b);
    }
    this.wow = new Lfo(ctx);
    this.duckRect = this.own(ctx.createWaveShaper()); this.duckRect.curve = ABS_CURVE;
    this.duckLP = this.own(ctx.createBiquadFilter()); this.duckLP.type = 'lowpass'; this.duckLP.frequency.value = 12;
    this.duckScale = this.own(ctx.createGain()); this.duckScale.gain.value = 0;
    this.wetDuck = this.own(ctx.createGain()); this.wetDuck.gain.value = 1;
    this.panL = this.own(ctx.createStereoPanner()); this.panR = this.own(ctx.createStereoPanner());
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());

    this.input.connect(this.dry); this.dry.connect(this.output);
    // inject input into both delay lines
    this.input.connect(this.dL); this.input.connect(this.dR);
    // colour chain per side: delay → allpass ×2 → LP → HP → saturation
    const chain = (d: DelayNode, ap: BiquadFilterNode[], lp: BiquadFilterNode, hp: BiquadFilterNode, sat: WaveShaperNode) => {
      d.connect(ap[0]); ap[0].connect(ap[1]); ap[1].connect(lp); lp.connect(hp); hp.connect(sat);
    };
    chain(this.dL, this.apL, this.lpL, this.hpL, this.satL);
    chain(this.dR, this.apR, this.lpR, this.hpR, this.satR);
    // wet taps (post-colour) → pan → duck → wet
    this.satL.connect(this.panL); this.panL.connect(this.wetDuck);
    this.satR.connect(this.panR); this.panR.connect(this.wetDuck);
    this.wetDuck.connect(this.wet); this.wet.connect(this.output);
    // cross-feedback matrix: each side's coloured tail feeds both delays (straight + cross = ping-pong)
    this.satL.connect(this.fbL); this.fbL.connect(this.strL); this.fbL.connect(this.crL);
    this.satR.connect(this.fbR); this.fbR.connect(this.strR); this.fbR.connect(this.crR);
    this.strL.connect(this.dL); this.crL.connect(this.dR);
    this.strR.connect(this.dR); this.crR.connect(this.dL);
    // wow/flutter on both delay lines
    this.wow.depth.connect(this.dL.delayTime); this.wow.depth.connect(this.dR.delayTime);
    // duck: input envelope pulls the wet bus down
    this.input.connect(this.duckRect); this.duckRect.connect(this.duckLP); this.duckLP.connect(this.duckScale); this.duckScale.connect(this.wetDuck.gain);
  }
  setParams(p: Record<string, number>): void {
    const time = Math.max(0.005, Math.min(3.5, (p.time ?? 350) / 1000));
    const spread = Math.max(0, Math.min(0.5, (p.spread ?? 15) / 100));
    this.dL.delayTime.value = time; this.dR.delayTime.value = Math.min(3.9, time * (1 + spread));
    const fb = Math.max(0, Math.min(0.98, (p.feedback ?? 40) / 100));
    const pp = Math.max(0, Math.min(1, (p.pingpong ?? 0) / 100));
    // straight/cross split preserves total feedback energy at any ping-pong amount
    this.strL.gain.value = this.strR.gain.value = fb * (1 - pp);
    this.crL.gain.value = this.crR.gain.value = fb * pp;
    const mode = Math.round(p.mode ?? 0);
    if (mode !== this.lastMode) {
      this.lastMode = mode;
      this.satL.curve = this.satR.curve = mode === 1 ? driveCurve(0.14, 0.1) : mode === 2 ? driveCurve(0.22, 0) : IDENTITY_CURVE;
    }
    const diffuse = mode === 3 ? 0.7 : 0; // allpass smear for the Diffuse mode
    for (const a of [...this.apL, ...this.apR]) a.Q.value = diffuse > 0 ? 4 : 0.0001;
    this.apL[0].frequency.value = this.apR[0].frequency.value = 900;
    this.apL[1].frequency.value = this.apR[1].frequency.value = 2600;
    // tape/analog darken with each repeat; modern stays open
    const toneBase = clampHz(p.tone ?? 5200);
    const modeTone = mode === 1 ? toneBase * 0.8 : mode === 2 ? toneBase * 0.6 : toneBase;
    this.lpL.frequency.value = modeTone; this.lpR.frequency.value = modeTone * 0.92;
    const lowcut = clampHz(p.lowcut ?? 120);
    this.hpL.frequency.value = lowcut; this.hpR.frequency.value = lowcut;
    // wow/flutter: modern = clean; tape/analog add movement
    const wowAmt = Math.max(0, Math.min(1, p.wow ?? (mode >= 1 ? 0.3 : 0)));
    this.wow.set(mode === 1 ? 0.7 : 5.5, wowAmt * time * 0.02);
    this.panL.pan.value = -Math.max(0, Math.min(1, (p.width ?? 100) / 100));
    this.panR.pan.value = Math.max(0, Math.min(1, (p.width ?? 100) / 100));
    this.duckScale.gain.value = -Math.max(0, Math.min(1, (p.duck ?? 0) / 100)) * 3;
    const mix = Math.max(0, Math.min(1, (p.mix ?? 30) / 100));
    equalPowerMix(this.dry, this.wet, mix, dbToGain(p.wetGain ?? 0));
  }
  dispose(): void { this.wow.dispose(); super.dispose(); }
}

// DEVICE: Cosmos — the "off the walls" delay-reverb. A pre-delay feeds an allpass diffusion cloud into a
// big modelled reverb IR, then the tail feeds back — and inside that loop a full-wave rectifier on a
// filtered band adds an octave-up ghost on every pass, so notes bloom into an ENDLESS ASCENDING SHIMMER.
// Reverse mode flips the IR for a sucking, backwards swell. Reuses the Spaces IR engine.
class CosmosDevice extends FxBase {
  private preDelay: DelayNode; private conv: ConvolverNode;
  private diff: BiquadFilterNode[] = [];
  private fbDelay: DelayNode; private fb: GainNode; private fbIn: GainNode;
  private shBP: BiquadFilterNode; private shRect: WaveShaperNode; private shGain: GainNode;
  private tone: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  private lastKey = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.preDelay = this.own(ctx.createDelay(0.5));
    this.conv = this.own(ctx.createConvolver());
    for (let i = 0; i < 3; i++) { const a = this.own(ctx.createBiquadFilter()); a.type = 'allpass'; a.Q.value = 3.5; a.frequency.value = 400 + i * 900; this.diff.push(a); }
    this.fbDelay = this.own(ctx.createDelay(1)); this.fbDelay.delayTime.value = 0.12;
    this.fb = this.own(ctx.createGain()); this.fb.gain.value = 0;
    this.fbIn = this.own(ctx.createGain());
    this.shBP = this.own(ctx.createBiquadFilter()); this.shBP.type = 'bandpass'; this.shBP.frequency.value = 1200; this.shBP.Q.value = 1.2;
    this.shRect = this.own(ctx.createWaveShaper()); this.shRect.curve = ABS_CURVE; this.shRect.oversample = '2x';
    this.shGain = this.own(ctx.createGain()); this.shGain.gain.value = 0;
    this.tone = this.own(ctx.createBiquadFilter()); this.tone.type = 'lowpass'; this.tone.frequency.value = 7000;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());

    this.input.connect(this.dry); this.dry.connect(this.output);
    // wet: input (+ feedback) → preDelay → diffusion → conv → tone → wet
    this.input.connect(this.fbIn);
    this.fbIn.connect(this.preDelay);
    this.preDelay.connect(this.diff[0]); this.diff[0].connect(this.diff[1]); this.diff[1].connect(this.diff[2]);
    this.diff[2].connect(this.conv); this.conv.connect(this.tone); this.tone.connect(this.wet); this.wet.connect(this.output);
    // feedback loop with the octave-up shimmer branch
    this.tone.connect(this.fbDelay); this.fbDelay.connect(this.fb); this.fb.connect(this.fbIn);
    this.fbDelay.connect(this.shBP); this.shBP.connect(this.shRect); this.shRect.connect(this.shGain); this.shGain.connect(this.fbIn);
  }
  setParams(p: Record<string, number>): void {
    const size = Math.max(0.5, Math.min(2, p.size ?? 1.4));
    const reverse = (p.reverse ?? 0) > 0.5;
    if ((p.irMode ?? 0) > 0.5) {
      const def = irByIndex(p.irIndex ?? 0);
      const key = `ir:${def?.id ?? '?'}:${reverse}`;
      if (def && key !== this.lastKey) {
        this.lastKey = key;
        const apply = (buf: AudioBuffer | null) => { if (buf && this.lastKey === key) this.conv.buffer = reverse ? reversedCopy(this.ctx, buf) : buf; };
        const cached = getCachedIr(def.id, this.ctx.sampleRate);
        if (cached) apply(cached);
        else { this.conv.buffer = makeSpaceIR(this.ctx, REVERB_SPACES[0], 1, 0.3, 1); void loadIr(this.ctx, def.id).then(apply); }
      }
    } else {
      const spaceIdx = Math.max(0, Math.min(REVERB_SPACES.length - 1, Math.round(p.space ?? 6)));
      const key = `mdl:${spaceIdx}:${size.toFixed(2)}:${reverse}`;
      if (key !== this.lastKey) {
        this.lastKey = key;
        const ir = makeSpaceIR(this.ctx, REVERB_SPACES[spaceIdx], size, 0.2, 1);
        if (reverse) for (let ch = 0; ch < ir.numberOfChannels; ch++) ir.getChannelData(ch).reverse();
        this.conv.buffer = ir;
      }
    }
    this.preDelay.delayTime.value = Math.max(0, Math.min(0.4, (p.preDelay ?? 40) / 1000));
    this.fbDelay.delayTime.value = Math.max(0.02, Math.min(0.9, (p.time ?? 120) / 1000));
    this.fb.gain.value = Math.max(0, Math.min(0.92, (p.feedback ?? 55) / 100));
    this.shGain.gain.value = Math.max(0, Math.min(0.9, (p.shimmer ?? 40) / 100));
    this.shBP.frequency.value = clampHz(p.shimmerFreq ?? 1200);
    this.tone.frequency.value = clampHz(p.tone ?? 7000);
    for (const a of this.diff) a.Q.value = 1 + Math.max(0, Math.min(1, (p.diffusion ?? 60) / 100)) * 6;
    const mix = Math.max(0, Math.min(1, (p.mix ?? 45) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 4 — analog character: Tape and Exciter. Plus an Ensemble chorus.
// ═══════════════════════════════════════════════════════════════════════════

// DEVICE: Tape — a tape-machine channel. Head-bump low shelf → wow/flutter (two LFOs on a short delay,
// slow wow + fast flutter) → tape saturation (soft, slightly asymmetric) → HF head rolloff → a whisper
// of hiss. The whole flavour of tape: fatter lows, a hair of pitch drift, gentle compression-by-clipping,
// rolled-off top.
class TapeDevice extends FxBase {
  private bump: BiquadFilterNode; private wowDelay: DelayNode; private wow: Lfo; private flutter: Lfo;
  private sat: WaveShaperNode; private roll: BiquadFilterNode;
  private hiss: AudioBufferSourceNode; private hissLP: BiquadFilterNode; private hissGain: GainNode;
  private dry: GainNode; private wet: GainNode; private makeup: GainNode;
  private lastCurve = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.bump = this.own(ctx.createBiquadFilter()); this.bump.type = 'lowshelf'; this.bump.frequency.value = 90;
    this.wowDelay = this.own(ctx.createDelay(0.05)); this.wowDelay.delayTime.value = 0.004;
    this.wow = new Lfo(ctx); this.flutter = new Lfo(ctx, 'triangle');
    this.wow.depth.connect(this.wowDelay.delayTime); this.flutter.depth.connect(this.wowDelay.delayTime);
    this.sat = this.own(ctx.createWaveShaper()); this.sat.oversample = '4x';
    this.roll = this.own(ctx.createBiquadFilter()); this.roll.type = 'lowpass'; this.roll.frequency.value = 12000;
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.hiss = ctx.createBufferSource(); this.hiss.buffer = nb; this.hiss.loop = true;
    this.hissLP = this.own(ctx.createBiquadFilter()); this.hissLP.type = 'lowpass'; this.hissLP.frequency.value = 13000;
    this.hissGain = this.own(ctx.createGain()); this.hissGain.gain.value = 0;
    this.hiss.connect(this.hissLP); this.hissLP.connect(this.hissGain); this.hissGain.connect(this.output);
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain()); this.makeup = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.bump); this.bump.connect(this.wowDelay); this.wowDelay.connect(this.sat);
    this.sat.connect(this.roll); this.roll.connect(this.makeup); this.makeup.connect(this.wet); this.wet.connect(this.output);
    this.hiss.start();
  }
  setParams(p: Record<string, number>): void {
    const drive = Math.max(0, Math.min(1, p.drive ?? 0.3));
    const bias = Math.max(0, Math.min(1, p.bias ?? 0.1));
    const key = `${drive.toFixed(3)}:${bias.toFixed(3)}`;
    if (key !== this.lastCurve) { this.lastCurve = key; this.sat.curve = driveCurve(0.08 + drive * 0.6, bias * 0.3); }
    this.bump.frequency.value = clampHz(p.bumpFreq ?? 90);
    this.bump.gain.value = Math.max(0, Math.min(9, p.bump ?? 3));
    this.wow.set(0.7, Math.max(0, Math.min(1, p.wow ?? 0.3)) * 0.0016);
    this.flutter.set(8.5, Math.max(0, Math.min(1, p.flutter ?? 0.2)) * 0.0004);
    this.roll.frequency.value = clampHz(p.tone ?? 12000);
    this.hissGain.gain.value = Math.max(0, Math.min(1, p.hiss ?? 0)) * 0.02;
    this.makeup.gain.value = dbToGain(Math.max(-6, Math.min(12, p.output ?? 0)));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 100) / 100));
    equalPowerMix(this.dry, this.wet, mix);
  }
  dispose(): void { this.wow.dispose(); this.flutter.dispose(); try { this.hiss.stop(); this.hiss.disconnect(); } catch { /* */ } super.dispose(); }
}

// DEVICE: Exciter — an Aphex-style aural exciter. Highpass a copy of the signal, generate harmonics with
// an asymmetric shaper (even-harmonic "sweetness"), keep only the highs, and add them back on top of the
// full dry signal. Result: air and presence that a plain EQ boost can't fake, because it synthesises
// content that wasn't there.
class ExciterDevice extends FxBase {
  private hp: BiquadFilterNode; private shaper: WaveShaperNode; private hp2: BiquadFilterNode; private tone: BiquadFilterNode; private blend: GainNode;
  private lastAmt = -1;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.input.connect(this.output); // full dry
    this.hp = this.own(ctx.createBiquadFilter()); this.hp.type = 'highpass'; this.hp.frequency.value = 3500; this.hp.Q.value = 0.7;
    this.shaper = this.own(ctx.createWaveShaper()); this.shaper.oversample = '4x';
    this.hp2 = this.own(ctx.createBiquadFilter()); this.hp2.type = 'highpass'; this.hp2.frequency.value = 3500; this.hp2.Q.value = 0.7;
    this.tone = this.own(ctx.createBiquadFilter()); this.tone.type = 'highshelf'; this.tone.frequency.value = 8000;
    this.blend = this.own(ctx.createGain()); this.blend.gain.value = 0;
    this.input.connect(this.hp); this.hp.connect(this.shaper); this.shaper.connect(this.hp2); this.hp2.connect(this.tone); this.tone.connect(this.blend); this.blend.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const freq = clampHz(p.freq ?? 3500);
    this.hp.frequency.value = freq; this.hp2.frequency.value = freq;
    const amount = Math.max(0, Math.min(1, p.amount ?? 0.4));
    if (amount !== this.lastAmt) { this.lastAmt = amount; this.shaper.curve = amount < 0.01 ? IDENTITY_CURVE : driveCurve(0.2 + amount * 0.9, 0.45); }
    this.tone.frequency.value = clampHz(p.tone ?? 8000);
    this.tone.gain.value = Math.max(-6, Math.min(9, p.character ?? 0));
    this.blend.gain.value = Math.max(0, Math.min(1, p.blend ?? 0.3)) * 2.2;
  }
}

// DEVICE: Ensemble — a lush multi-voice chorus (the Juno / Dimension flavour). Four detuned delay voices
// spread hard across the stereo field, driven by two out-of-phase LFOs (with per-voice inversion) so the
// voices decorrelate into a wide, shimmering thickening — far richer than the two-voice Chorus.
class EnsembleDevice extends FxBase {
  private voices: { d: DelayNode; pan: StereoPannerNode }[] = [];
  private lfoA: Lfo; private lfoB: Lfo; private invA: GainNode; private invB: GainNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.lfoA = new Lfo(ctx); this.lfoB = new Lfo(ctx, 'triangle');
    this.invA = this.own(ctx.createGain()); this.invA.gain.value = -1; this.lfoA.depth.connect(this.invA);
    this.invB = this.own(ctx.createGain()); this.invB.gain.value = -1; this.lfoB.depth.connect(this.invB);
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    const NV = 4;
    for (let i = 0; i < NV; i++) {
      const d = this.own(ctx.createDelay(0.06)); d.delayTime.value = 0.012 + i * 0.004;
      const pan = this.own(ctx.createStereoPanner()); pan.pan.value = (i / (NV - 1)) * 2 - 1;
      // voices 0/1 ride LFO A (0 direct, 1 inverted); 2/3 ride LFO B — four decorrelated modulators
      const mod = i === 0 ? this.lfoA.depth : i === 1 ? this.invA : i === 2 ? this.lfoB.depth : this.invB;
      mod.connect(d.delayTime);
      this.input.connect(d); d.connect(pan); pan.connect(this.wet);
      this.voices.push({ d, pan });
    }
    this.wet.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    const rate = Math.max(0.05, Math.min(8, p.rate ?? 0.5));
    const depth = Math.max(0, Math.min(1, p.depth ?? 0.5)) * 0.004;
    this.lfoA.set(rate, depth); this.lfoB.set(rate * 1.31, depth * 0.8); // slightly different rate = extra motion
    const spread = Math.max(0, Math.min(1, (p.width ?? 100) / 100));
    this.voices.forEach((v, i) => { v.pan.pan.value = ((i / (this.voices.length - 1)) * 2 - 1) * spread; });
    const mix = Math.max(0, Math.min(1, (p.mix ?? 55) / 100));
    equalPowerMix(this.dry, this.wet, mix, 0.5); // four wet voices sum
  }
  dispose(): void { this.lfoA.dispose(); this.lfoB.dispose(); super.dispose(); }
}

// ── the registry ─────────────────────────────────────────────────────────────
const C = { eq: '#00DAF3', dynamics: '#FF8C00', saturation: '#D40055', stereo: '#D0BCFF', space: '#06D6A0', mod: '#B84DFF', dj: '#FF4B1C', repair: '#F59E0B', utility: '#8899aa', amp: '#E8A33D' };

export const DEVICES: FxDescriptor[] = [
  {
    type: 'eq', label: 'Equalizer', category: 'eq', color: C.eq,
    blurb: 'HP/LP + four bands of surgical or musical EQ',
    params: [
      { key: 'hp', label: 'HP', min: 16, max: 500, default: 20, unit: 'Hz', curve: 'log' },
      { key: 'f1', label: 'Low', min: 30, max: 400, default: 120, unit: 'Hz', curve: 'log' },
      { key: 'g1', label: 'Low dB', min: -24, max: 24, default: 0, unit: 'dB' },
      { key: 'f2', label: 'Lo-Mid', min: 100, max: 2000, default: 500, unit: 'Hz', curve: 'log' },
      { key: 'g2', label: 'Lo-Mid dB', min: -24, max: 24, default: 0, unit: 'dB' },
      { key: 'q2', label: 'Lo-Mid Q', min: 0.2, max: 8, default: 1 },
      { key: 'f3', label: 'Hi-Mid', min: 800, max: 8000, default: 3000, unit: 'Hz', curve: 'log' },
      { key: 'g3', label: 'Hi-Mid dB', min: -24, max: 24, default: 0, unit: 'dB' },
      { key: 'q3', label: 'Hi-Mid Q', min: 0.2, max: 8, default: 1 },
      { key: 'f4', label: 'Air', min: 4000, max: 20000, default: 12000, unit: 'Hz', curve: 'log' },
      { key: 'g4', label: 'Air dB', min: -24, max: 24, default: 0, unit: 'dB' },
      { key: 'lp', label: 'LP', min: 2000, max: 22000, default: 20000, unit: 'Hz', curve: 'log' },
    ],
    create: (ctx) => new EqDevice(ctx),
  },
  {
    type: 'consoleeq', label: 'Console EQ', category: 'eq', color: C.eq,
    blurb: 'Musical colour EQ — wide console curves + transformer warmth',
    params: [
      { key: 'lowFreq', label: 'Low Hz', min: 30, max: 200, default: 90, unit: 'Hz', curve: 'log' },
      { key: 'lowBoost', label: 'Low Boost', min: 0, max: 15, default: 0, unit: 'dB' },
      { key: 'lowCut', label: 'Low Cut', min: 0, max: 15, default: 0, unit: 'dB' },
      { key: 'lowMidFreq', label: 'Lo-Mid', min: 200, max: 2000, default: 500, unit: 'Hz', curve: 'log' },
      { key: 'lowMid', label: 'Lo-Mid dB', min: -15, max: 15, default: 0, unit: 'dB' },
      { key: 'highMidFreq', label: 'Hi-Mid', min: 1500, max: 8000, default: 3000, unit: 'Hz', curve: 'log' },
      { key: 'highMid', label: 'Hi-Mid dB', min: -15, max: 15, default: 0, unit: 'dB' },
      { key: 'highFreq', label: 'Air', min: 6000, max: 18000, default: 12000, unit: 'Hz', curve: 'log' },
      { key: 'high', label: 'Air dB', min: -15, max: 15, default: 0, unit: 'dB' },
      { key: 'drive', label: 'Drive', min: 0, max: 1, default: 0.2, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'output', label: 'Output', min: -12, max: 12, default: 0, unit: 'dB' },
    ],
    create: (ctx) => new ConsoleEqDevice(ctx),
  },
  {
    type: 'comp', label: 'Dynamics', category: 'dynamics', color: C.dynamics,
    blurb: 'Compressor with makeup — glue and control',
    params: [
      { key: 'threshold', label: 'Thresh', min: -60, max: 0, default: -18, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', min: 1, max: 20, default: 2, format: (v) => `${v.toFixed(1)}:1` },
      { key: 'attack', label: 'Attack', min: 0, max: 200, default: 10, unit: 'ms' },
      { key: 'release', label: 'Release', min: 10, max: 1000, default: 180, unit: 'ms' },
      { key: 'knee', label: 'Knee', min: 0, max: 40, default: 12, unit: 'dB' },
      { key: 'makeup', label: 'Makeup', min: 0, max: 24, default: 0, unit: 'dB' },
      { key: 'character', label: 'Voicing', min: 0, max: 2, default: 0, step: 1, format: (v) => ['Clean', 'FET', 'Opto'][Math.round(v)] ?? 'Clean' },
    ],
    create: (ctx) => new CompDevice(ctx),
  },
  {
    type: 'gate', label: 'Gate', category: 'dynamics', color: C.dynamics,
    blurb: 'Downward expansion — clean up the noise floor',
    params: [
      { key: 'threshold', label: 'Thresh', min: -80, max: 0, default: -50, unit: 'dB' },
      { key: 'range', label: 'Range', min: 0, max: 60, default: 40, unit: 'dB' },
      { key: 'attack', label: 'Attack', min: 0, max: 50, default: 1, unit: 'ms' },
      { key: 'release', label: 'Release', min: 10, max: 500, default: 120, unit: 'ms' },
    ],
    create: (ctx) => new GateDevice(ctx),
  },
  {
    type: 'gluecomp', label: 'Glue Comp', category: 'dynamics', color: C.dynamics,
    blurb: 'SSL-style bus glue — program-dependent, parallel-mixable',
    params: [
      { key: 'threshold', label: 'Thresh', min: -60, max: 0, default: -20, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', min: 1.5, max: 10, default: 4, format: (v) => `${v.toFixed(1)}:1` },
      { key: 'attack', label: 'Attack', min: 0.1, max: 30, default: 10, unit: 'ms', curve: 'log' },
      { key: 'release', label: 'Release', min: 50, max: 1200, default: 300, unit: 'ms' },
      { key: 'makeup', label: 'Makeup', min: 0, max: 24, default: 0, unit: 'dB' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new GlueCompDevice(ctx),
  },
  {
    type: 'multiband', label: 'Multiband', category: 'dynamics', color: C.dynamics,
    blurb: '3-band compressor — LR4 crossovers, per-band threshold',
    params: [
      { key: 'crossLow', label: 'Low×', min: 40, max: 1000, default: 200, unit: 'Hz', curve: 'log' },
      { key: 'crossHigh', label: 'High×', min: 1000, max: 14000, default: 2500, unit: 'Hz', curve: 'log' },
      { key: 'loThresh', label: 'Low Thr', min: -60, max: 0, default: -24, unit: 'dB' },
      { key: 'midThresh', label: 'Mid Thr', min: -60, max: 0, default: -22, unit: 'dB' },
      { key: 'hiThresh', label: 'High Thr', min: -60, max: 0, default: -20, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', min: 1, max: 12, default: 3, format: (v) => `${v.toFixed(1)}:1` },
      { key: 'attack', label: 'Attack', min: 0.5, max: 100, default: 15, unit: 'ms', curve: 'log' },
      { key: 'release', label: 'Release', min: 20, max: 800, default: 200, unit: 'ms' },
    ],
    create: (ctx) => new MultibandDevice(ctx),
  },
  {
    type: 'upexp', label: 'Upward Exp', category: 'dynamics', color: C.dynamics,
    blurb: 'Lift the quiet parts — depth and life, the inverse of a gate',
    params: [
      { key: 'threshold', label: 'Thresh', min: -70, max: 0, default: -40, unit: 'dB' },
      { key: 'amount', label: 'Amount', min: 0, max: 18, default: 6, unit: 'dB' },
      { key: 'attack', label: 'Attack', min: 1, max: 100, default: 10, unit: 'ms' },
      { key: 'release', label: 'Release', min: 20, max: 500, default: 150, unit: 'ms' },
    ],
    create: (ctx) => new UpwardExpanderDevice(ctx),
  },
  {
    type: 'saturator', label: 'Saturator', category: 'saturation', color: C.saturation,
    blurb: 'Tube/tape harmonics — warmth and presence',
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 1, default: 0.3, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'warmth', label: 'Warmth', min: 0, max: 0.4, default: 0.15, format: (v) => `${Math.round(v * 250)}%` },
      { key: 'mix', label: 'Mix', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'output', label: 'Output', min: -12, max: 12, default: 0, unit: 'dB' },
    ],
    create: (ctx) => new SaturatorDevice(ctx),
  },
  {
    type: 'tape', label: 'Tape', category: 'saturation', color: C.saturation,
    blurb: 'Tape machine — head bump, wow & flutter, saturation, HF rolloff, hiss',
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 1, default: 0.3, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'bias', label: 'Bias', min: 0, max: 1, default: 0.1, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'bump', label: 'Head Bump', min: 0, max: 9, default: 3, unit: 'dB' },
      { key: 'bumpFreq', label: 'Bump Hz', min: 40, max: 180, default: 90, unit: 'Hz', curve: 'log' },
      { key: 'wow', label: 'Wow', min: 0, max: 1, default: 0.3, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'flutter', label: 'Flutter', min: 0, max: 1, default: 0.2, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'tone', label: 'HF Roll', min: 3000, max: 20000, default: 12000, unit: 'Hz', curve: 'log' },
      { key: 'hiss', label: 'Hiss', min: 0, max: 1, default: 0, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'output', label: 'Output', min: -6, max: 12, default: 0, unit: 'dB' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new TapeDevice(ctx),
  },
  {
    type: 'exciter', label: 'Exciter', category: 'saturation', color: C.saturation,
    blurb: 'Aural exciter — synthesises high harmonics for air a plain EQ boost can’t fake',
    params: [
      { key: 'freq', label: 'Freq', min: 1000, max: 12000, default: 3500, unit: 'Hz', curve: 'log' },
      { key: 'amount', label: 'Harmonics', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'blend', label: 'Blend', min: 0, max: 1, default: 0.3, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'tone', label: 'Tone', min: 4000, max: 16000, default: 8000, unit: 'Hz', curve: 'log' },
      { key: 'character', label: 'Character', min: -6, max: 9, default: 0, unit: 'dB' },
    ],
    create: (ctx) => new ExciterDevice(ctx),
  },
  {
    type: 'imager', label: 'Imager', category: 'stereo', color: C.stereo,
    blurb: 'Stereo width with a bass mono-maker',
    params: [
      { key: 'width', label: 'Width', min: 0, max: 200, default: 100, unit: '%' },
      { key: 'monoBelow', label: 'Mono <', min: 0, max: 400, default: 0, unit: 'Hz', curve: 'log', format: (v) => (v < 20 ? 'off' : `${Math.round(v)}Hz`) },
    ],
    create: (ctx) => new ImagerDevice(ctx),
  },
  {
    type: 'dehum', label: 'De-hum', category: 'repair', color: C.repair,
    blurb: 'Tracking comb of notches — kills mains hum + harmonics',
    params: [
      { key: 'fundamental', label: 'Freq', min: 40, max: 120, default: 60, unit: 'Hz' },
      { key: 'harmonics', label: 'Harmonics', min: 1, max: 8, default: 6, step: 1 },
      { key: 'q', label: 'Q', min: 5, max: 80, default: 30 },
    ],
    create: (ctx) => new DehumDevice(ctx),
  },
  {
    type: 'deess', label: 'De-ess', category: 'repair', color: C.repair,
    blurb: 'Tames sibilance in the high band',
    params: [
      { key: 'frequency', label: 'Freq', min: 3000, max: 12000, default: 6000, unit: 'Hz', curve: 'log' },
      { key: 'threshold', label: 'Thresh', min: -50, max: 0, default: -28, unit: 'dB' },
      { key: 'amount', label: 'Amount', min: 1, max: 10, default: 5, format: (v) => `${v.toFixed(1)}:1` },
    ],
    create: (ctx) => new DeessDevice(ctx),
  },
  {
    type: 'reverb', label: 'Reverb', category: 'space', color: C.space,
    blurb: 'Convolution space — plate to hall',
    params: [
      { key: 'size', label: 'Size', min: 0.1, max: 6, default: 1.8, unit: 's' },
      { key: 'decay', label: 'Decay', min: 0.5, max: 8, default: 3 },
      { key: 'preDelay', label: 'Pre', min: 0, max: 200, default: 20, unit: 'ms' },
      { key: 'damping', label: 'Damping', min: 1000, max: 20000, default: 9000, unit: 'Hz', curve: 'log' },
      { key: 'lowCut', label: 'Low Cut', min: 20, max: 1000, default: 90, unit: 'Hz', curve: 'log' },
      { key: 'wetGain', label: 'Wet Trim', min: -12, max: 12, default: 3, unit: 'dB' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 25, unit: '%' },
    ],
    create: (ctx) => new ReverbDevice(ctx),
  },
  {
    type: 'delay', label: 'Delay', category: 'space', color: C.space,
    blurb: 'Feedback delay with tone in the loop',
    params: [
      { key: 'time', label: 'Time', min: 1, max: 2000, default: 350, unit: 'ms' },
      { key: 'feedback', label: 'Feedback', min: 0, max: 95, default: 35, unit: '%' },
      { key: 'tone', label: 'Tone', min: 500, max: 12000, default: 4000, unit: 'Hz', curve: 'log' },
      { key: 'spread', label: 'Stereo', min: 0, max: 50, default: 12, unit: '%' },
      { key: 'wetGain', label: 'Wet Trim', min: -12, max: 12, default: 0, unit: 'dB' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 25, unit: '%' },
    ],
    create: (ctx) => new DelayDevice(ctx),
  },
  {
    type: 'spaces', label: 'Spaces', category: 'space', color: C.space,
    blurb: 'Convolution reverb — modeled spaces, or real recorded IRs (springs, rooms, cabs)',
    params: [
      { key: 'irMode', label: 'Source', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'Library IR' : 'Modelled') },
      { key: 'irIndex', label: 'IR', min: 0, max: IR_LIBRARY.length - 1, default: 0, step: 1, format: (v) => irByIndex(v)?.name ?? '—' },
      { key: 'space', label: 'Space', min: 0, max: REVERB_SPACES.length - 1, default: 6, step: 1, format: (v) => REVERB_SPACES[Math.max(0, Math.min(REVERB_SPACES.length - 1, Math.round(v)))].label },
      { key: 'size', label: 'Size', min: 0.25, max: 2, default: 1, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'damp', label: 'Damp', min: 0, max: 1, default: 0.2, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'preDelay', label: 'Pre', min: 0, max: 250, default: 15, unit: 'ms' },
      { key: 'width', label: 'Width', min: 0, max: 100, default: 100, unit: '%' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
    ],
    create: (ctx) => new SpacesDevice(ctx),
  },
  {
    type: 'echo', label: 'Creative Delay', category: 'space', color: C.space,
    blurb: 'Multi-mode delay — Modern / Tape / Analog / Diffuse, ping-pong, ducking, wow & flutter',
    params: [
      { key: 'time', label: 'Time', min: 5, max: 3500, default: 350, unit: 'ms', curve: 'log' },
      { key: 'feedback', label: 'Feedback', min: 0, max: 98, default: 40, unit: '%' },
      { key: 'mode', label: 'Mode', min: 0, max: 3, default: 0, step: 1, format: (v) => ECHO_MODE[Math.max(0, Math.min(3, Math.round(v)))] },
      { key: 'pingpong', label: 'Ping-Pong', min: 0, max: 100, default: 0, unit: '%' },
      { key: 'spread', label: 'Spread', min: 0, max: 50, default: 15, unit: '%' },
      { key: 'tone', label: 'Tone', min: 500, max: 18000, default: 5200, unit: 'Hz', curve: 'log' },
      { key: 'lowcut', label: 'Low Cut', min: 16, max: 1000, default: 120, unit: 'Hz', curve: 'log' },
      { key: 'wow', label: 'Wow', min: 0, max: 1, default: 0, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'duck', label: 'Duck', min: 0, max: 100, default: 0, unit: '%' },
      { key: 'width', label: 'Width', min: 0, max: 100, default: 100, unit: '%' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 30, unit: '%' },
    ],
    create: (ctx) => new CreativeDelayDevice(ctx),
  },
  {
    type: 'cosmos', label: 'Cosmos', category: 'space', color: C.space,
    blurb: 'Shimmer delay-reverb — octave-up feedback blooms into an endless ascending cloud (+ reverse)',
    params: [
      { key: 'irMode', label: 'Source', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'Library IR' : 'Modelled') },
      { key: 'irIndex', label: 'IR', min: 0, max: IR_LIBRARY.length - 1, default: 0, step: 1, format: (v) => irByIndex(v)?.name ?? '—' },
      { key: 'space', label: 'Space', min: 0, max: REVERB_SPACES.length - 1, default: 6, step: 1, format: (v) => REVERB_SPACES[Math.max(0, Math.min(REVERB_SPACES.length - 1, Math.round(v)))].label },
      { key: 'size', label: 'Size', min: 0.5, max: 2, default: 1.4, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'time', label: 'Delay', min: 20, max: 900, default: 120, unit: 'ms', curve: 'log' },
      { key: 'feedback', label: 'Feedback', min: 0, max: 92, default: 55, unit: '%' },
      { key: 'shimmer', label: 'Shimmer', min: 0, max: 90, default: 40, unit: '%' },
      { key: 'shimmerFreq', label: 'Shim Freq', min: 300, max: 6000, default: 1200, unit: 'Hz', curve: 'log' },
      { key: 'diffusion', label: 'Diffuse', min: 0, max: 100, default: 60, unit: '%' },
      { key: 'tone', label: 'Tone', min: 1000, max: 16000, default: 7000, unit: 'Hz', curve: 'log' },
      { key: 'preDelay', label: 'Pre', min: 0, max: 400, default: 40, unit: 'ms' },
      { key: 'reverse', label: 'Reverse', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'On' : 'Off') },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 45, unit: '%' },
    ],
    create: (ctx) => new CosmosDevice(ctx),
  },
  {
    type: 'chorus', label: 'Chorus', category: 'mod', color: C.mod,
    blurb: 'Two detuned voices, spread wide',
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 8, default: 0.8, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'delay', label: 'Delay', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(12 + v * 20)}ms` },
      { key: 'spread', label: 'Spread', min: 0, max: 1, default: 0.7, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
    ],
    create: (ctx) => new ChorusDevice(ctx),
  },
  {
    type: 'ensemble', label: 'Ensemble', category: 'mod', color: C.mod,
    blurb: 'Four-voice chorus ensemble — lush, wide Juno/Dimension thickening',
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 8, default: 0.5, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'width', label: 'Width', min: 0, max: 100, default: 100, unit: '%' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 55, unit: '%' },
    ],
    create: (ctx) => new EnsembleDevice(ctx),
  },
  {
    type: 'flanger', label: 'Flanger', category: 'mod', color: C.mod,
    blurb: 'Swept comb with feedback — tape-flange to jet',
    params: [
      { key: 'rate', label: 'Rate', min: 0.02, max: 5, default: 0.25, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.6, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'center', label: 'Center', min: 0, max: 1, default: 0.35, format: (v) => `${(1.5 + v * 8).toFixed(1)}ms` },
      { key: 'feedback', label: 'Feedback', min: -92, max: 92, default: 55, unit: '%' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
    ],
    create: (ctx) => new FlangerDevice(ctx),
  },
  {
    type: 'phaser', label: 'Phaser', category: 'mod', color: C.mod,
    blurb: 'Up to twelve swept all-pass stages with feedback',
    params: [
      { key: 'rate', label: 'Rate', min: 0.02, max: 8, default: 0.4, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.6, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'center', label: 'Center', min: 100, max: 4000, default: 900, unit: 'Hz', curve: 'log' },
      { key: 'stages', label: 'Stages', min: 2, max: 12, default: 4, step: 2 },
      { key: 'feedback', label: 'Feedback', min: 0, max: 85, default: 30, unit: '%' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
    ],
    create: (ctx) => new PhaserDevice(ctx),
  },
  {
    type: 'tremolo', label: 'Tremolo', category: 'mod', color: C.mod,
    blurb: 'Amplitude wobble — amp-style shimmer',
    params: [
      { key: 'rate', label: 'Rate', min: 0.1, max: 20, default: 5, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.6, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new TremoloDevice(ctx),
  },
  {
    type: 'autopan', label: 'Auto-Pan', category: 'mod', color: C.mod,
    blurb: 'Sweeps the image left–right on an LFO',
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 10, default: 1, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.8, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new AutoPanDevice(ctx),
  },
  {
    type: 'vibrato', label: 'Vibrato', category: 'mod', color: C.mod,
    blurb: 'True pitch wobble — no dry signal',
    params: [
      { key: 'rate', label: 'Rate', min: 0.5, max: 12, default: 5, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new VibratoDevice(ctx),
  },
  {
    type: 'rotary', label: 'Rotary', category: 'mod', color: C.mod,
    blurb: 'Leslie-style twin rotors — chorale to tremolo',
    params: [
      { key: 'speed', label: 'Speed', min: 0, max: 1, default: 0.5, format: (v) => (v < 0.33 ? 'Chorale' : v < 0.66 ? 'Ramp' : 'Tremolo') },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.6, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new RotaryDevice(ctx),
  },
  {
    type: 'comb', label: 'Comb', category: 'mod', color: C.mod,
    blurb: 'Tuned feedback comb — metallic rings and hollows',
    params: [
      { key: 'freq', label: 'Freq', min: 25, max: 2000, default: 220, unit: 'Hz', curve: 'log' },
      { key: 'feedback', label: 'Feedback', min: -95, max: 95, default: 70, unit: '%' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 50, unit: '%' },
    ],
    create: (ctx) => new CombDevice(ctx),
  },
  {
    type: 'ringmod', label: 'Ring-Mod', category: 'mod', color: C.mod,
    blurb: 'Carrier multiplication — bells, robots, sidebands',
    params: [
      { key: 'freq', label: 'Freq', min: 1, max: 8000, default: 300, unit: 'Hz', curve: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new RingModDevice(ctx),
  },
  {
    type: 'freqshift', label: 'Freq Shifter', category: 'mod', color: C.mod,
    blurb: 'Single-sideband shift — inharmonic metal, shimmer, and spiralling feedback',
    params: [
      { key: 'shift', label: 'Shift', min: -2000, max: 2000, default: 100, unit: 'Hz', format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} Hz` },
      { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, default: 0, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new FreqShifterDevice(ctx),
  },
  {
    type: 'vocoder', label: 'Vocoder', category: 'mod', color: C.mod,
    blurb: '20-band channel vocoder — the track drives an internal synth carrier',
    params: [
      { key: 'carrier', label: 'Carrier', min: 40, max: 400, default: 110, unit: 'Hz', curve: 'log' },
      { key: 'detune', label: 'Detune', min: 0, max: 40, default: 8, unit: '¢' },
      { key: 'breath', label: 'Breath', min: 0, max: 0.5, default: 0.08, format: (v) => `${Math.round(v * 200)}%` },
      { key: 'tightness', label: 'Tightness', min: 2, max: 14, default: 4.5 },
      { key: 'depth', label: 'Depth', min: 1, max: 20, default: 8 },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new VocoderDevice(ctx),
  },
  {
    type: 'freeze', label: 'Freeze Cloud', category: 'mod', color: C.mod,
    blurb: 'Granular smear — jittered tap cloud with near-infinite hold',
    params: [
      { key: 'size', label: 'Grain', min: 20, max: 1500, default: 200, unit: 'ms', curve: 'log' },
      { key: 'spray', label: 'Spray', min: 0, max: 1, default: 0.3, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'rate', label: 'Rate', min: 0.05, max: 4, default: 0.4, unit: 'Hz' },
      { key: 'freeze', label: 'Hold', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'tone', label: 'Tone', min: 500, max: 16000, default: 6000, unit: 'Hz', curve: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 45, unit: '%' },
    ],
    create: (ctx) => new FreezeCloudDevice(ctx),
  },
  {
    type: 'autofilter', label: 'Filter LFO', category: 'dj', color: C.dj,
    blurb: 'The performance filter — sweepable LP/HP/BP with drive and an LFO',
    params: [
      { key: 'mode', label: 'Mode', min: 0, max: 2, default: 0, step: 1, format: (v) => ['LP', 'HP', 'BP'][Math.max(0, Math.min(2, Math.round(v)))] },
      { key: 'cutoff', label: 'Cutoff', min: 40, max: 18000, default: 1200, unit: 'Hz', curve: 'log' },
      { key: 'res', label: 'Res', min: 0.3, max: 18, default: 2 },
      { key: 'drive', label: 'Drive', min: 0, max: 1, default: 0, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'rate', label: 'LFO Rate', min: 0.05, max: 12, default: 0.5, unit: 'Hz' },
      { key: 'depth', label: 'LFO Depth', min: 0, max: 1, default: 0, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new AutoFilterDevice(ctx),
  },
  {
    type: 'gater', label: 'Gater', category: 'dj', color: C.dj,
    blurb: 'Tempo-synced rhythmic gate — the Traktor chop',
    params: [
      { key: 'division', label: 'Rate', min: 0, max: 3, default: 2, step: 1, format: divisionLabel },
      { key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.9, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new GaterDevice(ctx),
  },
  {
    type: 'beatmasher', label: 'Beatmasher', category: 'dj', color: C.dj,
    blurb: 'Loop-freeze stutter — grab a slice and mash it, tempo-synced',
    params: [
      { key: 'mash', label: 'Mash', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'HELD' : 'Off') },
      { key: 'length', label: 'Length', min: 0, max: 3, default: 1, step: 1, format: divisionLabel },
    ],
    create: (ctx) => new BeatmasherDevice(ctx),
  },
  {
    type: 'stutter', label: 'Stutter', category: 'dj', color: C.dj,
    blurb: 'Pattern stutter — a 16-step grid re-triggers the captured slice, tempo-synced',
    params: [
      { key: 'on', label: 'On', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'On' : 'Off') },
      { key: 'pattern', label: 'Pattern', min: 0, max: 65535, default: 0, step: 1, format: (v) => `${(v >>> 0).toString(2).padStart(16, '0').split('').filter((b) => b === '1').length} steps` },
      { key: 'division', label: 'Rate', min: 0, max: 3, default: 2, step: 1, format: divisionLabel },
      { key: 'gate', label: 'Gate', min: 10, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new StutterDevice(ctx),
  },
  {
    type: 'limiter', label: 'Peak Limiter', category: 'dynamics', color: C.dynamics,
    blurb: 'True-peak-safe ceiling (4× oversampled) with input gain',
    params: [
      { key: 'gain', label: 'Gain', min: 0, max: 24, default: 0, unit: 'dB' },
      { key: 'ceiling', label: 'Ceiling', min: -12, max: 0, default: -0.3, unit: 'dB' },
      { key: 'release', label: 'Release', min: 10, max: 500, default: 80, unit: 'ms' },
      { key: 'character', label: 'Style', min: 0, max: 2, default: 0, step: 1, format: (v) => ['Transparent', 'Glue', 'Loud'][Math.round(v)] ?? 'Transparent' },
    ],
    create: (ctx) => new LimiterDevice(ctx),
  },
  {
    type: 'transient', label: 'Transient', category: 'dynamics', color: C.dynamics,
    blurb: 'Attack and sustain, shaped independently',
    params: [
      { key: 'attack', label: 'Attack', min: -1, max: 1, default: 0.4, format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` },
      { key: 'sustain', label: 'Sustain', min: -1, max: 1, default: 0, format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new TransientDevice(ctx),
  },
  {
    type: 'bitcrush', label: 'Bit-8', category: 'saturation', color: C.saturation,
    blurb: 'Bit-depth crush + rate grime',
    params: [
      { key: 'bits', label: 'Bits', min: 1, max: 16, default: 8, step: 1 },
      { key: 'rateHz', label: 'Rate', min: 500, max: 20000, default: 12000, unit: 'Hz', curve: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 100, unit: '%' },
    ],
    create: (ctx) => new BitcrushDevice(ctx),
  },
  {
    type: 'trim', label: 'Gain', category: 'utility', color: C.utility,
    blurb: 'A clean level trim',
    params: [{ key: 'gain', label: 'Gain', min: -24, max: 24, default: 0, unit: 'dB' }],
    create: (ctx) => new TrimDevice(ctx),
  },
  {
    type: 'pristine', label: 'Pristine', category: 'repair', color: '#06D6A0',
    blurb: 'Takes the AI out of AI songs — Suno/Udio artifact repair',
    params: [
      { key: 'cliff', label: 'Cliff', min: 10000, max: 20000, default: 15800, unit: 'Hz', curve: 'log', format: (v) => `${(v / 1000).toFixed(1)}k` },
      { key: 'shimmer', label: 'De-shimmer', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'shimmerHz', label: 'Birdies', min: 4000, max: 9000, default: 6000, unit: 'Hz', curve: 'log', format: (v) => `${(v / 1000).toFixed(1)}k` },
      { key: 'dehiss', label: 'De-hiss', min: 0, max: 1, default: 0.3, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'rebuild', label: 'HF Rebuild', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'transients', label: 'Transients', min: 0, max: 1, default: 0.35, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'width', label: 'Width', min: 60, max: 160, default: 115, unit: '%' },
      { key: 'monoBelow', label: 'Mono <', min: 0, max: 250, default: 110, unit: 'Hz', curve: 'log', format: (v) => (v < 20 ? 'off' : `${Math.round(v)}Hz`) },
    ],
    create: (ctx) => new PristineDevice(ctx),
  },
  {
    type: 'amprig', label: 'Amp Rack', category: 'amp', color: C.amp,
    blurb: 'The whole rig — pedals, amp, cab and mic',
    params: [
      { key: 'amp', label: 'Amp', min: 0, max: AMP_MODELS.length - 1, default: 4, step: 1, format: (v) => ampModelAt(v).label },
      { key: 'gain', label: 'Gain', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'bass', label: 'Bass', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 10)}` },
      { key: 'mid', label: 'Mid', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 10)}` },
      { key: 'treble', label: 'Treble', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 10)}` },
      { key: 'presence', label: 'Presence', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 10)}` },
      { key: 'resonance', label: 'Resonance', min: 0, max: 1, default: 0.5, format: (v) => `${Math.round(v * 10)}` },
      { key: 'sagAmt', label: 'Sag', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'master', label: 'Master', min: 0, max: 1, default: 0.7, format: (v) => `${Math.round(v * 10)}` },
      { key: 'cab', label: 'Cab', min: 0, max: CAB_MODELS.length - 1, default: 3, step: 1, format: (v) => cabModelAt(v).label },
      { key: 'mic', label: 'Mic 1', min: 0, max: MIC_MODELS.length - 1, default: 0, step: 1, format: (v) => micModelAt(v).label },
      { key: 'micEdge', label: 'Cap→Edge', min: 0, max: 1, default: 0.4, format: (v) => (v < 0.33 ? 'Cap' : v < 0.66 ? 'Mid' : 'Edge') },
      { key: 'mic2', label: 'Mic 2', min: 0, max: MIC_MODELS.length - 1, default: 1, step: 1, format: (v) => micModelAt(v).label },
      { key: 'micBlend', label: 'Mic Blend', min: 0, max: 1, default: 0, format: (v) => (v <= 0.02 ? 'Mic 1' : v >= 0.98 ? 'Mic 2' : `${Math.round((1 - v) * 100)}/${Math.round(v * 100)}`) },
      { key: 'pedal1On', label: 'Pedal 1', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'On' : 'Off') },
      { key: 'pedal1', label: 'P1 Type', min: 0, max: PEDAL_MODELS.length - 1, default: 0, step: 1, format: (v) => pedalModelAt(v).label },
      { key: 'pedal1Drive', label: 'P1 Drive', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'pedal2On', label: 'Pedal 2', min: 0, max: 1, default: 0, step: 1, format: (v) => (v > 0.5 ? 'On' : 'Off') },
      { key: 'pedal2', label: 'P2 Type', min: 0, max: PEDAL_MODELS.length - 1, default: 3, step: 1, format: (v) => pedalModelAt(v).label },
      { key: 'pedal2Drive', label: 'P2 Drive', min: 0, max: 1, default: 0.4, format: (v) => `${Math.round(v * 100)}%` },
    ],
    create: (ctx) => new AmpRigDevice(ctx),
  },
];

export const deviceByType = (type: string): FxDescriptor | undefined => DEVICES.find((d) => d.type === type);

// ── analytic response curves (for the rack overlay, drawn without reading audio) ──
function biquadDb(type: BiquadFilterType, f0: number, gainDb: number, q: number, f: number, sr = 48000): number {
  const w = (2 * Math.PI * f) / sr, cw = Math.cos(w), sw = Math.sin(w);
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / sr, c0 = Math.cos(w0), s0 = Math.sin(w0);
  const alpha = s0 / (2 * Math.max(0.1, q));
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (type === 'peaking') { b0 = 1 + alpha * A; b1 = -2 * c0; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * c0; a2 = 1 - alpha / A; }
  else if (type === 'lowshelf') { const s = 2 * Math.sqrt(A) * alpha; b0 = A * ((A + 1) - (A - 1) * c0 + s); b1 = 2 * A * ((A - 1) - (A + 1) * c0); b2 = A * ((A + 1) - (A - 1) * c0 - s); a0 = (A + 1) + (A - 1) * c0 + s; a1 = -2 * ((A - 1) + (A + 1) * c0); a2 = (A + 1) + (A - 1) * c0 - s; }
  else if (type === 'highshelf') { const s = 2 * Math.sqrt(A) * alpha; b0 = A * ((A + 1) + (A - 1) * c0 + s); b1 = -2 * A * ((A - 1) + (A + 1) * c0); b2 = A * ((A + 1) + (A - 1) * c0 - s); a0 = (A + 1) - (A - 1) * c0 + s; a1 = 2 * ((A - 1) - (A + 1) * c0); a2 = (A + 1) - (A - 1) * c0 - s; }
  else if (type === 'highpass') { b0 = (1 + c0) / 2; b1 = -(1 + c0); b2 = (1 + c0) / 2; a0 = 1 + alpha; a1 = -2 * c0; a2 = 1 - alpha; }
  else if (type === 'lowpass') { b0 = (1 - c0) / 2; b1 = 1 - c0; b2 = (1 - c0) / 2; a0 = 1 + alpha; a1 = -2 * c0; a2 = 1 - alpha; }
  const nRe = b0 + b1 * cw + b2 * Math.cos(2 * w), nIm = -(b1 * sw + b2 * Math.sin(2 * w));
  const dRe = a0 + a1 * cw + a2 * Math.cos(2 * w), dIm = -(a1 * sw + a2 * Math.sin(2 * w));
  return 20 * Math.log10(Math.max(1e-6, Math.hypot(nRe, nIm) / Math.max(1e-9, Math.hypot(dRe, dIm))));
}

/**
 * The response curve a device draws over its RTA (dB at a frequency). Returns null for devices
 * that don't have a meaningful magnitude curve (the rack then shows only the pre/post spectrum).
 */
export function deviceCurveDb(type: string, p: Record<string, number>, f: number, sr = 48000): number | null {
  if (type === 'eq') {
    let db = 0;
    if ((p.hp ?? 20) > 22) db += biquadDb('highpass', clampHz(p.hp), 0, 0.7, f, sr);
    if ((p.lp ?? 20000) < 19000) db += biquadDb('lowpass', clampHz(p.lp), 0, 0.7, f, sr);
    db += biquadDb('lowshelf', clampHz(p.f1 ?? 120), p.g1 ?? 0, 0.7, f, sr);
    db += biquadDb('peaking', clampHz(p.f2 ?? 500), p.g2 ?? 0, Math.max(0.1, p.q2 ?? 1), f, sr);
    db += biquadDb('peaking', clampHz(p.f3 ?? 3000), p.g3 ?? 0, Math.max(0.1, p.q3 ?? 1), f, sr);
    db += biquadDb('highshelf', clampHz(p.f4 ?? 10000), p.g4 ?? 0, 0.7, f, sr);
    return db;
  }
  if (type === 'dehum') {
    let db = 0;
    const f0 = p.fundamental ?? 60, harm = Math.round(p.harmonics ?? 6), q = Math.max(5, p.q ?? 30);
    for (let i = 0; i < harm; i++) db += biquadDb('peaking', f0 * (i + 1), -40, q, f, sr); // notch ≈ deep cut
    return db;
  }
  if (type === 'deess') {
    // The high band is dynamically compressed; show the crossover as a shelf hint.
    return biquadDb('highshelf', clampHz(p.frequency ?? 6000), -(Math.max(1, p.amount ?? 5)), 0.7, f, sr);
  }
  return null;
}

/** A fresh instance with the descriptor's default params — what "add device" drops in. */
export function newInstance(type: string): FxInstance | null {
  const d = deviceByType(type);
  if (!d) return null;
  const params: Record<string, number> = {};
  for (const p of d.params) params[p.key] = p.default;
  return { id: fxUid(), type, on: true, params };
}

// ── the chain host ───────────────────────────────────────────────────────────
/**
 * An ordered FX chain between one input and one output. Rebuilds from an FxInstance[] — the
 * same idempotent setState shape as SpectraEQ. Bypassed devices are skipped in the wiring, not
 * merely muted, so a bypass is truly zero-cost and phase-neutral.
 */
export class FxChainHost {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private live = new Map<string, { node: FxNode; type: string }>();
  private bypass: GainNode;
  private bpm = 120;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.bypass = ctx.createGain();
    this.bypass.gain.value = 1;
    this.input.connect(this.bypass); this.bypass.connect(this.output);
  }

  /** Transport tempo for synced devices (Gater, Beatmasher). Safe to call any time. */
  setTempo(bpm: number): void {
    this.bpm = Math.max(20, Math.min(300, bpm || 120));
    for (const { node } of this.live.values()) node.setTempo?.(this.bpm);
  }

  setChain(instances: FxInstance[]): void {
    // Drop devices no longer present (or whose type changed at the same id).
    const wanted = new Set(instances.filter((i) => i.on).map((i) => i.id));
    for (const [id, entry] of [...this.live]) {
      const inst = instances.find((i) => i.id === id);
      if (!inst || !inst.on || inst.type !== entry.type) { entry.node.dispose(); this.live.delete(id); }
    }
    // Ensure a live node per active instance and push its params.
    for (const inst of instances) {
      if (!inst.on) continue;
      let entry = this.live.get(inst.id);
      if (!entry) {
        const d = deviceByType(inst.type);
        if (!d) continue;
        entry = { node: d.create(this.ctx), type: inst.type };
        entry.node.setTempo?.(this.bpm);
        this.live.set(inst.id, entry);
      }
      entry.node.setParams(inst.params);
    }
    // Rewire input → active devices in order → output.
    try { this.input.disconnect(); this.bypass.disconnect(); } catch { /* */ }
    for (const { node } of this.live.values()) { try { node.output.disconnect(); } catch { /* */ } }
    // Keep an always-audible safety path until at least one valid device is wired. This prevents
    // unknown/failed plug-ins from turning an insert or send into a silent channel.
    let node: AudioNode = this.input;
    let connected = 0;
    for (const inst of instances) {
      if (!inst.on) continue;
      const entry = this.live.get(inst.id);
      if (!entry) continue;
      node.connect(entry.node.input);
      node = entry.node.output;
      connected++;
    }
    if (connected) node.connect(this.output);
    else { this.input.connect(this.bypass); this.bypass.connect(this.output); }
    // Disconnecting each output above also severed its post-analyser tap — restore them, or
    // every device's "after" scope goes silent the first time the chain is rebuilt.
    for (const { node: dev } of this.live.values()) {
      if (dev.post) { try { dev.output.connect(dev.post); } catch { /* */ } }
    }
  }

  /** The live device node for an instance id — the rack reads pre/post analysers off it. */
  nodeOf(id: string): FxNode | undefined { return this.live.get(id)?.node; }

  /** Live gain reduction of a dynamics instance, for the meter. */
  reductionOf(id: string): number {
    const node = this.live.get(id)?.node;
    return node?.gr ? node.gr() : 0;
  }

  dispose(): void {
    for (const { node } of this.live.values()) node.dispose();
    this.live.clear();
    try { this.input.disconnect(); this.bypass.disconnect(); this.output.disconnect(); } catch { /* */ }
  }
}
