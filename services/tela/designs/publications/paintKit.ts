// paintKit — geometry and batching helpers shared by the v3 medium-specific picture books
// (watercolour "Below the Blue" and felt "Moon Blanket"). Pure maths + one-object-per-batch
// texture paths, so a page can carry hundreds of specks without hundreds of objects.
import type { TelaVectorObject } from '../../../../types';
import * as orn from '../../ornaments';
import { path, type ShapeOpts } from '../../templateKit';
import { smoothD } from './kidsArtB';

export type O = TelaVectorObject;
export type Pt = [number, number];
const PI = Math.PI;
const f1 = (n: number) => Math.round(n * 10) / 10;

/** Seeded random generator (any real seed). */
export const rn = (seed: number): (() => number) => orn.rng(Math.floor(Math.abs(seed) * 131 + 17));

export function bounds(pts: Pt[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), x1, y1 };
}
export function centroid(pts: Pt[]): Pt { let sx = 0, sy = 0; for (const [x, y] of pts) { sx += x; sy += y; } return [sx / pts.length, sy / pts.length]; }
export function area(pts: Pt[]): number { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
export function inside(pts: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi) c = !c;
  }
  return c;
}
/** Scale a polygon about a pivot (default its centroid). */
export function scaleAbout(pts: Pt[], k: number, pivot?: Pt): Pt[] { const [cx, cy] = pivot || centroid(pts); return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt); }
export function shift(pts: Pt[], dx: number, dy: number): Pt[] { return pts.map(([x, y]) => [x + dx, y + dy] as Pt); }
export function rotateAbout(pts: Pt[], deg: number, pivot: Pt): Pt[] {
  const a = deg * PI / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [pivot[0] + (x - pivot[0]) * c - (y - pivot[1]) * s, pivot[1] + (x - pivot[0]) * s + (y - pivot[1]) * c] as Pt);
}
export function jitter(pts: Pt[], seed: number, amt: number): Pt[] { const r = rn(seed); return pts.map(([x, y]) => [x + (r() - .5) * 2 * amt, y + (r() - .5) * 2 * amt] as Pt); }

/** An irregular blob (ellipse with radius noise), absolute coordinates. */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, jit = .12, n = 12, rot = 0): Pt[] {
  const r = rn(seed); const pts: Pt[] = []; const a0 = r() * PI * 2;
  for (let i = 0; i < n; i++) { const a = a0 + i / n * PI * 2; const k = 1 + (r() - .5) * 2 * jit; pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]); }
  const c = Math.cos(rot * PI / 180), s = Math.sin(rot * PI / 180);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Pt);
}
/** A scalloped/bumpy closed outline (clouds, wool, flowers). */
export function bumpy(cx: number, cy: number, rx: number, ry: number, bumps: number, amp: number, seed = 1, per = 3): Pt[] {
  const r = rn(seed); const pts: Pt[] = []; const n = bumps * per;
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2; const k = 1 + amp * (.5 + .5 * Math.cos(a * bumps)) * (.9 + r() * .2) - amp * .5; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  return pts;
}
/** A rounded star outline. */
export function starPts(cx: number, cy: number, ro: number, ri: number, points = 5, rot = -90): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) { const a = (rot + i * 180 / points) * PI / 180; const r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
/** A rounded rectangle outline (corner arcs plus sampled straight edges, so smoothing never overshoots). */
export function roundRectPts(x: number, y: number, w: number, h: number, rad: number, seed = 0, jit = 0): Pt[] {
  const r = rn(seed + 3); const pts: Pt[] = []; const steps = 5; const j = () => (r() - .5) * jit;
  const edge = (x1: number, y1: number, x2: number, y2: number) => { const len = Math.hypot(x2 - x1, y2 - y1); const m = Math.max(1, Math.round(len / 36)); for (let i = 1; i < m; i++) pts.push([x1 + (x2 - x1) * i / m + j(), y1 + (y2 - y1) * i / m + j()]); };
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= steps; i++) { const a = (a0 + i / steps * 90) * PI / 180; pts.push([cx + Math.cos(a) * rad + j(), cy + Math.sin(a) * rad + j()]); } };
  corner(x + w - rad, y + rad, -90); edge(x + w, y + rad, x + w, y + h - rad);
  corner(x + w - rad, y + h - rad, 0); edge(x + w - rad, y + h, x + rad, y + h);
  corner(x + rad, y + h - rad, 90); edge(x, y + h - rad, x, y + rad);
  corner(x + rad, y + rad, 180); edge(x + rad, y, x + w - rad, y);
  return pts;
}
/** Bevel the corners of a polygon: every vertex becomes two points a little way along each edge (rounded when smoothed), edges stay straight. */
export function bevel(pts: Pt[], t = .14): Pt[] {
  const n = pts.length; const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    out.push([b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t], [b[0], b[1]], [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t]);
  }
  // sample long edges so the spline stays straight along them
  const res: Pt[] = [];
  for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; res.push(p); const len = Math.hypot(q[0] - p[0], q[1] - p[1]); const m = Math.floor(len / 40); for (let k = 1; k <= m; k++) res.push([p[0] + (q[0] - p[0]) * k / (m + 1), p[1] + (q[1] - p[1]) * k / (m + 1)]); }
  return res;
}
/** Outline of the union of circles [cx, cy, r] (a cloud), sorted by angle around the centroid. */
export function unionCircles(cs: Array<[number, number, number]>, flatBottom?: number): Pt[] {
  const cand: Pt[] = [];
  for (const [cx, cy, r] of cs) for (let d = 0; d < 360; d += 4) {
    const a = d * PI / 180; let x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (cs.some(([ox, oy, or]) => (ox !== cx || oy !== cy) && Math.hypot(x - ox, y - oy) < or - .5)) continue;
    if (flatBottom !== undefined && y > flatBottom) y = flatBottom;
    cand.push([x, y]);
  }
  const [mx, my] = centroid(cand);
  const sorted = cand.map(p => ({ p, a: Math.atan2(p[1] - my, p[0] - mx) })).sort((u, v) => u.a - v.a).map(o => o.p);
  return sorted.filter((p, i) => i === 0 || Math.hypot(p[0] - sorted[i - 1][0], p[1] - sorted[i - 1][1]) > 2.5);
}

