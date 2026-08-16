// Spectra — the EQ + dynamics device.
//
// Native Web Audio, on purpose: the whole Beats graph is native nodes (graph.ts), and a mixing EQ
// is a chain of biquads with an analyser on each end — exactly what BiquadFilterNode + AnalyserNode
// give us, sample-accurate and cheap. (The ZDF argument that justified Rust for the SYNTH filter is
// about fast audio-rate cutoff modulation; a mix EQ is static or slowly automated, so biquads are
// the right, standard tool — it's what Bitwig and Pro-Q use too.)
//
// A band can be DYNAMIC: a parallel band-pass detector watches that frequency, and when it crosses
// the threshold the band's gain moves by `range` — an EQ and a multiband compressor in one curve.
// The follower is driven live from the panel's rAF (tickDynamics); an offline bounce renders the
// static curve (dynamics are a live feature in v1).

export type BandType = 'bell' | 'lowshelf' | 'highshelf' | 'highpass' | 'lowpass' | 'notch';

export interface SpectraBand {
  id: string;
  freq: number;      // Hz
  gain: number;      // dB (peaking/shelf)
  q: number;
  type: BandType;
  on: boolean;
  dynamic?: { on: boolean; threshold: number /* dB */; range: number /* dB, +boost / -cut */; };
}

export interface SpectraState {
  on: boolean;
  mode: 5 | 30;
  bands: SpectraBand[];
}

const BQ: Record<BandType, BiquadFilterType> = {
  bell: 'peaking', lowshelf: 'lowshelf', highshelf: 'highshelf',
  highpass: 'highpass', lowpass: 'lowpass', notch: 'notch',
};

