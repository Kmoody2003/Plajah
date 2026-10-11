// boolean — robust boolean operations on bezier compound paths (Pathfinder).
//
// Curves stay curves: inputs are cut at their intersections, never flattened.
//
// Algorithm (an arrangement + winding classification, in the family of paper.js /
// Martinez but with a ray per edge instead of sweep-line bookkeeping):
//   1. Every operand's subpaths are closed and cut into x/y-monotone pieces (so a single
//      cubic's self-loop shows up as an intersection between two of its pieces).
//   2. All piece pairs are intersected (overlap-aware, see intersect.ts) and cut at the
//      hits. Endpoints are clustered into exact shared NODES, so topology is exact even
//      when the floating point is not.
//   3. Coincident edges (shared borders, the classic boolean killer) are merged into one
//      edge that remembers every owner and its direction.
//   4. Each edge's LEFT winding number per operand is measured by casting a ray from the
//      edge midpoint along its left normal (excluding the edge itself); the right side
//      follows by subtracting the edge's own signed owners. No epsilon offsets, so thin
//      slivers and tangencies classify correctly.
//   5. An operation is a predicate on per-operand "inside" flags. An edge survives when
//      the predicate differs across it, oriented with the result on its left.
//   6. Survivors are linked into loops at the nodes by "most-left turn" (tightest face),
//      split-curve pieces of the same source curve are re-joined, collinear lines merged.
// The result uses the nonzero rule with consistent orientation (holes run reversed).
import type { Vec, Rect } from './vec';
import type { CompoundPath, Curve, FillRule, SubPath } from './model';
import { subpathCurves, curvesToSubpath, lineCurve, subpathArea } from './model';
import { point, tangent, extremaParams, splitMany, reverseCurve, hullBounds, length, tAtLength, solveQuadratic, solveCubic, subCurve, bounds as curveBounds } from './bezier';
import { curveCurve } from './intersect';

export type BoolOp = 'union' | 'intersect' | 'subtract' | 'exclude';

interface Owner { op: number; sign: number }
interface Origin { id: number; t0: number; t1: number }
export interface ArrEdge { c: Curve; a: number; b: number; owners: Owner[]; origin: Origin; wl: number[]; wr: number[] }
export interface Arrangement { nodes: Vec[]; edges: ArrEdge[]; nOps: number; rules: FillRule[]; sources: Curve[]; eps: number }

export interface BoolOptions { /** Geometric tolerance; default scale × 1e-8. */ eps?: number }

// ── Arrangement ─────────────────────────────────────────────────────────────────────

function closedCurves(s: SubPath): Curve[] {
  const cs = subpathCurves(s);
  if (!s.closed && s.anchors.length > 1) { const A = s.anchors; const a = A[A.length - 1], b = A[0]; if (Math.hypot(a.x - b.x, a.y - b.y) > 0) cs.push(lineCurve(a, b)); }
  return cs;
}

