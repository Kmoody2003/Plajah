// playkit/physics/rapierAdapter.ts
//
// Production Rust/WASM 3D Physics Backend (`@dimforge/rapier3d-compat` v0.12) implementing
// Playkit's `PhysicsBackendAdapter` contract. Gives ALL Plajah 3D games and creator games:
//   - Exact concave Trimesh colliders for walk-in CAD/BIM buildings, rooms, doorways & stairs
//   - Continuous Collision Detection (CCD) for fast bullets, Firstlight footballs & Kith balls
//   - Multi-body rigid physics, sleeping islands, articulated doors/vehicles & ragdoll joints
//   - Native WASM raycasting with surface normals & material surface tags

import RAPIER from '@dimforge/rapier3d-compat';
import type {
  JointSpec,
  PhysicsBackendAdapter,
  RaycastHit,
  RigidBodySpec,
  Vec3,
} from './runtime';

let rapierInitPromise: Promise<typeof RAPIER> | null = null;

/** Initialize the inlined Rapier3D WASM module once per process/page. */
export async function ensureRapier(): Promise<typeof RAPIER> {
  if (!rapierInitPromise) {
    rapierInitPromise = (async () => {
      const mod = ((RAPIER as unknown as { default?: typeof RAPIER }).default ?? RAPIER) as typeof RAPIER;
      await mod.init();
      return mod;
    })();
  }
  return rapierInitPromise;
}

export class RapierPhysicsAdapter implements PhysicsBackendAdapter {
  readonly name = 'rapier3d-wasm';
  readonly rapier: typeof RAPIER;
  readonly world: RAPIER.World;

  private bodies = new Map<string, RAPIER.RigidBody>();
  private colliders = new Map<string, RAPIER.Collider>();
  private colliderHandleToId = new Map<number, { bodyId: string; surfaceTag: string }>();
  private joints = new Map<string, RAPIER.ImpulseJoint>();
  private disposed = false;

