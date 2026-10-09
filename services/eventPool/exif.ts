// exif — tiny, dependency-free readers for the two facts the photo pool needs from a camera file (when and where
// it was taken), plus lossless location scrubbing so a public pool never republishes someone's GPS.
//
//  JPEG   EXIF (APP1 "Exif\0\0" TIFF): DateTimeOriginal (+ OffsetTimeOriginal), GPS lat/lng, Orientation.
//         scrubJpegLocation zeroes the GPS IFD in place (keeps orientation + capture time) and drops XMP packets.
//  MP4/MOV  mvhd creation time, Android `©xyz` ISO-6709 location, Apple `mdta` keys (location + creationdate).
//         mp4LocationPatchOffsets lists box-type fields to rename to `free` — a 4-byte in-place patch per box that
//         players skip, so no offsets move and the video does not need re-muxing.
//
// Pure: works on Uint8Array and a random-access `readAt`, so it runs in the browser (File.slice) and in tests.
import type { LatLng } from './poolCore';

export interface JpegMeta {
  /** "YYYY:MM:DD HH:MM:SS" as written by the camera (wall clock). */
  dateTimeOriginal?: string;
  /** "+02:00" when the camera recorded it. */
  offsetTimeOriginal?: string;
  gps?: LatLng;
  orientation?: number;
  hasGps: boolean;
  hasXmp: boolean;
}

const ascii = (b: Uint8Array, o: number, n: number) => { let s = ''; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s; };
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const XMP_IDS = ['http://ns.adobe.com/xap/1.0/\0', 'http://ns.adobe.com/xmp/extension/\0'];

interface Segment { marker: number; start: number; end: number; dataStart: number }

/** JPEG marker segments up to (not including) the image data. */
function jpegSegments(b: Uint8Array): Segment[] {
  const out: Segment[] = [];
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return out;
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) break;
    const marker = b[o + 1];
    if (marker === 0xff) { o++; continue; } // fill byte
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS: metadata is over
    if (marker >= 0xd0 && marker <= 0xd7) { o += 2; continue; }
    const len = (b[o + 2] << 8) | b[o + 3];
    if (len < 2) break;
    out.push({ marker, start: o, end: Math.min(b.length, o + 2 + len), dataStart: o + 4 });
    o += 2 + len;
  }
  return out;
}

class Tiff {
  le: boolean;
  constructor(public b: Uint8Array, public base: number, public limit: number) { this.le = b[base] === 0x49; }
  ok(off: number, n: number) { return off >= 0 && this.base + off + n <= this.limit; }
  u16(off: number) { const p = this.base + off; return this.le ? this.b[p] | (this.b[p + 1] << 8) : (this.b[p] << 8) | this.b[p + 1]; }
  u32(off: number) { const p = this.base + off; return this.le ? (this.b[p] | (this.b[p + 1] << 8) | (this.b[p + 2] << 16)) + this.b[p + 3] * 0x1000000 : this.b[p] * 0x1000000 + ((this.b[p + 1] << 16) | (this.b[p + 2] << 8) | this.b[p + 3]); }
  /** Entries of the IFD at `off`: tag, type, count, absolute value offset (relative to TIFF base). */
  ifd(off: number): Array<{ tag: number; type: number; count: number; entryOff: number; valueOff: number; size: number }> {
    if (!this.ok(off, 2)) return [];
    const n = this.u16(off);
    if (n > 512 || !this.ok(off + 2, n * 12)) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      const tag = this.u16(e), type = this.u16(e + 2), count = this.u32(e + 4);
      const size = (TYPE_SIZE[type] || 1) * count;
      const valueOff = size <= 4 ? e + 8 : this.u32(e + 8);
      out.push({ tag, type, count, entryOff: e, valueOff, size });
    }
    return out;
  }
  str(valueOff: number, count: number) { return this.ok(valueOff, count) ? ascii(this.b, this.base + valueOff, count).replace(/\0[\s\S]*$/, '').trim() : ''; }
  rational(off: number) { if (!this.ok(off, 8)) return NaN; const d = this.u32(off + 4); return d ? this.u32(off) / d : NaN; }
}

