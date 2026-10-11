// transform — affine matrices, transform each/group, reflect, shear, and Align & Distribute.
//
// Matrices are SVG-ordered [a, b, c, d, e, f]. Transforming a cubic's control points is
// exact for affine maps, so paths never lose precision here. Align/Distribute work on
// bounds records so the UI can align Tela objects, groups, or raw paths the same way:
// relative to the selection, a key object, or the artboard; by geometric bounds or
// visual bounds (incl. stroke); distribute by centres/edges or by exact spacing.
import type { Vec, Rect } from './vec';
import type { Anchor, CompoundPath, Matrix } from './model';
import { pathBounds } from './bezier';

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy = sx, about?: Vec): Matrix => about ? multiply(translate(about.x, about.y), multiply([sx, 0, 0, sy, 0, 0], translate(-about.x, -about.y))) : [sx, 0, 0, sy, 0, 0];
export const rotate = (deg: number, about?: Vec): Matrix => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const r: Matrix = [c, s, -s, c, 0, 0]; return about ? multiply(translate(about.x, about.y), multiply(r, translate(-about.x, -about.y))) : r; };
/** Shear by angle (deg) along an axis angle (deg; 0 = horizontal shear). */
export const shear = (deg: number, axisDeg = 0, about?: Vec): Matrix => {
  const k = Math.tan(deg * Math.PI / 180); let m: Matrix = [1, 0, k, 1, 0, 0];
  if (axisDeg) m = multiply(rotate(axisDeg), multiply(m, rotate(-axisDeg)));
  return about ? multiply(translate(about.x, about.y), multiply(m, translate(-about.x, -about.y))) : m;
};
/** Reflect across a line through `about` at `axisDeg` (90 = vertical axis = flip horizontally). */
export const reflect = (axisDeg: number, about: Vec = { x: 0, y: 0 }): Matrix => {
  const a = 2 * axisDeg * Math.PI / 180; const m: Matrix = [Math.cos(a), Math.sin(a), Math.sin(a), -Math.cos(a), 0, 0];
  return multiply(translate(about.x, about.y), multiply(m, translate(-about.x, -about.y)));
};
/** m1 · m2 (apply m2 first). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a, b, c, d, e, f] = m1, [A, B, C, D, E, F] = m2;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}
export const compose = (...ms: Matrix[]): Matrix => ms.reduce((acc, m) => multiply(m, acc), IDENTITY);
export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m; const det = a * d - b * c; if (Math.abs(det) < 1e-300) return IDENTITY;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
export const apply = (m: Matrix, p: Vec): Vec => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
export const det = (m: Matrix) => m[0] * m[3] - m[1] * m[2];
/** Uniform scale factor of a matrix (√|det|) — how stroke widths scale. */
export const meanScale = (m: Matrix) => Math.sqrt(Math.abs(det(m)));

/** Parse an SVG transform attribute (matrix/translate/scale/rotate/skewX/skewY lists). */
export function parseTransform(s: string | null | undefined): Matrix {
  if (!s) return IDENTITY; let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g; let r: RegExpExecArray | null;
  while ((r = re.exec(s))) {
    const a = (r[2].match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).map(Number); let t: Matrix = IDENTITY;
    switch (r[1]) {
      case 'matrix': if (a.length >= 6) t = [a[0], a[1], a[2], a[3], a[4], a[5]]; break;
      case 'translate': t = translate(a[0] ?? 0, a[1] ?? 0); break;
      case 'scale': t = scale(a[0] ?? 1, a[1] ?? a[0] ?? 1); break;
      case 'rotate': t = rotate(a[0] ?? 0, a.length >= 3 ? { x: a[1], y: a[2] } : undefined); break;
      case 'skewX': t = [1, 0, Math.tan((a[0] ?? 0) * Math.PI / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan((a[0] ?? 0) * Math.PI / 180), 0, 1, 0, 0]; break;
    }
    m = multiply(m, t);
  }
  return m;
}
export const matrixToString = (m: Matrix) => `matrix(${m.map(v => Math.round(v * 1e6) / 1e6).join(' ')})`;

/** Transform a path (exact for beziers). A reflection keeps the path's fill unchanged. */
export function transformPath(p: CompoundPath, m: Matrix): CompoundPath {
  const T = (a: Anchor): Anchor => { const q = apply(m, a); const o: Anchor = { x: q.x, y: q.y }; if (a.hin) o.hin = apply(m, a.hin); if (a.hout) o.hout = apply(m, a.hout); if (a.kind) o.kind = a.kind; return o; };
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => ({ closed: s.closed, anchors: s.anchors.map(T) })) };
}
export const translatePath = (p: CompoundPath, dx: number, dy: number) => transformPath(p, translate(dx, dy));

/** Object ▸ Transform ▸ Transform Each: each path scaled/rotated/moved about its own reference point. */
export interface EachOpts { sx?: number; sy?: number; rotate?: number; dx?: number; dy?: number; reflectX?: boolean; reflectY?: boolean; /** Reference point within each bounds (0..1); default centre. */ ref?: Vec; random?: () => number; jitter?: { move?: number; scale?: number; rotate?: number } }
export function transformEach(paths: CompoundPath[], o: EachOpts): CompoundPath[] {
  return paths.map(p => {
    const b = pathBounds(p); const ref = o.ref ?? { x: .5, y: .5 }; const c = { x: b.x + b.w * ref.x, y: b.y + b.h * ref.y };
    const R = o.random; const j = o.jitter ?? {};
    const rnd = (amp = 0) => R && amp ? (R() * 2 - 1) * amp : 0;
    let sx = (o.sx ?? 1) * (1 + rnd(j.scale)), sy = (o.sy ?? o.sx ?? 1) * (1 + rnd(j.scale)); if (o.reflectX) sx = -sx; if (o.reflectY) sy = -sy;
    const m = compose(translate(-c.x, -c.y), [sx, 0, 0, sy, 0, 0], rotate((o.rotate ?? 0) + rnd(j.rotate)), translate(c.x + (o.dx ?? 0) + rnd(j.move), c.y + (o.dy ?? 0) + rnd(j.move)));
    return transformPath(p, m);
  });
}

