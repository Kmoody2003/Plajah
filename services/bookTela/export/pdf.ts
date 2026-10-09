// PDF export from the format-neutral ExportModel. pdf-lib only (already a dependency); NO browser, NO puppeteer.
//
// Tradeoff, decided and documented in docs/BOOK_TELA_UPGRADE.md:
//   * puppeteer is a devDependency (it can't ship to users and can't run in the author's browser), and rasterising
//     every page to a 300 dpi image would make the text unselectable and unsearchable.
//   * So pages are DRAWN: text is real, selectable PDF text in an embedded font; images are embedded; designed
//     chapter openers are drawn from their Tela vector objects through a vector SUBSET (rect, ellipse, line, path,
//     text, image). Gradients are flattened to a solid colour, shadows/blur/blend modes are dropped, rotated text is
//     drawn upright and template fonts are replaced by the book font. Each of those is reported as a warning.
//     An optional `rasterize` hook (browser canvas) can supply PNG snapshots when an exact look matters more than
//     selectable text.
//   * Print PDF: text-led books reuse services/pod/interiorPdf.ts unchanged (justified, widow/orphan control,
//     recto chapter starts). Picture books use the paged drawer below at trim + 0.125in bleed (top/bottom/outside),
//     with mirrored margins from services/pod/printSpec.ts, TrimBox/BleedBox set, page count padded to printer rules.
//   * Screen PDF is RGB with an outline (bookmarks), internal links (contents, choose-your-path) and URI links.
//   * Not produced: tagged PDF (accessibility tree), PDF/A, PDF/X, CMYK conversion. Said plainly in the report.

import { PDFArray, PDFDocument, PDFFont, PDFHexString, PDFName, PDFPage, PDFRef, PDFString, StandardFonts, degrees, popGraphicsState, pushGraphicsState, concatTransformationMatrix, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { TelaVectorObject } from '../../../types';
import type { BookSource } from '../types';
import type { ExportModel, XChapter, XItem } from '../model';
import { BLEED_IN, gutterIn, getTrim, interiorMargins, pageLimits, paddedPageCount, preflight } from '../../pod/printSpec';
import { buildExportMeta, buildSidecar, colophonParagraphs, defaultResolver, newReport, recommendLayout, sniffMime, type ExportOptions, type ExportReport, type Sidecar } from './common';
import { slug, stripTags, unesc } from '../html';

export type PdfMode = 'screen' | 'print';
export interface BookPdfFonts { regular: PDFFont; italic: PDFFont; bold: PDFFont; boldItalic: PDFFont }
export type FontLoader = (doc: PDFDocument) => Promise<BookPdfFonts>;

export interface PdfOptions extends ExportOptions {
  mode: PdfMode;
  /** Print trim id from services/pod/printSpec TRIM_SIZES. Default 5.5x8.5 (text) / 8x10 (picture books). */
  trimId?: string;
  printer?: 'lulu' | 'gelato' | 'blurb' | 'ingramspark' | 'kdp' | 'draft2digital';
  binding?: 'PERFECT_PAPERBACK' | 'HARDCOVER_CASEWRAP' | 'SADDLE_STITCH';
  /** Font embedding. Default: EB Garamond from node_modules (server/tests). Browsers must pass their own loader. */
  fontLoader?: FontLoader;
  /** Optional PNG rasteriser (browser canvas) used for SVG assets pdf-lib cannot embed. */
  rasterize?: (svg: string, w: number, h: number) => Promise<Uint8Array | null>;
  /** Print + text-led: use the existing POD interior pipeline (default true). */
  usePodInterior?: boolean;
}

export interface PdfResult {
  ok: boolean; bytes: Uint8Array; pageCount: number; report: ExportReport; sidecar: Sidecar; fileName: string;
  outline: { title: string; page: number }[];
  kind: 'paged' | 'pod-interior';
  print?: { trimId: string; pageW: number; pageH: number; bleedIn: number; paddedPages: number };
}

const defaultFontLoader: FontLoader = async doc => {
  const mod = await import('../../pod/pdfCommon');
  return mod.embedBookFonts(doc);
};

/** Standard (non-embedded) fonts: only for screen PDFs in environments with no font files. */
export const standardFontLoader: FontLoader = async doc => ({
  regular: await doc.embedFont(StandardFonts.TimesRoman), italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  bold: await doc.embedFont(StandardFonts.TimesRomanBold), boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
});

const inchesToPt = (n: number) => n * 72;

// ── small helpers ────────────────────────────────────────────────────────────

const clean = (font: PDFFont, text: string): string => {
  const set = new Set(font.getCharacterSet());
  let out = '';
  for (const ch of text.replace(/ /g, ' ').replace(/[\t\r]/g, ' ').replace(/[​-‏﻿­]/g, '')) {
    const cp = ch.codePointAt(0)!;
    if (set.has(cp)) out += ch;
    else if (/[‘’]/.test(ch)) out += "'"; else if (/[“”]/.test(ch)) out += '"'; else if (/[–—]/.test(ch)) out += '-'; else if (cp === 0x2026) out += '...'; else if (cp === 0x2192) out += '->'; else if (cp === 0x2022) out += '-'; else out += '?';
  }
  return out;
};

function parseColor(c: string | undefined, fallback = '#000000'): { r: number; g: number; b: number; a: number } | null {
  const s = (c || fallback).trim();
  if (!s || s === 'none' || s === 'transparent') return null;
  let m = /^#([0-9a-f]{3})$/i.exec(s); if (m) { const h = m[1]; return { r: parseInt(h[0] + h[0], 16) / 255, g: parseInt(h[1] + h[1], 16) / 255, b: parseInt(h[2] + h[2], 16) / 255, a: 1 }; }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s); if (m) { const n = parseInt(m[1], 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/i.exec(s); if (m) return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] != null ? +m[4] : 1 };
  return parseColor(fallback === s ? '#000000' : fallback, '#000000');
}

interface Run { text: string; bold: boolean; italic: boolean; sup: boolean; link?: string }

export function parseRuns(html: string, notes?: Map<string, number>): Run[] {
  const runs: Run[] = []; let b = 0, i = 0, sup = 0;
  const parts = (html || '').split(/(<[^>]+>)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<')) {
      const m = /^<(\/?)([a-z0-9]+)/i.exec(part); if (!m) continue;
      const close = !!m[1]; const t = m[2].toLowerCase();
      if (t === 'strong' || t === 'b') b += close ? -1 : 1;
      else if (t === 'em' || t === 'i') i += close ? -1 : 1;
      else if (t === 'sup' || t === 'sub') sup += close ? -1 : 1;
      else if (t === 'br') runs.push({ text: '\n', bold: false, italic: false, sup: false });
      continue;
    }
    for (const piece of part.split(/(\[\[n:[\w-]+\]\])/)) {
      const nm = /^\[\[n:([\w-]+)\]\]$/.exec(piece);
      if (nm) { const n = notes?.get(nm[1]); if (n) runs.push({ text: String(n), bold: false, italic: false, sup: true }); continue; }
      const text = unesc(piece);
      if (text) runs.push({ text, bold: b > 0, italic: i > 0, sup: sup > 0 });
    }
  }
  return runs;
}

