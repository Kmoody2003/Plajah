import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Bell, BellRing,
  Share2, Clock, Sparkles, Radio, Users, Film, MessageCircle, Send,
  Flame, Heart, Rocket, Clapperboard, RotateCcw, FastForward, Check,
  ChevronRight, AlertCircle, RefreshCw, Eye
} from 'lucide-react';
import { Video, PremiereConfig, PremiereStatus } from '../../types';
import { calculatePremiereState, togglePremiereReminder, isReminderSetLocally, STOCK_PRE_ROLLS } from '../../services/premiereService';
import { premiereAudio } from '../../services/premiereAudioService';
import { listenToVideoComments, postVideoComment } from '../../services/backendService';
import { SubtitleTracks, usableSubtitles } from './CaptionTracks';

interface ReelloLivePremierePlayerProps {
  video: Video;
  currentUser?: any;
  onClose?: () => void;
  isTheaterMode?: boolean;
  onToggleTheater?: () => void;
  /** Allow creator to fast-forward for testing purposes */
  isOwner?: boolean;
}

interface ReactionBurst {
  id: string;
  emoji: string;
  x: number;
}

export const ReelloLivePremierePlayer: React.FC<ReelloLivePremierePlayerProps> = ({
  video,
  currentUser,
  onClose,
  isTheaterMode = false,
  onToggleTheater,
  isOwner = false,
}) => {
  // Simulated server time offset for testing / creator fast-forward
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isReminderSet, setIsReminderSet] = useState(() => isReminderSetLocally(video.id));
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reactions, setReactions] = useState<ReactionBurst[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [audioSynthesizerMuted, setAudioSynthesizerMuted] = useState(false);
  const [preRollEnded, setPreRollEnded] = useState(false);
  const [viewerCount, setViewerCount] = useState(() => video.premiereConfig?.initialViewerCount || 84);

  // Playhead state
  const [userScrubSec, setUserScrubSec] = useState<number | null>(null);
  const [currentPlaybackSec, setCurrentPlaybackSec] = useState(0);

  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const preRollVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTickSecondRef = useRef<number | null>(null);

  // Keep live clock running at 250ms interval for sub-second precision
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now() + timeOffsetMs);
    }, 250);
    return () => clearInterval(timer);
  }, [timeOffsetMs]);

  // Jitter viewer count realistically for live excitement
  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount(prev => {
        const delta = Math.floor(Math.random() * 5) - 2;
        return Math.max(12, prev + delta);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Compute current premiere state
  const state = useMemo(() => {
    return calculatePremiereState(video, clock);
  }, [video, clock]);

  const config = video.premiereConfig;
  const theme = config?.countdownTheme || 'cinematic';
  const preRollUrl = config?.preRollUrl;
  const isCreator = isOwner || (currentUser?.uid && currentUser.uid === video.ownerId);

  // Subscribe to live comments for premiere chat
  useEffect(() => {
    if (!video.id) return;
    try {
      const unsub = listenToVideoComments(video.id, (comments) => {
        setChatMessages(comments || []);
      });
      return () => { try { unsub?.(); } catch {} };
    } catch {}
  }, [video.id]);

  // Sound cue triggering during countdown
  useEffect(() => {
    if (state.status === 'COUNTDOWN') {
      const remaining = Math.max(0, state.secondsUntilStart);
      if (lastTickSecondRef.current !== remaining && remaining <= (config?.countdownDurationSec || 120)) {
        lastTickSecondRef.current = remaining;
        if (hasUserInteracted && !audioSynthesizerMuted) {
          premiereAudio.playTick(remaining, theme);
        }
      }
    } else if (state.status === 'LIVE' && lastTickSecondRef.current !== 0) {
      lastTickSecondRef.current = 0;
      if (hasUserInteracted && !audioSynthesizerMuted) {
        premiereAudio.playLaunchImpact();
      }
    }
  }, [state.status, state.secondsUntilStart, theme, config?.countdownDurationSec, hasUserInteracted, audioSynthesizerMuted]);

  // Synchronize main video playback to current live offset
  useEffect(() => {
    const el = mainVideoRef.current;
    if (!el || state.status !== 'LIVE') return;

    const liveSec = state.liveOffsetSec;
    // Only auto-seek if user isn't actively holding a scrub handle and isn't intentionally replaying an earlier segment
    if (userScrubSec === null) {
      const drift = Math.abs(el.currentTime - liveSec);
      if (drift > 1.5) {
        el.currentTime = liveSec;
      }
      if (el.paused && isPlaying) {
        el.play().catch(() => {
          el.muted = true;
          setIsMuted(true);
          el.play().catch(() => {});
        });
      }
    }
  }, [state.status, state.liveOffsetSec, userScrubSec, isPlaying]);

  // Handle Reminder toggle
  const handleToggleReminder = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    setHasUserInteracted(true);
    try {
      const next = await togglePremiereReminder(video.id, currentUser?.uid);
      setIsReminderSet(next);
    } finally {
      setReminderBusy(false);
    }
  };

  // Trigger floating reaction emoji
  const triggerReaction = (emoji: string) => {
    setHasUserInteracted(true);
    const newReaction: ReactionBurst = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      emoji,
      x: 20 + Math.random() * 60, // percentage 20-80%
    };
    setReactions(prev => [...prev.slice(-12), newReaction]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 2200);
  };

  // Send live chat message
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatSending(true);
    setHasUserInteracted(true);
    try {
      await postVideoComment(video.id, text, undefined, undefined, Math.floor(state.liveOffsetSec));
      setChatInput('');
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setChatSending(false);
    }
  };

  // Jump back to live edge (DVR catch up)
  const jumpToLive = () => {
    setUserScrubSec(null);
    const el = mainVideoRef.current;
    if (el && state.status === 'LIVE') {
      el.currentTime = state.liveOffsetSec;
      el.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Main video video timeupdate
  const handleTimeUpdate = () => {
    const el = mainVideoRef.current;
    if (el) {
      setCurrentPlaybackSec(el.currentTime);
      // Clamp forward seek during LIVE premiere: viewers CANNOT seek ahead of live edge
      if (state.status === 'LIVE' && !config?.allowSeekAhead) {
        if (el.currentTime > state.liveOffsetSec + 0.5) {
          el.currentTime = state.liveOffsetSec;
        }
      }
    }
  };

  // Pre-roll playback resolution
  const handlePreRollEnded = () => {
    setPreRollEnded(true);
  };

  // Main video stream URL
  const videoSourceUrl = useMemo(() => {
    if (video.verticalVideoUrl) return video.verticalVideoUrl;
    if ((video as any).muxPlaybackId) return `https://stream.mux.com/${(video as any).muxPlaybackId}.m3u8`;
    return video.url || '';
  }, [video]);

  // Formatted countdown strings
  const formattedCountdown = useMemo(() => {
    const totalSecs = Math.max(0, state.secondsUntilStart);
    const days = Math.floor(totalSecs / 86400);
    const hours = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    return {
      days,
      hours: hours.toString().padStart(2, '0'),
      mins: mins.toString().padStart(2, '0'),
      secs: secs.toString().padStart(2, '0'),
      totalSecs,
    };
  }, [state.secondsUntilStart]);

  // Distance from live edge (for DVR badge)
  const isBehindLive = state.status === 'LIVE' && (state.liveOffsetSec - currentPlaybackSec) > 3;

  return (
    <div
      ref={containerRef}
      onClick={() => setHasUserInteracted(true)}
      className="relative w-full rounded-3xl overflow-hidden bg-black border border-white/15 shadow-[0_0_80px_rgba(0,0,0,0.9)] flex flex-col select-none"
    >
      {/* ─── CREATOR TEST BENCH (Fast-forward / testing presets) ─── */}
      {isCreator && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex flex-wrap items-center justify-between text-xs gap-2 z-30">
          <div className="flex items-center gap-2 text-amber-400 font-mono font-bold">
            <Radio size={13} className="animate-pulse" />
            <span>PREMIERE SIMULATOR: State = {state.status}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                // Set offset so countdown starts in 8 seconds
                const startInMs = (config?.countdownDurationSec || 120) * 1000 - 8000;
                const target = (video.premiereStartTime || Date.now()) - startInMs;
                setTimeOffsetMs(target - Date.now());
              }}
              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[10px]"
            >
              Countdown in 8s
            </button>
            <button
              onClick={() => {
                // Jump directly into 10s before LIVE
                const target = (video.premiereStartTime || Date.now()) - 10000;
                setTimeOffsetMs(target - Date.now());
              }}
              className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-[10px]"
            >
              Live in 10s
            </button>
            <button
              onClick={() => {
                // Jump to 20s into LIVE
                const target = (video.premiereStartTime || Date.now()) + 20000;
                setTimeOffsetMs(target - Date.now());
              }}
              className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px]"
            >
              Live Now (+20s)
            </button>
            <button
              onClick={() => setTimeOffsetMs(0)}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold text-[10px]"
              title="Reset to real world clock"
            >
              <RotateCcw size={11} className="inline mr-1" />
              Reset Clock
            </button>
          </div>
        </div>
      )}

      {/* ─── TOP LIVE STATUS BAR ─── */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {state.status === 'LIVE' ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/90 backdrop-blur-md text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-red-600/30">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>LIVE PREMIERE</span>
            </div>
          ) : state.status === 'COUNTDOWN' ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/90 backdrop-blur-md text-black text-xs font-black uppercase tracking-wider shadow-lg shadow-orange-500/30 animate-pulse">
              <Sparkles size={13} />
              <span>COUNTDOWN</span>
            </div>
          ) : state.status === 'SCHEDULED' ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white text-xs font-bold uppercase tracking-wider">
              <Clock size={13} className="text-orange-400" />
              <span>PREMIERE</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white/80 text-xs font-bold uppercase tracking-wider">
              <Film size={13} />
              <span>PREMIERE COMPLETED</span>
            </div>
          )}

          {/* Viewer counter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white/80 text-xs font-mono font-bold">
            <Eye size={12} className="text-red-400" />
            <span>{viewerCount.toLocaleString()}</span>
            <span className="text-[10px] text-white/40 uppercase hidden sm:inline">
              {state.status === 'LIVE' ? 'watching' : 'waiting'}
            </span>
          </div>
        </div>

        {/* Audio / Theater controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {state.status === 'COUNTDOWN' && (
            <button
              onClick={() => {
                const next = !audioSynthesizerMuted;
                setAudioSynthesizerMuted(next);
                premiereAudio.setMuted(next);
              }}
              className="p-2 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/15 text-white text-xs transition-all active:scale-95"
              title={audioSynthesizerMuted ? 'Unmute Countdown Tone' : 'Mute Countdown Tone'}
            >
              {audioSynthesizerMuted ? <VolumeX size={15} className="text-red-400" /> : <Volume2 size={15} />}
            </button>
          )}

          {onToggleTheater && (
            <button
              onClick={onToggleTheater}
              className="p-2 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/15 text-white text-xs transition-all active:scale-95"
              title="Toggle Theater Mode"
            >
              {isTheaterMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}

          <button
            onClick={() => setShowChat(s => !s)}
            className={`p-2 rounded-full backdrop-blur-md border text-xs transition-all active:scale-95 ${
              showChat
                ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                : 'bg-black/60 hover:bg-black/90 border-white/15 text-white'
            }`}
            title={showChat ? 'Hide Live Chat' : 'Show Live Chat'}
          >
            <MessageCircle size={15} />
          </button>
        </div>
      </div>

      {/* ─── MAIN PLAYER CANVAS & PHASES ─── */}
      <div className={`relative w-full ${isTheaterMode ? 'aspect-[16/9] max-h-[72vh]' : 'aspect-[16/9] sm:aspect-[16/9] min-h-[460px]'} flex items-center justify-center bg-[#0a0a0f]`}>
        {/* Floating live reaction particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-25">
          <AnimatePresence>
            {reactions.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 1, y: '85%', x: `${r.x}%`, scale: 0.6 }}
                animate={{ opacity: 0, y: '15%', scale: 1.8 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: 'easeOut' }}
                className="absolute text-3xl select-none"
              >
                {r.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            PHASE 1: SCHEDULED WAITING ROOM (Thumbnail + Clock + Reminder)
           ═══════════════════════════════════════════════════════════════ */}
        {state.status === 'SCHEDULED' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center">
            {/* Ambient blurred backdrop */}
            <div
              className="absolute inset-0 bg-cover bg-center filter blur-2xl opacity-35 scale-110"
              style={{
                backgroundImage: `url(${video.thumbnailUrl || video.coverImageUrl || 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?w=1200'})`
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/80" />

            <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center space-y-6">
              {/* Creator & Title Tag */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-orange-400 text-xs font-bold uppercase tracking-widest">
                  <Clapperboard size={13} />
                  <span>Upcoming Premiere</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  {video.title}
                </h1>
                <p className="text-sm font-medium text-white/60">
                  {video.artist || (video as any).channelName || 'Plajah Creator'}
                </p>
              </div>

              {/* Countdown Digital Matrix Clock */}
              <div className="flex items-center gap-3 sm:gap-4 my-2">
                {formattedCountdown.days > 0 && (
                  <div className="flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10 min-w-[70px]">
                    <span className="text-2xl sm:text-4xl font-black font-mono text-white">
                      {formattedCountdown.days}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-white/40 mt-1 font-bold">Days</span>
                  </div>
                )}
                <div className="flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10 min-w-[70px]">
                  <span className="text-2xl sm:text-4xl font-black font-mono text-white">
                    {formattedCountdown.hours}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-white/40 mt-1 font-bold">Hours</span>
                </div>
                <div className="text-xl sm:text-3xl font-bold text-white/30 self-center -mt-4">:</div>
                <div className="flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10 min-w-[70px]">
                  <span className="text-2xl sm:text-4xl font-black font-mono text-white">
                    {formattedCountdown.mins}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-white/40 mt-1 font-bold">Mins</span>
                </div>
                <div className="text-xl sm:text-3xl font-bold text-white/30 self-center -mt-4">:</div>
                <div className="flex flex-col items-center p-3 sm:p-4 rounded-2xl bg-white/5 border border-white/10 min-w-[70px]">
                  <span className="text-2xl sm:text-4xl font-black font-mono text-orange-400">
                    {formattedCountdown.secs}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-white/40 mt-1 font-bold">Secs</span>
                </div>
              </div>

              {/* Action Buttons: Set Reminder & Share */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggleReminder}
                  disabled={reminderBusy}
                  className={`flex items-center gap-2.5 px-6 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all shadow-xl active:scale-95 ${
                    isReminderSet
                      ? 'bg-emerald-500 text-black shadow-emerald-500/30'
                      : 'bg-white text-black hover:bg-white/90 shadow-white/20'
                  }`}
                >
                  {isReminderSet ? (
                    <>
                      <Check size={16} />
                      <span>Reminder Set</span>
                    </>
                  ) : (
                    <>
                      <BellRing size={16} className="text-orange-600" />
                      <span>Notify Me (Set Reminder)</span>
                    </>
                  )}
                </button>

                {preRollUrl && (
                  <button
                    onClick={() => {
                      const v = preRollVideoRef.current;
                      if (v) {
                        v.currentTime = 0;
                        v.play().catch(() => {});
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-3 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    <Film size={14} className="text-orange-400" />
                    <span>Watch Teaser</span>
                  </button>
                )}
              </div>

              {/* Subtitle / date announce */}
              <p className="text-xs text-white/50">
                Premiere scheduled for {new Date(video.premiereStartTime || Date.now()).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            PHASE 2: LIVE COUNTDOWN & OPTIONAL PRE-ROLL VIDEO
           ═══════════════════════════════════════════════════════════════ */}
        {state.status === 'COUNTDOWN' && (
          <div className="absolute inset-0 z-15 flex flex-col items-center justify-center overflow-hidden">
            {/* Optional Pre-roll teaser video in background or split */}
            {preRollUrl && !preRollEnded ? (
              <div className="absolute inset-0 w-full h-full">
                <video
                  ref={preRollVideoRef}
                  src={preRollUrl}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  onEnded={handlePreRollEnded}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
                <div className="absolute top-16 left-6 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-white/15 text-[11px] font-bold text-white/80">
                  <Film size={12} className="text-orange-400" />
                  <span>Pre-Roll Feature: {config?.preRollTitle || 'Teaser'}</span>
                </div>
              </div>
            ) : (
              /* Themed Visual Countdown Canvas */
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Visual theme backdrops */}
                {theme === 'classic' ? (
                  /* Classic Film Projector Leader Countdown */
                  <div className="relative w-72 h-72 sm:w-88 sm:h-88 rounded-full border-4 border-white/30 flex items-center justify-center shadow-[0_0_100px_rgba(255,255,255,0.1)]">
                    {/* Crosshair lines */}
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/40" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/40" />
                    <div className="absolute inset-6 rounded-full border-2 border-white/20" />
                    <div className="absolute inset-14 rounded-full border-2 border-white/20" />
                    {/* Rotating sweep hand */}
                    <div
                      className="absolute inset-0 rounded-full border-t-4 border-r-4 border-orange-500 animate-spin"
                      style={{ animationDuration: '1s' }}
                    />
                  </div>
                ) : theme === 'cyber' ? (
                  /* Cyberpunk Neon Matrix */
                  <div className="relative w-80 h-80 rounded-3xl border border-cyan-500/40 bg-cyan-950/20 flex items-center justify-center shadow-[0_0_80px_rgba(6,182,212,0.25)]">
                    <div className="absolute inset-0 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />
                    <div className="absolute inset-2 border border-magenta-500/30 rounded-2xl animate-pulse" />
                  </div>
                ) : theme === 'gold' ? (
                  /* Gold Horizon Cinematic */
                  <div className="relative w-80 h-80 rounded-full border border-amber-500/50 bg-amber-950/20 flex items-center justify-center shadow-[0_0_100px_rgba(245,158,11,0.25)]">
                    <div className="absolute inset-4 rounded-full border-2 border-dashed border-amber-400/40 animate-spin" style={{ animationDuration: '20s' }} />
                  </div>
                ) : (
                  /* Cinematic Sci-Fi (Default) */
                  <div className="relative w-72 h-72 sm:w-84 sm:h-84 rounded-full border border-orange-500/30 bg-orange-950/10 flex items-center justify-center shadow-[0_0_120px_rgba(249,115,22,0.2)]">
                    <div className="absolute inset-0 rounded-full border-2 border-t-orange-500 border-b-transparent border-l-transparent border-r-transparent animate-spin" style={{ animationDuration: '3s' }} />
                    <div className="absolute inset-4 rounded-full border border-white/10" />
                  </div>
                )}
              </div>
            )}

            {/* Countdown Big Digits Display */}
            <div className="relative z-20 flex flex-col items-center justify-center space-y-3">
              <span className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-orange-400 animate-pulse">
                Premiere Starts In
              </span>
              <div className="text-6xl sm:text-8xl font-black font-mono text-white tracking-tighter tabular-nums drop-shadow-[0_0_35px_rgba(255,255,255,0.4)]">
                {formattedCountdown.totalSecs <= 60 ? (
                  formattedCountdown.secs
                ) : (
                  `${formattedCountdown.mins}:${formattedCountdown.secs}`
                )}
              </div>
              <p className="text-xs font-bold text-white/60 uppercase tracking-widest max-w-xs text-center truncate">
                {video.title}
              </p>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            PHASE 3 & 4: SYNCHRONIZED LIVE PREMIERE / COMPLETED REPLAY
           ═══════════════════════════════════════════════════════════════ */}
        {(state.status === 'LIVE' || state.status === 'ENDED') && (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={mainVideoRef}
              key={video.id}
              src={videoSourceUrl}
              poster={video.thumbnailUrl || video.coverImageUrl}
              crossOrigin={usableSubtitles(video).length ? 'anonymous' : undefined}
              className="w-full h-full object-contain"
              autoPlay
              playsInline
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              <SubtitleTracks video={video} />
            </video>

            {/* Central Play/Pause button on user interaction */}
            {!isPlaying && (
              <button
                onClick={() => {
                  const el = mainVideoRef.current;
                  if (el) {
                    el.play().catch(() => {});
                    setIsPlaying(true);
                  }
                }}
                className="absolute z-20 w-20 h-20 rounded-full bg-black/70 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all"
              >
                <Play size={36} fill="white" className="ml-1" />
              </button>
            )}

            {/* Catch Up to Live DVR Banner */}
            {isBehindLive && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
                <button
                  onClick={jumpToLive}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider shadow-2xl shadow-red-600/50 active:scale-95 transition-all animate-bounce"
                >
                  <FastForward size={14} />
                  <span>Jump To Live Broadcast</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── FLOATING LIVE EMOJI REACTION TOOLBAR ─── */}
        <div className="absolute bottom-16 right-4 z-25 flex flex-col gap-2 pointer-events-auto">
          {['🔥', '🎉', '🚀', '❤️', '🍿', '👏'].map(emoji => (
            <button
              key={emoji}
              onClick={() => triggerReaction(emoji)}
              className="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md border border-white/15 flex items-center justify-center text-lg hover:scale-125 active:scale-90 transition-transform shadow-lg"
              title={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* ─── SCRUBBER / BOTTOM CONTROL BAR (DVR Mode) ─── */}
        {(state.status === 'LIVE' || state.status === 'ENDED') && (
          <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 flex flex-col gap-2">
            {/* Scrubber bar with Live Clamp */}
            <div className="relative w-full flex items-center group cursor-pointer">
              <input
                type="range"
                min={0}
                max={state.status === 'LIVE' ? state.liveOffsetSec : (state.totalDurationSec || 180)}
                value={userScrubSec !== null ? userScrubSec : currentPlaybackSec}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setUserScrubSec(val);
                }}
                onMouseUp={() => {
                  if (userScrubSec !== null && mainVideoRef.current) {
                    mainVideoRef.current.currentTime = userScrubSec;
                    setUserScrubSec(null);
                  }
                }}
                onTouchEnd={() => {
                  if (userScrubSec !== null && mainVideoRef.current) {
                    mainVideoRef.current.currentTime = userScrubSec;
                    setUserScrubSec(null);
                  }
                }}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:h-2.5 transition-all"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-white/80">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const el = mainVideoRef.current;
                    if (el) {
                      if (isPlaying) { el.pause(); setIsPlaying(false); }
                      else { el.play().catch(() => {}); setIsPlaying(true); }
                    }
                  }}
                  className="hover:text-white transition-colors"
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
                </button>

                <button
                  onClick={() => {
                    const next = !isMuted;
                    setIsMuted(next);
                    if (mainVideoRef.current) mainVideoRef.current.muted = next;
                  }}
                  className="hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX size={17} className="text-red-400" /> : <Volume2 size={17} />}
                </button>

                {/* DVR Status: Red Live Dot or Rewound */}
                {state.status === 'LIVE' ? (
                  <button
                    onClick={jumpToLive}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider transition-all ${
                      isBehindLive
                        ? 'bg-white/10 hover:bg-red-600 text-white/60 hover:text-white'
                        : 'bg-red-600 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isBehindLive ? 'bg-white/40' : 'bg-white animate-pulse'}`} />
                    <span>LIVE</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-mono text-white/50">VOD REPLAY</span>
                )}
              </div>

              {/* Time display */}
              <div className="font-mono text-[11px] text-white/60">
                {Math.floor(currentPlaybackSec / 60)}:{(Math.floor(currentPlaybackSec % 60)).toString().padStart(2, '0')} / {Math.floor((state.totalDurationSec || 180) / 60)}:{Math.floor((state.totalDurationSec || 180) % 60).toString().padStart(2, '0')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── LIVE CHAT & WAITING ROOM STREAM (Docked Side / Bottom) ─── */}
      {showChat && (
        <div className="w-full bg-[#0d0d12] border-t border-white/10 p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/8">
            <div className="flex items-center gap-2">
              <MessageCircle size={15} className="text-orange-400" />
              <span className="text-xs font-black uppercase tracking-widest text-white">
                {state.status === 'LIVE' ? 'Premiere Live Chat' : 'Waiting Room Chat'}
              </span>
            </div>
            <span className="text-[10px] text-white/40 font-mono">
              {chatMessages.length} comments
            </span>
          </div>

          {/* Chat Messages Feed */}
          <div className="max-h-48 overflow-y-auto space-y-2 pr-1 no-scrollbar flex flex-col-reverse">
            {chatMessages.slice(0, 30).map((msg: any) => (
              <div key={msg.id} className="flex items-start gap-2.5 text-xs">
                {msg.userPhoto ? (
                  <img src={msg.userPhoto} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mt-0.5" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    {(msg.userName || 'U')[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-bold text-white/90 mr-2 text-[11px]">{msg.userName || 'Fan'}</span>
                  <span className="text-white/70 break-words leading-relaxed">{msg.text}</span>
                </div>
              </div>
            ))}
            {chatMessages.length === 0 && (
              <p className="text-center text-xs text-white/30 py-4">
                Be the first to say something in the waiting room!
              </p>
            )}
          </div>

          {/* Chat Input Box */}
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2 border-t border-white/8">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={currentUser ? "Say something in Premiere Chat..." : "Sign in to chat"}
              disabled={!currentUser || chatSending}
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-orange-500/60"
            />
            <button
              type="submit"
              disabled={!currentUser || !chatInput.trim() || chatSending}
              className="p-2 rounded-full bg-orange-500 hover:bg-orange-400 disabled:opacity-30 text-black font-bold transition-all active:scale-95"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ReelloLivePremierePlayer;
