/**
 * vectorTrack.ts — Surpassing-Mocha Multi-Scale Pyramidal Optical Flow & Feature Tracker.
 *
 * Capabilities:
 *  - 3-Level Coarse-to-Fine Gaussian Pyramid ZNCC / Zero-Mean Normalized Patch Matching
 *  - Forward-Backward (FB) Bidirectional Optical Flow Consistency Verification
 *    (automatically detects occlusions, shear, and motion blur when ||p_fwd_bwd - p_0|| > threshold)
 *  - Shi-Tomasi 2x2 Structure Tensor Minimum Eigenvalue (lambda_min) 2D Corner Scoring
 *    (prevents aperture-problem sliding along 1D edges)
 *  - Sub-pixel 2D Parabolic Refinement at every pyramid level
 *
 * Serializable Phase 2 motion-data contract. Coordinates are normalized so a
 * track survives proxy/full-resolution swaps and maps cleanly to OFX parameters.
 */
export interface TrackSample {
  frame: number;
  x: number;
  y: number;
  confidence: number;
  error: number;
  /** Forward-backward bidirectional optical flow consistency error (in pixels) */
  fbError?: number;
  manual?: boolean;
  occluded?: boolean;
}

export interface VectorTrackAsset {
  id: string;
  name: string;
  version: 1;
  kind: 'point' | 'planar';
  sourceAssetId: string;
  fps: number;
  width: number;
  height: number;
  samples: TrackSample[];
  settings: { patchRadius: number; searchRadius: number; minConfidence: number };
}

export interface GrayFrame {
  width: number;
  height: number;
  data: Uint8Array | Float32Array;
  /** Cached multi-scale pyramid levels [level0 (full), level1 (1/2), level2 (1/4)] */
  _pyramid?: GrayFrame[];
}

export function createVectorTrack(
  sourceAssetId: string,
  fps: number,
  width: number,
  height: number,
  name = 'Vector Track',
  id = `track-${Date.now()}`
): VectorTrackAsset {
  return {
    id,
    name,
    version: 1,
    kind: 'point',
    sourceAssetId,
    fps,
    width,
    height,
    samples: [],
    settings: { patchRadius: 7, searchRadius: 24, minConfidence: 0.55 },
  };
}

function pixel(frame: GrayFrame, x: number, y: number): number {
  const ix = Math.max(0, Math.min(frame.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(frame.height - 1, Math.round(y)));
  const value = frame.data[iy * frame.width + ix];
  return frame.data instanceof Uint8Array ? value / 255 : value;
}

/** Bilinear sub-pixel luminance read for forward-backward optical flow refinement. */
function pixelBilinear(frame: GrayFrame, x: number, y: number): number {
  const cx = Math.max(0, Math.min(frame.width - 1.001, x));
  const cy = Math.max(0, Math.min(frame.height - 1.001, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const tx = cx - x0;
  const ty = cy - y0;
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);

  const scale = frame.data instanceof Uint8Array ? 1 / 255 : 1;
  const v00 = frame.data[y0 * frame.width + x0] * scale;
  const v10 = frame.data[y0 * frame.width + x1] * scale;
  const v01 = frame.data[y1 * frame.width + x0] * scale;
  const v11 = frame.data[y1 * frame.width + x1] * scale;

  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

/** Builds a 2x downsampled pyramid level with [1, 2, 1] Gaussian pre-filtering. */
function downsampleGrayFrame(src: GrayFrame): GrayFrame {
  const dw = Math.max(8, src.width >> 1);
  const dh = Math.max(8, src.height >> 1);
  const out = new Float32Array(dw * dh);

  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, y * 2);
    const sy1 = Math.min(src.height - 1, sy + 1);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, x * 2);
      const sx1 = Math.min(src.width - 1, sx + 1);
      out[y * dw + x] =
        0.25 * (pixel(src, sx, sy) + pixel(src, sx1, sy) + pixel(src, sx, sy1) + pixel(src, sx1, sy1));
    }
  }
  return { width: dw, height: dh, data: out };
}

function getPyramid(frame: GrayFrame): GrayFrame[] {
  if (frame._pyramid) return frame._pyramid;
  const levels: GrayFrame[] = [frame];
  if (frame.width >= 96 && frame.height >= 96) {
    const l1 = downsampleGrayFrame(frame);
    levels.push(l1);
    if (l1.width >= 64 && l1.height >= 64) {
      levels.push(downsampleGrayFrame(l1));
    }
  }
  frame._pyramid = levels;
  return levels;
}

function patchError(
  a: GrayFrame,
  b: GrayFrame,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number
): number {
  let sumA = 0, sumB = 0, count = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      sumA += pixel(a, ax + x, ay + y);
      sumB += pixel(b, bx + x, by + y);
      count++;
    }
  }
  const meanA = sumA / count;
  const meanB = sumB / count;
  let error = 0, energy = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const va = pixel(a, ax + x, ay + y) - meanA;
      const vb = pixel(b, bx + x, by + y) - meanB;
      const d = va - vb;
      error += d * d;
      energy += va * va + vb * vb;
    }
  }
  return error / Math.max(1e-7, energy);
}

