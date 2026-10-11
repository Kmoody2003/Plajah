// studio/objectGeom — the bridge between Tela objects and editable geometry for the Studio.
//
// Why: the editor must treat every vector object (box kinds, legacy polylines, traced
// pathNodes, origin-mapped svgPathData, engine paths with geom) as one thing: an affine-mapped
// compound path with paint. This module owns that mapping so tools never special-case kinds:
//   objectMatrix(o)        origin space → artboard (pathOrigin box mapping, then rotation)
//   pathOf(o)              editable path in artboard px (cached per immutable object)
//   withPath(o, path)      replace the geometry, keep id/paint/metadata (legacy → engine PATH)
//   normalizeObject(o)     bake mapping + rotation into identity (paints, clip, live source too)
//   transformObject(o, m)  apply an affine with the cheapest faithful representation
//   translateObject(o,…)   the hot path for moves (x/y only, never re-parses geometry)
//   boundsOf(o)            artboard AABB of the drawn shape (cached)
import type { TelaVectorObject } from '../../../types';
import type { CompoundPath, Matrix, Paint, TelaGeomExt } from '../geometry/model';
import type { Rect, Vec } from '../geometry/vec';
import { objectToPath, pathToObject, legacyColor, legacyGradient } from '../geometry/tela';
import { parsePathData, toPathData } from '../geometry/pathData';
import { transformPath, translate, scale, rotate, compose, multiply, apply, invert, meanScale, IDENTITY } from '../geometry/transform';
import { pathBounds } from '../geometry/bezier';
import { studioOf, compactStudio, type TelaStudioObjectExt } from './model';

const EPS = 1e-9;

/** Kinds whose geometry the Studio can edit as a path. */
export const isPathish = (o: TelaVectorObject) => o.kind === 'RECT' || o.kind === 'ELLIPSE' || o.kind === 'LINE' || (o.kind === 'PATH' && !!(o.svgPathData || o.pathNodes?.length || o.points?.length));
/** Engine-set type (glyph outlines baked, story in studio.type). */
export const isEngineText = (o: TelaVectorObject) => o.kind === 'TEXT' && !!o.studio?.type;

/** Origin space → artboard. Box kinds have origin = artboard, so only rotation applies. */
export function objectMatrix(o: TelaVectorObject): Matrix {
  let m: Matrix = IDENTITY;
  if (o.kind === 'PATH' && o.svgPathData) {
    const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y;
    const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h);
    m = compose(translate(-ox, -oy), scale(sx, sy), translate(o.x, o.y));
  }
  if (o.rotation) m = multiply(rotate(o.rotation, { x: o.x + o.w / 2, y: o.y + o.h / 2 }), m);
  return m;
}
export const isIdentity = (m: Matrix) => Math.abs(m[0] - 1) < EPS && Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS && Math.abs(m[3] - 1) < EPS && Math.abs(m[4]) < EPS && Math.abs(m[5]) < EPS;

// ── Cached geometry ─────────────────────────────────────────────────────────────────

const pathCache = new WeakMap<TelaVectorObject, CompoundPath | null>();
/** Editable path in artboard px (null for TEXT/LOTTIE/MOTION). Do not mutate the result. */
export function pathOf(o: TelaVectorObject): CompoundPath | null {
  if (pathCache.has(o)) return pathCache.get(o)!;
  let p: CompoundPath | null = null;
  try { p = objectToPath(o); } catch { p = null; }
  pathCache.set(o, p); return p;
}

const boundsCache = new WeakMap<TelaVectorObject, Rect>();
/** Artboard-space axis-aligned bounds of what is drawn (rotation-aware, stroke excluded). */
export function boundsOf(o: TelaVectorObject): Rect {
  const hit = boundsCache.get(o); if (hit) return hit;
  let r: Rect;
  const p = isPathish(o) ? pathOf(o) : null;
  if (p && p.subpaths.some(s => s.anchors.length)) { const b = pathBounds(p); r = { x: b.x, y: b.y, w: Math.max(b.w, .001), h: Math.max(b.h, .001) }; }
  else {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (o.rotation) {
      const m = rotate(o.rotation, { x: cx, y: cy });
      const pts = [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }].map(q => apply(m, q));
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    } else r = { x: o.x, y: o.y, w: Math.max(o.w, .001), h: Math.max(o.h, .001) };
  }
  boundsCache.set(o, r); return r;
}
export function unionBounds(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rs) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ── Mapping geom / studio data through a matrix ─────────────────────────────────────

