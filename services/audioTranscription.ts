// ─── Real audio → note transcription (YIN pitch tracking) ─────────────────────
// This is the "deeper" engine: instead of a synthetic genre/hash loop, it reads
// the actual decoded waveform and tracks pitch over time, segmenting it into real
// notes (pitch + onset + duration) that are quantized to the measured beat grid.
//
// Pipeline:
//   1. Decode the audio to mono PCM once (shared with beat detection).
//   2. Derive a tempo + phase-aligned beat grid (audioBeatDetection).
//   3. Band-split: a mid/high band for the lead/melody voice, a low band for bass.
//   4. YIN monophonic f0 per frame on each band → smoothed pitch contour.
//   5. Segment the contour into notes; quantize start/duration to the grid.
//   6. Krumhansl-Schmuckler key detection on the duration-weighted pitch histogram.
//
// Honest scope: YIN is the standard, accurate approach for *monophonic* f0, so the
// melody and bass lines it returns are real and tightly timed. Dense polyphonic
// inner-chord voicing is not separated here — that needs a learned model
// (Basic Pitch). The TranscriptionBackend type leaves room to drop one in later.

import { decodeMono, detectBeatsFromBuffer } from './audioBeatDetection';
import { magnitudeSpectrum } from './fft';

export type Voice = 'melody' | 'bass';

export interface TNote {
  midi: number;
  /** Real onset / duration in seconds (from the waveform). */
  startSec: number;
  durSec: number;
  /** Quantized to the beat grid: beats from the grid's first beat. */
  startBeat: number;
  durBeats: number;
  voice: Voice;
  /** 0–1 salience / voicing confidence. */
  velocity: number;
}

export interface Transcription {
  notes: TNote[];
  bpm: number;
  key: string;                       // 'C', 'F#', …
  mode: 'major' | 'minor';
  /** Key-signature accidentals for MusicXML / notation (−7…+7). */
  keyFifths: number;
  beatsPerMeasure: number;           // numerator of the time signature
  beatUnit: number;                  // denominator (4 = quarter-note beat)
  firstBeatSec: number;
  durationSec: number;
  confidence: number;                // grid-fit confidence (0–1)
  backend: 'yin-dsp' | 'poly-dsp';
  polyphonic: boolean;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles.
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Pitch-class → key-signature fifths, choosing the spelling with fewest accidentals.
const MAJOR_FIFTHS: Record<number, number> = {
  0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: 6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5,
};

// Cap total analysed audio so a long track still returns quickly.
const MAX_ANALYZE_SEC = 240;

// ─── Resampling / filtering helpers ───────────────────────────────────────────

/** Box-filter decimation to ~targetRate (anti-aliased enough for f0 tracking). */
function decimate(data: Float32Array, sampleRate: number, targetRate: number): { data: Float32Array; rate: number } {
  const factor = Math.max(1, Math.round(sampleRate / targetRate));
  if (factor === 1) return { data, rate: sampleRate };
  const outLen = Math.floor(data.length / factor);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let acc = 0;
    const base = i * factor;
    for (let j = 0; j < factor; j++) acc += data[base + j];
    out[i] = acc / factor;
  }
  return { data: out, rate: sampleRate / factor };
}

/** One-pole low-pass. */
function lowPass(data: Float32Array, rate: number, cutoffHz: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / rate;
  const a = dt / (rc + dt);
  const out = new Float32Array(data.length);
  let prev = 0;
  for (let i = 0; i < data.length; i++) { prev += a * (data[i] - prev); out[i] = prev; }
  return out;
}

/** One-pole high-pass (signal minus its low-passed version). */
function highPass(data: Float32Array, rate: number, cutoffHz: number): Float32Array {
  const lp = lowPass(data, rate, cutoffHz);
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] - lp[i];
  return out;
}

// ─── YIN monophonic pitch detector ────────────────────────────────────────────