export function buildArrangement(paths: CompoundPath[], o: BoolOptions = {}): Arrangement {
  // 1. pieces
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const sources: Curve[] = []; const pieces: Array<{ c: Curve; op: number; src: number; t0: number; t1: number }> = [];
  paths.forEach((p, op) => p.subpaths.forEach(s => {
    if (s.anchors.length < 2) return;
    for (const c of closedCurves(s)) {
      const b = hullBounds(c); bx0 = Math.min(bx0, b.x); by0 = Math.min(by0, b.y); bx1 = Math.max(bx1, b.x + b.w); by1 = Math.max(by1, b.y + b.h);
      if (Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) < 1e-12 && (c.line || Math.hypot(c.p1.x - c.p0.x, c.p1.y - c.p0.y) + Math.hypot(c.p2.x - c.p0.x, c.p2.y - c.p0.y) < 1e-12)) continue;
      const src = sources.push(c) - 1; const ts = extremaParams(c);
      const parts = splitMany(c, ts); const bounds = [0, ...ts.filter(t => t > 1e-12 && t < 1 - 1e-12), 1];
      parts.forEach((pc, k) => pieces.push({ c: pc, op, src, t0: bounds[k], t1: bounds[k + 1] }));
    }
  }));
  const scale = Math.max(1, bx1 - bx0, by1 - by0);
  const eps = o.eps ?? Math.max(1e-9, scale * 1e-8);
  const snap = eps * 20;
  // 2. intersections (sort-and-sweep on x)
  const boxes: Rect[] = pieces.map(p => hullBounds(p.c));
  const order = pieces.map((_, i) => i).sort((i, j) => boxes[i].x - boxes[j].x);
  const cuts: number[][] = pieces.map(() => []);
  for (let ii = 0; ii < order.length; ii++) {
    const i = order[ii]; const bi = boxes[i];
    for (let jj = ii + 1; jj < order.length; jj++) {
      const j = order[jj]; const bj = boxes[j];
      if (bj.x > bi.x + bi.w + snap) break;
      if (bj.y > bi.y + bi.h + snap || bi.y > bj.y + bj.h + snap) continue;
      const A = pieces[i].c, B = pieces[j].c;
      for (const h of curveCurve(A, B, eps)) {
        addCut(cuts[i], A, h.ta, snap); addCut(cuts[j], B, h.tb, snap);
      }
    }
  }
  // 3. split into edges
  type Raw = { c: Curve; op: number; origin: Origin };
  const raws: Raw[] = [];
  pieces.forEach((p, i) => {
    const ts = cuts[i].sort((a, b) => a - b);
    const parts = splitMany(p.c, ts); const bnd = [0, ...ts.filter(t => t > 1e-12 && t < 1 - 1e-12), 1];
    parts.forEach((c, k) => raws.push({ c, op: p.op, origin: { id: p.src, t0: p.t0 + (p.t1 - p.t0) * bnd[k], t1: p.t0 + (p.t1 - p.t0) * bnd[k + 1] } }));
  });
  // 4. nodes (grid-hashed clustering)
  const nodes: Vec[] = []; const grid = new Map<string, number[]>(); const cell = snap * 4;
  const nodeOf = (p: Vec): number => {
    const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = grid.get(`${gx + dx},${gy + dy}`); if (!l) continue;
      for (const k of l) if (Math.hypot(nodes[k].x - p.x, nodes[k].y - p.y) <= snap) return k;
    }
    const k = nodes.push({ x: p.x, y: p.y }) - 1; const key = `${gx},${gy}`; (grid.get(key) || grid.set(key, []).get(key)!).push(k); return k;
  };
  const edges: ArrEdge[] = [];
  for (const r of raws) {
    const a = nodeOf(r.c.p0), b = nodeOf(r.c.p3);
    const c = snapEnds(r.c, nodes[a], nodes[b]);
    if (a === b && curveExtent(c) <= snap * 2) continue; // collapsed sliver
    edges.push({ c, a, b, owners: [{ op: r.op, sign: 1 }], origin: r.origin, wl: [], wr: [] });
  }
  // 5. merge coincident edges
  const byPair = new Map<string, ArrEdge[]>(); const merged: ArrEdge[] = [];
  for (const e of edges) {
    const key = e.a < e.b ? `${e.a}:${e.b}` : `${e.b}:${e.a}`;
    const list = byPair.get(key) || []; let hit: ArrEdge | null = null; let same = true;
    for (const f of list) {
      const fwd = f.a === e.a && f.b === e.b;
      if (sameGeometry(f.c, fwd ? e.c : reverseCurve(e.c), snap * 4)) { hit = f; same = fwd; break; }
    }
    if (hit) { for (const ow of e.owners) hit.owners.push({ op: ow.op, sign: same ? ow.sign : -ow.sign }); continue; }
    list.push(e); byPair.set(key, list); merged.push(e);
  }
  const arr: Arrangement = { nodes, edges: merged, nOps: paths.length, rules: paths.map(p => p.fillRule), sources, eps };
  computeWindings(arr);
  return arr;
}

