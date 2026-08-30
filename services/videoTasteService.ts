// videoTasteService — the per-user VIDEO taste signal, and the real "% Match".
//
// The sibling of services/tasteService (which models music taste from track reactions). Same
// shape deliberately: explicit reactions carry their facets at write time, and the vector is
// aggregated on demand rather than kept as a rollup doc — reactions are few per user, and a
// rollup write would be a race with no payoff.
//
// WHY THIS EXISTS: the Taleo detail page used to show a "% Match" computed as
//   68 + (sum of the title's char codes) % 31
// which is a hash of the title — the same number for every viewer on the platform, unrelated to
// anything they had ever watched. There was no video taste model to back it. This is that model.
//
// TWO KINDS OF SIGNAL feed the vector:
//   - EXPLICIT: thumbs up/down and hearts, at users/{uid}/videoReactions/{videoId}. Strongest,
//     and the only one that can be negative on purpose.
//   - IMPLICIT: watch history. Finishing a film is real evidence you liked it; abandoning one in
//     the first quarter is real evidence you did not. Weaker than a deliberate thumb, and always
//     overridden by an explicit reaction on the same title.
//
// THE HONESTY RULE, same as services/publicStats: when there is not enough signal to say
// anything, matchScore() returns null and the caller shows NO badge. A match percentage derived
// from an empty history is exactly the fabrication this replaces. It is better for a new user to
// see no number than a confident one that means nothing.

import { doc, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { db, auth } from './backendService';
import { loadHistory } from './watchHistoryService';
import type { Video } from '../types';
// The scoring policy — family weights, the confidence gate, matchScore itself — lives in a
// Firebase-free module so it can be tested directly (tests/videoTaste.test.ts). Re-exported here
// so callers still import taste from one place.
import {
  WEIGHT, WEIGHT_COMPLETED, WEIGHT_ABANDONED, ABANDON_RATIO, COMPLETE_RATIO,
  emptyVector, facetsOf, addWeight, matchScore, topVideoAffinities,
  type VideoSignal, type VideoTasteVector, type MatchResult,
} from './videoTasteScoring';

export { matchScore, topVideoAffinities };
export type { VideoSignal, VideoTasteVector, MatchResult };

/**
 * One explicit reaction, stored with the facets it was about.
 *
 * The facets are denormalized on purpose. Deriving the vector otherwise would mean re-fetching
 * every reacted-to video on every load, and a title whose genre is edited later should not
 * retroactively rewrite what the user's taste was when they reacted.
 */
export interface VideoReaction {
  videoId: string;
  signal: VideoSignal;
  genre?: string;
  category?: string;
  creatorId?: string;
  worldId?: string;
  tags?: string[];
  title?: string;
  at: number;
}

const uidNow = () => auth.currentUser?.uid || null;

let vectorCache: { uid: string; vec: VideoTasteVector; at: number } | null = null;
const reactionCache = new Map<string, VideoSignal>();
let reactionsLoadedFor: string | null = null;

// ── Explicit reactions ────────────────────────────────────────────────────────

/** Load this user's reactions into the module cache (once per uid). */
export async function loadMyVideoReactions(): Promise<Map<string, VideoSignal>> {
  const uid = uidNow();
  if (!uid) { reactionCache.clear(); reactionsLoadedFor = null; return reactionCache; }
  if (reactionsLoadedFor === uid) return reactionCache;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'videoReactions'));
    reactionCache.clear();
    snap.forEach(d => {
      const r = d.data() as VideoReaction;
      if (r?.signal) reactionCache.set(d.id, r.signal);
    });
    reactionsLoadedFor = uid;
  } catch (e) {
    console.warn('[videoTaste] load failed', e);
  }
  return reactionCache;
}

/** Synchronous cache read — undefined until loadMyVideoReactions() has run. */
export const getVideoReaction = (videoId: string): VideoSignal | undefined => reactionCache.get(videoId);

/**
 * Record (or clear) a reaction. Passing the signal already set toggles it off, matching how the
 * thumbs behave elsewhere. Returns the resulting signal, or undefined when cleared.
 *
 * `video` must carry the facets — pass the full object, not just an id, or the reaction lands
 * with nothing for the vector to learn from.
 */
