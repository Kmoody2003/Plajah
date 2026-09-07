// meterAnalyser — a shared real-time analysis tap for the Meter Bridge, used by
// BOTH Melos and Fabula. Give it an AudioContext and the node to meter (a master
// bus node); it taps that node (non-destructively) and produces a full frame of
// metering data each time you call read().
//
// LUFS here is a practical K-weighted windowed estimate (momentary 400ms, short
// 3s, gated integrated) — good enough to mix and hit a target live. For a
// delivery-exact BS.1770 number, bounce and measure (Melos also has a
// beats-loudness worklet that can back this later). True peak is a 4× oversample
// estimate. Spectrum, sample peak, RMS and stereo correlation are exact.

export interface MeterFrame {
  lufsM: number; lufsS: number; lufsI: number;  // momentary / short-term / integrated
  lra: number;                                  // loudness range (LU)
  tpL: number; tpR: number;                     // true peak per channel (dBTP)
  rms: number;                                  // dBFS
  corr: number;                                 // stereo correlation -1..+1
  spectrum: Float32Array;                       // NBANDS log-spaced magnitudes (dB)
  silent: boolean;
}

const NBANDS = 48;
const DB_FLOOR = -100;
const toDb = (x: number) => (x <= 1e-10 ? DB_FLOOR : 20 * Math.log10(x));

export class MeterAnalyser {
  readonly nbands = NBANDS;
  private ctx: BaseAudioContext;
  private split: ChannelSplitterNode;
  private aL: AnalyserNode; private aR: AnalyserNode;
  private aKL: AnalyserNode; private aKR: AnalyserNode;
  private kfilt: BiquadFilterNode[] = [];
  private tL: Float32Array; private tR: Float32Array; private tKL: Float32Array; private tKR: Float32Array; private fL: Float32Array;
  // loudness windows: ring buffer of {ms:meanSquare, t:seconds}
  private blocks: { ms: number; t: number }[] = [];
  private intSum = 0; private intN = 0;               // gated integrated accumulator
  private shortHist: number[] = [];                    // short-term LUFS history for LRA
  private disposed = false;

  constructor(ctx: BaseAudioContext, source: AudioNode) {
    this.ctx = ctx;
    this.split = ctx.createChannelSplitter(2);
    this.aL = ctx.createAnalyser(); this.aR = ctx.createAnalyser();
    this.aKL = ctx.createAnalyser(); this.aKR = ctx.createAnalyser();
    for (const a of [this.aL, this.aR]) { a.fftSize = 2048; a.smoothingTimeConstant = 0.5; }
    for (const a of [this.aKL, this.aKR]) { a.fftSize = 4096; a.smoothingTimeConstant = 0; }
    // K-weighting pre-filter (BS.1770), applied PER CHANNEL: high-pass ~38 Hz +
    // high-shelf +4 dB @ ~1.5 kHz. Per-channel so loudness sums channel mean-squares
    // (anti-phase content does not cancel, unlike a naive L+R sample sum).
    const kchain = (chan: 0 | 1, out: AnalyserNode) => {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
      const sh = ctx.createBiquadFilter(); sh.type = 'highshelf'; sh.frequency.value = 1500; sh.gain.value = 4;
      this.split.connect(hp, chan); hp.connect(sh); sh.connect(out);
      this.kfilt.push(hp, sh);
    };
    try {
      source.connect(this.split);
      this.split.connect(this.aL, 0);
      this.split.connect(this.aR, 1);
      kchain(0, this.aKL); kchain(1, this.aKR);
    } catch { /* already-connected / mono source — best effort */ }
    this.tL = new Float32Array(this.aL.fftSize);
    this.tR = new Float32Array(this.aR.fftSize);
    this.tKL = new Float32Array(this.aKL.fftSize);
    this.tKR = new Float32Array(this.aKR.fftSize);
    this.fL = new Float32Array(this.aL.frequencyBinCount);
  }

