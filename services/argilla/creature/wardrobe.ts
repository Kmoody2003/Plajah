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
  /** Which piece each vertex belongs to (the wardrobe sets `tag` as it builds), so a piece can leave as its own asset. */
  tags: string[] = []; tag = '';
  get count() { return this.pos.length / 3; }
  vert(p: Vec3, n: Vec3, u: number, v: number, bone: string) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(u, v); this.bone.push(bone); this.tags.push(this.tag);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  append(o: MeshBuilder) {
    const base = this.count;
    this.pos.push(...o.pos); this.nor.push(...o.nor); this.uv.push(...o.uv); this.bone.push(...o.bone);
    for (let k = 0; k < o.count; k++) this.tags.push(o.tags[k] || this.tag);
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

export interface SpringChainOut { bones: string[]; stiffness: number; drag: number; gravity: number; radius: number; maxAngle?: number }

/**
 * A garment simulated as cloth (playkit/character/clothSim.ts): a coarse particle grid sampled from the same surface
 * the garment's mesh was built from, row-major, row 0 at v = 0. The game binds the mesh to it triangle by triangle.
 */
export interface ClothSimOut {
  name: string;
  /** The cloth material whose primitive this grid drives. */
  material: string;
  cols: number;
  rows: number;
  /** Columns wrap round (a tube: a trouser leg, a sleeve). */
  wrapU: boolean;
  /** Rest positions, flat xyz, metres. */
  points: number[];
  /** Per particle: 1 = held to the body where the garment is tied, 0 = free. */
  pin: number[];
  /** Per particle: how far it may swing from where the body puts it, metres. */
  maxDist: number[];
  /** Pull back toward the body's pose, 1/s (fabric memory of its cut). */
  drive: number;
  /** Stretch and bend compliance (XPBD, m/N): 0 = rigid. */
  stretch: number;
  bend: number;
  /** Velocity damping, 1/s, and the particle radius for collision, metres. */
  damping: number;
  radius: number;
}

function clothGrid(name: string, material: string, cols: number, rows: number, f: (u: number, v: number) => Vec3, rowSpec: (v: number) => { pin: number; maxDist: number }, opts: Partial<ClothSimOut> = {}): ClothSimOut {
  const points: number[] = [], pin: number[] = [], maxDist: number[] = [];
  for (let j = 0; j < rows; j++) {
    const v = j / (rows - 1), r = rowSpec(v);
    for (let i = 0; i < cols; i++) {
      const p = f(i / cols, v);
      points.push(+p[0].toFixed(5), +p[1].toFixed(5), +p[2].toFixed(5));
      pin.push(+r.pin.toFixed(3)); maxDist.push(+r.maxDist.toFixed(4));
    }
  }
  return { name, material, cols, rows, wrapU: true, points, pin, maxDist, drive: 2.5, stretch: 2e-6, bend: 4e-4, damping: 1.2, radius: 0.008, ...opts };
}
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
  /** Garments the game simulates as cloth. */
  clothSims: ClothSimOut[];
  sockets: { name: string; bone: string; at: Vec3; x: Vec3; y: Vec3 }[];
  pieces: WardrobePiece[];
}

const ERA = 'Momoyama (late 16th c.)';
const REF_TOSEI = ['紺糸威南蛮胴具足, Azuchi-Momoyama, Japan Search', 'Tachidō tosei-gusoku, Momoyama–Edo, Wikimedia Commons'];

/**
 * The armour's shape as numbers a fit can move (scripts/eraclash3d/forgeArmourFit.ts searches them against the art; the
 * fitted values live in scripts/eraclash3d/data/haru_armour_fit.json).
 */
