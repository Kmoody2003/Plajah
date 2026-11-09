// BDMV navigation files: index.bdmv, MovieObject.bdmv, PLAYLIST/xxxxx.mpls.
// Versions: "0200" for Blu-ray, "0300" for Ultra HD Blu-ray.
import { BitReader, BitWriter } from './bits';
import { decode as decodeInsn, encode as encodeInsn, type Insn } from './hdmv';
import { FRAME_RATE_CODE, type AudioCodec, type DiscFormat, type Dynamic } from './spec';

/** Clips start their presentation clock here (45 kHz units) — the muxer uses the same base. */
export const CLIP_PTS_BASE_45K = 27000; // 0.6 s
export const PID = { VIDEO: 0x1011, AUDIO0: 0x1100, PG0: 0x1200, IG0: 0x1400 } as const;

const ver = (f: DiscFormat) => (f === 'UHD' ? '0300' : '0200');

export const VIDEO_FORMAT_CODE = (h: number, scan: 'p' | 'i') =>
  h === 2160 ? 8 : h === 1080 ? (scan === 'i' ? 4 : 6) : h === 720 ? 5 : h === 576 ? (scan === 'i' ? 2 : 7) : (scan === 'i' ? 1 : 3);
export const VIDEO_CODING = { mpeg2: 0x02, h264: 0x1b, hevc: 0x24 } as const;
export const AUDIO_CODING: Record<AudioCodec, number> = { lpcm: 0x80, ac3: 0x81, dts: 0x82, truehd: 0x83, eac3: 0x84, dtshd: 0x86 };
export const PG_CODING = 0x90, IG_CODING = 0x91;
const DYN_CODE: Record<Dynamic, number> = { SDR709: 0, SDR2020: 0, HDR10: 1, DOLBY_VISION: 2, HDR10PLUS: 3 };

// ── index.bdmv ──────────────────────────────────────────────────────────────
export interface IndexObj { kind: 'HDMV'; movie: boolean; objectId: number }
export interface IndexIn { format: DiscFormat; video: { h: number; scan: 'p' | 'i'; fps: number }; firstPlay: IndexObj; topMenu: IndexObj; titles: (IndexObj & { interactive?: boolean })[] }

const hdmvObj = (w: BitWriter, o: IndexObj) => w.bits(o.movie ? 0 : 1, 2).zero(14).u16(o.objectId).u32(0);

export function writeIndex(i: IndexIn): Uint8Array {
  const w = new BitWriter().ascii('INDX').ascii(ver(i.format));
  w.u32(78).u32(0).zero(24 * 8);
  // AppInfoBDMV
  w.u32(34).zero(1).bits(0, 1).bits(0, 1).zero(5)
    .bits(VIDEO_FORMAT_CODE(i.video.h, i.video.scan), 4).bits(FRAME_RATE_CODE(i.video.fps), 4).zero(32 * 8);
  // Indexes
  const body = new BitWriter();
  body.bits(1, 2).zero(30); hdmvObj(body, i.firstPlay);
  body.bits(1, 2).zero(30); hdmvObj(body, i.topMenu);
  body.u16(i.titles.length);
  for (const t of i.titles) { body.bits(1, 2).bits(0, 2).zero(28); hdmvObj(body, t); }
  const b = body.done();
  w.u32(b.length).raw(b);
  return w.done();
}

export function parseIndex(buf: Uint8Array) {
  const r = new BitReader(buf);
  const magic = r.ascii(4), version = r.ascii(4); const idx = r.u32();
  r.seekByte(idx); r.u32();
  const obj = () => { const movie = r.bits(2) === 0; r.skip(14); const objectId = r.u16(); r.u32(); return { movie, objectId }; };
  r.bits(2); r.skip(30); const firstPlay = obj();
  r.bits(2); r.skip(30); const topMenu = obj();
  const n = r.u16(); const titles = [];
  for (let k = 0; k < n; k++) { r.bits(2); r.bits(2); r.skip(28); titles.push(obj()); }
  return { magic, version, firstPlay, topMenu, titles };
}