const fontFor = (F: BookPdfFonts, r: { bold: boolean; italic: boolean }) => r.bold && r.italic ? F.boldItalic : r.bold ? F.bold : r.italic ? F.italic : F.regular;

interface Seg { text: string; font: PDFFont; size: number; width: number; raise: number }
interface Line { segs: Seg[]; width: number }

function wrapRuns(runs: Run[], F: BookPdfFonts, size: number, maxW: number, indent = 0, forceItalic = false): Line[] {
  const lines: Line[] = []; let cur: Line = { segs: [], width: 0 }; let avail = maxW - indent;
  const newLine = () => { lines.push(cur); cur = { segs: [], width: 0 }; avail = maxW; };
  for (const r of runs) {
    const font = fontFor(F, { bold: r.bold, italic: r.italic || forceItalic }); const sz = r.sup ? size * 0.65 : size;
    for (const tok of r.text.split(/(\n|\s+)/)) {
      if (!tok) continue;
      if (tok === '\n') { newLine(); continue; }
      const isSpace = /^\s+$/.test(tok);
      const text = isSpace ? ' ' : clean(font, tok);
      const w = font.widthOfTextAtSize(text, sz);
      if (isSpace && !cur.segs.length) continue;
      if (!isSpace && cur.width + w > avail && cur.segs.length) { while (cur.segs.length && cur.segs[cur.segs.length - 1].text === ' ') { cur.width -= cur.segs.pop()!.width; } newLine(); }
      cur.segs.push({ text, font, size: sz, width: w, raise: r.sup ? size * 0.35 : 0 }); cur.width += w;
    }
  }
  if (cur.segs.length || !lines.length) lines.push(cur);
  return lines;
}

// ── page builder ─────────────────────────────────────────────────────────────

interface LinkRec { page: PDFPage; rect: [number, number, number, number]; uri?: string; chapterId?: string }

interface Layout {
  pageW: number; pageH: number; bleedPt: number; print: boolean;
  margins: (pageNo: number) => { left: number; right: number; top: number; bottom: number };
  trimBox: (pageNo: number) => [number, number, number, number];
  size: number; leading: number;
}

class Builder {
  doc!: PDFDocument; F!: BookPdfFonts;
  pages: PDFPage[] = [];
  page!: PDFPage; y = 0; pageNo = 0;
  links: LinkRec[] = [];
  chapterStart = new Map<string, { page: PDFPage; y: number; no: number }>();
  warnings = new Set<string>();
  outline: { title: string; page: PDFPage; y: number; no: number; level: number }[] = [];
  missing: string[] = [];
  noteNums = new Map<string, number>();
  constructor(public L: Layout, public model: ExportModel, public opts: PdfOptions, public assets: (u: string) => Promise<{ bytes: Uint8Array; mime: string } | null>) {}

  m() { return this.L.margins(this.pageNo); }
  textW() { const m = this.m(); return this.L.pageW - m.left - m.right; }
  top() { return this.L.pageH - this.m().top; }
  bottom() { return this.m().bottom; }

  newPage(): PDFPage {
    this.page = this.doc.addPage([this.L.pageW, this.L.pageH]);
    this.pages.push(this.page); this.pageNo = this.pages.length; this.y = this.top();
    if (this.L.print) {
      const [x0, y0, x1, y1] = this.L.trimBox(this.pageNo);
      this.page.setTrimBox(x0, y0, x1 - x0, y1 - y0); this.page.setBleedBox(0, 0, this.L.pageW, this.L.pageH); this.page.setCropBox(0, 0, this.L.pageW, this.L.pageH);
    }
    return this.page;
  }
  blank() { this.newPage(); }
  folio() {
    const m = this.m(); const t = String(this.pageNo); const w = this.F.regular.widthOfTextAtSize(t, 9);
    const rect = this.L.print ? this.L.trimBox(this.pageNo) : [0, 0, this.L.pageW, this.L.pageH];
    const center = (rect[0] + rect[2]) / 2;
    this.page.drawText(t, { x: center - w / 2, y: Math.max(14, m.bottom * 0.45), size: 9, font: this.F.regular, color: rgb(0.35, 0.35, 0.35) });
  }
  ensure(h: number) { if (this.y - h < this.bottom()) { this.folio(); this.newPage(); } }

