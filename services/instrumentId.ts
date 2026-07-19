// ─── Timbral instrument-family ESTIMATION ────────────────────────────────────
// This is signal processing, not a trained classifier. It measures real acoustic
// descriptors (spectral centroid/rolloff/flatness, harmonic-to-noise ratio, attack
// time, even/odd harmonic balance, inharmonicity, vibrato) and scores them against
// hand-written rules describing how instrument FAMILIES physically make sound.
//
// WHY heuristics and not a model: there is no trained instrument classifier in this
// repo and none is vendored. A real MIT-licensed ONNX option does exist upstream
// (onnx-community/Musical-Instrument-Classification-ONNX, a wav2vec2 head over 9
// instrument labels) and `onnxruntime-web` is already a dependency, so it is a
// legitimate future upgrade — but its accuracy is only self-reported on its own
// small validation split, it would add a multi-hundred-MB runtime download, and its
// 9 labels do not cover our 7 families. Until someone evaluates it against real
// material, honest measured DSP beats an unevaluated black box.
//
// HONEST SCOPE — read before using this anywhere user-facing:
//   • This works on ISOLATED, largely MONOPHONIC sources: a solo take, a stem, a
//     single sample. It DEGRADES BADLY on a full mix, where several instruments
//     sum into one spectrum and no single family is the right answer.
//   • The correct answer for a mix, a chord, or an ambiguous tone is 'UNKNOWN'
//     with low confidence, and this module returns that on purpose. A confident
//     wrong label is worse than an honest shrug.
//   • Families that overlap physically also overlap here. A plucked guitar and a
//     piano note share an envelope and a harmonic structure; a sustained cello, a
//     bowed viola and a sung vowel share a great deal. Expect confusion there and
//     do not present these estimates as fact.
//   • Nothing here "identifies an instrument by AI". Call it an estimate.
//
// It exists to replace the only instrument reasoning currently shipping in the
// product — the hardcoded `n.midi < 55 ? 'bass' : 'melody'` pitch threshold in
// services/audioTranscription.ts — with something that actually looks at timbre.

import { decodeMono } from './audioBeatDetection';
import { magnitudeSpectrum } from './fft';
import type { InstrumentFamilyId } from '../data/instrumentPrimers';

export type InstrumentFamily =
  | 'STRINGS' | 'WOODWIND' | 'BRASS' | 'KEYS' | 'VOICE' | 'PERCUSSION' | 'ELECTRONIC' | 'UNKNOWN';

/** Raw measured descriptors. Exposed so callers can show their own reasoning
 *  (or disagree with ours) instead of trusting an opaque label. */
export interface TimbreFeatures {
  /** Energy-weighted mean frequency (Hz). Perceptual "brightness". */
  spectralCentroidHz: number;
  /** Centroid expressed in harmonic numbers (centroid / f0). Pitch-invariant
   *  brightness — a trumpet is bright at every pitch, which raw Hz hides. */
  centroidRatio: number;
  /** Frequency below which 85% of the energy sits (Hz). */
  spectralRolloffHz: number;
  /** Geometric mean / arithmetic mean of the spectrum, 0–1. Near 0 = tonal,
   *  toward 1 = noise. The single best pitched-vs-percussive discriminator. */
  spectralFlatness: number;
  /** Zero crossings per second — cheap corroboration of brightness/noisiness. */
  zeroCrossingRate: number;
  /** Harmonic energy vs everything else, in dB. High = clean tone, low = noisy. */
  harmonicToNoiseDb: number;
  /** 10%→90% rise time of the first strong onset, ms. Pluck/strike ≈ 5–40ms,
   *  bow/breath ≈ 60–300ms. */
  attackMs: number;
  /** Mean level of the tail vs the peak, 0–1. High = sustained (bowed/blown/held),
   *  low = struck-and-decaying (piano, plucked string, drum). */
  sustainRatio: number;
  /** Even-harmonic share of the upper partials: even/(even+odd), ignoring the
   *  fundamental. ≈0 = odd-only (square wave, clarinet's closed pipe),
   *  ≈0.5 = both present (sawtooth, brass, bowed strings). */
  evenOddRatio: number;
  /** Mean fractional deviation of measured partials from exact k·f0. Stiff strings
   *  (piano) are measurably inharmonic; synths are essentially perfect. */
  inharmonicity: number;
  /** Median detected fundamental, Hz. 0 when nothing voiced was found. */
  f0Hz: number;
  /** Spread of the f0 track in cents. Large = unstable/glissando/no real pitch. */
  f0StabilityCents: number;
  /** Detected vibrato rate (Hz) and depth (cents). Human voice and bowed strings
   *  vibrato at ~4–7Hz; most synths and struck instruments do not vibrato at all. */
  vibratoRateHz: number;
  vibratoExtentCents: number;
  /** Fraction of frames with a confident fundamental, 0–1. */
  voicedFraction: number;
  /** 0–1. Strong spectral peaks NOT explained by one f0's harmonic comb. High
   *  means chords or a full mix — i.e. the single-source assumption is violated. */
  polyphonySuspicion: number;
  rms: number;
  durationSec: number;
}

