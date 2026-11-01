// CEA-608 (line 21) on data channel CC1: the character set, a pop-on encoder that schedules every
// byte pair on a slot of the 29.97 pairs-per-second channel, and a decoder for pop-on, roll-up and
// paint-on. SCC stores these pairs directly; MCC carries them inside CDPs.

import { newCueId, stripMarkup, type CaptionCue } from './model';

export const COLS = 32;
export const SLOTS_PER_SEC = 30000 / 1001;
export const slotToSec = (slot: number) => (slot * 1001) / 30000;
export const secToSlot = (sec: number) => Math.round((sec * 30000) / 1001);

export type Pair = [number, number];

export const withParity = (b: number) => {
  let v = b & 0x7f;
  let ones = 0;
  for (let x = v; x; x >>= 1) ones += x & 1;
  if (ones % 2 === 0) v |= 0x80;
  return v;
};
export const parityOk = (b: number) => {
  let ones = 0;
  for (let x = b & 0xff; x; x >>= 1) ones += x & 1;
  return ones % 2 === 1;
};

// Where the 608 basic set differs from ASCII.
const BASIC_DIFF: Record<number, string> = {
  0x2a: 'á', 0x5c: 'é', 0x5e: 'í', 0x5f: 'ó', 0x60: 'ú', 0x7b: 'ç', 0x7c: '÷', 0x7d: 'Ñ', 0x7e: 'ñ', 0x7f: '█',
};
const SPECIAL = '®°½¿™¢£♪à èâêîôû'; // 0x11 0x30-0x3F; index 9 is the transparent space.
const EXT_12 = 'ÁÉÓÚÜü‘¡*\'—©℠•“”ÀÂÇÈÊËëÎÏïÔÙùÛ«»'; // 0x12 0x20-0x3F
const EXT_13 = 'ÃãÍÌìÒòÕõ{}\\^_|~ÄäÖößäö'.slice(0, 0) + 'ÃãÍÌìÒòÕõ{}\\^_|~ÄäÖöß¥¤¦ÅåØø┌┐└┘'; // 0x13 0x20-0x3F

const FROM_CHAR = new Map<string, number>();
for (let c = 0x20; c < 0x80; c++) {
  if (BASIC_DIFF[c]) FROM_CHAR.set(BASIC_DIFF[c], c);
  else FROM_CHAR.set(String.fromCharCode(c), c);
}
for (const k of ['*', '\\', '^', '_', '`', '{', '|', '}', '~']) FROM_CHAR.delete(k); // basic codes reuse these slots

const SPECIAL_FROM = new Map<string, number>();
[...SPECIAL].forEach((ch, i) => { if (ch !== ' ') SPECIAL_FROM.set(ch, 0x30 + i); });
const EXT_FROM = new Map<string, [number, number]>();
[...EXT_12].forEach((ch, i) => EXT_FROM.set(ch, [0x12, 0x20 + i]));
[...EXT_13].forEach((ch, i) => EXT_FROM.set(ch, [0x13, 0x20 + i]));
const FOLD: Record<string, string> = { '’': "'", '–': '-', '…': '...', ' ': ' ' };

/** Plain character shown if a decoder doesn't know an extended code; decoders that do will backspace over it. */
const fallbackFor = (ch: string) => {
  const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (plain.length === 1 && FROM_CHAR.has(plain)) return plain;
  return ch === '«' || ch === '»' || ch === '“' || ch === '”' ? '"' : ch === '—' ? '-' : ' ';
};

export function canEncode(ch: string): boolean {
  return FROM_CHAR.has(ch) || SPECIAL_FROM.has(ch) || EXT_FROM.has(ch) || ch in FOLD;
}

const CMD = { RCL: 0x20, BS: 0x21, DER: 0x24, RU2: 0x25, RU3: 0x26, RU4: 0x27, RDC: 0x29, EDM: 0x2c, CR: 0x2d, ENM: 0x2e, EOC: 0x2f };
const cmd = (low: number): Pair => [withParity(0x14), withParity(low)];