function locateTiff(b: Uint8Array): Tiff | null {
  for (const s of jpegSegments(b)) {
    if (s.marker === 0xe1 && ascii(b, s.dataStart, 6) === 'Exif\0\0') {
      const base = s.dataStart + 6;
      const t = new Tiff(b, base, s.end);
      if (!t.ok(0, 8)) return null;
      const bom = ascii(b, base, 2);
      if ((bom !== 'II' && bom !== 'MM') || t.u16(2) !== 42) return null;
      return t;
    }
  }
  return null;
}

export function readJpegMeta(b: Uint8Array): JpegMeta {
  const out: JpegMeta = { hasGps: false, hasXmp: jpegSegments(b).some(s => s.marker === 0xe1 && XMP_IDS.some(id => ascii(b, s.dataStart, id.length) === id)) };
  const t = locateTiff(b);
  if (!t) return out;
  const ifd0 = t.ifd(t.u32(4));
  let exifOff = 0, gpsOff = 0, dateTime = '';
  for (const e of ifd0) {
    if (e.tag === 0x0112 && e.type === 3) out.orientation = t.u16(e.valueOff);
    else if (e.tag === 0x8769) exifOff = t.u32(e.entryOff + 8);
    else if (e.tag === 0x8825) gpsOff = t.u32(e.entryOff + 8);
    else if (e.tag === 0x0132 && e.type === 2) dateTime = t.str(e.valueOff, e.count);
  }
  if (exifOff) {
    let digitized = '';
    for (const e of t.ifd(exifOff)) {
      if (e.type !== 2) continue;
      if (e.tag === 0x9003) out.dateTimeOriginal = t.str(e.valueOff, e.count);
      else if (e.tag === 0x9004) digitized = t.str(e.valueOff, e.count);
      else if (e.tag === 0x9011) out.offsetTimeOriginal = t.str(e.valueOff, e.count);
    }
    if (!out.dateTimeOriginal) out.dateTimeOriginal = digitized || undefined;
  }
  if (!out.dateTimeOriginal && dateTime) out.dateTimeOriginal = dateTime;
  if (gpsOff) {
    const g = t.ifd(gpsOff);
    out.hasGps = g.length > 0;
    let latRef = '', lngRef = '', lat = NaN, lng = NaN;
    const dms = (off: number) => t.rational(off) + t.rational(off + 8) / 60 + t.rational(off + 16) / 3600;
    for (const e of g) {
      if (e.tag === 1) latRef = t.str(e.valueOff, e.count);
      else if (e.tag === 3) lngRef = t.str(e.valueOff, e.count);
      else if (e.tag === 2 && e.type === 5 && e.count >= 3) lat = dms(e.valueOff);
      else if (e.tag === 4 && e.type === 5 && e.count >= 3) lng = dms(e.valueOff);
    }
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      out.gps = { lat: latRef === 'S' ? -lat : lat, lng: lngRef === 'W' ? -lng : lng };
    }
  }
  return out;
}

/**
 * A copy of the JPEG with the GPS IFD emptied (its entries and out-of-line values zeroed, count set to 0) and XMP
 * packets removed. Orientation, capture time and the image data are untouched, so nothing is re-encoded.
 */
export function scrubJpegLocation(src: Uint8Array): { bytes: Uint8Array; changed: boolean } {
  const segs = jpegSegments(src);
  if (!segs.length) return { bytes: src, changed: false };
  const b = new Uint8Array(src); // copy
  let changed = false;
  const t = locateTiff(b);
  if (t) {
    for (const e of t.ifd(t.u32(4))) {
      if (e.tag !== 0x8825) continue;
      const gpsOff = t.u32(e.entryOff + 8);
      const entries = t.ifd(gpsOff);
      for (const g of entries) {
        if (g.size > 4 && t.ok(g.valueOff, g.size)) b.fill(0, t.base + g.valueOff, t.base + g.valueOff + g.size);
        b.fill(0, t.base + g.entryOff, t.base + g.entryOff + 12);
      }
      if (t.ok(gpsOff, 2)) { b[t.base + gpsOff] = 0; b[t.base + gpsOff + 1] = 0; }
      if (entries.length) changed = true;
    }
  }
  const drop = segs.filter(s => s.marker === 0xe1 && XMP_IDS.some(id => ascii(b, s.dataStart, id.length) === id));
  if (!drop.length) return { bytes: b, changed };
  const parts: Uint8Array[] = [];
  let at = 0;
  for (const s of drop) { parts.push(b.subarray(at, s.start)); at = s.end; }
  parts.push(b.subarray(at));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return { bytes: out, changed: true };
}

