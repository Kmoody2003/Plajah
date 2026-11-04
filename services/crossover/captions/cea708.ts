// CEA-708 DTVCC, service 1: an encoder and a decoder. Same pop-on idea as 608: each caption is built
// in a hidden window ahead of time, and a show/hide command lands on the exact start frame. Two
// windows alternate so the outgoing caption stays up until the swap.

import { newCueId, stripMarkup, type CaptionCue } from './model';
import { wrapLines } from './cea608';

const C1 = { CW0: 0x80, CLW: 0x88, DSW: 0x89, HDW: 0x8a, TGW: 0x8b, DLW: 0x8c, DLY: 0x8d, DLC: 0x8e, RST: 0x8f, SPA: 0x90, SPC: 0x91, SPL: 0x92, SWA: 0x97, DF0: 0x98 };

// G2 is reached through EXT1 (0x10).
const G2: Record<string, number> = { '…': 0x25, 'Š': 0x2a, 'Œ': 0x2c, '█': 0x30, '‘': 0x31, '’': 0x32, '“': 0x33, '”': 0x34, '•': 0x35, '™': 0x39, 'š': 0x3a, 'œ': 0x3c, '℠': 0x3d, 'Ÿ': 0x3f };
const G2_REV = new Map(Object.entries(G2).map(([k, v]) => [v, k]));

const encodeChar = (ch: string): number[] => {
  const c = ch.codePointAt(0)!;
  if (ch === '♪') return [0x7f];
  if (c >= 0x20 && c <= 0x7e) return [c];
  if (c >= 0xa0 && c <= 0xff) return [c];
  if (ch in G2) return [0x10, G2[ch]];
  if (ch === '—' || ch === '–') return [0x2d];
  return [0x20];
};

/** Atomic pieces of a window's content. A command is never split across service blocks. */
function textTokens(line: string): number[][] {
  const tokens: number[][] = [];
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('<i>', i)) { tokens.push([C1.SPA, 0x05, 0x80]); i += 3; continue; }
    if (line.startsWith('</i>', i)) { tokens.push([C1.SPA, 0x05, 0x00]); i += 4; continue; }
    if (line[i] === '<') {
      const close = line.indexOf('>', i);
      if (close > i) { i = close + 1; continue; }
    }
    const ch = String.fromCodePoint(line.codePointAt(i)!);
    i += ch.length;
    tokens.push(encodeChar(ch));
  }
  return tokens;
}

function defineWindow(win: number, rows: number, cols: number): number[] {
  return [
    C1.DF0 + win,
    0x08, // hidden, column lock, priority 0
    0x80 | 90, // relative positioning, anchor 90% down
    50, // anchor 50% across
    (7 << 4) | (rows - 1), // anchor point bottom-centre
    cols - 1,
    (1 << 3) | 1, // default window and pen styles
  ];
}

/** A window of DTVCC packets by frame. `tokens` are packed into service blocks by the frame builder. */
export interface Dtvcc708 {
  /** Frame index -> the raw packet bytes queued at that frame. */
  frames: Map<number, number[]>;
}

const BLOCK_MAX = 31;

function packet(seq: number, service: number, payload: number[]): number[] {
  const body = [(service << 5) | payload.length, ...payload];
  // A packet is header + (size_code * 2 - 1) bytes; pad with the null service block.
  while ((body.length + 1) % 2) body.push(0);
  const sizeCode = (body.length + 1) / 2;
  return [((seq & 3) << 6) | (sizeCode & 0x3f), ...body];
}

/**
 * Encode cues into 708 packets on the frame grid of the output file.
 * @param frameOf converts seconds to the output frame index
 * @param bytesPerFrame what the CDP has room for at this rate after the 608 triples
 */
