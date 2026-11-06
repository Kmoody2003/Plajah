// Audius decentralized music platform integration
// Read: trending, charts, playlists, artists, search, stream (authenticated)
// Write: publish albums/tracks to Audius via OAuth + content API

import type { ArchiveTrack } from './archiveContentService';
import type { Album, Track } from '../types';

const APP_NAME = 'Plajah';
// Public app identifier (the developer-app address, not a secret). Env-overridable.
const AUDIUS_API_KEY =
  (import.meta as any).env?.VITE_AUDIUS_API_KEY || '9504e71d3b7450c321850ca4451aff09e72d6b01';
const FALLBACK_HOST = 'https://discoveryprovider.audius.co';
const HOST_CACHE_TTL = 1000 * 60 * 60; // 1 hour

let _cachedHost: string | null = null;
let _hostCachedAt = 0;

// Reads need nothing but `app_name`/`X-API-KEY`. The app's OAuth BEARER token must never be
// sent from the browser — it acts on behalf of every user who authorized the app, and a
// client bundle is public. Per-user calls use the user's own OAuth token (services/audiusAuth).
function audiusHeaders(): HeadersInit {
  return { 'X-API-KEY': AUDIUS_API_KEY };
}

// ─── Host Discovery ────────────────────────────────────────────────────────────

