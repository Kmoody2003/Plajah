/**
 * reconstruct.ts — from one picture to solid geometry, by understanding what the picture shows.
 *
 * Every structure is expressed the same way: for each point of the outline, a front surface and a back surface. Depth
 * gives the front's detail. What the thing is gives the rest: a bottle's section is a circle, a book's back is flat,
 * a car's far side repeats its near side. judge() then looks at the built clay the way a person would, against the
 * picture and against common sense, and build() corrects what it can and says what it can't.
 */

import { BRICK_STRIDE, BRICK_VOXELS } from '../brickPool';
import { meshFromField, type ClayFieldSnapshot } from '../engine';
import { blur, distanceSquared, inflate, largestShape, sample, wideBlur } from '../pictureClay';
import { fieldSampler } from '../creature/finish';
import type { ObjectPrior, Structure } from './vocabulary';

export interface ImageReading {
  mask: Float32Array;
  maskSize: number;
  /** Near is larger. */
  depth?: Float32Array;
  depthSize?: number;
  /** The part of the picture the depth map covers: depth is read close up on the subject. */
  depthBox?: { u0: number; v0: number; u1: number; v1: number };
  /** Picture width / height. */
  aspect: number;
}

export type View = 'front' | 'side';

export interface BuildPlan {
  structure: Structure;
  view: View;
  /** Depth of the thing as a share of its pictured height. */
  depthRatio: number;
  /** 0-1, how strongly the depth map shapes the front. */
  relief: number;
}

export interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  /** Worth saying, but a single picture can't settle it. */
  advisory?: boolean;
}

export interface BuildResult {
  field: ClayFieldSnapshot;
  plan: BuildPlan;
  checks: Check[];
  score: number;
  /** Corrections made along the way, in words. */
  corrections: string[];
  /** Estimated real size in metres, when the object is known. */
  size?: [number, number, number];
  /** Why depth alone can't make this thing, when it can't. A generated shape is the answer. */
  needsGenerated: string | null;
}

const M = 384;
const FIT = 0.82;

export interface Stage {
  inside: Uint8Array; S: Float32Array; u: Float32Array;
  pixel: number; toU: (x: number) => number; toV: (y: number) => number;
  wide: number; tall: number;
  /** The subject runs off the frame. */
  cropped: boolean;
  /** Left-right mirror match of the outline, 0-1. */
  symmetry: number;
  /** Outline length squared over area, 1 for a circle: a high number means wings, legs, spokes. */
  complexity: number;
}

/** Where the picture's outline sits in clay space. */
export function stageBounds(s: Stage) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (s.inside[i + j * M]) {
    const x = (i + 0.5) * s.pixel - 1, y = 1 - (j + 0.5) * s.pixel;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

export function readStage(reading: ImageReading): Stage {
  const { mask, maskSize, aspect } = reading;
  const shape = largestShape(mask, maskSize);
  if (!shape || shape.count < maskSize ** 2 * 0.002) throw new Error('No clear subject found in this picture.');
  const wide = (shape.u1 - shape.u0) * aspect, tall = shape.v1 - shape.v0;
  const scale = (2 * FIT) / Math.max(wide, tall);
  const uc = (shape.u0 + shape.u1) / 2, vc = (shape.v0 + shape.v1) / 2;
  const pixel = 2 / M;
  const toU = (x: number) => uc + x / (scale * aspect), toV = (y: number) => vc - y / scale;
  const keep = new Float32Array(mask.length);
  for (let i = 0; i < keep.length; i++) keep[i] = shape.label[i] === shape.best ? mask[i] : 0;
  const raw = new Uint8Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const u = toU((i + 0.5) * pixel - 1), v = toV(1 - (j + 0.5) * pixel);
    if (u >= 0 && v >= 0 && u <= 1 && v <= 1) raw[i + j * M] = sample(keep, maskSize, u, v) >= 0.5 ? 1 : 0;
  }
  const dIn = distanceSquared((i) => !raw[i], M), dOut = distanceSquared((i) => !!raw[i], M);
  const signed = new Float32Array(M * M);
  for (let i = 0; i < signed.length; i++) signed[i] = (Math.sqrt(dOut[i]) - Math.sqrt(dIn[i])) * pixel;
  const S = blur(signed, M, 4);
  const inside = new Uint8Array(M * M);
  let weight = 0, moment = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (S[i + j * M] < 0) { inside[i + j * M] = 1; weight++; moment += i; }
  const axisPx = weight ? moment / weight : M / 2;
  let same = 0, either = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const m = Math.round(2 * axisPx - i);
    const other = m >= 0 && m < M ? inside[m + j * M] : 0;
    if (inside[i + j * M] || other) { either++; if (inside[i + j * M] && other) same++; }
  }
  let edgeCount = 0, area = 0;
  for (let j = 1; j < M - 1; j++) for (let i = 1; i < M - 1; i++) {
    const c = i + j * M;
    if (!inside[c]) continue;
    area++;
    if (!inside[c - 1] || !inside[c + 1] || !inside[c - M] || !inside[c + M]) edgeCount++;
  }
  return {
    complexity: area ? (edgeCount * edgeCount) / (4 * Math.PI * area) : 1,
    inside, S, u: inflate(inside, M, pixel), pixel, toU, toV, wide: wide * scale, tall: tall * scale,
    cropped: shape.u0 < 0.01 || shape.u1 > 0.99 || shape.v1 > 0.985 || shape.v0 < 0.01,
    symmetry: either ? same / either : 0,
  };
}

