// Melos Beats — groove persistence in the Melos production model (melosProductions/{prodId}/
// grooves/{grooveId}). Standalone launches use a per-user scratch production with a
// DETERMINISTIC id (`scratch_{uid}`) so it's found without a query and created lazily; opening
// Beats from the Melos workspace later just passes a real prodId instead. Firestore gotchas
// honored: undefined fields stripped before write, no where+orderBy composite (sort in JS).

import { db, auth } from '../../firebase';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { createProduction, fetchProduction } from '../../melosService';
import { serializeGroove, deserializeGroove, type GrooveDoc } from './grooveDoc';

const grooveRef = (prodId: string, grooveId: string) => doc(db, 'melosProductions', prodId, 'grooves', grooveId);

export interface GrooveSummary { id: string; name: string; bpm: number; updatedAt: number }

/** The signed-in user's scratch production id, creating the production doc on first use. */
export async function ensureScratchProduction(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const prodId = `scratch_${user.uid}`;
  const existing = await fetchProduction(prodId);
  if (!existing) {
    await createProduction(user.uid, { id: prodId, title: 'My Grooves', workingTitle: 'Beats scratch space' });
  }
  return prodId;
}

export async function saveGroove(prodId: string, docData: GrooveDoc): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    if (!docData.ownerId) docData.ownerId = user.uid;
    await setDoc(grooveRef(prodId, docData.id), serializeGroove(docData), { merge: true });
    return true;
  } catch (e) {
    console.warn('[beats] groove save failed', e);
    return false;
  }
}

export async function loadGroove(prodId: string, grooveId: string): Promise<GrooveDoc | null> {
  try {
    const snap = await getDoc(grooveRef(prodId, grooveId));
    return snap.exists() ? deserializeGroove(snap.data()) : null;
  } catch { return null; }
}

export async function listGrooves(prodId: string): Promise<GrooveSummary[]> {
  try {
    const snap = await getDocs(collection(db, 'melosProductions', prodId, 'grooves'));
    return snap.docs
      .map((d) => {
        const g = d.data() as GrooveDoc;
        return { id: g.id || d.id, name: g.name || 'Groove', bpm: g.bpm || 120, updatedAt: g.updatedAt || 0 };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export async function deleteGroove(prodId: string, grooveId: string): Promise<void> {
  try { await deleteDoc(grooveRef(prodId, grooveId)); } catch { /* best-effort */ }
}
