// ─── Real percussion onset detection + drum classification (heuristic DSP) ────
// The percussion sibling of audioTranscription.ts. Where that file tracks pitch,
// this one reads the actual waveform and reports WHEN a drum was struck and, from
// the spectral shape of the strike, WHICH of kick / snare / hi-hat it most looks
// like. It exists to replace the synthetic "beat guide" the breakdown UI used to
// draw (a BPM-derived grid of hits that were never in the audio).
//
// Pipeline:
//   1. Decode to mono PCM once (shared decodeMono, same as the pitched engine).
//   2. STFT → a log-spaced band profile per frame (48 bands, ~23 ms window,
//      ~6 ms hop). The band profile, not the raw spectrum, is what we keep:
//      it is all the classifier needs and it costs ~10× less memory on a long track.
//   3. Spectral flux (half-wave rectified, on log-compressed band magnitudes)
//      computed SEPARATELY for a low / mid / high band group. Per-group flux is
//      used because a hi-hat under a kick is invisible in a full-band flux curve —
//      the kick's energy swamps it — but stands out clearly in the high group.
//   4. Adaptive peak-picking per group: local maximum, above a locally-median-based
//      threshold, with a per-group minimum inter-onset interval to kill the double
//      triggers that a single transient's ringing otherwise produces.
//   5. Merge the per-group onsets into one time line, then classify each onset from
//      its ATTACK spectrum (post-onset magnitude minus the pre-onset baseline, so we
//      measure the energy the strike ADDED rather than whatever was already ringing):
//      band-energy ratios, spectral centroid, mid-band spectral flatness (noisiness)
//      and high-band decay time.
//
// Honest scope — read this before trusting a number:
//   • This is hand-written heuristic DSP, NOT a trained model and not "AI". There is
//     no drum-transcription network here and the classifier is a weighted rule over
//     four measured features. It has no notion of toms, cymbals, claps, rimshots or
//     percussion: everything is forced into the three classes the UI draws, so a
//     crash cymbal will usually read as a hi-hat and a tom as a kick or snare.
//   • It works best on an ISOLATED DRUM STEM. On a full mix, bass notes look like
//     kicks and bright synths/vocal sibilance look like hi-hats. It degrades
//     gracefully rather than failing — you get hits with honestly lower confidence —
//     but do not present full-mix output as a transcription.
//   • Confidence is computed, not decorative: it combines how far the onset stood
//     above the local noise floor with how cleanly one class beat the others.
//   • On failure (undecodable audio, silence, too short, no onsets) this returns an
//     EMPTY result with confidence 0 and a `note` explaining why. It never invents a
//     tempo-derived grid — fabricating hits is the exact bug this file replaces.

import { decodeMono } from './audioBeatDetection';
import { magnitudeSpectrum, prevPow2 } from './fft';

export type DrumClass = 'KICK' | 'SNARE' | 'HIHAT';

export interface DrumHit {
  /** Onset time in seconds from the start of the audio. */
  time: number;
  drum: DrumClass;
  /** 0–1. Combines onset salience above the local noise floor with how clearly the
   *  winning class out-scored the others. Low = "something was struck, but its
   *  spectrum doesn't clearly say which drum". */
  confidence: number;
  /** Onset strength as a multiple of the local adaptive threshold (≥1). Good proxy
   *  for velocity / how big to draw the hit. */
  strength: number;
  /** Beat position, present only when a beat grid (bpm + originSec) was supplied. */
  beat?: number;
}

export interface DrumTranscription {
  hits: DrumHit[];
  /** 0–1 overall trust in this transcription (mean hit confidence, discounted by the
   *  share of onsets that were too ambiguous to classify and by how few hits exist). */
  confidence: number;
  durationSec: number;
  /** How much of the track was actually analysed (capped — see MAX_ANALYZE_SEC). */
  analyzedSec: number;
  sampleRate: number;
  /** Onsets that were detected but classified too weakly to emit. They are NOT in
   *  `hits`; a high count means the audio is percussively ambiguous (likely a mix). */
  ambiguousOnsets: number;
  /** Per-class counts, for UI summaries. */
  counts: Record<DrumClass, number>;
  /** Set when the result is empty/degraded, explaining why. */
  note?: string;
  /** Always 'flux-dsp' today. Mirrors Transcription.backend so a learned drum model
   *  could be slotted in later without changing call sites. */
  backend: 'flux-dsp';
}

