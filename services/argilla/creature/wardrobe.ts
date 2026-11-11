/**
 * wardrobe.ts — clothes and armour as real geometry, cut from parametric period patterns and fitted to the body by
 * offsetting from its field (docs/character-forge.md §3).
 *
 * First kit: Haru's tosei-gusoku (Momoyama "modern" armour, docs/era-clash-3d-era-accuracy.md: accurate, H), worn
 * over kosode and hakama:
 * - dō: rows of scalloped kozane plates on the torso's convex section, with kebiki silk lacing (odoshi), instanced;
 * - kusazuri: seven tassets, each a column of five lames on a spring chain;
 * - sode: the shoulder guards, seven lames each on a spring chain;
 * - kote (sleeves of cloth with iron splints and a hand plate), haidate (thigh apron of small plates), suneate
 *   (shin splints and knee guard);
 * - kabuto: a ribbed bowl, visor, turnbacks and a five-lame shikoro;
 * - cloth: kosode (with the sleeve hem on spring chains), hakama (ballooning legs gathered into the greaves, hem
 *   bulge on spring chains), obi, tabi and waraji.
 *
 * Rigid pieces carry one bone per vertex (plates never bend). Cloth is skinned from the body and fitted to it.
 * Every piece carries an era tag and the museum objects it is drawn from.
 */

import type { Vec3 } from '../engine';
import type { HumanAnatomy, HumanJoint } from './human';

// ---- Mesh building ------------------------------------------------------------------------------------------------

export class MeshBuilder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; idx: number[] = []; bone: string[] = [];
  get count() { return this.pos.length / 3; }
  vert(p: Vec3, n: Vec3, u: number, v: number, bone: string) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(u, v); this.bone.push(bone);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  append(o: MeshBuilder) {
    const base = this.count;
    this.pos.push(...o.pos); this.nor.push(...o.nor); this.uv.push(...o.uv); this.bone.push(...o.bone);
    for (const i of o.idx) this.idx.push(i + base);
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth01 = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/** While a kit is being built, sheets turn to face away from this body (the field's gradient points out of it). */
let ORIENT: Field | null = null;
export function orientTo(field: Field | null) { ORIENT = field; }

/** A surface f(u, v) on a grid, normals from its partials, turned to face away from the body when one is set. */
export function sheet(mb: MeshBuilder, nu: number, nv: number, f: (u: number, v: number) => Vec3, bone: string | ((u: number, v: number) => string), uvSize: [number, number] = [1, 1], flip = false, orient = true): number & { flipped?: boolean } {
  const base = mb.count;
  const e = 1e-3;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    const p = f(u, v);
    const du = sub(f(Math.min(1, u + e), v), f(Math.max(0, u - e), v));
    const dv = sub(f(u, Math.min(1, v + e)), f(u, Math.max(0, v - e)));
    let n = norm(cross(du, dv));
    if (flip) n = mul(n, -1);
    mb.vert(p, n, u * uvSize[0], v * uvSize[1], typeof bone === 'string' ? bone : bone(u, v));
  }
  if (ORIENT && orient && !flip) {
    let agree = 0;
    for (let v = base; v < mb.count; v += 3) {
      const g = ORIENT.grad(mb.pos[v * 3], mb.pos[v * 3 + 1], mb.pos[v * 3 + 2]);
      agree += Math.sign(g[0] * mb.nor[v * 3] + g[1] * mb.nor[v * 3 + 1] + g[2] * mb.nor[v * 3 + 2]);
    }
    if (agree < 0) { for (let v = base; v < mb.count; v++) for (let k = 0; k < 3; k++) mb.nor[v * 3 + k] *= -1; flip = true; }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
    if (flip) mb.quad(a, d, c, b); else mb.quad(a, b, c, d);
  }
  lastFlipped = flip;
  return base;
}
let lastFlipped = false;

/** A plate with thickness: front sheet, back sheet set in along the normal, and the four edges closed. */
export function plate(mb: MeshBuilder, nu: number, nv: number, f: (u: number, v: number) => Vec3, thick: number, bone: string, uvSize: [number, number] = [1, 1]) {
  const front = sheet(mb, nu, nv, f, bone, uvSize);
  const frontFlipped = lastFlipped;
  const nAt = (i: number, j: number): Vec3 => { const k = (front + j * (nu + 1) + i) * 3; return [mb.nor[k], mb.nor[k + 1], mb.nor[k + 2]]; };
  const pAt = (i: number, j: number): Vec3 => { const k = (front + j * (nu + 1) + i) * 3; return [mb.pos[k], mb.pos[k + 1], mb.pos[k + 2]]; };
  const back = sheet(mb, nu, nv, (u, v) => {
    const i = Math.round(u * nu), j = Math.round(v * nv);
    return sub(pAt(i, j), mul(nAt(i, j), thick));
  }, bone, uvSize, !frontFlipped, false);
  // edges: duplicate rim vertices with side normals
  const ring: [number, number][] = [];
  for (let i = 0; i <= nu; i++) ring.push([i, 0]);
  for (let j = 1; j <= nv; j++) ring.push([nu, j]);
  for (let i = nu - 1; i >= 0; i--) ring.push([i, nv]);
  for (let j = nv - 1; j >= 1; j--) ring.push([0, j]);
  const m = ring.length;
  const rimBase = mb.count;
  for (let r = 0; r < m; r++) {
    const [i, j] = ring[r];
    const [pi, pj] = ring[(r + m - 1) % m], [ni, nj] = ring[(r + 1) % m];
    const tangent = norm(sub(pAt(ni, nj), pAt(pi, pj)));
    const n = norm(cross(tangent, nAt(i, j)));
    const p = pAt(i, j);
    mb.vert(p, n, r / m, 0, bone);
    mb.vert(sub(p, mul(nAt(i, j), thick)), n, r / m, 1, bone);
  }
  for (let r = 0; r < m; r++) {
    const a = rimBase + r * 2, b = rimBase + ((r + 1) % m) * 2;
    mb.quad(a, a + 1, b + 1, b);
  }
  void back;
}

