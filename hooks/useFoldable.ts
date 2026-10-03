import { useState, useEffect } from 'react';

export type FoldableScreenType = 'COVER' | 'INNER' | 'TABLET' | 'STANDARD_PHONE' | 'DESKTOP';
export type FoldablePosture = 'FLAT' | 'TABLETOP' | 'BOOK' | 'UNKNOWN';

export interface FoldableState {
  screenType: FoldableScreenType;
  posture: FoldablePosture;
  isFoldable: boolean;
  isCoverScreen: boolean;
  isInnerScreen: boolean;
  isFlexMode: boolean;
  aspectRatio: number;
  width: number;
  height: number;
  hingeAngle?: number;
}

/**
 * Hook to adaptively optimize UI for Samsung Galaxy Z Fold 7, Z Fold 8, Z Fold 8 Ultra,
 * and modern foldables across outer cover and inner square displays.
 */
export function useFoldable(): FoldableState {
  const [state, setState] = useState<FoldableState>(() => computeFoldableState());

  useEffect(() => {
    const handleResize = () => {
      setState(computeFoldableState());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    // Watch for Device Posture API if supported by modern browser
    let postureChangeHandler: (() => void) | null = null;
    const navAny = navigator as any;
    if (navAny?.devicePosture) {
      postureChangeHandler = () => setState(computeFoldableState());
      navAny.devicePosture.addEventListener?.('change', postureChangeHandler);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (postureChangeHandler && navAny?.devicePosture) {
        navAny.devicePosture.removeEventListener?.('change', postureChangeHandler);
      }
    };
  }, []);

  return state;
}

function computeFoldableState(): FoldableState {
  if (typeof window === 'undefined') {
    return {
      screenType: 'DESKTOP',
      posture: 'FLAT',
      isFoldable: false,
      isCoverScreen: false,
      isInnerScreen: false,
      isFlexMode: false,
      aspectRatio: 16 / 9,
      width: 1920,
      height: 1080,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspectRatio = width / (height || 1);
  const ua = navigator.userAgent.toLowerCase();

  // Modern Device Posture API (Chromium / Samsung Internet / Android WebView)
  const navAny = navigator as any;
  const postureType = navAny?.devicePosture?.type; // 'continuous' | 'folded'

  // CSS Viewport segments query (W3C Foldable Web Standard)
  const hasHSegments = typeof window.matchMedia === 'function' &&
    (window.matchMedia('(horizontal-viewport-segments: 2)').matches ||
     window.matchMedia('(screen-spanning: single-fold-horizontal)').matches);
  const hasVSegments = typeof window.matchMedia === 'function' &&
    (window.matchMedia('(vertical-viewport-segments: 2)').matches ||
     window.matchMedia('(screen-spanning: single-fold-vertical)').matches);

  // Samsung Galaxy Z Fold characteristic dimensions:
  // Cover Screen: Tall & narrow (21.5:9 to 23:9 ratio, width 360px - 420px, height 840px - 980px, aspect < 0.52)
  // Inner Screen: Near-square (width 660px - 960px, height 780px - 1000px, aspect 0.8 - 1.35)
  const isTallNarrowRatio = aspectRatio < 0.56;
  const isNearSquareRatio = aspectRatio >= 0.72 && aspectRatio <= 1.38;

  let screenType: FoldableScreenType;
  let isFoldable = hasHSegments || hasVSegments || postureType === 'folded';

  if (width < 450 && isTallNarrowRatio) {
    screenType = 'COVER';
    isFoldable = true; // Z Fold outer screen
  } else if (width >= 580 && width <= 1024 && isNearSquareRatio) {
    screenType = 'INNER';
    isFoldable = true; // Z Fold inner unfolded screen
  } else if (width < 768) {
    screenType = 'STANDARD_PHONE';
  } else if (width < 1200) {
    screenType = 'TABLET';
  } else {
    screenType = 'DESKTOP';
  }

  // Detect Flex Mode (Device half-folded like a laptop)
  let posture: FoldablePosture = 'FLAT';
  if (postureType === 'folded' || hasHSegments) {
    posture = 'TABLETOP';
  } else if (hasVSegments) {
    posture = 'BOOK';
  }

  const isFlexMode = posture === 'TABLETOP' || (isFoldable && height < 550 && width >= 580);

  return {
    screenType,
    posture,
    isFoldable,
    isCoverScreen: screenType === 'COVER',
    isInnerScreen: screenType === 'INNER',
    isFlexMode,
    aspectRatio,
    width,
    height,
  };
}