export interface DrumTranscribeOptions {
  signal?: AbortSignal;
  onProgress?: (stage: string, pct: number) => void;
  /** Measured tempo. When given (with originSec) each hit also carries `beat`. */
  bpm?: number;
  /** Seconds of the grid origin — pass BeatAnalysis.downbeatSec ?? firstBeatSec. */
  originSec?: number;
  /** Hits below this confidence are dropped and counted as ambiguous. Default 0.25. */
  minConfidence?: number;
}

// Cap analysed audio so a long track still returns promptly (matches audioTranscription).
const MAX_ANALYZE_SEC = 240;

// A strike must add at least this much over what was already sounding in its own band.
// A narrow band analysed over a ~23 ms window has few FFT bins, so its energy is a
// noisy estimate — random wiggle clears 3 dB easily, which is how a hi-hat's decay
// tail used to be reported as a kick. Any real drum attack clears this by a wide
// margin; the cost is that a very soft ghost note under a loud hit may be missed.
const MIN_RISE_DB = 5;

// ─── Band profile (log-spaced filterbank) ─────────────────────────────────────
// A log-spaced profile is used instead of raw FFT bins for two reasons: percussion
// energy is naturally described in octaves, and flux over ~48 bands is much less
// jittery than flux over 512 bins (the standard mel/log-band onset-detection trick).

const N_BANDS = 48;
const BAND_LO_HZ = 25;
const BAND_HI_HZ = 16000;

// Wide groups the classifier reasons about, in Hz. The gaps between them are
// deliberate — they buy separation between a kick's fundamental and a snare's body.
const LOW_HZ: [number, number] = [25, 130];       // kick fundamental + body
const MID_HZ: [number, number] = [180, 2200];     // snare body/crack, tom bodies
const HIGH_HZ: [number, number] = [4500, 16000];  // hi-hat / cymbal / snare sizzle

interface Filterbank {
  /** Inclusive FFT bin range per band. */
  lo: Int32Array;
  hi: Int32Array;
  centerHz: Float32Array;
  low: number[];
  mid: number[];
  high: number[];
}

function buildFilterbank(fftSize: number, sampleRate: number): Filterbank {
  const binHz = sampleRate / fftSize;
  const nBins = fftSize >> 1;
  const hiHz = Math.min(BAND_HI_HZ, sampleRate * 0.48);
  const lo = new Int32Array(N_BANDS);
  const hi = new Int32Array(N_BANDS);
  const centerHz = new Float32Array(N_BANDS);
  const ratio = Math.pow(hiHz / BAND_LO_HZ, 1 / N_BANDS);
  const low: number[] = [], mid: number[] = [], high: number[] = [];
  let edge = BAND_LO_HZ;
  for (let b = 0; b < N_BANDS; b++) {
    const next = edge * ratio;
    // Clamp to at least one bin — the lowest bands are narrower than a bin and would
    // otherwise be empty. Neighbouring low bands sharing a bin is harmless here.
    const l = Math.max(1, Math.round(edge / binHz));
    const h = Math.max(l, Math.min(nBins - 1, Math.round(next / binHz) - 1));
    lo[b] = l; hi[b] = h;
    const c = Math.sqrt(edge * next);
    centerHz[b] = c;
    if (c >= LOW_HZ[0] && c <= LOW_HZ[1]) low.push(b);
    else if (c >= MID_HZ[0] && c <= MID_HZ[1]) mid.push(b);
    else if (c >= HIGH_HZ[0] && c <= hiHz) high.push(b);
    edge = next;
  }
  return { lo, hi, centerHz, low, mid, high };
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('drum transcription aborted', 'AbortError');
}

// ─── Onset detection ──────────────────────────────────────────────────────────

/** Half-wave rectified spectral flux over one band group, on log-compressed
 *  magnitudes. Log compression matters: without it a loud section produces huge
 *  flux and a quiet one none, and a single threshold can't serve both. */
function groupFlux(logProfile: Float32Array[], group: number[]): Float32Array {
  const n = logProfile.length;
  const flux = new Float32Array(n);
  for (let t = 1; t < n; t++) {
    const cur = logProfile[t], prev = logProfile[t - 1];
    let f = 0;
    for (const b of group) { const d = cur[b] - prev[b]; if (d > 0) f += d; }
    flux[t] = f;
  }
  // Normalise to mean 1 so thresholds below are scale-free across tracks.
  let sum = 0;
  for (let t = 0; t < n; t++) sum += flux[t];
  const mean = sum / Math.max(1, n);
  if (mean > 0) for (let t = 0; t < n; t++) flux[t] /= mean;
  return flux;
}

/** Median of a strided slice — robust to the peaks themselves, unlike a mean, and
 *  striding keeps the per-frame cost sane on a 40k-frame track. */
