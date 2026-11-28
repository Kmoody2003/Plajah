// Audio sync — the Resolve/Premiere baseline, made robust for long programs.
//
// Two passes over loudness envelopes:
//   coarse  50 ms steps, FFT cross-correlation over the WHOLE take (any lag, hours long)
//   fine    5 ms steps, direct correlation in ±0.6 s around the coarse peak
// The envelope is log-energy with its onsets emphasised, so speech, music and room tone all carry it —
// no clap needed. The score is a normalised correlation; the margin compares the peak with the best
// peak at least 1.5 s away, which is what catches a repeated chorus locking onto the wrong bar.

import type { SyncCandidate } from './types';

export const COARSE_HOP = 0.05;
export const FINE_HOP = 0.005;

/** Log-energy envelope at `hop` seconds from mono PCM. */
export function envelope(pcm: Float32Array, rate: number, hop: number): Float32Array {
  const step = Math.max(1, Math.round(rate * hop));
  const n = Math.floor(pcm.length / step);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0; const o = i * step;
    for (let k = 0; k < step; k++) { const x = pcm[o + k]; s += x * x; }
    e[i] = Math.log(1e-7 + s / step);
  }
  return e;
}

/** Envelope → correlation feature: standardised log energy plus 2× its rises. */
export function feature(env: Float32Array): Float32Array {
  const n = env.length, f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = env[i] + 2 * (i ? Math.max(0, env[i] - env[i - 1]) : 0);
  let m = 0; for (let i = 0; i < n; i++) m += f[i]; m /= n || 1;
  let v = 0; for (let i = 0; i < n; i++) { f[i] -= m; v += f[i] * f[i]; }
  const sd = Math.sqrt(v / (n || 1)) || 1;
  for (let i = 0; i < n; i++) f[i] /= sd;
  return f;
}

// ── FFT (iterative radix-2, in place) ───────────────────────────────────────────────────────────────────
function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inverse ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Full cross-correlation of master `a` against angle `b`: r[lag] = Σ a[i] · b[i − lag].
 * Returned lags run −(b.length−1) … a.length−1 (in samples). Each value is normalised by the overlap,
 * so a short overlap at the edges can't win on luck alone (overlaps under `minOverlap` score 0).
 */
export function xcorr(a: Float32Array, b: Float32Array, minOverlap: number): { lags: Int32Array; r: Float32Array } {
  const L = a.length + b.length - 1;
  let n = 1; while (n < L) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(a); br.set(b);
  fft(ar, ai, false); fft(br, bi, false);
  // A · conj(B)
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] + ai[i] * bi[i]; const im = ai[i] * br[i] - ar[i] * bi[i]; ar[i] = r; ai[i] = im; }
  fft(ar, ai, true);
  const lags = new Int32Array(L), r = new Float32Array(L);
  for (let k = 0; k < L; k++) {
    const lag = k - (b.length - 1);
    const idx = lag >= 0 ? lag : n + lag;
    const overlap = Math.min(a.length, lag + b.length) - Math.max(0, lag);
    lags[k] = lag;
    r[k] = overlap >= minOverlap ? ar[idx] / overlap : 0;
  }
  return { lags, r };
}

/** Best lag with its score and the margin over the best peak at least `exclude` samples away. */
export function peak(lags: Int32Array, r: Float32Array, exclude: number): { lag: number; score: number; margin: number; second: number } {
  let bi = 0; for (let i = 1; i < r.length; i++) if (r[i] > r[bi]) bi = i;
  let s2 = -Infinity;
  for (let i = 0; i < r.length; i++) if (Math.abs(i - bi) > exclude && r[i] > s2) s2 = r[i];
  const score = r[bi];
  return { lag: lags[bi], score, margin: s2 > 0 ? score / s2 : score > 0 ? 99 : 0, second: s2 };
}

