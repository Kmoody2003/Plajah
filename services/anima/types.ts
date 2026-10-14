/**
 * services/anima/types.ts
 *
 * Plajah Unified Motion & Animation System ("Anima")
 * Shared across:
 * - Fabula 2D Animation Room (Cel, Stop-Motion, Bone Rigging)
 * - Fabula Video NLE (Clip Keyframing, Automation Curves)
 * - Fabula VFX & Compositing (Node Parameter Drivers)
 * - Lower Thirds & Broadcast Graphics
 * - Tela Living Documents (Scroll-driven & Interactive Motion)
 * - Future Plajah 3D Engine (Homogeneous 3D Transform Pipeline)
 */

export type InterpolationEase =
  | 'linear'
  | 'hold'
  | 'smooth'
  | 'in'
  | 'out'
  | 'bezier'
  | 'elastic'
  | 'bounce';

/** Cubic Bézier tangent handle for fine graph curve editing */
export interface BezierHandle {
  dx: number; // offset in seconds from keyframe time
  dy: number; // offset in value from keyframe value
}

export interface Keyframe<T = number> {
  id: string;
  t: number;            // seconds from clip / sequence head
  v: T;                 // value (scalar number, string celId, or vector [x,y,z])
  ease?: InterpolationEase;
  inHandle?: BezierHandle;
  outHandle?: BezierHandle;
}

/** Mathematical expression attached to a track */
export interface ExpressionDef {
  enabled: boolean;
  code: string;         // e.g. "wiggle(4, 15)", "loopOut('cycle')", "Math.sin(time * 3) * 20"
}

/** Physics & procedural motion behavior */
export type BehaviorKind =
  | 'spring'
  | 'wobble'
  | 'inertia'
  | 'follow'
  | 'auto_orient'
  | 'noise';

export interface BehaviorConfig {
  kind: BehaviorKind;
  enabled: boolean;
  mass?: number;        // default 1.0
  stiffness?: number;   // default 120.0
  damping?: number;     // default 14.0
  frequency?: number;   // default 2.0 (Hz)
  amplitude?: number;   // default 10.0
  decay?: number;       // default 0.92
  lagSeconds?: number;  // for follow behavior (default 0.1)
  targetChannel?: string; // target channel for follow/leader
}

/** A single animated channel (e.g. 'transform.x', 'opacity', 'bone.arm.rot') */
export interface AnimaChannel<T = number> {
  id: string;
  name: string;
  path?: string;        // target property path: 'transform.x', 'fx.blur', 'points'
  targetProperty?: string;
  defaultValue: T;
  keyframes: Keyframe<T>[];
  expression?: ExpressionDef;
  behavior?: BehaviorConfig;
  unit?: string;        // '%', 'px', '°', '×'
  min?: number;
  max?: number;
}

/** Cel / Stop-Motion Exposure Span on the X-Sheet */
export interface ExposureCell {
  startFrame: number;   // 1-based or 0-based frame number
  durationFrames: number; // Hold duration (e.g. 2 for animating "on 2s")
  drawingId: string;    // ID in the DrawingBank, or '__EMPTY__' for blank cel
}

export interface CelTrack {
  id: string;
  name: string;
  layerId: string;
  stepRate: 1 | 2 | 3 | 4; // Default hold cadence (1s, 2s, 3s, 4s)
  exposures: ExposureCell[];
}

export interface DrawingStrokePoint {
  x: number;
  y: number;
  z?: number;           // 3D-ready coordinate
  pressure?: number;    // 0..1 stylus pressure
  size?: number;
}

export interface DrawingStroke {
  id: string;
  points: DrawingStrokePoint[];
  color: string;
  width: number;
  opacity: number;
  cap?: 'round' | 'butt' | 'square';
  join?: 'round' | 'bevel' | 'miter';
  fill?: string | null;
}

export interface DrawingCel {
  id: string;
  name: string;
  strokes: DrawingStroke[];
  rasterDataUrl?: string; // for physical stop-motion webcam/scanner captures
  thumbnailUrl?: string;
  width: number;
  height: number;
  createdAt: number;
}

/** 2D/3D Bone for Skeletal Rigging and Smart Bones */
export interface AnimaBone {
  id: string;
  name: string;
  parentId: string | null;
  length: number;
  baseAngle: number;    // degrees
  pivot: [number, number, number]; // [x, y, z]
  color?: string;
  // Smart Bone: angle drives arbitrary channel
  smartActions?: {
    channelPath: string;
    minAngle: number;
    maxAngle: number;
    minValue: number;
    maxValue: number;
  }[];
}

/** Onion Skin Configuration for Cel & Stop-Motion */
export interface OnionSkinConfig {
  enabled: boolean;
  prevFrames: number;   // e.g. 2 frames back
  nextFrames: number;   // e.g. 1 frame forward
  prevColor: string;    // e.g. 'rgba(0, 218, 243, 0.4)' (Cyan)
  nextColor: string;    // e.g. 'rgba(212, 0, 85, 0.4)' (Magenta)
  opacityFalloff: number; // 0.5 per frame step
}

export interface AnimaLayer {
  id: string;
  name: string;
  type: 'vector' | 'cel' | 'bone' | 'group' | 'camera' | 'audio' | 'stop_motion' | 'character';
  visible: boolean;
  locked: boolean;
  opacity: number;
  parentId: string | null;
  transform: {
    x: number;
    y: number;
    z: number;          // 3D coordinate
    rotationX: number;
    rotationY: number;
    rotationZ: number;  // 2D rotation
    scaleX: number;
    scaleY: number;
    scaleZ: number;
  };
  channels: Record<string, AnimaChannel<number>>;
  celTrack?: CelTrack;
  bones?: AnimaBone[];
}

