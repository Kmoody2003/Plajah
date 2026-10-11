// studio/appearance — live effects, variable-width strokes, brushes, parametric shapes,
// the Stroke panel, engine paints (gradient / mesh / pattern / freeform) and swatches.
//
// Live pipeline (non-destructive, Illustrator's Appearance in miniature):
//   source path (studio.live.d or a parametric shape)
//     → effects in order (roughen, zig-zag, pucker & bloat, twist, warp, offset)
//     → variable width profile OR brush (the stroke becomes filled geometry)
//     → baked svgPathData (+ geom) that every renderer draws.
// Editing the source (Direct Selection on a live object edits the source) or any knob
// rebakes. "Expand Appearance" drops the live state and keeps the baked art.
import type { TelaVectorObject } from '../../../types';
import type { CompoundPath, LinearPaint, MeshPaint, Paint, PatternPaint, RadialPaint, StrokeStyle, FreeformPaint } from '../geometry/model';
import type { Rect } from '../geometry/vec';
import type { WidthPoint, WidthProfile } from '../geometry/stroke';
import { PROFILES, variableStroke } from '../geometry/stroke';
import { parsePathData, toPathData } from '../geometry/pathData';
import { roughen, zigzag, puckerBloat, twist, warp, type WarpStyle } from '../geometry/pathOps';
import { offsetPath } from '../geometry/offset';
import { rectPath, ellipsePath, polygonPath, starPath, spiralPath } from '../geometry/shapes';
import { artBrush, patternBrush, scatterBrush } from '../geometry/brushes';
import { resolve } from '../geometry/boolean';
import { legacyColor, legacyGradient } from '../geometry/tela';
import { mix, shade } from '../geometry/color';
import { meshGrid } from '../geometry/paint';
import type { EffectKind, StudioBrush, StudioEffect, StudioLive, StudioLiveShape, StudioSwatch, StudioWidth } from './model';
import { normalizeObject, withPath, pathOf, isPathish, objectMatrix } from './objectGeom';
import { invert } from '../geometry/transform';
import { transformPath } from '../geometry/transform';

// ── Effects ─────────────────────────────────────────────────────────────────────────

export interface Knob { key: string; label: string; min?: number; max?: number; step?: number; options?: string[]; bool?: boolean }
export const EFFECTS: Record<EffectKind, { label: string; defaults: StudioEffect['params']; knobs: Knob[] }> = {
  roughen: { label: 'Roughen', defaults: { size: 4, detail: 12, smooth: true, seed: 3 }, knobs: [{ key: 'size', label: 'Size', min: 0, max: 60, step: .5 }, { key: 'detail', label: 'Detail /100px', min: 1, max: 80, step: 1 }, { key: 'smooth', label: 'Smooth points', bool: true }, { key: 'seed', label: 'Seed', min: 1, max: 999, step: 1 }] },
  zigzag: { label: 'Zig Zag', defaults: { size: 6, ridges: 6, smooth: false }, knobs: [{ key: 'size', label: 'Size', min: 0, max: 60, step: .5 }, { key: 'ridges', label: 'Ridges / segment', min: 1, max: 40, step: 1 }, { key: 'smooth', label: 'Smooth', bool: true }] },
  puckerBloat: { label: 'Pucker & Bloat', defaults: { amount: .3 }, knobs: [{ key: 'amount', label: 'Pucker ← → Bloat', min: -1, max: 1, step: .01 }] },
  twist: { label: 'Twist', defaults: { angle: 45 }, knobs: [{ key: 'angle', label: 'Angle', min: -720, max: 720, step: 1 }] },
  warp: { label: 'Warp', defaults: { style: 'arc', bend: .4 }, knobs: [{ key: 'style', label: 'Style', options: ['arc', 'arcLower', 'arcUpper', 'arch', 'bulge', 'shellLower', 'shellUpper', 'flag', 'wave', 'fish', 'rise', 'fisheye', 'inflate', 'squeeze', 'twist'] }, { key: 'bend', label: 'Bend', min: -1, max: 1, step: .01 }] },
  offset: { label: 'Offset Path', defaults: { d: 6, join: 'round' }, knobs: [{ key: 'd', label: 'Offset', min: -80, max: 80, step: .5 }, { key: 'join', label: 'Joins', options: ['miter', 'round', 'bevel'] }] },
};
const num = (v: unknown, d: number) => typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v !== '' && !isNaN(+v) ? +v : d;