export interface InstrumentEstimate {
  family: InstrumentFamily;
  /** 0–1. Derived from the winning score AND its margin over the runner-up, then
   *  penalised for suspected polyphony. Treat <0.45 as "not worth showing". */
  confidence: number;
  features: TimbreFeatures;
  /** All families with their raw evidence scores, best first. Useful for showing
   *  "probably brass, possibly woodwind" instead of a false single answer. */
  ranking: Array<{ family: InstrumentFamily; score: number }>;
  /** Plain-language reasons, safe to surface. Never phrased as certainty. */
  reasons: string[];
}

/** Map to the synth's family vocabulary so an estimate can drive playback. */
export const FAMILY_TO_SYNTH_ID: Record<InstrumentFamily, InstrumentFamilyId | null> = {
  STRINGS: 'strings', WOODWIND: 'woodwind', BRASS: 'brass', KEYS: 'keys',
  VOICE: 'voice', PERCUSSION: 'percussion', ELECTRONIC: 'electronic', UNKNOWN: null,
};

// Analysis constants. FRAME is long enough (~46ms @44.1k) that the lowest bass
// fundamental still spans several cycles; HOP gives ~86 envelope samples/sec,
// which resolves a 40ms attack to roughly three points.
const FRAME = 2048;
const HOP = 512;
const HARMONIC_FRAME = 8192;   // long window for precise partial measurement
const MAX_HARMONICS = 20;
const MIN_DURATION_SEC = 0.25;
const SILENCE_RMS = 1e-4;
const MAX_ANALYZE_SEC = 30;    // bounded work; timbre is stationary enough

const EMPTY_FEATURES: TimbreFeatures = {
  spectralCentroidHz: 0, centroidRatio: 0, spectralRolloffHz: 0, spectralFlatness: 0,
  zeroCrossingRate: 0, harmonicToNoiseDb: 0, attackMs: 0, sustainRatio: 0,
  evenOddRatio: 0, inharmonicity: 0, f0Hz: 0, f0StabilityCents: 0,
  vibratoRateHz: 0, vibratoExtentCents: 0, voicedFraction: 0,
  polyphonySuspicion: 0, rms: 0, durationSec: 0,
};

function unknown(features: TimbreFeatures, reason: string): InstrumentEstimate {
  return { family: 'UNKNOWN', confidence: 0, features, ranking: [], reasons: [reason] };
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** YIN-style cumulative-mean-normalised difference f0. Self-contained because
 *  audioTranscription's yin() is module-private and this file must stand alone. */
function estimateF0(frame: Float32Array, rate: number, fmin = 50, fmax = 2000): { f0: number; prob: number } {
  const maxTau = Math.min(Math.floor(rate / fmin), frame.length >> 1);
  const minTau = Math.max(2, Math.floor(rate / fmax));
  if (maxTau <= minTau) return { f0: 0, prob: 0 };

  const diff = new Float32Array(maxTau);
  for (let tau = minTau; tau < maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < frame.length - maxTau; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  // Cumulative mean normalisation — this is what makes YIN robust to amplitude.
  const cmnd = new Float32Array(maxTau);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = minTau; tau < maxTau; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - minTau + 1)) / running : 1;
  }
  // First dip below threshold beats the global min: it avoids octave-down errors.
  let best = -1;
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmnd[tau] < 0.15) {
      while (tau + 1 < maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let lo = 1;
    for (let tau = minTau; tau < maxTau; tau++) if (cmnd[tau] < lo) { lo = cmnd[tau]; best = tau; }
    if (best < 0 || lo > 0.45) return { f0: 0, prob: 0 };
  }
  // Parabolic interpolation around the dip for sub-sample period accuracy.
  let tauEst = best;
  if (best > minTau && best + 1 < maxTau) {
    const a = cmnd[best - 1], b = cmnd[best], c = cmnd[best + 1];
    const denom = 2 * (2 * b - a - c);
    if (Math.abs(denom) > 1e-9) tauEst = best + (c - a) / denom;
  }
  return { f0: tauEst > 0 ? rate / tauEst : 0, prob: Math.max(0, 1 - cmnd[best]) };
}

/** Interpolated magnitude at an arbitrary frequency. */
function magAt(mag: Float32Array, freq: number, binHz: number): number {
  const b = freq / binHz;
  const i = Math.floor(b);
  if (i < 0 || i + 1 >= mag.length) return 0;
  const f = b - i;
  return mag[i] * (1 - f) + mag[i + 1] * f;
}

/** Peak magnitude within ±tolerance bins, plus where it actually landed — the
 *  offset is what reveals inharmonicity. */
