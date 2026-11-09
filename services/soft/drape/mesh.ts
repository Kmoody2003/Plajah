// Cloth meshes from flat pattern pieces: the seam line is resampled at the mesh spacing (keeping
// corners exactly, so seam landmarks land on vertices), the inside is filled with a triangular
// lattice, and the lot is Delaunay-triangulated (Bowyer-Watson, our own) with triangles outside the
// outline dropped. The boundary loop keeps the outline order for seams and flattening.

import { type Pt, area, dist, bbox } from '../geometry';

export interface PieceMesh { verts: Pt[]; tris: Array<[number, number, number]>; boundary: number[] }

export function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1e-12; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
export const polyDist = (p: Pt, poly: Pt[]) => { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length])); return d; };

/** Resample a closed ring at about `h` spacing, always keeping corners sharper than `cornerDeg`. */
export function resampleRing(ring: Pt[], h: number, cornerDeg = 28): Pt[] {
  const n = ring.length; const corner: boolean[] = ring.map((p, i) => {
    const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]; const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
    const c = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI > cornerDeg;
  });
  let start = corner.indexOf(true); if (start < 0) start = 0;
  // Split into runs between corners; resample each run evenly by arc length.
  const out: Pt[] = []; let i = start;
  do {
    const run: Pt[] = [ring[i]]; let j = (i + 1) % n; while (!corner[j] && j !== start) { run.push(ring[j]); j = (j + 1) % n; } run.push(ring[j]);
    const L = run.reduce((s, q, k) => (k ? s + dist(run[k - 1], q) : 0), 0); const segs = Math.max(1, Math.round(L / h));
    out.push(run[0]);
    let acc = 0, k = 1;
    for (let s = 1; s < segs; s++) { const target = L * s / segs; while (k < run.length - 1 && acc + dist(run[k - 1], run[k]) < target) { acc += dist(run[k - 1], run[k]); k++; }
      const d = dist(run[k - 1], run[k]) || 1e-9; const t = (target - acc) / d; out.push([run[k - 1][0] + (run[k][0] - run[k - 1][0]) * t, run[k - 1][1] + (run[k][1] - run[k - 1][1]) * t]); }
    i = j;
  } while (i !== start);
  // Corners closer than a third of the spacing (a clamped flat base, a notch) would make sliver
  // triangles with almost no mass: keep the first of each cluster.
  const keep: Pt[] = []; for (const q of out) if (!keep.length || dist(keep[keep.length - 1], q) > h * 0.33) keep.push(q);
  while (keep.length > 3 && dist(keep[0], keep[keep.length - 1]) <= h * 0.33) keep.pop();
  return keep;
}

/** Bowyer-Watson Delaunay triangulation of a point set. */
export function delaunay(pts: Pt[]): Array<[number, number, number]> {
  const b = bbox(pts); const M = Math.max(b.w, b.h) * 20 + 10; const cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
  const P: Pt[] = [...pts, [cx - M, cy - M], [cx + M, cy - M], [cx, cy + M]]; const n = pts.length;
  type T = { a: number; b: number; c: number; x: number; y: number; r2: number };
  const circ = (a: number, bb: number, c: number): T => {
    const A = P[a], B = P[bb], C = P[c]; const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1])) || 1e-12;
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    const x = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, y = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
    return { a, b: bb, c, x, y, r2: (A[0] - x) ** 2 + (A[1] - y) ** 2 };
  };
  let tris: T[] = [circ(n, n + 1, n + 2)];
  const order = pts.map((_, i) => i).sort((i, j) => pts[i][0] - pts[j][0] || pts[i][1] - pts[j][1]);
  for (const i of order) {
    const p = P[i]; const bad: T[] = [], keep: T[] = [];
    for (const t of tris) ((p[0] - t.x) ** 2 + (p[1] - t.y) ** 2 < t.r2 * (1 + 1e-12) ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = u < v ? `${u},${v}` : `${v},${u}`; if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]); }
    for (const [u, v] of edges.values()) keep.push(circ(u, v, i));
    tris = keep;
  }
  return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => (area([P[t.a], P[t.b], P[t.c]]) > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]) as [number, number, number]);
}

/** Triangulate a CCW seam ring at mesh spacing h. */
export function meshPiece(seam: Pt[], h: number): PieceMesh {
  const ring = resampleRing(seam, h * 0.75);
  const verts: Pt[] = [...ring]; const b = bbox(seam); const dy = h * Math.sqrt(3) / 2;
  for (let r = 0, y = b.y0 + dy / 2; y < b.y1; y += dy, r++) for (let x = b.x0 + (r % 2 ? h / 2 : 0); x < b.x1; x += h) {
    const p: Pt = [x, y]; if (pointInPoly(p, seam) && polyDist(p, seam) > h * 0.45) verts.push(p);
  }
  const all = delaunay(verts);
  const tris = all.filter(([a, c, d]) => {
    const A = verts[a], B = verts[c], C = verts[d]; const m: Pt = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    if (!pointInPoly(m, seam)) return false;
    for (const [p, q] of [[A, B], [B, C], [C, A]]) { const mid: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; if (!pointInPoly(mid, seam) && polyDist(mid, seam) > h * 0.05) return false; }
    return area([A, B, C]) > h * h * 1e-4;
  });
  // A sharp convex corner can lose all its triangles: close it with the ear to its ring neighbours.
  const used = new Uint8Array(verts.length); for (const t of tris) for (const v of t) used[v] = 1;
  for (let i = 0; i < ring.length; i++) if (!used[i]) { const a = (i - 1 + ring.length) % ring.length, c = (i + 1) % ring.length;
    if (area([verts[a], verts[i], verts[c]]) > 0) { tris.push([a, i, c]); used[i] = used[a] = used[c] = 1; } }
  // Drop vertices no triangle uses (and keep the boundary order of those that remain).
  const remap = new Int32Array(verts.length).fill(-1); const vv: Pt[] = [];
  verts.forEach((p, i) => { if (used[i]) { remap[i] = vv.length; vv.push(p); } });
  return { verts: vv, tris: tris.map(t => t.map(v => remap[v]) as [number, number, number]), boundary: ring.map((_, i) => remap[i]).filter(i => i >= 0) };
}
