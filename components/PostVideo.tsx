// PostVideo — plays a video attached to a social post using a scaled-down, simplified
// Reello Plajah Universal Player that ALWAYS pulls and prioritizes the Mux HLS version.
//
// Resolution priority:
//   1. Explicit `muxPlaybackId` prop or `stream.mux.com/<id>` parsed from `url`.
//   2. Lookup by `id` (`fetchVideoById(id)`) to pull `muxPlaybackId` from Firestore EVEN IF a
//      legacy direct `url` was also stored on the post — guaranteeing Reello shares always play
//      the adaptive Mux stream (`https://stream.mux.com/${playbackId}.m3u8`).
//   3. Fallback to `https://stream.mux.com/${playbackId}/high.mp4` or direct `url` only if Mux
//      HLS is unavailable.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { hlsTuning, capLevelsToPanel } from '../services/hlsTuning';
import { thumb, THUMB, onThumbError } from '../src/lib/imageThumb';

interface PostVideoProps {
  url?: string;
  /** Video doc id (used to always pull the latest muxPlaybackId + poster for Reello videos). */
  id?: string;
  muxPlaybackId?: string;
  poster?: string;
  title?: string;
  className?: string;
  /** Natural sizing: the video sizes to its own aspect (capped at 85vh) instead of filling a
   *  fixed-height parent — so vertical/portrait videos display tall instead of being letterboxed. */
  natural?: boolean;
}

type CompactLookKey = 'none' | 'tealorange' | 'warm' | 'vivid' | 'noir' | 'golden';

const COMPACT_LOOKS: Record<CompactLookKey, { label: string; filter: string }> = {
  none: { label: 'Clean', filter: 'none' },
  tealorange: { label: 'Teal & Orange', filter: 'contrast(1.15) saturate(1.25) hue-rotate(-6deg)' },
  warm: { label: 'Warm Film', filter: 'sepia(0.18) saturate(1.15) contrast(1.08) brightness(1.02)' },
  vivid: { label: 'Vivid HDR', filter: 'contrast(1.22) saturate(1.35) brightness(1.04)' },
  noir: { label: 'Silver Noir', filter: 'grayscale(1) contrast(1.3) brightness(0.95)' },
  golden: { label: 'Golden Hour', filter: 'sepia(0.25) saturate(1.28) contrast(1.1) hue-rotate(-12deg)' },
};

const LOOK_ORDER: CompactLookKey[] = ['none', 'tealorange', 'warm', 'vivid', 'noir', 'golden'];
const SPEED_ORDER = [1, 1.25, 1.5, 2, 0.75];

