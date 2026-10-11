// hittest — what the Studio's vector UI asks of geometry: is the pointer inside a fill
// (fill rule aware), near a stroke, on an anchor or a handle, inside a marquee; and
// where should a dragged point/box snap (point, grid, 45° angle, smart guides aligning
// to other objects' anchors, edges and centres).
import type { Vec, Rect } from './vec';
import type { CompoundPath, FillRule } from './model';
import { subpathCurves } from './model';
import { nearest, bounds as curveBounds, pathBounds } from './bezier';
import { containsPoint } from './boolean';
import { rectsOverlap, rectContains } from './vec';
import { curveCurve } from './intersect';
import { lineCurve } from './model';

/** Fill hit (fill-rule aware). */
export const hitFill = (p: CompoundPath, pt: Vec, rule: FillRule = p.fillRule) => containsPoint(p, pt, rule);

/** Distance from a point to the path outline, with the location. */
export function distanceToPath(p: CompoundPath, pt: Vec): { dist: number; sub: number; seg: number; t: number; point: Vec } {
  let best = { dist: Infinity, sub: -1, seg: -1, t: 0, point: pt };
  p.subpaths.forEach((s, si) => subpathCurves(s).forEach((c, ci) => {
    const b = curveBounds(c); const dx = Math.max(b.x - pt.x, 0, pt.x - b.x - b.w), dy = Math.max(b.y - pt.y, 0, pt.y - b.y - b.h);
    if (Math.hypot(dx, dy) > best.dist) return;
    const n = nearest(c, pt); if (n.dist < best.dist) best = { dist: n.dist, sub: si, seg: ci, t: n.t, point: n.point };
  }));
  return best;
}
/** Stroke hit: within half the stroke width plus a tolerance (screen px / zoom). */
export const hitStroke = (p: CompoundPath, pt: Vec, strokeWidth: number, tol = 3) => distanceToPath(p, pt).dist <= strokeWidth / 2 + tol;

export type AnchorHit = { sub: number; anchor: number; part: 'anchor' | 'in' | 'out' } | null;
/** Anchor / handle under the pointer (handles first: they sit on top in the UI). */
export function hitAnchor(p: CompoundPath, pt: Vec, tol = 5, withHandles = true): AnchorHit {
  let best: AnchorHit = null, bd = tol;
  p.subpaths.forEach((s, si) => s.anchors.forEach((a, ai) => {
    const cands: Array<[Vec | undefined, 'anchor' | 'in' | 'out']> = withHandles ? [[a.hin, 'in'], [a.hout, 'out'], [a, 'anchor']] : [[a, 'anchor']];
    for (const [q, part] of cands) { if (!q) continue; const d = Math.hypot(q.x - pt.x, q.y - pt.y); if (d <= bd) { bd = d; best = { sub: si, anchor: ai, part }; } }
  }));
  return best;
}
/** Marquee selection: fully-inside or touching mode. */
export function inMarquee(p: CompoundPath, r: Rect, mode: 'touch' | 'contain' = 'touch'): boolean {
  const b = pathBounds(p);
  if (mode === 'contain') return rectContains(r, { x: b.x, y: b.y }) && rectContains(r, { x: b.x + b.w, y: b.y + b.h });
  if (!rectsOverlap(b, r)) return false;
  if (p.subpaths.some(s => s.anchors.some(a => rectContains(r, a)))) return true;
  // an edge crossing the marquee, or the marquee inside a fill
  const edges = [lineCurve({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }), lineCurve({ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }), lineCurve({ x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }), lineCurve({ x: r.x, y: r.y + r.h }, { x: r.x, y: r.y })];
  for (const s of p.subpaths) for (const c of subpathCurves(s)) for (const e of edges) if (curveCurve(c, e).length) return true;
  return containsPoint(p, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}
/** Anchors inside a marquee (direct selection). */
export function anchorsInRect(p: CompoundPath, r: Rect): Array<[number, number]> { const out: Array<[number, number]> = []; p.subpaths.forEach((s, si) => s.anchors.forEach((a, ai) => { if (rectContains(r, a)) out.push([si, ai]); })); return out; }

/** Visual bounds including stroke (approximation: geometric bounds grown by half the stroke, miter-aware). */
export function visualBounds(p: CompoundPath, strokeWidth = 0, miter = false): Rect {
  const b = pathBounds(p); const g = strokeWidth / 2 * (miter ? 2 : 1); return { x: b.x - g, y: b.y - g, w: b.w + g * 2, h: b.h + g * 2 };
}

// ── Snapping ────────────────────────────────────────────────────────────────────────

export interface SnapTargets { points?: Vec[]; xs?: number[]; ys?: number[] }
export interface SnapOpts { tol?: number; grid?: number; angleFrom?: Vec; angleStep?: number; targets?: SnapTargets }
export interface SnapResult { p: Vec; guides: Array<{ axis: 'x' | 'y'; at: number; from: number; to: number; kind: string }>; snapped: boolean }

/** Snap a point: exact point targets > guide lines > angle constraint > grid. */
export function snapPoint(p: Vec, o: SnapOpts): SnapResult {
  const tol = o.tol ?? 6; const guides: SnapResult['guides'] = []; let q = { ...p }; let snapped = false;
  if (o.targets?.points) { let bd = tol; for (const t of o.targets.points) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d <= bd) { bd = d; q = { ...t }; snapped = true; } } if (snapped) return { p: q, guides, snapped }; }
  if (o.angleFrom && o.angleStep) {
    const a = Math.atan2(p.y - o.angleFrom.y, p.x - o.angleFrom.x); const st = o.angleStep * Math.PI / 180; const sa = Math.round(a / st) * st; const r = Math.hypot(p.x - o.angleFrom.x, p.y - o.angleFrom.y);
    q = { x: o.angleFrom.x + Math.cos(sa) * r, y: o.angleFrom.y + Math.sin(sa) * r }; snapped = true;
  }
  let sx = false, sy = false;
  if (o.targets?.xs) { let bd = tol; for (const x of o.targets.xs) { const d = Math.abs(x - q.x); if (d <= bd) { bd = d; q.x = x; sx = true; } } if (sx) guides.push({ axis: 'x', at: q.x, from: q.y, to: q.y, kind: 'align' }); }
  if (o.targets?.ys) { let bd = tol; for (const y of o.targets.ys) { const d = Math.abs(y - q.y); if (d <= bd) { bd = d; q.y = y; sy = true; } } if (sy) guides.push({ axis: 'y', at: q.y, from: q.x, to: q.x, kind: 'align' }); }
  if (o.grid && !sx && !o.angleFrom) q.x = Math.round(q.x / o.grid) * o.grid;
  if (o.grid && !sy && !o.angleFrom) q.y = Math.round(q.y / o.grid) * o.grid;
  return { p: q, guides, snapped: snapped || sx || sy || !!o.grid };
}

