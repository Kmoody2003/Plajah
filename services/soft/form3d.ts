// 3D preview forms: a quick look at the sewn result, not a drape simulation. Plush panels are
// inflated (each point of the outline pushed out by a round profile of its distance to the seam, so
// thin arms stay thin and the belly is full); garments are elliptical tubes and cones sized from
// the pattern's finished measurements; home textiles and bags are slabs and boxes. Pure geometry
// here, so it is testable; components/soft/Preview3D.tsx turns it into three.js meshes.

import { type Pt, bbox, dist } from './geometry';
import type { FormPart, Pattern } from './patterns';

const fin = (p: Pattern, re: RegExp, d: number) => p.finished.find(([k]) => re.test(k))?.[1] ?? d;

/** The preview solids for a pattern: its own `form`, else derived from the template. */
export function formOf(p: Pattern): FormPart[] {
  if (p.form?.length) return p.form;
  if (p.kind === 'plush') {
    if (p.template === 'plush-ball') { const r = fin(p, /Diameter/, 200) / 2; return [{ kind: 'ellipsoid', at: [0, r, 0], r: [r, r, r] }]; }
    const front = p.pieces.find(x => x.id === 'front'); if (!front) return [];
    const base = p.pieces.find(x => x.id.startsWith('base')); const depth = base ? bbox(base.seam).h : bbox(front.seam).w * 0.5;
    return [{ kind: 'inflate', outline: front.seam, depth, fabric: front.fabric }];
  }
  if (p.template === 'skirt') { const w = fin(p, /Waist/, 900), L = fin(p, /Length/, 600); return [{ kind: 'tube', a: [0, L, 0], b: [0, 0, 0], ra: w / (2 * Math.PI) * 0.75, rb: w / (2 * Math.PI) * 1.1, squash: 0.8 }]; }
  if (p.template === 'tote') { const w = fin(p, /Width/, 380), h = fin(p, /Height/, 400), g = fin(p, /Gusset/, 100); return [{ kind: 'box', at: [0, h / 2, 0], size: [w, h, Math.max(20, g)] }, { kind: 'tube', a: [-w * 0.25, h, 0], b: [w * 0.25, h, 0], ra: 8, rb: 8 }]; }
  if (p.template === 'pillow-envelope') { const w = fin(p, /Width/, 450), h = fin(p, /Height/, 450); return [{ kind: 'ellipsoid', at: [0, h / 2, 0], r: [w / 2, h / 2, Math.min(w, h) * 0.14] }]; }
  if (p.template === 'fitted-sheet') { const w = fin(p, /Mattress width/, 1520), l = fin(p, /Mattress length/, 2030), d = fin(p, /Depth/, 300); return [{ kind: 'box', at: [0, d / 2, 0], size: [w, d, l] }]; }
  const w = fin(p, /Width/, 1200), h = fin(p, /Length|Height/, 1500);
  return [{ kind: 'box', at: [0, 5, 0], size: [w, 10, h] }];
}

/** Distance from a point to a closed polyline. */
export function distToRing(q: Pt, ring: Pt[]): number {
  let best = Infinity; const n = ring.length;
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); const d = dist(q, [a[0] + dx * t, a[1] + dy * t]); if (d < best) best = d; }
  return best;
}
export function inside(q: Pt, ring: Pt[]): boolean {
  let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c;
}
const nearest = (q: Pt, ring: Pt[]): Pt => {
  let best: Pt = ring[0], bd = Infinity; const n = ring.length;
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); const c: Pt = [a[0] + dx * t, a[1] + dy * t]; const d = dist(q, c); if (d < bd) { bd = d; best = c; } }
  return best;
};

/**
 * Inflate a flat outline into a closed, pillowy surface (front z ≥ 0, back z ≤ 0). A grid covers the
 * outline; inside points rise on a round profile of their distance to the seam, outside points snap
 * onto the seam at z = 0, and cells wholly outside are dropped. Returns positions and triangle indices.
 */
export function inflate(outline: Pt[], depth: number, n = 64): { positions: Float32Array; indices: Uint32Array } {
  const b = bbox(outline); const step = Math.max(b.w, b.h) / n; const nx = Math.ceil(b.w / step) + 3, ny = Math.ceil(b.h / step) + 3;
  const x0 = b.x0 - step, y0 = b.y0 - step; const grid: Array<{ p: Pt; z: number; in: boolean }> = [];
  let dmax = 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q: Pt = [x0 + i * step, y0 + j * step]; const ins = inside(q, outline); const d = ins ? distToRing(q, outline) : 0; if (d > dmax) dmax = d; grid.push({ p: ins ? q : nearest(q, outline), z: d, in: ins }); }
  const half = depth / 2; const prof = (d: number) => { const t = Math.min(1, d / dmax); return half * Math.sqrt(1 - (1 - t) * (1 - t)); };
  const pos: number[] = [], idx: number[] = []; const N = nx * ny;
  for (const side of [1, -1]) for (const g of grid) pos.push(g.p[0], g.p[1], side * prof(g.z));
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, bq = a + 1, c = a + nx + 1, d = a + nx; if (!(grid[a].in || grid[bq].in || grid[c].in || grid[d].in)) continue;
    idx.push(a, bq, c, a, c, d); idx.push(N + a, N + c, N + bq, N + a, N + d, N + c);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
