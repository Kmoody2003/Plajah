// PixelsWatchFolderLoopDeck.tsx — Dedicated Watch Folder Random Loop Player for Plajah Pixels.
// Enables user to point to a local folder of video/motion clips, configure loop count,
// and auto-play clips randomly as loops with real-time loop progress and live switching.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen, Repeat, Shuffle, Play, Pause, SkipForward,
  RefreshCw, CheckCircle2, Film, X, Sparkles, AlertCircle, Folder
} from 'lucide-react';
import {
  type WatchFolderMediaItem,
  type WatchFolderResult,
  pickWatchFolder,
  rescanDirectoryHandle,
  selectRandomItem,
} from '../../../services/mediaEngine/watchFolderLoopService';
import type { BackgroundMedia } from '../types';

interface PixelsWatchFolderLoopDeckProps {
  onClose?: () => void;
  onSetLayerMedia?: (media: BackgroundMedia) => void;
  bgMedia1?: BackgroundMedia[];
  setBgMedia1?: React.Dispatch<React.SetStateAction<BackgroundMedia[]>>;
}

export const PixelsWatchFolderLoopDeck: React.FC<PixelsWatchFolderLoopDeckProps> = ({
  onClose,
  onSetLayerMedia,
  bgMedia1,
  setBgMedia1,
}) => {
  const [folderName, setFolderName] = useState<string>(() => {
    try { return localStorage.getItem('pixels_wf_name') || ''; } catch { return ''; }
  });
  const [items, setItems] = useState<WatchFolderMediaItem[]>([]);
  const [handle, setHandle] = useState<any>(null);
  const [targetLoops, setTargetLoops] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('pixels_wf_target_loops') || '1', 10) || 1; } catch { return 1; }
  });
  const [currentLoopCount, setCurrentLoopCount] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentClip, setCurrentClip] = useState<WatchFolderMediaItem | null>(null);
  const [nextUpcomingClip, setNextUpcomingClip] = useState<WatchFolderMediaItem | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const loopCountRef = useRef(1);
  const targetLoopsRef = useRef(targetLoops);
  targetLoopsRef.current = targetLoops;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const currentClipRef = useRef(currentClip);
  currentClipRef.current = currentClip;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  // Persist target loops
  const handleSetTargetLoops = (n: number) => {
    const val = Math.max(1, Math.min(50, n));
    setTargetLoops(val);
    try { localStorage.setItem('pixels_wf_target_loops', String(val)); } catch {}
  };

  // Play next random clip
  const playNextRandomClip = useCallback(() => {
    const pool = itemsRef.current.filter(it => it.kind === 'VIDEO' || it.kind === 'IMAGE');
    if (pool.length === 0) return;

    const pick = selectRandomItem(pool, currentClipRef.current ?? undefined);
    if (!pick) return;

    const chosen = pick.item;
    setCurrentClip(chosen);
    currentClipRef.current = chosen;
    loopCountRef.current = 1;
    setCurrentLoopCount(1);

    // Pick upcoming preview clip
    const nextPick = selectRandomItem(pool, chosen);
    setNextUpcomingClip(nextPick?.item ?? null);

    // Push into Pixels background video media
    const media: BackgroundMedia = {
      id: chosen.id,
      url: chosen.url,
      type: chosen.kind === 'IMAGE' ? 'image' : 'video',
    };

    if (onSetLayerMedia) {
      onSetLayerMedia(media);
    }
    if (setBgMedia1) {
      setBgMedia1([media]);
    }
  }, [onSetLayerMedia, setBgMedia1]);

  // Handle Pick Folder
  const handlePickFolder = async () => {
    setIsScanning(true);
    try {
      const res = await pickWatchFolder();
      if (res && res.items.length > 0) {
        setFolderName(res.folderName);
        setHandle(res.handle || null);
        setItems(res.items);
        try { localStorage.setItem('pixels_wf_name', res.folderName); } catch {}

        // Pick initial next upcoming
        const pool = res.items.filter(it => it.kind === 'VIDEO');
        if (pool.length > 0) {
          const first = pool[Math.floor(Math.random() * pool.length)];
          setNextUpcomingClip(first);
        }
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Rescan existing directory handle
  const handleRescan = async () => {
    if (!handle) return;
    setIsScanning(true);
    try {
      const { items: updated, addedCount } = await rescanDirectoryHandle(handle, itemsRef.current);
      setItems(updated);
      if (addedCount > 0) {
        console.log(`[Pixels Watch Folder] Detected ${addedCount} new loop files`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Periodic poll of directory handle if watching
  useEffect(() => {
    if (!handle || !isPlaying) return;
    const interval = setInterval(() => {
      void handleRescan();
    }, 6000);
    return () => clearInterval(interval);
  }, [handle, isPlaying]);

  // Toggle playback
  const handleTogglePlay = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      if (!currentClip) {
        playNextRandomClip();
      }
    } else {
      setIsPlaying(false);
    }
  };

  // Listen to video loop events from the application
  useEffect(() => {
    const handleVideoLoop = (e: Event) => {
      if (!isPlayingRef.current) return;
      const customEvt = e as CustomEvent<{ src?: string }>;
      const activeSrc = currentClipRef.current?.url;

      // If event source matches or is generic video loop
      if (!customEvt.detail?.src || !activeSrc || customEvt.detail.src === activeSrc) {
        const nextLoop = loopCountRef.current + 1;
        if (nextLoop > targetLoopsRef.current) {
          // Finished required number of loops! Advance to next random clip
          playNextRandomClip();
        } else {
          loopCountRef.current = nextLoop;
          setCurrentLoopCount(nextLoop);
        }
      }
    };

    window.addEventListener('ambo:video-loop', handleVideoLoop);
    return () => window.removeEventListener('ambo:video-loop', handleVideoLoop);
  }, [playNextRandomClip]);

  // Also hook into any active video tags in the DOM for fallback loop detection
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = 0;

    const interval = setInterval(() => {
      const vids = Array.from(document.querySelectorAll('video'));
      const activeVid = vids.find(v => !v.paused && v.duration > 0);
      if (!activeVid) return;

      if (!activeVid.seeking && activeVid.currentTime < lastTime - 0.4 && lastTime > 0.5) {
        // Video wrapped around
        const nextLoop = loopCountRef.current + 1;
        if (nextLoop > targetLoopsRef.current) {
          playNextRandomClip();
        } else {
          loopCountRef.current = nextLoop;
          setCurrentLoopCount(nextLoop);
        }
      }
      lastTime = activeVid.currentTime;
    }, 200);

    return () => clearInterval(interval);
  }, [isPlaying, playNextRandomClip]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#0C0816] border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 0 50px rgba(139,92,246,0.25)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-purple-950/40 to-black">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Repeat className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide text-white flex items-center gap-2">
                PIXELS WATCH FOLDER LOOPS
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  RANDOM DECK
                </span>
              </h2>
              <p className="text-[11px] text-white/50">Point to any folder and auto-play loops randomly with custom loop counts</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Step 1: Point to folder */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-purple-400" />
                1. Select Media Folder
              </span>
              {items.length > 0 && (
                <span className="text-[11px] text-purple-300 font-mono">
                  {items.length} clips ready
                </span>
              )}
            </div>

            {folderName ? (
              <div className="flex items-center justify-between bg-black/40 p-3 rounded-lg border border-purple-500/30">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-md bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
                    <Film className="w-4 h-4 text-purple-300" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-extrabold text-white truncate">{folderName}</p>
                    <p className="text-[10px] text-white/50">{items.length} video/motion clips detected</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {handle && (
                    <button
                      onClick={handleRescan}
                      disabled={isScanning}
                      title="Rescan folder for newly added files"
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    onClick={handlePickFolder}
                    className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-xs font-bold text-purple-200 transition-colors"
                  >
                    Change Folder
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handlePickFolder}
                disabled={isScanning}
                className="w-full py-4 rounded-xl border border-dashed border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/40 flex flex-col items-center justify-center gap-2 group transition-all"
              >
                <FolderOpen className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-white group-hover:text-purple-200">
                  Click to Point to Media Folder
                </span>
                <span className="text-[10px] text-white/40">Selects directory with MP4, MOV, WEBM, or image loops</span>
              </button>
            )}
          </div>

          {/* Step 2: Set Loop Amount */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-cyan-400" />
                2. Set Loop Amount
              </span>
              <span className="text-[11px] font-mono text-cyan-300">
                Loops {targetLoops}x before random pick
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 bg-black/40 p-3 rounded-lg border border-white/5">
              <span className="text-xs text-white/70">Each clip loops:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSetTargetLoops(targetLoops - 1)}
                  disabled={targetLoops <= 1}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white font-bold flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={targetLoops}
                  onChange={e => handleSetTargetLoops(parseInt(e.target.value, 10) || 1)}
                  className="w-16 h-8 text-center bg-black/60 border border-white/20 rounded-lg text-sm font-black text-cyan-300 focus:outline-none focus:border-cyan-400 font-mono"
                />
                <button
                  onClick={() => handleSetTargetLoops(targetLoops + 1)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold flex items-center justify-center"
                >
                  +
                </button>
                <span className="text-xs font-bold text-white/50 ml-1">times</span>
              </div>
            </div>

            {/* Quick preset buttons */}
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3, 4, 5, 8].map(cnt => (
                <button
                  key={cnt}
                  onClick={() => handleSetTargetLoops(cnt)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${
                    targetLoops === cnt
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/60 shadow-lg shadow-cyan-500/20'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white border border-white/5'
                  }`}
                >
                  {cnt}x
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Playback & Status HUD */}
          <div className="p-4 rounded-xl bg-gradient-to-b from-purple-900/20 to-black/60 border border-purple-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-2">
                <Shuffle className="w-3.5 h-3.5 text-pink-400" />
                3. Random Loop Playback
              </span>
              {isPlaying && (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-pink-300">
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
                  AUTO-PLAYING LOOPS
                </span>
              )}
            </div>

            {/* Current Playing Details */}
            {currentClip ? (
              <div className="space-y-2 bg-black/60 p-3.5 rounded-xl border border-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 text-[10px] uppercase font-bold tracking-wider">Now Playing:</span>
                  <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40 text-[11px] font-mono font-bold">
                    Loop {currentLoopCount} of {targetLoops}
                  </span>
                </div>
                <p className="text-sm font-extrabold text-white truncate font-mono">
                  {currentClip.name}
                </p>

                {/* Progress bar of completed loops */}
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${Math.min(100, (currentLoopCount / targetLoops) * 100)}%` }}
                  />
                </div>

                {nextUpcomingClip && (
                  <p className="text-[10px] text-white/40 truncate pt-1">
                    Up next randomly: <span className="text-white/70 font-mono">{nextUpcomingClip.name}</span>
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-white/40">
                {items.length > 0 ? 'Press Play to start random loop sequence' : 'Select a folder above to get started'}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleTogglePlay}
                disabled={items.length === 0}
                className={`flex-1 h-11 rounded-xl text-xs font-black tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 ${
                  isPlaying
                    ? 'bg-amber-600/80 hover:bg-amber-600 text-white shadow-amber-600/30'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-purple-600/30'
                }`}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" /> Pause LoopDeck
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" /> Start Random LoopDeck
                  </>
                )}
              </button>

              <button
                onClick={playNextRandomClip}
                disabled={items.length === 0}
                title="Immediately advance to next random clip"
                className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
              >
                <SkipForward className="w-4 h-4" />
                Next Random
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between text-[11px] text-white/40">
          <span>Clips automatically cycle randomly after completing configured loops</span>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default PixelsWatchFolderLoopDeck;
