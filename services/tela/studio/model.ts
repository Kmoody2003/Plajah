// studio/model — the editing metadata the Studio vector editor keeps beside the baked art.
//
// Rule of the Studio: every object always carries FINISHED, canonical geometry (svgPathData +
// geom, or a legacy box kind) so Fabula's timeline, The Post Man's letters, exports and
// thumbnails render it with the one canonical serialiser and know nothing about the editor.
// What makes an object re-editable (the live source path under a roughen effect, the spine of
// a variable-width or brushed stroke, the story of an area-type frame, which symbol an
// instance came from, which group a clipping mask belongs to) rides beside it in the optional
// `studio` field (TelaVectorObject.studio / TelaVectorDevice.studio, both additive). Drop the
// field and the art still renders exactly the same; it just stops being live.
//
// Coordinates: anything with coordinates in an object's `studio` (live source `d`, a type
// path) is in the object's ORIGIN space, the same space as its svgPathData. The object's
// x/y/w/h + pathOrigin mapping (and rotation) carries it to the artboard, so a move is a
// cheap x/y change that keeps source, baked art, paints and clips in step.
import type { LineCap, LineJoin, StrokeStyle } from '../geometry/model';
import type { WidthPoint } from '../geometry/stroke';
import type { TextStory } from '../../text/model';

// ── Live appearance (object) ─────────────────────────────────────────────────────────

export type EffectKind = 'roughen' | 'zigzag' | 'puckerBloat' | 'twist' | 'warp' | 'offset';
export interface StudioEffect {
  kind: EffectKind;
  /** Kind-specific parameters (see studio/appearance.ts EFFECTS for the knobs). */
  params: Record<string, number | string | boolean>;
  enabled?: boolean;
}
export interface StudioWidth {
  /** Full stroke width (px). */
  width: number;
  /** A built-in profile name (geometry/stroke PROFILES) or explicit width points (half widths, px). */
  profile: string | WidthPoint[];
  cap?: LineCap; join?: LineJoin;
}
export interface StudioBrushUse { brushId: string; width?: number; flip?: boolean }
export interface StudioLiveShape { kind: 'rect' | 'ellipse' | 'polygon' | 'star' | 'spiral'; params: Record<string, number> }

/** A live object: `d` (origin space) is the editable source; the baked svgPathData is derived. */
export interface StudioLive {
  d: string;
  effects?: StudioEffect[];
  /** Variable-width stroke: the stroke colour becomes the fill of the outlined shape. */
  width?: StudioWidth;
  brush?: StudioBrushUse;
  /** Parametric shape (polygon sides, star radii, rect corner radii, spiral turns). */
  shape?: StudioLiveShape;
  /** The paint the source had before width/brush moved the stroke colour into the fill. */
  sourcePaint?: { fill: string; stroke: string; strokeWidth: number; strokeStyle?: StrokeStyle };
}

// ── Type (object) ────────────────────────────────────────────────────────────────────

export type TypeMode = 'point' | 'area' | 'path';
export interface StudioType {
  mode: TypeMode;
  /** The story lives on the HEAD of a thread; continuation frames carry `threadPrev` only. */
  story?: TextStory;
  /** Type on a path: the baseline path in object-local coordinates (origin = object x/y). */
  pathD?: string;
  /** Distance along the path where the text starts (px). */
  startOffset?: number;
  /** Text above (default) or below/flipped along the path. */
  flip?: boolean;
  threadNext?: string;
  threadPrev?: string;
  /** Inner padding of an area frame (px). */
  inset?: number;
  columns?: number;
  verticalAlign?: 'top' | 'center' | 'bottom';
  /** Overset text indicator (last frame of a thread). */
  overflow?: boolean;
}

// ── Object extension ─────────────────────────────────────────────────────────────────

export interface TelaStudioObjectExt {
  v: 1;
  live?: StudioLive;
  type?: StudioType;
  /** Symbol instance membership: every member object of an instance carries this. */
  symbol?: { id: string; instance: string; member: number; matrix: [number, number, number, number, number, number] };
  /** This object is the clipping path of its group (Ctrl+7). */
  clipMask?: boolean;
  /** geom.clip was set by this clip group (so leaving the group removes it). */
  clippedBy?: string;
  /** Global swatch links: editing the swatch repaints every linked object. */
  fillSwatch?: string;
  strokeSwatch?: string;
}

// ── Device extension ─────────────────────────────────────────────────────────────────

export interface StudioSwatch { id: string; name: string; color: string; global?: boolean }
export interface StudioGroup { id: string; name?: string; parent?: string; clip?: boolean; collapsed?: boolean }
export interface StudioSymbol {
  id: string; name: string;
  /** Master art, normalised so the symbol's box starts at (0,0). */
  objects: import('../../../types').TelaVectorObject[];
  w: number; h: number;
}
export interface StudioBrush {
  id: string; name: string; kind: 'art' | 'pattern' | 'scatter';
  /** Brush art (path data, normalised to a unit-ish box at origin) with its paint. */
  art: Array<{ d: string; fill: string }>;
  /** Scatter: spacing / size / rotation ranges; pattern: tile spacing. */
  params?: Record<string, number>;
}
export interface TelaStudioDeviceExt {
  v: 1;
  swatches?: StudioSwatch[];
  groups?: Record<string, StudioGroup>;
  symbols?: StudioSymbol[];
  brushes?: StudioBrush[];
  guides?: { x: number[]; y: number[] };
  grid?: { size: number; show?: boolean; snap?: boolean; subdivisions?: number };
  /** The Photoshop / Illustrator file this artboard came from, and how the import went. */
  imported?: { fileName: string; format: string; at: number; report?: unknown };
}

export const studioOf = (o: { studio?: TelaStudioObjectExt }): TelaStudioObjectExt => o.studio ?? { v: 1 };
export const deviceStudioOf = (d: { studio?: TelaStudioDeviceExt }): TelaStudioDeviceExt => d.studio ?? { v: 1 };

/** Drop empty keys so an object without live state carries no `studio` at all. */
export function compactStudio(s: TelaStudioObjectExt | undefined): TelaStudioObjectExt | undefined {
  if (!s) return undefined;
  const out: TelaStudioObjectExt = { v: 1 };
  if (s.live) out.live = s.live;
  if (s.type) out.type = s.type;
  if (s.symbol) out.symbol = s.symbol;
  if (s.clipMask) out.clipMask = true;
  if (s.clippedBy) out.clippedBy = s.clippedBy;
  if (s.fillSwatch) out.fillSwatch = s.fillSwatch;
  if (s.strokeSwatch) out.strokeSwatch = s.strokeSwatch;
  return Object.keys(out).length > 1 ? out : undefined;
}

let seq = 0;
export const studioId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++seq).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
