// Retracting Grappling Hook capability for agile Soul Vessels (Void Stalker & Sylva).
// Fires a glowing energy/vine tether to any solid surface within range, then actively retracts the cable,
// reeling the player smoothly toward the anchor with momentum and an automatic vault release at the top.
import * as THREE from 'three/webgpu';
import type { CollisionWorld } from './collision';
import type { VesselSpec } from './vessels';

export type GrapplePhase = 'idle' | 'shoot' | 'retract';

export interface GrappleStatus {
  available: boolean;
  phase: GrapplePhase;
  cooldown: number;
  maxCooldown: number;
  /** Distance to valid aimed anchor (null if out of range or no grapple on this vessel). */
  aimDist: number | null;
  label: string;
}

const SHOOT_SEC = 0.10;
const RELEASE_DIST = 2.4;
const MAX_RETRACT_SEC = 2.6;

export class GrappleHook {
  phase: GrapplePhase = 'idle';
  readonly anchor = new THREE.Vector3();
  readonly normal = new THREE.Vector3(0, 1, 0);
  private shootT = 0;
  private retractT = 0;
  private cd = 0;
  private maxCd = 2.0;
  private pullSpeed = 30;
  private range = 52;
  private colorHex = 0xd946ef;
  private label = 'VOID TETHER';
  private aimDist: number | null = null;

  // 3D glowing retracting cable + anchor claw visual
  readonly group = new THREE.Group();
  private cable: THREE.Mesh;
  private cableMat: THREE.MeshBasicNodeMaterial;
  private tip: THREE.Mesh;
  private tipMat: THREE.MeshBasicNodeMaterial;
  private ring: THREE.Mesh;
  private v = new THREE.Vector3();
  private mid = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private q = new THREE.Quaternion();

  constructor(scene: THREE.Scene) {
    this.group.name = 'grapple-hook';
    this.group.visible = false;

    const cyl = new THREE.CylinderGeometry(0.032, 0.022, 1, 8, 1, true);
    this.cableMat = new THREE.MeshBasicNodeMaterial({ color: this.colorHex, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    this.cable = new THREE.Mesh(cyl, this.cableMat);
    this.cable.frustumCulled = false;

    this.tipMat = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
    this.tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this.tipMat);
    this.tip.frustumCulled = false;

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), this.cableMat);
    this.ring.frustumCulled = false;

