// Parametric body forms for the 3D fit room. A dress-form style body is built from measurements
// (our own size chart, or a maker's own numbers) as a smooth union of signed-distance primitives:
// an elliptical torso lofted through girth rings, round cones for limbs and neck, an ellipsoid head.
// The same field is baked to a grid for cloth collision (CPU and GPU sample the same array) and
// meshed with surface nets for display, so what you see is what the cloth hits. Our own mesh
// generation: no scanned or third-party human meshes.
// Units: millimetres, y up, the body faces +z, feet on y = 0.

import { SIZE_CHART, CHILD_SIZES } from '../patterns';

export type Band = 'adult' | 'child';
export interface BodyMeasures {
  band: Band;
  height: number; chest: number; waist: number; hip: number;
  /** Shoulder point to shoulder point, across the back. */
  shoulder: number;
  neck: number; head: number;
  /** Shoulder point to wrist. */
  arm: number; inseam: number;
  /** Shape beyond the girths: the same chest can sit on very different bodies. */
  shape?: BodyShape;
}
export interface BodyShape {
  /** Longer (+) or shorter (−) torso than the chart, mm; the legs take up the difference so height stays. */
  torso?: number;
  /** Extra forward depth at the bust, mm. */
  bust?: number;
  /** Forward depth at the waist and below the bust (a rounder belly), mm. */
  belly?: number;
  /** Backward depth at the seat, mm. */
  seat?: number;
  /** Shoulder slope from the neck, degrees (about 20 typical; square ≈ 12, sloping ≈ 28). */
  shoulderSlope?: number;
}

