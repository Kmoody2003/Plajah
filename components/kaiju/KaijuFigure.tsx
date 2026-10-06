// KaijuFigure — Lorik (music) and Lumi (vision/light), the Plajah chibi kaiju, drawn entirely in SVG.
//
// Geometry is measured off the front T-pose on the character reference sheet (1 unit ≈ 1/252 of
// the figure's height, feet at y = 0, horn tips at y ≈ -253, crest tip ≈ -268):
//   • cat-dome head (cheeks ±64 at y -165, chin -114) framed by a serrated frill that is orange at
//     the top and magenta at the bottom; two cat-ear navy horns; a tall magenta crest spike behind;
//     a dark leaf "gem" + teardrop spots on the forehead;
//   • pale face mask with a dark V point dropping between the eyes, thick black slanted brow
//     wedges, tall pupils tucked under the brows, tiny triangle nose, small frown, cheek blush;
//   • compact body with a tall belly plate — Lorik: magenta, segmented; Lumi: orange→peach with a
//     white flame — long tapering arms ending in coloured paws with little white claws, chunky legs
//     with white toe claws, a spiked tail, and the sheet's thin dark outline.
//   Lorik — speckled purple/lavender, magenta belly and paws, dark eyes, black "LORIK" music book.
//   Lumi  — speckled navy fading to orange limbs, glowing orange eyes, camera on a strap.
//
// The figure is a puppet: every joint/expression is its own node and apply(pose) writes transforms
// straight to the DOM (no React re-render per frame). Fits viewBox "-125 -292 250 307".

import React, { forwardRef, useId, useImperativeHandle, useRef } from 'react';
import { type Pose, clamp } from './kaijuPose';

export type KaijuKind = 'lorik' | 'lumi';

export interface KaijuRig {
  apply: (p: Pose, fx?: { flash?: number }) => void;
}

interface Palette {
  line: string;
  hoodTop: string; hood: string; horn: string; crestTip: string; spotDark: string; spotLight: string;
  mask: string; maskEdge: string; eyeTop: string; eyeBot: string; pupil: string; blush: string;
  frillTop: string; frillMid: string; frillBot: string;
  body: string; bodyLow: string; speck: string;
  belly1: string; belly2: string; belly3: string; bellyLine: string;
  paw: string; claw: string; legLow: string; tail: string; dorsal: string;
  aura: string;
}

export const KAIJU_PALETTES: Record<KaijuKind, Palette> = {
  lorik: {
    line: '#2A1F3F',
    hoodTop: '#2F3C72', hood: '#7A63BF', horn: '#1C2D4E', crestTip: '#D1287F', spotDark: '#1F2F55', spotLight: '#C8BEEB',
    mask: '#FDFDFF', maskEdge: '#D3D6E4', eyeTop: '#5B48A6', eyeBot: '#9C8AD6', pupil: '#0E0B18', blush: '#F2A3B5',
    frillTop: '#F7873A', frillMid: '#EC5A45', frillBot: '#C2287C',
    body: '#7A66BC', bodyLow: '#6650AE', speck: '#3F3384',
    belly1: '#C2257C', belly2: '#D2338A', belly3: '#C42A80', bellyLine: '#9C1C63',
    paw: '#C93590', claw: '#F4F1FA', legLow: '#9B3A9C', tail: '#7563B4', dorsal: '#D0337E',
    aura: '#B04BFF',
  },
  lumi: {
    line: '#1C2236',
    hoodTop: '#1F2B52', hood: '#3B4277', horn: '#18263F', crestTip: '#CC2A80', spotDark: '#16233F', spotLight: '#8A97BC',
    mask: '#FDFDFF', maskEdge: '#D3D6E4', eyeTop: '#FF4A12', eyeBot: '#FF8A2E', pupil: '#1A0602', blush: '#F59AA6',
    frillTop: '#F7873A', frillMid: '#EF6A3A', frillBot: '#BE2A7A',
    body: '#2B3A5E', bodyLow: '#26324F', speck: '#4A5B86',
    belly1: '#F07432', belly2: '#F6B07A', belly3: '#F9DCC0', bellyLine: '#FFFFFF',
    paw: '#F27E3F', claw: '#FFF3E8', legLow: '#E86A2E', tail: '#2C3956', dorsal: '#F07A3A',
    aura: '#FF8A2A',
  },
};

// ── geometry (character space) ───────────────────────────────────────────────────────────────────
const NECK_Y = -112;             // head pivot
const HEAD_CY = -175;            // frill / mane pivot
const EYE_Y = -162;              // blink pivot
const SHOULDER = { x: 40, y: -103 };
const HIP = { x: 24, y: -32 };
const ARM_LEN = 56;
/** Static head enlargement about the neck (the video renders read even more head-dominant). */
const HEAD_SCALE = 1.1;