// ── MovieObject.bdmv ────────────────────────────────────────────────────────
export interface MovieObjectIn { resume?: boolean; menuCallMask?: boolean; titleSearchMask?: boolean; commands: Insn[] }

export function writeMovieObjects(format: DiscFormat, objs: MovieObjectIn[]): Uint8Array {
  const body = new BitWriter().u32(0).u16(objs.length);
  for (const o of objs) {
    body.bits(o.resume ? 1 : 0, 1).bits(o.menuCallMask ? 1 : 0, 1).bits(o.titleSearchMask ? 1 : 0, 1).zero(13).u16(o.commands.length);
    for (const c of o.commands) body.raw(encodeInsn(c));
  }
  const b = body.done();
  return new BitWriter().ascii('MOBJ').ascii(ver(format)).u32(0).zero(28 * 8).u32(b.length).raw(b).done();
}

export function parseMovieObjects(buf: Uint8Array) {
  const r = new BitReader(buf, 40);
  r.u32(); r.u32(); const n = r.u16(); const objs = [];
  for (let k = 0; k < n; k++) {
    const resume = !!r.bits(1); const menuCallMask = !!r.bits(1); const titleSearchMask = !!r.bits(1); r.skip(13);
    const nc = r.u16(); const commands: Insn[] = [];
    for (let c = 0; c < nc; c++) { commands.push(decodeInsn(buf, r.byte)); r.skip(96); }
    objs.push({ resume, menuCallMask, titleSearchMask, commands });
  }
  return objs;
}

// ── MPLS playlist ───────────────────────────────────────────────────────────
export interface StreamsIn {
  video: { codec: keyof typeof VIDEO_CODING; h: number; scan: 'p' | 'i'; fps: number; dynamic?: Dynamic };
  audio: { codec: AudioCodec; channels: number; lang: string }[];
  pg: { lang: string }[];
  ig: { lang: string }[];
}
export interface PlayItemIn { clip: string; inSec: number; outSec: number; still?: 'none' | 'infinite' | number; streams: StreamsIn }
export interface PlaylistIn { format: DiscFormat; items: PlayItemIn[]; marks: { item: number; sec: number; link?: boolean }[]; noMenuCall?: boolean }

const t45 = (sec: number) => (CLIP_PTS_BASE_45K + Math.round(sec * 45000)) >>> 0;
const lang3 = (w: BitWriter, l: string) => w.ascii((l || 'und').slice(0, 3).padEnd(3, 'd'));

function stn(s: StreamsIn, uhd: boolean): Uint8Array {
  const w = new BitWriter().zero(16).u8(1).u8(s.audio.length).u8(s.pg.length).u8(s.ig.length).u8(0).u8(0).u8(0).u8(0).zero(32);
  const entry = (pid: number) => w.u8(9).u8(1).u16(pid).zero(48);
  entry(PID.VIDEO);
  w.u8(5).u8(VIDEO_CODING[s.video.codec]).bits(VIDEO_FORMAT_CODE(s.video.h, s.video.scan), 4).bits(FRAME_RATE_CODE(s.video.fps), 4);
  if (uhd && s.video.codec === 'hevc') {
    const dyn = s.video.dynamic || 'HDR10';
    w.bits(DYN_CODE[dyn], 4).bits(dyn === 'SDR709' ? 1 : 2, 4).bits(0, 1).bits(dyn === 'HDR10PLUS' ? 1 : 0, 1).zero(6).zero(8);
  } else w.zero(24);
  s.audio.forEach((a, i) => {
    entry(PID.AUDIO0 + i);
    w.u8(5).u8(AUDIO_CODING[a.codec]).bits(a.channels <= 1 ? 1 : a.channels === 2 ? 3 : 6, 4).bits(1, 4); lang3(w, a.lang);
  });
  s.pg.forEach((p, i) => { entry(PID.PG0 + i); w.u8(5).u8(PG_CODING); lang3(w, p.lang); w.zero(8); });
  s.ig.forEach((g, i) => { entry(PID.IG0 + i); w.u8(5).u8(IG_CODING); lang3(w, g.lang); w.zero(8); });
  const b = w.done();
  return new BitWriter().u16(b.length).raw(b).done();
}

