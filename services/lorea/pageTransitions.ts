// Lorea page-turn registry + decision math. PURE (no React, no DOM): everything here runs under node --test.
//
// A "page turn" is the animation between two reader surfaces (outgoing page A, incoming page B). Film transitions
// (components/plajahPixels/engine/fx/phase3Transitions.ts, services/fabula/forgeTransitions.ts) are specified as
// GLSL shaders over two textures. A reader page is live DOM (selectable text, iframes, canvases), so the renderer
// for these specs is CSS 3D transforms + clip-path + gradients (components/lorea/PageTurn.tsx), NOT WebGL.
// What we DO reuse from the film modules is spec data: easing curves (services/dossier/film/motion.ts), param
// names/defaults (iris = wipe-circle, zoom = dolly-fade, cube = cube-turn, ...) and the ids themselves, which the
// tests check against the real modules so the mapping cannot silently rot. See docs/LOREA_PAGE_TURNS.md.

import { ease as filmEase } from '../dossier/film/motion';
import type { Ease } from '../dossier/film/filmTypes';

export type PageTurnId =
  | 'none' | 'curl' | 'flip' | 'slide' | 'cover' | 'dissolve' | 'wipe' | 'iris' | 'zoom' | 'cardflip' | 'cube';

export type PageTurnDir = 1 | -1;                       // 1 = forward (next page), -1 = back
export type BookKind = 'novel' | 'picture' | 'comic' | 'manga' | 'textbook';

/** Where a spec came from. `forge` = param shape/defaults and id come from a Fabula/Pixels transition. */
export interface ReuseInfo {
  kind: 'forge-params' | 'forge-inspired' | 'film-easing-only' | 'new';
  /** Fabula/Pixels transition id this spec borrows from (checked against PHASE3_TRANSITIONS by the tests). */
  forgeId?: string;
  presetId?: string;
  /** spec.params keys whose values must equal the Forge preset's params (checked by the tests). */
  sharedParams?: string[];
  note: string;
}

export interface PageTurnSpec {
  id: PageTurnId;
  label: string;
  blurb: string;
  durationMs: number;
  /** Easing for tap/key/narration turns. Names come from services/dossier/film/motion.ts. */
  easing: Ease;
  /** Result depends on next vs back AND on the book's reading direction. */
  directionAware: boolean;
  /** Back = the forward animation played in reverse with the layers swapped (physically true for paper). */
  reversible: boolean;
  /** The incoming page must be rendered underneath while it plays (everything except 'none'). */
  needsIncoming: boolean;
  /** Can follow a finger/mouse drag. */
  interactive: boolean;
  /** Has a real two-page-spread geometry (otherwise the whole spread moves as one surface). */
  spreadAware: boolean;
  /** Wants a third surface: the back of the leaf. */
  needsFlap: boolean;
  /** Runs on the live EPUB container (no snapshot possible), see EPUB_DEGRADE. */
  epub: PageTurnId | 'self';
  sound: 'rustle' | 'swish' | 'none';
  params: Record<string, number>;
  reuse: ReuseInfo;
}

const S = (s: PageTurnSpec): PageTurnSpec => s;

