/**
 * followerCount / followingCount reconcile. The client counters are +/-1 increments that drift on
 * approvals, blocks and half-failed batches; the `follows` collection is the source of truth.
 * `POST /api/social/reconcile-counts` (server.ts) recounts and writes absolute values (idempotent).
 * Called lazily (at most daily per user, localStorage-guarded) from safety/approval paths.
 */
import { auth } from './firebase';
import { shouldReconcile } from './socialSafetyCore';

const stampKey = (uid: string) => `plajah.countsReconciledAt.${uid}`;
const readStamp = (uid: string): number | null => {
  try { const v = Number(localStorage.getItem(stampKey(uid))); return v > 0 ? v : null; } catch { return null; }
};
const writeStamp = (uid: string, t: number) => { try { localStorage.setItem(stampKey(uid), String(t)); } catch { /* ignore */ } };

export interface ReconciledCounts { uid: string; followerCount: number; followingCount: number }

/** Always recount now (no daily guard). Returns null on any failure — callers must not depend on it. */
export async function reconcileCountsNow(uid?: string): Promise<ReconciledCounts | null> {
  const u = auth.currentUser;
  if (!u) return null;
  try {
    const token = await u.getIdToken();
    const res = await fetch('/api/social/reconcile-counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(uid && uid !== u.uid ? { uid } : {}),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as ReconciledCounts;
    if (!uid || uid === u.uid) writeStamp(u.uid, Date.now());
    return out;
  } catch { return null; }
}

/** Lazy, at most once a day per user. Fire-and-forget safe. */
export async function reconcileMyCounts(): Promise<ReconciledCounts | null> {
  const u = auth.currentUser;
  if (!u) return null;
  if (!shouldReconcile(readStamp(u.uid), Date.now())) return null;
  writeStamp(u.uid, Date.now()); // stamp first so concurrent callers/tabs don't stampede
  const r = await reconcileCountsNow();
  if (!r) { try { localStorage.removeItem(stampKey(u.uid)); } catch { /* ignore */ } }
  return r;
}