const HEAD = 'M 0 -238 C 36 -238 60 -222 62 -198 C 66 -180 66 -158 62 -145 C 56 -125 36 -114 0 -114 C -36 -114 -56 -125 -62 -145 C -66 -158 -66 -180 -62 -198 C -60 -222 -36 -238 0 -238 Z';
const MASK = 'M -63 -195 C -50 -198 -30 -199 -19 -191 C -11 -185 -5 -177 0 -168 C 5 -177 11 -185 19 -191 C 30 -199 50 -198 63 -195 C 66 -178 66 -158 62 -145 C 56 -125 36 -114 0 -114 C -36 -114 -56 -125 -62 -145 C -66 -158 -66 -178 -63 -195 Z';
const V_POINT = 'M -12 -185 L 12 -185 L 0 -155 Z';
const GEM = 'M 0 -236 L 6 -214 L 0 -190 L -6 -214 Z';
const CREST = 'M -12 -229 Q -9 -250 0 -268 Q 9 -250 12 -229 Z';
const HORN_L = 'M -47 -204 C -49 -224 -45 -241 -38 -254 C -29 -243 -21 -226 -17 -208 Z';
const HORN_R = 'M 47 -204 C 49 -224 45 -241 38 -254 C 29 -243 21 -226 17 -208 Z';
/** Smaller secondary horns behind/outside the main pair (the videos show a crown of dark spikes). */
const HORN2 = 'M -58 -190 L -66 -222 L -48 -200 Z M 58 -190 L 66 -222 L 48 -200 Z M -26 -232 L -24 -250 L -16 -234 Z M 26 -232 L 24 -250 L 16 -234 Z';
/** Faceted shard scales on the crown: [cx, cy, size, rotation]. */
const SHARDS_DARK: [number, number, number, number][] = [
  [-16, -206, 4.2, -25], [-12, -193, 3.4, -20], [-31, -214, 3.2, -35], [16, -206, 4.2, 25], [12, -193, 3.4, 20], [31, -214, 3.2, 35],
  [-40, -200, 2.6, -40], [40, -200, 2.6, 40],
];
const SHARDS_LIGHT: [number, number, number, number][] = [[-24, -200, 3.4, -30], [-27, -190, 2.4, -30], [24, -200, 3.4, 30], [27, -190, 2.4, 30]];
const shard = ([x, y, s]: [number, number, number, number]) =>
  `M ${x} ${y - s * 1.5} L ${x + s * 0.8} ${y} L ${x} ${y + s * 1.1} L ${x - s * 0.8} ${y} Z`;
const SHARD_ROT = (a: number, x: number, y: number) => `rotate(${a} ${x} ${y})`;

/**
 * Serrated frill, left half; mirrored for the right. On the sheet it is five broad, slightly
 * up-swept fin lobes running from just outside the horns (≈ -256) down to the cheek (≈ -132),
 * reaching ≈ ±86 at their widest — built in polar coords around the head centre.
 */
const FRILL_C = { x: 0, y: -180 };
const FRILL_VALLEY_R = 73;
const FRILL_TIPS: [number, number][] = [[30, 92], [55, 91], [80, 88], [104, 86], [127, 81]];   // [deg from up, radius]
const FRILL_VALLEYS = [14, 43, 68, 92, 116, 142];
const polar = (deg: number, rad: number, sx = -1) => {
  const a = (deg * Math.PI) / 180;
  return `${(FRILL_C.x + sx * rad * Math.sin(a)).toFixed(1)} ${(FRILL_C.y - rad * Math.cos(a)).toFixed(1)}`;
};
const frillPath = (sx: number) => {
  const last = FRILL_VALLEYS.length - 1;
  let d = `M ${polar(FRILL_VALLEYS[0], 52, sx)}`;
  FRILL_TIPS.forEach(([at, rt], i) => {
    const a0 = FRILL_VALLEYS[i], a1 = FRILL_VALLEYS[i + 1];
    const r0 = i === 0 ? 60 : FRILL_VALLEY_R, r1 = i + 1 === last ? 58 : FRILL_VALLEY_R;
    d += ` L ${polar(a0, r0, sx)}`;
    d += ` Q ${polar((a0 + at) / 2 - 4, (r0 + rt) / 2 + 7, sx)} ${polar(at, rt, sx)}`;   // convex leading edge
    d += ` Q ${polar((at + a1) / 2 + 1, (rt + r1) / 2, sx)} ${polar(a1, r1, sx)}`;   // straighter trailing edge
  });
  return `${d} L ${polar(FRILL_VALLEYS[last], 50, sx)} Z`;
};
const FRILL_L = frillPath(-1);
const FRILL_R = frillPath(1);
/** Soft highlight ridge running up the leading side of each spike (cone volume). */
const FRILL_HL = [-1, 1].map(sx => FRILL_TIPS.map(([at, rt]) =>
  `M ${polar(at - 7, FRILL_VALLEY_R + 1, sx)} Q ${polar(at - 5, (FRILL_VALLEY_R + rt) / 2 + 3, sx)} ${polar(at - 1.5, rt - 6, sx)}`).join(' ')).join(' ');

const EYE_L = 'M -50 -184 L -6 -167 C -5 -156 -14 -147 -26 -147 C -40 -147 -52 -158 -50 -184 Z';
const EYE_R = 'M 50 -184 L 6 -167 C 5 -156 14 -147 26 -147 C 40 -147 52 -158 50 -184 Z';
const BROW_L = 'M -55 -189 L -2 -169 L -3 -162.5 L -53 -183.5 Z';
const BROW_R = 'M 55 -189 L 2 -169 L 3 -162.5 L 53 -183.5 Z';
const NOSE = 'M -2.8 -149.5 L 2.8 -149.5 L 0 -146 Z';

