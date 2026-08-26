// tasteService — Chora's per-user music taste signal.
//
// Three reactions on a track: UP (like), DOWN (dislike), LOVE (heart). Stored per-user at
// users/{uid}/trackReactions/{trackId}, so it works uniformly across native Chora tracks, the
// personal library, and Audius (the track id carries the source). From these reactions we derive a
// lightweight TASTE VECTOR (genre + artist affinity) that the recommender (services/musicRecommender)
// reads to bias "up next" and the Daily Mix — hearts/likes boost, dislikes penalize or exclude.
//
// Reactions are few per user, so we aggregate the vector on demand (no fragile rollup write / race).
// A module cache + a 'taste:changed' window event keep the UI in sync without prop drilling.
//
// Named DB is plajah-prod (see services/firebase). Writes avoid `undefined` fields (the named DB
// rejects them) by only including present values.

import { doc, setDoc, deleteDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db, auth } from './backendService';
import type { Track, Album } from '../types';

export type TasteSignal = 'UP' | 'DOWN' | 'LOVE';
export type TasteSource = 'CHORA' | 'AUDIUS' | 'LIBRARY';

export interface TrackReaction {
  trackId: string;
  albumId?: string;
  signal: TasteSignal;
  genre?: string;
  artistId?: string;
  artist?: string;
  title?: string;
  source: TasteSource;
  at: number;
}

export interface TasteVector {
  genres: Record<string, number>;   // genre → weight
  artists: Record<string, number>;  // artistId (or artist name) → weight
  loved: string[];                   // trackIds hearted
  disliked: string[];                // trackIds thumbed-down (excluded from recs)
  count: number;
}

// LOVE counts hardest, DOWN penalizes. These feed the affinity weights.
const WEIGHT: Record<TasteSignal, number> = { LOVE: 3, UP: 1, DOWN: -2 };

const reactionCache = new Map<string, TasteSignal>(); // trackId → signal
let loaded = false;
let loadingUid: string | null = null;
let vectorCache: { uid: string; vec: TasteVector } | null = null;

const uidNow = () => auth.currentUser?.uid || null;

/** Where the track lives, inferred from its id/flags (audius_ / ptrack_ / native). */
export const reactionSource = (track: Pick<Track, 'id' | 'isPersonalMedia'>): TasteSource => {
  const id = track.id || '';
  if (id.startsWith('audius_') || id.startsWith('audius:')) return 'AUDIUS';
  if (id.startsWith('ptrack_') || track.isPersonalMedia) return 'LIBRARY';
  return 'CHORA';
};

/** Load the signed-in user's reactions into the cache (once per session / uid). */
export async function loadMyReactions(): Promise<Map<string, TasteSignal>> {
  const uid = uidNow();
  if (!uid) { reactionCache.clear(); loaded = false; return reactionCache; }
  if (loaded && loadingUid === uid) return reactionCache;
  loadingUid = uid;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'trackReactions'));
    reactionCache.clear();
    snap.forEach(d => { const r = d.data() as TrackReaction; if (r?.signal) reactionCache.set(d.id, r.signal); });
    loaded = true;
  } catch (e) { console.warn('[taste] load failed', e); }
  return reactionCache;
}

/** Synchronous cache read — undefined until loadMyReactions() has run. */
export const getTrackReaction = (trackId: string): TasteSignal | undefined => reactionCache.get(trackId);

/**
 * Set (or toggle off) the reaction for a track. Pass the same signal again, or null, to clear it.
 * Returns the resulting signal (or undefined when cleared).
 */
export async function setTrackReaction(
  track: Track,
  album: Album | null,
  signal: TasteSignal | null,
): Promise<TasteSignal | undefined> {
  const uid = uidNow();
  if (!uid) throw new Error('Sign in to rate music.');
  const ref = doc(db, 'users', uid, 'trackReactions', track.id);
  const prev = reactionCache.get(track.id);
  const next = signal && signal !== prev ? signal : null; // same signal → toggle off

  if (!next) {
    reactionCache.delete(track.id);
    try { await deleteDoc(ref); } catch (e) { console.warn('[taste] clear failed', e); }
  } else {
    reactionCache.set(track.id, next);
    const reaction: TrackReaction = {
      trackId: track.id,
      signal: next,
      source: reactionSource(track),
      at: Date.now(),
    };
    // Only include present values — the named DB rejects `undefined`.
    if (album?.id || track.albumId) reaction.albumId = album?.id || track.albumId!;
    const genre = track.genre || album?.genre; if (genre) reaction.genre = genre;
    const artistId = track.artistId || (album as any)?.ownerId; if (artistId) reaction.artistId = artistId;
    if (track.artist || album?.artist) reaction.artist = track.artist || album!.artist;
    if (track.title) reaction.title = track.title;
    try { await setDoc(ref, reaction); } catch (e) { console.warn('[taste] set failed', e); }
  }
  vectorCache = null; // invalidate derived vector
  try { window.dispatchEvent(new CustomEvent('taste:changed', { detail: { trackId: track.id, signal: next || null } })); } catch { /* */ }
  return next || undefined;
}

/** Aggregate the user's reactions into a taste vector (genre/artist affinity). Cached per uid. */
export async function getTasteVector(): Promise<TasteVector> {
  const uid = uidNow();
  const empty: TasteVector = { genres: {}, artists: {}, loved: [], disliked: [], count: 0 };
  if (!uid) return empty;
  if (vectorCache && vectorCache.uid === uid) return vectorCache.vec;
  const vec: TasteVector = { genres: {}, artists: {}, loved: [], disliked: [], count: 0 };
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'trackReactions'));
    snap.forEach(d => {
      const r = d.data() as TrackReaction;
      if (!r?.signal) return;
      vec.count++;
      const w = WEIGHT[r.signal] ?? 0;
      if (r.genre) vec.genres[r.genre] = (vec.genres[r.genre] || 0) + w;
      if (r.artistId) vec.artists[r.artistId] = (vec.artists[r.artistId] || 0) + w;
      if (r.signal === 'LOVE') vec.loved.push(r.trackId);
      if (r.signal === 'DOWN') vec.disliked.push(r.trackId);
    });
    vectorCache = { uid, vec };
  } catch (e) { console.warn('[taste] vector failed', e); }
  return vec;
}

/** Top-weighted genres/artists (positive only), highest first — seeds for the Daily Mix. */
export function topAffinities(vec: TasteVector): { genres: string[]; artists: string[] } {
  const pos = (rec: Record<string, number>) =>
    Object.entries(rec).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { genres: pos(vec.genres), artists: pos(vec.artists) };
}

/** Reset caches on sign-out / account switch. */
export function resetTasteCaches(): void {
  reactionCache.clear(); loaded = false; loadingUid = null; vectorCache = null;
}