/** Depth, split into its broad form and its features, both measured against the subject's own range. */
function readDepth(reading: ImageReading, s: Stage) {
  const { depth, depthSize, depthBox } = reading;
  if (!depth || !depthSize) return null;
  const rel = new Float32Array(M * M);
  const values: number[] = [];
  const box = depthBox ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    if (!s.inside[i + j * M]) continue;
    const u = (s.toU((i + 0.5) * s.pixel - 1) - box.u0) / (box.u1 - box.u0), v = (s.toV(1 - (j + 0.5) * s.pixel) - box.v0) / (box.v1 - box.v0);
    const d = sample(depth, depthSize, u, v);
    rel[i + j * M] = d;
    values.push(d);
  }
  if (values.length < 50) return null;
  values.sort((a, b) => a - b);
  const lo = values[Math.floor(values.length * 0.03)], hi = values[Math.floor(values.length * 0.97)], mid = values[values.length >> 1];
  const span = Math.max(hi - lo, 1e-5);
  for (let i = 0; i < rel.length; i++) rel[i] = s.inside[i] ? Math.max(-1, Math.min(1, (rel[i] - mid) / span)) : 0;
  const fine = blur(rel, M, 1);
  const broad = wideBlur(fine, s.inside, M, 22);
  let power = 0, n = 0;
  for (let i = 0; i < rel.length; i++) if (s.inside[i]) { power += (fine[i] - broad[i]) ** 2; n++; }
  const gain = 1 / Math.max(Math.sqrt(power / Math.max(n, 1)), 1e-4);
  const features = new Float32Array(M * M);
  for (let i = 0; i < rel.length; i++) features[i] = (fine[i] - broad[i]) * gain;
  // A strong left-to-right slope means the thing is turned away from the camera.
  let sx = 0, sd = 0, n2 = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (s.inside[i + j * M]) { sx += i; sd += fine[i + j * M]; n2++; }
  const mx = sx / Math.max(n2, 1), md = sd / Math.max(n2, 1);
  let xy = 0, xx = 0, yy = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (s.inside[i + j * M]) { const a = i - mx, b = fine[i + j * M] - md; xy += a * b; xx += a * a; yy += b * b; }
  const turned = xx > 0 && yy > 0 ? Math.abs(xy) / Math.sqrt(xx * yy) : 0;
  return { rel, broad, features, turned };
}

