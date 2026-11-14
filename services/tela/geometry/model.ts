// model — the canonical vector path model for Tela (Illustrator-grade).
//
// Why a new model: TelaVectorObject.PATH was a flat polyline (`points`) plus an opaque
// `svgPathData` string, and only traced outlines carried bezier nodes. Real vector work
// (booleans, offsets, brushes, direct selection of handles) needs compound paths of
// anchors with in/out handles and a fill rule. This module is that model; every other
// geometry module (bezier maths, booleans, strokes, transforms, import/export) speaks it.
//
// Conventions
//   - Coordinates are artboard px, y DOWN (SVG). "Left" of a direction means
//     cross(dir, p) > 0 (the maths left; on screen it looks like the right). All
//     orientation logic uses that one convention so it never matters which way y points.
//   - Handles are ABSOLUTE positions (like TelaVectorNode). A missing handle means the
//     handle sits on the anchor (a straight-line side).
//   - A segment whose both handles are missing is a LINE; otherwise a cubic bezier.
//     Quadratics and arcs are converted to cubics on input.
//
// Tela integration: a geometry object is stored as a TelaVectorObject kind PATH with
// `svgPathData` in ARTBOARD coordinates and pathOrigin = its own bbox (identity mapping),
// so every existing renderer still draws it. Engine-only finish (fill rule, extended
// gradients, mesh, materials, stroke style, clip) lives in the optional `geom` field whose
// type is TelaGeomExt below; renderers that ignore it degrade to the solid fill/stroke.
import type { Vec, Rect } from './vec';

export type AnchorKind = 'corner' | 'smooth' | 'symmetric';
export type FillRule = 'nonzero' | 'evenodd';

export interface Anchor {
  x: number; y: number;
  /** Absolute incoming handle (controls the segment ARRIVING at this anchor). */
  hin?: Vec;
  /** Absolute outgoing handle (controls the segment LEAVING this anchor). */
  hout?: Vec;
  /** corner: handles independent · smooth: collinear, lengths free · symmetric: collinear + equal length. */
  kind?: AnchorKind;
}

export interface SubPath { anchors: Anchor[]; closed: boolean }

export interface CompoundPath { subpaths: SubPath[]; fillRule: FillRule }

/** One cubic segment. `line` marks a straight segment (p1/p2 then sit at the thirds). */
export interface Curve { p0: Vec; p1: Vec; p2: Vec; p3: Vec; line?: boolean }

// ── Paint (engine-side; serialised by geometry/serialize) ────────────────────────────

export interface PaintStop { offset: number; color: string; opacity?: number }
/** 2x3 affine matrix [a, b, c, d, e, f] (SVG order): x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];

export interface LinearPaint { type: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: PaintStop[]; transform?: Matrix; spread?: 'pad' | 'reflect' | 'repeat' }
export interface RadialPaint { type: 'radial'; cx: number; cy: number; r: number; fx?: number; fy?: number; fr?: number; stops: PaintStop[]; transform?: Matrix; spread?: 'pad' | 'reflect' | 'repeat' }
/** Freeform gradient (Illustrator "points" mode, approximated): colour points blended over a base. */
export interface FreeformPaint { type: 'freeform'; base: string; points: Array<{ x: number; y: number; color: string; radius: number; opacity?: number }> }
/** Coons-patch mesh gradient: a grid of (rows+1) x (cols+1) nodes; see paint.ts tessellateMesh. */
export interface MeshPaint { type: 'mesh'; rows: number; cols: number; nodes: Array<{ x: number; y: number; color: string }>; /** Max colour step per tessellated cell (0-255 per channel); default 6. */ tolerance?: number }
/** Repeating tile (in artboard px). `objects` are drawn inside a tile of size w x h. */
export interface PatternPaint { type: 'pattern'; w: number; h: number; transform?: Matrix; tiles: Array<{ d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }>; background?: string; /** A bitmap tile (imported .pat / Photoshop pattern), drawn under any path tiles. */ image?: string }
export type Paint = string | LinearPaint | RadialPaint | FreeformPaint | MeshPaint | PatternPaint;

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';
export interface StrokeStyle {
  cap?: LineCap; join?: LineJoin; miterLimit?: number;
  dash?: number[]; dashOffset?: number;
  /** inside/outside are honoured by the canonical serialiser (clip) and by outlineStroke(). */
  align?: 'center' | 'inside' | 'outside';
}

