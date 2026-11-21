// Plajah Vegetation — small plants grown as meshes (docs/plajah-vegetation.md §2, phase 3).
//
// Ferns (arching fronds of leaflet pairs that shrink toward the tip), broadleaf bushes (stems carrying folded oval
// leaves), flowers (a twisting stem, cupped glowing petals round a bright centre), and the Cyber Forest hybrids:
// hanging vines (woody tendrils wound with glowing cables, circuit leaves, bell flowers, metal connector rings),
// crystal plants (a gnarled twisted trunk, faceted gem leaves, crystal flowers, quartz at the foot) and resin stumps
// (a broken stump on arching roots, glowing amber resin and blue crystal clusters, cables, a band). Every vertex carries its colour,
// a glow weight and its sway: (how far out along its frond/stem 0…1, that frond's phase) so the wind bends a frond from
// its root and leaves flutter at the tips. Pure TypeScript (no three.js): deterministic per (species, seed), tested in node.
import type { PlantSpecies } from '../species';
import { rng } from '../trees/grow';

export interface PlantMesh {
  position: Float32Array; normal: Float32Array; color: Float32Array;
  /** glow weight per vertex */
  glow: Float32Array;
  /** (sway weight 0…1, phase 0…1) per vertex */
  sway: Float32Array;
  /** surface per vertex: 0 organic, 1 glossy (crystal, resin, metal) */
  mat: Float32Array;
  index: Uint32Array;
  height: number;
}

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const hex = (c: number): V3 => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255].map((v) => v ** 2.2) as V3; // linear
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Builder {
  p: number[] = []; n: number[] = []; c: number[] = []; g: number[] = []; s: number[] = []; m: number[] = []; i: number[] = [];
  /** surface of the vertices added next (0 organic, 1 glossy) */
  surface = 0;
  vert(p: V3, n: V3, c: V3, glow: number, sway: number, phase: number) {
    this.p.push(...p); this.n.push(...n); this.c.push(...c); this.g.push(glow); this.s.push(sway, phase); this.m.push(this.surface);
    return this.p.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.i.push(a, b, c); }

  /** A folded oval leaf from `base` along `dir`, `side` across; colours base→tip with a vein down the middle. */
  leaf(base: V3, dir: V3, side: V3, len: number, width: number, fold: number, col: { base: V3; tip: V3; vein: V3 }, glow: [number, number], sway: [number, number], phase: number, cup = 0) {
    const nrm = norm(cross(side, dir)), st = 4, rows: number[][] = [];
    for (let k = 0; k <= st; k++) {
      const t = k / st, w = width * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.92 + 0.04)), 0.8);
      const mid = add(add(base, mul(dir, len * t)), mul(nrm, -cup * len * t * t));
      const sw = sway[0] + (sway[1] - sway[0]) * t, gl = glow[0] + (glow[1] - glow[0]) * t;
      const cc = lerp3(col.base, col.tip, t);
      const l = add(add(mid, mul(side, -w)), mul(nrm, fold * w)), r = add(add(mid, mul(side, w)), mul(nrm, fold * w));
      rows.push([this.vert(l, nrm, cc, gl, sw, phase), this.vert(mid, nrm, lerp3(cc, col.vein, 0.6), gl, sw, phase), this.vert(r, nrm, cc, gl, sw, phase)]);
    }
    for (let k = 0; k < st; k++) for (let j = 0; j < 2; j++) {
      const a = rows[k][j], b = rows[k][j + 1], c = rows[k + 1][j], d = rows[k + 1][j + 1];
      this.tri(a, c, b); this.tri(b, c, d);
    }
  }

  /** A tube along points (3 sides by default — stems are small). */
  stem(pts: V3[], r0: number, r1: number, col: V3, sway: (t: number) => number, phase: number, sides = 3, glow = 0) {
    const rings: number[][] = [];
    for (let k = 0; k < pts.length; k++) {
      const t = k / (pts.length - 1), d = norm(k < pts.length - 1 ? add(pts[k + 1], mul(pts[k], -1)) : add(pts[k], mul(pts[k - 1], -1)));
      const a = norm(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), b = cross(d, a), r = r0 + (r1 - r0) * t, ring: number[] = [];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2, o = add(mul(a, Math.cos(ang) * r), mul(b, Math.sin(ang) * r));
        ring.push(this.vert(add(pts[k], o), norm(o), col, glow, sway(t), phase));
      }
      rings.push(ring);
    }
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < sides; s++) {
      const a = rings[k][s], b = rings[k][(s + 1) % sides], c = rings[k + 1][s], d = rings[k + 1][(s + 1) % sides];
      this.tri(a, c, b); this.tri(b, c, d);
    }
  }

  /** A flat-shaded triangle with its own vertices, so facets stay sharp (crystals). */
  facet(a: V3, b: V3, c: V3, col: V3, glow: number, sway: number, phase: number) {
    const n = norm(cross(add(b, mul(a, -1)), add(c, mul(a, -1))));
    this.tri(this.vert(a, n, col, glow, sway, phase), this.vert(b, n, col, glow, sway, phase), this.vert(c, n, col, glow, sway, phase));
  }

  /** A faceted gem leaf / petal: a flattened bipyramid from `base` along `dir`. */
  gem(base: V3, dir: V3, side: V3, len: number, width: number, col: V3, tip: V3, glow: number, sway: number, phase: number) {
    const up = norm(cross(side, dir)), mid = add(base, mul(dir, len * 0.42)), end = add(base, mul(dir, len));
    const l = add(mid, mul(side, -width)), r = add(mid, mul(side, width)), t = add(mid, mul(up, width * 0.35)), b = add(mid, mul(up, -width * 0.35));
    const c2 = lerp3(col, tip, 0.6);
    const ring: [V3, V3][] = [[l, t], [t, r], [r, b], [b, l]];
    for (const [p, q] of ring) { this.facet(base, p, q, col, glow, sway, phase); this.facet(p, end, q, c2, glow, sway, phase); }
  }

  /** A crystal: a hexagonal prism with a pointed tip, standing on `base` along `dir`. */
  crystal(base: V3, dir: V3, len: number, r: number, col: V3, glow: number, sway: number, phase: number) {
    const a0 = norm(cross(dir, Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), b0 = cross(dir, a0);
    const ring = (h: number, rr: number) => Array.from({ length: 6 }, (_, k) => add(add(base, mul(dir, h)), add(mul(a0, Math.cos(k * Math.PI / 3) * rr), mul(b0, Math.sin(k * Math.PI / 3) * rr))));
    const lo = ring(0, r), hi = ring(len * 0.72, r * 0.92), tip = add(base, mul(dir, len));
    for (let k = 0; k < 6; k++) {
      const k1 = (k + 1) % 6;
      this.facet(lo[k], lo[k1], hi[k], col, glow, sway, phase); this.facet(lo[k1], hi[k1], hi[k], col, glow, sway, phase);
      this.facet(hi[k], hi[k1], tip, lerp3(col, [1, 1, 1], 0.25), glow * 1.3, sway, phase);
    }
  }

  /** A lumpy blob (resin, sap): a jittered sphere, smooth-shaded. */
  blob(c: V3, r: number, col: V3, glow: number, R: () => number, sway: number, phase: number) {
    const rings = 5, segs = 8, rows: number[][] = [];
    for (let j = 0; j <= rings; j++) {
      const ph = (j / rings) * Math.PI, row: number[] = [];
      for (let k = 0; k < segs; k++) {
        const th = (k / segs) * Math.PI * 2, n: V3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
        row.push(this.vert(add(c, mul(n, r * (0.8 + R() * 0.4))), n, lerp3(col, [1, 0.95, 0.7], R() * 0.25), glow, sway, phase));
      }
      rows.push(row);
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < segs; k++) {
      const a = rows[j][k], b = rows[j][(k + 1) % segs], cc = rows[j + 1][k], d = rows[j + 1][(k + 1) % segs];
      this.tri(a, cc, b); this.tri(b, cc, d);
    }
  }

  /** A band round a tube at `c` with axis `dir` (metal connector rings, cable ties). */
  band(c: V3, dir: V3, r: number, w: number, col: V3, sway: number, phase: number) {
    this.stem([add(c, mul(dir, -w / 2)), add(c, mul(dir, w / 2))], r, r, col, () => sway, phase, 8);
  }

  done(height: number): PlantMesh {
    return { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), glow: new Float32Array(this.g), sway: new Float32Array(this.s), mat: new Float32Array(this.m), index: new Uint32Array(this.i), height };
  }
}

