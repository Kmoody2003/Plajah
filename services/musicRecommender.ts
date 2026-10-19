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
import { fetchAllPublicAlbums, fetchUserProfile, fetchFollowingIds, auth } from './backendService';
import {
  fetchAudiusChartsByGenre, fetchAudiusTrending, fetchAudiusUnderground, fetchAudiusArtistTracks,
  archiveTrackToNativeTrack, audiusTrackToNativeAlbum, isAudiusOwner,
} from './audiusService';
import { fetchAudiusLibrary, followedAudiusOwnerIds } from './audiusLibrary';
import { getTasteVector, type TasteVector } from './tasteService';

export interface UpNextItem { track: Track; album: Album; native: boolean; reason: string; }

interface Signals { followingIds: Set<string>; libraryIds: Set<string>; taste: TasteVector; }
const EMPTY_TASTE: TasteVector = { genres: {}, artists: {}, loved: [], disliked: [], count: 0 };

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
  // Hydrate Audius library follows if a session is connected so followed Audius artists steer recommendations.
  await fetchAudiusLibrary().catch(() => null);
  const audiusFollows = followedAudiusOwnerIds();
  const empty: Signals = { followingIds: new Set(audiusFollows), libraryIds: new Set(), taste: EMPTY_TASTE };
  if (!uid) return empty;
  try {
    const [profile, taste, followIds] = await Promise.all([fetchUserProfile(uid) as any, getTasteVector(), fetchFollowingIds(uid).catch(() => [] as string[])]);
    const signals: Signals = {
      followingIds: new Set<string>([
        ...followIds, // `follows` collection; UserProfile.following is never written
        ...audiusFollows,
      ]),
      libraryIds: new Set<string>(Array.isArray(profile?.library) ? profile.library : []),
      taste,
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
  // A track you thumbed down is excluded outright (a strongly negative score is dropped by the floor).
  if (sig.taste.disliked.includes(track.id)) return { score: -1000, reason: 'you passed on this' };
  let score = 0;
  const reasons: string[] = [];
  const g = norm(track.genre) || norm(album.genre);
  if (seed.genre && g && g === norm(seed.genre)) { score += 50; reasons.push('same genre'); }
  const sameArtist = seed.artist && norm(track.artist || album.artist) === norm(seed.artist);
  if (sameArtist) { score += 35; reasons.push('same artist'); }
  if (album.ownerId && sig.followingIds.has(album.ownerId)) { score += 60; reasons.push('you follow'); }
  if (sig.libraryIds.has(track.id)) { score += 20; reasons.push('in your library'); }
  // ── Taste affinity — genres/artists you've liked or loved bias the pick (dislikes penalize). ──
  const tg = track.genre || album.genre;
  const gw = tg ? sig.taste.genres[tg] : undefined;
  if (gw) { score += Math.max(-40, Math.min(45, gw * 6)); if (gw > 0) reasons.unshift('your taste'); }
  const aid = (track as any).artistId || album.ownerId;
  const aw = aid ? sig.taste.artists[aid] : undefined;
  if (aw) { score += Math.max(-45, Math.min(55, aw * 8)); if (aw > 0) reasons.unshift('an artist you love'); }
  const pop = (track.likes || 0) + ((album as any).playCount || 0) + (track.playCount || 0);
  score += Math.min(20, Math.log10(1 + pop) * 8);
  // Small jitter so a fixed seed doesn't always produce the identical order.
  score += Math.random() * 6;
  return { score, reason: reasons[0] || 'popular now' };
}

/**
 * Round-robin diversify a scored list by a grouping key (e.g. albumId or artistId) so one
 * multi-track album or prolific artist doesn't monopolize consecutive slots.
 */
export function diversifyByKey(items: UpNextItem[], keyOf: (item: UpNextItem) => string): UpNextItem[] {
  const buckets = new Map<string, UpNextItem[]>();
  for (const item of items) {
    const key = keyOf(item) || item.track.id;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  const groups = Array.from(buckets.values());
  const out: UpNextItem[] = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const group of groups) {
      if (round < group.length) {
        out.push(group[round]);
        added = true;
      }
    }
    round++;
  }
  return out;
}

/**
 * Interleave Native Plajah Chora items with Audius items while strictly leading with
 * `nativePerAudius` native items first in every cycle so native Chora releases are prioritized
 * first and Audius artists/tracks are guaranteed in the mix.
 */
export function interleaveNativeFirst(
  native: UpNextItem[],
  audius: UpNextItem[],
  limit = 20,
  nativePerAudius = 2,
): UpNextItem[] {
  const step = Math.max(1, nativePerAudius);
  const out: UpNextItem[] = [];
  const used = new Set<string>();
  let nIdx = 0;
  let aIdx = 0;

  const takeNext = (pool: UpNextItem[], startIdx: number): { item: UpNextItem | null; nextIdx: number } => {
    let i = startIdx;
    while (i < pool.length) {
      const candidate = pool[i++];
      if (!used.has(candidate.track.id)) {
        used.add(candidate.track.id);
        return { item: candidate, nextIdx: i };
      }
    }
    return { item: null, nextIdx: i };
  };

  while (out.length < limit && (nIdx < native.length || aIdx < audius.length)) {
    // 1. Prioritize Native Plajah Chora tracks first in each cycle
    for (let k = 0; k < step && out.length < limit; k++) {
      const res = takeNext(native, nIdx);
      nIdx = res.nextIdx;
      if (res.item) out.push(res.item);
      else break;
    }
    if (out.length >= limit) break;
    // 2. Weave in an Audius artist track for discovery
    const aRes = takeNext(audius, aIdx);
    aIdx = aRes.nextIdx;
    if (aRes.item) {
      out.push(aRes.item);
    } else if (nIdx >= native.length) {
      break;
    }
  }
  return out;
}