export async function getAudiusHost(): Promise<string> {
  const now = Date.now();
  if (_cachedHost && now - _hostCachedAt < HOST_CACHE_TTL) return _cachedHost;
  try {
    const res = await fetch('https://api.audius.co', { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const hosts: string[] = data.data ?? [];
    if (hosts.length) {
      _cachedHost = hosts[0];
      _hostCachedAt = now;
      return _cachedHost;
    }
  } catch { /* fall through */ }
  _cachedHost = FALLBACK_HOST;
  _hostCachedAt = now;
  return _cachedHost;
}

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface AudiusPlaylist {
  id: string;
  title: string;
  description?: string;
  artworkUrl: string;
  trackCount: number;
  curator: string;
  curatorHandle: string;
  curatorId: string;  // Audius user ID (not handle) — needed for fetchAudiusArtistById
  permalink: string;
}

export interface AudiusArtist {
  id: string;
  name: string;
  handle: string;
  followerCount: number;
  trackCount: number;
  profilePicture: string;
  coverPhoto?: string;
  bio?: string;
  verified: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapTrack(t: any, host: string): ArchiveTrack {
  const handle = t.user?.handle ?? '';
  // Deep link back to the track's real Audius page (OML attribution). `permalink` is
  // like "/artisthandle/track-title"; fall back to the artist page, then audius.co root.
  const sourcePageUrl = t.permalink
    ? `https://audius.co${t.permalink}`
    : (handle ? `https://audius.co/${handle}` : 'https://audius.co/');
  // playCount rides along (not part of ArchiveTrack) so Chora's sky can size Audius comets by real plays.
  return Object.assign(mapTrackFields(t, host, handle, sourcePageUrl), t.play_count != null ? { playCount: Number(t.play_count) } : {});
}

function mapTrackFields(t: any, host: string, handle: string, sourcePageUrl: string): ArchiveTrack {
  return {
    id: `audius_${t.id}`,
    title: t.title ?? 'Untitled',
    artist: t.user?.name ?? handle ?? 'Unknown Artist',
    artistId: t.user?.id ?? undefined,
    url: `${host}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    thumbnailUrl:
      t.artwork?.['480x480'] ??
      t.artwork?.['150x150'] ??
      `https://creatornode.audius.co/ipfs/${t.artwork?.['480x480']}`,
    source: 'AUDIUS' as const,
    genre: t.genre ?? undefined,
    duration: t.duration ?? undefined,
    sourcePageUrl,
  };
}

function mapPlaylist(p: any): AudiusPlaylist {
  return {
    id: p.id,
    title: p.playlist_name ?? p.title ?? 'Untitled Playlist',
    description: p.description ?? undefined,
    artworkUrl: p.artwork?.['480x480'] ?? p.artwork?.['150x150'] ?? '',
    trackCount: p.track_count ?? 0,
    curator: p.user?.name ?? p.user?.handle ?? 'Audius',
    curatorHandle: p.user?.handle ?? '',
    curatorId: p.user?.id ?? '',
    permalink: `https://audius.co/${p.user?.handle ?? ''}/${p.permalink ?? p.id}`,
  };
}

function mapArtist(u: any): AudiusArtist {
  return {
    id: u.id,
    name: u.name ?? u.handle,
    handle: u.handle,
    followerCount: u.follower_count ?? 0,
    trackCount: u.track_count ?? 0,
    profilePicture: u.profile_picture?.['480x480'] ?? u.profile_picture?.['150x150'] ?? '',
    coverPhoto: u.cover_photo?.['2000x'] ?? u.cover_photo?.['640x'] ?? undefined,
    bio: u.bio ?? undefined,
    verified: u.is_verified ?? false,
  };
}

/** Map a raw Audius track to an ArchiveTrack. Exported for the library importer. */
export const mapAudiusTrack = (t: any, host: string): ArchiveTrack => mapTrack(t, host);
/** Map a raw Audius collection to an AudiusAlbum (playlists AND albums share the shape). */
export const mapAudiusCollection = (p: any): AudiusAlbum => mapAlbum(p);
/** Map a raw Audius user to an AudiusArtist. */
export const mapAudiusUser = (u: any): AudiusArtist => mapArtist(u);

export async function audiusFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const host = await getAudiusHost();
  const p = new URLSearchParams({ app_name: APP_NAME, ...params });
  const res = await fetch(`${host}${path}?${p}`, {
    headers: audiusHeaders(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Audius ${path} → ${res.status}`);
  return res.json();
}

// ─── Tracks ───────────────────────────────────────────────────────────────────

export async function fetchAudiusTrending(genre?: string, limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const params: Record<string, string> = { app_name: APP_NAME, limit: String(limit) };
    if (genre) params.genre = genre;
    const data = await audiusFetch('/v1/tracks/trending', params);
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusTrending:', err);
    return [];
  }
}

export async function fetchAudiusUnderground(limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const data = await audiusFetch('/v1/tracks/trending/underground', { limit: String(limit) });
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusUnderground:', err);
    return [];
  }
}

export async function fetchAudiusChartsByGenre(genre: string, limit = 10): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const data = await audiusFetch('/v1/tracks/trending', { genre, limit: String(limit) });
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusChartsByGenre:', err);
    return [];
  }
}

export async function searchAudius(query: string, limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const data = await audiusFetch('/v1/tracks/search', { query, limit: String(limit) });
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] searchAudius:', err);
    return [];
  }
}

export async function fetchAudiusUserTracks(handle: string, limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const userData = await audiusFetch(`/v1/users/handle/${encodeURIComponent(handle)}`);
    const userId: string | undefined = userData.data?.id;
    if (!userId) return [];
    const tracksData = await audiusFetch(`/v1/users/${userId}/tracks`, { limit: String(limit) });
    return (tracksData.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusUserTracks:', err);
    return [];
  }
}

export async function fetchAudiusArtistTracks(userId: string, limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const data = await audiusFetch(`/v1/users/${userId}/tracks`, { limit: String(limit) });
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusArtistTracks:', err);
    return [];
  }
}

export async function getAudiusStreamUrl(rawTrackId: string): Promise<string> {
  const id = rawTrackId.replace('audius_', '');
  const host = await getAudiusHost();
  return `${host}/v1/tracks/${id}/stream?app_name=${APP_NAME}`;
}

// ─── Playlists ────────────────────────────────────────────────────────────────

export async function fetchAudiusTrendingPlaylists(limit = 10): Promise<AudiusPlaylist[]> {
  try {
    const data = await audiusFetch('/v1/playlists/trending', { limit: String(limit) });
    return (data.data ?? []).map(mapPlaylist);
  } catch (err) {
    console.error('[Audius] fetchAudiusTrendingPlaylists:', err);
    return [];
  }
}

export async function fetchAudiusPlaylistTracks(playlistId: string): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const data = await audiusFetch(`/v1/playlists/${playlistId}/tracks`);
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusPlaylistTracks:', err);
    return [];
  }
}

export async function searchAudiusPlaylists(query: string, limit = 10): Promise<AudiusPlaylist[]> {
  try {
    const data = await audiusFetch('/v1/playlists/search', { query, limit: String(limit) });
    return (data.data ?? []).map(mapPlaylist);
  } catch (err) {
    console.error('[Audius] searchAudiusPlaylists:', err);
    return [];
  }
}

// ─── Artists ──────────────────────────────────────────────────────────────────

export async function fetchAudiusFeaturedArtists(limit = 12): Promise<AudiusArtist[]> {
  try {
    // Use trending tracks and extract unique artists as a proxy for featured artists
    const data = await audiusFetch('/v1/tracks/trending', { limit: '50' });
    const tracks: any[] = data.data ?? [];
    const seen = new Set<string>();
    const artists: AudiusArtist[] = [];
    for (const t of tracks) {
      if (!t.user?.id || seen.has(t.user.id)) continue;
      seen.add(t.user.id);
      artists.push(mapArtist(t.user));
      if (artists.length >= limit) break;
    }
    return artists;
  } catch (err) {
    console.error('[Audius] fetchAudiusFeaturedArtists:', err);
    return [];
  }
}

export async function fetchAudiusArtistById(userId: string): Promise<AudiusArtist | null> {
  try {
    const data = await audiusFetch(`/v1/users/${userId}`);
    const u = data.data;
    return u ? mapArtist(u) : null;
  } catch (err) {
    console.error('[Audius] fetchAudiusArtistById:', err);
    return null;
  }
}

export interface AudiusAlbum {
  id: string;
  title: string;
  artworkUrl: string;
  trackCount: number;
  isAlbum: boolean;
  curatorId: string;
  curator: string;
  description?: string;
  releaseDate?: string;
}

function mapAlbum(p: any): AudiusAlbum {
  return {
    id: p.id,
    title: p.playlist_name ?? p.title ?? 'Untitled',
    artworkUrl: p.artwork?.['480x480'] ?? p.artwork?.['150x150'] ?? '',
    trackCount: p.track_count ?? 0,
    isAlbum: !!p.is_album,
    curatorId: p.user?.id ?? '',
    curator: p.user?.name ?? p.user?.handle ?? 'Unknown',
    description: p.description ?? undefined,
    releaseDate: p.release_date ?? undefined,
  };
}

export async function fetchAudiusArtistAlbums(userId: string): Promise<AudiusAlbum[]> {
  try {
    const data = await audiusFetch(`/v1/users/${userId}/albums`);
    return (data.data ?? []).map(mapAlbum);
  } catch (err) {
    console.error('[Audius] fetchAudiusArtistAlbums:', err);
    return [];
  }
}

export async function fetchAudiusArtistPlaylists(userId: string): Promise<AudiusAlbum[]> {
  try {
    const data = await audiusFetch(`/v1/users/${userId}/playlists`);
    return (data.data ?? []).map(mapAlbum);
  } catch (err) {
    console.error('[Audius] fetchAudiusArtistPlaylists:', err);
    return [];
  }
}

export async function fetchAudiusAlbumById(albumId: string): Promise<AudiusAlbum | null> {
  try {
    const data = await audiusFetch(`/v1/playlists/${albumId}`);
    const p = Array.isArray(data.data) ? data.data[0] : data.data;
    return p ? mapAlbum(p) : null;
  } catch (err) {
    console.error('[Audius] fetchAudiusAlbumById:', err);
    return null;
  }
}

export async function fetchAudiusRelatedArtists(userId: string, limit = 6): Promise<AudiusArtist[]> {
  try {
    const data = await audiusFetch(`/v1/users/${userId}/related`);
    return (data.data ?? []).slice(0, limit).map(mapArtist);
  } catch {
    // Fallback: pull from trending if related endpoint fails
    return fetchAudiusFeaturedArtists(limit);
  }
}

export async function searchAudiusArtists(query: string, limit = 12): Promise<AudiusArtist[]> {
  try {
    const data = await audiusFetch('/v1/users/search', { query, limit: String(limit) });
    return (data.data ?? []).map(mapArtist);
  } catch (err) {
    console.error('[Audius] searchAudiusArtists:', err);
    return [];
  }
}

// ─── Curations ────────────────────────────────────────────────────────────────

export const AUDIUS_GENRES = [
  'Electronic', 'Hip-Hop/Rap', 'Alternative', 'Rock', 'Metal',
  'Pop', 'R&B/Soul', 'Jazz', 'Classical', 'Country', 'Reggae',
  'Podcasts', 'Spoken Word', 'Comedy', 'Ambient', 'Soundtrack',
  'World', 'Latin', 'Indie Pop', 'House', 'Techno',
];

export interface AudiusCuration {
  trending: ArchiveTrack[];
  underground: ArchiveTrack[];
  playlists: AudiusPlaylist[];
  artists: AudiusArtist[];
  genreCharts: Record<string, ArchiveTrack[]>;
}

export async function loadAudiusCuration(genres: string[] = ['Electronic', 'Hip-Hop/Rap', 'Pop', 'R&B/Soul', 'Rock']): Promise<AudiusCuration> {
  const [trending, underground, playlists, artists, ...genreResults] = await Promise.allSettled([
    fetchAudiusTrending(undefined, 25),
    fetchAudiusUnderground(20),
    fetchAudiusTrendingPlaylists(12),
    fetchAudiusFeaturedArtists(12),
    ...genres.map(g => fetchAudiusChartsByGenre(g, 8)),
  ]);

  const genreCharts: Record<string, ArchiveTrack[]> = {};
  genres.forEach((g, i) => {
    const r = genreResults[i];
    genreCharts[g] = r.status === 'fulfilled' ? r.value : [];
  });

  return {
    trending: trending.status === 'fulfilled' ? trending.value : [],
    underground: underground.status === 'fulfilled' ? underground.value : [],
    playlists: playlists.status === 'fulfilled' ? playlists.value : [],
    artists: artists.status === 'fulfilled' ? artists.value : [],
    genreCharts,
  };
}

// ─── OAuth Connect ────────────────────────────────────────────────────────────
// The real "Log in with Audius" (Authorization Code + PKCE) lives in services/audiusAuth.ts.
// The stubs that used to sit here — an authorize URL with no PKCE and a code exchange that
// GET-ed /v1/oauth/token with no code — never worked; they are gone.

export {
  loginWithAudius, startAudiusAuth, logoutAudius, getAudiusSession, getAudiusAccessToken,
  completeAudiusRedirect, AUDIUS_SESSION_EVENT,
} from './audiusAuth';
export type { AudiusSession, AudiusScope } from './audiusAuth';

// ─── Publish (Chora → Audius) ─────────────────────────────────────────────────
//
// How Audius takes an upload (verified 2026-11-05 against api.audius.co/v1/swagger.yaml and
// @audius/sdk's Storage/UploadsApi/TracksApi on main):
//   1. The FILES go to a storage node over tus (resumable upload): POST {node}/files/ with
//      tus metadata {filename, filetype, template: audio|img_square, userId: <numeric id>}.
//      No auth header — the node attests the resulting CIDs to that user id.
//   2. Poll GET {node}/uploads/{uploadId} until status 'done'. Audio → results['320'] (the
//      stream CID), orig_file_cid, probe.format.duration; image → orig_file_cid.
//   3. POST api.audius.co/v1/tracks?user_id=<hashId> with a JSON body {title, genre, track_cid,
//      …} and the user's OAuth bearer token (scope write). 201 → {track_id}.
//   4. An album is POST /v1/playlists?user_id=… {playlist_name, is_album: true,
//      playlist_contents: [{track_id, timestamp}], playlist_image_sizes_multihash}.
// The old version POSTed multipart track_file/metadata to /v1/tracks — not an Audius request
// shape — and swallowed the error, so turning the toggle on never sent anything.
// App info goes in the query string: only `authorization, content-type` pass api.audius.co's
// CORS preflight, so X-API-KEY / X-User-ID headers would block the write from the browser.

export interface AudiusPublishResult {
  trackId: string;
  permalink: string;
  /** The Plajah track this came from. */
  sourceTrackId?: string;
  /** Artwork CID, reused for the album collection. */
  coverCid?: string;
}

export interface AudiusAlbumPublishResponse {
  albumId?: string;
  albumPermalink?: string;
  published: AudiusPublishResult[];
  /** Track titles that didn't go, each with the reason. */
  failed: string[];
  /** First error message, for the status line. */
  error?: string;
}

const AUDIUS_WRITE_BASE = 'https://api.audius.co/v1';

/** Storage nodes from the network health check (the SDK's own source of truth). */
async function audiusStorageNodes(): Promise<string[]> {
  try {
    const res = await fetch('https://api.audius.co/health_check', { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    const nodes: string[] = (json?.data?.network?.content_nodes ?? [])
      .map((n: any) => String(n?.endpoint || '').replace(/\/$/, ''))
      .filter(Boolean);
    if (nodes.length) return nodes;
  } catch { /* fall through */ }
  return ['https://creatornode.audius.co'];
}

/** The numeric id the storage node attests uploads to (the API speaks hash ids). */
const numericIdCache = new Map<string, number>();
async function audiusNumericUserId(hashId: string): Promise<number> {
  const hit = numericIdCache.get(hashId);
  if (hit) return hit;
  const data = await audiusFetch(`/v1/users/${encodeURIComponent(hashId)}`);
  const n = Number(data?.data?.user_id);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Could not read your Audius account id.');
  numericIdCache.set(hashId, n);
  return n;
}

interface StorageUploadResult {
  status: string;
  orig_file_cid?: string;
  orig_filename?: string;
  results?: Record<string, string>;
  probe?: { format?: { duration?: string } };
  error?: string;
}

/** tus-upload one file to a storage node and wait for transcode/resize to finish. */
async function uploadToAudiusStorage(
  file: Blob, filename: string, template: 'audio' | 'img_square', userId: number,
  onProgress?: (fraction: number) => void,
): Promise<StorageUploadResult> {
  const tus: any = await import('tus-js-client');
  const Upload = ('Upload' in tus ? tus : tus.default).Upload;
  const nodes = await audiusStorageNodes();
  let lastErr: unknown = null;
  for (const node of nodes) {
    try {
      const uploadId = await new Promise<string>((resolve, reject) => {
        const up = new Upload(file, {
          endpoint: `${node}/files/`,
          retryDelays: [0, 3000, 5000, 10000],
          chunkSize: 100_000_000,
          removeFingerprintOnSuccess: true,
          metadata: { filename, filetype: file.type || (template === 'audio' ? 'audio/mpeg' : 'image/jpeg'), template, userId: String(userId) },
          onError: reject,
          onProgress: (loaded: number, total: number) => onProgress?.(total ? loaded / total : 0),
          onSuccess: () => {
            const id = String(up.url || '').split('/').pop();
            id ? resolve(id) : reject(new Error('The Audius storage node returned no upload id.'));
          },
        });
        up.start();
      });
      // Transcodes can take minutes on a long track; images resize in seconds.
      const limit = Date.now() + (template === 'audio' ? 30 * 60_000 : 5 * 60_000);
      while (Date.now() < limit) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(`${node}/uploads/${uploadId}`).catch(() => null);
        if (!res?.ok) continue;
        const body: StorageUploadResult = await res.json();
        if (body.status === 'done' && (template !== 'audio' || body.results?.['320'])) return body;
        if (body.status === 'error' || body.status === 'error_retranscode_preview') {
          throw new Error(body.error || `Audius couldn't process ${filename}.`);
        }
      }
      throw new Error(`Audius took too long processing ${filename}.`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Audius storage upload failed.');
}

/** A write to api.audius.co as the signed-in user; throws with Audius's own message. */
async function audiusWrite(path: string, body: unknown, bearerToken: string, userHashId: string): Promise<any> {
  const qs = new URLSearchParams({ user_id: userHashId, api_key: AUDIUS_API_KEY, app_name: APP_NAME });
  const res = await fetch(`${AUDIUS_WRITE_BASE}${path}?${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Audius refused the upload (${msg}). Reconnect Audius with upload permission and try again.`);
    }
    throw new Error(`Audius rejected the ${path.includes('playlist') ? 'album' : 'track'}: ${msg}`);
  }
  return json;
}

async function fetchBlob(url: string, what: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't read the ${what} (${res.status}).`);
  return res.blob();
}

const extFor = (blob: Blob, url: string, fallback: string) => {
  const fromType = blob.type.split('/')[1]?.replace('mpeg', 'mp3').replace('x-', '');
  const fromUrl = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(url)?.[1];
  return (fromUrl || fromType || fallback).toLowerCase();
};

/** Upload a cover once and return its CID (null when there's no usable cover). */
async function uploadAudiusCover(coverUrl: string | undefined, userNumericId: number): Promise<string | null> {
  if (!coverUrl) return null;
  try {
    const blob = await fetchBlob(coverUrl, 'cover art');
    const res = await uploadToAudiusStorage(blob, `cover.${extFor(blob, coverUrl, 'jpg')}`, 'img_square', userNumericId);
    return res.orig_file_cid || null;
  } catch (err) {
    console.warn('[Audius] cover upload failed, publishing without art:', err);
    return null;
  }
}

/** Publish one track. Throws with a readable reason on failure. */
export async function publishTrackToAudius(
  track: Track,
  album: Album,
  bearerToken: string,
  audiusUserId: string,
  opts: { coverCid?: string | null; onProgress?: (fraction: number) => void } = {},
): Promise<AudiusPublishResult> {
  if (!track.url) throw new Error('This track has no audio file.');
  const numericId = await audiusNumericUserId(audiusUserId);
  const audio = await fetchBlob(track.url, 'audio file');
  const filename = `${(track.title || 'track').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'track'}.${extFor(audio, track.url, 'mp3')}`;
  const up = await uploadToAudiusStorage(audio, filename, 'audio', numericId, opts.onProgress);

  const coverCid = opts.coverCid !== undefined
    ? opts.coverCid
    : await uploadAudiusCover(track.albumCover ?? album.coverImage, numericId);

  const metadata: Record<string, unknown> = {
    title: (track.title || album.title || 'Untitled').slice(0, 200),
    genre: String(track.genre || album.genre || 'Electronic').slice(0, 100),
    track_cid: up.results!['320'],
    orig_file_cid: up.orig_file_cid,
    orig_filename: up.orig_filename || filename,
    duration: Math.round(Number(up.probe?.format?.duration) || track.duration || 0) || undefined,
    description: (album.description || '').slice(0, 1000) || undefined,
    mood: 'Other',
    is_downloadable: false,
    is_unlisted: false,
  };
  if (coverCid) metadata.cover_art_sizes = coverCid;
  if ((track as any).isrc) metadata.isrc = (track as any).isrc;

  const out = await audiusWrite('/tracks', metadata, bearerToken, audiusUserId);
  const trackId: string | undefined = out?.track_id ?? out?.data?.track_id ?? out?.data?.id;
  if (!trackId) throw new Error('Audius accepted the track but returned no id.');

  // Real permalink once the network has indexed it; the id URL works meanwhile.
  let permalink = `https://audius.co/tracks/${trackId}`;
  try {
    const t = await audiusFetch(`/v1/tracks/${encodeURIComponent(trackId)}`);
    if (t?.data?.permalink) permalink = `https://audius.co${t.data.permalink}`;
  } catch { /* not indexed yet */ }
  return { trackId: String(trackId), permalink, sourceTrackId: track.id, coverCid: coverCid || undefined };
}

/**
 * Bundles uploaded Audius track IDs into an official Audius Album (a playlist with `is_album: true`).
 */
export async function createAudiusAlbumCollection(
  album: Album,
  trackIds: string[],
  bearerToken: string,
  audiusUserId: string,
  audiusHandle?: string,
  coverCid?: string | null,
): Promise<{ albumId: string; permalink: string }> {
  if (!trackIds.length) throw new Error('No tracks to put in the album.');
  const now = Math.floor(Date.now() / 1000);
  const body: Record<string, unknown> = {
    playlist_name: (album.title || 'Untitled Album').slice(0, 200),
    description: (album.description || '').slice(0, 1000) || undefined,
    genre: album.genre ? String(album.genre).slice(0, 100) : undefined,
    is_album: true,
    is_private: false,
    playlist_contents: trackIds.map(id => ({ track_id: id, timestamp: now })),
  };
  if (coverCid) body.playlist_image_sizes_multihash = coverCid;
  if ((album as any).upc) body.upc = (album as any).upc;
  const out = await audiusWrite('/playlists', body, bearerToken, audiusUserId);
  const albumId: string | undefined = out?.playlist_id ?? out?.data?.playlist_id ?? out?.data?.id;
  if (!albumId) throw new Error('Audius accepted the album but returned no id.');
  let permalink = audiusHandle ? `https://audius.co/${audiusHandle}` : 'https://audius.co/';
  try {
    const p = await audiusFetch(`/v1/playlists/${encodeURIComponent(albumId)}`);
    const rec = Array.isArray(p?.data) ? p.data[0] : p?.data;
    if (rec?.permalink) permalink = `https://audius.co${rec.permalink}`;
  } catch { /* not indexed yet */ }
  return { albumId: String(albumId), permalink };
}

/**
 * Publish a Plajah release to Audius. Tracks already sent (`alreadyPublished`, keyed by Plajah
 * track id) are skipped, so a retry after a partial failure — or a later re-save — never
 * uploads a song twice.
 */
export async function publishAlbumToAudius(
  album: Album,
  bearerToken: string,
  audiusUserId: string,
  onProgress?: (done: number, total: number) => void,
  audiusHandle?: string,
  alreadyPublished: Record<string, string> = {},
): Promise<AudiusAlbumPublishResponse> {
  const tracks = (album.tracks ?? []).filter(t => !!t?.url);
  const published: AudiusPublishResult[] = [];
  const failed: string[] = [];
  let error: string | undefined;

  let coverCid: string | null = null;
  try { coverCid = await uploadAudiusCover(album.coverImage, await audiusNumericUserId(audiusUserId)); }
  catch (err: any) { error = err?.message; }

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const prior = alreadyPublished[t.id];
    if (prior) {
      published.push({ trackId: prior, permalink: `https://audius.co/tracks/${prior}`, sourceTrackId: t.id });
    } else {
      try {
        published.push(await publishTrackToAudius(t, album, bearerToken, audiusUserId, { coverCid: t.albumCover && t.albumCover !== album.coverImage ? undefined : coverCid }));
      } catch (err: any) {
        const why = err?.message || 'upload failed';
        error ??= why;
        failed.push(`${t.title ?? `Track ${i + 1}`}: ${why}`);
        console.error('[Audius] publish track failed:', t.title, err);
        // An auth refusal will refuse every track — stop instead of hammering.
        if (/refused the upload|Reconnect Audius/.test(why)) break;
      }
    }
    onProgress?.(i + 1, tracks.length);
  }

  // Group into one Audius Album when the release has more than one track.
  let albumId: string | undefined = (album as any).audiusAlbumId;
  let albumPermalink: string | undefined;
  const wantsCollection = tracks.length > 1;
  if (published.length > 0 && wantsCollection && !failed.length && !albumId) {
    try {
      const c = await createAudiusAlbumCollection(album, published.map(p => p.trackId), bearerToken, audiusUserId, audiusHandle, coverCid);
      albumId = c.albumId;
      albumPermalink = c.permalink;
    } catch (err: any) {
      error ??= err?.message;
      console.error('[Audius] album collection failed:', err);
    }
  } else if (published.length === 1) {
    albumPermalink = published[0].permalink;
  }

  return { albumId, albumPermalink, published, failed, error };
}

/**
 * The whole "publish to Audius" job for a saved release: refreshes the token, skips what's
 * already there, and writes the outcome (status, links, ids, error) back onto the album doc so
 * the creator sees it in the Distribution hub. Used by the album creator's toggle and the modal.
 */
export async function runAudiusPublishForAlbum(
  album: Album,
  onProgress?: (done: number, total: number) => void,
): Promise<AudiusAlbumPublishResponse & { albumUrl?: string }> {
  const { getAudiusSession, getAudiusAccessToken } = await import('./audiusAuth');
  const { updateCloudAlbum } = await import('./backendService');
  const save = (patch: Record<string, unknown>) =>
    album.id ? updateCloudAlbum(album.id, patch as any).catch(err => console.error('[Audius] status save failed:', err)) : Promise.resolve();

  const session = getAudiusSession();
  const token = session?.scope === 'write' ? await getAudiusAccessToken() : null;
  if (!session || session.scope !== 'write' || !token) {
    const error = 'Connect your Audius account (with upload permission) to publish there.';
    await save({ audiusPublishStatus: 'failed', audiusError: error });
    return { published: [], failed: [], error };
  }

  await save({ audiusPublishStatus: 'publishing', audiusError: null });
  const prior: Record<string, string> = { ...((album as any).audiusTrackIds || {}) };
  const res = await publishAlbumToAudius(album, token, session.userId, onProgress, session.handle, prior);

  const audiusTrackIds = { ...prior };
  for (const p of res.published) if (p.sourceTrackId) audiusTrackIds[p.sourceTrackId] = p.trackId;
  // Any error (a track, or the album collection) leaves it 'failed'; a retry skips the tracks
  // already sent and finishes the rest.
  const ok = res.published.length > 0 && !res.failed.length && !res.error;
  const albumUrl = res.albumPermalink || (res.published.length ? `https://audius.co/${session.handle}` : undefined);
  await save({
    publishToAudius: true,
    audiusPublishStatus: ok ? 'published' : 'failed',
    audiusError: ok ? null : (res.error || 'Some tracks did not upload.'),
    audiusTrackIds,
    ...(res.albumId ? { audiusAlbumId: res.albumId } : {}),
    ...(albumUrl ? { audiusUrl: albumUrl } : {}),
    audiusPermalinks: res.published.map(p => p.permalink),
    ...(ok ? { audiusPublishedAt: Date.now() } : {}),
  });
  return { ...res, albumUrl };
}

export function generateAudiusUploadLink(): string {
  return `https://audius.co/upload?app_name=${APP_NAME}&ref=plajah`;
}

// ─── Audius Social Network Integration (Follow, Favorite, Repost, Comments, Feed) ──

export interface AudiusComment {
  id: string;
  userId: string;
  userName: string;
  userHandle: string;
  userAvatar?: string;
  userVerified: boolean;
  message: string;
  trackTimestampS?: number;
  createdAt: number;
  reactCount: number;
  replies?: AudiusComment[];
}

async function audiusMutate(path: string, method: 'POST' | 'DELETE' = 'POST', body?: Record<string, unknown>): Promise<any> {
  const { getAudiusSession, getAudiusAccessToken, loginWithAudius } = await import('./audiusAuth');
  let session = getAudiusSession();
  let token = await getAudiusAccessToken();
  if (!session || !token || session.scope !== 'write') {
    session = await loginWithAudius({ scope: 'write' });
    token = session.accessToken;
  }
  const host = await getAudiusHost();
  const url = `${host}${path}?app_name=${APP_NAME}&user_id=${encodeURIComponent(session.userId)}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...audiusHeaders(),
      Authorization: `Bearer ${token}`,
      'X-User-ID': session.userId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Audius ${method} ${path} failed (${res.status})`);
  return res.json().catch(() => ({ ok: true }));
}

