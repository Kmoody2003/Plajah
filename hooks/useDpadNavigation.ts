import { useEffect, useRef, useCallback } from 'react';

export interface DpadHandlers {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onSelect?: () => void;
  onBack?: () => void;
  onPlayPause?: () => void;
  onFastForward?: () => void;
  onRewind?: () => void;
  /** Set false to temporarily disable without unmounting */
  enabled?: boolean;
}

// Unified key map covering:
// - Standard arrow keys (all browsers)
// - FireTV remote (Android key events via Silk browser)
// - Tizen / Samsung remote (XF86 key names)
// - Roku web engine (same as arrow keys + Back)
// - Apple TV Siri remote (arrow keys + Menu)
const KEY_MAP: Record<string, keyof DpadHandlers> = {
  ArrowUp: 'onUp',
  ArrowDown: 'onDown',
  ArrowLeft: 'onLeft',
  ArrowRight: 'onRight',
  Enter: 'onSelect',
  Select: 'onSelect',
  ' ': 'onPlayPause',
  MediaPlayPause: 'onPlayPause',
  MediaPlay: 'onPlayPause',
  MediaPause: 'onPlayPause',
  MediaFastForward: 'onFastForward',
  MediaTrackNext: 'onFastForward',
  MediaRewind: 'onRewind',
  MediaTrackPrevious: 'onRewind',
  Backspace: 'onBack',
  Escape: 'onBack',
  GoBack: 'onBack',
  BrowserBack: 'onBack',
  // Tizen / Samsung
  XF86Back: 'onBack',
  XF86AudioPlay: 'onPlayPause',
  XF86AudioPause: 'onPlayPause',
  XF86AudioStop: 'onBack',
  XF86FastForward: 'onFastForward',
  XF86Rewind: 'onRewind',
  // Apple TV
  Menu: 'onBack',
};

// Android `KeyEvent` codes. Fire TV / Android TV WebViews routinely deliver the D-pad and the
// system Back button with a non-standard (or empty) `key`, so `keyCode` is the only reliable
// discriminator there. Kept separate from KEY_MAP because `key` always wins when present.
export const ANDROID_KEYCODES: Record<number, keyof DpadHandlers> = {
  4: 'onBack',        // KEYCODE_BACK
  19: 'onUp',         // KEYCODE_DPAD_UP
  20: 'onDown',
  21: 'onLeft',
  22: 'onRight',
  23: 'onSelect',     // KEYCODE_DPAD_CENTER
  38: 'onUp',         // browser arrow keyCodes (WebView reports these, not 19-22, in most builds)
  40: 'onDown',
  37: 'onLeft',
  39: 'onRight',
  13: 'onSelect',
  85: 'onPlayPause',  // KEYCODE_MEDIA_PLAY_PAUSE
  89: 'onRewind',
  90: 'onFastForward',
};

/** Resolve a remote/keyboard event to an action, preferring the standard `key` over the keycode. */
export const resolveDpadAction = (e: KeyboardEvent): keyof DpadHandlers | null =>
  KEY_MAP[e.key] ?? ANDROID_KEYCODES[e.keyCode || e.which] ?? null;

/**
 * Attaches D-pad / remote control keyboard event listeners.
 * Use `data-tv-focusable` attribute on elements you want included in TV focus management.
 */
export const useDpadNavigation = (handlers: DpadHandlers) => {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (handlers.enabled === false) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = resolveDpadAction(e);
      if (!action) return;
      const fn = ref.current[action] as (() => void) | undefined;
      if (fn) {
        e.preventDefault();
        fn();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers.enabled]);
};

// ── Focusable discovery ──────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[data-tv-focusable]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** True when the element is actually rendered (not hidden / zero-size / detached). */
const isVisible = (el: HTMLElement): boolean => {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[data-tv-ignore]')) return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;            // display:none / detached / in a collapsed ancestor
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;   // zero-size
  // NOTE: intentionally NOT filtering by viewport intersection. Spatial nav must
  // be able to move focus to OFF-SCREEN (scrolled) controls and scroll them into
  // view — that's how a D-pad reaches below-the-fold buttons (e.g. the sign-in
  // buttons on the landing page). Only truly hidden / zero-size / detached
  // elements are excluded here.
  return true;
};

/**
 * All currently focusable, visible elements. Native focusables are auto-discovered
 * so surfaces need no per-element tagging; opt out with `data-tv-ignore` on a
 * container, or force-include a custom element with `data-tv-focusable`.
 */
export const getFocusables = (root: ParentNode = document): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);

