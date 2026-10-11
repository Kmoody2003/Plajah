// clip — geometric clipping that the editor can show (no SVG clip-path needed).
//
// Filled shapes clip with boolean intersect; OPEN paths (hatch lines, ink strokes,
// grass, outlines) are cut at their crossings with the clip region's boundary and the
// pieces whose midpoints are inside are kept — curves stay curves.
import type { CompoundPath, Curve, SubPath } from './model';
import { subpathCurves, curvesToSubpath, lineCurve } from './model';
import { splitMany, point, hullBounds } from './bezier';
import { curveCurve } from './intersect';
import { containsPoint, boolean } from './boolean';
import { rectsOverlap } from './vec';

function regionCurves(region: CompoundPath): Curve[] {
  const out: Curve[] = [];
  for (const s of region.subpaths) { out.push(...subpathCurves(s)); if (!s.closed && s.anchors.length > 1) { const A = s.anchors; out.push(lineCurve(A[A.length - 1], A[0])); } }
  return out;
}

/** Keep the parts of an open path inside (or outside) a region. */
export function clipOpenPath(p: CompoundPath, region: CompoundPath, keep: 'inside' | 'outside' = 'inside'): CompoundPath {
  const rc = regionCurves(region); const rb = rc.map(hullBounds);
  const subs: SubPath[] = [];
  for (const s of p.subpaths) {
    const cs = subpathCurves(s); let run: Curve[] = [];
    const flush = () => { if (run.length) subs.push(curvesToSubpath(run, false)); run = []; };
    for (const c of cs) {
      const ts: number[] = []; const cb = hullBounds(c);
      rc.forEach((r, i) => { if (!rectsOverlap(cb, rb[i], 1e-6)) return; for (const h of curveCurve(c, r, 1e-7)) if (h.ta > 1e-7 && h.ta < 1 - 1e-7) ts.push(h.ta); });
      ts.sort((a, b) => a - b);
      const pieces = splitMany(c, ts);
      for (const pc of pieces) {
        const inside = containsPoint(region, point(pc, .5));
        if (inside === (keep === 'inside')) run.push(pc); else flush();
      }
    }
    flush();
  }
  return { fillRule: p.fillRule, subpaths: subs };
}

/** Clip anything: closed shapes by boolean, open ones by cutting. */
export function clipPath(p: CompoundPath, region: CompoundPath, keep: 'inside' | 'outside' = 'inside'): CompoundPath {
  const closed = { fillRule: p.fillRule, subpaths: p.subpaths.filter(s => s.closed) };
  const open = { fillRule: p.fillRule, subpaths: p.subpaths.filter(s => !s.closed) };
  const out: SubPath[] = [];
  if (closed.subpaths.length) out.push(...boolean(keep === 'inside' ? 'intersect' : 'subtract', [closed, region]).subpaths);
  if (open.subpaths.length) out.push(...clipOpenPath(open, region, keep).subpaths);
  return { fillRule: 'nonzero', subpaths: out };
}
