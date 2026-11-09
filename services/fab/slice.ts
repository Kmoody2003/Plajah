// Mesh slicing: cut a triangle mesh with horizontal planes and stitch the cut segments into closed
// contours. Feeds the FDM slicer, resin layer images, and CLI layer files for metal powder-bed machines.

import type { Loop, P2 } from './geom2d';
import { clean } from './geom2d';

export interface MeshIn { positions: Float32Array | number[]; indices: Uint32Array | number[] }
export interface Layer { z: number; loops: Loop[] }

export function meshBounds(meshes: MeshIn[]) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = m.positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { min, max };
}

/** Contours of the mesh at height z. Vertices exactly on the plane are nudged to avoid degenerate cuts. */
export function sliceAt(meshes: MeshIn[], z: number): Loop[] {
  const segs: Array<[P2, P2]> = [];
  for (const m of meshes) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const v = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2] === z ? z + 1e-7 : P[i * 3 + 2]] as [number, number, number]);
      const above = v.map(p => p[2] > z); const nAbove = above.filter(Boolean).length; if (nAbove === 0 || nAbove === 3) continue;
      const pts: P2[] = [];
      for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if ((a[2] > z) !== (b[2] > z)) { const k = (z - a[2]) / (b[2] - a[2]); pts.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); } }
      if (pts.length !== 2) continue;
      // Orient so solid is on the left (counter-clockwise outer contours), from the face normal.
      const ab = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], ac = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
      const nx = ab[1] * ac[2] - ab[2] * ac[1], ny = ab[2] * ac[0] - ab[0] * ac[2];
      const dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1];
      // Outward face normal projected on the plane points right of a CCW contour's direction.
      if (dy * nx - dx * ny < 0) pts.reverse();
      segs.push([pts[0], pts[1]]);
    }
  }
  return stitch(segs);
}

function stitch(segs: Array<[P2, P2]>): Loop[] {
  const q = 1e5; const key = (p: P2) => `${Math.round(p[0] * q)},${Math.round(p[1] * q)}`;
  const byStart = new Map<string, number[]>(); segs.forEach((s, i) => { const k = key(s[0]); const a = byStart.get(k); if (a) a.push(i); else byStart.set(k, [i]); });
  const used = new Uint8Array(segs.length); const loops: Loop[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1; const loop: P2[] = [segs[i][0]]; let cur = segs[i][1]; const startKey = key(segs[i][0]); let guard = 0;
    while (key(cur) !== startKey && guard++ < segs.length) {
      loop.push(cur); const next = (byStart.get(key(cur)) ?? []).find(j => !used[j]); if (next === undefined) break; used[next] = 1; cur = segs[next][1];
    }
    if (key(cur) === startKey && loop.length >= 3) loops.push(clean(loop, 1e-5));
  }
  return loops.filter(l => l.length >= 3);
}

/** Slice into layers of thickness h; each layer is cut at its mid-height. */
export function sliceMesh(meshes: MeshIn[], h: number, maxLayers = 5000): Layer[] {
  const b = meshBounds(meshes); const n = Math.min(maxLayers, Math.max(1, Math.round((b.max[2] - b.min[2]) / h)));
  return Array.from({ length: n }, (_, i) => { const z = b.min[2] + (i + 0.5) * h; return { z: b.min[2] + (i + 1) * h, loops: sliceAt(meshes, z) }; });
}

/** Slice at explicit layer tops (ascending, from z = min); each layer is cut at its mid-height. */
export function sliceAtHeights(meshes: MeshIn[], tops: number[]): Layer[] {
  let prev = meshBounds(meshes).min[2];
  return tops.map(t => { const L = { z: t, loops: sliceAt(meshes, (prev + t) / 2) }; prev = t; return L; });
}

export interface LayerPlan {
  layer: number; firstLayer?: number;
  /** Adaptive layers: thinner where the surface is shallow, thicker on vertical walls. */
  adaptive?: boolean | { min?: number; max?: number; tolerance?: number };
  nozzle?: number;
}

