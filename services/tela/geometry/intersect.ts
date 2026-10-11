// intersect — curve/curve and curve/line intersection, overlap (coincidence) detection
// and cubic self-intersection.
//
// Strategy (robust first, fast second):
//   1. Coincident pieces are detected BEFORE any subdivision (both curves straight and
//      collinear, or one curve's sub-range has the same control points as the other's).
//      Without this, subdividing two identical curves explodes along the overlap.
//   2. line × line is exact; curve × line rotates the curve into the line's frame and
//      solves the cubic y(t) = 0 (Cardano + Newton polish).
//   3. curve × curve recursively subdivides both curves while their hulls overlap; once
//      both are flat the chords are intersected, mapped back, and polished with 2D
//      Newton on A(s) − B(t) = 0. Near-parallel flat pieces fall back to alternating
//      projection so tangencies (grazes) are found too. A work budget bounds the worst case.
//   4. Endpoints lying on the other curve (T-junctions, shared vertices) are always added.
// Results are clustered so a crossing found from several sub-pieces appears once.
import type { Vec } from './vec';
import type { Curve } from './model';
import { point, deriv, split, hullBounds, flatness, coeffs, solveCubic, nearest, isStraight, subCurve } from './bezier';

export interface Hit { ta: number; tb: number; p: Vec; overlap?: boolean }

const ovl = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, e: number) =>
  a.x <= b.x + b.w + e && b.x <= a.x + a.w + e && a.y <= b.y + b.h + e && b.y <= a.y + a.h + e;

/** Segment × segment: params (t on a0→a1, u on b0→b1) within [0,1] ± tolerance, or null. Parallel → null. */
export function lineLine(a0: Vec, a1: Vec, b0: Vec, b1: Vec, tol = 1e-9): { t: number; u: number } | null {
  const rx = a1.x - a0.x, ry = a1.y - a0.y, sx = b1.x - b0.x, sy = b1.y - b0.y;
  const den = rx * sy - ry * sx; const la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy);
  if (Math.abs(den) <= 1e-14 * la * lb || la === 0 || lb === 0) return null;
  const qx = b0.x - a0.x, qy = b0.y - a0.y;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  const ta = tol / Math.max(la, 1e-300), tb = tol / Math.max(lb, 1e-300);
  if (t < -ta || t > 1 + ta || u < -tb || u > 1 + tb) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
}

/** Curve × straight segment (b given as line endpoints). */
export function curveLine(c: Curve, l0: Vec, l1: Vec, eps: number): Array<{ t: number; u: number }> {
  const dx = l1.x - l0.x, dy = l1.y - l0.y; const L = Math.hypot(dx, dy); if (L < 1e-300) return [];
  const Y = (p: Vec) => (dx * (p.y - l0.y) - dy * (p.x - l0.x)) / L;
  const X = (p: Vec) => (dx * (p.x - l0.x) + dy * (p.y - l0.y)) / L;
  const [a, b, cc, d] = coeffs(Y(c.p0), Y(c.p1), Y(c.p2), Y(c.p3));
  const out: Array<{ t: number; u: number }> = [];
  for (let t of solveCubic(a, b, cc, d)) {
    if (t < -1e-7 || t > 1 + 1e-7) continue; t = Math.max(0, Math.min(1, t));
    const p = point(c, t); if (Math.abs(Y(p)) > eps * 4) continue;
    const u = X(p) / L; if (u < -eps / L || u > 1 + eps / L) continue;
    out.push({ t, u: Math.max(0, Math.min(1, u)) });
  }
  return out;
}

/**
 * Coincident overlap between two curves: returns the 2 end pairs of the shared range
 * (marked overlap) or null. Straight curves compare as segments; curved ones compare the
 * control points of the matching sub-ranges.
 */
