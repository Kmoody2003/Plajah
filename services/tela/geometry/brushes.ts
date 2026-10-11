// brushes — Illustrator's art, pattern and scatter brushes as geometry generators.
//
// Brush artwork is authored HORIZONTALLY in its own coordinates: x runs along the stroke,
// y across it (centre = the bbox's mid height). Art brush stretches the art along the
// whole spine; pattern brush tiles side art (scaled to fit a whole number of tiles per
// corner-to-corner run) and drops corner tiles at sharp anchors; scatter brush stamps
// copies with size / spacing / scatter / rotation variation. The mapping keeps curves as
// curves (pathOps.mapPath subdivides until within tolerance), so results stay editable.
import type { Vec } from './vec';
import type { CompoundPath, Curve, SubPath } from './model';
import { subpathCurves } from './model';
import { arcTable, locate, point, tangent, normal, pathBounds, type ArcTable } from './bezier';
import { mapPath } from './pathOps';
import { transformPath, compose, translate, rotate, scale } from './transform';
import { Random } from './procedural/random';

function spineMap(tab: ArcTable, x0: number, x1: number, cy: number, halfH: number, width: number, s0: number, s1: number, flip = false) {
  return (q: Vec): Vec => {
    const u = (q.x - x0) / Math.max(1e-9, x1 - x0); const sArc = s0 + (s1 - s0) * u;
    const sc = Math.max(0, Math.min(tab.total, sArc)); const { i, t } = locate(tab, sc); const c = tab.curves[i];
    let p = point(c, t); const tn = tangent(c, t), n = normal(c, t);
    if (sArc < 0) p = { x: p.x + tn.x * sArc, y: p.y + tn.y * sArc }; else if (sArc > tab.total) p = { x: p.x + tn.x * (sArc - tab.total), y: p.y + tn.y * (sArc - tab.total) };
    const v = (q.y - cy) / Math.max(1e-9, halfH) * (flip ? -1 : 1); const off = -v * width / 2; // art "up" (−y) goes to the left side
    return { x: p.x + n.x * off, y: p.y + n.y * off };
  };
}

export interface ArtBrushOpts { width: number; flip?: boolean; tol?: number }
/** Art brush: stretch `art` (one or more paths) along every subpath of `spine`. */
export function artBrush(art: CompoundPath[], spine: CompoundPath, o: ArtBrushOpts): CompoundPath[] {
  const all = art.flatMap(a => a.subpaths); const b = pathBounds({ fillRule: 'nonzero', subpaths: all });
  const out: CompoundPath[] = [];
  for (const s of spine.subpaths) {
    const tab = arcTable(subpathCurves(s)); if (tab.total <= 0) continue;
    const f = spineMap(tab, b.x, b.x + b.w, b.y + b.h / 2, b.h / 2, o.width, 0, tab.total, o.flip);
    for (const a of art) out.push(mapPath(a, f, o.tol ?? .2));
  }
  return out;
}

