// MixPixelsStage — the Pixels visual for a Chora Mix.
//
// Two modes (per Album.mixMeta.visualMode):
//  • AUTO (default): the intelligent, ENERGY-AWARE auto-show. It listens to the mix through the
//    shared analyser and advances ONE visual at a time — never composited — switching on the
//    music. It draws from the WHOLE Plajah Pixels library (canvas GENERATORS, bundled SHADERS,
//    MILKDROP presets) and weights the choice by the section's energy: calm breakdowns lean on
//    the gentler canvas generators, the mids bring in shaders, and drops punch in shaders/
//    milkdrops and cut faster. A real drop forces an immediate high-impact hit.
//  • AUTHORED: the artist attached a saved Plajah Pixels project (mixMeta.pixelsProjectId).
//    We load that cloud project and play back its full layer matrix via LayerStack. Any load
//    failure falls back to the auto-show so the canvas is never dead.
//
// Intentional, wanted motion: this does NOT freeze under prefers-reduced-motion. Listeners
// can't manipulate it; it only reacts.

import React, { useEffect, useRef, useState } from 'react';
import FxStageVisualizers, { FX_ENGINE_PRESETS, fxPresetName, loadMilkdropNames, type FxEngine } from './FxStageVisualizers';
import { AudioDriverSampler } from './plajahPixels/engine/audioDrivers';
import LayerStack from './plajahPixels/components/LayerStack';
import { loadCloudProject } from './plajahPixels/services/projectService';
import type { VisualizationConfig } from './plajahPixels/types';
import type { LauncherLayer } from './plajahPixels/components/ClipLauncher';

const GEN_COUNT = FX_ENGINE_PRESETS.GENERATOR.length;    // the 22 canvas generators
const SHADER_COUNT = FX_ENGINE_PRESETS.SHADER.length;    // the bundled audio-reactive shaders

type Visual = { engine: FxEngine; index: number };

export interface MixPixelsInfo {
  index: number;
  count: number;
  name: string;       // "Gen · Nebula" / "Shader · Aurora Rings" / "MilkDrop · <preset>", or the project name
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

const engLabel = (e: FxEngine) => (e === 'GENERATOR' ? 'Gen' : e === 'SHADER' ? 'Shader' : 'MilkDrop');
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const MixPixelsStage: React.FC<MixPixelsStageProps> = ({
  analyser, isPlaying, visualMode = 'AUTO', pixelsProjectId, ownerId, onGeneratorChange, className,
}) => {
  const [visual, setVisual] = useState<Visual>(() => ({ engine: 'GENERATOR', index: Math.floor(Math.random() * GEN_COUNT) }));
  const infoCb = useRef(onGeneratorChange);
  infoCb.current = onGeneratorChange;

  const [mdNames, setMdNames] = useState<string[]>([]);
  const mdNamesRef = useRef<string[]>([]);
  mdNamesRef.current = mdNames;
  useEffect(() => {
    let alive = true;
    loadMilkdropNames().then(n => { if (alive) setMdNames(n || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Per-engine cursors so generators/shaders CYCLE (every one gets used over time) even though
  // the engine is chosen by energy; milkdrops are drawn at random from the full pool.
  const genOrderRef = useRef<number[]>([]);
  const genCurRef = useRef(0);
  const shaderCurRef = useRef(0);
  const nextGen = (): Visual => {
    let order = genOrderRef.current;
    if (order.length === 0 || genCurRef.current >= order.length) {
      order = Array.from({ length: GEN_COUNT }, (_, i) => i);
      for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
      genOrderRef.current = order; genCurRef.current = 0;
    }
    return { engine: 'GENERATOR', index: order[genCurRef.current++] };
  };
  const nextShader = (): Visual => ({ engine: 'SHADER', index: (shaderCurRef.current++) % Math.max(1, SHADER_COUNT) });
  const nextMilkdrop = (): Visual | null => {
    const n = mdNamesRef.current.length;
    return n > 0 ? { engine: 'MILKDROP', index: Math.floor(Math.random() * n) } : null;
  };
  // Choose an engine weighted by energy e (0..1): low = mostly generators, high = shaders +
  // milkdrops. Milkdrops only really enter as the energy climbs (e²), so they read as "drop" hits.
  const pickByEnergy = (e: number): Visual => {
    const hasMd = mdNamesRef.current.length > 0;
    const genW = 1 - 0.55 * e;       // 1.00 (calm) → 0.45 (peak)
    const shaderW = 0.30 + 0.60 * e; // 0.30 → 0.90
    const mdW = hasMd ? e * e * 1.4 : 0;
    let r = Math.random() * (genW + shaderW + mdW);
    if ((r -= genW) < 0) return nextGen();
    if ((r -= shaderW) < 0) return nextShader();
    return nextMilkdrop() ?? nextGen();
  };
  const applyVisual = (v: Visual) => setVisual(prev => (prev.engine === v.engine && prev.index === v.index ? prev : v));

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

  // Report the active visual up to the player (for the on-canvas badge).
  useEffect(() => {
    if (authoredActive) {
      infoCb.current?.({ index: 0, count: 0, name: authored!.name, authored: true });
    } else {
      infoCb.current?.({ index: 0, count: 0, name: `${engLabel(visual.engine)} · ${fxPresetName(visual.engine, visual.index, mdNamesRef.current)}`, authored: false });
    }
  }, [visual, authoredActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // The intelligent, energy-aware advance loop. Auto-Show only.
  useEffect(() => {
    if (authoredActive || !analyser || !isPlaying) return;
    const sampler = new AudioDriverSampler();
    let raf = 0;
    let lastSwitch = (typeof performance !== 'undefined' ? performance.now() : 0);
    lastSwitch += 1500; // ease in
    let energy = 0;

    const tick = (now: number) => {
      sampler.update(analyser, now);
      // Section energy: sub-bass + drum density, smoothed so it tracks the arc, not one frame.
      const inst = clamp01(0.6 * sampler.intensity + 0.7 * sampler.density);
      const prev = energy;
      energy = prev * 0.88 + inst * 0.12;

      const bpm = Math.min(200, Math.max(70, sampler.bpm || 120));
      const beatMs = 60000 / bpm;
      const grooveGap = beatMs * 16;
      // Higher energy → cut faster (shorter gap, lower floor); calm sections hold longer.
      const dynamicGap = Math.max(1800, grooveGap * (1 - 0.85 * Math.max(sampler.density, energy)));

      const drop = energy > 0.72 && energy - prev > 0.10 && now - lastSwitch > 900; // punch on the drop
      const beatSwitch = (sampler.isKick || sampler.isSnare) && now - lastSwitch > dynamicGap;
      const idleSwitch = now - lastSwitch > grooveGap * 2.5;

      if (drop) { lastSwitch = now; applyVisual(pickByEnergy(Math.max(energy, 0.85))); }
      else if (beatSwitch || idleSwitch) { lastSwitch = now; applyVisual(pickByEnergy(energy)); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, isPlaying, authoredActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      {authoredActive
        ? <LayerStack layers={authored!.layers} config={authored!.config} analyser={analyser} isPlaying={isPlaying} />
        : <FxStageVisualizers engine={visual.engine} presetIndex={visual.index} analyser={analyser} isPlaying={isPlaying} />}
    </div>
  );
};

export default MixPixelsStage;
