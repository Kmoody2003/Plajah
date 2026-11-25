// The ground's own materials, so the land looks like grass, soil, sand and rock up close instead of a stretched satellite photo. Eight full PBR sets from tex/ are packed
// into two texture arrays (one sampler each, which matters: the terrain shader sits at the GPU's 16 texture-unit limit):
//   albedo array   RGB colour (sRGB)
//   surface array  R,G = normal x,y (tangent space)   B = roughness   A = ambient occlusion
// Layers: 0 meadow grass, 1 dry grass, 2 forest floor, 3 dirt track, 4 gravel, 5 sand, 6 mud, 7 rock. The arrays start as 1-pixel stand-ins and are swapped in when
// the images have loaded (the uniforms hold the texture by reference).
import * as THREE from 'three';

export const GROUND_LAYERS = ['ground_grass_meadow', 'ground_grass_dry', 'ground_forest_floor', 'ground_dirt_track', 'ground_gravel_rally', 'ground_sand', 'ground_mud', 'tex-shared-24-stone-rubble'];
// 512x512x8 mipmapped RGBA8 arrays (~21 MB total vs 86 MB at 1024) stay crisp under 3D strand grass & satellite albedo without tripping D3D11 VRAM limits
const SIZE = 512;
const TEX = '/games/apex/tex/';

function stand(colorSpace: THREE.ColorSpace, fill: number[]): THREE.DataArrayTexture {
  const n = GROUND_LAYERS.length, d = new Uint8Array(4 * n);
  for (let i = 0; i < n; i++) d.set(fill, i * 4);
  const t = new THREE.DataArrayTexture(d, 1, 1, n); t.colorSpace = colorSpace; t.needsUpdate = true; return t;
}

export const groundU = {
  tGA: { value: stand(THREE.SRGBColorSpace, [110, 120, 80, 255]) as THREE.Texture },
  tGP: { value: stand(THREE.NoColorSpace, [128, 128, 230, 255]) as THREE.Texture },
  uGroundOn: { value: 0 },
  /** live tuning: x photo tint strength, y green bias, z distance (m) the materials fade out by, w tile scale */
  uGTune: { value: new THREE.Vector4(0.35, 0.5, 900, 1) },
};
(window as unknown as { groundTune: (o: { tint?: number; green?: number; far?: number; scale?: number }) => unknown }).groundTune = (o) => {
  const v = groundU.uGTune.value; if (o.tint !== undefined) v.x = o.tint; if (o.green !== undefined) v.y = o.green; if (o.far !== undefined) v.z = o.far; if (o.scale !== undefined) v.w = o.scale; return v.toArray();
};

function img(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}

export async function loadGroundArrays(): Promise<void> {
  const n = GROUND_LAYERS.length, A = new Uint8Array(SIZE * SIZE * 4 * n), P = new Uint8Array(SIZE * SIZE * 4 * n);
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const pixels = (im: HTMLImageElement | null, fallback: number): Uint8ClampedArray => {
    if (!im) { const f = new Uint8ClampedArray(SIZE * SIZE * 4); f.fill(fallback); return f; }
    cx.clearRect(0, 0, SIZE, SIZE); cx.drawImage(im, 0, 0, SIZE, SIZE);
    im.onload = im.onerror = null; im.src = '';
    return cx.getImageData(0, 0, SIZE, SIZE).data;
  };
  for (let L = 0; L < n; L++) {
    const base = GROUND_LAYERS[L], shared = base.startsWith('tex-shared');
    const [col, nrm] = await Promise.all([
      img(TEX + base + (shared ? '_base.png' : '.png')), img(TEX + base + '_normal.png'),
    ]);
    const c = pixels(col, 128); A.set(c, L * SIZE * SIZE * 4);
    const nn = pixels(nrm, 128);
    const [rgh, ao] = await Promise.all([
      img(TEX + base + '_roughness.png'), img(TEX + base + '_ao.png'),
    ]);
    const rr = pixels(rgh, 220), aa = pixels(ao, 255), o = L * SIZE * SIZE * 4;
    for (let i = 0; i < SIZE * SIZE; i++) { P[o + i * 4] = nn[i * 4]; P[o + i * 4 + 1] = nn[i * 4 + 1]; P[o + i * 4 + 2] = rr[i * 4]; P[o + i * 4 + 3] = aa[i * 4]; }
    await new Promise((r) => setTimeout(r, 16));                              // yield between layers so frame pacing & GPU upload stay smooth
  }
  const mk = (data: Uint8Array, cs: THREE.ColorSpace): THREE.DataArrayTexture => {
    const t = new THREE.DataArrayTexture(data, SIZE, SIZE, n);
    t.colorSpace = cs; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
    return t;
  };
  const oldA = groundU.tGA.value, oldP = groundU.tGP.value;
  groundU.tGA.value = mk(A, THREE.SRGBColorSpace);
  groundU.tGP.value = mk(P, THREE.NoColorSpace);
  oldA.dispose(); oldP.dispose();
  groundU.uGroundOn.value = 1;
}
