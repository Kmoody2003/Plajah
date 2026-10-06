/**
 * Notebook structure for Plajah Notes: notebooks, sections and pages, stored as entries in the SAME
 * notebook every Plajah user already has (services/notebookService), so nothing about a student's
 * existing notes changes. Structure entries use new `type` values (NOTEBOOK, SECTION, PAGE); every
 * older entry (a note, journal, lab experiment...) still shows up, filed under "Unfiled", and is
 * upgraded to a page the first time it is opened.
 *
 * A PAGE's content is a Tela document (frames + devices), so it can hold typed text, ink, images,
 * tables, audio and charts, and it is embeddable anywhere Tela documents are. This file is pure
 * (no storage or network) so it can be unit-tested.
 */
import type { TelaDoc, TelaFrame, TelaVectorDevice, TelaWriterDevice, TelaBlock } from '../types';

export const PAGE_W = 820;
export const PAGE_H = 1160;

export type PageTemplate = 'blank' | 'lined' | 'grid' | 'dots' | 'cornell' | 'music' | 'handwriting' | 'math';
export const TEMPLATES: Array<{ id: PageTemplate; label: string; blurb: string }> = [
  { id: 'blank', label: 'Blank', blurb: 'An empty page' },
  { id: 'lined', label: 'Lined', blurb: 'Ruled lines for writing' },
  { id: 'grid', label: 'Grid', blurb: 'Squares for math, graphs and diagrams' },
  { id: 'dots', label: 'Dot grid', blurb: 'Dots for sketching and bullet journaling' },
  { id: 'cornell', label: 'Cornell notes', blurb: 'Cue column, notes and summary' },
  { id: 'math', label: 'Math (graph paper)', blurb: 'Larger squares with axes space' },
  { id: 'handwriting', label: 'Handwriting', blurb: 'Guide lines with a dotted midline' },
  { id: 'music', label: 'Music staff', blurb: 'Staves for composing' },
];

export interface NotebookMeta { id: string; title: string; color: string; emoji: string; order: number }
export interface SectionMeta { id: string; notebookId: string; title: string; color: string; order: number }
export interface PageMeta {
  id: string; notebookId: string; sectionId: string; title: string; template: PageTemplate;
  /** Tela document that holds the page body. Missing on legacy entries until they are opened. */
  telaDocId?: string; text: string; tags: string[]; pinned: boolean; legacy: boolean;
  createdAt: number; updatedAt: number; order: number;
  /** Where it came from, e.g. a lesson: shown as a link on the page. */
  source?: { label: string; courseId?: string; lessonId?: string };
  /**
   * Set on read-through pages that mirror notes written in a reader (Lectio verse notes, Sacred
   * Library passage notes, the research notebook). They have no Tela body: the reader's store stays
   * the single source of truth, and edits are written back to it (see services/notesScripture).
   */
  reader?: ReaderPage;
}

/** One note shown on a reader page, e.g. the note on Romans 8:28. */
export interface ReaderItem {
  /** Key in the reader's store (verse / passage notes) or the research entry id. */
  key: string;
  /** Readable heading, e.g. "8:28" or "Al-Fatiha 3". */
  label: string;
  text: string;
  /** Extra lines shown under the text (research sources and comparisons). */
  details?: string[];
  /** Scripture ref id (services/scriptureRef refId) to open Lectio at, when there is one. */
  refId?: string;
  /** False for research entries, which are edited in the research notebook itself. */
  editable: boolean;
}
export interface ReaderPage { kind: 'verse' | 'sacred' | 'research'; items: ReaderItem[] }

export const UNFILED_NOTEBOOK = 'nb_unfiled';
export const UNFILED_SECTION = 'sec_unfiled';
export const PALETTE = ['#00DAF3', '#FF8C00', '#D40055', '#06D6A0', '#7a2bd6', '#F59E0B', '#3B82F6', '#e23b6d'];

/** Notebooks created for each subject the first time a student takes notes in it. */
export const SUBJECT_NOTEBOOKS: Array<{ id: string; title: string; emoji: string; color: string }> = [
  { id: 'nb_math', title: 'Math', emoji: '🔢', color: '#3B82F6' },
  { id: 'nb_science', title: 'Science', emoji: '🧪', color: '#06D6A0' },
  { id: 'nb_humanities', title: 'History & Civics', emoji: '🏛️', color: '#FF8C00' },
  { id: 'nb_literacy', title: 'Reading & Writing', emoji: '📖', color: '#D40055' },
  { id: 'nb_arts', title: 'Arts & Media', emoji: '🎨', color: '#7a2bd6' },
  { id: 'nb_money', title: 'Money & Business', emoji: '💰', color: '#F59E0B' },
  { id: 'nb_labs', title: 'Labs & Investigations', emoji: '🔬', color: '#00DAF3' },
];