export function overlaps(a: Curve, b: Curve, eps: number): Hit[] | null {
  const sa = isStraight(a, eps), sb = isStraight(b, eps);
  if (sa !== sb) return null;
  if (sa && sb) {
    const dx = a.p3.x - a.p0.x, dy = a.p3.y - a.p0.y; const L = Math.hypot(dx, dy); if (L < eps) return null;
    const off = (p: Vec) => Math.abs(dx * (p.y - a.p0.y) - dy * (p.x - a.p0.x)) / L;
    if (off(b.p0) > eps || off(b.p3) > eps) return null;
    const lb = Math.hypot(b.p3.x - b.p0.x, b.p3.y - b.p0.y); if (lb < eps) return null;
    const proj = (p: Vec) => (dx * (p.x - a.p0.x) + dy * (p.y - a.p0.y)) / (L * L);
    const projB = (p: Vec) => ((b.p3.x - b.p0.x) * (p.x - b.p0.x) + (b.p3.y - b.p0.y) * (p.y - b.p0.y)) / (lb * lb);
    const pairs: Hit[] = []; const e1 = eps / L, e2 = eps / lb;
    const add = (ta: number, tb: number) => { if (ta >= -e1 && ta <= 1 + e1 && tb >= -e2 && tb <= 1 + e2) { ta = Math.max(0, Math.min(1, ta)); tb = Math.max(0, Math.min(1, tb)); if (!pairs.some(q => Math.abs(q.ta - ta) < e1 && Math.abs(q.tb - tb) < e2)) pairs.push({ ta, tb, p: point(a, ta), overlap: true }); } };
    add(0, projB(a.p0)); add(1, projB(a.p3)); add(proj(b.p0), 0); add(proj(b.p3), 1);
    if (pairs.length < 2) return null;
    pairs.sort((p, q) => p.ta - q.ta);
    const first = pairs[0], last = pairs[pairs.length - 1];
    if (Math.abs(last.ta - first.ta) * L < eps) return null;
    // map line params: lines are parametrised linearly, so straight cubics with uneven handles need re-projection
    return [first, last].map(h => ({ ...h, ta: a.line ? h.ta : nearest(a, h.p).t, tb: b.line ? h.tb : nearest(b, h.p).t, overlap: true }));
  }
  // curved: endpoints of each on the other
  const cand: Hit[] = [];
  const tryAdd = (ta: number, tb: number, p: Vec) => { if (!cand.some(q => Math.abs(q.ta - ta) < 1e-7 && Math.abs(q.tb - tb) < 1e-7)) cand.push({ ta, tb, p, overlap: true }); };
  for (const [tA, P] of [[0, a.p0], [1, a.p3]] as Array<[number, Vec]>) { const n = nearest(b, P); if (n.dist < eps) tryAdd(tA, n.t, P); }
  for (const [tB, P] of [[0, b.p0], [1, b.p3]] as Array<[number, Vec]>) { const n = nearest(a, P); if (n.dist < eps) tryAdd(n.t, tB, P); }
  if (cand.length < 2) return null;
  cand.sort((p, q) => p.ta - q.ta);
  const h0 = cand[0], h1 = cand[cand.length - 1];
  if (Math.abs(h1.ta - h0.ta) < 1e-7 || Math.abs(h1.tb - h0.tb) < 1e-7) return null;
  const ca = subCurve(a, h0.ta, h1.ta), cb = subCurve(b, h0.tb, h1.tb);
  const close = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y) < eps * 4;
  if (close(ca.p1, cb.p1) && close(ca.p2, cb.p2)) return [h0, h1];
  // as a last check sample a few points (handles may be distributed differently but curve identical)
  for (const s of [.25, .5, .75]) { if (nearest(b, point(ca, s)).dist > eps) return null; }
  return [h0, h1];
}

/** Polish a crossing with 2D Newton on A(s) − B(t) = 0; returns null if it diverges. */
function polish(a: Curve, b: Curve, s: number, t: number): { s: number; t: number } | null {
  for (let k = 0; k < 12; k++) {
    const pa = point(a, s), pb = point(b, t); const fx = pa.x - pb.x, fy = pa.y - pb.y;
    if (Math.abs(fx) + Math.abs(fy) < 1e-13) break;
    const da = deriv(a, s), db = deriv(b, t);
    const det = da.x * -db.y - da.y * -db.x; if (Math.abs(det) < 1e-18) return { s, t };
    const ds = (fx * -db.y - fy * -db.x) / det, dt = (da.x * fy - da.y * fx) / det;
    s = Math.max(0, Math.min(1, s - ds)); t = Math.max(0, Math.min(1, t - dt));
  }
  return { s, t };
}
/** Alternating projection for tangential contact. */
function graze(a: Curve, b: Curve, s: number, t: number): { s: number; t: number; d: number } {
  let d = Infinity;
  for (let k = 0; k < 24; k++) {
    const nb = nearest(b, point(a, s)); t = nb.t; const na = nearest(a, point(b, t)); s = na.t;
    if (Math.abs(na.dist - d) < 1e-12) { d = na.dist; break; } d = na.dist;
  }
  return { s, t, d };
}

