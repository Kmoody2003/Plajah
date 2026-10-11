// raster/model — the non-destructive raster document (Photoshop-grade layer model).
//
// Why a new model: the legacy TelaImageDevice is a flat list of <img> layers with CSS
// filters. A real image editor needs pixel layers that own bitmaps, adjustment and
// fill layers, nested/pass-through groups, clipping, bitmap + vector masks, smart
// filters, layer styles and the full 27-mode blend set. Everything here is plain JSON
// (bitmaps are referenced by asset id, never inlined) so a RasterDocument can live on
// `TelaImageDevice.raster` and round-trip through the Tela doc store.
//
// Coordinates: document pixels, origin top-left, y down. Layer transforms are 2D
// affines in canvas/SVG order [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f,
// mapping LAYER BITMAP pixels → DOCUMENT pixels.
//
// Stack order: arrays are bottom → top (index 0 is the bottom), matching TelaImageDevice.

import type { TelaBlendMode, TelaImageDevice, TelaImageLayer, TelaLayerMask } from '../../../types';

// ── Blend modes ─────────────────────────────────────────────────────────────
export const BLEND_MODES = [
  'normal', 'dissolve',
  'darken', 'multiply', 'color-burn', 'linear-burn', 'darker-color',
  'lighten', 'screen', 'color-dodge', 'linear-dodge', 'lighter-color',
  'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix',
  'difference', 'exclusion', 'subtract', 'divide',
  'hue', 'saturation', 'color', 'luminosity',
] as const;
export type BlendMode = typeof BLEND_MODES[number];
/** Groups additionally accept Photoshop's pass-through (no isolation). */
export type GroupBlendMode = BlendMode | 'pass-through';

export type Affine = [number, number, number, number, number, number];
export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
export interface Rect { x: number; y: number; width: number; height: number }
/** 0..255 RGB, alpha 0..1. */
export type RGB = [number, number, number];
export interface RGBA { r: number; g: number; b: number; a?: number }

// ── Gradients (shared by fill layers, gradient map, gradient tool, masks) ────
export interface GradientStop { offset: number; color: RGB; opacity?: number; /** 0..1 position of the 50% blend point towards the next stop. */ midpoint?: number }
export interface GradientSpec {
  stops: GradientStop[];
  /** Interpolation space for colour stops. Photoshop "Classic" = srgb. */
  interpolation?: 'srgb' | 'linear' | 'oklab';
}
export type GradientShape = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';

// ── Adjustments (adjustment layers AND adjustment-type smart filters) ───────
export interface LevelsChannel { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number } // 0..1 except gamma
export type CurvePoint = [number, number]; // 0..1 in, 0..1 out
export type HueRangeName = 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas';
export interface HueRange {
  /** Preset name or explicit range in degrees: full effect inside [from,to], fading out over `feather` degrees. */
  range: HueRangeName | { from: number; to: number; feather: number };
  hue: number; saturation: number; lightness: number; // -180..180, -100..100, -100..100
}
export type CMYKAdjust = [number, number, number, number]; // -100..100 each

