import { unzipSync, strFromU8 } from 'fflate';
import { pdfjs } from 'react-pdf';
import type { ParsedChapter } from './bookContentService';
import {
  itemsToLines, orderColumns, stripRunningHeads, linesToParas, paginateFlow, figureAfterIndex, looksTextless,
  type FlowBlock, type PageData, type PageFigure, type PdfLine, type PdfTextItem,
} from './bookPageLayout';

/**
 * Adapters that turn an EPUB or PDF into the same page model the folio reader already uses for plain text:
 * chapters of pages, each page being paragraphs of text plus figures (and, for PDFs, the original page image).
 * The text and the pictures are separated once here, so BookFolioBody and read-along never see markup or page bitmaps.
 *
 * EPUB: read straight from the zip (fflate), so epub.js is not needed for the folio view and every figure is a blob URL.
 * PDF: text from pdf.js getTextContent in reading order; figures are cropped from the rendered page on demand.
 */
export interface FolioChapterData { title: string; pages: PageData[] }
export interface PageExtras { figures: PageFigure[] }
export interface FolioDoc {
  chapters: FolioChapterData[];
  source: 'epub' | 'pdf';
  /** PDF with no usable text layer: a scan. The caller should keep the page viewer. */
  textless: boolean;
  /** Figures for one page. EPUB figures are known up front; PDF figures are cropped lazily. */
  extras(ci: number, pi: number): Promise<PageExtras>;
  /** Original page image (PDF only). */
  scan?(ci: number, pi: number): Promise<string>;
  dispose(): void;
}

export const toParsedChapters = (doc: FolioDoc): ParsedChapter[] =>
  doc.chapters.map(c => ({ title: c.title, pages: c.pages.map(p => p.paras) }));

// ── EPUB ─────────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function resolvePath(base: string, rel: string): string {
  const clean = decodeURIComponent(rel.split('#')[0].split('?')[0]);
  const parts = (clean.startsWith('/') ? clean.slice(1) : base + clean).split('/');
  const out: string[] = [];
  for (const seg of parts) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
  return out.join('/');
}
const parseXml = (s: string, type: DOMParserSupportedType = 'application/xml'): Document => new DOMParser().parseFromString(s, type);
const hasParseError = (d: Document) => !!d.querySelector('parsererror');
const squash = (t: string | null | undefined) => (t || '').replace(/\s+/g, ' ').trim();

const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'DD', 'DT', 'PRE', 'FIGCAPTION']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NAV', 'HEAD', 'SUP']);