/** Body heights (cm) for our size chart; adult sizes are not height-graded in the chart itself. */
const HEIGHT: Record<string, number> = { '2T': 92, '4': 104, '6': 116, '8': 128, '10': 140, '12': 150, '14': 160, XS: 160, S: 166, M: 172, L: 176, XL: 180, '2XL': 182, '3XL': 184 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Body measurements for a size on our chart (mm). */
export function measuresForSize(size: string): BodyMeasures {
  const row = SIZE_CHART[size] ?? SIZE_CHART.M; const child = CHILD_SIZES.includes(size);
  const H = (HEIGHT[size] ?? 172) * 10; const chest = row[0] * 10; const t = clamp01((H - 900) / 800);
  const plus = Math.max(0, chest - 1000) / 1000; // fuller sizes carry more at the waist
  return {
    band: child ? 'child' : 'adult', height: H, chest,
    waist: chest * (child ? 0.93 : 0.82 + plus * 0.35), hip: chest * (child ? 1.03 : 1.03 + plus * 0.05),
    shoulder: row[2] * 10 * 0.9, neck: chest * (child ? 0.45 : 0.38),
    head: child ? 480 + (H - 920) * 0.08 : 565 + (H - 1700) * 0.05,
    arm: row[5] * 10 * 0.95, inseam: H * lerp(0.4, 0.455, t),
  };
}

export type PoseName = 'a-pose' | 't-pose' | 'sitting' | 'walk' | 'custom';
type Side = [number, number];
export interface Pose { name: PoseName; frame?: number; shoulderAbd: Side; shoulderFlex: Side; elbow: Side; hipFlex: Side; hipAbd: Side; knee: Side }
export const WALK_FRAMES = 8;

/** Joint angles in degrees, [left (+x), right (−x)]. */
/** Joint ranges (degrees) a body can reach; poses are clamped to them. */
export const JOINT_LIMITS: Record<Exclude<keyof Pose, 'name' | 'frame'>, [number, number]> = {
  shoulderAbd: [-10, 175], shoulderFlex: [-50, 170], elbow: [0, 145], hipFlex: [-25, 120], hipAbd: [-15, 45], knee: [0, 140],
};
export function limitPose(p: Pose): Pose {
  const out = { ...p } as Pose; for (const k of Object.keys(JOINT_LIMITS) as Array<keyof typeof JOINT_LIMITS>) { const [lo, hi] = JOINT_LIMITS[k]; out[k] = [Math.max(lo, Math.min(hi, p[k][0])), Math.max(lo, Math.min(hi, p[k][1]))]; }
  return out;
}
export function poseFor(name: PoseName, frame = 0): Pose {
  if (name === 't-pose') return { name, shoulderAbd: [88, 88], shoulderFlex: [0, 0], elbow: [0, 0], hipFlex: [0, 0], hipAbd: [3, 3], knee: [0, 0] };
  if (name === 'sitting') return { name, shoulderAbd: [25, 25], shoulderFlex: [25, 25], elbow: [35, 35], hipFlex: [88, 88], hipAbd: [6, 6], knee: [88, 88] };
  if (name === 'walk') {
    const ph = (frame % WALK_FRAMES) / WALK_FRAMES * Math.PI * 2; const s = Math.sin(ph);
    const kneeL = Math.max(0, Math.sin(ph + Math.PI * 0.6)) * 45, kneeR = Math.max(0, Math.sin(ph + Math.PI * 1.6)) * 45;
    return { name, frame, shoulderAbd: [12, 12], shoulderFlex: [-22 * s, 22 * s], elbow: [15 + 10 * Math.max(0, -s), 15 + 10 * Math.max(0, s)], hipFlex: [25 * s, -25 * s], hipAbd: [2, 2], knee: [kneeL, kneeR] };
  }
  return { name: 'a-pose', shoulderAbd: [42, 42], shoulderFlex: [0, 0], elbow: [8, 8], hipFlex: [0, 0], hipAbd: [4, 4], knee: [0, 0] };
}

export type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export type Prim =
  | { t: 'cone'; a: V3; b: V3; ra: number; rb: number; k: number; part: string }
  | { t: 'ell'; c: V3; r: V3; k: number; part: string }
  | { t: 'box'; c: V3; h: V3; r: number; k: number; part: string }
  | { t: 'torso'; k: number; part: string };

export interface TorsoRing { y: number; a: number; b: number; cz: number }
export interface Limb { root: V3; mid: V3; end: V3; tip: V3; dir: V3; r: number }
export interface Body {
  m: BodyMeasures; pose: Pose; rings: TorsoRing[]; prims: Prim[];
  y: { crotch: number; hip: number; waist: number; chest: number; armpit: number; shoulder: number; neckBase: number; chin: number; top: number; knee: number; ankle: number };
  arms: [Limb, Limb]; legs: [Limb, Limb];
  head: { c: V3; r: V3 }; neckR: number;
}

/** Perimeter of an ellipse with half-axes a, b (Ramanujan II). */
export const ellPerim = (a: number, b: number) => { const h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h))); };
const ring = (y: number, girth: number, k: number, cz = 0): TorsoRing => { const a = girth / ellPerim(1, k); return { y, a, b: a * k, cz }; };

/** Turn a limb from hanging straight down by abduction (out to the side) and flexion (forward). */
function limbDir(side: number, abd: number, flex: number): V3 {
  const a = abd * Math.PI / 180, f = flex * Math.PI / 180; const d0: V3 = [side * Math.sin(a), -Math.cos(a), 0];
  return norm([d0[0], d0[1] * Math.cos(f), -d0[1] * Math.sin(f)]);
}
/** Bend a direction towards `toward` (projected perpendicular) by `deg`. */
function bend(d: V3, toward: V3, deg: number): V3 {
  let p = sub(toward, mul(d, dot(toward, d))); if (Math.hypot(...p) < 1e-6) p = sub([0, 1, 0], mul(d, d[1]));
  p = norm(p); const r = deg * Math.PI / 180; return norm(add(mul(d, Math.cos(r)), mul(p, Math.sin(r))));
}

