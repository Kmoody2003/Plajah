// storyBoardKit — helpers for the board book "Hello, Colors!" (story-board).
// Medium: BOLD PRIMARY SHAPES. Pure red / blue / yellow plus black and white, one
// uniform thick black outline, perfectly simple geometry, a rounded cut-edge frame.
import type { TelaVectorObject } from '../../../../types';
import { rect, circle, ellipse, text } from '../../templateKit';
import { shape, poly, stroke, arcPts, letterRow, measureRow, BUNGEE_ADV, type Pt } from './kidsArtC';

type O = TelaVectorObject;
export const BB = { red: '#E4141C', blue: '#1649E0', yel: '#FFD200', ink: '#111111', white: '#FFFFFF' };
export const BW = 576;
export const OL = 14; // the one outline weight used on every shape in the book

/** Board-book page: outer colour (the card edge), a black cut edge, then the coloured page face. */
export function boardFrame(outer: string, inner: string): O[] {
  return [
    rect(0, 0, BW, BW, outer, { role: 'GROUND', label: 'Board edge colour' }),
    rect(8, 8, BW - 16, BW - 16, BB.ink, { rx: 84, label: 'Board cut edge' }),
    rect(22, 22, BW - 44, BW - 44, inner, { rx: 70, label: 'Page face' }),
  ];
}

/** ONE huge word, every letter its own editable object, thick black outline. */
export function bigWord(str: string, edge: number, colors: string[], o: { size?: number; maxW?: number; cx?: number; seed?: number; anchor?: 'top' | 'bottom' } = {}): O[] {
  let size = o.size ?? 110; const maxW = o.maxW ?? 470;
  while (measureRow(str, size, BUNGEE_ADV, 0) > maxW && size > 40) size -= 4;
  // Bungee caps sit between .28 and 1.0 of the font size below the box top: place by the visible cap edge.
  const y = o.anchor === 'top' ? edge - .28 * size : edge - size;
  return letterRow(str, o.cx ?? BW / 2, y, { font: 'bungee', adv: BUNGEE_ADV, size, colors, stroke: BB.ink, sw: colors.every(c => c === BB.ink) ? 0 : Math.round(size * .17), align: 'center', seed: o.seed ?? 3, label: 'Board word' }).objs;
}

/** Chunky 'point to it' arrow. tip = where it points; angle in degrees (0 = pointing right). */
export function arrow(tipX: number, tipY: number, len: number, angle: number, fill = BB.ink, edge = BB.white): O {
  const a = angle * Math.PI / 180; const c = Math.cos(a), s = Math.sin(a);
  const loc: Pt[] = [[0, 0], [-46, -40], [-46, -19], [-len, -19], [-len, 19], [-46, 19], [-46, 40]];
  return poly(loc.map(([x, y]) => [tipX + x * c - y * s, tipY + x * s + y * c] as Pt), fill, { stroke: edge, strokeWidth: 8, label: 'Point-to-it arrow' });
}
/** A 'touch here' ring. */
export function tapRing(x: number, y: number, r = 40): O[] {
  return [circle(x, y, r, BB.white, { stroke: BB.ink, strokeWidth: 12, label: 'Touch ring' }), circle(x, y, r * .3, BB.ink, { label: 'Touch dot' })];
}
/** White hard shine. */
export const shine = (cx: number, cy: number, r: number, a0: number, a1: number, w = 20): O => stroke(arcPts(cx, cy, r, r, a0, a1, 12), BB.white, w, { label: 'Shine' });

