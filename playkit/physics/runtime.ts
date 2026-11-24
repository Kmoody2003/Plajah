// playkit/physics/runtime.ts
//
// Unified 3D Physics Runtime for ALL Plajah games:
//   - Pluggable WASM backend contract (`PhysicsBackendAdapter`) so `@dimforge/rapier3d-compat`
//     or `jolt-physics` WASM can drop in without changing any game or creator code.
//   - Production-grade built-in deterministic solver (pure TS, runs identically in Node tests
//     and browsers without external binaries):
//       * Rigid bodies (static / dynamic / kinematic) with sleeping islands & AABB/sphere colliders
//       * Swept-sphere Continuous Collision Detection (CCD) for fast projectiles & sports balls
//       * Joints & constraints (fixed, distance, spring, hinge doors/gates)
//       * 4-Wheel Raycast Vehicle Suspension & Drift Model (Kith Racing / Apex)
//       * Ballistic Magnus-Spin Trajectory Solver (Firstlight footballs / Kith Tennis)

export type Vec3 = [number, number, number];
export type BodyKind = 'static' | 'dynamic' | 'kinematic';
export type ColliderShape =
  | { kind: 'box'; halfExtents: Vec3 }
  | { kind: 'sphere'; radius: number }
  | { kind: 'capsule'; radius: number; halfHeight: number };

export interface RigidBodySpec {
  id: string;
  kind: BodyKind;
  position: Vec3;
  rotationYaw?: number;
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  ccd?: boolean;
  shape: ColliderShape;
  surfaceTag?: 'stone' | 'wood' | 'metal' | 'grass' | 'ice' | 'mud' | 'flesh' | 'rubber' | (string & {});
  userData?: Record<string, unknown>;
}

export interface RigidBodyState {
  id: string;
  kind: BodyKind;
  position: Vec3;
  velocity: Vec3;
  rotationYaw: number;
  angularVelY: number;
  mass: number;
  invMass: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  ccd: boolean;
  shape: ColliderShape;
  surfaceTag: string;
  sleeping: boolean;
  sleepTimer: number;
  onGround: boolean;
  userData?: Record<string, unknown>;
}

export interface JointSpec {
  id: string;
  kind: 'distance' | 'spring' | 'hinge' | 'fixed';
  bodyA: string;
  bodyB: string;
  restLength?: number;
  stiffness?: number;
  damping?: number;
  minAngle?: number;
  maxAngle?: number;
}

export interface RaycastHit {
  bodyId: string;
  distance: number;
  point: Vec3;
  normal: Vec3;
  surfaceTag: string;
}

/** Optional pluggable WASM physics backend (e.g. Rapier3D or Jolt WASM). */
export interface PhysicsBackendAdapter {
  readonly name: string;
  addBody(spec: RigidBodySpec): void;
  removeBody(id: string): void;
  step(dt: number): void;
  getBodyPosition(id: string): Vec3 | null;
  applyImpulse(id: string, impulse: Vec3): void;
  raycast(origin: Vec3, dir: Vec3, maxDist: number): RaycastHit | null;
}

// ── 4-Wheel Raycast Vehicle Suspension (Kith Racing / Apex / Creator Vehicles) ──
export interface VehicleConfig {
  massKg: number;
  maxEngineForce: number;
  maxBrakeForce: number;
  maxSteerRad: number;
  wheelRestLength: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  lateralGrip: number;
  driftGripFactor: number;
  wheelOffsets: [Vec3, Vec3, Vec3, Vec3]; // FL, FR, RL, RR
}

export interface VehicleInput {
  throttle: number; // -1..1
  steer: number;    // -1..1
  brake: boolean;
  drift: boolean;
}

export interface VehicleState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  yawRate: number;
  speedMps: number;
  rpm: number;
  gear: number;
  wheelCompression: [number, number, number, number];
  groundedWheels: number;
  lateralG: number;
  drifting: boolean;
}

