// raster/codecs — export encoders with real colour tagging.
//
//  • ICC v2 display profiles generated from primaries (sRGB, Display-P3): header, desc,
//    cprt, wtpt, r/g/bXYZ (Bradford-adapted to D50) and a shared 1024-entry TRC.
//  • PNG writer (8- and 16-bit, own chunking): sRGB + gAMA + cHRM for sRGB documents
//    (the PNG spec's canonical sRGB tag) or iCCP for Display-P3; pHYs for DPI.
//  • JPEG / WebP: the browser encoder produces the bitstream (quality option), then we
//    inject the ICC profile (JPEG APP2 ICC_PROFILE, WebP VP8X + ICCP chunk).
//  • Minimal PNG reader (8-bit, non-interlaced) for node tests and round trips.
// Deflate/inflate: CompressionStream in browsers/workers, node:zlib in node.

import type { Bitmap8, RasterF } from './buffer';
import { linearToSrgb } from './buffer';

// ── zlib ────────────────────────────────────────────────────────────────────
async function viaStream(data: Uint8Array, kind: 'compress' | 'decompress'): Promise<Uint8Array> {
  const S = kind === 'compress' ? (globalThis as any).CompressionStream : (globalThis as any).DecompressionStream;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new S('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function nodeZlib(): Promise<any> { return import(/* @vite-ignore */ 'node:' + 'zlib'); }
export async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof process !== 'undefined' && process.versions?.node) { const z = await nodeZlib(); return new Uint8Array(z.deflateSync(data, { level: 6 })); }
  return viaStream(data, 'compress');
}
export async function zlibInflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof process !== 'undefined' && process.versions?.node) { const z = await nodeZlib(); return new Uint8Array(z.inflateSync(data)); }
  return viaStream(data, 'decompress');
}

// ── ICC profile generation ──────────────────────────────────────────────────
export type ProfileName = 'srgb' | 'display-p3';
const COLORANTS: Record<ProfileName, number[][]> = {
  srgb: [[0.4360747, 0.2225045, 0.0139322], [0.3850649, 0.7168786, 0.0971045], [0.1430804, 0.0606169, 0.7141733]],
  'display-p3': [[0.5151, 0.2412, -0.00105], [0.2920, 0.6922, 0.04188], [0.1571, 0.06658, 0.7844]],
};
const DESC: Record<ProfileName, string> = { srgb: 'sRGB IEC61966-2.1 (Plajah)', 'display-p3': 'Display P3 (Plajah)' };
const profileCache = new Map<ProfileName, Uint8Array>();
export function iccProfile(name: ProfileName): Uint8Array {
  const hit = profileCache.get(name); if (hit) return hit;
  const s15 = (v: number) => { const x = Math.round(v * 65536); return [(x >> 24) & 255, (x >> 16) & 255, (x >> 8) & 255, x & 255]; };
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const ascii = (s: string) => [...s].map(c => c.charCodeAt(0));
  const xyz = (v: number[]) => [...ascii('XYZ '), 0, 0, 0, 0, ...s15(v[0]), ...s15(v[1]), ...s15(v[2])];
  const descTag = () => { const t = ascii(DESC[name]); return [...ascii('desc'), 0, 0, 0, 0, ...u32(t.length + 1), ...t, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...new Array(67).fill(0)]; };
  const textTag = (s: string) => [...ascii('text'), 0, 0, 0, 0, ...ascii(s), 0];
  const N = 1024, curv = [...ascii('curv'), 0, 0, 0, 0, ...u32(N)];
  for (let i = 0; i < N; i++) { const x = i / (N - 1), v = Math.round((x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)) * 65535); curv.push(v >> 8, v & 255); }
  const col = COLORANTS[name];
  const tags: [string, number[]][] = [['desc', descTag()], ['cprt', textTag('No copyright, use freely')], ['wtpt', xyz([0.9642, 1, 0.8249])], ['rXYZ', xyz(col[0])], ['gXYZ', xyz(col[1])], ['bXYZ', xyz(col[2])], ['rTRC', curv]];
  const table: number[] = [], data: number[] = []; const base = 128 + 4 + (tags.length + 2) * 12;
  const pad = (a: number[]) => { while (a.length % 4) a.push(0); };
  const offsets: Record<string, [number, number]> = {};
  for (const [sig, bytes] of tags) { offsets[sig] = [base + data.length, bytes.length]; data.push(...bytes); pad(data); }
  for (const sig of ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC']) { const [o, l] = offsets[sig === 'gTRC' || sig === 'bTRC' ? 'rTRC' : sig]; table.push(...ascii(sig), ...u32(o), ...u32(l)); }
  const size = 128 + 4 + table.length + data.length;
  const hdr = [...u32(size), 0, 0, 0, 0, 2, 0x10, 0, 0, ...ascii('mntr'), ...ascii('RGB '), ...ascii('XYZ '), 0x07, 0xea, 0, 10, 0, 10, 0, 0, 0, 0, 0, 0, ...ascii('acsp'), ...new Array(24).fill(0), 0, 0, 0, 0, ...s15(0.9642), ...s15(1), ...s15(0.8249), ...new Array(48).fill(0)];
  while (hdr.length < 128) hdr.push(0);
  const out = Uint8Array.from([...hdr.slice(0, 128), ...u32(tags.length + 2), ...table, ...data]);
  profileCache.set(name, out); return out;
}

