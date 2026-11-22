// EBU-STL (EBU Tech 3264-E): the binary subtitle exchange format of European broadcast. A 1024-byte
// General Subtitle Information block, then 128-byte Text and Timing Information blocks. Text is
// ISO 6937 (Latin) with teletext-style control codes: 0x8A line break, 0x80/0x81 italics on/off,
// 0x8F unused space. Long subtitles continue in extension blocks (EBN 0,1,... then 0xFF).

import { newCueId, stripMarkup, type CaptionCue, type CaptionDoc } from './model';
import { frameToSec, rateById, secToFrame, type FrameRate } from './timecode';

// ── ISO 6937 ─────────────────────────────────────────────────────────────────
const DIACRITIC: Record<number, string> = {
  0xc1: '̀', 0xc2: '́', 0xc3: '̂', 0xc4: '̃', 0xc5: '̄', 0xc6: '̆', 0xc7: '̇',
  0xc8: '̈', 0xca: '̊', 0xcb: '̧', 0xcd: '̋', 0xce: '̨', 0xcf: '̌',
};
const MARK_TO_BYTE = new Map(Object.entries(DIACRITIC).map(([b, m]) => [m, +b]));
const SINGLE: Record<number, string> = {
  0xa1: '¡', 0xa2: '¢', 0xa3: '£', 0xa5: '¥', 0xa7: '§', 0xa9: '‘', 0xaa: '“', 0xab: '«', 0xb0: '°', 0xb1: '±',
  0xb2: '²', 0xb3: '³', 0xb5: 'µ', 0xb6: '¶', 0xb7: '·', 0xb9: '’', 0xba: '”', 0xbb: '»', 0xbc: '¼', 0xbd: '½',
  0xbe: '¾', 0xbf: '¿', 0xd0: '―', 0xd5: '♪', 0xd4: '™', 0xd3: '©', 0xd2: '®', 0xe1: 'Æ', 0xe9: 'Ø', 0xea: 'Œ',
  0xf1: 'æ', 0xf9: 'ø', 0xfa: 'œ', 0xfb: 'ß',
};
const SINGLE_FROM = new Map(Object.entries(SINGLE).map(([b, ch]) => [ch, +b]));
const FOLD: Record<string, string> = { '—': '―', '–': '-', '…': '...' };

function encode6937(text: string): number[] {
  const out: number[] = [];
  for (const raw of text) {
    for (const ch of FOLD[raw] ?? raw) {
      const code = ch.charCodeAt(0);
      if (code >= 0x20 && code < 0x7f) { out.push(code); continue; }
      const single = SINGLE_FROM.get(ch);
      if (single) { out.push(single); continue; }
      const nfd = ch.normalize('NFD');
      const mark = MARK_TO_BYTE.get(nfd.slice(1));
      if (nfd.length === 2 && mark && nfd.charCodeAt(0) < 0x7f) { out.push(mark, nfd.charCodeAt(0)); continue; }
      out.push(0x3f); // '?' — not representable in Latin 6937
    }
  }
  return out;
}

function decode6937(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (DIACRITIC[b] && i + 1 < bytes.length) { s += (String.fromCharCode(bytes[++i]) + DIACRITIC[b]).normalize('NFC'); continue; }
    if (SINGLE[b]) { s += SINGLE[b]; continue; }
    if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
  }
  return s;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const ascii = (s: string, len: number) => { const b = new Array(len).fill(0x20); for (let i = 0; i < Math.min(len, s.length); i++) b[i] = s.charCodeAt(i) & 0x7f; return b; };
const digits = (n: number, len: number) => ascii(String(Math.max(0, Math.floor(n))).padStart(len, '0').slice(-len), len);
const readAscii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.slice(at, at + len)).trim();

export interface StlOptions {
  /** 25 (STL25.01, default for PAL) or 30 (STL30.01, 29.97/30 programmes). */
  fps?: 25 | 30;
  title?: string;
  /** Programme start timecode, HH:MM:SS:FF. Cue times are written relative to it. */
  startTc?: string;
  /** Two-digit EBU language code; 09 = English. */
  languageCode?: string;
  maxCols?: number;
  now?: Date;
}