function peakNear(mag: Float32Array, freq: number, binHz: number, tolBins: number): { mag: number; freq: number } {
  const center = Math.round(freq / binHz);
  let bestMag = 0, bestBin = center;
  for (let b = center - tolBins; b <= center + tolBins; b++) {
    if (b < 1 || b >= mag.length) continue;
    if (mag[b] > bestMag) { bestMag = mag[b]; bestBin = b; }
  }
  return { mag: bestMag, freq: bestBin * binHz };
}

// ─── Feature extraction ──────────────────────────────────────────────────────

/** Measure timbral descriptors from mono PCM. Pure DSP, no I/O, no classification. */
export function analyzeTimbre(data: Float32Array, sampleRate: number): TimbreFeatures {
  const durationSec = data.length / sampleRate;
  if (data.length < FRAME || durationSec < MIN_DURATION_SEC) return { ...EMPTY_FEATURES, durationSec };

  let sumSq = 0;
  for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
  const rms = Math.sqrt(sumSq / data.length);
  if (!Number.isFinite(rms) || rms < SILENCE_RMS) return { ...EMPTY_FEATURES, durationSec, rms };

  const win = hann(FRAME);
  const binHz = sampleRate / FRAME;
  const nFrames = 1 + Math.floor((data.length - FRAME) / HOP);

  const envelope = new Float32Array(nFrames);
  const centroids: number[] = [];
  const rolloffs: number[] = [];
  const flatnesses: number[] = [];
  const f0s: number[] = [];
  const f0Track: number[] = [];   // 0 where unvoiced; keeps timing for vibrato
  let voiced = 0;
  let zcTotal = 0;

  const frameBuf = new Float32Array(FRAME);

  for (let fi = 0; fi < nFrames; fi++) {
    const off = fi * HOP;
    let frameSq = 0, zc = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = data[off + i];
      frameSq += s * s;
      if (i > 0 && ((s >= 0) !== (data[off + i - 1] >= 0))) zc++;
      frameBuf[i] = s * win[i];
    }
    const frameRms = Math.sqrt(frameSq / FRAME);
    envelope[fi] = frameRms;
    zcTotal += zc;

    // Only describe the spectrum of frames that actually carry signal — silence
    // between notes would otherwise drag every average toward noise.
    if (frameRms < rms * 0.15) { f0Track.push(0); continue; }

    const mag = magnitudeSpectrum(frameBuf);
    let total = 0, weighted = 0, logSum = 0, nz = 0;
    for (let b = 1; b < mag.length; b++) {
      const m = mag[b];
      total += m;
      weighted += m * b * binHz;
      // Floor keeps log() finite; geometric mean is what makes flatness work.
      logSum += Math.log(m + 1e-10);
      nz++;
    }
    if (total <= 0) { f0Track.push(0); continue; }

    centroids.push(weighted / total);
    const geo = Math.exp(logSum / nz);
    const arith = total / nz;
    flatnesses.push(arith > 0 ? Math.min(1, geo / arith) : 0);

    let acc = 0, roll = 0;
    for (let b = 1; b < mag.length; b++) {
      acc += mag[b];
      if (acc >= total * 0.85) { roll = b * binHz; break; }
    }
    rolloffs.push(roll);

    const { f0, prob } = estimateF0(data.subarray(off, off + FRAME), sampleRate);
    if (f0 > 0 && prob > 0.45) { f0s.push(f0); f0Track.push(f0); voiced++; }
    else f0Track.push(0);
  }

  const analysedFrames = centroids.length || 1;
  const spectralCentroidHz = centroids.reduce((a, b) => a + b, 0) / analysedFrames;
  const spectralRolloffHz = rolloffs.reduce((a, b) => a + b, 0) / analysedFrames;
  const spectralFlatness = flatnesses.reduce((a, b) => a + b, 0) / analysedFrames;
  const zeroCrossingRate = (zcTotal / nFrames) * (sampleRate / FRAME);
  const voicedFraction = nFrames > 0 ? voiced / nFrames : 0;
  const f0Hz = median(f0s);

  // f0 spread in cents. Cents (not Hz) because pitch instability is proportional.
  let f0StabilityCents = 0;
  if (f0Hz > 0 && f0s.length > 1) {
    const cents = f0s.map(f => 1200 * Math.log2(f / f0Hz));
    const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
    f0StabilityCents = Math.sqrt(cents.reduce((a, c) => a + (c - mean) ** 2, 0) / cents.length);
  }

  const { attackMs, sustainRatio } = envelopeShape(envelope, sampleRate);
  const { vibratoRateHz, vibratoExtentCents } = detectVibrato(f0Track, sampleRate / HOP, f0Hz);
  const harm = analyzeHarmonics(data, sampleRate, envelope, f0Hz);

  return {
    spectralCentroidHz, spectralRolloffHz, spectralFlatness, zeroCrossingRate,
    centroidRatio: f0Hz > 0 ? spectralCentroidHz / f0Hz : 0,
    harmonicToNoiseDb: harm.hnrDb,
    evenOddRatio: harm.evenOddRatio,
    inharmonicity: harm.inharmonicity,
    polyphonySuspicion: harm.polyphonySuspicion,
    attackMs, sustainRatio, f0Hz, f0StabilityCents,
    vibratoRateHz, vibratoExtentCents, voicedFraction, rms, durationSec,
  };
}