  drawLines(lines: Line[], opts: { indent?: number; size?: number; leading?: number; align?: 'left' | 'center'; color?: ReturnType<typeof rgb>; link?: string } = {}) {
    const size = opts.size ?? this.L.size; const leading = opts.leading ?? this.L.leading;
    for (let i = 0; i < lines.length; i++) {
      this.ensure(leading);
      const m = this.m(); const ln = lines[i];
      let x = m.left + (i === 0 ? opts.indent ?? 0 : 0);
      if (opts.align === 'center') x = m.left + (this.textW() - ln.width) / 2;
      const startX = x;
      for (const s of ln.segs) {
        if (s.text !== ' ') this.page.drawText(s.text, { x, y: this.y - size + s.raise, size: s.size, font: s.font, color: opts.color ?? rgb(0.08, 0.07, 0.06) });
        x += s.width;
      }
      if (opts.link) this.links.push({ page: this.page, rect: [startX, this.y - size - 2, x, this.y + 2], uri: opts.link });
      this.y -= leading;
    }
  }

  paragraph(html: string, o: { indent?: number; size?: number; italic?: boolean; gapAfter?: number; align?: 'left' | 'center'; bold?: boolean } = {}) {
    const size = o.size ?? this.L.size; const leading = o.size ? o.size * 1.38 : this.L.leading;
    const runs = parseRuns(html, this.noteNums).map(r => (o.bold ? { ...r, bold: true } : r));
    const lines = wrapRuns(runs, this.F, size, this.textW() - (o.indent && o.indent < 0 ? 0 : 0), 0, o.italic);
    // orphan/widow: keep at least 2 lines together when splitting
    if (lines.length >= 2 && this.y - leading * 2 < this.bottom()) { this.folio(); this.newPage(); }
    this.drawLines(lines, { size, leading, indent: o.indent, align: o.align });
    this.y -= o.gapAfter ?? 0;
  }

  async image(src: string, alt: string, caption?: string, maxH?: number) {
    const a = await this.assets(src);
    let img: any = null;
    if (a) {
      const mime = a.mime || sniffMime(a.bytes);
      try { img = mime === 'image/png' ? await this.doc.embedPng(a.bytes) : mime === 'image/jpeg' ? await this.doc.embedJpg(a.bytes) : null; } catch { img = null; }
      if (!img && mime === 'image/svg+xml' && this.opts.rasterize) {
        const png = await this.opts.rasterize(new TextDecoder().decode(a.bytes), 1600, 1200).catch(() => null);
        if (png) { try { img = await this.doc.embedPng(png); } catch { img = null; } }
      }
      if (!img) this.warnings.add(`An image in ${mime || 'an unsupported format'} cannot be embedded in a PDF here; its alt text is shown instead.`);
    } else this.missing.push(src.startsWith('data:') ? 'inline image' : src);
    if (!img) { this.paragraph(`<em>${alt || 'Image not available in this file.'}</em>`, { gapAfter: 6 }); return; }
    const w0 = this.textW(); const hMax = Math.min(maxH ?? (this.top() - this.bottom()) * 0.8, this.top() - this.bottom() - (caption ? 30 : 0));
    const sc = Math.min(w0 / img.width, hMax / img.height, 3);
    const w = img.width * sc, h = img.height * sc;
    this.ensure(h + (caption ? 22 : 0) + 8);
    const m = this.m();
    this.page.drawImage(img, { x: m.left + (w0 - w) / 2, y: this.y - h, width: w, height: h });
    this.y -= h + 6;
    if (caption) this.paragraph(`<em>${caption.replace(/&/g, '&amp;')}</em>`, { size: this.L.size * 0.85, align: 'center', gapAfter: 8 });
    else this.y -= 4;
  }

  async fullPageImage(src: string, caption?: string) {
    // Picture-book page: image fills the live area (print: bleeds on 3 edges when the aspect allows).
    this.folio();
    this.newPage();
    await this.image(src, '', caption, (this.top() - this.bottom()) * 0.9);
  }