const rateFor = (fps: 25 | 30): FrameRate => (fps === 25 ? rateById('25') : rateById('29.97ndf'));
const tcBytes = (frame: number, rate: FrameRate) => {
  const base = rate.base;
  const f = frame % base, totalSec = Math.floor(frame / base);
  return [Math.floor(totalSec / 3600) % 24, Math.floor(totalSec / 60) % 60, totalSec % 60, f];
};
const tcString = (frame: number, rate: FrameRate) => tcBytes(frame, rate).map((v) => String(v).padStart(2, '0')).join('');
const parseTcDigits = (s: string, rate: FrameRate) => {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s.replace(/[:;]/g, ''));
  return m ? ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * rate.base + +m[4]) : 0;
};

export function writeEbuStl(cues: CaptionCue[], opts: StlOptions = {}): Uint8Array {
  const fps = opts.fps ?? 25;
  const rate = rateFor(fps);
  const startFrame = opts.startTc ? parseTcDigits(opts.startTc, rate) : 0;
  const maxCols = opts.maxCols ?? 40;
  // Frame counting at the nominal base (STL timecode is non-drop): real seconds -> frames at the true rate.
  const frameAt = (sec: number) => secToFrame(sec, rate) + startFrame;

  const blocks: number[][] = [];
  let subtitleNo = 0;
  for (const c of cues) {
    const lines = c.text.split('\n');
    const tf: number[] = [];
    lines.forEach((line, li) => {
      if (li) tf.push(0x8a);
      let rest = line;
      while (rest.length) {
        const it = /^<i>/.exec(rest); if (it) { tf.push(0x80); rest = rest.slice(3); continue; }
        const iu = /^<\/i>/.exec(rest); if (iu) { tf.push(0x81); rest = rest.slice(4); continue; }
        const tag = /^<[^>]+>/.exec(rest); if (tag) { rest = rest.slice(tag[0].length); continue; }
        const next = rest.search(/<[^>]+>/);
        const chunk = next < 0 ? rest : rest.slice(0, next);
        tf.push(...encode6937(chunk)); // over-long lines are QC warnings, never silently cut
        rest = next < 0 ? '' : rest.slice(next);
      }
    });
    const pieces: number[][] = [];
    for (let i = 0; i < Math.max(1, tf.length); i += 112) pieces.push(tf.slice(i, i + 112));
    const n = lines.length;
    pieces.forEach((piece, pi) => {
      const b = new Array(128).fill(0);
      b[0] = 0;                                        // SGN
      b[1] = subtitleNo & 0xff; b[2] = (subtitleNo >> 8) & 0xff;
      b[3] = pi === pieces.length - 1 ? 0xff : pi;     // EBN
      b[4] = 0;                                        // CS: not cumulative
      tcBytes(frameAt(c.startSec), rate).forEach((v, k) => { b[5 + k] = v; });
      tcBytes(frameAt(c.endSec), rate).forEach((v, k) => { b[9 + k] = v; });
      b[13] = Math.max(1, 22 - (n - 1) * 2);           // VP: bottom rows, double-height spacing
      b[14] = c.align === 'left' ? 1 : c.align === 'right' ? 3 : 2; // JC
      b[15] = 0;                                       // CF
      for (let k = 0; k < 112; k++) b[16 + k] = k < piece.length ? piece[k] : 0x8f;
      blocks.push(b);
    });
    subtitleNo++;
  }

  const now = opts.now ?? new Date();
  const yymmdd = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const gsi = new Array(1024).fill(0x20);
  const put = (at: number, bytes: number[]) => bytes.forEach((v, i) => { gsi[at + i] = v; });
  put(0, ascii('850', 3));
  put(3, ascii(fps === 25 ? 'STL25.01' : 'STL30.01', 8));
  put(11, ascii('1', 1));                              // DSC: Level-1 teletext
  put(12, ascii('00', 2));                             // CCT: Latin
  put(14, ascii((opts.languageCode || '09').padStart(2, '0'), 2));
  put(16, ascii(opts.title || '', 32));
  put(224, ascii(yymmdd, 6)); put(230, ascii(yymmdd, 6)); put(236, ascii('00', 2));
  put(238, digits(blocks.length, 5));
  put(243, digits(subtitleNo, 5));
  put(248, ascii('001', 3));
  put(251, digits(maxCols, 2));
  put(253, ascii('23', 2));
  put(255, ascii('1', 1));                             // TCS: timecode is intended for use
  put(256, ascii(tcString(startFrame, rate), 8));
  put(264, ascii(tcString(cues.length ? frameAt(cues[0].startSec) : startFrame, rate), 8));
  put(272, ascii('1', 1)); put(273, ascii('1', 1));
  put(274, ascii('USA', 3));

  const out = new Uint8Array(1024 + blocks.length * 128);
  out.set(gsi, 0);
  blocks.forEach((b, i) => out.set(b, 1024 + i * 128));
  return out;
}

