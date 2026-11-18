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

export type ShowThemeId = 'lantern-garden' | 'classic' | 'backyard';

/** Classic transition styles (the planner picks per cut unless the owner pins one). */
export type ClassicTransition = 'crossfade' | 'dip' | 'drift' | 'parallax-push' | 'soft-wipe';

/** A grade + lens: the platform's cinematic LUTs and lenses. Always drawn under the text. */
export interface ShowLook {
  /** CINEMATIC_LUTS id. */
  lut?: string;
  /** 0..1 (default 1). */
  lutStrength?: number;
  /** LENSES id ('none' = off). */
  lens?: string;
}

/** Normalised crop rectangle in source pixels' 0..1 space. */
export interface CropRect { x: number; y: number; w: number; h: number }

/** One photo as the show sees it, after smart prep. */
export interface ShowPhoto {
  id: string;
  /** Where the pixels came from (storage URL or object URL for a local folder). */
  src: string;
  title?: string;
  /** The shot's description (story text). Shown only when showCaption is on (off by default). */
  caption?: string;
  /** Looks like a graphic (poster, obituary cover, flyer, card, screenshot): never cropped into a print. */
  graphic?: boolean;
  /** 0..1 how graphic-like it scored (for the studio badge). */
  graphicScore?: number;
  /** Owner override: true = always its own full-screen shot (fit 16:9), false = treat as a photo. */
  fullFrame?: boolean;
  /** Auto-trim (0..1 of the upright image): black/white borders and phone-screenshot chrome removed. */
  trim?: CropRect;
  /** Why it was trimmed: 'borders' | 'screenshot'. */
  trimReason?: 'borders' | 'screenshot' | 'manual';
  /** Owner override: show the original framing (ignore the auto-trim). */
  keepFraming?: boolean;
  /** Owner's own crop of the picture (0..1 of the upright original) — replaces the auto-trim. */
  manualCrop?: CropRect;
  /** Owner's own polaroid window (0..1 of the cropped picture) — replaces the face-aware square. */
  manualPolaroid?: CropRect;
  /** Size of the photo when it goes full page (0.6..1, default 1 = as large as fits). */
  fullScale?: number;
  /** This photo's own look while it is the shot on screen (overrides the show's). */
  look?: ShowLook;
  /** Show the description on this shot (under the full page, on the polaroid). Off by default. */
  showCaption?: boolean;
  /** Where the description came from: typed by the owner, a descriptive file name, or read from the picture. */
  captionSource?: 'typed' | 'filename' | 'picture';
  /** Capture date (ms) when known — used for ordering and the polaroid's pen date. */
  takenAt?: number;
  /** Where takenAt came from: EXIF is trusted by the director; a file date is only a hint. */
  timeSource?: 'exif' | 'file' | 'user';
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
  /** Vision understanding (occasion, setting, mood…) when the vision pass has run. */
  context?: import('./director').VisionContext;
  /** Set by the Show Director. */
  event?: string;
  eventLabel?: string;
  role?: import('./director').DirectorRole;
  directorWeight?: number;
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
  /** Transition length (s) and style: 'auto' picks from the theme's palette; otherwise a Classic
   *  move or any Fabula library transition id ("exposure-blur" or "exposure-blur:bloom"). */
  transition?: { style: ClassicTransition | 'auto' | string; seconds: number };
  /** Burn the plajah.com bug into renders / shared playback (Free and Spark plans). Set by the system. */
  brandBug?: boolean;
  /** The whole show's look (grade + lens); a photo's own look overrides it on its shots. */
  look?: ShowLook;
  /** Show Director: event detection + emotional ordering. */
  director?: { enabled: boolean; style: import('./director').DirectorStyle; notes?: string[] };
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
  /** Classic: the transition into the NEXT segment (overlaps this one's tail). A Classic move or a Fabula id. */
  transition?: ClassicTransition | string;
  /** Back Yard: the Fabula transition that brings this segment in (cuts between plates). */
  transitionIn?: string;
  /** Back Yard: which plate is on screen and which photo sits in each of its windows. */
  plate?: PlateScene;
  /** First visit of a new event: the chapter line shown as the camera arrives. */
  chapter?: string;
}

export interface PlateScene {
  /** Asset id in the Back Yard pack (still plate, loop, opening or closing shot). */
  asset: string;
  /** Photo index for each window id (−1 = leave as is). */
  assign: number[];
  /** Visit: the window the camera leans into. */
  window?: number;
  /** Visit: the previous segment shows the same plate (pan instead of dissolve). */
  same?: boolean;
  /** Bokeh loop behind the full-page photo. */
  bokeh?: string;
  /** Seconds into the loop this segment starts at (loops, bokeh). */
  offset?: number;
  /** A graphic shown whole, full screen over a soft lantern backdrop (no print, no crop). */
  full?: boolean;
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
