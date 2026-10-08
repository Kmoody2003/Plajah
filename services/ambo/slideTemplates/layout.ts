// layout — the adaptive geometry every slide designer starts from.
//
// Slides are drawn at the output's real pixel size, so instead of one artboard
// we classify the aspect ratio and give designers a type unit, a title-safe
// frame and comfortable reading measures. Designers RE-FLOW per class
// (stack on vertical, centre a measure on ultrawide) rather than scale.
import { text, type TextOpts } from '../../tela/templateKit';
import { layoutTextLines, measureText } from '../../tela/telaText';
import type { SlideObj } from './types';

export type AspectClass = 'tall' | 'portrait' | 'standard' | 'wide' | 'ultra' | 'panorama';

export interface Box { x: number; y: number; w: number; h: number; right: number; bottom: number; cx: number; cy: number }
export const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h, right: x + w, bottom: y + h, cx: x + w / 2, cy: y + h / 2 });

export interface Lay {
  W: number; H: number; ar: number; cls: AspectClass;
  /** Type unit — ~1 % of a 16:9 frame's diagonal-ish size, clamped so LED walls and phones stay legible. */
  u: number;
  /** Title-safe frame. */
  safe: Box;
  /** Comfortable body measure / headline measure (px). */
  measure: number; wideMeasure: number;
  vertical: boolean; stretched: boolean;
}

export function classify(ar: number): AspectClass {
  if (ar < .7) return 'tall';
  if (ar < .95) return 'portrait';
  if (ar < 1.45) return 'standard';
  if (ar < 1.95) return 'wide';
  if (ar < 2.8) return 'ultra';
  return 'panorama';
}

export function lay(W: number, H: number): Lay {
  const ar = W / Math.max(1, H);
  const cls = classify(ar);
  // Vertical screens are read close (lobby portrait TVs, phones): give them a larger unit.
  const u = Math.max(2, ar < .95 ? Math.min(Math.sqrt(W * H) / 100 * 1.22, W / 50) : Math.min(Math.sqrt(W * H) / 100, H / 68, W / 58));
  const mx = Math.max(W * .06, u * 3.5), my = Math.max(H * .065, u * 3.5);
  const safe = box(mx, my, W - mx * 2, H - my * 2);
  return {
    W, H, ar, cls, u, safe,
    measure: Math.min(safe.w, u * 64), wideMeasure: Math.min(safe.w, u * 100),
    vertical: cls === 'tall' || cls === 'portrait', stretched: cls === 'ultra' || cls === 'panorama',
  };
}

/** Widest laid-out line of a TEXT object. */
export function maxLineWidth(o: SlideObj): number {
  return Math.max(0, ...layoutTextLines(o).map(l => measureText(l, o)));
}

/**
 * Text that shrinks until it fits `maxH` and every line (including single long
 * words that cannot wrap) fits the width.
 */
export function fitText(x: number, y: number, w: number, value: string, o: TextOpts, maxH: number, minSize = o.size * .35): SlideObj {
  let size = o.size;
  let obj: SlideObj = text(x, y, w, value, { ...o, size });
  for (let i = 0; i < 24 && size > minSize; i++) {
    if (obj.h <= maxH && maxLineWidth(obj) <= w + .5) break;
    size = Math.max(minSize, size * .92);
    obj = text(x, y, w, value, { ...o, size });
  }
  return obj;
}

/** Move objects by (dx, dy), lines included. */
export function shift(objs: SlideObj[], dx: number, dy: number): SlideObj[] {
  for (const o of objs) {
    o.x += dx; o.y += dy;
    if (o.points) o.points = o.points.map((v, i) => v + (i % 2 ? dy : dx));
    if (o.pathOriginX !== undefined && o.svgPathData) { /* origin is in path space; x/y placement already moved */ }
  }
  return objs;
}

export function bbox(objs: SlideObj[]): Box {
  if (!objs.length) return box(0, 0, 0, 0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objs) { const b = objBox(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
  return box(x0, y0, x1 - x0, y1 - y0);
}

/** Axis-aligned bounds of one object (LINE from its points). */
export function objBox(o: SlideObj): Box {
  if (o.kind === 'LINE' && o.points && o.points.length >= 4) {
    const xs = o.points.filter((_, i) => i % 2 === 0), ys = o.points.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return box(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0);
  }
  return box(o.x, o.y, o.w, o.h);
}

/**
 * Vertical stack builder: add blocks laid out at y = 0, then place the whole
 * stack at a y (or centre it in a band) once its height is known.
 */
export class Stack {
  private items: Array<{ objs: SlideObj[]; gap: number }> = [];
  add(objs: SlideObj | SlideObj[], gap = 0): this { this.items.push({ objs: Array.isArray(objs) ? objs : [objs], gap }); return this; }
  height(): number {
    let y = 0;
    this.items.forEach((it, i) => { const b = bbox(it.objs); y += (i ? it.gap : 0) + b.h; });
    return y;
  }
  /** Lay blocks top-down from y; returns all objects. */
  place(y: number): SlideObj[] {
    const out: SlideObj[] = [];
    let cur = y;
    this.items.forEach((it, i) => {
      if (!it.objs.length) return;
      cur += i ? it.gap : 0;
      const b = bbox(it.objs);
      shift(it.objs, 0, cur - b.y);
      cur += b.h;
      out.push(...it.objs);
    });
    return out;
  }
  /** Centre the stack vertically inside [top, top+h] (optical: slightly above centre). */
  centre(top: number, h: number, bias = -.03): SlideObj[] {
    const sh = this.height();
    const y = Math.min(top + (h - sh) / 2 + h * bias, top + h - sh);
    return this.place(Math.max(top, y));
  }
}

/** Split a multiline field into trimmed non-empty items. */
export const lines = (s: string) => (s || '').split('\n').map(l => l.trim()).filter(Boolean);
