/**
 * Storage glue for Plajah Notes. Structure entries live in the user's notebook (the same store as
 * every other Plajah note: this device always, the signed-in account's Firestore notebook too).
 * Page bodies are Tela documents (OPFS-first, with a Firestore manifest) via telaStore.
 */
import { loadNotebook, putEntry, deleteEntry, type SyncableEntry } from './notebookService';
import { saveTelaDoc, loadTelaDoc, deleteTelaDoc } from './telaStore';
import {
  entriesToStructure, makePageDoc, newNoteId, newPageId, plainTextOf, notebookForSubject, SUBJECT_NOTEBOOKS, UNFILED_NOTEBOOK, UNFILED_SECTION, PALETTE,
  type PageMeta, type PageTemplate, type Structure,
} from './notesStructure';
import type { TelaDoc } from '../types';

export const generalKey = (uid?: string) => `plajahNotebook_${uid || 'guest'}`;
export const labsKey = (uid?: string) => `labsNotebook_${uid || 'guest'}`;

type Entry = SyncableEntry;
const readLocal = (key: string): Entry[] => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
function upsertLocal(key: string, entry: Entry) {
  const list = readLocal(key).filter(e => e.id !== entry.id);
  try { localStorage.setItem(key, JSON.stringify([entry, ...list].slice(0, 800))); } catch { /* quota */ }
}
function removeLocal(key: string, id: string) { try { localStorage.setItem(key, JSON.stringify(readLocal(key).filter(e => e.id !== id))); } catch { /* */ } }

export interface LoadedNotes extends Structure { bucketOf: (entryId: string) => string }

/** Load the general notebook and the Labs notebook together; each entry remembers where it lives. */
export async function loadNotes(uid?: string): Promise<LoadedNotes> {
  const [gk, lk] = [generalKey(uid), labsKey(uid)];
  const [general, labs] = await Promise.all([loadNotebook(gk).catch(() => readLocal(gk)), loadNotebook(lk).catch(() => readLocal(lk))]);
  const bucket = new Map<string, string>();
  general.forEach(e => bucket.set(e.id, gk)); labs.forEach(e => { if (!bucket.has(e.id)) bucket.set(e.id, lk); });
  // Labs entries (experiments, observations) appear in the Labs notebook section.
  const labsTagged = labs.map(e => (e.type === 'PAGE' || e.type === 'NOTEBOOK' || e.type === 'SECTION' ? e : { ...e, notebookId: 'nb_labs', sectionId: 'sec_labs' }));
  const withLabs = [...general, ...labsTagged];
  const s = entriesToStructure(withLabs);
  // Surface the Labs notebook as its own notebook + section when it has entries.
  if (labs.some(e => e.type !== 'PAGE') && !s.notebooks.some(n => n.id === 'nb_labs')) {
    const subj = SUBJECT_NOTEBOOKS.find(n => n.id === 'nb_labs')!;
    s.notebooks.push({ id: 'nb_labs', title: subj.title, color: subj.color, emoji: subj.emoji, order: 99 });
    s.sections.push({ id: 'sec_labs', notebookId: 'nb_labs', title: 'Experiments & observations', color: '#00DAF3', order: 0 });
    s.pages.forEach(p => { if (p.legacy && bucket.get(p.id) === lk) { p.notebookId = 'nb_labs'; p.sectionId = 'sec_labs'; } });
  }
  return { ...s, bucketOf: id => bucket.get(id) || gk };
}

async function save(uid: string | undefined, entry: Entry, key = generalKey(uid)) { upsertLocal(key, entry); await putEntry(key, entry); }

export async function createNotebook(uid: string | undefined, title: string, emoji = '📓', color = PALETTE[0]) {
  const e = { id: newNoteId('nb'), type: 'NOTEBOOK', title, emoji, color, order: Date.now() % 100000, createdAt: Date.now(), updatedAt: Date.now() }; await save(uid, e); return e.id;
}
/** Make sure a subject notebook (and a first section) exists, returning ids to file a page in. */
export async function ensureSubjectNotebook(uid: string | undefined, notebookId: string, notes: Structure): Promise<{ notebookId: string; sectionId: string }> {
  if (notebookId === UNFILED_NOTEBOOK) return { notebookId, sectionId: UNFILED_SECTION };
  const subj = SUBJECT_NOTEBOOKS.find(n => n.id === notebookId);
  if (subj && !notes.notebooks.some(n => n.id === notebookId)) await save(uid, { id: subj.id, type: 'NOTEBOOK', title: subj.title, emoji: subj.emoji, color: subj.color, order: SUBJECT_NOTEBOOKS.indexOf(subj), createdAt: Date.now(), updatedAt: Date.now() });
  const existing = notes.sections.find(s => s.notebookId === notebookId);
  if (existing) return { notebookId, sectionId: existing.id };
  const secId = `sec_${notebookId}_notes`;
  await save(uid, { id: secId, type: 'SECTION', notebookId, title: 'Notes', color: subj?.color || PALETTE[1], order: 0, createdAt: Date.now(), updatedAt: Date.now() });
  return { notebookId, sectionId: secId };
}
export async function createSection(uid: string | undefined, notebookId: string, title: string, color = PALETTE[1]) {
  const e = { id: newNoteId('sec'), type: 'SECTION', notebookId, title, color, order: Date.now() % 100000, createdAt: Date.now(), updatedAt: Date.now() }; await save(uid, e); return e.id;
}
export async function renameEntry(uid: string | undefined, bucketKey: string, entry: Entry, title: string) { await save(uid, { ...entry, title, updatedAt: Date.now() }, bucketKey); }

