// GPU-compressed building textures (tools/ktx_textures.py writes <name>.ktx2 next to each <name>.jpg). A texture that has a .ktx2 twin stays block-compressed in video memory (BC7 on
// desktop, ASTC/ETC on phones) instead of unpacking to RGBA, about 4x less VRAM and a fast transcode instead of a JPEG decode. Anything without a twin falls back to the JPG.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let ktx: KTX2Loader | null = null;
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

export function initKTX2(renderer: THREE.WebGLRenderer | { isWebGPURenderer?: boolean }): void {
  try {
    if (new URLSearchParams(location.search).get('ktx') === '0') return;         // ?ktx=0: plain JPGs, for comparing
    const loader = new KTX2Loader().setTranscoderPath('/games/apex/basis/').setWorkerLimit(4);
    if ((renderer as { isWebGPURenderer?: boolean }).isWebGPURenderer) {
      const asyncDetect = (loader as unknown as { detectSupportAsync?: (r: unknown) => Promise<unknown> }).detectSupportAsync;
      if (typeof asyncDetect === 'function') {
        void asyncDetect.call(loader, renderer).then(() => { ktx = loader; }).catch(() => { ktx = null; });
      } else {
        ktx = null;
      }
      return;
    }
    loader.detectSupport(renderer as THREE.WebGLRenderer);
    ktx = loader;
  } catch { ktx = null; }
}

/** TextureLoader-shaped loader with in-flight KTX2 promise deduplication so parallel glTF loads never transcode the same .ktx2 file multiple times. */
export class GpuTextureLoader {
  private plain: THREE.TextureLoader;
  constructor(private manager: THREE.LoadingManager) { this.plain = new THREE.TextureLoader(manager); }
  load(url: string, onLoad?: (t: THREE.Texture) => void, onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void): THREE.Texture | null {
    const real = this.manager.resolveURL(url);
    if (real.startsWith('data:image/')) {
      const t = getTinyTex();
      queueMicrotask(() => onLoad?.(t));
      return t;
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
