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
  /** Which title gesture the exhibit uses: stamp (Ford), composing stick (Douglass), road line (Persia), madder line (Partition). */
  titleGesture: 'stamp' | 'composing' | 'road' | 'line' | 'set';
  /** Extra real faces of the exhibit: wood-type slab for dates, and the real scripts. */
  faces?: Partial<Record<'slab' | 'syriac' | 'han' | 'urdu' | 'devanagari' | 'gurmukhi', string>>;
}

/** The exhibit's own non-Latin strings the film may set, each tied to where the exhibit data carries it. */
export interface ScriptString { text: string; lang: 'syriac' | 'han' | 'urdu' | 'devanagari' | 'gurmukhi'; reading: string; /** File in the exhibit data/theme that carries this exact string. */ source: string }

/** A normalised rectangle (0..1 of a plate). */
export interface Rect01 { x: number; y: number; w: number; h: number }

/** Marks on a document plate that the Council allows: one underline, and a flat crop-in on unchanged pixels. */
export type PlateMark =
  | { kind: 'underline'; /** The spoken word the 14-frame draw lands on. */ anchor: string; /** Underline: x, y, w on the first plate (0..1). */ at: { x: number; y: number; w: number } }
  | { kind: 'detail'; anchor: string; /** The part of the plate that fills the window (same aspect as the plate). */ rect: Rect01; /** Seconds the move takes. */ dur?: number };

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
  /**
   * 'isolate': the plate's own pixels turned into a colour-isolated copy of one printed line (the Foreign Office map's red
   * boundary), never redrawn. Drawn on the flat ground, not over the plate; the unaltered map is shown in its own shot.
   */
  treatment?: { kind: 'isolate'; channel: 'red' };
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
  | { kind: 'dateStack'; items: Array<{ anchor: string; year: string; label: string }> }
  /** Douglass: wood-type handbill stack (Abril Fatface + Alfa Slab One), sets sort by sort on the spoken date. `blank`: last digit left as an empty quad. */
  | { kind: 'handbill'; items: Array<{ anchor: string; big: string; small?: string; blank?: boolean; about?: boolean }> }
  /** Douglass: a pull-quote set sort by sort in the margin on the spoken first word. */
  | { kind: 'pullQuote'; anchor: string; text: string; cite: string }
  /** Douglass: a thin gold route on a plain schematic, drawn as the narration names the places. */
  | { kind: 'route'; anchors: string[]; stops: Array<{ label: string; x: number; y: number }>; note: string }
  /** Persia: the road map on Natural Earth geometry. Full evidence field, no plate. */
  | { kind: 'roadMap'; basemap: 'persia'; stops: Array<{ id: string; label: string; lat: number; lon: number; anchor: string; year: string; script?: string; /** Unnamed bends [lat, lon] on the way from the previous stop. */ via?: Array<[number, number]> }>; note: string }
  /** Partition: contested figures as honest ranges (soft ends, no single number). */
  | { kind: 'rangeBar'; anchor: string; rows: Array<{ label: string; lo: number; hi: number; max: number; loText: string; hiText: string; source: string }> }
  /** Partition: the boundary as the Foreign Office map prints it, colour-isolated and wiped in over about 6 s. */
  | { kind: 'isoLine'; anchor: string; towns: Array<{ n: string; x: number; y: number; side: 'I' | 'P' }>; /** The part of the map that fills the window (normalised, same aspect as the map). */ view?: Rect01 }
  /** Persia: the stele's own characters in the margin, legible because they are the subject. */
  | { kind: 'steleScript'; anchor: string; script: string; reading: string; year: string };

export interface LowerThird { name: string; role: string; /** Seconds after the shot's voice starts; default 0.6. */ at?: number }

export interface CouncilShot {
  id: string;
  /** Index into CouncilFilm.rooms. */
  room: number;
  kind?: 'plates' | 'card' | 'animatedPainting' | 'graphic';
  /** kind 'animatedPainting': a real painting given motion by code (animatedPainting.ts). Owner-approved exception, painted battles only. */
  painting?: AnimatedPaintingSpec;
  transition?: TransitionName;
  /** Text set in the Stamp Slam bar (a spoken year or number). Also the word the slam lands on. */
  stamp?: string;
  plates?: PlateSpec[];
  /** One slate for a group of plates (printed pages side by side), or the source of a graphic shot. */
  groupSlate?: Slate;
  /** Word that leads the slate's second line instead of ARCHIVE (graphic shots: MAP). */
  slateLead?: string;
  beats?: CouncilBeat[];
  margin?: { year?: string; place?: string; /** A real script string set beside the English, legible at 64 px (Syriac, Chinese). */ script?: { text: string; reading: string } };
  graphic?: GraphicSpec;
  lowerThird?: LowerThird;
  /** Content-note card (Silence Hold). */
  card?: { lines: string[] };
  /** A card's section runs to the end of this shot (default: the end of its room); the score returns after it. */
  holdUntil?: string;
  /** A flat ground matched to the plate's own black point (a plate on a visible black rectangle: the ground is matched to the plate, never the reverse). */
  ground?: string;
  /** Underline and flat crop-in on the first plate (document plates only). */
  marks?: PlateMark[];
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
  /** Title lines per exhibit gesture: English plus the exhibit's own non-Latin strings (empty = English only). */
  titleScripts?: ScriptString[];
  /** Every non-Latin string the film may carry; the compiler refuses any other. Each is also listed on the end card as awaiting a native reader. */
  allowedScripts?: ScriptString[];
  /** Content-note chip set in the title sequence where the film needs one. */
  contentNote?: string;
  /** Lines for the end card's proofing block. */
  proofing?: string[];
  /** Partition: the madder rule persists as a margin hairline that thickens each room. */
  marginLine?: boolean;
  /** Bundled vector geometry for map graphics (Natural Earth, public domain). */
  basemaps?: Record<string, { attribution: string; bbox: [number, number, number, number]; layers: { land?: number[][][]; coast?: number[][][] } }>;
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
  kind: 'title' | 'plates' | 'card' | 'end' | 'animated' | 'graphic';
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
  /** Film-clock onsets of the anchors of each mark (underline draw, detail move). */
  marks: Array<{ mark: PlateMark; at: number }>;
}

export interface CaptionCue { shot: number; a: number; b: number; text: string; wordFrom: number; wordTo: number; words: TWord[] }
export interface FoleyEvent { at: number; kind: 'tap' | 'thunk' | 'tick' | 'musket' | 'click' | 'pluck' | 'scratch'; /** 0..1 relative level (default 1). */ gain?: number }
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
  /** Evidence field for a graphic shot with no plate: the whole field plus the margin column. */
  field: { x: 96, y: 56, w: 1728, h: 650 } as Box,
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
