import * as THREE from 'three';
import { PHYSICS } from './constants';

export interface BallTrajectory {
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  velocity: THREE.Vector3;
  flightTime: number;
  totalTime: number;
  isBullet: boolean;
  isKick?: boolean;
  active: boolean;
}

export class FootballPhysics {
  public ballMesh: THREE.Mesh;
  public trajectory: BallTrajectory | null = null;
  public inFlight: boolean = false;
  public isGrounded: boolean = false;
  private currentPos: THREE.Vector3 = new THREE.Vector3();
  private currentVel: THREE.Vector3 = new THREE.Vector3();
  private spinRate: number = 25.0; // radians/sec spiral spin
  private flameGroup: THREE.Group | null = null;
  private flameActive: boolean = false;
  private flamePulse: number = 0;

  constructor(ballMesh: THREE.Mesh) {
    this.ballMesh = ballMesh;
    this.ballMesh.visible = false;
  }

  private ensureFlameTrail(): void {
    if (this.flameGroup) return;
    const grp = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 1.35, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffd000,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.z = -0.68;
    grp.add(core);

    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 2.05, 10),
      new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.z = -0.95;
    grp.add(outer);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff7b00,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    grp.add(halo);

    grp.visible = false;
    this.ballMesh.add(grp);
    this.flameGroup = grp;
  }

  public setFlameTrail(enabled: boolean): void {
    this.flameActive = enabled;
    if (enabled) {
      this.ensureFlameTrail();
    }
    if (this.flameGroup) {
      this.flameGroup.visible = enabled;
    }
  }

  public launchPass(
    from: THREE.Vector3,
    to: THREE.Vector3,
    isBullet: boolean = true,
    velocityScale: number = 1.0
  ): number {
    this.inFlight = true;
    this.isGrounded = false;
    this.ballMesh.visible = true;
    this.currentPos.copy(from);
    this.ballMesh.position.copy(from);

    const displacement = new THREE.Vector3().subVectors(to, from);
    const distanceXZ = Math.hypot(displacement.x, displacement.z);

    // Speed calculation
    const safeScale = Math.max(0.5, velocityScale);
    const baseSpeed = (isBullet ? PHYSICS.BULLET_PASS_SPEED : PHYSICS.LOB_PASS_SPEED) * safeScale;
    const estimatedTime = Math.max(0.45, distanceXZ / baseSpeed);

    // Physics kinematic equations for initial velocity:
    // x = x0 + vx * t  =>  vx = dx / t
    // z = z0 + vz * t  =>  vz = dz / t
    // y = y0 + vy * t + 0.5 * g * t^2  =>  vy = (dy - 0.5 * g * t^2) / t
    const vx = displacement.x / estimatedTime;
    const vz = displacement.z / estimatedTime;
    const vy = (displacement.y - 0.5 * PHYSICS.GRAVITY * estimatedTime * estimatedTime) / estimatedTime;

    this.currentVel.set(vx, vy, vz);

    this.trajectory = {
      startPos: from.clone(),
      targetPos: to.clone(),
      velocity: this.currentVel.clone(),
      flightTime: 0,
      totalTime: estimatedTime,
      isBullet,
      isKick: false,
      active: true,
    };

    return estimatedTime;
  }

  public launchKick(
    from: THREE.Vector3,
    targetX: number,
    targetZ: number,
    targetY: number,
    totalTime: number
  ): number {
    this.setFlameTrail(false);
    this.inFlight = true;
    this.isGrounded = false;
    this.ballMesh.visible = true;
    this.currentPos.copy(from);
    this.ballMesh.position.copy(from);

    const to = new THREE.Vector3(targetX, targetY, targetZ);
    const duration = Math.max(0.6, totalTime);
    const displacement = new THREE.Vector3().subVectors(to, from);

    const vx = displacement.x / duration;
    const vz = displacement.z / duration;
    const vy = (displacement.y - 0.5 * PHYSICS.GRAVITY * duration * duration) / duration;

    this.currentVel.set(vx, vy, vz);

    this.trajectory = {
      startPos: from.clone(),
      targetPos: to,
      velocity: this.currentVel.clone(),
      flightTime: 0,
      totalTime: duration,
      isBullet: false,
      isKick: true,
      active: true,
    };

    return duration;
  }

  public update(delta: number): {
    arrived: boolean;
    hitGround: boolean;
    position: THREE.Vector3;
  } {
    if (!this.inFlight || !this.trajectory) {
      return { arrived: false, hitGround: false, position: this.ballMesh.position };
    }

    const t = Math.min(this.trajectory.totalTime, this.trajectory.flightTime + Math.max(0, delta));
    this.trajectory.flightTime = t;
    this.currentPos.copy(this.trajectory.startPos).addScaledVector(this.trajectory.velocity, t);
    this.currentPos.y += 0.5 * PHYSICS.GRAVITY * t * t;
    this.currentVel.copy(this.trajectory.velocity);
    this.currentVel.y += PHYSICS.GRAVITY * t;
    this.ballMesh.position.copy(this.currentPos);

    // Realistic ball alignment: spiral for passes, end-over-end tumble for kicks
    if (this.currentVel.lengthSq() > 0.1) {
      const dir = this.currentVel.clone().normalize();
      const targetLook = this.currentPos.clone().add(dir);
      this.ballMesh.lookAt(targetLook);
      if (this.trajectory.isKick) {
        this.ballMesh.rotateX(14.0 * this.trajectory.flightTime);
      } else {
        this.ballMesh.rotateZ(
          this.spinRate * this.trajectory.flightTime * (this.trajectory.isBullet ? 1.5 : 1.0)
        );
      }
    }

    // Animate arcade flame trail
    if (this.flameActive && this.flameGroup) {
      this.flamePulse += delta * 26;
      const scalePulse = 0.88 + Math.sin(this.flamePulse) * 0.18;
      this.flameGroup.scale.set(scalePulse, scalePulse, 0.92 + Math.cos(this.flamePulse * 1.3) * 0.22);
    }

    // Ground collision check
    if (this.currentPos.y <= 0.2) {
      this.currentPos.y = 0.2;
      this.inFlight = false;
      this.isGrounded = true;
      this.ballMesh.position.y = 0.2;
      this.setFlameTrail(false);
      return { arrived: false, hitGround: true, position: this.currentPos };
    }

    // Check if reached destination vicinity
    if (this.trajectory.flightTime >= this.trajectory.totalTime) {
      return { arrived: true, hitGround: false, position: this.currentPos };
    }

    return { arrived: false, hitGround: false, position: this.currentPos };
  }

  public attachToPlayer(pos: THREE.Vector3, rightHandOffset: THREE.Vector3): void {
    this.inFlight = false;
    this.isGrounded = false;
    this.setFlameTrail(false);
    this.ballMesh.visible = true;
    this.ballMesh.position.copy(pos).add(rightHandOffset);
    this.ballMesh.rotation.set(0.4, 0.4, 0.2);
  }

  public hide(): void {
    this.inFlight = false;
    this.setFlameTrail(false);
    this.ballMesh.visible = false;
  }
}
