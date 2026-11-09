// 3D surfacing CAM for meshes: our own drop-cutter, then two finishing strategies on top of it.
//   dropCutter   the lowest tip height a ball or flat end mill can sit at above (x, y) without
//                cutting into any triangle (vertex, edge and facet contacts, solved exactly).
//   rasterJob    parallel (zig-zag) finishing: rows along X, step-over from the scallop height.
//   waterlineJob Z-level finishing: at each height, the contour where the tool just touches the part,
//                found by marching squares on the drop-cutter field and refined by bisection.
// Stock-to-leave grows the cutter, so the tool stays that far off the surface everywhere.
// Units are millimetres. The part's Z top is the top of stock unless `stockTop` is given.

import type { P2, Loop } from './geom2d';
import type { MeshIn } from './slice';
import { meshBounds } from './slice';
import type { ProcessId } from './machines';
import type { Job, Move } from './cam';

export type CutterShape = 'ball' | 'flat';
export interface Cutter { shape: CutterShape; dia: number }

/** Step-over that leaves at most `scallop` mm of cusp between passes of a ball (or bull) of radius R. */
export function stepoverForScallop(R: number, scallop: number): number {
  const h = Math.max(1e-6, Math.min(scallop, R)); return 2 * Math.sqrt(h * (2 * R - h));
}
/** Cusp height left by a ball of radius R at step-over s on a flat floor. */
export const scallopForStepover = (R: number, s: number) => R - Math.sqrt(Math.max(0, R * R - (s / 2) ** 2));

interface Tri { a: number[]; b: number[]; c: number[]; n: number[]; x0: number; x1: number; y0: number; y1: number; z1: number }

/** Triangles bucketed on an XY grid so each drop only tests nearby faces. */
export class DropField {
  readonly tris: Tri[] = []; readonly floor: number; readonly R: number; readonly shape: CutterShape; readonly leave: number;
  private cell: number; private gx0: number; private gy0: number; private gw: number; private gh: number; private buckets: number[][];
  constructor(meshes: MeshIn[], cutter: Cutter, o: { stockToLeave?: number; floor?: number } = {}) {
    this.leave = Math.max(0, o.stockToLeave ?? 0); this.shape = cutter.shape;
    // Stock-to-leave: a cutter `leave` larger, so every contact stays that far off the surface.
    this.R = cutter.dia / 2 + this.leave;
    const b = meshBounds(meshes); this.floor = o.floor ?? b.min[2];
    for (const m of meshes) {
      const P = m.positions, I = m.indices;
      for (let t = 0; t < I.length; t += 3) {
        const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]], bb = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]], c = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]];
        const u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const L = Math.hypot(n[0], n[1], n[2]); if (!L) continue;
        this.tris.push({ a, b: bb, c, n: [n[0] / L, n[1] / L, n[2] / L], x0: Math.min(a[0], bb[0], c[0]), x1: Math.max(a[0], bb[0], c[0]), y0: Math.min(a[1], bb[1], c[1]), y1: Math.max(a[1], bb[1], c[1]), z1: Math.max(a[2], bb[2], c[2]) });
      }
    }
    const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], 1);
    this.cell = Math.max(this.R, span / 64); this.gx0 = b.min[0] - this.R; this.gy0 = b.min[1] - this.R;
    this.gw = Math.max(1, Math.ceil((b.max[0] - b.min[0] + 2 * this.R) / this.cell) + 1); this.gh = Math.max(1, Math.ceil((b.max[1] - b.min[1] + 2 * this.R) / this.cell) + 1);
    this.buckets = Array.from({ length: this.gw * this.gh }, () => []);
    this.tris.forEach((t, i) => {
      const c0 = Math.max(0, Math.floor((t.x0 - this.R - this.gx0) / this.cell)), c1 = Math.min(this.gw - 1, Math.floor((t.x1 + this.R - this.gx0) / this.cell));
      const r0 = Math.max(0, Math.floor((t.y0 - this.R - this.gy0) / this.cell)), r1 = Math.min(this.gh - 1, Math.floor((t.y1 + this.R - this.gy0) / this.cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.buckets[r * this.gw + c].push(i);
    });
    // Highest triangles first: a contact can never sit above a triangle's top vertex, so the search stops early.
    for (const bk of this.buckets) bk.sort((p, q) => this.tris[q].z1 - this.tris[p].z1);
  }
  /** Tip (lowest point of the cutter) height at (x, y). Ball tips sit R - leave below the centre. */
  drop(x: number, y: number): number {
    const c = Math.floor((x - this.gx0) / this.cell), r = Math.floor((y - this.gy0) / this.cell);
    let best = -Infinity;
    if (c >= 0 && r >= 0 && c < this.gw && r < this.gh) for (const i of this.buckets[r * this.gw + c]) {
      const t = this.tris[i]; if (t.z1 <= best) break;
      if (x < t.x0 - this.R || x > t.x1 + this.R || y < t.y0 - this.R || y > t.y1 + this.R) continue;
      const z = this.ball ? ballTri(t, x, y, this.R) : flatTri(t, x, y, this.R); if (z > best) best = z;
    }
    // Ball: the drop is solved for the centre of an R (= tool + leave) sphere; the real tip is the tool radius below it.
    const tip = best + this.leave;
    return Math.max(this.floor, Number.isFinite(tip) ? tip : -Infinity);
  }
  private get ball() { return this.shape === 'ball'; }
}

