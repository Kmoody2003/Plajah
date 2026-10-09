// bookText — measure and wrap showcase-book story text with REAL font metrics so no word is ever cut off or overflows.
//
// The width tables (bookTextMetrics.ts) were measured in Chrome for the four fonts the picture-book designers use. Text is wrapped to a
// maximum width, stacked as paragraphs (one paragraph per "\n" in the story data), and the largest size that fits the box is chosen. If the
// text cannot fit even at the minimum size the function THROWS: a page must never silently truncate the story.
import { BOOK_FONT_WIDTHS } from './bookTextMetrics';

export type BookFont = 'fraunces' | 'caveat' | 'caveatBrush' | 'sniglet';
/** Safety margin over the measured width (kerning, optical-size drift, renderer differences). */
const MARGIN = 1.045;

export function textWidth(str: string, size: number, font: BookFont): number {
  const t = BOOK_FONT_WIDTHS[font]; let w = 0;
  for (const ch of str) { const c = ch.charCodeAt(0); w += (c >= 32 && c < 127 ? t[c - 32] : 60) / 100; }
  return w * size * MARGIN;
}

/** Greedy word wrap of one paragraph to maxW. */
export function wrapPara(para: string, size: number, font: BookFont, maxW: number): string[] {
  const words = para.split(/\s+/).filter(Boolean); const lines: string[] = []; let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (line && textWidth(probe, size, font) > maxW) { lines.push(line); line = w; } else line = probe;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export interface TextFit {
  size: number;
  /** One entry per story paragraph: its wrapped lines. */
  paras: string[][];
  leading: number;
  gap: number;
  /** Total block height. */
  h: number;
  /** Widest wrapped line. */
  w: number;
}
export interface FitOpts {
  max: number; min?: number; leading?: number; gapEm?: number;
  /** Prefer every story line (paragraph) on ONE line: tried first, accepted only at this size or larger; otherwise paragraphs wrap normally. */
  oneLineAtLeast?: number;
}

/** Pick the largest size in [min,max] at which the paragraphs wrap inside maxW x maxH. Throws if even `min` does not fit. */
export function fitParas(str: string, font: BookFont, maxW: number, maxH: number, o: FitOpts): TextFit {
  const min = o.min ?? 20; const leading = o.leading ?? 1.3; const gapEm = o.gapEm ?? .3;
  const paras = str.split('\n').map(s => s.trim()).filter(Boolean);
  const passes: Array<'one' | 'wrap'> = o.oneLineAtLeast ? ['one', 'wrap'] : ['wrap'];
  for (const pass of passes) for (let size = o.max; size >= (pass === 'one' ? Math.max(min, o.oneLineAtLeast ?? min) : min); size -= 1) {
    const wrapped = paras.map(p => wrapPara(p, size, font, maxW));
    if (pass === 'one' && wrapped.some(l => l.length > 1)) continue;
    const lineCount = wrapped.reduce((a, l) => a + l.length, 0);
    const gap = size * gapEm;
    const h = size + (lineCount - 1) * size * leading + (paras.length - 1) * gap;
    const w = Math.max(...wrapped.flat().map(l => textWidth(l, size, font)));
    if (h <= maxH && w <= maxW + .5) return { size, paras: wrapped, leading, gap, h, w };
  }
  throw new Error(`bookText: "${str.slice(0, 40)}..." does not fit ${Math.round(maxW)}x${Math.round(maxH)} at ${min}px (${font})`);
}

/** Height of one wrapped paragraph block. */
export const paraHeight = (lines: string[], size: number, leading: number): number => size + (lines.length - 1) * size * leading;

// ── Mixed typography: serif narration + handwritten dialogue (the watercolour book's treatment) ──
export interface MixedItem { hand: boolean; size: number; lines: string[]; h: number; leading: number }
export interface MixedFit { size: number; items: MixedItem[]; gap: number; h: number; w: number }
export interface MixedOpts { max: number; min?: number; leading?: number; handLeading?: number; handScale?: number; gapEm?: number; allHand?: boolean }

/** Which story paragraphs are spoken: those that open with a quotation mark, or continue a quotation left open by the paragraph before. */
export function handParagraphs(paras: string[], allHand = false): boolean[] {
  let open = false;
  return paras.map(p => { const hand = allHand || p.startsWith('"') || open; if (((p.match(/"/g) || []).length % 2) === 1) open = !open; return hand; });
}

/** Fit narration (serif italic) and dialogue (handwritten) paragraphs in maxW x maxH; the largest serif size that fits. Throws rather than truncating. */
export function fitMixed(str: string, maxW: number, maxH: number, o: MixedOpts): MixedFit {
  const min = o.min ?? 22; const lead = o.leading ?? 1.32, hlead = o.handLeading ?? 1.12, hs = o.handScale ?? 1.2, gapEm = o.gapEm ?? .3;
  const paras = str.split('\n').map(s => s.trim()).filter(Boolean); const hand = handParagraphs(paras, o.allHand);
  for (let size = o.max; size >= min; size -= 1) {
    const items: MixedItem[] = paras.map((p, k) => {
      const s = hand[k] ? Math.round(size * hs) : size; const lines = wrapPara(p, s, hand[k] ? 'caveat' : 'fraunces', maxW); const l = hand[k] ? hlead : lead;
      return { hand: hand[k], size: s, lines, h: s + (lines.length - 1) * s * l, leading: l };
    });
    const gap = size * gapEm; const h = items.reduce((a, it) => a + it.h, 0) + (items.length - 1) * gap;
    const w = Math.max(...items.flatMap(it => it.lines.map(l => textWidth(l, it.size, it.hand ? 'caveat' : 'fraunces'))));
    if (h <= maxH && w <= maxW + .5) return { size, items, gap, h, w };
  }
  throw new Error(`bookText: "${str.slice(0, 40)}..." does not fit ${Math.round(maxW)}x${Math.round(maxH)} at ${min}px (mixed)`);
}
