// 1st / 3rd-person Soul Vessel controller with swappable classes, capsule physics, touch & gamepad.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import type { InputState } from './controls';
import { VESSELS, VESSEL_ORDER, buildVesselMesh, type VesselId, type VesselSpec } from './vessels';

const ACCEL = 28;
const DECEL = 22;
const JUMP_VEL = 9.2;
const RADIUS = 0.38;
const HEIGHT = 1.8;
const MOUSE_SENS = 0.002;

export class PlayerController {
  readonly object = new THREE.Group();
  vesselMesh = new THREE.Group();
  readonly viewmodel = new THREE.Group();
  private viewmodelRail: THREE.Mesh | null = null;

  vessel: VesselSpec = VESSELS.aegis;
  yaw = 0;
  pitch = -0.08;
  firstPerson = false;

  private camDist = 3.6;
  private vel = new THREE.Vector3();
  private vy = 0;
  private onGround = true;
  private dashTimer = 0;
  private dashDir = new THREE.Vector3();
  private keys = new Set<string>();
  private lastSafe = new THREE.Vector3(0, 0.2, 8);
  private muzzleFlash = 0;

  world: CollisionWorld | null = null;
  enabled = false;
  hp = 130;
  maxHp = 130;

  onToggleView?: (fp: boolean) => void;
  onDash?: () => void;
  onSwitchVessel?: (spec: VesselSpec) => void;
  onSoulSurge?: () => void;
  onStrike?: () => void;

