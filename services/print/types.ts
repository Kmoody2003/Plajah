// Print production — shared model for Tela's print stack (home printer → commercial press → wide format).
//
// Everything here is pure data in INCHES (the unit printers quote) with points (1/72 in) only where a
// PDF needs them. Tela documents are CSS px at 96 dpi; convert with PX_PER_IN.
//
// The stack, in order:
//   products.ts / conditions.ts  what is being made and what press condition it prints to
//   preflight.ts                 problems found before print (resolution, ink, bleed, safe zone, fonts…)
//   binding.ts                   spine, cover spreads, page-count rules
//   imposition.ts / marks.ts     printer spreads, signatures, creep, n-up ganging, crop/registration marks
//   wrap.ts                      vehicle and object wraps: panels, tiling, overlap, dielines
//   pressPdf.ts                  the press-ready PDF (CMYK, boxes, marks, output intent)
// Honest scope is stated in each module; the summary lives in docs/print/PRINT_STACK.md.

export const PX_PER_IN = 96;
export const PT_PER_IN = 72;

/** Who runs the output. Decides colour, resolution, marks and how strict preflight is. */
export type PrintIntent = 'home' | 'digital' | 'offset' | 'newsprint' | 'wide-format';

/** A characterised printing condition (the colour + ink rules a press runs to). */
export interface OutputCondition {
  id: 'HOME_RGB' | 'FOGRA39' | 'FOGRA52' | 'GRACOL2013' | 'SWOP' | 'NEWSPRINT26' | 'WIDE_FORMAT';
  label: string;
  intent: PrintIntent;
  colorModel: 'RGB' | 'CMYK';
  /** Total area coverage limit, percent (sum of C+M+Y+K). */
  tac: number;
  /** Grey-component replacement used when separating RGB to CMYK (0..1). */
  gcr: number;
  /** Image effective-resolution targets at final size, pixels per inch. */
  ppi: { min: number; recommended: number };
  /** Smallest stroke that reliably prints, points. */
  minStrokePt: number;
  /** Smallest reversed (knocked-out) text that holds up, points. */
  minReverseTextPt: number;
  /** ICC registry identifier for the PDF/X output intent, when this is a registered characterisation. */
  outputConditionIdentifier?: string;
  registryName?: string;
  /** Whether the numbers above were checked against the published characterisation. */
  verified: boolean;
  source: string;
}

export type BindingStyle =
  | 'none'          // flat sheets: flyers, posters, cards
  | 'fold'          // brochures, newspapers (folded, unbound)
  | 'saddle'        // stapled through the fold: magazines, comics, booklets
  | 'perfect'       // glued spine: paperbacks, thick magazines, trade comics
  | 'case'          // hardcover case wrap
  | 'coil'          // spiral / wire-o
  | 'wrap';         // vinyl applied to an object or vehicle

export type ProductKind =
  | 'book' | 'magazine' | 'newspaper' | 'comic' | 'manga' | 'zine'
  | 'flyer' | 'poster' | 'postcard' | 'business-card' | 'brochure' | 'sticker' | 'label' | 'packaging'
  | 'vehicle-wrap' | 'object-wrap' | 'banner';

/** A thing someone prints, with the defaults a printer would expect for it. */
export interface PrintProduct {
  id: string;
  kind: ProductKind;
  label: string;
  /** Finished (trimmed) size, inches. Wraps use the panel size and are re-sized by the wrap designer. */
  trimIn: [number, number];
  bleedIn: number;
  /** Live area inset from the trim. */
  safeIn: number;
  binding: BindingStyle;
  /** Pages face each other in spreads (books, magazines). */
  facing: boolean;
  /** Page count must be a multiple of this (4 for saddle stitch, 2 for perfect, 1 for flats). */
  pageMultiple: number;
  pageRange?: [number, number];
  intents: PrintIntent[];
  defaultCondition: OutputCondition['id'];
  /** Uncommon but real: folds for brochures and newspapers, measured from the left edge of the flat, inches. */
  foldsIn?: number[];
  note?: string;
}

/** Paper (or substrate) — thickness drives spine width and saddle-stitch creep. */
export interface PaperStock {
  id: string;
  label: string;
  /** Caliper of one LEAF (two pages), inches. */
  caliperIn: number;
  coated: boolean;
  /** 'newsprint' | 'uncoated' | 'coated' | 'cover' | 'vinyl' */
  family: 'newsprint' | 'uncoated' | 'coated' | 'cover' | 'vinyl';
}

