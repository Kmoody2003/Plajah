// Blu-ray M2TS muxer. 192-byte source packets (4-byte arrival time stamp + 188-byte TS packet),
// HDMV PIDs, PAT/PMT with the "HDMV" registration, PCR on its own PID, PES timestamps re-based so
// every clip's presentation starts at CLIP_PTS_BASE, files padded to 6144-byte aligned units, and an
// EP map (keyframe → source packet number) for the clip info file.
//
// Scheduling is a simple lead model: each access unit is sent no earlier than `lead` seconds before
// its decode time and as early as the mux rate allows. Underruns (unit sent after its DTS) are
// counted and reported so a build can refuse a non-compliant clip.
import { CLIP_PTS_BASE_45K, PID } from './bdmv';
import type { AccessUnit } from './ts';

export const SP = 192, TS = 188, ALIGNED_UNIT = 6144;
export const PMT_PID = 0x0100, PCR_PID = 0x1001, NULL_PID = 0x1fff;
export const CLIP_PTS_BASE_90K = CLIP_PTS_BASE_45K * 2;

export type Kind = 'video' | 'audio' | 'pg' | 'ig';
export interface MuxUnit { pts: number; dts: number; data: Uint8Array; key?: boolean }
export interface MuxStream { pid: number; kind: Kind; streamType: number; units: Iterable<MuxUnit> | AsyncIterable<MuxUnit>; lang?: string }
export interface EpEntry { pts: number; spn: number; endSpn: number }
export interface MuxResult { packets: number; bytes: number; ep: EpEntry[]; startPts: number; endPts: number; recordingRate: number; underruns: number; streams: { pid: number; kind: Kind; streamType: number; lang?: string }[] }
export interface MuxOpts { muxRateBps: number; write: (b: Uint8Array) => void | Promise<void>; frameDuration90k?: number; timeOffset90k?: number }

// ── CRC-32/MPEG-2 for PSI ───────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1; t[i] = c >>> 0; } return t; })();
export const crc32mpeg = (b: Uint8Array, start = 0, end = b.length) => { let c = 0xffffffff; for (let i = start; i < end; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 0xff]) >>> 0; return c >>> 0; };

function section(tableId: number, ext: number, body: number[]): Uint8Array {
  const len = 5 + body.length + 4;
  const s = [tableId, 0xb0 | ((len >> 8) & 0x0f), len & 0xff, ext >> 8, ext & 0xff, 0xc1, 0x00, 0x00, ...body];
  const u = Uint8Array.from([...s, 0, 0, 0, 0]);
  const crc = crc32mpeg(u, 0, u.length - 4);
  u.set([crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], u.length - 4);
  return u;
}
export const patSection = () => section(0x00, 1, [0x00, 0x01, 0xe0 | (PMT_PID >> 8), PMT_PID & 0xff]);
export function pmtSection(streams: { pid: number; streamType: number }[]): Uint8Array {
  const progInfo = [0x05, 4, 0x48, 0x44, 0x4d, 0x56]; // registration "HDMV"
  const body = [0xe0 | (PCR_PID >> 8), PCR_PID & 0xff, 0xf0 | (progInfo.length >> 8), progInfo.length & 0xff, ...progInfo];
  for (const s of streams) body.push(s.streamType, 0xe0 | (s.pid >> 8), s.pid & 0xff, 0xf0, 0x00);
  return section(0x02, 1, body);
}

const ptsBytes = (marker: number, v: number) => {
  const x = ((v % 2 ** 33) + 2 ** 33) % 2 ** 33;
  const hi = Math.floor(x / 2 ** 30), mid = Math.floor(x / 2 ** 15) & 0x7fff, lo = x & 0x7fff;
  return [(marker << 4) | (hi << 1) | 1, mid >> 7, ((mid & 0x7f) << 1) | 1, lo >> 7, ((lo & 0x7f) << 1) | 1];
};

export function pesHeader(kind: Kind, payloadLen: number, pts: number, dts: number): Uint8Array {
  const withDts = dts !== pts;
  const opt = withDts ? [...ptsBytes(3, pts), ...ptsBytes(1, dts)] : ptsBytes(2, pts);
  const sid = kind === 'video' ? 0xe0 : 0xbd;
  const total = 3 + opt.length + payloadLen;
  const len = total > 0xffff ? 0 : total;
  return Uint8Array.from([0, 0, 1, sid, len >> 8, len & 0xff, 0x84, withDts ? 0xc0 : 0x80, opt.length, ...opt]);
}