// ── Document-wide focusable cache ────────────────────────────────────────────
// `querySelectorAll` over this app's DOM plus a `getClientRects()` per hit is far too
// expensive to repeat on every keypress on a MediaTek/Amlogic TV SoC. The *element list*
// changes only when the DOM does, so cache it and let the caller invalidate on mutation /
// route change. Geometry is deliberately NOT cached — scrolling changes rects without any
// mutation — but it is read in one batched pass (see measureCandidates).

let cachedList: HTMLElement[] | null = null;
let cachedAt = 0;
const CACHE_MAX_AGE_MS = 2000; // safety net: a missed mutation must never wedge navigation

export const invalidateFocusables = (): void => { cachedList = null; };

/**
 * Cached document-wide focusable elements (unfiltered by visibility — the caller's
 * measurement pass drops detached/zero-size nodes while it reads rects anyway).
 * Scoped roots (e.g. a modal) are small, so they are queried directly, never cached.
 */
export const getFocusableElements = (root: ParentNode = document): HTMLElement[] => {
  if (root !== document) return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const now = Date.now();
  if (cachedList && now - cachedAt < CACHE_MAX_AGE_MS) return cachedList;
  cachedList = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  cachedAt = now;
  return cachedList;
};

// ── Spatial geometry (pure — unit-testable without a DOM) ────────────────────

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface NavRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A rect projected so that the pressed direction always points along +main. */
interface Projected {
  mainStart: number;
  mainEnd: number;
  crossStart: number;
  crossEnd: number;
}

// Negating the axis for 'up'/'left' collapses four directional cases into one comparison,
// which is what keeps the scoring identical (and therefore predictable) in all four directions.
const project = (r: NavRect, dir: Dir): Projected => {
  switch (dir) {
    case 'down':  return { mainStart: r.top,     mainEnd: r.bottom, crossStart: r.left, crossEnd: r.right };
    case 'up':    return { mainStart: -r.bottom, mainEnd: -r.top,   crossStart: r.left, crossEnd: r.right };
    case 'right': return { mainStart: r.left,    mainEnd: r.right,  crossStart: r.top,  crossEnd: r.bottom };
    case 'left':  return { mainStart: -r.right,  mainEnd: -r.left,  crossStart: r.top,  crossEnd: r.bottom };
  }
};

/** Sub-pixel/rounding slack when deciding whether a candidate is past the origin's edge. */
const EDGE_TOL = 4;
/** Cross-axis separation is weighted this much heavier than travel along the axis. */
const CROSS_WEIGHT = 6;
/** Tiebreaker between candidates that all overlap: prefer the better-centred one. */
const CENTER_WEIGHT = 0.15;
/** Cone half-slope (~35°) for candidates with no perpendicular overlap at all. */
const CONE_SLOPE = 0.7;

const contains = (a: NavRect, b: NavRect): boolean =>
  a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;

/**
 * Choose the best candidate rect in a direction. Returns an index into `candidates`, or -1
 * when nothing lies that way (an edge — the caller should leave focus alone).
 *
 * Why this shape: "nearest anything in roughly that direction" is what made TV navigation feel
 * random. A candidate must genuinely lie in the pressed direction, and then perpendicular
 * offset is punished ~6x harder than in-line travel, so a far-but-aligned item never loses to a
 * near-but-sideways one. Candidates are considered in three tiers and the first non-empty tier
 * wins outright, so a properly aligned neighbour can never be beaten by a diagonal one:
 *
 *   1. STRICT   — ahead, and either genuinely overlapping on the perpendicular axis or inside a
 *                 tight angle cone. This is the case that matters: from a card in a horizontal
 *                 rail, pressing Down can only reach items in the next rail that sit under it.
 *   2. RELAXED  — ahead, any perpendicular offset. Only reached when nothing overlaps (e.g. the
 *                 last item of a wide rail moving down into a short rail). Better a sideways jump
 *                 than a dead key, which reads as a frozen TV.
 *   3. STAGGERED— not strictly past the origin's trailing edge but clearly further along it and
 *                 overlapping (masonry / uneven card heights), which tier 1 and 2 both reject.
 */