export interface ArmourFit {
  /** Dō: the bottom and top of the laced rows, and the stand-off from the body. */
  doBottom: number; doTop: number; doClear: number;
  /** Kusazuri: height of each lame, how much each lame flares out past the one above, stand-off from the dō. */
  kusaLameH: number; kusaFlare: number; kusaClear: number;
  /** How many tassets hang round the waist (the flat-lay shows six). */
  kusaCount: number;
  /** Sode: where the top lame hangs (x out, y up, z), its outward lean (degrees), lame height, width, collision radius. */
  sodeX: number; sodeY: number; sodeZ: number; sodeOut: number; sodeLameH: number; sodeW: number; sodeR: number;
  /** Hakama: how full it blouses to the side and to the front and back (metres off the leg at its fullest). */
  hakLat: number; hakFB: number;
  /** The scabbard in the obi: degrees below level, and degrees out from straight back. */
  sayaDown: number; sayaOut: number;
  /** Hakama: how much of the fullness the inner side of each leg keeps away (1: none there, the legs part; 0: as full as outside). */
  hakInner: number;
  /** Eri (the kosode collar): its centre height at the back of the neck, its band height, how far it stands off the neck. */
  eriY: number; eriH: number; eriOut: number;
  /** Watagami: how high the shoulder straps ride over the body (padding and all), how wide they run out from the neck, how far the kohire turn up. */
  wataRise: number; wataW: number; kohire: number;
  /** Suneate: how far the splints stand off the shin (over the kyahan wrap). Hakama: the height it is gathered at, into the greaves. */
  greave: number; hakGather: number;
  /** Kosode sleeves: fullness under the sode, and how much more they billow toward the hem. */
  sleeveTop: number; sleeveFull: number;
  /** Uwa-obi: the sash's centre height, its band height, its stand-off from the dō. */
  obiY: number; obiH: number; obiOut: number;
  /** The dō's kebiki lacing: each cord's width and how far it stands off the plate (the art's lacing reads flat). */
  odoshiW: number; odoshiT: number;
}
export const ARMOUR_FIT_DEFAULT: ArmourFit = {
  doBottom: 1.035, doTop: 1.36, doClear: 0.03,
  kusaLameH: 0.058, kusaFlare: 0.008, kusaClear: 0.012, kusaCount: 6,
  sodeX: 0.215, sodeY: 1.5, sodeZ: -0.005, sodeOut: 14, sodeLameH: 0.046, sodeW: 0.24, sodeR: 0.025,
  hakLat: 0.108, hakFB: 0.13,
  // measured on the turnaround: hilt up and forward at the left hip, the scabbard 44° down and 28° out behind him
  sayaDown: 44, sayaOut: 28,
  hakInner: 0.92,
  eriY: 1.505, eriH: 0.036, eriOut: 0.011,
  wataRise: 0.025, wataW: 0.1, kohire: 0.035,
  greave: 0.042, hakGather: 0.47,
  sleeveTop: 0, sleeveFull: 0.03,
  obiY: 1.02, obiH: 0.06, obiOut: 0.012,
  odoshiW: 0.0075, odoshiT: 0.0022,
};

// ---- The piece library --------------------------------------------------------------------------------------------
/**
 * Every piece the wardrobe can build, in build order, with the fit parameters it reads. A character's kit is a list of
 * these (a preset, or the spec's own list): pieces left out are never built, rigged or simulated, and the fit searches
 * only the parameters of the pieces worn. `body` pieces are cut from the body's own skin (they inherit its weights and
 * correctives); the rest are built over its field.
 */
