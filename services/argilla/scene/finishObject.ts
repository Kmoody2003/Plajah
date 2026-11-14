/**
 * finishObject.ts — clay plus its source picture into one textured object, in real metres.
 *
 * The picture paints every side it can see, with the subject's colours carried past its outline so no background
 * bleeds in. Sides it can't see take a soft version of the same place: right colour, no invented detail.
 */

import { meshFromField, type ClayFieldSnapshot } from '../engine';
import { atlasUv, bakeNormals, fieldSampler } from '../creature/finish';
import type { SurfaceMesh } from '../surfaceNets';

export interface PictureSource {
  rgba: Uint8ClampedArray; width: number; height: number;
  mask: Float32Array; maskSize: number;
  /** Which part of the picture the clay's -fit..fit spans. */
  toU: (x: number) => number;
  toV: (y: number) => number;
  /** False when the shape can't line up with the picture: it then takes only the picture's colours. */
  sharp?: boolean;
  /** Which part of the subject each pixel belongs to, and how each part takes light. Only when the shape lines up. */
  parts?: SurfaceParts;
  /** The picture's depth, for shapes that didn't come from it and so may not agree with it. */
  depth?: PictureDepth;
}

export interface SurfaceParts {
  labels: Uint8Array; width: number; height: number;
  roughness: Float32Array; metalness: Float32Array;
}

export interface FinishedObject {
  mesh: SurfaceMesh;
  uvs: Float32Array;
  textureSize: number;
  texture: Uint8ClampedArray;
  normalSize: number;
  normalMap: Uint8ClampedArray;
  /** Roughness in green and metalness in blue, the layout glTF expects. Present when the parts are known. */
  surface?: Uint8ClampedArray;
  /** Which part each triangle belongs to. */
  triangleParts?: Uint8Array;
}

/** Parts stop at the subject's outline, but the clay can run just past it. Each spreads outward so its edge has an owner. */
export function spreadLabels(labels: Uint8Array, width: number, height: number, passes = 24) {
  const out = labels.slice();
  for (let pass = 0; pass < passes; pass++) {
    const was = out.slice();
    let any = false;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = x + y * width;
      if (was[i]) continue;
      const from = x > 0 && was[i - 1] ? i - 1 : x < width - 1 && was[i + 1] ? i + 1 : y > 0 && was[i - width] ? i - width : y < height - 1 && was[i + width] ? i + width : -1;
      if (from >= 0) { out[i] = was[from]; any = true; }
    }
    if (!any) break;
  }
  return out;
}

/**
 * What the camera can actually see, looking down -z. Without this an arm's far side and the chest behind it both take
 * the arm's pixels, because a straight projection goes right through the object.
 */
export function visibilityFrom(positions: Float32Array, indices: ArrayLike<number>, grid = 768) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let v = 0; v < positions.length; v += 3) {
    x0 = Math.min(x0, positions[v]); x1 = Math.max(x1, positions[v]);
    y0 = Math.min(y0, positions[v + 1]); y1 = Math.max(y1, positions[v + 1]);
    z0 = Math.min(z0, positions[v + 2]); z1 = Math.max(z1, positions[v + 2]);
  }
  const k = (grid - 1) / Math.max(x1 - x0, y1 - y0, 1e-6);
  const nearest = new Float32Array(grid * grid).fill(-Infinity);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = (positions[a] - x0) * k, ay = (positions[a + 1] - y0) * k, bx = (positions[b] - x0) * k, by = (positions[b + 1] - y0) * k, cx = (positions[c] - x0) * k, cy = (positions[c + 1] - y0) * k;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) continue;
    const gx0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), gx1 = Math.min(grid - 1, Math.ceil(Math.max(ax, bx, cx)));
    const gy0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), gy1 = Math.min(grid - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
      const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
      const z = positions[a + 2] * w0 + positions[b + 2] * w1 + positions[c + 2] * w2;
      if (z > nearest[x + y * grid]) nearest[x + y * grid] = z;
    }
  }
  // Roughly a voxel's worth of slack, so a surface doesn't shadow itself.
  const slack = Math.max(x1 - x0, y1 - y0, z1 - z0) * 0.012;
  return (x: number, y: number, z: number) => {
    const gx = Math.max(0, Math.min(grid - 1, Math.round((x - x0) * k))), gy = Math.max(0, Math.min(grid - 1, Math.round((y - y0) * k)));
    return z >= nearest[gx + gy * grid] - slack;
  };
}

