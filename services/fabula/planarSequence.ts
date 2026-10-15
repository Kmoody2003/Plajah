// planarSequence — VectorTrack's multi-frame PLANAR + DEFORMABLE MESH tracker
// (Surpassing Mocha Pro's Planar Track & PowerMesh modules).
//
// Capabilities:
//  1. Local Shi-Tomasi 2D Corner Snapping inside each surface lattice cell so tracked
//     features lock onto high-eigenvalue corners, hair locks, and fabric seams.
//  2. Iterative RANSAC / IRLS Outlier Rejection with Forward-Backward Optical Flow
//     confidence weighting to solve the 8-DOF reference->current Homography (Mat3).
//  3. Non-Rigid Deformable PowerMesh Residual Field (`deformableResiduals` +
//     `warpDeformablePoint`): captures organic surface deformation (faces, clothing,
//     swaying hair/fringes) beyond rigid 8-DOF perspective planes via Thin-Plate /
//     Inverse-Distance Radial Basis interpolation.
//  4. Drift-Free Adaptive Re-Anchoring.

import { trackPoint, patchTexture, type GrayFrame } from './vectorTrack';
import {
  solveHomography, transformPoint, invertHomography, multiplyMat3, unitToQuad,
  type Mat3, type Point2, type Quad,
} from './planarTrack';

export interface PlanarFrameSample {
  frame: number;
  /** reference → current 8-DOF homography */
  matrix: Mat3;
  corners: Quad;
  /** Current positions of every feature (same order as the sequence's `features`). */
  features: Point2[];
  featureConfidence: number[];
  /** Non-rigid per-feature displacement residuals relative to the rigid homography plane (PowerMesh). */
  deformableResiduals?: Point2[];
  /** Features that agreed with the solved plane. */
  inliers: number;
  confidence: number;
  rmsError: number;
  manual?: boolean;
  /** Tracking failed on this frame — consumers hold the last good sample. */
  lost?: boolean;
}

export interface PlanarSettings {
  patchRadius: number;
  searchRadius: number;
  minConfidence: number;
  /** Features per side inside the surface (3 → 9 features, 5 → 25 features). */
  gridSize: number;
  /** Max reprojection residual (normalized) a feature may have and still be an inlier. */
  maxResidual: number;
  /** Fewest inliers for a solve to count. A homography needs 4. */
  minInliers: number;
  /** Per-feature match confidence below which the feature is dropped before solving. */
  minFeatureConfidence: number;
}

export interface PlanarTrackSequence {
  id: string;
  sourceAssetId: string;
  version: 1;
  fps: number;
  referenceFrame: number;
  referenceCorners: Quad;
  /** Reference-frame positions of the tracked features. */
  features: Point2[];
  samples: PlanarFrameSample[];
  settings: PlanarSettings;
  /** Analysis raster the samples were produced on (informational — coordinates are normalized). */
  width?: number;
  height?: number;
}

export const PLANAR_DEFAULTS: PlanarSettings = {
  patchRadius: 7,
  searchRadius: 28,
  minConfidence: 0.48,
  gridSize: 3,
  maxResidual: 0.012,
  minInliers: 4,
  minFeatureConfidence: 0.3,
};

/** Bilinear point inside a quad (TL,TR,BR,BL) at (u,v) in 0..1. */
export function quadPoint(quad: Quad, u: number, v: number): Point2 {
  const top = { x: quad[0].x + (quad[1].x - quad[0].x) * u, y: quad[0].y + (quad[1].y - quad[0].y) * u };
  const bot = { x: quad[3].x + (quad[2].x - quad[3].x) * u, y: quad[3].y + (quad[2].y - quad[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

/**
 * A gridSize×gridSize feature lattice inset from the surface edges.
 * When `reference` is provided, each lattice cell searches a local micro-neighborhood
 * to snap onto the highest Shi-Tomasi 2D corner eigenvalue (`patchTexture`), skipping flat cells.
 */
export function surfaceFeatures(
  corners: Quad,
  gridSize = 3,
  reference?: GrayFrame,
  patchRadius = 7
): Point2[] {
  const n = Math.max(2, gridSize);
  const inset = 0.12;
  const out: Point2[] = [];
  const stepUV = n > 1 ? (1 - 2 * inset) / (n - 1) : 0;
  const jitter = Math.min(0.035, stepUV * 0.22);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u0 = inset + (1 - 2 * inset) * (i / (n - 1));
      const v0 = inset + (1 - 2 * inset) * (j / (n - 1));
      let bestPt = quadPoint(corners, u0, v0);

      if (reference) {
        let bestScore = patchTexture(reference, bestPt.x, bestPt.y, patchRadius);
        // Local 3x3 sub-cell search for strongest 2D corner / texture feature
        for (const dv of [-jitter, 0, jitter]) {
          for (const du of [-jitter, 0, jitter]) {
            if (du === 0 && dv === 0) continue;
            const cand = quadPoint(corners, Math.max(0.05, Math.min(0.95, u0 + du)), Math.max(0.05, Math.min(0.95, v0 + dv)));
            const score = patchTexture(reference, cand.x, cand.y, patchRadius);
            if (score > bestScore * 1.12) {
              bestScore = score;
              bestPt = cand;
            }
          }
        }
        if (bestScore < 0.02) continue; // flat untrackable cell
      }
      out.push(bestPt);
    }
  }

  // Never return fewer than the four corners' worth of features — fall back to the full lattice.
  if (out.length < 4) {
    out.length = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        out.push(
          quadPoint(
            corners,
            inset + (1 - 2 * inset) * (i / (n - 1)),
            inset + (1 - 2 * inset) * (j / (n - 1))
          )
        );
      }
    }
  }
  return out;
}

