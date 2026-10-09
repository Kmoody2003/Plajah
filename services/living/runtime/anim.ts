// The animation preset library: AnimSpec -> Web Animations keyframes. Pure (no DOM), so every preset is unit-tested.
//
// Rules this file enforces (see contracts.ts header):
//   * only transform / opacity / filter are animated (compositor-friendly); draw-on and type-on are "special" and run in the engine;
//   * reduced motion gets a TWIN: ambient loops and motion presets become stills, entrances/exits become opacity-only fades;
//   * nothing flashes more than 3 times a second (flicker/twinkle are low-contrast and rate-limited);
//   * seeded: the same (spec, seed) always compiles to the same keyframes.
import type { AnimKeyframe, AnimPreset, AnimSpec } from '../contracts';
import { hashString, mulberry32 } from './rng';

export interface AnimCtx {
  /** The object's box (page space) - orbit/flutter paths are given in page coordinates, so we need its centre. */
  box: { x: number; y: number; w: number; h: number };
  pageW: number;
  pageH: number;
  reduced: boolean;
  /** Fallback seed (the engine passes a hash of the object id) so objects desynchronise deterministically. */
  seed: number;
}

export type Channel = 'transform' | 'opacity' | 'filter';
export interface ChannelFrame { offset: number; value: string | number; easing?: string }
export interface Commit { dx?: number; dy?: number; scaleMul?: number; rotate?: number; opacity?: number; visible?: boolean }

export interface CompiledAnim {
  preset?: AnimPreset;
  /** Loops forever: stops when the page is left or paused. */
  ambient: boolean;
  durationMs: number;
  delayMs: number;
  iterations: number;
  direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  easing: string;
  /** Keyframes per animated property. The engine runs transform with composite 'add' so animations stack. */
  channels: Partial<Record<Channel, ChannelFrame[]>>;
  /** CSS transform-origin, when the spec asked for one. */
  origin?: string;
  /** State the object keeps once a state-changing preset (fade-out, grow, pop-in...) has played. */
  commit?: Commit;
  /** Handled by the engine, not WAAPI. */
  special?: 'draw-on' | 'type-on' | 'parallax';
  /** `easing: 'var:name'` -> the animation is scrubbed by a page variable (0..1) instead of time. */
  scrubVar?: string;
  /** Why nothing will play (reduced twin of a motion preset). */
  skipped?: 'reduced' | 'empty';
  amount: number;
}

/** One authoring-friendly frame; converted to channels below. */
interface F { at: number; x?: number; y?: number; r?: number; sx?: number; sy?: number; skew?: number; o?: number; filter?: string; ease?: string }

interface Def {
  dur: number;
  frames: F[];
  loop?: number | 'infinite';
  alt?: boolean;
  ease?: string;
  commit?: Commit;
  /** Presets that survive reduced motion as an opacity-only fade. */
  fadeTwin?: boolean;
  special?: CompiledAnim['special'];
  /** Reduced twin = nothing at all (flashing / pure motion). */
  motion?: boolean;
}

export const AMBIENT_PRESETS: AnimPreset[] = ['float', 'bob', 'sway', 'breathe', 'blink', 'twinkle', 'flicker', 'shimmer', 'glow', 'drift', 'orbit', 'flutter', 'swim', 'wave'];
/** Strict ambient list from the brief (these default to loop:'infinite'). */
export const IDLE_LOOPS: AnimPreset[] = ['breathe', 'blink', 'float', 'sway', 'twinkle', 'flicker', 'drift', 'orbit', 'flutter', 'swim', 'wave'];

export const ALL_PRESETS: AnimPreset[] = [
  'float', 'bob', 'sway', 'wiggle', 'spin', 'pulse', 'breathe', 'heartbeat', 'jelly', 'squash',
  'blink', 'twinkle', 'flicker', 'shimmer', 'glow',
  'drift', 'orbit', 'flutter', 'swim', 'wave', 'bounce', 'shake', 'rise', 'fall',
  'grow', 'shrink', 'pop-in', 'pop-out', 'fade-in', 'fade-out', 'slide-in', 'slide-out',
  'draw-on', 'type-on', 'parallax',
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (n: number) => Math.round(n * 1000) / 1000;

export function easingFor(e: AnimSpec['easing'] | undefined, fallback = 'ease-in-out'): string {
  if (!e) return fallback;
  if (e === 'spring') return 'cubic-bezier(.34,1.56,.64,1)';
  if (e === 'bounce') return 'cubic-bezier(.3,1.9,.55,.85)';
  if (e.startsWith('var:')) return 'linear';
  return e;
}

/** Closed Catmull-Rom through points (flat [x0,y0,...]) -> flat samples. */
export function sampleClosedPath(pts: number[], perSegment = 8): number[] {
  const n = Math.floor(pts.length / 2); if (n < 3) return pts.slice();
  const P = (i: number) => [pts[((i % n + n) % n) * 2], pts[((i % n + n) % n) * 2 + 1]];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t;
      for (let k = 0; k < 2; k++) out.push(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
    }
  }
  return out;
}