/**
 * Colours for the vertices the picture doesn't show, carried across the surface from the nearest ones it does. It travels
 * over the object, not through it, so it can't streak. `known` gives a vertex's colour, or null when it isn't seen.
 */
export function fillUnseen(positions: Float32Array, indices: ArrayLike<number>, known: (vertex: number) => [number, number, number] | null, fallback: number[], smoothing = 24, partOf?: (vertex: number) => number) {
  const count = positions.length / 3;
  // The texture atlas splits vertices along its seams. Colour has to cross those, so they're joined again by position.
  const ids = new Map<number, number>();
  const weld = new Int32Array(count);
  const Q = 16384, P = 131072;
  for (let v = 0; v < count; v++) {
    const key = Math.round(positions[v * 3] * Q) + 65536 + (Math.round(positions[v * 3 + 1] * Q) + 65536) * P + (Math.round(positions[v * 3 + 2] * Q) + 65536) * P * P;
    let id = ids.get(key);
    if (id === undefined) ids.set(key, id = ids.size);
    weld[v] = id;
  }
  const welded = ids.size;
  const degree = new Int32Array(welded + 1);
  for (let t = 0; t < indices.length; t += 3) for (let e = 0; e < 3; e++) { degree[weld[indices[t + e]] + 1]++; degree[weld[indices[t + (e + 1) % 3]] + 1]++; }
  for (let i = 0; i < welded; i++) degree[i + 1] += degree[i];
  const links = new Int32Array(degree[welded]), filled = degree.slice();
  for (let t = 0; t < indices.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = weld[indices[t + e]], b = weld[indices[t + (e + 1) % 3]];
    links[filled[a]++] = b;
    links[filled[b]++] = a;
  }
  const colour = new Float32Array(welded * 3), fixed = new Uint8Array(welded), reached = new Uint8Array(welded), seedCount = new Uint16Array(welded);
  for (let v = 0; v < count; v++) {
    const seen = known(v);
    if (!seen) continue;
    const id = weld[v];
    for (let k = 0; k < 3; k++) colour[id * 3 + k] += seen[k];
    seedCount[id]++;
  }
  const queue = new Int32Array(welded);
  let head = 0, tail = 0;
  for (let id = 0; id < welded; id++) {
    if (!seedCount[id]) continue;
    for (let k = 0; k < 3; k++) colour[id * 3 + k] /= seedCount[id];
    fixed[id] = reached[id] = 1;
    queue[tail++] = id;
  }
  const group = new Uint8Array(welded);
  if (partOf) for (let v = 0; v < count; v++) group[weld[v]] = partOf(v);
  // First within each part, so a helmet's back stays helmet and doesn't take the face below its brim. Then across
  // parts, for whatever a part has no seen surface of its own to draw on.
  const spread = (sameOnly: boolean) => {
    while (head < tail) {
      const id = queue[head++];
      for (let l = degree[id]; l < degree[id + 1]; l++) {
        const next = links[l];
        if (reached[next] || (sameOnly && group[next] !== group[id])) continue;
        reached[next] = 1;
        for (let k = 0; k < 3; k++) colour[next * 3 + k] = colour[id * 3 + k];
        queue[tail++] = next;
      }
    }
  };
  spread(true);
  if (partOf) {
    head = 0;
    spread(false);
  }
  for (let id = 0; id < welded; id++) if (!reached[id]) for (let k = 0; k < 3; k++) colour[id * 3 + k] = fallback[k];
  // Nearest-colour patches have hard borders. Smoothing only what was invented melts them and leaves the seen colours alone.
  for (let pass = 0; pass < smoothing; pass++) {
    const was = colour.slice();
    for (let id = 0; id < welded; id++) {
      if (fixed[id] || degree[id + 1] === degree[id]) continue;
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let l = degree[id]; l < degree[id + 1]; l++) sum += was[links[l] * 3 + k];
        colour[id * 3 + k] = sum / (degree[id + 1] - degree[id]);
      }
    }
  }
  const out = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) for (let k = 0; k < 3; k++) out[v * 3 + k] = colour[weld[v] * 3 + k];
  return out;
}