/** A material = a reusable SVG filter graph (see geometry/materials). */
export interface MaterialRef { preset: string; seed?: number; params?: Record<string, number | string> }

/** Engine extension carried by a TelaVectorObject (field `geom`). Every field is optional. */
export interface TelaGeomExt {
  v: 1;
  fillRule?: FillRule;
  /** Extended fill (multi-stop, absolute coords, transforms, freeform, mesh, pattern). Overrides `fill`/`gradient`. */
  fill?: Paint;
  stroke?: Paint;
  strokeStyle?: StrokeStyle;
  material?: MaterialRef;
  /** Clip path in artboard coordinates (geometric clipping is preferred: see scene.clip). */
  clip?: { d: string; fillRule?: FillRule };
  /** Mix-blend isolation for groups of objects sharing a groupId (serialiser only). */
  isolate?: boolean;
  /**
   * TEXT set by the platform text engine (Studio area / point / path type): the composed
   * glyph outlines, one path per colour run, in object-local coordinates (origin = the
   * object's x/y). Renderers draw these instead of <text>, so the type looks identical in
   * the editor, exports, Fabula and letters without loading any font.
   */
  glyphs?: Array<{ d: string; fill: string }>;
  /**
   * Live bitmap masks (a Photoshop layer mask, a group mask, or the base of a clipping mask).
   * Positions are relative to the object's x/y at `base` size, so moving or scaling the object
   * carries the mask with it. stage 'content' sits inside the layer style (effects follow the
   * masked shape); 'clip' sits outside it (a clipping base hides the effects too).
   */
  masks?: GeomMask[];
  /**
   * The source app's rendered pixels for a TEXT object (Photoshop's cached text), shown until the
   * text is first edited. Used when the font is missing or the styling has no live equivalent,
   * which is exactly how Photoshop itself treats a missing font.
   */
  textPreview?: { src: string; dx: number; dy: number; w: number; h: number; base: { w: number; h: number } };
  /** Where an imported object came from; nothing renders from this. See services/tela/import. */
  imported?: ImportedObjectMeta;
}

export interface GeomMask {
  src: string; dx: number; dy: number; w: number; h: number;
  /** Object size the offsets were taken at. */
  base: { w: number; h: number };
  /** luminance: white shows (layer masks). alpha: opaque shows (clipping to a pixel layer). */
  mode: 'luminance' | 'alpha';
  /** What a luminance mask does outside its rectangle: 255 shows, 0 hides. */
  outside?: 0 | 255;
  stage?: 'content' | 'clip';
}

export interface ImportedObjectMeta {
  source: 'psd' | 'ai' | 'pdf' | 'eps';
  kind?: 'pixel' | 'text' | 'shape' | 'smart' | 'fill' | 'image';
  /** The layer's original name, blend and clip facts, kept for round trips and the import report. */
  layerName?: string;
  /** Embedded smart object bytes in the Tela asset store. */
  smart?: { assetId: string; name: string; type?: string };
  /** The Photoshop font name, before substitution. */
  font?: string;
  /** Adjustment layers baked into this object at import. */
  bakedAdjustments?: string[];
}

// ── Constructors ────────────────────────────────────────────────────────────────────

export const anchor = (x: number, y: number, hin?: Vec, hout?: Vec, kind?: AnchorKind): Anchor => {
  const a: Anchor = { x, y }; if (hin) a.hin = hin; if (hout) a.hout = hout; if (kind) a.kind = kind; return a;
};
export const compound = (subpaths: SubPath[] = [], fillRule: FillRule = 'nonzero'): CompoundPath => ({ subpaths, fillRule });
export const subpath = (anchors: Anchor[], closed: boolean): SubPath => ({ anchors, closed });

