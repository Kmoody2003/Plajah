// paintStyle — painterly rendering recipes that turn ONE shape into a small, coherent
// stack of objects (what a painter does in layers), generalising watercolorKit/feltKit
// onto the geometry engine:
//
//   painted(): underpainting bleed → body (material) → form shadow (clipped, multiply)
//              → light (clipped, screen/soft) → rim accent → optional ink contour.
//   brushStroke(): a tapered variable-width stroke with bristle streaks and dry-brush gaps.
//   wash(): a transparent watercolour wash (graded, bled edge, darker wet rim, granulation).
//
// Shadow and light shapes are computed GEOMETRICALLY (offset copies intersected with the
// form) so the editor shows them exactly; materials add the medium on top.
import type { Vec } from '../vec';
import type { CompoundPath } from '../model';
import type { Scene, Finish } from '../scene';
import { pathBounds } from '../bezier';
import { transformPath, translate, scale as scaleM, compose } from '../transform';
import { boolean } from '../boolean';
import { offsetPath } from '../offset';
import { variableStroke, PROFILES, type WidthProfile } from '../stroke';
import { shade, mix, hueShift, withAlpha } from '../color';
import { linear, radial, linearAcross } from '../paint';
import { rough, wobbleOutline } from './rough';
import { blob, leaf } from './organic';
import { Random } from './random';
import { smoothThrough, circlePath } from '../shapes';
import { containsPoint } from '../boolean';

export interface PaintedOpts {
  /** Light direction in degrees (where the light comes FROM; 225 = upper-left on screen). */
  light?: number;
  /** Medium for the body. */ medium?: 'gouache' | 'watercolor' | 'crayon' | 'felt' | 'flat' | 'linocut' | 'riso' | 'chalk';
  /** 0..1 strength of the form shadow. */ shadow?: number;
  /** 0..1 strength of the light. */ highlight?: number;
  /** Ink contour colour (none = no line). */ ink?: string; inkWidth?: number;
  /** Hand-drawn wobble on the contour. */ sketchy?: boolean;
  /** Shift shadows toward cool and lights toward warm (painterly colour temperature). */ temperature?: number;
  label?: string; seed?: number | string; bleed?: boolean;
}

/** Paint one shape the way an illustrator would: body, form shadow, light, accent, ink. */
export function painted(s: Scene, shape: CompoundPath, color: string, o: PaintedOpts = {}) {
  const R = new Random(o.seed ?? s.random.int(0, 1e6)); const b = pathBounds(shape); const size = Math.max(b.w, b.h);
  const la = (o.light ?? 225) * Math.PI / 180; const lx = Math.cos(la), ly = Math.sin(la);
  const temp = o.temperature ?? .6; const medium = o.medium ?? 'gouache'; const label = o.label ?? 'Painted';
  const shadowCol = hueShift(shade(color, -.16), -14 * temp, 1 + .1 * temp), lightCol = hueShift(shade(color, .12), 10 * temp, .9);
  return s.group(label, () => {
    if (o.bleed && medium === 'watercolor') s.fill(offsetPath(shape, Math.max(2, size * .015), 'round'), withAlpha(color, .35), { blur: Math.max(2, size * .02), blend: 'multiply', label: `${label} bleed` });
    // big areas get calm paint (streaks/mottle read as noise at scale); small ones get more texture
    const big = size > 220;
    const params: Record<string, number> | undefined = medium === 'watercolor' ? { edge: Math.max(4, Math.min(12, size * .03)) } : medium === 'gouache' ? { streak: big ? 0 : .04, mottle: big ? .05 : .09, edge: big ? 2 : 3 } : undefined;
    const mat = medium === 'flat' ? undefined : s.material(medium, params);
    // body: a soft gradient along the light direction (light side lighter)
    const body = linearAcross(b, (o.light ?? 225) + 180, [[0, mix(color, lightCol, .35)], [.55, color], [1, mix(color, shadowCol, .45)]]);
    s.fill(shape, body, { material: mat, label: `${label} body`, blend: medium === 'watercolor' ? 'multiply' : undefined, opacity: medium === 'watercolor' ? .9 : 1 });
    // form shadow: the shape minus a copy shifted toward the light, softened
    const sh = o.shadow ?? .55;
    if (sh > 0) {
      const d = size * .16; const moved = transformPath(shape, translate(lx * d, ly * d));
      const core = boolean('subtract', [shape, moved]);
      if (core.subpaths.length) s.fill(core, shadowCol, { opacity: .55 * sh, blend: 'multiply', blur: Math.max(1.2, size * .03), label: `${label} form shadow` });
      // occlusion along the far edge (a thin darker band)
      const occ = boolean('subtract', [shape, offsetPath(shape, -Math.max(1.5, size * .035), 'round')]);
      if (occ.subpaths.length) s.fill(occ, shade(shadowCol, -.08), { opacity: .22 * sh, blend: 'multiply', blur: Math.max(1, size * .015), label: `${label} occlusion` });
    }
    // light: a soft blob near the lit side, clipped to the shape
    const hl = o.highlight ?? .5;
    if (hl > 0) {
      const c = { x: b.x + b.w / 2 + lx * b.w * .22, y: b.y + b.h / 2 + ly * b.h * .22 };
      const spot = boolean('intersect', [blob(c.x, c.y, b.w * .26, b.h * .2, { seed: R.int(0, 1e5), wobble: .2, rot: (o.light ?? 225) + 90 }), shape]);
      if (spot.subpaths.length) s.fill(spot, radial(c.x, c.y, Math.max(b.w, b.h) * .3, [[0, lightCol, .8 * hl], [1, lightCol, 0]]), { blur: Math.max(1, size * .02), label: `${label} light` });
    }
    if (o.ink) {
      const w = o.inkWidth ?? Math.max(1.2, size * .012);
      if (o.sketchy) s.ink(rough(shape, { roughness: w * .5, seed: R.int(0, 1e5), overshoot: w * 1.5, lift: true }), o.ink, w, PROFILES.ink, { label: `${label} ink`, material: s.material('ink') });
      else { const ph = R.float(0, 6); s.ink(shape, o.ink, w, (u: number) => .6 + .4 * Math.sin(u * Math.PI * 5 + ph) ** 2, { label: `${label} ink` }); }
    }
  });
}

