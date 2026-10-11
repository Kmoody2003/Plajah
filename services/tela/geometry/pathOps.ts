// pathOps — Illustrator's path editing and distortion commands on the canonical model.
//
// Editing: reverse, join, average, add/remove anchor (removal refits so the shape holds),
// convert anchor (corner/smooth/symmetric), move handles with kind-aware mirroring, smooth.
// Distort & Transform: roughen, zig-zag, pucker & bloat, twist, free nonlinear maps
// (mapPath) used by envelope (mesh warp) and warp presets, and Blend (n steps).
// Nonlinear maps keep curves as curves: each cubic's control points are mapped and the piece
// is subdivided until the mapped curve is within tolerance of the mapped true curve.
import type { Vec, Rect } from './vec';
import type { Anchor, AnchorKind, CompoundPath, Curve, SubPath } from './model';
import { subpathCurves, curvesToSubpath, cloneAnchor, clonePath, lineCurve, segmentCurve, inferKind, subpathArea } from './model';
import { split, point, length, pathBounds, arcTable, locate, tangent, normal, subCurve } from './bezier';
import { fitCurve } from './fit';
import { rng as makeRng } from './procedural/random';

// ── Editing ─────────────────────────────────────────────────────────────────────────

export function reverseSubpath(s: SubPath): SubPath {
  const A = s.anchors.slice().reverse().map(a => { const b = cloneAnchor(a); const t = b.hin; b.hin = b.hout; b.hout = t; if (!b.hin) delete b.hin; if (!b.hout) delete b.hout; return b; });
  if (s.closed && A.length) A.unshift(A.pop()!); // keep the same start anchor
  return { anchors: A, closed: s.closed };
}
export const reversePath = (p: CompoundPath): CompoundPath => ({ fillRule: p.fillRule, subpaths: p.subpaths.map(reverseSubpath) });

/** Join two open subpaths at their nearest endpoints (coincident ends merge; else a straight segment). */
export function joinSubpaths(a: SubPath, b: SubPath, mergeTol = .5): SubPath {
  const A = a.anchors, B = b.anchors; const ends = [
    { d: dist(A[A.length - 1], B[0]), ra: false, rb: false }, { d: dist(A[A.length - 1], B[B.length - 1]), ra: false, rb: true },
    { d: dist(A[0], B[0]), ra: true, rb: false }, { d: dist(A[0], B[B.length - 1]), ra: true, rb: true },
  ].sort((x, y) => x.d - y.d)[0];
  const sa = ends.ra ? reverseSubpath(a) : { anchors: A.map(cloneAnchor), closed: false };
  const sb = ends.rb ? reverseSubpath(b) : { anchors: B.map(cloneAnchor), closed: false };
  const out = sa.anchors.slice();
  if (ends.d <= mergeTol) { const last = out[out.length - 1], first = sb.anchors[0]; if (first.hout) last.hout = first.hout; last.kind = 'corner'; out.push(...sb.anchors.slice(1)); }
  else out.push(...sb.anchors);
  return { anchors: out, closed: false };
}
/** Join the two ends of an open subpath (close it; coincident ends merge). */
export function closeSubpath(s: SubPath, mergeTol = .5): SubPath {
  const A = s.anchors.map(cloneAnchor);
  if (A.length > 1 && dist(A[0], A[A.length - 1]) <= mergeTol) { const l = A.pop()!; if (l.hin) A[0].hin = l.hin; A[0].kind = inferKind(A[0]); }
  return { anchors: A, closed: true };
}
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export type AnchorRef = [number, number]; // [subpath, anchor]
/** Average selected anchors horizontally / vertically / both (handles move with them). */
export function averageAnchors(p: CompoundPath, sel: AnchorRef[], axis: 'h' | 'v' | 'both' = 'both'): CompoundPath {
  const q = clonePath(p); if (!sel.length) return q;
  let sx = 0, sy = 0; for (const [s, i] of sel) { sx += q.subpaths[s].anchors[i].x; sy += q.subpaths[s].anchors[i].y; }
  const mx = sx / sel.length, my = sy / sel.length;
  // Illustrator: Horizontal = same y (averaged along the horizontal axis), Vertical = same x
  for (const [s, i] of sel) { const a = q.subpaths[s].anchors[i]; moveAnchorTo(a, axis === 'h' ? a.x : mx, axis === 'v' ? a.y : my); }
  return q;
}
export function moveAnchorTo(a: Anchor, x: number, y: number) { const dx = x - a.x, dy = y - a.y; a.x = x; a.y = y; if (a.hin) a.hin = { x: a.hin.x + dx, y: a.hin.y + dy }; if (a.hout) a.hout = { x: a.hout.x + dx, y: a.hout.y + dy }; }

