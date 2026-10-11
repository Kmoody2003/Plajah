// fit — polyline simplification (Ramer–Douglas–Peucker) and least-squares cubic fitting
// (Schneider, "An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems 1990).
//
// Used by the pencil / blob brush (raw pointer samples → a few smooth anchors), by
// variable-width strokes (offset samples → cubics), by envelope / art-brush mapping, and by
// Simplify (reduce a path's anchors within a tolerance while keeping corners).
import type { Vec } from './vec';
import type { CompoundPath, Curve, SubPath } from './model';
import { curvesToSubpath, subpathCurves, lineCurve } from './model';
import { point, flatten } from './bezier';

/** Ramer–Douglas–Peucker on a polyline (keeps endpoints). */
export function rdp(pts: Vec[], tol: number): Vec[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; const A = pts[a], B = pts[b]; const dx = B.x - A.x, dy = B.y - A.y; const L = Math.hypot(dx, dy);
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i]; const d = L < 1e-12 ? Math.hypot(P.x - A.x, P.y - A.y) : Math.abs(dx * (P.y - A.y) - dy * (P.x - A.x)) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Chaikin corner cutting (n rounds) — softens a jittery polyline before fitting. */
export function chaikin(pts: Vec[], rounds = 1, closed = false): Vec[] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const q: Vec[] = []; const n = p.length; if (n < 3) return p;
    if (!closed) q.push(p[0]);
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = p[i], b = p[(i + 1) % n]; q.push({ x: a.x * .75 + b.x * .25, y: a.y * .75 + b.y * .25 }, { x: a.x * .25 + b.x * .75, y: a.y * .25 + b.y * .75 }); }
    if (!closed) q.push(p[n - 1]);
    p = q;
  }
  return p;
}

// ── Schneider ───────────────────────────────────────────────────────────────────────

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const nrm = (a: Vec): Vec => { const l = Math.hypot(a.x, a.y); return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };

/**
 * Fit cubic beziers to points within `tol` px (max error). Tangents at the ends default to
 * the local chord directions; pass them to keep G1 with neighbours.
 */
export function fitCurve(pts: Vec[], tol: number, tan0?: Vec, tan1?: Vec): Curve[] {
  const P = dedupe(pts); if (P.length < 2) return [];
  if (P.length === 2) return [lineCurve(P[0], P[1])];
  const t0 = tan0 ? nrm(tan0) : leftTangent(P, 0), t1 = tan1 ? nrm(tan1) : rightTangent(P, P.length - 1);
  const out: Curve[] = []; fitCubic(P, 0, P.length - 1, t0, t1, tol, out, 0); return out;
}
function dedupe(pts: Vec[]): Vec[] { const o: Vec[] = []; for (const p of pts) { const q = o[o.length - 1]; if (!q || Math.hypot(q.x - p.x, q.y - p.y) > 1e-9) o.push(p); } return o; }
function leftTangent(P: Vec[], i: number): Vec { const j = Math.min(P.length - 1, i + 2); return nrm(sub(P[j === i ? i + 1 : j], P[i])); }
function rightTangent(P: Vec[], i: number): Vec { const j = Math.max(0, i - 2); return nrm(sub(P[j === i ? i - 1 : j], P[i])); }
function centerTangent(P: Vec[], i: number): Vec { const v = nrm(sub(P[i - 1], P[i + 1])); return Math.hypot(v.x, v.y) > 0 ? v : nrm(sub(P[i - 1], P[i])); }

