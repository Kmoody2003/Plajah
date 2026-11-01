// MacCaption MCC: one SMPTE 291 ANC packet per video frame, each holding a CDP (SMPTE 334-2) with
// both CEA-608 and CEA-708 captions. The header text is required by the format's licence terms and
// must be reproduced whole.

import { encodePopOn, slotToSec, type EncodeOptions, type LateCue, type PairEvent } from './cea608';
import { decode608 } from './cea608';
import { decode708, encode708, packetBytesToTriples, type TripleEvent } from './cea708';
import type { CaptionCue, CaptionDoc } from './model';
import { FRAME_RATES, frameToSec, frameToTc, rateById, secToFrame, tcToFrame, type FrameRate } from './timecode';

export interface MccOptions extends EncodeOptions {
  rateId?: string;
  /** Timecode of the video's first frame. Playout servers usually expect 01:00:00:00 or 00:00:00:00. */
  startTc?: string;
  /** Keep writing CDPs to this time, normally the video's duration. Default: last caption + 1 s. */
  durationSec?: number;
  uuid?: string;
  creationProgram?: string;
  now?: Date;
}

export interface WrittenMcc {
  text: string;
  late: LateCue[];
  unsupported: string[];
  encodedCues: CaptionCue[];
  rate: FrameRate;
  startFrame: number;
  frames: number;
}

const header = (version: number, has60df: boolean) => `File Format=MacCaption_MCC V${version}.0

///////////////////////////////////////////////////////////////////////////////////
// Computer Prompting and Captioning Company
// Ancillary Data Packet Transfer File
//
// Permission to generate this format is granted provided that
//   1. This ANC Transfer file format is used on an as-is basis and no warranty is given, and
//   2. This entire descriptive information text is included in a generated .mcc file.
//
// General file format:
//   HH:MM:SS:FF(tab)[Hexadecimal ANC data in groups of 2 characters]
//     Hexadecimal data starts with the Ancillary Data Packet DID (Data ID defined in S291M)
//       and concludes with the Check Sum following the User Data Words.
//     Each time code line must contain at most one complete ancillary data packet.
//     To transfer additional ANC Data successive lines may contain identical time code.
//     Time Code Rate=[24, 25, 30, 30DF, 50, 60${has60df ? ', 60DF' : ''}]
//
//   ANC data bytes may be represented by one ASCII character according to the following schema:
//     G  FAh 00h 00h
//     H  2 x (FAh 00h 00h)
//     I  3 x (FAh 00h 00h)
//     J  4 x (FAh 00h 00h)
//     K  5 x (FAh 00h 00h)
//     L  6 x (FAh 00h 00h)
//     M  7 x (FAh 00h 00h)
//     N  8 x (FAh 00h 00h)
//     O  9 x (FAh 00h 00h)
//     P  FBh 80h 80h
//     Q  FCh 80h 80h
//     R  FDh 80h 80h
//     S  96h 69h
//     T  61h 01h
//     U  E1h 00h 00h 00h
//     Z  00h
//
///////////////////////////////////////////////////////////////////////////////////
`;

const ALIASES: [string, number[]][] = (() => {
  const fa = [0xfa, 0x00, 0x00];
  const out: [string, number[]][] = [];
  // Longest runs first, so the greedy encoder takes O before G.
  for (let n = 9; n >= 1; n--) out.push(['GHIJKLMNO'[n - 1], Array.from({ length: n }, () => fa).flat()]);
  out.push(['P', [0xfb, 0x80, 0x80]], ['Q', [0xfc, 0x80, 0x80]], ['R', [0xfd, 0x80, 0x80]], ['S', [0x96, 0x69]], ['T', [0x61, 0x01]], ['Z', [0x00]]);
  return out;
})();
const ALIAS_MAP = new Map<string, number[]>([...ALIASES, ['U', [0xe1, 0x00, 0x00, 0x00]]]);

