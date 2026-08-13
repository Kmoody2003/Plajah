// Audius library import — a connected user's OWN favorites, reposts, playlists, albums and
// follows, pulled from the discovery-node `library` endpoints and normalized into the same
// native Chora shapes everything else in Chora uses (Album / Track / AudiusArtist).
//
// Endpoint shapes (verified live against a real Audius account):
//   GET /v1/users/{id}/library/tracks?type=favorite|repost  → [{item_type:'track',     item:<track>,      timestamp}]
//   GET /v1/users/{id}/library/playlists                    → [{item_type:'playlist',  item:<collection>, timestamp}]
//   GET /v1/users/{id}/library/albums                       → [{item_type:'playlist',  item:<collection>, timestamp}]
//   GET /v1/users/{id}/following                            → [<user>]
// `item` is the full object, so the existing mappers apply unchanged.
//
// OML compliance: this is READ-ONLY and only ever reads the library of the user who
// consented via OAuth — we never scrape someone else's account. If a user turns off
// third-party API access on Audius, their endpoints stop returning them and the import
// simply comes back empty; nothing is cached across that (see CACHE_TTL + `invalidate`).

import type { ArchiveTrack } from './archiveContentService';
import {
  audiusFetch, getAudiusHost,
  mapAudiusTrack, mapAudiusCollection, mapAudiusUser,
  type AudiusAlbum, type AudiusArtist,
} from './audiusService';
import { getAudiusSession } from './audiusAuth';

export interface AudiusLibrary {
  favorites: ArchiveTrack[];
  reposts: ArchiveTrack[];
  playlists: AudiusAlbum[];
  albums: AudiusAlbum[];
  following: AudiusArtist[];
  /** True when Audius answered but the account has nothing shared (or opted out of the API). */
  empty: boolean;
  fetchedAt: number;
}

const EMPTY: AudiusLibrary = {
  favorites: [], reposts: [], playlists: [], albums: [], following: [], empty: true, fetchedAt: 0,
};

// Short TTL: a favorite tapped on the Audius app should show up here on the next visit,
// and an API opt-out must take effect quickly rather than living on in a stale cache.
const CACHE_TTL = 5 * 60 * 1000;
let _cache: { userId: string; lib: AudiusLibrary } | null = null;

/** Activity rows → the raw items, dropping anything the API returned hollow. */
function items(rows: any[]): any[] {
  return (rows ?? []).map(r => r?.item ?? r).filter(Boolean);
}

async function activity(userId: string, path: string, params: Record<string, string>): Promise<any[]> {
  try {
    const data = await audiusFetch(`/v1/users/${userId}/${path}`, params);
    return items(data?.data ?? []);
  } catch (err) {
    // A 404/403 here is the expected shape of "this user opted out of the API" — not an
    // error worth surfacing. Return nothing and let the caller render the empty state.
    console.warn(`[Audius] library ${path} unavailable:`, err);
    return [];
  }
}

/**
 * Fetch the connected user's Audius library. Returns the cached copy when fresh.
 * Resolves to an empty library (never throws) when nothing is connected.
 */
export async function fetchAudiusLibrary(opts: { force?: boolean; limit?: number } = {}): Promise<AudiusLibrary> {
  const session = getAudiusSession();
  if (!session?.userId) return { ...EMPTY };

  const now = Date.now();
  if (!opts.force && _cache?.userId === session.userId && now - _cache.lib.fetchedAt < CACHE_TTL) {
    return _cache.lib;
  }

  const limit = String(opts.limit ?? 50);
  const host = await getAudiusHost();

  const [favRows, repostRows, playlistRows, albumRows, followRows] = await Promise.all([
    activity(session.userId, 'library/tracks', { type: 'favorite', limit, sort_method: 'added_date' }),
    activity(session.userId, 'library/tracks', { type: 'repost', limit, sort_method: 'added_date' }),
    activity(session.userId, 'library/playlists', { limit, sort_method: 'added_date' }),
    activity(session.userId, 'library/albums', { limit, sort_method: 'added_date' }),
    activity(session.userId, 'following', { limit }),
  ]);

  const toTracks = (rows: any[]) =>
    rows.filter(t => t?.id && !t.is_delete).map(t => mapAudiusTrack(t, host));

  const lib: AudiusLibrary = {
    favorites: toTracks(favRows),
    reposts: toTracks(repostRows),
    playlists: playlistRows.filter(p => p?.id).map(mapAudiusCollection),
    albums: albumRows.filter(p => p?.id).map(mapAudiusCollection),
    following: followRows.filter(u => u?.id).map(mapAudiusUser),
    empty: false,
    fetchedAt: now,
  };
  lib.empty = !lib.favorites.length && !lib.reposts.length && !lib.playlists.length
    && !lib.albums.length && !lib.following.length;

  _cache = { userId: session.userId, lib };
  return lib;
}

/** The cached library without a network call — for callers that must stay synchronous. */
export function peekAudiusLibrary(): AudiusLibrary | null {
  const session = getAudiusSession();
  if (!session?.userId || _cache?.userId !== session.userId) return null;
  return _cache.lib;
}

/** Owner ids (`audius:<userId>`) of every artist the connected user follows on Audius.
 *  Chora's recommender treats these exactly like a native follow. */
export function followedAudiusOwnerIds(): string[] {
  return (peekAudiusLibrary()?.following ?? []).map(a => `audius:${a.id}`);
}

export function invalidateAudiusLibrary(): void {
  _cache = null;
}
