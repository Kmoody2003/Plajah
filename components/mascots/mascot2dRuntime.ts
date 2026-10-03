/**
 * mascot2d — interactive 2D (SVG) Chora / Reello puppets. Framework-free; React wrapper in Mascot2D.tsx.
 *
 * Same contract as the 3D runtime (mascotRuntime.ts) so a surface can swap 2D ⇄ 3D:
 *   moods (loops): idle · listen · encourage · excited · think · hop
 *   reactions (one-shots): nod_yes · almost · cheer · wave  (+ 2D-only pokes: boop · giggle)
 *   energy 0–1, interchangeable props ('book' | 'camera' | null)
 * Extras: eyes/head follow the pointer, tap the head → grumpy boop, tap the belly → giggle.
 * Physics: damped springs on every fan fin (shark/dolphin-firm), tail, head and arms (follow-through),
 * and a belly squash spring driven by vertical acceleration.
 *
 * Art rules (Kith style bible): no outlines, speckled gradient skin, spike fan, grumpy default face,
 * hood with a white face opening + bandit eye patches, belly mark, fine airbrush grain.
 */

export type Who2D = 'chora' | 'reello';
export type Mood2D = 'idle' | 'listen' | 'encourage' | 'excited' | 'think' | 'hop';
export type Reaction2D = 'nod_yes' | 'almost' | 'cheer' | 'wave' | 'boop' | 'giggle';
export interface Mascot2DOptions {
  who: Who2D; mood?: Mood2D; energy?: number; prop?: 'book' | 'camera' | null;
  followPointer?: boolean; reducedMotion?: boolean;
  onPoke?: (part: 'head' | 'belly') => void;
}
export interface Mascot2D {
  el: SVGSVGElement;
  setMood(m: Mood2D): void; react(r: Reaction2D): void; setEnergy(e: number): void;
  setProp(p: 'book' | 'camera' | null): void; lookAt(clientX: number, clientY: number): void; destroy(): void;
  /** Step the simulation by `sec` without waiting for frames — deterministic capture (tests, sprite sheets, GIF export). */
  advance(sec: number, fps?: number): void;
}

// ------------------------------------------------------------------ palette (matches build_mascots.py)
const PAL = {
  chora: { hood: '#5b49aa', hoodTop: '#2a2c6a', hoodEdge: '#a81c84', face: '#eceaf1', faceShade: '#c9c5d8', chin: '#f3c09a',
    patch: '#7a66c8', body: '#5847a4', bodyLow: '#ab1b80', foot: '#b82486', hand: '#bb1f84', belly: '#c8187f', bellyRidge: '#9d0f69',
    mark: '#f39a45', mark2: '#f8b860', claw: '#f4f1f7', blush: '#b3aee4', gem: '#1c2a4c', spot: '#241d52', spotLite: '#9d90dc',
    chipDark: '#1d2850', chipLite: '#9285d3', dorsal: '#c21a83' },
  reello: { hood: '#2c3f86', hoodTop: '#15234a', hoodEdge: '#8f1f70', face: '#eeecf1', faceShade: '#cdc9d8', chin: '#f59a5e',
    patch: '#f2621c', body: '#19274c', bodyLow: '#b82467', foot: '#ea7a32', hand: '#c63068', belly: '#ef7426', bellyRidge: '#f6a04c',
    mark: '#fff4e6', mark2: '#f59a3a', claw: '#f8d2b4', blush: '#f0a0b4', gem: '#131f3f', spot: '#0c1530', spotLite: '#5a76bd',
    chipDark: '#0e1733', chipLite: '#5570b8', dorsal: '#ef772c' },
};
const FAN_O = '#ef7532', FAN_M = '#c4177f', FAN_TO = '#f9a45e', FAN_TM = '#e4509f';
const HORN_A = '#2a3c70', HORN_B = '#131b35';

// ------------------------------------------------------------------ small helpers
const NS = 'http://www.w3.org/2000/svg';
/** Drawing space: the body sits in 0..400 × 0..440; the fan and horns reach above and past it. */
export const VB = [-40, -64, 480, 510] as const;
let uid = 0;
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}
type Pt = [number, number];
/** Closed Catmull-Rom → cubic Bézier path through points (soft vinyl-toy silhouettes, no corners). */
function smooth(pts: Pt[], tension = 1): string {
  const n = pts.length; let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6 * tension, p1[1] + (p2[1] - p0[1]) / 6 * tension];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6 * tension, p2[1] - (p3[1] - p1[1]) / 6 * tension];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const TAU = Math.PI * 2;

