// kaijuFaceConform — pure geometry for the face-decal rig (no three.js, no DOM; unit-tested).
//
// A decal is a small grid whose vertices are PROJECTED onto the head mesh so it hugs the curved mask / muzzle:
//   1. the anchor is a point in HEAD-LOCAL front projection (x right, y up, +z forward) — we cast a ray along −z to find
//      the surface point and (from four neighbouring hits) a smooth surface normal;
//   2. a tangent frame (ex, ey) is built on that normal, rolled by `rot`;
//   3. every grid vertex is cast along −normal onto the mesh and pushed out by `lift` along the local surface normal.
// Triangles are a flat Float32Array (9 floats per triangle, head-local, bind pose).

export type V3 = [number, number, number];
export interface Hit { t: number; p: V3; n: V3 }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const madd = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Closest (smallest t ≥ 0) ray hit among the triangles. Double-sided; the returned normal faces the ray origin. */
export function castRay(tris: Float32Array, o: V3, d: V3, tMax = Infinity): Hit | null {
  let best = tMax, bi = -1;
  const n = tris.length / 9;
  for (let i = 0; i < n; i++) {
    const k = i * 9;
    const e1x = tris[k + 3] - tris[k], e1y = tris[k + 4] - tris[k + 1], e1z = tris[k + 5] - tris[k + 2];
    const e2x = tris[k + 6] - tris[k], e2y = tris[k + 7] - tris[k + 1], e2z = tris[k + 8] - tris[k + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = o[0] - tris[k], ty = o[1] - tris[k + 1], tz = o[2] - tris[k + 2];
    const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t >= 0 && t < best) { best = t; bi = i; }
  }
  if (bi < 0) return null;
  const k = bi * 9;
  let nn = norm(cross([tris[k + 3] - tris[k], tris[k + 4] - tris[k + 1], tris[k + 5] - tris[k + 2]], [tris[k + 6] - tris[k], tris[k + 7] - tris[k + 1], tris[k + 8] - tris[k + 2]]));
  if (dot(nn, d) > 0) nn = [-nn[0], -nn[1], -nn[2]];
  return { t: best, p: madd(o, d, best), n: nn };
}

/** Keep only triangles whose xy bounding box touches the given head-local rectangle (a cheap pre-filter for many rays). */
export function trisNear(tris: Float32Array, cx: number, cy: number, r: number): Float32Array {
  const keep: number[] = [];
  const n = tris.length / 9;
  for (let i = 0; i < n; i++) {
    const k = i * 9;
    const x0 = Math.min(tris[k], tris[k + 3], tris[k + 6]), x1 = Math.max(tris[k], tris[k + 3], tris[k + 6]);
    const y0 = Math.min(tris[k + 1], tris[k + 4], tris[k + 7]), y1 = Math.max(tris[k + 1], tris[k + 4], tris[k + 7]);
    if (x1 < cx - r || x0 > cx + r || y1 < cy - r || y0 > cy + r) continue;
    for (let j = 0; j < 9; j++) keep.push(tris[k + j]);
  }
  return new Float32Array(keep);
}

/** One decal's placement in head-local space. */
export interface DecalAnchor {
  /** head-local front projection of the centre (metres) */
  x: number; y: number;
  /** side length of the (square) atlas cell on the surface, metres */
  s: number;
  /** roll about the surface normal, radians (CCW seen from the front) */
  rot: number;
  /** vertical aspect (height = s * aspect); 1 = square cell */
  aspect?: number;
}

export interface SurfaceFrame { p: V3; n: V3; ex: V3; ey: V3 }

