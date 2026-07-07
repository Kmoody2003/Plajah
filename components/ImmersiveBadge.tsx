import React from 'react';
import { Boxes, Headphones } from 'lucide-react';

// Surfaces spatial/immersive audio for discovery — anywhere a track, album or film
// carries isEclipsa (Eclipsa/IAMF, authored in the Spatial Mixer → binaural HRTF on
// playback) or isAtmos (Dolby Atmos passthrough). The now-playing bar has its own
// inline badge + HRTF engine; this is the shared marker for release/track/film pages.

interface Props {
  isEclipsa?: boolean;
  isAtmos?: boolean;
  size?: 'sm' | 'md';
  showHint?: boolean;   // append a "best with headphones" line
  className?: string;
}

const ImmersiveBadge: React.FC<Props> = ({ isEclipsa, isAtmos, size = 'md', showHint = false, className = '' }) => {
  if (!isEclipsa && !isAtmos) return null;
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[7px] gap-1' : 'px-2.5 py-1 text-[9px] gap-1.5';
  const icon = size === 'sm' ? 9 : 11;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {isEclipsa && (
        <span className={`inline-flex items-center ${pad} rounded-full font-black uppercase tracking-widest bg-[#22D3AA]/15 border border-[#22D3AA]/30 text-[#22D3AA]`}
          title="Eclipsa / IAMF immersive audio — spatially rendered on playback">
          <Boxes size={icon} /> Eclipsa · Spatial
        </span>
      )}
      {isAtmos && (
        <span className={`inline-flex items-center ${pad} rounded-full font-black uppercase tracking-widest bg-violet-500/15 border border-violet-400/30 text-violet-300`}
          title="Dolby Atmos">
          Dolby Atmos
        </span>
      )}
      {showHint && (
        <span className={`inline-flex items-center gap-1 ${size === 'sm' ? 'text-[7px]' : 'text-[9px]'} font-bold uppercase tracking-widest text-white/40`}>
          <Headphones size={icon} /> Best with headphones
        </span>
      )}
    </span>
  );
};

export default ImmersiveBadge;
