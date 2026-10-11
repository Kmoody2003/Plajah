// raster/filters — the filter set (usable as smart filters), CPU reference.
//
// Every filter maps a premultiplied RasterF → new RasterF of the same size. Neighbourhood
// filters treat pixels outside the buffer as TRANSPARENT (zero) — layer content fades at
// its edges exactly like Photoshop — and the compositor supplies an apron (filterApron)
// around each tile so tiled renders are seamless. Blur-type filters work on premultiplied
// values (correct for alpha); tonal filters (high pass, emboss, find edges, noise,
// halftone) unpremultiply first and keep the source alpha.
//
// GPU twins exist for: gaussian, box, unsharp, high pass, motion, radial, pixelate,
// emboss, find edges, add noise (see gl/shaders.ts). Others run here (and in workers).

import type { Filter } from './model';
import { createRaster, cloneRaster, clamp01, hash01, luma601, sampleBilinear, type RasterF } from './buffer';
import { compileAdjustment, applyAdjustmentRaster } from './adjust';

export interface FilterContext { originX: number; originY: number; docWidth: number; docHeight: number; /** preview scale (radii are in doc px) */ scale: number; linear: boolean }
export const DEFAULT_FILTER_CTX: FilterContext = { originX: 0, originY: 0, docWidth: 0, docHeight: 0, scale: 1, linear: false };

/** Pixels of context a filter needs on each side (in OUTPUT pixels at ctx.scale). */
export function filterApron(f: Filter, scale = 1): number {
  const s = (v: number) => Math.ceil(v * scale);
  switch (f.type) {
    case 'gaussianBlur': return s(f.radius * 3) + 1;
    case 'boxBlur': case 'median': case 'oilPaint': case 'dustAndScratches': return s(f.radius) + 1;
    case 'surfaceBlur': return s(f.radius) + 1;
    case 'unsharpMask': case 'smartSharpen': case 'highPass': return s(f.radius * 3) + 2;
    case 'motionBlur': return s(f.distance) + 2;
    case 'radialBlur': return 64; // centre-relative; tiles clamp to 64px apron (documented approximation)
    case 'reduceNoise': return 6;
    case 'emboss': return s(f.height) + 2;
    case 'findEdges': case 'posterizeEdges': return 2;
    case 'pixelate': return s(f.cellSize);
    case 'halftone': return s(f.cellSize) * 2;
    default: return 0;
  }
}

// ── Separable kernels ───────────────────────────────────────────────────────
export function gaussianKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(r * 2 + 1); let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum; return k;
}
/** Convolve rows then columns with a symmetric kernel; zero outside. */
export function convolveSeparable(src: RasterF, k: Float32Array, kv: Float32Array = k): RasterF {
  const W = src.width, H = src.height, r = (k.length - 1) >> 1, rv = (kv.length - 1) >> 1;
  const tmp = createRaster(W, H), out = createRaster(W, H), s = src.data, t = tmp.data, o = out.data;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      const lo = Math.max(-r, -x), hi = Math.min(r, W - 1 - x);
      for (let i = lo; i <= hi; i++) { const w = k[i + r], j = (row + x + i) * 4; a0 += s[j] * w; a1 += s[j + 1] * w; a2 += s[j + 2] * w; a3 += s[j + 3] * w; }
      const j = (row + x) * 4; t[j] = a0; t[j + 1] = a1; t[j + 2] = a2; t[j + 3] = a3;
    }
  }
  for (let y = 0; y < H; y++) {
    const lo = Math.max(-rv, -y), hi = Math.min(rv, H - 1 - y);
    for (let x = 0; x < W; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
      for (let i = lo; i <= hi; i++) { const w = kv[i + rv], j = ((y + i) * W + x) * 4; a0 += t[j] * w; a1 += t[j + 1] * w; a2 += t[j + 2] * w; a3 += t[j + 3] * w; }
      const j = (y * W + x) * 4; o[j] = a0; o[j + 1] = a1; o[j + 2] = a2; o[j + 3] = a3;
    }
  }
  return out;
}
/** O(1)-per-pixel box blur (sliding sums), zero outside. */
export function boxBlur(src: RasterF, radius: number): RasterF {
  const r = Math.max(0, Math.round(radius)); if (!r) return cloneRaster(src);
  const W = src.width, H = src.height, n = 2 * r + 1, tmp = createRaster(W, H), out = createRaster(W, H);
  const pass = (from: Float32Array, to: Float32Array, len: number, count: number, stride: number, step: number) => {
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let i = 0; i <= Math.min(r, len - 1); i++) acc += from[(base + i * step) * 4 + c];
        for (let i = 0; i < len; i++) {
          to[(base + i * step) * 4 + c] = acc / n;
          const add = i + r + 1, sub = i - r;
          if (add < len) acc += from[(base + add * step) * 4 + c];
          if (sub >= 0) acc -= from[(base + sub * step) * 4 + c];
        }
      }
    }
  };
  pass(src.data, tmp.data, W, H, W, 1);
  pass(tmp.data, out.data, H, W, 1, W);
  return out;
}
export function gaussianBlur(src: RasterF, sigma: number): RasterF {
  if (sigma <= 0.05) return cloneRaster(src);
  if (sigma > 24) { // 3 box passes ≈ gaussian (Wells 1986): box widths from σ
    const wIdeal = Math.sqrt((12 * sigma * sigma / 3) + 1); let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
    const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    let r = src; for (let i = 0; i < 3; i++) r = boxBlur(r, ((i < m ? wl : wl + 2) - 1) / 2); return r;
  }
  return convolveSeparable(src, gaussianKernel(sigma));
}

