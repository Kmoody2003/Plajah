// ─── Notebook sync ────────────────────────────────────────────────────────────
// Makes the research notebook follow the user's account instead of living only in
// one browser's localStorage. Entries are the system of record in Firestore at
// users/{uid}/notebook/{entryId}; localStorage stays as an instant, offline-first
// cache (and the only store for signed-out guests). Load merges both by id
// (newest updatedAt wins), so a user sees the same notebook on every device.

import { db, auth } from './firebase';
import { collection, doc, getDocs, query, where, setDoc, deleteDoc } from 'firebase/firestore';

// A notebook entry (mirrors the shape in components/LabsNotebook). Kept loose on
// purpose — this service is agnostic to the exact fields and just round-trips them.
export interface SyncableEntry {
  id: string;
  updatedAt?: number;
  createdAt?: number;
  [k: string]: any;
}

// storageKey looks like `labsNotebook_<uid>` / `plajahNotebook_<uid>`; the bucket
// is the part before the trailing `_<uid-or-guest>`, so a user's Labs vs. general
// notebooks stay distinct while each syncs on its own.
function bucketOf(storageKey: string): string {
  const i = storageKey.lastIndexOf('_');
  return i > 0 ? storageKey.slice(0, i) : storageKey;
}

// Firestore rejects writes containing `undefined`. Deep-strip before persisting.
function stripUndefined(v: any): any {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      out[k] = stripUndefined(val);
    }
    return out;
  }
  return v;
}

function readLocal(storageKey: string): SyncableEntry[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
}
function writeLocal(storageKey: string, entries: SyncableEntry[]): void {
  try { localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 500))); } catch { /* quota */ }
}

/**
 * Load the notebook for this storageKey: merge the signed-in user's Firestore
 * entries with the local cache (newest updatedAt wins), refresh the local cache,
 * and return the unified list (newest first). Falls back to local-only for guests
 * or on any network error, so it always resolves with something usable.
 */
export async function loadNotebook(storageKey: string): Promise<SyncableEntry[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return sortEntries(readLocal(storageKey));

  let remote: SyncableEntry[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'notebook'), where('bucket', '==', bucketOf(storageKey))));
    remote = snap.docs.map(d => { const { bucket, ...rest } = d.data() as any; return rest as SyncableEntry; });
  } catch { /* offline / rules — fall back to local */ }

  // Read local AFTER the remote round-trip so entries created mid-fetch aren't lost.
  const local = readLocal(storageKey);
  const byId = new Map<string, SyncableEntry>();
  for (const e of local) if (e?.id) byId.set(e.id, e);
  for (const e of remote) {
    if (!e?.id) continue;
    const prev = byId.get(e.id);
    if (!prev || (e.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) byId.set(e.id, e);
  }
  const merged = sortEntries([...byId.values()]);
  writeLocal(storageKey, merged);
  return merged;
}

function sortEntries(entries: SyncableEntry[]): SyncableEntry[] {
  return [...entries].sort((a, b) =>
    (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) ||
    (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0));
}

/** Upsert one entry to the signed-in user's Firestore notebook (no-op for guests). */
export async function putEntry(storageKey: string, entry: SyncableEntry): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !entry?.id) return;
  try {
    await setDoc(doc(db, 'users', uid, 'notebook', entry.id), stripUndefined({ ...entry, bucket: bucketOf(storageKey) }), { merge: true });
  } catch { /* stays in localStorage; will sync on next successful write/load */ }
}

/** Remove one entry from the user's Firestore notebook (no-op for guests). */
export async function deleteEntry(storageKey: string, id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !id) return;
  try { await deleteDoc(doc(db, 'users', uid, 'notebook', id)); } catch { /* non-fatal */ }
}