function def(preset: AnimPreset, a: number, spec: AnimSpec, ctx: AnimCtx, rnd: () => number): Def {
  const cx = ctx.box.x + ctx.box.w / 2, cy = ctx.box.y + ctx.box.h / 2;
  const rel = (path: number[]) => { const o: Array<[number, number]> = []; for (let i = 0; i + 1 < path.length; i += 2) o.push([path[i] - cx, path[i + 1] - cy]); return o; };
  const dir = spec.direction === 'reverse' ? -1 : 1;
  switch (preset) {
    case 'float': return { dur: 3200, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, y: 0, r: -1 * a }, { at: 1, y: -7 * a, r: 1.2 * a }] };
    case 'bob': return { dur: 1100, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, y: 0 }, { at: 1, y: -10 * a }] };
    case 'sway': return { dur: 3600, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, r: -3 * a }, { at: 1, r: 3 * a }] };
    case 'wiggle': return { dur: 620, motion: true, ease: 'ease-in-out', frames: [{ at: 0, r: 0 }, { at: .15, r: -9 * a }, { at: .35, r: 8 * a }, { at: .55, r: -6 * a }, { at: .75, r: 4 * a }, { at: 1, r: 0 }] };
    case 'spin': return { dur: 1200, motion: true, ease: 'ease-in-out', frames: [{ at: 0, r: 0 }, { at: 1, r: 360 * dir * Math.max(.25, a) }], commit: undefined };
    case 'pulse': return { dur: 700, motion: true, ease: 'ease-in-out', frames: [{ at: 0, sx: 1, sy: 1 }, { at: .5, sx: 1 + .14 * a, sy: 1 + .14 * a }, { at: 1, sx: 1, sy: 1 }] };
    case 'breathe': return { dur: 4200, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, sx: 1, sy: 1 }, { at: 1, sx: 1 + .02 * a, sy: 1 + .04 * a }] };
    case 'heartbeat': return { dur: 1100, motion: true, ease: 'ease-out', frames: [{ at: 0, sx: 1, sy: 1 }, { at: .14, sx: 1 + .16 * a, sy: 1 + .16 * a }, { at: .28, sx: 1, sy: 1 }, { at: .42, sx: 1 + .11 * a, sy: 1 + .11 * a }, { at: .7, sx: 1, sy: 1 }, { at: 1, sx: 1, sy: 1 }] };
    case 'jelly': return { dur: 760, motion: true, ease: 'ease-in-out', frames: [{ at: 0, sx: 1, sy: 1 }, { at: .22, sx: 1 + .25 * a, sy: 1 - .25 * a }, { at: .45, sx: 1 - .15 * a, sy: 1 + .15 * a }, { at: .68, sx: 1 + .08 * a, sy: 1 - .08 * a }, { at: .85, sx: 1 - .03 * a, sy: 1 + .03 * a }, { at: 1, sx: 1, sy: 1 }] };
    case 'squash': return { dur: 360, motion: true, ease: 'ease-in-out', frames: [{ at: 0, sx: 1, sy: 1 }, { at: .45, sx: 1 + .2 * a, sy: 1 - .2 * a }, { at: 1, sx: 1, sy: 1 }] };
    case 'blink': return spec.loop === 'infinite' || spec.loop === undefined
      ? { dur: 4200, loop: 'infinite', motion: true, ease: 'linear', frames: [{ at: 0, sy: 1 }, { at: .9, sy: 1 }, { at: .935, sy: .08 }, { at: .97, sy: 1 }, { at: 1, sy: 1 }] }
      : { dur: 240, motion: true, ease: 'ease-in-out', frames: [{ at: 0, sy: 1 }, { at: .5, sy: .08 }, { at: 1, sy: 1 }] };
    case 'twinkle': return { dur: 1700 + Math.round(rnd() * 900), alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, o: 1, sx: 1, sy: 1 }, { at: 1, o: 1 - .55 * Math.min(1, a), sx: 1 - .15 * a, sy: 1 - .15 * a }] };
    case 'flicker': {
      const dur = spec.durationMs ?? 2400; const steps = Math.max(4, Math.floor(dur / 360));   // <= ~2.8 changes/s: never a strobe
      const frames: F[] = [];
      for (let i = 0; i <= steps; i++) { const last = i === steps; frames.push({ at: i / steps, o: last ? 1 : round(1 - rnd() * .22 * Math.min(1.5, a)), sx: last ? 1 : round(1 - rnd() * .03 * a), sy: last ? 1 : round(1 + rnd() * .04 * a) }); }
      frames[0].o = 1; frames[0].sx = 1; frames[0].sy = 1;
      return { dur, loop: 'infinite', motion: true, ease: 'ease-in-out', frames };
    }
    case 'shimmer': return { dur: 2200, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, o: 1, skew: -1.5 * a }, { at: 1, o: 1 - .16 * a, skew: 1.5 * a }] };
    case 'glow': return { dur: 2600, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, filter: 'brightness(1)' }, { at: 1, filter: `brightness(${round(1 + .35 * a)}) saturate(${round(1 + .2 * a)})` }] };
    case 'drift': return { dur: 7000, alt: true, loop: 'infinite', motion: true, ease: 'ease-in-out', frames: [{ at: 0, x: 0, y: 0 }, { at: 1, x: 16 * a * dir, y: -5 * a }] };
    case 'orbit': {
      let pts: Array<[number, number]>;
      if (spec.path && spec.path.length >= 6) { const s = sampleClosedPath(spec.path, 8); pts = rel(s); }
      else { const R = 26 * a; pts = Array.from({ length: 24 }, (_, i) => { const t = (i / 24) * Math.PI * 2 * dir; return [Math.cos(t) * R - R, Math.sin(t) * R] as [number, number]; }); }
      const frames: F[] = pts.map((p, i) => ({ at: i / pts.length, x: round(p[0]), y: round(p[1]) }));
      frames.push({ at: 1, x: frames[0].x, y: frames[0].y });
      return { dur: 9000, loop: 'infinite', motion: true, ease: 'linear', frames };
    }
    case 'flutter': {
      const R = 16 * a; const n = 8; const frames: F[] = [];
      if (spec.path && spec.path.length >= 4) { const pts = rel(spec.path); pts.forEach((p, i) => frames.push({ at: i / Math.max(1, pts.length - 1), x: round(p[0]), y: round(p[1]), r: round((rnd() - .5) * 24 * a) })); }
      else for (let i = 0; i < n; i++) frames.push({ at: i / n, x: round((rnd() - .5) * 2 * R), y: round((rnd() - .5) * 2 * R), r: round((rnd() - .5) * 28 * a) });
      if (!(spec.path && spec.path.length >= 4)) frames.push({ at: 1, x: frames[0].x, y: frames[0].y, r: frames[0].r });
      return { dur: 5200, loop: 'infinite', motion: true, ease: 'ease-in-out', alt: !!(spec.path && spec.path.length >= 4), frames };
    }
    case 'swim': {
      if (spec.path && spec.path.length >= 4) { const pts = rel(spec.path); return { dur: 7000, alt: true, loop: 'infinite', motion: true, ease: 'ease-in-out', frames: pts.map((p, i) => ({ at: i / Math.max(1, pts.length - 1), x: round(p[0]), y: round(p[1]), r: round(Math.sin(i * 1.3) * 4 * a) })) }; }
      const n = 8; const frames: F[] = [];
      for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; frames.push({ at: i / n, x: round(Math.sin(t) * 12 * a * dir), y: round(Math.sin(t * 2) * 4 * a), r: round(Math.cos(t) * 4 * a * dir) }); }
      return { dur: 6000, loop: 'infinite', motion: true, ease: 'linear', frames };
    }
    case 'wave': return { dur: 2400, alt: true, loop: 'infinite', motion: true, frames: [{ at: 0, skew: -6 * a, y: 0 }, { at: .5, skew: 0, y: -2 * a }, { at: 1, skew: 6 * a, y: 0 }] };
    case 'bounce': return { dur: 820, motion: true, ease: 'cubic-bezier(.3,0,.4,1)', frames: [{ at: 0, y: 0, sx: 1, sy: 1 }, { at: .3, y: -26 * a, sx: 1 - .04 * a, sy: 1 + .06 * a }, { at: .55, y: 0, sx: 1 + .08 * a, sy: 1 - .08 * a }, { at: .75, y: -9 * a, sx: 1, sy: 1 }, { at: .9, y: 0, sx: 1 + .03 * a, sy: 1 - .03 * a }, { at: 1, y: 0, sx: 1, sy: 1 }] };
    case 'shake': return { dur: 480, motion: true, ease: 'linear', frames: [{ at: 0, x: 0 }, { at: .12, x: -7 * a }, { at: .28, x: 6 * a }, { at: .44, x: -5 * a }, { at: .6, x: 4 * a }, { at: .76, x: -2 * a }, { at: .9, x: 1 * a }, { at: 1, x: 0 }] };
    case 'rise': return { dur: 900, ease: 'ease-out', motion: true, frames: [{ at: 0, y: 0 }, { at: 1, y: -48 * a }], commit: { dy: -48 * a } };
    case 'fall': return { dur: 800, ease: 'cubic-bezier(.5,0,1,.6)', motion: true, frames: [{ at: 0, y: 0 }, { at: 1, y: 64 * a }], commit: { dy: 64 * a } };
    case 'grow': return { dur: 600, ease: 'ease-out', motion: true, frames: [{ at: 0, sx: 1, sy: 1 }, { at: 1, sx: 1 + .5 * a, sy: 1 + .5 * a }], commit: { scaleMul: 1 + .5 * a } };
    case 'shrink': return { dur: 600, ease: 'ease-out', motion: true, frames: [{ at: 0, sx: 1, sy: 1 }, { at: 1, sx: Math.max(.05, 1 - .4 * a), sy: Math.max(.05, 1 - .4 * a) }], commit: { scaleMul: Math.max(.05, 1 - .4 * a) } };
    case 'pop-in': return { dur: 520, ease: 'cubic-bezier(.34,1.56,.64,1)', fadeTwin: true, frames: [{ at: 0, o: 0, sx: .3, sy: .3 }, { at: .6, o: 1, sx: 1 + .08 * a, sy: 1 + .08 * a }, { at: 1, o: 1, sx: 1, sy: 1 }], commit: { opacity: 1, visible: true } };
    case 'pop-out': return { dur: 360, ease: 'ease-in', fadeTwin: true, frames: [{ at: 0, o: 1, sx: 1, sy: 1 }, { at: .35, o: 1, sx: 1 + .1 * a, sy: 1 + .1 * a }, { at: 1, o: 0, sx: .2, sy: .2 }], commit: { opacity: 0, visible: false } };
    case 'fade-in': return { dur: 700, ease: 'ease-out', fadeTwin: true, frames: [{ at: 0, o: 0 }, { at: 1, o: 1 }], commit: { opacity: 1, visible: true } };
    case 'fade-out': return { dur: 700, ease: 'ease-in', fadeTwin: true, frames: [{ at: 0, o: 1 }, { at: 1, o: 0 }], commit: { opacity: 0, visible: false } };
    case 'slide-in': return { dur: 640, ease: 'ease-out', fadeTwin: true, frames: [{ at: 0, x: -60 * a * dir, o: 0 }, { at: 1, x: 0, o: 1 }], commit: { opacity: 1, visible: true } };
    case 'slide-out': return { dur: 520, ease: 'ease-in', fadeTwin: true, frames: [{ at: 0, x: 0, o: 1 }, { at: 1, x: 60 * a * dir, o: 0 }], commit: { opacity: 0, visible: false } };
    case 'draw-on': return { dur: 1400, ease: 'ease-in-out', special: 'draw-on', frames: [], fadeTwin: true };
    case 'type-on': return { dur: 0, ease: 'linear', special: 'type-on', frames: [], fadeTwin: true };
    case 'parallax': return { dur: 0, special: 'parallax', frames: [], motion: true };
    default: return { dur: 400, frames: [] };
  }
}