export const pickInDirection = (origin: NavRect, candidates: NavRect[], dir: Dir): number => {
  const o = project(origin, dir);

  let strict = -1, strictScore = Infinity;
  let relaxed = -1, relaxedScore = Infinity;
  let staggered = -1, staggeredScore = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const rect = candidates[i];
    // A wrapper that swallows the origin (or a child inside it) is not a spatial neighbour —
    // targeting it makes focus appear to jump "nowhere" while the ring changes size.
    if (contains(rect, origin) || contains(origin, rect)) continue;

    const c = project(rect, dir);
    const overlap = Math.min(o.crossEnd, c.crossEnd) - Math.max(o.crossStart, c.crossStart);
    const crossGap = overlap > 0 ? 0 : -overlap;
    const centerDelta = Math.abs((c.crossStart + c.crossEnd) - (o.crossStart + o.crossEnd)) / 2;
    const score = Math.max(c.mainStart - o.mainEnd, 0)
      + crossGap * CROSS_WEIGHT
      + centerDelta * CENTER_WEIGHT;

    if (c.mainStart >= o.mainEnd - EDGE_TOL) {
      const forward = Math.max(c.mainStart - o.mainEnd, 0);
      if ((overlap > 0 || crossGap <= forward * CONE_SLOPE) && score < strictScore) {
        strictScore = score; strict = i;
      }
      if (score < relaxedScore) { relaxedScore = score; relaxed = i; }
    } else if (overlap > 0 && c.mainStart > o.mainStart + EDGE_TOL && c.mainEnd > o.mainEnd + EDGE_TOL) {
      if (score < staggeredScore) { staggeredScore = score; staggered = i; }
    }
  }

  if (strict !== -1) return strict;
  if (relaxed !== -1) return relaxed;
  return staggered;
};

/**
 * Read every candidate's geometry in one pass, dropping detached / hidden nodes as we go.
 * Callers must not write to the DOM until this returns — interleaving reads and writes forces
 * a synchronous re-layout per element, which is ruinous on TV hardware.
 */
export const measureCandidates = (
  els: HTMLElement[],
  exclude: HTMLElement | null
): { el: HTMLElement; rect: NavRect }[] => {
  const out: { el: HTMLElement; rect: NavRect }[] = [];
  for (const el of els) {
    if (el === exclude || !el.isConnected) continue;
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;      // hidden / collapsed / zero-size
    if (el.closest('[data-tv-ignore]')) continue;
    out.push({ el, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  }
  return out;
};

/**
 * Pure spatial pick: given the active element, return the best focus target in a direction.
 */
export const findInDirection = (
  active: HTMLElement | null,
  direction: Dir,
  candidates: HTMLElement[] = getFocusableElements()
): HTMLElement | null => {
  const measured = measureCandidates(candidates, active);
  if (!active || !active.isConnected) return measured[0]?.el ?? null;

  const r0 = active.getBoundingClientRect();
  const idx = pickInDirection(
    { left: r0.left, top: r0.top, right: r0.right, bottom: r0.bottom },
    measured.map((m) => m.rect),
    direction
  );
  return idx === -1 ? null : measured[idx].el;
};

// ── Focus + scroll ───────────────────────────────────────────────────────────

const prefersReducedMotion = (): boolean => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Focus an element and make sure it is actually *visible* — the single most common "nothing
 * happened" report on TV is focus landing off-screen with no scroll following it.
 *
 * Two deliberate choices: `preventScroll` stops the browser's own minimal scroll from parking
 * the item flush against the viewport edge (under TV overscan that is literally off the panel),
 * and the safe-area test means we only scroll when we have to, so short hops inside a rail don't
 * re-centre the whole page on every press.
 */
export const focusTVElement = (el: HTMLElement): void => {
  // ── read ──
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const padX = Math.max(48, vw * 0.08);
  const padY = Math.max(48, vh * 0.08);
  // "Spanning the band" counts as safe, otherwise anything wider/taller than the safe area
  // (full-width rows, tall panels) would re-centre on every single move.
  const okX = (r.left >= padX && r.right <= vw - padX) || (r.left <= padX && r.right >= vw - padX);
  const okY = (r.top >= padY && r.bottom <= vh - padY) || (r.top <= padY && r.bottom >= vh - padY);

  // ── write ──
  el.focus({ preventScroll: true });
  if (!okX || !okY) {
    el.scrollIntoView({
      block: okY ? 'nearest' : 'center',
      inline: okX ? 'nearest' : 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }
};

/**
 * Spatial focus manager for TV.
 * Call focusNearest('right') etc. to move focus between focusable elements.
 * Auto-wires arrow keys to spatial navigation.
 */
export const useTVFocusManager = (enabled = true) => {
  const focusNearest = useCallback((direction: Dir) => {
    const active = document.activeElement as HTMLElement | null;
    const target = findInDirection(active && active !== document.body ? active : null, direction);
    if (target) focusTVElement(target);
  }, []);

  useDpadNavigation({
    enabled,
    onUp: () => focusNearest('up'),
    onDown: () => focusNearest('down'),
    onLeft: () => focusNearest('left'),
    onRight: () => focusNearest('right'),
  });

  return { focusNearest };
};