function inTri(t: Tri, x: number, y: number): boolean {
  const s = (p: number[], q: number[]) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = s(t.a, t.b), d2 = s(t.b, t.c), d3 = s(t.c, t.a); const e = 1e-9;
  return (d1 >= -e && d2 >= -e && d3 >= -e) || (d1 <= e && d2 <= e && d3 <= e);
}
const planeZ = (t: Tri, x: number, y: number) => t.a[2] - (t.n[0] * (x - t.a[0]) + t.n[1] * (y - t.a[1])) / t.n[2];

/** Ball: returns the centre height minus R (a "tip" for a sphere of radius R). */
function ballTri(t: Tri, x: number, y: number, R: number): number {
  let best = -Infinity;
  // Facet: the sphere touches the plane at centre - R·n (upward normal).
  if (Math.abs(t.n[2]) > 1e-9) {
    const n = t.n[2] > 0 ? t.n : [-t.n[0], -t.n[1], -t.n[2]];
    const px = x - R * n[0], py = y - R * n[1];
    if (inTri(t, px, py)) best = planeZ(t, px, py) + R * n[2] - R;
  }
  // Vertices.
  for (const p of [t.a, t.b, t.c]) { const d2 = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d2 <= R * R) best = Math.max(best, p[2] + Math.sqrt(R * R - d2) - R); }
  // Edges: in the vertical plane of the edge the sphere is a circle of radius s about the foot point.
  for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
    const ex = q[0] - p[0], ey = q[1] - p[1]; const L = Math.hypot(ex, ey); if (L < 1e-12) continue;
    const ux = ex / L, uy = ey / L; const u0 = (x - p[0]) * ux + (y - p[1]) * uy; const d = Math.abs((x - p[0]) * uy - (y - p[1]) * ux); if (d >= R) continue;
    const s = Math.sqrt(R * R - d * d); const m = (q[2] - p[2]) / L; const k = Math.sqrt(1 + m * m);
    const uc = u0 + s * m / k; if (uc < 0 || uc > L) continue;
    best = Math.max(best, p[2] + m * u0 + s * k - R);
  }
  return best;
}

/** Flat end mill: the disc at the tip, radius R. */
function flatTri(t: Tri, x: number, y: number, R: number): number {
  let best = -Infinity;
  if (Math.abs(t.n[2]) > 1e-9) {
    const g = Math.hypot(t.n[0], t.n[1]); const sgn = t.n[2] > 0 ? 1 : -1;
    // The rim point where the plane is highest lies against the projected normal.
    const px = g > 1e-12 ? x - R * sgn * t.n[0] / g : x, py = g > 1e-12 ? y - R * sgn * t.n[1] / g : y;
    if (inTri(t, px, py)) best = planeZ(t, px, py);
  }
  for (const p of [t.a, t.b, t.c]) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 <= R * R) best = Math.max(best, p[2]);
  for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
    // Clip the edge's plan view to the disc; z is linear, so the highest point is an end of the clipped piece.
    const dx = q[0] - p[0], dy = q[1] - p[1]; const A = dx * dx + dy * dy; if (A < 1e-18) continue;
    const fx = p[0] - x, fy = p[1] - y; const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - R * R; const disc = B * B - 4 * A * C; if (disc < 0) continue;
    const sq = Math.sqrt(disc); const t0 = Math.max(0, (-B - sq) / (2 * A)), t1 = Math.min(1, (-B + sq) / (2 * A)); if (t0 > t1) continue;
    best = Math.max(best, p[2] + (q[2] - p[2]) * t0, p[2] + (q[2] - p[2]) * t1);
  }
  return best;
}

