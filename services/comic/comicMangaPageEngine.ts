// services/comic/comicMangaPageEngine.ts — Comic & Manga Page Builder Layout Engine.
// Multi-panel grid compositor that binds Character Bible face embeddings directly into
// sequential SVG panels with procedural speech balloons and screentone shaders.
// 100% Native Plajah Platform: zero external cloud dependencies.

import {
  CharacterSheet,
  listSavedCharacters,
} from '../story/characterBible';
import {
  compileComicPanelTask,
  PlajahNativeTask,
} from '../localAi/plajahPipelineEngine';
import { plajahAudioCore, FabulaDialogueTake } from '../voice/plajahAudioCore';

export type PageLayoutId =
  | 'grid_6_classic'
  | 'dynamic_manga_5'
  | 'yonkoma_4'
  | 'splash_heroic'
  | 'widescreen_cinematic_3';

export type ScreentonePattern =
  | 'dots_fine'
  | 'dots_coarse'
  | 'speed_lines'
  | 'radial_burst'
  | 'crosshatch'
  | 'none';

export type BalloonType =
  | 'speech'
  | 'thought'
  | 'shout'
  | 'whisper'
  | 'narration_box'
  | 'sfx';

export interface PanelGeometryBox {
  id: string;
  panelIndex: number;
  xPct: number;      // 0..100
  yPct: number;      // 0..100
  widthPct: number;  // 0..100
  heightPct: number; // 0..100
  clipPolygon?: string; // Optional CSS/SVG polygon for dynamic slanted cuts e.g. "polygon(0 0, 100% 10%, 100% 100%, 0 90%)"
}

export interface ComicVectorBalloon {
  id: string;
  type: BalloonType;
  text: string;
  originalScriptText?: string;
  altText?: string;
  useAltTextLayer?: boolean;
  speakerCharacterId?: string;
  speakerName?: string;
  xPct: number; // 0..100 relative to panel
  yPct: number; // 0..100 relative to panel
  widthPx?: number;
  widthPct?: number;
  scale?: number;
  tailDirection?: 'bottom_left' | 'bottom_right' | 'top_left' | 'top_right' | 'none';
  sfxColor?: string;
  sfxScale?: number;
  audioTake?: FabulaDialogueTake;
}

export interface ComicEnginePanel {
  id: string;
  panelIndex: number;
  globalPanelNumber?: number;
  box: PanelGeometryBox;
  cameraShot: 'establishing' | 'full_shot' | 'medium' | 'close_up' | 'extreme_close_up' | 'low_angle_hero';
  framingCode?: string;
  geometry?: string;
  characterId?: string;
  actionPrompt: string;
  environmentPrompt?: string;
  editorialRationale?: string;
  renderedImageUrl?: string;
  caption?: string;
  captionHeader?: string;
  originalScriptCaption?: string;
  altCaption?: string;
  useAltCaptionLayer?: boolean;
  captionX?: number;
  captionY?: number;
  sfxText?: string;
  originalScriptSfx?: string;
  altSfx?: string;
  useAltSfxLayer?: boolean;
  sfxX?: number;
  sfxY?: number;
  sfxColor?: string;
  textLayerMode?: 'alt' | 'script';
  timecodeSeconds?: number;
  anchorTimecodeSeconds?: number;
  endTimecodeSeconds?: number;
  muxPlaybackId?: string;
  sourceVideoUrl?: string;
  imageOffsetX?: number;
  imageOffsetY?: number;
  imageScale?: number;
  isVideoLoop?: boolean;
  loopInSeconds?: number;
  loopOutSeconds?: number;
  cinemagraphMode?: 'loop' | 'ping-pong' | 'subtle';
  samLayerEnabled?: boolean;
  borderStyle?: 'solid' | 'thick' | 'double' | 'none' | 'gold' | 'neon';
  shape?: 'rect' | 'diag-left' | 'diag-right' | 'rounded' | 'circle-inset';
  screentone: {
    enabled: boolean;
    pattern: ScreentonePattern;
    opacity: number; // 0..1
  };
  balloons: ComicVectorBalloon[];
  linkedDocId?: string; // Linked individual Tela Document Page ID (Smart Object paradigm)
  nestedDoc?: NestedPanelDocument;
}

export type PanelLayerType =
  | 'background'      // Background Art Plate (image, prompt, or video)
  | 'ink'             // Inking & lineart drawing canvas
  | 'character'       // Character figure cutout / turnaround
  | 'cinemagraph_fx'  // Particle weather / effects (rain, embers, lightning)
  | 'balloon'         // Dialogue speech balloon or caption
  | 'sfx_lettering'   // Kinetic 3D onomatopoeia sound stamp
  | 'audio_foley';    // Voice take audio & foley sound impact

export interface PanelKeyframe {
  id: string;
  timeSec: number; // 0..duration
  properties: {
    x?: number;        // offset px
    y?: number;
    scale?: number;    // zoom factor e.g. 1.0 - 1.5
    opacity?: number;  // 0..1
    rotation?: number; // degrees
    shakeIntensity?: number; // 0..1 (action recoil)
    blurPx?: number;
  };
  easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'spring';
}

export interface PanelAnimationLayer {
  id: string;
  name: string;
  type: PanelLayerType;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  keyframes: PanelKeyframe[];
  x: number;
  y: number;
  scale: number;
  rotation: number;
  contentData?: string;
}

export interface NestedPanelDocument {
  id: string;                  // e.g. "doc_panel_1_silas_alley"
  docId: string;               // Canonical Tela linked document ID
  panelIndex: number;
  pageId: string;              // parent comic page id
  title: string;               // e.g. "Panel 1: Flooded Alleyway"
  widthPx: number;             // High-res canvas width (e.g. 1200)
  heightPx: number;            // High-res canvas height (e.g. 1200 or 1600)
  layers: PanelAnimationLayer[];
  timelineDurationSec: number; // e.g. 4.0s
  currentTimeSec: number;
  isPlaying: boolean;
  inkDataUrl?: string;         // Drawn canvas dataURL (persisted across views)
  inkUndoStack?: string[];     // Per-panel Undo history of inkDataUrl snapshots
  inkRedoStack?: string[];     // Per-panel Redo history of inkDataUrl snapshots
  cameraShot: ComicEnginePanel['cameraShot'];
  prompt: string;
  updatedAt: number;
}

export interface LayerAnimationPreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  keyframes: PanelKeyframe[];
}

