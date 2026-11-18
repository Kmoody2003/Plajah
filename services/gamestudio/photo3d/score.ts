// Fidelity score: how close the model is to the reference, measured, per axis, so a round is judged by numbers
// and not by eye (feedback: score from every angle, keep correcting to ≥95%).
//
// Two sources, kept apart:
// - pixels, where there is truth: the render from the photo's own camera against the photo (silhouette IoU,
//   outline distance, CIE Lab colour) — same measures as the Forge's forgeFidelity.ts;
// - the eye's open gap items, where there is no pixel truth: materials, props, other angles, depth.
// The overall score is a weighted mean of five axes. The vision model's own 0..100 guess is reported beside it
// and never replaces it.

import { GAP_AXES, gapCost, type GapAxis, type GapItem } from './gapReport';

export interface Picture { width: number; height: number; /** RGBA, 8-bit. */ data: Uint8Array | Uint8ClampedArray }

export interface ViewScore {
  /** Silhouette intersection over union, 0..1. */
  iou: number;
  /** Mean distance between the two outlines, as a fraction of the subject's height. */
  outline: number;
  /** Mean CIE76 ΔE over blocks both pictures cover. */
  deltaE: number;
  /** Fraction of the photo's subject the colour comparison covered. */
  colourCover: number;
  shape: number;
  colour: number;
}

export const AXIS_WEIGHT: Record<GapAxis, number> = { silhouette: 0.3, geometry: 0.2, colour: 0.2, material: 0.15, prop: 0.15 };

export interface FidelityScore {
  overall: number;
  axes: Record<GapAxis, number>;
  pixel: ViewScore | null;
  /** What the open gap items cost each axis. */
  gapCost: Record<GapAxis, number>;
  visionScore?: number;
}

const inside = (p: Picture, i: number) => p.data[i * 4 + 3] > 127;

/** Outline pixels (inside, with an outside 4-neighbour). */
function outlineOf(p: Picture): Uint8Array {
  const { width: w, height: h } = p;
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!inside(p, i)) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !inside(p, i - 1) || !inside(p, i + 1) || !inside(p, i - w) || !inside(p, i + w)) o[i] = 1;
  }
  return o;
}

/** Distance (pixels) to the nearest set pixel, 3-4 chamfer, two passes. */
function distanceTo(set: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = set[i] ? 0 : 1e9;
  const relax = (i: number, j: number, c: number) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x > 0) relax(i, i - 1, 3);
    if (y > 0) { relax(i, i - w, 3); if (x > 0) relax(i, i - w - 1, 4); if (x < w - 1) relax(i, i - w + 1, 4); }
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (x < w - 1) relax(i, i + 1, 3);
    if (y < h - 1) { relax(i, i + w, 3); if (x < w - 1) relax(i, i + w + 1, 4); if (x > 0) relax(i, i + w - 1, 4); }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** sRGB 8-bit → CIE Lab (D65). */
export function toLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Compare a render with the photo it was rendered to match (same size, same camera). Alpha is the subject mask
 * in both. Colour is compared in blocks (default 1/48 of the subject's height) so texture noise and a pixel of
 * misalignment don't read as colour error.
 */
export function scoreView(photo: Picture, render: Picture, opts: { block?: number } = {}): ViewScore {
  if (photo.width !== render.width || photo.height !== render.height) throw new Error('scoreView needs pictures of the same size');
  const { width: w, height: h } = photo;
  let inter = 0, uni = 0, top = h, bottom = -1;
  for (let i = 0; i < w * h; i++) {
    const a = inside(photo, i), b = inside(render, i);
    if (a && b) inter++;
    if (a || b) uni++;
    if (a) { const y = (i / w) | 0; if (y < top) top = y; if (y > bottom) bottom = y; }
  }
  const height = Math.max(1, bottom - top + 1);
  const iou = uni ? inter / uni : 1;
  // Outline distance both ways (symmetric chamfer).
  const oa = outlineOf(photo), ob = outlineOf(render);
  const da = distanceTo(oa, w, h), db = distanceTo(ob, w, h);
  let sum = 0, n = 0;
  for (let i = 0; i < w * h; i++) { if (oa[i]) { sum += Math.min(db[i], height); n++; } if (ob[i]) { sum += Math.min(da[i], height); n++; } }
  const outline = n ? sum / n / height : 1;
  // Colour by blocks.
  const bs = Math.max(2, opts.block ?? Math.round(height / 48));
  let de = 0, blocks = 0, covered = 0, photoBlocks = 0;
  for (let by = 0; by < h; by += bs) for (let bx = 0; bx < w; bx += bs) {
    const sa = [0, 0, 0], sb = [0, 0, 0]; let na = 0, nb = 0, both = 0;
    for (let y = by; y < Math.min(h, by + bs); y++) for (let x = bx; x < Math.min(w, bx + bs); x++) {
      const i = y * w + x, a = inside(photo, i), b = inside(render, i);
      if (a) { na++; }
      if (a && b) { both++; for (let k = 0; k < 3; k++) { sa[k] += photo.data[i * 4 + k]; sb[k] += render.data[i * 4 + k]; } }
    }
    if (na > (bs * bs) / 2) photoBlocks++;
    if (both < (bs * bs) / 2) continue;
    const la = toLab(sa[0] / both, sa[1] / both, sa[2] / both), lb = toLab(sb[0] / both, sb[1] / both, sb[2] / both);
    de += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]); blocks++; covered++;
  }
  const deltaE = blocks ? de / blocks : 100;
  // Shape: IoU held back by outline error (1% of the height costs 2 points past the first half percent).
  const shape = Math.max(0, Math.min(1, iou - Math.max(0, outline - 0.005) * 2));
  // Colour: ΔE 3 is a match by eye, ΔE 33 none; uncovered photo blocks count as misses.
  const cover = photoBlocks ? Math.min(1, covered / photoBlocks) : 0;
  const colour = Math.max(0, Math.min(1, 1 - (deltaE - 3) / 30)) * cover;
  return { iou, outline, deltaE, colourCover: cover, shape, colour };
}

