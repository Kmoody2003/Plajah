// MixPixelsStage — the Pixels visual for a Chora Mix.
//
// Two modes (per Album.mixMeta.visualMode):
//  • AUTO (default): the intelligent auto-show. It listens to the mix through the shared
//    analyser and advances ONE visual at a time — never composited — switching on the music
//    (kick/snare transients, density-scaled) like a VJ flipping a channel. It draws from the
//    WHOLE Plajah Pixels library: every canvas GENERATOR, every bundled SHADER, and a rotating
//    set of MILKDROP presets — a shuffled deck so all of them get their moment.
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
const MD_PER_DECK = 10;                                  // how many milkdrop presets to rotate per deck

type Visual = { engine: FxEngine; index: number };

export interface MixPixelsInfo {
  index: number;      // position in the current deck
  count: number;      // deck length
  name: string;       // "Gen · Nebula" / "Shader · Aurora Rings" / "MilkDrop · <preset>", or the project name
  authored: boolean;  // true when playing an artist-defined show
}

interface MixPixelsStageProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualMode?: 'AUTO' | 'AUTHORED';
  pixelsProjectId?: string;
  /** Author of the mix — the project lives at users/{ownerId}/plajahProjects/{pixelsProjectId}. */
  ownerId?: string;
  onGeneratorChange?: (info: MixPixelsInfo) => void;
  className?: string;
}

const engLabel = (e: FxEngine) => (e === 'GENERATOR' ? 'Gen' : e === 'SHADER' ? 'Shader' : 'MilkDrop');

const MixPixelsStage: React.FC<MixPixelsStageProps> = ({
  analyser, isPlaying, visualMode = 'AUTO', pixelsProjectId, ownerId, onGeneratorChange, className,
}) => {
  const [visual, setVisual] = useState<Visual>(() => ({ engine: 'GENERATOR', index: Math.floor(Math.random() * GEN_COUNT) }));
  const infoCb = useRef(onGeneratorChange);
  infoCb.current = onGeneratorChange;

  // Full butterchurn preset list (async, big). Held in a ref so the advance loop always sees it.
  const [mdNames, setMdNames] = useState<string[]>([]);
  const mdNamesRef = useRef<string[]>([]);
  mdNamesRef.current = mdNames;
  useEffect(() => {
    let alive = true;
    loadMilkdropNames().then(n => { if (alive) setMdNames(n || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // The deck: every generator + every shader (twice, so the small set recurs) + a fresh random
  // handful of milkdrops, all shuffled. Rebuilt (with new milkdrops) each time it's exhausted.
  const deckRef = useRef<Visual[]>([]);
  const posRef = useRef(0);
  const buildDeck = (): Visual[] => {
    const deck: Visual[] = [];
    for (let i = 0; i < GEN_COUNT; i++) deck.push({ engine: 'GENERATOR', index: i });
    for (let r = 0; r < 2; r++) for (let i = 0; i < SHADER_COUNT; i++) deck.push({ engine: 'SHADER', index: i });
    const mdN = mdNamesRef.current.length;
    if (mdN > 0) {
      const want = Math.min(MD_PER_DECK, mdN);
      const used = new Set<number>();
      let guard = 0;
      while (used.size < want && guard++ < want * 8) {
        const idx = Math.floor(Math.random() * mdN);
        if (!used.has(idx)) { used.add(idx); deck.push({ engine: 'MILKDROP', index: idx }); }
      }
    }
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [deck[k], deck[j]] = [deck[j], deck[k]]; }
    return deck;
  };

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
      infoCb.current?.({
        index: posRef.current,
        count: deckRef.current.length,
        name: `${engLabel(visual.engine)} · ${fxPresetName(visual.engine, visual.index, mdNamesRef.current)}`,
        authored: false,
      });
    }
  }, [visual, authoredActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // The intelligent advance loop — a VJ that switches visuals on the music. Auto-Show only.
  useEffect(() => {
    if (authoredActive || !analyser || !isPlaying) return;
    const sampler = new AudioDriverSampler();
    let raf = 0;
    let lastSwitch = (typeof performance !== 'undefined' ? performance.now() : 0);
    lastSwitch += 1500; // ease in

    const advance = () => {
      let deck = deckRef.current;
      if (deck.length === 0 || posRef.current >= deck.length) {
        deck = buildDeck(); deckRef.current = deck; posRef.current = 0;
      }
      const next = deck[posRef.current] || { engine: 'GENERATOR' as FxEngine, index: 0 };
      posRef.current += 1;
      setVisual(next);
    };

    const tick = (now: number) => {
      sampler.update(analyser, now);
      const bpm = Math.min(200, Math.max(70, sampler.bpm || 120));
      const beatMs = 60000 / bpm;
      const grooveGap = beatMs * 16;
      const dynamicGap = Math.max(2400, grooveGap * (1 - sampler.density * 0.85));
      const hitSwitch = (sampler.isKick || sampler.isSnare) && now - lastSwitch > dynamicGap;
      const idleSwitch = now - lastSwitch > grooveGap * 2.5;
      if (hitSwitch || idleSwitch) { lastSwitch = now; advance(); }
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