export function compressHex(bytes: number[]): string {
  let out = '';
  let i = 0;
  outer: while (i < bytes.length) {
    for (const [code, seq] of ALIASES) {
      if (i + seq.length > bytes.length) continue;
      let match = true;
      for (let k = 0; k < seq.length; k++) if (bytes[i + k] !== seq[k]) { match = false; break; }
      if (match) { out += code; i += seq.length; continue outer; }
    }
    out += bytes[i].toString(16).toUpperCase().padStart(2, '0');
    i++;
  }
  return out;
}

export function expandHex(line: string): number[] | null {
  const out: number[] = [];
  let i = 0;
  while (i < line.length) {
    const alias = ALIAS_MAP.get(line[i]);
    if (alias) { out.push(...alias); i++; continue; }
    const pair = line.slice(i, i + 2);
    if (!/^[0-9A-Fa-f]{2}$/.test(pair)) return null;
    out.push(parseInt(pair, 16));
    i += 2;
  }
  return out;
}

/** 608 pairs (field 1) that belong in a video frame: 29.97 pairs a second, spread over the frame grid. */
function slotsForFrame(frame: number, rate: FrameRate): [number, number] {
  // Half-open slot interval for this frame; rounding here keeps pairs within half a frame of true time.
  const a = Math.round((frame * rate.den * 30000) / (rate.num * 1001));
  const b = Math.round(((frame + 1) * rate.den * 30000) / (rate.num * 1001));
  return [a, b];
}

export function buildCdp(triples: number[], rate: FrameRate, seq: number): number[] {
  const count = rate.ccCount;
  const data = triples.slice(0, count * 3);
  while (data.length < count * 3) data.push(0xfa, 0x00, 0x00);
  const len = 7 + 2 + count * 3 + 4;
  const hi = (seq >> 8) & 0xff;
  const lo = seq & 0xff;
  const cdp = [
    0x96, 0x69, len, (rate.cdpCode << 4) | 0x0f,
    0x43, // cc_data present, caption service active, reserved bit set
    hi, lo,
    0x72, 0xe0 | count, ...data,
    0x74, hi, lo,
  ];
  const sum = cdp.reduce((n, b) => n + b, 0);
  cdp.push((256 - (sum & 0xff)) & 0xff);
  return cdp;
}

export function ancPacket(cdp: number[]): number[] {
  const body = [0x61, 0x01, cdp.length, ...cdp];
  // SMPTE 291 checksum over DID, SDID, DC and the user words.
  return [...body, body.reduce((n, b) => n + b, 0) & 0xff];
}

export function writeMcc(cues: CaptionCue[], opts: MccOptions = {}): WrittenMcc {
  const rate = rateById(opts.rateId || '29.97df');
  const startFrame = opts.startTc ? tcToFrame(opts.startTc, rate) ?? 0 : 0;
  const enc = encodePopOn(cues, opts);
  const frameOf = (sec: number) => secToFrame(sec, rate);

  // 608 takes up to 3 triples a frame at low rates (one field 1 + one field 2 pair at 29.97).
  const slotsPerFrameMax = rate.num / rate.den < 28 ? 2 : 1;
  const reserved = slotsPerFrameMax + 1;
  const dtvcc = encode708(enc.cues, frameOf, (rate.ccCount - reserved) * 2);

  // A loop, not Math.max(...keys): a long programme has more keys than a call can take arguments.
  let lastSlot = 0;
  for (const s of enc.slots.keys()) if (s > lastSlot) lastSlot = s;
  let lastDtv = 0;
  for (const f of dtvcc.frames.keys()) if (f > lastDtv) lastDtv = f;
  const contentEnd = Math.max(frameOf(slotToSec(lastSlot)), lastDtv) + rate.base;
  const total = Math.max(contentEnd, opts.durationSec ? frameOf(opts.durationSec) : 0);

  const now = opts.now ?? new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = (v: number) => String(v).padStart(2, '0');
  const has60df = rate.mccRate === '60DF';
  const lines: string[] = [
    header(has60df ? 2 : 1, has60df),
    `UUID=${opts.uuid ?? makeUuid()}`,
    `Creation Program=${opts.creationProgram ?? 'Plajah Crossover'}`,
    `Creation Date=${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
    `Creation Time=${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    `Time Code Rate=${rate.mccRate}`,
    '',
  ];

  for (let f = 0; f < total; f++) {
    const triples: number[] = [];
    const [a, b] = slotsForFrame(f, rate);
    let sent = 0;
    for (let s = a; s < b && sent < slotsPerFrameMax; s++, sent++) {
      const p = enc.slots.get(s);
      triples.push(0xfc, p ? p[0] : 0x80, p ? p[1] : 0x80);
    }
    if (a < b) triples.push(0xfd, 0x80, 0x80);
    const dtv = dtvcc.frames.get(f);
    if (dtv) triples.push(...packetBytesToTriples(dtv));
    const anc = ancPacket(buildCdp(triples, rate, f & 0xffff));
    // MCC writes drop-frame timecode with colons; the rate line is what says it drops.
    lines.push(`${frameToTc(f + startFrame, rate, ':')}\t${compressHex(anc)}`);
  }
  lines.push('');

  return { text: lines.join('\n'), late: enc.late, unsupported: enc.unsupported, encodedCues: enc.cues, rate, startFrame, frames: total };
}

function makeUuid(): string {
  const g = (globalThis as any).crypto;
  if (g?.randomUUID) return String(g.randomUUID()).toUpperCase();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)).toUpperCase();
}