// ── Straight-colour helpers ─────────────────────────────────────────────────
function mapStraight(src: RasterF, fn: (c: number[], x: number, y: number, a: number) => void): RasterF {
  const out = cloneRaster(src), d = out.data, c = [0, 0, 0]; const W = src.width;
  for (let p = 0, i = 0; i < d.length; p++, i += 4) {
    const a = d[i + 3]; if (a <= 0) continue; const ia = 1 / a;
    c[0] = d[i] * ia; c[1] = d[i + 1] * ia; c[2] = d[i + 2] * ia;
    fn(c, p % W, (p / W) | 0, a);
    d[i] = clamp01(c[0]) * a; d[i + 1] = clamp01(c[1]) * a; d[i + 2] = clamp01(c[2]) * a;
  }
  return out;
}
const straightAt = (r: RasterF, x: number, y: number, c: number[]) => {
  x = Math.max(0, Math.min(r.width - 1, x)); y = Math.max(0, Math.min(r.height - 1, y));
  const i = (y * r.width + x) * 4, a = r.data[i + 3];
  if (a <= 0) { c[0] = c[1] = c[2] = 0; return 0; } c[0] = r.data[i] / a; c[1] = r.data[i + 1] / a; c[2] = r.data[i + 2] / a; return a;
};

export function unsharpMask(src: RasterF, amountPct: number, radius: number, threshold255: number): RasterF {
  const blur = gaussianBlur(src, radius), out = cloneRaster(src), d = out.data, b = blur.data, amt = amountPct / 100, th = threshold255 / 255;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]; if (a <= 0) continue;
    const ba = Math.max(1e-6, b[i + 3]);
    for (let c = 0; c < 3; c++) {
      const v = d[i + c] / a, bv = b[i + c] / ba, diff = v - bv;
      if (Math.abs(diff) >= th) d[i + c] = clamp01(v + diff * amt) * a;
    }
  }
  return out;
}
export function highPass(src: RasterF, radius: number): RasterF {
  const blur = gaussianBlur(src, radius), b = blur.data;
  return mapStraight(src, (c, x, y) => { const i = (y * src.width + x) * 4, ba = Math.max(1e-6, b[i + 3]); for (let k = 0; k < 3; k++) c[k] = c[k] - b[i + k] / ba + 0.5; });
}

