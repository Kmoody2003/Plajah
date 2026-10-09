// Resumable drafts: nothing the author does is lost.
//
//   local  : IndexedDB (full draft incl. chapter text) with a localStorage meta fallback — instant, offline.
//   cloud  : Firestore users/{uid}/bookDrafts/{id} holds everything EXCEPT chapter bodies (Firestore docs cap at
//            1 MiB); bodies go to Storage users/{uid}/bookDrafts/{id}/manuscript.json. Both are owner-only by rule.
//
// splitForCloud / mergeBodies are pure and tested; the I/O wrappers import firebase lazily so the pure parts
// stay node-runnable.

import type { BookDraft, BookFormatId } from './types';
import { emptyMetadata, emptyPricing } from './preflight';
import { stripUndefinedDeep } from './util';

export const DRAFT_COLLECTION = 'bookDrafts';

export function newDraft(ownerId: string, format: BookFormatId): BookDraft {
  const now = Date.now();
  return {
    id: `bk_${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    ownerId, format, step: 'IMPORT', createdAt: now, updatedAt: now,
    manuscript: null, cover: null, metadata: emptyMetadata(), pricing: emptyPricing(),
    epubFindings: [], accessibilityScore: null, acks: { contentPolicy: false, rights: false },
  };
}

export interface CloudBodies { chapters: { id: string; html: string; text: string }[] }

/** Firestore-safe metadata doc + the heavy chapter bodies to store separately. */
export function splitForCloud(d: BookDraft): { meta: Record<string, unknown>; bodies: CloudBodies } {
  const bodies: CloudBodies = { chapters: (d.manuscript?.chapters ?? []).map(c => ({ id: c.id, html: c.html, text: c.text })) };
  const meta = stripUndefinedDeep({
    ...d,
    manuscript: d.manuscript ? { ...d.manuscript, chapters: d.manuscript.chapters.map(({ html: _h, text: _t, ...rest }) => rest) } : null,
  }) as Record<string, unknown>;
  return { meta, bodies };
}

export function mergeBodies(meta: any, bodies: CloudBodies | null): BookDraft {
  const byId = new Map((bodies?.chapters ?? []).map(c => [c.id, c]));
  const d = { ...meta } as BookDraft;
  if (d.manuscript) d.manuscript = { ...d.manuscript, chapters: (d.manuscript.chapters as any[]).map(c => ({ html: '', text: '', ...c, ...(byId.get(c.id) ?? {}) })) };
  return d;
}

// ── local (IndexedDB) ─────────────────────────────────────────────────────────

const IDB = 'plajah-book-drafts';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await idb();
  return new Promise<T>((res, rej) => { const rq = fn(db.transaction('drafts', mode).objectStore('drafts')); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
};

export async function saveLocal(d: BookDraft): Promise<boolean> {
  try { await tx('readwrite', s => s.put(d)); return true; } catch {
    try { const { manuscript: _m, ...small } = d; localStorage.setItem(`${IDB}:${d.id}`, JSON.stringify(small)); return true; } catch { return false; }
  }
}
export async function loadLocal(id: string): Promise<BookDraft | null> {
  try { return (await tx<BookDraft | undefined>('readonly', s => s.get(id))) ?? null; } catch { return null; }
}
export async function listLocal(ownerId: string): Promise<BookDraft[]> {
  try { return (await tx<BookDraft[]>('readonly', s => s.getAll())).filter(d => d.ownerId === ownerId); } catch { return []; }
}
export async function deleteLocal(id: string): Promise<void> {
  try { await tx('readwrite', s => s.delete(id)); } catch { /* ignore */ }
  try { localStorage.removeItem(`${IDB}:${id}`); } catch { /* ignore */ }
}

// ── cloud ─────────────────────────────────────────────────────────────────────

export async function saveCloud(d: BookDraft): Promise<boolean> {
  try {
    const [{ doc, setDoc }, { ref, uploadBytes }, { db, storage }] = await Promise.all([import('firebase/firestore'), import('firebase/storage'), import('../firebase')]);
    const { meta, bodies } = splitForCloud(d);
    const hasBodies = bodies.chapters.some(c => c.html);
    if (hasBodies) {
      const path = `users/${d.ownerId}/${DRAFT_COLLECTION}/${d.id}/manuscript.json`;
      await uploadBytes(ref(storage, path), new Blob([JSON.stringify(bodies)], { type: 'application/json' }), { contentType: 'application/json' });
      (meta as any).bodiesPath = path;
    }
    await setDoc(doc(db, 'users', d.ownerId, DRAFT_COLLECTION, d.id), { ...meta, updatedAt: Date.now() });
    return true;
  } catch (e) { console.warn('[bookDrafts] cloud save failed (local copy is kept)', e); return false; }
}

export async function loadCloud(ownerId: string, id: string): Promise<BookDraft | null> {
  try {
    const [{ doc, getDoc }, { ref, getDownloadURL }, { db, storage }] = await Promise.all([import('firebase/firestore'), import('firebase/storage'), import('../firebase')]);
    const snap = await getDoc(doc(db, 'users', ownerId, DRAFT_COLLECTION, id));
    if (!snap.exists()) return null;
    const meta = snap.data() as any;
    let bodies: CloudBodies | null = null;
    if (meta.bodiesPath) {
      try { bodies = await (await fetch(await getDownloadURL(ref(storage, meta.bodiesPath)))).json(); } catch { /* metadata-only restore */ }
    }
    return mergeBodies(meta, bodies);
  } catch { return null; }
}

export async function listCloudDrafts(ownerId: string): Promise<Pick<BookDraft, 'id' | 'updatedAt' | 'metadata' | 'format' | 'step' | 'cover'>[]> {
  try {
    const [{ collection, getDocs }, { db }] = await Promise.all([import('firebase/firestore'), import('../firebase')]);
    const snap = await getDocs(collection(db, 'users', ownerId, DRAFT_COLLECTION));
    return snap.docs.map(s => s.data() as any);
  } catch { return []; }
}

export async function deleteDraftEverywhere(ownerId: string, id: string): Promise<void> {
  await deleteLocal(id);
  try {
    const [{ doc, deleteDoc }, { ref, deleteObject }, { db, storage }] = await Promise.all([import('firebase/firestore'), import('firebase/storage'), import('../firebase')]);
    await deleteDoc(doc(db, 'users', ownerId, DRAFT_COLLECTION, id));
    await deleteObject(ref(storage, `users/${ownerId}/${DRAFT_COLLECTION}/${id}/manuscript.json`)).catch(() => {});
  } catch { /* offline: local copy already gone; cloud copy removed next time */ }
}

/** Load the newest of local vs cloud so a different device/browser resumes where the author stopped. */
export async function loadBest(ownerId: string, id: string): Promise<BookDraft | null> {
  const [l, c] = await Promise.all([loadLocal(id), loadCloud(ownerId, id)]);
  if (l && c) return (l.updatedAt >= c.updatedAt ? l : c);
  return l ?? c;
}
