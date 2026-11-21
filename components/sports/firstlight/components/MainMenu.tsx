import React from 'react';
import {
  Play,
  Sparkles,
  Sliders,
  Shield,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Compass,
  Zap,
  ChevronRight,
  Flame,
  Trophy,
  Box,
} from 'lucide-react';
import { WeatherPreset, CameraViewMode, PlayStyleMode } from '../types';

interface MainMenuProps {
  onPlayDrive: (style?: PlayStyleMode, playerMode?: 'ATHLETE' | 'BLOCK') => void;
  onOpenStadiumCreator: () => void;
  onOpenOptions: () => void;
  onOpenControls: () => void;
  currentWeather?: WeatherPreset;
  onSelectWeather?: (weather: WeatherPreset) => void;
  currentCamera?: CameraViewMode;
  onSelectCamera?: (cam: CameraViewMode) => void;
  isMuted?: boolean;
  onToggleSound?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onPlayDrive,
  onOpenStadiumCreator,
  onOpenControls,
  currentWeather = 'AURORA',
  onSelectWeather,
  currentCamera = 'BEHIND_QB',
  onSelectCamera,
  isMuted = false,
  onToggleSound,
}) => {
  const gid = 'main-menu-chevron-grad';

  return (
    <div
      id="main-menu"
      className="absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-7 md:p-9 pointer-events-auto select-none overflow-hidden"
    >
      {/* Atmospheric Stadium Gradient Scrim */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-gradient-to-r from-[#070712]/90 via-[#0b0a18]/55 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/45" />
      </div>

      {/* Top Bar: League Network Tag + Weather/Camera/Audio Controls */}
      <div className="relative z-10 flex items-center justify-between w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 text-white/85 text-[11px] sm:text-xs font-semibold tracking-wider font-['Chakra_Petch'] shadow-lg">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF8C00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF8C00]"></span>
          </span>
          <span className="uppercase">SOL GRIDIRON LEAGUE · 3D SPORTS ENGINE</span>
          <span className="text-white/30 hidden sm:inline">|</span>
          <span className="text-[#00DAF3] font-mono text-[10px] hidden sm:inline">LEGENDS OF ELOHIM</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {onSelectWeather && (
            <div className="hidden md:flex items-center p-1 rounded-full bg-[#120F1E]/80 backdrop-blur-xl border border-white/15 shadow-xl text-xs font-bold">
              {(
                [
                  { id: 'AURORA', label: 'Aurora', icon: <Sparkles size={12} /> },
                  { id: 'DAY', label: 'Day', icon: <Sun size={12} /> },
                  { id: 'SUNSET', label: 'Sunset', icon: <Sun size={12} className="text-orange-400" /> },
                  { id: 'NIGHT', label: 'Night', icon: <Moon size={12} /> },
                ] as const
              ).map((w) => (
                <button
                  key={w.id}
                  onClick={() => onSelectWeather(w.id)}
                  className={`px-3 py-1 rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                    currentWeather === w.id
                      ? 'bg-gradient-to-r from-[#00DAF3]/30 to-[#6B0099]/40 text-[#00DAF3] border border-[#00DAF3]/50'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {w.icon}
                  <span>{w.label}</span>
                </button>
              ))}
            </div>
          )}

          {onSelectCamera && (
            <button
              onClick={() =>
                onSelectCamera(
                  currentCamera === 'BEHIND_QB' ? 'BROADCAST' : currentCamera === 'BROADCAST' ? 'ALL_22' : 'BEHIND_QB'
                )
              }
              className="hidden lg:flex px-3 py-1.5 rounded-full bg-[#120F1E]/80 hover:bg-white/10 text-white/90 border border-white/15 items-center gap-1.5 text-xs font-bold cursor-pointer transition"
            >
              <Compass size={12} className="text-[#FF8C00]" />
              <span className="font-['Rajdhani'] uppercase tracking-wider">
                {currentCamera === 'BEHIND_QB' ? 'Action Cam' : currentCamera === 'BROADCAST' ? 'TV Broadcast' : 'All-22'}
              </span>
            </button>
          )}

          {onToggleSound && (
            <button
              onClick={onToggleSound}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-full backdrop-blur-xl border transition-all flex items-center gap-2 text-xs font-bold shadow-xl cursor-pointer ${
                isMuted
                  ? 'bg-red-500/20 text-red-300 border-red-400/30'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              }`}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-[#00DAF3]" />}
              <span className="hidden sm:inline font-['Rajdhani'] uppercase tracking-wider">
                {isMuted ? 'Muted' : 'Audio On'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Navigation Card */}
      <div className="relative z-10 w-full max-w-md sm:max-w-lg my-auto self-start sm:ml-4 md:ml-8">
        <div className="relative rounded-[28px] bg-[#100D1C]/88 backdrop-blur-2xl border border-white/15 p-5 sm:p-7 shadow-[0_25px_70px_rgba(0,0,0,0.9)] flex flex-col gap-4">
          <div className="absolute -top-10 -left-10 w-48 h-48 bg-gradient-to-br from-[#6B0099]/40 via-[#D40055]/30 to-transparent rounded-full blur-2xl pointer-events-none" />

          {/* Brand Lockup */}
          <div className="relative flex items-center gap-4">
            <div className="relative flex-shrink-0 group cursor-pointer" onClick={() => onPlayDrive('SIMULATION', 'ATHLETE')}>
              <div className="absolute -inset-2 bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-2xl blur-lg opacity-70 group-hover:opacity-100 transition duration-300" />
              <svg width="46" height="46" viewBox="0 0 100 100" fill="none" className="relative">
                <defs>
                  <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6B0099" />
                    <stop offset="50%" stopColor="#D40055" />
                    <stop offset="100%" stopColor="#FF8C00" />
                  </linearGradient>
                </defs>
                <path
                  d="M30 20 L70 50 L30 80"
                  stroke={`url(#${gid})`}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-[0.26em] text-white/70 font-['Chakra_Petch']">
                  PLAJAH SPORTS
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] text-white">
                  PRO ENGINE 2.0
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white font-['Teko'] leading-none mt-0.5">
                PROJECT FIRSTLIGHT
              </h1>
              <p className="text-xs text-white/65 font-medium tracking-wide mt-0.5">
                SOL Timeline Pro Simulation · Fever Jam Arcade · Scalable Skill
              </p>
            </div>
          </div>

          <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* 3 Primary Game Modes */}
          <div className="flex flex-col gap-2.5">
            {/* 1. SIMULATION MODE (SOL TIMELINE) */}
            <button
              id="menu-play-drive-btn"
              onClick={() => onPlayDrive('SIMULATION', 'ATHLETE')}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#FF8C00] via-[#F97316] to-[#D40055] hover:brightness-110 text-slate-950 font-black text-left shadow-[0_0_30px_rgba(255,140,0,0.45)] hover:scale-[1.01] active:scale-[0.99] transition-all border border-amber-300/50 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
                  <Trophy size={20} className="text-slate-950" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-black uppercase tracking-wider font-['Rajdhani'] leading-tight">
                    SOL LEAGUE SIMULATION
                  </div>
                  <div className="text-[11px] font-bold text-slate-900/80">
                    Madden-depth 11v11 · Pro Teams · SOL Timeline Broadcast
                  </div>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-950/75 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* 2. ARCADE MODE (NFL FEVER x NBA JAM) */}
            <button
              id="menu-arcade-btn"
              onClick={() => onPlayDrive('ARCADE', 'ATHLETE')}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#6B0099]/90 via-[#9333ea]/85 to-[#0284c7]/90 hover:brightness-115 text-white font-black text-left shadow-[0_0_24px_rgba(0,218,243,0.3)] hover:scale-[1.01] active:scale-[0.99] transition-all border border-cyan-300/40 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Flame size={20} className="text-[#FF8C00]" />
                </div>
                <div>
                  <div className="text-base sm:text-lg font-black uppercase tracking-wider font-['Rajdhani'] leading-tight flex items-center gap-2">
                    <span>FEVER JAM ARCADE</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#FF8C00] text-slate-950">ON FIRE!</span>
                  </div>
                  <div className="text-[11px] font-medium text-cyan-100/85">
                    NFL Fever × NBA Jam · Turbo, Hot Streaks &amp; Bone-Rattling Hits
                  </div>
                </div>
              </div>
              <ChevronRight size={20} className="text-white/75 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* 3. SPECIAL MODE: BLOCKY CLASSIC (ROBLOX-STYLE) */}
            <button
              id="menu-blocky-mode-btn"
              onClick={() => onPlayDrive('ARCADE', 'BLOCK')}
              className="w-full py-3 px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-amber-400/30 hover:border-amber-400/60 text-white font-bold text-left flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <Box size={18} className="text-amber-300" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider font-['Rajdhani'] flex items-center gap-2">
                    <span>BLOCKY CLASSIC SPECIAL MODE</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      RETRO BLOCK
                    </span>
                  </div>
                  <div className="text-[11px] text-white/60 font-normal">
                    Play with classic blocky avatars &amp; arcade turf physics
                  </div>
                </div>
              </div>
              <Play size={14} className="text-amber-300" />
            </button>

            {/* Secondary Row */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                onClick={onOpenStadiumCreator}
                className="py-2.5 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.13] border border-white/10 text-white/90 font-bold text-xs tracking-wider font-['Rajdhani'] uppercase flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Zap size={14} className="text-[#00DAF3]" />
                <span>Stadium &amp; Cams</span>
              </button>
              <button
                onClick={onOpenControls}
                className="py-2.5 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.13] border border-white/10 text-white/90 font-bold text-xs tracking-wider font-['Rajdhani'] uppercase flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Sliders size={14} className="text-[#D40055]" />
                <span>Controls &amp; Guide</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50 font-medium">
            <span className="flex items-center gap-1.5">
              <Shield size={12} className="text-[#06D6A0]" />
              <span>SOL Timeline · 8 Original Franchises · Skill-Scaled</span>
            </span>
            <span className="text-[10px] text-white/40 font-mono">v2.0</span>
          </div>
        </div>
      </div>

      {/* Bottom Control Hints */}
      <div className="relative z-10 w-full flex flex-col items-center gap-1.5 pb-1">
        <div className="hidden sm:flex items-center gap-4 px-5 py-2 rounded-full bg-black/65 backdrop-blur-xl border border-white/10 text-white/75 text-xs font-semibold tracking-wider font-['Rajdhani'] shadow-2xl">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/15 text-white font-mono text-[10px]">SPACE</kbd> SNAP / JUKE
          </span>
          <span className="text-white/25">·</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/15 text-white font-mono text-[10px]">1–4</kbd> PASS TARGETS
          </span>
          <span className="text-white/25">·</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/15 text-white font-mono text-[10px]">X / F / E</kbd> SPIN · TRUCK · DIVE
          </span>
          <span className="text-white/25">·</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/15 text-white font-mono text-[10px]">TAB</kbd> SWITCH DEFENDER
          </span>
        </div>
      </div>
    </div>
  );
};