export async function adaptEpub(buf: ArrayBuffer): Promise<FolioDoc> {
  const files = unzipSync(new Uint8Array(buf));
  const text = (path: string) => { const f = files[path]; return f ? strFromU8(f) : ''; };
  const urls: string[] = [];
  const imageUrl = (path: string): string | null => {
    const f = files[path]; if (!f || f.byteLength < 2048) return null; // tiny files are ornaments and rules, not plates
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const u = URL.createObjectURL(new Blob([f], { type: MIME[ext] || 'application/octet-stream' }));
    urls.push(u); return u;
  };

  const container = parseXml(text('META-INF/container.xml'));
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath || !files[opfPath]) throw new Error('Not a readable EPUB (no package file)');
  const opf = parseXml(text(opfPath)); const opfDir = dirOf(opfPath);
  const manifest = new Map<string, { href: string; type: string; props: string }>();
  opf.querySelectorAll('manifest > item').forEach(it => manifest.set(it.getAttribute('id') || '', { href: it.getAttribute('href') || '', type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' }));
  const spine = [...opf.querySelectorAll('spine > itemref')].map(r => manifest.get(r.getAttribute('idref') || '')).filter((m): m is NonNullable<typeof m> => !!m && /x?html/.test(m.type) && !/\bnav\b/.test(m.props));

  // Chapter names from the table of contents (EPUB 3 nav, else EPUB 2 ncx)
  const toc = new Map<string, string>();
  const navItem = [...manifest.values()].find(m => /\bnav\b/.test(m.props));
  const ncxItem = [...manifest.values()].find(m => m.type === 'application/x-dtbncx+xml');
  try {
    if (navItem) {
      const base = dirOf(resolvePath(opfDir, navItem.href));
      const nav = parseXml(text(resolvePath(opfDir, navItem.href)), 'text/html');
      (nav.querySelector('nav[epub\\:type="toc"], nav') || nav).querySelectorAll('a[href]').forEach(a => { const k = resolvePath(base, a.getAttribute('href') || ''); if (!toc.has(k)) toc.set(k, squash(a.textContent)); });
    } else if (ncxItem) {
      const base = dirOf(resolvePath(opfDir, ncxItem.href));
      parseXml(text(resolvePath(opfDir, ncxItem.href))).querySelectorAll('navPoint').forEach(np => { const src = np.querySelector('content')?.getAttribute('src') || ''; const k = resolvePath(base, src); if (!toc.has(k)) toc.set(k, squash(np.querySelector('navLabel')?.textContent)); });
    }
  } catch { /* names fall back to the first heading */ }

  const chapters: FolioChapterData[] = [];
  spine.forEach((m, idx) => {
    const path = resolvePath(opfDir, m.href); const base = dirOf(path);
    const raw = text(path); if (!raw) return;
    let doc = parseXml(raw, 'application/xhtml+xml'); if (hasParseError(doc)) doc = parseXml(raw, 'text/html');
    const body = doc.querySelector('body'); if (!body) return;
    const blocks: FlowBlock[] = []; let firstHeading = '';

    const pushImage = (src: string | null, alt: string, caption?: string) => {
      if (!src) return; const u = imageUrl(resolvePath(base, src)); if (u) blocks.push({ kind: 'fig', src: u, alt: alt || 'Illustration', caption });
    };
    const walk = (el: Element, caption?: string) => {
      for (const child of Array.from(el.children)) {
        const tag = child.tagName.toUpperCase();
        if (SKIP.has(tag)) continue;
        if (tag === 'FIGURE') {
          const cap = squash(child.querySelector('figcaption')?.textContent);
          child.querySelectorAll('img, image').forEach(im => pushImage(im.getAttribute('src') || im.getAttribute('xlink:href') || im.getAttribute('href'), squash(im.getAttribute('alt')), cap || undefined));
          continue;
        }
        if (tag === 'IMG' || tag === 'IMAGE') { pushImage(child.getAttribute('src') || child.getAttribute('xlink:href') || child.getAttribute('href'), squash(child.getAttribute('alt')), caption); continue; }
        if (tag === 'SVG') { child.querySelectorAll('image').forEach(im => pushImage(im.getAttribute('xlink:href') || im.getAttribute('href'), '')); continue; }
        if (BLOCKS.has(tag)) {
          child.querySelectorAll('img').forEach(im => pushImage(im.getAttribute('src'), squash(im.getAttribute('alt')))); // inline pictures inside a paragraph
          const t = squash(child.textContent);
          if (!t) continue;
          if (/^H[1-6]$/.test(tag) && !firstHeading && !blocks.some(b => b.kind === 'p')) { firstHeading = t; continue; }
          blocks.push({ kind: 'p', text: t });
          continue;
        }
        // Containers recurse when they hold blocks or pictures; otherwise their loose text is one paragraph.
        if (child.querySelector('p,h1,h2,h3,h4,h5,h6,blockquote,li,figure,img,image,div,section,pre')) walk(child, caption);
        else { const t = squash(child.textContent); if (t) blocks.push({ kind: 'p', text: t }); }
      }
    };
    walk(body);
    if (!blocks.length) return;
    const title = toc.get(path) || firstHeading || `Chapter ${chapters.length + 1}`;
    const pages = paginateFlow(blocks);
    if (pages.length) chapters.push({ title, pages });
    void idx;
  });

  if (!chapters.length) throw new Error('This EPUB has no readable text');
  return {
    chapters, source: 'epub', textless: false,
    extras: async (ci, pi) => ({ figures: chapters[ci]?.pages[pi]?.figures || [] }),
    dispose: () => { urls.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }); },
  };
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const mul = (a: number[], b: number[]): number[] => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
interface Box { x: number; y: number; w: number; h: number }

/** Boxes (in viewport pixels) where the page paints a real picture, from the operator list. */
async function imageBoxes(page: any, viewport: any): Promise<Box[]> {
  const OPS = (pdfjs as any).OPS;
  const ol = await page.getOperatorList();
  let ctm = viewport.transform.slice(); const stack: number[][] = []; const raw: Box[] = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]; const a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) { ctm = stack.pop() || ctm; }
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a?.[0]) ctm = mul(ctm, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) { ctm = stack.pop() || ctm; }
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintJpegXObject) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      raw.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    }
  }
  const pageArea = viewport.width * viewport.height;
  const keep = raw.filter(b => b.w >= 90 && b.h >= 90 && b.w * b.h >= pageArea * 0.03
    && !(b.w > viewport.width * 0.92 && b.h > viewport.height * 0.92)); // a full-page bitmap is the scan itself, not a figure
  // merge boxes that overlap (an image drawn in tiles or with a mask)
  const merged: Box[] = [];
  for (const b of keep) {
    const hit = merged.find(m => b.x < m.x + m.w && m.x < b.x + b.w && b.y < m.y + m.h && m.y < b.y + b.h);
    if (hit) { const x = Math.min(hit.x, b.x), y = Math.min(hit.y, b.y); hit.w = Math.max(hit.x + hit.w, b.x + b.w) - x; hit.h = Math.max(hit.y + hit.h, b.y + b.h) - y; hit.x = x; hit.y = y; }
    else merged.push({ ...b });
  }
  return merged.sort((p, q) => p.y - q.y).slice(0, 6);
}