/** An arching curve: from `start`, heading `yaw`, rising at `elev0` and bending down by `bend` over its length. */
function arch(start: V3, yaw: number, elev0: number, bend: number, len: number, steps: number): V3[] {
  const pts: V3[] = [start]; let p = start;
  for (let k = 1; k <= steps; k++) {
    const t = k / steps, e = elev0 - bend * t, d: V3 = [Math.cos(yaw) * Math.cos(e), Math.sin(e), Math.sin(yaw) * Math.cos(e)];
    p = add(p, mul(d, len / steps)); pts.push(p);
  }
  return pts;
}

export function buildPlant(sp: PlantSpecies, seed: number): PlantMesh {
  const R = rng(seed * 4099 + 7), B = new Builder();
  const stemC = hex(sp.color.stem), leafC = hex(sp.color.leaf), tipC = hex(sp.color.tip), veinC = hex(sp.color.vein ?? sp.color.stem);
  const H = sp.height * (0.85 + R() * 0.3);
  if (sp.form === 'vine' || sp.form === 'crystal' || sp.form === 'stump') return buildCyber(sp, R, B, H);

  if (sp.form === 'fern') {
    for (let f = 0; f < sp.count; f++) {
      const yaw = (f / sp.count) * Math.PI * 2 + (R() - 0.5) * 0.5, phase = R();
      const len = Math.hypot(H, sp.spread) * (0.8 + R() * 0.35), e0 = 1.0 + R() * 0.35, bend = 1.2 + R() * 0.5;
      const spine = arch([0, 0, 0], yaw, e0, bend, len, 10);
      B.stem(spine, 0.012, 0.003, stemC, (t) => t, phase);
      for (let k = 1; k <= sp.parts; k++) {
        const t = k / (sp.parts + 1), at = t * (spine.length - 1), i0 = Math.floor(at), fr = at - i0;
        const p = add(spine[i0], mul(add(spine[Math.min(spine.length - 1, i0 + 1)], mul(spine[i0], -1)), fr));
        const d = norm(add(spine[Math.min(spine.length - 1, i0 + 1)], mul(spine[i0], -1)));
        const side = norm(cross([0, 1, 0], d));
        const size = sp.leaf * Math.pow(1 - t, 0.55) * (0.45 + Math.min(1, t * 5) * 0.55);
        for (const s of [-1, 1]) {
          const ld = norm(add(add(mul(side, s), mul(d, 0.55)), [0, -0.15, 0]));
          B.leaf(p, ld, norm(cross(ld, [0, 1, 0])), size, size * 0.2, 0.25, { base: lerp3(leafC, veinC, 0.3), tip: tipC, vein: veinC }, [0, 0.05], [t, t + 0.05], phase);
        }
      }
    }
  } else if (sp.form === 'bush') {
    for (let s = 0; s < sp.count; s++) {
      const yaw = R() * Math.PI * 2, phase = R(), r0 = R() * sp.spread * 0.25;
      const start: V3 = [Math.cos(yaw) * r0, 0, Math.sin(yaw) * r0];
      const stem = arch(start, yaw, 1.15 + R() * 0.3, 0.5 + R() * 0.4, H * (0.75 + R() * 0.45), 6);
      B.stem(stem, 0.015, 0.005, stemC, (t) => t, phase);
      for (let k = 0; k < sp.parts; k++) {
        const t = 0.3 + 0.7 * (k / Math.max(1, sp.parts - 1)), at = t * (stem.length - 1), i0 = Math.min(stem.length - 2, Math.floor(at));
        const p = add(stem[i0], mul(add(stem[i0 + 1], mul(stem[i0], -1)), at - i0));
        const a = yaw + (R() - 0.5) * 2.6, ld = norm([Math.cos(a), 0.35 + R() * 0.5, Math.sin(a)]);
        const size = sp.leaf * (0.7 + R() * 0.5);
        B.leaf(p, ld, norm(cross(ld, [0, 1, 0])), size, size * 0.38, 0.3, { base: leafC, tip: tipC, vein: veinC }, [0, sp.glow ? 0.25 : 0], [t, t + 0.1], phase, 0.12);
      }
    }
  } else {
    // flower: twisting stem, a few leaves low down, a bloom of cupped petals round a glowing centre
    for (let bl = 0; bl < sp.count; bl++) {
      const phase = R(), yaw = R() * Math.PI * 2, h = H * (bl ? 0.7 + R() * 0.2 : 1);
      const pts: V3[] = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, tw = t * 5 + yaw; pts.push([Math.cos(tw) * 0.04 * Math.sin(t * Math.PI) + Math.cos(yaw) * sp.spread * 0.3 * t * t * (bl ? 1 : 0.3), t * h, Math.sin(tw) * 0.04 * Math.sin(t * Math.PI) + Math.sin(yaw) * sp.spread * 0.3 * t * t * (bl ? 1 : 0.3)]); }
      B.stem(pts, 0.025, 0.012, stemC, (t) => t, phase);
      for (let k = 0; k < 3; k++) {
        const a = yaw + k * 2.1, ld = norm([Math.cos(a), 0.5, Math.sin(a)]), p = pts[1 + k];
        B.leaf(p, ld, norm(cross(ld, [0, 1, 0])), sp.leaf * 0.9, sp.leaf * 0.3, 0.3, { base: stemC, tip: hex(sp.color.vein ?? sp.color.leaf), vein: stemC }, [0, 0], [k / 8, k / 8 + 0.1], phase, 0.1);
      }
      const top = pts[pts.length - 1], g = sp.glow;
      const petalC = { base: leafC, tip: tipC, vein: hex(g?.color ?? sp.color.tip) };
      for (let k = 0; k < sp.parts; k++) {
        // cupped and upright like the art's blooms: petals rise steeply and curl back in at the tips
        const inner = k % 2, a = (k / sp.parts) * Math.PI * 2 + yaw, ld = norm([Math.cos(a), inner ? 2.6 : 1.7, Math.sin(a)]);
        B.leaf(add(top, [0, inner ? sp.leaf * 0.05 : 0, 0]), ld, norm(cross(ld, [0, 1, 0])), sp.leaf * (inner ? 0.9 : 1), sp.leaf * 0.5, 0.35, petalC, [0.6, 1], [1, 1], phase, -0.3);
      }
      // the centre: a small glowing bud
      const cc = hex(g?.center ?? sp.color.tip), r = sp.leaf * 0.18;
      const c0 = B.vert(add(top, [0, r * 1.6, 0]), [0, 1, 0], cc, 1.4, 1, phase), ring: number[] = [];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ring.push(B.vert(add(top, [Math.cos(a) * r, r * 0.5, Math.sin(a) * r]), norm([Math.cos(a), 0.4, Math.sin(a)]), cc, 1.2, 1, phase)); }
      for (let k = 0; k < 5; k++) B.tri(c0, ring[(k + 1) % 5], ring[k]);
    }
  }
  return B.done(H);
}

