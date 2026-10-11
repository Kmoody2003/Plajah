// raster/cpuBackend — the reference implementation of the compositor primitives on plain
// Float32 premultiplied buffers. Runs in node (tests), workers and the browser fallback.
// Bit-exactness target for the GPU backend (modulo RGBA16F precision and LUT baking).

import type { Backend, CompositeView, CompositeOp } from './compositeCore';
import { compositeDocument } from './compositeCore';
import type { Adjustment, Affine, BlendMode, FillContent, Filter, RasterDocument, RGB } from './model';
import { affineInvert } from './model';
import { createRaster, cloneRaster, srgbToLinear, rasterToBitmap, SRGB8_TO_LINEAR, type Bitmap8, type Mask8, type RasterF } from './buffer';
import { compositePixel, blendRGB } from './blend';
import { compileAdjustment, applyAdjustmentRaster } from './adjust';
import { applyFilter } from './filters';
import { renderGradientRaster, fillGradientEndpoints } from './gradient';
import { signedDistance } from './distance';

/** Synchronous pixel access the compositor reads assets through (preloaded by assets.ts). */
export interface AssetSource {
  bitmap(key: string): Bitmap8 | null;
  mask(key: string): Mask8 | null;
}
export class MapAssetSource implements AssetSource {
  bitmaps = new Map<string, Bitmap8>(); masks = new Map<string, Mask8>();
  bitmap(k: string) { return this.bitmaps.get(k) || null; }
  mask(k: string) { return this.masks.get(k) || null; }
}

// ── Mip pyramid (premultiplied 8-bit, box filtered) for minified sampling ───
const mipCache = new WeakMap<object, { linear: boolean; levels: Bitmap8[] }>();
function mips(b: Bitmap8, linear: boolean): Bitmap8[] {
  const hit = mipCache.get(b); if (hit && hit.linear === linear) return hit.levels;
  const levels: Bitmap8[] = [b]; let cur = b; let premulCur: Float32Array | null = null;
  while (cur.width > 1 || cur.height > 1) {
    const W = Math.max(1, cur.width >> 1), H = Math.max(1, cur.height >> 1), next = new Float32Array(W * H * 4);
    const src = premulCur || premul(cur, linear);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let a0 = 0, a1 = 0, a2 = 0, a3 = 0, n = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sx = Math.min(cur.width - 1, x * 2 + i), sy = Math.min(cur.height - 1, y * 2 + j), k = (sy * cur.width + sx) * 4;
        a0 += src[k]; a1 += src[k + 1]; a2 += src[k + 2]; a3 += src[k + 3]; n++;
      }
      const k = (y * W + x) * 4; next[k] = a0 / n; next[k + 1] = a1 / n; next[k + 2] = a2 / n; next[k + 3] = a3 / n;
    }
    premulCur = next;
    // store as a pseudo-bitmap holding premultiplied floats (tagged)
    const lvl = { width: W, height: H, data: next as unknown as Uint8ClampedArray, premul: true } as Bitmap8 & { premul: true };
    levels.push(lvl); cur = lvl;
    if (levels.length > 16) break;
  }
  mipCache.set(b, { linear, levels }); return levels;
}
function premul(b: Bitmap8, linear: boolean): Float32Array {
  if ((b as any).premul) return b.data as unknown as Float32Array;
  const out = new Float32Array(b.width * b.height * 4), s = b.data;
  for (let i = 0; i < s.length; i += 4) { const a = s[i + 3] / 255; out[i] = (linear ? SRGB8_TO_LINEAR[s[i]] : s[i] / 255) * a; out[i + 1] = (linear ? SRGB8_TO_LINEAR[s[i + 1]] : s[i + 1] / 255) * a; out[i + 2] = (linear ? SRGB8_TO_LINEAR[s[i + 2]] : s[i + 2] / 255) * a; out[i + 3] = a; }
  return out;
}
/** Bilinear premultiplied sample of one mip level (pixel centres at +0.5; transparent outside). */
function sampleLevel(b: Bitmap8, x: number, y: number, linear: boolean, out: number[], wgt: number): void {
  const isP = !!(b as any).premul, d = b.data as unknown as ArrayLike<number>, W = b.width, H = b.height;
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j; if (yy < 0 || yy >= H) continue; const wy = j ? ty : 1 - ty;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i; if (xx < 0 || xx >= W) continue; const w = wy * (i ? tx : 1 - tx) * wgt; if (!w) continue;
      const k = (yy * W + xx) * 4;
      if (isP) { out[0] += d[k] * w; out[1] += d[k + 1] * w; out[2] += d[k + 2] * w; out[3] += d[k + 3] * w; }
      else {
        const a = d[k + 3] / 255; if (!a) continue; const wa = w * a;
        out[0] += (linear ? SRGB8_TO_LINEAR[d[k]] : d[k] / 255) * wa; out[1] += (linear ? SRGB8_TO_LINEAR[d[k + 1]] : d[k + 1] / 255) * wa; out[2] += (linear ? SRGB8_TO_LINEAR[d[k + 2]] : d[k + 2] / 255) * wa; out[3] += wa;
      }
    }
  }
}