export const LAYER_ANIMATION_PRESETS: LayerAnimationPreset[] = [
  {
    id: 'manga_impact_punch',
    name: 'Manga Impact Punch',
    emoji: '💥',
    description: 'Fast snap zoom-in with camera recoil shake',
    keyframes: [
      { id: 'kf_imp_0', timeSec: 0.0, properties: { scale: 1.0, x: 0, y: 0, opacity: 1, shakeIntensity: 0 }, easing: 'ease_in' },
      { id: 'kf_imp_1', timeSec: 0.4, properties: { scale: 1.28, x: -4, y: -4, opacity: 1, shakeIntensity: 0.85 }, easing: 'spring' },
      { id: 'kf_imp_2', timeSec: 1.2, properties: { scale: 1.18, x: 0, y: 0, opacity: 1, shakeIntensity: 0.2 }, easing: 'ease_out' },
      { id: 'kf_imp_3', timeSec: 4.0, properties: { scale: 1.18, x: 0, y: 0, opacity: 1, shakeIntensity: 0 }, easing: 'linear' },
    ],
  },
  {
    id: 'noir_slow_push',
    name: 'Noir Slow Push-In',
    emoji: '🎬',
    description: 'Atmospheric cinematic push-in across 4 seconds',
    keyframes: [
      { id: 'kf_noir_0', timeSec: 0.0, properties: { scale: 1.0, x: 0, y: 0, opacity: 0.9, shakeIntensity: 0 }, easing: 'ease_in_out' },
      { id: 'kf_noir_1', timeSec: 4.0, properties: { scale: 1.22, x: -10, y: -6, opacity: 1, shakeIntensity: 0 }, easing: 'ease_out' },
    ],
  },
  {
    id: 'parallax_float_25d',
    name: '2.5D Parallax Float',
    emoji: '🌊',
    description: 'Gentle horizontal & vertical camera drift for depth layers',
    keyframes: [
      { id: 'kf_par_0', timeSec: 0.0, properties: { scale: 1.08, x: -8, y: -3, opacity: 1, shakeIntensity: 0 }, easing: 'ease_in_out' },
      { id: 'kf_par_1', timeSec: 2.0, properties: { scale: 1.10, x: 8, y: 3, opacity: 1, shakeIntensity: 0 }, easing: 'ease_in_out' },
      { id: 'kf_par_2', timeSec: 4.0, properties: { scale: 1.08, x: -8, y: -3, opacity: 1, shakeIntensity: 0 }, easing: 'ease_in_out' },
    ],
  },
  {
    id: 'spring_pop_in',
    name: 'Spring Bubble / SFX Pop',
    emoji: '💬',
    description: 'Elastic pop-in ideal for speech balloons & action words',
    keyframes: [
      { id: 'kf_pop_0', timeSec: 0.0, properties: { scale: 0.3, x: 0, y: 12, opacity: 0, shakeIntensity: 0 }, easing: 'spring' },
      { id: 'kf_pop_1', timeSec: 0.4, properties: { scale: 1.14, x: 0, y: -3, opacity: 1, shakeIntensity: 0.25 }, easing: 'spring' },
      { id: 'kf_pop_2', timeSec: 0.8, properties: { scale: 1.0, x: 0, y: 0, opacity: 1, shakeIntensity: 0 }, easing: 'ease_out' },
      { id: 'kf_pop_3', timeSec: 4.0, properties: { scale: 1.0, x: 0, y: 0, opacity: 1, shakeIntensity: 0 }, easing: 'linear' },
    ],
  },
  {
    id: 'heartbeat_pulse',
    name: 'Suspense Heartbeat',
    emoji: '💓',
    description: 'Rhythmic double-pulse zoom with subtle tension tremor',
    keyframes: [
      { id: 'kf_hb_0', timeSec: 0.0, properties: { scale: 1.0, x: 0, y: 0, opacity: 1, shakeIntensity: 0 } },
      { id: 'kf_hb_1', timeSec: 0.8, properties: { scale: 1.12, x: 0, y: 0, opacity: 1, shakeIntensity: 0.35 }, easing: 'spring' },
      { id: 'kf_hb_2', timeSec: 1.3, properties: { scale: 1.02, x: 0, y: 0, opacity: 1, shakeIntensity: 0 } },
      { id: 'kf_hb_3', timeSec: 1.8, properties: { scale: 1.15, x: 0, y: 0, opacity: 1, shakeIntensity: 0.45 }, easing: 'spring' },
      { id: 'kf_hb_4', timeSec: 4.0, properties: { scale: 1.0, x: 0, y: 0, opacity: 1, shakeIntensity: 0 } },
    ],
  },
];

/**
 * Creates a default Nested Tela Document for a comic panel.
 * Every panel functions like a nested smart object with its own multi-track layer timeline!
 */
