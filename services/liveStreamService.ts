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

import { auth, db, uploadVideo } from './backendService';
import {
  doc, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs,
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
  /** The owner's bound guide channel number, denormalized so the Live Hub can show N.1/N.2 for
   *  live-only accounts without a per-owner meta read. */
  channelNumber?: number;
  /** Opt-in: surface this ON-PLATFORM (Reello) live stream as its OWN live channel in the guide.
   *  Off by default — Reello streams are content that flows to the creator's FAST channel on end. */
  asChannel?: boolean;
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
      ...(typeof input.channelNumber === 'number' ? { channelNumber: input.channelNumber } : {}),
      ...(input.asChannel ? { asChannel: true } : {}),
      timestamp: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    console.warn('[live] discovery publish failed (stream still works):', e);
    return null;
  }
}

export interface SaveRecordingInput {
  blob: Blob;
  title: string;
  description?: string;
  audioOnly?: boolean;
  durationSec?: number;
  isPrivate?: boolean;
}

/**
 * The content flywheel: turn a SessionRecorder blob into a published artifact
 * via the existing uploadVideo pipeline. Video sessions → Reello; audio-only
 * sessions (talk rooms / Spaces) → a podcast-tagged upload. Returns the created
 * media's id/url, or null on failure.
 */
export async function saveSessionRecording(input: SaveRecordingInput): Promise<{ id?: string; url?: string } | null> {
  const { blob, title, audioOnly } = input;
  if (!blob || blob.size < 1000) return null;
  try {
    const ext = audioOnly ? 'webm' : 'webm';
    const file = new File([blob], `${audioOnly ? 'audio' : 'session'}-${Date.now()}.${ext}`, { type: blob.type });
    const media = await uploadVideo({
      file,
      title,
      description: input.description || `Recorded ${new Date().toLocaleDateString()}`,
      isLiveRecording: true,
      isPrivate: input.isPrivate ?? false,
      duration: input.durationSec,
      genre: audioOnly ? 'Podcast' : 'Live',
    } as any);
    return { id: (media as any)?.id, url: (media as any)?.url };
  } catch (e) {
    console.warn('[live] saveSessionRecording failed', e);
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

/**
 * Robust discovery cleanup: mark EVERY still-LIVE discovery mirror for this stream ENDED, by
 * streamId — so a stream still clears from "what's live now" even if the in-memory feedId was lost
 * (publish resolved after end, page reload, etc.). Call alongside endLiveDiscovery on stop.
 */
export async function endLiveDiscoveryByStream(streamId: string): Promise<void> {
  if (!streamId) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'live_feeds'),
      where('streamId', '==', streamId),
      where('status', '==', 'LIVE'),
    ));
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { status: 'ENDED', endedAt: serverTimestamp() })));
  } catch (e) {
    console.warn('[live] discovery end-by-stream failed:', e);
  }
}