  table(t: Extract<XItem, { t: 'table' }>) {
    const cols = t.header.length; const m = this.m(); const w = this.textW(); const cw = w / cols; const size = this.L.size * 0.85; const rowH = size * 1.6;
    if (t.caption) this.paragraph(`<strong>${t.caption.replace(/&/g, '&amp;')}</strong>`, { size, gapAfter: 3 });
    const rows = [t.header, ...t.rows];
    rows.forEach((r, ri) => {
      this.ensure(rowH);
      r.forEach((c, ci) => {
        const f = ri === 0 || ci === 0 ? this.F.bold : this.F.regular; const txt = clean(f, String(c));
        this.page.drawRectangle({ x: m.left + ci * cw, y: this.y - rowH, width: cw, height: rowH, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
        this.page.drawText(txt.slice(0, Math.max(4, Math.floor(cw / (size * 0.5)))), { x: m.left + ci * cw + 4, y: this.y - rowH + size * 0.45, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      });
      this.y -= rowH;
    });
    this.y -= 8;
  }

  qr(url: string, label: string) {
    const q = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const n = q.modules.size; const px = Math.min(110, this.textW()); const cell = px / (n + 4);
    this.ensure(px + 36);
    const m = this.m(); const x0 = m.left; const y0 = this.y - px;
    this.page.drawRectangle({ x: x0, y: y0, width: px, height: px, color: rgb(1, 1, 1) });
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules.get(r, c)) this.page.drawRectangle({ x: x0 + (c + 2) * cell, y: y0 + px - (r + 3) * cell, width: cell, height: cell, color: rgb(0, 0, 0) });
    this.links.push({ page: this.page, rect: [x0, y0, x0 + px, y0 + px], uri: url });
    this.y -= px + 4;
    const lines = wrapRuns([{ text: label, bold: false, italic: false, sup: false }], this.F, this.L.size * 0.85, this.textW());
    this.drawLines(lines, { size: this.L.size * 0.85, leading: this.L.size * 1.2, color: rgb(0.1, 0.2, 0.7), link: url });
    this.y -= 8;
  }

  // ── vector subset ──────────────────────────────────────────────────────────
  async drawVector(objs: TelaVectorObject[], aw: number, ah: number, x0: number, yTop: number, scale: number) {
    const P = (x: number) => x0 + x * scale; const Y = (y: number) => yTop - y * scale;
    for (const o of objs) {
      const fill = o.gradient ? parseColor(o.gradient.stops[Math.floor(o.gradient.stops.length / 2)]?.color) : parseColor(o.fill, 'none');
      if (o.gradient) this.warnings.add('Gradients on designed pages are drawn as a single flat colour in PDF.');
      if (o.shadow || (o.blur && o.blur > 0)) this.warnings.add('Shadows and blur on designed pages are not drawn in PDF.');
      if (o.blendMode && o.blendMode !== 'normal') this.warnings.add('Blend modes are not drawn in PDF.');
      const stroke = parseColor(o.stroke, 'none');
      const op = Math.max(0, Math.min(1, o.opacity ?? 1));
      const sw = (o.strokeWidth || 0) * scale;
      const common: any = { opacity: fill ? op * fill.a : undefined, borderOpacity: stroke ? op : undefined };
      try {
        if (o.kind === 'RECT') {
          const w = o.w * scale, h = o.h * scale; const cx = P(o.x + o.w / 2), cy = Y(o.y + o.h / 2); const rot = o.rotation ? -o.rotation : 0; const rr = (rot * Math.PI) / 180;
          const bx = cx + (-w / 2) * Math.cos(rr) - (-h / 2) * Math.sin(rr), by = cy + (-w / 2) * Math.sin(rr) + (-h / 2) * Math.cos(rr);
          this.page.drawRectangle({ x: bx, y: by, width: w, height: h, rotate: degrees(rot), color: fill ? rgb(fill.r, fill.g, fill.b) : undefined, borderColor: stroke && sw > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined, borderWidth: stroke && sw > 0 ? sw : 0, ...common });
        } else if (o.kind === 'ELLIPSE') {
          this.page.drawEllipse({ x: P(o.x + o.w / 2), y: Y(o.y + o.h / 2), xScale: (o.w / 2) * scale, yScale: (o.h / 2) * scale, rotate: degrees(o.rotation ? -o.rotation : 0), color: fill ? rgb(fill.r, fill.g, fill.b) : undefined, borderColor: stroke && sw > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined, borderWidth: stroke && sw > 0 ? sw : 0, ...common });
        } else if (o.kind === 'LINE' && o.points && stroke) {
          this.page.drawLine({ start: { x: P(o.points[0]), y: Y(o.points[1]) }, end: { x: P(o.points[2]), y: Y(o.points[3]) }, thickness: Math.max(0.25, sw), color: rgb(stroke.r, stroke.g, stroke.b), opacity: op });
        } else if (o.kind === 'PATH' && o.svgPathData) {
          const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y; const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h);
          this.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx * scale, 0, 0, sy * scale, P(o.x) - ox * sx * scale, Y(o.y) + oy * sy * scale));
          this.page.drawSvgPath(o.svgPathData, { x: 0, y: 0, scale: 1, color: fill ? rgb(fill.r, fill.g, fill.b) : undefined, borderColor: stroke && sw > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined, borderWidth: stroke && sw > 0 ? sw / Math.max(scale * Math.min(sx, sy), 0.0001) : 0, ...common });
          this.page.pushOperators(popGraphicsState());
        } else if (o.kind === 'PATH' && o.points && o.points.length >= 4) {
          let d = `M ${o.points[0] * scale} ${o.points[1] * scale}`; for (let i = 2; i + 1 < o.points.length; i += 2) d += ` L ${o.points[i] * scale} ${o.points[i + 1] * scale}`; if (o.pathClosed) d += ' Z';
          this.page.drawSvgPath(d, { x: x0, y: yTop, scale: 1, color: fill ? rgb(fill.r, fill.g, fill.b) : undefined, borderColor: stroke && sw > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined, borderWidth: stroke && sw > 0 ? sw : 0, ...common });
        } else if (o.kind === 'TEXT') {
          if (o.rotation) this.warnings.add('Rotated text on designed pages is drawn upright in PDF.');
          const bold = (o.fontWeight || 400) >= 600; const italic = o.fontStyle === 'italic'; const font = fontFor(this.F, { bold, italic });
          const sz = (o.fontSize || 24) * scale; const col = fill ?? { r: 0, g: 0, b: 0, a: 1 };
          const text = (o.textTransform === 'uppercase' ? (o.text || '').toUpperCase() : o.text || '');
          const wrapW = o.wrap && o.w > 8 ? o.w * scale : Infinity;
          const lines = wrapRuns([{ text, bold, italic, sup: false }], this.F, sz, wrapW);
          let ty = Y(o.y) - sz; const lead = sz * (o.lineHeight ?? 1.22);
          for (const ln of lines) {
            let tx = P(o.x); if (o.textAlign === 'center') tx = P(o.x + o.w / 2) - ln.width / 2; else if (o.textAlign === 'right') tx = P(o.x + o.w) - ln.width;
            for (const s of ln.segs) { if (s.text !== ' ') this.page.drawText(clean(font, s.text), { x: tx, y: ty, size: sz, font, color: rgb(col.r, col.g, col.b), opacity: op }); tx += s.width; }
            ty -= lead;
          }
          if (o.fontFamily && !/serif|georgia|times|garamond/i.test(o.fontFamily)) this.warnings.add('Template fonts are replaced by the book font in PDF.');
        } else if (o.kind === 'IMAGE' && o.sourceImageSrc) {
          const a = await this.assets(o.sourceImageSrc);
          if (a) { const mime = a.mime || sniffMime(a.bytes); const img = mime === 'image/png' ? await this.doc.embedPng(a.bytes).catch(() => null) : mime === 'image/jpeg' ? await this.doc.embedJpg(a.bytes).catch(() => null) : null; if (img) this.page.drawImage(img, { x: P(o.x), y: Y(o.y + o.h), width: o.w * scale, height: o.h * scale, opacity: op }); else this.warnings.add('A picture inside a designed page is in a format the PDF drawer cannot embed.'); }
        } else if ((o.kind === 'LOTTIE' || o.kind === 'MOTION_TEMPLATE')) {
          const poster = o.kind === 'LOTTIE' ? o.lottie?.posterSrc : o.motionTemplate?.posterSrc;
          const a = poster ? await this.assets(poster) : null;
          if (a) { const mime = a.mime || sniffMime(a.bytes); const img = mime === 'image/png' ? await this.doc.embedPng(a.bytes).catch(() => null) : mime === 'image/jpeg' ? await this.doc.embedJpg(a.bytes).catch(() => null) : null; if (img) this.page.drawImage(img, { x: P(o.x), y: Y(o.y + o.h), width: o.w * scale, height: o.h * scale }); }
          this.warnings.add('Animated elements are drawn as their still poster in PDF.');
        }
      } catch (e) { this.warnings.add(`A drawing instruction on a designed page was skipped (${(e as Error).message.slice(0, 60)}).`); }
    }
  }
}

