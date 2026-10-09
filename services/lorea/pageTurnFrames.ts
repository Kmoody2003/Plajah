// Per-frame CSS for every page turn, as PURE functions of progress. The React layer (components/lorea/PageTurn.tsx)
// applies these strings straight to DOM nodes inside requestAnimationFrame: no React state per frame, and only
// transform / opacity / clip-path / mask / gradient overlays change (no layout).
//
// Conventions
//  * q in [0,1] is progress of the FORWARD formulation: surface `from` leaves, surface `to` arrives.
//  * Reversible styles play BACK as the forward animation in reverse with roles swapped (see frameFor): that is
//    physically what un-turning a page is, and it makes drag-back and tap-back exact mirrors of forward.
//  * `mirror` = the page leaves toward the RIGHT (RTL books, or a back-wipe). For the curl the mirror is applied to
//    the fold line itself (reflect P and n) so the maths below never branches on direction.
//  * Screen coordinates, y down. Angles in degrees for CSS, radians in the maths.

import type { PageTurnDir, PageTurnId } from './pageTransitions';
import { getSpec } from './pageTransitions';

export interface LayerCss {
  transform: string;
  opacity: number;
  clipPath: string;          // 'none' | inset() | polygon() | circle()
  mask: string;              // 'none' | gradient (soft-edged reveal)
  z: number;
  hidden: boolean;
  origin: string;
  backfaceHidden: boolean;
}
export interface ShadeCss { background: string; opacity: number; boxShadow: string }
export interface FrameOut {
  from: LayerCss; to: LayerCss;
  fromShade: ShadeCss | null; toShade: ShadeCss | null;
  /** Back of the leaf (curl / single-page flip): paper colour + faint ghost of `from`. */
  flap: (LayerCss & { shade: ShadeCss; ghost: number }) | null;
  /** Two-page-spread flip: the turning half (a copy of `from`, right half) and its back (a copy of `to`, left half). */
  leafFront: (LayerCss & { shade: ShadeCss }) | null;
  leafBack: (LayerCss & { shade: ShadeCss }) | null;
  perspectivePx: number;     // 0 = none
  perspectiveOrigin: string;
  clipStage: boolean;
}

export interface FrameInput {
  id: PageTurnId;
  /** Progress in the direction of the turn, 0..1 (already eased for timed turns; raw finger progress for drags). */
  p: number;
  dir: PageTurnDir;
  rtl: boolean;
  w: number; h: number;
  params?: Record<string, number>;
  spread?: boolean;
  /** Where the turn was started, as fractions of the stage (tap/drag point). Defaults: edge the page leaves from, middle. */
  originY?: number;
}

const r2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export const NEUTRAL: LayerCss = { transform: 'none', opacity: 1, clipPath: 'none', mask: 'none', z: 1, hidden: false, origin: '50% 50%', backfaceHidden: false };
const layer = (o: Partial<LayerCss> = {}): LayerCss => ({ ...NEUTRAL, ...o });
const NOSHADE: ShadeCss = { background: 'none', opacity: 0, boxShadow: 'none' };
const shade = (o: Partial<ShadeCss>): ShadeCss => ({ ...NOSHADE, ...o });
const black = (a: number) => `rgba(0,0,0,${r2(clamp01(a))})`;

// ── geometry helpers (exported for tests) ────────────────────────────────────

