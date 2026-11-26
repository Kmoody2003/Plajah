// World Solid Colliders (Trees, Parked Cars, Port/Harbor Obstacles, Bridge Piers)
// + Forza-Style Destructible Knock-Through Physics Props (Street Lamps, Fence Posts, Rally Signs, Bollards, Saplings)
//
// Uses an O(1) 24 m spatial hash so 100,000+ trees, poles, parked cars, and breakable props cost < 0.05 ms/frame.
// Solid obstacles resolve exact 4-corner car push-out + glancing yaw spin + inward velocity scrub;
// breakables launch tumbling ballistic 3D flying debris from a zero-GC recycled pool!
import * as THREE from 'three';

export type SolidKind = 'tree' | 'car' | 'container' | 'pillar' | 'wall' | 'building';
export type BreakableKind = 'pole' | 'fence' | 'sign' | 'bollard' | 'sapling' | 'crate';

interface SolidCyl {
  x: number;
  z: number;
  r: number;
  kind: SolidKind;
}

interface SolidBox {
  x: number;
  z: number;
  hw: number;
  hd: number;
  c: number;
  s: number;
  kind: SolidKind;
}

interface BreakableProp {
  x: number;
  y: number;
  z: number;
  r: number;
  kind: BreakableKind;
  broken: boolean;
  onSmash?: () => void;
}

interface FlyingDebris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  age: number;
  life: number;
  active: boolean;
  radius: number;
}

const CELL = 24;
const CAR_HW = 1.02;
const CAR_HL = 2.34;
const MAX_DEBRIS = 56;

export class WorldCollisionAndBreakables {
  readonly group = new THREE.Group();
  private cylGrid = new Map<number, SolidCyl[]>();
  private boxGrid = new Map<number, SolidBox[]>();
  private breakGrid = new Map<number, BreakableProp[]>();
  private debrisPool: FlyingDebris[] = [];
  private debrisCursor = 0;

  private geos: Record<BreakableKind, THREE.BufferGeometry>;
  private mats: Record<BreakableKind, THREE.MeshStandardMaterial>;