  /** True-peak estimate via 4× linear-interpolated inter-sample maxima. */
  private truePeak(buf: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i], b = buf[i + 1];
      const m = Math.max(Math.abs(a), Math.abs(b), Math.abs(a + (b - a) * 0.25), Math.abs(a + (b - a) * 0.5), Math.abs(a + (b - a) * 0.75));
      if (m > peak) peak = m;
    }
    return peak;
  }

  read(): MeterFrame {
    const now = this.ctx.currentTime;
    this.aL.getFloatTimeDomainData(this.tL);
    this.aR.getFloatTimeDomainData(this.tR);
    this.aKL.getFloatTimeDomainData(this.tKL);
    this.aKR.getFloatTimeDomainData(this.tKR);
    this.aL.getFloatFrequencyData(this.fL);

    // per-channel RMS + correlation + true peak
    let sumL = 0, sumR = 0, sumLR = 0, sumRms = 0;
    const N = this.tL.length;
    for (let i = 0; i < N; i++) { const l = this.tL[i], r = this.tR[i]; sumL += l * l; sumR += r * r; sumLR += l * r; sumRms += (l * l + r * r) * 0.5; }
    const corr = sumL > 1e-9 && sumR > 1e-9 ? sumLR / Math.sqrt(sumL * sumR) : 1;
    const rms = toDb(Math.sqrt(sumRms / N));
    const tpL = toDb(this.truePeak(this.tL));
    const tpR = toDb(this.truePeak(this.tR));

    // loudness: sum of the K-weighted per-channel mean-squares (BS.1770 channel sum)
    let msL = 0, msR = 0; for (let i = 0; i < this.tKL.length; i++) { msL += this.tKL[i] * this.tKL[i]; msR += this.tKR[i] * this.tKR[i]; }
    const ms = (msL + msR) / this.tKL.length;
    this.blocks.push({ ms, t: now });
    while (this.blocks.length && now - this.blocks[0].t > 3.05) this.blocks.shift();
    const meanOver = (win: number) => { let s = 0, n = 0; for (let k = this.blocks.length - 1; k >= 0; k--) { if (now - this.blocks[k].t > win) break; s += this.blocks[k].ms; n++; } return n ? s / n : 0; };
    const lufsFrom = (m: number) => (m <= 1e-10 ? DB_FLOOR : -0.691 + 10 * Math.log10(m));
    const lufsM = lufsFrom(meanOver(0.4));
    const lufsS = lufsFrom(meanOver(3.0));
    // gated integrated: absolute gate -70 LUFS
    const blockLufs = lufsFrom(ms);
    if (blockLufs > -70) { this.intSum += ms; this.intN++; }
    const lufsI = this.intN ? lufsFrom(this.intSum / this.intN) : DB_FLOOR;
    // LRA from the spread of short-term values (10th–95th percentile)
    if (lufsS > -70) { this.shortHist.push(lufsS); if (this.shortHist.length > 900) this.shortHist.shift(); }
    let lra = 0;
    if (this.shortHist.length > 8) { const s = [...this.shortHist].sort((a, b) => a - b); const lo = s[Math.floor(s.length * 0.1)], hi = s[Math.floor(s.length * 0.95)]; lra = Math.max(0, hi - lo); }

    // spectrum → NBANDS log-spaced (20 Hz … nyquist)
    const spectrum = new Float32Array(NBANDS);
    const nyq = this.ctx.sampleRate / 2, bins = this.fL.length;
    for (let b = 0; b < NBANDS; b++) {
      const f0 = 20 * Math.pow(nyq / 20, b / NBANDS), f1 = 20 * Math.pow(nyq / 20, (b + 1) / NBANDS);
      let i0 = Math.max(0, Math.floor(f0 / nyq * bins)), i1 = Math.min(bins - 1, Math.ceil(f1 / nyq * bins));
      let mx = DB_FLOOR; for (let i = i0; i <= i1; i++) if (this.fL[i] > mx) mx = this.fL[i];
      spectrum[b] = mx;
    }

    return { lufsM, lufsS, lufsI, lra, tpL, tpR, rms, corr, spectrum, silent: rms < -80 };
  }

  /** Reset the integrated/LRA accumulators (call on transport start). */
  resetIntegrated() { this.intSum = 0; this.intN = 0; this.shortHist = []; this.blocks = []; }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const n of [this.split, this.aL, this.aR, this.aKL, this.aKR, ...this.kfilt]) { try { n.disconnect(); } catch { /* */ } }
  }
}