/** Direct correlation in a small window (fine pass). Lag in samples of the fine feature. */
function localBest(a: Float32Array, b: Float32Array, center: number, radius: number) {
  let best = center, bs = -Infinity;
  const score = (lag: number) => {
    const lo = Math.max(0, lag), hi = Math.min(a.length, lag + b.length);
    if (hi - lo < 200) return -Infinity;
    let s = 0; for (let i = lo; i < hi; i++) s += a[i] * b[i - lag];
    return s / (hi - lo);
  };
  const vals = new Map<number, number>();
  for (let lag = center - radius; lag <= center + radius; lag++) { const s = score(lag); vals.set(lag, s); if (s > bs) { bs = s; best = lag; } }
  // Parabolic refinement for sub-step precision.
  const y0 = vals.get(best - 1), y2 = vals.get(best + 1);
  let sub = 0;
  if (y0 !== undefined && y2 !== undefined && Number.isFinite(y0) && Number.isFinite(y2)) {
    const d = y0 - 2 * bs + y2; if (d < 0) sub = 0.5 * (y0 - y2) / d;
  }
  return { lag: best + Math.max(-0.5, Math.min(0.5, sub)), score: bs };
}

/**
 * Align angle PCM to master PCM (same sample rate, mono). Returns lag in seconds (t_master = t_angle + lag),
 * or null when there isn't enough sound to say.
 */
export function alignAudio(master: Float32Array, angle: Float32Array, rate: number): SyncCandidate | null {
  if (master.length < rate * 4 || angle.length < rate * 4) return null;
  const ca = feature(envelope(master, rate, COARSE_HOP)), cb = feature(envelope(angle, rate, COARSE_HOP));
  const minOverlap = Math.min(ca.length, cb.length, Math.round(20 / COARSE_HOP)) * 0.5; // ≥ 10 s or half the shorter take
  const { lags, r } = xcorr(ca, cb, minOverlap);
  const p = peak(lags, r, Math.round(1.5 / COARSE_HOP));
  if (!(p.score > 0.05)) return null;
  const coarseLag = p.lag * COARSE_HOP;
  // Fine pass on 5 ms features, limited to the overlap region for speed.
  const fa = feature(envelope(master, rate, FINE_HOP)), fb = feature(envelope(angle, rate, FINE_HOP));
  const fine = localBest(fa, fb, Math.round(coarseLag / FINE_HOP), Math.round(0.6 / FINE_HOP));
  const lag = Number.isFinite(fine.score) ? fine.lag * FINE_HOP : coarseLag;
  // Confidence: correlation strength × how clearly it beats the runner-up.
  const conf = Math.max(0, Math.min(1, (Math.min(p.score, 0.6) / 0.6) * Math.min(1, (p.margin - 1) / 0.35)));
  return { method: 'audio', lag, confidence: conf, note: `r=${p.score.toFixed(2)} ×${p.margin.toFixed(2)} over runner-up` };
}

/** Browser: decode a media URL's sound to mono PCM at `rate`. Null when it has none or can't be decoded. */
export async function decodePcm(url: string, rate: number): Promise<Float32Array | null> {
  const AC = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!AC || !url) return null;
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const ctx = new AC(1, rate, rate);
    const audio = await ctx.decodeAudioData(buf);
    if (audio.numberOfChannels === 1 && audio.sampleRate === rate) return audio.getChannelData(0);
    // Mix down / resample by rendering through the offline graph.
    const len = Math.ceil(audio.duration * rate);
    const off = new AC(1, len, rate);
    const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0);
  } catch { return null; }
}

/** Linear resample (used to feed 8 kHz probe audio to the 16 kHz recogniser). */
export function resample(pcm: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return pcm;
  const n = Math.floor(pcm.length * to / from), out = new Float32Array(n), k = from / to;
  for (let i = 0; i < n; i++) { const x = i * k, i0 = Math.floor(x), f = x - i0; out[i] = (pcm[i0] ?? 0) * (1 - f) + (pcm[i0 + 1] ?? pcm[i0] ?? 0) * f; }
  return out;
}
