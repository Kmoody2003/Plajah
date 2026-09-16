import React from 'react';
import { 
  Play, 
  Sparkles, 
  Sliders, 
  Shield, 
  Volume2, 
  VolumeX, 
  BookOpen, 
  Sun, 
  Moon, 
  Compass,
  Zap,
  ChevronRight
} from 'lucide-react';
import { WeatherPreset, CameraViewMode } from '../types';

interface MainMenuProps {
  onPlayDrive: () => void;
  onOpenStadiumCreator: () => void;
  onOpenOptions: () => void;
  onOpenControls: () => void;
  currentWeather?: WeatherPreset;
  onSelectWeather?: (weather: WeatherPreset) => void;
  currentCamera?: CameraViewMode;
  onSelectCamera?: (cam: CameraViewMode) => void;
  isMuted?: boolean;
  onToggleSound?: () => void;
  onOpenCurriculum?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onPlayDrive,
  onOpenStadiumCreator,
  onOpenOptions,
  onOpenControls,
  currentWeather = 'AURORA',
  onSelectWeather,
  currentCamera = 'BEHIND_QB',
  onSelectCamera,
  isMuted = false,
  onToggleSound,
  onOpenCurriculum,
}) => {
  const gid = 'main-menu-chevron-grad';

  return (
    <div 
      id="main-menu" 
      className="absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-8 md:p-10 pointer-events-auto select-none overflow-hidden"
    >
      {/* Dynamic Animated Aurora Borealis CSS Wave Overlay (complements 3D WebGL shader) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Deep atmospheric stadium vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
        
        {/* Dancing Aurora Light Curtains */}
        <div 
          className="absolute -top-32 left-1/4 w-[600px] h-[350px] rounded-full blur-[90px] opacity-40 animate-pulse pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0, 218, 243, 0.45) 0%, rgba(107, 0, 153, 0.35) 50%, transparent 75%)',
            animationDuration: '6s',
          }}
        />
        <div 
          className="absolute -top-24 right-1/4 w-[700px] h-[380px] rounded-full blur-[100px] opacity-35 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(212, 0, 85, 0.35) 0%, rgba(255, 140, 0, 0.25) 45%, transparent 75%)',
            animation: 'aurora-shift 9s ease-in-out infinite alternate',
          }}
        />
        <div 
          className="absolute top-10 left-1/3 w-[800px] h-[220px] rounded-full blur-[80px] opacity-30 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(6, 214, 160, 0.4) 0%, rgba(147, 51, 234, 0.3) 60%, transparent 80%)',
            animation: 'aurora-drift 12s ease-in-out infinite alternate',
          }}
        />
      </div>

      {/* Inline styles for realistic smooth aurora drift animation */}
      <style>{`
        @keyframes aurora-shift {
          0% { transform: translate(-30px, 0px) scale(1); }
          50% { transform: translate(40px, -20px) scale(1.1); }
          100% { transform: translate(-20px, 15px) scale(0.95); }
        }
        @keyframes aurora-drift {
          0% { transform: translateX(0) scaleY(1); opacity: 0.25; }
          50% { transform: translateX(60px) scaleY(1.2); opacity: 0.45; }
          100% { transform: translateX(-40px) scaleY(0.9); opacity: 0.3; }
        }
      `}</style>

      {/* Top Bar: Engine Status & Top-Right Ambient HUD Controls */}
      <div className="relative z-10 flex items-center justify-between w-full max-w-7xl mx-auto">
        {/* Left: Platform Status */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 text-white/80 text-[11px] sm:text-xs font-semibold tracking-wider font-['Chakra_Petch'] shadow-lg">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00DAF3]"></span>
          </span>
          <span className="uppercase">3D WebGL Passing Lab</span>
          <span className="text-white/30">|</span>
          <span className="text-amber-400 font-mono text-[10px]">60 FPS</span>
        </div>

        {/* Right: Ambient HUD Controls (Weather, Audio, Camera) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Weather Selector Quick Pills */}
          {onSelectWeather && (
            <div className="hidden md:flex items-center p-1 rounded-full bg-[#120F1E]/80 backdrop-blur-xl border border-white/15 shadow-xl text-xs font-bold">
              <button
                onClick={() => onSelectWeather('AURORA')}
                className={`px-3 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                  currentWeather === 'AURORA'
                    ? 'bg-gradient-to-r from-[#00DAF3]/30 to-[#6B0099]/40 text-[#00DAF3] border border-[#00DAF3]/50 shadow-[0_0_12px_rgba(0,218,243,0.3)]'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Northern Lights Night"
              >
                <Sparkles size={12} className={currentWeather === 'AURORA' ? 'text-[#00DAF3] animate-spin' : ''} />
                <span>Aurora</span>
              </button>
              <button
                onClick={() => onSelectWeather('SUNSET')}
                className={`px-3 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                  currentWeather === 'SUNSET'
                    ? 'bg-gradient-to-r from-[#FF8C00]/30 to-[#D40055]/40 text-amber-300 border border-amber-400/50 shadow-[0_0_12px_rgba(255,140,0,0.3)]'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Sunset Twilight"
              >
                <Sun size={12} />
                <span>Sunset</span>
              </button>
              <button
                onClick={() => onSelectWeather('NIGHT')}
                className={`px-3 py-1 rounded-full transition-all flex items-center gap-1.5 ${
                  currentWeather === 'NIGHT'
                    ? 'bg-white/20 text-white border border-white/40'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Night Lights"
              >
                <Moon size={12} />
                <span>Night</span>
              </button>
              <button
                onClick={() => onSelectWeather('SNOW')}
                className={`px-2.5 py-1 rounded-full transition-all flex items-center gap-1 ${
                  currentWeather === 'SNOW'
                    ? 'bg-white/20 text-white border border-white/40'
                    : 'text-white/60 hover:text-white'
                }`}
                title="Winter Snow"
              >
                <span>❄</span>
              </button>
            </div>
          )}

          {/* Camera View Mode Quick Switch */}
          {onSelectCamera && (
            <div className="hidden lg:flex items-center p-1 rounded-full bg-[#120F1E]/80 backdrop-blur-xl border border-white/15 shadow-xl text-xs font-bold text-white/70">
              <button
                onClick={() => onSelectCamera(currentCamera === 'BEHIND_QB' ? 'BROADCAST' : currentCamera === 'BROADCAST' ? 'ALL_22' : 'BEHIND_QB')}
                className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 flex items-center gap-1.5 transition-colors"
                title="Switch Camera Perspective"
              >
                <Compass size={12} className="text-[#FF8C00]" />
                <span className="font-['Rajdhani'] uppercase tracking-wider">
                  {currentCamera === 'BEHIND_QB' ? 'Follow QB' : currentCamera === 'BROADCAST' ? 'Broadcast' : 'All-22'}
                </span>
              </button>
            </div>
          )}

          {/* Sound Toggle */}
          {onToggleSound && (
            <button
              onClick={onToggleSound}
              className={`p-2 sm:px-3 sm:py-1.5 rounded-full backdrop-blur-xl border transition-all flex items-center gap-2 text-xs font-bold shadow-xl ${
                isMuted
                  ? 'bg-red-500/20 text-red-300 border-red-400/30 hover:bg-red-500/30'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              }`}
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-[#00DAF3]" />}
              <span className="hidden sm:inline font-['Rajdhani'] uppercase tracking-wider">
                {isMuted ? 'Muted' : 'Audio On'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Stitch Design Floating Navigation Card (Matches approved mockup firstlight_menu_plajah_brand_1789345739123.jpg) */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md my-auto self-start sm:ml-4 md:ml-10">
        <div className="relative rounded-[28px] bg-[#120F1E]/85 backdrop-blur-2xl border border-white/15 p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.85)] flex flex-col gap-5">
          
          {/* Ambient Card Top Glow Accent */}
          <div className="absolute -top-10 -left-10 w-48 h-48 bg-gradient-to-br from-[#6B0099]/40 via-[#D40055]/30 to-transparent rounded-full blur-2xl pointer-events-none" />
          
          {/* Brand Lockup: Plajah Chevron + Title */}
          <div className="relative flex items-center gap-4">
            {/* Glowing Plajah Chevron SVG Icon */}
            <div className="relative flex-shrink-0 group cursor-pointer" onClick={onPlayDrive}>
              <div className="absolute -inset-2 bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] rounded-2xl blur-lg opacity-70 group-hover:opacity-100 transition duration-300" />
              <svg
                width="48"
                height="48"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="relative drop-shadow-[0_0_15px_rgba(255,140,0,0.8)]"
              >
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

            {/* Typography Header */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] text-white/70 font-['Chakra_Petch']">
                  PLAJAH SPORTS
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white shadow-[0_0_10px_rgba(255,140,0,0.5)]">
                  Beta
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-white font-['Teko'] leading-none mt-0.5">
                PROJECT FIRSTLIGHT
              </h1>
              <p className="text-xs text-white/60 font-medium tracking-wide mt-0.5">
                Learn the game. Make your play.
              </p>
            </div>
          </div>

          {/* Divider Line with Plajah Gradient */}
          <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* Action Buttons Stack */}
          <div className="flex flex-col gap-2.5">
            {/* Primary Action Button: Glowing Solar-Orange CTA */}
            <button
              id="menu-play-drive-btn"
              onClick={onPlayDrive}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#FF8C00] via-[#F97316] to-[#D40055] hover:from-[#ff9d26] hover:to-[#e01a68] text-slate-950 font-black text-base sm:text-lg tracking-wider font-['Rajdhani'] uppercase shadow-[0_0_30px_rgba(255,140,0,0.55)] hover:shadow-[0_0_40px_rgba(255,140,0,0.8)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border border-amber-300/50 flex items-center justify-center gap-3 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play size={16} fill="currentColor" className="ml-0.5 text-black" />
              </div>
              <span>PLAY A DRIVE</span>
              <ChevronRight size={18} className="text-black/60 group-hover:translate-x-1 transition-transform" />
            </button>

            {/* Secondary Action 1: Learn Football */}
            <button
              onClick={onOpenCurriculum || onOpenControls}
              className="w-full py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 hover:border-white/25 text-white/90 hover:text-white font-bold text-sm tracking-wider font-['Rajdhani'] uppercase flex items-center justify-between transition-all duration-150 cursor-pointer shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <BookOpen size={16} className="text-[#00DAF3] group-hover:scale-110 transition-transform" />
                <span>LEARN FOOTBALL</span>
              </div>
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">12 Lessons</span>
            </button>

            {/* Secondary Action 2: How To Play / Controls */}
            <button
              onClick={onOpenControls}
              className="w-full py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 hover:border-white/25 text-white/90 hover:text-white font-bold text-sm tracking-wider font-['Rajdhani'] uppercase flex items-center justify-between transition-all duration-150 cursor-pointer shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <Sliders size={16} className="text-[#D40055] group-hover:scale-110 transition-transform" />
                <span>HOW TO PLAY &amp; CONTROLS</span>
              </div>
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Keys</span>
            </button>

            {/* Secondary Action 3: Stadium Creator (with 3D badge) */}
            <button
              onClick={onOpenStadiumCreator}
              className="w-full py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 hover:border-white/25 text-white/90 hover:text-white font-bold text-sm tracking-wider font-['Rajdhani'] uppercase flex items-center justify-between transition-all duration-150 cursor-pointer shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <Zap size={16} className="text-[#FFBF42] group-hover:scale-110 transition-transform" />
                <span>STADIUM CREATOR</span>
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cyan-500/20 text-[#00DAF3] border border-cyan-400/40">
                3D
              </span>
            </button>

            {/* Secondary Action 4: Settings */}
            <button
              onClick={onOpenOptions}
              className="w-full py-2.5 px-4 rounded-xl bg-transparent hover:bg-white/[0.08] text-white/60 hover:text-white font-medium text-xs tracking-wider font-['Rajdhani'] uppercase flex items-center justify-between transition-all duration-150 cursor-pointer"
            >
              <span>SETTINGS &amp; GRAPHICS</span>
              <span className="text-[10px] text-white/40">Quality</span>
            </button>
          </div>

          {/* Status Footer: Privacy & Version */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/50 font-medium">
            <span className="flex items-center gap-1.5">
              <Shield size={12} className="text-[#06D6A0]" /> 
              <span>Local practice · No account needed</span>
            </span>
            <span className="text-[10px] text-white/40 font-mono">v1.4.2</span>
          </div>
        </div>
      </div>

      {/* Bottom Controls Bar & Pulsing Start Prompt */}
      <div className="relative z-10 w-full flex flex-col items-center gap-2 pb-2">
        {/* Bottom Control Reminder Bar */}
        <div className="hidden sm:flex items-center gap-4 px-5 py-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 text-white/70 text-xs font-semibold tracking-wider font-['Rajdhani'] shadow-2xl">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 rounded bg-white/15 text-white font-mono text-[10px] border border-white/20">SPACE</kbd> 
            <span>SNAP / THROW</span>
          </span>
          <span className="text-white/20">·</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 rounded bg-white/15 text-white font-mono text-[10px] border border-white/20">A / D</kbd> 
            <span>POCKET DRIFT</span>
          </span>
          <span className="text-white/20">·</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-0.5 rounded bg-white/15 text-white font-mono text-[10px] border border-white/20">1 - 4</kbd> 
            <span>TARGET READS</span>
          </span>
        </div>

        {/* Pulsing Start Prompt */}
        <button
          onClick={onPlayDrive}
          className="text-[#FF8C00] hover:text-amber-300 font-bold tracking-[0.25em] text-xs sm:text-sm uppercase animate-pulse font-['Rajdhani'] cursor-pointer transition-colors pt-1"
        >
          PRESS [SPACE] OR CLICK PLAY A DRIVE TO START
        </button>
      </div>
    </div>
  );
};