/** Attack time and sustain from the RMS envelope. */
function envelopeShape(env: Float32Array, sampleRate: number): { attackMs: number; sustainRatio: number } {
  if (env.length < 3) return { attackMs: 0, sustainRatio: 0 };
  const frameSec = HOP / sampleRate;

  let peak = 0, peakIdx = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; peakIdx = i; }
  if (peak <= 0) return { attackMs: 0, sustainRatio: 0 };

  // Walk back from the peak to the 10% and 90% crossings of the FIRST rise. This
  // measures the onset that produced the peak rather than any later swell.
  const lo = peak * 0.1, hi = peak * 0.9;
  let iHi = peakIdx, iLo = 0;
  for (let i = peakIdx; i >= 0; i--) { if (env[i] <= hi) { iHi = i; break; } iHi = i; }
  for (let i = iHi; i >= 0; i--) { if (env[i] <= lo) { iLo = i; break; } iLo = i; }
  // Sub-frame interpolation: at 86 frames/sec a fast pluck is only 2–3 frames, so
  // integer frame counts alone would quantise every sharp attack to the same value.
  let riseFrames = Math.max(0, iHi - iLo);
  if (iHi > iLo && env[iHi] > env[iLo]) {
    const span = env[iHi] - env[iLo];
    riseFrames = Math.max(0.25, riseFrames * Math.min(1, (hi - lo) / span));
  } else {
    riseFrames = Math.max(0.25, riseFrames);
  }
  const attackMs = riseFrames * frameSec * 1000;

  // Sustain: mean level after the attack, relative to peak. Deliberately measured
  // over the whole tail so a decaying piano note scores low and a held bow high.
  let tailSum = 0, tailN = 0;
  for (let i = peakIdx + 1; i < env.length; i++) { tailSum += env[i]; tailN++; }
  const sustainRatio = tailN > 0 ? Math.min(1, tailSum / tailN / peak) : 0;
  return { attackMs, sustainRatio };
}

/** Periodic 4–8Hz modulation of the f0 track. Present in sung and bowed tones,
 *  absent in struck and (unmodulated) synthetic ones. */
function detectVibrato(f0Track: number[], frameRate: number, f0Hz: number): { vibratoRateHz: number; vibratoExtentCents: number } {
  if (f0Hz <= 0 || f0Track.length < 16) return { vibratoRateHz: 0, vibratoExtentCents: 0 };
  const cents: number[] = [];
  for (const f of f0Track) if (f > 0) cents.push(1200 * Math.log2(f / f0Hz));
  if (cents.length < 16) return { vibratoRateHz: 0, vibratoExtentCents: 0 };

  const mean = cents.reduce((a, b) => a + b, 0) / cents.length;
  const dev = cents.map(c => c - mean);

  // Scan plausible vibrato rates by autocorrelation lag rather than running an FFT
  // on a short, unevenly-voiced track.
  let bestRate = 0, bestCorr = 0;
  const minLag = Math.max(2, Math.round(frameRate / 8));
  const maxLag = Math.min(dev.length - 2, Math.round(frameRate / 4));
  let energy = 0;
  for (const d of dev) energy += d * d;
  if (energy <= 0) return { vibratoRateHz: 0, vibratoExtentCents: 0 };

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < dev.length; i++) corr += dev[i] * dev[i + lag];
    const norm = corr / energy;
    if (norm > bestCorr) { bestCorr = norm; bestRate = frameRate / lag; }
  }
  // Below ~0.3 normalised correlation the "vibrato" is just pitch noise.
  if (bestCorr < 0.3) return { vibratoRateHz: 0, vibratoExtentCents: 0 };
  const extent = Math.sqrt(dev.reduce((a, d) => a + d * d, 0) / dev.length);
  // Depth gate: autocorrelation happily finds a "period" in the sub-cent numerical
  // jitter of a perfectly steady tone, which made pure sines report 4.8Hz vibrato.
  // Real vibrato is tens of cents deep; anything under 3 cents is measurement noise.
  if (extent < 3) return { vibratoRateHz: 0, vibratoExtentCents: 0 };
  return { vibratoRateHz: bestRate, vibratoExtentCents: extent };
}

/** Harmonic-structure descriptors, measured on the strongest sustained region with
 *  a long window (finer bins ⇒ partials are actually resolvable). */
