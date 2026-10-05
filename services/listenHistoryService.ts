/**
 * Listen history for Chora ("Recent listens"). Local-first (localStorage, per uid), with best-effort
 * cross-device sync through the user profile doc (`choraRecents`). Never throws.
 */
import { useEffect, useState } from 'react';

export interface ListenEntry {
  trackId: string;
  albumId: string;
  title: string;
  artist: string;
  artistId: string;
  albumTitle: string;
  cover: string;
  subType: string;
  isLocker: boolean;
  lastPlayedAt: number;
  playCount: number;
}

export const HISTORY_CAP = 300;
export const HISTORY_EVENT = 'chora:history-changed';
const SYNC_MIN_MS = 60_000;

let currentUid = 'anon';
let entries: ListenEntry[] = [];
let loadedFor: string | null = null;
let lastSync = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const key = (uid: string) => `chora:listens:${uid || 'anon'}`;

/* ───────── pure helpers (exported for tests) ───────── */

export function mergeEntries(a: ListenEntry[], b: ListenEntry[], cap = HISTORY_CAP): ListenEntry[] {
  const map = new Map<string, ListenEntry>();
  for (const e of [...a, ...b]) {
    if (!e || !e.trackId) continue;
    const prev = map.get(e.trackId);
    if (!prev) map.set(e.trackId, { ...e });
    else map.set(e.trackId, {
      ...(e.lastPlayedAt >= prev.lastPlayedAt ? e : prev),
      playCount: Math.max(prev.playCount, e.playCount),
    });
  }
  return [...map.values()].sort((x, y) => y.lastPlayedAt - x.lastPlayedAt).slice(0, cap);
}

export function applyListen(list: ListenEntry[], e: Omit<ListenEntry, 'playCount'>, cap = HISTORY_CAP): ListenEntry[] {
  const prev = list.find(x => x.trackId === e.trackId);
  const next: ListenEntry = { ...e, playCount: (prev?.playCount || 0) + 1 };
  return [next, ...list.filter(x => x.trackId !== e.trackId)].slice(0, cap);
}

const isCollection = (e: ListenEntry) => e.subType === 'PLAYLIST' || e.subType === 'MIX';
const bySubType = (e: ListenEntry) => e.subType;

function distinct(list: ListenEntry[], keyFn: (e: ListenEntry) => string, n: number): ListenEntry[] {
  const seen = new Set<string>(); const out: ListenEntry[] = [];
  for (const e of list) {
    const k = keyFn(e);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(e);
    if (out.length >= n) break;
  }
  return out;
}
const byRecent = (list: ListenEntry[]) => [...list].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);

export const recentTracks = (l: ListenEntry[], n = 12) => distinct(byRecent(l), e => e.trackId, n);
export const recentAlbums = (l: ListenEntry[], n = 12) =>
  distinct(byRecent(l).filter(e => !isCollection(e) && !e.isLocker), e => e.albumId, n);
export const recentArtists = (l: ListenEntry[], n = 12) =>
  distinct(byRecent(l).filter(e => !e.isLocker), e => e.artistId, n);
export const recentPlaylists = (l: ListenEntry[], n = 12) =>
  distinct(byRecent(l).filter(e => bySubType(e) === 'PLAYLIST'), e => e.albumId, n);
export const recentMixes = (l: ListenEntry[], n = 12) =>
  distinct(byRecent(l).filter(e => bySubType(e) === 'MIX'), e => e.albumId, n);
export const recentLocker = (l: ListenEntry[], n = 12) =>
  distinct(byRecent(l).filter(e => e.isLocker), e => e.trackId, n);
export const mostPlayedTracks = (l: ListenEntry[], n = 12) =>
  [...l].filter(e => e.playCount >= 2).sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt).slice(0, n);
export function mostPlayedArtists(l: ListenEntry[], n = 12): ListenEntry[] {
  const m = new Map<string, { e: ListenEntry; c: number }>();
  for (const e of l) {
    if (e.isLocker || !e.artistId) continue;
    const cur = m.get(e.artistId);
    if (!cur) m.set(e.artistId, { e, c: e.playCount });
    else { cur.c += e.playCount; if (e.lastPlayedAt > cur.e.lastPlayedAt) cur.e = e; }
  }
  return [...m.values()].filter(x => x.c >= 2).sort((a, b) => b.c - a.c).slice(0, n).map(x => x.e);
}

/* ───────── storage + sync ───────── */

function load(uid: string) {
  if (loadedFor === uid) return;
  loadedFor = uid; currentUid = uid; entries = [];
  try {
    const raw = localStorage.getItem(key(uid));
    if (raw) entries = (JSON.parse(raw) as ListenEntry[]).filter(e => e && e.trackId);
  } catch { /* ignore */ }
}
function persist() {
  try { localStorage.setItem(key(currentUid), JSON.stringify(entries)); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent(HISTORY_EVENT)); } catch { /* ignore */ }
}

export function getHistory(uid?: string): ListenEntry[] {
  load(uid || currentUid || 'anon');
  return entries;
}

/** Merge a list from the user profile doc (cross-device). */
export function mergeRemote(uid: string | undefined, remote: unknown) {
  try {
    if (!uid || !Array.isArray(remote) || !remote.length) return;
    load(uid);
    const before = entries.length ? entries[0].lastPlayedAt + ':' + entries.length : '';
    entries = mergeEntries(entries, remote as ListenEntry[]);
    if ((entries.length ? entries[0].lastPlayedAt + ':' + entries.length : '') !== before) persist();
  } catch { /* ignore */ }
}

async function syncNow(uid: string) {
  try {
    if (!uid || uid === 'anon') return;
    lastSync = Date.now();
    const { updateUserProfile } = await import('./backendService');
    await updateUserProfile(uid, { choraRecents: entries.slice(0, HISTORY_CAP) } as any);
  } catch { /* best effort */ }
}
/** Throttled to once per minute; `force` (e.g. on pause) still debounces to avoid write storms. */
export function scheduleSync(uid: string | undefined, force = false) {
  try {
    if (!uid || uid === 'anon') return;
    const wait = Math.max(force ? 3000 : 0, SYNC_MIN_MS - (Date.now() - lastSync));
    if (syncTimer) return;
    syncTimer = setTimeout(() => { syncTimer = null; void syncNow(uid); }, wait);
  } catch { /* ignore */ }
}

/** Record that a track was listened to. */
export function recordListen(uid: string | undefined, track: any, album: any) {
  try {
    if (!track?.id) return;
    const u = uid || 'anon';
    load(u);
    const e: Omit<ListenEntry, 'playCount'> = {
      trackId: String(track.id),
      albumId: String(album?.id || track.albumId || ''),
      title: track.title || '',
      artist: track.artist || album?.artist || '',
      artistId: String(album?.ownerId || track.artistId || track.ownerId || ''),
      albumTitle: album?.title || track.albumTitle || '',
      cover: album?.coverImage || track.albumCover || track.thumbnailUrl || '',
      subType: album?.subType || '',
      isLocker: !!track.isPersonalMedia,
      lastPlayedAt: Date.now(),
    };
    entries = applyListen(entries, e);
    persist();
    scheduleSync(u === 'anon' ? undefined : u);
  } catch { /* never block playback */ }
}

export function useListenHistory(uid?: string, remote?: unknown): ListenEntry[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const h = () => bump(x => x + 1);
    window.addEventListener(HISTORY_EVENT, h);
    return () => window.removeEventListener(HISTORY_EVENT, h);
  }, []);
  useEffect(() => { mergeRemote(uid, remote); }, [uid, remote]);
  return getHistory(uid || 'anon');
}
