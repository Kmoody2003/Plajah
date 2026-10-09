// ExportModel: the format-neutral, STATIC reading of an upgraded (or plain) book that every exporter consumes.
// Built from the Tela doc + the upgrade record. This is where each enhancement's `exportFallback` is executed,
// so EPUB, PDF, Markdown and HTML all degrade the same way and the fidelity report always matches the output.

import type { TelaChartDevice, TelaDoc, TelaVectorObject } from '../../types';
import type { BookSource, BookTelaUpgrade, EnhancementInstance, ExportFormat, PageFidelity } from './types';
import { ENHANCEMENTS, instanceFidelity, resolveStrategy, validateInstance } from './enhancements';
import { parseFrameId } from './bookToTela';
import { esc, stripTags } from './html';
import { objectsToSvg } from '../tela/telaSvg';
import { FIXED_PAGE_MARK, livingReaderOnlyNotes } from './livingNotes';

export type XBlockKind = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'quote' | 'li' | 'oli' | 'hr';

export type XItem =
  | { t: 'block'; kind: XBlockKind; html: string; blockId?: string }
  | { t: 'figure'; src: string; alt: string; caption?: string }
  | { t: 'table'; caption?: string; header: string[]; rows: string[][] }
  | { t: 'qr'; url: string; label: string }
  | { t: 'callout'; html: string }
  | { t: 'links'; prompt: string; items: { label: string; chapterId: string }[] };

export interface XNote { key: string; kind: 'note' | 'glossary' | 'commentary'; label?: string; html: string }

export interface XChapter {
  id: string; title: string; kind: 'chapter' | 'front' | 'back' | 'toc';
  opener?: { src: string; alt: string };
  /** Static SVG snapshot of the designed opener page (telaSvg), used by fixed-layout EPUB and PDF. */
  openerSvg?: { svg: string; w: number; h: number };
  /** The same opener as vector objects, for the PDF vector-subset drawer. */
  openerObjects?: { objects: TelaVectorObject[]; w: number; h: number };
  dropCap: 'static' | 'animated' | 'none';
  items: XItem[];
  notes: XNote[];
}

/** Things that exist only in the Lorea reader and are never part of an EPUB/PDF/Markdown/HTML file. Shown in every fidelity report. */
export const READER_ONLY_NOTES: string[] = [
  'Page-turn animations (curl, flip, slide and the rest) are a Lorea reader feature. Exported EPUB and PDF files do not carry them: the reading app you open the file in uses its own page turn.',
];

export interface OmittedItem { id: string; label: string; reason: string }

export interface ExportModel {
  title: string; subtitle?: string; authors: string[]; language: string; description?: string;
  coverUrl?: string; coverAlt?: string;
  chapters: XChapter[];
  glossary: { term: string; definition: string }[];
  omitted: OmittedItem[];
  fidelity: PageFidelity[];
  /** Extra reader-only lines for THIS book (a living book's behaviours, music, narration). Appended to READER_ONLY_NOTES in the report. */
  readerOnly?: string[];
  /** True when pages are mostly pictures (picture book, comic): recommend fixed-layout. */
  visualLed: boolean;
  platformUrl: string;
  exportedAt: string;
}

export interface ModelOptions {
  format: ExportFormat;
  platformBase?: string;
  includeCommentary?: boolean;
  exportedAt?: string;
}

export const bookPlatformUrl = (bookId: string, base = 'https://plajah.com') => `${base.replace(/\/$/, '')}/book/${encodeURIComponent(bookId)}`;

const blockKindOf = (b: { kind: string; semanticLabel?: string; textRole?: string }): XBlockKind => {
  if (b.semanticLabel === 'hr') return 'hr';
  if (b.semanticLabel === 'blockquote' || (b.textRole === 'QUOTE' && b.kind === 'p')) return 'quote';
  if (b.kind === 'h1') return 'h1';
  if (b.kind === 'h2') return /^h[3-6]$/.test(b.semanticLabel || '') ? (b.semanticLabel as XBlockKind) : 'h2';
  if (b.kind === 'li') return b.semanticLabel === 'ol' ? 'oli' : 'li';
  return 'p';
};

