
export enum VisualizerMode {
  Spectrum = 'SPECTRUM',
  Waveform = 'WAVEFORM',
  Particles = 'PARTICLES',
  Nebula = 'NEBULA',
  Storm = 'STORM',
  Stage = 'STAGE',
  Luminance = 'LUMINANCE',
  Tunnel = 'TUNNEL',
  Vortex = 'VORTEX',
  Liquid = 'LIQUID',
  Kaleidoscope = 'KALEIDOSCOPE',
  Cosmic = 'COSMIC',
  RetroGrid = 'RETROGRID',

  // ─── Studio engine scenes (Canvas2D + WebGL) ───
  AuroraDrift = 'STUDIO_AURORA',
  LiquidChrome = 'STUDIO_CHROME',
  BauhausPop = 'STUDIO_BAUHAUS',
  ParticleNebula = 'STUDIO_NEBULA',
  GravityWells = 'STUDIO_GRAVITY',
  KineticMirror = 'STUDIO_KINETIC',
  RippleField = 'STUDIO_RIPPLE',
  PlasmaFluid = 'STUDIO_PLASMA',
  RaymarchField = 'STUDIO_RAYMARCH'
}

/** Studio scene id (engine-side) ↔ VisualizerMode mapping. */
export const STUDIO_SCENE_TO_MODE: Record<string, VisualizerMode> = {
  aurora: VisualizerMode.AuroraDrift,
  chrome: VisualizerMode.LiquidChrome,
  bauhaus: VisualizerMode.BauhausPop,
  nebula: VisualizerMode.ParticleNebula,
  gravity: VisualizerMode.GravityWells,
  kinetic: VisualizerMode.KineticMirror,
  ripple: VisualizerMode.RippleField,
  plasma: VisualizerMode.PlasmaFluid,
  raymarch: VisualizerMode.RaymarchField,
};
export const MODE_TO_STUDIO_SCENE: Record<string, string> =
  Object.fromEntries(Object.entries(STUDIO_SCENE_TO_MODE).map(([k, v]) => [v, k]));

export function isStudioMode(mode: VisualizerMode): boolean {
  return mode in MODE_TO_STUDIO_SCENE;
}

export type BlendMode = 'normal' | 'screen' | 'overlay' | 'difference' | 'lighten' | 'color-dodge' | 'hard-light' | 'multiply' | 'darken' | 'exclusion';

export interface BackgroundMedia {
    url: string;
    type: 'image' | 'video';
    id: string;
}

export interface Emitter {
    id: string;
    x: number;
    y: number;
}

export interface VisualizationConfig {
  name: string;
  mode: VisualizerMode;
  targetFrameRate: 30 | 60;
  colorPalette: string[];
  smoothingTimeConstant: number;
  minDecibels: number;
  maxDecibels: number;
  fftSize: number;
  sensitivity: number;
  glowIntensity: number;
  speed: number;
  enableBlur: boolean;
  blurStrength: number;
  blendMode: BlendMode;
  backgroundOpacity: number;
  backgroundPulseIntensity: number;
  enableBackgroundRotation: boolean;
  backgroundRotationInterval: number;
  enableParallax: boolean;
  enableMosaic: boolean;
  mosaicIntensity: number;
  mosaicShiftIntensity: number;
  
  enableLayer2: boolean;
  layer2Opacity: number;
  layer2BlendMode: BlendMode;

  particleCount: number;
  particleLifespan: number;
  particleTurbulence: number;
  particleGlow: number;
  emitters: Emitter[];

  enableSlicing: boolean;
  sliceCount: number;
  sliceRotation: number;
  enableSliceShadow: boolean;
  enableSliceAutomation: boolean;
  sliceAutomationInterval: number;
  enableLighting: boolean;
  lightingIntensity: number;
  enableBeams: boolean;
  lightColor: string;

  enableBassShake: boolean;
  bassShakeIntensity: number;
  bassShakeInterval: number;

  luminanceThreshold: number;
  lumBassBrightness: number;
  lumMidColorCycle: number;
  lumTrebleFlicker: number;

