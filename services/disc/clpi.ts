// CLIPINF/xxxxx.clpi — clip info: ATC/STC sequences, the program's streams, and the EP map
// (coarse + fine entry points) players use for chapter jumps and trick play.
import { BitReader, BitWriter } from './bits';
import { AUDIO_CODING, IG_CODING, PG_CODING, VIDEO_CODING, VIDEO_FORMAT_CODE } from './bdmv';
import type { EpEntry, MuxResult } from './m2ts';
import { PCR_PID, PMT_PID } from './m2ts';
import { FRAME_RATE_CODE, type AudioCodec, type DiscFormat, type Dynamic, type VideoCodec } from './spec';

export interface ClipStreamInfo {
  pid: number; kind: 'video' | 'audio' | 'pg' | 'ig';
  video?: { codec: VideoCodec; h: number; scan: 'p' | 'i'; fps: number; dynamic?: Dynamic };
  audio?: { codec: AudioCodec; channels: number; lang: string };
  lang?: string;
}
export interface ClpiIn { format: DiscFormat; mux: MuxResult; streams: ClipStreamInfo[]; applicationType?: 1 | 2 | 3 }

const DYN: Record<Dynamic, number> = { SDR709: 0, SDR2020: 0, HDR10: 1, DOLBY_VISION: 2, HDR10PLUS: 3 };
const lang3 = (w: BitWriter, l?: string) => w.ascii((l || 'und').slice(0, 3).padEnd(3, 'd'));

/** I_end_position_offset: how many packets the I-picture spans, bucketed (1..7). */
export function iEndOffset(packets: number): number {
  const bytes = packets * 192;
  return bytes < 131072 ? 1 : bytes < 262144 ? 2 : bytes < 393216 ? 3 : bytes < 589824 ? 4 : bytes < 917504 ? 5 : bytes < 1310720 ? 6 : 7;
}

export function epTables(ep: EpEntry[]) {
  const coarse: { fineId: number; ptsCoarse: number; spn: number }[] = [];
  const fine = ep.map(e => ({ iEnd: iEndOffset(e.endSpn - e.spn + 1), ptsFine: Math.floor(e.pts / 2 ** 9) & 0x7ff, spnFine: e.spn & 0x1ffff }));
  let lastPc = -1, lastSpnHi = -1;
  ep.forEach((e, i) => {
    const pc = Math.floor(e.pts / 2 ** 19) & 0x3fff, spnHi = Math.floor(e.spn / 2 ** 17);
    if (pc !== lastPc || spnHi !== lastSpnHi) { coarse.push({ fineId: i, ptsCoarse: pc, spn: e.spn }); lastPc = pc; lastSpnHi = spnHi; }
  });
  return { coarse, fine };
}

function codingInfo(w: BitWriter, s: ClipStreamInfo, uhd: boolean) {
  const b = new BitWriter();
  if (s.kind === 'video' && s.video) {
    b.u8(VIDEO_CODING[s.video.codec]).bits(VIDEO_FORMAT_CODE(s.video.h, s.video.scan), 4).bits(FRAME_RATE_CODE(s.video.fps), 4).bits(3, 4).zero(2).bits(0, 1).bits(0, 1);
    if (uhd && s.video.codec === 'hevc') { const d = s.video.dynamic || 'HDR10'; b.bits(DYN[d], 4).bits(d === 'SDR709' ? 1 : 2, 4).bits(d === 'HDR10PLUS' ? 1 : 0, 1).zero(7); }
    b.zero(24);
  } else if (s.kind === 'audio' && s.audio) {
    b.u8(AUDIO_CODING[s.audio.codec]).bits(s.audio.channels <= 1 ? 1 : s.audio.channels === 2 ? 3 : 6, 4).bits(1, 4); lang3(b, s.audio.lang); b.zero(16);
  } else { b.u8(s.kind === 'pg' ? PG_CODING : IG_CODING); lang3(b, s.lang); b.zero(16); }
  const body = b.done();
  w.u8(body.length).raw(body);
}

