// BVH collision world for capsule movement and hitscan raycasting.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

/** Mark an object (and its descendants) as solid world geometry. */
export function collide<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((c) => { c.userData.collide = true; });
  return obj;
}

/** A big open world's ground and tree trunks, answered from a height grid and a trunk grid instead of the BVH
 *  (a 2 km terrain as triangles would be millions of them). A level puts one on its group's userData.terrain. */
export interface TerrainField {
  /** Ground height at (x, z); `y` (the query's height) lets caves and hollow trunks answer -Infinity inside them. */
  heightAt(x: number, z: number, y?: number): number;
  /** Vertical trunks near (x, z) within `r`: [x, z, radius, y0, y1] each. */
  trunksNear?(x: number, z: number, r: number): ArrayLike<number>[];
  /** Highest step the capsule walks up; terrain rising more than this across its radius is a wall. */
  step?: number;
}

export class CollisionWorld {
  private bvh: MeshBVH | null = null;
  terrain: TerrainField | null = null;

  constructor(private root: THREE.Object3D) {}

  rebuild() {
    this.terrain = (this.root.userData.terrain as TerrainField | undefined) ?? null;
    this.root.updateMatrixWorld(true);
    const geos: THREE.BufferGeometry[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.userData.collide || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      const src = m.geometry;
      if (!src?.attributes.position) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position.clone());
      if (src.index) g.setIndex(src.index.clone());
      g.applyMatrix4(m.matrixWorld);
      geos.push(g.index ? g.toNonIndexed() : g);
    });
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    if (merged) this.bvh = new MeshBVH(merged);
  }

  groundAt(x: number, z: number, fromY: number, maxDrop = 50): number | null {
    let best: number | null = null;
    if (this.bvh) {
      const hit = this.bvh.raycastFirst(
        new THREE.Ray(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)),
        THREE.DoubleSide,
      );
      if (hit && hit.distance <= maxDrop) best = hit.point.y;
    }
    if (this.terrain) {
      const h = this.terrain.heightAt(x, z, fromY);
      if (h <= fromY + 0.05 && fromY - h <= maxDrop && (best === null || h > best)) best = h;
    }
    return best;
  }

  rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    let d = max;
    if (this.bvh) {
      const hit = this.bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide);
      if (hit && hit.distance < d) d = hit.distance;
    }
    const t = this.terrain;
    if (t) {
      // march the ground in 1 m steps (finer near), then refine the crossing
      let prev = 0;
      for (let s = 0.25; s < d; s += s < 6 ? 0.25 : 1) {
        if (origin.y + dir.y * s < t.heightAt(origin.x + dir.x * s, origin.z + dir.z * s, origin.y + dir.y * s)) {
          let a = prev, b = s;
          for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (origin.y + dir.y * m < t.heightAt(origin.x + dir.x * m, origin.z + dir.z * m, origin.y + dir.y * m)) b = m; else a = m; }
          d = Math.min(d, a); break;
        }
        prev = s;
      }
      // trunks the ray passes (2D ray-circle in the cells along it, within each trunk's height)
      if (t.trunksNear && d > 0.5) {
        const hl = Math.hypot(dir.x, dir.z);
        if (hl > 1e-4) {
          const ux = dir.x / hl, uz = dir.z / hl;
          for (let s = 0; s < d * hl; s += 6) {
            for (const tr of t.trunksNear(origin.x + ux * s, origin.z + uz * s, 8)) {
              const ox = origin.x - tr[0], oz = origin.z - tr[1];
              const b = ox * ux + oz * uz, c = ox * ox + oz * oz - tr[2] * tr[2], disc = b * b - c;
              if (disc < 0) continue;
              const hd = -b - Math.sqrt(disc);
              if (hd < 0) continue;
              const td = hd / hl, y = origin.y + dir.y * td;
              if (td < d && y > tr[3] && y < tr[4]) d = td;
            }
          }
        }
      }
    }
    return d;
  }

  /** Push a capsule out of the terrain and the trunks. Returns whether it stands on walkable ground. */
  private resolveTerrain(pos: THREE.Vector3, radius: number, height: number): boolean {
    const t = this.terrain!;
    const step = t.step ?? 0.55;
    // walls: ground rising more than a step within the capsule's radius pushes it back (cliff faces, gorge walls)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      const qy = pos.y + 1;
      if (t.heightAt(pos.x + dx * radius, pos.z + dz * radius, qy) <= pos.y + step) continue;
      let lo = 0, hi = radius;
      for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (t.heightAt(pos.x + dx * m, pos.z + dz * m, qy) > pos.y + step) hi = m; else lo = m; }
      const push = radius - hi;
      if (push > 1e-3) { pos.x -= dx * push * 0.5; pos.z -= dz * push * 0.5; }
    }
    let ground = false;
    const qy = pos.y + 1, h = t.heightAt(pos.x, pos.z, qy);
    if (pos.y < h) {
      const e = 0.6, nx = t.heightAt(pos.x - e, pos.z, qy) - t.heightAt(pos.x + e, pos.z, qy), nz = t.heightAt(pos.x, pos.z - e, qy) - t.heightAt(pos.x, pos.z + e, qy);
      const ny = 2 * e, nl = Math.hypot(nx, ny, nz), uy = ny / nl;
      if (uy >= 0.5 || h - pos.y > 2.5) { pos.y = h; ground = true; }
      else { const p = (h - pos.y) * uy; pos.x += (nx / nl) * p; pos.y += uy * p; pos.z += (nz / nl) * p; }
    } else if (pos.y - h < 0.04) ground = true;
    if (t.trunksNear) {
      for (const tr of t.trunksNear(pos.x, pos.z, radius + 3)) {
        if (pos.y > tr[4] || pos.y + height < tr[3]) continue;
        const dx = pos.x - tr[0], dz = pos.z - tr[1], d = Math.hypot(dx, dz), min = tr[2] + radius;
        if (d >= min || d < 1e-5) continue;
        pos.x += (dx / d) * (min - d); pos.z += (dz / d) * (min - d);
      }
    }
    return ground;
  }

  private seg = new THREE.Line3();
  private box = new THREE.Box3();
  private triPt = new THREE.Vector3();
  private capPt = new THREE.Vector3();

  resolve(pos: THREE.Vector3, radius: number, height: number): { pos: THREE.Vector3; onGround: boolean } {
    if (!this.bvh) return { pos, onGround: this.terrain ? this.resolveTerrain(pos, radius, height) : true };
    const seg = this.seg;
    seg.start.set(pos.x, pos.y + radius, pos.z);
    seg.end.set(pos.x, pos.y + height - radius, pos.z);
    let pushedUp = 0;

    for (let iter = 0; iter < 3; iter++) {
      this.box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end).expandByScalar(radius);
      let moved = false;
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(this.box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(seg, this.triPt, this.capPt);
          if (d >= radius || d === 0) return false;
          const push = radius - d;
          const n = this.capPt.sub(this.triPt).normalize();
          seg.start.addScaledVector(n, push);
          seg.end.addScaledVector(n, push);
          pos.addScaledVector(n, push);
          if (n.y > 0.45) pushedUp = Math.max(pushedUp, n.y);
          moved = true;
          return false;
        },
      });
      if (!moved) break;
    }

    const onTerrain = this.terrain ? this.resolveTerrain(pos, radius, height) : false;
    return { pos, onGround: pushedUp > 0.45 || onTerrain };
  }
}
