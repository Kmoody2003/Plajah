import { useCallback, useEffect, useState } from 'react';
import { useViewport } from './useViewport';
import { usePlatform } from './usePlatform';

// ── Chora / Plajah navigation layout ────────────────────────────────────────
//
// The side pillar (pages) + nano player scaled badly on 12–20" screens (a fixed
// 320px rail eats ~⅓ of a 1280px laptop). This resolves the ACTIVE nav layout
// from the live viewport, the platform, and a user preference:
//
//   • 'rail-full'  — the classic 320px left pillar (large desktop, unchanged)
//   • 'rail-slim'  — Concept A: ~192px left pillar, −40% (compact desktop 12–20")
//   • 'bar'        — Concept C: horizontal top bar + bottom nano strip (touch tablet / portrait)
//   • 'split'      — Concept B: thin icon pages rail left + create pillar right (opt-in)
//
// The user preference ('auto' | 'split' | 'bar' | 'rail') is persisted; 'auto'
// gives the responsive A→C behaviour, and the others let the user take control.
// Phones are untouched here — they keep the existing bottom tab bar.

export type NavLayoutPref = 'auto' | 'split' | 'bar' | 'rail';
export type NavLayoutMode = 'rail-full' | 'rail-slim' | 'bar' | 'split';

const STORAGE_KEY = 'plajah_nav_layout_v1';

// Width proxy for physical size. ~1600px ≈ a 20"+ desktop; 768–1600 ≈ 12–20" laptops.
const LARGE_DESKTOP_MIN = 1600;

function readPref(): NavLayoutPref {
  try {
    const p = localStorage.getItem(STORAGE_KEY);
    if (p === 'auto' || p === 'split' || p === 'bar' || p === 'rail') return p;
  } catch { /* SSR / blocked storage */ }
  return 'auto';
}

export interface NavLayout {
  mode: NavLayoutMode;
  pref: NavLayoutPref;
  setPref: (p: NavLayoutPref) => void;
  /** True on phones — callers keep using the existing bottom tab bar and ignore `mode`. */
  isPhone: boolean;
  isRail: boolean;   // rail-full or rail-slim
  isSlim: boolean;   // rail-slim
  isBar: boolean;    // horizontal bar
  isSplit: boolean;  // split pillars
}

export function useNavLayout(): NavLayout {
  const vp = useViewport();
  const platform = usePlatform();
  const [pref, setPrefState] = useState<NavLayoutPref>(readPref);

  // Keep in sync if another surface (e.g. a second tab) changes the preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setPrefState(readPref()); };
    const onLocal = () => setPrefState(readPref());
    window.addEventListener('storage', onStorage);
    window.addEventListener('plajah:nav-layout-changed', onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('plajah:nav-layout-changed', onLocal);
    };
  }, []);

  const setPref = useCallback((p: NavLayoutPref) => {
    setPrefState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent('plajah:nav-layout-changed', { detail: p })); } catch { /* */ }
  }, []);

  const isPhone = vp.isPhone;
  const touchTablet = platform.hasTouch && (vp.isTablet || vp.orientation === 'portrait');

  let mode: NavLayoutMode;
  if (pref === 'split') {
    mode = 'split';
  } else if (pref === 'bar') {
    mode = 'bar';
  } else if (pref === 'rail') {
    mode = vp.width >= LARGE_DESKTOP_MIN ? 'rail-full' : 'rail-slim';
  } else {
    // 'auto' — the responsive A→C behaviour.
    if (touchTablet) mode = 'bar';                                   // C: touch tablets / portrait
    else if (vp.width >= LARGE_DESKTOP_MIN) mode = 'rail-full';      // classic big-desktop pillar
    else mode = 'rail-slim';                                         // A: compact desktop 12–20"
  }

  return {
    mode,
    pref,
    setPref,
    isPhone,
    isRail: mode === 'rail-full' || mode === 'rail-slim',
    isSlim: mode === 'rail-slim',
    isBar: mode === 'bar',
    isSplit: mode === 'split',
  };
}
