// The Muse asset model + analyser — one record for every kind of production asset (instrument
// preset, drum kit, sample, loop, audio file, MIDI), and the musical read Melos runs on import so
// the library is searchable by "F minor, ~90 BPM", not just by filename.
//
// The analyser is native + cheap: a small FFT → chroma → Krumhansl-Schmuckler key correlation for
// the key, the shared beat detector for tempo, and peaks for the inspector waveform. It runs once
// per asset and the result is cached on the record.

import { detectBeatsFromBuffer } from '../../../audioBeatDetection';

export type MuseKind = 'instrument' | 'kit' | 'sample' | 'loop' | 'audio' | 'midi';
export type MuseSource = 'project' | 'cloud' | 'local' | 'factory';

export interface MuseAnalysis {
  keyRoot: number | null;   // 0..11 pitch class, or null if unpitched/uncertain
  keyMode: 'major' | 'minor' | null;
  bpm: number | null;
  bars: number | null;
  durationSec: number;
  sampleRate: number;
  channels: number;
}

export interface MuseAsset {
  id: string;
  kind: MuseKind;
  name: string;
  source: MuseSource;
  /** How to fetch/audition it: an OPFS/locker sample key, a File handle, a preset id, etc. */
  ref: { sampleKey?: string; lockerUrl?: string; presetName?: string; fileName?: string };
  analysis?: MuseAnalysis;
  tags: string[];
  /** Category accent seed (reuses presetArt.accentFor via the kind→category map). */
  category?: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const keyLabel = (a?: MuseAnalysis): string => {
  if (!a || a.keyRoot == null || !a.keyMode) return '—';
  return `${NOTE_NAMES[a.keyRoot]} ${a.keyMode === 'minor' ? 'min' : 'maj'}`;
};

// ── FFT (iterative radix-2, in place on re/im) ───────────────────────────────
function fft(re: Float32Array, im: Float32Array): void {
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
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cwr - im[b] * cwi;
        const ti = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}

// Krumhansl-Schmuckler key profiles (major, minor), normalised at correlation time.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(chroma: number[], profile: number[], rot: number): number {
  let sx = 0, sy = 0;
  for (let i = 0; i < 12; i++) { sx += chroma[i]; sy += profile[i]; }
  const mx = sx / 12, my = sy / 12;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < 12; i++) {
    const a = chroma[(i + rot) % 12] - mx, b = profile[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Average chroma → best key by Krumhansl correlation. Returns null root when clearly unpitched. */
function detectKey(mono: Float32Array, sampleRate: number): { root: number | null; mode: 'major' | 'minor' | null } {
  const N = 4096;
  if (mono.length < N) return { root: null, mode: null };
  const chroma = new Array(12).fill(0);
  const hop = N; // non-overlapping frames — cheap, plenty for a key estimate
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); // Hann
  const re = new Float32Array(N), im = new Float32Array(N);
  let frames = 0;
  for (let start = 0; start + N <= mono.length && frames < 240; start += hop, frames++) {
    for (let i = 0; i < N; i++) { re[i] = mono[start + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let bin = 1; bin < N / 2; bin++) {
      const freq = (bin * sampleRate) / N;
      if (freq < 55 || freq > 5000) continue; // A1..~D8, where pitch lives
      const mag = Math.hypot(re[bin], im[bin]);
      const midi = Math.round(12 * Math.log2(freq / 440) + 69);
      chroma[((midi % 12) + 12) % 12] += mag;
    }
  }
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total < 1e-3) return { root: null, mode: null };
  let best = { score: -2, root: 0, mode: 'major' as 'major' | 'minor' };
  for (let r = 0; r < 12; r++) {
    const maj = correlate(chroma, MAJOR, r);
    const min = correlate(chroma, MINOR, r);
    if (maj > best.score) best = { score: maj, root: r, mode: 'major' };
    if (min > best.score) best = { score: min, root: r, mode: 'minor' };
  }
  if (best.score < 0.5) return { root: null, mode: null }; // not convincingly tonal (drums read flat)
  return { root: best.root, mode: best.mode };
}

function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
  const out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = (l[i] + r[i]) * 0.5;
  return out;
}

/** The full musical read of a decoded buffer. Cheap enough to run on import. */
export function analyzeBuffer(buffer: AudioBuffer): MuseAnalysis {
  const mono = toMono(buffer);
  const duration = buffer.duration;
  const key = detectKey(mono, buffer.sampleRate);
  // Tempo only makes sense past ~1s; below that treat it as a one-shot (no bpm).
  let bpm: number | null = null, bars: number | null = null;
  if (duration >= 1) {
    try {
      const beat = detectBeatsFromBuffer(mono, buffer.sampleRate, duration);
      if (beat.bpm && beat.confidence > 0.15) {
        bpm = Math.round(beat.bpm);
        const beatsTotal = (duration / 60) * bpm;
        bars = Math.max(1, Math.round(beatsTotal / 4));
      }
    } catch { /* leave bpm null */ }
  }
  return {
    keyRoot: key.root, keyMode: key.mode, bpm, bars,
    durationSec: duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels,
  };
}

/** Which category (and accent) a kind reads as in the browser. */
export const CATEGORY_FOR: Record<MuseKind, string> = {
  instrument: 'Instruments', kit: 'Drum kits', sample: 'Samples', loop: 'Loops', audio: 'Audio files', midi: 'MIDI',
};