/** All intersections of two curves (parameters on each), clustered. */
export function curveCurve(a: Curve, b: Curve, eps = 1e-7): Hit[] {
  const ov = overlaps(a, b, eps);
  if (ov) return ov;
  const raw: Hit[] = [];
  const sa = a.line || isStraight(a, 0), sb = b.line || isStraight(b, 0);
  if (sa && sb) {
    const r = lineLine(a.p0, a.p3, b.p0, b.p3, eps);
    if (r) raw.push({ ta: a.line ? r.t : nearest(a, point(lineAt(a.p0, a.p3), r.t)).t, tb: b.line ? r.u : nearest(b, point(lineAt(b.p0, b.p3), r.u)).t, p: lerpV(a.p0, a.p3, r.t) });
  } else if (sa) {
    for (const r of curveLine(b, a.p0, a.p3, eps)) { const p = point(b, r.t); raw.push({ ta: a.line ? r.u : nearest(a, p).t, tb: r.t, p }); }
  } else if (sb) {
    for (const r of curveLine(a, b.p0, b.p3, eps)) { const p = point(a, r.t); raw.push({ ta: r.t, tb: b.line ? r.u : nearest(b, p).t, p }); }
  } else {
    const budget = { n: 0 };
    rec(a, 0, 1, b, 0, 1, 0, raw, a, b, eps, budget);
  }
  // endpoints touching the other curve (T-junctions, shared vertices, tangent touches at ends)
  for (const [tA, P] of [[0, a.p0], [1, a.p3]] as Array<[number, Vec]>) { const n = nearest(b, P); if (n.dist < eps) raw.push({ ta: tA, tb: n.t, p: P }); }
  for (const [tB, P] of [[0, b.p0], [1, b.p3]] as Array<[number, Vec]>) { const n = nearest(a, P); if (n.dist < eps) raw.push({ ta: n.t, tb: tB, p: P }); }
  return cluster(raw, a, b, eps);
}
function ptSeg(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy; const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}
const segDist = (a0: Vec, a1: Vec, b0: Vec, b1: Vec) => lineLine(a0, a1, b0, b1, 0) ? 0 : Math.min(ptSeg(a0, b0, b1), ptSeg(a1, b0, b1), ptSeg(b0, a0, a1), ptSeg(b1, a0, a1));
const lerpV = (p: Vec, q: Vec, t: number): Vec => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const lineAt = (p: Vec, q: Vec): Curve => ({ p0: p, p1: lerpV(p, q, 1 / 3), p2: lerpV(p, q, 2 / 3), p3: q, line: true });

