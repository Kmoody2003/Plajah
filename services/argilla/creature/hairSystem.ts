/**
 * hairSystem.ts — hair as strand cards, the way current-gen game hair is built (docs/character-forge.md).
 *
 * - Guide strands grow from roots on the scalp and run over it (a few millimetres above, in layers) to where the style
 *   gathers them; loose locks hang free.
 * - Each guide becomes a ribbon card: it lies along the scalp near the root and turns to face out as it leaves it,
 *   tapering to the tip. u runs across the card, v from root (0) to tip (1).
 * - A strand atlas (generated here, no stock art) gives each card one of several clump patterns: thin strands with
 *   alpha, darker at the root. The material is alpha-tested, double-sided and anisotropic (KHR_materials_anisotropy),
 *   so the highlight runs across the strands as it does on real hair.
 * - Anything that hangs (a topknot, loose locks) is bound to spring chains so the engine's springs move it.
 *
 * The scalp is described by an ellipsoid fitted to the head, so the same code styles any head the Forge makes.
 */
import type { Vec3 } from '../engine';
import { MeshBuilder, tube } from './wardrobe';

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const dirOf = (a: number, e: number): Vec3 => [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];

/** The scalp as an ellipsoid: centre and radii in metres (x across, y up, z forward). */
export interface Scalp { centre: Vec3; radii: Vec3 }

/**
 * Fit the scalp to the cranium: the head's vertices above the brow (no nose, no ears, no jaw). Centred at the brow,
 * so elevation 0 runs round the head at brow height and the nape lies below it.
 */
export function fitScalp(positions: Float32Array, crownY: number, browY: number): Scalp {
  let rx = 0, zmin = Infinity, zmax = -Infinity, top = -Infinity;
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    if (y < browY + 0.02 || y > crownY) continue;
    if (y > browY + 0.04) rx = Math.max(rx, Math.abs(x));
    if (Math.abs(x) < 0.04) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    top = Math.max(top, y);
  }
  return { centre: [0, browY, (zmin + zmax) / 2], radii: [rx, top - browY, (zmax - zmin) / 2] };
}

/** A point on the scalp at azimuth a (0 = front, + toward the subject's left) and elevation e, lifted by `lift`. */
export function scalpPoint(s: Scalp, a: number, e: number, lift = 0): { p: Vec3; n: Vec3 } {
  const d: Vec3 = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const p: Vec3 = [s.centre[0] + d[0] * s.radii[0], s.centre[1] + d[1] * s.radii[1], s.centre[2] + d[2] * s.radii[2]];
  const n = norm([d[0] / s.radii[0], d[1] / s.radii[1], d[2] / s.radii[2]]);
  return { p: add(p, mul(n, lift)), n };
}

export interface Guide {
  points: Vec3[];
  /** Direction the card faces at each point (the scalp normal near the root, then outward). */
  facing: Vec3[];
  width: number;
  /** Bone for each point (rigid on the head, or a spring chain for what hangs). */
  bones: string[];
}

/** One ribbon card per guide, tapering, with its UV column picked from the atlas. */
export function cards(mb: MeshBuilder, guides: Guide[], atlasColumns: number, seed = 7) {
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (const g of guides) {
    const col = Math.floor(rand() * atlasColumns);
    const u0 = col / atlasColumns, u1 = (col + 1) / atlasColumns;
    const base = mb.count;
    const n = g.points.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const along = norm(sub(g.points[Math.min(n - 1, i + 1)], g.points[Math.max(0, i - 1)]));
      const across = norm(cross(along, g.facing[i]));
      const facing = norm(cross(across, along));
      const w = g.width * (1 - 0.65 * t * t) * Math.min(1, 0.35 + t * 3) * 0.5;
      mb.vert(add(g.points[i], mul(across, -w)), facing, u0, t, g.bones[i]);
      mb.vert(add(g.points[i], mul(across, w)), facing, u1, t, g.bones[i]);
    }
    for (let i = 0; i < n - 1; i++) { const a = base + i * 2; mb.quad(a, a + 1, a + 3, a + 2); }
  }
}

