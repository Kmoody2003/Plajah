// services/comicProject/types.ts — the one editable document behind Tela's comic mode.
//
// A ComicProject is what Tela comic / manga / graphic-novel mode opens, edits, autosaves
// and exports. It is a lossless superset of the showcase ShowcaseComicBook format: every
// field a showcase book carries has a home here, so a book can be opened as a project
// and exported back unchanged (see showcaseImport.ts + tests/comicProject.test.ts).
//
// The page/panel/nested-document shapes are the ones TelaNativeComicVariant2 already
// renders; the optional fields below are what Pumpkin Patch v4 and the other living
// graphic novels need on top of them.

import type { CinemagraphEffectType } from '../comic/panelMotionEngine';
import type { InterpolationEase } from '../anima/types';
import type {
  BalloonStyle,
  CameraAngle,
  ComicCharacter,
  KineticSfx,
  MotionSpec,
  NarrativeCaption,
  PanelGeometry,
  PositionSpec,
  SfxStyle,
  ShowcaseComicBook,
  SpeechBalloon,
} from '../../data/showcase/comicTypes';

export type {
  BalloonStyle,
  CameraAngle,
  ComicCharacter,
  MotionSpec,
  PanelGeometry,
  PositionSpec,
  SfxStyle,
};

export type PanelLayoutPresetId =
  | 'action-4-grid'
  | 'manga-5-dynamic'
  | 'widescreen-3-tier'
  | 'storybook-2-spread'
  /** Rows packed on a 12-column grid from each panel's `flex` (showcase books). */
  | 'flex-rows'
  /** Hand-edited boxes (after a split); no automatic relayout. */
  | 'custom';

export type BalloonSafeDockZone =
  | 'top-left'
  | 'top-gutter-flush'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-gutter-flush'
  | 'bottom-right';

export type ComicBalloonStyle =
  | 'SPEECH'
  | 'THOUGHT'
  | 'SHOUT'
  | 'WHISPER'
  | 'COMMS'
  | 'MONSTER'
  | 'NARRATION_CAPTION';

export type TailDirection = NonNullable<SpeechBalloon['tailDirection']>;

export interface SpeechBalloonItem {
  id: string;
  speaker: string;
  text: string;
  style: ComicBalloonStyle;
  dockZone: BalloonSafeDockZone;
  xPct: number;
  yPct: number;
  widthPct: number;
  tailTargetXPct: number;
  tailTargetYPct: number;
  /** Caption flavour when style is NARRATION_CAPTION. */
  captionKind?: NarrativeCaption['kind'];
  /** Corner the tail points from; 'none' hides it. Unset = legacy free tail. */
  tailDirection?: TailDirection;
  /**
   * The imported CSS position. While xPct/yPct still equal `sourceXY` the balloon has not
   * been moved, so it renders and exports with the exact original position.
   */
  source?: PositionSpec;
  sourceXY?: { xPct: number; yPct: number; widthPct: number };
}

export interface KanjiSfxItem {
  id: string;
  /** Display word (kanji for manga stamps, the onomatopoeia for western SFX). */
  kanji: string;
  romaji: string;
  meaning: string;
  xPct: number;
  yPct: number;
  scale: number;
  rotationDeg: number;
  colorHex: string;
  strokeHex: string;
  fxStyle?: SfxStyle;
  animation?: KineticSfx['animation'];
  fontSize?: string;
  source?: PositionSpec;
  sourceXY?: { xPct: number; yPct: number };
}

export interface HalftoneLayerConfig {
  enabled: boolean;
  dotsPerInch: number;
  opacity: number;
  colorHex: string;
}

export interface PanelKeyframeItem {
  id: string;
  timeSec: number;
  scale: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  /** Anima easing into the next keyframe (sampled with services/anima/evaluator). */
  ease?: InterpolationEase;
}

export interface PanelSubLayer {
  id: string;
  name: string;
  kind:
    | 'BACKGROUND_PLATE'
    | 'MIDGROUND_DEPTH'
    | 'CHARACTER_CAST'
    | 'INK_DRAWING'
    | 'SCREENTONE_SHADER'
    | 'KANJI_SFX'
    | 'SPEECH_BALLOONS';
  visible: boolean;
  locked: boolean;
  keyframes: PanelKeyframeItem[];
}

