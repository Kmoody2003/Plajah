// licenseRequests — sync-license negotiation for tracks an artist hasn't priced yet.
// A Fabula filmmaker requests a license (with a brief description of the use); the
// track's owner responds APPROVED (they set a price → the track becomes licensable
// at that fee) or DENIED. Collection: `licenseRequests`.
import { collection, doc, setDoc, updateDoc, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { fetchAlbumById, updateAlbum, createNotification } from './backendService';
import type { SyncLicenseRequest } from '../types';
import type { MusicBinTrack } from './fabulaMusic';

const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? undefined : v)));

/** Filmmaker asks the owner to license a track (with a use description). */
export async function createLicenseRequest(opts: {
  track: MusicBinTrack; editId?: string; editTitle?: string; description: string;
}): Promise<SyncLicenseRequest | null> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in to request a license.');
  const { track, editId, editTitle, description } = opts;
  if (!track.rightsOwnerId || !track.albumId) throw new Error('This track can’t be requested (missing owner/album).');
  const ref = doc(collection(db, 'licenseRequests'));
  const req: SyncLicenseRequest = {
    id: ref.id,
    requesterUid: u.uid,
    requesterName: u.displayName || 'A filmmaker',
    ownerUid: track.rightsOwnerId,
    trackId: track.id,
    albumId: track.albumId,
    trackTitle: track.title,
    artist: track.artist,
    cover: track.cover,
    editId, editTitle,
    description: description.trim().slice(0, 800),
    status: 'PENDING',
    createdAt: Date.now(),
  };
  await setDoc(ref, clean(req));
  return req;
}

/** Requests I've made (to show status in the store). */
export async function listMyLicenseRequests(requesterUid: string): Promise<SyncLicenseRequest[]> {
  if (!requesterUid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'licenseRequests'), where('requesterUid', '==', requesterUid)));
    return snap.docs.map(d => d.data() as SyncLicenseRequest).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/** Requests awaiting MY response (as a track owner). */
export async function listIncomingLicenseRequests(ownerUid: string): Promise<SyncLicenseRequest[]> {
  if (!ownerUid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'licenseRequests'), where('ownerUid', '==', ownerUid)));
    return snap.docs.map(d => d.data() as SyncLicenseRequest).sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/**
 * Owner responds. APPROVED → set a price: the track's syncLicenseFee/terms are written
 * onto the album so it becomes licensable (the requester, and anyone, can then license
 * it via the normal checkout). DENIED → just close the request.
 */
export async function respondToLicenseRequest(
  req: SyncLicenseRequest,
  decision: 'APPROVED' | 'DENIED',
  opts: { priceUsd?: number; terms?: string; note?: string } = {},
): Promise<void> {
  const u = auth.currentUser;
  if (!u || u.uid !== req.ownerUid) throw new Error('Only the track owner can respond.');

  if (decision === 'APPROVED') {
    const price = Math.max(0, Number(opts.priceUsd || 0));
    // Write the price onto the track so the standard sync-license flow can charge it.
    try {
      const album = await fetchAlbumById(req.albumId);
      if (album?.tracks) {
        const tracks = album.tracks.map(t => t.id === req.trackId
          ? { ...t, syncLicenseFee: price, syncLicenseTerms: opts.terms || (t as any).syncLicenseTerms || '' }
          : t);
        await updateAlbum(req.albumId, { tracks } as any);
      }
    } catch (e) { console.warn('[licenseRequests] could not set track fee', e); }
  }

  await updateDoc(doc(db, 'licenseRequests', req.id), clean({
    status: decision,
    priceUsd: decision === 'APPROVED' ? Math.max(0, Number(opts.priceUsd || 0)) : undefined,
    ownerNote: opts.note || undefined,
    respondedAt: Date.now(),
  }));

  // Notify the filmmaker that their request was answered.
  try {
    const price = Math.max(0, Number(opts.priceUsd || 0));
    await createNotification({
      userId: req.requesterUid,
      senderId: u.uid,
      senderName: u.displayName || req.artist || 'The artist',
      senderPhoto: u.photoURL || '',
      type: 'SYSTEM',
      title: decision === 'APPROVED' ? 'Sync license approved' : 'Sync license declined',
      message: decision === 'APPROVED'
        ? `"${req.trackTitle}" is cleared${price ? ` for $${price}` : ''}${req.editTitle ? ` — ready to license for "${req.editTitle}".` : ' — ready to license.'}`
        : `Your request to license "${req.trackTitle}"${req.editTitle ? ` for "${req.editTitle}"` : ''} was declined.`,
      link: 'FABULA',
      targetId: req.editId || req.trackId,
    });
  } catch (e) { console.warn('[licenseRequests] notify failed', e); }
}

export const requestKey = (trackId: string) => `req:${trackId}`;
/** Map of trackId → my latest request, for quick status lookups in the store. */
export function myRequestsByTrack(reqs: SyncLicenseRequest[]): Record<string, SyncLicenseRequest> {
  const out: Record<string, SyncLicenseRequest> = {};
  for (const r of reqs) if (!out[r.trackId]) out[r.trackId] = r; // reqs are newest-first
  return out;
}
