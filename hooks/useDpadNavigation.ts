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
  ' ': 'onPlayPause',
  MediaPlayPause: 'onPlayPause',
  MediaPlay: 'onPlayPause',
  MediaPause: 'onPlayPause',
  MediaFastForward: 'onFastForward',
  MediaRewind: 'onRewind',
  Backspace: 'onBack',
  Escape: 'onBack',
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
      const action = KEY_MAP[e.key];
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

type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * Pure spatial pick: given the active element, return the best focus target in a
 * direction using a rect-geometry score (primary-axis distance + cross-axis penalty).
 */
export const findInDirection = (
  active: HTMLElement | null,
  direction: Dir,
  candidates: HTMLElement[] = getFocusables()
): HTMLElement | null => {
  const pool = candidates.filter((el) => el !== active);
  if (!active) return pool[0] ?? null;

  const r0 = active.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of pool) {
    const r = el.getBoundingClientRect();
    let axisScore = Infinity;
    let crossPenalty = 0;

    if (direction === 'up' && r.bottom <= r0.top + 4) {
      axisScore = r0.top - r.bottom;
      crossPenalty = Math.abs(r.left + r.width / 2 - (r0.left + r0.width / 2));
    } else if (direction === 'down' && r.top >= r0.bottom - 4) {
      axisScore = r.top - r0.bottom;
      crossPenalty = Math.abs(r.left + r.width / 2 - (r0.left + r0.width / 2));
    } else if (direction === 'left' && r.right <= r0.left + 4) {
      axisScore = r0.left - r.right;
      crossPenalty = Math.abs(r.top + r.height / 2 - (r0.top + r0.height / 2));
    } else if (direction === 'right' && r.left >= r0.right - 4) {
      axisScore = r.left - r0.right;
      crossPenalty = Math.abs(r.top + r.height / 2 - (r0.top + r0.height / 2));
    } else {
      continue;
    }

    // Cross-axis matters less than travel along the axis, so weight it down.
    const total = axisScore + crossPenalty * 0.4;
    if (total < bestScore) {
      bestScore = total;
      best = el;
    }
  }

  return best;
};

/**
 * Spatial focus manager for TV.
 * Call focusNearest('right') etc. to move focus between focusable elements.
 * Auto-wires arrow keys to spatial navigation.
 */
export const useTVFocusManager = (enabled = true) => {
  const focusNearest = useCallback((direction: Dir) => {
    const active = document.activeElement as HTMLElement | null;
    const target = findInDirection(active, direction);
    if (target) {
      target.focus();
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
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
