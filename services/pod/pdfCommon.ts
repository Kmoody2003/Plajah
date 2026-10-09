// Shared PDF helpers for the interior + cover builders (pdf-lib + @pdf-lib/fontkit, both MIT).
// Fonts are EMBEDDED (EB Garamond, SIL OFL, latin subset from @fontsource/eb-garamond) as printers require.
import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BookFonts { regular: PDFFont; italic: PDFFont; bold: PDFFont; boldItalic: PDFFont }

function fontDir(): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules/@fontsource/eb-garamond/files'),
    ...(typeof __dirname !== 'undefined' ? [path.join(__dirname, '../../node_modules/@fontsource/eb-garamond/files')] : []),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('EB Garamond font files not found (npm i @fontsource/eb-garamond)');
}

export async function embedBookFonts(doc: PDFDocument): Promise<BookFonts> {
  doc.registerFontkit(fontkit);
  const dir = fontDir();
  const load = async (name: string) => doc.embedFont(fs.readFileSync(path.join(dir, `eb-garamond-latin-${name}.woff`)), { subset: true });
  return { regular: await load('400-normal'), italic: await load('400-italic'), bold: await load('700-normal'), boldItalic: await load('700-italic') };
}

export const inToPt = (n: number) => n * 72;
export const BLACK = rgb(0, 0, 0);

export function hexToRgb(hex: string | undefined, fallback = '#1f2937') {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '') || /^#?([0-9a-f]{6})$/i.exec(fallback)!;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Replace characters the embedded font cannot draw. Returns cleaned text + count replaced. */
export function sanitizeFor(font: PDFFont, text: string): { text: string; replaced: number } {
  const set = new Set(font.getCharacterSet());
  let replaced = 0, out = '';
  for (const ch of text.replace(/ /g, ' ').replace(/[\t\r]/g, ' ').replace(/[​-‍﻿­]/g, '')) {
    const cp = ch.codePointAt(0)!;
    if (ch === '\n' || cp === 32 || set.has(cp)) out += ch; else { out += '?'; replaced++; }
  }
  return { text: out, replaced };
}

/** Greedy word-wrap. Words wider than maxW are hard-split. */
export function wrapLines(font: PDFFont, size: number, text: string, maxW: number, firstLineIndent = 0): Array<{ words: string[]; width: number; indent: number }> {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: Array<{ words: string[]; width: number; indent: number }> = [];
  const space = font.widthOfTextAtSize(' ', size);
  let cur: string[] = [], curW = 0, indent = firstLineIndent;
  const flush = () => { if (cur.length) { lines.push({ words: cur, width: curW, indent }); cur = []; curW = 0; indent = 0; } };
  for (let w of words) {
    let ww = font.widthOfTextAtSize(w, size);
    while (ww > maxW - indent) { // hard split a pathological token
      let n = w.length;
      while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > maxW - indent) n--;
      flush();
      lines.push({ words: [w.slice(0, n)], width: font.widthOfTextAtSize(w.slice(0, n), size), indent });
      indent = 0; w = w.slice(n); ww = font.widthOfTextAtSize(w, size);
      if (!w) break;
    }
    if (!w) continue;
    const add = (cur.length ? space : 0) + ww;
    if (cur.length && curW + add + indent > maxW) flush();
    curW += (cur.length ? space : 0) + ww;
    cur.push(w);
  }
  flush();
  return lines;
}

export function htmlToText(input: string): string {
  if (!/[<&]/.test(input)) return input;
  return input
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…').replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, '\n\n');
}

export function splitParagraphs(text: string): string[] {
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) return [];
  const parts = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/).map(p => p.replace(/\n+/g, ' ')) : t.split('\n');
  return parts.map(p => p.trim()).filter(Boolean);
}
