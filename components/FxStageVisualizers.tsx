// FxStageVisualizers — exposes Plajah Pixels' three visual engines (MilkDrops,
// Shaders, Generators) as no-parameter, audio-reactive visualizers for the album
// view's FX Stage. Each just reacts to the shared analyser; the full parametric
// experience lives in Plajah Pixels itself (reachable via the PP button).
//
// Each engine carries a list of PRESETS the FX Stage can arrow through. The heavy
// engine components are lazy-loaded so they never weigh down the player bundle.

import React, { Suspense, useMemo } from 'react';
import { VisualizerMode, type VisualizationConfig } from './plajahPixels/types';

const ButterchurnLayer = React.lazy(() => import('./plajahPixels/components/ButterchurnLayer'));
const ShaderLayer = React.lazy(() => import('./plajahPixels/components/ShaderLayer'));
const AudioVisualizer = React.lazy(() => import('./plajahPixels/components/AudioVisualizer'));

export type FxEngine = 'MILKDROP' | 'SHADER' | 'GENERATOR';

// ── Shader presets (Shadertoy-style, audio-reactive via iChannel0 + iBass/iMid/iTreble/iLevel) ──
const SHADERS: { name: string; source: string }[] = [
  { name: 'Aurora Rings', source: `
    void mainImage(out vec4 O, in vec2 F){
      vec2 R=iResolution.xy; vec2 uv=(F-0.5*R)/R.y;
      float t=iTime*0.25+iBass*2.2; float r=length(uv); float a=atan(uv.y,uv.x);
      float fft=texture(iChannel0,vec2(clamp(r*0.5,0.0,1.0),0.0)).x;
      float v=sin(r*9.0-t*3.0+a*3.0+fft*9.0)+0.5*sin(a*6.0+t*2.0);
      vec3 c=0.5+0.5*cos(vec3(0.0,2.0,4.0)+v*2.0+iMid*3.0+iTime*0.18);
      c*=0.55+0.9*iLevel; c+=iTreble*0.45*vec3(0.3,0.6,1.0)*smoothstep(0.45,0.0,r);
      O=vec4(c,1.0);
    }` },
  { name: 'Plasma Flow', source: `
    void mainImage(out vec4 O, in vec2 F){
      vec2 R=iResolution.xy; vec2 p=(F-0.5*R)/R.y;
      float t=iTime*0.5+iBass*3.0;
      float v=sin(p.x*6.0+t)+sin(p.y*6.0+t*1.2)+sin((p.x+p.y)*5.0+t*0.8)+sin(length(p)*8.0-t*2.0+iMid*6.0);
      vec3 c=0.5+0.5*cos(vec3(0.0,2.1,4.2)+v+iTime*0.2);
      c*=0.6+0.8*iLevel; O=vec4(c,1.0);
    }` },
  { name: 'Bass Tunnel', source: `
    void mainImage(out vec4 O, in vec2 F){
      vec2 R=iResolution.xy; vec2 uv=(F-0.5*R)/R.y;
      float a=atan(uv.y,uv.x); float r=length(uv);
      float depth=0.35/(r+0.05)+iTime*0.6+iBass*2.0;
      float rings=0.5+0.5*sin(depth*8.0+iMid*8.0);
      float spokes=0.5+0.5*sin(a*8.0+iTime);
      vec3 c=mix(vec3(0.42,0.0,0.6),vec3(1.0,0.55,0.0),rings)*spokes;
      c*=smoothstep(0.0,0.25,r)*(0.6+0.9*iLevel)+iTreble*0.3;
      O=vec4(c,1.0);
    }` },
];

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
  SHADER: SHADERS.map(s => s.name),
  GENERATOR: GEN_MODES.map(g => g.name),
};

export function fxPresetName(engine: FxEngine, index: number, milkdropNames?: string[]): string {
  const list = engine === 'MILKDROP' ? (milkdropNames || []) : FX_ENGINE_PRESETS[engine];
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
  const shader = SHADERS[((presetIndex % SHADERS.length) + SHADERS.length) % SHADERS.length];
  const genMode = GEN_MODES[((presetIndex % GEN_MODES.length) + GEN_MODES.length) % GEN_MODES.length];
  const genConfig = useMemo<VisualizationConfig>(() => ({ ...BASE_CONFIG, mode: genMode.mode }), [genMode.mode]);

  if (!analyser) return <Loading />;

  return (
    <Suspense fallback={<Loading />}>
      {engine === 'MILKDROP' && <ButterchurnLayer analyser={analyser} presetIndex={presetIndex} />}
      {engine === 'SHADER' && <ShaderLayer key={shader.name} analyser={analyser} source={shader.source} startTimeMs={startTimeMs} />}
      {engine === 'GENERATOR' && (
        <AudioVisualizer analyser={analyser} config={genConfig} isPlaying={isPlaying} hasBackground={false} />
      )}
    </Suspense>
  );
}