function addCut(list: number[], c: Curve, t: number, snap: number) {
  if (t <= 1e-12 || t >= 1 - 1e-12) return;
  const p = point(c, t);
  if (Math.hypot(p.x - c.p0.x, p.y - c.p0.y) <= snap || Math.hypot(p.x - c.p3.x, p.y - c.p3.y) <= snap) return;
  for (const u of list) if (Math.abs(u - t) < 1e-9) return;
  list.push(t);
}
function snapEnds(c: Curve, a: Vec, b: Vec): Curve {
  if (c.line) return lineCurve(a, b);
  const d0x = a.x - c.p0.x, d0y = a.y - c.p0.y, d3x = b.x - c.p3.x, d3y = b.y - c.p3.y;
  return { p0: { x: a.x, y: a.y }, p1: { x: c.p1.x + d0x, y: c.p1.y + d0y }, p2: { x: c.p2.x + d3x, y: c.p2.y + d3y }, p3: { x: b.x, y: b.y } };
}
const curveExtent = (c: Curve) => { const b = hullBounds(c); return Math.max(b.w, b.h); };
function sameGeometry(f: Curve, e: Curve, tol: number): boolean {
  for (const t of [.25, .5, .75]) { const p = point(f, t), q = point(e, t); if (Math.hypot(p.x - q.x, p.y - q.y) > tol) { return closeOnCurve(f, e, tol); } }
  return true;
}
function closeOnCurve(f: Curve, e: Curve, tol: number): boolean {
  // parametrisations may differ (a straight cubic vs a line): compare by projection
  for (const t of [.2, .5, .8]) { const p = point(e, t); let best = Infinity; for (let k = 0; k <= 64; k++) { const q = point(f, k / 64); best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)); } if (best > tol * 4) return false; }
  return true;
}

// ── Winding by ray ──────────────────────────────────────────────────────────────────

function computeWindings(arr: Arrangement) {
  const E = arr.edges; const nOps = arr.nOps;
  const hulls = E.map(e => hullBounds(e.c));
  for (const e of E) {
    const m = point(e.c, .5); const T = tangent(e.c, .5); const N = { x: -T.y, y: T.x };
    const w = new Array(nOps).fill(0);
    for (let k = 0; k < E.length; k++) {
      const f = E[k]; if (f === e) continue;
      // cheap reject: the ray (m, N) vs the hull box
      const h = hulls[k];
      const cx = [h.x - m.x, h.x + h.w - m.x], cy = [h.y - m.y, h.y + h.h - m.y];
      let maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const dx of cx) for (const dy of cy) { const X = dx * N.x + dy * N.y, Y = N.x * dy - N.y * dx; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; }
      if (maxX <= 0 || minY > 0 || maxY <= 0) continue;
      const s = rayCross(f.c, m, N);
      if (s) for (const ow of f.owners) w[ow.op] += s * ow.sign;
    }
    e.wl = w;
    e.wr = w.slice(); for (const ow of e.owners) e.wr[ow.op] -= ow.sign;
  }
}
/** Signed crossings of the ray from m along unit dir N with curve c (half-open rule). */
function rayCross(c: Curve, m: Vec, N: Vec): number {
  const X = (p: Vec) => (p.x - m.x) * N.x + (p.y - m.y) * N.y;
  const Y = (p: Vec) => N.x * (p.y - m.y) - N.y * (p.x - m.x);
  const y0 = Y(c.p0), y1 = Y(c.p1), y2 = Y(c.p2), y3 = Y(c.p3);
  const x0 = X(c.p0), x1 = X(c.p1), x2 = X(c.p2), x3 = X(c.p3);
  if (Math.max(x0, x1, x2, x3) <= 0) return 0;
  // y-monotone breakpoints in this frame
  const ts = [0];
  if (!c.line) {
    const a = 3 * (-y0 + 3 * y1 - 3 * y2 + y3), b = 6 * (y0 - 2 * y1 + y2), cc = 3 * (y1 - y0);
    for (const t of solveQuadratic(a, b, cc).sort((p, q) => p - q)) if (t > 1e-12 && t < 1 - 1e-12) ts.push(t);
  }
  ts.push(1);
  const Yt = (t: number) => { const u = 1 - t; return u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3; };
  const Xt = (t: number) => { const u = 1 - t; return u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3; };
  let s = 0; let ya = ts.length > 2 ? Yt(ts[0]) : y0;
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i], t1 = ts[i + 1]; const yb = i + 1 === ts.length - 1 ? y3 : Yt(t1); const yA = i === 0 ? y0 : ya;
    let dir = 0;
    if (yA <= 0 && yb > 0) dir = 1; else if (yb <= 0 && yA > 0) dir = -1;
    if (dir) {
      // root on [t0,t1]
      let lo = t0, hi = t1; const up = dir > 0;
      if (Math.min(x0, x1, x2, x3) > 0) { s += dir; }
      else {
        for (let k = 0; k < 60; k++) { const md = (lo + hi) / 2; const y = Yt(md); if ((y <= 0) === up) lo = md; else hi = md; if (hi - lo < 1e-15) break; }
        const xr = Xt((lo + hi) / 2);
        if (xr > 0) s += dir;
      }
    }
    ya = yb;
  }
  return s;
}