export function buildBody(m: BodyMeasures, pose0: Pose = poseFor('a-pose')): Body {
  const pose = limitPose(pose0); const sh = m.shape ?? {}; const H = m.height; const t = clamp01((H - 900) / 800); const hf = lerp(0.2, 0.13, t);
  const top = H, chin = H * (1 - hf), neckBase = chin - H * 0.045, shoulderY = neckBase - H * 0.022, crotch = m.inseam - (sh.torso ?? 0);
  const T = shoulderY - crotch; const at = (f: number) => crotch + T * f;
  const y = { crotch, hip: at(0.18), waist: at(0.43), chest: at(0.72), armpit: at(0.8), shoulder: shoulderY, neckBase, chin, top, knee: crotch * 0.52, ankle: crotch * 0.07 };
  const sw = m.shoulder / 2;
  const fwd = (r: TorsoRing, d = 0): TorsoRing => ({ ...r, b: r.b + Math.abs(d) / 2, cz: r.cz + d / 2 });
  const bust = sh.bust ?? 0, belly = sh.belly ?? 0, seat = sh.seat ?? 0;
  const rings: TorsoRing[] = [
    fwd(ring(at(-0.02), m.hip * 0.8, 0.7), -seat * 0.6), fwd(ring(y.hip, m.hip, 0.72, -6), -seat), fwd(ring(y.waist, m.waist, 0.74), belly), fwd(ring(at(0.58), lerp(m.waist, m.chest, 0.65), 0.72, 4), belly * 0.5 + bust * 0.35),
    fwd(ring(y.chest, m.chest, 0.68, 6), bust), fwd(ring(y.armpit, m.chest * 0.95, 0.62, 2), bust * 0.4),
    { y: at(0.92), a: sw * 0.84, b: sw * 0.84 * 0.42, cz: -6 }, { y: at(1.0), a: sw * 0.62, b: sw * 0.62 * 0.5, cz: -10 },
  ];
  const prims: Prim[] = [{ t: 'torso', k: 1, part: 'torso' }];
  const rU = m.chest * 0.3 / (2 * Math.PI), rE = m.chest * 0.235 / (2 * Math.PI), rW = m.chest * 0.165 / (2 * Math.PI);
  const handL = H * 0.105, upperL = m.arm * 0.54, foreL = m.arm * 0.46;
  const arms = [1, -1].map((s, i) => {
    const drop = Math.tan(((sh.shoulderSlope ?? 20) - 20) * Math.PI / 180) * sw * 0.6; const root: V3 = [s * (sw - rU * 0.85), shoulderY - rU * 0.95 - drop, -8];
    const d = limbDir(s, pose.shoulderAbd[i], pose.shoulderFlex[i]); const elbow = add(root, mul(d, upperL));
    const d2 = bend(d, [0, 0.4, 1], pose.elbow[i]); const wrist = add(elbow, mul(d2, foreL)); const tip = add(wrist, mul(d2, handL));
    prims.push({ t: 'cone', a: root, b: elbow, ra: rU * 1.05, rb: rE, k: 22, part: 'arm' }, { t: 'cone', a: elbow, b: wrist, ra: rE * 1.05, rb: rW, k: 10, part: 'arm' },
      { t: 'cone', a: wrist, b: tip, ra: rW * 1.05, rb: rW * 0.62, k: 8, part: 'hand' });
    return { root, mid: elbow, end: wrist, tip, dir: d, r: rU } as Limb;
  }) as [Limb, Limb];
  const rT = m.hip * 0.58 / (2 * Math.PI), rK = m.hip * 0.37 / (2 * Math.PI), rA = m.hip * 0.22 / (2 * Math.PI);
  const hipA = rings[1].a;
  const thighL = (crotch + rT * 0.2) * 0.5, shinL = (crotch + rT * 0.2) * 0.43, footL = H * 0.15;
  const legs = [1, -1].map((s, i) => {
    const root: V3 = [s * hipA * 0.47, crotch + rT * 0.2, -4];
    const d = limbDir(s, pose.hipAbd[i], pose.hipFlex[i]); const knee = add(root, mul(d, thighL));
    const d2 = bend(d, [0, 0, -1], pose.knee[i]); const ankle = add(knee, mul(d2, shinL));
    const fwd = norm([d2[0] * 0.1, 0, 1]); const heel = add(ankle, add(mul(fwd, -rA * 1.2), mul(d2, rA * 0.9))); const toe = add(heel, add(mul(fwd, footL), [0, rA * 0.2, 0]));
    prims.push({ t: 'cone', a: root, b: knee, ra: rT, rb: rK, k: 30, part: 'leg' }, { t: 'cone', a: knee, b: ankle, ra: rK * 1.02, rb: rA, k: 12, part: 'leg' },
      { t: 'cone', a: heel, b: toe, ra: rA * 1.05, rb: rA * 0.7, k: 14, part: 'foot' });
    return { root, mid: knee, end: ankle, tip: toe, dir: d, r: rT } as Limb;
  }) as [Limb, Limb];
  const neckR = m.neck / (2 * Math.PI); const hh = top - chin;
  const head = { c: [0, chin + hh * 0.52, 8] as V3, r: [m.head / (2 * Math.PI) * 0.88, hh * 0.56, m.head / (2 * Math.PI) * 1.08] as V3 };
  prims.push({ t: 'cone', a: [0, shoulderY - H * 0.02, -12], b: [0, chin + hh * 0.18, -4], ra: neckR * 1.15, rb: neckR, k: 26, part: 'neck' }, { t: 'ell', c: head.c, r: head.r, k: 18, part: 'head' });
  if (pose.name === 'sitting') prims.push({ t: 'box', c: [0, crotch - rT * 1.1 - 40, 120], h: [hipA * 1.6, 40, 260], r: 10, k: 0, part: 'seat' });
  return { m, pose, rings, prims, y, arms, legs, head, neckR };
}

