// FxStageVisualizers — exposes Plajah Pixels' three visual engines (MilkDrops,
// Shaders, Generators) as no-parameter, audio-reactive visualizers for the album
// view's FX Stage. Each just reacts to the shared analyser; the full parametric
// experience lives in Plajah Pixels itself (reachable via the PP button).
//
// Each engine carries a list of PRESETS the FX Stage can arrow through. The heavy
// engine components are lazy-loaded so they never weigh down the player bundle.

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { VisualizerMode, type VisualizationConfig } from './plajahPixels/types';
import { getPlatformInfo } from '../hooks/usePlatform';

const ButterchurnLayer = React.lazy(() => import('./plajahPixels/components/ButterchurnLayer'));
const ShaderLayer = React.lazy(() => import('./plajahPixels/components/ShaderLayer'));
const AudioVisualizer = React.lazy(() => import('./plajahPixels/components/AudioVisualizer'));

export type FxEngine = 'MILKDROP' | 'SHADER' | 'GENERATOR';

// ── Shaders: the Plajah Pixels SIGNATURE SERIES ──
// The FX Stage shows the same house set the VJ studio does — one library, not a private
// copy. (It used to carry three shaders written inline here, which is why none of the
// Signature works ever appeared in Chora.) The library is ~300KB of GLSL, so it is
// dynamically imported on first use rather than riding in the player bundle, exactly like
// the butterchurn presets below.
export type FxShader = { name: string; source: string; params: number[] };
let _shaders: FxShader[] | null = null;
let _shadersPromise: Promise<FxShader[]> | null = null;

export async function loadSignatureShaders(): Promise<FxShader[]> {
  if (_shaders) return _shaders;
  if (_shadersPromise) return _shadersPromise;
  _shadersPromise = (async () => {
    let built: FxShader[] = [];
    try {
      const mod: any = await import('./plajahPixels/engine/presets/signatureShaders');
      const works: any[] = mod.SIGNATURE_WORKS || [];
      // Series V (kit3d) are full SDF raymarchers at 72–104 steps per pixel. Great on a
      // desktop GPU, far too heavy for a TV box — and the TV FX surface shares this list.
      const allowHeavy = !getPlatformInfo().isTV;
      built = works
        .filter(w => allowHeavy || !w.kit3d)
        .map(w => ({
          name: w.name,
          source: mod.signatureSource(w),
          // Each work ships its own tuned defaults; without them the whole set renders at
          // a flat 0.5 and reads nothing like the intended look.
          params: [0, 1, 2, 3].map(i => w.params?.[i]?.def ?? 0.5),
        }));
    } catch (e) {
      console.warn('[Plajah Pixels] Signature shader library failed to load:', e);
    }
    _shaders = built;
    FX_ENGINE_PRESETS.SHADER = built.map(s => s.name);
    return built;
  })();
  return _shadersPromise;
}

/** Preset-name list for the Shaders dropdown (mirrors loadMilkdropNames). */
export async function loadShaderNames(): Promise<string[]> {
  return (await loadSignatureShaders()).map(s => s.name);
}

// ── Generator presets — every Plajah Pixels scene, chrome stripped ──
const GEN_MODES: { name: string; mode: VisualizerMode }[] = [
  { name: 'Nebula', mode: VisualizerMode.Nebula }, { name: 'Vortex', mode: VisualizerMode.Vortex },
  { name: 'Liquid', mode: VisualizerMode.Liquid }, { name: 'Storm', mode: VisualizerMode.Storm },
  { name: 'Kaleidoscope', mode: VisualizerMode.Kaleidoscope }, { name: 'Cosmic', mode: VisualizerMode.Cosmic },
  { name: 'Tunnel', mode: VisualizerMode.Tunnel }, { name: 'Spectrum', mode: VisualizerMode.Spectrum },
  { name: 'Waveform', mode: VisualizerMode.Waveform }, { name: 'Particles', mode: VisualizerMode.Particles },
  { name: 'Stage', mode: VisualizerMode.Stage }, { name: 'Luminance', mode: VisualizerMode.Luminance },
  { name: 'Retro Grid', mode: VisualizerMode.RetroGrid },
  { name: 'Aurora Drift', mode: VisualizerMode.AuroraDrift }, { name: 'Liquid Chrome', mode: VisualizerMode.LiquidChrome },
  { name: 'Bauhaus Pop', mode: VisualizerMode.BauhausPop }, { name: 'Particle Nebula', mode: VisualizerMode.ParticleNebula },
  { name: 'Gravity Wells', mode: VisualizerMode.GravityWells }, { name: 'Kinetic Mirror', mode: VisualizerMode.KineticMirror },
  { name: 'Ripple Field', mode: VisualizerMode.RippleField }, { name: 'Plasma Fluid', mode: VisualizerMode.PlasmaFluid },
  { name: 'Raymarch Field', mode: VisualizerMode.RaymarchField },
];

// Lazily load the FULL butterchurn preset name list for the MilkDrops dropdown.
let _milkdropNames: string[] | null = null;
export async function loadMilkdropNames(): Promise<string[]> {
  if (_milkdropNames) return _milkdropNames;
  try {
    const mod: any = await import('butterchurn-presets');
    const api: any = mod.default || mod;
    const presets = api.getPresets ? api.getPresets() : api;
    _milkdropNames = Object.keys(presets || {});
  } catch { _milkdropNames = []; }
  return _milkdropNames;
}

