// Scenarist SCC: CEA-608 pairs as hex words on timecode lines. One pair per frame at 29.97.

import { decode608, encodePopOn, secToSlot, slotToSec, type EncodeOptions, type LateCue, type PairEvent } from './cea608';
import type { CaptionCue, CaptionDoc } from './model';
import { frameToSec, frameToTc, rateById, tcToFrame, type FrameRate } from './timecode';

export interface SccOptions extends EncodeOptions {
  /** 29.97df (default) or 29.97ndf. */
  rateId?: string;
  /** Timecode of the video's first frame, e.g. 01:00:00;00. */
  startTc?: string;
}

export interface WrittenBroadcast { text: string; late: LateCue[]; unsupported: string[]; encodedCues: CaptionCue[]; rate: FrameRate; startFrame: number }

const hex2 = (b: number) => b.toString(16).padStart(2, '0');

export function writeScc(cues: CaptionCue[], opts: SccOptions = {}): WrittenBroadcast {
  const rate = rateById(opts.rateId === '29.97ndf' ? '29.97ndf' : '29.97df');
  const startFrame = opts.startTc ? tcToFrame(opts.startTc, rate) ?? 0 : 0;
  const enc = encodePopOn(cues, opts);
  const slots = [...enc.slots.keys()].sort((a, b) => a - b);
  const lines: string[] = ['Scenarist_SCC V1.0', ''];
  let i = 0;
  while (i < slots.length) {
    const first = slots[i];
    const words: string[] = [];
    let s = first;
    // A new line starts at each gap, at 32 words, and at each End Of Caption or Erase Display. Some
    // readers stamp a whole line with its first timecode, so the moment a caption changes must lead a line.
    while (i < slots.length && slots[i] === s && words.length < 32) {
      const [b1, b2] = enc.slots.get(s)!;
      const prev = enc.slots.get(s - 1);
      const isTimed = b1 === 0x94 && (b2 === 0x2f || b2 === 0x2c);
      const isRepeat = prev && prev[0] === b1 && prev[1] === b2;
      if (words.length && isTimed && !isRepeat) break;
      words.push(hex2(b1) + hex2(b2));
      i++; s++;
    }
    lines.push(`${frameToTc(first + startFrame, rate)}\t${words.join(' ')}`, '');
  }
  return { text: lines.join('\n'), late: enc.late, unsupported: enc.unsupported, encodedCues: enc.cues, rate, startFrame };
}

export interface SccReadOptions {
  /** Timecode to subtract so that times count from the video's first frame. */
  startTc?: string;
  /** Force a rate. By default `;` means 29.97 drop and `:` means 29.97 non-drop. */
  rateId?: string;
}

export function parseScc(text: string, opts: SccReadOptions = {}): CaptionDoc {
  const warnings: string[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (!/^Scenarist_SCC V1\.0/i.test(lines[0]?.trim() || '')) warnings.push('Missing the "Scenarist_SCC V1.0" header.');

  const first = lines.find(l => /^\d{2}:\d{2}:\d{2}[:;]\d{2}/.test(l));
  const rate = rateById(opts.rateId || (first && first.includes(';') ? '29.97df' : '29.97ndf'));
  const offset = opts.startTc ? tcToFrame(opts.startTc, rate) ?? 0 : 0;

  const events: PairEvent[] = [];
  let firstFrame: number | undefined;
  for (const raw of lines) {
    const m = /^(\d{2}:\d{2}:\d{2}[:;]\d{2})\s+(.+)$/.exec(raw.trim());
    if (!m) continue;
    const frame = tcToFrame(m[1], rate);
    if (frame === null) continue;
    firstFrame ??= frame;
    m[2].trim().split(/\s+/).forEach((word, i) => {
      if (!/^[0-9a-f]{4}$/i.test(word)) { warnings.push(`Skipped an unreadable word "${word}" at ${m[1]}.`); return; }
      events.push({
        sec: frameToSec(frame + i - offset, rate),
        b1: parseInt(word.slice(0, 2), 16),
        b2: parseInt(word.slice(2), 16),
      });
    });
  }
  const dec = decode608(events);
  return {
    cues: dec.cues,
    sourceFormat: 'scc',
    warnings: [...warnings, ...dec.warnings],
    rateId: rate.id,
    firstTimecodeSec: firstFrame !== undefined ? frameToSec(firstFrame, rate) : undefined,
  };
}

export { secToSlot, slotToSec };