/**
 * Layer tops for a mesh. Uniform: the first layer, then `layer` each. Adaptive: each layer is as thick
 * as the shallowest face it spans allows, keeping the stair-step (cusp) height h·|nz| within the
 * tolerance, clamped to [min, max]; flat horizontal faces are snapped to so tops come out exact.
 */
export function layerHeights(meshes: MeshIn[], p: LayerPlan, maxLayers = 5000): number[] {
  const b = meshBounds(meshes); const z0 = b.min[2], top = b.max[2]; const H = top - z0; if (!(H > 0)) return [z0 + p.layer];
  const first = Math.min(H, p.firstLayer ?? p.layer);
  if (!p.adaptive) {
    if (first === p.layer) { const n = Math.min(maxLayers, Math.max(1, Math.round(H / p.layer))); return Array.from({ length: n }, (_, i) => z0 + (i + 1) * p.layer); }
    const n = Math.min(maxLayers - 1, Math.max(0, Math.round((H - first) / p.layer))); return [z0 + first, ...Array.from({ length: n }, (_, i) => z0 + first + (i + 1) * p.layer)];
  }
  const a = typeof p.adaptive === 'object' ? p.adaptive : {}; const nozzle = p.nozzle ?? 0.4;
  const hMin = Math.max(0.04, a.min ?? Math.max(0.05, nozzle * 0.2)), hMax = Math.max(hMin, a.max ?? Math.min(nozzle * 0.75, p.layer * 1.5)); const tol = a.tolerance ?? p.layer * 0.5;
  // Faces bucketed by 1 mm bands of height.
  const bin = 1; const nb = Math.ceil(H / bin) + 1; const bins: number[][] = Array.from({ length: nb }, () => []);
  const fz0: number[] = [], fz1: number[] = [], fnz: number[] = []; const flats: number[] = [];
  for (const m of meshes) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t] * 3, i1 = I[t + 1] * 3, i2 = I[t + 2] * 3;
      const ax = P[i1] - P[i0], ay = P[i1 + 1] - P[i0 + 1], az = P[i1 + 2] - P[i0 + 2], bx = P[i2] - P[i0], by = P[i2 + 1] - P[i0 + 1], bz = P[i2 + 2] - P[i0 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const L = Math.hypot(nx, ny, nz); if (L < 1e-12) continue;
      const anz = Math.abs(nz / L); const lo = Math.min(P[i0 + 2], P[i1 + 2], P[i2 + 2]), hi = Math.max(P[i0 + 2], P[i1 + 2], P[i2 + 2]);
      if (anz > 0.995) { flats.push(lo); continue; }
      if (anz < 0.02) continue; // vertical walls never limit the layer
      const id = fz0.length; fz0.push(lo); fz1.push(hi); fnz.push(anz);
      for (let k = Math.floor((lo - z0) / bin); k <= Math.floor((hi - z0) / bin); k++) bins[Math.max(0, Math.min(nb - 1, k))].push(id);
    }
  }
  flats.sort((x, y) => x - y);
  const tops = [z0 + first]; let z = z0 + first;
  while (z < top - 1e-6 && tops.length < maxLayers) {
    let h = hMax;
    const k0 = Math.floor((z - z0) / bin), k1 = Math.floor((z + hMax - z0) / bin); const seen = new Set<number>();
    for (let k = Math.max(0, k0); k <= Math.min(nb - 1, k1); k++) for (const id of bins[k]) {
      if (seen.has(id)) continue; seen.add(id);
      if (fz0[id] < z + h && fz1[id] > z) h = Math.min(h, tol / fnz[id]);
    }
    h = Math.max(hMin, Math.min(hMax, h));
    // Land a top exactly on a flat face inside this layer, if that keeps the layer thick enough.
    for (const f of flats) { if (f <= z + hMin * 0.999) continue; if (f >= z + h) break; h = f - z; break; }
    if (top - (z + h) < hMin * 0.5) h = top - z; // finish exactly at the top
    z += h; tops.push(+z.toFixed(5));
  }
  return tops;
}
