// MixPixelsStage — the Pixels visual for a Chora Mix (and Share-in-Show-Mode's FX stage).
//
// Two modes (per Album.mixMeta.visualMode):
//  • AUTO (default): the intelligent, ENERGY-AWARE auto-show. It listens through the shared
//    analyser and advances ONE visual at a time — never composited — switching on the music.
//    It draws from the WHOLE Plajah Pixels library: the canvas GENERATORS, the full Signature
//    shader library (every SHADER), and MILKDROP presets, weighted by the section's energy: calm
//    passages lean on the gentler generators, the mids bring in shaders, drops punch in shaders/
//    milkdrops. A real drop forces an immediate high-impact hit.
//  • AUTHORED: the artist attached a saved Plajah Pixels project (mixMeta.pixelsProjectId).
//    We load that cloud project and play back its full layer matrix via LayerStack. Any load
//    failure falls back to the auto-show so the canvas is never dead.
//
// NEVER BLACK. A visual that can't run (shader compile/link error on this GPU, WebGL2
// unavailable, a lost context) reports up and is skipped at once — the stage moves to the next
// visual instead of sitting on a dead canvas. Pick-a-generator is the floor: canvas 2D always runs.
// (History: a 2026-10-03 checkpoint quietly cut this back to generators only, so no shader ever
// appeared in Mixes or Show Mode. The context-leak that once blacked out the port is fixed in
// ShaderLayer/ButterchurnLayer, which release their GL context on unmount.)
//
// Intentional, wanted motion: this does NOT freeze under prefers-reduced-motion. It only reacts.

import React, { useEffect, useRef, useState } from 'react';
import FxStageVisualizers, { FX_ENGINE_PRESETS, fxPresetName, loadMilkdropNames, loadShaderNames, type FxEngine } from './FxStageVisualizers';
import { AudioDriverSampler } from './plajahPixels/engine/audioDrivers';
import LayerStack from './plajahPixels/components/LayerStack';
import { loadCloudProject } from './plajahPixels/services/projectService';
import type { VisualizationConfig } from './plajahPixels/types';
import type { LauncherLayer } from './plajahPixels/components/ClipLauncher';

const GEN_COUNT = FX_ENGINE_PRESETS.GENERATOR.length; // the canvas generators
// Shaders and milkdrops load on demand, so their counts are read at runtime (a module-load read
// of the shader count is 0 and once pinned Mixes to shader 0 forever).

type Visual = { engine: FxEngine; index: number };

export interface MixPixelsInfo {
  index: number;
  count: number;
  name: string;       // "Gen · Nebula" / "Shader · Hypergate" / "MilkDrop · <preset>", or the project name
  authored: boolean;
}

interface MixPixelsStageProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualMode?: 'AUTO' | 'AUTHORED';
  pixelsProjectId?: string;
  ownerId?: string;
  onGeneratorChange?: (info: MixPixelsInfo) => void;
  /** Restrict the auto-show to these engines (default: all three). */
  engines?: FxEngine[];
  className?: string;
}

const engLabel = (e: FxEngine) => (e === 'GENERATOR' ? 'Gen' : e === 'SHADER' ? 'Shader' : 'MilkDrop');
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Never cut faster than this — each WebGL switch costs a context; a strobe of them helps no one. */
const MIN_HOLD_MS = 5000;

