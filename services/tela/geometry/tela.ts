// tela — the bridge between the geometry engine and TelaVectorObject.
//
// objectToPath: ANY vector object (RECT with rx, ELLIPSE, LINE, PATH as polyline /
// freehand ink / svgPathData+origin box / pathNodes) → a compound path in artboard
// coordinates with rotation applied, drawn exactly as the existing renderers draw it
// (rect default rx 2, svgPathData uses evenodd, open ink polylines are quadratic-smoothed).
//
// pathToObject: a compound path + paint → a PATH object whose `svgPathData` is in artboard
// coordinates and whose pathOrigin box equals its own (≥1 px) box, i.e. an identity
// mapping, so legacy renderers draw it unchanged; engine finish rides in `geom`, and a
// faithful legacy fallback (solid colour / approximated gradient) is always filled in.
import type { TelaVectorObject, TelaBlendMode, TelaShadow, TelaGradientPaint } from '../../../types';
import type { CompoundPath, FillRule, Paint, StrokeStyle, MaterialRef, TelaGeomExt } from './model';
import { fromPoints, fromNodes } from './model';
import { parsePathData, toPathData } from './pathData';
import { rectPath, ellipsePath, polyPath } from './shapes';
import { transformPath, rotate, translate, scale, compose } from './transform';
import { pathBounds } from './bezier';

/** Smoothed ink polyline exactly as services/inkMath.pathData draws it. */
function inkPath(flat: number[]): CompoundPath {
  if (flat.length < 6) return fromPoints(flat, false);
  let d = `M${flat[0]},${flat[1]}`;
  for (let i = 2; i + 3 < flat.length; i += 2) { const mx = (flat[i] + flat[i + 2]) / 2, my = (flat[i + 1] + flat[i + 3]) / 2; d += ` Q${flat[i]},${flat[i + 1]} ${mx},${my}`; }
  d += ` L${flat[flat.length - 2]},${flat[flat.length - 1]}`;
  return parsePathData(d);
}

/** The geometry of a Tela vector object (null for TEXT / LOTTIE / MOTION_TEMPLATE). IMAGE → its box. */
export function objectToPath(o: TelaVectorObject): CompoundPath | null {
  let p: CompoundPath | null = null;
  switch (o.kind) {
    case 'RECT': p = rectPath(o.x, o.y, Math.max(0, o.w), Math.max(0, o.h), o.rx ?? 2); break;
    case 'ELLIPSE': p = ellipsePath(o.x, o.y, Math.max(0, o.w), Math.max(0, o.h)); break;
    case 'IMAGE': p = rectPath(o.x, o.y, o.w, o.h, 0); break;
    case 'LINE': if (o.points && o.points.length >= 4) p = polyPath([{ x: o.points[0], y: o.points[1] }, { x: o.points[2], y: o.points[3] }], false); break;
    case 'PATH': {
      if (o.svgPathData) {
        const rule: FillRule = o.geom?.fillRule ?? 'evenodd';
        const raw = parsePathData(o.svgPathData, rule);
        const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y;
        const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h);
        p = transformPath(raw, compose(translate(-ox, -oy), scale(sx, sy), translate(o.x, o.y)));
        if (!o.pathClosed && o.pathClosed !== undefined) p.subpaths.forEach(s => { s.closed = false; });
      } else if (o.pathNodes?.length) {
        p = fromNodes(o.pathNodes, !!o.pathClosed);
      } else if (o.points) {
        p = o.pathClosed ? fromPoints(o.points, true) : o.points.length >= 6 ? inkPath(o.points) : fromPoints(o.points, false);
      }
      break;
    }
    default: return null;
  }
  if (!p) return null;
  if (o.rotation) { const c = { x: o.x + o.w / 2, y: o.y + o.h / 2 }; p = transformPath(p, rotate(o.rotation, c)); }
  return p;
}

export type Role = NonNullable<TelaVectorObject['templateRole']>;
export interface PaintSpec {
  fill?: Paint | 'none'; stroke?: Paint | 'none'; strokeWidth?: number; strokeStyle?: StrokeStyle;
  opacity?: number; blend?: TelaBlendMode; blur?: number; shadow?: TelaShadow;
  material?: MaterialRef; fillRule?: FillRule; clip?: { d: string; fillRule?: FillRule };
  label?: string; role?: Role; groupId?: string; locked?: boolean; hidden?: boolean;
}