const insideBy = (w: number, rule: FillRule) => rule === 'evenodd' ? (Math.abs(w) % 2) === 1 : w !== 0;
export function insideFlags(arr: Arrangement, w: number[]): boolean[] { return w.map((x, i) => insideBy(x, arr.rules[i])); }

// ── Selection + loop tracing ────────────────────────────────────────────────────────

interface DEdge { c: Curve; a: number; b: number; e: ArrEdge; fwd: boolean }

/** Keep the edges where `pred` flips; returns the result path (nonzero). */
export function selectByPredicate(arr: Arrangement, pred: (w: number[], inside: boolean[]) => boolean): CompoundPath {
  const kept: DEdge[] = [];
  for (const e of arr.edges) {
    const L = pred(e.wl, insideFlags(arr, e.wl)), R = pred(e.wr, insideFlags(arr, e.wr));
    if (L === R) continue;
    kept.push(L ? { c: e.c, a: e.a, b: e.b, e, fwd: true } : { c: reverseCurve(e.c), a: e.b, b: e.a, e, fwd: false });
  }
  return { fillRule: 'nonzero', subpaths: traceLoops(arr, kept).map(l => loopToSubpath(arr, l)) };
}

function traceLoops(arr: Arrangement, kept: DEdge[]): DEdge[][] {
  const out = new Map<number, DEdge[]>();
  for (const d of kept) (out.get(d.a) || out.set(d.a, []).get(d.a)!).push(d);
  const used = new Set<DEdge>(); const loops: DEdge[][] = [];
  const turn = (cur: DEdge, d: DEdge): number => {
    const din = tangent(cur.c, 1), dout = tangent(d.c, 0);
    const a = Math.atan2(din.x * dout.y - din.y * dout.x, din.x * dout.x + din.y * dout.y);
    if (Math.abs(a) < Math.PI - 1e-5) return a;
    // leaving straight back along the incoming direction (tangent contact): the sign of ±π
    // is decided by where the edge actually goes a short distance out
    const L = length(d.c); const P = point(d.c, tAtLength(d.c, Math.min(L * .05, 1), L)); const o = d.c.p0;
    const v = { x: P.x - o.x, y: P.y - o.y };
    return Math.atan2(din.x * v.y - din.y * v.x, din.x * v.x + din.y * v.y);
  };
  const next = (cur: DEdge, start: DEdge): DEdge | null => {
    const all = out.get(cur.b); if (!all || !all.length) return null;
    // never U-turn back along the twin of the incoming edge (divide keeps both directions);
    // only unused edges compete (the start edge closes the loop)
    const cands = all.filter(d => d.e !== cur.e && (!used.has(d) || d === start));
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    let best: DEdge | null = null, bestA = -Infinity;
    for (const d of cands) {
      const a = turn(cur, d);
      if (best && Math.abs(a - bestA) < 1e-6) { if (tieBreak(cur, d, best) > 0) { best = d; bestA = a; } continue; }
      if (a > bestA) { best = d; bestA = a; }
    }
    return best;
  };
  for (const start of kept) {
    if (used.has(start)) continue;
    const loop: DEdge[] = []; let cur: DEdge | null = start; let guard = 0;
    while (cur && !used.has(cur) && guard++ < kept.length + 2) { used.add(cur); loop.push(cur); cur = next(cur, start); }
    if (loop.length) loops.push(loop);
  }
  return loops;
}
/** Tangent tie (curves leaving a node in the same direction): compare points a short distance along. */
function tieBreak(cur: DEdge, p: DEdge, q: DEdge): number {
  const lp = length(p.c), lq = length(q.c); const d = Math.min(lp, lq) * .05;
  const P = point(p.c, tAtLength(p.c, d, lp)), Q = point(q.c, tAtLength(q.c, d, lq));
  const din = tangent(cur.c, 1); const o = cur.c.p3;
  const ap = Math.atan2(din.x * (P.y - o.y) - din.y * (P.x - o.x), din.x * (P.x - o.x) + din.y * (P.y - o.y));
  const aq = Math.atan2(din.x * (Q.y - o.y) - din.y * (Q.x - o.x), din.x * (Q.x - o.x) + din.y * (Q.y - o.y));
  return ap - aq;
}

