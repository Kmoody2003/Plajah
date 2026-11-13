// Chora — Audio to MIDI chord recognition (`chordsFromAudio.ts`).
//
// Pipeline:
//   1. Tempo & global key via `services/musicIntel/dsp.ts` (`measureAudio` / `estimateKey`),
//      or project time/key via `services/melos/beats/tempoMap.ts` (`songTime`) and `songKey.ts`.
//   2. Sub-bin parabolic peak-picked chroma vector per beat over [60 Hz, 2400 Hz].
//   3. Template matching across 12 roots × 7 qualities (`major`, `minor`, `7`, `maj7`, `m7`,
//      `dim`, `sus4`) with 7th-presence gating so triads are not misread as seventh chords.
//   4. Viterbi beat-grid smoothing (stronger continuity inside a bar, lighter across bar lines).
//   5. One chord symbol per bar in the exact format `services/melos/beats/band/chords.ts`
//      `parseChord` and `parseChart` consume.

import { estimateKey, fft, measureAudio } from '../../musicIntel/dsp';
import { parseChord } from '../beats/band/chords';
import type { GrooveDoc } from '../beats/grooveDoc';
import { docKey, parseKey, prefersFlats } from '../beats/songKey';
import { MeterMap, songTime, TempoMap } from '../beats/tempoMap';
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP, scalePitchClasses } from '../theory';

export type ChordQuality = '' | 'm' | '7' | 'maj7' | 'm7' | 'dim' | 'sus4';

export interface BeatChord {
  beat: number;
  startSec: number;
  endSec: number;
  symbol: string;
  root: number;
  quality: ChordQuality;
  confidence: number;
  chroma: number[];
}

export interface BarChord {
  bar: number;
  startSec: number;
  endSec: number;
  symbol: string;
  root: number;
  quality: ChordQuality;
  confidence: number;
}

export interface ChordRecognitionOptions {
  /** Beats per bar when no `doc` is supplied (default 4). */
  beatsPerBar?: number;
  /** Optional GrooveDoc: time & key go through `songTime(doc)` and `docKey(doc)` (never 60/bpm). */
  doc?: Pick<GrooveDoc, 'bpm' | 'tempoMap' | 'meter' | 'key' | 'showcaseMetadata'>;
  /** Continuity bonus within the same bar (default 0.75). */
  withinBarSmoothing?: number;
  /** Continuity bonus across a bar boundary (default 0.05). */
  acrossBarSmoothing?: number;
  /** Diatonic prior weight from global key estimate (default 0.025). */
  keyBias?: number;
}

export interface ChordRecognitionResult {
  /** One chord symbol per bar, guaranteed readable by `parseChord`. */
  chords: string[];
  /** Bar-separated Session Band chart string ("C | Am7 | Dm7 | G7"). */
  chart: string;
  bars: BarChord[];
  beats: BeatChord[];
  bpm: number;
  key: {
    tonic: number;
    mode: 'major' | 'minor';
    label: string;
    confidence: number;
  };
}

interface ChordTemplate {
  root: number;
  quality: ChordQuality;
  pcs: number[];
  seventhPc?: number;
  weights: Float64Array;
}

const QUALITY_SPECS: { quality: ChordQuality; intervals: number[]; seventh?: number }[] = [
  { quality: '', intervals: [0, 4, 7] },
  { quality: 'm', intervals: [0, 3, 7] },
  { quality: '7', intervals: [0, 4, 7, 10], seventh: 10 },
  { quality: 'maj7', intervals: [0, 4, 7, 11], seventh: 11 },
  { quality: 'm7', intervals: [0, 3, 7, 10], seventh: 10 },
  { quality: 'dim', intervals: [0, 3, 6] },
  { quality: 'sus4', intervals: [0, 5, 7] },
];

const NON_CHORD_PENALTY = 0.22;

