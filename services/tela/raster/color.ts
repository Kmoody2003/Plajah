// raster/color — eyedropper, histogram/statistics, colour-space tagging + conversion and a
// documented ICC-less CMYK model for soft proofing and CMYK separation.
//
// rust/plajah-color offers grading + .cube LUTs but no CMYK/ICC, so CMYK here is an
// explicit APPROXIMATION, not a press profile:
//   • printer model: Yule–Nielsen-modified (n = 2) Neugebauer over 8 CMY primaries with the
//     Demichel area weights, black as a multiplicative overprint. Primaries are typical
//     SWOP-coated solids rendered to sRGB; paper = white (relative colorimetric).
//   • separation (RGB → CMYK): GCR black from the naive grey component (gcr 0..1), then the
//     CMY that reproduce the target through the model are solved by damped Gauss–Newton;
//     total ink limited (default 300%).
//   • soft proof: RGB → CMYK → RGB through the same model, baked into a 33³ LUT the GPU
//     applies at present (GlCompositor.setProofLut), so out-of-gamut colours visibly dull.
// Swap in a real ICC transform later behind the same functions.

import { srgbToLinear, linearToSrgb, luma601, type Bitmap8, type RasterF } from './buffer';
import { SRGB_TO_P3, P3_TO_SRGB, convertGamut } from './colorMath';

// ── Eyedropper ──────────────────────────────────────────────────────────────
export type SampleSize = 'point' | '3x3' | '5x5' | '11x11' | '31x31';
/** Average straight RGBA (0..255) around (x, y); alpha-weighted so transparent pixels don't darken. */
export function eyedropper(b: Bitmap8, x: number, y: number, size: SampleSize = 'point'): [number, number, number, number] {
  const r = size === 'point' ? 0 : (parseInt(size, 10) - 1) / 2, cx = Math.floor(x), cy = Math.floor(y);
  let ar = 0, ag = 0, ab = 0, aa = 0, n = 0;
  for (let j = cy - r; j <= cy + r; j++) for (let i = cx - r; i <= cx + r; i++) {
    if (i < 0 || j < 0 || i >= b.width || j >= b.height) continue; const k = (j * b.width + i) * 4, a = b.data[k + 3];
    ar += b.data[k] * a; ag += b.data[k + 1] * a; ab += b.data[k + 2] * a; aa += a; n++;
  }
  if (!n || !aa) return [0, 0, 0, 0];
  return [Math.round(ar / aa), Math.round(ag / aa), Math.round(ab / aa), Math.round(aa / n)];
}
/** Same on a premultiplied float composite (sample merged / 16-bit precision). */
export function eyedropperRaster(r: RasterF, x: number, y: number, size: SampleSize = 'point', linear = false): [number, number, number, number] {
  const rad = size === 'point' ? 0 : (parseInt(size, 10) - 1) / 2, cx = Math.floor(x), cy = Math.floor(y); const acc = [0, 0, 0, 0]; let n = 0;
  for (let j = cy - rad; j <= cy + rad; j++) for (let i = cx - rad; i <= cx + rad; i++) { if (i < 0 || j < 0 || i >= r.width || j >= r.height) continue; const k = (j * r.width + i) * 4; for (let c = 0; c < 4; c++) acc[c] += r.data[k + c]; n++; }
  if (!n || acc[3] <= 0) return [0, 0, 0, 0];
  const enc = (v: number) => Math.round((linear ? linearToSrgb(v) : v) * 255);
  return [enc(acc[0] / acc[3]), enc(acc[1] / acc[3]), enc(acc[2] / acc[3]), Math.round(acc[3] / n * 255)];
}

