// raster/transform — resampling and geometric transforms (Image Size, Free Transform,
// Distort/Perspective, Warp, Crop + Straighten, Canvas Size, Rotate/Flip, Content-Aware
// Scale). All work in premultiplied float internally so edges never get dark fringes.
//
// Resampling quality: separable kernels with the support widened by 1/scale when
// minifying (proper prefiltering — no aliasing), normalised weights, edge clamp:
//   nearest · bilinear (tent) · bicubic (Keys a = −0.5) · lanczos3 (sinc-windowed sinc).
// Free/perspective/warp transforms map inverse per output pixel; when the transform
// minifies, the source is first prefiltered with lanczos3 to the local scale.

import type { Affine } from './model';
import { affineMul } from './model';
import { createBitmap, type Bitmap8, type Rect } from './buffer';

export type ResampleFilter = 'nearest' | 'bilinear' | 'bicubic' | 'lanczos3';
const KERNEL: Record<ResampleFilter, { r: number; f: (x: number) => number }> = {
  nearest: { r: 0.5, f: x => (x > -0.5 && x <= 0.5 ? 1 : 0) },
  bilinear: { r: 1, f: x => Math.max(0, 1 - Math.abs(x)) },
  bicubic: { r: 2, f: x => { const a = -0.5, t = Math.abs(x); return t <= 1 ? (a + 2) * t ** 3 - (a + 3) * t * t + 1 : t < 2 ? a * t ** 3 - 5 * a * t * t + 8 * a * t - 4 * a : 0; } },
  lanczos3: { r: 3, f: x => { if (x === 0) return 1; if (Math.abs(x) >= 3) return 0; const px = Math.PI * x; return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px); } },
};

function toPremul(b: Bitmap8): Float32Array { const o = new Float32Array(b.data.length); for (let i = 0; i < o.length; i += 4) { const a = b.data[i + 3] / 255; o[i] = b.data[i] / 255 * a; o[i + 1] = b.data[i + 1] / 255 * a; o[i + 2] = b.data[i + 2] / 255 * a; o[i + 3] = a; } return o; }
function fromPremul(w: number, h: number, f: Float32Array): Bitmap8 {
  const out = createBitmap(w, h);
  for (let i = 0; i < f.length; i += 4) { const a = Math.min(1, Math.max(0, f[i + 3])); const k = a > 1e-6 ? 1 / a : 0; out.data[i] = Math.round(Math.min(1, Math.max(0, f[i] * k)) * 255); out.data[i + 1] = Math.round(Math.min(1, Math.max(0, f[i + 1] * k)) * 255); out.data[i + 2] = Math.round(Math.min(1, Math.max(0, f[i + 2] * k)) * 255); out.data[i + 3] = Math.round(a * 255); }
  return out;
}
function contributions(srcN: number, dstN: number, filter: ResampleFilter) {
  const k = KERNEL[filter], scale = dstN / srcN, fs = scale < 1 ? 1 / scale : 1, support = k.r * fs;
  const idx: Int32Array[] = [], wts: Float32Array[] = [];
  for (let i = 0; i < dstN; i++) {
    const c = (i + 0.5) / scale - 0.5, lo = Math.floor(c - support) + 1, hi = Math.floor(c + support);
    const ii: number[] = [], ww: number[] = []; let sum = 0;
    for (let j = lo; j <= hi; j++) { const w = filter === 'nearest' ? (j === Math.min(srcN - 1, Math.max(0, Math.round(c))) ? 1 : 0) : k.f((j - c) / fs); if (!w) continue; ii.push(Math.min(srcN - 1, Math.max(0, j))); ww.push(w); sum += w; }
    if (!ii.length) { ii.push(Math.min(srcN - 1, Math.max(0, Math.round(c)))); ww.push(1); sum = 1; }
    idx.push(Int32Array.from(ii)); wts.push(Float32Array.from(ww.map(w => w / sum)));
  }
  return { idx, wts };
}
/** Image Size: separable resample with proper prefiltering. */
export function resizeBitmap(src: Bitmap8, w: number, h: number, filter: ResampleFilter = 'lanczos3'): Bitmap8 {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const p = toPremul(src), cx = contributions(src.width, w, filter), cy = contributions(src.height, h, filter);
  const tmp = new Float32Array(w * src.height * 4);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < w; x++) {
    const I = cx.idx[x], Wt = cx.wts[x]; let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = 0; k < I.length; k++) { const s = (y * src.width + I[k]) * 4, wt = Wt[k]; a0 += p[s] * wt; a1 += p[s + 1] * wt; a2 += p[s + 2] * wt; a3 += p[s + 3] * wt; }
    const o = (y * w + x) * 4; tmp[o] = a0; tmp[o + 1] = a1; tmp[o + 2] = a2; tmp[o + 3] = a3;
  }
  const out = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) { const I = cy.idx[y], Wt = cy.wts[y]; for (let x = 0; x < w; x++) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let k = 0; k < I.length; k++) { const s = (I[k] * w + x) * 4, wt = Wt[k]; a0 += tmp[s] * wt; a1 += tmp[s + 1] * wt; a2 += tmp[s + 2] * wt; a3 += tmp[s + 3] * wt; }
    const o = (y * w + x) * 4; out[o] = a0; out[o + 1] = a1; out[o + 2] = a2; out[o + 3] = a3;
  } }
  return fromPremul(w, h, out);
}