/** Move one handle; smooth anchors keep the opposite handle collinear, symmetric ones mirror it. */
export function setHandle(a: Anchor, which: 'in' | 'out', to: Vec, kind: AnchorKind = a.kind ?? 'corner'): Anchor {
  const b = cloneAnchor(a); if (which === 'in') b.hin = { ...to }; else b.hout = { ...to };
  const other = which === 'in' ? 'hout' : 'hin';
  if (kind !== 'corner') {
    const dx = to.x - a.x, dy = to.y - a.y; const L = Math.hypot(dx, dy);
    if (L > 1e-12) {
      const ol = kind === 'symmetric' ? L : (b[other] ? Math.hypot(b[other]!.x - a.x, b[other]!.y - a.y) : L);
      b[other] = { x: a.x - dx / L * ol, y: a.y - dy / L * ol };
    }
  }
  b.kind = kind; return b;
}

/** Insert an anchor at parameter t on segment `seg` of subpath `si` (shape unchanged). */
export function addAnchor(p: CompoundPath, si: number, seg: number, t: number): CompoundPath {
  const q = clonePath(p); const s = q.subpaths[si]; const A = s.anchors; const n = A.length;
  const a = A[seg], b = A[(seg + 1) % n]; const c = segmentCurve(a, b);
  const [l, r] = split(c, t);
  const m: Anchor = { x: l.p3.x, y: l.p3.y, kind: c.line ? 'corner' : 'smooth' };
  if (!c.line) { a.hout = l.p1; m.hin = l.p2; m.hout = r.p1; b.hin = r.p2; }
  A.splice(seg + 1, 0, m); return q;
}
/** Object ▸ Path ▸ Add Anchor Points: a new anchor in the middle of every segment. */
export function addAnchorPoints(p: CompoundPath): CompoundPath {
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => { const cs = subpathCurves(s); const out: Curve[] = []; for (const c of cs) out.push(...split(c, .5)); return curvesToSubpath(out, s.closed); }) };
}
/** Remove an anchor; its two segments are refitted as one so the outline barely moves. */
export function removeAnchor(p: CompoundPath, si: number, ai: number): CompoundPath {
  const q = clonePath(p); const s = q.subpaths[si]; const A = s.anchors; const n = A.length;
  if (n <= 2) { A.splice(ai, 1); return q; }
  if (!s.closed && (ai === 0 || ai === n - 1)) { A.splice(ai, 1); if (ai === 0) delete A[0].hin; else delete A[A.length - 1].hout; return q; }
  const prev = A[(ai - 1 + n) % n], cur = A[ai], next = A[(ai + 1) % n];
  const c1 = segmentCurve(prev, cur), c2 = segmentCurve(cur, next);
  if (c1.line && c2.line) { A.splice(ai, 1); return q; }
  const pts: Vec[] = []; for (let i = 0; i <= 16; i++) pts.push(point(c1, i / 16)); for (let i = 1; i <= 16; i++) pts.push(point(c2, i / 16));
  const fit = fitCurve(pts, 1e9, tangent(c1, 0), { x: -tangent(c2, 1).x, y: -tangent(c2, 1).y })[0];
  if (fit) { prev.hout = fit.p1; next.hin = fit.p2; }
  A.splice(ai, 1); return q;
}
/** Convert anchor: corner drops handles; smooth/symmetric pull handles from the neighbours. */
export function convertAnchor(p: CompoundPath, si: number, ai: number, kind: AnchorKind): CompoundPath {
  const q = clonePath(p); const s = q.subpaths[si]; const A = s.anchors; const n = A.length; const a = A[ai];
  if (kind === 'corner') { delete a.hin; delete a.hout; a.kind = 'corner'; return q; }
  const prev = s.closed || ai > 0 ? A[(ai - 1 + n) % n] : null, next = s.closed || ai < n - 1 ? A[(ai + 1) % n] : null;
  const dx = (next ? next.x : a.x) - (prev ? prev.x : a.x), dy = (next ? next.y : a.y) - (prev ? prev.y : a.y); const L = Math.hypot(dx, dy) || 1;
  const li = prev ? dist(prev, a) / 3 : 0, lo = next ? dist(a, next) / 3 : 0; const ln = kind === 'symmetric' ? (li + lo) / 2 : 0;
  if (prev) a.hin = { x: a.x - dx / L * (ln || li), y: a.y - dy / L * (ln || li) };
  if (next) a.hout = { x: a.x + dx / L * (ln || lo), y: a.y + dy / L * (ln || lo) };
  a.kind = kind; return q;
}
/** Smooth every corner anchor (amount 0..1 scales the auto handles). */
export function smoothPath(p: CompoundPath, amount = 1): CompoundPath {
  let q = clonePath(p);
  q.subpaths.forEach((s, si) => s.anchors.forEach((_, ai) => {
    const conv = convertAnchor(q, si, ai, 'smooth'); const a = conv.subpaths[si].anchors[ai]; const o = q.subpaths[si].anchors[ai];
    if (a.hin) o.hin = { x: o.x + (a.hin.x - o.x) * amount, y: o.y + (a.hin.y - o.y) * amount };
    if (a.hout) o.hout = { x: o.x + (a.hout.x - o.x) * amount, y: o.y + (a.hout.y - o.y) * amount };
    o.kind = 'smooth';
  }));
  return q;
}

