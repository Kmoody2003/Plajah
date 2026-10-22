// Printer's marks — crop, bleed, registration, colour bar and job slug, laid out around one page.
//
// Geometry only (inches, origin TOP-LEFT of the media); pressPdf.ts draws it. Conventions follow common
// prepress defaults (0.25in marks, 0.1875in offset, 4 registration targets at side midpoints, a CMYK
// solid / overprint / 50% tint bar). Marks are never drawn inside the bleed box: an offset smaller than
// the bleed is clamped up to it. A real colour bar for press control (density/dot-gain patches per ISO
// 12647) is printer-specific; this one is a visual check strip, not a measurement target. Pure TS, no I/O.

import type { MarkOptions, RectIn } from './types';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export const MARK_LENGTH_IN = 0.25;
export const SLUG_SPACE_IN = 0.25;
const REG_RADIUS_IN = 0.09375;

export interface MarkLine { x1: number; y1: number; x2: number; y2: number; kind: 'crop' | 'bleed' }
export interface Cmyk { c: number; m: number; y: number; k: number }
export interface PrinterMarks {
  mediaIn: [number, number];
  trimBox: RectIn;
  bleedBox: RectIn;
  lines: MarkLine[];
  registration: Array<{ cx: number; cy: number; r: number }>;
  colorBar?: { x: number; y: number; patchIn: number; patches: Cmyk[] };
  /** Text baseline position. */
  slug?: { x: number; y: number; text: string };
  notes: string[];
}

export const COLOR_BAR_PATCHES: Cmyk[] = [
  { c: 100, m: 0, y: 0, k: 0 }, { c: 0, m: 100, y: 0, k: 0 }, { c: 0, m: 0, y: 100, k: 0 }, { c: 0, m: 0, y: 0, k: 100 },
  { c: 100, m: 100, y: 0, k: 0 }, { c: 100, m: 0, y: 100, k: 0 }, { c: 0, m: 100, y: 100, k: 0 }, { c: 100, m: 100, y: 100, k: 0 },
  { c: 50, m: 0, y: 0, k: 0 }, { c: 0, m: 50, y: 0, k: 0 }, { c: 0, m: 0, y: 50, k: 0 }, { c: 0, m: 0, y: 0, k: 50 },
];

export function printerMarks(params: { trimIn: [number, number]; bleedIn: number; marks: MarkOptions; slugText?: string }): PrinterMarks {
  const [tw, th] = params.trimIn;
  const bleed = Math.max(0, params.bleedIn);
  const m = params.marks;
  const notes: string[] = [];
  const off = Math.max(m.offsetIn, bleed);
  if (off > m.offsetIn) notes.push(`Mark offset ${m.offsetIn}in is inside the ${bleed}in bleed; clamped to ${bleed}in.`);
  const slugSpace = m.slug ? SLUG_SPACE_IN : 0;
  const margin = bleed + off + MARK_LENGTH_IN + slugSpace;
  const mediaIn: [number, number] = [r4(tw + 2 * margin), r4(th + 2 * margin)];
  const trimBox: RectIn = { x: r4(margin), y: r4(margin), w: tw, h: th };
  const bleedBox: RectIn = { x: r4(margin - bleed), y: r4(margin - bleed), w: r4(tw + 2 * bleed), h: r4(th + 2 * bleed) };
  const L = trimBox.x, T = trimBox.y, R = L + tw, B = T + th;
  const lines: MarkLine[] = [];

  // 8 crop marks: at each corner, one horizontal and one vertical, starting `off` outside the trim.
  const corner = (xs: number[], ys: number[], kind: MarkLine['kind'], o: number) => {
    for (const [x, sx] of [[xs[0], -1], [xs[1], 1]]) for (const [y, sy] of [[ys[0], -1], [ys[1], 1]]) {
      lines.push({ kind, x1: r4(x + sx * o), y1: r4(y), x2: r4(x + sx * (o + MARK_LENGTH_IN)), y2: r4(y) });
      lines.push({ kind, x1: r4(x), y1: r4(y + sy * o), x2: r4(x), y2: r4(y + sy * (o + MARK_LENGTH_IN)) });
    }
  };
  if (m.crop) corner([L, R], [T, B], 'crop', off);
  // Bleed marks sit on the bleed edges, starting at the same distance outside the trim as crops (never inside the bleed box).
  if (m.bleed && bleed > 0) corner([L - bleed, R + bleed], [T - bleed, B + bleed], 'bleed', off - bleed);

  const markMid = off + MARK_LENGTH_IN / 2; // centre of the mark band, from the trim
  const registration = m.registration ? [
    { cx: r4(L + tw / 2), cy: r4(T - markMid), r: REG_RADIUS_IN },
    { cx: r4(L + tw / 2), cy: r4(B + markMid), r: REG_RADIUS_IN },
    { cx: r4(L - markMid), cy: r4(T + th / 2), r: REG_RADIUS_IN },
    { cx: r4(R + markMid), cy: r4(T + th / 2), r: REG_RADIUS_IN },
  ] : [];

  let colorBar: PrinterMarks['colorBar'];
  if (m.colorBar) {
    // Top mark band, right of the centre registration target, inset from the corner crops.
    const startX = L + tw / 2 + REG_RADIUS_IN + 0.125;
    const room = R - 0.125 - startX;
    const patchIn = Math.min(0.1875, MARK_LENGTH_IN, room / COLOR_BAR_PATCHES.length);
    if (patchIn >= 0.0625) colorBar = { x: r4(startX), y: r4(T - off - patchIn), patchIn: r4(patchIn), patches: COLOR_BAR_PATCHES };
    else notes.push('Page too narrow for a colour bar; omitted.');
  }

  const slug = m.slug ? { x: bleedBox.x, y: r4(mediaIn[1] - slugSpace * 0.35), text: params.slugText ?? '' } : undefined;
  return { mediaIn, trimBox, bleedBox, lines, registration, colorBar, slug, notes };
}