// ── Point sampling for arbitrary warps ──────────────────────────────────────
function sampleInto(p: Float32Array, W: number, H: number, x: number, y: number, filter: ResampleFilter, out: number[]): void {
  out[0] = out[1] = out[2] = out[3] = 0;
  const fx = x - 0.5, fy = y - 0.5;
  if (filter === 'nearest') { const ix = Math.round(fx), iy = Math.round(fy); if (ix < 0 || iy < 0 || ix >= W || iy >= H) return; const k = (iy * W + ix) * 4; out[0] = p[k]; out[1] = p[k + 1]; out[2] = p[k + 2]; out[3] = p[k + 3]; return; }
  const K = KERNEL[filter], r = Math.ceil(K.r), x0 = Math.floor(fx), y0 = Math.floor(fy);
  let wsum = 0;
  for (let j = y0 - r + 1; j <= y0 + r; j++) { const wy = K.f(j - fy); if (!wy) continue;
    for (let i = x0 - r + 1; i <= x0 + r; i++) { const w = K.f(i - fx) * wy; if (!w) continue; wsum += w;
      if (i < 0 || j < 0 || i >= W || j >= H) continue; // transparent outside
      const k = (j * W + i) * 4; out[0] += p[k] * w; out[1] += p[k + 1] * w; out[2] += p[k + 2] * w; out[3] += p[k + 3] * w; } }
  if (wsum) { out[0] /= wsum; out[1] /= wsum; out[2] /= wsum; out[3] /= wsum; }
}

/** Homography (3×3 row-major) mapping src → dst. */
export type Homography = number[];
export function homographyFromQuads(src: [number, number][], dst: [number, number][]): Homography {
  // Solve 8×8 DLT with h33 = 1.
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b); return [...h, 1];
}
function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]]; const d = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map(r => r[n]);
}
export function invertHomography(h: Homography): Homography {
  const [a, b, c, d, e, f, g, hh, i] = h, A = e * i - f * hh, B = -(d * i - f * g), C = d * hh - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * hh) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * hh - b * g) / det, (a * e - b * d) / det];
}
export const affineToHomography = (m: Affine): Homography => [m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1];

export interface WarpOptions { width: number; height: number; filter?: ResampleFilter }
/** Warp src by homography src→dst into a new W×H canvas (transparent outside). */
export function warpHomography(src: Bitmap8, h: Homography, o: WarpOptions): Bitmap8 {
  const filter = o.filter ?? 'bicubic';
  // minification prefilter: local scale at the destination centre
  const inv = invertHomography(h), map = (x: number, y: number) => { const w = inv[6] * x + inv[7] * y + inv[8]; return [(inv[0] * x + inv[1] * y + inv[2]) / w, (inv[3] * x + inv[4] * y + inv[5]) / w]; };
  const c = map(o.width / 2, o.height / 2), cx = map(o.width / 2 + 1, o.height / 2), cy = map(o.width / 2, o.height / 2 + 1);
  const foot = Math.sqrt(Math.abs((cx[0] - c[0]) * (cy[1] - c[1]) - (cx[1] - c[1]) * (cy[0] - c[0])));
  let s = src, pre = 1;
  if (foot > 1.35) { pre = 1 / foot; s = resizeBitmap(src, src.width * pre, src.height * pre, 'lanczos3'); }
  const p = toPremul(s), out = new Float32Array(o.width * o.height * 4), px = [0, 0, 0, 0];
  const sx = s.width / src.width, sy = s.height / src.height;
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
    const q = map(x + 0.5, y + 0.5); sampleInto(p, s.width, s.height, q[0] * sx, q[1] * sy, filter, px);
    out.set(px, (y * o.width + x) * 4);
  }
  return fromPremul(o.width, o.height, out);
}
/** Free Transform (scale/rotate/skew): affine src→dst. */
export const transformAffine = (src: Bitmap8, m: Affine, o: WarpOptions) => warpHomography(src, affineToHomography(m), o);
/** Distort / Perspective: drag the four corners (TL, TR, BR, BL) of the source. */
export function distortCorners(src: Bitmap8, corners: [number, number][], o: WarpOptions): Bitmap8 {
  const S: [number, number][] = [[0, 0], [src.width, 0], [src.width, src.height], [0, src.height]];
  return warpHomography(src, homographyFromQuads(S, corners), o);
}

