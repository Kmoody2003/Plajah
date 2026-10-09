// Signal analysis for verifying synthesised audio WITHOUT listening: peak, RMS, duration, spectral centroid, NaN/Infinity checks, WAV
// encoding and a spectrogram. DOM-free (the spectrogram returns numbers; callers draw them), so it runs in Node and in the browser.

export interface SignalStats {
  peak: number;
  peakDb: number;
  /** RMS over the whole buffer */
  rms: number;
  /** RMS over the active region (first to last sample above the floor): the loudness you actually hear */
  rmsActive: number;
  rmsActiveDb: number;
  hasNaN: boolean;
  /** end of the audible part: last sample above `floor`, seconds */
  durationSec: number;
  activeStartSec: number;
  /** magnitude-weighted mean frequency of the active region, Hz */
  centroidHz: number;
  crest: number;
  silent: boolean;
}

const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));

export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len; const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Mean magnitude spectrum (Hann-windowed frames) of samples[from..to). */
export function meanSpectrum(x: Float32Array, from: number, to: number, size = 2048): Float32Array {
  const bins = size / 2; const acc = new Float32Array(bins);
  const win = new Float32Array(size); for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const re = new Float32Array(size), im = new Float32Array(size);
  let frames = 0;
  const hop = size / 2;
  for (let s = from; s + size <= Math.max(to, from + size); s += hop) {
    for (let i = 0; i < size; i++) { re[i] = (x[s + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < bins; k++) acc[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  if (frames) for (let k = 0; k < bins; k++) acc[k] /= frames;
  return acc;
}

export function spectralCentroid(x: Float32Array, sr: number, from = 0, to = x.length, size = 2048): number {
  const spec = meanSpectrum(x, from, to, size);
  let num = 0, den = 0;
  for (let k = 1; k < spec.length; k++) { const f = (k * sr) / size; num += f * spec[k]; den += spec[k]; }
  return den > 0 ? num / den : 0;
}

export function analyse(x: Float32Array, sr: number, o: { floor?: number } = {}): SignalStats {
  const floor = o.floor ?? 0.001;                                   // -60 dBFS
  let peak = 0, sum = 0, hasNaN = false, first = -1, last = -1;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) { hasNaN = true; continue; }
    const a = Math.abs(v); if (a > peak) peak = a; sum += v * v;
    if (a > floor) { if (first < 0) first = i; last = i; }
  }
  const rms = Math.sqrt(sum / Math.max(1, x.length));
  let aSum = 0; const n = first < 0 ? 0 : last - first + 1;
  for (let i = first; i >= 0 && i <= last; i++) { const v = Number.isFinite(x[i]) ? x[i] : 0; aSum += v * v; }
  const rmsActive = n ? Math.sqrt(aSum / n) : 0;
  const silent = first < 0;
  return {
    peak, peakDb: db(peak), rms, rmsActive, rmsActiveDb: db(rmsActive), hasNaN,
    durationSec: silent ? 0 : (last + 1) / sr, activeStartSec: silent ? 0 : first / sr,
    centroidHz: silent ? 0 : spectralCentroid(x, sr, first, last + 1), crest: rmsActive > 0 ? peak / rmsActive : 0, silent,
  };
}

export function hashSamples(x: Float32Array): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < x.length; i += 7) { h ^= Math.round(x[i] * 32767) & 0xffff; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

/** 2:1 decimation with a 3-tap smoothing filter (good enough for the saved audition WAVs). */
export function downsample2(x: Float32Array): Float32Array {
  const out = new Float32Array(Math.floor(x.length / 2));
  for (let i = 0; i < out.length; i++) { const j = i * 2; out[i] = 0.25 * (x[j - 1] ?? x[j]) + 0.5 * x[j] + 0.25 * (x[j + 1] ?? x[j]); }
  return out;
}

/** Mono 16-bit PCM WAV. */
export function encodeWav16(x: Float32Array, sr: number): Uint8Array {
  const n = x.length; const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round((Number.isFinite(x[i]) ? x[i] : 0) * 32767))), true);
  return new Uint8Array(buf);
}

export interface Spectrogram { frames: number; bins: number; maxHz: number; /** dB, frames*bins, row-major by frame */ db: Float32Array }
export function spectrogram(x: Float32Array, sr: number, o: { size?: number; hop?: number; maxHz?: number; from?: number; to?: number } = {}): Spectrogram {
  const size = o.size ?? 1024, hop = o.hop ?? 512, maxHz = Math.min(o.maxHz ?? 12000, sr / 2);
  const from = o.from ?? 0, to = o.to ?? x.length;
  const bins = Math.floor((maxHz / (sr / 2)) * (size / 2));
  const frames = Math.max(1, Math.floor((to - from - size) / hop) + 1);
  const outDb = new Float32Array(frames * bins);
  const win = new Float32Array(size); for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const re = new Float32Array(size), im = new Float32Array(size);
  for (let f = 0; f < frames; f++) {
    const s = from + f * hop;
    for (let i = 0; i < size; i++) { re[i] = (x[s + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < bins; k++) outDb[f * bins + k] = db((Math.hypot(re[k], im[k]) * 2) / size);
  }
  return { frames, bins, maxHz, db: outDb };
}
