// Print-spec engine: trim sizes, paper, binding, spine width, margins, cover wrap dimensions, preflight.
// Pure TS, no I/O. Every figure carries a `verified` flag + a source so the UI/docs never overclaim.
//
// SOURCES (fetched 2026-10-08 unless noted):
//  [LULU-SPINE]  https://help.api.lulu.com/en/support/solutions/articles/64000254616-how-is-spine-width-calculated-
//                Perfect bound: pages/444 + 0.06 in (444 PPI standard paper), pages/460 + 0.06 for 460 PPI paper.
//                Hardcover casewrap: lookup table (below). Saddle stitch / coil: no spine.
//  [KDP-SPINE]   https://kdp.amazon.com/en_US/help/topic/G201953020  (per page: white 0.002252, cream 0.0025,
//                premium color 0.002347, standard color 0.002252; bleed 0.125 in; spine text needs >= 79 pages, Cover Creator 80).
//  [INGRAM-SPINE] third-party summary (bookdesigner.ai/guides/book-spine-width) of IngramSpark's generator: 50lb white
//                0.002252, 50lb creme 0.0025, page count rounded up to even. NOT fetched from Ingram itself => verified:false.
//  [KDP-MARGINS] KDP inside-margin (gutter) table by page count: written from memory of KDP's published table, NOT
//                re-fetched this session => treated as a conservative default (verified:false).
//  Lulu hardcover cover-wrap dimensions and Lulu page-count minimums were NOT verified: the real Lulu
//  /cover-dimensions endpoint (LuluProvider.coverDimensions) must be used for any real order.

import type { BindingType, PaperColor, PaperWeight, PrinterId, Sourced } from './podTypes';

export const BLEED_IN = 0.125;
export const DPI = 300;
export const OUTSIDE_SAFE_IN = 0.375;       // keep live text this far from trim (0.25 min + bleed allowance)
export const TOP_BOTTOM_SAFE_IN = 0.5;

export interface TrimSize { id: string; label: string; wIn: number; hIn: number; luluCode?: string; common: string }
export const TRIM_SIZES: TrimSize[] = [
  { id: '5x8',     label: '5 x 8 in',        wIn: 5,    hIn: 8,   luluCode: '0500X0800', common: 'Novels, memoir' },
  { id: '5.25x8',  label: '5.25 x 8 in',     wIn: 5.25, hIn: 8,   luluCode: '0525X0800', common: 'Trade fiction' },
  { id: '5.5x8.5', label: '5.5 x 8.5 in',    wIn: 5.5,  hIn: 8.5, luluCode: '0550X0850', common: 'Digest, non-fiction' },
  { id: '6x9',     label: '6 x 9 in',        wIn: 6,    hIn: 9,   luluCode: '0600X0900', common: 'US trade, non-fiction' },
  { id: '7x10',    label: '7 x 10 in',       wIn: 7,    hIn: 10,  common: 'Textbooks, workbooks' },
  { id: '8x10',    label: '8 x 10 in',       wIn: 8,    hIn: 10,  common: 'Illustrated' },
  { id: '8.5x11',  label: '8.5 x 11 in',     wIn: 8.5,  hIn: 11,  luluCode: '0850X1100', common: 'Letter, workbooks, comics' },
];
export function getTrim(id: string): TrimSize {
  const t = TRIM_SIZES.find(t => t.id === id);
  if (!t) throw new Error(`Unknown trim size: ${id}`);
  return t;
}

export interface BindingInfo { id: BindingType; label: string; hasSpine: boolean; blurb: string }
export const BINDINGS: BindingInfo[] = [
  { id: 'PERFECT_PAPERBACK',  label: 'Paperback (perfect bound)', hasSpine: true,  blurb: 'Standard glued softcover.' },
  { id: 'HARDCOVER_CASEWRAP', label: 'Hardcover (case wrap)',     hasSpine: true,  blurb: 'Printed case wrapped over boards; no dust jacket.' },
  { id: 'SADDLE_STITCH',      label: 'Saddle stitch (stapled)',   hasSpine: false, blurb: 'Short booklets only; no spine.' },
];

export interface PaperInfo { color: PaperColor; weight: PaperWeight; label: string }
export const PAPER_OPTIONS: PaperInfo[] = [
  { color: 'white', weight: 50, label: '50 lb white' },
  { color: 'cream', weight: 50, label: '50 lb cream' },
  { color: 'white', weight: 60, label: '60 lb white' },
  { color: 'cream', weight: 60, label: '60 lb cream' },
  { color: 'white', weight: 80, label: '80 lb white (coated, color)' },
];

