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

/**
 * Where the continuous station is RIGHT NOW: which track and how many seconds into it. Anchored at
 * midnight UTC so the rotation is stable across the day and identical for every listener.
 */
export function getSatellitePosition(tracks: Track[]): SatellitePosition {
  if (!tracks.length) return { trackIndex: 0, offsetSeconds: 0 };

  const now = Date.now();
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const msIntoDay = now - dayStart;

  const durations = tracks.map(t => (t.duration ?? 180) * 1000); // ms; 3-min fallback
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

  const durations = tracks.map(t => (t.duration ?? 180) * 1000);
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
