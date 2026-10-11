// studio/pen — the Pen tool as a pure state machine (Illustrator semantics).
//
//   click            corner anchor                drag          smooth anchor, handles mirror
//   Alt while drag   break: only the out-handle   Shift         45° constraint (position / handle)
//   click 1st anchor close the path (drag there to shape the closing curve)
//   click last anchor (not dragging) retract its out-handle (the "cusp" move)
//   start on the end of an open path            continue that path (other end: reversed)
//
// The UI feeds pointer events in artboard px and renders `penPreview()`; it never owns
// geometry rules, so behaviour is testable without a DOM.
import type { Anchor, CompoundPath, SubPath } from '../geometry/model';
import type { Vec } from '../geometry/vec';
import { cloneAnchor } from '../geometry/model';
import { reverseSubpath } from '../geometry/pathOps';
import { constrainAngle } from '../geometry/hittest';

export interface PenMods { shift?: boolean; alt?: boolean }
export interface PenTarget { id: string; sub: number; reversed: boolean; others: SubPath[] }
export interface PenState {
  anchors: Anchor[];
  /** Index of the anchor being dragged out, and whether the drag is closing the path. */
  drag: null | { index: number; closing: boolean; at: Vec };
  closed: boolean;
  /** Continuing an existing open path. */
  target?: PenTarget;
  /** Set when the gesture finished the path (closed, or explicitly ended). */
  done?: boolean;
}

export const penStart = (): PenState => ({ anchors: [], drag: null, closed: false });

const near = (a: Vec, b: Vec, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

/** Continue an existing open subpath from the end that was clicked. */
export function penContinue(sub: SubPath, atStart: boolean, target: Omit<PenTarget, 'reversed'>): PenState {
  const s = atStart ? reverseSubpath(sub) : { anchors: sub.anchors.map(cloneAnchor), closed: false };
  return { anchors: s.anchors, drag: null, closed: false, target: { ...target, reversed: atStart } };
}

export function penDown(st: PenState, p: Vec, mods: PenMods = {}, tol = 6): PenState {
  if (st.done) st = penStart();
  const A = st.anchors.map(cloneAnchor);
  // Close on the first anchor.
  if (A.length >= 2 && near(A[0], p, tol)) return { ...st, anchors: A, drag: { index: 0, closing: true, at: { x: A[0].x, y: A[0].y } } };
  // Click on the last anchor: retract its out-handle (and keep drawing from it).
  if (A.length >= 1 && near(A[A.length - 1], p, tol)) {
    const l = A[A.length - 1]; delete l.hout; l.kind = 'corner';
    return { ...st, anchors: A, drag: { index: A.length - 1, closing: false, at: { x: l.x, y: l.y } } };
  }
  let q = { ...p };
  if (mods.shift && A.length) q = constrainAngle(A[A.length - 1], p, 45);
  A.push({ x: q.x, y: q.y, kind: 'corner' });
  return { ...st, anchors: A, drag: { index: A.length - 1, closing: false, at: q } };
}

/** Pull handles while the button is down. */
export function penDrag(st: PenState, p: Vec, mods: PenMods = {}): PenState {
  if (!st.drag) return st;
  const A = st.anchors.map(cloneAnchor); const a = A[st.drag.index];
  let h = { ...p };
  if (mods.shift) h = constrainAngle(a, p, 45);
  if (Math.hypot(h.x - a.x, h.y - a.y) < .5) return st;
  const mirror = { x: 2 * a.x - h.x, y: 2 * a.y - h.y };
  if (st.drag.closing) {
    // Dragging on the first anchor shapes the closing segment: the drag direction is the
    // first anchor's OUT direction (as in Illustrator); its in-handle mirrors it.
    if (mods.alt) { a.hin = mirror; a.kind = 'corner'; }
    else { a.hout = h; a.hin = mirror; a.kind = 'symmetric'; }
  } else if (mods.alt) {
    a.hout = h; a.kind = 'corner';
  } else {
    a.hout = h; a.hin = mirror; a.kind = 'symmetric';
  }
  return { ...st, anchors: A };
}

/** Button released. A closing gesture finishes the path. */
export function penUp(st: PenState): PenState {
  if (!st.drag) return st;
  if (st.drag.closing) return { ...st, drag: null, closed: true, done: true };
  return { ...st, drag: null };
}

/** End an open path (Enter / Esc / switching tools). Too-short paths are discarded. */
export function penFinish(st: PenState): PenState { return { ...st, drag: null, done: true }; }

/** Remove the last anchor (Backspace while drawing). */
export function penUndoAnchor(st: PenState): PenState { return { ...st, anchors: st.anchors.slice(0, -1), drag: null }; }

/** The finished path, or null when there is nothing worth keeping. */
export function penPath(st: PenState): CompoundPath | null {
  const own: SubPath = { anchors: st.anchors.map(cloneAnchor), closed: st.closed };
  if (own.anchors.length < 2 && !st.target) return null;
  if (st.target) {
    const subs = st.target.others.map(s => ({ anchors: s.anchors.map(cloneAnchor), closed: s.closed }));
    subs.splice(st.target.sub, 0, st.target.reversed ? reverseSubpath(own) : own);
    return { fillRule: 'nonzero', subpaths: subs.filter(s => s.anchors.length >= 2) };
  }
  return { fillRule: 'nonzero', subpaths: [own] };
}

/** In-progress subpath plus the rubber-band segment to the cursor (for drawing the preview). */
export function penPreview(st: PenState, cursor: Vec | null, mods: PenMods = {}): { path: SubPath; rubber: SubPath | null } {
  const path: SubPath = { anchors: st.anchors.map(cloneAnchor), closed: st.closed };
  if (!cursor || st.drag || !st.anchors.length || st.done) return { path, rubber: null };
  const last = st.anchors[st.anchors.length - 1];
  const c = mods.shift ? constrainAngle(last, cursor, 45) : cursor;
  const closing = st.anchors.length >= 2 && near(st.anchors[0], c, 6);
  const end: Anchor = closing ? { ...st.anchors[0] } : { x: c.x, y: c.y };
  const start: Anchor = { x: last.x, y: last.y }; if (last.hout) start.hout = last.hout;
  const e: Anchor = { x: end.x, y: end.y }; if (closing && st.anchors[0].hin) e.hin = st.anchors[0].hin;
  return { path, rubber: { anchors: [start, e], closed: false } };
}
