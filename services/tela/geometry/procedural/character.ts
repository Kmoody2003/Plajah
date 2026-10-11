// character — a toolkit for code-built characters that stay ON MODEL across spreads.
//
// A CharacterSpec fixes everything that defines the character's identity (shape language,
// proportions, palette, ear/tail type, line weight, seed). A Pose varies per spread
// (position, scale, facing, lean, arm/leg angles, expression, gaze). drawCharacter()
// is a pure function of (spec, pose), so page 3 and page 27 draw the same character.
//
// Construction mirrors how illustrators build cartoon characters: a bean/pear/round body
// from a few bezier anchors, a head of fixed ratio, limbs as tapered variable-width
// strokes between joints, faces from simple parametric features (eye shapes, mouth
// curves, brows, cheeks), all painted with the painterly recipe and one ink line weight.
import type { Vec } from '../vec';
import type { CompoundPath } from '../model';
import type { Scene } from '../scene';
import { smoothThrough, ellipseAt, circlePath } from '../shapes';
import { transformPath, compose, translate, scale, rotate } from '../transform';
import { PROFILES } from '../stroke';
import { boolean } from '../boolean';
import { painted, contactShadow } from './paintStyle';
import { shade, mix } from '../color';
import { leaf } from './organic';

export interface CharacterSpec {
  name: string; seed?: number;
  build: 'bean' | 'pear' | 'round' | 'tall';
  /** Head size relative to body height (cartoon children's-book characters: .45–.7). */
  headRatio?: number;
  ears?: 'round' | 'pointy' | 'floppy' | 'none';
  tail?: 'none' | 'fluffy' | 'thin';
  palette: { body: string; belly?: string; ink: string; cheek?: string; eye?: string; accent?: string };
  /** Base body height in px at scale 1. */
  height?: number;
  lineWeight?: number;
  medium?: 'gouache' | 'watercolor' | 'crayon' | 'felt' | 'flat';
  light?: number;
}
export interface Expression { eyes?: 'open' | 'closed' | 'happy' | 'wide' | 'sleepy'; mouth?: 'smile' | 'open' | 'o' | 'flat' | 'grin' | 'frown'; brows?: number; blush?: boolean }
export interface Pose {
  x: number; /** Feet line. */ y: number; scale?: number; facing?: 1 | -1; lean?: number;
  armL?: number; armR?: number; legSpread?: number; step?: number;
  look?: Vec; expression?: Expression; shadow?: boolean;
}

/** Character-local geometry (feet at 0,0; up is −y; facing right), deterministic from spec. */
function bodyShape(spec: CharacterSpec, H: number): CompoundPath {
  const w = spec.build === 'round' ? H * .78 : spec.build === 'pear' ? H * .66 : spec.build === 'tall' ? H * .42 : H * .52;
  const top = -H, bot = 0;
  const pts: Vec[] = spec.build === 'pear'
    ? [{ x: 0, y: top }, { x: w * .34, y: top + H * .18 }, { x: w * .5, y: top + H * .68 }, { x: w * .3, y: bot }, { x: -w * .3, y: bot }, { x: -w * .5, y: top + H * .68 }, { x: -w * .34, y: top + H * .18 }]
    : spec.build === 'round'
      ? [{ x: 0, y: top }, { x: w * .44, y: top + H * .2 }, { x: w * .5, y: top + H * .58 }, { x: w * .32, y: bot - H * .02 }, { x: -w * .32, y: bot - H * .02 }, { x: -w * .5, y: top + H * .58 }, { x: -w * .44, y: top + H * .2 }]
      : [{ x: w * .06, y: top }, { x: w * .46, y: top + H * .22 }, { x: w * .5, y: top + H * .62 }, { x: w * .28, y: bot }, { x: -w * .3, y: bot }, { x: -w * .5, y: top + H * .6 }, { x: -w * .4, y: top + H * .18 }];
  return smoothThrough(pts, true, .62);
}

