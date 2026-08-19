// Loudness meter worklet — ITU-R BS.1770-5 / EBU R128 on the master bus.
//
// K-weighting is the spec's two-stage filter (head-model high shelf + RLB high-pass) with
// coefficients COMPUTED FOR THE RUNNING SAMPLE RATE — the published tables are 48 kHz only
// and must not be copied to 44.1 (research digest §3).
//
// Measures, posted ~10×/sec: momentary (400 ms), short-term (3 s), integrated (two-stage
// gate: absolute −70 LKFS then relative −10 LU), LRA (10th→95th pct of short-term, −20 LU
// rel gate), true peak (4× oversampled via cubic Hermite — a close estimate of the spec's
// polyphase FIR; ceiling decisions still belong at −1.0 dBTP), and stereo correlation.
//
// Runs off the main thread; the UI reads snapshots via BeatsEngine.loudness(). `{cmd:'reset'}`
// clears the integrated/LRA history (sent on transport play).

class LoudnessProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = sampleRate;

    // Stage 1 — spherical-head high shelf: f0 1681.97 Hz, gain +3.99984 dB, Q 0.7071752.
    // Stage 2 — RLB high-pass: f0 38.13547 Hz, Q 0.5003270.
    this.stage1 = this.shelfCoeffs(sr, 1681.9744509555319, 3.999843853973347, 0.7071752369554196);
    this.stage2 = this.highpassCoeffs(sr, 38.13547087602444, 0.5003270373238773);
    // Per-channel filter state [z1, z2] for each stage (stereo).
    this.f1 = [[0, 0], [0, 0]];
    this.f2 = [[0, 0], [0, 0]];

    // 100 ms sub-blocks of K-weighted mean square → windows are sums of sub-blocks.
    this.subLen = Math.round(sr / 10);
    this.subAcc = 0;          // running Σ(kL² + kR²) within the current sub-block
    this.subCount = 0;
    this.subs = [];           // last 30 sub-block mean-squares (3 s short-term window)

    // Gating history for integrated/LRA. 100 ms hop = 75% overlap of 400 ms blocks, per spec.
    this.blocks = [];         // 400 ms block mean-squares
    this.stHistory = [];      // short-term loudness values (for LRA)
    this.maxHistory = 54000;  // 90 min at 10 Hz — cap so a left-open tab can't grow unbounded

    // True peak + correlation accumulators (reset each post).
    this.tp = 0;
    this.prev = [[0, 0, 0], [0, 0, 0]]; // last 3 samples per channel for Hermite interpolation
    this.corrLR = 0; this.corrLL = 0; this.corrRR = 0;

    this.sincePost = 0;
    this.postEvery = Math.round(sr / 10); // 10 Hz UI feed

    // Goniometer feed: raw L/R pairs decimated ~64:1, up to 256 pairs per post.
    this.xy = [];
    this.xySkip = 0;

    this.port.onmessage = (e) => {
      if (e.data && e.data.cmd === 'reset') {
        this.blocks = []; this.stHistory = []; this.subs = [];
        this.subAcc = 0; this.subCount = 0; this.tp = 0;
      }
    };
  }

  shelfCoeffs(sr, f0, gainDb, Q) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = (2 * Math.PI * f0) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const c = Math.cos(w0), s = 2 * Math.sqrt(A) * alpha;
    const b0 = A * ((A + 1) + (A - 1) * c + s);
    const b1 = -2 * A * ((A - 1) + (A + 1) * c);
    const b2 = A * ((A + 1) + (A - 1) * c - s);
    const a0 = (A + 1) - (A - 1) * c + s;
    const a1 = 2 * ((A - 1) - (A + 1) * c);
    const a2 = (A + 1) - (A - 1) * c - s;
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  highpassCoeffs(sr, f0, Q) {
    const w0 = (2 * Math.PI * f0) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const c = Math.cos(w0);
    const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = (1 + c) / 2;
    const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }

  // Transposed direct form II biquad, one sample.
  biquad(x, k, z) {
    const y = k[0] * x + z[0];
    z[0] = k[1] * x - k[3] * y + z[1];
    z[1] = k[2] * x - k[4] * y;
    return y;
  }

  msToLufs(ms) { return ms > 1e-12 ? -0.691 + 10 * Math.log10(ms) : -Infinity; }

  windowLufs(nSubs) {
    const n = Math.min(nSubs, this.subs.length);
    if (n === 0) return -Infinity;
    let sum = 0;
    for (let i = this.subs.length - n; i < this.subs.length; i++) sum += this.subs[i];
    return this.msToLufs(sum / n);
  }

  integrated() {
    if (this.blocks.length === 0) return -Infinity;
    // Absolute gate at −70 LKFS.
    const absMs = Math.pow(10, (-70 + 0.691) / 10);
    let sum = 0, n = 0;
    for (const b of this.blocks) if (b >= absMs) { sum += b; n++; }
    if (n === 0) return -Infinity;
    // Relative gate 10 LU under the abs-gated mean.
    const relMs = (sum / n) * Math.pow(10, -1);
    let sum2 = 0, n2 = 0;
    for (const b of this.blocks) if (b >= absMs && b >= relMs) { sum2 += b; n2++; }
    return n2 ? this.msToLufs(sum2 / n2) : -Infinity;
  }

  lra() {
    // EBU Tech 3342: distribution of short-term values, abs gate −70, rel gate −20 LU.
    const vals = this.stHistory.filter((v) => v > -70);
    if (vals.length < 10) return 0;
    let sumMs = 0;
    for (const v of vals) sumMs += Math.pow(10, (v + 0.691) / 10);
    const relThresh = this.msToLufs(sumMs / vals.length) - 20;
    const gated = vals.filter((v) => v >= relThresh).sort((a, b) => a - b);
    if (gated.length < 10) return 0;
    const q = (p) => gated[Math.min(gated.length - 1, Math.floor(p * (gated.length - 1)))];
    return Math.max(0, q(0.95) - q(0.10));
  }

  // 4× true-peak estimate: cubic Hermite through the last 4 samples, 3 interpolated points each.
  truePeakScan(ch, buf) {
    const p = this.prev[ch];
    let tp = this.tp;
    let x0 = p[0], x1 = p[1], x2 = p[2];
    for (let i = 0; i < buf.length; i++) {
      const x3 = buf[i];
      const a1 = Math.abs(x2); if (a1 > tp) tp = a1;
      for (let t = 1; t < 4; t++) {
        const u = t / 4;
        // Catmull-Rom between x1(u=0)…x2(u=1)
        const y = 0.5 * ((2 * x1) + (-x0 + x2) * u + (2 * x0 - 5 * x1 + 4 * x2 - x3) * u * u + (-x0 + 3 * x1 - 3 * x2 + x3) * u * u * u);
        const ay = Math.abs(y); if (ay > tp) tp = ay;
      }
      x0 = x1; x1 = x2; x2 = x3;
    }
    p[0] = x0; p[1] = x1; p[2] = x2;
    this.tp = tp;
  }

  process(inputs) {
    const inp = inputs[0];
    if (!inp || inp.length === 0 || !inp[0]) return true;
    const L = inp[0];
    const R = inp[1] || inp[0];
    const n = L.length;

    this.truePeakScan(0, L);
    this.truePeakScan(1, R);

    for (let i = 0; i < n; i++) {
      const l = L[i], r = R[i];
      this.corrLR += l * r; this.corrLL += l * l; this.corrRR += r * r;
      if (++this.xySkip >= 64) { this.xySkip = 0; if (this.xy.length < 512) { this.xy.push(l, r); } }
      const kl = this.biquad(this.biquad(l, this.stage1, this.f1[0]), this.stage2, this.f2[0]);
      const kr = this.biquad(this.biquad(r, this.stage1, this.f1[1]), this.stage2, this.f2[1]);
      this.subAcc += kl * kl + kr * kr;
      this.subCount++;
      if (this.subCount >= this.subLen) {
        // Channel weights are 1.0 for stereo — the sub-block mean square is Σ/N per channel, summed.
        this.subs.push(this.subAcc / this.subCount);
        if (this.subs.length > 30) this.subs.shift();
        this.subAcc = 0; this.subCount = 0;
        // Every 100 ms hop, close a 400 ms gating block (last 4 subs) and a short-term value.
        if (this.subs.length >= 4) {
          let ms4 = 0;
          for (let j = this.subs.length - 4; j < this.subs.length; j++) ms4 += this.subs[j];
          this.blocks.push(ms4 / 4);
          if (this.blocks.length > this.maxHistory) this.blocks.shift();
        }
        if (this.subs.length >= 30) {
          this.stHistory.push(this.windowLufs(30));
          if (this.stHistory.length > this.maxHistory) this.stHistory.shift();
        }
      }
    }

    this.sincePost += n;
    if (this.sincePost >= this.postEvery) {
      this.sincePost = 0;
      const denom = Math.sqrt(this.corrLL * this.corrRR);
      const corr = denom > 1e-9 ? this.corrLR / denom : 1;
      this.port.postMessage({
        m: this.windowLufs(4),
        s: this.windowLufs(30),
        i: this.integrated(),
        lra: this.lra(),
        tp: this.tp > 1e-9 ? 20 * Math.log10(this.tp) : -Infinity,
        corr,
        xy: this.xy,
      });
      this.xy = [];
      this.corrLR = 0; this.corrLL = 0; this.corrRR = 0;
      // True peak is max-hold across the session (reset clears it) — that's what a ceiling check needs.
    }
    return true;
  }
}

registerProcessor('beats-loudness', LoudnessProcessor);