export function applyEffect(p: CompoundPath, e: StudioEffect): CompoundPath {
  if (e.enabled === false) return p;
  const q = e.params;
  switch (e.kind) {
    case 'roughen': return roughen(p, { size: num(q.size, 4), detail: num(q.detail, 12), smooth: !!q.smooth, seed: num(q.seed, 3) });
    case 'zigzag': return zigzag(p, num(q.size, 6), num(q.ridges, 6), !!q.smooth);
    case 'puckerBloat': return puckerBloat(p, num(q.amount, .3));
    case 'twist': return twist(p, num(q.angle, 45));
    case 'warp': return warp(p, String(q.style || 'arc') as WarpStyle, num(q.bend, .4));
    case 'offset': return offsetPath(p, num(q.d, 6), (String(q.join || 'round') as 'miter' | 'round' | 'bevel'));
  }
}
export const applyEffects = (p: CompoundPath, list: StudioEffect[] = []) => list.reduce(applyEffect, p);

// ── Parametric shapes ───────────────────────────────────────────────────────────────

export function liveShapePath(s: StudioLiveShape): CompoundPath {
  const P = s.params; const x = P.x ?? 0, y = P.y ?? 0, w = P.w ?? 100, h = P.h ?? 100;
  switch (s.kind) {
    case 'rect': return rectPath(x, y, w, h, { tl: P.tl ?? P.r ?? 0, tr: P.tr ?? P.r ?? 0, br: P.br ?? P.r ?? 0, bl: P.bl ?? P.r ?? 0 });
    case 'ellipse': return ellipsePath(x, y, w, h);
    case 'polygon': return polygonPath(P.cx ?? x + w / 2, P.cy ?? y + h / 2, P.r ?? Math.min(w, h) / 2, Math.max(3, Math.round(P.sides ?? 6)), P.rot ?? -90, P.corner ?? 0);
    case 'star': return starPath(P.cx ?? x + w / 2, P.cy ?? y + h / 2, P.r1 ?? Math.min(w, h) / 2, P.r2 ?? Math.min(w, h) / 4, Math.max(3, Math.round(P.points ?? 5)), P.rot ?? -90, P.corner ?? 0);
    case 'spiral': return spiralPath(P.cx ?? x + w / 2, P.cy ?? y + h / 2, P.r ?? Math.min(w, h) / 2, P.decay ?? .8, Math.max(2, Math.round(P.segments ?? 10)), (P.clockwise ?? 1) > 0, P.rot ?? 0);
  }
}

// ── Profiles ────────────────────────────────────────────────────────────────────────

export const PROFILE_NAMES = Object.keys(PROFILES) as Array<keyof typeof PROFILES>;
export function profileOf(w: StudioWidth): WidthProfile {
  if (typeof w.profile === 'string') return (PROFILES as Record<string, (u: number) => number>)[w.profile] ?? PROFILES.uniform;
  return w.profile;
}
/** Explicit width points for a profile (so the Width tool can edit a preset). Half widths in px. */
export function profilePoints(w: StudioWidth, n = 5): WidthPoint[] {
  if (Array.isArray(w.profile)) return w.profile.map(p => ({ ...p }));
  const f = profileOf(w) as (u: number) => number | [number, number];
  const out: WidthPoint[] = [];
  for (let i = 0; i < n; i++) { const u = i / (n - 1); const r = f(u); const [l, rr] = Array.isArray(r) ? r : [r, r]; out.push({ u, left: l * w.width / 2, right: rr * w.width / 2 }); }
  return out;
}
/** Width tool: set (or add) a width point at u with half widths. Points closer than `snap` merge. */
export function setWidthPoint(points: WidthPoint[], u: number, left: number, right = left, snap = .04): WidthPoint[] {
  const out = points.map(p => ({ ...p })); const i = out.findIndex(p => Math.abs(p.u - u) <= snap);
  const pt = { u: i >= 0 ? out[i].u : u, left: Math.max(0, left), right: Math.max(0, right) };
  if (i >= 0) out[i] = pt; else out.push(pt);
  return out.sort((a, b) => a.u - b.u);
}

