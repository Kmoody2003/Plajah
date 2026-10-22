// The print product catalog: what people make, with the defaults a printer expects.
// Sizes are common North American and ISO sizes; a printer may trim a newspaper or magazine slightly
// differently, so every product's trim stays editable in the Prepress panel.

import type { DocPrintSpec, PrintProduct } from './types';
import { DEFAULT_MARKS } from './types';
import { conditionById } from './conditions';

export const PRINT_PRODUCTS: PrintProduct[] = [
  // ── Books ──
  { id: 'book-6x9-perfect', kind: 'book', label: 'Trade paperback 6×9', trimIn: [6, 9], bleedIn: 0.125, safeIn: 0.5, binding: 'perfect', facing: true, pageMultiple: 2, pageRange: [24, 800], intents: ['digital', 'offset', 'home'], defaultCondition: 'FOGRA52' },
  { id: 'book-5.5x8.5-perfect', kind: 'book', label: 'Digest paperback 5.5×8.5', trimIn: [5.5, 8.5], bleedIn: 0.125, safeIn: 0.5, binding: 'perfect', facing: true, pageMultiple: 2, pageRange: [24, 800], intents: ['digital', 'offset', 'home'], defaultCondition: 'FOGRA52' },
  { id: 'book-8.5x11-case', kind: 'book', label: 'Hardcover 8.5×11 (case wrap)', trimIn: [8.5, 11], bleedIn: 0.125, safeIn: 0.5, binding: 'case', facing: true, pageMultiple: 2, pageRange: [24, 800], intents: ['digital', 'offset'], defaultCondition: 'FOGRA39' },
  { id: 'picture-book-8.5', kind: 'book', label: 'Picture book 8.5×8.5', trimIn: [8.5, 8.5], bleedIn: 0.125, safeIn: 0.375, binding: 'case', facing: true, pageMultiple: 2, pageRange: [24, 48], intents: ['digital', 'offset'], defaultCondition: 'FOGRA39' },
  // ── Periodicals ──
  { id: 'magazine-letter-saddle', kind: 'magazine', label: 'Magazine 8.375×10.875 (saddle stitch)', trimIn: [8.375, 10.875], bleedIn: 0.125, safeIn: 0.375, binding: 'saddle', facing: true, pageMultiple: 4, pageRange: [8, 96], intents: ['digital', 'offset'], defaultCondition: 'SWOP', note: 'Standard US magazine trim; heavy issues move to perfect binding.' },
  { id: 'magazine-a4-perfect', kind: 'magazine', label: 'Magazine A4 (perfect bound)', trimIn: [8.27, 11.69], bleedIn: 0.118, safeIn: 0.394, binding: 'perfect', facing: true, pageMultiple: 4, pageRange: [48, 400], intents: ['offset', 'digital'], defaultCondition: 'FOGRA39' },
  { id: 'newspaper-tabloid', kind: 'newspaper', label: 'Tabloid newspaper 11×17', trimIn: [11, 17], bleedIn: 0, safeIn: 0.5, binding: 'fold', facing: true, pageMultiple: 4, pageRange: [4, 96], intents: ['newsprint', 'digital', 'home'], defaultCondition: 'NEWSPRINT26', note: 'Newsprint presses usually print to a white margin, not bleed.' },
  { id: 'newspaper-broadsheet', kind: 'newspaper', label: 'Broadsheet newspaper 11×21', trimIn: [11, 21], bleedIn: 0, safeIn: 0.5, binding: 'fold', facing: true, pageMultiple: 4, pageRange: [4, 96], intents: ['newsprint'], defaultCondition: 'NEWSPRINT26', note: 'Modern US 11-inch web; older broadsheets ran 12–13 in wide.' },
  { id: 'newspaper-letter-home', kind: 'newspaper', label: 'School paper — Letter, home/office printed', trimIn: [8.5, 11], bleedIn: 0, safeIn: 0.375, binding: 'fold', facing: true, pageMultiple: 4, pageRange: [4, 24], intents: ['home', 'digital'], defaultCondition: 'HOME_RGB', note: 'Prints as a folded booklet on Letter or Tabloid duplex.' },
  { id: 'zine-half-letter', kind: 'zine', label: 'Zine 5.5×8.5 (folded from Letter)', trimIn: [5.5, 8.5], bleedIn: 0, safeIn: 0.25, binding: 'saddle', facing: true, pageMultiple: 4, pageRange: [8, 48], intents: ['home', 'digital'], defaultCondition: 'HOME_RGB' },
  // ── Comics ──
  { id: 'comic-us', kind: 'comic', label: 'US comic 6.625×10.25', trimIn: [6.625, 10.1875], bleedIn: 0.125, safeIn: 0.375, binding: 'saddle', facing: true, pageMultiple: 4, pageRange: [8, 64], intents: ['digital', 'offset'], defaultCondition: 'SWOP' },
  { id: 'manga-tankobon', kind: 'manga', label: 'Manga tankōbon B6 (5×7.2)', trimIn: [5.04, 7.17], bleedIn: 0.118, safeIn: 0.394, binding: 'perfect', facing: true, pageMultiple: 2, pageRange: [96, 400], intents: ['digital', 'offset'], defaultCondition: 'FOGRA52', note: 'Right-to-left reading order; spine on the right.' },
  { id: 'graphic-novel-6.625', kind: 'comic', label: 'Graphic novel 6.625×10.1875 (perfect)', trimIn: [6.625, 10.1875], bleedIn: 0.125, safeIn: 0.375, binding: 'perfect', facing: true, pageMultiple: 2, pageRange: [48, 400], intents: ['digital', 'offset'], defaultCondition: 'FOGRA39' },
  // ── Flats and folded ──
  { id: 'flyer-letter', kind: 'flyer', label: 'Flyer 8.5×11', trimIn: [8.5, 11], bleedIn: 0.125, safeIn: 0.25, binding: 'none', facing: false, pageMultiple: 1, pageRange: [1, 2], intents: ['home', 'digital', 'offset'], defaultCondition: 'GRACOL2013' },
  { id: 'flyer-a5', kind: 'flyer', label: 'Flyer A5', trimIn: [5.83, 8.27], bleedIn: 0.118, safeIn: 0.197, binding: 'none', facing: false, pageMultiple: 1, pageRange: [1, 2], intents: ['home', 'digital', 'offset'], defaultCondition: 'FOGRA39' },
  { id: 'poster-18x24', kind: 'poster', label: 'Poster 18×24', trimIn: [18, 24], bleedIn: 0.125, safeIn: 0.5, binding: 'none', facing: false, pageMultiple: 1, pageRange: [1, 1], intents: ['digital', 'wide-format'], defaultCondition: 'GRACOL2013' },
  { id: 'postcard-4x6', kind: 'postcard', label: 'Postcard 4×6', trimIn: [6, 4], bleedIn: 0.125, safeIn: 0.125, binding: 'none', facing: false, pageMultiple: 1, pageRange: [2, 2], intents: ['home', 'digital', 'offset'], defaultCondition: 'GRACOL2013', note: 'USPS needs the right half of the back clear for address and postage.' },
  { id: 'business-card-us', kind: 'business-card', label: 'Business card 3.5×2', trimIn: [3.5, 2], bleedIn: 0.125, safeIn: 0.125, binding: 'none', facing: false, pageMultiple: 1, pageRange: [1, 2], intents: ['digital', 'offset', 'home'], defaultCondition: 'GRACOL2013' },
  { id: 'trifold-letter', kind: 'brochure', label: 'Tri-fold brochure 11×8.5', trimIn: [11, 8.5], bleedIn: 0.125, safeIn: 0.25, binding: 'fold', facing: false, pageMultiple: 2, pageRange: [2, 2], intents: ['home', 'digital', 'offset'], defaultCondition: 'GRACOL2013', foldsIn: [3.6563, 7.3438], note: 'Roll fold: the tuck-in panel is ~1/16 in narrower so it closes flat.' },
  { id: 'sticker-3in', kind: 'sticker', label: 'Die-cut sticker 3×3', trimIn: [3, 3], bleedIn: 0.0625, safeIn: 0.0625, binding: 'none', facing: false, pageMultiple: 1, pageRange: [1, 1], intents: ['digital', 'wide-format'], defaultCondition: 'WIDE_FORMAT', note: 'Draw the cut line in the CutContour spot colour.' },
  { id: 'banner-3x6ft', kind: 'banner', label: 'Vinyl banner 3×6 ft', trimIn: [72, 36], bleedIn: 1, safeIn: 1.5, binding: 'none', facing: false, pageMultiple: 1, pageRange: [1, 1], intents: ['wide-format'], defaultCondition: 'WIDE_FORMAT', note: 'Keep 1.5 in clear for hems and grommets.' },
  // ── Wraps (sized by the wrap designer) ──
  { id: 'vehicle-wrap', kind: 'vehicle-wrap', label: 'Vehicle wrap', trimIn: [190, 60], bleedIn: 3, safeIn: 4, binding: 'wrap', facing: false, pageMultiple: 1, intents: ['wide-format'], defaultCondition: 'WIDE_FORMAT', note: 'Measured from the actual vehicle; 3–4 in bleed per side for installation.' },
  { id: 'object-wrap', kind: 'object-wrap', label: 'Object wrap / label', trimIn: [8.64, 4], bleedIn: 0.125, safeIn: 0.25, binding: 'wrap', facing: false, pageMultiple: 1, intents: ['digital', 'wide-format', 'home'], defaultCondition: 'WIDE_FORMAT' },
];