/** The surface point + smooth normal + tangent frame under a front-projected anchor. Null if the ray misses the mesh. */
export function surfaceFrame(tris: Float32Array, a: Pick<DecalAnchor, 'x' | 'y' | 'rot'>, probe = 0.012): SurfaceFrame | null {
  const near = trisNear(tris, a.x, a.y, probe * 3);
  const h = (x: number, y: number) => castRay(near, [x, y, 2], [0, 0, -1]);
  const c = h(a.x, a.y); if (!c) return null;
  const L = h(a.x - probe, a.y) ?? c, R = h(a.x + probe, a.y) ?? c, D = h(a.x, a.y - probe) ?? c, U = h(a.x, a.y + probe) ?? c;
  const tx = sub(R.p, L.p), ty = sub(U.p, D.p);
  let n = norm(cross(tx, ty));
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  // tangent frame: ex ≈ +x, ey = n × ex, then roll by rot about n
  let ex = norm(sub(tx, [n[0] * dot(tx, n), n[1] * dot(tx, n), n[2] * dot(tx, n)]));
  if (!isFinite(ex[0]) || (ex[0] === 0 && ex[1] === 0 && ex[2] === 0)) ex = [1, 0, 0];
  let ey = norm(cross(n, ex));
  const cr = Math.cos(a.rot), sr = Math.sin(a.rot);
  const ex2 = norm([ex[0] * cr + ey[0] * sr, ex[1] * cr + ey[1] * sr, ex[2] * cr + ey[2] * sr]);
  const ey2 = norm(cross(n, ex2));
  return { p: c.p, n, ex: ex2, ey: ey2 };
}

export interface ConformedGrid { positions: Float32Array; uvs: Float32Array; indices: Uint16Array; normals: Float32Array; frame: SurfaceFrame; misses: number }

/** Build the decal grid (nx×ny quads) conformed to the mesh. Falls back to the tangent plane where a ray misses. */
export function conformGrid(tris: Float32Array, a: DecalAnchor, nx: number, ny: number, lift = 0.0022, reach = 0.05): ConformedGrid | null {
  const fr = surfaceFrame(tris, a); if (!fr) return null;
  const w = a.s, hgt = a.s * (a.aspect ?? 1);
  const near = trisNear(tris, a.x, a.y, Math.max(w, hgt) * 1.1 + 0.02);
  const vx = nx + 1, vy = ny + 1;
  const positions = new Float32Array(vx * vy * 3), uvs = new Float32Array(vx * vy * 2), normals = new Float32Array(vx * vy * 3);
  let misses = 0;
  const back: V3 = [-fr.n[0], -fr.n[1], -fr.n[2]];
  for (let j = 0; j < vy; j++) for (let i = 0; i < vx; i++) {
    const u = i / nx, v = j / ny;
    const q = madd(madd(fr.p, fr.ex, (u - 0.5) * w), fr.ey, (v - 0.5) * hgt);
    const hit = castRay(near, madd(q, fr.n, reach), back, reach * 2);
    let p: V3, nn: V3;
    if (hit) { nn = hit.n; if (dot(nn, fr.n) < 0.2) nn = fr.n; p = madd(hit.p, nn, lift); }
    else { misses++; p = madd(q, fr.n, lift); nn = fr.n; }
    const o = j * vx + i;
    positions.set(p, o * 3); normals.set(nn, o * 3); uvs[o * 2] = u; uvs[o * 2 + 1] = v;
  }
  const indices = new Uint16Array(nx * ny * 6);
  let k = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a0 = j * vx + i, b = a0 + 1, c = a0 + vx, d = c + 1;
    indices[k++] = a0; indices[k++] = b; indices[k++] = c; indices[k++] = b; indices[k++] = d; indices[k++] = c;
  }
  return { positions, uvs, indices, normals, frame: fr, misses };
}

// ------------------------------------------------------------------------------------------------ cell transform
/** Sample position inside a cell for a given decal-space point — mirrors the fragment shader so it can be unit-tested. */
export function cellSample(uv: [number, number], t: { sx: number; sy: number; shiftX: number; shiftY: number; tilt: number; mirror: boolean }): [number, number] | null {
  let px = uv[0] - 0.5 - t.shiftX, py = uv[1] - 0.5 - t.shiftY;
  const c = Math.cos(-t.tilt), s = Math.sin(-t.tilt);
  const rx = px * c - py * s, ry = px * s + py * c;
  let gx = rx / Math.max(1e-3, t.sx), gy = ry / Math.max(1e-3, t.sy);
  if (t.mirror) gx = -gx;
  const cu = gx + 0.5, cv = gy + 0.5;
  if (cu < 0 || cu > 1 || cv < 0 || cv > 1) return null;
  return [cu, cv];
}
