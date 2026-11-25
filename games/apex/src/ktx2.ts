// GPU-compressed building textures (tools/ktx_textures.py writes <name>.ktx2 next to each <name>.jpg). A texture that has a .ktx2 twin stays block-compressed in video memory (BC7 on
// desktop, ASTC/ETC on phones) instead of unpacking to RGBA, about 4x less VRAM and a fast transcode instead of a JPEG decode. Anything without a twin falls back to the JPG.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let ktx: KTX2Loader | null = null;
export function initKTX2(renderer: THREE.WebGLRenderer): void {
  try {
    if (new URLSearchParams(location.search).get('ktx') === '0') return;         // ?ktx=0: plain JPGs, for comparing
    ktx = new KTX2Loader().setTranscoderPath('/games/apex/basis/');
    ktx.detectSupport(renderer);
  } catch { ktx = null; }
}

/** TextureLoader-shaped loader: `resolve` maps the requested URL (after any URL modifier) to the JPG/PNG it names; its .ktx2 twin is tried first. */
export class GpuTextureLoader {
  private plain: THREE.TextureLoader;
  constructor(private manager: THREE.LoadingManager) { this.plain = new THREE.TextureLoader(manager); }
  load(url: string, onLoad?: (t: THREE.Texture) => void, onProgress?: (e: ProgressEvent) => void, onError?: (e: unknown) => void): THREE.Texture | null {
    const real = this.manager.resolveURL(url);
    if (!ktx || !/\.(jpe?g|png)$/i.test(real) || !/\/ironport\/textures-v[34]\//.test(real)) return this.plain.load(url, onLoad, onProgress, onError);
    const twin = real.replace(/\.(jpe?g|png)$/i, '.ktx2');
    ktx.load(twin, (t) => onLoad?.(t), onProgress, () => { this.plain.load(real, onLoad, onProgress, onError); });
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