// Row (1-15) -> first PAC byte on CC1, and whether it uses the 0x60 low-byte range.
const ROW_HI = [0, 0x11, 0x11, 0x12, 0x12, 0x15, 0x15, 0x16, 0x16, 0x17, 0x17, 0x10, 0x13, 0x13, 0x14, 0x14];
const ROW_LOW_HIGH = [false, false, true, false, true, false, true, false, true, false, true, false, false, true, false, true];

function pacPair(row: number, indent: number): Pair {
  const low = (ROW_LOW_HIGH[row] ? 0x70 : 0x50) | ((indent / 4) << 1);
  return [withParity(ROW_HI[row]), withParity(low)];
}

/** Cells a line takes on screen. Each italic on/off is a mid-row code, which occupies a cell. */
const cellWidth = (s: string) => stripMarkup(s).length + (s.match(/<\/?i>/g) || []).length;

/** Wrap to lines of at most `cols`, keeping authored breaks. Words too long for a line are hard-split. */
export function wrapLines(text: string, cols = COLS): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (cellWidth(w) > cols) {
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, cols));
        w = w.slice(cols);
      }
      const next = cur ? `${cur} ${w}` : w;
      if (cellWidth(next) > cols) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

/** Split cues that won't fit the row limit into consecutive cues, timed in proportion to their text. */
export function fitCuesToRows(cues: CaptionCue[], maxRows: number): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (const cue of cues) {
    const lines = wrapLines(cue.text);
    if (lines.length <= maxRows) { out.push({ ...cue, text: lines.join('\n') }); continue; }
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += maxRows) groups.push(lines.slice(i, i + maxRows));
    const totalChars = lines.reduce((n, l) => n + stripMarkup(l).length, 0) || 1;
    let t = cue.startSec;
    groups.forEach((g, i) => {
      const chars = g.reduce((n, l) => n + stripMarkup(l).length, 0);
      const end = i === groups.length - 1 ? cue.endSec : t + ((cue.endSec - cue.startSec) * chars) / totalChars;
      out.push({ id: newCueId(), startSec: t, endSec: end, text: g.join('\n') });
      t = end;
    });
  }
  return out;
}

/** Encode one wrapped line of text (after its PAC) into pairs, padding odd characters. */
function textPairs(line: string, warn: (ch: string) => void): Pair[] {
  const pairs: Pair[] = [];
  let pending: number | null = null;
  const flush = () => { if (pending !== null) { pairs.push([withParity(pending), withParity(0)]); pending = null; } };
  const put = (code: number) => {
    if (pending === null) pending = code;
    else { pairs.push([withParity(pending), withParity(code)]); pending = null; }
  };
  const control = (hi: number, lo: number) => {
    flush();
    const p: Pair = [withParity(hi), withParity(lo)];
    pairs.push(p, p); // sent twice so one lost frame can't lose it; decoders drop the repeat
  };

  let i = 0;
  while (i < line.length) {
    if (line.startsWith('<i>', i)) { control(0x11, 0x2e); i += 3; continue; }
    if (line.startsWith('</i>', i)) { control(0x11, 0x20); i += 4; continue; }
    if (line[i] === '<') {
      const close = line.indexOf('>', i);
      if (close > i) { i = close + 1; continue; }
    }
    const raw = String.fromCodePoint(line.codePointAt(i)!);
    i += raw.length;
    for (const ch of [...(FOLD[raw] ?? raw)]) {
      const basic = FROM_CHAR.get(ch);
      if (basic !== undefined) put(basic);
      else if (SPECIAL_FROM.has(ch)) control(0x11, SPECIAL_FROM.get(ch)!);
      else if (EXT_FROM.has(ch)) {
        put(FROM_CHAR.get(fallbackFor(ch)) ?? 0x20);
        const [hi, lo] = EXT_FROM.get(ch)!;
        control(hi, lo);
      } else { warn(ch); put(0x20); }
    }
  }
  flush();
  return pairs;
}

export interface EncodeOptions {
  /** Rows a single caption may use before it is split (broadcast convention is 2 or 3). */
  maxRows?: number;
  /** Bottom row of the caption block, 1-15. Row 15 is the bottom of the safe area. */
  bottomRow?: number;
}