// ── PNG ─────────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
function crc32(parts: Uint8Array[]): number { let c = 0xffffffff; for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type), out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8); dv.setUint32(8 + data.length, crc32([t, data])); return out;
}
export interface PngOptions { colorSpace?: ProfileName; dpi?: number; /** 16-bit from a float raster */ bits?: 8 | 16 }
function filterRows(raw: Uint8Array, rowBytes: number, rows: number, bpp: number): Uint8Array {
  const out = new Uint8Array((rowBytes + 1) * rows);
  for (let y = 0; y < rows; y++) {
    const o = y * (rowBytes + 1), r = y * rowBytes; out[o] = 4; // Paeth
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? raw[r + x - bpp] : 0, b = y ? raw[r - rowBytes + x] : 0, c = x >= bpp && y ? raw[r - rowBytes + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      out[o + 1 + x] = (raw[r + x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
  }
  return out;
}
async function pngFrom(width: number, height: number, raw: Uint8Array, bits: 8 | 16, o: PngOptions): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, width); dv.setUint32(4, height); ihdr[8] = bits; ihdr[9] = 6;
  const parts: Uint8Array[] = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if ((o.colorSpace ?? 'srgb') === 'srgb') {
    parts.push(chunk('sRGB', Uint8Array.of(0)));
    const g = new Uint8Array(4); new DataView(g.buffer).setUint32(0, 45455); parts.push(chunk('gAMA', g));
    const ch = new Uint8Array(32), cv = new DataView(ch.buffer); [31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000].forEach((v, i) => cv.setUint32(i * 4, v)); parts.push(chunk('cHRM', ch));
  } else {
    const prof = await zlibDeflate(iccProfile(o.colorSpace!)), name = new TextEncoder().encode('Display P3');
    const d = new Uint8Array(name.length + 2 + prof.length); d.set(name); d[name.length] = 0; d[name.length + 1] = 0; d.set(prof, name.length + 2); parts.push(chunk('iCCP', d));
  }
  if (o.dpi) { const p = new Uint8Array(9), pv = new DataView(p.buffer), ppm = Math.round(o.dpi / 0.0254); pv.setUint32(0, ppm); pv.setUint32(4, ppm); p[8] = 1; parts.push(chunk('pHYs', p)); }
  const bpp = bits === 16 ? 8 : 4;
  parts.push(chunk('IDAT', await zlibDeflate(filterRows(raw, width * bpp, height, bpp))), chunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(total); let off = 0; for (const p of parts) { out.set(p, off); off += p.length; } return out;
}
/** 8-bit RGBA PNG (straight alpha) with colour tagging. */
export function encodePng(bm: Bitmap8, o: PngOptions = {}): Promise<Uint8Array> { return pngFrom(bm.width, bm.height, new Uint8Array(bm.data.buffer, bm.data.byteOffset, bm.data.length), 8, o); }
/** 16-bit RGBA PNG from a premultiplied float raster (16-bit working documents). */
export function encodePng16(r: RasterF, o: PngOptions & { linear?: boolean } = {}): Promise<Uint8Array> {
  const raw = new Uint8Array(r.width * r.height * 8);
  for (let p = 0; p < r.width * r.height; p++) {
    const a = Math.min(1, Math.max(0, r.data[p * 4 + 3]));
    for (let c = 0; c < 4; c++) {
      let v = c === 3 ? a : a > 0 ? Math.min(1, Math.max(0, r.data[p * 4 + c] / a)) : 0; if (c < 3 && o.linear) v = linearToSrgb(v);
      const q = Math.round(v * 65535); raw[p * 8 + c * 2] = q >> 8; raw[p * 8 + c * 2 + 1] = q & 255;
    }
  }
  return pngFrom(r.width, r.height, raw, 16, o);
}
/** Minimal PNG decoder: 8-bit, colour types 0/2/4/6, non-interlaced → straight RGBA. */
export async function decodePng(bytes: Uint8Array): Promise<Bitmap8 & { chunks: string[] }> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let off = 8, W = 0, H = 0, ct = 0, depth = 8; const idat: Uint8Array[] = [], chunks: string[] = [];
  while (off < bytes.length) {
    const len = dv.getUint32(off), type = String.fromCharCode(...bytes.subarray(off + 4, off + 8)), data = bytes.subarray(off + 8, off + 8 + len); chunks.push(type);
    if (type === 'IHDR') { W = dv.getUint32(off + 8); H = dv.getUint32(off + 12); depth = data[8]; ct = data[9]; if (data[12]) throw new Error('interlaced PNG unsupported'); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNG decode is supported');
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1, stride = W * ch;
  const all = new Uint8Array(idat.reduce((a, d) => a + d.length, 0)); let o2 = 0; for (const d of idat) { all.set(d, o2); o2 += d.length; }
  const raw = await zlibInflate(all), px = new Uint8Array(stride * H);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), r = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[r + x - ch] : 0, b = y ? px[r - stride + x] : 0, c = x >= ch && y ? px[r - stride + x - ch] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      px[r + x] = (src[x] + pred) & 255;
    }
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) { const s = p * ch; if (ch >= 3) { out[p * 4] = px[s]; out[p * 4 + 1] = px[s + 1]; out[p * 4 + 2] = px[s + 2]; out[p * 4 + 3] = ch === 4 ? px[s + 3] : 255; } else { out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = px[s]; out[p * 4 + 3] = ch === 2 ? px[s + 1] : 255; } }
  return { width: W, height: H, data: out, chunks };
}

