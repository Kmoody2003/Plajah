// Plajah Sky — tileable 3D noise for volumetric clouds, generated once on the CPU (no assets to ship).
//
// shape  (64³ RGBA8): R = Perlin-Worley (billowy cumulus base: Perlin fbm remapped by Worley fbm), G/B/A = Worley fbm at
//                     rising frequencies (used to erode the base into cauliflower lobes)
// detail (32³ RGBA8): R/G/B = Worley fbm at high frequencies (wispy edges), A = unused
// Both tile in all three axes, so the clouds can drift forever. Pure TypeScript apart from the texture wrap.
import * as THREE from 'three/webgpu';

const fract = (x: number) => x - Math.floor(x);
function hash3(x: number, y: number, z: number, s: number): [number, number, number] {
  const h = (a: number) => fract(Math.sin(a) * 43758.5453123);
  const n = x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19;
  return [h(n), h(n + 17.17), h(n + 41.41)];
}

/** Tileable Worley (cellular) noise, 1 − distance to the nearest feature point (bright cell centres), period `f` cells. */
function makeWorley(f: number, seed: number) {
  const pts = new Float32Array(f * f * f * 3);
  for (let z = 0; z < f; z++) for (let y = 0; y < f; y++) for (let x = 0; x < f; x++) {
    const [a, b, c] = hash3(x, y, z, seed); const i = ((z * f + y) * f + x) * 3;
    pts[i] = x + a; pts[i + 1] = y + b; pts[i + 2] = z + c;
  }
  return (u: number, v: number, w: number) => {
    const px = u * f, py = v * f, pz = w * f, cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let best = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, gz = cz + dz;
      const wx = ((gx % f) + f) % f, wy = ((gy % f) + f) % f, wz = ((gz % f) + f) % f, i = ((wz * f + wy) * f + wx) * 3;
      const qx = pts[i] + (gx - wx), qy = pts[i + 1] + (gy - wy), qz = pts[i + 2] + (gz - wz);
      const d = (qx - px) ** 2 + (qy - py) ** 2 + (qz - pz) ** 2; if (d < best) best = d;
    }
    return 1 - Math.min(1, Math.sqrt(best));
  };
}

/** Tileable gradient (Perlin) noise with period `f`, roughly −1…1. */
function makePerlin(f: number, seed: number) {
  const grad = (x: number, y: number, z: number) => { const [a, b, c] = hash3(((x % f) + f) % f, ((y % f) + f) % f, ((z % f) + f) % f, seed); return [a * 2 - 1, b * 2 - 1, c * 2 - 1]; };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (u: number, v: number, w: number) => {
    const px = u * f, py = v * f, pz = w * f, x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
    const fx = px - x0, fy = py - y0, fz = pz - z0;
    let r = 0;
    for (let k = 0; k < 8; k++) {
      const ox = k & 1, oy = (k >> 1) & 1, oz = (k >> 2) & 1, g = grad(x0 + ox, y0 + oy, z0 + oz);
      const d = g[0] * (fx - ox) + g[1] * (fy - oy) + g[2] * (fz - oz);
      r += d * (ox ? fade(fx) : 1 - fade(fx)) * (oy ? fade(fy) : 1 - fade(fy)) * (oz ? fade(fz) : 1 - fade(fz));
    }
    return r * 1.6;
  };
}

const remap = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c);

function texture3d(data: Uint8Array, n: number) {
  const t = new THREE.Data3DTexture(data, n, n, n);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

let cache: { shape: THREE.Data3DTexture; detail: THREE.Data3DTexture } | null = null;

/** The two cloud noise volumes (built once per page, ~0.3 s). */
export function cloudNoise() {
  if (cache) return cache;
  const t0 = performance.now();
  const N = 64, shape = new Uint8Array(N * N * N * 4);
  const w4 = makeWorley(4, 1), w8 = makeWorley(8, 2), w16 = makeWorley(16, 3), w32 = makeWorley(32, 4);
  const p4 = makePerlin(4, 5), p8 = makePerlin(8, 6), p16 = makePerlin(16, 7);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    const perlin = (p4(u, v, w) * 0.6 + p8(u, v, w) * 0.28 + p16(u, v, w) * 0.12) * 0.5 + 0.5;
    const wa = w4(u, v, w), wb = w8(u, v, w), wc = w16(u, v, w), wd = w32(u, v, w);
    const wf = wa * 0.625 + wb * 0.25 + wc * 0.125;
    const pw = Math.min(1, Math.max(0, remap(perlin, wf - 1, 1, 0, 1)));
    const i = ((z * N + y) * N + x) * 4;
    shape[i] = pw * 255; shape[i + 1] = wf * 255; shape[i + 2] = (wb * 0.625 + wc * 0.25 + wd * 0.125) * 255; shape[i + 3] = (wc * 0.625 + wd * 0.375) * 255;
  }
  const M = 32, detail = new Uint8Array(M * M * M * 4);
  const d4 = makeWorley(4, 11), d8 = makeWorley(8, 12), d16 = makeWorley(16, 13);
  for (let z = 0; z < M; z++) for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const u = x / M, v = y / M, w = z / M, a = d4(u, v, w), b = d8(u, v, w), c = d16(u, v, w), i = ((z * M + y) * M + x) * 4;
    detail[i] = (a * 0.625 + b * 0.25 + c * 0.125) * 255; detail[i + 1] = (b * 0.625 + c * 0.375) * 255; detail[i + 2] = c * 255; detail[i + 3] = 255;
  }
  cache = { shape: texture3d(shape, N), detail: texture3d(detail, M) };
  console.info(`[sky] cloud noise in ${Math.round(performance.now() - t0)} ms`);
  return cache;
}