export function motionBlur(src: RasterF, angleDeg: number, distance: number): RasterF {
  const W = src.width, H = src.height, out = createRaster(W, H), n = Math.max(1, Math.round(distance)), px = new Float32Array(4);
  const r = angleDeg * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let i = 0; i <= n; i++) { const t = (i / n - 0.5) * distance; sampleBilinear(src, x + 0.5 + dx * t, y + 0.5 + dy * t, px); a0 += px[0]; a1 += px[1]; a2 += px[2]; a3 += px[3]; }
    const j = (y * W + x) * 4, k = 1 / (n + 1); out.data[j] = a0 * k; out.data[j + 1] = a1 * k; out.data[j + 2] = a2 * k; out.data[j + 3] = a3 * k;
  }
  return out;
}
export function radialBlur(src: RasterF, mode: 'spin' | 'zoom', amount: number, cx: number, cy: number): RasterF {
  // cx, cy in buffer pixels.
  const W = src.width, H = src.height, out = createRaster(W, H), px = new Float32Array(4), n = 24;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ox = x + 0.5 - cx, oy = y + 0.5 - cy; let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5);
      let sx: number, sy: number;
      if (mode === 'spin') { const ang = t * amount * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang); sx = cx + ox * c - oy * s; sy = cy + ox * s + oy * c; }
      else { const k = 1 + t * amount / 100; sx = cx + ox * k; sy = cy + oy * k; }
      sampleBilinear(src, sx, sy, px); a0 += px[0]; a1 += px[1]; a2 += px[2]; a3 += px[3];
    }
    const j = (y * W + x) * 4; out.data[j] = a0 / n; out.data[j + 1] = a1 / n; out.data[j + 2] = a2 / n; out.data[j + 3] = a3 / n;
  }
  return out;
}

/** Photoshop Surface Blur: weights 1 − |Δ|/(2.5·threshold) (clipped), box window. */
export function surfaceBlur(src: RasterF, radius: number, threshold255: number): RasterF {
  const W = src.width, H = src.height, r = Math.max(1, Math.round(radius)), out = createRaster(W, H), d = src.data, o = out.data;
  const th = Math.max(1, threshold255) / 255 * 2.5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = d[i + 3]; if (a <= 0) continue;
    const c0 = d[i] / a, c1 = d[i + 1] / a, c2 = d[i + 2] / a;
    let w0 = 0, w1 = 0, w2 = 0, s0 = 0, s1 = 0, s2 = 0;
    for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) {
      const q = (j * W + k) * 4, qa = d[q + 3]; if (qa <= 0) continue;
      const v0 = d[q] / qa, v1 = d[q + 1] / qa, v2 = d[q + 2] / qa;
      const e0 = Math.max(0, 1 - Math.abs(v0 - c0) / th), e1 = Math.max(0, 1 - Math.abs(v1 - c1) / th), e2 = Math.max(0, 1 - Math.abs(v2 - c2) / th);
      w0 += e0; w1 += e1; w2 += e2; s0 += v0 * e0; s1 += v1 * e1; s2 += v2 * e2;
    }
    o[i] = (s0 / w0) * a; o[i + 1] = (s1 / w1) * a; o[i + 2] = (s2 / w2) * a; o[i + 3] = a;
  }
  return out;
}