export async function setVideoReaction(
  video: Partial<Video> & { id: string },
  signal: VideoSignal | null,
): Promise<VideoSignal | undefined> {
  const uid = uidNow();
  if (!uid) return undefined;                       // signed-out taste is not persisted
  const ref = doc(db, 'users', uid, 'videoReactions', video.id);
  const prev = reactionCache.get(video.id);
  const next = signal && signal !== prev ? signal : null;

  if (!next) {
    reactionCache.delete(video.id);
    try { await deleteDoc(ref); } catch (e) { console.warn('[videoTaste] clear failed', e); }
  } else {
    reactionCache.set(video.id, next);
    const f = facetsOf(video);
    // Only present values are written. Undefined fields throw on the named DB (plajah-prod) —
    // the same trap tasteService documents.
    const reaction: VideoReaction = { videoId: video.id, signal: next, at: Date.now() };
    if (f.genre) reaction.genre = f.genre;
    if (f.category) reaction.category = f.category;
    if (f.creatorId) reaction.creatorId = f.creatorId;
    if (f.worldId) reaction.worldId = f.worldId;
    if (f.tags.length) reaction.tags = f.tags;
    if (video.title) reaction.title = video.title;
    try { await setDoc(ref, reaction); } catch (e) { console.warn('[videoTaste] set failed', e); }
  }

  vectorCache = null;   // the derived vector is now stale
  try {
    window.dispatchEvent(new CustomEvent('videoTaste:changed', { detail: { videoId: video.id, signal: next || null } }));
  } catch { /* non-browser context */ }
  return next || undefined;
}

// ── The vector ────────────────────────────────────────────────────────────────

/**
 * Build the user's video taste vector from explicit reactions plus watch history.
 *
 * Cached per uid until a reaction changes. Watch history is read through
 * watchHistoryService.loadHistory, which already merges Firestore with the local cache, so this
 * works signed-out-to-signed-in without a second source of truth.
 */
export async function getVideoTasteVector(): Promise<VideoTasteVector> {
  const uid = uidNow();
  if (!uid) return emptyVector();
  if (vectorCache && vectorCache.uid === uid) return vectorCache.vec;

  const vec = emptyVector();

  // Explicit reactions first, so the implicit pass can skip titles already spoken for.
  const reacted = new Set<string>();
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'videoReactions'));
    snap.forEach(d => {
      const r = d.data() as VideoReaction;
      if (!r?.signal) return;
      const w = WEIGHT[r.signal] ?? 0;
      reacted.add(r.videoId || d.id);
      vec.count++;
      vec.explicitCount++;
      addWeight(vec.genres, r.genre, w);
      addWeight(vec.categories, r.category, w);
      addWeight(vec.creators, r.creatorId, w);
      addWeight(vec.worlds, r.worldId, w);
      for (const t of r.tags || []) addWeight(vec.tags, t, w / Math.max(1, (r.tags || []).length));
      if (r.signal === 'DOWN') vec.disliked.push(r.videoId || d.id);
    });
  } catch (e) {
    console.warn('[videoTaste] reactions failed', e);
  }

  // Implicit: what they actually watched. The players stamp the same facets onto each watch
  // entry that a reaction carries, so finishing a film teaches the vector as much as a thumb
  // does — just more quietly. Entries written before those facets existed still contribute
  // whatever they have (often just the world), which is why every addWeight here is optional.
  try {
    const history = await loadHistory(200);
    for (const e of history) {
      if (e.kind === 'CHORA') continue;                 // audio belongs to the music vector
      if (reacted.has(e.id)) continue;                  // a deliberate thumb outranks inference
      if (!(e.durationSec > 0)) continue;
      const ratio = e.positionSec / e.durationSec;
      const w = (e.completed || ratio >= COMPLETE_RATIO) ? WEIGHT_COMPLETED
              : ratio < ABANDON_RATIO ? WEIGHT_ABANDONED
              : 0;                                      // the middle is genuinely ambiguous
      if (!w) continue;
      vec.count++;
      addWeight(vec.worlds, e.worldId, w);
      addWeight(vec.genres, e.genre, w);
      addWeight(vec.categories, e.category, w);
      addWeight(vec.creators, e.creatorId, w);
      const tags = e.tags || [];
      for (const t of tags) addWeight(vec.tags, t, w / Math.max(1, tags.length));
    }
  } catch (e) {
    console.warn('[videoTaste] history failed', e);
  }

  vectorCache = { uid, vec, at: Date.now() };
  return vec;
}

/** Convenience: load the vector and score one video in a single call. */
export async function matchScoreFor(video: Partial<Video> | null | undefined): Promise<MatchResult | null> {
  if (!video) return null;
  const vec = await getVideoTasteVector();
  return matchScore(video, vec);
}

/** Reset caches on sign-out / account switch, so one account's taste never scores another's. */
export function resetVideoTasteCaches(): void {
  reactionCache.clear();
  reactionsLoadedFor = null;
  vectorCache = null;
}
