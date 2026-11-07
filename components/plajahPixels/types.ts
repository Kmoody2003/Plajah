
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
  /** Log-polar raymarch cavern, expanded from a twigl golf — fully audio-driven. */
  PolarDrift = 'POLAR_DRIFT',

  // ─── Studio engine scenes (Canvas2D + WebGL) ───
  AuroraDrift = 'STUDIO_AURORA',
  LiquidChrome = 'STUDIO_CHROME',
  BauhausPop = 'STUDIO_BAUHAUS',
  ParticleNebula = 'STUDIO_NEBULA',
  GravityWells = 'STUDIO_GRAVITY',
  KineticMirror = 'STUDIO_KINETIC',
  RippleField = 'STUDIO_RIPPLE',
  PlasmaFluid = 'STUDIO_PLASMA',
  RaymarchField = 'STUDIO_RAYMARCH',

  // ─── Flux 3D scenes (three.js real-3D generators — Trapcode Form / Mir) ───
  FluxField = 'FLUX_FIELD',
  FluxTapestry = 'FLUX_TAPESTRY',
  FluxTapestryII = 'FLUX_TAPESTRY_II',
  FluxLattice = 'FLUX_LATTICE',
  FluxTunnel = 'FLUX_TUNNEL',
  FluxAurora = 'FLUX_AURORA',
  FluxSanctum = 'FLUX_SANCTUM',
  PorcelainTide = 'FLUX_PORCELAIN_TIDE',
  VelvetBloom = 'FLUX_VELVET_BLOOM',
  PrismArchive = 'FLUX_PRISM_ARCHIVE',
  DecoMorph = 'FLUX_DECO_MORPH',
  EgyptTemple = 'FLUX_EGYPT_TEMPLE',
  VenetianMaiolica = 'FLUX_VENETIAN_MAIOLICA',
  HellenicMarble = 'FLUX_HELLENIC_MARBLE',
  JapaneseInk = 'FLUX_JAPANESE_INK',
  AfricanBogolan = 'FLUX_AFRICAN_BOGOLAN',
  FluxNeonKnot = 'FLUX_MATH_TORUS_KNOT',
  FluxHopfHalo = 'FLUX_MATH_HOPF',
  FluxCliffordDream = 'FLUX_MATH_CLIFFORD',
  FluxSuperformulaBloom = 'FLUX_MATH_SUPERFORMULA',
  FluxKleinMirage = 'FLUX_MATH_KLEIN',
  FluxMobiusRibbon = 'FLUX_MATH_MOBIUS',
  FluxEnneperPortal = 'FLUX_MATH_ENNEPER',
  FluxHarmonicChrysalis = 'FLUX_MATH_HARMONIC',
  FluxRhodoneaNebula = 'FLUX_MATH_ROSE',
  FluxHypnoticSpirograph = 'FLUX_MATH_HYPOTROCHOID',
  FluxChladniCathedral = 'FLUX_MATH_CHLADNI',
  FluxRecursiveSilk = 'FLUX_MATH_DOMAIN_WARP',
  FluxMathematicalOdyssey = 'FLUX_MATH_MORPH',
  // Flux Canvas — still images brought to life (services/fabula/fluxCanvasCatalog.ts): directed, 2.5D, 3D
  FluxCanvasEmberBark = 'FLUX_CANVAS_EMBER_BARK',
  FluxCanvasEmberBarkPlate = 'FLUX_CANVAS_EMBER_BARK_PLATE',
  FluxCanvasEmberBarkWorld = 'FLUX_CANVAS_EMBER_BARK_WORLD',
  FluxCanvasPrismSilk = 'FLUX_CANVAS_PRISM_SILK',
  FluxCanvasPrismSilkPlate = 'FLUX_CANVAS_PRISM_SILK_PLATE',
  FluxCanvasPrismSilkWorld = 'FLUX_CANVAS_PRISM_SILK_WORLD',
  FluxCanvasNeonOrbit = 'FLUX_CANVAS_NEON_ORBIT',
  FluxCanvasNeonOrbitPlate = 'FLUX_CANVAS_NEON_ORBIT_PLATE',
  FluxCanvasNeonOrbitWorld = 'FLUX_CANVAS_NEON_ORBIT_WORLD',
  FluxCanvasPastelVeil = 'FLUX_CANVAS_PASTEL_VEIL',
  FluxCanvasPastelVeilPlate = 'FLUX_CANVAS_PASTEL_VEIL_PLATE',
  FluxCanvasPastelVeilWorld = 'FLUX_CANVAS_PASTEL_VEIL_WORLD',
  FluxCanvasVerdantCells = 'FLUX_CANVAS_VERDANT_CELLS',
  FluxCanvasVerdantCellsPlate = 'FLUX_CANVAS_VERDANT_CELLS_PLATE',
  FluxCanvasVerdantCellsWorld = 'FLUX_CANVAS_VERDANT_CELLS_WORLD',
  FluxCanvasWhiteMist = 'FLUX_CANVAS_WHITE_MIST',
  FluxCanvasWhiteMistPlate = 'FLUX_CANVAS_WHITE_MIST_PLATE',
  FluxCanvasWhiteMistWorld = 'FLUX_CANVAS_WHITE_MIST_WORLD',
  FluxCanvasBubbleDrift = 'FLUX_CANVAS_BUBBLE_DRIFT',
  FluxCanvasBubbleDriftPlate = 'FLUX_CANVAS_BUBBLE_DRIFT_PLATE',
  FluxCanvasBubbleDriftWorld = 'FLUX_CANVAS_BUBBLE_DRIFT_WORLD',
  FluxCanvasResinRiver = 'FLUX_CANVAS_RESIN_RIVER',
  FluxCanvasResinRiverPlate = 'FLUX_CANVAS_RESIN_RIVER_PLATE',
  FluxCanvasResinRiverWorld = 'FLUX_CANVAS_RESIN_RIVER_WORLD',
  FluxCanvasFireCrystals = 'FLUX_CANVAS_FIRE_CRYSTALS',
  FluxCanvasFireCrystalsPlate = 'FLUX_CANVAS_FIRE_CRYSTALS_PLATE',
  FluxCanvasFireCrystalsWorld = 'FLUX_CANVAS_FIRE_CRYSTALS_WORLD',
  FluxCanvasTidalGlass = 'FLUX_CANVAS_TIDAL_GLASS',
  FluxCanvasTidalGlassPlate = 'FLUX_CANVAS_TIDAL_GLASS_PLATE',
  FluxCanvasTidalGlassWorld = 'FLUX_CANVAS_TIDAL_GLASS_WORLD',
  FluxCanvasStoneLinen = 'FLUX_CANVAS_STONE_LINEN',
  FluxCanvasStoneLinenPlate = 'FLUX_CANVAS_STONE_LINEN_PLATE',
  FluxCanvasStoneLinenWorld = 'FLUX_CANVAS_STONE_LINEN_WORLD',
  FluxCanvasPeachSatin = 'FLUX_CANVAS_PEACH_SATIN',
  FluxCanvasPeachSatinPlate = 'FLUX_CANVAS_PEACH_SATIN_PLATE',
  FluxCanvasPeachSatinWorld = 'FLUX_CANVAS_PEACH_SATIN_WORLD',

  // ─── Council Masterworks (Milkdrop-Grade Audio-Reactive Generative Shaders) ───
  CouncilOceanLeviathan = 'COUNCIL_OCEAN_LEVIATHAN',
  CouncilKineticChrome = 'COUNCIL_KINETIC_CHROME',
  CouncilVolcanicFire = 'COUNCIL_VOLCANIC_FIRE',
  CouncilAerodynamicWind = 'COUNCIL_AERODYNAMIC_WIND',
  CouncilCrystallineCathedral = 'COUNCIL_CRYSTALLINE_CATHEDRAL',
  CouncilChladniResonator = 'COUNCIL_CHLADNI_RESONATOR',
  CouncilAstralAblation = 'COUNCIL_ASTRAL_ABLATION',
  CouncilBioluminescentAbyss = 'COUNCIL_BIOLUMINESCENT_ABYSS',
  CouncilSolarisOcean = 'COUNCIL_SOLARIS_OCEAN',
  CouncilIonicThunder = 'COUNCIL_IONIC_THUNDER',
  CouncilFrostFracture = 'COUNCIL_FROST_FRACTURE',
  CouncilAuroraChronos = 'COUNCIL_AURORA_CHRONOS',
  // ─── Image-Derived Masterworks (Calm vs Energetic) ───
  CouncilRippleTranquil = 'COUNCIL_RIPPLE_TRANQUIL',
  CouncilRippleEnergetic = 'COUNCIL_RIPPLE_ENERGETIC',
  CouncilSlatTranquil = 'COUNCIL_SLAT_TRANQUIL',
  CouncilSlatEnergetic = 'COUNCIL_SLAT_ENERGETIC',
  CouncilMonolithTranquil = 'COUNCIL_MONOLITH_TRANQUIL',
  CouncilMonolithEnergetic = 'COUNCIL_MONOLITH_ENERGETIC',
  CouncilChevronTranquil = 'COUNCIL_CHEVRON_TRANQUIL',
  CouncilChevronEnergetic = 'COUNCIL_CHEVRON_ENERGETIC',
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