  enableText: boolean;
  textContent: string;
  textColor: string;
  textSize: number;
  textOutline: boolean;
  textShatter: boolean;
  textShatterIntensity: number;

  enableCaptions: boolean;
  enableLiveCaptions: boolean;
  captionsSyncMode: 'beat' | 'lrc';
  captionsText: string;
  captionsSpeed: number;
  captionsSize: number;
  captionsColorShiftIntensity: number;
  captionsSensitivity: number;

  // 12 Post-Processing Effects configuration
  enableChroma?: boolean;
  chromaAmount?: number; // Chromatic aberration
  enableGlitch?: boolean;
  glitchIntensity?: number; // Jitter/glitch
  enableVhs?: boolean;
  vhsIntensity?: number; // Retro scanline distortion
  enableZoomBlur?: boolean;
  zoomBlurIntensity?: number; // Bloom/zoom radial blur
  enableInvertStrobe?: boolean; // Beats flashing invert colors
  enableNoise?: boolean;
  noiseIntensity?: number; // Film grain
  enableThermal?: boolean; // Color mapping thermal infrared
  enableWaveWarp?: boolean;
  waveWarpIntensity?: number; // Sine wave layout distortion
  enableNeon?: boolean;
  neonContourIntensity?: number; // Neon border high-pass edges
  enableMirror?: boolean;
  mirrorCount?: number; // Vertical, Horizontal or Quad reflections
  
  // Lyrics drive visual toggle
  enableLyricsVisualDrive?: boolean;
  lyricsDriveStrength?: number;

  // Music & Oscillator Driven Blending Configuration
  enableL2BlendDrive?: boolean;
  l2OscillatorType?: 'sine' | 'square' | 'triangle' | 'sawtooth';
  l2OscillatorFreq?: number; // Speed of oscillation
  l2OscillatorMusicMod?: number; // Intensity of music level modulating oscillator speed
  l2MusicDriveRange?: 'bass' | 'mids' | 'treble' | 'overall';
  l2MusicDriveStrength?: number; // How much music directly boosts layer 2 mix
  l2MusicDriveMode?: 'opacity' | 'crossover'; // L2 opacity vs L1/L2 Crossover
  
  // Compositing Music Drive (dynamic blending modes based on audio intensity)
  l2CompMusicDrive?: boolean;
  l2CompMusicRange?: 'bass' | 'mids' | 'treble' | 'overall';
  l2CompDriveThreshold?: number; // Threshold above which blend mode changes or intensifies

  // On-Beat / Bar Background Rotation Cycle
  enableRotationOnBeat?: boolean;
  rotationBeatBars?: 2 | 4 | 8 | 12 | 16;
  rotationMusicGovern?: boolean; // If true, music peak intensity accelerates or triggers cycle

  // ─── Studio engine bridge ───
  /** trail/persistence amount for studio scenes (0 = crisp, 0.95 = long smear) */
  studioTrail?: number;
  /** kaleidoscope/mirror toggle for studio scenes */
  studioMirror?: boolean;
  /** beat-flash overlay for studio scenes */
  studioFlash?: boolean;
}

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

// ─── Plajah Pixels Project File Format ───────────────────────────────────────

export interface PlajahMediaRef {
  id: string;
  type: 'image' | 'video';
  /** Original filename when uploaded, or URL for remote assets */
  name: string;
  /** If remote/unsplash/mixkit URL, stored directly; if local upload, stored as data-URL or filename */
  url: string;
  isRemote: boolean;
}

export interface PlajahProject {
  /** Format identifier */
  __format: 'plajah-pixels';
  /** Semver for forward-compat */
  version: string;
  /** Human-readable project name */
  projectName: string;
  /** ISO timestamp of last save */
  savedAt: string;
  /** Full visualization config snapshot */
  config: VisualizationConfig;
  /** Layer 1 background media references */
  bgMedia1: PlajahMediaRef[];
  /** Layer 2 overlay media references */
  bgMedia2: PlajahMediaRef[];
  /** Optional: name of last loaded audio file (not the file itself) */
  audioFileName?: string;
}
