// Position-based cloth (XPBD, small steps: many substeps, one constraint pass each) on the
// triangulated pattern pieces. Every constraint is one generic form, a distance between two
// weighted points (A = mix of up to two particles, B likewise), so the CPU loop here and the WebGPU
// kernels in gpu.ts run the same data:
//   stretch/shear  mesh edges, stiffness from the fabric along that direction of the grain,
//                  softer in compression so the cloth buckles into folds instead of shrinking;
//   bend           across each interior edge (the two opposite vertices), from bending rigidity;
//   stitch         a particle on one seam edge to the matching point on the other, rest length
//                  shrinking each step so seams sew closed gradually (no explosive snap).
// Collision: the avatar's baked distance field (pushed out to the cloth thickness, with friction),
// the floor, and particle-particle self-collision through a spatial hash. Stuffed plush adds
// gas-law pressure. Units mm, g, s; forces g·mm/s² (1e-6 N), pressure g/(mm·s²) = Pa.

import type { Pt } from '../geometry';
import { type SdfGrid, type V3, sampleSdf } from './avatar';
import { type Fabric, edgeStiffness, bendStiffness } from './fabrics';
import { meshPiece } from './mesh';

export type PieceRole = 'body' | 'sleeve' | 'hood' | 'rib' | 'pocket' | 'plush' | 'other';
export interface PlacedPiece {
  id: string; name: string; pieceId: string; role: PieceRole;
  seam: Pt[]; fabric: Fabric; grainAngle: number;
  map: (p: Pt) => V3;
  /** Triangles are wound so normals face away from this point (needed for plush pressure). */
  outwardFrom?: V3;
}
export interface SeamSide { piece: string; from: Pt; to: Pt; via?: Pt }
export interface SeamSpec { name: string; a: SeamSide[]; b: SeamSide[] }

export interface ClothPiece { id: string; name: string; pieceId: string; role: PieceRole; fabric: Fabric; v0: number; vn: number; t0: number; tn: number; boundary: number[]; grainAngle: number }
export const K_STRETCH = 0, K_BEND = 1, K_STITCH = 2;

export interface ClothModel {
  n: number; pos: Float32Array; prev: Float32Array; vel: Float32Array; invMass: Float32Array; mass: Float32Array;
  rest2: Float32Array; vPiece: Int32Array; vArea: Float32Array; offset: Float32Array; friction: Float32Array; seamVert: Uint8Array;
  /** Seam vertices and their mesh neighbours: self-collision skips pairs that are both near a seam. */
  seamNear: Uint8Array;
  tris: Uint32Array; triPiece: Int32Array;
  nc: number; a0: Int32Array; a1: Int32Array; b0: Int32Array; b1: Int32Array; wa: Float32Array; wb: Float32Array; rest: Float32Array; compT: Float32Array; compC: Float32Array; kind: Uint8Array;
  colors: number[];
  pieces: ClothPiece[]; seams: Array<{ name: string; ids: number[]; lenA: number; lenB: number }>;
  spacing: number;
  pressure?: { targetVolume: number; p0: number; planned?: number };
}

const dst2 = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

interface Con { a0: number; a1: number; b0: number; b1: number; wa: number; wb: number; rest: number; compT: number; compC: number; kind: number }