/** VisualizerMode ↔ Flux scene id (three.js real-3D generators, hosted by FluxStage). */
export const MODE_TO_FLUX_SCENE: Record<string, string> = {
  [VisualizerMode.FluxField]: 'field',
  [VisualizerMode.FluxTapestry]: 'tapestry',
  [VisualizerMode.FluxTapestryII]: 'tapestry-ii',
  [VisualizerMode.FluxLattice]: 'lattice',
  [VisualizerMode.FluxTunnel]: 'tunnel',
  [VisualizerMode.FluxAurora]: 'aurora',
  [VisualizerMode.FluxSanctum]: 'sanctum',
  [VisualizerMode.PorcelainTide]: 'porcelain-tide',
  [VisualizerMode.VelvetBloom]: 'velvet-bloom',
  [VisualizerMode.PrismArchive]: 'prism-archive',
  [VisualizerMode.DecoMorph]: 'deco-morph',
  [VisualizerMode.EgyptTemple]: 'egypt-temple',
  [VisualizerMode.VenetianMaiolica]: 'venetian-maiolica',
  [VisualizerMode.HellenicMarble]: 'hellenic-marble',
  [VisualizerMode.JapaneseInk]: 'japanese-ink',
  [VisualizerMode.AfricanBogolan]: 'african-bogolan',
  [VisualizerMode.FluxNeonKnot]: 'math-torus-knot',
  [VisualizerMode.FluxHopfHalo]: 'math-hopf',
  [VisualizerMode.FluxCliffordDream]: 'math-clifford',
  [VisualizerMode.FluxSuperformulaBloom]: 'math-superformula',
  [VisualizerMode.FluxKleinMirage]: 'math-klein',
  [VisualizerMode.FluxMobiusRibbon]: 'math-mobius',
  [VisualizerMode.FluxEnneperPortal]: 'math-enneper',
  [VisualizerMode.FluxHarmonicChrysalis]: 'math-harmonic',
  [VisualizerMode.FluxRhodoneaNebula]: 'math-rose',
  [VisualizerMode.FluxHypnoticSpirograph]: 'math-hypotrochoid',
  [VisualizerMode.FluxChladniCathedral]: 'math-chladni',
  [VisualizerMode.FluxRecursiveSilk]: 'math-domain-warp',
  [VisualizerMode.FluxMathematicalOdyssey]: 'math-morph',
  // Flux Canvas (appended: preset indices of everything above must not move)
  [VisualizerMode.FluxCanvasEmberBark]: 'canvas:ember-bark',
  [VisualizerMode.FluxCanvasEmberBarkPlate]: 'canvas-plate:ember-bark',
  [VisualizerMode.FluxCanvasEmberBarkWorld]: 'canvas-world:ember-bark',
  [VisualizerMode.FluxCanvasPrismSilk]: 'canvas:prism-silk',
  [VisualizerMode.FluxCanvasPrismSilkPlate]: 'canvas-plate:prism-silk',
  [VisualizerMode.FluxCanvasPrismSilkWorld]: 'canvas-world:prism-silk',
  [VisualizerMode.FluxCanvasNeonOrbit]: 'canvas:neon-orbit',
  [VisualizerMode.FluxCanvasNeonOrbitPlate]: 'canvas-plate:neon-orbit',
  [VisualizerMode.FluxCanvasNeonOrbitWorld]: 'canvas-world:neon-orbit',
  [VisualizerMode.FluxCanvasPastelVeil]: 'canvas:pastel-veil',
  [VisualizerMode.FluxCanvasPastelVeilPlate]: 'canvas-plate:pastel-veil',
  [VisualizerMode.FluxCanvasPastelVeilWorld]: 'canvas-world:pastel-veil',
  [VisualizerMode.FluxCanvasVerdantCells]: 'canvas:verdant-cells',
  [VisualizerMode.FluxCanvasVerdantCellsPlate]: 'canvas-plate:verdant-cells',
  [VisualizerMode.FluxCanvasVerdantCellsWorld]: 'canvas-world:verdant-cells',
  [VisualizerMode.FluxCanvasWhiteMist]: 'canvas:white-mist',
  [VisualizerMode.FluxCanvasWhiteMistPlate]: 'canvas-plate:white-mist',
  [VisualizerMode.FluxCanvasWhiteMistWorld]: 'canvas-world:white-mist',
  [VisualizerMode.FluxCanvasBubbleDrift]: 'canvas:bubble-drift',
  [VisualizerMode.FluxCanvasBubbleDriftPlate]: 'canvas-plate:bubble-drift',
  [VisualizerMode.FluxCanvasBubbleDriftWorld]: 'canvas-world:bubble-drift',
  [VisualizerMode.FluxCanvasResinRiver]: 'canvas:resin-river',
  [VisualizerMode.FluxCanvasResinRiverPlate]: 'canvas-plate:resin-river',
  [VisualizerMode.FluxCanvasResinRiverWorld]: 'canvas-world:resin-river',
  [VisualizerMode.FluxCanvasFireCrystals]: 'canvas:fire-crystals',
  [VisualizerMode.FluxCanvasFireCrystalsPlate]: 'canvas-plate:fire-crystals',
  [VisualizerMode.FluxCanvasFireCrystalsWorld]: 'canvas-world:fire-crystals',
  [VisualizerMode.FluxCanvasTidalGlass]: 'canvas:tidal-glass',
  [VisualizerMode.FluxCanvasTidalGlassPlate]: 'canvas-plate:tidal-glass',
  [VisualizerMode.FluxCanvasTidalGlassWorld]: 'canvas-world:tidal-glass',
  [VisualizerMode.FluxCanvasStoneLinen]: 'canvas:stone-linen',
  [VisualizerMode.FluxCanvasStoneLinenPlate]: 'canvas-plate:stone-linen',
  [VisualizerMode.FluxCanvasStoneLinenWorld]: 'canvas-world:stone-linen',
  [VisualizerMode.FluxCanvasPeachSatin]: 'canvas:peach-satin',
  [VisualizerMode.FluxCanvasPeachSatinPlate]: 'canvas-plate:peach-satin',
  [VisualizerMode.FluxCanvasPeachSatinWorld]: 'canvas-world:peach-satin',
};
export const FLUX_SCENE_TO_MODE: Record<string, VisualizerMode> =
  Object.fromEntries(Object.entries(MODE_TO_FLUX_SCENE).map(([k, v]) => [v, k as VisualizerMode]));