export async function followAudiusUser(targetUserId: string): Promise<boolean> {
  const cleanId = targetUserId.replace(/^audius:/, '');
  try {
    await audiusMutate(`/v1/users/${encodeURIComponent(cleanId)}/follow`, 'POST');
    return true;
  } catch (err) {
    console.error('[Audius] followAudiusUser:', err);
    return false;
  }
}

export async function unfollowAudiusUser(targetUserId: string): Promise<boolean> {
  const cleanId = targetUserId.replace(/^audius:/, '');
  try {
    await audiusMutate(`/v1/users/${encodeURIComponent(cleanId)}/follow`, 'DELETE');
    return true;
  } catch (err) {
    console.error('[Audius] unfollowAudiusUser:', err);
    return false;
  }
}

export async function favoriteAudiusTrack(trackId: string): Promise<boolean> {
  const cleanId = trackId.replace(/^audius_/, '');
  try {
    await audiusMutate(`/v1/tracks/${encodeURIComponent(cleanId)}/favorites`, 'POST');
    return true;
  } catch (err) {
    console.error('[Audius] favoriteAudiusTrack:', err);
    return false;
  }
}

export async function unfavoriteAudiusTrack(trackId: string): Promise<boolean> {
  const cleanId = trackId.replace(/^audius_/, '');
  try {
    await audiusMutate(`/v1/tracks/${encodeURIComponent(cleanId)}/favorites`, 'DELETE');
    return true;
  } catch (err) {
    console.error('[Audius] unfavoriteAudiusTrack:', err);
    return false;
  }
}

