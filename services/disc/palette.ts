// RGBA bitmap → ≤256-entry Blu-ray palette (Y, Cr, Cb, T) in BT.709, index 0 = transparent.

export interface PaletteEntry { id: number; y: number; cr: number; cb: number; t: number }
export interface Indexed { w: number; h: number; pixels: Uint8Array; palette: PaletteEntry[]; rgba: [number, number, number, number][] }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Studio-range BT.709 (graphics planes on HD and UHD discs are 709). */
export function rgbToYCrCb(r: number, g: number, b: number) {
  const y = 16 + (0.2126 * r + 0.7152 * g + 0.0722 * b) * (219 / 255);
  const cb = 128 + (-0.1146 * r - 0.3854 * g + 0.5 * b) * (224 / 255);
  const cr = 128 + (0.5 * r - 0.4542 * g - 0.0458 * b) * (224 / 255);
  return { y: clamp(y, 16, 235), cr: clamp(cr, 16, 240), cb: clamp(cb, 16, 240) };
}

export function yCrCbToRgb(y: number, cr: number, cb: number) {
  const Y = (y - 16) * (255 / 219), Cb = (cb - 128) * (255 / 224), Cr = (cr - 128) * (255 / 224);
  return { r: clamp(Y + 1.5748 * Cr, 0, 255), g: clamp(Y - 0.1873 * Cb - 0.4681 * Cr, 0, 255), b: clamp(Y + 1.8556 * Cb, 0, 255) };
}

/**
 * Quantize: transparent pixels → 0; the rest bucketed at 5 bits/channel (4 for alpha), the most
 * used buckets become palette entries (bucket mean colour), every pixel maps to the nearest.
 * Menu art is flat colour + anti-aliased text, which this keeps clean.
 */
export function quantize(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, maxColors = 255): Indexed {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number; a: number }>();
  const key = (i: number) => ((rgba[i] >> 3) << 15) | ((rgba[i + 1] >> 3) << 10) | ((rgba[i + 2] >> 3) << 5) | (rgba[i + 3] >> 4) | 0;
  for (let i = 0; i < w * h * 4; i += 4) {
    if (rgba[i + 3] < 8) continue;
    const k = key(i) * 16 + (rgba[i + 3] >> 4);
    const e = buckets.get(k);
    if (e) { e.n++; e.r += rgba[i]; e.g += rgba[i + 1]; e.b += rgba[i + 2]; e.a += rgba[i + 3]; }
    else buckets.set(k, { n: 1, r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: rgba[i + 3] });
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, Math.min(255, maxColors));
  const cols: [number, number, number, number][] = [[0, 0, 0, 0], ...top.map(e => [e.r / e.n, e.g / e.n, e.b / e.n, e.a / e.n].map(Math.round) as [number, number, number, number])];
  const cache = new Map<number, number>();
  const pixels = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    if (rgba[i + 3] < 8) { pixels[p] = 0; continue; }
    const packed = ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | rgba[i + 3]) >>> 0;
    let best = cache.get(packed);
    if (best === undefined) {
      let bd = Infinity; best = 1;
      for (let c = 1; c < cols.length; c++) {
        const [r, g, b, a] = cols[c];
        const d = (r - rgba[i]) ** 2 * 2 + (g - rgba[i + 1]) ** 2 * 4 + (b - rgba[i + 2]) ** 2 + (a - rgba[i + 3]) ** 2 * 3;
        if (d < bd) { bd = d; best = c; }
      }
      cache.set(packed, best);
    }
    pixels[p] = best;
  }
  const palette: PaletteEntry[] = cols.map(([r, g, b, a], id) => ({ id, ...rgbToYCrCb(r, g, b), t: id === 0 ? 0 : a }));
  return { w, h, pixels, palette, rgba: cols };
}
