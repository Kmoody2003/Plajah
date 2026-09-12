// templateKit — the small vocabulary every Tela template is written in.
//
// Coordinates are artboard px. Text objects compute their own height from the
// laid-out lines so designers can stack blocks with `below()` instead of
// guessing. Fonts are referenced by FontKey (see telaFonts) so the gallery can
// load exactly what a design needs.
import type { TelaGradientPaint, TelaShadow, TelaVectorObject, TelaBlendMode } from '../../types';
import { fontCss, type FontKey } from './telaFonts';
import { textBlockHeight } from './telaText';
import { oid } from './ornaments';

export type Role = NonNullable<TelaVectorObject['templateRole']>;

export interface ShapeOpts {
  stroke?: string; strokeWidth?: number; opacity?: number; rotation?: number; rx?: number;
  gradient?: TelaGradientPaint; shadow?: TelaShadow; blend?: TelaBlendMode; blur?: number; dash?: number[];
  label?: string; role?: Role;
}

export function rect(x: number, y: number, w: number, h: number, fill: string, o: ShapeOpts = {}): TelaVectorObject {
  return { id: oid('rect'), kind: 'RECT', x, y, w, h, fill, stroke: o.stroke || 'none', strokeWidth: o.strokeWidth || 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1, rx: o.rx ?? 0, gradient: o.gradient, shadow: o.shadow, blendMode: o.blend, blur: o.blur, strokeDash: o.dash, objectLabel: o.label || 'Shape', templateRole: o.role || 'ORNAMENT' };
}
export function ellipse(x: number, y: number, w: number, h: number, fill: string, o: ShapeOpts = {}): TelaVectorObject {
  return { id: oid('ellipse'), kind: 'ELLIPSE', x, y, w, h, fill, stroke: o.stroke || 'none', strokeWidth: o.strokeWidth || 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1, gradient: o.gradient, shadow: o.shadow, blendMode: o.blend, blur: o.blur, strokeDash: o.dash, objectLabel: o.label || 'Ellipse', templateRole: o.role || 'ORNAMENT' };
}
export function circle(cx: number, cy: number, r: number, fill: string, o: ShapeOpts = {}): TelaVectorObject { return ellipse(cx - r, cy - r, r * 2, r * 2, fill, o); }

export function line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, o: Pick<ShapeOpts, 'opacity' | 'dash' | 'label' | 'role'> = {}): TelaVectorObject {
  return { id: oid('line'), kind: 'LINE', x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), points: [x1, y1, x2, y2], fill: 'none', stroke: color, strokeWidth: width, rotation: 0, opacity: o.opacity ?? 1, strokeDash: o.dash, objectLabel: o.label || 'Rule', templateRole: o.role || 'RULE' };
}
export const hr = (x: number, y: number, w: number, color: string, width = 1, o: Pick<ShapeOpts, 'opacity' | 'dash' | 'label'> = {}) => line(x, y, x + w, y, color, width, o);
export const vr = (x: number, y: number, h: number, color: string, width = 1, o: Pick<ShapeOpts, 'opacity' | 'dash' | 'label'> = {}) => line(x, y, x, y + h, color, width, o);

/** PATH drawn in a 0..100 origin box unless `origin` is given. */
export function path(x: number, y: number, w: number, h: number, d: string, fill: string, o: ShapeOpts & { origin?: { x: number; y: number; w: number; h: number }; open?: boolean } = {}): TelaVectorObject {
  const org = o.origin || { x: 0, y: 0, w: 100, h: 100 };
  return { id: oid('path'), kind: 'PATH', x, y, w, h, fill, stroke: o.stroke || 'none', strokeWidth: o.strokeWidth || 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1, gradient: o.gradient, shadow: o.shadow, blendMode: o.blend, blur: o.blur, strokeDash: o.dash, svgPathData: d, pathOriginX: org.x, pathOriginY: org.y, pathOriginW: org.w, pathOriginH: org.h, pathClosed: !o.open, objectLabel: o.label || 'Vector', templateRole: o.role || 'ORNAMENT' };
}