// ── Ballistic Spin / Magnus Projectile (Firstlight Footballs / Kith Tennis) ──
export interface BallisticProjectile {
  id: string;
  position: Vec3;
  velocity: Vec3;
  /** Angular spin vector (rad/s) for spiral stability / topspin Magnus curve. */
  spin: Vec3;
  radius: number;
  restitution: number;
  dragCoeff: number;
  magnusCoeff: number;
  bounces: number;
  active: boolean;
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: Vec3): Vec3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function halfExtentsOf(shape: ColliderShape): Vec3 {
  if (shape.kind === 'box') return shape.halfExtents;
  if (shape.kind === 'sphere') return [shape.radius, shape.radius, shape.radius];
  return [shape.radius, shape.halfHeight + shape.radius, shape.radius];
}

export class PlajahPhysicsWorld {
  gravity: Vec3;
  wind: Vec3 = [0, 0, 0];
  private bodies = new Map<string, RigidBodyState>();
  private joints = new Map<string, JointSpec>();
  private projectiles = new Map<string, BallisticProjectile>();
  private backend: PhysicsBackendAdapter | null = null;

  constructor(opts?: { gravity?: Vec3; backend?: PhysicsBackendAdapter }) {
    this.gravity = opts?.gravity ?? [0, -24, 0];
    this.backend = opts?.backend ?? null;
  }

  get backendName(): string {
    return this.backend?.name ?? 'plajah-deterministic-ts';
  }

  attachBackend(adapter: PhysicsBackendAdapter): void {
    this.backend = adapter;
    for (const b of this.bodies.values()) {
      adapter.addBody({
        id: b.id, kind: b.kind, position: [...b.position], rotationYaw: b.rotationYaw,
        mass: b.mass, restitution: b.restitution, friction: b.friction,
        linearDamping: b.linearDamping, ccd: b.ccd, shape: b.shape, surfaceTag: b.surfaceTag,
      });
    }
  }

  addBody(spec: RigidBodySpec): RigidBodyState {
    const mass = spec.kind === 'dynamic' ? Math.max(0.01, spec.mass ?? 1) : 0;
    const body: RigidBodyState = {
      id: spec.id,
      kind: spec.kind,
      position: [...spec.position],
      velocity: [0, 0, 0],
      rotationYaw: spec.rotationYaw ?? 0,
      angularVelY: 0,
      mass,
      invMass: mass > 0 ? 1 / mass : 0,
      restitution: spec.restitution ?? 0.25,
      friction: spec.friction ?? 0.65,
      linearDamping: spec.linearDamping ?? 0.04,
      ccd: spec.ccd ?? false,
      shape: spec.shape,
      surfaceTag: spec.surfaceTag ?? 'stone',
      sleeping: false,
      sleepTimer: 0,
      onGround: false,
      userData: spec.userData,
    };
    this.bodies.set(body.id, body);
    this.backend?.addBody(spec);
    return body;
  }

  getBody(id: string): RigidBodyState | undefined {
    return this.bodies.get(id);
  }

  removeBody(id: string): boolean {
    this.backend?.removeBody(id);
    return this.bodies.delete(id);
  }

  addJoint(spec: JointSpec): void {
    this.joints.set(spec.id, spec);
  }

  removeJoint(id: string): boolean {
    return this.joints.delete(id);
  }

  applyImpulse(id: string, impulse: Vec3): void {
    const b = this.bodies.get(id);
    if (!b || b.invMass === 0) return;
    b.sleeping = false;
    b.sleepTimer = 0;
    b.velocity[0] += impulse[0] * b.invMass;
    b.velocity[1] += impulse[1] * b.invMass;
    b.velocity[2] += impulse[2] * b.invMass;
    this.backend?.applyImpulse(id, impulse);
  }