export const PAGE_TURNS: PageTurnSpec[] = [
  S({
    id: 'none', label: 'None', blurb: 'Instant, no animation.', durationMs: 0, easing: 'linear',
    directionAware: false, reversible: false, needsIncoming: false, interactive: false, spreadAware: false, needsFlap: false,
    epub: 'self', sound: 'none', params: {},
    reuse: { kind: 'new', note: 'Not a transition: the page simply changes.' },
  }),
  S({
    id: 'curl', label: 'Page curl', blurb: 'The corner peels back with a moving fold, shaded paper back and a soft shadow.', durationMs: 780, easing: 'inOut',
    directionAware: true, reversible: true, needsIncoming: true, interactive: true, spreadAware: true, needsFlap: true,
    epub: 'slide', sound: 'rustle',
    params: { angle: 11, back: 0.16, shade: 0.6, lift: 0.05 },
    reuse: { kind: 'forge-inspired', forgeId: 'fold-turn', presetId: 'book', note: 'Nearest film cousin is Fold/Book (a hard hinge fold with crease shading). A peel with a moving, angled fold line and a reflected back face does not exist in the film set, so the geometry is new; only the crease-shading idea (param name `shade`) is shared.' },
  }),
  S({
    id: 'flip', label: 'Page flip', blurb: 'The page swings around the spine in 3D (single page or two-page spread).', durationMs: 720, easing: 'inOut',
    directionAware: true, reversible: true, needsIncoming: true, interactive: true, spreadAware: true, needsFlap: true,
    epub: 'slide', sound: 'rustle',
    params: { perspective: 0.55, shade: 0.55 },
    reuse: { kind: 'forge-params', forgeId: 'cube-turn', presetId: 'left', sharedParams: ['perspective', 'shade'], note: 'Perspective and shading params and defaults are cube-turn/Turn Left (the same 3D camera model). The hinge-at-the-spine geometry with a two-sided leaf is new.' },
  }),
  S({
    id: 'slide', label: 'Slide', blurb: 'The pages push each other sideways. Quiet and fast.', durationMs: 360, easing: 'inOut',
    directionAware: true, reversible: true, needsIncoming: true, interactive: true, spreadAware: false, needsFlap: false,
    epub: 'self', sound: 'swish',
    params: { angle: 180, softness: 0.015 },
    reuse: { kind: 'forge-params', forgeId: 'push-slide', presetId: 'left', sharedParams: ['angle', 'softness'], note: 'Push & Slide/Push Left: `angle` 180 = content leaves to the left. We reuse the angle convention (mirrored for RTL books) and the softness default.' },
  }),
  S({
    id: 'cover', label: 'Cover', blurb: 'The page slides away over the next one, which drifts into place beneath it.', durationMs: 420, easing: 'out',
    directionAware: true, reversible: true, needsIncoming: true, interactive: true, spreadAware: false, needsFlap: false,
    epub: 'slide', sound: 'swish',
    params: { parallax: 0.28, shade: 0.4 },
    reuse: { kind: 'forge-inspired', forgeId: 'push-slide', note: 'A push where only the top layer travels fully. Same direction convention as Push & Slide; the parallax and edge shadow are new.' },
  }),
  S({
    id: 'dissolve', label: 'Cross-dissolve', blurb: 'The pages blend into each other. The gentlest choice.', durationMs: 300, easing: 'inOut',
    directionAware: false, reversible: false, needsIncoming: true, interactive: false, spreadAware: false, needsFlap: false,
    epub: 'self', sound: 'none',
    params: { softness: 0.5 },
    reuse: { kind: 'forge-params', forgeId: 'film-dissolve', presetId: 'clean', sharedParams: ['softness'], note: 'Film Dissolve/Clean Optical: softness default. The film version is gamma-aware in a shader; CSS opacity blends in sRGB (visibly identical for text on paper, slightly darker mid-blend on photos).' },
  }),
  S({
    id: 'wipe', label: 'Wipe', blurb: 'The next page is revealed by a soft edge sweeping across.', durationMs: 480, easing: 'inOut',
    directionAware: true, reversible: false, needsIncoming: true, interactive: true, spreadAware: false, needsFlap: false,
    epub: 'self', sound: 'swish',
    params: { softness: 0.06 },
    reuse: { kind: 'forge-inspired', forgeId: 'wipe-stripes', presetId: 'broad', note: 'There is no plain linear wipe in the Forge set. Stripes Wipe with one band is the same maths; the soft edge uses Forge\'s `softness` param (fraction of the frame).' },
  }),
  S({
    id: 'iris', label: 'Iris', blurb: 'The next page opens as a circle from the edge you turned from.', durationMs: 620, easing: 'inOut',
    directionAware: true, reversible: false, needsIncoming: true, interactive: false, spreadAware: false, needsFlap: false,
    epub: 'self', sound: 'swish',
    params: { softness: 0.06, cx: 0.5, cy: 0.5, invert: 0 },
    reuse: { kind: 'forge-params', forgeId: 'wipe-circle', presetId: 'iris-open', sharedParams: ['softness', 'cx', 'cy', 'invert'], note: 'Circle Wipe/Iris Open, same four params and defaults. cx is moved toward the edge you turned from at run time.' },
  }),
  S({
    id: 'zoom', label: 'Zoom through', blurb: 'The page recedes while the next one pushes in from the distance.', durationMs: 520, easing: 'inOut',
    directionAware: false, reversible: true, needsIncoming: true, interactive: false, spreadAware: false, needsFlap: false,
    epub: 'self', sound: 'none',
    params: { amount: 0.3, ease: 0.6 },
    reuse: { kind: 'forge-params', forgeId: 'dolly-fade', presetId: 'push-in', sharedParams: ['amount', 'ease'], note: 'Dolly Fade/Push In: `amount` and `ease` defaults. Back reuses Pull Out by playing in reverse. The film version also defocuses (blur); CSS blur on a full page is too costly per frame, so it is omitted.' },
  }),
  S({
    id: 'cardflip', label: 'Card flip', blurb: 'The page turns over like a card; the next page is on its back.', durationMs: 700, easing: 'inOut',
    directionAware: true, reversible: true, needsIncoming: true, interactive: true, spreadAware: false, needsFlap: false,
    epub: 'slide', sound: 'swish',
    params: { perspective: 0.6, shade: 0.4 },
    reuse: { kind: 'forge-params', forgeId: 'swish-3d', presetId: 'left-swing', sharedParams: ['perspective', 'shade'], note: 'Swish 3D/Swing Left shares perspective and shade defaults. Swish is a whip with motion blur; a two-faced card rotating about its centre axis is new.' },
  }),
  S({
    id: 'cube', label: 'Cube', blurb: 'Both pages are faces of a cube that rotates.', durationMs: 650, easing: 'inOut',
    directionAware: true, reversible: true, needsIncoming: true, interactive: true, spreadAware: false, needsFlap: false,
    epub: 'slide', sound: 'swish',
    params: { perspective: 0.55, shade: 0.55 },
    reuse: { kind: 'forge-params', forgeId: 'cube-turn', presetId: 'left', sharedParams: ['perspective', 'shade'], note: 'Cube Turn/Turn Left: same axis, perspective and edge-shading params and defaults.' },
  }),
];