export interface NestedPanelTelaDocument {
  id: string;
  timelineDurationSec: number;
  cinemagraphPreset: CinemagraphEffectType;
  halftone: HalftoneLayerConfig;
  layers: PanelSubLayer[];
  inkStrokes: {
    id: string;
    brushId: string;
    colorHex: string;
    sizePx: number;
    opacity: number;
    svgPath: string;
  }[];
  balloons: SpeechBalloonItem[];
  sfxItems: KanjiSfxItem[];
}

/** Source footage a panel was transliterated from, plus its living loop. */
export interface PanelVideoSource {
  sourceVideoUrl?: string;
  muxPlaybackId?: string;
  timecodeSeconds?: number;
  anchorTimecodeSeconds?: number;
  endTimecodeSeconds?: number;
  /** Living-panel loop (cinemagraph / video loop) over [timeRange]. */
  loop?: MotionSpec;
}

/** SAM subject cut-out that lifts off the plate (2.5D breakout). */
export interface PanelSubjectLayer {
  enabled: boolean;
  subjectName: string;
  confidenceScore: number;
  /** Normalised 0..1 box within the panel; values past 1 break out of the frame. */
  box: { x: number; y: number; w: number; h: number };
  breakoutPixels: number;
  /** Original string form, kept so export is byte-identical when untouched. */
  rawBoundingBox?: string;
}

/** Non-destructive pan/zoom of the art inside its frame (Hand Reframe). */
export interface PanelReframe {
  panXPct: number;
  panYPct: number;
  zoom: number;
}

export interface ComicPanelNode {
  id: string;
  order: number;
  cameraShot:
    | 'ESTABLISHING_WIDE'
    | 'MEDIUM_ACTION'
    | 'LOW_ANGLE_HERO'
    | 'HIGH_ANGLE_TENSION'
    | 'CLOSE_UP'
    | 'EXTREME_CLOSE_UP';
  prompt: string;
  narrativeCaption?: string;
  renderedImageUrl?: string;
  box: {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    clipPolygon?: { xPct: number; yPct: number }[];
  };
  nestedDocument: NestedPanelTelaDocument;

  // ── Graphic-novel fields (all optional; present on imported showcase panels) ──
  panelNumber?: number;
  globalPanelNumber?: number;
  sourcePanelId?: string;
  geometry?: PanelGeometry;
  /** Share of a 12-column row (flex-rows pages). */
  flex?: number;
  cameraAngle?: CameraAngle;
  framingCode?: string;
  eyeVector?: string;
  artBrief?: string;
  generationPrompt?: string;
  editorialRationale?: string;
  imageFallback?: string;
  video?: PanelVideoSource;
  subject?: PanelSubjectLayer;
  reframe?: PanelReframe;
}

export interface ComicPageMeta {
  pageNumber?: number;
  slugline?: string;
  act?: string;
  actNumber?: number;
  timeRangeLabel?: string;
  summary?: string;
  sequenceBeat?: string;
  layoutGrammar?: string;
  activeLensName?: string;
  activeLensDesc?: string;
}

export interface ComicPageDocument {
  id: string;
  title: string;
  presetId: PanelLayoutPresetId;
  gutterPx: number;
  paperColorHex: string;
  panels: ComicPanelNode[];
  /** Page height ÷ width. Unset = classic 4:3 portrait page (1040/780). */
  aspect?: number;
  meta?: ComicPageMeta;
}

export type ComicProjectFormat = 'comic' | 'manga' | 'graphic-novel' | 'storybook';

/** Book-level showcase data (everything but the pages). */
export type ComicBookMeta = Omit<ShowcaseComicBook, 'pages'>;

export interface ComicProject {
  schema: 'plajah.comicProject';
  version: 1;
  id: string;
  title: string;
  format: ComicProjectFormat;
  readingDirection: 'ltr' | 'rtl';
  /** Where the project was opened from, so it can be reset to source. */
  source?: { kind: 'showcase'; showcaseId: string };
  /** Showcase book metadata (characters, visual grammar, council lenses…). */
  book?: ComicBookMeta;
  pages: ComicPageDocument[];
  createdAt: number;
  updatedAt: number;
}

export interface ComicProjectSummary {
  id: string;
  title: string;
  format: ComicProjectFormat;
  pageCount: number;
  panelCount: number;
  coverUrl?: string;
  source?: ComicProject['source'];
  updatedAt: number;
  /** Saved from another device; downloads when opened. */
  inCloudOnly?: boolean;
}

export const DEFAULT_PAGE_ASPECT = 1040 / 780;
