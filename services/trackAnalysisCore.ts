// trackAnalysisCore — the per-track audio analysis every surface shares (waveform peaks, beat grid,
// meter, and the song map), computed from decoded mono PCM. Pure: no Firebase, no DOM, no AudioContext,
// so the browser (djAnalysis.ts) and the server (Music Intelligence's worker, at upload) build the SAME
// record. Stored once in Firestore `trackAnalysis/{trackId}` and read by Chora, the DJ decks, the
// Breakdown and the visualizers — it follows the song everywhere, for everyone.
import { detectBeatsFromBuffer } from './audioBeatDetection';
import type { AudioAnalysis } from '../types';

// Bump when the peak/beat algorithm or stored shape changes so stale docs recompute.
// v2: persist the detected meter (beatsPerMeasure/downbeat) + sampleRate so the full beat
// grid loads with the song and consumers (Breakdown, DJ) never re-decode.
export const ANALYSIS_VERSION = 2;
export const PEAK_BUCKETS = 1024;   // waveform resolution stored per track (compact, Firestore-friendly)
export const MAX_STORED_BEATS = 2048;

/** Downsample mono PCM to normalized 0–1 peak buckets for waveform rendering. */
export function extractPeaks(data: Float32Array, buckets = PEAK_BUCKETS): number[] {
  const step = Math.max(1, Math.floor(data.length / buckets));
  const peaks = new Array<number>(buckets).fill(0);
  let globalMax = 1e-4;
  for (let i = 0; i < buckets; i++) {
    const start = i * step;
    let max = 0;
    for (let j = 0; j < step && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }
  for (let i = 0; i < buckets; i++) peaks[i] = Math.round((peaks[i] / globalMax) * 1000) / 1000;
  return peaks;
}

/** Build the full analysis from already-decoded mono PCM (no extra fetch). */
export function analysisFromMono(data: Float32Array, sampleRate: number, duration: number): AudioAnalysis {
  const beat = detectBeatsFromBuffer(data, sampleRate, duration);
  return {
    version: ANALYSIS_VERSION,
    bpm: beat.bpm,
    confidence: beat.confidence,
    firstBeatSec: beat.firstBeatSec,
    duration,
    peaks: extractPeaks(data),
    beats: beat.beats.slice(0, MAX_STORED_BEATS),
    // Persist the meter so the bar grid is part of the saved analysis (loads with the song).
    beatsPerMeasure: beat.beatsPerMeasure ?? 4,
    downbeatSec: beat.downbeatSec ?? beat.firstBeatSec,
    downbeatIndex: beat.downbeatIndex ?? 0,
    meterConfidence: beat.meterConfidence ?? 0,
    sampleRate,
  };
}

/** Interleaved PCM → mono (average of channels). */
export function downmix(pcm: Float32Array, channels: number): Float32Array {
  if (channels <= 1) return pcm;
  const n = Math.floor(pcm.length / channels), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < channels; c++) s += pcm[i * channels + c]; out[i] = s / channels; }
  return out;
}

/** Peaks resampled to the resolution a waveform view draws (e.g. the DJ deck's 800 points). */
export function resamplePeaks(peaks: ArrayLike<number>, points: number): Float32Array {
  const out = new Float32Array(points), n = peaks.length;
  if (!n) return out;
  for (let i = 0; i < points; i++) {
    const a = Math.floor(i * n / points), b = Math.max(a + 1, Math.floor((i + 1) * n / points));
    let m = 0; for (let k = a; k < b && k < n; k++) m = Math.max(m, peaks[k]);
    out[i] = m;
  }
  return out;
}