export class CpuBackend implements Backend<RasterF> {
  view!: CompositeView; doc!: RasterDocument; linear = false;
  constructor(public assets: AssetSource) {}
  begin(view: CompositeView, doc: RasterDocument) { this.view = view; this.doc = doc; this.linear = doc.blendSpace === 'linear'; }
  end() {}
  alloc() { return createRaster(this.view.width, this.view.height); }
  release() {}
  clear(s: RasterF, c?: [number, number, number, number]) { if (!c) s.data.fill(0); else for (let i = 0; i < s.data.length; i += 4) { s.data[i] = c[0] * c[3]; s.data[i + 1] = c[1] * c[3]; s.data[i + 2] = c[2] * c[3]; s.data[i + 3] = c[3]; } }
  copy(dst: RasterF, src: RasterF) { dst.data.set(src.data); }
  private outToDoc(): Affine { const v = this.view; return [1 / v.scale, 0, 0, 1 / v.scale, v.x, v.y]; }

  drawBitmap(dst: RasterF, key: string, m: Affine, kind: 'rgba' | 'mask', outside = 0): boolean {
    const v = this.view, W = v.width, H = v.height, d = dst.data;
    const inv = affineInvert(m), o2d = this.outToDoc();
    // out px → bitmap px: inv ∘ o2d
    const a = inv[0] * o2d[0], b = inv[1] * o2d[0], c = inv[2] * o2d[3], dd = inv[3] * o2d[3];
    const e = inv[0] * o2d[4] + inv[2] * o2d[5] + inv[4], f = inv[1] * o2d[4] + inv[3] * o2d[5] + inv[5];
    if (kind === 'mask') {
      const mk = this.assets.mask(key); if (!mk) return false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const px = a * (x + 0.5) + c * (y + 0.5) + e, py = b * (x + 0.5) + dd * (y + 0.5) + f;
        const val = sampleMask(mk, px, py, outside), k = (y * W + x) * 4; d[k] = d[k + 1] = d[k + 2] = d[k + 3] = val;
      }
      return true;
    }
    const bm = this.assets.bitmap(key); if (!bm) return false;
    const foot = Math.sqrt(Math.abs(a * dd - b * c)); // bitmap px per output px
    const lod = foot > 1 ? Math.log2(foot) : 0;
    const levels = lod > 0 ? mips(bm, this.linear) : [bm];
    const l0 = Math.min(levels.length - 1, Math.floor(lod)), l1 = Math.min(levels.length - 1, l0 + 1), t = Math.min(1, lod - l0);
    const s = [0, 0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = a * (x + 0.5) + c * (y + 0.5) + e, py = b * (x + 0.5) + dd * (y + 0.5) + f;
      if (px < -1 || py < -1 || px > bm.width + 1 || py > bm.height + 1) continue;
      s[0] = s[1] = s[2] = s[3] = 0;
      const L0 = levels[l0], k0 = bm.width / L0.width, k0y = bm.height / L0.height;
      sampleLevel(L0, px / k0, py / k0y, this.linear, s, l1 !== l0 ? 1 - t : 1);
      if (l1 !== l0 && t > 0) { const L1 = levels[l1]; sampleLevel(L1, px / (bm.width / L1.width), py / (bm.height / L1.height), this.linear, s, t); }
      const k = (y * W + x) * 4; d[k] = s[0]; d[k + 1] = s[1]; d[k + 2] = s[2]; d[k + 3] = s[3];
    }
    return true;
  }

  fill(dst: RasterF, fill: FillContent) {
    const v = this.view, lin = this.linear;
    if (fill.type === 'solid') { const c = fill.color.map(x => lin ? srgbToLinear(x / 255) : x / 255); this.clear(dst, [c[0], c[1], c[2], 1]); return; }
    if (fill.type === 'gradient') {
      const ep = fillGradientEndpoints(this.doc.width, this.doc.height, fill.shape, fill.angle, fill.scale, fill.offsetX, fill.offsetY);
      const s = v.scale; const g = renderGradientRaster(v.width, v.height, fill.gradient, { shape: fill.shape, x0: ep.x0 * s, y0: ep.y0 * s, x1: ep.x1 * s, y1: ep.y1 * s, reverse: fill.reverse, dither: fill.dither, originX: v.x * s, originY: v.y * s });
      if (lin) for (let i = 0; i < g.data.length; i += 4) { const a = g.data[i + 3]; if (a > 0) for (let c = 0; c < 3; c++) g.data[i + c] = srgbToLinear(g.data[i + c] / a) * a; }
      dst.data.set(g.data); return;
    }
    const pat = this.assets.bitmap(fill.assetId); if (!pat) { dst.data.fill(0); return; }
    const sc = fill.scale || 1, ang = (fill.angle || 0) * Math.PI / 180, cs = Math.cos(ang), sn = Math.sin(ang), d = dst.data;
    for (let y = 0; y < v.height; y++) for (let x = 0; x < v.width; x++) {
      const X = v.x + (x + 0.5) / v.scale - (fill.offsetX || 0), Y = v.y + (y + 0.5) / v.scale - (fill.offsetY || 0);
      const u = (X * cs + Y * sn) / sc, w = (-X * sn + Y * cs) / sc;
      const px = ((Math.floor(u) % pat.width) + pat.width) % pat.width, py = ((Math.floor(w) % pat.height) + pat.height) % pat.height, k = (py * pat.width + px) * 4, a = pat.data[k + 3] / 255, o = (y * v.width + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = (lin ? SRGB8_TO_LINEAR[pat.data[k + c]] : pat.data[k + c] / 255) * a; d[o + 3] = a;
    }
  }
  uploadCoverage(dst: RasterF, cov: Float32Array) { for (let p = 0; p < cov.length; p++) { const k = p * 4; dst.data[k] = dst.data[k + 1] = dst.data[k + 2] = dst.data[k + 3] = cov[p]; } }
  multiply(dst: RasterF, mask: RasterF, density: number, invert: boolean) {
    const d = dst.data, m = mask.data;
    for (let i = 0; i < d.length; i += 4) { let v = m[i + 3]; if (invert) v = 1 - v; v = 1 - density * (1 - v); d[i] *= v; d[i + 1] *= v; d[i + 2] *= v; d[i + 3] *= v; }
  }
  private cov(mask: RasterF | null): Float32Array | null { if (!mask) return null; const c = new Float32Array(mask.width * mask.height); for (let p = 0; p < c.length; p++) c[p] = mask.data[p * 4 + 3]; return c; }
  composite(dst: RasterF, src: RasterF, mode: BlendMode, opacity: number, mask: RasterF | null, op: CompositeOp) {
    const W = dst.width, d = dst.data, s = src.data, ox = Math.floor(this.view.x * this.view.scale), oy = Math.floor(this.view.y * this.view.scale);
    if (op === 'keep') {
      const tb = [0, 0, 0], ts = [0, 0, 0], tr = [0, 0, 0];
      for (let p = 0, i = 0; i < d.length; p++, i += 4) {
        const ab = d[i + 3], as = s[i + 3]; if (ab <= 0 || as <= 0) continue;
        const k = opacity * (mask ? mask.data[i + 3] : 1) * Math.min(1, as / ab); if (k <= 0) continue;
        for (let c = 0; c < 3; c++) { tb[c] = Math.min(1, d[i + c] / ab); ts[c] = Math.min(1, s[i + c] / as); }
        blendRGB(mode, tb, ts, tr);
        for (let c = 0; c < 3; c++) d[i + c] = (tb[c] + (tr[c] - tb[c]) * k) * ab;
      }
      return;
    }
    for (let y = 0; y < dst.height; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 4; const a = mask ? opacity * mask.data[i + 3] : opacity;
      if (a > 0) compositePixel(mode, d, i, s, i, a, op === 'atop', x + ox, y + oy);
    }
  }
  lerp(dst: RasterF, other: RasterF, opacity: number, mask: RasterF | null) {
    const d = dst.data, o = other.data;
    for (let i = 0; i < d.length; i += 4) { const k = opacity * (mask ? mask.data[i + 3] : 1); if (k <= 0) continue; for (let c = 0; c < 4; c++) d[i + c] += (o[i + c] - d[i + c]) * k; }
  }
  adjust(dst: RasterF, adj: Adjustment, opacity: number, mask: RasterF | null) { applyAdjustmentRaster(dst, compileAdjustment(adj), opacity, this.cov(mask), this.linear); }
  filter(dst: RasterF, src: RasterF, f: Filter) {
    const v = this.view; const r = applyFilter(src, f, { originX: v.x * v.scale, originY: v.y * v.scale, docWidth: this.doc.width, docHeight: this.doc.height, scale: v.scale, linear: this.linear });
    dst.data.set(r.data);
  }
  tint(dst: RasterF, src: RasterF, color: RGB, invertAlpha: boolean) {
    const c = color.map(x => this.linear ? srgbToLinear(x / 255) : x / 255), d = dst.data, s = src.data;
    for (let i = 0; i < d.length; i += 4) { const a = invertAlpha ? 1 - s[i + 3] : s[i + 3]; d[i] = c[0] * a; d[i + 1] = c[1] * a; d[i + 2] = c[2] * a; d[i + 3] = a; }
  }
  translate(dst: RasterF, src: RasterF, dx: number, dy: number) {
    const W = src.width, H = src.height, d = dst.data, s = src.data; d.fill(0);
    const ix = Math.floor(dx), iy = Math.floor(dy), fx = dx - ix, fy = dy - iy;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sx = x - ix - i, sy = y - iy - j; if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy); if (!w) continue; const q = (sy * W + sx) * 4;
        d[k] += s[q] * w; d[k + 1] += s[q + 1] * w; d[k + 2] += s[q + 2] * w; d[k + 3] += s[q + 3] * w;
      }
    }
  }
  alphaGain(dst: RasterF, gain: number) {
    const d = dst.data;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (a <= 0) continue; const na = Math.min(1, a * gain), k = na / a; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; d[i + 3] = na; }
  }
  stroke(dst: RasterF, src: RasterF, size: number, position: 'outside' | 'inside' | 'center', color: RGB) {
    const W = src.width, H = src.height, s = src.data, sd = signedDistance(W, H, i => s[i * 4 + 3]);
    const c = color.map(x => this.linear ? srgbToLinear(x / 255) : x / 255), d = dst.data;
    const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    for (let p = 0; p < W * H; p++) {
      const a = s[p * 4 + 3], dist = sd[p];
      const cov = position === 'outside' ? cl(size + 0.5 - dist) * (1 - a) : position === 'inside' ? cl(size + 0.5 + dist) * a : cl(size / 2 + 0.5 - Math.abs(dist));
      const k = p * 4; d[k] = c[0] * cov; d[k + 1] = c[1] * cov; d[k + 2] = c[2] * cov; d[k + 3] = cov;
    }
  }
  readback(s: RasterF) { return cloneRaster(s); }
}
function sampleMask(m: Mask8, x: number, y: number, outside: number): number {
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; let acc = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = x0 + i, yy = y0 + j, w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty);
    acc += w * (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height ? outside : m.data[yy * m.width + xx] / 255);
  }
  return acc;
}