  /** Launch a spinning sports ball or ballistic projectile (Firstlight / Kith Tennis / grenades). */
  spawnProjectile(spec: Omit<BallisticProjectile, 'bounces' | 'active'>): BallisticProjectile {
    const p: BallisticProjectile = {
      ...spec,
      position: [...spec.position],
      velocity: [...spec.velocity],
      spin: [...spec.spin],
      bounces: 0,
      active: true,
    };
    this.projectiles.set(p.id, p);
    return p;
  }

  getProjectile(id: string): BallisticProjectile | undefined {
    return this.projectiles.get(id);
  }

  /** Raycast against all bodies (slab AABB / analytic sphere). */
  raycast(origin: Vec3, dirRaw: Vec3, maxDist: number, ignoreId?: string): RaycastHit | null {
    if (this.backend) return this.backend.raycast(origin, dirRaw, maxDist);
    const dir = norm3(dirRaw);
    let best: RaycastHit | null = null;

    for (const b of this.bodies.values()) {
      if (b.id === ignoreId) continue;
      const ext = halfExtentsOf(b.shape);
      const minX = b.position[0] - ext[0], maxX = b.position[0] + ext[0];
      const minY = b.position[1] - ext[1], maxY = b.position[1] + ext[1];
      const minZ = b.position[2] - ext[2], maxZ = b.position[2] + ext[2];

      let tMin = 0;
      let tMax = maxDist;
      let hitNormal: Vec3 = [0, 1, 0];

      const axes: Array<[number, number, number, number, Vec3, Vec3]> = [
        [origin[0], dir[0], minX, maxX, [-1, 0, 0], [1, 0, 0]],
        [origin[1], dir[1], minY, maxY, [0, -1, 0], [0, 1, 0]],
        [origin[2], dir[2], minZ, maxZ, [0, 0, -1], [0, 0, 1]],
      ];
      let miss = false;
      for (const [o, d, mn, mx, nLow, nHigh] of axes) {
        if (Math.abs(d) < 1e-8) {
          if (o < mn || o > mx) { miss = true; break; }
          continue;
        }
        let t1 = (mn - o) / d;
        let t2 = (mx - o) / d;
        let nNear = nLow;
        if (t1 > t2) {
          const tmp = t1; t1 = t2; t2 = tmp;
          nNear = nHigh;
        }
        if (t1 > tMin) {
          tMin = t1;
          hitNormal = nNear;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) { miss = true; break; }
      }
      if (miss || tMin < 0 || tMin > maxDist) continue;
      if (!best || tMin < best.distance) {
        best = {
          bodyId: b.id,
          distance: tMin,
          point: [origin[0] + dir[0] * tMin, origin[1] + dir[1] * tMin, origin[2] + dir[2] * tMin],
          normal: hitNormal,
          surfaceTag: b.surfaceTag,
        };
      }
    }
    return best;
  }

