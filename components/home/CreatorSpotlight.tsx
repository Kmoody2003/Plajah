import React from 'react';
import { Sparkles, Play, Download, Share2, Heart, Award, ArrowUpRight } from 'lucide-react';
import { Button } from '../ui';

export const CreatorSpotlight: React.FC = () => {
  const creators = [
    {
      id: 'kenny',
      name: 'Kenny Moody',
      role: 'Ambient Electronics & Spatial Cinema',
      avatar: '/home/kmoody_avatar.png',
      badge: 'FOUNDER & CREATOR',
      releaseTitle: 'Cyberpunk Neo-Tokyo Overture',
      releaseDesc: '24-bit / 192kHz Spatial Master with reactive DMX lighting stems.',
      actionLabel: 'Play on Chora',
      isPrimary: true
    },
    {
      id: 'vance',
      name: 'Prof. Marcus Vance',
      role: 'Plajah Academia & AI Audio Architecture',
      avatar: null,
      initials: 'MV',
      badge: 'ACADEMIA SYNC',
      releaseTitle: 'Computer Architecture & GPU Parallelism',
      releaseDesc: 'Lecture audio, Socratic review cards, and distributed compute benchmark.',
      actionLabel: 'Open Study Cards',
      isPrimary: false
    },
    {
      id: 'elena',
      name: 'Elena Rostova',
      role: 'Neo-Classical & Spatial Synth',
      avatar: null,
      initials: 'ER',
      badge: 'COMMUNITY ARTIST',
      releaseTitle: 'Ethereal Echoes (Stems & 3D LUTs)',
      releaseDesc: 'Complete 3D visual FX pack and color grade curves for Fabula.',
      actionLabel: 'Import to Fabula',
      isPrimary: false
    }
  ];

  return (
    <div className="rounded-[32px] p-8 flex flex-col gap-6 bg-[rgba(22,5,34,0.72)] border border-[#D40055]/30 backdrop-blur-2xl shadow-2xl text-white">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <span className="text-xs font-mono text-[#D40055] uppercase font-bold">
            Plajah Creator Network
          </span>
          <h3 className="text-2xl font-black font-['Space_Grotesk'] text-white">
            Artist & Creator Promo Spotlight
          </h3>
        </div>
        <span className="px-3.5 py-1 rounded-full text-xs font-mono bg-[#FF8C00]/20 border border-[#FF8C00]/50 text-[#FF8C00] font-bold w-fit">
          Plajah+ Exclusives
        </span>
      </div>

      {/* Featured Creators Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {creators.map((c) => (
          <div
            key={c.id}
            className={`p-6 rounded-3xl flex flex-col justify-between gap-5 relative overflow-hidden border transition ${
              c.isPrimary
                ? 'bg-black/50 border-[#FF8C00]/50 shadow-xl'
                : 'bg-black/30 border-white/10 hover:border-white/25'
            }`}
          >
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {c.avatar ? (
                  <img
                    src={c.avatar}
                    alt={c.name}
                    className="w-12 h-12 rounded-2xl border-2 border-[#FF8C00] object-cover shadow-md"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#6B0099] to-[#00DAF3] flex items-center justify-center font-bold text-white shadow-md">
                    {c.initials}
                  </div>
                )}
                <div>
                  <h4 className="text-base font-bold text-white font-['Outfit']">{c.name}</h4>
                  <span className="text-xs font-mono text-white/50">{c.role}</span>
                </div>
              </div>
            </div>

            {/* Release details */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col gap-1.5">
              <span className="text-[10px] font-mono text-[#D0BCFF] uppercase font-bold tracking-wider">
                {c.badge}
              </span>
              <h5 className="text-sm font-bold text-white">{c.releaseTitle}</h5>
              <p className="text-xs text-white/70 mt-1 leading-relaxed">{c.releaseDesc}</p>
            </div>

            {/* Actions */}
            <Button
              variant={c.isPrimary ? 'accent' : 'secondary'}
              size="sm"
              icon={c.isPrimary ? <Play size={14} className="text-[#12080a]" /> : <ArrowUpRight size={14} />}
              className="w-full font-bold uppercase tracking-wider text-xs"
              onClick={() => alert(`Activated promo item for ${c.name}`)}
            >
              {c.actionLabel}
            </Button>
          </div>
        ))}
      </div>

    </div>
  );
};

export default CreatorSpotlight;