/** Torso ellipse at height y (interpolated between girth rings). */
export function torsoAt(b: Body, y: number): TorsoRing {
  const R = b.rings; if (y <= R[0].y) return R[0]; if (y >= R[R.length - 1].y) return R[R.length - 1];
  let i = 0; while (i < R.length - 2 && R[i + 1].y < y) i++;
  const a = R[i], c = R[i + 1]; let u = (y - a.y) / (c.y - a.y); u = u * u * (3 - 2 * u);
  return { y, a: lerp(a.a, c.a, u), b: lerp(a.b, c.b, u), cz: lerp(a.cz, c.cz, u) };
}

const smin = (a: number, b: number, k: number) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };

function sdTorso(b: Body, x: number, y: number, z: number) {
  const R = b.rings; const y0 = R[0].y, y1 = R[R.length - 1].y; const r = torsoAt(b, Math.max(y0, Math.min(y1, y)));
  const zz = z - r.cz; const k = Math.hypot(x / r.a, zz / r.b); const rad = Math.hypot(x, zz);
  const dxz = k < 1e-6 ? -Math.min(r.a, r.b) : (k - 1) * rad / k; const dy = Math.max(y0 - y, y - y1);
  return Math.hypot(Math.max(dxz, 0), Math.max(dy, 0)) + Math.min(Math.max(dxz, dy), 0);
}
function sdRoundCone(px: number, py: number, pz: number, a: V3, bb: V3, r1: number, r2: number) {
  const bax = bb[0] - a[0], bay = bb[1] - a[1], baz = bb[2] - a[2]; const l2 = bax * bax + bay * bay + baz * baz; const rr = r1 - r2; const a2 = l2 - rr * rr; const il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2]; const yy = pax * bax + pay * bay + paz * baz; const zz = yy - l2;
  const xx = pax * l2 - bax * yy, xy = pay * l2 - bay * yy, xz = paz * l2 - baz * yy; const x2 = xx * xx + xy * xy + xz * xz; const y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}