export function writeMpls(p: PlaylistIn): Uint8Array {
  const uhd = p.format === 'UHD';
  const app = new BitWriter().zero(8).u8(1).zero(16).u32(0).u32(p.noMenuCall ? 0x00000002 : 0).bits(0, 1).bits(0, 1).bits(0, 1).bits(0, 1).bits(0, 1).zero(11).done();
  const pl = new BitWriter().zero(16).u16(p.items.length).u16(0);
  for (const it of p.items) {
    const piw = new BitWriter().ascii(it.clip.padStart(5, '0').slice(-5)).ascii('M2TS').zero(11).bits(0, 1).bits(1, 4).u8(0)
      .u32(t45(it.inSec)).u32(t45(it.outSec)).u32(0).u32(0).bits(0, 1).zero(7);
    const still = it.still ?? 'none';
    if (still === 'none') piw.u8(0).u16(0);
    else if (still === 'infinite') piw.u8(2).u16(0);
    else piw.u8(1).u16(Math.min(0xffff, Math.round(still)));
    piw.raw(stn(it.streams, uhd));
    const pib = piw.done();
    pl.u16(pib.length).raw(pib);
  }
  const plb = pl.done();
  const marks = new BitWriter().u16(p.marks.length);
  for (const m of p.marks) marks.u8(0).u8(m.link ? 2 : 1).u16(m.item).u32(t45(m.sec)).u16(0xffff).u32(0);
  const mb = marks.done();

  const headerLen = 40;
  const appBlock = 4 + app.length;
  const plStart = headerLen + appBlock;
  const markStart = plStart + 4 + plb.length;
  return new BitWriter().ascii('MPLS').ascii(ver(p.format)).u32(plStart).u32(markStart).u32(0).zero(20 * 8)
    .u32(app.length).raw(app).u32(plb.length).raw(plb).u32(mb.length).raw(mb).done();
}

export function parseMpls(buf: Uint8Array) {
  const r = new BitReader(buf);
  const magic = r.ascii(4), version = r.ascii(4); const plStart = r.u32(), markStart = r.u32();
  r.seekByte(plStart); r.u32(); r.u16(); const nItems = r.u16(); r.u16();
  const items = [];
  for (let k = 0; k < nItems; k++) {
    const len = r.u16(); const s = r.byte;
    const clip = r.ascii(5); r.ascii(4); r.skip(11); r.bits(1); r.bits(4); r.u8();
    const inT = r.u32(), outT = r.u32(); r.skip(64); r.skip(8); const stillMode = r.u8(); const stillTime = r.u16();
    r.u16(); r.u16(); const nv = r.u8(), na = r.u8(), npg = r.u8(), nig = r.u8();
    items.push({ clip, inSec: (inT - CLIP_PTS_BASE_45K) / 45000, outSec: (outT - CLIP_PTS_BASE_45K) / 45000, stillMode, stillTime, counts: { video: nv, audio: na, pg: npg, ig: nig } });
    r.seekByte(s + len);
  }
  r.seekByte(markStart); r.u32(); const nm = r.u16(); const marks = [];
  for (let k = 0; k < nm; k++) { r.u8(); const type = r.u8(); const item = r.u16(); const t = r.u32(); r.u16(); r.u32(); marks.push({ type, item, sec: (t - CLIP_PTS_BASE_45K) / 45000 }); }
  return { magic, version, items, marks };
}
