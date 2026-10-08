// showModel — Ambo's document model. ProPresenter/FreeShow parity, on Plajah engines.
//
// THE CENTRAL IDEA, taken from ProPresenter and worth stating plainly: the
// output is NOT "whatever the current slide contains". It is a stack of six
// INDEPENDENT layers, each cleared, held and routed on its own. A background
// keeps playing while slides change. A lower third comes and goes without
// touching the slide. A mask stays put across the whole service.
//
// That independence is the whole difference between a slide viewer and a
// presentation system, and it is why scripture-only Ambo was not enough.
//
// Nothing here renders. This file is the model plus pure resolution helpers, so
// the compositor, the output router and the UI all agree on what "on screen"
// means before a single pixel is drawn.

// ── The layer stack ──────────────────────────────────────────────────────────

// Bottom to top. Index IS the composite order — do not reorder casually.
//
// SCRIPTURE SITS ABOVE SLIDE, ON PURPOSE. A verse must be able to composite
// OVER a slide that already has its own text and media — the reading laid over
// the sermon point, exactly as ProPresenter and FreeShow do it. Putting
// scripture on the `slide` slot would make it replace the slide instead, which
// is a different and much weaker product.
// 'lyrics' is its own slot (Chora lyric sync) so it can sit over a slide or a
// verse without replacing either, and never collides with an audio bed.
export const LAYER_ORDER = ['background', 'fill', 'slide', 'scripture', 'lyrics', 'prop', 'overlay', 'audio', 'mask'] as const;
export type LayerSlot = typeof LAYER_ORDER[number];

export const LAYER_LABEL: Record<LayerSlot, string> = {
  background: 'Background',
  fill: 'Media fill',
  slide: 'Slide',
  scripture: 'Scripture',
  lyrics: 'Lyrics',
  prop: 'Props',
  overlay: 'Overlay',
  audio: 'Audio Track',
  mask: 'Mask',
};

// ── Sources that can occupy a layer ──────────────────────────────────────────
//
// Each maps to an engine that already exists in the platform. The `engine`
// field is the routing key the compositor uses; it is deliberately explicit so
// a reader can see which subsystem owns each source type.

export type SourceEngine =
  | 'canvas2d'      // text, shapes — Ambo's own
  | 'pixels-gen'    // GeneratorRenderer      (plajahPixels/engine/core/generators)
  | 'pixels-shader' // shaderRenderer         (plajahPixels/engine/core)
  | 'fabula-video'  // gpuComposite + decoderBudget (services/fabula)
  | 'fabula-lottie' // vectorRaster           (services/fabula)
  | 'melos-audio'   // BeatsEngine / audioGraph
  | 'media'         // plain <img>/<video> element
  | 'live'          // camera / NDI / switcher bus
  | 'web';          // embedded page

export interface TextBlock {
  text: string;
  /** Which slot in a template this fills — lets one template take any content. */
  role?: 'title' | 'body' | 'reference' | 'caption' | 'credit';
}

export interface TextStyle {
  font?: string;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  lineHeight?: number;
  shadow?: boolean;
  outline?: number;
  /** Shrink to fit rather than overflow. On by default — see amboService. */
  autoFit?: boolean;
  maxLines?: number;
}

export interface Rect { x: number; y: number; w: number; h: number; }
/** Normalised 0–1 so a layer survives any output resolution. */
export const FULL_FRAME: Rect = { x: 0, y: 0, w: 1, h: 1 };

export interface MaskSpec {
  kind: 'SHAPE' | 'IMAGE' | 'LUMA' | 'ALPHA';
  /** Rounded-rect / ellipse for SHAPE; media url for IMAGE/LUMA. */
  src?: string;
  shape?: 'rect' | 'ellipse' | 'rounded';
  radius?: number;
  feather?: number;
  invert?: boolean;
  /** Free-form polygon, normalised. Beats a rectangle for a stage cut-out. */
  points?: Array<{ x: number; y: number }>;
}

import type { FitSpec } from './outputFit';

export interface TransformSpec {
  rect?: Rect;
  /** How this layer's media is fitted when its aspect differs from the output (overrides the output's setting). */
  fit?: Partial<FitSpec>;
  rotation?: number;
  opacity?: number;
  blend?: string;
  /** Four normalised corners — projector keystone / warp. */
  cornerPin?: Array<{ x: number; y: number }>;
  flipH?: boolean;
  flipV?: boolean;
}

