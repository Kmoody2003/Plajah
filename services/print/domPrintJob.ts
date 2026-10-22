// domPrintJob — read a rendered Tela page the way a prepress operator reads a PDF.
//
// Tela lays devices out in flow (writer text, figures, vector overlays), so the rendered DOM is the
// only place positions really exist. The Prepress panel renders each page off-screen at natural size
// (96 px = 1 in) and this module measures it into the neutral JobPage that preflight.ts checks, then
// rasterises it at press resolution for pressPdf.ts. Browser only.

import type { JobItem, JobPage, RectIn } from './types';
import { PX_PER_IN } from './types';
import { toPressCmyk, flattenOnWhite } from './pressPdf';

const MAX_TEXT_ITEMS = 600;

const rectIn = (r: DOMRect, origin: DOMRect, scale: number): RectIn => ({
  x: (r.left - origin.left) / scale / PX_PER_IN, y: (r.top - origin.top) / scale / PX_PER_IN,
  w: r.width / scale / PX_PER_IN, h: r.height / scale / PX_PER_IN,
});

const parseRgb = (c: string): [number, number, number, number] | null => {
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
};
const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function backgroundBehind(el: Element | null, stop: Element): [number, number, number] {
  for (let n = el; n && n !== stop.parentElement; n = n.parentElement) {
    const bg = parseRgb(getComputedStyle(n).backgroundColor);
    if (bg && bg[3] > 0.5) return [bg[0], bg[1], bg[2]];
  }
  return [255, 255, 255];
}