function analyzeHarmonics(
  data: Float32Array, sampleRate: number, env: Float32Array, f0Hz: number,
): { hnrDb: number; evenOddRatio: number; inharmonicity: number; polyphonySuspicion: number } {
  const fallback = { hnrDb: 0, evenOddRatio: 0, inharmonicity: 0, polyphonySuspicion: 0 };
  if (data.length < HARMONIC_FRAME) return fallback;

  // Centre on the loudest steady frame, but skip the very attack — transients are
  // broadband and would read as noise, understating HNR for every struck sound.
  let peakIdx = 0, peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) { peak = env[i]; peakIdx = i; }
  let start = peakIdx * HOP + Math.floor(0.02 * sampleRate);
  start = Math.max(0, Math.min(start, data.length - HARMONIC_FRAME));

  const win = hann(HARMONIC_FRAME);
  const frame = new Float32Array(HARMONIC_FRAME);
  for (let i = 0; i < HARMONIC_FRAME; i++) frame[i] = data[start + i] * win[i];
  const mag = magnitudeSpectrum(frame);
  const binHz = sampleRate / HARMONIC_FRAME;

  let totalEnergy = 0;
  for (let b = 1; b < mag.length; b++) totalEnergy += mag[b] * mag[b];
  if (totalEnergy <= 0) return fallback;

  // No usable fundamental ⇒ nothing harmonic to measure. Report the noisiness
  // honestly (very low HNR) rather than inventing harmonic numbers.
  if (f0Hz <= 0) return { hnrDb: -20, evenOddRatio: 0, inharmonicity: 0, polyphonySuspicion: 0 };

  // Hann's main lobe is 4 bins wide, so a partial's energy is spread over ~±2 bins.
  const tolBins = Math.max(2, Math.ceil(f0Hz * 0.03 / binHz));
  let harmonicEnergy = 0;
  const harmonicBins = new Set<number>();
  const lobes: Array<{ k: number; lobe: number; peakMag: number; freq: number }> = [];

  for (let k = 1; k <= MAX_HARMONICS; k++) {
    const target = k * f0Hz;
    if (target >= sampleRate / 2) break;
    const { mag: pm, freq: pf } = peakNear(mag, target, binHz, tolBins);
    if (pm <= 0) continue;

    // Sum the whole lobe, not just the peak bin, or HNR is systematically low.
    const center = Math.round(pf / binHz);
    let lobe = 0;
    for (let b = center - 2; b <= center + 2; b++) {
      if (b < 1 || b >= mag.length) continue;
      lobe += mag[b] * mag[b];
      harmonicBins.add(b);
    }
    harmonicEnergy += lobe;
    lobes.push({ k, lobe, peakMag: pm, freq: pf });
  }

  // A partial that is 40dB below the strongest one is spectral leakage, not a real
  // harmonic. Without this floor a pure sine reports a full set of "harmonics"
  // (leakage skirts) and its even/odd ratio becomes meaningless noise.
  const maxLobe = lobes.reduce((m, l) => Math.max(m, l.lobe), 0);
  const presenceFloor = maxLobe * 1e-4;
  let evenEnergy = 0, oddEnergy = 0, inharmSum = 0, inharmN = 0;
  for (const l of lobes) {
    if (l.lobe < presenceFloor) continue;
    // Fundamental excluded from even/odd: it is trivially "odd" and dominates,
    // which would blur the square-vs-sawtooth distinction this is meant to expose.
    if (l.k >= 2) { if (l.k % 2 === 0) evenEnergy += l.lobe; else oddEnergy += l.lobe; }
    // Weight inharmonicity by amplitude so weak, badly-located partials don't dominate.
    inharmSum += (Math.abs(l.freq - l.k * f0Hz) / (l.k * f0Hz)) * l.peakMag;
    inharmN += l.peakMag;
  }

  const noiseEnergy = Math.max(totalEnergy - harmonicEnergy, totalEnergy * 1e-6);
  const hnrDb = 10 * Math.log10(Math.max(harmonicEnergy, totalEnergy * 1e-6) / noiseEnergy);
  const upper = evenEnergy + oddEnergy;
  const evenOddRatio = upper > 0 ? evenEnergy / upper : 0;
  const inharmonicity = inharmN > 0 ? inharmSum / inharmN : 0;

  // Polyphony: strong peaks that this f0's comb does not explain. Chords and mixes
  // light this up, which is exactly when a single-family answer becomes meaningless.
  let peakEnergy = 0, unexplained = 0;
  const limit = Math.min(mag.length - 1, Math.floor((f0Hz * MAX_HARMONICS) / binHz));
  for (let b = 2; b < limit; b++) {
    if (mag[b] > mag[b - 1] && mag[b] >= mag[b + 1]) {
      const e = mag[b] * mag[b];
      if (e < totalEnergy * 0.002) continue;   // ignore the noise-floor ripple
      peakEnergy += e;
      let explained = false;
      for (let d = -2; d <= 2; d++) if (harmonicBins.has(b + d)) { explained = true; break; }
      if (!explained) unexplained += e;
    }
  }
  const unexplainedShare = peakEnergy > 0 ? Math.min(1, unexplained / peakEnergy) : 0;

  // The comb test alone has a serious blind spot: a chord in simple ratios has a
  // VIRTUAL fundamental. A 4:5:6 major triad (220/277/330) makes YIN report 55Hz,
  // and a 55Hz comb then "explains" all three notes, so unexplainedShare reads 0.
  // The tell is that the claimed fundamental isn't actually there — a real 55Hz
  // tone has energy at 55Hz and fills its low harmonic slots, while the triad
  // leaves h1,h2,h3,h7… empty. So: weak fundamental + gappy low comb ⇒ polyphonic.
  const fundamental = lobes.find(l => l.k === 1);
  const fundamentalWeakness = maxLobe > 0
    ? 1 - Math.min(1, (fundamental?.lobe ?? 0) / (maxLobe * 0.05))
    : 0;
  const lowSlots = Math.min(8, lobes.length ? Math.max(...lobes.map(l => l.k)) : 0);
  let empty = 0;
  for (let k = 1; k <= lowSlots; k++) {
    const l = lobes.find(x => x.k === k);
    if (!l || l.lobe < maxLobe * 0.01) empty++;
  }
  const combSparsity = lowSlots > 0 ? empty / lowSlots : 0;
  // Both conditions must hold — a quiet fundamental alone is normal (plenty of real
  // instruments are weak at h1), and a gappy comb alone can just be a filtered tone.
  const virtualFundamental = Math.min(fundamentalWeakness, combSparsity * 2);

  const polyphonySuspicion = Math.min(1, Math.max(unexplainedShare, virtualFundamental));

  return { hnrDb, evenOddRatio, inharmonicity, polyphonySuspicion };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Trapezoid membership: 1 inside [b,c], ramping over [a,b] and [c,d]. Soft edges
 *  matter — a hard threshold would make a 39ms attack certain and a 41ms attack
 *  certain of the opposite. */