/** Map a Learn-map subject (or a course) to the notebook where its notes belong. */
export function notebookForSubject(subjectId: string): string {
  switch (subjectId) {
    case 'math': case 'connected': return 'nb_math';
    case 'science': return 'nb_science';
    case 'humanities': case 'sport': case 'museums': return 'nb_humanities';
    case 'literacy': return 'nb_literacy';
    case 'arts': return 'nb_arts';
    case 'economics': return 'nb_money';
    default: return UNFILED_NOTEBOOK;
  }
}

type Entry = Record<string, any>;
const isNotebook = (e: Entry) => e.type === 'NOTEBOOK';
const isSection = (e: Entry) => e.type === 'SECTION';
const isPage = (e: Entry) => e.type === 'PAGE';

export interface Structure { notebooks: NotebookMeta[]; sections: SectionMeta[]; pages: PageMeta[] }

/** Turn raw notebook entries into the notebook / section / page tree. */
export function entriesToStructure(entries: Entry[]): Structure {
  const notebooks: NotebookMeta[] = [{ id: UNFILED_NOTEBOOK, title: 'Quick notes', color: '#94a3b8', emoji: '🗒️', order: -1 }];
  const sections: SectionMeta[] = [{ id: UNFILED_SECTION, notebookId: UNFILED_NOTEBOOK, title: 'Unfiled', color: '#94a3b8', order: 0 }];
  const pages: PageMeta[] = [];
  for (const e of entries) {
    if (isNotebook(e)) notebooks.push({ id: e.id, title: e.title || 'Notebook', color: e.color || PALETTE[0], emoji: e.emoji || '📓', order: e.order ?? 0 });
    else if (isSection(e)) sections.push({ id: e.id, notebookId: e.notebookId || UNFILED_NOTEBOOK, title: e.title || 'Section', color: e.color || PALETTE[1], order: e.order ?? 0 });
  }
  const sectionIds = new Set(sections.map(s => s.id));
  for (const e of entries) {
    if (isNotebook(e) || isSection(e)) continue;
    const page = isPage(e);
    const sectionId = page && sectionIds.has(e.sectionId) ? e.sectionId : UNFILED_SECTION;
    const sec = sections.find(s => s.id === sectionId)!;
    pages.push({
      id: e.id, notebookId: page ? (e.notebookId || sec.notebookId) : UNFILED_NOTEBOOK, sectionId, title: e.title || 'Untitled page', template: (e.template as PageTemplate) || 'lined',
      telaDocId: e.telaDocId, text: page ? (e.text || '') : String(e.content || ''), tags: Array.isArray(e.tags) ? e.tags : [], pinned: !!(e.pinned ?? e.isPinned),
      legacy: !page, createdAt: e.createdAt ?? 0, updatedAt: e.updatedAt ?? e.createdAt ?? 0, order: e.order ?? 0, source: e.source,
    });
  }
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
  return { notebooks: notebooks.sort(byOrder), sections: sections.sort(byOrder), pages: pages.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt) };
}

/** Search across titles, text and tags; every word must match (case-insensitive). */
export function searchPages(pages: PageMeta[], query: string): PageMeta[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pages;
  return pages.filter(p => { const hay = `${p.title} ${p.text} ${p.tags.join(' ')}`.toLowerCase(); return words.every(w => hay.includes(w)); });
}

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Plain text of a page (its typed text and any text recognised from ink), for search and previews. */
export function plainTextOf(doc: TelaDoc, inkText = ''): string {
  const parts: string[] = [];
  for (const f of doc.frames) for (const id of f.deviceIds) {
    const d = doc.devices[id];
    if (d?.type === 'WRITER') parts.push(...d.blocks.map(b => strip(b.text)));
    else if (d?.type === 'GRID') parts.push(...Object.values(d.cells).filter(Boolean));
  }
  if (inkText) parts.push(inkText);
  return parts.filter(Boolean).join(' ').slice(0, 20000);
}