function mapPaint(p: Paint, m: Matrix): Paint {
  if (typeof p === 'string') return p;
  switch (p.type) {
    case 'linear': case 'radial': case 'pattern': return { ...p, transform: p.transform ? multiply(m, p.transform) : m };
    case 'freeform': { const k = meanScale(m); return { ...p, points: p.points.map(q => ({ ...q, ...apply(m, q), radius: q.radius * k })) }; }
    case 'mesh': return { ...p, nodes: p.nodes.map(n => ({ ...n, ...apply(m, n) })) };
  }
}
const mapD = (d: string, m: Matrix, rule?: 'nonzero' | 'evenodd') => toPathData(transformPath(parsePathData(d, rule ?? 'nonzero'), m));

/** Map every coordinate-carrying field of `geom` (origin space) through m. */
export function mapGeom(g: TelaGeomExt | undefined, m: Matrix): TelaGeomExt | undefined {
  if (!g || isIdentity(m)) return g;
  const out: TelaGeomExt = { ...g };
  if (g.fill) out.fill = mapPaint(g.fill, m);
  if (g.stroke) out.stroke = mapPaint(g.stroke, m);
  if (g.clip) out.clip = { ...g.clip, d: mapD(g.clip.d, m, g.clip.fillRule) };
  if (g.strokeStyle?.dash) { const k = meanScale(m); out.strokeStyle = { ...g.strokeStyle, dash: g.strokeStyle.dash.map(v => v * k), dashOffset: g.strokeStyle.dashOffset !== undefined ? g.strokeStyle.dashOffset * k : undefined }; }
  return out;
}
/** Map the live source / type path of `studio` (origin space) through m. */
export function mapStudio(s: TelaStudioObjectExt | undefined, m: Matrix): TelaStudioObjectExt | undefined {
  if (!s || isIdentity(m)) return s;
  const out: TelaStudioObjectExt = { ...s };
  if (s.live) out.live = { ...s.live, d: mapD(s.live.d, m), width: s.live.width ? { ...s.live.width, width: s.live.width.width * meanScale(m) } : undefined };
  if (s.symbol) out.symbol = { ...s.symbol, matrix: multiply(m, s.symbol.matrix) };
  return out;
}

// ── Geometry replacement ────────────────────────────────────────────────────────────

const GEOMETRY_KEYS: Array<keyof TelaVectorObject> = ['points', 'pathNodes', 'rx', 'svgPathData', 'pathOriginX', 'pathOriginY', 'pathOriginW', 'pathOriginH', 'pathClosed'];

/**
 * The object with new geometry (artboard px), keeping id, paint, label, role, group, lock,
 * finish and studio metadata. Engine paints / clips / live source move from the old origin
 * space to the new identity mapping. Legacy objects become engine PATH objects here — this
 * is how a traced or polyline path becomes fully editable on its first edit.
 */
export function withPath(o: TelaVectorObject, path: CompoundPath, opts: { mapGeomFrom?: Matrix } = {}): TelaVectorObject {
  const m = opts.mapGeomFrom ?? objectMatrix(o);
  const base = pathToObject(path, { fill: 'none', stroke: 'none', fillRule: path.fillRule }, o.id);
  const next: TelaVectorObject = { ...o };
  for (const k of GEOMETRY_KEYS) delete next[k];
  next.kind = 'PATH'; next.x = base.x; next.y = base.y; next.w = base.w; next.h = base.h; next.rotation = 0;
  next.svgPathData = base.svgPathData; next.pathOriginX = base.pathOriginX; next.pathOriginY = base.pathOriginY; next.pathOriginW = base.pathOriginW; next.pathOriginH = base.pathOriginH;
  next.pathClosed = path.subpaths.some(s => s.closed);
  const g: TelaGeomExt = { ...(mapGeom(o.geom, m) ?? { v: 1 }), v: 1, fillRule: path.fillRule };
  next.geom = g;
  const st = mapStudio(o.studio, m); if (st) next.studio = st; else delete next.studio;
  if (next.gradient && g.fill && typeof g.fill !== 'string') next.gradient = legacyGradient(g.fill, next);
  return next;
}