const TEMPLATES: ChordTemplate[] = (() => {
  const list: ChordTemplate[] = [];
  for (let root = 0; root < 12; root++) {
    for (const spec of QUALITY_SPECS) {
      const pcs = spec.intervals.map((iv) => (root + iv) % 12);
      const weights = new Float64Array(12).fill(-NON_CHORD_PENALTY);
      const norm = 1 / Math.sqrt(pcs.length);
      for (const pc of pcs) weights[pc] = norm;
      list.push({
        root,
        quality: spec.quality,
        pcs,
        seventhPc: spec.seventh !== undefined ? (root + spec.seventh) % 12 : undefined,
        weights,
      });
    }
  }
  return list;
})();

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n <= 1) {
    if (n === 1) w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Extract L2-normalised 12-bin chroma over PCM slice `[s0, s1)`. */
export function beatChroma(pcm: Float32Array, sampleRate: number, startSec: number, endSec: number): Float64Array {
  const s0 = Math.max(0, Math.min(pcm.length, Math.round(startSec * sampleRate)));
  const s1 = Math.max(s0, Math.min(pcm.length, Math.round(endSec * sampleRate)));
  const chroma = new Float64Array(12);
  const len = s1 - s0;
  if (len < 32 || !Number.isFinite(sampleRate) || sampleRate <= 0) return chroma;

  const fftSize = sampleRate > 24000 ? 8192 : 4096;
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(2, Math.floor(58 / binHz));
  const maxBin = Math.min((fftSize >> 1) - 2, Math.ceil(2400 / binHz));
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const mag = new Float64Array(fftSize >> 1);

  const accumulateFrame = (offset: number, winLen: number, win: Float64Array) => {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < winLen; i++) re[i] = pcm[offset + i] * win[i];
    fft(re, im);
    for (let k = minBin - 1; k <= maxBin + 1; k++) mag[k] = Math.hypot(re[k], im[k]);

    let peakMax = 0;
    for (let k = minBin; k <= maxBin; k++) if (mag[k] > peakMax) peakMax = mag[k];
    if (peakMax <= 1e-9) return;
    const floor = peakMax * 0.04;

    for (let k = minBin; k <= maxBin; k++) {
      const y1 = mag[k];
      if (y1 < floor || y1 < mag[k - 1] || y1 < mag[k + 1]) continue;
      const y0 = mag[k - 1];
      const y2 = mag[k + 1];
      const denom = y0 - 2 * y1 + y2;
      const delta = Math.abs(denom) > 1e-12 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
      const hz = (k + delta) * binHz;
      if (hz < 58 || hz > 2400) continue;
      const midi = 69 + 12 * Math.log2(hz / 440);
      const nearest = Math.round(midi);
      const detune = Math.abs(midi - nearest);
      if (detune > 0.42) continue;
      const pc = ((nearest % 12) + 12) % 12;
      // Gently weight lower fundamentals over upper harmonics.
      const rolloff = 1 / (1 + 0.0005 * hz);
      const tuneWeight = Math.cos((detune / 0.42) * (Math.PI / 2));
      chroma[pc] += Math.log1p(16 * (y1 / peakMax)) * rolloff * tuneWeight;
    }
  };

  if (len <= fftSize) {
    const win = hannWindow(len);
    accumulateFrame(s0, len, win);
  } else {
    const win = hannWindow(fftSize);
    const hop = fftSize >> 1;
    for (let pos = s0; pos + fftSize <= s1; pos += hop) {
      accumulateFrame(pos, fftSize, win);
    }
  }

  let normSq = 0;
  for (let i = 0; i < 12; i++) normSq += chroma[i] * chroma[i];
  const norm = Math.sqrt(normSq);
  if (norm > 1e-12) {
    for (let i = 0; i < 12; i++) chroma[i] /= norm;
  }
  return chroma;
}