export const PAGE_TURN_IDS: PageTurnId[] = PAGE_TURNS.map(t => t.id);
const BY_ID: Record<string, PageTurnSpec> = Object.fromEntries(PAGE_TURNS.map(t => [t.id, t]));
export const isPageTurnId = (v: unknown): v is PageTurnId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, v);
export const getSpec = (id: PageTurnId): PageTurnSpec => BY_ID[id] ?? BY_ID.none;

/** Styles offered in pickers (everything but 'none', which has its own 'Off' entry). */
export const PICKABLE_STYLES: PageTurnId[] = PAGE_TURN_IDS.filter(i => i !== 'none');

/** Easing lookup. Reuses the film renderer's curves so the Fabula timeline and the reader feel the same. */
export function easeTurn(kind: Ease, x: number): number { return filmEase(kind, x); }

// ── what the reader is asked to do ───────────────────────────────────────────

/** The reader's own setting: follow the author, reduce to a quick fade, turn animation off, or force one style. */
export type PageAnimationPref = 'author' | 'reduce' | 'off' | PageTurnId;
export const isPageAnimationPref = (v: unknown): v is PageAnimationPref => v === 'author' || v === 'reduce' || v === 'off' || isPageTurnId(v);

/** Stored on the book edition (Album.bookTela.pageTurn and the Tela bundle): the author's choice. */
export interface AuthorPageTurn {
  style?: PageTurnId | 'auto';
  /** chapterId -> style. */
  perChapter?: Record<string, PageTurnId | 'auto'>;
  /** frameId (Tela edition) -> style. Wins over perChapter. */
  perPage?: Record<string, PageTurnId | 'auto'>;
}

