// Drag math: pure. Offsets are relative to the object's REST position (0,0), in page units.
import type { Trigger } from '../contracts';

export type DragTrigger = Extract<Trigger, { type: 'drag' }>;
export interface Vec { x: number; y: number }
/** Page units of travel assumed when a drag has no bound on a side. */
export const DEFAULT_TRAVEL = 160;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Clamp a proposed offset to the axis lock and bounds. */
export function clampDrag(p: Vec, t: DragTrigger): Vec {
  const axis = t.axis ?? 'both'; const b = t.bounds ?? {};
  let x = axis === 'y' ? 0 : p.x, y = axis === 'x' ? 0 : p.y;
  x = clamp(x, b.minX ?? -Infinity, b.maxX ?? Infinity);
  y = clamp(y, b.minY ?? -Infinity, b.maxY ?? Infinity);
  return { x, y };
}

/** Travel available from rest in the direction `sign` (+1 / -1) on one axis. */
function travel(sign: number, lo: number | undefined, hi: number | undefined): number {
  if (sign >= 0) return hi === undefined ? DEFAULT_TRAVEL : Math.max(0, hi);
  return lo === undefined ? DEFAULT_TRAVEL : Math.max(0, -lo);
}

/** 0..1: how far along the available travel (in the direction moved) the offset is. This is the value written to `progressVar`. */
export function dragProgress(p: Vec, t: DragTrigger): number {
  const axis = t.axis ?? 'both'; const b = t.bounds ?? {};
  const tx = travel(p.x, b.minX, b.maxX), ty = travel(p.y, b.minY, b.maxY);
  const nx = axis === 'y' || tx <= 0 ? 0 : Math.abs(p.x) / tx;
  const ny = axis === 'x' || ty <= 0 ? 0 : Math.abs(p.y) / ty;
  return clamp(axis === 'both' ? Math.hypot(nx, ny) : Math.max(nx, ny), 0, 1);
}

/** The offset for a given progress along the dominant travel direction (keyboard "finish it for me", tests). */
export function offsetForProgress(progress: number, t: DragTrigger): Vec {
  const axis = t.axis ?? 'both'; const b = t.bounds ?? {};
  const p = clamp(progress, 0, 1);
  const sx = (b.maxX ?? DEFAULT_TRAVEL) >= -(b.minX ?? -DEFAULT_TRAVEL) ? 1 : -1;
  const sy = (b.maxY ?? DEFAULT_TRAVEL) >= -(b.minY ?? -DEFAULT_TRAVEL) ? 1 : -1;
  const x = axis === 'y' ? 0 : sx * travel(sx, b.minX, b.maxX) * p;
  const y = axis === 'x' ? 0 : sy * travel(sy, b.minY, b.maxY) * p;
  return clampDrag({ x, y }, t);
}

/** If the released offset is inside a snap point's radius, the index of that point (nearest wins); else -1. */
export function snapIndex(p: Vec, t: DragTrigger): number {
  let best = -1, bd = Infinity;
  (t.snapTo ?? []).forEach((s, i) => { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d <= s.r && d < bd) { bd = d; best = i; } });
  return best;
}

/** Where the object comes to rest after release: a snap point, the rest position (snapBack), or where it was dropped. */
export function releaseTarget(p: Vec, t: DragTrigger): { to: Vec; snapped: number; back: boolean } {
  const i = snapIndex(p, t);
  if (i >= 0) { const s = t.snapTo![i]; return { to: clampDrag({ x: s.x, y: s.y }, t), snapped: i, back: false }; }
  if (t.snapBack) return { to: { x: 0, y: 0 }, snapped: -1, back: true };
  return { to: p, snapped: -1, back: false };
}

/** Keyboard: nudge a fraction of the span along an arrow direction. */
export function nudge(p: Vec, key: string, t: DragTrigger, fraction = 0.08): Vec {
  const b = t.bounds ?? {};
  const spanX = b.minX !== undefined && b.maxX !== undefined ? b.maxX - b.minX : DEFAULT_TRAVEL * 2;
  const spanY = b.minY !== undefined && b.maxY !== undefined ? b.maxY - b.minY : DEFAULT_TRAVEL * 2;
  const n = { ...p };
  if (key === 'ArrowLeft') n.x -= spanX * fraction;
  else if (key === 'ArrowRight') n.x += spanX * fraction;
  else if (key === 'ArrowUp') n.y -= spanY * fraction;
  else if (key === 'ArrowDown') n.y += spanY * fraction;
  return clampDrag(n, t);
}
