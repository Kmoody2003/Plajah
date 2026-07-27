// partyService — the ONE synchronized "party" primitive for the whole platform.
//
// A watch party (movies/video), a read-along (Lorea books) and a Chora listening party are the SAME
// thing: a host presses play/pause/seek/next/turn-page, and everyone in the party follows — but the
// content plays LOCALLY on each viewer's own device, streamed to them by the platform, NOT relayed
// from the host. We broadcast STATE, not media. That means one host can front an unlimited audience
// for the price of a few Firestore writes, and each viewer gets full-quality local playback in sync.
//
// Firestore:
//   parties/{partyId}   Party — identity + content + the host's live `playback` state
// Presence/chat/host-A-V ride the existing rails (usePresence, chat_rooms, rtcCore 'stage').
//
// The follow math lives in the PURE computeFollowTarget() below so it can be unit-tested and reused
// by every surface (VideoPlayer, BookReader, Chora player) — see hooks/useParty.ts for the glue.

import { db, auth } from './backendService';
import {
  doc, setDoc, updateDoc, getDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';

export type PartyKind = 'WATCH' | 'READ' | 'LISTEN';
export type PartyContentType = 'MOVIE' | 'VIDEO' | 'BOOK' | 'ALBUM' | 'TRACK';

export interface PartyContent {
  type: PartyContentType;
  id: string;
  title?: string;
  thumbnail?: string;
  url?: string;
  muxPlaybackId?: string;
  /** total pages (read-along) — lets the UI show progress */
  totalPages?: number;
}

/** The host's live control state. Everyone else's local player is slaved to this. */
export interface PartyPlaybackState {
  isPlaying: boolean;
  /** host playhead in seconds at the moment this state was written (video / audio). */
  positionSec: number;
  /** read-along: the host's current page (0-based or 1-based — the surface decides, just be consistent). */
  currentPage?: number;
  /** listening party: index of the track in the album the host is on. */
  trackIndex?: number;
  /** content id currently loaded (album track id, or the movie/book id) — lets the audience swap item. */
  contentId?: string;
  rate?: number;
  /** server write time (ordering only — the follow math anchors on local receipt, not this). */
  updatedAt?: any;
  /** monotonic client counter so out-of-order snapshots can be ignored. */
  seq: number;
}

export interface Party {
  id: string;
  kind: PartyKind;
  hostId: string;
  hostName?: string;
  hostPhoto?: string;
  content: PartyContent;
  playback: PartyPlaybackState;
  isActive: boolean;
  createdAt: number;
  endedAt?: number;
}

const removeUndefined = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Deterministic party id for a host+content so re-opening resumes the same session (optional helper). */
export const partyIdFor = (hostId: string, contentId: string) => `party_${hostId}_${contentId}`;

export function partyShareUrl(partyId: string): string {
  const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'https://plajah.com';
  return `${base}/?party=${encodeURIComponent(partyId)}`;
}

export interface CreatePartyInput {
  id?: string;
  kind: PartyKind;
  content: PartyContent;
  initial?: Partial<PartyPlaybackState>;
}

/** Host opens a party. Returns the party id. Idempotent on a supplied id (re-hosting resumes it). */
export async function createParty(input: CreatePartyInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to host a party');
  const id = input.id || partyIdFor(user.uid, input.content.id);
  const party: any = removeUndefined({
    id,
    kind: input.kind,
    hostId: user.uid,
    hostName: user.displayName || 'Host',
    hostPhoto: user.photoURL || '',
    content: removeUndefined(input.content as any),
    playback: removeUndefined({
      isPlaying: false,
      positionSec: 0,
      currentPage: input.initial?.currentPage,
      trackIndex: input.initial?.trackIndex,
      contentId: input.initial?.contentId ?? input.content.id,
      seq: 0,
      updatedAt: serverTimestamp(),
    }),
    isActive: true,
    createdAt: Date.now(),
  });
  await setDoc(doc(db, 'parties', id), party, { merge: true });
  return id;
}

export function listenToParty(partyId: string, cb: (party: Party | null) => void): () => void {
  return onSnapshot(
    doc(db, 'parties', partyId),
    snap => cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as Party : null),
    () => cb(null),
  );
}

export async function fetchParty(partyId: string): Promise<Party | null> {
  try {
    const snap = await getDoc(doc(db, 'parties', partyId));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) as Party : null;
  } catch { return null; }
}

/**
 * Host writes a new playback state. `seq` MUST increase so the audience can drop stale snapshots.
 * Callers should throttle rapid scrubs (the hook does) — but always send the FINAL state.
 */
export async function updatePartyPlayback(partyId: string, patch: Partial<PartyPlaybackState>, seq: number): Promise<void> {
  const playback: any = removeUndefined({ ...patch, seq, updatedAt: serverTimestamp() });
  await updateDoc(doc(db, 'parties', partyId), Object.fromEntries(Object.entries(playback).map(([k, v]) => [`playback.${k}`, v])) as any);
}

export async function endParty(partyId: string): Promise<void> {
  try { await updateDoc(doc(db, 'parties', partyId), { isActive: false, endedAt: Date.now() }); } catch { /* */ }
}

// ── The pure follow math (unit-tested) ────────────────────────────────────────────────────────────
//
// The audience anchors on the LOCAL time it received a state, not on any absolute clock — so no
// client-clock sync is needed. While the host is playing, the target playhead advances in real time
// from the received position; a small constant fudge absorbs one-way Firestore propagation latency.

export interface FollowResult { targetPositionSec: number; shouldPlay: boolean }

export function computeFollowTarget(
  playback: Pick<PartyPlaybackState, 'isPlaying' | 'positionSec'> | null | undefined,
  receiptLocalMs: number,
  nowLocalMs: number,
  latencyFudgeSec = 0.4,
): FollowResult {
  if (!playback) return { targetPositionSec: 0, shouldPlay: false };
  const playing = !!playback.isPlaying;
  const elapsed = playing ? Math.max(0, (nowLocalMs - receiptLocalMs) / 1000) : 0;
  const fudge = playing ? latencyFudgeSec : 0;
  return { targetPositionSec: Math.max(0, (playback.positionSec || 0) + elapsed + fudge), shouldPlay: playing };
}

/** Should the local player hard-seek to catch up? Only when it has drifted past the threshold, so we
 *  don't fight the user's own decoder with constant micro-seeks. */
export function shouldResync(localPositionSec: number, targetPositionSec: number, thresholdSec = 1.25): boolean {
  return Math.abs((localPositionSec || 0) - targetPositionSec) > thresholdSec;
}

/** Read a Firestore Timestamp|number|undefined to ms (best-effort; only used for display/ordering). */
export function tsToMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v.toMillis === 'function') return v.toMillis();
  return 0;
}
