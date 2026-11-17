/** Plain 2D geometry helpers for the sim. Coordinates are world metres: x east, z south (as in the game). */
export type P2 = [number, number];

export const dist = (a: P2, b: P2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polyLen(pts: P2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** cumulative arc length at each vertex */
export function cumLen(pts: P2[]): number[] {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

export interface Sample { x: number; z: number; dx: number; dz: number }

/** position and unit direction at arc length s along a polyline with precomputed cumulative lengths (binary search) */
export function sampleAt(pts: P2[], cum: number[], s: number, out: Sample = { x: 0, z: 0, dx: 1, dz: 0 }): Sample {
  const n = pts.length;
  if (n < 2) { out.x = pts[0]?.[0] ?? 0; out.z = pts[0]?.[1] ?? 0; return out; }
  const total = cum[n - 1];
  s = s < 0 ? 0 : s > total ? total : s;
  let lo = 0, hi = n - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
  const a = pts[lo], b = pts[lo + 1], l = cum[lo + 1] - cum[lo] || 1, t = (s - cum[lo]) / l;
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
  out.dx = (b[0] - a[0]) / l; out.dz = (b[1] - a[1]) / l;
  return out;
}

/** nearest point on a polyline: arc length, distance and the point */
export function project(pts: P2[], cum: number[], x: number, z: number): { s: number; d: number; x: number; z: number } {
  let best = { s: 0, d: Infinity, x: pts[0][0], z: pts[0][1] };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < best.d) best = { s: cum[i] + Math.sqrt(l2) * t, d, x: px, z: pz };
  }
  return best;
}

/** proper segment/segment intersection: returns parameters along each segment, or null */
export function segIntersect(a: P2, b: P2, c: P2, d: P2): { t: number; u: number } | null {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qz = c[1] - a[1];
  const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

export function pointInPoly(poly: P2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function polyArea(poly: P2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a) / 2;
}

export function centroid(pts: P2[]): P2 {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

/** distance from a point to a polygon's outline (0 when inside) */
export function distToPoly(poly: P2[], x: number, z: number): number {
  if (pointInPoly(poly, x, z)) return 0;
  const cum = cumLen([...poly, poly[0]]);
  return project([...poly, poly[0]], cum, x, z).d;
}

/** a uniform hash grid of items by cell, for neighbour queries */
export class Grid<T> {
  private cells = new Map<number, T[]>();
  constructor(readonly cell: number) {}
  private key(cx: number, cz: number): number { return (cx + 4096) * 8192 + (cz + 4096); }
  add(x: number, z: number, v: T): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.cells.get(k); if (!a) { a = []; this.cells.set(k, a); } a.push(v);
  }
  /** every item in the cells touching the box */
  query(x0: number, z0: number, x1: number, z1: number, fn: (v: T) => void): void {
    const c = this.cell;
    for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++) for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
      const a = this.cells.get(this.key(cx, cz)); if (a) for (const v of a) fn(v);
    }
  }
}

/** a small seeded generator so tests are repeatable */
export function rng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** a binary min-heap keyed by number */
export class Heap<T> {
  private k: number[] = []; private v: T[] = [];
  get size(): number { return this.k.length; }
  push(key: number, val: T): void {
    let i = this.k.length; this.k.push(key); this.v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; }
    this.k[i] = key; this.v[i] = val;
  }
  pop(): { key: number; val: T } | null {
    const n = this.k.length; if (!n) return null;
    const rk = this.k[0], rv = this.v[0], lk = this.k.pop()!, lv = this.v.pop()!;
    if (n > 1) {
      let i = 0; const m = n - 1;
      for (;;) { let c = 2 * i + 1; if (c >= m) break; if (c + 1 < m && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= lk) break; this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c; }
      this.k[i] = lk; this.v[i] = lv;
    }
    return { key: rk, val: rv };
  }
}
