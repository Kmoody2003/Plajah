// musicRecommender — Chora's cross-catalog "up next" radio.
//
// When an album runs out, instead of stopping we keep the music going with a queue that
// BLENDS the native Chora catalog with Audius — but PRIORITIZES native Chora artists first
// (the platform exists for them; Audius is the deep well that fills in behind). Relevance is
// seeded from what's playing (genre / artist) and personalized by who you follow, your saved
// library, and popularity.
//
// Native vs Audius is discriminated by owner id: an `audius:<userId>` owner is Audius; anything
// else is a native Chora creator (a real Firestore uid). Native items always rank ahead of Audius
// items (that's the "native-first" guarantee); Audius supplies breadth and fills the tail.

import type { Album, Track } from '../types';
import { fetchAllPublicAlbums, fetchUserProfile, auth } from './backendService';
import {
  fetchAudiusChartsByGenre, fetchAudiusTrending, fetchAudiusArtistTracks,
  archiveTrackToNativeTrack, audiusTrackToNativeAlbum, isAudiusOwner,
} from './audiusService';
import { followedAudiusOwnerIds } from './audiusLibrary';

export interface UpNextItem { track: Track; album: Album; native: boolean; reason: string; }

interface Signals { followingIds: Set<string>; libraryIds: Set<string>; }

// ── Native catalog cache — fetchAllPublicAlbums is heavy; don't hit it every album-end. ──
let _albumsCache: { at: number; albums: Album[] } | null = null;
const ALBUMS_TTL = 5 * 60 * 1000;
async function nativeAlbums(): Promise<Album[]> {
  const now = Date.now();
  if (_albumsCache && now - _albumsCache.at < ALBUMS_TTL) return _albumsCache.albums;
  try {
    const albums = await fetchAllPublicAlbums();
    _albumsCache = { at: now, albums };
    return albums;
  } catch { return _albumsCache?.albums ?? []; }
}

let _signalsCache: { at: number; uid: string; signals: Signals } | null = null;
async function userSignals(): Promise<Signals> {
  const uid = auth.currentUser?.uid || '';
  const now = Date.now();
  if (_signalsCache && _signalsCache.uid === uid && now - _signalsCache.at < ALBUMS_TTL) return _signalsCache.signals;
  // Artists you follow ON AUDIUS count as follows here too — a connected Audius account
  // should steer the radio the same way a native follow does.
  const audiusFollows = followedAudiusOwnerIds();
  const empty: Signals = { followingIds: new Set(audiusFollows), libraryIds: new Set() };
  if (!uid) return empty;
  try {
    const profile: any = await fetchUserProfile(uid);
    const signals: Signals = {
      followingIds: new Set<string>([
        ...(Array.isArray(profile?.following) ? profile.following : []),
        ...audiusFollows,
      ]),
      libraryIds: new Set<string>(Array.isArray(profile?.library) ? profile.library : []),
    };
    _signalsCache = { at: now, uid, signals };
    return signals;
  } catch { return empty; }
}

const norm = (s?: string) => (s || '').trim().toLowerCase();

/** Relevance of a candidate track to the seed, independent of native/Audius. Higher = better fit. */
function relevance(
  track: Track, album: Album, seed: { genre?: string; artist?: string; artistId?: string },
  sig: Signals,
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const g = norm(track.genre) || norm(album.genre);
  if (seed.genre && g && g === norm(seed.genre)) { score += 50; reasons.push('same genre'); }
  const sameArtist = seed.artist && norm(track.artist || album.artist) === norm(seed.artist);
  if (sameArtist) { score += 35; reasons.push('same artist'); }
  if (album.ownerId && sig.followingIds.has(album.ownerId)) { score += 60; reasons.push('you follow'); }
  if (sig.libraryIds.has(track.id)) { score += 20; reasons.push('in your library'); }
  const pop = (track.likes || 0) + ((album as any).playCount || 0) + (track.playCount || 0);
  score += Math.min(20, Math.log10(1 + pop) * 8);
  // Small jitter so a fixed seed doesn't always produce the identical order.
  score += Math.random() * 6;
  return { score, reason: reasons[0] || 'popular now' };
}

