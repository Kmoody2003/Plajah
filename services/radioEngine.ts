// Plajah FM engine — the ONE reusable radio playout engine.
//
// This is the "satellite radio" positioning that powers BOTH the platform-wide Plajah FM station
// (global stream every user feeds into) AND every individual artist/user radio station. A station is
// a continuous 24/7 loop; when you tune in you join wherever the broadcast currently is — deterministic
// and wall-clock-anchored (midnight UTC), so every listener hears the same thing at the same moment.
//
// Extracted from RadioView so the same engine drives the global station, a creator's own station, and
// the radio scheduler's playout (RadioView feeds it a schedule-ordered queue when a schedule exists).

import type { Track } from '../types';

export interface SatellitePosition {
  trackIndex: number;
  offsetSeconds: number; // how far into the current track we are
}

export interface RecentlyPlayed { track: Track; playedAt: Date }

const DAY_MS = 24 * 60 * 60 * 1000;

/** A song with no known length is assumed to run this long (a typical single). */
export const FALLBACK_SONG_SEC = 210;

/**
 * Seconds a song runs on the station clock. Uses the real length when known; a value too big to be
 * seconds (> 4h) was stored in milliseconds; anything missing or broken falls back to a typical single.
 */
export function stationLength(t: { duration?: unknown }): number {
  const d = typeof t.duration === 'number' ? t.duration : Number(t.duration);
  if (!Number.isFinite(d) || d <= 0) return FALLBACK_SONG_SEC;
  return d > 4 * 3600 ? d / 1000 : d;
}

/**
 * Where the continuous station is RIGHT NOW: which track and how many seconds into it. Anchored at
 * midnight UTC so the rotation is stable across the day and identical for every listener.
 */
export function getSatellitePosition(tracks: Track[]): SatellitePosition {
  return getSatellitePositionAt(tracks, Date.now());
}

/** The station position at a given instant (testable). */
export function getSatellitePositionAt(tracks: Track[], now: number): SatellitePosition {
  if (!tracks.length) return { trackIndex: 0, offsetSeconds: 0 };
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const msIntoDay = now - dayStart;

  const durations = tracks.map(t => stationLength(t) * 1000);
  const totalMs = durations.reduce((s, d) => s + d, 0);
  if (totalMs === 0) return { trackIndex: 0, offsetSeconds: 0 };

  const positionMs = msIntoDay % totalMs;
  let elapsed = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (elapsed + durations[i] > positionMs) {
      return { trackIndex: i, offsetSeconds: (positionMs - elapsed) / 1000 };
    }
    elapsed += durations[i];
  }
  return { trackIndex: 0, offsetSeconds: 0 };
}

/** What played over the last `windowMs`, newest first — walks the same deterministic rotation back. */
export function getRecentlyPlayed(tracks: Track[], windowMs = 15 * 60 * 1000): RecentlyPlayed[] {
  if (!tracks.length) return [];
  const now = Date.now();
  const windowStart = now - windowMs;
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;

  const durations = tracks.map(t => stationLength(t) * 1000);
  const totalMs = durations.reduce((s, d) => s + d, 0);
  if (totalMs === 0) return [];

  const result: RecentlyPlayed[] = [];
  let checkMs = now;
  const seen = new Set<number>();

  while (checkMs >= windowStart && result.length < 8) {
    const msIntoDay = (checkMs - dayStart + DAY_MS) % DAY_MS;
    const posInPlaylist = msIntoDay % totalMs;
    let elapsed = 0;
    for (let i = 0; i < tracks.length; i++) {
      if (elapsed + durations[i] > posInPlaylist) {
        if (!seen.has(i)) {
          seen.add(i);
          const startedAt = checkMs - (posInPlaylist - elapsed);
          result.push({ track: tracks[i], playedAt: new Date(startedAt) });
        }
        checkMs -= (posInPlaylist - elapsed) + 1000;
        break;
      }
      elapsed += durations[i];
    }
  }

  return result.filter(r => r.playedAt.getTime() >= windowStart).sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
}

