// Presentation Graphics (Blu-ray subtitles) → .sup stream.
// Each cue = one display set at its start (PCS epoch-start, WDS, PDS, ODS, END) and a clearing
// set at its end (PCS with no objects, WDS, END). Timestamps are 90 kHz.
import { BitReader, BitWriter, concat } from './bits';
import type { Indexed, PaletteEntry } from './palette';
import { rleDecode, rleEncode } from './rle';
import { FRAME_RATE_CODE } from './spec';

export const SEG = { PDS: 0x14, ODS: 0x15, PCS: 0x16, WDS: 0x17, ICS: 0x18, END: 0x80 } as const;
export const MAX_SEG = 0xffff;

export interface Cue { startSec: number; endSec: number; image: Indexed; x: number; y: number; forced?: boolean }

const ts = (sec: number) => Math.round(sec * 90000) % 2 ** 32;

/** One segment: [type u8][len u16][payload]. */
export function segment(type: number, payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_SEG) throw new Error(`segment too large (${payload.length})`);
  const w = new BitWriter().u8(type).u16(payload.length).raw(payload);
  return w.done();
}

/** SUP framing: "PG" + PTS + DTS before each segment. */
const sup = (ptsSec: number, dtsSec: number, seg: Uint8Array) => concat([new BitWriter().ascii('PG').u32(ts(ptsSec)).u32(ts(dtsSec)).done(), seg]);

export function pdsPayload(paletteId: number, version: number, entries: PaletteEntry[]): Uint8Array {
  const w = new BitWriter().u8(paletteId).u8(version);
  for (const e of entries) w.u8(e.id).u8(e.y).u8(e.cr).u8(e.cb).u8(e.t);
  return w.done();
}

/** ODS fragments for one bitmap (first carries data length + size). */
export function odsPayloads(objectId: number, version: number, img: { w: number; h: number; pixels: Uint8Array }): Uint8Array[] {
  const rle = rleEncode(img.pixels, img.w, img.h);
  const firstRoom = MAX_SEG - 4 - 3 - 4;
  const nextRoom = MAX_SEG - 4;
  const chunks: Uint8Array[] = [rle.subarray(0, firstRoom)];
  for (let o = firstRoom; o < rle.length; o += nextRoom) chunks.push(rle.subarray(o, o + nextRoom));
  return chunks.map((c, i) => {
    const first = i === 0, last = i === chunks.length - 1;
    const w = new BitWriter().u16(objectId).u8(version).u8((first ? 0x80 : 0) | (last ? 0x40 : 0));
    if (first) w.u24(rle.length + 4).u16(img.w).u16(img.h);
    return w.raw(c).done();
  });
}

export function buildSup(cues: Cue[], video: { w: number; h: number; fps: number }): Uint8Array {
  const parts: Uint8Array[] = [];
  let comp = 0;
  const sorted = [...cues].sort((a, b) => a.startSec - b.startSec);
  for (const c of sorted) {
    const t0 = c.startSec, dts = Math.max(0, t0 - 0.05);
    const win = { x: c.x, y: c.y, w: c.image.w, h: c.image.h };
    const pcs = new BitWriter().u16(video.w).u16(video.h).u8(FRAME_RATE_CODE(video.fps) << 4).u16(comp++ & 0xffff)
      .u8(0x80).u8(0x00).u8(0).u8(1)
      .u16(0).u8(0).u8(c.forced ? 0x40 : 0x00).u16(c.x).u16(c.y).done();
    const wds = new BitWriter().u8(1).u8(0).u16(win.x).u16(win.y).u16(win.w).u16(win.h).done();
    parts.push(sup(t0, dts, segment(SEG.PCS, pcs)), sup(t0, dts, segment(SEG.WDS, wds)), sup(t0, dts, segment(SEG.PDS, pdsPayload(0, 0, c.image.palette))));
    for (const o of odsPayloads(0, 0, c.image)) parts.push(sup(t0, dts, segment(SEG.ODS, o)));
    parts.push(sup(t0, dts, segment(SEG.END, new Uint8Array(0))));
    // Clear
    const t1 = c.endSec;
    const pcs2 = new BitWriter().u16(video.w).u16(video.h).u8(FRAME_RATE_CODE(video.fps) << 4).u16(comp++ & 0xffff).u8(0x00).u8(0x00).u8(0).u8(0).done();
    parts.push(sup(t1, t1, segment(SEG.PCS, pcs2)), sup(t1, t1, segment(SEG.WDS, wds)), sup(t1, t1, segment(SEG.END, new Uint8Array(0))));
  }
  return concat(parts);
}

// ── Parser (round-trip tests, importing .sup files users bring) ─────────────
export interface ParsedDisplaySet { ptsSec: number; objects: { x: number; y: number; forced: boolean }[]; bitmap?: { w: number; h: number; pixels: Uint8Array }; palette?: PaletteEntry[] }

export function parseSup(buf: Uint8Array): ParsedDisplaySet[] {
  const r = new BitReader(buf);
  const sets: ParsedDisplaySet[] = [];
  let cur: ParsedDisplaySet | null = null;
  let odsBuf: number[] = []; let odsW = 0, odsH = 0;
  while (r.byte + 13 <= buf.length) {
    if (r.ascii(2) !== 'PG') throw new Error('bad SUP magic');
    const pts = r.u32(); r.u32();
    const type = r.u8(); const len = r.u16(); const start = r.byte;
    if (type === SEG.PCS) {
      r.u16(); r.u16(); r.u8(); r.u16(); r.u8(); r.u8(); r.u8();
      const n = r.u8(); const objects = [];
      for (let i = 0; i < n; i++) { r.u16(); r.u8(); const f = r.u8(); const x = r.u16(); const y = r.u16(); if (f & 0x80) r.skip(64); objects.push({ x, y, forced: !!(f & 0x40) }); }
      cur = { ptsSec: pts / 90000, objects };
    } else if (type === SEG.PDS && cur) {
      r.u8(); r.u8(); const pal: PaletteEntry[] = [];
      while (r.byte < start + len) pal.push({ id: r.u8(), y: r.u8(), cr: r.u8(), cb: r.u8(), t: r.u8() });
      cur.palette = pal;
    } else if (type === SEG.ODS && cur) {
      r.u16(); r.u8(); const flags = r.u8();
      if (flags & 0x80) { r.u24(); odsW = r.u16(); odsH = r.u16(); odsBuf = []; }
      while (r.byte < start + len) odsBuf.push(r.u8());
      if (flags & 0x40) cur.bitmap = { w: odsW, h: odsH, pixels: rleDecode(Uint8Array.from(odsBuf), odsW, odsH) };
    } else if (type === SEG.END && cur) { sets.push(cur); cur = null; }
    r.seekByte(start + len);
  }
  return sets;
}

// ── SRT ─────────────────────────────────────────────────────────────────────
export interface SrtCue { startSec: number; endSec: number; text: string }
export function parseSrt(text: string): SrtCue[] {
  const t = (s: string) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0; };
  return text.replace(/\r/g, '').split(/\n\n+/).map(block => {
    const lines = block.trim().split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->');
    return { startSec: t(a), endSec: t(b), text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '') };
  }).filter((c): c is SrtCue => !!c && c.endSec > c.startSec);
}
