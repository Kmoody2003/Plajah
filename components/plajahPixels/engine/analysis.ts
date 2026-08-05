// engine/analysis.ts — band analysis that runs off the app's EXISTING
// AnalyserNode (App.tsx owns the single AudioContext/analyser/source). This
// lets the studio scenes, timeline, and matte share the same audio pipeline
// as the original visualizer instead of creating a conflicting second source.

import { AudioBands } from './params';

export interface BeatState {
  bass: number; mid: number; treble: number; level: number;
  beat: number; bpm: number;
  hist: number[]; hold: number; lastBeat: number; intervals: number[];
}

export function createBeatState(): BeatState {
  return { bass: 0, mid: 0, treble: 0, level: 0, beat: 0, bpm: 0, hist: [], hold: 0, lastBeat: 0, intervals: [] };
}

/**
 * Read the analyser, update smoothed bands + beat/bpm in `s`, and return the
 * raw smoothed bands. Band indices scale with the analyser's bin count so it
 * stays correct if config.fftSize changes.
 */
export function analyzeBands(analyser: AnalyserNode, data: Uint8Array, smoothing: number, s: BeatState): AudioBands {
  analyser.getByteFrequencyData(data as any);
  const n = analyser.frequencyBinCount;
  const k = n / 1024; // our index ranges were tuned for 1024 bins
  const band = (lo: number, hi: number) => {
    const a = Math.max(0, Math.round(lo * k)), b = Math.min(n, Math.round(hi * k));
    let sum = 0, c = 0; for (let i = a; i < b; i++) { sum += data[i]; c++; }
    return c ? sum / c / 255 : 0;
  };
  const bR = band(1, 8), mR = band(8, 60), tR = band(60, 220), lR = band(1, 240);
  const sm = Math.min(0.96, Math.max(0.4, smoothing));
  s.bass = s.bass * sm + bR * (1 - sm);
  s.mid = s.mid * sm + mR * (1 - sm);
  s.treble = s.treble * sm + tR * (1 - sm);
  s.level = s.level * sm + lR * (1 - sm);

  s.hist.push(bR); if (s.hist.length > 43) s.hist.shift();
  const avg = s.hist.reduce((a, x) => a + x, 0) / s.hist.length;
  s.hold = Math.max(0, s.hold - 1);
  if (bR > avg * 1.32 && bR > 0.18 && s.hold === 0) {
    s.beat = 1; s.hold = 8;
    const now = performance.now();
    if (s.lastBeat) {
      const iv = now - s.lastBeat;
      if (iv > 250 && iv < 1200) {
        s.intervals.push(iv); if (s.intervals.length > 8) s.intervals.shift();
        const m = s.intervals.reduce((a, x) => a + x, 0) / s.intervals.length;
        s.bpm = Math.round(60000 / m);
      }
    }
    s.lastBeat = now;
  } else s.beat *= 0.86;

  return { bass: s.bass, mid: s.mid, treble: s.treble, level: s.level, beat: s.beat };
}
