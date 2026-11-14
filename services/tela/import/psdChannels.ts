// import/psdChannels — turns a PSD's raw planar channels into 8-bit RGBA.
//
// ag-psd reads the document structure but throws on CMYK and Lab, and decoding every layer at
// once costs gigabytes on the print templates people actually have. So the importer reads with
// useRawData and decodes here, one layer at a time: RGB, CMYK, Lab, grayscale, indexed, and bitmap,
// at 1 / 8 / 16 / 32 bits, for RLE and zip channels.
import { unzlibSync } from 'fflate';
import { cmykToLinear } from '../raster/color';
import type { RgbaImage } from './types';

export interface RawChannel { id: number; compression: number; data?: Uint8Array }
export interface RawLayerData { colorMode: number; bitsPerChannel: number; channels: RawChannel[]; large: boolean }

const CM = { bitmap: 0, gray: 1, indexed: 2, rgb: 3, cmyk: 4, multichannel: 7, duotone: 8, lab: 9 };
export const COLOR_MODE_NAMES: Record<number, string> = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };

const packedRowBytes = (w: number, bits: number) => bits === 1 ? (w + 7) >> 3 : w * (bits >> 3);

function unpackBits(src: Uint8Array, pos: number, end: number, out: Uint8Array, outPos: number, outEnd: number) {
  while (pos < end && outPos < outEnd) {
    const n = src[pos++];
    if (n < 128) { const c = Math.min(n + 1, outEnd - outPos, end - pos); out.set(src.subarray(pos, pos + c), outPos); pos += n + 1; outPos += c; }
    else if (n > 128) { const c = Math.min(257 - n, outEnd - outPos); out.fill(src[pos++], outPos, outPos + c); outPos += c; }
  }
}

/** One channel's samples as big-endian bytes, row by row. */
function inflateChannel(ch: RawChannel, w: number, h: number, bits: number, large: boolean): Uint8Array {
  const rb = packedRowBytes(w, bits), size = rb * h, data = ch.data;
  if (!data) return new Uint8Array(size);
  if (ch.compression === 0) return data.length >= size ? data.subarray(0, size) : (() => { const o = new Uint8Array(size); o.set(data); return o; })();
  if (ch.compression === 1) {
    const out = new Uint8Array(size), hdr = large ? 4 : 2, view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = h * hdr;
    for (let y = 0; y < h; y++) {
      const len = large ? view.getUint32(y * 4) : view.getUint16(y * 2);
      unpackBits(data, pos, Math.min(pos + len, data.length), out, y * rb, (y + 1) * rb); pos += len;
    }
    return out;
  }
  const raw = unzlibSync(data);
  if (ch.compression === 2) return raw;
  // zip with prediction: per-row deltas, 32-bit floats are also byte-planar
  if (bits === 16) { for (let y = 0; y < h; y++) { const o = y * rb; for (let x = 1; x < w; x++) { const i = o + x * 2; const v = ((raw[i] << 8 | raw[i + 1]) + (raw[i - 2] << 8 | raw[i - 1])) & 0xffff; raw[i] = v >> 8; raw[i + 1] = v & 255; } } return raw; }
  if (bits === 32) {
    const out = new Uint8Array(size);
    for (let y = 0; y < h; y++) {
      const o = y * rb; for (let i = 1; i < rb; i++) raw[o + i] = (raw[o + i] + raw[o + i - 1]) & 255;
      for (let x = 0; x < w; x++) { out[o + x * 4] = raw[o + x]; out[o + x * 4 + 1] = raw[o + w + x]; out[o + x * 4 + 2] = raw[o + w * 2 + x]; out[o + x * 4 + 3] = raw[o + w * 3 + x]; }
    }
    return out;
  }
  for (let y = 0; y < h; y++) { const o = y * rb; for (let x = 1; x < rb; x++) raw[o + x] = (raw[o + x] + raw[o + x - 1]) & 255; }
  return raw;
}

/** Linear 32-bit HDR values to display-referred 8-bit (Photoshop's default gamma view). */
const float8 = (v: number) => v <= 0 ? 0 : v >= 1 ? 255 : Math.round(Math.pow(v, 1 / 2.2) * 255);

