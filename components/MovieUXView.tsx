import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Video, Album, Character, IPWorld, WhatIfBranchPoint, WhatIfChoice, CharacterTimestamp, Club } from '../types';
import {
  Play, Plus, Share2, ArrowLeft, Star, Pencil,
  Info, Film, Globe, MessageCircle,
  X, Users, Maximize2, Minimize2, Check,
  Bookmark, Sparkles, RefreshCw, Calendar,
  Pause, Volume2, VolumeX, Award, ChevronRight,
  RotateCcw, RotateCw, Gauge, PictureInPicture2, Captions, SkipForward,
  ThumbsUp, ThumbsDown,
} from 'lucide-react';
import CommentSection from './CommentSection';
import WorldBadge from './WorldBadge';
import HoverPreviewThumb, { previewSourceFor } from './HoverPreviewThumb';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import { getDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { recordProgress, getResumePosition } from '../services/watchHistoryService';
import {
  db, auth,
  fetchWorldCharacters,
  fetchWorldContentByWorldId,
  addToWatchlist, removeFromWatchlist, isInWatchlist,
  fetchUserClubs, createClubEvent,
  fetchDiscussionPostsByContentId,
} from '../services/backendService';
import The411 from './The411';
import { shareAsset } from '../services/deepLinkService';
import CharacterWorldView from './CharacterWorldView';

interface MovieUXViewProps {
  item: Video | Album;
  onBack: () => void;
  onVisitUser: (uid: string) => void;
  onNavigateToWorld?: (worldId: string, characterId?: string) => void;
  onOpenItem?: (item: Video | Album) => void;
  /** Owner-only: open the authoring tool to edit this film's details. */
  onEditFilm?: (item: Video | Album) => void;
  currentUser: any;
}

const isHLSUrl = (url: string) => url.includes('.m3u8');

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// ─── CinemaPlayer ─────────────────────────────────────────────────────────────
interface CinemaPlayerProps {
  video: Video;
  poster?: string;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onWhatIfParticipation?: (branchId: string, choiceId: string) => void;
  onEnded?: () => void;
}

type CinemaStrategy = 'mux' | 'hls' | 'direct' | 'embed' | 'processing' | 'error';

const CinemaPlayer: React.FC<CinemaPlayerProps> = ({
  video: initialVideo,
  poster,
  onVideoRef,
  isFullscreen,
  onToggleFullscreen,
  onWhatIfParticipation,
  onEnded,
}) => {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredBranchesRef = useRef(new Set<string>());

  const [liveVideo, setLiveVideo] = useState<Video>(initialVideo);
  const [muxFailed, setMuxFailed] = useState(false);
  const [directFailed, setDirectFailed] = useState(false);

  // Custom controls state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [ccOn, setCcOn] = useState(false);
  const [ccMenu, setCcMenu] = useState(false);
  const [activeCcLang, setActiveCcLang] = useState<string | null>(null);
  const [whatIfActive, setWhatIfActive] = useState<WhatIfBranchPoint | null>(null);
  const lastRecordRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const subtitles = liveVideo.subtitles || [];

  const onVideoRefLatest = useRef(onVideoRef);
  onVideoRefLatest.current = onVideoRef;

  const setRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    setVideoEl(el);
    onVideoRefLatest.current?.(el);
  }, []);

  const scheduleControlHide = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleControlHide();
  }, [scheduleControlHide]);

  useEffect(() => () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); }, []);

  // ── Firestore snapshot — mirrors VideoPlayer.tsx ──────────────────────────
  useEffect(() => {
    if (!liveVideo.id || liveVideo.id.startsWith('arc_') || liveVideo.id.startsWith('tv_')) return;
    const unsub = onSnapshot(doc(db, 'videos', liveVideo.id), snap => {
      if (!snap.exists()) return;
      const data = snap.data() as Video;
      if (data.muxPlaybackId && data.muxPlaybackId !== liveVideo.muxPlaybackId) {
        setLiveVideo(v => ({ ...v, muxPlaybackId: data.muxPlaybackId, muxAssetId: data.muxAssetId }));
        setMuxFailed(false);
      }
      if (data.url && data.url !== liveVideo.url) {
        setLiveVideo(v => ({ ...v, url: data.url }));
        setDirectFailed(false);
      }
    });
    return () => unsub();
  }, [liveVideo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawUrl = liveVideo.url || '';
  const hasHlsUrl = isHLSUrl(rawUrl);
  const hasDirectUrl = !!rawUrl && !hasHlsUrl && !directFailed;
  const processing = !liveVideo.muxPlaybackId && !rawUrl && !liveVideo.embedUrl;

  const strategy: CinemaStrategy =
    processing                              ? 'processing' :
    (liveVideo.muxPlaybackId && !muxFailed) ? 'mux' :
    hasHlsUrl                               ? 'hls' :
    hasDirectUrl                            ? 'direct' :
    liveVideo.embedUrl                      ? 'embed' :
                                              'error';

  // ── HLS.js for Mux and custom .m3u8 ───────────────────────────────────────
  useEffect(() => {
    if (strategy !== 'mux' && strategy !== 'hls') return;
    const el = videoElRef.current;
    if (!el) return;
    const hlsUrl = strategy === 'mux'
      ? `https://stream.mux.com/${liveVideo.muxPlaybackId}.m3u8`
      : rawUrl;
    let torn = false;
    const onFatal = () => {
      if (torn) return;
      if (strategy === 'mux') setMuxFailed(true);
      else setDirectFailed(true);
    };
    (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (torn) return;
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true, startLevel: -1, maxBufferLength: 30,
            fragLoadingMaxRetry:     strategy === 'mux' ? 1 : 3,
            manifestLoadingMaxRetry: strategy === 'mux' ? 1 : 2,
            levelLoadingMaxRetry:    strategy === 'mux' ? 1 : 2,
          });
          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(el);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!torn) el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
          });
          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal && !torn) { hls.destroy(); hlsRef.current = null; onFatal(); }
          });
        } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
          el.addEventListener('error', onFatal, { once: true });
          el.src = hlsUrl;
          el.play().catch(() => { el.muted = true; el.play().catch(() => {}); });
        } else { onFatal(); }
      } catch { onFatal(); }
    })();
    return () => { torn = true; hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [strategy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video event listeners (timeupdate, What If detection) ─────────────────
  useEffect(() => {
    if (!videoEl) return;
    const branches = liveVideo.whatIfBranchPoints || [];

    // Save Continue-Watching progress (throttled ~5s) — Taleo now resumes like Netflix.
    const record = () => {
      if (!liveVideo.id || !(videoEl.duration > 0) || isNaN(videoEl.duration)) return;
      if (!(videoEl.currentTime > 0)) return;
      recordProgress({
        id: liveVideo.id,
        kind: 'TALEO',
        title: liveVideo.title,
        thumbnailUrl: poster || liveVideo.thumbnailUrl || liveVideo.coverImageUrl || undefined,
        ownerName: liveVideo.artist || undefined,
        positionSec: videoEl.currentTime,
        durationSec: videoEl.duration,
        seriesId: (liveVideo as any).tvMetadata?.seriesTitle || undefined,
        worldId: liveVideo.worldId,
      }).catch(() => {});
    };

    const onTime = () => {
      setCurrentTime(videoEl.currentTime);
      if (isFinite(videoEl.duration)) setDuration(videoEl.duration);
      const now = Date.now();
      if (now - lastRecordRef.current >= 5000) { lastRecordRef.current = now; record(); }
      for (const b of branches) {
        if (!triggeredBranchesRef.current.has(b.id) && videoEl.currentTime >= b.timestamp - 0.35) {
          videoEl.pause();
          triggeredBranchesRef.current.add(b.id);
          setWhatIfActive(b);
          break;
        }
      }
    };
    const onPause = () => { setIsPaused(true); record(); };
    const onPlay  = () => { setIsPaused(false); scheduleControlHide(); };
    const onMeta  = () => {
      if (isFinite(videoEl.duration)) setDuration(videoEl.duration);
      // Resume from last position (skip if near the end), once per video.
      if (!resumeAppliedRef.current && liveVideo.id) {
        resumeAppliedRef.current = true;
        const pos = getResumePosition(liveVideo.id);
        if (pos > 5 && isFinite(videoEl.duration) && pos < videoEl.duration - 15) {
          try { videoEl.currentTime = pos; } catch {}
        }
      }
    };

    const onEndedEvt = () => { record(); onEnded?.(); };

    videoEl.addEventListener('timeupdate', onTime);
    videoEl.addEventListener('pause', onPause);
    videoEl.addEventListener('play', onPlay);
    videoEl.addEventListener('loadedmetadata', onMeta);
    videoEl.addEventListener('ended', onEndedEvt);
    return () => {
      record();
      videoEl.removeEventListener('timeupdate', onTime);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('play', onPlay);
      videoEl.removeEventListener('loadedmetadata', onMeta);
      videoEl.removeEventListener('ended', onEndedEvt);
    };
  }, [videoEl, liveVideo.whatIfBranchPoints, liveVideo.id, poster, scheduleControlHide, onEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = () => {
    if (!videoElRef.current) return;
    if (videoElRef.current.paused) videoElRef.current.play().catch(() => {});
    else videoElRef.current.pause();
    revealControls();
  };

  const skip = (secs: number) => {
    const el = videoElRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + secs));
    revealControls();
  };

  const SPEEDS = [1, 1.25, 1.5, 2, 0.5];
  const cycleSpeed = () => {
    const el = videoElRef.current;
    setPlaybackRate(prev => {
      const next = SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length];
      if (el) el.playbackRate = next;
      return next;
    });
    revealControls();
  };

  const togglePiP = async () => {
    const el = videoElRef.current as any;
    if (!el) return;
    try {
      if ((document as any).pictureInPictureElement) await (document as any).exitPictureInPicture();
      else await el.requestPictureInPicture?.();
    } catch { /* PiP unsupported for this source */ }
  };

  // Sync native text tracks with the CC toggle / chosen language.
  useEffect(() => {
    const el = videoElRef.current;
    if (!el || !el.textTracks) return;
    for (let i = 0; i < el.textTracks.length; i++) {
      const tt = el.textTracks[i];
      tt.mode = (ccOn && (activeCcLang ? tt.language === activeCcLang : i === 0)) ? 'showing' : 'disabled';
    }
  }, [ccOn, activeCcLang, videoEl, subtitles.length]);

  // Skip-intro / skip-recap surfacing.
  const inIntro = liveVideo.skipIntro && currentTime >= liveVideo.skipIntro.start && currentTime < liveVideo.skipIntro.end;
  const inRecap = liveVideo.skipRecap && currentTime >= liveVideo.skipRecap.start && currentTime < liveVideo.skipRecap.end;
  const skipTo = (end: number) => { const el = videoElRef.current; if (el) el.currentTime = end + 0.1; revealControls(); };

  const toggleMute = () => {
    if (!videoElRef.current) return;
    videoElRef.current.muted = !videoElRef.current.muted;
    setIsMuted(videoElRef.current.muted);
  };

  const handleSeek = (e: React.MouseEvent) => {
    if (!seekBarRef.current || !videoElRef.current || !duration) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoElRef.current.currentTime = pct * duration;
    revealControls();
  };

  const handleWhatIfChoice = (choice: WhatIfChoice) => {
    const branch = whatIfActive;
    setWhatIfActive(null);
    if (!videoElRef.current) return;
    if (choice.jumpsToTimestamp !== undefined) {
      videoElRef.current.currentTime = choice.jumpsToTimestamp;
    }
    videoElRef.current.play().catch(() => {});
    if (branch) onWhatIfParticipation?.(branch.id, choice.id);
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const charPins: CharacterTimestamp[] = liveVideo.characterTimestamps || [];
  const branchPins: WhatIfBranchPoint[] = liveVideo.whatIfBranchPoints || [];

  // ── Processing ────────────────────────────────────────────────────────────
  if (strategy === 'processing') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white/40 space-y-4 px-8">
          <div className="w-12 h-12 border-2 border-white/20 border-t-[#D0BCFF] rounded-full animate-spin mx-auto" />
          <p className="text-sm font-black uppercase tracking-widest">Processing video…</p>
          <p className="text-xs text-white/25 leading-relaxed">Your video is being prepared. This usually takes a few minutes.</p>
        </div>
      </div>
    );
  }

  // ── Embed ─────────────────────────────────────────────────────────────────
  if (strategy === 'embed') {
    return (
      <iframe
        src={liveVideo.embedUrl}
        className="w-full h-full border-none"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        title={liveVideo.title}
      />
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (strategy === 'error') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white/40 space-y-4 px-8">
          <Film size={48} className="mx-auto opacity-30" />
          <p className="text-sm font-black uppercase tracking-widest">Source unavailable</p>
          <p className="text-xs text-white/25 leading-relaxed">This content could not be loaded.</p>
          <button
            onClick={() => { setMuxFailed(false); setDirectFailed(false); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Video + custom controls ───────────────────────────────────────────────
  return (
    <div
      className="w-full h-full relative bg-black overflow-hidden"
      onMouseMove={revealControls}
      onClick={togglePlay}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      <video
        key={strategy}
        ref={setRef}
        poster={poster}
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-contain"
        src={strategy === 'direct' ? rawUrl : undefined}
        autoPlay={strategy === 'direct'}
        onError={() => { if (strategy === 'direct') setDirectFailed(true); }}
      >
        {subtitles.map(st => (
          <track key={st.srclang} kind="subtitles" src={st.url} srcLang={st.srclang} label={st.label} default={st.default} />
        ))}
      </video>

      {/* ── What If overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {whatIfActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
            onClick={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 24 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-white/[0.07] backdrop-blur-2xl border border-white/[0.14] rounded-3xl p-5 sm:p-8 max-w-md max-h-[85dvh] overflow-y-auto w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#FFB68D]/15 border border-[#FFB68D]/30 flex items-center justify-center mx-auto">
                <Sparkles size={22} className="text-[#FFB68D]" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#FFB68D] mb-3">What If</p>
                <h3 className="text-xl font-black text-white leading-snug">{whatIfActive.question}</h3>
              </div>
              <div className="space-y-3">
                {whatIfActive.choices.map(choice => (
                  <motion.button
                    key={choice.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleWhatIfChoice(choice)}
                    className="w-full px-6 py-4 bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.10] hover:border-[#D0BCFF]/50 rounded-2xl text-left transition-all group"
                  >
                    <p className="font-black text-white group-hover:text-[#D0BCFF] transition-colors leading-tight">
                      {choice.label}
                    </p>
                    {choice.description && (
                      <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">{choice.description}</p>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Custom controls overlay ──────────────────────────────────────────── */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 z-20 flex flex-col justify-end"
        style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-20 pb-4 px-3 sm:px-5">
          {/* Progress bar */}
          <div className="mb-4">
            <div
              ref={seekBarRef}
              onClick={handleSeek}
              className="relative h-[3px] hover:h-[5px] bg-white/20 rounded-full cursor-pointer transition-all duration-150 group"
            >
              {/* Progress fill */}
              <div
                className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
                style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D0BCFF, #FFB68D)' }}
              />
              {/* Scrubber knob */}
              <div
                className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${pct}%` }}
              />

              {/* Character timestamp pins */}
              {charPins.flatMap((ct, ci) =>
                ct.timestamps.map((ts, ti) => {
                  const p = duration > 0 ? (ts / duration) * 100 : 0;
                  return (
                    <button
                      key={`${ci}-${ti}`}
                      style={{ left: `${p}%` }}
                      className="absolute -top-3.5 w-7 h-7 rounded-full border-2 border-[#D0BCFF] overflow-hidden -translate-x-1/2 shadow-lg hover:scale-125 transition-transform z-10"
                      onClick={e => { e.stopPropagation(); if (videoElRef.current) videoElRef.current.currentTime = ts; }}
                      title={`${ct.characterName} — ${formatTime(ts)}`}
                    >
                      {ct.imageUrl ? (
                        <img src={ct.imageUrl} className="w-full h-full object-cover" alt={ct.characterName} />
                      ) : (
                        <div className="w-full h-full bg-[#D0BCFF]/30 flex items-center justify-center text-[7px] font-black text-white">
                          {ct.characterName[0]}
                        </div>
                      )}
                    </button>
                  );
                })
              )}

              {/* What If branch markers (diamonds) */}
              {branchPins.map(b => {
                const p = duration > 0 ? (b.timestamp / duration) * 100 : 0;
                return (
                  <div
                    key={b.id}
                    style={{ left: `${p}%` }}
                    className="absolute -top-2 w-4 h-4 rotate-45 bg-[#FFB68D] -translate-x-1/2 pointer-events-none border border-white/20 shadow-md"
                    title={`What If: ${b.question}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            <button onClick={() => skip(-10)} title="Back 10s" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0">
              <RotateCcw size={15} className="text-white/60" />
            </button>

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center transition-all shrink-0"
            >
              {isPaused
                ? <Play size={15} fill="white" className="text-white ml-0.5" />
                : <Pause size={15} fill="white" className="text-white" />
              }
            </button>

            <button onClick={() => skip(10)} title="Forward 10s" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0">
              <RotateCw size={15} className="text-white/60" />
            </button>

            <span className="text-[11px] font-black text-white/55 tabular-nums shrink-0">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex-1" />

            <button onClick={cycleSpeed} title="Playback speed" className="h-9 px-2.5 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-1 transition-all shrink-0">
              <Gauge size={14} className="text-white/55" />
              <span className="text-[10px] font-black text-white/60 tabular-nums">{playbackRate}x</span>
            </button>

            <div className="relative shrink-0">
              <button onClick={() => subtitles.length ? setCcMenu(m => !m) : setCcOn(o => !o)} title="Subtitles / CC" className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${ccOn ? 'bg-white/25 text-white' : 'bg-white/10 hover:bg-white/20 text-white/55'}`}>
                <Captions size={15} />
              </button>
              {ccMenu && (
                <div className="absolute bottom-11 right-0 w-44 max-w-[80vw] p-1.5 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 z-30" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setCcOn(false); setCcMenu(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${!ccOn ? 'text-[#D0BCFF]' : 'text-white/50 hover:bg-white/5'}`}>Off</button>
                  {subtitles.length === 0 ? (
                    <p className="px-3 py-2 text-[9px] text-white/25 uppercase tracking-widest">No captions available</p>
                  ) : subtitles.map(st => (
                    <button key={st.srclang} onClick={() => { setCcOn(true); setActiveCcLang(st.srclang); setCcMenu(false); }} className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${ccOn && activeCcLang === st.srclang ? 'text-[#D0BCFF]' : 'text-white/50 hover:bg-white/5'}`}>{st.label}</button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={togglePiP} title="Picture-in-picture" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0">
              <PictureInPicture2 size={15} className="text-white/55" />
            </button>

            <button
              onClick={toggleMute}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0"
            >
              {isMuted
                ? <VolumeX size={15} className="text-white/55" />
                : <Volume2 size={15} className="text-white/55" />
              }
            </button>

            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0"
              >
                {isFullscreen
                  ? <Minimize2 size={15} className="text-white/55" />
                  : <Maximize2 size={15} className="text-white/55" />
                }
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Skip Intro / Recap (Netflix-style) */}
      {(inIntro || inRecap) && (
        <button
          onClick={(e) => { e.stopPropagation(); skipTo(inIntro ? liveVideo.skipIntro!.end : liveVideo.skipRecap!.end); }}
          className="absolute bottom-24 right-6 z-20 flex items-center gap-2 px-5 py-2.5 bg-white/90 text-black rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-xl"
        >
          <SkipForward size={14} /> Skip {inIntro ? 'Intro' : 'Recap'}
        </button>
      )}
    </div>
  );
};

// ─── MovieUXView ───────────────────────────────────────────────────────────────
const MovieUXView: React.FC<MovieUXViewProps> = ({ item, onBack, onVisitUser, onNavigateToWorld, onOpenItem, onEditFilm, currentUser }) => {
  const {
    activateVideoSource,
    setVideoElement,
    isUserActive,
    setTheme,
    clearMedia,
  } = useGlobalPlayerState();

  const [scrolled, setScrolled] = useState(false);
  const [isUIVisible, setIsUIVisible] = useState(true);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  // Alternate cuts (extended / director's / …). The primary payload is remembered so we
  // can switch back; selecting an alternate just swaps the playback URL (direct file).
  const [activeVersionId, setActiveVersionId] = useState<string>('primary');
  const primaryPayloadRef = useRef<Video | null>(null);
  const [world, setWorld] = useState<IPWorld | null>(null);
  const [worldCharacters, setWorldCharacters] = useState<Character[]>([]);
  const [worldContent, setWorldContent] = useState<{ albums: Album[]; videos: Video[] } | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
  const [whatIfAchieved, setWhatIfAchieved] = useState(false);

  // Watchlist
  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  // Watch with Club
  const [showWatchWithClub, setShowWatchWithClub] = useState(false);
  const [userClubs, setUserClubs] = useState<Club[]>([]);
  const [watchPartyClubId, setWatchPartyClubId] = useState('');
  const [watchPartyDate, setWatchPartyDate] = useState('');
  const [watchPartySubmitting, setWatchPartySubmitting] = useState(false);
  const [watchPartyDone, setWatchPartyDone] = useState(false);

  // Discussions panel
  const [filmDiscussions, setFilmDiscussions] = useState<any[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Top 3 assets connected to the hovered character
  const hoveredCharAssets = useMemo(() => {
    if (!hoveredCharId) return [];
    const vids = (worldContent?.videos || []).filter(v => v.characterIds?.includes(hoveredCharId));
    const albs = (worldContent?.albums || []).filter(a => (a as any).characterIds?.includes(hoveredCharId));
    return [...vids, ...albs].slice(0, 3);
  }, [hoveredCharId, worldContent]);

  const handlePostComment = async (text: string) => {
    setComments(prev => [{
      id: Date.now().toString(),
      userId: currentUser?.uid || 'anon',
      userName: currentUser?.displayName || 'Anonymous',
      userPhoto: currentUser?.photoURL || '',
      rating: 5,
      comment: text,
      timestamp: Date.now(),
    }, ...prev]);
  };

  // Load watchlist status, user clubs, and film discussions when item changes
  useEffect(() => {
    const itemId = item.id || (item as any).identifier;
    if (auth.currentUser && itemId) {
      isInWatchlist(itemId).then(setInWatchlist);
      fetchUserClubs(auth.currentUser.uid).then(setUserClubs);
    }
    fetchDiscussionPostsByContentId(itemId).then(setFilmDiscussions);
  }, [item.id, (item as any).identifier]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWatchlistToggle = async () => {
    if (!auth.currentUser) return;
    setWatchlistLoading(true);
    try {
      const itemId = item.id || (item as any).identifier;
      if (inWatchlist) {
        await removeFromWatchlist(itemId);
        setInWatchlist(false);
      } else {
        await addToWatchlist({
          id: itemId,
          title: item.title,
          type: (item as any).type === 'VIDEO' || (item as any).subType ? 'VIDEO' : 'ALBUM',
          thumbnailUrl: (item as Album).coverImage || (item as Video).thumbnailUrl || (item as any).coverImageUrl,
          genre: (item as any).genre || (item as any).subType,
        });
        setInWatchlist(true);
      }
    } finally {
      setWatchlistLoading(false);
    }
  };

  const handleScheduleWatchParty = async () => {
    if (!watchPartyClubId || !watchPartyDate) return;
    setWatchPartySubmitting(true);
    try {
      await createClubEvent({
        clubId: watchPartyClubId,
        title: `Watch Party: ${item.title}`,
        description: `Join us to watch "${item.title}" together!`,
        eventType: 'WATCH_PARTY',
        date: new Date(watchPartyDate).getTime(),
        linkedContentId: item.id || (item as any).identifier,
        linkedContentTitle: item.title,
        linkedContentThumb: (item as Album).coverImage || (item as Video).thumbnailUrl,
        isVirtual: true,
        rsvps: [],
      } as any);
      setWatchPartyDone(true);
      setTimeout(() => { setShowWatchWithClub(false); setWatchPartyDone(false); }, 2000);
    } finally {
      setWatchPartySubmitting(false);
    }
  };

  useEffect(() => {
    const worldId = (item as any).worldId;
    if (worldId) {
      getDoc(doc(db, 'worlds', worldId)).then(s => {
        if (s.exists()) setWorld({ id: s.id, ...s.data() } as IPWorld);
      });
      fetchWorldCharacters(worldId).then(setWorldCharacters);
      fetchWorldContentByWorldId(worldId).then(setWorldContent);
    }
  }, [item]);

  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    setTheme('DARK');
    const handleScroll = () => {
      if (containerRef.current) setScrolled(containerRef.current.scrollTop > 80);
    };
    const container = containerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => {
      container?.removeEventListener('scroll', handleScroll);
      clearMedia();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActiveVideo(null);
    setIsUIVisible(true);
    setActiveCharacter(null);
  }, [item.id, (item as any).identifier]);

  const isTV = (item as any).type === 'VIDEO' && (item as any).subType === 'TV_SERIES';
  const isPaywalled = !!(item as Video).isPaywalled;

  const title = item.title;
  const description = item.description;
  const coverImage = (item as Album).coverImage || (item as Video).coverImageUrl || (item as Video).thumbnailUrl;
  const artist = (item as Album).artist || (item as Video).artist;
  const ownerId = (item as Album).ownerId || (item as Video).ownerId;
  const isOwner = !!(currentUser?.uid && currentUser.uid === ownerId);
  const castMembers = (item as Video).movieMetadata?.castMembers || [];
  const releaseYear = (item as Video).movieMetadata?.releaseYear;

  const handlePlay = () => {
    const album = item as Album;
    const vid = item as Video;
    let payload: Video | null = null;

    if ((item as any).muxPlaybackId) {
      payload = vid;
    } else if (vid.url || vid.embedUrl) {
      payload = vid;
    } else if (vid.id && !(item as any).tracks && (item as any).ownerId !== 'internet-archive') {
      // Platform video still encoding — CinemaPlayer will wait via Firestore snapshot
      payload = vid;
    } else if ((item as any).ownerId === 'internet-archive') {
      const trackUrl = album.tracks?.[0]?.url || '';
      const archiveId = trackUrl.includes('/download/')
        ? trackUrl.slice(trackUrl.indexOf('/download/') + 10).split('/')[0]
        : (item as any).identifier || item.id;
      payload = {
        id: (item as any).identifier || item.id,
        ownerId: 'internet-archive',
        title: item.title,
        url: trackUrl,
        embedUrl: `https://archive.org/embed/${archiveId}?autoplay=1`,
        artist: album.artist || '',
        timestamp: album.createdAt || Date.now(),
        subType: 'MOVIE',
      } as Video;
    } else if (isTV) {
      if (album.seasons?.[0]?.episodes?.[0]) {
        payload = album.seasons[0].episodes[0] as Video;
      } else if (album.tracks?.[0]?.url) {
        payload = {
          id: album.id, ownerId: album.ownerId || 'system', title: album.title,
          url: album.tracks[0].url, artist: album.artist, timestamp: album.createdAt || Date.now(),
        } as Video;
      } else if (album.customVideoUrl) {
        payload = {
          id: album.id, ownerId: album.ownerId || 'system', title: album.title,
          url: album.customVideoUrl, artist: album.artist, timestamp: album.createdAt || Date.now(),
        } as Video;
      }
    } else if (album.tracks?.[0]?.url) {
      const trackUrl = album.tracks[0].url;
      const isArchive = trackUrl.includes('archive.org');
      const archiveId = isArchive && trackUrl.includes('/download/')
        ? trackUrl.slice(trackUrl.indexOf('/download/') + 10).split('/')[0] : '';
      payload = {
        id: album.id, ownerId: album.ownerId || 'system', title: album.title,
        url: trackUrl,
        embedUrl: archiveId ? `https://archive.org/embed/${archiveId}?autoplay=1` : undefined,
        artist: album.artist, timestamp: album.createdAt || Date.now(),
        description: album.description, thumbnailUrl: album.coverImage,
        genre: album.genre, movieMetadata: album.movieMetadata, subType: 'MOVIE',
      } as Video;
    } else if (album.customVideoUrl) {
      payload = {
        id: item.id, ownerId: album.ownerId || 'system', title: item.title,
        url: album.customVideoUrl, artist: album.artist, timestamp: album.createdAt || Date.now(),
      } as Video;
    }

    if (payload) {
      primaryPayloadRef.current = payload;
      setActiveVersionId('primary');
      setActiveVideo(payload);
      setIsUIVisible(false);
      activateVideoSource(payload);
    } else {
      setIsUIVisible(true);
    }
  };

  // Switch the playing cut. 'primary' restores the main film; an alternate swaps to its
  // uploaded file (direct URL — clears mux/embed so the player streams it directly).
  const playVersion = (id: string, url?: string) => {
    const base = primaryPayloadRef.current;
    if (!base) return;
    setActiveVersionId(id);
    setActiveVideo(id === 'primary' || !url
      ? base
      : ({ ...base, url, muxPlaybackId: undefined, embedUrl: undefined, id: `${item.id}:${id}` } as Video));
  };

  const handleWhatIfParticipation = (branchId: string, _choiceId: string) => {
    if (!whatIfAchieved) {
      setWhatIfAchieved(true);
      setTimeout(() => setWhatIfAchieved(false), 4500);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      videoContainerRef.current?.requestFullscreen?.();
    }
  };

  // Leave the player and return to the title's detail page (also exits fullscreen).
  const exitPlayer = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setIsUIVisible(true);
    setActiveVideo(null);
  }, []);

  // Esc closes the player once out of fullscreen (browser handles the fullscreen exit first).
  useEffect(() => {
    if (!activeVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); exitPlayer(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeVideo, exitPlayer]);

  // ── Next-episode autoplay (TV series) ─────────────────────────────────────
  const [autoplayNextEp, setAutoplayNextEp] = useState(true);
  const [upNextEpIn, setUpNextEpIn] = useState<number | null>(null);
  const allEpisodes: Video[] = ((item as Album).seasons || []).flatMap(s => s.episodes || []);
  const nextEpisode = (() => {
    if (!activeVideo || allEpisodes.length < 2) return null;
    const idx = allEpisodes.findIndex(e => e.id === activeVideo.id);
    return idx >= 0 && idx + 1 < allEpisodes.length ? allEpisodes[idx + 1] : null;
  })();

  const playNextEpisode = useCallback(() => {
    if (nextEpisode) { setUpNextEpIn(null); setActiveVideo(nextEpisode); }
  }, [nextEpisode]);

  const handleEpisodeEnded = useCallback(() => {
    if (autoplayNextEp && nextEpisode) setUpNextEpIn(8);
  }, [autoplayNextEp, nextEpisode]);

  useEffect(() => {
    if (upNextEpIn === null) return;
    if (upNextEpIn <= 0) { playNextEpisode(); return; }
    const t = setTimeout(() => setUpNextEpIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNextEpIn, playNextEpisode]);
  useEffect(() => { setUpNextEpIn(null); }, [activeVideo?.id]);

  // ── Detail page: maturity rating (from data), match %, thumbs rating ──────
  const maturity = (item as any).contentRating || (item as any).filmDistribution?.contentRating || (item as any).movieMetadata?.maturityRating || 'NR';
  const matchPct = 68 + (Array.from(String(item.id || (item as any).title || '')).reduce((a, c) => a + c.charCodeAt(0), 0) % 31);
  const [myRating, setMyRating] = useState<'UP' | 'DOWN' | null>(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setMyRating(null); return; }
    return onSnapshot(doc(db, 'users', uid, 'titleRatings', item.id), snap => setMyRating(snap.exists() ? (snap.data() as any).rating : null));
  }, [item.id]);
  const rate = async (r: 'UP' | 'DOWN') => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'titleRatings', item.id);
    if (myRating === r) await deleteDoc(ref).catch(() => {});
    else await setDoc(ref, { rating: r, titleId: item.id, title: (item as any).title || '', at: Date.now() }).catch(() => {});
  };

  const worldVideos = (worldContent?.videos || []).filter(v => v.id !== item.id).slice(0, 6);
  const worldAlbums = (worldContent?.albums || []).filter(a => a.id !== item.id).slice(0, 4);
  const hasWorldContent = worldVideos.length > 0 || worldAlbums.length > 0;

  return (
    <>
      {/* ── Character World View overlay ─────────────────────────────────────── */}
      <AnimatePresence>
        {activeCharacter && (
          <motion.div
            key="char-world"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.3 }}
          >
            <CharacterWorldView
              character={activeCharacter}
              world={world}
              worldContent={worldContent}
              onBack={() => setActiveCharacter(null)}
              currentUser={currentUser}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Video player — z-[200], outside scroll stacking context ─────────── */}
      {activeVideo && (
        <div ref={videoContainerRef} className="fixed inset-0 z-[200] bg-black">
          <CinemaPlayer
            key={activeVideo.id || activeVideo.url}
            video={activeVideo}
            poster={coverImage || undefined}
            onVideoRef={el => { setVideoElement(el); if (el) videoRef.current = el; }}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onWhatIfParticipation={handleWhatIfParticipation}
            onEnded={handleEpisodeEnded}
          />

          {/* Up next episode (autoplay) */}
          <AnimatePresence>
            {upNextEpIn !== null && nextEpisode && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                className="absolute bottom-6 right-6 z-30 w-72 max-w-[calc(100vw-16px)] p-3 sm:p-4 bg-black/85 backdrop-blur-md rounded-2xl border border-white/10">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Next episode in {upNextEpIn}s</p>
                <div className="flex gap-3 items-start">
                  <div className="w-24 aspect-video rounded-lg overflow-hidden bg-white/10 shrink-0">
                    {(nextEpisode.thumbnailUrl || nextEpisode.coverImageUrl)
                      ? <img src={nextEpisode.thumbnailUrl || nextEpisode.coverImageUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Play size={14} className="text-white/30" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {(nextEpisode.seasonNumber || nextEpisode.episodeNumber) && <p className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]">S{nextEpisode.seasonNumber || 1} · E{nextEpisode.episodeNumber || ''}</p>}
                    <p className="text-xs font-bold text-white line-clamp-2 mt-0.5">{nextEpisode.title}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={playNextEpisode} className="flex-1 py-2 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#D0BCFF] transition-all">Play now</button>
                  <button onClick={() => { setUpNextEpIn(null); setAutoplayNextEp(false); }} className="px-3 py-2 rounded-full bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest hover:bg-white/20">Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alternate-cut switcher — only when the film has extra versions */}
          {((item as Album).alternateVersions?.length ?? 0) > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 px-1.5 py-1.5 max-w-[90vw] overflow-x-auto no-scrollbar">
              {[{ id: 'primary', label: 'Main', url: undefined as string | undefined }, ...((item as Album).alternateVersions || []).map(v => ({ id: v.id, label: v.label, url: v.url }))].map(ver => (
                <button key={ver.id} onClick={() => playVersion(ver.id, ver.url)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${activeVersionId === ver.id ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
                  {ver.label}
                </button>
              ))}
            </div>
          )}

          {/* Back — clear exit from the player to the title's detail page (always visible, works in fullscreen) */}
          <button
            onClick={exitPlayer}
            className="absolute top-4 left-4 z-20 flex items-center gap-2 pl-3 pr-4 py-2.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 transition-all border border-white/10 max-w-[70vw]"
            title="Back to details (Esc)"
          >
            <ArrowLeft size={16} className="shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{activeVideo.title || 'Back'}</span>
          </button>
        </div>
      )}

      {/* ── What If achievement toast ─────────────────────────────────────────── */}
      <AnimatePresence>
        {whatIfAchieved && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-4 bg-[#1A1A2E]/90 backdrop-blur-2xl border border-[#FFB68D]/30 rounded-2xl px-6 py-4 shadow-2xl"
          >
            <div className="w-11 h-11 rounded-xl bg-[#FFB68D]/20 border border-[#FFB68D]/30 flex items-center justify-center shrink-0">
              <Award size={20} className="text-[#FFB68D]" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#FFB68D]">Achievement Unlocked</p>
              <p className="font-black text-white text-sm mt-0.5">What If &nbsp;·&nbsp; +100 Points</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main detail panel ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="fixed inset-0 bg-black/35 text-white overflow-y-auto custom-scrollbar z-[100]"
      >
        {/* Cover art blurred backdrop — dimmer so platform bg shows through */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          {coverImage && (
            <img
              src={coverImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-[100px] opacity-[0.12] transition-all duration-1000"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/65" />
        </div>

        <AnimatePresence>
          {isUIVisible && isUserActive && (
            <motion.main
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="relative z-20 pt-28 px-5 lg:px-16 pb-32 max-w-6xl mx-auto"
            >
              {/* Close panel */}
              <button
                onClick={() => setIsUIVisible(false)}
                className="fixed top-20 right-6 z-[160] p-3 bg-black/40 backdrop-blur-md rounded-full text-white/50 hover:text-white border border-white/[0.10] hover:border-white/25 transition-all"
              >
                <X size={16} />
              </button>

              {/* ── HERO ─────────────────────────────────────────────────────── */}
              <div className="flex flex-col lg:flex-row gap-10 items-start">
                {/* Left metadata */}
                <div className="flex-1 space-y-5 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-white/[0.07] backdrop-blur-sm text-white/60 rounded-lg text-[10px] font-black tracking-[0.15em] uppercase border border-white/[0.10] px-3 py-1">
                      Plajah Taleo Cinema
                    </span>
                    {isPaywalled && (
                      <span className="bg-[#D0BCFF]/12 text-[#D0BCFF] rounded-lg text-[10px] font-black tracking-[0.15em] uppercase border border-[#D0BCFF]/20 px-3 py-1 flex items-center gap-1.5">
                        <Sparkles size={10} /> Plajah+
                      </span>
                    )}
                    {world ? (
                      <span className="bg-[#FFB68D]/10 text-[#FFB68D] rounded-lg text-[10px] font-black tracking-[0.15em] uppercase border border-[#FFB68D]/18 px-3 py-1 flex items-center gap-1.5">
                        <Globe size={10} /> {world.name}
                      </span>
                    ) : artist ? (
                      <span className="text-white/30 text-[10px] font-black tracking-[0.15em] uppercase">{artist}</span>
                    ) : null}
                  </div>

                  {/* Title */}
                  <h2 className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tight text-white leading-[0.9] uppercase">
                    {title}
                  </h2>

                  {/* Meta */}
                  <div className="flex items-center gap-4 text-[10px] font-black tracking-[0.15em] uppercase text-white/40 flex-wrap">
                    <span className="text-[#3FBE85]">{matchPct}% Match</span>
                    <span className="flex items-center gap-1.5 text-[#D0BCFF]">
                      <Star fill="currentColor" size={12} /> 9.8
                    </span>
                    {releaseYear && <span className="text-white/40">{releaseYear}</span>}
                    <span className="border border-white/12 px-2 py-0.5 rounded text-white/35">{maturity}</span>
                    {artist && (
                      <span>Directed by <span className="text-white/55">{artist}</span></span>
                    )}
                    {/* Thumbs rating */}
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => rate('UP')} title="Rate up" className={`p-1.5 rounded-full transition-all ${myRating === 'UP' ? 'bg-[#3FBE85]/20 text-[#3FBE85]' : 'text-white/30 hover:text-white/70'}`}><ThumbsUp size={13} fill={myRating === 'UP' ? 'currentColor' : 'none'} /></button>
                      <button onClick={() => rate('DOWN')} title="Rate down" className={`p-1.5 rounded-full transition-all ${myRating === 'DOWN' ? 'bg-rose-500/20 text-rose-400' : 'text-white/30 hover:text-white/70'}`}><ThumbsDown size={13} fill={myRating === 'DOWN' ? 'currentColor' : 'none'} /></button>
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-sm md:text-base text-white/50 leading-relaxed max-w-xl">
                    {description || 'No description available.'}
                  </p>

                  <The411 itemId={item.id} itemType="VIDEO" title={title} author={artist} />

                  {(item as any).worldId && (
                    <WorldBadge
                      worldId={(item as any).worldId}
                      contentTitle={title}
                      contentType="video"
                      onNavigate={onNavigateToWorld}
                    />
                  )}

                  {/* CTAs */}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handlePlay}
                      className="h-12 px-6 sm:px-8 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-colors shadow-lg"
                    >
                      <Play fill="currentColor" size={18} /> Watch Now
                    </motion.button>
                    {isOwner && onEditFilm && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onEditFilm(item)}
                        className="h-12 px-6 bg-[#FF8C00]/15 hover:bg-[#FF8C00]/25 border border-[#FF8C00]/40 text-[#FF8C00] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all"
                        title="Edit this film's details"
                      >
                        <Pencil size={16} /> Edit Film
                      </motion.button>
                    )}
                    <button
                      onClick={handleWatchlistToggle}
                      disabled={watchlistLoading}
                      className={`h-12 px-6 backdrop-blur-sm border font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-all ${
                        inWatchlist
                          ? 'bg-[#D0BCFF]/20 border-[#D0BCFF]/40 text-[#D0BCFF]'
                          : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/[0.10] text-white/65 hover:text-white'
                      }`}
                    >
                      {inWatchlist ? <Check size={17} /> : <Bookmark size={17} />}
                      {inWatchlist ? 'Saved' : 'Watchlist'}
                    </button>
                    {auth.currentUser && (
                      <button
                        onClick={() => setShowWatchWithClub(true)}
                        className="h-12 px-5 bg-white/[0.07] hover:bg-white/[0.12] backdrop-blur-sm border border-white/[0.10] text-white/65 hover:text-white font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all"
                      >
                        <Calendar size={16} /> Watch with Club
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const archiveId = (item as any).identifier;
                        if (archiveId) shareAsset('archive', archiveId, { title: item.title, text: `${item.title} on Plajah` });
                        // A Taleo film opens on its Taleo movie page (MOVIE_UX), not the Reello player.
                        else if (item.id) shareAsset('movie', item.id, { title: item.title, text: `${item.title} on Plajah` });
                      }}
                      title="Share"
                      className="h-12 w-12 bg-white/[0.07] hover:bg-white/[0.12] backdrop-blur-sm border border-white/[0.10] rounded-full flex items-center justify-center text-white/45 hover:text-white transition-all">
                      <Share2 size={17} />
                    </button>
                  </div>
                </div>

                {/* Right: poster */}
                <div className="w-full lg:w-56 shrink-0">
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
                    {coverImage ? (
                      <img src={coverImage} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/[0.04] flex items-center justify-center">
                        <Film size={40} className="text-white/15" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── CHARACTERS ────────────────────────────────────────────────── */}
              {worldCharacters.length > 0 && (
                <section className="mt-14 space-y-5">
                  <div className="border-l-2 border-[#D0BCFF] pl-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Cast</p>
                    <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Characters</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {worldCharacters.slice(0, 10).map(char => (
                      <div
                        key={char.id}
                        className="relative"
                        onMouseEnter={() => setHoveredCharId(char.id)}
                        onMouseLeave={() => setHoveredCharId(null)}
                      >
                        {/* Card */}
                        <motion.div
                          whileHover={{ y: -4 }}
                          onClick={() => { const wid = (item as any).worldId; if (onNavigateToWorld && wid) onNavigateToWorld(wid, char.id); else setActiveCharacter(char); }}
                          className="bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] hover:border-[#D0BCFF]/35 rounded-2xl p-4 flex flex-col items-center text-center gap-3 cursor-pointer transition-colors"
                        >
                          <div
                            className="w-14 h-14 rounded-full overflow-hidden border-2 transition-all"
                            style={{ borderColor: hoveredCharId === char.id ? char.accentColor || '#D0BCFF' : 'rgba(255,255,255,0.1)' }}
                          >
                            <img
                              src={char.imageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`}
                              alt={char.name}
                              className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=333&color=fff`; }}
                            />
                          </div>
                          <div className="space-y-0.5 min-w-0 w-full">
                            <p className="text-sm font-black text-white leading-tight truncate">{char.name}</p>
                            {char.actorName && (
                              <p className="text-[10px] text-white/35 font-black uppercase tracking-wider truncate">{char.actorName}</p>
                            )}
                            {char.role && (
                              <p className="text-[9px] text-[#D0BCFF]/50 uppercase tracking-widest truncate">{char.role}</p>
                            )}
                          </div>
                        </motion.div>

                        {/* Hover popup — top 3 connected assets */}
                        <AnimatePresence>
                          {hoveredCharId === char.id && (
                            <motion.div
                              initial={{ opacity: 0, y: 8, scale: 0.93 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.93 }}
                              transition={{ duration: 0.15 }}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 w-64 max-w-[90vw] bg-[#0C0C1A]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-4 shadow-2xl pointer-events-none"
                            >
                              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">
                                Featured In
                              </p>
                              {hoveredCharAssets.length > 0 ? (
                                <div className="space-y-2.5">
                                  {hoveredCharAssets.map((asset, i) => {
                                    const thumb =
                                      (asset as any).coverImage ||
                                      (asset as any).coverImageUrl ||
                                      (asset as any).thumbnailUrl;
                                    return (
                                      <div key={i} className="flex items-center gap-3">
                                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 border border-white/8">
                                          {thumb ? (
                                            <img src={thumb} className="w-full h-full object-cover" alt={asset.title} />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <Film size={12} className="text-white/20" />
                                            </div>
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-black text-white truncate">{asset.title}</p>
                                          <p className="text-[9px] text-white/35 uppercase tracking-wider mt-0.5">
                                            {(asset as any).genre || (asset as any).subType || 'Content'}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">
                                  No connected content yet
                                </p>
                              )}
                              {/* Arrow */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-white/10" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── CAST & CREW (movieMetadata) ───────────────────────────────── */}
              {castMembers.length > 0 && (
                <section className="mt-12 space-y-4">
                  <div className="border-l-2 border-[#D0BCFF] pl-3">
                    <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Cast &amp; Crew</h3>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {castMembers.map(member => (
                      <div key={member.id} className="bg-white/[0.05] backdrop-blur-sm border border-white/[0.08] rounded-xl px-4 py-2.5">
                        <p className="text-sm font-black text-white">{member.actorName}</p>
                        {member.characterName && (
                          <p className="text-[10px] text-white/35 uppercase tracking-wider mt-0.5">as {member.characterName}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── MORE FROM THIS WORLD ──────────────────────────────────────── */}
              {hasWorldContent && (
                <section className="mt-14 space-y-5">
                  <div className="flex items-end justify-between">
                    <div className="border-l-2 border-[#FFB68D] pl-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1">
                        {world?.name || 'World'}
                      </p>
                      <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">More From This World</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {([...worldVideos, ...worldAlbums] as any[]).slice(0, 8).map(content => (
                      <HoverPreviewThumb
                        key={content.id}
                        poster={content.coverImage || content.coverImageUrl || content.thumbnailUrl}
                        title={content.title}
                        subtitle={content.subType || content.type || (content.tracks ? 'Album' : 'Content')}
                        preview={previewSourceFor(content)}
                        accent="#FFB68D"
                        fallbackIcon={<Film size={18} className="text-white/20" />}
                        onClick={() => onOpenItem?.(content)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── DISCUSSIONS ───────────────────────────────────────────────── */}
              {filmDiscussions.length > 0 && (
                <section className="mt-14 space-y-5">
                  <div className="flex items-end justify-between">
                    <div className="border-l-2 border-[#D0BCFF] pl-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1">Community</p>
                      <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Discussions</h3>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/25 border border-white/10 px-2 py-0.5 rounded-lg">{filmDiscussions.length} thread{filmDiscussions.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-3">
                    {filmDiscussions.slice(0, 4).map(post => (
                      <div key={post.id} className="flex items-start gap-4 p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl hover:border-[#D0BCFF]/20 transition-all">
                        <div className="w-8 h-8 rounded-full bg-[#D0BCFF]/15 flex items-center justify-center shrink-0 mt-0.5">
                          <MessageCircle size={14} className="text-[#D0BCFF]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white leading-tight line-clamp-2">{post.title}</p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[9px] font-black text-[#D0BCFF] uppercase tracking-widest">↑ {post.upvotes || 0}</span>
                            <span className="text-[9px] text-white/25 font-black uppercase tracking-widest">{post.commentCount || 0} replies</span>
                            <span className="text-[9px] text-white/20 font-black uppercase tracking-widest">{post.boardName}</span>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-white/20 shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── COMMENTS ──────────────────────────────────────────────────── */}
              <section className="mt-14">
                <div className="border-l-2 border-white/15 pl-3 mb-6">
                  <h3 className="text-xl font-black uppercase tracking-[0.15em] text-white">Comments</h3>
                </div>
                <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl p-6 border border-white/[0.07]">
                  <CommentSection
                    comments={comments}
                    onPostComment={handlePostComment}
                    currentUser={currentUser}
                    onVisitUser={onVisitUser}
                  />
                </div>
              </section>
            </motion.main>
          )}
        </AnimatePresence>

        {/* ── Watch with Club Modal ─────────────────────────────────────────── */}
        <AnimatePresence>
          {showWatchWithClub && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
              onClick={() => setShowWatchWithClub(false)}
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="bg-[#0E0E1A] border border-white/10 rounded-3xl p-5 sm:p-8 w-full max-w-md max-h-[85dvh] overflow-y-auto space-y-6 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[#D0BCFF] mb-1">Club Event</p>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">Watch with Club</h3>
                  </div>
                  <button onClick={() => setShowWatchWithClub(false)} className="p-2 text-white/30 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 bg-white/[0.04] border border-white/[0.07] rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-16 rounded-xl overflow-hidden bg-white/5 shrink-0">
                    {((item as Album).coverImage || (item as Video).thumbnailUrl) && (
                      <img src={(item as Album).coverImage || (item as Video).thumbnailUrl} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white truncate">{item.title}</p>
                    <p className="text-[9px] text-[#D0BCFF] font-black uppercase tracking-widest mt-0.5">Watch Party</p>
                  </div>
                </div>

                {watchPartyDone ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                      <Check size={20} className="text-green-400" />
                    </div>
                    <p className="text-sm font-black text-white uppercase tracking-widest">Watch Party Scheduled!</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Select Club</label>
                      {userClubs.length === 0 ? (
                        <p className="text-[10px] text-white/25 font-black uppercase tracking-widest">You haven't joined any clubs yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                          {userClubs.map(club => (
                            <button
                              key={club.id}
                              onClick={() => setWatchPartyClubId(club.id)}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                watchPartyClubId === club.id
                                  ? 'bg-[#D0BCFF]/15 border-[#D0BCFF]/40'
                                  : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg bg-white/10 overflow-hidden shrink-0">
                                {club.iconImage && <img src={club.iconImage} className="w-full h-full object-cover" alt="" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-black text-white truncate">{club.name}</p>
                                <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">{club.memberCount || 0} members</p>
                              </div>
                              {watchPartyClubId === club.id && <Check size={14} className="text-[#D0BCFF] ml-auto shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-white/40">Date &amp; Time</label>
                      <input
                        type="datetime-local"
                        value={watchPartyDate}
                        onChange={e => setWatchPartyDate(e.target.value)}
                        className="w-full bg-white/[0.05] border border-white/[0.10] focus:border-[#D0BCFF]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-all"
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>

                    <button
                      onClick={handleScheduleWatchParty}
                      disabled={!watchPartyClubId || !watchPartyDate || watchPartySubmitting}
                      className="w-full h-12 bg-[#D0BCFF] hover:bg-[#E8DAFF] disabled:opacity-40 text-[#1C1B1F] font-black text-sm uppercase tracking-widest rounded-full flex items-center justify-center gap-2 transition-all"
                    >
                      <Calendar size={16} /> {watchPartySubmitting ? 'Scheduling…' : 'Schedule Watch Party'}
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show details when UI hidden */}
        {!isUIVisible && !activeVideo && isUserActive && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onClick={() => setIsUIVisible(true)}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[120] bg-black/50 backdrop-blur-md px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-white/55 border border-white/10 hover:bg-black/70 transition-all flex items-center gap-2"
          >
            <Info size={13} /> Show Details
          </motion.button>
        )}

        {/* ── FLOATING HEADER ──────────────────────────────────────────────── */}
        <div
          className={`fixed top-0 left-0 right-0 z-[150] px-5 py-4 flex items-center justify-between transition-all duration-500 ${isUserActive ? 'opacity-100' : 'opacity-0'} ${scrolled ? 'bg-black/60 backdrop-blur-2xl border-b border-white/[0.06]' : 'bg-transparent'}`}
        >
          <button
            onClick={onBack}
            className="flex items-center gap-2.5 text-white/55 hover:text-white font-black uppercase tracking-[0.2em] text-[10px] group transition-all"
          >
            <div className="w-9 h-9 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/[0.10] flex items-center justify-center group-hover:bg-white/[0.14] transition-all">
              <ArrowLeft size={16} />
            </div>
            <span className="hidden sm:inline">Back</span>
          </button>

          <h1 className={`font-black text-base tracking-[0.35em] uppercase text-white/90 transition-all duration-500 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
            Plajah Taleo
          </h1>

          <div className="flex items-center gap-2.5">
            {isOwner && (
              <button
                title="Edit film details"
                className="w-9 h-9 bg-white/[0.07] backdrop-blur-md border border-white/[0.10] rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.12] transition-all"
              >
                <Plus size={17} />
              </button>
            )}
            {currentUser?.photoURL ? (
              <button
                onClick={() => currentUser?.uid && onVisitUser(currentUser.uid)}
                className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/12 hover:border-[#D0BCFF]/50 transition-all"
              >
                <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/[0.07] border border-white/[0.10] flex items-center justify-center text-white/30">
                <Users size={16} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MovieUXView;