// ── builder entry ────────────────────────────────────────────────────────────

const plainChapterText = (ch: XChapter): string => {
  const parts: string[] = [];
  for (const it of ch.items) {
    if (it.t === 'block') parts.push(it.kind === 'hr' ? '* * *' : (it.kind === 'li' || it.kind === 'oli' ? '- ' : '') + stripTags(it.html.replace(/\[\[n:[\w-]+\]\]/g, '')));
    else if (it.t === 'figure') parts.push(`[Picture: ${it.alt || it.caption || 'image'}]`);
    else if (it.t === 'table') parts.push([it.caption || '', it.header.join(' | '), ...it.rows.map(r => r.join(' | '))].filter(Boolean).join('\n'));
    else if (it.t === 'qr') parts.push(`${it.label}: ${it.url}`);
    else if (it.t === 'callout') parts.push(stripTags(it.html));
    else if (it.t === 'links') parts.push([it.prompt, ...it.items.map(x => `- ${x.label}`)].filter(Boolean).join('\n'));
  }
  if (ch.notes.length) parts.push('Notes', ...ch.notes.map((n, i) => `${i + 1}. ${n.label && n.kind === 'commentary' ? n.label + '. ' : ''}${stripTags(n.html)}`));
  return parts.filter(Boolean).join('\n\n');
};