export async function repostAudiusTrack(trackId: string): Promise<boolean> {
  const cleanId = trackId.replace(/^audius_/, '');
  try {
    await audiusMutate(`/v1/tracks/${encodeURIComponent(cleanId)}/reposts`, 'POST');
    return true;
  } catch (err) {
    console.error('[Audius] repostAudiusTrack:', err);
    return false;
  }
}

export async function unrepostAudiusTrack(trackId: string): Promise<boolean> {
  const cleanId = trackId.replace(/^audius_/, '');
  try {
    await audiusMutate(`/v1/tracks/${encodeURIComponent(cleanId)}/reposts`, 'DELETE');
    return true;
  } catch (err) {
    console.error('[Audius] unrepostAudiusTrack:', err);
    return false;
  }
}

function mapAudiusComment(c: any): AudiusComment {
  const u = c.user ?? {};
  return {
    id: String(c.id ?? ''),
    userId: String(c.user_id ?? u.id ?? ''),
    userName: String(u.name ?? u.handle ?? 'Audius Listener'),
    userHandle: String(u.handle ?? ''),
    userAvatar: u.profile_picture?.['150x150'] ?? u.profile_picture?.['480x480'] ?? undefined,
    userVerified: !!u.is_verified,
    message: String(c.message ?? ''),
    trackTimestampS: typeof c.track_timestamp_s === 'number' ? c.track_timestamp_s : undefined,
    createdAt: c.created_at ? Date.parse(c.created_at) || Date.now() : Date.now(),
    reactCount: Number(c.react_count ?? 0),
    replies: Array.isArray(c.replies) ? c.replies.map(mapAudiusComment) : undefined,
  };
}