function fromKeyframes(kfs: AnimKeyframe[]): F[] {
  return [...kfs].sort((p, q) => p.at - q.at).map(k => ({
    at: clamp(k.at, 0, 1), x: k.x, y: k.y, r: k.rotate,
    sx: k.scaleX ?? k.scale, sy: k.scaleY ?? k.scale, skew: k.skewX, o: k.opacity,
    filter: k.blur !== undefined || k.hue !== undefined ? `${k.blur ? `blur(${k.blur}px)` : ''} ${k.hue ? `hue-rotate(${k.hue}deg)` : ''}`.trim() || 'none' : undefined,
    ease: k.easing,
  }));
}

const tf = (f: F) => `translate(${round(f.x ?? 0)}px, ${round(f.y ?? 0)}px) rotate(${round(f.r ?? 0)}deg) scale(${round(f.sx ?? 1)}, ${round(f.sy ?? 1)}) skewX(${round(f.skew ?? 0)}deg)`;

function toChannels(frames: F[]): CompiledAnim['channels'] {
  const ch: CompiledAnim['channels'] = {};
  if (frames.some(f => f.x !== undefined || f.y !== undefined || f.r !== undefined || f.sx !== undefined || f.sy !== undefined || f.skew !== undefined)) ch.transform = frames.map(f => ({ offset: f.at, value: tf(f), ...(f.ease ? { easing: f.ease } : {}) }));
  if (frames.some(f => f.o !== undefined)) ch.opacity = frames.map(f => ({ offset: f.at, value: f.o ?? 1, ...(f.ease ? { easing: f.ease } : {}) }));
  if (frames.some(f => f.filter !== undefined)) ch.filter = frames.map(f => ({ offset: f.at, value: f.filter ?? 'none' }));
  return ch;
}