/** Combine the pixel view score and the open gap items into the five axes and the overall score. */
export function fidelity(pixel: ViewScore | null, items: GapItem[], visionScore?: number): FidelityScore {
  const cost = gapCost(items);
  const axes = {} as Record<GapAxis, number>;
  for (const a of GAP_AXES) {
    const measured = a === 'silhouette' ? pixel?.shape : a === 'colour' ? pixel?.colour : undefined;
    axes[a] = Math.max(0, (measured ?? 1) * (1 - cost[a]));
  }
  // Geometry without depth truth: the silhouette is the floor of what the photo proves, so geometry can't beat it by much.
  if (pixel) axes.geometry = Math.min(axes.geometry, pixel.shape + 0.05);
  let s = 0, wsum = 0;
  for (const a of GAP_AXES) { s += axes[a] * AXIS_WEIGHT[a]; wsum += AXIS_WEIGHT[a]; }
  return { overall: s / wsum, axes, pixel, gapCost: cost, ...(visionScore !== undefined ? { visionScore } : {}) };
}

export interface LoopPolicy { target: number; aim: number; minGain: number; patience: number; maxRounds: number }
export const DEFAULT_POLICY: LoopPolicy = { target: 0.95, aim: 0.99, minGain: 0.005, patience: 2, maxRounds: 8 };

export type LoopVerdict =
  | { stop: false; why: 'improving' | 'below target' }
  | { stop: true; why: 'reached aim' | 'passed target, gains flattened' | 'stalled' | 'out of rounds' | 'got worse' | 'eye unavailable' };

/**
 * After each round: keep going while there is real progress. Passing 95% is not a stop by itself; the loop
 * aims for 99% and stops when gains flatten. Below 95% it only stops when it stalls or runs out of rounds,
 * and then the result is reported as NOT finished.
 */
export function loopVerdict(scores: number[], policy: LoopPolicy = DEFAULT_POLICY): LoopVerdict {
  const last = scores[scores.length - 1] ?? 0;
  if (last >= policy.aim) return { stop: true, why: 'reached aim' };
  if (scores.length > policy.maxRounds) return { stop: true, why: 'out of rounds' };
  const best = Math.max(...scores);
  // Rounds since the best score was last improved by at least minGain.
  let sinceGain = 0;
  for (let i = scores.length - 1; i > 0; i--) {
    const before = Math.max(...scores.slice(0, i));
    if (scores[i] >= before + policy.minGain) break;
    sinceGain++;
  }
  if (scores.length >= 3 && last < best - 0.05) return { stop: true, why: 'got worse' };
  if (sinceGain >= policy.patience) return { stop: true, why: last >= policy.target ? 'passed target, gains flattened' : 'stalled' };
  return { stop: false, why: last >= policy.target ? 'improving' : 'below target' };
}

export const passes = (score: FidelityScore, policy: LoopPolicy = DEFAULT_POLICY) => score.overall >= policy.target;