export async function fetchAudiusTrackComments(trackId: string, limit = 30): Promise<AudiusComment[]> {
  const cleanId = trackId.replace(/^audius_/, '');
  try {
    const data = await audiusFetch(`/v1/tracks/${encodeURIComponent(cleanId)}/comments`, { limit: String(limit) });
    return (data.data ?? []).map(mapAudiusComment);
  } catch {
    return [];
  }
}

export async function postAudiusTrackComment(
  trackId: string,
  message: string,
  trackTimestampS?: number
): Promise<AudiusComment | null> {
  const cleanId = trackId.replace(/^audius_/, '');
  try {
    const res = await audiusMutate('/v1/comments', 'POST', {
      entity_id: cleanId,
      entity_type: 'Track',
      body: message.trim(),
      ...(typeof trackTimestampS === 'number' ? { track_timestamp_s: Math.floor(trackTimestampS) } : {}),
    });
    const d = res?.data ?? res;
    if (d?.id) return mapAudiusComment(d);
    const { getAudiusSession } = await import('./audiusAuth');
    const s = getAudiusSession();
    return {
      id: `audius_c_${Date.now()}`,
      userId: s?.userId ?? '',
      userName: s?.name ?? 'You',
      userHandle: s?.handle ?? '',
      userAvatar: s?.profilePicture,
      userVerified: !!s?.verified,
      message: message.trim(),
      trackTimestampS,
      createdAt: Date.now(),
      reactCount: 0,
    };
  } catch (err) {
    console.error('[Audius] postAudiusTrackComment:', err);
    return null;
  }
}