function stridedMedian(flux: Float32Array, from: number, to: number, stride: number): number {
  const tmp: number[] = [];
  for (let i = from; i < to; i += stride) tmp.push(flux[i]);
  if (!tmp.length) return 0;
  tmp.sort((a, b) => a - b);
  return tmp[tmp.length >> 1];
}

interface RawOnset { frame: number; group: 0 | 1 | 2; strength: number }

/**
 * Adaptive peak-pick one flux curve.
 * threshold = localMedian × mult + floor; a peak must also be the local maximum and
 * respect a minimum inter-onset interval (the refractory period that suppresses the
 * double-triggers a decaying transient produces).
 */
function pickPeaks(
  flux: Float32Array, hopSec: number, group: 0 | 1 | 2,
  opts: { mult: number; floor: number; minIoiSec: number; lookSec: number },
): RawOnset[] {
  const n = flux.length;
  const half = Math.max(4, Math.round(0.4 / hopSec));       // ±400 ms threshold window
  const stride = Math.max(1, Math.round(half / 24));
  const look = Math.max(1, Math.round(opts.lookSec / hopSec));
  const minGap = Math.max(1, Math.round(opts.minIoiSec / hopSec));
  const out: RawOnset[] = [];
  for (let t = look; t < n - look; t++) {
    const v = flux[t];
    if (v <= 0) continue;
    const med = stridedMedian(flux, Math.max(0, t - half), Math.min(n, t + half), stride);
    const thresh = med * opts.mult + opts.floor;
    if (v < thresh) continue;
    let isMax = true;
    for (let k = -look; k <= look; k++) {
      if (k === 0) continue;
      // Strictly greater on the left, ≥ on the right: a plateau reports once, at its start.
      if (k < 0 ? flux[t + k] >= v : flux[t + k] > v) { isMax = false; break; }
    }
    if (!isMax) continue;
    const strength = v / Math.max(thresh, 1e-6);
    const last = out[out.length - 1];
    if (last && t - last.frame < minGap) {
      // Same strike ringing — keep whichever peak is stronger rather than emitting both.
      if (strength > last.strength) { last.frame = t; last.strength = strength; }
      continue;
    }
    out.push({ frame: t, group, strength });
  }
  return out;
}

// ─── Classification ───────────────────────────────────────────────────────────

interface AttackFeatures {
  rLow: number; rMid: number; rHigh: number;
  centroidHz: number;
  /** Spectral flatness of the attack over the mid band: ~1 = noise burst, ~0 = tonal. */
  flatness: number;
  /** Seconds for the high group to fall to 40 % of its post-onset peak. */
  highDecaySec: number;
  /** Total attack energy — near zero means we're looking at nothing. */
  energy: number;
  /** dB the loudest group rose above what was already there. This is the gate that
   *  separates a real strike from flux ripple: a sustained tone rises ~0 dB. */
  riseDb: number;
}

const sumGroup = (profile: Float32Array, group: number[]): number => {
  let s = 0;
  for (const b of group) s += profile[b];
  return s;
};

/**
 * Measure the energy the strike ADDED: post-onset magnitude minus the pre-onset
 * baseline, per band. Using the delta rather than the absolute spectrum is what
 * lets a hi-hat be described correctly while a bass note is still sustaining.
 */