export type Adjustment =
  | { type: 'levels'; master: LevelsChannel; r?: LevelsChannel; g?: LevelsChannel; b?: LevelsChannel }
  | { type: 'curves'; master: CurvePoint[]; r?: CurvePoint[]; g?: CurvePoint[]; b?: CurvePoint[] }
  | { type: 'hueSaturation'; hue: number; saturation: number; lightness: number; ranges?: HueRange[]; colorize?: boolean }
  | { type: 'colorBalance'; shadows: RGB; midtones: RGB; highlights: RGB; preserveLuminosity: boolean } // each -100..100 (cyan-red, magenta-green, yellow-blue)
  | { type: 'vibrance'; vibrance: number; saturation: number } // -100..100
  | { type: 'exposure'; exposure: number; offset: number; gamma: number }
  | { type: 'brightnessContrast'; brightness: number; contrast: number } // -150..150 / -50..100 (non-legacy PS)
  | { type: 'blackWhite'; reds: number; yellows: number; greens: number; cyans: number; blues: number; magentas: number; tint?: { hue: number; saturation: number } }
  | { type: 'photoFilter'; color: RGB; density: number; preserveLuminosity: boolean } // density 0..1
  | { type: 'channelMixer'; red: [number, number, number, number]; green: [number, number, number, number]; blue: [number, number, number, number]; monochrome?: boolean } // percents, last = constant
  | { type: 'gradientMap'; gradient: GradientSpec; reverse?: boolean; dither?: boolean }
  | { type: 'selectiveColor'; method: 'relative' | 'absolute'; reds?: CMYKAdjust; yellows?: CMYKAdjust; greens?: CMYKAdjust; cyans?: CMYKAdjust; blues?: CMYKAdjust; magentas?: CMYKAdjust; whites?: CMYKAdjust; neutrals?: CMYKAdjust; blacks?: CMYKAdjust }
  | { type: 'invert' }
  | { type: 'posterize'; levels: number }
  | { type: 'threshold'; level: number } // 0..1
  | { type: 'lut3d'; name?: string; /** .cube text inline (small LUTs) */ cube?: string; /** or a Tela asset holding the .cube text */ assetId?: string; strength?: number }
  /** Exact CSS filter semantics — the migration target for legacy TelaImageAdjust. */
  | { type: 'cssColor'; brightness: number; contrast: number; saturate: number };
export type AdjustmentType = Adjustment['type'];

// ── Filters (smart filters) ─────────────────────────────────────────────────
export type Filter =
  | { type: 'gaussianBlur'; radius: number } // sigma, px
  | { type: 'boxBlur'; radius: number }
  | { type: 'motionBlur'; angle: number; distance: number }
  | { type: 'radialBlur'; mode: 'spin' | 'zoom'; amount: number; cx: number; cy: number } // centre 0..1 of doc
  | { type: 'surfaceBlur'; radius: number; threshold: number } // threshold 0..255
  | { type: 'unsharpMask'; amount: number; radius: number; threshold: number } // amount %, threshold 0..255
  | { type: 'smartSharpen'; amount: number; radius: number; reduceNoise: number }
  | { type: 'highPass'; radius: number }
  | { type: 'addNoise'; amount: number; gaussian: boolean; monochromatic: boolean; seed?: number } // amount %
  | { type: 'reduceNoise'; strength: number; preserveDetails: number; method?: 'bilateral' | 'nlm' }
  | { type: 'median'; radius: number }
  | { type: 'dustAndScratches'; radius: number; threshold: number }
  | { type: 'emboss'; angle: number; height: number; amount: number }
  | { type: 'findEdges' }
  | { type: 'pixelate'; cellSize: number }
  | { type: 'oilPaint'; radius: number } // Kuwahara
  | { type: 'halftone'; cellSize: number; angle: number }
  | { type: 'posterizeEdges'; edgeThickness: number; edgeIntensity: number; levels: number }
  | { type: 'adjust'; adjustment: Adjustment };
export type FilterType = Filter['type'];

export interface SmartFilter { id: string; enabled: boolean; filter: Filter; opacity?: number; blend?: BlendMode }

// ── Masks ───────────────────────────────────────────────────────────────────
/** Painted/bitmap mask: 8-bit gray asset placed at `bounds` in DOCUMENT space; outside = defaultColor. */
export interface BitmapMask {
  kind: 'bitmap'; enabled: boolean;
  assetId: string; bounds: Rect; defaultColor: 0 | 255;
  density?: number; feather?: number; invert?: boolean;
  /** Linked masks move with the layer transform (bounds are then in LAYER bitmap space). */
  linked?: boolean;
}
/** Procedural gradient mask (the legacy LUMA_GRADIENT); kept procedural so it stays editable. */
export interface GradientMask {
  kind: 'gradient'; enabled: boolean; angle: number; blackPoint: number; midpoint: number; whitePoint: number;
  density?: number; feather?: number; invert?: boolean;
}
export type LayerMask = BitmapMask | GradientMask;

export interface PathPoint { x: number; y: number; /** incoming / outgoing cubic handles (absolute) */ in?: { x: number; y: number }; out?: { x: number; y: number } }
export interface VectorSubpath { closed: boolean; points: PathPoint[]; op?: 'add' | 'subtract' | 'intersect' | 'xor' }
export interface VectorMask { enabled: boolean; subpaths: VectorSubpath[]; invert?: boolean; feather?: number; density?: number; /** subpaths are in layer-bitmap space (move with the layer) */ linked?: boolean }

