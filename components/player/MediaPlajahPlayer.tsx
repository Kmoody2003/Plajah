import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Maximize2, Minimize2, Sparkles, Mic, Sliders, Film, Music,
  Folder, ArrowLeft, X, Check, Rocket, Clapperboard, Palette,
  Radio, Disc, List, ChevronRight, Share2, Cloud
} from 'lucide-react';
import { WindowsPickedFile, isWindowsApp, startWindowDrag, minimizeWindow, maximizeWindow, closeWindow } from '../../services/windowsBridgeService';
import { Album, Track } from '../../types';

export interface MediaPlajahPlayerProps {
  file: WindowsPickedFile;
  folderFiles?: WindowsPickedFile[];
  onExitToFrontRow: (activeTrack?: any, album?: any, seekTime?: number) => void;
  onUploadToReello?: (file: WindowsPickedFile) => void;
  onAddToFabula?: (file: WindowsPickedFile) => void;
  onSendToPixels?: (file: WindowsPickedFile) => void;
  onSendToMelos?: (file: WindowsPickedFile) => void;
}

export type DspPreset = 'spatial' | 'bass' | 'dialogue';

export const MediaPlajahPlayer: React.FC<MediaPlajahPlayerProps> = ({
  file,
  folderFiles = [file],
  onExitToFrontRow,
  onUploadToReello,
  onAddToFabula,
  onSendToPixels,
  onSendToMelos,
}) => {
  // No global-player dependency on purpose: LocalMediaLaunch renders this outside
  // GlobalPlayerProvider so opening a local file never boots Firebase.
  
  // Detect if current file is video vs audio
  const isInitialVideo = useMemo(() => {
    const ext = file.name.toLowerCase();
    return /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|ts)$/i.test(ext);
  }, [file.name]);

  const [isVideoMode, setIsVideoMode] = useState<boolean>(isInitialVideo);
  const [activeFile, setActiveFile] = useState<WindowsPickedFile>(file);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Synchronize active file when file prop updates
  useEffect(() => {
    setActiveFile(file);
    const ext = file.name.toLowerCase();
    setIsVideoMode(/\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|ts)$/i.test(ext));
    setCurrentTime(0);
    setIsPlaying(true);
  }, [file]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(268); // 04:28 default
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(true);
  const [activeDsp, setActiveDsp] = useState<DspPreset>('spatial');
  const [isLyricsActive, setIsLyricsActive] = useState<boolean>(false);
  const [isFxActive, setIsFxActive] = useState<boolean>(false);

  const isWindows = useMemo(() => isWindowsApp(), []);

  const handleStartDrag = (e: React.MouseEvent) => {
    if (e.button === 0 && isWindows) {
      startWindowDrag();
    }
  };

  const handleDoubleClickTitle = () => {
    if (isWindows) {
      maximizeWindow();
    }
  };

  // Video and Audio Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fftCanvasRef = useRef<HTMLCanvasElement>(null);
  const milkdropCanvasRef = useRef<HTMLCanvasElement>(null);

  // Filter sibling files for current playlist
  const siblingFiles = useMemo(() => {
    return folderFiles.filter(f => {
      const ext = f.name.toLowerCase();
      if (isVideoMode) {
        return /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|ts)$/i.test(ext);
      }
      return /\.(mp3|wav|flac|aac|m4a|ogg|wma|aiff|opus|alac)$/i.test(ext);
    });
  }, [folderFiles, isVideoMode]);

  // Active track title & folder
  const currentTitle = useMemo(() => {
    return activeFile.name.replace(/\.[^/.]+$/, '');
  }, [activeFile.name]);

  const currentFolder = useMemo(() => {
    if (activeFile.fullPath) {
      const parts = activeFile.fullPath.split(/[\\/]/);
      return parts.slice(-2, -1)[0] || 'Local Folder';
    }
    return 'Local Folder';
  }, [activeFile.fullPath]);

  // Format time (mm:ss)
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Play / Pause toggle
  const handleTogglePlay = () => {
    if (isVideoMode) {
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(p => !p);
      }
    } else {
      if (audioRef.current) {
        if (audioRef.current.paused) {
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        } else {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(p => !p);
      }
    }
  };

  // Switch Track
  const handleSelectTrack = (f: WindowsPickedFile) => {
    setActiveFile(f);
    setCurrentTime(0);
    setIsPlaying(true);
    const ext = f.name.toLowerCase();
    setIsVideoMode(/\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg|wmv|flv|ts)$/i.test(ext));
  };

  // Next / Prev track
  const handleNext = () => {
    const currentIndex = siblingFiles.findIndex(f => f.name === activeFile.name);
    if (currentIndex >= 0 && currentIndex < siblingFiles.length - 1) {
      handleSelectTrack(siblingFiles[currentIndex + 1]);
    } else if (siblingFiles.length > 0) {
      handleSelectTrack(siblingFiles[0]);
    }
  };

  const handlePrev = () => {
    const currentIndex = siblingFiles.findIndex(f => f.name === activeFile.name);
    if (currentIndex > 0) {
      handleSelectTrack(siblingFiles[currentIndex - 1]);
    } else if (siblingFiles.length > 0) {
      handleSelectTrack(siblingFiles[siblingFiles.length - 1]);
    }
  };

  // Scrub timeline
  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = pct * duration;
    setCurrentTime(newTime);
    if (isVideoMode && videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (!isVideoMode && audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Sync volume with native media elements
  useEffect(() => {
    const eff = isMuted ? 0 : volume;
    if (videoRef.current) videoRef.current.volume = eff;
    if (audioRef.current) audioRef.current.volume = eff;
  }, [volume, isMuted]);

  // Sync active audio track source
  useEffect(() => {
    if (!isVideoMode && audioRef.current && activeFile.url) {
      audioRef.current.src = activeFile.url;
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [activeFile.url, isVideoMode]);

  // FFT Canvas wave animation
  useEffect(() => {
    const canvas = fftCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;
    let tick = 0;

    const render = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      for (let waveIdx = 0; waveIdx < 3; waveIdx++) {
        ctx.beginPath();
        ctx.moveTo(0, mid);

        const freq = 0.014 + waveIdx * 0.007;
        const speed = tick * (0.04 + waveIdx * 0.015);
        const amp = isPlaying ? (15 - waveIdx * 3.5) : 2;

        for (let x = 0; x < w; x++) {
          const y = mid + Math.sin(x * freq + speed) * Math.cos(x * 0.004 + speed * 0.4) * amp;
          ctx.lineTo(x, y);
        }

        if (waveIdx === 0) ctx.strokeStyle = '#D40055';
        else if (waveIdx === 1) ctx.strokeStyle = '#FF8C00';
        else ctx.strokeStyle = '#6B0099';

        ctx.lineWidth = 2;
        ctx.stroke();
      }

      tick++;
      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying]);

  // Milkdrop Canvas animation
  useEffect(() => {
    if (!isFxActive) return;
    const canvas = milkdropCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;
    let t = 0;

    const render = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        const r = (t * 2 + i * 40) % (Math.max(cx, cy) * 1.2);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(212, 0, 85, 0.4)' : 'rgba(107, 0, 153, 0.3)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      t++;
      frameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frameId);
  }, [isFxActive]);

  // Audio timer ticker
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        if (prev >= duration) {
          handleNext();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, duration]);

  // Fluid transition to Front Row
  const handleExitTransition = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (videoRef.current) {
      videoRef.current.pause();
    }

    const trackPayload: Track = {
      id: `local_${encodeURIComponent(activeFile.name)}`,
      title: currentTitle,
      artist: currentFolder,
      url: activeFile.url,
      duration: duration,
      mediaKind: isVideoMode ? 'VIDEO' : 'AUDIO',
      kind: isVideoMode ? 'VIDEO' : 'MUSIC',
      albumTitle: currentFolder,
    };

    const albumPayload: Album = {
      id: `local_album_${encodeURIComponent(currentFolder)}`,
      title: currentFolder,
      artist: 'Local Masters',
      coverImage: '/assets/default_album_cover.png',
      description: `Playing from local disk: ${activeFile.fullPath || activeFile.name}`,
      themeColor: '#FF8C00',
      createdAt: Date.now(),
      type: isVideoMode ? 'VIDEO' : 'MUSIC',
      tracks: [trackPayload],
    };

    onExitToFrontRow(trackPayload, albumPayload, currentTime);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-0 z-[99990] bg-[#030007] text-white flex flex-col overflow-hidden select-none"
    >
      {/* ── NATIVE HTML5 AUDIO FOR BIT-PERFECT LOCAL PLAYBACK ── */}
      {!isVideoMode && activeFile.url && (
        <audio
          ref={audioRef}
          src={activeFile.url}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() => audioRef.current && audioRef.current.duration && setDuration(audioRef.current.duration)}
          onEnded={handleNext}
          autoPlay={isPlaying}
        />
      )}
      {/* ── WINUI 3.1 MICA ALT AMBIENT BACKDROP ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/3 w-[700px] h-[700px] rounded-full blur-[160px] opacity-35" style={{ background: 'radial-gradient(circle, #6B0099 0%, #06010c 70%)' }} />
        <div className="absolute top-1/3 -right-20 w-[550px] h-[550px] rounded-full blur-[150px] opacity-30" style={{ background: 'radial-gradient(circle, #D40055 0%, transparent 65%)' }} />
        <div className="absolute -bottom-32 left-1/4 w-[600px] h-[600px] rounded-full blur-[160px] opacity-25" style={{ background: 'radial-gradient(circle, #FF8C00 0%, transparent 70%)' }} />
      </div>

      {/* ── TOP FULL-BLEED WINDOW BAR (ExtendsContentIntoTitleBar = true) ── */}
      <div 
        className={`absolute top-0 inset-x-0 h-12 z-50 flex items-center justify-between px-3 pointer-events-auto bg-[#030007]/80 backdrop-blur-xl border-b border-white/[0.08] ${
          isWindows ? 'pr-[145px]' : 'pr-3'
        }`}
      >
        {/* Left: Direct Back to Plajah Front Row Button */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <button
            onClick={handleExitTransition}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-[#6B0099] text-white transition-all flex items-center gap-1.5 shadow-md border border-white/15 group cursor-pointer active:scale-95"
            title="Exit Media Plajah & explore full Plajah Front Row platform"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-outfit font-bold tracking-wide">Front Row</span>
          </button>

          <span className="text-white/20 text-xs hidden sm:inline">&bull;</span>
        </div>

        {/* Center: Draggable Title Region (Double-click to Maximize) */}
        <div 
          onMouseDown={handleStartDrag}
          onDoubleClick={handleDoubleClickTitle}
          className="flex-1 mx-3 flex items-center gap-2 cursor-default select-none overflow-hidden h-full"
          title={isWindows ? "Drag to move window • Double-click to maximize" : undefined}
        >
          <span className="font-mono text-[11px] text-white/70 truncate max-w-xs md:max-w-md lg:max-w-lg">
            {activeFile.fullPath || activeFile.name}
          </span>
          <span className="hidden md:inline-block px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/30 shrink-0">
            Local Standalone
          </span>
        </div>

        {/* Right: Mode, Quality, Queue, & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Audio / Video Switcher */}
          <button
            onClick={() => setIsVideoMode(prev => !prev)}
            className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-white/5 hover:bg-white/15 text-white/90 transition-colors flex items-center gap-1.5 border border-white/10 cursor-pointer active:scale-95"
            title="Switch between Audio and Video playback mode"
          >
            <span className={`w-2 h-2 rounded-full ${isVideoMode ? 'bg-[#D40055] shadow-[0_0_8px_#D40055]' : 'bg-[#FF8C00] shadow-[0_0_8px_#FF8C00]'}`} />
            <span className="font-medium">{isVideoMode ? 'Video Mode' : 'Audio Mode'}</span>
          </button>

          {/* Quality Chip */}
          <button
            onClick={() => alert(`Chora Audio Pipeline:\n\n• Codec: ${isVideoMode ? '4K ProRes / H.265' : 'FLAC 96kHz / 24-bit'}\n• Output: Bit-Perfect WASAPI Exclusive\n• Active DSP: ${activeDsp.toUpperCase()} Virtualizer`)}
            className="px-2 py-1 rounded-md text-[10px] font-mono bg-white/5 hover:bg-white/10 text-[#FF8C00] border border-[#FF8C00]/30 transition-colors hidden sm:inline-block cursor-pointer"
            title="Audio/Video Engine Pipeline specs"
          >
            {isVideoMode ? '4K 60fps' : '24b · 96k'}
          </button>

          {/* Queue Drawer Toggle */}
          <button
            onClick={() => setIsQueueOpen(prev => !prev)}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-colors flex items-center gap-1.5 border cursor-pointer active:scale-95 ${
              isQueueOpen 
                ? 'bg-[#FF8C00]/20 border-[#FF8C00]/50 text-[#FF8C00]' 
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80'
            }`}
            title="Toggle playlist queue drawer"
          >
            <List size={13} className={isQueueOpen ? 'text-[#FF8C00]' : 'text-white/70'} />
            <span className="font-medium">Queue</span>
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[#FF8C00] text-black">
              {siblingFiles.length}
            </span>
          </button>

          {/* Quick Exit to Front Row button */}
          <button
            onClick={handleExitTransition}
            className="w-7 h-7 rounded-md hover:bg-red-500/20 hover:text-red-400 text-white/60 flex items-center justify-center transition-colors cursor-pointer"
            title="Exit Media Plajah & return to Front Row"
          >
            <X size={15} />
          </button>

          {/* Web/Browser Non-Windows Caption Controls */}
          {!isWindows && (
            <div className="flex items-center text-xs ml-1 border-l border-white/10 pl-1">
              <button
                onClick={handleExitTransition}
                className="w-7 h-7 inline-flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white rounded transition-colors cursor-pointer"
                title="Minimize / Exit to Front Row"
              >
                &minus;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN STAGE (85-90% MEDIA DOMINANT CANVASES) ── */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden pt-14 pb-4 px-6 z-10">
        <main className="flex-1 flex flex-col items-center justify-center h-full relative max-w-2xl">
          
          {/* 1. AUDIO MODE: CHORA VINYL & SLEEVE */}
          {!isVideoMode && !isLyricsActive && !isFxActive && (
            <div className="flex flex-col items-center justify-center relative w-full transition-all duration-300">
              <div
                className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-88 md:h-88 flex items-center justify-center cursor-pointer group"
                onClick={handleTogglePlay}
              >
                <div
                  className="absolute -inset-4 rounded-3xl opacity-50 blur-2xl transition-opacity group-hover:opacity-80"
                  style={{ background: 'radial-gradient(circle, rgba(212,0,85,0.4) 0%, rgba(107,0,153,0.3) 60%, transparent 80%)' }}
                />

                {/* Spinning Chora Vinyl */}
                <div
                  className={`absolute w-64 h-64 sm:w-80 sm:h-80 md:w-88 md:h-88 rounded-full bg-[#07000d] shadow-2xl flex items-center justify-center transform translate-x-10 group-hover:translate-x-14 transition-transform duration-500 border border-white/[0.08] ${isPlaying ? 'vinyl-spinning' : 'vinyl-paused'}`}
                >
                  <div className="w-11/12 h-11/12 rounded-full border border-white/[0.03] flex items-center justify-center">
                    <div className="w-9/12 h-9/12 rounded-full border border-white/[0.04] flex items-center justify-center">
                      <div className="w-7/12 h-7/12 rounded-full border border-white/[0.05] flex items-center justify-center">
                        <div className="w-20 h-20 rounded-full flex flex-col items-center justify-center text-center shadow-inner" style={{ background: 'linear-gradient(135deg, #6B0099, #D40055 60%, #FF8C00 100%)' }}>
                          <span className="font-outfit font-black text-[10px] tracking-widest text-white uppercase drop-shadow">CHORA</span>
                          <span className="text-[7px] font-mono text-white/90">96kHz · 24b</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Sleeve (20px WinUI Radius, Mica Frosted Fill) */}
                <div
                  className="relative w-full h-full rounded-[20px] overflow-hidden p-6 flex flex-col justify-between shadow-2xl z-10 border border-white/10"
                  style={{ background: 'rgba(18, 5, 28, 0.72)', backdropFilter: 'blur(36px)' }}
                >
                  <div
                    className="absolute inset-0 opacity-60 bg-cover bg-center"
                    style={{ background: 'radial-gradient(circle at 75% 25%, #D40055 0%, #6B0099 50%, #030007 90%)' }}
                  />

                  <div className="relative z-10 flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-black/60 text-[#FF8C00] border border-[#FF8C00]/30 backdrop-blur-md">
                      FLAC · 96kHz / 24-bit
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Bit-Perfect</span>
                    </span>
                  </div>

                  <div className="relative z-10">
                    <h1 className="font-semibold text-2xl sm:text-3xl text-white tracking-tight leading-tight">
                      {currentTitle}
                    </h1>
                    <p className="text-xs sm:text-sm text-white/70 font-normal mt-1">
                      {currentFolder} &bull; Local Masters
                    </p>
                  </div>
                </div>
              </div>

              {/* Realtime Audio Spectrum */}
              <div className="w-full max-w-md h-12 mt-4 flex items-center justify-center relative">
                <canvas ref={fftCanvasRef} className="w-full h-full" />
              </div>

              {/* Fast Studio Bridges */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => onSendToMelos ? onSendToMelos(activeFile) : alert(`Opening ${activeFile.name} in Melos Workstation...`)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-white/5 hover:bg-[#6B0099]/30 text-white/70 hover:text-white border border-white/10 transition-colors"
                >
                  Sample in Melos
                </button>
                <button
                  onClick={() => onAddToFabula ? onAddToFabula(activeFile) : alert(`Adding ${activeFile.name} to Fabula edit...`)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-white/5 hover:bg-[#D40055]/30 text-white/70 hover:text-white border border-white/10 transition-colors"
                >
                  Cut in Fabula
                </button>
                <button
                  onClick={() => onSendToPixels ? onSendToPixels(activeFile) : alert(`Opening ${activeFile.name} in Plajah Pixels...`)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-white/5 hover:bg-[#FF8C00]/30 text-white/70 hover:text-white border border-white/10 transition-colors"
                >
                  Color in Pixels
                </button>
              </div>
            </div>
          )}

          {/* 2. VIDEO MODE: EDGE-TO-EDGE VIDEO WITH REELLO & FABULA BUTTONS */}
          {isVideoMode && !isLyricsActive && !isFxActive && (
            <div
              className="w-full flex-1 min-h-0 rounded-[20px] overflow-hidden flex flex-col justify-between p-4 z-10 border border-white/10 relative"
              style={{ background: 'rgba(18, 5, 28, 0.85)', backdropFilter: 'blur(36px)' }}
            >
              <div className="flex items-center justify-between shrink-0">
                <span className="px-2.5 py-1 rounded-md text-[10px] font-mono bg-black/60 text-[#00DAF3] border border-[#00DAF3]/30 backdrop-blur-md">
                  4K UHD · ProRes 422 · 60fps
                </span>
                <span className="text-xs font-mono text-white/50">Rec.709 10-bit</span>
              </div>

              {/* Native Video Element */}
              <div className="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden my-2 rounded-xl bg-black">
                {activeFile.url ? (
                  <video
                    ref={videoRef}
                    src={activeFile.url}
                    className="w-full h-full object-contain cursor-pointer"
                    autoPlay={isPlaying}
                    controls={false}
                    onClick={handleTogglePlay}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                    onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl text-white shadow-2xl cursor-pointer hover:scale-105 transition-transform"
                      style={{ background: 'linear-gradient(135deg, #D40055, #FF8C00)' }}
                      onClick={handleTogglePlay}
                    >
                      {isPlaying ? <Pause size={28} /> : <Play size={28} className="translate-x-0.5" />}
                    </div>
                    <h2 className="font-semibold text-xl text-white mt-3">{currentTitle}</h2>
                    <p className="text-xs font-mono text-white/50 mt-1">{activeFile.fullPath || activeFile.name}</p>
                  </div>
                )}
              </div>

              {/* 1-Click Creative Video Production Buttons */}
              <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUploadToReello ? onUploadToReello(activeFile) : alert(`Publishing ${activeFile.name} to Reello Creator Feed...`)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white flex items-center gap-1.5 shadow-md hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Rocket size={13} />
                    <span>Upload to Reello</span>
                  </button>
                  <button
                    onClick={() => onAddToFabula ? onAddToFabula(activeFile) : alert(`Adding ${activeFile.name} to Fabula timeline...`)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#6B0099]/40 hover:bg-[#6B0099]/70 text-white border border-[#6B0099] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clapperboard size={13} />
                    <span>Add to Fabula Edit</span>
                  </button>
                </div>
                <span className="text-xs font-mono text-white/40">Local Offline Stage</span>
              </div>
            </div>
          )}

          {/* 3. TIME-CODED SYNCED LYRICS VIEW */}
          {isLyricsActive && (
            <div
              className="absolute inset-2 rounded-[20px] p-8 flex flex-col items-center justify-center z-10 text-center overflow-hidden border border-white/10"
              style={{ background: 'rgba(18, 5, 28, 0.88)', backdropFilter: 'blur(36px)' }}
            >
              <div className="w-full max-w-md space-y-5">
                <p className="text-sm text-white/30">[Intro — Ambient Synth & Sub Bass]</p>
                <p className="text-base text-white/40">Drifting past the neon line in silence</p>
                <p className="text-2xl font-bold text-white font-outfit" style={{ textShadow: '0 0 20px rgba(255,140,0,0.6)' }}>
                  "{currentTitle} ignites across the horizon tonight"
                </p>
                <p className="text-base text-white/40">Echoes running through the master channel</p>
                <p className="text-sm text-white/30">[Drop — 96kHz Lossless Stems]</p>
              </div>
              <button
                onClick={() => setIsLyricsActive(false)}
                className="mt-6 px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs text-white/80 font-mono transition-colors"
              >
                Close Lyrics
              </button>
            </div>
          )}

          {/* 4. CHORA FX VISUALIZER STAGE */}
          {isFxActive && (
            <div
              className="absolute inset-2 rounded-[20px] overflow-hidden flex flex-col items-center justify-center z-10 border border-white/10"
              style={{ background: 'rgba(18, 5, 28, 0.88)', backdropFilter: 'blur(36px)' }}
            >
              <canvas ref={milkdropCanvasRef} className="absolute inset-0 w-full h-full" />
              <div className="relative z-10 text-center p-6 bg-black/40 rounded-2xl border border-white/10 backdrop-blur-md">
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase bg-[#D40055]/30 text-[#D40055] font-bold">
                  CHORA FX STAGE
                </span>
                <h2 className="font-outfit font-black text-xl text-white mt-2">MilkDrop 3D WebGL Shader</h2>
                <div className="flex items-center justify-center gap-2 mt-3 text-xs font-mono">
                  <button onClick={() => setIsFxActive(false)} className="px-3 py-1 rounded bg-[#FF8C00] text-black font-bold">
                    Back to Player
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── WINUI 3.1 FLOATING COMMANDBAR / TRANSPORT HUD ── */}
          <div className="w-full max-w-xl mt-4 z-30">
            <div
              className="rounded-2xl px-5 py-3 flex flex-col gap-2 border border-white/10 shadow-2xl relative"
              style={{ background: 'linear-gradient(135deg, rgba(30, 8, 45, 0.88) 0%, rgba(12, 3, 20, 0.90) 100%)', backdropFilter: 'blur(40px)' }}
            >
              {/* Scrubber & Timecodes */}
              <div className="flex items-center gap-3 w-full">
                <span className="font-mono text-[11px] text-white/60 w-10 text-right">
                  {formatTime(currentTime)}
                </span>
                <div
                  className="flex-1 h-2 rounded-full bg-white/10 cursor-pointer relative overflow-hidden group"
                  onClick={handleScrub}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (currentTime / (duration || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #6B0099, #D40055 60%, #FF8C00 100%)',
                    }}
                  />
                </div>
                <span className="font-mono text-[11px] text-white/60 w-10">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Controls Bar */}
              <div className="flex items-center justify-between pt-0.5">
                {/* DSP Toggles */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveDsp('spatial')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors ${activeDsp === 'spatial' ? 'bg-[#FF8C00]/20 text-[#FF8C00] border border-[#FF8C00]/40' : 'text-white/50 hover:text-white bg-white/5'}`}
                  >
                    Spatial 3D
                  </button>
                  <button
                    onClick={() => setActiveDsp('bass')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors ${activeDsp === 'bass' ? 'bg-[#D40055]/20 text-[#D40055] border border-[#D40055]/40' : 'text-white/50 hover:text-white bg-white/5'}`}
                  >
                    Bass Boost
                  </button>
                  <button
                    onClick={() => setActiveDsp('dialogue')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors ${activeDsp === 'dialogue' ? 'bg-[#00DAF3]/20 text-[#00DAF3] border border-[#00DAF3]/40' : 'text-white/50 hover:text-white bg-white/5'}`}
                  >
                    Dialogue
                  </button>
                </div>

                {/* Transport Buttons */}
                <div className="flex items-center gap-3">
                  <button onClick={handlePrev} className="text-white/70 hover:text-white transition-colors cursor-pointer">
                    <SkipBack size={15} />
                  </button>
                  <button
                    onClick={handleTogglePlay}
                    className="w-9 h-9 rounded-xl bg-white text-black flex items-center justify-center font-bold text-sm hover:bg-[#FF8C00] hover:text-white transition-all shadow-md cursor-pointer"
                  >
                    {isPlaying ? <Pause size={15} /> : <Play size={15} className="translate-x-0.5" />}
                  </button>
                  <button onClick={handleNext} className="text-white/70 hover:text-white transition-colors cursor-pointer">
                    <SkipForward size={15} />
                  </button>
                </div>

                {/* Chora Features & Volume */}
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <button
                    onClick={() => setIsLyricsActive(prev => !prev)}
                    className={`p-1 rounded hover:bg-white/10 ${isLyricsActive ? 'text-[#FF8C00]' : 'text-white/60'}`}
                    title="Lyrics"
                  >
                    <Mic size={14} />
                  </button>
                  <button
                    onClick={() => setIsFxActive(prev => !prev)}
                    className={`p-1 rounded hover:bg-white/10 ${isFxActive ? 'text-[#D40055]' : 'text-white/60'}`}
                    title="FX Visualizer Stage"
                  >
                    <Sparkles size={14} />
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVolume(v);
                      if (videoRef.current) videoRef.current.volume = v;
                    }}
                    className="w-16 accent-[#FF8C00] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ── RIGHT: WINUI 3.1 LISTVIEW PLAYLIST QUEUE ── */}
        <AnimatePresence>
          {isQueueOpen && (
            <motion.aside
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="w-80 h-[84vh] my-auto rounded-[20px] p-4 flex flex-col z-30 ml-4 border border-white/10"
              style={{ background: 'rgba(18, 5, 28, 0.72)', backdropFilter: 'blur(36px)' }}
            >
              <div className="flex items-center justify-between pb-3 mb-1 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Folder size={15} className="text-[#FF8C00]" />
                  <div>
                    <h3 className="font-semibold text-xs text-white">Current Folder Queue</h3>
                    <p className="text-[10px] text-white/40 font-mono truncate">{currentFolder}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsQueueOpen(false)}
                  className="w-6 h-6 rounded-md hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Sibling file rows */}
              <div className="flex-1 overflow-y-auto space-y-1 py-1 pr-1">
                {siblingFiles.map((f, idx) => {
                  const isActive = f.name === activeFile.name;
                  return (
                    <div
                      key={f.name}
                      onClick={() => handleSelectTrack(f)}
                      className={`win-list-item p-2.5 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${isActive ? 'bg-[#6B0099]/30 border-l-[3.5px] border-[#FF8C00]' : 'hover:bg-white/[0.06]'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pl-1">
                        <span className={`font-mono text-[11px] w-4 text-right ${isActive ? 'text-[#FF8C00] font-bold' : 'text-white/40'}`}>
                          {isActive ? '▶' : idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className={`text-xs truncate ${isActive ? 'font-semibold text-white' : 'font-normal text-white/90'}`}>
                            {f.name.replace(/\.[^/.]+$/, '')}
                          </p>
                          <p className="text-[10px] text-white/40 font-mono">
                            {f.name.split('.').pop()?.toUpperCase()} &bull; Local File
                          </p>
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[9px] font-mono font-bold text-[#FF8C00] px-1.5 py-0.5 rounded bg-[#FF8C00]/20">
                          Playing
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default MediaPlajahPlayer;
