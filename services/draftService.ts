/**
 * draftService — composer drafts.
 *
 * Firestore: users/{uid}/drafts/{draftId}  (owner-only; stored as { json, updatedAt })
 * localStorage fallback: `plajah.drafts.{uid}` (JSON array) — used when signed
 * out of Firestore, offline, or if the write fails. Both are written; reads merge
 * by newest updatedAt. The serialised form lives in postingLogic (tested).
 *
 * `AUTOSAVE_ID` is the single rolling slot the composer autosaves into; named
 * drafts ("Save draft") get their own ids.
 */
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { serializeDraft, parseDraft, isDraftMeaningful, type Draft, type DraftData } from './postingLogic';

export const AUTOSAVE_ID = 'autosave';
const MAX_DRAFTS = 25;
const lsKey = (uid: string) => `plajah.drafts.${uid}`;

function readLocal(uid: string): Draft[] {
  try {
    const arr = JSON.parse(localStorage.getItem(lsKey(uid)) || '[]');
    return (Array.isArray(arr) ? arr : []).map((s: string) => parseDraft(s)).filter((d): d is Draft => !!d);
  } catch { return []; }
}

function writeLocal(uid: string, drafts: Draft[]): void {
  try {
    const sorted = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS);
    localStorage.setItem(lsKey(uid), JSON.stringify(sorted.map(d => serializeDraft(d as any, d.id, d.updatedAt))));
  } catch { /* storage unavailable/full — Firestore copy still exists */ }
}

export const newDraftId = () => `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Save (upsert). Empty drafts delete the slot instead. Never throws. */
export async function saveDraft(uid: string, id: string, data: DraftData, now = Date.now()): Promise<void> {
  if (!isDraftMeaningful(data)) { await deleteDraft(uid, id); return; }
  const json = serializeDraft(data as any, id, now);
  const parsed = parseDraft(json)!;
  writeLocal(uid, [parsed, ...readLocal(uid).filter(d => d.id !== id)]);
  try { await setDoc(doc(collection(db, 'users', uid, 'drafts'), id), { json, updatedAt: now }); } catch { /* local copy remains */ }
}

export async function deleteDraft(uid: string, id: string): Promise<void> {
  writeLocal(uid, readLocal(uid).filter(d => d.id !== id));
  try { await deleteDoc(doc(collection(db, 'users', uid, 'drafts'), id)); } catch { /* ignore */ }
}

/** All drafts, newest first (Firestore merged with the local fallback). */
export async function listDrafts(uid: string): Promise<Draft[]> {
  const byId = new Map<string, Draft>();
  for (const d of readLocal(uid)) byId.set(d.id, d);
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'drafts'));
    for (const s of snap.docs) {
      const d = parseDraft((s.data() as any).json);
      if (d && (!byId.has(d.id) || byId.get(d.id)!.updatedAt < d.updatedAt)) byId.set(d.id, d);
    }
  } catch { /* offline: local only */ }
  return [...byId.values()].filter(isDraftMeaningful).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(uid: string, id: string): Promise<Draft | null> {
  return (await listDrafts(uid)).find(d => d.id === id) ?? null;
}
