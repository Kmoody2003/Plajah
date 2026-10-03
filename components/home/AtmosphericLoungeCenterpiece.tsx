import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Thermometer, Sun, Wind, Lock, Unlock, Camera,
  Mic, MicOff, Monitor, HardDrive, Zap, ShieldCheck
} from 'lucide-react';
import { Button, IconButton } from '../ui';

interface AtmosphericLoungeCenterpieceProps {
  onAtmosphereChange?: (mood: string) => void;
  onIntercomToggle?: () => void;
}

export const AtmosphericLoungeCenterpiece: React.FC<AtmosphericLoungeCenterpieceProps> = ({
  onAtmosphereChange,
  onIntercomToggle
}) => {
  const [targetTemp, setTargetTemp] = useState<number>(72);
  const [hvacMode, setHvacMode] = useState<'cool' | 'heat' | 'auto' | 'off'>('cool');
  const [isEcoMode, setIsEcoMode] = useState<boolean>(true);
  const [pendantBrightness, setPendantBrightness] = useState<number>(84);
  const [coveBrightness, setCoveBrightness] = useState<number>(60);
  const [isDoorLocked, setIsDoorLocked] = useState<boolean>(true);
  const [isIntercomActive, setIsIntercomActive] = useState<boolean>(false);
  const [camTimestamp, setCamTimestamp] = useState<string>('08:44:12 EDT');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCamTimestamp(now.toTimeString().split(' ')[0] + ' EDT');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const adjustTemp = (delta: number) => {
    setTargetTemp((prev) => Math.min(85, Math.max(60, prev + delta)));
  };

  // 60°F to 85°F mapped to SVG arc offset (circumference ~603)
  const fraction = (targetTemp - 60) / 25;
  const strokeOffset = 380 - fraction * 220;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* LEFT 7 COLS: Glowing Tactical Centerpiece Dial & Lighting */}
      <section className="lg:col-span-7 flex flex-col gap-6">
        
        {/* HERO CARD: Climate & Air Ecology */}
        <div className="relative overflow-hidden rounded-[32px] p-8 flex flex-col items-center justify-between min-h-[460px] bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl">
          
          {/* Radiant Ambient Core Orb */}
          <div className="absolute -top-24 -right-24 w-88 h-88 rounded-full bg-gradient-to-br from-[#FF8C00]/40 to-[#D40055]/30 blur-3xl pointer-events-none animate-pulse" />

          {/* Header Row */}
          <div className="w-full flex items-center justify-between z-10">
            <div>
              <span className="text-xs uppercase tracking-widest font-mono text-[#D0BCFF]">Living Studio Suite</span>
              <h2 className="text-xl font-['Outfit'] font-black text-white">Climate & Air Ecology</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#FF8C00]/20 border border-[#FF8C00]/40 text-[#FF8C00]">
                {hvacMode.toUpperCase()} ACTIVE
              </span>
              <button
                onClick={() => setIsEcoMode(!isEcoMode)}
                className={`px-2.5 py-1 rounded-full text-xs font-mono transition border ${
                  isEcoMode
                    ? 'bg-white/[0.05] border-white/10 text-white/70 hover:text-white'
                    : 'bg-[#D40055]/30 border-[#D40055]/60 text-white font-bold'
                }`}
              >
                {isEcoMode ? 'ECO 2.4kW' : 'BOOST 4.8kW'}
              </button>
            </div>
          </div>

          {/* TACTILE CIRCULAR DIAL */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 my-4 flex items-center justify-center z-10">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 240 240">
              <defs>
                <linearGradient id="dial-gradient-rt" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6B0099" />
                  <stop offset="50%" stopColor="#D40055" />
                  <stop offset="100%" stopColor="#FF8C00" />
                </linearGradient>
              </defs>
              <circle
                cx="120"
                cy="120"
                r="96"
                strokeWidth="14"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="603"
                strokeDashoffset="150"
              />
              <circle
                cx="120"
                cy="120"
                r="96"
                strokeWidth="14"
                fill="none"
                stroke="url(#dial-gradient-rt)"
                strokeLinecap="round"
                strokeDasharray="603"
                strokeDashoffset={strokeOffset}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
            </svg>

            {/* Inside Dial Reading */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-mono uppercase tracking-wider text-white/50">Target Temp</span>
              <div className="flex items-start justify-center">
                <span className="text-6xl sm:text-7xl font-['Outfit'] font-black tracking-tighter text-white">
                  {targetTemp}
                </span>
                <span className="text-3xl font-['Outfit'] text-[#FF8C00] font-bold mt-1">°F</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-[#06D6A0]" />
                <span className="text-xs text-white/80 font-mono">Current: 74°F • 44% Hum</span>
              </div>
            </div>

            {/* Steppers */}
            <div className="absolute bottom-1 w-full flex justify-between px-6 z-20">
              <button
                onClick={() => adjustTemp(-1)}
                className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/20 flex items-center justify-center text-lg font-bold text-white transition active:scale-95 shadow-md"
              >
                −
              </button>
              <button
                onClick={() => adjustTemp(1)}
                className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.18] border border-white/20 flex items-center justify-center text-lg font-bold text-white transition active:scale-95 shadow-md"
              >
                +
              </button>
            </div>
          </div>

          {/* HVAC Mode Pills */}
          <div className="w-full flex items-center justify-center gap-2 z-10 pt-2 border-t border-white/[0.08]">
            {(['cool', 'heat', 'auto', 'off'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setHvacMode(mode)}
                className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold transition ${
                  hvacMode === mode
                    ? 'bg-[#FF8C00] text-[#12080a] shadow-md'
                    : 'bg-white/[0.06] text-white/70 hover:text-white'
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Dual Lighting Dimmer Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-[28px] p-5 flex flex-col justify-between gap-4 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/25 backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#FF8C00]/20 border border-[#FF8C00]/30 flex items-center justify-center text-[#FF8C00]">
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Lounge Pendants</h4>
                  <span className="text-xs text-white/50 font-mono">LD Engine Synced</span>
                </div>
              </div>
              <span className="text-sm font-mono font-bold text-[#FF8C00]">{pendantBrightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={pendantBrightness}
              onChange={(e) => setPendantBrightness(Number(e.target.value))}
              className="w-full accent-[#FF8C00]"
            />
          </div>

          <div className="rounded-[28px] p-5 flex flex-col justify-between gap-4 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/25 backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#D40055]/20 border border-[#D40055]/30 flex items-center justify-center text-[#D40055]">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Cove Backlight</h4>
                  <span className="text-xs text-white/50 font-mono">Magenta Aura</span>
                </div>
              </div>
              <span className="text-sm font-mono font-bold text-[#D40055]">{coveBrightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={coveBrightness}
              onChange={(e) => setCoveBrightness(Number(e.target.value))}
              className="w-full accent-[#D40055]"
            />
          </div>
        </div>

      </section>

      {/* RIGHT 5 COLS: Live Matter Cam & Door Lock + Repurposed WebRTC Rig */}
      <section className="lg:col-span-5 flex flex-col gap-6">
        
        {/* Matter Door Camera & Lock Card */}
        <div className="rounded-[32px] p-6 relative overflow-hidden flex flex-col gap-4 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] animate-pulse" />
              <h3 className="text-sm font-bold tracking-tight text-white uppercase font-mono">Studio Entry Cam</h3>
            </div>
            <span className="text-[11px] font-mono text-white/50 px-2.5 py-0.5 rounded-full bg-white/[0.05] border border-white/10">
              1080p60 • Matter
            </span>
          </div>

          {/* Camera Viewport Canvas */}
          <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-black/70 border border-white/10 flex items-center justify-center group">
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
            <div className="absolute top-2 left-2 z-20 font-mono text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded border border-white/10">
              REC ● {camTimestamp}
            </div>
            <div className="relative z-10 flex flex-col items-center text-center p-3">
              <div className="w-10 h-10 rounded-full border border-[#00DAF3]/50 flex items-center justify-center mb-1 shadow-lg shadow-[#00DAF3]/20">
                <Camera className="w-5 h-5 text-[#00DAF3]" />
              </div>
              <span className="text-xs font-mono text-white font-medium">PERIMETER ARMED</span>
            </div>
            <div className="absolute bottom-2 right-2 z-20">
              <button
                onClick={() => {
                  setIsIntercomActive(!isIntercomActive);
                  onIntercomToggle?.();
                }}
                className={`px-3 py-1 rounded-xl text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 transition ${
                  isIntercomActive ? 'bg-[#06D6A0] text-[#12080a] animate-pulse' : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
              >
                {isIntercomActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{isIntercomActive ? 'Broadcasting...' : '2-Way Talk'}</span>
              </button>
            </div>
          </div>

          {/* Smart Door Lock Toggle Bar */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                  isDoorLocked
                    ? 'bg-[#06D6A0]/20 border-[#06D6A0]/40 text-[#06D6A0]'
                    : 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
                }`}
              >
                {isDoorLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </div>
              <div>
                <h5 className="text-xs font-bold text-white uppercase tracking-wider">Main Entry Lock</h5>
                <span
                  className={`text-xs font-mono font-semibold ${
                    isDoorLocked ? 'text-[#06D6A0]' : 'text-[#FF8C00]'
                  }`}
                >
                  {isDoorLocked ? 'SECURED' : 'UNLOCKED'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsDoorLocked(!isDoorLocked)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/10 transition"
            >
              {isDoorLocked ? 'UNLOCK' : 'LOCK NOW'}
            </button>
          </div>
        </div>

        {/* Repurposed Xbox One WebRTC Workstation Tile */}
        <div className="rounded-[32px] p-6 flex flex-col justify-between gap-4 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#6B0099] text-white">REPURPOSED RIG</span>
                <span className="text-xs font-mono text-[#06D6A0]">● Online</span>
              </div>
              <h4 className="text-base font-['Outfit'] font-bold text-white mt-1">Living Room Xbox Console</h4>
              <p className="text-xs text-white/60">Edge Browser P2P Client • WebRTC 1080p60</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#D0BCFF]">
              <Monitor className="w-5 h-5" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-white/70 flex justify-between items-center">
            <span>Latency: <strong className="text-[#06D6A0]">12ms</strong></span>
            <span>Frame: <strong className="text-white">60 FPS</strong></span>
            <span>Codec: <strong className="text-[#D0BCFF]">AV1 Lossless</strong></span>
          </div>

          <Button
            variant="accent"
            size="sm"
            className="w-full font-bold uppercase tracking-wider text-xs shadow-lg shadow-[var(--pj-orange)]/20"
          >
            Beam Display to TV
          </Button>
        </div>

      </section>

    </div>
  );
};

export default AtmosphericLoungeCenterpiece;