const canvasToUrl = (c: HTMLCanvasElement, urls: string[], quality = 0.86): Promise<string> =>
  new Promise((res, rej) => c.toBlob(b => { if (!b) return rej(new Error('canvas export failed')); const u = URL.createObjectURL(b); urls.push(u); res(u); }, 'image/jpeg', quality));

export async function adaptPdf(buf: ArrayBuffer, opts: { onProgress?: (done: number, total: number) => void } = {}): Promise<FolioDoc> {
  const pdf: any = await (pdfjs as any).getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const n: number = pdf.numPages;
  const allLines: PdfLine[][] = []; const hasImage: boolean[] = []; let pageH = 792;
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p); const vp = page.getViewport({ scale: 1 }); pageH = vp.height;
    const tc = await page.getTextContent();
    const items: PdfTextItem[] = (tc.items as any[]).filter(it => typeof it.str === 'string').map(it => ({
      str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width || 0, h: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
    }));
    allLines.push(orderColumns(itemsToLines(items), vp.width));
    hasImage.push(false);
    opts.onProgress?.(p, n);
  }
  const cleaned = stripRunningHeads(allLines, pageH);
  const paraSets = cleaned.map(lines => linesToParas(lines));
  const textOf = paraSets.map(ps => ps.map(x => x.text));
  const textless = looksTextless(textOf.map(paras => ({ paras })));

  // A page with almost no text may be a full-page plate: keep it if it paints a picture.
  for (let i = 0; i < n && !textless; i++) {
    if (textOf[i].join('').length < 10) { try { const pg = await pdf.getPage(i + 1); hasImage[i] = (await imageBoxes(pg, pg.getViewport({ scale: 1.6 }))).length > 0; } catch { /* leave false */ } }
  }
  const keepIdx: number[] = []; for (let i = 0; i < n; i++) if (textOf[i].length || hasImage[i]) keepIdx.push(i);

  // Chapters from the PDF's own outline when it has one, else one run of pages
  let starts: Array<{ title: string; page: number }> = [];
  try {
    const outline = await pdf.getOutline();
    for (const o of outline || []) {
      let dest = o.dest; if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      if (Array.isArray(dest) && dest[0] && typeof dest[0] === 'object') starts.push({ title: squash(o.title), page: await pdf.getPageIndex(dest[0]) });
    }
  } catch { starts = []; }
  starts = starts.filter(s => s.title).sort((a, b) => a.page - b.page).filter((s, i, arr) => i === 0 || s.page !== arr[i - 1].page);
  const ranges = starts.length >= 2
    ? starts.map((s, i) => ({ title: s.title, from: s.page, to: (starts[i + 1]?.page ?? n) - 1 }))
    : [{ title: 'Document', from: 0, to: n - 1 }];
  if (ranges[0].from > 0 && starts.length >= 2) ranges.unshift({ title: 'Front matter', from: 0, to: ranges[0].from - 1 });

  const chapters: FolioChapterData[] = []; const where: Array<Array<{ pdfPage: number; tops: number[] }>> = [];
  for (const r of ranges) {
    const pages: PageData[] = []; const meta: Array<{ pdfPage: number; tops: number[] }> = [];
    for (const i of keepIdx) if (i >= r.from && i <= r.to) { pages.push({ paras: textOf[i], figures: [] }); meta.push({ pdfPage: i + 1, tops: paraSets[i].map(x => x.top) }); }
    if (pages.length) { chapters.push({ title: r.title, pages }); where.push(meta); }
  }

  const urls: string[] = []; const rendered = new Map<number, Promise<HTMLCanvasElement>>(); const figCache = new Map<number, PageFigure[]>(); const scanCache = new Map<number, Promise<string>>();
  const SCALE = 1.6;
  const renderPage = (pdfPage: number) => {
    let r = rendered.get(pdfPage);
    if (!r) {
      r = (async () => {
        const page = await pdf.getPage(pdfPage); const vp = page.getViewport({ scale: SCALE });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise;
        return canvas;
      })();
      rendered.set(pdfPage, r);
      r.then(() => { if (rendered.size > 4) rendered.delete(rendered.keys().next().value as number); }).catch(() => rendered.delete(pdfPage));
    }
    return r;
  };

  return {
    chapters, source: 'pdf', textless,
    extras: async (ci, pi) => {
      const m = where[ci]?.[pi]; if (!m) return { figures: [] };
      const cached = figCache.get(m.pdfPage); if (cached) return { figures: cached };
      const figs: PageFigure[] = [];
      try {
        const page = await pdf.getPage(m.pdfPage); const vp = page.getViewport({ scale: SCALE });
        const boxes = await imageBoxes(page, vp);
        if (boxes.length) {
          const canvas = await renderPage(m.pdfPage);
          for (let k = 0; k < boxes.length; k++) {
            const b = boxes[k]; const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
            const w = Math.min(canvas.width - x, Math.ceil(b.w)), h = Math.min(canvas.height - y, Math.ceil(b.h)); if (w < 20 || h < 20) continue;
            const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
            figs.push({ afterPara: figureAfterIndex(m.tops, b.y / SCALE), src: await canvasToUrl(c, urls), alt: `Illustration on page ${m.pdfPage}` });
          }
        }
      } catch (e) { console.warn('[folio] PDF figure extraction failed', e); }
      figCache.set(m.pdfPage, figs); return { figures: figs };
    },
    scan: (ci, pi) => {
      const m = where[ci]?.[pi]; if (!m) return Promise.reject(new Error('no such page'));
      let s = scanCache.get(m.pdfPage);
      if (!s) { s = renderPage(m.pdfPage).then(c => canvasToUrl(c, urls, 0.8)); scanCache.set(m.pdfPage, s); s.catch(() => scanCache.delete(m.pdfPage)); }
      return s;
    },
    dispose: () => { urls.forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }); try { pdf.destroy(); } catch { /* ignore */ } },
  };
}
