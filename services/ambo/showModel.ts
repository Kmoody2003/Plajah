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
export const LAYER_ORDER = ['background', 'fill', 'slide', 'scripture', 'prop', 'overlay', 'mask'] as const;
export type LayerSlot = typeof LAYER_ORDER[number];

export const LAYER_LABEL: Record<LayerSlot, string> = {
  background: 'Background',
  fill: 'Media fill',
  slide: 'Slide',
  scripture: 'Scripture',
  prop: 'Props',
  overlay: 'Overlay',
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

export interface TransformSpec {
  rect?: Rect;
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
  | { kind: 'SCRIPTURE'; refId: string; translation?: string; lines?: string[]; reference?: string }
  | { kind: 'TIMER'; timerId: string; format?: 'mm:ss' | 'hh:mm:ss' | 'countdown' }
  | { kind: 'CLOCK'; format?: string }
  | { kind: 'LIVE'; inputId: string }
  | { kind: 'WEB'; url: string }
  | { kind: 'CLEAR' };

export interface SlideLayer {
  id: string;
  slot: LayerSlot;
  content: LayerContent;
  transform?: TransformSpec;
  mask?: MaskSpec;
  /** Hidden without being deleted — the operator's "mute this element". */
  enabled?: boolean;
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
  for (const layer of slide.layers) {
    if (layer.enabled === false) continue;
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

/** A slide that shows text over whatever background is already running. */
export function textSlide(text: string, opts: { style?: TextStyle; label?: string; group?: string } = {}): Slide {
  return {
    id: newId('sl'),
    label: opts.label,
    group: opts.group,
    layers: [{
      id: newId('ly'),
      slot: 'slide',
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