// ── Brushes ─────────────────────────────────────────────────────────────────────────

const brushArt = (b: StudioBrush): CompoundPath[] => b.art.map(a => parsePathData(a.d, 'nonzero'));
export const DEFAULT_BRUSHES: StudioBrush[] = [
  { id: 'art-taper', name: 'Tapered ink', kind: 'art', art: [{ d: 'M0 5C25 0 75 0 100 5C75 10 25 10 0 5Z', fill: '#000' }] },
  { id: 'art-dry', name: 'Dry brush', kind: 'art', art: [{ d: 'M0 4C30 0 70 1 100 4C70 6 30 7 0 4ZM6 8C35 6 65 7 94 8C65 9 35 10 6 8ZM4 1C35 0 66 0 96 1C66 2 35 3 4 1Z', fill: '#000' }] },
  { id: 'pat-rope', name: 'Rope', kind: 'pattern', art: [{ d: 'M0 2C5 -1 12 3 16 6C12 9 5 5 0 2Z M8 2C13 -1 20 3 24 6C20 9 13 5 8 2Z', fill: '#000' }], params: { spacing: 0 } },
  { id: 'pat-stitch', name: 'Stitch', kind: 'pattern', art: [{ d: 'M0 2H10V4H0Z', fill: '#000' }], params: { spacing: 6 } },
  { id: 'pat-scallop', name: 'Scallop', kind: 'pattern', art: [{ d: 'M0 8C0 2 4 0 8 0C12 0 16 2 16 8Z', fill: '#000' }], params: { spacing: 0 } },
  { id: 'sc-dots', name: 'Confetti dots', kind: 'scatter', art: [{ d: 'M5 0A5 5 0 1 1 5 10A5 5 0 1 1 5 0Z', fill: '#000' }], params: { spacing: 1.6, sizeMin: .5, sizeMax: 1.2, scatter: .9, rotation: 0 } },
  { id: 'sc-leaves', name: 'Leaves', kind: 'scatter', art: [{ d: 'M0 5C4 -1 14 -1 18 5C14 11 4 11 0 5Z', fill: '#000' }], params: { spacing: 1.1, sizeMin: .7, sizeMax: 1.3, scatter: .4, rotation: 40 } },
  { id: 'sc-stars', name: 'Sparkles', kind: 'scatter', art: [{ d: 'M5 0L6.2 3.8L10 5L6.2 6.2L5 10L3.8 6.2L0 5L3.8 3.8Z', fill: '#000' }], params: { spacing: 2.2, sizeMin: .4, sizeMax: 1.4, scatter: 1.4, rotation: 180 } },
];
export function brushGeometry(b: StudioBrush, spine: CompoundPath, width: number, flip = false): CompoundPath {
  const art = brushArt(b); const P = b.params ?? {};
  let pieces: CompoundPath[];
  if (b.kind === 'art') pieces = artBrush(art, spine, { width, flip });
  else if (b.kind === 'pattern') pieces = patternBrush(spine, { width, side: art, spacing: (P.spacing ?? 0) });
  else {
    // Scatter art is authored ~10px across: sizes and spacing follow the brush width.
    const k = width / 10;
    pieces = scatterBrush(art, spine, { spacing: (P.spacing ?? 1.5) * k, size: [(P.sizeMin ?? 1) * k, (P.sizeMax ?? 1) * k], scatter: [-(P.scatter ?? 0) * k, (P.scatter ?? 0) * k], rotation: [-(P.rotation ?? 0), P.rotation ?? 0], seed: 7 });
    return { fillRule: 'nonzero', subpaths: pieces.flatMap(p => p.subpaths) };
  }
  return resolve({ fillRule: 'nonzero', subpaths: pieces.flatMap(p => p.subpaths) }, 'nonzero');
}