const MAX_OVERRIDES = 500;
/** Untrusted input (Firestore / bundle JSON): keep only known ids and a bounded number of overrides. */
export function sanitizeAuthorPageTurn(raw: unknown): AuthorPageTurn | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown): v is PageTurnId | 'auto' => v === 'auto' || isPageTurnId(v);
  const out: AuthorPageTurn = {};
  if (ok(r.style)) out.style = r.style;
  for (const k of ['perChapter', 'perPage'] as const) {
    const m = r[k]; if (!m || typeof m !== 'object') continue;
    const e = Object.entries(m as Record<string, unknown>).filter(([key, v]) => typeof key === 'string' && key.length < 200 && ok(v)).slice(0, MAX_OVERRIDES);
    if (e.length) out[k] = Object.fromEntries(e) as Record<string, PageTurnId | 'auto'>;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Per-format defaults: picture book -> flip, novel -> curl, comic/manga -> slide (RTL aware), textbook -> dissolve. */
export const FORMAT_DEFAULTS: Record<BookKind, PageTurnId> = { novel: 'curl', picture: 'flip', comic: 'slide', manga: 'slide', textbook: 'dissolve' };
export const defaultStyleForKind = (k: BookKind): PageTurnId => FORMAT_DEFAULTS[k] ?? 'curl';

export function inferBookKind(o: { visualLed?: boolean; rtl?: boolean; format?: string; textbook?: boolean }): BookKind {
  const f = (o.format || '').toUpperCase();
  if (f === 'MANGA' || f === 'WEBTOON' || (o.rtl && (o.visualLed || f === 'COMIC' || f === 'GRAPHIC_NOVEL'))) return 'manga';
  if (f === 'COMIC' || f === 'GRAPHIC_NOVEL') return 'comic';
  if (f === 'ILLUSTRATED' || f === 'PICTURE_BOOK' || o.visualLed) return 'picture';
  if (f === 'NON_FICTION' || f === 'TEXTBOOK' || o.textbook) return 'textbook';
  return 'novel';
}

export interface ResolvedPageTurn {
  id: PageTurnId;
  durationMs: number;
  interactive: boolean;
  /** Why this style: lets the UI say "Author's choice" / "Reduced motion". */
  reason: 'off' | 'reduced-system' | 'reduced-pref' | 'user' | 'author-page' | 'author-chapter' | 'author-book' | 'format-default';
}

export const REDUCED_DURATION_MS = 140;

export function resolvePageTurn(o: {
  pref: PageAnimationPref;
  systemReducedMotion: boolean;
  author?: AuthorPageTurn;
  chapterId?: string;
  pageId?: string;
  kind: BookKind;
}): ResolvedPageTurn {
  const mk = (id: PageTurnId, reason: ResolvedPageTurn['reason']): ResolvedPageTurn => {
    const spec = getSpec(id);
    return { id, durationMs: spec.durationMs, interactive: spec.interactive, reason };
  };
  if (o.pref === 'off') return mk('none', 'off');
  // Author's pick first, so that "reduce" never turns an author 'none' into an animation.
  let id: PageTurnId; let reason: ResolvedPageTurn['reason'];
  if (o.pref !== 'author' && o.pref !== 'reduce') { id = o.pref; reason = 'user'; }
  else {
    const a = o.author;
    const pageSel = o.pageId ? a?.perPage?.[o.pageId] : undefined;
    const chapSel = o.chapterId ? a?.perChapter?.[o.chapterId] : undefined;
    if (pageSel && pageSel !== 'auto') { id = pageSel; reason = 'author-page'; }
    else if (chapSel && chapSel !== 'auto') { id = chapSel; reason = 'author-chapter'; }
    else if (a?.style && a.style !== 'auto') { id = a.style; reason = 'author-book'; }
    else { id = defaultStyleForKind(o.kind); reason = 'format-default'; }
  }
  if (id === 'none') return mk('none', reason);
  if (o.pref === 'reduce' || o.systemReducedMotion) {
    // Motion-sensitive readers get a short fade, never a sweep, spin or zoom. No drag-following either.
    return { id: 'dissolve', durationMs: REDUCED_DURATION_MS, interactive: false, reason: o.pref === 'reduce' ? 'reduced-pref' : 'reduced-system' };
  }
  return mk(id, reason);
}

// ── direction ────────────────────────────────────────────────────────────────

/**
 * Which way the outgoing page travels on screen when turning forward/back.
 * LTR forward: page leaves to the LEFT. RTL (manga, Arabic) forward: it leaves to the RIGHT. Back is the opposite.
 */
export function travelDirection(dir: PageTurnDir, rtl: boolean): 'left' | 'right' {
  const leavesLeft = (dir === 1) !== rtl;
  return leavesLeft ? 'left' : 'right';
}

/** The edge the turn starts from (where a finger grabs the page / where the iris opens). */
export function originEdge(dir: PageTurnDir, rtl: boolean): 'left' | 'right' {
  return travelDirection(dir, rtl) === 'left' ? 'right' : 'left';
}

/** Which tap zone / arrow means forward. In RTL books the LEFT side advances. */
export function dirForTapSide(side: 'left' | 'right', rtl: boolean): PageTurnDir {
  return (side === 'right') !== rtl ? 1 : -1;
}
export function dirForArrowKey(key: string, rtl: boolean): PageTurnDir | 0 {
  if (key === 'ArrowRight') return rtl ? -1 : 1;
  if (key === 'ArrowLeft') return rtl ? 1 : -1;
  return 0;
}

/** Direction implied by a change of linear position. */
export function dirForOrderChange(prev: number, next: number): PageTurnDir { return next >= prev ? 1 : -1; }

/** A jump (contents, scrubber, resume) is not a page turn: it fades quickly instead of curling through 40 pages. */
export const JUMP_FADE_MS = 240;
export const isJump = (prev: number, next: number): boolean => Math.abs(next - prev) > 1;
/** The style + duration actually played for a change of position `prev -> next`. */
export function effectiveTurn(turn: ResolvedPageTurn, prev: number, next: number, chained = false): { id: PageTurnId; durationMs: number; dir: PageTurnDir } {
  const dir = dirForOrderChange(prev, next);
  if (turn.id === 'none' || turn.durationMs <= 0) return { id: 'none', durationMs: 0, dir };
  if (isJump(prev, next)) return { id: 'dissolve', durationMs: Math.min(JUMP_FADE_MS, getSpec('dissolve').durationMs), dir };
  return { id: turn.id, durationMs: Math.round(turn.durationMs * (chained ? 0.7 : 1)), dir };
}

// ── drag math (interactive turns) ────────────────────────────────────────────

export const DRAG = {
  /** Movement before a gesture is even considered, in px. */
  slopPx: 10,
  /** |dx| must beat |dy| by this factor, otherwise it is a scroll. */
  horizontalBias: 1.35,
  /** Mouse/pen drags only start this close to the left/right edge (fraction of width); touch can start anywhere. */
  edgeZoneFrac: 0.22,
  /** Finger travel (fraction of width) that equals a complete turn. */
  travelFrac: 0.85,
  /** Release speed (px/s toward the turn) that commits regardless of progress. */
  flickPxPerS: 520,
  /** Progress past which a slow release commits. */
  commitProgress: 0.42,
};

/** +1 forward / -1 back from the horizontal finger movement, or 0 if it is not a horizontal drag. */
export function dragDirection(dx: number, rtl: boolean): PageTurnDir | 0 {
  if (dx === 0) return 0;
  const leftward = dx < 0;
  return leftward !== rtl ? 1 : -1;
}

/** Should this pointer movement start a page drag? */
export function shouldStartDrag(o: { dx: number; dy: number; pointerType: string; startXFrac: number }): boolean {
  const ax = Math.abs(o.dx), ay = Math.abs(o.dy);
  if (ax < DRAG.slopPx || ax < ay * DRAG.horizontalBias) return false;
  if (o.pointerType === 'touch') return true;
  return o.startXFrac <= DRAG.edgeZoneFrac || o.startXFrac >= 1 - DRAG.edgeZoneFrac;
}

/** Progress 0..1 in the direction of the turn for a finger travel (px, positive = toward the turn). */
export function dragProgress(travelPx: number, widthPx: number): number {
  if (!(widthPx > 0)) return 0;
  return Math.min(1, Math.max(0, travelPx / (widthPx * DRAG.travelFrac)));
}

/** Signed finger travel toward the turn direction (px). */
export function travelToward(dx: number, dir: PageTurnDir, rtl: boolean): number {
  // forward LTR = leftward = -dx; forward RTL = rightward = +dx; back flips it.
  const towardSign = (dir === 1) !== rtl ? -1 : 1;
  return dx * towardSign;
}

export type DragOutcome = 'commit' | 'cancel';
/** velocity = px/s toward the turn (negative = moving back toward cancel). */
export function decideDrag(o: { progress: number; velocityPxPerS: number }): DragOutcome {
  if (o.velocityPxPerS >= DRAG.flickPxPerS) return 'commit';
  if (o.velocityPxPerS <= -DRAG.flickPxPerS) return 'cancel';
  return o.progress >= DRAG.commitProgress ? 'commit' : 'cancel';
}

/** Exponentially smoothed velocity estimate from pointer samples (px/s). */
export function releaseVelocity(samples: { t: number; x: number }[], windowMs = 90): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) { if (last.t - s.t <= windowMs) { first = s; break; } }
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

