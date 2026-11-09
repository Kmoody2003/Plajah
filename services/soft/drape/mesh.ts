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

/** Mesh spacing as a function of position on the flat piece (mm); adaptive meshes refine where it is small. */
export type Sizing = (p: Pt) => number;

/** Resample a closed ring at the local spacing (constant `h` or a sizing field), always keeping corners sharper than `cornerDeg`. */
export function resampleRing(ring: Pt[], h: number, cornerDeg = 28, sizing?: Sizing): Pt[] {
  const n = ring.length; const corner: boolean[] = ring.map((p, i) => {
    const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n]; const u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]];
    const c = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1])) || 1); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI > cornerDeg;
  });
  const hs = (p: Pt) => (sizing ? Math.min(h, sizing(p)) : h);
  let start = corner.indexOf(true); if (start < 0) start = 0;
  const out: Pt[] = []; let i = start;
  do {
    const run: Pt[] = [ring[i]]; let j = (i + 1) % n; while (!corner[j] && j !== start) { run.push(ring[j]); j = (j + 1) % n; } run.push(ring[j]);
    // Cumulative "number of segments" along the run: ∫ ds / h(s).
    const cs = [0], cl = [0]; for (let k = 1; k < run.length; k++) { const d = dist(run[k - 1], run[k]); const mid: Pt = [(run[k - 1][0] + run[k][0]) / 2, (run[k - 1][1] + run[k][1]) / 2]; cl.push(cl[k - 1] + d); cs.push(cs[k - 1] + d / Math.max(0.5, hs(mid))); }
    const segs = Math.max(1, Math.round(cs[cs.length - 1])); out.push(run[0]);
    let k = 1;
    for (let sgi = 1; sgi < segs; sgi++) { const target = cs[cs.length - 1] * sgi / segs; while (k < run.length - 1 && cs[k] < target) k++;
      const t = (target - cs[k - 1]) / ((cs[k] - cs[k - 1]) || 1e-9); out.push([run[k - 1][0] + (run[k][0] - run[k - 1][0]) * t, run[k - 1][1] + (run[k][1] - run[k - 1][1]) * t]); }
    i = j;
  } while (i !== start);
  // Corners closer than a third of the spacing (a clamped flat base, a notch) would make sliver
  // triangles with almost no mass: keep the first of each cluster.
  const keep: Pt[] = []; for (const q of out) if (!keep.length || dist(keep[keep.length - 1], q) > hs(q) * 0.33) keep.push(q);
  while (keep.length > 3 && dist(keep[0], keep[keep.length - 1]) <= hs(keep[0]) * 0.33) keep.pop();
  return keep;
}

/**
 * Bowyer-Watson Delaunay triangulation (our own). Triangles are bucketed on a grid by their
 * circumcircle's bounding box, so each insertion only tests triangles near the new point:
 * near-linear for the 10⁴-point adaptive meshes.
 */
export function delaunay(pts: Pt[]): Array<[number, number, number]> {
  const b = bbox(pts); const M = Math.max(b.w, b.h) * 20 + 10; const cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
  const P: Pt[] = [...pts, [cx - M, cy - M], [cx + M, cy - M], [cx, cy + M]]; const n = pts.length;
  const cell = Math.max(1e-6, Math.sqrt((b.w * b.h || 1) / Math.max(1, n)) * 2); const gx = Math.max(1, Math.ceil(b.w / cell) + 1), gy = Math.max(1, Math.ceil(b.h / cell) + 1);
  const grid: Array<T[]> = Array.from({ length: gx * gy }, () => []); const large: T[] = [];
  type T = { a: number; b: number; c: number; x: number; y: number; r2: number; dead: boolean };
  const add = (t: T) => {
    const r = Math.sqrt(t.r2); const i0 = Math.floor((t.x - r - b.x0) / cell), i1 = Math.floor((t.x + r - b.x0) / cell), j0 = Math.floor((t.y - r - b.y0) / cell), j1 = Math.floor((t.y + r - b.y0) / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) { large.push(t); return; }
    for (let j = Math.max(0, j0); j <= Math.min(gy - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(gx - 1, i1); i++) grid[j * gx + i].push(t);
  };
  const circ = (a: number, bb: number, c: number): T => {
    const A = P[a], B = P[bb], C = P[c]; const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1])) || 1e-12;
    const a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
    const x = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, y = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
    return { a, b: bb, c, x, y, r2: (A[0] - x) ** 2 + (A[1] - y) ** 2, dead: false };
  };
  const all: T[] = []; const t0 = circ(n, n + 1, n + 2); all.push(t0); add(t0);
  // Insert along rows in a serpentine order so neighbouring inserts touch neighbouring triangles.
  const order = pts.map((_, i) => i).sort((i, j) => { const ri = Math.floor((pts[i][1] - b.y0) / cell), rj = Math.floor((pts[j][1] - b.y0) / cell); return ri - rj || (ri % 2 ? pts[j][0] - pts[i][0] : pts[i][0] - pts[j][0]); });
  for (const i of order) {
    const p = P[i]; const ci = Math.min(gx - 1, Math.max(0, Math.floor((p[0] - b.x0) / cell))), cj = Math.min(gy - 1, Math.max(0, Math.floor((p[1] - b.y0) / cell)));
    const bucket = grid[cj * gx + ci]; const seen = new Set<T>(); const bad: T[] = [];
    for (const list of [bucket, large]) for (const t of list) { if (t.dead || seen.has(t)) continue; seen.add(t); if ((p[0] - t.x) ** 2 + (p[1] - t.y) ** 2 < t.r2 * (1 + 1e-12)) bad.push(t); }
    const edges = new Map<string, [number, number]>();
    for (const t of bad) { t.dead = true; for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = u < v ? `${u},${v}` : `${v},${u}`; if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]); } }
    for (const [u, v] of edges.values()) { const t = circ(u, v, i); all.push(t); add(t); }
    // Lazy clean-up keeps buckets short.
    if (bucket.length > 48) { let w = 0; for (const t of bucket) if (!t.dead) bucket[w++] = t; bucket.length = w; }
    if (large.length > 64) { let w = 0; for (const t of large) if (!t.dead) large[w++] = t; large.length = w; }
  }
  return all.filter(t => !t.dead && t.a < n && t.b < n && t.c < n).map(t => (area([P[t.a], P[t.b], P[t.c]]) > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]) as [number, number, number]);
}