/** A tube along a polyline (cords, rims, straps' edges). */
export function tube(mb: MeshBuilder, pts: Vec3[], radius: number | ((t: number) => number), sides: number, bone: string | ((t: number) => string), flat = 1) {
  const base = mb.count;
  const n = pts.length;
  let ref: Vec3 = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const dir = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    if (Math.abs(dot(dir, ref)) > 0.95) ref = [1, 0, 0];
    const x = norm(cross(dir, ref)), y = cross(x, dir);
    const r = typeof radius === 'number' ? radius : radius(t);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const nrm = add(mul(x, Math.cos(a)), mul(y, Math.sin(a) * flat));
      mb.vert(add(pts[i], add(mul(x, Math.cos(a) * r), mul(y, Math.sin(a) * r * flat))), norm(nrm), s / sides, t, typeof bone === 'string' ? bone : bone(t));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
    const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 2, d = a + sides + 1;
    mb.quad(a, d, c, b);
  }
}

/** A unit box centred on the origin (instanced cords, rivets). */
export function unitBox(): MeshBuilder {
  const mb = new MeshBuilder();
  const faces: [Vec3, Vec3, Vec3][] = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  for (const [n, u, v] of faces) {
    const c = mul(n, 0.5);
    const b = mb.count;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) mb.vert(add(c, add(mul(u, su * 0.5), mul(v, sv * 0.5))), n, (su + 1) / 2, (sv + 1) / 2, '');
    mb.quad(b, b + 1, b + 2, b + 3);
  }
  return mb;
}

// ---- Fitting to the body's field ------------------------------------------------------------------------------------

export type Field = { d: (x: number, y: number, z: number) => number; grad: (x: number, y: number, z: number) => Vec3 };

/** Distance from an inside point to where the body ends along a direction. */
export function reach(field: Field, from: Vec3, dir: Vec3, max = 0.5): number {
  let t = 0;
  const step = 0.003;
  while (t < max) {
    const p = add(from, mul(dir, t));
    if (field.d(p[0], p[1], p[2]) > 0) return t;
    t += step;
  }
  return max;
}

/** A horizontal section of the trunk at height y: its centre and a convex radius per angle (θ = 0 is +x, π/2 is +z). */
export function trunkSection(field: Field, y: number, n = 72, ignoreArms = true) {
  const front = reach(field, [0, y, 0], [0, 0, 1]), back = reach(field, [0, y, 0], [0, 0, -1]);
  const cz = (front - back) / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dir: Vec3 = [Math.cos(a), 0, Math.sin(a)];
    let r = reach(field, [0, y, cz], dir, 0.4);
    if (ignoreArms) r = Math.min(r, 0.24);
    pts.push([Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  const hull = convexHull(pts);
  const radius = (a: number) => rayHull(hull, [0, cz], [Math.cos(a), Math.sin(a)]);
  return { cz, radius };
}

/**
 * A section of a limb in the plane spanned by e1, e2 around c: convex radius per angle (θ from e1 toward e2).
 * Loose garments hang from the hull, never from the dips between muscles; a march that starts outside the limb
 * (near the crotch, say) reads as no surface, and the hull bridges it.
 */
export function limbSection(field: Field, c: Vec3, e1: Vec3, e2: Vec3, n = 48, maxR = 0.2) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dir = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)));
    const r = reach(field, c, dir, maxR);
    if (r > 0.004 && r < maxR - 0.001) pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  if (pts.length < 6) return () => 0.05;
  const hull = convexHull(pts);
  return (a: number) => rayHull(hull, [0, 0], [Math.cos(a), Math.sin(a)]);
}