function attackFeatures(profile: Float32Array[], fb: Filterbank, k: number, hopSec: number): AttackFeatures {
  const n = profile.length;
  // Baseline is the per-band MAX of the preceding frames, not their mean. With a mean
  // baseline, any steady loud tone leaks a false "attack" — its frame-to-frame ripple
  // times a large absolute magnitude looks like real added energy, which is what made
  // a plain sustained sine read as a stream of kicks. Max-vs-max cancels that.
  const preA = Math.max(0, k - 4), preB = Math.max(1, k);
  const pre = new Float32Array(N_BANDS);
  for (let t = preA; t < preB; t++) {
    const p = profile[t];
    for (let b = 0; b < N_BANDS; b++) if (p[b] > pre[b]) pre[b] = p[b];
  }

  const postEnd = Math.min(n, k + 3);
  const delta = new Float32Array(N_BANDS);
  const post = new Float32Array(N_BANDS);
  for (let b = 0; b < N_BANDS; b++) {
    let peak = 0;
    for (let t = k; t < postEnd; t++) if (profile[t][b] > peak) peak = profile[t][b];
    post[b] = peak;
    delta[b] = Math.max(0, peak - pre[b]);
  }

  const eLow = sumGroup(delta, fb.low), eMid = sumGroup(delta, fb.mid), eHigh = sumGroup(delta, fb.high);

  // Rise of whichever group gained the most — the "did anything actually happen" test.
  const groups: number[][] = [fb.low, fb.mid, fb.high];
  const deltas = [eLow, eMid, eHigh];
  let gi = 0;
  for (let i = 1; i < 3; i++) if (deltas[i] > deltas[gi]) gi = i;
  const preG = sumGroup(pre, groups[gi]), postG = sumGroup(post, groups[gi]);
  const riseDb = 20 * Math.log10((postG + 1e-9) / (preG + 1e-9));
  const tot = eLow + eMid + eHigh;
  const inv = tot > 1e-9 ? 1 / tot : 0;

  // Centroid over the full attack delta (energy-weighted mean band centre).
  let num = 0, den = 0;
  for (let b = 0; b < N_BANDS; b++) { num += delta[b] * fb.centerHz[b]; den += delta[b]; }
  const centroidHz = den > 1e-9 ? num / den : 0;

  // Flatness across mid+high: a snare/hi-hat attack is broadband noise (flat), a kick
  // or a tom is a few dominant partials (peaky).
  const flatBands = [...fb.mid, ...fb.high];
  let logSum = 0, arith = 0;
  for (const b of flatBands) { const v = delta[b] + 1e-7; logSum += Math.log(v); arith += v; }
  const geo = Math.exp(logSum / Math.max(1, flatBands.length));
  const flatness = arith > 0 ? clamp01(geo / (arith / Math.max(1, flatBands.length))) : 0;

  // High-group decay: hats/sticks die in tens of ms, cymbals and snares ring longer.
  let hiPeak = 0, hiPeakFrame = k;
  for (let t = k; t < Math.min(n, k + 4); t++) {
    const e = sumGroup(profile[t], fb.high);
    if (e > hiPeak) { hiPeak = e; hiPeakFrame = t; }
  }
  const hiBase = sumGroup(pre, fb.high);
  let highDecaySec = 0.4;
  const target = hiBase + (hiPeak - hiBase) * 0.4;
  for (let t = hiPeakFrame; t < Math.min(n, hiPeakFrame + Math.round(0.4 / hopSec)); t++) {
    if (sumGroup(profile[t], fb.high) <= target) { highDecaySec = (t - hiPeakFrame) * hopSec; break; }
  }

  return {
    rLow: eLow * inv, rMid: eMid * inv, rHigh: eHigh * inv,
    centroidHz, flatness, highDecaySec, energy: tot, riseDb,
  };
}

/**
 * The STFT locates an onset only to within a window (~23 ms), and because the Hann
 * taper delays a transient's contribution the estimate is biased EARLY. Refine it on
 * the raw samples: build a ~1 ms RMS envelope around the estimate and take the point
 * where it first crosses 20 % of the way from its local floor to its local peak — the
 * foot of the attack. Bounded search, so this can only nudge, never relocate.
 */
function refineOnsetTime(data: Float32Array, frameStart: number, fftSize: number, hop: number, sampleRate: number): number {
  const a = Math.max(0, frameStart - hop);
  const b = Math.min(data.length, frameStart + fftSize + hop);
  if (b - a < 64) return frameStart / sampleRate;
  const winN = Math.max(8, Math.round(sampleRate * 0.001));
  const stepN = Math.max(4, winN >> 1);
  const env: number[] = [];
  const pos: number[] = [];
  for (let s = a; s + winN <= b; s += stepN) {
    let e = 0;
    for (let i = s; i < s + winN; i++) e += data[i] * data[i];
    env.push(Math.sqrt(e / winN));
    pos.push(s);
  }
  if (env.length < 3) return frameStart / sampleRate;
  let peakI = 0;
  for (let i = 1; i < env.length; i++) if (env[i] > env[peakI]) peakI = i;
  let floor = env[0];
  for (let i = 0; i <= peakI; i++) if (env[i] < floor) floor = env[i];
  const cross = floor + (env[peakI] - floor) * 0.2;
  let onI = peakI;
  while (onI > 0 && env[onI - 1] > cross) onI--;
  return (pos[onI] + winN * 0.5) / sampleRate;
}

/** Linear ramp: 0 below `a`, 1 above `b` (or reversed when a > b). */
const ramp = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));

interface ClassScores { KICK: number; SNARE: number; HIHAT: number }