/** Merge several DTS-ordered unit sources into one DTS-ordered sequence. */
async function* merge(streams: MuxStream[]) {
  const its = streams.map(s => (Symbol.asyncIterator in (s.units as any) ? (s.units as AsyncIterable<MuxUnit>)[Symbol.asyncIterator]() : (s.units as Iterable<MuxUnit>)[Symbol.iterator]()));
  const heads: (IteratorResult<MuxUnit> | null)[] = await Promise.all(its.map(it => it.next() as any));
  for (;;) {
    let best = -1;
    for (let i = 0; i < heads.length; i++) if (heads[i] && !heads[i]!.done && (best < 0 || heads[i]!.value.dts < heads[best]!.value.dts)) best = i;
    if (best < 0) return;
    yield { s: streams[best], u: heads[best]!.value };
    heads[best] = await (its[best].next() as any);
  }
}

export async function mux(streams: MuxStream[], o: MuxOpts): Promise<MuxResult> {
  const pktTicks = Math.ceil((TS * 8 * 27e6) / o.muxRateBps);
  const lead = { video: 0.7, audio: 0.35, pg: 1.0, ig: 1.0 } as const;
  const cc = new Map<number, number>();
  const out: Uint8Array[] = []; let outBytes = 0, packets = 0;
  const ep: EpEntry[] = [];
  let t = -1; // 27 MHz arrival clock
  let lastPsi = -Infinity, lastPcr = -Infinity, underruns = 0;
  let offset: number | null = o.timeOffset90k ?? null;
  let startPts = Infinity, endPts = -Infinity;
  const video = streams.find(s => s.kind === 'video');
  const pmt = pmtSection(streams.map(s => ({ pid: s.pid, streamType: s.streamType })));
  const pat = patSection();

  const flush = async (force = false) => {
    if (!force && outBytes < 4 * 1024 * 1024) return;
    const b = new Uint8Array(outBytes); let k = 0; for (const x of out) { b.set(x, k); k += x.length; }
    out.length = 0; outBytes = 0; await o.write(b);
  };
  const emit = (ts: Uint8Array) => {
    const sp = new Uint8Array(SP);
    const ats = Math.floor(t) % 2 ** 30;
    sp[0] = (ats >>> 24) & 0x3f; sp[1] = (ats >>> 16) & 0xff; sp[2] = (ats >>> 8) & 0xff; sp[3] = ats & 0xff;
    sp.set(ts, 4); out.push(sp); outBytes += SP; packets++; t += pktTicks;
  };
  const nextCc = (pid: number) => { const c = cc.get(pid) ?? 0; cc.set(pid, (c + 1) & 15); return c; };
  const psiPacket = (pid: number, sec: Uint8Array) => {
    const p = new Uint8Array(TS).fill(0xff);
    p.set([0x47, 0x40 | (pid >> 8), pid & 0xff, 0x10 | nextCc(pid), 0x00]); p.set(sec, 5); emit(p);
  };
  const pcrPacket = () => {
    const p = new Uint8Array(TS).fill(0xff);
    const pcr = Math.floor(t); const base = Math.floor(pcr / 300), ext = pcr % 300;
    p.set([0x47, PCR_PID >> 8, PCR_PID & 0xff, 0x20 | (cc.get(PCR_PID) ?? 0), 183, 0x10,
      Math.floor(base / 2 ** 25) & 0xff, Math.floor(base / 2 ** 17) & 0xff, Math.floor(base / 2 ** 9) & 0xff, Math.floor(base / 2) & 0xff, ((base & 1) << 7) | 0x7e | (ext >> 8), ext & 0xff]);
    emit(p);
  };
  const housekeeping = () => {
    if (t - lastPsi >= 0.1 * 27e6) { psiPacket(0, pat); psiPacket(PMT_PID, pmt); lastPsi = t; }
    if (t - lastPcr >= 0.04 * 27e6) { pcrPacket(); lastPcr = t; }
  };

  for await (const { s, u } of merge(streams)) {
    if (offset == null) offset = CLIP_PTS_BASE_90K - (video ? u.pts : u.pts); // first unit sets the base
    const pts = u.pts + offset, dts = u.dts + offset;
    if (s.kind === 'video') { startPts = Math.min(startPts, pts); endPts = Math.max(endPts, pts + (o.frameDuration90k || 3754)); }
    else if (!video) { startPts = Math.min(startPts, pts); endPts = Math.max(endPts, pts); }
    const deadline = dts * 300;
    const earliest = deadline - lead[s.kind] * 27e6;
    if (t < 0) t = Math.max(0, earliest); // clips start at 0.6 s, so the first lead is clamped: clocks never go negative
    // Idle stretch before this unit: keep PCR (≤ 40 ms) and PSI flowing through the gap.
    while (t < earliest) {
      const next = Math.max(t, lastPcr + 0.04 * 27e6);
      if (next >= earliest) break;
      t = next; housekeeping();
    }
    if (t < earliest) t = earliest;
    housekeeping();
    const pes = (() => { const h = pesHeader(s.kind, u.data.length, pts, dts); const b = new Uint8Array(h.length + u.data.length); b.set(h); b.set(u.data, h.length); return b; })();
    const startSpn = packets;
    let off = 0, first = true;
    while (off < pes.length) {
      if (t - lastPcr >= 0.04 * 27e6 || t - lastPsi >= 0.1 * 27e6) housekeeping();
      const p = new Uint8Array(TS);
      const ra = first && s.kind === 'video' && !!u.key;
      const room0 = TS - 4;
      const remain = pes.length - off;
      const needAf = ra || remain < room0;
      let afLen = 0;
      if (needAf) afLen = Math.max(ra ? 2 : 1, room0 - remain); // includes the length byte
      const payloadLen = Math.min(remain, room0 - afLen);
      p[0] = 0x47; p[1] = (first ? 0x40 : 0) | (s.pid >> 8); p[2] = s.pid & 0xff;
      p[3] = (needAf ? 0x30 : 0x10) | nextCc(s.pid);
      let q = 4;
      if (needAf) {
        p[q] = afLen - 1;
        if (afLen > 1) { p[q + 1] = ra ? 0x40 : 0x00; p.fill(0xff, q + 2, q + afLen); }
        q += afLen;
      }
      p.set(pes.subarray(off, off + payloadLen), q);
      emit(p); off += payloadLen; first = false;
    }
    if (t > deadline) underruns++;
    if (s.kind === 'video' && u.key) ep.push({ pts, spn: startSpn, endSpn: packets - 1 });
    await flush();
  }
  // Pad to an aligned unit (32 source packets) with null packets.
  while (packets % (ALIGNED_UNIT / SP)) { const p = new Uint8Array(TS).fill(0xff); p.set([0x47, 0x1f, 0xff, 0x10]); emit(p); }
  await flush(true);
  return { packets, bytes: packets * SP, ep, startPts: isFinite(startPts) ? startPts : CLIP_PTS_BASE_90K, endPts: isFinite(endPts) ? endPts : CLIP_PTS_BASE_90K, recordingRate: Math.round(o.muxRateBps / 8), underruns, streams: streams.map(s => ({ pid: s.pid, kind: s.kind, streamType: s.streamType, lang: s.lang })) };
}