/** Two dot eyes + a smile (+ optional cheeks): the whole face language of the book. */
export function face(cx: number, cy: number, s: number, o: { cheeks?: boolean; eyeGap?: number; smile?: number } = {}): O[] {
  const g = (o.eyeGap ?? .5) * s;
  const out: O[] = [
    ellipse(cx - g - .1 * s, cy - .17 * s, .2 * s, .28 * s, BB.ink, { label: 'Eye' }),
    ellipse(cx + g - .1 * s, cy - .17 * s, .2 * s, .28 * s, BB.ink, { label: 'Eye' }),
    ellipse(cx - g - .03 * s, cy - .14 * s, .07 * s, .09 * s, BB.white, { label: 'Eye shine' }),
    ellipse(cx + g - .03 * s, cy - .14 * s, .07 * s, .09 * s, BB.white, { label: 'Eye shine' }),
    stroke(arcPts(cx, cy + .02 * s, (o.smile ?? .4) * s, (o.smile ?? .4) * s * .8, 25, 155, 14), BB.ink, OL, { label: 'Smile' }),
  ];
  if (o.cheeks) out.push(circle(cx - g * 1.55, cy + .2 * s, .13 * s, BB.red, { label: 'Cheek' }), circle(cx + g * 1.55, cy + .2 * s, .13 * s, BB.red, { label: 'Cheek' }));
  return out;
}

// ── the giant objects ─────────────────────────────────────────────────────────
/** Union of circles drawn as one outlined silhouette: fat strokes first, then clean fills on top. */
export function blobOfCircles(parts: Array<[number, number, number]>, fill: string, label: string): O[] {
  const out: O[] = [];
  for (const [x, y, r] of parts) out.push(circle(x, y, r, fill, { stroke: BB.ink, strokeWidth: OL * 2, label: label + ' outline' }));
  for (const [x, y, r] of parts) out.push(circle(x, y, r, fill, { label }));
  return out;
}

export function apple(cx: number, cy: number, R: number, body: string, leaf: string): O[] {
  const parts: Array<[number, number, number]> = [[cx - .36 * R, cy + .04 * R, .7 * R], [cx + .36 * R, cy + .04 * R, .7 * R], [cx, cy + .3 * R, .64 * R]];
  const out: O[] = [];
  out.push(poly([[cx - 12, cy - .5 * R], [cx + 12, cy - .5 * R], [cx + 28, cy - 1.0 * R], [cx + 4, cy - 1.0 * R]], BB.ink, { stroke: BB.ink, strokeWidth: OL, label: 'Stem' }));
  out.push(poly([[cx + 22, cy - .86 * R], [cx + .42 * R, cy - 1.1 * R], [cx + .68 * R, cy - .86 * R], [cx + .4 * R, cy - .72 * R]], leaf, { stroke: BB.ink, strokeWidth: OL, label: 'Leaf' }));
  out.push(...blobOfCircles(parts, body, 'Apple'));
  out.push(shine(parts[0][0], parts[0][1], .5 * R, 200, 262));
  return out;
}

export function fish(cx: number, cy: number, W: number, body: string, fin: string): O[] {
  const bx = cx - .08 * W, rx = .36 * W, ry = .32 * W;
  const out: O[] = [];
  out.push(poly([[cx + .2 * W, cy], [cx + .5 * W, cy - .27 * W], [cx + .5 * W, cy + .27 * W]], fin, { stroke: BB.ink, strokeWidth: OL, label: 'Tail' }));
  out.push(poly([[bx - .2 * W, cy - .2 * W], [bx - .02 * W, cy - .46 * W], [bx + .16 * W, cy - .2 * W]], fin, { stroke: BB.ink, strokeWidth: OL, label: 'Top fin' }));
  out.push(ellipse(bx - rx, cy - ry, rx * 2, ry * 2, body, { stroke: BB.ink, strokeWidth: OL, label: 'Fish body' }));
  out.push(stroke(arcPts(bx - .06 * W, cy, .2 * W, .2 * W, -50, 50, 10), BB.white, 18, { label: 'Scale stripe' }), stroke(arcPts(bx + .08 * W, cy, .2 * W, .2 * W, -50, 50, 10), BB.white, 18, { label: 'Scale stripe' }));
  out.push(circle(bx - .22 * W, cy - .08 * W, .065 * W, BB.white, { stroke: BB.ink, strokeWidth: 10, label: 'Eye' }), circle(bx - .21 * W, cy - .07 * W, .03 * W, BB.ink, { label: 'Pupil' }));
  out.push(stroke(arcPts(bx - .2 * W, cy + .06 * W, .1 * W, .09 * W, 25, 115, 8), BB.ink, 12, { label: 'Smile' }));
  return out;
}