const BODY = 'M -34 -117 C -42 -108 -46 -92 -47 -72 C -48 -54 -48 -40 -45 -30 C -42 -22 -32 -20 -20 -20 L 20 -20 C 32 -20 42 -22 45 -30 C 48 -40 48 -54 47 -72 C 46 -92 42 -108 34 -117 Z';
const BELLY_LORIK = 'M -21 -116 C -29 -102 -31 -64 -28 -44 C -26 -32 -14 -27 0 -27 C 14 -27 26 -32 28 -44 C 31 -64 29 -102 21 -116 Z';
const BELLY_LUMI = 'M -26 -116 C -34 -100 -35 -62 -31 -44 C -28 -31 -15 -26 0 -26 C 15 -26 28 -31 31 -44 C 35 -62 34 -100 26 -116 Z';
const BELLY_LINES = [-106, -97, -88, -79, -70, -61, -52, -43, -35].map(y => {
  const w = y > -50 ? 22 - (y + 50) * 0.55 : 26;
  return `M ${-w} ${y} Q 0 ${y + 3} ${w} ${y}`;
}).join(' ');
// Lorik's belly emblem: a beamed pair of eighth notes (♫), centred around (3, -72).
const NOTE = [
  'M -13.1 -60 a 5.6 4.4 0 1 0 11.2 0 a 5.6 4.4 0 1 0 -11.2 0 Z',
  'M 3.4 -64.5 a 5.6 4.4 0 1 0 11.2 0 a 5.6 4.4 0 1 0 -11.2 0 Z',
  'M -4.3 -60 L -4.3 -84 L 14.7 -90 L 14.7 -64.5 L 12.4 -64.5 L 12.4 -84.5 L -1.9 -79.8 L -1.9 -60 Z',
  'M -4.3 -84 L 14.7 -90 L 14.7 -84.4 L -4.3 -78.4 Z',
].join(' ');
const FLAME = 'M 0 -50 C -12 -50 -19 -58 -17 -68 C -16 -75 -10 -79 -9 -88 C -4 -83 -3 -77 -5 -71 C -2 -78 3 -84 2 -95 C 9 -87 13 -78 11 -69 C 13 -72 15 -76 14 -80 C 19 -72 20 -60 12 -54 C 8 -51 4 -50 0 -50 Z M -1 -56 C -6 -57 -8 -61 -6 -66 C -4 -62 -2 -63 -1 -66 C 1 -63 3 -62 4 -64 C 5 -60 3 -57 -1 -56 Z';
const BODY_SPECKS: [number, number, number, number][] = [
  [-41, -96, 3.6, 2.4], [-44, -82, 2.6, 1.8], [-40, -70, 4, 2.8], [-45, -58, 2.4, 1.8], [-41, -45, 3.4, 2.4], [-37, -33, 2.4, 1.6],
  [41, -94, 3.4, 2.4], [44, -80, 2.4, 1.8], [40, -66, 4, 2.6], [45, -54, 2.6, 1.8], [41, -42, 3.4, 2.2], [36, -32, 2.2, 1.6],
];
// The front T-pose shows no spikes on the body sides — the back ridge only reads from behind.
// Tail: on the sheet only a short tapered tip peeks out from behind one leg (Lumi, lower right).
const TAIL = 'M -22 -50 C -40 -48 -56 -34 -70 -6 C -60 -10 -50 -14 -40 -17 C -34 -19 -28 -21 -22 -22 Z';
const TAIL_SPIKES = 'M -46 -40 L -54 -50 L -56 -34 Z M -57 -26 L -68 -32 L -66 -15 Z';

// arm (local: shoulder at 0,0, hanging down)
const ARM = `M -13 0 C -13 -13 13 -13 13 0 C 12 18 10 34 9 48 C 9 ${ARM_LEN + 2} -9 ${ARM_LEN + 2} -9 48 C -10 34 -12 18 -13 0 Z`;
const ARM_OUT = `M -13 0 C -12 18 -10 34 -9 48 C -9 ${ARM_LEN + 2} 9 ${ARM_LEN + 2} 9 48 C 10 34 12 18 13 0`;
const ARM_SPECKS: [number, number, number, number][] = [[-4, 12, 2.8, 2], [4, 22, 2.4, 1.7], [-3, 32, 2.2, 1.5], [3, 40, 1.8, 1.3]];
// leg (local: hip at 0,0)
const LEG = 'M -19 -4 L -19 22 C -19 31 -11 34 0 34 C 11 34 19 31 19 22 L 19 -4 Z';
const LEG_OUT = 'M -19 -4 L -19 22 C -19 31 -11 34 0 34 C 11 34 19 31 19 22 L 19 -4';
const LEG_SPECKS: [number, number, number, number][] = [[-9, 6, 3, 2.2], [8, 12, 2.6, 1.8], [-6, 20, 2.2, 1.6]];

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Airbrush grain tile — the reference art is soft-3D with a fine speckled spray texture. Generated
 * once on a canvas and used as an SVG pattern fill (far cheaper than an feTurbulence filter, which
 * would re-rasterise every animated frame).
 */