// ── Sampling helpers ────────────────────────────────────────────────────────────────

/** Resample a subpath into n points per segment (Illustrator's "detail") keeping originals. */
function resample(s: SubPath, perSeg: number): Array<{ p: Vec; n: Vec; orig: boolean }> {
  const out: Array<{ p: Vec; n: Vec; orig: boolean }> = []; const cs = subpathCurves(s);
  cs.forEach((c, i) => {
    const k = Math.max(1, perSeg);
    for (let j = 0; j < k; j++) { const t = j / k; out.push({ p: point(c, t), n: normal(c, t), orig: j === 0 }); }
    if (!s.closed && i === cs.length - 1) out.push({ p: point(c, 1), n: normal(c, 1), orig: true });
  });
  return out;
}
const fromPoly = (pts: Vec[], closed: boolean, smooth: boolean, tension = 1): SubPath => {
  const A: Anchor[] = pts.map(p => ({ x: p.x, y: p.y, kind: smooth ? 'smooth' : 'corner' }));
  if (smooth) { const n = A.length; for (let i = 0; i < n; i++) { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n]; if (!closed && (i === 0 || i === n - 1)) continue; const dx = (b.x - a.x) / 6 * tension, dy = (b.y - a.y) / 6 * tension; A[i].hin = { x: pts[i].x - dx, y: pts[i].y - dy }; A[i].hout = { x: pts[i].x + dx, y: pts[i].y + dy }; } }
  return { anchors: A, closed };
};

// ── Distort & Transform ─────────────────────────────────────────────────────────────

export interface RoughenOpts { size: number; /** Points per 100 px of length. */ detail?: number; smooth?: boolean; seed?: number; relative?: boolean }
/** Effect ▸ Distort ▸ Roughen. */
export function roughen(p: CompoundPath, o: RoughenOpts): CompoundPath {
  const R = makeRng(o.seed ?? 1); const b = pathBounds(p); const size = o.relative ? o.size / 100 * Math.hypot(b.w, b.h) : o.size;
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => {
    const L = subpathCurves(s).reduce((a, c) => a + length(c), 0); const n = Math.max(3, Math.round(L * (o.detail ?? 10) / 100));
    const tab = arcTable(subpathCurves(s)); const pts: Vec[] = [];
    const count = s.closed ? n : n + 1;
    for (let i = 0; i < count; i++) { const { i: ci, t } = locate(tab, tab.total * i / n); const c = tab.curves[ci]; const q = point(c, t); pts.push({ x: q.x + (R() * 2 - 1) * size, y: q.y + (R() * 2 - 1) * size }); }
    return fromPoly(pts, s.closed, !!o.smooth);
  }) };
}
/** Effect ▸ Distort ▸ Zig Zag (ridges per segment, alternating along the normal). */
export function zigzag(p: CompoundPath, size: number, ridges = 4, smooth = false): CompoundPath {
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => {
    const pts = resample(s, ridges * 2).map((r, i) => ({ x: r.p.x + r.n.x * (i % 2 ? size : -size) * (r.orig ? 0 : 1), y: r.p.y + r.n.y * (i % 2 ? size : -size) * (r.orig ? 0 : 1) }));
    return fromPoly(pts, s.closed, smooth);
  }) };
}
/** Effect ▸ Distort ▸ Pucker & Bloat: amount −1..1 (negative = pucker: anchors out, handles in). */
export function puckerBloat(p: CompoundPath, amount: number): CompoundPath {
  const b = pathBounds(p); const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => {
    const cs = subpathCurves(s); const out: Curve[] = [];
    for (const k of cs) {
      // anchors move away from the centre for pucker; the mid handles move the other way
      const mv = (q: Vec, f: number) => ({ x: q.x + (q.x - c.x) * f, y: q.y + (q.y - c.y) * f });
      const m = point(k, .5); const pull = mv(m, amount * 1.3);
      out.push({ p0: mv(k.p0, -amount), p1: { x: (k.p0.x + pull.x * 2) / 3, y: (k.p0.y + pull.y * 2) / 3 }, p2: { x: (k.p3.x + pull.x * 2) / 3, y: (k.p3.y + pull.y * 2) / 3 }, p3: mv(k.p3, -amount) });
    }
    for (let i = 1; i < out.length; i++) out[i].p0 = out[i - 1].p3;
    return curvesToSubpath(out, s.closed);
  }) };
}