/** A transparent watercolour wash (one object with the watercolour material + optional granulation via material). */
export function wash(s: Scene, shape: CompoundPath, color: string, o: { angle?: number; fade?: number; edge?: number; seed?: number; opacity?: number; label?: string } = {}) {
  const b = pathBounds(shape);
  const g = linearAcross(b, o.angle ?? 90, [[0, color, (o.opacity ?? .85)], [1, color, (o.opacity ?? .85) * (1 - (o.fade ?? .45))]]);
  return s.fill(wobbleOutline(shape, Math.max(1, Math.min(4, Math.max(b.w, b.h) * .01)), o.seed ?? 1), g, { material: s.material('watercolor', { edge: o.edge ?? Math.max(5, Math.min(14, Math.max(b.w, b.h) * .03)) }, o.seed), blend: 'multiply', label: o.label ?? 'Wash' });
}

export interface BrushOpts { width: number; profile?: WidthProfile; color: string; streaks?: number; dry?: number; seed?: number | string; label?: string; opacity?: number; blend?: Finish['blend'] }
/** A loaded-brush stroke along a spine: tapered body + bristle streaks + dry-brush breakup. */
export function brushStroke(s: Scene, spine: CompoundPath, o: BrushOpts) {
  const R = new Random(o.seed ?? 1); const prof = o.profile ?? PROFILES.brush; const label = o.label ?? 'Brush stroke';
  return s.group(label, () => {
    s.fill(variableStroke(spine, { width: o.width, profile: prof, wobble: .35, seed: R.int(0, 1e4) }), o.color, { material: o.dry ? s.material('crayon', { coverage: 1 - o.dry * .5, tooth: .35, edge: 2 }) : s.material('gouache', { edge: 2.2 }), opacity: o.opacity, blend: o.blend, label: `${label} body` });
    const n = o.streaks ?? 3;
    for (let i = 0; i < n; i++) {
      const off = (R.float(-.32, .32)) * o.width; const k = R.float(.25, .5);
      const sp = transformPath(spine, translate(-off * .0, 0));
      const streak = variableStroke(sp, { width: o.width * .12, profile: (u: number) => { const base = typeof prof === 'function' ? (prof(u) as number) : 1; return Math.max(0, base * (u > k * .3 && u < 1 - k * .2 ? 1 : 0)); }, seed: R.int(0, 1e4) });
      s.fill(transformPath(streak, translate(off * .35, off * .35)), i % 2 ? shade(o.color, .14) : shade(o.color, -.12), { opacity: .45, blend: i % 2 ? undefined : 'multiply', label: `${label} streak` });
    }
  });
}

/** Simple soft cast shadow ellipse under an object. */
export function contactShadow(s: Scene, cx: number, cy: number, w: number, h: number, color = '#2a1e3a', strength = .35) {
  return s.fill(smoothThrough([{ x: cx - w / 2, y: cy }, { x: cx, y: cy - h / 2 }, { x: cx + w / 2, y: cy }, { x: cx, y: cy + h / 2 }], true), radial(cx, cy, w / 2, [[0, color, strength], [.6, color, strength * .5], [1, color, 0]]), { blend: 'multiply', label: 'Contact shadow', role: 'ORNAMENT' });
}
export { linear, radial, compose, scaleM };

