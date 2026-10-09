// EPUB 3 writer: reflowable (text-led) and fixed-layout (visual-led). Pure string/bytes building; the only I/O
// is the injected AssetResolver. Design rules (see docs/BOOK_TELA_UPGRADE.md):
//   * NO scripting, ever. Interactive extras are replaced by their declared fallback (still, table, note, QR/link).
//   * Text is always real text in the XHTML. Snapshots are images/inline SVG that ADD to, never replace, the text.
//   * Remote resources are never referenced: every image is embedded or replaced by its alt text.
//   * The result is checked with services/bookmeta/epub.ts (inspectEpub) plus our well-formedness pass; error
//     findings block the export.

import type { BookSource } from '../types';
import type { ExportModel, XChapter, XItem } from '../model';
import { inspectEpub } from '../../bookmeta/epub';
import { readZipEntries, readZipText } from '../../bookmeta/zip';
import type { Finding } from '../../bookmeta/types';
import { esc, slug } from '../html';
import { xmlWellFormed } from './xmlCheck';
import { zipBytes, utf8, type ZipInput } from './zip';
import {
  buildExportMeta, buildSidecar, colophonParagraphs, collectQr, defaultResolver, isFontLicenseSafe, MIME_EXT, newReport, PLAJAH_NS, recommendLayout,
  type ExportMeta, type ExportOptions, type ExportReport, type Sidecar,
} from './common';

export interface EpubResult {
  ok: boolean;
  bytes: Uint8Array;
  layout: 'REFLOW' | 'FIXED';
  report: ExportReport;
  /** inspectEpub() findings plus well-formedness findings. Any 'error' blocks the export (ok=false). */
  findings: Finding[];
  sidecar: Sidecar;
  fileName: string;
}

const XHTML_NS = 'xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"';
const ROLE_CODE: Record<string, string> = { author: 'aut', editor: 'edt', translator: 'trl', illustrator: 'ill', narrator: 'nrt', foreword: 'wpr', cover_designer: 'cov' };