const newId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
export const newPageId = () => newId('page');
export const newNoteId = newId;

const block = (kind: TelaBlock['kind'], text: string): TelaBlock => ({ id: newId('blk'), kind, text });

export interface PageDocOptions { ownerId: string; title: string; template: PageTemplate; heading?: string; lines?: string[] }

/**
 * A fresh page: one page frame holding the ink layer (a Tela VECTOR device), plus an optional
 * heading text container. Typed boxes, images and tables are added as further frames.
 */
export function makePageDoc(o: PageDocOptions): TelaDoc {
  const now = Date.now(); const inkId = newId('ink');
  const ink: TelaVectorDevice = { id: inkId, type: 'VECTOR', name: 'Ink', width: PAGE_W, height: PAGE_H, objects: [] };
  const pageFrame: TelaFrame = { id: newId('frame'), kind: 'BOARD', preset: 'FREE', x: 0, y: 0, w: PAGE_W, h: PAGE_H, deviceIds: [inkId], label: 'Ink layer' };
  const devices: TelaDoc['devices'] = { [inkId]: ink };
  const frames: TelaFrame[] = [pageFrame];
  if (o.heading || o.lines?.length) {
    const wid = newId('writer');
    const w: TelaWriterDevice = { id: wid, type: 'WRITER', blocks: [...(o.heading ? [block('h1', o.heading)] : []), ...(o.lines || []).map(l => block('p', l))], mode: 'NOTES' };
    devices[wid] = w;
    frames.push({ id: newId('frame'), kind: 'BOARD', preset: 'FREE', x: o.template === 'cornell' ? 40 : 56, y: 40, w: PAGE_W - (o.template === 'cornell' ? 80 : 112), h: 110, deviceIds: [wid], label: 'Text' });
  }
  return { id: newId('tela_page'), ownerId: o.ownerId, title: o.title, createdAt: now, updatedAt: now, bindings: [], frames, devices } as TelaDoc;
}

/** The ink device of a page (the first VECTOR device), where strokes live as PATH objects. */
export function inkDeviceOf(doc: TelaDoc): TelaVectorDevice | null {
  for (const f of doc.frames) for (const id of f.deviceIds) { const d = doc.devices[id]; if (d?.type === 'VECTOR') return d; }
  return null;
}
export function inkFrameOf(doc: TelaDoc): TelaFrame | null { return doc.frames.find(f => f.deviceIds.some(id => doc.devices[id]?.type === 'VECTOR')) || null; }

/** CSS background for a template (drawn behind the page, never part of the document). */
export function templateBackground(t: PageTemplate): { backgroundImage: string; backgroundSize: string; backgroundPosition?: string } {
  const line = 'rgba(80,110,170,0.22)', dot = 'rgba(80,110,170,0.45)';
  switch (t) {
    case 'lined': return { backgroundImage: `linear-gradient(to bottom, transparent 31px, ${line} 32px)`, backgroundSize: '100% 32px', backgroundPosition: '0 24px' };
    case 'grid': return { backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: '28px 28px' };
    case 'math': return { backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: '40px 40px' };
    case 'dots': return { backgroundImage: `radial-gradient(circle, ${dot} 1.2px, transparent 1.6px)`, backgroundSize: '28px 28px', backgroundPosition: '14px 14px' };
    case 'cornell': return { backgroundImage: `linear-gradient(to right, transparent 238px, rgba(214,60,90,0.5) 239px, transparent 240px), linear-gradient(to bottom, transparent 31px, ${line} 32px), linear-gradient(to bottom, transparent 1000px, rgba(214,60,90,0.5) 1001px, transparent 1002px)`, backgroundSize: '100% 100%, 100% 32px, 100% 100%' };
    case 'handwriting': return { backgroundImage: `linear-gradient(to bottom, rgba(80,110,170,0.35) 1px, transparent 2px), repeating-linear-gradient(to right, rgba(80,110,170,0.28) 0 6px, transparent 6px 12px)`, backgroundSize: '100% 56px, 100% 1px', backgroundPosition: '0 14px, 0 42px' };
    case 'music': return { backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 14px, rgba(40,40,60,0.55) 14px 15px)`, backgroundSize: '100% 150px', backgroundPosition: '0 30px' };
    default: return { backgroundImage: 'none', backgroundSize: 'auto' };
  }
}
