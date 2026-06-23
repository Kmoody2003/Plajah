// offlineAudio.ts — deterministic, sample-accurate audio analysis for the offline
// renderer. Given a decoded AudioBuffer, sample(t) returns the frequency + waveform
// byte arrays for the exact playback position t, in the SAME format the live
// AnalyserNode produces (getByteFrequencyData / getByteTimeDomainData) — so the
// generators' AudioTexture reacts identically whether live or rendered, but here
// it's a pure function of t (no wall clock), which is what makes the render
// frame/beat/sample-accurate.

// Match the WebAudio AnalyserNode defaults so reactivity looks the same as preview.
const MIN_DB = -100;
const MAX_DB = -30;

/** In-place iterative radix-2 Cooley–Tukey FFT (re/im interleaved as two arrays). */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlr = Math.cos(ang), wli = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = nwr;
      }
    }
  }
}

export class OfflineAudio {
  readonly duration: number;
  readonly sampleRate: number;
  private mono: Float32Array;
  // Scratch buffers reused per sample() call (no per-frame allocation).
  private re: Float32Array;
  private im: Float32Array;
  private win: Float32Array;
  private freqOut: Uint8Array;
  private waveOut: Uint8Array;
  private smoothed: Float32Array; // light EMA across frames for stable bars

  constructor(buffer: AudioBuffer, private fftSize = 2048) {
    this.duration = buffer.duration;
    this.sampleRate = buffer.sampleRate;
    // Downmix to mono once.
    const n = buffer.length, chs = buffer.numberOfChannels;
    const mono = new Float32Array(n);
    for (let c = 0; c < chs; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / chs;
    }
    this.mono = mono;
    this.re = new Float32Array(fftSize);
    this.im = new Float32Array(fftSize);
    this.win = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)); // Hann
    this.freqOut = new Uint8Array(fftSize / 2);
    this.waveOut = new Uint8Array(fftSize);
    this.smoothed = new Float32Array(fftSize / 2);
  }

  /** Frequency (length fftSize/2) + waveform (length fftSize) bytes at time t. */
  sample(t: number): { freq: Uint8Array; wave: Uint8Array } {
    const { fftSize, mono, re, im, win, freqOut, waveOut, smoothed } = this;
    const start = Math.round(t * this.sampleRate) - (fftSize >> 1); // window centered on t
    for (let i = 0; i < fftSize; i++) {
      const s = start + i;
      const v = s >= 0 && s < mono.length ? mono[s] : 0;
      re[i] = v * win[i];
      im[i] = 0;
      // Waveform row (un-windowed): byte = 128 + sample*128, like getByteTimeDomainData.
      const wv = s >= 0 && s < mono.length ? mono[s] : 0;
      waveOut[i] = Math.max(0, Math.min(255, (wv * 128 + 128) | 0));
    }
    fft(re, im);
    const half = fftSize >> 1;
    const norm = 2 / fftSize; // single-sided magnitude normalization
    for (let k = 0; k < half; k++) {
      const mag = Math.hypot(re[k], im[k]) * norm;
      const db = 20 * Math.log10(mag + 1e-9);
      // EMA smoothing 0.6 (analyser default is 0.8; lighter keeps transients crisp).
      smoothed[k] = smoothed[k] * 0.6 + db * 0.4;
      const norm01 = (smoothed[k] - MIN_DB) / (MAX_DB - MIN_DB);
      freqOut[k] = Math.max(0, Math.min(255, (norm01 * 255) | 0));
    }
    return { freq: freqOut, wave: waveOut };
  }

  /** Encode the mono mix to interleaved channels for AudioEncoder (planar f32). */
  get monoData(): Float32Array { return this.mono; }
}
