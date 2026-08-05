import { useState, useEffect, useCallback } from 'react';
import { Album, Track, HideNSeekAlternate, HideNSeekConfig } from '../types';
import { auth, fetchHideNSeekAlternates, fetchHideNSeekProgress, recordHideNSeekDiscovery, fetchHideNSeekStats } from '../services/backendService';
import { useAchievements } from '../contexts/AchievementContext';

// ─── Scheduling helpers ───────────────────────────────────────────────────────

/** Returns true if the current moment falls inside any of the album's H&S windows. */
export function isHideNSeekActive(config?: HideNSeekConfig): boolean {
  if (!config?.isEnabled || !config.windows?.length) return false;
  const now = new Date();
  const dayOfWeek = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return config.windows.some(w => {
    if (!w.daysOfWeek.includes(dayOfWeek)) return false;
    const [h, m] = w.startTime.split(':').map(Number);
    const start = h * 60 + m;
    const end = start + 180; // 3 hours
    return nowMinutes >= start && nowMinutes < end;
  });
}

/** Validate that a new window doesn't overlap an existing one and that max 3 windows per day. */
export function validateHideNSeekWindow(
  config: HideNSeekConfig,
  newStart: string,
  newDays: number[],
  excludeId?: string
): string | null {
  const activeWindows = config.windows.filter(w => w.id !== excludeId);
  if (activeWindows.length >= 3) return 'Maximum 3 windows allowed per day.';
  const [nh, nm] = newStart.split(':').map(Number);
  const newStartMin = nh * 60 + nm;
  const newEndMin = newStartMin + 180;
  for (const w of activeWindows) {
    const sharedDay = w.daysOfWeek.some(d => newDays.includes(d));
    if (!sharedDay) continue;
    const [wh, wm] = w.startTime.split(':').map(Number);
    const wStartMin = wh * 60 + wm;
    const wEndMin = wStartMin + 180;
    // Require at least 60-min gap between windows
    const gapBefore = newStartMin - wEndMin;
    const gapAfter = wStartMin - newEndMin;
    if (gapBefore < 60 && gapAfter < 60) {
      return `Windows must be at least 1 hour apart. Conflict with "${w.startTime}".`;
    }
  }
  return null;
}

// ─── Session track-list builder ───────────────────────────────────────────────

export type HnsTrack = Track & { _hnsAltId?: string; _hnsParentId?: string };

/**
 * Build the shuffled, alternate-substituted track list for the current H&S session.
 * Result is cached in sessionStorage for the duration of the 3-hour window so the
 * same user sees the same order/alternates until the window ends or they reload.
 *
 * Artists always receive the original un-substituted list.
 */
export function buildHideNSeekTrackList(
  album: Album,
  alternates: HideNSeekAlternate[]
): HnsTrack[] {
  const config = album.hideNSeekConfig!;
  // Cache key changes every 3-hour window — re-randomise on each new window entry
  const windowBucket = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
  const cacheKey = `hns_${album.id}_${windowBucket}`;

  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  // Build alternate lookup: parentTrackId → alternates[]
  const altByParent = new Map<string, HideNSeekAlternate[]>();
  alternates.forEach(alt => {
    const arr = altByParent.get(alt.parentTrackId) || [];
    arr.push(alt);
    altByParent.set(alt.parentTrackId, arr);
  });

  let tracks: HnsTrack[] = [...(album.tracks || [])];

  // Substitute alternates
  tracks = tracks.map(track => {
    const cfg = config.trackConfigs.find(tc => tc.trackId === track.id);
    const participates = config.globalEnabled || (cfg?.enabled ?? false);
    if (!participates) return track;

    const available = altByParent.get(track.id) || [];
    if (available.length === 0) return track;

    const chosen = available[Math.floor(Math.random() * available.length)];
    return {
      ...track,
      url: chosen.url,
      title: chosen.title,
      duration: chosen.duration ?? track.duration,
      _hnsAltId: chosen.id,
      _hnsParentId: track.id,
    };
  });

  // Shuffle track order (Fisher-Yates)
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }

  sessionStorage.setItem(cacheKey, JSON.stringify(tracks));
  return tracks;
}