// ── Layer styles ────────────────────────────────────────────────────────────
export interface ShadowStyle { enabled: boolean; blend: BlendMode; color: RGB; opacity: number; angle: number; distance: number; spread: number; size: number }
export interface GlowStyle { enabled: boolean; blend: BlendMode; color: RGB; opacity: number; spread: number; size: number }
export interface StrokeStyle { enabled: boolean; blend: BlendMode; color: RGB; opacity: number; size: number; position: 'outside' | 'inside' | 'center' }
export interface OverlayStyle { enabled: boolean; blend: BlendMode; color: RGB; opacity: number }
export interface LayerStyles { enabled?: boolean; dropShadow?: ShadowStyle; innerShadow?: ShadowStyle; outerGlow?: GlowStyle; stroke?: StrokeStyle; colorOverlay?: OverlayStyle }

// ── Fill content ────────────────────────────────────────────────────────────
export type FillContent =
  | { type: 'solid'; color: RGB }
  | { type: 'gradient'; gradient: GradientSpec; shape: GradientShape; angle: number; scale: number; /** centre offset in doc px */ offsetX?: number; offsetY?: number; reverse?: boolean; dither?: boolean }
  | { type: 'pattern'; assetId: string; scale: number; offsetX?: number; offsetY?: number; angle?: number };

// ── Layers ──────────────────────────────────────────────────────────────────
interface LayerBase {
  id: string; name: string; visible: boolean;
  /** 0..1 — applies to the layer AND its styles. */
  opacity: number;
  /** 0..1 — applies to the layer content only, not its styles (Photoshop "Fill"). */
  fillOpacity?: number;
  /** Clip to the nearest non-clipped layer below (Photoshop clipping mask). */
  clipped?: boolean;
  mask?: LayerMask;
  vectorMask?: VectorMask;
  locked?: { pixels?: boolean; position?: boolean; transparency?: boolean; all?: boolean };
  /** Free-form UI metadata (colour label, etc). */
  meta?: Record<string, unknown>;
}
export interface PixelLayer extends LayerBase {
  kind: 'pixel'; blend: BlendMode;
  /** Bitmap source: Tela asset id (OPFS) or a URL (legacy/remote). */
  asset: { assetId?: string; src?: string };
  /** Bitmap size in pixels (0 = unknown until loaded). */
  width: number; height: number;
  transform: Affine;
  smartFilters?: SmartFilter[];
  styles?: LayerStyles;
  /** Rasterized text layer: the text is kept so a text engine can re-render it. */
  text?: { value: string; font?: string; size?: number; color?: RGB; raw?: unknown };
  /** Legacy VIDEO/LOTTIE layers keep their media hint; the engine renders the poster bitmap. */
  media?: { kind: 'VIDEO' | 'LOTTIE'; src: string };
}
export interface AdjustmentLayer extends LayerBase { kind: 'adjustment'; blend: BlendMode; adjustment: Adjustment }
export interface FillLayer extends LayerBase { kind: 'fill'; blend: BlendMode; fill: FillContent; styles?: LayerStyles }
export interface GroupLayer extends LayerBase { kind: 'group'; blend: GroupBlendMode; children: RasterLayer[]; collapsed?: boolean }
export type RasterLayer = PixelLayer | AdjustmentLayer | FillLayer | GroupLayer;

export interface RasterDocument {
  version: 1;
  width: number; height: number;
  /** Tag only — pixels are stored encoded in this space; exports embed the matching ICC. */
  colorSpace: 'srgb' | 'display-p3';
  /** Where blend math happens. 'srgb' = Photoshop default (gamma-encoded), 'linear' = linear light. */
  blendSpace: 'srgb' | 'linear';
  /** Working precision hint for the GPU (8 = RGBA8 FBOs, 16 = RGBA16F). The CPU path is always float. */
  bitDepth: 8 | 16;
  /** Opaque background below everything (null = transparent). */
  background: RGB | null;
  layers: RasterLayer[];
  /** Soft-proof setting carried with the doc (see color.ts). */
  proof?: { cmyk: boolean; inkLimit?: number };
  dpi?: number;
}

