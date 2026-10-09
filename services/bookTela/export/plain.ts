// Plain, portable exports: Markdown (+images, zipped) and a self-contained HTML bundle (index.html + images, zipped).
// Both are DRM-free, contain every word of the book as real text, and carry the sidecar JSON and the removable
// "Exported from Plajah" section.

import type { BookSource } from '../types';
import type { ExportModel, XChapter, XItem } from '../model';
import { esc, slug, stripTags, unesc } from '../html';
import { buildExportMeta, buildSidecar, colophonParagraphs, defaultResolver, MIME_EXT, newReport, type ExportOptions, type ExportReport, type Sidecar } from './common';
import { utf8, zipBytes, type ZipInput } from './zip';

export interface PlainResult { ok: boolean; bytes: Uint8Array; report: ExportReport; sidecar: Sidecar; fileName: string; text: string }

async function collectImages(model: ExportModel, opts: ExportOptions) {
  const resolve = opts.resolveAsset ?? defaultResolver;
  const files = new Map<string, { path: string; bytes: Uint8Array }>(); const missing: string[] = [];
  const add = async (url?: string): Promise<string | null> => {
    if (!url) return null;
    if (files.has(url)) return files.get(url)!.path;
    const r = await resolve(url).catch(() => null);
    if (!r || !MIME_EXT[r.mime]) { missing.push(url.startsWith('data:') ? 'inline image' : url); return null; }
    const path = `images/img-${String(files.size + 1).padStart(4, '0')}.${MIME_EXT[r.mime]}`; files.set(url, { path, bytes: r.bytes }); return path;
  };
  const map = new Map<string, string | null>();
  if (model.coverUrl) map.set(model.coverUrl, await add(model.coverUrl));
  for (const c of model.chapters) {
    if (c.opener) map.set(c.opener.src, await add(c.opener.src));
    for (const it of c.items) if (it.t === 'figure') map.set(it.src, await add(it.src));
  }
  return { files, map, missing };
}

const anchor = (c: XChapter, i: number) => `ch-${i + 1}-${slug(c.title, 'chapter')}`;

// ── Markdown ─────────────────────────────────────────────────────────────────