/** Wait until fonts and images inside `el` are ready, so measurements and rasters are final. */
export async function settle(el: HTMLElement): Promise<void> {
  try { await (document as any).fonts?.ready; } catch { /* */ }
  await Promise.all(Array.from(el.querySelectorAll('img')).map(img => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
  // One frame for layout — but a hidden tab never runs rAF, so don't wait on it forever.
  await new Promise(r => { requestAnimationFrame(() => r(null)); setTimeout(() => r(null), 60); });
}

/**
 * Measure a rendered page. `scale` is the CSS scale the page is drawn at (1 = natural size).
 * Fonts in Tela come from Google Fonts (open licences), so embeddability is assumed unless a font is
 * a system fallback the browser substituted — those are flagged by family name only.
 */
export function measurePage(el: HTMLElement, page: { id: string; label: string; trimIn: [number, number]; isCover?: boolean }, scale = 1): JobPage {
  const origin = el.getBoundingClientRect();
  const items: JobItem[] = [];

  el.querySelectorAll('img').forEach((img, i) => {
    const r = img.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || !img.naturalWidth) return;
    items.push({ kind: 'image', id: `img${i}`, rect: rectIn(r, origin, scale), pixelW: img.naturalWidth, pixelH: img.naturalHeight, colorSpace: 'rgb', label: img.alt || undefined });
  });
  el.querySelectorAll('canvas').forEach((cv, i) => {
    const r = cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    items.push({ kind: 'image', id: `cv${i}`, rect: rectIn(r, origin, scale), pixelW: cv.width, pixelH: cv.height, colorSpace: 'rgb', label: 'canvas layer' });
  });

  // Text: one item per text node with visible glyphs.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null; let t = 0;
  const range = document.createRange();
  while ((n = walker.nextNode()) && t < MAX_TEXT_ITEMS) {
    const text = n.textContent?.trim();
    const parent = n.parentElement;
    if (!text || !parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const color = parseRgb(cs.color) || [0, 0, 0, 1];
    const bg = backgroundBehind(parent, el);
    items.push({
      kind: 'text', id: `t${t++}`, rect: rectIn(r, origin, scale),
      fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      fontSizePt: (parseFloat(cs.fontSize) || 12) * 0.75,
      color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
      onDarkBackground: luminance(bg) < 90 && luminance(color) > luminance(bg) + 60,
      label: text.slice(0, 32),
    });
  }

  // Vector shapes: strokes (for hairlines) and filled shapes touching the trim (for bleed).
  el.querySelectorAll('svg path, svg rect, svg line, svg polyline, svg polygon, svg circle, svg ellipse').forEach((shape, i) => {
    const g = shape as SVGGraphicsElement;
    const r = g.getBoundingClientRect();
    if (r.width < 0.5 && r.height < 0.5) return;
    const cs = getComputedStyle(g);
    const ctm = g.getScreenCTM();
    const unit = ctm ? Math.hypot(ctm.a, ctm.b) / scale : 1;
    const hasStroke = cs.stroke && cs.stroke !== 'none';
    const sw = parseFloat(cs.strokeWidth) || 0;
    const hasFill = cs.fill && cs.fill !== 'none' && !/rgba\([^)]*,\s*0\)/.test(cs.fill);
    items.push({
      kind: 'shape', id: `s${i}`, rect: rectIn(r, origin, scale),
      fill: hasFill ? cs.fill : undefined,
      stroke: hasStroke ? cs.stroke : undefined,
      strokePt: hasStroke ? sw * unit * 0.75 : undefined,
    });
  });

  // Coloured block backgrounds that run to the edge also need bleed.
  el.querySelectorAll<HTMLElement>('div, section, header, figure').forEach((block, i) => {
    const bg = parseRgb(getComputedStyle(block).backgroundColor);
    if (!bg || bg[3] < 0.5 || (bg[0] > 250 && bg[1] > 250 && bg[2] > 250)) return;
    const r = block.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    items.push({ kind: 'shape', id: `bg${i}`, rect: rectIn(r, origin, scale), fill: getComputedStyle(block).backgroundColor });
  });

  return { id: page.id, label: page.label, trimIn: page.trimIn, items, isCover: page.isCover };
}

/** Rasterise a rendered page at `dpi`. Returns RGBA at trim size. */
export async function rasterizePage(el: HTMLElement, dpi: number): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(el, { scale: dpi / PX_PER_IN, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: img.data };
}

/** Rasterise one region of a rendered page (CSS px at natural size) at `pxScale` device px per CSS px. */
export async function rasterizeRegion(el: HTMLElement, region: { x: number; y: number; w: number; h: number }, pxScale: number): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const html2canvas = (await import('html2canvas')).default;
  // html2canvas crops in document coordinates, not element coordinates.
  const box = el.getBoundingClientRect();
  const x = box.left + window.scrollX + region.x, y = box.top + window.scrollY + region.y;
  const canvas = await html2canvas(el, { x, y, width: region.w, height: region.h, scale: pxScale, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: img.data };
}

/** Highest total ink on the page under a condition's separation, from a low-res raster. */
export function sampleMaxTac(raster: { width: number; height: number; data: Uint8ClampedArray }, tacPct: number, gcr: number): number {
  // Separate without the limit (400%) to see what the design asks for; the export then caps it.
  void tacPct;
  return toPressCmyk({ ...raster, data: flattenOnWhite(raster.data) }, 400, gcr).maxTac;
}

/** Soft proof: what the press condition can reproduce, plus a mask of out-of-gamut pixels. */
export async function softProof(raster: { width: number; height: number; data: Uint8ClampedArray }, tacPct: number, gcr: number): Promise<{ proof: ImageData; gamutPct: number }> {
  const { softProofBitmap, gamutWarningMask } = await import('../tela/raster/color');
  const bm = { width: raster.width, height: raster.height, data: flattenOnWhite(raster.data) };
  const p = softProofBitmap(bm, { gcr, inkLimit: tacPct / 100 });
  const mask = gamutWarningMask(bm, 14, { gcr, inkLimit: tacPct / 100 });
  let out = 0; for (let i = 0; i < mask.length; i++) if (mask[i]) out++;
  return { proof: new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), gamutPct: (out / mask.length) * 100 };
}