function scoreTemplates(
  chroma: Float64Array,
  inScale: boolean[],
  keyBias: number,
): Float64Array {
  const scores = new Float64Array(TEMPLATES.length);
  let total = 0;
  for (let i = 0; i < 12; i++) total += chroma[i];
  if (total <= 1e-9) return scores;

  for (let t = 0; t < TEMPLATES.length; t++) {
    const tpl = TEMPLATES[t];
    let s = 0;
    for (let pc = 0; pc < 12; pc++) s += chroma[pc] * tpl.weights[pc];

    // Seventh chords require genuine energy on the 7th, not merely overtone bleed from the 3rd.
    if (tpl.seventhPc !== undefined) {
      const triadMean = (chroma[tpl.pcs[0]] + chroma[tpl.pcs[1]] + chroma[tpl.pcs[2]]) / 3;
      const seventhVal = chroma[tpl.seventhPc];
      if (seventhVal < triadMean * 0.34) {
        s -= 0.12;
      } else {
        s += 0.025;
      }
    }

    // Root presence bonus: helps distinguish inversions and relative-key overlaps (e.g. Am7 vs C6).
    s += 0.03 * chroma[tpl.root];

    if (keyBias > 0) {
      let diatonicHits = 0;
      for (const pc of tpl.pcs) if (inScale[pc]) diatonicHits++;
      s += keyBias * (diatonicHits / tpl.pcs.length);
    }
    scores[t] = s;
  }
  return scores;
}

function formatSymbol(root: number, quality: ChordQuality, useFlats: boolean): string {
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const sym = `${names[((root % 12) + 12) % 12]}${quality}`;
  // Guarantee compatibility with `services/melos/beats/band/chords.ts`.
  return parseChord(sym) ? sym : names[((root % 12) + 12) % 12];
}

function deriveBeatGrid(
  durationSec: number,
  beatTimes: number[] | undefined,
  measuredBpm: number,
  tempoMap: TempoMap | null,
): { starts: number[]; ends: number[]; bpm: number } {
  if (beatTimes && beatTimes.length >= 2) {
    const clean = beatTimes.filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
    if (clean.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < clean.length; i++) {
        const d = clean[i] - clean[i - 1];
        if (d > 0.08) diffs.push(d);
      }
      diffs.sort((a, b) => a - b);
      const medianStep = diffs.length ? diffs[diffs.length >> 1] : 0.5;
      const starts = clean.filter((t) => t < durationSec - 1e-3);
      const ends = starts.map((t, i) =>
        i + 1 < starts.length ? Math.min(durationSec, starts[i + 1]) : Math.min(durationSec, t + medianStep),
      );
      return { starts, ends, bpm: Math.round((60 / medianStep) * 10) / 10 };
    }
  }

  if (tempoMap) {
    const totalBeats = Math.max(1, Math.floor(tempoMap.secToBeat(durationSec) + 1e-6));
    const starts: number[] = [];
    const ends: number[] = [];
    for (let b = 0; b < totalBeats; b++) {
      starts.push(tempoMap.beatToSec(b));
      ends.push(Math.min(durationSec, tempoMap.beatToSec(b + 1)));
    }
    return { starts, ends, bpm: tempoMap.bpmAt(0) };
  }

  const bpm = measuredBpm >= 40 && measuredBpm <= 240 ? measuredBpm : 120;
  const tempo = TempoMap.constant(bpm);
  const totalBeats = Math.max(1, Math.floor(tempo.secToBeat(durationSec) + 1e-6));
  const starts: number[] = [];
  const ends: number[] = [];
  for (let b = 0; b < totalBeats; b++) {
    starts.push(tempo.beatToSec(b));
    ends.push(Math.min(durationSec, tempo.beatToSec(b + 1)));
  }
  return { starts, ends, bpm };
}

/**
 * Recognise chords from mono PCM audio over a beat grid.
 * Returns one `parseChord`-valid chord symbol per bar plus per-beat detail.
 */
