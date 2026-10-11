// document/render — a laid-out page as a DISPLAY LIST, and the display list as SVG.
//
// The display list is the one description of a page that every output shares: the editor's
// SVG pages, read-only embeds (Fabula, The Post Man, feeds), print, and the PDF writer
// (../pdf). Items are glyph runs (engine glyph ids at composer positions — never <text>),
// rectangles, rules, wavy underlines and images, in paint order. Field results (page numbers,
// note numbers, cross-references) are shaped here into glyph runs at their object's position.

import type { TextEngine } from '../engine/wasm';
import type { DecorationRect, GlyphRun, LaidLine, StoryLayout } from '../layout/flow';
import { runSpecFor, type LayoutEnv } from '../layout/paragraph';
import { outlineCacheFor, runPath } from '../render/svg';
import { escapeHtml } from '../convert';
import { type Paragraph, type ResolvedChar, type TextStory, paragraphText, resolveParagraph } from '../model';
import type { DocLayout, PageLayout, PlacedTable, SubLayout } from './paginate';
import type { WriterDocument } from './types';
import { NOTE_REF_RAISE, NOTE_REF_SCALE } from './display';

export type DisplayItem =
  | { kind: 'glyphs'; run: GlyphRun; dx: number; dy: number; color: string; /** Source text the run's clusters index (PDF ToUnicode). */ source?: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; fill?: string; stroke?: string; strokeWidth?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: number[] }
  | { kind: 'wavy'; x: number; y: number; width: number; color: string; amplitude: number; thickness: number }
  | { kind: 'image'; src: string; x: number; y: number; width: number; height: number; mediaId?: string; mime?: string };

export interface PageDisplayList { width: number; height: number; items: DisplayItem[]; links: { x: number; y: number; width: number; height: number; href: string }[] }

export interface RenderOptions {
  /** Attach source text to glyph items (PDF text extraction). */
  withText?: boolean;
  /** Skip header/footer stories (editing overlays draw them separately). */
  skipHeaders?: boolean;
  /** Draw "¶"-style formatting marks. */
  showMarks?: boolean;
}

function textIndex(doc: WriterDocument): Map<string, string> {
  const m = new Map<string, string>();
  const add = (s: TextStory) => { for (const p of s.paragraphs) { if (p.table) { for (const r of p.table.rows) for (const c of r.cells) add(c.story); } else m.set(p.id, paragraphText(p)); } };
  add(doc.story);
  for (const n of Object.values(doc.notes)) add(n.story);
  for (const h of Object.values(doc.headerFooters)) add(h);
  return m;
}

function shapeGenerated(env: LayoutEnv, attrs: ResolvedChar, text: string, x: number, baseline: number, sup: boolean, paragraphId: string): GlyphRun | null {
  if (!text) return null;
  const size = sup ? attrs.fontSize * NOTE_REF_SCALE : attrs.fontSize;
  const para = resolveParagraph(env.sheet, { id: '', runs: [] } as Paragraph).para;
  const spec = runSpecFor(env, { ...attrs, fontSize: size, position: 'normal', field: undefined, object: undefined } as ResolvedChar, 0, text.length, text, para);
  const shaped = env.engine.shape(text, spec);
  const y = baseline - (sup ? attrs.fontSize * NOTE_REF_RAISE : 0);
  let pen = x;
  const xs: number[] = [], ys: number[] = [];
  for (const g of shaped) { xs.push(pen + g.xOffset); ys.push(y - g.yOffset); pen += g.xAdvance; }
  return { font: shaped[0]?.font ?? spec.fonts[0], size, color: attrs.color, y, x, width: pen - x, scaleX: 1, level: 0, flags: 0, glyphs: shaped.map(g => g.gid), xs, ys, clusters: shaped.map(g => g.cluster), styleIndex: -3, attrs, paragraphId };
}

function decoItems(d: DecorationRect, dx: number, dy: number): DisplayItem[] {
  const x = d.x + dx, y = d.y + dy;
  if (d.kind === 'border') return [{ kind: 'rect', x, y, width: d.width, height: d.height, stroke: d.color, strokeWidth: Number(d.style ?? 1) }];
  if (d.kind === 'underline' && d.style === 'wavy') return [{ kind: 'wavy', x, y: y + d.height / 2, width: d.width, color: d.color, amplitude: Math.max(0.8, d.height), thickness: d.height }];
  if (d.kind === 'underline' && d.style === 'double') return [{ kind: 'rect', x, y, width: d.width, height: d.height, fill: d.color }, { kind: 'rect', x, y: y + d.height * 2.2, width: d.width, height: d.height, fill: d.color }];
  if (d.kind === 'underline' && (d.style === 'dotted' || d.style === 'dashed')) return [{ kind: 'line', x1: x, y1: y + d.height / 2, x2: x + d.width, y2: y + d.height / 2, color: d.color, width: d.height, dash: d.style === 'dotted' ? [d.height, d.height * 1.6] : [d.height * 4, d.height * 2] }];
  return [{ kind: 'rect', x, y, width: d.width, height: d.height, fill: d.color }];
}

