/**
 * liveStreamService — the single source of truth for live streaming.
 *
 * One pipeline, one collection: `streams/{id}` holds the live doc and all WebRTC
 * signaling subcollections (viewers, viewerCandidates, broadcasterCandidates,
 * chat). The MobileLiveStreamer engine (broadcaster + viewer) reads/writes it.
 *
 * `live_feeds` is NOT a second pipeline anymore — it is a lightweight DISCOVERY
 * MIRROR. When a stream goes live the engine writes one `live_feeds` doc whose
 * `streamId` points back at the `streams` doc, so every "what's live now" list
 * and viewer across the app discovers the same stream and watches it through the
 * one unified viewer. When the stream ends the mirror is marked ENDED.
 *
 * This replaces the former three parallel systems (streams / live_streams /
 * live_feeds-WebRTC) that could not see each other.
 */

import { auth, db } from './backendService';
import {
  doc, collection, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';

export const STREAMS_COLLECTION = 'streams';

/** A viewer link that the unified viewer understands (carries the streams id). */
export const streamWatchUrl = (streamId: string) =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}?stream=${streamId}`;

export interface LiveDiscoveryInput {
  streamId: string;
  title: string;
  ownerName: string;
  ownerPhoto: string;
  /** Optional club scoping for private/club streams. */
  clubId?: string;
  isPublic?: boolean;
}

/**
 * Mirror a live `streams` doc into `live_feeds` for discovery. Satisfies the
 * `isValidLiveFeed` rule (ownerId, ownerName, ownerPhoto, title, url, timestamp).
 * Returns the discovery doc id (pass it to endLiveDiscovery on stop), or null.
 */
export async function publishLiveDiscovery(input: LiveDiscoveryInput): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const ref = await addDoc(collection(db, 'live_feeds'), {
      title: input.title || 'Live Stream',
      url: streamWatchUrl(input.streamId),
      ownerId: user.uid,
      ownerName: input.ownerName || user.displayName || 'Creator',
      ownerPhoto: input.ownerPhoto || user.photoURL || '',
      status: 'LIVE',
      isPublic: input.isPublic ?? true,
      streamId: input.streamId,
      streamSource: 'webrtc',
      ...(input.clubId ? { clubId: input.clubId } : {}),
      timestamp: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.warn('[live] discovery publish failed (stream still works):', e);
    return null;
  }
}

/** Mark a discovery mirror ended so it drops out of "what's live now" lists. */
export async function endLiveDiscovery(feedId: string | null | undefined): Promise<void> {
  if (!feedId) return;
  try {
    await updateDoc(doc(db, 'live_feeds', feedId), {
      status: 'ENDED',
      endedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[live] discovery end failed:', e);
  }
}
