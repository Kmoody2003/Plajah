// clipEditStack — Fabula's clip trim / move / snap math as pure functions, so other
// timelines (Stage's presentation strip) edit clips exactly the way Fabula does.
//
// Lifted from the inline drag math in components/Fabula/Fabula.jsx
// (onTimelineMove): durations floor at a minimum length (Fabula: 0.3s), values
// quantize to a grid (Fabula: the project frame grid, 1/fps), and edges pull
// toward nearby snap points within a tolerance (Fabula: 0.2s). Ripple pushes the
// clips after the edited one by the same delta.
//
// All times are seconds. Nothing here touches React or the DOM.

export interface EditClip {
  start: number;
  duration: number;
  /** In point within the source media (Fabula's `srcIn`). */
  srcIn?: number;
}

export interface TrimOptions {
  /** Shortest a clip may become. Fabula uses 0.3s. */
  minDuration?: number;
  /** Grid step in seconds (Fabula: 1/fps). 0 or undefined = no grid. */
  snap?: number;
  /** Absolute times the moving edge is pulled to (neighbour edges, playhead, markers). */
  snapTargets?: readonly number[];
  /** How close (seconds) an edge must be to a target to snap. Fabula uses 0.2s. */
  snapTolerance?: number;
}

export const FABULA_MIN_CLIP_SEC = 0.3;
export const FABULA_EDGE_SNAP_SEC = 0.2;

/** Quantize to a grid step (Fabula's frame snap: `Math.round(v * fps) / fps`). */
export function quantize(v: number, step?: number): number {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

/** Fabula's frame grid for a frame rate. */
export function frameGrid(fps: number): number {
  return 1 / (fps > 0 ? fps : 24);
}

/** Pull `t` to the nearest target within `tol`; otherwise return it unchanged. */
export function snapToTargets(t: number, targets: readonly number[] = [], tol = FABULA_EDGE_SNAP_SEC): number {
  let best = t;
  let bestD = tol;
  for (const p of targets) {
    const d = Math.abs(t - p);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Right-edge trim: drag the out point by `dt`. Start and in point stay put. */
export function trimClipEnd<C extends EditClip>(clip: C, dt: number, opts: TrimOptions = {}): C {
  const min = opts.minDuration ?? FABULA_MIN_CLIP_SEC;
  let end = clip.start + Math.max(min, clip.duration + dt);
  const snapped = snapToTargets(end, opts.snapTargets, opts.snapTolerance ?? FABULA_EDGE_SNAP_SEC);
  end = snapped !== end ? snapped : clip.start + quantize(end - clip.start, opts.snap);
  return { ...clip, duration: Math.max(min, end - clip.start) };
}

/** Left-edge trim: start, duration and in point move together (Fabula "start" mode). */
export function trimClipStart<C extends EditClip>(clip: C, dt: number, opts: TrimOptions = {}): C {
  const min = opts.minDuration ?? FABULA_MIN_CLIP_SEC;
  const nd = Math.max(min, clip.duration - dt);
  let consumed = clip.duration - nd;
  let ns = Math.max(0, clip.start + consumed);
  const snapped = snapToTargets(ns, opts.snapTargets, opts.snapTolerance ?? FABULA_EDGE_SNAP_SEC);
  ns = snapped !== ns ? snapped : quantize(ns, opts.snap);
  consumed = ns - clip.start;
  return {
    ...clip,
    start: ns,
    duration: Math.max(min, clip.duration - consumed),
    srcIn: Math.max(0, quantize((clip.srcIn ?? 0) + consumed, opts.snap)),
  };
}

/** Body drag: move a clip by `dt`, leading or trailing edge snapping to targets. */
export function moveClip<C extends EditClip>(clip: C, dt: number, opts: TrimOptions = {}): C {
  const raw = Math.max(0, clip.start + dt);
  const tol = opts.snapTolerance ?? FABULA_EDGE_SNAP_SEC;
  let best = raw;
  let bestD = tol;
  for (const p of opts.snapTargets ?? []) {
    const dLead = Math.abs(raw - p);
    if (dLead < bestD) { bestD = dLead; best = p; }
    const dTrail = Math.abs(raw + clip.duration - p);
    if (dTrail < bestD) { bestD = dTrail; best = p - clip.duration; }
  }
  return { ...clip, start: Math.max(0, best === raw ? quantize(raw, opts.snap) : best) };
}

/** Ripple: shift every clip that starts after `after` by `delta` (Fabula ripple trim). */
export function rippleAfter<C extends EditClip>(clips: readonly C[], after: number, delta: number, step?: number): C[] {
  return clips.map(c => (c.start > after ? { ...c, start: Math.max(0, quantize(c.start + delta, step)) } : c));
}

/** Lay clips end to end from `from` in the given order (a gapless, rippled sequence). */
export function packSequential<C extends EditClip>(clips: readonly C[], from = 0): C[] {
  let t = from;
  return clips.map(c => { const out = { ...c, start: t }; t += c.duration; return out; });
}