let GRAIN_URL = '';
const grainUrl = () => {
  if (GRAIN_URL || typeof document === 'undefined') return GRAIN_URL;
  const N = 96, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(N, N);
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) {
    const v = rnd();
    const k = i * 4;
    if (v < 0.16) { img.data[k] = 20; img.data[k + 1] = 8; img.data[k + 2] = 40; img.data[k + 3] = 40 + rnd() * 70; }
    else if (v > 0.9) { img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = 30 + rnd() * 50; }
  }
  g.putImageData(img, 0, 0);
  GRAIN_URL = c.toDataURL();
  return GRAIN_URL;
};

interface FigureProps {
  kind: KaijuKind;
  /** Lumi stands stage-right; mirror her tail so it trails away from Lorik. */
  flipTail?: boolean;
  /** Which arm holds the mic (outer arm reads best). */
  micSide?: 'L' | 'R';
}

/** The puppet as an SVG <g> — place it inside any SVG. */
export const KaijuFigure = forwardRef<KaijuRig, FigureProps>(({ kind, flipTail, micSide }, ref) => {
  const uid = useId().replace(/[:]/g, '');
  const id = (s: string) => `kj-${kind}-${s}-${uid}`;
  const url = (s: string) => `url(#${id(s)})`;
  const P = KAIJU_PALETTES[kind];
  const mic = micSide ?? (kind === 'lorik' ? 'L' : 'R');
  const isLorik = kind === 'lorik';
  const LW = 0.6;   // outline width (char units) — barely there; the shading carries the form
  const GRAIN_OP = 0.6;
  /** Painterly overlays for one shape: volume shading (light from upper-left) + airbrush grain. */
  const skin = (d: string, vol: 'vol' | 'volHead' | 'volLimb' = 'vol', grain = GRAIN_OP) => (
    <>
      <path d={d} fill={url(vol)} />
      <path d={d} fill={url('grain')} opacity={grain} />
    </>
  );

  const r = {
    root: useRef<SVGGElement>(null), shadow: useRef<SVGEllipseElement>(null), aura: useRef<SVGCircleElement>(null),
    tail: useRef<SVGGElement>(null), legL: useRef<SVGGElement>(null), legR: useRef<SVGGElement>(null),
    head: useRef<SVGGElement>(null), mane: useRef<SVGGElement>(null), eyesN: useRef<SVGGElement>(null),
    pupils: useRef<SVGGElement>(null), eyesH: useRef<SVGGElement>(null), eyesC: useRef<SVGGElement>(null),
    blush: useRef<SVGGElement>(null), mouthC: useRef<SVGPathElement>(null), mouthO: useRef<SVGGElement>(null),
    mouthOut: useRef<SVGEllipseElement>(null), tongue: useRef<SVGEllipseElement>(null), fang: useRef<SVGPathElement>(null), shades: useRef<SVGGElement>(null),
    armL: useRef<SVGGElement>(null), armR: useRef<SVGGElement>(null), mic: useRef<SVGGElement>(null),
    book: useRef<SVGGElement>(null), cam: useRef<SVGGElement>(null), strap: useRef<SVGPathElement>(null), flash: useRef<SVGCircleElement>(null),
  };

  useImperativeHandle(ref, () => ({
    apply(p: Pose, fx) {
      const T = (el: SVGElement | null, v: string) => { if (el) el.setAttribute('transform', v); };
      const O = (el: SVGElement | null, v: number) => { if (el) el.setAttribute('opacity', f2(clamp(v))); };

      const air = clamp(-p.y / 140);
      T(r.shadow.current, `translate(${f2(p.x)} 0) scale(${f2(1 - air * 0.45)} ${f2(1 - air * 0.4)})`);
      O(r.shadow.current, 1 - air * 0.5);
      const spin = Math.abs(p.spin) < 0.08 ? Math.sign(p.spin || 1) * 0.08 : p.spin;
      T(r.root.current, `translate(${f2(p.x)} ${f2(p.y)}) rotate(${f2(p.rot)}) scale(${f2(p.sx * spin)} ${f2(p.sy)})`);
      O(r.aura.current, p.glow * 0.65);
      T(r.tail.current, `rotate(${f2(p.tail)} -26 -40)`);
      T(r.legL.current, `translate(${-HIP.x} ${f2(HIP.y + p.liftL)}) rotate(${f2(p.legL)})`);
      T(r.legR.current, `translate(${HIP.x} ${f2(HIP.y + p.liftR)}) rotate(${f2(-p.legR)})`);
      T(r.head.current, `translate(${f2(p.headX)} ${f2(p.headY + NECK_Y)}) rotate(${f2(p.headRot)}) scale(${f2(p.headScale)}) translate(0 ${-NECK_Y})`);
      T(r.mane.current, `translate(0 ${HEAD_CY}) scale(${f2(1 + 0.16 * p.mane)}) translate(0 ${-HEAD_CY})`);

      O(r.eyesN.current, (1 - p.happy) * (1 - p.closed));
      O(r.eyesH.current, p.happy * (1 - p.closed));
      O(r.eyesC.current, p.closed);
      T(r.eyesN.current, `translate(0 ${EYE_Y - 6}) scale(1 ${f2(Math.max(0.06, p.eyeOpen))}) translate(0 ${-(EYE_Y - 6)})`);
      T(r.pupils.current, `translate(${f2(clamp(p.lookX, -1, 1) * 3.6)} ${f2(clamp(p.lookY, -1, 1) * 2.2)})`);
      O(r.blush.current, 0.35 + 0.55 * p.blush);

      const open = clamp(p.mouth);
      const hw = 6 + 3.5 * p.mouthW;
      if (r.mouthC.current) {
        r.mouthC.current.setAttribute('d', `M ${f2(-hw)} -137 Q 0 ${f2(-137 + 8 * p.smile)} ${f2(hw)} -137`);
        O(r.mouthC.current, open > 0.06 ? 0 : 1);
      }
      O(r.mouthO.current, open > 0.06 ? 1 : 0);
      if (open > 0.06 && r.mouthOut.current && r.tongue.current) {
        const rx = 4 + 6 * p.mouthW * (0.65 + 0.35 * open), ry = 1.8 + 8 * open;
        r.mouthOut.current.setAttribute('rx', f2(rx)); r.mouthOut.current.setAttribute('ry', f2(ry));
        r.mouthOut.current.setAttribute('cy', f2(-137 + ry * 0.4));
        r.tongue.current.setAttribute('cy', f2(-137 + ry * 0.85)); r.tongue.current.setAttribute('rx', f2(rx * 0.6)); r.tongue.current.setAttribute('ry', f2(ry * 0.4));
        const top = -137 + ry * 0.4 - ry;
        T(r.fang.current, `translate(${f2(rx * 0.35 - 3.5)} ${f2(top + 137.5)})`);
      }
      T(r.shades.current, `translate(0 ${f2(-28 * (1 - p.shades))})`);
      O(r.shades.current, p.shades);

      T(r.armL.current, `translate(${-SHOULDER.x} ${SHOULDER.y}) rotate(${f2(p.armL)})`);
      T(r.armR.current, `translate(${SHOULDER.x} ${SHOULDER.y}) rotate(${f2(-p.armR)})`);
      // props held in a paw stay upright: counter-rotate by the arm's own rotation
      const micArmRot = mic === 'L' ? p.armL : -p.armR;
      const bookArmRot = mic === 'L' ? -p.armR : p.armL;
      if (r.mic.current) {
        T(r.mic.current, `translate(0 ${ARM_LEN - 4}) rotate(${f2(-micArmRot + (mic === 'L' ? -22 : 22))})`);
        O(r.mic.current, p.mic > 0.5 ? 1 : 0);
      }
      if (r.book.current) {
        T(r.book.current, `translate(0 ${ARM_LEN - 2}) rotate(${f2(-bookArmRot)}) translate(0 10) scale(${f2(0.4 + 0.6 * clamp(p.book))})`);
        O(r.book.current, p.book > 0.15 ? 1 : 0);
      }
      if (r.cam.current) {
        const u = clamp(p.camUp);
        T(r.cam.current, `translate(0 ${f2(-74 - 93 * u)}) scale(${f2(1 + 0.12 * u)})`);
        O(r.strap.current, 1 - u);
      }
      O(r.flash.current, fx?.flash ?? 0);
    },
  }), [mic]);

  const micEl = (
    <g ref={r.mic} opacity={0}>
      <rect x={-3.4} y={-16} width={6.8} height={18} rx={3} fill="#2A2A3A" />
      <circle cx={0} cy={-20} r={8} fill={url('mic')} stroke="#3A3A4C" strokeWidth={1.2} />
      <path d="M -5.5 -22 H 5.5 M -6.5 -18.5 H 6.5 M -4.5 -15 H 4.5" stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.9} />
    </g>
  );

  const book = isLorik ? (
    <g ref={r.book} opacity={0}>
      <rect x={-29} y={-19} width={58} height={37} rx={3} fill="#162033" stroke={P.line} strokeWidth={1.2} />
      <path d="M -26 -16 L -1.5 -13 V 15 L -26 13 Z" fill="#FFFFFF" />
      <path d="M 26 -16 L 1.5 -13 V 15 L 26 13 Z" fill="#F6F2FF" />
      <path d="M 0 -14 V 16" stroke="#C9C2DE" strokeWidth={1.2} />
      <text x={-14} y={6} fontSize={15} textAnchor="middle" fill="#E23D8E" fontWeight={900}>♪</text>
      <text x={13} y={6} fontSize={15} textAnchor="middle" fill="#E23D8E" fontWeight={900}>♫</text>
      <text x={0} y={23.5} fontSize={5.5} textAnchor="middle" fill="#ffffff" fontWeight={900} letterSpacing={1.2}>LORIK</text>
    </g>
  ) : null;

  const arm = (side: 'L' | 'R') => (
    <g ref={side === 'L' ? r.armL : r.armR}>
      <path d={ARM} fill={url('arm')} />
      {ARM_SPECKS.map(([x, y, rx, ry], i) => <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={P.speck} opacity={isLorik ? 0.75 : 0.45} />)}
      {skin(ARM, 'volLimb')}
      <path d={ARM_OUT} fill="none" stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
      {[-5, 0, 5].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={ARM_LEN + (i === 1 ? 1.6 : 0)} rx={2.3} ry={2.6} fill={P.claw} stroke={P.line} strokeWidth={0.5} />
          <circle cx={x - 0.7} cy={ARM_LEN + (i === 1 ? 1.6 : 0) - 0.9} r={0.8} fill="#fff" />
        </g>
      ))}
      {mic === side && micEl}
      {mic !== side && book}
    </g>
  );

  const leg = (side: 'L' | 'R') => (
    <g ref={side === 'L' ? r.legL : r.legR}>
      <path d={LEG} fill={url('leg')} />
      {LEG_SPECKS.map(([x, y, rx, ry], i) => <ellipse key={i} cx={side === 'L' ? x : -x} cy={y} rx={rx} ry={ry} fill={isLorik ? P.speck : '#C9561F'} opacity={isLorik ? 0.75 : 0.55} />)}
      {skin(LEG, 'vol')}
      <path d={LEG_OUT} fill="none" stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
      {[-10, 0, 10].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy={i === 1 ? 32 : 30.5} rx={3.6} ry={2.9} fill={P.claw} stroke={P.line} strokeWidth={0.55} />
          <ellipse cx={x - 1} cy={(i === 1 ? 32 : 30.5) - 1.1} rx={1.4} ry={0.9} fill="#fff" />
        </g>
      ))}
    </g>
  );

  return (
    <g>
      <defs>
        {/* ── painterly rendering: grain + volume (light from the upper-left, like the sheet) ── */}
        <pattern id={id('grain')} width="22" height="22" patternUnits="userSpaceOnUse">
          <image href={grainUrl()} width="22" height="22" preserveAspectRatio="none" style={{ imageRendering: 'auto' }} />
        </pattern>
        <radialGradient id={id('vol')} cx="0.38" cy="0.3" r="0.82" fx="0.32" fy="0.22">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.3} /><stop offset="0.38" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="0.66" stopColor={P.line} stopOpacity={0} /><stop offset="1" stopColor={P.line} stopOpacity={0.42} />
        </radialGradient>
        <radialGradient id={id('volHead')} cx="0.42" cy="0.36" r="0.72" fx="0.34" fy="0.24">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} /><stop offset="0.42" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="0.74" stopColor={P.line} stopOpacity={0} /><stop offset="1" stopColor={P.line} stopOpacity={0.34} />
        </radialGradient>
        <linearGradient id={id('volLimb')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.26} /><stop offset="0.32" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="0.6" stopColor={P.line} stopOpacity={0} /><stop offset="1" stopColor={P.line} stopOpacity={0.45} />
        </linearGradient>
        <radialGradient id={id('occl')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={P.line} stopOpacity={0.55} /><stop offset="1" stopColor={P.line} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id('hornSheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.32} /><stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="1" stopColor="#000000" stopOpacity={0.25} />
        </linearGradient>
        <linearGradient id={id('frill')} x1="0" y1="-258" x2="0" y2="-138" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.frillTop} /><stop offset="0.55" stopColor={P.frillMid} /><stop offset="1" stopColor={P.frillBot} />
        </linearGradient>
        <radialGradient id={id('frillBase')} cx={FRILL_C.x} cy={FRILL_C.y} r="95" gradientUnits="userSpaceOnUse">
          <stop offset="0.7" stopColor={P.frillBot} stopOpacity={0.8} /><stop offset="0.9" stopColor={P.frillBot} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={id('crest')} x1="0" y1="-268" x2="0" y2="-229" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.crestTip} /><stop offset="1" stopColor={P.hoodTop} />
        </linearGradient>
        <radialGradient id={id('hood')} cx="0" cy="-236" r="72" gradientUnits="userSpaceOnUse">
          <stop offset="0.15" stopColor={P.hoodTop} /><stop offset="1" stopColor={P.hood} />
        </radialGradient>
        <radialGradient id={id('emblemGlow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={isLorik ? '#FFC25A' : '#FFF4C8'} stopOpacity={isLorik ? 0.55 : 0.85} />
          <stop offset="1" stopColor={isLorik ? '#FF8A3A' : '#FFB25A'} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('mask')} cx="0" cy="-172" r="74" gradientUnits="userSpaceOnUse">
          <stop offset="0.45" stopColor={P.mask} /><stop offset="1" stopColor={P.maskEdge} />
        </radialGradient>
        <linearGradient id={id('eye')} x1="0" y1="-184" x2="0" y2="-147" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.eyeTop} /><stop offset="1" stopColor={P.eyeBot} />
        </linearGradient>
        <linearGradient id={id('body')} x1="0" y1="-117" x2="0" y2="-20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.body} /><stop offset="1" stopColor={P.bodyLow} />
        </linearGradient>
        <linearGradient id={id('belly')} x1="0" y1="-116" x2="0" y2="-26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.belly1} /><stop offset={isLorik ? '0.5' : '0.35'} stopColor={P.belly2} /><stop offset="1" stopColor={P.belly3} />
        </linearGradient>
        <linearGradient id={id('arm')} x1="0" y1="0" x2="0" y2={ARM_LEN} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.body} /><stop offset={isLorik ? '0.45' : '0.3'} stopColor={P.body} /><stop offset="1" stopColor={P.paw} />
        </linearGradient>
        <linearGradient id={id('leg')} x1="0" y1="-4" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.bodyLow} /><stop offset={isLorik ? '0.6' : '0.3'} stopColor={isLorik ? P.bodyLow : '#6C4A5E'} /><stop offset="1" stopColor={P.legLow} />
        </linearGradient>
        <radialGradient id={id('aura')} cx="0" cy="-150" r="140" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={P.aura} stopOpacity={0.55} /><stop offset="1" stopColor={P.aura} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('mic')} cx="-3" cy="-24" r="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset="0.5" stopColor="#E7B8D8" /><stop offset="1" stopColor="#9A6FB0" />
        </radialGradient>
        <radialGradient id={id('flash')} cx="0" cy="0" r="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={1} /><stop offset="0.35" stopColor="#FFF6D8" stopOpacity={0.85} /><stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
      </defs>

      <ellipse ref={r.shadow} cx={0} cy={3} rx={52} ry={8} fill="#3C1E5A" fillOpacity={0.16} />

      <g ref={r.root}>
        <circle ref={r.aura} cx={0} cy={-150} r={140} fill={url('aura')} opacity={0} />

        {/* tail (behind everything) */}
        <g transform={flipTail ? 'scale(-1 1)' : undefined}>
          <g ref={r.tail}>
            <path d={TAIL_SPIKES} fill={P.dorsal} stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
            <path d={TAIL_SPIKES} fill={url('grain')} opacity={GRAIN_OP} />
            <path d={TAIL} fill={P.tail} stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
            {skin(TAIL)}
          </g>
        </g>

        {/* body */}
        <path d={BODY} fill={url('body')} />
        {BODY_SPECKS.map(([x, y, rx, ry], i) => <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={P.speck} opacity={isLorik ? 0.8 : 0.7} />)}
        {isLorik ? (
          <>
            <path d={BELLY_LORIK} fill={url('belly')} />
            <path d={BELLY_LINES} stroke={P.bellyLine} strokeOpacity={0.45} strokeWidth={1.2} fill="none" strokeLinecap="round" />
            {/* glowing music-note emblem (as in the videos) */}
            <ellipse cx={0} cy={-72} rx={22} ry={20} fill={url('emblemGlow')} />
            <path d={NOTE} fill="#FFB347" />
            <path d={NOTE} fill="#FFE2A8" opacity={0.55} transform="translate(-0.8 -0.8) scale(0.985)" />
          </>
        ) : (
          <>
            <path d={BELLY_LUMI} fill={url('belly')} />
            <ellipse cx={0} cy={-70} rx={24} ry={26} fill={url('emblemGlow')} />
            <path d={FLAME} fill="#FFFFFF" fillRule="evenodd" opacity={0.97} />
          </>
        )}
        {skin(BODY)}
        {/* soft occlusion where the big head sits on the body */}
        <ellipse cx={0} cy={-110} rx={46} ry={14} fill={url('occl')} />
        <path d={BODY} fill="none" stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />

        {leg('L')}{leg('R')}

        {/* head */}
        <g ref={r.head}>
          <g transform={`translate(0 ${NECK_Y}) scale(${HEAD_SCALE}) translate(0 ${-NECK_Y})`}>
          <g ref={r.mane}>
            <path d={FRILL_L} fill={url('frill')} stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
            <path d={FRILL_R} fill={url('frill')} stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
            <path d={`${FRILL_L} ${FRILL_R}`} fill={url('frillBase')} />
            <path d={`${FRILL_L} ${FRILL_R}`} fill={url('grain')} opacity={GRAIN_OP} />
            <path d={FRILL_HL} fill="none" stroke="#FFE3C2" strokeOpacity={0.22} strokeWidth={2.6} strokeLinecap="round" />
          </g>
          <path d={CREST} fill={url('crest')} stroke={P.line} strokeWidth={LW} strokeLinejoin="round" />
          <path d={CREST} fill={url('hornSheen')} />
          <path d={HORN2} fill={P.horn} stroke={P.line} strokeWidth={LW * 0.7} strokeLinejoin="round" />
          <path d={HORN2} fill={url('hornSheen')} />
          <path d={HEAD} fill={url('hood')} />
          <path d={GEM} fill={P.horn} />
          {SHARDS_DARK.map((s, i) => <path key={i} d={shard(s)} fill={P.spotDark} transform={SHARD_ROT(s[3], s[0], s[1])} />)}
          {SHARDS_LIGHT.map((s, i) => <path key={i} d={shard(s)} fill={P.spotLight} opacity={0.8} transform={SHARD_ROT(s[3], s[0], s[1])} />)}
          <path d={MASK} fill={url('mask')} />
          <path d={V_POINT} fill={P.horn} />
          {skin(HEAD, 'volHead', GRAIN_OP * 0.4)}
          <path d={HEAD} fill="none" stroke={P.line} strokeWidth={LW} />
          <path d={HORN_L} fill={P.horn} stroke={P.line} strokeWidth={LW * 0.7} strokeLinejoin="round" />
          <path d={HORN_R} fill={P.horn} stroke={P.line} strokeWidth={LW * 0.7} strokeLinejoin="round" />
          <path d={HORN_L} fill={url('hornSheen')} />
          <path d={HORN_R} fill={url('hornSheen')} />

          <g ref={r.blush}>
            <ellipse cx={-43} cy={-145} rx={7.5} ry={3.6} fill={P.blush} />
            <ellipse cx={43} cy={-145} rx={7.5} ry={3.6} fill={P.blush} />
          </g>

          <g ref={r.eyesN}>
            <path d={EYE_L} fill={url('eye')} />
            <path d={EYE_R} fill={url('eye')} />
            <g ref={r.pupils}>
              {isLorik ? (
                <>
                  <ellipse cx={-21} cy={-159} rx={5.6} ry={7.6} fill={P.pupil} />
                  <ellipse cx={21} cy={-159} rx={5.6} ry={7.6} fill={P.pupil} />
                  <circle cx={-19.3} cy={-162} r={1.7} fill="#fff" /><circle cx={22.7} cy={-162} r={1.7} fill="#fff" />
                </>
              ) : (
                <>
                  <ellipse cx={-26} cy={-156} rx={9} ry={6} fill="#FFB25A" opacity={0.55} />
                  <ellipse cx={26} cy={-156} rx={9} ry={6} fill="#FFB25A" opacity={0.55} />
                  <ellipse cx={-19} cy={-161} rx={3.4} ry={5} fill={P.pupil} />
                  <ellipse cx={19} cy={-161} rx={3.4} ry={5} fill={P.pupil} />
                  <circle cx={-18} cy={-163} r={1.1} fill="#fff" /><circle cx={20} cy={-163} r={1.1} fill="#fff" />
                </>
              )}
            </g>
          </g>
          <g ref={r.eyesH} opacity={0} stroke={P.pupil} strokeWidth={4} strokeLinecap="round" fill="none">
            <path d="M -38 -154 Q -26 -166 -14 -154" /><path d="M 38 -154 Q 26 -166 14 -154" />
          </g>
          <g ref={r.eyesC} opacity={0} stroke={P.pupil} strokeWidth={3.6} strokeLinecap="round" fill="none">
            <path d="M -40 -160 Q -26 -151 -12 -160" /><path d="M 40 -160 Q 26 -151 12 -160" />
          </g>
          {/* the angry brow wedges are the character — they stay in every expression */}
          <path d={BROW_L} fill="#0E0B14" />
          <path d={BROW_R} fill="#0E0B14" />
          <path d={NOSE} fill="#0E0B14" />

          <path ref={r.mouthC} d="M -8 -137 Q 0 -140 8 -137" stroke="#0E0B14" strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <g ref={r.mouthO} opacity={0}>
            <ellipse ref={r.mouthOut} cx={0} cy={-135} rx={6} ry={6} fill="#4A0F24" />
            <ellipse ref={r.tongue} cx={0} cy={-132} rx={4} ry={2.5} fill="#FF6F91" />
            <path ref={r.fang} d="M 1.5 -137.5 L 5.5 -137.5 L 3.5 -132.5 Z" fill="#FFFFFF" />
          </g>

          <g ref={r.shades} opacity={0}>
            <path d="M -56 -188 L -4 -170 L -6 -156 C -10 -148 -20 -145 -30 -146 C -46 -148 -56 -160 -56 -188 Z" fill="#121218" />
            <path d="M 56 -188 L 4 -170 L 6 -156 C 10 -148 20 -145 30 -146 C 46 -148 56 -160 56 -188 Z" fill="#121218" />
            <path d="M -8 -168 Q 0 -172 8 -168" stroke="#121218" strokeWidth={4} fill="none" />
            <path d="M -46 -178 l 12 4 M 22 -174 l 12 -4" stroke="#fff" strokeOpacity={0.55} strokeWidth={2.2} strokeLinecap="round" />
          </g>
          </g>
        </g>

        {/* camera — Lumi's strap camera at the belly, raised to her face for snaps */}
        {!isLorik && (
          <g ref={r.cam}>
            <path ref={r.strap} d="M -19 -10 L -30 -40 M 19 -10 L 30 -40" stroke="#15151B" strokeWidth={2.4} strokeLinecap="round" />
            <rect x={-21} y={-13} width={42} height={27} rx={5} fill="#1D1D23" stroke="#0A0A0E" strokeWidth={1.2} />
            <rect x={-9} y={-18.5} width={18} height={7} rx={2} fill="#26262E" />
            <rect x={13} y={-13} width={8} height={27} rx={3} fill="#121216" />
            <rect x={-17} y={-10} width={7} height={4} rx={1} fill="#D9D9E0" />
            <circle cx={0} cy={1} r={11} fill="#2C2C34" stroke="#4A4A54" strokeWidth={2} />
            <circle cx={0} cy={1} r={7} fill="#0E2238" />
            <circle cx={0} cy={1} r={3.2} fill="#06101C" />
            <circle cx={-2.8} cy={-2} r={2.2} fill="#fff" opacity={0.8} />
            <circle ref={r.flash} cx={0} cy={0} r={60} fill={url('flash')} opacity={0} />
          </g>
        )}

        {arm('L')}{arm('R')}
      </g>
    </g>
  );
});
KaijuFigure.displayName = 'KaijuFigure';

/** Standalone wrapper: a single kaiju in its own SVG, for UI placements. */
export const KaijuFigureSvg = forwardRef<KaijuRig, FigureProps & { className?: string; style?: React.CSSProperties; title?: string }>(
  ({ className, style, title, ...rest }, ref) => (
    <svg viewBox="-125 -292 250 307" className={className} style={{ overflow: 'visible', ...style }} role="img" aria-label={title ?? (rest.kind === 'lorik' ? 'Lorik the music kaiju' : 'Lumi the camera kaiju')}>
      <KaijuFigure ref={ref} {...rest} />
    </svg>
  ),
);
KaijuFigureSvg.displayName = 'KaijuFigureSvg';
