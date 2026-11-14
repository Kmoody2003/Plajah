// cgTypes — the document model of Fabula CG, the motion-graphics & title system
// powered by Tela (fonts, palettes, type pairings, design lessons).
//
// One CgGraphic is a small broadcast scene: layered shapes, text bound to data
// fields, images, tickers and clocks. Every layer has an IN move, an optional
// OUT move, an optional LOOP that runs while the graphic holds on air, and
// optional keyframes. Everything is a pure function of (graphic-local time t,
// total duration D):
//
//   Fabula timeline   D = the clip's duration (drag handles → the OUT retimes)
//   Live playout      D = Infinity while the graphic holds; pressing OUT sets
//                     D = (secondsOnAir + timing.out) so the exit plays now
//   Transitions       D = timing.in + timing.out; the program cut happens at cutPoint
//
// So the timeline monitor, the offline export, the Stage output and the live
// switcher all draw identical pixels from the same evaluator (cgEvaluate.ts) and
// the same Canvas2D renderer (cgRender.ts). No React, no DOM in this file.
import type { FontKey } from '../../tela/telaFonts';
import type { TitleAnim } from '../titleAnimators';

/** Design space: every graphic is authored on a 1920×1080 frame and scaled to the output. */
export const CG_W = 1920, CG_H = 1080;

export type CgCategory =
  | 'lower-third' | 'full-page' | 'transition' | 'bug' | 'ticker' | 'title'
  | 'opener' | 'end-card' | 'scoreboard' | 'clock' | 'countdown' | 'social'
  | 'quote' | 'callout' | 'locator' | 'data' | 'frame';

export const CG_CATEGORIES: { id: CgCategory; label: string; hint: string }[] = [
  { id: 'lower-third', label: 'Lower Thirds', hint: 'Name supers, straps, two-liners, kickers' },
  { id: 'full-page', label: 'Full Pages', hint: 'Full-frame boards: headlines, bullets, stats' },
  { id: 'transition', label: 'Transitions', hint: 'Stingers and wipes that cover a cut' },
  { id: 'title', label: 'Titles', hint: 'Centered titles, chapter cards, section heads' },
  { id: 'opener', label: 'Openers', hint: 'Show opens and identity reveals' },
  { id: 'end-card', label: 'End Cards', hint: 'Outros, credits, subscribe boards' },
  { id: 'bug', label: 'Bugs', hint: 'Persistent corner identity and LIVE flags' },
  { id: 'ticker', label: 'Tickers', hint: 'Crawls and flip tickers' },
  { id: 'scoreboard', label: 'Scoreboards', hint: 'Score strips and match boards' },
  { id: 'clock', label: 'Clocks', hint: 'Time of day and running clocks' },
  { id: 'countdown', label: 'Countdowns', hint: 'Starting-soon and break timers' },
  { id: 'social', label: 'Social', hint: 'Handles, comments and chat callouts' },
  { id: 'quote', label: 'Quotes', hint: 'Pull quotes and scripture/verse cards' },
  { id: 'callout', label: 'Callouts', hint: 'Pointers, labels and annotation tags' },
  { id: 'locator', label: 'Locators', hint: 'Location, dateline and weather tags' },
  { id: 'data', label: 'Data', hint: 'Stat cards, polls and result bars' },
  { id: 'frame', label: 'Frames', hint: 'Picture-in-picture and guest frames' },
];

export type CgEase = 'linear' | 'out' | 'in' | 'inOut' | 'back' | 'expo' | 'bounce' | 'elastic' | 'quart' | 'circ';

export type CgMoveType =
  | 'none' | 'fade'
  | 'slideL' | 'slideR' | 'slideU' | 'slideD'
  | 'wipeL' | 'wipeR' | 'wipeU' | 'wipeD' | 'wipeCenterX' | 'wipeCenterY' | 'iris'
  | 'growX' | 'growY' | 'pop' | 'zoom' | 'spin' | 'drop' | 'blur' | 'flipX' | 'flipY' | 'skew';

export interface CgMove {
  type: CgMoveType;
  /** Seconds. */
  dur: number;
  /** IN: seconds after the graphic starts. OUT: seconds before the graphic ends (so a delayed OUT leaves earlier). */
  delay?: number;
  ease?: CgEase;
  /** Slide distance as a fraction of the layer's own size (default 1.15); degrees for spin/skew; zoom factor for zoom. */
  amount?: number;
}

export type CgLoopType = 'none' | 'pulse' | 'breathe' | 'shimmer' | 'float' | 'rotate' | 'sweep' | 'blink' | 'scroll' | 'flip' | 'drift';
export interface CgLoop {
  type: CgLoopType;
  /** Seconds per cycle (scroll: seconds per full pass across the layer). */
  period: number;
  /** Strength: pulse/breathe scale delta, float px, rotate degrees per cycle, shimmer width fraction. */
  amount?: number;
}

/** Colour tokens resolve against the graphic's palette so a re-brand is one edit. */
export type CgColorToken = 'accent' | 'ink' | 'paper' | 'secondary' | 'highlight' | 'shade';
export type CgColor = CgColorToken | (string & {});
export interface CgPalette { accent: string; ink: string; paper: string; secondary: string; highlight: string; shade: string }

export interface CgGradient { type: 'linear' | 'radial'; angle?: number; stops: [number, CgColor][] }

export type CgBlend = 'normal' | 'screen' | 'multiply' | 'overlay' | 'lighter' | 'difference' | 'soft-light' | 'color-dodge';

