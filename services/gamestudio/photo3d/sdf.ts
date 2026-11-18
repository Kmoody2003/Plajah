// Distances for a ModelDoc's parts and strokes, on the CPU. The same maths runs as WGSL in Argilla's bake
// once the Props room replays a doc on the GPU; this copy lets tests and the Node loop build the shape.
//
// Rotation: Euler XYZ degrees, world = Rz·Ry·Rx·local + center, so local = Rxᵀ·Ryᵀ·Rzᵀ·(p − center).

import type { ModelPart, SculptStroke, Vec3 } from './schema';

export type DistanceFn = (x: number, y: number, z: number) => number;

const D = Math.PI / 180;

export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
/** Smooth subtraction: cut b out of a. */
export const ssub = (a: number, b: number, k: number) => -smin(-a, b, k);

interface Compiled { p: ModelPart; cx: number; cy: number; cz: number; m: number[]; bound: number }

/** Inverse rotation (world → local) as a row-major 3×3. */
function invRot(rot: Vec3): number[] {
  const [a, b, c] = [rot[0] * D, rot[1] * D, rot[2] * D];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rz·Ry·Rx; Rᵀ rows are R's columns.
  const R = [
    cb * cc, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
    cb * sc, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca,
  ];
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}

/** Rotate a local vector into world space (for tests and for placing things along a part). */
export function rotate(rot: Vec3, v: Vec3): Vec3 {
  const m = invRot(rot); // rows of Rᵀ = columns of R
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}

function compile(p: ModelPart): Compiled {
  const r = Math.max(p.size[0], p.size[1], p.size[2]) / 2;
  let bound = r * 1.8 + (p.blend ?? 0);
  if (p.shape === 'capsule' && p.end) bound = Math.hypot(p.end[0] - p.center[0], p.end[1] - p.center[1], p.end[2] - p.center[2]) + Math.max(p.size[0], p.size[1]) + (p.blend ?? 0);
  return { p, cx: p.center[0], cy: p.center[1], cz: p.center[2], m: invRot(p.rot), bound };
}

function partDistance(c: Compiled, x: number, y: number, z: number): number {
  const p = c.p;
  if (p.shape === 'capsule') {
    const a = p.center, b = p.end ?? p.center;
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const pax = x - a[0], pay = y - a[1], paz = z - a[2];
    const l2 = bax * bax + bay * bay + baz * baz;
    const t = l2 ? Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / l2)) : 0;
    const r = p.size[0] + (p.size[1] - p.size[0]) * t;
    return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - r;
  }
  const dx = x - c.cx, dy = y - c.cy, dz = z - c.cz, m = c.m;
  const lx = m[0] * dx + m[1] * dy + m[2] * dz, ly = m[3] * dx + m[4] * dy + m[5] * dz, lz = m[6] * dx + m[7] * dy + m[8] * dz;
  const [w, h, d] = p.size;
  switch (p.shape) {
    case 'box': {
      const rr = Math.min(p.round ?? 0, w / 2, h / 2, d / 2);
      const qx = Math.abs(lx) - w / 2 + rr, qy = Math.abs(ly) - h / 2 + rr, qz = Math.abs(lz) - d / 2 + rr;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
    }
    case 'ellipsoid': {
      // Bounded approximation (Quilez): exact on the surface, good near it.
      const rx = Math.max(w / 2, 1e-4), ry = Math.max(h / 2, 1e-4), rz = Math.max(d / 2, 1e-4);
      const k0 = Math.hypot(lx / rx, ly / ry, lz / rz);
      const k1 = Math.hypot(lx / (rx * rx), ly / (ry * ry), lz / (rz * rz));
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
    }
    case 'cylinder': {
      const rr = Math.min(p.round ?? 0, w / 2, h / 2);
      const qx = Math.hypot(lx, lz / (d / w || 1)) - w / 2 + rr, qy = Math.abs(ly) - h / 2 + rr;
      return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rr;
    }
    case 'torus': {
      const tube = h / 2, ring = w / 2 - tube;
      return Math.hypot(Math.hypot(lx, lz) - ring, ly) - tube;
    }
  }
  return 1e3;
}

const mirrorOf = (p: ModelPart): ModelPart => ({
  ...p,
  center: [-p.center[0], p.center[1], p.center[2]],
  end: p.end ? [-p.end[0], p.end[1], p.end[2]] : undefined,
  rot: [p.rot[0], -p.rot[1], -p.rot[2]],
});

/**
 * Builds the doc's shape on top of a base distance (the scan's field, or "nothing" = +∞).
 * Parts apply in order (add = smooth union, carve = smooth cut), then strokes, like Argilla's bake then brushes.
 */
export function composeDistance(base: DistanceFn | null, parts: ModelPart[], strokes: SculptStroke[]): DistanceFn {
  const comp: Compiled[] = [];
  for (const p of parts) { comp.push(compile(p)); if (p.mirrorX) comp.push(compile(mirrorOf(p))); }
  const strokeList: SculptStroke[] = [];
  for (const s of strokes) { strokeList.push(s); if (s.mirrorX) strokeList.push({ ...s, points: s.points.map(q => [-q[0], q[1], q[2]] as Vec3) }); }
  return (x, y, z) => {
    let d = base ? base(x, y, z) : 1e3;
    for (const c of comp) {
      // Far from the part, its distance cannot change the result (beyond the blend): skip the exact maths.
      const far = Math.hypot(x - c.cx, y - c.cy, z - c.cz) - c.bound;
      if (c.p.op === 'add' && far > d + (c.p.blend ?? 0)) continue;
      if (c.p.op === 'carve' && far > (c.p.blend ?? 0) && d < 1e2) continue;
      const pd = partDistance(c, x, y, z);
      d = c.p.op === 'carve' ? ssub(d, pd, c.p.blend ?? 0) : smin(d, pd, c.p.blend ?? 0);
    }
    for (const s of strokeList) d = applyStroke(s, d, x, y, z);
    return d;
  };
}

/** Which part a point belongs to (nearest added part within `tol` of its surface), for colouring. */
export function partAt(parts: ModelPart[], x: number, y: number, z: number, tol: number): ModelPart | null {
  let best: ModelPart | null = null, bestD = tol;
  for (const p of parts) {
    if (p.op !== 'add') continue;
    for (const q of p.mirrorX ? [p, mirrorOf(p)] : [p]) {
      const d = Math.abs(partDistance(compile(q), x, y, z));
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  return best;
}

/** A stroke as the brushes make it: a soft falloff along the polyline, pushing the field by up to radius·strength·0.5. */
function applyStroke(s: SculptStroke, d: number, x: number, y: number, z: number): number {
  let dist = Infinity;
  for (let i = 0; i < s.points.length; i++) {
    const a = s.points[i], b = s.points[Math.min(i + 1, s.points.length - 1)];
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const l2 = bax * bax + bay * bay + baz * baz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * bax + (y - a[1]) * bay + (z - a[2]) * baz) / l2)) : 0;
    const e = Math.hypot(x - a[0] - bax * t, y - a[1] - bay * t, z - a[2] - baz * t);
    if (e < dist) dist = e;
  }
  if (dist >= s.radius) return d;
  const fall = 1 - dist / s.radius;
  const w = fall * fall * (3 - 2 * fall); // smoothstep
  const amount = s.radius * s.strength * 0.5 * w;
  switch (s.brush) {
    case 'clay': return d - amount;
    case 'carve': return d + amount;
    case 'inflate': return d - amount * 0.6;
  }
  return d;
}
