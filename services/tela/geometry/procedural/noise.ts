// noise — 2D simplex noise, value noise, fbm and domain warping (own implementation).
//
// Simplex after Gustavson's public-domain reference (Perlin's simplex method patent
// US 6,867,776 covered 3D+ and expired in 2022; 2D is used here regardless). Seeded by a
// permutation shuffled with our RNG so every book gets its own field.
import { rng } from './random';

export type Noise2 = (x: number, y: number) => number;

const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const F2 = .5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;

/** Seeded 2D simplex noise in [-1, 1]. */
export function simplex2(seed: number | string = 1): Noise2 {
  const r = rng(seed); const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512); for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  return (xin, yin) => {
    const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s); const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t); const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = .5 - x0 * x0 - y0 * y0; if (t0 > 0) { const g = G[pm12[ii + perm[jj]]]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = .5 - x1 * x1 - y1 * y1; if (t1 > 0) { const g = G[pm12[ii + i1 + perm[jj + j1]]]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = .5 - x2 * x2 - y2 * y2; if (t2 > 0) { const g = G[pm12[ii + 1 + perm[jj + 1]]]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}
/** Smooth value noise in [-1, 1] (cheaper, blobbier). */
export function valueNoise2(seed: number | string = 1): Noise2 {
  const r = rng(seed); const tab = new Float32Array(1024); for (let i = 0; i < 1024; i++) tab[i] = r() * 2 - 1;
  const h = (x: number, y: number) => tab[((x * 73856093) ^ (y * 19349663)) & 1023];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const fx = s(x - xi), fy = s(y - yi); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
}
/** Fractal Brownian motion over a base noise. Output roughly in [-1, 1]. */
export function fbm(n: Noise2, octaves = 4, lacunarity = 2, gain = .5): Noise2 {
  let norm = 0, a = 1; for (let i = 0; i < octaves; i++) { norm += a; a *= gain; }
  return (x, y) => { let s = 0, amp = 1, f = 1; for (let i = 0; i < octaves; i++) { s += amp * n(x * f + i * 17.3, y * f - i * 9.1); amp *= gain; f *= lacunarity; } return s / norm; };
}
/** Ridged multifractal (mountain crests, bark). [0, 1]. */
export function ridged(n: Noise2, octaves = 4): Noise2 { const f = fbm((x, y) => 1 - Math.abs(n(x, y)), octaves); return (x, y) => f(x, y); }
/** Domain warp: noise sampled at a noise-displaced position (marbling, watery edges). */
export function warp(n: Noise2, w: Noise2, amount = 1): Noise2 { return (x, y) => n(x + amount * w(x + 5.2, y + 1.3), y + amount * w(x - 3.7, y + 8.1)); }
