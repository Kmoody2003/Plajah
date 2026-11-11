// Static batching: merge every static mesh that shares a material (and shadow/collision
// flags) into one world-space mesh. The procedural kit produces hundreds of small meshes
// (balusters, steps, merlons, candles); at ~0.04 ms CPU per draw that alone cost >20 ms
// a frame. Merged levels render in tens of draws.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];

export function mergeStatic(root: THREE.Object3D, exclude: Set<THREE.Object3D>): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const groups = new Map<string, THREE.Mesh[]>();
  let before = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    before++;
    if ((m as unknown as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material) || exclude.has(m) || m.userData.dynamic || m.userData.merged) return;
    // Anything under an excluded/dynamic ancestor (e.g. Jack) stays as-is.
    for (let p = m.parent; p; p = p.parent) if (exclude.has(p) || p.userData.dynamic) return;
    const g = m.geometry;
    if (!g?.attributes.position || !KEEP.every((k) => k === 'uv' || g.attributes[k])) return;
    const sig = KEEP.filter((k) => g.attributes[k]).join(',');
    const key = `${(m.material as THREE.Material).uuid}|${m.castShadow}|${m.receiveShadow}|${!!m.userData.collide}|${m.renderOrder}|${sig}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  });

  const batch = new THREE.Group();
  batch.name = 'staticBatch';
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      const src = m.geometry;
      const g = new THREE.BufferGeometry();
      for (const k of KEEP) if (src.attributes[k]) g.setAttribute(k, src.attributes[k].clone());
      if (src.index) g.setIndex(src.index.clone());
      g.applyMatrix4(m.matrixWorld);
      return g.index ? g.toNonIndexed() : g;
    });
    // Uniform attribute sets only (a uv-less piece can't join a uv'd batch).
    const withUv = geos.every((g) => g.attributes.uv);
    if (!withUv) geos.forEach((g) => g.deleteAttribute('uv'));
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const first = meshes[0];
    const out = new THREE.Mesh(merged, first.material);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.renderOrder = first.renderOrder;
    out.userData.collide = first.userData.collide;
    out.userData.merged = true;
    batch.add(out);
    for (const m of meshes) m.removeFromParent();
  }
  root.add(batch);
  let after = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) after++; });
  return { before, after };
}
