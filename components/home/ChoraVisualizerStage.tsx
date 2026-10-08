import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Music, Play, Pause, SkipForward, Speaker, Volume2, Disc, Layers } from 'lucide-react';
import { Button, IconButton } from '../ui';

export const ChoraVisualizerStage: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-white">
      
      {/* LEFT 7 COLS: Spatial Hi-Fi Audio Stage & Live Spectrum */}
      <div className="lg:col-span-7 rounded-[32px] p-8 flex flex-col justify-between min-h-[480px] bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl">
        
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <div>
            <span className="text-xs font-mono text-[#FF8C00] uppercase font-bold">Chora Lossless Sound Engine</span>
            <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white">Spatial Hi-Fi Audio Stage</h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono bg-[#FF8C00]/20 border border-[#FF8C00]/50 text-[#FF8C00] font-bold">
            FLAC 24-bit / 192kHz
          </span>
        </div>

        {/* Dynamic Spectrum Graphic & FFT Bars */}
        <div className="my-6 p-6 rounded-3xl bg-black/50 border border-white/10 flex flex-col justify-between gap-6 relative overflow-hidden">
          <div className="flex justify-between items-center text-xs font-mono text-white/50">
            <span>FREQUENCY SPECTRUM (32-BAND FFT)</span>
            <span className="text-[#06D6A0]">LOSSLESS OPUS PASS • 48kHz</span>
          </div>

          {/* Dancing Spectrum Bars */}
          <div className="flex items-end justify-between gap-1.5 h-36 px-2">
            {[45, 70, 88, 52, 96, 68, 82, 58, 92, 76, 48, 86, 42, 64, 78, 90].map((h, i) => (
              <motion.div
                key={i}
                animate={isPlaying ? { height: [`${h * 0.35}%`, `${h}%`, `${h * 0.25}%`] } : { height: '10%' }}
                transition={{ duration: 0.9 + (i % 4) * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-2.5 rounded-t-full bg-gradient-to-t from-[#6B0099] via-[#D40055] to-[#FF8C00]"
              />
            ))}
          </div>

          {/* VU Meters for LD Lighting Sync */}
          <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-white/10">
            <span className="text-white/60">LD Audio Reactive Output:</span>
            <div className="flex gap-4">
              <span className="text-[#EF4444]">Bass: <strong>+4.2dB</strong></span>
              <span className="text-[#FF8C00]">Mid: <strong>-1.0dB</strong></span>
              <span className="text-[#00DAF3]">Treble: <strong>+2.8dB</strong></span>
            </div>
          </div>
        </div>

        {/* Playback Controls & Track Details */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h4 className="text-lg font-bold font-['Outfit'] text-white">Midnight Cityscape (Acoustic Master)</h4>
            <span className="text-xs text-white/50">M83 • Album: Hurry Up, We're Dreaming (Plajah Spatial Mix)</span>
          </div>
          <Button
            variant="accent"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            icon={isPlaying ? <Pause size={14} className="text-[#12080a]" /> : <Play size={14} className="text-[#12080a]" />}
            className="font-bold text-xs tracking-wider"
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </Button>
        </div>

      </div>

      {/* RIGHT 5 COLS: Spinning Disc & Multi-Room Audio Group Routing */}
      <div className="lg:col-span-5 rounded-[32px] p-8 flex flex-col justify-between items-center text-center min-h-[480px] bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl">
        
        <div className="w-full flex justify-between items-center text-xs font-mono text-white/50">
          <span>ALBUM ARTWORK</span>
          <span>BEAM: ALL ROOMS</span>
        </div>

        {/* Spinning Disc with Artwork */}
        <div className="relative w-56 h-56 rounded-full p-2 bg-gradient-to-tr from-[#6B0099] via-[#D40055] to-[#FF8C00] shadow-2xl flex items-center justify-center animate-pulse">
          <div className="w-full h-full rounded-full overflow-hidden border-4 border-black/80 shadow-inner flex items-center justify-center">
            <img src="/home/art_nebula.png" alt="Album Cover" className="w-full h-full object-cover" />
          </div>
          <div className="absolute w-12 h-12 rounded-full bg-[#100B17] border-2 border-white/40 flex items-center justify-center shadow-lg">
            <div className="w-3 h-3 rounded-full bg-[#FF8C00]" />
          </div>
        </div>

        <div className="w-full p-4 rounded-2xl bg-black/40 border border-white/10 text-left font-mono text-xs">
          <div className="text-[#D0BCFF] font-bold">Chora Lossless Multi-Room Group</div>
          <div className="text-white/60 text-[11px] mt-0.5">Living Suite • Studio Lab • Patio Audio (0ms Jitter)</div>
        </div>

      </div>

    </div>
  );
};

export default ChoraVisualizerStage;
