// raster/buffer — the pixel containers every raster module agrees on.
//
// Three shapes, all plain typed arrays so the CPU path runs in node, workers and
// the browser with zero DOM:
//
//   Bitmap8  RGBA, 8-bit, STRAIGHT alpha (ImageData-compatible) — storage, painting, export
//   Mask8    1 channel, 8-bit coverage — selections and layer masks
//   RasterF  RGBA, float32, PREMULTIPLIED alpha — the compositor's working buffer
//            (the GPU twin is an RGBA16F texture; Float16 packing helpers live here)
//
// Values in RasterF are 0..1 in the document's blend space (sRGB-encoded by default,
// linear-light when the document opts in — see compositeCore.ts).

export interface Bitmap8 { width: number; height: number; data: Uint8ClampedArray }
export interface Mask8 { width: number; height: number; data: Uint8Array }
export interface RasterF { width: number; height: number; data: Float32Array }
import type { Rect } from './model';
export type { Rect };

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function createBitmap(width: number, height: number, fill?: [number, number, number, number]): Bitmap8 {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) for (let i = 0; i < data.length; i += 4) { data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3]; }
  return { width, height, data };
}
export function createMask(width: number, height: number, value = 0): Mask8 {
  const data = new Uint8Array(width * height); if (value) data.fill(value); return { width, height, data };
}
export function createRaster(width: number, height: number): RasterF { return { width, height, data: new Float32Array(width * height * 4) }; }
export const cloneBitmap = (b: Bitmap8): Bitmap8 => ({ width: b.width, height: b.height, data: new Uint8ClampedArray(b.data) });
export const cloneMask = (m: Mask8): Mask8 => ({ width: m.width, height: m.height, data: new Uint8Array(m.data) });
export const cloneRaster = (r: RasterF): RasterF => ({ width: r.width, height: r.height, data: new Float32Array(r.data) });

// ── sRGB transfer (IEC 61966-2-1) ──────────────────────────────────────────
export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const S2L = new Float32Array(256); for (let i = 0; i < 256; i++) S2L[i] = srgbToLinear(i / 255);
export const SRGB8_TO_LINEAR = S2L;

/** Bitmap8 (straight) → RasterF (premultiplied). `linear` decodes sRGB first. */
export function bitmapToRaster(b: Bitmap8, linear = false): RasterF {
  const out = createRaster(b.width, b.height), s = b.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3] / 255;
    d[i] = (linear ? S2L[s[i]] : s[i] / 255) * a; d[i + 1] = (linear ? S2L[s[i + 1]] : s[i + 1] / 255) * a;
    d[i + 2] = (linear ? S2L[s[i + 2]] : s[i + 2] / 255) * a; d[i + 3] = a;
  }
  return out;
}
/** RasterF (premultiplied) → Bitmap8 (straight). Optional ordered dither (±0.5 LSB TPDF) kills banding. */
export function rasterToBitmap(r: RasterF, linear = false, dither = false): Bitmap8 {
  const out = createBitmap(r.width, r.height), s = r.data, d = out.data;
  let seed = 0x9e3779b9;
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3];
    const inv = a > 1e-6 ? 1 / a : 0;
    for (let c = 0; c < 3; c++) {
      let v = clamp01(s[i + c] * inv); if (linear) v = linearToSrgb(v);
      let q = v * 255;
      if (dither) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const n1 = (seed >>> 0) / 4294967296; seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; q += (n1 - (seed >>> 0) / 4294967296) * 0.5; }
      d[i + c] = Math.round(q);
    }
    d[i + 3] = Math.round(clamp01(a) * 255);
  }
  return out;
}

// ── Float16 packing for 16-bit-float working buffers / RGBA16F uploads ──────
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function toHalf(v: number): number {
  f32[0] = v; const x = u32[0];
  const sign = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15; let m = x & 0x7fffff;
  if (e <= 0) { if (e < -10) return sign; m = (m | 0x800000) >> (1 - e); return sign | ((m + 0x1000) >> 13); }
  if (e >= 31) return sign | 0x7c00;
  const h = sign | (e << 10) | ((m + 0x1000) >> 13);
  return h;
}
export function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 5.960464477539063e-8;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}
export function rasterToHalf(r: RasterF): Uint16Array { const o = new Uint16Array(r.data.length); for (let i = 0; i < o.length; i++) o[i] = toHalf(r.data[i]); return o; }
export function halfToRaster(width: number, height: number, h: Uint16Array): RasterF { const r = createRaster(width, height); for (let i = 0; i < h.length; i++) r.data[i] = fromHalf(h[i]); return r; }

// ── Sampling ────────────────────────────────────────────────────────────────
/** Bilinear sample of a premultiplied raster at continuous coords (pixel centres at +0.5). Transparent outside. */
export function sampleBilinear(r: RasterF, x: number, y: number, out: Float32Array | number[]): void {
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  out[0] = out[1] = out[2] = out[3] = 0;
  const W = r.width, H = r.height, d = r.data;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j; if (yy < 0 || yy >= H) continue; const wy = j ? ty : 1 - ty;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i; if (xx < 0 || xx >= W) continue; const w = wy * (i ? tx : 1 - tx); if (!w) continue;
      const k = (yy * W + xx) * 4; out[0] += d[k] * w; out[1] += d[k + 1] * w; out[2] += d[k + 2] * w; out[3] += d[k + 3] * w;
    }
  }
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), r = Math.min(a.x + a.width, b.x + b.width), btm = Math.min(a.y + a.height, b.y + b.height);
  return r > x && btm > y ? { x, y, width: r - x, height: btm - y } : null;
}
export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** Copy a sub-rectangle out of a bitmap (clipped; out-of-range pixels transparent). */
export function cropBitmap(b: Bitmap8, r: Rect): Bitmap8 {
  const out = createBitmap(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const sy = y + r.y; if (sy < 0 || sy >= b.height) continue;
    const x0 = Math.max(0, -r.x), x1 = Math.min(r.width, b.width - r.x); if (x1 <= x0) continue;
    out.data.set(b.data.subarray((sy * b.width + r.x + x0) * 4, (sy * b.width + r.x + x1) * 4), (y * r.width + x0) * 4);
  }
  return out;
}
export function cropRaster(src: RasterF, r: Rect): RasterF {
  const out = createRaster(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const sy = y + r.y; if (sy < 0 || sy >= src.height) continue;
    const x0 = Math.max(0, -r.x), x1 = Math.min(r.width, src.width - r.x); if (x1 <= x0) continue;
    out.data.set(src.data.subarray((sy * src.width + r.x + x0) * 4, (sy * src.width + r.x + x1) * 4), (y * r.width + x0) * 4);
  }
  return out;
}

/** Luma (Rec.601, what Photoshop uses for its grayscale/luminosity masks). */
export const luma601 = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Deterministic integer hash shared bit-for-bit with the GLSL `hash2u` (dissolve, noise, scatter). */
export function hash2u(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(seed | 0, 0xcb1ab31f)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
export const hash01 = (x: number, y: number, seed = 0) => hash2u(x, y, seed) / 4294967296;

/** Small seeded PRNG (mulberry32) for brush scatter, PatchMatch random search, noise. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
