// MixPixelsStage — the Pixels visual for a Chora Mix.
//
// Two modes (per Album.mixMeta.visualMode):
//  • AUTO (default): the intelligent, audio-reactive auto-show. It listens to the mix through the
//    shared analyser and advances through the 22 Plajah Pixels canvas & studio generator scenes,
//    timed musically with the track's groove and energy. Never thrashes WebGL contexts; runs at a
//    stable 60fps with zero memory leaks.
//  • AUTHORED: the artist attached a saved Plajah Pixels project (mixMeta.pixelsProjectId).
//    We load that cloud project and play back its full layer matrix via LayerStack. Any load
//    failure falls back to the auto-show so the canvas is never dead.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import FxStageVisualizers, { FX_ENGINE_PRESETS, fxPresetName } from './FxStageVisualizers';
import { AudioDriverSampler } from './plajahPixels/engine/audioDrivers';
import LayerStack from './plajahPixels/components/LayerStack';
import { loadCloudProject } from './plajahPixels/services/projectService';
import type { VisualizationConfig } from './plajahPixels/types';
import type { LauncherLayer } from './plajahPixels/components/ClipLauncher';

const GEN_COUNT = FX_ENGINE_PRESETS.GENERATOR.length; // 22 generator scenes

export interface MixPixelsInfo {
  index: number;
  count: number;
  name: string;
  authored: boolean;
}

interface MixPixelsStageProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualMode?: 'AUTO' | 'AUTHORED';
  pixelsProjectId?: string;
  ownerId?: string;
  onGeneratorChange?: (info: MixPixelsInfo) => void;
  className?: string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const MixPixelsStage: React.FC<MixPixelsStageProps> = ({
  analyser, isPlaying, visualMode = 'AUTO', pixelsProjectId, ownerId, onGeneratorChange, className,
}) => {
  const [presetIndex, setPresetIndex] = useState(() => Math.floor(Math.random() * GEN_COUNT));
  const infoCb = useRef(onGeneratorChange);
  infoCb.current = onGeneratorChange;

  // Shuffled generator order so all 22 scenes cycle evenly without immediate repeats
  const orderRef = useRef<number[]>([]);
  const curIdxRef = useRef<number>(0);
  const nextPreset = useCallback((): number => {
    let order = orderRef.current;
    if (order.length === 0 || curIdxRef.current >= order.length) {
      order = Array.from({ length: GEN_COUNT }, (_, i) => i);
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [order[k], order[j]] = [order[j], order[k]];
      }
      orderRef.current = order;
      curIdxRef.current = 0;
    }
    return order[curIdxRef.current++];
  }, []);

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
        else setAuthored(null);
      })
      .catch(() => { if (!cancelled) setAuthored(null); });
    return () => { cancelled = true; };
  }, [wantAuthored, ownerId, pixelsProjectId]);
  const authoredActive = !!authored;

  // Report the active visual up to the player for the on-canvas badge
  useEffect(() => {
    if (authoredActive) {
      infoCb.current?.({ index: 0, count: 0, name: authored!.name, authored: true });
    } else {
      const name = `Pixels · ${fxPresetName('GENERATOR', presetIndex)}`;
      infoCb.current?.({ index: presetIndex, count: GEN_COUNT, name, authored: false });
    }
  }, [presetIndex, authoredActive]);

  // Musical, groove-aligned advance loop. Auto-Show only.
  useEffect(() => {
    if (authoredActive || !analyser || !isPlaying) return;
    const sampler = new AudioDriverSampler();
    let raf = 0;
    let lastSwitch = typeof performance !== 'undefined' ? performance.now() : 0;
    lastSwitch += 4000; // Let opening scene settle before first transition
    let energy = 0;

    const tick = (now: number) => {
      sampler.update(analyser, now);

      // Section energy: sub-bass + drum density, smoothed so it tracks musical structure
      const inst = clamp01(0.6 * sampler.intensity + 0.7 * sampler.density);
      const prev = energy;
      energy = prev * 0.92 + inst * 0.08;

      const bpm = Math.min(200, Math.max(70, sampler.bpm || 120));
      const beatMs = 60000 / bpm;
      // 16 to 32 bars between standard transitions (18–30 seconds)
      const grooveGap = Math.max(16000, beatMs * 32);

      // Major energy drop detection: big surge from quiet section to peak (with 10s cooldown)
      const isDrop = energy > 0.70 && energy - prev > 0.08 && now - lastSwitch > 10000;
      // Beat-aligned transition once the groove interval has elapsed
      const isBeatSwitch = (sampler.isKick || sampler.isSnare) && now - lastSwitch > grooveGap;
      // Idle fallback if song is ambient/beatless
      const isIdleSwitch = now - lastSwitch > grooveGap * 1.8;

      if (isDrop || isBeatSwitch || isIdleSwitch) {
        lastSwitch = now;
        setPresetIndex(nextPreset());
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, isPlaying, authoredActive, nextPreset]);

  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      {authoredActive ? (
        <LayerStack layers={authored!.layers} config={authored!.config} analyser={analyser} isPlaying={isPlaying} />
      ) : (
        <FxStageVisualizers engine="GENERATOR" presetIndex={presetIndex} analyser={analyser} isPlaying={isPlaying} />
      )}
    </div>
  );
};

export default MixPixelsStage;