  constructor(private camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.object.position.copy(this.lastSafe);
    this.buildViewmodel();
    this.camera.add(this.viewmodel);
    this.viewmodel.visible = false;
    this.setVessel('aegis');

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'KeyV') this.toggleView();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.triggerDash();
      if (e.code === 'KeyQ') this.onSoulSurge?.();
      if (e.code === 'KeyF' || e.code === 'KeyE') this.onStrike?.();
      if (e.code === 'Digit1') this.setVessel('aegis');
      if (e.code === 'Digit2') this.setVessel('stalker');
      if (e.code === 'Digit3') this.setVessel('seraph');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    dom.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * MOUSE_SENS;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * MOUSE_SENS, -1.25, 1.25);
    });
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.vesselMesh.visible = !this.firstPerson;
    this.viewmodel.visible = this.firstPerson;
    this.onToggleView?.(this.firstPerson);
  }

  cycleVessel() {
    const idx = VESSEL_ORDER.indexOf(this.vessel.id);
    const next = VESSEL_ORDER[(idx + 1) % VESSEL_ORDER.length];
    this.setVessel(next);
  }

  setVessel(id: VesselId) {
    const spec = VESSELS[id];
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.vessel = spec;
    this.maxHp = spec.maxHp;
    this.hp = Math.max(1, Math.round(spec.maxHp * hpRatio));

    this.object.remove(this.vesselMesh);
    this.vesselMesh = buildVesselMesh(spec);
    this.vesselMesh.visible = !this.firstPerson;
    this.object.add(this.vesselMesh);

    if (this.viewmodelRail) {
      const mat = this.viewmodelRail.material as THREE.MeshStandardNodeMaterial;
      mat.color.setHex(spec.primaryColor);
      mat.emissive.setHex(spec.primaryColor);
    }

    this.onSwitchVessel?.(spec);
  }

  private buildViewmodel() {
    const gunMat = new THREE.MeshStandardNodeMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.25 });
    const glowMat = new THREE.MeshStandardNodeMaterial({
      color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.5,
    });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.52), gunMat);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.54), glowMat);
    rail.position.y = 0.05;
    this.viewmodelRail = rail;
    this.viewmodel.add(barrel, rail);
    this.viewmodel.position.set(0.26, -0.22, -0.45);
  }

  triggerMuzzleFlash() {
    this.muzzleFlash = 1;
  }

  private triggerDash(moveX = 0, moveY = 0) {
    if (this.dashTimer > 0) return;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const dir = new THREE.Vector3();
    if (this.keys.has('KeyW')) dir.add(forward);
    if (this.keys.has('KeyS')) dir.sub(forward);
    if (this.keys.has('KeyD')) dir.add(right);
    if (this.keys.has('KeyA')) dir.sub(right);
    if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
      dir.addScaledVector(right, moveX).addScaledVector(forward, moveY);
    }
    if (dir.lengthSq() < 0.01) dir.copy(forward);
    this.dashDir.copy(dir.normalize());
    this.dashTimer = 0.18;
    this.onDash?.();
  }

  /** World-space origin & direction for hitscan/projectile firing. */
  getAimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(dir);
    return { origin, dir };
  }

  getMuzzleWorldPos(): THREE.Vector3 {
    if (this.firstPerson) {
      return this.camera.localToWorld(new THREE.Vector3(0.22, -0.15, -0.65));
    }
    return this.object.localToWorld(new THREE.Vector3(0.32, 1.32, -0.45));
  }

  update(dt: number, pulse: number, input?: InputState) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();

    if (this.enabled) {
      if (input) {
        if (input.lookDeltaX || input.lookDeltaY) {
          this.yaw -= input.lookDeltaX * MOUSE_SENS;
          this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookDeltaY * MOUSE_SENS, -1.25, 1.25);
        }
        if (input.toggleViewPressed) this.toggleView();
        if (input.cycleVesselPressed) this.cycleVessel();
        if (input.dashPressed) this.triggerDash(input.moveX, input.moveY);
        if (input.surgePressed) this.onSoulSurge?.();
        if (input.strikePressed) this.onStrike?.();
        wish.addScaledVector(right, input.moveX).addScaledVector(forward, input.moveY);
      }

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) wish.add(forward);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) wish.sub(forward);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) wish.add(right);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) wish.sub(right);
      if (wish.lengthSq() > 1) wish.normalize();

      if ((this.keys.has('Space') || input?.jumpPressed) && this.onGround) {
        this.vy = JUMP_VEL;
        this.onGround = false;
      }
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(this.vessel.dashSpeed);
    } else {
      const target = wish.multiplyScalar(this.vessel.moveSpeed);
      const rate = wish.lengthSq() > 0 ? ACCEL : DECEL;
      this.vel.lerp(target, Math.min(1, rate * dt));
    }

    this.vy -= this.vessel.gravity * dt;
    this.object.position.addScaledVector(this.vel, dt);
    this.object.position.y += this.vy * dt;

    if (this.world) {
      const res = this.world.resolve(this.object.position, RADIUS, HEIGHT);
      if (res.onGround && this.vy < 0) this.vy = 0;
      this.onGround = res.onGround;
    }

    if (this.object.position.y < -12) {
      this.object.position.copy(this.lastSafe);
      this.vel.set(0, 0, 0);
      this.vy = 0;
    } else if (this.onGround) {
      this.lastSafe.copy(this.object.position);
    }

    this.object.rotation.y = this.yaw;
    this.vesselMesh.position.y = Math.sin(performance.now() * 0.004) * 0.05 + pulse * 0.04;

    const targetDist = this.firstPerson ? 0 : 3.6;
    this.camDist = THREE.MathUtils.lerp(this.camDist, targetDist, Math.min(1, dt * 14));

    const eyePos = this.object.position.clone().add(new THREE.Vector3(0, 1.58, 0));
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    if (this.camDist < 0.12) {
      this.camera.position.copy(eyePos);
      this.camera.lookAt(eyePos.clone().add(lookDir));
    } else {
      const shoulderOffset = right.clone().multiplyScalar(0.52);
      const pivot = eyePos.clone().add(shoulderOffset);
      const backDir = lookDir.clone().negate();
      const maxD = this.world ? this.world.rayDistance(pivot, backDir, this.camDist) - 0.15 : this.camDist;
      this.camera.position.copy(pivot).addScaledVector(backDir, Math.max(0.3, maxD));
      this.camera.lookAt(pivot.clone().addScaledVector(lookDir, 18));
    }

    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 8);
    this.viewmodel.position.z = -0.45 + this.muzzleFlash * 0.07;
  }
}
