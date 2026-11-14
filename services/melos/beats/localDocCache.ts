// Offline-first local copies of Chora's documents (grooves + the album master project).
//
// Every edit lands in IndexedDB BEFORE the Firestore save, so a signed-out session, a dropped
// connection or a closed tab never loses work. On open, the local copy and the Firestore copy are
// compared by `updatedAt` and the newer one wins (Firestore stamps its copy at save time, so a
// synced local copy never beats it; only edits made after the last successful save do).
//
// Two tiny databases: full docs, and a summary index so the groove list can show local-only
// grooves without reading every document.

import { createStore, get, set, del, values, type UseStore } from 'idb-keyval';

export type LocalScope = 'groove' | 'master';
/** The production a doc belongs to, or this key while signed out. */
export const LOCAL_PROD = '_local';
/** Copies of docs other people shared with us (collaborator side) — never listed as our own. */
export const GUEST_PROD = '_coedit';

export interface LocalEntry<T> {
  scope: LocalScope;
  prodKey: string;
  id: string;
  doc: T;
  /** The doc's own updatedAt at the time it was written. */
  updatedAt: number;
  /** True once Firestore holds this exact version. */
  synced: boolean;
}

export interface LocalSummary {
  scope: LocalScope;
  prodKey: string;
  id: string;
  name: string;
  bpm?: number;
  updatedAt: number;
  synced: boolean;
}

let docStore: UseStore | null = null;
let indexStore: UseStore | null = null;
const stores = () => {
  if (!docStore) docStore = createStore('chora-local-docs', 'docs');
  if (!indexStore) indexStore = createStore('chora-local-index', 'index');
  return { docStore, indexStore };
};
const hasIdb = () => typeof indexedDB !== 'undefined';
const keyOf = (scope: LocalScope, prodKey: string | null | undefined, id: string) => `${scope}:${prodKey || LOCAL_PROD}:${id}`;

export async function putLocal<T extends { id: string; updatedAt?: number; name?: string; bpm?: number }>(
  scope: LocalScope, prodKey: string | null | undefined, doc: T, synced = false,
): Promise<void> {
  if (!hasIdb()) return;
  const { docStore: ds, indexStore: is } = stores();
  const key = keyOf(scope, prodKey, doc.id);
  // Snapshot NOW: IDB clones at put() time, after an await, by which point the live (mutable)
  // doc may have moved on and no longer match the updatedAt we record.
  let snap: T;
  try { snap = structuredClone(doc); } catch { snap = JSON.parse(JSON.stringify(doc)) as T; }
  const updatedAt = snap.updatedAt || Date.now();
  const entry: LocalEntry<T> = { scope, prodKey: prodKey || LOCAL_PROD, id: snap.id, doc: snap, updatedAt, synced };
  const summary: LocalSummary = { scope, prodKey: entry.prodKey, id: snap.id, name: snap.name || '', bpm: snap.bpm, updatedAt, synced };
  try {
    await set(key, entry, ds);
    await set(key, summary, is);
  } catch (e) {
    console.warn('[chora] local save failed', e);
  }
}

export async function getLocal<T>(scope: LocalScope, prodKey: string | null | undefined, id: string): Promise<LocalEntry<T> | null> {
  if (!hasIdb()) return null;
  try { return (await get<LocalEntry<T>>(keyOf(scope, prodKey, id), stores().docStore)) ?? null; } catch { return null; }
}

/** Flag a version as safely in Firestore (only if the local copy is still that version). */
export async function markSynced(scope: LocalScope, prodKey: string | null | undefined, id: string, updatedAt: number): Promise<void> {
  if (!hasIdb()) return;
  const { docStore: ds, indexStore: is } = stores();
  const key = keyOf(scope, prodKey, id);
  try {
    const e = await get<LocalEntry<unknown>>(key, ds);
    if (!e || e.updatedAt !== updatedAt) return;
    e.synced = true;
    await set(key, e, ds);
    const s = await get<LocalSummary>(key, is);
    if (s) { s.synced = true; await set(key, s, is); }
  } catch { /* best-effort */ }
}

export async function delLocal(scope: LocalScope, prodKey: string | null | undefined, id: string): Promise<void> {
  if (!hasIdb()) return;
  const { docStore: ds, indexStore: is } = stores();
  const key = keyOf(scope, prodKey, id);
  try { await del(key, ds); await del(key, is); } catch { /* best-effort */ }
}

export async function listLocal(scope: LocalScope, prodKeys: Array<string | null | undefined>): Promise<LocalSummary[]> {
  if (!hasIdb()) return [];
  const want = new Set(prodKeys.map((p) => p || LOCAL_PROD));
  try {
    const all = await values<LocalSummary>(stores().indexStore);
    return all.filter((s) => s && s.scope === scope && want.has(s.prodKey));
  } catch { return []; }
}

/**
 * Pick the version to open: the local copy when it's newer than Firestore's (offline / signed-out
 * edits), else Firestore's. `fromLocal` + `!synced` means the caller should push it up.
 */
export function pickNewer<T extends { updatedAt?: number }>(
  local: LocalEntry<T> | null, remote: T | null,
): { doc: T; fromLocal: boolean; unsynced: boolean } | null {
  if (local && (!remote || local.updatedAt > (remote.updatedAt || 0))) {
    return { doc: local.doc, fromLocal: true, unsynced: !local.synced || !remote };
  }
  if (remote) return { doc: remote, fromLocal: false, unsynced: false };
  return null;
}
