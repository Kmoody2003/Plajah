// Book <-> Tela doc. PURE. Follows the pattern of services/journalist/articleTela.ts (and reuses its helpers):
//
//   cover frame        MEDIA image
//   per chapter:
//     opener frame     VECTOR (a publication-gallery BOOK template page when one is given, else a built-in opener)
//     writer frames    WRITER (the prose; split into page-sized frames; blocks carry stable ids)
//     image frames     MEDIA image (inline figures, alt text kept in device.name, caption in frame.label)
//     enhancement      frame-level enhancements (audio, video, motion, 3D, chart, live data) as their own frames
//
// ONE source of truth: after an upgrade the Tela doc owns the text. telaDocToBook() is the inverse and is lossless
// for everything bookToTelaDoc() writes (see tests/bookTela.test.ts), and tolerant of what an author adds in Tela.

import type { TelaBlock, TelaDevice, TelaDoc, TelaFrame, TelaMediaDevice, TelaVectorDevice, TelaVectorObject } from '../../types';
import { fillTemplateObjects, type TemplateLike } from '../journalist/articleTela';
import type { BookSource, BookSourceChapter, EnhancementInstance, UpgradeOptions } from './types';
import { enhancementFrame, isFrameLevel, BOOK_FRAME_W } from './enhancements';
import { FIXED_PAGE_MARK } from './livingNotes';
import { htmlToNodes, nodesToHtml, normalizeChapterHtml, stripTags, type ChapterNode } from './html';

export const PAGE_MAX_H = 900;

/**
 * Height a Writer frame needs. TelaWriter draws 17px serif at line-height 1.62 inside 64px/72px padding, so the
 * measure is (width - 144). Errs tall: a short frame would make the reader scroll inside the page.
 */
export function estimateBookWriterHeight(blocks: ReadonlyArray<TelaBlock>, width = BOOK_FRAME_W): number {
  const cpl = Math.max(20, Math.floor((width - 144) / 8.2));
  let h = 128;
  for (const b of blocks) {
    const len = stripTags(b.text).length;
    const k = b.kind === 'h1' ? { f: 1.8, lh: 1.2, m: 0.6 } : b.kind === 'h2' ? { f: 1.35, lh: 1.25, m: 0.6 } : { f: 1, lh: 1.62, m: 0.85 };
    const perLine = Math.max(8, Math.floor(cpl / k.f));
    const lines = Math.max(1, Math.ceil(len / perLine));
    h += lines * 17 * k.f * k.lh + 17 * k.f * k.m;
  }
  return Math.ceil(h * 1.1 + 16);
}
export const WRITER_FRAME_PREFIX = 'ch';

const encId = (s: string) => s.replace(/%/g, '%25').replace(/:/g, '%3A');
const decId = (s: string) => s.replace(/%3A/g, ':').replace(/%25/g, '%');

export const frameIds = {
  cover: (docId: string) => `${docId}:f:cover`,
  opener: (docId: string, cid: string) => `${docId}:f:ch:${encId(cid)}:opener`,
  writer: (docId: string, cid: string, n: number) => `${docId}:f:ch:${encId(cid)}:w${n}`,
  image: (docId: string, cid: string, n: number) => `${docId}:f:ch:${encId(cid)}:img${n}`,
  enh: (docId: string, cid: string, enhId: string) => `${docId}:f:ch:${encId(cid)}:enh:${enhId}`,
};

export type FrameRole =
  | { role: 'cover' }
  | { role: 'opener' | 'writer' | 'image' | 'enhancement'; chapterId: string; enhancementId?: string }
  | { role: 'foreign' };

export function parseFrameId(docId: string, frameId: string): FrameRole {
  if (frameId === frameIds.cover(docId)) return { role: 'cover' };
  const prefix = `${docId}:f:ch:`;
  if (!frameId.startsWith(prefix)) return { role: 'foreign' };
  const rest = frameId.slice(prefix.length);
  const m = /^([^:]+):(opener|w\d+|img\d+|enh:(.+))$/.exec(rest);
  if (!m) return { role: 'foreign' };
  const chapterId = decId(m[1]);
  if (m[2] === 'opener') return { role: 'opener', chapterId };
  if (m[2].startsWith('w')) return { role: 'writer', chapterId };
  if (m[2].startsWith('img')) return { role: 'image', chapterId };
  return { role: 'enhancement', chapterId, enhancementId: m[3] };
}