export interface SurfaceOptions {
  process?: ProcessId; cutter: Cutter;
  /** Cusp height between passes (sets the step-over for a ball); or give the step-over directly. */ scallop?: number; stepover?: number;
  /** Raster: distance between samples along a row. Waterline: grid resolution. */ resolution?: number;
  stockToLeave?: number; feed: number; plunge?: number; rpm?: number; safeZ?: number;
  /** Waterline: Z between levels (default from the scallop on a vertical wall = the step-over). */ stepDown?: number;
  /** Raster row angle: 0 = rows along X, 90 = rows along Y. */ angle?: number;
  /** Tool reach below the holder (flute + neck), mm: deeper surfaces would crash the holder. */ reach?: number;
  stockTop?: number; margin?: number;
}

function finish(o: SurfaceOptions, moves: Move[], warnings: string[], meta: Record<string, number | string>): Job {
  let x = 0, y = 0, z = 0, f = o.feed, cut = 0, rapid = 0, sec = 0; const min: P2 = [Infinity, Infinity], max: P2 = [-Infinity, -Infinity];
  for (const m of moves) {
    if (m.t !== 'rapid' && m.t !== 'feed') continue;
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z; const d = Math.hypot(nx - x, ny - y, nz - z);
    if (m.f) f = m.f; if (m.t === 'rapid') { rapid += d; sec += d / 3000 * 60; } else { cut += d; sec += d / f * 60; min[0] = Math.min(min[0], nx); min[1] = Math.min(min[1], ny); max[0] = Math.max(max[0], nx); max[1] = Math.max(max[1], ny); }
    x = nx; y = ny; z = nz;
  }
  return { process: o.process ?? 'mill3', kind: 'surface', moves, warnings, meta, stats: { cutLength: cut, rapidLength: rapid, seconds: sec }, bounds: { min, max } };
}

function reachCheck(o: SurfaceOptions, top: number, floor: number, warnings: string[]) {
  if (o.reach && top - floor > o.reach + 1e-6) warnings.push(`The part is ${(top - floor).toFixed(1)} mm deep but the tool reaches ${o.reach} mm below its holder: the holder would hit the stock. Use a longer tool or machine from two sides.`);
}

/** Drop out points that sit on the straight line between their neighbours (within tol). */
function thin(pts: number[][], tol = 0.002): number[][] {
  if (pts.length < 3) return pts; const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const ab = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = L2 ? ((b[0] - a[0]) * ab[0] + (b[1] - a[1]) * ab[1] + (b[2] - a[2]) * ab[2]) / L2 : 0;
    const d = Math.hypot(a[0] + ab[0] * t - b[0], a[1] + ab[1] * t - b[1], a[2] + ab[2] * t - b[2]);
    if (d > tol) out.push(b);
  }
  out.push(pts[pts.length - 1]); return out;
}