// ── Warp (Photoshop-style Bézier mesh) ──────────────────────────────────────
/** Control grid of (3·cols+1) × (3·rows+1) points, row-major, in destination px. */
export interface WarpMesh { cols: number; rows: number; points: [number, number][] }
export function defaultWarpMesh(w: number, h: number, cols = 1, rows = 1): WarpMesh {
  const nx = 3 * cols + 1, ny = 3 * rows + 1, points: [number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) points.push([i / (nx - 1) * w, j / (ny - 1) * h]);
  return { cols, rows, points };
}
const bern = (t: number) => { const u = 1 - t; return [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; };
export function evalWarpMesh(m: WarpMesh, u: number, v: number): [number, number] {
  const cu = Math.min(m.cols - 1, Math.floor(u * m.cols)), cv = Math.min(m.rows - 1, Math.floor(v * m.rows));
  const lu = u * m.cols - cu, lv = v * m.rows - cv, bu = bern(lu), bv = bern(lv), nx = 3 * m.cols + 1;
  let x = 0, y = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const p = m.points[(cv * 3 + j) * nx + cu * 3 + i], w = bu[i] * bv[j]; x += p[0] * w; y += p[1] * w; }
  return [x, y];
}
/** Render a warp: tessellate the patch and inverse-map each destination triangle (bicubic). */
export function warpMesh(src: Bitmap8, mesh: WarpMesh, o: WarpOptions & { tessellation?: number }): Bitmap8 {
  const T = o.tessellation ?? 48, filter = o.filter ?? 'bicubic', p = toPremul(src), out = new Float32Array(o.width * o.height * 4), px = [0, 0, 0, 0];
  const grid: [number, number][] = []; for (let j = 0; j <= T; j++) for (let i = 0; i <= T; i++) grid.push(evalWarpMesh(mesh, i / T, j / T));
  const tri = (a: number, b: number, c: number, ua: [number, number], ub: [number, number], uc: [number, number]) => {
    const A = grid[a], B = grid[b], C = grid[c];
    const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), maxX = Math.min(o.width - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), maxY = Math.min(o.height - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(den) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const X = x + 0.5, Y = y + 0.5;
      const l1 = ((B[1] - C[1]) * (X - C[0]) + (C[0] - B[0]) * (Y - C[1])) / den, l2 = ((C[1] - A[1]) * (X - C[0]) + (A[0] - C[0]) * (Y - C[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const u = l1 * ua[0] + l2 * ub[0] + l3 * uc[0], v = l1 * ua[1] + l2 * ub[1] + l3 * uc[1];
      sampleInto(p, src.width, src.height, u * src.width, v * src.height, filter, px);
      out.set(px, (y * o.width + x) * 4);
    }
  };
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const a = j * (T + 1) + i, b = a + 1, c = a + T + 1, d = c + 1;
    const ua: [number, number] = [i / T, j / T], ub: [number, number] = [(i + 1) / T, j / T], uc: [number, number] = [i / T, (j + 1) / T], ud: [number, number] = [(i + 1) / T, (j + 1) / T];
    tri(a, b, d, ua, ub, ud); tri(a, d, c, ua, ud, uc);
  }
  return fromPremul(o.width, o.height, out);
}

// ── Simple geometry ─────────────────────────────────────────────────────────
export function flip(src: Bitmap8, axis: 'horizontal' | 'vertical'): Bitmap8 {
  const out = createBitmap(src.width, src.height), W = src.width, H = src.height;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const sx = axis === 'horizontal' ? W - 1 - x : x, sy = axis === 'vertical' ? H - 1 - y : y; out.data.set(src.data.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * W + x) * 4); }
  return out;
}
export function rotate90(src: Bitmap8, dir: 'cw' | 'ccw' | '180'): Bitmap8 {
  const W = src.width, H = src.height; if (dir === '180') return flip(flip(src, 'horizontal'), 'vertical');
  const out = createBitmap(H, W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const nx = dir === 'cw' ? H - 1 - y : y, ny = dir === 'cw' ? x : W - 1 - x; out.data.set(src.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (ny * H + nx) * 4); }
  return out;
}
export interface CropOptions { rect: Rect; /** straighten angle in degrees, rotation about the crop centre */ angle?: number; filter?: ResampleFilter }
export function crop(src: Bitmap8, o: CropOptions): Bitmap8 {
  const { rect } = o; const a = (o.angle || 0) * Math.PI / 180;
  if (!a && Number.isInteger(rect.x) && Number.isInteger(rect.y)) {
    const out = createBitmap(rect.width, rect.height);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) { const sx = x + rect.x, sy = y + rect.y; if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue; out.data.set(src.data.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4), (y * rect.width + x) * 4); }
    return out;
  }
  // dst = R(−a) about the crop centre, then translate crop origin to 0
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2, c = Math.cos(-a), s = Math.sin(-a);
  const m: Affine = affineMul([1, 0, 0, 1, rect.width / 2, rect.height / 2], affineMul([c, s, -s, c, 0, 0], [1, 0, 0, 1, -cx, -cy]));
  return transformAffine(src, m, { width: rect.width, height: rect.height, filter: o.filter ?? 'bicubic' });
}
/** Largest axis-aligned crop inside an image rotated by `angle` (Crop tool "straighten" auto-fit). */
export function straightenCropRect(w: number, h: number, angleDeg: number): Rect {
  const a = Math.abs(angleDeg * Math.PI / 180) % Math.PI, sin = Math.abs(Math.sin(a)), cos = Math.abs(Math.cos(a));
  const longSide = Math.max(w, h), shortSide = Math.min(w, h);
  let wr: number, hr: number;
  if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 1e-10) { const x = 0.5 * shortSide; if (w >= h) { wr = x / sin; hr = x / cos; } else { wr = x / cos; hr = x / sin; } }
  else { const c2 = cos * cos - sin * sin; wr = (w * cos - h * sin) / c2; hr = (h * cos - w * sin) / c2; }
  return { x: (w - wr) / 2, y: (h - hr) / 2, width: Math.floor(wr), height: Math.floor(hr) };
}
export const ASPECT_PRESETS = { original: 0, square: 1, '4:5': 4 / 5, '5:7': 5 / 7, '2:3': 2 / 3, '3:2': 3 / 2, '16:9': 16 / 9, '9:16': 9 / 16, '1.91:1': 1.91 } as const;
export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';
/** Offset of old content inside a new canvas size for an anchor (Canvas Size dialog). */
export function anchorOffset(oldW: number, oldH: number, newW: number, newH: number, anchor: Anchor): [number, number] {
  const fx = anchor.includes('l') ? 0 : anchor.includes('r') ? 1 : 0.5, fy = anchor.startsWith('t') ? 0 : anchor.startsWith('b') ? 1 : 0.5;
  return [Math.round((newW - oldW) * fx), Math.round((newH - oldH) * fy)];
}
export function canvasSize(src: Bitmap8, newW: number, newH: number, anchor: Anchor = 'c', fill: [number, number, number, number] = [0, 0, 0, 0]): Bitmap8 {
  const out = createBitmap(newW, newH, fill), [ox, oy] = anchorOffset(src.width, src.height, newW, newH, anchor);
  for (let y = 0; y < src.height; y++) { const ty = y + oy; if (ty < 0 || ty >= newH) continue; const x0 = Math.max(0, -ox), x1 = Math.min(src.width, newW - ox); if (x1 <= x0) continue; out.data.set(src.data.subarray((y * src.width + x0) * 4, (y * src.width + x1) * 4), (ty * newW + ox + x0) * 4); }
  return out;
}

