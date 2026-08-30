// ─── Watch History & Continue Watching ────────────────────────────────────────
// One shared progress model for Reello, Taleo and Chora. Firestore is the system
// of record when signed in (users/{uid}/watchHistory/{id}); localStorage is an
// always-works fallback that also seeds an instant, offline-friendly UI. Callers
// should throttle recordProgress (e.g. every ~5s of playback + on pause/unmount).

import { db, auth } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, limit as qlimit } from 'firebase/firestore';
import { upsertWatchNext, removeWatchNext, type WatchNextItem } from './watchNextBridge';

export type WatchKind = 'RELLO' | 'TALEO' | 'CHORA' | 'VIDEO';

export interface WatchEntry {
  id: string;              // the videoId / trackId being watched
  kind: WatchKind;
  title?: string;
  thumbnailUrl?: string;
  ownerName?: string;      // creator/series label for the resume card
  positionSec: number;
  durationSec: number;
  updatedAt: number;
  completed?: boolean;     // watched to (near) the end
  /** Optional grouping for series — resume the series, not just one episode. */
  seriesId?: string;
  worldId?: string;
  // ── Taste facets ───────────────────────────────────────────────────────────
  // Carried so services/videoTasteService can learn from what was actually watched, not just
  // from deliberate thumbs. Without these, finishing a film could only teach the vector about
  // its world; with them it also teaches genre, category, creator and tags. All optional — an
  // entry written before this existed, or by a caller that has only an id, still resumes fine.
  genre?: string;
  category?: string;
  creatorId?: string;
  tags?: string[];
  /**
   * Who watched it. The localStorage cache is shared by everyone who uses this device, so
   * without this an account switch hands the next person the previous person's history — which
   * services/videoTasteService would then score their "% Match" against. Entries written while
   * signed out carry no uid and stay visible to all, which is the right behaviour for a personal
   * device's anonymous history.
   */
  uid?: string;
}

const LS_KEY = 'plajah_watch_history_v1';
const MAX_LOCAL = 200;
// Consider a title "finished" past 92% so it drops out of Continue Watching.
const COMPLETE_RATIO = 0.92;

/** Drop undefined-valued keys — see the note in recordProgress for why this is not optional. */
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function readLocal(): WatchEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

/** Local entries this viewer is entitled to see: their own, plus anything watched signed out. */
function readLocalForViewer(): WatchEntry[] {
  const uid = auth.currentUser?.uid;
  return readLocal().filter(e => !e.uid || e.uid === uid);
}
function writeLocal(entries: WatchEntry[]): void {
  try {
    const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LOCAL);
    localStorage.setItem(LS_KEY, JSON.stringify(sorted));
  } catch { /* quota — non-fatal */ }
}

// Canonical origin: the Android autoVerify intent-filter is bound to plajah.com, so a Watch Next
// tile must deep-link there to relaunch the app rather than open a browser.
const DEEP_LINK_ORIGIN = 'https://plajah.com';

/** Map a watch entry to a home-row tile — or null for kinds the TV row shouldn't carry (audio). */
function toWatchNextItem(e: WatchEntry): WatchNextItem | null {
  // Chora is audio; the Watch Next "continue watching" row is video-only. VIDEO/RELLO route to the
  // Reello player (type=video); TALEO routes to the film page (type=movie).
  const linkType = e.kind === 'TALEO' ? 'movie' : (e.kind === 'RELLO' || e.kind === 'VIDEO') ? 'video' : null;
  if (!linkType) return null;
  return {
    id: e.id,
    title: e.title || 'Continue watching',
    contentType: e.kind === 'TALEO' ? 'MOVIE' : 'CLIP',
    deepLink: `${DEEP_LINK_ORIGIN}/?id=${encodeURIComponent(e.id)}&type=${linkType}`,
    positionSec: e.positionSec,
    durationSec: e.durationSec,
    posterUri: e.thumbnailUrl,
    description: e.ownerName,
    updatedAt: e.updatedAt,
    aspect: e.kind === 'TALEO' ? 'MOVIE_POSTER' : 'ASPECT_16_9',
  };
}

/** Mirror one entry into the TV home row (no-op off-TV). Finished titles are pulled from the row. */
function syncWatchNext(entry: WatchEntry): void {
  const item = toWatchNextItem(entry);
  if (!item) return;
  // Fire-and-forget: the home row must never slow or break progress recording.
  if (entry.completed) void removeWatchNext([entry.id]);
  else void upsertWatchNext([item]);
}

