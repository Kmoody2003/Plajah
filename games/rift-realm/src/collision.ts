// BVH collision world for capsule movement and hitscan raycasting.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

/** Mark an object (and its descendants) as solid world geometry. */
export function collide<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((c) => { c.userData.collide = true; });
  return obj;
}

export class CollisionWorld {
  private bvh: MeshBVH | null = null;

  constructor(private root: THREE.Object3D) {}

  rebuild() {
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
    if (!this.bvh) return null;
    const hit = this.bvh.raycastFirst(
      new THREE.Ray(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)),
      THREE.DoubleSide,
    );
    return hit && hit.distance <= maxDrop ? hit.point.y : null;
  }

  rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    if (!this.bvh) return max;
    const hit = this.bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide);
    return hit && hit.distance < max ? hit.distance : max;
  }

  private seg = new THREE.Line3();
  private box = new THREE.Box3();
  private triPt = new THREE.Vector3();
  private capPt = new THREE.Vector3();

  resolve(pos: THREE.Vector3, radius: number, height: number): { pos: THREE.Vector3; onGround: boolean } {
    if (!this.bvh) return { pos, onGround: true };
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

    return { pos, onGround: pushedUp > 0.45 };
  }
}
