// Audius decentralized music platform integration
// Read: trending, search, stream (no auth required)
// Write: publish albums/tracks to Audius via OAuth + content API

import type { ArchiveTrack } from './archiveContentService';
import type { Album, Track } from '../types';

const APP_NAME = 'Plajah';
const FALLBACK_HOST = 'https://discoveryprovider.audius.co';
const HOST_CACHE_TTL = 1000 * 60 * 60; // 1 hour

let _cachedHost: string | null = null;
let _hostCachedAt = 0;

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
  } catch {
    // fall through to fallback
  }
  _cachedHost = FALLBACK_HOST;
  _hostCachedAt = now;
  return _cachedHost;
}

// ─── Read API ─────────────────────────────────────────────────────────────────

function mapTrack(t: any, host: string): ArchiveTrack {
  return {
    id: `audius_${t.id}`,
    title: t.title ?? 'Untitled',
    artist: t.user?.name ?? t.user?.handle ?? 'Unknown Artist',
    url: `${host}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    thumbnailUrl:
      t.artwork?.['480x480'] ??
      t.artwork?.['150x150'] ??
      `https://audius.co/artwork/${t.id}/480x480.jpg`,
    source: 'AUDIUS' as const,
    genre: t.genre ?? undefined,
    duration: t.duration ?? undefined,
  };
}

export async function fetchAudiusTrending(
  genre?: string,
  limit = 20
): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const params = new URLSearchParams({ app_name: APP_NAME, limit: String(limit) });
    if (genre) params.set('genre', genre);
    const res = await fetch(`${host}/v1/tracks/trending?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusTrending error:', err);
    return [];
  }
}

export async function searchAudius(query: string, limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    const params = new URLSearchParams({ app_name: APP_NAME, query, limit: String(limit) });
    const res = await fetch(`${host}/v1/tracks/search?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return (data.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] searchAudius error:', err);
    return [];
  }
}

export async function fetchAudiusUserTracks(handle: string, limit = 20): Promise<ArchiveTrack[]> {
  try {
    const host = await getAudiusHost();
    // Resolve handle → userId
    const userRes = await fetch(
      `${host}/v1/users/handle/${encodeURIComponent(handle)}?app_name=${APP_NAME}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const userData = await userRes.json();
    const userId: string | undefined = userData.data?.id;
    if (!userId) return [];

    const tracksRes = await fetch(
      `${host}/v1/users/${userId}/tracks?app_name=${APP_NAME}&limit=${limit}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const tracksData = await tracksRes.json();
    return (tracksData.data ?? []).map((t: any) => mapTrack(t, host));
  } catch (err) {
    console.error('[Audius] fetchAudiusUserTracks error:', err);
    return [];
  }
}

export async function getAudiusStreamUrl(rawTrackId: string): Promise<string> {
  const id = rawTrackId.replace('audius_', '');
  const host = await getAudiusHost();
  return `${host}/v1/tracks/${id}/stream?app_name=${APP_NAME}`;
}

// ─── OAuth Connect ────────────────────────────────────────────────────────────
// Audius uses a popup-based OAuth flow. We open audius.co/oauth/auth,
// capture the returned code via postMessage, then exchange it for a JWT.

const AUDIUS_OAUTH_BASE = 'https://audius.co/oauth/auth';

export interface AudiusConnectResult {
  userId: string;
  handle: string;
  name: string;
  profilePicture?: string;
  token: string; // bearer token for write API calls
}

export function openAudiusOAuth(redirectUri: string): Window | null {
  const params = new URLSearchParams({
    scope: 'write',
    app_name: APP_NAME,
    redirect_uri: redirectUri,
    response_type: 'code',
  });
  return window.open(
    `${AUDIUS_OAUTH_BASE}?${params}`,
    'audius_oauth',
    'width=520,height=680,scrollbars=yes'
  );
}

export async function exchangeAudiusCode(code: string, redirectUri: string): Promise<AudiusConnectResult | null> {
  try {
    const host = await getAudiusHost();
    const res = await fetch(`${host}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri, app_name: APP_NAME }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      userId: data.data?.user_id ?? data.user_id,
      handle: data.data?.handle ?? data.handle,
      name: data.data?.name ?? data.name,
      profilePicture: data.data?.profile_picture?.['150x150'],
      token: data.data?.token ?? data.token,
    };
  } catch {
    return null;
  }
}

// ─── Publish (Chora → Audius) ─────────────────────────────────────────────────
// Uploads a track's audio file from Firebase Storage to an Audius content node.
// Requires the user to have completed the OAuth flow (bearerToken stored in UserProfile).

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

    // 1. Fetch audio from the platform URL as a Blob
    const audioRes = await fetch(track.url);
    if (!audioRes.ok) throw new Error('Could not fetch audio file');
    const audioBlob = await audioRes.blob();

    // 2. Fetch cover art as a Blob (optional)
    let coverBlob: Blob | null = null;
    const coverUrl = track.albumCover ?? album.coverImage;
    if (coverUrl) {
      try {
        const coverRes = await fetch(coverUrl);
        if (coverRes.ok) coverBlob = await coverRes.blob();
      } catch { /* continue without cover */ }
    }

    // 3. Build multipart form
    const form = new FormData();
    form.append('track_file', audioBlob, `${track.title ?? 'track'}.mp3`);
    if (coverBlob) form.append('cover_art_file', coverBlob, 'cover.jpg');

    const metadata = {
      title: track.title ?? album.title,
      genre: track.genre ?? album.genre ?? 'Electronic',
      mood: 'Other',
      description: album.description ?? '',
      is_downloadable: false,
      is_unlisted: false,
      field_visibility: { mood: true, tags: true, genre: true, share: true, play_count: true, remixes: true },
    };
    form.append('metadata', JSON.stringify(metadata));

    // 4. POST to Audius upload endpoint
    const uploadRes = await fetch(`${host}/v1/tracks?app_name=${APP_NAME}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}`, 'X-User-ID': audiusUserId },
      body: form,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[Audius] Upload failed:', errText);
      return null;
    }

    const uploadData = await uploadRes.json();
    const trackId: string = uploadData.data?.id ?? uploadData.id;
    const permalink = `https://audius.co/tracks/${trackId}`;

    return { trackId, permalink };
  } catch (err) {
    console.error('[Audius] publishTrackToAudius error:', err);
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
    if (result) {
      published.push(result);
    } else {
      failed.push(tracks[i].title ?? `Track ${i + 1}`);
    }
    onProgress?.(i + 1, tracks.length);
  }

  return { published, failed };
}

// ─── Deep-link fallback (no OAuth) ───────────────────────────────────────────
// When the artist hasn't connected Audius, open their upload page with metadata pre-filled.

export function generateAudiusUploadLink(album: Album): string {
  const params = new URLSearchParams({
    app_name: APP_NAME,
    ref: 'plajah',
  });
  return `https://audius.co/upload?${params}`;
}
