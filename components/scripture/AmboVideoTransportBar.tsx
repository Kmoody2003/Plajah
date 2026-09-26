// AmboVideoTransportBar.tsx — Dedicated broadcast video transport controls for Ambo Pro Presenter
// Provides timeline scrubbing, play/pause, elapsed/total time, volume slider, mute, loop, and restart.

import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Repeat, Volume2, VolumeX, Film } from 'lucide-react';
import type { LayerContent } from '../../services/ambo/showModel';

interface AmboVideoTransportBarProps {
  videoContent: Extract<LayerContent, { kind: 'VIDEO' }> | null;
  label?: string;
  isLive?: boolean;
  onUpdateContent?: (updated: Partial<Extract<LayerContent, { kind: 'VIDEO' }>>) => void;
  onClose?: () => void;
}

export const AmboVideoTransportBar: React.FC<AmboVideoTransportBarProps> = ({
  videoContent,
  label = 'Video Clip',
  isLive = true,
  onUpdateContent,
  onClose,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState<number>(videoContent?.volume ?? 1.0);
  const [isMuted, setIsMuted] = useState<boolean>(videoContent?.muted ?? false);
  const [isLooping, setIsLooping] = useState<boolean>(videoContent?.loop ?? true);

  // Probe media elements or find the active video tag in DOM
  useEffect(() => {
    const findVideo = (): HTMLVideoElement | null => {
      const vids = Array.from(document.querySelectorAll('video'));
      if (vids.length === 0) return null;
      // Match by src if available, or take the active playing video
      if (videoContent?.src) {
        const hit = vids.find(v => v.src === videoContent.src || v.currentSrc === videoContent.src);
        if (hit) return hit;
      }
      return vids[0] || null;
    };

    const interval = setInterval(() => {
      const v = findVideo();
      if (v) {
        setIsPlaying(!v.paused && !v.ended);
        setCurrentTime(v.currentTime || 0);
        if (v.duration && !isNaN(v.duration)) {
          setDuration(v.duration);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [videoContent?.src]);

  const getVideoElement = (): HTMLVideoElement | null => {
    const vids = Array.from(document.querySelectorAll('video'));
    if (videoContent?.src) {
      const hit = vids.find(v => v.src === videoContent.src || v.currentSrc === videoContent.src);
      if (hit) return hit;
    }
    return vids[0] || null;
  };

  const handleTogglePlay = () => {
    const v = getVideoElement();
    if (!v) return;
    if (v.paused || v.ended) {
      void v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (timeSec: number) => {
    const v = getVideoElement();
    if (v) {
      v.currentTime = timeSec;
      setCurrentTime(timeSec);
    }
  };

  const handleRestart = () => {
    const v = getVideoElement();
    if (v) {
      v.currentTime = 0;
      setCurrentTime(0);
      void v.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleToggleLoop = () => {
    const next = !isLooping;
    setIsLooping(next);
    const v = getVideoElement();
    if (v) v.loop = next;
    onUpdateContent?.({ loop: next });
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    const v = getVideoElement();
    if (v) {
      v.volume = newVol;
      if (newVol > 0 && v.muted) {
        v.muted = false;
        setIsMuted(false);
      }
    }
    onUpdateContent?.({ volume: newVol, muted: newVol === 0 });
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    const v = getVideoElement();
    if (v) v.muted = next;
    onUpdateContent?.({ muted: next });
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  if (!videoContent) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-[#0b0816]/95 border-b border-white/10 text-white text-[11px] select-none backdrop-blur-md">
      {/* Status Badge */}
      <div className="flex items-center gap-1.5 flex-none">
        <Film size={13} className={isLive ? 'text-[#00DAF3]' : 'text-amber-400'} />
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
            isLive ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {isLive ? 'PGM VIDEO' : 'PRV VIDEO'}
        </span>
        <span className="font-semibold text-white/80 max-w-[140px] truncate" title={label}>
          {label}
        </span>
      </div>

      <div className="w-px h-4 bg-white/15 flex-none" />

      {/* Transport Buttons */}
      <div className="flex items-center gap-1 flex-none">
        <button
          type="button"
          onClick={handleRestart}
          className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white transition-all"
          title="Restart video (0:00)"
        >
          <RotateCcw size={12} />
        </button>
        <button
          type="button"
          onClick={handleTogglePlay}
          className={`p-1.5 rounded-lg flex items-center justify-center font-bold transition-all ${
            isPlaying
              ? 'bg-[#00DAF3]/20 text-[#00DAF3] hover:bg-[#00DAF3]/30 border border-[#00DAF3]/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
      </div>

      {/* Progress Timeline Scrubber */}
      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
        <span className="font-mono text-[10px] text-white/60 tabular-nums w-9 text-right flex-none">
          {fmt(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={e => handleSeek(parseFloat(e.target.value))}
          className="flex-1 h-1.5 rounded-lg bg-white/15 accent-[#00DAF3] cursor-pointer"
        />
        <span className="font-mono text-[10px] text-white/40 tabular-nums w-9 flex-none">
          {fmt(duration)}
        </span>
      </div>

      {/* Loop Toggle */}
      <button
        type="button"
        onClick={handleToggleLoop}
        className={`px-1.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all flex-none ${
          isLooping
            ? 'bg-[#00DAF3]/20 text-[#00DAF3] border border-[#00DAF3]/40'
            : 'text-white/40 hover:text-white/70'
        }`}
        title={isLooping ? 'Looping enabled' : 'Play once'}
      >
        <Repeat size={11} />
        <span className="text-[9px]">LOOP</span>
      </button>

      <div className="w-px h-4 bg-white/15 flex-none" />

      {/* Audio Volume & Mute */}
      <div className="flex items-center gap-1.5 flex-none">
        <button
          type="button"
          onClick={handleToggleMute}
          className={`p-1 rounded transition-all ${
            isMuted || volume === 0 ? 'text-red-400' : 'text-white/70 hover:text-white'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={isMuted ? 0 : volume}
          onChange={e => handleVolumeChange(parseFloat(e.target.value))}
          className="w-16 h-1.5 rounded-lg bg-white/15 accent-[#00DAF3] cursor-pointer"
          title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
        />
        <span className="font-mono text-[9px] text-white/50 w-7 tabular-nums">
          {Math.round((isMuted ? 0 : volume) * 100)}%
        </span>
      </div>
    </div>
  );
};
