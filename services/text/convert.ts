// convert — bridges between the text model and the formats already on the platform:
//  • Tela Writer blocks (`TelaBlock`: h1/h2/p/li with inline strong/em/br/code HTML),
//  • Tela vector TEXT objects (one string + a flat bag of type props),
//  • clipboard HTML / plain text.
// The HTML reader is a small tolerant tokenizer (no DOM) so it runs in node, workers and tests.

import type { TelaBlock, TelaVectorObject } from '../../types';
import { type CharAttrs, type Paragraph, type ParaAttrs, type Run, type StyleSheet, type TextStory, newId, normalizeRuns, paragraphText, resolveParagraph, resolveRun, createStory } from './model';

/** U+2028 LINE SEPARATOR (forced line break) / U+2029 PARAGRAPH SEPARATOR, built from code
 *  points because a literal in source is a JS line terminator. */
const LSEP = String.fromCharCode(0x2028);
const PSEP = String.fromCharCode(0x2029);

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '­', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Frame { tag: string; attrs: CharAttrs; styleId?: string }

function styleToAttrs(style: string): CharAttrs {
  const a: CharAttrs = {};
  for (const decl of style.split(';')) {
    const [k, ...rest] = decl.split(':');
    const v = rest.join(':').trim();
    switch (k?.trim().toLowerCase()) {
      case 'font-weight': a.fontWeight = v === 'bold' ? 700 : v === 'normal' ? 400 : parseInt(v) || undefined; break;
      case 'font-style': a.fontStyle = v.includes('italic') ? 'italic' : 'normal'; break;
      case 'color': a.color = v; break;
      case 'background-color': if (v !== 'transparent') a.highlight = v; break;
      case 'font-size': { const n = parseFloat(v); if (n) a.fontSize = v.endsWith('pt') ? n * 96 / 72 : n; break; }
      case 'font-family': a.fontFamily = v.split(',')[0].replace(/["']/g, '').trim(); break;
      case 'text-decoration': case 'text-decoration-line':
        if (v.includes('underline')) a.underline = true;
        if (v.includes('line-through')) a.strike = true;
        break;
      case 'font-variant': case 'font-variant-caps': if (v.includes('small-caps')) a.caps = 'small-caps'; break;
      case 'letter-spacing': { const n = parseFloat(v); if (n && v.endsWith('em')) a.tracking = n * 1000; break; }
      case 'vertical-align': if (v === 'super') a.position = 'super'; else if (v === 'sub') a.position = 'sub'; break;
    }
  }
  return a;
}

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'tr']);
const BLOCK_STYLE: Record<string, string> = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3', blockquote: 'quote', pre: 'code' };

/** HTML (clipboard, Writer blocks, imports) → paragraphs. Unknown tags are transparent. */
export function htmlToParagraphs(html: string): Paragraph[] {
  const paras: Paragraph[] = [];
  let cur: Paragraph | null = null;
  const stack: Frame[] = [{ tag: '#root', attrs: {} }];
  let listKind: 'bullet' | 'number' | null = null;
  const open = (styleId?: string, attrs?: ParaAttrs) => { cur = { id: newId(), styleId, attrs, runs: [] }; paras.push(cur); };
  const ensure = () => { if (!cur) open(); return cur!; };
  const top = () => stack[stack.length - 1];
  const push = (text: string) => {
    if (!text) return;
    const p = ensure();
    const f = top();
    p.runs.push({ text, styleId: f.styleId, attrs: Object.keys(f.attrs).length ? f.attrs : undefined });
  };
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const body = html.replace(/^[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  while ((m = re.exec(body))) {
    if (m[5] !== undefined) {
      const text = decodeEntities(m[5].replace(/[\r\n\t ]+/g, ' '));
      if (text.trim() || (cur && (cur as Paragraph).runs.length)) push(text);
      continue;
    }
    if (!m[2]) continue;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrStr = m[3] || '';
    if (tag === 'br') { push(LSEP); continue; }
    if (tag === 'ul' || tag === 'ol') { listKind = closing ? null : tag === 'ul' ? 'bullet' : 'number'; continue; }
    if (BLOCK.has(tag)) {
      if (closing) { cur = null; continue; }
      const styleId = BLOCK_STYLE[tag] ?? (tag === 'li' ? (listKind === 'number' ? 'list-number' : 'list') : undefined);
      const align = /text-align:\s*(left|right|center|justify)/i.exec(attrStr)?.[1]?.toLowerCase() as ParaAttrs['align'] | undefined;
      open(styleId, align ? { align } : undefined);
      continue;
    }
    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; }
      continue;
    }
    if (m[4] === '/') continue;
    const prev = top();
    let attrs: CharAttrs = { ...prev.attrs };
    let styleId = prev.styleId;
    if (tag === 'b' || tag === 'strong') attrs.fontWeight = 700;
    else if (tag === 'i' || tag === 'em' || tag === 'cite') attrs.fontStyle = 'italic';
    else if (tag === 'u' || tag === 'ins') attrs.underline = true;
    else if (tag === 's' || tag === 'strike' || tag === 'del') attrs.strike = true;
    else if (tag === 'sup') attrs.position = 'super';
    else if (tag === 'sub') attrs.position = 'sub';
    else if (tag === 'code' || tag === 'kbd' || tag === 'tt') styleId = 'code';
    else if (tag === 'mark') attrs.highlight = '#fff3a3';
    else if (tag === 'a') { const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrStr); if (href) { attrs.href = decodeEntities(href[1] ?? href[2]); styleId = 'link'; } }
    const style = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(attrStr);
    if (style) attrs = { ...attrs, ...styleToAttrs(decodeEntities(style[1] ?? style[2])) };
    stack.push({ tag, attrs, styleId });
  }
  for (const p of paras) {
    // Trim collapsible whitespace at paragraph edges.
    if (p.runs.length) {
      p.runs[0] = { ...p.runs[0], text: p.runs[0].text.replace(/^ +/, '') };
      const l = p.runs.length - 1;
      p.runs[l] = { ...p.runs[l], text: p.runs[l].text.replace(/ +$/, '') };
    }
    p.runs = normalizeRuns(p.runs);
  }
  return paras.length ? paras : [{ id: newId(), runs: [{ text: '' }] }];
}

