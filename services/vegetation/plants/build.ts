// Plajah Vegetation — small plants grown as meshes (docs/plajah-vegetation.md §2, phase 3).
//
// Ferns (arching fronds of leaflet pairs that shrink toward the tip), broadleaf bushes (stems carrying folded oval
// leaves) and flowers (a twisting stem, cupped glowing petals round a bright centre). Every vertex carries its colour,
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
  p: number[] = []; n: number[] = []; c: number[] = []; g: number[] = []; s: number[] = []; i: number[] = [];
  vert(p: V3, n: V3, c: V3, glow: number, sway: number, phase: number) {
    this.p.push(...p); this.n.push(...n); this.c.push(...c); this.g.push(glow); this.s.push(sway, phase);
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

  /** A thin tube along points (3 sides — stems are small). */
  stem(pts: V3[], r0: number, r1: number, col: V3, sway: (t: number) => number, phase: number) {
    const rings: number[][] = [];
    for (let k = 0; k < pts.length; k++) {
      const t = k / (pts.length - 1), d = norm(k < pts.length - 1 ? add(pts[k + 1], mul(pts[k], -1)) : add(pts[k], mul(pts[k - 1], -1)));
      const a = norm(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), b = cross(d, a), r = r0 + (r1 - r0) * t, ring: number[] = [];
      for (let s = 0; s < 3; s++) {
        const ang = (s / 3) * Math.PI * 2, o = add(mul(a, Math.cos(ang) * r), mul(b, Math.sin(ang) * r));
        ring.push(this.vert(add(pts[k], o), norm(o), col, 0, sway(t), phase));
      }
      rings.push(ring);
    }
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < 3; s++) {
      const a = rings[k][s], b = rings[k][(s + 1) % 3], c = rings[k + 1][s], d = rings[k + 1][(s + 1) % 3];
      this.tri(a, c, b); this.tri(b, c, d);
    }
  }

  done(height: number): PlantMesh {
    return { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), glow: new Float32Array(this.g), sway: new Float32Array(this.s), index: new Uint32Array(this.i), height };
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