/** Bake the origin mapping and rotation into identity (PATH only; others returned as-is unless forcePath). */
export function normalizeObject(o: TelaVectorObject, forcePath = false): TelaVectorObject {
  if (o.kind === 'PATH' && o.svgPathData) {
    const m = objectMatrix(o); if (isIdentity(m) && !o.rotation) return o;
    const p = pathOf(o); if (!p) return o;
    return withPath(o, p, { mapGeomFrom: m });
  }
  if (forcePath && isPathish(o)) { const p = pathOf(o); if (p) return withPath(o, p); }
  return o;
}

// ── Transforms ──────────────────────────────────────────────────────────────────────

export interface Decomposed { tx: number; ty: number; rot: number; sx: number; sy: number; skew: number }
/** m = T · R · Skew · S (sx may be negative for a reflection). */
export function decompose(m: Matrix): Decomposed {
  const [a, b, c, d, e, f] = m;
  let sx = Math.hypot(a, b); const rot = Math.atan2(b, a);
  const shear = (a * c + b * d) / (sx * sx || 1);
  const det = a * d - b * c; let sy = det / (sx || 1);
  if (sx < EPS) sx = 0;
  return { tx: e, ty: f, rot: rot * 180 / Math.PI, sx, sy, skew: Math.atan(shear) * 180 / Math.PI };
}
export const isTranslation = (m: Matrix) => Math.abs(m[0] - 1) < EPS && Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS && Math.abs(m[3] - 1) < EPS;
const axisAligned = (m: Matrix) => Math.abs(m[1]) < EPS && Math.abs(m[2]) < EPS;

/** Fast move: x/y (or points) only; artboard-space clips on box kinds move with it. */
export function translateObject(o: TelaVectorObject, dx: number, dy: number): TelaVectorObject {
  if (!dx && !dy) return o;
  const next: TelaVectorObject = { ...o };
  if (o.points && (o.kind === 'LINE' || (o.kind === 'PATH' && !o.svgPathData && !o.pathNodes?.length))) next.points = o.points.map((v, i) => v + (i % 2 ? dy : dx));
  else if (o.kind === 'PATH' && !o.svgPathData && o.pathNodes?.length) {
    next.pathNodes = o.pathNodes.map(n => ({ ...n, x: n.x + dx, y: n.y + dy, inX: n.inX !== undefined ? n.inX + dx : undefined, inY: n.inY !== undefined ? n.inY + dy : undefined, outX: n.outX !== undefined ? n.outX + dx : undefined, outY: n.outY !== undefined ? n.outY + dy : undefined }));
    next.x = o.x + dx; next.y = o.y + dy;
  } else { next.x = o.x + dx; next.y = o.y + dy; }
  // Box kinds keep an artboard-space clip (serialiser wraps them); PATH clips live in origin space.
  if (o.geom?.clip && !(o.kind === 'PATH' && o.svgPathData)) next.geom = { ...o.geom, clip: { ...o.geom.clip, d: mapD(o.geom.clip.d, translate(dx, dy), o.geom.clip.fillRule) } };
  if (o.studio?.symbol) next.studio = { ...o.studio, symbol: { ...o.studio.symbol, matrix: multiply(translate(dx, dy), o.studio.symbol.matrix) } };
  return next;
}

/**
 * Apply an affine to an object with the cheapest representation that stays faithful:
 * translation → x/y; axis-aligned positive scale of an unrotated path/box → its box (the
 * origin mapping keeps paints, live source and stroke width right); anything else on a
 * path-able object → baked into the path; text/images/media → move + rotate + resize box.
 */
