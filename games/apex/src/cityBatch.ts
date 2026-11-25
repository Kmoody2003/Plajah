// The city in a handful of draw calls. It used to be one InstancedMesh per mesh part of every building model and colour variant: about 10,000 InstancedMeshes, a few hundred to a few
// thousand of them drawn each frame (and again in the shadow pass). Here every part that shares a MATERIAL goes into one BatchedMesh (three's multi-draw: many geometries,
// many instances, one draw call), so the draw count is the number of building materials (~100), whatever the number of buildings.
//
// Culling: BatchedMesh frustum-culls each instance against every camera that draws it (the view and the shadow cameras); on top of that update() hides small buildings far away
// (the same size-for-distance rule the old per-instance culler used), a share of the instances per frame.
import * as THREE from 'three';

export interface CityPart { geometry: THREE.BufferGeometry; material: THREE.Material; transforms: THREE.Matrix4[]; castShadow: boolean; maxDist?: number }

interface Batch { mesh: THREE.BatchedMesh; ids: Int32Array; spheres: Float32Array; vis: Uint8Array; maxDist: number }

/** position / normal / uv (+ colour when the material uses it) as plain float arrays with an index: every geometry in one BatchedMesh must have the same attributes */
function normalise(g: THREE.BufferGeometry, colours: boolean): THREE.BufferGeometry {
  const src = g.getAttribute('position'), n = src.count, out = new THREE.BufferGeometry();
  const copy = (name: string, size: number, fallback: number): THREE.BufferAttribute => {
    const a = g.getAttribute(name), arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) arr[i * size + c] = a ? a.getComponent(i, c) : fallback;
    return new THREE.BufferAttribute(arr, size);
  };
  out.setAttribute('position', copy('position', 3, 0));
  if (g.getAttribute('normal')) out.setAttribute('normal', copy('normal', 3, 0)); else { out.setAttribute('normal', copy('position', 3, 0)); }
  out.setAttribute('uv', copy('uv', 2, 0));
  if (colours) out.setAttribute('color', copy('color', 3, 1));
  if (g.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array as ArrayLike<number>), 1));
  else { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; out.setIndex(new THREE.BufferAttribute(idx, 1)); }
  if (!g.getAttribute('normal')) out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/** Each building model loads its own copies of the shared materials (same textures, same settings): two materials that would draw the same pixels share a batch (color tints use BatchedMesh.setColorAt). */
function matKey(mat: THREE.Material): string {
  const m = mat as THREE.MeshStandardMaterial;
  const tx = (t?: THREE.Texture | null): string => (t ? String(t.userData?.srcKey ?? t.source?.uuid ?? t.uuid) + ':' + t.repeat.x.toFixed(2) + ',' + t.repeat.y.toFixed(2) + ':' + t.offset.x.toFixed(2) + ',' + t.offset.y.toFixed(2) : '-');
  return [m.type, m.roughness.toFixed(2), m.metalness.toFixed(2), m.emissive?.getHexString(), m.emissiveIntensity.toFixed(2), m.envMapIntensity.toFixed(2), m.opacity.toFixed(2), m.transparent ? 1 : 0, m.side, m.vertexColors ? 1 : 0,
    m.visible ? 1 : 0, m.alphaTest, m.colorWrite ? 1 : 0, m.depthWrite ? 1 : 0, m.blending, m.flatShading ? 1 : 0, tx(m.alphaMap),
    m.normalScale ? m.normalScale.x.toFixed(1) + ',' + m.normalScale.y.toFixed(1) : '-', tx(m.map), tx(m.normalMap), tx(m.roughnessMap), tx(m.metalnessMap), tx(m.aoMap), tx(m.emissiveMap), String(m.userData?.v4HeightKey ?? ''), String(m.userData?.v4OrmKey ?? ''), m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile ? '' : String(m.customProgramCacheKey?.() ?? 'patched')].join('|');
}

export class CityBatches {
  readonly group = new THREE.Group();
  private batches: Batch[] = [];
  viewDist = Infinity;
  shadowDist = Infinity;
  get drawCalls(): number { return this.batches.length; }
  get instances(): number { return this.batches.reduce((s, b) => s + b.ids.length, 0); }

