// compose — composition and arrangement helpers for code-built illustration:
// symmetry/repeat (radial, mirror, along a path), rule-of-thirds and horizon placement,
// and depth layering with atmospheric perspective (far things lighter, cooler, less
// saturated, smaller, lower contrast — the single cheapest trick that makes a vector
// landscape read as deep and painted).
import type { Vec, Rect } from '../vec';
import type { CompoundPath } from '../model';
import { transformPath, rotate, reflect, compose as composeM, translate, scale } from '../transform';
import { pathBounds } from '../bezier';
import { pointsAlong } from '../pathOps';
import { mix, hueShift, parseColor, toOklab, fromOklab, toCss } from '../color';

// ── Symmetry / repeat ───────────────────────────────────────────────────────────────

/** n copies rotated about a centre (flowers, suns, mandalas). */
export function radialRepeat(p: CompoundPath, n: number, center: Vec, startDeg = 0): CompoundPath[] {
  return Array.from({ length: n }, (_, i) => transformPath(p, rotate(startDeg + i * 360 / n, center)));
}
/** The shape plus its mirror across a line through `about` at axisDeg (90 = vertical). */
export function mirror(p: CompoundPath, axisDeg = 90, about?: Vec): CompoundPath[] {
  const b = pathBounds(p); const c = about ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return [p, transformPath(p, reflect(axisDeg, c))];
}
/** Copies placed along a path, rotated to its tangent (fences, bunting, footprints). */
export function repeatAlong(p: CompoundPath, guide: CompoundPath, spacing: number, o: { align?: boolean; jitter?: number; seed?: number } = {}): CompoundPath[] {
  const b = pathBounds(p); const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return pointsAlong(guide, spacing, o.jitter ?? 0, o.seed ?? 1).map(({ p: q, tan }) => transformPath(p, composeM(translate(-c.x, -c.y), o.align === false ? [1, 0, 0, 1, 0, 0] : rotate(Math.atan2(tan.y, tan.x) * 180 / Math.PI), translate(q.x, q.y))));
}
/** Grid repeat with optional brick offset. */
export function gridRepeat(p: CompoundPath, cols: number, rows: number, dx: number, dy: number, brick = 0): CompoundPath[] {
  const out: CompoundPath[] = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(transformPath(p, translate(c * dx + (r % 2 ? brick * dx : 0), r * dy))); return out;
}

// ── Layout ──────────────────────────────────────────────────────────────────────────

/** Rule-of-thirds lines and the four power points. */
export function thirds(r: Rect) {
  const xs = [r.x + r.w / 3, r.x + r.w * 2 / 3], ys = [r.y + r.h / 3, r.y + r.h * 2 / 3];
  return { xs, ys, points: [{ x: xs[0], y: ys[0] }, { x: xs[1], y: ys[0] }, { x: xs[0], y: ys[1] }, { x: xs[1], y: ys[1] }] as Vec[] };
}
/** Horizon y for a mood: low (big sky, calm/epic), mid (balanced), high (ground-heavy, intimate). */
export function horizon(r: Rect, mood: 'low' | 'mid' | 'high' | number = 'low'): number {
  const f = typeof mood === 'number' ? mood : mood === 'low' ? .68 : mood === 'mid' ? .5 : .32; return r.y + r.h * f;
}
/** Golden-section point (for the hero). */
export const golden = (r: Rect, right = true): Vec => ({ x: r.x + r.w * (right ? .618 : .382), y: r.y + r.h * .618 });
/** Keep important things out of the gutter of a spread (returns a safe x). */
export const avoidGutter = (x: number, spreadW: number, strip = 48) => { const g = spreadW / 2; return Math.abs(x - g) < strip ? (x < g ? g - strip : g + strip) : x; };

// ── Depth / atmospheric perspective ─────────────────────────────────────────────────

export interface Atmosphere { sky: string; /** 0..1 how strongly distance fades toward the sky colour. */ haze?: number; /** Cool shift at distance (deg hue in OKLab). */ cool?: number }
/** Colour of an object at depth 0 (foreground) .. 1 (horizon). */
export function atDepth(color: string, depth: number, a: Atmosphere): string {
  const d = Math.max(0, Math.min(1, depth)); const h = (a.haze ?? .65) * d ** 1.15;
  const desat = (() => { const c = parseColor(color); const [L, A, B] = toOklab(c); const k = 1 - .55 * d; return toCss(fromOklab(L, A * k, B * k, c.a)); })();
  return mix(hueShift(desat, -(a.cool ?? 18) * d), a.sky, h);
}
/** Scale factor for objects at depth (simple perspective: 1 at front → minScale at horizon). */
export const depthScale = (depth: number, minScale = .35) => 1 - (1 - minScale) * Math.max(0, Math.min(1, depth));
/** A list of depth planes from back to front with their y and colour transform. */
export function depthPlanes(n: number, horizonY: number, bottomY: number, a: Atmosphere) {
  return Array.from({ length: n }, (_, i) => { const depth = 1 - i / Math.max(1, n - 1); return { depth, y: horizonY + (bottomY - horizonY) * (1 - depth) ** 1.6, tint: (c: string) => atDepth(c, depth, a), scale: depthScale(depth) }; });
}
/** Scale a shape about a point (for depth placement). */
export const placeAt = (p: CompoundPath, anchor: Vec, k: number, to: Vec) => transformPath(p, composeM(translate(-anchor.x, -anchor.y), scale(k), translate(to.x, to.y)));
