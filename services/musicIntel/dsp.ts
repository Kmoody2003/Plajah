// Music Intelligence — measured audio facts.
//
// Everything here is plain DSP over decoded PCM (ffmpeg → f32le), no models: loudness per
// ITU-R BS.1770 (K-weighted, gated), loudness range, sample peak, crest factor, stereo width
// and correlation, spectral balance, tempo (spectral-flux onset autocorrelation), key
// (chroma × Krumhansl-Schmuckler profiles), an energy curve and novelty-based section
// boundaries. The listening model is handed these numbers as ground truth, so the commentary
// is anchored to what the audio actually measures — never invented.
//
// Pure + dependency-free so it runs in the API container and in tests alike.

import type { MeasuredAudio, MeasuredSection } from './types';

const PITCHES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Krumhansl-Kessler key profiles.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// ─── Small helpers ───────────────────────────────────────────────────────────

const round = (x: number, d = 1) => { const p = 10 ** d; return Math.round(x * p) / p; };
const db = (x: number) => (x > 0 ? 10 * Math.log10(x) : -Infinity);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// ─── Loudness (BS.1770) ──────────────────────────────────────────────────────

/** Biquad coefficients for the two K-weighting stages at any sample rate (pyloudnorm's derivation). */
function kWeightingStages(fs: number): { b: number[]; a: number[] }[] {
  // Stage 1: high shelf (+4 dB above ~1.7 kHz, the head's acoustic effect).
  {
    var G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.974450955533;
    var A = 10 ** (G / 40), w0 = (2 * Math.PI * fc) / fs, alpha = Math.sin(w0) / (2 * Q), c = Math.cos(w0);
    var shelf = {
      b: [A * ((A + 1) + (A - 1) * c + 2 * Math.sqrt(A) * alpha), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * Math.sqrt(A) * alpha)],
      a: [(A + 1) - (A - 1) * c + 2 * Math.sqrt(A) * alpha, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * Math.sqrt(A) * alpha],
    };
  }
  // Stage 2: RLB high-pass (~38 Hz).
  const Q2 = 0.5003270373238773, fc2 = 38.13547087602444;
  const w2 = (2 * Math.PI * fc2) / fs, al2 = Math.sin(w2) / (2 * Q2), c2 = Math.cos(w2);
  const hp = { b: [(1 + c2) / 2, -(1 + c2), (1 + c2) / 2], a: [1 + al2, -2 * c2, 1 - al2] };
  const norm = (f: { b: number[]; a: number[] }) => ({ b: f.b.map(x => x / f.a[0]), a: f.a.map(x => x / f.a[0]) });
  return [norm(shelf), norm(hp)];
}

function biquad(x: Float32Array, f: { b: number[]; a: number[] }): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const [b0, b1, b2] = f.b, [, a1, a2] = f.a;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Mean-square of K-weighted channels summed, over windows of `winSec` stepping `hopSec`. */
function blockPowers(chans: Float32Array[], fs: number, winSec: number, hopSec: number): number[] {
  const win = Math.round(winSec * fs), hop = Math.round(hopSec * fs);
  const n = chans[0].length;
  const out: number[] = [];
  // Prefix sums of squares make every window O(1).
  const pref = chans.map(ch => {
    const p = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) p[i + 1] = p[i] + ch[i] * ch[i];
    return p;
  });
  for (let s = 0; s + win <= n; s += hop) {
    let z = 0;
    for (const p of pref) z += (p[s + win] - p[s]) / win;
    out.push(z);
  }
  return out;
}

const lufs = (power: number) => -0.691 + db(power);

function gatedLoudness(powers: number[], relGateLU: number): number {
  const abs = powers.filter(z => lufs(z) > -70);
  if (!abs.length) return -Infinity;
  const relGate = lufs(abs.reduce((s, z) => s + z, 0) / abs.length) + relGateLU;
  const kept = abs.filter(z => lufs(z) > relGate);
  return kept.length ? lufs(kept.reduce((s, z) => s + z, 0) / kept.length) : -Infinity;
}

// ─── Spectral frames ─────────────────────────────────────────────────────────

interface Frames {
  hopSec: number;
  /** Per-frame magnitude spectra (bins 0..N/2). */
  mags: Float32Array[];
  binHz: number;
}