// ── Station albums ───────────────────────────────────────────────────────────────────────────────
// A tuned-in station hands the global player an Album whose tracks are the rotation. These ids mark
// it as a STATION (not a playlist), so the player keeps it on air: it stays a RADIO play, wraps at
// the end of the rotation like a 24/7 broadcast, and never falls into the cross-catalog "up next".

export const PLAJAH_FM_ALBUM_ID = 'radio_station';
export const ARTIST_STATION_PREFIX = 'artist_radio_';

export function stationAlbumId(artistId?: string | null): string {
  return artistId ? `${ARTIST_STATION_PREFIX}${artistId}` : PLAJAH_FM_ALBUM_ID;
}

export function isStationAlbum(album: { id?: string } | null | undefined): boolean {
  const id = album?.id;
  return !!id && (id === PLAJAH_FM_ALBUM_ID || id.startsWith(ARTIST_STATION_PREFIX));
}

/** The song after `currentId` in a station rotation — wraps to the top, like a broadcast loop. */
export function nextInRotation<T extends { id: string }>(tracks: T[], currentId: string | null | undefined): T | null {
  if (!tracks.length) return null;
  const i = currentId ? tracks.findIndex(t => t.id === currentId) : -1;
  return tracks[(i + 1) % tracks.length] ?? null;
}

// ── Plajah FM rotation ───────────────────────────────────────────────────────────────────────────

/** Small deterministic PRNG so every listener builds the same rotation from the same seed. */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Today's rotation seed (UTC day) — the station reshuffles once a day, the same for everyone. */
export function rotationSeed(now: number = Date.now()): string {
  return new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Plajah FM's day: every playable song once, shuffled the same way for every listener, with albums
 * spread out so one record doesn't play straight through. Songs known to be empty (length 0) and
 * duplicates (same id or same file) are left out. `lengths` are real seconds from /api/onair/durations.
 */
export function buildRotation<T extends Track>(tracks: T[], lengths: Record<string, number | null> = {}, seed: string = rotationSeed()): T[] {
  const seenId = new Set<string>(), seenUrl = new Set<string>();
  const groups = new Map<string, T[]>();
  // Sorted first so which copy of a duplicate survives never depends on Firestore's order.
  for (const t of [...tracks].filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!t?.id || seenId.has(t.id)) continue;
    const urlKey = (t.url || '').split('?')[0];
    if (urlKey && seenUrl.has(urlKey)) continue;
    const len = lengths[t.id];
    if (len === 0) continue;                               // empty file — would freeze the station
    seenId.add(t.id); if (urlKey) seenUrl.add(urlKey);
    const withLen = (typeof len === 'number' && len > 0 ? { ...t, duration: len } : t) as T;
    const g = (t as any).albumId || t.artistId || 'misc';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(withLen);
  }
  const rnd = seeded(seed);
  const shuffle = <X,>(a: X[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // Sort keys and songs first so Firestore's return order can't change the result.
  const lists = shuffle([...groups.keys()].sort()).map(k => shuffle(groups.get(k)!));
  // Spread each album evenly across the day (each song placed at its fractional position).
  const placed: { t: T; pos: number }[] = [];
  for (const list of lists) {
    const off = rnd();
    list.forEach((t, i) => placed.push({ t, pos: (i + off) / list.length }));
  }
  placed.sort((a, b) => a.pos - b.pos);
  return placed.map(p => p.t);
}

/**
 * Where to start when someone tunes in: the live position, except in a song's last 20 seconds — then
 * the next song from the top, so nobody joins just to hear a fade-out.
 */
export function tuneInPoint(tracks: Track[], now: number = Date.now()): SatellitePosition {
  const pos = getSatellitePositionAt(tracks, now);
  if (!tracks.length) return pos;
  const left = stationLength(tracks[pos.trackIndex]) - pos.offsetSeconds;
  if (left < 20) return { trackIndex: (pos.trackIndex + 1) % tracks.length, offsetSeconds: 0 };
  return pos;
}