/** Map a path through any point function, keeping curves (adaptive subdivision). */
export function mapPath(p: CompoundPath, f: (q: Vec) => Vec, tol = .25): CompoundPath {
  return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => {
    const out: Curve[] = [];
    const rec = (c: Curve, depth: number) => {
      const m: Curve = { p0: f(c.p0), p1: f(c.p1), p2: f(c.p2), p3: f(c.p3) };
      let err = 0; for (const t of [.25, .5, .75]) { const a = point(m, t), b = f(point(c, t)); err = Math.max(err, Math.hypot(a.x - b.x, a.y - b.y)); }
      if (err <= tol || depth > 10) { out.push(m); return; }
      const [l, r] = split(c, .5); rec(l, depth + 1); rec(r, depth + 1);
    };
    const cs = subpathCurves(s);
    if (!cs.length) return { anchors: s.anchors.map(a => { const q = f(a); return { x: q.x, y: q.y }; }), closed: s.closed };
    for (const c of cs) rec(c.line ? { ...c, line: false } : c, 0);
    for (let i = 1; i < out.length; i++) out[i].p0 = out[i - 1].p3;
    const sp = curvesToSubpath(out, s.closed);
    // straight pieces that stayed straight become lines again
    return sp;
  }) };
}
/** Effect ▸ Distort ▸ Twist: rotate by `deg` at the centre, falling off to 0 at the farthest point. */
export function twist(p: CompoundPath, deg: number, center?: Vec): CompoundPath {
  const b = pathBounds(p); const c = center ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 }; const R = Math.hypot(b.w, b.h) / 2 || 1;
  return mapPath(p, q => { const d = Math.hypot(q.x - c.x, q.y - c.y); const a = deg * Math.PI / 180 * (1 - Math.min(1, d / R)); const s = Math.sin(a), k = Math.cos(a); return { x: c.x + (q.x - c.x) * k - (q.y - c.y) * s, y: c.y + (q.x - c.x) * s + (q.y - c.y) * k }; });
}

// ── Envelope distort ────────────────────────────────────────────────────────────────