function band(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  return x < b ? (x - a) / (b - a) : (d - x) / (d - c);
}

/** A family's evidence is the weighted mean of its cues, so families defined by
 *  more cues aren't penalised against families defined by fewer. */
function weighted(cues: Array<[number, number]>): number {
  let num = 0, den = 0;
  for (const [value, w] of cues) { num += value * w; den += w; }
  return den > 0 ? num / den : 0;
}

const MIN_WINNING_SCORE = 0.34;   // below this, nothing fit well enough to name
const MIN_MARGIN = 0.06;          // below this, two families fit equally — say UNKNOWN

function scoreFamilies(f: TimbreFeatures): Array<{ family: InstrumentFamily; score: number }> {
  const pitched = f.voicedFraction;
  const unpitched = 1 - f.voicedFraction;
  const vibrato = band(f.vibratoRateHz, 3.5, 4.5, 7.5, 9) * band(f.vibratoExtentCents, 8, 20, 200, 400);

  // PERCUSSION: no stable pitch, noisy spectrum, poor harmonic structure, fast hit.
  const percussion = weighted([
    [band(unpitched, 0.4, 0.65, 1, 1.01), 3],
    [band(f.spectralFlatness, 0.03, 0.10, 1, 1.01), 2.5],
    [band(f.harmonicToNoiseDb, -40, -30, 3, 8), 2],
    [band(f.attackMs, 0, 0, 30, 90), 1.5],
    [band(f.sustainRatio, 0, 0, 0.35, 0.6), 1],
  ]);

  // ELECTRONIC: near-perfect harmonics, near-zero noise, rock-steady pitch, no
  // vibrato. Real acoustic instruments are never this clean.
  const electronic = weighted([
    [band(f.harmonicToNoiseDb, 12, 20, 80, 80.1), 3],
    [band(f.inharmonicity, 0, 0, 0.0015, 0.006), 2.5],
    [band(f.f0StabilityCents, 0, 0, 8, 30), 2.5],
    [1 - vibrato, 1.5],
    [band(f.spectralFlatness, 0, 0, 0.02, 0.08), 1.5],
    [pitched, 1],
  ]);

  // KEYS: struck-and-decaying. Sharp attack, no sustain, harmonic, and piano's
  // string stiffness gives a small but real inharmonicity.
  const keys = weighted([
    [band(f.attackMs, 0, 0, 45, 110), 3],
    [band(f.sustainRatio, 0, 0, 0.35, 0.65), 3],
    [band(f.harmonicToNoiseDb, 0, 6, 40, 60), 1.5],
    [band(f.inharmonicity, 0.0002, 0.001, 0.02, 0.05), 1.5],
    [1 - vibrato, 1],
    [pitched, 1.5],
  ]);

  // STRINGS (bowed): slow attack, held, rich harmonics, vibrato, some bow noise.
  const strings = weighted([
    [band(f.attackMs, 25, 60, 260, 450), 2.5],
    [band(f.sustainRatio, 0.3, 0.5, 1, 1.01), 2.5],
    [band(f.centroidRatio, 1.5, 3, 9, 14), 2],
    [vibrato, 2],
    [band(f.harmonicToNoiseDb, 0, 5, 25, 40), 1.5],
    [band(f.evenOddRatio, 0.12, 0.25, 0.6, 0.75), 1],
    [pitched, 1.5],
  ]);

  // BRASS: bright with strong high partials, both even and odd present, blown
  // (moderate attack, sustained), lipped tone is fairly clean but not synthetic.
  const brass = weighted([
    [band(f.centroidRatio, 2.5, 4.5, 12, 18), 3],
    [band(f.evenOddRatio, 0.2, 0.32, 0.6, 0.72), 2],
    [band(f.attackMs, 10, 30, 140, 250), 2],
    [band(f.sustainRatio, 0.3, 0.5, 1, 1.01), 2],
    [band(f.harmonicToNoiseDb, 2, 8, 30, 45), 1.5],
    [band(f.f0Hz, 60, 90, 950, 1400), 1],
    [pitched, 1.5],
  ]);

  // WOODWIND: two sub-cases summed as a max — the closed-pipe odd-harmonic reed
  // (clarinet) and the breathy, harmonically-sparse flute. They share very little
  // spectrally, so one trapezoid set cannot cover both.
  const reed = weighted([
    [band(f.evenOddRatio, 0, 0, 0.18, 0.32), 3],
    [band(f.sustainRatio, 0.3, 0.5, 1, 1.01), 2],
    [band(f.attackMs, 10, 30, 160, 280), 1.5],
    [band(f.harmonicToNoiseDb, 2, 8, 35, 50), 1.5],
    [pitched, 1.5],
  ]);
  const flute = weighted([
    [band(f.centroidRatio, 0.8, 1, 3.2, 5), 3],
    [band(f.spectralFlatness, 0.005, 0.02, 0.09, 0.2), 2],   // audible breath noise
    [band(f.sustainRatio, 0.3, 0.5, 1, 1.01), 2],
    [band(f.harmonicToNoiseDb, 0, 5, 22, 35), 1.5],
    [band(f.attackMs, 15, 40, 180, 300), 1.5],
    [pitched, 1.5],
  ]);
  const woodwind = Math.max(reed, flute);

  // VOICE: this is the weakest rule in the file and is scored conservatively.
  // Without real formant tracking, a sung vowel and a bowed cello look similar;
  // the only cues here are the human f0 range, vibrato, and breath noise.
  const voice = weighted([
    [band(f.f0Hz, 70, 90, 700, 1100), 2.5],
    [vibrato, 2.5],
    [band(f.sustainRatio, 0.25, 0.45, 1, 1.01), 1.5],
    [band(f.spectralFlatness, 0.004, 0.015, 0.08, 0.18), 1.5],
    [band(f.centroidRatio, 1.5, 2.5, 7, 11), 1.5],
    [band(f.harmonicToNoiseDb, 0, 4, 22, 35), 1],
    [band(f.f0StabilityCents, 6, 15, 120, 250), 1],   // never machine-steady
    [pitched, 1.5],
  ]);

  return ([
    { family: 'PERCUSSION' as const, score: percussion },
    { family: 'ELECTRONIC' as const, score: electronic },
    { family: 'KEYS' as const, score: keys },
    { family: 'STRINGS' as const, score: strings },
    { family: 'BRASS' as const, score: brass },
    { family: 'WOODWIND' as const, score: woodwind },
    { family: 'VOICE' as const, score: voice },
  ]).sort((a, b) => b.score - a.score);
}

