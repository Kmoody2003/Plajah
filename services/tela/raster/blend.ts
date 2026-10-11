// raster/blend — all 27 Photoshop blend modes, CPU reference.
//
// The GLSL twin lives in gl/shaders.ts (BLEND_GLSL) and is written line-for-line from
// this file; tests pin this file against hand-computed values, and the GPU proof page
// diffs GPU output against this file.
//
// Compositing model (W3C Compositing & Blending L1, which is how Photoshop composites):
//   premultiplied cs,αs (source) over cb,αb (backdrop), straight Cs=cs/αs, Cb=cb/αb:
//     co = cs·(1−αb) + cb·(1−αs) + αs·αb·B(Cb,Cs)
//     αo = αs + αb − αs·αb
//   Clipped layers (clipping masks) composite "atop": αo = αb, co = cb·(1−αs) + αs·αb·B.
//
// Formulas: separable modes per channel on straight colour; non-separable modes use the
// W3C SetLum/SetSat helpers with Lum = 0.3R + 0.59G + 0.11B. Soft Light uses PHOTOSHOP's
// formula (not the W3C/CSS one, which differs in the darks):
//   s ≤ ½: 2bs + b²(1−2s)        s > ½: 2b(1−s) + √b·(2s−1)
// Hard Mix = 1 when b + s ≥ 1 else 0. Divide by 0 → 1 (b>0) / 0 (b=0).
// Dissolve = Normal with coverage α replaced by 1 where hash(x,y) < α, else 0.

import type { BlendMode } from './model';
import { hash01, type RasterF } from './buffer';

export const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  normal: 0, dissolve: 1, darken: 2, multiply: 3, 'color-burn': 4, 'linear-burn': 5, 'darker-color': 6,
  lighten: 7, screen: 8, 'color-dodge': 9, 'linear-dodge': 10, 'lighter-color': 11,
  overlay: 12, 'soft-light': 13, 'hard-light': 14, 'vivid-light': 15, 'linear-light': 16, 'pin-light': 17, 'hard-mix': 18,
  difference: 19, exclusion: 20, subtract: 21, divide: 22, hue: 23, saturation: 24, color: 25, luminosity: 26,
};
export const NON_SEPARABLE = new Set<BlendMode>(['darker-color', 'lighter-color', 'hue', 'saturation', 'color', 'luminosity']);

const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const burn = (b: number, s: number) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s));
const dodge = (b: number, s: number) => (b <= 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s)));
const screen = (b: number, s: number) => b + s - b * s;
const hardLight = (b: number, s: number) => (s <= 0.5 ? b * 2 * s : screen(b, 2 * s - 1));

/** Separable blend B(b, s) for one channel, straight colour in 0..1. */
export function blendChannel(mode: BlendMode, b: number, s: number): number {
  switch (mode) {
    case 'normal': case 'dissolve': return s;
    case 'darken': return Math.min(b, s);
    case 'multiply': return b * s;
    case 'color-burn': return burn(b, s);
    case 'linear-burn': return Math.max(0, b + s - 1);
    case 'lighten': return Math.max(b, s);
    case 'screen': return screen(b, s);
    case 'color-dodge': return dodge(b, s);
    case 'linear-dodge': return Math.min(1, b + s);
    case 'overlay': return hardLight(s, b);
    case 'soft-light': return s <= 0.5 ? 2 * b * s + b * b * (1 - 2 * s) : 2 * b * (1 - s) + Math.sqrt(b) * (2 * s - 1);
    case 'hard-light': return hardLight(b, s);
    case 'vivid-light': return s <= 0.5 ? burn(b, 2 * s) : dodge(b, 2 * s - 1);
    case 'linear-light': return c01(b + 2 * s - 1);
    case 'pin-light': return s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1);
    case 'hard-mix': return b + s >= 1 - 1e-6 ? 1 : 0;
    case 'difference': return Math.abs(b - s);
    case 'exclusion': return b + s - 2 * b * s;
    case 'subtract': return Math.max(0, b - s);
    case 'divide': return s <= 0 ? (b > 0 ? 1 : 0) : Math.min(1, b / s);
    default: return s;
  }
}

// ── Non-separable helpers (W3C) ─────────────────────────────────────────────
export const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(c: number[]): void {
  const l = lum(c[0], c[1], c[2]), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  if (n < 0) { const d = l - n; for (let i = 0; i < 3; i++) c[i] = d > 1e-12 ? l + (c[i] - l) * l / d : l; }
  if (x > 1) { const d = x - l; for (let i = 0; i < 3; i++) c[i] = d > 1e-12 ? l + (c[i] - l) * (1 - l) / d : l; }
}
function setLum(c: number[], l: number): void { const d = l - lum(c[0], c[1], c[2]); c[0] += d; c[1] += d; c[2] += d; clipColor(c); }
const sat = (c: ArrayLike<number>) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSat(c: number[], s: number): void {
  // Order channels max/mid/min, then Cmid = (Cmid−Cmin)·s/(Cmax−Cmin), Cmax = s, Cmin = 0.
  let iMax = 0, iMin = 0; for (let i = 1; i < 3; i++) { if (c[i] > c[iMax]) iMax = i; if (c[i] < c[iMin]) iMin = i; }
  if (iMax === iMin) { c[0] = c[1] = c[2] = 0; return; }
  const iMid = 3 - iMax - iMin, range = c[iMax] - c[iMin];
  c[iMid] = ((c[iMid] - c[iMin]) * s) / range; c[iMax] = s; c[iMin] = 0;
}