/** Turn a loop of directed edges into a subpath, re-joining pieces of one source curve. */
function loopToSubpath(arr: Arrangement, loop: DEdge[]): SubPath {
  const curves: Array<{ c: Curve; src: number; t0: number; t1: number; fwd: boolean; a: number; b: number }> = loop.map(d => ({
    c: d.c, src: d.e.origin.id, t0: d.fwd ? d.e.origin.t0 : d.e.origin.t1, t1: d.fwd ? d.e.origin.t1 : d.e.origin.t0, fwd: d.fwd, a: d.a, b: d.b,
  }));
  // Rotate so we start at a "real" break (not in the middle of a source curve).
  const joinable = (x: typeof curves[0], y: typeof curves[0]) => x.src === y.src && Math.abs(x.t1 - y.t0) < 1e-9 && x.fwd === y.fwd;
  let start = 0; for (let i = 0; i < curves.length; i++) { if (!joinable(curves[(i - 1 + curves.length) % curves.length], curves[i])) { start = i; break; } }
  const rot = curves.slice(start).concat(curves.slice(0, start));
  const outC: Curve[] = [];
  for (let i = 0; i < rot.length;) {
    let j = i; while (j + 1 < rot.length && joinable(rot[j], rot[j + 1])) j++;
    if (j === i) outC.push(rot[i].c);
    else {
      const src = arr.sources[rot[i].src]; const piece = subCurve(src, rot[i].t0, rot[j].t1);
      outC.push(snapEnds(piece, arr.nodes[rot[i].a], arr.nodes[rot[j].b]));
    }
    i = j + 1;
  }
  // merge consecutive collinear lines
  const merged: Curve[] = [];
  for (const c of outC) {
    const prev = merged[merged.length - 1];
    if (prev && prev.line && c.line) {
      const ax = prev.p3.x - prev.p0.x, ay = prev.p3.y - prev.p0.y, bx = c.p3.x - c.p0.x, by = c.p3.y - c.p0.y;
      const cr = ax * by - ay * bx, dt = ax * bx + ay * by;
      if (Math.abs(cr) <= 1e-9 * Math.hypot(ax, ay) * Math.hypot(bx, by) && dt > 0) { merged[merged.length - 1] = lineCurve(prev.p0, c.p3); continue; }
    }
    merged.push(c);
  }
  if (merged.length > 1) { // wrap-around merge
    const f = merged[0], l = merged[merged.length - 1];
    if (f.line && l.line) { const ax = l.p3.x - l.p0.x, ay = l.p3.y - l.p0.y, bx = f.p3.x - f.p0.x, by = f.p3.y - f.p0.y; if (Math.abs(ax * by - ay * bx) <= 1e-9 * Math.hypot(ax, ay) * Math.hypot(bx, by) && ax * bx + ay * by > 0) { merged[0] = lineCurve(l.p0, f.p3); merged.pop(); } }
  }
  return curvesToSubpath(merged, true);
}

// ── Public operations ───────────────────────────────────────────────────────────────

const PRED: Record<BoolOp, (f: boolean[]) => boolean> = {
  union: f => f.some(Boolean),
  intersect: f => f.length > 0 && f.every(Boolean),
  subtract: f => f[0] && !f.slice(1).some(Boolean),
  exclude: f => f.filter(Boolean).length % 2 === 1,
};

/** N-ary boolean. subtract = first minus all others (Illustrator "Minus Front" with paths[0] at the back). */
export function boolean(op: BoolOp, paths: CompoundPath[], o: BoolOptions = {}): CompoundPath {
  const ps = paths.filter(p => p.subpaths.some(s => s.anchors.length > 1));
  if (!ps.length) return { fillRule: 'nonzero', subpaths: [] };
  if (op === 'subtract' && paths[0] !== ps[0]) return { fillRule: 'nonzero', subpaths: [] };
  const arr = buildArrangement(ps, o);
  return clean(selectByPredicate(arr, (_w, f) => PRED[op](f)));
}
export const union = (...p: CompoundPath[]) => boolean('union', p);
export const intersect = (...p: CompoundPath[]) => boolean('intersect', p);
export const subtract = (back: CompoundPath, ...front: CompoundPath[]) => boolean('subtract', [back, ...front]);
export const exclude = (...p: CompoundPath[]) => boolean('exclude', p);

