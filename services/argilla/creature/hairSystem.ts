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
import { MeshBuilder, tube, sheet } from './wardrobe';

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
// (measured on the turnaround with the art-fitted head, 2026-11-12: the shaved centre runs to the crown (sakayaki), the
// temples recede steeply to sideburns in front of the ear, hair passes over the ear's top and down to the nape, no lower than the cards can lie flat)
const HAIRLINE: [number, number][] = [[0, 0.12], [0.35, 0.11], [0.6, 0.06], [0.85, 0.03], [1.1, 0.0], [1.28, -0.015], [1.45, -0.02], [1.65, 0.0], [1.85, 0.004], [2.05, -0.03], [2.4, -0.075], [Math.PI, -0.1]];
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
  // pulled tight: the art's hair lies flat to the skull, a few millimetres of it, not a cap
  // (two sparse layers: the scalp carries the art's painted hair; the cards only break its outline and catch light)
  for (const layer of [0.0015, 0.003]) {
    const count = layer < 0.0025 ? 80 : 45;
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
  // the arc measured on the turnaround's side view (2026-11-12), relative to the tie: up and back to a crest, then
  // sweeping back as it falls, ending well behind the shoulders' line (a Catmull-Rom through the four)
  const K: Vec3[] = [[0, 0, 0], [0, 0.034, -0.051], [0, -0.082, -0.123], [0, -0.227, -0.186]].map((d) => add(tie.p, d as Vec3)) as Vec3[];
  void L; void back;
  const curve = (t: number): Vec3 => {
    const f = Math.max(0, Math.min(1, t)) * (K.length - 1), i = Math.min(K.length - 2, Math.floor(f)), u = f - i;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u;
    return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3)) as Vec3;
  };
  const chain = [0, 1, 2, 3, 4].map((i) => `Tail_${i}`);
  chain.forEach((name, i) => bones.push({ name, parent: i ? chain[i - 1] : H, at: curve(i / chain.length) }));
  // stiff enough to hold the art's arc standing, light enough to swing and trail in motion
  springs.push({ bones: chain, stiffness: 16, drag: 0.12, gravity: 4, radius: 0.016, maxAngle: 55 });
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
      const rad = (0.011 + 0.03 * Math.min(1, t * 5) + 0.03 * t * t) * rr + 0.006 * t * Math.sin(wob + t * 9); // spreading into strands
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

/**
 * Locs over an undercut (the Scribe's turnaround and portrait, Lexicon): short-to-medium locs grown from the top of the
 * head, falling forward over the brow and down at the back; the sides and nape are shaved (the scalp paint carries the
 * fade). Locs are thick and round, so each is a tapered tube (real geometry), not a strand card. A few front locs carry
 * gold cuffs near their tips. Rigid on the head: they are short enough not to need springs.
 * Returns the ponytail's shape: `mesh` (locs, material 'hair'), `cord` (the cuffs, material 'gold').
 */