export interface MccReadOptions {
  startTc?: string;
  /** Which caption layer to present. By default the one with more captions. */
  layer?: '608' | '708';
}

export interface MccDiagnostics {
  packets: number;
  /** Caption data packets (DID 61 / SDID 01). Anything else is ignored. */
  captionPackets: number;
  badAncChecksums: number;
  badCdpChecksums: number;
  /** Frames where the CDP sequence number didn't follow the previous frame. */
  sequenceBreaks: number;
  /** Lines whose timecode didn't follow the previous line by one frame. */
  timecodeGaps: number;
  firstTc?: string;
  lastTc?: string;
  cdpRateId?: string;
  ccCount?: number;
  has608: boolean;
  has708: boolean;
}

export interface McDoc extends CaptionDoc {
  diagnostics: MccDiagnostics;
  cues608: CaptionCue[];
  cues708: CaptionCue[];
}

/**
 * Read an MCC back the way a playout server does: walk each ANC packet, validate both checksums,
 * unwrap the CDP, and run the 608 and 708 layers through their decoders.
 */
export function parseMcc(text: string, opts: MccReadOptions = {}): McDoc {
  const warnings: string[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (!/^File Format=MacCaption_MCC V[12]\.0/i.test(lines[0]?.trim() || '')) warnings.push('Missing the "File Format=MacCaption_MCC" header.');
  const rateLine = lines.find(l => /^Time Code Rate=/i.test(l));
  const stated = rateLine?.split('=')[1]?.trim().toUpperCase();
  if (!stated) warnings.push('Missing the "Time Code Rate" line; assuming 30DF.');

  // The header rate can't separate 24 from 23.976 or 30 from 29.97. The CDP's own rate code can.
  const firstData = lines.find(l => /^\d{2}:\d{2}:\d{2}[:;.]\d{2}/.test(l));
  const firstBytes = firstData ? expandHex(firstData.split(/\s+/)[1] || '') : null;
  const cdpCode = firstBytes && firstBytes[3] === 0x96 ? firstBytes[6] >> 4 : 0;
  const rate = FRAME_RATES.find(f => f.mccRate === (stated || '30DF') && (!cdpCode || f.cdpCode === cdpCode))
    || FRAME_RATES.find(f => f.mccRate === (stated || '30DF'))
    || rateById('29.97df');
  if (stated && !FRAME_RATES.some(f => f.mccRate === stated)) warnings.push(`Unknown time code rate "${stated}".`);

  const offset = opts.startTc ? tcToFrame(opts.startTc, rate) ?? 0 : 0;
  const d: MccDiagnostics = { packets: 0, captionPackets: 0, badAncChecksums: 0, badCdpChecksums: 0, sequenceBreaks: 0, timecodeGaps: 0, has608: false, has708: false, cdpRateId: cdpCode ? rate.id : undefined };
  const pairs: PairEvent[] = [];
  const triples: TripleEvent[] = [];
  let prevSeq: number | null = null;
  let prevFrame: number | null = null;
  let firstFrame: number | undefined;

  for (const raw of lines) {
    const m = /^(\d{2}:\d{2}:\d{2}[:;.,]\d{2})(?:\.\d+(?:,\d+)?)?\s+(\S+)/.exec(raw);
    if (!m) continue;
    const frame = tcToFrame(m[1], rate);
    if (frame === null) continue;
    d.packets++;
    d.firstTc ??= m[1];
    d.lastTc = m[1];
    firstFrame ??= frame;
    if (prevFrame !== null && frame !== prevFrame + 1 && frame !== prevFrame) d.timecodeGaps++;
    prevFrame = frame;

    const bytes = expandHex(m[2]);
    if (!bytes || bytes.length < 4) { warnings.push(`Unreadable data at ${m[1]}.`); continue; }
    if (bytes[0] !== 0x61 || bytes[1] !== 0x01) continue;
    d.captionPackets++;
    const dc = bytes[2];
    const cdp = bytes.slice(3, 3 + dc);
    const ancSum = bytes[3 + dc];
    if (ancSum !== undefined) {
      const sum = bytes.slice(0, 3 + dc).reduce((n, b) => n + b, 0) & 0xff;
      // Writers disagree on sum vs two's complement, and both exist in the field.
      if (ancSum !== sum && ancSum !== ((256 - sum) & 0xff)) d.badAncChecksums++;
    }
    if (cdp[0] !== 0x96 || cdp[1] !== 0x69 || cdp.length < 11) { warnings.push(`Not a CDP at ${m[1]}.`); continue; }
    if (cdp.reduce((n, b) => n + b, 0) & 0xff) d.badCdpChecksums++;
    const seq = (cdp[5] << 8) | cdp[6];
    if (prevSeq !== null && seq !== ((prevSeq + 1) & 0xffff)) d.sequenceBreaks++;
    prevSeq = seq;

    let i = 7;
    const sec = frameToSec(frame - offset, rate);
    while (i < cdp.length - 4) {
      const id = cdp[i];
      if (id === 0x71) { i += 5; continue; }
      if (id === 0x73) { i += 2 + (cdp[i + 1] & 0x0f) * 7; continue; }
      if (id === 0x72) {
        const count = cdp[i + 1] & 0x1f;
        d.ccCount ??= count;
        let pos = i + 2;
        for (let c = 0; c < count; c++, pos += 3) {
          const flags = cdp[pos];
          if (!(flags & 0x04)) continue;
          const type = flags & 0x03;
          const b1 = cdp[pos + 1], b2 = cdp[pos + 2];
          if (type === 0) {
            if (b1 !== 0x80 || b2 !== 0x80) d.has608 = true;
            pairs.push({ sec, b1, b2 });
          } else if (type >= 2) {
            d.has708 = true;
            triples.push({ sec, ccType: type, b1, b2 });
          }
        }
        i = pos;
        continue;
      }
      break;
    }
  }

  const dec608 = decode608(pairs);
  const dec708 = decode708(triples);
  if (d.badAncChecksums) warnings.push(`${d.badAncChecksums} ANC packets have a bad checksum.`);
  if (d.badCdpChecksums) warnings.push(`${d.badCdpChecksums} CDPs have a bad checksum.`);
  if (d.sequenceBreaks) warnings.push(`CDP sequence numbers break ${d.sequenceBreaks} times.`);
  if (d.timecodeGaps) warnings.push(`Timecode jumps ${d.timecodeGaps} times.`);
  const layer = opts.layer ?? (dec708.cues.length > dec608.cues.length ? '708' : '608');

  return {
    cues: layer === '708' ? dec708.cues : dec608.cues,
    cues608: dec608.cues,
    cues708: dec708.cues,
    sourceFormat: 'mcc',
    warnings: [...warnings, ...dec608.warnings, ...dec708.warnings],
    rateId: rate.id,
    firstTimecodeSec: firstFrame !== undefined ? frameToSec(firstFrame, rate) : undefined,
    diagnostics: d,
  };
}