function yin(frame: Float32Array, rate: number, fmin: number, fmax: number, threshold = 0.15): { f0: number; prob: number } {
  const tauMin = Math.max(2, Math.floor(rate / fmax));
  const tauMax = Math.min(frame.length >> 1, Math.ceil(rate / fmin));
  if (tauMax <= tauMin) return { f0: 0, prob: 0 };

  const diff = new Float32Array(tauMax);
  for (let tau = tauMin; tau < tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < tauMax; i++) { const d = frame[i] - frame[i + tau]; sum += d * d; }
    diff[tau] = sum;
  }
  // Cumulative mean normalized difference.
  let running = 0;
  diff[0] = 1;
  for (let tau = 1; tau < tauMax; tau++) {
    running += diff[tau];
    diff[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
  }
  // Absolute threshold → first local minimum below it.
  let tau = -1;
  for (let t = tauMin; t < tauMax; t++) {
    if (diff[t] < threshold) {
      while (t + 1 < tauMax && diff[t + 1] < diff[t]) t++;
      tau = t; break;
    }
  }
  if (tau === -1) {
    let min = Infinity, mt = -1;
    for (let t = tauMin; t < tauMax; t++) if (diff[t] < min) { min = diff[t]; mt = t; }
    if (mt === -1 || min > 0.55) return { f0: 0, prob: 0 };
    tau = mt;
  }
  // Parabolic interpolation around the dip.
  const x0 = tau > tauMin ? tau - 1 : tau;
  const x2 = tau + 1 < tauMax ? tau + 1 : tau;
  let betterTau = tau;
  if (x0 !== tau && x2 !== tau) {
    const s0 = diff[x0], s1 = diff[tau], s2 = diff[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }
  return { f0: rate / betterTau, prob: Math.max(0, 1 - diff[tau]) };
}

// ─── Contour → notes ──────────────────────────────────────────────────────────

interface FrameP { t: number; midi: number; prob: number; e: number }   // midi = -1 when unvoiced

function trackVoice(
  signal: Float32Array,
  rate: number,
  voice: Voice,
  opts: { fmin: number; fmax: number; minMidi: number; maxMidi: number; voiceThresh: number; rms: number },
): { startSec: number; durSec: number; midi: number; velocity: number }[] {
  const frameSize = voice === 'bass' ? 1024 : 1024;
  const hop = Math.max(64, Math.floor(rate * 0.0116));      // ~11.6 ms
  const frames: FrameP[] = [];

  const buf = new Float32Array(frameSize);
  for (let start = 0; start + frameSize <= signal.length; start += hop) {
    // RMS gate — skip near-silence.
    let energy = 0;
    for (let i = 0; i < frameSize; i++) { const s = signal[start + i]; buf[i] = s; energy += s * s; }
    const rms = Math.sqrt(energy / frameSize);
    const t = start / rate;
    if (rms < opts.rms) { frames.push({ t, midi: -1, prob: 0, e: rms }); continue; }

    const { f0, prob } = yin(buf, rate, opts.fmin, opts.fmax);
    if (f0 <= 0 || prob < opts.voiceThresh) { frames.push({ t, midi: -1, prob: 0, e: rms }); continue; }
    let midi = 69 + 12 * Math.log2(f0 / 440);
    // Octave-fold into the voice's expected range (tames YIN octave errors).
    while (midi < opts.minMidi - 0.5) midi += 12;
    while (midi > opts.maxMidi + 0.5) midi -= 12;
    frames.push({ t, midi, prob, e: rms });
  }

  // 3-frame median smoothing on the rounded pitch to remove single-frame jitter.
  const rounded = frames.map(f => (f.midi < 0 ? -1 : Math.round(f.midi)));
  const smooth = rounded.slice();
  for (let i = 1; i < rounded.length - 1; i++) {
    const a = rounded[i - 1], b = rounded[i], c = rounded[i + 1];
    if (a >= 0 && c >= 0 && a === c && b !== a) smooth[i] = a;   // fill 1-frame dropouts/spikes
  }

  // Segment runs of equal pitch into notes (allow a single-frame gap).
  const notes: { startSec: number; durSec: number; midi: number; velocity: number }[] = [];
  const minDurSec = 0.085;
  let i = 0;
  const hopSec = hop / rate;
  while (i < smooth.length) {
    const pitch = smooth[i];
    if (pitch < 0) { i++; continue; }
    let j = i, gaps = 0, probSum = 0, probN = 0;
    while (j < smooth.length) {
      if (smooth[j] === pitch) {
        // Re-articulation: an energy onset on the same pitch starts a NEW note,
        // so a repeated note isn't merged into one long sustain.
        if (j > i && frames[j].e > frames[j - 1].e * 1.8 && frames[j].e > opts.rms * 2.2) break;
        probSum += frames[j].prob; probN++; gaps = 0; j++;
      }
      else if (smooth[j] < 0 && gaps === 0) { gaps = 1; j++; }      // tolerate one unvoiced frame
      else break;
    }
    const startSec = frames[i].t;
    const durSec = frames[Math.min(j, frames.length) - 1].t + hopSec - startSec;
    const velocity = probN > 0 ? probSum / probN : 0;
    if (durSec >= minDurSec && velocity >= opts.voiceThresh) {
      notes.push({ startSec, durSec, midi: pitch, velocity });
    }
    i = j;
  }
  return notes;
}

// ─── Key detection ────────────────────────────────────────────────────────────

function detectKey(notes: TNote[]): { key: string; mode: 'major' | 'minor'; keyFifths: number } {
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[((n.midi % 12) + 12) % 12] += n.durBeats * (0.4 + 0.6 * n.velocity);
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return { key: 'C', mode: 'major', keyFifths: 0 };
  const norm = hist.map(v => v / total);
  let best = -Infinity, root = 0, isMinor = false;
  for (let r = 0; r < 12; r++) {
    const maj = KS_MAJOR.reduce((s, w, i) => s + w * norm[(i + r) % 12], 0);
    const min = KS_MINOR.reduce((s, w, i) => s + w * norm[(i + r) % 12], 0);
    if (maj > best) { best = maj; root = r; isMinor = false; }
    if (min > best) { best = min; root = r; isMinor = true; }
  }
  const fifthsPc = isMinor ? (root + 3) % 12 : root;
  return { key: NOTE_NAMES[root], mode: isMinor ? 'minor' : 'major', keyFifths: MAJOR_FIFTHS[fifthsPc] ?? 0 };
}

// ─── Polyphonic multi-F0 (iterative harmonic salience) ────────────────────────
// Per frame: build a salience for every candidate pitch (sum of its harmonic
// magnitudes), pick the strongest, subtract its harmonics, and repeat — so a
// chord yields several simultaneous pitches instead of one. Then cluster pitch
// presence across frames into (overlapping) notes. This is real polyphony with no
// model dependency; accuracy on dense mixes is below a learned model but it
// resolves block chords, dyads and arpeggios well.

const POLY_FFT = 4096;          // ~5.4 Hz bins at 22.05 kHz
const POLY_RATE = 22050;
const POLY_MIN_MIDI = 33;       // A1
const POLY_MAX_MIDI = 96;       // C7
const POLY_HARMONICS = 8;
const POLY_MAX_VOICES = 6;

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Interpolated magnitude at an arbitrary frequency (max over ±1 bin). */
function magAt(mag: Float32Array, freq: number, binHz: number): number {
  const b = freq / binHz;
  const lo = Math.floor(b);
  if (lo < 1 || lo + 1 >= mag.length) return 0;
  return Math.max(mag[lo], mag[lo + 1]);
}

function multiF0Frame(mag: Float32Array, binHz: number, candFreq: Float32Array): number[] {
  const work = mag.slice();
  const nCand = candFreq.length;
  const picked: number[] = [];
  let firstSal = 0;
  for (let iter = 0; iter < POLY_MAX_VOICES; iter++) {
    let bestSal = 0, bestIdx = -1;
    for (let c = 0; c < nCand; c++) {
      const f0 = candFreq[c];
      let sal = 0;
      for (let h = 1; h <= POLY_HARMONICS; h++) sal += magAt(work, f0 * h, binHz) / h;
      if (sal > bestSal) { bestSal = sal; bestIdx = c; }
    }
    if (bestIdx < 0) break;
    if (iter === 0) firstSal = bestSal;
    // Stop once remaining peaks are weak relative to the strongest.
    if (bestSal < firstSal * 0.18 || bestSal <= 0) break;
    picked.push(POLY_MIN_MIDI + bestIdx);
    // Subtract this pitch's harmonics so its octaves aren't re-picked.
    const f0 = candFreq[bestIdx];
    for (let h = 1; h <= POLY_HARMONICS; h++) {
      const b = Math.round((f0 * h) / binHz);
      for (let d = -1; d <= 1; d++) { const bb = b + d; if (bb >= 0 && bb < work.length) work[bb] *= 0.15; }
    }
  }
  return picked;
}

function trackPolyphonic(
  signal: Float32Array,
  rate: number,
  opts: { onProgress?: (s: string, p: number) => void },
): { startSec: number; durSec: number; midi: number; velocity: number }[] {
  const win = hann(POLY_FFT);
  const hop = Math.floor(POLY_FFT / 4);                // 75% overlap
  const binHz = rate / POLY_FFT;
  const candFreq = new Float32Array(POLY_MAX_MIDI - POLY_MIN_MIDI + 1);
  for (let m = POLY_MIN_MIDI; m <= POLY_MAX_MIDI; m++) candFreq[m - POLY_MIN_MIDI] = 440 * Math.pow(2, (m - 69) / 12);

  // Per-frame active pitch sets + a salience proxy (frame RMS) for velocity.
  const frameMidis: number[][] = [];
  const frameTime: number[] = [];
  const buf = new Float32Array(POLY_FFT);
  const totalFrames = Math.max(1, Math.floor((signal.length - POLY_FFT) / hop));
  let fi = 0;
  for (let start = 0; start + POLY_FFT <= signal.length; start += hop, fi++) {
    let energy = 0;
    for (let i = 0; i < POLY_FFT; i++) { const s = signal[start + i] * win[i]; buf[i] = s; energy += s * s; }
    const rms = Math.sqrt(energy / POLY_FFT);
    const t = start / rate;
    if (rms < 0.004) { frameMidis.push([]); frameTime.push(t); continue; }
    const mag = magnitudeSpectrum(buf);
    frameMidis.push(multiF0Frame(mag, binHz, candFreq));
    frameTime.push(t);
    if ((fi & 255) === 0) opts.onProgress?.('polyphony', 0.4 + 0.5 * (fi / totalFrames));
  }

  // Cluster presence per MIDI across frames → notes (gap tolerance + min length).
  const hopSec = hop / rate;
  const presence = new Map<number, boolean[]>();
  for (let f = 0; f < frameMidis.length; f++) {
    for (const m of frameMidis[f]) {
      let arr = presence.get(m);
      if (!arr) { arr = new Array(frameMidis.length).fill(false); presence.set(m, arr); }
      arr[f] = true;
    }
  }
  const notes: { startSec: number; durSec: number; midi: number; velocity: number }[] = [];
  const minDurSec = 0.09;
  const gapTol = 2;
  for (const [midi, arr] of presence) {
    let f = 0;
    while (f < arr.length) {
      if (!arr[f]) { f++; continue; }
      let g = f, gap = 0, on = 0;
      while (g < arr.length) {
        if (arr[g]) { on++; gap = 0; g++; }
        else if (gap < gapTol) { gap++; g++; }
        else break;
      }
      const startSec = frameTime[f];
      const endF = Math.min(g, frameTime.length - 1);
      const durSec = frameTime[endF] + hopSec - startSec;
      // Require the note to be present in a reasonable fraction of its span.
      const span = g - f;
      if (durSec >= minDurSec && on / Math.max(1, span) > 0.4) {
        notes.push({ startSec, durSec, midi, velocity: Math.min(1, 0.5 + on / 40) });
      }
      f = g;
    }
  }
  return notes;
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export interface TranscribeOptions {
  signal?: AbortSignal;
  onProgress?: (stage: string, pct: number) => void;
  /** Resolve simultaneous pitches (chords) instead of single melody+bass lines. */
  polyphonic?: boolean;
}

export async function transcribeTrack(url: string, opts: TranscribeOptions = {}): Promise<Transcription> {
  opts.onProgress?.('decoding', 0.05);
  let { data, sampleRate, duration } = await decodeMono(url, opts.signal);

  // Trim to a bounded analysis window.
  if (duration > MAX_ANALYZE_SEC) {
    data = data.subarray(0, Math.floor(MAX_ANALYZE_SEC * sampleRate));
    duration = MAX_ANALYZE_SEC;
  }

  opts.onProgress?.('beat grid', 0.2);
  const beat = detectBeatsFromBuffer(data, sampleRate, duration);
  const bpm = beat.bpm || 120;
  const period = 60 / bpm;
  const firstBeatSec = beat.firstBeatSec || 0;

  const subdiv = 4;                                   // sixteenth-note grid
  const quantize = (raw: { startSec: number; durSec: number; midi: number; velocity: number }[], voice?: Voice): TNote[] =>
    raw.map(n => {
      const startBeat = Math.max(0, Math.round(((n.startSec - firstBeatSec) / period) * subdiv) / subdiv);
      const durBeats = Math.min(8, Math.max(0.25, Math.round((n.durSec / period) * subdiv) / subdiv));
      // In polyphonic mode the voice is assigned by register; else it's given.
      const v: Voice = voice ?? (n.midi < 55 ? 'bass' : 'melody');
      return { ...n, startBeat, durBeats, voice: v };
    });

  let notes: TNote[];
  if (opts.polyphonic) {
    // Full-band, decimated to 22.05 kHz for the FFT-based multi-pitch pass.
    const poly = decimate(data, sampleRate, POLY_RATE);
    const polyRaw = trackPolyphonic(poly.data, poly.rate, { onProgress: opts.onProgress });
    notes = quantize(polyRaw).sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  } else {
    // Melody: high-passed, decimated to ~11 kHz.
    opts.onProgress?.('melody', 0.4);
    const melodySrc = highPass(data, sampleRate, 140);
    const mel = decimate(melodySrc, sampleRate, 11025);
    const melodyRaw = trackVoice(mel.data, mel.rate, 'melody', {
      fmin: 110, fmax: 1320, minMidi: 55, maxMidi: 88, voiceThresh: 0.55, rms: 0.012,
    });
    // Bass: low-passed, decimated to ~5.5 kHz.
    opts.onProgress?.('bass', 0.7);
    const bassSrc = lowPass(data, sampleRate, 320);
    const bas = decimate(bassSrc, sampleRate, 5512);
    const bassRaw = trackVoice(bas.data, bas.rate, 'bass', {
      fmin: 41, fmax: 330, minMidi: 28, maxMidi: 55, voiceThresh: 0.5, rms: 0.02,
    });
    notes = [...quantize(melodyRaw, 'melody'), ...quantize(bassRaw, 'bass')]
      .sort((a, b) => a.startBeat - b.startBeat);
  }

  opts.onProgress?.('quantize', 0.95);
  const { key, mode, keyFifths } = detectKey(notes);

  opts.onProgress?.('done', 1);
  return {
    notes,
    bpm,
    key,
    mode,
    keyFifths,
    beatsPerMeasure: 4,
    beatUnit: 4,
    firstBeatSec,
    durationSec: duration,
    confidence: beat.confidence,
    backend: opts.polyphonic ? 'poly-dsp' : 'yin-dsp',
    polyphonic: !!opts.polyphonic,
  };
}

/** Which note (if any) of a voice is sounding at a given time — for live sync. */
export function noteAtTime(notes: TNote[], voice: Voice, currentSec: number, firstBeatSec: number, bpm: number): TNote | null {
  const period = 60 / bpm;
  const beatPos = (currentSec - firstBeatSec) / period;
  let active: TNote | null = null;
  for (const n of notes) {
    if (n.voice !== voice) continue;
    if (n.startBeat <= beatPos && beatPos < n.startBeat + n.durBeats) active = n;
    if (n.startBeat > beatPos) break;
  }
  return active;
}
