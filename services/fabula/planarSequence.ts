// planarSequence — VectorTrack's multi-frame PLANAR tracker (the Mocha "Track" module core).
//
// A surface is a user-drawn quad on a reference frame. Inside it we track a grid of
// features frame-to-frame; each frame we solve the reference→current homography from the
// features that survive outlier rejection, then RE-ANCHOR: the next frame's seeds are the
// reference features projected through the solved H (not the raw per-feature matches), so
// individual features cannot random-walk off the plane. Failure is explicit: a sample
// whose inlier count or confidence falls under the thresholds is stored as `lost` and the
// runner stops, instead of silently persisting garbage.
//
// Everything here is pure and frame-index based, so the live monitor, the offline export
// and the tests share one sampler (the parity contract the rest of Fabula follows).
import { trackPoint, patchTexture, type GrayFrame } from './vectorTrack';
import {
  solveHomography, transformPoint, invertHomography, multiplyMat3, unitToQuad,
  type Mat3, type Point2, type Quad,
} from './planarTrack';

export interface PlanarFrameSample {
  frame: number;
  /** reference → current */
  matrix: Mat3;
  corners: Quad;
  /** Current positions of every feature (same order as the sequence's `features`). */
  features: Point2[];
  featureConfidence: number[];
  /** Features that agreed with the solved plane. */
  inliers: number;
  confidence: number;
  rmsError: number;
  manual?: boolean;
  /** Tracking failed on this frame — consumers hold the last good sample. */
  lost?: boolean;
}
export interface PlanarSettings {
  patchRadius: number; searchRadius: number; minConfidence: number;
  /** Features per side inside the surface (3 → 9 features). */
  gridSize: number;
  /** Max reprojection residual (normalized) a feature may have and still be an inlier. */
  maxResidual: number;
  /** Fewest inliers for a solve to count. A homography needs 4. */
  minInliers: number;
  /** Per-feature match confidence below which the feature is dropped before solving. */
  minFeatureConfidence: number;
}
export interface PlanarTrackSequence {
  id: string; sourceAssetId: string; version: 1; fps: number;
  referenceFrame: number; referenceCorners: Quad;
  /** Reference-frame positions of the tracked features. */
  features: Point2[];
  samples: PlanarFrameSample[];
  settings: PlanarSettings;
  /** Analysis raster the samples were produced on (informational — coordinates are normalized). */
  width?: number; height?: number;
}

export const PLANAR_DEFAULTS: PlanarSettings = {
  patchRadius: 7, searchRadius: 28, minConfidence: .48,
  gridSize: 3, maxResidual: .012, minInliers: 4, minFeatureConfidence: .3,
};

