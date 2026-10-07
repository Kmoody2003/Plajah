/**
 * The Motion Council's film style ("council"), as data.
 *
 * A council film is a timeline JSON: rooms, shots (each with plates, narration beats, a transition and an optional
 * graphic) and an end card. `compileCouncil` (councilCompile.ts) turns it into a deterministic timeline, runs the
 * build gates (label gate, overlap, holds, lower-third rules), and the painter (councilStyle.ts) draws any frame as a
 * pure function of time. Spec: docs/dossier/council/films-motion/synthesis.json.
 *
 * Everything below is in design units on a 1920x1080 frame; the painter scales to the canvas.
 */

import type { AnimatedPaintingSpec, LaidPainting } from './animatedPainting';

export type TransitionName = 'breath' | 'stampSlam' | 'formeLock' | 'roadLine' | 'madderRule' | 'reconGate' | 'silenceHold' | 'groundDip';

/** The exhibit's look. Built from services/dossier/dossierTheme.ts (see councilTheme in councilCompile.ts). */
export interface CouncilTheme {
  /** Real display face stack from the exhibit theme (Anton, Abril Fatface, ...). */
  display: string;
  upper: boolean;
  /** Reading serif for captions (Source Serif 4) and system sans for provenance (Inter Tight). */
  serif: string;
  sans: string;
  accent: string;
  bg: string;
  /** Body ink on the flat ground. */
  ink: string;
  /** The hollow RECONSTRUCTION frame colour. */
  stamp: string;
  /** Which title gesture the exhibit uses. Only 'stamp' (Ford) is built so far; the others fall back to 'set'. */
  titleGesture: 'stamp' | 'composing' | 'road' | 'line' | 'set';
}

export interface Slate {
  /** Archive: what the plate is. Reconstruction: unused. */
  title?: string;
  /** Archive: "Institution / author · Commons". */
  source?: string;
  year?: string;
  licence?: string;
  /** Reconstruction: one line saying what is evidence and what is imagined. */
  evidence?: string;
}

export interface PlateSpec {
  asset: string;
  /** Pixel size of the image file (its aspect decides the layout). */
  size: { w: number; h: number };
  kind: 'archive' | 'reconstruction';
  slate: Slate;
  /** The one labelled full-bleed reconstruction the owner allows per film. */
  fullBleed?: boolean;
  /** Fraction (0..1) of the plate's height to keep when a full-bleed painting is cropped to the field. */
  focusY?: number;
  /** Seconds this plate must be held with nothing animated over it (printed pages: 4). */
  minHold?: number;
  /** A face is visible: lower thirds never sit over it (they live in the margin column anyway). */
  distressing?: boolean;
}

export interface CouncilBeat {
  id: string;
  text: string;
  /** Ledger claim ids this sentence rests on. */
  claimIds: string[];
  /** Voiced line (scripts/dossier/narrate.ts); both set or both unset. */
  audio?: string;
  duration?: number;
}

export type GraphicSpec =
  | { kind: 'clock'; anchor: string }
  | { kind: 'wage'; anchor: string; anchor2: string }
  | { kind: 'counter'; anchor: string }
  | { kind: 'dateStack'; items: Array<{ anchor: string; year: string; label: string }> };

export interface LowerThird { name: string; role: string; /** Seconds after the shot's voice starts; default 0.6. */ at?: number }

export interface CouncilShot {
  id: string;
  /** Index into CouncilFilm.rooms. */
  room: number;
  kind?: 'plates' | 'card' | 'animatedPainting';
  /** kind 'animatedPainting': a real painting given motion by code (animatedPainting.ts). Owner-approved exception, painted battles only. */
  painting?: AnimatedPaintingSpec;
  transition?: TransitionName;
  /** Text set in the Stamp Slam bar (a spoken year or number). Also the word the slam lands on. */
  stamp?: string;
  plates?: PlateSpec[];
  /** One slate for a group of plates (printed pages side by side). */
  groupSlate?: Slate;
  beats?: CouncilBeat[];
  margin?: { year?: string; place?: string };
  graphic?: GraphicSpec;
  lowerThird?: LowerThird;
  /** Content-note card (Silence Hold). */
  card?: { lines: string[] };
  /** Minimum seconds the shot lasts after its transition. */
  minHold?: number;
}

export interface CouncilRoom {
  id: string;
  title: string;
  /** 1-based room numbers on the exhibit's plan strip this film room covers, e.g. [1, 2]. */
  exhibitRooms: [number, number];
  wing: string;
}

export interface EndCardBlock { head: string; lines: string[] }