/** Path along a piece boundary loop between the vertices nearest `from` and `to`. */
function seamPath(P: ClothPiece, rest2: Float32Array, s: SeamSide): number[] {
  const B = P.boundary; const near = (q: Pt) => { let bi = 0, bd = Infinity; B.forEach((v, i) => { const d = Math.hypot(rest2[2 * v] - q[0], rest2[2 * v + 1] - q[1]); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const ia = near(s.from), ib = near(s.to); const n = B.length;
  const fwd: number[] = [], bwd: number[] = [];
  for (let i = ia; ; i = (i + 1) % n) { fwd.push(B[i]); if (i === ib) break; }
  for (let i = ia; ; i = (i - 1 + n) % n) { bwd.push(B[i]); if (i === ib) break; }
  if (s.via) { const iv = B[near(s.via)]; return fwd.includes(iv) ? fwd : bwd; }
  const len = (p: number[]) => p.reduce((acc, v, k) => (k ? acc + Math.hypot(rest2[2 * v] - rest2[2 * p[k - 1]], rest2[2 * v + 1] - rest2[2 * p[k - 1] + 1]) : 0), 0);
  return len(fwd) <= len(bwd) ? fwd : bwd;
}

/** Build the cloth: mesh every placed piece, wire stretch/bend constraints, then stitch the seams. */
export function buildCloth(placed: PlacedPiece[], seams: SeamSpec[], h = 20, opts: { pressure?: { targetVolume: number; p0: number; planned?: number } } = {}): ClothModel {
  const meshes = placed.map(p => meshPiece(p.seam, h));
  const n = meshes.reduce((s, m) => s + m.verts.length, 0), nt = meshes.reduce((s, m) => s + m.tris.length, 0);
  const pos = new Float32Array(3 * n), rest2 = new Float32Array(2 * n), vPiece = new Int32Array(n), mass = new Float32Array(n), vArea = new Float32Array(n), offset = new Float32Array(n), friction = new Float32Array(n);
  const tris = new Uint32Array(3 * nt), triPiece = new Int32Array(nt); const pieces: ClothPiece[] = []; const cons: Con[] = [];
  let v0 = 0, t0 = 0;
  placed.forEach((P, pi) => {
    const m = meshes[pi]; const f = P.fabric;
    m.verts.forEach((q, i) => { const w = P.map(q); pos.set(w, 3 * (v0 + i)); rest2[2 * (v0 + i)] = q[0]; rest2[2 * (v0 + i) + 1] = q[1]; vPiece[v0 + i] = pi; offset[v0 + i] = f.thickness * 0.5 + 2; friction[v0 + i] = f.friction; });
    // Wind triangles outward if asked (majority vote against the reference point).
    let flip = false;
    if (P.outwardFrom) { let vote = 0; for (const [a, b, c] of m.tris) { const A = P.map(m.verts[a]), B = P.map(m.verts[b]), C = P.map(m.verts[c]);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]; const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const o = P.outwardFrom; vote += Math.sign(nn[0] * (A[0] - o[0]) + nn[1] * (A[1] - o[1]) + nn[2] * (A[2] - o[2])); } flip = vote < 0; }
    m.tris.forEach(([a, b, c], k) => { const t = t0 + k; tris[3 * t] = v0 + a; tris[3 * t + 1] = v0 + (flip ? c : b); tris[3 * t + 2] = v0 + (flip ? b : c); triPiece[t] = pi;
      const A2 = Math.abs((m.verts[b][0] - m.verts[a][0]) * (m.verts[c][1] - m.verts[a][1]) - (m.verts[c][0] - m.verts[a][0]) * (m.verts[b][1] - m.verts[a][1])) / 2;
      for (const v of [a, b, c]) { vArea[v0 + v] += A2 / 3; mass[v0 + v] += f.gsm * A2 * 1e-6 / 3; } });
    // Edges and their opposite vertices.
    const edges = new Map<string, { u: number; v: number; opp: number[] }>();
    for (const [a, b, c] of m.tris) for (const [u, v, o] of [[a, b, c], [b, c, a], [c, a, b]]) { const k = u < v ? `${u},${v}` : `${v},${u}`; const e = edges.get(k); if (e) e.opp.push(o); else edges.set(k, { u, v, opp: [o] }); }
    const ga = P.grainAngle; const kb = bendStiffness(f);
    for (const e of edges.values()) {
      const pu = m.verts[e.u], pv = m.verts[e.v]; const L = dst2(pu, pv); const ang = Math.atan2(pv[1] - pu[1], pv[0] - pu[0]) - ga;
      const k = edgeStiffness(f, Math.cos(ang), Math.sin(ang));
      cons.push({ a0: v0 + e.u, a1: -1, b0: v0 + e.v, b1: -1, wa: 0, wb: 0, rest: L, compT: 1 / k, compC: 1 / (k * 0.04), kind: K_STRETCH });
      if (e.opp.length === 2) { const L2 = dst2(m.verts[e.opp[0]], m.verts[e.opp[1]]); cons.push({ a0: v0 + e.opp[0], a1: -1, b0: v0 + e.opp[1], b1: -1, wa: 0, wb: 0, rest: L2, compT: 1 / kb, compC: 1 / kb, kind: K_BEND }); }
    }
    pieces.push({ id: P.id, name: P.name, pieceId: P.pieceId, role: P.role, fabric: f, v0, vn: m.verts.length, t0, tn: m.tris.length, boundary: m.boundary.map(i => v0 + i), grainAngle: ga });
    v0 += m.verts.length; t0 += m.tris.length;
  });
  // Seams: arc-length matched stitches both ways.
  const seamVert = new Uint8Array(n); const seamInfo: Array<{ name: string; c0: number; cn: number; lenA: number; lenB: number }> = [];
  const pieceBy = new Map(pieces.map(p => [p.id, p]));
  for (const S of seams) {
    const side = (ss: SeamSide[]) => { const path: number[] = []; for (const s of ss) { const P = pieceBy.get(s.piece); if (!P) return null; const p = seamPath(P, rest2, s); path.push(...(path.length && path[path.length - 1] === p[0] ? p.slice(1) : p)); } return path; };
    const A = side(S.a), B = side(S.b); if (!A || !B || A.length < 2 || B.length < 2) continue;
    const param = (p: number[]) => { const s = [0]; for (let k = 1; k < p.length; k++) { const a = p[k - 1], b = p[k]; s.push(s[k - 1] + (vPiece[a] === vPiece[b] ? Math.hypot(rest2[2 * a] - rest2[2 * b], rest2[2 * a + 1] - rest2[2 * b + 1]) : 0)); } return s; };
    const sA = param(A), sB = param(B); const LA = sA[sA.length - 1] || 1, LB = sB[sB.length - 1] || 1;
    const c0 = cons.length;
    const link = (from: number[], sF: number[], LF: number, to: number[], sT: number[], LT: number) => {
      for (let k = 0; k < from.length; k++) {
        const target = sF[k] / LF * LT; let j = 1; while (j < to.length - 1 && sT[j] < target) j++;
        const seg = sT[j] - sT[j - 1]; const t = seg > 1e-9 ? Math.max(0, Math.min(1, (target - sT[j - 1]) / seg)) : 0;
        const i = from[k], q0 = to[j - 1], q1 = to[j]; if (i === q0 || i === q1) continue;
        const px = pos[3 * q0] + (pos[3 * q1] - pos[3 * q0]) * t, py = pos[3 * q0 + 1] + (pos[3 * q1 + 1] - pos[3 * q0 + 1]) * t, pz = pos[3 * q0 + 2] + (pos[3 * q1 + 2] - pos[3 * q0 + 2]) * t;
        cons.push({ a0: i, a1: -1, b0: q0, b1: q1, wa: 0, wb: t, rest: Math.hypot(pos[3 * i] - px, pos[3 * i + 1] - py, pos[3 * i + 2] - pz), compT: 1e-9, compC: 1e-9, kind: K_STITCH });
        seamVert[i] = 1; seamVert[q0] = 1; seamVert[q1] = 1;
      }
    };
    link(A, sA, LA, B, sB, LB); link(B, sB, LB, A, sA, LA);
    seamInfo.push({ name: S.name, c0, cn: cons.length - c0, lenA: LA, lenB: LB });
  }
  // Greedy colouring: no two constraints of a colour share a particle (Gauss-Seidel on the GPU).
  let nColors = 0; const color = new Int32Array(cons.length);
  const pc = new Map<number, Set<number>>(); const parts = (c: Con) => [c.a0, c.a1, c.b0, c.b1].filter(x => x >= 0);
  // Fabric first, stitches in colours of their own solved last each substep, so seams hold against
  // the stretch of the cloth around them (the fabric takes the residual, as real seams do).
  const colourPass = (stitch: boolean, base: number) => { const pcs = new Map<number, Set<number>>();
    for (let ci = 0; ci < cons.length; ci++) { if ((cons[ci].kind === K_STITCH) !== stitch) continue;
      const ps = parts(cons[ci]); let c = base;
      for (;;) { let ok = true; for (const p of ps) if (pcs.get(p)?.has(c)) { ok = false; break; } if (ok) break; c++; }
      color[ci] = c; nColors = Math.max(nColors, c + 1); for (const p of ps) { let st = pcs.get(p); if (!st) pcs.set(p, (st = new Set())); st.add(c); } } };
  colourPass(false, 0); colourPass(true, nColors); void pc;
  const sorted = cons.map((_, i) => i).sort((i, j) => color[i] - color[j] || i - j);
  const back = new Int32Array(cons.length); sorted.forEach((ci, k) => { back[ci] = k; });
  const seamsOut = seamInfo.map(s => ({ name: s.name, lenA: s.lenA, lenB: s.lenB, ids: Array.from({ length: s.cn }, (_, k) => back[s.c0 + k]) }));
  const nc = cons.length; const a0 = new Int32Array(nc), a1 = new Int32Array(nc), b0 = new Int32Array(nc), b1 = new Int32Array(nc), wa = new Float32Array(nc), wb = new Float32Array(nc), rest = new Float32Array(nc), compT = new Float32Array(nc), compC = new Float32Array(nc), kind = new Uint8Array(nc);
  const colors: number[] = []; let last = -1;
  sorted.forEach((ci, k) => { const c = cons[ci]; if (color[ci] !== last) { colors.push(k); last = color[ci]; } a0[k] = c.a0; a1[k] = c.a1; b0[k] = c.b0; b1[k] = c.b1; wa[k] = c.wa; wb[k] = c.wb; rest[k] = c.rest; compT[k] = c.compT; compC[k] = c.compC; kind[k] = c.kind; });
  colors.push(nc); void nColors;
  const seamNear = seamVert.slice(); for (const c of cons) if (c.kind === K_STRETCH && (seamVert[c.a0] || seamVert[c.b0])) { seamNear[c.a0] = 1; seamNear[c.b0] = 1; }
  const invMass = new Float32Array(n); for (let i = 0; i < n; i++) invMass[i] = mass[i] > 0 ? 1 / mass[i] : 0;
  return { n, pos, prev: pos.slice(), vel: new Float32Array(3 * n), invMass, mass, rest2, vPiece, vArea, offset, friction, seamVert, seamNear, tris, triPiece, nc, a0, a1, b0, b1, wa, wb, rest, compT, compC, kind, colors, pieces, seams: seamsOut, spacing: h, pressure: opts.pressure };
}

export interface SimOptions { gravity: number; damping: number; sewSpeed: number; selfCollision: boolean; floor: number; substeps: number; /** Plush: hold gravity off until sewn and stuffed (seconds after the seams close). */ gravityAfterStuffing?: number; /** Plush: outward push per substep while under-filled (mm). */ inflateStep?: number }
export const DEFAULT_SIM: SimOptions = { gravity: 9810, damping: 1.2, sewSpeed: 350, selfCollision: true, floor: 0, substeps: 14 };

/** CPU cloth solver. `contact` accumulates normal collision push (mm·g) for pressure maps. */
export class ClothSim {
  t = 0; steps = 0; pressureStart = 0; lastPressure = 0; /** Plush: height when stuffed, before it is sat down. */ stuffedHeight?: number; private grad?: Float64Array; readonly contact: Float32Array; contactSteps = 0; recordContact = false;
  private hashNext: Int32Array; private hashHead: Int32Array; private g = new Float64Array(3);
  constructor(public m: ClothModel, public sdf: SdfGrid | null, public o: SimOptions = { ...DEFAULT_SIM }) {
    let maxRest = 0; for (let c = 0; c < m.nc; c++) if (m.kind[c] === K_STITCH) maxRest = Math.max(maxRest, m.rest[c]);
    this.pressureStart = maxRest / Math.max(1, o.sewSpeed) + 0.3;
    this.contact = new Float32Array(m.n); this.hashNext = new Int32Array(m.n); this.hashHead = new Int32Array(1 << Math.ceil(Math.log2(Math.max(64, m.n * 2))));
  }
  setCollider(sdf: SdfGrid | null) { this.sdf = sdf; }

  /** Advance one display frame of `dt` seconds. */
  frame(dt = 1 / 60) { const ns = this.o.substeps; for (let s = 0; s < ns; s++) this.substep(dt / ns); }

  substep(h: number) {
    const m = this.m, X = m.pos, P = m.prev, V = m.vel, W = m.invMass, n = m.n;
    const g0 = this.o.gravityAfterStuffing != null ? this.pressureStart + this.o.gravityAfterStuffing : 0;
    const ramp = this.t < g0 ? 0 : Math.min(1, 0.25 + (this.t - g0) / 0.6); const gy = -this.o.gravity * ramp;
    if (this.o.gravityAfterStuffing != null && this.stuffedHeight == null && this.t >= g0 && this.o.gravity > 0) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, X[3 * i + 1]); hi = Math.max(hi, X[3 * i + 1]); } this.stuffedHeight = hi - lo; } const damp = Math.exp(-this.o.damping * h);
    for (let i = 0; i < n; i++) { if (W[i] === 0) continue; const k = 3 * i;
      V[k + 1] += gy * h; V[k] *= damp; V[k + 1] *= damp; V[k + 2] *= damp;
      P[k] = X[k]; P[k + 1] = X[k + 1]; P[k + 2] = X[k + 2]; X[k] += V[k] * h; X[k + 1] += V[k + 1] * h; X[k + 2] += V[k + 2] * h; }
    // Sewing: stitch rest lengths shrink to zero.
    const sew = this.o.sewSpeed * h;
    for (let c = 0; c < m.nc; c++) if (m.kind[c] === K_STITCH && m.rest[c] > 0) m.rest[c] = Math.max(0, m.rest[c] - sew);
    const h2 = h * h;
    if (m.pressure) this.solveVolume(h2);
    for (let c = 0; c < m.nc; c++) solveConstraint(m, c, h2);
    this.collide();
    if (this.o.selfCollision && (this.steps & 1) === 0) this.selfCollide();
    const ih = 1 / h; for (let k = 0; k < 3 * n; k++) V[k] = (X[k] - P[k]) * ih;
    this.t += h; this.steps++; if (this.recordContact) this.contactSteps++;
  }

  private collide() {
    const m = this.m, X = m.pos, P = m.prev, n = m.n, g = this.g, G = this.sdf, fl = this.o.floor;
    for (let i = 0; i < n; i++) { if (m.invMass[i] === 0) continue; const k = 3 * i; const off = m.offset[i]; let push = 0;
      if (G) { const d = sampleSdf(G, X[k], X[k + 1], X[k + 2], g) - off;
        if (d < 0) { const l = Math.hypot(g[0], g[1], g[2]); if (l > 1e-9) { const nx = g[0] / l, ny = g[1] / l, nz = g[2] / l; X[k] -= nx * d; X[k + 1] -= ny * d; X[k + 2] -= nz * d; push = -d; this.friction(i, nx, ny, nz, -d); } } }
      if (X[k + 1] < fl + off) { const d = fl + off - X[k + 1]; X[k + 1] += d; push += d; this.friction(i, 0, 1, 0, d); }
      if (this.recordContact && push > 0) this.contact[i] += push;
      void P; }
  }
  private friction(i: number, nx: number, ny: number, nz: number, depth: number) {
    const X = this.m.pos, P = this.m.prev, k = 3 * i; const dx = X[k] - P[k], dy = X[k + 1] - P[k + 1], dz = X[k + 2] - P[k + 2];
    const dn = dx * nx + dy * ny + dz * nz; const tx = dx - dn * nx, ty = dy - dn * ny, tz = dz - dn * nz; const tl = Math.hypot(tx, ty, tz); if (tl < 1e-12) return;
    const f = Math.min(1, this.m.friction[i] * depth / tl); X[k] -= tx * f; X[k + 1] -= ty * f; X[k + 2] -= tz * f;
  }
  private selfCollide() {
    const m = this.m, X = m.pos, n = m.n, W = m.invMass; const r = Math.max(1.5, m.spacing * 0.32); const cs = 2 * r; const head = this.hashHead, next = this.hashNext; const mask = head.length - 1;
    head.fill(-1);
    const hash = (x: number, y: number, z: number) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & mask;
    for (let i = 0; i < n; i++) { const hh = hash(Math.floor(X[3 * i] / cs), Math.floor(X[3 * i + 1] / cs), Math.floor(X[3 * i + 2] / cs)); next[i] = head[hh]; head[hh] = i; }
    const near2 = (cs * 1.25) ** 2;
    for (let i = 0; i < n; i++) { const si = m.seamNear[i]; if (m.seamVert[i]) continue; const xi = X[3 * i], yi = X[3 * i + 1], zi = X[3 * i + 2]; const cx = Math.floor(xi / cs), cy = Math.floor(yi / cs), cz = Math.floor(zi / cs);
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (let j = head[hash(cx + dx, cy + dy, cz + dz)]; j >= 0; j = next[j]) {
          if (j <= i || m.seamVert[j] || (si && m.seamNear[j])) continue;
          if (m.vPiece[i] === m.vPiece[j]) { const ex = m.rest2[2 * i] - m.rest2[2 * j], ey = m.rest2[2 * i + 1] - m.rest2[2 * j + 1]; if (ex * ex + ey * ey < near2) continue; }
          const ux = X[3 * j] - xi, uy = X[3 * j + 1] - yi, uz = X[3 * j + 2] - zi; const d2 = ux * ux + uy * uy + uz * uz; if (d2 >= cs * cs || d2 < 1e-12) continue;
          const d = Math.sqrt(d2); const w = W[i] + W[j]; if (w === 0) continue; const corr = (cs - d) / d / w;
          X[3 * i] -= ux * corr * W[i]; X[3 * i + 1] -= uy * corr * W[i]; X[3 * i + 2] -= uz * corr * W[i];
          X[3 * j] += ux * corr * W[j]; X[3 * j + 1] += uy * corr * W[j]; X[3 * j + 2] += uz * corr * W[j];
        } } }
  }
  /** A little pressure while sewing keeps panels from passing through each other; full once sewn. */
  pressureRamp() { return Math.max(0, Math.min(1, (this.t - this.pressureStart) / 0.5)); }
  /** Current stuffing pressure (Pa) the gas law gives at this volume. */
  pressureNow() { return this.lastPressure; }
  /** Enclosed volume (mm³) of the outward-wound surface. */
  volume() { return meshVolume(this.m); }
  /**
   * Stuffing as one global XPBD volume constraint: C = V − V_fill, gradient = ⅓ of each vertex's
   * area vector, compliance α = ∂V/∂p (the multiplier is then the stuffing pressure, p = −λ/h²).
   * Unilateral (it only pushes out), net-force free (an open seam cannot jet the toy away), and
   * capped at 0.4 mm of movement a substep so it fills like stuffing going in, not a burst.
   */
  private solveVolume(h2: number) {
    const m = this.m, X = m.pos, T = m.tris, W = m.invMass; const pr = m.pressure!; const ramp = this.pressureRamp();
    if (ramp <= 0) { this.lastPressure = 0; return; }
    const V = meshVolume(m); const C = V - pr.targetVolume; if (C >= 0) { this.lastPressure = 0; return; }
    const g = this.grad ?? (this.grad = new Float64Array(3 * m.n)); g.fill(0);
    for (let t = 0; t < T.length; t += 3) { const a = T[t], b = T[t + 1], c = T[t + 2];
      const ux = X[3 * b] - X[3 * a], uy = X[3 * b + 1] - X[3 * a + 1], uz = X[3 * b + 2] - X[3 * a + 2], vx = X[3 * c] - X[3 * a], vy = X[3 * c + 1] - X[3 * a + 1], vz = X[3 * c + 2] - X[3 * a + 2];
      const nx = (uy * vz - uz * vy) / 6, ny = (uz * vx - ux * vz) / 6, nz = (ux * vy - uy * vx) / 6;
      for (const i of [a, b, c]) { g[3 * i] += nx; g[3 * i + 1] += ny; g[3 * i + 2] += nz; } }
    let sx = 0, sy = 0, sz = 0; for (let i = 0; i < m.n; i++) { sx += g[3 * i]; sy += g[3 * i + 1]; sz += g[3 * i + 2]; } sx /= m.n; sy /= m.n; sz /= m.n;
    let wsum = 0, gmax = 0; for (let i = 0; i < m.n; i++) { g[3 * i] -= sx; g[3 * i + 1] -= sy; g[3 * i + 2] -= sz; const l2 = g[3 * i] ** 2 + g[3 * i + 1] ** 2 + g[3 * i + 2] ** 2; wsum += W[i] * l2; gmax = Math.max(gmax, W[i] * Math.sqrt(l2)); }
    const alpha = (0.15 * pr.targetVolume / pr.p0) / Math.max(0.05, ramp) / h2;
    let lam = -C / (wsum + alpha); if (gmax * lam > 0.25) lam = 0.25 / gmax; this.lastPressure = lam / h2;
    for (let i = 0; i < m.n; i++) { const s = W[i] * lam; X[3 * i] += g[3 * i] * s; X[3 * i + 1] += g[3 * i + 1] * s; X[3 * i + 2] += g[3 * i + 2] * s; }
  }
  /** Stuffing pressure (Pa) from the mean fabric tension over the stretch edges and the toy's size. */
  stuffingPressure() {
    const m = this.m; let T = 0, k = 0; for (let c = 0; c < m.nc; c++) if (m.kind[c] === K_STRETCH) { const C = constraintValue(m, c); if (C > 0) T += C / m.compT[c] / Math.max(1, m.rest[c]) * m.rest[c]; k++; }
    // Edge force / edge spacing ≈ membrane tension (g/s² = mN/m); R from the volume.
    const tension = T / Math.max(1, k) / Math.max(1, m.spacing); const R = Math.cbrt(3 * Math.max(1, meshVolume(m)) / (4 * Math.PI));
    return 2 * tension / R;
  }
  kinetic() { const m = this.m; let e = 0; for (let i = 0; i < m.n; i++) e += 0.5 * m.mass[i] * (m.vel[3 * i] ** 2 + m.vel[3 * i + 1] ** 2 + m.vel[3 * i + 2] ** 2); return e; }
  /** Kinetic + gravitational + elastic (stretch and bend) energy, g·mm²/s². */
  energy() {
    const m = this.m, X = m.pos; let e = this.kinetic(); for (let i = 0; i < m.n; i++) e += m.mass[i] * this.o.gravity * X[3 * i + 1];
    for (let c = 0; c < m.nc; c++) { if (m.kind[c] === K_STITCH) continue; const C = constraintValue(m, c); e += 0.5 * C * C / (C > 0 ? m.compT[c] : m.compC[c]); }
    return e;
  }
  hasNaN() { for (let k = 0; k < this.m.pos.length; k++) if (!Number.isFinite(this.m.pos[k])) return true; return false; }
}

