// Capsule-vs-world collision on a BVH of every mesh tagged `userData.collide`.
// Handles walls, floors, ramps and stairs (steps ≤ ~0.35 m are climbed by the
// capsule's rounded base plus an explicit step-up probe).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

/** Mark an object (and its descendants) as world collision. */
export function collide<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => { c.userData.collide = true; });
  return o;
}

export class CollisionWorld {
  private bvh: MeshBVH | null = null;
  readonly debugMesh: THREE.Mesh;

  constructor(private root: THREE.Object3D) {
    this.debugMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicNodeMaterial({ wireframe: true, color: 0x33ff88 }));
    this.debugMesh.visible = false;
  }

  /** (Re)build from the current scene graph. Call after async props finish loading. */
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
    const merged = mergeGeometries(geos, false)!;
    this.bvh = new MeshBVH(merged);
    this.debugMesh.geometry = merged;
  }

  /** Down-ray for ground height under a point (null if nothing within range). */
  groundAt(x: number, z: number, fromY: number, maxDrop = 50): number | null {
    if (!this.bvh) return null;
    const ray = new THREE.Ray(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    const hit = this.bvh.raycastFirst(ray, THREE.DoubleSide);
    return hit && hit.distance <= maxDrop ? hit.point.y : null;
  }

  /** First hit distance along a ray (camera boom collision). */
  rayDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number): number {
    if (!this.bvh) return max;
    const hit = this.bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide);
    return hit && hit.distance < max ? hit.distance : max;
  }

  private seg = new THREE.Line3();
  private box = new THREE.Box3();
  private triPt = new THREE.Vector3();
  private capPt = new THREE.Vector3();

  /**
   * Resolve a capsule (feet at `pos`, given radius/height) out of the world.
   * Returns the corrected position and whether it is standing on ground.
   */
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
          if (d < radius) {
            const depth = radius - d;
            const dir = this.capPt.clone().sub(this.triPt).normalize();
            seg.start.addScaledVector(dir, depth);
            seg.end.addScaledVector(dir, depth);
            if (dir.y > 0.5) pushedUp += depth;
            moved = true;
          }
          return false;
        },
      });
      if (!moved) break;
    }
    const out = new THREE.Vector3(seg.start.x, seg.start.y - radius, seg.start.z);
    return { pos: out, onGround: pushedUp > 1e-4 };
  }
}
