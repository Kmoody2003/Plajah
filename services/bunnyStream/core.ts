// services/bunnyStream/core.ts — Bunny Stream (on-demand video) pieces with no I/O: config,
// playback URLs, status mapping. Safe in the browser and on the server.
//
// Plan: "In-House Video Hosting Plan" phase 2 — Bunny Stream takes over on-demand video from Mux
// (Mux keeps live until Livewire). Checked against bunny.net/docs on 2026-11-24:
//   - HLS   https://<cdn>/<guid>/playlist.m3u8
//   - poster https://<cdn>/<guid>/thumbnail.jpg (frame picked at upload with thumbnailTime, in ms;
//     there is NO time-based thumbnail URL like image.mux.com?time=)
//   - preview https://<cdn>/<guid>/preview.webp
//   - MP4   https://<cdn>/<guid>/play_<720p|1080p|...>.mp4, only when the library's "MP4 Fallback"
//     is on, and only for videos uploaded after it was turned on; tops out at 1080p.
//   - Get Video `status` and webhook `Status` are DIFFERENT enums (mapped separately below).

export interface BunnyStreamConfig {
  libraryId: string;
  /** Library API key (Stream → library → API). Server only, never sent to the browser. */
  apiKey: string;
  /** Read-only API key: webhooks are HMAC-SHA256 signed with it. Server only. */
  readOnlyKey: string;
  /** Library CDN hostname, e.g. vz-abc123.b-cdn.net (or a custom host). */
  cdnHost: string;
  /** Comma list passed as EnabledResolutions. 2160p needs Premium encoding (paid per minute). */
  resolutions: string;
}

/** Default ladder: everything free (Standard) encoding produces. Add 1440p/2160p only with Premium on. */
export const DEFAULT_RESOLUTIONS = '240p,360p,480p,720p,1080p';

type Env = Record<string, string | undefined>;

/** Reads BUNNY_STREAM_* env. Returns null unless the integration is switched on AND fully configured. */
export function bunnyStreamConfig(env: Env): BunnyStreamConfig | null {
  if (env.BUNNY_STREAM_ENABLED !== '1') return null;
  const libraryId = (env.BUNNY_STREAM_LIBRARY_ID || '').trim();
  const apiKey = (env.BUNNY_STREAM_API_KEY || '').trim();
  const readOnlyKey = (env.BUNNY_STREAM_READONLY_KEY || '').trim();
  const cdnHost = (env.BUNNY_STREAM_CDN_HOST || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!/^\d+$/.test(libraryId) || !apiKey || !readOnlyKey || !cdnHost) return null;
  const resolutions = (env.BUNNY_STREAM_RESOLUTIONS || DEFAULT_RESOLUTIONS).replace(/\s+/g, '');
  return { libraryId, apiKey, readOnlyKey, cdnHost, resolutions };
}

/** Bunny video ids are GUIDs. Anything else is refused before it reaches a URL or an API path. */
export const isBunnyGuid = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const base = (cdnHost: string, guid: string) => {
  if (!isBunnyGuid(guid)) throw new Error('bad Bunny video id');
  return `https://${cdnHost}/${guid}`;
};
export const bunnyHlsUrl = (cdnHost: string, guid: string) => `${base(cdnHost, guid)}/playlist.m3u8`;
export const bunnyThumbnailUrl = (cdnHost: string, guid: string) => `${base(cdnHost, guid)}/thumbnail.jpg`;
export const bunnyPreviewUrl = (cdnHost: string, guid: string) => `${base(cdnHost, guid)}/preview.webp`;
export const bunnyMp4Url = (cdnHost: string, guid: string, height: 240 | 360 | 480 | 720 | 1080 = 720) =>
  `${base(cdnHost, guid)}/play_${height}p.mp4`;

export type HostedVideoState = 'uploading' | 'processing' | 'ready' | 'errored';

/** Get Video `status`: 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error,
 *  6 UploadFailed, 7 JitSegmenting, 8 JitPlaylistsCreated. Playable once Finished (or JIT playlists exist). */
export function videoStatusState(status: number): HostedVideoState {
  if (status === 4 || status === 8) return 'ready';
  if (status === 5 || status === 6) return 'errored';
  if (status === 0) return 'uploading';
  return 'processing';
}

/** Webhook `Status`: 0 Queued, 1 Processing, 2 Encoding, 3 Finished, 4 Resolution finished, 5 Failed,
 *  6/7/8 presigned upload started/finished/failed, 9–13 AI extras, 32 deleted, 33 smart generation failed.
 *  Returns null for events that don't change playability (captions, chapters, ...). */
export function webhookStatusState(status: number): HostedVideoState | 'deleted' | null {
  switch (status) {
    case 3: return 'ready';
    case 0: case 1: case 2: case 4: case 7: return 'processing';
    case 6: return 'uploading';
    case 5: case 8: return 'errored';
    case 32: return 'deleted';
    default: return null;
  }
}

/** Bunny `availableResolutions` is a comma string ("360p,720p"); highest rung's height, or 0. */
export function maxResolution(availableResolutions: string | null | undefined): number {
  return (availableResolutions || '').split(',').reduce((m, r) => Math.max(m, parseInt(r, 10) || 0), 0);
}
