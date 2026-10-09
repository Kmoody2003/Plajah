// Proximity with pointer speed. Pure: feed it pointer samples, ask it what to fire.
import type { Trigger } from '../contracts';

export type ProximityTrigger = Extract<Trigger, { type: 'proximity' }>;

/** Smoothed pointer speed in client px/s from timestamped samples. */
export class SpeedTracker {
  private lastX = 0; private lastY = 0; private lastT = 0; private v = 0; private has = false;
  /** Feed a sample (client px, ms). Returns the smoothed speed. */
  push(x: number, y: number, t: number): number {
    if (!this.has) { this.lastX = x; this.lastY = y; this.lastT = t; this.has = true; this.v = 0; return 0; }
    const dt = t - this.lastT;
    if (dt <= 0) return this.v;
    const inst = Math.hypot(x - this.lastX, y - this.lastY) / dt * 1000;
    // After a long pause the pointer had effectively stopped, so the next move starts from (near) rest.
    this.v = dt > 180 ? inst * Math.min(1, 90 / dt) : this.v + (inst - this.v) * Math.min(1, dt / 45);
    this.lastX = x; this.lastY = y; this.lastT = t;
    return this.v;
  }
  get speed() { return this.v; }
  reset() { this.has = false; this.v = 0; }
}

/** Distance from a point to a box (0 inside). */
export const distToBox = (px: number, py: number, b: { x: number; y: number; w: number; h: number }) => {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w)), dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  return Math.hypot(dx, dy);
};

/** Does this sample satisfy the trigger's speed condition? slowBelow / fastAbove are px/s; with neither set it always does. */
export function speedOk(t: ProximityTrigger, speed: number): boolean {
  if (t.slowBelow !== undefined && t.fastAbove !== undefined) return speed <= t.slowBelow || speed >= t.fastAbove;
  if (t.slowBelow !== undefined) return speed <= t.slowBelow;
  if (t.fastAbove !== undefined) return speed >= t.fastAbove;
  return true;
}

/**
 * Per-behaviour proximity state machine. It fires AT MOST once per approach; leaving the radius re-arms it.
 * Siblings on the same target share an approach: when one fires the others are disarmed (see `disarm`).
 */
export class ProximityGate {
  armed = true;
  inside = false;
  /** Returns true when the behaviour should fire for this sample. */
  update(t: ProximityTrigger, distance: number, speed: number): boolean {
    this.inside = distance <= t.radius;
    if (!this.inside) { this.armed = true; return false; }
    if (!this.armed) return false;
    if (!speedOk(t, speed)) return false;
    this.armed = false;
    return true;
  }
  disarm() { this.armed = false; }
}