// ── Baking ──────────────────────────────────────────────────────────────────────────

/** The live object with its baked geometry recomputed from the source. */
export function bakeLive(o: TelaVectorObject, brushes: StudioBrush[] = DEFAULT_BRUSHES): TelaVectorObject {
  const n = normalizeObject(o);
  const live = n.studio?.live; if (!live) return n;
  let src = live.shape ? liveShapePath(live.shape) : parsePathData(live.d, 'nonzero');
  src = applyEffects(src, live.effects);
  let out = src;
  if (live.width) out = variableStroke(src, { width: live.width.width, profile: profileOf(live.width), cap: live.width.cap ?? 'round', join: live.width.join ?? 'round' });
  else if (live.brush) {
    const b = brushes.find(x => x.id === live.brush!.brushId) ?? DEFAULT_BRUSHES[0];
    out = brushGeometry(b, src, live.brush.width ?? Math.max(2, (live.sourcePaint?.strokeWidth ?? 2) * 3), live.brush.flip);
  }
  if (!out.subpaths.length) out = src;
  const baked = withPath(n, out, { mapGeomFrom: [1, 0, 0, 1, 0, 0] });
  baked.pathClosed = out.subpaths.some(s => s.closed);
  return baked;
}

/** Make `o` live (source = its current geometry) and apply `edit` to the live record, then rebake. */
export function editLive(o: TelaVectorObject, edit: (live: StudioLive, o: TelaVectorObject) => StudioLive | null, brushes?: StudioBrush[]): TelaVectorObject {
  let n = normalizeObject(o, true);
  if (!isPathish(n) && !(n.kind === 'PATH' && n.svgPathData)) return o;
  if (n.kind !== 'PATH' || !n.svgPathData) { const p = pathOf(n); if (!p) return o; n = withPath(n, p); }
  const cur: StudioLive = n.studio?.live ?? { d: n.svgPathData! };
  const nextLive = edit({ ...cur }, n);
  if (!nextLive) return expandLive(n, cur);
  const needsSourcePaint = (nextLive.width || nextLive.brush) && !cur.sourcePaint && !(cur.width || cur.brush);
  if (needsSourcePaint) {
    nextLive.sourcePaint = { fill: n.fill, stroke: n.stroke, strokeWidth: n.strokeWidth, strokeStyle: n.geom?.strokeStyle };
    // The stroke becomes a filled outline: stroke paint → fill.
    const strokePaint: Paint = n.geom?.stroke ?? (n.stroke !== 'none' ? n.stroke : '#111111');
    n = { ...n, fill: legacyColor(strokePaint), stroke: 'none', strokeWidth: 0, gradient: undefined, geom: { ...(n.geom ?? { v: 1 }), fill: typeof strokePaint === 'string' ? undefined : strokePaint, stroke: undefined } };
  }
  if (!(nextLive.width || nextLive.brush) && cur.sourcePaint && (cur.width || cur.brush)) {
    const sp = cur.sourcePaint; n = { ...n, fill: sp.fill, stroke: sp.stroke, strokeWidth: sp.strokeWidth, geom: { ...(n.geom ?? { v: 1 }), fill: undefined, strokeStyle: sp.strokeStyle } };
    delete nextLive.sourcePaint;
  }
  const empty = !nextLive.effects?.length && !nextLive.width && !nextLive.brush && !nextLive.shape;
  if (empty) { const plain = { ...n, svgPathData: nextLive.d }; return finishPlain(plain); }
  return bakeLive({ ...n, studio: { ...(n.studio ?? { v: 1 }), live: nextLive } }, brushes);
}
function finishPlain(n: TelaVectorObject): TelaVectorObject {
  const p = parsePathData(n.svgPathData!, n.geom?.fillRule ?? 'nonzero');
  const s = n.studio ? { ...n.studio } : undefined; if (s) delete s.live;
  const out = withPath({ ...n, studio: s && Object.keys(s).length > 1 ? s : undefined }, p, { mapGeomFrom: [1, 0, 0, 1, 0, 0] });
  if (!out.studio) delete out.studio;
  return out;
}
/** Expand Appearance: keep the baked art, drop the live state. */
export function expandLive(o: TelaVectorObject, _live?: StudioLive): TelaVectorObject {
  if (!o.studio?.live) return o;
  const s = { ...o.studio }; delete s.live;
  const n = { ...o, studio: Object.keys(s).length > 1 ? s : undefined }; if (!n.studio) delete n.studio;
  return n;
}
/** Replace the editable source of a live object (Direct Selection on live art), mapped to origin space. */
export function setLiveSource(o: TelaVectorObject, artboardPath: CompoundPath, brushes?: StudioBrush[]): TelaVectorObject {
  const live = o.studio?.live; if (!live) return withPath(o, artboardPath);
  const local = transformPath(artboardPath, invert(objectMatrix(o)));
  const next: StudioLive = { ...live, d: toPathData(local) }; delete next.shape; // hand edits end the parametric shape
  return bakeLive({ ...o, studio: { ...o.studio!, live: next } }, brushes);
}
/** Editable source of an object in artboard px: the live source if any, else its geometry. */
export function sourcePathOf(o: TelaVectorObject): CompoundPath | null {
  const live = o.studio?.live;
  if (live) { const src = live.shape ? liveShapePath(live.shape) : parsePathData(live.d, 'nonzero'); return transformPath(src, objectMatrix(o)); }
  return pathOf(o);
}

