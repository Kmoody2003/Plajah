// telaText — text layout for Tela vector TEXT objects.
//
// Pure-ish helpers shared by the SVG renderer (TelaVector), the template engine,
// and the gallery thumbnails. Word-wrapping needs glyph metrics: in a browser we
// measure with a 2D canvas; in node (tests / scripts) we fall back to a tuned
// per-character estimate so layout stays deterministic and close enough.
import type { TelaVectorObject } from '../../types';

let measureCtx: CanvasRenderingContext2D | null | undefined;
function ctx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try { measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; }
  catch { measureCtx = null; }
  return measureCtx;
}

/** Strip CSS `var(--x, fallback)` down to the fallback stack so canvas can parse it. */
export function concreteFontFamily(family?: string): string {
  const f = (family || 'system-ui, sans-serif').replace(/var\(\s*--[\w-]+\s*,\s*([^)]+)\)/g, '$1').trim();
  return f || 'system-ui, sans-serif';
}

export function fontShorthand(o: Pick<TelaVectorObject, 'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle'>): string {
  return `${o.fontStyle === 'italic' ? 'italic ' : ''}${o.fontWeight || 400} ${o.fontSize || 24}px ${concreteFontFamily(o.fontFamily)}`;
}

// Rough advance widths (em) for the estimate path. Tuned against Inter/Georgia averages.
const NARROW = /[iljtfI!.,;:'"|()\[\]\s-]/, WIDE = /[mwMW@%&]/, UPPER = /[A-Z0-9]/;
function estimateWidth(text: string, size: number, tracking = 0): number {
  let w = 0;
  for (const ch of text) {
    w += NARROW.test(ch) ? .3 : WIDE.test(ch) ? .82 : UPPER.test(ch) ? .66 : .52;
    w += tracking;
  }
  return w * size;
}

export function measureText(text: string, o: Pick<TelaVectorObject, 'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle' | 'letterSpacing'>): number {
  const size = o.fontSize || 24;
  const tracking = o.letterSpacing || 0;
  const c = ctx();
  if (c) {
    c.font = fontShorthand(o);
    return c.measureText(text).width + tracking * size * Math.max(0, Array.from(text).length - 1);
  }
  return estimateWidth(text, size, tracking);
}

export function transformText(text: string, mode?: TelaVectorObject['textTransform']): string {
  if (!mode || mode === 'none') return text;
  if (mode === 'uppercase') return text.toUpperCase();
  if (mode === 'lowercase') return text.toLowerCase();
  return text.replace(/(^|\s)(\p{L})/gu, (m, s, l) => s + l.toUpperCase());
}

/** Break one paragraph into lines that fit `maxW`. Never returns an empty array. */
export function wrapLine(text: string, maxW: number, o: Parameters<typeof measureText>[1]): string[] {
  const words = text.split(/(\s+)/).filter(w => w.length);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (/^\s+$/.test(word)) { if (line) line += ' '; continue; }
    const probe = line + word;
    if (line && measureText(probe, o) > maxW) { lines.push(line.trimEnd()); line = word; }
    else line = probe;
  }
  lines.push(line.trimEnd());
  return lines.length ? lines : [''];
}

/** Final display lines for a TEXT object (bound text may override its own text). */
export function layoutTextLines(o: TelaVectorObject, source?: string): string[] {
  const raw = transformText(source ?? o.text ?? '', o.textTransform);
  const paragraphs = raw.split('\n');
  if (!o.wrap || o.w <= 8) return paragraphs;
  return paragraphs.flatMap(p => wrapLine(p, Math.max(8, o.w), o));
}

/** Height (px) the laid-out block occupies — handy for stacking in templates. */
export function textBlockHeight(o: TelaVectorObject, source?: string): number {
  const size = o.fontSize || 24;
  const lines = layoutTextLines(o, source);
  return size + (lines.length - 1) * size * (o.lineHeight ?? 1.22);
}
