// GPU-compressed textures (KTX2 / Basis Universal, scripts/ravencrest/ktxGlb.py). The GLBs' textures stay
// block-compressed in video memory (BC7/BC1 on desktop, ASTC/ETC on phones) instead of unpacking to RGBA.
// KTX2Loader needs the renderer to pick a target format, so model loads wait for initKTX2(renderer).
import type * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let resolveReady!: (k: KTX2Loader) => void;
/** Resolves once the renderer is up and the transcoder is configured. */
export const ktx2Ready = new Promise<KTX2Loader>((res) => { resolveReady = res; });

export function initKTX2(renderer: THREE.WebGPURenderer) {
  const k = new KTX2Loader().setTranscoderPath('/games/ravencrest/basis/');
  k.detectSupport(renderer as unknown as Parameters<KTX2Loader['detectSupport']>[0]);
  resolveReady(k);
}