// ── Histogram + statistics ──────────────────────────────────────────────────
export interface ChannelStats { mean: number; stdDev: number; median: number; min: number; max: number; pixels: number }
export interface Histogram { r: Uint32Array; g: Uint32Array; b: Uint32Array; luminosity: Uint32Array; alpha: Uint32Array; stats: { r: ChannelStats; g: ChannelStats; b: ChannelStats; luminosity: ChannelStats } }
function statsOf(h: Uint32Array): ChannelStats {
  let n = 0, sum = 0, sq = 0, min = -1, max = 0;
  for (let i = 0; i < 256; i++) { const c = h[i]; if (!c) continue; if (min < 0) min = i; max = i; n += c; sum += c * i; sq += c * i * i; }
  const mean = n ? sum / n : 0; let acc = 0, median = 0; for (let i = 0; i < 256; i++) { acc += h[i]; if (acc * 2 >= n) { median = i; break; } }
  return { mean, stdDev: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0, median, min: Math.max(0, min), max, pixels: n };
}
/** Histogram of a bitmap (optionally only inside a selection mask), transparent pixels skipped. */
export function histogram(b: Bitmap8, mask?: Uint8Array): Histogram {
  const r = new Uint32Array(256), g = new Uint32Array(256), bl = new Uint32Array(256), l = new Uint32Array(256), a = new Uint32Array(256);
  for (let p = 0; p < b.width * b.height; p++) {
    if (mask && mask[p] < 128) continue; const k = p * 4; a[b.data[k + 3]]++; if (!b.data[k + 3]) continue;
    r[b.data[k]]++; g[b.data[k + 1]]++; bl[b.data[k + 2]]++; l[Math.round(luma601(b.data[k], b.data[k + 1], b.data[k + 2]))]++;
  }
  return { r, g, b: bl, luminosity: l, alpha: a, stats: { r: statsOf(r), g: statsOf(g), b: statsOf(bl), luminosity: statsOf(l) } };
}

// ── Colour space tagging / conversion ───────────────────────────────────────
export type ColorSpaceTag = 'srgb' | 'display-p3';
/** Convert pixels between sRGB and Display-P3 (same transfer curve, 3×3 in linear light, clipped). */
export function convertColorSpace(b: Bitmap8, from: ColorSpaceTag, to: ColorSpaceTag): Bitmap8 {
  if (from === to) return { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data) };
  const m = from === 'srgb' ? SRGB_TO_P3 : P3_TO_SRGB, out = { width: b.width, height: b.height, data: new Uint8ClampedArray(b.data.length) }, c = [0, 0, 0];
  const cache = new Map<number, number>();
  for (let i = 0; i < b.data.length; i += 4) {
    const key = (b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2]; let v = cache.get(key);
    if (v === undefined) { convertGamut(b.data[i] / 255, b.data[i + 1] / 255, b.data[i + 2] / 255, m, c); v = (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255); if (cache.size < 1 << 18) cache.set(key, v); }
    out.data[i] = v >> 16; out.data[i + 1] = (v >> 8) & 255; out.data[i + 2] = v & 255; out.data[i + 3] = b.data[i + 3];
  }
  return out;
}

// ── CMYK model (ICC-less approximation, see header) ─────────────────────────
// 8 Neugebauer primaries (W, C, M, Y, CM, CY, MY, CMY) as sRGB 0..255.
const PRIMARIES_SRGB: [number, number, number][] = [[255, 255, 255], [0, 158, 224], [236, 0, 140], [255, 242, 0], [46, 49, 146], [0, 166, 81], [237, 28, 36], [55, 52, 53]];
const K_SOLID_SRGB: [number, number, number] = [35, 31, 32];
const YN = 2; // Yule–Nielsen n
const P_YN = PRIMARIES_SRGB.map(p => p.map(v => Math.pow(srgbToLinear(v / 255), 1 / YN)));
const K_YN = K_SOLID_SRGB.map(v => Math.pow(srgbToLinear(v / 255), 1 / YN));