// ── JPEG / WebP ICC injection ───────────────────────────────────────────────
export function injectJpegIcc(jpeg: Uint8Array, profile: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  let at = 2; if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]); // after JFIF APP0
  const sig = new TextEncoder().encode('ICC_PROFILE\0'), len = 2 + sig.length + 2 + profile.length;
  if (len > 65535) throw new Error('ICC profile too large for one APP2 segment');
  const seg = new Uint8Array(2 + len); seg[0] = 0xff; seg[1] = 0xe2; seg[2] = len >> 8; seg[3] = len & 255; seg.set(sig, 4); seg[4 + sig.length] = 1; seg[5 + sig.length] = 1; seg.set(profile, 6 + sig.length);
  const out = new Uint8Array(jpeg.length + seg.length); out.set(jpeg.subarray(0, at)); out.set(seg, at); out.set(jpeg.subarray(at), at + seg.length); return out;
}
export function injectWebpIcc(webp: Uint8Array, profile: Uint8Array, width: number, height: number, hasAlpha: boolean): Uint8Array {
  const tag = (o: number) => String.fromCharCode(...webp.subarray(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('not a WebP');
  const le32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const pad = (b: number[]) => (b.length % 2 ? [...b, 0] : b);
  const iccp = pad([...'ICCP'].map(c => c.charCodeAt(0)).concat(le32(profile.length), Array.from(profile)));
  let body: number[];
  if (tag(12) === 'VP8X') {
    const vp8x = Array.from(webp.subarray(12, 30)); vp8x[8] |= 0x20; body = [...vp8x, ...iccp, ...Array.from(webp.subarray(30))];
  } else {
    const flags = 0x20 | (hasAlpha ? 0x10 : 0), w = width - 1, h = height - 1;
    const vp8x = [...'VP8X'].map(c => c.charCodeAt(0)).concat(le32(10), [flags, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255]);
    body = [...vp8x, ...iccp, ...Array.from(webp.subarray(12))];
  }
  return Uint8Array.from([...'RIFF'].map(c => c.charCodeAt(0)).concat(le32(body.length + 4), [...'WEBP'].map(c => c.charCodeAt(0)), body));
}

export { injectJxlIcc, extractJxlIcc, isJxlBytes, parseJxlHeader } from '../../jxlCodec';
import { injectJxlIcc, isJxlBytes } from '../../jxlCodec';

// ── Browser export entry points ─────────────────────────────────────────────
export interface ExportOptions { format: 'png' | 'jpeg' | 'webp' | 'jxl'; quality?: number; colorSpace?: ProfileName; dpi?: number; background?: [number, number, number] }
/** Encode a flattened bitmap to a tagged Blob (browser / worker with OffscreenCanvas). */
export async function encodeBitmap(bm: Bitmap8, o: ExportOptions): Promise<Blob> {
  const cs = o.colorSpace ?? 'srgb';
  if (o.format === 'png') return new Blob([await encodePng(bm, { colorSpace: cs, dpi: o.dpi }) as BlobPart], { type: 'image/png' });
  let src = bm;
  if (o.format === 'jpeg') { // JPEG has no alpha: matte onto the background
    const bg = o.background ?? [255, 255, 255]; src = { width: bm.width, height: bm.height, data: new Uint8ClampedArray(bm.data) };
    for (let i = 0; i < src.data.length; i += 4) { const a = src.data[i + 3] / 255; for (let c = 0; c < 3; c++) src.data[i + c] = Math.round(src.data[i + c] * a + bg[c] * (1 - a)); src.data[i + 3] = 255; }
  }
  const canvas = new OffscreenCanvas(bm.width, bm.height), ctx = canvas.getContext('2d', { colorSpace: cs === 'display-p3' ? 'display-p3' : 'srgb' } as any) as OffscreenCanvasRenderingContext2D;
  ctx.putImageData(new ImageData(src.data as any, bm.width, bm.height, { colorSpace: cs === 'display-p3' ? 'display-p3' : 'srgb' } as any), 0, 0);
  const requestedMime = `image/${o.format}`;
  let blob = await canvas.convertToBlob({ type: requestedMime, quality: o.quality ?? (o.format === 'jxl' ? 0.85 : 0.92) });
  // If the browser's OffscreenCanvas didn't natively encode image/jxl (browsers fall back to image/png),
  // fall back to image/webp so previews/exports stay compact instead of ballooning to lossless PNG.
  if (o.format === 'jxl' && blob.type !== 'image/jxl') {
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: o.quality ?? 0.92 });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer()), prof = iccProfile(cs);
  if (isJxlBytes(bytes)) {
    const tagged = injectJxlIcc(bytes, prof);
    return new Blob([tagged as BlobPart], { type: 'image/jxl' });
  }
  const tagged = o.format === 'jpeg' ? injectJpegIcc(bytes, prof) : injectWebpIcc(bytes, prof, bm.width, bm.height, true);
  return new Blob([tagged as BlobPart], { type: blob.type || requestedMime });
}