  constructor(rapier: typeof RAPIER, gravity: Vec3 = [0, -24, 0]) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  }

  addBody(spec: RigidBodySpec): void {
    if (this.disposed) return;
    if (this.bodies.has(spec.id)) this.removeBody(spec.id);

    const R = this.rapier;
    const bodyDesc =
      spec.kind === 'dynamic'
        ? R.RigidBodyDesc.dynamic()
        : spec.kind === 'kinematic'
          ? R.RigidBodyDesc.kinematicPositionBased()
          : R.RigidBodyDesc.fixed();

    bodyDesc.setTranslation(spec.position[0], spec.position[1], spec.position[2]);
    if (spec.rotationYaw) {
      const half = spec.rotationYaw * 0.5;
      bodyDesc.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
    }
    if (spec.linearDamping !== undefined) bodyDesc.setLinearDamping(spec.linearDamping);
    if (spec.ccd) bodyDesc.setCcdEnabled(true);

    const body = this.world.createRigidBody(bodyDesc);
    this.bodies.set(spec.id, body);

    const colDesc =
      spec.shape.kind === 'box'
        ? R.ColliderDesc.cuboid(spec.shape.halfExtents[0], spec.shape.halfExtents[1], spec.shape.halfExtents[2])
        : spec.shape.kind === 'sphere'
          ? R.ColliderDesc.ball(spec.shape.radius)
          : R.ColliderDesc.capsule(Math.max(0.01, spec.shape.halfHeight), spec.shape.radius);

    colDesc.setRestitution(spec.restitution ?? 0.25);
    colDesc.setFriction(spec.friction ?? 0.65);
    if (spec.kind === 'dynamic' && spec.mass && spec.mass > 0) {
      colDesc.setMass(spec.mass);
    }

    const collider = this.world.createCollider(colDesc, body);
    this.colliders.set(spec.id, collider);
    this.colliderHandleToId.set(collider.handle, { bodyId: spec.id, surfaceTag: spec.surfaceTag ?? 'stone' });
  }

  /**
   * Register an exact static concave Trimesh collider (ideal for walk-in CAD/BIM buildings,
   * interior rooms, doorways, stairs, and sculpted terrain).
   */
  addTrimesh(id: string, positions: Float32Array, indices: Uint32Array, surfaceTag = 'stone'): void {
    if (this.disposed || positions.length < 9 || indices.length < 3) return;
    if (this.bodies.has(id)) this.removeBody(id);

    const R = this.rapier;
    const body = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    const colDesc = R.ColliderDesc.trimesh(positions, indices);
    colDesc.setFriction(0.75);
    const collider = this.world.createCollider(colDesc, body);
    this.bodies.set(id, body);
    this.colliders.set(id, collider);
    this.colliderHandleToId.set(collider.handle, { bodyId: id, surfaceTag });
  }

  /** Add a native Rapier impulse joint (hinge door, fixed mount, or spherical ragdoll/linkage). */
  addJoint(spec: JointSpec): boolean {
    const a = this.bodies.get(spec.bodyA);
    const b = this.bodies.get(spec.bodyB);
    if (!a || !b) return false;
    const R = this.rapier;

    let jd: RAPIER.JointData;
    if (spec.kind === 'hinge') {
      jd = R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      if (spec.minAngle !== undefined && spec.maxAngle !== undefined) {
        jd.limitsEnabled = true;
        jd.limits = [spec.minAngle, spec.maxAngle];
      }
    } else if (spec.kind === 'fixed') {
      jd = R.JointData.fixed(
        { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 },
      );
    } else {
      jd = R.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    }
    const joint = this.world.createImpulseJoint(jd, a, b, true);
    this.joints.set(spec.id, joint);
    return true;
  }

  removeBody(id: string): void {
    const col = this.colliders.get(id);
    if (col) {
      this.colliderHandleToId.delete(col.handle);
      this.colliders.delete(id);
    }
    const body = this.bodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.bodies.delete(id);
    }
  }

  step(dt: number): void {
    if (this.disposed) return;
    this.world.timestep = Math.max(1 / 240, Math.min(dt, 1 / 20));
    this.world.step();
  }

  getBodyPosition(id: string): Vec3 | null {
    const b = this.bodies.get(id);
    if (!b) return null;
    const t = b.translation();
    return [t.x, t.y, t.z];
  }

  applyImpulse(id: string, impulse: Vec3): void {
    const b = this.bodies.get(id);
    if (!b) return;
    b.applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
  }

  raycast(origin: Vec3, dirRaw: Vec3, maxDist: number): RaycastHit | null {
    if (this.disposed) return null;
    const l = Math.hypot(dirRaw[0], dirRaw[1], dirRaw[2]) || 1;
    const dx = dirRaw[0] / l, dy = dirRaw[1] / l, dz = dirRaw[2] / l;
    const ray = new this.rapier.Ray(
      { x: origin[0], y: origin[1], z: origin[2] },
      { x: dx, y: dy, z: dz },
    );
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true);
    if (!hit) return null;

    const meta = this.colliderHandleToId.get(hit.collider.handle) ?? { bodyId: 'unknown', surfaceTag: 'stone' };
    const pt = ray.pointAt(hit.toi);
    return {
      bodyId: meta.bodyId,
      distance: hit.toi,
      point: [pt.x, pt.y, pt.z],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
      surfaceTag: meta.surfaceTag,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bodies.clear();
    this.colliders.clear();
    this.colliderHandleToId.clear();
    this.joints.clear();
    this.world.free();
  }
}

export async function createRapierPhysicsAdapter(opts?: { gravity?: Vec3 }): Promise<RapierPhysicsAdapter> {
  const rapier = await ensureRapier();
  return new RapierPhysicsAdapter(rapier, opts?.gravity ?? [0, -24, 0]);
}
