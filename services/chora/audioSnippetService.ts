import type { Track } from '../../types';
import type { PromoSnippet } from './promoTypes';

const finite = (v: number | undefined, fallback: number) => Number.isFinite(v) ? v! : fallback;
export function trackDuration(track: Track): number {
  return Math.max(0, finite(track.duration, finite(track.audioAnalysis?.duration, 0)));
}
export function clampSnippet(track: Track, start = 0, source: PromoSnippet['source'] = 'manual'): PromoSnippet {
  const length = trackDuration(track);
  const duration = length > 0 ? Math.min(4, length) : 4;
  return { trackId: track.id, start: Math.max(0, Math.min(finite(start, 0), length > 0 ? Math.max(0, length - duration) : 0)), duration, source };
}
/** Peak-envelope energy is an honest hook heuristic, not vocal/semantic analysis.
 * Prefix sums make each candidate window O(1), including long recordings. */
export function suggestSnippet(track: Track, ordinal = 0): PromoSnippet {
  const duration = trackDuration(track);
  const peaks = track.audioAnalysis?.peaks;
  if (!peaks?.length || duration <= 4) return clampSnippet(track, duration * (.22 + ordinal * .2), 'suggested');
  const count = Math.max(1, Math.min(peaks.length, Math.ceil(4 / duration * peaks.length)));
  const sum = [0];
  peaks.forEach(p => sum.push(sum[sum.length - 1] + Math.pow(Math.max(0, Math.min(1, finite(p, 0))), 2)));
  let best = -1, at = 0;
  // When a single track fills several hooks, prefer different thirds.
  const lo = ordinal ? Math.floor(peaks.length * ordinal / 3) : 0;
  const hi = ordinal ? Math.min(peaks.length - count, Math.floor(peaks.length * (ordinal + 1) / 3)) : peaks.length - count;
  for (let i = lo; i <= hi; i++) {
    const score = sum[i + count] - sum[i];
    if (score > best) { best = score; at = i; }
  }
  return clampSnippet(track, at / peaks.length * duration, 'waveform');
}
export function selectPromoSnippets(tracks: Track[]): PromoSnippet[] {
  const playable = tracks.filter(t => (t.browserCompatUrl || t.url) && t.mediaKind !== 'VIDEO');
  if (!playable.length) return [];
  return Array.from({ length: 3 }, (_, i) => suggestSnippet(playable[i % playable.length], playable.length === 1 ? i : 0));
}