export function isFluxMode(mode: VisualizerMode): boolean {
  return mode in MODE_TO_FLUX_SCENE;
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
  /** Opt-in: render supported generators natively on the GPU (Pixels Core). */
  gpuGenerators?: boolean;
  /** Opt-in: composite overlays (text/lighting/3D/matte) into the single GL
   *  canvas so it's the full output (Fast recording includes overlays). */
  unifyOverlays?: boolean;
  /** Opt-in (experimental): run the compositor + GPU generators on a Web Worker
   *  (OffscreenCanvas) for off-main-thread rendering. GPU-native scenes only. */
  workerCompositor?: boolean;
  /** Global color grade applied as a GPU post-FX pass (1 = neutral). */
  gradeBrightness?: number;
  gradeContrast?: number;
  gradeSaturation?: number;
  gradeGamma?: number;
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
  sliceRotationBeatPattern?: '2' | '4' | '8' | 'random'; // how often rotation snaps to a new random angle
  sliceRotationRange?: number;   // max angle for random rotation (default 45°)
  slicePush?: number;            // 0-1: base push — each slice scales + pushes up per its frequency energy
  slicePushMusicDriven?: boolean; // each slice mapped to its own freq bin drives push independently
  slicePushOscDriven?: boolean;   // LFO travels as a wave across slices (per-slice phase offset)
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
  // ─── Text Style Gallery ───────────────────────────────────────────────────
  textFont?: string;
  textGradient?: boolean;
  textGradientColors?: string[];
  textGradientAngle?: number;
  textVowelReactor?: boolean;
  textVowelEffect?: 'scale' | 'glow' | 'color' | 'float';
  textConsonantReactor?: boolean;
  textConsonantEffect?: 'shake' | 'blur' | 'scatter' | 'glitch';
  textReactorIntensity?: number;
  textPhysics?: 'none' | 'float' | 'wave' | 'bounce' | 'scatter' | 'elastic';
  textPhysicsIntensity?: number;

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

  // ─── Concert Lighting ────────────────────────────────────────────────────────
  /** Number of volumetric stage fixtures (1-6, default 3) */
  beamCount?: number;
  /** Flash fixtures to white on every detected beat */
  beamStrobeOnBeat?: boolean;
  /** Per-fixture colour overrides (hex array); falls back to colorPalette */
  beamColors?: string[];

  // ─── 3D Depth / Parallax ─────────────────────────────────────────────────────
  /** Enable 3D parallax depth mode with camera fly-through */
  enable3dDepth?: boolean;
  /** Parallax travel intensity 0-1 (default 0.4) */
  depthParallaxIntensity?: number;
  /** Enable automated slow camera drift */
  cameraFlyThrough?: boolean;
  /** Camera drift speed multiplier */
  cameraFlySpeed?: number;
  /** Enable ML subject segmentation for foreground/background depth separation */
  enableSegmentation?: boolean;
  /** Depth gap between background and foreground layers in px */
  depthLayerGap?: number;
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
  /** Original audio filename */
  audioFileName?: string;
  /** Audio file embedded as base64 data-URL (for local .plajah files) */
  audioData?: string;
  /** MIME type of the embedded audio (e.g. 'audio/mpeg') */
  audioMimeType?: string;
  /** Firebase Storage download URL (used in cloud saves instead of audioData) */
  audioStorageUrl?: string;
  /** Clip-launcher layer/clip matrix (the fired-clip grid). Typed loosely to
   *  avoid a circular import with ClipLauncher; shape is LauncherLayer[]. */
  layers?: any[];
}