// ── helpers ──────────────────────────────────────────────────────────────────

let seq = 0;
const oid = (p: string) => `${p}_${(++seq).toString(36)}`;

const textObj = (x: number, y: number, w: number, h: number, text: string, size: number, fill: string, role: TelaVectorObject['templateRole'], extra: Partial<TelaVectorObject> = {}): TelaVectorObject => ({
  id: oid('btxt'), kind: 'TEXT', x, y, w, h, fill, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, text, fontSize: size,
  fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, wrap: true, textAlign: 'center', lineHeight: 1.14, templateRole: role, ...extra,
});
const rectObj = (x: number, y: number, w: number, h: number, fill: string, role: TelaVectorObject['templateRole'] = 'GROUND'): TelaVectorObject => ({
  id: oid('brect'), kind: 'RECT', x, y, w, h, fill, stroke: 'none', strokeWidth: 0, rotation: 0, opacity: 1, rx: 0, templateRole: role,
});

/** Choose the best opener page of a BOOK template. */
export function chapterOpenerPage(t: TemplateLike): TemplateLike['pages'][number] | undefined {
  const rank = (label: string) => /chapter/i.test(label) ? 0 : /opener|title page|title/i.test(label) ? 1 : /cover/i.test(label) ? 2 : 9;
  return [...t.pages].sort((a, b) => rank(a.label) - rank(b.label))[0];
}

function openerObjects(chapter: BookSourceChapter, ordinal: number, o: { template?: TemplateLike | null; illustration?: { src: string; w: number; h: number } }): { objects: TelaVectorObject[]; w: number; h: number } {
  const label = chapter.kind && chapter.kind !== 'chapter' ? '' : `Chapter ${ordinal}`;
  const tpl = o.template; const page = tpl ? chapterOpenerPage(tpl) : undefined;
  if (tpl && page) {
    let built: TelaVectorObject[] = [];
    try { built = page.build(); } catch { built = []; }
    if (built.length) {
      const objs = fillTemplateObjects(built, { title: chapter.title, category: label, blocks: [] });
      return { objects: objs, w: tpl.width, h: tpl.height };
    }
  }
  const w = BOOK_FRAME_W; const m = 36;
  const [paper, ink, accent] = ['#FBF8F2', '#16130F', '#8A5A2B'];
  const objects: TelaVectorObject[] = [rectObj(0, 0, w, 10, paper, 'GROUND')];
  let y = 40;
  if (o.illustration) {
    const ih = Math.round((w - m * 2) * (o.illustration.h / o.illustration.w));
    objects.push({ ...rectObj(m, y, w - m * 2, ih, '#ddd', 'IMAGE_SLOT'), kind: 'IMAGE', sourceImageSrc: o.illustration.src, sourceCrop: { x: 0, y: 0, width: o.illustration.w, height: o.illustration.h, sourceWidth: o.illustration.w, sourceHeight: o.illustration.h } });
    y += ih + 28;
  }
  if (label) { objects.push(textObj(m, y, w - m * 2, 22, label.toUpperCase(), 13, accent, 'LABEL', { fontWeight: 800, letterSpacing: 0.18, fontFamily: 'Inter, system-ui, sans-serif' })); y += 38; }
  const size = chapter.title.length > 50 ? 26 : 34;
  const lines = Math.max(1, Math.ceil((chapter.title.length * size * 0.52) / (w - m * 2)));
  const th = Math.ceil(lines * size * 1.2);
  objects.push(textObj(m, y, w - m * 2, th, chapter.title, size, ink, 'HEADLINE')); y += th + 18;
  objects.push(rectObj(w / 2 - 28, y, 56, 2, accent, 'RULE')); y += 34;
  objects[0] = { ...objects[0], w, h: y };
  return { objects, w, h: y };
}

// ── bookToTelaDoc ────────────────────────────────────────────────────────────

export const defaultDocId = (bookId: string) => `book:${bookId}`;