function stft(x: Float32Array, fs: number, n: number, hop: number, maxFrames = Infinity): Frames {
  const w = hann(n);
  const re = new Float64Array(n), im = new Float64Array(n);
  const mags: Float32Array[] = [];
  for (let s = 0; s + n <= x.length && mags.length < maxFrames; s += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const m = new Float32Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k++) m[k] = Math.hypot(re[k], im[k]);
    mags.push(m);
  }
  return { hopSec: hop / fs, mags, binHz: fs / n };
}

// ─── Tempo ───────────────────────────────────────────────────────────────────

/** Spectral-flux onset envelope → autocorrelation, with a mild preference for 80–160 BPM. */
export function estimateTempo(onset: number[], hopSec: number): { bpm: number; confidence: number } {
  if (onset.length < 64) return { bpm: 0, confidence: 0 };
  const mean = onset.reduce((s, v) => s + v, 0) / onset.length;
  const o = onset.map(v => Math.max(0, v - mean));
  const lagFor = (bpm: number) => 60 / bpm / hopSec;
  const minLag = Math.floor(lagFor(200)), maxLag = Math.ceil(lagFor(55));
  const ac: number[] = [];
  let zero = 0;
  for (let i = 0; i < o.length; i++) zero += o[i] * o[i];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < o.length; i++) s += o[i] * o[i + lag];
    ac.push(s / (o.length - lag));
  }
  let best = -1, bestScore = -Infinity, total = 0;
  for (let i = 0; i < ac.length; i++) {
    const lag = minLag + i;
    const bpm = 60 / (lag * hopSec);
    // Log-gaussian prior centred on 120 BPM: breaks half/double-time ties toward the felt pulse.
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = ac[i] * prior;
    total += Math.max(0, ac[i]);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) return { bpm: 0, confidence: 0 };
  // Parabolic refinement of the peak lag.
  const y0 = ac[best - 1] ?? ac[best], y1 = ac[best], y2 = ac[best + 1] ?? ac[best];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom ? 0.5 * (y0 - y2) / denom : 0;
  const lag = minLag + best + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = 60 / (lag * hopSec);
  const meanAc = total / ac.length || 1;
  const confidence = Math.max(0, Math.min(1, (y1 / meanAc - 1) / 3));
  return { bpm: round(bpm, 1), confidence: round(confidence, 2) };
}

// ─── Key ─────────────────────────────────────────────────────────────────────

function chromaOf(mag: Float32Array, binHz: number, out: Float64Array): void {
  for (let k = 1; k < mag.length; k++) {
    const f = k * binHz;
    if (f < 80 || f > 2500) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    // Log-compressed: power weighting lets a heavy bass line outvote the harmony above it.
    out[pc] += Math.log1p(mag[k]);
  }
}

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, dbb = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; dbb += (b[i] - mb) ** 2; }
  return da && dbb ? num / Math.sqrt(da * dbb) : 0;
}

export function estimateKey(chroma: number[]): { key: string; mode: 'major' | 'minor'; confidence: number; alternate: string } {
  const scores: { name: string; mode: 'major' | 'minor'; r: number }[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = chroma.map((_, i) => chroma[(i + t) % 12]);
    scores.push({ name: `${PITCHES[t]} major`, mode: 'major', r: corr(rot, MAJOR) });
    scores.push({ name: `${PITCHES[t]} minor`, mode: 'minor', r: corr(rot, MINOR) });
  }
  scores.sort((a, b) => b.r - a.r);
  const [a, b] = scores;
  // Confidence: how well the best profile fits, scaled by its margin over the runner-up (a relative
  // or parallel key that fits almost as well means the read is genuinely ambiguous).
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  return { key: a.name, mode: a.mode, confidence: round(clamp(a.r) * clamp((a.r - b.r) * 4), 2), alternate: b.name };
}

// ─── Sections (novelty on a self-similarity matrix) ──────────────────────────

