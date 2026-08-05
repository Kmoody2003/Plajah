// documentImport — bring outside manuscripts into Lorea's writing tools, entirely
// in the browser (no backend, works on web + native + offline).
//
//   • .txt / .text / .fountain / .md / .markdown  → read directly
//   • .docx                                       → dep-free unzip (DecompressionStream)
//                                                   → word/document.xml → rich paragraphs
//   • .pdf                                        → pdfjs text layer, grouped into lines
//
// Google Docs / Pages / Word Online all export to one of the above (File → Download),
// so "import a Google Doc" = download as .docx (or .pdf / .txt) and import that file.
//
// Two shapes are produced from every source:
//   • paragraphs[]  — { text, html, heading } for the prose word processor (BookAuthoringStudio)
//   • plainText     — a single newline-joined string for the screenplay parser (ScriptWritingStudio)

import type { ScriptElement, ScriptElementType } from '../types';

export interface ImportedParagraph {
  /** Plain text of the paragraph (entities decoded, runs concatenated). */
  text: string;
  /** Inline-formatted HTML (<strong>/<em> preserved) wrapped in <p>/<h1..3>. */
  html: string;
  /** 0 = body paragraph, 1..3 = heading level (chapter / section boundaries). */
  heading: number;
}

export interface ExtractedDocument {
  title: string;
  paragraphs: ImportedParagraph[];
  /** All paragraph text joined with newlines — the input to the screenplay parser. */
  plainText: string;
}

const SUPPORTED = ['txt', 'text', 'fountain', 'md', 'markdown', 'docx', 'pdf'] as const;
export const SUPPORTED_IMPORT_EXTENSIONS = SUPPORTED;
export const SUPPORTED_IMPORT_ACCEPT = '.txt,.text,.fountain,.md,.markdown,.docx,.pdf';

export function extOf(name: string): string {
  return (name.toLowerCase().split('.').pop() || '').trim();
}

export function isSupportedImport(name: string): boolean {
  return (SUPPORTED as readonly string[]).includes(extOf(name));
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, m => XML_ENTITIES[m] ?? m);
}

/** Escape plain text for safe insertion into the contentEditable prose editor. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── ZIP (dep-free, for .docx which is a ZIP of XML) ─────────────────────────────

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream;
  if (!DS) throw new Error('This browser can’t open .docx files — try Chrome, Edge, or Firefox, or import a .pdf / .txt.');
  const stream = new Blob([data]).stream().pipeThrough(new DS('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Pull a single named entry out of a ZIP archive (walks the central directory). */
async function readZipEntry(file: File, entryName: string): Promise<Uint8Array | null> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This .docx file looks corrupt (not a valid archive).');
  const count = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  for (let e = 0; e < count; e++) {
    if (dv.getUint32(cd, true) !== 0x02014b50) break;
    const method = dv.getUint16(cd + 10, true);
    const compSize = dv.getUint32(cd + 20, true);
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    const localOff = dv.getUint32(cd + 42, true);
    const name = new TextDecoder().decode(buf.subarray(cd + 46, cd + 46 + nameLen));
    cd += 46 + nameLen + extraLen + commentLen;
    if (name !== entryName) continue;
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    if (method === 0) return comp;
    if (method === 8) return await inflateRaw(comp);
    return null;
  }
  return null;
}

// ── .docx ───────────────────────────────────────────────────────────────────

