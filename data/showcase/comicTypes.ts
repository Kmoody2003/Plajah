// data/showcase/comicTypes.ts — Master Comic Book & Manga Studio Showcase Types
// Aligns with Plajah Story Intelligence, Comic & Art Council, and Writers Council.

export type ComicGenre =
  | 'dark-noir'
  | 'seinen-kinetic'
  | 'silver-architect'
  | 'ligne-claire'
  | 'modern-cinematic'
  | 'shojo-gothic';

export type PanelGeometry =
  | 'standard-rect'
  | 'open-bleed'
  | 'widescreen-letterbox'
  | 'slanted-slash-left'
  | 'slanted-slash-right'
  | 'wrap-around-l'
  | 'circle-reticle'
  | 'vertical-monolith'
  | 'floating-inset';

export type BalloonStyle =
  | 'standard'
  | 'whisper'
  | 'shout'
  | 'comms'
  | 'thought'
  | 'jagged-monster';

export type SfxStyle =
  | 'orange-kinetic'
  | 'cyan-electric'
  | 'red-impact'
  | 'screentone-speed'
  | 'kirby-crackle'
  | 'ligne-ink';

export type CameraAngle =
  | 'extreme-wide'
  | 'wide'
  | 'medium'
  | 'close-up'
  | 'extreme-close-up'
  | 'low-angle-heroic'
  | 'high-angle-dutch'
  | 'over-the-shoulder'
  | 'bird-eye'
  | 'worm-eye';

export interface PositionSpec {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  maxWidth?: string;
  fontSize?: string;
}

export interface SpeechBalloon {
  speaker: string;
  text: string;
  style: BalloonStyle;
  tailDirection?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'none';
  position: PositionSpec;
}

export interface NarrativeCaption {
  text: string;
  kind: 'time-location' | 'internal-monologue' | 'voiceover' | 'technical-hud';
  position: PositionSpec;
}

export interface KineticSfx {
  word: string;
  style: SfxStyle;
  animation: 'shake' | 'pulse' | 'glitch' | 'float' | 'speedline';
  position: PositionSpec;
  fontSize?: string;
}

export interface SamLayerSpec {
  enabled: boolean;
  subjectName: string;
  confidenceScore: number;
  boundingBox: string;
  breakoutPixels: number;
}

export interface MotionSpec {
  enabled: boolean;
  motionType: 'video-loop' | 'animated-webp' | 'cinemagraph';
  timeRange: [number, number];
  fps: number;
}

export interface SequentialPanel {
  panelNumber: number;
  globalPanelNumber?: number;
  panelId?: string;
  geometry: PanelGeometry;
  flex: number;
  cameraAngle: CameraAngle;
  framingCode?: string;
  eyeVector: string; // e.g. "Top-Left Caption -> Center Subject -> Action SFX -> Bottom-Right Dialogue"
  artBrief: string;
  generationPrompt: string;
  editorialRationale?: string;
  captions: NarrativeCaption[];
  balloons: SpeechBalloon[];
  sfx?: KineticSfx[];
  samLayer?: SamLayerSpec;
  motion?: MotionSpec;
  imageUrl?: string;
  imageFallback?: string;
  timecodeSeconds?: number;
  anchorTimecodeSeconds?: number;
  endTimecodeSeconds?: number;
  muxPlaybackId?: string;
  sourceVideoUrl?: string;
}

export interface ComicPage {
  pageNumber: number;
  title: string;
  slugline?: string;
  act: string;
  actNumber?: number;
  timeRangeLabel?: string;
  summary?: string;
  sequenceBeat: string;
  layoutGrammar: string;
  activeLensName?: string;
  activeLensDesc?: string;
  panels: SequentialPanel[];
}

export interface ComicCharacter {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'deuteragonist' | 'mentor' | 'harbinger';
  archetype: string;
  personality: string[];
  lockedVisualLook: string;
  palette: string[];
  voiceSignature: string;
  arc: string;
}

export interface ShowcaseComicBook {
  id: string;
  templateId: string;
  title: string;
  subtitle: string;
  genre: ComicGenre;
  councilLenses: {
    leadArtist: string;
    leadWriter: string;
    storyIntelligence: string;
  };
  targetAudience: 'mature-17+' | 'young-adult-13+' | 'all-ages';
  pageCount: number;
  logline: string;
  blurb: string;
  theme: string;
  visualGrammar: {
    gutterWidth: string;
    gutterColor: string;
    pageTexture: string;
    primaryPalette: string[];
    typography: {
      bodyFont: string;
      captionFont: string;
      sfxFont: string;
    };
    inkingStyle: string;
  };
  characters: ComicCharacter[];
  pages: ComicPage[];
  remixIdeas: string[];
  councilDirectorNotes: string;
}
