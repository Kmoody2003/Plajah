// Plajah Vegetation — score a grown species against its art (docs/plajah-vegetation.md §3, step 5).
//
// The grown tree is projected orthographically (front = x/y, side = z/y) into a mask: branches as thick segments, leaf
// cards as soft discs (a cluster card is mostly round once its alpha is applied). The art's cut-out is resampled into
// the same frame (both scaled to their height, centred on their own middle), and the two are compared:
//   iou      — silhouette overlap (shape),
//   density  — how close the crown's fill is (a see-through crown vs a solid one),
// and score = 0.8·iou + 0.2·density. fitSpecies() searches a few species knobs to raise it.
import type { TreeSpecies } from '../species';
import { growTree, type TreeSkeleton } from '../trees/grow';
import type { Mask } from './profile';

export type View = 'front' | 'side';
export interface Grid { w: number; h: number; v: Float32Array }

const N = 96;

function blank(): Grid { return { w: N, h: N, v: new Float32Array(N * N) }; }

/** The skeleton's silhouette from the front (x) or the side (z), scaled so its height fills the grid. */
export function silhouette(sk: TreeSkeleton, view: View): Grid {
  const g = blank();
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  const hx = (x: number, z: number) => (view === 'front' ? x : z);
  for (const n of sk.nodes) { const u = hx(n.x, n.z); minX = Math.min(minX, u - n.radius); maxX = Math.max(maxX, u + n.radius); maxY = Math.max(maxY, n.y + n.radius); }
  for (const l of sk.leaves) { const u = hx(l.x, l.z); minX = Math.min(minX, u - l.size / 2); maxX = Math.max(maxX, u + l.size / 2); maxY = Math.max(maxY, l.y + l.size / 2); }
  const scale = (N - 2) / Math.max(maxY, maxX - minX), cx = (minX + maxX) / 2;
  const toG = (u: number, y: number) => [N / 2 + (u - cx) * scale, N - 1 - y * scale] as const;
  const disc = (u: number, y: number, r: number, a: number) => {
    const [gx, gy] = toG(u, y), rr = Math.max(0.6, r * scale);
    for (let j = Math.floor(gy - rr); j <= Math.ceil(gy + rr); j++) for (let i = Math.floor(gx - rr); i <= Math.ceil(gx + rr); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      if ((i - gx) ** 2 + (j - gy) ** 2 <= rr * rr) g.v[i + j * N] = Math.max(g.v[i + j * N], a);
    }
  };
  for (const n of sk.nodes) {
    if (n.parent < 0) continue;
    const p = sk.nodes[n.parent];
    const len = Math.hypot(hx(n.x, n.z) - hx(p.x, p.z), n.y - p.y), steps = Math.max(1, Math.ceil(len * scale));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      disc(hx(p.x, p.z) + (hx(n.x, n.z) - hx(p.x, p.z)) * t, p.y + (n.y - p.y) * t, p.radius + (n.radius - p.radius) * t, 1);
    }
  }
  for (const l of sk.leaves) disc(hx(l.x, l.z), l.y, l.size * 0.42, 0.85);
  return g;
}

/** The art's cut-out (alpha) in the same frame: scaled by its own height and width, centred. */
export function artGrid(m: Mask): Grid {
  const s = m.stride ?? 4, c = m.channel ?? 3, g = blank();
  let x0 = m.width, x1 = 0, y0 = m.height, y1 = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.data[(x + y * m.width) * s + c] > 127) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const H = y1 - y0 + 1, W = x1 - x0 + 1, scale = (N - 2) / Math.max(H, W), cx = (x0 + x1) / 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = Math.round(cx + (i - N / 2) / scale), y = Math.round(y1 - (N - 1 - j) / scale);
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
    g.v[i + j * N] = m.data[(x + y * m.width) * s + c] / 255;
  }
  return g;
}

export function compare(a: Grid, b: Grid): { iou: number; density: number; score: number } {
  let inter = 0, uni = 0, fa = 0, fb = 0, na = 0, nb = 0;
  for (let i = 0; i < a.v.length; i++) {
    const p = a.v[i] > 0.5 ? 1 : 0, q = b.v[i] > 0.5 ? 1 : 0;
    inter += p & q; uni += p | q;
    if (a.v[i] > 0) { fa += a.v[i]; na++; } if (b.v[i] > 0) { fb += b.v[i]; nb++; }
  }
  const iou = uni ? inter / uni : 0;
  const density = 1 - Math.min(1, Math.abs(fa / Math.max(1, na) - fb / Math.max(1, nb)) * 2);
  return { iou: +iou.toFixed(3), density: +density.toFixed(3), score: +(0.8 * iou + 0.2 * density).toFixed(3) };
}

export function scoreSpecies(sp: TreeSpecies, art: Partial<Record<View, Mask>>, seeds = [1, 2, 3]): Record<View, number> & { mean: number } {
  const out: Record<string, number> = {};
  const views = Object.keys(art) as View[];
  for (const v of views) {
    const ag = artGrid(art[v]!);
    out[v] = seeds.reduce((s, seed) => s + compare(silhouette(growTree(sp, seed, { scale: 1 }), v), ag).score, 0) / seeds.length;
  }
  const mean = views.reduce((s, v) => s + out[v], 0) / Math.max(1, views.length);
  return { ...(out as Record<View, number>), mean: +mean.toFixed(3) };
}

/** Coordinate search over a few knobs (leaf size, crown fill, crown width, leaves per tip, trunk girth, root reach) to raise the art score. */
export function fitSpecies(sp: TreeSpecies, art: Partial<Record<View, Mask>>, rounds = 3): { species: TreeSpecies; before: number; after: number; scores: Record<string, number> } {
  const clone = (s: TreeSpecies): TreeSpecies => JSON.parse(JSON.stringify(s));
  let best = clone(sp), bestS = scoreSpecies(best, art).mean;
  const before = bestS;
  const knobs: ((s: TreeSpecies, k: number) => void)[] = [
    (s, k) => { s.leaves.size *= k; },
    (s, k) => { s.crown.attractors = Math.round(s.crown.attractors * k); },
    (s, k) => { s.crown.profile = s.crown.profile.map((p) => ({ y: p.y, r: p.r * k })); },
    (s, k) => { s.leaves.perTip = Math.max(1, Math.round(s.leaves.perTip * k)); },
    (s, k) => { s.trunk.radius *= k; },
    (s, k) => { s.trunk.rootReach *= k; },
  ];
  for (let r = 0; r < rounds; r++) {
    for (const knob of knobs) {
      for (const k of [0.8, 0.9, 1.12, 1.25]) {
        const c = clone(best); knob(c, k);
        const s = scoreSpecies(c, art).mean;
        if (s > bestS + 0.002) { best = c; bestS = s; }
      }
    }
  }
  const scores = scoreSpecies(best, art);
  best.provenance = { ...best.provenance, scores: { ...scores } };
  return { species: best, before: +before.toFixed(3), after: +bestS.toFixed(3), scores };
}
