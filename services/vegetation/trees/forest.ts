// Plajah Vegetation — a forest of grown trees (docs/plajah-vegetation.md §2.3).
//
// Each species is grown as a few variants (seeds) at two mesh detail levels; every placement is an instance of one
// variant. Three levels: the full mesh near, the coarse mesh at mid range, a hemi-octahedral impostor card beyond
// (baked once on the device by bake()). Trees outside the camera's view are skipped. Instances carry aInst
// (x, z, yaw, scale) for the wind; impostors carry aCenter/aYaw.
import * as THREE from 'three/webgpu';
import type { TreeSpecies } from '../species';
import { growTree, rng, type TreeSkeleton } from './grow';
import { buildTreeGeometry, type TreeGeometry } from './mesh';
import { texturesReady, treeMaterials, type TreeMaterials } from './material';
import { bakeImpostor, impostorMaterial, impostorMesh, setImpostor } from '../lod/impostor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export interface TreeSpot { x: number; y: number; z: number; yaw: number; species: number; scale: number }

interface Bucket {
  near: { wood: THREE.InstancedMesh; leaves: THREE.InstancedMesh };
  mid: { wood: THREE.InstancedMesh; leaves: THREE.InstancedMesh };
  far: THREE.InstancedMesh | null;
  spots: TreeSpot[];
  full: TreeGeometry; mats: TreeMaterials; radius: number;
  sk: TreeSkeleton; crownBase: number;
}

export interface ForestOptions {
  variants?: number;
  /** Distances (m) where trees go from the full mesh to the coarse mesh, and from the coarse mesh to impostors. */
  nearRange?: number; midRange?: number;
  lowTier?: boolean;
  beat?: N;
  shadows?: boolean;
}

export interface ForestStats { near: number; mid: number; far: number; culled: number; triangles: number }

export class Forest {
  readonly group = new THREE.Group();
  readonly stats: ForestStats = { near: 0, mid: 0, far: 0, culled: 0, triangles: 0 };
  private buckets: Bucket[] = [];
  private t = 0;
  private near: number; private mid: number;
  private frustum = new THREE.Frustum(); private pv = new THREE.Matrix4(); private sph = new THREE.Sphere();