export function writeClpi(c: ClpiIn): Uint8Array {
  const uhd = c.format === 'UHD';
  const m = c.mux;
  const t45 = (pts90: number) => Math.floor(pts90 / 2) >>> 0;
  // ClipInfo
  const ci = new BitWriter().zero(16).u8(1).u8(c.applicationType ?? 1).zero(31).bits(0, 1).u32(m.recordingRate).u32(m.packets).zero(128 * 8)
    .u16(30).u8(0x80).ascii('HDMV').zero(25 * 8).done();
  // SequenceInfo
  const si = new BitWriter().zero(8).u8(1).u32(0).u8(1).u8(0).u16(PCR_PID).u32(0).u32(t45(m.startPts)).u32(t45(m.endPts)).done();
  // ProgramInfo
  const pi = new BitWriter().zero(8).u8(1).u32(0).u16(PMT_PID).u8(c.streams.length).u8(0);
  for (const s of c.streams) { pi.u16(s.pid); codingInfo(pi, s, uhd); }
  const pib = pi.done();
  // CPI / EP map (video only)
  const v = c.streams.find(s => s.kind === 'video');
  const cpi = new BitWriter().zero(12).bits(1, 4);
  if (v) {
    const { coarse, fine } = epTables(m.ep);
    const mapStart = 2 + 12; // after reserved+count (2 bytes) and one 12-byte stream entry header
    cpi.zero(8).u8(1).u16(v.pid).zero(10).bits(1, 4).u16(coarse.length).bits(fine.length, 18).u32(mapStart);
    const fineStart = 4 + coarse.length * 8;
    cpi.u32(fineStart);
    for (const k of coarse) cpi.bits(k.fineId, 18).bits(k.ptsCoarse, 14).u32(k.spn);
    for (const f of fine) cpi.bits(0, 1).bits(f.iEnd, 3).bits(f.ptsFine, 11).bits(f.spnFine, 17);
  } else cpi.zero(8).u8(0);
  const cpib = cpi.done();

  const H = 40;
  const ciStart = H, siStart = ciStart + 4 + ci.length, piStart = siStart + 4 + si.length, cpiStart = piStart + 4 + pib.length, cmStart = cpiStart + 4 + cpib.length;
  return new BitWriter().ascii('HDMV').ascii(uhd ? '0300' : '0200').u32(siStart).u32(piStart).u32(cpiStart).u32(cmStart).u32(0).zero(12 * 8)
    .u32(ci.length).raw(ci).u32(si.length).raw(si).u32(pib.length).raw(pib).u32(cpib.length).raw(cpib).u32(0).done();
}

export function parseClpi(buf: Uint8Array) {
  const r = new BitReader(buf);
  const magic = r.ascii(4), version = r.ascii(4);
  const siStart = r.u32(), piStart = r.u32(), cpiStart = r.u32();
  r.seekByte(40); r.u32(); r.u16(); const streamType = r.u8(), appType = r.u8(); r.u32(); const rate = r.u32(), packets = r.u32();
  r.skip(128 * 8); const tsLen = r.u16(); r.u8(); const fmtId = r.ascii(4); void tsLen;
  r.seekByte(siStart); r.u32(); r.u8(); r.u8(); r.u32(); r.u8(); r.u8(); const pcrPid = r.u16(); r.u32(); const start45 = r.u32(), end45 = r.u32();
  r.seekByte(piStart); r.u32(); r.u8(); r.u8(); r.u32(); const pmtPid = r.u16(); const ns = r.u8(); r.u8();
  const streams: { pid: number; coding: number }[] = [];
  for (let i = 0; i < ns; i++) { const pid = r.u16(); const len = r.u8(); const at = r.byte; const coding = r.u8(); streams.push({ pid, coding }); r.seekByte(at + len); }
  r.seekByte(cpiStart); r.u32(); r.skip(12); const cpiType = r.bits(4);
  const ep: { pts: number; spn: number }[] = [];
  const epMapStart = r.byte; r.u8(); const nPid = r.u8();
  if (nPid) {
    r.u16(); r.skip(10); r.bits(4); const nc = r.u16(); const nf = r.bits(18); const addr = r.u32();
    const base = epMapStart + addr; r.seekByte(base); const fineAt = r.u32();
    const coarse = Array.from({ length: nc }, () => ({ fineId: r.bits(18), pc: r.bits(14), spn: r.u32() }));
    r.seekByte(base + fineAt);
    const fine = Array.from({ length: nf }, () => { r.bits(1); r.bits(3); return { pf: r.bits(11), sf: r.bits(17) }; });
    coarse.forEach((c, i) => {
      const end = i + 1 < coarse.length ? coarse[i + 1].fineId : nf;
      for (let f = c.fineId; f < end; f++) ep.push({ pts: (c.pc & ~1) * 2 ** 19 + fine[f].pf * 2 ** 9, spn: Math.floor(c.spn / 2 ** 17) * 2 ** 17 + fine[f].sf });
    });
  }
  return { magic, version, streamType, appType, rate, packets, fmtId, pcrPid, startSec: start45 / 45000, endSec: end45 / 45000, pmtPid, streams, cpiType, ep };
}
