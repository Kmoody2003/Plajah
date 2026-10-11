// bezier — cubic bezier maths: evaluation, splitting, tight bounds, arc length,
// projection, curvature and flattening. Every higher module (booleans, strokes,
// brushes, hit testing) is built on these, so they favour robustness over brevity:
// polynomial roots are polished with Newton, arc length is adaptive Gauss-Legendre,
// and projection seeds Newton from a dense sample so it never locks onto the wrong lobe.
import type { Vec, Rect } from './vec';
import type { Curve, CompoundPath, SubPath } from './model';
import { subpathCurves, lineCurve } from './model';

// ── Evaluation ──────────────────────────────────────────────────────────────────────

export function point(c: Curve, t: number): Vec {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x, y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y };
}
/** First derivative B'(t). */
export function deriv(c: Curve, t: number): Vec {
  const u = 1 - t;
  return {
    x: 3 * (u * u * (c.p1.x - c.p0.x) + 2 * u * t * (c.p2.x - c.p1.x) + t * t * (c.p3.x - c.p2.x)),
    y: 3 * (u * u * (c.p1.y - c.p0.y) + 2 * u * t * (c.p2.y - c.p1.y) + t * t * (c.p3.y - c.p2.y)),
  };
}
/** Second derivative B''(t). */
export function deriv2(c: Curve, t: number): Vec {
  const u = 1 - t;
  return {
    x: 6 * (u * (c.p2.x - 2 * c.p1.x + c.p0.x) + t * (c.p3.x - 2 * c.p2.x + c.p1.x)),
    y: 6 * (u * (c.p2.y - 2 * c.p1.y + c.p0.y) + t * (c.p3.y - 2 * c.p2.y + c.p1.y)),
  };
}
/**
 * Unit tangent at t, robust at degenerate ends (a handle sitting on its anchor makes
 * B'(0) = 0; fall back to the next control point, then the chord).
 */
export function tangent(c: Curve, t: number): Vec {
  let d = deriv(c, t);
  if (Math.hypot(d.x, d.y) < 1e-12) {
    if (t < .5) { d = { x: c.p2.x - c.p0.x, y: c.p2.y - c.p0.y }; if (Math.hypot(d.x, d.y) < 1e-12) d = { x: c.p3.x - c.p0.x, y: c.p3.y - c.p0.y }; }
    else { d = { x: c.p3.x - c.p1.x, y: c.p3.y - c.p1.y }; if (Math.hypot(d.x, d.y) < 1e-12) d = { x: c.p3.x - c.p0.x, y: c.p3.y - c.p0.y }; }
  }
  const l = Math.hypot(d.x, d.y); return l > 0 ? { x: d.x / l, y: d.y / l } : { x: 1, y: 0 };
}
/** Left unit normal at t. */
export function normal(c: Curve, t: number): Vec { const d = tangent(c, t); return { x: -d.y, y: d.x }; }
/** Signed curvature κ(t) (> 0 turning left). */
export function curvature(c: Curve, t: number): number {
  const d = deriv(c, t), dd = deriv2(c, t); const s = Math.hypot(d.x, d.y);
  return s < 1e-12 ? 0 : (d.x * dd.y - d.y * dd.x) / (s * s * s);
}

// ── Splitting ───────────────────────────────────────────────────────────────────────