function sdEll(px: number, py: number, pz: number, c: V3, r: V3) {
  const x = px - c[0], y = py - c[1], z = pz - c[2]; const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]); const k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
}
function sdBox(px: number, py: number, pz: number, c: V3, h: V3, r: number) {
  const qx = Math.abs(px - c[0]) - h[0] + r, qy = Math.abs(py - c[1]) - h[1] + r, qz = Math.abs(pz - c[2]) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
export function sdPrim(b: Body, p: Prim, x: number, y: number, z: number) {
  switch (p.t) { case 'torso': return sdTorso(b, x, y, z); case 'cone': return sdRoundCone(x, y, z, p.a, p.b, p.ra, p.rb); case 'ell': return sdEll(x, y, z, p.c, p.r); case 'box': return sdBox(x, y, z, p.c, p.h, p.r); }
}
/** Exact (unbaked) signed distance to the body, mm; negative inside. */
export function sdBody(b: Body, x: number, y: number, z: number) {
  let d = 1e9; for (const p of b.prims) d = smin(d, sdPrim(b, p, x, y, z), p.k); return d;
}
function primBox(b: Body, p: Prim): [V3, V3] {
  if (p.t === 'torso') { const ax = Math.max(...b.rings.map(r => r.a)), bz = Math.max(...b.rings.map(r => r.b + Math.abs(r.cz))); return [[-ax, b.rings[0].y, -bz], [ax, b.rings[b.rings.length - 1].y, bz]]; }
  if (p.t === 'cone') { const r = Math.max(p.ra, p.rb); return [[Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.min(p.a[2], p.b[2]) - r], [Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r, Math.max(p.a[2], p.b[2]) + r]]; }
  if (p.t === 'ell') return [sub(p.c, p.r), add(p.c, p.r)];
  return [sub(p.c, p.h), add(p.c, p.h)];
}

export interface SdfGrid { origin: V3; cell: number; nx: number; ny: number; nz: number; data: Float32Array; far: number }

/** Bake the body's distance field to a grid (cell ≈ height/170, clamped 4-10 mm). */
export function bakeSdf(b: Body, cell = Math.max(4, Math.min(10, b.m.height / 170)), margin = 60): SdfGrid {
  const boxes = b.prims.map(p => primBox(b, p)); const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const [l, h] of boxes) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], l[a]); hi[a] = Math.max(hi[a], h[a]); }
  const pad = margin + cell * 2; const origin: V3 = [lo[0] - pad, Math.max(-pad, lo[1] - pad), lo[2] - pad];
  const nx = Math.ceil((hi[0] + pad - origin[0]) / cell) + 1, ny = Math.ceil((hi[1] + pad - origin[1]) / cell) + 1, nz = Math.ceil((hi[2] + pad - origin[2]) / cell) + 1;
  const data = new Float32Array(nx * ny * nz).fill(margin);
  b.prims.forEach((p, pi) => {
    const [l, h] = boxes[pi]; const e = margin + p.k;
    const i0 = Math.max(0, Math.floor((l[0] - e - origin[0]) / cell)), i1 = Math.min(nx - 1, Math.ceil((h[0] + e - origin[0]) / cell));
    const j0 = Math.max(0, Math.floor((l[1] - e - origin[1]) / cell)), j1 = Math.min(ny - 1, Math.ceil((h[1] + e - origin[1]) / cell));
    const k0 = Math.max(0, Math.floor((l[2] - e - origin[2]) / cell)), k1 = Math.min(nz - 1, Math.ceil((h[2] + e - origin[2]) / cell));
    for (let k = k0; k <= k1; k++) { const z = origin[2] + k * cell;
      for (let j = j0; j <= j1; j++) { const yy = origin[1] + j * cell; const row = (k * ny + j) * nx;
        for (let i = i0; i <= i1; i++) { const d = sdPrim(b, p, origin[0] + i * cell, yy, z); const o = row + i; data[o] = smin(data[o], Math.min(d, margin), p.k); } } }
  });
  return { origin, cell, nx, ny, nz, data, far: margin };
}

/** Trilinear sample of the baked field; writes the (unnormalised) gradient into g when given. */
export function sampleSdf(G: SdfGrid, x: number, y: number, z: number, g?: Float64Array | number[]): number {
  const fx = (x - G.origin[0]) / G.cell, fy = (y - G.origin[1]) / G.cell, fz = (z - G.origin[2]) / G.cell;
  if (fx < 0 || fy < 0 || fz < 0 || fx >= G.nx - 1 || fy >= G.ny - 1 || fz >= G.nz - 1) { if (g) { g[0] = 0; g[1] = 0; g[2] = 0; } return G.far; }
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz); const u = fx - i, v = fy - j, w = fz - k;
  const nx = G.nx, sx = 1, sy = nx, sz = nx * G.ny; const o = i + j * sy + k * sz; const D = G.data;
  const c000 = D[o], c100 = D[o + sx], c010 = D[o + sy], c110 = D[o + sx + sy], c001 = D[o + sz], c101 = D[o + sx + sz], c011 = D[o + sy + sz], c111 = D[o + sx + sy + sz];
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u, x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  if (g) {
    const dx0 = (c100 - c000) + ((c110 - c010) - (c100 - c000)) * v, dx1 = (c101 - c001) + ((c111 - c011) - (c101 - c001)) * v;
    g[0] = (dx0 + (dx1 - dx0) * w) / G.cell; g[1] = ((x10 - x00) + ((x11 - x01) - (x10 - x00)) * w) / G.cell; g[2] = (y1 - y0) / G.cell;
  }
  return y0 + (y1 - y0) * w;
}

