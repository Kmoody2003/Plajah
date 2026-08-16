// Persist a track's sample-clearance terms. A clearance is the owner's rights record for how their
// track may be sampled; it's stored per-clearance and keyed to the source track + owner so the
// listener "Sample this" flow (and the payout rail) can resolve the terms later.

import { db, auth } from '../../backendService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import type { SampleClearance } from './clearance';

const stripUndefined = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));

/** Save the owner's sampling terms. Owner-scoped; no-op signed out. */
export async function saveClearance(c: SampleClearance): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  try {
    await setDoc(doc(db, 'sampleClearances', c.id), stripUndefined({ ...c, ownerId: c.ownerId || uid, updatedAt: Date.now() }), { merge: true });
    // A per-track pointer so the listener flow can find the active clearance by track id.
    await setDoc(doc(db, 'sampleClearanceByTrack', c.sourceTrackId), { clearanceId: c.id, ownerId: c.ownerId || uid, updatedAt: Date.now() }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a track's active clearance (for the listener "Sample this" flow). */
export async function getClearanceForTrack(trackId: string): Promise<SampleClearance | null> {
  try {
    const ptr = await getDoc(doc(db, 'sampleClearanceByTrack', trackId));
    const id = ptr.exists() ? (ptr.data() as { clearanceId?: string }).clearanceId : null;
    if (!id) return null;
    const snap = await getDoc(doc(db, 'sampleClearances', id));
    return snap.exists() ? (snap.data() as SampleClearance) : null;
  } catch {
    return null;
  }
}
