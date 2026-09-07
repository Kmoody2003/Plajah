// lowerThirds — motion-graphic lower thirds for Fabula title clips.
//
// A LowerThirdSpec is a small scene: layered shapes (bars, plates, rules,
// paths) each with its own IN/OUT motion, plus typographic roles (title,
// subtitle, tag) driven by the existing per-glyph title animators. Everything
// is a pure function of clip-local time, so the DOM monitor, the canvas export
// and the gallery previews render the same frame — the same contract
// titleAnimators.ts already keeps.
//
// Design space is a 1920×1080 frame. Positions are relative to an ORIGIN the
// editor drags (the clip's tx/ty in % of frame), so a template re-anchors
// cleanly on any aspect. A clip stores `tGraphic` = { specId, overrides } and
// stays fully editable: every layer, motion and text role can be changed in
// the Fabula inspector without leaving the timeline.
import { glyphStates, type TitleAnim, type GlyphState } from './titleAnimators';
import type { FontKey } from '../tela/telaFonts';
import type { DesignLesson } from '../tela/designs/types';

export const LT_W = 1920, LT_H = 1080;

export type LTEase = 'linear' | 'out' | 'inOut' | 'back' | 'expo' | 'bounce';
export type LTMotionType = 'none' | 'slideL' | 'slideR' | 'slideU' | 'slideD' | 'wipeL' | 'wipeR' | 'wipeU' | 'wipeD' | 'growX' | 'growY' | 'fade' | 'pop' | 'spin' | 'drop';
export interface LTMotion {
  type: LTMotionType;
  /** Seconds. */
  duration: number;
  /** Seconds after clip start (IN) or before clip end (OUT). */
  delay?: number;
  ease?: LTEase;
  /** Slide distance as a fraction of the layer's own size (slide) — default 1.2; spin degrees for 'spin'. */
  amount?: number;
}

/** Colour tokens resolve against the clip's palette so a recolour is one edit. */
export type LTColor = 'accent' | 'ink' | 'paper' | 'secondary' | (string & {});

export type LTLayerKind = 'rect' | 'ellipse' | 'line' | 'path';
export interface LTLayer {
  id: string; label: string; kind: LTLayerKind;
  /** Geometry in design px relative to the origin (y grows downward; negative y is above the anchor). */
  x: number; y: number; w: number; h: number;
  fill: LTColor; opacity?: number; rx?: number; rotation?: number;
  stroke?: LTColor; strokeWidth?: number; dash?: number[];
  /** 0..100-box path for kind 'path'. */
  path?: string;
  gradient?: { angle: number; from: LTColor; to: LTColor };
  blend?: 'normal' | 'screen' | 'multiply' | 'overlay' | 'difference';
  in: LTMotion; out?: LTMotion;
  hidden?: boolean;
}

export interface LTTextRole {
  font: FontKey; weight: number; size: number; color: LTColor;
  tracking?: number; upper?: boolean; italic?: boolean; lineHeight?: number;
  /** Text box relative to origin; text is laid out inside it. */
  x: number; y: number; w: number; align: 'left' | 'center' | 'right';
  anim: TitleAnim;
  /** Extra seconds before the animator starts (so text can follow its plate). */
  delay?: number;
  shadow?: boolean;
  hidden?: boolean;
  /** Max lines before we shrink the type to fit (default 2). */
  maxLines?: number;
  /** Rotation in degrees about the text box's left baseline (vertical labels, tilted titles). */
  rotation?: number;
}

export interface LowerThirdSpec {
  id: string; name: string; group: string; family?: string; tagline: string;
  /** Lower thirds occupy a keyed region; full-page templates intentionally design the whole frame. */
  format?: 'lower-third' | 'full-page';
  /** Optional production shader rendered beneath the editable vector/text stack. */
  shaderFusion?: {
    shaderId: string;
    opacity: number;
    blend: 'normal' | 'add' | 'screen' | 'multiply' | 'overlay' | 'lighten' | 'darken';
    params?: [number, number, number, number];
  };
  colors: { accent: string; ink: string; paper: string; secondary: string };
  /** Default anchor in % of frame. */
  origin: { x: number; y: number };
  layers: LTLayer[];
  title: LTTextRole; subtitle: LTTextRole; tag?: LTTextRole;
  defaults: { title: string; subtitle: string; tag?: string };
  /** Recommended clip length in seconds. */
  duration: number;
  lesson: DesignLesson;
  tags: string[];
}

/** What a Fabula title clip stores. */
export interface LTGraphicRef {
  specId: string;
  colors?: Partial<LowerThirdSpec['colors']>;
  layers?: Record<string, Partial<LTLayer>>;
  title?: Partial<LTTextRole>; subtitle?: Partial<LTTextRole>; tag?: Partial<LTTextRole>;
  /** Extra layers the editor added. */
  addedLayers?: LTLayer[];
  /** Layers the editor removed. */
  removedLayers?: string[];
}