/** Edge-preserving bilateral (gaussian spatial × gaussian range). */
export function bilateral(src: RasterF, sigmaS: number, sigmaR: number): RasterF {
  const W = src.width, H = src.height, r = Math.ceil(sigmaS * 2), out = cloneRaster(src), d = src.data, o = out.data;
  const sw = new Float32Array((2 * r + 1) ** 2); for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) sw[(j + r) * (2 * r + 1) + k + r] = Math.exp(-(j * j + k * k) / (2 * sigmaS * sigmaS));
  const ir = 1 / (2 * sigmaR * sigmaR);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = d[i + 3]; if (a <= 0) continue;
    const c0 = d[i] / a, c1 = d[i + 1] / a, c2 = d[i + 2] / a; let ws = 0, s0 = 0, s1 = 0, s2 = 0;
    for (let j = -r; j <= r; j++) { const yy = y + j; if (yy < 0 || yy >= H) continue; for (let k = -r; k <= r; k++) {
      const xx = x + k; if (xx < 0 || xx >= W) continue; const q = (yy * W + xx) * 4, qa = d[q + 3]; if (qa <= 0) continue;
      const v0 = d[q] / qa, v1 = d[q + 1] / qa, v2 = d[q + 2] / qa, dd = (v0 - c0) ** 2 + (v1 - c1) ** 2 + (v2 - c2) ** 2;
      const w = sw[(j + r) * (2 * r + 1) + k + r] * Math.exp(-dd * ir); ws += w; s0 += v0 * w; s1 += v1 * w; s2 += v2 * w;
    } }
    o[i] = s0 / ws * a; o[i + 1] = s1 / ws * a; o[i + 2] = s2 / ws * a;
  }
  return out;
}
/** Basic non-local means: 3×3 patches, 7×7 search window. h = filtering strength. */
export function nonLocalMeans(src: RasterF, h: number): RasterF {
  const W = src.width, H = src.height, out = cloneRaster(src), d = src.data, o = out.data, R = 3, P = 1, ih = 1 / Math.max(1e-6, h * h);
  const lumA = new Float32Array(W * H); for (let p = 0; p < W * H; p++) { const a = d[p * 4 + 3]; lumA[p] = a > 0 ? luma601(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]) / a : 0; }
  const L = (x: number, y: number) => lumA[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = d[i + 3]; if (a <= 0) continue;
    let ws = 0, s0 = 0, s1 = 0, s2 = 0;
    for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
      const xx = x + k, yy = y + j; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      let dist = 0; for (let pj = -P; pj <= P; pj++) for (let pk = -P; pk <= P; pk++) { const e = L(x + pk, y + pj) - L(xx + pk, yy + pj); dist += e * e; }
      const w = Math.exp(-dist / 9 * ih), q = (yy * W + xx) * 4, qa = d[q + 3]; if (qa <= 0) continue;
      ws += w; s0 += d[q] / qa * w; s1 += d[q + 1] / qa * w; s2 += d[q + 2] / qa * w;
    }
    o[i] = s0 / ws * a; o[i + 1] = s1 / ws * a; o[i + 2] = s2 / ws * a;
  }
  return out;
}

/** Per-channel median (premultiplied values, square window). */
export function median(src: RasterF, radius: number): RasterF {
  const W = src.width, H = src.height, r = Math.max(1, Math.round(radius)), out = createRaster(W, H), d = src.data, o = out.data;
  const buf = new Float32Array((2 * r + 1) ** 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) {
    let n = 0;
    for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) buf[n++] = d[(j * W + k) * 4 + c];
    const v = buf.subarray(0, n).sort(); o[(y * W + x) * 4 + c] = v[n >> 1];
  }
  return out;
}
export function dustAndScratches(src: RasterF, radius: number, threshold255: number): RasterF {
  const med = median(src, radius), out = cloneRaster(src), th = threshold255 / 255;
  for (let i = 0; i < out.data.length; i += 4) {
    let diff = 0; for (let c = 0; c < 3; c++) diff = Math.max(diff, Math.abs(out.data[i + c] - med.data[i + c]));
    if (diff > th) for (let c = 0; c < 4; c++) out.data[i + c] = med.data[i + c];
  }
  return out;
}