/** The structure's maps: half-thickness squared, and how far the front and back move from it. */
function shapeMaps(s: Stage, depth: ReturnType<typeof readDepth>, plan: BuildPlan) {
  const { inside, S, u, pixel } = s;
  const H2 = new Float32Array(M * M), front = new Float32Array(M * M), back = new Float32Array(M * M);
  const dist = (i: number) => Math.max(0, -S[i]);
  const halfDepth = (plan.depthRatio * s.tall) / 2;
  const edge = 0.05;

  if (plan.structure === 'round') {
    // The axis runs through the middle of the rows. Whatever sticks out past the symmetric core, like a handle, keeps
    // its own thin section instead of widening the whole body.
    const mids: number[] = [];
    const rowL = new Int32Array(M).fill(-1), rowR = new Int32Array(M).fill(-1);
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < M; i++) if (inside[i + j * M]) { if (rowL[j] < 0) rowL[j] = i; rowR[j] = i; }
      if (rowL[j] >= 0) mids.push((rowL[j] + rowR[j] + 1) / 2);
    }
    mids.sort((a, b) => a - b);
    const axis = mids.length ? mids[mids.length >> 1] : M / 2;
    const radius = new Float32Array(M);
    for (let j = 0; j < M; j++) if (rowL[j] >= 0) radius[j] = Math.max(0, Math.min(axis - rowL[j], rowR[j] + 1 - axis)) * pixel;
    // Eased up and down the axis, or every step in the outline turns into a ring.
    const eased = radius.slice();
    for (let pass = 0; pass < 14; pass++) for (let j = 1; j < M - 1; j++) if (radius[j] > 0 && radius[j - 1] > 0 && radius[j + 1] > 0) eased[j] = (eased[j - 1] + 2 * eased[j] + eased[j + 1]) / 4;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const c = i + j * M;
      const x = (i + 0.5 - axis) * pixel;
      const round = eased[j] ** 2 - x * x;
      // Past the turned core only: inside it the section stays a true circle, with no seam where the two would meet.
      const past = Math.max(0, Math.abs(x) - eased[j]) / 0.02;
      const handle = u[c] * 0.35;
      H2[c] = inside[c] ? round + (Math.max(round, handle) - round) * Math.min(1, past) : Math.min(round, -Math.max(S[c], 0) * 0.3);
    }
  } else if (plan.structure === 'slab' || plan.structure === 'sheet') {
    // A flat block with softened edges: the same thickness everywhere, falling away only at the rim.
    const rim = Math.max(0.012, Math.min(0.05, halfDepth * 0.7));
    for (let c = 0; c < H2.length; c++) {
      const t = Math.min(1, -S[c] / rim);
      H2[c] = S[c] < 0 ? halfDepth * halfDepth * (1 - (1 - t) * (1 - t)) : -S[c] * halfDepth;
    }
  } else {
    // Rounded forms: the outline's own inflation, scaled so the whole thing is as thick as it should be.
    let peak = 0;
    for (let c = 0; c < u.length; c++) if (inside[c] && u[c] > peak) peak = u[c];
    const k = peak > 0 ? (halfDepth * halfDepth) / peak : 1;
    for (let c = 0; c < H2.length; c++) H2[c] = inside[c] ? u[c] * k : -Math.max(S[c], 0) * Math.sqrt(k) * 0.7;
  }

  if (depth) {
    const carries = plan.structure === 'figure' || plan.structure === 'organic' || plan.structure === 'branching' || plan.structure === 'mirrored';
    const amount = plan.relief * (plan.structure === 'sheet' ? 0.012 : plan.structure === 'slab' ? 0.03 : plan.structure === 'round' ? 0.012 : 0.085);
    const broadAmount = carries ? plan.relief * halfDepth * 0.9 : 0;
    for (let c = 0; c < front.length; c++) {
      if (!inside[c]) continue;
      const fade = Math.min(1, dist(c) / (edge * 2.5));
      const limit = Math.max(0.002, Math.sqrt(Math.max(0, H2[c])) * 0.9);
      const big = depth.broad[c] * broadAmount * fade;
      // Eased into the limit, not cut off at it: a hard stop draws a ridge round the whole face.
      front[c] = limit * Math.tanh((big + depth.features[c] * amount * fade) / limit);
      // The far side of a side-on mirrored thing repeats the near side. Elsewhere broad masses carry round, features don't.
      if (plan.structure === 'mirrored' && plan.view === 'side') back[c] = -front[c];
      else if (carries) back[c] = -limit * Math.tanh(big / limit) * 0.6;
    }
  }
  return { H2: blur(H2, M, 1), front: blur(front, M, 1), back: blur(back, M, 2) };
}

