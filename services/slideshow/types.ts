// Themed Shows — shared types.
//
// A "show" is a programmatic slideshow: a themed 3D scene (the Lantern Garden is the
// first), a set of prepared photos placed into it, and a plan of camera segments that
// fly through the scene, go full page on each photo and pull back out. Everything that
// moves is a pure function of show time `t`, so the same show can be:
//   • played live (interactive: tap any photo to bring it full screen),
//   • rendered frame-by-frame to a video file, and
//   • placed on a Fabula timeline as editable "interactive scene" clips that the
//     Fabula preview re-renders at any time.

export type ShowThemeId = 'lantern-garden' | 'classic';

/** Classic transition styles (the planner picks per cut unless the owner pins one). */
export type ClassicTransition = 'crossfade' | 'dip' | 'drift' | 'parallax-push' | 'soft-wipe';

/** Normalised crop rectangle in source pixels' 0..1 space. */
export interface CropRect { x: number; y: number; w: number; h: number }

/** One photo as the show sees it, after smart prep. */
export interface ShowPhoto {
  id: string;
  /** Where the pixels came from (storage URL or object URL for a local folder). */
  src: string;
  title?: string;
  /** Free caption shown under the full-page photo and hand-written on the polaroid. */
  caption?: string;
  /** Capture date (ms) when known — used for ordering and the polaroid's pen date. */
  takenAt?: number;
  /** Upright pixel size after orientation correction. */
  width: number;
  height: number;
  /** Extra rotation the owner asked for, in quarter turns (applied after EXIF). */
  quarterTurns?: number;
  /** Square crop for the polaroid window, centred on faces / the subject. */
  polaroidCrop: CropRect;
  /** Subject centre (0..1) — the full-page slow push drifts toward it. */
  focus: { x: number; y: number };
  faces: number;
  /** 0..1 — how much there is to look at (detail, faces, people). Drives dwell time. */
  interest: number;
  /** Tone fix the prep pass decided on (applied when the textures are built). */
  fix: PhotoFix;
  /** Owner overrides from the studio. */
  dwellOverride?: number;
  pinned?: boolean;
}

export interface PhotoFix {
  /** Per-channel black and white points (0..1) for a gentle levels stretch. */
  black: [number, number, number];
  white: [number, number, number];
  /** Gamma lift for under-exposed shots (1 = none). */
  gamma: number;
  /** Saturation multiplier (1 = none). */
  saturation: number;
  /** 0..1 strength the fix is blended in with — never a full auto-correct on a memory. */
  strength: number;
}

export type MusicMode = 'none' | 'playlist' | 'loop';

export interface ShowTrack {
  id: string;
  title: string;
  src: string;
  /** Seconds, once decoded. */
  duration?: number;
}

export interface ShowMusic {
  mode: MusicMode;
  tracks: ShowTrack[];
  /** Fit photo timing to the playlist length (playlist mode only). */
  fitToMusic?: boolean;
  volume?: number;
}

export interface ShowDedication {
  /** "In loving memory of" line. */
  heading: string;
  name: string;
  /** e.g. "1948 – 2026" */
  dates?: string;
  /** Closing line on the end card. */
  closing: string;
}

/** Everything needed to rebuild the show anywhere (live, render, Fabula). */
export interface ShowSpec {
  version: 1;
  id: string;
  theme: ShowThemeId;
  title: string;
  dedication: ShowDedication;
  photos: ShowPhoto[];
  music: ShowMusic;
  /** Pace multiplier: 1 = default graceful pace, 1.25 = slower, 0.85 = a little quicker. */
  pace: number;
  /** Wide "breath" shot every N photos. */
  wideEvery: number;
  /** Classic theme: transition length (s) and style ('auto' varies them gracefully). */
  transition?: { style: ClassicTransition | 'auto'; seconds: number };
  /** Classic theme: depth parallax strength 0..1 (0 = flat Ken Burns only). */
  parallax?: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------------------
// Plan — a list of camera segments. Each one is self-contained (it knows its own start
// and end poses) so a Fabula clip can render any segment on its own.

export type SegmentKind = 'intro' | 'visit' | 'wide' | 'outro';

export interface ShowSegment {
  id: string;
  kind: SegmentKind;
  /** Start in show time, seconds. */
  start: number;
  duration: number;
  /** For `visit`: which photo. */
  photoIndex?: number;
  /** Visit timing (seconds, relative to segment start). */
  visit?: VisitTiming;
  /** Classic: the transition into the NEXT segment (overlaps this one's tail). */
  transition?: ClassicTransition;
}

export interface VisitTiming {
  /** Glide from the previous pull-back pose to the front of the polaroid. */
  travel: number;
  /** Lean in until the polaroid fills the frame. */
  approach: number;
  /** Full-page hold (includes its own fade in / fade out). */
  dwell: number;
  /** Pull back out to the string. */
  retreat: number;
}

export interface ShowPlan {
  segments: ShowSegment[];
  duration: number;
  /** Seconds each photo spends full page, by photo index. */
  fullPage: number[];
}