// Preset-list metadata the selector uses to label. MilkDrops is loaded async (above).
export const FX_ENGINE_PRESETS: Record<FxEngine, string[]> = {
  MILKDROP: [], // filled at runtime via loadMilkdropNames()
  SHADER: [],   // filled at runtime via loadSignatureShaders()
  GENERATOR: GEN_MODES.map(g => g.name),
};

/** `names` supplies the runtime list for the async engines (MilkDrops, Shaders); the
 *  already-loaded FX_ENGINE_PRESETS entry is used when a caller doesn't hold one. */
export function fxPresetName(engine: FxEngine, index: number, names?: string[]): string {
  const list = names?.length ? names : FX_ENGINE_PRESETS[engine];
  if (!list.length) return `Preset ${index + 1}`;
  return list[((index % list.length) + list.length) % list.length];
}

const BASE_CONFIG: VisualizationConfig = {
  name: 'FX Stage', mode: VisualizerMode.Nebula, targetFrameRate: 60,
  gpuGenerators: false, unifyOverlays: false, workerCompositor: false,
  gradeBrightness: 1, gradeContrast: 1, gradeSaturation: 1, gradeGamma: 1,
  colorPalette: ['#FF00CC', '#3333FF', '#00CCFF', '#FFFFFF'],
  smoothingTimeConstant: 0.8, minDecibels: -90, maxDecibels: -10, fftSize: 2048,
  sensitivity: 1.5, glowIntensity: 15, speed: 1.0,
  enableBlur: true, blurStrength: 0.8, blendMode: 'screen',
  backgroundOpacity: 1.0, backgroundPulseIntensity: 0.5,
  enableBackgroundRotation: false, backgroundRotationInterval: 4,
  enableParallax: true, enableMosaic: false, mosaicIntensity: 0.5, mosaicShiftIntensity: 0.5,
  enableLayer2: true, layer2Opacity: 0.6, layer2BlendMode: 'screen',
  particleCount: 60, particleLifespan: 1.5, particleTurbulence: 0.5, particleGlow: 10,
  emitters: [{ id: 'center', x: 0.5, y: 0.5 }],
  enableSlicing: false, sliceCount: 6, sliceRotation: 0, enableSliceShadow: false,
  enableSliceAutomation: false, sliceAutomationInterval: 2, sliceRotationBeatPattern: undefined,
  sliceRotationRange: 45, slicePush: 0, slicePushMusicDriven: false, slicePushOscDriven: false,
  enableLighting: true, lightingIntensity: 1.0, enableBeams: true, lightColor: '#FFCC00',
  beamCount: 3, beamStrobeOnBeat: false,
  enable3dDepth: false, depthParallaxIntensity: 0.4, cameraFlyThrough: true, cameraFlySpeed: 1.0,
  enableSegmentation: false, depthLayerGap: 80,
  enableBassShake: false, bassShakeIntensity: 1.0, bassShakeInterval: 4,
  luminanceThreshold: 0.5, lumBassBrightness: 1.0, lumMidColorCycle: 0.5, lumTrebleFlicker: 0.5,
  enableText: false, textContent: '', textColor: '#FFFFFF', textSize: 120, textOutline: true,
  textShatter: false, textShatterIntensity: 1.0, textFont: 'Inter', textGradient: false,
  textGradientColors: ['#FF00CC', '#00CCFF'], textGradientAngle: 0,
  textVowelReactor: false, textVowelEffect: 'glow', textConsonantReactor: false, textConsonantEffect: 'shake',
  textReactorIntensity: 1.0, textPhysics: 'none', textPhysicsIntensity: 1.0,
  enableCaptions: false, enableLiveCaptions: false, captionsSyncMode: 'beat',
  captionsText: '', captionsSpeed: 4, captionsSize: 50, captionsColorShiftIntensity: 1.0, captionsSensitivity: 1.5,
} as VisualizationConfig;

const Loading = () => (
  <div className="w-full h-full grid place-items-center text-white/25 text-[10px] font-black uppercase tracking-widest">
    Loading visualizer…
  </div>
);

export default function FxStageVisualizers({
  engine, presetIndex, analyser, isPlaying,
}: {
  engine: FxEngine;
  presetIndex: number;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}) {
  const startTimeMs = useMemo(() => (typeof performance !== 'undefined' ? performance.now() : 0), [engine, presetIndex]);
  const [shaders, setShaders] = useState<FxShader[]>(() => _shaders || []);
  useEffect(() => {
    if (engine !== 'SHADER' || shaders.length) return;
    let alive = true;
    loadSignatureShaders().then(s => { if (alive) setShaders(s); });
    return () => { alive = false; };
  }, [engine, shaders.length]);
  const shader = shaders.length
    ? shaders[((presetIndex % shaders.length) + shaders.length) % shaders.length]
    : null;
  const genMode = GEN_MODES[((presetIndex % GEN_MODES.length) + GEN_MODES.length) % GEN_MODES.length];
  const genConfig = useMemo<VisualizationConfig>(() => ({ ...BASE_CONFIG, mode: genMode.mode }), [genMode.mode]);

  if (!analyser) return <Loading />;

  return (
    <Suspense fallback={<Loading />}>
      {engine === 'MILKDROP' && <ButterchurnLayer analyser={analyser} presetIndex={presetIndex} />}
      {engine === 'SHADER' && (shader
        ? <ShaderLayer key={shader.name} analyser={analyser} source={shader.source} startTimeMs={startTimeMs} params={shader.params} />
        : <Loading />)}
      {engine === 'GENERATOR' && (
        <AudioVisualizer analyser={analyser} config={genConfig} isPlaying={isPlaying} hasBackground={false} />
      )}
    </Suspense>
  );
}