export function emboss(src: RasterF, angleDeg: number, height: number, amountPct: number): RasterF {
  const r = angleDeg * Math.PI / 180, dx = Math.cos(r) * Math.max(1, height), dy = -Math.sin(r) * Math.max(1, height), amt = amountPct / 100;
  const ca = [0, 0, 0], cb = [0, 0, 0];
  return mapStraight(src, (c, x, y) => {
    straightAt(src, Math.round(x - dx), Math.round(y - dy), ca); straightAt(src, Math.round(x + dx), Math.round(y + dy), cb);
    const g = clamp01(0.5 + (luma601(cb[0], cb[1], cb[2]) - luma601(ca[0], ca[1], ca[2])) * amt);
    c[0] = c[1] = c[2] = g;
  });
}
export function findEdges(src: RasterF): RasterF {
  const nb: number[][] = Array.from({ length: 9 }, () => [0, 0, 0]);
  return mapStraight(src, (c, x, y) => {
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) straightAt(src, x + k, y + j, nb[(j + 1) * 3 + k + 1]);
    for (let ch = 0; ch < 3; ch++) {
      const p = (k: number, j: number) => nb[(j + 1) * 3 + k + 1][ch];
      const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      c[ch] = 1 - clamp01(Math.sqrt(gx * gx + gy * gy) / 4);
    }
  });
}
export function pixelate(src: RasterF, cell: number, originX = 0, originY = 0): RasterF {
  const W = src.width, H = src.height, s = Math.max(1, Math.round(cell)), out = createRaster(W, H);
  const ox = ((originX % s) + s) % s, oy = ((originY % s) + s) % s; // align cells to the document grid
  for (let by = -oy; by < H; by += s) for (let bx = -ox; bx < W; bx += s) {
    const x0 = Math.max(0, bx), y0 = Math.max(0, by), x1 = Math.min(W, bx + s), y1 = Math.min(H, by + s);
    const acc = [0, 0, 0, 0]; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 4; c++) acc[c] += src.data[i + c]; n++; }
    if (!n) continue;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; for (let c = 0; c < 4; c++) out.data[i + c] = acc[c] / n; }
  }
  return out;
}
/** Kuwahara (oil paint): mean of the lowest-variance quadrant. */
export function kuwahara(src: RasterF, radius: number): RasterF {
  const W = src.width, H = src.height, r = Math.max(1, Math.round(radius)), out = cloneRaster(src), d = src.data;
  const quads = [[-r, 0, -r, 0], [0, r, -r, 0], [-r, 0, 0, r], [0, r, 0, r]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = Infinity; const bm = [0, 0, 0, 0];
    for (const [x0, x1, y0, y1] of quads) {
      const m = [0, 0, 0, 0]; let n = 0, s2 = 0;
      for (let j = y0; j <= y1; j++) for (let k = x0; k <= x1; k++) {
        const yy = Math.max(0, Math.min(H - 1, y + j)), xx = Math.max(0, Math.min(W - 1, x + k)), i = (yy * W + xx) * 4;
        for (let c = 0; c < 4; c++) m[c] += d[i + c]; const l = luma601(d[i], d[i + 1], d[i + 2]); s2 += l * l; n++;
      }
      for (let c = 0; c < 4; c++) m[c] /= n;
      const lm = luma601(m[0], m[1], m[2]), v = s2 / n - lm * lm;
      if (v < best) { best = v; bm[0] = m[0]; bm[1] = m[1]; bm[2] = m[2]; bm[3] = m[3]; }
    }
    out.data.set(bm, (y * W + x) * 4);
  }
  return out;
}
/** Colour halftone: per-channel rotated dot screens (angles a+15, a+75, a), dot area = ink. */
export function halftone(src: RasterF, cell: number, angleDeg: number, originX = 0, originY = 0): RasterF {
  const s = Math.max(2, cell), blur = boxBlur(src, s / 2), angles = [angleDeg + 15, angleDeg + 75, angleDeg].map(a => a * Math.PI / 180), b = blur.data, W = src.width;
  return mapStraight(src, (c, x, y) => {
    const i = (y * W + x) * 4, ba = Math.max(1e-6, b[i + 3]);
    for (let ch = 0; ch < 3; ch++) {
      const ink = 1 - clamp01(b[i + ch] / ba), cs = Math.cos(angles[ch]), sn = Math.sin(angles[ch]);
      const X = x + originX + 0.5, Y = y + originY + 0.5, u = X * cs + Y * sn, v = -X * sn + Y * cs;
      const fu = (u / s) - Math.floor(u / s) - 0.5, fv = (v / s) - Math.floor(v / s) - 0.5;
      const dist = Math.sqrt(fu * fu + fv * fv) * s, rad = Math.sqrt(ink / Math.PI) * s;
      c[ch] = 1 - clamp01(rad - dist + 0.5);
    }
  });
}
export function posterizeEdges(src: RasterF, thickness: number, intensity: number, levels: number): RasterF {
  const edges = findEdges(src), n = Math.max(2, Math.round(levels)), q = (v: number) => Math.min(n - 1, Math.floor(v * n)) / (n - 1), W = src.width;
  return mapStraight(src, (c, x, y) => {
    const i = (y * W + x) * 4, ea = Math.max(1e-6, edges.data[i + 3]);
    const e = 1 - luma601(edges.data[i] / ea, edges.data[i + 1] / ea, edges.data[i + 2] / ea);
    const dark = e * (intensity / 10) > (1 - thickness / 10) * 0.6 ? 1 - clamp01(e * intensity / 10) : 1;
    for (let k = 0; k < 3; k++) c[k] = q(c[k]) * dark;
  });
}
export function addNoise(src: RasterF, amountPct: number, gaussian: boolean, mono: boolean, seed = 1, originX = 0, originY = 0): RasterF {
  const amt = amountPct / 100;
  const g = (x: number, y: number, s: number) => gaussian
    ? Math.sqrt(-2 * Math.log(Math.max(1e-9, hash01(x, y, s)))) * Math.cos(2 * Math.PI * hash01(x, y, s + 101)) * 0.5
    : hash01(x, y, s) - 0.5;
  return mapStraight(src, (c, x, y) => {
    const X = x + originX, Y = y + originY;
    if (mono) { const n = g(X, Y, seed) * amt * 2; for (let k = 0; k < 3; k++) c[k] += n; }
    else for (let k = 0; k < 3; k++) c[k] += g(X, Y, seed + k * 7) * amt * 2;
  });
}