/**
 * Resolve self-intersections / overlaps of ONE path into a clean, non-overlapping outline.
 * rule: the path's own fill rule (default), or 'positive' (winding > 0, used by offsets).
 */
export function resolve(p: CompoundPath, rule: FillRule | 'positive' | 'negative' = p.fillRule, o: BoolOptions = {}): CompoundPath {
  const arr = buildArrangement([p], o);
  const pr = rule === 'positive' ? (w: number[]) => w[0] > 0 : rule === 'negative' ? (w: number[]) => w[0] < 0 : rule === 'evenodd' ? (w: number[]) => Math.abs(w[0]) % 2 === 1 : (w: number[]) => w[0] !== 0;
  return clean(selectByPredicate(arr, w => pr(w)));
}

/** Drop degenerate loops (zero area). */
function clean(p: CompoundPath): CompoundPath {
  const scale = Math.max(1, ...p.subpaths.flatMap(s => s.anchors.map(a => Math.max(Math.abs(a.x), Math.abs(a.y)))));
  return { fillRule: 'nonzero', subpaths: p.subpaths.filter(s => s.anchors.length >= 2 && Math.abs(subpathArea(s)) > scale * scale * 1e-14) };
}

// ── Divide / shape builder ──────────────────────────────────────────────────────────

export interface Region { path: CompoundPath; /** Which operands cover this region. */ coverage: boolean[]; area: number; /** A point strictly inside. */ sample: Vec }

/**
 * Divide (Pathfinder) / shape-builder regions: every face of the overlap arrangement that
 * lies inside at least one operand, with its coverage. Faces with islands carry the
 * islands as holes.
 */
export function divide(paths: CompoundPath[], o: BoolOptions = {}): Region[] {
  const ps = paths;
  const arr = buildArrangement(ps, o);
  const kept: DEdge[] = [];
  const cov = new Map<DEdge, boolean[]>();
  for (const e of arr.edges) {
    const L = insideFlags(arr, e.wl), R = insideFlags(arr, e.wr);
    if (L.some(Boolean)) { const d = { c: e.c, a: e.a, b: e.b, e, fwd: true }; kept.push(d); cov.set(d, L); }
    if (R.some(Boolean)) { const d = { c: reverseCurve(e.c), a: e.b, b: e.a, e, fwd: false }; kept.push(d); cov.set(d, R); }
  }
  const loops = traceLoops(arr, kept);
  const faces: Array<{ sp: SubPath; area: number; cov: boolean[]; holes: SubPath[] }> = []; const holes: Array<{ sp: SubPath; cov: boolean[] }> = [];
  for (const l of loops) {
    const sp = loopToSubpath(arr, l); const a = subpathArea(sp);
    if (Math.abs(a) < 1e-12) continue;
    // coverage of a face = coverage on the left of any of its edges (all agree)
    const c = cov.get(l[0])!;
    if (a > 0) faces.push({ sp, area: a, cov: c, holes: [] }); else holes.push({ sp, cov: c });
  }
  for (const h of holes) {
    const pt = subpathCurves(h.sp)[0]; const probe = point(pt, .5);
    let best: typeof faces[0] | null = null;
    for (const f of faces) { if (best && f.area >= best.area) continue; if (f.cov.join() !== h.cov.join()) continue; if (windingOfSubpath(f.sp, probe) !== 0) best = f; }
    if (best) best.holes.push(h.sp);
  }
  return faces.map(f => {
    const path: CompoundPath = { fillRule: 'nonzero', subpaths: [f.sp, ...f.holes] };
    return { path, coverage: f.cov, area: f.area + f.holes.reduce((s, h) => s + subpathArea(h), 0), sample: interiorPoint(path) };
  });
}

/** Winding number of a point w.r.t. one subpath (horizontal ray, half-open). */
export function windingOfSubpath(s: SubPath, p: Vec): number {
  let w = 0; const dir = { x: 1, y: 0 };
  const cs = s.closed ? subpathCurves(s) : closedCurves(s);
  for (const c of cs) w += rayCross(c, p, dir);
  // rayCross measures crossing sign w.r.t. the ray direction; convert to winding convention
  return w;
}
/** Winding number of a point w.r.t. a compound path. */
export function windingNumber(path: CompoundPath, p: Vec): number { let w = 0; for (const s of path.subpaths) if (s.anchors.length > 1) w += windingOfSubpath(s, p); return w; }
export function containsPoint(path: CompoundPath, p: Vec, rule: FillRule = path.fillRule): boolean { return insideBy(windingNumber(path, p), rule); }