    this.group.add(this.cable, this.tip, this.ring);
    scene.add(this.group);
  }

  get active() { return this.phase !== 'idle'; }

  /** Refresh targetable distance indicator under crosshair for the active vessel. */
  probe(vessel: VesselSpec, origin: THREE.Vector3, dir: THREE.Vector3, world: CollisionWorld | null, rangeMul = 1): GrappleStatus {
    const g = vessel.grapple;
    if (!g) {
      this.aimDist = null;
      return { available: false, phase: 'idle', cooldown: 0, maxCooldown: 0, aimDist: null, label: '' };
    }
    this.range = g.range * rangeMul;
    this.pullSpeed = g.pullSpeed;
    this.maxCd = g.cooldown;
    this.colorHex = g.color;
    this.label = g.label;

    if (this.phase === 'idle' && world) {
      const hit = world.raycastHit(origin, dir, this.range);
      this.aimDist = hit && hit.distance >= 3.2 ? hit.distance : null;
    } else if (!world) {
      this.aimDist = null;
    }

    return {
      available: true,
      phase: this.phase,
      cooldown: Math.max(0, this.cd),
      maxCooldown: this.maxCd,
      aimDist: this.aimDist,
      label: this.label,
    };
  }

  /** Attempt to fire or detach the retracting grapple hook. */
  trigger(
    vessel: VesselSpec,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    world: CollisionWorld | null,
    rangeMul = 1,
  ): 'fired' | 'detached' | 'unsupported' | 'cooldown' | 'no_target' {
    if (this.phase !== 'idle') {
      this.cancel();
      return 'detached';
    }
    const g = vessel.grapple;
    if (!g) return 'unsupported';
    if (this.cd > 0) return 'cooldown';
    if (!world) return 'no_target';

    const maxRange = g.range * rangeMul;
    const hit = world.raycastHit(origin, dir, maxRange);
    if (!hit || hit.distance < 3.0) return 'no_target';

    this.anchor.copy(hit.point);
    this.normal.copy(hit.normal);
    this.range = maxRange;
    this.pullSpeed = g.pullSpeed;
    this.maxCd = g.cooldown;
    this.colorHex = g.color;
    this.label = g.label;
    this.phase = 'shoot';
    this.shootT = 0;
    this.retractT = 0;
    this.cableMat.color.setHex(g.color);
    this.tipMat.color.setHex(0xffffff);
    this.group.visible = true;
    return 'fired';
  }

  cancel(applyCooldown = true) {
    if (this.phase !== 'idle' && applyCooldown) {
      this.cd = Math.max(this.cd, this.maxCd * 0.65);
    }
    this.phase = 'idle';
    this.group.visible = false;
  }

  /**
   * Step the retracting cable & pull velocity.
   * Returns `{ pulling, velX, velY, velZ, arrived }` when active so player.ts applies clean movement + collision.
   */
  update(
    dt: number,
    vessel: VesselSpec,
    handWorldPos: THREE.Vector3,
    playerPos: THREE.Vector3,
  ): { pulling: boolean; vx: number; vy: number; vz: number; arrived: boolean } {
    this.cd = Math.max(0, this.cd - dt);
    if (this.phase === 'idle') return { pulling: false, vx: 0, vy: 0, vz: 0, arrived: false };

    // Cancel immediately if player switched to a vessel without a grapple hook
    if (!vessel.grapple) {
      this.cancel(false);
      return { pulling: false, vx: 0, vy: 0, vz: 0, arrived: false };
    }

    const bodyCenter = this.v.set(playerPos.x, playerPos.y + 1.15, playerPos.z);
    const toAnchor = new THREE.Vector3().subVectors(this.anchor, bodyCenter);
    const dist = toAnchor.length();

    if (this.phase === 'shoot') {
      this.shootT += dt;
      const frac = Math.min(1, this.shootT / SHOOT_SEC);
      const tipPos = new THREE.Vector3().lerpVectors(handWorldPos, this.anchor, frac);
      this.drawCable(handWorldPos, tipPos, frac >= 1);
      if (frac >= 1) {
        this.phase = 'retract';
        this.retractT = 0;
      }
      return { pulling: false, vx: 0, vy: 0, vz: 0, arrived: false };
    }

    // phase === 'retract': reel player toward the anchor point
    this.retractT += dt;
    this.drawCable(handWorldPos, this.anchor, true);

    if (dist <= RELEASE_DIST || this.retractT >= MAX_RETRACT_SEC) {
      this.phase = 'idle';
      this.cd = this.maxCd;
      this.group.visible = false;
      return { pulling: false, vx: 0, vy: 0, vz: 0, arrived: true };
    }

    const dir = toAnchor.divideScalar(Math.max(0.01, dist));
    // Smooth speed ramp + slight upward lift arc so you clear rock lips and deck rails cleanly
    const ramp = Math.min(1, 0.45 + this.retractT * 4.5);
    const spd = this.pullSpeed * ramp;
    const arcLift = Math.max(0, Math.min(4.5, (dist / 12) * 2.4));
    return {
      pulling: true,
      vx: dir.x * spd,
      vy: dir.y * spd + arcLift,
      vz: dir.z * spd,
      arrived: false,
    };
  }

  private drawCable(from: THREE.Vector3, to: THREE.Vector3, latched: boolean) {
    const delta = this.mid.subVectors(to, from);
    const len = Math.max(0.05, delta.length());
    this.cable.position.copy(from).addScaledVector(delta, 0.5);
    this.cable.scale.set(1, len, 1);
    this.q.setFromUnitVectors(this.up, delta.divideScalar(len));
    this.cable.quaternion.copy(this.q);

    this.tip.position.copy(to);
    this.tip.rotation.y += 0.25;
    this.ring.visible = latched;
    if (latched) {
      this.ring.position.copy(to).addScaledVector(this.normal, 0.06);
      this.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
      const pulse = 1 + Math.sin(performance.now() * 0.015) * 0.14;
      this.ring.scale.setScalar(pulse);
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}
