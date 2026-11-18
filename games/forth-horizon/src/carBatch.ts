// Draw-call batching for the hero car. The scan car is built from about 1,200 small meshes (wheel hardware, suspension, engine, cabin, driver, lamps): that many draw calls every frame is what makes a
// high quality car cost frame rate, long before the triangle count does. Anything that cannot move relative to its ancestor can be merged into that ancestor with its transform baked in, so:
//   - `dynamic` lists the nodes the car really moves (wheel spin and steer groups, door / hood / trunk pivots); a node with such a descendant is left as a hierarchy, but
//   - every subtree below it that holds no moving node is flattened: all its meshes that share a material become one mesh.
// Not merged: meshes flagged userData.keep (the gas struts, moved one by one every frame), instanced or skinned meshes, transparent materials, and any material with its own shader patch (the scan
// paint reads the vertex's object-space position to place glass, lamps and panel cuts, so its meshes must keep their own transforms). Nothing changes on screen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const NO_PATCH = THREE.Material.prototype.onBeforeCompile;

export interface BatchStats { before: number; after: number; groups: number }

const countMeshes = (root: THREE.Object3D): number => { let n = 0; root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };

function mergeable(m: THREE.Mesh): boolean {
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.userData.keep || !m.visible || m.children.length) return false;
  if (Array.isArray(m.material) || m.material.onBeforeCompile !== NO_PATCH || m.material.transparent || (m.material as THREE.MeshStandardMaterial).vertexColors || !m.geometry.getAttribute('position')) return false;
  return true;
}

/** Two materials that look identical (the car's parts each made their own `std(colour, roughness, metalness)`) merge into one draw: the key is everything that affects the pixels. */
function matKey(mat: THREE.Material): string {
  const m = mat as THREE.MeshPhysicalMaterial & { map?: THREE.Texture | null; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null; metalnessMap?: THREE.Texture | null; emissiveMap?: THREE.Texture | null };
  const tx = (t?: THREE.Texture | null): string => (t ? t.uuid : '-');
  const c = (m.color as THREE.Color | undefined)?.getHexString() ?? '-', e = (m.emissive as THREE.Color | undefined)?.getHexString() ?? '-';
  return [m.type, c, m.roughness, m.metalness, e, m.emissiveIntensity, m.opacity, m.side, m.flatShading ? 1 : 0, m.envMapIntensity, m.clearcoat ?? 0, m.clearcoatRoughness ?? 0, m.ior ?? 0, tx(m.map), tx(m.normalMap), tx(m.roughnessMap), tx(m.metalnessMap), tx(m.emissiveMap), m.vertexColors ? 1 : 0, m.polygonOffset ? 1 : 0].join('|');
}

/** merge `list` (meshes under `into`) by material; `rel(mesh)` is the mesh's transform relative to `into` */
function mergeInto(into: THREE.Object3D, list: THREE.Mesh[], rel: (m: THREE.Mesh) => THREE.Matrix4): number {
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const m of list) {
    const key = `${matKey(m.material as THREE.Material)}|${+m.castShadow}${+m.receiveShadow}|${m.renderOrder}|${m.frustumCulled}`;
    let b = buckets.get(key); if (!b) buckets.set(key, b = []);
    b.push(m);
  }
  let made = 0;
  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    try {
      const geos: THREE.BufferGeometry[] = [];
      for (const m of group) {
        const g = m.geometry.clone();
        g.applyMatrix4(rel(m));
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
        g.clearGroups();
        geos.push(g.index ? g.toNonIndexed() : g);                              // indexed and plain geometries cannot be merged together: make them all plain
      }
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const first = group[0];
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.name = 'batched'; mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder; mesh.frustumCulled = first.frustumCulled;
      for (const m of group) { m.parent?.remove(m); m.geometry.dispose(); }
      for (const g of geos) g.dispose();
      into.add(mesh);
      made++;
    } catch (e) { console.warn('carBatch: left a group unmerged', e); }
  }
  return made;
}

export function batchStatic(root: THREE.Object3D, dynamic: Iterable<THREE.Object3D> = []): BatchStats {
  const before = countMeshes(root);
  root.updateMatrixWorld(true);
  const dyn = new Set(dynamic);
  // does anything below `o` (not `o` itself) move, or need to stay a separate mesh?
  const memo = new Map<THREE.Object3D, boolean>();
  const dirty = (o: THREE.Object3D): boolean => {
    const have = memo.get(o); if (have !== undefined) return have;
    let d = false;
    for (const c of o.children) { if (dyn.has(c) || (c as THREE.Mesh).userData.keep || dirty(c)) { d = true; break; } }
    memo.set(o, d);
    return d;
  };
  let groups = 0;
  const visit = (N: THREE.Object3D): void => {
    if ((N as THREE.Mesh).isMesh) return;
    if (!dirty(N)) {
      // nothing below moves relative to N: flatten the whole subtree into N
      const list: THREE.Mesh[] = [];
      N.traverse((o) => { if (o !== N && mergeable(o as THREE.Mesh)) list.push(o as THREE.Mesh); });
      if (list.length > 1) {
        const inv = new THREE.Matrix4().copy(N.matrixWorld).invert();
        groups += mergeInto(N, list, (m) => new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      }
      return;
    }
    // N is part of a moving hierarchy: merge only its own direct mesh children, then look into the child nodes
    const own = N.children.filter((c) => mergeable(c as THREE.Mesh)) as THREE.Mesh[];
    if (own.length > 1) groups += mergeInto(N, own, (m) => { m.updateMatrix(); return m.matrix; });
    for (const c of [...N.children]) visit(c);
  };
  visit(root);
  return { before, after: countMeshes(root), groups };
}