/**
 * The strand atlas: `columns` clump patterns side by side, each many thin strands with alpha, darker toward the root
 * (v = 0 at the top of the image row the card's root samples). Returns RGBA pixels.
 */
export function strandAtlas(size = 512, columns = 4, seed = 11): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  let r = seed;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const colW = size / columns;
  const alpha = new Float32Array(size * size), shade = new Float32Array(size * size).fill(0.5);
  for (let c = 0; c < columns; c++) {
    const strands = 70 + Math.floor(rand() * 30);
    for (let k = 0; k < strands; k++) {
      // each strand: a gentle S along v, thinning and ending at a random length
      const x0 = c * colW + colW * (0.08 + 0.84 * rand());
      const amp = colW * 0.04 * rand(), freq = 1 + rand() * 2, phase = rand() * 6.28;
      const end = 0.7 + 0.3 * rand(), bright = 0.35 + 0.65 * rand();
      for (let y = 0; y < size * end; y++) {
        const v = y / size;
        const x = x0 + Math.sin(v * freq * 6.28 + phase) * amp * (0.3 + v);
        const width = 1.3 * (1 - 0.6 * v / end);
        for (let dx = -2; dx <= 2; dx++) {
          const xi = Math.round(x) + dx;
          if (xi < c * colW || xi >= (c + 1) * colW) continue;
          const a = Math.max(0, 1 - Math.abs(xi - x) / width) * (1 - Math.pow(v / end, 6));
          const i = y * size + xi;
          if (a > alpha[i]) { alpha[i] = a; shade[i] = bright; }
        }
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(i / size) / size;
    const g = Math.round(255 * (0.55 + 0.45 * shade[i]) * (0.6 + 0.4 * Math.min(1, v * 3)));
    px[i * 4] = g; px[i * 4 + 1] = g; px[i * 4 + 2] = g; px[i * 4 + 3] = Math.round(255 * Math.min(1, alpha[i] * 1.4));
  }
  return px;
}

export interface Chain { name: string; parent: string; at: Vec3 }

/**
 * Haru's chonmage, as his art shows it: hair drawn back from the brow and up from the nape to a tie at the crown,
 * a cloth band through it, the gathered tail standing up in a short tuft, and a couple of loose locks at the temples.
 */
/** Pull a point onto the real head surface (a distance field) at `lift` above it; returns the point and the normal. */
export type Snap = (p: Vec3, lift: number) => { p: Vec3; n: Vec3 };

export function chonmage(s: Scalp, opts: { headBone: string; columns: number; snap?: Snap }) {
  const mb = new MeshBuilder(), cord = new MeshBuilder();
  const guides: Guide[] = [];
  const bones: Chain[] = [];
  const springs: { bones: string[]; stiffness: number; drag: number; gravity: number; radius: number; maxAngle: number }[] = [];
  const H = opts.headBone;
  let r = 3;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  // the tie: top of the head, a little behind the crown
  const tieA = Math.PI, tieE = 1.18;
  const tie = scalpPoint(s, tieA, tieE, 0.006);

  // ---- Swept-back layers: roots along the hairline and over the scalp, all running to the tie ---------------------
  for (const layer of [0.0025, 0.005, 0.0075]) {
    const count = layer < 0.004 ? 110 : 80;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rand() * 0.05;
      // hairline: low at the nape and over the ears, higher at the brow
      const front = Math.max(0, Math.cos(a)), back = Math.max(0, -Math.cos(a)), side = 1 - front - back;
      // hairline: well up the forehead, just under brow height over the ears, down to the nape behind
      const e0 = 0.44 * front - 0.3 * side - 1.0 * back + (layer - 0.0025) * 4 + rand() * 0.04;
      const pts: Vec3[] = [], facing: Vec3[] = [];
      const steps = 12;
      // the shortest way over the skull from root to tie (a great circle on the unit sphere, mapped onto the scalp)
      const d0 = dirOf(a, e0), d1 = dirOf(tieA, tieE);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const d = norm(add(mul(d0, Math.sin((1 - t) * 1.2)), mul(d1, Math.sin(t * 1.2))));
        const el = Math.asin(Math.max(-1, Math.min(1, d[1]))), az = Math.atan2(d[0], d[2]);
        // roots lie on the skin; each layer lifts off it over the first quarter of the strand
        const lift = 0.0008 + (layer - 0.0008) * Math.min(1, t * 4) + 0.0015 * Math.sin(t * Math.PI);
        const q0 = scalpPoint(s, az, el, lift);
        const q = opts.snap ? opts.snap(q0.p, lift) : q0;
        pts.push(q.p); facing.push(q.n);
      }
      guides.push({ points: pts, facing, width: 0.016 + rand() * 0.008, bones: pts.map(() => H) });
    }
  }

  // ---- The topknot: a tuft standing up from the tie, on a spring chain --------------------------------------------
  const up = norm(add(tie.n, [0, 0.6, -0.15]));
  const chain = ['Topknot_0', 'Topknot_1', 'Topknot_2'];
  const len = 0.05;
  chain.forEach((name, i) => bones.push({ name, parent: i ? chain[i - 1] : H, at: add(tie.p, mul(up, (i / 3) * len)) }));
  springs.push({ bones: chain, stiffness: 30, drag: 0.22, gravity: 4, radius: 0.008, maxAngle: 25 });
  const side = norm(cross(up, [1, 0, 0]));
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2;
    const off = add(mul([1, 0, 0], Math.cos(a) * 0.009), mul(side, Math.sin(a) * 0.009));
    const pts: Vec3[] = [], facing: Vec3[] = [], bs: string[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const flare = 1 + t * t * 1.6;
      // the tuft fans out and droops a little backwards at the top
      const p = add(add(tie.p, mul(up, t * len)), add(mul(off, flare), [0, -t * t * 0.01, -t * t * 0.012]));
      pts.push(p); facing.push(norm(off)); bs.push(chain[Math.min(2, Math.floor(t * 3))]);
    }
    guides.push({ points: pts, facing, width: 0.014, bones: bs });
  }
  // the motoyui: the cord wound round the gathered hair, and the knot's cloth band
  for (let w = 0; w < 3; w++) {
    const c = add(tie.p, mul(up, 0.006 + w * 0.006));
    const ring: Vec3[] = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push(add(c, add(mul([1, 0, 0], Math.cos(a) * 0.012), mul(side, Math.sin(a) * 0.012)))); }
    tube(cord, ring, 0.0025, 5, chain[0]);
  }

  // ---- Two loose locks at the temples, each on its own short chain ------------------------------------------------
  for (const sx of [1, -1]) {
    const root = scalpPoint(s, sx * 1.15, 0.45, 0.004);
    const names = [`HairLock${sx > 0 ? 'L' : 'R'}_0`, `HairLock${sx > 0 ? 'L' : 'R'}_1`];
    const down: Vec3 = norm([sx * 0.25, -1, 0.15]);
    names.forEach((name, i) => bones.push({ name, parent: i ? names[0] : H, at: add(root.p, mul(down, i * 0.035)) }));
    springs.push({ bones: names, stiffness: 14, drag: 0.15, gravity: 9.8, radius: 0.006, maxAngle: 45 });
    for (let k = 0; k < 3; k++) {
      const pts: Vec3[] = [], facing: Vec3[] = [], bs: string[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(add(add(root.p, mul(down, t * 0.07)), [sx * k * 0.003, 0, k * 0.003 + Math.sin(t * 3) * 0.003]));
        facing.push(root.n); bs.push(t < 0.3 ? H : t < 0.65 ? names[0] : names[1]);
      }
      guides.push({ points: pts, facing, width: 0.009, bones: bs });
    }
  }

  cards(mb, guides, opts.columns);
  return { mesh: mb, cord, bones, springs, guides: guides.length, tie: tie.p };
}