export async function fetchAudiusFollowers(userId: string, limit = 30): Promise<AudiusArtist[]> {
  const cleanId = userId.replace(/^audius:/, '');
  try {
    const data = await audiusFetch(`/v1/users/${encodeURIComponent(cleanId)}/followers`, { limit: String(limit) });
    return (data.data ?? []).map(mapArtist);
  } catch {
    return [];
  }
}

export async function fetchAudiusFollowing(userId: string, limit = 30): Promise<AudiusArtist[]> {
  const cleanId = userId.replace(/^audius:/, '');
  try {
    const data = await audiusFetch(`/v1/users/${encodeURIComponent(cleanId)}/following`, { limit: String(limit) });
    return (data.data ?? []).map(mapArtist);
  } catch {
    return [];
  }
}

/**
 * Fetches recent track releases and reposts from the connected user's followed Audius artists,
 * normalized as FediversePost items so they weave chronologically into Plajah's main social timeline.
 */
export async function fetchAudiusSocialFeed(limit = 20): Promise<any[]> {
  try {
    const { getAudiusSession } = await import('./audiusAuth');
    const { fetchAudiusLibrary } = await import('./audiusLibrary');
    const session = getAudiusSession();
    if (!session?.userId) return [];

    const host = await getAudiusHost();
    const lib = await fetchAudiusLibrary({ limit: 25 });
    const followed = lib.following.slice(0, 8);

    // Fetch latest tracks from followed artists concurrently
    const rawTracksByArtist = await Promise.all(
      followed.map(async artist => {
        try {
          const data = await audiusFetch(`/v1/users/${encodeURIComponent(artist.id)}/tracks`, { limit: '4' });
          return (data.data ?? []).map((t: any) => ({ raw: t, artist }));
        } catch {
          return [];
        }
      })
    );

    const favIds = new Set(lib.favorites.map(f => f.id.replace(/^audius_/, '')));
    const repostIds = new Set(lib.reposts.map(r => r.id.replace(/^audius_/, '')));
    const flat = rawTracksByArtist.flat();

    const posts = flat.map(({ raw: t, artist }) => {
      const mapped = mapTrack(t, host);
      const createdAt = t.release_date
        ? Date.parse(t.release_date) || Date.now() - 3600_000
        : t.created_at
          ? Date.parse(t.created_at) || Date.now() - 3600_000
          : Date.now() - 3600_000;
      const desc = t.description ? String(t.description).trim() : '';
      const content = desc ? `🎵 ${mapped.title}${mapped.genre ? ` (${mapped.genre})` : ''}\n${desc}` : `🎵 Released "${mapped.title}"${mapped.genre ? ` · ${mapped.genre}` : ''}`;
      return {
        id: `audius_${t.id}`,
        uri: `audius://track/${t.id}`,
        protocol: 'audius',
        accountId: session.userId,
        authorHandle: `@${artist.handle}`,
        authorDisplayName: artist.name,
        authorAvatarUrl: artist.profilePicture || undefined,
        authorDid: `audius:${artist.id}`,
        content,
        contentText: content,
        createdAt,
        url: mapped.sourcePageUrl || `https://audius.co/${artist.handle}`,
        replyCount: Number(t.comment_count ?? 0),
        repostCount: Number(t.repost_count ?? 0),
        likeCount: Number(t.favorite_count ?? 0),
        isLiked: favIds.has(String(t.id)),
        isReposted: repostIds.has(String(t.id)),
        isBookmarked: false,
        media: [
          {
            type: 'audio' as const,
            url: mapped.url,
            previewUrl: mapped.thumbnailUrl,
            altText: `${mapped.title} — ${artist.name}`,
          },
        ],
      };
    });

    posts.sort((a, b) => b.createdAt - a.createdAt);
    return posts.slice(0, limit);
  } catch (err) {
    console.warn('[Audius] fetchAudiusSocialFeed:', err);
    return [];
  }
}

