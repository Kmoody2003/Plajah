// Print-time estimate that accounts for acceleration: every move gets a trapezoidal speed profile,
// corner speeds come from junction deviation (the cornering model Marlin and GRBL use; Klipper's
// square-corner velocity is equivalent), and a backward then forward pass keeps every entry and exit
// speed reachable within the move lengths, like a firmware planner's look-ahead.

import type { Move } from './cam';

export interface EstimateOptions {
  /** Printing acceleration, mm/s². */ accel?: number;
  /** Travel acceleration, mm/s² (defaults to `accel`). */ travelAccel?: number;
  /** Machine speed cap, mm/s. */ maxSpeed?: number;
  /** Junction deviation, mm. */ junction?: number;
}

interface Seg { L: number; v: number; a: number; ux: number; uy: number; uz: number; chainStart: boolean }

/** Seconds a move takes from entry speed `e` to exit speed `x` at cruise `v` with acceleration `a`. */
export function trapezoid(L: number, v: number, a: number, e: number, x: number): number {
  if (L <= 0) return 0;
  const dAcc = Math.max(0, (v * v - e * e) / (2 * a)), dDec = Math.max(0, (v * v - x * x) / (2 * a));
  if (dAcc + dDec <= L) return (v - e) / a + (v - x) / a + (L - dAcc - dDec) / v;
  const vp = Math.sqrt(Math.max(e * e, x * x, (2 * a * L + e * e + x * x) / 2));
  return Math.max(0, (vp - e) / a) + Math.max(0, (vp - x) / a);
}

export function estimateSeconds(moves: Move[], o: EstimateOptions = {}): number {
  const A = o.accel ?? 1000, AT = o.travelAccel ?? A, cap = o.maxSpeed ?? Infinity, jd = o.junction ?? 0.02;
  let x = 0, y = 0, z = 0, e = 0, f = 1500; let extra = 0; const segs: Seg[] = []; let breakNext = true;
  for (const m of moves) {
    if (m.t === 'dwell') { extra += m.s; breakNext = true; continue; }
    if (m.t !== 'rapid' && m.t !== 'feed') continue;
    if (m.f) f = m.f;
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z; const ne = m.t === 'feed' && m.e !== undefined ? m.e : e;
    const dx = nx - x, dy = ny - y, dz = nz - z; const L = Math.hypot(dx, dy, dz); const v = Math.min(cap, f / 60);
    if (L < 1e-9) {
      // Filament-only move (retract / prime): its own little trapezoid, and the head stops for it.
      const de = Math.abs(ne - e); if (de > 0) { extra += trapezoid(de, v, A, 0, 0); breakNext = true; }
    } else {
      const zOnly = Math.abs(dz) > 1e-9 && Math.hypot(dx, dy) < 1e-9;
      segs.push({ L, v, a: zOnly ? Math.min(A, 500) : m.t === 'rapid' || ne === e ? AT : A, ux: dx / L, uy: dy / L, uz: dz / L, chainStart: breakNext || zOnly });
      breakNext = zOnly;
    }
    x = nx; y = ny; z = nz; e = ne;
  }
  const n = segs.length; if (!n) return extra;
  // Entry speed limits: zero at chain starts, junction speed between moves otherwise.
  const entry = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const s = segs[i]; if (s.chainStart || i === 0) { entry[i] = 0; continue; }
    const p = segs[i - 1]; const cos = -(p.ux * s.ux + p.uy * s.uy + p.uz * s.uz); // cos of the angle between the two paths at the corner
    let vj: number;
    if (cos < -0.9999) vj = Math.min(p.v, s.v);
    else if (cos > 0.9999) vj = 0;
    else { const sinHalf = Math.sqrt(0.5 * (1 - cos)); vj = Math.sqrt(Math.min(p.a, s.a) * jd * sinHalf / (1 - sinHalf)); }
    entry[i] = Math.min(vj, p.v, s.v);
  }
  entry[n] = 0;
  for (let i = n - 1; i >= 0; i--) entry[i] = Math.min(entry[i], Math.sqrt(entry[i + 1] ** 2 + 2 * segs[i].a * segs[i].L));
  for (let i = 0; i < n; i++) entry[i + 1] = Math.min(entry[i + 1], Math.sqrt(entry[i] ** 2 + 2 * segs[i].a * segs[i].L));
  let t = extra; for (let i = 0; i < n; i++) t += trapezoid(segs[i].L, segs[i].v, segs[i].a, entry[i], entry[i + 1]);
  return t;
}
