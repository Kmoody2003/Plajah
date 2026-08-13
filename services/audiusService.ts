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
  loginWithAudius, logoutAudius, getAudiusSession, getAudiusAccessToken,
  completeAudiusRedirect, AUDIUS_SESSION_EVENT,
} from './audiusAuth';
export type { AudiusSession, AudiusScope } from './audiusAuth';

// ─── Publish (Chora → Audius) ─────────────────────────────────────────────────

export interface AudiusPublishResult {
  trackId: string;
  permalink: string;
}

export async function publishTrackToAudius(
  track: Track,
  album: Album,
  bearerToken: string,
  audiusUserId: string
): Promise<AudiusPublishResult | null> {
  try {
    const host = await getAudiusHost();
    const audioRes = await fetch(track.url);
    if (!audioRes.ok) throw new Error('Could not fetch audio file');
    const audioBlob = await audioRes.blob();

    let coverBlob: Blob | null = null;
    const coverUrl = track.albumCover ?? album.coverImage;
    if (coverUrl) {
      try {
        const coverRes = await fetch(coverUrl);
        if (coverRes.ok) coverBlob = await coverRes.blob();
      } catch { /* continue without cover */ }
    }

    const form = new FormData();
    form.append('track_file', audioBlob, `${track.title ?? 'track'}.mp3`);
    if (coverBlob) form.append('cover_art_file', coverBlob, 'cover.jpg');
    form.append('metadata', JSON.stringify({
      title: track.title ?? album.title,
      genre: track.genre ?? album.genre ?? 'Electronic',
      mood: 'Other',
      description: album.description ?? '',
      is_downloadable: false,
      is_unlisted: false,
    }));

    const uploadRes = await fetch(`${host}/v1/tracks?app_name=${APP_NAME}`, {
      method: 'POST',
      headers: { ...audiusHeaders(), Authorization: `Bearer ${bearerToken}`, 'X-User-ID': audiusUserId },
      body: form,
    });
    if (!uploadRes.ok) return null;
    const uploadData = await uploadRes.json();
    const trackId: string = uploadData.data?.id ?? uploadData.id;
    return { trackId, permalink: `https://audius.co/tracks/${trackId}` };
  } catch (err) {
    console.error('[Audius] publishTrackToAudius:', err);
    return null;
  }
}

export async function publishAlbumToAudius(
  album: Album,
  bearerToken: string,
  audiusUserId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ published: AudiusPublishResult[]; failed: string[] }> {
  const tracks = album.tracks ?? [];
  const published: AudiusPublishResult[] = [];
  const failed: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const result = await publishTrackToAudius(tracks[i], album, bearerToken, audiusUserId);
    result ? published.push(result) : failed.push(tracks[i].title ?? `Track ${i + 1}`);
    onProgress?.(i + 1, tracks.length);
  }
  return { published, failed };
}

export function generateAudiusUploadLink(): string {
  return `https://audius.co/upload?app_name=${APP_NAME}&ref=plajah`;
}

// ─── Native normalization (Audius → Plajah Album/Track) ────────────────────────
// So Audius content flows through the SAME native Chora album UI (PlayerView), the
// player, and artist pages — not a separate Audius-only shell. An Audius owner is
// tagged `audius:<userId>` so the app can route artist clicks to the Audius page.

export const AUDIUS_THEME = '#7E1BCC';
export const isAudiusOwner = (ownerId?: string) => !!ownerId && ownerId.startsWith('audius:');
export const audiusUserIdFromOwner = (ownerId?: string) => (ownerId || '').replace(/^audius:/, '');

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