/** Lulu casewrap spine lookup [LULU-SPINE]: [maxPagesInclusive, inches]. */
export const LULU_HARDCOVER_SPINE: Array<[number, number]> = [
  [84, 0.25], [140, 0.5], [168, 0.625], [194, 0.6875], [222, 0.75], [250, 0.8125], [278, 0.875], [306, 0.9375],
  [334, 1], [360, 1.0625], [388, 1.125], [416, 1.1875], [444, 1.25], [472, 1.3125], [500, 1.375], [528, 1.4375],
  [556, 1.5], [582, 1.5625], [610, 1.625], [638, 1.6875], [666, 1.75], [694, 1.8125], [722, 1.875], [750, 1.9375],
  [778, 2], [800, 2.0625],
];

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function spineWidthIn(printer: PrinterId, binding: BindingType, pages: number, paperColor: PaperColor, paperWeight: PaperWeight): Sourced<number | null> {
  if (binding === 'SADDLE_STITCH') return { value: 0, verified: true, source: '[LULU-SPINE] saddle stitch has no spine' };
  if (printer === 'lulu') {
    if (binding === 'PERFECT_PAPERBACK') {
      const std = paperWeight === 60;
      return { value: round4(pages / 444 + 0.06), verified: std, source: std ? '[LULU-SPINE] pages/444 + 0.06' : '[LULU-SPINE] formula applied to a non-60# stock: estimate, use Lulu cover template' };
    }
    if (pages < 24) return { value: null, verified: true, source: '[LULU-SPINE] hardcover needs >= 24 pages' };
    const row = LULU_HARDCOVER_SPINE.find(([max]) => pages <= max);
    return row ? { value: row[1], verified: true, source: '[LULU-SPINE] hardcover table' } : { value: null, verified: true, source: 'over 800 pages' };
  }
  if (printer === 'ingramspark' || printer === 'kdp') {
    if (binding === 'HARDCOVER_CASEWRAP') return { value: null, verified: false, source: 'Hardcover spine comes from the printer cover-template generator (stepped table); not encoded' };
    const per = paperColor === 'cream' ? 0.0025 : 0.002252;
    const eff = printer === 'ingramspark' ? pages + (pages % 2) : pages;
    const ok = paperWeight === 50 || (printer === 'kdp' && paperWeight === 60);
    return { value: round4(eff * per), verified: printer === 'kdp' && ok, source: printer === 'kdp' ? '[KDP-SPINE] per-page thickness' : '[INGRAM-SPINE] third-party summary of Ingram generator; confirm in Ingram template' };
  }
  return { value: null, verified: false, source: 'No published formula encoded for this printer' };
}