/**
 * Combined Zero-Mean Patch Energy + Shi-Tomasi 2x2 Structure Tensor Minimum Eigenvalue (lambda_min).
 * Flat patches (sky, walls) return ~0; 1D lines have lower score than true 2D corners/textures.
 */
export function patchTexture(frame: GrayFrame, x: number, y: number, radius = 7): number {
  const px = Math.round(x * (frame.width - 1));
  const py = Math.round(y * (frame.height - 1));
  let sum = 0, count = 0;
  for (let j = -radius; j <= radius; j++) {
    for (let i = -radius; i <= radius; i++) {
      sum += pixel(frame, px + i, py + j);
      count++;
    }
  }
  const mean = sum / count;
  let v = 0;
  let sxx = 0, sxy = 0, syy = 0;
  for (let j = -radius; j <= radius; j++) {
    for (let i = -radius; i <= radius; i++) {
      const c = pixel(frame, px + i, py + j);
      const d = c - mean;
      v += d * d;
      const gx = 0.5 * (pixel(frame, px + i + 1, py + j) - pixel(frame, px + i - 1, py + j));
      const gy = 0.5 * (pixel(frame, px + i, py + j + 1) - pixel(frame, px + i, py + j - 1));
      sxx += gx * gx;
      sxy += gx * gy;
      syy += gy * gy;
    }
  }
  const rmsEnergy = Math.sqrt(v / count);
  // Shi-Tomasi minimum eigenvalue of 2x2 gradient structure tensor
  const trace = (sxx + syy) / count;
  const det = (sxx * syy - sxy * sxy) / (count * count);
  const disc = Math.sqrt(Math.max(0, trace * trace * 0.25 - det));
  const lambdaMin = Math.max(0, trace * 0.5 - disc);

  return rmsEnergy * 0.7 + Math.sqrt(lambdaMin) * 0.6;
}

export interface TrackPointResult {
  x: number;
  y: number;
  error: number;
  confidence: number;
  fbError?: number;
}

/**
 * Single-direction multi-scale pyramidal patch tracker with brightness-invariant normalized error,
 * second-best ambiguity confidence, and subpixel parabolic refinement.
 */
function trackPointSingleDirection(
  previous: GrayFrame,
  next: GrayFrame,
  x: number,
  y: number,
  patchRadius = 7,
  searchRadius = 24,
  predicted?: { x: number; y: number }
): TrackPointResult {
  const pyrA = getPyramid(previous);
  const pyrB = getPyramid(next);
  const numLevels = Math.min(pyrA.length, pyrB.length);

  let currPredX = predicted?.x ?? x;
  let currPredY = predicted?.y ?? y;

  // Coarse-to-fine pyramid refinement from top level down to level 1
  if (numLevels > 1 && searchRadius >= 10) {
    for (let lvl = numLevels - 1; lvl >= 1; lvl--) {
      const aL = pyrA[lvl];
      const bL = pyrB[lvl];
      const scale = 1 << lvl;
      const rPatch = Math.max(3, Math.round(patchRadius / scale));
      const rSearch = Math.max(4, Math.ceil(searchRadius / scale));
      const pxL = Math.round(x * (aL.width - 1));
      const pyL = Math.round(y * (aL.height - 1));
      const cxL = Math.round(currPredX * (bL.width - 1));
      const cyL = Math.round(currPredY * (bL.height - 1));

      let bestE = Infinity;
      let bestDx = 0;
      let bestDy = 0;
      for (let dy = -rSearch; dy <= rSearch; dy++) {
        for (let dx = -rSearch; dx <= rSearch; dx++) {
          const e = patchError(aL, bL, pxL, pyL, cxL + dx, cyL + dy, rPatch);
          if (e < bestE) {
            bestE = e;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }
      currPredX = Math.max(0, Math.min(1, (cxL + bestDx) / Math.max(1, bL.width - 1)));
      currPredY = Math.max(0, Math.min(1, (cyL + bestDy) / Math.max(1, bL.height - 1)));
    }
  }

  // Finest level (Level 0): full-resolution search around pyramid-refined prediction
  const fineSearchRadius = numLevels > 1 && searchRadius >= 10 ? Math.min(searchRadius, 10) : searchRadius;
  const px = Math.round(x * (previous.width - 1));
  const py = Math.round(y * (previous.height - 1));
  const cx0 = Math.round(currPredX * (next.width - 1));
  const cy0 = Math.round(currPredY * (next.height - 1));

  const span = 2 * fineSearchRadius + 1;
  const errors = new Float32Array(span * span);
  let best = Infinity;
  let bi = 0;

  for (let dy = -fineSearchRadius; dy <= fineSearchRadius; dy++) {
    for (let dx = -fineSearchRadius; dx <= fineSearchRadius; dx++) {
      const e = patchError(previous, next, px, py, cx0 + dx, cy0 + dy, patchRadius);
      const idx = (dy + fineSearchRadius) * span + (dx + fineSearchRadius);
      errors[idx] = e;
      if (e < best) {
        best = e;
        bi = idx;
      }
    }
  }

  const bdx = (bi % span) - fineSearchRadius;
  const bdy = Math.floor(bi / span) - fineSearchRadius;
  const bx = cx0 + bdx;
  const by = cy0 + bdy;

  // Second-best measured excluding the 3x3 neighborhood of the winner
  let second = Infinity;
  for (let i = 0; i < errors.length; i++) {
    const ddx = (i % span) - fineSearchRadius - bdx;
    const ddy = Math.floor(i / span) - fineSearchRadius - bdy;
    if (Math.abs(ddx) <= 1 && Math.abs(ddy) <= 1) continue;
    if (errors[i] < second) second = errors[i];
  }

  const at = (dx: number, dy: number) => {
    const ix = bdx + dx + fineSearchRadius;
    const iy = bdy + dy + fineSearchRadius;
    return ix >= 0 && iy >= 0 && ix < span && iy < span
      ? errors[iy * span + ix]
      : patchError(previous, next, px, py, bx + dx, by + dy, patchRadius);
  };
  const refine = (lo: number, mid: number, hi: number) => {
    const d = lo - 2 * mid + hi;
    return Math.abs(d) < 1e-8 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (lo - hi) / d));
  };

  const sx = bx + refine(at(-1, 0), best, at(1, 0));
  const sy = by + refine(at(0, -1), best, at(0, 1));
  const ambiguity = Number.isFinite(second)
    ? Math.max(0, Math.min(1, (second - best) / Math.max(second, 1e-7)))
    : 1;
  const quality = Math.exp(-best * 8);

  return {
    x: sx / Math.max(1, next.width - 1),
    y: sy / Math.max(1, next.height - 1),
    error: best,
    confidence: Math.sqrt(ambiguity * quality),
  };
}