export const PIECES: Record<string, { params: (keyof ArmourFit)[]; body?: boolean; note: string }> = {
  do: { params: ['doBottom', 'doTop', 'doClear', 'odoshiW', 'odoshiT'], note: 'cuirass of laced kozane rows' },
  watagami: { params: ['wataRise', 'wataW', 'kohire'], note: 'shoulder straps with kohire flaps (wants do)' },
  kusazuri: { params: ['kusaLameH', 'kusaFlare', 'kusaClear', 'kusaCount'], note: 'tassets on spring chains (hang from do)' },
  sode: { params: ['sodeX', 'sodeY', 'sodeZ', 'sodeOut', 'sodeLameH', 'sodeW', 'sodeR'], note: 'shoulder guards on spring chains' },
  kote: { params: [], note: 'armoured sleeves: splints and hand plate (the cloth under them is cut from the body)' },
  haidate: { params: [], note: 'thigh apron of small plates' },
  suneate: { params: ['greave'], note: 'greaves over the kyahan wrap (cut from the body)' },
  hakama: { params: ['hakLat', 'hakFB', 'hakInner', 'hakGather'], note: 'ballooning trousers, cloth' },
  eri: { params: ['eriY', 'eriH', 'eriOut'], note: 'the kosode collar' },
  kosode: { params: ['sleeveTop', 'sleeveFull'], note: 'the robe: torso cut from the body, sleeves as cloth' },
  obi: { params: ['obiY', 'obiH', 'obiOut'], note: 'sash, holds the swords' },
  hachimaki: { params: [], note: 'headband' },
  waraji: { params: [], note: 'straw sandals' },
  tabi: { params: [], body: true, note: 'split-toe socks (cut from the body)' },
  katana: { params: ['sayaDown', 'sayaOut'], note: 'katana in hand, saya in the obi (wants obi)' },
  kabuto: { params: [], note: 'helmet (hidden unless the game asks)' },
};
/** Kits as piece lists. A spec names one ("kit": "tosei-gusoku") or composes its own ({ preset, pieces, add, without }). */
export const KIT_PRESETS: Record<string, string[]> = {
  'tosei-gusoku': ['do', 'watagami', 'kusazuri', 'sode', 'kote', 'suneate', 'hakama', 'eri', 'kosode', 'obi', 'hachimaki', 'waraji', 'tabi', 'katana', 'kabuto'],
  // the same man out of armour: a ronin's kosode, hakama and sash, his sword in it
  'kosode-hakama': ['hakama', 'eri', 'kosode', 'obi', 'hachimaki', 'waraji', 'tabi', 'katana'],
};
export type KitSpec = string | { preset?: string; pieces?: string[]; add?: string[]; without?: string[] };
/** A kit spec resolved to its pieces, in build order. */
export function kitPieces(kit: KitSpec): string[] {
  const k = typeof kit === 'string' ? { preset: kit } : kit;
  if (k.preset && !KIT_PRESETS[k.preset]) throw new Error(`unknown kit preset ${k.preset} (have ${Object.keys(KIT_PRESETS).join(', ')})`);
  const want = new Set([...(k.pieces ?? KIT_PRESETS[k.preset ?? ''] ?? []), ...(k.add ?? [])]);
  for (const x of k.without ?? []) want.delete(x);
  for (const x of want) if (!PIECES[x]) throw new Error(`unknown piece ${x} (have ${Object.keys(PIECES).join(', ')})`);
  if (process.env.FORGE_HAIDATE === '1') want.add('haidate');
  return Object.keys(PIECES).filter((p) => want.has(p));
}
/** The search's step, minimum and maximum for each fit parameter (forgeArmourFit.ts). */
export const FIT_STEPS: Partial<Record<keyof ArmourFit, [number, number, number]>> = {
  doBottom: [0.02, 0.95, 1.1], doTop: [0.02, 1.3, 1.42], doClear: [0.01, 0.015, 0.06],
  kusaLameH: [0.006, 0.04, 0.08], kusaFlare: [0.004, 0, 0.025], kusaClear: [0.006, 0, 0.04],
  sodeX: [0.02, 0.17, 0.3], sodeY: [0.02, 1.42, 1.54], sodeZ: [0.02, -0.06, 0.05], sodeOut: [6, -5, 35],
  sodeLameH: [0.005, 0.03, 0.06], sodeW: [0.03, 0.16, 0.32], sodeR: [0.008, 0.01, 0.05],
  hakLat: [0.015, 0.04, 0.16], hakFB: [0.015, 0.05, 0.18], hakInner: [0.15, 0, 1], sayaDown: [4, 20, 65], sayaOut: [5, 0, 50],
  eriY: [0.015, 1.48, 1.6], eriH: [0.012, 0.025, 0.09], eriOut: [0.006, 0.004, 0.04],
  wataRise: [0.01, 0, 0.07], wataW: [0.02, 0.06, 0.16], kohire: [0.015, 0, 0.08],
  greave: [0.008, 0.015, 0.06], hakGather: [0.02, 0.38, 0.56],
  sleeveTop: [0.012, 0, 0.06], sleeveFull: [0.012, 0, 0.08],
  obiY: [0.015, 0.95, 1.1], obiH: [0.012, 0.035, 0.1], obiOut: [0.008, 0, 0.04],
};
/** The fit parameters a kit's pieces read (the tasset count is the art's, never searched). */
export const fitParamsOf = (pieces: string[]) => pieces.flatMap((p) => PIECES[p].params).filter((k) => k !== 'kusaCount' && FIT_STEPS[k]);

/** Build a kit: the pieces named, fitted to this body. */
export function buildKit(anatomy: HumanAnatomy, field: Field, pieces: string[], fitIn: Partial<ArmourFit> = {}): Wardrobe {
  const fit: ArmourFit = { ...ARMOUR_FIT_DEFAULT, ...fitIn };
  orientTo(field);
  try { return kitOf(anatomy, field, fit, new Set(pieces)); } finally { orientTo(null); }
}
/** Haru's tosei-gusoku (the first kit; for callers that predate the piece library). */
export const buildHaruKit = (anatomy: HumanAnatomy, field: Field, fitIn: Partial<ArmourFit> = {}) => buildKit(anatomy, field, KIT_PRESETS['tosei-gusoku'], fitIn);