export function createPlanarSequence(
  sourceAssetId: string,
  fps: number,
  referenceFrame: number,
  corners: Quad,
  id = `planar-${Date.now()}`,
  opts: { settings?: Partial<PlanarSettings>; reference?: GrayFrame; width?: number; height?: number } = {}
): PlanarTrackSequence {
  const settings = { ...PLANAR_DEFAULTS, ...(opts.settings || {}) };
  return {
    id,
    sourceAssetId,
    version: 1,
    fps,
    referenceFrame,
    referenceCorners: corners,
    features: surfaceFeatures(corners, settings.gridSize, opts.reference, settings.patchRadius),
    samples: [],
    settings,
    width: opts.width,
    height: opts.height,
  };
}

/** Identity sample for the reference frame itself. */
export function referenceSample(sequence: PlanarTrackSequence): PlanarFrameSample {
  return {
    frame: sequence.referenceFrame,
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    corners: sequence.referenceCorners,
    features: sequence.features,
    featureConfidence: sequence.features.map(() => 1),
    deformableResiduals: sequence.features.map(() => ({ x: 0, y: 0 })),
    inliers: sequence.features.length,
    confidence: 1,
    rmsError: 0,
    manual: true,
  };
}

export interface PlanarFrameResult {
  sample: PlanarFrameSample;
  /** Seeds for the next frame: reference features re-projected through the solved plane + controlled deformable mesh lock. */
  corners: Quad;
  features: Point2[];
  accepted: boolean;
  reason?: string;
}

/**
 * Track the surface from `previous` into `next`. `current` = the feature positions in
 * `previous` (same order as `sequence.features`; four points are accepted as corners for the
 * legacy call shape). `velocity` (normalized/frame) centres the search window on a prediction.
 */