/** Envelope mesh: (rows+1)×(cols+1) points, row-major, initially a grid over `rect`. */
export interface EnvelopeMesh { rect: Rect; rows: number; cols: number; points: Vec[] }
export function makeMesh(rect: Rect, rows = 2, cols = 2): EnvelopeMesh {
  const points: Vec[] = []; for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) points.push({ x: rect.x + rect.w * c / cols, y: rect.y + rect.h * r / rows });
  return { rect, rows, cols, points };
}
/** Smooth mesh evaluation (Catmull-Rom across cells so the warp has no creases). */
export function meshMap(m: EnvelopeMesh): (q: Vec) => Vec {
  const P = (r: number, c: number) => m.points[Math.max(0, Math.min(m.rows, r)) * (m.cols + 1) + Math.max(0, Math.min(m.cols, c))];
  const ext = (r: number, c: number): Vec => { // linear extrapolation past the border
    const rr = Math.max(0, Math.min(m.rows, r)), cc = Math.max(0, Math.min(m.cols, c));
    if (rr === r && cc === c) return P(r, c);
    const base = P(rr, cc); const dr = r - rr, dc = c - cc;
    const nr = P(rr - Math.sign(dr), cc), nc = P(rr, cc - Math.sign(dc));
    return { x: base.x + (base.x - nr.x) * Math.abs(dr) + (base.x - nc.x) * Math.abs(dc), y: base.y + (base.y - nr.y) * Math.abs(dr) + (base.y - nc.y) * Math.abs(dc) };
  };
  const cr = (a: number, b: number, c: number, d: number, t: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return q => {
    const u = (q.x - m.rect.x) / m.rect.w * m.cols, v = (q.y - m.rect.y) / m.rect.h * m.rows;
    const ci = Math.max(0, Math.min(m.cols - 1, Math.floor(u))), ri = Math.max(0, Math.min(m.rows - 1, Math.floor(v)));
    const tu = u - ci, tv = v - ri; const rowsV: Vec[] = [];
    for (let r = -1; r <= 2; r++) { const p0 = ext(ri + r, ci - 1), p1 = ext(ri + r, ci), p2 = ext(ri + r, ci + 1), p3 = ext(ri + r, ci + 2); rowsV.push({ x: cr(p0.x, p1.x, p2.x, p3.x, tu), y: cr(p0.y, p1.y, p2.y, p3.y, tu) }); }
    return { x: cr(rowsV[0].x, rowsV[1].x, rowsV[2].x, rowsV[3].x, tv), y: cr(rowsV[0].y, rowsV[1].y, rowsV[2].y, rowsV[3].y, tv) };
  };
}
export const envelope = (p: CompoundPath, mesh: EnvelopeMesh, tol = .25) => mapPath(p, meshMap(mesh), tol);

export type WarpStyle = 'arc' | 'arcLower' | 'arcUpper' | 'arch' | 'bulge' | 'flag' | 'wave' | 'fish' | 'rise' | 'fisheye' | 'inflate' | 'squeeze' | 'twist' | 'shellLower' | 'shellUpper';
/** Effect ▸ Warp presets (bend −1..1, horizontal). */
export function warp(p: CompoundPath, style: WarpStyle, bend = .5, rect?: Rect): CompoundPath {
  const b = rect ?? pathBounds(p); const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const f = (q: Vec): Vec => {
    const u = (q.x - cx) / (b.w / 2 || 1), v = (q.y - cy) / (b.h / 2 || 1); // -1..1
    let x = u, y = v;
    switch (style) {
      case 'arc': break; // handled below with a true circular bend
      case 'arcLower': y = v + (v > 0 ? bend * (1 - u * u) * (v) : 0); break;
      case 'arcUpper': y = v - (v < 0 ? bend * (1 - u * u) * (-v) : 0); break;
      case 'arch': y = v - bend * (1 - u * u); break;
      case 'bulge': y = v * (1 + bend * (1 - u * u)); break;
      case 'shellLower': y = v + (v > 0 ? bend * (1 - u * u) : 0) * v; x = u * (1 + bend * .3 * (v > 0 ? v : 0)); break;
      case 'shellUpper': y = v - (v < 0 ? bend * (1 - u * u) : 0) * -v; x = u * (1 + bend * .3 * (v < 0 ? -v : 0)); break;
      case 'flag': y = v + bend * Math.sin(u * Math.PI) * .5; break;
      case 'wave': y = v + bend * Math.sin(u * Math.PI) * .5 * (1 - Math.abs(v) * .5); break;
      case 'fish': y = v * (1 + bend * Math.cos(u * Math.PI / 2) * .8) ; break;
      case 'rise': y = v - bend * u * .6; break;
      case 'fisheye': { const r = Math.hypot(u, v); const k = 1 + bend * Math.max(0, 1 - r) ; x = u * k; y = v * k; break; }
      case 'inflate': { const k = 1 + bend * (1 - Math.min(1, u * u + v * v)) * .6; x = u * k; y = v * k; break; }
      case 'squeeze': x = u * (1 - bend * (1 - v * v) * .5); y = v * (1 + bend * .2 * (1 - u * u)); break;
      case 'twist': { const a = bend * Math.PI / 2 * (1 - Math.min(1, Math.hypot(u, v))); x = u * Math.cos(a) - v * Math.sin(a); y = u * Math.sin(a) + v * Math.cos(a); break; }
    }
    return { x: cx + x * b.w / 2, y: cy + y * b.h / 2 };
  };
  if (style === 'arc') {
    // proper circular arc bend: map u to an angle around a centre below (bend>0) or above
    const s = Math.max(1e-3, Math.abs(bend)); const sign = bend >= 0 ? 1 : -1; const R = b.w / 2 / Math.sin(Math.min(Math.PI * .95, s * Math.PI / 2));
    const C = { x: cx, y: cy + sign * R };
    return mapPath(p, q => { const a = (q.x - cx) / (b.w / 2) * Math.min(Math.PI * .95, s * Math.PI / 2); const rr = R - sign * (q.y - cy); return { x: C.x + Math.sin(a) * rr, y: C.y - sign * Math.cos(a) * rr }; });
  }
  return mapPath(p, f);
}

// ── Blend ───────────────────────────────────────────────────────────────────────────

/** Object ▸ Blend: `steps` intermediate paths between a and b (anchors matched by insertion). */
export function blend(a: CompoundPath, b: CompoundPath, steps: number): CompoundPath[] {
  const n = Math.max(a.subpaths.length, b.subpaths.length); const pairs: Array<[SubPath, SubPath]> = [];
  for (let i = 0; i < n; i++) {
    const sa = a.subpaths[Math.min(i, a.subpaths.length - 1)], sb = b.subpaths[Math.min(i, b.subpaths.length - 1)];
    pairs.push(matchSubpaths(sa, sb));
  }
  const out: CompoundPath[] = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / (steps + 1);
    out.push({ fillRule: a.fillRule, subpaths: pairs.map(([x, y]) => lerpSubpath(x, y, t)) });
  }
  return out;
}
export function lerpSubpath(x: SubPath, y: SubPath, t: number): SubPath {
  const cx = subpathCurves(x), cy = subpathCurves(y);
  const L = (p: Vec, q: Vec) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const cs = cx.map((c, i) => { const d = cy[i]; const r: Curve = { p0: L(c.p0, d.p0), p1: L(c.p1, d.p1), p2: L(c.p2, d.p2), p3: L(c.p3, d.p3) }; if (c.line && d.line) r.line = true; return r; });
  return curvesToSubpath(cs, x.closed);
}
/** Give two subpaths the same segment count, same orientation and best-aligned start. */
export function matchSubpaths(a: SubPath, b: SubPath): [SubPath, SubPath] {
  let A = subpathCurves(a), B = subpathCurves(b);
  if (a.closed && b.closed && Math.sign(subpathArea(a)) !== Math.sign(subpathArea(b))) B = subpathCurves(reverseSubpath(b));
  const grow = (cs: Curve[], n: number) => { cs = cs.slice(); while (cs.length < n) { let li = 0, ll = -1; cs.forEach((c, i) => { const l = length(c); if (l > ll) { ll = l; li = i; } }); const [l, r] = split(cs[li], .5); cs.splice(li, 1, l, r); } return cs; };
  const n = Math.max(A.length, B.length); A = grow(A, n); B = grow(B, n);
  if (a.closed && b.closed) {
    let best = 0, bd = Infinity;
    for (let s = 0; s < n; s++) { let d = 0; for (let i = 0; i < n; i++) d += dist(A[i].p0, B[(i + s) % n].p0); if (d < bd) { bd = d; best = s; } }
    B = B.slice(best).concat(B.slice(0, best));
  }
  A = A.map(c => c.line ? { ...c } : c); B = B.map(c => c.line ? { ...c } : c);
  return [curvesToSubpath(A, a.closed), curvesToSubpath(B, b.closed)];
}

/** Points evenly along a path (for scatter, text-on-path, stipple lines). */
export function pointsAlong(p: CompoundPath, spacing: number, jitter = 0, seed = 1): Array<{ p: Vec; tan: Vec }> {
  const R = makeRng(seed); const out: Array<{ p: Vec; tan: Vec }> = [];
  for (const s of p.subpaths) {
    const tab = arcTable(subpathCurves(s)); if (tab.total <= 0) continue;
    const n = Math.max(1, Math.round(tab.total / spacing));
    for (let i = 0; i <= (s.closed ? n - 1 : n); i++) { const d = Math.max(0, Math.min(tab.total, tab.total * i / n + (R() * 2 - 1) * jitter * spacing)); const { i: ci, t } = locate(tab, d); out.push({ p: point(tab.curves[ci], t), tan: tangent(tab.curves[ci], t) }); }
  }
  return out;
}
export { lineCurve, subCurve };
