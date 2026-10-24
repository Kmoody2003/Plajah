// Poly Haven model loading via the fetch script's index.json (resolution per asset).
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ktx2Ready } from './ktx2';

const ROOT = '/games/ravencrest/assets/polyhaven/';
let index: Promise<{ models: Record<string, string> }> | null = null;
const gltf = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

export function loadModel(id: string): Promise<THREE.Group> {
  index ??= fetch(`${ROOT}index.json`).then((r) => r.json());
  if (!cache.has(id)) {
    cache.set(id, index.then((ix) => {
      const rel = ix.models[id];
      if (!rel) throw new Error(`model ${id} not fetched — run scripts/ravencrest/fetchPolyhaven.mjs`);
      // The KTX2 twin (scripts/ravencrest/ktxPolyhaven.py) first, then the JPEG original.
      const twin = rel.replace(/\.gltf$/, '.ktx2.gltf');
      return ktx2Ready.then((ktx) => { gltf.setKTX2Loader(ktx); return gltf.loadAsync(ROOT + twin); })
        .catch(() => gltf.loadAsync(ROOT + rel)).then((g) => g.scene);
    }));
  }
  return cache.get(id)!.then((s) => {
    const c = s.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Dense scans (>20k tris) are too costly to redraw into the shadow map every frame.
      const g = m.geometry;
      const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      m.castShadow = tris < 20000;
      m.receiveShadow = true;
    });
    return c;
  });
}

/** Uniformly scale so the model's largest horizontal extent (or height) matches. */
export function fitSize(obj: THREE.Object3D, size: number, axis: 'x' | 'y' | 'z' | 'max' = 'max') {
  const s = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  const ref = axis === 'max' ? Math.max(s.x, s.z) : s[axis];
  if (ref > 0) obj.scale.multiplyScalar(size / ref);
}

/** Drop an object so its lowest point sits at y. */
export function groundTo(obj: THREE.Object3D, y: number) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  obj.position.y += y - b.min.y;
}