/**
 * Haru's hairline (his Muse turnaround) as height above the brow in metres, by azimuth round the head (0 = the brow,
 * pi = the nape): high at the forehead, receding at the temples, down to the top of the ear at the sides and to the
 * nape behind. The strand roots and the dark scalp under them both follow it.
 */
const HAIRLINE: [number, number][] = [[0, 0.062], [0.5, 0.068], [0.8, 0.06], [1.1, 0.024], [1.3, -0.012], [1.42, 0.004], [1.85, 0.006], [2.05, -0.03], [2.4, -0.075], [Math.PI, -0.1]];
export function hairlineAt(a: number): number {
  const x = Math.min(Math.PI, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))));
  for (let i = 1; i < HAIRLINE.length; i++) if (x <= HAIRLINE[i][0]) { const [a0, y0] = HAIRLINE[i - 1], [a1, y1] = HAIRLINE[i]; return y0 + ((y1 - y0) * (x - a0)) / (a1 - a0); }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

/**
 * Haru's hair as his Muse turnaround shows it: everything drawn tight back from a high forehead (receding at the
 * temples) and up from the nape to a tie high on the back of the crown, bound with navy cord, the tail lifting off the
 * tie and falling to the upper back on a five-bone spring chain; a few loose strands in front of the ears.
 */