/** Non-separable blend into `out` (straight colour). */
export function blendNonSeparable(mode: BlendMode, cb: ArrayLike<number>, cs: ArrayLike<number>, out: number[]): void {
  switch (mode) {
    case 'hue': out[0] = cs[0]; out[1] = cs[1]; out[2] = cs[2]; setSat(out, sat(cb)); setLum(out, lum(cb[0], cb[1], cb[2])); return;
    case 'saturation': out[0] = cb[0]; out[1] = cb[1]; out[2] = cb[2]; setSat(out, sat(cs)); setLum(out, lum(cb[0], cb[1], cb[2])); return;
    case 'color': out[0] = cs[0]; out[1] = cs[1]; out[2] = cs[2]; setLum(out, lum(cb[0], cb[1], cb[2])); return;
    case 'luminosity': out[0] = cb[0]; out[1] = cb[1]; out[2] = cb[2]; setLum(out, lum(cs[0], cs[1], cs[2])); return;
    case 'darker-color': { const src = lum(cs[0], cs[1], cs[2]) < lum(cb[0], cb[1], cb[2]); const c = src ? cs : cb; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
    case 'lighter-color': { const src = lum(cs[0], cs[1], cs[2]) > lum(cb[0], cb[1], cb[2]); const c = src ? cs : cb; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
    default: out[0] = cs[0]; out[1] = cs[1]; out[2] = cs[2];
  }
}

/** Full blend B(Cb, Cs) for an RGB triple (straight). */
export function blendRGB(mode: BlendMode, cb: ArrayLike<number>, cs: ArrayLike<number>, out: number[]): void {
  if (NON_SEPARABLE.has(mode)) { blendNonSeparable(mode, cb, cs, out); return; }
  out[0] = blendChannel(mode, cb[0], cs[0]); out[1] = blendChannel(mode, cb[1], cs[1]); out[2] = blendChannel(mode, cb[2], cs[2]);
}

/** Composite one premultiplied pixel. `alphaScale` = opacity × mask coverage. Writes to dst[di..]. */
const tb = [0, 0, 0], ts = [0, 0, 0], tr = [0, 0, 0];
export function compositePixel(mode: BlendMode, dst: Float32Array, di: number, src: Float32Array, si: number, alphaScale: number, atop: boolean, px = 0, py = 0): void {
  let as = src[si + 3] * alphaScale;
  if (as <= 0) return;
  let k = alphaScale;
  if (mode === 'dissolve') { const keep = hash01(px, py, 0x5eed) < as; if (!keep) return; k = alphaScale / as; as = 1; } // promote to full coverage, keep colour
  const ab = dst[di + 3];
  const sr = src[si] * k, sg = src[si + 1] * k, sb = src[si + 2] * k; // premultiplied by as
  if (ab <= 0) {
    if (atop) return;
    dst[di] = sr; dst[di + 1] = sg; dst[di + 2] = sb; dst[di + 3] = as; return;
  }
  const ia = 1 / as, ib = 1 / ab;
  ts[0] = Math.min(1, sr * ia); ts[1] = Math.min(1, sg * ia); ts[2] = Math.min(1, sb * ia);
  tb[0] = Math.min(1, dst[di] * ib); tb[1] = Math.min(1, dst[di + 1] * ib); tb[2] = Math.min(1, dst[di + 2] * ib);
  blendRGB(mode, tb, ts, tr);
  const both = as * ab;
  if (atop) {
    dst[di] = dst[di] * (1 - as) + both * tr[0]; dst[di + 1] = dst[di + 1] * (1 - as) + both * tr[1]; dst[di + 2] = dst[di + 2] * (1 - as) + both * tr[2];
  } else {
    dst[di] = sr * (1 - ab) + dst[di] * (1 - as) + both * tr[0];
    dst[di + 1] = sg * (1 - ab) + dst[di + 1] * (1 - as) + both * tr[1];
    dst[di + 2] = sb * (1 - ab) + dst[di + 2] * (1 - as) + both * tr[2];
    dst[di + 3] = as + ab - both;
  }
}

/**
 * Composite `src` onto `dst` in place (same size). `coverage` (optional, 0..1 per pixel)
 * multiplies source alpha (layer mask); `originX/Y` = document position of pixel (0,0),
 * used only by Dissolve's hash so the noise is stable across tiles.
 */
export function compositeRaster(dst: RasterF, src: RasterF, mode: BlendMode, opacity: number, coverage: Float32Array | null = null, atop = false, originX = 0, originY = 0): void {
  const W = dst.width, H = dst.height, d = dst.data, s = src.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4;
    const a = coverage ? opacity * coverage[p] : opacity;
    if (a > 0) compositePixel(mode, d, i, s, i, a, atop, x + originX, y + originY);
  }
}

/** Straight-colour convenience used by tests and the eyedropper: blend Cs over Cb at αs, αb. */
export function blendStraight(mode: BlendMode, cb: [number, number, number, number], cs: [number, number, number, number]): [number, number, number, number] {
  const d = new Float32Array([cb[0] * cb[3], cb[1] * cb[3], cb[2] * cb[3], cb[3]]);
  const s = new Float32Array([cs[0] * cs[3], cs[1] * cs[3], cs[2] * cs[3], cs[3]]);
  compositePixel(mode, d, 0, s, 0, 1, false);
  const a = d[3]; return a > 0 ? [d[0] / a, d[1] / a, d[2] / a, a] : [0, 0, 0, 0];
}