export type LayerContent =
  | { kind: 'TEXT'; blocks: TextBlock[]; style?: TextStyle }
  | { kind: 'IMAGE'; src: string; fit?: 'cover' | 'contain' | 'fill' }
  | { kind: 'VIDEO'; src: string; loop?: boolean; volume?: number; inSec?: number; outSec?: number; muted?: boolean }
  | { kind: 'AUDIO'; src: string; volume?: number; loop?: boolean; fadeInSec?: number; fadeOutSec?: number }
  | { kind: 'GENERATOR'; mode: string; params?: Record<string, number | string> }
  | { kind: 'SHADER'; src: string; params?: Record<string, number> }
  | { kind: 'LOTTIE'; src: string; speed?: number; loop?: boolean }
  | { kind: 'SCRIPTURE'; refId: string; translation?: string; lines?: string[]; reference?: string;
      /** scriptureLayouts.ts look — adapts to every output's aspect ratio. */
      layoutId?: string;
      /** Entrance transition when scripture comes up from clear (default 'crossfade'). */
      transition?: string;
      copyright?: string;
      accent?: string;
      /** Text-only transition between verses (background stays up). */
      verseTransition?: string;
      /** Background-art blend onto the layers below + its opacity. */
      bgBlend?: string;
      bgOpacity?: number }
  /** A Tela-designed slide template, regenerated at each output's size. */
  | { kind: 'TELA_TEMPLATE'; templateId: string; fields: Record<string, string>; theme?: string;
      /** Background-art blend onto the layers below + its opacity (text stays normal). */
      bgBlend?: string; bgOpacity?: number }
  | { kind: 'TIMER'; timerId: string; format?: 'mm:ss' | 'hh:mm:ss' | 'countdown' }
  | { kind: 'CLOCK'; format?: string }
  | { kind: 'LIVE'; inputId: string; stream?: MediaStream; label?: string; fit?: 'cover' | 'contain' | 'fill' }
  | { kind: 'WEB'; url: string }
  /** Chora lyric sync. Every window computes the song position itself from
   *  the clock anchor (wall time → song time), so the type animates locally at
   *  full frame rate and a projector never waits on the studio for a frame. */
  | { kind: 'LYRICS'; lines: Array<{ time: number; text: string }>; styleId: string;
      title?: string; artist?: string; trackId?: string; bpm?: number; firstBeat?: number;
      clock: LyricClock }
  | { kind: 'CLEAR' };

/** Song position = playing ? anchorPos + (Date.now() − anchorMs)/1000 × rate : anchorPos */
export interface LyricClock { anchorMs: number; anchorPos: number; rate: number; playing: boolean }

export function lyricClockPos(c: LyricClock, nowMs = Date.now()): number {
  return c.playing ? c.anchorPos + ((nowMs - c.anchorMs) / 1000) * c.rate : c.anchorPos;
}

export interface SlideLayer {
  id: string;
  slot: LayerSlot;
  content: LayerContent;
  transform?: TransformSpec;
  mask?: MaskSpec;
  /** Hidden without being deleted — the operator's "mute this element". */
  enabled?: boolean;
  /** Tela document parity: optional layer label */
  name?: string;
  /** Tela document parity: explicit zIndex for ordering within or across slots */
  zIndex?: number;
  /** Tela document parity: alias for enabled/visible */
  visible?: boolean;
  /** Tela document parity: locked state preventing accidental modification */
  locked?: boolean;
  /** Tela document parity: layer opacity (0 to 1) */
  opacity?: number;
  /** Tela document parity: CSS/compositing blend mode */
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
  /** Tela document parity: linkage to backing Tela device */
  telaDeviceId?: string;
  telaFrameId?: string;
  meta?: Record<string, any>;
}

/** Which engine renders a given content kind. Single source of truth. */
export function engineFor(content: LayerContent): SourceEngine {
  switch (content.kind) {
    case 'GENERATOR': return 'pixels-gen';
    case 'SHADER': return 'pixels-shader';
    case 'LOTTIE': return 'fabula-lottie';
    case 'VIDEO': return 'fabula-video';
    case 'AUDIO': return 'melos-audio';
    case 'IMAGE': return 'media';
    case 'LIVE': return 'live';
    case 'WEB': return 'web';
    default: return 'canvas2d';
  }
}

// ── Actions — what a slide does besides look like something ──────────────────