function kitOf(anatomy: HumanAnatomy, field: Field, fit: ArmourFit, wanted: Set<string>): Wardrobe {
  const J = (n: HumanJoint) => anatomy.byName[n].at;
  const w: Wardrobe = {
    armour: new Map(), cloth: new Map(), lacing: [], kabuto: new Map(), hair: new MeshBuilder(),
    bones: [], springs: [], clothChains: new Map(), clothSims: [], sockets: [], pieces: [],
  };
  let current = '';
  // a piece not worn builds into a sink (its section still runs: later pieces read the measures it takes); whatever it
  // adds to the rig (bones, springs, cloth, sockets) is dropped at the end
  const on = () => current === '' || wanted.has(current);
  const sink = () => { const m = new MeshBuilder(); m.tag = current; return m; };
  const A = (mat: string) => { if (!on()) return sink(); let m = w.armour.get(mat); if (!m) { m = new MeshBuilder(); w.armour.set(mat, m); } m.tag = current; return m; };
  const Cl = (mat: string) => { if (!on()) return sink(); let m = w.cloth.get(mat); if (!m) { m = new MeshBuilder(); w.cloth.set(mat, m); } m.tag = current; return m; };
  const K = (mat: string) => { if (!on()) return sink(); let m = w.kabuto.get(mat); if (!m) { m = new MeshBuilder(); w.kabuto.set(mat, m); } m.tag = current; return m; };
  const owner = new Map<object, string>();
  for (const arr of [w.bones, w.springs, w.clothSims, w.sockets] as object[][]) {
    const push = arr.push.bind(arr);
    arr.push = (...items: object[]) => { for (const it of items) owner.set(it, current); return push(...items); };
  }
  const piece = (id: string, label: string, refs = REF_TOSEI) => { current = id; if (wanted.has(id)) w.pieces.push({ id, label, era: ERA, refs }); };
  const cord = new Map<string, { t: number[]; r: number[]; s: number[] }>();
  /** One lacing stitch: centre, along (the cord's run), out (the plate normal), width and length. */
  const stitch = (bone: string, c: Vec3, along: Vec3, out: Vec3, width: number, length: number, thick = 0.0022) => {
    if (!on()) return;
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
  const doRows = 7, yBottom = fit.doBottom, yTop = fit.doTop, rowH = (yTop - yBottom) / doRows;
  const rowBone = (i: number): HumanJoint => (i < 2 ? 'Spine' : i < 4 ? 'Spine1' : 'Spine2');
  const sections = new Map<number, ReturnType<typeof trunkSection>>();
  const sec = (y: number) => { const k = Math.round(y * 200); let s = sections.get(k); if (!s) { s = trunkSection(field, k / 200); sections.set(k, s); } return s; };
  const doClear = fit.doClear;
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
    plate(A('lacquer'), cols * 2, 2, ringAt, 0.004, bone, [3, 0.05]);
    // gold edge on the top row (the munaita's lower rim) and the waist
    if (i === doRows - 1 || i === 0) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 64; k++) { const p = ringAt(k / 64, i === 0 ? 0 : 1); pts.push(p); }
      tube(A('gold'), pts, 0.0035, 4, bone);
    }
    // kebiki lacing: one stitch per scale pair down the visible face of the row
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols;
      const top = ringAt(u, 0.92), bot = ringAt(u, 0.12);
      const a = u * Math.PI * 2;
      const outN: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      stitch(bone, add(lerp(top, bot, 0.5), mul(outN, 0.0015 + fit.odoshiT)), sub(top, bot), outN, fit.odoshiW, len(sub(top, bot)), fit.odoshiT);
    }
  }
  // munaita (chest plate) and oshitsuke-ita (back plate): solid lacquered plates over the top row, gold-rimmed
  for (const side of [1, -1]) {
    const bone: HumanJoint = 'Spine2';
    const y0 = yTop - 0.004, y1 = yTop + (side > 0 ? 0.065 : 0.085); // the chest plate, the back plate a little higher
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
  // watagami: the shoulder straps from the back plate over the shoulders to the chest plate. On a tosei-gusoku they
  // are wide lacquered plates on padding, riding high against the collar, with a kohire (a small upturned flap) at
  // each outer end: the shoulder line the art draws rising to the neck.
  piece('watagami', 'Watagami (shoulder straps): lacquered plates over the shoulders, kohire flaps at their outer ends');
  for (const sx of [1, -1]) {
    // the body's top at (x, z): marched down from above the shoulder (below the jaw, so the head is never met)
    const topAt = (x: number, z: number) => { for (let y = 1.56; y > 1.3; y -= 0.0025) if (field.d(x, y, z) < 0) return y; return 1.3; };
    const xIn = 0.07, xOut = 0.07 + fit.wataW;
    const f = (u: number, v: number): Vec3 => {
      const z = -0.12 + u * 0.22;                     // back → front
      const x = sx * (xIn + (xOut - xIn) * v);        // neck side → shoulder
      // over the trapezius at the padding's height, rounding down over the front and back (where they meet the plates)
      const ends = Math.sin(u * Math.PI) ** 0.35;
      return [x, topAt(x, z) + 0.012 + fit.wataRise * ends * (1 - 0.5 * v), z];
    };
    plate(A('lacquer'), 14, 4, f, 0.005, 'Spine2', [0.3, 0.08]);
    const rim: Vec3[] = []; for (let k = 0; k <= 14; k++) rim.push(f(k / 14, 0)); tube(A('gold'), rim, 0.003, 4, 'Spine2');
    const rimO: Vec3[] = []; for (let k = 0; k <= 14; k++) rimO.push(f(k / 14, 1)); tube(A('gold'), rimO, 0.003, 4, 'Spine2');
    // kohire: front and back of the outer end, turned up and out
    for (const u0 of [0.28, 0.72]) {
      const base = f(u0, 1);
      const g = (a: number, b: number): Vec3 => {
        const lift = fit.kohire * b;
        return [base[0] + sx * (0.012 + 0.03 * b), base[1] - 0.01 + lift, base[2] + (a - 0.5) * 0.07 * (1 - 0.35 * b)];
      };
      plate(A('lacquer'), 6, 3, g, 0.004, 'Spine2', [0.1, 0.05]);
      const edge: Vec3[] = []; for (let k = 0; k <= 6; k++) edge.push(g(k / 6, 1)); tube(A('gold'), edge, 0.003, 4, 'Spine2');
    }
  }
  for (const [b, l] of cord) w.lacing.push({ bone: b, ...l });

  // ---- Kusazuri: seven tassets on spring chains -----------------------------------------------------------------------
  piece('kusazuri', 'Kusazuri (tassets): seven columns of five lames, laced, on spring chains');
  const tassets = Math.round(fit.kusaCount), lames = 5, lameH = fit.kusaLameH, kTop = yBottom + 0.004;
  const kBottom = kTop - lames * (lameH - 0.008) - 0.008;
  const hipSec = sec(0.93), waistSec = sec(kTop);
  for (let i = 0; i < tassets; i++) {
    const a0 = Math.PI / 2 + (i / tassets) * Math.PI * 2;
    const span = (Math.PI * 2) / tassets * 1.06; // a little overlap
    const chain: string[] = [];
    for (let j = 0; j < lames; j++) {
      const name = `Kusazuri${i}_${j}`;
      const yTopJ = kTop - j * (lameH - 0.008);
      const r = Math.max(waistSec.radius(a0), hipSec.radius(a0)) + doClear + fit.kusaClear + j * fit.kusaFlare;
      const at: Vec3 = [Math.cos(a0) * r, yTopJ, waistSec.cz + Math.sin(a0) * r];
      w.bones.push({ name, parent: j ? `Kusazuri${i}_${j - 1}` : 'Spine', at });
      chain.push(name);
      const f = (u: number, v: number): Vec3 => {
        const a = a0 + (u - 0.5) * span * (1 + j * 0.03);
        const rr = Math.max(waistSec.radius(a), hipSec.radius(a)) + doClear + fit.kusaClear + j * fit.kusaFlare + (1 - v) * 0.006;
        const tooth = v > 0.97 ? 0.0035 * Math.abs(Math.sin(u * 14 * Math.PI)) : 0;
        return [Math.cos(a) * rr, yTopJ - lameH + v * lameH + tooth, waistSec.cz + Math.sin(a) * rr];
      };
      plate(A('lacquer'), 28, 2, f, 0.004, name, [0.16, 0.06]);
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
        for (let k = 0; k <= 12; k++) pts.push(f(k / 12, 0));
        tube(A('gold'), pts, 0.0035, 4, name);
      }
    }
    // (a collision radius as thick as the hakama on the thigh: a lifted knee pushes the tasset out over the cloth)
    w.springs.push({ bones: chain, stiffness: 22, drag: 0.18, gravity: 9.8, radius: 0.05, maxAngle: 22 });
  }

  // ---- Sode: shoulder guards on spring chains ------------------------------------------------------------------------
  piece('sode', 'Sode (shoulder guards): seven lames, laced, hung from the watagami on spring chains');
  for (const s of ['Left', 'Right'] as const) {
    const sx = s === 'Left' ? 1 : -1;
    const hang = norm([sx * Math.sin((fit.sodeOut * Math.PI) / 180), -Math.cos((fit.sodeOut * Math.PI) / 180), 0]);
    const outN = norm([sx * Math.cos((fit.sodeOut * Math.PI) / 180), Math.sin((fit.sodeOut * Math.PI) / 180), 0]);
    // hung high, their tops level with the base of the neck, as the turnaround draws them (forgeSilhouette.ts)
    const root: Vec3 = [sx * fit.sodeX, fit.sodeY, fit.sodeZ];
    const chain: string[] = [];
    const n = 7, h = fit.sodeLameH, width = fit.sodeW;
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
      plate(A('lacquer'), 24, 2, f, 0.004, name, [0.24, 0.05]);
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
      if (j === n - 1) { const pts: Vec3[] = []; for (let k = 0; k <= 12; k++) pts.push(f(k / 12, 0)); tube(A('gold'), pts, 0.0035, 4, name); }
      if (j === 0) { const pts: Vec3[] = []; for (let k = 0; k <= 12; k++) pts.push(f(k / 12, 1)); tube(A('gold'), pts, 0.004, 4, name); }
    }
    w.springs.push({ bones: chain, stiffness: 18, drag: 0.18, gravity: 9.8, radius: fit.sodeR, maxAngle: 26 });
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
      plate(A('lacquer'), 10, 3, f, 0.003, `${s}ForeArm`, [0.2, 0.04]); // red lacquered, as the art paints them
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
    plate(A('lacquerBlack'), 8, 6, f, 0.0025, `${s}Hand`, [0.1, 0.07]);
    const rim: Vec3[] = []; for (let k = 0; k <= 8; k++) rim.push(f(1, k / 8)); tube(A('gold'), rim, 0.0025, 5, `${s}Hand`);
  }

  // ---- Haidate: the thigh apron of small plates ---------------------------------------------------------------------
  // Haru's art shows none: below the kusazuri it is the hakama itself (FORGE_HAIDATE=1 puts it back)
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
  // standoff of the splints from the shin: over thickly wrapped kyahan, as bulky as the turnaround draws them
  const GREAVE = fit.greave;
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
        return add(c, mul(dir, reach(field, c, dir, 0.15) + GREAVE));
      };
      plate(A(k % 2 ? 'lacquer' : 'lacquerBlack'), 3, 8, f, 0.003, `${s}Leg`, [0.04, 0.3]); // red and black bands, as the art
    }
    // tateage: the knee plate
    const f = (u: number, v: number): Vec3 => {
      const c = lerp(knee, ankle, -0.04 + (1 - v) * 0.16);
      const a = (u - 0.5) * 1.6;
      const dir: Vec3 = norm([Math.sin(a) * sx, 0.1, Math.cos(a)]);
      return add(c, mul(dir, reach(field, c, dir, 0.15) + GREAVE + 0.009));
    };
    plate(A('lacquer'), 10, 4, f, 0.004, `${s}Leg`, [0.12, 0.08]);
    const rim: Vec3[] = []; for (let k = 0; k <= 10; k++) rim.push(f(k / 10, 1)); tube(A('gold'), rim, 0.003, 5, `${s}Leg`);
    // the ties above the ankle: red cord wrapped twice
    for (const yy of [0.2, 0.62]) {
      const c = lerp(knee, ankle, 0.12 + yy * 0.72);
      const pts: Vec3[] = [];
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI * 2; const dir: Vec3 = [Math.sin(a), 0, Math.cos(a)]; pts.push(add(c, mul(dir, reach(field, c, dir, 0.15) + GREAVE + 0.005))); }
      tube(A('silkRed'), pts, 0.003, 5, `${s}Leg`);
    }
  }

  // ---- Cloth -----------------------------------------------------------------------------------------------------
  piece('hakama', 'Hakama: pleated trousers, ballooning to the knee and gathered into the greaves', ['Tachidō tosei-gusoku, Momoyama–Edo, Wikimedia Commons']);
  for (const s of ['Left', 'Right'] as const) {
    const sx = s === 'Left' ? 1 : -1;
    const hip = J(`${s}UpLeg` as HumanJoint), knee = J(`${s}Leg` as HumanJoint), ankle = J(`${s}Foot` as HumanJoint);
    // gathered just under the knee into the greaves' top, as the turnaround has it (fitted with forgeSilhouette.ts)
    const yTopH = 1.0, yGather = fit.hakGather;
    // the leg's centre line at a height
    const centre = (y: number): Vec3 => {
      if (y >= knee[1]) return lerp(knee, hip, (y - knee[1]) / (hip[1] - knee[1]));
      return lerp(ankle, knee, (y - ankle[1]) / (knee[1] - ankle[1]));
    };
    const mb = Cl('hakama');
    const nu = 40, nv = 28;
    /**
     * How far the cloth stands off the leg: bloused over the gather (fullest a hand above it), easing to the thigh, a
     * little flare under the dō. Fuller front and back than to the side (the art's profile is the widest view).
     */
    const balloon = (y: number, a: number) => {
      const t = (y - yGather) / (yTopH - yGather);
      const rise = t < 0.1 ? Math.sin((t / 0.1) * Math.PI / 2) ** 0.5 : 1 - 0.62 * smooth01((t - 0.1) / 0.75);
      const amp = fit.hakLat * Math.sin(a) ** 2 + fit.hakFB * Math.cos(a) ** 2;
      // (the gather itself stands off the bulky greaves' top: the knee plate tucks up under the blouse)
      return 0.012 + 0.03 * (1 - smooth01(t / 0.3)) + amp * rise + (t > 0.85 ? (t - 0.85) * 0.12 : 0);
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
      // (almost no fullness on the inner side: the legs part below the tassets, as the art's front view shows)
      const inner = Math.min(1, Math.max(0, -Math.sin(a)) * 1.25) * fit.hakInner;
      const pleat = Math.cos(a) > 0.2 ? 0.004 * Math.sin(u * 5 * Math.PI * 2) : 0;
      // under the tassets the cloth is gathered in close to the thigh (it moves with the thigh, and a full hakama there
      // swung out through them with every step) and never past their inner face; from their hem down it blouses freely
      const under = smooth01((y - (kBottom - 0.06)) / 0.08);
      const r = ringAt(v)(a) + balloon(y, a) * (1 - inner) * (1 - 0.75 * under) + 0.008 + pleat;
      const p = add(c, mul(dir, r));
      if (under > 0) {
        const ab = Math.atan2(p[2] - waistSec.cz, p[0]);
        const lim = Math.max(waistSec.radius(ab), hipSec.radius(ab)) + doClear + 0.004;
        const rb = Math.hypot(p[0], p[2] - waistSec.cz);
        if (rb > lim) { const k = 1 - (1 - lim / rb) * under; p[0] *= k; p[2] = waistSec.cz + (p[2] - waistSec.cz) * k; }
      }
      return p;
    };
    sheet(mb, nu, nv, f, `${s}UpLeg`, [1.2, 0.8]);
    // the leg as cloth: tied under the dō at the top, gathered into the greaves at the bottom, the balloon between free
    // to swing (most at the knee and below, where the leg moves most inside it)
    w.clothSims.push(clothGrid(`hakama${s[0]}`, 'hakama', 18, 12, f, (v) => {
      const y = yGather + (yTopH - yGather) * v;
      const tied = v < 0.03 || v > 0.94 ? 1 : 0;
      // under the tassets it may only shift a little (they hang over it: a free swing there pushed it out through them)
      const underK = 1 - 0.85 * smooth01((y - (kBottom - 0.07)) / 0.06);
      return { pin: tied, maxDist: tied ? 0 : 0.075 * Math.sin(Math.PI * Math.min(1, (y - yGather) / (0.95 - yGather))) ** 0.5 * underK };
    }, { drive: 3, damping: 1.4, radius: 0.012 }));
  }
  // ---- Eri: the kosode's collar, high round the neck and crossing in a V under the chin (left over right) ----------
  piece('eri', 'Eri: the kosode collar, standing round the back of the neck and crossing left over right at the chest');
  {
    const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
    for (const lapel of [1, -1]) { // +1 the wearer's left, on top; -1 the right, under it
      const end = Math.PI + 0.32;
      const f = (u: number, v: number): Vec3 => {
        const phi = u * end;                       // round from the back of the neck
        const a = -Math.PI / 2 + lapel * phi;      // a = π/2 is the front
        // high at the back, a little lower at the sides, then down the chest to the V
        const yc = phi <= Math.PI / 2 ? fit.eriY - 0.03 * smooth(phi / (Math.PI / 2)) : fit.eriY - 0.03 - ((phi - Math.PI / 2) / (Math.PI / 2)) * (fit.eriY - 1.42);
        const y = yc + (v - 0.5) * fit.eriH;
        const sc = sec(y);
        const r = sc.radius(a) + fit.eriOut + (lapel > 0 ? 0.004 : 0) + (1 - v) * 0.003;
        return [Math.cos(a) * r, y, sc.cz + Math.sin(a) * r];
      };
      sheet(Cl('kosode'), 40, 4, f, 'Spine2', [0.6, 0.04]);
    }
  }

  piece('kosode', 'Kosode: the inner robe, its sleeves tied short over the kote, sleeve hems on spring chains', ['Kosode, Momoyama period, the Met']);
  for (const s of ['Left', 'Right'] as const) {
    const sh = J(`${s}Arm` as HumanJoint), el = J(`${s}ForeArm` as HumanJoint);
    const axis = norm(sub(el, sh));
    const ref: Vec3 = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const e1 = norm(cross(axis, ref)), e2 = cross(e1, axis);
    const t0 = -0.08, t1 = 0.62;
    const mb = Cl('kosode');
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
      // (sleeveFull: how much the sleeve billows past that; sleeveTop: how full it is already under the sode)
      const r = sec(a) + 0.016 + fit.sleeveTop * (1 - v) + fit.sleeveFull * smooth01((t - 0.1) / 0.5) + Math.max(0, Math.sin(a)) * 0.012 * v;
      return add(c, mul(dir, r));
    };
    sheet(mb, nu, nv, f, `${s}Arm`, [0.6, 0.4]);
    // the sleeve as cloth: sewn to the body at the shoulder, the rest hanging and swinging, most at the hem
    w.clothSims.push(clothGrid(`sleeve${s[0]}`, 'kosode', 14, 8, f, (v) => ({
      pin: v < 0.16 ? 1 : 0,
      maxDist: v < 0.16 ? 0 : 0.085 * Math.min(1, (v - 0.16) / 0.84) ** 0.8,
    }), { drive: 2, damping: 1.1, radius: 0.01 }));
  }
  piece('obi', 'Uwa-obi: the outer sash over the dō, holding the swords');
  {
    const mb = Cl('obi');
    const y0 = fit.obiY - fit.obiH / 2, y1 = fit.obiY + fit.obiH / 2;
    sheet(mb, 72, 3, (u, v) => {
      const a = u * Math.PI * 2;
      const y = y0 + (y1 - y0) * v;
      const s = sec(y);
      const r = s.radius(a) + doClear + fit.obiOut;
      return [Math.cos(a) * r, y, s.cz + Math.sin(a) * r];
    }, 'Spine', [2, 0.1]);
    // the knot at the front left, with two hanging ends
    const knot: Vec3 = [0.07, fit.obiY, sec(fit.obiY).cz + sec(fit.obiY).radius(Math.PI / 2 - 0.4) + 0.05];
    tube(mb, [add(knot, [-0.02, 0, 0]), add(knot, [0.02, 0, 0.004])], 0.022, 10, 'Spine', 0.6);
    for (const [dx, l] of [[0.0, 0.16], [0.03, 0.12]] as const) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 8; k++) pts.push(add(knot, [dx + k * 0.002, -k * (l / 8), 0.008 + k * 0.001]));
      tube(mb, pts, 0.016, 6, 'Hips', 0.25);
    }
  }

  // ---- Hachimaki: the navy headband of the turnaround and the flat-lay, tied at the back with two tails --------------
  piece('hachimaki', 'Hachimaki: navy cotton headband, knotted at the back, two short tails');
  {
    const browY = anatomy.face[9][1];
    const front = anatomy.face[10];
    const c: Vec3 = [0, browY + 0.045, front[2] - 0.1];
    const ringAt = (a: number, lift: number): Vec3 => {
      const y = c[1] + 0.012 * Math.cos(a); // a little higher over the brow than at the nape
      const o: Vec3 = [0, y, c[2]];
      const dir: Vec3 = [Math.sin(a), 0, Math.cos(a)];
      return add(o, mul(dir, reach(field, o, dir, 0.2) + lift));
    };
    sheet(A('kosode'), 64, 2, (u, v) => { const p = ringAt(u * Math.PI * 2, 0.006); return [p[0], p[1] - 0.012 + v * 0.024, p[2]]; }, 'Head', [1.5, 0.05]);
    const knot = ringAt(Math.PI, 0.016);
    tube(A('kosode'), [add(knot, [-0.015, 0, 0]), add(knot, [0.015, 0, 0])], 0.012, 8, 'Head', 0.7);
    for (const sx of [1, -1]) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 6; k++) pts.push(add(knot, [sx * (0.01 + k * 0.006), -k * 0.011, -0.004 - k * 0.002]));
      tube(A('kosode'), pts, (t) => 0.007 * (1 - t * 0.3), 5, 'Head', 0.3);
    }
  }

  // ---- Waraji: straw sandals under the feet, navy cords from the toe post round the ankle ----------------------------
  piece('waraji', 'Waraji: woven straw sandals, tied with navy cord');
  for (const s of ['Left', 'Right'] as const) {
    const foot = J(`${s}Foot` as HumanJoint), toe = J(`${s}ToeBase` as HumanJoint);
    const tip = anatomy.byName[`${s}ToeBase` as HumanJoint].tip;
    const x = (foot[0] + toe[0]) / 2, z0 = foot[2] - 0.075, z1 = tip[2] + 0.02, zt = toe[2] - 0.01;
    for (const [za, zb, bone] of [[z0, zt, `${s}Foot`], [zt, z1, `${s}ToeBase`]] as const) {
      plate(A('straw'), 6, 8, (u, v) => {
        const z = za + (zb - za) * v;
        const t = (z - z0) / (z1 - z0);
        const half = 0.044 * Math.sqrt(Math.max(0.15, Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95))));
        return [x + (u - 0.5) * 2 * half, 0.012, z];
      }, 0.011, bone, [0.1, 0.25]);
    }
    // the cords: from the toe post up over the instep to loops either side of the heel, and round the ankle
    const post: Vec3 = [x + (s === 'Left' ? -0.012 : 0.012), 0.022, z1 - 0.06];
    for (const side of [1, -1]) {
      const loop: Vec3 = [x + side * 0.046, 0.03, foot[2] - 0.02];
      tube(A('silk'), [post, [x + side * 0.03, 0.055, (post[2] + loop[2]) / 2], loop], 0.0045, 5, `${s}Foot`);
    }
    const ring: Vec3[] = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([foot[0] + Math.cos(a) * 0.045, foot[1] + 0.005, foot[2] + Math.sin(a) * 0.045]); }
    tube(A('silk'), ring, 0.004, 5, `${s}Foot`);
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
  const dn = (fit.sayaDown * Math.PI) / 180, ou = (fit.sayaOut * Math.PI) / 180;
  const sayaDir = norm([Math.cos(dn) * Math.sin(ou), -Math.sin(dn), -Math.cos(dn) * Math.cos(ou)]);
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
  current = ''; // (the character's own, whatever he wears)
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
  // what pieces not worn added to the rig goes (hands keep their grip sockets: any character can be handed a weapon)
  const keep = (it: object) => { const o = owner.get(it) ?? ''; return o === '' || wanted.has(o) || /^socket_hand/.test((it as { name?: string }).name ?? ''); };
  for (const arr of [w.bones, w.springs, w.clothSims, w.sockets] as object[][]) { const k = arr.filter(keep); arr.length = 0; Array.prototype.push.apply(arr, k); }
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