const doc = (lang: string, title: string, head: string, body: string, bodyAttr = '') =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html ${XHTML_NS} lang="${esc(lang)}" xml:lang="${esc(lang)}">\n<head>\n<meta charset="utf-8"/>\n<title>${esc(title)}</title>\n${head}\n</head>\n<body${bodyAttr}>\n${body}\n</body>\n</html>\n`;

const modifiedStamp = (d: string) => d.slice(0, 19) + 'Z';

// ── CSS ──────────────────────────────────────────────────────────────────────

function reflowCss(fonts: { family: string; file: string; weight: number; style: string }[], dropCap: boolean): string {
  const ff = fonts.map(f => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};src:url("../fonts/${f.file}");}`).join('\n');
  const family = fonts.length ? `"${fonts[0].family}", serif` : 'serif';
  return `${ff}
html{-epub-hyphens:auto;hyphens:auto}
body{font-family:${family};line-height:1.5;margin:0;padding:0 .4em;orphans:2;widows:2}
h1,h2,h3,h4,h5,h6{font-family:${family};line-height:1.2;page-break-after:avoid;break-after:avoid}
h1{font-size:1.9em;margin:2.5em 0 1em;text-align:center}
h2{font-size:1.35em;margin:1.6em 0 .6em}
p{margin:0;text-indent:1.4em;text-align:justify}
h1+p,h2+p,h3+p,hr+p,blockquote+p,figure+p,.opener+p,p.first{text-indent:0}
${dropCap ? 'p.first::first-letter{float:left;font-size:3.1em;line-height:.85;padding:.04em .08em 0 0}' : ''}
blockquote{margin:1em 1.5em;font-style:italic}
blockquote p{text-indent:0;margin:.4em 0}
hr{border:0;text-align:center;margin:1.4em 0}
hr::after{content:"* * *";letter-spacing:.4em}
figure{margin:1.2em 0;text-align:center;page-break-inside:avoid;break-inside:avoid}
figure img{max-width:100%;height:auto}
figcaption{font-size:.85em;font-style:italic;margin-top:.3em}
figure.qr img{width:9em;height:9em}
aside.callout{border:1px solid currentColor;border-radius:.4em;padding:.6em .9em;margin:1em 0;font-size:.92em}
aside.callout p{text-indent:0}
table{border-collapse:collapse;margin:1em auto;font-size:.92em}
th,td{border:1px solid currentColor;padding:.25em .6em;text-align:left}
caption{font-style:italic;margin-bottom:.3em}
.choices ul{list-style:none;margin:.4em 0;padding:0}
.choices li{margin:.4em 0}
.notes{margin-top:2em;font-size:.9em;border-top:1px solid currentColor}
.notes p{text-indent:0}
a.noteref{font-size:.75em;vertical-align:super;text-decoration:none}
.cover{text-align:center;margin:0;padding:0}
.cover img{max-width:100%;max-height:100vh;height:auto}
.title-page{text-align:center;margin-top:25%}
.title-page h1{margin:0 0 .3em}
.title-page .sub{font-style:italic}
.opener{margin:0 0 1.5em}
.opener img{width:100%;height:auto}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
}

// ── asset registry ───────────────────────────────────────────────────────────

class Assets {
  private byUrl = new Map<string, { path: string; mime: string } | null>();
  readonly files: { path: string; mime: string; bytes: Uint8Array; id: string }[] = [];
  readonly missing: string[] = [];
  constructor(private resolve: (u: string) => Promise<{ bytes: Uint8Array; mime: string } | null>) {}
  async add(url: string): Promise<{ path: string; mime: string } | null> {
    if (this.byUrl.has(url)) return this.byUrl.get(url)!;
    const r = await this.resolve(url).catch(() => null);
    if (!r || !MIME_EXT[r.mime]) { this.byUrl.set(url, null); this.missing.push(url.startsWith('data:') ? 'inline image' : url); return null; }
    const path = `images/img-${String(this.files.length + 1).padStart(4, '0')}.${MIME_EXT[r.mime]}`;
    this.files.push({ path, mime: r.mime, bytes: r.bytes, id: `img${this.files.length + 1}` });
    const v = { path, mime: r.mime }; this.byUrl.set(url, v); return v;
  }
  addRaw(path: string, mime: string, bytes: Uint8Array, id: string) { this.files.push({ path, mime, bytes, id }); return { path, mime }; }
}

// ── item rendering ───────────────────────────────────────────────────────────

interface Ctx {
  assets: Assets; qr: Map<string, string>; chapterFile: Map<string, string>;
  lang: string; qrFiles: Map<string, string>;
}

const blockTag = (k: XItem & { t: 'block' }): { open: string; close: string } => {
  switch (k.kind) {
    case 'h1': case 'h2': return { open: '<h2>', close: '</h2>' };
    case 'h3': case 'h4': case 'h5': case 'h6': return { open: `<${k.kind}>`, close: `</${k.kind}>` };
    default: return { open: '<p>', close: '</p>' };
  }
};

/** Chapter-level note order: numbers by first appearance of the marker. */
function noteOrder(ch: XChapter): Map<string, number> {
  const order = new Map<string, number>();
  for (const it of ch.items) if (it.t === 'block') for (const m of it.html.matchAll(/\[\[n:([\w-]+)\]\]/g)) if (!order.has(m[1])) order.set(m[1], order.size + 1);
  return order;
}

const withNotes = (html: string, order: Map<string, number>, cIdx: number) =>
  html.replace(/\[\[n:([\w-]+)\]\]/g, (_m, key: string) => {
    const n = order.get(key); if (!n) return '';
    return `<a id="r${cIdx}-${n}" class="noteref" epub:type="noteref" role="doc-noteref" href="#fn${cIdx}-${n}">${n}</a>`;
  });

async function renderItems(ch: XChapter, cIdx: number, ctx: Ctx, report: ExportReport, imgBase = '../'): Promise<string> {
  const order = noteOrder(ch);
  const out: string[] = [];
  let list: string | null = null; let listItems: string[] = []; let quote: string[] = [];
  let firstPara = ch.dropCap !== 'none';
  const flushList = () => { if (list) { out.push(`<${list}>${listItems.join('')}</${list}>`); list = null; listItems = []; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.join('')}</blockquote>`); quote = []; } };
  for (const it of ch.items) {
    if (it.t === 'block') {
      if (it.kind === 'li' || it.kind === 'oli') {
        flushQuote();
        const tag = it.kind === 'oli' ? 'ol' : 'ul';
        if (list && list !== tag) flushList();
        list = tag; listItems.push(`<li>${withNotes(it.html, order, cIdx)}</li>`); continue;
      }
      flushList();
      if (it.kind === 'quote') { quote.push(`<p>${withNotes(it.html, order, cIdx)}</p>`); continue; }
      flushQuote();
      if (it.kind === 'hr') { out.push('<hr/>'); continue; }
      const t = blockTag(it);
      const cls = t.open === '<p>' && firstPara ? ' class="first"' : '';
      if (t.open === '<p>') firstPara = false;
      out.push(`${t.open.replace('>', `${cls}>`)}${withNotes(it.html, order, cIdx)}${t.close}`);
      continue;
    }
    flushList(); flushQuote();
    if (it.t === 'figure') {
      const a = await ctx.assets.add(it.src);
      if (a) out.push(`<figure><img src="${imgBase}${a.path}" alt="${esc(it.alt)}"/>${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ''}</figure>`);
      else out.push(`<aside class="callout"><p><em>${esc(it.alt || it.caption || 'Image not available in this file.')}</em></p></aside>`);
    } else if (it.t === 'table') {
      out.push(`<table>${it.caption ? `<caption>${esc(it.caption)}</caption>` : ''}<thead><tr>${it.header.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${it.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (it.t === 'qr') {
      const p = ctx.qrFiles.get(it.url);
      out.push(`<figure class="qr">${p ? `<img src="${imgBase}${p}" alt="${esc(`QR code that opens: ${it.label}`)}"/>` : ''}<figcaption><a href="${esc(it.url)}">${esc(it.label)}</a></figcaption></figure>`);
    } else if (it.t === 'callout') {
      out.push(`<aside class="callout"><p>${it.html}</p></aside>`);
    } else if (it.t === 'links') {
      out.push(`<div class="choices">${it.prompt ? `<p><strong>${esc(it.prompt)}</strong></p>` : ''}<ul>${it.items.map(x => { const f = ctx.chapterFile.get(x.chapterId); return `<li>${f ? `<a href="${f}">${esc(x.label)}</a>` : esc(x.label)}</li>`; }).join('')}</ul></div>`);
    }
  }
  flushList(); flushQuote();
  if (ch.notes.length && order.size) {
    const byKey = new Map(ch.notes.map(n => [n.key, n]));
    const lis = [...order.entries()].map(([key, n]) => {
      const note = byKey.get(key);
      return `<li id="fn${cIdx}-${n}" epub:type="endnote" role="doc-endnote"><p>${note?.label && note.kind === 'commentary' ? `<strong>${esc(note.label)}.</strong> ` : ''}${note?.html ?? ''} <a href="#r${cIdx}-${n}" epub:type="backlink" role="doc-backlink">↩</a></p></li>`;
    }).join('');
    out.push(`<section class="notes" epub:type="endnotes" role="doc-endnotes"><h2>Notes</h2><ol>${lis}</ol></section>`);
  }
  void report;
  return out.join('\n');
}

// ── fixed layout pages ───────────────────────────────────────────────────────

interface FxPage { kind: 'opener' | 'figure' | 'text'; chapter: XChapter; items: XItem[]; first?: boolean }

function paginateFixed(ch: XChapter, W: number, H: number, fs: number): FxPage[] {
  const margin = 80;
  const lines = Math.max(6, Math.floor((H - margin * 2) / (fs * 1.5)));
  const cpl = Math.max(20, Math.floor((W - margin * 2) / (fs * 0.5)));
  const cap = lines * cpl * 0.78;
  const pages: FxPage[] = [{ kind: 'opener', chapter: ch, items: [], first: true }];
  let cur: XItem[] = []; let used = 0;
  const flush = () => { if (cur.length) pages.push({ kind: 'text', chapter: ch, items: cur }); cur = []; used = 0; };
  for (const it of ch.items) {
    if (it.t === 'figure') { flush(); pages.push({ kind: 'figure', chapter: ch, items: [it] }); continue; }
    const cost = it.t === 'block' ? Math.ceil(it.html.replace(/<[^>]+>/g, '').length / cpl) * cpl + cpl * 0.6
      : it.t === 'table' ? cpl * (it.rows.length + 3) : it.t === 'qr' ? cpl * 9 : it.t === 'links' ? cpl * (it.items.length + 2) : cpl * 4;
    if (used + cost > cap && cur.length) flush();
    cur.push(it); used += cost;
  }
  flush();
  return pages;
}

// ── main ─────────────────────────────────────────────────────────────────────

export async function buildEpub(book: BookSource, model: ExportModel, opts: ExportOptions = {}): Promise<EpubResult> {
  const reco = recommendLayout(model);
  const layout = opts.layout && opts.layout !== 'AUTO' ? opts.layout : reco.layout;
  const fixed = layout === 'FIXED';
  const now = opts.now ?? new Date(model.exportedAt);
  const meta = buildExportMeta(book, { now, publisher: opts.publisher });
  const report = newReport(fixed ? 'EPUB_FIXED' : 'EPUB_REFLOW', model);
  const assets = new Assets(opts.resolveAsset ?? defaultResolver);
  const lang = meta.language;

  // QR codes -> svg files
  const qrSvgs = await collectQr(model);
  const qrFiles = new Map<string, string>(); let qn = 0;
  for (const [url, svg] of qrSvgs) { const a = assets.addRaw(`images/qr-${++qn}.svg`, 'image/svg+xml', utf8(svg), `qr${qn}`); qrFiles.set(url, a.path); }

  // fonts (only licence-safe ones)
  const fonts: { family: string; file: string; weight: number; style: string; bytes: Uint8Array; mime: string }[] = [];
  for (const f of opts.fonts ?? []) {
    if (!isFontLicenseSafe(f.license)) { report.warnings.push(`Font "${f.family}" was not embedded: licence "${f.license}" is not on the embed-safe list.`); continue; }
    fonts.push({ family: f.family, file: `${slug(f.family)}-${f.weight}${f.style === 'italic' ? 'i' : ''}.${f.ext}`, weight: f.weight, style: f.style, bytes: f.bytes, mime: f.ext === 'woff2' ? 'font/woff2' : f.ext === 'woff' ? 'font/woff' : f.ext === 'otf' ? 'font/otf' : 'font/ttf' });
  }

  // chapters in spine order
  const chapters = model.chapters.filter(c => c.kind !== 'toc');
  const chapterFile = new Map<string, string>();
  chapters.forEach((c, i) => chapterFile.set(c.id, `ch${String(i + 1).padStart(3, '0')}.xhtml`));
  const ctx: Ctx = { assets, qr: qrSvgs, chapterFile, lang, qrFiles };

  // cover
  let coverPath: string | undefined; let coverMime = 'image/jpeg';
  if (model.coverUrl) { const a = await assets.add(model.coverUrl); if (a) { coverPath = a.path; coverMime = a.mime; } }
  if (!coverPath) {
    const svg = generatedCover(meta);
    coverPath = assets.addRaw('images/cover.svg', 'image/svg+xml', utf8(svg), 'cover').path; coverMime = 'image/svg+xml';
    report.warnings.push('No cover image could be loaded, so a simple typographic cover was generated. Upload a real cover before selling.');
  }
  const coverItemId = assets.files.find(f => f.path === coverPath)!.id;

  const textFiles: { id: string; href: string; title: string; xhtml: string; props: string; spine: boolean; linear?: boolean; nav?: boolean }[] = [];
  const W = opts.fixedSize?.width ?? (model.visualLed ? 1024 : 800); const H = opts.fixedSize?.height ?? (model.visualLed ? 768 : 1200);
  const FS = 26;
  const css = reflowCss(fonts, !fixed && chapters.some(c => c.dropCap !== 'none'));
  const fxCss = `html,body{margin:0;padding:0}body{font-family:serif;font-size:${FS}px;line-height:1.5;position:relative;overflow:hidden;width:${W}px;height:${H}px}
.pg{position:absolute;left:80px;right:80px;top:80px;bottom:80px;overflow:hidden}
.pg p{margin:0 0 .6em;text-indent:0}.pg h2,.pg h3{margin:.4em 0}
.full{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
.imgwrap{position:absolute;left:40px;right:40px;top:40px;bottom:${H > W ? 220 : 150}px;text-align:center}
.imgwrap img{max-width:100%;max-height:100%;object-fit:contain}
.cap{position:absolute;left:80px;right:80px;bottom:50px;text-align:center;font-style:italic;font-size:22px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
aside.callout{border:1px solid currentColor;padding:.4em .7em;margin:.6em 0;font-size:.9em}
table{border-collapse:collapse;font-size:.85em}th,td{border:1px solid currentColor;padding:.15em .5em}
figure.qr img{width:150px;height:150px}.notes{font-size:.8em}
`;
  const head = (cssHref: string, viewport = '') => `${viewport}<link rel="stylesheet" type="text/css" href="${cssHref}"/>`;
  const vp = `<meta name="viewport" content="width=${W}, height=${H}"/>\n`;

  // cover page
  textFiles.push({
    id: 'cover', href: 'cover.xhtml', title: 'Cover', props: fixed ? 'svg' : '', spine: true,
    xhtml: fixed
      ? doc(lang, 'Cover', head('css/fixed.css', vp), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><title>${esc(model.coverAlt || `Cover of ${meta.title}`)}</title><image width="${W}" height="${H}" xlink:href="${coverPath}"/></svg>`)
      : doc(lang, 'Cover', head('css/book.css'), `<div class="cover"><img src="${coverPath}" alt="${esc(model.coverAlt || `Cover of ${meta.title}`)}"/></div>`),
  });

  // title page
  const titleBody = `<section class="title-page" epub:type="titlepage"><h1>${esc(meta.title)}</h1>${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}${meta.authors.length ? `<p class="by">${esc(meta.authors.join(', '))}</p>` : ''}</section>`;
  textFiles.push({ id: 'titlepage', href: 'titlepage.xhtml', title: 'Title page', props: '', spine: true, xhtml: doc(lang, meta.title, head(fixed ? 'css/fixed.css' : 'css/book.css', fixed ? vp : ''), titleBody) });

  // chapters
  let noteBlocks = 0;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]; const href = chapterFile.get(ch.id)!;
    if (!fixed) {
      let opener = '';
      if (ch.opener) {
        const a = await assets.add(ch.opener.src);
        if (a) opener = `<div class="opener"><img src="${a.path}" alt="${esc(ch.opener.alt)}"/></div>`;
      }
      const body = await renderItems(ch, i + 1, ctx, report, '');
      noteBlocks += ch.notes.length;
      textFiles.push({ id: `c${i + 1}`, href, title: ch.title, props: '', spine: true,
        xhtml: doc(lang, ch.title, head('css/book.css'), `<section epub:type="${ch.kind === 'back' ? 'backmatter' : ch.kind === 'front' ? 'frontmatter' : 'chapter'}" id="ch${i + 1}">\n${opener}<h1>${esc(ch.title)}</h1>\n${body}\n</section>`) });
    } else {
      const pages = paginateFixed(ch, W, H, FS);
      for (let p = 0; p < pages.length; p++) {
        const pg = pages[p]; const pHref = p === 0 ? href : href.replace('.xhtml', `-p${p + 1}.xhtml`);
        let body = '';
        if (pg.kind === 'opener') {
          let svg = ch.openerSvg?.svg;
          const il = ch.opener ? await assets.add(ch.opener.src) : null;
          const svgHadIllustration = !!(svg && ch.opener && svg.includes(ch.opener.src.slice(0, 200)));
          if (svg) svg = await embedSvgImages(svg, assets);
          body = `<h1 class="sr" id="ch${i + 1}">${esc(ch.title)}</h1>`;
          if (svg) body += `<div class="full" role="img" aria-label="${esc(`Chapter opener: ${ch.title}`)}">${svg.replace(/^<svg([^>]*)>/, (_m, a: string) => `<svg${a.replace(/\s(width|height|preserveAspectRatio)="[^"]*"/g, '')} width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">`)}</div>`;
          else body += `<div class="pg"><h1>${esc(ch.title)}</h1>${il ? `<img src="${il.path}" alt="${esc(ch.opener!.alt)}" style="max-width:100%"/>` : ''}</div>`;
          if (svg && il && !svgHadIllustration) body += `<div class="imgwrap" style="top:auto;bottom:${H > W ? 180 : 100}px;height:${Math.round(H * 0.4)}px"><img src="${il.path}" alt="${esc(ch.opener!.alt)}"/></div>`;
        } else if (pg.kind === 'figure') {
          const f = pg.items[0] as Extract<XItem, { t: 'figure' }>;
          const a = await assets.add(f.src);
          body = a ? `<div class="imgwrap"><img src="${a.path}" alt="${esc(f.alt)}"/></div>${f.caption ? `<p class="cap">${esc(f.caption)}</p>` : ''}` : `<div class="pg"><p><em>${esc(f.alt || 'Image not available in this file.')}</em></p></div>`;
        } else {
          const sub: XChapter = { ...ch, items: pg.items, dropCap: 'none', notes: ch.notes };
          const inner = await renderItems(sub, i + 1, ctx, report, '');
          noteBlocks += 0;
          body = `<div class="pg">${inner}</div>`;
        }
        textFiles.push({ id: `c${i + 1}p${p + 1}`, href: pHref, title: p === 0 ? ch.title : `${ch.title} (page ${p + 1})`, props: pg.kind === 'opener' && ch.openerSvg ? 'svg' : '', spine: true,
          xhtml: doc(lang, ch.title, head('css/fixed.css', vp), body) });
      }
    }
  }
  void noteBlocks;

  // glossary back matter (reflow + fixed)
  if (model.glossary.length) {
    const items = model.glossary.slice().sort((a, b) => a.term.localeCompare(b.term)).map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}</dd>`).join('');
    textFiles.push({ id: 'glossary', href: 'glossary.xhtml', title: 'Glossary', props: '', spine: true,
      xhtml: doc(lang, 'Glossary', head(fixed ? 'css/fixed.css' : 'css/book.css', fixed ? vp : ''), `<section epub:type="glossary" role="doc-glossary"><h1>Glossary</h1><dl>${items}</dl></section>`) });
  }

  // colophon
  if (opts.includeColophon !== false) {
    const paras = colophonParagraphs(model, meta, report.summary).map(p => `<p>${esc(p)}</p>`).join('');
    textFiles.push({ id: 'colophon', href: 'colophon.xhtml', title: 'Exported from Plajah', props: '', spine: true,
      xhtml: doc(lang, 'Exported from Plajah', head(fixed ? 'css/fixed.css' : 'css/book.css', fixed ? vp : ''), `<section epub:type="colophon" role="doc-colophon"><h1>Exported from Plajah</h1>${paras}<p><a href="${esc(model.platformUrl)}">${esc(model.platformUrl)}</a></p></section>`) });
  }

  // nav
  const tocEntries = textFiles.filter(t => t.id !== 'cover' && (t.id === 'titlepage' || /^c\d+(p1)?$/.test(t.id) || t.id === 'glossary' || t.id === 'colophon'));
  const nav = doc(lang, 'Contents', head(fixed ? 'css/fixed.css' : 'css/book.css', fixed ? vp : ''),
    `<nav epub:type="toc" id="toc" role="doc-toc"><h1>Contents</h1><ol>${tocEntries.map(t => `<li><a href="${t.href}">${esc(t.title)}</a></li>`).join('')}</ol></nav>\n` +
    `<nav epub:type="landmarks" hidden="hidden"><h2>Guide</h2><ol><li><a epub:type="cover" href="cover.xhtml">Cover</a></li><li><a epub:type="bodymatter" href="${tocEntries.find(t => /^c1/.test(t.id))?.href ?? 'titlepage.xhtml'}">Start of book</a></li></ol></nav>`);
  textFiles.push({ id: 'nav', href: 'nav.xhtml', title: 'Contents', props: 'nav', spine: false, xhtml: nav });

  // a11y metadata (only claims what this exporter really produces)
  const imgCount = assets.files.filter(f => !f.id.startsWith('qr') && f.id !== 'cover').length;
  const features = ['structuralNavigation', 'tableOfContents', 'readingOrder', 'ARIA'];
  if (!fixed) features.push('displayTransformability');
  if (imgCount > 0) features.push('alternativeText');
  const summary = meta.a11ySummary || (fixed
    ? 'Fixed-layout edition. All text is real text, not images. Pictures have alternative text. Pages are not reflowable. Interactive online features are replaced by stills, tables, notes or links.'
    : 'Reflowable edition: text can be resized and read by screen readers. Pictures have alternative text. Interactive online features are replaced by stills, tables, notes or links.');

  // OPF
  const lines: string[] = [];
  lines.push(`<dc:identifier id="pub-id">${esc(meta.identifier)}</dc:identifier>`);
  lines.push(`<dc:title id="title">${esc(meta.title)}</dc:title>`);
  if (meta.subtitle) { lines.push(`<dc:title id="subtitle">${esc(meta.subtitle)}</dc:title>`); lines.push(`<meta refines="#subtitle" property="title-type">subtitle</meta>`); lines.push(`<meta refines="#title" property="title-type">main</meta>`); }
  lines.push(`<dc:language>${esc(lang)}</dc:language>`);
  meta.authors.forEach((a, i) => { lines.push(`<dc:creator id="creator${i + 1}">${esc(a)}</dc:creator>`, `<meta refines="#creator${i + 1}" property="role" scheme="marc:relators">aut</meta>`); });
  meta.contributors.filter(c => c.role !== 'author' && c.name.trim()).forEach((c, i) => { lines.push(`<dc:contributor id="contrib${i + 1}">${esc(c.name)}</dc:contributor>`, `<meta refines="#contrib${i + 1}" property="role" scheme="marc:relators">${ROLE_CODE[c.role] || 'ctb'}</meta>`); });
  if (meta.publisher) lines.push(`<dc:publisher>${esc(meta.publisher)}</dc:publisher>`);
  lines.push(`<dc:date>${esc(meta.date)}</dc:date>`);
  if (meta.description) lines.push(`<dc:description>${esc(meta.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}</dc:description>`);
  for (const k of meta.keywords) if (k.trim()) lines.push(`<dc:subject>${esc(k)}</dc:subject>`);
  if (meta.rights) lines.push(`<dc:rights>${esc(meta.rights)}</dc:rights>`);
  if (meta.series) { lines.push(`<meta property="belongs-to-collection" id="series">${esc(meta.series.name)}</meta>`, `<meta refines="#series" property="collection-type">series</meta>`); if (meta.series.number) lines.push(`<meta refines="#series" property="group-position">${esc(meta.series.number)}</meta>`); }
  lines.push(`<meta property="dcterms:modified">${modifiedStamp(now.toISOString())}</meta>`);
  lines.push(`<meta property="schema:accessMode">textual</meta>`);
  if (imgCount > 0) lines.push(`<meta property="schema:accessMode">visual</meta>`);
  lines.push(`<meta property="schema:accessModeSufficient">textual</meta>`);
  for (const f of features) lines.push(`<meta property="schema:accessibilityFeature">${f}</meta>`);
  for (const h of ['noFlashingHazard', 'noMotionSimulationHazard', 'noSoundHazard']) lines.push(`<meta property="schema:accessibilityHazard">${h}</meta>`);
  lines.push(`<meta property="schema:accessibilitySummary">${esc(summary)}</meta>`);
  lines.push(`<meta property="plajah:exportedFrom">${esc(model.platformUrl)}</meta>`);
  lines.push(`<meta property="plajah:drm">none</meta>`);
  if (opts.watermarkTag) lines.push(`<meta property="plajah:watermark">${esc(opts.watermarkTag)}</meta>`);
  if (fixed) lines.push(`<meta property="rendition:layout">pre-paginated</meta>`, `<meta property="rendition:orientation">auto</meta>`, `<meta property="rendition:spread">none</meta>`);

  const manifest: string[] = [];
  for (const t of textFiles) manifest.push(`<item id="${t.id}" href="${t.href}" media-type="application/xhtml+xml"${[t.props].filter(Boolean).length ? ` properties="${t.props}"` : ''}/>`);
  manifest.push(`<item id="css-book" href="css/book.css" media-type="text/css"/>`);
  if (fixed) manifest.push(`<item id="css-fixed" href="css/fixed.css" media-type="text/css"/>`);
  for (const f of assets.files) manifest.push(`<item id="${f.id}" href="${f.path}" media-type="${f.mime}"${f.path === coverPath ? ' properties="cover-image"' : ''}/>`);
  fonts.forEach((f, i) => manifest.push(`<item id="font${i + 1}" href="fonts/${f.file}" media-type="${f.mime}"/>`));
  const spine = textFiles.filter(t => t.spine).map(t => `<itemref idref="${t.id}"/>`).join('');
  const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${esc(lang)}" prefix="plajah: ${PLAJAH_NS}">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n${lines.join('\n')}\n</metadata>\n<manifest>\n${manifest.join('\n')}\n</manifest>\n<spine>${spine}</spine>\n</package>\n`;
  void coverItemId; void coverMime;

  const entries: ZipInput[] = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n` },
    { name: 'OEBPS/package.opf', data: opf },
    { name: 'OEBPS/css/book.css', data: css },
    ...(fixed ? [{ name: 'OEBPS/css/fixed.css', data: fxCss }] : []),
    ...textFiles.map(t => ({ name: `OEBPS/${t.href}`, data: t.xhtml })),
    ...assets.files.map(f => ({ name: `OEBPS/${f.path}`, data: f.bytes, store: /jpeg|png|gif|webp/.test(f.mime) })),
    ...fonts.map(f => ({ name: `OEBPS/fonts/${f.file}`, data: f.bytes, store: true })),
  ];
  const bytes = zipBytes(entries);

  report.missingAssets = assets.missing;
  if (assets.missing.length) report.warnings.push(`${assets.missing.length} image(s) could not be loaded and were replaced by their alt text.`);

  // validate: bookmeta's epubcheck-style validator + well-formedness of every XML part
  const insp = await inspectEpub(bytes);
  const findings: Finding[] = [...insp.findings];
  for (const e of readZipEntries(bytes)) {
    if (!/\.(xhtml|opf|svg|xml)$/.test(e.name)) continue;
    const probs = xmlWellFormed(await readZipText(bytes, e));
    for (const p of probs) findings.push({ code: 'export.xml_malformed', severity: 'error', area: 'epub', message: `${e.name}: ${p.message}`, fix: 'This is a Plajah export bug. Report it with the book id.' });
  }
  const sidecar = buildSidecar(book, model, meta, report.format, opts, features);
  const ok = !findings.some(f => f.severity === 'error');
  return { ok, bytes, layout, report, findings, sidecar, fileName: `${slug(meta.title, 'book')}.epub` };
}

/** Inline-SVG snapshots may reference remote images: embed them, or drop the reference (never leave a remote URL). */
async function embedSvgImages(svg: string, assets: Assets): Promise<string> {
  const refs = [...svg.matchAll(/<image[^>]*?href="([^"]+)"[^>]*?\/>/g)];
  let out = svg;
  for (const m of refs) {
    const url = m[1].replace(/&amp;/g, '&');
    const a = await assets.add(url);
    out = a ? out.split(m[0]).join(m[0].replace(m[1], a.path)) : out.split(m[0]).join('');
  }
  return out;
}

function generatedCover(meta: ExportMeta): string {
  const t = esc(meta.title); const a = esc(meta.authors.join(', '));
  const lines: string[] = []; let cur = '';
  for (const w of meta.title.split(/\s+/)) { if ((cur + ' ' + w).trim().length > 18) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  const tspans = lines.slice(0, 5).map((l, i) => `<tspan x="400" dy="${i ? 84 : 0}">${esc(l)}</tspan>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200"><title>Cover of ${t}</title><rect width="800" height="1200" fill="#1c1630"/><rect x="40" y="40" width="720" height="1120" fill="none" stroke="#c9a15b" stroke-width="3"/><text x="400" y="420" text-anchor="middle" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#f6efe3">${tspans}</text><text x="400" y="1060" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#c9a15b">${a}</text></svg>`;
}
