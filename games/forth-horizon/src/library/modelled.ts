import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Modelled library pieces: the Plajah 3D builds of Kenne's district sheets (tools/data/district_assets.json, scripts/apex-build-district-assets.mjs),
 * public/games/forth-horizon/library/<id>.glb, listed in library/index.json with the size each is placed at. A district asks for a piece by id with
 * its code-built version as the fallback: the modelled one is used when it loaded, so a piece without a build (or a failed load) still stands.
 *
 * Models face +Z (the sheet's front elevation), stand on y = 0 and are scaled uniformly so their width is the entry's width: the art's own
 * proportions are kept, depth and height follow from them.
 */
const BASE = '/games/forth-horizon/library/';
interface Entry { id: string; size: [number, number, number] }
const ready = new Map<string, THREE.Group>();

export async function preloadModelledPieces(): Promise<string[]> {
  const idx = await fetch(BASE + 'index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { pieces: Entry[] } | null;
  if (!idx) return [];
  const loader = new GLTFLoader();
  await Promise.all(idx.pieces.map(async (e) => {
    try {
      const g = (await loader.loadAsync(BASE + e.id + '.glb')).scene;
      const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const k = e.size[0] / Math.max(sz.x, 1e-3);
      const root = new THREE.Group(); root.name = 'lib-model:' + e.id;
      g.position.set(-c.x * k, -box.min.y * k, -c.z * k); g.scale.setScalar(k);
      g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      root.add(g);
      ready.set(e.id, root);
    } catch (err) { console.warn('library model', e.id, 'failed', err); }
  }));
  return [...ready.keys()];
}

/** the modelled piece `id` if it loaded, else the code-built fallback */
export function piece(id: string, fallback: () => THREE.Group): THREE.Group {
  const m = ready.get(id);
  return m ? m.clone(true) : fallback();
}

/** the footprint (width, depth) a modelled piece takes, for clearance checks; null when it isn't loaded */
export function pieceFootprint(id: string): [number, number] | null {
  const m = ready.get(id);
  if (!m) return null;
  const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
  return [s.x, s.z];
}