let bandSeq = 0;
export const bandId = () => `b${(bandSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The everyday 5-band starting point: HP, low bell, mid bell, presence bell, air shelf. */
export function defaultBands5(): SpectraBand[] {
  return [
    { id: bandId(), freq: 40, gain: 0, q: 0.7, type: 'highpass', on: true },
    { id: bandId(), freq: 180, gain: 0, q: 1.0, type: 'bell', on: true },
    { id: bandId(), freq: 900, gain: 0, q: 1.2, type: 'bell', on: true },
    { id: bandId(), freq: 3500, gain: 0, q: 1.0, type: 'bell', on: true },
    { id: bandId(), freq: 12000, gain: 0, q: 0.7, type: 'highshelf', on: true },
  ];
}

/** Surgical mode fills in to ~30 bands on a log grid; the 5 musical bands stay, the rest are flat
 *  bells you reach for when you need them. */
export function expandTo30(bands5: SpectraBand[]): SpectraBand[] {
  const out = [...bands5];
  const have = new Set(bands5.map((b) => Math.round(b.freq)));
  for (let i = 0; i < 30; i++) {
    const f = Math.round(30 * Math.pow(20000 / 30, i / 29));
    if ([...have].some((h) => Math.abs(Math.log2(h / f)) < 0.18)) continue; // skip near an existing band
    out.push({ id: bandId(), freq: f, gain: 0, q: 3.0, type: 'bell', on: true });
  }
  return out.sort((a, b) => a.freq - b.freq);
}

export function defaultSpectra(): SpectraState {
  return { on: true, mode: 5, bands: defaultBands5() };
}

/** The live device: a chain of biquads with pre/post analysers, plus per-dynamic-band detectors. */
export class SpectraEQ {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: BaseAudioContext;
  private pre: AnalyserNode;
  private post: AnalyserNode;
  private filters = new Map<string, BiquadFilterNode>();
  private detectors = new Map<string, { bp: BiquadFilterNode; an: AnalyserNode; buf: Float32Array; smoothedGain: number }>();
  private order: string[] = [];
  private bandsById = new Map<string, SpectraBand>();
  private freqScratch = new Float32Array(0);

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.pre = ctx.createAnalyser(); this.pre.fftSize = 2048; this.pre.smoothingTimeConstant = 0.6;
    this.post = ctx.createAnalyser(); this.post.fftSize = 2048; this.post.smoothingTimeConstant = 0.6;
    this.input.connect(this.pre);
    // start as a passthrough until setState wires the chain
    this.input.connect(this.output);
    this.output.connect(this.post);
  }

  /** (Re)build the biquad chain from state. Idempotent — filters are reused by band id. */
  setState(state: SpectraState): void {
    // disconnect current chain from input
    try { this.input.disconnect(); } catch { /* */ }
    this.input.connect(this.pre);

    const active = state.on ? state.bands.filter((b) => b.on) : [];
    this.order = active.map((b) => b.id);
    this.bandsById = new Map(active.map((b) => [b.id, b]));

    // ensure a BiquadFilter per active band
    for (const b of active) {
      let f = this.filters.get(b.id);
      if (!f) { f = this.ctx.createBiquadFilter(); this.filters.set(b.id, f); }
      f.type = BQ[b.type];
      f.frequency.value = Math.max(20, Math.min(20000, b.freq));
      f.Q.value = Math.max(0.1, Math.min(18, b.q));
      f.gain.value = b.gain;
      this.ensureDetector(b);
    }
    // drop filters/detectors for bands no longer present
    for (const id of [...this.filters.keys()]) if (!this.bandsById.has(id)) { try { this.filters.get(id)!.disconnect(); } catch { /* */ } this.filters.delete(id); }
    for (const id of [...this.detectors.keys()]) if (!this.bandsById.has(id) || !this.bandsById.get(id)!.dynamic?.on) this.dropDetector(id);

    // wire input → f0 → f1 → ... → output
    let node: AudioNode = this.input;
    for (const id of this.order) {
      const f = this.filters.get(id)!;
      try { f.disconnect(); } catch { /* */ }
      node.connect(f);
      node = f;
    }
    node.connect(this.output);
  }

  private ensureDetector(b: SpectraBand): void {
    if (!b.dynamic?.on) { this.dropDetector(b.id); return; }
    let d = this.detectors.get(b.id);
    if (!d) {
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = Math.max(1, b.q);
      const an = this.ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.5;
      this.input.connect(bp); bp.connect(an);
      d = { bp, an, buf: new Float32Array(an.fftSize), smoothedGain: b.gain };
      this.detectors.set(b.id, d);
    }
    d.bp.frequency.value = Math.max(20, Math.min(20000, b.freq));
  }
  private dropDetector(id: string): void {
    const d = this.detectors.get(id);
    if (d) { try { d.bp.disconnect(); } catch { /* */ } this.detectors.delete(id); }
  }

  /** Call each animation frame while live: move dynamic bands toward gain±range across the
   *  threshold. Returns per-band reduction (dB) for the meter, keyed by band id. */
  tickDynamics(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, d] of this.detectors) {
      const band = this.bandsById.get(id); const f = this.filters.get(id);
      if (!band?.dynamic?.on || !f) continue;
      d.an.getFloatTimeDomainData(d.buf);
      let rms = 0; for (let i = 0; i < d.buf.length; i++) rms += d.buf[i] * d.buf[i];
      rms = Math.sqrt(rms / d.buf.length);
      const db = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
      // over threshold → apply range; below → return to static gain. Smooth for a musical attack.
      const target = db > band.dynamic.threshold ? band.gain + band.dynamic.range : band.gain;
      d.smoothedGain += (target - d.smoothedGain) * 0.25;
      f.gain.setTargetAtTime(d.smoothedGain, this.ctx.currentTime, 0.02);
      out[id] = +(d.smoothedGain - band.gain).toFixed(2);
    }
    return out;
  }

  /** Frequency magnitude (dB) for drawing the spectrum. `post` = after the EQ, else the input. */
  spectrum(which: 'pre' | 'post'): Float32Array {
    const a = which === 'post' ? this.post : this.pre;
    if (this.freqScratch.length !== a.frequencyBinCount) this.freqScratch = new Float32Array(a.frequencyBinCount);
    a.getFloatFrequencyData(this.freqScratch);
    return this.freqScratch;
  }
  get sampleRate(): number { return this.ctx.sampleRate; }
  get binCount(): number { return this.pre.frequencyBinCount; }

  dispose(): void {
    try { this.input.disconnect(); this.output.disconnect(); this.pre.disconnect(); this.post.disconnect(); } catch { /* */ }
    for (const f of this.filters.values()) { try { f.disconnect(); } catch { /* */ } }
    for (const id of [...this.detectors.keys()]) this.dropDetector(id);
    this.filters.clear();
  }
}

/**
 * Analytic magnitude of the EQ curve at a frequency (dB) — for drawing the curve line without
 * reading the graph. Sums each band's biquad response (RBJ cookbook transfer magnitudes).
 */
export function curveMagnitudeDb(bands: SpectraBand[], freq: number, sampleRate = 48000): number {
  let db = 0;
  for (const b of bands) {
    if (!b.on) continue;
    db += bandMagnitudeDb(b, freq, sampleRate);
  }
  return db;
}

function bandMagnitudeDb(b: SpectraBand, f: number, sr: number): number {
  const w = (2 * Math.PI * f) / sr;
  const cw = Math.cos(w), sw = Math.sin(w);
  const A = Math.pow(10, b.gain / 40);
  const w0 = (2 * Math.PI * b.freq) / sr;
  const alpha = Math.sin(w0) / (2 * Math.max(0.1, b.q));
  const c0 = Math.cos(w0);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (b.type) {
    case 'bell':
      b0 = 1 + alpha * A; b1 = -2 * c0; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * c0; a2 = 1 - alpha / A; break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * c0 + s); b1 = 2 * A * ((A - 1) - (A + 1) * c0); b2 = A * ((A + 1) - (A - 1) * c0 - s);
      a0 = (A + 1) + (A - 1) * c0 + s; a1 = -2 * ((A - 1) + (A + 1) * c0); a2 = (A + 1) + (A - 1) * c0 - s; break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * c0 + s); b1 = -2 * A * ((A - 1) + (A + 1) * c0); b2 = A * ((A + 1) + (A - 1) * c0 - s);
      a0 = (A + 1) - (A - 1) * c0 + s; a1 = 2 * ((A - 1) - (A + 1) * c0); a2 = (A + 1) - (A - 1) * c0 - s; break;
    }
    case 'highpass':
      b0 = (1 + c0) / 2; b1 = -(1 + c0); b2 = (1 + c0) / 2; a0 = 1 + alpha; a1 = -2 * c0; a2 = 1 - alpha; break;
    case 'lowpass':
      b0 = (1 - c0) / 2; b1 = 1 - c0; b2 = (1 - c0) / 2; a0 = 1 + alpha; a1 = -2 * c0; a2 = 1 - alpha; break;
    case 'notch':
      b0 = 1; b1 = -2 * c0; b2 = 1; a0 = 1 + alpha; a1 = -2 * c0; a2 = 1 - alpha; break;
  }
  // |H(e^jw)| = |B(e^jw)| / |A(e^jw)|
  const numRe = b0 + b1 * cw + b2 * Math.cos(2 * w), numIm = -(b1 * sw + b2 * Math.sin(2 * w));
  const denRe = a0 + a1 * cw + a2 * Math.cos(2 * w), denIm = -(a1 * sw + a2 * Math.sin(2 * w));
  const mag = Math.hypot(numRe, numIm) / Math.max(1e-9, Math.hypot(denRe, denIm));
  return 20 * Math.log10(Math.max(1e-6, mag));
}