/** Triangulate a CCW seam ring at spacing h, or adaptively where `sizing` asks for finer spacing (never coarser than h). */
export function meshPiece(seam: Pt[], h: number, sizing?: Sizing): PieceMesh {
  const hs = (p: Pt) => (sizing ? Math.max(1.5, Math.min(h, sizing(p))) : h);
  const ring = resampleRing(seam, h * 0.75, 28, sizing ? (p => hs(p) * 0.75) : undefined);
  const verts: Pt[] = [...ring]; const b = bbox(seam);
  if (!sizing) {
    const dy = h * Math.sqrt(3) / 2;
    for (let r = 0, y = b.y0 + dy / 2; y < b.y1; y += dy, r++) for (let x = b.x0 + (r % 2 ? h / 2 : 0); x < b.x1; x += h) {
      const p: Pt = [x, y]; if (pointInPoly(p, seam) && polyDist(p, seam) > h * 0.45) verts.push(p);
    }
  } else {
    // Candidates on a lattice at the finest spacing; accept greedily (finest regions first) when no
    // accepted point is closer than the local spacing.
    let hmin = h; const probe = 24; for (let j = 0; j <= probe; j++) for (let i = 0; i <= probe; i++) hmin = Math.min(hmin, hs([b.x0 + b.w * i / probe, b.y0 + b.h * j / probe]));
    const step = Math.max(1.5, hmin * 0.9); const dy = step * Math.sqrt(3) / 2; const cand: Array<[Pt, number]> = [];
    for (let r = 0, y = b.y0 + dy / 2; y < b.y1; y += dy, r++) for (let x = b.x0 + (r % 2 ? step / 2 : 0); x < b.x1; x += step) { const p: Pt = [x, y]; const s = hs(p); if (pointInPoly(p, seam) && polyDist(p, seam) > s * 0.45) cand.push([p, s]); }
    cand.sort((u, v) => u[1] - v[1]);
    const cell = step * 2; const grid = new Map<number, Pt[]>(); const key = (x: number, y: number) => Math.floor((x - b.x0) / cell) * 100003 + Math.floor((y - b.y0) / cell);
    for (const q of ring) { const k = key(q[0], q[1]); const l = grid.get(k); if (l) l.push(q); else grid.set(k, [q]); }
    for (const [p, s] of cand) {
      const rr = s * 0.86; const reach = Math.ceil(rr / cell); const ci = Math.floor((p[0] - b.x0) / cell), cj = Math.floor((p[1] - b.y0) / cell); let ok = true;
      for (let dj = -reach; dj <= reach && ok; dj++) for (let di = -reach; di <= reach && ok; di++) for (const q of grid.get((ci + di) * 100003 + cj + dj) ?? []) if (dist(p, q) < rr) { ok = false; break; }
      if (ok) { verts.push(p); const k = key(p[0], p[1]); const l = grid.get(k); if (l) l.push(p); else grid.set(k, [p]); }
    }
  }
  const all = delaunay(verts);
  const tris = all.filter(([a, c, d]) => {
    const A = verts[a], B = verts[c], C = verts[d]; const m: Pt = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    if (!pointInPoly(m, seam)) return false; const hl = hs(m);
    for (const [p, q] of [[A, B], [B, C], [C, A]]) { const mid: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; if (!pointInPoly(mid, seam) && polyDist(mid, seam) > hl * 0.05) return false; }
    return area([A, B, C]) > hl * hl * 1e-4;
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