export interface CouncilFilm {
  id: string;
  title: string;
  /** Title-sequence second line: dates, then the tagline. */
  dates: string;
  tagline: string;
  theme: CouncilTheme;
  /** Total rooms on the exhibit's plan strip (Ford: 8). */
  exhibitRoomCount: number;
  rooms: CouncilRoom[];
  /** The title sequence's real plate. */
  titlePlate: PlateSpec;
  shots: CouncilShot[];
  endCard: EndCardBlock[];
  /** Names and places set in the exhibit accent colour in captions (numbers and dates always are). */
  accentTerms: string[];
  /** The honesty line set under the title. */
  honesty: string;
  /** Seconds the end card holds (default 12). */
  endLen?: number;
}

// ── Compiled timeline ─────────────────────────────────────────────────────────────

export interface TWord { text: string; a: number; b: number; accent: boolean }
export interface TBeat { id: string; text: string; claimIds: string[]; a: number; b: number; words: TWord[]; audio?: string; voiced: boolean }
export interface Box { x: number; y: number; w: number; h: number }
export interface LaidPlate extends Box { spec: PlateSpec; /** Source rect when the plate is cropped (full-bleed painting); otherwise the whole image. */ crop?: Box }

export interface TShot {
  spec: CouncilShot;
  index: number;
  start: number;
  end: number;
  kind: 'title' | 'plates' | 'card' | 'end' | 'animated';
  transition: TransitionName;
  trDur: number;
  /** Time on the film clock where the first beat's voice begins. */
  voiceAt: number;
  beats: TBeat[];
  plates: LaidPlate[];
  /** Slate lines box under the plates. */
  slateBox?: Box;
  lowerThird?: { a: number; b: number; box: Box };
  /** Film-clock onset of the graphic's anchor word(s). */
  anchors: Record<string, number>;
  /** Index into rooms (title and end card use -1). */
  room: number;
  /** kind 'animated': the painting's window, slate box and resolved camera. */
  anim?: LaidPainting;
}

export interface CaptionCue { shot: number; a: number; b: number; text: string; wordFrom: number; wordTo: number; words: TWord[] }
export interface FoleyEvent { at: number; kind: 'tap' | 'thunk' | 'tick' | 'musket'; /** 0..1 relative level (default 1). */ gain?: number }
/** A continuous synthesised bed (wind) between two film-clock times. */
export interface AmbienceBed { from: number; to: number; kind: 'wind' }

export interface CouncilTimeline {
  film: CouncilFilm;
  fps: number;
  duration: number;
  titleEnd: number;
  shots: TShot[];
  rooms: Array<{ index: number; start: number; end: number; title: string; exhibitRooms: [number, number]; label: string }>;
  cues: CaptionCue[];
  /** Windows where the viewer may skip with any key (title sequence, content-note section). */
  skips: Array<{ from: number; to: number; label: string }>;
  /** Windows where the score is out (Silence Hold). */
  silences: Array<{ from: number; to: number }>;
  foley: FoleyEvent[];
  ambience: AmbienceBed[];
  /** 'voiced' when every beat has audio, 'estimated' when none do, 'mixed' otherwise. */
  timing: 'estimated' | 'voiced' | 'mixed';
  warnings: string[];
}

// ── Geometry (design units, 1920x1080) ────────────────────────────────────────────

export const DW = 1920;
export const DH = 1080;
export const GEO = {
  /** Evidence field: plates sit on the left two thirds. */
  plateZone: { x: 96, y: 56, w: 1120, h: 652 } as Box,
  /** Flat margin column on the right third (year, place, graphics, lower third). */
  margin: { x: 1344, y: 56, w: 480, h: 740 } as Box,
  /** Caption band: bottom 22%. */
  caption: { x: 96, y: 843, w: 1340, h: 149 } as Box,
  captionBaselines: [912, 970] as [number, number],
  captionSize: 44,
  hairlineY: 1058,
  roomLabel: { x: 1344, y: 1016, w: 480, h: 34 } as Box,
  /** Reconstructions are smaller than the plates they follow. */
  reconZone: { x: 96, y: 56, w: 1120, h: 520 } as Box,
  /** Full-bleed reconstruction: edge to edge across the evidence field. */
  bleed: { x: 0, y: 0, w: 1920, h: 760 } as Box,
  /** Under-plate provenance slate. */
  slateH: 92,
  lowerThird: { x: 1344, y: 440, w: 480, h: 130 } as Box,
};

export const frames = (n: number, fps = 30) => n / fps;

export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