export function htmlToStory(html: string): TextStory {
  return { id: newId('s'), paragraphs: htmlToParagraphs(html) };
}

export function plainTextToStory(text: string): TextStory {
  return createStory(text.replace(/\r\n?/g, '\n').split(new RegExp(`\n|${PSEP}`)));
}

function runToHtml(r: Run, sheet?: StyleSheet): string {
  let t = escapeHtml(r.text).split(LSEP).join('<br>');
  const a = { ...(r.styleId && sheet?.character[r.styleId]?.char), ...r.attrs };
  if (r.styleId === 'code') t = `<code>${t}</code>`;
  if (a.position === 'super') t = `<sup>${t}</sup>`;
  if (a.position === 'sub') t = `<sub>${t}</sub>`;
  if (a.strike) t = `<s>${t}</s>`;
  if (a.underline && !a.href) t = `<u>${t}</u>`;
  if (a.fontStyle === 'italic') t = `<em>${t}</em>`;
  if ((a.fontWeight ?? 400) >= 600) t = `<strong>${t}</strong>`;
  const css: string[] = [];
  if (a.color) css.push(`color:${a.color}`);
  if (a.highlight) css.push(`background-color:${a.highlight}`);
  if (a.fontFamily) css.push(`font-family:'${a.fontFamily}'`);
  if (a.fontSize) css.push(`font-size:${a.fontSize}px`);
  if (a.caps === 'small-caps') css.push('font-variant:small-caps');
  if (css.length) t = `<span style="${css.join(';')}">${t}</span>`;
  if (a.href) t = `<a href="${escapeHtml(a.href)}">${t}</a>`;
  return t;
}