export type Action =
  | { kind: 'AUDIO_PLAY'; src: string; volume?: number }
  | { kind: 'AUDIO_STOP' }
  | { kind: 'TIMER_START'; timerId: string; seconds?: number }
  | { kind: 'TIMER_RESET'; timerId: string }
  | { kind: 'CLEAR_LAYER'; slot: LayerSlot }
  | { kind: 'PROP_SHOW'; propId: string }
  | { kind: 'PROP_HIDE'; propId: string }
  | { kind: 'GOTO'; slideId: string }
  | { kind: 'MACRO'; macroId: string }
  | { kind: 'SWITCHER_CUT'; sourceId: string }
  | { kind: 'CUE'; refId: string };

// ── Slides, groups, arrangements ─────────────────────────────────────────────

export interface LoopDeckSettings {
  enabled: boolean;
  loopCount: number;             // number of times clip/slide loops before advancing (default: 1)
  selectionMode: 'sequential' | 'random'; // sequential in-order or random shuffle
  watchFolderConnected?: boolean;
  watchFolderName?: string;
  watchFolderPath?: string;
}

export interface Slide {
  id: string;
  label?: string;
  /** Verse / Chorus / Bridge — drives arrangement and the colour stripe. */
  group?: string;
  groupColor?: string;
  layers: SlideLayer[];
  onEnter?: Action[];
  onExit?: Action[];
  /** Auto-advance after N seconds. FreeShow's timed loop. */
  advanceAfterSec?: number;
  notes?: string;
  /** Stage-display-only text: the speaker's cue, never on program. */
  stageNotes?: string;
  /** Per-slide loop count override in LoopDeck mode. */
  loopCount?: number;
}

export interface SlideGroup { name: string; slideIds: string[]; color?: string; }

export type ShowKind = 'SONG' | 'SCRIPTURE' | 'MEDIA' | 'ANNOUNCEMENT' | 'TEMPLATE' | 'PRESENTATION';

export interface Show {
  id: string;
  title: string;
  kind: ShowKind;
  slides: Slide[];
  groups?: SlideGroup[];
  /** Group names in playback order — a song's verse/chorus map. */
  arrangement?: string[];
  /** CCLI / licence metadata. Required on screen for many songs. */
  copyright?: string;
  ccliNumber?: string;
  author?: string;
  tags?: string[];
  /** LoopDeck playback configuration for auto-advancing after N loops, random selection, and watch folders. */
  loopDeck?: LoopDeckSettings;
}

/**
 * Flatten a show into the slides that will actually play, honouring the
 * arrangement. A song stored once as Verse/Chorus/Bridge can then play
 * V1-C-V2-C-B-C without duplicating a single slide.
 */
export function flattenArrangement(show: Show): Slide[] {
  if (!show.arrangement?.length || !show.groups?.length) return show.slides;
  const byId = new Map(show.slides.map(s => [s.id, s]));
  const byGroup = new Map(show.groups.map(g => [g.name, g]));

  const out: Slide[] = [];
  for (const name of show.arrangement) {
    const g = byGroup.get(name);
    if (!g) continue;
    for (const id of g.slideIds) {
      const s = byId.get(id);
      if (s) out.push(s);
    }
  }
  return out.length ? out : show.slides;
}

// ── Live layer state — what is on air right now ──────────────────────────────

export interface LiveLayer {
  content: LayerContent;
  transform?: TransformSpec;
  mask?: MaskSpec;
  /** Slide this came from, so the UI can show what's driving each layer. */
  sourceSlideId?: string;
  since: number;
}

export type LiveStack = Partial<Record<LayerSlot, LiveLayer>>;

/**
 * Apply a slide to the current live stack.
 *
 * THE RULE: a slide only replaces the layers it actually defines. Everything
 * else is LEFT ALONE. Advancing a lyric slide must not kill the background
 * loop, and clearing text must not drop the mask. A layer goes away only when
 * the slide explicitly carries a CLEAR for that slot.
 */
export function applySlide(stack: LiveStack, slide: Slide, now: number): LiveStack {
  const next: LiveStack = { ...stack };
  // An EMPTY slide (no layers at all) is a deliberate blank: it clears every visual slot
  // (black on program) but leaves the audio bed and mask alone.
  if (slide.layers.length === 0) {
    for (const slot of LAYER_ORDER) if (slot !== 'audio' && slot !== 'mask') delete next[slot];
    return next;
  }
  for (const layer of slide.layers) {
    if (layer.enabled === false || layer.visible === false) continue;
    if (layer.content.kind === 'CLEAR') { delete next[layer.slot]; continue; }
    next[layer.slot] = {
      content: layer.content,
      transform: layer.transform,
      mask: layer.mask,
      sourceSlideId: slide.id,
      since: now,
    };
  }
  return next;
}

