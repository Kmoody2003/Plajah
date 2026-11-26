// games/apex/src/tsl/apexWebGpuAdapter.ts
//
// Unified WebGPU / TSL Scene Adapter for Plajah Motorsport: Apex.
// Bridges Apex's existing procedural & scanned assets (`scancar.ts`, `v4` hero glTFs, `sky.ts`,
// `water.ts`, `region.ts`, `showroom.ts`) cleanly onto `THREE.WebGPURenderer` + `playkit/render/*`
// while preserving 100% of Apex's individual visual craft!

import * as THREE from 'three/webgpu';
import { createApexCarPaintTslMaterial, type ApexCarPaintUpdate } from './carPaintTsl';
import { sanitizeObjectForWebGPU } from './apexMaterialsTsl';
import {
  createApexSkyTslMaterial,
  createApexWaterTslMaterial,
  type ApexSkyTslHandle,
  type ApexWaterTslHandle,
} from './worldTsl';
import type { PlaykitGiUniforms } from '../../../../playkit/render/liveLighting';
import type { CarRig } from '../car';
import type { ScanSpec } from '../scancar';

let cachedPlaceholderBlobUrl: string | null = null;

/**
 * Create a genuine 4x4 PNG Blob URL once per session for intercepting legacy `.png` texture paths
 * embedded in `v4` glTF files (when we immediately replace materials with TSL `textures-v4/*.jpg`).
 * Unlike `data:image/png` URIs, `blob:` URLs decode reliably in WebGPU's `ImageBitmapLoader` with
 * zero network traffic and zero console errors.
 */
export async function getPlaceholderPngBlobUrl(): Promise<string> {
  if (cachedPlaceholderBlobUrl) return cachedPlaceholderBlobUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 4, 4);
  }
  const blob = await new Promise<Blob>((resolve) => {
    c.toBlob((b) => resolve(b ?? new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })), 'image/png');
  });
  cachedPlaceholderBlobUrl = URL.createObjectURL(blob);
  return cachedPlaceholderBlobUrl;
}

export interface ApexCarPaintSpecMeta {
  spec: ScanSpec;
  origin: THREE.Vector3;
  size: THREE.Vector3;
  cuts: boolean;
  discardWheels: boolean;
  paintHex: number;
}

/**
 * Upgrade any `CarRig` returned by `loadScanCarById()` onto native WebGPU / TSL:
 *   - Promotes any non-4-byte-aligned vertex attributes (`sanitizeObjectForWebGPU`)
 *   - Replaces the WebGL2 `onBeforeCompile` OEM car paint material with `createApexCarPaintTslMaterial`
 *   - Preserves live `rig.paint.set(...)`, opening doors/hood/trunk, spinning wheels, glowing brakes & lamps!
 */
export function upgradeCarRigToWebGPU(
  rig: CarRig,
  gi?: PlaykitGiUniforms,
  initialPaint?: number | string,
): CarRig {
  sanitizeObjectForWebGPU(rig.group);

  const paintHandles: Array<{ setPaint(o: ApexCarPaintUpdate): void }> = [];
  const replaced = new Map<THREE.Material, THREE.Material>();

  rig.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    let changed = false;
    const nextMats = mats.map((oldMat) => {
      if (replaced.has(oldMat)) {
        changed = true;
        return replaced.get(oldMat)!;
      }
      const meta = oldMat.userData?.__apexCarPaintSpec as ApexCarPaintSpecMeta | undefined;
      if (meta) {
        const handle = createApexCarPaintTslMaterial({
          spec: meta.spec,
          origin: meta.origin,
          size: meta.size,
          paintHex: initialPaint ?? meta.paintHex,
          cuts: meta.cuts,
          discardWheels: meta.discardWheels,
          opponent: false,
          gi,
        });
        paintHandles.push(handle);
        replaced.set(oldMat, handle.material);
        changed = true;
        return handle.material;
      }
      // Strip any residual WebGL-only `onBeforeCompile` so WebGPU NodeMaterial fallback stays clean
      if (oldMat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
        oldMat.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
      }
      return oldMat;
    });
    if (changed) {
      m.material = Array.isArray(m.material) ? nextMats : nextMats[0];
    }
  });

  if (paintHandles.length > 0 && rig.paint) {
    const origSet = rig.paint.set.bind(rig.paint);
    rig.paint.set = (o) => {
      origSet(o);
      for (const h of paintHandles) h.setPaint(o);
    };
  }
  return rig;
}