export function createDefaultNestedPanelDoc(
  panel: ComicEnginePanel,
  panelIndex: number,
  pageId = 'page_1'
): NestedPanelDocument {
  const panelDocId = panel.linkedDocId || `doc_${pageId}_p${panelIndex + 1}`;
  const balloon = panel.balloons[0];

  const layers: PanelAnimationLayer[] = [
    {
      id: `layer_${panelIndex}_bg`,
      name: 'Background Art Plate',
      type: 'background',
      visible: true,
      locked: false,
      opacity: 1.0,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      contentData: panel.renderedImageUrl || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80',
      keyframes: [
        { id: `kf_bg_1`, timeSec: 0.0, properties: { scale: 1.0, x: 0, y: 0, opacity: 1 } },
        { id: `kf_bg_2`, timeSec: 3.5, properties: { scale: 1.12, x: -8, y: -4, opacity: 1 }, easing: 'ease_out' },
      ],
    },
    {
      id: `layer_${panelIndex}_ink`,
      name: 'Sketchbook Lineart & Inks',
      type: 'ink',
      visible: true,
      locked: false,
      opacity: 1.0,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      keyframes: [
        { id: `kf_ink_1`, timeSec: 0.0, properties: { opacity: 1, scale: 1.0 } },
      ],
    },
    {
      id: `layer_${panelIndex}_char`,
      name: 'Character Figure Plate',
      type: 'character',
      visible: true,
      locked: false,
      opacity: 1.0,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      keyframes: [
        { id: `kf_char_1`, timeSec: 0.0, properties: { opacity: 1, scale: 1.0, x: 0 } },
        { id: `kf_char_2`, timeSec: 2.0, properties: { opacity: 1, scale: 1.04, x: 4 } },
      ],
    },
    {
      id: `layer_${panelIndex}_fx`,
      name: 'Cinemagraph Weather FX',
      type: 'cinemagraph_fx',
      visible: true,
      locked: false,
      opacity: 0.85,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      contentData: panelIndex === 0 ? 'falling_rain' : 'floating_embers',
      keyframes: [
        { id: `kf_fx_1`, timeSec: 0.0, properties: { opacity: 0.8 } },
        { id: `kf_fx_2`, timeSec: 2.0, properties: { opacity: 1.0 } },
        { id: `kf_fx_3`, timeSec: 4.0, properties: { opacity: 0.8 } },
      ],
    },
    {
      id: `layer_${panelIndex}_balloon`,
      name: balloon?.speakerName ? `Balloon: ${balloon.speakerName}` : 'Speech Balloon',
      type: 'balloon',
      visible: true,
      locked: false,
      opacity: 1.0,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      contentData: balloon?.text || 'Down here at the drain level, the air tastes like burnt copper.',
      keyframes: [
        { id: `kf_bal_1`, timeSec: 0.0, properties: { opacity: 0, scale: 0.8 } },
        { id: `kf_bal_2`, timeSec: 0.6, properties: { opacity: 1, scale: 1.0 }, easing: 'spring' },
        { id: `kf_bal_3`, timeSec: 4.0, properties: { opacity: 1, scale: 1.0 } },
      ],
    },
    {
      id: `layer_${panelIndex}_sfx`,
      name: 'Kinetic SFX Stamp',
      type: 'sfx_lettering',
      visible: true,
      locked: false,
      opacity: 1.0,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      contentData: panelIndex === 0 ? 'DZZZZT' : 'BOOOM',
      keyframes: [
        { id: `kf_sfx_1`, timeSec: 1.2, properties: { opacity: 0, scale: 0.4 } },
        { id: `kf_sfx_2`, timeSec: 1.4, properties: { opacity: 1, scale: 1.3, shakeIntensity: 0.8 }, easing: 'spring' },
        { id: `kf_sfx_3`, timeSec: 1.8, properties: { opacity: 1, scale: 1.0, shakeIntensity: 0 } },
      ],
    },
    {
      id: `layer_${panelIndex}_audio`,
      name: 'Voice Acting Take & Foley',
      type: 'audio_foley',
      visible: true,
      locked: false,
      opacity: 1.0,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0,
      contentData: 'Silas Vane (Whisper take)',
      keyframes: [
        { id: `kf_aud_1`, timeSec: 0.5, properties: { opacity: 1 } },
      ],
    },
  ];

  const wPct = panel.box?.widthPct || 45;
  const hPct = panel.box?.heightPct || 30;

  return {
    id: panelDocId,
    docId: panelDocId,
    panelIndex,
    pageId,
    title: `Panel ${panelIndex + 1}: ${panel.actionPrompt ? panel.actionPrompt.slice(0, 36) : 'Scene View'}...`,
    widthPx: 1200,
    heightPx: Math.round(1200 * (hPct / (wPct || 1))),
    layers,
    timelineDurationSec: 4.0,
    currentTimeSec: 0,
    isPlaying: false,
    inkUndoStack: [],
    inkRedoStack: [],
    cameraShot: panel.cameraShot,
    prompt: panel.actionPrompt || 'Sequential Art Scene',
    updatedAt: Date.now(),
  };
}