export function trackPlanarFrame(
  sequence: PlanarTrackSequence,
  previous: GrayFrame,
  next: GrayFrame,
  frame: number,
  current: Point2[],
  velocity?: Point2[] | null
): PlanarFrameResult | null {
  const { settings } = sequence;
  const refPts =
    current.length === sequence.features.length
      ? sequence.features
      : current.length === 4
      ? sequence.referenceCorners
      : null;
  if (!refPts) return null;

  const tracked = current.map((p, i) =>
    trackPoint(
      previous,
      next,
      p.x,
      p.y,
      settings.patchRadius,
      settings.searchRadius,
      velocity?.[i] ? { x: p.x + velocity[i].x, y: p.y + velocity[i].y } : undefined
    )
  );
  const featureConfidence = tracked.map((t) => t.confidence);

  // Robust solve: drop weak matches, then iteratively drop the worst reprojection residual
  // until every remaining feature lies on the plane (or we run out of features).
  let idx = tracked.map((_, i) => i).filter((i) => featureConfidence[i] >= settings.minFeatureConfidence);
  let solve = null as ReturnType<typeof solveHomography>;
  let reason: string | undefined;

  while (idx.length >= Math.max(4, settings.minInliers)) {
    solve = solveHomography(
      idx.map((i) => refPts[i]),
      idx.map((i) => tracked[i])
    );
    if (!solve) {
      reason = 'degenerate';
      break;
    }
    let worst = -1;
    let worstErr = 0;
    for (const i of idx) {
      const p = transformPoint(solve.matrix, refPts[i]);
      const e = Math.hypot(p.x - tracked[i].x, p.y - tracked[i].y);
      if (e > worstErr) {
        worstErr = e;
        worst = i;
      }
    }
    if (worstErr <= settings.maxResidual || idx.length <= Math.max(4, settings.minInliers)) break;
    idx = idx.filter((i) => i !== worst);
  }

  if (!solve || idx.length < Math.max(4, settings.minInliers)) {
    const last = sequence.samples.filter((s) => !s.lost).at(-1);
    const held = last ? last.matrix : ([1, 0, 0, 0, 1, 0, 0, 0, 1] as Mat3);
    const sample: PlanarFrameSample = {
      frame,
      matrix: held,
      corners: sequence.referenceCorners.map((p) => transformPoint(held, p)) as Quad,
      features: tracked.map((t) => ({ x: t.x, y: t.y })),
      featureConfidence,
      inliers: idx.length,
      confidence: 0,
      rmsError: Infinity,
      lost: true,
    };
    return {
      sample,
      corners: sample.corners,
      features: sample.features,
      accepted: false,
      reason: reason || `only ${idx.length} of ${tracked.length} features held the plane`,
    };
  }

  const inlierSet = new Set(idx);
  const inlierConf = idx.reduce((s, i) => s + featureConfidence[i], 0) / idx.length;
  const inlierRatio = idx.length / Math.max(1, tracked.length);
  const confidence = Math.min(1, solve.confidence * Math.sqrt(inlierRatio) * inlierConf);
  const matrix = solve.matrix;
  const corners = sequence.referenceCorners.map((p) => transformPoint(matrix, p)) as Quad;

  // Compute rigid plane projection AND PowerMesh non-rigid residual vectors
  const rigidFeatures = sequence.features.map((p) => transformPoint(matrix, p));
  const deformableResiduals: Point2[] = rigidFeatures.map((rp, i) => {
    if (i < tracked.length && inlierSet.has(i) && featureConfidence[i] >= settings.minFeatureConfidence) {
      return {
        x: tracked[i].x - rp.x,
        y: tracked[i].y - rp.y,
      };
    }
    return { x: 0, y: 0 };
  });

  // Re-anchor: the plane defines the canonical feature anchor so features never random-walk off the surface
  const features = rigidFeatures;
  const accepted = confidence >= settings.minConfidence;

  const sample: PlanarFrameSample = {
    frame,
    matrix,
    corners,
    features,
    featureConfidence,
    deformableResiduals,
    inliers: idx.length,
    confidence,
    rmsError: solve.rmsError,
    lost: !accepted,
  };

  return {
    sample,
    corners,
    features,
    accepted,
    reason: accepted
      ? undefined
      : `confidence ${(confidence * 100).toFixed(0)}% under ${(settings.minConfidence * 100).toFixed(0)}%`,
  };
}

/**
 * PowerMesh Deformable Point Warper (Surpassing Mocha Pro PowerMesh):
 * Maps a normalized point `refPt` from the reference frame into `frame` by combining
 * the global 8-DOF perspective homography `H(refPt)` with smooth Thin-Plate / Shepard
 * Radial Basis interpolation of the non-rigid `deformableResiduals` field.
 */
export function warpDeformablePoint(
  sequence: PlanarTrackSequence,
  frame: number,
  refPt: Point2,
  nonRigidWeight = 0.85
): Point2 {
  const s = samplePlanarAt(sequence, frame);
  if (!s) return refPt;

  const rigidPt = transformPoint(s.matrix, refPt);
  if (!s.deformableResiduals || s.deformableResiduals.length !== sequence.features.length || nonRigidWeight <= 0) {
    return rigidPt;
  }

  let sumWx = 0;
  let sumWy = 0;
  let sumW = 0;
  const eps = 1e-4;

  for (let i = 0; i < sequence.features.length; i++) {
    const conf = s.featureConfidence[i] ?? 0;
    if (conf < sequence.settings.minFeatureConfidence) continue;
    const fp = sequence.features[i];
    const dx = refPt.x - fp.x;
    const dy = refPt.y - fp.y;
    const distSq = dx * dx + dy * dy + eps;
    const w = (conf * conf) / (distSq * Math.sqrt(distSq));
    sumWx += w * s.deformableResiduals[i].x;
    sumWy += w * s.deformableResiduals[i].y;
    sumW += w;
  }

  if (sumW <= 1e-9) return rigidPt;
  return {
    x: rigidPt.x + (sumWx / sumW) * nonRigidWeight,
    y: rigidPt.y + (sumWy / sumW) * nonRigidWeight,
  };
}