  /** Step rigid bodies, sleeping islands, joints, and CCD ballistic projectiles. */
  step(dt: number): void {
    if (this.backend) {
      this.backend.step(dt);
      for (const b of this.bodies.values()) {
        const pos = this.backend.getBodyPosition(b.id);
        if (pos) b.position = pos;
      }
      return;
    }

    const dynamics: RigidBodyState[] = [];
    const statics: RigidBodyState[] = [];
    for (const b of this.bodies.values()) {
      if (b.kind === 'dynamic') dynamics.push(b);
      else statics.push(b);
    }

    // 1. Integrate dynamic bodies + CCD ray check for high-speed bodies
    for (const b of dynamics) {
      if (b.sleeping) continue;
      b.onGround = false;
      b.velocity[0] += this.gravity[0] * dt;
      b.velocity[1] += this.gravity[1] * dt;
      b.velocity[2] += this.gravity[2] * dt;

      const damp = Math.max(0, 1 - b.linearDamping * dt);
      b.velocity[0] *= damp;
      b.velocity[1] *= damp;
      b.velocity[2] *= damp;

      const stepDx = b.velocity[0] * dt;
      const stepDy = b.velocity[1] * dt;
      const stepDz = b.velocity[2] * dt;
      const stepLen = Math.hypot(stepDx, stepDy, stepDz);

      if (b.ccd && stepLen > 0.05) {
        const hit = this.raycast(b.position, [stepDx, stepDy, stepDz], stepLen + halfExtentsOf(b.shape)[0], b.id);
        if (hit && hit.distance <= stepLen) {
          const ext = halfExtentsOf(b.shape);
          const margin = Math.abs(hit.normal[0]) * ext[0] + Math.abs(hit.normal[1]) * ext[1] + Math.abs(hit.normal[2]) * ext[2];
          b.position = [
            hit.point[0] + hit.normal[0] * margin,
            hit.point[1] + hit.normal[1] * margin,
            hit.point[2] + hit.normal[2] * margin,
          ];
          const vn = dot3(b.velocity, hit.normal);
          if (vn < 0) {
            const j = -(1 + b.restitution) * vn;
            b.velocity[0] += hit.normal[0] * j;
            b.velocity[1] += hit.normal[1] * j;
            b.velocity[2] += hit.normal[2] * j;
          }
          if (hit.normal[1] > 0.5) b.onGround = true;
          continue;
        }
      }

      b.position[0] += stepDx;
      b.position[1] += stepDy;
      b.position[2] += stepDz;
      b.rotationYaw += b.angularVelY * dt;
    }

    // 2. Resolve dynamic vs static AABB overlaps
    for (const d of dynamics) {
      if (d.sleeping) continue;
      const de = halfExtentsOf(d.shape);
      for (const s of statics) {
        const se = halfExtentsOf(s.shape);
        const dx = d.position[0] - s.position[0];
        const dy = d.position[1] - s.position[1];
        const dz = d.position[2] - s.position[2];
        const ox = de[0] + se[0] - Math.abs(dx);
        const oy = de[1] + se[1] - Math.abs(dy);
        const oz = de[2] + se[2] - Math.abs(dz);
        if (ox <= 0 || oy <= 0 || oz <= 0) continue;

        let nx = 0, ny = 0, nz = 0, pen = 0;
        if (oy <= ox && oy <= oz) {
          ny = dy >= 0 ? 1 : -1; pen = oy;
        } else if (ox <= oz) {
          nx = dx >= 0 ? 1 : -1; pen = ox;
        } else {
          nz = dz >= 0 ? 1 : -1; pen = oz;
        }

        d.position[0] += nx * pen;
        d.position[1] += ny * pen;
        d.position[2] += nz * pen;

        const vn = d.velocity[0] * nx + d.velocity[1] * ny + d.velocity[2] * nz;
        if (vn < 0) {
          const rest = Math.max(d.restitution, s.restitution);
          const bounce = Math.abs(vn) > 1.2 ? rest : 0;
          const j = -(1 + bounce) * vn;
          d.velocity[0] += nx * j;
          d.velocity[1] += ny * j;
          d.velocity[2] += nz * j;

          if (ny > 0.5) {
            d.onGround = true;
            const fric = Math.max(0, 1 - d.friction * s.friction * 10 * dt);
            d.velocity[0] *= fric;
            d.velocity[2] *= fric;
          }
        }
      }
    }

    // 3. Solve joints (spring / distance / fixed / hinge)
    for (const joint of this.joints.values()) {
      const a = this.bodies.get(joint.bodyA);
      const b = this.bodies.get(joint.bodyB);
      if (!a || !b) continue;
      const totalInv = a.invMass + b.invMass;
      if (totalInv === 0) continue;

      if (joint.kind === 'spring' || joint.kind === 'distance' || joint.kind === 'fixed') {
        const delta = sub3(b.position, a.position);
        const dist = len3(delta) || 1e-6;
        const target = joint.kind === 'fixed' ? (joint.restLength ?? 0) : (joint.restLength ?? 1);
        const diff = dist - target;
        const dir: Vec3 = [delta[0] / dist, delta[1] / dist, delta[2] / dist];

        if (joint.kind === 'spring') {
          const k = joint.stiffness ?? 60;
          const c = joint.damping ?? 6;
          const relVel = dot3(sub3(b.velocity, a.velocity), dir);
          const force = diff * k + relVel * c;
          if (a.invMass > 0) {
            a.sleeping = false;
            a.velocity[0] += dir[0] * force * a.invMass * dt;
            a.velocity[1] += dir[1] * force * a.invMass * dt;
            a.velocity[2] += dir[2] * force * a.invMass * dt;
          }
          if (b.invMass > 0) {
            b.sleeping = false;
            b.velocity[0] -= dir[0] * force * b.invMass * dt;
            b.velocity[1] -= dir[1] * force * b.invMass * dt;
            b.velocity[2] -= dir[2] * force * b.invMass * dt;
          }
        } else {
          const corrA = (diff * a.invMass) / totalInv;
          const corrB = (diff * b.invMass) / totalInv;
          a.position[0] += dir[0] * corrA; a.position[1] += dir[1] * corrA; a.position[2] += dir[2] * corrA;
          b.position[0] -= dir[0] * corrB; b.position[1] -= dir[1] * corrB; b.position[2] -= dir[2] * corrB;
        }
      } else if (joint.kind === 'hinge') {
        const minA = joint.minAngle ?? -Math.PI * 0.5;
        const maxA = joint.maxAngle ?? Math.PI * 0.5;
        if (b.rotationYaw < minA) { b.rotationYaw = minA; b.angularVelY = Math.max(0, b.angularVelY); }
        if (b.rotationYaw > maxA) { b.rotationYaw = maxA; b.angularVelY = Math.min(0, b.angularVelY); }
      }
    }

    // 4. Sleeping island check (keeps 200+ settled furniture/clutter props essentially free)
    for (const d of dynamics) {
      if (d.sleeping) continue;
      const speedSq = dot3(d.velocity, d.velocity);
      if (d.onGround && speedSq < 0.015) {
        d.sleepTimer += dt;
        if (d.sleepTimer >= 0.45) {
          d.sleeping = true;
          d.velocity = [0, 0, 0];
        }
      } else {
        d.sleepTimer = 0;
      }
    }

    // 5. Step ballistic Magnus-spin projectiles with CCD bounce
    for (const p of this.projectiles.values()) {
      if (!p.active) continue;
      const relVel = sub3(p.velocity, this.wind);
      const speed = len3(relVel);
      const drag = -p.dragCoeff * speed;
      const magnus = cross3(p.spin, relVel);

      p.velocity[0] += (this.gravity[0] + relVel[0] * drag + magnus[0] * p.magnusCoeff) * dt;
      p.velocity[1] += (this.gravity[1] + relVel[1] * drag + magnus[1] * p.magnusCoeff) * dt;
      p.velocity[2] += (this.gravity[2] + relVel[2] * drag + magnus[2] * p.magnusCoeff) * dt;

      const stepVec: Vec3 = [p.velocity[0] * dt, p.velocity[1] * dt, p.velocity[2] * dt];
      const stepDist = len3(stepVec);
      const hit = stepDist > 1e-5 ? this.raycast(p.position, stepVec, stepDist + p.radius) : null;

      if (hit && hit.distance <= stepDist + p.radius) {
        p.position = [
          hit.point[0] + hit.normal[0] * p.radius,
          hit.point[1] + hit.normal[1] * p.radius,
          hit.point[2] + hit.normal[2] * p.radius,
        ];
        const vn = dot3(p.velocity, hit.normal);
        if (vn < 0) {
          const j = -(1 + p.restitution) * vn;
          p.velocity[0] += hit.normal[0] * j;
          p.velocity[1] += hit.normal[1] * j;
          p.velocity[2] += hit.normal[2] * j;
          p.bounces++;
        }
      } else {
        p.position[0] += stepVec[0];
        p.position[1] += stepVec[1];
        p.position[2] += stepVec[2];
      }
    }
  }

