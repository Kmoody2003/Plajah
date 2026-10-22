// Binding geometry — spine width from paper caliper, flat cover spreads, page-count rules.
//
// Scope and honesty: these are PLANNING numbers. Spine width here is leaf count × leaf caliper from
// conditions.ts (approximate calipers), plus a small cover allowance. A printer's own cover template or
// published formula always wins — for Lulu / KDP / IngramSpark use services/pod/printSpec.spineWidthIn and
// pass the result in as `spineIn`. Case-bound wraps and dust jackets use common trade allowances (0.75in
// board wrap, 0.125in board overhang, ~0.25in hinge, 3.5in flaps) and are always marked `estimated`.
// Pure TS, inches throughout, no I/O.

import type { BindingStyle, PaperStock } from './types';

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Cover-stock caliper used for the default cover allowance (≈ 100 lb cover). */
export const COVER_CALIPER_IN = 0.01;
/** Case-wrap allowances — trade estimates mirroring services/pod/printSpec coverDimensions. */
export const CASE_WRAP_IN = 0.75;
export const CASE_OVERHANG_IN = 0.125;
export const CASE_HINGE_IN = 0.25;
export const JACKET_FLAP_IN = 3.5;
export const JACKET_BLEED_IN = 0.125;
/** Common printer guidance: below this spine width, no spine text. */
export const SPINE_TEXT_MIN_IN = 0.25;

/** Spine width estimate: leaves × leaf caliper + cover allowance (default front + back cover caliper). */
export function spineWidthFromStock(pages: number, paper: PaperStock, coverAllowanceIn = 2 * COVER_CALIPER_IN): number {
  if (pages <= 0) return 0;
  return r4(Math.ceil(pages / 2) * paper.caliperIn + coverAllowanceIn);
}

/** Spine text only when the spine is at least 0.25in — a common printer rule of thumb (KDP and others tie it to page count). */
export const spineTextAllowed = (spineIn: number): boolean => spineIn >= SPINE_TEXT_MIN_IN;

export type CoverPanelName = 'back' | 'spine' | 'front' | 'back-flap' | 'front-flap' | 'hinge' | 'wrap';
export interface CoverPanel { name: CoverPanelName; x: number; w: number }
export interface CoverSpread {
  widthIn: number; heightIn: number;
  /** Panels left→right, x measured from the flat's left edge (bleed/wrap included in the flat). */
  panels: CoverPanel[];
  spineIn: number;
  estimated: boolean;
  notes: string[];
}

export interface CoverSpreadSpec {
  trimIn: [number, number];
  bleedIn: number;
  binding: BindingStyle;
  pages: number;
  paper: PaperStock;
  jacket?: boolean;
  flapIn?: number;
  /** Spine from a printer template / pod formula; overrides the caliper estimate. */
  spineIn?: number;
}

function lay(lead: number, parts: Array<[CoverPanelName, number]>): { panels: CoverPanel[]; end: number } {
  let x = lead;
  const panels = parts.map(([name, w]) => { const p = { name, x: r4(x), w: r4(w) }; x += w; return p; });
  return { panels, end: x };
}

