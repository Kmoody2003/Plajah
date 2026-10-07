// LooksStage — the Chora FX Stage "Looks" engine.
//
// Renders a ShaderLook (house set, saved, or a council proposal being previewed) with the open-source WebGPU
// `shaders` library, driven by the shared analyser. The playing track's cover art is the source image for the
// cover looks. Falls back to the look's own gradient where WebGPU is unavailable (ShadersLookLayer), and the
// engine pill is hidden on those devices by PlayerView (see probeShaderGpu), so users don't pick a dead engine.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ShadersLookLayer from '../../plajahPixels/components/ShadersLookLayer';
import { getLookLibrary, pinnedLookId } from '../../../services/shaders/looksLibrary';
import { getLookOverride, onLookOverride, setLookOverride } from '../../../services/shaders/looksSession';
import { resolveCover } from '../../../services/shaders/coverArt';
import type { ShaderLook } from '../../../services/shaders/shaderLooks';

interface Props {
  presetIndex: number;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  fpsCap?: number;
  coverUrl?: string | null;
  trackId?: string | null;
  /** Render exactly this look (the art overlay picks its own); otherwise pick from presetIndex / override / pin. */
  look?: ShaderLook;
  /** Overlay-on-art mode: transparent background, no gradient fallback, no preview badge. */
  quiet?: boolean;
}

const LooksStage: React.FC<Props> = ({ presetIndex, analyser, isPlaying, fpsCap = 0, coverUrl, trackId, look: forcedLook, quiet = false }) => {
  const [override, setOverride] = useState<ShaderLook | null>(getLookOverride());
  const [cover, setCover] = useState<string | undefined>(undefined);
  const lastIndex = useRef(presetIndex);

  useEffect(() => onLookOverride(() => setOverride(getLookOverride())), []);
  // Stepping the preset arrows means "I'm browsing again" — drop any council preview.
  useEffect(() => {
    if (lastIndex.current !== presetIndex) { lastIndex.current = presetIndex; if (getLookOverride()) setLookOverride(null); }
  }, [presetIndex]);

  useEffect(() => {
    let dead = false;
    resolveCover(coverUrl).then(c => { if (!dead) setCover(c.url || undefined); });
    return () => { dead = true; };
  }, [coverUrl]);

  const library = useMemo(() => getLookLibrary(), [override]); // re-read when a save happens mid-session
  const pinned = pinnedLookId(trackId);
  const base = library[((presetIndex % library.length) + library.length) % library.length];
  // A per-track pin wins only on the first (unbrowsed) preset slot — never fights the user's arrows.
  const pinnedLook = presetIndex === 0 && pinned ? library.find(l => l.id === pinned) : undefined;
  const look = forcedLook ?? override ?? pinnedLook ?? base;

  return (
    <div className={`w-full h-full relative ${quiet ? '' : 'bg-black'}`}>
      <ShadersLookLayer key={look.id} look={look} coverUrl={cover} analyser={analyser} isPlaying={isPlaying}
        fps={fpsCap || 30} className="absolute inset-0" fallback={quiet ? 'none' : 'gradient'} />
      {override && !quiet && (
        <div className="absolute left-3 bottom-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/70">
          Council preview · {look.name}
        </div>
      )}
    </div>
  );
};

export default LooksStage;