/** Turn one <w:p>…</w:p> paragraph of WordprocessingML into an ImportedParagraph. */
function parseDocxParagraph(pXml: string): ImportedParagraph {
  // Heading level from the paragraph style (Title, Heading1–9).
  let heading = 0;
  const styleMatch = pXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/);
  if (styleMatch) {
    const v = styleMatch[1].toLowerCase();
    if (v === 'title') heading = 1;
    else {
      const hm = v.match(/heading\s*(\d)/);
      if (hm) heading = Math.min(3, parseInt(hm[1], 10));
    }
  }

  let text = '';
  let html = '';
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(pXml))) {
    const run = m[1];
    const rPr = run.match(/<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '';
    const bold = /<w:b\b(?![a-zA-Z])/.test(rPr);   // <w:b/> but not <w:bCs/>
    const italic = /<w:i\b(?![a-zA-Z])/.test(rPr); // <w:i/> but not <w:iCs/>

    // Preserve run-internal breaks/tabs, then strip every remaining tag while
    // keeping the text-node contents in order.
    let seg = run
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?>/g, '\n')
      .replace(/<w:t\b[^>]*>/g, '')
      .replace(/<\/w:t>/g, '')
      .replace(/<[^>]+>/g, '');
    seg = decodeEntities(seg);
    if (!seg) continue;

    text += seg;
    let piece = escapeHtml(seg).replace(/\n/g, '<br/>');
    if (italic) piece = `<em>${piece}</em>`;
    if (bold) piece = `<strong>${piece}</strong>`;
    html += piece;
  }

  text = text.replace(/\t/g, ' ').trim();
  if (heading > 0) {
    html = html.trim() ? `<h${heading}>${html}</h${heading}>` : '';
  } else {
    html = html.trim() ? `<p>${html}</p>` : '';
  }
  return { text, html, heading };
}

async function extractDocx(file: File): Promise<ImportedParagraph[]> {
  const bytes = await readZipEntry(file, 'word/document.xml');
  if (!bytes) throw new Error('Couldn’t read this .docx (no document body found). Re-save it from Word / Google Docs and try again.');
  const xml = new TextDecoder('utf-8').decode(bytes);
  const bodyMatch = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/);
  const body = bodyMatch ? bodyMatch[1] : xml;
  const paras: ImportedParagraph[] = [];
  const pRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(body))) {
    paras.push(parseDocxParagraph(m[1]));
  }
  return paras;
}

// ── .pdf ──────────────────────────────────────────────────────────────────────

async function extractPdf(file: File): Promise<ImportedParagraph[]> {
  const pdfjs: any = await import('pdfjs-dist');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  } catch { /* worker already configured by the bundler */ }

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const paras: ImportedParagraph[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Group text items into visual lines by their y position, then order
      // lines top-to-bottom. Blank vertical gaps become paragraph breaks.
      const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
      for (const it of content.items as any[]) {
        const s = (it.str ?? '') as string;
        if (!s) continue;
        const y = it.transform[5] as number;
        const x = it.transform[4] as number;
        let line = lines.find(l => Math.abs(l.y - y) < 3);
        if (!line) { line = { y, parts: [] }; lines.push(line); }
        line.parts.push({ x, s });
      }
      lines.sort((a, b) => b.y - a.y);
      let prevY: number | null = null;
      let buffer = '';
      const flush = () => {
        const t = buffer.replace(/\s+/g, ' ').trim();
        if (t) paras.push({ text: t, html: `<p>${escapeHtml(t)}</p>`, heading: 0 });
        buffer = '';
      };
      for (const line of lines) {
        const lineText = line.parts.sort((a, b) => a.x - b.x).map(pt => pt.s).join('').trim();
        if (!lineText) continue;
        const gap = prevY == null ? 0 : prevY - line.y;
        // A larger-than-normal vertical gap → new paragraph.
        if (prevY != null && gap > 18) flush();
        buffer += (buffer ? ' ' : '') + lineText;
        prevY = line.y;
      }
      flush();
    }
  } finally {
    try { pdf.destroy(); } catch { /* */ }
  }
  return paras;
}

// ── Public: unified extraction ──────────────────────────────────────────────