function convexHull(p: [number, number][]) {
  const pts = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossz = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of pts) { while (lower.length >= 2 && crossz(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of pts.reverse()) { while (upper.length >= 2 && crossz(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function rayHull(hull: [number, number][], o: [number, number], d: [number, number]) {
  let best = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
    const s = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.max(best, t);
  }
  return best;
}

// ---- The kit --------------------------------------------------------------------------------------------------------

export interface SpringChainOut { bones: string[]; stiffness: number; drag: number; gravity: number; radius: number }
export interface ExtraBone { name: string; parent: string; at: Vec3 }

export interface WardrobePiece {
  id: string;
  label: string;
  era: string;
  /** Museum evidence (services/museum, docs/era-clash-3d-era-accuracy.md). */
  refs: string[];
}

export interface Wardrobe {
  /** Rigid plates, by material; every vertex bound to exactly one bone. */
  armour: Map<string, MeshBuilder>;
  /** Cloth surfaces to be skinned from the body, by material. Vertices already tagged with chain bones keep them. */
  cloth: Map<string, MeshBuilder>;
  /** Instanced silk lacing on the dō rows: per bone, a unit cord's instance transforms (rest world space). */
  lacing: { bone: string; t: number[]; r: number[]; s: number[] }[];
  /** The kabuto, kept apart so the game can show or hide it. */
  kabuto: Map<string, MeshBuilder>;
  hair: MeshBuilder;
  bones: ExtraBone[];
  springs: SpringChainOut[];
  /** Cloth vertices in these ranges get chain weights: [material, vertex index] → chain bone weights. */
  clothChains: Map<string, Map<number, [string, number][]>>;
  sockets: { name: string; bone: string; at: Vec3; x: Vec3; y: Vec3 }[];
  pieces: WardrobePiece[];
}

const ERA = 'Momoyama (late 16th c.)';
const REF_TOSEI = ['紺糸威南蛮胴具足, Azuchi-Momoyama, Japan Search', 'Tachidō tosei-gusoku, Momoyama–Edo, Wikimedia Commons'];

export function buildHaruKit(anatomy: HumanAnatomy, field: Field): Wardrobe {
  orientTo(field);
  try { return haruKit(anatomy, field); } finally { orientTo(null); }
}

function haruKit(anatomy: HumanAnatomy, field: Field): Wardrobe {
  const J = (n: HumanJoint) => anatomy.byName[n].at;
  const w: Wardrobe = {
    armour: new Map(), cloth: new Map(), lacing: [], kabuto: new Map(), hair: new MeshBuilder(),
    bones: [], springs: [], clothChains: new Map(), sockets: [], pieces: [],
  };
  const A = (mat: string) => { let m = w.armour.get(mat); if (!m) { m = new MeshBuilder(); w.armour.set(mat, m); } return m; };
  const Cl = (mat: string) => { let m = w.cloth.get(mat); if (!m) { m = new MeshBuilder(); w.cloth.set(mat, m); } return m; };
  const K = (mat: string) => { let m = w.kabuto.get(mat); if (!m) { m = new MeshBuilder(); w.kabuto.set(mat, m); } return m; };
  const piece = (id: string, label: string, refs = REF_TOSEI) => w.pieces.push({ id, label, era: ERA, refs });
  const cord = new Map<string, { t: number[]; r: number[]; s: number[] }>();
  /** One lacing stitch: centre, along (the cord's run), out (the plate normal), width and length. */
  const stitch = (bone: string, c: Vec3, along: Vec3, out: Vec3, width: number, length: number, thick = 0.0022) => {
    let l = cord.get(bone); if (!l) { l = { t: [], r: [], s: [] }; cord.set(bone, l); }
    const y = norm(along), z = norm(sub(out, mul(y, dot(out, y)))), x = cross(y, z);
    l.t.push(c[0], c[1], c[2]);
    l.r.push(...quatFromBasis(x, y, z));
    l.s.push(width, length, thick);
  };
  /** Lacing on a skinned/rigid chain plate goes into the armour mesh itself (instancing can't follow a chain). */
  const stitchMesh = (mat: string, bone: string, c: Vec3, along: Vec3, out: Vec3, width: number, length: number, thick = 0.0022) => {
    const y = norm(along), z = norm(sub(out, mul(y, dot(out, y)))), x = cross(y, z);
    const box = unitBox();
    const mb = A(mat);
    const base = mb.count;
    for (let i = 0; i < box.count; i++) {
      const p: Vec3 = [box.pos[i * 3] * width, box.pos[i * 3 + 1] * length, box.pos[i * 3 + 2] * thick];
      const n: Vec3 = [box.nor[i * 3], box.nor[i * 3 + 1], box.nor[i * 3 + 2]];
      mb.vert(add(c, add(add(mul(x, p[0]), mul(y, p[1])), mul(z, p[2]))), norm(add(add(mul(x, n[0]), mul(y, n[1])), mul(z, n[2]))), box.uv[i * 2], box.uv[i * 2 + 1], bone);
    }
    for (const i of box.idx) mb.idx.push(i + base);
  };

  // ---- Dō: seven rows of kozane plates, laced kebiki ----------------------------------------------------------------
  piece('do', 'Dō (cuirass): seven rows of lacquered kozane, kon-ito kebiki odoshi');
  const doRows = 7, yBottom = 1.035, yTop = 1.36, rowH = (yTop - yBottom) / doRows;
  const rowBone = (i: number): HumanJoint => (i < 2 ? 'Spine' : i < 4 ? 'Spine1' : 'Spine2');
  const sections = new Map<number, ReturnType<typeof trunkSection>>();
  const sec = (y: number) => { const k = Math.round(y * 200); let s = sections.get(k); if (!s) { s = trunkSection(field, k / 200); sections.set(k, s); } return s; };
  const doClear = 0.03;
  for (let i = 0; i < doRows; i++) {
    const y0 = yBottom + i * rowH - 0.008, y1 = yBottom + (i + 1) * rowH + 0.006;
    const bone = rowBone(i);
    // upper rows sit over lower ones (each row is laced to hang over the one below)
    const out = doClear + (i % 2) * 0.004;
    const s0 = sec(y0), s1 = sec(y1);
    const cols = 64;
    const ringAt = (u: number, v: number): Vec3 => {
      const a = u * Math.PI * 2;
      const y = y0 + (y1 - y0) * v;
      const s = v < 0.5 ? s0 : s1;
      // scalloped kozane tops: a small rounded tooth per scale
      const tooth = v > 0.97 ? 0.004 * Math.abs(Math.sin(u * cols * Math.PI)) : 0;
      const r = s.radius(a) + out + (1 - v) * 0.004;
      return [Math.cos(a) * r, y + tooth, s.cz + Math.sin(a) * r];
    };
    plate(A('lacquer'), cols * 2, 4, ringAt, 0.004, bone, [3, 0.05]);
    // gold edge on the top row (the munaita's lower rim) and the waist
    if (i === doRows - 1 || i === 0) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 96; k++) { const p = ringAt(k / 96, i === 0 ? 0 : 1); pts.push(p); }
      tube(A('gold'), pts, 0.0035, 6, bone);
    }
    // kebiki lacing: one stitch per scale pair down the visible face of the row
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols;
      const top = ringAt(u, 0.92), bot = ringAt(u, 0.12);
      const a = u * Math.PI * 2;
      const outN: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      stitch(bone, add(lerp(top, bot, 0.5), mul(outN, 0.003)), sub(top, bot), outN, 0.0075, len(sub(top, bot)));
    }
  }
  // munaita (chest plate) and oshitsuke-ita (back plate): solid lacquered plates over the top row, gold-rimmed
  for (const side of [1, -1]) {
    const bone: HumanJoint = 'Spine2';
    const y0 = yTop - 0.004, y1 = side > 0 ? 1.425 : 1.445;
    const half = side > 0 ? 0.105 : 0.12;
    const f = (u: number, v: number): Vec3 => {
      const a = Math.PI / 2 * side + (u - 0.5) * (half * 2 / 0.16);
      const y = y0 + (y1 - y0) * v;
      const s = sec(Math.min(y, 1.4));
      const r = s.radius(a) + doClear + 0.004 - v * 0.012;
      const cutaway = v > 0.6 ? Math.abs(u - 0.5) * 0.02 : 0; // the plate's top curves down at its ends
      return [Math.cos(a) * r, y - cutaway, s.cz + Math.sin(a) * r];
    };
    plate(A('lacquer'), 24, 6, side > 0 ? f : (u, v) => f(1 - u, v), 0.004, bone, [0.3, 0.1]);
    const rim: Vec3[] = [];
    for (let k = 0; k <= 24; k++) rim.push(f(k / 24, 1));
    tube(A('gold'), rim, 0.004, 6, bone);
  }
  // watagami: the shoulder straps from the back plate over the shoulders, leather
  for (const sx of [1, -1]) {
    const pts: Vec3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const z = -0.11 + t * 0.2;
      const yy = 1.43 + Math.sin(t * Math.PI) * 0.04;
      pts.push([sx * 0.11, yy, z]);
    }
    tube(A('leather'), pts, 0.018, 8, 'Spine2', 0.25);
  }
  for (const [b, l] of cord) w.lacing.push({ bone: b, ...l });

  // ---- Kusazuri: seven tassets on spring chains -----------------------------------------------------------------------
  piece('kusazuri', 'Kusazuri (tassets): seven columns of five lames, laced, on spring chains');
  const tassets = 7, lames = 5, lameH = 0.058, kTop = yBottom + 0.004;
  const hipSec = sec(0.93), waistSec = sec(kTop);
  for (let i = 0; i < tassets; i++) {
    const a0 = Math.PI / 2 + (i / tassets) * Math.PI * 2;
    const span = (Math.PI * 2) / tassets * 1.06; // a little overlap
    const chain: string[] = [];
    for (let j = 0; j < lames; j++) {
      const name = `Kusazuri${i}_${j}`;
      const yTopJ = kTop - j * (lameH - 0.008);
      const r = Math.max(waistSec.radius(a0), hipSec.radius(a0)) + doClear + 0.012 + j * 0.008;
      const at: Vec3 = [Math.cos(a0) * r, yTopJ, waistSec.cz + Math.sin(a0) * r];
      w.bones.push({ name, parent: j ? `Kusazuri${i}_${j - 1}` : 'Spine', at });
      chain.push(name);
      const f = (u: number, v: number): Vec3 => {
        const a = a0 + (u - 0.5) * span * (1 + j * 0.03);
        const rr = Math.max(waistSec.radius(a), hipSec.radius(a)) + doClear + 0.012 + j * 0.008 + (1 - v) * 0.006;
        const tooth = v > 0.97 ? 0.0035 * Math.abs(Math.sin(u * 14 * Math.PI)) : 0;
        return [Math.cos(a) * rr, yTopJ - lameH + v * lameH + tooth, waistSec.cz + Math.sin(a) * rr];
      };
      plate(A('lacquer'), 28, 3, f, 0.004, name, [0.16, 0.06]);
      // lacing: vertical cords from the lame above, and a hishi-nui cross stitch on the last lame
      for (let c = 0; c < 6; c++) {
        const u = (c + 0.5) / 6;
        const top = f(u, 0.95), bot = f(u, 0.15);
        const n = norm(sub(f(u, 0.5), [0, f(u, 0.5)[1], waistSec.cz]));
        stitchMesh('silk', name, add(lerp(top, bot, 0.5), mul(n, 0.003)), sub(top, bot), n, 0.008, len(sub(top, bot)));
        if (j === lames - 1) {
          const c0 = add(f(u, 0.35), mul(n, 0.0035));
          const across = norm(sub(f(Math.min(1, u + 0.05), 0.35), f(Math.max(0, u - 0.05), 0.35)));
          const up = norm(sub(top, bot));
          stitchMesh('silkRed', name, c0, add(across, up), n, 0.005, 0.02);
          stitchMesh('silkRed', name, c0, sub(across, up), n, 0.005, 0.02);
        }
      }
      if (j === lames - 1) {
        const pts: Vec3[] = [];
        for (let k = 0; k <= 20; k++) pts.push(f(k / 20, 0));
        tube(A('gold'), pts, 0.0035, 6, name);
      }
    }
    w.springs.push({ bones: chain, stiffness: 18, drag: 0.14, gravity: 9.8, radius: 0.02 });
  }

  // ---- Sode: shoulder guards on spring chains ------------------------------------------------------------------------
  piece('sode', 'Sode (shoulder guards): seven lames, laced, hung from the watagami on spring chains');
  for (const s of ['Left', 'Right'] as const) {
    const sx = s === 'Left' ? 1 : -1;
    const hang = norm([sx * Math.sin((14 * Math.PI) / 180), -Math.cos((14 * Math.PI) / 180), 0]);
    const outN = norm([sx * Math.cos((14 * Math.PI) / 180), Math.sin((14 * Math.PI) / 180), 0]);
    const root: Vec3 = [sx * 0.215, 1.46, -0.005];
    const chain: string[] = [];
    const n = 7, h = 0.05, width = 0.24;
    for (let j = 0; j < n; j++) {
      const name = `Sode${s[0]}_${j}`;
      const at = add(add(root, mul(hang, j * (h - 0.006))), mul(outN, j * 0.004));
      w.bones.push({ name, parent: j ? `Sode${s[0]}_${j - 1}` : `${s}Shoulder`, at });
      chain.push(name);
      const f = (u: number, v: number): Vec3 => {
        // across the guard (front to back) with a gentle curve round the arm
        const zz = (u - 0.5) * width * (1 + j * 0.02);
        const bow = (1 - (2 * u - 1) ** 2) * 0.022;
        const tooth = v > 0.97 ? 0.003 * Math.abs(Math.sin(u * 18 * Math.PI)) : 0;
        const p = add(add(at, mul(hang, (1 - v) * h - tooth)), mul(outN, bow + (1 - v) * 0.005));
        return [p[0], p[1], p[2] + zz * sx];
      };
      plate(A('lacquer'), 24, 3, f, 0.004, name, [0.24, 0.05]);
      for (let c = 0; c < 8; c++) {
        const u = (c + 0.5) / 8;
        const top = f(u, 0.95), bot = f(u, 0.12);
        stitchMesh('silk', name, add(lerp(top, bot, 0.5), mul(outN, 0.003)), sub(top, bot), outN, 0.008, len(sub(top, bot)));
        if (j === n - 1) {
          const c0 = add(f(u, 0.35), mul(outN, 0.0035));
          const up = norm(sub(top, bot));
          stitchMesh('silkRed', name, c0, add([0, 0, 1], up), outN, 0.005, 0.02);
          stitchMesh('silkRed', name, c0, sub([0, 0, 1], up), outN, 0.005, 0.02);
        }
      }
      if (j === n - 1) { const pts: Vec3[] = []; for (let k = 0; k <= 20; k++) pts.push(f(k / 20, 0)); tube(A('gold'), pts, 0.0035, 6, name); }
      if (j === 0) { const pts: Vec3[] = []; for (let k = 0; k <= 20; k++) pts.push(f(k / 20, 1)); tube(A('gold'), pts, 0.004, 6, name); }
    }
    w.springs.push({ bones: chain, stiffness: 16, drag: 0.16, gravity: 9.8, radius: 0.025 });
  }

  // ---- Kote: cloth sleeve with iron splints and a hand plate ------------------------------------------------------
  piece('kote', 'Kote (armoured sleeves): navy cloth over mail, iron splints on the forearm, tekko hand plate');
  for (const s of ['Left', 'Right'] as const) {
    const fore = J(`${s}ForeArm` as HumanJoint), hand = J(`${s}Hand` as HumanJoint);
    const axis = norm(sub(hand, fore));
    const side = norm(cross(axis, [0, 0, 1]));
    const up = norm(cross(side, axis));
    // three splints round the back of the forearm (tsutsu-gote), lacquered black iron
    for (let k = -1; k <= 1; k++) {
      const ang = k * 0.55;
      const f = (u: number, v: number): Vec3 => {
        const t = 0.12 + u * 0.78;
        const c = lerp(fore, hand, t);
        const rr = reach(field, c, norm(add(mul(up, Math.cos(ang + (v - 0.5) * 0.45)), mul(side, Math.sin(ang + (v - 0.5) * 0.45)))), 0.08) + 0.014;
        const dirv = norm(add(mul(up, Math.cos(ang + (v - 0.5) * 0.45)), mul(side, Math.sin(ang + (v - 0.5) * 0.45))));
        return add(c, mul(dirv, rr));
      };
      plate(A('iron'), 10, 3, f, 0.003, `${s}ForeArm`, [0.2, 0.04]);
    }
    // tekko: the hand plate over the back of the hand
    const knuck = anatomy.byName[`${s}Hand` as HumanJoint].tip;
    const handAxis = norm(sub(knuck, hand));
    const back = mul(anatomy.grip[s].palm, -1);
    const across = norm(cross(handAxis, back));
    const f = (u: number, v: number): Vec3 => {
      const c = lerp(hand, knuck, 0.05 + u * 0.75);
      const off = (v - 0.5) * 0.07;
      const bulge = 0.016 + (1 - (2 * v - 1) ** 2) * 0.006;
      return add(add(c, mul(across, off)), mul(back, bulge));
    };
    plate(A('iron'), 8, 6, f, 0.0025, `${s}Hand`, [0.1, 0.07]);
    const rim: Vec3[] = []; for (let k = 0; k <= 8; k++) rim.push(f(1, k / 8)); tube(A('gold'), rim, 0.0025, 5, `${s}Hand`);
  }

  // ---- Haidate: the thigh apron of small plates ---------------------------------------------------------------------
  piece('haidate', 'Haidate (thigh guard): apron of small lacquered plates over the hakama, tied at the waist');
  for (const s of ['Left', 'Right'] as const) {
    const sx = s === 'Left' ? 1 : -1;
    const hip = J(`${s}UpLeg` as HumanJoint), knee = J(`${s}Leg` as HumanJoint);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) {
      const t0 = 0.12 + row * 0.11, t1 = t0 + 0.105;
      const ang0 = -0.95 + col * 0.38, ang1 = ang0 + 0.36;
      const f = (u: number, v: number): Vec3 => {
        const t = t1 + (t0 - t1) * v;
        const c = lerp(hip, knee, t);
        const a = ang0 + (ang1 - ang0) * u;
        const dir: Vec3 = norm([Math.sin(a) * sx, 0, Math.cos(a)]);
        const r = reach(field, c, dir, 0.2) + 0.055 + (1 - v) * 0.004;
        return add(c, mul(dir, r));
      };
      plate(A('lacquer'), 3, 2, f, 0.003, `${s}UpLeg`, [0.05, 0.05]);
    }
  }

  // ---- Suneate: shin splints and the knee guard ------------------------------------------------------------------
  piece('suneate', 'Suneate (greaves): iron splints joined over mail, with a tateage knee guard');
  for (const s of ['Left', 'Right'] as const) {
    const sx = s === 'Left' ? 1 : -1;
    const knee = J(`${s}Leg` as HumanJoint), ankle = J(`${s}Foot` as HumanJoint);
    for (let k = -2; k <= 2; k++) {
      const a0 = k * 0.42;
      const f = (u: number, v: number): Vec3 => {
        const t = 0.12 + (1 - v) * 0.72;
        const c = lerp(knee, ankle, t);
        const a = a0 + (u - 0.5) * 0.36;
        const dir: Vec3 = norm([Math.sin(a) * sx, 0, Math.cos(a)]);
        return add(c, mul(dir, reach(field, c, dir, 0.15) + 0.026));
      };
      plate(A('iron'), 3, 8, f, 0.003, `${s}Leg`, [0.04, 0.3]);
    }
    // tateage: the knee plate
    const f = (u: number, v: number): Vec3 => {
      const c = lerp(knee, ankle, -0.04 + (1 - v) * 0.16);
      const a = (u - 0.5) * 1.6;
      const dir: Vec3 = norm([Math.sin(a) * sx, 0.1, Math.cos(a)]);
      return add(c, mul(dir, reach(field, c, dir, 0.15) + 0.035));
    };
    plate(A('lacquer'), 10, 4, f, 0.004, `${s}Leg`, [0.12, 0.08]);
    const rim: Vec3[] = []; for (let k = 0; k <= 10; k++) rim.push(f(k / 10, 1)); tube(A('gold'), rim, 0.003, 5, `${s}Leg`);
    // the ties above the ankle: red cord wrapped twice
    for (const yy of [0.2, 0.62]) {
      const c = lerp(knee, ankle, 0.12 + yy * 0.72);
      const pts: Vec3[] = [];
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const dir: Vec3 = [Math.sin(a), 0, Math.cos(a)]; pts.push(add(c, mul(dir, reach(field, c, dir, 0.15) + 0.031))); }
      tube(A('silkRed'), pts, 0.003, 5, `${s}Leg`);
    }
  }

  // ---- Cloth -----------------------------------------------------------------------------------------------------
  piece('hakama', 'Hakama: pleated trousers, ballooning to the knee and gathered into the greaves', ['Tachidō tosei-gusoku, Momoyama–Edo, Wikimedia Commons']);
  const chainWeights = (mat: string) => { let m = w.clothChains.get(mat); if (!m) { m = new Map(); w.clothChains.set(mat, m); } return m; };
  for (const s of ['Left', 'Right'] as const) {
    const sx = s === 'Left' ? 1 : -1;
    const hip = J(`${s}UpLeg` as HumanJoint), knee = J(`${s}Leg` as HumanJoint), ankle = J(`${s}Foot` as HumanJoint);
    const yTopH = 1.0, yGather = 0.27;
    // the leg's centre line at a height
    const centre = (y: number): Vec3 => {
      if (y >= knee[1]) return lerp(knee, hip, (y - knee[1]) / (hip[1] - knee[1]));
      return lerp(ankle, knee, (y - ankle[1]) / (knee[1] - ankle[1]));
    };
    // spring chains on the hem bulge: four per leg, from the knee
    const chainNames: { name: string; ang: number }[] = [];
    for (let c = 0; c < 4; c++) {
      const ang = (c / 4) * Math.PI * 2;
      const dir: Vec3 = [Math.sin(ang) * sx, 0, Math.cos(ang)];
      const top = add(centre(0.5), mul(dir, 0.08));
      const b0 = `Hakama${s[0]}${c}_0`, b1 = `Hakama${s[0]}${c}_1`;
      w.bones.push({ name: b0, parent: `${s}Leg`, at: top }, { name: b1, parent: b0, at: add(add(centre(0.36), mul(dir, 0.09)), [0, 0, 0]) });
      w.springs.push({ bones: [b0, b1], stiffness: 22, drag: 0.18, gravity: 6, radius: 0.03 });
      chainNames.push({ name: b0, ang });
    }
    const mb = Cl('hakama');
    const base = mb.count;
    const nu = 48, nv = 40;
    const balloon = (y: number) => {
      // wide from mid-thigh to below the knee, gathered at the greaves
      const t = (y - yGather) / (yTopH - yGather);
      return 0.012 + 0.07 * Math.sin(Math.min(1, t * 1.35) * Math.PI) ** 0.8 * (t < 0.08 ? smooth01(t / 0.08) : 1) + (t > 0.85 ? (t - 0.85) * 0.12 : 0);
    };
    const rings = new Map<number, (a: number) => number>();
    const ringAt = (v: number) => {
      const k = Math.round(v * nv);
      let r = rings.get(k);
      if (!r) {
        const y = yGather + (yTopH - yGather) * (k / nv);
        // e1 = forward, e2 = outward: θ = u·2π runs front → outside → back → inside
        const sec = limbSection(field, centre(y), [0, 0, 1], [sx, 0, 0], 48, 0.2);
        r = (a: number) => Math.max(sec(a), 0.045);
        rings.set(k, r);
      }
      return r;
    };
    const f = (u: number, v: number): Vec3 => {
      const y = yGather + (yTopH - yGather) * v;
      const c = centre(y);
      const a = u * Math.PI * 2;
      const dir: Vec3 = [Math.sin(a) * sx, 0, Math.cos(a)];
      // inner side of the leg stays closer (the crotch), pleats in front
      const inner = Math.max(0, -Math.sin(a)) * 0.6;
      const pleat = Math.cos(a) > 0.2 ? 0.004 * Math.sin(u * 5 * Math.PI * 2) : 0;
      const r = ringAt(v)(a) + balloon(y) * (1 - inner) + 0.008 + pleat;
      return add(c, mul(dir, r));
    };
    sheet(mb, nu, nv, f, `${s}UpLeg`, [1.2, 0.8]);
    // chain weights for the bulge band
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const y = yGather + (yTopH - yGather) * (j / nv);
      const band = smooth01((y - yGather) / 0.06) * (1 - smooth01((y - 0.46) / 0.12));
      if (band <= 0.01) continue;
      const a = (i / nu) * Math.PI * 2;
      const ws: [string, number][] = [];
      for (const c of chainNames) {
        const d = Math.abs(Math.atan2(Math.sin(a - c.ang), Math.cos(a - c.ang)));
        const k = Math.max(0, 1 - d / (Math.PI / 2));
        if (k > 0) ws.push([y < 0.42 ? c.name.replace(/_0$/, '_1') : c.name, k * band]);
      }
      chainWeights('hakama').set(base + j * (nu + 1) + i, ws);
    }
  }
  piece('kosode', 'Kosode: the inner robe, its sleeves tied short over the kote, sleeve hems on spring chains', ['Kosode, Momoyama period, the Met']);
  for (const s of ['Left', 'Right'] as const) {
    const sh = J(`${s}Arm` as HumanJoint), el = J(`${s}ForeArm` as HumanJoint);
    const axis = norm(sub(el, sh));
    const ref: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = norm(cross(axis, ref)), e2 = cross(e1, axis);
    const t0 = -0.08, t1 = 0.62;
    const chainNames: { name: string; ang: number }[] = [];
    for (let c = 0; c < 3; c++) {
      const ang = Math.PI * 0.5 + (c - 1) * 1.1; // below the arm: front, under, back
      const dir = norm(add(mul(e1, Math.cos(ang)), mul(e2, Math.sin(ang))));
      const at = add(lerp(sh, el, 0.42), mul(dir, 0.06));
      const b0 = `Sleeve${s[0]}${c}_0`;
      w.bones.push({ name: b0, parent: `${s}Arm`, at });
      w.bones.push({ name: `Sleeve${s[0]}${c}_1`, parent: b0, at: add(lerp(sh, el, 0.62), mul(dir, 0.075)) });
      w.springs.push({ bones: [b0, `Sleeve${s[0]}${c}_1`], stiffness: 18, drag: 0.15, gravity: 7, radius: 0.02 });
      chainNames.push({ name: b0, ang });
    }
    const mb = Cl('kosode');
    const base = mb.count;
    const nu = 40, nv = 18;
    const secs = new Map<number, (a: number) => number>();
    const sleeveSec = (j: number) => {
      let r = secs.get(j);
      if (!r) {
        const t = t0 + (t1 - t0) * (j / nv);
        const sec = limbSection(field, lerp(sh, el, Math.max(0.02, t)), e1, e2, 40, 0.12);
        r = (a: number) => Math.max(sec(a), 0.035);
        secs.set(j, r);
      }
      return r;
    };
    const f = (u: number, v: number): Vec3 => {
      const t = t0 + (t1 - t0) * v;
      const c = lerp(sh, el, t);
      const a = u * Math.PI * 2;
      const dir = norm(add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a))));
      // roomy, fuller toward the hem, and the hem hangs lower under the arm
      const sec = sleeveSec(Math.round(v * nv));
      const r = sec(a) + 0.016 + 0.03 * smooth01((t - 0.1) / 0.5) + Math.max(0, Math.sin(a)) * 0.012 * v;
      return add(c, mul(dir, r));
    };
    sheet(mb, nu, nv, f, `${s}Arm`, [0.6, 0.4]);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const t = t0 + (t1 - t0) * (j / nv);
      const band = smooth01((t - 0.3) / 0.2);
      if (band <= 0.01) continue;
      const a = (i / nu) * Math.PI * 2;
      const ws: [string, number][] = [];
      for (const c of chainNames) {
        const d = Math.abs(Math.atan2(Math.sin(a - c.ang), Math.cos(a - c.ang)));
        const k = Math.max(0, 1 - d / 1.3);
        if (k > 0) ws.push([t > 0.52 ? c.name.replace(/_0$/, '_1') : c.name, k * band]);
      }
      chainWeights('kosode').set(base + j * (nu + 1) + i, ws);
    }
  }
  piece('obi', 'Uwa-obi: the outer sash over the dō, holding the swords');
  {
    const mb = Cl('obi');
    const y0 = 0.99, y1 = 1.05;
    sheet(mb, 72, 3, (u, v) => {
      const a = u * Math.PI * 2;
      const y = y0 + (y1 - y0) * v;
      const s = sec(y);
      const r = s.radius(a) + doClear + 0.012;
      return [Math.cos(a) * r, y, s.cz + Math.sin(a) * r];
    }, 'Spine', [2, 0.1]);
    // the knot at the front left, with two hanging ends
    const knot: Vec3 = [0.07, 1.02, sec(1.02).cz + sec(1.02).radius(Math.PI / 2 - 0.4) + 0.05];
    tube(mb, [add(knot, [-0.02, 0, 0]), add(knot, [0.02, 0, 0.004])], 0.022, 10, 'Spine', 0.6);
    for (const [dx, l] of [[0.0, 0.16], [0.03, 0.12]] as const) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 8; k++) pts.push(add(knot, [dx + k * 0.002, -k * (l / 8), 0.008 + k * 0.001]));
      tube(mb, pts, 0.016, 6, 'Hips', 0.25);
    }
  }

  // ---- Weapons: katana in the right hand, its saya and the wakizashi in the obi ------------------------------------
  piece('katana', 'Katana (uchigatana), worn edge-up through the obi', ['Momoyama uchigatana koshirae, the Met']);
  const R = anatomy.grip.Right;
  const handAlong = norm(sub(anatomy.byName.RightHand.tip, anatomy.byName.RightHand.at));
  // the edge faces the way the fingers point, so a cut leads with the edge
  const edgeR = norm(sub(handAlong, mul(R.axis, dot(handAlong, R.axis))));
  w.sockets.push({ name: 'socket_hand_R', bone: 'RightHand', at: R.at, x: edgeR, y: R.axis });
  const L = anatomy.grip.Left, alongL = norm(sub(anatomy.byName.LeftHand.tip, anatomy.byName.LeftHand.at));
  w.sockets.push({ name: 'socket_hand_L', bone: 'LeftHand', at: L.at, x: norm(sub(alongL, mul(L.axis, dot(alongL, L.axis)))), y: L.axis });
  const s1 = sec(1.02);
  const obiFront = (a: number): Vec3 => [Math.cos(a) * (s1.radius(a) + doClear + 0.03), 1.0, s1.cz + Math.sin(a) * (s1.radius(a) + doClear + 0.03)];
  const sayaDir = norm([0.28, -0.32, -1]);
  // worn edge-up: the edge faces the sky
  const upEdge = (y: Vec3) => norm(sub([0, 1, 0], mul(y, dot([0, 1, 0], y))));
  w.sockets.push({ name: 'socket_obi_katana', bone: 'Hips', at: obiFront(Math.PI / 2 - 0.55), x: upEdge(mul(sayaDir, -1)), y: mul(sayaDir, -1) });
  w.sockets.push({ name: 'socket_obi_wakizashi', bone: 'Hips', at: add(obiFront(Math.PI / 2 - 0.25), [0, 0.03, -0.01]), x: upEdge(mul(sayaDir, -1)), y: mul(sayaDir, -1) });

  // ---- Kabuto (optional; Haru's art shows him bareheaded) -------------------------------------------------------------
  piece('kabuto', 'Kabuto: 62-plate suji-bachi bowl, mabizashi visor, fukigaeshi turnbacks, five-lame shikoro');
  {
    const head = J('Head');
    const c: Vec3 = [0, 1.655, -0.02];
    const R0 = 0.118;
    // bowl with raised ridges (suji)
    sheet(K('iron'), 124, 16, (u, v) => {
      const a = u * Math.PI * 2, el = (1 - v) * Math.PI / 2 * 0.92;
      const rib = 0.0018 * Math.max(0, Math.cos(u * 62 * Math.PI * 2)) ** 6;
      const r = R0 + rib;
      return [c[0] + Math.cos(a) * Math.cos(el) * r, c[1] + 0.012 + Math.sin(el) * r * 0.95, c[2] + Math.sin(a) * Math.cos(el) * r];
    }, 'Head', [4, 1]);
    // tehen: the gilt rosette at the crown
    tube(K('gold'), [add(c, [0, 0.122, 0]), add(c, [0, 0.13, 0])], 0.014, 12, 'Head');
    // mabizashi: the visor
    sheet(K('lacquerBlack'), 24, 3, (u, v) => {
      const a = Math.PI / 2 + (u - 0.5) * 1.7;
      const r = R0 + 0.004 + v * 0.045;
      return [Math.cos(a) * r, c[1] + 0.02 - v * 0.012, c[2] + Math.sin(a) * r];
    }, 'Head', [0.3, 0.05]);
    // shikoro: five lames flaring down the back and sides
    for (let j = 0; j < 5; j++) {
      const y = c[1] + 0.005 - j * 0.032;
      const f = (u: number, v: number): Vec3 => {
        const a = Math.PI / 2 + 0.75 + u * (Math.PI * 2 - 1.5);
        const r = R0 + 0.008 + j * 0.016 + (1 - v) * 0.01;
        return [Math.cos(a) * r, y - (1 - v) * 0.036, c[2] - 0.01 + Math.sin(a) * r];
      };
      plate(K('lacquer'), 48, 2, f, 0.003, 'Head', [0.6, 0.04]);
      const rim: Vec3[] = []; for (let k = 0; k <= 48; k++) rim.push(f(k / 48, 0)); tube(K(j === 4 ? 'gold' : 'silk'), rim, 0.0028, 5, 'Head');
    }
    // fukigaeshi: the turnbacks folding out at the front of the top lame
    for (const sx of [1, -1]) {
      sheet(K('lacquer'), 6, 6, (u, v) => {
        const a = Math.PI / 2 + sx * (0.75 + u * 0.12);
        const r = R0 + 0.012 + u * 0.03;
        return [Math.cos(a) * r + sx * u * 0.02, c[1] + 0.005 - v * 0.065, c[2] + Math.sin(a) * r];
      }, 'Head', [0.06, 0.06]);
    }
    void head;
  }

  // ---- Hair: the cap over the scalp and the chonmage topknot ------------------------------------------------------
  {
    const head = J('Head');
    void head;
    const hb = w.hair;
    // topknot: gathered at the crown, folded forward over the top as in the art
    const base: Vec3 = [0, 1.738, -0.045];
    const pts: Vec3[] = [base, add(base, [0, 0.022, 0.004]), add(base, [0, 0.04, 0.015]), add(base, [0, 0.05, 0.035]), add(base, [0, 0.046, 0.056])];
    tube(hb, pts, (t) => 0.012 * (1 - t * 0.35), 10, 'Head');
    tube(hb, [add(base, [0, 0.012, 0]), add(base, [0, 0.02, 0.002])], 0.0135, 10, 'Head');
  }
  return w;
}

/** Quaternion [x, y, z, w] from an orthonormal basis (columns x, y, z). */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }
  return [qx, qy, qz, qw];
}
