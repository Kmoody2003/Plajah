// Plush from your own drawing: trace the silhouette of a drawing or photo. The image becomes a
// grey-level field (dark = inside, or light = inside when inverted), lightly blurred to close a
// scratchy line (the rest of the smoothing is done on the traced outline, so thin pen lines survive), optionally mirrored about its centre for symmetric characters, and the level
// set at the threshold is walked with marching squares (geometry.contour). The longest loop is the
// outer silhouette, so a closed pen outline works as well as a filled shape; eyes and other inner
// marks are ignored. Pure functions: the room feeds them canvas pixels, the tests synthetic ones.

import { type Pt, contour, area, bbox } from './geometry';

export interface Gray { w: number; h: number; data: Float32Array }
export interface TraceOptions {
  /** 0..255; pixels darker than this are inside (lighter, when inverted). */
  threshold: number;
  /** Smoothing 0..8: a light pixel blur (at most 2 px) plus a moving average along the outline. */
  smooth?: number;
  /** Light figure on a dark background. */
  invert?: boolean;
  /** Keep one half of the figure and mirror it across the vertical axis through its centre. */
  mirror?: 'off' | 'left' | 'right';
}

/** Canvas RGBA → luminance 0..255 (transparent pixels count as white paper). */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const a = rgba[i * 4 + 3] / 255; const l = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]; data[i] = l * a + 255 * (1 - a); }
  return { w, h, data };
}

/** Separable box blur, run twice (close to a Gaussian). */
export function blur(g: Gray, r: number): Gray {
  r = Math.round(r); if (r < 1) return g;
  const { w, h } = g; let src = g.data; const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * r + 1); s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { out[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    src = out.slice();
  }
  return { w, h, data: src };
}

/** Otsu's threshold: the grey level that best separates figure from paper. */
export function otsu(g: Gray): number {
  const hist = new Float64Array(256); for (const v of g.data) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const n = g.data.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; t = i + 0.5; } }
  return t;
}

/**
 * Trace the outer silhouette. Returns a CCW ring in pixel units with y up (row 0 is the top of the
 * image), or [] when nothing crosses the threshold.
 */
export function traceSilhouette(g0: Gray, o: TraceOptions): Pt[] {
  const sm = Math.max(0, o.smooth ?? 0); const g = blur(g0, Math.min(2, sm)); const { w, h, data } = g; const T = o.threshold; const sgn = o.invert ? -1 : 1;
  // Signed field, negative inside; outside the image is paper.
  const at = (x: number, y: number) => { if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const v = (data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx) * (1 - fy) + (data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx) * fy;
    return sgn * (v - T); };
  let axis = (w - 1) / 2;
  if (o.mirror && o.mirror !== 'off') {
    // Mirror about the centre of the figure's bounding box, not the image.
    let x0 = Infinity, x1 = -Infinity; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (sgn * (data[y * w + x] - T) < 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (x1 >= x0) axis = (x0 + x1) / 2;
  }
  const keepLeft = o.mirror === 'left', mirrored = !!o.mirror && o.mirror !== 'off';
  const field = (x: number, yUp: number) => { const y = h - 1 - yUp; let xs = x; if (mirrored) { if (keepLeft && x > axis) xs = 2 * axis - x; if (!keepLeft && x < axis) xs = 2 * axis - x; } return at(xs, y); };
  const cell = Math.max(1, Math.max(w, h) / 420);
  const ring = contour(field, -2, -2, w + 1, h + 1, cell);
  if (ring.length < 6 || area(ring) < 4) return [];
  return sm > 2 ? smoothRing(ring, Math.round((sm - 2) * 2)) : ring;
}

/** Moving average along a closed ring (window ±k points, two passes). */
export function smoothRing(r: Pt[], k: number): Pt[] {
  if (k < 1 || r.length < 2 * k + 3) return r; let cur = r;
  for (let pass = 0; pass < 2; pass++) { const n = cur.length; const nx: Pt[] = [];
    for (let i = 0; i < n; i++) { let sx = 0, sy = 0; for (let j = -k; j <= k; j++) { const q = cur[(i + j + n) % n]; sx += q[0]; sy += q[1]; } nx.push([sx / (2 * k + 1), sy / (2 * k + 1)]); }
    cur = nx; }
  return cur;
}

/** How much of the picture the silhouette covers, for a sanity hint (a frame around the photo traces as everything). */
export function coverage(ring: Pt[], g: Gray) { if (!ring.length) return 0; const b = bbox(ring); return (b.w * b.h) / (g.w * g.h); }