function explain(family: InstrumentFamily, f: TimbreFeatures): string[] {
  const r: string[] = [];
  const round = (x: number, d = 2) => Number(x.toFixed(d));
  if (f.f0Hz > 0) r.push(`fundamental around ${Math.round(f.f0Hz)}Hz`);
  r.push(`attack ${Math.round(f.attackMs)}ms, sustain ${round(f.sustainRatio)}`);
  r.push(`harmonic-to-noise ${round(f.harmonicToNoiseDb, 1)}dB, flatness ${round(f.spectralFlatness, 3)}`);
  if (f.centroidRatio > 0) r.push(`brightness ${round(f.centroidRatio, 1)}x the fundamental`);
  if (f.vibratoRateHz > 0) r.push(`vibrato near ${round(f.vibratoRateHz, 1)}Hz`);
  if (f.polyphonySuspicion > 0.4) r.push('multiple simultaneous sources suspected — estimate is unreliable');
  if (family === 'UNKNOWN') r.push('no family matched clearly enough to name one');
  return r;
}

/** Turn measured features into a family estimate. Separated from extraction so it
 *  can be re-run on stored features without re-decoding audio. */
export function estimateFromFeatures(f: TimbreFeatures): InstrumentEstimate {
  if (f.durationSec < MIN_DURATION_SEC) return unknown(f, 'too short to analyse');
  if (f.rms < SILENCE_RMS) return unknown(f, 'silent or near-silent input');

  const ranking = scoreFamilies(f);
  const [top, second] = ranking;
  const margin = top.score - (second?.score ?? 0);

  const reasons = explain(top.family, f);

  // Three independent ways to end up UNKNOWN, all of them legitimate outcomes.
  if (top.score < MIN_WINNING_SCORE) {
    return { family: 'UNKNOWN', confidence: 0, features: f, ranking, reasons: [...explain('UNKNOWN', f)] };
  }
  if (margin < MIN_MARGIN) {
    return {
      family: 'UNKNOWN', confidence: 0, features: f, ranking,
      reasons: [`${top.family.toLowerCase()} and ${second.family.toLowerCase()} fit equally well`, ...reasons],
    };
  }
  if (f.polyphonySuspicion > 0.55) {
    return {
      family: 'UNKNOWN', confidence: 0, features: f, ranking,
      reasons: ['spectrum looks polyphonic or mixed, so no single family applies', ...reasons],
    };
  }

  // Confidence blends fit quality with separation, then is discounted by however
  // much the single-source assumption looks violated.
  const fit = band(top.score, MIN_WINNING_SCORE, 0.72, 1, 1.01);
  const sep = Math.min(1, margin / 0.22);
  const conf = (0.6 * fit + 0.4 * sep) * (1 - 0.7 * f.polyphonySuspicion);

  return { family: top.family, confidence: Math.max(0, Math.min(1, conf)), features: f, ranking, reasons };
}

