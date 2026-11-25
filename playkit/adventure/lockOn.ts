// playkit/adventure/lockOn.ts
//
// Lock-on targeting (the Z-target pattern) for any third-person action/adventure game. Pure math on the
// ground plane: pick the best target in front of the player, cycle to the next, drop it when out of range.
// Convention: yaw 0 faces +Z; forward = (sin yaw, cos yaw).

export interface Targetable { id: string; x: number; z: number; alive: boolean }
export interface LockOnOptions { range?: number; /** half-angle of the front cone, radians */ cone?: number; /** keep a lock this far */ keepRange?: number }

const angleDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** Score: closer and more centred is better; null when nothing is in the cone and range. */
export function pickTarget<T extends Targetable>(px: number, pz: number, yaw: number, list: readonly T[], o: LockOnOptions = {}): T | null {
  const range = o.range ?? 16, cone = o.cone ?? Math.PI * 0.6;
  let best: T | null = null, bestScore = Infinity;
  for (const t of list) {
    if (!t.alive) continue;
    const dx = t.x - px, dz = t.z - pz, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const off = Math.abs(angleDiff(Math.atan2(dx, dz), yaw));
    if (off > cone && d > 2.5) continue; // something right on top of you counts from any side
    const score = d / range + off / Math.PI;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  return best;
}

/** Next target clockwise around the player from the current one (within range). */
export function cycleTarget<T extends Targetable>(current: T | null, px: number, pz: number, list: readonly T[], o: LockOnOptions = {}): T | null {
  const range = o.range ?? 16;
  const live = list.filter((t) => t.alive && Math.hypot(t.x - px, t.z - pz) <= range);
  if (!live.length) return null;
  const ang = (t: T) => Math.atan2(t.x - px, t.z - pz);
  live.sort((a, b) => ang(a) - ang(b));
  if (!current) return live[0];
  const i = live.findIndex((t) => t.id === current.id);
  return live[(i + 1) % live.length];
}

/** Is the lock still valid? */
export function keepLock(t: Targetable | null, px: number, pz: number, o: LockOnOptions = {}): boolean {
  return !!t && t.alive && Math.hypot(t.x - px, t.z - pz) <= (o.keepRange ?? (o.range ?? 16) * 1.4);
}

/** Yaw that faces from (px,pz) to the target. */
export const yawTo = (px: number, pz: number, t: { x: number; z: number }) => Math.atan2(t.x - px, t.z - pz);