/** Parallel finishing: zig-zag rows, each point dropped onto the part. */
export function rasterJob(meshes: MeshIn[], o: SurfaceOptions): Job & { rows: number[][][] } {
  const warnings: string[] = []; const moves: Move[] = []; const R = o.cutter.dia / 2;
  const field = new DropField(meshes, o.cutter, { stockToLeave: o.stockToLeave });
  const b = meshBounds(meshes); const top = o.stockTop ?? b.max[2]; const safeZ = top + (o.safeZ ?? 5);
  const so = o.stepover ?? (o.cutter.shape === 'ball' ? stepoverForScallop(R, o.scallop ?? 0.01 * o.cutter.dia) : 0.5 * o.cutter.dia);
  const res = o.resolution ?? Math.min(0.25, R / 4); const margin = o.margin ?? R;
  const alongY = Math.round(o.angle ?? 0) % 180 === 90;
  const [u0, u1] = alongY ? [b.min[1] - margin, b.max[1] + margin] : [b.min[0] - margin, b.max[0] + margin];
  const [v0, v1] = alongY ? [b.min[0] - margin, b.max[0] + margin] : [b.min[1] - margin, b.max[1] + margin];
  const nRows = Math.max(1, Math.ceil((v1 - v0) / so - 1e-9)); const nSamp = Math.max(1, Math.ceil((u1 - u0) / res));
  reachCheck(o, top, field.floor, warnings);
  moves.push({ t: 'comment', text: `Parallel finish, ${o.cutter.shape} Ø${o.cutter.dia} mm, step-over ${so.toFixed(3)} mm${o.cutter.shape === 'ball' ? `, scallop ${scallopForStepover(R, so).toFixed(4)} mm` : ''}${o.stockToLeave ? `, leaving ${o.stockToLeave} mm` : ''}` });
  moves.push({ t: 'tool', n: 1, dia: o.cutter.dia }, { t: 'rapid', z: safeZ }, { t: 'on', s: o.rpm ?? 12000 });
  const rows: number[][][] = [];
  for (let k = 0; k <= nRows; k++) {
    const v = Math.min(v1, v0 + k * so); const row: number[][] = [];
    for (let i = 0; i <= nSamp; i++) { const u = u0 + (u1 - u0) * i / nSamp; const [x, y] = alongY ? [v, u] : [u, v]; row.push([x, y, field.drop(x, y)]); }
    const pts = thin(k % 2 ? row.reverse() : row); rows.push(pts);
  }
  // Zig-zag: rows link at the cut height when the step between ends is short, else lift.
  let first = true;
  for (const pts of rows) {
    const p = pts[0];
    if (first) { moves.push({ t: 'rapid', x: p[0], y: p[1] }, { t: 'rapid', z: p[2] + 2 }, { t: 'feed', z: p[2], f: o.plunge ?? o.feed / 3 }); first = false; }
    else moves.push({ t: 'feed', x: p[0], y: p[1], z: p[2], f: o.feed });
    for (const q of pts.slice(1)) moves.push({ t: 'feed', x: q[0], y: q[1], z: q[2], f: o.feed });
  }
  moves.push({ t: 'rapid', z: safeZ }, { t: 'off' });
  const job = finish(o, moves, warnings, { strategy: 'raster', stepover: +so.toFixed(4), tool: o.cutter.dia, shape: o.cutter.shape, stockToLeave: o.stockToLeave ?? 0 });
  return { ...job, rows };
}