export type Pt = [number, number];
/** Clip the stage rectangle by the half-plane n·(x-P) >= 0 (keep='pos') or <= 0 (keep='neg'). Sutherland-Hodgman. */
export function clipRectByLine(w: number, h: number, P: Pt, n: Pt, keep: 'pos' | 'neg'): Pt[] {
  const s = keep === 'pos' ? 1 : -1;
  const f = (p: Pt) => s * (n[0] * (p[0] - P[0]) + n[1] * (p[1] - P[1]));
  const rect: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const out: Pt[] = [];
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i], b = rect[(i + 1) % rect.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
export function polygonCss(pts: Pt[]): string {
  if (pts.length < 3) return 'polygon(0px 0px, 0px 0px, 0px 0px)';
  return `polygon(${pts.map(p => `${r2(p[0])}px ${r2(p[1])}px`).join(', ')})`;
}
export function polygonArea(pts: Pt[]): number {
  let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2;
}
/** CSS matrix() that reflects the plane across the line through P with unit normal n. */
export function reflectionMatrix(P: Pt, n: Pt): { a: number; b: number; c: number; d: number; e: number; f: number; css: string } {
  const a = 1 - 2 * n[0] * n[0], b = -2 * n[0] * n[1], c = b, d = 1 - 2 * n[1] * n[1];
  const k = 2 * (n[0] * P[0] + n[1] * P[1]);
  const e = k * n[0], f = k * n[1];
  return { a, b, c, d, e, f, css: `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)}, ${d.toFixed(5)}, ${r2(e)}, ${r2(f)})` };
}
export function reflectPoint(P: Pt, n: Pt, x: Pt): Pt {
  const t = n[0] * (x[0] - P[0]) + n[1] * (x[1] - P[1]);
  return [x[0] - 2 * n[0] * t, x[1] - 2 * n[1] * t];
}
/** linear-gradient whose stops sit at fixed distances (px) from P measured along n. Stops must ascend. */
export function gradientAlong(n: Pt, P: Pt, w: number, h: number, stops: [number, string][]): string {
  const theta = Math.atan2(n[0], -n[1]);
  const L = w * Math.abs(n[0]) + h * Math.abs(n[1]);
  const base = n[0] * P[0] + n[1] * P[1] - (n[0] * w / 2 + n[1] * h / 2) + L / 2;
  return `linear-gradient(${r2(deg(theta))}deg, ${stops.map(([d, c]) => `${c} ${r2(base + d)}px`).join(', ')})`;
}

// ── curl ─────────────────────────────────────────────────────────────────────

export interface CurlGeometry { P: Pt; n: Pt; tFold: number; tMin: number; tMax: number; peel: Pt[]; keep: Pt[]; flapLen: number }
export function curlGeometry(q: number, w: number, h: number, mirror: boolean, angleDeg: number, originY = 0.5): CurlGeometry {
  // The fold tilts so the corner nearest where you grabbed lifts first, then flattens as the page goes over.
  const lean = (originY < 0.5 ? -1 : 1) * Math.abs(angleDeg);
  const a = rad(lean * (1 - 0.82 * q));
  const nx = Math.cos(a), ny = Math.sin(a);
  const corners: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const ts = corners.map(c => nx * c[0] + ny * c[1]);
  const tMin = Math.min(...ts), tMax = Math.max(...ts);
  const tFold = tMax - clamp01(q) * (tMax - tMin);
  let P: Pt = [nx * tFold, ny * tFold];
  let n: Pt = [nx, ny];
  if (mirror) { P = [w - P[0], P[1]]; n = [-n[0], n[1]]; }
  return { P, n, tFold, tMin, tMax, peel: clipRectByLine(w, h, P, n, 'pos'), keep: clipRectByLine(w, h, P, n, 'neg'), flapLen: tMax - tFold };
}

function curlFrame(q: number, w: number, h: number, mirror: boolean, par: Record<string, number>, originY: number): FrameOut {
  const angle = par.angle ?? 11, back = par.back ?? 0.16, sh = par.shade ?? 0.6;
  const g = curlGeometry(q, w, h, mirror, angle, originY);
  const { P, n } = g;
  const peelLen = Math.max(1, g.flapLen);
  const span = Math.max(w, h);
  // Light across the curled-over back: dark crease, bright crest where the paper rolls, then falls away.
  const flapGrad = gradientAlong(n, P, w, h, [
    [0, `rgba(0,0,0,${r2(0.42 * sh)})`],
    [Math.min(peelLen, span * 0.035), `rgba(255,255,255,${r2(0.30 * sh)})`],
    [Math.min(peelLen, span * 0.16), `rgba(0,0,0,${r2(0.10 * sh)})`],
    [Math.max(span * 0.17, peelLen), `rgba(0,0,0,${r2(0.2 * sh)})`],
  ]);
  const farEdge = -peelLen;                        // flap's free edge, in distance from the fold (mirrored side)
  const cast = Math.max(12, span * 0.09);
  const fromShade = shade({
    // Soft shadow the lifted flap throws on the page below, beyond its free edge, plus ambient darkening under it.
    background: gradientAlong(n, P, w, h, [[farEdge - cast, 'rgba(0,0,0,0)'], [farEdge, black(0.34 * sh)], [-0.01, black(0.16 * sh)], [0, 'rgba(0,0,0,0)']]),
    opacity: q <= 0.002 ? 0 : 1, boxShadow: 'none',
  });
  const toShade = shade({
    // Shadow of the fold on the page being uncovered: strongest at the crease, fading away from it.
    background: gradientAlong(n, P, w, h, [[0, black(0.46 * sh * (0.55 + 0.45 * (1 - q)))], [Math.max(14, span * 0.13), 'rgba(0,0,0,0)']]),
    opacity: q <= 0.002 ? 0 : 1, boxShadow: 'none',
  });
  const inside = q > 0.002 && g.peel.length >= 3;
  return {
    from: layer({ z: 2, clipPath: q <= 0.002 ? 'none' : polygonCss(g.keep), hidden: q >= 0.999 }),
    to: layer({ z: 1 }),
    fromShade, toShade,
    flap: {
      ...layer({ z: 3, clipPath: polygonCss(g.peel), transform: reflectionMatrix(P, n).css, origin: '0 0', hidden: !inside || q >= 0.999 }),
      shade: shade({ background: flapGrad, opacity: 1 }), ghost: back,
    },
    leafFront: null, leafBack: null, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

// ── flip (single page + spread) ──────────────────────────────────────────────

const persp = (w: number, h: number, p: number) => Math.max(w, h) * (3.0 - 2.0 * clamp01(p));

function flipFrame(q: number, w: number, h: number, mirror: boolean, par: Record<string, number>, spread: boolean): FrameOut {
  const sh = par.shade ?? 0.55;
  const th = 180 * clamp01(q);
  const sgn = mirror ? 1 : -1;                                   // LTR: rotateY(-theta)
  const lit = Math.sin(Math.min(th, 90) * Math.PI / 180);        // 0 -> 1 as the leaf turns edge-on
  const reveal = black(0.42 * sh * (1 - clamp01(q)));
  const facing = th > 90;
  if (spread) {
    const hingeOrigin = '50% 50%';
    // Leaf front is the half that lifts: LTR = right half, RTL = left half.
    const frontClip = mirror ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
    // Back of the leaf shows the arriving view's opposite half (LTR: its left half), mirrored by rotateY(180).
    const backClip = mirror ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)';
    // `to` is only shown on the half the leaf uncovers.
    const toClip = frontClip;
    return {
      from: layer({ z: 0 }),
      to: layer({ z: 1, clipPath: toClip }),
      fromShade: null,
      toShade: shade({ background: mirror ? `linear-gradient(to left, ${black(0.5 * sh)}, rgba(0,0,0,0) 38%)` : `linear-gradient(to right, ${black(0.5 * sh)}, rgba(0,0,0,0) 38%)`, opacity: clamp01(1 - q) * (q <= 0.002 ? 0 : 1) }),
      flap: null,
      leafFront: {
        ...layer({ z: 3, clipPath: frontClip, transform: `rotateY(${r2(sgn * th)}deg)`, origin: hingeOrigin, backfaceHidden: true, hidden: facing || q >= 0.999 }),
        shade: shade({ background: black(0.55 * sh), opacity: lit * 0.8 }),
      },
      leafBack: {
        ...layer({ z: 3, clipPath: backClip, transform: `rotateY(${r2(sgn * th)}deg) rotateY(180deg)`, origin: hingeOrigin, backfaceHidden: true, hidden: !facing || q <= 0.001 }),
        shade: shade({ background: black(0.55 * sh), opacity: (1 - Math.sin(Math.max(th - 90, 0) * Math.PI / 180)) * 0.8 }),
      },
      perspectivePx: r2(persp(w, h, par.perspective ?? 0.55)), perspectiveOrigin: '50% 50%', clipStage: false,
    };
  }
  // Single page: hinge on the spine edge (left for LTR, right for RTL).
  const hinge = mirror ? '100% 50%' : '0% 50%';
  const backT = mirror ? `rotateY(${r2(sgn * th)}deg) translateX(${r2(-w)}px) rotateY(180deg)` : `rotateY(${r2(sgn * th)}deg) translateX(${r2(w)}px) rotateY(180deg)`;
  return {
    from: layer({ z: 2, transform: `rotateY(${r2(sgn * th)}deg)`, origin: hinge, backfaceHidden: true, hidden: facing || q >= 0.999 }),
    to: layer({ z: 1 }),
    fromShade: shade({ background: black(0.6 * sh), opacity: lit * 0.8, boxShadow: 'none' }),
    toShade: shade({ background: reveal, opacity: 1 }),
    flap: {
      ...layer({ z: 3, transform: backT, origin: hinge, backfaceHidden: true, hidden: !facing || q <= 0.001, clipPath: 'none' }),
      shade: shade({ background: black(0.6 * sh), opacity: (1 - Math.sin(Math.max(th - 90, 0) * Math.PI / 180)) * 0.8 }), ghost: par.back ?? 0.14,
    },
    leafFront: null, leafBack: null, perspectivePx: r2(persp(w, h, par.perspective ?? 0.55)), perspectiveOrigin: '50% 50%', clipStage: false,
  };
}

// ── the simple ones ──────────────────────────────────────────────────────────

const noFlap = { flap: null, leafFront: null, leafBack: null } as const;

function slideFrame(q: number, mirror: boolean): FrameOut {
  const s = mirror ? 1 : -1;
  return {
    from: layer({ z: 1, transform: `translate3d(${r2(s * q * 100)}%, 0, 0)` }),
    to: layer({ z: 1, transform: `translate3d(${r2(-s * (1 - q) * 100)}%, 0, 0)` }),
    fromShade: null, toShade: null, ...noFlap, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

function coverFrame(q: number, mirror: boolean, par: Record<string, number>): FrameOut {
  const s = mirror ? 1 : -1;
  const px = par.parallax ?? 0.28, sh = par.shade ?? 0.4;
  return {
    from: layer({ z: 2, transform: `translate3d(${r2(s * q * 100)}%, 0, 0)` }),
    to: layer({ z: 1, transform: `translate3d(${r2(-s * (1 - q) * px * 100)}%, 0, 0)` }),
    fromShade: shade({ background: 'none', opacity: q > 0.002 && q < 0.998 ? 1 : 0, boxShadow: `${mirror ? '-' : ''}0 0 38px 4px rgba(0,0,0,${r2(0.5 * sh)})`.replace('-0 0', '0 0') }),
    toShade: shade({ background: black(0.6 * sh), opacity: 1 - q }),
    ...noFlap, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

function dissolveFrame(q: number): FrameOut {
  return {
    from: layer({ z: 1, hidden: q >= 0.999 }),
    to: layer({ z: 2, opacity: q }),
    fromShade: null, toShade: null, ...noFlap, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

function wipeFrame(q: number, travelRight: boolean, par: Record<string, number>): FrameOut {
  const f = Math.max(1.5, (par.softness ?? 0.06) * 100);
  const e = q * (100 + f) - f;                                 // edge position, % from the origin edge
  // The reveal starts at the edge the page is pulled FROM (opposite the side it travels to).
  const mask = `linear-gradient(${travelRight ? 'to right' : 'to left'}, #000 0%, #000 ${r2(Math.max(0, e))}%, transparent ${r2(Math.max(f * 0.1, e + f))}%)`;
  return {
    from: layer({ z: 1 }),
    to: layer({ z: 2, mask: q <= 0.001 ? 'linear-gradient(#0000, #0000)' : q >= 0.999 ? 'none' : mask }),
    fromShade: null, toShade: null, ...noFlap, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

function irisFrame(q: number, w: number, h: number, travelRight: boolean, par: Record<string, number>, originY: number): FrameOut {
  const soft = Math.max(0.004, par.softness ?? 0.06);
  const cx = travelRight ? 0.12 : 0.88, cy = clamp01(originY);
  const farx = Math.max(cx, 1 - cx) * w, fary = Math.max(cy, 1 - cy) * h;
  const maxR = Math.hypot(farx, fary);
  const feather = Math.max(3, soft * maxR);
  const R = q * (maxR + feather);
  const mask = `radial-gradient(circle at ${r2(cx * 100)}% ${r2(cy * 100)}%, #000 0px, #000 ${r2(Math.max(0, R - feather))}px, transparent ${r2(R)}px)`;
  return {
    from: layer({ z: 1 }),
    to: layer({ z: 2, mask: q <= 0.001 ? 'linear-gradient(#0000, #0000)' : q >= 0.999 ? 'none' : mask }),
    fromShade: null, toShade: null, ...noFlap, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

function zoomFrame(q: number, par: Record<string, number>): FrameOut {
  const a = par.amount ?? 0.3;
  const t = (par.ease ?? 0.6) > 0 ? q * (1 - (par.ease ?? 0.6)) + smooth(0, 1, q) * (par.ease ?? 0.6) : q;
  return {
    from: layer({ z: 1, transform: `scale3d(${r2(1 + a * t)}, ${r2(1 + a * t)}, 1)`, opacity: 1 - smooth(0.2, 0.95, t), hidden: t >= 0.999 }),
    to: layer({ z: 2, transform: `scale3d(${r2(1 - a * (1 - t))}, ${r2(1 - a * (1 - t))}, 1)`, opacity: smooth(0, 0.65, t) }),
    fromShade: null, toShade: null, ...noFlap, perspectivePx: 0, perspectiveOrigin: '50% 50%', clipStage: true,
  };
}

function cardFlipFrame(q: number, w: number, h: number, mirror: boolean, par: Record<string, number>): FrameOut {
  const s = mirror ? 1 : -1, sh = par.shade ?? 0.4;
  const lift = 1 + 0.05 * Math.sin(q * Math.PI);
  const facing = q > 0.5;
  return {
    from: layer({ z: 2, transform: `scale(${r2(lift)}) rotateY(${r2(s * 180 * q)}deg)`, backfaceHidden: true, hidden: facing }),
    to: layer({ z: 2, transform: `scale(${r2(lift)}) rotateY(${r2(-s * 180 * (1 - q))}deg)`, backfaceHidden: true, hidden: !facing }),
    fromShade: shade({ background: black(0.7 * sh), opacity: Math.sin(Math.min(q * 2, 1) * Math.PI / 2) }),
    toShade: shade({ background: black(0.7 * sh), opacity: 1 - Math.sin(Math.max(q * 2 - 1, 0) * Math.PI / 2) }),
    ...noFlap, perspectivePx: r2(persp(w, h, par.perspective ?? 0.6)), perspectiveOrigin: '50% 50%', clipStage: false,
  };
}

function cubeFrame(q: number, w: number, h: number, mirror: boolean, par: Record<string, number>): FrameOut {
  const s = mirror ? 1 : -1, sh = par.shade ?? 0.55, z = r2(w / 2);
  return {
    from: layer({ z: 1, transform: `translateZ(${-z}px) rotateY(${r2(s * 90 * q)}deg) translateZ(${z}px)`, hidden: q >= 0.999 }),
    to: layer({ z: 1, transform: `translateZ(${-z}px) rotateY(${r2(-s * 90 * (1 - q))}deg) translateZ(${z}px)`, hidden: q <= 0.001 }),
    fromShade: shade({ background: black(0.8 * sh), opacity: Math.sin(q * Math.PI / 2) }),
    toShade: shade({ background: black(0.8 * sh), opacity: Math.cos(q * Math.PI / 2) }),
    ...noFlap, perspectivePx: r2(persp(w, h, par.perspective ?? 0.55)), perspectiveOrigin: '50% 50%', clipStage: false,
  };
}

// ── entry point ──────────────────────────────────────────────────────────────

export interface FrameResult { frame: FrameOut; swap: boolean; q: number; effectiveId: PageTurnId }

/** Compute the frame for progress p in the turn's own direction. `swap` = the incoming page plays the leaf. */
export function frameFor(o: FrameInput): FrameResult {
  const spec = getSpec(o.id);
  let id = o.id;
  // Curl on a two-page spread is a flip (the spine is the fold); documented limitation.
  if (o.spread && id === 'curl') id = 'flip';
  const par = { ...spec.params, ...getSpec(id).params, ...(o.params || {}) };
  const p = clamp01(o.p);
  const swap = spec.reversible && o.dir === -1;
  const q = swap ? 1 - p : p;
  // Physical styles: geometry follows the book's own direction. Wipe/iris: the sweep follows the travel direction.
  const mirror = swap || spec.reversible ? o.rtl : (o.dir === 1) === o.rtl;
  const oy = o.originY ?? 0.5;
  let frame: FrameOut;
  switch (id) {
    case 'curl': frame = curlFrame(q, o.w, o.h, mirror, par, oy); break;
    case 'flip': frame = flipFrame(q, o.w, o.h, mirror, par, !!o.spread); break;
    case 'slide': frame = slideFrame(q, mirror); break;
    case 'cover': frame = coverFrame(q, mirror, par); break;
    case 'dissolve': frame = dissolveFrame(q); break;
    case 'wipe': frame = wipeFrame(q, mirror, par); break;
    case 'iris': frame = irisFrame(q, o.w, o.h, mirror, par, oy); break;
    case 'zoom': frame = zoomFrame(q, par); break;
    case 'cardflip': frame = cardFlipFrame(q, o.w, o.h, mirror, par); break;
    case 'cube': frame = cubeFrame(q, o.w, o.h, mirror, par); break;
    default: frame = dissolveFrame(1);
  }
  return { frame, swap, q, effectiveId: id };
}