const mdInline = (html: string): string => unesc(
  html.replace(/<br\s*\/?>/g, '  \n').replace(/<\/?(strong|b)>/g, '**').replace(/<\/?(em|i)>/g, '*').replace(/<\/?code>/g, '`').replace(/<sup>([^<]*)<\/sup>/g, '^$1^').replace(/<sub>([^<]*)<\/sub>/g, '~$1~').replace(/<[^>]+>/g, ''),
);
const mdEscapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export async function buildMarkdown(book: BookSource, model: ExportModel, opts: ExportOptions = {}): Promise<PlainResult> {
  const meta = buildExportMeta(book, { now: opts.now ?? new Date(model.exportedAt), publisher: opts.publisher });
  const report = newReport('MARKDOWN', model);
  const { files, map, missing } = await collectImages(model, opts);
  const out: string[] = [];
  const yq = (s: string) => JSON.stringify(s);
  out.push('---', `title: ${yq(meta.title)}`, ...(meta.subtitle ? [`subtitle: ${yq(meta.subtitle)}`] : []), `author: ${yq(meta.authors.join(', '))}`, `language: ${meta.language}`, `identifier: ${yq(meta.identifier)}`, `date: ${meta.date}`,
    ...(meta.rights ? [`rights: ${yq(meta.rights)}`] : []), `exported-from: ${yq(model.platformUrl)}`, 'drm: none', ...(opts.watermarkTag ? [`watermark: ${yq(opts.watermarkTag)}`] : []), '---', '');
  out.push(`# ${mdInline(meta.title)}`, '');
  if (meta.subtitle) out.push(`*${mdInline(meta.subtitle)}*`, '');
  if (meta.authors.length) out.push(`**${meta.authors.join(', ')}**`, '');
  const cover = model.coverUrl ? map.get(model.coverUrl) : null;
  if (cover) out.push(`![${(model.coverAlt || `Cover of ${meta.title}`).replace(/[\[\]]/g, '')}](${cover})`, '');
  out.push('## Contents', '', ...model.chapters.filter(c => c.kind !== 'toc').map((c, i) => `- [${mdInline(c.title)}](#${anchor(c, i)})`), '');
  const anchors = new Map(model.chapters.map((c, i) => [c.id, anchor(c, i)]));
  model.chapters.filter(c => c.kind !== 'toc').forEach((c, ci) => {
    out.push(`<a id="${anchor(c, ci)}"></a>`, '', `## ${mdInline(c.title)}`, '');
    if (c.opener) { const p = map.get(c.opener.src); if (p) out.push(`![${c.opener.alt.replace(/[\[\]]/g, '')}](${p})`, ''); }
    const used: string[] = [];
    let ol = 0; let prev: XItem | null = null;
    for (const it of c.items) {
      if (it.t === 'block') {
        const text = mdInline(it.html.replace(/\[\[n:([\w-]+)\]\]/g, (_m, k: string) => { if (!used.includes(k)) used.push(k); return `[^${ci + 1}-${used.indexOf(k) + 1}]`; }));
        if (it.kind !== 'oli') ol = 0;
        switch (it.kind) {
          case 'h1': case 'h2': out.push(`### ${text}`, ''); break;
          case 'h3': out.push(`#### ${text}`, ''); break; case 'h4': case 'h5': case 'h6': out.push(`##### ${text}`, ''); break;
          case 'quote': out.push(`> ${text}`, ''); break;
          case 'li': out.push(`- ${text}`); break;
          case 'oli': out.push(`${++ol}. ${text}`); break;
          case 'hr': out.push('---', ''); break;
          default: out.push(text, '');
        }
        if ((it.kind === 'li' || it.kind === 'oli')) { /* list continues */ }
      } else {
        if (prev && prev.t === 'block' && (prev.kind === 'li' || prev.kind === 'oli')) out.push('');
        if (it.t === 'figure') { const p = map.get(it.src); out.push(p ? `![${it.alt.replace(/[\[\]]/g, '')}](${p}${it.caption ? ` "${it.caption.replace(/"/g, "'")}"` : ''})` : `*${it.alt || 'Image not available in this file.'}*`, ''); if (it.caption) out.push(`*${it.caption}*`, ''); }
        else if (it.t === 'table') { if (it.caption) out.push(`**${it.caption}**`, ''); out.push(`| ${it.header.map(mdEscapeCell).join(' | ')} |`, `| ${it.header.map(() => '---').join(' | ')} |`, ...it.rows.map(r => `| ${r.map(mdEscapeCell).join(' | ')} |`), ''); }
        else if (it.t === 'qr') out.push(`[${it.label}](${it.url})`, '');
        else if (it.t === 'callout') out.push(`> *${mdInline(it.html)}*`, '');
        else if (it.t === 'links') { if (it.prompt) out.push(`**${it.prompt}**`, ''); for (const x of it.items) out.push(`- [${x.label}](#${anchors.get(x.chapterId) ?? ''})`); out.push(''); }
      }
      prev = it;
    }
    if (used.length) { const by = new Map(c.notes.map(n => [n.key, n])); used.forEach((k, i) => out.push(`[^${ci + 1}-${i + 1}]: ${by.get(k)?.kind === 'commentary' ? '**Author commentary.** ' : ''}${mdInline(by.get(k)?.html ?? '')}`)); out.push(''); }
  });
  if (model.glossary.length) out.push('## Glossary', '', ...model.glossary.slice().sort((a, b) => a.term.localeCompare(b.term)).flatMap(g => [`**${g.term}**  `, `${g.definition}`, '']));
  if (opts.includeColophon !== false) out.push('## Exported from Plajah', '', ...colophonParagraphs(model, meta, report.summary).flatMap(p => [p, '']), `<${model.platformUrl}>`, '');
  const text = out.join('\n');
  const sidecar = buildSidecar(book, model, meta, 'MARKDOWN', opts);
  report.missingAssets = missing;
  if (missing.length) report.warnings.push(`${missing.length} image(s) could not be loaded and are shown as alt text.`);
  const entries: ZipInput[] = [
    { name: 'book.md', data: text }, { name: 'plajah-export.json', data: JSON.stringify(sidecar, null, 2) },
    ...[...files.values()].map(f => ({ name: f.path, data: f.bytes, store: true })),
  ];
  return { ok: true, bytes: zipBytes(entries), report, sidecar, fileName: `${slug(meta.title, 'book')}-markdown.zip`, text };
}