/**
 * Score each drum class from the attack features. Every term is a physical statement
 * about how that drum's strike looks in a spectrum — there is no random or hashed
 * component anywhere:
 *   KICK  — energy concentrated below ~130 Hz, low centroid, little top end.
 *   SNARE — mid-band body plus a broadband noise burst (high flatness), centroid in
 *           the ~600–3500 Hz range, and crucially NOT low-dominated.
 *   HIHAT — high-band dominant, high centroid, and a short decay (what separates a
 *           closed hat from a sustaining cymbal or a snare's ring).
 * `fired` is which flux group detected this onset; an onset only visible in the high
 * group is by definition a high-frequency event, so it earns a small bonus.
 */
function classify(f: AttackFeatures, fired: boolean[]): ClassScores {
  const bonus = (g: number) => (fired[g] ? 0.08 : -0.06);

  const kick = clamp01(
    0.55 * f.rLow
    + 0.45 * ramp(f.centroidHz, 700, 180)      // low centroid → kick-like
    - 0.45 * f.rHigh
    + bonus(0),
  );

  const snare = clamp01(
    0.34 * ramp(f.rMid, 0.08, 0.45)
    + 0.28 * ramp(f.flatness, 0.05, 0.35)      // broadband noise burst
    + 0.24 * (ramp(f.centroidHz, 400, 900) * ramp(f.centroidHz, 6000, 3200))
    + 0.14 * ramp(f.highDecaySec, 0.04, 0.12)  // longer ring than a closed hat
    - 0.55 * f.rLow
    + bonus(1),
  );

  const hihat = clamp01(
    0.42 * ramp(f.rHigh, 0.15, 0.55)
    + 0.30 * ramp(f.centroidHz, 2500, 6000)
    + 0.28 * ramp(f.highDecaySec, 0.13, 0.03)  // short decay
    - 0.60 * f.rLow
    + bonus(2),
  );

  return { KICK: kick, SNARE: snare, HIHAT: hihat };
}

// ─── Public entry ─────────────────────────────────────────────────────────────

function emptyResult(sampleRate: number, duration: number, note: string): DrumTranscription {
  return {
    hits: [], confidence: 0, durationSec: duration, analyzedSec: 0, sampleRate,
    ambiguousOnsets: 0, counts: { KICK: 0, SNARE: 0, HIHAT: 0 }, note, backend: 'flux-dsp',
  };
}

/** Fetch + decode + transcribe. Percussion only — see the file header for scope. */
export async function transcribeDrums(url: string, signal?: AbortSignal): Promise<DrumTranscription> {
  return transcribeDrumsFromUrl(url, { signal });
}

/** Same as transcribeDrums with the full option bag (progress, beat grid, threshold). */
export async function transcribeDrumsFromUrl(url: string, opts: DrumTranscribeOptions = {}): Promise<DrumTranscription> {
  opts.onProgress?.('decoding', 0.05);
  let decoded: { data: Float32Array; sampleRate: number; duration: number };
  try {
    decoded = await decodeMono(url, opts.signal);
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    // Undecodable audio returns an honest empty result — never a fabricated grid.
    console.warn('[drums] decode failed', e);
    return emptyResult(44100, 0, 'audio could not be decoded');
  }
  return transcribeDrumsFromBuffer(decoded.data, decoded.sampleRate, decoded.duration, opts);
}

/** Transcribe already-decoded mono PCM — lets a caller that has decoded once (the
 *  pitched transcription engine, the beat detector) share the buffer. */