export function lineCurve(a: Vec, b: Vec): Curve {
  return { p0: { x: a.x, y: a.y }, p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, p2: { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 }, p3: { x: b.x, y: b.y }, line: true };
}
export const cubicCurve = (p0: Vec, p1: Vec, p2: Vec, p3: Vec): Curve => ({ p0, p1, p2, p3 });

export function clonePath(p: CompoundPath): CompoundPath {
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => ({ closed: s.closed, anchors: s.anchors.map(cloneAnchor) })) };
}
export function cloneAnchor(a: Anchor): Anchor {
  const b: Anchor = { x: a.x, y: a.y }; if (a.hin) b.hin = { x: a.hin.x, y: a.hin.y }; if (a.hout) b.hout = { x: a.hout.x, y: a.hout.y }; if (a.kind) b.kind = a.kind; return b;
}

// ── Anchors <-> curves ──────────────────────────────────────────────────────────────

const hasHandle = (h: Vec | undefined, a: Anchor) => !!h && (Math.abs(h.x - a.x) > 1e-12 || Math.abs(h.y - a.y) > 1e-12);

/** Segment from anchor a to anchor b. */
export function segmentCurve(a: Anchor, b: Anchor): Curve {
  const ho = hasHandle(a.hout, a), hi = hasHandle(b.hin, b);
  if (!ho && !hi) return lineCurve(a, b);
  return { p0: { x: a.x, y: a.y }, p1: ho ? { ...a.hout! } : { x: a.x, y: a.y }, p2: hi ? { ...b.hin! } : { x: b.x, y: b.y }, p3: { x: b.x, y: b.y } };
}

/** The curves of one subpath (closed subpaths include the closing segment, skipped if zero length and straight). */
export function subpathCurves(s: SubPath): Curve[] {
  const A = s.anchors; const out: Curve[] = []; const n = A.length;
  if (n < 2) return out;
  for (let i = 0; i < n - 1; i++) out.push(segmentCurve(A[i], A[i + 1]));
  if (s.closed) {
    const c = segmentCurve(A[n - 1], A[0]);
    if (!(c.line && Math.abs(c.p0.x - c.p3.x) < 1e-12 && Math.abs(c.p0.y - c.p3.y) < 1e-12)) out.push(c);
  }
  return out;
}
export const pathCurves = (p: CompoundPath): Curve[][] => p.subpaths.map(subpathCurves);

/**
 * Rebuild a subpath from a chain of curves. Consecutive curves are assumed to meet.
 * Closed: the last curve must end on the first curve's start.
 */
export function curvesToSubpath(curves: Curve[], closed: boolean): SubPath {
  if (!curves.length) return { anchors: [], closed };
  const anchors: Anchor[] = curves.map(c => ({ x: c.p0.x, y: c.p0.y }));
  if (!closed) anchors.push({ x: curves[curves.length - 1].p3.x, y: curves[curves.length - 1].p3.y });
  curves.forEach((c, i) => {
    if (c.line) return;
    const a = anchors[i], b = anchors[closed ? (i + 1) % anchors.length : i + 1];
    if (Math.abs(c.p1.x - a.x) > 1e-12 || Math.abs(c.p1.y - a.y) > 1e-12) a.hout = { x: c.p1.x, y: c.p1.y };
    if (Math.abs(c.p2.x - b.x) > 1e-12 || Math.abs(c.p2.y - b.y) > 1e-12) b.hin = { x: c.p2.x, y: c.p2.y };
  });
  for (const a of anchors) a.kind = inferKind(a);
  return { anchors, closed };
}

/** Infer corner / smooth / symmetric from handle geometry. */
export function inferKind(a: Anchor, tol = 1e-3): AnchorKind {
  if (!a.hin || !a.hout) return 'corner';
  const ix = a.x - a.hin.x, iy = a.y - a.hin.y, ox = a.hout.x - a.x, oy = a.hout.y - a.y;
  const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
  if (li < 1e-9 || lo < 1e-9) return 'corner';
  const c = (ix * oy - iy * ox) / (li * lo), d = (ix * ox + iy * oy) / (li * lo);
  if (Math.abs(c) > tol || d < 0) return 'corner';
  return Math.abs(li - lo) < tol * Math.max(li, lo) ? 'symmetric' : 'smooth';
}