/** Generate the tileable multi-octave periodic tangent-space normal + foam-height DataTexture for `createApexWaterTslMaterial`. */
export function buildApexWaterNormalTexture(size = 256): THREE.DataTexture {
  const h = new Float32Array(size * size);
  const lat = (n: number, seed: number): Float32Array => {
    const a = new Float32Array(n * n);
    let s = seed;
    for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; }
    return a;
  };
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const octaves: [number, number, number][] = [[4, 1.0, 11], [8, 0.55, 23], [16, 0.3, 37], [32, 0.16, 53], [64, 0.08, 71]];
  for (const [n, amp, seed] of octaves) {
    const L = lat(n, seed);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, fy = (y / size) * n;
        const x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
        const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
        const v = (L[y0 * n + x0] * (1 - tx) + L[y0 * n + x1] * tx) * (1 - ty)
          + (L[y1 * n + x0] * (1 - tx) + L[y1 * n + x1] * tx) * ty;
        h[y * size + x] += v * amp;
      }
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number): number => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3.2;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[o + 3] = Math.round(Math.min(1, Math.max(0, at(x, y) / 2)) * 255);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export interface ApexWebGpuEnvironment {
  sky: ApexSkyTslHandle;
  skyMesh: THREE.Mesh;
  water: ApexWaterTslHandle;
  waterMesh: THREE.Mesh;
  loadSkyPanorama(name: string, onLoaded?: (t: THREE.Texture) => void): void;
}

/**
 * Mount Apex's real equirectangular TSL Sky Dome + Flow-Advected Lake Michigan Water onto any WebGPU scene.
 */
export function mountApexWebGpuSkyAndWater(
  scene: THREE.Scene,
  opts: { rw: number; rh: number; x0?: number; z0?: number; waterY?: number },
): ApexWebGpuEnvironment {
  const x0 = opts.x0 ?? -opts.rw / 2;
  const z0 = opts.z0 ?? -opts.rh / 2;
  const loader = new THREE.TextureLoader();
  const texCache = new Map<string, THREE.Texture>();

  const sky = createApexSkyTslMaterial();
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(18000, 48, 32), sky.material);
  skyMesh.renderOrder = -1000;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  const water = createApexWaterTslMaterial({
    normalTex: buildApexWaterNormalTexture(256),
    region: new THREE.Vector4(x0, z0, opts.rw, opts.rh),
    edge: new THREE.Vector2(opts.rw / 2, opts.rh / 2),
  });
  const waterGeo = new THREE.PlaneGeometry(opts.rw * 2.4, opts.rh * 2.4);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeo, water.material);
  waterMesh.position.set(x0 + opts.rw * 0.5, opts.waterY ?? 2.4, z0 + opts.rh * 0.5);
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  loader.load('/games/apex/region/water_flow.png', (t) => {
    t.colorSpace = THREE.NoColorSpace;
    t.flipY = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    water.setFlowTexture(t);
  });

  const loadSkyPanorama = (name: string, onLoaded?: (t: THREE.Texture) => void) => {
    const cached = texCache.get(name);
    if (cached) {
      sky.setBaseTexture(cached);
      water.setSkyTexture(cached);
      onLoaded?.(cached);
      return;
    }
    loader.load(`/games/apex/tex/${name}.jpg`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      texCache.set(name, t);
      sky.setBaseTexture(t);
      water.setSkyTexture(t);
      onLoaded?.(t);
    });
  };

  return { sky, skyMesh, water, waterMesh, loadSkyPanorama };
}
