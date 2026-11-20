// Plajah Vegetation — a forest of grown trees (docs/plajah-vegetation.md §2.3).
//
// Each species is grown as a few variants (seeds) at two detail levels; every placement is an instance of one variant.
// Near trees use the full-detail mesh, far trees the coarse one (swapped by distance every few frames). Instances carry
// aInst (x, z, yaw, scale) for the wind. Next steps (phase 1 gate): hemi-octahedral impostors beyond the coarse range,
// GPU culling per cell.
import * as THREE from 'three/webgpu';
import type { TreeSpecies } from '../species';
import { growTree } from './grow';
import { buildTreeGeometry } from './mesh';
import { treeMaterials } from './material';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface TreeSpot { x: number; y: number; z: number; yaw: number; species: number; scale: number }

interface Bucket {
  near: { wood: THREE.InstancedMesh; leaves: THREE.InstancedMesh };
  far: { wood: THREE.InstancedMesh; leaves: THREE.InstancedMesh };
  spots: TreeSpot[];
}

export interface ForestOptions {
  variants?: number;
  /** Distance (m) where trees switch to the coarse mesh. */
  nearRange?: number;
  lowTier?: boolean;
  beat?: N;
  shadows?: boolean;
}

export class Forest {
  readonly group = new THREE.Group();
  private buckets: Bucket[] = [];
  private t = 0;
  private nearRange: number;

  constructor(species: TreeSpecies[], spots: TreeSpot[], o: ForestOptions = {}) {
    const variants = o.variants ?? 3, lo = !!o.lowTier;
    this.nearRange = o.nearRange ?? (lo ? 32 : 60);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v = new THREE.Vector3();
    species.forEach((sp, si) => {
      for (let vi = 0; vi < variants; vi++) {
        const mine = spots.filter((p, k) => p.species === si && (k * 7 + Math.floor(p.x * 13 + p.z * 7)) % variants === vi);
        if (!mine.length) continue;
        const seed = si * 101 + vi * 13 + 1;
        const fullSk = growTree(sp, seed, { scale: 1, detail: lo ? 0.6 : 1 });
        const lowSk = growTree(sp, seed, { scale: 1, detail: 0.3 });
        const full = buildTreeGeometry(fullSk, sp, { radial: lo ? 8 : 14 });
        const low = buildTreeGeometry(lowSk, sp, { radial: 5 });
        const mats = treeMaterials(sp, full.height, { beat: o.beat });
        const make = (geo: THREE.BufferGeometry, mat: THREE.Material, castShadow: boolean) => {
          const g = geo.clone();
          g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 4), 4));
          const im = new THREE.InstancedMesh(g, mat, mine.length);
          im.castShadow = castShadow && !!o.shadows; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
          this.group.add(im);
          return im;
        };
        const b: Bucket = {
          near: { wood: make(full.wood, mats.wood, true), leaves: make(full.leaves, mats.leaves, true) },
          far: { wood: make(low.wood, mats.wood, false), leaves: make(low.leaves, mats.leaves, true) },
          spots: mine,
        };
        // instance matrices are rewritten in update(); seed them all as near so a first frame shows the forest
        this.buckets.push(b);
        void m4; void q; void s3; void v;
      }
    });
    this.update(new THREE.Vector3(0, 0, 0), 1);
  }

  /** Re-sort instances into near / far by distance to the camera (cheap; every few frames). */
  update(camera: THREE.Vector3, dt = 0) {
    this.t += dt;
    if (dt && this.t < 0.25) return;
    this.t = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const r2 = this.nearRange * this.nearRange;
    for (const b of this.buckets) {
      let nn = 0, nf = 0;
      for (const p of b.spots) {
        const near = (p.x - camera.x) ** 2 + (p.z - camera.z) ** 2 < r2;
        const set = near ? b.near : b.far, i = near ? nn++ : nf++;
        m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), s3.set(p.scale, p.scale, p.scale));
        for (const im of [set.wood, set.leaves]) {
          im.setMatrixAt(i, m4);
          const a = im.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
          a.setXYZW(i, p.x, p.z, p.yaw, p.scale);
          a.needsUpdate = true;
        }
      }
      for (const [set, n] of [[b.near, nn], [b.far, nf]] as const) {
        for (const im of [set.wood, set.leaves]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
      }
    }
  }
}