/** C = |A − B| − rest for constraint c. */
export function constraintValue(m: ClothModel, c: number) {
  const X = m.pos; const a0 = m.a0[c], a1 = m.a1[c], b0 = m.b0[c], b1 = m.b1[c]; const wa = m.wa[c], wb = m.wb[c];
  let ax = X[3 * a0] * (1 - wa), ay = X[3 * a0 + 1] * (1 - wa), az = X[3 * a0 + 2] * (1 - wa); if (a1 >= 0) { ax += X[3 * a1] * wa; ay += X[3 * a1 + 1] * wa; az += X[3 * a1 + 2] * wa; }
  let bx = X[3 * b0] * (1 - wb), by = X[3 * b0 + 1] * (1 - wb), bz = X[3 * b0 + 2] * (1 - wb); if (b1 >= 0) { bx += X[3 * b1] * wb; by += X[3 * b1 + 1] * wb; bz += X[3 * b1 + 2] * wb; }
  return Math.hypot(ax - bx, ay - by, az - bz) - m.rest[c];
}

export function solveConstraint(m: ClothModel, c: number, h2: number) {
  const X = m.pos, W = m.invMass; const a0 = m.a0[c], a1 = m.a1[c], b0 = m.b0[c], b1 = m.b1[c]; const wa = m.wa[c], wb = m.wb[c];
  const ca0 = 1 - wa, ca1 = a1 >= 0 ? wa : 0, cb0 = 1 - wb, cb1 = b1 >= 0 ? wb : 0;
  let ax = X[3 * a0] * ca0, ay = X[3 * a0 + 1] * ca0, az = X[3 * a0 + 2] * ca0; if (a1 >= 0) { ax += X[3 * a1] * ca1; ay += X[3 * a1 + 1] * ca1; az += X[3 * a1 + 2] * ca1; }
  let bx = X[3 * b0] * cb0, by = X[3 * b0 + 1] * cb0, bz = X[3 * b0 + 2] * cb0; if (b1 >= 0) { bx += X[3 * b1] * cb1; by += X[3 * b1 + 1] * cb1; bz += X[3 * b1 + 2] * cb1; }
  const dx = ax - bx, dy = ay - by, dz = az - bz; const L = Math.hypot(dx, dy, dz); if (L < 1e-9) return;
  const C = L - m.rest[c]; const alpha = (C > 0 ? m.compT[c] : m.compC[c]) / h2;
  const wsum = W[a0] * ca0 * ca0 + (a1 >= 0 ? W[a1] * ca1 * ca1 : 0) + W[b0] * cb0 * cb0 + (b1 >= 0 ? W[b1] * cb1 * cb1 : 0); if (wsum === 0) return;
  const lam = -C / (wsum + alpha); const nx = dx / L * lam, ny = dy / L * lam, nz = dz / L * lam;
  let s = W[a0] * ca0; X[3 * a0] += nx * s; X[3 * a0 + 1] += ny * s; X[3 * a0 + 2] += nz * s;
  if (a1 >= 0) { s = W[a1] * ca1; X[3 * a1] += nx * s; X[3 * a1 + 1] += ny * s; X[3 * a1 + 2] += nz * s; }
  s = -W[b0] * cb0; X[3 * b0] += nx * s; X[3 * b0 + 1] += ny * s; X[3 * b0 + 2] += nz * s;
  if (b1 >= 0) { s = -W[b1] * cb1; X[3 * b1] += nx * s; X[3 * b1 + 1] += ny * s; X[3 * b1 + 2] += nz * s; }
}

