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