  constructor(species: TreeSpecies[], spots: TreeSpot[], private o: ForestOptions = {}) {
    const variants = o.variants ?? 3, lo = !!o.lowTier;
    this.near = o.nearRange ?? (lo ? 30 : 55);
    this.mid = o.midRange ?? (lo ? 70 : 130);
    species.forEach((sp, si) => {
      for (let vi = 0; vi < variants; vi++) {
        const mine = spots.filter((p, k) => p.species === si && (k * 7 + Math.floor(Math.abs(p.x * 13 + p.z * 7))) % variants === vi);
        if (!mine.length) continue;
        const seed = si * 101 + vi * 13 + 1;
        const sk = growTree(sp, seed, { scale: 1, detail: lo ? 0.6 : 1 });
        const full = buildTreeGeometry(sk, sp, { radial: lo ? 8 : 14 });
        const low = buildTreeGeometry(growTree(sp, seed, { scale: 1, detail: 0.3 }), sp, { radial: 5 });
        const mats = treeMaterials(sp, full.height, { beat: o.beat });
        const make = (geo: THREE.BufferGeometry, mat: THREE.Material, castShadow: boolean) => {
          const g = geo.clone();
          g.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(mine.length * 4), 4));
          const im = new THREE.InstancedMesh(g, mat, mine.length);
          im.castShadow = castShadow && !!o.shadows; im.receiveShadow = true; im.frustumCulled = false; im.count = 0;
          this.group.add(im);
          return im;
        };
        full.wood.computeBoundingSphere(); full.leaves.computeBoundingSphere();
        this.buckets.push({
          near: { wood: make(full.wood, mats.wood, true), leaves: make(full.leaves, mats.leaves, true) },
          // mid range: coarse wood, but the full leaf set (cards are cheap; a thin crown reads as a dead tree)
          mid: { wood: make(low.wood, mats.wood, false), leaves: make(full.leaves, mats.leaves, true) },
          far: null, spots: mine, full, mats, sk, crownBase: sp.trunk.crownBase,
          radius: Math.max(full.wood.boundingSphere!.radius, full.leaves.boundingSphere!.radius),
        });
      }
    });
    this.update(new THREE.Vector3(0, 0, 0), 1);
  }

  /** Branch points under the crowns where things can hang (vines, lanterns), world space: up to `perTree` per tree,
   *  chosen from limbs and branches in the lower crown, out toward its edge. Deterministic for a seed. */
  hangPoints(perTree = 3, keep: (p: TreeSpot) => boolean = () => true, seed = 7): { x: number; y: number; z: number; tree: TreeSpot }[] {
    const out: { x: number; y: number; z: number; tree: TreeSpot }[] = [], R = rng(seed);
    for (const b of this.buckets) {
      const H = b.sk.height, nodes = b.sk.nodes;
      const spread = Math.max(...nodes.map((n) => Math.hypot(n.x, n.z)));
      const cand = nodes.filter((n) => !n.root && n.order >= 1 && n.y > H * b.crownBase * 0.95 && n.y < H * 0.78 && Math.hypot(n.x, n.z) > spread * 0.35);
      if (!cand.length) continue;
      for (const p of b.spots) {
        if (!keep(p)) continue;
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        for (let k = 0; k < perTree; k++) {
          const n = cand[Math.floor(R() * cand.length)];
          out.push({ x: p.x + (n.x * c + n.z * s) * p.scale, y: p.y + n.y * p.scale, z: p.z + (-n.x * s + n.z * c) * p.scale, tree: p });
        }
      }
    }
    return out;
  }

  /** Bake every variant's impostor (once, after the renderer is up). Without it, far trees stay on the coarse mesh. */
  async bake(renderer: THREE.WebGPURenderer) {
    await texturesReady();
    for (const b of this.buckets) {
      const one = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
        const g = geo.clone(), n = g.getAttribute('position').count, a = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) a[i * 4 + 3] = 1;                     // still air: aInst = (0, 0, 0, 1)
        g.setAttribute('aInst', new THREE.BufferAttribute(a, 4));
        return new THREE.Mesh(g, mat);
      };
      const atlas = await bakeImpostor(renderer, [one(b.full.wood, b.mats.wood), one(b.full.leaves, b.mats.leaves)], { frames: this.o.lowTier ? 5 : 6, size: this.o.lowTier ? 768 : 1024 });
      b.far = impostorMesh(atlas, b.spots.length, impostorMaterial(atlas, { brightness: 1.3 }));
      this.group.add(b.far);
    }
    this.t = 1;
  }

  /** Sort instances into near / mid / far by distance, skipping trees outside the view (every few frames). */
  update(view: THREE.Vector3 | THREE.Camera, dt = 0) {
    this.t += dt;
    if (dt && this.t < 0.2) return;
    this.t = 0;
    const cam = (view as THREE.Camera).isCamera ? view as THREE.Camera : null;
    const pos = cam ? cam.getWorldPosition(new THREE.Vector3()) : (view as THREE.Vector3);
    if (cam) { this.pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pv); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const n2 = this.near ** 2, m2 = this.mid ** 2;
    const st = this.stats; st.near = st.mid = st.far = st.culled = st.triangles = 0;
    for (const b of this.buckets) {
      let nn = 0, nm = 0, nf = 0;
      for (const p of b.spots) {
        if (cam) { this.sph.center.set(p.x, p.y + b.radius * 0.5 * p.scale, p.z); this.sph.radius = b.radius * p.scale; if (!this.frustum.intersectsSphere(this.sph)) { st.culled++; continue; } }
        const d2 = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        if (d2 > m2 && b.far) { setImpostor(b.far, nf++, p.x, p.y, p.z, p.yaw, p.scale); continue; }
        const near = d2 < n2, set = near ? b.near : b.mid, i = near ? nn++ : nm++;
        m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), s3.set(p.scale, p.scale, p.scale));
        for (const im of [set.wood, set.leaves]) {
          im.setMatrixAt(i, m4);
          const a = im.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
          a.setXYZW(i, p.x, p.z, p.yaw, p.scale); a.needsUpdate = true;
        }
      }
      for (const [set, n] of [[b.near, nn], [b.mid, nm]] as const) for (const im of [set.wood, set.leaves]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
      if (b.far) b.far.count = nf;
      st.near += nn; st.mid += nm; st.far += nf;
      const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      st.triangles += nn * (tri(b.near.wood.geometry) + tri(b.near.leaves.geometry)) + nm * (tri(b.mid.wood.geometry) + tri(b.mid.leaves.geometry)) + nf * 2;
    }
  }
}