export interface LateCue { id: string; text: string; lateSlots: number }

export interface Encoded608 {
  /** Sparse map from channel slot to the pair sent in it. */
  slots: Map<number, Pair>;
  /** The cues actually encoded, after fitting to rows. */
  cues: CaptionCue[];
  /** Cues whose text couldn't be delivered before their start time on the 60 byte/s channel. */
  late: LateCue[];
  unsupported: string[];
}

/**
 * Pop-on encoding. The caption text loads into the hidden buffer ahead of time and End Of Caption
 * lands on the cue's exact start, which is what makes pop-on frame-accurate. The channel only moves
 * two bytes a frame, so a long caption straight after another can't always load in time; those are
 * reported as late rather than silently shifted.
 */
export function encodePopOn(input: CaptionCue[], opts: EncodeOptions = {}): Encoded608 {
  const maxRows = opts.maxRows ?? 2;
  const bottom = opts.bottomRow ?? 15;
  const cues = fitCuesToRows(input, maxRows);
  const slots = new Map<number, Pair>();
  const unsupported = new Set<string>();
  const late: LateCue[] = [];
  let floor = 0; // nothing for this cue may load before the previous caption has popped

  const place = (slot: number, p: Pair) => slots.set(slot, p);
  const taken = (slot: number) => slots.has(slot);
  const putTwice = (slot: number, p: Pair) => {
    let s = slot;
    while (taken(s)) s++;
    place(s, p);
    let t = s + 1;
    while (taken(t)) t++;
    place(t, p);
    return s;
  };

  cues.forEach((cue, idx) => {
    const lines = wrapLines(cue.text);
    const load: Pair[] = [cmd(CMD.ENM), cmd(CMD.ENM), cmd(CMD.RCL), cmd(CMD.RCL)];
    lines.forEach((line, li) => {
      const row = bottom - (lines.length - 1 - li);
      const width = cellWidth(line);
      const col = Math.max(0, Math.floor((COLS - width) / 2));
      const indent = col - (col % 4);
      const pac = pacPair(row, indent);
      load.push(pac, pac);
      if (col % 4) { const tab: Pair = [withParity(0x17), withParity(0x20 + (col % 4))]; load.push(tab, tab); }
      load.push(...textPairs(line, ch => unsupported.add(ch)));
    });

    const wanted = secToSlot(cue.startSec);
    // Find the latest run of free slots that ends just before EOC; slide EOC later only if forced.
    let eoc = wanted;
    const canFit = (at: number) => {
      if (taken(at) || taken(at + 1)) return false;
      let free = 0;
      for (let s = at - 1; s >= floor; s--) {
        if (!taken(s)) free++;
        if (free >= load.length) return true;
      }
      return false;
    };
    while (!canFit(eoc)) eoc++;
    let cursor = eoc - 1;
    for (let i = load.length - 1; i >= 0; i--) {
      while (taken(cursor)) cursor--;
      place(cursor--, load[i]);
    }
    place(eoc, cmd(CMD.EOC));
    place(eoc + 1, cmd(CMD.EOC));
    if (eoc > wanted) late.push({ id: cue.id, text: cue.text, lateSlots: eoc - wanted });
    floor = eoc + 2;

    // Clear the screen at the end, unless the next caption's swap replaces it within a couple of frames.
    const end = Math.max(secToSlot(cue.endSec), eoc + 2);
    const next = cues[idx + 1];
    if (!next || secToSlot(next.startSec) > end + 2) {
      putTwice(end, cmd(CMD.EDM));
    }
  });

  return { slots, cues, late, unsupported: [...unsupported] };
}

// ── Decoder ─────────────────────────────────────────────────────────────────

interface CellRow { chars: string[]; italic: boolean[] }
type Grid = (CellRow | undefined)[];