// ── Content-Aware Scale (seam carving, with optional protect mask) ──────────
function transposeBm(b: Bitmap8): Bitmap8 { const o = createBitmap(b.height, b.width); for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) o.data.set(b.data.subarray((y * b.width + x) * 4, (y * b.width + x) * 4 + 4), (x * b.height + y) * 4); return o; }
function transposeMask(m: Uint8Array, w: number, h: number): Uint8Array { const o = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[x * h + y] = m[y * w + x]; return o; }
function seamsWidth(src: Bitmap8, newW: number, protect?: Uint8Array): Bitmap8 {
  let img = src, prot = protect;
  const remove = newW < src.width, count = Math.abs(newW - src.width);
  if (!remove) {
    // find `count` seams on the original (removing them from a copy), then duplicate them
    const order: number[][] = []; let work = src, wp = protect, idxMap: Int32Array[] = Array.from({ length: src.height }, () => Int32Array.from({ length: src.width }, (_, i) => i));
    for (let k = 0; k < count; k++) { const seam = findSeam(work, wp); order.push(seam.map((x, y) => idxMap[y][x])); work = removeSeam(work, seam); wp = wp && removeSeamMask(wp, work.width + 1, work.height, seam); idxMap = idxMap.map((row, y) => { const r = new Int32Array(row.length - 1); r.set(row.subarray(0, seam[y])); r.set(row.subarray(seam[y] + 1), seam[y]); return r; }); }
    const dup = Array.from({ length: src.height }, () => new Uint8Array(src.width));
    for (const s of order) s.forEach((x, y) => { dup[y][x]++; });
    const out = createBitmap(newW, src.height);
    for (let y = 0; y < src.height; y++) { let o = 0; for (let x = 0; x < src.width; x++) { const k = (y * src.width + x) * 4; for (let r = 0; r <= dup[y][x]; r++) { if (o >= newW) break; if (r > 0 && x + 1 < src.width) { for (let c = 0; c < 4; c++) out.data[(y * newW + o) * 4 + c] = (src.data[k + c] + src.data[k + 4 + c]) >> 1; } else out.data.set(src.data.subarray(k, k + 4), (y * newW + o) * 4); o++; } } }
    return out;
  }
  for (let k = 0; k < count; k++) { const seam = findSeam(img, prot); const w = img.width; img = removeSeam(img, seam); if (prot) prot = removeSeamMask(prot, w, img.height, seam); }
  return img;
}
function findSeam(b: Bitmap8, protect?: Uint8Array): number[] {
  const W = b.width, H = b.height, e = new Float32Array(W * H), d = b.data;
  const L = (x: number, y: number) => { x = Math.max(0, Math.min(W - 1, x)); const k = (y * W + x) * 4; return 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1); e[y * W + x] = Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(L(x, yd) - L(x, yu)) + (protect && protect[y * W + x] > 127 ? 1e6 : 0); }
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) { let m = e[(y - 1) * W + x]; if (x > 0) m = Math.min(m, e[(y - 1) * W + x - 1]); if (x < W - 1) m = Math.min(m, e[(y - 1) * W + x + 1]); e[y * W + x] += m; }
  const seam = new Array(H); let bx = 0; for (let x = 1; x < W; x++) if (e[(H - 1) * W + x] < e[(H - 1) * W + bx]) bx = x; seam[H - 1] = bx;
  for (let y = H - 2; y >= 0; y--) { const px = seam[y + 1]; let best = px; for (const x of [px - 1, px + 1]) if (x >= 0 && x < W && e[y * W + x] < e[y * W + best]) best = x; seam[y] = best; }
  return seam;
}
function removeSeam(b: Bitmap8, seam: number[]): Bitmap8 {
  const W = b.width - 1, out = createBitmap(W, b.height);
  for (let y = 0; y < b.height; y++) { const s = seam[y], row = y * b.width * 4; out.data.set(b.data.subarray(row, row + s * 4), y * W * 4); out.data.set(b.data.subarray(row + (s + 1) * 4, row + b.width * 4), (y * W + s) * 4); }
  return out;
}
function removeSeamMask(m: Uint8Array, w: number, h: number, seam: number[]): Uint8Array { const o = new Uint8Array((w - 1) * h); for (let y = 0; y < h; y++) { o.set(m.subarray(y * w, y * w + seam[y]), y * (w - 1)); o.set(m.subarray(y * w + seam[y] + 1, (y + 1) * w), y * (w - 1) + seam[y]); } return o; }
/** Content-Aware Scale to newW × newH (seams; protect mask = 255 where content must survive). */
export function contentAwareScale(src: Bitmap8, newW: number, newH: number, protect?: Uint8Array): Bitmap8 {
  let out = newW !== src.width ? seamsWidth(src, newW, protect) : src;
  if (newH !== src.height) { const pt = protect && newW === src.width ? transposeMask(protect, src.width, src.height) : undefined; out = transposeBm(seamsWidth(transposeBm(out), newH, pt)); }
  return out;
}