/** A channel reduced to 8 bits per sample. */
export function channel8(ch: RawChannel | undefined, w: number, h: number, bits: number, large: boolean, fill = 255): Uint8Array {
  const n = w * h;
  if (!ch || !ch.data) return new Uint8Array(n).fill(fill);
  const raw = inflateChannel(ch, w, h, bits, large);
  if (bits === 8) return raw;
  const out = new Uint8Array(n);
  if (bits === 16) for (let i = 0; i < n; i++) out[i] = raw[i * 2];
  else if (bits === 32) { const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength); for (let i = 0; i < n; i++) out[i] = float8(v.getFloat32(i * 4)); }
  else if (bits === 1) { const rb = (w + 7) >> 3; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (raw[y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 0 : 255; }
  return out;
}

// ── CMYK → sRGB ───────────────────────────────────────────────────────────────────────
// A 17-grid 4D table over the printer model in raster/color (ICC-less, approximates SWOP coated).
// Building it once and interpolating keeps a poster-sized CMYK layer to a fraction of a second.
const G = 17; let cmykLut: Float32Array | null = null;
const encode = (v: number) => { const x = v <= 0 ? 0 : v >= 1 ? 1 : v; return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
function buildCmykLut() {
  const lut = new Float32Array(G * G * G * G * 3); const o = [0, 0, 0]; let i = 0;
  for (let k = 0; k < G; k++) for (let y = 0; y < G; y++) for (let m = 0; m < G; m++) for (let c = 0; c < G; c++) {
    cmykToLinear(c / (G - 1), m / (G - 1), y / (G - 1), k / (G - 1), o);
    lut[i++] = encode(o[0]) * 255; lut[i++] = encode(o[1]) * 255; lut[i++] = encode(o[2]) * 255;
  }
  return lut;
}
/** c, m, y, k in 0..255 ink. */
export function cmykToRgb8(c: number, m: number, y: number, k: number, out: number[]) {
  const lut = cmykLut || (cmykLut = buildCmykLut()), s = (G - 1) / 255;
  const fc = c * s, fm = m * s, fy = y * s, fk = k * s;
  const ic = Math.min(G - 2, fc | 0), im = Math.min(G - 2, fm | 0), iy = Math.min(G - 2, fy | 0), ik = Math.min(G - 2, fk | 0);
  const tc = fc - ic, tm = fm - im, ty = fy - iy, tk = fk - ik;
  let r = 0, g = 0, b = 0;
  for (let bits = 0; bits < 16; bits++) {
    const w = (bits & 1 ? tc : 1 - tc) * (bits & 2 ? tm : 1 - tm) * (bits & 4 ? ty : 1 - ty) * (bits & 8 ? tk : 1 - tk);
    if (w === 0) continue;
    const idx = ((ik + (bits >> 3 & 1)) * G * G * G + (iy + (bits >> 2 & 1)) * G * G + (im + (bits >> 1 & 1)) * G + ic + (bits & 1)) * 3;
    r += lut[idx] * w; g += lut[idx + 1] * w; b += lut[idx + 2] * w;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

function labToRgb8(L: number, a: number, b: number, out: number[]) {
  const fy = (L * 100 / 255 + 16) / 116, fx = fy + (a - 128) / 500, fz = fy - (b - 128) / 200;
  const inv = (t: number) => t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29);
  const X = 0.9642 * inv(fx), Y = inv(fy), Z = 0.8249 * inv(fz);
  const lr = 3.1339 * X - 1.6170 * Y - 0.4906 * Z, lg = -0.9785 * X + 1.9160 * Y + 0.0333 * Z, lb = 0.0720 * X - 0.2290 * Y + 1.4057 * Z;
  out[0] = encode(lr) * 255; out[1] = encode(lg) * 255; out[2] = encode(lb) * 255;
}

export interface DecodeContext { palette?: { r: number; g: number; b: number }[] }

/** Planar channels by id (0.., -1 alpha) → straight RGBA8. */
export function planesToRgba(get: (id: number, fill: number) => Uint8Array, w: number, h: number, mode: number, ctx: DecodeContext, hasAlpha = true): RgbaImage {
  const n = w * h, out = new Uint8ClampedArray(n * 4), a = hasAlpha ? get(-1, 255) : null, t = [0, 0, 0];
  if (mode === CM.rgb) {
    const r = get(0, 0), g = get(1, 0), b = get(2, 0);
    for (let i = 0; i < n; i++) { const o = i * 4; out[o] = r[i]; out[o + 1] = g[i]; out[o + 2] = b[i]; out[o + 3] = a ? a[i] : 255; }
  } else if (mode === CM.cmyk) {
    // Photoshop stores CMYK inverted: 255 means no ink.
    const c = get(0, 255), m = get(1, 255), y = get(2, 255), k = get(3, 255);
    let pc = -1, pm = -1, py = -1, pk = -1;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (c[i] !== pc || m[i] !== pm || y[i] !== py || k[i] !== pk) { pc = c[i]; pm = m[i]; py = y[i]; pk = k[i]; cmykToRgb8(255 - pc, 255 - pm, 255 - py, 255 - pk, t); }
      out[o] = t[0]; out[o + 1] = t[1]; out[o + 2] = t[2]; out[o + 3] = a ? a[i] : 255;
    }
  } else if (mode === CM.lab) {
    const L = get(0, 255), A = get(1, 128), B = get(2, 128);
    for (let i = 0; i < n; i++) { const o = i * 4; labToRgb8(L[i], A[i], B[i], t); out[o] = t[0]; out[o + 1] = t[1]; out[o + 2] = t[2]; out[o + 3] = a ? a[i] : 255; }
  } else if (mode === CM.indexed && ctx.palette) {
    const p = get(0, 0), pal = ctx.palette;
    for (let i = 0; i < n; i++) { const o = i * 4, c = pal[p[i]] || { r: 0, g: 0, b: 0 }; out[o] = c.r; out[o + 1] = c.g; out[o + 2] = c.b; out[o + 3] = a ? a[i] : 255; }
  } else {
    const g = get(0, 255);
    for (let i = 0; i < n; i++) { const o = i * 4; out[o] = out[o + 1] = out[o + 2] = g[i]; out[o + 3] = a ? a[i] : 255; }
  }
  return { width: w, height: h, data: out };
}

export function decodeLayerPixels(raw: RawLayerData, w: number, h: number, ctx: DecodeContext): RgbaImage {
  const byId = new Map(raw.channels.map(c => [c.id, c]));
  const get = (id: number, fill: number) => channel8(byId.get(id), w, h, raw.bitsPerChannel, raw.large, fill);
  return planesToRgba(get, w, h, raw.colorMode, ctx, byId.has(-1));
}

/** A layer's user mask as gray-on-opaque RGBA, ready for an SVG luminance mask. */
export function decodeLayerMask(raw: RawLayerData, w: number, h: number): RgbaImage | null {
  const ch = raw.channels.find(c => c.id === -2); if (!ch?.data) return null;
  const m = channel8(ch, w, h, raw.bitsPerChannel, raw.large, 0), out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < m.length; i++) { const o = i * 4; out[o] = out[o + 1] = out[o + 2] = m[i]; out[o + 3] = 255; }
  return { width: w, height: h, data: out };
}

/** The flattened composite Photoshop saved: compression word, then all planes. */
export function decodeComposite(bytes: Uint8Array, w: number, h: number, channels: number, bits: number, mode: number, large: boolean, ctx: DecodeContext): RgbaImage | null {
  if (bytes.length < 2) return null;
  const compression = bytes[0] << 8 | bytes[1], body = bytes.subarray(2), rb = packedRowBytes(w, bits);
  const plane = (i: number): Uint8Array | null => {
    if (i >= channels) return null;
    if (compression === 0) return body.subarray(rb * h * i, rb * h * (i + 1));
    if (compression !== 1) return null;
    const hdr = large ? 4 : 2, view = new DataView(body.buffer, body.byteOffset, body.byteLength); let pos = channels * h * hdr;
    const out = new Uint8Array(rb * h);
    for (let ch = 0; ch < channels; ch++) for (let y = 0; y < h; y++) {
      const idx = (ch * h + y) * hdr, len = large ? view.getUint32(idx) : view.getUint16(idx);
      if (ch === i) unpackBits(body, pos, pos + len, out, y * rb, (y + 1) * rb);
      pos += len;
    }
    return out;
  };
  const colorCount = mode === CM.cmyk ? 4 : mode === CM.rgb || mode === CM.lab ? 3 : 1;
  const get = (id: number, fill: number) => {
    const p = plane(id < 0 ? colorCount : id); if (!p) return new Uint8Array(w * h).fill(fill);
    if (bits === 8) return p;
    return channel8({ id, compression: 0, data: p }, w, h, bits, large, fill);
  };
  return planesToRgba(get, w, h, mode, ctx, channels > colorCount);
}