/**
 * Compile one AnimSpec for one object. Pure and deterministic.
 * Reduced motion: motion presets and ambient loops compile to `skipped:'reduced'`; entrances/exits keep an opacity-only fade
 * (with the same commit, so the page still ends in the right state).
 */
export function compileAnim(spec: AnimSpec, ctx: AnimCtx): CompiledAnim {
  const a = clamp(spec.amount ?? 1, 0, 2);
  const rnd = mulberry32((spec.seed ?? ctx.seed) >>> 0);
  let d: Def;
  if (spec.keyframes?.length) d = { dur: 600, frames: fromKeyframes(spec.keyframes), motion: true };
  else if (spec.preset) d = def(spec.preset, a, spec, ctx, rnd);
  else d = { dur: 0, frames: [] };

  const scrubVar = typeof spec.easing === 'string' && spec.easing.startsWith('var:') ? spec.easing.slice(4) : undefined;
  const loop = spec.loop ?? d.loop ?? 1;
  const ambient = loop === 'infinite';
  const durationMs = Math.max(0, spec.durationMs ?? d.dur);
  const base: CompiledAnim = {
    preset: spec.preset, ambient, durationMs, delayMs: spec.delayMs ?? 0,
    iterations: loop === 'infinite' ? Infinity : Math.max(1, Math.round(loop)),
    direction: d.alt ? (spec.direction === 'reverse' ? 'alternate-reverse' : 'alternate') : (spec.direction ?? 'normal'),
    easing: easingFor(spec.easing, d.ease ?? 'ease-in-out'),
    channels: {}, commit: d.commit, special: d.special, scrubVar, amount: a,
    origin: spec.origin ? `${round(spec.origin.x * 100)}% ${round(spec.origin.y * 100)}%` : undefined,
  };

  // Reduced twin.
  if (ctx.reduced) {
    if (d.special === 'draw-on' || d.special === 'type-on') return { ...base, durationMs: 0, iterations: 1 };      // engine applies the end state instantly
    if (d.fadeTwin && d.frames.some(f => f.o !== undefined)) {
      const fades = d.frames.filter(f => f.o !== undefined).map(f => ({ at: f.at, o: f.o }));
      return { ...base, ambient: false, iterations: 1, direction: 'normal', durationMs: Math.min(Math.max(durationMs, 200), 500), channels: toChannels(fades), origin: undefined };
    }
    return { ...base, ambient: false, iterations: 1, channels: {}, skipped: 'reduced', special: undefined };
  }

  if (d.special) return base;
  base.channels = toChannels(d.frames);
  if (!Object.keys(base.channels).length) base.skipped = 'empty';
  // Desynchronise ambient loops (deterministically) so a row of stars does not twinkle in lockstep.
  if (ambient && spec.delayMs === undefined && durationMs > 0) base.delayMs = -Math.round(rnd() * durationMs);
  return base;
}

export function isStatePreset(p?: AnimPreset): boolean {
  return !!p && ['rise', 'fall', 'grow', 'shrink', 'pop-in', 'pop-out', 'fade-in', 'fade-out', 'slide-in', 'slide-out', 'draw-on', 'type-on'].includes(p);
}
export function isEntrancePreset(p?: AnimPreset): boolean { return p === 'fade-in' || p === 'pop-in' || p === 'slide-in' || p === 'draw-on' || p === 'type-on'; }

/** Seed for an object when the spec has none: stable per id. */
export const seedForObject = (id: string) => hashString(id);