export interface TextOpts {
  size: number; font?: FontKey | string; weight?: number; color?: string;
  align?: 'left' | 'center' | 'right'; tracking?: number; leading?: number; italic?: boolean;
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; wrap?: boolean;
  /** Force a box height; otherwise computed from the laid-out lines. */
  h?: number; opacity?: number; rotation?: number; label?: string; role?: Role;
  stroke?: string; strokeWidth?: number; shadow?: TelaShadow; blend?: TelaBlendMode; gradient?: TelaGradientPaint;
}

export function text(x: number, y: number, w: number, value: string, o: TextOpts): TelaVectorObject {
  const obj: TelaVectorObject = {
    id: oid('text'), kind: 'TEXT', x, y, w, h: o.h ?? 0, text: value,
    fill: o.color || '#111111', stroke: o.stroke || 'none', strokeWidth: o.strokeWidth || 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1,
    fontSize: o.size, fontFamily: fontCss(o.font || 'inter'), fontWeight: o.weight ?? 400, fontStyle: o.italic ? 'italic' : undefined,
    textAlign: o.align, letterSpacing: o.tracking, lineHeight: o.leading, textTransform: o.transform, wrap: o.wrap ?? true,
    shadow: o.shadow, blendMode: o.blend, gradient: o.gradient,
    objectLabel: o.label || 'Text', templateRole: o.role || (o.size >= 40 ? 'HEADLINE' : o.size <= 12 ? 'CAPTION' : 'BODY'),
  };
  if (!o.h) obj.h = Math.ceil(textBlockHeight(obj));
  return obj;
}

/** y just below an object (+gap). */
export const below = (o: TelaVectorObject, gap = 0) => o.y + o.h + gap;
export const right = (o: TelaVectorObject, gap = 0) => o.x + o.w + gap;

export function image(x: number, y: number, w: number, h: number, src: string, sourceW: number, sourceH: number, o: { label?: string; opacity?: number; rotation?: number; role?: Role; blend?: TelaBlendMode; shadow?: TelaShadow } = {}): TelaVectorObject {
  return { id: oid('image'), kind: 'IMAGE', x, y, w, h, fill: 'none', stroke: 'none', strokeWidth: 0, rotation: o.rotation || 0, opacity: o.opacity ?? 1, sourceImageSrc: src, sourceCrop: { x: 0, y: 0, width: sourceW, height: sourceH, sourceWidth: sourceW, sourceHeight: sourceH }, semanticRole: 'ARTWORK', blendMode: o.blend, shadow: o.shadow, objectLabel: o.label || 'Image', templateRole: o.role || 'IMAGE_SLOT' };
}

/**
 * A photo well the way a real layout comp draws one: a quiet tonal field, a
 * hairline, and a small typographic instruction — never a giant grey box with
 * "ADD IMAGE" shouting across it. `tone` follows the page; `shade` shifts it.
 */
export interface SlotOpts { tone?: 'light' | 'dark'; shade?: string; label?: string; rx?: number; rotation?: number; caption?: string; ink?: string; frame?: string; frameWidth?: number; opacity?: number; shadow?: TelaShadow; silent?: boolean }
export function imageSlot(x: number, y: number, w: number, h: number, o: SlotOpts = {}): TelaVectorObject[] {
  const dark = o.tone === 'dark';
  const fill = o.shade || (dark ? 'rgba(255,255,255,.10)' : 'rgba(20,16,24,.08)');
  const ink = o.ink || (dark ? 'rgba(255,255,255,.55)' : 'rgba(20,16,24,.45)');
  const out: TelaVectorObject[] = [rect(x, y, w, h, fill, { rx: o.rx ?? 0, rotation: o.rotation, opacity: o.opacity, shadow: o.shadow, stroke: o.frame, strokeWidth: o.frame ? (o.frameWidth ?? 1) : 0, label: o.label || 'Image slot', role: 'IMAGE_SLOT' })];
  if (!o.silent && Math.min(w, h) > 60) {
    const s = Math.max(9, Math.min(11, Math.round(Math.min(w, h) * .05)));
    out.push(text(x, y + h / 2 - s, w, o.caption || 'Drop a photo', { size: s, font: 'inter', weight: 700, color: ink, align: 'center', tracking: .14, transform: 'uppercase', wrap: false, rotation: o.rotation, label: 'Image slot hint', role: 'LABEL' }));
  }
  return out;
}