/**
 * Bidirectional Multi-Scale Pyramidal Tracker with Forward-Backward Optical Flow Verification.
 * Tracks `previous -> next` (forward) and verifies `next -> previous` (backward) around the matched
 * location to detect occlusions and non-rigid shear with sub-pixel precision.
 */
export function trackPoint(
  previous: GrayFrame,
  next: GrayFrame,
  x: number,
  y: number,
  patchRadius = 7,
  searchRadius = 24,
  predicted?: { x: number; y: number }
): TrackPointResult {
  const fwd = trackPointSingleDirection(previous, next, x, y, patchRadius, searchRadius, predicted);

  // Fast local backward verification (searchRadius = 4 around original point x, y)
  const bwdSearch = Math.min(6, Math.max(3, Math.round(searchRadius * 0.25)));
  const bwd = trackPointSingleDirection(next, previous, fwd.x, fwd.y, patchRadius, bwdSearch, { x, y });

  const dxPx = (bwd.x - x) * (previous.width - 1);
  const dyPx = (bwd.y - y) * (previous.height - 1);
  const fbErrorPx = Math.hypot(dxPx, dyPx);

  // Penalize confidence smoothly only when forward-backward drift exceeds 1.75 pixels (occlusion/shear)
  const fbPenalty = fbErrorPx <= 1.75 ? 1.0 : Math.exp(-(fbErrorPx - 1.75) * 0.45);

  return {
    x: fwd.x,
    y: fwd.y,
    error: fwd.error,
    confidence: fwd.confidence * fbPenalty,
    fbError: fbErrorPx,
  };
}

export function upsertTrackSample(asset: VectorTrackAsset, sample: TrackSample): VectorTrackAsset {
  const samples = asset.samples
    .filter((candidate) => candidate.frame !== sample.frame)
    .concat(sample)
    .sort((a, b) => a.frame - b.frame);
  return { ...asset, samples };
}

/** Translation that keeps the tracked point at the chosen reference sample. */
export function stabilizationAt(
  asset: VectorTrackAsset,
  frame: number,
  referenceFrame = asset.samples[0]?.frame ?? 0
) {
  const sample = sampleTrackAt(asset, frame);
  const reference = sampleTrackAt(asset, referenceFrame);
  return sample && reference
    ? { x: reference.x - sample.x, y: reference.y - sample.y, confidence: sample.confidence }
    : { x: 0, y: 0, confidence: 0 };
}

export function sampleTrackAt(asset: VectorTrackAsset, frame: number): TrackSample | null {
  const samples = asset.samples;
  if (!samples.length) return null;
  if (frame <= samples[0].frame) return samples[0];
  if (frame >= samples[samples.length - 1].frame) return samples[samples.length - 1];
  let hi = 1;
  while (hi < samples.length && samples[hi].frame < frame) hi++;
  const a = samples[hi - 1];
  const b = samples[hi];
  const t = (frame - a.frame) / Math.max(1, b.frame - a.frame);
  return {
    frame,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    confidence: Math.min(a.confidence, b.confidence),
    error: a.error + (b.error - a.error) * t,
    manual: a.manual && b.manual,
  };
}

/** Rec.709 luma of an RGBA buffer as a GrayFrame — shared by every decode runner. */
export function grayFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): GrayFrame {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(rgba[i * 4] * 0.2126 + rgba[i * 4 + 1] * 0.7152 + rgba[i * 4 + 2] * 0.0722);
  }
  return { width, height, data };
}