export function bookToTelaDoc(book: BookSource, opts: UpgradeOptions = {}): TelaDoc {
  const now = opts.now ?? Date.now();
  const docId = opts.docId || defaultDocId(book.id);
  const enhancements = opts.enhancements ?? [];
  const frames: TelaFrame[] = []; const devices: Record<string, TelaDevice> = {};
  let y = 0;
  const add = (f: Pick<TelaFrame, 'id' | 'w' | 'h' | 'deviceIds' | 'label'>) => { frames.push({ ...f, kind: 'SCREEN', preset: 'FREE', x: 0, y }); y += f.h + 24; };

  if (book.coverUrl) {
    const id = `${docId}:cover`;
    devices[id] = { id, type: 'MEDIA', kind: 'IMAGE', name: book.coverAlt || `Cover of ${book.title}`, src: book.coverUrl, mimeType: '', size: 0, width: BOOK_FRAME_W, height: 720 } as TelaMediaDevice;
    add({ id: frameIds.cover(docId), w: BOOK_FRAME_W, h: 720, deviceIds: [id], label: 'Cover' });
  }

  let ordinal = 0;
  for (const ch of book.chapters) {
    if (ch.included === false) continue;
    if (!ch.kind || ch.kind === 'chapter') ordinal++;
    const cid = ch.id;
    const mine = enhancements.filter(e => e.chapterId === cid);
    const opener = mine.find(e => e.type === 'ILLUSTRATED_OPENER' && e.config?.src);

    const op = openerObjects(ch, ordinal, {
      template: opts.template,
      illustration: opener ? { src: String(opener.config.src), w: Number(opener.config.width) || 1600, h: Number(opener.config.height) || 900 } : undefined,
    });
    const oidDev = `${docId}:ch:${encId(cid)}:opener`;
    devices[oidDev] = { id: oidDev, type: 'VECTOR', name: ch.title, width: op.w, height: op.h, objects: op.objects } as TelaVectorDevice;
    add({ id: frameIds.opener(docId, cid), w: op.w, h: op.h, deviceIds: [oidDev], label: ch.title });

    const nodes = htmlToNodes(normalizeChapterHtml(ch.title, ch.html));
    const frameLevel = mine.filter(e => isFrameLevel(e.type));
    const placed = new Set<string>();
    const pushEnh = (e: EnhancementInstance) => {
      const ef = enhancementFrame(e, docId);
      if (!ef) return;
      placed.add(e.id);
      devices[ef.id] = ef.device;
      add({ id: frameIds.enh(docId, cid, e.id), w: ef.w, h: ef.h, deviceIds: [ef.id], label: ef.label });
    };

    let seg: TelaBlock[] = []; let wN = 0; let imgN = 0;
    const flush = () => {
      if (!seg.length) return;
      const id = `${docId}:ch:${encId(cid)}:w${++wN}`;
      devices[id] = { id, type: 'WRITER', mode: 'DOCUMENT', blocks: seg } as TelaDevice;
      add({ id: frameIds.writer(docId, cid, wN), w: BOOK_FRAME_W, h: estimateBookWriterHeight(seg), deviceIds: [id], label: `${ch.title} ${wN}` });
      seg = [];
    };

    for (const e of frameLevel) if (e.afterBlockId === 'start') pushEnh(e);
    nodes.forEach((n: ChapterNode, i) => {
      if (n.type === 'image') {
        flush();
        const id = `${docId}:ch:${encId(cid)}:img${++imgN}`;
        devices[id] = { id, type: 'MEDIA', kind: 'IMAGE', name: n.alt, src: n.src, mimeType: '', size: 0, width: BOOK_FRAME_W, height: 270 } as TelaMediaDevice;
        add({ id: frameIds.image(docId, cid, imgN), w: BOOK_FRAME_W, h: 270, deviceIds: [id], label: n.caption });
        return;
      }
      const bid = `${encId(cid)}:b${i}`;
      seg.push({ id: bid, ...n.block });
      if (estimateBookWriterHeight(seg) > PAGE_MAX_H && seg.length > 1) {
        const last = seg.pop()!; flush(); seg.push(last);
      }
      // frame-level enhancements anchored after this block
      const anchored = frameLevel.filter(e => e.afterBlockId === bid && !placed.has(e.id));
      if (anchored.length) { flush(); anchored.forEach(pushEnh); }
    });
    flush();
    for (const e of frameLevel) if (!placed.has(e.id)) pushEnh(e); // end of chapter (or anchor not found)
  }

  return {
    id: docId, ownerId: opts.ownerId || book.ownerId || '', title: book.title || 'Untitled book', frames, devices,
    createdAt: now, updatedAt: now,
    ...(opts.template ? { templatePreset: { schemaVersion: 1 as const, templateId: opts.template.id, status: 'available' as const } } : {}),
  };
}

// ── telaDocToBook ────────────────────────────────────────────────────────────

