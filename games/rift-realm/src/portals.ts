// Map portals: walk into one and the game travels to another level (the Void Sanctum hub's portals to the maps).
// A level lists them on Level.portals; main.ts runs Portals.update. Travel is a reload onto ?level=<id>&menu=0
// (the menus are skipped: you already chose a vessel), carrying the vessel along as ?vessel=.
import * as THREE from 'three/webgpu';

export interface Portal {
  /** Centre of the portal's opening, on the floor. */
  pos: THREE.Vector3;
  /** Trigger radius (m, horizontal). */
  radius: number;
  /** ?level= of the destination. */
  level: string;
  name: string;
  /** 0..1 while you stand in it (a level drives the portal's flare from it). */
  charge?: { value: number };
}

const DWELL = 0.6;

export class Portals {
  private t = 0;
  private going = false;
  constructor(readonly portals: Portal[], private vessel?: () => string, private onTravel?: (p: Portal) => void) {}

  update(dt: number, pos: THREE.Vector3, enabled: boolean) {
    if (this.going) return;
    let inside: Portal | null = null;
    for (const p of this.portals) if (enabled && Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < p.radius && Math.abs(pos.y - p.pos.y) < 2) inside = p;
    this.t = inside ? this.t + dt : 0;
    for (const p of this.portals) if (p.charge) p.charge.value = p === inside ? Math.min(1, this.t / DWELL) : Math.max(0, p.charge.value - dt * 3);
    if (inside && this.t >= DWELL) { this.going = true; this.onTravel?.(inside); travelTo(inside.level, this.vessel?.()); }
  }
}

/** Reload onto another level, keeping the debug / quality flags and the vessel. */
export function travelTo(level: string, vessel?: string) {
  const u = new URL(location.href);
  u.searchParams.set('level', level);
  u.searchParams.set('menu', '0');
  u.searchParams.delete('trials');
  if (vessel) u.searchParams.set('vessel', vessel);
  location.href = u.toString();
}