export function meshVolume(m: ClothModel) {
  const X = m.pos, T = m.tris; let v = 0;
  for (let t = 0; t < T.length; t += 3) { const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2];
    v += X[a] * (X[b + 1] * X[c + 2] - X[b + 2] * X[c + 1]) - X[a + 1] * (X[b] * X[c + 2] - X[b + 2] * X[c]) + X[a + 2] * (X[b] * X[c + 1] - X[b + 1] * X[c]); }
  return v / 6;
}

/** Largest stitch gap (mm) over a seam's stitches, or all seams. */
export function seamGap(m: ClothModel, seam?: number) {
  let worst = 0; const list = seam == null ? m.seams : [m.seams[seam]];
  for (const s of list) for (const c of s.ids) worst = Math.max(worst, constraintValue(m, c) + m.rest[c]);
  return worst;
}

/** Per-vertex normals for display. */
export function vertexNormals(m: ClothModel, out = new Float32Array(3 * m.n)) {
  out.fill(0); const X = m.pos, T = m.tris;
  for (let t = 0; t < T.length; t += 3) { const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = X[3 * b] - X[3 * a], uy = X[3 * b + 1] - X[3 * a + 1], uz = X[3 * b + 2] - X[3 * a + 2], vx = X[3 * c] - X[3 * a], vy = X[3 * c + 1] - X[3 * a + 1], vz = X[3 * c + 2] - X[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const i of [a, b, c]) { out[3 * i] += nx; out[3 * i + 1] += ny; out[3 * i + 2] += nz; } }
  for (let i = 0; i < m.n; i++) { const l = Math.hypot(out[3 * i], out[3 * i + 1], out[3 * i + 2]) || 1; out[3 * i] /= l; out[3 * i + 1] /= l; out[3 * i + 2] /= l; }
  return out;
}