// ---------------------------------------------------------------- waterline
/** Contours at height z of the region where the tool, with its tip at z, would cut into the part. */
export function waterlineAt(field: DropField, z: number, box: { x0: number; y0: number; x1: number; y1: number }, res: number): Loop[] {
  const nx = Math.max(2, Math.ceil((box.x1 - box.x0) / res) + 1), ny = Math.max(2, Math.ceil((box.y1 - box.y0) / res) + 1);
  const dx = (box.x1 - box.x0) / (nx - 1), dy = (box.y1 - box.y0) / (ny - 1);
  const X = (i: number) => box.x0 + i * dx, Y = (j: number) => box.y0 + j * dy;
  const h = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = field.drop(X(i), Y(j)) - z;
  // Cells on the outer rim are forced outside so every contour closes.
  const inside = (i: number, j: number) => i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && h[j * nx + i] > 0;
  // Crossing on the edge between two grid nodes, refined by bisection on the true drop.
  const memo = new Map<string, P2>();
  const cross = (i0: number, j0: number, i1: number, j1: number): P2 => {
    const key = i0 < i1 || j0 < j1 ? `${i0},${j0},${i1},${j1}` : `${i1},${j1},${i0},${j0}`; const got = memo.get(key); if (got) return got;
    let a: P2 = [X(i0), Y(j0)], b: P2 = [X(i1), Y(j1)]; if (!inside(i0, j0)) [a, b] = [b, a]; // a inside, b outside
    for (let it = 0; it < 24; it++) { const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (field.drop(m[0], m[1]) - z > 0) a = m; else b = m; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5) break; }
    const p: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; memo.set(key, p); return p;
  };
  // Marching squares: directed segments with the inside on the left, so outer contours run counter-clockwise.
  const segs: Array<[P2, P2, string, string]> = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] as const; const In = c.map(([a, b]) => inside(a, b));
    const code = (In[0] ? 1 : 0) | (In[1] ? 2 : 0) | (In[2] ? 4 : 0) | (In[3] ? 8 : 0); if (code === 0 || code === 15) continue;
    const e = [[0, 1], [1, 2], [2, 3], [3, 0]] as const; const eKey = (k: number) => { const [p, q] = e[k]; const A = c[p], B = c[q]; return A[0] < B[0] || A[1] < B[1] ? `${A[0]},${A[1]},${B[0]},${B[1]}` : `${B[0]},${B[1]},${A[0]},${A[1]}`; };
    const pt = (k: number) => { const [p, q] = e[k]; return cross(c[p][0], c[p][1], c[q][0], c[q][1]); };
    // Walking each cell's corners counter-clockwise, a contour leaves where inside turns to outside.
    const outs: number[] = [], ins: number[] = [];
    for (let k = 0; k < 4; k++) { const a = In[e[k][0]], b = In[e[k][1]]; if (a && !b) outs.push(k); else if (!a && b) ins.push(k); }
    // Pair each entry (outside→inside) with the next exit going round; saddles split the inside corners apart.
    for (const k of ins) { let m = (k + 1) % 4; while (!outs.includes(m)) m = (m + 1) % 4; segs.push([pt(m), pt(k), eKey(m), eKey(k)]); }
  }
  // Stitch by shared edge keys.
  const byStart = new Map<string, number>(); segs.forEach((s, i) => byStart.set(s[2], i));
  const used = new Uint8Array(segs.length); const loops: Loop[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; const loop: Loop = []; let k = i;
    while (k !== undefined && !used[k]) { used[k] = 1; loop.push(segs[k][0]); k = byStart.get(segs[k][3]) as number; }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Z-level finishing: contours from the top down, every wall climb-cut. */
export function waterlineJob(meshes: MeshIn[], o: SurfaceOptions): Job & { levels: Array<{ z: number; loops: Loop[] }> } {
  const warnings: string[] = []; const moves: Move[] = []; const R = o.cutter.dia / 2;
  const field = new DropField(meshes, o.cutter, { stockToLeave: o.stockToLeave });
  const b = meshBounds(meshes); const top = o.stockTop ?? b.max[2]; const safeZ = top + (o.safeZ ?? 5);
  const dz = o.stepDown ?? (o.cutter.shape === 'ball' ? stepoverForScallop(R, o.scallop ?? 0.01 * o.cutter.dia) : Math.max(0.1, o.cutter.dia * 0.1));
  const res = o.resolution ?? Math.max(0.1, R / 3); const pad = R + (o.stockToLeave ?? 0) + 2 * res;
  const box = { x0: b.min[0] - pad, y0: b.min[1] - pad, x1: b.max[0] + pad, y1: b.max[1] + pad };
  reachCheck(o, top, field.floor, warnings);
  moves.push({ t: 'comment', text: `Waterline finish, ${o.cutter.shape} Ø${o.cutter.dia} mm, ${dz.toFixed(3)} mm between levels${o.stockToLeave ? `, leaving ${o.stockToLeave} mm` : ''}` });
  moves.push({ t: 'tool', n: 1, dia: o.cutter.dia }, { t: 'rapid', z: safeZ }, { t: 'on', s: o.rpm ?? 12000 });
  const levels: Array<{ z: number; loops: Loop[] }> = [];
  const zTop = b.max[2] + (o.stockToLeave ?? 0) - 1e-3; const zBot = field.floor + 1e-3;
  for (let z = zTop - dz * 0.5; z > zBot; z -= dz) levels.push({ z, loops: waterlineAt(field, z, box, res) });
  if (levels.length === 0 || levels[levels.length - 1].z - zBot > dz * 0.25) levels.push({ z: zBot, loops: waterlineAt(field, zBot, box, res) });
  for (const L of levels) {
    for (const found of L.loops) {
      // Contours come with the part on their left; reversed, the part is on the right: climb cutting with M3.
      const l = [...found].reverse();
      moves.push({ t: 'rapid', x: l[0][0], y: l[0][1] }, { t: 'rapid', z: L.z + 2 }, { t: 'feed', z: L.z, f: o.plunge ?? o.feed / 3 });
      for (const q of l.slice(1)) moves.push({ t: 'feed', x: q[0], y: q[1], f: o.feed });
      moves.push({ t: 'feed', x: l[0][0], y: l[0][1], f: o.feed }, { t: 'rapid', z: safeZ });
    }
  }
  if (!levels.some(L => L.loops.length)) warnings.push('No waterline contours: the part is flat or smaller than the tool.');
  moves.push({ t: 'off' });
  const job = finish(o, moves, warnings, { strategy: 'waterline', stepDown: +dz.toFixed(4), tool: o.cutter.dia, shape: o.cutter.shape, stockToLeave: o.stockToLeave ?? 0, levels: levels.length });
  return { ...job, levels };
}
