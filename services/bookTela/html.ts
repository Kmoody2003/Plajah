// HTML-lite <-> Tela Writer blocks, and the escaping helpers the exporters share. Pure.
//
// Canonical chapter HTML is what comes out of blocksToHtml(htmlToBlocks(x)): sanitised, attribute-less tags
// (plus <img src alt> for figures) in a fixed serialisation. The round-trip contract is
//   telaDocToBook(bookToTelaDoc(b)).chapters[i].html === normalizeChapterHtml(b.chapters[i]).

import type { TelaBlock } from '../../types';

export const esc = (s: string): string => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const unesc = (s: string): string => (s ?? '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
export const stripTags = (html: string): string => unesc((html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));

/** A parsed unit of chapter content: a text block, or a figure. */
export type ChapterNode =
  | { type: 'block'; block: Omit<TelaBlock, 'id'> }
  | { type: 'image'; src: string; alt: string; caption?: string };

const INLINE_KEEP: Record<string, string> = { strong: 'strong', b: 'strong', em: 'em', i: 'em', sup: 'sup', sub: 'sub', code: 'code' };

/** Reduce inline markup to strong/em/sup/sub/code/br; escape everything else. */
export function cleanInline(html: string): string {
  const out = (html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g, (m, name: string) => {
      const n = name.toLowerCase();
      if (n === 'br') return '<br/>';
      const k = INLINE_KEEP[n];
      if (!k) return '';
      return m.startsWith('</') ? `</${k}>` : `<${k}>`;
    })
    .replace(/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+|apos|nbsp);)/gi, '&amp;')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, ' ')
    .replace(/(<br\/>)\s+/g, '$1')
    .trim();
  return out;
}

const BLOCK_RE = /<(h[1-6]|p|blockquote|ul|ol|hr|img|figure|div)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>|>)/gi;

function attrOf(attrs: string, name: string): string {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs || '');
  return m ? unesc(m[1] ?? m[2] ?? '') : '';
}

/** Parse HTML-lite (or plain text with blank-line paragraphs) into ordered nodes. */
export function htmlToNodes(input: string): ChapterNode[] {
  let html = (input || '').replace(/\r\n?/g, '\n');
  if (!/<[a-z][^>]*>/i.test(html)) {
    html = html.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('');
  }
  const nodes: ChapterNode[] = [];
  const pushText = (kind: TelaBlock['kind'], inner: string, extra: Partial<TelaBlock> = {}) => {
    const text = cleanInline(inner);
    if (!stripTags(text).trim() && !extra.semanticLabel) return;
    nodes.push({ type: 'block', block: { kind, text, ...extra } });
  };
  BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(html))) {
    const tag = m[1].toLowerCase(); const attrs = m[2] || ''; const inner = m[3] ?? '';
    if (/^h[1-6]$/.test(tag)) {
      const lvl = Number(tag[1]);
      pushText(lvl === 1 ? 'h1' : 'h2', inner, lvl > 2 ? { semanticLabel: tag } : {});
    } else if (tag === 'p' || tag === 'div') {
      // a <div>/<p> that itself wraps block markup is flattened by re-parsing its inside
      if (/<(p|h[1-6]|ul|ol|blockquote|img|figure)\b/i.test(inner)) { nodes.push(...htmlToNodes(inner)); continue; }
      pushText('p', inner);
    } else if (tag === 'blockquote') {
      const paras = inner.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi);
      if (paras) for (const p of paras) pushText('p', p.replace(/^<p\b[^>]*>|<\/p>$/gi, ''), { textRole: 'QUOTE', semanticLabel: 'blockquote' });
      else pushText('p', inner, { textRole: 'QUOTE', semanticLabel: 'blockquote' });
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of inner.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []) pushText('li', li.replace(/^<li\b[^>]*>|<\/li>$/gi, ''), tag === 'ol' ? { semanticLabel: 'ol' } : {});
    } else if (tag === 'hr') {
      nodes.push({ type: 'block', block: { kind: 'p', text: '* * *', semanticLabel: 'hr' } });
    } else if (tag === 'img' || tag === 'figure') {
      const src = tag === 'img' ? attrOf(attrs, 'src') : attrOf(/<img\b([^>]*)>/i.exec(inner)?.[1] || '', 'src');
      if (!src) continue;
      const alt = tag === 'img' ? attrOf(attrs, 'alt') : attrOf(/<img\b([^>]*)>/i.exec(inner)?.[1] || '', 'alt');
      const cap = tag === 'figure' ? stripTags(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(inner)?.[1] || '').trim() : '';
      nodes.push({ type: 'image', src, alt, ...(cap ? { caption: cap } : {}) });
    }
  }
  return nodes;
}

/** Serialise one block back to canonical HTML-lite. Consecutive list items are grouped by the caller. */
export function blockToHtml(b: Pick<TelaBlock, 'kind' | 'text' | 'semanticLabel' | 'textRole'>): string {
  const t = b.text || '';
  if (b.semanticLabel === 'hr') return '<hr/>';
  if (b.semanticLabel === 'blockquote' || b.textRole === 'QUOTE' && b.kind === 'p') return `<blockquote><p>${t}</p></blockquote>`;
  if (b.kind === 'h1') return `<h1>${t}</h1>`;
  if (b.kind === 'h2') return /^h[3-6]$/.test(b.semanticLabel || '') ? `<${b.semanticLabel}>${t}</${b.semanticLabel}>` : `<h2>${t}</h2>`;
  if (b.kind === 'li') return `<li>${t}</li>`;
  return `<p>${t}</p>`;
}

export function nodesToHtml(nodes: ReadonlyArray<ChapterNode | { type: 'block'; block: Pick<TelaBlock, 'kind' | 'text' | 'semanticLabel' | 'textRole'> }>): string {
  const out: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; } };
  let lastQuote = false;
  for (const n of nodes) {
    if (n.type === 'image') {
      flush(); lastQuote = false;
      out.push(`<figure><img src="${esc(n.src)}" alt="${esc(n.alt)}"/>${n.caption ? `<figcaption>${esc(n.caption)}</figcaption>` : ''}</figure>`);
      continue;
    }
    const b = n.block;
    if (b.kind === 'li') {
      const tag = b.semanticLabel === 'ol' ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(blockToHtml(b)); lastQuote = false; continue;
    }
    flush();
    const isQ = blockToHtml(b).startsWith('<blockquote>');
    if (isQ && lastQuote && out.length) { out[out.length - 1] = out[out.length - 1].replace(/<\/blockquote>$/, `<p>${b.text}</p></blockquote>`); continue; }
    lastQuote = isQ;
    out.push(blockToHtml(b));
  }
  flush();
  return out.join('\n');
}

/** Canonical chapter HTML: parsed + reserialised, with a leading duplicate of the chapter title removed. */
export function normalizeChapterHtml(title: string, html: string): string {
  const nodes = htmlToNodes(html);
  const first = nodes[0];
  if (first && first.type === 'block' && (first.block.kind === 'h1' || first.block.kind === 'h2')) {
    const norm = (s: string) => stripTags(s).replace(/\s+/g, ' ').trim().toLowerCase();
    if (norm(first.block.text) === norm(title)) nodes.shift();
  }
  return nodesToHtml(nodes);
}

export const plainText = (html: string): string => stripTags(html.replace(/<\/(p|h[1-6]|li|blockquote|figure)>/gi, '\n\n')).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
export const wordCountOf = (text: string): number => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

/** XML-safe slug for ids/file names. */
export const slug = (s: string, fallback = 'x'): string => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fallback;