/** Points along a wandering line from `a`, heading `dir`, with sideways drift. */
function wander(a: V3, dir: V3, len: number, steps: number, drift: number, R: () => number): V3[] {
  const pts: V3[] = [a]; let p = a, d = norm(dir);
  for (let k = 1; k <= steps; k++) {
    d = norm(add(d, [(R() - 0.5) * drift, (R() - 0.5) * drift * 0.5, (R() - 0.5) * drift]));
    p = add(p, mul(d, len / steps)); pts.push(p);
  }
  return pts;
}
/** Point and direction at fraction t along a polyline. */
function along(pts: V3[], t: number): [V3, V3] {
  const at = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(at)), f = at - i;
  const seg = add(pts[i + 1], mul(pts[i], -1));
  return [add(pts[i], mul(seg, f)), norm(seg)];
}

function buildCyber(sp: PlantSpecies, R: () => number, B: Builder, H: number): PlantMesh {
  const stemC = hex(sp.color.stem), leafC = hex(sp.color.leaf), tipC = hex(sp.color.tip), veinC = hex(sp.color.vein ?? sp.color.leaf);
  const ac = sp.accents ?? {}, cableC = hex(ac.cable ?? 0x30d8ff), resinC = hex(ac.resin ?? 0xff9a20), crysC = hex(ac.crystal ?? 0x40b0ff), metalC = hex(ac.metal ?? 0x5a6066);
  const glowC = hex(sp.glow?.center ?? sp.color.tip), mossC = hex(0x3a5a2c);

  if (sp.form === 'vine') {
    // strands hang DOWN from the origin; the sway weight grows toward the free ends
    for (let s = 0; s < sp.count; s++) {
      const phase = R(), a = R() * Math.PI * 2, r0 = R() * sp.spread * 0.4, len = H * (0.45 + R() * 0.55);
      const pts = wander([Math.cos(a) * r0, 0, Math.sin(a) * r0], [Math.cos(a) * 0.15, -1, Math.sin(a) * 0.15], len, 9, 0.35, R);
      const sw = (t: number) => t;
      B.stem(pts, 0.04, 0.014, lerp3(stemC, mossC, R() * 0.4), sw, phase, 4);
      if (R() < 0.7) { // a glowing cable wound round the strand
        const turns = 1 + R() * 2;
        const cab = pts.map((p, k): V3 => { const t = k / (pts.length - 1), an = t * turns * Math.PI * 2 + a; return add(p, [Math.cos(an) * 0.03, 0, Math.sin(an) * 0.03]); });
        B.stem(cab, 0.012, 0.009, cableC, sw, phase, 3, 1);
      }
      B.surface = 1;
      for (let k = 0; k < 2; k++) { if (R() < 0.5) continue; const t = 0.15 + R() * 0.5, [p, d] = along(pts, t); B.band(p, d, 0.032, 0.05, metalC, t, phase); }
      B.surface = 0;
      for (let k = 0; k < sp.parts; k++) { // circuit-veined leaves
        const t = 0.1 + 0.88 * (k / Math.max(1, sp.parts - 1)), [p, d] = along(pts, t);
        const sa = R() * Math.PI * 2, side: V3 = [Math.cos(sa), 0, Math.sin(sa)], ld = norm(add(mul(side, 0.8), add(mul(d, 0.6), [0, -0.3, 0])));
        const size = sp.leaf * (0.6 + R() * 0.6);
        B.leaf(p, ld, norm(cross(ld, [0, 1, 0])), size, size * 0.3, 0.2, { base: leafC, tip: tipC, vein: veinC }, [0, 0.35], [t, t + 0.05], phase, 0.1);
      }
      if (R() < 0.45) { // a glowing bell flower near the end
        const [p] = along(pts, 0.75 + R() * 0.25), fl = sp.leaf * 0.7;
        for (let k = 0; k < 5; k++) {
          const an = (k / 5) * Math.PI * 2, ld = norm([Math.cos(an) * 0.55, -1, Math.sin(an) * 0.55]);
          B.leaf(p, ld, norm(cross(ld, [0, 1, 0])), fl, fl * 0.45, 0.3, { base: hex(sp.glow?.color ?? 0x40e0ff), tip: glowC, vein: [1, 1, 1] }, [0.6, 1], [1, 1], phase, -0.25);
        }
      }
    }
    return B.done(H);
  }

  if (sp.form === 'crystal') {
    // a gnarled trunk of twisted strands on arching roots, branching into gem leaves and crystal flowers
    const phase = R(), trunkH = H * 0.42, girth = H * 0.012;
    const axis: V3[] = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; axis.push([Math.sin(t * 2.4) * H * 0.012, t * trunkH, Math.cos(t * 1.9) * H * 0.009]); }
    for (let s = 0; s < 3; s++) {
      const pts = axis.map((p, k): V3 => { const t = k / 8, an = s * 2.1 + t * 4, rr = girth * 0.9 * (1.6 - t * 0.6); return add(p, [Math.cos(an) * rr, 0, Math.sin(an) * rr]); });
      B.stem(pts, girth * 0.75, girth * 0.45, stemC, (t) => t * 0.42, phase, 5);
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + R() * 0.5, reach = H * (0.22 + R() * 0.12), pts: V3[] = [];
      for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push([Math.cos(a) * reach * t, H * 0.1 * (1 - t) * (1 - t) - 0.02 * t, Math.sin(a) * reach * t]); }
      B.stem(pts, girth * 0.5, girth * 0.12, stemC, () => 0, phase, 4);
    }
    B.stem(axis.map((p, k): V3 => add(p, [Math.cos(k) * girth * 1.6, 0, Math.sin(k) * girth * 1.6])), 0.012, 0.01, cableC, (t) => t * 0.42, phase, 3, 0.8);
    const top = axis[axis.length - 1];
    for (let b = 0; b < sp.count; b++) {
      const a = (b / sp.count) * Math.PI * 2 + R() * 0.4, out = b === 0 ? 0.1 : 0.7, up = b === 0 ? 1 : 0.55 + R() * 0.3;
      const pts = wander(top, [Math.cos(a) * out, up, Math.sin(a) * out], H * (b === 0 ? 0.55 : 0.32 + R() * 0.12), 6, 0.3, R);
      B.stem(pts, girth * 0.5, girth * 0.15, stemC, (t) => 0.42 + t * 0.58, phase, 4);
      B.surface = 1;
      for (let k = 0; k < sp.parts; k++) {
        const t = 0.25 + 0.7 * (k / Math.max(1, sp.parts - 1)), [p, d] = along(pts, t);
        const sa = R() * Math.PI * 2, ld = norm(add([Math.cos(sa), 0.4, Math.sin(sa)], mul(d, 0.3)));
        const size = sp.leaf * (0.7 + R() * 0.5);
        B.gem(p, ld, norm(cross(ld, [0, 1, 0])), size, size * 0.28, R() < 0.4 ? veinC : leafC, tipC, 0.15, 0.42 + t * 0.58, phase);
      }
      const tipP = pts[pts.length - 1], fl = sp.leaf * (b === 0 ? 1.5 : 1.15);
      for (let k = 0; k < 6; k++) { // a crystal flower
        const an = (k / 6) * Math.PI * 2 + R() * 0.3, ld = norm([Math.cos(an), 0.55, Math.sin(an)]);
        B.gem(tipP, ld, norm(cross(ld, [0, 1, 0])), fl, fl * 0.38, hex(0xd8d4f0), hex(0xb8a8ff), 0.55, 1, phase);
      }
      B.crystal(tipP, [0, 1, 0], fl * 0.35, fl * 0.08, glowC, 1.2, 1, phase);
      B.surface = 0;
    }
    B.surface = 1; // quartz at the foot
    for (let k = 0; k < 5; k++) { const a = R() * Math.PI * 2, d = H * (0.06 + R() * 0.1); B.crystal([Math.cos(a) * d, 0, Math.sin(a) * d], norm([Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4]), H * (0.06 + R() * 0.08), H * 0.018, hex(0xc8e4ee), 0.2, 0, 0); }
    B.surface = 0;
    return B.done(H);
  }

  // stump: a broken trunk on arching roots, a jagged top, resin blobs, crystal clusters, cables and a band
  const phase = R(), r = sp.spread * 0.32, A = 14, S = 6, rows: number[][] = [];
  const girthAt = (y: number) => r * (1 + (1 - y / H) ** 2 * 0.7);
  for (let j = 0; j <= S; j++) {
    const t = j / S, row: number[] = [];
    for (let k = 0; k < A; k++) {
      const a = (k / A) * Math.PI * 2, jag = j === S ? (R() - 0.3) * H * 0.35 : 0, rr = girthAt(t * H) * (0.88 + 0.24 * Math.sin(a * 3 + j));
      row.push(B.vert([Math.cos(a) * rr, t * H + jag, Math.sin(a) * rr], [Math.cos(a), 0, Math.sin(a)], lerp3(stemC, mossC, (Math.sin(a * 5 + j * 2) * 0.5 + 0.5) * 0.3 * (1 - t)), 0, 0, phase));
    }
    rows.push(row);
  }
  for (let j = 0; j < S; j++) for (let k = 0; k < A; k++) {
    const a = rows[j][k], b = rows[j][(k + 1) % A], c = rows[j + 1][k], d = rows[j + 1][(k + 1) % A];
    B.tri(a, c, b); B.tri(b, c, d);
  }
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + R() * 0.4, reach = sp.spread * (0.6 + R() * 0.4), rise = H * (0.25 + R() * 0.15), pts: V3[] = [];
    for (let j = 0; j <= 6; j++) { const t = j / 6; pts.push([Math.cos(a) * (r * 0.8 + reach * t), rise * (1 - t) * (1 - t) - 0.03 * t, Math.sin(a) * (r * 0.8 + reach * t)]); }
    B.stem(pts, r * 0.32, 0.02, stemC, () => 0, phase, 5);
  }
  for (let c = 0; c < 4; c++) {
    const a = R() * Math.PI * 2, pts: V3[] = [];
    for (let j = 0; j <= 8; j++) { const t = j / 8, an = a + t * 1.4; pts.push([Math.cos(an) * r * (1.05 + t * 0.9), H * (0.95 - t * 0.98), Math.sin(an) * r * (1.05 + t * 0.9)]); }
    B.stem(pts, 0.022, 0.022, hex(0x1a1c20), () => 0, phase, 4, 0.15);
  }
  B.surface = 1;
  B.band([0, H * 0.62, 0], [0, 1, 0], girthAt(H * 0.62) * 1.04, 0.08, metalC, 0, phase);
  for (let k = 0; k < 4; k++) {
    const a = R() * Math.PI * 2, y = H * (0.25 + R() * 0.5), rr = girthAt(y), c: V3 = [Math.cos(a) * rr, y, Math.sin(a) * rr];
    for (let b = 0; b < 3; b++) B.blob(add(c, [(R() - 0.5) * 0.12, (R() - 0.5) * 0.15, (R() - 0.5) * 0.12]), r * (0.18 + R() * 0.16), resinC, 1, R, 0, phase);
  }
  for (let k = 0; k < 2; k++) {
    const a = R() * Math.PI * 2, y = H * (0.2 + R() * 0.4), rr = girthAt(y);
    for (let b = 0; b < 5; b++) {
      const d = norm([Math.cos(a) + (R() - 0.5) * 0.8, 0.3 + R() * 0.5, Math.sin(a) + (R() - 0.5) * 0.8]);
      B.crystal([Math.cos(a) * rr * 0.92, y + (R() - 0.5) * 0.15, Math.sin(a) * rr * 0.92], d, r * (0.25 + R() * 0.25), r * 0.07, crysC, 0.9, 0, phase);
    }
  }
  B.surface = 0;
  return B.done(H);
}
