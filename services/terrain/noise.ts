// Plajah Terrain — noise (docs/plajah-terrain.md, phase 2), CPU side.
//
// Integer-hashed so the GPU twin (gpu.ts) produces the same field: the hash is 32-bit integer maths (Math.imul here,
// u32 multiply in WGSL), lattice values come from its top 24 bits (exact in f32), and every noise is continuous, so the
// f32 / f64 difference stays a rounding error instead of a different landscape.

export const H1 = 0x27d4eb2d, H2 = 0x165667b1, H3 = 0x1b873593, M1 = 0x2c1b3c6d, M2 = 0x297a2d39;

/** 32-bit hash of an integer lattice point and a seed (unsigned). */
export function hash2(ix: number, iz: number, seed: number) {
  let h = (Math.imul(ix | 0, H1) ^ Math.imul(iz | 0, H2) ^ Math.imul(seed | 0, H3)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0; h = Math.imul(h, M1) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0; h = Math.imul(h, M2) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
/** 0…1 from a hash (top 24 bits, exact in f32). */
export const unit = (h: number) => (h >>> 8) / 16777216;

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise, −1…1. */
export function valueNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z), u = fade(x - xi), v = fade(z - zi);
  const a = unit(hash2(xi, zi, seed)), b = unit(hash2(xi + 1, zi, seed)), c = unit(hash2(xi, zi + 1, seed)), d = unit(hash2(xi + 1, zi + 1, seed));
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Gradient (Perlin-style) noise, about −1…1; gradients are 8 directions picked by the hash. */
export function gradientNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = fade(xf), v = fade(zf);
  const g = (i: number, j: number, dx: number, dz: number) => { const a = (hash2(xi + i, zi + j, seed) & 7) * (Math.PI / 4); return Math.cos(a) * dx + Math.sin(a) * dz; };
  const a = g(0, 0, xf, zf), b = g(1, 0, xf - 1, zf), c = g(0, 1, xf, zf - 1), d = g(1, 1, xf - 1, zf - 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
}

/** Cellular (Worley F1) noise: distance to the nearest jittered feature point, 0…~1, mapped to −1…1. */
export function cellularNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  let best = 8;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const px = xi + i + unit(hash2(xi + i, zi + j, seed)), pz = zi + j + unit(hash2(xi + i, zi + j, seed + 1));
    best = Math.min(best, (px - x) ** 2 + (pz - z) ** 2);
  }
  return Math.min(1, Math.sqrt(best)) * 2 - 1;
}

export type NoiseKind = 'value' | 'perlin' | 'cellular';
export type FractalMode = 'fbm' | 'ridged' | 'billow';

export interface FractalOptions { kind?: NoiseKind; mode?: FractalMode; octaves?: number; lacunarity?: number; gain?: number; seed?: number }

const BASE = { value: valueNoise, perlin: gradientNoise, cellular: cellularNoise };

/** Fractal sum, normalised: fbm / billow −1…1, ridged 0…1. Each octave gets its own seed and a small offset. */
export function fractal(x: number, z: number, o: FractalOptions = {}) {
  const f = BASE[o.kind ?? 'perlin'], mode = o.mode ?? 'fbm', oct = Math.max(1, Math.min(10, Math.round(o.octaves ?? 5)));
  const lac = o.lacunarity ?? 2, gain = o.gain ?? 0.5, seed = o.seed ?? 0;
  let sum = 0, amp = 1, norm = 0, fr = 1;
  for (let k = 0; k < oct; k++) {
    const n = f(x * fr + k * 19.19, z * fr - k * 7.73, seed + k * 101);
    sum += amp * (mode === 'ridged' ? (1 - Math.abs(n)) ** 2 : mode === 'billow' ? Math.abs(n) * 2 - 1 : n);
    norm += amp; amp *= gain; fr *= lac;
  }
  return sum / norm;
}
