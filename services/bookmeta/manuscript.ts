// Manuscript intake: turn whatever the author dropped (.epub .docx .pdf .md .txt) into reviewable chapters.
//
// The splitting / detection functions are PURE (paragraph arrays in, chapters out) so they are unit-tested.
// `ingestManuscript(file)` is the browser entry: it reuses services/documentImport.ts for docx/pdf/md/txt
// and services/bookmeta/epub.ts for EPUB. Everything runs client-side; nothing leaves the browser until the
// author saves a draft or submits.

import type { ManuscriptChapter, Finding, BookMetadata } from './types';
import { countWords, escapeAttr } from './util';

export interface ParaIn { text: string; html: string; heading: number }

const CHAPTER_WORD_RE = /^(chapter|part|book|section|act)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty[\w-]*|thirty[\w-]*|forty[\w-]*|fifty[\w-]*)\b[\s.:\-–—]*(.*)$/i;
const SPECIAL_RE = /^(prologue|epilogue|preface|foreword|introduction|afterword|acknowledg(?:e)?ments?|dedication|about the author|author'?s note|appendix|interlude|prelude|contents|table of contents|copyright|title page)\b/i;
const SCENE_BREAK_RE = /^(\*\s*){3,}$|^[-–—_=#~*]{3,}$|^#$|^\*\*\*$/;
const BACK_TITLE = /acknowledg|about the author|afterword|appendix|author'?s note|also by|bibliograph|endnotes/i;
const FRONT_TITLE = /^(contents|table of contents|copyright|title page|dedication|epigraph|half title)/i;

export function looksLikeChapterHeading(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  if (CHAPTER_WORD_RE.test(t) || SPECIAL_RE.test(t)) return true;
  return /^\d{1,3}$/.test(t) || /^[IVXLCDM]{1,7}\.?$/.test(t); // a bare "7" or "XII" line
}

let seq = 0;
const cid = () => `ch_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function mkChapter(title: string, paras: ParaIn[], autoSplit = false): ManuscriptChapter {
  const text = paras.map(p => p.text).join('\n\n').trim();
  const kind: ManuscriptChapter['kind'] = FRONT_TITLE.test(title) ? (/contents/i.test(title) ? 'toc' : 'front') : BACK_TITLE.test(title) ? 'back' : 'chapter';
  return { id: cid(), title: title.trim() || 'Untitled section', html: paras.map(p => p.html).join('\n'), text, wordCount: countWords(text), kind, included: kind !== 'toc', autoSplit: autoSplit || undefined };
}

export interface SplitOptions { targetWords?: number }

/**
 * Split paragraphs into chapters. Strategy, in order:
 *  1. real headings (the shallowest heading level that occurs >= 2 times);
 *  2. "Chapter N" / "Prologue" style lines;
 *  3. scene-break groups of ~targetWords words (marked autoSplit so the author reviews them);
 *  4. one chapter.
 */
export function splitIntoChapters(paras: ParaIn[], opts: SplitOptions = {}): ManuscriptChapter[] {
  const body = paras.filter(p => p.text.trim() || p.heading > 0);
  if (!body.length) return [];
  const target = opts.targetWords ?? 4000;

  const levels = body.filter(p => p.heading > 0).map(p => p.heading);
  let boundary: ((p: ParaIn) => boolean) | null = null;
  for (const lvl of [1, 2, 3]) {
    if (levels.filter(l => l === lvl).length >= 2) { boundary = p => p.heading === lvl; break; }
  }
  if (!boundary && body.filter(p => looksLikeChapterHeading(p.text)).length >= 2) boundary = p => looksLikeChapterHeading(p.text) && p.text.length < 90;
  // A single document title H1 followed by H2 chapters: the rule above picks H2 (H1 occurs once). Good.

  if (boundary) {
    const out: ManuscriptChapter[] = [];
    let title = ''; let cur: ParaIn[] = []; let seen = false;
    const flush = () => {
      if (!seen && !cur.length) return;
      if (!seen) { // text before the first heading = front matter / title page
        const w = countWords(cur.map(p => p.text).join(' '));
        if (w > 0) out.push({ ...mkChapter('Front matter', cur), kind: 'front' });
      } else out.push(mkChapter(title, cur));
      cur = [];
    };
    for (const p of body) {
      if (boundary(p)) { flush(); seen = true; title = p.text.trim(); continue; }
      cur.push(p);
    }
    flush();
    return out;
  }

  const total = countWords(body.map(p => p.text).join(' '));
  if (total <= target * 1.5) return [mkChapter('Chapter 1', body)];

  // No structure at all: chunk at scene breaks (or paragraph boundaries) near the target size.
  const out: ManuscriptChapter[] = [];
  let cur: ParaIn[] = []; let words = 0;
  for (const p of body) {
    const isBreak = SCENE_BREAK_RE.test(p.text.trim());
    if (isBreak && words >= target * 0.7) { out.push(mkChapter(`Chapter ${out.length + 1}`, cur, true)); cur = []; words = 0; continue; }
    if (!isBreak) { cur.push(p); words += countWords(p.text); }
    if (words >= target * 1.4) { out.push(mkChapter(`Chapter ${out.length + 1}`, cur, true)); cur = []; words = 0; }
  }
  if (cur.length) out.push(mkChapter(`Chapter ${out.length + 1}`, cur, true));
  return out;
}

export interface Detected { title: string; author: string; confident: boolean }

/** Guess title/author from the top of the manuscript ("Title" / "by Name") and the file name ("Title - Author.docx"). */
export function detectTitleAuthor(paras: ParaIn[], fileName: string, docProps?: { title?: string; author?: string }): Detected {
  let title = (docProps?.title || '').trim();
  let author = (docProps?.author || '').trim();
  const top = paras.filter(p => p.text.trim()).slice(0, 8);
  for (let i = 0; i < top.length; i++) {
    const m = /^by\s+(.{2,60})$/i.exec(top[i].text.trim());
    if (m && !author) {
      author = m[1].trim();
      if (!title && i > 0 && top[i - 1].text.length < 120) title = top[i - 1].text.trim();
    }
  }
  if (!title) { const h = paras.find(p => p.heading === 1 && p.text.length < 120); if (h) title = h.text.trim(); }
  if (!title || !author) {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
    if (m) { if (!title) title = m[1].trim(); if (!author) author = m[2].trim(); }
    else if (!title) title = base;
  }
  if (/^(untitled|document\d*|manuscript|new document|book)\b/i.test(title)) title = '';
  return { title, author, confident: !!title && !!author };
}

/** Review-time sanity warnings about the split itself. */
export function chapterReviewFindings(chs: ManuscriptChapter[]): Finding[] {
  const f: Finding[] = [];
  const inc = chs.filter(c => c.included && (c.kind ?? 'chapter') === 'chapter');
  if (!inc.length) f.push({ code: 'ms.no_chapters', severity: 'error', area: 'manuscript', message: 'No chapters are included.', fix: 'Tick at least one chapter, or drop in a manuscript.' });
  if (chs.some(c => c.autoSplit)) f.push({ code: 'ms.auto_split', severity: 'info', area: 'manuscript', message: 'Your file had no chapter headings, so we split it at scene breaks.', fix: 'Rename, merge or move the split points below until it reads right.' });
  const titles = new Map<string, number>();
  for (const c of inc) titles.set(c.title.toLowerCase(), (titles.get(c.title.toLowerCase()) || 0) + 1);
  const dup = [...titles.entries()].filter(([, n]) => n > 1).map(([t]) => t);
  if (dup.length) f.push({ code: 'ms.dup_titles', severity: 'warning', area: 'manuscript', message: `Duplicate chapter titles: ${dup.slice(0, 3).join(', ')}.`, fix: 'Give each chapter a distinct title.' });
  return f;
}

export function mergeChapters(chs: ManuscriptChapter[], i: number): ManuscriptChapter[] {
  if (i < 0 || i >= chs.length - 1) return chs;
  const a = chs[i], b = chs[i + 1];
  const merged: ManuscriptChapter = { ...a, html: `${a.html}\n${b.html}`, text: `${a.text}\n\n${b.text}`, wordCount: a.wordCount + b.wordCount, autoSplit: a.autoSplit || b.autoSplit };
  return [...chs.slice(0, i), merged, ...chs.slice(i + 2)];
}

/** Split chapter i in two at the paragraph boundary nearest the middle. */
export function splitChapter(chs: ManuscriptChapter[], i: number): ManuscriptChapter[] {
  const c = chs[i]; if (!c) return chs;
  const parts = c.html.split('\n').filter(Boolean);
  if (parts.length < 2) return chs;
  const mid = Math.floor(parts.length / 2);
  const mk = (arr: string[], title: string): ManuscriptChapter => {
    const text = arr.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return { ...c, id: cid(), title, html: arr.join('\n'), text, wordCount: countWords(text) };
  };
  return [...chs.slice(0, i), mk(parts.slice(0, mid), c.title), mk(parts.slice(mid), `${c.title} (cont.)`), ...chs.slice(i + 1)];
}

/** Generated (not authored) pages Plajah adds in the reader: a title page, copyright, and TOC. Pure HTML. */
export function titlePageHtml(m: Pick<BookMetadata, 'title' | 'subtitle' | 'penName' | 'contributors'>): string {
  const author = m.penName || m.contributors.find(c => c.role === 'author')?.name || '';
  return `<h1>${escapeAttr(m.title)}</h1>${m.subtitle ? `<p><em>${escapeAttr(m.subtitle)}</em></p>` : ''}${author ? `<p>${escapeAttr(author)}</p>` : ''}`;
}

// ── Browser entry ────────────────────────────────────────────────────────────

export interface IngestResult {
  source: 'epub' | 'docx' | 'pdf' | 'md' | 'txt';
  chapters: ManuscriptChapter[];
  detected: Detected;
  language?: string;
  findings: Finding[];
  /** EPUB only. */
  epub?: { accessibility: import('./epub').EpubInspection['accessibility']; hasNav: boolean; coverBytes?: Uint8Array; coverMime?: string; metadata: import('./epub').EpubMetadata };
  wordCount: number;
}

export const MANUSCRIPT_ACCEPT = '.epub,.docx,.pdf,.md,.markdown,.txt,.text';
export const MAX_MANUSCRIPT_BYTES = 100 * 1024 * 1024;

export async function ingestManuscript(file: File): Promise<IngestResult> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.size > MAX_MANUSCRIPT_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(0)} MB; the limit is 100 MB. Compress images or split the book.`);

  if (ext === 'epub') {
    const { inspectEpub, readEpubFile } = await import('./epub');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await inspectEpub(bytes);
    if (!r.readable && !r.chapters.length) throw new Error(r.findings.find(f => f.severity === 'error')?.message || 'Could not read this EPUB.');
    let coverBytes: Uint8Array | undefined; let coverMime: string | undefined;
    if (r.coverPath) { coverBytes = (await readEpubFile(bytes, r.coverPath)) ?? undefined; coverMime = /png$/i.test(r.coverPath) ? 'image/png' : /gif$/i.test(r.coverPath) ? 'image/gif' : 'image/jpeg'; }
    const wordCount = r.chapters.filter(c => c.included).reduce((s, c) => s + c.wordCount, 0);
    return {
      source: 'epub', chapters: r.chapters, findings: r.findings, wordCount, language: r.metadata.language,
      detected: { title: r.metadata.title || file.name.replace(/\.[^.]+$/, ''), author: r.metadata.creators[0] || '', confident: !!r.metadata.title },
      epub: { accessibility: r.accessibility, hasNav: r.hasNav || r.hasNcx, coverBytes, coverMime, metadata: r.metadata },
    };
  }

  let docProps: { title?: string; author?: string } | undefined;
  if (ext === 'docx') docProps = await readDocxProps(file).catch(() => undefined);

  const { extractDocument } = await import('../documentImport');
  const doc = await extractDocument(file);
  const paras: ParaIn[] = doc.paragraphs.map(p => ({ text: p.text, html: p.html, heading: p.heading }));
  if (ext === 'pdf' && paras.length < 3) throw new Error('This PDF has almost no selectable text — it may be scanned images. Export a text-based PDF, or upload a .docx or .epub.');
  const chapters = splitIntoChapters(paras);
  const wordCount = chapters.filter(c => c.included).reduce((s, c) => s + c.wordCount, 0);
  const findings: Finding[] = chapterReviewFindings(chapters);
  if (ext === 'pdf') findings.push({ code: 'ms.pdf_reflow', severity: 'info', area: 'manuscript', message: 'PDF text was re-flowed into chapters. Headers, footers and page numbers can leak into the text.', fix: 'Skim the chapters below, or upload the .docx / .epub source for a cleaner result.' });
  const source = (ext === 'md' || ext === 'markdown') ? 'md' : (ext === 'txt' || ext === 'text') ? 'txt' : (ext as 'docx' | 'pdf');
  return { source, chapters, findings, wordCount, detected: detectTitleAuthor(paras, file.name, docProps) };
}

async function readDocxProps(file: File): Promise<{ title?: string; author?: string }> {
  const { readZipEntries, readZipText } = await import('./zip');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const e = readZipEntries(bytes).find(x => x.name === 'docProps/core.xml');
  if (!e) return {};
  const xml = await readZipText(bytes, e);
  const g = (n: string) => new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(xml)?.[1]?.replace(/<[^>]+>/g, '').trim();
  return { title: g('dc:title'), author: g('dc:creator') };
}