// ── HTML bundle ──────────────────────────────────────────────────────────────

const HTML_CSS = `:root{color-scheme:light dark}body{font:1.125rem/1.6 Georgia,serif;max-width:40rem;margin:0 auto;padding:1rem}
h1,h2,h3{line-height:1.2}p{margin:.8em 0}blockquote{margin:1em 1.5em;font-style:italic}figure{margin:1.2em 0;text-align:center}img{max-width:100%;height:auto}
figcaption{font-size:.9em;font-style:italic}aside.callout{border:1px solid currentColor;border-radius:.4em;padding:.6em .9em;margin:1em 0}
table{border-collapse:collapse}th,td{border:1px solid currentColor;padding:.25em .6em}.skip{position:absolute;left:-999px}.skip:focus{left:0}
.notes{font-size:.9em;border-top:1px solid currentColor;margin-top:2em}nav ol{padding-left:1.2em}@media print{.skip,nav.toc{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

export async function buildHtmlBundle(book: BookSource, model: ExportModel, opts: ExportOptions = {}): Promise<PlainResult> {
  const meta = buildExportMeta(book, { now: opts.now ?? new Date(model.exportedAt), publisher: opts.publisher });
  const report = newReport('HTML', model);
  const { files, map, missing } = await collectImages(model, opts);
  const chapters = model.chapters.filter(c => c.kind !== 'toc');
  const anchors = new Map(chapters.map((c, i) => [c.id, anchor(c, i)]));
  const body: string[] = [];
  const cover = model.coverUrl ? map.get(model.coverUrl) : null;
  body.push(`<header><h1>${esc(meta.title)}</h1>${meta.subtitle ? `<p><em>${esc(meta.subtitle)}</em></p>` : ''}${meta.authors.length ? `<p>${esc(meta.authors.join(', '))}</p>` : ''}${cover ? `<img src="${cover}" alt="${esc(model.coverAlt || `Cover of ${meta.title}`)}"/>` : ''}</header>`);
  body.push(`<nav class="toc" aria-label="Contents"><h2>Contents</h2><ol>${chapters.map((c, i) => `<li><a href="#${anchor(c, i)}">${esc(c.title)}</a></li>`).join('')}</ol></nav>`);
  chapters.forEach((c, ci) => {
    const sec: string[] = [`<h2>${esc(c.title)}</h2>`];
    if (c.opener) { const p = map.get(c.opener.src); if (p) sec.push(`<img src="${p}" alt="${esc(c.opener.alt)}"/>`); }
    const used: string[] = []; let list: string | null = null; let li: string[] = []; let q: string[] = [];
    const fl = () => { if (list) { sec.push(`<${list}>${li.join('')}</${list}>`); list = null; li = []; } };
    const fq = () => { if (q.length) { sec.push(`<blockquote>${q.join('')}</blockquote>`); q = []; } };
    const withNotes = (h: string) => h.replace(/\[\[n:([\w-]+)\]\]/g, (_m, k: string) => { if (!used.includes(k)) used.push(k); const n = used.indexOf(k) + 1; return `<sup><a id="r${ci + 1}-${n}" href="#fn${ci + 1}-${n}">${n}</a></sup>`; });
    for (const it of c.items) {
      if (it.t === 'block') {
        if (it.kind === 'li' || it.kind === 'oli') { fq(); const t = it.kind === 'oli' ? 'ol' : 'ul'; if (list && list !== t) fl(); list = t; li.push(`<li>${withNotes(it.html)}</li>`); continue; }
        fl();
        if (it.kind === 'quote') { q.push(`<p>${withNotes(it.html)}</p>`); continue; }
        fq();
        if (it.kind === 'hr') sec.push('<hr/>');
        else if (it.kind === 'h1' || it.kind === 'h2') sec.push(`<h3>${withNotes(it.html)}</h3>`);
        else if (/^h[3-6]$/.test(it.kind)) sec.push(`<h4>${withNotes(it.html)}</h4>`);
        else sec.push(`<p>${withNotes(it.html)}</p>`);
        continue;
      }
      fl(); fq();
      if (it.t === 'figure') { const p = map.get(it.src); sec.push(p ? `<figure><img src="${p}" alt="${esc(it.alt)}"/>${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ''}</figure>` : `<aside class="callout"><em>${esc(it.alt || 'Image not available in this file.')}</em></aside>`); }
      else if (it.t === 'table') sec.push(`<table>${it.caption ? `<caption>${esc(it.caption)}</caption>` : ''}<thead><tr>${it.header.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${it.rows.map(r => `<tr>${r.map((x, i) => i === 0 ? `<th scope="row">${esc(x)}</th>` : `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      else if (it.t === 'qr') sec.push(`<p><a href="${esc(it.url)}">${esc(it.label)}</a></p>`);
      else if (it.t === 'callout') sec.push(`<aside class="callout"><p>${it.html}</p></aside>`);
      else if (it.t === 'links') sec.push(`<div>${it.prompt ? `<p><strong>${esc(it.prompt)}</strong></p>` : ''}<ul>${it.items.map(x => `<li><a href="#${anchors.get(x.chapterId) ?? ''}">${esc(x.label)}</a></li>`).join('')}</ul></div>`);
    }
    fl(); fq();
    if (used.length) { const by = new Map(c.notes.map(n => [n.key, n])); sec.push(`<section class="notes"><h3>Notes</h3><ol>${used.map((k, i) => `<li id="fn${ci + 1}-${i + 1}">${by.get(k)?.kind === 'commentary' ? '<strong>Author commentary.</strong> ' : ''}${by.get(k)?.html ?? ''} <a href="#r${ci + 1}-${i + 1}" aria-label="Back to text">↩</a></li>`).join('')}</ol></section>`); }
    body.push(`<section id="${anchor(c, ci)}">${sec.join('\n')}</section>`);
  });
  if (model.glossary.length) body.push(`<section id="glossary"><h2>Glossary</h2><dl>${model.glossary.slice().sort((a, b) => a.term.localeCompare(b.term)).map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>`).join('')}</dl></section>`);
  if (opts.includeColophon !== false) body.push(`<section id="colophon"><h2>Exported from Plajah</h2>${colophonParagraphs(model, meta, report.summary).map(p => `<p>${esc(p)}</p>`).join('')}<p><a href="${esc(model.platformUrl)}">${esc(model.platformUrl)}</a></p></section>`);
  const html = `<!doctype html>\n<html lang="${esc(meta.language)}">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<title>${esc(meta.title)}</title>\n<meta name="generator" content="Plajah"/>\n${opts.watermarkTag ? `<meta name="plajah-watermark" content="${esc(opts.watermarkTag)}"/>\n` : ''}<meta name="plajah-drm" content="none"/>\n<style>${HTML_CSS}</style>\n</head>\n<body>\n<a class="skip" href="#main">Skip to the book</a>\n<main id="main">\n${body.join('\n')}\n</main>\n</body>\n</html>\n`;
  const sidecar = buildSidecar(book, model, meta, 'HTML', opts);
  report.missingAssets = missing;
  if (missing.length) report.warnings.push(`${missing.length} image(s) could not be loaded and are shown as alt text.`);
  const entries: ZipInput[] = [{ name: 'index.html', data: html }, { name: 'plajah-export.json', data: JSON.stringify(sidecar, null, 2) }, ...[...files.values()].map(f => ({ name: f.path, data: f.bytes, store: true }))];
  void utf8; void stripTags;
  return { ok: true, bytes: zipBytes(entries), report, sidecar, fileName: `${slug(meta.title, 'book')}-html.zip`, text: html };
}
