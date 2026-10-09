// Dependency-free EPUB reader + lightweight epubcheck-style validator.
//
// NOT epubcheck. It does not validate against the XHTML/OPF schemas, CSS, or SVG. It covers the structural
// failures that actually get ebooks bounced by KDP / Apple / Kobo / D2D / Ingram intake and that an author
// can fix in five minutes: container + OPF wiring, mimetype rules, identifiers, manifest <-> zip drift,
// spine integrity, nav doc, broken images, oversized images, embedded fonts, scripts, DRM encryption.
// Run the official epubcheck before shipping to a store with a strict pipeline.
//
// Works on a Uint8Array so it runs in the browser and under node --test.

import { readZipEntries, readZipData, readZipText, ZipError, type ZipEntry } from './zip';
import type { Finding, ManuscriptChapter } from './types';

export interface EpubMetadata {
  title?: string;
  creators: string[];
  language?: string;
  identifier?: string;
  description?: string;
  publisher?: string;
  subjects: string[];
  date?: string;
  modified?: string;
  rights?: string;
}

export interface EpubInspection {
  readable: boolean;
  version?: string;
  opfPath?: string;
  metadata: EpubMetadata;
  chapters: ManuscriptChapter[];
  images: { path: string; bytes: number }[];
  fonts: { path: string; bytes: number }[];
  coverPath?: string;
  hasNav: boolean;
  hasNcx: boolean;
  accessibility: {
    features: string[]; hazards: string[]; accessModes: string[]; conformsTo: string[]; summary?: string;
    imageCount: number; imagesWithAlt: number;
  };
  findings: Finding[];
}

// ── tiny XML helpers (regex-based; fine for well-formed package docs) ─────────────────────────────

interface Tag { attrs: string; inner: string }
const NS = '(?:[\\w.-]+:)?';

function tags(xml: string, name: string): Tag[] {
  const re = new RegExp(`<${NS}${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${NS}${name}\\s*>)`, 'g');
  const out: Tag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ attrs: m[1] || '', inner: m[2] || '' });
  return out;
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? (m[1] ?? m[2]) : undefined;
}

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } })
    .replace(/&([a-zA-Z]+);/g, (m, n) => XML_ENT[n] ?? m);
}

const textOf = (t: Tag) => decodeXml(t.inner.replace(/<[^>]+>/g, '')).trim();

function dirname(p: string): string { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
export function resolveHref(base: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0];
  let dec = clean;
  try { dec = decodeURIComponent(clean); } catch { /* keep raw */ }
  const parts = (dec.startsWith('/') ? dec.slice(1) : (dirname(base) ? dirname(base) + '/' : '') + dec).split('/');
  const out: string[] = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}

/** Reduce XHTML to the small HTML subset the reader + export understand. */
export function xhtmlToHtmlLite(xhtml: string): string {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
  const allowed = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'i', 'b', 'u', 'br', 'blockquote', 'ul', 'ol', 'li', 'hr', 'sup', 'sub']);
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg|nav)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>/g, (m, name: string, selfClose: string) => {
      const n = name.toLowerCase().replace(/^.*:/, '');
      if (!allowed.has(n)) return '';
      if (m.startsWith('</')) return `</${n}>`;
      return n === 'br' || n === 'hr' ? `<${n}/>` : (selfClose ? '' : `<${n}>`);
    })
    .replace(/\s+/g, ' ')
    .replace(/(<\/(?:p|h[1-6]|blockquote|li|ul|ol)>)\s*/g, '$1\n')
    .trim();
}

