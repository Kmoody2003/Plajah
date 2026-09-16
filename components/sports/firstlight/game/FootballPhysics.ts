import * as THREE from 'three';
import { PHYSICS } from './constants';

export interface BallTrajectory {
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  velocity: THREE.Vector3;
  flightTime: number;
  totalTime: number;
  isBullet: boolean;
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

  constructor(ballMesh: THREE.Mesh) {
    this.ballMesh = ballMesh;
    this.ballMesh.visible = false;
  }

  public launchPass(
    from: THREE.Vector3,
    to: THREE.Vector3,
    isBullet: boolean = true
  ): number {
    this.inFlight = true;
    this.isGrounded = false;
    this.ballMesh.visible = true;
    this.currentPos.copy(from);
    this.ballMesh.position.copy(from);

    const displacement = new THREE.Vector3().subVectors(to, from);
    const distanceXZ = Math.hypot(displacement.x, displacement.z);

    // Speed calculation
    const baseSpeed = isBullet ? PHYSICS.BULLET_PASS_SPEED : PHYSICS.LOB_PASS_SPEED;
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
      active: true,
    };

    return estimatedTime;
  }

  public update(delta: number): {
    arrived: boolean;
    hitGround: boolean;
    position: THREE.Vector3;
  } {
    if (!this.inFlight || !this.trajectory) {
      return { arrived: false, hitGround: false, position: this.ballMesh.position };
    }

    const t = Math.min(this.trajectory.totalTime, this.trajectory.flightTime + Math.max(0,delta));
    this.trajectory.flightTime = t;
    this.currentPos.copy(this.trajectory.startPos).addScaledVector(this.trajectory.velocity,t);
    this.currentPos.y += .5 * PHYSICS.GRAVITY * t*t;
    this.currentVel.copy(this.trajectory.velocity); this.currentVel.y += PHYSICS.GRAVITY*t;
    this.ballMesh.position.copy(this.currentPos);

    // Realistic ball alignment: Orient nose of football along velocity vector + spiral roll
    if (this.currentVel.lengthSq() > 0.1) {
      const dir = this.currentVel.clone().normalize();
      // Look at direction of travel
      const targetLook = this.currentPos.clone().add(dir);
      this.ballMesh.lookAt(targetLook);
      // High-speed spiral rotation around longitudinal axis
      this.ballMesh.rotateZ(this.spinRate * this.trajectory.flightTime * (this.trajectory.isBullet ? 1.5 : 1.0));
    }

    // Ground collision check
    if (this.currentPos.y <= 0.2) {
      this.currentPos.y = 0.2;
      this.inFlight = false;
      this.isGrounded = true;
      this.ballMesh.position.y = 0.2;
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
    this.ballMesh.visible = true;
    this.ballMesh.position.copy(pos).add(rightHandOffset);
    this.ballMesh.rotation.set(0.4, 0.4, 0.2);
  }

  public hide(): void {
    this.inFlight = false;
    this.ballMesh.visible = false;
  }
}