export function sun(cx: number, cy: number, R: number, fill: string, rays: number, cheek: string): O[] {
  const out: O[] = []; const disc = R * .7;
  for (let i = 0; i < rays; i++) {
    const a = (i * 360 / rays - 90) * Math.PI / 180, w = (Math.PI / rays) * .62;
    out.push(poly([[cx + (disc - 14) * Math.cos(a - w), cy + (disc - 14) * Math.sin(a - w)], [cx + R * Math.cos(a), cy + R * Math.sin(a)], [cx + (disc - 14) * Math.cos(a + w), cy + (disc - 14) * Math.sin(a + w)]], fill, { stroke: BB.ink, strokeWidth: OL, label: 'Ray' }));
  }
  out.push(circle(cx, cy, disc, fill, { stroke: BB.ink, strokeWidth: OL, label: 'Sun disc' }));
  out.push(...face(cx, cy + .02 * disc, disc * .95, { cheeks: true }).map(o => (o.objectLabel === 'Cheek' ? { ...o, fill: cheek } : o)));
  return out;
}

export function dot(cx: number, cy: number, r: number, fill: string, num: string, numFill = BB.white): O[] {
  const plain = numFill === BB.ink;
  const t = text(cx - r, cy - r * .62, r * 2, num, { size: r * 1.15, font: 'bungee', weight: 400, color: numFill, stroke: plain ? undefined : BB.ink, strokeWidth: plain ? 0 : Math.max(10, r * .12), align: 'center', wrap: false, label: 'Count numeral', role: 'HEADLINE' });
  return [circle(cx, cy, r, fill, { stroke: BB.ink, strokeWidth: OL, label: 'Count dot' }), shine(cx, cy, r * .66, 195, 255, 16), t];
}

export function ball(cx: number, cy: number, R: number, body: string, band: string): O[] {
  const h = R * .3, a1 = Math.asin(h / R) * 180 / Math.PI;
  const pts: Pt[] = [...arcPts(cx, cy, R, R, -a1, a1, 10), ...arcPts(cx, cy, R, R, 180 - a1, 180 + a1, 10)];
  return [
    circle(cx, cy, R, body, { stroke: BB.ink, strokeWidth: OL, label: 'Ball' }),
    poly(pts, band, { stroke: BB.ink, strokeWidth: OL, label: 'Ball band' }),
    shine(cx, cy, R * .78, 205, 255, 22),
    circle(cx, cy, R * .13, BB.ink, { label: 'Ball valve' }),
  ];
}

export function star5(cx: number, cy: number, R: number, fill: string, inner = .5): O {
  const pts: Pt[] = []; for (let i = 0; i < 10; i++) { const a = (i * 36 - 90) * Math.PI / 180, r = i % 2 ? R * inner : R; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return poly(pts, fill, { stroke: BB.ink, strokeWidth: OL, label: 'Star' });
}

export function heart(cx: number, cy: number, S: number, fill: string): O {
  const pts: Pt[] = []; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2; pts.push([cx + S * 16 * Math.pow(Math.sin(t), 3), cy - S * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + S * 1.6]); }
  return poly(pts, fill, { stroke: BB.ink, strokeWidth: OL, label: 'Heart' });
}

export function bullseye(cx: number, cy: number, R: number, rings: number): O[] {
  const out: O[] = []; const step = R / rings;
  for (let i = 0; i < rings; i++) out.push(circle(cx, cy, R - i * step, i % 2 ? BB.white : BB.ink, { stroke: i === 0 ? BB.ink : undefined, strokeWidth: i === 0 ? 8 : 0, label: i % 2 ? 'White ring' : 'Black ring' }));
  return out;
}

export { shape, text, rect, circle, ellipse };
