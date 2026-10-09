// Print-ready interior PDF: title page, copyright page, TOC, chapter openers (recto, drop), running heads,
// page numbers, mirrored gutters, justified text, widow/orphan control, embedded fonts.
// Text-only interior (no bleed). Comic/image chapters are reported as warnings, not silently dropped.
import { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { embedBookFonts, inToPt, BLACK, sanitizeFor, wrapLines, htmlToText, splitParagraphs, BookFonts } from './pdfCommon';
import { getTrim, interiorMargins, pageLimits, paddedPageCount } from './printSpec';
import type { BindingType, PrinterId } from './podTypes';

export interface InteriorChapter { id?: string; title: string; text: string }
export interface InteriorOptions {
  title: string; subtitle?: string; author: string; publisher?: string; year?: number; isbn13?: string;
  copyrightNotice?: string; dedication?: string;
  chapters: InteriorChapter[];
  trimId: string; binding: BindingType; printer: PrinterId;
}
export interface InteriorResult { bytes: Uint8Array; pageCount: number; contentPages: number; warnings: string[]; chapterStartPages: number[] }

type Kind = 'title' | 'copyright' | 'toc' | 'blank' | 'opener' | 'text';
interface Line { words: string[]; width: number; indent: number; last: boolean }
interface PageModel { kind: Kind; chapter: number; lines: Line[]; startDrop: number; tocFrom?: number; tocTo?: number }

/** Convert BookChapter[] (types.ts) into plain interior chapters. Chapters without text are reported by the caller. */
export function chaptersFromBook(chapters: Array<{ id: string; title: string; content?: string }>): { chapters: InteriorChapter[]; skipped: string[] } {
  const out: InteriorChapter[] = [], skipped: string[] = [];
  for (const c of chapters) {
    const text = htmlToText(c.content || '').trim();
    if (text) out.push({ id: c.id, title: c.title || 'Untitled', text }); else skipped.push(c.title || c.id);
  }
  return { chapters: out, skipped };
}

export async function buildInteriorPdf(o: InteriorOptions): Promise<InteriorResult> {
  const warnings: string[] = [];
  const trim = getTrim(o.trimId);
  const lim = pageLimits(o.printer, o.binding);
  const doc = await PDFDocument.create();
  doc.setTitle(o.title); doc.setAuthor(o.author); doc.setProducer('Plajah Print Edition'); doc.setCreator('Plajah');
  const F = await embedBookFonts(doc);
  const W = inToPt(trim.wIn), H = inToPt(trim.hIn);
  const size = trim.wIn < 5.5 ? 10.5 : 11, leading = Math.round(size * 1.38 * 10) / 10;
  const m = interiorMargins(300); // the gutter depends on the FINAL page count; recomputed below if it changes tier
  let replaced = 0;
  const clean = (s: string) => { const r = sanitizeFor(F.regular, s); replaced += r.replaced; return r.text; };

  // Pass 1 layout is independent of the gutter tier only when text width is unchanged, so lay out with a
  // candidate gutter, then re-lay out once if the final count moves to a different gutter tier.
  const layout = (gutter: number) => {
    const textW = W - inToPt(gutter + m.outside);
    const textH = H - inToPt(m.top + m.bottom);
    const perPage = Math.floor(textH / leading);
    const pages: PageModel[] = [];
    const starts: number[] = [];
    const chapters = o.chapters.map(c => ({ ...c, title: clean(c.title), paras: splitParagraphs(clean(c.text)) }));

    pages.push({ kind: 'title', chapter: -1, lines: [], startDrop: 0 });
    pages.push({ kind: 'copyright', chapter: -1, lines: [], startDrop: 0 });
    const tocPerPage = Math.max(8, perPage - 3);
    const tocPages = Math.max(1, Math.ceil(chapters.length / tocPerPage));
    for (let i = 0; i < tocPages; i++) pages.push({ kind: 'toc', chapter: -1, lines: [], startDrop: 0, tocFrom: i * tocPerPage, tocTo: Math.min(chapters.length, (i + 1) * tocPerPage) });
    if (pages.length % 2) pages.push({ kind: 'blank', chapter: -1, lines: [], startDrop: 0 });

    chapters.forEach((ch, ci) => {
      if (pages.length % 2) pages.push({ kind: 'blank', chapter: ci, lines: [], startDrop: 0 }); // chapters open on recto
      starts.push(pages.length + 1);
      const dropLines = Math.ceil((H * 0.2) / leading);
      let cur: PageModel = { kind: 'opener', chapter: ci, lines: [], startDrop: dropLines + 2 };
      pages.push(cur);
      let cap = perPage - cur.startDrop;
      ch.paras.forEach((p, pi) => {
        const lines = wrapLines(F.regular, size, p, textW, pi === 0 ? 0 : size * 1.3).map((l, i, a) => ({ ...l, last: i === a.length - 1 }));
        let idx = 0;
        while (idx < lines.length) {
          const remaining = lines.length - idx;
          let room = cap - cur.lines.length;
          if (remaining <= room) { cur.lines.push(...lines.slice(idx)); idx = lines.length; break; }
          // paragraph must split (or move): enforce widow/orphan control
          let take = room;
          if (idx === 0 && remaining < 4) take = 0;                   // short paragraph: keep together
          else {
            if (idx === 0 && take === 1) take = 0;                      // orphan: lone first line at page bottom
            if (remaining - take === 1) take -= 1;                      // widow: lone last line on next page
            if (take < 0) take = 0;
          }
          if (take > 0) { cur.lines.push(...lines.slice(idx, idx + take)); idx += take; }
          cur = { kind: 'text', chapter: ci, lines: [], startDrop: 0 };
          pages.push(cur); cap = perPage;
        }
      });
    });
    return { pages, starts, textW, perPage };
  };

  let gutter = 0.5, L = layout(gutter);
  const finalCount = (n: number) => paddedPageCount(n + (n % 2), lim);
  let total = finalCount(L.pages.length);
  const wantGutter = interiorMargins(total).inside;
  if (wantGutter !== gutter) { gutter = wantGutter; L = layout(gutter); total = finalCount(L.pages.length); }
  const pages = L.pages;
  while (pages.length < total) pages.push({ kind: 'blank', chapter: -1, lines: [], startDrop: 0 });

  if (o.chapters.length === 0) warnings.push('No chapter has text content; the interior only contains front matter.');
  if (pages.length > lim.max) warnings.push(`Interior is ${pages.length} pages; the maximum for this binding is ${lim.max}.`);
  if (total > L.pages.length - 0 && total - (L.pages.length) > 0) warnings.push(`${total - L.pages.length} blank page(s) added to meet the printer's page rules.`);

  const frontCount = L.starts.length ? L.starts[0] - 1 : pages.length;
  const left = (pn: number) => inToPt(pn % 2 === 1 ? gutter : m.outside);
  const draw = (pg: PDFPage, text: string, x: number, y: number, font: PDFFont, sz: number) => { if (text) pg.drawText(text, { x, y, size: sz, font, color: BLACK }); };
  const center = (pg: PDFPage, text: string, y: number, font: PDFFont, sz: number) => draw(pg, text, (W - font.widthOfTextAtSize(text, sz)) / 2, y, font, sz);
  const wrapCenter = (pg: PDFPage, text: string, y: number, font: PDFFont, sz: number, maxW: number) => {
    let yy = y; for (const ln of wrapLines(font, sz, text, maxW)) { center(pg, ln.words.join(' '), yy, font, sz); yy -= sz * 1.25; } return yy;
  };

  pages.forEach((pm, idx) => {
    const pn = idx + 1;
    const pg = doc.addPage([W, H]);
    const lx = left(pn);
    const tw = W - inToPt(gutter + m.outside);
    const topY = H - inToPt(m.top);
    const bodyNo = pn - frontCount;
    if (pm.kind === 'title') {
      let y = H * 0.68;
      y = wrapCenter(pg, clean(o.title), y, F.bold, 26, W * 0.75) - 8;
      if (o.subtitle) y = wrapCenter(pg, clean(o.subtitle), y, F.italic, 14, W * 0.7) - 8;
      center(pg, clean(o.author), H * 0.3, F.regular, 15);
      if (o.publisher) center(pg, clean(o.publisher), inToPt(0.9), F.italic, 10);
    } else if (pm.kind === 'copyright') {
      const lines = [
        `Copyright © ${o.year ?? new Date().getFullYear()} ${o.author}`,
        o.copyrightNotice || 'All rights reserved. No part of this book may be reproduced without written permission of the author, except for brief quotations in reviews.',
        o.isbn13 ? `ISBN ${o.isbn13}` : '',
        o.publisher ? `Published by ${o.publisher}` : '',
        'Created with Plajah.',
      ].filter(Boolean);
      let y = inToPt(m.bottom) + lines.length * 40;
      for (const t of lines) for (const ln of wrapLines(F.regular, 8.5, clean(t), tw)) { draw(pg, ln.words.join(' '), lx, y, F.regular, 8.5); y -= 11; }
      if (o.dedication) wrapCenter(pg, clean(o.dedication), H * 0.55, F.italic, 12, W * 0.6);
    } else if (pm.kind === 'toc') {
      if (pm.tocFrom === 0) center(pg, 'Contents', topY - 14, F.bold, 16);
      let y = topY - (pm.tocFrom === 0 ? 48 : 14);
      for (let i = pm.tocFrom!; i < pm.tocTo!; i++) {
        const t = clean(o.chapters[i].title), num = String(L.starts[i] - frontCount);
        const nw = F.regular.widthOfTextAtSize(num, size);
        let title = t; while (title.length > 3 && F.regular.widthOfTextAtSize(title, size) > tw - nw - 24) title = title.slice(0, -2);
        if (title !== t) title += '…';
        draw(pg, title, lx, y, F.regular, size);
        draw(pg, num, lx + tw - nw, y, F.regular, size);
        const dotsFrom = lx + F.regular.widthOfTextAtSize(title, size) + 6, dotsTo = lx + tw - nw - 6;
        const dw = F.regular.widthOfTextAtSize('.', size);
        if (dotsTo > dotsFrom) draw(pg, '.'.repeat(Math.floor((dotsTo - dotsFrom) / (dw * 1.6))).split('').join(' '), dotsFrom, y, F.regular, size);
        y -= leading;
      }
    } else if (pm.kind === 'opener' || pm.kind === 'text') {
      let y = topY - size;
      if (pm.kind === 'opener') {
        const ch = o.chapters[pm.chapter];
        y -= H * 0.18;
        center(pg, `Chapter ${pm.chapter + 1}`, y, F.italic, 11); y -= 26;
        y = wrapCenter(pg, clean(ch.title), y, F.bold, 20, tw) - 14;
        y = topY - size - (pm.startDrop * leading);
      } else {
        const rh = pn % 2 === 0 ? clean(o.author) : clean(o.chapters[pm.chapter]?.title ?? o.title);
        const rw = F.italic.widthOfTextAtSize(rh, 9);
        draw(pg, rh, pn % 2 === 0 ? lx : lx + tw - rw, H - inToPt(m.top) + 14, F.italic, 9);
      }
      for (const ln of pm.lines) {
        const x0 = lx + ln.indent;
        const avail = tw - ln.indent;
        const spaces = ln.words.length - 1;
        const space = F.regular.widthOfTextAtSize(' ', size);
        const gap = !ln.last && spaces > 0 ? Math.min((avail - (ln.width - spaces * space)) / spaces, space * 2.2) : space;
        let x = x0;
        for (const w of ln.words) { draw(pg, w, x, y, F.regular, size); x += F.regular.widthOfTextAtSize(w, size) + gap; }
        y -= leading;
      }
      if (bodyNo > 0) center(pg, String(bodyNo), inToPt(m.bottom) - 14, F.regular, 10);
    }
  });

  if (replaced) warnings.push(`${replaced} character(s) are outside the embedded font's Latin set and were replaced with "?". Non-Latin scripts are not yet supported in print interiors.`);
  const bytes = await doc.save();
  return { bytes, pageCount: pages.length, contentPages: L.pages.length, warnings, chapterStartPages: L.starts };
}
