// services/video/playback.ts — ONE place that turns a video record into playable URLs, whichever host
// carries it. New code should call resolvePlayback() instead of building stream.mux.com URLs by hand
// (≈146 hand-built Mux URLs across 72 files today; they move here over time).
//
// Precedence: Bunny (bunnyVideoId + bunnyCdnHost) → Mux (muxPlaybackId) → plain url/videoUrl.
// Bunny records ALSO carry url = HLS playlist and thumbnailUrl, so players that only know `url`
// keep working before they adopt this resolver.

import { bunnyHlsUrl, bunnyPreviewUrl, bunnyThumbnailUrl, isBunnyGuid } from '../bunnyStream/core';

export type VideoProvider = 'bunny' | 'mux' | 'direct';

export interface HostedVideoFields {
  bunnyVideoId?: string | null;
  bunnyCdnHost?: string | null;
  muxPlaybackId?: string | null;
  url?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnail?: string | null;
  coverImageUrl?: string | null;
}

export interface ResolvedPlayback {
  provider: VideoProvider;
  /** HLS playlist when the host has one; otherwise the direct file URL. */
  src: string;
  isHls: boolean;
  poster?: string;
  /** Animated hover preview where the host makes one. */
  preview?: string;
}

const MUX_ID = /^[A-Za-z0-9]{10,80}$/;
const BUNNY_HOST = /^[a-z0-9.-]+$/i;

export function resolvePlayback(v: HostedVideoFields | null | undefined): ResolvedPlayback | null {
  if (!v) return null;
  const ownPoster = v.thumbnailUrl || v.thumbnail || v.coverImageUrl || undefined;
  if (isBunnyGuid(v.bunnyVideoId) && v.bunnyCdnHost && BUNNY_HOST.test(v.bunnyCdnHost)) {
    return {
      provider: 'bunny', isHls: true,
      src: bunnyHlsUrl(v.bunnyCdnHost, v.bunnyVideoId),
      poster: ownPoster || bunnyThumbnailUrl(v.bunnyCdnHost, v.bunnyVideoId),
      preview: bunnyPreviewUrl(v.bunnyCdnHost, v.bunnyVideoId),
    };
  }
  if (v.muxPlaybackId && MUX_ID.test(v.muxPlaybackId)) {
    return {
      provider: 'mux', isHls: true,
      src: `https://stream.mux.com/${v.muxPlaybackId}.m3u8`,
      poster: ownPoster || `https://image.mux.com/${v.muxPlaybackId}/thumbnail.jpg?width=1280&time=5`,
      preview: `https://image.mux.com/${v.muxPlaybackId}/animated.webp?width=320`,
    };
  }
  const direct = v.url || v.videoUrl;
  if (direct) return { provider: 'direct', src: direct, isHls: /\.m3u8(\?|$)/i.test(direct), poster: ownPoster };
  return null;
}

/** Fields to write onto a video doc once a Bunny upload is ready (url/thumbnailUrl keep old players working). */
export function bunnyDocFields(guid: string, cdnHost: string) {
  return {
    bunnyVideoId: guid,
    bunnyCdnHost: cdnHost,
    videoHost: 'bunny' as const,
    url: bunnyHlsUrl(cdnHost, guid),
    thumbnailUrl: bunnyThumbnailUrl(cdnHost, guid),
  };
}