/** Turns the maps into clay, one column of cells at a time. */
function bake(s: Stage, maps: ReturnType<typeof shapeMaps>, grid: number, band: number): ClayFieldSnapshot {
  const { H2, front, back } = maps;
  const { S, pixel } = s;
  const slope = (map: Float32Array) => {
    const out = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const dx = (map[j * M + Math.min(M - 1, i + 1)] - map[j * M + Math.max(0, i - 1)]) / (2 * pixel);
      const dy = (map[Math.min(M - 1, j + 1) * M + i] - map[Math.max(0, j - 1) * M + i]) / (2 * pixel);
      out[i + j * M] = Math.hypot(dx, dy);
    }
    return out;
  };
  const H2Slope = slope(H2), frontSlope = slope(front), backSlope = slope(back);
  const voxel = 2 / (grid * BRICK_VOXELS), cell = 2 / grid, margin = band + voxel * 2, near = band * 0.999;
  const count = BRICK_STRIDE ** 3, n2 = BRICK_STRIDE ** 2;
  const states = new Uint8Array(grid ** 3);
  const cells: number[] = [];
  const blocks: Float32Array[] = [];
  const toMap = (w: number) => Math.max(0, Math.min(M - 1, Math.floor((w + 1) / pixel)));
  const toCell = (w: number) => Math.max(0, Math.min(grid - 1, Math.floor((w + 1) / cell)));
  const cH = new Float32Array(n2), cF = new Float32Array(n2), cB = new Float32Array(n2), cHs = new Float32Array(n2), cFs = new Float32Array(n2), cBs = new Float32Array(n2);

  const brick = (gx: number, gy: number, gz: number) => {
    const ox = gx * cell - 1 - voxel, oy = gy * cell - 1 - voxel, oz = gz * cell - 1 - voxel;
    const values = new Float32Array(count);
    let min = Infinity, max = -Infinity, n = 0;
    for (let y = 0, c = 0; y < BRICK_STRIDE; y++) {
      const v = (1 - (oy + y * voxel)) / 2;
      for (let x = 0; x < BRICK_STRIDE; x++, c++) {
        const mu = (ox + x * voxel + 1) / 2;
        cH[c] = sample(H2, M, mu, v); cF[c] = sample(front, M, mu, v); cB[c] = sample(back, M, mu, v);
        cHs[c] = sample(H2Slope, M, mu, v); cFs[c] = sample(frontSlope, M, mu, v); cBs[c] = sample(backSlope, M, mu, v);
      }
    }
    for (let z = 0; z < BRICK_STRIDE; z++) {
      const pz = oz + z * voxel;
      for (let y = 0; y < BRICK_STRIDE; y++) for (let x = 0; x < BRICK_STRIDE; x++) {
        const c = x + y * BRICK_STRIDE;
        const f = cF[c], b = cB[c];
        // Height off the front or back sheet; between them it is all interior.
        const above = pz > Math.max(f, b) ? pz - Math.max(f, b) : pz < Math.min(f, b) ? pz - Math.min(f, b) : 0;
        const tilt = above > 0 ? cFs[c] : above < 0 ? cBs[c] : 0;
        const g = above * above - cH[c];
        const d = g / Math.max(Math.sqrt(4 * above * above * (1 + tilt * tilt) + cHs[c] * cHs[c]), 1e-4);
        const value = Math.max(-band, Math.min(band, d));
        values[n++] = value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    const id = gx + grid * (gy + grid * gz);
    if (min >= near) return;
    if (max <= -near) { states[id] = 1; return; }
    cells.push(id);
    blocks.push(values);
  };

  for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
    const x0 = gx * cell - 1 - margin, x1 = (gx + 1) * cell - 1 + margin, y0 = gy * cell - 1 - margin, y1 = (gy + 1) * cell - 1 + margin;
    let minS = Infinity, maxS = -Infinity, topLo = Infinity, topHi = -Infinity, botLo = Infinity, botHi = -Infinity;
    for (let j = toMap(-y1); j <= toMap(-y0); j++) for (let i = toMap(x0); i <= toMap(x1); i++) {
      const c = i + j * M;
      if (S[c] < minS) minS = S[c];
      if (S[c] > maxS) maxS = S[c];
      const h = Math.sqrt(Math.max(0, H2[c]));
      const top = Math.max(front[c], back[c]) + h, bottom = Math.min(front[c], back[c]) - h;
      if (top < topLo) topLo = top;
      if (top > topHi) topHi = top;
      if (bottom < botLo) botLo = bottom;
      if (bottom > botHi) botHi = bottom;
    }
    if (minS > margin) continue;
    if (maxS > -margin) {
      for (let gz = toCell(botLo - margin); gz <= toCell(topHi + margin); gz++) brick(gx, gy, gz);
      continue;
    }
    const backTop = toCell(botHi + margin), frontBottom = toCell(topLo - margin);
    for (let gz = toCell(botLo - margin); gz <= backTop; gz++) brick(gx, gy, gz);
    for (let gz = Math.max(backTop + 1, frontBottom); gz <= toCell(topHi + margin); gz++) brick(gx, gy, gz);
    for (let gz = backTop + 1; gz < frontBottom; gz++) states[gx + grid * (gy + grid * gz)] = 1;
  }
  const values = new Float32Array(cells.length * count);
  blocks.forEach((b, i) => values.set(b, i * count));
  return { grid, band, states, cells: new Uint32Array(cells), values };
}

