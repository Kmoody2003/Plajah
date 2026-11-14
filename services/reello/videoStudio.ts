// Open a published video's studio from anywhere: its details (title, description, thumbnail, tags,
// category, visibility, Shorts, playlists, department) and what Story Intelligence made from it.
// ReelloUploadDock hosts the panel (components/reello/VideoStudioPanel).

import type { Video } from '../../types';

export const OPEN_VIDEO_STUDIO_EVENT = 'reello:edit-video';
export const VIDEO_UPDATED_EVENT = 'reello:video-updated';

export type VideoStudioTab = 'details' | 'intel';

export function openVideoStudio(videoId: string, tab: VideoStudioTab = 'details') {
  window.dispatchEvent(new CustomEvent(OPEN_VIDEO_STUDIO_EVENT, { detail: { videoId, tab } }));
}

/** Fired after a save, so lists already on screen can show the new title, thumbnail or visibility. */
export function announceVideoUpdated(video: Partial<Video> & { id: string }) {
  window.dispatchEvent(new CustomEvent(VIDEO_UPDATED_EVENT, { detail: video }));
}

/** Mux renders a still at any second, so a published video needs no local frames to pick a thumbnail. */
export function muxStillCandidates(playbackId: string | undefined, durationSec: number, n = 4): string[] {
  if (!playbackId) return [];
  const d = durationSec > 0 ? durationSec : 0;
  const times = d ? Array.from({ length: n }, (_, i) => Math.max(1, Math.round((d * (i + 1)) / (n + 1)))) : [2, 5, 10, 20].slice(0, n);
  return times.map(t => `https://image.mux.com/${playbackId}/thumbnail.jpg?width=640&time=${t}`);
}
