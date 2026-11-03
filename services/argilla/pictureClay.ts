/**
 * pictureClay.ts — turn a cut-out and a depth map into clay.
 *
 * The body comes from the silhouette: a Poisson solve inside it gives every limb a round section sized
 * to its own width, so an arm stays an arm instead of the fin a plain distance-based inflate makes.
 * Depth then adds relief to the front only. The back was never seen, so it stays a smooth pillow.
 */

import { BRICK_STRIDE, BRICK_VOXELS } from './brickPool';
import type { ClayFieldSnapshot } from './engine';

export interface PictureMaps {
  /** Square map of coverage, 0–1, squashed from the picture. */
  mask: Float32Array;
  maskSize: number;
  /** Square map where nearer is larger. Absent means silhouette only. */
  depth?: Float32Array;
  depthSize?: number;
  /** Picture width / height. */
  aspect: number;
}

export interface PictureClayOptions {
  grid: number;
  band: number;
  /** 0–1: how far depth pushes the front. */
  relief?: number;
  /** 0–1.5: how full the body is. */
  thickness?: number;
  fit?: number;
  onProgress?: (fraction: number) => Promise<void> | void;
}

const MAP_SIZE = 512;

export function sample(map: ArrayLike<number>, size: number, u: number, v: number) {
  const x = Math.max(0, Math.min(size - 1.001, u * size - 0.5));
  const y = Math.max(0, Math.min(size - 1.001, v * size - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const i = x0 + y0 * size;
  return (map[i] * (1 - fx) + map[i + 1] * fx) * (1 - fy) + (map[i + size] * (1 - fx) + map[i + size + 1] * fx) * fy;
}

/** Keeps only the largest connected shape, so stray specks from the cut-out don't become clay. */
export function largestShape(mask: Float32Array, size: number, threshold = 0.5) {
  const label = new Int32Array(size * size);
  const stack: number[] = [];
  let best = 0, bestCount = 0, next = 0;
  for (let start = 0; start < label.length; start++) {
    if (label[start] || mask[start] < threshold) continue;
    next++;
    let count = 0;
    label[start] = next;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % size;
      const visit = (j: number) => { if (!label[j] && mask[j] >= threshold) { label[j] = next; stack.push(j); } };
      if (x > 0) visit(i - 1);
      if (x < size - 1) visit(i + 1);
      if (i >= size) visit(i - size);
      if (i < size * (size - 1)) visit(i + size);
    }
    if (count > bestCount) { bestCount = count; best = next; }
  }
  if (!best) return null;
  let u0 = size, v0 = size, u1 = 0, v1 = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (label[x + y * size] !== best) continue;
    if (x < u0) u0 = x;
    if (x > u1) u1 = x;
    if (y < v0) v0 = y;
    if (y > v1) v1 = y;
  }
  return { label, best, count: bestCount, u0: u0 / size, v0: v0 / size, u1: (u1 + 1) / size, v1: (v1 + 1) / size };
}

/** One-dimensional squared distance pass (Felzenszwalb), run along rows then columns. */
export function distanceSquared(seed: (i: number) => boolean, size: number) {
  const big = size * size * 4;
  const out = new Float64Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = seed(i) ? 0 : big;
  const line = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
  const pass = (start: number, step: number) => {
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 0; q < size; q++) line[q] = out[start + q * step];
    for (let q = 1; q < size; q++) {
      let s = ((line[q] + q * q) - (line[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= z[k]) { k--; s = ((line[q] + q * q) - (line[v[k]] + v[k] * v[k])) / (2 * (q - v[k])); }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < size; q++) {
      while (z[k + 1] < q) k++;
      out[start + q * step] = (q - v[k]) ** 2 + line[v[k]];
    }
  };
  for (let y = 0; y < size; y++) pass(y * size, 1);
  for (let x = 0; x < size; x++) pass(x, size);
  return out;
}

/** Solves laplacian(u) = -2 inside the shape, coarse to fine; sqrt(u) is then a round section. */
export function inflate(inside: Uint8Array, size: number, pixel: number) {
  const levels: { size: number; inside: Uint8Array }[] = [{ size, inside }];
  while (levels[levels.length - 1].size > 32) {
    const from = levels[levels.length - 1];
    const s = from.size >> 1;
    const down = new Uint8Array(s * s);
    // A coarse cell counts as inside only when all of it is, which keeps the boundary pinned to zero.
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const a = x * 2 + y * 2 * from.size;
      down[x + y * s] = from.inside[a] & from.inside[a + 1] & from.inside[a + from.size] & from.inside[a + from.size + 1];
    }
    levels.push({ size: s, inside: down });
  }
  let u = new Float32Array(levels[levels.length - 1].size ** 2);
  for (let level = levels.length - 1; level >= 0; level--) {
    const { size: s, inside: on } = levels[level];
    const h = pixel * (size / s);
    const source = 2 * h * h;
    const iterations = level === levels.length - 1 ? 400 : 60;
    for (let it = 0; it < iterations; it++) {
      for (let y = 1; y < s - 1; y++) for (let x = 1; x < s - 1; x++) {
        const i = x + y * s;
        if (!on[i]) { u[i] = 0; continue; }
        // Over-relaxed Gauss-Seidel.
        u[i] += 1.7 * ((u[i - 1] + u[i + 1] + u[i - s] + u[i + s] + source) / 4 - u[i]);
      }
    }
    if (level > 0) {
      const t = levels[level - 1].size;
      const up = new Float32Array(t * t);
      for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) up[x + y * t] = sample(u, s, (x + 0.5) / t, (y + 0.5) / t);
      u = up;
    }
  }
  return u;
}