/** Insert `marker` after the first whole-word occurrence of `term` in the text parts of an HTML-lite string. */
export function insertAfterTerm(html: string, term: string, marker: string): { html: string; found: boolean } {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}\\p{N}])`, 'iu');
  const parts = html.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i += 2) {
    const m = re.exec(parts[i]);
    if (m) {
      const at = m.index + m[1].length + m[2].length;
      parts[i] = parts[i].slice(0, at) + marker + parts[i].slice(at);
      return { html: parts.join(''), found: true };
    }
  }
  return { html, found: false };
}

const chartTable = (d: TelaChartDevice | undefined, c: Record<string, any>, caption: string): XItem => {
  const labels: string[] = d?.binding.labels ?? (c.labels || []).map(String);
  const series = d?.binding.series.map(s => ({ name: s.name, values: s.values || [] })) ?? (c.series || []);
  return { t: 'table', caption, header: ['', ...series.map((s: any) => String(s.name))], rows: labels.map((l, i) => [l, ...series.map((s: any) => String(s.values?.[i] ?? ''))]) };
};

/** Execute one frame-level enhancement's fallback into static items. */
export function fallbackItems(inst: EnhancementInstance, doc: Pick<TelaDoc, 'id' | 'devices'> | null, ctx: { url: string; asOf: string }): { items: XItem[]; omitted?: OmittedItem } {
  const def = ENHANCEMENTS[inst.type]; const c = inst.config || {};
  const label = inst.label || def.label; const alt = (inst.alt || '').trim();
  const { strategy } = resolveStrategy(inst);
  if (strategy === 'omit-note') return { items: [], omitted: { id: inst.id, label, reason: instanceFidelity(inst, 'EPUB_REFLOW').changes[0] } };
  const items: XItem[] = [];
  const poster = c.posterSrc || c.lottie?.posterSrc || c.poster;
  const qr = (what: string): XItem => ({ t: 'qr', url: ctx.url, label: what });
  switch (inst.type) {
    case 'AUDIO_SYNC': items.push({ t: 'callout', html: `<strong>${esc(label)}.</strong> A narrated version of this book is available on Plajah.` }, qr('Listen on Plajah')); break;
    case 'VIDEO': if (strategy === 'static-snapshot' && poster) items.push({ t: 'figure', src: String(poster), alt, caption: `${label} (video)` }); items.push(qr('Watch on Plajah')); break;
    case 'MOTION': if (strategy === 'static-snapshot' && poster) items.push({ t: 'figure', src: String(poster), alt, caption: c.caption || undefined }); else items.push({ t: 'callout', html: `<em>Illustration: ${esc(alt)}</em>` }); break;
    case 'INTERACTIVE_3D': if (strategy === 'static-snapshot' && poster) items.push({ t: 'figure', src: String(poster), alt, caption: `${label} (3D model)` }); else if (alt) items.push({ t: 'callout', html: `<em>3D object: ${esc(alt)}</em>` }); items.push(qr('Explore in 3D on Plajah')); break;
    case 'CHART': {
      const dev = doc?.devices[`${doc.id}:enh:${inst.id}`];
      const chartDev = dev && dev.type === 'CHART' ? dev : undefined;
      if (strategy === 'static-snapshot' && poster) items.push({ t: 'figure', src: String(poster), alt, caption: c.title });
      items.push(chartTable(chartDev, c, String(c.title || label)));
      if (alt) items.push({ t: 'callout', html: esc(alt) });
      break;
    }
    case 'LIVE_DATA': items.push({ t: 'callout', html: `<strong>${esc(String(c.label))}:</strong> ${esc(String(c.snapshotValue))}${c.unit ? ' ' + esc(String(c.unit)) : ''} <em>(value as of ${esc(String(c.asOf || ctx.asOf))}; it updates live on Plajah.)</em>` }); break;
    default: break;
  }
  return { items };
}

export interface BuildModelInput {
  doc: TelaDoc;
  book: BookSource;
  upgrade: Pick<BookTelaUpgrade, 'enhancements'> | null;
}

export function buildExportModel(inp: BuildModelInput, opts: ModelOptions): ExportModel {
  const { doc, book } = inp;
  const enh = inp.upgrade?.enhancements ?? [];
  const byId = new Map(enh.map(e => [e.id, e]));
  const url = bookPlatformUrl(book.id, opts.platformBase);
  const exportedAt = opts.exportedAt || new Date().toISOString();
  const asOf = exportedAt.slice(0, 10);
  const omitted: OmittedItem[] = [];
  const chapters = new Map<string, XChapter>(); const orderIds: string[] = [];
  const baseById = new Map(book.chapters.map(c => [c.id, c]));
  const titleOf = (cid: string) => baseById.get(cid)?.title || 'Untitled';
  const chapterTitles = new Map<string, string>();
  let coverUrl = book.coverUrl; let coverAlt = book.coverAlt;
  let visualFrames = 0; let textFrames = 0;
  const glossary: { term: string; definition: string }[] = [];
  const get = (cid: string): XChapter => {
    let c = chapters.get(cid);
    if (!c) {
      const b = baseById.get(cid);
      const dc = enh.find(e => e.chapterId === cid && e.type === 'ANIMATED_DROPCAP' && resolveStrategy(e).strategy !== 'omit-note');
      c = { id: cid, title: b?.title || titleOf(cid), kind: (b?.kind as XChapter['kind']) || 'chapter', dropCap: dc ? 'animated' : 'none', items: [], notes: [] };
      chapters.set(cid, c); orderIds.push(cid);
    }
    return c;
  };

  // text-level enhancements by anchor block
  const afterBlock = new Map<string, EnhancementInstance[]>();
  for (const e of enh) if (e.afterBlockId && e.afterBlockId !== 'start' && !validateInstance(e).some(i => i.severity === 'error')) {
    const a = afterBlock.get(e.afterBlockId) || []; a.push(e); afterBlock.set(e.afterBlockId, a);
  }
  let noteN = 0;
  const resolvedGloss = new Set<string>();

  const applyText = (ch: XChapter, blockId: string, html: string): { html: string; extra: XItem[] } => {
    let out = html; const extra: XItem[] = [];
    for (const e of afterBlock.get(blockId) || []) {
      const def = ENHANCEMENTS[e.type]; const { strategy } = resolveStrategy(e);
      if (def.placement !== 'text') continue;
      if (strategy === 'omit-note') { omitted.push({ id: e.id, label: e.label || def.label, reason: 'Left out of exports.' }); continue; }
      const c = e.config;
      if (e.type === 'READER_NOTE') { const key = `n${++noteN}`; ch.notes.push({ key, kind: 'note', html: esc(String(c.text)) }); out += `[[n:${key}]]`; }
      else if (e.type === 'COMMENTARY') {
        if (opts.includeCommentary === false) { omitted.push({ id: e.id, label: e.label || def.label, reason: 'Commentary excluded from this export.' }); continue; }
        const key = `n${++noteN}`; ch.notes.push({ key, kind: 'commentary', label: 'Author commentary', html: esc(String(c.text)) }); out += `[[n:${key}]]`;
      } else if (e.type === 'GLOSSARY') {
        const key = `n${++noteN}`;
        const r = insertAfterTerm(out, String(c.term), `[[n:${key}]]`);
        if (r.found) { resolvedGloss.add(e.id); out = r.html; ch.notes.push({ key, kind: 'glossary', label: String(c.term), html: `<strong>${esc(String(c.term))}</strong>: ${esc(String(c.definition))}` }); }
        if (!glossary.some(g => g.term.toLowerCase() === String(c.term).toLowerCase())) glossary.push({ term: String(c.term), definition: String(c.definition) });
      } else if (e.type === 'BRANCHING') {
        const choices = (c.choices || []).map((x: any) => ({ label: String(x.label), chapterId: String(x.targetChapterId) })).filter((x: any) => chapters.has(x.chapterId) || baseById.has(x.chapterId));
        if (strategy === 'internal-links') extra.push({ t: 'links', prompt: String(c.prompt || ''), items: choices });
        else extra.push({ t: 'callout', html: `${c.prompt ? `<strong>${esc(String(c.prompt))}</strong> ` : ''}${choices.map((x: any) => esc(`${x.label} (${titleOf(x.chapterId)})`)).join('; ')}` });
      }
    }
    return { html: out, extra };
  };

  for (const f of doc.frames) {
    const role = parseFrameId(doc.id, f.id);
    const devs = f.deviceIds.map(id => doc.devices[id]).filter(Boolean);
    if (role.role === 'cover') { const d = devs[0]; if (d?.type === 'MEDIA') { coverUrl = d.src || coverUrl; coverAlt = d.name || coverAlt; } continue; }
    if (role.role === 'opener') {
      const ch = get(role.chapterId); const d = devs[0];
      if (d?.type === 'VECTOR') {
        const h = d.objectLabel === FIXED_PAGE_MARK ? undefined : d.objects.find(o => o.kind === 'TEXT' && o.templateRole === 'HEADLINE');   // fixed pages keep the frame's own title
        if (h?.text) ch.title = stripTags(h.text).replace(/\s+/g, ' ').trim() || ch.title;
        chapterTitles.set(ch.id, ch.title);
        ch.openerObjects = { objects: d.objects, w: d.width, h: d.height };
        try { ch.openerSvg = { svg: objectsToSvg(d.objects, d.width, d.height), w: d.width, h: d.height }; } catch { /* snapshot is optional */ }
      }
      const il = enh.find(e => e.chapterId === role.chapterId && e.type === 'ILLUSTRATED_OPENER' && e.config?.src && resolveStrategy(e).strategy !== 'omit-note');
      if (il) { ch.opener = { src: String(il.config.src), alt: (il.alt || '').trim() }; visualFrames++; }
      continue;
    }
    if (role.role === 'enhancement') {
      const ch = get(role.chapterId); const inst = byId.get(role.enhancementId || '');
      if (!inst) { omitted.push({ id: f.id, label: f.label || 'Tela element', reason: 'Not described in the upgrade record, so it is left out of exports.' }); continue; }
      const r = fallbackItems(inst, doc, { url, asOf });
      if (r.omitted) omitted.push(r.omitted); ch.items.push(...r.items); visualFrames++;
      continue;
    }
    // writer / image / foreign
    const ch = get(role.role === 'foreign' ? (orderIds[orderIds.length - 1] ?? 'tela-front') : role.chapterId);
    for (const d of devs) {
      if (d.type === 'WRITER') {
        textFrames++;
        for (const b of d.blocks) {
          const kind = blockKindOf(b);
          const r = applyText(ch, b.id, b.text);
          ch.items.push({ t: 'block', kind, html: r.html, blockId: b.id }, ...r.extra);
        }
      } else if (d.type === 'MEDIA' && d.kind === 'IMAGE') {
        visualFrames++;
        ch.items.push({ t: 'figure', src: d.src, alt: d.name || '', ...(f.label ? { caption: f.label } : {}) });
      } else if (role.role === 'foreign') {
        omitted.push({ id: f.id, label: f.label || d.type, reason: `A ${d.type} element added in Tela has no export fallback, so it is left out.` });
      }
    }
  }

  // Glossary entries whose anchor block did not contain the term (or had no anchor): first use anywhere in the chapter.
  for (const e of enh) {
    if (e.type !== 'GLOSSARY' || resolvedGloss.has(e.id) || validateInstance(e).some(i => i.severity === 'error') || resolveStrategy(e).strategy === 'omit-note') continue;
    const term = String(e.config.term); const ch = chapters.get(e.chapterId);
    if (!glossary.some(g => g.term.toLowerCase() === term.toLowerCase())) glossary.push({ term, definition: String(e.config.definition) });
    if (!ch) continue;
    for (const it of ch.items) {
      if (it.t !== 'block') continue;
      const key = `n${++noteN}`; const r = insertAfterTerm(it.html, term, `[[n:${key}]]`);
      if (r.found) { it.html = r.html; ch.notes.push({ key, kind: 'glossary', label: term, html: `<strong>${esc(term)}</strong>: ${esc(String(e.config.definition))}` }); break; }
      noteN--;
    }
  }

  const list = orderIds.map(id => chapters.get(id)!).filter(c => baseById.get(c.id)?.included !== false);
  // book-level glossary appendix lives as its own back-matter chapter in the model
  const model: ExportModel = {
    title: book.title, subtitle: book.subtitle, authors: book.authors, language: book.language || 'en', description: book.description,
    coverUrl, coverAlt, chapters: list, glossary, omitted, fidelity: [],
    visualLed: book.visualLed ?? (visualFrames > 0 && visualFrames >= textFrames),
    platformUrl: url, exportedAt,
    ...(doc.living ? { readerOnly: livingReaderOnlyNotes(doc.living) } : {}),
  };
  model.fidelity = pageFidelity(doc, inp.upgrade, opts.format);
  return model;
}

// ── Per-page fidelity ("Export fidelity" badge) ──────────────────────────────

const worst = (a: PageFidelity['fidelity'], b: PageFidelity['fidelity']): PageFidelity['fidelity'] => (a === 'OMITTED' || b === 'OMITTED') ? 'OMITTED' : (a === 'DEGRADED' || b === 'DEGRADED') ? 'DEGRADED' : 'FULL';

/** One entry per Tela frame ("page"): FULL / DEGRADED (what changes) / OMITTED, for the chosen export format. */
export function pageFidelity(doc: Pick<TelaDoc, 'id' | 'frames' | 'devices'>, upgrade: Pick<BookTelaUpgrade, 'enhancements'> | null, format: ExportFormat): PageFidelity[] {
  const enh = upgrade?.enhancements ?? [];
  const byId = new Map(enh.map(e => [e.id, e]));
  // map text-level enhancements to the frame that holds their anchor block
  const frameOfBlock = new Map<string, string>();
  for (const f of doc.frames) for (const id of f.deviceIds) { const d = doc.devices[id]; if (d?.type === 'WRITER') for (const b of d.blocks) frameOfBlock.set(b.id, f.id); }
  const per = new Map<string, EnhancementInstance[]>();
  const push = (fid: string, e: EnhancementInstance) => { const a = per.get(fid) || []; a.push(e); per.set(fid, a); };
  const firstFrameOfChapter = (cid: string) => doc.frames.find(f => { const r = parseFrameId(doc.id, f.id); return r.role === 'opener' && r.chapterId === cid; })?.id;
  for (const e of enh) {
    if (e.type === 'ILLUSTRATED_OPENER' || e.type === 'ANIMATED_DROPCAP') { const f = firstFrameOfChapter(e.chapterId); if (f) push(f, e); continue; }
    if (ENHANCEMENTS[e.type].placement === 'frame') {
      const f = doc.frames.find(fr => { const r = parseFrameId(doc.id, fr.id); return r.role === 'enhancement' && r.enhancementId === e.id; });
      if (f) push(f.id, e);
    } else if (e.afterBlockId && e.afterBlockId !== 'start') { const f = frameOfBlock.get(e.afterBlockId); if (f) push(f, e); }
  }
  const out: PageFidelity[] = [];
  for (const f of doc.frames) {
    const r = parseFrameId(doc.id, f.id);
    let fid: PageFidelity['fidelity'] = 'FULL'; const changes: string[] = []; const ids: string[] = [];
    for (const e of per.get(f.id) || []) {
      const x = instanceFidelity(e, format);
      fid = worst(fid, x.fidelity); ids.push(e.id);
      for (const c of x.changes) if (!changes.includes(c)) changes.push(c);
    }
    if (r.role === 'foreign') {
      const unsupported = f.deviceIds.map(id => doc.devices[id]).filter(d => d && d.type !== 'WRITER' && !(d.type === 'MEDIA' && d.kind === 'IMAGE'));
      if (unsupported.length && !byId.has(f.id)) { fid = worst(fid, 'OMITTED'); changes.push(`Contains ${unsupported.map(d => d!.type).join(', ')} added in Tela with no export fallback. It is left out.`); }
    }
    out.push({ frameId: f.id, label: f.label || r.role, chapterId: 'chapterId' in r ? r.chapterId : undefined, fidelity: fid, changes, enhancementIds: ids });
  }
  return out;
}

export function fidelitySummary(p: PageFidelity[]): { full: number; degraded: number; omitted: number; overall: PageFidelity['fidelity'] } {
  const full = p.filter(x => x.fidelity === 'FULL').length, degraded = p.filter(x => x.fidelity === 'DEGRADED').length, omitted = p.filter(x => x.fidelity === 'OMITTED').length;
  return { full, degraded, omitted, overall: omitted ? 'OMITTED' : degraded ? 'DEGRADED' : 'FULL' };
}
