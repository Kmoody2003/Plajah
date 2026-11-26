// games/apex/src/tsl/webgpuRuntime.ts
//
// Shared runtime state bridging `region.ts` (when booted on native `THREE.WebGPURenderer`)
// with world subsystems (`sky.ts`, `water.ts`, `vegetation.ts`, `trees.ts`, `ezforest.ts`,
// `spray.ts`, `weather.ts`, `wildlifeWorld.ts`, `scancar.ts`, `carLibraryInstancer.ts`)
// without circular imports.

import * as THREE from 'three';
import * as THREE_GPU from 'three/webgpu';
import {
  createApexTslSharedUniforms,
  type ApexTslSharedUniforms,
} from './apexMaterialsTsl';
import {
  createApexFoliageUniforms,
  type ApexFoliageUniforms,
} from './worldTsl';
import type { PlaykitGiUniforms } from '../../../../playkit/render/liveLighting';

let textureGuardInstalled = false;

/**
 * Three.js r184 `Textures.updateTexture()` checks `if (image === undefined) ... else if (image.complete === false)`,
 * which throws `TypeError: Cannot read properties of null (reading 'complete')` whenever a still-loading `TextureLoader`
 * texture (whose `source.data` starts as `null`) is `.clone()`d or has `needsUpdate = true` called before load completes.
 * Guarding `needsUpdate` & `copy()` prevents `source.version` from becoming > 0 while `image === null`, protecting the
 * WebGPU render pass encoder from ever aborting mid-frame.
 */
function installWebGpuNullImageGuard(): void {
  if (textureGuardInstalled) return;
  textureGuardInstalled = true;
  const protos = new Set<object>([THREE.Texture.prototype, THREE_GPU.Texture.prototype]);
  for (const proto of protos) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'needsUpdate');
    if (desc && typeof desc.set === 'function') {
      const origSet = desc.set;
      Object.defineProperty(proto, 'needsUpdate', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(this: THREE.Texture, value: boolean) {
          if (value) {
            const anyT = this as unknown as {
              image?: unknown;
              isCompressedTexture?: boolean;
              isRenderTargetTexture?: boolean;
              isDataTexture?: boolean;
              isData3DTexture?: boolean;
              isDataArrayTexture?: boolean;
              isDepthTexture?: boolean;
              isFramebufferTexture?: boolean;
              isCubeTexture?: boolean;
              isStorageTexture?: boolean;
            };
            const special =
              anyT.isCompressedTexture ||
              anyT.isRenderTargetTexture ||
              anyT.isDataTexture ||
              anyT.isData3DTexture ||
              anyT.isDataArrayTexture ||
              anyT.isDepthTexture ||
              anyT.isFramebufferTexture ||
              anyT.isCubeTexture ||
              anyT.isStorageTexture;
            if (!special && anyT.image == null) {
              return;
            }
          }
          origSet.call(this, value);
        },
      });
    }
  }
}

export interface ApexRegionTslContext {
  active: boolean;
  shared: ApexTslSharedUniforms;
  foliage: ApexFoliageUniforms;
  gi: PlaykitGiUniforms;
}

let activeCtx: ApexRegionTslContext | null = null;

/**
 * Determine whether `region.html` should boot on native `THREE.WebGPURenderer` + Playkit Unified Post.
 * WebGPU is the default whenever `navigator.gpu` is present, with `?renderer=webgl` / `?webgl=1`
 * or `localStorage['apex.renderer'] === 'webgl'` as a clean escape hatch for A/B comparison.
 */
export function isRegionWebGpuRequested(): boolean {
  try {
    const params = new URLSearchParams(location.search);
    const q = (params.get('renderer') ?? '').toLowerCase();
    if (q === 'webgl' || q === 'webgl2' || params.has('webgl')) return false;
    if (q === 'webgpu' || params.has('webgpu')) return true;
    const saved = (localStorage.getItem('apex.renderer') ?? '').toLowerCase();
    if (saved === 'webgl' || saved === 'webgl2') return false;
    if (saved === 'webgpu') return true;
  } catch { /* storage/location unavailable */ }
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** Initialize the shared WebGPU/TSL uniform context once `WebGPURenderer` is selected. */
export function initRegionTslContext(gi: PlaykitGiUniforms, nearTreeR = 246): ApexRegionTslContext {
  installWebGpuNullImageGuard();
  activeCtx = {
    active: true,
    shared: createApexTslSharedUniforms(),
    foliage: createApexFoliageUniforms(nearTreeR),
    gi,
  };
  return activeCtx;
}

/** Returns the active WebGPU/TSL context, or `null` when running on the legacy WebGL2 renderer. */
export function getRegionTslContext(): ApexRegionTslContext | null {
  return activeCtx && activeCtx.active ? activeCtx : null;
}

export function isRegionWebGpuActive(): boolean {
  return Boolean(activeCtx && activeCtx.active);
}