export function coverSpread(spec: CoverSpreadSpec): CoverSpread {
  const [tw, th] = spec.trimIn;
  const notes: string[] = [];
  const bound = spec.binding === 'perfect' || spec.binding === 'case';
  const spine = bound ? (spec.spineIn ?? spineWidthFromStock(spec.pages, spec.paper)) : 0;
  if (bound && spec.spineIn === undefined) notes.push('Spine width is a caliper estimate; use the printer\'s cover template before ordering.');
  if (bound && !spineTextAllowed(spine)) notes.push(`Spine ${r4(spine)}in is under ${SPINE_TEXT_MIN_IN}in: leave it free of text.`);

  if (spec.jacket) {
    const flap = spec.flapIn ?? JACKET_FLAP_IN;
    const b = JACKET_BLEED_IN;
    const board = spec.binding === 'case' ? tw + CASE_OVERHANG_IN : tw;
    const spineJ = spine + (spec.binding === 'case' ? 2 * CASE_HINGE_IN : 0);
    if (spec.binding !== 'case') notes.push('Dust jackets normally wrap a case-bound book; panel sizes assume the trim with no board overhang.');
    const { panels, end } = lay(b, [['back-flap', flap], ['back', board], ['spine', spineJ], ['front', board], ['front-flap', flap]]);
    notes.push(`Dust jacket is an ESTIMATE (${flap}in flaps, ${b}in bleed${spec.binding === 'case' ? ', board overhang and hinge allowances' : ''}); confirm with the printer's jacket template.`);
    return { widthIn: r4(end + b), heightIn: r4(th + (spec.binding === 'case' ? 2 * CASE_OVERHANG_IN : 0) + 2 * b), panels, spineIn: r4(spineJ), estimated: true, notes };
  }

  if (spec.binding === 'case') {
    const board = tw + CASE_OVERHANG_IN;
    const { panels } = lay(0, [['wrap', CASE_WRAP_IN], ['back', board], ['hinge', CASE_HINGE_IN], ['spine', spine], ['hinge', CASE_HINGE_IN], ['front', board], ['wrap', CASE_WRAP_IN]]);
    // Same total as services/pod/printSpec: 2×wrap + 2×trim + spine + 2×overhang + 2×hinge.
    const width = 2 * CASE_WRAP_IN + 2 * tw + spine + 2 * CASE_OVERHANG_IN + 2 * CASE_HINGE_IN;
    notes.push('Hardcover wrap is an ESTIMATE (0.75in wrap, 0.125in overhang, ~0.25in hinge); fetch exact dimensions from the printer before ordering.');
    return { widthIn: r4(width), heightIn: r4(2 * CASE_WRAP_IN + th + 2 * CASE_OVERHANG_IN), panels, spineIn: r4(spine), estimated: true, notes };
  }

  const b = spec.bleedIn;
  if (spec.binding === 'perfect') {
    const { panels, end } = lay(b, [['back', tw], ['spine', spine], ['front', tw]]);
    return { widthIn: r4(end + b), heightIn: r4(th + 2 * b), panels, spineIn: r4(spine), estimated: spec.spineIn === undefined, notes };
  }
  if (spec.binding === 'saddle' || spec.binding === 'coil' || spec.binding === 'fold') {
    if (spec.binding === 'coil') notes.push('Coil covers are usually separate front and back sheets; the spread is shown for layout only.');
    if (spec.binding === 'saddle') notes.push('Saddle-stitch covers are the outer sheet: no spine.');
    const { panels, end } = lay(b, [['back', tw], ['front', tw]]);
    return { widthIn: r4(end + b), heightIn: r4(th + 2 * b), panels, spineIn: 0, estimated: false, notes };
  }
  notes.push('Unbound piece: the cover is a single front panel.');
  const { panels, end } = lay(b, [['front', tw]]);
  return { widthIn: r4(end + b), heightIn: r4(th + 2 * b), panels, spineIn: 0, estimated: false, notes };
}

export interface PageCountRule { ok: boolean; padTo: number; message: string }

export function pageCountRule(binding: BindingStyle, pages: number): PageCountRule {
  const m = binding === 'saddle' || binding === 'fold' ? 4 : binding === 'perfect' || binding === 'case' ? 2 : 1;
  const n = Math.max(1, Math.ceil(pages));
  const padTo = Math.ceil(n / m) * m;
  const why = binding === 'saddle' ? 'saddle stitch nests folded sheets (4 pages each)'
    : binding === 'fold' ? 'folded sections carry 4 pages per sheet'
    : 'each leaf has two sides';
  return padTo === n
    ? { ok: true, padTo, message: m > 1 ? `${n} pages fits ${binding} binding.` : `${n} pages; any count works.` }
    : { ok: false, padTo, message: `${binding} needs a multiple of ${m} (${why}); pad ${n} → ${padTo} with ${padTo - n} blank page${padTo - n === 1 ? '' : 's'}.` };
}
