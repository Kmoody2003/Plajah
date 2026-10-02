import { db, auth } from '../firebase';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import type { ThesaCard, ThesaStashEntry } from './types';
import { stash, unstash, annotate, mergeStash, liveEntries } from './stashModel';

/**
 * A person's Thesa. localStorage is the instant, offline-first cache (and the only store for signed-out
 * guests); `users/{uid}/thesa_stash/{cardId}` is the system of record for signed-in users. Same shape as
 * notebookService, with tombstones instead of deletes so a removal propagates to every device.
 *
 * Owner-only in firestore.rules. Nothing here is read by ranking, ads or recommendations.
 */

const localKey = () => `thesa_stash_${auth.currentUser?.uid ?? 'guest'}`;

// Firestore rejects `undefined`; deep-strip before writing.
function stripUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndefined) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (val !== undefined) out[k] = stripUndefined(val);
    return out as T;
  }
  return v;
}

const readLocal = (): ThesaStashEntry[] => { try { return JSON.parse(localStorage.getItem(localKey()) || '[]'); } catch { return []; } };
const writeLocal = (e: ThesaStashEntry[]) => { try { localStorage.setItem(localKey(), JSON.stringify(e.slice(0, 1000))); } catch { /* quota */ } };

async function push(entry: ThesaStashEntry): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try { await setDoc(doc(db, 'users', uid, 'thesa_stash', entry.cardId), stripUndefined(entry)); } catch { /* stays local; syncs on next load */ }
}

/** Load the stash: merge Firestore with the local cache, refresh the cache, return everything (incl. tombstones). */
export async function loadStash(): Promise<ThesaStashEntry[]> {
  const uid = auth.currentUser?.uid;
  let remote: ThesaStashEntry[] = [];
  if (uid) {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'thesa_stash'));
      remote = snap.docs.map(d => d.data() as ThesaStashEntry);
    } catch { /* offline / rules — local only */ }
  }
  const merged = mergeStash(readLocal(), remote);
  writeLocal(merged);
  return merged;
}

/** Apply a pure change, cache it, and write through only the entry that changed. */
async function commit(change: (e: ThesaStashEntry[]) => ThesaStashEntry[], cardId: string): Promise<ThesaStashEntry[]> {
  const before = readLocal();
  const after = change(before);
  writeLocal(after);
  const changed = after.find(e => e.cardId === cardId);
  if (changed && changed !== before.find(e => e.cardId === cardId)) await push(changed);
  return after;
}

export const stashCard = (card: ThesaCard) => commit(e => stash(e, card), card.id);
export const unstashCard = (cardId: string) => commit(e => unstash(e, cardId), cardId);
export const annotateCard = (cardId: string, note: string) => commit(e => annotate(e, cardId, note), cardId);

/** Convenience for the "Your Thesa" view. */
export const loadLiveStash = async () => liveEntries(await loadStash());