// ── Convenience entry points ────────────────────────────────────────────────
export interface CpuRenderOptions { view?: Partial<CompositeView>; skip?: Set<string>; dither?: boolean }
/** Render a document region on the CPU → premultiplied float raster in doc blend space. */
export function renderDocumentCpu(doc: RasterDocument, assets: AssetSource, opts: CpuRenderOptions = {}): RasterF {
  const view: CompositeView = { x: 0, y: 0, scale: 1, width: doc.width, height: doc.height, ...opts.view };
  const be = new CpuBackend(assets);
  return compositeDocument(doc, be, view, { skip: opts.skip });
}
/** Flatten to an 8-bit straight bitmap (sRGB-encoded), tiled so 8k documents stay bounded. */
export function flattenCpu(doc: RasterDocument, assets: AssetSource, opts: { tile?: number; dither?: boolean; scale?: number } = {}): Bitmap8 {
  const scale = opts.scale ?? 1, W = Math.round(doc.width * scale), H = Math.round(doc.height * scale), T = opts.tile ?? 1024;
  const out: Bitmap8 = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  const apron = stackApronSafe(doc, scale);
  for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
    const tw = Math.min(T, W - tx), th = Math.min(T, H - ty);
    const view: CompositeView = { x: (tx - apron) / scale, y: (ty - apron) / scale, scale, width: tw + apron * 2, height: th + apron * 2 };
    const r = renderDocumentCpu(doc, assets, { view });
    const bm = rasterToBitmap(r, doc.blendSpace === 'linear', opts.dither);
    for (let y = 0; y < th; y++) out.data.set(bm.data.subarray(((y + apron) * view.width + apron) * 4, ((y + apron) * view.width + apron + tw) * 4), ((ty + y) * W + tx) * 4);
  }
  return out;
}
import { stackApron } from './compositeCore';
const stackApronSafe = (doc: RasterDocument, scale: number) => stackApron(doc, scale);