/** Clear one layer without disturbing the rest — the operator's per-layer stop. */
export function clearLayer(stack: LiveStack, slot: LayerSlot): LiveStack {
  const next = { ...stack };
  delete next[slot];
  return next;
}

/** Everything off. The panic button. */
export function clearAll(): LiveStack { return {}; }

// ── Per-Auxiliary Bus Clearing Helpers ───────────────────────────────────────

/**
 * Check if a specific layer slot is cleared on a given bus.
 */
export function isBusLayerCleared(busClearedSlots: Set<LayerSlot> | undefined, slot: LayerSlot): boolean {
  return busClearedSlots ? busClearedSlots.has(slot) : false;
}

/**
 * Clear a specific layer on an auxiliary bus without disturbing other buses or Program Out.
 */
export function clearBusLayer(busClearedSlots: Set<LayerSlot> | undefined, slot: LayerSlot): Set<LayerSlot> {
  const next = new Set(busClearedSlots || []);
  next.add(slot);
  return next;
}

/**
 * Clear all layers on an auxiliary bus (bus-level panic button).
 */
export function clearBusAll(): Set<LayerSlot> {
  return new Set(LAYER_ORDER);
}

/**
 * Reset / restore all cleared layers on an auxiliary bus.
 */
export function resetBusClearing(): Set<LayerSlot> {
  return new Set();
}

/**
 * Resolve the effective live stack for an auxiliary bus, honoring both
 * the output's allowed layer slots AND any active per-bus layer clearing masks.
 */
export function stackForBus(
  stack: LiveStack,
  allowedLayers: LayerSlot[] | readonly LayerSlot[],
  busClearedSlots?: Set<LayerSlot>
): LiveStack {
  const allow = new Set(allowedLayers);
  const out: LiveStack = {};
  for (const slot of LAYER_ORDER) {
    if (!allow.has(slot)) continue;
    if (busClearedSlots && busClearedSlots.has(slot)) continue;
    const layer = stack[slot];
    if (layer) out[slot] = layer;
  }
  return out;
}

/** Live layers in composite order, bottom first. */
export function compositeOrder(stack: LiveStack): Array<{ slot: LayerSlot; layer: LiveLayer }> {
  return LAYER_ORDER
    .map(slot => ({ slot, layer: stack[slot] }))
    .filter((e): e is { slot: LayerSlot; layer: LiveLayer } => !!e.layer);
}

/** Which engines the current stack needs — lets an output warm only those. */
export function enginesInUse(stack: LiveStack): SourceEngine[] {
  return [...new Set(compositeOrder(stack).map(e => engineFor(e.layer.content)))];
}

// ── Helpers for building shows ───────────────────────────────────────────────

let seq = 0;
export const newId = (prefix = 'x') => `${prefix}${++seq}_${LAYER_ORDER.length}`;

/**
 * A slide that shows text over whatever background is already running.
 * Default text layers have enabled: false by default unless defaultEnabled is true,
 * ensuring placeholder text never clutters clean media until activated.
 */
export function textSlide(
  text: string,
  opts: { style?: TextStyle; label?: string; group?: string; defaultEnabled?: boolean } = {}
): Slide {
  const isDefaultPlaceholder = !text || text.trim() === '' || text === 'New Slide Text';
  const enabled = opts.defaultEnabled !== undefined ? opts.defaultEnabled : !isDefaultPlaceholder;
  return {
    id: newId('sl'),
    label: opts.label,
    group: opts.group,
    layers: [{
      id: newId('ly'),
      slot: 'slide',
      enabled,
      visible: enabled,
      content: { kind: 'TEXT', blocks: [{ text, role: 'body' }], style: opts.style },
    }],
  };
}

/** A background that persists until something else replaces it. */
export function backgroundSlide(content: LayerContent, label = 'Background'): Slide {
  return {
    id: newId('sl'),
    label,
    layers: [{ id: newId('ly'), slot: 'background', content }],
  };
}

export interface PlaylistItem {
  id: string;
  title: string;
  show: Show;
  plannedSec: number;
  live?: boolean;
}

