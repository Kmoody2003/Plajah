// scatter — point distributions for procedural art: Poisson-disc (Bridson 2007) with an
// optional density field and region mask, jittered grids, and points along paths.
// Blue-noise spacing is what makes stipple, grass, leaves and stars look placed by hand
// instead of sprayed by a random number generator.
import type { Vec, Rect } from '../vec';
import type { CompoundPath } from '../model';
import { containsPoint } from '../boolean';
import { pathBounds } from '../bezier';
import { rng } from './random';

export interface PoissonOpts {
  /** Minimum spacing (px). With `density`, the spacing at density 1. */
  r: number; seed?: number | string; k?: number;
  /** Region mask (points outside are rejected). */
  region?: CompoundPath;
  /** 0..1 density: spacing grows as r / sqrt(density). */
  density?: (x: number, y: number) => number;
  max?: number;
}
/** Poisson-disc samples in a rect (or a region's bounds). */
export function poisson(rect: Rect | null, o: PoissonOpts): Vec[] {
  const R = rng(o.seed ?? 1); const k = o.k ?? 24; const box = rect ?? (o.region ? pathBounds(o.region) : { x: 0, y: 0, w: 100, h: 100 });
  const rmin = o.r; const cell = rmin / Math.SQRT2; const gw = Math.ceil(box.w / cell) + 1, gh = Math.ceil(box.h / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1); const pts: Vec[] = []; const radii: number[] = []; const active: number[] = [];
  const rAt = (p: Vec) => o.density ? rmin / Math.sqrt(Math.max(.02, Math.min(1, o.density(p.x, p.y)))) : rmin;
  const ok = (p: Vec, r: number) => {
    if (p.x < box.x || p.y < box.y || p.x > box.x + box.w || p.y > box.y + box.h) return false;
    const gx = Math.floor((p.x - box.x) / cell), gy = Math.floor((p.y - box.y) / cell); const span = Math.ceil(r / cell) + 1;
    for (let y = Math.max(0, gy - span); y <= Math.min(gh - 1, gy + span); y++) for (let x = Math.max(0, gx - span); x <= Math.min(gw - 1, gx + span); x++) {
      const i = grid[y * gw + x]; if (i < 0) continue; const q = pts[i]; const rr = Math.max(r, radii[i]);
      if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < rr * rr) return false;
    }
    return true;
  };
  const insert = (p: Vec, r: number) => { const i = pts.push(p) - 1; radii.push(r); active.push(i); const gx = Math.floor((p.x - box.x) / cell), gy = Math.floor((p.y - box.y) / cell); if (grid[gy * gw + gx] < 0) grid[gy * gw + gx] = i; };
  const inRegion = (p: Vec) => !o.region || containsPoint(o.region, p);
  // seed: try a few random starts inside the region
  for (let t = 0; t < 60 && !pts.length; t++) { const p = { x: box.x + R() * box.w, y: box.y + R() * box.h }; if (inRegion(p)) insert(p, rAt(p)); }
  const max = o.max ?? 20000;
  while (active.length && pts.length < max) {
    const ai = Math.floor(R() * active.length); const p = pts[active[ai]]; const r = radii[active[ai]]; let placed = false;
    for (let j = 0; j < k; j++) {
      const a = R() * Math.PI * 2, d = r * (1 + R()); const q = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
      const rq = rAt(q);
      if (ok(q, rq) && inRegion(q)) { insert(q, rq); placed = true; break; }
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}
/** Jittered grid (cheaper than Poisson; good for tiles and halftone cells). */
export function jitterGrid(rect: Rect, step: number, jitter = .35, seed: number | string = 1): Vec[] {
  const R = rng(seed); const out: Vec[] = [];
  for (let y = rect.y + step / 2; y < rect.y + rect.h; y += step) for (let x = rect.x + step / 2; x < rect.x + rect.w; x += step) out.push({ x: x + (R() * 2 - 1) * jitter * step, y: y + (R() * 2 - 1) * jitter * step });
  return out;
}