/** Printer's marks drawn outside the bleed. */
export interface MarkOptions {
  crop: boolean;
  bleed: boolean;
  registration: boolean;
  colorBar: boolean;
  /** Job slug: file, page, date, condition. */
  slug: boolean;
  /** Distance of marks from the trim, inches (must clear the bleed). */
  offsetIn: number;
}

export const DEFAULT_MARKS: MarkOptions = { crop: true, bleed: false, registration: true, colorBar: true, slug: true, offsetIn: 0.1875 };

/** A spot (non-process) colour, e.g. a brand Pantone or a CutContour dieline. */
export interface SpotColor {
  name: string;
  /** Display approximation (sRGB hex). The printer uses the name, not this. */
  previewHex: string;
  /** Process fallback, 0..100 each. */
  cmykFallback: [number, number, number, number];
  /** Technical spots (cut, crease, white underbase) never print as ink. */
  technical?: 'cut' | 'crease' | 'white' | 'varnish';
}

/** The print spec stored on a Tela document (TelaDoc.print). */
export interface DocPrintSpec {
  productId: string;
  trimIn: [number, number];
  bleedIn: number;
  safeIn: number;
  intent: PrintIntent;
  conditionId: OutputCondition['id'];
  binding: BindingStyle;
  facing: boolean;
  paperId: string;
  marks: MarkOptions;
  spotColors: SpotColor[];
  /** Frame ids in reading order that make up the printed piece. Empty = every PAPER frame. */
  pageFrameIds: string[];
  /** Frames that are covers (front, back, spine wraps) printed on cover stock. */
  coverFrameIds?: string[];
  /** For wraps: the wrap job (see wrap.ts). */
  wrapJobId?: string;
  /**
   * Wraps designed at reduced scale (vehicles at 1:10): the board is real size × scale, and each print
   * panel's rectangle in REAL-WORLD inches on the board's guide layout. Exported one panel at a time.
   */
  wrap?: { scale: number; panels: Array<{ label: string; rectIn: RectIn; printW: number; printH: number }> };
  /** Die-cut and crease lines (absolute M/L/C/Z, inches from the trim's top-left). Written to the PDF as spot colours. */
  dieline?: { cut: string[]; crease: string[] };
}

// ── The neutral job model preflight reads ────────────────────────────────────
// Built from a Tela doc (telaPrintJob.ts) or any other source, so preflight never depends on Tela.

export interface RectIn { x: number; y: number; w: number; h: number }

export type JobItem =
  | { kind: 'image'; id: string; rect: RectIn; pixelW: number; pixelH: number; colorSpace: 'rgb' | 'cmyk' | 'gray'; label?: string }
  | { kind: 'text'; id: string; rect: RectIn; fontFamily: string; fontSizePt: number; color: string; onDarkBackground?: boolean; fontEmbeddable?: boolean; label?: string }
  | { kind: 'shape'; id: string; rect: RectIn; fill?: string; stroke?: string; strokePt?: number; spot?: string; label?: string };

export interface JobPage {
  id: string;
  label: string;
  /** Trim size of this page, inches. Items are positioned relative to the trim's top-left. */
  trimIn: [number, number];
  items: JobItem[];
  /** True when the page's content was laid out to extend into the bleed. */
  bleedFilled?: boolean;
  /** Sampled ink coverage (0..400) of the rendered page, when a raster was analysed. */
  maxTac?: number;
  isCover?: boolean;
}

export interface PrintJob {
  title: string;
  spec: DocPrintSpec;
  pages: JobPage[];
}

export type FindingLevel = 'error' | 'warn' | 'info';

export interface PreflightFinding {
  level: FindingLevel;
  code: string;
  message: string;
  /** How to fix it, in a sentence. */
  fix: string;
  pageId?: string;
  itemId?: string;
  /** Present when the platform can apply the fix itself. */
  autoFix?: 'extend-bleed' | 'pad-pages' | 'convert-cmyk' | 'outline-text' | 'move-into-safe' | 'pure-black-text';
}

/** Vector objects whose label starts with this are design guides (wrap templates, dielines) and never print. */
export const NON_PRINTING_LABEL = 'Non-printing guide';
export const isNonPrinting = (o: { objectLabel?: string }) => !!o.objectLabel?.startsWith(NON_PRINTING_LABEL);