export function split(c: Curve, t: number): [Curve, Curve] {
  if (c.line) { const m = point(c, t); return [lineCurve(c.p0, m), lineCurve(m, c.p3)]; }
  const l = (a: Vec, b: Vec): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = l(c.p0, c.p1), b = l(c.p1, c.p2), d = l(c.p2, c.p3), e = l(a, b), f = l(b, d), g = l(e, f);
  return [{ p0: { ...c.p0 }, p1: a, p2: e, p3: g }, { p0: { ...g }, p1: f, p2: d, p3: { ...c.p3 } }];
}
/** The piece of c between t0 and t1 (t0 > t1 returns the reversed piece). */
export function subCurve(c: Curve, t0: number, t1: number): Curve {
  if (t0 > t1) return reverseCurve(subCurve(c, t1, t0));
  if (c.line) return lineCurve(point(c, t0), point(c, t1));
  let r = c;
  if (t1 < 1) r = split(r, t1)[0];
  if (t0 > 0) r = split(r, t0 / t1)[1];
  return r;
}
/** Split at many sorted parameters. */
export function splitMany(c: Curve, ts: number[]): Curve[] {
  const out: Curve[] = []; let rest = c, prev = 0;
  for (const t of ts) {
    if (t <= prev + 1e-12 || t >= 1 - 1e-12) continue;
    const [a, b] = split(rest, (t - prev) / (1 - prev)); out.push(a); rest = b; prev = t;
  }
  out.push(rest); return out;
}
export const reverseCurve = (c: Curve): Curve => ({ p0: { ...c.p3 }, p1: { ...c.p2 }, p2: { ...c.p1 }, p3: { ...c.p0 }, line: c.line });

// ── Polynomial roots ────────────────────────────────────────────────────────────────

/** Real roots of a x² + b x + c. */
export function solveQuadratic(a: number, b: number, c: number): number[] {
  const eps = 1e-14;
  if (Math.abs(a) < eps * (Math.abs(b) + Math.abs(c) + 1e-300) || Math.abs(a) < 1e-300) {
    return Math.abs(b) < 1e-300 ? [] : [-c / b];
  }
  const D = b * b - 4 * a * c;
  if (D < -eps * b * b) return [];
  if (D <= 0) return [-b / (2 * a)];
  const s = Math.sqrt(D); const q = -.5 * (b + (b >= 0 ? s : -s));
  const r = [q / a]; if (Math.abs(q) > 1e-300) r.push(c / q); else r.push(-b / a - q / a);
  return r;
}
/** Real roots of a x³ + b x² + c x + d (Cardano/trigonometric, Newton-polished). */
export function solveCubic(a: number, b: number, c: number, d: number): number[] {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (scale === 0) return [];
  if (Math.abs(a) < 1e-12 * scale) return solveQuadratic(b, c, d);
  const A = b / a, B = c / a, C = d / a;
  const Q = (A * A - 3 * B) / 9, R = (2 * A * A * A - 9 * A * B + 27 * C) / 54;
  const Q3 = Q * Q * Q; let roots: number[];
  if (R * R < Q3) {
    const th = Math.acos(Math.max(-1, Math.min(1, R / Math.sqrt(Q3)))); const m = -2 * Math.sqrt(Q);
    roots = [m * Math.cos(th / 3) - A / 3, m * Math.cos((th + 2 * Math.PI) / 3) - A / 3, m * Math.cos((th - 2 * Math.PI) / 3) - A / 3];
  } else {
    const Aa = -Math.sign(R) * Math.cbrt(Math.abs(R) + Math.sqrt(R * R - Q3)); const Bb = Aa === 0 ? 0 : Q / Aa;
    roots = [Aa + Bb - A / 3];
    if (Math.abs(Aa - Bb) < 1e-9 * Math.max(1, Math.abs(Aa))) roots.push(-(Aa + Bb) / 2 - A / 3);
  }
  return roots.map(x => { for (let i = 0; i < 4; i++) { const f = ((a * x + b) * x + c) * x + d, df = (3 * a * x + 2 * b) * x + c; if (Math.abs(df) < 1e-300) break; const nx = x - f / df; if (!isFinite(nx)) break; x = nx; } return x; });
}
/** Polynomial coefficients of one coordinate of a cubic: a t³ + b t² + c t + d. */
export function coeffs(p0: number, p1: number, p2: number, p3: number): [number, number, number, number] {
  return [-p0 + 3 * p1 - 3 * p2 + p3, 3 * p0 - 6 * p1 + 3 * p2, -3 * p0 + 3 * p1, p0];
}
const in01 = (ts: number[], eps = 1e-9) => ts.filter(t => t >= -eps && t <= 1 + eps).map(t => Math.max(0, Math.min(1, t)));