/** A point strictly inside a region (scanline through the bbox middle, widest interval). */
export function interiorPoint(path: CompoundPath): Vec {
  let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const s of path.subpaths) for (const c of subpathCurves(s)) { const b = curveBounds(c); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.h); x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); }
  let best: Vec = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, bestW = -1;
  for (const f of [.5, .37, .63, .25, .75, .15, .85]) {
    const y = y0 + (y1 - y0) * f; const xs: number[] = [];
    for (const s of path.subpaths) for (const c of closedCurves(s)) for (const t of lineYParams(c, y)) xs.push(point(c, t).x);
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i++) {
      const w = xs[i + 1] - xs[i]; if (w <= bestW) continue;
      const q = { x: (xs[i] + xs[i + 1]) / 2, y }; if (containsPoint(path, q)) { best = q; bestW = w; }
    }
    if (bestW > 0 && f === .5) break;
  }
  return best;
}
function lineYParams(c: Curve, y: number): number[] {
  const a = -c.p0.y + 3 * c.p1.y - 3 * c.p2.y + c.p3.y, b = 3 * c.p0.y - 6 * c.p1.y + 3 * c.p2.y, cc = -3 * c.p0.y + 3 * c.p1.y, d = c.p0.y - y;
  const out: number[] = [];
  const roots = solveCubic(a, b, cc, d);
  for (const t of roots) if (t >= 0 && t <= 1) out.push(t);
  return out;
}

/** Shape builder: the region under a point (or -1). */
export function pickRegion(regions: Region[], p: Vec): number {
  let best = -1, bestArea = Infinity;
  regions.forEach((r, i) => { if (containsPoint(r.path, p) && r.area < bestArea) { best = i; bestArea = r.area; } });
  return best;
}
/** Shape builder: merge the chosen regions into one path. */
export function mergeRegions(regions: Region[], idx: number[]): CompoundPath { return boolean('union', idx.map(i => regions[i].path)); }

// ── Pathfinder effects on painted stacks ───────────────────────────────────────────

export interface PaintedPath { path: CompoundPath; fill: string; [k: string]: unknown }

/** Trim: each object minus everything in front of it (stack index 0 = back). */
export function trim<T extends PaintedPath>(stack: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < stack.length; i++) {
    const front = stack.slice(i + 1).map(s => s.path);
    const p = front.length ? boolean('subtract', [stack[i].path, ...front]) : boolean('union', [stack[i].path]);
    if (p.subpaths.length) out.push({ ...stack[i], path: p });
  }
  return out;
}
/** Merge: trim, then unite touching/overlapping objects that share a fill. */
export function merge<T extends PaintedPath>(stack: T[]): T[] {
  const t = trim(stack); const byFill = new Map<string, T[]>();
  for (const s of t) (byFill.get(s.fill) || byFill.set(s.fill, []).get(s.fill)!).push(s);
  const out: T[] = [];
  for (const [, list] of byFill) { const u = boolean('union', list.map(s => s.path)); if (u.subpaths.length) out.push({ ...list[list.length - 1], path: u }); }
  return out;
}
/** Crop: the front-most object clips everything behind it (and is removed). */
export function crop<T extends PaintedPath>(stack: T[]): T[] {
  if (stack.length < 2) return stack.slice();
  const clip = stack[stack.length - 1].path;
  return trim(stack.slice(0, -1)).map(s => ({ ...s, path: boolean('intersect', [s.path, clip]) })).filter(s => s.path.subpaths.length);
}
/** Minus Back: the front object minus everything behind it. */
export function minusBack(stack: CompoundPath[]): CompoundPath { return stack.length ? boolean('subtract', [stack[stack.length - 1], ...stack.slice(0, -1)]) : { fillRule: 'nonzero', subpaths: [] }; }
/** Outline: the arrangement's edges as open paths, each tagged with the operand owning it (front-most). */
export function outline(paths: CompoundPath[]): Array<{ path: CompoundPath; op: number }> {
  const arr = buildArrangement(paths);
  return arr.edges.map(e => ({ path: { fillRule: 'nonzero' as const, subpaths: [curvesToSubpath([e.c], false)] }, op: Math.max(...e.owners.map(o => o.op)) }));
}
