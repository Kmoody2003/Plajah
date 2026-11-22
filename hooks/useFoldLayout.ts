import { useLayoutEffect } from 'react';
import { useViewport, getViewport, type Viewport } from './useViewport';

// ─────────────────────────────────────────────────────────────────────────
// Foldable layout mode for the phone shell.
//
// The Android app runs the phone shell on an unfolded foldable (Z Fold / Pixel Fold
// inner screen, ~580–1050 css px, near-square). This picks the layout views should use
// there and mirrors it onto <html data-fold-layout>, which drives the Tailwind variants
// declared in index.css:
//
//   fold:        two panes side by side (inner screen flat, or book posture)
//   fold-book:   book posture — the vertical hinge is the gutter (--fold-hinge-x/w)
//   fold-table:  tabletop posture — horizontal hinge: media on top, controls below
//
// 'off' everywhere else: phones under 580px, cover screens, tablets and desktop are
// left exactly as they were.
// ─────────────────────────────────────────────────────────────────────────

export type FoldLayout = 'off' | 'two-pane' | 'book' | 'tabletop';

function isAndroidUA(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export function foldLayoutFor(v: Viewport): FoldLayout {
  if (v.width < 580) return 'off';
  if (v.foldMode === 'book') return 'book';
  if (v.foldMode === 'tabletop') return 'tabletop';
  if (v.foldMode === 'inner') return 'two-pane';
  // Browser on a foldable (no native posture bridge): only Android runs the phone shell
  // at this width; iPads and desktops keep their own shells.
  if (v.foldMode === 'none' && v.isFoldInner && isAndroidUA()) return 'two-pane';
  return 'off';
}

function syncAttr(layout: FoldLayout) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement;
  if (!r) return;
  if (layout === 'off') r.removeAttribute('data-fold-layout');
  else if (r.getAttribute('data-fold-layout') !== layout) r.setAttribute('data-fold-layout', layout);
}

// Keep the attribute current even before any view mounts (one module-level listener).
if (typeof window !== 'undefined') {
  const update = () => syncAttr(foldLayoutFor(getViewport()));
  update();
  window.addEventListener('resize', update, { passive: true });
  window.addEventListener('orientationchange', update, { passive: true });
  window.addEventListener('plajah:foldable-change', update);
}

export interface FoldLayoutState {
  layout: FoldLayout;
  /** Any unfolded-inner layout: show two panes instead of the phone's one. */
  twoPane: boolean;
  book: boolean;
  tabletop: boolean;
}

export function useFoldLayout(): FoldLayoutState {
  const v = useViewport();
  const layout = foldLayoutFor(v);
  syncAttr(layout);
  return {
    layout,
    twoPane: layout !== 'off',
    book: layout === 'book',
    tabletop: layout === 'tabletop',
  };
}

/**
 * Tabletop posture: size an element (with class `pj-fold-top`) so its bottom edge sits on
 * the horizontal hinge. Sets --pj-fold-top-h on the element from --fold-hinge-y minus the
 * element's own top offset; no-op in every other layout.
 */
export function useTabletopTop(ref: { current: HTMLElement | null }, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) { el.style.removeProperty('--pj-fold-top-h'); return; }
    const measure = () => {
      const root = getComputedStyle(document.documentElement);
      const hingeY = parseFloat(root.getPropertyValue('--fold-hinge-y')) || window.innerHeight / 2;
      const top = el.getBoundingClientRect().top;
      el.style.setProperty('--pj-fold-top-h', `${Math.max(160, Math.round(hingeY - top))}px`);
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('plajah:foldable-change', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('plajah:foldable-change', measure);
    };
  }, [ref, active]);
}
