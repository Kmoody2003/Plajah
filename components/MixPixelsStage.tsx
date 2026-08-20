// MixPixelsStage — the Pixels visual for a Chora Mix.
//
// Two modes (per Album.mixMeta.visualMode):
//  • AUTO (default): the intelligent auto-show. It listens to the mix through the shared
//    analyser and advances ONE generator at a time — never composited — switching on the
//    music (kick/snare transients, density-scaled) like a VJ flipping a channel. This is the
//    "Plajah Pixels builds its own show" behavior: while it learns the set it advances
//    generators reactively; the single-layer rule is enforced by only ever rendering one
//    FxStageVisualizers GENERATOR at a time.
//  • AUTHORED: the artist attached a saved Plajah Pixels project (mixMeta.pixelsProjectId).
//    Full authored playback (the project's layer matrix) is a later phase; until then this
//    falls back to the auto-show so the canvas is never dead. The badge still reads "Artist show".
//
// Intentional, wanted motion: this does NOT freeze under prefers-reduced-motion (the visual IS
// the feature — same call the orrery/brand-gradient made). Listeners can't manipulate it; it
// only reacts.

import React, { useEffect, useRef, useState } from 'react';
import FxStageVisualizers, { FX_ENGINE_PRESETS, fxPresetName } from './FxStageVisualizers';
import { AudioDriverSampler } from './plajahPixels/engine/audioDrivers';

const GEN_COUNT = FX_ENGINE_PRESETS.GENERATOR.length; // the 22 Plajah Pixels generators

export interface MixPixelsInfo {
  index: number;      // 0-based generator index
  count: number;      // total generators
  name: string;       // human generator name (e.g. "Kaleidoscope")
  authored: boolean;  // true when playing an artist-defined show
}

interface MixPixelsStageProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualMode?: 'AUTO' | 'AUTHORED';
  pixelsProjectId?: string;
  /** Called whenever the active generator changes, so the player can label the canvas badge. */
  onGeneratorChange?: (info: MixPixelsInfo) => void;
  className?: string;
}

const MixPixelsStage: React.FC<MixPixelsStageProps> = ({
  analyser, isPlaying, visualMode = 'AUTO', pixelsProjectId, onGeneratorChange, className,
}) => {
  const [presetIndex, setPresetIndex] = useState(() => Math.floor(Math.random() * GEN_COUNT));
  const authored = visualMode === 'AUTHORED' && !!pixelsProjectId;
  const infoCb = useRef(onGeneratorChange);
  infoCb.current = onGeneratorChange;

  // Report the active generator up to the player (for the on-canvas badge).
  useEffect(() => {
    infoCb.current?.({
      index: ((presetIndex % GEN_COUNT) + GEN_COUNT) % GEN_COUNT,
      count: GEN_COUNT,
      name: fxPresetName('GENERATOR', presetIndex),
      authored,
    });
  }, [presetIndex, authored]);

  // The intelligent advance loop — a VJ that switches generators on the music.
  useEffect(() => {
    if (!analyser || !isPlaying) return;
    const sampler = new AudioDriverSampler();
    let raf = 0;
    let lastSwitch = (typeof performance !== 'undefined' ? performance.now() : 0);
    // Ease in — don't switch in the first couple seconds so a generator establishes itself.
    lastSwitch += 1500;

    const tick = (now: number) => {
      sampler.update(analyser, now);
      // Groove clock: ~16 beats between switches at rest, tightening as the drums get busy
      // (density → rapid-fire), so drops feel like the visual is cutting with the music.
      const bpm = Math.min(200, Math.max(70, sampler.bpm || 120));
      const beatMs = 60000 / bpm;
      const grooveGap = beatMs * 16;
      const dynamicGap = Math.max(2400, grooveGap * (1 - sampler.density * 0.85));
      const hitSwitch = (sampler.isKick || sampler.isSnare) && now - lastSwitch > dynamicGap;
      const idleSwitch = now - lastSwitch > grooveGap * 2.5; // keep moving even in a beatless passage
      if (hitSwitch || idleSwitch) {
        lastSwitch = now;
        // Jump to a DIFFERENT generator (VJ-style), mostly forward — never repeat back-to-back.
        setPresetIndex(prev => (prev + 1 + Math.floor(Math.random() * (GEN_COUNT - 1))) % GEN_COUNT);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, isPlaying]);

  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <FxStageVisualizers engine="GENERATOR" presetIndex={presetIndex} analyser={analyser} isPlaying={isPlaying} />
    </div>
  );
};

export default MixPixelsStage;