// ── Constructors ────────────────────────────────────────────────────────────
let idSeq = 0;
export const newLayerId = (prefix = 'rl') => `${prefix}_${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function createDocument(width: number, height: number, opts: Partial<Omit<RasterDocument, 'width' | 'height' | 'version'>> = {}): RasterDocument {
  return { version: 1, width, height, colorSpace: 'srgb', blendSpace: 'srgb', bitDepth: 16, background: [255, 255, 255], layers: [], ...opts };
}
export function pixelLayer(asset: PixelLayer['asset'], width: number, height: number, patch: Partial<PixelLayer> = {}): PixelLayer {
  return { kind: 'pixel', id: newLayerId(), name: 'Layer', visible: true, opacity: 1, blend: 'normal', asset, width, height, transform: [...IDENTITY] as Affine, ...patch };
}
export function adjustmentLayer(adjustment: Adjustment, patch: Partial<AdjustmentLayer> = {}): AdjustmentLayer {
  return { kind: 'adjustment', id: newLayerId('adj'), name: ADJUSTMENT_LABELS[adjustment.type], visible: true, opacity: 1, blend: 'normal', adjustment, ...patch };
}
export function fillLayer(fill: FillContent, patch: Partial<FillLayer> = {}): FillLayer {
  return { kind: 'fill', id: newLayerId('fill'), name: fill.type === 'solid' ? 'Color Fill' : fill.type === 'gradient' ? 'Gradient Fill' : 'Pattern Fill', visible: true, opacity: 1, blend: 'normal', fill, ...patch };
}
export function groupLayer(children: RasterLayer[], patch: Partial<GroupLayer> = {}): GroupLayer {
  return { kind: 'group', id: newLayerId('grp'), name: 'Group', visible: true, opacity: 1, blend: 'pass-through', children, ...patch };
}

export const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  levels: 'Levels', curves: 'Curves', hueSaturation: 'Hue/Saturation', colorBalance: 'Color Balance', vibrance: 'Vibrance',
  exposure: 'Exposure', brightnessContrast: 'Brightness/Contrast', blackWhite: 'Black & White', photoFilter: 'Photo Filter',
  channelMixer: 'Channel Mixer', gradientMap: 'Gradient Map', selectiveColor: 'Selective Color', invert: 'Invert',
  posterize: 'Posterize', threshold: 'Threshold', lut3d: 'Color Lookup', cssColor: 'Color (legacy)',
};

/** Neutral defaults the UI starts each adjustment from. */
export function defaultAdjustment(type: AdjustmentType): Adjustment {
  const lv: LevelsChannel = { inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1 };
  switch (type) {
    case 'levels': return { type, master: { ...lv } };
    case 'curves': return { type, master: [[0, 0], [1, 1]] };
    case 'hueSaturation': return { type, hue: 0, saturation: 0, lightness: 0 };
    case 'colorBalance': return { type, shadows: [0, 0, 0], midtones: [0, 0, 0], highlights: [0, 0, 0], preserveLuminosity: true };
    case 'vibrance': return { type, vibrance: 0, saturation: 0 };
    case 'exposure': return { type, exposure: 0, offset: 0, gamma: 1 };
    case 'brightnessContrast': return { type, brightness: 0, contrast: 0 };
    case 'blackWhite': return { type, reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80 };
    case 'photoFilter': return { type, color: [236, 138, 0], density: 0.25, preserveLuminosity: true };
    case 'channelMixer': return { type, red: [100, 0, 0, 0], green: [0, 100, 0, 0], blue: [0, 0, 100, 0] };
    case 'gradientMap': return { type, gradient: { stops: [{ offset: 0, color: [0, 0, 0] }, { offset: 1, color: [255, 255, 255] }] } };
    case 'selectiveColor': return { type, method: 'relative' };
    case 'invert': return { type };
    case 'posterize': return { type, levels: 4 };
    case 'threshold': return { type, level: 0.5 };
    case 'lut3d': return { type, cube: '' };
    case 'cssColor': return { type, brightness: 1, contrast: 1, saturate: 1 };
  }
}

// ── Tree helpers ────────────────────────────────────────────────────────────
export function walkLayers(layers: RasterLayer[], fn: (layer: RasterLayer, parent: GroupLayer | null, depth: number) => void | false, parent: GroupLayer | null = null, depth = 0): void {
  for (const l of layers) { if (fn(l, parent, depth) === false) continue; if (l.kind === 'group') walkLayers(l.children, fn, l, depth + 1); }
}
export function findLayer(doc: RasterDocument, id: string): { layer: RasterLayer; parent: GroupLayer | null; index: number } | null {
  let hit: { layer: RasterLayer; parent: GroupLayer | null; index: number } | null = null;
  const visit = (list: RasterLayer[], parent: GroupLayer | null) => { list.forEach((l, index) => { if (hit) return; if (l.id === id) hit = { layer: l, parent, index }; else if (l.kind === 'group') visit(l.children, l); }); };
  visit(doc.layers, null); return hit;
}
/** Immutable update of one layer anywhere in the tree. */
export function updateLayer(doc: RasterDocument, id: string, patch: Partial<RasterLayer> | ((l: RasterLayer) => RasterLayer)): RasterDocument {
  const map = (list: RasterLayer[]): RasterLayer[] => list.map(l => l.id === id ? (typeof patch === 'function' ? patch(l) : ({ ...l, ...patch } as RasterLayer)) : l.kind === 'group' ? { ...l, children: map(l.children) } : l);
  return { ...doc, layers: map(doc.layers) };
}
export function removeLayer(doc: RasterDocument, id: string): RasterDocument {
  const f = (list: RasterLayer[]): RasterLayer[] => list.filter(l => l.id !== id).map(l => l.kind === 'group' ? { ...l, children: f(l.children) } : l);
  return { ...doc, layers: f(doc.layers) };
}
/** Insert above `aboveId` (or at top of root / of `parentId` group). */
export function insertLayer(doc: RasterDocument, layer: RasterLayer, where: { aboveId?: string; parentId?: string } = {}): RasterDocument {
  if (where.aboveId) {
    const ins = (list: RasterLayer[]): RasterLayer[] => { const i = list.findIndex(l => l.id === where.aboveId); if (i >= 0) return [...list.slice(0, i + 1), layer, ...list.slice(i + 1)]; return list.map(l => l.kind === 'group' ? { ...l, children: ins(l.children) } : l); };
    return { ...doc, layers: ins(doc.layers) };
  }
  if (where.parentId) return updateLayer(doc, where.parentId, l => l.kind === 'group' ? { ...l, children: [...l.children, layer] } : l);
  return { ...doc, layers: [...doc.layers, layer] };
}
/** All asset ids a document references (for preloading / GC). */
export function collectAssetIds(doc: RasterDocument): { bitmaps: Set<string>; masks: Set<string>; text: Set<string>; urls: Set<string> } {
  const out = { bitmaps: new Set<string>(), masks: new Set<string>(), text: new Set<string>(), urls: new Set<string>() };
  const adj = (a: Adjustment) => { if (a.type === 'lut3d' && a.assetId) out.text.add(a.assetId); };
  walkLayers(doc.layers, l => {
    if (l.mask?.kind === 'bitmap') out.masks.add(l.mask.assetId);
    if (l.kind === 'pixel') { if (l.asset.assetId) out.bitmaps.add(l.asset.assetId); else if (l.asset.src) out.urls.add(l.asset.src); l.smartFilters?.forEach(f => f.filter.type === 'adjust' && adj(f.filter.adjustment)); }
    if (l.kind === 'adjustment') adj(l.adjustment);
    if (l.kind === 'fill' && l.fill.type === 'pattern') out.bitmaps.add(l.fill.assetId);
  });
  return out;
}

// ── Affine helpers ──────────────────────────────────────────────────────────
export function affineMul(m: Affine, n: Affine): Affine { // m ∘ n (apply n first)
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
export function affineInvert(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2]; if (Math.abs(det) < 1e-12) return [0, 0, 0, 0, 0, 0];
  const i = 1 / det;
  return [m[3] * i, -m[1] * i, -m[2] * i, m[0] * i, (m[2] * m[5] - m[3] * m[4]) * i, (m[1] * m[4] - m[0] * m[5]) * i];
}
export const affineApply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const affineTranslate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];
export const affineScale = (sx: number, sy = sx): Affine => [sx, 0, 0, sy, 0, 0];
export const affineRotate = (deg: number): Affine => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0]; };
/** Axis-aligned doc-space bounds of a w×h bitmap under m. */
export function transformedBounds(m: Affine, w: number, h: number): Rect {
  const pts = [affineApply(m, 0, 0), affineApply(m, w, 0), affineApply(m, 0, h), affineApply(m, w, h)];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  return { x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y };
}

// ── Legacy migration (TelaImageDevice → RasterDocument) ─────────────────────
const LEGACY_BLEND: Record<TelaBlendMode, BlendMode> = {
  normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'hard-light': 'hard-light', 'soft-light': 'soft-light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};

function legacyMask(mask: TelaLayerMask | undefined, w: number, h: number): { mask?: LayerMask; vectorMask?: VectorMask; maskSrc?: string } {
  if (!mask) return {};
  if (mask.kind === 'LUMA_GRADIENT') return { mask: { kind: 'gradient', enabled: mask.enabled, angle: mask.angle ?? 90, blackPoint: mask.blackPoint ?? 0, midpoint: mask.midpoint ?? 0.5, whitePoint: mask.whitePoint ?? 1, invert: mask.invert } };
  if (mask.kind === 'ALPHA_IMAGE' && mask.src) {
    // The legacy CSS mask stretches the image over the layer box; we keep the URL and a
    // linked bitmap mask whose bounds equal the layer bitmap. Asset import resolves `legacy:` ids.
    return { mask: { kind: 'bitmap', enabled: mask.enabled, assetId: `legacy:${mask.src}`, bounds: { x: 0, y: 0, width: w || 1, height: h || 1 }, defaultColor: 0, invert: mask.invert, linked: true, feather: mask.feather }, maskSrc: mask.src };
  }
  if (mask.kind === 'SHAPE') {
    const W = w || 1, H = h || 1;
    const sub: VectorSubpath = mask.shape === 'ELLIPSE' ? ellipsePath(W / 2, H / 2, W / 2, H / 2) : mask.shape === 'ROUNDED' ? roundedRectPath(0, 0, W, H, Math.min(W, H) * 0.1) : rectPath(0, 0, W, H);
    return { vectorMask: { enabled: mask.enabled, subpaths: [sub], invert: mask.invert, feather: mask.feather, linked: true } };
  }
  return {};
}

export function rectPath(x: number, y: number, w: number, h: number): VectorSubpath { return { closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }; }
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): VectorSubpath {
  const k = 0.5522847498; // cubic circle constant
  const p = (x: number, y: number, ix: number, iy: number, ox: number, oy: number): PathPoint => ({ x, y, in: { x: ix, y: iy }, out: { x: ox, y: oy } });
  return { closed: true, points: [
    p(cx + rx, cy, cx + rx, cy - ry * k, cx + rx, cy + ry * k),
    p(cx, cy + ry, cx + rx * k, cy + ry, cx - rx * k, cy + ry),
    p(cx - rx, cy, cx - rx, cy + ry * k, cx - rx, cy - ry * k),
    p(cx, cy - ry, cx - rx * k, cy - ry, cx + rx * k, cy - ry),
  ] };
}
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): VectorSubpath {
  r = Math.min(r, w / 2, h / 2); const k = r * (1 - 0.5522847498);
  return { closed: true, points: [
    { x: x + r, y, in: { x: x + k, y } }, { x: x + w - r, y, out: { x: x + w - k, y } },
    { x: x + w, y: y + r, in: { x: x + w, y: y + k } }, { x: x + w, y: y + h - r, out: { x: x + w, y: y + h - k } },
    { x: x + w - r, y: y + h, in: { x: x + w - k, y: y + h } }, { x: x + r, y: y + h, out: { x: x + k, y: y + h } },
    { x, y: y + h - r, in: { x, y: y + h - k } }, { x, y: y + r, out: { x, y: y + k } },
  ] };
}

/** Legacy TelaImageAdjust → smart filters with identical (CSS filter) semantics. */
export function legacyAdjustToSmartFilters(adjust: TelaImageLayer['adjust'] | undefined): SmartFilter[] {
  if (!adjust) return [];
  const out: SmartFilter[] = [];
  const brightness = (adjust.brightness ?? 1) * Math.pow(2, adjust.exposure ?? 0);
  if (Math.abs(brightness - 1) > 1e-4 || Math.abs((adjust.contrast ?? 1) - 1) > 1e-4 || Math.abs((adjust.saturate ?? 1) - 1) > 1e-4)
    out.push({ id: newLayerId('sf'), enabled: true, filter: { type: 'adjust', adjustment: { type: 'cssColor', brightness, contrast: adjust.contrast ?? 1, saturate: adjust.saturate ?? 1 } } });
  if ((adjust.blur ?? 0) > 0) out.push({ id: newLayerId('sf'), enabled: true, filter: { type: 'gaussianBlur', radius: adjust.blur } });
  return out;
}

/**
 * Faithful migration of the legacy CSS-composited device. Legacy semantics reproduced:
 *  - transform = translate(x,y)·rotate(rotation)·scale(scale) about the top-left;
 *  - a group's blend (when not normal) overrides each member's blend, its opacity
 *    multiplies each member's opacity and its mask applies to members without their own
 *    (that is what the CSS did), so groups become pass-through groups.
 */
export function migrateLegacyImageDevice(dev: TelaImageDevice): RasterDocument {
  const doc = createDocument(dev.width, dev.height, { background: null });
  const groups = new Map((dev.groups || []).map(g => [g.id, g]));
  const groupNodes = new Map<string, GroupLayer>();
  const root: RasterLayer[] = [];
  const chain = (gid?: string) => { const out: string[] = []; let cur = gid; const seen = new Set<string>(); while (cur && groups.has(cur) && !seen.has(cur)) { seen.add(cur); out.unshift(cur); cur = groups.get(cur)!.parentGroupId; } return out; };
  const ensureGroup = (gid: string): GroupLayer => {
    let node = groupNodes.get(gid); if (node) return node;
    const g = groups.get(gid)!;
    node = groupLayer([], { id: g.id, name: g.name || 'Group', visible: g.visible, opacity: 1, blend: 'pass-through' });
    groupNodes.set(gid, node);
    const parent = g.parentGroupId && groups.has(g.parentGroupId) ? ensureGroup(g.parentGroupId) : null;
    (parent ? parent.children : root).push(node);
    return node;
  };
  for (const l of dev.layers) {
    const ids = chain(l.groupId);
    const group = l.groupId ? groups.get(l.groupId) : undefined;
    const w = l.intrinsicWidth || 0, h = l.intrinsicHeight || 0;
    let opacity = l.opacity; let blend = LEGACY_BLEND[l.blend] || 'normal';
    for (const gid of ids) opacity *= groups.get(gid)!.opacity ?? 1;
    if (group && group.blend && group.blend !== 'normal') blend = LEGACY_BLEND[group.blend] || blend;
    const masks = legacyMask(l.mask || group?.mask, w, h);
    const s = l.scale || 1;
    const transform = affineMul(affineTranslate(l.x, l.y), affineMul(affineRotate(l.rotation || 0), affineScale(s)));
    const layer: PixelLayer = pixelLayer({ src: l.src, assetId: l.storagePath ? undefined : undefined }, w, h, {
      id: l.id, name: l.name || 'Layer', visible: l.visible, opacity, blend, transform,
      smartFilters: legacyAdjustToSmartFilters(l.adjust), ...(masks.mask ? { mask: masks.mask } : {}), ...(masks.vectorMask ? { vectorMask: masks.vectorMask } : {}),
      ...(l.mediaKind && l.mediaKind !== 'IMAGE' ? { media: { kind: l.mediaKind, src: l.src } } : {}),
    });
    if (!layer.smartFilters?.length) delete layer.smartFilters;
    if (ids.length) ensureGroup(ids[ids.length - 1]).children.push(layer); else root.push(layer);
  }
  doc.layers = root;
  return doc;
}