export function isEbuStl(bytes: Uint8Array): boolean {
  return bytes.length >= 1024 && /^STL(25|30)\.01$/.test(readAscii(bytes, 3, 8));
}

export function parseEbuStl(bytes: Uint8Array): CaptionDoc {
  const warnings: string[] = [];
  if (!isEbuStl(bytes)) throw new Error('Not an EBU-STL file (no STL25.01 / STL30.01 header).');
  const dfc = readAscii(bytes, 3, 8);
  const rate = rateFor(dfc === 'STL25.01' ? 25 : 30);
  const cct = readAscii(bytes, 12, 2);
  if (cct && cct !== '00') warnings.push(`Character table ${cct} is not Latin; non-Latin text may read wrongly.`);
  const tcp = readAscii(bytes, 256, 8);
  const offset = readAscii(bytes, 255, 1) === '1' && /^\d{8}$/.test(tcp) ? parseTcDigits(tcp, rate) : 0;
  const tc = (b: Uint8Array, at: number) => ((b[at] * 3600 + b[at + 1] * 60 + b[at + 2]) * rate.base + b[at + 3]);

  const cues: CaptionCue[] = [];
  let pending: { start: number; end: number; bytes: number[]; jc: number } | null = null;
  for (let at = 1024; at + 128 <= bytes.length; at += 128) {
    const b = bytes.subarray(at, at + 128);
    if (b[15] === 1) continue;                         // comment block
    const ebn = b[3];
    if (ebn === 0xfe) continue;                        // user data
    const start = tc(b, 5), end = tc(b, 9);
    const text = Array.from(b.subarray(16, 128));
    if (!pending) pending = { start, end, bytes: [], jc: b[14] };
    pending.bytes.push(...text);
    if (ebn === 0xff) {
      // Decode: 0x8A newline, 0x80/0x81 italics, 0x8F padding, other control codes dropped.
      let s = ''; let run: number[] = [];
      const flush = () => { if (run.length) { s += decode6937(run); run = []; } };
      for (const v of pending.bytes) {
        if (v === 0x8a) { flush(); if (!s.endsWith('\n')) s += '\n'; }
        else if (v === 0x80) { flush(); s += '<i>'; }
        else if (v === 0x81) { flush(); s += '</i>'; }
        else if (v === 0x8f) { /* unused */ }
        else if (v < 0x20 || (v >= 0x80 && v <= 0x9f)) { /* teletext colour / size codes */ }
        else run.push(v);
      }
      flush();
      const clean = s.replace(/<i>\s*<\/i>/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
      if (clean) {
        cues.push({
          id: newCueId(), startSec: frameToSec(pending.start - offset, rate), endSec: frameToSec(pending.end - offset, rate), text: clean,
          ...(pending.jc === 1 ? { align: 'left' as const } : pending.jc === 3 ? { align: 'right' as const } : {}),
        });
      }
      pending = null;
    }
  }
  return { cues, sourceFormat: 'stl', warnings, rateId: rate.id, firstTimecodeSec: offset ? frameToSec(offset, rate) : undefined };
}