function linGrad(defs: Element, stops: [number, string, number?][], x1 = 0, y1 = 0, x2 = 0, y2 = 1, user = false) {
  const id = `m2g${uid++}`;
  const g = el('linearGradient', { id, x1, y1, x2, y2, ...(user ? { gradientUnits: 'userSpaceOnUse' } : {}) }, defs);
  for (const [o, c, a] of stops) el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }, g);
  return `url(#${id})`;
}
function radGrad(defs: Element, stops: [number, string, number?][], cx = 0.35, cy = 0.3, r = 0.75) {
  const id = `m2g${uid++}`;
  const g = el('radialGradient', { id, cx, cy, r }, defs);
  for (const [o, c, a] of stops) el('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }, g);
  return `url(#${id})`;
}

// ------------------------------------------------------------------ pose + clips
interface Pose {
  bob: number; sq: number; lean: number; headRot: number; headDy: number; armA: number; armB: number; armInA: number; armInB: number;
  tail: number; eye: number; frown: number; grin: number; oh: number; happy: number; mad: number; brow: number; lap: number; lookUp: number;
}
const REST: Pose = { bob: 0, sq: 1, lean: 0, headRot: 0, headDy: 0, armA: 0, armB: 0, armInA: 0, armInB: 0, tail: 0, eye: 1,
  frown: 1, grin: 0, oh: 0, happy: 0, mad: 0, brow: 0, lap: 0, lookUp: 0 };
const FACE = {
  grump: { frown: 1, grin: 0, oh: 0, happy: 0, mad: 0, brow: 0 },
  attent: { frown: 1, grin: 0, oh: 0, happy: 0, mad: 0, brow: 0.5 },
  grin: { frown: 0, grin: 1, oh: 0, happy: 0, mad: 0, brow: 1 },
  happy: { frown: 0, grin: 1, oh: 0, happy: 1, mad: 0, brow: 1 },
  oh: { frown: 0, grin: 0, oh: 1, happy: 0, mad: 0, brow: 0.8 },
  mad: { frown: 1, grin: 0, oh: 0, happy: 0, mad: 1, brow: -1 },
};
type ClipFn = (t: number) => Partial<Pose>;
interface Clip { dur: number; loop: boolean; hold: [number, number]; fn: ClipFn }
const damped = (t: number, f: number, k: number) => Math.exp(-k * t) * Math.sin(TAU * f * t);

const CLIPS: Record<string, Clip> = {
  idle: { dur: 4, loop: true, hold: [1, 1], fn: t => { const b = Math.sin(TAU * t / 4);
    return { sq: 1 + 0.012 * b, headDy: 1.4 * Math.sin(TAU * t / 4 - 0.9), headRot: 1.6 * Math.sin(TAU * t / 5 + 0.4), tail: 7 * Math.sin(TAU * t / 3), armA: 2 * b, armB: 2 * b, ...FACE.grump }; } },
  listen: { dur: 4, loop: true, hold: [1, 1], fn: t => { const nod = Math.max(0, Math.sin(TAU * t / 2)) ** 2;
    return { lean: 3, headRot: 9 + 2 * Math.sin(TAU * t / 4), headDy: 4 * nod, tail: 5 * Math.sin(TAU * t / 3), eye: 1.06, ...FACE.attent }; } },
  encourage: { dur: 1.6, loop: true, hold: [0, 0], fn: t => { const p = (0.5 - 0.5 * Math.cos(TAU * t / 0.8)) ** 1.4, pl = (0.5 - 0.5 * Math.cos(TAU * t / 0.8 - 0.5)) ** 1.4;
    return { lean: 2 + 3 * pl, headDy: 6 * pl - 2, bob: -4 * p, armA: 25 + 85 * p, armB: 25 + 85 * p, tail: 14 * Math.sin(TAU * t / 0.8), eye: 1.1, lap: 1, sq: 1 - 0.02 * pl, ...FACE.grin }; } },
  excited: { dur: 1.2, loop: true, hold: [0, 0], fn: t => { const up = Math.abs(Math.sin(TAU * t / 1.2)), c = 1 - up;
    return { bob: -16 * up, sq: 1 - 0.07 * c ** 3 + 0.03 * up, headDy: 3 * c, armA: 40 + 40 * up, armB: 40 + 40 * up, tail: 20 * Math.sin(TAU * t / 0.4), lap: 1, ...FACE.happy }; } },
  think: { dur: 4, loop: true, hold: [1, 0], fn: t => ({ headRot: -11 - 3 * Math.sin(TAU * t / 4), headDy: -2, armB: 25, armInB: 55, tail: 5 * Math.sin(TAU * t / 3), lookUp: 1, ...FACE.oh }) },
  hop: { dur: 1, loop: true, hold: [0, 0], fn: t => { const h = Math.sin(Math.PI * t), c = Math.max(0, 1 - h * 3);
    return { bob: -42 * h, sq: 1 + 0.06 * h - 0.1 * c * c, lean: 3 * h, headDy: 4 * c - 3 * h, armA: 30 + 35 * h, armB: 30 + 35 * h, tail: 16 * Math.sin(TAU * t), lap: 1, ...FACE.grump }; } },
  nod_yes: { dur: 0.8, loop: false, hold: [1, 1], fn: t => ({ headDy: Math.max(0, Math.sin(TAU * t / 0.4)) * Math.exp(-2 * t) * 12, tail: 12 * Math.sin(TAU * t / 0.4), ...(t > 0.04 && t < 0.7 ? FACE.grin : FACE.grump) }) },
  almost: { dur: 1.8, loop: false, hold: [0.6, 0.6], fn: t => { const u = t / 1.8, fold = ease(seg(u, 0, 0.15)) * (1 - ease(seg(u, 0.7, 1)));
    return { headRot: damped(seg(u, 0.08, 0.8), 2.2, 3.2) * 14, headDy: 3 * fold, armInA: 35 * fold, armInB: 35 * fold, eye: 1 - 0.2 * fold, tail: 10 * Math.sin(TAU * t), ...(u < 0.72 ? FACE.mad : FACE.grump) }; } },
  cheer: { dur: 2, loop: false, hold: [0, 0], fn: t => { const u = t / 2; let bob = 0, sq = 1, arms = 0, face = FACE.happy as Partial<Pose>;
    if (u < 0.12) { const a = ease(seg(u, 0, 0.12)); bob = 6 * a; sq = 1 - 0.08 * a; arms = 20 * a; face = FACE.oh; }
    else if (u < 0.5) { const a = seg(u, 0.12, 0.5), h = Math.sin(Math.PI * a); bob = -78 * h; sq = 1 + 0.07 * (1 - a) * h; arms = 20 + 130 * Math.min(1, a * 2.2); }
    else { const a = seg(u, 0.5, 1); bob = -10 * damped(a, 2.2, 5) + 5 * Math.exp(-9 * a); sq = 1 - 0.1 * Math.exp(-8 * a) * Math.cos(TAU * 2.2 * a); arms = 150 * (1 - ease(seg(a, 0.35, 1))); if (a > 0.55) face = FACE.grin; }
    return { bob, sq, armA: arms, armB: arms, tail: 24 * Math.sin(TAU * t * 1.5), lap: Math.min(1, u * 6) * (1 - ease(seg(u, 0.85, 1))), ...face }; } },
  wave: { dur: 2, loop: false, hold: [1, 0], fn: t => { const u = t / 2, up = ease(seg(u, 0, 0.15)) * (1 - ease(seg(u, 0.82, 1))), w = Math.sin(TAU * 3 * seg(u, 0.15, 0.82));
    return { headRot: -7 * up, armB: up * (140 + 22 * w), tail: 8 * Math.sin(TAU * t / 2), ...(up > 0.3 ? FACE.grin : FACE.grump) }; } },
  boop: { dur: 0.9, loop: false, hold: [1, 1], fn: t => { const u = t / 0.9, k = Math.exp(-5 * u);
    return { sq: 1 - 0.1 * k * Math.cos(TAU * 2.5 * u), headDy: 6 * k, headRot: 6 * damped(u, 2, 4), eye: 1 - 0.3 * k, ...(u < 0.75 ? FACE.mad : FACE.grump) }; } },
  giggle: { dur: 1.1, loop: false, hold: [0, 0], fn: t => { const u = t / 1.1, j = Math.sin(TAU * 7 * t) * (1 - u);
    return { bob: -3 * Math.abs(j), sq: 1 + 0.02 * j, headRot: 4 * j, armInA: 40 * (1 - u), armInB: 40 * (1 - u), tail: 18 * j, ...(u < 0.85 ? FACE.happy : FACE.grin) }; } },
};

// ------------------------------------------------------------------ springs
class Spring { x = 0; v = 0; constructor(public k: number, public c: number, public lim = Infinity) {}
  step(target: number, force: number, dt: number) { const a = -this.k * (this.x - target) - this.c * this.v + force; this.v += a * dt; this.x = clamp(this.x + this.v * dt, target - this.lim, target + this.lim); if (Math.abs(this.x - target) >= this.lim) this.v *= 0.5; return this.x; } }

// ------------------------------------------------------------------ build
export function createMascot2D(container: HTMLElement, opts: Mascot2DOptions): Mascot2D {
  const P = PAL[opts.who];
  const reduced = opts.reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const svg = el('svg', { viewBox: `${VB.join(' ')}`, width: '100%', height: '100%', role: 'img', 'aria-label': opts.who === 'chora' ? 'Chora' : 'Reello' });
  (svg.style as any).overflow = 'visible'; svg.style.touchAction = 'manipulation'; svg.style.cursor = 'pointer';
  const defs = el('defs', {}, svg);
  const R = rng(opts.who === 'chora' ? 7 : 11);

  // airbrush grain: fractal noise multiplied into each skin group (moves with the part, never "boils")
  const grainId = `m2grain${uid++}`;
  const f = el('filter', { id: grainId, x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.85', numOctaves: 2, seed: opts.who === 'chora' ? 3 : 8, result: 'n' }, f);
  el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0.9 0 0 0 0', result: 'g' }, f);
  el('feComposite', { in: 'SourceGraphic', in2: 'g', operator: 'arithmetic', k1: 0.55, k2: 0.72, k3: 0, k4: 0, result: 'm' }, f);
  el('feComposite', { in: 'm', in2: 'SourceGraphic', operator: 'in' }, f);
  const GRAIN = `url(#${grainId})`;
  const clip = (d: string) => { const id = `m2c${uid++}`; el('path', { d }, el('clipPath', { id }, defs)); return `url(#${id})`; };
  const spots = (parent: Element, box: [number, number, number, number], n: number, dark: string, lite: string, liteShare = 0.25, size = 1) => {
    for (let i = 0; i < n; i++) {
      const x = lerp(box[0], box[2], R()), y = lerp(box[1], box[3], R()), isLite = R() < liteShare;
      const rx = (isLite ? 3 + R() * 4 : 4 + R() * 7) * size, ry = rx * (0.55 + R() * 0.4);
      el('ellipse', { cx: x, cy: y, rx, ry, transform: `rotate(${(R() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})`, fill: isLite ? lite : dark, opacity: isLite ? 0.55 : 0.8 }, parent);
    }
  };
  const volume = (parent: Element, d: string) => {   // soft vinyl-toy shading: top-left light, bottom shade
    el('path', { d, fill: radGrad(defs, [[0, '#fff', 0.28], [0.55, '#fff', 0], [1, '#000', 0]], 0.3, 0.2, 0.9) }, parent);
    el('path', { d, fill: radGrad(defs, [[0.55, '#000', 0], [1, '#10002a', 0.35]], 0.45, 0.35, 0.75) }, parent);
  };

  const root = el('g', {}, svg);
  const shadow = el('ellipse', { cx: 200, cy: 424, rx: 120, ry: 12, fill: '#000', opacity: 0.25 }, root);
  const bodyRig = el('g', {}, root);             // bob / squash / lean pivot at the feet

  // ---- tail (behind)
  const tailG = el('g', {}, bodyRig);
  const tailD = smooth([[258, 372], [320, 368], [362, 380], [388, 396], [360, 402], [318, 410], [262, 418]]);
  const tailInner = el('g', { filter: GRAIN }, tailG);
  el('path', { d: tailD, fill: linGrad(defs, [[0, P.body], [1, P.bodyLow]], 0, 0, 1, 0) }, tailInner);
  const tc = el('g', { 'clip-path': clip(tailD) }, tailInner); spots(tc, [260, 368, 380, 412], 10, P.spot, P.spotLite, 0.2, 0.8);
  for (const [x, y, s] of [[298, 370, 1], [334, 374, 0.8], [362, 384, 0.6]] as const)
    el('path', { d: `M${x - 13 * s},${y + 4} Q${x - 4 * s},${y - 30 * s} ${x + 6 * s},${y - 34 * s} Q${x + 8 * s},${y - 14 * s} ${x + 14 * s},${y + 4} Z`, fill: P.dorsal }, tailG);

  // ---- the ruff (behind the head; follows the head transform): chunky faceted plates hugging the head.
  // Magenta over the top, orange on the upper sides, magenta again low by the cheeks — as in the videos.
  const fanG = el('g', {}, bodyRig);
  const fins: { g: SVGGElement; ang: number; base: number; spring: Spring; side: number }[] = [];
  const ruffR = (a: number) => { const r = a * Math.PI / 180; return 1 / Math.sqrt((Math.sin(r) / 142) ** 2 + (Math.cos(r) / 112) ** 2); };
  const addPlate = (ang: number, L: number, W: number, back: boolean) => {
    const aa = Math.abs(ang);
    const o = back ? 0 : ease(seg(aa, 14, 40)) * (1 - ease(seg(aa, 96, 124))) * (ang < 0 ? 1 : 0.88);
    const base = back ? FAN_M : o > 0.5 ? FAN_O : FAN_M, tip = back ? FAN_TM : o > 0.5 ? FAN_TO : FAN_TM;
    const shade = back ? '#6e0d4d' : o > 0.5 ? '#c24a1c' : '#8a0f5c';
    const g = el('g', {}, fanG);
    el('path', { d: `M${-W / 2},10 L${-W * 0.06},${-L + 4} Q0,${-L - 2} ${W * 0.06},${-L + 4} L${W / 2},10 Z`, fill: linGrad(defs, [[0, shade], [0.5, base], [1, tip]], 0, 10, 0, -L, true) }, g);
    // a lit facet down one side gives the faceted-plate read without outlines
    el('path', { d: `M${W * 0.06},${-L + 4} L${W / 2},10 L${W * 0.04},10 Z`, fill: '#fff', opacity: 0.16 }, g);
    el('path', { d: `M${-W / 2},10 L${-W * 0.06},${-L + 4} L${-W * 0.16},10 Z`, fill: '#000', opacity: 0.12 }, g);
    fins.push({ g, ang, base: ruffR(ang) - (back ? 46 : 30), spring: new Spring(260, 16, 16), side: Math.sin(ang * Math.PI / 180) });
  };
  for (const a of [-114, -70, -26, 26, 70, 114]) addPlate(a, 86, 124, true);
  for (const [a, L, W] of [[-132, 70, 112], [-104, 94, 128], [-76, 104, 134], [-48, 96, 128], [-18, 84, 120], [18, 86, 120], [48, 98, 128], [76, 106, 134], [104, 94, 128], [132, 68, 110]] as const) addPlate(a, L, W, false);

  // ---- body
  const body = el('g', {}, bodyRig);
  const bodyD = smooth([[132, 270], [110, 318], [98, 368], [106, 404], [150, 420], [250, 420], [294, 404], [302, 368], [290, 318], [268, 270], [234, 254], [166, 254]]);
  const bodyInner = el('g', { filter: GRAIN }, body);
  el('path', { d: bodyD, fill: linGrad(defs, [[0, P.body], [0.55, P.body], [1, P.bodyLow]]) }, bodyInner);
  const bc = el('g', { 'clip-path': clip(bodyD) }, bodyInner); spots(bc, [98, 260, 302, 420], 26, P.spot, P.spotLite, 0.25);
  // belly plate
  const bellyD = smooth([[200, 268], [252, 290], [266, 340], [252, 392], [200, 414], [148, 392], [134, 340], [148, 290]]);
  el('path', { d: bellyD, fill: opts.who === 'chora' ? P.belly : radGrad(defs, [[0, P.bellyRidge], [1, P.belly]], 0.5, 0.45, 0.6) }, bodyInner);
  if (opts.who === 'chora') {
    const rc = el('g', { 'clip-path': clip(bellyD) }, bodyInner);
    for (let y = 282; y < 414; y += 13) el('path', { d: `M130,${y} Q200,${y + 6} 270,${y}`, stroke: P.bellyRidge, 'stroke-width': 3, fill: 'none', opacity: 0.55 }, rc);
    const note = el('g', { fill: P.mark }, bodyInner);
    el('ellipse', { cx: 184, cy: 364, rx: 13, ry: 10, transform: 'rotate(-20 184 364)' }, note);
    el('ellipse', { cx: 220, cy: 356, rx: 13, ry: 10, transform: 'rotate(-20 220 356)' }, note);
    el('path', { d: 'M193,364 L193,318 L230,308 L230,356 L224,356 L224,322 L199,329 L199,364 Z', fill: P.mark2 }, note);
  } else {
    el('path', { d: 'M200,402 C178,398 170,380 178,364 C182,372 188,372 188,364 C186,350 194,342 200,332 C204,346 214,350 214,364 C216,372 222,372 222,362 C232,380 224,398 200,402 Z', fill: P.mark }, bodyInner);
    el('path', { d: 'M200,396 C190,394 186,384 190,374 C194,380 198,378 198,370 C204,378 210,382 210,388 C210,394 206,396 200,396 Z', fill: P.mark2 }, bodyInner);
  }
  volume(bodyInner, bodyD);
  // thighs + feet + claws
  for (const s of [-1, 1]) {
    const cx = 200 + s * 66;
    const legD = smooth([[cx - 44, 386], [cx - 36, 356], [cx, 346], [cx + 36, 356], [cx + 46, 388], [cx + 30, 420], [cx - 30, 420]]);
    const lg = el('g', { filter: GRAIN }, body);
    el('path', { d: legD, fill: linGrad(defs, [[0, P.body], [1, P.foot]]) }, lg);
    spots(el('g', { 'clip-path': clip(legD) }, lg), [cx - 44, 350, cx + 44, 420], 7, P.spot, P.spotLite, 0.3, 0.8);
    volume(lg, legD);
    for (const dx of [-20, 0, 20]) el('ellipse', { cx: cx + dx, cy: 418, rx: 8, ry: 6, fill: P.claw }, body);
  }

  // ---- prop (between body and arms so the hands sit on top)
  const propG = el('g', {}, bodyRig);
  const buildProp = (name: 'book' | 'camera' | null) => {
    propG.innerHTML = '';
    if (name === 'book') {
      el('path', { d: 'M200,300 L152,286 L150,366 L200,378 Z', fill: '#16263f' }, propG);
      el('path', { d: 'M200,300 L248,286 L250,366 L200,378 Z', fill: '#1b2d4a' }, propG);
      el('path', { d: 'M196,300 L204,300 L204,378 L196,378 Z', fill: '#0e1a2d' }, propG);
      el('path', { d: 'M170,344 m0,0 l0,-26 l14,-4 l0,5 l-10,3 l0,24 a6,5 0 1,1 -4,-2 z', fill: '#d4147c' }, propG);
      el('path', { d: 'M226,340 m0,0 l0,-26 l14,4 l0,5 l-10,-3 l0,22 a6,5 0 1,1 -4,-2 z', fill: '#f28b3c' }, propG);
    } else if (name === 'camera') {
      el('rect', { x: 150, y: 312, width: 100, height: 60, rx: 10, fill: '#2b2d34' }, propG);
      el('rect', { x: 168, y: 302, width: 30, height: 14, rx: 4, fill: '#23252b' }, propG);
      el('circle', { cx: 200, cy: 342, r: 25, fill: '#1b1c21' }, propG);
      el('circle', { cx: 200, cy: 342, r: 17, fill: radGrad(defs, [[0, '#3fb6e0'], [0.35, '#12304a'], [1, '#0b1624']], 0.35, 0.3, 0.8) }, propG);
      el('circle', { cx: 193, cy: 335, r: 4, fill: '#fff', opacity: 0.7 }, propG);
      el('rect', { x: 226, y: 306, width: 14, height: 6, rx: 2, fill: '#8a8d98' }, propG);
    }
  };
  let propName: 'book' | 'camera' | null = opts.prop ?? null; buildProp(propName);

  // ---- arms (pivot at the shoulder)
  const arms: { g: SVGGElement; sx: number; sy: number; s: number; spring: Spring; springIn: Spring }[] = [];
  for (const s of [-1, 1]) {
    const sx = 200 + s * 74, sy = 282;
    const g = el('g', {}, bodyRig);
    const inner = el('g', { filter: GRAIN }, g);
    const armD = smooth([[sx - 20, sy - 6], [sx + 18, sy - 6], [sx + 20 - s * 6, sy + 44], [sx - s * 4, sy + 66], [sx - 22 - s * 6, sy + 44]]);
    el('path', { d: armD, fill: linGrad(defs, [[0, P.body], [0.6, P.hand], [1, P.hand]]) }, inner);
    spots(el('g', { 'clip-path': clip(armD) }, inner), [sx - 22, sy - 6, sx + 22, sy + 40], 5, P.spot, P.spotLite, 0.3, 0.7);
    volume(inner, armD);
    for (const dx of [-10, 0, 10]) el('ellipse', { cx: sx - s * 4 + dx, cy: sy + 66, rx: 5, ry: 6.5, fill: P.claw }, g);
    arms.push({ g, sx, sy, s, spring: new Spring(220, 20, 60), springIn: new Spring(220, 20, 60) });
  }

  // ---- head: wide mochi with big jowls; a cap whose chevron points down to a faceted navy gem; the white
  // face wraps the whole front + cheeks; angled goggles with the eyes low and inside; thick tapered brows.
  const headG = el('g', {}, bodyRig);
  const horn = (b1: Pt, b2: Pt, tip: Pt, bend: number) => {
    const mx = (b1[0] + b2[0]) / 2, my = (b1[1] + b2[1]) / 2;
    el('path', { d: `M${b1[0]},${b1[1]} Q${(b1[0] + tip[0]) / 2 - bend},${(b1[1] + tip[1]) / 2} ${tip[0]},${tip[1]} Q${(b2[0] + tip[0]) / 2 + bend * 0.4},${(b2[1] + tip[1]) / 2} ${b2[0]},${b2[1]} Z`,
      fill: linGrad(defs, [[0, HORN_A], [1, HORN_B]], mx, my, tip[0], tip[1], true) }, headG);
    el('path', { d: `M${mx},${my} L${tip[0]},${tip[1]} Q${(b2[0] + tip[0]) / 2 + bend * 0.4},${(b2[1] + tip[1]) / 2} ${b2[0]},${b2[1]} Z`, fill: '#9fb2e6', opacity: 0.14 }, headG);
  };
  horn([180, 66], [220, 66], [201, 8], 4);                       // middle horn, set back
  horn([88, 120], [172, 68], [86, -18], 12);                     // cat-ear horns at the top corners
  horn([228, 68], [312, 120], [314, -18], -12);
  const headD = smooth([[200, 58], [258, 61], [306, 80], [330, 118], [338, 168], [343, 212], [327, 252], [286, 275], [200, 286], [114, 275], [73, 252], [57, 212], [62, 168], [70, 118], [94, 80], [142, 61]]);
  const headInner = el('g', { filter: GRAIN }, headG);
  el('path', { d: headD, fill: linGrad(defs, [[0, P.face], [0.62, P.face], [1, P.chin]]) }, headInner);
  el('path', { d: headD, fill: radGrad(defs, [[0.55, P.faceShade, 0], [1, P.faceShade, 0.95]], 0.5, 0.42, 0.62) }, headInner);
  // cap: everything above the chevron (clipped to the head)
  const capC = el('g', { 'clip-path': clip(headD) }, headInner);
  const capD = 'M10,82 L10,-20 L390,-20 L390,82 L200,198 Z';
  el('path', { d: capD, fill: linGrad(defs, [[0, P.hoodTop], [0.55, P.hood], [1, P.hood]], 0, 40, 0, 200, true) }, capC);
  el('path', { d: capD, fill: radGrad(defs, [[0.6, P.hoodEdge, 0], [1, P.hoodEdge, 0.85]], 0.5, 0.25, 0.7) }, capC);
  spots(el('g', { 'clip-path': clip(capD) }, capC), [60, 50, 340, 150], 7, P.spot, P.spotLite, 0.3, 0.7);
  // goggles: top edge parallel just under the chevron, rounded outside and below
  for (const s of [-1, 1]) {
    const m = (x: number) => 200 + s * (x - 200);
    el('path', { d: smooth([[m(191), 203], [m(150), 177], [m(104), 148], [m(86), 172], [m(88), 208], [m(108), 238], [m(146), 248], [m(178), 241], [m(191), 224]], 0.85), fill: P.patch }, headInner);
  }
  volume(headInner, headD);
  // crown chips + mohawk tufts
  for (const [x, y, rot, lite] of [[150, 100, 28, 0], [178, 84, 12, 0], [222, 86, -12, 0], [252, 102, -28, 1], [128, 124, 34, 1], [272, 124, -34, 0], [168, 128, 16, 0], [234, 130, -16, 1], [200, 112, 0, 0]] as const) {
    el('path', { d: `M${x},${y + 12} L${x + 8},${y} L${x + 1},${y - 10} L${x - 7},${y - 2} Z`, fill: lite ? P.chipLite : P.chipDark, transform: `rotate(${rot} ${x} ${y})` }, headG);
  }
  for (let i = 0; i < 6; i++) { const x = 172 + i * 11, h = 12 + (i % 2) * 6; el('path', { d: `M${x - 5},62 L${x + 1},${62 - h} L${x + 6},62 Z`, fill: HORN_B }, headG); }
  // forehead gem: a faceted pyramid at the chevron tip
  el('path', { d: 'M178,184 L222,184 L200,192 Z', fill: '#2d3f73' }, headG);
  el('path', { d: 'M178,184 L200,192 L200,218 Z', fill: P.gem }, headG);
  el('path', { d: 'M222,184 L200,192 L200,218 Z', fill: '#34477d' }, headG);
  for (const s of [-1, 1]) el('ellipse', { cx: 200 + s * 76, cy: 250, rx: 15, ry: 8, fill: P.blush, opacity: 0.85 }, headG);
  // eyes (open) + happy arcs, brows, nose, mouths
  const eyes: { g: SVGGElement; pupil: SVGGElement; happy: SVGPathElement; cx: number }[] = [];
  for (const s of [-1, 1]) {
    const cx = 200 + s * 46, cy = 212;
    const g = el('g', {}, headG), pupil = el('g', {}, g);
    el('ellipse', { cx, cy, rx: 19, ry: 24, fill: '#0b0a10', transform: `rotate(${s * 4} ${cx} ${cy})` }, pupil);
    const happy = el('path', { d: `M${cx - 20},${cy + 6} Q${cx},${cy - 16} ${cx + 20},${cy + 6}`, stroke: '#0b0a10', 'stroke-width': 7.5, 'stroke-linecap': 'round', fill: 'none', opacity: 0 }, headG);
    eyes.push({ g, pupil, happy, cx });
  }
  const brows: SVGPathElement[] = [];
  for (const s of [-1, 1]) {
    // tapered stroke along the goggle's top edge, rising steeply outward (the angry look)
    const pts: Pt[] = [], L: Pt[] = [], Rr: Pt[] = [], W = [6, 12, 16, 17, 16, 14, 11, 8, 4];
    for (let k = 0; k < 9; k++) { const t = k / 8, x = 191 - 92 * t, y = 202 - 58 * t - 5 * Math.sin(Math.PI * t); pts.push([200 + s * (x - 200), y]); }
    pts.forEach((p, k) => { const a = pts[Math.max(k - 1, 0)], b = pts[Math.min(k + 1, 8)], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, hw = W[k] / 2;
      L.push([p[0] + nx * hw, p[1] + ny * hw]); Rr.push([p[0] - nx * hw, p[1] - ny * hw]); });
    brows.push(el('path', { d: 'M' + [...L, ...Rr.reverse()].map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L') + ' Z', fill: '#0b0a10' }, headG));
  }
  el('path', { d: 'M190,240 L210,240 Q208,248 200,251 Q192,248 190,240 Z', fill: '#0b0a10' }, headG);
  el('path', { d: 'M200,251 L200,257', stroke: '#0b0a10', 'stroke-width': 3, 'stroke-linecap': 'round' }, headG);
  const frown = el('path', { d: 'M181,268 Q190,258 200,258 Q211,258 221,268', stroke: '#0b0a10', 'stroke-width': 4.5, 'stroke-linecap': 'round', fill: 'none' }, headG);
  const grin = el('g', { opacity: 0 }, headG);
  el('path', { d: 'M172,258 L228,258 Q226,290 200,292 Q174,290 172,258 Z', fill: '#4a0f22' }, grin);
  el('ellipse', { cx: 200, cy: 281, rx: 14, ry: 7, fill: '#ef6f8f' }, grin);
  el('path', { d: 'M178,258 L188,258 L183,268 Z', fill: '#fff' }, grin);
  el('path', { d: 'M212,258 L222,258 L217,268 Z', fill: '#fff' }, grin);
  const oh = el('ellipse', { cx: 200, cy: 264, rx: 9, ry: 11, fill: '#4a0f22', opacity: 0 }, headG);

  // arms render in front of the head so raised hands (cheer, wave, fist pumps) sit beside the cheeks, not behind them
  for (const a of arms) bodyRig.appendChild(a.g);
  container.appendChild(svg);

  // ------------------------------------------------------------------ runtime state
  let base: string = opts.mood ?? 'idle', baseT = 0, one: string | null = null, oneT = 0, fadeW = 0;
  let prevBase: string | null = null, prevBaseT = 0, baseFade = 1;
  let energy = clamp(opts.energy ?? 0, 0, 1);
  let look = { x: 0, y: 0 }, lookS = { x: 0, y: 0 };
  let blinkT = 2 + Math.random() * 3, blink = 0;
  const hold = [1, 1];
  const headSpring = new Spring(300, 24, 25), headDySpring = new Spring(320, 22, 20), tailSpring = new Spring(140, 9, 30), squashSpring = new Spring(420, 16, 0.2);
  let lastHead = 0, lastVy = 0, lastBob = 0;

  const sample = (name: string, t: number): Pose => ({ ...REST, ...CLIPS[name].fn(t) });
  const mixPose = (a: Pose, b: Pose, w: number): Pose => { const o = { ...a }; for (const k in a) (o as any)[k] = lerp((a as any)[k], (b as any)[k], w); return o; };

  let last = performance.now(), raf = 0, alive = true;
  let manual = false;
  const frame = (now: number) => {
    if (!alive) return;
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (reduced) dt *= 0.6;
    baseT += dt; if (prevBase) prevBaseT += dt;
    baseFade = Math.min(1, baseFade + dt / 0.3);
    let pose = sample(base, baseT % CLIPS[base].dur);
    if (prevBase && baseFade < 1) pose = mixPose(sample(prevBase, prevBaseT % CLIPS[prevBase].dur), pose, ease(baseFade));
    if (energy > 0 && base !== 'excited') {
      const ex = sample('excited', baseT % CLIPS.excited.dur);
      pose.bob += ex.bob * energy * 0.8; pose.sq = lerp(pose.sq, ex.sq, energy * 0.6); pose.tail += ex.tail * energy * 0.6;
    }
    let holdTarget = CLIPS[base].hold;
    if (one) {
      oneT += dt; const c = CLIPS[one];
      if (oneT >= c.dur) { one = null; } else {
        fadeW = Math.min(1, oneT / 0.15) * Math.min(1, (c.dur - oneT) / 0.25);
        pose = mixPose(pose, sample(one, oneT), fadeW); holdTarget = c.hold;
      }
    }
    // blink scheduler (every clip)
    blinkT -= dt; if (blinkT < 0) { blink = 1; blinkT = 2.5 + Math.random() * 3.5; }
    blink = Math.max(0, blink - dt * 9);
    const eyeOpen = pose.eye * (1 - Math.sin(Math.min(1, blink) * Math.PI) * 0.92);

    // follow-through springs
    const hr = headSpring.step(pose.headRot + lookS.x * 5, 0, dt);
    const hdy = headDySpring.step(pose.headDy, 0, dt);
    const headVel = (hr - lastHead) / Math.max(dt, 1e-3); lastHead = hr;
    const vy = (pose.bob - lastBob) / Math.max(dt, 1e-3); const acc = (vy - lastVy) / Math.max(dt, 1e-3); lastBob = pose.bob; lastVy = vy;
    const sqs = squashSpring.step(pose.sq, clamp(acc, -8000, 8000) * 0.00004, dt);
    const tl = tailSpring.step(pose.tail, -headVel * 0.4, dt);
    lookS.x += (look.x - lookS.x) * Math.min(1, dt * 8); lookS.y += (look.y - lookS.y) * Math.min(1, dt * 8);
    hold[0] += (holdTarget[0] - hold[0]) * Math.min(1, dt * 8); hold[1] += (holdTarget[1] - hold[1]) * Math.min(1, dt * 8);

    // ---- apply
    shadow.setAttribute('rx', String(120 * (1 + pose.bob / 300))); shadow.setAttribute('opacity', String(0.25 * (1 + pose.bob / 160)));
    bodyRig.setAttribute('transform', `translate(0 ${pose.bob.toFixed(2)}) translate(200 420) rotate(${pose.lean.toFixed(2)}) scale(${(1 / Math.sqrt(sqs)).toFixed(4)} ${sqs.toFixed(4)}) translate(-200 -420)`);
    const headT = `translate(${(lookS.x * 3).toFixed(2)} ${(hdy + lookS.y * 2).toFixed(2)}) rotate(${hr.toFixed(2)} 200 262)`;
    headG.setAttribute('transform', headT); fanG.setAttribute('transform', headT);
    tailG.setAttribute('transform', `rotate(${(tl * 0.6).toFixed(2)} 262 395)`);
    for (const fin of fins) {
      const force = -headVel * 0.9 * 60 / 60 + acc * 0.012 * fin.side;
      const off = fin.spring.step(0, force, dt);
      fin.g.setAttribute('transform', `translate(200 166) rotate(${(fin.ang + off).toFixed(2)}) translate(0 ${-fin.base})`);
    }
    arms.forEach((a, i) => {
      const raise = i === 0 ? pose.armA : pose.armB, tuck = i === 0 ? pose.armInA : pose.armInB;
      const holdIn = propName ? hold[i] * 14 : 0;
      const r = a.spring.step(raise, 0, dt), t2 = a.springIn.step(tuck + holdIn, 0, dt);
      // left arm (s=-1) raises clockwise, right arm counter-clockwise; tuck swings the hand toward the belly
      const ang = -a.s * r + a.s * t2 * 0.6;
      a.g.setAttribute('transform', `rotate(${ang.toFixed(2)} ${a.sx} ${a.sy})`);
    });
    const lap = pose.lap * (propName ? 1 : 0);
    propG.setAttribute('transform', `translate(0 ${(lap * 44).toFixed(1)}) rotate(${(-lap * 6).toFixed(1)} 200 340)`);
    // face
    for (const e of eyes) {
      e.pupil.setAttribute('transform', `translate(${(lookS.x * 4).toFixed(2)} ${(lookS.y * 3 - pose.lookUp * 5).toFixed(2)}) translate(${e.cx} 212) scale(1 ${(eyeOpen * (1 - pose.happy)).toFixed(3)}) translate(${-e.cx} -212)`);
      e.happy.setAttribute('opacity', String(pose.happy));
    }
    brows.forEach((b, i) => { const s = i === 0 ? -1 : 1; b.setAttribute('transform', `translate(0 ${(-pose.brow * 6).toFixed(1)}) rotate(${(s * (pose.brow * 7 - pose.mad * 7)).toFixed(1)} ${200 + s * 54} 174)`); });
    frown.setAttribute('opacity', String(clamp(pose.frown, 0, 1))); grin.setAttribute('opacity', String(clamp(pose.grin, 0, 1))); oh.setAttribute('opacity', String(clamp(pose.oh, 0, 1)));
    if (!manual) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ------------------------------------------------------------------ interaction
  const toLocal = (cx: number, cy: number) => { const r = svg.getBoundingClientRect(); return { x: VB[0] + (cx - r.left) / r.width * VB[2], y: VB[1] + (cy - r.top) / r.height * VB[3] }; };
  const lookAt = (cx: number, cy: number) => { const p = toLocal(cx, cy); look = { x: clamp((p.x - 200) / 260, -1, 1), y: clamp((p.y - 210) / 260, -1, 1) }; };
  const onMove = (e: PointerEvent) => lookAt(e.clientX, e.clientY);
  if (opts.followPointer !== false) window.addEventListener('pointermove', onMove, { passive: true });
  const onDown = (e: PointerEvent) => {
    const p = toLocal(e.clientX, e.clientY);
    const part = p.y < 280 ? 'head' : 'belly';
    api.react(part === 'head' ? 'boop' : 'giggle'); opts.onPoke?.(part);
  };
  svg.addEventListener('pointerdown', onDown);

  const api: Mascot2D = {
    el: svg,
    setMood(m) { const mm = reduced && (m === 'hop' || m === 'excited') ? 'idle' : m; if (mm === base) return; prevBase = base; prevBaseT = baseT; base = mm; baseT = 0; baseFade = 0; },
    react(r) { one = reduced && r === 'cheer' ? 'nod_yes' : r; oneT = 0; },
    setEnergy(e) { energy = reduced ? 0 : clamp(e, 0, 1); },
    setProp(p) { propName = p; buildProp(p); },
    lookAt,
    advance(sec, fps = 60) {
      manual = true; cancelAnimationFrame(raf);
      for (let i = 0, n = Math.round(sec * fps); i < n; i++) frame(last + 1000 / fps);
      manual = false; last = performance.now(); raf = requestAnimationFrame(frame);
    },
    destroy() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerdown', onDown); svg.remove(); },
  };
  return api;
}
