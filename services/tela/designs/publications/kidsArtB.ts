// kidsArtB — procedural picture-book drawing kit (wax-resist crayon / oil-pastel look).
//
// Everything here returns plain Tela objects so each page stays editable. Shapes
// are hand-wobbled (seeded), outlined thickly, hatched like a crayon, and the
// lettering is built letter by letter so titles bounce, tilt and carry a hard
// drop shadow. Used by story-ocean and story-bedtime (storybooksB.ts).
import type { TelaGradientPaint, TelaVectorObject } from '../../../../types';
import type { FontKey } from '../../telaFonts';
import { rect, ellipse, circle, line, path, text, type ShapeOpts } from '../../templateKit';
import * as orn from '../../ornaments';

export type O = TelaVectorObject;
export type Pt = [number, number];
const PI = Math.PI;
const r1 = (n: number) => Math.round(n * 10) / 10;

// ── Gradients ────────────────────────────────────────────────────────────────
export type Stop = [offset: number, color: string, opacity?: number];
const stops = (s: Stop[]) => s.map(([offset, color, opacity]) => (opacity === undefined ? { offset, color } : { offset, color, opacity }));
export const lin = (angle: number, ...s: Stop[]): TelaGradientPaint => ({ kind: 'LINEAR', angle, stops: stops(s) });
export const rad = (...s: Stop[]): TelaGradientPaint => ({ kind: 'RADIAL', stops: stops(s) });