const MixPixelsStage: React.FC<MixPixelsStageProps> = ({
  analyser, isPlaying, visualMode = 'AUTO', pixelsProjectId, ownerId, onGeneratorChange, engines, className,
}) => {
  const [visual, setVisual] = useState<Visual>(() => ({ engine: 'GENERATOR', index: Math.floor(Math.random() * GEN_COUNT) }));
  const infoCb = useRef(onGeneratorChange);
  infoCb.current = onGeneratorChange;
  const allow = useRef<Set<FxEngine>>(new Set(engines ?? ['GENERATOR', 'SHADER', 'MILKDROP']));
  allow.current = new Set(engines ?? ['GENERATOR', 'SHADER', 'MILKDROP']);

  const [mdNames, setMdNames] = useState<string[]>([]);
  const mdNamesRef = useRef<string[]>([]);
  mdNamesRef.current = mdNames;
  const [shaderNames, setShaderNames] = useState<string[]>([]);
  const shaderNamesRef = useRef<string[]>([]);
  shaderNamesRef.current = shaderNames;
  useEffect(() => {
    let alive = true;
    loadMilkdropNames().then(n => { if (alive) setMdNames(n || []); }).catch(() => {});
    loadShaderNames().then(n => { if (alive) setShaderNames(n || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Visuals that failed on THIS device (bad compile, no WebGL2…) are never picked again this session.
  const broken = useRef<Set<string>>(new Set());
  const keyOf = (v: Visual) => `${v.engine}:${v.index}`;

  // Shuffled per-engine cursors so every generator and every shader gets its turn over a set.
  const genOrder = useRef<number[]>([]);
  const genCur = useRef(0);
  const shaderOrder = useRef<number[]>([]);
  const shaderCur = useRef(0);
  const shuffled = (n: number) => {
    const o = Array.from({ length: n }, (_, i) => i);
    for (let k = o.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; }
    return o;
  };
  const nextGen = (): Visual => {
    for (let tries = 0; tries < GEN_COUNT * 2; tries++) {
      if (genCur.current >= genOrder.current.length) { genOrder.current = shuffled(GEN_COUNT); genCur.current = 0; }
      const v: Visual = { engine: 'GENERATOR', index: genOrder.current[genCur.current++] };
      if (!broken.current.has(keyOf(v))) return v;
    }
    return { engine: 'GENERATOR', index: 0 };
  };
  const nextShader = (): Visual | null => {
    const n = shaderNamesRef.current.length;
    if (!n || !allow.current.has('SHADER')) return null;
    for (let tries = 0; tries < n; tries++) {
      if (shaderOrder.current.length !== n || shaderCur.current >= n) { shaderOrder.current = shuffled(n); shaderCur.current = 0; }
      const v: Visual = { engine: 'SHADER', index: shaderOrder.current[shaderCur.current++] };
      if (!broken.current.has(keyOf(v))) return v;
    }
    return null;
  };
  const nextMilkdrop = (): Visual | null => {
    const n = mdNamesRef.current.length;
    if (!n || !allow.current.has('MILKDROP') || broken.current.has('MILKDROP:*')) return null;
    return { engine: 'MILKDROP', index: Math.floor(Math.random() * n) };
  };
  // Energy e (0..1): low = mostly generators, high = shaders + milkdrops (milkdrops ~e², so they read as drop hits).
  const pickByEnergy = (e: number): Visual => {
    const genW = allow.current.has('GENERATOR') ? 1 - 0.55 * e : 0;
    const shaderW = shaderNamesRef.current.length && allow.current.has('SHADER') ? 0.45 + 0.6 * e : 0;
    const mdW = mdNamesRef.current.length && allow.current.has('MILKDROP') ? e * e * 1.4 : 0;
    let r = Math.random() * (genW + shaderW + mdW || 1);
    if ((r -= genW) < 0) return nextGen();
    if ((r -= shaderW) < 0) return nextShader() ?? nextGen();
    return nextMilkdrop() ?? nextShader() ?? nextGen();
  };
  const applyVisual = (v: Visual) => setVisual(prev => (prev.engine === v.engine && prev.index === v.index ? prev : v));
  const pickRef = useRef(pickByEnergy);
  pickRef.current = pickByEnergy;
  const lastSwitchRef = useRef(0);

  // A visual that can't run on this device → mark it and move on immediately.
  const skipBroken = (why: string) => {
    setVisual(cur => {
      broken.current.add(keyOf(cur));
      if (cur.engine === 'MILKDROP' && /webgl|context/i.test(why)) broken.current.add('MILKDROP:*');
      if (cur.engine === 'SHADER' && /webgl2 unavailable/i.test(why)) allow.current.delete('SHADER');
      lastSwitchRef.current = performance.now();
      const next = pickRef.current(0.5);
      return next.engine === cur.engine && next.index === cur.index ? nextGen() : next;
    });
  };

  // Lost GL contexts (GPU reset, tab memory pressure) arrive as non-bubbling canvas events; a
  // capture listener on the wrapper still sees them.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const onLost = () => skipBroken('context lost');
    el.addEventListener('webglcontextlost', onLost, true);
    return () => el.removeEventListener('webglcontextlost', onLost, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Each async engine has its OWN name pool — passing the milkdrop list for a shader
      // would label the visual with an unrelated preset name.
      const names = visual.engine === 'MILKDROP' ? mdNamesRef.current
        : visual.engine === 'SHADER' ? shaderNamesRef.current
        : undefined;
      infoCb.current?.({ index: visual.index, count: 0, name: `${engLabel(visual.engine)} · ${fxPresetName(visual.engine, visual.index, names)}`, authored: false });
    }
  }, [visual, authoredActive, mdNames, shaderNames]); // eslint-disable-line react-hooks/exhaustive-deps

  // The energy-aware advance loop. Auto-Show only.
  useEffect(() => {
    if (authoredActive || !analyser || !isPlaying) return;
    const sampler = new AudioDriverSampler();
    let raf = 0;
    lastSwitchRef.current = performance.now() + 1500; // ease in
    let energy = 0;

    const tick = (now: number) => {
      sampler.update(analyser, now);
      // Section energy: sub-bass + drum density, smoothed so it tracks the arc, not one frame.
      const inst = clamp01(0.6 * sampler.intensity + 0.7 * sampler.density);
      const prev = energy;
      energy = prev * 0.88 + inst * 0.12;

      const bpm = Math.min(200, Math.max(70, sampler.bpm || 120));
      const beatMs = 60000 / bpm;
      const grooveGap = beatMs * 32;                         // ~16 s at 120 bpm
      // Higher energy → cut faster; calm sections hold longer.
      const dynamicGap = Math.max(MIN_HOLD_MS * 1.6, grooveGap * (1 - 0.6 * Math.max(sampler.density, energy)));
      const since = now - lastSwitchRef.current;

      const drop = energy > 0.72 && energy - prev > 0.10 && since > MIN_HOLD_MS;
      const beatSwitch = (sampler.isKick || sampler.isSnare) && since > dynamicGap;
      const idleSwitch = since > grooveGap * 2;

      if (drop) { lastSwitchRef.current = now; applyVisual(pickRef.current(Math.max(energy, 0.85))); }
      else if (beatSwitch || idleSwitch) { lastSwitchRef.current = now; applyVisual(pickRef.current(energy)); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyser, isPlaying, authoredActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      {authoredActive
        ? <LayerStack layers={authored!.layers} config={authored!.config} analyser={analyser} isPlaying={isPlaying} />
        : <FxStageVisualizers engine={visual.engine} presetIndex={visual.index} analyser={analyser} isPlaying={isPlaying} onVisualError={skipBroken} />}
    </div>
  );
};

export default MixPixelsStage;