/** Complete Timeline Project Document for Anima */
export interface AnimaProject {
  id: string;
  name: string;
  fps: number;          // 24 (anime standard), 25 (PAL), 30, 60
  durationFrames: number;
  width: number;
  height: number;
  currentFrame: number;
  drawingBank: Record<string, DrawingCel>;
  layers: AnimaLayer[];
  onionSkin: OnionSkinConfig;
  camera: {
    x: number;
    y: number;
    z: number;
    zoom: number;
    rotation: number;
  };
  selectedLayerId: string | null;
  selectedBoneId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RIGGING, MASS DYNAMICS & STORY DOSSIER TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CharacterMorphologyType = 'biped_humanoid' | 'quadruped_animal' | 'mascot_creature' | 'mechanical_vehicle' | 'ethereal_spirit';

export type MassMaterialKind = 'organic_flesh' | 'jelly_mascot' | 'heavy_mech' | 'ethereal_cloth' | 'rigid_solid';

export interface AnatomicalLandmark {
  id: string;
  name: string;
  x: number;          // relative 0..1 coordinate in artwork bbox
  y: number;
  z?: number;
  confidence: number; // 0..1
  partType: 'head' | 'neck' | 'chest' | 'pelvis' | 'shoulder_l' | 'elbow_l' | 'wrist_l' | 'hand_l'
          | 'shoulder_r' | 'elbow_r' | 'wrist_r' | 'hand_r' | 'hip_l' | 'knee_l' | 'ankle_l' | 'foot_l'
          | 'hip_r' | 'knee_r' | 'ankle_r' | 'foot_r' | 'tail_root' | 'tail_tip' | 'jaw' | 'eye_l' | 'eye_r'
          | 'wheel_front' | 'wheel_rear' | 'chassis_center';
}

export interface CharacterMassProfile {
  estimatedMassKg: number;
  centerOfMass: { x: number; y: number }; // normalized 0..1
  momentOfInertia: number;                // rotational resistance
  materialKind: MassMaterialKind;
  bounceElasticity: number;               // 0 (clay) .. 1 (superball)
  squashStretchFactor: number;            // 0 (steel) .. 2.0 (squashy jelly)
  gravityDamping: number;                 // ground impact settling speed
}

export interface CharacterStoryDossier {
  characterId: string;
  worldId?: string;
  name: string;
  archetype?: string;                     // e.g. "Titan / Kaiju", "Nimble Thief", "Playful Mascot", "Android"
  role?: string;
  physicalStats?: {
    height?: string;                      // e.g. "6'2"" or "45 meters"
    weight?: string;                      // e.g. "210 lbs" or "40,000 tons"
    age?: string;
    species?: string;
  };
  personalityTraits?: string[];           // ["stoic", "heavy footed", "protective"]
  locomotionStyle?: 'heavy_lumber' | 'nimble_stride' | 'mascot_bob' | 'quadruped_prowl' | 'ethereal_float' | 'vehicle_cruise';
  defaultMood?: string;
  voicePrintId?: string;
}

export interface AutoRigResult {
  rigId: string;
  morphology: CharacterMorphologyType;
  landmarks: AnatomicalLandmark[];
  bones: AnimaBone[];
  massProfile: CharacterMassProfile;
  walkCycleChannels: Record<string, AnimaChannel<number>>;
  emotionStances: Record<string, Record<string, number>>; // stanceName -> channelPath: value
  storyDossierApplied?: CharacterStoryDossier;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORY INTELLIGENCE VOICE PRINTS & REAL-TIME BACKGROUND DIALOGUE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CharacterVoicePrint {
  id: string;
  characterId: string;
  characterName: string;
  provider: 'kokoro' | 'fish_speech' | 'web_speech';
  voiceId: string;                        // e.g. 'af_heart', 'am_fenrir', 'bf_alice'
  pitchMultiplier: number;                // 0.5 .. 2.0
  rateMultiplier: number;                 // 0.5 .. 2.0
  timbreDescription: string;              // "Deep, gravelly bass with deliberate cadence"
  emotionalPresets: Record<string, { pitch: number; rate: number; energy: number }>;
}

export interface ScriptDialogueCue {
  id: string;
  speaker: string;
  text: string;
  parenthetical?: string;
  sceneIndex: number;
  lineIndex: number;
  associatedSfx?: string[];               // e.g. ["door_slam", "thunder"]
}

export interface BackgroundDialogueTakeResult {
  takeId: string;
  cueId: string;
  speaker: string;
  text: string;
  durationSeconds: number;
  audioWavBlob?: Blob;
  audioDataUri?: string;
  wordMarks: Array<{ word: string; startSec: number; endSec: number; viseme?: string }>;
  synthesizedSfx: Array<{ sfxId: string; preset: string; offsetSec: number }>;
  generatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OFF-PLATFORM VIDEO LIP-SYNC BRIDGE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface VideoMouthRegion {
  x: number;      // 0..1 bounding box
  y: number;
  width: number;
  height: number;
  anchorCenter: { x: number; y: number };
  featherRadius?: number;
}

export interface LipSyncVisemeFrame {
  timeSec: number;
  frameIndex: number;
  visemePhoneme: 'A' | 'E' | 'I' | 'O' | 'U' | 'M' | 'REST';
  jawOpen: number;      // 0..1
  mouthWide: number;    // 0..1
  mouthPucker: number;  // 0..1
  audioEnergy: number;  // 0..1
}

export interface VideoLipSyncTrackResult {
  id: string;
  videoSourceUrl: string;
  audioTakeId: string;
  durationSeconds: number;
  mouthRegion: VideoMouthRegion;
  visemeFrames: LipSyncVisemeFrame[];
  bakedChannels: Record<string, AnimaChannel<number>>;
}