/** Parameters in (0,1) where dx/dt or dy/dt vanish. */
export function extremaParams(c: Curve): number[] {
  if (c.line) return [];
  const out: number[] = [];
  for (const k of ['x', 'y'] as const) {
    const a = 3 * (-c.p0[k] + 3 * c.p1[k] - 3 * c.p2[k] + c.p3[k]), b = 6 * (c.p0[k] - 2 * c.p1[k] + c.p2[k]), cc = 3 * (c.p1[k] - c.p0[k]);
    for (const t of solveQuadratic(a, b, cc)) if (t > 1e-9 && t < 1 - 1e-9) out.push(t);
  }
  return out.sort((a, b) => a - b);
}
/** Inflection parameters in (0,1). */
export function inflections(c: Curve): number[] {
  if (c.line) return [];
  const ax = c.p1.x - c.p0.x, ay = c.p1.y - c.p0.y, bx = c.p2.x - 2 * c.p1.x + c.p0.x, by = c.p2.y - 2 * c.p1.y + c.p0.y, cx = c.p3.x + 3 * (c.p1.x - c.p2.x) - c.p0.x, cy = c.p3.y + 3 * (c.p1.y - c.p2.y) - c.p0.y;
  // cross(B', B'') ∝ (bx cy - by cx) t² + (ax cy - ay cx) t + (ax by - ay bx)
  return solveQuadratic(bx * cy - by * cx, ax * cy - ay * cx, ax * by - ay * bx).filter(t => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b);
}

// ── Bounds ──────────────────────────────────────────────────────────────────────────

