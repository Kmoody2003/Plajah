// Preflight — find what will go wrong on press before anyone pays for a proof.
//
// Reads the neutral PrintJob (types.ts), never Tela directly, so the same checks run on a Tela doc
// (domPrintJob.ts measures the rendered pages), an imported PDF's page list, or a test fixture.
// Severity follows what a prepress operator would do:
//   error  the printer would reject the file or the result would be visibly wrong
//   warn   it prints, but probably not the way the designer expects
//   info   worth knowing; the export handles it automatically
// Every finding says how to fix it, and names an automatic fix when the platform can apply one.

import type { DocPrintSpec, JobItem, JobPage, PreflightFinding, PrintJob, RectIn } from './types';
import { conditionById } from './conditions';
import { productById } from './products';
import { SUBSTITUTE, classifyFamily, isSystemFamily } from './fontSource';

const EDGE_EPS = 0.02; // inches: "touching the trim"

/** Effective resolution of an image at its placed size, pixels per inch. */
export function effectivePpi(item: { pixelW: number; pixelH: number; rect: RectIn }): number {
  if (item.rect.w <= 0 || item.rect.h <= 0) return Infinity;
  return Math.min(item.pixelW / item.rect.w, item.pixelH / item.rect.h);
}

/** Does the rect run off (or touch) a trim edge? Returns which edges. */
export function touchedEdges(r: RectIn, trim: [number, number]): Array<'left' | 'right' | 'top' | 'bottom'> {
  const out: Array<'left' | 'right' | 'top' | 'bottom'> = [];
  if (r.x <= EDGE_EPS) out.push('left');
  if (r.y <= EDGE_EPS) out.push('top');
  if (r.x + r.w >= trim[0] - EDGE_EPS) out.push('right');
  if (r.y + r.h >= trim[1] - EDGE_EPS) out.push('bottom');
  return out;
}

/** Is the rect fully inside the live (safe) area? */
export function insideSafe(r: RectIn, trim: [number, number], safeIn: number): boolean {
  return r.x >= safeIn - EDGE_EPS && r.y >= safeIn - EDGE_EPS && r.x + r.w <= trim[0] - safeIn + EDGE_EPS && r.y + r.h <= trim[1] - safeIn + EDGE_EPS;
}