/** Story → clipboard/export HTML (semantic tags + inline styles for the rest). */
export function storyToHtml(s: TextStory, sheet?: StyleSheet): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  for (const p of s.paragraphs) {
    const kind = p.attrs?.list?.kind ?? (p.styleId && sheet?.paragraph[p.styleId]?.para?.list?.kind) ?? (p.styleId === 'list' ? 'bullet' : p.styleId === 'list-number' ? 'number' : undefined);
    const want = kind === 'bullet' ? 'ul' : kind === 'number' ? 'ol' : null;
    if (want !== list) { if (list) out.push(`</${list}>`); if (want) out.push(`<${want}>`); list = want; }
    const tag = want ? 'li' : p.styleId === 'h1' || p.styleId === 'title' ? 'h1' : p.styleId === 'h2' ? 'h2' : p.styleId === 'h3' ? 'h3' : p.styleId === 'quote' ? 'blockquote' : 'p';
    const align = p.attrs?.align && p.attrs.align !== 'start' ? ` style="text-align:${p.attrs.align.replace('justify-all', 'justify')}"` : '';
    out.push(`<${tag}${align}>${p.runs.map(r => runToHtml(r, sheet)).join('')}</${tag}>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('\n');
}

// ── Tela ────────────────────────────────────────────────────────────────────────────────────

const KIND_STYLE: Record<TelaBlock['kind'], string | undefined> = { h1: 'h1', h2: 'h2', p: undefined, li: 'list' };

/** Writer blocks → story (block ids become paragraph ids, so positions survive round trips). */
export function fromTelaBlocks(blocks: TelaBlock[]): TextStory {
  const paragraphs: Paragraph[] = [];
  for (const b of blocks) {
    const parsed = htmlToParagraphs(`<p>${b.text}</p>`);
    // A block is one paragraph; <br> inside stays a forced line break.
    const runs = normalizeRuns(parsed.flatMap((p, k) => (k ? [{ text: LSEP }, ...p.runs] : p.runs)));
    paragraphs.push({ id: b.id, styleId: KIND_STYLE[b.kind], runs });
  }
  return { id: newId('s'), paragraphs: paragraphs.length ? paragraphs : [{ id: newId(), runs: [{ text: '' }] }] };
}

function inlineHtml(p: Paragraph): string {
  return p.runs.map(r => {
    let t = escapeHtml(r.text).split(LSEP).join('<br>');
    if (r.styleId === 'code') t = `<code>${t}</code>`;
    if (r.attrs?.fontStyle === 'italic') t = `<em>${t}</em>`;
    if ((r.attrs?.fontWeight ?? 400) >= 600) t = `<strong>${t}</strong>`;
    return t;
  }).join('');
}

/** Story → Writer blocks (lossy: only what TelaBlock can carry). Existing blocks keep their extra fields. */
export function toTelaBlocks(s: TextStory, previous: TelaBlock[] = []): TelaBlock[] {
  const prev = new Map(previous.map(b => [b.id, b]));
  return s.paragraphs.map(p => {
    const kind: TelaBlock['kind'] = p.styleId === 'h1' || p.styleId === 'title' ? 'h1' : p.styleId === 'h2' || p.styleId === 'h3' ? 'h2' : p.styleId === 'list' || p.styleId === 'list-number' || p.attrs?.list ? 'li' : 'p';
    return { ...(prev.get(p.id) ?? {}), id: p.id, kind, text: inlineHtml(p) } as TelaBlock;
  });
}

/** A Tela vector TEXT object → story (each "\n" line a paragraph, object props as paragraph-level attrs). */
export function fromVectorText(o: Partial<Pick<TelaVectorObject, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'textAlign' | 'letterSpacing' | 'lineHeight' | 'textTransform' | 'fill'>>): TextStory {
  const family = (o.fontFamily ?? 'Inter').replace(/var\(\s*--[\w-]+\s*,\s*([^)]+)\)/g, '$1').split(',')[0].replace(/["']/g, '').trim() || 'Inter';
  const char: CharAttrs = {
    fontFamily: family,
    fontSize: o.fontSize ?? 24,
    fontWeight: o.fontWeight ?? 400,
    fontStyle: o.fontStyle ?? 'normal',
    tracking: o.letterSpacing ? o.letterSpacing * 1000 : undefined,
    caps: o.textTransform === 'uppercase' ? 'all-caps' : o.textTransform === 'lowercase' ? 'lowercase' : undefined,
    color: o.fill && o.fill !== 'none' ? o.fill : undefined,
  };
  const para: ParaAttrs = { align: o.textAlign ?? 'left', leading: { kind: 'multiple', value: o.lineHeight ?? 1.22 }, hyphenation: { enabled: false } };
  let text = o.text ?? '';
  if (o.textTransform === 'capitalize') text = text.replace(/\b\p{L}/gu, c => c.toUpperCase());
  return { id: newId('s'), paragraphs: text.split('\n').map(line => ({ id: newId(), attrs: para, runs: [{ text: line, attrs: char }] })) };
}

/** Flatten a story back into a vector TEXT object's string (paragraphs → "\n"). */
export function toVectorText(s: TextStory): string { return s.paragraphs.map(paragraphText).join('\n'); }

/** Resolved attrs of the first run — what a single-style surface (vector text) can keep. */
export function dominantAttrs(s: TextStory, sheet: StyleSheet) {
  const p = s.paragraphs[0];
  const rp = resolveParagraph(sheet, p);
  return { para: rp.para, char: resolveRun(sheet, rp.char, p.runs[0] ?? { text: '' }) };
}