function plainTextToParagraphs(raw: string, markdown: boolean): ImportedParagraph[] {
  const blocks = raw.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const paras: ImportedParagraph[] = [];
  for (const block of blocks) {
    const t = block.trim();
    if (!t) continue;
    let heading = 0;
    let body = t;
    if (markdown) {
      const h = t.match(/^(#{1,3})\s+(.+)$/);
      if (h && !t.includes('\n')) { heading = h[1].length; body = h[2]; }
    }
    const text = body.replace(/\n/g, ' ').trim();
    const inner = markdown
      ? mdInline(escapeHtml(body)).replace(/\n/g, '<br/>')
      : escapeHtml(body).replace(/\n/g, '<br/>');
    const html = heading > 0 ? `<h${heading}>${inner}</h${heading}>` : `<p>${inner}</p>`;
    paras.push({ text, html, heading });
  }
  return paras;
}

function mdInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/**
 * Extract a document into paragraphs + plain text, entirely client-side.
 * Throws with a friendly message on unsupported / corrupt input.
 */
export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const ext = extOf(file.name);
  let paragraphs: ImportedParagraph[];  // prose model for the word processor (non-empty)
  let plainText: string;                // structure-preserving text for the screenplay parser

  switch (ext) {
    case 'txt': case 'text': case 'fountain': {
      const raw = await file.text();
      paragraphs = plainTextToParagraphs(raw, false);
      plainText = raw.replace(/\r\n?/g, '\n'); // keep every line/blank exactly as written
      break;
    }
    case 'md': case 'markdown': {
      const raw = await file.text();
      paragraphs = plainTextToParagraphs(raw, true);
      plainText = raw.replace(/\r\n?/g, '\n');
      break;
    }
    case 'docx': {
      // extractDocx keeps empty paragraphs — those blank lines are the beat/scene
      // separators the screenplay parser relies on, so preserve them in plainText.
      const all = await extractDocx(file);
      plainText = all.map(p => p.text).join('\n');
      paragraphs = all.filter(p => p.text.trim() || p.heading > 0);
      break;
    }
    case 'pdf': {
      const all = await extractPdf(file);
      paragraphs = all.filter(p => p.text.trim());
      // PDF paragraphs are already gap-separated; join with blank lines so each
      // becomes its own screenplay block.
      plainText = paragraphs.map(p => p.text).join('\n\n');
      break;
    }
    case 'doc':
      throw new Error('Old .doc files aren’t supported — open it in Word / Google Docs and save as .docx, then import that.');
    default:
      throw new Error(`Unsupported file type “.${ext}”. Supported: ${SUPPORTED.map(e => '.' + e).join(' · ')}.`);
  }

  // Title = first heading, else the filename (sans extension).
  const firstHeading = paragraphs.find(p => p.heading > 0)?.text;
  const title = (firstHeading || file.name.replace(/\.[^.]+$/, '')).trim();
  return { title, paragraphs, plainText };
}

// ── Screenplay parsing (for ScriptWritingStudio) ───────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);
const makeEl = (type: ScriptElementType, text = ''): ScriptElement => ({ id: uid(), type, text: text.trim() });

const SCENE_RE = /^(INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E|E\/I)[\.\s]/i;
const TRANSITION_WORDS = /^(CUT TO|SMASH CUT|MATCH CUT|JUMP CUT|HARD CUT|FADE IN|FADE OUT|FADE TO(?: BLACK)?|DISSOLVE TO|WIPE TO|IRIS (?:IN|OUT)|TIME CUT|INTERCUT|BACK TO)\b/i;

function looksLikeScene(line: string): boolean {
  return SCENE_RE.test(line.trim());
}

function looksLikeTransition(line: string): boolean {
  const t = line.trim();
  if (t !== t.toUpperCase()) return false;
  return /TO:$/.test(t) || TRANSITION_WORDS.test(t) || /^FADE (IN|OUT)\.?$/i.test(t);
}

function looksLikeCharacter(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 45) return false;
  // Strip a trailing extension like (V.O.), (CONT'D), (O.S.)
  const core = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!core || core.length > 40) return false;
  if (core !== core.toUpperCase()) return false;
  if (!/[A-Z]/.test(core)) return false;
  if (/[.!?,:;"]$/.test(core)) return false;
  if (looksLikeScene(core) || looksLikeTransition(core)) return false;
  return true;
}

const isParenthetical = (line: string) => /^\(.*\)$/.test(line.trim());

/**
 * Parse free text (from any imported document) into screenplay elements.
 * Understands Fountain force-markers (., !, @, >, #, ~) and falls back to
 * industry-standard heuristics (INT./EXT. scene lines, ALL-CAPS cues, CUT TO:).
 * Prose that isn't formatted like a screenplay lands as ACTION blocks the
 * writer can re-tag — nothing is lost.
 */
export function screenplayFromText(input: string): ScriptElement[] {
  const clean = input.replace(/\r\n?/g, '\n');
  const lines = clean.split('\n');

  // Skip a Fountain-style title page (key: value pairs before the first blank
  // line or the `===` divider). Its content is handled by the caller separately.
  let start = 0;
  if (/^[A-Za-z][\w ]*:/.test(lines[0]?.trim() || '')) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === '===' ) { start = i + 1; break; }
      if (t === '') {
        // Confirm the block above was all key:value / indented continuations.
        const block = lines.slice(0, i);
        if (block.every(l => l.trim() === '' || /^[A-Za-z][\w ]*:/.test(l.trim()) || /^\s+\S/.test(l))) start = i + 1;
        break;
      }
    }
  }

  // Split remaining text into blank-line-delimited blocks.
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') { if (cur.length) { blocks.push(cur); cur = []; } }
    else cur.push(line);
  }
  if (cur.length) blocks.push(cur);

  const els: ScriptElement[] = [];
  for (const block of blocks) {
    const first = block[0].trim();

    // Fountain page-break divider (=== / ====…) — structural, not content.
    if (block.length === 1 && /^={3,}$/.test(first)) continue;

    // Fountain forced markers on the first line drive the whole block.
    if (first.startsWith('.') && !first.startsWith('..')) { els.push(makeEl('SCENE_HEADING', first.slice(1))); pushRest(block, els); continue; }
    if (first.startsWith('!')) { els.push(makeEl('ACTION', block.map(l => l.replace(/^!/, '')).join('\n'))); continue; }
    if (first.startsWith('#')) { els.push(makeEl('SECTION', first.replace(/^#+\s*/, ''))); pushRest(block, els); continue; }
    if (first.startsWith('>')) {
      const centered = /</.test(first);
      els.push(centered ? makeEl('ACTION', first.replace(/^>|<$/g, '').trim()) : makeEl('TRANSITION', first.replace(/^>/, '').replace(/:$/, '').trim()));
      pushRest(block, els); continue;
    }
    if (first.startsWith('@')) { emitDialogueBlock(block, first.slice(1), els); continue; }

    if (looksLikeScene(first)) { els.push(makeEl('SCENE_HEADING', first)); pushRest(block, els); continue; }
    if (looksLikeTransition(first) && block.length === 1) { els.push(makeEl('TRANSITION', first.replace(/:$/, ''))); continue; }

    if (looksLikeCharacter(first) && block.length > 1) { emitDialogueBlock(block, first, els); continue; }

    // A lone all-caps line that reads like a cue but has no dialogue under it:
    // treat as a shot / action rather than dropping it.
    if (looksLikeCharacter(first) && block.length === 1) { els.push(makeEl('ACTION', first)); continue; }

    // Default: action paragraph (join wrapped lines into one flowing block).
    els.push(makeEl('ACTION', block.join('\n')));
  }

  if (!els.length) els.push(makeEl('ACTION', ''));
  return els;
}

// Emit a CHARACTER cue followed by its dialogue / parentheticals.
function emitDialogueBlock(block: string[], cueText: string, els: ScriptElement[]) {
  els.push(makeEl('CHARACTER', cueText));
  const rest = block.slice(1);
  let dialogue: string[] = [];
  const flush = () => { if (dialogue.length) { els.push(makeEl('DIALOGUE', dialogue.join('\n'))); dialogue = []; } };
  for (const raw of rest) {
    const line = raw.replace(/^~/, '').trim();
    if (!line) continue;
    if (isParenthetical(line)) { flush(); els.push(makeEl('PARENTHETICAL', line.replace(/^\(|\)$/g, ''))); }
    else dialogue.push(line);
  }
  flush();
}

// For scene/section/transition blocks, treat any trailing lines as action.
function pushRest(block: string[], els: ScriptElement[]) {
  const rest = block.slice(1).filter(l => l.trim());
  if (rest.length) els.push(makeEl('ACTION', rest.join('\n')));
}