/** Lines → display items (under-decorations, glyphs, objects, fields, over-decorations). */
function linesItems(env: LayoutEnv, doc: WriterDocument, lines: LaidLine[], decorations: DecorationRect[], dx: number, dy: number, out: DisplayItem[], links: PageDisplayList['links'], texts: Map<string, string> | null) {
  for (const d of decorations) if (d.kind === 'shading' || d.kind === 'highlight') out.push(...decoItems(d, dx, dy));
  for (const l of lines) {
    for (const r of l.runs) {
      const a = r.attrs;
      if (a.object) {
        const x = (r.xs[0] ?? r.x) + dx;
        if (a.field) {
          const sup = a.field.kind === 'noteRef' || a.field.kind === 'noteNumber';
          const g = shapeGenerated(env, a, a.field.result ?? '', r.xs[0] ?? r.x, l.baseline, sup, r.paragraphId);
          if (g) out.push({ kind: 'glyphs', run: g, dx, dy, color: a.color, source: texts ? a.field.result : undefined });
        } else if (a.object.id !== 'hidden' && a.object.width > 0) {
          const media = doc.media[a.object.id];
          if (media) out.push({ kind: 'image', src: media.src, x, y: l.baseline - a.object.ascent + dy, width: a.object.width, height: a.object.ascent + a.object.descent, mediaId: media.id, mime: media.mime });
        }
        continue;
      }
      if (!r.glyphs.length) continue;
      out.push({ kind: 'glyphs', run: r, dx, dy, color: r.color, source: texts?.get(r.paragraphId) });
      if (a.href) links.push({ x: r.x + dx, y: l.top + dy, width: r.width, height: l.bottom - l.top, href: a.href });
    }
  }
  for (const d of decorations) if (d.kind !== 'shading' && d.kind !== 'highlight') out.push(...decoItems(d, dx, dy));
}

function subItems(env: LayoutEnv, doc: WriterDocument, s: SubLayout, out: DisplayItem[], links: PageDisplayList['links'], texts: Map<string, string> | null) {
  for (const f of s.layout.frames) linesItems(env, doc, f.lines, f.decorations, s.dx, s.dy, out, links, texts);
}

function tableItems(env: LayoutEnv, doc: WriterDocument, t: PlacedTable, out: DisplayItem[], links: PageDisplayList['links'], texts: Map<string, string> | null) {
  for (const c of t.cells) if (c.shading) out.push({ kind: 'rect', x: c.box.x, y: c.box.y, width: c.box.width, height: c.box.height, fill: c.shading });
  for (const c of t.cells) subItems(env, doc, c, out, links, texts);
  for (const b of t.borders) {
    const dash = b.spec.style === 'dashed' ? [b.spec.width * 4, b.spec.width * 2] : b.spec.style === 'dotted' ? [b.spec.width, b.spec.width * 1.5] : undefined;
    if (b.spec.style === 'double') {
      const o = Math.max(1, b.spec.width);
      const vertical = Math.abs(b.x1 - b.x2) < 0.01;
      out.push({ kind: 'line', x1: b.x1 - (vertical ? o : 0), y1: b.y1 - (vertical ? 0 : o), x2: b.x2 - (vertical ? o : 0), y2: b.y2 - (vertical ? 0 : o), color: b.spec.color, width: b.spec.width / 2 });
      out.push({ kind: 'line', x1: b.x1 + (vertical ? o : 0), y1: b.y1 + (vertical ? 0 : o), x2: b.x2 + (vertical ? o : 0), y2: b.y2 + (vertical ? 0 : o), color: b.spec.color, width: b.spec.width / 2 });
    } else out.push({ kind: 'line', x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, color: b.spec.color, width: b.spec.width, dash });
  }
}

