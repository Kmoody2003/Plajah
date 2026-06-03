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

/**
 * Spatial focus manager for TV.
 * Call focusNearest('right') etc. to move focus between [data-tv-focusable] elements.
 */
export const useTVFocusManager = () => {
  const focusNearest = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const active = document.activeElement as HTMLElement | null;

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('[data-tv-focusable]')
    ).filter((el) => el !== active && !el.hasAttribute('disabled'));

    if (!active) {
      candidates[0]?.focus();
      return;
    }

    const r0 = active.getBoundingClientRect();
    let best: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of candidates) {
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
      }

      const total = axisScore + crossPenalty * 0.3;
      if (total < bestScore) {
        bestScore = total;
        best = el;
      }
    }

    best?.focus();
  }, []);

  /** Auto-wire D-pad arrows to spatial focus navigation */
  useDpadNavigation({
    onUp: () => focusNearest('up'),
    onDown: () => focusNearest('down'),
    onLeft: () => focusNearest('left'),
    onRight: () => focusNearest('right'),
  });

  return { focusNearest };
};
