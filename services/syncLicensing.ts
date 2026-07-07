import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { MusicBinTrack } from './fabulaMusic';
import type { SyncLicenseGrant } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Music sync-license marketplace (Slice 2) — client side.
//
// A filmmaker licenses a musician's track for a specific Fabula edit. The fee is
// verified + charged server-side (destination charge → musician's connected
// Stripe account); the grant is written by the Stripe webhook. Here we kick off
// the Checkout and read back which grants the buyer holds. Gated in the UI by
// the CONTENT_LICENSING flag.
// ─────────────────────────────────────────────────────────────────────────

/** Start a sync-license purchase → redirect to Stripe Checkout. */
export async function purchaseSyncLicense(opts: { track: MusicBinTrack; editId: string; editTitle?: string }): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to license this track.');
  const { track, editId, editTitle } = opts;
  if (!track.albumId) throw new Error('This track can’t be licensed here (missing album reference).');
  const token = await u.getIdToken();
  const res = await fetch('/api/stripe/purchase-sync-license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      trackId: track.id,
      albumId: track.albumId,
      rightsOwnerUid: track.rightsOwnerId,
      editId,
      editTitle: editTitle || '',
    }),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `License checkout failed (${res.status})`);
  const { url } = await res.json();
  if (url) window.location.href = url;
}

/** All sync-license grants held by a buyer. */
export async function listMyGrants(buyerUid: string): Promise<SyncLicenseGrant[]> {
  if (!buyerUid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'syncLicenseGrants'), where('buyerUid', '==', buyerUid)));
    return snap.docs.map((d) => d.data() as SyncLicenseGrant);
  } catch {
    return [];
  }
}

export const grantKey = (trackId: string, editId: string): string => `${trackId}::${editId}`;

/** Set of "trackId::editId" keys for fast per-project clearance checks. */
export function grantSet(grants: SyncLicenseGrant[]): Set<string> {
  return new Set(grants.map((g) => grantKey(g.trackId, g.editId)));
}