// ── Smooth hand-drawn paths ──────────────────────────────────────────────────
export function bbox(pts: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/** Catmull-Rom through the points, as cubic Beziers, in coordinates relative to (ox,oy). */
export function smoothD(pts: Pt[], closed: boolean, ox = 0, oy = 0): string {
  const n = pts.length; const P = (i: number): Pt => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const q = (p: Pt) => `${r1(p[0] - ox)} ${r1(p[1] - oy)}`;
  let d = `M${q(pts[0])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${q(c1)} ${q(c2)} ${q(p2)}`;
  }
  return closed ? d + ' Z' : d;
}
/** A smooth shape through points (absolute artboard coordinates). */
export function shape(pts: Pt[], closed: boolean, fill: string, o: ShapeOpts = {}): O {
  const b = bbox(pts);
  return path(b.x, b.y, b.w, b.h, smoothD(pts, closed, b.x, b.y), closed ? fill : 'none', { ...o, origin: { x: 0, y: 0, w: b.w, h: b.h }, open: !closed });
}
/** A straight-segment polygon / polyline (absolute coordinates). */
export function poly(pts: Pt[], closed: boolean, fill: string, o: ShapeOpts = {}): O {
  const b = bbox(pts);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p[0] - b.x)} ${r1(p[1] - b.y)}`).join(' ') + (closed ? ' Z' : '');
  return path(b.x, b.y, b.w, b.h, d, closed ? fill : 'none', { ...o, origin: { x: 0, y: 0, w: b.w, h: b.h }, open: !closed });
}
/** A raw SVG path string given in absolute coordinates (arcs allowed) inside a known box. */
export function raw(x: number, y: number, w: number, h: number, d: string, fill: string, o: ShapeOpts = {}): O {
  return path(x, y, w, h, d, fill, { ...o, origin: { x: 0, y: 0, w, h }, open: fill === 'none' });
}

/** A wobbly, hand-drawn ellipse. */
export function wob(cx: number, cy: number, rx: number, ry: number, fill: string, o: ShapeOpts = {}, seed = 1, jit = .045, n = 14): O {
  const r = orn.rng(seed * 7 + 3); const pts: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2; const k = 1 + (r() - .5) * 2 * jit; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  return shape(pts, true, fill, o);
}
/** A loose second pencil line round an ellipse: open arc of ~320 degrees, slightly off-register. */
export function scribble(cx: number, cy: number, rx: number, ry: number, color: string, width: number, seed = 2, opacity = .6): O {
  const r = orn.rng(seed * 13 + 5); const a0 = r() * PI * 2; const n = 11; const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + i / n * PI * 1.8; const k = 1.035 + (r() - .5) * .05; pts.push([cx + 2 + Math.cos(a) * rx * k, cy + 1 + Math.sin(a) * ry * k]); }
  return shape(pts, false, 'none', { stroke: color, strokeWidth: width, opacity, label: 'Crayon outline' });
}
/** Wobbly rounded rectangle / squircle (banners, panels, signs). n=2 ellipse, 4 squircle, 8 near-rect. */
export function squircle(cx: number, cy: number, w: number, h: number, fill: string, o: ShapeOpts = {}, seed = 1, n = 5, jit = 2.2): O {
  const r = orn.rng(seed * 11 + 1); const pts: Pt[] = []; const N = 28;
  for (let i = 0; i < N; i++) {
    const a = i / N * PI * 2; const c = Math.cos(a), s = Math.sin(a);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w / 2, y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * h / 2;
    pts.push([cx + x + (r() - .5) * jit * 2, cy + y + (r() - .5) * jit * 2]);
  }
  return shape(pts, true, fill, o);
}

// ── Crayon texture ───────────────────────────────────────────────────────────
const hatchLine = (x1: number, y1: number, x2: number, y2: number, color: string, w: number, op: number) => line(x1, y1, x2, y2, color, w, { opacity: op, label: 'Crayon hatch', role: 'ORNAMENT' });
/** Hatching inside an ellipse; `range` limits it to a slice of the ellipse (-1..1 across the normal direction). */
export function hatch(cx: number, cy: number, rx: number, ry: number, angleDeg: number, gap: number, color: string, width = 3, opacity = .45, seed = 1, range: [number, number] = [-1, 1]): O[] {
  const a = angleDeg * PI / 180; const dx = Math.cos(a), dy = Math.sin(a); const nx = -dy, ny = dx;
  const ext = Math.sqrt((rx * nx) ** 2 + (ry * ny) ** 2); const r = orn.rng(seed * 17 + 9); const out: O[] = [];
  const A = (dx / rx) ** 2 + (dy / ry) ** 2;
  for (let t = ext * range[0] + gap / 2; t < ext * range[1]; t += gap) {
    const B = 2 * (t * nx * dx / rx ** 2 + t * ny * dy / ry ** 2); const C = (t * nx / rx) ** 2 + (t * ny / ry) ** 2 - 1;
    const disc = B * B - 4 * A * C; if (disc <= 0) continue;
    let s1 = (-B - Math.sqrt(disc)) / (2 * A), s2 = (-B + Math.sqrt(disc)) / (2 * A);
    const len = s2 - s1; s1 += len * (.08 + r() * .1); s2 -= len * (.08 + r() * .1);
    const j = (r() - .5) * 3;
    out.push(hatchLine(cx + t * nx + s1 * dx + j, cy + t * ny + s1 * dy, cx + t * nx + s2 * dx - j, cy + t * ny + s2 * dy, color, width, opacity));
  }
  return out;
}
/** Hatching across a rectangle (Liang-Barsky clip of parallel lines). */
export function hatchRect(x: number, y: number, w: number, h: number, angleDeg: number, gap: number, color: string, width = 3, opacity = .3, seed = 1): O[] {
  const a = angleDeg * PI / 180; const dx = Math.cos(a), dy = Math.sin(a); const nx = -dy, ny = dx; const cx = x + w / 2, cy = y + h / 2;
  const ext = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2; const r = orn.rng(seed * 19 + 4); const out: O[] = [];
  for (let t = -ext + gap / 2; t < ext; t += gap) {
    const px = cx + t * nx, py = cy + t * ny; let t0 = -1e5, t1 = 1e5;
    const clip = (p: number, q: number) => { if (Math.abs(p) < 1e-9) return q >= 0; const u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } return true; };
    if (clip(-dx, px - x) && clip(dx, x + w - px) && clip(-dy, py - y) && clip(dy, y + h - py)) {
      const len = t1 - t0; const s0 = t0 + len * (r() * .12), s1 = t1 - len * (r() * .12);
      out.push(hatchLine(px + s0 * dx, py + s0 * dy, px + s1 * dx, py + s1 * dy, color, width, opacity));
    }
  }
  return out;
}
/** Wax-resist speckle: short broken crayon dashes. */
export function wax(x: number, y: number, w: number, h: number, count: number, color: string, seed = 3, opacity = .45, width = 3): O[] {
  const r = orn.rng(seed * 23 + 2); const out: O[] = [];
  for (let i = 0; i < count; i++) {
    const px = x + r() * w, py = y + r() * h, len = 5 + r() * 14, a = (r() - .5) * .7;
    out.push(line(px, py, px + Math.cos(a) * len, py + Math.sin(a) * len, color, width * (.7 + r() * .6), { opacity: opacity * (.6 + r() * .6), label: 'Wax speckle', role: 'ORNAMENT' }));
  }
  return out;
}

// ── Lettering ────────────────────────────────────────────────────────────────
export interface LetterOpts {
  font: FontKey; size: number; colors: string[]; outline: string; outlineW?: number;
  shadow?: string; shadowDx?: number; shadowDy?: number; bounce?: number; tilt?: number; weight?: number;
  track?: number; wScale?: number; seed?: number; label?: string; role?: 'HEADLINE' | 'LABEL' | 'BODY'; opacity?: number;
}
const NARROW_C = /[il!.,'1|:;]/, MID_C = /[tfjr()\- ]/;
export function advance(ch: string, wScale = 1): number {
  if (ch === ' ') return .3 * wScale;
  if (NARROW_C.test(ch)) return .3 * wScale;
  if (MID_C.test(ch)) return .42 * wScale;
  if (/[mwMW]/.test(ch)) return .86 * wScale;
  if (/[A-Z0-9]/.test(ch)) return .7 * wScale;
  return .6 * wScale;
}
/** One line of hand-lettered title, one TEXT per glyph: bouncing, tilting, outlined, with a hard drop shadow. */
export function letterLine(cx: number, y: number, str: string, o: LetterOpts): { objs: O[]; width: number } {
  const chars = Array.from(str); const advs = chars.map(c => advance(c, o.wScale ?? 1) * o.size + (o.track ?? 0));
  const total = advs.reduce((a, b) => a + b, 0) - (o.track ?? 0); let x = cx - total / 2; const r = orn.rng((o.seed ?? 1) * 29 + 7);
  const objs: O[] = []; const ow = o.outlineW ?? o.size * .22; const dx = o.shadowDx ?? o.size * .05, dy = o.shadowDy ?? o.size * .07;
  let ci = 0;
  chars.forEach((ch, i) => {
    const mid = x + advs[i] / 2 - (o.track ?? 0) / 2; x += advs[i];
    if (ch === ' ') return;
    const by = (o.bounce ?? o.size * .06) * Math.sin(i * 1.55 + (o.seed ?? 1)) + (r() - .5) * 2;
    const rot = (o.tilt ?? 7) * Math.sin(i * 2.1 + (o.seed ?? 1) * 1.3) + (r() - .5) * 3;
    objs.push(text(mid - o.size * .6, y + by, o.size * 1.2, ch, {
      size: o.size, font: o.font, weight: o.weight ?? 700, color: o.colors[ci++ % o.colors.length], align: 'center', wrap: false, rotation: rot, opacity: o.opacity,
      stroke: o.outline, strokeWidth: ow, shadow: o.shadow ? { x: dx, y: dy, blur: 0, color: o.shadow } : undefined, label: `${o.label || 'Title'} letter ${ch}`, role: o.role || 'HEADLINE',
    }));
  });
  return { objs, width: total };
}

/** Body copy with explicit line breaks (so banners can be sized to fit). Optional outline halo for text sitting straight on art. */
export function lines(x: number, y: number, w: number, value: string, o: { size: number; font: FontKey; weight?: number; color: string; align?: 'left' | 'center' | 'right'; leading?: number; halo?: string; haloW?: number; rotation?: number; label?: string; italic?: boolean; opacity?: number }): O {
  return text(x, y, w, value, { size: o.size, font: o.font, weight: o.weight ?? 700, color: o.color, align: o.align, leading: o.leading ?? 1.5, wrap: false, rotation: o.rotation, italic: o.italic, opacity: o.opacity, stroke: o.halo, strokeWidth: o.halo ? (o.haloW ?? o.size * .3) : 0, label: o.label || 'Read-aloud text', role: 'BODY' });
}
/** Longest line length estimate (px) of a multi-line string. */
export function lineWidth(value: string, size: number, wScale = 1): number {
  return Math.max(...value.split('\n').map(l => Array.from(l).reduce((a, c) => a + advance(c, wScale) * size, 0)));
}


/** Read-aloud text set on a circular arc (one TEXT per glyph, letters standing on the arc). Angles in degrees, 0 = right, -90 = top. */
export function arcText(cx: number, cy: number, r: number, centreDeg: number, str: string, o: { size: number; font: FontKey; color: string; weight?: number; wScale?: number; track?: number; stroke?: string; strokeW?: number; label?: string }): O[] {
  const chars = Array.from(str); const advs = chars.map(c => advance(c, o.wScale ?? 1) * o.size + (o.track ?? 0));
  const total = advs.reduce((a, b) => a + b, 0); let theta = centreDeg * PI / 180 - total / r / 2; const out: O[] = [];
  chars.forEach((ch, i) => {
    const a = theta + advs[i] / r / 2; theta += advs[i] / r;
    if (ch === ' ') return;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    out.push(text(px - o.size * .6, py - o.size / 2, o.size * 1.2, ch, { size: o.size, font: o.font, weight: o.weight ?? 700, color: o.color, align: 'center', wrap: false, rotation: a * 180 / PI + 90, stroke: o.stroke, strokeWidth: o.stroke ? (o.strokeW ?? o.size * .2) : 0, label: o.label || 'Read-aloud text on arc', role: 'BODY' }));
  });
  return out;
}

// ── Rotation helper for text riding a tilted / curved banner ─────────────────
export function tiltPoint(cx: number, cy: number, deg: number, x: number, y: number): Pt {
  const a = deg * PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
/** Re-seat a text block (given by its unrotated centre) onto a tilted frame. */
export function seat(t: O, centreX: number, centreY: number, pivotX: number, pivotY: number, deg: number): O {
  const [nx, ny] = tiltPoint(pivotX, pivotY, deg, centreX, centreY);
  return { ...t, x: nx - t.w / 2, y: ny - t.h / 2, rotation: (t.rotation || 0) + deg };
}

// ── Small furniture ──────────────────────────────────────────────────────────
export const SPARKLE = 'M50 0 Q54 46 100 50 Q54 54 50 100 Q46 54 0 50 Q46 46 50 0 Z';
export const sparkle = (cx: number, cy: number, s: number, fill: string, o: ShapeOpts = {}) => path(cx - s / 2, cy - s / 2, s, s, SPARKLE, fill, { label: 'Sparkle', ...o });
export function glow(cx: number, cy: number, r: number, color: string, a = .6, label = 'Glow'): O {
  return ellipse(cx - r, cy - r, r * 2, r * 2, color, { gradient: rad([0, color, a], [.4, color, a * .5], [1, color, 0]), label, role: 'ORNAMENT' });
}
/** A bubble: pale rim, soft fill, a bright crescent highlight. */
export function bubble(cx: number, cy: number, r: number, rim: string, fillA = .14): O[] {
  const hi = raw(cx - r * .62, cy - r * .62, r * .7, r * .7, `M${r1(r * .35)} ${r1(r * .05)} A${r1(r * .3)} ${r1(r * .3)} 0 0 0 ${r1(r * .05)} ${r1(r * .35)}`, 'none', { stroke: '#FFFFFF', strokeWidth: Math.max(2, r * .13), opacity: .85, label: 'Bubble shine' });
  return [circle(cx, cy, r, rim, { opacity: fillA, stroke: rim, strokeWidth: Math.max(2.5, r * .1), label: 'Bubble' }), hi];
}
/** Hard-offset sticker shadow behind any list of objects: caller passes the base shape. */
export function groundRect(W: number, H: number, fill: string | undefined, gradient?: TelaGradientPaint, label = 'Ground'): O {
  return rect(0, 0, W, H, fill || '#000000', { gradient, role: 'GROUND', label });
}
export { rect, ellipse, circle, line, path, text };