/** Bilinear point inside a quad (TL,TR,BR,BL) at (u,v) in 0..1. */
export function quadPoint(quad: Quad, u: number, v: number): Point2 {
  const top = { x: quad[0].x + (quad[1].x - quad[0].x) * u, y: quad[0].y + (quad[1].y - quad[0].y) * u };
  const bot = { x: quad[3].x + (quad[2].x - quad[3].x) * u, y: quad[3].y + (quad[2].y - quad[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

/** A gridSize×gridSize feature lattice inset from the surface edges (edges tend to sit on
 * the background). `reference` lets us skip flat, untrackable cells. */
export function surfaceFeatures(corners: Quad, gridSize = 3, reference?: GrayFrame, patchRadius = 7): Point2[] {
  const n = Math.max(2, gridSize), inset = .12, out: Point2[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = inset + (1 - 2 * inset) * (i / (n - 1)), v = inset + (1 - 2 * inset) * (j / (n - 1));
    const p = quadPoint(corners, u, v);
    if (reference && patchTexture(reference, p.x, p.y, patchRadius) < .02) continue; // flat cell
    out.push(p);
  }
  // Never return fewer than the four corners' worth of features — fall back to the full lattice.
  if (out.length < 4) { out.length = 0; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push(quadPoint(corners, inset + (1 - 2 * inset) * (i / (n - 1)), inset + (1 - 2 * inset) * (j / (n - 1)))); }
  return out;
}

export function createPlanarSequence(sourceAssetId: string, fps: number, referenceFrame: number, corners: Quad, id = `planar-${Date.now()}`, opts: { settings?: Partial<PlanarSettings>; reference?: GrayFrame; width?: number; height?: number } = {}): PlanarTrackSequence {
  const settings = { ...PLANAR_DEFAULTS, ...(opts.settings || {}) };
  return {
    id, sourceAssetId, version: 1, fps, referenceFrame, referenceCorners: corners,
    features: surfaceFeatures(corners, settings.gridSize, opts.reference, settings.patchRadius),
    samples: [], settings, width: opts.width, height: opts.height,
  };
}

/** Identity sample for the reference frame itself. */
export function referenceSample(sequence: PlanarTrackSequence): PlanarFrameSample {
  return { frame: sequence.referenceFrame, matrix: [1,0,0, 0,1,0, 0,0,1], corners: sequence.referenceCorners, features: sequence.features, featureConfidence: sequence.features.map(() => 1), inliers: sequence.features.length, confidence: 1, rmsError: 0, manual: true };
}

export interface PlanarFrameResult {
  sample: PlanarFrameSample;
  /** Seeds for the next frame: reference features re-projected through the solved plane. */
  corners: Quad;
  features: Point2[];
  accepted: boolean;
  reason?: string;
}

/** Track the surface from `previous` into `next`. `current` = the feature positions in
 * `previous` (same order as `sequence.features`; four points are accepted as corners for the
 * legacy call shape). `velocity` (normalized/frame) centres the search window on a prediction. */
export function trackPlanarFrame(sequence: PlanarTrackSequence, previous: GrayFrame, next: GrayFrame, frame: number, current: Point2[], velocity?: Point2[] | null): PlanarFrameResult | null {
  const { settings } = sequence;
  const refPts = current.length === sequence.features.length ? sequence.features : (current.length === 4 ? sequence.referenceCorners : null);
  if (!refPts) return null;
  const tracked = current.map((p, i) => trackPoint(previous, next, p.x, p.y, settings.patchRadius, settings.searchRadius, velocity?.[i] ? { x: p.x + velocity[i].x, y: p.y + velocity[i].y } : undefined));
  const featureConfidence = tracked.map(t => t.confidence);

  // Robust solve: drop weak matches, then iteratively drop the worst reprojection residual
  // until every remaining feature lies on the plane (or we run out of features).
  let idx = tracked.map((_, i) => i).filter(i => featureConfidence[i] >= settings.minFeatureConfidence);
  let solve = null as ReturnType<typeof solveHomography>;
  let reason: string | undefined;
  while (idx.length >= Math.max(4, settings.minInliers)) {
    solve = solveHomography(idx.map(i => refPts[i]), idx.map(i => tracked[i]));
    if (!solve) { reason = 'degenerate'; break; }
    let worst = -1, worstErr = 0;
    for (const i of idx) { const p = transformPoint(solve.matrix, refPts[i]); const e = Math.hypot(p.x - tracked[i].x, p.y - tracked[i].y); if (e > worstErr) { worstErr = e; worst = i; } }
    if (worstErr <= settings.maxResidual || idx.length <= Math.max(4, settings.minInliers)) break;
    idx = idx.filter(i => i !== worst);
  }
  if (!solve || idx.length < Math.max(4, settings.minInliers)) {
    const last = sequence.samples.filter(s => !s.lost).at(-1);
    const held = last ? last.matrix : ([1,0,0, 0,1,0, 0,0,1] as Mat3);
    const sample: PlanarFrameSample = { frame, matrix: held, corners: sequence.referenceCorners.map(p => transformPoint(held, p)) as Quad, features: tracked.map(t => ({ x: t.x, y: t.y })), featureConfidence, inliers: idx.length, confidence: 0, rmsError: Infinity, lost: true };
    return { sample, corners: sample.corners, features: sample.features, accepted: false, reason: reason || `only ${idx.length} of ${tracked.length} features held the plane` };
  }
  const inlierConf = idx.reduce((s, i) => s + featureConfidence[i], 0) / idx.length;
  const inlierRatio = idx.length / Math.max(1, tracked.length);
  const confidence = Math.min(1, solve.confidence * Math.sqrt(inlierRatio) * inlierConf);
  const matrix = solve.matrix;
  const corners = sequence.referenceCorners.map(p => transformPoint(matrix, p)) as Quad;
  // Re-anchor: the plane, not the per-feature matches, defines where features are.
  const features = sequence.features.map(p => transformPoint(matrix, p));
  const accepted = confidence >= settings.minConfidence;
  const sample: PlanarFrameSample = { frame, matrix, corners, features, featureConfidence, inliers: idx.length, confidence, rmsError: solve.rmsError, lost: !accepted };
  return { sample, corners, features, accepted, reason: accepted ? undefined : `confidence ${(confidence * 100).toFixed(0)}% under ${(settings.minConfidence * 100).toFixed(0)}%` };
}

export function upsertPlanarSample(sequence: PlanarTrackSequence, sample: PlanarFrameSample): PlanarTrackSequence {
  return { ...sequence, samples: sequence.samples.filter(item => item.frame !== sample.frame).concat(sample).sort((a, b) => a.frame - b.frame) };
}

/** Last frame the track is good for (before the first `lost` sample after the reference). */
export function planarTrackedRange(sequence: PlanarTrackSequence): { start: number; end: number; lostAt: number | null } {
  const good = sequence.samples.filter(s => !s.lost);
  const lost = sequence.samples.find(s => s.lost);
  return { start: good[0]?.frame ?? sequence.referenceFrame, end: good.at(-1)?.frame ?? sequence.referenceFrame, lostAt: lost ? lost.frame : null };
}

/** Sample at any frame: exact when present, corners interpolated between neighbours
 * (then re-solved so the matrix stays a valid homography), held at the ends. */
export function samplePlanarAt(sequence: PlanarTrackSequence, frame: number): PlanarFrameSample | null {
  const samples = sequence.samples.filter(s => !s.lost);
  if (!samples.length) return null;
  if (frame <= samples[0].frame) return samples[0];
  if (frame >= samples[samples.length - 1].frame) return samples[samples.length - 1];
  let hi = 1; while (hi < samples.length && samples[hi].frame < frame) hi++;
  const a = samples[hi - 1], b = samples[hi];
  if (b.frame === frame) return b;
  const t = (frame - a.frame) / Math.max(1, b.frame - a.frame);
  const corners = a.corners.map((p, i) => ({ x: p.x + (b.corners[i].x - p.x) * t, y: p.y + (b.corners[i].y - p.y) * t })) as Quad;
  const solve = solveHomography(sequence.referenceCorners, corners);
  const matrix = solve?.matrix ?? a.matrix;
  return { frame, matrix, corners, features: sequence.features.map(p => transformPoint(matrix, p)), featureConfidence: a.featureConfidence, inliers: Math.min(a.inliers, b.inliers), confidence: Math.min(a.confidence, b.confidence), rmsError: Math.max(a.rmsError, b.rmsError) };
}

/** SAMPLING matrix that stabilises the surface: output(p) = input(H·p). Identity when the
 * track has nothing for this frame. */
export function planarStabilizeAt(sequence: PlanarTrackSequence, frame: number): { matrix: Mat3; confidence: number } {
  const s = samplePlanarAt(sequence, frame);
  return s ? { matrix: s.matrix, confidence: s.confidence } : { matrix: [1,0,0, 0,1,0, 0,0,1], confidence: 0 };
}

/** Corner-pin data for a frame: `place` maps the unit square (an overlay clip's full frame)
 * onto the tracked surface; `sample` is its inverse (what a renderer feeds its shader).
 * Reusable by any clip, effect param or matte — this IS the exportable corner pin. */
export function cornerPinAt(sequence: PlanarTrackSequence, frame: number): { place: Mat3; sample: Mat3; corners: Quad; confidence: number } | null {
  const s = samplePlanarAt(sequence, frame);
  const Q = unitToQuad(sequence.referenceCorners);
  if (!s || !Q) return null;
  const place = multiplyMat3(s.matrix, Q);
  const sample = invertHomography(place);
  if (!sample) return null;
  return { place, sample, corners: s.corners, confidence: s.confidence };
}

/** Serialisable corner-pin export (one row per frame) — the interchange shape for
 * FCPXML/AE/Nuke exporters and the OFX corner-pin params. */
export function exportCornerPin(sequence: PlanarTrackSequence): { frame: number; corners: Quad; confidence: number }[] {
  return sequence.samples.filter(s => !s.lost).map(s => ({ frame: s.frame, corners: s.corners, confidence: s.confidence }));
}