export function ponytail(s: Scalp, opts: { headBone: string; columns: number; snap?: Snap; length?: number }) {
  const mb = new MeshBuilder(), cord = new MeshBuilder();
  const guides: Guide[] = [];
  const bones: Chain[] = [];
  const springs: { bones: string[]; stiffness: number; drag: number; gravity: number; radius: number; maxAngle: number }[] = [];
  const H = opts.headBone;
  let r = 5;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const tieA = Math.PI, tieE = 0.92;
  const tie = scalpPoint(s, tieA, tieE, 0.008);

  // ---- Swept-back layers to the tie ---------------------------------------------------------------------------------
  for (const layer of [0.0025, 0.005, 0.0075]) {
    const count = layer < 0.004 ? 130 : 90;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rand() * 0.05;
      // roots on the hairline (outer layers start a little higher, so the edge is soft, not a helmet rim)
      const e0 = Math.asin(Math.max(-1, Math.min(1, (hairlineAt(a) + 0.002) / s.radii[1]))) + (layer - 0.0025) * 4 + rand() * 0.03;
      const pts: Vec3[] = [], facing: Vec3[] = [];
      const steps = 12;
      const d0 = dirOf(a, e0), d1 = dirOf(tieA, tieE);
      const om = Math.acos(Math.max(-1, Math.min(1, dot(d0, d1)))) || 1e-3;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const d = norm(add(mul(d0, Math.sin((1 - t) * om)), mul(d1, Math.sin(t * om))));
        const el = Math.asin(Math.max(-1, Math.min(1, d[1]))), az = Math.atan2(d[0], d[2]);
        // pulled tight: close to the skin all the way, a little fuller as the strands bunch toward the tie
        const lift = 0.0008 + (layer - 0.0008) * Math.min(1, t * 4) + 0.002 * t * t;
        const q0 = scalpPoint(s, az, el, lift);
        const q = opts.snap ? opts.snap(q0.p, lift) : q0;
        pts.push(q.p); facing.push(q.n);
      }
      guides.push({ points: pts, facing, width: 0.015 + rand() * 0.007, bones: pts.map(() => H) });
    }
  }

  // ---- The tail: lifts back off the tie, arcs over and falls down the back of the head to the upper back ----------
  const L = opts.length ?? 0.3;
  const back = s.centre[2] - s.radii[2];
  const curve = (t: number): Vec3 => {
    // a quadratic out-and-down arc, then straight down, clear of the skull (control points relative to the head)
    const p0 = tie.p, p1: Vec3 = [0, tie.p[1] + 0.035, back - 0.045], p2: Vec3 = [0, s.centre[1] - L * 0.55, back - 0.055];
    const u = Math.min(1, t * 1.6);
    const q = add(add(mul(p0, (1 - u) ** 2), mul(p1, 2 * u * (1 - u))), mul(p2, u * u));
    return t * 1.6 <= 1 ? q : add(p2, [0, -(t - 1 / 1.6) * L * 0.75, -(t - 1 / 1.6) * 0.03]);
  };
  const chain = [0, 1, 2, 3, 4].map((i) => `Tail_${i}`);
  chain.forEach((name, i) => bones.push({ name, parent: i ? chain[i - 1] : H, at: curve(i / chain.length) }));
  springs.push({ bones: chain, stiffness: 9, drag: 0.12, gravity: 9.8, radius: 0.016, maxAngle: 55 });
  const boneAt = (t: number) => chain[Math.min(chain.length - 1, Math.floor(t * chain.length))];
  for (let k = 0; k < 120; k++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand());
    const reach = 0.78 + rand() * 0.22, wob = rand() * 6.28;
    const pts: Vec3[] = [], facing: Vec3[] = [], bs: string[] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * reach;
      const c = curve(t), along = norm(sub(curve(Math.min(1, t + 0.02)), curve(Math.max(0, t - 0.02))));
      const sideV = norm(cross(along, [0, 0, -1])), outV = norm(cross(sideV, along));
      // tight in the cord, full below it, thinning and spreading into strands at the ends
      const rad = (0.011 + 0.03 * Math.min(1, t * 5) * (1 - 0.4 * t)) * rr + 0.004 * t * Math.sin(wob + t * 9);
      const p = add(c, add(mul(sideV, Math.cos(a) * rad * 1.15), mul(outV, Math.sin(a) * rad * 0.8)));
      pts.push(p); facing.push(norm(add(mul(sideV, Math.cos(a)), mul(outV, Math.sin(a))))); bs.push(t < 0.04 ? H : boneAt(t));
    }
    guides.push({ points: pts, facing, width: 0.018 + rand() * 0.01, bones: bs });
  }
  // the cord: three tight navy wraps where the tail leaves the tie
  for (let w = 0; w < 3; w++) {
    const t = 0.015 + w * 0.02, c = curve(t), along = norm(sub(curve(t + 0.02), c));
    const sideV = norm(cross(along, [0, 0, -1])), outV = norm(cross(sideV, along));
    const ring: Vec3[] = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push(add(c, add(mul(sideV, Math.cos(a) * 0.0125), mul(outV, Math.sin(a) * 0.0105)))); }
    tube(cord, ring, 0.0022, 5, t < 0.04 ? H : chain[0]);
  }

  // ---- Loose strands in front of the ears, to the jaw, each side on a short chain ----------------------------------
  for (const sx of [1, -1]) {
    const root = scalpPoint(s, sx * 1.2, 0.32, 0.004);
    const names = [`HairLock${sx > 0 ? 'L' : 'R'}_0`, `HairLock${sx > 0 ? 'L' : 'R'}_1`];
    const down: Vec3 = norm([sx * 0.18, -1, 0.1]);
    names.forEach((name, i) => bones.push({ name, parent: i ? names[0] : H, at: add(root.p, mul(down, i * 0.045)) }));
    springs.push({ bones: names, stiffness: 12, drag: 0.15, gravity: 9.8, radius: 0.006, maxAngle: 45 });
    for (let k = 0; k < 4; k++) {
      const pts: Vec3[] = [], facing: Vec3[] = [], bs: string[] = [];
      const len = 0.075 + rand() * 0.03;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(add(add(root.p, mul(down, t * len)), [sx * (k * 0.0025 + t * t * 0.004), 0, k * 0.003 - 0.004 + Math.sin(t * 3 + k) * 0.002]));
        facing.push(root.n); bs.push(t < 0.3 ? H : t < 0.65 ? names[0] : names[1]);
      }
      guides.push({ points: pts, facing, width: 0.0045, bones: bs });
    }
  }

  cards(mb, guides, opts.columns);
  return { mesh: mb, cord, bones, springs, guides: guides.length, tie: tie.p };
}

export { lerp, dot };
