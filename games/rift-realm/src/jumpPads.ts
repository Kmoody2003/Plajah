// Jump pads: step into one and it throws you on a fixed arc to a landing spot (the marsh's rift wells, the
// volcanic forge's vents, ...). A level lists its pads on Level.jumpPads; main.ts runs JumpPads.update each frame.
//
// The arc is solved from the player's own gravity (it falls 1.35x faster than it rises, player.ts), so every vessel
// lands on the same spot: rise to `apex` above the higher end, fall onto `to`. The flight is a player.lunge (fixed
// horizontal speed for the flight time) plus a player.hop, so it needs nothing new from the player.
import * as THREE from 'three/webgpu';

export interface JumpPad {
  /** Pad centre (on its surface). */
  pos: THREE.Vector3;
  /** Trigger radius (m, horizontal). */
  radius: number;
  /** Where the arc lands (on a floor). */
  to: THREE.Vector3;
  /** Height of the arc's top above the higher of the two ends (m). */
  apex: number;
  name?: string;
  /** Set to 1 on a launch and decays back to 0: a level drives its pad glow from it. */
  flash?: { value: number };
}

/** What a jump pad's player needs (player.ts has all of it). */
export interface PadRider {
  enabled: boolean;
  object: THREE.Object3D;
  vessel: { gravity: number };
  hop(vy: number): void;
  lunge(dir: THREE.Vector3, speed: number, time: number): void;
}

const FALL_MUL = 1.35; // player.ts: gravity is this much stronger on the way down

/** The launch for a pad: vertical speed, horizontal speed and flight time. */
export function padLaunch(pad: JumpPad, gravity: number) {
  const top = Math.max(pad.pos.y, pad.to.y) + pad.apex;
  const vy = Math.sqrt(2 * gravity * (top - pad.pos.y));
  const time = vy / gravity + Math.sqrt((2 * (top - pad.to.y)) / (gravity * FALL_MUL));
  const dist = Math.hypot(pad.to.x - pad.pos.x, pad.to.z - pad.pos.z);
  return { vy, speed: dist / time, time, top };
}

export class JumpPads {
  private cool = new Map<JumpPad, number>();
  private flying = 0;
  private dir = new THREE.Vector3();
  /** Launches so far (for checks: __rr.pads.launches). */
  launches = 0;

  constructor(readonly pads: JumpPad[]) {}

  update(dt: number, rider: PadRider, onLaunch?: (pad: JumpPad) => void) {
    this.flying = Math.max(0, this.flying - dt);
    for (const pad of this.pads) {
      if (pad.flash) pad.flash.value = Math.max(0, pad.flash.value - dt * 2.5);
      const c = Math.max(0, (this.cool.get(pad) ?? 0) - dt);
      this.cool.set(pad, c);
      if (!rider.enabled || c > 0 || this.flying > 0) continue;
      const p = rider.object.position;
      if (Math.hypot(p.x - pad.pos.x, p.z - pad.pos.z) > pad.radius || p.y < pad.pos.y - 0.6 || p.y > pad.pos.y + 1.2) continue;
      const l = padLaunch(pad, rider.vessel.gravity);
      this.dir.set(pad.to.x - pad.pos.x, 0, pad.to.z - pad.pos.z);
      // centre the rider on the pad so the arc lands where it was aimed
      p.x = pad.pos.x; p.z = pad.pos.z; p.y = Math.max(p.y, pad.pos.y);
      rider.hop(l.vy);
      if (l.speed > 0.05) rider.lunge(this.dir, l.speed, l.time);
      this.cool.set(pad, 0.8);
      this.flying = l.time;
      if (pad.flash) pad.flash.value = 1;
      this.launches++;
      onLaunch?.(pad);
      break;
    }
  }
}