const hexToRgb = (c: string): [number, number, number] | null => {
  const s = c.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [0, 1, 2].map(i => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
};

/** Near-black but not pure black: separates to a 4-colour "rich" black that blurs small type on press. */
export function isNearBlackNotPure(color: string): boolean {
  const rgb = hexToRgb(color);
  if (!rgb) return false;
  const max = Math.max(...rgb), min = Math.min(...rgb);
  return max > 0 && max <= 48 && max - min <= 12;
}

export function preflight(job: PrintJob): PreflightFinding[] {
  const { spec } = job;
  const out: PreflightFinding[] = [];
  const cond = conditionById(spec.conditionId);
  const product = productById(spec.productId);
  const cmyk = cond.colorModel === 'CMYK';
  const pages = job.pages.filter(p => !p.isCover);

  // ── Job-level ──
  if (!job.pages.length) {
    out.push({ level: 'error', code: 'NO_PAGES', message: 'There are no pages to print.', fix: 'Add a page frame, or choose which frames are pages in Prepress.' });
    return out;
  }
  if (product) {
    const mult = product.pageMultiple;
    if (mult > 1 && pages.length % mult !== 0) {
      out.push({
        level: spec.binding === 'saddle' || spec.binding === 'fold' ? 'error' : 'warn', code: 'PAGE_MULTIPLE',
        message: `${pages.length} pages — ${product.label} needs a multiple of ${mult}.`,
        fix: `Add ${mult - (pages.length % mult)} page(s) (notes, ads, a house ad or a blank) or remove some.`, autoFix: 'pad-pages',
      });
    }
    if (product.pageRange && (pages.length < product.pageRange[0] || pages.length > product.pageRange[1])) {
      out.push({ level: 'warn', code: 'PAGE_RANGE', message: `${pages.length} pages is outside the usual ${product.pageRange[0]}–${product.pageRange[1]} for ${product.label}.`, fix: spec.binding === 'saddle' ? 'Saddle stitch tops out around 64–96 pages; switch to perfect binding for thicker issues.' : 'Check the binding choice with your printer.' });
    }
    if (spec.bleedIn + 1e-6 < product.bleedIn && cond.intent !== 'home') {
      out.push({ level: 'error', code: 'BLEED_TOO_SMALL', message: `Bleed is ${spec.bleedIn} in; ${product.label} needs ${product.bleedIn} in.`, fix: `Set bleed to ${product.bleedIn} in.` });
    }
  }
  if (cond.intent === 'newsprint' && spec.bleedIn > 0) {
    out.push({ level: 'info', code: 'NEWSPRINT_BLEED', message: 'Most newspaper presses print to a white margin and cannot bleed.', fix: 'Confirm with your printer, or set bleed to 0 and keep art inside the margin.' });
  }
  for (const s of spec.spotColors) {
    if (s.technical === 'cut' && s.name !== 'CutContour') out.push({ level: 'info', code: 'CUT_NAME', message: `Cut line spot is named "${s.name}".`, fix: 'Most cutters expect the exact name "CutContour"; check your shop’s naming.' });
  }

  // ── Per page ──
  for (const page of job.pages) {
    const trim = page.trimIn;
    if (Math.abs(trim[0] - spec.trimIn[0]) > 0.01 || Math.abs(trim[1] - spec.trimIn[1]) > 0.01) {
      if (!page.isCover) out.push({ level: 'error', code: 'PAGE_SIZE', pageId: page.id, message: `${page.label} is ${fmt(trim[0])}×${fmt(trim[1])} in; the job is ${fmt(spec.trimIn[0])}×${fmt(spec.trimIn[1])} in.`, fix: 'Resize the page to the job trim size.' });
    }
    if (page.maxTac !== undefined && cmyk && page.maxTac > cond.tac + 2) {
      out.push({
        level: 'warn', code: 'INK_LIMIT', pageId: page.id,
        message: `${page.label}: darkest areas reach ${Math.round(page.maxTac)}% ink; ${cond.label} allows ${cond.tac}%.`,
        fix: `Export caps ink at ${cond.tac}% so it won’t smear or set off, but the deepest shadows will flatten. Lighten heavy rich blacks if detail matters.`,
      });
    }
    let bleedNeeded = false;
    for (const item of page.items) checkItem(item, page, spec, cond, out, () => { bleedNeeded = true; });
    if (bleedNeeded && spec.bleedIn > 0 && !page.bleedFilled) {
      out.push({
        level: 'warn', code: 'BLEED_EXTENDED', pageId: page.id,
        message: `${page.label}: artwork reaches the trim but wasn’t drawn into the bleed.`,
        fix: 'Export will extend the edge pixels into the bleed. For photos with detail at the edge, enlarge the image past the trim instead.', autoFix: 'extend-bleed',
      });
    }
    if (cond.intent === 'home' && page.items.some(i => touchedEdges(i.rect, trim).length)) {
      out.push({ level: 'info', code: 'HOME_MARGIN', pageId: page.id, message: `${page.label}: most home printers leave a ~0.25 in unprinted border.`, fix: 'Keep important content 0.25 in from the edge, or use a printer with borderless printing.' });
    }
  }
  // System fonts have no file that may be embedded: vector export swaps in an open family of the same class.
  const systemFaces = new Set(job.pages.flatMap(p => p.items).filter((i): i is Extract<JobItem, { kind: 'text' }> => i.kind === 'text' && isSystemFamily(i.fontFamily)).map(i => i.fontFamily));
  for (const fam of systemFaces) {
    out.push({
      level: 'info', code: 'FONT_SUBSTITUTE', message: `“${fam}” is a system font that can’t be embedded.`,
      fix: `Vector export sets it in ${SUBSTITUTE[classifyFamily(fam)]} at the same positions. Choose a Google font in Tela to print exactly what you see.`,
    });
  }
  return out.sort((a, b) => rank(a.level) - rank(b.level));
}

function checkItem(item: JobItem, page: JobPage, spec: DocPrintSpec, cond: ReturnType<typeof conditionById>, out: PreflightFinding[], needsBleed: () => void) {
  const trim = page.trimIn;
  const where = { pageId: page.id, itemId: item.id };
  const name = item.label ? `“${item.label}”` : item.kind;
  const edges = touchedEdges(item.rect, trim);

  if (item.kind === 'image') {
    const ppi = effectivePpi(item);
    if (ppi < cond.ppi.min) out.push({ level: 'error', code: 'LOW_RES', ...where, message: `${page.label}: image ${name} is ${Math.round(ppi)} ppi at its printed size; ${cond.label} needs ${cond.ppi.min}+.`, fix: `Use a larger original or print it smaller (max ${fmt(item.pixelW / cond.ppi.recommended)}×${fmt(item.pixelH / cond.ppi.recommended)} in at ${cond.ppi.recommended} ppi). Upscaling won’t add real detail.` });
    else if (ppi < cond.ppi.recommended) out.push({ level: 'warn', code: 'MID_RES', ...where, message: `${page.label}: image ${name} is ${Math.round(ppi)} ppi; ${cond.ppi.recommended} is recommended.`, fix: 'It will print, slightly soft. Fine for photos viewed at arm’s length; avoid for fine text in images.' });
    if (cond.colorModel === 'CMYK' && item.colorSpace === 'rgb') out.push({ level: 'info', code: 'RGB_IMAGE', ...where, message: `${page.label}: ${name} is RGB.`, fix: `Export converts it to CMYK for ${cond.label}; very saturated blues, greens and oranges will dull. Soft-proof in Prepress to see the result.`, autoFix: 'convert-cmyk' });
    if (edges.length) needsBleed();
  }

  if (item.kind === 'text') {
    if (!insideSafe(item.rect, trim, spec.safeIn)) {
      out.push({ level: edges.length ? 'error' : 'warn', code: 'TEXT_OUTSIDE_SAFE', ...where, message: `${page.label}: text ${name} is outside the ${spec.safeIn} in safe area${edges.length ? ' and will be cut off' : ''}.`, fix: 'Move it inward — trimming can drift up to 1/16 in either way.', autoFix: 'move-into-safe' });
    }
    if (item.fontSizePt < 5) out.push({ level: 'warn', code: 'TINY_TEXT', ...where, message: `${page.label}: ${fmt(item.fontSizePt)} pt text ${name} may not be legible.`, fix: 'Use 6 pt or larger; 8 pt+ for body copy.' });
    if (item.onDarkBackground && item.fontSizePt < cond.minReverseTextPt) out.push({ level: 'warn', code: 'SMALL_REVERSE', ...where, message: `${page.label}: ${fmt(item.fontSizePt)} pt light-on-dark text ${name} can fill in on ${cond.label}.`, fix: `Use ${cond.minReverseTextPt} pt+ and a heavier weight for reversed text.` });
    if (cond.colorModel === 'CMYK' && item.fontSizePt < 14 && isNearBlackNotPure(item.color)) out.push({ level: 'warn', code: 'RICH_BLACK_TEXT', ...where, message: `${page.label}: small dark text ${name} (${item.color}) will print in four inks and look blurry if plates shift.`, fix: 'Use pure black (#000000); export prints pure black text in black ink only.', autoFix: 'pure-black-text' });
    if (item.fontEmbeddable === false) out.push({ level: 'error', code: 'FONT_LICENSE', ...where, message: `${page.label}: font “${item.fontFamily}” can’t be embedded.`, fix: 'Choose another font, or outline the text.', autoFix: 'outline-text' });
  }

  if (item.kind === 'shape') {
    if (item.stroke && item.strokePt !== undefined && item.strokePt > 0 && item.strokePt < cond.minStrokePt) out.push({ level: 'warn', code: 'HAIRLINE', ...where, message: `${page.label}: ${fmt(item.strokePt)} pt line ${name} may disappear on ${cond.label}.`, fix: `Use at least ${cond.minStrokePt} pt.` });
    if (item.spot && !spec.spotColors.some(s => s.name === item.spot)) out.push({ level: 'warn', code: 'UNKNOWN_SPOT', ...where, message: `${page.label}: ${name} uses spot colour “${item.spot}”, which isn’t in the job.`, fix: 'Add it to the job’s spot colours or convert it to process.' });
    if (item.fill && edges.length) needsBleed();
  }
}

const rank = (l: PreflightFinding['level']) => (l === 'error' ? 0 : l === 'warn' ? 1 : 2);
const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export function preflightSummary(findings: PreflightFinding[]) {
  const errors = findings.filter(f => f.level === 'error').length;
  const warnings = findings.filter(f => f.level === 'warn').length;
  return { errors, warnings, info: findings.length - errors - warnings, ready: errors === 0 };
}