/** PNG `eXIf` or WebP `EXIF`/`XMP ` chunk present? (Those formats rarely carry GPS; when they do we re-encode.) */
export function hasEmbeddedMetadataChunk(b: Uint8Array): boolean {
  const sig = ascii(b, 0, 4);
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') {
    let o = 8;
    while (o + 8 <= b.length) {
      const len = ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
      const type = ascii(b, o + 4, 4);
      if (type === 'eXIf' || (type === 'iTXt' && ascii(b, o + 8, 17) === 'XML:com.adobe.xmp')) return true;
      if (type === 'IDAT' || type === 'IEND') return false;
      o += 12 + len;
    }
    return false;
  }
  if (sig === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    let o = 12;
    while (o + 8 <= b.length) {
      const type = ascii(b, o, 4);
      const len = b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24);
      if (type === 'EXIF' || type === 'XMP ') return true;
      o += 8 + len + (len & 1);
    }
  }
  return false;
}

// ── ISO-6709 ("+40.7128-074.0060+010.000/") ─────────────────────────────────

export function parseIso6709(s: string | undefined | null): LatLng | undefined {
  const m = /^\s*([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/.exec(String(s || ''));
  if (!m) return undefined;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return undefined;
  return { lat, lng };
}

// ── MP4 / QuickTime ─────────────────────────────────────────────────────────

export type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;
export interface Mp4Meta { createdAt?: number; gps?: LatLng; durationSec?: number; appleCreationDate?: string }

interface Box { type: string; start: number; headerSize: number; size: number }
const MAC_EPOCH_OFFSET_S = 2_082_844_800; // 1904-01-01 → 1970-01-01
const MAX_MOOV = 32 * 1024 * 1024;

const be32 = (b: Uint8Array, o: number) => b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]);
const be64 = (b: Uint8Array, o: number) => be32(b, o) * 0x100000000 + be32(b, o + 4);

/** Children of a box held in memory, starting at `from` (relative to `b`). */
function childBoxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = be32(b, o), headerSize = 8;
    const type = ascii(b, o + 4, 4);
    if (size === 1) { if (o + 16 > to) break; size = be64(b, o + 8); headerSize = 16; }
    else if (size === 0) size = to - o;
    if (size < headerSize || o + size > to) break;
    out.push({ type, start: o, headerSize, size });
    o += size;
  }
  return out;
}

/** Top-level boxes, reading only headers (the file may be hundreds of MB). */
async function topLevel(readAt: ReadAt, fileSize: number): Promise<Box[]> {
  const out: Box[] = [];
  let o = 0;
  for (let guard = 0; o + 8 <= fileSize && guard < 64; guard++) {
    const h = await readAt(o, 16);
    if (h.length < 8) break;
    let size = be32(h, 0), headerSize = 8;
    const type = ascii(h, 4, 4);
    if (size === 1) { size = be64(h, 8); headerSize = 16; } else if (size === 0) size = fileSize - o;
    if (size < headerSize || !/^[\x20-\x7e©]{4}$/.test(type)) break;
    out.push({ type, start: o, headerSize, size });
    o += size;
  }
  return out;
}

/** QuickTime `meta` has no version/flags; ISO `meta` is a FullBox (4 bytes) before its children. */
function metaChildStart(b: Uint8Array, box: Box): number {
  const p = box.start + box.headerSize;
  return ascii(b, p + 4, 4) === 'hdlr' ? p : p + 4;
}