export function locs(s: Scalp, opts: { headBone: string; snap?: Snap; count?: number; length?: number; cuffs?: number; sweep?: number }) {
  const mb = new MeshBuilder(), cord = new MeshBuilder();
  const H = opts.headBone;
  let r = 13;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const count = opts.count ?? 78, L = opts.length ?? 0.11, sweep = opts.sweep ?? 0.2;
  const inside = (p: Vec3) => {
    const q = sub(p, s.centre);
    return (q[0] / s.radii[0]) ** 2 + (q[1] / s.radii[1]) ** 2 + (q[2] / s.radii[2]) ** 2 < 1;
  };
  let cuffs = opts.cuffs ?? 4, guides = 0;
  for (let k = 0; k < count; k++) {
    // roots on the top: a golden-angle spiral, kept above the undercut (high at the sides, lower at front and back)
    const a = k * 2.39996 + rand() * 0.2;
    const side = Math.abs(Math.sin(a));
    const eMin = 0.42 + 0.38 * side;               // radians above the brow line
    const e = eMin + (Math.PI / 2 - eMin) * Math.sqrt((k + 0.5) / count) * (0.85 + rand() * 0.15);
    const root = scalpPoint(s, a, Math.min(e, 1.5), 0.004);
    const front = Math.cos(a) > 0.2, back = Math.cos(a) < -0.3;
    // the art's locs part off-centre and fall to the subject's right over the brow
    const lean: Vec3 = front ? norm([-0.45, 0, 1]) : back ? [0, 0, -1] : norm([Math.sin(a), 0, Math.cos(a) * 0.3]);
    const len = L * (front ? 1.05 : back ? 0.95 : 0.75) * (0.75 + rand() * 0.45);
    const pts: Vec3[] = [];
    let p = root.p, d = norm(add(mul(root.n, 1.1), mul(lean, sweep)));
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      pts.push(p);
      const t = i / steps;
      // stand up off the scalp, then bow over and fall: gravity grows along the loc
      d = norm(add(add(mul(d, 1), mul([0, -1, 0], 0.25 + 0.6 * t)), mul(lean, 0.08)));
      let q = add(p, mul(d, len / steps));
      if (inside(q)) { const out = scalpPoint(s, Math.atan2(q[0] - s.centre[0], q[2] - s.centre[2]), Math.asin(Math.max(-1, Math.min(1, (q[1] - s.centre[1]) / s.radii[1]))), 0.006); q = out.p; }
      if (opts.snap && i < 2) q = opts.snap(q, 0.006).p;
      p = q;
    }
    const rad = 0.0072 + rand() * 0.0022;
    tube(mb, pts, (t: number) => rad * (1 - 0.35 * t * t), 7, H);
    guides++;
    if (front && cuffs > 0 && rand() > 0.5) {
      cuffs--;
      const i = steps - 3, c = pts[i], c2 = pts[i + 1];
      tube(cord, [lerp(c, c2, 0.1), lerp(c, c2, 0.9)], rad * 1.45, 10, H);
    }
  }
  return { mesh: mb, cord, bones: [] as Chain[], springs: [] as { bones: string[]; stiffness: number; drag: number; gravity: number; radius: number; maxAngle: number }[], guides, tie: s.centre };
}

/**
 * Plaited hair (Lexicon's Elder Mira: silver hair swept back, a braid across the crown, two long plaits falling in front
 * of the shoulders; the back loose to the shoulders). Real geometry like locs: the swept layer is thin tapered tubes
 * lying on the scalp, each plait three strands turning round a centreline. Rigid on the head.
 *   frontPlaits  how far the two front plaits fall below the ear, metres (0: none)
 *   backLength   how far the loose hair falls below the nape (0: gathered)
 *   crown        a braid across the crown from ear to ear
 * Returns `mesh` (material 'hair') and `cord` (the ties, material 'gold').
 */