function fitCubic(P: Vec[], first: number, last: number, t1: Vec, t2: Vec, tol: number, out: Curve[], depth: number) {
  const n = last - first + 1;
  if (n === 2) { const d = Math.hypot(P[last].x - P[first].x, P[last].y - P[first].y) / 3; out.push({ p0: P[first], p1: { x: P[first].x + t1.x * d, y: P[first].y + t1.y * d }, p2: { x: P[last].x + t2.x * d, y: P[last].y + t2.y * d }, p3: P[last] }); return; }
  let u = chordParam(P, first, last);
  let bez = generate(P, first, last, u, t1, t2);
  let { err, at } = maxError(P, first, last, bez, u);
  if (err < tol) { out.push(bez); return; }
  if (err < tol * 4) {
    for (let k = 0; k < 20; k++) {
      const up = reparam(P, first, last, u, bez); bez = generate(P, first, last, up, t1, t2);
      const r = maxError(P, first, last, bez, up); if (r.err < tol) { out.push(bez); return; }
      err = r.err; at = r.at; u = up;
    }
  }
  if (depth > 40) { out.push(bez); return; }
  const tc = centerTangent(P, at);
  fitCubic(P, first, at, t1, tc, tol, out, depth + 1);
  fitCubic(P, at, last, { x: -tc.x, y: -tc.y }, t2, tol, out, depth + 1);
}
function chordParam(P: Vec[], a: number, b: number): number[] {
  const u = [0]; for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
  const L = u[u.length - 1] || 1; return u.map(x => x / L);
}
function generate(P: Vec[], a: number, b: number, u: number[], t1: Vec, t2: Vec): Curve {
  const p0 = P[a], p3 = P[b];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], s = 1 - t; const b0 = s * s * s, b1 = 3 * t * s * s, b2 = 3 * t * t * s, b3 = t * t * t;
    const A1 = { x: t1.x * b1, y: t1.y * b1 }, A2 = { x: t2.x * b2, y: t2.y * b2 };
    c00 += A1.x * A1.x + A1.y * A1.y; c01 += A1.x * A2.x + A1.y * A2.y; c11 += A2.x * A2.x + A2.y * A2.y;
    const tmp = { x: P[a + i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3)), y: P[a + i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3)) };
    x0 += A1.x * tmp.x + A1.y * tmp.y; x1 += A2.x * tmp.x + A2.y * tmp.y;
  }
  const det = c00 * c11 - c01 * c01; let al = 0, ar = 0;
  if (Math.abs(det) > 1e-12) { al = (x0 * c11 - x1 * c01) / det; ar = (c00 * x1 - c01 * x0) / det; }
  const segLen = Math.hypot(p3.x - p0.x, p3.y - p0.y); const eps = 1e-6 * segLen;
  // degenerate or runaway solutions (noisy samples) fall back to the Wu/Barsky heuristic
  if (al < eps || ar < eps || al > segLen * 1.5 || ar > segLen * 1.5) { al = ar = segLen / 3; }
  return { p0, p1: { x: p0.x + t1.x * al, y: p0.y + t1.y * al }, p2: { x: p3.x + t2.x * ar, y: p3.y + t2.y * ar }, p3 };
}
function maxError(P: Vec[], a: number, b: number, bez: Curve, u: number[]): { err: number; at: number } {
  let err = 0, at = Math.floor((a + b) / 2);
  for (let i = a + 1; i < b; i++) { const q = point(bez, u[i - a]); const d = Math.hypot(q.x - P[i].x, q.y - P[i].y); if (d > err) { err = d; at = i; } }
  return { err, at };
}
function reparam(P: Vec[], a: number, b: number, u: number[], bez: Curve): number[] {
  return u.map((t, i) => {
    const p = P[a + i]; const q = point(bez, t);
    const s = 1 - t;
    const d1 = { x: 3 * (s * s * (bez.p1.x - bez.p0.x) + 2 * s * t * (bez.p2.x - bez.p1.x) + t * t * (bez.p3.x - bez.p2.x)), y: 3 * (s * s * (bez.p1.y - bez.p0.y) + 2 * s * t * (bez.p2.y - bez.p1.y) + t * t * (bez.p3.y - bez.p2.y)) };
    const d2 = { x: 6 * (s * (bez.p2.x - 2 * bez.p1.x + bez.p0.x) + t * (bez.p3.x - 2 * bez.p2.x + bez.p1.x)), y: 6 * (s * (bez.p2.y - 2 * bez.p1.y + bez.p0.y) + t * (bez.p3.y - 2 * bez.p2.y + bez.p1.y)) };
    const num = (q.x - p.x) * d1.x + (q.y - p.y) * d1.y, den = d1.x * d1.x + d1.y * d1.y + (q.x - p.x) * d2.x + (q.y - p.y) * d2.y;
    const nt = Math.abs(den) < 1e-12 ? t : t - num / den; return Math.max(0, Math.min(1, nt));
  });
}

// ── High level ──────────────────────────────────────────────────────────────────────

export interface FitOpts { tol?: number; /** Angle (deg) at which a sample becomes a corner. */ cornerAngle?: number; closed?: boolean; /** Pre-smoothing rounds (Chaikin). */ smooth?: number }

/** Raw samples (pencil / brush input) → a smooth path that keeps real corners. */
export function pointsToPath(pts: Vec[], o: FitOpts = {}): CompoundPath {
  const tol = o.tol ?? 1.5; let P = dedupe(pts);
  if (o.smooth) P = chaikin(P, o.smooth, !!o.closed);
  if (P.length < 2) return { fillRule: 'nonzero', subpaths: [] };
  const closed = !!o.closed;
  const cornerCos = Math.cos((o.cornerAngle ?? 60) * Math.PI / 180);
  // corner detection on an RDP-simplified skeleton
  const sk = rdp(P, tol * 1.5); const cornerSet = new Set<Vec>();
  for (let i = 1; i + 1 < sk.length; i++) { const a = nrm(sub(sk[i], sk[i - 1])), b = nrm(sub(sk[i + 1], sk[i])); if (a.x * b.x + a.y * b.y < cornerCos) cornerSet.add(sk[i]); }
  const runs: Vec[][] = [[]];
  for (const p of P) { runs[runs.length - 1].push(p); if (cornerSet.has(p)) runs.push([p]); }
  if (closed) runs[runs.length - 1].push(P[0]);
  const curves: Curve[] = [];
  for (const r of runs) if (r.length >= 2) curves.push(...fitCurve(r, tol));
  return { fillRule: 'nonzero', subpaths: curves.length ? [curvesToSubpath(curves, closed && closedOk(curves))] : [] };
}
function closedOk(cs: Curve[]): boolean { const a = cs[0].p0, b = cs[cs.length - 1].p3; return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6; }

/** Object ▸ Path ▸ Simplify: refit each subpath within tol, keeping corners. */
export function simplifyPath(p: CompoundPath, tol = 1, cornerAngle = 50): CompoundPath {
  const subs: SubPath[] = [];
  for (const s of p.subpaths) {
    const cs = subpathCurves(s); if (!cs.length) { subs.push(s); continue; }
    const pts: Vec[] = [cs[0].p0]; for (const c of cs) flatten(c, Math.min(.1, tol / 10), pts);
    const q = pointsToPath(pts, { tol, cornerAngle, closed: s.closed });
    if (q.subpaths[0]) subs.push(q.subpaths[0]);
  }
  return { fillRule: p.fillRule, subpaths: subs };
}