export function encode708(cues: CaptionCue[], frameOf: (sec: number) => number, bytesPerFrame: number): Dtvcc708 {
  const frames = new Map<number, number[]>();
  let seq = 0;
  const room = (f: number) => bytesPerFrame - (frames.get(f)?.length ?? 0);
  // Commands that must land on their frame go in first, so a later load can't push them.
  const queueAt = (frame: number, payload: number[]) => {
    const p = packet(seq++, 1, payload);
    let f = frame;
    while (room(f) < p.length) f++;
    frames.set(f, [...(frames.get(f) ?? []), ...p]);
    return f;
  };

  const blockLimit = Math.max(4, Math.min(BLOCK_MAX, bytesPerFrame - 2));
  const sorted = [...cues].sort((a, b) => a.startSec - b.startSec);

  sorted.forEach((cue, i) => {
    const start = frameOf(cue.startSec);
    const next = sorted[i + 1];
    const win = i % 2;
    const showBits = 1 << win;
    const otherBits = 1 << (1 - win);
    queueAt(start, [C1.HDW, otherBits, C1.DSW, showBits]);
    const end = frameOf(cue.endSec);
    if (!next || frameOf(next.startSec) > end + 2) queueAt(end, [C1.HDW, showBits, C1.CLW, showBits]);
  });

  // Now the hidden builds, in the free space just before each swap.
  sorted.forEach((cue, i) => {
    const start = frameOf(cue.startSec);
    const win = i % 2;
    const lines = wrapLines(cue.text);
    const cols = Math.max(1, ...lines.map(l => stripMarkup(l).length));
    const tokens: number[][] = [[C1.DLW, 1 << win], defineWindow(win, lines.length, cols), [C1.CW0 + win]];
    lines.forEach((line, li) => {
      if (li > 0) tokens.push([0x0d]);
      tokens.push(...textTokens(line));
    });

    const blocks: number[][] = [];
    let cur: number[] = [];
    for (const t of tokens) {
      if (cur.length + t.length > blockLimit) { blocks.push(cur); cur = []; }
      cur.push(...t);
    }
    if (cur.length) blocks.push(cur);

    // Latest frames that still fit before the swap, in order, without overtaking the previous cue.
    const prevStart = i > 0 ? frameOf(sorted[i - 1].startSec) : -1;
    let f = Math.max(prevStart + 1, start - blocks.length);
    for (const block of blocks) {
      f = Math.max(0, f);
      const used = queueAt(f, block);
      f = used + 1;
    }
  });

  return { frames };
}

/** Lay queued packet bytes into cc_data triples (cc_type 3 opens a packet, 2 continues it). */
export function packetBytesToTriples(bytes: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const size = packetLength(bytes[i]);
    const end = i + size;
    let first = true;
    for (; i < end; i += 2) {
      out.push(first ? 0xff : 0xfe, bytes[i], bytes[i + 1] ?? 0);
      first = false;
    }
  }
  return out;
}

const packetLength = (header: number) => {
  const code = header & 0x3f;
  return code === 0 ? 128 : code * 2;
};

// ── Decoder ─────────────────────────────────────────────────────────────────

interface Win { visible: boolean; lines: string[]; italic: boolean }

export type TripleEvent = { sec: number; ccType: number; b1: number; b2: number };

export interface Decoded708 { cues: CaptionCue[]; warnings: string[]; badPackets: number }