export interface FoliageOpts { light?: number; colors?: { dark: string; mid: string; light: string; ink?: string }; seed?: number | string; leaves?: number; label?: string; leafSize?: number }
/**
 * Foliage the way a painter builds a tree crown: a dark base mass, mid-value clusters
 * pushed toward the light, lit clusters on top, a scatter of leaf dabs densest on the lit
 * side, a few dark gaps, and a loose ink contour. All clusters are clipped to the crown.
 */
export function foliage(s: Scene, crown: CompoundPath, o: FoliageOpts = {}) {
  const R = new Random(o.seed ?? 1); const b = pathBounds(crown); const la = (o.light ?? 225) * Math.PI / 180; const lx = Math.cos(la), ly = Math.sin(la);
  const C = o.colors ?? { dark: '#2f6b3a', mid: '#4f9a4a', light: '#9fd27a', ink: '#24452a' }; const label = o.label ?? 'Foliage';
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2; const r = Math.max(b.w, b.h) / 2;
  return s.group(label, () => {
    s.fill(crown, linearAcross(b, (o.light ?? 225) + 180, [[0, C.mid], [.6, C.dark], [1, shade(C.dark, -.06)]]), { material: s.material('gouache', { streak: 0, mottle: .07, edge: 2.5 }), label: `${label} mass` });
    s.clip(crown, () => {
      // scalloped leaf clusters (unions of small circles, like a painter's leaf masses): mid, then lit
      const cluster = (x: number, y: number, rr: number) => { const cs = [circlePath(x, y, rr * .62)]; const k = R.int(4, 6); for (let j = 0; j < k; j++) { const a = j / k * Math.PI * 2 + R.jit(.3); cs.push(circlePath(x + Math.cos(a) * rr * .55, y + Math.sin(a) * rr * .42, rr * R.float(.3, .42))); } return boolean('union', cs); };
      for (let i = 0; i < 9; i++) { const t = R.float(-.1, 1); const x = cx + lx * r * .5 * t + R.jit(r * .5), y = cy + ly * r * .5 * t + R.jit(r * .38); s.fill(cluster(x, y, r * R.float(.2, .3)), mix(C.dark, C.mid, R.float(.55, 1)), { opacity: .95, material: s.material('gouache', { streak: 0, mottle: .08, edge: 2 }), label: `${label} cluster` }); }
      for (let i = 0; i < 6; i++) { const x = cx + lx * r * R.float(.3, .65) + R.jit(r * .25), y = cy + ly * r * R.float(.3, .65) + R.jit(r * .2); s.fill(cluster(x, y, r * R.float(.12, .19)), mix(C.mid, C.light, R.float(.45, .8)), { opacity: .9, material: s.material('gouache', { streak: 0, mottle: .08, edge: 2 }), label: `${label} light` }); }
      for (let i = 0; i < 5; i++) { const x = cx - lx * r * R.float(.1, .55) + R.jit(r * .3), y = cy - ly * r * R.float(.1, .5) + R.jit(r * .2); s.fill(blob(x, y, r * R.float(.04, .08), r * R.float(.03, .06), { seed: R.int(0, 1e5) }), shade(C.dark, -.12), { opacity: .6, blur: .8, label: `${label} gap` }); }
    });
    // leaf dabs (some breaking the silhouette)
    const n = o.leaves ?? 70; const ls = o.leafSize ?? r * .085;
    for (let i = 0; i < n; i++) {
      const a = R.float(0, Math.PI * 2), d = Math.sqrt(R.next()) * r; const x = cx + Math.cos(a) * d * b.w / (2 * r), y = cy + Math.sin(a) * d * b.h / (2 * r);
      if (!containsPoint(crown, { x, y })) continue;
      const lit = ((x - cx) * lx + (y - cy) * ly) / r; if (R.next() > .35 + lit * .6) continue;
      const ang = R.float(-2.4, -.7); const len = ls * R.float(.8, 1.3);
      s.fill(leaf({ x, y }, { x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len }, { width: .55, seed: i }), lit > .2 ? mix(C.light, '#ffffff', R.float(0, .2)) : C.mid, { opacity: .92, label: `${label} leaf` });
    }
    if (C.ink) s.ink(rough(crown, { roughness: 1.2, seed: R.int(0, 1e5), overshoot: 3, lift: true }), C.ink, 2, PROFILES.ink, { opacity: .8, label: `${label} ink` });
  });
}