// ── Easing ────────────────────────────────────────────────────────────────────
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function ease(kind: LTEase | undefined, p: number): number {
  p = clamp01(p);
  switch (kind) {
    case 'linear': return p;
    case 'inOut': return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    case 'back': { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
    case 'expo': return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
    case 'bounce': { const n1 = 7.5625, d1 = 2.75; if (p < 1 / d1) return n1 * p * p; if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + .75; if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + .9375; return n1 * (p -= 2.625 / d1) * p + .984375; }
    default: return 1 - Math.pow(1 - p, 3);
  }
}

// ── Evaluation ────────────────────────────────────────────────────────────────
export interface ResolvedLayer {
  layer: LTLayer;
  /** Absolute design px. */
  x: number; y: number; w: number; h: number;
  opacity: number; scaleX: number; scaleY: number; rotation: number;
  /** Clip rectangle (absolute) for wipes, or null. */
  clip: { x: number; y: number; w: number; h: number } | null;
  /** Scale pivot (absolute). */
  px: number; py: number;
  fill: string; stroke?: string; gradient?: { angle: number; from: string; to: string };
}
export interface ResolvedText {
  role: LTTextRole; text: string; glyphs: GlyphState[]; opacity: number;
  /** Absolute box. */
  x: number; y: number; w: number; color: string; fontFamily: string;
}
export interface ResolvedLowerThird {
  origin: { x: number; y: number };
  layers: ResolvedLayer[];
  title: ResolvedText; subtitle: ResolvedText | null; tag: ResolvedText | null;
  /** True while anything is still moving (renderers may skip caches). */
  animating: boolean;
}

export function resolveColor(c: LTColor | undefined, colors: LowerThirdSpec['colors']): string {
  if (!c) return colors.ink;
  return (colors as Record<string, string>)[c] || c;
}

/** Apply a clip's overrides to a spec. */
export function applyGraphicRef(spec: LowerThirdSpec, ref?: LTGraphicRef | null): LowerThirdSpec {
  if (!ref) return spec;
  const removed = new Set(ref.removedLayers || []);
  const layers = spec.layers.filter(l => !removed.has(l.id)).map(l => ref.layers?.[l.id] ? { ...l, ...ref.layers[l.id], in: { ...l.in, ...(ref.layers[l.id].in || {}) }, out: ref.layers[l.id].out ? { ...(l.out || l.in), ...ref.layers[l.id].out } : l.out } : l);
  for (const added of ref.addedLayers || []) layers.push(ref.layers?.[added.id] ? { ...added, ...ref.layers[added.id] } : added);
  const role = (base: LTTextRole, o?: Partial<LTTextRole>): LTTextRole => o ? { ...base, ...o, anim: { ...base.anim, ...(o.anim || {}) } } : base;
  return { ...spec, colors: { ...spec.colors, ...(ref.colors || {}) }, layers, title: role(spec.title, ref.title), subtitle: role(spec.subtitle, ref.subtitle), tag: spec.tag ? role(spec.tag, ref.tag) : ref.tag ? role({ ...spec.subtitle, ...ref.tag } as LTTextRole) : undefined };
}

function motionState(m: LTMotion | undefined, outM: LTMotion | undefined, t: number, D: number) {
  // IN progress 0→1, OUT progress 0→1 (1 = fully gone). OUT defaults to mirroring IN.
  const inM = m || { type: 'none', duration: 0 };
  const pIn = inM.type === 'none' ? 1 : ease(inM.ease, (t - (inM.delay || 0)) / Math.max(.001, inM.duration));
  const o = outM || (inM.type === 'none' ? undefined : { ...inM, delay: 0 });
  const pOut = !o || o.type === 'none' || !Number.isFinite(D) ? 0 : ease(o.ease, (t - (D - (o.delay || 0) - o.duration)) / Math.max(.001, o.duration));
  return { inM, outM: o, pIn, pOut };
}

function applyMotion(r: ResolvedLayer, m: LTMotion, k: number, dir: 1 | -1) {
  // k = 1 → fully hidden/away, 0 → resting. dir flips slide direction for OUT.
  const amt = m.amount ?? 1.2;
  switch (m.type) {
    case 'slideL': r.x -= r.w * amt * k * dir; break;
    case 'slideR': r.x += r.w * amt * k * dir; break;
    case 'slideU': r.y -= r.h * amt * k * dir; break;
    case 'slideD': r.y += r.h * amt * k * dir; break;
    case 'wipeL': r.clip = { x: r.x + (dir === 1 ? r.w * k : 0), y: r.y - r.h, w: r.w * (1 - k), h: r.h * 3 }; break;
    case 'wipeR': r.clip = { x: r.x + (dir === 1 ? 0 : r.w * k), y: r.y - r.h, w: r.w * (1 - k), h: r.h * 3 }; break;
    case 'wipeU': r.clip = { x: r.x - r.w, y: r.y + (dir === 1 ? r.h * k : 0), w: r.w * 3, h: r.h * (1 - k) }; break;
    case 'wipeD': r.clip = { x: r.x - r.w, y: r.y + (dir === 1 ? 0 : r.h * k), w: r.w * 3, h: r.h * (1 - k) }; break;
    case 'growX': r.scaleX *= 1 - k; r.px = dir === 1 ? r.x : r.x + r.w; break;
    case 'growY': r.scaleY *= 1 - k; r.py = r.y + r.h; break;
    case 'fade': r.opacity *= 1 - k; break;
    case 'pop': r.scaleX *= 1 - k; r.scaleY *= 1 - k; r.opacity *= Math.min(1, (1 - k) * 2); break;
    case 'spin': r.rotation += (m.amount ?? 90) * k * dir; r.opacity *= 1 - k * .6; break;
    case 'drop': r.y -= r.h * 2.2 * k * dir; r.opacity *= 1 - k * .5; break;
  }
}

/** Resolve the whole graphic at clip-local time `t` for a clip of `D` seconds. */
export function evaluateLowerThird(spec: LowerThirdSpec, t: number, D: number, texts: { title: string; subtitle?: string; tag?: string }, origin?: { x: number; y: number }): ResolvedLowerThird {
  const org = origin || spec.origin;
  const ox = LT_W * org.x / 100, oy = LT_H * org.y / 100;
  let animating = false;
  const layers: ResolvedLayer[] = [];
  for (const l of spec.layers) {
    if (l.hidden) continue;
    const r: ResolvedLayer = { layer: l, x: ox + l.x, y: oy + l.y, w: l.w, h: l.h, opacity: l.opacity ?? 1, scaleX: 1, scaleY: 1, rotation: l.rotation || 0, clip: null, px: ox + l.x + l.w / 2, py: oy + l.y + l.h / 2, fill: resolveColor(l.fill, spec.colors), stroke: l.stroke ? resolveColor(l.stroke, spec.colors) : undefined, gradient: l.gradient ? { angle: l.gradient.angle, from: resolveColor(l.gradient.from, spec.colors), to: resolveColor(l.gradient.to, spec.colors) } : undefined };
    const { inM, outM, pIn, pOut } = motionState(l.in, l.out, t, D);
    if (pIn < 1) { applyMotion(r, inM, 1 - pIn, 1); animating = true; }
    if (pOut > 0 && outM) { applyMotion(r, outM, pOut, -1); animating = true; }
    r.opacity = Math.max(0, Math.min(1, r.opacity)); // overshooting eases (back/bounce) must not exceed 1
    if (r.opacity <= .002 || r.scaleX <= .002 || r.scaleY <= .002) continue;
    layers.push(r);
  }
  const role = (rl: LTTextRole | undefined, text: string | undefined): ResolvedText | null => {
    if (!rl || rl.hidden || !text) return null;
    const shown = rl.upper ? text.toUpperCase() : text;
    const anim: TitleAnim = { ...rl.anim, delay: (rl.anim.delay || 0) + (rl.delay || 0) };
    const glyphs = glyphStates(shown, t, anim, D);
    if (glyphs.some(g => g.opacity < 1 || g.dx || g.dy || g.scale !== 1)) animating = true;
    return { role: rl, text: shown, glyphs, opacity: 1, x: ox + rl.x, y: oy + rl.y, w: rl.w, color: resolveColor(rl.color, spec.colors), fontFamily: rl.font };
  };
  const title = role(spec.title, texts.title) || { role: spec.title, text: '', glyphs: [], opacity: 1, x: ox + spec.title.x, y: oy + spec.title.y, w: spec.title.w, color: resolveColor(spec.title.color, spec.colors), fontFamily: spec.title.font };
  return { origin: { x: ox, y: oy }, layers, title, subtitle: role(spec.subtitle, texts.subtitle), tag: role(spec.tag, texts.tag), animating };
}

/** Bounding box (absolute design px) of the resting graphic — for safe-area checks and Tela hand-off. */
export function lowerThirdBounds(spec: LowerThirdSpec, origin?: { x: number; y: number }) {
  const r = evaluateLowerThird(spec, 1e6, Infinity, { title: 'Title', subtitle: 'Subtitle', tag: 'Tag' }, origin);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of r.layers) { x0 = Math.min(x0, l.x); y0 = Math.min(y0, l.y); x1 = Math.max(x1, l.x + l.w); y1 = Math.max(y1, l.y + l.h); }
  for (const tx of [r.title, r.subtitle, r.tag]) if (tx) { x0 = Math.min(x0, tx.x); y0 = Math.min(y0, tx.y); x1 = Math.max(x1, tx.x + tx.w); y1 = Math.max(y1, tx.y + tx.role.size * (tx.role.lineHeight ?? 1.15) * (tx.role.maxLines ?? 2)); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Helper for authoring: an IN motion with sensible defaults. */
export const mo = (type: LTMotionType, duration = .6, delay = 0, ease: LTEase = 'out', amount?: number): LTMotion => ({ type, duration, delay, ease, amount });
export const anim = (type: TitleAnim['type'], duration = .7, delay = 0, out = .4, stagger = .6): TitleAnim => ({ type, duration, delay, out, stagger });