export function blur(map: Float32Array, size: number, passes: number) {
  let from = map, to = new Float32Array(map.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = x + y * size;
      to[i] = (from[x > 0 ? i - 1 : i] + 2 * from[i] + from[x < size - 1 ? i + 1 : i]) / 4;
    }
    [from, to] = [to, from];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = x + y * size;
      to[i] = (from[y > 0 ? i - size : i] + 2 * from[i] + from[y < size - 1 ? i + size : i]) / 4;
    }
    [from, to] = [to, from];
  }
  return from === map ? from : from.slice();
}

/** Near-Gaussian blur at any radius (three box passes), averaging only pixels inside the shape. */
export function wideBlur(map: Float32Array, inside: Uint8Array, size: number, radius: number) {
  const box = (src: Float64Array, step: number, across: number) => {
    const out = new Float64Array(src.length);
    for (let a = 0; a < size; a++) {
      const start = a * across;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[start + Math.max(0, Math.min(size - 1, k)) * step];
      for (let k = 0; k < size; k++) {
        out[start + k * step] = sum / (2 * radius + 1);
        sum += src[start + Math.min(size - 1, k + radius + 1) * step] - src[start + Math.max(0, k - radius) * step];
      }
    }
    return out;
  };
  let value = Float64Array.from(map, (v, i) => (inside[i] ? v : 0));
  let cover = Float64Array.from(inside);
  for (let pass = 0; pass < 3; pass++) {
    value = box(box(value, 1, size), size, 1);
    cover = box(box(cover, 1, size), size, 1);
  }
  return Float32Array.from(value, (v, i) => (cover[i] > 1e-5 ? v / cover[i] : 0));
}

