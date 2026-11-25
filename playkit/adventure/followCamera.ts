// playkit/adventure/followCamera.ts
//
// Third-person follow camera for adventure games. Free mode: the player orbits it (mouse / right stick)
// and, after a moment without camera input, it drifts back behind the way the player is walking.
// Lock-on mode: it swings behind the player so both the player and the target stay in frame.
// Canon: the camera never turns on its own while the player steers it.
// Convention: yaw 0 looks along +Z (forward = sin yaw, cos yaw).
import * as THREE from 'three';

export interface FollowCameraOptions { distance?: number; height?: number; minPitch?: number; maxPitch?: number; lookSensitivity?: number }

export class FollowCamera {
  yaw = Math.PI;
  pitch = 0.32;
  distance: number;
  height: number;
  minPitch: number; maxPitch: number;
  sens: number;
  private idle = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private first = true;

  constructor(readonly camera: THREE.PerspectiveCamera, o: FollowCameraOptions = {}) {
    this.distance = o.distance ?? 7.5;
    this.height = o.height ?? 1.6;
    this.minPitch = o.minPitch ?? -0.15;
    this.maxPitch = o.maxPitch ?? 1.1;
    this.sens = o.lookSensitivity ?? 0.0032;
  }

  /** Mouse/stick deltas in pixels. */
  addLook(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.yaw -= dx * this.sens;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + dy * this.sens));
    this.idle = 0;
  }

  /** Snap behind a facing (the "reset camera" button). */
  snapBehind(facingYaw: number) { this.yaw = facingYaw; this.idle = 0; }

  update(dt: number, target: THREE.Vector3, opts: { facingYaw: number; moving: boolean; lockTarget?: THREE.Vector3 | null; groundAt?: (x: number, z: number) => number; /** true where the camera may not sit (inside a wall, a tree crown) */ blocked?: (x: number, y: number, z: number) => boolean }) {
    this.idle += dt;
    const lerpAngle = (a: number, b: number, t: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
    if (opts.lockTarget) {
      const want = Math.atan2(opts.lockTarget.x - target.x, opts.lockTarget.z - target.z);
      this.yaw = lerpAngle(this.yaw, want, 1 - Math.exp(-dt * 6));
      this.pitch += (0.28 - this.pitch) * (1 - Math.exp(-dt * 4));
    } else if (opts.moving && this.idle > 1.2) {
      this.yaw = lerpAngle(this.yaw, opts.facingYaw, 1 - Math.exp(-dt * 0.9));
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // pull in along the boom until the spot is clear (and never let the boom pass through a wall)
    let dist = this.distance;
    if (opts.blocked) {
      // start past the player's own shoulder: something touching the player (a trunk, a wall) shouldn't
      // collapse the boom to nothing
      const minD = Math.min(2.4, this.distance);
      for (let d = minD; d <= this.distance; d += 0.35) {
        if (opts.blocked(target.x - fx * d * cp, target.y + this.height + sp * d, target.z - fz * d * cp)) { dist = Math.max(minD, d - 0.35); break; }
      }
    }
    const want = new THREE.Vector3(target.x - fx * dist * cp, target.y + this.height + sp * dist, target.z - fz * dist * cp);
    if (opts.groundAt) want.y = Math.max(want.y, opts.groundAt(want.x, want.z) + 0.6);
    const lookAt = new THREE.Vector3(target.x, target.y + this.height, target.z);
    if (opts.lockTarget) lookAt.lerp(new THREE.Vector3(opts.lockTarget.x, opts.lockTarget.y + 1, opts.lockTarget.z), 0.35);
    if (this.first) { this.pos.copy(want); this.look.copy(lookAt); this.first = false; }
    const k = 1 - Math.exp(-dt * 10);
    this.pos.lerp(want, k); this.look.lerp(lookAt, k);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  /** Movement on the ground relative to where the camera looks: stick (x right, y forward) → world. */
  toWorld(x: number, y: number): [number, number] {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // right of forward (with +Y up, camera looking +Z has screen-right at −X)
    const rx = -fz, rz = fx;
    return [fx * y + rx * x, fz * y + rz * x];
  }

  jump() { this.first = true; }
}
