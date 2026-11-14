// docTemplates/apply — a theme or a template onto the CURRENT Tela document, as one undoable op.
//
//   theme     restyles the word pages in scope: stylesheet + flourishes. Words and layout stay.
//   template  theme + structure. Three ways, never destructive:
//               fill     the pages are empty (or there are none): the template's pages go in.
//               restyle  the pages have words: they keep them and take the template's page
//                        setup (margins, columns) and design.
//               append   the template's pages are added after the person's own.
import type { TelaDoc, TelaFrame, TelaWriterDevice } from '../../../types';
import type { TelaOp } from '../../../components/tela/telaOps';
import { blocksHash, deriveBlocks } from '../../text/document/blocks';
import { documentParts, newSection } from '../../text/document/defaults';
import type { WriterOp } from '../../text/document/ops';
import type { DocSection, WriterDocumentParts } from '../../text/document/types';
import type { StyleSheet } from '../../text/model';
import { mergeSheet, structureSetup, structureStory, themeStyleSheet, writerTheme } from './build';
import type { DocStructure, DocTheme, StructurePage } from './types';

export interface WriterPage { frame: TelaFrame; device: TelaWriterDevice }

/** The document's word pages, in page order. */
export function writerPages(doc: TelaDoc): WriterPage[] {
  const out: WriterPage[] = [];
  for (const frame of doc.frames) {
    for (const id of frame.deviceIds) {
      const d = doc.devices[id];
      if (d?.type === 'WRITER') { out.push({ frame, device: d }); break; }
    }
  }
  return out;
}

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
export function pageIsEmpty(d: TelaWriterDevice): boolean { return !(d.blocks || []).some(b => plain(b.text || '')); }

/** Pages whose words belong to another surface (a song, a journal) take a look but never a skeleton. */
const bound = (d: TelaWriterDevice) => !!d.domainBinding || (d.mode && d.mode !== 'DOCUMENT');

export function themeOf(d: TelaWriterDevice): string | null { return d.document?.theme?.id ?? null; }

const sheetCache = new WeakMap<DocTheme, StyleSheet>();
function sheetFor(t: DocTheme): StyleSheet { let s = sheetCache.get(t); if (!s) sheetCache.set(t, (s = themeStyleSheet(t))); return s; }

function themeWriterOps(d: TelaWriterDevice, theme: DocTheme | null): WriterOp[] {
  if (!theme) return [{ type: 'set', key: 'theme', value: null }];
  return [
    { type: 'set', key: 'styles', value: mergeSheet(sheetFor(theme), d.document?.styles) },
    { type: 'set', key: 'theme', value: writerTheme(theme) },
  ];
}

function setupOp(d: TelaWriterDevice, page: StructurePage): WriterOp {
  const cur = d.document?.sections;
  const sections: DocSection[] = cur?.length ? cur.map((s, i) => (i === 0 ? { ...s, setup: structureSetup(page, s.setup) } : s)) : [newSection(structureSetup(page))];
  return { type: 'set', key: 'sections', value: sections };
}

/** Design only, on the given pages (null clears the look). */
export function themeOp(doc: TelaDoc, theme: DocTheme | null, deviceIds: string[]): TelaOp | null {
  const ops: TelaOp[] = [];
  for (const id of deviceIds) {
    const d = doc.devices[id];
    if (d?.type === 'WRITER') ops.push({ type: 'WRITER_EDIT', deviceId: id, ops: themeWriterOps(d, theme) });
  }
  return ops.length ? { type: 'BATCH', ops, label: theme ? `Theme: ${theme.name}` : 'Plain pages' } : null;
}

/** A new themed Writer device holding one structure page. */
export function templateDevice(id: string, page: StructurePage, theme: DocTheme): TelaWriterDevice {
  const story = structureStory(page);
  const blocks = deriveBlocks(story);
  const parts: WriterDocumentParts = documentParts({ styles: sheetFor(theme), sections: [newSection(structureSetup(page))], theme: writerTheme(theme) });
  return { id, type: 'WRITER', mode: 'DOCUMENT', blocks, story, document: { ...parts, blocksHash: blocksHash(blocks) } };
}