const muxIdFromUrl = (u?: string): string | undefined => {
  if (!u) return undefined;
  const m = u.match(/stream\.mux\.com\/([^/.?]+)/i);
  return m?.[1];
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PostVideo: React.FC<PostVideoProps> = ({ url, id, muxPlaybackId, poster, title, className, natural }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const hudTimerRef = useRef<number | null>(null);

  const [active, setActive] = useState(false);
  const [playbackId, setPlaybackId] = useState<string | undefined>(muxPlaybackId || muxIdFromUrl(url));
  const [directUrl, setDirectUrl] = useState<string | undefined>(url && !muxIdFromUrl(url) ? url : undefined);
  const [resolvedPoster, setResolvedPoster] = useState<string | undefined>(poster);
  const [resolvedTitle, setResolvedTitle] = useState<string | undefined>(title);
  const [mp4Fallback, setMp4Fallback] = useState(false);

  // Playback HUD state (scaled-down Reello Plajah Universal controls)
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [look, setLook] = useState<CompactLookKey>('none');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);

  // Sync props if they update
  useEffect(() => {
    const pid = muxPlaybackId || muxIdFromUrl(url);
    if (pid) setPlaybackId(pid);
    if (url && !muxIdFromUrl(url)) setDirectUrl(url);
    if (poster) setResolvedPoster(poster);
    if (title) setResolvedTitle(title);
  }, [muxPlaybackId, url, poster, title]);

  // Always check Firestore by `id` when `playbackId` is missing — even if a legacy `directUrl`
  // exists — so shared Reello videos always pull the Mux version first.
  useEffect(() => {
    let cancelled = false;
    if (playbackId || !id) return;
    (async () => {
      try {
        const { fetchVideoById } = await import('../services/backendService');
        const v: any = await fetchVideoById(id);
        if (cancelled || !v) return;
        const pid = v.muxPlaybackId || muxIdFromUrl(v.url);
        if (pid) {
          setPlaybackId(pid);
          setMp4Fallback(false);
        } else if (v.url && !directUrl) {
          setDirectUrl(v.url);
        }
        if (!resolvedPoster && (v.thumbnailUrl || v.coverImageUrl)) {
          setResolvedPoster(v.thumbnailUrl || v.coverImageUrl);
        }
        if (!resolvedTitle && v.title) {
          setResolvedTitle(v.title);
        }
      } catch {
        /* leave as current source */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, playbackId, directUrl, resolvedPoster, resolvedTitle]);

  const bumpHud = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setHudVisible(false);
      }
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && containerRef.current && document.fullscreenElement === containerRef.current));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Attach the Mux HLS engine once the user taps play.
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video || !playbackId || mp4Fallback) return;
    let disposed = false;
    const streamUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    setIsBuffering(true);
    (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (disposed) return;
        if (Hls.isSupported()) {
          const hls = new Hls(hlsTuning());
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            capLevelsToPanel(hls as any);
            video.play().catch(() => {});
          });
          let recovered = 0;
          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (!data?.fatal) return;
            if (recovered < 2) {
              recovered++;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls.startLoad(); return; }
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
            }
            hls.destroy();
            hlsRef.current = null;
            setMp4Fallback(true); // progressive Mux MP4 fallback
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
          video.play().catch(() => {});
        } else {
          setMp4Fallback(true);
        }
      } catch {
        setMp4Fallback(true);
      }
    })();
    return () => {
      disposed = true;
      hlsRef.current?.destroy?.();
      hlsRef.current = null;
    };
  }, [active, playbackId, mp4Fallback]);

  // Prioritize Mux HLS stream; only set <video src> when using Mux MP4 fallback or when no Mux playbackId exists.
  const fallbackOrDirectSrc = playbackId
    ? (mp4Fallback ? `https://stream.mux.com/${playbackId}/high.mp4` : undefined)
    : directUrl;
  const hasSource = Boolean(playbackId || directUrl);
  const muxPosterFallback = playbackId ? `https://image.mux.com/${playbackId}/thumbnail.webp?time=1` : undefined;
  const effectivePoster = resolvedPoster || muxPosterFallback;

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
    bumpHud();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    const el = videoRef.current;
    if (el && Number.isFinite(val)) {
      el.currentTime = val;
      setCurrentTime(val);
    }
    bumpHud();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    const next = !isMuted;
    el.muted = next;
    setIsMuted(next);
    bumpHud();
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    const el = videoRef.current;
    setVolume(val);
    setIsMuted(val === 0);
    if (el) {
      el.volume = val;
      el.muted = val === 0;
    }
    bumpHud();
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = SPEED_ORDER[(SPEED_ORDER.indexOf(speed) + 1) % SPEED_ORDER.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    bumpHud();
  };

  const cycleLook = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = LOOK_ORDER[(LOOK_ORDER.indexOf(look) + 1) % LOOK_ORDER.length];
    setLook(next);
    bumpHud();
  };

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const box = containerRef.current;
    if (!box) return;
    try {
      if (!document.fullscreenElement) {
        await box.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* ignore */
    }
    bumpHud();
  };

  // Poster / pre-play state with Reello Universal branding
  if (!active) {
    return (
      <button
        type="button"
        onClick={() => (hasSource ? setActive(true) : undefined)}
        style={{ '--ua': '#D40055', '--ub': '#A020F0' } as React.CSSProperties}
        className={`relative ${natural ? 'w-full' : 'w-full h-full'} bg-black flex items-center justify-center group overflow-hidden ${className || ''}`}
        aria-label={hasSource ? `Play ${resolvedTitle || 'video'}` : (resolvedTitle || 'Video')}
      >
        {effectivePoster ? (
          <img
            src={thumb(effectivePoster, THUMB.large) || effectivePoster}
            onError={onThumbError(effectivePoster)}
            alt={resolvedTitle || 'Video'}
            loading="lazy"
            decoding="async"
            className={natural ? 'w-full h-auto max-h-[85vh] object-contain' : 'w-full h-full object-cover'}
          />
        ) : (
          <div
            className={natural ? 'w-full aspect-video' : 'w-full h-full'}
            style={{ background: 'linear-gradient(135deg,#1a1025,#0a0a0d)' }}
          />
        )}

        {/* Top-left Reello Universal mini header badge */}
        <div className="absolute top-3 left-3 pr-12 z-10 flex items-center gap-1.5 max-w-[calc(100%-3.5rem)] pointer-events-none">
          <span className="text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[var(--ua)] border border-[#D40055]/45 shadow-md shrink-0">
            Reello Universal
          </span>
          {playbackId && (
            <span className="text-[8px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-full bg-black/65 backdrop-blur-md text-emerald-300 border border-emerald-400/35 shrink-0">
              MUX
            </span>
          )}
          {resolvedTitle && (
            <span className="text-[11px] font-bold text-white/90 truncate drop-shadow">
              {resolvedTitle}
            </span>
          )}
        </div>

        {hasSource ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-black/65 backdrop-blur-md border border-[#D40055]/50 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#D40055]/25 transition-all shadow-[0_0_30px_rgba(212,0,85,0.45)]">
              <Play size={26} className="text-[#D40055] ml-1" fill="currentColor" />
            </span>
          </span>
        ) : (
          <span className="absolute bottom-2.5 left-3 text-[10px] font-bold text-white/60 uppercase tracking-widest">
            {id ? 'Loading Reello Mux stream…' : 'Video unavailable'}
          </span>
        )}
      </button>
    );
  }

  // Scaled-down, simplified Reello Plajah Universal player for post playback
  return (
    <div
      ref={containerRef}
      style={{ '--ua': '#D40055', '--ub': '#A020F0' } as React.CSSProperties}
      onMouseMove={bumpHud}
      onTouchStart={bumpHud}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative ${natural ? 'w-full' : 'w-full h-full'} bg-black flex items-center justify-center overflow-hidden select-none group/reello-post ${className || ''}`}
    >
      <video
        ref={videoRef}
        poster={effectivePoster}
        autoPlay
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        style={look !== 'none' ? { filter: COMPACT_LOOKS[look].filter } : undefined}
        onClick={togglePlay}
        onPlay={() => { setIsPlaying(true); setIsBuffering(false); bumpHud(); }}
        onPause={() => { setIsPlaying(false); setHudVisible(true); }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onLoadedMetadata={() => {
          setIsBuffering(false);
          if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
        }}
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setHudVisible(true);
        }}
        onError={() => {
          setIsBuffering(false);
          if (playbackId && !mp4Fallback) setMp4Fallback(true);
          else if (directUrl && playbackId) {
            // Last resort if both Mux HLS and Mux MP4 fail
            setPlaybackId(undefined);
          } else {
            setActive(false);
          }
        }}
        className={`${natural ? 'w-full h-auto max-h-[85vh]' : 'w-full h-full'} object-contain bg-black cursor-pointer`}
        {...(fallbackOrDirectSrc ? { src: fallbackOrDirectSrc } : {})}
      />

      {/* Buffering spinner */}
      {isBuffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px] z-20">
          <div className="w-10 h-10 border-3 border-[#D40055]/25 border-t-[#D40055] rounded-full animate-spin" />
        </div>
      )}

      {/* Center Play overlay when paused */}
      {!isPlaying && !isBuffering && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute z-20 w-14 h-14 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-[#D40055]/50 flex items-center justify-center text-white transition-all shadow-[0_0_25px_rgba(212,0,85,0.45)] hover:scale-105"
        >
          <Play size={24} className="ml-1 text-[#D40055]" fill="currentColor" />
        </button>
      )}

      {/* Top Compact Reello Universal Bar (leaves right margin for carousel expand icon) */}
      <div
        className={`absolute top-0 inset-x-0 z-20 pl-3 pr-14 py-2.5 bg-gradient-to-b from-black/80 via-black/35 to-transparent flex items-center gap-2 pointer-events-none transition-opacity duration-200 ${
          hudVisible || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-[#D40055]/20 text-[#ff4d94] border border-[#D40055]/40 shrink-0">
          Reello Universal
        </span>
        {playbackId && (
          <span className="text-[8px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 shrink-0">
            MUX
          </span>
        )}
        {resolvedTitle && (
          <span className="text-xs font-bold text-white/90 truncate">
            {resolvedTitle}
          </span>
        )}
      </div>

      {/* Bottom Compact Reello Universal HUD */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 z-20 px-3 pt-4 pb-2.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-1.5 transition-opacity duration-200 ${
          hudVisible || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/75 tabular-nums w-9 text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Seek video"
            className="flex-1 h-1 bg-white/25 rounded-lg appearance-none cursor-pointer accent-[#D40055] hover:h-1.5 transition-all"
          />
          <span className="text-[10px] font-mono text-white/50 tabular-nums w-9">
            {formatTime(duration)}
          </span>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-7 h-7 rounded-full bg-[#D40055] hover:bg-[#e6005c] text-white flex items-center justify-center transition-all shadow-md hover:scale-105"
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} className="ml-0.5" fill="currentColor" />}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="text-white/75 hover:text-white transition-colors p-1"
            >
              {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolume}
              aria-label="Volume"
              className="hidden sm:block w-14 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#D40055]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {/* Pixels Look quick cycle */}
            <button
              type="button"
              onClick={cycleLook}
              title={`Pixels Look: ${COMPACT_LOOKS[look].label} (click to cycle)`}
              className={`h-6 px-2 rounded-md border text-[10px] font-bold flex items-center gap-1 transition-all ${
                look !== 'none'
                  ? 'bg-[#A020F0]/25 border-[#A020F0]/50 text-purple-200'
                  : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/75'
              }`}
            >
              <Sparkles size={11} className="text-[#A020F0]" />
              <span className="hidden xs:inline">{COMPACT_LOOKS[look].label}</span>
            </button>

            {/* Playback speed cycle */}
            <button
              type="button"
              onClick={cycleSpeed}
              title="Playback speed"
              className="h-6 px-1.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-[10px] font-mono text-white/80"
            >
              {speed}x
            </button>

            {/* Native Fullscreen */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="h-6 w-6 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all"
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostVideo;

