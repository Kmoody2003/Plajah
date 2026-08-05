// fabulaVideos.ts — #7: on-platform video into Fabula.
// Pulls the signed-in user's videos — including LIVE-stream recordings (saved to
// Reello via uploadVideo with isLiveRecording) and TV Studio uploads — so they can
// be dropped onto a Fabula timeline. Mirrors the music-bin pattern.

import { auth } from './firebase';
import { fetchUserVideos } from './backendService';

export interface VideoBinItem {
  id: string; title: string; url: string; duration?: number; thumbnail?: string; isLive?: boolean;
}

/** The signed-in user's on-platform videos (direct-URL only, so Fabula can play them). */
export async function getMyVideos(): Promise<VideoBinItem[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const vids = await fetchUserVideos(uid);
    return (vids || [])
      .map((v: any) => ({
        id: v.id,
        title: v.title || 'Untitled',
        url: v.browserCompatUrl || v.url, // prefer the browser-safe transcode when present
        duration: v.duration,
        thumbnail: v.thumbnailUrl,
        isLive: !!v.isLiveRecording,
      }))
      .filter((v) => !!v.url && !/\.m3u8($|\?)/.test(v.url)); // skip HLS-only (a bare <video> can't play it)
  } catch (e) { console.warn('[fabulaVideos] fetch failed', e); return []; }
}