export function braids(s: Scalp, opts: { headBone: string; snap?: Snap; count?: number; frontPlaits?: number; backLength?: number; crown?: boolean; thick?: number }) {
  const mb = new MeshBuilder(), cord = new MeshBuilder();
  const H = opts.headBone;
  let r = 29;
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const count = opts.count ?? 150, back = opts.backLength ?? 0.16, front = opts.frontPlaits ?? 0.42, thick = opts.thick ?? 1;
  const nape = s.centre[1] - s.radii[1] * 0.55;
  const outside = (q: Vec3, lift: number) => {
    const c = sub(q, s.centre), k = (c[0] / s.radii[0]) ** 2 + (c[1] / s.radii[1]) ** 2 + (c[2] / s.radii[2]) ** 2;
    if (k >= 1 || q[1] < nape) return q;
    const a = Math.atan2(c[0], c[2]), e = Math.asin(Math.max(-1, Math.min(1, c[1] / s.radii[1])));
    return scalpPoint(s, a, e, lift).p;
  };
  // the mass: a shell of hair over the scalp from the hairline back, standing off it as full hair does (fuller at the
  // sides), and the loose hair at the back falling from the nape
  const eLow = (a: number) => (Math.cos(a) > 0 ? 0.1 * Math.cos(a) : -0.6 * -Math.cos(a)) - 0.08 * Math.abs(Math.sin(a));
  const loft = (a: number, e: number) => (0.018 + (0.03 * Math.abs(Math.sin(a)) + 0.014 * Math.max(0, -Math.cos(a))) * (1 - Math.max(0, e) / 1.7)) * thick;
  sheet(mb, 48, 16, (u, v) => { const a = -Math.PI + 2 * Math.PI * u, e = eLow(a) + (1.56 - eLow(a)) * v; return scalpPoint(s, a, e, loft(a, e)).p; }, H);
  if (back > 0) {
    const fall = (u: number, v: number): Vec3 => {
      const a = Math.PI - 1.3 + 2.6 * u, top = scalpPoint(s, a, eLow(a), loft(a, eLow(a))).p;
      return add(top, [Math.sin(a) * 0.012 * v, -back * v, -0.02 * v]);
    };
    sheet(mb, 20, 6, fall, H);
  }
  // the swept layer: roots along the hairline and over the top, combed back over the crown to the nape, then loose
  for (let k = 0; k < count; k++) {
    const a = (rand() - 0.5) * 2 * Math.PI * 0.62;            // front half and the sides
    const e = 0.05 + rand() * 0.25 + 0.25 * Math.abs(Math.sin(a));
    const root = scalpPoint(s, a, e, 0.003);
    const pts: Vec3[] = [];
    // over the head along the meridian of this azimuth, then down the back
    const side = Math.sin(a);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (t < 0.7) {
        const tt = t / 0.7;
        // swing from the root's azimuth round toward the back, rising over the crown
        const aa = a + (Math.sign(a || 1) * Math.PI - a) * tt * (Math.abs(side) > 0.7 ? 0.85 : 1);
        const ee = e + (1.2 - e) * Math.sin(Math.PI * tt) * (1 - 0.5 * Math.abs(side)) - 0.3 * tt * tt;
        pts.push(scalpPoint(s, aa, ee, loft(aa, ee) + 0.002 + 0.003 * Math.sin(Math.PI * tt)).p);
      } else {
        const tt = (t - 0.7) / 0.3, last = pts[pts.length - 1];
        pts.push(outside(add(last, [side * 0.006, -back / (steps * 0.3), -0.006]), 0.006));
        void tt;
      }
    }
    if (opts.snap) pts[0] = opts.snap(pts[0], 0.004).p;
    const rad = (0.0038 + rand() * 0.0016) * thick;
    tube(mb, pts, (t: number) => rad * (1 - 0.5 * t * t), 5, H);
  }
  // a plait: three strands turning round a centreline
  const plait = (centre: Vec3[], width: number, tie: boolean) => {
    const n = centre.length;
    for (let strand = 0; strand < 3; strand++) {
      const pts: Vec3[] = [];
      for (let i = 0; i < n; i++) {
        const c = centre[i], d = norm(sub(centre[Math.min(n - 1, i + 1)], centre[Math.max(0, i - 1)]));
        const ref: Vec3 = Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
        const n1 = norm(cross(d, ref)), n2 = cross(n1, d);
        const ph = strand * (2 * Math.PI / 3) + i * 0.9;
        const taper = 1 - 0.45 * (i / (n - 1));
        pts.push(add(c, add(mul(n1, Math.sin(ph) * width * 0.55 * taper), mul(n2, Math.sin(2 * ph) * width * 0.22 * taper))));
      }
      tube(mb, pts, (t: number) => width * 0.42 * (1 - 0.4 * t), 6, H);
    }
    if (tie) { const a = centre[n - 3], b = centre[n - 2]; tube(cord, [a, b], width * 0.5, 8, H); }
  };
  if (opts.crown ?? true) {
    const c: Vec3[] = [];
    for (let i = 0; i <= 28; i++) { const a = -1.5 + (3.0 * i) / 28, e = 0.95 - 0.35 * Math.abs(Math.sin(a)) ** 3; c.push(scalpPoint(s, a, e, loft(a, e) + 0.01).p); }
    plait(c, 0.016 * thick, false);
  }
  if (front > 0) {
    for (const sx of [1, -1]) {
      // from the temple behind the ear, down in front of the shoulder
      const top = scalpPoint(s, sx * 1.55, 0.05, 0.01).p;
      const c: Vec3[] = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        c.push([top[0] + sx * (0.025 * Math.sin(Math.PI * Math.min(1, t * 3)) + 0.02 * t), top[1] - front * t - 0.03 * Math.min(1, t * 4), top[2] + 0.07 * Math.min(1, t * 2.5)]);
      }
      plait(c, 0.02 * thick, true);
    }
  }
  return { mesh: mb, cord, bones: [] as Chain[], springs: [] as { bones: string[]; stiffness: number; drag: number; gravity: number; radius: number; maxAngle: number }[], guides: count, tie: s.centre };
}

export { lerp, dot };
