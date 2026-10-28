// MEKA Sampler — slicing. Where to cut a sample (transients, a tempo grid, equal parts, or by
// hand), and how slices land: one pad each in Maschine order, optionally with a pattern that
// plays them back in their original timing. Pure: positions in samples, no audio context.

import type { GrooveDoc, Pattern, SampleRef } from '../grooveDoc';
import { PAD_BANK } from '../grooveDoc';

export type SliceMode = 'detect' | 'grid' | 'split' | 'manual';

/** Onset positions by spectral-energy rise. `sensitivity` 0..1 (higher = more slices). Always
 *  starts at 0; no two cuts closer than `minGapSec`. Cuts snap back to the nearest quiet point. */
export function transientSlices(x: Float32Array, sr: number, sensitivity = 0.5, minGapSec = 0.06): number[] {
  const hop = Math.max(64, Math.round(sr * 0.005));
  const win = hop * 2;
  const frames = Math.max(0, Math.floor((x.length - win) / hop));
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop, end = i + win; i < end; i++) e += x[i] * x[i];
    energy[f] = Math.log10(1e-9 + e / win);
  }
  // Rise in log energy over a short look-back, thresholded against the local mean.
  const flux = new Float32Array(frames);
  for (let f = 2; f < frames; f++) flux[f] = Math.max(0, energy[f] - Math.max(energy[f - 1], energy[f - 2]));
  const thr = 0.15 + (1 - Math.min(1, Math.max(0, sensitivity))) * 1.1; // log10 units ≈ 1.5–12 dB
  let peakE = -9;
  for (let f = 0; f < frames; f++) if (energy[f] > peakE) peakE = energy[f];
  const floor = peakE - 4.5; // ignore rises 45 dB under the loudest frame
  const minGap = Math.round((minGapSec * sr) / hop);
  const out = [0];
  let last = -minGap;
  for (let f = 1; f < frames - 1; f++) {
    if (flux[f] < thr || flux[f] < flux[f - 1] || flux[f] < flux[f + 1] || energy[f] < floor) continue;
    if (f - last < minGap) continue;
    const pos = quietBefore(x, f * hop, hop * 2);
    if (pos - out[out.length - 1] > (minGapSec * sr) / 2) out.push(pos);
    last = f;
  }
  return out;
}

/** The lowest-level sample in the `span` before `pos` — a cut there doesn't click. */
function quietBefore(x: Float32Array, pos: number, span: number): number {
  let best = pos, bestA = Infinity;
  for (let i = Math.max(0, pos - span); i <= pos && i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a < bestA) { bestA = a; best = i; }
  }
  return best;
}

/** Cuts every `beats` at `bpm` (a loop at the song tempo → 16ths, 8ths…). */
export function gridSlices(length: number, sr: number, bpm: number, beats: number): number[] {
  const step = Math.max(1, Math.round((60 / Math.max(20, bpm)) * beats * sr));
  const out: number[] = [];
  for (let p = 0; p < length - step / 4; p += step) out.push(p);
  return out.length ? out : [0];
}

/** `n` equal parts. */
export function splitSlices(length: number, n: number): number[] {
  const k = Math.max(1, Math.min(64, Math.round(n)));
  return Array.from({ length: k }, (_, i) => Math.round((i * length) / k));
}

/** Clean a cut list: sorted, unique, inside the sample, starting at 0. */
export function normalizeCuts(cuts: number[], length: number): number[] {
  const s = [...new Set(cuts.map((c) => Math.max(0, Math.min(length - 1, Math.round(c)))))].sort((a, b) => a - b);
  if (s[0] !== 0) s.unshift(0);
  return s;
}

/** Cuts → [start, end) regions. */
export function regions(cuts: number[], length: number): { start: number; end: number }[] {
  const c = normalizeCuts(cuts, length);
  return c.map((s, i) => ({ start: s, end: i + 1 < c.length ? c[i + 1] : length }));
}

/** Detect the tempo a loop implies if it is `bars` long in 4/4 (for the grid mode default). */
export function loopBpm(length: number, sr: number, bars = 1): number {
  const sec = length / sr;
  let bpm = (bars * 4 * 60) / sec;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

/**
 * Put slices on pads: slice k → pad `startPad + k` in Group `bank` (Maschine order), as many as
 * fit in the Group. `refs[k]` is slice k ingested as its own sample. Returns the pads written.
 */
export function slicesToPads(doc: GrooveDoc, bank: number, startPad: number, refs: SampleRef[], baseName: string, color: string): number[] {
  const out: number[] = [];
  for (let k = 0; k < refs.length; k++) {
    const local = startPad + k;
    if (local >= PAD_BANK) break;
    const idx = bank * PAD_BANK + local;
    const pad = doc.kit[idx];
    if (!pad) break;
    const ref = refs[k];
    pad.source = 'sample';
    pad.sample = ref;
    pad.drumSynth = undefined;
    pad.instrumentTrackId = undefined;
    pad.empty = false;
    pad.mute = false;
    pad.name = `${baseName.slice(0, 13)} ${k + 1}`;
    pad.color = color;
    pad.pitchSemis = 0;
    pad.startSec = 0;
    pad.choke = 0;
    // A slice plays to its end, like Maschine's one-shot slices.
    pad.env = { attackMs: 0, holdMs: Math.round(ref.durationSec * 1000), decayMs: 30, sustain: 0, releaseMs: 30 };
    pad.filter = { type: 'off', cutoff: 8000, q: 0.8 };
    out.push(idx);
  }
  return out;
}

/**
 * Write a pattern that plays the slices in their original timing (Maschine "slices to pattern"):
 * each slice's start, at `bpm`, quantized to the pattern's 16th grid. Grows the pattern to fit.
 */
export function slicesToPattern(pattern: Pattern, pads: number[], startsSec: number[], bpm: number): void {
  const sixteenth = 60 / Math.max(20, bpm) / 4;
  const steps = startsSec.map((s) => Math.round(s / sixteenth));
  const need = Math.max(pattern.length, Math.ceil(((steps[steps.length - 1] ?? 0) + 1) / 16) * 16);
  pattern.length = Math.min(64, need) as Pattern['length'];
  if (!pattern.steps) pattern.steps = {};
  // The slices' rows replay the loop alone — old hits (and drawn notes) on those pads go.
  pads.forEach((pad, k) => {
    pattern.steps[pad] = {};
    if (pattern.melo) delete pattern.melo[pad];
    const st = steps[k];
    if (st === undefined || st >= pattern.length) return;
    pattern.steps[pad][st] = { v: 100 };
  });
}
