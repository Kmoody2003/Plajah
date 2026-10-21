// Third-person controller: mouse-orbit camera that follows behind Jack, camera-relative
// movement with acceleration, capsule physics against the level BVH, and
// speed-matched locomotion blending (no foot-sliding pops between idle/walk/run).
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import type { Character } from './character';

const WALK = 1.6, RUN = 4.8;            // m/s
const ACCEL = 9, DECEL = 12;            // m/s² toward target speed
const TURN = 11;                        // rad/s body turn rate
const RADIUS = 0.32, HEIGHT = 1.8, GRAVITY = 24, STEP = 0.4;
const MOUSE = 0.0024;

export class PlayerController {
  readonly object = new THREE.Group();
  yaw = 0;                    // body facing (model +Z rotated by yaw)
  camYaw = 0;                 // camera orbit yaw (camera looks along -Z rotated by camYaw)
  camPitch = -0.15;
  camDist = 3.4;
  private vel = new THREE.Vector3();
  private vy = 0;
  private onGround = true;
  private lastMouse = -10;
  private time = 0;
  private lastSafe = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private dragging = false;
  readonly keys = new Set<string>();
  world: CollisionWorld | null = null;
  character: Character | null = null;
  enabled = true;

  constructor(private dom: HTMLElement) {
    addEventListener('keydown', (e) => { this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // Pointer lock where allowed (some embedded browsers refuse it — drag-to-look covers those).
    dom.addEventListener('click', () => {
      if (!this.enabled || document.pointerLockElement === dom) return;
      try { (dom.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* unsupported */ }
    });
    // Drag-to-look fallback when pointer lock is unavailable or released (Esc).
    dom.addEventListener('pointerdown', () => { this.dragging = true; });
    addEventListener('pointerup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== dom && !this.dragging) return;
      this.camYaw -= e.movementX * MOUSE;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - e.movementY * MOUSE, -1.1, 0.55);
      this.lastMouse = this.time;
    });
    dom.addEventListener('wheel', (e) => { this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.003, 1.6, 7); }, { passive: true });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Place the player (feet) and snap the camera behind. `yaw` = body facing. */
  teleport(pos: THREE.Vector3, yaw: number) {
    this.object.position.copy(pos);
    this.lastSafe.copy(pos);
    this.yaw = yaw;
    this.camYaw = yaw + Math.PI;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.camPos.set(NaN, NaN, NaN);
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    this.time += dt;
    const k = this.keys;
    const ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const iz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const running = k.has('ShiftLeft') || k.has('ShiftRight');

    // Desired horizontal velocity, relative to where the camera looks.
    const want = new THREE.Vector3();
    if (this.enabled && (ix || iz)) {
      const fwd = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      want.addScaledVector(fwd, iz).addScaledVector(right, ix).normalize().multiplyScalar(running ? RUN : WALK);
    }
    const dv = want.clone().sub(this.vel);
    const rate = (want.lengthSq() > this.vel.lengthSq() ? ACCEL : DECEL) * dt;
    if (dv.length() > rate) dv.setLength(rate);
    this.vel.add(dv);
    const speed = this.vel.length();

    // Body turns smoothly toward travel direction (shortest arc — no 180° snaps).
    if (speed > 0.15) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += THREE.MathUtils.clamp(diff, -TURN * dt, TURN * dt);
    }

    // Integrate + collide.
    const p = this.object.position;
    this.vy -= GRAVITY * dt;
    const next = p.clone().addScaledVector(this.vel, dt);
    next.y += this.vy * dt;
    if (this.world) {
      const r = this.world.resolve(next, RADIUS, HEIGHT);
      // Step-up: if a riser/kerb stopped us, try the move from STEP higher and settle down.
      const wantH = Math.hypot(this.vel.x, this.vel.z) * dt;
      const gotH = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
      if (this.onGround && wantH > 1e-3 && gotH < wantH * 0.6) {
        const up = p.clone().addScaledVector(this.vel, dt);
        up.y = p.y + STEP;
        const r2 = this.world.resolve(up, RADIUS, HEIGHT);
        // Probe under the capsule's leading edge too: at the riser the centre is still ~one
        // radius short of the tread, so the centre ray alone would find the lower floor.
        const lead = new THREE.Vector3(this.vel.x, 0, this.vel.z).setLength(RADIUS + 0.12);
        const gc = this.world.groundAt(r2.pos.x, r2.pos.z, r2.pos.y + 0.05, STEP + 0.1);
        const gl = this.world.groundAt(r2.pos.x + lead.x, r2.pos.z + lead.z, r2.pos.y + 0.05, STEP + 0.1);
        const g = gc === null ? gl : gl === null ? gc : Math.max(gc, gl);
        const got2 = Math.hypot(r2.pos.x - p.x, r2.pos.z - p.z);
        // Only a real rise counts: landing back on the same tread would sink us into the riser.
        if (g !== null && g - p.y > 0.02 && g - p.y <= STEP + 0.01 && got2 > gotH + 1e-3) {
          r.pos.set(r2.pos.x, g, r2.pos.z);
          r.onGround = true;
        }
      }
      next.copy(r.pos);
      this.onGround = r.onGround;
      // Stick to ramps/stairs going down instead of skipping off them.
      if (!this.onGround && this.vy <= 0) {
        const g = this.world.groundAt(next.x, next.z, next.y + 0.5, 0.95);
        if (g !== null && next.y - g < 0.45) { next.y = g; this.onGround = true; }
      }
    } else { next.y = Math.max(next.y, 0); this.onGround = next.y <= 0.001; }
    if (this.onGround) { this.vy = 0; this.lastSafe.copy(next); }
    if (next.y < -2.5) next.copy(this.lastSafe).add(new THREE.Vector3(0, 0.2, 0)); // fell in the moat
    p.copy(next);
    this.object.rotation.y = this.yaw;

    this.character?.setLocomotion(speed, WALK, RUN);

    // Camera: drift back behind Jack while moving if the mouse has been idle.
    if (speed > 0.5 && this.time - this.lastMouse > 1.2) {
      const behind = this.yaw + Math.PI;
      const d = Math.atan2(Math.sin(behind - this.camYaw), Math.cos(behind - this.camYaw));
      this.camYaw += d * Math.min(1, dt * 1.6);
    }
    const look = p.clone().add(new THREE.Vector3(0, 1.55, 0));
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      -Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    );
    const shoulder = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).multiplyScalar(0.45);
    const pivot = look.clone().add(shoulder);
    let dist = this.camDist;
    if (this.world) dist = Math.max(0.6, this.world.rayDistance(pivot, dir, this.camDist + 0.3) - 0.3);
    const want3 = pivot.clone().addScaledVector(dir, dist);
    if (!Number.isFinite(this.camPos.x)) { this.camPos.copy(want3); this.camLook.copy(look); }
    const a = 1 - Math.exp(-dt * 14);
    this.camPos.lerp(want3, a);
    // Never let smoothing drag the camera inside a wall.
    if (this.camPos.distanceTo(pivot) > dist + 0.05) this.camPos.copy(want3);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 20));
    camera.position.copy(this.camPos);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.camPitch, this.camYaw, 0);
    camera.fov = 50;
    camera.updateProjectionMatrix();
  }
}