export interface NewPage { notebookId: string; sectionId: string; title: string; template: PageTemplate; heading?: string; lines?: string[]; source?: PageMeta['source']; tags?: string[] }
/** Create a page: its Tela body document, and the notebook entry that files it. */
export async function createPage(uid: string | undefined, p: NewPage): Promise<{ page: PageMeta; doc: TelaDoc }> {
  const doc = makePageDoc({ ownerId: uid || 'guest', title: p.title, template: p.template, heading: p.heading, lines: p.lines });
  await saveTelaDoc(doc);
  const now = Date.now(); const id = newPageId();
  const entry = { id, type: 'PAGE', title: p.title, notebookId: p.notebookId, sectionId: p.sectionId, template: p.template, telaDocId: doc.id, text: plainTextOf(doc), tags: p.tags || [], order: 0, createdAt: now, updatedAt: now, ...(p.source ? { source: p.source } : {}) };
  await save(uid, entry);
  const meta: PageMeta = { id, notebookId: p.notebookId, sectionId: p.sectionId, title: p.title, template: p.template, telaDocId: doc.id, text: entry.text, tags: entry.tags, pinned: false, legacy: false, createdAt: now, updatedAt: now, order: 0, source: p.source };
  return { page: meta, doc };
}

/** First open of an older note: give it a Tela body holding its text, and re-file it as a page. */
export async function upgradeLegacy(uid: string | undefined, page: PageMeta, bucketKey: string): Promise<{ page: PageMeta; doc: TelaDoc }> {
  const lines = page.text ? page.text.split(/\n{2,}|\n/).filter(Boolean) : [];
  const doc = makePageDoc({ ownerId: uid || 'guest', title: page.title, template: 'lined', heading: page.title, lines });
  await saveTelaDoc(doc);
  const orig = readLocal(bucketKey).find(e => e.id === page.id) || ({} as Record<string, any>);
  const entry = { ...orig, id: page.id, type: 'PAGE', legacyType: orig.type, title: page.title, notebookId: page.notebookId, sectionId: page.sectionId, template: 'lined', telaDocId: doc.id, text: plainTextOf(doc), tags: page.tags, updatedAt: Date.now(), createdAt: page.createdAt || Date.now() };
  await save(uid, entry, bucketKey);
  return { page: { ...page, legacy: false, telaDocId: doc.id, template: 'lined' }, doc };
}

export const loadPageDoc = (telaDocId?: string) => (telaDocId ? loadTelaDoc(telaDocId) : Promise.resolve(null));

/** Persist an edited page: the Tela body and the searchable text on its notebook entry. */
export async function savePage(uid: string | undefined, page: PageMeta, doc: TelaDoc, bucketKey: string, addInk = ''): Promise<PageMeta> {
  await saveTelaDoc(doc);
  const prev = readLocal(bucketKey).find(e => e.id === page.id) || ({} as Record<string, any>);
  const ink = [String(prev.inkText || ''), addInk].filter(Boolean).join(' ').slice(0, 8000); // text recognised from handwriting, kept so ink stays searchable
  const text = plainTextOf(doc, ink);
  const entry = { ...prev, inkText: ink, id: page.id, type: 'PAGE', title: doc.title || page.title, notebookId: page.notebookId, sectionId: page.sectionId, template: page.template, telaDocId: page.telaDocId, text, tags: page.tags, pinned: page.pinned, order: page.order, updatedAt: Date.now(), createdAt: page.createdAt || Date.now(), ...(page.source ? { source: page.source } : {}) };
  await save(uid, entry, bucketKey);
  return { ...page, title: entry.title, text, updatedAt: entry.updatedAt };
}

export async function updatePageMeta(uid: string | undefined, page: PageMeta, bucketKey: string, patch: Partial<Pick<PageMeta, 'title' | 'tags' | 'pinned' | 'template' | 'sectionId' | 'notebookId'>>): Promise<PageMeta> {
  const next = { ...page, ...patch };
  const orig = readLocal(bucketKey).find(e => e.id === page.id) || ({} as Record<string, any>);
  await save(uid, { ...orig, id: page.id, type: orig.type === 'PAGE' ? 'PAGE' : orig.type, title: next.title, tags: next.tags, pinned: next.pinned, isPinned: next.pinned, template: next.template, sectionId: next.sectionId, notebookId: next.notebookId, updatedAt: Date.now() }, bucketKey);
  return { ...next, updatedAt: Date.now() };
}

export async function deletePage(uid: string | undefined, page: PageMeta, bucketKey: string) {
  removeLocal(bucketKey, page.id); await deleteEntry(bucketKey, page.id);
  if (page.telaDocId) { try { await deleteTelaDoc(page.telaDocId); } catch { /* non-fatal */ } }
}

// ── Hand-offs from other parts of Academia ─────────────────────────────────────────────────────
export interface NotesIntent { kind: 'lesson'; courseId: string; lessonId: string; title: string; courseTitle: string; subject: string; body: string }
const INTENT_KEY = 'plajah:notesIntent';
/** Ask Notes to start a page for a lesson; the Notes screen reads this once when it opens. */
export function queueLessonNotes(i: NotesIntent) {
  try { sessionStorage.setItem(INTENT_KEY, JSON.stringify(i)); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent('OPEN_NOTES')); } catch { /* non-browser */ }
}
export function takeNotesIntent(): NotesIntent | null {
  try { const r = sessionStorage.getItem(INTENT_KEY); if (!r) return null; sessionStorage.removeItem(INTENT_KEY); return JSON.parse(r); } catch { return null; }
}
export { notebookForSubject };