export const productById = (id: string): PrintProduct | undefined => PRINT_PRODUCTS.find(p => p.id === id);

/** A starting spec for a product; the Prepress panel edits from here. */
export function defaultSpecFor(productId: string, overrides: Partial<DocPrintSpec> = {}): DocPrintSpec {
  const p = productById(productId) || PRINT_PRODUCTS[0];
  const cond = conditionById(p.defaultCondition);
  const paperId = p.kind === 'newspaper' && cond.intent === 'newsprint' ? 'news-45gsm'
    : cond.intent === 'home' ? 'home-20lb'
    : p.binding === 'wrap' || p.kind === 'banner' ? 'vinyl-cast'
    : p.kind === 'magazine' || p.kind === 'comic' ? 'gloss-70lb'
    : p.kind === 'book' || p.kind === 'manga' ? 'uncoated-50lb'
    : 'gloss-100lb';
  return {
    productId: p.id, trimIn: [...p.trimIn] as [number, number], bleedIn: p.bleedIn, safeIn: p.safeIn,
    intent: cond.intent, conditionId: cond.id, binding: p.binding, facing: p.facing, paperId,
    marks: { ...DEFAULT_MARKS, crop: cond.intent !== 'home' }, spotColors: [], pageFrameIds: [],
    ...overrides,
  };
}