export function transformObject(o: TelaVectorObject, m: Matrix): TelaVectorObject {
  if (isTranslation(m)) return translateObject(o, m[4], m[5]);
  const d = decompose(m);
  const box = { x: o.x, y: o.y, w: o.w, h: o.h };
  const scaleBox = () => {
    const p0 = apply(m, { x: box.x, y: box.y }), p1 = apply(m, { x: box.x + box.w, y: box.y + box.h });
    return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
  };
  const withSymbol = (n: TelaVectorObject) => { if (o.studio?.symbol) n.studio = { ...(n.studio ?? o.studio), symbol: { ...o.studio.symbol, matrix: multiply(m, o.studio.symbol.matrix) } }; return n; };
  if (axisAligned(m) && m[0] > 0 && m[3] > 0 && !o.rotation) {
    if ((o.kind === 'PATH' && o.svgPathData) || o.kind === 'RECT' || o.kind === 'ELLIPSE' || o.kind === 'IMAGE' || o.kind === 'LOTTIE' || o.kind === 'MOTION_TEMPLATE') {
      const b = scaleBox(); const next = { ...o, ...b };
      if (o.geom?.clip && !(o.kind === 'PATH' && o.svgPathData)) next.geom = { ...o.geom, clip: { ...o.geom.clip, d: mapD(o.geom.clip.d, m, o.geom.clip.fillRule) } };
      return withSymbol(next);
    }
    if (o.kind === 'TEXT') {
      const b = scaleBox(); const k = Math.sqrt(m[0] * m[3]);
      const next: TelaVectorObject = { ...o, ...b };
      if (!o.studio?.type || o.studio.type.mode === 'point') next.fontSize = Math.max(1, (o.fontSize || 24) * k);
      return withSymbol(next);
    }
  }
  if (isPathish(o)) {
    if (o.kind === 'LINE' && o.points) { const a = apply(m, { x: o.points[0], y: o.points[1] }), b = apply(m, { x: o.points[2], y: o.points[3] }); return withSymbol({ ...o, points: [a.x, a.y, b.x, b.y] }); }
    if (o.kind === 'PATH' && o.points && !o.svgPathData && !o.pathNodes?.length) {
      const pts: number[] = []; for (let i = 0; i + 1 < o.points.length; i += 2) { const q = apply(m, { x: o.points[i], y: o.points[i + 1] }); pts.push(q.x, q.y); }
      return withSymbol({ ...o, points: pts });
    }
    const p = pathOf(o); if (!p) return o;
    const om = objectMatrix(o);
    const next = withPath(o, transformPath(p, m), { mapGeomFrom: multiply(m, om) });
    if (o.strokeWidth && !o.studio?.live?.width) next.strokeWidth = o.strokeWidth; // Illustrator default: strokes don't scale
    return next;
  }
  // Text, images, media: move the centre, add the rotation, scale the box (skew is not representable).
  const c = apply(m, { x: o.x + o.w / 2, y: o.y + o.h / 2 });
  const w = Math.abs(o.w * Math.abs(d.sx)), h = Math.abs(o.h * Math.abs(d.sy));
  const next: TelaVectorObject = { ...o, x: c.x - w / 2, y: c.y - h / 2, w, h, rotation: normAngle((o.rotation || 0) + d.rot) };
  if (o.kind === 'TEXT' && (!o.studio?.type || o.studio.type.mode === 'point')) next.fontSize = Math.max(1, (o.fontSize || 24) * Math.sqrt(Math.abs(d.sx * d.sy)));
  return withSymbol(next);
}
export const normAngle = (a: number) => { let r = ((a % 360) + 360) % 360; if (r > 180) r -= 360; return Math.abs(r) < 1e-9 ? 0 : r; };

/** Paint of an object for tools that need one colour (fill, else stroke). */
export const primaryColor = (o: TelaVectorObject) => legacyColor(o.geom?.fill ?? (o.fill !== 'none' ? o.fill : o.stroke));

/** Inverse of objectMatrix (artboard → origin space). */
export const artboardToOrigin = (o: TelaVectorObject): Matrix => invert(objectMatrix(o));
export const applyM = apply;
export function centerOf(r: Rect): Vec { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
export { compactStudio, studioOf };