export interface TelaToBookResult {
  chapters: BookSourceChapter[];
  coverUrl?: string;
  /** Block ids per chapter in reading order: enhancement anchors resolve against these. */
  blockIds: Record<string, string[]>;
  warnings: string[];
}

const headlineOf = (d: TelaVectorDevice): string | undefined => {
  if (d.objectLabel === FIXED_PAGE_MARK) return undefined;   // a fixed picture-book page: title comes from the frame, not from lettered HEADLINE glyphs
  const t = d.objects.find(o => o.kind === 'TEXT' && o.templateRole === 'HEADLINE');
  return t?.text ? stripTags(t.text).replace(/\s+/g, ' ').trim() : undefined;
};

/** Project a Tela doc back to chapters, preserving ids, order, kind and audio from `base`. */
export function telaDocToBook(doc: Pick<TelaDoc, 'id' | 'frames' | 'devices'>, base: Pick<BookSource, 'chapters'>): TelaToBookResult {
  const warnings: string[] = [];
  const baseById = new Map(base.chapters.map(c => [c.id, c]));
  const order: string[] = []; const nodesBy = new Map<string, ChapterNode[]>(); const titleBy = new Map<string, string>();
  const blockIds: Record<string, string[]> = {};
  let coverUrl: string | undefined; let current: string | null = null;
  const ensure = (cid: string) => { if (!nodesBy.has(cid)) { nodesBy.set(cid, []); order.push(cid); blockIds[cid] = []; } current = cid; };

  for (const f of doc.frames) {
    const role = parseFrameId(doc.id, f.id);
    const devs = f.deviceIds.map(id => doc.devices[id]).filter(Boolean);
    if (role.role === 'cover') { const d = devs[0]; if (d?.type === 'MEDIA' && d.src) coverUrl = d.src; continue; }
    if (role.role === 'opener') {
      ensure(role.chapterId);
      const d = devs[0]; if (d?.type === 'VECTOR') { const h = headlineOf(d); if (h) titleBy.set(role.chapterId, h); else if (d.objectLabel === FIXED_PAGE_MARK && (f.label || d.name)) titleBy.set(role.chapterId, String(f.label || d.name)); }
      continue;
    }
    if (role.role === 'enhancement') { ensure(role.chapterId); continue; }
    let target = role.role === 'writer' || role.role === 'image' ? role.chapterId : current;
    if (!target) { target = 'tela-front'; if (!nodesBy.has(target)) { warnings.push('Frames before the first chapter were collected into a "Front matter" section.'); titleBy.set(target, 'Front matter'); } }
    ensure(target);
    for (const d of devs) {
      if (d.type === 'WRITER') {
        for (const b of d.blocks) {
          const { id, ...block } = b;
          nodesBy.get(target)!.push({ type: 'block', block });
          blockIds[target].push(id);
        }
      } else if (d.type === 'MEDIA' && d.kind === 'IMAGE') {
        nodesBy.get(target)!.push({ type: 'image', src: d.src, alt: d.name || '', ...(f.label ? { caption: f.label } : {}) });
        blockIds[target].push(d.id);
      } else if (role.role === 'foreign') {
        warnings.push(`Frame "${f.label || f.id}" holds a ${d.type} element that is not part of the book text, so it stays in Tela only.`);
      }
    }
  }

  const chapters: BookSourceChapter[] = [];
  for (const cid of order) {
    const b = baseById.get(cid);
    const title = titleBy.get(cid) || b?.title || 'Untitled';
    const html = nodesToHtml(nodesBy.get(cid)!);
    chapters.push({ id: cid, title, html, ...(b?.kind ? { kind: b.kind } : {}), included: b?.included ?? true, ...(b?.audioUrl ? { audioUrl: b.audioUrl } : {}) });
  }
  for (const b of base.chapters) if (b.included !== false && !order.includes(b.id)) warnings.push(`Chapter "${b.title}" no longer exists in the Tela document and was not carried back.`);
  return { chapters, coverUrl, blockIds, warnings };
}

/** Plain-text of the whole doc (writer frames), for search, previews and word counts. */
export function telaBookPlainText(doc: Pick<TelaDoc, 'frames' | 'devices'>): string {
  const out: string[] = [];
  for (const f of doc.frames) for (const id of f.deviceIds) {
    const d = doc.devices[id];
    if (d?.type === 'WRITER') for (const b of d.blocks) { const t = stripTags(b.text).trim(); if (t) out.push(t); }
  }
  return out.join('\n\n');
}