export async function buildPdf(book: BookSource, model: ExportModel, opts: PdfOptions): Promise<PdfResult> {
  const print = opts.mode === 'print';
  const meta = buildExportMeta(book, { now: opts.now ?? new Date(model.exportedAt), publisher: opts.publisher });
  const report = newReport(print ? 'PDF_PRINT' : 'PDF_SCREEN', model);
  const visual = recommendLayout(model).layout === 'FIXED';
  const asset = opts.resolveAsset ?? defaultResolver;
  const cache = new Map<string, { bytes: Uint8Array; mime: string } | null>();
  const resolve = async (u: string) => { if (!cache.has(u)) cache.set(u, await asset(u).catch(() => null)); return cache.get(u)!; };
  const chapters = model.chapters.filter(c => c.kind !== 'toc');
  const printer = opts.printer ?? 'lulu'; const binding = opts.binding ?? 'PERFECT_PAPERBACK';
  const trimId = opts.trimId ?? (visual ? '8x10' : '5.5x8.5');

  // text-led print: the existing, tested POD interior
  if (print && !visual && opts.usePodInterior !== false) {
    const { buildInteriorPdf } = await import('../../pod/interiorPdf');
    const ch = chapters.map(c => ({ id: c.id, title: c.title, text: plainChapterText(c) })).filter(c => c.text.trim());
    if (opts.includeColophon !== false) ch.push({ id: 'colophon', title: 'Exported from Plajah', text: colophonParagraphs(model, meta, report.summary).join('\n\n') + `\n\n${model.platformUrl}` });
    const r = await buildInteriorPdf({
      title: meta.title, subtitle: meta.subtitle, author: meta.authors.join(', ') || 'Unknown', publisher: meta.publisher, year: Number(meta.date.slice(0, 4)),
      isbn13: meta.isbn13, copyrightNotice: meta.rights, chapters: ch, trimId, binding, printer,
    });
    report.warnings.push(...r.warnings, 'Print interior is text-only (reused POD pipeline): pictures, tables and QR codes are written as text. Choose a picture-book trim to keep images.');
    // stamp metadata (watermark) without changing the page content
    const stamped = await PDFDocument.load(r.bytes, { updateMetadata: false });
    stampInfo(stamped, meta, model, opts);
    const bytes = await stamped.save({ useObjectStreams: false });
    const sidecar = buildSidecar(book, model, meta, 'PDF_PRINT', opts, ['printEdition']);
    return { ok: true, bytes, pageCount: r.pageCount, report, sidecar, fileName: `${slug(meta.title, 'book')}-print.pdf`, outline: r.chapterStartPages.map((p, i) => ({ title: ch[i]?.title ?? '', page: p })), kind: 'pod-interior', print: { trimId, pageW: getTrim(trimId).wIn * 72, pageH: getTrim(trimId).hIn * 72, bleedIn: 0, paddedPages: r.pageCount } };
  }

  const trim = getTrim(trimId);
  const run = async (assumedPages: number) => {
    const doc = await PDFDocument.create();
    const loader = opts.fontLoader ?? defaultFontLoader;
    const F = await loader(doc);
    let L: Layout;
    if (print) {
      const bleed = BLEED_IN * 72; const tw = trim.wIn * 72, th = trim.hIn * 72;
      const mg = interiorMargins(assumedPages, true);
      L = {
        pageW: tw + bleed, pageH: th + bleed * 2, bleedPt: bleed, print: true, size: trim.wIn < 5.5 ? 10.5 : 11, leading: (trim.wIn < 5.5 ? 10.5 : 11) * 1.38,
        // recto (odd): inside is left, outside is right (the bleed side); verso (even): outside is left (bleed side), inside right.
        margins: no => no % 2 === 1 ? { left: inchesToPt(mg.inside), right: inchesToPt(mg.outside), top: inchesToPt(mg.top), bottom: inchesToPt(mg.bottom) } : { left: inchesToPt(mg.outside), right: inchesToPt(mg.inside), top: inchesToPt(mg.top), bottom: inchesToPt(mg.bottom) },
        trimBox: no => no % 2 === 1 ? [0, bleed, tw, bleed + th] : [bleed, bleed, bleed + tw, bleed + th],
      };
    } else {
      const pw = 5.5 * 72, ph = 8.5 * 72; const mg = 0.6 * 72;
      L = { pageW: pw, pageH: ph, bleedPt: 0, print: false, size: 11, leading: 15.2, margins: () => ({ left: mg, right: mg, top: mg, bottom: mg * 1.1 }), trimBox: () => [0, 0, pw, ph] };
    }
    doc.setTitle(meta.title); doc.setAuthor(meta.authors.join(', ')); doc.setSubject(meta.description?.replace(/<[^>]+>/g, ' ').trim().slice(0, 500) ?? '');
    doc.setKeywords(meta.keywords); doc.setProducer('Plajah Book Export'); doc.setCreator('Plajah'); doc.setLanguage(meta.language);
    doc.setCreationDate(new Date(model.exportedAt)); doc.setModificationDate(new Date(model.exportedAt));
    stampInfo(doc, meta, model, opts);
    const B = new Builder(L, model, opts, resolve); B.doc = doc; B.F = F;

    // cover (screen only; POD covers are a separate file)
    if (!print) {
      B.newPage();
      const a = model.coverUrl ? await resolve(model.coverUrl) : null;
      const img = a ? (a.mime === 'image/png' ? await doc.embedPng(a.bytes).catch(() => null) : a.mime === 'image/jpeg' ? await doc.embedJpg(a.bytes).catch(() => null) : null) : null;
      if (img) { const sc = Math.min(L.pageW / img.width, L.pageH / img.height); B.page.drawImage(img, { x: (L.pageW - img.width * sc) / 2, y: (L.pageH - img.height * sc) / 2, width: img.width * sc, height: img.height * sc }); }
      else { B.page.drawRectangle({ x: 0, y: 0, width: L.pageW, height: L.pageH, color: rgb(0.11, 0.09, 0.19) }); B.y = L.pageH * 0.62; B.paragraph(`<strong>${meta.title.replace(/&/g, '&amp;')}</strong>`, { size: 26, align: 'center', gapAfter: 10 }); }
      if (!img) { B.page.drawRectangle({ x: 0, y: 0, width: L.pageW, height: L.pageH, color: rgb(0.11, 0.09, 0.19), opacity: 0 }); }
    }
    // title page
    B.newPage(); B.y = L.pageH * 0.62;
    B.paragraph(`<strong>${meta.title.replace(/&/g, '&amp;')}</strong>`, { size: 24, align: 'center', gapAfter: 8 });
    if (meta.subtitle) B.paragraph(`<em>${meta.subtitle.replace(/&/g, '&amp;')}</em>`, { size: 14, align: 'center', gapAfter: 8 });
    if (meta.authors.length) B.paragraph(meta.authors.join(', ').replace(/&/g, '&amp;'), { size: 13, align: 'center' });
    // reserve contents pages
    const entries = chapters.length + (model.glossary.length ? 1 : 0) + (opts.includeColophon !== false ? 1 : 0);
    const perPage = Math.max(8, Math.floor((B.top() - B.bottom()) / (L.leading * 1.3)) - 3);
    const tocPages = Math.max(1, Math.ceil(entries / perPage));
    B.folio(); const tocStart = B.pages.length;
    for (let i = 0; i < tocPages; i++) { B.newPage(); B.folio(); }
    const recto = () => { if (print && B.pages.length % 2 === 1) { B.newPage(); /* verso blank */ B.folio(); } };

    for (const ch of chapters) {
      B.folio(); recto(); B.newPage();
      B.chapterStart.set(ch.id, { page: B.page, y: B.y, no: B.pageNo }); B.outline.push({ title: ch.title, page: B.page, y: B.y, no: B.pageNo, level: 0 });
      if (ch.openerObjects) {
        const sc = Math.min(1, B.textW() / ch.openerObjects.w) * (print ? 1 : 1);
        const scale = (B.textW() / ch.openerObjects.w);
        const h = ch.openerObjects.h * scale; const useScale = h > (B.top() - B.bottom()) * 0.6 ? scale * ((B.top() - B.bottom()) * 0.6 / h) : scale; void sc;
        await B.drawVector(ch.openerObjects.objects, ch.openerObjects.w, ch.openerObjects.h, B.m().left + (B.textW() - ch.openerObjects.w * useScale) / 2, B.y, useScale);
        B.y -= ch.openerObjects.h * useScale + 14;
      } else {
        B.y -= L.pageH * 0.12;
        B.paragraph(`<strong>${ch.title.replace(/&/g, '&amp;')}</strong>`, { size: 20, align: 'center', gapAfter: 18 });
      }
      if (ch.opener) await B.image(ch.opener.src, ch.opener.alt, undefined, (B.top() - B.bottom()) * 0.4);
      B.noteNums = new Map(); for (const it of ch.items) if (it.t === 'block') for (const m of it.html.matchAll(/\[\[n:([\w-]+)\]\]/g)) if (!B.noteNums.has(m[1])) B.noteNums.set(m[1], B.noteNums.size + 1);
      let first = true; let quoteBuf: string[] = [];
      const flushQuote = () => { if (quoteBuf.length) { for (const q of quoteBuf) B.paragraph(q, { italic: true, indent: 0, gapAfter: 3 }); B.y -= 4; quoteBuf = []; } };
      let olN = 0;
      for (const it of ch.items) {
        if (it.t === 'block' && it.kind === 'quote') { quoteBuf.push(it.html); continue; }
        flushQuote();
        if (it.t === 'block') {
          switch (it.kind) {
            case 'h1': case 'h2': B.y -= 6; B.paragraph(`<strong>${it.html}</strong>`, { size: L.size * 1.25, gapAfter: 4 }); break;
            case 'h3': case 'h4': case 'h5': case 'h6': B.y -= 4; B.paragraph(`<strong>${it.html}</strong>`, { size: L.size * 1.08, gapAfter: 2 }); break;
            case 'hr': B.y -= 6; B.paragraph('* * *', { align: 'center', gapAfter: 6 }); break;
            case 'li': B.paragraph(`• ${it.html}`, { gapAfter: 1 }); break;
            case 'oli': olN++; B.paragraph(`${olN}. ${it.html}`, { gapAfter: 1 }); break;
            default: { olN = 0; B.paragraph(it.html, { indent: first ? 0 : L.size * 1.3 }); first = false; }
          }
        } else if (it.t === 'figure') { await B.image(it.src, it.alt, it.caption); }
        else if (it.t === 'table') B.table(it);
        else if (it.t === 'qr') B.qr(it.url, it.label);
        else if (it.t === 'callout') B.paragraph(it.html.replace(/<(?!\/?(strong|em)\b)[^>]+>/g, ''), { italic: true, gapAfter: 6 });
        else if (it.t === 'links') {
          if (it.prompt) B.paragraph(`<strong>${it.prompt.replace(/&/g, '&amp;')}</strong>`, { gapAfter: 2 });
          for (const x of it.items) {
            const startPage = B.page, yy = B.y;
            B.ensure(L.leading); const before = B.y;
            B.paragraph(`-> ${x.label.replace(/&/g, '&amp;')}`, { gapAfter: 1 });
            const m = B.m();
            B.links.push({ page: B.page === startPage ? B.page : B.page, rect: [m.left, B.y, m.left + B.textW(), before + 2], chapterId: x.chapterId }); void yy;
          }
        }
      }
      flushQuote();
      if (ch.notes.length) {
        B.noteNums = new Map();
        const used: string[] = []; for (const it of ch.items) if (it.t === 'block') for (const m of it.html.matchAll(/\[\[n:([\w-]+)\]\]/g)) if (!used.includes(m[1])) used.push(m[1]);
        const by = new Map(ch.notes.map(n => [n.key, n]));
        if (used.length) { B.y -= 8; B.paragraph('<strong>Notes</strong>', { size: L.size * 0.95, gapAfter: 2 }); used.forEach((k, i) => { const n = by.get(k); if (n) B.paragraph(`${i + 1}. ${n.label && n.kind === 'commentary' ? `<strong>${n.label}.</strong> ` : ''}${n.html}`, { size: L.size * 0.88, gapAfter: 1 }); }); }
      }
    }
    // glossary + colophon
    const tail: { id: string; title: string }[] = [];
    if (model.glossary.length) {
      B.folio(); recto(); B.newPage(); tail.push({ id: 'glossary', title: 'Glossary' }); B.chapterStart.set('glossary', { page: B.page, y: B.y, no: B.pageNo }); B.outline.push({ title: 'Glossary', page: B.page, y: B.y, no: B.pageNo, level: 0 });
      B.paragraph('<strong>Glossary</strong>', { size: 18, align: 'center', gapAfter: 12 });
      for (const g of model.glossary.slice().sort((a, b) => a.term.localeCompare(b.term))) B.paragraph(`<strong>${g.term.replace(/&/g, '&amp;')}</strong>: ${g.definition.replace(/&/g, '&amp;')}`, { gapAfter: 3 });
    }
    if (opts.includeColophon !== false) {
      B.folio(); recto(); B.newPage(); tail.push({ id: 'colophon', title: 'Exported from Plajah' }); B.chapterStart.set('colophon', { page: B.page, y: B.y, no: B.pageNo }); B.outline.push({ title: 'Exported from Plajah', page: B.page, y: B.y, no: B.pageNo, level: 0 });
      B.paragraph('<strong>Exported from Plajah</strong>', { size: 16, align: 'center', gapAfter: 10 });
      for (const p of colophonParagraphs(model, meta, report.summary)) B.paragraph(p.replace(/&/g, '&amp;'), { gapAfter: 5 });
      B.paragraph(model.platformUrl, { gapAfter: 2 }); const m = B.m(); B.links.push({ page: B.page, rect: [m.left, B.y, m.left + B.textW(), B.y + L.leading], uri: model.platformUrl });
    }
    B.folio();

    // contents pages
    const items = [...chapters.map(c => ({ id: c.id, title: c.title })), ...tail];
    for (let p = 0; p < tocPages; p++) {
      const page = B.pages[tocStart + p]; B.page = page; B.pageNo = tocStart + p + 1; B.y = B.top();
      if (p === 0) B.paragraph('<strong>Contents</strong>', { size: 16, align: 'center', gapAfter: 10 });
      for (const it of items.slice(p * perPage, (p + 1) * perPage)) {
        const st = B.chapterStart.get(it.id); const lineY = B.y; const m = B.m();
        B.paragraph(it.title.replace(/&/g, '&amp;'), { gapAfter: 3 });
        if (st) {
          const no = String(st.no); const w = F.regular.widthOfTextAtSize(no, L.size);
          page.drawText(no, { x: m.left + B.textW() - w, y: lineY - L.size, size: L.size, font: F.regular, color: rgb(0.1, 0.1, 0.1) });
          B.links.push({ page, rect: [m.left, lineY - L.size - 2, m.left + B.textW(), lineY + 2], chapterId: it.id });
        }
      }
    }
    // pad (print)
    let paddedPages = B.pages.length;
    if (print) {
      const lim = pageLimits(printer, binding); paddedPages = paddedPageCount(B.pages.length, lim);
      while (B.pages.length < paddedPages) B.newPage();
      for (const msg of preflight(printer, binding, trimId, paddedPages, 'white', 60, meta.isbn13)) if (msg.level !== 'info') report.warnings.push(`Print: ${msg.text}`);
    }
    return { doc, B, paddedPages, L };
  };

  let r = await run(300);
  if (print) { const g1 = gutterIn(300), g2 = gutterIn(r.paddedPages); if (g1 !== g2) r = await run(r.paddedPages); }
  const { doc, B, paddedPages } = r;

  // outline + links
  addOutline(doc, B.outline.map(o => ({ title: o.title, page: o.page, y: o.y })));
  for (const l of B.links) {
    const dict: any = { Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0] };
    if (l.uri) dict.A = { S: 'URI', URI: PDFString.of(l.uri) };
    else if (l.chapterId) { const st = B.chapterStart.get(l.chapterId); if (!st) continue; dict.Dest = [st.page.ref, 'XYZ', null, st.y, null]; }
    const ref = doc.context.register(doc.context.obj(dict));
    l.page.node.addAnnot(ref);
  }
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));

  const bytes = await doc.save({ useObjectStreams: false });
  report.warnings.push(...B.warnings);
  report.missingAssets.push(...B.missing);
  report.warnings.push('Not produced: tagged PDF (screen-reader structure), PDF/A or PDF/X. For full accessibility use the EPUB.');
  if (print) report.warnings.push('Colour is RGB; printers convert to their CMYK profile.');
  const sidecar = buildSidecar(book, model, meta, report.format, opts, ['pdfOutline', 'internalLinks']);
  return {
    ok: true, bytes, pageCount: doc.getPageCount(), report, sidecar, fileName: `${slug(meta.title, 'book')}-${print ? 'print' : 'screen'}.pdf`,
    outline: B.outline.map(o => ({ title: o.title, page: o.no })), kind: 'paged',
    ...(print ? { print: { trimId, pageW: B.L.pageW, pageH: B.L.pageH, bleedIn: BLEED_IN, paddedPages } } : {}),
  };
}

function stampInfo(doc: PDFDocument, meta: { identifier: string }, model: ExportModel, opts: ExportOptions) {
  const info = doc.context.lookup(doc.context.trailerInfo.Info) as any;
  if (!info || !info.set) return;
  info.set(PDFName.of('PlajahExportedFrom'), PDFString.of(model.platformUrl));
  info.set(PDFName.of('PlajahDRM'), PDFString.of('none'));
  info.set(PDFName.of('PlajahIdentifier'), PDFString.of(meta.identifier));
  if (opts.watermarkTag) info.set(PDFName.of('PlajahWatermark'), PDFString.of(opts.watermarkTag));
}

function addOutline(doc: PDFDocument, items: { title: string; page: PDFPage; y: number }[]) {
  if (!items.length) return;
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const refs = items.map(() => ctx.nextRef());
  items.forEach((it, i) => {
    const d: any = { Title: PDFHexString.fromText(it.title), Parent: rootRef, Dest: [it.page.ref, 'XYZ', null, it.y, null] };
    if (i > 0) d.Prev = refs[i - 1]; if (i < items.length - 1) d.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(d));
  });
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: items.length }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
  void PDFArray; void (null as unknown as PDFRef);
}