function readAppleKeys(b: Uint8Array, meta: Box): { location?: string; creationdate?: string } {
  const kids = childBoxes(b, metaChildStart(b, meta), meta.start + meta.size);
  const keys = kids.find(k => k.type === 'keys');
  const ilst = kids.find(k => k.type === 'ilst');
  if (!keys || !ilst) return {};
  const names: string[] = [];
  let o = keys.start + keys.headerSize + 4;
  const count = be32(b, o); o += 4;
  for (let i = 0; i < count && o + 8 <= keys.start + keys.size; i++) {
    const sz = be32(b, o);
    if (sz < 8) break;
    names.push(ascii(b, o + 8, sz - 8));
    o += sz;
  }
  const out: { location?: string; creationdate?: string } = {};
  for (const item of childBoxes(b, ilst.start + ilst.headerSize, ilst.start + ilst.size)) {
    const idx = be32(b, item.start + 4) - 1;
    const name = names[idx];
    if (!name) continue;
    const data = childBoxes(b, item.start + item.headerSize, item.start + item.size).find(d => d.type === 'data');
    if (!data) continue;
    const value = ascii(b, data.start + 16, data.size - 16);
    if (name === 'com.apple.quicktime.location.ISO6709') out.location = value;
    else if (name === 'com.apple.quicktime.creationdate') out.creationdate = value;
  }
  return out;
}

async function loadMoov(readAt: ReadAt, fileSize: number): Promise<{ b: Uint8Array; moov: Box; fileOffset: number } | null> {
  const moov = (await topLevel(readAt, fileSize)).find(x => x.type === 'moov');
  if (!moov || moov.size > MAX_MOOV) return null;
  const raw = await readAt(moov.start, moov.size);
  if (raw.length < moov.size) return null;
  return { b: raw, moov: { ...moov, start: 0 }, fileOffset: moov.start };
}

export async function readMp4Meta(readAt: ReadAt, fileSize: number): Promise<Mp4Meta> {
  const out: Mp4Meta = {};
  const m = await loadMoov(readAt, fileSize).catch(() => null);
  if (!m) return out;
  const { b, moov } = m;
  const kids = childBoxes(b, moov.headerSize, moov.size);
  const mvhd = kids.find(k => k.type === 'mvhd');
  if (mvhd) {
    const p = mvhd.start + mvhd.headerSize;
    const v = b[p];
    const created = v === 1 ? be64(b, p + 4) : be32(b, p + 4);
    const timescale = v === 1 ? be32(b, p + 20) : be32(b, p + 12);
    const duration = v === 1 ? be64(b, p + 24) : be32(b, p + 16);
    if (created > MAC_EPOCH_OFFSET_S) out.createdAt = (created - MAC_EPOCH_OFFSET_S) * 1000;
    if (timescale > 0 && duration > 0) out.durationSec = Math.round((duration / timescale) * 10) / 10;
  }
  for (const k of kids) {
    if (k.type === 'udta') {
      for (const u of childBoxes(b, k.start + k.headerSize, k.start + k.size)) {
        if (u.type === '©xyz' || (b[u.start + 4] === 0xa9 && ascii(b, u.start + 5, 3) === 'xyz')) {
          const len = (b[u.start + 8] << 8) | b[u.start + 9];
          out.gps = out.gps || parseIso6709(ascii(b, u.start + 12, Math.min(len, u.size - 12)));
        }
      }
    } else if (k.type === 'meta') {
      const apple = readAppleKeys(b, k);
      if (apple.location) out.gps = parseIso6709(apple.location) || out.gps;
      if (apple.creationdate) out.appleCreationDate = apple.creationdate;
    }
  }
  // Apple's creationdate carries the local offset ("2026-10-24T18:30:05-0400"), which is better than mvhd.
  if (out.appleCreationDate) {
    const t = Date.parse(out.appleCreationDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (Number.isFinite(t)) out.createdAt = t;
  }
  return out;
}

/**
 * File offsets of the 4-byte type field of every `udta` / `meta` box under `moov` and its tracks. Writing `free`
 * there hides the location (and other capture metadata) from every player and parser without moving a byte.
 */
export async function mp4LocationPatchOffsets(readAt: ReadAt, fileSize: number): Promise<number[]> {
  const m = await loadMoov(readAt, fileSize).catch(() => null);
  if (!m) return [];
  const { b, moov, fileOffset } = m;
  const out: number[] = [];
  const walk = (from: number, to: number, depth: number) => {
    for (const k of childBoxes(b, from, to)) {
      if (k.type === 'udta' || k.type === 'meta') { out.push(fileOffset + k.start + 4); continue; }
      if (depth < 2 && k.type === 'trak') walk(k.start + k.headerSize, k.start + k.size, depth + 1);
    }
  };
  walk(moov.headerSize, moov.size, 0);
  return out;
}

export const FREE_BOX_TYPE = new Uint8Array([0x66, 0x72, 0x65, 0x65]); // "free"