/** Smart guides for a moving box against other objects' boxes (edges + centres). Returns the delta to apply and guides to draw. */
export function smartGuides(moving: Rect, others: Rect[], tol = 5): { dx: number; dy: number; guides: SnapResult['guides'] } {
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w], my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  type Hit = { d: number; at: number; o: Rect; kind: string }; let bx: Hit | null = null as Hit | null, by: Hit | null = null as Hit | null;
  for (const o of others) {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w], oy = [o.y, o.y + o.h / 2, o.y + o.h];
    mx.forEach((a, i) => ox.forEach((b, j) => { const d = b - a; if (Math.abs(d) <= tol && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: b, o, kind: i === 1 || j === 1 ? 'center' : 'edge' }; }));
    my.forEach((a, i) => oy.forEach((b, j) => { const d = b - a; if (Math.abs(d) <= tol && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: b, o, kind: i === 1 || j === 1 ? 'center' : 'edge' }; }));
  }
  const guides: SnapResult['guides'] = []; const X = bx as { d: number; at: number; o: Rect; kind: string } | null, Y = by as typeof X;
  if (X) guides.push({ axis: 'x', at: X.at, from: Math.min(moving.y, X.o.y), to: Math.max(moving.y + moving.h, X.o.y + X.o.h), kind: X.kind });
  if (Y) guides.push({ axis: 'y', at: Y.at, from: Math.min(moving.x, Y.o.x), to: Math.max(moving.x + moving.w, Y.o.x + Y.o.w), kind: Y.kind });
  return { dx: X ? X.d : 0, dy: Y ? Y.d : 0, guides };
}
/** Snap targets from other paths: anchors as points, and their bbox edges/centres as guide lines. */
export function targetsFrom(paths: CompoundPath[]): SnapTargets {
  const points: Vec[] = [], xs: number[] = [], ys: number[] = [];
  for (const p of paths) { for (const s of p.subpaths) for (const a of s.anchors) points.push({ x: a.x, y: a.y }); const b = pathBounds(p); xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); }
  return { points, xs, ys };
}
/** Shift-constrain a vector to multiples of `step` degrees (default 45°). */
export function constrainAngle(from: Vec, to: Vec, step = 45): Vec { return snapPoint(to, { angleFrom: from, angleStep: step }).p; }