/** Inside margin (gutter) by page count. [KDP-MARGINS] verified:false. */
export function gutterIn(pages: number): number {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

export interface PageLimits { min: number; max: number; multipleOf: number; verified: boolean; source: string }
export function pageLimits(printer: PrinterId, binding: BindingType): PageLimits {
  if (binding === 'SADDLE_STITCH') return { min: 8, max: 48, multipleOf: 4, verified: false, source: 'Typical saddle-stitch limits; confirm with printer' };
  if (binding === 'HARDCOVER_CASEWRAP') return { min: 24, max: 800, multipleOf: 2, verified: printer === 'lulu', source: '[LULU-SPINE] table spans 24-800' };
  if (printer === 'kdp') return { min: 24, max: 828, multipleOf: 1, verified: false, source: 'KDP paperback range (white paper) from memory' };
  return { min: 32, max: 800, multipleOf: 2, verified: false, source: 'Lulu perfect-bound minimum 32 from memory; the API validates on quote' };
}

/** Minimum page count at which printed spine text is allowed. */
export function spineTextMinPages(printer: PrinterId): Sourced<number> {
  if (printer === 'kdp') return { value: 80, verified: true, source: '[KDP-SPINE] 79 min, 80 with Cover Creator; we use 80' };
  if (printer === 'ingramspark') return { value: 48, verified: false, source: 'IngramSpark: no spine text under 48 pages (third-party summary); we advise 100+' };
  return { value: 80, verified: false, source: 'Conservative default' };
}

export interface CoverDims {
  widthIn: number; heightIn: number;          // full flat wrap incl. bleed
  spineIn: number; bleedIn: number; trimWIn: number; trimHIn: number;
  backX0In: number; spineX0In: number; frontX0In: number; // left edges measured from the flat's left edge
  widthPx: number; heightPx: number;
  verified: boolean; estimated: boolean; note: string;
}

/** Full cover wrap = bleed + back + spine + front + bleed. */
export function coverDimensions(printer: PrinterId, binding: BindingType, trimId: string, pages: number, paperColor: PaperColor, paperWeight: PaperWeight): CoverDims | null {
  const t = getTrim(trimId);
  const sp = spineWidthIn(printer, binding, pages, paperColor, paperWeight);
  if (sp.value === null) return null;
  const spine = sp.value;
  let bleed = BLEED_IN, extra = 0, estimated = false, verified = sp.verified, note = sp.source;
  if (binding === 'HARDCOVER_CASEWRAP') {
    // ESTIMATE: 0.75in wrap beyond boards (per side), 0.125in board overhang, ~0.25in hinge each side.
    bleed = 0.75; extra = 2 * 0.125 + 2 * 0.25; estimated = true; verified = false;
    note = 'Hardcover wrap is an ESTIMATE; fetch exact dimensions from the printer (Lulu /cover-dimensions) before ordering.';
  }
  const width = round4(bleed * 2 + t.wIn * 2 + spine + extra);
  const height = round4(bleed * 2 + t.hIn + (binding === 'HARDCOVER_CASEWRAP' ? 0.25 : 0));
  const back = bleed + (extra ? extra / 2 : 0);
  return {
    widthIn: width, heightIn: height, spineIn: spine, bleedIn: bleed, trimWIn: t.wIn, trimHIn: t.hIn,
    backX0In: bleed, spineX0In: round4(back + t.wIn), frontX0In: round4(back + t.wIn + spine),
    widthPx: Math.round(width * DPI), heightPx: Math.round(height * DPI), verified, estimated, note,
  };
}

export interface Margins { top: number; bottom: number; inside: number; outside: number }
export function interiorMargins(pages: number, withBleed = false): Margins {
  const b = withBleed ? BLEED_IN : 0;
  return { top: TOP_BOTTOM_SAFE_IN + b, bottom: TOP_BOTTOM_SAFE_IN + b, inside: gutterIn(pages) + b, outside: OUTSIDE_SAFE_IN + b };
}

export interface PreflightMessage { level: 'error' | 'warn' | 'info'; text: string }
export function preflight(printer: PrinterId, binding: BindingType, trimId: string, pages: number, paperColor: PaperColor, paperWeight: PaperWeight, isbn?: string): PreflightMessage[] {
  const out: PreflightMessage[] = [];
  const lim = pageLimits(printer, binding);
  if (pages < lim.min) out.push({ level: 'error', text: `Too short for this binding: ${pages} pages, minimum ${lim.min}. Add front/back matter or choose saddle stitch.` });
  if (pages > lim.max) out.push({ level: 'error', text: `Too long: ${pages} pages, maximum ${lim.max}. Split into volumes.` });
  if (lim.multipleOf > 1 && pages % lim.multipleOf !== 0) out.push({ level: 'info', text: `Page count will be padded to a multiple of ${lim.multipleOf}.` });
  if (!lim.verified) out.push({ level: 'info', text: 'Page limits for this printer are not independently verified; the printer re-checks on quote.' });
  if (binding === 'PERFECT_PAPERBACK' && pages < spineTextMinPages(printer).value) out.push({ level: 'warn', text: `Under ${spineTextMinPages(printer).value} pages: the spine will be left blank (no spine title).` });
  if (printer === 'lulu' && !getTrim(trimId).luluCode) out.push({ level: 'error', text: `${getTrim(trimId).label} is not offered through Lulu in our catalog.` });
  if (printer === 'lulu' && paperWeight === 50) out.push({ level: 'warn', text: 'Lulu has no 50 lb stock; 60 lb will be used.' });
  if (printer === 'lulu' && paperWeight === 80 && paperColor === 'cream') out.push({ level: 'error', text: '80 lb stock is white coated only.' });
  if (coverDimensions(printer, binding, trimId, pages, paperColor, paperWeight)?.estimated) out.push({ level: 'warn', text: 'Hardcover cover size is an estimate until confirmed by the printer.' });
  if (isbn !== undefined && isbn !== '') out.push({ level: 'info', text: 'ISBN barcode will be drawn on the back cover.' });
  return out;
}

/** Pad a page count up to the printer's rules (even; multiple of 4 for saddle stitch; minimum). */
export function paddedPageCount(pages: number, lim: PageLimits): number {
  let n = Math.max(pages, lim.min);
  const m = Math.max(2, lim.multipleOf);
  if (n % m) n += m - (n % m);
  return n;
}

// ---- Lulu pod_package_id (UNVERIFIED builder; the API validates) -------------------------------------------------
export function luluPodPackageId(trimId: string, binding: BindingType, paperColor: PaperColor, paperWeight: PaperWeight, color: boolean, opts: { dotted?: boolean; glossy?: boolean } = {}): string | null {
  const trim = getTrim(trimId).luluCode;
  if (!trim) return null;
  let paper: string;
  if (paperWeight === 80) { if (paperColor === 'cream') return null; paper = '080CW444'; }
  else paper = paperColor === 'cream' ? '060UC444' : '060UW444';
  const ink = color ? 'FC' : 'BW';
  const quality = color || paperWeight === 80 ? 'PRE' : 'STD';
  const bind = binding === 'HARDCOVER_CASEWRAP' ? 'CW' : binding === 'SADDLE_STITCH' ? 'SS' : 'PB';
  const finish = (opts.glossy ?? false) ? 'G' : 'M';
  const parts = [trim, ink, quality, bind, paper, finish + 'XX'];
  return opts.dotted ? parts.join('.') : parts.join('');
}
