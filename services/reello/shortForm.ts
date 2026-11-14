// What counts as a Short on Reello. One rule for the Shorts view, the home Shorts lane, the vertical
// Rello feed and the TV Shorts rail.
//
// `isRello` only means "this video belongs on Reello". It used to double as "this is a short", so
// every full-length upload landed in Shorts. A Short is now, like YouTube's:
//   - marked as one (`format: 'short'`), or cut from a longer video (Story Intelligence clips), or
//   - vertical or square, and at most MAX_SHORT_SEC long.
// A landscape (horizontal) video is never a Short, and neither is a live replay or anything in a cinema genre.
// `format: 'long'` keeps a creator's vertical video out of Shorts.

import type { Video } from '../../types';

export const MAX_SHORT_SEC = 180;

const CINEMA_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];

export type VideoShape = 'VERTICAL' | 'SQUARE' | 'HORIZONTAL' | 'UNKNOWN';

/** The picture's shape, from what the upload or Mux recorded. */
export function videoShape(v: any): VideoShape {
  if (!v) return 'UNKNOWN';
  if (v.verticalVideoUrl || v.aspectRatio === 'VERTICAL') return 'VERTICAL';
  if (v.aspectRatio === 'SQUARE') return 'SQUARE';
  if (v.aspectRatio === 'HORIZONTAL' || v.aspectRatio === 'LANDSCAPE') return 'HORIZONTAL';
  const w = Number(v.timebase?.width || v.videoWidth || 0);
  const h = Number(v.timebase?.height || v.videoHeight || 0);
  if (w > 0 && h > 0) {
    const r = w / h;
    if (r < 0.9) return 'VERTICAL';
    if (r <= 1.1) return 'SQUARE';
    return 'HORIZONTAL';
  }
  return 'UNKNOWN';
}

/** Whole seconds, or 0 when nothing recorded the length. */
export function videoSeconds(v: any): number {
  const tb = Number(v?.timebase?.durationSec);
  if (tb > 0) return tb;
  const d = Number(v?.duration);
  if (d > 0) return d;
  const c = v?.muxClip;
  if (c && Number(c.endSec) > Number(c.startSec)) return Number(c.endSec) - Number(c.startSec);
  return 0;
}

/** Cut from another video (Story Intelligence quote clips and the Shorts it makes). */
export const isCutFromVideo = (v: any): boolean => !!(v?.shortOf || v?.fromVideoIntel?.videoId || v?.muxClip?.sourcePlaybackId);

export function isShortForm(v: Video | any): boolean {
  if (!v) return false;
  if (v.format === 'long') return false;
  if (v.format === 'short') return true;
  if (v.isLiveRecording) return false;
  if (v.genre && CINEMA_GENRES.includes(v.genre)) return false;
  const secs = videoSeconds(v);
  if (secs > MAX_SHORT_SEC) return false;
  if (isCutFromVideo(v)) return true;
  const shape = videoShape(v);
  return shape === 'VERTICAL' || shape === 'SQUARE';
}

/** The aspect label to store for a width × height, or undefined when either is missing. */
export function aspectLabel(width?: number, height?: number): 'VERTICAL' | 'SQUARE' | 'HORIZONTAL' | undefined {
  if (!(Number(width) > 0) || !(Number(height) > 0)) return undefined;
  const r = Number(width) / Number(height);
  return r < 0.9 ? 'VERTICAL' : r <= 1.1 ? 'SQUARE' : 'HORIZONTAL';
}