function sectionBoundaries(feats: number[][], segSec: number, durationSec: number): MeasuredSection[] {
  const n = feats.length;
  if (n < 8) return [{ startSec: 0, endSec: round(durationSec), label: 'A', energy: 1 }];
  const norm = feats.map(f => { const m = Math.hypot(...f) || 1; return f.map(v => v / m); });
  const sim = (i: number, j: number) => norm[i].reduce((s, v, k) => s + v * norm[j][k], 0);
  const K = Math.min(8, Math.floor(n / 4)); // checkerboard half-width in segments
  const nov: number[] = new Array(n).fill(0);
  for (let c = K; c < n - K; c++) {
    let s = 0;
    for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
      const sign = (i < 0) === (j < 0) ? 1 : -1;
      s += sign * sim(c + i, c + j);
    }
    nov[c] = Math.max(0, s);
  }
  const minGap = Math.max(3, Math.round(12 / segSec));
  const sortedNov = [...nov].sort((a, b) => a - b);
  const thresh = percentile(sortedNov, 70);
  const peaks: number[] = [];
  const order = nov.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [v, i] of order) {
    if (v <= thresh || peaks.length >= 11) break;
    if (peaks.every(p => Math.abs(p - i) >= minGap)) peaks.push(i);
  }
  const cuts = [0, ...peaks.sort((a, b) => a - b), n];
  // Average feature per section, then letter-label by similarity (A, B, A′ …).
  const sections: MeasuredSection[] = [];
  const means: number[][] = [];
  const labels: string[] = [];
  for (let s = 0; s < cuts.length - 1; s++) {
    const a = cuts[s], b = cuts[s + 1];
    const mean = new Array(feats[0].length).fill(0);
    for (let i = a; i < b; i++) feats[i].forEach((v, k) => { mean[k] += v / (b - a); });
    means.push(mean);
    let label = '';
    for (let p = 0; p < s; p++) {
      const r = corr(mean.slice(0, 12), means[p].slice(0, 12));
      if (r > 0.9) { label = labels[p]; break; }
    }
    if (!label) label = String.fromCharCode(65 + new Set(labels).size);
    labels.push(label);
    sections.push({ startSec: round(a * segSec), endSec: round(Math.min(durationSec, b * segSec)), label, energy: 0 });
  }
  const energies = means.map(m => m[12]);
  const lo = Math.min(...energies), hi = Math.max(...energies);
  sections.forEach((s, i) => { s.energy = round(hi > lo ? (energies[i] - lo) / (hi - lo) : 1, 2); });
  return sections;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Measure interleaved stereo (or mono) f32 PCM. `channels` is 1 or 2.
 * Long files are fine: the expensive spectral passes are bounded.
 */
