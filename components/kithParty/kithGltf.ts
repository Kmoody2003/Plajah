import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Shared GLTF loader for Kith Party. The Chora and Reello character models (rello.glb, chora.glb) are
 * Draco-compressed, so a plain GLTFLoader fails on them and the race silently falls back to the procedural
 * creature. The decoder is self-hosted under /kith-party/draco/ so the offline build works too.
 */
let draco: DRACOLoader | null = null;
export function kithGltfLoader(): GLTFLoader {
 const loader = new GLTFLoader();
 if (typeof window !== 'undefined') {
  if (!draco) { draco = new DRACOLoader(); draco.setDecoderPath('/kith-party/draco/'); draco.preload(); }
  loader.setDRACOLoader(draco);
 }
 return loader;
}