// ─── Public entry points ─────────────────────────────────────────────────────

/** Estimate the instrument family of already-decoded mono PCM. */
export function identifyInstrumentFromBuffer(data: Float32Array, sampleRate: number): InstrumentEstimate {
  if (!data || data.length === 0 || !(sampleRate > 0)) return unknown({ ...EMPTY_FEATURES }, 'empty buffer');
  const clip = data.length > MAX_ANALYZE_SEC * sampleRate
    ? data.subarray(0, Math.floor(MAX_ANALYZE_SEC * sampleRate))
    : data;
  return estimateFromFeatures(analyzeTimbre(clip, sampleRate));
}

/** Fetch, decode and estimate. Uses the same decode path as beat detection so
 *  CORS/proxy behaviour stays consistent across the audio analysis services. */
export async function identifyInstrument(url: string, signal?: AbortSignal): Promise<InstrumentEstimate> {
  const { data, sampleRate } = await decodeMono(url, signal);
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return identifyInstrumentFromBuffer(data, sampleRate);
}

export interface SegmentEstimate extends InstrumentEstimate {
  startSec: number;
  endSec: number;
}

export interface SegmentOptions {
  /** Window length in seconds. Long enough for a stable timbre read; the default
   *  is a compromise between resolution and reliability. */
  segmentSec?: number;
  /** Step between windows. Defaults to segmentSec (non-overlapping). */
  hopSec?: number;
  signal?: AbortSignal;
}

/** Per-window estimates — "what's playing right now" across a track. Each window
 *  is analysed independently, so windows spanning an instrument change will
 *  usually (and correctly) come back UNKNOWN. */
export function identifyInstrumentSegments(
  data: Float32Array, sampleRate: number, opts: SegmentOptions = {},
): SegmentEstimate[] {
  if (!data || data.length === 0 || !(sampleRate > 0)) return [];
  const segmentSec = Math.max(MIN_DURATION_SEC, opts.segmentSec ?? 3);
  const hopSec = Math.max(0.1, opts.hopSec ?? segmentSec);
  const segLen = Math.floor(segmentSec * sampleRate);
  const hopLen = Math.floor(hopSec * sampleRate);
  if (data.length < segLen) return [];

  const out: SegmentEstimate[] = [];
  for (let off = 0; off + segLen <= data.length; off += hopLen) {
    if (opts.signal?.aborted) break;
    const est = identifyInstrumentFromBuffer(data.subarray(off, off + segLen), sampleRate);
    out.push({ ...est, startSec: off / sampleRate, endSec: (off + segLen) / sampleRate });
  }
  return out;
}

/** Fetch + decode once, then report per-window estimates. */
export async function identifyInstrumentTimeline(
  url: string, opts: SegmentOptions = {},
): Promise<SegmentEstimate[]> {
  const { data, sampleRate } = await decodeMono(url, opts.signal);
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return identifyInstrumentSegments(data, sampleRate, opts);
}

/** Short, non-overclaiming label for UI. Never says "identified" or "detected". */
export function describeEstimate(est: InstrumentEstimate): string {
  if (est.family === 'UNKNOWN' || est.confidence < 0.45) return 'Instrument unclear';
  const pct = Math.round(est.confidence * 100);
  const name = est.family.charAt(0) + est.family.slice(1).toLowerCase();
  return `Sounds like ${name} (${pct}% timbral match)`;
}
