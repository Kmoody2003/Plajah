import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lightbulb, Zap, Sun, Moon, Sparkles, RefreshCw, Layers, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui';

interface LdLightingControllerProps {
  onThemeSelect?: (themeId: string) => void;
}

export const LdLightingController: React.FC<LdLightingControllerProps> = ({ onThemeSelect }) => {
  const [activePreset, setActivePreset] = useState<string>('audio-sync');

  const presets = [
    {
      id: 'audio-sync',
      title: '⚡ Audio Reactive Sync',
      desc: 'Dynamically pulses with Chora bass, mids, and treble',
      gradient: 'from-[#6B0099]/60 to-[#FF8C00]/60',
      border: 'border-[#FF8C00]'
    },
    {
      id: 'cinema',
      title: '🎭 Cinema Dramatic',
      desc: 'Deep warm amber coves with soft edge vignettes',
      gradient: 'from-[#FF8C00]/20 to-[#D40055]/30',
      border: 'border-[#D40055]'
    },
    {
      id: 'cyber',
      title: '✨ Cyberpunk Neon',
      desc: 'Dual electric cyan & hyper-magenta room flood',
      gradient: 'from-[#00DAF3]/20 to-[#6B0099]/40',
      border: 'border-[#00DAF3]'
    },
    {
      id: 'intimate',
      title: '🕯️ Intimate Amber',
      desc: '2200K soft candlelight simulation with gentle flicker',
      gradient: 'from-[#FF8C00]/30 to-black',
      border: 'border-white/20'
    }
  ];

  const handleSelectPreset = (id: string) => {
    setActivePreset(id);
    onThemeSelect?.(id);
  };

  return (
    <div className="rounded-[32px] p-8 flex flex-col gap-6 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <span className="text-xs font-mono text-[#D0BCFF] uppercase font-bold">
            Plajah LD Engine (Lighting Designer)
          </span>
          <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white">
            Smart Home Lighting Themes & Presets
          </h3>
        </div>
        <span className="px-3.5 py-1 rounded-full text-xs font-mono bg-[#6B0099]/30 border border-[#D40055]/40 text-[#D0BCFF] font-semibold w-fit">
          Audio-Reactive DMX / Matter 1.3
        </span>
      </div>

      {/* Preset Cards Grid */}
      <div>
        <span className="text-xs font-mono text-white/50 uppercase block mb-3">
          Select Lighting Show Theme:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {presets.map((p) => {
            const isSelected = activePreset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleSelectPreset(p.id)}
                className={`p-5 rounded-2xl cursor-pointer transition border flex flex-col justify-between gap-3 ${
                  isSelected
                    ? `bg-gradient-to-r ${p.gradient} ${p.border} shadow-xl scale-[1.02]`
                    : 'bg-white/[0.04] border-white/10 hover:border-white/30'
                }`}
              >
                <div>
                  <h4 className="text-sm font-bold text-white font-['Outfit']">{p.title}</h4>
                  <p className="text-xs font-mono text-white/70 mt-1">{p.desc}</p>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-white/50 pt-2 border-t border-white/10">
                  <span>{isSelected ? 'Active Show' : 'Tap to Engage'}</span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#06D6A0]" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Matter Fixture Matrix */}
      <div className="p-5 rounded-2xl bg-black/40 border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-white/50 uppercase">
            Connected LD Smart Fixtures (Matter Mesh):
          </span>
          <span className="text-[10px] font-mono text-[#06D6A0]">4 Channels Synchronized</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-white/50 block">Pendant Bulbs</span>
            <strong className="text-[#FF8C00]">Warm 2700K (84%)</strong>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-white/50 block">Cove LED Strip</span>
            <strong className="text-[#D40055]">Magenta #D40055</strong>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-white/50 block">TV Backlight (ScreenSync)</span>
            <strong className="text-[#00DAF3]">Cyan Dynamic</strong>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <span className="text-white/50 block">Studio Floor Arc</span>
            <strong className="text-[#06D6A0]">Emerald Aura</strong>
          </div>
        </div>
      </div>

    </div>
  );
};

export default LdLightingController;
