import type { Track } from '../../types';
import type { PromoSnippet } from './promoTypes';

export const DEFAULT_PROMO_SNIPPET_SECONDS = 15;

const finite = (v: number | undefined, fallback: number) => Number.isFinite(v) ? v! : fallback;
export function trackDuration(track: Track): number {
  return Math.max(0, finite(track.duration, finite(track.audioAnalysis?.duration, 0)));
}
export function clampSnippet(
  track: Track,
  start = 0,
  source: PromoSnippet['source'] = 'manual',
  requestedDuration = DEFAULT_PROMO_SNIPPET_SECONDS,
): PromoSnippet {
  const length = trackDuration(track);
  const targetDur = Math.max(1, finite(requestedDuration, DEFAULT_PROMO_SNIPPET_SECONDS));
  const duration = length > 0 ? Math.min(targetDur, length) : targetDur;
  return {
    trackId: track.id,
    start: Math.max(0, Math.min(finite(start, 0), length > 0 ? Math.max(0, length - duration) : 0)),
    duration,
    source,
  };
}
/** Auto-select the first 15 seconds (0:00 – 0:15) of a Chora song so it fits directly into the 15s motion teaser. */
export function selectFirst15Seconds(track: Track): PromoSnippet {
  return clampSnippet(track, 0, 'suggested', DEFAULT_PROMO_SNIPPET_SECONDS);
}
/** Default promo snippet selection: auto-selects the first 15 seconds (0s–15s) of the song by default. */
export function suggestSnippet(track: Track, ordinal = 0): PromoSnippet {
  const duration = trackDuration(track);
  if (ordinal === 0 || duration <= DEFAULT_PROMO_SNIPPET_SECONDS) {
    return selectFirst15Seconds(track);
  }
  return clampSnippet(track, Math.min(ordinal * DEFAULT_PROMO_SNIPPET_SECONDS, Math.max(0, duration - DEFAULT_PROMO_SNIPPET_SECONDS)), 'suggested', DEFAULT_PROMO_SNIPPET_SECONDS);
}
export function selectPromoSnippets(tracks: Track[]): PromoSnippet[] {
  const playable = tracks.filter(t => (t.browserCompatUrl || t.url) && t.mediaKind !== 'VIDEO');
  if (!playable.length) return [];
  return [0, 1, 2].map(i => selectFirst15Seconds(playable[i % playable.length]));
}