  /**
   * Step a 4-wheel raycast vehicle (Kith Racing / Apex / Creator cars).
   * Fires 4 suspension rays against world colliders and computes spring forces, steering & drift.
   */
  stepVehicle(state: VehicleState, cfg: VehicleConfig, input: VehicleInput, dt: number): VehicleState {
    const cosY = Math.cos(state.yaw);
    const sinY = Math.sin(state.yaw);
    const forward: Vec3 = [-sinY, 0, -cosY];
    const right: Vec3 = [cosY, 0, -sinY];

    let grounded = 0;
    let totalUpForce = 0;
    const comp: [number, number, number, number] = [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
      const off = cfg.wheelOffsets[i];
      const wx = state.position[0] + right[0] * off[0] + forward[0] * off[2];
      const wy = state.position[1] + off[1];
      const wz = state.position[2] + right[2] * off[0] + forward[2] * off[2];
      const hit = this.raycast([wx, wy, wz], [0, -1, 0], cfg.wheelRestLength);
      if (hit) {
        grounded++;
        const c = Math.max(0, 1 - hit.distance / cfg.wheelRestLength);
        comp[i] = c;
        const springF = c * cfg.suspensionStiffness - state.velocity[1] * cfg.suspensionDamping;
        totalUpForce += Math.max(0, springF);
      }
    }

    const fwdSpeed = dot3(state.velocity, forward);
    const latSpeed = dot3(state.velocity, right);

    // Steering + yaw rate
    const steerAngle = input.steer * cfg.maxSteerRad;
    const turnScale = Math.min(1, Math.abs(fwdSpeed) / 4);
    const driftBoost = input.drift ? 1.38 : 1.0;
    state.yawRate = steerAngle * 2.6 * turnScale * driftBoost * (fwdSpeed >= -0.1 ? 1 : -1);
    if (grounded > 0) {
      state.yaw += state.yawRate * dt;
    }

    // Engine / brake / lateral friction
    let accelFwd = 0;
    if (grounded > 0) {
      if (input.brake) {
        accelFwd = -Math.sign(fwdSpeed) * (cfg.maxBrakeForce / cfg.massKg);
      } else {
        accelFwd = (input.throttle * cfg.maxEngineForce) / cfg.massKg;
      }
    }

    const grip = grounded > 0 ? cfg.lateralGrip * (input.drift ? cfg.driftGripFactor : 1) : 0.2;
    const newLat = latSpeed * Math.max(0, 1 - grip * dt);
    const newFwd = fwdSpeed + accelFwd * dt - fwdSpeed * 0.18 * dt;

    const ay = this.gravity[1] + totalUpForce / cfg.massKg;
    state.velocity = [
      forward[0] * newFwd + right[0] * newLat,
      state.velocity[1] + ay * dt,
      forward[2] * newFwd + right[2] * newLat,
    ];

    state.position[0] += state.velocity[0] * dt;
    state.position[1] += state.velocity[1] * dt;
    state.position[2] += state.velocity[2] * dt;

    state.wheelCompression = comp;
    state.groundedWheels = grounded;
    state.speedMps = newFwd;
    state.drifting = input.drift && grounded >= 2 && Math.abs(fwdSpeed) > 6 && Math.abs(input.steer) > 0.2;
    state.lateralG = Math.abs(newFwd * state.yawRate) / 9.81;
    state.gear = Math.max(1, Math.min(6, Math.floor(Math.abs(newFwd) / 7) + 1));
    state.rpm = 1200 + ((Math.abs(newFwd) % 7) / 7) * 5800;

    return state;
  }
}
