// svg — render a StoryLayout as SVG paths built from the engine's own glyph outlines.
//
// No <text> elements: every glyph is a path at the exact position the composer chose, so the
// result is byte-identical in every browser, in puppeteer proofs, in exported SVG files and
// in thumbnails, and needs no font loading on the viewing side. One <path> per glyph run keeps
// the DOM small; decorations are rects (highlight under, underline/strike over).

import type { TextEngine } from '../engine/wasm';
import type { DecorationRect, GlyphRun, LaidLine, StoryLayout } from '../layout/flow';
import { OutlineCache, opsToSvg } from './outlines';
import { escapeHtml } from '../convert';

export interface SvgOptions {
  precision?: number;
  /** Draw frame and column outlines (debug / proof). */
  showFrames?: boolean;
  /** Draw baselines (debug / proof). */
  showBaselines?: boolean;
  background?: string;
  /** Override run colour (e.g. for selection-inverted text). */
  color?: (run: GlyphRun) => string;
}

const caches = new WeakMap<TextEngine, OutlineCache>();
export function outlineCacheFor(engine: TextEngine): OutlineCache {
  let c = caches.get(engine);
  if (!c) caches.set(engine, (c = new OutlineCache(engine)));
  return c;
}

/** SVG path data for one glyph run in page coordinates. */
export function runPath(cache: OutlineCache, run: GlyphRun, precision = 2): string {
  const upem = cache.engine.metrics(run.font).upem;
  const s = run.size / upem;
  cache.prefetch(run.font, run.glyphs);
  let d = '';
  for (let i = 0; i < run.glyphs.length; i++) {
    const o = cache.get(run.font, run.glyphs[i]);
    if (o.ops.length) d += opsToSvg(o.ops, run.xs[i], run.ys[i], s * run.scaleX, -s, precision);
  }
  return d;
}

function decoSvg(d: DecorationRect, p: number): string {
  const f = (v: number) => v.toFixed(p);
  if (d.kind === 'border') return `<rect x="${f(d.x)}" y="${f(d.y)}" width="${f(d.width)}" height="${f(d.height)}" fill="none" stroke="${escapeHtml(d.color)}" stroke-width="${escapeHtml(d.style ?? '1')}"/>`;
  if ((d.kind === 'underline') && d.style === 'wavy') {
    const amp = Math.max(0.8, d.height);
    let path = `M${f(d.x)} ${f(d.y + d.height / 2)}`;
    for (let x = d.x, k = 0; x < d.x + d.width; x += amp * 2, k++) path += `q${f(amp)} ${f(k % 2 ? amp : -amp)} ${f(amp * 2)} 0`;
    return `<path d="${path}" fill="none" stroke="${escapeHtml(d.color)}" stroke-width="${f(d.height)}"/>`;
  }
  return `<rect x="${f(d.x)}" y="${f(d.y)}" width="${f(d.width)}" height="${f(d.height)}" fill="${escapeHtml(d.color)}"/>`;
}

/** Inner SVG markup (no <svg> wrapper) for a layout. */
export function layoutToSvgMarkup(engine: TextEngine, layout: StoryLayout, opts: SvgOptions = {}): string {
  const cache = outlineCacheFor(engine);
  const p = opts.precision ?? 2;
  const parts: string[] = [];
  for (const fl of layout.frames) {
    if (opts.showFrames) {
      const fr = fl.frame;
      parts.push(`<rect x="${fr.x}" y="${fr.y}" width="${fr.width}" height="${fr.height}" fill="none" stroke="#9ab" stroke-width="0.5" stroke-dasharray="3 2"/>`);
      for (const c of fl.columns) parts.push(`<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${c.width.toFixed(2)}" height="${c.height.toFixed(2)}" fill="none" stroke="#cde" stroke-width="0.5"/>`);
    }
    for (const d of fl.decorations) if (d.kind === 'shading' || d.kind === 'highlight') parts.push(decoSvg(d, p));
    if (opts.showBaselines) for (const l of fl.lines) parts.push(`<line x1="${l.x.toFixed(2)}" x2="${(l.x + l.width).toFixed(2)}" y1="${l.baseline.toFixed(2)}" y2="${l.baseline.toFixed(2)}" stroke="#f0a0a0" stroke-width="0.3"/>`);
    // Merge consecutive runs of the same colour into one path.
    let curColor = '';
    let curD = '';
    const flush = () => { if (curD) parts.push(`<path d="${curD}" fill="${escapeHtml(curColor)}"/>`); curD = ''; };
    for (const l of fl.lines) {
      for (const r of l.runs) {
        const color = opts.color?.(r) ?? r.color;
        if (color !== curColor) { flush(); curColor = color; }
        curD += runPath(cache, r, p);
      }
    }
    flush();
    for (const d of fl.decorations) if (d.kind !== 'shading' && d.kind !== 'highlight') parts.push(decoSvg(d, p));
  }
  return parts.join('');
}

/** A complete standalone SVG document covering the frames' bounding box (or `viewBox`). */
export function layoutToSvg(engine: TextEngine, layout: StoryLayout, opts: SvgOptions & { viewBox?: [number, number, number, number] } = {}): string {
  const fr = layout.frames.map(f => f.frame);
  const vb = opts.viewBox ?? [Math.min(...fr.map(f => f.x)), Math.min(...fr.map(f => f.y)), Math.max(...fr.map(f => f.x + f.width)) - Math.min(...fr.map(f => f.x)), Math.max(...fr.map(f => f.y + f.height)) - Math.min(...fr.map(f => f.y))];
  const bg = opts.background ? `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${escapeHtml(opts.background)}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}">${bg}${layoutToSvgMarkup(engine, layout, opts)}</svg>`;
}

/** Path data for a single line (e.g. per-line animation). */
export function linePath(engine: TextEngine, line: LaidLine, precision = 2): string {
  const cache = outlineCacheFor(engine);
  return line.runs.map(r => runPath(cache, r, precision)).join('');
}
