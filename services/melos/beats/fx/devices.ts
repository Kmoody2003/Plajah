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

export type FxCategory = 'eq' | 'dynamics' | 'saturation' | 'stereo' | 'space' | 'repair' | 'utility' | 'amp';

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
  private makeup: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.comp = this.own(ctx.createDynamicsCompressor());
    this.makeup = this.own(ctx.createGain());
    this.input.connect(this.comp); this.comp.connect(this.makeup); this.makeup.connect(this.output);
  }
  setParams(p: Record<string, number>): void {
    this.comp.threshold.value = p.threshold ?? -18;
    this.comp.ratio.value = Math.max(1, p.ratio ?? 2);
    this.comp.attack.value = Math.max(0, (p.attack ?? 10) / 1000);
    this.comp.release.value = Math.max(0.001, (p.release ?? 180) / 1000);
    this.comp.knee.value = p.knee ?? 12;
    this.makeup.gain.value = dbToGain(p.makeup ?? 0);
  }
  gr(): number { return this.comp.reduction; }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Gate / Expander (RX-adjacent noise gate; downward expansion)
// ═══════════════════════════════════════════════════════════════════════════
class GateDevice extends FxBase {
  // Native passthrough for now; the worklet-backed downward expander lands with the repair set.
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.input.connect(this.output);
  }
  setParams(_p: Record<string, number>): void { /* worklet-backed gate lands with the repair set */ }
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
    this.preG.gain.value = 0.9;
    this.dry.gain.value = 1 - mix;
    this.wet.gain.value = mix * dbToGain(p.output ?? 0);
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
  private preDelay: DelayNode;
  private lastKey = '';
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.conv = this.own(ctx.createConvolver());
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.preDelay = this.own(ctx.createDelay(0.5));
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.preDelay); this.preDelay.connect(this.conv); this.conv.connect(this.wet); this.wet.connect(this.output);
  }
  private makeIR(seconds: number, decay: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.max(1, Math.floor(seconds * sr));
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  setParams(p: Record<string, number>): void {
    const size = Math.max(0.1, Math.min(6, p.size ?? 1.8));
    const decay = Math.max(0.5, Math.min(8, p.decay ?? 3));
    const key = `${size.toFixed(2)}:${decay.toFixed(2)}`;
    if (key !== this.lastKey) { this.lastKey = key; this.conv.buffer = this.makeIR(size, decay); }
    this.preDelay.delayTime.value = Math.max(0, Math.min(0.2, (p.preDelay ?? 20) / 1000));
    const mix = Math.max(0, Math.min(1, (p.mix ?? 25) / 100));
    this.dry.gain.value = 1 - mix; this.wet.gain.value = mix;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE: Delay — feedback delay with tone in the loop (delay)
// ═══════════════════════════════════════════════════════════════════════════
class DelayDevice extends FxBase {
  private delay: DelayNode; private fb: GainNode; private tone: BiquadFilterNode;
  private dry: GainNode; private wet: GainNode;
  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.delay = this.own(ctx.createDelay(2)); this.fb = this.own(ctx.createGain());
    this.tone = this.own(ctx.createBiquadFilter()); this.tone.type = 'lowpass'; this.tone.frequency.value = 4000;
    this.dry = this.own(ctx.createGain()); this.wet = this.own(ctx.createGain());
    this.input.connect(this.dry); this.dry.connect(this.output);
    this.input.connect(this.delay); this.delay.connect(this.tone); this.tone.connect(this.wet); this.wet.connect(this.output);
    this.tone.connect(this.fb); this.fb.connect(this.delay);
  }
  setParams(p: Record<string, number>): void {
    this.delay.delayTime.value = Math.max(0.001, Math.min(2, (p.time ?? 350) / 1000));
    this.fb.gain.value = Math.max(0, Math.min(0.95, (p.feedback ?? 35) / 100));
    this.tone.frequency.value = clampHz(p.tone ?? 4000);
    const mix = Math.max(0, Math.min(1, (p.mix ?? 25) / 100));
    this.dry.gain.value = 1 - mix; this.wet.gain.value = mix;
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
    this.cabWet.connect(this.master); this.cabDry.connect(this.master);
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

// ── the registry ─────────────────────────────────────────────────────────────
const C = { eq: '#00DAF3', dynamics: '#FF8C00', saturation: '#D40055', stereo: '#D0BCFF', space: '#06D6A0', repair: '#F59E0B', utility: '#8899aa', amp: '#E8A33D' };

export const DEVICES: FxDescriptor[] = [
  {
    type: 'eq', label: 'Equalizer', category: 'eq', color: C.eq,
    blurb: 'HP/LP + four bands of surgical or musical EQ',
    params: [
      { key: 'hp', label: 'HP', min: 16, max: 500, default: 20, unit: 'Hz', curve: 'log' },
      { key: 'f1', label: 'Low', min: 30, max: 400, default: 120, unit: 'Hz', curve: 'log' },
      { key: 'g1', label: 'Low dB', min: -18, max: 18, default: 0, unit: 'dB' },
      { key: 'f2', label: 'Lo-Mid', min: 100, max: 2000, default: 500, unit: 'Hz', curve: 'log' },
      { key: 'g2', label: 'Lo-Mid dB', min: -18, max: 18, default: 0, unit: 'dB' },
      { key: 'q2', label: 'Lo-Mid Q', min: 0.2, max: 8, default: 1 },
      { key: 'f3', label: 'Hi-Mid', min: 800, max: 8000, default: 3000, unit: 'Hz', curve: 'log' },
      { key: 'g3', label: 'Hi-Mid dB', min: -18, max: 18, default: 0, unit: 'dB' },
      { key: 'q3', label: 'Hi-Mid Q', min: 0.2, max: 8, default: 1 },
      { key: 'f4', label: 'Air', min: 4000, max: 20000, default: 12000, unit: 'Hz', curve: 'log' },
      { key: 'g4', label: 'Air dB', min: -18, max: 18, default: 0, unit: 'dB' },
      { key: 'lp', label: 'LP', min: 2000, max: 22000, default: 20000, unit: 'Hz', curve: 'log' },
    ],
    create: (ctx) => new EqDevice(ctx),
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
      { key: 'mix', label: 'Mix', min: 0, max: 100, default: 25, unit: '%' },
    ],
    create: (ctx) => new DelayDevice(ctx),
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
      { key: 'mic', label: 'Mic', min: 0, max: MIC_MODELS.length - 1, default: 0, step: 1, format: (v) => micModelAt(v).label },
      { key: 'micEdge', label: 'Cap→Edge', min: 0, max: 1, default: 0.4, format: (v) => (v < 0.33 ? 'Cap' : v < 0.66 ? 'Mid' : 'Edge') },
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

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
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
        this.live.set(inst.id, entry);
      }
      entry.node.setParams(inst.params);
    }
    // Rewire input → active devices in order → output.
    try { this.input.disconnect(); } catch { /* */ }
    for (const { node } of this.live.values()) { try { node.output.disconnect(); } catch { /* */ } }
    let node: AudioNode = this.input;
    for (const inst of instances) {
      if (!inst.on) continue;
      const entry = this.live.get(inst.id);
      if (!entry) continue;
      node.connect(entry.node.input);
      node = entry.node.output;
    }
    node.connect(this.output);
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
    try { this.input.disconnect(); this.output.disconnect(); } catch { /* */ }
  }
}
