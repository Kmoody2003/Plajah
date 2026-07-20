// ─── Image thumbnails ─────────────────────────────────────────────────────────
// Album/track art is uploaded at full resolution (some covers are 4096×4096,
// multiple MB). Grids and thumbnails were loading those originals into ~40–300px
// cells, which made Chora crawl. thumb() rewrites a public image URL to a
// CDN-resized, WebP variant sized for display — typically a 30–100x byte
// reduction — while full() / the raw URL stays available for full-screen renders.
//
// Uses wsrv.nl (images.weserv.nl), a free Cloudflare-backed image CDN, so it
// works for any public URL (Firebase Storage, Audius, external) with zero infra
// and no reprocessing of existing images. Pair with onThumbError() so a CDN
// hiccup transparently falls back to the original.

import { getPlatformInfo } from '../../hooks/usePlatform';

const CDN = 'https://wsrv.nl/';

/**
 * Television image budget.
 *
 * Decoded image memory is width x height x 4 bytes, so `dpr: 2` costs FOUR TIMES the RAM of
 * dpr 1 — and buys nothing on a TV, which is a ~1x display viewed from ten feet. A grid of
 * thirty album covers at dpr 2 / 320px is roughly 78MB decoded; the same grid at dpr 1 / 224px
 * is about 19MB. On a 2GB TV with a 192MB per-app heap that difference is the whole budget.
 *
 * Width is also capped: a TV never needs the 'large' hero preset for a grid cell, and the
 * biggest single win is simply refusing to decode artwork bigger than it will ever be shown.
 */
const TV_MAX_WIDTH = 224;
const TV_QUALITY = 70;

/** Width presets for common contexts. */
export const THUMB = {
  micro: 64,    // tiny avatars / inline list rows
  small: 128,   // small grid thumbs
  card: 320,    // album grid cards
  large: 640,   // hero / now-playing
} as const;

/**
 * Resize a public image URL to `width` px wide (WebP, no upscaling).
 * Pass-through for empty, data:, blob:, relative, or already-transformed URLs.
 */
export function thumb(url?: string | null, width: number = THUMB.card, quality = 78): string {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;     // data: / blob: / relative
  if (url.includes('wsrv.nl')) return url;        // already transformed

  let isTV = false;
  try { isTV = getPlatformInfo().isTV; } catch { /* pre-boot / SSR — assume not a TV */ }
  const w = isTV ? Math.min(width, TV_MAX_WIDTH) : width;
  const q0 = isTV ? Math.min(quality, TV_QUALITY) : quality;
  // dpr 2 for crisp art on retina without ballooning bytes (CDN caps source); dpr 1 on a TV,
  // where the extra pixels are invisible and the memory is not affordable.
  const q = new URLSearchParams({ url, w: String(w), q: String(q0), output: 'webp', we: '', dpr: isTV ? '1' : '2', fit: 'cover' });
  return `${CDN}?${q.toString()}`;
}

/**
 * onError handler for an <img> whose src is a thumb(): swap to the original
 * URL once, so a CDN failure degrades to the (slower) full image instead of a
 * broken cover. Usage: onError={onThumbError(originalUrl)}
 */
export function onThumbError(originalUrl?: string | null) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (originalUrl && img.src !== originalUrl && !img.dataset.thumbFellBack) {
      img.dataset.thumbFellBack = '1';
      img.src = originalUrl;
    }
  };
}
