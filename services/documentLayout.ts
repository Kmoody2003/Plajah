// services/documentLayout.ts — reads how a document is laid out, not just its words, so the importer keeps
// the structure of its questions. Output is plain text for the curriculum parser plus grid blocks:
//
//   @@GRID True | False          ← a table of answer columns (each row answered by picking one column)
//   Because I can prophesy that makes me a Prophet
//   There are no Apostles today.
//   @@END
//
//   • Google Docs: the HTML export (tables, numbered lists), where the plain-text export flattens tables.
//   • PDFs: where each piece of text sits on the page; a header row of short column labels over rows whose
//     text stays in the left part of the page is an answer grid.

/** A column label that offers a choice: True / False, Yes / No, Agree, a letter (A, B.), or "A. Exhorter". */
const CHOICE_LABEL = /^(true|false|t|f|yes|no|agree|disagree|neutral|[a-j][.)]?|[a-j][.)]\s.{1,60})$/i;
export const isChoiceHeader = (labels: string[]) => labels.length >= 2 && labels.length <= 10 && labels.every(l => CHOICE_LABEL.test(l.trim()));

/** A table is an answer grid when its header row offers choices and the body rows only fill the first column. */
function tableToGrid(rows: string[][]): { columns: string[]; rows: string[] } | null {
  if (rows.length < 2) return null;
  const [head, ...body] = rows;
  const columns = head.slice(1).map(c => c.trim()).filter(Boolean);
  if (columns.length !== head.length - 1 || head[0].trim().length > 60 || !isChoiceHeader(columns)) return null;
  const blankMark = /^[\s○◯◦☐□⬜◻▢o()\[\]_-]*$/i;
  const ok = body.every(r => r[0]?.trim() && r.slice(1).every(c => blankMark.test(c)));
  return ok ? { columns, rows: body.map(r => r[0].trim()) } : null;
}

const gridBlock = (g: { columns: string[]; rows: string[] }) => ['@@GRID ' + g.columns.join(' | '), ...g.rows, '@@END'];

/** Google Docs HTML export → text lines with numbered lists numbered and answer tables as grid blocks. */
export function docsHtmlToLayoutText(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const text = (el: Element) => (el.textContent || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();
  // Docs splits one numbered list into several <ol>s with start= ; keep counting per list class.
  const counters = new Map<string, number>();
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('td,th')).map(td => text(td)));
      const grid = tableToGrid(rows);
      if (grid) out.push(...gridBlock(grid));
      else for (const r of rows) { const line = r.filter(Boolean).join(' | '); if (line) out.push(line); }
      out.push('');
      return;
    }
    if (tag === 'ol' || tag === 'ul') {
      const key = el.className || tag;
      let n = tag === 'ol' ? Number(el.getAttribute('start') || counters.get(key) || 1) : 0;
      for (const li of Array.from(el.children)) {
        const t = text(li);
        if (!t) continue;
        out.push(tag === 'ol' ? `${n}. ${t}` : t);
        if (tag === 'ol') n++;
      }
      if (tag === 'ol') counters.set(key, n);
      return;
    }
    if (/^h[1-6]$/.test(tag)) { const t = text(el); if (t) out.push(`${tag === 'h1' ? '#' : '##'} ${t}`); return; }
    if (tag === 'p') { const t = text(el); out.push(t); return; }
    for (const c of Array.from(el.children)) walk(c);
  };
  for (const c of Array.from(doc.body.children)) walk(c);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface PdfTextItem { s: string; x: number; y: number; w: number }
export interface PdfLine { y: number; items: PdfTextItem[]; pageWidth: number }

/**
 * PDF lines (text items grouped by their y position, top to bottom) → text, with answer grids found by layout:
 * a line of 2–9 short labels spread across the right part of the page (True / False, A. B. C. D.), followed
 * by lines whose text stays left of those labels, is a grid.
 */
