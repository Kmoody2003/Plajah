// Build Studio solids: our own constructive solid geometry on polygon soups, using binary space
// partitioning trees (each polygon's plane splits space; one solid's polygons are clipped against
// the other's tree). Written for Plajah; no outside geometry library. All loops are iterative so
// detailed shapes (text, spheres) never overflow the call stack.
//
// Conventions: millimetres, Z up, polygons convex and wound counter-clockwise seen from outside.

export type V3 = [number, number, number];
export interface Poly { v: V3[]; n: V3; w: number }
export type Solid = Poly[];

const EPS = 1e-5;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A polygon from its vertices, or null when it has no area. The plane comes from Newell's method (robust for near-collinear first vertices). */
export function poly(v: V3[]): Poly | null {
  if (v.length < 3) return null;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const len = Math.hypot(nx, ny, nz); if (len < 1e-10) return null;
  const n: V3 = [nx / len, ny / len, nz / len];
  return { v, n, w: dot(n, v[0]) };
}
const flipPoly = (p: Poly): Poly => ({ v: [...p.v].reverse(), n: [-p.n[0], -p.n[1], -p.n[2]], w: -p.w });

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
/** Sort a polygon against a plane into the four lists (coplanar ones by facing). */
function split(n: V3, w: number, p: Poly, cf: Poly[], cb: Poly[], f: Poly[], b: Poly[]) {
  let type = 0; const types: number[] = new Array(p.v.length);
  for (let i = 0; i < p.v.length; i++) { const t = dot(n, p.v[i]) - w; const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR; type |= ty; types[i] = ty; }
  if (type === COPLANAR) (dot(n, p.n) > 0 ? cf : cb).push(p);
  else if (type === FRONT) f.push(p);
  else if (type === BACK) b.push(p);
  else {
    const fv: V3[] = [], bv: V3[] = [];
    for (let i = 0; i < p.v.length; i++) {
      const j = (i + 1) % p.v.length; const ti = types[i], tj = types[j], vi = p.v[i], vj = p.v[j];
      if (ti !== BACK) fv.push(vi); if (ti !== FRONT) bv.push(vi);
      if ((ti | tj) === SPANNING) { const t = (w - dot(n, vi)) / dot(n, sub(vj, vi)); const m = lerp(vi, vj, t); fv.push(m); bv.push([m[0], m[1], m[2]]); }
    }
    if (fv.length >= 3) f.push({ v: fv, n: p.n, w: p.w });
    if (bv.length >= 3) b.push({ v: bv, n: p.n, w: p.w });
  }
}

class Node {
  n: V3 | null = null; w = 0; front: Node | null = null; back: Node | null = null; polys: Poly[] = [];
  constructor(polys?: Poly[]) { if (polys) this.build(polys); }
  nodes(): Node[] { const out: Node[] = []; const st: Node[] = [this]; while (st.length) { const x = st.pop()!; out.push(x); if (x.front) st.push(x.front); if (x.back) st.push(x.back); } return out; }
  invert() { for (const x of this.nodes()) { x.polys = x.polys.map(flipPoly); if (x.n) { x.n = [-x.n[0], -x.n[1], -x.n[2]]; x.w = -x.w; } const t = x.front; x.front = x.back; x.back = t; } }
  /** Remove the parts of `polys` that lie inside this tree's solid. */
  clip(polys: Poly[]): Poly[] {
    const out: Poly[] = []; const st: Array<[Node, Poly[]]> = [[this, polys]];
    while (st.length) {
      const [x, ps] = st.pop()!; if (!x.n) { out.push(...ps); continue; }
      const f: Poly[] = [], b: Poly[] = [];
      for (const p of ps) split(x.n, x.w, p, f, b, f, b);
      if (x.front) st.push([x.front, f]); else out.push(...f);
      if (x.back) st.push([x.back, b]);
    }
    return out;
  }
  clipTo(t: Node) { for (const x of this.nodes()) x.polys = t.clip(x.polys); }
  all(): Poly[] { return this.nodes().flatMap(x => x.polys); }
  build(polys: Poly[]) {
    const st: Array<[Node, Poly[]]> = [[this, polys]];
    while (st.length) {
      const [x, ps] = st.pop()!; if (!ps.length) continue;
      if (!x.n) { x.n = ps[0].n; x.w = ps[0].w; }
      const f: Poly[] = [], b: Poly[] = [];
      for (const p of ps) split(x.n, x.w, p, x.polys, x.polys, f, b);
      if (f.length) st.push([x.front ??= new Node(), f]);
      if (b.length) st.push([x.back ??= new Node(), b]);
    }
  }
}

export function union(a: Solid, b: Solid): Solid {
  if (!a.length) return b; if (!b.length) return a;
  const A = new Node(a), B = new Node(b);
  A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert(); A.build(B.all()); return A.all();
}
export function subtract(a: Solid, b: Solid): Solid {
  if (!a.length || !b.length) return a;
  const A = new Node(a), B = new Node(b);
  A.invert(); A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert(); A.build(B.all()); A.invert(); return A.all();
}
export function intersect(a: Solid, b: Solid): Solid {
  if (!a.length || !b.length) return [];
  const A = new Node(a), B = new Node(b);
  A.invert(); B.clipTo(A); B.invert(); A.clipTo(B); B.clipTo(A); A.build(B.all()); A.invert(); return A.all();
}

/** Bounding boxes overlap (with a small margin): skip the tree work when they cannot touch. */
export function boundsOf(s: Solid): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of s) for (const v of p.v) for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
  return { min, max };
}
export const overlaps = (a: Solid, b: Solid) => { const A = boundsOf(a), B = boundsOf(b); for (let k = 0; k < 3; k++) if (A.max[k] < B.min[k] - 1e-6 || B.max[k] < A.min[k] - 1e-6) return false; return true; };

/** Enclosed volume (mm³) by the divergence theorem; exact for closed solids. */
export function volume(s: Solid): number {
  let v = 0;
  for (const p of s) for (let i = 1; i + 1 < p.v.length; i++) v += dot(p.v[0], cross(p.v[i], p.v[i + 1])) / 6;
  return v;
}

/** Fan-triangulated, indexed mesh (vertices not shared, so flat shading and STL stay exact). */
export function toMesh(s: Solid): { positions: Float32Array; indices: Uint32Array } {
  let tris = 0; for (const p of s) tris += p.v.length - 2;
  const positions = new Float32Array(tris * 9), indices = new Uint32Array(tris * 3); let k = 0;
  for (const p of s) for (let i = 1; i + 1 < p.v.length; i++) for (const v of [p.v[0], p.v[i], p.v[i + 1]]) { positions[k * 3] = v[0]; positions[k * 3 + 1] = v[1]; positions[k * 3 + 2] = v[2]; indices[k] = k; k++; }
  return { positions, indices };
}

/** Apply a 4x4 column-major matrix (three.js layout) to every vertex. Mirroring matrices flip the winding back. */
export function transform(s: Solid, m: ArrayLike<number>): Solid {
  const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
  const out: Solid = [];
  for (const p of s) {
    let v = p.v.map(([x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]] as V3);
    if (det < 0) v = v.reverse();
    const q = poly(v); if (q) out.push(q);
  }
  return out;
}