/**
 * Build a native-first "up next" radio queue seeded from the current track/album.
 * Native Plajah Chora albums/tracks are ALWAYS prioritized first, while Audius tracks and
 * artists are woven into the mix (2 Native : 1 Audius) so listeners discover new music.
 * Resilient: returns [] on any failure so the player simply stops as it did before.
 */
export async function buildRadioQueue(
  seedTrack: Track,
  seedAlbum: Album | null,
  exclude: Set<string>,
  opts: { limit?: number; nativePerAudius?: number } = {},
): Promise<UpNextItem[]> {
  const limit = opts.limit ?? 20;
  const nativePerAudius = Math.max(1, opts.nativePerAudius ?? 2);
  const seed = {
    genre: seedTrack.genre || seedAlbum?.genre,
    artist: seedTrack.artist || seedAlbum?.artist,
    artistId: (seedTrack as any).artistId || seedAlbum?.ownerId,
  };
  const skip = new Set(exclude);
  if (seedTrack.id) skip.add(seedTrack.id);
  seedAlbum?.tracks?.forEach(t => skip.add(t.id)); // don't recommend the album we just finished

  const [albums, sig] = await Promise.all([nativeAlbums(), userSignals()]);

  // ── Native candidates (Chora artists only) ──
  const nativePrimary: UpNextItem[] = [];
  const nativeFallback: UpNextItem[] = [];
  for (const album of albums) {
    if (isAudiusOwner(album.ownerId)) continue;               // Audius mirror, not a native artist
    if (album.type && album.type !== 'MUSIC') continue;
    if (!album.tracks?.length) continue;
    for (const t of album.tracks) {
      if (!t?.id || skip.has(t.id) || !t.url) continue;
      const { score, reason } = relevance(t, album, seed, sig);
      if (score < 0) continue; // explicitly disliked
      const item: UpNextItem = { track: t, album, native: true, reason };
      (item as any)._score = score;
      if (score >= 8) {
        nativePrimary.push(item);
      } else {
        nativeFallback.push(item);
      }
    }
  }
  nativePrimary.sort((a, b) => (b as any)._score - (a as any)._score);
  nativeFallback.sort((a, b) => (b as any)._score - (a as any)._score);
  // Diversify across native albums so a single multi-track album doesn't crowd out other native releases or Audius discovery.
  const native = [
    ...diversifyByKey(nativePrimary, it => it.album.id || it.album.ownerId || ''),
    ...diversifyByKey(nativeFallback, it => it.album.id || it.album.ownerId || ''),
  ];

  // ── Audius discovery pool — followed artists first, then genre-matched, trending, and underground. ──
  let audius: UpNextItem[] = [];
  try {
    // Artists the listener follows on Audius come FIRST in the Audius pool — a connected
    // library should be felt in the radio, alongside genre charts, trending, and underground discovery.
    const followed = followedAudiusOwnerIds().slice(0, 4).map(id => id.replace(/^audius:/, ''));
    const [fromFollows, byGenre, trending, underground] = await Promise.all([
      followed.length
        ? Promise.all(followed.map(id => fetchAudiusArtistTracks(id, 5).catch(() => [])))
            .then(rs => rs.flat())
        : Promise.resolve([]),
      seed.genre ? fetchAudiusChartsByGenre(seed.genre, 15).catch(() => []) : Promise.resolve([]),
      fetchAudiusTrending(undefined, 15).catch(() => []),
      fetchAudiusUnderground(10).catch(() => []),
    ]);
    const undergroundIds = new Set(underground.map(u => `audius_${u.id}`));
    const seen = new Set<string>();
    const rawAudius: UpNextItem[] = [];
    for (const at of [...fromFollows, ...byGenre, ...trending, ...underground]) {
      const nt = archiveTrackToNativeTrack(at);
      if (!nt.id || skip.has(nt.id) || seen.has(nt.id) || !nt.url) continue;
      seen.add(nt.id);
      const album = audiusTrackToNativeAlbum(at);
      const { score, reason } = relevance(nt, album, seed, sig);
      if (score < 0) continue; // explicitly disliked
      const displayReason =
        reason === 'popular now' && undergroundIds.has(nt.id)
          ? 'discover on Audius'
          : reason === 'popular now'
            ? 'trending on Audius'
            : reason;
      const item: UpNextItem = { track: nt, album, native: false, reason: displayReason };
      (item as any)._score = score;
      rawAudius.push(item);
    }
    rawAudius.sort((a, b) => (b as any)._score - (a as any)._score);
    // Diversify across Audius artists so the listener discovers multiple Audius creators in the mix.
    audius = diversifyByKey(rawAudius, it => it.album.ownerId || norm(it.track.artist || it.album.artist));
  } catch { audius = []; }

  return interleaveNativeFirst(native, audius, limit, nativePerAudius);
}

/** Drop the cached native catalog / signals (e.g. after a new upload or follow). */
export function resetRecommenderCaches(): void {
  _albumsCache = null;
  _signalsCache = null;
}