export interface ComicMangaPage {
  id: string;
  title: string;
  pageNumber: number;
  actNumber?: number;
  slugline?: string;
  layoutGrammar?: string;
  activeLensName?: string;
  activeLensDesc?: string;
  timeRangeLabel?: string;
  summary?: string;
  layoutId: PageLayoutId;
  readingDirection: 'ltr' | 'rtl'; // ltr: Western Comic, rtl: Japanese Manga
  dimensions: { width: number; height: number }; // Default: 1200 x 1600 (A4 / Comic standard)
  gutterPx: number;
  gutterColor: string;
  panels: ComicEnginePanel[];
  stylePreset: 'manga' | 'graphic_novel_noir' | 'american_superhero' | 'storybook_watercolor';
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESET LAYOUT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

export const LAYOUT_PRESETS: Record<PageLayoutId, {
  name: string;
  description: string;
  defaultPanels: number;
  createBoxes: (gutterPct: number) => PanelGeometryBox[];
}> = {
  grid_6_classic: {
    name: 'Classic 6-Panel (2x3)',
    description: 'Traditional American comic 6-panel uniform grid. High readability and measured pacing.',
    defaultPanels: 6,
    createBoxes: (g) => {
      const w = (100 - g * 3) / 2;
      const h = (100 - g * 4) / 3;
      const boxes: PanelGeometryBox[] = [];
      let idx = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          boxes.push({
            id: `box_${idx}`,
            panelIndex: idx,
            xPct: g + c * (w + g),
            yPct: g + r * (h + g),
            widthPct: w,
            heightPct: h,
          });
          idx++;
        }
      }
      return boxes;
    },
  },

  dynamic_manga_5: {
    name: 'Shonen Dynamic 5-Panel',
    description: 'Kinetic Japanese action layout. Large angled top hero panel, mid split, and high-impact climax panels.',
    defaultPanels: 5,
    createBoxes: (g) => [
      // Panel 0: Large Top Action Banner
      {
        id: 'box_0',
        panelIndex: 0,
        xPct: g,
        yPct: g,
        widthPct: 100 - g * 2,
        heightPct: 36,
      },
      // Panel 1: Middle Left Cut
      {
        id: 'box_1',
        panelIndex: 1,
        xPct: g,
        yPct: g + 36 + g,
        widthPct: (100 - g * 3) * 0.45,
        heightPct: 28,
      },
      // Panel 2: Middle Right Hero Reaction
      {
        id: 'box_2',
        panelIndex: 2,
        xPct: g + (100 - g * 3) * 0.45 + g,
        yPct: g + 36 + g,
        widthPct: (100 - g * 3) * 0.55,
        heightPct: 28,
      },
      // Panel 3: Bottom Left Tension
      {
        id: 'box_3',
        panelIndex: 3,
        xPct: g,
        yPct: g + 36 + g + 28 + g,
        widthPct: (100 - g * 3) * 0.5,
        heightPct: 100 - (g + 36 + g + 28 + g + g),
      },
      // Panel 4: Bottom Right Climax SFX
      {
        id: 'box_4',
        panelIndex: 4,
        xPct: g + (100 - g * 3) * 0.5 + g,
        yPct: g + 36 + g + 28 + g,
        widthPct: (100 - g * 3) * 0.5,
        heightPct: 100 - (g + 36 + g + 28 + g + g),
      },
    ],
  },

  yonkoma_4: {
    name: 'Yonkoma (4-Koma Vertical)',
    description: 'Traditional 4-panel vertical manga strip: Ki-shō-ten-ketsu (Introduction, Development, Twist, Conclusion).',
    defaultPanels: 4,
    createBoxes: (g) => {
      const h = (100 - g * 5) / 4;
      const w = 100 - g * 2;
      return [0, 1, 2, 3].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: g,
        yPct: g + idx * (h + g),
        widthPct: w,
        heightPct: h,
      }));
    },
  },

  splash_heroic: {
    name: 'Heroic Splash Page + Insets',
    description: 'Full-bleed monumental splash background with 2 floating narrative dialogue insets.',
    defaultPanels: 3,
    createBoxes: (g) => [
      // Main Splash Panel
      {
        id: 'box_0',
        panelIndex: 0,
        xPct: g,
        yPct: g,
        widthPct: 100 - g * 2,
        heightPct: 100 - g * 2,
      },
      // Floating Inset Panel A (Top Right)
      {
        id: 'box_1',
        panelIndex: 1,
        xPct: 60,
        yPct: 12,
        widthPct: 34,
        heightPct: 22,
      },
      // Floating Inset Panel B (Bottom Left)
      {
        id: 'box_2',
        panelIndex: 2,
        xPct: 6,
        yPct: 68,
        widthPct: 36,
        heightPct: 24,
      },
    ],
  },

  widescreen_cinematic_3: {
    name: 'Widescreen Cinematic (3-Tier)',
    description: 'Three 2.39:1 letterbox cinematic frames stacked vertically. Ideal for filmic storytelling and graphic novels.',
    defaultPanels: 3,
    createBoxes: (g) => {
      const h = (100 - g * 4) / 3;
      const w = 100 - g * 2;
      return [0, 1, 2].map((idx) => ({
        id: `box_${idx}`,
        panelIndex: idx,
        xPct: g,
        yPct: g + idx * (h + g),
        widthPct: w,
        heightPct: h,
      }));
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE BUILDER & FACTORY
// ─────────────────────────────────────────────────────────────────────────────

export class ComicMangaPageEngine {
  private static instance: ComicMangaPageEngine | null = null;

  static getInstance(): ComicMangaPageEngine {
    if (!this.instance) {
      this.instance = new ComicMangaPageEngine();
    }
    return this.instance;
  }

  /**
   * Creates a fresh Comic or Manga Page initialized with layout geometry.
   */
  createPage(options: {
    title?: string;
    layoutId?: PageLayoutId;
    readingDirection?: 'ltr' | 'rtl';
    stylePreset?: ComicMangaPage['stylePreset'];
    primaryCharacterId?: string;
  }): ComicMangaPage {
    const layoutId = options.layoutId || 'dynamic_manga_5';
    const stylePreset = options.stylePreset || (layoutId === 'dynamic_manga_5' || layoutId === 'yonkoma_4' ? 'manga' : 'graphic_novel_noir');
    const readingDirection = options.readingDirection || (stylePreset === 'manga' ? 'rtl' : 'ltr');
    const gutterPx = 12;
    const gutterPct = 1.2;

    const preset = LAYOUT_PRESETS[layoutId];
    const boxes = preset.createBoxes(gutterPct);

    // Default panels populated from boxes
    const panels: ComicEnginePanel[] = boxes.map((box, idx) => {
      const shots: ComicEnginePanel['cameraShot'][] = ['establishing', 'medium', 'close_up', 'extreme_close_up', 'low_angle_hero'];
      const shot = shots[idx % shots.length];

      return {
        id: `panel_${Date.now()}_${idx}`,
        panelIndex: idx,
        box,
        cameraShot: shot,
        characterId: options.primaryCharacterId,
        actionPrompt: idx === 0
          ? 'Surveying the vast neon city skyline from the rain-drenched rooftop'
          : idx === 1
          ? 'Reaching inside leather duster to withdraw a glowing holographic cipher'
          : 'Eyes narrowing with cold determination as sparks crackle from cybernetic eye',
        screentone: {
          enabled: stylePreset === 'manga',
          pattern: idx === 0 ? 'dots_fine' : idx === boxes.length - 1 ? 'speed_lines' : 'dots_coarse',
          opacity: 0.25,
        },
        balloons: idx === 0 ? [
          {
            id: `b_init_${idx}`,
            type: 'narration_box',
            text: '23:41. LOWER OBERON SECTOR.',
            xPct: 10,
            yPct: 10,
          },
        ] : idx === 1 ? [
          {
            id: `b_init_${idx}`,
            type: 'thought',
            text: 'They changed the orbital encryption keys...',
            xPct: 20,
            yPct: 15,
            tailDirection: 'bottom_left',
          },
        ] : [
          {
            id: `b_init_${idx}`,
            type: 'sfx',
            text: 'CRACKLE!',
            xPct: 65,
            yPct: 20,
            sfxColor: '#00DAF3',
            sfxScale: 1.2,
          },
        ],
      };
    });

    return {
      id: `comic_page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: options.title || 'Chapter 1: The Signal',
      pageNumber: 1,
      layoutId,
      readingDirection,
      dimensions: { width: 1200, height: 1600 },
      gutterPx,
      gutterColor: stylePreset === 'manga' ? '#ffffff' : '#0a0b0e',
      panels,
      stylePreset,
      createdAt: Date.now(),
    };
  }

  /**
   * Compiles PlajahNativeTask generation tasks for every panel in the page,
   * preserving the Character Bible likeness anchor across sequential panels.
   */
  compilePageTasks(page: ComicMangaPage, character?: CharacterSheet): PlajahNativeTask[] {
    const tasks: PlajahNativeTask[] = [];

    // Map style presets to LoRA & Model
    let loraId: string | undefined;
    let modelId = 'animagine_xl';
    let lightingCue = 'vibrant comic inks';

    if (page.stylePreset === 'manga') {
      loraId = 'flux_lora_manga_screentone';
      modelId = 'flux3_klein';
      lightingCue = 'authentic high contrast manga inking with screentone textures';
    } else if (page.stylePreset === 'storybook_watercolor') {
      loraId = 'flux_lora_storybook_cartoon';
      modelId = 'flux3_klein';
      lightingCue = 'whimsical watercolor wash and delicate storybook ink lines';
    } else if (page.stylePreset === 'graphic_novel_noir') {
      loraId = 'flux_lora_cinematic_35mm';
      modelId = 'flux3_klein';
      lightingCue = 'bold graphic novel chiaroscuro, heavy black shadows, sharp rim light';
    }

    const charPrompt = character ? `${character.name}: ${character.visualAnchor}` : 'A determined protagonist';
    const faceRef = character?.turnaroundUrls.closeUp;

    for (const panel of page.panels) {
      const task = compileComicPanelTask({
        characterPrompt: charPrompt,
        faceEmbeddingRef: faceRef,
        sceneActionPrompt: panel.actionPrompt,
        cameraShot: panel.cameraShot,
        moodLighting: lightingCue,
        aspect: panel.box.widthPct > panel.box.heightPct * 1.3 ? '16:9' : '1:1',
        modelId,
        loraId,
      });

      tasks.push(task);
    }

    return tasks;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROCEDURAL SVG SCREENTONE DEFINITIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generates procedural SVG `<defs>` containing manga halftone dots, speed lines,
   * radial burst focus patterns, and balloon dropshadow filters.
   */
  generateSvgDefs(): string {
    return `
    <defs>
      <!-- Drop Shadow Filter for Speech Balloons -->
      <filter id="balloon-shadow" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
      </filter>

      <!-- Glow for SFX Onomatopoeia -->
      <filter id="sfx-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>

      <!-- 1. Fine Halftone Screentone (Dots Fine) -->
      <pattern id="screentone-dots-fine" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="1.5" fill="#000000"/>
      </pattern>

      <!-- 2. Coarse Halftone Screentone (Dots Coarse) -->
      <pattern id="screentone-dots-coarse" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="3.8" fill="#000000"/>
      </pattern>

      <!-- 3. Manga Speed Lines Pattern (Dynamic Horizontal / Angled Streaks) -->
      <pattern id="screentone-speed-lines" width="40" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-15)">
        <line x1="0" y1="5" x2="35" y2="5" stroke="#000000" stroke-width="2" stroke-dasharray="12 4 4 4"/>
        <line x1="10" y1="15" x2="40" y2="15" stroke="#000000" stroke-width="1.5" stroke-dasharray="8 6"/>
      </pattern>

      <!-- 4. Crosshatch Shader Pattern -->
      <pattern id="screentone-crosshatch" width="10" height="10" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="10" y2="10" stroke="#000000" stroke-width="1"/>
        <line x1="10" y1="0" x2="0" y2="10" stroke="#000000" stroke-width="0.8"/>
      </pattern>

      <!-- 5. Radial Burst Shader Gradient -->
      <radialGradient id="screentone-radial-burst" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="60%" stop-color="#000000" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
      </radialGradient>
    </defs>
    `.trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SVG SPEECH BALLOON GENERATOR
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Computes an SVG vector representation for a speech balloon or sound effect.
   */
  renderBalloonSvg(balloon: ComicVectorBalloon, panelPixelW: number, panelPixelH: number): string {
    const x = (balloon.xPct / 100) * panelPixelW;
    const y = (balloon.yPct / 100) * panelPixelH;
    const width = balloon.widthPx || Math.max(120, Math.min(260, balloon.text.length * 8.5 + 40));
    const height = Math.max(46, Math.ceil(balloon.text.length / 22) * 22 + 24);

    // 1. SOUND EFFECT (SFX / Onomatopoeia)
    if (balloon.type === 'sfx') {
      const color = balloon.sfxColor || '#FF8C00';
      const scale = balloon.sfxScale || 1.0;
      const fontSize = Math.round(28 * scale);

      return `
      <g transform="translate(${x}, ${y}) rotate(-8)">
        <text x="0" y="0"
          font-family="Impact, sans-serif"
          font-size="${fontSize}px"
          font-weight="900"
          font-style="italic"
          text-anchor="middle"
          stroke="#000000"
          stroke-width="5"
          fill="${color}"
          filter="url(#sfx-glow)"
          letter-spacing="2px">
          ${escapeXml(balloon.text)}
        </text>
        <text x="0" y="0"
          font-family="Impact, sans-serif"
          font-size="${fontSize}px"
          font-weight="900"
          font-style="italic"
          text-anchor="middle"
          fill="#ffffff"
          opacity="0.9"
          letter-spacing="2px">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 2. NARRATION BOX (Sleek rectangular caption)
    if (balloon.type === 'narration_box') {
      return `
      <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
        <rect x="0" y="0" width="${width}" height="${height}" rx="2"
          fill="#000000" stroke="#FF8C00" stroke-width="2"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
          font-family="'Courier New', monospace"
          font-size="12px"
          font-weight="bold"
          fill="#FF8C00"
          text-anchor="middle"
          letter-spacing="1px">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 3. JAGGED SHOUT BALLOON (Action starburst)
    if (balloon.type === 'shout') {
      const points = computeStarburstPoints(width, height);
      return `
      <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
        <polygon points="${points}" fill="#ffffff" stroke="#e11d48" stroke-width="2.5" stroke-linejoin="miter"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
          font-family="'Arial Black', Impact, sans-serif"
          font-size="13px"
          font-weight="bold"
          fill="#e11d48"
          text-anchor="middle">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 4. THOUGHT CLOUD BALLOON
    if (balloon.type === 'thought') {
      return `
      <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
        <!-- Cloud outline -->
        <rect x="0" y="0" width="${width}" height="${height}" rx="18" ry="18"
          fill="#ffffff" stroke="#475569" stroke-width="1.8"/>
        <!-- Trailing thought circles -->
        <circle cx="${width * 0.2}" cy="${height + 8}" r="5" fill="#ffffff" stroke="#475569" stroke-width="1.5"/>
        <circle cx="${width * 0.14}" cy="${height + 18}" r="3" fill="#ffffff" stroke="#475569" stroke-width="1.5"/>
        <text x="${width / 2}" y="${height / 2 + 5}"
          font-family="system-ui, sans-serif"
          font-size="12px"
          font-style="italic"
          fill="#1e293b"
          text-anchor="middle">
          ${escapeXml(balloon.text)}
        </text>
      </g>
      `.trim();
    }

    // 5. STANDARD SPEECH BALLOON (Smooth pill with tail)
    const isWhisper = balloon.type === 'whisper';
    const tailDirection = balloon.tailDirection || 'bottom_left';
    const tailPath = computeTailPath(width, height, tailDirection);

    return `
    <g transform="translate(${x}, ${y})" filter="url(#balloon-shadow)">
      <!-- Main Bubble Body -->
      <rect x="0" y="0" width="${width}" height="${height}" rx="14" ry="14"
        fill="#ffffff"
        stroke="#0f172a"
        stroke-width="2"
        ${isWhisper ? 'stroke-dasharray="4 3"' : ''}/>
      <!-- Directional Tail -->
      <path d="${tailPath}" fill="#ffffff" stroke="#0f172a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Tail seam cover -->
      <rect x="${width * 0.15}" y="${height - 2}" width="20" height="4" fill="#ffffff"/>
      <!-- Dialogue Text -->
      <text x="${width / 2}" y="${height / 2 + 4}"
        font-family="'Comic Neue', system-ui, sans-serif"
        font-size="12.5px"
        font-weight="600"
        fill="#0f172a"
        text-anchor="middle">
        ${escapeXml(balloon.text)}
      </text>
    </g>
    `.trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FULL PAGE SVG RENDERER & COMPOSITOR
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Renders the complete Comic or Manga page into a standalone, printable SVG document.
   */
  renderPageToSvg(page: ComicMangaPage): string {
    const { width, height } = page.dimensions;
    const defs = this.generateSvgDefs();

    let panelsSvg = '';

    for (const panel of page.panels) {
      const pxX = (panel.box.xPct / 100) * width;
      const pxY = (panel.box.yPct / 100) * height;
      const pxW = (panel.box.widthPct / 100) * width;
      const pxH = (panel.box.heightPct / 100) * height;

      const clipId = `clip_${panel.id}`;

      // Panel background artwork image or placeholder fill
      const artElement = panel.renderedImageUrl
        ? `<image href="${panel.renderedImageUrl}" x="0" y="0" width="${pxW}" height="${pxH}" preserveAspectRatio="xMidYMid slice"/>`
        : `
          <rect width="${pxW}" height="${pxH}" fill="#16181d"/>
          <text x="${pxW / 2}" y="${pxH / 2 - 10}" fill="#475569" font-size="13px" font-family="monospace" text-anchor="middle">
            PANEL ${panel.panelIndex + 1} · ${panel.cameraShot.toUpperCase()}
          </text>
          <text x="${pxW / 2}" y="${pxH / 2 + 14}" fill="#64748b" font-size="11px" font-style="italic" text-anchor="middle" opacity="0.75">
            "${escapeXml(panel.actionPrompt.slice(0, 42))}..."
          </text>
        `;

      // Screentone overlay
      let screentoneOverlay = '';
      if (panel.screentone.enabled && panel.screentone.pattern !== 'none') {
        const patternId = `screentone-${panel.screentone.pattern.replace('_', '-')}`;
        screentoneOverlay = `
          <rect width="${pxW}" height="${pxH}"
            fill="url(#${patternId})"
            opacity="${panel.screentone.opacity}"
            style="mix-blend-mode: multiply; pointer-events: none;"/>
        `;
      }

      // Speech balloons
      const balloonsSvg = panel.balloons
        .map((b) => this.renderBalloonSvg(b, pxW, pxH))
        .join('\n');

      panelsSvg += `
      <!-- PANEL ${panel.panelIndex + 1} -->
      <g transform="translate(${pxX}, ${pxY})">
        <defs>
          <clipPath id="${clipId}">
            <rect width="${pxW}" height="${pxH}" rx="2"/>
          </clipPath>
        </defs>

        <!-- Artwork Layer (Clipped to Panel Boundary) -->
        <g clip-path="url(#${clipId})">
          ${artElement}
          ${screentoneOverlay}
        </g>

        <!-- Heavy Ink Comic Panel Frame Border -->
        <rect width="${pxW}" height="${pxH}" rx="2"
          fill="none"
          stroke="#000000"
          stroke-width="3"
          stroke-linejoin="miter"/>

        <!-- Vector Speech Balloons & SFX Layer -->
        ${balloonsSvg}
      </g>
      `;
    }

    return `
<svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${width} ${height}"
  width="${width}"
  height="${height}"
  style="background-color: ${page.gutterColor}; font-family: system-ui, sans-serif;">
  ${defs}

  <!-- Page Background Gutter -->
  <rect width="${width}" height="${height}" fill="${page.gutterColor}"/>

  <!-- Comic Panels Grid -->
  ${panelsSvg}
</svg>
    `.trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO MULTI-VOICE CASTING FOR SPEECH BALLOONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Synthesizes audio for all dialogue bubbles across the comic page,
   * binding each character's voice and emotion tags into sequential takes.
   */
  async synthesizePageDialogueAudio(
    page: ComicMangaPage,
    speakerName = 'Aria'
  ): Promise<{ balloonId: string; take: FabulaDialogueTake }[]> {
    const results: { balloonId: string; take: FabulaDialogueTake }[] = [];

    for (const panel of page.panels) {
      for (const balloon of panel.balloons) {
        if (balloon.type === 'sfx' || !balloon.text.trim()) continue;

        const emotion = balloon.type === 'thought' ? 'whisper' : balloon.type === 'shout' ? 'urgent' : 'neutral';
        const speaker = balloon.speakerName || speakerName;

        try {
          const take = await plajahAudioCore.synthesizeFabulaDialogue({
            text: balloon.text,
            speakerName: speaker,
            emotion,
            takeIndex: 1,
            engine: 'kokoro',
          });
          balloon.audioTake = take;
          results.push({ balloonId: balloon.id, take });
        } catch (e) {
          console.warn('[ComicMangaPageEngine] Audio synthesis skipped for balloon:', balloon.id, e);
        }
      }
    }

    return results;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function computeTailPath(w: number, h: number, direction: string): string {
  if (direction === 'bottom_right') {
    return `M ${w * 0.75} ${h} L ${w * 0.88} ${h + 16} L ${w * 0.85} ${h}`;
  }
  if (direction === 'top_left') {
    return `M ${w * 0.25} 0 L ${w * 0.12} -16 L ${w * 0.15} 0`;
  }
  if (direction === 'top_right') {
    return `M ${w * 0.75} 0 L ${w * 0.88} -16 L ${w * 0.85} 0`;
  }
  // Default: bottom_left
  return `M ${w * 0.25} ${h} L ${w * 0.12} ${h + 16} L ${w * 0.15} ${h}`;
}

function computeStarburstPoints(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const numPoints = 16;
  const points: string[] = [];

  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    const rScale = i % 2 === 0 ? 1.05 : 0.82;
    const x = cx + Math.cos(angle) * rx * rScale;
    const y = cy + Math.sin(angle) * ry * rScale;
    points.push(`${Math.round(x)},${Math.round(y)}`);
  }

  return points.join(' ');
}

export const comicMangaPageEngine = ComicMangaPageEngine.getInstance();

// ─────────────────────────────────────────────────────────────────────────────
// NON-DESTRUCTIVE PANEL SPLIT, MERGE, DIAGONAL SLASH & PROCEDURAL ART GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

const DIAGONAL_CLIP_PRESETS = [
  undefined,
  'polygon(0% 0%, 100% 0%, 100% 88%, 0% 100%)',
  'polygon(0% 8%, 100% 0%, 100% 100%, 0% 92%)',
  'polygon(4% 0%, 100% 0%, 96% 100%, 0% 100%)',
  'polygon(0% 0%, 95% 4%, 100% 96%, 5% 100%)',
];

/**
 * Splits a specific panel horizontally (top / bottom) without losing any existing panels or art.
 */
export function splitPanelHorizontally(page: ComicMangaPage, panelIndex: number, gutterPct = 1.2): ComicMangaPage {
  const target = page.panels[panelIndex];
  if (!target || target.box.heightPct < 14) return page;

  const halfH = Number(((target.box.heightPct - gutterPct) / 2).toFixed(2));
  const topBox: PanelGeometryBox = {
    ...target.box,
    heightPct: halfH,
  };
  const bottomBox: PanelGeometryBox = {
    id: `box_split_h_${Date.now()}`,
    panelIndex: panelIndex + 1,
    xPct: target.box.xPct,
    yPct: Number((target.box.yPct + halfH + gutterPct).toFixed(2)),
    widthPct: target.box.widthPct,
    heightPct: halfH,
  };

  const newBottomPanel: ComicEnginePanel = {
    id: `panel_${Date.now()}_${panelIndex + 1}`,
    panelIndex: panelIndex + 1,
    box: bottomBox,
    cameraShot: 'close_up',
    characterId: target.characterId,
    actionPrompt: `${target.actionPrompt || 'Action beat'} (Reaction Close-Up)`,
    renderedImageUrl: target.renderedImageUrl,
    screentone: { ...target.screentone },
    balloons: [],
    linkedDocId: `doc_${page.id}_p${page.panels.length + 1}_${Date.now().toString().slice(-3)}`,
  };

  const nextPanels = [...page.panels];
  nextPanels.splice(
    panelIndex,
    1,
    { ...target, box: topBox },
    newBottomPanel
  );

  return {
    ...page,
    panels: nextPanels.map((p, idx) => ({
      ...p,
      panelIndex: idx,
      box: { ...p.box, panelIndex: idx },
    })),
  };
}

/**
 * Splits a specific panel vertically (left / right) without losing any existing panels or art.
 */
export function splitPanelVertically(page: ComicMangaPage, panelIndex: number, gutterPct = 1.2): ComicMangaPage {
  const target = page.panels[panelIndex];
  if (!target || target.box.widthPct < 18) return page;

  const halfW = Number(((target.box.widthPct - gutterPct) / 2).toFixed(2));
  const leftBox: PanelGeometryBox = {
    ...target.box,
    widthPct: halfW,
  };
  const rightBox: PanelGeometryBox = {
    id: `box_split_v_${Date.now()}`,
    panelIndex: panelIndex + 1,
    xPct: Number((target.box.xPct + halfW + gutterPct).toFixed(2)),
    yPct: target.box.yPct,
    widthPct: halfW,
    heightPct: target.box.heightPct,
  };

  const newRightPanel: ComicEnginePanel = {
    id: `panel_${Date.now()}_${panelIndex + 1}`,
    panelIndex: panelIndex + 1,
    box: rightBox,
    cameraShot: 'medium',
    characterId: target.characterId,
    actionPrompt: `${target.actionPrompt || 'Action beat'} (Counter-Shot)`,
    renderedImageUrl: target.renderedImageUrl,
    screentone: { ...target.screentone },
    balloons: [],
    linkedDocId: `doc_${page.id}_p${page.panels.length + 1}_${Date.now().toString().slice(-3)}`,
  };

  const nextPanels = [...page.panels];
  nextPanels.splice(
    panelIndex,
    1,
    { ...target, box: leftBox },
    newRightPanel
  );

  return {
    ...page,
    panels: nextPanels.map((p, idx) => ({
      ...p,
      panelIndex: idx,
      box: { ...p.box, panelIndex: idx },
    })),
  };
}

/**
 * Cycles dynamic shonen/comic diagonal slash polygon cuts on the selected panel.
 */
export function togglePanelDiagonalSlant(page: ComicMangaPage, panelIndex: number): ComicMangaPage {
  const target = page.panels[panelIndex];
  if (!target) return page;

  const currentIdx = DIAGONAL_CLIP_PRESETS.indexOf(target.box.clipPolygon);
  const nextClip = DIAGONAL_CLIP_PRESETS[(currentIdx + 1) % DIAGONAL_CLIP_PRESETS.length];

  const nextPanels = page.panels.map((p, idx) =>
    idx === panelIndex ? { ...p, box: { ...p.box, clipPolygon: nextClip } } : p
  );

  return { ...page, panels: nextPanels };
}

/**
 * Deletes a panel (if > 1 panel remains) and expands an adjacent panel to fill its space when aligned.
 */
export function deleteAndMergePanel(page: ComicMangaPage, panelIndex: number): ComicMangaPage {
  if (page.panels.length <= 1) return page;
  const removed = page.panels[panelIndex];
  const remaining = page.panels.filter((_, idx) => idx !== panelIndex);

  // Try to expand neighbor sharing same row or column
  const neighborIdx = Math.max(0, panelIndex - 1);
  if (remaining[neighborIdx] && removed) {
    const nb = remaining[neighborIdx].box;
    if (Math.abs(nb.yPct - removed.box.yPct) < 2) {
      const minX = Math.min(nb.xPct, removed.box.xPct);
      const maxX = Math.max(nb.xPct + nb.widthPct, removed.box.xPct + removed.box.widthPct);
      remaining[neighborIdx] = {
        ...remaining[neighborIdx],
        box: { ...nb, xPct: minX, widthPct: Number((maxX - minX).toFixed(2)) },
      };
    } else if (Math.abs(nb.xPct - removed.box.xPct) < 2) {
      const minY = Math.min(nb.yPct, removed.box.yPct);
      const maxY = Math.max(nb.yPct + nb.heightPct, removed.box.yPct + removed.box.heightPct);
      remaining[neighborIdx] = {
        ...remaining[neighborIdx],
        box: { ...nb, yPct: minY, heightPct: Number((maxY - minY).toFixed(2)) },
      };
    }
  }

  return {
    ...page,
    panels: remaining.map((p, idx) => ({
      ...p,
      panelIndex: idx,
      box: { ...p.box, panelIndex: idx },
    })),
  };
}

/**
 * Generates an instant, stylized comic/manga SVG artwork plate dataURL from the panel's prompt,
 * character cast lock, and camera shot so creators can see immediate visual feedback.
 */
export function generateProceduralPanelPlateSvg(params: {
  prompt: string;
  characterName?: string;
  cameraShot: string;
  stylePreset: string;
  seed?: number;
}): string {
  const { prompt, characterName = 'Hero', cameraShot, stylePreset, seed = Date.now() } = params;
  const palettes: Record<string, [string, string, string, string]> = {
    graphic_novel_noir: ['#080b14', '#1e1b4b', '#00daf3', '#d40055'],
    manga: ['#111115', '#27272a', '#f4f4f5', '#ec4899'],
    american_superhero: ['#0f172a', '#1d4ed8', '#f59e0b', '#ef4444'],
    storybook_watercolor: ['#1e1b2e', '#4c1d95', '#fbbf24', '#34d399'],
  };
  const [bg1, bg2, accent1, accent2] = palettes[stylePreset] || palettes.graphic_novel_noir;
  const safePrompt = escapeXml(prompt.slice(0, 64));
  const safeChar = escapeXml(characterName);
  const safeShot = escapeXml(cameraShot.replace(/_/g, ' ').toUpperCase());

  // Dynamic speed lines / dramatic lighting rays
  const rays: string[] = [];
  for (let i = 0; i < 18; i++) {
    const angle = (i * 20 + (seed % 17)) * (Math.PI / 180);
    const x2 = 400 + Math.cos(angle) * 600;
    const y2 = 360 + Math.sin(angle) * 600;
    rays.push(`<line x1="400" y1="360" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${i % 2 === 0 ? accent1 : accent2}" stroke-opacity="0.18" stroke-width="${(i % 3) + 1.5}" />`);
  }

  const silhouetteScale =
    cameraShot === 'extreme_close_up' ? 1.65 :
    cameraShot === 'close_up' ? 1.3 :
    cameraShot === 'low_angle_hero' ? 1.2 : 0.9;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="60%" stop-color="${bg2}"/>
        <stop offset="100%" stop-color="#05050a"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="45%" r="50%">
        <stop offset="0%" stop-color="${accent1}" stop-opacity="0.45"/>
        <stop offset="65%" stop-color="${accent2}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="800" height="800" fill="url(#bg)"/>
    <circle cx="400" cy="360" r="360" fill="url(#glow)"/>
    <g>${rays.join('')}</g>
    <!-- Dramatic Horizon & Cityscape Geometry -->
    <polygon points="0,800 0,520 120,460 220,540 340,420 480,510 620,440 740,500 800,470 800,800" fill="#060810" fill-opacity="0.75" stroke="${accent1}" stroke-opacity="0.35" stroke-width="2"/>
    <!-- Character Heroic Silhouette & Rim Light -->
    <g transform="translate(400, 450) scale(${silhouetteScale}) translate(-400, -450)">
      <path d="M310,800 L335,510 Q315,430 355,390 L445,390 Q485,430 465,510 L490,800 Z" fill="#0b0e17" stroke="${accent1}" stroke-width="3.5"/>
      <circle cx="400" cy="325" r="54" fill="#0b0e17" stroke="${accent1}" stroke-width="3.5"/>
      <!-- Glowing Ocular / Visor Accent -->
      <ellipse cx="382" cy="320" rx="11" ry="5" fill="${accent1}"/>
      <ellipse cx="418" cy="320" rx="11" ry="5" fill="${accent1}"/>
      <path d="M340,420 Q260,520 220,660" fill="none" stroke="${accent2}" stroke-width="5" stroke-opacity="0.65"/>
    </g>
    <!-- Camera HUD Stamp -->
    <rect x="28" y="28" width="240" height="34" rx="6" fill="#05070d" fill-opacity="0.78" stroke="${accent1}" stroke-opacity="0.5"/>
    <text x="42" y="50" fill="${accent1}" font-family="system-ui, sans-serif" font-size="14" font-weight="800">${safeChar} • ${safeShot}</text>
    <rect x="28" y="730" width="744" height="44" rx="8" fill="#05070d" fill-opacity="0.82" stroke="#ffffff" stroke-opacity="0.15"/>
    <text x="44" y="757" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="15" font-weight="600">${safePrompt}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Computes safe perimeter balloon coordinates enforcing the 5 Non-Negotiable Lettering Rules:
 * 1. No Face Occlusion (x: 26%-74%, y: 12%-56%)
 * 2. No Key-Action Corridor Occlusion (x: 22%-78%, y: 18%-78%)
 * 3. Negative-Space & Gutter Docking (top-left, top-right, bottom-left, bottom-right, top-gutter-flush, bottom-gutter-flush)
 * 4. Close-Up Chin / Gutter Rail Docking (CU/ECU: y >= 72% or y <= 4%, width <= 44%)
 * 5. Directional Tail Vectoring toward speaker mouth without balloon body intruding on face
 */
export function computeSafeBalloonPlacement(
  cameraShot: ComicEnginePanel['cameraShot'],
  balloonIndex = 0,
  existingBalloons: ComicVectorBalloon[] = []
): {
  xPct: number;
  yPct: number;
  widthPct: number;
  tailDirection: NonNullable<ComicVectorBalloon['tailDirection']>;
} {
  const isCloseUp = cameraShot === 'close_up' || cameraShot === 'extreme_close_up';
  const idx = (balloonIndex + existingBalloons.length) % 4;

  if (isCloseUp) {
    // Rule 4: Extreme top border strip (y <= 4%) or bottom gutter rail (y >= 72%), compact width <= 44%
    const cuSlots: Array<{
      xPct: number;
      yPct: number;
      widthPct: number;
      tailDirection: NonNullable<ComicVectorBalloon['tailDirection']>;
    }> = [
      { xPct: 4, yPct: 3, widthPct: 42, tailDirection: 'bottom_right' },
      { xPct: 54, yPct: 74, widthPct: 42, tailDirection: 'top_left' },
      { xPct: 54, yPct: 3, widthPct: 42, tailDirection: 'bottom_left' },
      { xPct: 4, yPct: 74, widthPct: 42, tailDirection: 'top_right' },
    ];
    return cuSlots[idx];
  }

  // Rules 1, 2, 3, 5: Perimeter negative-space docking outside face & center action corridor
  const standardSlots: Array<{
    xPct: number;
    yPct: number;
    widthPct: number;
    tailDirection: NonNullable<ComicVectorBalloon['tailDirection']>;
  }> = [
    { xPct: 4, yPct: 4, widthPct: 42, tailDirection: 'bottom_right' },
    { xPct: 54, yPct: 4, widthPct: 42, tailDirection: 'bottom_left' },
    { xPct: 4, yPct: 74, widthPct: 42, tailDirection: 'top_right' },
    { xPct: 54, yPct: 74, widthPct: 42, tailDirection: 'top_left' },
  ];
  return standardSlots[idx];
}

