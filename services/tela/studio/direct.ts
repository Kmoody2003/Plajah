// studio/direct — Direct Selection and the path-editing tools, as pure functions on paths.
//
// Selection of anchors is a list of [subpath, anchor] refs per object. Dragging moves the
// selected anchors with their handles; dragging a handle respects the anchor kind (smooth
// keeps the opposite handle collinear, symmetric mirrors it) unless Alt breaks it to a
// corner. Scissors split a path at a point (closed → open, open → two paths), Join and
// Average work across anchors, and every legacy object becomes editable through
// studio/objectGeom.withPath on its first committed edit.
import type { Anchor, AnchorKind, CompoundPath, SubPath } from '../geometry/model';
import type { Rect, Vec } from '../geometry/vec';
import { clonePath, cloneAnchor, subpathCurves, inferKind } from '../geometry/model';
import { setHandle, moveAnchorTo, addAnchor, removeAnchor, convertAnchor, joinSubpaths, closeSubpath, averageAnchors, type AnchorRef } from '../geometry/pathOps';
import { split, nearest, length as curveLength } from '../geometry/bezier';
import { distanceToPath, hitAnchor, anchorsInRect } from '../geometry/hittest';

export type { AnchorRef };
export const refKey = (r: AnchorRef) => `${r[0]}:${r[1]}`;

/** Move the selected anchors (and their handles) by (dx, dy). */
export function moveAnchors(p: CompoundPath, sel: AnchorRef[], dx: number, dy: number): CompoundPath {
  const q = clonePath(p);
  for (const [s, i] of sel) { const a = q.subpaths[s]?.anchors[i]; if (a) moveAnchorTo(a, a.x + dx, a.y + dy); }
  return q;
}

/** Drag one handle. `breakHandle` (Alt) converts the anchor to a corner first. */
export function dragHandle(p: CompoundPath, s: number, i: number, which: 'in' | 'out', to: Vec, breakHandle = false): CompoundPath {
  const q = clonePath(p); const A = q.subpaths[s].anchors; const a = A[i];
  const kind: AnchorKind = breakHandle ? 'corner' : (a.kind ?? inferKind(a));
  A[i] = setHandle(a, which, to, kind);
  return q;
}

/** Convert-anchor tool, click: a smooth anchor becomes a corner, a corner becomes smooth. */
export function toggleAnchor(p: CompoundPath, s: number, i: number): CompoundPath {
  const a = p.subpaths[s].anchors[i];
  const kind = a.kind ?? inferKind(a);
  return convertAnchor(p, s, i, kind === 'corner' && !(a.hin || a.hout) ? 'smooth' : 'corner');
}
/** Convert-anchor tool, drag: pull symmetric handles out of an anchor towards the pointer. */
export function pullHandles(p: CompoundPath, s: number, i: number, to: Vec): CompoundPath {
  const q = clonePath(p); const a = q.subpaths[s].anchors[i];
  a.hout = { x: to.x, y: to.y }; a.hin = { x: 2 * a.x - to.x, y: 2 * a.y - to.y }; a.kind = 'symmetric';
  return q;
}

/** Nearest point on the outline (segment index and parameter), for add-anchor / scissors / type on path. */
export const nearestOnPath = (p: CompoundPath, pt: Vec) => distanceToPath(p, pt);

/** Add-anchor tool: insert at the nearest point on the outline if within tol. */
export function addAnchorAt(p: CompoundPath, pt: Vec, tol: number): CompoundPath | null {
  const n = distanceToPath(p, pt); if (n.dist > tol || n.sub < 0) return null;
  return addAnchor(p, n.sub, n.seg, n.t);
}
/** Delete-anchor tool: remove the anchor under the pointer (the outline is refitted). */
export function deleteAnchorAt(p: CompoundPath, pt: Vec, tol: number): CompoundPath | null {
  const h = hitAnchor(p, pt, tol, false); if (!h) return null;
  const q = removeAnchor(p, h.sub, h.anchor);
  q.subpaths = q.subpaths.filter(s => s.anchors.length >= 2);
  return q;
}
/** Delete the selected anchors (Delete key in Direct Selection). Open ends split nothing: anchors just go. */
export function deleteAnchors(p: CompoundPath, sel: AnchorRef[]): CompoundPath {
  let q = clonePath(p);
  const bySub = new Map<number, number[]>(); for (const [s, i] of sel) bySub.set(s, [...(bySub.get(s) ?? []), i]);
  for (const [s, list] of bySub) for (const i of list.sort((a, b) => b - a)) q = removeAnchor(q, s, i);
  q.subpaths = q.subpaths.filter(s => s.anchors.length >= 2);
  return q;
}

/**
 * Scissors: cut the outline at the nearest point. A closed subpath opens there (one
 * piece); an open one becomes two pieces. Returns the resulting compound paths, each a
 * separate object in Illustrator, with the untouched subpaths kept on the first.
 */