// ─── Native normalization (Audius → Plajah Album/Track) ────────────────────────
// So Audius content flows through the SAME native Chora album UI (PlayerView), the
// player, and artist pages — not a separate Audius-only shell. An Audius owner is
// tagged `audius:<userId>` so the app can route artist clicks to the Audius page.

export const AUDIUS_THEME = '#7E1BCC';
export const isAudiusOwner = (ownerId?: string) => !!ownerId && ownerId.startsWith('audius:');
export const audiusUserIdFromOwner = (ownerId?: string) => (ownerId || '').replace(/^audius:/, '');
export const audiusStreamUrlSync = (trackId: string): string => {
  const rawId = (trackId || '').replace(/^audius_/, '');
  return `${_cachedHost || FALLBACK_HOST}/v1/tracks/${rawId}/stream?app_name=${APP_NAME}`;
};

/** An aggregated Audius ArchiveTrack → a native, playable Track. */
export const archiveTrackToNativeTrack = (t: ArchiveTrack): Track => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  // Carry the Audius artist id so PlayerView's artist link resolves to the Audius
  // artist page (App.handleVisitUser routes `audius:<id>` owners there).
  artistId: t.artistId ? `audius:${t.artistId}` : undefined,
  url: t.url,                 // Audius stream URL — plays natively in <audio>
  albumCover: t.thumbnailUrl,
  images: t.thumbnailUrl ? [t.thumbnailUrl] : undefined,
  duration: t.duration,
  genre: t.genre,
  isGlobalArchive: true,
} as Track);

