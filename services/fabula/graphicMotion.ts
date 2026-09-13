// graphicMotion.ts — time-parameterized entrance/exit envelopes for broadcast
// template graphics on the Fabula timeline.
//
// A broadcast identity is a hand-authored SMIL SVG. SMIL can't be rasterized at
// an arbitrary time (a serialized SVG re-runs its own clock), so it can't give
// export parity. The fix mirrors the motion lower thirds: render the identity's
// *held* still once, then drive a deterministic envelope (translate / scale /
// wipe / fade, eased) computed from the clip-local time t and the clip's own
// duration D. Extending the clip handles moves D, which retimes the exit — the
// same contract a lower third already honours. Same math in the monitor and the
// offline export → identical pixels.
import { ease, type LTEase } from './lowerThirds';
import type { FabulaBroadcastAssetKind } from './broadcastPacks';

/** One directional move — used for both the IN (played from clip start) and the
 *  OUT (played so it ENDS at the clip end). All offsets are fractions of the
 *  frame; scale is a multiplier; wipe reveals along an edge. */
export interface GraphicMove {
  dur: number;            // seconds
  ease?: LTEase;
  delay?: number;         // seconds from the move's own edge
  dx?: number;            // start (IN) / end (OUT) x offset, fraction of frame width
  dy?: number;            // …y offset, fraction of frame height
  scale?: number;         // start (IN) / end (OUT) scale about the anchor
  wipe?: 'L' | 'R' | 'U' | 'D'; // edge the reveal grows from
  fade?: boolean;
}

export interface GraphicMotionSpec { in: GraphicMove; out?: GraphicMove; anchor?: { x: number; y: number } }

/** Resolved per-frame transform. Offsets/clip are fractions of the frame; the
 *  renderer multiplies by the actual W/H. */
export interface GraphicEnvelope {
  opacity: number;
  tx: number; ty: number;      // translate, fraction of frame
  sx: number; sy: number;      // scale about the anchor
  anchorX: number; anchorY: number; // 0..1
  clip: { x: number; y: number; w: number; h: number } | null; // fractions, null = whole frame
  animating: boolean;          // true while an IN/OUT is in flight — for cache keying
}

const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;

// Per-kind defaults. Persistent kinds (BUG, SCORE_STRIP) hold on screen and just
// settle out with a short fade; the two transition kinds cover the frame with a
// wipe on the way in and uncover on the way out.
const PRESETS: Record<FabulaBroadcastAssetKind, GraphicMotionSpec> = {
  OPENER:      { in: { dur: .95, ease: 'back', scale: .88, dy: .015, fade: true }, out: { dur: .6, ease: 'inOut', scale: .965, fade: true } },
  LOWER_THIRD: { in: { dur: .72, ease: 'expo', wipe: 'L', dy: .03 },               out: { dur: .48, ease: 'out', dy: .05, fade: true } },
  FULL_PAGE:   { in: { dur: .85, ease: 'out', dy: .022, fade: true },              out: { dur: .55, ease: 'inOut', fade: true } },
  BUG:         { in: { dur: .58, ease: 'back', scale: .55, fade: true },           out: { dur: .4, ease: 'out', scale: .85, fade: true } },
  STINGER:     { in: { dur: .5, ease: 'inOut', wipe: 'L' },                        out: { dur: .5, ease: 'inOut', wipe: 'R' } },
  TRANSITION:  { in: { dur: .55, ease: 'inOut', wipe: 'L' },                       out: { dur: .55, ease: 'inOut', wipe: 'R' } },
  SCORE_STRIP: { in: { dur: .6, ease: 'expo', dy: .08, fade: true },               out: { dur: .42, ease: 'out', dy: .08, fade: true } },
  OVERLAY:     { in: { dur: .7, ease: 'expo', dx: .06, fade: true },               out: { dur: .5, ease: 'out', dx: .06, fade: true } },
  CREDITS:     { in: { dur: .8, ease: 'out', dy: .04, fade: true },                out: { dur: .6, ease: 'inOut', fade: true } },
};

export function graphicMotionFor(kind: FabulaBroadcastAssetKind): GraphicMotionSpec {
  return PRESETS[kind] || PRESETS.LOWER_THIRD;
}

/** reveal 0→1 grows the visible window from the given edge (fractions of frame). */
function wipeRect(dir: 'L' | 'R' | 'U' | 'D', reveal: number): GraphicEnvelope['clip'] {
  const r = clamp01(reveal);
  switch (dir) {
    case 'L': return { x: 0, y: 0, w: r, h: 1 };
    case 'R': return { x: 1 - r, y: 0, w: r, h: 1 };
    case 'U': return { x: 0, y: 0, w: 1, h: r };
    case 'D': return { x: 0, y: 1 - r, w: 1, h: r };
  }
}

/**
 * Evaluate the envelope at clip-local time `t` (s) for a clip of `D` seconds.
 * `speed` (the identity's motionSpeed) scales the move durations. When `D` is
 * not finite (a live/looping placement) the OUT never fires.
 */
export function evaluateGraphicEnvelope(kind: FabulaBroadcastAssetKind, t: number, D: number, speed = 1): GraphicEnvelope {
  const spec = graphicMotionFor(kind);
  const anchor = spec.anchor || { x: .5, y: .5 };
  const env: GraphicEnvelope = { opacity: 1, tx: 0, ty: 0, sx: 1, sy: 1, anchorX: anchor.x, anchorY: anchor.y, clip: null, animating: false };
  const sp = Math.max(.2, speed || 1);
  const inM = spec.in, outM = spec.out;

  const inDur = Math.max(.001, inM.dur / sp), inDelay = (inM.delay || 0) / sp;
  const pIn = ease(inM.ease, (t - inDelay) / inDur);
  if (pIn < 1) {
    const k = 1 - pIn; // 1 = fully away, 0 = resting
    if (inM.dx) env.tx += inM.dx * k;
    if (inM.dy) env.ty += inM.dy * k;
    if (inM.scale != null) { const s = inM.scale + (1 - inM.scale) * pIn; env.sx *= s; env.sy *= s; }
    if (inM.fade) env.opacity *= pIn;
    if (inM.wipe) env.clip = wipeRect(inM.wipe, pIn);
    env.animating = true;
  }

  if (outM && Number.isFinite(D)) {
    const outDur = Math.max(.001, outM.dur / sp), outDelay = (outM.delay || 0) / sp;
    const pOut = ease(outM.ease, (t - (D - outDelay - outDur)) / outDur); // 0→1, 1 = fully gone
    if (pOut > 0) {
      const k = pOut;
      if (outM.dx) env.tx += outM.dx * k;
      if (outM.dy) env.ty += outM.dy * k;
      if (outM.scale != null) { const s = 1 + (outM.scale - 1) * pOut; env.sx *= s; env.sy *= s; }
      if (outM.fade) env.opacity *= 1 - pOut;
      if (outM.wipe) env.clip = wipeRect(outM.wipe, 1 - pOut);
      env.animating = true;
    }
  }

  env.opacity = clamp01(env.opacity);
  if (env.sx < .001) env.sx = .001;
  if (env.sy < .001) env.sy = .001;
  return env;
}