/** Draw a character into a scene. Returns the head centre (for speech bubbles etc.). */
export function drawCharacter(s: Scene, spec: CharacterSpec, pose: Pose): { head: Vec; bounds: { x: number; y: number; w: number; h: number } } {
  const H = spec.height ?? 160; const k = pose.scale ?? 1; const face = pose.facing ?? 1; const lw = (spec.lineWeight ?? 3.2);
  const headR = H * (spec.headRatio ?? .56) / 2; const P = spec.palette; const light = spec.light ?? 225; const medium = spec.medium ?? 'gouache';
  const M = compose(rotate(pose.lean ?? 0, { x: 0, y: 0 }), scale(face * k, k), translate(pose.x, pose.y));
  const T = (p: CompoundPath) => transformPath(p, M);
  const tp = (v: Vec) => { const q = transformPath({ fillRule: 'nonzero', subpaths: [{ closed: false, anchors: [{ x: v.x, y: v.y }] }] }, M).subpaths[0].anchors[0]; return { x: q.x, y: q.y }; };
  const bodyH = H * .62; const headC = { x: H * .04, y: -bodyH - headR * .62 };
  return s.group(spec.name, () => {
    if (pose.shadow !== false) contactShadow(s, pose.x, pose.y + 2 * k, H * .62 * k, H * .1 * k);
    // legs (behind body): tapered strokes
    const spread = (pose.legSpread ?? .18) * H, step = (pose.step ?? 0) * H;
    for (const side of [-1, 1]) {
      const hip = { x: side * spread * .5, y: -bodyH * .12 }; const foot = { x: side * spread * .7 + (side > 0 ? step : -step) * .5, y: 0 };
      const leg = smoothThrough([hip, { x: (hip.x + foot.x) / 2 + side * 2, y: -bodyH * .06 }, foot], false);
      s.ink(T(leg), shade(P.body, -.12), lw * 3.4 * k, (u: number) => 1 - u * .25, { label: `${spec.name} leg` });
      s.fill(T(ellipseAt(foot.x + H * .04, foot.y - H * .015, H * .085, H * .04)), shade(P.body, -.2), { label: `${spec.name} foot` });
    }
    // tail
    if (spec.tail && spec.tail !== 'none') {
      const base = { x: -H * .24, y: -bodyH * .3 };
      if (spec.tail === 'fluffy') painted(s, T(leaf(base, { x: -H * .62, y: -bodyH * .78 }, { width: .62, bend: .2, seed: spec.seed })), P.accent ?? shade(P.body, .06), { light, medium, label: `${spec.name} tail`, ink: P.ink, inkWidth: lw * .8 * k, highlight: .3, shadow: .4 });
      else s.ink(T(smoothThrough([base, { x: -H * .45, y: -bodyH * .4 }, { x: -H * .52, y: -bodyH * .75 }], false)), P.body, lw * 2.6 * k, PROFILES.tail, { label: `${spec.name} tail` });
    }
    // body
    const body = bodyShape(spec, bodyH);
    painted(s, T(body), P.body, { light, medium, ink: P.ink, inkWidth: lw * k, label: `${spec.name} body`, seed: spec.seed });
    if (P.belly) s.fill(T(boolean('intersect', [ellipseAt(H * .05, -bodyH * .36, bodyH * .26, bodyH * .3), body])), P.belly, { opacity: .92, material: s.material(medium === 'flat' ? 'paper' : medium), label: `${spec.name} belly` });
    // arms: shoulder → hand; angle in degrees outward from hanging straight down (90 = horizontal, 160 = raised)
    const shoulder = (side: number) => ({ x: side * bodyH * .3 + H * .02, y: -bodyH * .7 });
    for (const [side, ang] of [[-1, pose.armL ?? 15], [1, pose.armR ?? 15]] as Array<[number, number]>) {
      const sh = shoulder(side); const len = H * .3; const r = ang * Math.PI / 180;
      const hand = { x: sh.x + Math.sin(r) * len * side, y: sh.y + Math.cos(r) * len };
      const elbow = { x: (sh.x + hand.x) / 2 + side * H * .03, y: (sh.y + hand.y) / 2 };
      s.ink(T(smoothThrough([sh, elbow, hand], false)), shade(P.body, -.05), lw * 3 * k, (u: number) => 1 - u * .3, { label: `${spec.name} arm` });
      s.fill(T(circlePath(hand.x, hand.y, H * .04)), shade(P.body, -.08), { label: `${spec.name} hand` });
    }
    // ears (behind head)
    const ears = spec.ears ?? 'round';
    for (const side of [-1, 1]) {
      const base = { x: headC.x + side * headR * .55, y: headC.y - headR * .62 };
      let ear: CompoundPath | null = null;
      if (ears === 'round') ear = circlePath(base.x + side * headR * .12, base.y - headR * .18, headR * .32);
      else if (ears === 'pointy') ear = leaf({ x: base.x - side * headR * .2, y: base.y + headR * .15 }, { x: base.x + side * headR * .32, y: base.y - headR * .62 }, { width: .7, bend: 0, tipSharp: .2 });
      else if (ears === 'floppy') ear = leaf({ x: base.x, y: base.y + headR * .1 }, { x: base.x + side * headR * .62, y: base.y + headR * .72 }, { width: .55, bend: .1 });
      if (ear) painted(s, T(ear), ears === 'floppy' ? shade(P.body, -.1) : P.body, { light, medium, ink: P.ink, inkWidth: lw * .8 * k, label: `${spec.name} ear`, highlight: .2 });
      if (ear && ears !== 'floppy' && P.cheek) s.fill(T(transformPath(ear, compose(translate(-base.x, -base.y), scale(.55), translate(base.x, base.y + headR * .02)))), mix(P.cheek, P.body, .3), { opacity: .7, label: `${spec.name} inner ear` });
    }
    // head
    // a soft "squircle-ish" head: wider cheeks, slightly flatter crown (8 anchors → round, never polygonal)
    const head = smoothThrough([0, 45, 90, 135, 180, 225, 270, 315].map(d => { const a = d * Math.PI / 180; const k = Math.sin(a) > 0 ? 1 + .06 * Math.sin(a) : 1 - .05 * Math.abs(Math.sin(a)); return { x: headC.x + Math.cos(a) * headR * 1.04 * k, y: headC.y + Math.sin(a) * headR * .92 * k }; }), true, .5);
    painted(s, T(head), P.body, { light, medium, ink: P.ink, inkWidth: lw * k, label: `${spec.name} head`, seed: (spec.seed ?? 1) + 3 });
    // face
    const ex = pose.expression ?? {}; const look = pose.look ?? { x: .15, y: 0 };
    const eyeY = headC.y - headR * .02, eyeDx = headR * .36, fx = headC.x + headR * .12;
    for (const side of [-1, 1]) {
      const ec = { x: fx + side * eyeDx, y: eyeY }; const er = headR * .13;
      const eyes = ex.eyes ?? 'open';
      if (eyes === 'closed' || eyes === 'sleepy') s.ink(T(smoothThrough([{ x: ec.x - er, y: ec.y }, { x: ec.x, y: ec.y + er * (eyes === 'sleepy' ? .25 : .6) }, { x: ec.x + er, y: ec.y }], false)), P.ink, lw * 1.1 * k, PROFILES.ink, { label: `${spec.name} eye` });
      else if (eyes === 'happy') s.ink(T(smoothThrough([{ x: ec.x - er, y: ec.y + er * .3 }, { x: ec.x, y: ec.y - er * .7 }, { x: ec.x + er, y: ec.y + er * .3 }], false)), P.ink, lw * 1.1 * k, PROFILES.ink, { label: `${spec.name} eye` });
      else {
        const rr = eyes === 'wide' ? er * 1.25 : er;
        s.fill(T(ellipseAt(ec.x + look.x * er * .5, ec.y + look.y * er * .5, rr * .82, rr * 1.08)), P.eye ?? P.ink, { label: `${spec.name} eye` });
        s.fill(T(circlePath(ec.x + look.x * er * .5 + rr * .28, ec.y + look.y * er * .5 - rr * .38, rr * .3)), '#ffffff', { opacity: .95, label: `${spec.name} eye glint` });
      }
      if (ex.brows !== undefined) { const by = ec.y - headR * .3; const tilt = ex.brows * headR * .08 * side; s.ink(T(smoothThrough([{ x: ec.x - er * 1.1, y: by + tilt }, { x: ec.x + er * 1.1, y: by - tilt }], false)), P.ink, lw * .9 * k, PROFILES.taper, { label: `${spec.name} brow` }); }
    }
    if (ex.blush !== false && P.cheek) for (const side of [-1, 1]) s.fill(T(ellipseAt(fx + side * eyeDx * 1.35, eyeY + headR * .3, headR * .16, headR * .1)), P.cheek, { opacity: .55, blur: headR * .05 * k, label: `${spec.name} cheek` });
    // nose + mouth
    s.fill(T(ellipseAt(fx, eyeY + headR * .2, headR * .09, headR * .065)), P.ink, { label: `${spec.name} nose` });
    const my = eyeY + headR * .38; const mw = headR * .26; const mouth = ex.mouth ?? 'smile';
    if (mouth === 'open' || mouth === 'o' || mouth === 'grin') {
      const m = mouth === 'o' ? ellipseAt(fx, my + headR * .04, mw * .32, mw * .4) : smoothThrough([{ x: fx - mw, y: my - mw * .1 }, { x: fx + mw, y: my - mw * .1 }, { x: fx, y: my + mw * (mouth === 'grin' ? .55 : .8) }], true, .45);
      s.fill(T(m), shade(P.ink, .12), { label: `${spec.name} mouth` });
      if (mouth !== 'o') s.fill(T(boolean('intersect', [ellipseAt(fx, my + mw * .55, mw * .45, mw * .28), m])), mix(P.cheek ?? '#e66', '#ff8a8a', .4), { label: `${spec.name} tongue` });
    } else {
      const curve = mouth === 'flat' ? 0 : mouth === 'frown' ? -.35 : .45;
      s.ink(T(smoothThrough([{ x: fx - mw, y: my }, { x: fx, y: my + mw * curve }, { x: fx + mw, y: my }], false)), P.ink, lw * 1.05 * k, PROFILES.ink, { label: `${spec.name} mouth` });
    }
    const hc = tp(headC); const top = tp({ x: 0, y: -bodyH - headR * 1.7 });
    return { head: hc, bounds: { x: pose.x - H * .5 * k, y: top.y, w: H * k, h: pose.y - top.y } };
  });
}
