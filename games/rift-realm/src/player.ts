// 1st / 3rd-person Soul Vessel controller with swappable classes, capsule physics, touch & gamepad.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import type { InputState } from './controls';
import { assets, CharacterRig } from './characters';
import { VESSELS, VESSEL_ORDER, buildVesselMesh, type VesselId, type VesselSpec } from './vessels';

// Feel: fast, nimble, upbeat. Snappy ground control, full air control at a lower rate,
// double jump, coyote time + jump buffer, and dash charges so movement chains.
const ACCEL = 62;          // ground: reach top speed in ~0.08 s
const DECEL = 44;
const AIR_ACCEL = 26;      // still steerable mid-air
const JUMP_VEL = 10.8;
const DOUBLE_JUMP_VEL = 9.6;
const COYOTE = 0.12;       // can still jump this long after leaving a ledge
const JUMP_BUFFER = 0.14;  // a jump pressed this early before landing still fires
const DASH_TIME = 0.16;
const DASH_CHARGES = 2;
const DASH_RECHARGE = 0.9; // seconds per charge
const DASH_CARRY = 0.55;   // fraction of dash speed kept as momentum afterwards
const BASE_FOV = 72; // matches the camera main.ts creates
const RADIUS = 0.38;
const HEIGHT = 1.8;
const MOUSE_SENS = 0.002;

export class PlayerController {
  readonly object = new THREE.Group();
  vesselMesh = new THREE.Group();
  private rig: CharacterRig | null = null;
  readonly viewmodel = new THREE.Group();
  private viewmodelRail: THREE.Mesh | null = null;

  vessel: VesselSpec = VESSELS.aegis;
  yaw = 0;
  pitch = -0.08;
  firstPerson = false;

  private camDist = 3.6;
  private thirdDist = 3.6;
  private boom = 3.6;                       // collision-limited boom length: snaps in, eases back out
  private follow = new THREE.Vector3();     // eased camera pivot (smooths stair steps and landings)
  private followInit = false;
  mouseSens = (() => { try { return Number(localStorage.getItem('rift-realm-mouse-sens')) || 1; } catch { return 1; } })();
  private vel = new THREE.Vector3();
  private vy = 0;
  private onGround = true;
  private dashTimer = 0;
  private dashDir = new THREE.Vector3();
  private dashCharges = DASH_CHARGES;
  private dashRecharge = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private airJumps = 1;
  private spaceHeld = false;
  private lean = 0;
  private landKick = 0;
  private keys = new Set<string>();
  private lastSafe = new THREE.Vector3(0, 0.2, 8);
  private muzzleFlash = 0;