export function pdfLinesToLayoutText(lines: PdfLine[]): string {
  const out: string[] = [];
  const lineText = (l: PdfLine) => l.items.map(it => it.s).join(' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const right = l.items.filter(it => it.x > l.pageWidth * 0.38 && it.s.trim());
    const left = l.items.filter(it => it.x <= l.pageWidth * 0.38 && it.s.trim());
    // Only real answer columns (True / False, A–D …): a centered heading or a table of words is the page's text.
    const isHeader = left.length === 0 && isChoiceHeader(right.map(it => it.s));
    if (isHeader) {
      const colStart = Math.min(...right.map(it => it.x)) - 4;
      const rows: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const r = lines[j];
        const t = lineText(r);
        // A row's words end before the first column; stop at a blank gap, a heading, or text across the columns.
        if (!t || r.items.some(it => it.x >= colStart && it.s.trim() && !/^[○◯◦☐□o]+$/i.test(it.s.trim()))) break;
        if (rows.length && Math.abs(r.y - lines[j - 1].y) > 40) break;
        // A statement that wraps onto the next line: that line continues the row (starts lowercase, no mark).
        if (rows.length && /^[a-z(,;]/.test(t) && !/^[a-z][.)]\s/.test(t)) rows[rows.length - 1] += ` ${t}`;
        else rows.push(t);
        j++;
      }
      if (rows.length >= 2) {
        out.push(...gridBlock({ columns: right.sort((a, b) => a.x - b.x).map(it => it.s.trim()), rows }), '');
        i = j - 1;
        continue;
      }
    }
    out.push(lineText(l));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** One line of a page as the original places it: left / top / font size as % of the page width, so it scales. */
export interface LayoutLine { x: number; y: number; size: number; bold?: boolean; italic?: boolean; text: string }
/** A page of the original: its aspect (height / width) and its lines in reading order. */
export interface LayoutPage { aspect: number; lines: LayoutLine[] }

/**
 * Reads a PDF with positions (pdf.js): the text for the importer (answer grids as grid blocks) and the pages
 * as laid out, so a reading document can be shown as the original places it. Empty for a scan.
 */
export async function pdfLayout(file: File): Promise<{ text: string; pages: LayoutPage[] }> {
  const pdfjs: any = await import('pdfjs-dist');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  } catch { /* worker already configured by the bundler */ }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const texts: string[] = [];
  const pages: LayoutPage[] = [];
  try {
    for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const width = vp.width, height = vp.height;
      const content = await page.getTextContent();
      const styles = (content.styles || {}) as Record<string, { fontFamily?: string }>;
      const lines: Array<PdfLine & { size: number; font: string }> = [];
      for (const it of content.items as any[]) {
        const s = String(it.str ?? '');
        if (!s.trim()) continue;
        const y = it.transform[5] as number;
        const size = Math.hypot(it.transform[2], it.transform[3]) || Math.abs(it.transform[3]) || 10;
        let line = lines.find(l => Math.abs(l.y - y) < Math.max(2, size * 0.3));
        if (!line) { line = { y, items: [], pageWidth: width, size, font: String(it.fontName || '') }; lines.push(line); }
        line.size = Math.max(line.size, size);
        line.items.push({ s, x: it.transform[4] as number, y, w: it.width as number });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) l.items.sort((a, b) => a.x - b.x);
      texts.push(pdfLinesToLayoutText(lines.map(l => ({ ...l, y: -l.y }))));
      const fontOf = (f: string) => `${f} ${styles[f]?.fontFamily || ''}`;
      pages.push({
        aspect: height / width,
        lines: lines.map(l => {
          // A line can hold separate runs (two columns, a tab stop): keep a wide gap as spaces so columns stay apart.
          let text = '';
          let end = -1;
          for (const it of l.items) {
            if (end >= 0) text += it.x - end > l.size * 1.5 ? '  ' : it.x - end > l.size * 0.15 && !/\s$/.test(text) ? ' ' : '';
            text += it.s;
            end = it.x + (it.w || 0);
          }
          const f = fontOf(l.font);
          return {
            x: +(100 * l.items[0].x / width).toFixed(2),
            y: +(100 * (height - l.y - l.size) / width).toFixed(2),
            size: +(100 * l.size / width).toFixed(2),
            ...(/bold|black|heavy|semibold/i.test(f) ? { bold: true } : {}),
            ...(/italic|oblique/i.test(f) ? { italic: true } : {}),
            text: text.replace(/\s+$/, ''),
          };
        }),
      });
    }
  } finally {
    try { await pdf.destroy(); } catch { /* already closed */ }
  }
  return { text: texts.filter(Boolean).join('\n\n'), pages: pages.filter(pg => pg.lines.length) };
}

/** Reads a PDF's text with positions and lays it out with pdfLinesToLayoutText. '' for a scan. */
export async function pdfLayoutText(file: File): Promise<string> {
  return (await pdfLayout(file)).text;
}
