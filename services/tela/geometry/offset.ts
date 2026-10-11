// offset — curve offsetting (Tiller–Hanson style with error-controlled subdivision),
// joins, caps and Offset Path.
//
// A cubic's exact offset is not a cubic, so each piece is approximated: endpoints move
// along their normals, handles keep their DIRECTION (so offsets stay G1 wherever the
// source is) with lengths scaled by (1 − dκ) — the radius change of the osculating circle.
// The approximation is checked against the true offset at several samples and the source is
// subdivided until it is within tolerance. Inflections are split first (offset
// behaviour flips there). Cusps/swallowtails are left in place: the caller resolves them
// with a winding-rule boolean (see boolean.resolve), which is how Offset Path, Outline
// Stroke and variable-width strokes all get clean results.
import type { Vec } from './vec';
import type { CompoundPath, Curve, LineJoin, LineCap, SubPath } from './model';
import { lineCurve, subpathCurves, curvesToSubpath } from './model';
import { point, tangent, curvature, split, inflections, splitMany, nearest, isStraight, length } from './bezier';
import { resolve } from './boolean';

/** Offset one curve by d along its LEFT normal. Returns ≥1 cubic. */
export function offsetCurve(c: Curve, d: number, tol = .05): Curve[] {
  if (d === 0) return [c];
  if (c.line || isStraight(c, 1e-9)) {
    const t = tangent(c, .5); const n = { x: -t.y * d, y: t.x * d };
    if (Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) < 1e-12) return [];
    return [lineCurve({ x: c.p0.x + n.x, y: c.p0.y + n.y }, { x: c.p3.x + n.x, y: c.p3.y + n.y })];
  }
  const out: Curve[] = [];
  for (const piece of splitMany(c, inflections(c))) offsetRec(piece, d, tol, 0, out);
  return out;
}
function approx(c: Curve, d: number): Curve {
  const t0 = tangent(c, 0), t1 = tangent(c, 1);
  const q0 = { x: c.p0.x - t0.y * d, y: c.p0.y + t0.x * d }, q3 = { x: c.p3.x - t1.y * d, y: c.p3.y + t1.x * d };
  const k0 = Math.max(.02, 1 - d * curvature(c, 0)), k3 = Math.max(.02, 1 - d * curvature(c, 1));
  let h0 = { x: c.p1.x - c.p0.x, y: c.p1.y - c.p0.y }, h3 = { x: c.p2.x - c.p3.x, y: c.p2.y - c.p3.y };
  // degenerate handles: borrow a third of the chord along the tangent
  const ch = Math.hypot(c.p3.x - c.p0.x, c.p3.y - c.p0.y) / 3;
  if (Math.hypot(h0.x, h0.y) < 1e-9) h0 = { x: t0.x * ch * .5, y: t0.y * ch * .5 };
  if (Math.hypot(h3.x, h3.y) < 1e-9) h3 = { x: -t1.x * ch * .5, y: -t1.y * ch * .5 };
  return { p0: q0, p1: { x: q0.x + h0.x * k0, y: q0.y + h0.y * k0 }, p2: { x: q3.x + h3.x * k3, y: q3.y + h3.y * k3 }, p3: q3 };
}
function offsetRec(c: Curve, d: number, tol: number, depth: number, out: Curve[]) {
  const a = approx(c, d);
  if (depth >= 9) { out.push(a); return; }
  let err = 0;
  for (const t of [.15, .3, .5, .7, .85]) {
    const p = point(c, t), n = tangent(c, t); const q = { x: p.x - n.y * d, y: p.y + n.x * d };
    err = Math.max(err, nearest(a, q).dist); if (err > tol) break;
  }
  if (err <= tol) { out.push(a); return; }
  const [l, r] = split(c, .5); offsetRec(l, d, tol, depth + 1, out); offsetRec(r, d, tol, depth + 1, out);
}

// ── Arcs (for round joins/caps) ─────────────────────────────────────────────────────

/** Circular arc as cubics: centre, radius, start angle, signed sweep (radians, + = left/CCW in maths axes). */
export function arcCurves(c: Vec, r: number, a0: number, sweep: number): Curve[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9)); const d = sweep / n; const k = 4 / 3 * Math.tan(d / 4) * r;
  const out: Curve[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + d * i, b = a + d;
    const p0 = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }, p3 = { x: c.x + r * Math.cos(b), y: c.y + r * Math.sin(b) };
    out.push({ p0, p1: { x: p0.x - Math.sin(a) * k, y: p0.y + Math.cos(a) * k }, p2: { x: p3.x + Math.sin(b) * k, y: p3.y - Math.cos(b) * k }, p3 });
  }
  return out;
}

/**
 * Join between two offset pieces meeting at source vertex v. `from`/`to` are the offset
 * endpoints, tIn/tOut the source tangents, d the signed left offset distance.
 */
