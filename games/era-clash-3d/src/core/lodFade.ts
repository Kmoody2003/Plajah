// Level-of-detail hand-overs that never show: the same plant (or tree) is drawn at every distance, as full detail
// near and as a cheap silhouette further out, and the two cross-fade by MSAA coverage (alpha-to-coverage) across a
// band — the resolve averages the samples into a real blend, so nothing grows, pops or appears, it only gains
// detail as you walk up to it. Users: core/forest.ts (trees ↔ impostors), undergrowth.ts, grassField.ts.
//
// Without MSAA (the low tier) there is no coverage to blend with, so each layer hands over at the band's midpoint.
import { cameraPosition, smoothstep, fwidth, float, uniform } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Coverage below this is discarded: ~0 with MSAA (blend), 0.5 without (hand over at the midpoint). */
export const lodCut = uniform(0.01);
export function setCoverage(on: boolean) { lodCut.value = on ? 0.01 : 0.5; }

/** Horizontal distance (m) from the camera to a world point (x, z). */
export function camDist(xz: N): N { return xz.sub(cameraPosition.xz).length(); }

/** 1 inside `a`, fading to 0 by `b` (metres). */
export function fadeOut(d: N, a: number, b: number): N { return float(1).sub(smoothstep(a, b, d)); }
/** 0 inside `a`, fading up to 1 by `b`. */
export function fadeIn(d: N, a: number, b: number): N { return smoothstep(a, b, d); }

/** An alpha-cut card's alpha sharpened to its edge (as three's alpha-to-coverage test does), times a fade. */
export function cutAlpha(a: N, cut: number, fade: N): N {
  return smoothstep(float(cut), float(cut).add(fwidth(a).max(1e-4)), a).mul(fade);
}
/** The mask that goes with it: drop what has no coverage left. */
export function keep(opacity: N): N { return opacity.greaterThan(lodCut); }