/** Tight axis-aligned bounds. */
export function bounds(c: Curve): Rect {
  let x0 = Math.min(c.p0.x, c.p3.x), x1 = Math.max(c.p0.x, c.p3.x), y0 = Math.min(c.p0.y, c.p3.y), y1 = Math.max(c.p0.y, c.p3.y);
  if (!c.line) for (const t of extremaParams(c)) { const p = point(c, t); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Control-hull bounds (cheap, conservative). */
export function hullBounds(c: Curve): Rect {
  const x0 = Math.min(c.p0.x, c.p1.x, c.p2.x, c.p3.x), y0 = Math.min(c.p0.y, c.p1.y, c.p2.y, c.p3.y);
  return { x: x0, y: y0, w: Math.max(c.p0.x, c.p1.x, c.p2.x, c.p3.x) - x0, h: Math.max(c.p0.y, c.p1.y, c.p2.y, c.p3.y) - y0 };
}
export function pathBounds(p: CompoundPath): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of p.subpaths) {
    if (s.anchors.length === 1) { const a = s.anchors[0]; x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x); y1 = Math.max(y1, a.y); }
    for (const c of subpathCurves(s)) { const b = bounds(c); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ── Arc length ──────────────────────────────────────────────────────────────────────

// 16-point Gauss-Legendre on [-1, 1].
const GX = [-0.0950125098376374, 0.0950125098376374, -0.2816035507792589, 0.2816035507792589, -0.4580167776572274, 0.4580167776572274, -0.6178762444026438, 0.6178762444026438, -0.7554044083550030, 0.7554044083550030, -0.8656312023878318, 0.8656312023878318, -0.9445750230732326, 0.9445750230732326, -0.9894009349916499, 0.9894009349916499];
const GW = [0.1894506104550685, 0.1894506104550685, 0.1826034150449236, 0.1826034150449236, 0.1691565193950025, 0.1691565193950025, 0.1495959888165767, 0.1495959888165767, 0.1246289712555339, 0.1246289712555339, 0.0951585116824928, 0.0951585116824928, 0.0622535239386479, 0.0622535239386479, 0.0271524594117541, 0.0271524594117541];
function gauss(c: Curve, a: number, b: number): number {
  const h = (b - a) / 2, m = (a + b) / 2; let s = 0;
  for (let i = 0; i < 16; i++) { const d = deriv(c, m + h * GX[i]); s += GW[i] * Math.hypot(d.x, d.y); }
  return s * h;
}
function adaptiveLen(c: Curve, a: number, b: number, whole: number, depth: number): number {
  const m = (a + b) / 2, l = gauss(c, a, m), r = gauss(c, m, b);
  if (depth > 12 || Math.abs(l + r - whole) < 1e-9 * Math.max(1, whole)) return l + r;
  return adaptiveLen(c, a, m, l, depth + 1) + adaptiveLen(c, m, b, r, depth + 1);
}
/** Arc length between t0 and t1 (adaptive Gauss-Legendre, ~1e-9 relative). */
export function length(c: Curve, t0 = 0, t1 = 1): number {
  if (c.line) return Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) * Math.abs(t1 - t0);
  if (t1 < t0) return length(c, t1, t0);
  return adaptiveLen(c, t0, t1, gauss(c, t0, t1), 0);
}
/** Parameter t whose arc length from 0 equals s (clamped). */
export function tAtLength(c: Curve, s: number, total = length(c)): number {
  if (s <= 0) return 0; if (s >= total) return 1;
  if (c.line) return s / total;
  let lo = 0, hi = 1, t = s / total;
  for (let i = 0; i < 40; i++) {
    const f = length(c, 0, t) - s;
    if (Math.abs(f) < 1e-9 * Math.max(1, total)) return t;
    if (f > 0) hi = t; else lo = t;
    const d = deriv(c, t); const sp = Math.hypot(d.x, d.y);
    let nt = sp > 1e-12 ? t - f / sp : (lo + hi) / 2;
    if (!(nt > lo && nt < hi)) nt = (lo + hi) / 2;
    t = nt;
  }
  return t;
}

/**
 * Arc-length table for a whole chain of curves: cumulative lengths, plus lookup of
 * (curve index, t) at a distance. Used by dashes, brushes and text-on-path.
 */
export interface ArcTable { curves: Curve[]; lengths: number[]; cum: number[]; total: number }
export function arcTable(curves: Curve[]): ArcTable {
  const lengths = curves.map(c => length(c)); const cum: number[] = [0];
  for (const l of lengths) cum.push(cum[cum.length - 1] + l);
  return { curves, lengths, cum, total: cum[cum.length - 1] };
}
export function locate(tab: ArcTable, s: number): { i: number; t: number } {
  const n = tab.curves.length; if (!n) return { i: 0, t: 0 };
  if (s <= 0) return { i: 0, t: 0 }; if (s >= tab.total) return { i: n - 1, t: 1 };
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tab.cum[m] <= s) lo = m; else hi = m - 1; }
  return { i: lo, t: tAtLength(tab.curves[lo], s - tab.cum[lo], tab.lengths[lo]) };
}
export function pointAtLength(tab: ArcTable, s: number): { p: Vec; tan: Vec; i: number; t: number } {
  const { i, t } = locate(tab, s); const c = tab.curves[i];
  return { p: point(c, t), tan: tangent(c, t), i, t };
}

// ── Projection ──────────────────────────────────────────────────────────────────────

/** Nearest point on c to p: { t, point, dist }. */
export function nearest(c: Curve, p: Vec): { t: number; point: Vec; dist: number } {
  if (c.line) {
    const dx = c.p3.x - c.p0.x, dy = c.p3.y - c.p0.y; const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - c.p0.x) * dx + (p.y - c.p0.y) * dy) / L)) : 0;
    const q = point(c, t); return { t, point: q, dist: Math.hypot(q.x - p.x, q.y - p.y) };
  }
  const N = 24; let bt = 0, bd = Infinity;
  for (let i = 0; i <= N; i++) { const t = i / N; const q = point(c, t); const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; bt = t; } }
  // Newton on f(t) = (B(t) - p)·B'(t)
  let t = bt;
  for (let k = 0; k < 16; k++) {
    const q = point(c, t), d1 = deriv(c, t), d2 = deriv2(c, t);
    const dx = q.x - p.x, dy = q.y - p.y; const f = dx * d1.x + dy * d1.y; const df = d1.x * d1.x + d1.y * d1.y + dx * d2.x + dy * d2.y;
    if (Math.abs(df) < 1e-14) break;
    const nt = Math.max(0, Math.min(1, t - f / df)); if (Math.abs(nt - t) < 1e-13) { t = nt; break; } t = nt;
  }
  const q = point(c, t); const d = Math.hypot(q.x - p.x, q.y - p.y);
  if (d * d > bd + 1e-12) { const qb = point(c, bt); return { t: bt, point: qb, dist: Math.sqrt(bd) }; }
  return { t, point: q, dist: d };
}