export function htmlToText(html: string): string {
  return decodeXml(html.replace(/<(?:br|hr)\s*\/?>/g, '\n').replace(/<\/(?:p|h[1-6]|blockquote|li)>/g, '\n\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export const countWords = (text: string): number => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

const F = (code: string, severity: Finding['severity'], message: string, fix?: string, mirrors?: string): Finding =>
  ({ code, severity, area: code.startsWith('a11y.') ? 'accessibility' : 'epub', message, fix, mirrors });

const FONT_RE = /\.(ttf|otf|woff2?)$/i;
const IMG_RE = /\.(jpe?g|png|gif|svg|webp)$/i;
const FRONT_RE = /(^|[/_-])(cover|titlepage|title|copyright|colophon|toc|nav|halftitle|dedication|epigraph)(\.|[/_-]|$)/i;
const BACK_RE = /(acknowledg|about[-_ ]?the[-_ ]?author|also[-_ ]?by|afterword|endnotes|bibliograph|appendix)/i;
const REMOTE_RE = /^[a-z][a-z0-9+.-]*:/i;

export async function inspectEpub(bytes: Uint8Array): Promise<EpubInspection> {
  const findings: Finding[] = [];
  const empty: EpubInspection = {
    readable: false, metadata: { creators: [], subjects: [] }, chapters: [], images: [], fonts: [],
    hasNav: false, hasNcx: false, findings,
    accessibility: { features: [], hazards: [], accessModes: [], conformsTo: [], imageCount: 0, imagesWithAlt: 0 },
  };

  let entries: ZipEntry[];
  try { entries = readZipEntries(bytes); } catch (e) {
    findings.push(F('epub.not_zip', 'error', e instanceof ZipError ? e.message : 'File is not a valid ZIP/EPUB archive.',
      'Re-export the EPUB from your writing tool (Vellum, Atticus, Calibre, Sigil, Scrivener, Pages).'));
    return empty;
  }
  const byName = new Map(entries.map(e => [e.name, e]));
  const read = async (path: string) => { const e = byName.get(path); return e ? readZipText(bytes, e) : null; };

  // 1. mimetype first, stored, exact content, no extra field.
  const first = [...entries].sort((a, b) => a.localOffset - b.localOffset)[0];
  const mt = byName.get('mimetype');
  if (!mt) findings.push(F('epub.mimetype_missing', 'error', 'The "mimetype" file is missing.', 'Add a file named mimetype containing exactly: application/epub+zip', 'epubcheck PKG-006; every store'));
  else {
    if (first?.name !== 'mimetype') findings.push(F('epub.mimetype_not_first', 'error', '"mimetype" must be the first file in the archive.', 'Re-zip with mimetype added first (most EPUB tools do this; a generic zip tool will not).', 'epubcheck PKG-006'));
    if (mt.method !== 0) findings.push(F('epub.mimetype_compressed', 'error', '"mimetype" must be stored uncompressed.', 'Re-zip with mimetype stored (no compression).', 'epubcheck PKG-005'));
    if (mt.localExtraLen > 0) findings.push(F('epub.mimetype_extra', 'warning', '"mimetype" has an extra field in its ZIP header.', 'Re-zip without extra attributes for mimetype.', 'epubcheck PKG-005'));
    const content = (await readZipText(bytes, mt)).trim();
    if (content !== 'application/epub+zip') findings.push(F('epub.mimetype_wrong', 'error', `"mimetype" contains "${content.slice(0, 40)}" instead of application/epub+zip.`, 'Replace its content with application/epub+zip.'));
  }

  // 2. encryption.xml — font obfuscation is fine; anything else is DRM.
  const enc = await read('META-INF/encryption.xml');
  if (enc) {
    const algos = tags(enc, 'EncryptionMethod').map(t => attr(t.attrs, 'Algorithm') || '');
    const drm = algos.filter(a => a && !/idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/i.test(a));
    if (drm.length) findings.push(F('epub.drm', 'error', 'This EPUB is DRM-encrypted.', 'Upload a DRM-free file. Plajah sells DRM-free by default and a locked file cannot be checked, previewed, or delivered to buyers.', 'Plajah buy-to-own'));
  }

  // 3. container.xml -> OPF
  const container = await read('META-INF/container.xml');
  if (!container) { findings.push(F('epub.container_missing', 'error', 'META-INF/container.xml is missing.', 'Add container.xml pointing at your .opf package file.', 'epubcheck RSC-002')); return { ...empty, readable: true }; }
  const rootfile = tags(container, 'rootfile')[0];
  const opfPath = rootfile ? attr(rootfile.attrs, 'full-path') : undefined;
  if (!opfPath) { findings.push(F('epub.rootfile_missing', 'error', 'container.xml has no <rootfile full-path="...">.', 'Point rootfile at your package (.opf) document.')); return { ...empty, readable: true }; }
  const opf = await read(opfPath);
  if (opf == null) { findings.push(F('epub.opf_missing', 'error', `The package file "${opfPath}" named in container.xml does not exist in the archive.`, 'Fix the path in container.xml or add the file.', 'epubcheck OPF-002')); return { ...empty, readable: true, opfPath }; }

  // 4. package metadata
  const pkg = tags(opf, 'package')[0];
  const version = pkg ? attr(pkg.attrs, 'version') : undefined;
  const uidRef = pkg ? attr(pkg.attrs, 'unique-identifier') : undefined;
  if (!version) findings.push(F('epub.version_missing', 'error', 'The <package> element has no version attribute.', 'Set version="3.0" (EPUB 3) on <package>.'));
  const isV3 = !!version && version.startsWith('3');
  if (version && !isV3 && !version.startsWith('2')) findings.push(F('epub.version_unknown', 'warning', `Unrecognized EPUB version "${version}".`));
  if (version && version.startsWith('2')) findings.push(F('epub.v2', 'warning', 'This is an EPUB 2 file. It will work, but EPUB 3 is the current standard and Apple Books / Kobo prefer it.', 'Re-export as EPUB 3 from your tool.'));

  const metaBlock = tags(opf, 'metadata')[0]?.inner ?? '';
  const dc = (n: string) => tags(metaBlock, n);
  const idTags = dc('identifier');
  const titleTags = dc('title').map(textOf).filter(Boolean);
  const langTags = dc('language').map(textOf).filter(Boolean);
  const metadata: EpubMetadata = {
    title: titleTags[0],
    creators: dc('creator').map(textOf).filter(Boolean),
    language: langTags[0],
    description: dc('description').map(textOf)[0],
    publisher: dc('publisher').map(textOf)[0],
    subjects: dc('subject').map(textOf).filter(Boolean),
    date: dc('date').map(textOf)[0],
    rights: dc('rights').map(textOf)[0],
  };

  if (!idTags.length) findings.push(F('epub.identifier_missing', 'error', 'No dc:identifier in the package metadata.', 'Add <dc:identifier id="pub-id">urn:uuid:...</dc:identifier> and point <package unique-identifier="pub-id"> at it.', 'epubcheck OPF-030'));
  else {
    const target = uidRef ? idTags.find(t => attr(t.attrs, 'id') === uidRef) : undefined;
    if (!uidRef) findings.push(F('epub.uid_attr_missing', 'error', '<package> has no unique-identifier attribute.', 'Add unique-identifier="pub-id" matching your dc:identifier id.', 'epubcheck OPF-030'));
    else if (!target) findings.push(F('epub.uid_unresolved', 'error', `unique-identifier "${uidRef}" does not match any dc:identifier id.`, 'Make the dc:identifier id attribute equal the package unique-identifier value.', 'epubcheck OPF-030'));
    else if (!textOf(target)) findings.push(F('epub.identifier_empty', 'error', 'The unique dc:identifier is empty.', 'Give it a value such as a urn:uuid: or your ISBN.'));
    metadata.identifier = textOf(target || idTags[0]);
  }
  if (!titleTags.length) findings.push(F('epub.title_missing', 'error', 'No dc:title in the package metadata.', 'Add <dc:title>Your Title</dc:title>.', 'epubcheck OPF-003 / stores'));
  if (!langTags.length) findings.push(F('epub.language_missing', 'error', 'No dc:language in the package metadata.', 'Add <dc:language>en</dc:language> (use the language of the text).', 'epubcheck OPF-003 / Apple Books'));
  else if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(langTags[0])) findings.push(F('epub.language_invalid', 'warning', `dc:language "${langTags[0]}" is not a valid language tag.`, 'Use a BCP-47 code such as en, en-GB, es, fr.'));
  const metas = tags(metaBlock, 'meta');
  const modified = metas.find(t => attr(t.attrs, 'property') === 'dcterms:modified');
  if (isV3 && !modified) findings.push(F('epub.modified_missing', 'error', 'EPUB 3 requires <meta property="dcterms:modified">.', 'Add <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>.', 'epubcheck OPF-054'));
  metadata.modified = modified ? textOf(modified) : undefined;

  // 5. manifest
  const manifestItems = tags(tags(opf, 'manifest')[0]?.inner ?? '', 'item').map(t => ({
    id: attr(t.attrs, 'id') || '', href: attr(t.attrs, 'href') || '', type: attr(t.attrs, 'media-type') || '',
    props: (attr(t.attrs, 'properties') || '').split(/\s+/).filter(Boolean), fallback: attr(t.attrs, 'fallback'),
  }));
  if (!manifestItems.length) findings.push(F('epub.manifest_empty', 'error', 'The manifest lists no files.', 'Every content file must be an <item> in <manifest>.', 'epubcheck OPF-019'));
  const idSeen = new Set<string>();
  const manifestPaths = new Set<string>();
  const byId = new Map<string, typeof manifestItems[number] & { path: string }>();
  for (const it of manifestItems) {
    if (!it.id) findings.push(F('epub.item_no_id', 'error', `Manifest item "${it.href}" has no id.`));
    else if (idSeen.has(it.id)) findings.push(F('epub.item_dup_id', 'error', `Duplicate manifest id "${it.id}".`, 'Manifest ids must be unique.', 'epubcheck RSC-005'));
    idSeen.add(it.id);
    const isRemote = REMOTE_RE.test(it.href);
    const path = isRemote ? it.href : resolveHref(opfPath, it.href);
    manifestPaths.add(path);
    byId.set(it.id, { ...it, path });
    if (!isRemote && !byName.has(path)) findings.push(F('epub.manifest_file_missing', 'error', `Manifest lists "${it.href}" but the file is not in the archive.`, 'Remove the manifest item or add the file.', 'epubcheck RSC-001'));
    if (!it.type) findings.push(F('epub.item_no_type', 'warning', `Manifest item "${it.href}" has no media-type.`));
  }
  for (const e of entries) {
    if (e.name === 'mimetype' || e.name.startsWith('META-INF/') || e.name.endsWith('/') || e.name === opfPath) continue;
    if (!manifestPaths.has(e.name)) findings.push(F('epub.unlisted_file', 'warning', `"${e.name}" is in the archive but not listed in the manifest.`, 'List it in the manifest or delete it (stores may reject undeclared resources).', 'epubcheck OPF-003'));
  }

  // 6. nav / ncx
  const navItems = manifestItems.filter(i => i.props.includes('nav'));
  const ncx = manifestItems.find(i => i.type === 'application/x-dtbncx+xml');
  const hasNav = navItems.length > 0, hasNcx = !!ncx;
  if (isV3) {
    if (navItems.length === 0) findings.push(F('epub.nav_missing', 'error', 'EPUB 3 requires a navigation document (manifest item with properties="nav").', 'Add a nav.xhtml with <nav epub:type="toc"> and list it with properties="nav".', 'epubcheck RSC-005 / all stores'));
    else if (navItems.length > 1) findings.push(F('epub.nav_multiple', 'error', 'More than one manifest item has properties="nav".', 'Keep exactly one navigation document.'));
  } else if (version && !hasNcx) findings.push(F('epub.ncx_missing', 'error', 'EPUB 2 requires an NCX table of contents.', 'Add toc.ncx and reference it from <spine toc="...">.'));

  // 7. spine
  const spineTag = tags(opf, 'spine')[0];
  const spineRefs = tags(spineTag?.inner ?? '', 'itemref').map(t => ({ idref: attr(t.attrs, 'idref') || '', linear: attr(t.attrs, 'linear') }));
  if (!spineTag || !spineRefs.length) findings.push(F('epub.spine_empty', 'error', 'The spine is empty — there is no reading order.', 'List your content documents in <spine> in reading order.', 'epubcheck OPF-033'));
  for (const r of spineRefs) {
    const it = byId.get(r.idref);
    if (!it) { findings.push(F('epub.spine_bad_ref', 'error', `Spine references "${r.idref}" which is not in the manifest.`, 'Fix the idref or add the manifest item.', 'epubcheck OPF-049')); continue; }
    if (it.type && !/html/.test(it.type) && !it.fallback) findings.push(F('epub.spine_non_xhtml', 'error', `Spine item "${it.href}" is ${it.type}, not XHTML, and has no fallback.`, 'Spine documents must be XHTML (or declare a fallback).', 'epubcheck OPF-043'));
  }

  // 8. accessibility discovery metadata
  const a11y = { features: [] as string[], hazards: [] as string[], accessModes: [] as string[], conformsTo: [] as string[], summary: undefined as string | undefined, imageCount: 0, imagesWithAlt: 0 };
  for (const t of metas) {
    const prop = attr(t.attrs, 'property') || '';
    const v = textOf(t);
    if (prop === 'schema:accessibilityFeature') a11y.features.push(v);
    else if (prop === 'schema:accessibilityHazard') a11y.hazards.push(v);
    else if (prop === 'schema:accessMode' || prop === 'schema:accessModeSufficient') a11y.accessModes.push(v);
    else if (prop === 'dcterms:conformsTo') a11y.conformsTo.push(v);
    else if (prop === 'schema:accessibilitySummary') a11y.summary = v;
  }

  // nav labels
  const navLabels = new Map<string, string>();
  const navPath = navItems[0] ? byId.get(navItems[0].id)?.path : undefined;
  const navXml = navPath ? await read(navPath) : null;
  if (navXml && navPath) {
    if (!/epub:type\s*=\s*["'][^"']*\btoc\b/.test(navXml)) findings.push(F('epub.nav_no_toc', 'error', 'The navigation document has no <nav epub:type="toc">.', 'Add a toc nav listing your chapters.', 'epubcheck RSC-005'));
    for (const a of tags(navXml, 'a')) {
      const href = attr(a.attrs, 'href'); if (!href) continue;
      const p = resolveHref(navPath, href);
      if (!navLabels.has(p)) navLabels.set(p, textOf(a));
      if (!REMOTE_RE.test(href) && !byName.has(p)) findings.push(F('epub.nav_broken_link', 'warning', `Table of contents links to "${href}" which does not exist.`, 'Fix or remove the broken TOC entry.'));
    }
  }

  // 9. images + fonts
  const images = manifestItems.filter(i => /^image\//.test(i.type) || IMG_RE.test(i.href));
  const imgInfo: { path: string; bytes: number }[] = [];
  for (const im of images) {
    const p = byId.get(im.id)!.path; const e = byName.get(p);
    if (!e) continue;
    imgInfo.push({ path: p, bytes: e.size });
    if (e.size > 10 * 1024 * 1024) findings.push(F('epub.image_huge', 'error', `Image "${im.href}" is ${(e.size / 1048576).toFixed(1)} MB.`, 'Resize to at most ~2000px on the long side and compress (JPEG quality ~80).', 'KDP/Apple image limits'));
    else if (e.size > 3 * 1024 * 1024) findings.push(F('epub.image_large', 'warning', `Image "${im.href}" is ${(e.size / 1048576).toFixed(1)} MB — large files slow downloads and cost readers data.`, 'Compress it; most interior images need under 1 MB.'));
  }
  const fonts = manifestItems.filter(i => /font/.test(i.type) || FONT_RE.test(i.href)).map(i => {
    const path = byId.get(i.id)!.path;
    return { path, bytes: byName.get(path)?.size ?? 0 };
  });
  if (fonts.length) {
    const total = fonts.reduce((s, f) => s + f.bytes, 0);
    findings.push(F('epub.fonts_embedded', total > 5 * 1048576 ? 'warning' : 'info', `${fonts.length} embedded font file${fonts.length > 1 ? 's' : ''} (${(total / 1048576).toFixed(1)} MB).`,
      'Make sure you have the licence to embed them. Readers can override fonts, so embedding is optional for plain prose.', 'Apple/Kobo font rules'));
  }

  // 10. content documents -> chapters
  const chapters: ManuscriptChapter[] = [];
  let scripted = false, remoteRefs = 0, emptyDocs = 0, n = 0;
  for (const r of spineRefs) {
    const it = byId.get(r.idref);
    if (!it || !/html/.test(it.type || 'html')) continue;
    const e = byName.get(it.path);
    if (!e) continue;
    const xhtml = await readZipText(bytes, e);
    if (!/<html\b/i.test(xhtml) || !/<body\b/i.test(xhtml)) findings.push(F('epub.doc_malformed', 'error', `"${it.href}" is not a complete XHTML document (missing <html> or <body>).`, 'Re-export the file.', 'epubcheck HTM-004'));
    if (/<script\b/i.test(xhtml) && !it.props.includes('scripted')) scripted = true;
    for (const im of xhtml.matchAll(/<img\b([^>]*)>/gi)) {
      a11y.imageCount++;
      if (/\balt\s*=/.test(im[1])) a11y.imagesWithAlt++;
      const src = attr(im[1], 'src');
      if (!src) continue;
      if (REMOTE_RE.test(src)) { if (!/^data:/i.test(src)) remoteRefs++; continue; }
      if (!byName.has(resolveHref(it.path, src))) findings.push(F('epub.image_broken', 'error', `"${it.href}" references an image that is not in the book: ${src}`, 'Re-add the image to the manifest/archive or remove the <img>.', 'epubcheck RSC-001'));
    }
    const html = xhtmlToHtmlLite(xhtml);
    const text = htmlToText(html);
    const words = countWords(text);
    if (words === 0 && !/<img\b|<svg\b/i.test(xhtml)) emptyDocs++;
    const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(xhtml)?.[1];
    const title = (navLabels.get(it.path)
      || (heading ? decodeXml(heading.replace(/<[^>]+>/g, '')).trim() : '')
      || /<title>([\s\S]*?)<\/title>/i.exec(xhtml)?.[1]?.trim()
      || `Section ${++n}`).replace(/\s+/g, ' ');
    const kind: ManuscriptChapter['kind'] = it.props.includes('nav') ? 'toc'
      : FRONT_RE.test(it.href) ? (/toc|nav/i.test(it.href) ? 'toc' : 'front')
      : BACK_RE.test(it.href) || BACK_RE.test(title) ? 'back' : 'chapter';
    chapters.push({ id: `ch_${chapters.length + 1}`, title, html, text, wordCount: words, kind, included: kind !== 'toc' });
  }
  if (scripted) findings.push(F('epub.scripted', 'warning', 'Some chapters contain <script> but are not declared scripted.', 'Remove JavaScript — KDP, Apple and Kobo reject or strip scripted reflowable ebooks.', 'KDP/Apple/Kobo'));
  if (remoteRefs) findings.push(F('epub.remote_resources', 'warning', `${remoteRefs} image(s) load from the web instead of the book.`, 'Embed images in the EPUB; remote resources fail offline and are rejected by most stores.'));
  if (emptyDocs) findings.push(F('epub.empty_docs', 'warning', `${emptyDocs} spine document(s) contain no text or images.`, 'Delete blank files from the spine (blank pages show up in readers).'));
  if (spineRefs.length && !chapters.length) findings.push(F('epub.no_content', 'error', 'None of the spine documents could be read.', 'Check the spine and manifest paths.'));

  // 11. cover
  let coverPath: string | undefined;
  const coverMeta = metas.find(t => attr(t.attrs, 'name') === 'cover');
  const coverId = coverMeta ? attr(coverMeta.attrs, 'content') : undefined;
  const coverItem = manifestItems.find(i => i.props.includes('cover-image')) ?? (coverId ? manifestItems.find(i => i.id === coverId) : undefined);
  if (coverItem) coverPath = byId.get(coverItem.id)?.path;
  else findings.push(F('epub.cover_missing', 'warning', 'No cover image is declared inside the EPUB.', 'Add a manifest item with properties="cover-image". (You can still upload the cover separately on the Cover step.)', 'Apple/Kobo/KDP'));

  // 12. a11y findings
  if (isV3) {
    if (!a11y.features.length && !a11y.summary) findings.push(F('a11y.metadata_missing', 'info', 'No accessibility metadata (schema:accessibilityFeature / accessibilitySummary).', 'Add it — the European Accessibility Act expects it for ebooks sold in the EU.', 'EAA / Kobo / Apple'));
    if (a11y.imageCount > a11y.imagesWithAlt) findings.push(F('a11y.alt_missing', 'warning', `${a11y.imageCount - a11y.imagesWithAlt} of ${a11y.imageCount} images have no alt attribute.`, 'Add alt text (alt="" for purely decorative images).', 'EPUB Accessibility 1.1'));
  }

  return {
    readable: true, version, opfPath, metadata, chapters, images: imgInfo, fonts, coverPath, hasNav, hasNcx,
    accessibility: a11y, findings,
  };
}

/** Read any file's bytes out of an EPUB, e.g. to offer the embedded cover as the book cover. */
export async function readEpubFile(bytes: Uint8Array, path: string): Promise<Uint8Array | null> {
  const e = readZipEntries(bytes).find(x => x.name === path);
  return e ? readZipData(bytes, e) : null;
}