/** Everything drawn on one page, in paint order. */
export function pageDisplayList(env: LayoutEnv, doc: WriterDocument, page: PageLayout, opts: RenderOptions = {}): PageDisplayList {
  const items: DisplayItem[] = [];
  const links: PageDisplayList['links'] = [];
  const texts = opts.withText ? textIndex(doc) : null;
  const media = (id: string) => doc.media[id];
  for (const f of page.floats) if (f.float.wrap === 'behind') { const m = media(f.float.mediaId); if (m) items.push({ kind: 'image', src: m.src, ...f.box, mediaId: m.id, mime: m.mime }); }
  if (!opts.skipHeaders) {
    if (page.header) subItems(env, doc, page.header, items, links, texts);
    if (page.footer) subItems(env, doc, page.footer, items, links, texts);
  }
  linesItems(env, doc, page.lines, page.decorations, 0, 0, items, links, texts);
  for (const m of page.markers) items.push({ kind: 'glyphs', run: m, dx: 0, dy: 0, color: m.color, source: texts ? undefined : undefined });
  for (const t of page.tables) tableItems(env, doc, t, items, links, texts);
  if (page.noteSeparator) items.push({ kind: 'line', x1: page.noteSeparator.x, y1: page.noteSeparator.y, x2: page.noteSeparator.x + page.noteSeparator.width, y2: page.noteSeparator.y, color: '#6b6478', width: 0.6 });
  for (const n of page.notes) subItems(env, doc, n, items, links, texts);
  for (const s of page.separators) items.push({ kind: 'line', x1: s.x, y1: s.y1, x2: s.x, y2: s.y2, color: '#8a8396', width: 0.6 });
  for (const f of page.floats) if (f.float.wrap !== 'behind') { const m = media(f.float.mediaId); if (m) items.push({ kind: 'image', src: m.src, ...f.box, mediaId: m.id, mime: m.mime }); }
  return { width: page.width, height: page.height, items, links };
}

// ── SVG ─────────────────────────────────────────────────────────────────────────────────────

const f2 = (v: number) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };

export function displayListToSvgMarkup(engine: TextEngine, list: PageDisplayList): string {
  const cache = outlineCacheFor(engine);
  const parts: string[] = [];
  let color = '';
  let d = '';
  const flush = () => { if (d) parts.push(`<path d="${d}" fill="${escapeHtml(color)}"/>`); d = ''; };
  for (const it of list.items) {
    if (it.kind === 'glyphs') {
      if (it.color !== color) { flush(); color = it.color; }
      if (it.dx || it.dy) {
        const r = it.run;
        d += runPath(cache, { ...r, xs: r.xs.map(x => x + it.dx), ys: r.ys.map(y => y + it.dy) }, 2);
      } else d += runPath(cache, it.run, 2);
      continue;
    }
    flush();
    switch (it.kind) {
      case 'rect':
        parts.push(`<rect x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.width)}" height="${f2(it.height)}" fill="${it.fill ? escapeHtml(it.fill) : 'none'}"${it.stroke ? ` stroke="${escapeHtml(it.stroke)}" stroke-width="${f2(it.strokeWidth ?? 1)}"` : ''}/>`);
        break;
      case 'line':
        parts.push(`<line x1="${f2(it.x1)}" y1="${f2(it.y1)}" x2="${f2(it.x2)}" y2="${f2(it.y2)}" stroke="${escapeHtml(it.color)}" stroke-width="${f2(it.width)}"${it.dash ? ` stroke-dasharray="${it.dash.map(f2).join(' ')}"` : ''}/>`);
        break;
      case 'wavy': {
        const a = it.amplitude;
        let p = `M${f2(it.x)} ${f2(it.y)}`;
        for (let x = it.x, k = 0; x < it.x + it.width; x += a * 2, k++) p += `q${f2(a)} ${f2(k % 2 ? a : -a)} ${f2(a * 2)} 0`;
        parts.push(`<path d="${p}" fill="none" stroke="${escapeHtml(it.color)}" stroke-width="${f2(it.thickness)}"/>`);
        break;
      }
      case 'image':
        parts.push(`<image href="${escapeHtml(it.src)}" x="${f2(it.x)}" y="${f2(it.y)}" width="${f2(it.width)}" height="${f2(it.height)}" preserveAspectRatio="none"/>`);
        break;
    }
  }
  flush();
  return parts.join('');
}

export function pageToSvg(env: LayoutEnv, doc: WriterDocument, page: PageLayout, opts: RenderOptions & { background?: string } = {}): string {
  const list = pageDisplayList(env, doc, page, opts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(page.width)} ${f2(page.height)}" width="${f2(page.width)}" height="${f2(page.height)}"><rect width="100%" height="100%" fill="${escapeHtml(opts.background ?? '#ffffff')}"/>${displayListToSvgMarkup(env.engine, list)}</svg>`;
}

/** Plain-text lines of a sub layout (debug / tests). */
export function layoutText(l: StoryLayout, story: TextStory): string[] {
  const t = new Map(story.paragraphs.map(p => [p.id, paragraphText(p)]));
  return l.lines.map(ln => (t.get(ln.paragraphId) ?? '').slice(ln.start, ln.contentEnd));
}

export type { DocLayout };