export async function pictureToClay(maps: PictureMaps, options: PictureClayOptions): Promise<ClayFieldSnapshot> {
  const { grid, band, relief = 0.5, thickness = 0.8, fit = 0.82, onProgress } = options;
  const shape = largestShape(maps.mask, maps.maskSize);
  if (!shape || shape.count < maps.maskSize ** 2 * 0.002) throw new Error('No clear subject found in this picture.');

  // World fit: the subject's longest side, in true picture proportions, spans 2 * fit.
  const wide = (shape.u1 - shape.u0) * maps.aspect, tall = shape.v1 - shape.v0;
  const scale = (2 * fit) / Math.max(wide, tall);
  const uc = (shape.u0 + shape.u1) / 2, vc = (shape.v0 + shape.v1) / 2;
  const M = MAP_SIZE;
  const pixel = 2 / M;
  const toU = (x: number) => uc + x / (scale * maps.aspect);
  const toV = (y: number) => vc - y / scale;

  const keep = new Float32Array(maps.mask.length);
  for (let i = 0; i < keep.length; i++) keep[i] = shape.label[i] === shape.best ? maps.mask[i] : 0;
  const inside = new Uint8Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = (i + 0.5) * pixel - 1, y = 1 - (j + 0.5) * pixel;
    const u = toU(x), v = toV(y);
    if (u < 0 || v < 0 || u > 1 || v > 1) continue;
    inside[i + j * M] = sample(keep, maps.maskSize, u, v) >= 0.5 ? 1 : 0;
  }
  await onProgress?.(0.1);

  const toInside = distanceSquared((i) => !inside[i], M);
  const toOutside = distanceSquared((i) => !!inside[i], M);
  const signed = new Float32Array(M * M);
  for (let i = 0; i < signed.length; i++) signed[i] = (Math.sqrt(toOutside[i]) - Math.sqrt(toInside[i])) * pixel;
  // The cut-out's outline is stair-stepped, and the square root below would turn each step into a rib.
  const S = blur(signed, M, 6);
  for (let i = 0; i < inside.length; i++) inside[i] = S[i] < 0 ? 1 : 0;
  await onProgress?.(0.2);

  const u = inflate(inside, M, pixel);
  // Near the rim the solve still follows the pixels, but it grows almost evenly with distance from
  // the edge, so there it is rebuilt as a smooth rate times the smooth distance.
  const rimWidth = pixel * 14;
  const ramp = new Float32Array(M * M), onRamp = new Uint8Array(M * M);
  for (let i = 0; i < ramp.length; i++) {
    const d = -S[i];
    if (d > pixel * 3 && d < rimWidth * 1.5) { ramp[i] = u[i] / d; onRamp[i] = 1; }
  }
  const rate = wideBlur(ramp, onRamp, M, 8);
  for (let i = 0; i < u.length; i++) {
    const d = -S[i];
    if (!inside[i] || d >= rimWidth) continue;
    const t = d / rimWidth;
    u[i] = rate[i] * d * (1 - t) + u[i] * t;
  }
  await onProgress?.(0.4);

  // Relief is measured against the subject's own depth range, so backgrounds can't flatten it.
  let rel: Float32Array | null = null;
  if (maps.depth && maps.depthSize) {
    const values: number[] = [];
    rel = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      if (!inside[i + j * M]) continue;
      const d = sample(maps.depth, maps.depthSize, toU((i + 0.5) * pixel - 1), toV(1 - (j + 0.5) * pixel));
      rel[i + j * M] = d;
      values.push(d);
    }
    values.sort((a, b) => a - b);
    const lo = values[Math.floor(values.length * 0.05)], hi = values[Math.floor(values.length * 0.95)];
    const mid = values[values.length >> 1], span = Math.max(hi - lo, 1e-5);
    for (let i = 0; i < rel.length; i++) rel[i] = inside[i] ? Math.max(-1.2, Math.min(1.2, (rel[i] - mid) / span)) : 0;
    // Broad depth would bury a face under the shoulder behind it, so features get their own gain,
    // measured against how strong they are in this picture.
    const fine = blur(rel, M, 1);
    const broad = wideBlur(fine, inside, M, 26);
    let power = 0, n = 0;
    for (let i = 0; i < rel.length; i++) if (inside[i]) { power += (fine[i] - broad[i]) ** 2; n++; }
    const gain = 1 / Math.max(Math.sqrt(power / Math.max(n, 1)), 1e-4);
    for (let i = 0; i < rel.length; i++) rel[i] = broad[i] * 0.5 + (fine[i] - broad[i]) * gain * 0.4;
  }

  // Stored as thickness squared, which runs straight through the rim where thickness itself turns
  // vertical and no map could hold it. Past the outline it goes negative, so no surface exists there.
  const voxel = 2 / (grid * BRICK_VOXELS);
  const rateFar = rate.reduce((sum, v) => sum + v, 0) / Math.max(1, onRamp.reduce((sum, v) => sum + v, 0)) || 0.5;
  const squared = new Float32Array(M * M);
  for (let i = 0; i < squared.length; i++) {
    squared[i] = (inside[i] ? u[i] : (rate[i] || rateFar) * -S[i]) * thickness * thickness;
  }
  const edge = 0.08;
  const pushMap = new Float32Array(M * M);
  if (rel) for (let i = 0; i < pushMap.length; i++) {
    if (!inside[i]) continue;
    const limit = Math.sqrt(Math.max(0, squared[i])) * 0.8;
    pushMap[i] = Math.max(-limit, rel[i] * relief * 0.3 * Math.min(1, -S[i] / edge));
  }
  const H2 = blur(squared, M, 1), push = blur(pushMap, M, 1);

  // Sits the mass on the middle of the domain, and keeps a very full form inside it.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < H2.length; i++) {
    if (H2[i] <= 0) continue;
    const h = Math.sqrt(H2[i]);
    if (push[i] + h > hi) hi = push[i] + h;
    if (-h < lo) lo = -h;
  }
  const centre = Number.isFinite(lo) ? (lo + hi) / 2 : 0;
  const clearance = Number.isFinite(lo) ? Math.min(1, 1.9 / Math.max(hi - lo, 1e-5)) : 1;
  if (clearance < 1) for (let i = 0; i < H2.length; i++) { H2[i] *= clearance * clearance; push[i] *= clearance; }

  const slopeOf = (map: Float32Array) => {
    const out = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const dx = (map[j * M + Math.min(M - 1, i + 1)] - map[j * M + Math.max(0, i - 1)]) / (2 * pixel);
      const dy = (map[Math.min(M - 1, j + 1) * M + i] - map[Math.max(0, j - 1) * M + i]) / (2 * pixel);
      out[i + j * M] = Math.hypot(dx, dy);
    }
    return out;
  };
  const H2Slope = slopeOf(H2), pushSlope = slopeOf(push);
  await onProgress?.(0.5);

  // ---- Bricks, one column of cells at a time --------------------------------------------------
  const count = BRICK_STRIDE ** 3;
  const cellSize = 2 / grid;
  const margin = band + voxel * 2;
  const near = band * 0.999;
  const states = new Uint8Array(grid ** 3);
  const cells: number[] = [];
  const blocks: Float32Array[] = [];
  const toMap = (w: number) => Math.max(0, Math.min(M - 1, Math.floor((w + 1) / pixel)));
  const toCell = (w: number) => Math.max(0, Math.min(grid - 1, Math.floor((w + 1) / cellSize)));

  const face = BRICK_STRIDE ** 2;
  const columnH2 = new Float32Array(face), columnP = new Float32Array(face);
  const columnH2S = new Float32Array(face), columnPS = new Float32Array(face);

  const makeBrick = (gx: number, gy: number, gz: number) => {
    const ox = gx * cellSize - 1 - voxel, oy = gy * cellSize - 1 - voxel, oz = gz * cellSize - 1 - voxel;
    const values = new Float32Array(count);
    let min = Infinity, max = -Infinity;
    let n = 0;
    // Maps are read once per x,y: every z in the brick shares them.
    for (let y = 0, c = 0; y < BRICK_STRIDE; y++) {
      const v = (1 - (oy + y * voxel)) / 2;
      for (let x = 0; x < BRICK_STRIDE; x++, c++) {
        const mapU = (ox + x * voxel + 1) / 2;
        columnH2[c] = sample(H2, M, mapU, v);
        columnP[c] = sample(push, M, mapU, v);
        columnH2S[c] = sample(H2Slope, M, mapU, v);
        columnPS[c] = sample(pushSlope, M, mapU, v);
      }
    }
    for (let z = 0; z < BRICK_STRIDE; z++) {
      const pz = oz + z * voxel + centre;
      for (let y = 0; y < BRICK_STRIDE; y++) {
        for (let x = 0; x < BRICK_STRIDE; x++) {
          const c = x + y * BRICK_STRIDE;
          const p = columnP[c];
          // Height off the front or back sheet; between the sheets it is all interior.
          const above = pz > Math.max(p, 0) ? pz - p : pz < Math.min(p, 0) ? pz : 0;
          const g = above * above - columnH2[c];
          // First-order distance: the value over its gradient, which stays good right up to the rim.
          const tilt = above > 0 && pz > p ? columnPS[c] : 0;
          const f = g / Math.max(Math.sqrt(4 * above * above * (1 + tilt * tilt) + columnH2S[c] * columnH2S[c]), 1e-4);
          const value = Math.max(-band, Math.min(band, f));
          values[n++] = value;
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
    }
    const cell = gx + grid * (gy + grid * gz);
    if (min >= near) return;
    if (max <= -near) { states[cell] = 1; return; }
    cells.push(cell);
    blocks.push(values);
  };

  for (let gy = 0; gy < grid; gy++) {
    if (onProgress && gy % 8 === 0) await onProgress(0.5 + 0.5 * (gy / grid));
    for (let gx = 0; gx < grid; gx++) {
      const x0 = gx * cellSize - 1 - margin, x1 = (gx + 1) * cellSize - 1 + margin;
      const y0 = gy * cellSize - 1 - margin, y1 = (gy + 1) * cellSize - 1 + margin;
      let minS = Infinity, maxS = -Infinity;
      let frontLo = Infinity, frontHi = -Infinity, backLo = Infinity, backHi = -Infinity;
      for (let j = toMap(-y1); j <= toMap(-y0); j++) for (let i = toMap(x0); i <= toMap(x1); i++) {
        const c = i + j * M;
        if (S[c] < minS) minS = S[c];
        if (S[c] > maxS) maxS = S[c];
        const h = Math.sqrt(Math.max(0, H2[c]));
        const top = push[c] + h - centre, bottom = -h - centre;
        if (top < frontLo) frontLo = top;
        if (top > frontHi) frontHi = top;
        if (bottom < backLo) backLo = bottom;
        if (bottom > backHi) backHi = bottom;
      }
      if (minS > margin) continue;
      if (maxS > -margin) {
        // Straddles the outline: every cell from back to front may hold surface.
        for (let gz = toCell(backLo - margin); gz <= toCell(frontHi + margin); gz++) makeBrick(gx, gy, gz);
        continue;
      }
      const backTop = toCell(backHi + margin), frontBottom = toCell(frontLo - margin);
      for (let gz = toCell(backLo - margin); gz <= backTop; gz++) makeBrick(gx, gy, gz);
      for (let gz = Math.max(backTop + 1, frontBottom); gz <= toCell(frontHi + margin); gz++) makeBrick(gx, gy, gz);
      for (let gz = backTop + 1; gz < frontBottom; gz++) states[gx + grid * (gy + grid * gz)] = 1;
    }
  }

  const values = new Float32Array(cells.length * count);
  blocks.forEach((b, n) => values.set(b, n * count));
  return { grid, band, states, cells: new Uint32Array(cells), values };
}
