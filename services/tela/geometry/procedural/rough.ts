// rough — hand-drawn line wobble (own implementation, in the spirit of sketchy renderers).
//
// A hand-drawn line differs from a perfect one in four ways we model directly:
//   1. low-frequency drift along the normal (the hand is not a ruler) — smooth noise;
//   2. bowing: a long straight stroke bulges slightly toward one side;
//   3. ends: it overshoots or stops short, so corners don't close perfectly;
//   4. multiple passes: a second, slightly different pass on top (sketchy look).
// Output stays bezier (resampled, displaced, refitted), so it remains editable.
import type { Vec } from '../vec';
import type { CompoundPath, SubPath } from '../model';
import { subpathCurves } from '../model';
import { arcTable, locate, point, normal, tangent } from '../bezier';
import { smoothThrough } from '../shapes';
import { simplex2 } from './noise';
import { Random } from './random';

export interface RoughOpts {
  /** Drift amplitude (px). */ roughness?: number;
  /** Bow as a fraction of segment length. */ bowing?: number;
  /** Overshoot / undershoot at open ends and corners (px). */ overshoot?: number;
  /** Extra sketch passes (0 = one clean pass). */ passes?: number;
  /** Sample spacing (px). */ step?: number;
  seed?: number | string;
  /** Break closed shapes at corners into separate strokes (pen lifts). */ lift?: boolean;
}
/** Hand-drawn version of a path; returns open subpaths (stroke them, or ink() them). */
export function rough(p: CompoundPath, o: RoughOpts = {}): CompoundPath {
  const R = new Random(o.seed ?? 1); const out: SubPath[] = [];
  const passes = 1 + (o.passes ?? 0);
  for (let pass = 0; pass < passes; pass++) {
    const nz = simplex2(R.int(0, 1e6)); const amp = (o.roughness ?? 1.6) * (pass ? 1.25 : 1);
    for (const s of p.subpaths) {
      const cs = subpathCurves(s); if (!cs.length) continue;
      const strokes = o.lift ? splitAtCorners(cs) : [cs];
      for (const run of strokes) {
        const tab = arcTable(run); const L = tab.total; if (L < 1e-6) continue;
        const step = o.step ?? Math.max(6, Math.min(24, L / 10)); const n = Math.max(3, Math.round(L / step));
        const bow = (o.bowing ?? .015) * L * R.jit(1); const os = o.overshoot ?? Math.min(6, L * .03);
        const start = s.closed && !o.lift ? R.jit(os) : -R.float(0, os), end = s.closed && !o.lift ? L + os * R.float(.3, 1) : L + R.jit(os);
        const pts: Vec[] = [];
        for (let i = 0; i <= n; i++) {
          const d = start + (end - start) * i / n; const dc = Math.max(0, Math.min(L, d));
          const { i: ci, t } = locate(tab, dc); const c = tab.curves[ci]; let q = point(c, t); const nn = normal(c, t), tt = tangent(c, t);
          if (d < 0) q = { x: q.x + tt.x * d, y: q.y + tt.y * d }; else if (d > L) q = { x: q.x + tt.x * (d - L), y: q.y + tt.y * (d - L) };
          const u = dc / L; const off = nz(u * L / 90 + pass * 7, pass * 3.3) * amp + Math.sin(Math.PI * u) * bow;
          pts.push({ x: q.x + nn.x * off, y: q.y + nn.y * off });
        }
        out.push(...smoothThrough(pts, false, .5).subpaths);
      }
    }
  }
  return { fillRule: 'nonzero', subpaths: out };
}
function splitAtCorners(cs: ReturnType<typeof subpathCurves>) {
  const runs: typeof cs[] = [[]];
  cs.forEach((c, i) => { if (i > 0) { const a = tangent(cs[i - 1], 1), b = tangent(c, 0); if (a.x * b.x + a.y * b.y < .85) runs.push([]); } runs[runs.length - 1].push(c); });
  return runs.filter(r => r.length);
}
/** Jitter a closed shape's outline (fills that look cut or painted by hand). */
export function wobbleOutline(p: CompoundPath, amp = 2, seed: number | string = 1, step = 18): CompoundPath {
  const R = new Random(seed); const nz = simplex2(R.int(0, 1e6)); const out: SubPath[] = [];
  for (const s of p.subpaths) {
    const tab = arcTable(subpathCurves(s)); const L = tab.total; if (L < 1e-6) continue;
    const n = Math.max(6, Math.round(L / step)); const pts: Vec[] = [];
    for (let i = 0; i < n; i++) { const { i: ci, t } = locate(tab, L * i / n); const c = tab.curves[ci]; const q = point(c, t), nn = normal(c, t); const k = nz(Math.cos(i / n * Math.PI * 2) * 1.5, Math.sin(i / n * Math.PI * 2) * 1.5) * amp; pts.push({ x: q.x + nn.x * k, y: q.y + nn.y * k }); }
    out.push(...smoothThrough(pts, s.closed, .5).subpaths);
  }
  return { fillRule: p.fillRule, subpaths: out };
}