export function decode708(events: TripleEvent[], service = 1): Decoded708 {
  const windows: (Win | undefined)[] = [];
  let current = 0;
  const cues: CaptionCue[] = [];
  let open: { start: number; text: string } | null = null;
  let badPackets = 0;
  let packetBuf: number[] = [];
  let packetSec = 0;

  const visibleText = () => windows
    .filter((w): w is Win => !!w && w.visible)
    .map(w => w.lines.map(l => l.trimEnd()).join('\n'))
    .filter(Boolean)
    .join('\n');

  const refresh = (sec: number) => {
    const text = visibleText();
    if (open && open.text === text) return;
    if (open && sec > open.start) cues.push({ id: newCueId(), startSec: open.start, endSec: sec, text: open.text });
    open = text ? { start: sec, text } : null;
  };

  const eachWindow = (bits: number, fn: (w: Win, i: number) => void) => {
    for (let i = 0; i < 8; i++) if (bits & (1 << i) && windows[i]) fn(windows[i]!, i);
  };

  const put = (ch: string) => {
    const w = windows[current];
    if (!w) return;
    if (!w.lines.length) w.lines.push('');
    w.lines[w.lines.length - 1] += ch;
  };

  const runBlock = (d: number[], sec: number) => {
    let i = 0;
    while (i < d.length) {
      const c = d[i++];
      if (c === 0x10) { // EXT1
        const e = d[i++];
        if (e >= 0x20 && e <= 0x3f) put(G2_REV.get(e) ?? ' ');
        continue;
      }
      if (c === 0x0d) { windows[current]?.lines.push(''); continue; }
      if (c === 0x0c) { const w = windows[current]; if (w) w.lines = []; refresh(sec); continue; }
      if (c === 0x08) { const w = windows[current]; if (w?.lines.length) { const l = w.lines.length - 1; w.lines[l] = w.lines[l].slice(0, -1); } continue; }
      if (c < 0x20) continue;
      if (c >= C1.CW0 && c <= C1.CW0 + 7) { current = c - C1.CW0; continue; }
      if (c === 0x7f) { put('♪'); continue; }
      if (c <= 0x7e) { put(String.fromCharCode(c)); continue; }
      if (c >= 0xa0) { put(String.fromCharCode(c)); continue; }
      switch (c) {
        case C1.CLW: eachWindow(d[i++], w => { w.lines = []; }); refresh(sec); break;
        case C1.DSW: eachWindow(d[i++], w => { w.visible = true; }); refresh(sec); break;
        case C1.HDW: eachWindow(d[i++], w => { w.visible = false; }); refresh(sec); break;
        case C1.TGW: eachWindow(d[i++], w => { w.visible = !w.visible; }); refresh(sec); break;
        case C1.DLW: { const bits = d[i++]; for (let w = 0; w < 8; w++) if (bits & (1 << w)) windows[w] = undefined; refresh(sec); break; }
        case C1.DLY: case C1.DLC: i += c === C1.DLY ? 1 : 0; break;
        case C1.RST: windows.length = 0; refresh(sec); break;
        case C1.SPA: {
          i++;
          const flags = d[i++] ?? 0;
          const w = windows[current];
          if (w) {
            const on = !!(flags & 0x80);
            if (on !== w.italic) { put(on ? '<i>' : '</i>'); w.italic = on; }
          }
          break;
        }
        case C1.SPC: i += 3; break;
        case C1.SPL: i += 2; break;
        case C1.SWA: i += 4; break;
        default:
          if (c >= C1.DF0 && c <= C1.DF0 + 7) {
            const win = c - C1.DF0;
            const visible = !!((d[i] ?? 0) & 0x20);
            i += 6;
            if (!windows[win]) windows[win] = { visible, lines: [], italic: false };
            else windows[win]!.visible = visible;
            current = win;
            refresh(sec);
          }
      }
    }
  };

  const runPacket = (p: number[], sec: number) => {
    let i = 1;
    while (i < p.length) {
      const h = p[i++];
      if (h === 0) break;
      let svc = h >> 5;
      const size = h & 0x1f;
      if (svc === 7) svc = (p[i++] ?? 0) & 0x3f;
      if (i + size > p.length) { badPackets++; return; }
      if (svc === service) runBlock(p.slice(i, i + size), sec);
      i += size;
    }
  };

  const flush = () => {
    if (!packetBuf.length) return;
    const want = packetLength(packetBuf[0]);
    if (packetBuf.length >= want) runPacket(packetBuf.slice(0, want), packetSec);
    else badPackets++;
    packetBuf = [];
  };

  for (const ev of events) {
    if (ev.ccType === 3) { flush(); packetBuf = [ev.b1, ev.b2]; packetSec = ev.sec; }
    else if (ev.ccType === 2 && packetBuf.length) packetBuf.push(ev.b1, ev.b2);
    if (packetBuf.length && packetBuf.length >= packetLength(packetBuf[0])) flush();
  }
  flush();

  const last = events.length ? events[events.length - 1].sec : 0;
  if (open) {
    const o = open as { start: number; text: string };
    cues.push({ id: newCueId(), startSec: o.start, endSec: Math.max(last, o.start + 1), text: o.text });
  }
  const warnings = badPackets ? [`${badPackets} incomplete DTVCC packet${badPackets === 1 ? '' : 's'}.`] : [];
  return { cues, warnings, badPackets };
}