const gridText = (g: Grid) => {
  const rows: string[] = [];
  for (let r = 1; r <= 15; r++) {
    const row = g[r];
    if (!row) continue;
    let s = '';
    let inItalic = false;
    for (let c = 0; c < COLS + 1; c++) {
      const ch = row.chars[c] ?? ' ';
      const it = !!row.italic[c];
      if (it && !inItalic && ch !== ' ') { s += '<i>'; inItalic = true; }
      if (!it && inItalic) { const t = s.trimEnd(); s = `${t}</i>${s.slice(t.length)}`; inItalic = false; }
      s += ch;
    }
    if (inItalic) s = `${s.trimEnd()}</i>`;
    s = s.trim();
    if (s) rows.push(s);
  }
  return rows.join('\n');
};

export interface Decoded608 {
  cues: CaptionCue[];
  warnings: string[];
  /** Pairs that failed odd parity. */
  parityErrors: number;
  /** Pairs on data channel CC2, which this decoder doesn't present. */
  otherChannelPairs: number;
}

export type PairEvent = { sec: number; b1: number; b2: number };

/** Run the 608 state machine over timed byte pairs. Works from any source: SCC lines or MCC CDPs. */
export function decode608(events: PairEvent[]): Decoded608 {
  const cues: CaptionCue[] = [];
  let parityErrors = 0;
  let otherChannelPairs = 0;
  let channel = 0;
  let displayed: Grid = [];
  let hidden: Grid = [];
  let mode: 'pop' | 'roll' | 'paint' = 'pop';
  let rollRows = 3;
  let row = 15;
  let col = 0;
  let italic = false;
  let lastCtrl: [number, number] | null = null;
  let open: { start: number; text: string } | null = null;
  let rollLine: { start: number } | null = null;

  const close = (sec: number) => {
    if (open && sec > open.start) cues.push({ id: newCueId(), startSec: open.start, endSec: sec, text: open.text });
    open = null;
  };
  const showDisplayed = (sec: number) => {
    const text = gridText(displayed);
    if (open && open.text === text) return;
    close(sec);
    if (text) open = { start: sec, text };
  };
  const target = () => (mode === 'pop' ? hidden : displayed);
  const ensureRow = (g: Grid, r: number) => (g[r] ??= { chars: [], italic: [] });
  const write = (ch: string, sec: number) => {
    const g = target();
    const cells = ensureRow(g, row);
    if (col >= COLS) col = COLS - 1;
    cells.chars[col] = ch;
    cells.italic[col] = italic;
    col++;
    if (mode === 'roll') rollLine ??= { start: sec };
  };

  for (const ev of events) {
    const { sec } = ev;
    if (!parityOk(ev.b1) || !parityOk(ev.b2)) {
      parityErrors++;
      if (!parityOk(ev.b1)) { lastCtrl = null; continue; }
    }
    const b1 = ev.b1 & 0x7f;
    const b2 = ev.b2 & 0x7f;
    if (b1 === 0 && b2 === 0) { lastCtrl = null; continue; }

    if (b1 >= 0x10 && b1 <= 0x1f) {
      if (lastCtrl && lastCtrl[0] === b1 && lastCtrl[1] === b2) { lastCtrl = null; continue; }
      lastCtrl = [b1, b2];
      channel = b1 & 0x08 ? 1 : 0;
      if (channel !== 0) { otherChannelPairs++; continue; }
      const hi = b1 & 0x07 | 0x10;

      if ((hi === 0x14 || hi === 0x15) && b2 >= 0x20 && b2 <= 0x2f) {
        switch (b2) {
          case CMD.RCL: mode = 'pop'; italic = false; break;
          case CMD.BS: if (col > 0) { col--; const c = target()[row]; if (c) c.chars[col] = ' '; } break;
          case CMD.DER: { const c = target()[row]; if (c) { c.chars.length = col; c.italic.length = col; } break; }
          case CMD.RU2: case CMD.RU3: case CMD.RU4:
            mode = 'roll'; rollRows = b2 - CMD.RU2 + 2; row = 15; col = 0; italic = false; rollLine = null; break;
          case CMD.RDC: mode = 'paint'; italic = false; break;
          case CMD.EDM:
            if (mode === 'roll' && rollLine) {
              const partial = gridTextRow(displayed[row]);
              if (partial) cues.push({ id: newCueId(), startSec: rollLine.start, endSec: sec, text: partial });
              rollLine = null;
            }
            displayed = [];
            close(sec);
            break;
          case CMD.ENM: hidden = []; break;
          case CMD.CR:
            if (mode === 'roll') {
              const finished = gridTextRow(displayed[row]);
              if (finished && rollLine) cues.push({ id: newCueId(), startSec: rollLine.start, endSec: sec, text: finished });
              rollLine = null;
              const next: Grid = [];
              for (let r = row - rollRows + 2; r <= row; r++) if (displayed[r]) next[r - 1] = displayed[r];
              displayed = next;
              col = 0;
              italic = false;
            }
            break;
          case CMD.EOC: {
            const swap = displayed; displayed = hidden; hidden = swap;
            mode = 'pop';
            showDisplayed(sec);
            break;
          }
        }
        if (mode === 'paint') showDisplayed(sec);
        continue;
      }
      if ((hi === 0x17 || hi === 0x1f) && b2 >= 0x21 && b2 <= 0x23) { col = Math.min(COLS - 1, col + (b2 - 0x20)); continue; }
      if (hi === 0x11 && b2 >= 0x30 && b2 <= 0x3f) {
        const ch = [...SPECIAL][b2 - 0x30];
        write(ch, sec);
        if (mode === 'paint') showDisplayed(sec);
        continue;
      }
      if ((hi === 0x12 || hi === 0x13) && b2 >= 0x20 && b2 <= 0x3f) {
        if (col > 0) col--; // extended codes replace the fallback character before them
        write([...(hi === 0x12 ? EXT_12 : EXT_13)][b2 - 0x20], sec);
        if (mode === 'paint') showDisplayed(sec);
        continue;
      }
      if (hi === 0x11 && b2 >= 0x20 && b2 <= 0x2f) { // mid-row: takes one cell, sets style
        italic = b2 === 0x2e || b2 === 0x2f;
        write(' ', sec);
        continue;
      }
      if (b2 >= 0x40 && b2 <= 0x7f) { // preamble address
        const rowHi = hi;
        const highRange = (b2 & 0x20) !== 0;
        let found = 15;
        for (let r = 1; r <= 15; r++) if (ROW_HI[r] === rowHi && ROW_LOW_HIGH[r] === highRange) { found = r; break; }
        if (mode !== 'roll') row = found;
        const low = b2 & 0x1f;
        italic = low === 0x0e || low === 0x0f;
        col = low >= 0x10 ? ((low >> 1) & 0x07) * 4 : 0;
        if (mode === 'roll') col = low >= 0x10 ? ((low >> 1) & 0x07) * 4 : 0;
        continue;
      }
      continue;
    }

    lastCtrl = null;
    if (channel !== 0) { otherChannelPairs++; continue; }
    for (const b of [b1, b2]) {
      if (b < 0x20) continue;
      write(BASIC_DIFF[b] ?? String.fromCharCode(b), sec);
    }
    if (mode === 'paint') showDisplayed(sec);
  }

  const last = events.length ? events[events.length - 1].sec : 0;
  close(Math.max(last, open ? (open as { start: number }).start + 3 : 0));

  const warnings: string[] = [];
  if (parityErrors) warnings.push(`${parityErrors} byte pair${parityErrors === 1 ? '' : 's'} failed parity.`);
  if (otherChannelPairs) warnings.push('This file also has captions on CC2. Only CC1 is shown.');
  cues.sort((a, b) => a.startSec - b.startSec);
  // Paint-on grows a character at a time; report the finished line, from when it began.
  const merged: CaptionCue[] = [];
  for (const c of cues) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.endSec - c.startSec) < 0.001 && c.text.startsWith(prev.text)) merged[merged.length - 1] = { ...c, startSec: prev.startSec };
    else merged.push(c);
  }
  return { cues: merged, warnings, parityErrors, otherChannelPairs };
}

function gridTextRow(row: CellRow | undefined): string {
  if (!row) return '';
  return gridText([undefined, row]);
}