// ── Unit sources ────────────────────────────────────────────────────────────

/** Re-label demuxed ffmpeg units for one stream. */
export function* fromDemux(units: Iterable<AccessUnit>, pid: number): Iterable<MuxUnit> {
  for (const u of units) if (u.pid === pid) yield { pts: u.pts, dts: u.dts, data: u.data, key: u.key };
}

/** PG (.sup) → one unit per segment with the SUP's own PTS/DTS. */
export function* fromSup(sup: Uint8Array): Iterable<MuxUnit> {
  let o = 0;
  while (o + 13 <= sup.length) {
    const pts = ((sup[o + 2] << 24) >>> 0) + (sup[o + 3] << 16) + (sup[o + 4] << 8) + sup[o + 5];
    const dts = ((sup[o + 6] << 24) >>> 0) + (sup[o + 7] << 16) + (sup[o + 8] << 8) + sup[o + 9];
    const len = (sup[o + 11] << 8) | sup[o + 12];
    yield { pts, dts: dts || pts, data: sup.subarray(o + 10, o + 13 + len) };
    o += 13 + len;
  }
}

/** IG stream (raw segments from buildIg) → units, all presented at `startPts` (same time base as video). */
export function* fromIg(ig: Uint8Array, startPts: number): Iterable<MuxUnit> {
  let o = 0, k = 0;
  while (o + 3 <= ig.length) {
    const len = (ig[o + 1] << 8) | ig[o + 2];
    yield { pts: startPts, dts: startPts - 9000 + k++ * 10, data: ig.subarray(o, o + 3 + len) };
    o += 3 + len;
  }
}

export const STREAM_PID = PID;
