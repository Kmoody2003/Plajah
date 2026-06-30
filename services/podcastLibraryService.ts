// podcastLibraryService.ts — the single source of truth for the podcasts a user FOLLOWS from the
// podcast directory (PodcastsView). These are external/iTunes shows, kept in localStorage under
// 'vibe_my_podcasts'. Previously only PodcastsView read this key, so follows never appeared on the
// profile or elsewhere. This wraps the store and broadcasts changes so every surface (profile
// Podcast tab, Chora) stays in sync.

import { db } from './backendService';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface FollowedPodcast {
  id: string;
  title: string;
  artist: string;
  coverImage: string;
  feedUrl: string;
  genres: string[];
}

const KEY = 'vibe_my_podcasts';
const EVT = 'plajah:podcast-library-changed';

// ── Cloud sync (Firestore) — the library follows the account across devices ─────────
let currentUid: string | null = null;
let cloudUnsub: (() => void) | null = null;

function mergeById(a: FollowedPodcast[], b: FollowedPodcast[]): FollowedPodcast[] {
  const seen = new Set(a.map(p => p.id));
  return [...a, ...b.filter(p => !seen.has(p.id))];
}
function pushCloud(items: FollowedPodcast[]): void {
  if (!currentUid) return;
  setDoc(doc(db, 'podcastLibrary', currentUid), { items, updatedAt: Date.now() }, { merge: true }).catch(() => {});
}

/**
 * Bind the library to a signed-in user: migrate any local-only follows up to the cloud, then mirror
 * the cloud doc into localStorage in real time (cross-device). Returns an unbind cleanup.
 */
export function initPodcastLibrarySync(uid: string): () => void {
  currentUid = uid;
  const ref = doc(db, 'podcastLibrary', uid);

  // one-time merge so existing localStorage follows aren't lost on first sync
  getDoc(ref).then(snap => {
    const cloud = ((snap.data()?.items as FollowedPodcast[]) || []).map(normalize);
    const local = getFollowedPodcasts();
    const merged = mergeById(cloud, local);
    if (merged.length !== cloud.length) pushCloud(merged);
    if (merged.length !== local.length) { writeLocal(merged); dispatch(); }
  }).catch(() => {});

  cloudUnsub = onSnapshot(ref, snap => {
    const cloud = ((snap.data()?.items as FollowedPodcast[]) || []).map(normalize);
    writeLocal(cloud); dispatch();
  }, () => {});

  return () => { cloudUnsub?.(); cloudUnsub = null; currentUid = null; };
}

const normalize = (p: any): FollowedPodcast => ({ id: p.id, title: p.title || '', artist: p.artist || '', coverImage: p.coverImage || '', feedUrl: p.feedUrl || '', genres: Array.isArray(p.genres) ? p.genres : [] });
function writeLocal(list: FollowedPodcast[]): void { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* */ } }
function dispatch(): void { try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* */ } }

export function getFollowedPodcasts(): FollowedPodcast[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.map((p: any) => ({ id: p.id, title: p.title || '', artist: p.artist || '', coverImage: p.coverImage || '', feedUrl: p.feedUrl || '', genres: Array.isArray(p.genres) ? p.genres : [] }));
  } catch { return []; }
}

function persist(list: FollowedPodcast[]): void {
  writeLocal(list);
  dispatch();
  pushCloud(list); // write-through to Firestore when signed in
}

export function addFollowedPodcast(pod: FollowedPodcast): FollowedPodcast[] {
  const list = getFollowedPodcasts();
  if (list.some(p => p.id === pod.id)) return list;
  const next = [...list, { ...pod, genres: pod.genres || [] }];
  persist(next);
  return next;
}

export function removeFollowedPodcast(id: string): FollowedPodcast[] {
  const next = getFollowedPodcasts().filter(p => p.id !== id);
  persist(next);
  return next;
}

export function isFollowedPodcast(id: string): boolean {
  return getFollowedPodcasts().some(p => p.id === id);
}

/** Fire cb whenever the library changes (this tab or another). Returns an unsubscribe. */
export function subscribePodcastLibrary(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVT, h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
}