export interface TriMesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array }

/** Naive surface nets over the baked field: one vertex per surface cell, quads across sign changes. */
export function surfaceNets(G: SdfGrid): TriMesh {
  const { nx, ny, nz, data: D, origin, cell } = G; const idx = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [], nor: number[] = []; const g = [0, 0, 0];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = D[(i + (c & 1)) + (j + ((c >> 1) & 1)) * nx + (k + (c >> 2)) * nx * ny]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) { const va = cv[a], vb = cv[b]; if ((va < 0) === (vb < 0)) continue; const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += (a >> 2) + ((b >> 2) - (a >> 2)) * t; n++; }
    const px = origin[0] + (i + sx / n) * cell, py = origin[1] + (j + sy / n) * cell, pz = origin[2] + (k + sz / n) * cell;
    idx[i + j * nx + k * nx * ny] = pos.length / 3; pos.push(px, py, pz);
    sampleSdf(G, px, py, pz, g); const l = Math.hypot(g[0], g[1], g[2]) || 1; nor.push(g[0] / l, g[1] / l, g[2] / l);
  }
  const tri: number[] = []; const C = (i: number, j: number, k: number) => idx[i + j * nx + k * nx * ny];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tri.push(a, c, b, a, d, c); else tri.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = D[i + j * nx + k * nx * ny] < 0;
    if (v0 !== (D[i + 1 + j * nx + k * nx * ny] < 0)) quad(C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k), !v0);
    if (v0 !== (D[i + (j + 1) * nx + k * nx * ny] < 0)) quad(C(i - 1, j, k - 1), C(i - 1, j, k), C(i, j, k), C(i, j, k - 1), !v0);
    if (v0 !== (D[i + j * nx + (k + 1) * nx * ny] < 0)) quad(C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k), !v0);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(tri) };
}

/**
 * A child's body by age (2-14), from approximate growth-chart medians for height, with girths
 * interpolated along our size chart by height. Approximate: measure the child for a real fit.
 */
const AGE_HEIGHT_CM: Array<[number, number]> = [[2, 87], [3, 96], [4, 103], [5, 110], [6, 116], [7, 122], [8, 128], [9, 133], [10, 138], [11, 144], [12, 150], [13, 156], [14, 162]];
export function measuresForAge(age: number): BodyMeasures {
  const a = Math.max(2, Math.min(14, age)); let i = 0; while (i < AGE_HEIGHT_CM.length - 2 && AGE_HEIGHT_CM[i + 1][0] < a) i++;
  const [a0, h0] = AGE_HEIGHT_CM[i], [a1, h1] = AGE_HEIGHT_CM[i + 1]; const H = (h0 + (h1 - h0) * (a - a0) / (a1 - a0)) * 10;
  const rows = CHILD_SIZES.map(sz => ({ sz, m: measuresForSize(sz) })); let j = 0; while (j < rows.length - 2 && rows[j + 1].m.height < H) j++;
  const A = rows[j].m, B = rows[j + 1].m; const t = Math.max(0, Math.min(1.2, (H - A.height) / (B.height - A.height)));
  const mix = (k: 'chest' | 'waist' | 'hip' | 'shoulder' | 'neck' | 'head' | 'arm') => A[k] + (B[k] - A[k]) * t;
  return { band: 'child', height: H, chest: mix('chest'), waist: mix('waist'), hip: mix('hip'), shoulder: mix('shoulder'), neck: mix('neck'), head: mix('head'), arm: mix('arm'), inseam: H * lerp(0.4, 0.455, clamp01((H - 900) / 800)) };
}