export function cutAt(p: CompoundPath, pt: Vec, tol: number): CompoundPath[] | null {
  const n = distanceToPath(p, pt); if (n.dist > tol || n.sub < 0) return null;
  const s = p.subpaths[n.sub]; const cs = subpathCurves(s);
  const c = cs[n.seg]; if (!c) return null;
  const t = Math.min(1 - 1e-6, Math.max(1e-6, n.t));
  const [l, r] = split(c, t);
  // Build the sequence of curves starting right after the cut and ending right before it.
  const after = [r, ...cs.slice(n.seg + 1)], before = [...cs.slice(0, n.seg), l];
  const others = p.subpaths.filter((_, i) => i !== n.sub).map(x => ({ anchors: x.anchors.map(cloneAnchor), closed: x.closed }));
  const toSub = (curves: typeof cs): SubPath => {
    const A: Anchor[] = curves.map(k => ({ x: k.p0.x, y: k.p0.y }));
    A.push({ x: curves[curves.length - 1].p3.x, y: curves[curves.length - 1].p3.y });
    curves.forEach((k, i) => { if (k.line) return; A[i].hout = { ...k.p1 }; A[i + 1].hin = { ...k.p2 }; });
    for (const a of A) a.kind = inferKind(a);
    return { anchors: A, closed: false };
  };
  if (s.closed) return [{ fillRule: p.fillRule, subpaths: [toSub([...after, ...before]), ...others] }];
  const parts: CompoundPath[] = [];
  if (before.length) parts.push({ fillRule: p.fillRule, subpaths: [toSub(before), ...others] });
  if (after.length) parts.push({ fillRule: p.fillRule, subpaths: [toSub(after)] });
  return parts;
}

/** Endpoints of open subpaths: [sub, anchor index] for each end. */
export function openEnds(p: CompoundPath): AnchorRef[] {
  const out: AnchorRef[] = [];
  p.subpaths.forEach((s, i) => { if (!s.closed && s.anchors.length >= 1) { out.push([i, 0]); if (s.anchors.length > 1) out.push([i, s.anchors.length - 1]); } });
  return out;
}
/** Is `pt` on an open end of `p`? (pen continuation) */
export function endAt(p: CompoundPath, pt: Vec, tol: number): { sub: number; atStart: boolean } | null {
  for (const [s, i] of openEnds(p)) { const a = p.subpaths[s].anchors[i]; if (Math.hypot(a.x - pt.x, a.y - pt.y) <= tol) return { sub: s, atStart: i === 0 }; }
  return null;
}

/**
 * Join (Ctrl+J). One path: close each open subpath. Two paths: join their nearest open
 * ends into one subpath (coincident ends merge). Returns null if there is nothing to join.
 */
export function joinPaths(paths: CompoundPath[]): CompoundPath | null {
  if (paths.length === 1) {
    const p = paths[0]; if (!p.subpaths.some(s => !s.closed)) return null;
    const opens = p.subpaths.filter(s => !s.closed);
    if (opens.length === 2) { const j = joinSubpaths(opens[0], opens[1]); return { fillRule: p.fillRule, subpaths: [...p.subpaths.filter(s => s.closed), j] }; }
    return { fillRule: p.fillRule, subpaths: p.subpaths.map(s => s.closed ? s : closeSubpath(s)) };
  }
  if (paths.length >= 2) {
    const opens = paths.map(p => p.subpaths.find(s => !s.closed));
    if (opens.some(s => !s)) return null;
    let acc = opens[0]!;
    for (let i = 1; i < opens.length; i++) acc = joinSubpaths(acc, opens[i]!);
    const rest = paths.flatMap(p => p.subpaths.filter(s => s !== opens[paths.indexOf(p)]));
    return { fillRule: paths[0].fillRule, subpaths: [acc, ...rest] };
  }
  return null;
}

export const averageSelected = averageAnchors;
export const anchorsInMarquee = (p: CompoundPath, r: Rect) => anchorsInRect(p, r);
export const hitPathAnchor = hitAnchor;

/** Is the point on a segment (not an anchor)? Returns the two anchors of that segment. */
export function segmentAt(p: CompoundPath, pt: Vec, tol: number): { refs: AnchorRef[]; sub: number; seg: number; t: number } | null {
  const n = distanceToPath(p, pt); if (n.dist > tol || n.sub < 0) return null;
  const s = p.subpaths[n.sub]; const a = n.seg, b = (n.seg + 1) % s.anchors.length;
  return { refs: [[n.sub, a], [n.sub, b]], sub: n.sub, seg: n.seg, t: n.t };
}

/** Reshape a curve segment by dragging a point on it (Illustrator's curve drag): moves both handles. */
export function bendSegment(p: CompoundPath, sub: number, seg: number, t: number, delta: Vec): CompoundPath {
  const q = clonePath(p); const s = q.subpaths[sub]; const n = s.anchors.length;
  const a = s.anchors[seg], b = s.anchors[(seg + 1) % n];
  // Weighting that moves the grabbed point by ~delta: B(t) moves by (3(1-t)²t·w1 + 3(1-t)t²·w2) * delta.
  const w1 = 3 * (1 - t) * (1 - t) * t, w2 = 3 * (1 - t) * t * t; const k = 1 / Math.max(.05, w1 + w2);
  const h1 = a.hout ?? { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  const h2 = b.hin ?? { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 };
  a.hout = { x: h1.x + delta.x * k * (1 - t), y: h1.y + delta.y * k * (1 - t) };
  b.hin = { x: h2.x + delta.x * k * t, y: h2.y + delta.y * k * t };
  // Keep smooth neighbours smooth.
  if (a.kind === 'smooth' || a.kind === 'symmetric') s.anchors[seg] = setHandle(a, 'out', a.hout, a.kind);
  if (b.kind === 'smooth' || b.kind === 'symmetric') s.anchors[(seg + 1) % n] = setHandle(s.anchors[(seg + 1) % n], 'in', b.hin!, b.kind);
  return q;
}
export { nearest };

/** Arc-length position u ∈ [0,1] of (seg, t) along subpath `sub` (width tool, type on path). */
export function uOnSubpath(p: CompoundPath, sub: number, seg: number, t: number): { u: number; total: number } {
  const cs = subpathCurves(p.subpaths[sub]); let before = 0, total = 0;
  cs.forEach((c, i) => { const L = curveLength(c); total += L; if (i < seg) before += L; else if (i === seg) before += curveLength(c, 0, t); });
  return { u: total > 0 ? before / total : 0, total };
}