// ── Flattening ──────────────────────────────────────────────────────────────────────

/** Max distance of the control points from the chord (cheap flatness bound). */
export function flatness(c: Curve): number {
  if (c.line) return 0;
  const ux = 3 * c.p1.x - 2 * c.p0.x - c.p3.x, uy = 3 * c.p1.y - 2 * c.p0.y - c.p3.y, vx = 3 * c.p2.x - 2 * c.p3.x - c.p0.x, vy = 3 * c.p2.y - 2 * c.p3.y - c.p0.y;
  return Math.sqrt(Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy)) / 4;
}
/** Points along c (excluding p0) so the polyline is within tol of the curve. */
export function flatten(c: Curve, tol = .25, out: Vec[] = [], depth = 0): Vec[] {
  if (c.line || depth > 16 || flatness(c) <= tol) { out.push({ ...c.p3 }); return out; }
  const [a, b] = split(c, .5); flatten(a, tol, out, depth + 1); flatten(b, tol, out, depth + 1); return out;
}
/** Flatten a subpath to a polyline (closed subpaths do NOT repeat the first point). */
export function flattenSubpath(s: SubPath, tol = .25): Vec[] {
  const cs = subpathCurves(s); if (!s.anchors.length) return [];
  const out: Vec[] = [{ x: s.anchors[0].x, y: s.anchors[0].y }];
  for (const c of cs) flatten(c, tol, out);
  if (s.closed && out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) out.pop(); }
  return out;
}
export const flattenPath = (p: CompoundPath, tol = .25) => p.subpaths.map(s => ({ points: flattenSubpath(s, tol), closed: s.closed }));

/** Total length of a compound path. */
export function pathLength(p: CompoundPath): number { let L = 0; for (const s of p.subpaths) for (const c of subpathCurves(s)) L += length(c); return L; }

/** Is the curve (numerically) a straight line? */
export function isStraight(c: Curve, tol = 1e-9): boolean {
  if (c.line) return true;
  const dx = c.p3.x - c.p0.x, dy = c.p3.y - c.p0.y; const L = Math.hypot(dx, dy);
  if (L < tol) return Math.hypot(c.p1.x - c.p0.x, c.p1.y - c.p0.y) < tol && Math.hypot(c.p2.x - c.p0.x, c.p2.y - c.p0.y) < tol;
  const d1 = Math.abs((c.p1.x - c.p0.x) * dy - (c.p1.y - c.p0.y) * dx) / L, d2 = Math.abs((c.p2.x - c.p0.x) * dy - (c.p2.y - c.p0.y) * dx) / L;
  if (d1 > tol || d2 > tol) return false;
  // handles must lie within the chord (else the "line" doubles back)
  const t1 = ((c.p1.x - c.p0.x) * dx + (c.p1.y - c.p0.y) * dy) / (L * L), t2 = ((c.p2.x - c.p0.x) * dx + (c.p2.y - c.p0.y) * dy) / (L * L);
  return t1 >= -tol && t1 <= 1 + tol && t2 >= -tol && t2 <= 1 + tol;
}
/** Elevate a quadratic (p0, q, p2) to a cubic. */
export const quadToCubic = (p0: Vec, q: Vec, p2: Vec): Curve => ({ p0: { ...p0 }, p1: { x: p0.x + 2 / 3 * (q.x - p0.x), y: p0.y + 2 / 3 * (q.y - p0.y) }, p2: { x: p2.x + 2 / 3 * (q.x - p2.x), y: p2.y + 2 / 3 * (q.y - p2.y) }, p3: { ...p2 } });
export { in01 };