/** Dispatch one filter. Radii are in document px; ctx.scale converts for previews. */
export function applyFilter(src: RasterF, f: Filter, ctx: FilterContext = DEFAULT_FILTER_CTX): RasterF {
  const s = ctx.scale || 1;
  switch (f.type) {
    case 'gaussianBlur': return gaussianBlur(src, f.radius * s);
    case 'boxBlur': return boxBlur(src, f.radius * s);
    case 'motionBlur': return motionBlur(src, f.angle, f.distance * s);
    case 'radialBlur': return radialBlur(src, f.mode, f.amount, f.cx * ctx.docWidth * s - ctx.originX, f.cy * ctx.docHeight * s - ctx.originY);
    case 'surfaceBlur': return surfaceBlur(src, f.radius * s, f.threshold);
    case 'unsharpMask': return unsharpMask(src, f.amount, f.radius * s, f.threshold);
    case 'smartSharpen': return unsharpMask(f.reduceNoise > 0 ? bilateral(src, 1.5, 0.02 + f.reduceNoise / 400) : src, f.amount, f.radius * s, 0);
    case 'highPass': return highPass(src, f.radius * s);
    case 'addNoise': return addNoise(src, f.amount, f.gaussian, f.monochromatic, f.seed ?? 1, ctx.originX, ctx.originY);
    case 'reduceNoise': return (f.method === 'nlm' ? nonLocalMeans(src, 0.02 + f.strength / 100) : bilateral(src, 1 + f.strength / 5, 0.02 + (f.strength / 10) * (1 - f.preserveDetails / 100) * 0.15));
    case 'median': return median(src, f.radius * s);
    case 'dustAndScratches': return dustAndScratches(src, f.radius * s, f.threshold);
    case 'emboss': return emboss(src, f.angle, f.height * s, f.amount);
    case 'findEdges': return findEdges(src);
    case 'pixelate': return pixelate(src, f.cellSize * s, ctx.originX, ctx.originY);
    case 'oilPaint': return kuwahara(src, f.radius * s);
    case 'halftone': return halftone(src, f.cellSize * s, f.angle, ctx.originX, ctx.originY);
    case 'posterizeEdges': return posterizeEdges(src, f.edgeThickness, f.edgeIntensity, f.levels);
    case 'adjust': { const out = cloneRaster(src); applyAdjustmentRaster(out, compileAdjustment(f.adjustment), 1, null, ctx.linear); return out; }
  }
}