export interface Measured {
  /** Overlap of the clay's outline and the picture's. */
  iou: number;
  /** Correlation of the clay's front with the depth map. */
  depthMatch: number | null;
  /** Depth of the clay over its height. */
  depthRatio: number;
  /** Largest piece's share of the surface. */
  mainPiece: number;
  /** Section depth over width along the height: 1 is round. */
  roundness: number;
  /** Centre of mass over its base: 0 centred, 1 at the edge, past 1 it tips. */
  balance: number;
  width: number; height: number; depth: number;
}

/** Looks at the built clay from the camera's position, and measures it. */
export function measure(field: ClayFieldSnapshot, s: Stage, reading: ImageReading, align = false): Measured {
  const sampleField = fieldSampler(field);
  const N = 96, step = 2 / N;
  const hit = new Uint8Array(N * N);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const fronts = new Float32Array(N * N);
  const widthAt = new Float32Array(N), depthAt = new Float32Array(N);
  let massX = 0, massN = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * step - 1, y = 1 - (j + 0.5) * step;
    let z = 1, found = false;
    while (z > -1) {
      const d = sampleField(x, y, z);
      if (d < 0) { found = true; break; }
      z -= Math.max(d * 0.8, 0.008);
    }
    if (!found) continue;
    hit[i + j * N] = 1;
    fronts[i + j * N] = z;
    let zb = -1;
    while (zb < z) {
      const d = sampleField(x, y, zb);
      if (d < 0) break;
      zb += Math.max(d * 0.8, 0.008);
    }
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, zb); maxZ = Math.max(maxZ, z);
    massX += x; massN++;
    depthAt[j] = Math.max(depthAt[j], z - zb);
  }
  const width = maxX - minX, height = maxY - minY, depth = maxZ - minZ;

  // A generated form comes in its own framing, so it is matched to the outline's bounds before it's compared.
  let tx0 = Infinity, tx1 = -Infinity, ty0 = Infinity, ty1 = -Infinity;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) if (s.inside[i + j * M]) {
    const x = (i + 0.5) * s.pixel - 1, y = 1 - (j + 0.5) * s.pixel;
    tx0 = Math.min(tx0, x); tx1 = Math.max(tx1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y);
  }
  const fromClay = (x: number, y: number): [number, number] => (align
    ? [tx0 + ((x - minX) / Math.max(width, 1e-4)) * (tx1 - tx0), ty0 + ((y - minY) / Math.max(height, 1e-4)) * (ty1 - ty0)]
    : [x, y]);

  let overlap = 0, either = 0;
  const pairs: [number, number][] = [];
  const box = reading.depthBox ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const [px, py] = fromClay((i + 0.5) * step - 1, 1 - (j + 0.5) * step);
    const wanted = sample(s.inside, M, (px + 1) / 2, (1 - py) / 2) >= 0.5;
    const on = hit[i + j * N] === 1;
    if (on || wanted) either++;
    if (on && wanted) overlap++;
    if (on && wanted && reading.depth && reading.depthSize) {
      pairs.push([fronts[i + j * N], sample(reading.depth, reading.depthSize, (s.toU(px) - box.u0) / (box.u1 - box.u0), (s.toV(py) - box.v0) / (box.v1 - box.v0))]);
    }
  }
  for (let j = 0; j < N; j++) {
    let lo = -1, hi = -1;
    for (let i = 0; i < N; i++) if (hit[i + j * N]) { if (lo < 0) lo = i; hi = i; }
    widthAt[j] = lo >= 0 ? (hi - lo + 1) * step : 0;
  }
  let corr: number | null = null;
  if (pairs.length > 30) {
    const ma = pairs.reduce((t, p) => t + p[0], 0) / pairs.length, mb = pairs.reduce((t, p) => t + p[1], 0) / pairs.length;
    let ab = 0, aa = 0, bb = 0;
    for (const [a, b] of pairs) { ab += (a - ma) * (b - mb); aa += (a - ma) ** 2; bb += (b - mb) ** 2; }
    corr = aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  }
  let ratioSum = 0, ratioN = 0;
  for (let j = 0; j < N; j++) if (widthAt[j] > step * 3 && depthAt[j] > 0) { ratioSum += depthAt[j] / widthAt[j]; ratioN++; }

  // The base is what's in the lowest tenth of the height.
  let baseLo = Infinity, baseHi = -Infinity;
  const baseLine = minY + height * 0.1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (1 - (j + 0.5) * step <= baseLine && hit[i + j * N]) { const x = (i + 0.5) * step - 1; baseLo = Math.min(baseLo, x); baseHi = Math.max(baseHi, x); }
  }
  const centre = massN ? massX / massN : 0;

  const mesh = meshFromField(field, 4);
  const parent = Int32Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < mesh.indices.length; i += 3) { const a = find(mesh.indices[i]); parent[find(mesh.indices[i + 1])] = a; parent[find(mesh.indices[i + 2])] = a; }
  const sizes = new Map<number, number>();
  for (let i = 0; i < parent.length; i++) { const r = find(i); sizes.set(r, (sizes.get(r) ?? 0) + 1); }

  return {
    iou: either ? overlap / either : 0, depthMatch: corr, depthRatio: height > 0 ? depth / height : 0,
    mainPiece: parent.length ? Math.max(0, ...sizes.values()) / parent.length : 0, roundness: ratioN ? ratioSum / ratioN : 0,
    balance: Math.abs(centre - (baseLo + baseHi) / 2) / Math.max((baseHi - baseLo) / 2, step), width, height, depth,
  };
}

