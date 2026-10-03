/**
 * Pure layout helpers for the folio reader's EPUB and PDF adapters (no DOM, no pdf.js): they turn positioned text
 * into reading-order paragraphs and group paragraphs and figures into pages. Kept free of browser APIs so they can be
 * unit tested with plain data; see services/bookPageAdapters.ts for the code that feeds them.
 */

export interface PdfTextItem { str: string; x: number; y: number; w: number; h: number } // y = baseline, y-down; h = font size
export interface PdfLine { text: string; x0: number; x1: number; y: number; h: number }
export interface LaidOutPara { text: string; top: number }
export interface PageFigure { afterPara: number; src: string; alt: string; caption?: string }
export interface PageData { paras: string[]; figures: PageFigure[] }

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Cluster positioned text runs into lines (same baseline), left to right. */
export function itemsToLines(items: PdfTextItem[]): PdfLine[] {
  const live = items.filter(i => i.str.trim().length > 0 || i.str === ' ');
  live.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<{ items: PdfTextItem[]; y: number; h: number }> = [];
  for (const it of live) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(it.y - last.y) <= Math.max(it.h, last.h) * 0.45) { last.items.push(it); last.y = (last.y + it.y) / 2; last.h = Math.max(last.h, it.h); }
    else lines.push({ items: [it], y: it.y, h: it.h });
  }
  const out: PdfLine[] = [];
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // A wide horizontal gap on one baseline is a column gutter (or a tab), so each side becomes its own line.
    const segments: PdfTextItem[][] = [[]]; let prevEnd: number | null = null;
    for (const it of l.items) {
      if (prevEnd !== null && it.x - prevEnd > l.h * 2.5) segments.push([]);
      segments[segments.length - 1].push(it); prevEnd = it.x + it.w;
    }
    for (const seg of segments) {
      let text = ''; let end: number | null = null;
      for (const it of seg) {
        const gap = end === null ? 0 : it.x - end;
        if (text && gap > l.h * 0.18 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
        text += it.str; end = it.x + it.w;
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (text) out.push({ text, x0: seg[0].x, x1: Math.max(...seg.map(i => i.x + i.w)), y: l.y, h: l.h });
    }
  }
  return out;
}

/**
 * Two-column pages: read the left column top to bottom, then the right. Only when the page really has two columns
 * (many lines on each side of the gutter and few lines that cross it); otherwise reading order is plain top to bottom.
 */
export function orderColumns(lines: PdfLine[], pageW: number): PdfLine[] {
  if (lines.length < 16) return lines;
  const mid = pageW / 2;
  const crossing = lines.filter(l => l.x0 < mid - pageW * 0.03 && l.x1 > mid + pageW * 0.03);
  const left = lines.filter(l => l.x1 <= mid + pageW * 0.03 && !crossing.includes(l));
  const right = lines.filter(l => l.x0 >= mid - pageW * 0.03 && !crossing.includes(l));
  if (left.length < 8 || right.length < 8 || crossing.length > lines.length * 0.2) return lines;
  const firstColumnY = Math.min(left[0].y, right[0].y);
  const head = crossing.filter(l => l.y < firstColumnY);
  const tail = crossing.filter(l => l.y >= firstColumnY);
  return [...head, ...left, ...right, ...tail];
}

const normalizeHead = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const isPageNumber = (t: string) => /^(?:page\s*)?[-–—]?\s*(?:\d{1,4}|[ivxlcdm]{1,7})\s*[-–—]?$/i.test(t.trim());

/** Drop running heads, footers and bare page numbers: lines in the top or bottom band that repeat on several pages. */
export function stripRunningHeads(pages: PdfLine[][], pageH: number): PdfLine[][] {
  const band = pageH * 0.09;
  const seen = new Map<string, number>();
  for (const lines of pages) {
    const keys = new Set<string>();
    for (const l of lines) if (l.y < band || l.y > pageH - band) keys.add(normalizeHead(l.text));
    keys.forEach(k => seen.set(k, (seen.get(k) || 0) + 1));
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.3));
  return pages.map(lines => lines.filter(l => {
    const inBand = l.y < band || l.y > pageH - band;
    if (!inBand) return true;
    if (isPageNumber(l.text)) return false;
    return (seen.get(normalizeHead(l.text)) || 0) < min;
  }));
}

