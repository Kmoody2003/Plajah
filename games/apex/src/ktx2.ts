// GPU-compressed building textures (tools/ktx_textures.py writes <name>.ktx2 next to each <name>.jpg). A texture that has a .ktx2 twin stays block-compressed in video memory (BC7 on
// desktop, ASTC/ETC on phones) instead of unpacking to RGBA, about 4x less VRAM and a fast transcode instead of a JPEG decode. Anything without a twin falls back to the JPG.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let ktx: KTX2Loader | null = null;
let ktxReadyResolve: (() => void) | null = null;
export const ktxReadyPromise: Promise<void> = new Promise((res) => { ktxReadyResolve = res; });
const ktxInFlight = new Map<string, Promise<THREE.Texture>>();
let tinyTex: THREE.DataTexture | null = null;
function getTinyTex(): THREE.DataTexture {
  if (!tinyTex) {
    tinyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    tinyTex.userData._sharedTiny = true;
    tinyTex.needsUpdate = true;
  }
  return tinyTex;
}

const placeholderCache = new Map<string, THREE.DataTexture>();
function archPlaceholderRgb(key: string): [number, number, number] {
  if (/red-brick/i.test(key)) return [128, 64, 50];
  if (/weathered-brick/i.test(key)) return [110, 74, 60];
  if (/orange-brick/i.test(key)) return [148, 86, 54];
  if (/limestone/i.test(key)) return [184, 174, 156];
  if (/white-marble|white-stucco/i.test(key)) return [208, 204, 196];
  if (/granite/i.test(key)) return [114, 116, 120];
  if (/terracotta/i.test(key)) return [168, 94, 68];
  if (/bronze/i.test(key)) return [88, 70, 54];
  if (/copper/i.test(key)) return [84, 118, 102];
  if (/steel|corrugated/i.test(key)) return [128, 136, 144];
  if (/concrete/i.test(key)) return [142, 140, 134];
  if (/timber/i.test(key)) return [118, 86, 58];
  if (/slate/i.test(key)) return [64, 70, 78];
  if (/stone/i.test(key)) return [124, 118, 108];
  if (/glass/i.test(key)) return [42, 68, 96];
  if (/hero/i.test(key)) return [138, 142, 148];
  return [140, 138, 134];
}

function getArchPlaceholder(cacheKey: string, isNormal: boolean): THREE.DataTexture {
  const k = `${isNormal ? 'n:' : 'b:'}${cacheKey}`;
  let tex = placeholderCache.get(k);
  if (!tex) {
    const rgba = isNormal ? new Uint8Array([128, 128, 255, 255]) : new Uint8Array([...archPlaceholderRgb(cacheKey), 255]);
    tex = new THREE.DataTexture(rgba, 1, 1);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.flipY = false;
    tex.colorSpace = isNormal ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.userData._isPlaceholder = true;
    tex.userData.srcKey = cacheKey;
    tex.needsUpdate = true;
    placeholderCache.set(k, tex);
  }
  return tex;
}

export function initKTX2(renderer: THREE.WebGLRenderer | { isWebGPURenderer?: boolean }): void {
  const finish = (): void => { ktxReadyResolve?.(); ktxReadyResolve = null; };
  try {
    if (new URLSearchParams(location.search).get('ktx') === '0') { finish(); return; } // ?ktx=0: plain JPGs, for comparing
    const loader = new KTX2Loader().setTranscoderPath('/games/apex/basis/').setWorkerLimit(4);
    if ((renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer) {
      const asyncDetect = (loader as unknown as { detectSupportAsync?: (r: unknown) => Promise<unknown> }).detectSupportAsync;
      if (typeof asyncDetect === 'function') {
        void asyncDetect.call(loader, renderer).then(() => { ktx = loader; finish(); }).catch(() => { ktx = null; finish(); });
      } else {
        ktx = null;
        finish();
      }
      return;
    }
    loader.detectSupport(renderer as THREE.WebGLRenderer);
    ktx = loader;
    finish();
  } catch { ktx = null; finish(); }
}

/** TextureLoader-shaped loader with in-flight KTX2 promise deduplication + optional geometry-first deferred texture streaming. */
export class GpuTextureLoader {
  private plain: THREE.TextureLoader;
  constructor(
    private manager: THREE.LoadingManager,
    private deferToStream = false,
    private onDeferred?: (cacheKey: string, rawUrl: string, isBase: boolean) => void,
  ) {
    this.plain = new THREE.TextureLoader(manager);
  }
  load(url: string, onLoad?: (t: THREE.Texture) => void, onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void): THREE.Texture | null {
    const real = this.manager.resolveURL(url);
    if (real.startsWith('data:image/')) {
      const t = getTinyTex();
      queueMicrotask(() => onLoad?.(t));
      return t;
    }
    if (this.deferToStream) {
      const cacheKey = url.split('/').pop() ?? url;
      const isNormal = /_nrm\./i.test(cacheKey);
      const isBase = /_base\./i.test(cacheKey);
      const ph = getArchPlaceholder(cacheKey, isNormal).clone();
      ph.userData._isPlaceholder = true;
      ph.userData.srcKey = cacheKey;
      ph.needsUpdate = true;
      if (isBase || isNormal) this.onDeferred?.(cacheKey, url, isBase);
      queueMicrotask(() => onLoad?.(ph));
      return ph;
    }
    if (!ktx || !/\.(jpe?g|png)$/i.test(real) || !/\/ironport\/textures-v[34]\//.test(real)) return this.plain.load(url, onLoad, onProgress, onError);
    const twin = real.replace(/\.(jpe?g|png)$/i, '.ktx2');
    let prom = ktxInFlight.get(twin);
    if (!prom) {
      prom = new Promise<THREE.Texture>((resolve, reject) => {
        ktx!.load(twin, resolve, onProgress, () => {
          this.plain.load(real, resolve, onProgress, reject);
        });
      });
      ktxInFlight.set(twin, prom);
    }
    prom.then((base) => {
      // Clone shares underlying CompressedTexture mipmaps/image without re-transcoding; texCache in buildCity collapses identical clones before GPU upload.
      onLoad?.(base.clone());
    }, (err) => onError?.(err));
    return null;
  }
  loadAsync(url: string): Promise<THREE.Texture> { return new Promise((res, rej) => this.load(url, res, undefined, rej)); }
  setCrossOrigin(): this { return this; }
  setPath(): this { return this; }
  setWithCredentials(): this { return this; }
  setRequestHeader(): this { return this; }
}

/** Loads `<url minus extension>.ktx2` (block-compressed, mipmapped) and falls back to `url` itself; `done` gets the texture either way. */
export function loadKtxOrPlain(url: string, done: (t: THREE.Texture) => void): void {
  const plain = (): void => { new THREE.TextureLoader().load(url, done); };
  if (!ktx) { plain(); return; }
  ktx.load(url.replace(/\.(jpe?g|png)$/i, '.ktx2'), done, undefined, plain);
}