/**
 * Build a native-first "up next" radio queue seeded from the current track/album.
 * Native candidates (relevant to the seed) always come before Audius candidates.
 * Resilient: returns [] on any failure so the player simply stops as it did before.
 */
export async function buildRadioQueue(
  seedTrack: Track,
  seedAlbum: Album | null,
  exclude: Set<string>,
  opts: { limit?: number } = {},
): Promise<UpNextItem[]> {
  const limit = opts.limit ?? 20;
  const seed = {
    genre: seedTrack.genre || seedAlbum?.genre,
    artist: seedTrack.artist || seedAlbum?.artist,
    artistId: (seedTrack as any).artistId || seedAlbum?.ownerId,
  };
  const skip = new Set(exclude);
  skip.add(seedTrack.id);
  seedAlbum?.tracks?.forEach(t => skip.add(t.id)); // don't recommend the album we just finished

  const [albums, sig] = await Promise.all([nativeAlbums(), userSignals()]);

  // ── Native candidates (Chora artists only) ──
  const native: UpNextItem[] = [];
  for (const album of albums) {
    if (isAudiusOwner(album.ownerId)) continue;               // Audius mirror, not a native artist
    if (album.type && album.type !== 'MUSIC') continue;
    if (!album.tracks?.length) continue;
    for (const t of album.tracks) {
      if (!t?.id || skip.has(t.id) || !t.url) continue;
      const { score, reason } = relevance(t, album, seed, sig);
      // Keep native tracks that have SOME signal (genre/artist/follow/library/popularity);
      // a floor avoids dumping the whole unrelated native catalog.
      if (score < 8) continue;
      native.push({ track: t, album, native: true, reason });
      (native[native.length - 1] as any)._score = score;
    }
  }
  native.sort((a, b) => (b as any)._score - (a as any)._score);

  // ── Audius fill — genre-matched first, then trending. ──
  let audius: UpNextItem[] = [];
  try {
    // Artists the listener follows on Audius come FIRST in the Audius tail — a connected
    // library should be felt in the radio, not just genre charts and global trending.
    const followed = followedAudiusOwnerIds().slice(0, 3).map(id => id.replace(/^audius:/, ''));
    const [fromFollows, byGenre, trending] = await Promise.all([
      followed.length
        ? Promise.all(followed.map(id => fetchAudiusArtistTracks(id, 5).catch(() => [])))
            .then(rs => rs.flat())
        : Promise.resolve([]),
      seed.genre ? fetchAudiusChartsByGenre(seed.genre, 15).catch(() => []) : Promise.resolve([]),
      fetchAudiusTrending(undefined, 15).catch(() => []),
    ]);
    const seen = new Set<string>();
    for (const at of [...fromFollows, ...byGenre, ...trending]) {
      const nt = archiveTrackToNativeTrack(at);
      if (!nt.id || skip.has(nt.id) || seen.has(nt.id) || !nt.url) continue;
      seen.add(nt.id);
      const album = audiusTrackToNativeAlbum(at);
      const { score, reason } = relevance(nt, album, seed, sig);
      audius.push({ track: nt, album, native: false, reason });
      (audius[audius.length - 1] as any)._score = score;
    }
    audius.sort((a, b) => (b as any)._score - (a as any)._score);
  } catch { audius = []; }

  // Native-first: every relevant native track ranks ahead of any Audius track.
  const out: UpNextItem[] = [];
  const used = new Set<string>();
  for (const item of [...native, ...audius]) {
    if (used.has(item.track.id)) continue;
    used.add(item.track.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Drop the cached native catalog / signals (e.g. after a new upload or follow). */
export function resetRecommenderCaches(): void {
  _albumsCache = null;
  _signalsCache = null;
}