export interface PictureDepth { values: Float32Array; size: number; box: { u0: number; v0: number; u1: number; v1: number } }

/** Below this the shape and the picture point different ways here. Above the second they agree outright. */
const AGREE_FROM = 0.78;
const AGREE_FULL = 0.93;

/**
 * Per vertex, whether the surface points the way the picture's depth says it should. A generated shape is only turned as
 * a whole, so a head looking another way in the picture would otherwise wear a face in the wrong place. Depth has no
 * real scale, so one is fitted first. Returns all ones when it can't be fitted, which leaves the paint as it was.
 */
export function agreementWithPicture(positions: Float32Array, normals: Float32Array, depth: PictureDepth, toU: (x: number) => number, toV: (y: number) => number) {
  const count = positions.length / 3;
  const out = new Float32Array(count).fill(1);
  const { values, size, box } = depth;
  const uk = toU(1) - toU(0), vk = toV(1) - toV(0);
  const reach = 5;
  const at = (a: number, b: number) => values[Math.max(0, Math.min(size - 1, a)) + Math.max(0, Math.min(size - 1, b)) * size];
  const gx = new Float32Array(count), gy = new Float32Array(count), usable = new Uint8Array(count);
  const perU = (size / (box.u1 - box.u0)) * uk, perV = (size / (box.v1 - box.v0)) * vk;
  let top = 0, bottom = 0;
  for (let v = 0; v < count; v++) {
    const nz = normals[v * 3 + 2];
    if (nz < FACING_FROM) continue;
    const a = (toU(positions[v * 3]) - box.u0) / (box.u1 - box.u0), b = (toV(positions[v * 3 + 1]) - box.v0) / (box.v1 - box.v0);
    if (a < 0 || b < 0 || a >= 1 || b >= 1) continue;
    const ia = Math.floor(a * size), ib = Math.floor(b * size);
    const px = ((at(ia + reach, ib) - at(ia - reach, ib)) / (2 * reach)) * perU, py = ((at(ia, ib + reach) - at(ia, ib - reach)) / (2 * reach)) * perV;
    gx[v] = px; gy[v] = py; usable[v] = 1;
    top += (-normals[v * 3] / nz) * px + (-normals[v * 3 + 1] / nz) * py;
    bottom += px * px + py * py;
  }
  const scale = bottom > 1e-12 ? top / bottom : 0;
  if (scale <= 0) return out;
  for (let v = 0; v < count; v++) {
    if (!usable[v]) continue;
    const x = -scale * gx[v], y = -scale * gy[v], length = Math.hypot(x, y, 1);
    const cos = (normals[v * 3] * x + normals[v * 3 + 1] * y + normals[v * 3 + 2]) / length;
    const k = Math.max(0, Math.min(1, (cos - AGREE_FROM) / (AGREE_FULL - AGREE_FROM)));
    out[v] = k * k * (3 - 2 * k);
  }
  return out;
}