let autoId = 0;
/** A PATH object for a compound path. Coordinates stay in artboard px. */
export function pathToObject(path: CompoundPath, spec: PaintSpec = {}, id?: string): TelaVectorObject {
  const b = pathBounds(path); const w = Math.max(1, b.w), h = Math.max(1, b.h);
  const x = b.x - (w - b.w) / 2, y = b.y - (h - b.h) / 2;
  const d = toPathData(path);
  const fill = spec.fill ?? 'none', stroke = spec.stroke ?? 'none';
  const geom: TelaGeomExt = { v: 1 };
  const fillRule = spec.fillRule ?? path.fillRule;
  geom.fillRule = fillRule;
  if (typeof fill !== 'string') geom.fill = fill;
  if (typeof stroke !== 'string') geom.stroke = stroke;
  if (spec.strokeStyle) geom.strokeStyle = spec.strokeStyle;
  if (spec.material) geom.material = spec.material;
  if (spec.clip) geom.clip = spec.clip;
  const closed = path.subpaths.some(s => s.closed);
  const o: TelaVectorObject = {
    id: id ?? `geo_${(++autoId).toString(36)}`, kind: 'PATH', x, y, w, h,
    fill: legacyColor(fill), stroke: legacyColor(stroke), strokeWidth: spec.strokeWidth ?? (stroke !== 'none' ? 1 : 0),
    rotation: 0, opacity: spec.opacity ?? 1,
    svgPathData: d, pathOriginX: x, pathOriginY: y, pathOriginW: w, pathOriginH: h, pathClosed: closed,
    objectLabel: spec.label ?? 'Vector', templateRole: spec.role ?? 'ORNAMENT',
  };
  const lg = legacyGradient(fill, { x, y, w, h }); if (lg) o.gradient = lg;
  if (spec.blend && spec.blend !== 'normal') o.blendMode = spec.blend;
  if (spec.blur) o.blur = spec.blur;
  if (spec.shadow) o.shadow = spec.shadow;
  if (spec.strokeStyle?.dash?.length) o.strokeDash = spec.strokeStyle.dash;
  if (spec.groupId) o.groupId = spec.groupId;
  if (spec.locked) o.locked = true; if (spec.hidden) o.hidden = true;
  // only carry geom when it adds something beyond the legacy fields
  const extra = geom.fill || geom.stroke || geom.strokeStyle || geom.material || geom.clip || fillRule !== 'evenodd';
  if (extra) o.geom = geom;
  return o;
}

/** Best solid colour for renderers that do not read `geom`. */
export function legacyColor(p: Paint | 'none'): string {
  if (typeof p === 'string') return p;
  switch (p.type) {
    case 'linear': case 'radial': return p.stops[0]?.color ?? '#000';
    case 'freeform': return p.base;
    case 'mesh': return p.nodes[Math.floor(p.nodes.length / 2)]?.color ?? '#000';
    case 'pattern': return p.background ?? p.tiles[0]?.fill ?? '#000';
  }
}
/** Approximate an engine gradient with the legacy bbox-relative gradient. */
export function legacyGradient(p: Paint | 'none', box: { x: number; y: number; w: number; h: number }): TelaGradientPaint | undefined {
  if (typeof p === 'string') return undefined;
  if (p.type === 'linear') {
    const ang = Math.atan2((p.y2 - p.y1) / Math.max(1, box.h), (p.x2 - p.x1) / Math.max(1, box.w)) * 180 / Math.PI;
    return { kind: 'LINEAR', angle: Math.round(ang * 10) / 10, stops: p.stops.map(s => ({ offset: s.offset, color: s.color, opacity: s.opacity })) };
  }
  if (p.type === 'radial') return { kind: 'RADIAL', stops: p.stops.map(s => ({ offset: s.offset, color: s.color, opacity: s.opacity })) };
  return undefined;
}

/** Paint of an object as engine paint (geom wins; else the legacy fields). */
export function objectFill(o: TelaVectorObject): Paint | 'none' { return o.geom?.fill ?? o.fill ?? 'none'; }