/** Judges the measurements against the picture and against what this kind of thing is like. */
export function judge(m: Measured, plan: BuildPlan, prior: ObjectPrior | null, s: Stage): Check[] {
  const checks: Check[] = [
    { id: 'outline', label: 'Matches the outline in the picture', pass: m.iou >= 0.88, detail: `${Math.round(m.iou * 100)}% overlap` },
    { id: 'piece', label: 'Holds together as one piece', pass: m.mainPiece >= 0.97, detail: `${Math.round(m.mainPiece * 100)}% in the main piece` },
  ];
  if (m.depthMatch !== null) {
    const flatByNature = plan.structure === 'round' || plan.structure === 'slab' || plan.structure === 'sheet';
    checks.push({ id: 'depth', label: 'Near parts stand forward, as in the picture', pass: m.depthMatch >= 0.2, detail: `depth agreement ${m.depthMatch.toFixed(2)}`, advisory: flatByNature });
  }
  if (plan.structure === 'round') {
    checks.push({ id: 'round', label: 'Section is round', pass: Math.abs(m.roundness - 1) < 0.2, detail: `depth is ${m.roundness.toFixed(2)} of width` });
  } else {
    const off = plan.depthRatio > 0 ? m.depthRatio / plan.depthRatio : 1;
    checks.push({ id: 'proportion', label: prior ? `Depth suits ${/^[aeiou]/.test(prior.label) ? 'an' : 'a'} ${prior.label}` : 'Depth is what was planned', pass: off > 0.7 && off < 1.35, detail: `${m.depthRatio.toFixed(2)} of its height, wanted ${plan.depthRatio.toFixed(2)}` });
  }
  if (!s.cropped && plan.structure !== 'sheet' && plan.structure !== 'organic') {
    checks.push({ id: 'balance', label: 'Would stand up', pass: m.balance <= 1, detail: m.balance <= 1 ? 'centre of mass over its base' : 'centre of mass past its base', advisory: true });
  }
  if (s.cropped) checks.push({ id: 'crop', label: 'The whole thing is in the picture', pass: false, detail: 'it runs off the frame, so that edge is cut flat', advisory: true });
  return checks;
}