/** Record (upsert) playback progress. Safe to call frequently; caller throttles. */
export async function recordProgress(entry: Omit<WatchEntry, 'updatedAt' | 'completed'> & { updatedAt?: number }): Promise<void> {
  const completed = entry.durationSec > 0 && entry.positionSec / entry.durationSec >= COMPLETE_RATIO;
  const signedInAs = auth.currentUser?.uid;
  const full: WatchEntry = { ...entry, updatedAt: entry.updatedAt ?? Date.now(), completed };
  if (signedInAs) full.uid = signedInAs;

  // localStorage first — instant + offline.
  // Replace only THIS viewer's entry for the title. Filtering on id alone would let one account
  // overwrite another's position for the same film on a shared device.
  const local = readLocal().filter(e => !(e.id === full.id && (e.uid || undefined) === (full.uid || undefined)));
  local.unshift(full);
  writeLocal(local);

  // Reflect it in the Android TV home-screen "continue watching" row.
  syncWatchNext(full);

  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    // Strip undefined before writing. The Web SDK THROWS on an undefined field value (the named
    // DB is created without ignoreUndefinedProperties), and callers legitimately pass optional
    // facets as undefined — MovieUXView sends `seriesId: ...?.seriesTitle || undefined` on every
    // film. That throw was caught below and discarded, so Taleo progress never reached Firestore
    // at all: it lived in localStorage only, and "resume on another device" silently did nothing.
    await setDoc(doc(db, 'users', uid, 'watchHistory', full.id), stripUndefined(full), { merge: true });
  } catch { /* network — localStorage already holds it */ }
}

/**
 * Reconcile the whole home row against current continue-watching. Call once on TV startup so the
 * row reflects progress made on other devices (Firestore sync) and drops anything now finished.
 * No-op off-TV.
 */
export async function reconcileWatchNext(max = 20): Promise<void> {
  try {
    const items = (await getContinueWatching(undefined, max))
      .map(toWatchNextItem)
      .filter((x): x is WatchNextItem => x !== null);
    if (items.length) await upsertWatchNext(items);
  } catch { /* non-fatal */ }
}

/** Merge Firestore history into the local cache and return the unified list. */
export async function loadHistory(max = 100): Promise<WatchEntry[]> {
  const uid = auth.currentUser?.uid;
  let remote: WatchEntry[] = [];
  if (uid) {
    try {
      const snap = await getDocs(query(
        collection(db, 'users', uid, 'watchHistory'),
        orderBy('updatedAt', 'desc'),
        qlimit(max),
      ));
      remote = snap.docs.map(d => d.data() as WatchEntry);
    } catch { /* fall back to local */ }
  }
  // Merge by id, remote winning ties, newest updatedAt first.
  const byId = new Map<string, WatchEntry>();
  for (const e of readLocalForViewer()) byId.set(e.id, e);
  for (const e of remote) {
    const prev = byId.get(e.id);
    if (!prev || e.updatedAt >= prev.updatedAt) byId.set(e.id, e);
  }
  const merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  // Persist the merge WITHOUT evicting entries belonging to other accounts on this device —
  // writeLocal replaces the whole array, so anything not carried forward here is destroyed.
  const viewer = auth.currentUser?.uid;
  const others = readLocal().filter(e => e.uid && e.uid !== viewer);
  writeLocal([...merged, ...others]);
  return merged.slice(0, max);
}

/** Titles the user started but hasn't finished — for a "Continue Watching" shelf. */
export async function getContinueWatching(kind?: WatchKind, max = 20): Promise<WatchEntry[]> {
  const all = await loadHistory(Math.max(max * 4, 60));
  return all
    .filter(e => !e.completed && e.positionSec > 5 && (!kind || e.kind === kind))
    .slice(0, max);
}

/** Synchronous best-effort resume position from the local cache (no await). */
export function getResumePosition(id: string): number {
  const e = readLocalForViewer().find(x => x.id === id);
  return e && !e.completed ? e.positionSec : 0;
}

export async function removeEntry(id: string): Promise<void> {
  writeLocal(readLocal().filter(e => e.id !== id));
  void removeWatchNext([id]);
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try { await deleteDoc(doc(db, 'users', uid, 'watchHistory', id)); } catch { /* non-fatal */ }
}

export async function clearHistory(): Promise<void> {
  void removeWatchNext(readLocal().map(e => e.id));
  writeLocal([]);
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'watchHistory'));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch { /* non-fatal */ }
}