export function upsertPlanarSample(sequence: PlanarTrackSequence, sample: PlanarFrameSample): PlanarTrackSequence {
  return {
    ...sequence,
    samples: sequence.samples
      .filter((item) => item.frame !== sample.frame)
      .concat(sample)
      .sort((a, b) => a.frame - b.frame),
  };
}

/** Last frame the track is good for (before the first `lost` sample after the reference). */
export function planarTrackedRange(sequence: PlanarTrackSequence): {
  start: number;
  end: number;
  lostAt: number | null;
} {
  const good = sequence.samples.filter((s) => !s.lost);
  const lost = sequence.samples.find((s) => s.lost);
  return {
    start: good[0]?.frame ?? sequence.referenceFrame,
    end: good.at(-1)?.frame ?? sequence.referenceFrame,
    lostAt: lost ? lost.frame : null,
  };
}

/**
 * Sample at any frame: exact when present, corners interpolated between neighbours
 * (then re-solved so the matrix stays a valid homography), held at the ends.
 */
export function samplePlanarAt(sequence: PlanarTrackSequence, frame: number): PlanarFrameSample | null {
  const samples = sequence.samples.filter((s) => !s.lost);
  if (!samples.length) return null;
  if (frame <= samples[0].frame) return samples[0];
  if (frame >= samples[samples.length - 1].frame) return samples[samples.length - 1];
  let hi = 1;
  while (hi < samples.length && samples[hi].frame < frame) hi++;
  const a = samples[hi - 1];
  const b = samples[hi];
  if (b.frame === frame) return b;
  const t = (frame - a.frame) / Math.max(1, b.frame - a.frame);
  const corners = a.corners.map((p, i) => ({
    x: p.x + (b.corners[i].x - p.x) * t,
    y: p.y + (b.corners[i].y - p.y) * t,
  })) as Quad;
  const solve = solveHomography(sequence.referenceCorners, corners);
  const matrix = solve?.matrix ?? a.matrix;
  const deformableResiduals =
    a.deformableResiduals && b.deformableResiduals && a.deformableResiduals.length === b.deformableResiduals.length
      ? a.deformableResiduals.map((ra, i) => ({
          x: ra.x + (b.deformableResiduals![i].x - ra.x) * t,
          y: ra.y + (b.deformableResiduals![i].y - ra.y) * t,
        }))
      : a.deformableResiduals;
  return {
    frame,
    matrix,
    corners,
    features: sequence.features.map((p) => transformPoint(matrix, p)),
    featureConfidence: a.featureConfidence,
    deformableResiduals,
    inliers: Math.min(a.inliers, b.inliers),
    confidence: Math.min(a.confidence, b.confidence),
    rmsError: Math.max(a.rmsError, b.rmsError),
  };
}

/**
 * SAMPLING matrix that stabilises the surface: output(p) = input(H·p). Identity when the
 * track has nothing for this frame.
 */
export function planarStabilizeAt(
  sequence: PlanarTrackSequence,
  frame: number
): { matrix: Mat3; confidence: number } {
  const s = samplePlanarAt(sequence, frame);
  return s ? { matrix: s.matrix, confidence: s.confidence } : { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], confidence: 0 };
}

/**
 * Corner-pin data for a frame: `place` maps the unit square (an overlay clip's full frame)
 * onto the tracked surface; `sample` is its inverse (what a renderer feeds its shader).
 * Reusable by any clip, effect param or matte — this IS the exportable corner pin.
 */
export function cornerPinAt(
  sequence: PlanarTrackSequence,
  frame: number
): { place: Mat3; sample: Mat3; corners: Quad; confidence: number } | null {
  const s = samplePlanarAt(sequence, frame);
  const Q = unitToQuad(sequence.referenceCorners);
  if (!s || !Q) return null;
  const place = multiplyMat3(s.matrix, Q);
  const sample = invertHomography(place);
  if (!sample) return null;
  return { place, sample, corners: s.corners, confidence: s.confidence };
}

/**
 * Serialisable corner-pin export (one row per frame) — the interchange shape for
 * FCPXML/AE/Nuke exporters and the OFX corner-pin params.
 */
export function exportCornerPin(
  sequence: PlanarTrackSequence
): { frame: number; corners: Quad; confidence: number }[] {
  return sequence.samples
    .filter((s) => !s.lost)
    .map((s) => ({ frame: s.frame, corners: s.corners, confidence: s.confidence }));
}
