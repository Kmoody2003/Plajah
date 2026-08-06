// PostVideo — plays a video attached to a social post, including Reello / Mux videos.
//
// Why this exists: every Plajah video uploads to Mux and its doc stores an EMPTY `url` + only a
// `muxPlaybackId`. A post's media item wrote `{type:'VIDEO', url: video.url, id: video.id}`, so the
// feed rendered `<video src="">` — a blank, unplayable box (this is the "Reello streams don't show
// in the social feed" bug). This component resolves the real playback source:
//   1. an explicit `muxPlaybackId` (new posts), or a mux stream URL we can parse a playbackId from,
//   2. a non-empty direct `url` (uploaded MP4 / local replay), or
//   3. failing both, it looks the video up by `id` to recover the muxPlaybackId + poster (old posts).
// Mux plays via hls.js (MSE) with a progressive-MP4 fallback and native-HLS on Safari — the same
// resilient path the Reello player uses. Click-to-play so a feed of videos doesn't spin up N HLS
// engines at once; the poster (the Reello thumbnail) shows until you tap.

import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { hlsTuning, capLevelsToPanel } from '../services/hlsTuning';

interface PostVideoProps {
  url?: string;
  /** Video doc id (used to recover muxPlaybackId + poster for older posts). */
  id?: string;
  muxPlaybackId?: string;
  poster?: string;
  title?: string;
  className?: string;
  /** Natural sizing: the video sizes to its own aspect (capped at 85vh) instead of filling a
   *  fixed-height parent — so vertical/portrait videos display tall instead of being letterboxed. */
  natural?: boolean;
}

const muxIdFromUrl = (u?: string): string | undefined => {
  if (!u) return undefined;
  const m = u.match(/stream\.mux\.com\/([^/.?]+)/i);
  return m?.[1];
};

const PostVideo: React.FC<PostVideoProps> = ({ url, id, muxPlaybackId, poster, title, className, natural }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const [active, setActive] = useState(false);
  const [playbackId, setPlaybackId] = useState<string | undefined>(muxPlaybackId || muxIdFromUrl(url));
  const [directUrl, setDirectUrl] = useState<string | undefined>(url && !muxIdFromUrl(url) ? url : undefined);
  const [resolvedPoster, setResolvedPoster] = useState<string | undefined>(poster);
  const [mp4Fallback, setMp4Fallback] = useState(false);

  // Old posts: only a video-doc `id` and an empty url → recover the real source lazily.
  useEffect(() => {
    let cancelled = false;
    if (playbackId || directUrl || !id) return;
    (async () => {
      try {
        const { fetchVideoById } = await import('../services/backendService');
        const v: any = await fetchVideoById(id);
        if (cancelled || !v) return;
        const pid = v.muxPlaybackId || muxIdFromUrl(v.url);
        if (pid) setPlaybackId(pid);
        else if (v.url) setDirectUrl(v.url);
        if (!resolvedPoster) setResolvedPoster(v.thumbnailUrl || v.coverImageUrl || undefined);
      } catch { /* leave as poster-only */ }
    })();
    return () => { cancelled = true; };
  }, [id, playbackId, directUrl, resolvedPoster]);

  // Attach the Mux HLS engine once the user taps play.
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video || !playbackId || mp4Fallback) return;
    let disposed = false;
    const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (disposed) return;
        if (Hls.isSupported()) {
          const hls = new Hls(hlsTuning());
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { capLevelsToPanel(hls as any); video.play().catch(() => {}); });
          let recovered = 0;
          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (!data?.fatal) return;
            if (recovered < 2) {
              recovered++;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
            }
            hls.destroy(); hlsRef.current = null;
            setMp4Fallback(true); // progressive MP4 (no MSE)
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl; video.play().catch(() => {});
        } else {
          setMp4Fallback(true);
        }
      } catch { setMp4Fallback(true); }
    })();
    return () => { disposed = true; hlsRef.current?.destroy?.(); hlsRef.current = null; };
  }, [active, playbackId, mp4Fallback]);

  const src = directUrl
    || (playbackId && mp4Fallback ? `https://stream.mux.com/${playbackId}/high.mp4` : undefined);
  const hasSource = !!(playbackId || directUrl);

  // Poster / play-button state (before the user taps, or when there's no playable source yet).
  if (!active) {
    return (
      <button
        type="button"
        onClick={() => hasSource ? setActive(true) : undefined}
        className={`relative ${natural ? 'w-full' : 'w-full h-full'} bg-black flex items-center justify-center group ${className || ''}`}
        aria-label={hasSource ? `Play ${title || 'video'}` : (title || 'Video')}
      >
        {resolvedPoster
          ? <img src={resolvedPoster} alt={title || 'Video'} loading="lazy" className={natural ? 'w-full h-auto max-h-[85vh] object-contain' : 'w-full h-full object-cover'} />
          : <div className={natural ? 'w-full aspect-video' : 'w-full h-full'} style={{ background: 'linear-gradient(135deg,#1a1a1f,#0a0a0d)' }} />}
        {hasSource ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-black/55 backdrop-blur-sm border border-white/25 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play size={22} className="text-white ml-1" fill="white" />
            </span>
          </span>
        ) : (
          <span className="absolute bottom-2.5 left-3 text-[10px] font-bold text-white/60 uppercase tracking-widest">
            {id ? 'Loading video…' : 'Video unavailable'}
          </span>
        )}
      </button>
    );
  }

  return (
    <video
      ref={videoRef}
      poster={resolvedPoster}
      controls
      autoPlay
      playsInline
      preload="metadata"
      className={`${natural ? 'w-full h-auto max-h-[85vh]' : 'w-full h-full'} object-contain bg-black ${className || ''}`}
      {...(src ? { src } : {})}
      onError={() => { if (playbackId && !mp4Fallback) setMp4Fallback(true); else setActive(false); }}
    />
  );
};

export default PostVideo;