// ─── React hook ──────────────────────────────────────────────────────────────

interface UseHideNSeekResult {
  isActive: boolean;
  isOwner: boolean;
  effectiveAlbum: Album;            // album with tracks substituted (or original for owner)
  alternates: HideNSeekAlternate[];
  discoveredAltIds: string[];
  /** Call when a track finishes playing to record discovery + fire achievements */
  onTrackPlayed: (track: HnsTrack) => Promise<void>;
}

export function useHideNSeek(album: Album | null): UseHideNSeekResult {
  const { triggerAction, registerAndUnlock, achievements } = useAchievements();
  const [alternates, setAlternates] = useState<HideNSeekAlternate[]>([]);
  const [discoveredAltIds, setDiscoveredAltIds] = useState<string[]>([]);

  const uid = auth.currentUser?.uid;
  const isOwner = !!album && !!uid && album.ownerId === uid;
  const isActive = !isOwner && isHideNSeekActive(album?.hideNSeekConfig);

  // Load alternates + user progress when album changes
  useEffect(() => {
    if (!album?.id || !isActive) return;
    fetchHideNSeekAlternates(album.id).then(setAlternates);
    fetchHideNSeekProgress(album.id).then(p => {
      if (p) setDiscoveredAltIds(p.discoveredAlternateIds);
    });
  }, [album?.id, isActive]);

  // Build effective album (substituted track list for listeners in active window)
  const effectiveAlbum: Album = isActive && alternates.length > 0
    ? { ...album!, tracks: buildHideNSeekTrackList(album!, alternates) }
    : album!;

  const onTrackPlayed = useCallback(async (track: HnsTrack) => {
    if (!album || !track._hnsAltId) return;

    const newlyDiscovered = await recordHideNSeekDiscovery(album.id, [track._hnsAltId]);
    setDiscoveredAltIds(newlyDiscovered);

    // ── User achievements ──────────────────────────────────────────────────
    const prevCount = discoveredAltIds.length;
    if (prevCount === 0) triggerAction('HNS_DISCOVER_FIRST');

    // Check if both slots for this track are now discovered
    const parentAlts = alternates.filter(a => a.parentTrackId === track._hnsParentId);
    if (parentAlts.length === 2 && parentAlts.every(a => newlyDiscovered.includes(a.id))) {
      triggerAction('HNS_BOTH_SLOTS');
    }

    // Super achievement: all alternates in album discovered
    const totalAlts = alternates.length;
    if (totalAlts > 0 && newlyDiscovered.length >= totalAlts) {
      const albumAchId = `hns_album_${album.id}`;
      if (!achievements.find(a => a.id === albumAchId)) {
        registerAndUnlock({
          id: albumAchId,
          title: 'Nothing Was Real',
          description: `Discovered every hidden alternate in "${album.title}" — you heard it all.`,
          type: 'CONTENT',
          icon: 'Eye',
          points: 100,
          pointsValue: 100,
          category: 'USER',
          triggerType: 'CUSTOM',
          isActive: true,
          requirements: { type: 'ACTION' },
          createdBy: 'SYSTEM',
        });
      }
    }

    // ── Artist achievements (check stats) ─────────────────────────────────
    if (album.ownerId) {
      const stats = await fetchHideNSeekStats(album.id);
      if (stats) {
        const discoverers = stats.uniqueDiscovererIds?.length ?? 0;
        if (discoverers >= 50) triggerAction('HNS_ARTIST_50');
        else if (discoverers >= 10) triggerAction('HNS_ARTIST_10');
      }
    }
  }, [album, alternates, discoveredAltIds, triggerAction, registerAndUnlock, achievements]);

  return { isActive, isOwner, effectiveAlbum: effectiveAlbum ?? album!, alternates, discoveredAltIds, onTrackPlayed };
}
