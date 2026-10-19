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
import { installNativeJxlImageSupport, supportsJxlDecode, recordJxlDecodeSupport } from '../../services/jxlCodec';

const CDN = 'https://wsrv.nl/';

// Install the global capture-phase <img> error handler in browser environments so even <img>
// tags without an explicit onError={onThumbError(...)} transparently step down from output=jxl.
if (typeof window !== 'undefined') {
  installNativeJxlImageSupport();
}

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
// 340, not 224: the CSS→device ratio on the 1080p panel is 1.2, and a focused hero card (w-64,
// scaled 1.05) is ~322 device px — a 224 source there is visibly soft. 340 covers it while the
// small grid cards, which request less, stay small. This is the "fuzzy album art" fix.
const TV_MAX_WIDTH = 340;
const TV_QUALITY = 70;

/** Width presets for common contexts. */
export const THUMB = {
  micro: 64,    // tiny avatars / inline list rows
  small: 128,   // small grid thumbs
  card: 320,    // album grid cards
  large: 640,   // hero / now-playing
  slideshow: 1600, // full-bleed slideshow stills
} as const;

/** Preferred CDN output codec: JPEG XL ('jxl') by default when supported, else 'webp'. */
export function preferredCdnFormat(): 'jxl' | 'webp' {
  return supportsJxlDecode() ? 'jxl' : 'webp';
}

/**
 * Extract YouTube thumbnail directly if the URL contains a YouTube ID.
 */
export function getYoutubeThumb(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/);
  if (m && m[1] && m[1].length === 11) {
    return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  }
  return null;
}

function shouldBypassCdn(url: string): boolean {
  return (
    url.includes('wsrv.nl') ||
    url.includes('img.youtube.com') ||
    url.includes('i.ytimg.com') ||
    url.includes('wikimedia.org') ||
    url.includes('wikipedia.org') ||
    url.includes('anilist.co') ||
    url.includes('gutenberg.org') ||
    url.includes('standardebooks.org')
  );
}

/**
 * Resize a public image URL to `width` px wide (JPEG XL by default, no upscaling).
 * Pass-through for empty, data:, blob:, relative, or already-transformed URLs.
 */
export function thumb(url?: string | null, width: number = THUMB.card, quality = 78): string {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;     // data: / blob: / relative
  if (shouldBypassCdn(url)) return url;
  // Our own upload-time derivative (…_thumb.jxl / _thumb.webp, ~320px) is already the right size:
  // skip the third-party CDN hop entirely — one less DNS lookup, TLS handshake and cold-cache resize.
  if (width <= 340 && /\/o\/[^?]*_thumb\.(jxl|webp|jpg)/.test(url)) return url;

  let isTV = false;
  try { isTV = getPlatformInfo().isTV; } catch { /* pre-boot / SSR — assume not a TV */ }
  const w = isTV ? Math.min(width, TV_MAX_WIDTH) : width;
  const q0 = isTV ? Math.min(quality, TV_QUALITY) : quality;
  const fmt = preferredCdnFormat();
  // dpr 2 for crisp art on retina without ballooning bytes (CDN caps source); dpr 1 on a TV,
  // where the extra pixels are invisible and the memory is not affordable.
  const q = new URLSearchParams({ url, w: String(w), q: String(q0), output: fmt, we: '', dpr: isTV ? '1' : '2', fit: 'cover' });
  return `${CDN}?${q.toString()}`;
}

/**
 * Fullscreen / hero variant — the slideshow and now-playing takeover need a SHARP image, so the
 * grid's 224px TV cap would ruin them; but the originals are multi-MB 4096² masters, and decoding
 * one is width×height×4 bytes of MAIN-THREAD work (a 4096² image ≈ 67 MB decoded). On a TV that
 * stalls the very audio thread the slideshow plays over — which is exactly why music went choppy
 * and images arrived half-drawn with long black gaps. Resize to the panel's real size instead: a
 * 1080p TV never shows more than ~1600px across, and 1600px JPEG XL is 20–35% smaller than WebP
 * (and a tiny fraction of the 67 MB master) while decoding progressively with zero blocking.
 */
export function heroImage(url?: string | null, width = 1600, quality = 75): string {
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return url;
  if (shouldBypassCdn(url)) return url;
  let isTV = false;
  try { isTV = getPlatformInfo().isTV; } catch { /* pre-boot / SSR */ }
  const fmt = preferredCdnFormat();
  const q = new URLSearchParams({ url, w: String(width), q: String(quality), output: fmt, we: '', dpr: isTV ? '1' : '2', fit: 'cover' });
  return `${CDN}?${q.toString()}`;
}

/**
 * Dedicated slideshow variant — uses JPEG XL (`output=jxl`) at 1600px (TV / mobile) or 1920px
 * (desktop full-bleed) so every slideshow across the platform (AnimatedSlideshow, GlobalPlayer,
 * TvSlideshowSurface, PhotoGallery, PortfolioRoom) streams compact progressive JPEG XL frames.
 */
export function slideshowImage(url?: string | null, width = 1600, quality = 76): string {
  return heroImage(url, width, quality);
}

/**
 * onError handler for an <img> whose src is a thumb() or heroImage():
 *  1. If the failed URL was a JPEG XL CDN variant (`output=jxl`), first step down to `output=webp`
 *     so the user still gets a resized, fast thumbnail rather than a multi-MB raw master.
 *  2. If that also fails (CDN hiccup), swap to the original URL once.
 */
export function onThumbError(originalUrl?: string | null) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const current = img.currentSrc || img.src || '';
    if (current.includes('output=jxl') && !img.dataset.jxlSteppedDown) {
      img.dataset.jxlSteppedDown = '1';
      recordJxlDecodeSupport(false);
      img.src = current.replace(/([?&])output=jxl\b/, '$1output=webp');
      return;
    }
    if (originalUrl && img.src !== originalUrl && !img.dataset.thumbFellBack) {
      img.dataset.thumbFellBack = '1';
      img.src = originalUrl;
    }
  };
}

/**
 * Pick the best source URL for grid/card thumbnails from an Album or media object.
 */
export function coverGridSrc(item?: {
  coverThumb?: string | null;
  coverImage?: string | null;
  coverImageUrl?: string | null;
  thumbnailUrl?: string | null;
} | null): string {
  return item?.coverThumb || item?.coverImage || item?.coverImageUrl || item?.thumbnailUrl || '';
}