export interface PatternBrushOpts { width: number; side: CompoundPath[]; outerCorner?: CompoundPath[]; start?: CompoundPath[]; end?: CompoundPath[]; /** Corner threshold (deg of turn). */ cornerAngle?: number; spacing?: number; tol?: number }
/** Pattern brush along a path. Returns the placed tile paths. */
export function patternBrush(spine: CompoundPath, o: PatternBrushOpts): CompoundPath[] {
  const sb = pathBounds({ fillRule: 'nonzero', subpaths: o.side.flatMap(p => p.subpaths) }); const tileW = sb.w + (o.spacing ?? 0);
  const out: CompoundPath[] = []; const cosT = Math.cos((o.cornerAngle ?? 35) * Math.PI / 180);
  for (const s of spine.subpaths) {
    const cs = subpathCurves(s); if (!cs.length) continue;
    // runs between corners
    const runs: Curve[][] = [[]]; const corners: Array<{ p: Vec; tin: Vec; tout: Vec }> = [];
    cs.forEach((c, i) => { if (i > 0) { const a = tangent(cs[i - 1], 1), b = tangent(c, 0); if (a.x * b.x + a.y * b.y < cosT) { runs.push([]); corners.push({ p: c.p0, tin: a, tout: b }); } } runs[runs.length - 1].push(c); });
    if (s.closed) { const a = tangent(cs[cs.length - 1], 1), b = tangent(cs[0], 0); if (a.x * b.x + a.y * b.y < cosT) corners.push({ p: cs[0].p0, tin: a, tout: b }); else if (runs.length > 1) { const f = runs.shift()!; runs[runs.length - 1].push(...f); } }
    const cornerInset = o.outerCorner ? o.width / 2 : 0;
    runs.forEach((run, ri) => {
      const tab = arcTable(run); const L = tab.total - (o.outerCorner ? cornerInset * 2 : 0); if (L <= 0) return;
      const n = Math.max(1, Math.round(L / tileW)); const seg = L / n; const s0 = o.outerCorner ? cornerInset : 0;
      for (let k = 0; k < n; k++) {
        const tiles = k === 0 && !s.closed && ri === 0 && o.start ? o.start : k === n - 1 && !s.closed && ri === runs.length - 1 && o.end ? o.end : o.side;
        const tb = pathBounds({ fillRule: 'nonzero', subpaths: tiles.flatMap(p => p.subpaths) });
        const f = spineMap(tab, tb.x, tb.x + tb.w + (o.spacing ?? 0), sb.y + sb.h / 2, sb.h / 2, o.width, s0 + seg * k, s0 + seg * (k + 1));
        for (const t of tiles) out.push(mapPath(t, f, o.tol ?? .2));
      }
    });
    if (o.outerCorner) {
      const cb = pathBounds({ fillRule: 'nonzero', subpaths: o.outerCorner.flatMap(p => p.subpaths) }); const c = { x: cb.x + cb.w / 2, y: cb.y + cb.h / 2 };
      for (const k of corners) {
        const ang = Math.atan2(k.tin.y + k.tout.y, k.tin.x + k.tout.x) * 180 / Math.PI; const sc = o.width / Math.max(cb.w, cb.h);
        for (const t of o.outerCorner) out.push(transformPath(t, compose(translate(-c.x, -c.y), scale(sc), rotate(ang), translate(k.p.x, k.p.y))));
      }
    }
  }
  return out;
}

export interface ScatterBrushOpts { spacing: number; size?: [number, number]; scatter?: [number, number]; rotation?: [number, number]; relativeToPath?: boolean; seed?: number | string }
/** Scatter brush: stamps `art` along the path. size/spacing are relative to the art's size. */
export function scatterBrush(art: CompoundPath[], spine: CompoundPath, o: ScatterBrushOpts): CompoundPath[] {
  const R = new Random(o.seed ?? 1); const b = pathBounds({ fillRule: 'nonzero', subpaths: art.flatMap(p => p.subpaths) }); const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; const sz = Math.max(b.w, b.h) || 1;
  const out: CompoundPath[] = [];
  for (const s of spine.subpaths) {
    const tab = arcTable(subpathCurves(s)); if (tab.total <= 0) continue;
    const step = o.spacing * sz; const n = Math.max(1, Math.floor(tab.total / step));
    for (let i = 0; i <= n; i++) {
      const d = Math.min(tab.total, i * step); const { i: ci, t } = locate(tab, d); const cc = tab.curves[ci]; const p = point(cc, t), tn = tangent(cc, t), nn = normal(cc, t);
      const k = R.float(...(o.size ?? [1, 1])); const sc = R.float(...(o.scatter ?? [0, 0])) * sz; const rot = R.float(...(o.rotation ?? [0, 0])) + (o.relativeToPath !== false ? Math.atan2(tn.y, tn.x) * 180 / Math.PI : 0);
      const at = { x: p.x + nn.x * sc, y: p.y + nn.y * sc };
      for (const a of art) out.push(transformPath(a, compose(translate(-c.x, -c.y), scale(k), rotate(rot), translate(at.x, at.y))));
    }
  }
  return out;
}
export type { SubPath };