// ── Align & distribute ──────────────────────────────────────────────────────────────

export type AlignTo = 'selection' | 'key' | 'artboard';
export type AlignH = 'left' | 'center' | 'right';
export type AlignV = 'top' | 'middle' | 'bottom';
export interface Alignable { id: string; bounds: Rect; /** Visual bounds incl. stroke (optional). */ visual?: Rect }
export interface AlignOpts { to?: AlignTo; keyId?: string; artboard?: Rect; useVisual?: boolean }

const bOf = (a: Alignable, vis?: boolean) => vis && a.visual ? a.visual : a.bounds;
function target(items: Alignable[], o: AlignOpts): Rect {
  if (o.to === 'artboard' && o.artboard) return o.artboard;
  if (o.to === 'key' && o.keyId) { const k = items.find(i => i.id === o.keyId); if (k) return bOf(k, o.useVisual); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of items) { const b = bOf(i, o.useVisual); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Returns the {dx, dy} to apply to each item (key object never moves). */
export function align(items: Alignable[], h: AlignH | null, v: AlignV | null, o: AlignOpts = {}): Record<string, Vec> {
  const T = target(items, o); const out: Record<string, Vec> = {};
  for (const i of items) {
    const b = bOf(i, o.useVisual); let dx = 0, dy = 0;
    if (o.to === 'key' && i.id === o.keyId) { out[i.id] = { x: 0, y: 0 }; continue; }
    if (h === 'left') dx = T.x - b.x; else if (h === 'center') dx = T.x + T.w / 2 - (b.x + b.w / 2); else if (h === 'right') dx = T.x + T.w - (b.x + b.w);
    if (v === 'top') dy = T.y - b.y; else if (v === 'middle') dy = T.y + T.h / 2 - (b.y + b.h / 2); else if (v === 'bottom') dy = T.y + T.h - (b.y + b.h);
    out[i.id] = { x: dx, y: dy };
  }
  return out;
}
export type DistributeMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'spaceH' | 'spaceV';
/**
 * Distribute objects. Edge/centre modes space the chosen reference evenly between the
 * extreme objects. Spacing modes equalise the gaps — or, with `spacing` and a key object,
 * use that exact gap outward from the key (Illustrator's Distribute Spacing).
 */
export function distribute(items: Alignable[], mode: DistributeMode, o: AlignOpts & { spacing?: number } = {}): Record<string, Vec> {
  const out: Record<string, Vec> = {}; for (const i of items) out[i.id] = { x: 0, y: 0 };
  if (items.length < 2) return out;
  const horiz = ['left', 'center', 'right', 'spaceH'].includes(mode);
  const pos = (b: Rect) => horiz ? b.x : b.y, size = (b: Rect) => horiz ? b.w : b.h;
  const ref = (b: Rect) => mode === 'left' || mode === 'top' ? pos(b) : mode === 'right' || mode === 'bottom' ? pos(b) + size(b) : pos(b) + size(b) / 2;
  const sorted = items.slice().sort((a, b) => ref(bOf(a, o.useVisual)) - ref(bOf(b, o.useVisual)));
  const set = (i: Alignable, delta: number) => { out[i.id] = horiz ? { x: delta, y: 0 } : { x: 0, y: delta }; };
  if (mode === 'spaceH' || mode === 'spaceV') {
    const byPos = items.slice().sort((a, b) => pos(bOf(a, o.useVisual)) - pos(bOf(b, o.useVisual)));
    if (o.spacing !== undefined && o.keyId) {
      const ki = byPos.findIndex(i => i.id === o.keyId); if (ki < 0) return out;
      let cur = pos(bOf(byPos[ki], o.useVisual)) + size(bOf(byPos[ki], o.useVisual));
      for (let i = ki + 1; i < byPos.length; i++) { const b = bOf(byPos[i], o.useVisual); set(byPos[i], cur + o.spacing - pos(b)); cur += o.spacing + size(b); }
      cur = pos(bOf(byPos[ki], o.useVisual));
      for (let i = ki - 1; i >= 0; i--) { const b = bOf(byPos[i], o.useVisual); set(byPos[i], cur - o.spacing - size(b) - pos(b)); cur -= o.spacing + size(b); }
      return out;
    }
    const first = bOf(byPos[0], o.useVisual), last = bOf(byPos[byPos.length - 1], o.useVisual);
    const total = byPos.reduce((s, i) => s + size(bOf(i, o.useVisual)), 0);
    const gap = (pos(last) + size(last) - pos(first) - total) / (byPos.length - 1);
    let cur = pos(first);
    for (const i of byPos) { const b = bOf(i, o.useVisual); set(i, cur - pos(b)); cur += size(b) + gap; }
    return out;
  }
  const r0 = ref(bOf(sorted[0], o.useVisual)), r1 = ref(bOf(sorted[sorted.length - 1], o.useVisual)); const step = (r1 - r0) / (sorted.length - 1);
  sorted.forEach((i, k) => set(i, r0 + step * k - ref(bOf(i, o.useVisual))));
  return out;
}
