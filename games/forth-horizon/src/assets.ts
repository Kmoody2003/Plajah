import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const modelCache = new Map<string, Promise<THREE.Group | null>>();

export function loadIronportBuilding(
  kind: 'hero' | 'generic',
  slug: string,
  lod: 0 | 1 = 0
): Promise<THREE.Group | null> {
  const url = `/ironport-assets/models/${kind}/${slug}_lod${lod}.gltf`;
  let p = modelCache.get(url);
  if (!p) {
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        const root = gltf.scene;
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        return root;
      })
      .catch((err) => {
        console.warn(`Failed to load building ${url}:`, err);
        return null;
      });
    modelCache.set(url, p);
  }
  return p.then((g) => (g ? g.clone(true) : null));
}

export function loadRepeatingTexture(url: string, repeatX: number, repeatY: number): THREE.Texture {
  const tex = texLoader.load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
