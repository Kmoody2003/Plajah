import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Live responsive viewport state — the foundation for adaptive mobile layout.
//
// Distinct from usePlatform() (which is static + reads physical screen.width):
// this tracks the actual VIEWPORT and updates on resize / orientation / fold,
// via a single shared listener (useSyncExternalStore) so N components don't
// each attach their own. Use this for LAYOUT; usePlatform for platform TYPE.
// ─────────────────────────────────────────────────────────────────────────

export type Breakpoint = 'phone' | 'tablet' | 'desktop';
export type Orientation = 'portrait' | 'landscape';
export type FoldPosture = 'single' | 'spanning';

export interface Viewport {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isMobile: boolean;      // phone or tablet
  orientation: Orientation;
  foldPosture: FoldPosture; // 'spanning' when the window straddles a foldable hinge
}

const PHONE_MAX = 768;   // < 768  → phone
const TABLET_MAX = 1200; // < 1200 → tablet, else desktop

function detectFold(w: number, h: number): FoldPosture {
  if (typeof window === 'undefined') return 'single';
  // Viewport Segments API (Chrome on foldables): >1 segment means we straddle the hinge.
  const segs = (window as any).visualViewport?.segments || (window as any).getWindowSegments?.();
  if (Array.isArray(segs) && segs.length > 1) return 'spanning';
  // Heuristic fallback: very wide-and-short landscape at large size ≈ unfolded book posture.
  if (w >= 1024 && w / Math.max(h, 1) >= 2.1) return 'spanning';
  return 'single';
}

function read(): Viewport {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const breakpoint: Breakpoint = w < PHONE_MAX ? 'phone' : w < TABLET_MAX ? 'tablet' : 'desktop';
  return {
    width: w,
    height: h,
    breakpoint,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isMobile: breakpoint !== 'desktop',
    orientation: h >= w ? 'portrait' : 'landscape',
    foldPosture: detectFold(w, h),
  };
}

// ── Shared store (one listener, cached snapshot) ────────────────────────────
let snapshot: Viewport = read();
const listeners = new Set<() => void>();
let bound = false;

function onChange() {
  const next = read();
  // Only notify when something layout-relevant changed (avoid resize spam re-renders).
  if (
    next.breakpoint !== snapshot.breakpoint ||
    next.orientation !== snapshot.orientation ||
    next.foldPosture !== snapshot.foldPosture ||
    next.width !== snapshot.width ||
    next.height !== snapshot.height
  ) {
    snapshot = next;
    listeners.forEach((l) => l());
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!bound && typeof window !== 'undefined') {
    bound = true;
    window.addEventListener('resize', onChange, { passive: true });
    window.addEventListener('orientationchange', onChange, { passive: true });
    (window as any).visualViewport?.addEventListener?.('resize', onChange, { passive: true });
  }
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => snapshot;

/** Live viewport state — re-renders only when the breakpoint/orientation/fold/size changes. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Number of grid columns for a breakpoint, foldable-aware. */
export function columnsFor(v: Viewport, opts?: { phone?: number; tablet?: number; desktop?: number }): number {
  const base = v.isPhone ? (opts?.phone ?? 1) : v.isTablet ? (opts?.tablet ?? 2) : (opts?.desktop ?? 3);
  // A spanning foldable gets one extra column of real estate.
  return v.foldPosture === 'spanning' ? base + 1 : base;
}

/** Non-reactive read for use outside React. */
export const getViewport = read;