/** Column geometry for a grid. */
export function columns(x: number, w: number, n: number, gutter: number): Array<{ x: number; w: number }> {
  const cw = (w - gutter * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x + i * (cw + gutter), w: cw }));
}
/** Span from column a to b (inclusive). */
export function span(cols: Array<{ x: number; w: number }>, a: number, b = a): { x: number; w: number } { return { x: cols[a].x, w: cols[b].x + cols[b].w - cols[a].x }; }

/** Modular type scale. */
export function scale(base: number, ratio = 1.25): (step: number) => number { return step => Math.round(base * Math.pow(ratio, step) * 10) / 10; }

/** Page frame with margins — the thing every layout starts from. */
export interface Frame { W: number; H: number; m: number; x: number; y: number; w: number; h: number; right: number; bottom: number; cx: number; cy: number }
export function frame(W: number, H: number, margin: number, opts: { top?: number; bottom?: number; inner?: number; outer?: number } = {}): Frame {
  const l = opts.inner ?? margin, r = opts.outer ?? margin, t = opts.top ?? margin, b = opts.bottom ?? margin;
  return { W, H, m: margin, x: l, y: t, w: W - l - r, h: H - t - b, right: W - r, bottom: H - b, cx: W / 2, cy: H / 2 };
}

/** Folio / running foot: page number and a running head, on one baseline. */
export function folio(fr: Frame, left: string, rightText: string, color: string, o: { font?: FontKey; size?: number; y?: number; tracking?: number } = {}): TelaVectorObject[] {
  const size = o.size ?? 9, y = o.y ?? fr.bottom - size - 2;
  return [
    text(fr.x, y, fr.w / 2, left, { size, font: o.font || 'inter', weight: 600, color, tracking: o.tracking ?? .12, transform: 'uppercase', wrap: false, label: 'Running head', role: 'FOLIO' }),
    text(fr.x + fr.w / 2, y, fr.w / 2, rightText, { size, font: o.font || 'inter', weight: 600, color, tracking: o.tracking ?? .12, transform: 'uppercase', align: 'right', wrap: false, label: 'Folio', role: 'FOLIO' }),
  ];
}

/** A drop cap plus the paragraph indented beside it. */
export function dropCap(x: number, y: number, w: number, paragraph: string, o: { capFont?: FontKey; textFont?: FontKey; capSize?: number; size?: number; color?: string; capColor?: string; leading?: number }): TelaVectorObject[] {
  const capSize = o.capSize ?? 72, size = o.size ?? 11.5;
  const cap = paragraph.charAt(0), rest = paragraph.slice(1).trimStart();
  const capObj = text(x, y - capSize * .12, capSize * .8, cap, { size: capSize, font: o.capFont || 'playfair', weight: 700, color: o.capColor || o.color || '#111', wrap: false, label: 'Drop cap', role: 'ORNAMENT' });
  const indent = capSize * .78;
  const body = text(x + indent, y, w - indent, rest, { size, font: o.textFont || 'lora', color: o.color || '#111', leading: o.leading ?? 1.45, label: 'Body copy', role: 'BODY' });
  return [capObj, body];
}

/** Tint / shade a hex colour by mixing toward white (+) or black (−). */
export function mix(hex: string, amount: number): string {
  const m = hex.replace('#', ''); if (m.length !== 6) return hex;
  const c = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16));
  const t = amount > 0 ? 255 : 0, k = Math.abs(amount);
  return '#' + c.map(v => Math.round(v + (t - v) * k).toString(16).padStart(2, '0')).join('');
}
export function alpha(hex: string, a: number): string {
  const m = hex.replace('#', ''); if (m.length !== 6) return hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}
/** Relative luminance — decides ink colour over a ground. */
export function luminance(hex: string): number {
  const m = hex.replace('#', ''); if (m.length !== 6) return .5;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4));
  return .2126 * r + .7152 * g + .0722 * b;
}
export const isDark = (hex: string) => luminance(hex) < .35;