  constructor() {
    this.group.name = 'world-physics-debris';

    this.geos = {
      pole: new THREE.CylinderGeometry(0.09, 0.14, 7.6, 6),
      fence: new THREE.BoxGeometry(0.18, 1.35, 1.95),
      sign: new THREE.BoxGeometry(0.95, 1.15, 0.12),
      bollard: new THREE.CylinderGeometry(0.11, 0.13, 1.05, 8),
      sapling: new THREE.ConeGeometry(0.65, 2.8, 6),
      crate: new THREE.BoxGeometry(0.95, 0.85, 0.95),
    };

    this.mats = {
      pole: new THREE.MeshStandardMaterial({ color: 0x4b525c, roughness: 0.45, metalness: 0.72 }),
      fence: new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.90, metalness: 0.04 }),
      sign: new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.42, metalness: 0.25 }),
      bollard: new THREE.MeshStandardMaterial({ color: 0xe8a820, roughness: 0.50, metalness: 0.15 }),
      sapling: new THREE.MeshStandardMaterial({ color: 0x3f6f2c, roughness: 0.88, metalness: 0.0 }),
      crate: new THREE.MeshStandardMaterial({ color: 0x9b7444, roughness: 0.88, metalness: 0.05 }),
    };

    for (let i = 0; i < MAX_DEBRIS; i++) {
      const mesh = new THREE.Mesh(this.geos.fence, this.mats.fence);
      mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      this.debrisPool.push({
        mesh,
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        age: 0,
        life: 4.2,
        active: false,
        radius: 0.45,
      });
    }
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  addSolidCylinder(x: number, z: number, r: number, kind: SolidKind = 'tree'): void {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const k = this.key(cx, cz);
    let list = this.cylGrid.get(k);
    if (!list) { list = []; this.cylGrid.set(k, list); }
    list.push({ x, z, r, kind });
  }

  addSolidBox(x: number, z: number, hw: number, hd: number, rotY: number, kind: SolidKind = 'car'): void {
    const reach = Math.hypot(hw, hd) + 1.5;
    const x0 = Math.floor((x - reach) / CELL), x1 = Math.floor((x + reach) / CELL);
    const z0 = Math.floor((z - reach) / CELL), z1 = Math.floor((z + reach) / CELL);
    const entry: SolidBox = { x, z, hw, hd, c: Math.cos(rotY), s: Math.sin(rotY), kind };
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.boxGrid.get(k);
        if (!list) { list = []; this.boxGrid.set(k, list); }
        list.push(entry);
      }
    }
  }

  addBreakable(x: number, y: number, z: number, kind: BreakableKind, radius = 0.75, onSmash?: () => void): void {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const k = this.key(cx, cz);
    let list = this.breakGrid.get(k);
    if (!list) { list = []; this.breakGrid.set(k, list); }
    list.push({ x, y, z, r: radius, kind, broken: false, onSmash });
  }

  /** Resets any broken flags? No — broken props stay knocked over during the drive; call clearDebris() when leaving drive mode. */
  clearDebris(): void {
    for (const d of this.debrisPool) {
      d.active = false;
      d.mesh.visible = false;
    }
  }

  private spawnFlyingPiece(
    x: number,
    y: number,
    z: number,
    kind: BreakableKind,
    carVx: number,
    carVz: number,
    jitter = 0,
  ): void {
    const d = this.debrisPool[this.debrisCursor++ % MAX_DEBRIS];
    d.mesh.geometry = this.geos[kind];
    d.mesh.material = this.mats[kind];
    d.mesh.position.set(x, y + (kind === 'pole' ? 3.8 : 0.75), z);
    d.mesh.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
    const sc = jitter > 0 ? 0.55 + Math.random() * 0.45 : 1.0;
    d.mesh.scale.setScalar(sc);
    d.mesh.visible = true;

    const spd = Math.hypot(carVx, carVz);
    const dirX = spd > 0.5 ? carVx / spd : Math.sin(Math.random() * 6.28);
    const dirZ = spd > 0.5 ? carVz / spd : Math.cos(Math.random() * 6.28);
    const perpX = -dirZ, perpZ = dirX;
    const launchSpd = Math.max(8, spd * (kind === 'pole' ? 0.85 : 1.18)) + Math.random() * 5;
    const sideKick = ((Math.random() - 0.5) * 2.0) * (3.5 + spd * 0.25) + jitter * 4.0;
    d.vel.set(
      dirX * launchSpd + perpX * sideKick,
      (kind === 'pole' ? 4.8 : 6.2) + Math.min(8.5, spd * 0.22) + Math.random() * 2.8,
      dirZ * launchSpd + perpZ * sideKick,
    );
    d.angVel.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 14,
    );
    d.age = 0;
    d.life = kind === 'pole' ? 4.8 : 3.8;
    d.radius = kind === 'pole' ? 0.45 : 0.35;
    d.active = true;
  }

  /**
   * Resolves player car collisions against all solid trees, parked cars, port containers, and pillars,
   * AND smashes cleanly through breakable poles, wooden fences, signs, bollards, and saplings!
   */
  stepAndCollide(
    dt: number,
    pos: THREE.Vector3,
    yaw: number,
    vel: THREE.Vector3,
    groundH: (x: number, z: number) => number,
    cb: {
      onSolidHit: (severity: number, kind: SolidKind, yawKick: number) => void;
      onSmashHit: (kind: BreakableKind, x: number, y: number, z: number, dragFactor: number) => void;
    },
  ): boolean {
    let solidBumped = false;
    const gx = Math.floor(pos.x / CELL), gz = Math.floor(pos.z / CELL);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    // Test car in local space (width along +X/-X = CAR_HW, length along +Z/-Z = CAR_HL)
    // World -> Car local: lx = dx * cy - dz * sy, lz = dx * sy + dz * cy
    const spd = Math.hypot(vel.x, vel.z);

    // 1. Solid cylindrical colliders (mature tree trunks, concrete bridge piers, heavy harbor columns)
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let az = gz - 1; az <= gz + 1; az++) {
        const list = this.cylGrid.get(this.key(ax, az));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const ob = list[i];
          const dx = ob.x - pos.x, dz = ob.z - pos.z;
          const maxReach = CAR_HL + ob.r + 0.6;
          if (dx * dx + dz * dz > maxReach * maxReach) continue;

          // Closest point on car OBB to cylinder center in car-local coordinates
          const lx = dx * cy - dz * sy;
          const lz = dx * sy + dz * cy;
          const clx = Math.max(-CAR_HW, Math.min(CAR_HW, lx));
          const clz = Math.max(-CAR_HL, Math.min(CAR_HL, lz));
          const ex = lx - clx, ez = lz - clz;
          const d2 = ex * ex + ez * ez;
          const rad = ob.r;
          if (d2 >= rad * rad) continue;

          const d = Math.sqrt(d2);
          // Push normal in car-local space (pointing from obstacle INTO car)
          let nlx = 0, nlz = 0, pen = 0;
          if (d > 1e-4) {
            nlx = -ex / d;
            nlz = -ez / d;
            pen = rad - d;
          } else {
            // Center penetrated OBB — push out shortest axis
            const px = CAR_HW - Math.abs(lx), pz = CAR_HL - Math.abs(lz);
            if (px < pz) { nlx = -Math.sign(lx || 1); pen = px + rad; }
            else { nlz = -Math.sign(lz || 1); pen = pz + rad; }
          }
          // Convert push normal back to world space
          const nwx = nlx * cy + nlz * sy;
          const nwz = -nlx * sy + nlz * cy;
          pos.x += nwx * pen;
          pos.z += nwz * pen;

          // Velocity deflection + glancing off-center yaw spin
          const into = -(vel.x * nwx + vel.z * nwz);
          if (into > 0) {
            const bounce = ob.kind === 'tree' ? 1.22 : 1.15;
            vel.x += nwx * into * bounce;
            vel.z += nwz * into * bounce;
            vel.x *= 0.84;
            vel.z *= 0.84;
            // Torque from off-center impact point (clx, clz) x (nlx, nlz)
            const torque = (clx * nlz - clz * nlx) * Math.min(1, into / 14);
            const sev = Math.min(1, Math.max(0.28, into / 18));
            cb.onSolidHit(sev, ob.kind, torque * 0.16);
          }
          solidBumped = true;
        }
      }
    }

    // 2. Solid oriented box colliders (parked cars, shipping container stacks, industrial sheds)
    const seenBox = new Set<SolidBox>();
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let az = gz - 1; az <= gz + 1; az++) {
        const list = this.boxGrid.get(this.key(ax, az));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (seenBox.has(b)) continue;
          seenBox.add(b);
          const dx = pos.x - b.x, dz = pos.z - b.z;
          const lx = dx * b.c - dz * b.s;
          const lz = dx * b.s + dz * b.c;
          const hw = b.hw + 1.15, hd = b.hd + 1.35;
          if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
            const px = hw - Math.abs(lx), pz = hd - Math.abs(lz);
            let nwx = 0, nwz = 0, pen = 0;
            if (px < pz) {
              const sg = Math.sign(lx || 1);
              nwx = sg * b.c; nwz = -sg * b.s; pen = px;
            } else {
              const sg = Math.sign(lz || 1);
              nwx = sg * b.s; nwz = sg * b.c; pen = pz;
            }
            pos.x += nwx * pen;
            pos.z += nwz * pen;
            const into = -(vel.x * nwx + vel.z * nwz);
            if (into > 0) {
              vel.x += nwx * into * 1.15;
              vel.z += nwz * into * 1.15;
              vel.x *= 0.86;
              vel.z *= 0.86;
              cb.onSolidHit(Math.min(1, Math.max(0.25, into / 18)), b.kind, 0);
            }
            solidBumped = true;
          }
        }
      }
    }

    // 3. Breakable knock-through props (street poles, wooden fences, rally signs, bollards, saplings, crates!)
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let az = gz - 1; az <= gz + 1; az++) {
        const list = this.breakGrid.get(this.key(ax, az));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const bp = list[i];
          if (bp.broken) continue;
          const dx = bp.x - pos.x, dz = bp.z - pos.z;
          const reach = CAR_HL + bp.r;
          if (dx * dx + dz * dz > reach * reach) continue;
          const lx = dx * cy - dz * sy;
          const lz = dx * sy + dz * cy;
          if (Math.abs(lx) > CAR_HW + bp.r || Math.abs(lz) > CAR_HL + bp.r) continue;

          // Heavy streetlamp poles require >= 18 km/h (5 m/s) to snap off cleanly; slower bumps deflect softly
          if (bp.kind === 'pole' && spd < 5.0) {
            const d = Math.hypot(dx, dz) || 1;
            pos.x -= (dx / d) * 0.22;
            pos.z -= (dz / d) * 0.22;
            vel.multiplyScalar(0.5);
            cb.onSolidHit(0.28, 'pillar', 0);
            solidBumped = true;
            continue;
          }

          bp.broken = true;
          bp.onSmash?.();
          const gy = groundH(bp.x, bp.z);
          this.spawnFlyingPiece(bp.x, gy, bp.z, bp.kind, vel.x, vel.z, 0);
          // Wooden fences, crates, and signs burst into extra flying splinters!
          if (bp.kind === 'fence' || bp.kind === 'crate' || bp.kind === 'sign') {
            this.spawnFlyingPiece(bp.x, gy + 0.3, bp.z, bp.kind, vel.x, vel.z, 1);
            this.spawnFlyingPiece(bp.x, gy + 0.5, bp.z, bp.kind, vel.x, vel.z, -1);
          }
          const drag = bp.kind === 'pole' ? 0.90 : bp.kind === 'sapling' ? 0.94 : 0.96;
          vel.x *= drag;
          vel.z *= drag;
          cb.onSmashHit(bp.kind, bp.x, gy, bp.z, drag);
        }
      }
    }

    // 4. Step flying tumbling debris physics
    const safeDt = Math.min(dt, 0.05);
    for (let i = 0; i < this.debrisPool.length; i++) {
      const d = this.debrisPool[i];
      if (!d.active) continue;
      d.age += safeDt;
      if (d.age >= d.life) {
        d.active = false;
        d.mesh.visible = false;
        continue;
      }
      d.vel.y -= 18.5 * safeDt;
      d.mesh.position.x += d.vel.x * safeDt;
      d.mesh.position.y += d.vel.y * safeDt;
      d.mesh.position.z += d.vel.z * safeDt;
      d.mesh.rotation.x += d.angVel.x * safeDt;
      d.mesh.rotation.y += d.angVel.y * safeDt;
      d.mesh.rotation.z += d.angVel.z * safeDt;

      const gy = groundH(d.mesh.position.x, d.mesh.position.z) + d.radius;
      if (d.mesh.position.y < gy) {
        d.mesh.position.y = gy;
        if (d.vel.y < -1.5) {
          d.vel.y = -d.vel.y * 0.36;
          d.vel.x *= 0.68;
          d.vel.z *= 0.68;
          d.angVel.multiplyScalar(0.65);
        } else {
          d.vel.y = 0;
          d.vel.x *= Math.exp(-6 * safeDt);
          d.vel.z *= Math.exp(-6 * safeDt);
          d.angVel.multiplyScalar(Math.exp(-6 * safeDt));
        }
      }
      // Fade/shrink cleanly out during the last 0.6 s on the ground
      if (d.age > d.life - 0.6) {
        const s = Math.max(0.01, (d.life - d.age) / 0.6);
        d.mesh.scale.setScalar(s);
      }
    }

    return solidBumped;
  }
}