function rec(a: Curve, a0: number, a1: number, b: Curve, b0: number, b1: number, depth: number, out: Hit[], A: Curve, B: Curve, eps: number, budget: { n: number }) {
  if (++budget.n > 20000) return;
  if (!ovl(hullBounds(a), hullBounds(b), eps)) return;
  const fa = flatness(a), fb = flatness(b);
  const tolFlat = Math.max(eps, 1e-4);
  if (depth >= 48 || (fa <= tolFlat && fb <= tolFlat)) {
    const r = lineLine(a.p0, a.p3, b.p0, b.p3, tolFlat * 2);
    if (r) {
      const s0 = a0 + (a1 - a0) * r.t, t0 = b0 + (b1 - b0) * r.u;
      const pol = polish(A, B, s0, t0);
      if (pol) { const pa = point(A, pol.s), pb = point(B, pol.t); if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < eps * 10) { out.push({ ta: pol.s, tb: pol.t, p: pa }); return; } }
    }
    // near-parallel contact: try a graze (only when the chords nearly touch)
    if (segDist(a.p0, a.p3, b.p0, b.p3) > tolFlat * 2 + eps) return;
    const g = graze(A, B, (a0 + a1) / 2, (b0 + b1) / 2);
    if (g.d < eps) out.push({ ta: g.s, tb: g.t, p: point(A, g.s) });
    return;
  }
  if (fa > tolFlat && fb > tolFlat) {
    const [a1c, a2c] = split(a, .5), [b1c, b2c] = split(b, .5); const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    rec(a1c, a0, am, b1c, b0, bm, depth + 1, out, A, B, eps, budget); rec(a1c, a0, am, b2c, bm, b1, depth + 1, out, A, B, eps, budget);
    rec(a2c, am, a1, b1c, b0, bm, depth + 1, out, A, B, eps, budget); rec(a2c, am, a1, b2c, bm, b1, depth + 1, out, A, B, eps, budget);
  } else if (fa > tolFlat) {
    const [a1c, a2c] = split(a, .5); const am = (a0 + a1) / 2;
    rec(a1c, a0, am, b, b0, b1, depth + 1, out, A, B, eps, budget); rec(a2c, am, a1, b, b0, b1, depth + 1, out, A, B, eps, budget);
  } else {
    const [b1c, b2c] = split(b, .5); const bm = (b0 + b1) / 2;
    rec(a, a0, a1, b1c, b0, bm, depth + 1, out, A, B, eps, budget); rec(a, a0, a1, b2c, bm, b1, depth + 1, out, A, B, eps, budget);
  }
}

function cluster(raw: Hit[], a: Curve, b: Curve, eps: number): Hit[] {
  const out: Hit[] = [];
  for (const h of raw) {
    const dup = out.find(q => Math.hypot(q.p.x - h.p.x, q.p.y - h.p.y) < eps * 2 || (Math.abs(q.ta - h.ta) < 1e-9 && Math.abs(q.tb - h.tb) < 1e-9));
    if (dup) { // prefer exact endpoints
      if ((h.ta === 0 || h.ta === 1) && dup.ta !== 0 && dup.ta !== 1) dup.ta = h.ta;
      if ((h.tb === 0 || h.tb === 1) && dup.tb !== 0 && dup.tb !== 1) dup.tb = h.tb;
      continue;
    }
    out.push({ ...h });
  }
  void a; void b;
  return out.sort((p, q) => p.ta - q.ta);
}

/** Self-intersection of a single cubic (a loop): [t1, t2] or null. */
export function selfIntersection(c: Curve): [number, number] | null {
  if (c.line) return null;
  // Split at the parameter of max |cross| hull test: a cubic self-intersects iff its two
  // halves split at the right place intersect away from the shared point. Use x/y-monotone
  // pieces: monotone pieces cannot self-intersect, so test piece pairs.
  const ts = [0];
  for (const k of ['x', 'y'] as const) {
    const a = 3 * (-c.p0[k] + 3 * c.p1[k] - 3 * c.p2[k] + c.p3[k]), b = 6 * (c.p0[k] - 2 * c.p1[k] + c.p2[k]), cc = 3 * (c.p1[k] - c.p0[k]);
    const disc = b * b - 4 * a * cc;
    if (Math.abs(a) > 1e-14 && disc > 0) { const s = Math.sqrt(disc); for (const t of [(-b + s) / (2 * a), (-b - s) / (2 * a)]) if (t > 1e-6 && t < 1 - 1e-6) ts.push(t); }
    else if (Math.abs(a) <= 1e-14 && Math.abs(b) > 1e-14) { const t = -cc / b; if (t > 1e-6 && t < 1 - 1e-6) ts.push(t); }
  }
  ts.push(1); ts.sort((p, q) => p - q);
  if (ts.length < 4) return null; // need ≥3 monotone pieces for a loop
  for (let i = 0; i + 1 < ts.length; i++) for (let j = i + 2; j + 1 < ts.length; j++) {
    const pa = subCurve(c, ts[i], ts[i + 1]), pb = subCurve(c, ts[j], ts[j + 1]);
    const hs = curveCurve(pa, pb, 1e-7);
    for (const h of hs) {
      const t1 = ts[i] + (ts[i + 1] - ts[i]) * h.ta, t2 = ts[j] + (ts[j + 1] - ts[j]) * h.tb;
      if (Math.abs(t2 - t1) > 1e-6) return [t1, t2];
    }
  }
  return null;
}
