// Shared caption resolver — the single source of truth for "what lyric line is
// active right now" given a track and the current playback time. Used by the
// album PlayerView and by Plajah Pixels so the visualizer shows the exact same
// captions as the album view (no duplicated/divergent caption logic).

import type { Track } from '../../types';

export function getActiveCaption(
  track: Track | null | undefined,
  currentTime: number,
  duration: number,
): string {
  if (!track) return '...';
  if (track.timeCodedLyrics && track.timeCodedLyrics.length > 0) {
    const active = [...track.timeCodedLyrics].reverse().find(c => c.time <= currentTime);
    return active ? active.text : '...';
  }
  if (track.lyrics) {
    const lines = track.lyrics.split('\n');
    return lines[Math.floor((currentTime / (duration || 1)) * lines.length)] || '...';
  }
  return '...';
}

export function trackHasCaptions(track: Track | null | undefined): boolean {
  return !!(track && ((track.timeCodedLyrics && track.timeCodedLyrics.length > 0) || track.lyrics));
}