export type CgLayerKind = 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'image' | 'ticker' | 'clock' | 'glow' | 'grid' | 'particles' | 'bars';

export interface CgTextStyle {
  font: FontKey | (string & {});
  weight: number;
  size: number;
  color: CgColor;
  align: 'left' | 'center' | 'right';
  /** Vertical alignment inside the layer box. */
  valign?: 'top' | 'middle' | 'bottom';
  tracking?: number;          // em
  upper?: boolean;
  italic?: boolean;
  lineHeight?: number;        // multiple of size
  maxLines?: number;          // shrink-to-fit beyond this
  shadow?: { color: CgColor; blur: number; x?: number; y?: number };
  stroke?: { color: CgColor; width: number };
  /** Per-glyph animator (shared with Fabula titles). */
  anim?: TitleAnim;
}

/** Animatable properties (keyframes are in graphic-local seconds; OUT-relative keys use negative times = seconds before end). */
export type CgKeyProp = 'x' | 'y' | 'w' | 'h' | 'opacity' | 'rotation' | 'scale';
export interface CgKey { t: number; v: number; ease?: CgEase }

export interface CgLayer {
  id: string;
  name: string;
  kind: CgLayerKind;
  /** Box in design px (absolute in the 1920×1080 frame). */
  x: number; y: number; w: number; h: number;
  rotation?: number;
  opacity?: number;
  fill?: CgColor;
  gradient?: CgGradient;
  stroke?: CgColor;
  strokeWidth?: number;
  dash?: number[];
  radius?: number;
  /** Slant (degrees) — parallelogram straps. */
  skew?: number;
  blend?: CgBlend;
  /** 0..100 box SVG path for kind 'path'. */
  path?: string;
  /** Soft drop shadow under the layer. */
  shadow?: { color: CgColor; blur: number; x?: number; y?: number };
  /** Text: literal content with {field} placeholders, e.g. "{name}" or "LIVE · {location}". */
  text?: string;
  style?: CgTextStyle;
  /** Image: field key holding a URL, or a literal URL. */
  src?: string;
  fit?: 'cover' | 'contain';
  /** Ticker: field key holding items separated by '|' (or newlines); speed in px/s. */
  ticker?: { field: string; speed: number; gap: number; separator?: string };
  /** Clock: what it shows. countdown counts down from field `target` (seconds or mm:ss). */
  clock?: { mode: 'time' | 'time24' | 'countdown' | 'countup' | 'date'; field?: string };
  /** Glow / particles / grid / bars decoration parameters. */
  deco?: { count?: number; size?: number; seed?: number; spacing?: number; values?: string };
  /** Clip this layer to another layer's box (track matte). */
  matte?: string;
  in?: CgMove;
  out?: CgMove;
  loop?: CgLoop;
  keys?: Partial<Record<CgKeyProp, CgKey[]>>;
  hidden?: boolean;
  locked?: boolean;
}

export type CgFieldType = 'text' | 'multiline' | 'number' | 'image' | 'color' | 'list' | 'duration';
export interface CgField { key: string; label: string; type: CgFieldType; default: string }

export interface CgTiming {
  /** Seconds the IN takes (longest layer IN incl. delay). */
  in: number;
  /** Seconds the OUT takes. */
  out: number;
  /** Default on-air hold for timeline placement / auto mode. */
  hold: number;
  /** Transitions: seconds after start when the frame is fully covered — the program cuts here. */
  cutPoint?: number;
}

/** How a graphic behaves when taken live. */
export type CgLiveMode = 'hold' | 'auto' | 'transition';

export interface CgCredit {
  /** Council id (see cgCouncil.ts). */
  council: string;
  /** Member id within the council. */
  member: string;
}

export interface CgGraphic {
  id: string;
  name: string;
  category: CgCategory;
  /** Package (style system) this element belongs to. */
  packageId: string;
  /** Archetype id it was built from (lt-strap, fp-headline, …). */
  archetype?: string;
  tagline?: string;
  tags: string[];
  palette: CgPalette;
  /** Tela type pairing: display + text faces. */
  fonts: { display: FontKey | (string & {}); text: FontKey | (string & {}); utility?: FontKey | (string & {}) };
  fields: CgField[];
  layers: CgLayer[];
  timing: CgTiming;
  live: CgLiveMode;
  /** Keyed region used by the switcher to decide DSK vs full-frame. */
  coverage: 'region' | 'full';
  credit?: CgCredit;
  /** User-authored (saved from the designer) vs library. */
  custom?: boolean;
  version?: number;
}

/** What a Fabula clip / a rundown item / a Stage cue stores: a reference + edits. */
export interface CgGraphicRef {
  graphicId: string;
  /** Field values (text, list, image urls…). */
  fields?: Record<string, string>;
  /** Palette overrides (re-brand without forking). */
  palette?: Partial<CgPalette>;
  /** Whole-graphic offset in design px and uniform scale. */
  offset?: { x: number; y: number; scale?: number };
  /** A fully custom graphic embedded inline (designer output not yet saved to the library). */
  inline?: CgGraphic;
}

/** Drag-and-drop payload shared by Fabula, the switcher and Stage. */
export const CG_DRAG_MIME = 'application/x-fabula-cg+json';
export interface CgDragPayload { kind: 'cg-graphic'; ref: CgGraphicRef; name: string; category: CgCategory; live: CgLiveMode; durationHint: number }