// ── Legacy Tela data ────────────────────────────────────────────────────────────────

/** Flat polyline [x0,y0,x1,y1,...] → a path of corner anchors. */
export function fromPoints(points: number[], closed = false): CompoundPath {
  const anchors: Anchor[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) anchors.push({ x: points[i], y: points[i + 1], kind: 'corner' });
  return { fillRule: 'nonzero', subpaths: anchors.length ? [{ anchors, closed }] : [] };
}

/** TelaVectorNode-like records (absolute handles) → path. */
export function fromNodes(nodes: Array<{ x: number; y: number; inX?: number; inY?: number; outX?: number; outY?: number; smooth?: boolean }>, closed = false): CompoundPath {
  const anchors = nodes.map(n => {
    const a: Anchor = { x: n.x, y: n.y };
    if (n.inX !== undefined && n.inY !== undefined) a.hin = { x: n.inX, y: n.inY };
    if (n.outX !== undefined && n.outY !== undefined) a.hout = { x: n.outX, y: n.outY };
    a.kind = n.smooth ? (inferKind(a) === 'symmetric' ? 'symmetric' : 'smooth') : inferKind(a);
    return a;
  });
  return { fillRule: 'nonzero', subpaths: anchors.length ? [{ anchors, closed }] : [] };
}
/** Path → TelaVectorNode-like records (first subpath; ids generated). */
export function toNodes(p: CompoundPath, idPrefix = 'n'): Array<{ id: string; x: number; y: number; inX?: number; inY?: number; outX?: number; outY?: number; smooth?: boolean }> {
  const s = p.subpaths[0]; if (!s) return [];
  return s.anchors.map((a, i) => ({ id: `${idPrefix}${i}`, x: a.x, y: a.y, inX: a.hin?.x, inY: a.hin?.y, outX: a.hout?.x, outY: a.hout?.y, smooth: a.kind === 'smooth' || a.kind === 'symmetric' }));
}

/** Count anchors across subpaths. */
export const anchorCount = (p: CompoundPath) => p.subpaths.reduce((n, s) => n + s.anchors.length, 0);
export const isEmptyPath = (p: CompoundPath) => p.subpaths.every(s => s.anchors.length < 2);

/** Signed area of a subpath (shoelace on the exact cubic: Green's theorem). Positive = left-oriented (CCW in maths axes). */
export function subpathArea(s: SubPath): number {
  const cs = subpathCurves(s); let a = 0;
  if (!s.closed && s.anchors.length > 1) { const A = s.anchors; cs.push(lineCurve(A[A.length - 1], A[0])); }
  for (const c of cs) a += curveAreaTerm(c);
  return a;
}
/** ½∮(x dy − y dx) over one cubic, exact (same closed form as paper.js Curve.getArea). */
export function curveAreaTerm(c: Curve): number {
  const x0 = c.p0.x, y0 = c.p0.y, x1 = c.p1.x, y1 = c.p1.y, x2 = c.p2.x, y2 = c.p2.y, x3 = c.p3.x, y3 = c.p3.y;
  return 3 * ((y3 - y0) * (x1 + x2) - (x3 - x0) * (y1 + y2) + y1 * (x0 - x2) - x1 * (y0 - y2) + y3 * (x2 + x0 / 3) - x3 * (y2 + y0 / 3)) / 20;
}
export function pathArea(p: CompoundPath): number { return p.subpaths.reduce((a, s) => a + subpathArea(s), 0); }

/** A path's anchor extents (not tight; see bezier.pathBounds for tight bounds). */
export function anchorBounds(p: CompoundPath): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of p.subpaths) for (const a of s.anchors) for (const q of [a, a.hin, a.hout]) if (q) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
