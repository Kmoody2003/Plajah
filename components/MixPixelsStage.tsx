// MixPixelsStage — the Pixels visual for a Chora Mix.
//
// Two modes (per Album.mixMeta.visualMode):
//  • AUTO (default): the intelligent auto-show. It listens to the mix through the shared
//    analyser and advances ONE generator at a time — never composited — switching on the
//    music (kick/snare transients, density-scaled) like a VJ flipping a channel. The
//    single-layer rule is enforced by only ever rendering one FxStageVisualizers GENERATOR.
//  • AUTHORED: the artist attached a saved Plajah Pixels project (mixMeta.pixelsProjectId).
//    We load that cloud project (owned by the mix's author) and play back its full layer
//    matrix via LayerStack — the artist's real composition, comping and all. If the project
//    can't be loaded (not found, or not readable by this listener), we fall back to the
//    Auto-Show so the canvas is never dead.
//
// Intentional, wanted motion: this does NOT freeze under prefers-reduced-motion (the visual IS
// the feature). Listeners can't manipulate it; it only reacts.

import React, { useEffect, useRef, useState } from 'react';
import FxStageVisualizers, { FX_ENGINE_PRESETS, fxPresetName } from './FxStageVisualizers';
import { AudioDriverSampler } from './plajahPixels/engine/audioDrivers';
import LayerStack from './plajahPixels/components/LayerStack';
import { loadCloudProject } from './plajahPixels/services/projectService';
import type { VisualizationConfig } from './plajahPixels/types';
import type { LauncherLayer } from './plajahPixels/components/ClipLauncher';

const GEN_COUNT = FX_ENGINE_PRESETS.GENERATOR.length; // the 22 Plajah Pixels generators

export interface MixPixelsInfo {
  index: number;      // 0-based generator index (Auto-Show only)
  count: number;      // total generators
  name: string;       // human generator name, or the project name for an authored show
  authored: boolean;  // true when playing an artist-defined show
}

interface MixPixelsStageProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualMode?: 'AUTO' | 'AUTHORED';
  pixelsProjectId?: string;
  /** Author of the mix — the project lives at users/{ownerId}/plajahProjects/{pixelsProjectId}. */
  ownerId?: string;
  /** Called whenever the active generator (or authored show) changes, for the canvas badge. */
  onGeneratorChange?: (info: MixPixelsInfo) => void;
  className?: string;
}

const MixPixelsStage: React.FC<MixPixelsStageProps> = ({
  analyser, isPlaying, visualMode = 'AUTO', pixelsProjectId, ownerId, onGeneratorChange, className,
}) => {
  const [presetIndex, setPresetIndex] = useState(() => Math.floor(Math.random() * GEN_COUNT));
  const infoCb = useRef(onGeneratorChange);
  infoCb.current = onGeneratorChange;

  // ── Authored show: load the artist's saved Pixels project (best-effort) ──
  const [authored, setAuthored] = useState<{ layers: LauncherLayer[]; config: VisualizationConfig; name: string } | null>(null);
  const wantAuthored = visualMode === 'AUTHORED' && !!pixelsProjectId && !!ownerId;
  useEffect(() => {
    if (!wantAuthored) { setAuthored(null); return; }
    let cancelled = false;
    loadCloudProject(ownerId!, pixelsProjectId!)
      .then(proj => {
        if (cancelled) return;
        const layers = (proj.layers || []) as LauncherLayer[];
        if (layers.length) setAuthored({ layers, config: proj.config, name: proj.projectName || 'Artist show' });
        else setAuthored(null); // empty project → fall back to the auto-show
      })
      .catch(() => { if (!cancelled) setAuthored(null); }); // unreadable/not found → auto-show
    return () => { cancelled = true; };
  }, [wantAuthored, ownerId, pixelsProjectId]);

  const authoredActive = !!authored;

  // Report the active visual up to the player (for the on-canvas badge).
  useEffect(() => {
    if (authoredActive) {
      infoCb.current?.({ index: 0, count: 0, name: authored!.name, authored: true });
    } else {
      infoCb.current?.({
        index: ((presetIndex % GEN_COUNT) + GEN_COUNT) % GEN_COUNT,
        count: GEN_COUNT,
        name: fxPresetName('GENERATOR', presetIndex),
        authored: false,
      });
    }
  }, [presetIndex, authoredActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // The intelligent advance loop — a VJ that switches generators on the music. Auto-Show only.
  useEffect(() => {
    if (authoredActive || !analyser || !isPlaying) return;
    const sampler = new AudioDriverSampler();
    let raf = 0;
    let lastSwitch = (typeof performance !== 'undefined' ? performance.now() : 0);
    lastSwitch += 1500; // ease in — let a generator establish itself before the first switch

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
  }, [analyser, isPlaying, authoredActive]);

  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      {authoredActive
        ? <LayerStack layers={authored!.layers} config={authored!.config} analyser={analyser} isPlaying={isPlaying} />
        : <FxStageVisualizers engine="GENERATOR" presetIndex={presetIndex} analyser={analyser} isPlaying={isPlaying} />}
    </div>
  );
};

export default MixPixelsStage;