/** Densely sample the closed Catmull-Rom curve through pts (same curve smoothD draws). Returns points ~step px apart. */
export function sampleClosed(pts: Pt[], step = 3): Pt[] {
  const n = pts.length; const P = (i: number): Pt => pts[(i + n) % n]; const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); const m = Math.max(2, Math.round(len / step));
    for (let k = 0; k < m; k++) { const t = k / m, u = 1 - t; out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]); }
  }
  return out;
}
/** Densely sample the open Catmull-Rom curve through pts. */
export function sampleOpen(pts: Pt[], step = 24): Pt[] {
  const n = pts.length; const P = (i: number): Pt => pts[Math.max(0, Math.min(n - 1, i))]; const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); const m = Math.max(2, Math.round(len / step));
    for (let k = 0; k < m; k++) { const t = k / m, u = 1 - t; out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]); }
  }
  out.push(pts[n - 1]); return out;
}
/** Offset a closed dense outline by d px (positive = outward). */
export function offsetDense(dense: Pt[], d: number): Pt[] {
  const n = dense.length; const sgn = area(dense) > 0 ? 1 : -1; const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = dense[(i - 1 + n) % n], b = dense[(i + 1) % n]; const tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1;
    out.push([dense[i][0] + sgn * ty / l * d, dense[i][1] - sgn * tx / l * d]);
  }
  return out;
}

/** A smooth shape through points (absolute coordinates). Safe for non-degenerate bounding boxes (filters need area). */
export function smooth(pts: Pt[], closed: boolean, fill: string, o: ShapeOpts = {}): O {
  const b = bounds(pts);
  return path(b.x, b.y, b.w, b.h, smoothD(pts, closed, b.x, b.y), closed ? fill : 'none', { ...o, origin: { x: 0, y: 0, w: b.w, h: b.h }, open: !closed });
}
/** A straight-segment polyline/polygon. */
export function polyline(pts: Pt[], closed: boolean, fill: string, o: ShapeOpts = {}): O {
  const b = bounds(pts);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0] - b.x)} ${f1(p[1] - b.y)}`).join(' ') + (closed ? ' Z' : '');
  return path(b.x, b.y, b.w, b.h, d, closed ? fill : 'none', { ...o, origin: { x: 0, y: 0, w: b.w, h: b.h }, open: !closed });
}
/** Raw path in absolute coordinates inside a known box. */
export function rawBox(x: number, y: number, w: number, h: number, d: string, fill: string, o: ShapeOpts = {}): O {
  return path(x, y, w, h, d, fill, { ...o, origin: { x: 0, y: 0, w, h }, open: fill === 'none' });
}

/** Many tiny filled dots as ONE object. dots = [x, y, r]. */
export function dotsPath(dots: Array<[number, number, number]>, color: string, o: ShapeOpts = {}): O | null {
  if (!dots.length) return null;
  const pad = 4; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, r] of dots) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const d = dots.map(([x, y, r]) => `M${f1(x - x0 - r)} ${f1(y - y0)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(r * 2)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-r * 2)} 0`).join('');
  return rawBox(x0, y0, x1 - x0, y1 - y0, d, color, { role: 'ORNAMENT', ...o });
}
/** Many short strokes as ONE stroked object. segs = [x1, y1, x2, y2]. */
export function strokesPath(segs: Array<[number, number, number, number]>, color: string, width: number, o: ShapeOpts = {}): O | null {
  if (!segs.length) return null;
  const pad = 4 + width; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [a, b, c, d] of segs) { x0 = Math.min(x0, a, c); y0 = Math.min(y0, b, d); x1 = Math.max(x1, a, c); y1 = Math.max(y1, b, d); }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const d = segs.map(([a, b, c, e]) => `M${f1(a - x0)} ${f1(b - y0)}L${f1(c - x0)} ${f1(e - y0)}`).join('');
  return rawBox(x0, y0, x1 - x0, y1 - y0, d, 'none', { stroke: color, strokeWidth: width, role: 'ORNAMENT', ...o });
}
/** Scatter n points inside a polygon (rejection sampling). */
export function scatterIn(pts: Pt[], n: number, seed: number, margin = 0): Array<[number, number]> {
  const b = bounds(pts); const r = rn(seed); const out: Array<[number, number]> = []; let tries = 0;
  while (out.length < n && tries < n * 14) { tries++; const x = b.x + r() * b.w, y = b.y + r() * b.h; if (inside(pts, x, y)) out.push([x, y]); }
  void margin; return out;
}
/** Scatter n points in a rectangle. */
export function scatterRect(x: number, y: number, w: number, h: number, n: number, seed: number): Array<[number, number]> {
  const r = rn(seed); return Array.from({ length: n }, () => [x + r() * w, y + r() * h] as [number, number]);
}
export const compact = (xs: Array<O | null | undefined | false>): O[] => xs.filter(Boolean) as O[];