/** How much of the picture a surface takes by how squarely it faces the camera. Past this it would stretch into streaks. */
const FACING_FROM = 0.3;
const FACING_FULL = 0.62;
export const facingWeight = (nz: number) => {
  const k = Math.max(0, Math.min(1, (nz - FACING_FROM) / (FACING_FULL - FACING_FROM)));
  return k * k * (3 - 2 * k);
};

/** Spreads the subject's colours outward over the background, and makes a blurred copy for the unseen side. */
function prepare(source: PictureSource, size = 1024) {
  const sharp = new Float32Array(size * size * 3), known = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = Math.floor((x / size) * source.width), py = Math.floor((y / size) * source.height);
    const m = source.mask[Math.floor((y / size) * source.maskSize) * source.maskSize + Math.floor((x / size) * source.maskSize)];
    const i = x + y * size;
    if (m < 0.75) continue;
    const c = (px + py * source.width) * 4;
    sharp[i * 3] = source.rgba[c] / 255; sharp[i * 3 + 1] = source.rgba[c + 1] / 255; sharp[i * 3 + 2] = source.rgba[c + 2] / 255;
    known[i] = 1;
  }
  for (let pass = 0; pass < 96; pass++) {
    const was = known.slice();
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const i = x + y * size;
      if (was[i]) continue;
      const from = was[i - 1] ? i - 1 : was[i + 1] ? i + 1 : was[i - size] ? i - size : was[i + size] ? i + size : -1;
      if (from < 0) continue;
      for (let k = 0; k < 3; k++) sharp[i * 3 + k] = sharp[from * 3 + k];
      known[i] = 1;
    }
  }
  let soft = sharp;
  for (let pass = 0; pass < 2; pass++) {
    const radius = 20, out = new Float32Array(soft.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      let n = 0;
      for (let k = -radius; k <= radius; k += 4) {
        const qx = pass ? x : Math.max(0, Math.min(size - 1, x + k)), qy = pass ? Math.max(0, Math.min(size - 1, y + k)) : y;
        const i = (qx + qy * size) * 3;
        sum[0] += soft[i]; sum[1] += soft[i + 1]; sum[2] += soft[i + 2]; n++;
      }
      const o = (x + y * size) * 3;
      out[o] = sum[0] / n; out[o + 1] = sum[1] / n; out[o + 2] = sum[2] / n;
    }
    soft = out;
  }
  return { sharp, soft, size };
}