export function transcribeDrumsFromBuffer(
  pcm: Float32Array, sampleRate: number, duration: number, opts: DrumTranscribeOptions = {},
): DrumTranscription {
  const minConfidence = opts.minConfidence ?? 0.25;

  if (!pcm || !pcm.length || !Number.isFinite(sampleRate) || sampleRate < 4000) {
    return emptyResult(sampleRate || 44100, duration || 0, 'no audio to analyse');
  }

  // Bound the analysis window like the pitched engine does.
  let data = pcm;
  let analyzedSec = duration;
  if (duration > MAX_ANALYZE_SEC) {
    data = pcm.subarray(0, Math.floor(MAX_ANALYZE_SEC * sampleRate));
    analyzedSec = MAX_ANALYZE_SEC;
  }

  // ~23 ms window / ~6 ms hop at any sample rate: long enough to resolve a kick's
  // fundamental, short enough that onset timing stays inside a rendered frame.
  const fftSize = Math.max(256, prevPow2(Math.round(sampleRate * 0.03)));
  const hop = Math.max(64, fftSize >> 2);
  const hopSec = hop / sampleRate;
  if (data.length < fftSize * 8) {
    return emptyResult(sampleRate, duration, 'audio too short to analyse');
  }

  // Silence guard — an all-zero (or dithered-silence) buffer must not produce hits.
  let rms = 0;
  const step = Math.max(1, Math.floor(data.length / 20000));
  let counted = 0;
  for (let i = 0; i < data.length; i += step) { rms += data[i] * data[i]; counted++; }
  rms = Math.sqrt(rms / Math.max(1, counted));
  if (rms < 1e-4) return emptyResult(sampleRate, duration, 'audio is silent');

  throwIfAborted(opts.signal);
  opts.onProgress?.('spectrum', 0.15);

  // ── STFT → band profile per frame ──
  const fb = buildFilterbank(fftSize, sampleRate);
  const win = hann(fftSize);
  const buf = new Float32Array(fftSize);
  const profile: Float32Array[] = [];
  const logProfile: Float32Array[] = [];
  const nFrames = Math.max(0, Math.floor((data.length - fftSize) / hop) + 1);
  for (let fi = 0, start = 0; start + fftSize <= data.length; start += hop, fi++) {
    if ((fi & 511) === 0) {
      throwIfAborted(opts.signal);
      opts.onProgress?.('spectrum', 0.15 + 0.55 * (fi / Math.max(1, nFrames)));
    }
    for (let i = 0; i < fftSize; i++) buf[i] = data[start + i] * win[i];
    const mag = magnitudeSpectrum(buf);
    const p = new Float32Array(N_BANDS);
    const lp = new Float32Array(N_BANDS);
    for (let b = 0; b < N_BANDS; b++) {
      let s = 0;
      const l = fb.lo[b], h = fb.hi[b];
      for (let k = l; k <= h; k++) s += mag[k];
      const v = s / (h - l + 1);
      p[b] = v;
      lp[b] = Math.log1p(50 * v);      // compression → one threshold works loud AND quiet
    }
    profile.push(p);
    logProfile.push(lp);
  }
  if (profile.length < 8) return emptyResult(sampleRate, duration, 'audio too short to analyse');

  throwIfAborted(opts.signal);
  opts.onProgress?.('onsets', 0.75);

  // ── Per-group flux + adaptive peak-picking ──
  const fluxes = [
    groupFlux(logProfile, fb.low),
    groupFlux(logProfile, fb.mid),
    groupFlux(logProfile, fb.high),
  ];
  // Refractory periods reflect what each drum can physically do: a kick can't
  // realistically retrigger inside 55 ms, a hi-hat can (32nds at speed).
  // `floor` is in units of that curve's own mean flux, so a peak must be a genuine
  // outlier for the track — not merely above the (near-zero) median of a quiet bar.
  const raw = [
    ...pickPeaks(fluxes[0], hopSec, 0, { mult: 2.0, floor: 1.2, minIoiSec: 0.055, lookSec: 0.03 }),
    ...pickPeaks(fluxes[1], hopSec, 1, { mult: 2.0, floor: 1.2, minIoiSec: 0.045, lookSec: 0.03 }),
    ...pickPeaks(fluxes[2], hopSec, 2, { mult: 2.0, floor: 1.2, minIoiSec: 0.032, lookSec: 0.022 }),
  ];
  if (!raw.length) return emptyResult(sampleRate, duration, 'no percussive onsets detected');

  // ── Merge the three onset streams into one time line ──
  raw.sort((a, b) => a.frame - b.frame);
  const mergeFrames = Math.max(1, Math.round(0.025 / hopSec));   // 25 ms = one strike
  interface Cluster { frame: number; strength: number; fired: boolean[] }
  const clusters: Cluster[] = [];
  for (const o of raw) {
    const last = clusters[clusters.length - 1];
    if (last && o.frame - last.frame <= mergeFrames) {
      last.fired[o.group] = true;
      if (o.strength > last.strength) { last.strength = o.strength; last.frame = o.frame; }
    } else {
      const fired = [false, false, false];
      fired[o.group] = true;
      clusters.push({ frame: o.frame, strength: o.strength, fired });
    }
  }

  throwIfAborted(opts.signal);
  opts.onProgress?.('classify', 0.85);

  // ── Classify each onset ──
  const hits: DrumHit[] = [];
  const counts: Record<DrumClass, number> = { KICK: 0, SNARE: 0, HIHAT: 0 };
  let ambiguous = 0;
  const period = opts.bpm && opts.bpm > 0 ? 60 / opts.bpm : 0;
  const origin = opts.originSec ?? 0;
  const pushHit = (time: number, drum: DrumClass, confidence: number, strength: number) => {
    const hit: DrumHit = { time: +time.toFixed(4), drum, confidence: +confidence.toFixed(3), strength: +strength.toFixed(2) };
    if (period) hit.beat = +(((time - origin) / period)).toFixed(4);
    hits.push(hit);
    counts[drum]++;
  };

  // Floor for "an audible amount of new energy", referenced PER BAND GROUP to that
  // group's own loud frames. Per-group matters: against a single global floor a loud
  // kick raises the bar so far that the hi-hats playing over it all disappear, even
  // though nothing is masking them in their own part of the spectrum.
  const groupRef = [fb.low, fb.mid, fb.high].map(g => {
    const e = Float32Array.from(profile, p => sumGroup(p, g)).sort();
    return e[Math.floor(e.length * 0.9)] || 0;
  });
  const REL_ENERGY_FLOOR = 0.03;
  const binCount = new Float32Array(N_BANDS);
  for (let b = 0; b < N_BANDS; b++) binCount[b] = fb.hi[b] - fb.lo[b] + 1;
  const gPow = (p: Float32Array, g: number[]) => { let s2 = 0; for (const b of g) s2 += p[b] * p[b] * binCount[b]; return s2; };
  const totPowSorted = Float32Array.from(profile, p => gPow(p, fb.low) + gPow(p, fb.mid) + gPow(p, fb.high)).sort();
  const powRef = totPowSorted[Math.floor(totPowSorted.length * 0.9)] || 1;
  const onsetPowRel = (k: number, g: number[]) => {
    const preA = Math.max(0, k - 4);
    let pre = 0; for (let t = preA; t < Math.max(1, k); t++) { const e = gPow(profile[t], g); if (e > pre) pre = e; }
    let post = 0; for (let t = k; t < Math.min(profile.length, k + 3); t++) { const e = gPow(profile[t], g); if (e > post) post = e; }
    return Math.max(0, post - pre) / powRef;
  };
  if ((globalThis as any).__DRUMDBG) console.log('GROUPREF', groupRef.map(x=>x.toExponential(3)).join(' '), 'powRef', powRef.toExponential(3));

  const feats = clusters.map(c => attackFeatures(profile, fb, c.frame, hopSec));
  const gDelta = feats.map(f => [f.rLow * f.energy, f.rMid * f.energy, f.rHigh * f.energy]);

  /**
   * Post-masking, applied per band group. A candidate whose dominant group is far
   * weaker than a recent candidate's SAME group is that hit's decay, not a new strike
   * — this is the auditory post-masking effect, and it is what stops a hi-hat's tail
   * from being reported as a separate (quiet, low-frequency) kick 60 ms later.
   * Comparing within one group is essential: a real hi-hat 60 ms after a loud kick
   * survives, because their energy lives in different groups.
   */
  /**
   * Decay veto. A strike must not merely be a local flux bump — the band it lives in
   * must actually be LOUDER than it has recently been. Inside a hit's decay tail the
   * band energy is monotonically falling, so a wiggle there fails this while a genuine
   * new strike (even fast 16th-note hats, whose predecessor has already decayed) passes.
   * This is what kills the "phantom kick 300 ms after the real kick" family of errors.
   */
  const DECAY_LOOKBACK_SEC = 0.08;
  const DECAY_VETO_RATIO = 0.6;
  const lookbackFrames = Math.max(2, Math.round(DECAY_LOOKBACK_SEC / hopSec));
  const groupsArr = [fb.low, fb.mid, fb.high];
  const inDecay = (frame: number, g: number): boolean => {
    let recentMax = 0;
    for (let t = Math.max(0, frame - lookbackFrames); t < frame; t++) {
      const e = sumGroup(profile[t], groupsArr[g]);
      if (e > recentMax) recentMax = e;
    }
    let post = 0;
    for (let t = frame; t < Math.min(profile.length, frame + 3); t++) {
      const e = sumGroup(profile[t], groupsArr[g]);
      if (e > post) post = e;
    }
    return post < recentMax * DECAY_VETO_RATIO;
  };

  const MASK_WINDOW_SEC = 0.12;
  const MASK_RATIO = 4;                     // 12 dB in magnitude
  const isMasked = (i: number, g: number): boolean => {
    for (let j = i - 1; j >= 0; j--) {
      if ((clusters[i].frame - clusters[j].frame) * hopSec > MASK_WINDOW_SEC) break;
      if (gDelta[j][g] > gDelta[i][g] * MASK_RATIO) return true;
    }
    return false;
  };

  for (let ci = 0; ci < clusters.length; ci++) {
    const c = clusters[ci];
    const f = feats[ci];
    // Gates that reject "onsets" the flux curve reported but the audio doesn't
    // support: too little added energy to hear, no real rise over what was already
    // sounding (flux ripple on a sustained tone), or a masked decay tail.
    if (f.energy < 1e-6) continue;
    const rel = Math.max(
      groupRef[0] > 0 ? gDelta[ci][0] / groupRef[0] : 0,
      groupRef[1] > 0 ? gDelta[ci][1] / groupRef[1] : 0,
      groupRef[2] > 0 ? gDelta[ci][2] / groupRef[2] : 0,
    );
    if (rel < REL_ENERGY_FLOOR) continue;
    if (f.riseDb < MIN_RISE_DB) continue;
    let dom = 0;
    for (let g = 1; g < 3; g++) if (gDelta[ci][g] > gDelta[ci][dom]) dom = g;
    if ((globalThis as any).__DRUMDBG) console.log('DBG', (c.frame * hopSec).toFixed(3), 'dom', dom, 'gd', gDelta[ci].map(x => x.toFixed(5)).join(','), 'globalRel', (f.energy / (groupRef[0] + groupRef[1] + groupRef[2])).toExponential(2), 'rise', f.riseDb.toFixed(1), 'masked', isMasked(ci, dom), 'decay', inDecay(c.frame, dom), 'powRel', onsetPowRel(c.frame, groupsArr[dom]).toExponential(2));
    if (isMasked(ci, dom) || inDecay(c.frame, dom)) continue;
    const s = classify(f, c.fired);
    const ranked = (Object.keys(s) as DrumClass[]).sort((a, b) => s[b] - s[a]);
    const best = ranked[0], second = ranked[1];
    const sep = s[best] > 0 ? (s[best] - s[second]) / s[best] : 0;
    // Salience: how far above the adaptive threshold this onset actually stood.
    const salience = clamp01((c.strength - 1) / 2);
    const confidence = clamp01(s[best] * (0.45 + 0.55 * sep) * (0.55 + 0.45 * salience));
    const time = refineOnsetTime(data, c.frame * hop, fftSize, hop, sampleRate);

    if (confidence < minConfidence) { ambiguous++; continue; }
    pushHit(time, best, confidence, c.strength);

    // A kick's energy lives below ~200 Hz, so simultaneous energy above 4.5 kHz with a
    // short decay is a genuinely SEPARATE source — almost always the hat playing
    // through the kick. It gets its own (deliberately weaker) confidence because the
    // evidence is one band's, not the whole spectrum's.
    if (best === 'KICK' && c.fired[2]) {
      const hiEvidence = ramp(f.rHigh, 0.06, 0.3) * ramp(f.highDecaySec, 0.13, 0.03);
      const hiConf = clamp01(0.6 * hiEvidence * (0.6 + 0.4 * salience));
      if (hiConf >= minConfidence) pushHit(time, 'HIHAT', hiConf, c.strength);
    }
  }

  hits.sort((a, b) => a.time - b.time);

  // ── Overall confidence ──
  // Mean hit confidence, discounted by how many onsets we couldn't classify (a mix
  // full of non-percussive transients scores low, which is the point) and by having
  // too few hits to be a drum part at all.
  const meanConf = hits.length ? hits.reduce((a, h) => a + h.confidence, 0) / hits.length : 0;
  const classifiedRatio = hits.length / Math.max(1, hits.length + ambiguous);
  const enough = Math.min(1, hits.length / 8);
  const confidence = +clamp01(meanConf * (0.4 + 0.6 * classifiedRatio) * enough).toFixed(3);

  opts.onProgress?.('done', 1);
  return {
    hits,
    confidence,
    durationSec: duration,
    analyzedSec,
    sampleRate,
    ambiguousOnsets: ambiguous,
    counts,
    backend: 'flux-dsp',
    note: hits.length ? undefined : 'no onsets survived classification',
  };
}

/** Hits inside a time window — for drawing a scrolling percussion staff. */
export function drumHitsInWindow(hits: DrumHit[], startSec: number, endSec: number): DrumHit[] {
  return hits.filter(h => h.time >= startSec && h.time < endSec);
}

/** The hit closest to `currentSec`, within `toleranceSec` — for live "hit now" flashes. */
export function drumHitAtTime(hits: DrumHit[], currentSec: number, toleranceSec = 0.06): DrumHit | null {
  let best: DrumHit | null = null;
  let bestD = toleranceSec;
  for (const h of hits) {
    const d = Math.abs(h.time - currentSec);
    if (d <= bestD) { bestD = d; best = h; }
    else if (h.time > currentSec + toleranceSec) break;
  }
  return best;
}