/** An Audius album/playlist (+ its tracks) → a native Album for PlayerView. */
export const audiusAlbumToNativeAlbum = (a: AudiusAlbum | AudiusPlaylist, tracks: ArchiveTrack[], curator?: AudiusArtist | null): Album => ({
  id: `audius:album:${a.id}`,
  title: a.title,
  artist: ('curator' in a ? a.curator : (a as AudiusPlaylist).curator) || curator?.name || 'Audius Artist',
  coverImage: 'artworkUrl' in a ? a.artworkUrl : '',
  type: 'MUSIC',
  subType: ('isAlbum' in a && (a as AudiusAlbum).isAlbum) ? 'ALBUM' : 'PLAYLIST',
  genre: tracks[0]?.genre,
  description: (a as any).description || (curator?.bio ? curator.bio.slice(0, 240) : ''),
  ownerId: `audius:${(a as any).curatorId || curator?.id || ''}`,
  createdAt: (a as any).releaseDate ? Date.parse((a as any).releaseDate) || Date.now() : Date.now(),
  themeColor: AUDIUS_THEME,
  tracks: tracks.map(archiveTrackToNativeTrack),
  source: 'AUDIUS',
  // Real deep link back to the album/playlist on Audius (OML attribution), with graceful fallbacks.
  audiusUrl: (a as any).permalink || (curator?.handle ? `https://audius.co/${curator.handle}` : 'https://audius.co/'),
} as any);

/** Resolve an `audius:album:<id>` into a full native Album (tracks + artist). */
export const resolveNativeAudiusAlbum = async (nativeId: string): Promise<Album | null> => {
  const id = nativeId.replace(/^audius:album:/, '');
  try {
    const [album, tracks] = await Promise.all([fetchAudiusAlbumById(id), fetchAudiusPlaylistTracks(id)]);
    if (!album) return null;
    const curator = album.curatorId ? await fetchAudiusArtistById(album.curatorId) : null;
    return audiusAlbumToNativeAlbum(album, tracks, curator);
  } catch { return null; }
};

/** One Audius track by its id (raw or `audius_`-prefixed). */
export async function fetchAudiusTrackById(trackId: string): Promise<ArchiveTrack | null> {
  try {
    const host = await getAudiusHost();
    const data = await audiusFetch(`/v1/tracks/${encodeURIComponent(trackId.replace(/^audius_/, ''))}`);
    return data?.data ? mapTrack(data.data, host) : null;
  } catch { return null; }
}

/** Any Audius share id → the native Album it was shared from:
 *  `audius:album:single_<trackId>` (a song), `audius:mix:<trackId>` (a long set),
 *  `audius:album:<playlistId>` (an album/playlist). Share links and notifications carry
 *  these ids; none of them live in Firestore, so the app must rebuild them from Audius. */
export async function resolveAudiusShareId(nativeId: string): Promise<Album | null> {
  const single = /^audius:album:single_(.+)$/.exec(nativeId);
  if (single) {
    const t = await fetchAudiusTrackById(single[1]);
    return t ? audiusTrackToNativeAlbum(t) : null;
  }
  const mix = /^audius:mix:(.+)$/.exec(nativeId);
  if (mix) {
    const t = await fetchAudiusTrackById(mix[1]);
    return t ? audiusTrackToMixAlbum(t) : null;
  }
  if (nativeId.startsWith('audius:album:')) return resolveNativeAudiusAlbum(nativeId);
  return null;
}

/** A long-form Audius set → a Chora Mix album, so it opens in MixPlayerView (waveform + Pixels
 *  auto-show) instead of the album view. Comments stay off: they live on a Plajah album doc. */
export const audiusTrackToMixAlbum = (t: ArchiveTrack): Album => ({
  ...audiusTrackToNativeAlbum(t),
  id: `audius:mix:${t.id.replace(/^audius_/, '')}`,
  subType: 'MIX',
  mixMeta: { source: 'AUDIUS', visualMode: 'AUTO', allowComments: false, durationSec: t.duration },
} as any);

const MIX_MIN_SEC = 20 * 60;
const MIX_QUERIES = ['dj mix', 'dj set', 'live set', 'mixtape', 'radio show'];
let mixCache: { at: number; tracks: ArchiveTrack[] } | null = null;

/** Long-form sets on Audius (≥ 20 min) for Chora Mixes: a few set-shaped searches plus trending,
 *  deduped, at most two per artist, most-played first. Cached for 10 minutes. */
export async function fetchAudiusMixes(limit = 18): Promise<ArchiveTrack[]> {
  if (mixCache && Date.now() - mixCache.at < 10 * 60_000) return mixCache.tracks.slice(0, limit);
  const results = await Promise.allSettled([
    ...MIX_QUERIES.map(q => searchAudius(q, 40)),
    fetchAudiusTrending(undefined, 100),
  ]);
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  const pool = results
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(t => (t.duration || 0) >= MIX_MIN_SEC && !!t.url && !!t.thumbnailUrl)
    .sort((a, b) => (Number((b as any).playCount) || 0) - (Number((a as any).playCount) || 0));
  const out: ArchiveTrack[] = [];
  for (const t of pool) {
    if (seen.has(t.id)) continue;
    const key = (t.artistId || t.artist || '').toLowerCase();
    if ((perArtist.get(key) || 0) >= 2) continue;
    seen.add(t.id);
    perArtist.set(key, (perArtist.get(key) || 0) + 1);
    out.push(t);
  }
  mixCache = { at: Date.now(), tracks: out };
  return out.slice(0, limit);
}

/** A single Audius track → a one-track native Album (native album UI for a song). */
export const audiusTrackToNativeAlbum = (t: ArchiveTrack, artistName?: string): Album => ({
  id: `audius:album:single_${t.id.replace(/^audius_/, '')}`,
  title: t.title,
  artist: t.artist || artistName || 'Audius Artist',
  coverImage: t.thumbnailUrl,
  type: 'MUSIC',
  subType: 'SINGLE',
  genre: t.genre,
  description: '',
  // Real Audius owner id (was hardcoded empty 'audius:', which broke the artist link).
  ownerId: t.artistId ? `audius:${t.artistId}` : 'audius:',
  createdAt: Date.now(),
  themeColor: AUDIUS_THEME,
  tracks: [archiveTrackToNativeTrack(t)],
  source: 'AUDIUS',
  audiusUrl: t.sourcePageUrl || 'https://audius.co/',
} as any);