// ── Stroke panel ────────────────────────────────────────────────────────────────────

export interface StrokePatch { width?: number; cap?: StrokeStyle['cap']; join?: StrokeStyle['join']; miterLimit?: number; dash?: number[] | null; dashOffset?: number; align?: StrokeStyle['align']; alignDashes?: boolean }
const NEEDS_PATH: Array<keyof StrokePatch> = ['cap', 'join', 'miterLimit', 'dashOffset', 'align'];
export function applyStroke(o: TelaVectorObject, patch: StrokePatch): TelaVectorObject {
  if (o.kind === 'TEXT' || o.kind === 'IMAGE' || o.kind === 'LOTTIE' || o.kind === 'MOTION_TEMPLATE') {
    if (patch.width === undefined) return o;
    return { ...o, strokeWidth: Math.max(0, patch.width) };
  }
  let n = o;
  if (NEEDS_PATH.some(k => patch[k] !== undefined) && !(n.kind === 'PATH' && n.svgPathData)) { n = normalizeObject(n, true); if (n.kind !== 'PATH' || !n.svgPathData) { const p = pathOf(n); if (p) n = withPath(n, p); } }
  n = { ...n };
  if (patch.width !== undefined) {
    n.strokeWidth = Math.max(0, patch.width);
    if (n.studio?.live?.width) return editLive(n, l => ({ ...l, width: { ...l.width!, width: Math.max(.1, patch.width!) } }));
  }
  const st: StrokeStyle = { ...(n.geom?.strokeStyle ?? {}) };
  if (patch.cap) st.cap = patch.cap; if (patch.join) st.join = patch.join;
  if (patch.miterLimit !== undefined) st.miterLimit = patch.miterLimit;
  if (patch.align) st.align = patch.align;
  if (patch.dashOffset !== undefined) st.dashOffset = patch.dashOffset;
  if (patch.dash !== undefined) {
    if (patch.dash && patch.dash.length) { st.dash = patch.dash; n.strokeDash = patch.dash; } else { delete st.dash; delete n.strokeDash; }
  }
  if (n.kind === 'PATH' && n.svgPathData) n.geom = { ...(n.geom ?? { v: 1 }), strokeStyle: st };
  return n;
}
export function strokeOf(o: TelaVectorObject): Required<Pick<StrokeStyle, 'cap' | 'join' | 'align'>> & { miterLimit: number; dash: number[]; dashOffset: number; width: number } {
  const st = o.geom?.strokeStyle ?? {};
  return { width: o.studio?.live?.width?.width ?? o.strokeWidth ?? 0, cap: st.cap ?? 'round', join: st.join ?? 'round', align: st.align ?? 'center', miterLimit: st.miterLimit ?? 4, dash: o.strokeDash ?? st.dash ?? [], dashOffset: st.dashOffset ?? 0 };
}
/** Illustrator "align dashes to corners": the dash pattern scaled so every segment holds whole dashes. */
export function alignedDash(o: TelaVectorObject, pattern: number[]): number[] {
  const p = pathOf(o); if (!p || !pattern.length) return pattern;
  // Use the shortest segment run so corners always land mid-dash.
  const total = pattern.reduce((a, b) => a + b, 0); if (total <= 0) return pattern;
  let shortest = Infinity;
  for (const s of p.subpaths) for (let i = 0; i < s.anchors.length - (s.closed ? 0 : 1); i++) {
    const a = s.anchors[i], b = s.anchors[(i + 1) % s.anchors.length]; shortest = Math.min(shortest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  if (!isFinite(shortest) || shortest <= 0) return pattern;
  const k = shortest / Math.max(1, Math.round(shortest / total)) / total;
  return pattern.map(v => +(v * k).toFixed(3));
}

// ── Paints ──────────────────────────────────────────────────────────────────────────

/** The box paints are authored against (origin space). */
export function paintBox(o: TelaVectorObject): Rect {
  if (o.kind === 'PATH' && o.svgPathData) return { x: o.pathOriginX ?? o.x, y: o.pathOriginY ?? o.y, w: o.pathOriginW ?? o.w, h: o.pathOriginH ?? o.h };
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}
/** Engine paints need an engine PATH; box kinds are converted on first use. */
export function ensurePaintable(o: TelaVectorObject): TelaVectorObject {
  if (o.kind === 'PATH' && o.svgPathData) return o;
  if (!isPathish(o)) return o;
  const n = normalizeObject(o, true); if (n.kind === 'PATH' && n.svgPathData) return n;
  const p = pathOf(n); return p ? withPath(n, p) : o;
}
export function setPaint(o: TelaVectorObject, which: 'fill' | 'stroke', paint: Paint | 'none'): TelaVectorObject {
  const isEngine = typeof paint !== 'string';
  let n = isEngine ? ensurePaintable(o) : { ...o };
  n = { ...n };
  if (which === 'fill') {
    n.fill = legacyColor(paint === 'none' ? 'none' : paint);
    if (n.geom) { n.geom = { ...n.geom }; if (isEngine) n.geom.fill = paint as Paint; else delete n.geom.fill; }
    else if (isEngine) n.geom = { v: 1, fill: paint as Paint };
    const lg = isEngine ? legacyGradient(paint as Paint, n) : undefined; if (lg) n.gradient = lg; else delete n.gradient;
    if (n.studio?.fillSwatch) { const s = { ...n.studio }; delete s.fillSwatch; n.studio = s; }
  } else {
    n.stroke = legacyColor(paint === 'none' ? 'none' : paint);
    if (n.geom) { n.geom = { ...n.geom }; if (isEngine) n.geom.stroke = paint as Paint; else delete n.geom.stroke; }
    else if (isEngine) n.geom = { v: 1, stroke: paint as Paint };
    if (paint !== 'none' && !n.strokeWidth) n.strokeWidth = 1;
    if (n.studio?.strokeSwatch) { const s = { ...n.studio }; delete s.strokeSwatch; n.studio = s; }
  }
  return n;
}
export function paintOf(o: TelaVectorObject, which: 'fill' | 'stroke'): Paint | 'none' {
  if (which === 'fill') return o.geom?.fill ?? (o.gradient ? gradientFromLegacy(o) : (o.fill || 'none'));
  return o.geom?.stroke ?? (o.stroke || 'none');
}
function gradientFromLegacy(o: TelaVectorObject): Paint {
  const g = o.gradient!; const b = paintBox(o); const stops = g.stops.map(s => ({ offset: s.offset, color: s.color, opacity: s.opacity }));
  if (g.kind === 'RADIAL') return { type: 'radial', cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2, stops };
  const a = (g.angle ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  return { type: 'linear', x1: cx - c * b.w / 2, y1: cy - s * b.h / 2, x2: cx + c * b.w / 2, y2: cy + s * b.h / 2, stops };
}
export function defaultGradient(o: TelaVectorObject, kind: 'linear' | 'radial', base?: string): LinearPaint | RadialPaint {
  const b = paintBox(o); const c = base ?? (typeof paintOf(o, 'fill') === 'string' && paintOf(o, 'fill') !== 'none' ? paintOf(o, 'fill') as string : '#6B0099');
  const stops = [{ offset: 0, color: c }, { offset: 1, color: shade(c, .25) }];
  return kind === 'radial' ? { type: 'radial', cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2, stops: [{ offset: 0, color: shade(c, .25) }, { offset: 1, color: c }] } : { type: 'linear', x1: b.x, y1: b.y + b.h / 2, x2: b.x + b.w, y2: b.y + b.h / 2, stops };
}
/** Insert a stop at `offset` with the interpolated colour (gradient slider click). */
export function addStop(p: LinearPaint | RadialPaint, offset: number): LinearPaint | RadialPaint {
  const s = p.stops.slice().sort((a, b) => a.offset - b.offset);
  let color = s[0]?.color ?? '#000';
  for (let i = 0; i + 1 < s.length; i++) if (offset >= s[i].offset && offset <= s[i + 1].offset) { color = mix(s[i].color, s[i + 1].color, (offset - s[i].offset) / Math.max(1e-6, s[i + 1].offset - s[i].offset)); break; }
  if (offset > (s[s.length - 1]?.offset ?? 1)) color = s[s.length - 1]?.color ?? color;
  return { ...p, stops: [...p.stops, { offset, color }].sort((a, b) => a.offset - b.offset) };
}
export function meshFor(o: TelaVectorObject, rows = 3, cols = 3): MeshPaint {
  const b = paintBox(o); const f = paintOf(o, 'fill'); const base = typeof f === 'string' && f !== 'none' ? f : '#7a5af8';
  const colors: string[][] = [];
  for (let r = 0; r <= rows; r++) { const row: string[] = []; for (let c = 0; c <= cols; c++) { const centre = 1 - Math.hypot(r / rows - .5, c / cols - .5) * 1.4; row.push(shade(base, Math.max(-.15, centre * .18 - .05))); } colors.push(row); }
  return meshGrid(b, colors);
}
export function freeformFor(o: TelaVectorObject): FreeformPaint {
  const b = paintBox(o); const f = paintOf(o, 'fill'); const base = typeof f === 'string' && f !== 'none' ? f : '#7a5af8';
  return { type: 'freeform', base, points: [{ x: b.x + b.w * .3, y: b.y + b.h * .3, color: shade(base, .25), radius: Math.max(b.w, b.h) * .45 }, { x: b.x + b.w * .75, y: b.y + b.h * .7, color: shade(base, -.2), radius: Math.max(b.w, b.h) * .4 }] };
}

export const PATTERN_PRESETS = ['stripes', 'dots', 'checker', 'grid', 'waves', 'diagonal', 'crosshatch', 'scales'] as const;
export type PatternPreset = typeof PATTERN_PRESETS[number];
export function patternPaint(kind: PatternPreset, fg: string, bg: string | undefined, size = 16, angle = 0): PatternPaint {
  const s = size, h = s / 2;
  const tiles: PatternPaint['tiles'] = (() => {
    switch (kind) {
      case 'stripes': return [{ d: `M0 0H${h}V${s}H0Z`, fill: fg }];
      case 'dots': { const r = s * .22; return [{ d: `M${h - r} ${h}A${r} ${r} 0 1 0 ${h + r} ${h}A${r} ${r} 0 1 0 ${h - r} ${h}Z`, fill: fg }]; }
      case 'checker': return [{ d: `M0 0H${h}V${h}H0ZM${h} ${h}H${s}V${s}H${h}Z`, fill: fg }];
      case 'grid': return [{ d: `M0 0H${s}V${s * .08}H0ZM0 0H${s * .08}V${s}H0Z`, fill: fg }];
      case 'waves': return [{ d: `M0 ${h}C${s * .25} ${h - s * .3} ${s * .75} ${h + s * .3} ${s} ${h}`, stroke: fg, strokeWidth: s * .1 }];
      case 'diagonal': return [{ d: `M0 ${s}L${s} 0`, stroke: fg, strokeWidth: s * .18 }, { d: `M${-h} ${h}L${h} ${-h}M${h} ${s + h}L${s + h} ${h}`, stroke: fg, strokeWidth: s * .18 }];
      case 'crosshatch': return [{ d: `M0 ${s}L${s} 0M0 0L${s} ${s}`, stroke: fg, strokeWidth: s * .08 }];
      case 'scales': return [{ d: `M0 ${h}A${h} ${h} 0 0 1 ${s} ${h}M${-h} ${s}A${h} ${h} 0 0 1 ${h} ${s}M${h} ${s}A${h} ${h} 0 0 1 ${s + h} ${s}`, stroke: fg, strokeWidth: s * .07 }];
    }
  })();
  const p: PatternPaint = { type: 'pattern', w: s, h: s, tiles, background: bg };
  if (angle) { const a = angle * Math.PI / 180; p.transform = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]; }
  return p;
}

// ── Swatches ────────────────────────────────────────────────────────────────────────

export const DEFAULT_SWATCHES: StudioSwatch[] = [
  ['None', 'none'], ['White', '#ffffff'], ['Black', '#111111'], ['Ink', '#1B1523'], ['Grey', '#8a8594'], ['Paper', '#f6f1e7'],
  ['Plajah purple', '#6B0099'], ['Magenta', '#D40055'], ['Orange', '#FF8A00'], ['Cyan', '#00DAF3'], ['Lilac', '#D0BCFF'],
  ['Red', '#e5383b'], ['Coral', '#ff7f6e'], ['Sun', '#ffd23f'], ['Leaf', '#4caf50'], ['Forest', '#1f6f50'], ['Sky', '#6fa6cf'], ['Navy', '#1d3557'], ['Plum', '#5e2b7e'], ['Sand', '#e3c9a1'], ['Clay', '#b5654a'],
].map(([name, color], i) => ({ id: `sw${i}`, name, color }));

/** Paint the selection with a swatch; global swatches link the objects. */
export function applySwatch(o: TelaVectorObject, sw: StudioSwatch, which: 'fill' | 'stroke'): TelaVectorObject {
  const n = setPaint(o, which, sw.color === 'none' ? 'none' : sw.color);
  if (sw.global && sw.color !== 'none') n.studio = { ...(n.studio ?? { v: 1 }), [which === 'fill' ? 'fillSwatch' : 'strokeSwatch']: sw.id };
  return n;
}
/** Editing a global swatch repaints every linked object. */
export function updateGlobalSwatch(objects: TelaVectorObject[], sw: StudioSwatch): TelaVectorObject[] {
  return objects.map(o => {
    let n = o;
    if (o.studio?.fillSwatch === sw.id) { n = { ...setPaint(n, 'fill', sw.color), studio: { ...n.studio!, fillSwatch: sw.id } }; }
    if (o.studio?.strokeSwatch === sw.id) { n = { ...setPaint(n, 'stroke', sw.color), studio: { ...n.studio!, strokeSwatch: sw.id } }; }
    return n;
  });
}