  world: CollisionWorld | null = null;
  enabled = false;
  /** Aiming down sights (hold right mouse): zoomed view, tighter shots, slower look and move. */
  aiming = false;
  /** 0…1, eased toward `aiming` — the camera, look speed and the reticle follow it. */
  aimBlend = 0;
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
      if (e.code === 'KeyF' || e.code === 'KeyE') { this.strikeAnim(); this.onStrike?.(); }
      if (e.code === 'Digit1') this.setVessel('aegis');
      if (e.code === 'Digit2') this.setVessel('stalker');
      if (e.code === 'Digit3') this.setVessel('seraph');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    dom.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== dom) return;
      // pointer-lock glitch spikes (a jump of 90+ px in one event) are dropped, as in Ravencrest
      if (Math.abs(e.movementX) > 90 || Math.abs(e.movementY) > 90) return;
      const ads = 1 - this.aimBlend * 0.45;
      this.yaw -= e.movementX * MOUSE_SENS * this.mouseSens * ads;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * MOUSE_SENS * this.mouseSens * 0.85 * ads, -1.25, 1.25);
    });
    // mouse wheel sets the 3rd-person camera distance (Ravencrest: 1.6 to 7 m)
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled || this.firstPerson) return;
      this.thirdDist = THREE.MathUtils.clamp(this.thirdDist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 1.6, 7);
    }, { passive: true });
    // - / = step the mouse sensitivity (saved), the shared scheme across the Plajah action games
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Minus' && e.code !== 'Equal') return;
      this.mouseSens = THREE.MathUtils.clamp(this.mouseSens * (e.code === 'Equal' ? 1.2 : 1 / 1.2), 0.3, 2.5);
      try { localStorage.setItem('rift-realm-mouse-sens', String(this.mouseSens)); } catch { /* private mode */ }
    });
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.camDist = this.boom = this.firstPerson ? 0 : this.thirdDist; // cut straight to the new view, no dolly
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
    if (assets.stalker) {
      // the Void Stalker is the playable body for every vessel class; the class sets stats + weapon
      if (!this.rig) {
        this.rig = new CharacterRig(assets.stalker, 1.9);
        const wrap = new THREE.Group();
        this.rig.root.rotation.y = Math.PI; // rig faces +Z, the player's forward is -Z
        wrap.add(this.rig.root);
        this.vesselMesh = wrap;
      }
    } else {
      this.vesselMesh = buildVesselMesh(spec);
    }
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

  /** Place the player at a spawn point facing `yaw`. */
  spawnAt(pos: THREE.Vector3, yaw: number) {
    this.object.position.copy(pos);
    this.lastSafe.copy(pos);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.vy = 0;
  }

  private strikeN = 0;
  /** Melee strikes alternate the motion-captured slashes (leap slash, spin-arc slash). */
  private strikeAnim() { this.rig?.play(this.strikeN++ % 2 ? 'attack_3' : 'attack_1', 0.85); }

  triggerMuzzleFlash() {
    this.muzzleFlash = 1;
    this.rig?.play('shoot', 0.9);
  }

  /** Dash charges left (0..2) and the refill progress of the next one (0..1), for the HUD. */
  get dashState() { return { charges: this.dashCharges, max: DASH_CHARGES, refill: this.dashRecharge / DASH_RECHARGE }; }

  private triggerDash(moveX = 0, moveY = 0) {
    if (this.dashTimer > 0 || this.dashCharges <= 0) return;
    this.dashCharges--;
    this.rig?.play('dash', 0.85); // the motion-captured sprint-lunge
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
    this.dashTimer = DASH_TIME;
    if (this.vy < 0) this.vy = 0; // an air dash hangs instead of dropping
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
          this.yaw -= input.lookDeltaX * MOUSE_SENS * this.mouseSens;
          this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookDeltaY * MOUSE_SENS * this.mouseSens * 0.85, -1.25, 1.25);
        }
        if (input.toggleViewPressed) this.toggleView();
        if (input.cycleVesselPressed) this.cycleVessel();
        if (input.dashPressed) this.triggerDash(input.moveX, input.moveY);
        if (input.surgePressed) this.onSoulSurge?.();
        if (input.strikePressed) { this.strikeAnim(); this.onStrike?.(); }
        wish.addScaledVector(right, input.moveX).addScaledVector(forward, input.moveY);
      }

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) wish.add(forward);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) wish.sub(forward);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) wish.add(right);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) wish.sub(right);
      if (wish.lengthSq() > 1) wish.normalize();

      // edge-triggered jump (held Space doesn't bunny-hop by itself), buffered so early presses count
      const space = this.keys.has('Space');
      if ((space && !this.spaceHeld) || input?.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
      this.spaceHeld = space;
    }

    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0) {
      if (this.coyote > 0) {
        this.vy = JUMP_VEL;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.onGround = false;
      } else if (this.airJumps > 0) {
        this.vy = DOUBLE_JUMP_VEL;
        this.airJumps--;
        this.jumpBuffer = 0;
        this.rig?.play('attack_2', 0.6); // flip-ish flourish on the double jump
      }
    }

    // dash charges refill one at a time
    if (this.dashCharges < DASH_CHARGES) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= DASH_RECHARGE) { this.dashRecharge = 0; this.dashCharges++; }
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel.copy(this.dashDir).multiplyScalar(this.vessel.dashSpeed);
      if (this.dashTimer <= 0) this.vel.multiplyScalar(DASH_CARRY); // keep the momentum, don't stop dead
    } else {
      const target = wish.multiplyScalar(this.vessel.moveSpeed * (1 - this.aimBlend * 0.4));
      const moving = wish.lengthSq() > 0;
      const rate = this.onGround ? (moving ? ACCEL : DECEL) : (moving ? AIR_ACCEL : 2);
      this.vel.lerp(target, Math.min(1, rate * dt));
    }

    this.vy -= this.vessel.gravity * dt * (this.vy < 0 ? 1.35 : 1); // falls faster than it rises: snappy arcs
    // sub-step so a 34 m/s dash can't tunnel through a thin wall (≤ 0.25 m per collision pass)
    const travel = Math.hypot(this.vel.x * dt, this.vy * dt, this.vel.z * dt);
    const steps = this.world ? Math.min(6, Math.max(1, Math.ceil(travel / 0.25))) : 1;
    const wasAir = !this.onGround;
    const fallVy = this.vy;
    let grounded = false;
    for (let s = 0; s < steps; s++) {
      this.object.position.addScaledVector(this.vel, dt / steps);
      this.object.position.y += (this.vy * dt) / steps;
      if (this.world) {
        const res = this.world.resolve(this.object.position, RADIUS, HEIGHT);
        if (res.onGround && this.vy < 0) this.vy = 0;
        grounded = res.onGround;
      }
    }

    if (this.world) {
      this.onGround = grounded;
      if (this.onGround) {
        this.airJumps = 1;
        if (wasAir && fallVy < -6) this.landKick = Math.min(1, -fallVy / 22);
        if (wasAir && fallVy < -13) this.rig?.play('land', 0.85); // the Void Stalker's crouched landing (motion video)
      }
    }

    if (this.object.position.y < -12) {
      this.object.position.copy(this.lastSafe);
      this.vel.set(0, 0, 0);
      this.vy = 0;
    } else if (this.onGround) {
      this.lastSafe.copy(this.object.position);
    }

    this.object.rotation.y = this.yaw;
    if (this.rig) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const lx = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
      const lz = -(this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw));
      this.rig.update(dt, sp, lx, lz);
    } else {
      this.vesselMesh.position.y = Math.sin(performance.now() * 0.004) * 0.05 + pulse * 0.04;
    }

    this.aimBlend = THREE.MathUtils.lerp(this.aimBlend, this.aiming && this.enabled ? 1 : 0, Math.min(1, dt * 14));
    // aiming pulls the 3rd-person camera in over the shoulder
    const targetDist = this.firstPerson ? 0 : THREE.MathUtils.lerp(this.thirdDist, Math.min(this.thirdDist, 1.7), this.aimBlend);
    this.camDist = THREE.MathUtils.lerp(this.camDist, targetDist, Math.min(1, dt * 14));

    // speed feel: FOV opens with speed and kicks on a dash; a little lean into strafes; landing dip
    const hsp = Math.hypot(this.vel.x, this.vel.z);
    const fovTarget = THREE.MathUtils.lerp(BASE_FOV + Math.min(12, hsp * 0.55) + (this.dashTimer > 0 ? 6 : 0), BASE_FOV * 0.6, this.aimBlend);
    if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fovTarget, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }
    const strafeSpeed = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    this.lean = THREE.MathUtils.lerp(this.lean, -strafeSpeed * 0.006, Math.min(1, dt * 8));
    this.landKick = Math.max(0, this.landKick - dt * 5);

    // the camera pivot eases after the body (Ravencrest: 1-exp(-dt*16), snaps if it falls 2.5 m behind),
    // so stair steps and landings don't jolt the view; first person stays locked to the eyes
    const rawEye = this.object.position.clone().add(new THREE.Vector3(0, 1.58 - this.landKick * 0.18, 0));
    if (!this.followInit || this.follow.distanceTo(rawEye) > 2.5 || this.firstPerson) { this.follow.copy(rawEye); this.followInit = true; }
    else this.follow.lerp(rawEye, 1 - Math.exp(-dt * 18));
    const eyePos = this.firstPerson ? rawEye : this.follow.clone().setX(rawEye.x).setZ(rawEye.z); // ease height only: aim stays exact
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
      const maxD = this.world ? this.world.rayDistance(pivot, backDir, this.camDist) - 0.3 : this.camDist;
      // a wall behind pulls the boom in at once; it eases back out (no popping)
      this.boom = maxD < this.boom ? maxD : THREE.MathUtils.lerp(this.boom, maxD, Math.min(1, dt * 3));
      this.camera.position.copy(pivot).addScaledVector(backDir, Math.max(0.3, this.boom));
      this.camera.lookAt(pivot.clone().addScaledVector(lookDir, 18));
    }
    this.camera.rotateZ(this.lean);

    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt * 8);
    this.viewmodel.position.z = -0.45 + this.muzzleFlash * 0.07;
  }
}
