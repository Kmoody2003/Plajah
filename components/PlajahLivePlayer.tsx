/**
 * PlajahLivePlayer — custom live/VOD player built on HLS.js.
 * No Mux web-component, no third-party player UI visible to the user.
 * Handles: Mux HLS (playbackId), custom HLS src, embedded iframes (YouTube/Twitch).
 * Features: auto-reconnect, quality selector, live indicator, Plajah UI overlay.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  RefreshCw, Wifi, WifiOff, Settings, ChevronDown,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlajahLivePlayerProps {
  /** Mux playback ID — resolved to https://stream.mux.com/{id}.m3u8 */
  playbackId?: string;
  /** Any HLS .m3u8 URL (overridden by playbackId) */
  src?: string;
  /** Iframe embed URL for YouTube/Twitch/external sources */
  embedSrc?: string;
  isLive?: boolean;
  title?: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
  onError?: (msg: string) => void;
  /** Creator's Stripe Connect account ID (enables tip button) */
  creatorStripeAccountId?: string;
  /** Firebase UID of the live creator */
  creatorUid?: string;
  /** Called when native video element is ready (for external controls) */
  onVideoRef?: (el: HTMLVideoElement | null) => void;
}

interface QualityLevel { height: number; bitrate: number; index: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// ── Inner HLS core ────────────────────────────────────────────────────────────

interface HlsCoreProps {
  url: string;
  autoPlay: boolean;
  muted: boolean;
  poster?: string;
  className?: string;
  onReady: (el: HTMLVideoElement) => void;
  onLevels: (levels: QualityLevel[]) => void;
  onCurrentLevel: (idx: number) => void;
  onError: () => void;
  onPlay: () => void;
  onPause: () => void;
  onTimeUpdate: (t: number, d: number, buf: number) => void;
}

const HlsCore = React.memo(React.forwardRef<HTMLVideoElement, HlsCoreProps>((
  { url, autoPlay, muted, poster, className, onReady, onLevels, onCurrentLevel, onError, onPlay, onPause, onTimeUpdate }, _
) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    onReady(video);

    const load = async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            maxBufferSize: 60 * 1000 * 1000,
            backBufferLength: 10,
            startLevel: -1,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,
            abrEwmaDefaultEstimate: 1_500_000,
            abrBandWidthFactor: 0.9,
            abrBandWidthUpFactor: 0.7,
            nudgeMaxRetry: 10,
            fragLoadingMaxRetry: 6,
            manifestLoadingMaxRetry: 4,
            levelLoadingMaxRetry: 4,
          });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, (_, data: any) => {
            const levels: QualityLevel[] = (data.levels || []).map((l: any, i: number) => ({
              height: l.height || 0,
              bitrate: l.bitrate || 0,
              index: i,
            }));
            onLevels(levels);
            if (autoPlay) video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_, data: any) => {
            onCurrentLevel(data.level);
          });
          hls.on(Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal) onError();
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          if (autoPlay) video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
        } else {
          onError();
        }
      } catch {
        onError();
      }
    };

    load();
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [url]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const buf = video.buffered.length > 0
      ? video.buffered.end(video.buffered.length - 1) - video.currentTime
      : 0;
    onTimeUpdate(video.currentTime, video.duration || 0, buf);
  };

  return (
    <video
      ref={videoRef}
      muted={muted}
      poster={poster}
      playsInline
      className={className}
      onPlay={onPlay}
      onPause={onPause}
      onTimeUpdate={handleTimeUpdate}
      onError={onError}
    />
  );
}));

// ── Main Component ────────────────────────────────────────────────────────────