/** Body measurements from text a person pastes or exports: "chest: 96 cm", CSV "hip,102" or JSON; inches when marked. */
export function parseMeasurements(text: string): Partial<BodyMeasures> & { shape?: BodyShape } {
  const keys: Record<string, keyof BodyMeasures | keyof BodyShape> = { height: 'height', stature: 'height', chest: 'chest', bust: 'chest', waist: 'waist', hip: 'hip', hips: 'hip', seat: 'hip', shoulder: 'shoulder', 'shoulder width': 'shoulder', neck: 'neck', head: 'head', arm: 'arm', sleeve: 'arm', 'arm length': 'arm', inseam: 'inseam', 'inside leg': 'inseam',
    'torso adjust': 'torso', 'bust depth': 'bust', belly: 'belly', 'seat depth': 'seat', 'shoulder slope': 'shoulderSlope' };
  const out: Partial<BodyMeasures> & { shape?: BodyShape } = {}; let entries: Array<[string, string]> = [];
  try { const j = JSON.parse(text); if (j && typeof j === 'object') entries = Object.entries(j).map(([k, v]) => [k, String(v)]); } catch { entries = text.split(/[\r\n;]+/).map(l => l.split(/[:,=\t]/)).filter(p => p.length >= 2).map(p => [p[0], p.slice(1).join(' ')]); }
  for (const [k0, v0] of entries) {
    const k = k0.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s*\((cm|mm|in|inch|inches)\)\s*/, ''); const key = keys[k]; if (!key) continue;
    const m = v0.trim().match(/^(-?[\d.]+)\s*(cm|mm|in|inch|inches|"|″|°|deg)?/i); if (!m) continue; const x = Number(m[1]); const u = (m[2] ?? (/(in|inch)/i.test(k0) ? 'in' : /mm/i.test(k0) ? 'mm' : '')).toLowerCase();
    if (key === 'shoulderSlope') { (out.shape ??= {}).shoulderSlope = x; continue; }
    const mm = u === 'mm' ? x : /^(in|inch|inches|"|″)$/.test(u) ? x * 25.4 : x * 10;
    if (key === 'torso' || key === 'bust' || key === 'belly' || key === 'seat') { const sk = key as 'torso'; (out.shape ??= {})[sk] = key === 'bust' && !/depth/.test(k) ? undefined : mm; continue; }
    (out as Record<string, number>)[key] = mm;
  }
  return out;
}

/**
 * Smoother skin for display: Laplacian smoothing of the surface-nets vertices, each pass projected
 * back onto the body's distance field so the shape (and what the cloth hits) does not shrink.
 */
export function smoothMesh(mesh: TriMesh, G: SdfGrid, passes = 3): TriMesh {
  const P = Float32Array.from(mesh.positions), I = mesh.indices, n = P.length / 3; const adj: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; adj[a].push(b); adj[b].push(a); }
  const g = [0, 0, 0]; const Q = new Float32Array(P.length);
  for (let it = 0; it < passes; it++) {
    for (let i = 0; i < n; i++) { const nb = adj[i]; if (!nb.length) { Q[3 * i] = P[3 * i]; Q[3 * i + 1] = P[3 * i + 1]; Q[3 * i + 2] = P[3 * i + 2]; continue; } let x = 0, y = 0, z = 0; for (const j of nb) { x += P[3 * j]; y += P[3 * j + 1]; z += P[3 * j + 2]; } Q[3 * i] = (P[3 * i] + x / nb.length) / 2; Q[3 * i + 1] = (P[3 * i + 1] + y / nb.length) / 2; Q[3 * i + 2] = (P[3 * i + 2] + z / nb.length) / 2; }
    for (let i = 0; i < n; i++) { const d = sampleSdf(G, Q[3 * i], Q[3 * i + 1], Q[3 * i + 2], g); const l = Math.hypot(g[0], g[1], g[2]) || 1; P[3 * i] = Q[3 * i] - g[0] / l * d; P[3 * i + 1] = Q[3 * i + 1] - g[1] / l * d; P[3 * i + 2] = Q[3 * i + 2] - g[2] / l * d; }
  }
  const N = new Float32Array(P.length); for (let i = 0; i < n; i++) { sampleSdf(G, P[3 * i], P[3 * i + 1], P[3 * i + 2], g); const l = Math.hypot(g[0], g[1], g[2]) || 1; N[3 * i] = g[0] / l; N[3 * i + 1] = g[1] / l; N[3 * i + 2] = g[2] / l; }
  return { positions: P, normals: N, indices: I };
}