export function recognizeChordsFromAudio(
  pcm: Float32Array,
  sampleRate: number,
  beatTimes?: number[],
  opts: ChordRecognitionOptions = {},
): ChordRecognitionResult {
  const durationSec = sampleRate > 0 ? pcm.length / sampleRate : 0;
  const docMaps = opts.doc ? songTime(opts.doc as GrooveDoc) : null;
  const measured = durationSec >= 0.25 ? measureAudio(pcm, sampleRate, 1) : null;

  // Global key: prefer explicit GrooveDoc key when supplied, otherwise `dsp.ts` (`measureAudio` / `estimateKey`).
  const explicitKey = opts.doc ? docKey(opts.doc as GrooveDoc) : null;
  const parsedMeasuredKey = measured ? parseKey(measured.key.key) : null;
  const tonic = explicitKey?.tonic ?? parsedMeasuredKey?.tonic ?? 0;
  const mode: 'major' | 'minor' = explicitKey
    ? (explicitKey.scale === 'major' || explicitKey.scale === 'lydian' || explicitKey.scale === 'mixolydian' ? 'major' : 'minor')
    : (measured?.key.mode ?? 'major');
  const songKeyObj = explicitKey ?? { tonic, scale: mode };
  const useFlats = prefersFlats(songKeyObj);
  const inScale = scalePitchClasses(tonic, songKeyObj.scale);

  const { starts, ends, bpm } = deriveBeatGrid(
    durationSec,
    beatTimes,
    measured?.tempo.bpm ?? 0,
    docMaps?.tempo ?? null,
  );

  const withinBonus = opts.withinBarSmoothing ?? 0.75;
  const acrossBonus = opts.acrossBarSmoothing ?? 0.05;
  const keyBias = opts.keyBias ?? 0.025;
  const beatsPerBarDefault = Math.max(1, Math.round(opts.beatsPerBar ?? 4));
  const meter = docMaps?.meter ?? null;

  const isBarStart = (beatIdx: number): boolean => {
    if (beatIdx === 0) return true;
    if (meter) return meter.isBarLine(beatIdx);
    return beatIdx % beatsPerBarDefault === 0;
  };

  const numBeats = starts.length;
  if (!numBeats || durationSec <= 0) {
    const fallbackSym = formatSymbol(tonic, mode === 'minor' ? 'm' : '', useFlats);
    return {
      chords: [],
      chart: '',
      bars: [],
      beats: [],
      bpm: bpm || 120,
      key: {
        tonic,
        mode,
        label: measured?.key.key ?? `${fallbackSym} ${mode}`,
        confidence: measured?.key.confidence ?? 0,
      },
    };
  }

  const chromas: Float64Array[] = [];
  const rawBeatScores: Float64Array[] = [];
  const globalChroma = new Float64Array(12);
  for (let b = 0; b < numBeats; b++) {
    const c = beatChroma(pcm, sampleRate, starts[b], ends[b]);
    chromas.push(c);
    for (let pc = 0; pc < 12; pc++) globalChroma[pc] += c[pc];
  }

  // If `measureAudio` had a very short clip, refine key from aggregated beat chromas via `estimateKey`.
  let keyLabelStr = measured?.key.key ?? `${(useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[tonic]} ${mode}`;
  let keyConf = measured?.key.confidence ?? 0;
  if (!explicitKey && (!measured || measured.key.confidence === 0)) {
    const est = estimateKey(Array.from(globalChroma));
    const pk = parseKey(est.key);
    if (pk) {
      keyLabelStr = est.key;
      keyConf = est.confidence;
    }
  }

  for (let b = 0; b < numBeats; b++) {
    rawBeatScores.push(scoreTemplates(chromas[b], inScale, keyBias));
  }

  // Viterbi smoothing over the beat grid.
  const S = TEMPLATES.length;
  const dp = Array.from({ length: numBeats }, () => new Float64Array(S));
  const back = Array.from({ length: numBeats }, () => new Int32Array(S));
  dp[0].set(rawBeatScores[0]);

  for (let b = 1; b < numBeats; b++) {
    const stayBonus = isBarStart(b) ? acrossBonus : withinBonus;
    const prev = dp[b - 1];
    let bestPrevIdx = 0;
    let secondPrevIdx = 0;
    for (let s = 1; s < S; s++) {
      if (prev[s] > prev[bestPrevIdx]) {
        secondPrevIdx = bestPrevIdx;
        bestPrevIdx = s;
      } else if (secondPrevIdx === bestPrevIdx || prev[s] > prev[secondPrevIdx]) {
        secondPrevIdx = s;
      }
    }
    for (let s = 0; s < S; s++) {
      const stayScore = prev[s] + stayBonus;
      const switchIdx = bestPrevIdx === s ? secondPrevIdx : bestPrevIdx;
      const switchScore = prev[switchIdx];
      if (stayScore >= switchScore) {
        dp[b][s] = stayScore + rawBeatScores[b][s];
        back[b][s] = s;
      } else {
        dp[b][s] = switchScore + rawBeatScores[b][s];
        back[b][s] = switchIdx;
      }
    }
  }

  const path = new Int32Array(numBeats);
  let lastBest = 0;
  for (let s = 1; s < S; s++) if (dp[numBeats - 1][s] > dp[numBeats - 1][lastBest]) lastBest = s;
  path[numBeats - 1] = lastBest;
  for (let b = numBeats - 1; b > 0; b--) path[b - 1] = back[b][path[b]];

  const beats: BeatChord[] = [];
  for (let b = 0; b < numBeats; b++) {
    const idx = path[b];
    const tpl = TEMPLATES[idx];
    const sc = rawBeatScores[b];
    let runnerUp = -Infinity;
    for (let s = 0; s < S; s++) if (s !== idx && sc[s] > runnerUp) runnerUp = sc[s];
    const conf = Math.max(0, Math.min(1, Math.round(Math.max(0, sc[idx]) * (0.5 + 0.5 * Math.min(1, (sc[idx] - runnerUp) * 6)) * 100) / 100));
    beats.push({
      beat: b,
      startSec: starts[b],
      endSec: ends[b],
      symbol: formatSymbol(tpl.root, tpl.quality, useFlats),
      root: tpl.root,
      quality: tpl.quality,
      confidence: conf,
      chroma: Array.from(chromas[b], (v) => Math.round(v * 1000) / 1000),
    });
  }

  // Group beats into bars and emit one smoothed chord symbol per bar.
  const barGroups: number[][] = [];
  for (let b = 0; b < numBeats; b++) {
    if (isBarStart(b) || !barGroups.length) barGroups.push([b]);
    else barGroups[barGroups.length - 1].push(b);
  }

  const bars: BarChord[] = [];
  for (let barIdx = 0; barIdx < barGroups.length; barIdx++) {
    const group = barGroups[barIdx];
    const aggScores = new Float64Array(S);
    for (const b of group) {
      for (let s = 0; s < S; s++) aggScores[s] += rawBeatScores[b][s];
      aggScores[path[b]] += 0.08;
    }
    let winIdx = 0;
    for (let s = 1; s < S; s++) if (aggScores[s] > aggScores[winIdx]) winIdx = s;
    const meanBest = aggScores[winIdx] / group.length;
    let second = -Infinity;
    for (let s = 0; s < S; s++) if (s !== winIdx && aggScores[s] / group.length > second) second = aggScores[s] / group.length;
    const tpl = TEMPLATES[winIdx];
    const conf = Math.max(0, Math.min(1, Math.round(Math.max(0, meanBest) * (0.5 + 0.5 * Math.min(1, (meanBest - second) * 6)) * 100) / 100));
    bars.push({
      bar: barIdx,
      startSec: starts[group[0]],
      endSec: ends[group[group.length - 1]],
      symbol: formatSymbol(tpl.root, tpl.quality, useFlats),
      root: tpl.root,
      quality: tpl.quality,
      confidence: conf,
    });
  }

  const chords = bars.map((b) => b.symbol);
  return {
    chords,
    chart: chords.join(' | '),
    bars,
    beats,
    bpm,
    key: {
      tonic,
      mode,
      label: keyLabelStr,
      confidence: keyConf,
    },
  };
}
