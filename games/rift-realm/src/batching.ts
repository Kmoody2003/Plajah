// Draw-call batching helpers (the forest levels were CPU-bound on draw submission on the Intel iGPU: ~0.04 ms of
// three r184 render loop per draw, ~900 draws in Elderwood). gfx.ts has the render profiles.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/**
 * Merge the meshes under `root` that never move relative to it into one mesh per material (in root's local space).
 * For rigid props built from many primitives (forage clusters, weapon models, hazard props). Skips instanced, skinned
 * and morphing meshes, multi-material meshes and hidden ones; `keep(mesh)` false leaves a mesh as it is.
 * Returns the merged meshes (the originals are removed from the graph).
 */
export function mergeRigid(root: THREE.Object3D, keep?: (m: THREE.Mesh) => boolean): THREE.Mesh[] {
  root.updateWorldMatrix(true, true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material) || m.morphTargetInfluences || !m.visible || m === root) return;
    if (keep && !keep(m)) return;
    for (let p = m.parent; p && p !== root; p = p.parent) if (!p.visible) return;
    const g = m.geometry, attrs = Object.keys(g.attributes).sort().map((k) => `${k}${g.attributes[k].itemSize}`).join(',');
    _m.multiplyMatrices(_inv, m.matrixWorld);
    const key = `${m.material.uuid}|${attrs}|${g.index ? 'i' : 'n'}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${_m.determinant() < 0 ? '-' : '+'}`;
    let e = groups.get(key);
    if (!e) groups.set(key, (e = { mat: m.material, meshes: [] }));
    e.meshes.push(m);
  });
  const out: THREE.Mesh[] = [];
  for (const { mat, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      const g = m.geometry.clone();
      g.morphAttributes = {};
      g.applyMatrix4(_m.multiplyMatrices(_inv, m.matrixWorld));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat), f = meshes[0];
    mesh.castShadow = f.castShadow; mesh.receiveShadow = f.receiveShadow; mesh.renderOrder = f.renderOrder; mesh.frustumCulled = f.frustumCulled;
    mesh.name = `${root.name || 'merged'}:batch`;
    root.add(mesh);
    for (const m of meshes) m.removeFromParent();
    out.push(mesh);
  }
  return out;
}