/** CMYK (0..1) → linear-light RGB through the printer model. */
export function cmykToLinear(c: number, m: number, y: number, k: number, out: number[] = [0, 0, 0]): number[] {
  const w = [(1 - c) * (1 - m) * (1 - y), c * (1 - m) * (1 - y), (1 - c) * m * (1 - y), (1 - c) * (1 - m) * y, c * m * (1 - y), c * (1 - m) * y, (1 - c) * m * y, c * m * y];
  for (let ch = 0; ch < 3; ch++) {
    let s = 0; for (let i = 0; i < 8; i++) s += w[i] * P_YN[i][ch];
    s *= (1 - k) + k * K_YN[ch]; // black overprint, also in Yule–Nielsen space
    out[ch] = Math.pow(s, YN);
  }
  return out;
}
export interface SeparationOptions { /** 0..1 grey component replacement */ gcr?: number; /** total ink limit, 0..4 (3 = 300%) */ inkLimit?: number }
/** sRGB (0..1) → CMYK (0..1) by GCR + damped Gauss–Newton through the model. */
export function srgbToCmyk(r: number, g: number, b: number, o: SeparationOptions = {}): [number, number, number, number] {
  const gcr = o.gcr ?? 0.7, limit = o.inkLimit ?? 3, target = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  let c = 1 - r, m = 1 - g, y = 1 - b; const grey = Math.min(c, m, y);
  const k = Math.max(0, Math.min(1, grey * gcr * Math.min(1, grey * 1.6)));
  c = Math.max(0, (c - k) / Math.max(1e-3, 1 - k)); m = Math.max(0, (m - k) / Math.max(1e-3, 1 - k)); y = Math.max(0, (y - k) / Math.max(1e-3, 1 - k));
  const x = [c, m, y], cur = [0, 0, 0], tmp = [0, 0, 0];
  const enc = (v: number) => Math.cbrt(Math.max(0, v)); // perceptual-ish residual
  for (let it = 0; it < 12; it++) {
    cmykToLinear(x[0], x[1], x[2], k, cur);
    const res = [0, 1, 2].map(i => enc(cur[i]) - enc(target[i]));
    if (Math.abs(res[0]) + Math.abs(res[1]) + Math.abs(res[2]) < 1e-4) break;
    const J: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h = 1e-3;
    for (let j = 0; j < 3; j++) { const xx = [...x]; xx[j] = Math.min(1, xx[j] + h); cmykToLinear(xx[0], xx[1], xx[2], k, tmp); for (let i = 0; i < 3; i++) J[i][j] = (enc(tmp[i]) - enc(cur[i])) / (xx[j] - x[j] || h); }
    // solve (JᵀJ + λI) dx = −Jᵀr
    const A = [0, 1, 2].map(i => [0, 1, 2].map(j => J[0][i] * J[0][j] + J[1][i] * J[1][j] + J[2][i] * J[2][j] + (i === j ? 1e-3 : 0)));
    const rhs = [0, 1, 2].map(i => -(J[0][i] * res[0] + J[1][i] * res[1] + J[2][i] * res[2]));
    const dx = solve3(A, rhs); for (let j = 0; j < 3; j++) x[j] = Math.min(1, Math.max(0, x[j] + dx[j]));
  }
  const total = x[0] + x[1] + x[2] + k;
  if (total > limit) { const s = Math.max(0, (limit - k)) / (x[0] + x[1] + x[2]); x[0] *= s; x[1] *= s; x[2] *= s; }
  return [x[0], x[1], x[2], k];
}
function solve3(A: number[][], b: number[]): number[] {
  const det = (M: number[][]) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(A); if (Math.abs(D) < 1e-12) return [0, 0, 0];
  return [0, 1, 2].map(c => det(A.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / D);
}
/** RGB → CMYK → RGB round trip (what the press can reproduce). */
export function softProofColor(r: number, g: number, b: number, o: SeparationOptions = {}): [number, number, number] {
  const [c, m, y, k] = srgbToCmyk(r, g, b, o), lin = cmykToLinear(c, m, y, k);
  return [linearToSrgb(Math.min(1, lin[0])), linearToSrgb(Math.min(1, lin[1])), linearToSrgb(Math.min(1, lin[2]))];
}
/** N³ RGBA float LUT (R fastest) for GlCompositor.setProofLut. */
export function cmykProofLut(n = 33, o: SeparationOptions = {}): Float32Array {
  const lut = new Float32Array(n * n * n * 4);
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const p = softProofColor(r / (n - 1), g / (n - 1), b / (n - 1), o), i = ((b * n + g) * n + r) * 4;
    lut[i] = p[0]; lut[i + 1] = p[1]; lut[i + 2] = p[2]; lut[i + 3] = 1;
  }
  return lut;
}
/** CPU soft proof of a bitmap (exports / thumbnails). */
export function softProofBitmap(bm: Bitmap8, o: SeparationOptions = {}): Bitmap8 {
  const out = { width: bm.width, height: bm.height, data: new Uint8ClampedArray(bm.data) }, cache = new Map<number, number>();
  for (let i = 0; i < bm.data.length; i += 4) {
    const key = ((bm.data[i] >> 2) << 12) | ((bm.data[i + 1] >> 2) << 6) | (bm.data[i + 2] >> 2); let v = cache.get(key);
    if (v === undefined) { const p = softProofColor((bm.data[i] >> 2) / 63, (bm.data[i + 1] >> 2) / 63, (bm.data[i + 2] >> 2) / 63, o); v = (Math.round(p[0] * 255) << 16) | (Math.round(p[1] * 255) << 8) | Math.round(p[2] * 255); cache.set(key, v); }
    out.data[i] = v >> 16; out.data[i + 1] = (v >> 8) & 255; out.data[i + 2] = v & 255;
  }
  return out;
}
/** CMYK separation for export: interleaved CMYK bytes (0 = no ink) + alpha. */
export function separateCmyk(bm: Bitmap8, o: SeparationOptions = {}): { width: number; height: number; cmyk: Uint8Array; alpha: Uint8Array } {
  const N = bm.width * bm.height, cmyk = new Uint8Array(N * 4), alpha = new Uint8Array(N), cache = new Map<number, number>();
  for (let p = 0; p < N; p++) {
    const i = p * 4, key = ((bm.data[i] >> 2) << 12) | ((bm.data[i + 1] >> 2) << 6) | (bm.data[i + 2] >> 2); let v = cache.get(key);
    if (v === undefined) { const s = srgbToCmyk((bm.data[i] >> 2) / 63, (bm.data[i + 1] >> 2) / 63, (bm.data[i + 2] >> 2) / 63, o); v = ((Math.round(s[0] * 255) << 24) | (Math.round(s[1] * 255) << 16) | (Math.round(s[2] * 255) << 8) | Math.round(s[3] * 255)) >>> 0; cache.set(key, v); }
    cmyk[i] = v >>> 24; cmyk[i + 1] = (v >>> 16) & 255; cmyk[i + 2] = (v >>> 8) & 255; cmyk[i + 3] = v & 255; alpha[p] = bm.data[i + 3];
  }
  return { width: bm.width, height: bm.height, cmyk, alpha };
}
/** Fraction of pixels the CMYK model cannot reproduce within ΔRGB > tol (gamut warning). */
export function gamutWarningMask(bm: Bitmap8, tol = 12, o: SeparationOptions = {}): Uint8Array {
  const proof = softProofBitmap(bm, o), m = new Uint8Array(bm.width * bm.height);
  for (let p = 0; p < m.length; p++) { const i = p * 4; if (Math.max(Math.abs(bm.data[i] - proof.data[i]), Math.abs(bm.data[i + 1] - proof.data[i + 1]), Math.abs(bm.data[i + 2] - proof.data[i + 2])) > tol) m[p] = 255; }
  return m;
}
