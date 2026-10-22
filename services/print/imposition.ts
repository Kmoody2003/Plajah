// Imposition — how finished pages land on press sheets.
//
// Covers: saddle-stitch printer spreads, saddle creep (shingling), perfect-bound signatures, n-up ganging
// of flat pieces (cards, flyers, stickers), and a home-printer booklet order.
// Scope and honesty: page orders are exact (they are arithmetic). Creep uses the common linear model —
// each sheet nested inside another is pushed out by one sheet's thickness at the fold — which is what
// imposition software applies by default; real creep also depends on fold style and stock, so a printer
// may dial it differently. Signature folding schemes (which page lands where on the flat sheet) vary by
// folder and are NOT modelled; `signatures` only groups pages. Pure TS, inches, page numbers 1-based.

import type { PaperStock, RectIn } from './types';

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const pad4 = (n: number) => Math.max(4, Math.ceil(n / 4) * 4);

/** A page number, or null for a padding blank. */
export type PageSlot = number | null;
export interface SaddleSheet { sheet: number; front: [PageSlot, PageSlot]; back: [PageSlot, PageSlot] }

/**
 * Printer spreads for a saddle-stitched booklet. Padded to a multiple of 4; blanks (null) are the last pages
 * of the reading order — move content (e.g. the back cover) if the blanks should sit elsewhere.
 * Sheet i (1 = outermost) of n pages: front [n−2(i−1), 2i−1], back [2i, n−2i+1].
 */
export function saddleStitchSpreads(pageCount: number): SaddleSheet[] {
  const n = pad4(pageCount);
  const slot = (p: number): PageSlot => (p <= pageCount ? p : null);
  const out: SaddleSheet[] = [];
  for (let i = 1; i <= n / 4; i++) {
    out.push({ sheet: i, front: [slot(n - 2 * (i - 1)), slot(2 * i - 1)], back: [slot(2 * i), slot(n - 2 * i + 1)] });
  }
  return out;
}

/** Sheet index (0 = outermost) a page sits on in a saddle-stitched booklet of n (padded) pages. */
const saddleSheetOf = (p: number, n: number) => (p <= n / 2 ? Math.floor((p - 1) / 2) : Math.floor((n - p) / 2));

/**
 * Saddle-stitch creep: inward (toward the spine) shift per page, inches.
 * Model: total creep = (sheets − 1) × sheet thickness (one leaf caliper), distributed linearly, so sheet k
 * (0 = outermost) shifts k × caliperIn. The outer sheet is 0; the centre spread moves the most.
 * Keys cover the padded page count (blanks included).
 */
export function creepOffsets(pageCount: number, paper: PaperStock): Record<number, number> {
  const n = pad4(pageCount);
  const out: Record<number, number> = {};
  for (let p = 1; p <= n; p++) out[p] = r4(saddleSheetOf(p, n) * paper.caliperIn);
  return out;
}

export interface Signature { index: number; pages: number[]; /** Pages in this signature beyond the content (blank padding). */ blanks: number }

/** Group a perfect-bound book into folded signatures of 8/16/32 pages; the last is padded with blanks. */
export function signatures(pageCount: number, pagesPerSignature: 8 | 16 | 32): Signature[] {
  const count = Math.max(1, Math.ceil(pageCount / pagesPerSignature));
  return Array.from({ length: count }, (_, i) => {
    const pages = Array.from({ length: pagesPerSignature }, (_, j) => i * pagesPerSignature + j + 1);
    return { index: i + 1, pages, blanks: pages.filter(p => p > pageCount).length };
  });
}

export interface NUpParams {
  sheetIn: [number, number];
  itemIn: [number, number];
  /** Bleed around each item (each item gets its own bleed — no shared cuts). */
  bleedIn: number;
  /** Space between neighbouring bleed edges. */
  gutterIn: number;
  /** Unprintable / gripper margin on every sheet edge. */
  marginIn: number;
  allowRotate: boolean;
}
export interface NUpResult { cols: number; rows: number; rotated: boolean; count: number; positions: RectIn[]; wastePct: number }

function grid(sheet: [number, number], item: [number, number], p: NUpParams, rotated: boolean): NUpResult {
  const [iw, ih] = item;
  const cw = iw + 2 * p.bleedIn, ch = ih + 2 * p.bleedIn;
  const uw = sheet[0] - 2 * p.marginIn, uh = sheet[1] - 2 * p.marginIn;
  const fit = (u: number, c: number) => (u < c ? 0 : Math.floor((u + p.gutterIn + 1e-9) / (c + p.gutterIn)));
  const cols = fit(uw, cw), rows = fit(uh, ch);
  const count = cols * rows;
  // Centre the block in the usable area.
  const bw = cols * cw + Math.max(0, cols - 1) * p.gutterIn, bh = rows * ch + Math.max(0, rows - 1) * p.gutterIn;
  const x0 = p.marginIn + (uw - bw) / 2, y0 = p.marginIn + (uh - bh) / 2;
  const positions: RectIn[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    positions.push({ x: r4(x0 + c * (cw + p.gutterIn) + p.bleedIn), y: r4(y0 + r * (ch + p.gutterIn) + p.bleedIn), w: iw, h: ih });
  }
  const wastePct = Math.round((1 - (count * iw * ih) / (sheet[0] * sheet[1])) * 1000) / 10;
  return { cols, rows, rotated, count, positions, wastePct };
}

/** Gang flat pieces on a press sheet; picks rotated vs. upright by count (ties keep upright). Rects are trim boxes. */
export function nUp(params: NUpParams): NUpResult {
  const up = grid(params.sheetIn, params.itemIn, params, false);
  if (!params.allowRotate || params.itemIn[0] === params.itemIn[1]) return up;
  const rot = grid(params.sheetIn, [params.itemIn[1], params.itemIn[0]], params, true);
  return rot.count > up.count ? rot : up;
}

export interface BookletSide { order: number; sheet: number; side: 'front' | 'back'; left: PageSlot; right: PageSlot }
export interface HomeBooklet { paddedTo: number; sides: BookletSide[]; note: string }

/** 2-up duplex order for a home printer: print the sides in order, duplex, fold the stack, staple. */
export function homeBooklet(pageCount: number): HomeBooklet {
  const sheets = saddleStitchSpreads(pageCount);
  const sides: BookletSide[] = [];
  for (const s of sheets) {
    sides.push({ order: sides.length + 1, sheet: s.sheet, side: 'front', left: s.front[0], right: s.front[1] });
    sides.push({ order: sides.length + 1, sheet: s.sheet, side: 'back', left: s.back[0], right: s.back[1] });
  }
  return {
    paddedTo: pad4(pageCount), sides,
    note: 'Print landscape, two pages per side, duplex with "flip on short edge". Keep the stack in order, fold in half, staple on the fold.',
  };
}
