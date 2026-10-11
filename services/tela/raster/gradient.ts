// raster/gradient — multi-stop gradients with opacity + midpoints, five shapes and TPDF
// dithering. One implementation serves the gradient tool, gradient fill layers, gradient
// maps and procedural masks.

import type { GradientShape, GradientSpec, GradientStop } from './model';
import { createBitmap, createRaster, hash01, type Bitmap8, type RasterF } from './buffer';
import { srgbToLinear, linearToSrgb } from './buffer';
import { srgbToOklab, oklabToSrgb } from './colorMath';

const sorted = (stops: GradientStop[]) => [...stops].sort((a, b) => a.offset - b.offset);

/** Straight RGBA (0..1, sRGB-encoded) at t ∈ [0,1]. */
export function sampleGradient(spec: GradientSpec, t: number, out: number[] = [0, 0, 0, 1]): number[] {
  const stops = sorted(spec.stops);
  if (!stops.length) { out[0] = out[1] = out[2] = 0; out[3] = 1; return out; }
  t = Math.min(1, Math.max(0, t));
  if (t <= stops[0].offset || stops.length === 1) return setStop(stops[0], out);
  const last = stops[stops.length - 1]; if (t >= last.offset) return setStop(last, out);
  let i = 0; while (i < stops.length - 2 && t > stops[i + 1].offset) i++;
  const a = stops[i], b = stops[i + 1], span = b.offset - a.offset;
  let u = span > 1e-9 ? (t - a.offset) / span : 1;
  const m = a.midpoint ?? 0.5; if (m > 0.001 && m < 0.999 && Math.abs(m - 0.5) > 1e-6) u = Math.pow(u, Math.log(0.5) / Math.log(m));
  const space = spec.interpolation || 'srgb';
  const A = a.color.map(v => v / 255), B = b.color.map(v => v / 255);
  if (space === 'linear') for (let c = 0; c < 3; c++) out[c] = linearToSrgb(srgbToLinear(A[c]) * (1 - u) + srgbToLinear(B[c]) * u);
  else if (space === 'oklab') { const la = srgbToOklab(A[0], A[1], A[2]), lb = srgbToOklab(B[0], B[1], B[2]); oklabToSrgb(la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u, la[2] + (lb[2] - la[2]) * u, out); }
  else for (let c = 0; c < 3; c++) out[c] = A[c] * (1 - u) + B[c] * u;
  out[3] = (a.opacity ?? 1) * (1 - u) + (b.opacity ?? 1) * u;
  return out;
}
function setStop(s: GradientStop, out: number[]) { out[0] = s.color[0] / 255; out[1] = s.color[1] / 255; out[2] = s.color[2] / 255; out[3] = s.opacity ?? 1; return out; }

/** n-entry straight RGBA LUT (for gradient maps and the GPU 1D texture). */
export function gradientLut(spec: GradientSpec, n = 1024, reverse = false): Float32Array {
  const lut = new Float32Array(n * 4), px = [0, 0, 0, 1];
  for (let i = 0; i < n; i++) { sampleGradient(spec, reverse ? 1 - i / (n - 1) : i / (n - 1), px); lut.set(px, i * 4); }
  return lut;
}

/** Gradient parameter t for a shape given start p0 → end p1 (tool semantics). */
export function gradientT(shape: GradientShape, x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1, len = Math.sqrt(len2);
  const px = x - x0, py = y - y0;
  switch (shape) {
    case 'linear': return (px * dx + py * dy) / len2;
    case 'reflected': return Math.abs((px * dx + py * dy) / len2);
    case 'radial': return Math.sqrt(px * px + py * py) / len;
    case 'angle': { let a = Math.atan2(py, px) - Math.atan2(dy, dx); a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return 1 - a / (2 * Math.PI); }
    case 'diamond': { const u = (px * dx + py * dy) / len, v = (-px * dy + py * dx) / len; return (Math.abs(u) + Math.abs(v)) / len; }
  }
}

export interface GradientRenderOptions {
  shape: GradientShape; x0: number; y0: number; x1: number; y1: number;
  reverse?: boolean; dither?: boolean; seed?: number;
  /** Document position of pixel (0,0) of the output (tiles). */
  originX?: number; originY?: number;
}
/** Render into a straight 8-bit bitmap (gradient tool). Dither = TPDF ±1 LSB, stable per doc pixel. */
export function renderGradientBitmap(width: number, height: number, spec: GradientSpec, o: GradientRenderOptions): Bitmap8 {
  const out = createBitmap(width, height), lut = gradientLut(spec, 4096, o.reverse), d = out.data;
  const ox = o.originX || 0, oy = o.originY || 0, seed = o.seed ?? 7;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = Math.min(1, Math.max(0, gradientT(o.shape, x + 0.5 + ox, y + 0.5 + oy, o.x0, o.y0, o.x1, o.y1)));
    const li = Math.round(t * 4095) * 4, k = (y * width + x) * 4;
    const n = o.dither ? hash01(x + ox, y + oy, seed) - hash01(x + ox, y + oy, seed + 1) : 0;
    for (let c = 0; c < 4; c++) d[k + c] = Math.round(lut[li + c] * 255 + n);
  }
  return out;
}
/** Premultiplied float render for the compositor (fill layers). */
export function renderGradientRaster(width: number, height: number, spec: GradientSpec, o: GradientRenderOptions): RasterF {
  const out = createRaster(width, height), lut = gradientLut(spec, 4096, o.reverse), d = out.data;
  const ox = o.originX || 0, oy = o.originY || 0, seed = o.seed ?? 7;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = Math.min(1, Math.max(0, gradientT(o.shape, x + 0.5 + ox, y + 0.5 + oy, o.x0, o.y0, o.x1, o.y1)));
    const li = Math.round(t * 4095) * 4, k = (y * width + x) * 4;
    const n = o.dither ? (hash01(x + ox, y + oy, seed) - hash01(x + ox, y + oy, seed + 1)) / 255 : 0;
    const a = lut[li + 3];
    d[k] = (lut[li] + n) * a; d[k + 1] = (lut[li + 1] + n) * a; d[k + 2] = (lut[li + 2] + n) * a; d[k + 3] = a;
  }
  return out;
}

/** Endpoints of a gradient FILL layer (angle/scale/offset) across a document. */
export function fillGradientEndpoints(docW: number, docH: number, shape: GradientShape, angleDeg: number, scale: number, offX = 0, offY = 0) {
  const r = angleDeg * Math.PI / 180, dx = Math.cos(r), dy = -Math.sin(r); // Photoshop angle: CCW, y up
  const half = ((Math.abs(docW * dx) + Math.abs(docH * dy)) / 2) * (scale || 1);
  const cx = docW / 2 + offX, cy = docH / 2 + offY;
  if (shape === 'linear') return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
  return { x0: cx, y0: cy, x1: cx + dx * half, y1: cy + dy * half };
}