export function measureAudio(pcm: Float32Array, fs: number, channels: 1 | 2): MeasuredAudio {
  const frames = Math.floor(pcm.length / channels);
  const L = new Float32Array(frames), R = new Float32Array(frames), M = new Float32Array(frames);
  let peak = 0, sumSq = 0, sMid = 0, sSide = 0, sLR = 0, sLL = 0, sRR = 0;
  for (let i = 0; i < frames; i++) {
    const l = pcm[i * channels], r = channels === 2 ? pcm[i * channels + 1] : l;
    L[i] = l; R[i] = r; M[i] = (l + r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sumSq += (l * l + r * r) / 2;
    const mid = (l + r) / 2, side = (l - r) / 2;
    sMid += mid * mid; sSide += side * side;
    sLR += l * r; sLL += l * l; sRR += r * r;
  }
  const durationSec = frames / fs;
  const rms = Math.sqrt(sumSq / Math.max(1, frames));

  // Loudness: integrated (400 ms / 75 % overlap, −10 LU gate), short-term (3 s) for LRA + curve.
  const stages = kWeightingStages(fs);
  const kw = [L, R].slice(0, channels).map(ch => stages.reduce((x, f) => biquad(x, f), ch));
  const integrated = gatedLoudness(blockPowers(kw, fs, 0.4, 0.1), -10);
  const shortTerm = blockPowers(kw, fs, 3, 1).map(lufs);
  const stGated = shortTerm.filter(v => v > -70);
  const stRel = stGated.length ? gatedLoudness(blockPowers(kw, fs, 3, 1), -20) : -Infinity;
  const lraPool = stGated.filter(v => v > stRel - 0).sort((a, b) => a - b);
  const lra = lraPool.length > 4 ? percentile(lraPool, 95) - percentile(lraPool, 10) : 0;

  // Energy curve: short-term loudness, normalised 0..1, at most 120 points.
  const step = Math.max(1, Math.ceil(shortTerm.length / 120));
  const curve: number[] = [];
  const finite = shortTerm.filter(Number.isFinite);
  const cLo = finite.length ? Math.max(Math.min(...finite), (integrated || -40) - 25) : -60;
  const cHi = finite.length ? Math.max(...finite) : 0;
  for (let i = 0; i < shortTerm.length; i += step) {
    const v = shortTerm.slice(i, i + step).filter(Number.isFinite);
    const m = v.length ? v.reduce((s, x) => s + x, 0) / v.length : cLo;
    curve.push(round(cHi > cLo ? Math.max(0, Math.min(1, (m - cLo) / (cHi - cLo))) : 0, 2));
  }

  // Spectra: 2048-pt frames, hop 512 (~23 ms at 22.05 kHz), at most ~12 minutes.
  const N = 2048, HOP = 512;
  const sp = stft(M, fs, N, HOP, Math.ceil((12 * 60 * fs) / HOP));
  const onset: number[] = [];
  const bands = { sub: 0, low: 0, lowMid: 0, highMid: 0, presence: 0, air: 0 };
  const chroma = new Float64Array(12);
  let centroidSum = 0, centroidW = 0;
  for (let f = 0; f < sp.mags.length; f++) {
    const m = sp.mags[f], prev = sp.mags[f - 1];
    let flux = 0;
    for (let k = 1; k < m.length; k++) {
      const hz = k * sp.binHz, p = m[k] * m[k];
      if (prev) flux += Math.max(0, Math.log1p(m[k]) - Math.log1p(prev[k]));
      if (hz < 60) bands.sub += p;
      else if (hz < 250) bands.low += p;
      else if (hz < 2000) bands.lowMid += p;
      else if (hz < 4000) bands.highMid += p;
      else if (hz < 8000) bands.presence += p;
      else bands.air += p;
      centroidSum += hz * m[k]; centroidW += m[k];
    }
    onset.push(flux);
    chromaOf(m, sp.binHz, chroma);
  }
  const bandTotal = Object.values(bands).reduce((s, v) => s + v, 0) || 1;
  const spectralBalance = Object.fromEntries(
    Object.entries(bands).map(([k, v]) => [k, round((100 * v) / bandTotal, 1)]),
  ) as MeasuredAudio['spectralBalance'];

  const tempo = estimateTempo(onset, sp.hopSec);
  const chromaArr = Array.from(chroma);
  const chromaMax = Math.max(...chromaArr) || 1;
  const key = estimateKey(chromaArr);

  // Section features: per ~2 s, 12 chroma + loudness, from the same frames.
  const segFrames = Math.max(1, Math.round(2 / sp.hopSec));
  const feats: number[][] = [];
  for (let s = 0; s < sp.mags.length; s += segFrames) {
    const c = new Float64Array(12);
    let e = 0;
    for (let f = s; f < Math.min(sp.mags.length, s + segFrames); f++) {
      chromaOf(sp.mags[f], sp.binHz, c);
      for (let k = 1; k < sp.mags[f].length; k++) e += sp.mags[f][k] * sp.mags[f][k];
    }
    const cm = Math.max(...c) || 1;
    feats.push([...Array.from(c).map(v => v / cm), Math.log1p(e)]);
  }
  const sections = sectionBoundaries(feats, segFrames * sp.hopSec, durationSec);

  const correlation = sLL && sRR ? sLR / Math.sqrt(sLL * sRR) : 1;
  return {
    durationSec: round(durationSec),
    sampleRate: fs,
    channels,
    integratedLufs: Number.isFinite(integrated) ? round(integrated) : null,
    loudnessRangeLu: round(lra),
    samplePeakDbfs: round(db(peak * peak)),
    crestFactorDb: rms > 0 ? round(20 * Math.log10(peak / rms)) : null,
    stereo: channels === 2
      ? { width: round(sMid ? Math.sqrt(sSide / sMid) : 0, 2), correlation: round(correlation, 2) }
      : null,
    spectralBalance,
    brightnessHz: centroidW ? Math.round(centroidSum / centroidW) : null,
    tempo,
    key: { ...key, chroma: chromaArr.map(v => round(v / chromaMax, 2)) },
    energyCurve: curve,
    energyCurveStepSec: step,
    sections,
  };
}