const SENTENCE_END = /[.!?:;”"')\]’]\s*$/;

/** Join lines into paragraphs: blank gaps, indents after a finished sentence, and size changes start a new one. */
export function linesToParas(lines: PdfLine[]): LaidOutPara[] {
  if (!lines.length) return [];
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) { const g = lines[i].y - lines[i - 1].y; if (g > 0) gaps.push(g); }
  const gap = median(gaps) || lines[0].h * 1.3;
  const hMed = median(lines.map(l => l.h)) || 10;
  const left = median(lines.map(l => l.x0));
  const out: LaidOutPara[] = [];
  let cur: { text: string; top: number } | null = null;
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    const newPara = !cur || !prev
      || l.y - prev.y > gap * 1.45
      || l.y < prev.y - hMed // jumped back up (new column or block)
      || (l.x0 - left > hMed * 0.9 && SENTENCE_END.test(prev.text))
      || Math.abs(l.h - prev.h) > hMed * 0.18;
    if (newPara) { if (cur) out.push(cur); cur = { text: l.text, top: l.y - l.h }; }
    else if (/[A-Za-zÀ-ɏ]-$/.test(cur!.text) && /^[a-zà-ɏ]/.test(l.text)) cur!.text = cur!.text.slice(0, -1) + l.text; // de-hyphenate
    else cur!.text += ' ' + l.text;
  });
  if (cur) out.push(cur);
  return out.map(p => ({ ...p, text: p.text.replace(/\s+/g, ' ').trim() })).filter(p => p.text.length > 0);
}

export type FlowBlock =
  | { kind: 'p'; text: string }
  | { kind: 'fig'; src: string; alt: string; caption?: string };

const wordCount = (t: string) => (t.match(/\S+/g) || []).length;

/** Group a chapter's paragraphs and figures into reading pages. A figure always stays with the paragraph before it. */
export function paginateFlow(blocks: FlowBlock[], opts: { words?: number; maxParas?: number } = {}): PageData[] {
  const budget = opts.words ?? 330; const maxParas = opts.maxParas ?? 14;
  const pages: PageData[] = [];
  let cur: PageData = { paras: [], figures: [] }; let w = 0;
  const flush = () => { if (cur.paras.length || cur.figures.length) pages.push(cur); cur = { paras: [], figures: [] }; w = 0; };
  for (const b of blocks) {
    if (b.kind === 'p') {
      const n = wordCount(b.text);
      if (cur.paras.length && (w + n > budget || cur.paras.length >= maxParas)) flush();
      cur.paras.push(b.text); w += n;
      if (n > budget) flush(); // one very long paragraph gets a page of its own
    } else {
      cur.figures.push({ afterPara: Math.max(-1, cur.paras.length - 1), src: b.src, alt: b.alt, caption: b.caption });
      w += 60; // a figure takes room
    }
  }
  flush();
  return pages;
}

/** Where a figure at `figTop` belongs among paragraphs ordered top-down: after the last paragraph that starts above it. */
export function figureAfterIndex(paraTops: number[], figTop: number): number {
  let idx = -1;
  for (let i = 0; i < paraTops.length; i++) if (paraTops[i] < figTop) idx = i;
  return idx;
}

/** True when a PDF has too little real text to read as a page (a scan with no text layer). */
export function looksTextless(pages: Array<{ paras: string[] }>): boolean {
  if (!pages.length) return true;
  const chars = pages.reduce((a, p) => a + p.paras.join('').length, 0);
  return chars / pages.length < 80;
}