export interface SpringState { x: number; v: number }
/** One semi-implicit Euler step of a damped spring toward `target`. dt in seconds. Substeps keep it stable at 30fps. */
export function springStep(s: SpringState, target: number, dt: number, stiffness = 190, damping = 26): SpringState {
  let { x, v } = s;
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  for (let i = 0; i < n; i++) { v += (-stiffness * (x - target) - damping * v) * h; x += v * h; }
  return { x, v };
}
export const springSettled = (s: SpringState, target: number, eps = 0.002): boolean => Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 8;

/** Progress -> eased progress for timed (non-drag) turns. */
export function timedProgress(spec: PageTurnSpec, elapsedMs: number, durationMs = spec.durationMs): number {
  if (durationMs <= 0) return 1;
  return easeTurn(spec.easing, Math.min(1, Math.max(0, elapsedMs / durationMs)));
}

// ── EPUB (no snapshot of the epub.js iframe is possible) ─────────────────────

/** What a style becomes on the live EPUB container: an exit/enter pair of the named kind. */
export function epubTurnKind(id: PageTurnId): 'none' | 'slide' | 'dissolve' | 'wipe' | 'iris' | 'zoom' {
  const e = getSpec(id).epub;
  if (id === 'none') return 'none';
  const k = e === 'self' ? id : e;
  return (k === 'slide' || k === 'dissolve' || k === 'wipe' || k === 'iris' || k === 'zoom') ? k : 'slide';
}
