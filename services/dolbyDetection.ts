/**
 * dolbyDetection — Dolby codec support detection and passthrough helpers.
 *
 * Dolby Atmos for streaming uses EC-3 JOC (Dolby Digital Plus with Joint
 * Object Coding) inside an MP4 container. On supported platforms (Windows +
 * Chrome/Edge + Dolby-capable hardware), the browser passes the bitstream
 * straight to the system decoder — no license required on our end.
 *
 * TrueHD (lossless Atmos, Blu-ray) is never available in the browser.
 */

export interface DolbySupport {
  /** Dolby Digital Plus / EC-3 in MP4 — the streaming Atmos codec */
  ec3: boolean;
  /** AC-4 — next-gen Dolby codec (rarer in browsers) */
  ac4: boolean;
  /** Whether this platform is likely to render Atmos spatial audio */
  atmos: boolean;
}

let _cached: DolbySupport | null = null;

/** Detect which Dolby codecs the current browser can play. Cached after first call. */
export function detectDolbySupport(): DolbySupport {
  if (_cached) return _cached;

  const a = document.createElement('audio');
  const v = document.createElement('video');

  const canPlay = (el: HTMLMediaElement, type: string) => {
    const r = el.canPlayType(type);
    return r === 'probably' || r === 'maybe';
  };

  const ec3 =
    canPlay(a, 'audio/mp4; codecs="ec-3"') ||
    canPlay(v, 'video/mp4; codecs="ec-3"') ||
    // Some browsers report it under the older codec string
    canPlay(v, 'video/mp4; codecs="ec+3"');

  const ac4 = canPlay(v, 'video/mp4; codecs="ac-4"');

  _cached = { ec3, ac4, atmos: ec3 };
  return _cached;
}

/**
 * Returns true if the given URL / MIME hint looks like a Dolby Atmos source.
 * Used for badge display — not a definitive codec probe.
 */
export function isLikelyAtmosUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('atmos') ||
    lower.includes('ec-3') ||
    lower.includes('ec3') ||
    lower.includes('dolby') ||
    lower.includes('.iamf') // Immersive Audio Model and Formats (also spatial)
  );
}

/**
 * The correct codec string to pass to <source type="..."> for an EC-3 Atmos
 * MP4 track, so the browser can make a better informed canPlayType decision.
 */
export const ATMOS_VIDEO_CODEC = 'video/mp4; codecs="ec-3"';
export const ATMOS_AUDIO_CODEC = 'audio/mp4; codecs="ec-3"';