const scoreOf = (checks: Check[], m: Measured) => {
  const hard = checks.filter((c) => !c.advisory);
  return hard.filter((c) => c.pass).length / Math.max(hard.length, 1) + m.iou * 0.5 + (m.depthMatch ?? 0) * 0.2;
};

/** Real proportions from the prior: which of its dimensions the picture is showing, and so what's left for depth. */
export function planFor(prior: ObjectPrior | null, s: Stage): BuildPlan {
  const aspect = s.wide / Math.max(s.tall, 1e-4);
  const structure: Structure = prior?.structure ?? (s.symmetry > 0.86 ? 'organic' : 'mirrored');
  let view: View = s.symmetry > 0.8 ? 'front' : 'side';
  let depthRatio: number;
  if (prior) {
    const [w, h, d] = prior.size;
    // Seen from the front it shows width by height, side-on the long dimension by height.
    const long = Math.max(w, d), short = Math.min(w, d);
    if (structure === 'mirrored' || structure === 'figure') {
      const shownLong = Math.abs(Math.log(aspect / (long / h))), shownShort = Math.abs(Math.log(aspect / (short / h)));
      view = shownLong < shownShort && long / short > 1.3 ? 'side' : s.symmetry > 0.72 ? 'front' : 'side';
    }
    const unseen = structure === 'mirrored' || structure === 'figure' ? (view === 'side' ? short : (w >= d ? d : w)) : d;
    depthRatio = unseen / h;
  } else {
    depthRatio = Math.min(1, aspect) * 0.6;
  }
  // Whatever it should be, it has to fit in the clay.
  depthRatio = Math.min(depthRatio, 1.7 / Math.max(s.tall, 0.1));
  if (structure === 'round') depthRatio = aspect;
  return { structure, view, depthRatio, relief: 0.6 };
}

export interface BuildOptions {
  grid: number;
  band: number;
  prior?: ObjectPrior | null;
  /** The person's own choice wins over what was inferred. */
  structure?: Structure;
  relief?: number;
  depthScale?: number;
  onProgress?: (fraction: number, label: string) => void;
}

/**
 * Builds and checks at low resolution, corrects, then bakes the keeper at full size. With no prior it tries the
 * structures that could explain the picture and keeps the one that holds up best.
 */