/** `fine` keeps the clay's full detail, for shapes with thin parts that a coarser mesh would melt away. */
export function finishObject(field: ClayFieldSnapshot, source: PictureSource | null, base = '#9a958c', textureSize = 2048, fine = false): FinishedObject {
  const mesh = meshFromField(field, !fine && field.grid >= 96 ? 4 : 2);
  const charted = atlasUv(mesh.positions, mesh.normals, mesh.indices, textureSize);
  const prepared = source ? prepare(source) : null;
  const fallback = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16) / 255);
  const texture = new Uint8ClampedArray(textureSize * textureSize * 4);
  const { uvs, indices, positions, normals } = charted;
  const read = (map: Float32Array, u: number, v: number, k: number) => {
    const S = prepared!.size;
    const x = Math.max(0, Math.min(S - 1, Math.floor(u * S))), y = Math.max(0, Math.min(S - 1, Math.floor(v * S)));
    return map[(x + y * S) * 3 + k];
  };
  const size = textureSize;
  const visible = source && prepared ? visibilityFrom(positions, indices) : null;
  const agrees = source?.depth ? agreementWithPicture(positions, normals, source.depth, source.toU, source.toV) : null;
  const parts = source?.parts;
  const labels = parts ? spreadLabels(parts.labels, parts.width, parts.height) : null;
  const surface = parts ? new Uint8ClampedArray(size * size * 4) : undefined;
  const triangleParts = parts ? new Uint8Array(indices.length / 3) : undefined;
  const labelAt = (x: number, y: number) => {
    const px = Math.max(0, Math.min(parts!.width - 1, Math.floor(source!.toU(x) * parts!.width)));
    const py = Math.max(0, Math.min(parts!.height - 1, Math.floor(source!.toV(y) * parts!.height)));
    return labels![px + py * parts!.width];
  };
  // The sides it can't see take the colour of the nearest surface it can, spread over the object, keeping to its own part first.
  const unseen = source && prepared ? fillUnseen(positions, indices, (v) => {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    if (normals[v * 3 + 2] < FACING_FULL || !visible!(x, y, z) || (agrees && agrees[v] < 0.5)) return null;
    const u = source.toU(x), w = source.toV(y);
    return [read(prepared.soft, u, w, 0), read(prepared.soft, u, w, 1), read(prepared.soft, u, w, 2)];
  }, fallback, 24, labels ? (v) => labelAt(positions[v * 3], positions[v * 3 + 1]) : undefined) : null;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (triangleParts) {
      triangleParts[t / 3] = labelAt((positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3, (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3);
    }
    const ax = uvs[a * 2] * size, ay = uvs[a * 2 + 1] * size, bx = uvs[b * 2] * size, by = uvs[b * 2 + 1] * size, cx = uvs[c * 2] * size, cy = uvs[c * 2 + 1] * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const o = (x + y * size) * 4;
      if (!source || !prepared) {
        for (let k = 0; k < 3; k++) texture[o + k] = fallback[k] * 255;
      } else {
        const wx = positions[a * 3] * w0 + positions[b * 3] * w1 + positions[c * 3] * w2;
        const wy = positions[a * 3 + 1] * w0 + positions[b * 3 + 1] * w1 + positions[c * 3 + 1] * w2;
        const nz = normals[a * 3 + 2] * w0 + normals[b * 3 + 2] * w1 + normals[c * 3 + 2] * w2;
        const wz = positions[a * 3 + 2] * w0 + positions[b * 3 + 2] * w1 + positions[c * 3 + 2] * w2;
        const u = source.toU(wx), v = source.toV(wy);
        // Full picture where it faces the camera and nothing's in the way, easing to the invented colour as it turns away.
        const agreed = agrees ? agrees[a] * w0 + agrees[b] * w1 + agrees[c] * w2 : 1;
        const seen = source.sharp === false || !visible!(wx, wy, wz) ? 0 : facingWeight(nz) * Math.max(0, Math.min(1, agreed));
        for (let k = 0; k < 3; k++) {
          const filled = unseen![a * 3 + k] * w0 + unseen![b * 3 + k] * w1 + unseen![c * 3 + k] * w2;
          texture[o + k] = (filled + (read(prepared.sharp, u, v, k) - filled) * seen) * 255;
        }
        if (surface) {
          const label = labelAt(wx, wy);
          surface[o] = 255;
          surface[o + 1] = parts!.roughness[label] * 255;
          surface[o + 2] = parts!.metalness[label] * 255;
          surface[o + 3] = 255;
        }
      }
      texture[o + 3] = 255;
    }
  }
  // Grow every chart past its edge, so filtering at a seam doesn't pick up the empty atlas.
  for (let pass = 0; pass < 3; pass++) {
    const was = texture.slice();
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const i = (x + y * size) * 4;
      if (was[i + 3]) continue;
      const from = was[i - 4 + 3] ? i - 4 : was[i + 4 + 3] ? i + 4 : was[i - size * 4 + 3] ? i - size * 4 : was[i + size * 4 + 3] ? i + size * 4 : -1;
      if (from < 0) continue;
      for (let k = 0; k < 4; k++) texture[i + k] = was[from + k];
      if (surface) for (let k = 0; k < 4; k++) surface[i + k] = surface[from + k];
    }
  }
  const normalSize = 1024;
  return {
    mesh: { positions, normals, indices }, uvs, textureSize, texture, normalSize,
    normalMap: bakeNormals(charted, fieldSampler(field), normalSize),
    surface, triangleParts,
  };
}