const PlajahLivePlayer: React.FC<PlajahLivePlayerProps> = ({
  playbackId,
  src,
  embedSrc,
  isLive = false,
  title,
  poster,
  autoPlay = true,
  muted: initialMuted = false,
  className = '',
  onError,
  onVideoRef,
  creatorStripeAccountId,
  creatorUid,
}) => {
  const [showTipModal, setShowTipModal] = React.useState(false);
  const [tipAmount, setTipAmount] = React.useState('5');
  const [tipping, setTipping] = React.useState(false);

  const handleTip = async () => {
    if (!creatorStripeAccountId || !creatorUid) return;
    setTipping(true);
    try {
      const { auth } = await import('../services/firebase');
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert('Sign in to send a tip'); return; }
      const res = await fetch('/api/stripe/live-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorUid, creatorStripeAccountId, amount: Math.round(parseFloat(tipAmount) * 100), title }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } finally {
      setTipping(false);
      setShowTipModal(false);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferAhead, setBufferAhead] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [streamKey, setStreamKey] = useState(0); // bump to remount HLS

  const hlsUrl = playbackId
    ? `https://stream.mux.com/${playbackId}.m3u8`
    : src || '';

  const useIframe = !hlsUrl && !!embedSrc;

  // Controls visibility
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Fullscreen sync
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoElRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoElRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoElRef.current;
    const val = parseFloat(e.target.value);
    if (v) { v.volume = val; v.muted = val === 0; }
    setVolume(val);
    setIsMuted(val === 0);
  }, []);

  const seekTo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoElRef.current;
    if (!v || isLive) return;
    v.currentTime = parseFloat(e.target.value);
  }, [isLive]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleError = useCallback(() => {
    if (retryCountRef.current >= 6) {
      setErrorState('Stream unavailable. Please try again later.');
      setReconnecting(false);
      onError?.('Stream unavailable');
      return;
    }
    setReconnecting(true);
    setErrorState(null);
    const delay = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
    retryCountRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      setStreamKey(k => k + 1);
      setReconnecting(false);
    }, delay);
  }, [onError]);

  const handleRetry = () => {
    retryCountRef.current = 0;
    setErrorState(null);
    setReconnecting(false);
    setStreamKey(k => k + 1);
  };

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
  }, []);

  const handleVideoReady = useCallback((el: HTMLVideoElement) => {
    videoElRef.current = el;
    onVideoRef?.(el);
    el.volume = volume;
    el.muted = isMuted;
  }, []);

  // Compute buffer pct for bar
  const bufferPct = duration > 0 ? Math.min(((currentTime + bufferAhead) / duration) * 100, 100) : 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const qualityLabel = (level: QualityLevel) => {
    const h = level.height;
    if (h >= 2160) return '4K';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720) return '720p';
    if (h >= 480) return '480p';
    if (h >= 360) return '360p';
    return `${h}p`;
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden select-none ${className}`}
      onMouseMove={showControlsTemporarily}
      onMouseEnter={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      onClick={() => { if (!useIframe) { togglePlay(); showControlsTemporarily(); } }}
    >
      {/* ── Video layer ─────────────────────────────────────────────────── */}
      {useIframe ? (
        <iframe
          key={embedSrc}
          src={`${embedSrc}${embedSrc!.includes('?') ? '&' : '?'}autoplay=1&muted=1&mute=1`}
          className="w-full h-full border-none"
          allow="autoplay; encrypted-media; fullscreen"
          title={title || 'Live Stream'}
        />
      ) : hlsUrl ? (
        <HlsCore
          key={streamKey}
          url={hlsUrl}
          autoPlay={autoPlay}
          muted={isMuted}
          poster={poster}
          className="w-full h-full object-cover"
          onReady={handleVideoReady}
          onLevels={setQualityLevels}
          onCurrentLevel={setCurrentLevel}
          onError={handleError}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(t, d, buf) => { setCurrentTime(t); setDuration(d); setBufferAhead(buf); }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <WifiOff size={48} className="text-white/20" />
        </div>
      )}

      {/* ── Reconnecting overlay ─────────────────────────────────────── */}
      <AnimatePresence>
        {reconnecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none z-20"
          >
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={28} className="text-white/60 animate-spin" />
              <p className="text-white/60 text-xs font-black uppercase tracking-widest">Reconnecting…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error overlay ────────────────────────────────────────────── */}
      <AnimatePresence>
        {errorState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/80 z-20"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <WifiOff size={36} className="text-red-400" />
              <p className="text-white/70 text-xs leading-relaxed">{errorState}</p>
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
              >
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LIVE badge (top-left) ─────────────────────────────────────── */}
      {isLive && !useIframe && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-lg pointer-events-none">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
            <span className="text-white text-[9px] font-black uppercase tracking-widest">Live</span>
          </div>
          {/* Tip button — only shown when creator has Stripe Connect wired */}
          {creatorStripeAccountId && (
            <button
              onClick={e => { e.stopPropagation(); setShowTipModal(true); }}
              className="flex items-center gap-1.5 bg-orange-500/90 hover:bg-orange-400 px-2.5 py-1 rounded-lg transition-colors pointer-events-auto"
            >
              <span className="text-[9px] text-black font-black">💸 Tip</span>
            </button>
          )}
        </div>
      )}

      {/* Tip modal */}
      {showTipModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
          onClick={e => e.stopPropagation()}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-64 shadow-2xl">
            <div className="font-bold mb-1 text-sm">Send a tip</div>
            {title && <div className="text-xs text-white/40 mb-4 truncate">to {title}</div>}
            <div className="flex gap-2 mb-4">
              {['2','5','10','20'].map(a => (
                <button key={a} onClick={() => setTipAmount(a)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${tipAmount === a ? 'bg-orange-500/10 border-orange-500/40 text-orange-400' : 'border-white/10 text-white/40 hover:text-white'}`}>
                  ${a}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-white/40 text-sm">$</span>
              <input type="number" min="1" max="500" value={tipAmount} onChange={e => setTipAmount(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTipModal(false)} className="flex-1 py-2 rounded-xl border border-white/10 text-white/50 text-sm hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleTip} disabled={tipping || !tipAmount || parseFloat(tipAmount) < 1}
                className="flex-1 py-2 rounded-xl bg-orange-500 text-black font-bold text-sm hover:bg-orange-400 transition-colors disabled:opacity-40">
                {tipping ? '…' : `Send $${tipAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Buffer health indicator (top-right) ─────────────────────── */}
      {!useIframe && bufferAhead > 0 && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 opacity-60 pointer-events-none">
          <Wifi size={10} className="text-green-400" />
          <span className="text-[8px] text-green-400 font-black">{bufferAhead.toFixed(0)}s</span>
        </div>
      )}

      {/* ── Plajah controls overlay ───────────────────────────────────── */}
      {!useIframe && (
        <AnimatePresence>
          {showControls && !errorState && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
              onClick={e => e.stopPropagation()}
            >
              {/* Gradient scrim */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

              <div className="relative px-4 pb-3 pt-10 pointer-events-auto">
                {/* Progress / Live bar */}
                {!isLive && duration > 0 ? (
                  <div className="relative h-1 mb-3 bg-white/10 rounded-full overflow-hidden cursor-pointer" onClick={e => e.stopPropagation()}>
                    {/* Buffer */}
                    <div className="absolute top-0 left-0 h-full bg-white/20 rounded-full transition-all" style={{ width: `${bufferPct}%` }} />
                    {/* Progress */}
                    <div className="absolute top-0 left-0 h-full bg-[var(--small-orange,#ff8c00)] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                    <input
                      type="range" min={0} max={duration || 100} step={0.5} value={currentTime}
                      onChange={seekTo}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                ) : isLive ? (
                  <div className="h-1 mb-3 bg-red-600 rounded-full" />
                ) : null}

                {/* Control row */}
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <button
                    onClick={e => { e.stopPropagation(); togglePlay(); }}
                    className="w-9 h-9 flex items-center justify-center text-white hover:text-white/80 transition-all"
                  >
                    {isPlaying ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" />}
                  </button>

                  {/* Volume */}
                  <div className="flex items-center gap-2 group/vol">
                    <button onClick={e => { e.stopPropagation(); toggleMute(); }} className="text-white/80 hover:text-white transition-all">
                      {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <input
                      type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                      onChange={handleVolume}
                      onClick={e => e.stopPropagation()}
                      className="w-0 group-hover/vol:w-20 opacity-0 group-hover/vol:opacity-100 transition-all duration-200 h-1 accent-orange-500 cursor-pointer"
                    />
                  </div>

                  {/* Time */}
                  {!isLive && duration > 0 && (
                    <span className="text-white/60 text-[9px] font-mono tabular-nums">
                      {fmt(currentTime)} / {fmt(duration)}
                    </span>
                  )}
                  {isLive && (
                    <span className="text-red-400 text-[9px] font-black uppercase tracking-widest">● Live</span>
                  )}

                  <div className="flex-1" />

                  {/* Quality picker */}
                  {qualityLevels.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={e => { e.stopPropagation(); setShowSettings(s => !s); }}
                        className="flex items-center gap-1 px-2 py-1 text-white/60 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all"
                      >
                        <Settings size={13} />
                        {currentLevel === -1 ? 'Auto' : qualityLabel(qualityLevels[currentLevel])}
                        <ChevronDown size={10} />
                      </button>
                      <AnimatePresence>
                        {showSettings && (
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            className="absolute bottom-8 right-0 bg-black/95 border border-white/10 rounded-xl overflow-hidden min-w-[100px] z-50"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => { setCurrentLevel(-1); setShowSettings(false); }}
                              className={`w-full px-4 py-2 text-left text-[9px] font-black uppercase tracking-widest transition-all ${currentLevel === -1 ? 'text-orange-400 bg-orange-500/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                            >
                              Auto
                            </button>
                            {[...qualityLevels].sort((a, b) => b.height - a.height).map(l => (
                              <button
                                key={l.index}
                                onClick={() => { setCurrentLevel(l.index); setShowSettings(false); }}
                                className={`w-full px-4 py-2 text-left text-[9px] font-black uppercase tracking-widest transition-all ${currentLevel === l.index ? 'text-orange-400 bg-orange-500/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                              >
                                {qualityLabel(l)}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Fullscreen */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
                    className="text-white/60 hover:text-white transition-all"
                  >
                    {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default PlajahLivePlayer;