export function build(reading: ImageReading, options: BuildOptions): BuildResult {
  const { grid, band, prior = null, onProgress } = options;
  const s = readStage(reading);
  onProgress?.(0.1, 'Reading the depth');
  const depth = readDepth(reading, s);
  const testGrid = Math.max(32, grid >> 1), testBand = band * 2;
  const corrections: string[] = [];
  const base = planFor(prior, s);
  if (options.relief !== undefined) base.relief = options.relief;
  if (options.depthScale !== undefined) base.depthRatio *= options.depthScale;
  const aspect = s.wide / Math.max(s.tall, 1e-4);
  const candidates: BuildPlan[] = options.structure
    ? [{ ...base, structure: options.structure, depthRatio: options.structure === 'round' ? aspect : base.depthRatio }]
    : prior ? [base]
      : (['organic', 'round', 'slab', 'mirrored'] as Structure[]).map((structure) => ({ ...base, structure, depthRatio: structure === 'round' ? aspect : structure === 'slab' ? base.depthRatio * 0.5 : base.depthRatio }));

  let best: { plan: BuildPlan; score: number } | null = null as { plan: BuildPlan; score: number } | null;
  candidates.forEach((candidate, index) => {
    onProgress?.(0.15 + 0.35 * (index / candidates.length), `Trying it as ${candidate.structure}`);
    const plan = { ...candidate };
    const wanted = plan.depthRatio;
    let gain = 1;
    for (let round = 0; round < 3; round++) {
      const field = bake(s, shapeMaps(s, depth, { ...plan, depthRatio: wanted * gain }), testGrid, testBand);
      const m = measure(field, s, reading);
      const checks = judge(m, plan, prior, s);
      const score = scoreOf(checks, m);
      if (!best || score > best.score) best = { plan: { ...plan, depthRatio: wanted * gain }, score };
      // What can be fixed by the numbers, is. Relief adds to thickness, so thickness is what gets corrected.
      let changed = false;
      if (plan.structure !== 'round' && m.depthRatio > 0) {
        const off = m.depthRatio / wanted;
        if (off < 0.85 || off > 1.18) {
          gain *= Math.min(1.6, Math.max(0.6, 1 / off));
          corrections.push(`Came out ${m.depthRatio.toFixed(2)} deep for its height, wanted ${wanted.toFixed(2)}: adjusted the thickness.`);
          changed = true;
        }
      }
      if (m.depthMatch !== null && m.depthMatch < 0 && plan.relief > 0.15 && plan.structure !== 'round') {
        plan.relief *= 0.5;
        corrections.push('The front disagreed with the depth map: eased the relief.');
        changed = true;
      }
      if (!changed) break;
    }
  });
  const chosen = best!.plan;
  onProgress?.(0.65, 'Building at full size');
  const field = bake(s, shapeMaps(s, depth, chosen), grid, band);
  onProgress?.(0.9, 'Checking the result');
  const m = measure(field, s, reading);
  // Judged against what was wanted before correction: the check is on the thing, not on the correction.
  const checks = judge(m, { ...chosen, depthRatio: candidates.find((c) => c.structure === chosen.structure)?.depthRatio ?? chosen.depthRatio }, prior, s);
  let size: [number, number, number] | undefined;
  if (prior) {
    const perUnit = prior.size[1] / Math.max(m.height, 1e-4);
    size = [m.width * perUnit, prior.size[1], m.depth * perUnit];
  }
  // The honest limit. A depth map sees one side, and inflating an outline can't make wings or spokes. A thing with
  // parts like that, or one turned away from the camera, passes every check above and is still a blob.
  const simple = chosen.structure === 'round' || chosen.structure === 'slab' || chosen.structure === 'sheet';
  const reasons: string[] = [];
  if (!simple && s.complexity > 5) reasons.push('its outline has thin parts a depth map cannot separate');
  if (!simple && depth && depth.turned > 0.45) reasons.push('it is turned at an angle, so its two sides are unseen');
  if (!simple && chosen.structure !== 'figure' && chosen.structure !== 'organic' && chosen.structure !== 'branching') reasons.push(`a ${prior?.label ?? 'thing like this'} has hard parts that need real geometry`);
  const needsGenerated = reasons.length ? reasons.join(', ') : null;
  if (needsGenerated) checks.push({ id: 'capture', label: 'Depth alone can capture this', pass: false, detail: needsGenerated });
  else checks.push({ id: 'capture', label: 'Depth alone can capture this', pass: true, detail: `outline complexity ${s.complexity.toFixed(1)}` });
  return { field, plan: chosen, checks, score: scoreOf(checks, m), corrections, size, needsGenerated };
}