export function joinCurves(v: Vec, from: Vec, to: Vec, tIn: Vec, tOut: Vec, d: number, join: LineJoin, miterLimit = 4): Curve[] {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) return [];
  const turn = tIn.x * tOut.y - tIn.y * tOut.x; // > 0 turning left
  const gap = turn * d < 0 || (Math.abs(turn) < 1e-12 && tIn.x * tOut.x + tIn.y * tOut.y < 0);
  if (!gap) return [lineCurve(from, v), lineCurve(v, to)]; // inner side: pivot through the vertex (resolved later)
  if (join === 'round') {
    const a0 = Math.atan2(from.y - v.y, from.x - v.x); let a1 = Math.atan2(to.y - v.y, to.x - v.x); let sw = a1 - a0;
    // sweep the outer way: same sense as the turn seen from the offset side
    while (sw > Math.PI) sw -= 2 * Math.PI; while (sw < -Math.PI) sw += 2 * Math.PI;
    if (Math.abs(Math.abs(sw) - Math.PI) < 1e-9) sw = d > 0 ? -Math.PI : Math.PI; // U-turn: go around the outside
    return arcCurves(v, Math.abs(d), a0, sw);
  }
  if (join === 'miter') {
    const den = tIn.x * tOut.y - tIn.y * tOut.x;
    if (Math.abs(den) > 1e-12) {
      const s = ((to.x - from.x) * tOut.y - (to.y - from.y) * tOut.x) / den;
      const m = { x: from.x + tIn.x * s, y: from.y + tIn.y * s };
      const miterLen = Math.hypot(m.x - v.x, m.y - v.y) / Math.max(1e-12, Math.abs(d));
      if (miterLen <= miterLimit && s > 0) return [lineCurve(from, m), lineCurve(m, to)];
    }
  }
  return [lineCurve(from, to)]; // bevel
}

/** Cap from the left edge point to the right edge point at an end with outward tangent t. */
export function capCurves(p: Vec, t: Vec, halfL: number, halfR: number, cap: LineCap): Curve[] {
  const n = { x: -t.y, y: t.x };
  const L = { x: p.x + n.x * halfL, y: p.y + n.y * halfL }, R = { x: p.x - n.x * halfR, y: p.y - n.y * halfR };
  if (cap === 'butt') return [lineCurve(L, R)];
  if (cap === 'square') {
    const e = (halfL + halfR) / 2; const L2 = { x: L.x + t.x * e, y: L.y + t.y * e }, R2 = { x: R.x + t.x * e, y: R.y + t.y * e };
    return [lineCurve(L, L2), lineCurve(L2, R2), lineCurve(R2, R)];
  }
  // round: half ellipse when sides differ; a semicircle otherwise. From L around the front to R.
  const a0 = Math.atan2(n.y, n.x); const r = (halfL + halfR) / 2; const c = { x: p.x + n.x * (halfL - halfR) / 2, y: p.y + n.y * (halfL - halfR) / 2 };
  return arcCurves(c, r, a0, -Math.PI);
}

// ── Chains ──────────────────────────────────────────────────────────────────────────

export interface SideOpts { join?: LineJoin; miterLimit?: number; tol?: number }

/**
 * Offset a chain of curves by d (left), inserting joins. For closed chains the result is
 * a closed loop (join at the seam too).
 */
export function offsetChain(curves: Curve[], closed: boolean, d: number, o: SideOpts = {}): Curve[] {
  const join = o.join ?? 'miter', ml = o.miterLimit ?? 4, tol = o.tol ?? Math.max(.01, Math.abs(d) * .004);
  const cs = curves.filter(c => length(c) > 1e-9);
  const offs = cs.map(c => offsetCurve(c, d, tol));
  const out: Curve[] = [];
  for (let i = 0; i < cs.length; i++) {
    const seg = offs[i]; if (!seg.length) continue;
    if (out.length) {
      const prevEnd = out[out.length - 1].p3; const start = seg[0].p0;
      out.push(...joinCurves(cs[i].p0, prevEnd, start, tangent(cs[i - 1], 1), tangent(cs[i], 0), d, join, ml));
    }
    out.push(...seg);
  }
  if (closed && out.length && cs.length) {
    const last = cs[cs.length - 1], first = cs[0];
    out.push(...joinCurves(first.p0, out[out.length - 1].p3, out[0].p0, tangent(last, 1), tangent(first, 0), d, join, ml));
  }
  return out;
}

/**
 * Offset Path (Object ▸ Path ▸ Offset Path): d > 0 grows the filled region, d < 0 shrinks.
 * Open subpaths are treated as closed (Illustrator does the same).
 */
export function offsetPath(p: CompoundPath, d: number, join: LineJoin = 'miter', miterLimit = 4, tol?: number): CompoundPath {
  const clean = resolve({ fillRule: p.fillRule, subpaths: p.subpaths.map(s => ({ anchors: s.anchors, closed: true })) });
  const loops: SubPath[] = [];
  for (const s of clean.subpaths) {
    const ch = offsetChain(subpathCurves(s), true, -d, { join, miterLimit, tol });
    if (ch.length) loops.push(curvesToSubpath(fixChain(ch), true));
  }
  return resolve({ fillRule: 'nonzero', subpaths: loops }, 'positive');
}
/** Make consecutive curves meet exactly (tiny float gaps). */
export function fixChain(cs: Curve[]): Curve[] {
  for (let i = 1; i < cs.length; i++) { const a = cs[i - 1].p3, b = cs[i].p0; if (a.x !== b.x || a.y !== b.y) { const dx = a.x - b.x, dy = a.y - b.y; if (Math.hypot(dx, dy) < 1e-6) { cs[i] = { ...cs[i], p0: { ...a }, p1: { x: cs[i].p1.x + dx, y: cs[i].p1.y + dy } }; if (cs[i].line) cs[i] = lineCurve(a, cs[i].p3); } else cs.splice(i, 0, lineCurve(a, b)); } }
  return cs;
}