export type TemplateMode = 'fill' | 'restyle' | 'append';

/** What "Use template" would do on this document, so the panel can say it before doing it. */
export function templateModeFor(doc: TelaDoc): 'fill' | 'ask' {
  const pages = writerPages(doc);
  return pages.every(p => pageIsEmpty(p.device)) ? 'fill' : 'ask';
}

const PAGE_GAP = 54;
const LETTER = { w: 816, h: 1056 };

export interface TemplateResult { op: TelaOp; focusFrameId?: string; added: number; restyled: number }

export function templateOp(doc: TelaDoc, structure: DocStructure, theme: DocTheme, opts: {
  mode: TemplateMode;
  uid: (prefix: string) => string;
  /** Where a first page goes when the document has no paper yet. */
  origin: { x: number; y: number };
  /** The paragraph ids a device's body holds right now (the host knows the migrated story). */
  paragraphIds: (d: TelaWriterDevice) => string[];
}): TemplateResult | null {
  const pages = writerPages(doc);
  const ops: TelaOp[] = [];
  let restyled = 0, added = 0, focusFrameId: string | undefined;

  const papers = doc.frames.filter(f => f.kind === 'PAPER');
  let anchor = pages.length ? pages[pages.length - 1].frame : papers[papers.length - 1];
  let next = anchor ? { x: anchor.x, y: anchor.y + anchor.h + PAGE_GAP } : opts.origin;
  const size = anchor && anchor.kind === 'PAPER' ? { w: anchor.w, h: anchor.h, preset: anchor.preset } : { ...LETTER, preset: 'LETTER' as const };
  const addPage = (page: StructurePage) => {
    const device = templateDevice(opts.uid('dev'), page, theme);
    const frame: TelaFrame = { id: opts.uid('frame'), kind: 'PAPER', preset: size.preset, x: next.x, y: next.y, w: size.w, h: size.h, deviceIds: [device.id], label: page.label };
    ops.push({ type: 'ADD_FRAME', frame, devices: [device] });
    next = { x: frame.x, y: frame.y + frame.h + PAGE_GAP };
    focusFrameId ??= frame.id;
    added++;
  };

  if (opts.mode === 'append') {
    for (const page of structure.pages) addPage(page);
  } else if (opts.mode === 'fill') {
    structure.pages.forEach((page, i) => {
      const target = pages[i];
      if (!target) { addPage(page); return; }
      const d = target.device;
      const w: WriterOp[] = [...themeWriterOps(d, theme), setupOp(d, page)];
      if (!bound(d) && pageIsEmpty(d)) {
        const story = structureStory(page);
        const old = opts.paragraphIds(d);
        w.push({ type: 'text', target: { kind: 'body' }, ops: [{ type: 'insertParagraphs', afterId: old.length ? old[old.length - 1] : null, paragraphs: story.paragraphs }, ...(old.length ? [{ type: 'removeParagraphs' as const, ids: old }] : [])] });
        if (target.frame.label !== page.label && /^Page \d+$/.test(target.frame.label || '')) ops.push({ type: 'RENAME_FRAME', frameId: target.frame.id, label: page.label });
      }
      ops.push({ type: 'WRITER_EDIT', deviceId: d.id, ops: w });
      focusFrameId ??= target.frame.id;
      restyled++;
    });
    // Further pages the person already has take the look of the template's last page.
    for (const extra of pages.slice(structure.pages.length)) { ops.push({ type: 'WRITER_EDIT', deviceId: extra.device.id, ops: [...themeWriterOps(extra.device, theme), setupOp(extra.device, structure.pages[structure.pages.length - 1])] }); restyled++; }
  } else {
    pages.forEach((p, i) => {
      const page = structure.pages[Math.min(i, structure.pages.length - 1)];
      ops.push({ type: 'WRITER_EDIT', deviceId: p.device.id, ops: [...themeWriterOps(p.device, theme), setupOp(p.device, page)] });
      restyled++;
    });
    focusFrameId = pages[0]?.frame.id;
  }
  if (!ops.length) return null;
  return { op: { type: 'BATCH', ops, label: `Template: ${structure.name}` }, focusFrameId, added, restyled };
}