  constructor(parts: CityPart[]) {
    this.group.name = 'city-batched';
    const buckets = new Map<string, CityPart[]>();
    for (const p of parts) {
      if (!p.transforms.length) continue;
      const pm = p.material as THREE.MeshStandardMaterial;
      if (!pm.visible || (pm.transparent && pm.opacity <= 0.01) || !pm.colorWrite) continue;      // parts the model never shows (hidden or fully transparent): batching them would draw them
      const md = p.maxDist ?? Infinity;
      const key = matKey(p.material) + (p.castShadow ? '|s' : '|n') + (Number.isFinite(md) ? `|d${md}` : '');
      let b = buckets.get(key); if (!b) buckets.set(key, b = []);
      b.push(p);
    }
    const sphere = new THREE.Sphere();
    for (const list of buckets.values()) {
      const firstMat = list[0].material as THREE.MeshStandardMaterial;
      const firstHex = firstMat.color?.getHex() ?? 0xffffff;
      const multiColor = list.some((p) => ((p.material as THREE.MeshStandardMaterial).color?.getHex() ?? 0xffffff) !== firstHex);
      let mat = firstMat;
      if (multiColor) {
        mat = firstMat.clone();
        mat.color.setHex(0xffffff);
        mat.onBeforeCompile = firstMat.onBeforeCompile;
        mat.customProgramCacheKey = firstMat.customProgramCacheKey;
      }
      const colours = !!mat.vertexColors;
      const geos = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
      let verts = 0, idxs = 0, insts = 0;
      for (const p of list) {
        if (!geos.has(p.geometry)) { const g = normalise(p.geometry, colours); geos.set(p.geometry, g); verts += g.getAttribute('position').count; idxs += g.index!.count; }
        insts += p.transforms.length;
      }
      const mesh = new THREE.BatchedMesh(insts, verts, idxs, mat);
      mesh.castShadow = list[0].castShadow; mesh.receiveShadow = true;
      mesh.sortObjects = false;                       // opaque: front-to-back sorting is not worth its CPU time here
      mesh.perObjectFrustumCulled = true;
      const geoIds = new Map<THREE.BufferGeometry, number>();
      for (const [src, g] of geos) geoIds.set(src, mesh.addGeometry(g));
      const ids = new Int32Array(insts), spheres = new Float32Array(insts * 4);
      const white = new THREE.Color(0xffffff);
      let k = 0;
      for (const p of list) {
        const gid = geoIds.get(p.geometry)!, bs = geos.get(p.geometry)!.boundingSphere!;
        const pCol = (p.material as THREE.MeshStandardMaterial).color ?? white;
        for (const t of p.transforms) {
          const id = mesh.addInstance(gid);
          mesh.setMatrixAt(id, t);
          if (multiColor) mesh.setColorAt(id, pCol);
          sphere.copy(bs).applyMatrix4(t);
          ids[k] = id; spheres[k * 4] = sphere.center.x; spheres[k * 4 + 1] = sphere.center.y; spheres[k * 4 + 2] = sphere.center.z; spheres[k * 4 + 3] = sphere.radius;
          k++;
        }
      }
      for (const g of geos.values()) g.dispose();
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      this.batches.push({ mesh, ids, spheres, vis: new Uint8Array(insts).fill(1), maxDist: list[0].maxDist ?? Infinity });
      this.group.add(mesh);
    }
  }

  /** hide what is too small for its distance (and too far to cast a shadow worth having); `slice` of `slices` of the instances are rechecked per call */
  update(cam: THREE.Vector3, slice = 0, slices = 1): void {
    const vd = this.viewDist, sd = this.shadowDist;
    for (const b of this.batches) {
      const s = b.spheres, n = b.ids.length, bMax = b.maxDist;
      const effVd = Math.min(vd, bMax);
      for (let i = slice; i < n; i += slices) {
        let on = 1;
        if (effVd !== Infinity) {
          const dx = s[i * 4] - cam.x, dz = s[i * 4 + 2] - cam.z, r = s[i * 4 + 3];
          const dy = Math.max(0, Math.abs(s[i * 4 + 1] - cam.y) - r);
          const dd = Math.sqrt(dx * dx + dz * dz + dy * dy) - r;
          const lim = Number.isFinite(bMax) ? Math.min(effVd, bMax) : Math.min(effVd, Math.max(250, r * 24));
          on = dd < lim || (b.mesh.castShadow && dd < sd) ? 1 : 0;
        }
        if (on !== b.vis[i]) { b.vis[i] = on; b.mesh.setVisibleAt(b.ids[i], on === 1); }
      }
    }
  }

  dispose(): void { for (const b of this.batches) b.mesh.dispose(); this.group.clear(); this.batches = []; }
}
