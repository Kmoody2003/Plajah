import type { Album, UserProfile, Video } from '../../types';
import { fetchAllPublicAlbums, fetchAllVideos, fetchUpcomingAlbums } from '../backendService';
import { db } from '../firebase';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

/**
 * Shared, bounded catalogue reads for the TV screens.
 *
 * Chora, Taleo and Search all start from the same public album list, and before this each of
 * them called the UNBOUNDED fetchAllPublicAlbums() on mount — so flipping between tabs on a 2GB
 * TV re-downloaded and re-parsed the whole collection every time. Here every read is:
 *
 *  · de-duplicated — concurrent callers share one in-flight promise;
 *  · cached at module level for TTL_MS, so a tab switch renders instantly from memory;
 *  · stale-while-revalidate — a stale entry is returned immediately and refreshed in the
 *    background; subscribers (useTvResource) are told when the fresh copy lands;
 *  · bounded — lists are trimmed to a cap (newest first) so the heap cost is fixed no matter how
 *    big the catalogue grows.
 *
 * `peek()` returns whatever is cached synchronously, which lets a screen seed its initial state
 * and skip the skeleton entirely on a revisit.
 */

const TTL_MS = 5 * 60 * 1000;

interface Entry<T> { value?: T; at: number; inflight?: Promise<T>; subs: Set<(v: T) => void> }

const store = new Map<string, Entry<any>>();

function entry<T>(key: string): Entry<T> {
  let e = store.get(key);
  if (!e) { e = { at: 0, subs: new Set() }; store.set(key, e); }
  return e as Entry<T>;
}

function refresh<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const e = entry<T>(key);
  if (e.inflight) return e.inflight;
  const p = loader()
    .then(v => {
      // Never replace a good cached list with an empty one from a transient failure.
      const empty = Array.isArray(v) && v.length === 0;
      if (!(empty && e.value !== undefined)) { e.value = v; e.at = Date.now(); }
      e.subs.forEach(fn => { try { fn(e.value as T); } catch { /* subscriber error is theirs */ } });
      return e.value as T;
    })
    .finally(() => { e.inflight = undefined; });
  e.inflight = p;
  return p;
}

/** Cached read with stale-while-revalidate. */
export function cachedResource<T>(key: string, loader: () => Promise<T>, ttl = TTL_MS): Promise<T> {
  const e = entry<T>(key);
  if (e.value !== undefined) {
    if (Date.now() - e.at > ttl) refresh(key, loader).catch(() => {});
    return Promise.resolve(e.value);
  }
  return refresh(key, loader);
}

/** Synchronous read of whatever is cached (possibly stale), or undefined. */
export function peekResource<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

/** Be told when a background revalidation delivers a fresh value. Returns an unsubscribe. */
export function subscribeResource<T>(key: string, fn: (v: T) => void): () => void {
  const e = entry<T>(key);
  e.subs.add(fn);
  return () => { e.subs.delete(fn); };
}

// ── The shared catalogue reads ─────────────────────────────────────────────────

/** Newest-first cap on the public album list kept in memory for TV. */
export const TV_ALBUM_CAP = 600;
export const TV_ARTIST_CAP = 200;

export const TV_KEYS = {
  albums: 'tv:albums',
  upcoming: 'tv:upcoming',
  videos: 'tv:videos',
  artists: 'tv:artists',
} as const;

/** Public albums (all types), newest first, capped. fetchAllPublicAlbums already sorts desc. */
export const getTvPublicAlbums = (): Promise<Album[]> =>
  cachedResource(TV_KEYS.albums, async () => {
    const all = await fetchAllPublicAlbums().catch(() => [] as Album[]);
    return (all || []).slice(0, TV_ALBUM_CAP);
  });

export const getTvUpcomingAlbums = (): Promise<Album[]> =>
  cachedResource(TV_KEYS.upcoming, async () => (await fetchUpcomingAlbums().catch(() => [] as Album[])).slice(0, 40));

/** Recent public videos (fetchAllVideos is already limit(100) → newest 50). */
export const getTvVideos = (): Promise<Video[]> =>
  cachedResource(TV_KEYS.videos, () => fetchAllVideos().catch(() => [] as Video[]));

/**
 * Artist profiles, bounded. Chora used `searchUsers('')`, which downloads the ENTIRE users
 * collection and filters isArtist on the client — on a TV that is the single heaviest read on the
 * screen. This asks Firestore for artists only (single-field equality, no composite index), capped.
 */
export const getTvArtists = (): Promise<UserProfile[]> =>
  cachedResource(TV_KEYS.artists, async () => {
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('isArtist', '==', true), limit(TV_ARTIST_CAP)));
      return snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) } as UserProfile));
    } catch {
      return [] as UserProfile[];
    }
  });
