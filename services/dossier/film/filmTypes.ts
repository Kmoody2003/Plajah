/**
 * Dossier Film — a code-driven documentary format.
 *
 * A film is a list of scenes. Every frame is a pure function of time: `draw(t)` paints the same
 * pixels in the in-app player and in the MP4 exporter (scripts/dossier/renderFilm.ts), so what
 * a student sees live is exactly what gets published. No pre-rendered motion — the motion
 * graphics ARE the code.
 *
 * Invariants inherited from the Dossier system:
 *  - every scene that states a fact cites claim ids from the evidence ledger;
 *  - reconstructions say so on screen;
 *  - every image carries its credit.
 */

export type Ease = 'linear' | 'inOut' | 'out' | 'in' | 'outBack' | 'inOutQuint' | 'outExpo';

/** A camera keyframe over an image: centre (0..1 of the image) and zoom (1 = cover). */
export interface CamKey { t: number; x: number; y: number; zoom: number; ease?: Ease }

export interface Narration {
  /** Spoken text (also the caption). */
  text: string;
  /** Public URL of the voiced line, when produced. */
  audio?: string;
  /** Seconds of the voiced line (from scripts/dossier/narrate.ts). */
  duration?: number;
}

interface SceneBase {
  id: string;
  /** Minimum seconds on screen (narration can extend it). */
  min: number;
  /** Seconds of narration lead-in / tail. */
  padIn?: number;
  padOut?: number;
  narration?: Narration;
  claimIds?: string[];
  /** Transition INTO this scene. */
  transition?: 'cut' | 'fade' | 'dip' | 'inkWipe' | 'filmBurn';
  /** Chapter label shown in the player's chapter list. */
  chapter?: string;
}

export interface TitleScene extends SceneBase {
  kind: 'title';
  kicker: string;
  title: string;
  subtitle: string;
  dates: string;
  /** Portrait faded in behind the title (asset id). */
  bgAsset?: string;
}

export interface ColdOpenScene extends SceneBase {
  kind: 'coldOpen';
  lines: string[];
  cite?: string;
}

export interface ChapterScene extends SceneBase {
  kind: 'chapter';
  numeral: string;
  title: string;
  years: string;
  bgAsset?: string;
}

export interface PaintingScene extends SceneBase {
  kind: 'painting';
  asset: string;
  cam: CamKey[];
  /** Depth parallax strength (0 = flat Ken Burns). Needs a depth map for the asset. */
  depth?: number;
  title?: string;
  /** Small on-screen caption + credit. */
  caption: string;
  reconstruction?: boolean;
  /** Atmosphere over the image. */
  atmosphere?: 'dust' | 'steam' | 'lamplight' | 'none';
  grade?: 'warm' | 'cool' | 'dusk' | 'night' | 'neutral';
}

export interface Callout { text: string; x: number; y: number; side: 'left' | 'right'; at: number }

export interface ArchivalScene extends SceneBase {
  kind: 'archival';
  asset: string;
  caption: string;
  /** Large numeral overlay (e.g. age or year). */
  marker?: { label: string; value: string };
  callouts?: Callout[];
  /** Where the face sits (0..1) for the push-in. */
  focus?: { x: number; y: number };
  layout?: 'center' | 'left' | 'right';
  tone?: 'sepia' | 'mono' | 'natural';
}

export interface MapStop { id: string; label: string; lat: number; lon: number; mode?: string; note?: string }

/** Layered [lon,lat] geometry (scripts/dossier/buildBasemap.ts, Natural Earth, public domain). */
export interface Basemap {
  attribution: string;
  layers: { land?: number[][][]; coast?: number[][][]; lakes?: number[][][]; states?: number[][][]; countries?: number[][][] };
  stateLabels?: Array<{ name: string; postal: string; lon: number; lat: number }>;
}

export interface MapScene extends SceneBase {
  kind: 'map';
  basemap: 'eastCoast' | 'atlantic';
  /** Camera bbox keys: [lonMin, latMin, lonMax, latMax] at time t (0..1 of scene). */
  view: Array<{ t: number; bbox: [number, number, number, number]; ease?: Ease }>;
  route?: MapStop[];
  /** Fraction of the scene over which the route draws. */
  routeSpan?: [number, number];
  places?: Array<MapStop & { at: number; years?: string }>;
  title: string;
  dateline?: string;
  attribution: string;
}

export interface QuoteScene extends SceneBase {
  kind: 'quote';
  text: string;
  /** Words to set in gold. */
  emphasis?: string[];
  cite: string;
  bgAsset?: string;
  style?: 'broadside' | 'manuscript' | 'speech';
}

export interface ChartScene extends SceneBase {
  kind: 'chart';
  title: string;
  series: Array<{ label: string; value: number }>;
  unit?: string;
  /** Index of the bar to call out. */
  highlight?: number;
  note?: string;
  source: string;
}

export interface MastheadScene extends SceneBase {
  kind: 'masthead';
  name: string;
  motto: string;
  dateline: string;
  editors: string;
  place: string;
}

export interface TimelineScene extends SceneBase {
  kind: 'timeline';
  title: string;
  span: [number, number];
  events: Array<{ year: number; label: string; claimId?: string }>;
  /** Year range the camera sweeps across, as fractions of the scene. */
  sweep: [number, number];
}

export interface CreditsScene extends SceneBase {
  kind: 'credits';
  blocks: Array<{ head: string; lines: string[] }>;
}

export type FilmScene =
  | TitleScene | ColdOpenScene | ChapterScene | PaintingScene | ArchivalScene
  | MapScene | QuoteScene | ChartScene | MastheadScene | TimelineScene | CreditsScene;

export interface FilmAsset { id: string; src: string; depth?: string; credit: string }

export interface FilmSpec {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  scenes: FilmScene[];
  assets: FilmAsset[];
  score?: { src: string; volume: number; duckTo: number };
  basemaps?: Partial<Record<MapScene['basemap'], Basemap>>;
}

/** A scene placed on the timeline. */
export interface Placed { scene: FilmScene; start: number; end: number; voiceAt: number }

/** Crossfade length for non-cut transitions. */
export const XFADE = 0.9;

/** Lay scenes out end-to-end. Narration sets duration when it's longer than `min`. */
export function layout(spec: FilmSpec): { placed: Placed[]; duration: number } {
  let t = 0;
  const placed: Placed[] = [];
  for (const s of spec.scenes) {
    const padIn = s.padIn ?? 0.6, padOut = s.padOut ?? 0.9;
    const voiced = s.narration?.duration ? padIn + s.narration.duration + padOut : 0;
    const len = Math.max(s.min, voiced);
    const overlap = placed.length && s.transition && s.transition !== 'cut' ? XFADE : 0;
    const start = Math.max(0, t - overlap);
    placed.push({ scene: s, start, end: start + len, voiceAt: start + padIn });
    t = start + len;
  }
  return { placed, duration: t };
}
