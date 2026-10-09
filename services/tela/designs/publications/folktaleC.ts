// folktaleC — "The Golden Thread" (story-folktale): folk papercut / block print.
// Shape language: 45-degree triangles + mirror symmetry + ornament borders.
// One light source: the gold thread, which runs unbroken through every page
// (page i enters at FT[i] and leaves at FT[i+1]).
import type { TelaVectorObject } from '../../../../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import { rect, ellipse, circle, text, alpha, mix } from '../../templateKit';
import * as orn from '../../ornaments';
import {
  PW, PH, shape, poly, tri, rectsObj, arcPts, stroke, dots, speckle, letterRow, textOnPath, measureRow, polylineLength,
  eye, smile, blush, ALMENDRA_ADV, ANDIKA_ADV, type Pt,
} from './kidsArtC';
import { fitText } from './showcaseFit';
import { showcaseByTemplate } from '../../../../data/showcase';

type O = TelaVectorObject;
const lin = (angle: number, ...s: Array<[number, string, number?]>) => ({ kind: 'LINEAR' as const, angle, stops: s.map(([offset, color, opacity]) => (opacity === undefined ? { offset, color } : { offset, color, opacity })) });

const FK = { wine: '#5A1230', wineD: '#33091B', crim: '#D4262B', saff: '#F28C1B', gold: '#FFC928', goldL: '#FFE27A', teal: '#0E6B73', tealD: '#0A3F4A', tealL: '#2FB4A8', ivory: '#F6ECD4', skin: '#D9965B', hair: '#2A0F1E' };
const PSH = { x: 0, y: 5, blur: 6, color: alpha('#33091B', .5) };
/** Height of the gold thread where it crosses each page boundary: page i ENTERS at FT[i] and LEAVES at FT[i+1], so it is one unbroken line from cover to back. */
const FT = [430, 350, 655, 560, 450, 470, 540, 640, 330, 690, 680, 600, 690, 700, 650];

function catmull(ctrl: Pt[], seg = 14): Pt[] {
  const out: Pt[] = []; const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) for (let k = 0; k < seg; k++) {
    const t = k / seg, t2 = t * t, t3 = t2 * t; const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const f = (a: number, b: number, c: number, d: number) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  out.push(ctrl[ctrl.length - 1]); return out;
}
function threadPts(i: number, amp = 60, freq = 1, phase = 0): Pt[] {
  const a = FT[i], b = FT[i + 1], n = 96; const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) { const t = k / n; const base = a + (b - a) * (t * t * (3 - 2 * t)); pts.push([t * PW, base + amp * Math.sin(Math.PI * t) * Math.sin(freq * Math.PI * 2 * t + phase)]); }
  return pts;
}
const yAt = (pts: Pt[], x: number) => { let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; };
/** The gold thread: a soft glow, the spun thread, its twist, a highlight. */
function thread(pts: Pt[], w = 8): O[] {
  return [
    stroke(pts, FK.gold, w * 3.4, { opacity: .32, blur: 9, label: 'Thread glow' }),
    stroke(pts, FK.gold, w, { label: 'Golden thread' }),
    stroke(pts, FK.saff, w, { dash: [2.5, 8], opacity: .9, label: 'Thread twist' }),
    stroke(pts.map(p => [p[0], p[1] - w * .22] as Pt), FK.goldL, w * .28, { opacity: .9, label: 'Thread highlight' }),
  ];
}
const sparkle = (cx: number, cy: number, r: number, fill = FK.gold): O => poly(Array.from({ length: 8 }, (_, i) => { const a = (i * 45 - 90) * Math.PI / 180; const rad = i % 2 ? r * .3 : r; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as Pt; }), fill, { label: 'Star' });
const rays = (cx: number, cy: number, r0: number, r1: number, n: number, color: string, phase = 0, wide = .5): O => shape(Array.from({ length: n }, (_, i) => { const a0 = (phase + i * 360 / n) * Math.PI / 180, a1 = (phase + (i + wide) * 360 / n) * Math.PI / 180; return [[cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0)], [cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)], [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1)], [cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1)]] as Pt[]; }), color, { label: 'Rays' });

/** Saw-tooth border of 45-degree triangles. */
function sawBand(x: number, y: number, w: number, h: number, fill: string, flip = false, teeth?: number): O {
  const n = teeth ?? Math.max(2, Math.round(w / (h * 1.1))); const tw = w / n; const subs: Pt[][] = [];
  for (let i = 0; i < n; i++) subs.push(flip ? [[x + i * tw, y], [x + (i + 1) * tw, y], [x + (i + .5) * tw, y + h]] : [[x + i * tw, y + h], [x + (i + .5) * tw, y], [x + (i + 1) * tw, y + h]]);
  return shape(subs, fill, { label: 'Triangle border' });
}
/** Diamond chain with a bead between each pair. */
function diamondBand(x: number, y: number, w: number, h: number, fill: string, bead: string): O[] {
  const n = Math.max(2, Math.round(w / (h * 1.6))); const step = w / n; const subs: Pt[][] = []; const bd: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) { const cx = x + (i + .5) * step; subs.push([[cx, y], [cx + h / 2, y + h / 2], [cx, y + h], [cx - h / 2, y + h / 2]]); bd.push([x + i * step, y + h / 2, h * .13]); }
  return [shape(subs, fill, { label: 'Diamond border' }), dots(bd, bead, { label: 'Border beads' })];
}
/** A folk border strip: coloured band, triangle teeth, a chain of diamonds. */
function strip(y: number, ground: string, diamond: string, bead: string, up: boolean): O[] {
  return [rect(0, y, PW, 46, ground, { label: 'Border ground' }), sawBand(0, up ? y + 46 : y - 18, PW, 18, ground, up), ...diamondBand(0, y + 10, PW, 26, diamond, bead)];
}
/** 8-point folk rosette. */
function rosette(cx: number, cy: number, r: number, c1: string, c2: string, c3: string): O[] {
  const petals: Pt[][] = Array.from({ length: 8 }, (_, i) => { const a = (i * 45) * Math.PI / 180, a0 = a - .26, a1 = a + .26; return [[cx + r * .3 * Math.cos(a0), cy + r * .3 * Math.sin(a0)], [cx + r * Math.cos(a), cy + r * Math.sin(a)], [cx + r * .3 * Math.cos(a1), cy + r * .3 * Math.sin(a1)]] as Pt[]; });
  return [shape(petals, c1, { label: 'Rosette petals' }), circle(cx, cy, r * .34, c2, { label: 'Rosette heart' }), circle(cx, cy, r * .14, c3, { label: 'Rosette eye' })];
}
/** Papercut mountain: two facets, chevron stripes, optional snow. Symmetric about its own axis. */
function mount(cx: number, baseY: number, w: number, h: number, light: string, dark: string, o: { snow?: boolean; stripe?: string } = {}): O[] {
  const out: O[] = [poly([[cx - w / 2, baseY], [cx, baseY - h], [cx, baseY]], light, { shadow: PSH, label: 'Mountain light facet' }), poly([[cx, baseY - h], [cx + w / 2, baseY], [cx, baseY]], dark, { label: 'Mountain dark facet' })];
  if (o.stripe) {
    const subs: Pt[][] = [];
    for (let k = 1; k <= 3; k++) { const fy = baseY - h * k * .24; const half = (w / 2) * (1 - (baseY - fy) / h) * .9; const row: Pt[] = []; const teeth = Math.max(2, Math.round(half / 12)); for (let i = 0; i <= teeth * 2; i++) row.push([cx - half + (half * 2) * i / (teeth * 2), fy + (i % 2 ? -7 : 5)]); subs.push(row); }
    out.push(shape(subs, 'none', { stroke: o.stripe, strokeWidth: 3.5, open: true, opacity: .75, label: 'Chevron stripes' }));
  }
  if (o.snow) {
    const sh = h * .2; const half = (w / 2) * (sh / h); const yb = baseY - h + sh; const pts: Pt[] = [[cx, baseY - h], [cx - half, yb]];
    for (let i = 1; i < 6; i++) pts.push([cx - half + (half * 2) * i / 6, yb + (i % 2 ? 11 : -3)]);
    pts.push([cx + half, yb]); out.push(poly(pts, FK.ivory, { label: 'Snow cap' }));
  }
  return out;
}
const fir = (x: number, baseY: number, h: number, c: string): O[] => [rect(x - 4, baseY - h * .22, 8, h * .22, FK.wineD, { label: 'Trunk' }), shape([[[x - h * .26, baseY - h * .2], [x, baseY - h * .62], [x + h * .26, baseY - h * .2]], [[x - h * .22, baseY - h * .46], [x, baseY - h * .86], [x + h * .22, baseY - h * .46]], [[x - h * .17, baseY - h * .7], [x, baseY - h], [x + h * .17, baseY - h * .7]]], c, { shadow: { x: 0, y: 3, blur: 4, color: alpha(FK.wineD, .4) }, label: 'Fir tree' })];
function house(x: number, baseY: number, w: number, h: number, wall: string, roof: string, o: { smoke?: boolean; lit?: boolean } = {}): O[] {
  const out: O[] = [rect(x, baseY - h, w, h, wall, { shadow: PSH, label: 'House' }), poly([[x - 8, baseY - h], [x + w / 2, baseY - h - w * .52], [x + w + 8, baseY - h]], roof, { shadow: PSH, label: 'Roof' }), rect(x + w * .66, baseY - h - w * .5, w * .12, w * .3, roof, { label: 'Chimney' })];
  out.push(poly([[x + w * .5, baseY - h * .88], [x + w * .76, baseY - h * .6], [x + w * .5, baseY - h * .32], [x + w * .24, baseY - h * .6]], o.lit === false ? mix(wall, -.4) : FK.gold, { label: 'Diamond window' }), poly([[x + w * .38, baseY], [x + w * .38, baseY - h * .2], [x + w * .5, baseY - h * .27], [x + w * .62, baseY - h * .2], [x + w * .62, baseY]], FK.wineD, { label: 'Door' }));
  if (o.smoke) out.push(circle(x + w * .72, baseY - h - w * .62, w * .07, FK.ivory, { opacity: .85, label: 'Smoke' }), circle(x + w * .78, baseY - h - w * .8, w * .1, FK.ivory, { opacity: .7, label: 'Smoke' }), circle(x + w * .72, baseY - h - w * 1.02, w * .13, FK.ivory, { opacity: .55, label: 'Smoke' }));
  return out;
}
/** Mira the weaver girl: a triangle of a dress, a scarf, two braids, a face. Feet at (cx, footY). */
type MiraOpts = { mood?: 'happy' | 'sleep' | 'awe'; hand?: [number, number]; dress?: string };
function mira(cx: number, footY: number, s: number, o: MiraOpts = {}): O[] {
  const X = (x: number) => cx + x * s, Y = (y: number) => footY + y * s; const out: O[] = [];
  const dress = o.dress || FK.teal; const mood = o.mood || 'happy'; const hand = o.hand || [54, -92];
  out.push(ellipse(X(-40), Y(-14), 34 * s, 16 * s, FK.crim, { label: 'Boot' }), ellipse(X(6), Y(-14), 34 * s, 16 * s, FK.crim, { label: 'Boot' }));
  out.push(poly([[X(-10), Y(-124)], [X(10), Y(-124)], [X(70), Y(-6)], [X(-70), Y(-6)]], dress, { shadow: PSH, label: 'Dress' }));
  const hem: Pt[] = [[X(-70), Y(-6)], [X(70), Y(-6)]]; for (let i = 0; i <= 8; i++) hem.push([X(61 - i * 15.25), Y(i % 2 ? -26 : -16)]);
  out.push(poly(hem, FK.ivory, { label: 'Zigzag hem' }));
  out.push(poly([[X(-26), Y(-114)], [X(26), Y(-114)], [X(0), Y(-34)]], FK.gold, { label: 'Apron' }), dots([[X(0), Y(-96), 5 * s], [X(-9), Y(-78), 4 * s], [X(9), Y(-78), 4 * s], [X(0), Y(-60), 3.5 * s]], FK.crim, { label: 'Apron dots' }));
  out.push(stroke([[X(-12), Y(-116)], [X(-52), Y(-86)]], FK.ivory, 16 * s, { label: 'Sleeve' }), stroke([[X(12), Y(-116)], [X(hand[0] * .86), Y(hand[1] - 2)]], FK.ivory, 16 * s, { label: 'Sleeve' }));
  out.push(circle(X(-54), Y(-84), 8.5 * s, FK.skin, { label: 'Hand' }), circle(X(hand[0]), Y(hand[1]), 8.5 * s, FK.skin, { label: 'Hand' }));
  out.push(poly([[X(-33), Y(-148)], [X(-22), Y(-148)], [X(-46), Y(-78)], [X(-52), Y(-80)]], FK.hair, { label: 'Braid' }), poly([[X(33), Y(-148)], [X(22), Y(-148)], [X(46), Y(-78)], [X(52), Y(-80)]], FK.hair, { label: 'Braid' }), circle(X(-48), Y(-80), 5 * s, FK.gold, { label: 'Braid tie' }), circle(X(48), Y(-80), 5 * s, FK.gold, { label: 'Braid tie' }));
  out.push(circle(X(0), Y(-158), 38 * s, FK.hair, { label: 'Hair' }), circle(X(0), Y(-152), 31 * s, FK.skin, { shadow: { x: 0, y: 2, blur: 3, color: alpha(FK.wineD, .35) }, label: 'Face' }));
  out.push(poly([[X(-31), Y(-170)], [X(31), Y(-170)], [X(31), Y(-160)], [X(16), Y(-166)], [X(0), Y(-159)], [X(-16), Y(-166)], [X(-31), Y(-160)]], FK.hair, { label: 'Fringe' }));
  out.push(poly([[X(-44), Y(-174)], [X(44), Y(-174)], [X(0), Y(-226)]], FK.crim, { shadow: PSH, label: 'Scarf' }), poly([[X(-44), Y(-174)], [X(-54), Y(-132)], [X(-34), Y(-168)]], FK.crim, { label: 'Scarf tail' }), poly([[X(44), Y(-174)], [X(54), Y(-132)], [X(34), Y(-168)]], FK.crim, { label: 'Scarf tail' }), poly([[X(-44), Y(-174)], [X(44), Y(-174)], [X(41), Y(-165)], [X(-41), Y(-165)]], FK.saff, { label: 'Scarf trim' }), tri(X(-12), Y(-208), 24 * s, 24 * s, FK.gold, { label: 'Scarf diamond' }));
  if (mood === 'sleep') out.push(stroke(arcPts(X(-12), Y(-152), 8 * s, 5 * s, 10, 170, 8), FK.wineD, 3.2 * s, { label: 'Closed eye' }), stroke(arcPts(X(12), Y(-152), 8 * s, 5 * s, 10, 170, 8), FK.wineD, 3.2 * s, { label: 'Closed eye' }));
  else out.push(...eye(X(-12), Y(-152), (mood === 'awe' ? 10.5 : 9) * s, FK.wineD, [.3, -.1], FK.ivory), ...eye(X(12), Y(-152), (mood === 'awe' ? 10.5 : 9) * s, FK.wineD, [.3, -.1], FK.ivory));
  out.push(blush(X(-22), Y(-138), 7 * s, FK.crim), blush(X(22), Y(-138), 7 * s, FK.crim));
  out.push(mood === 'awe' ? ellipse(X(-5), Y(-136), 10 * s, 12 * s, FK.wineD, { label: 'Open mouth' }) : smile(X(0), Y(-137), 18 * s, 1, FK.wineD, 3 * s));
  return out;
}
/** Glint, the thread spirit: a ball of golden thread with a face and a curl of thread for hair. */
function glint(cx: number, cy: number, r: number, mood: 'happy' | 'sleep' | 'awe' = 'happy'): O[] {
  const out: O[] = [circle(cx, cy, r * 1.5, FK.gold, { opacity: .22, blur: 10, label: 'Glint glow' }), circle(cx, cy, r, FK.gold, { stroke: FK.saff, strokeWidth: Math.max(2, r * .05), shadow: { x: 0, y: r * .08, blur: r * .1, color: alpha(FK.wineD, .4) }, label: 'Glint' })];
  [-58, -18, 22, 62].forEach(t => out.push(stroke(arcPts(0, 0, r * .94, r * .3, 0, 180, 16).map(([x, y]) => { const a = t * Math.PI / 180; return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as Pt; }), FK.saff, Math.max(1.8, r * .03), { opacity: .7, label: 'Winding' })));
  out.push(stroke(arcPts(cx - r * .1, cy - r * 1.02, r * .3, r * .34, 150, 380, 14), FK.gold, Math.max(3, r * .1), { label: 'Thread curl' }));
  const e = r * .21;
  if (mood === 'sleep') out.push(stroke(arcPts(cx - r * .32, cy - r * .1, e, e * .6, 10, 170, 8), FK.wineD, Math.max(2, r * .06), { label: 'Closed eye' }), stroke(arcPts(cx + r * .32, cy - r * .1, e, e * .6, 10, 170, 8), FK.wineD, Math.max(2, r * .06), { label: 'Closed eye' }));
  else out.push(...eye(cx - r * .32, cy - r * .1, mood === 'awe' ? e * 1.25 : e, FK.wineD, [.2, -.1], FK.ivory), ...eye(cx + r * .32, cy - r * .1, mood === 'awe' ? e * 1.25 : e, FK.wineD, [.2, -.1], FK.ivory));
  out.push(blush(cx - r * .55, cy + r * .2, r * .12, FK.crim), blush(cx + r * .55, cy + r * .2, r * .12, FK.crim), mood === 'awe' ? ellipse(cx - r * .11, cy + r * .22, r * .22, r * .26, FK.wineD, { label: 'Open mouth' }) : smile(cx, cy + r * .24, r * .42, 1, FK.wineD, Math.max(2.5, r * .06)));
  return out;
}
const paperSpeck = (seed: number, color = FK.ivory, n = 150, op = .14) => speckle(0, 0, PW, PH, n, color, seed, 2.6, op);
const arch = (cx: number, top: number, w: number, bottom: number, fill: string, o: { stroke?: string; sw?: number; dash?: number[]; shadow?: boolean; label?: string } = {}): O => poly([[cx - w / 2, bottom], [cx - w / 2, top + w / 2], ...arcPts(cx, top + w / 2, w / 2, w / 2, 180, 360, 22), [cx + w / 2, bottom]], fill, { stroke: o.stroke, strokeWidth: o.sw, dash: o.dash, shadow: o.shadow === false ? undefined : PSH, label: o.label || 'Arch' });
const fkGround = (g?: ReturnType<typeof lin>, fill = FK.ivory) => rect(0, 0, PW, PH, fill, { role: 'GROUND', gradient: g, label: 'Paper ground' });
const lead = (str: string, cx: number, y: number, size: number, colors: string[], seed: number, sw = 10, shadow = FK.wineD) => letterRow(str, cx, y, { font: 'almendraDisplay', adv: ALMENDRA_ADV, size, colors, stroke: FK.wine, sw: sw * .7, fat: Math.max(3, size * .045), bounce: size * .05, rot: 4, shadow: { x: size * .03, y: size * .05, color: shadow }, align: 'center', seed, track: size * .02, weight: 400 });
const gStars = (n: number, seed: number, x: number, y: number, w: number, h: number): O[] => { const q = orn.rng(seed); return Array.from({ length: n }, () => sparkle(x + q() * w, y + q() * h, 5 + q() * 9, FK.goldL)); };

/** A route for the gold thread on page `i`: it ENTERS at x=0 at FT[i] and LEAVES at x=1024 at FT[i+1], through the given mid points. */
const route = (i: number, mids: Pt[], seg = 12): Pt[] => catmull([[0, FT[i]], ...mids, [PW, FT[i + 1]]], seg);

/** Wide scroll panel with saw-tooth edges: long story text on ivory (or any fill), centred vertically in its box. */
function scroll(x: number, y: number, w: number, h0: number, words: string, o: { fill?: string; ink?: string; edge?: string; stitch?: string; max?: number; min?: number; align?: 'left' | 'center'; pad?: number; hug?: boolean } = {}): { objs: O[]; size: number; h: number } {
  const pad = o.pad ?? 30; const fill = o.fill || FK.ivory; const edge = o.edge || fill; let h = h0;
  const fit = fitText(x + pad, y + pad, w - pad * 2, words, { centerBlock: true, face: 'andika700', max: o.max ?? 26, min: o.min ?? 20, leading: 1.4, color: o.ink || FK.wine, align: o.align ?? 'left', maxH: h0 - pad * 2 });
  if (o.hug) h = fit.h + pad * 2 + 6; else fit.obj.y += Math.max(0, (h - pad * 2 - fit.h) / 2);
  const objs: O[] = [rect(x, y, w, h, fill, { shadow: PSH, label: 'Text scroll' }), sawBand(x, y - 15, w, 15, edge, false, Math.max(4, Math.round(w / 26))), sawBand(x, y + h, w, 15, edge, true, Math.max(4, Math.round(w / 26))), rect(x + 10, y + 10, w - 20, h - 20, 'none', { rx: 3, stroke: o.stitch || FK.saff, strokeWidth: 2.5, dash: [9, 6], label: 'Stitch line' }), fit.obj];
  return { objs, size: fit.size, h };
}
/** Arched plaque with the text laid out in the straight part below the curve. */
function archPlaque(cx: number, top: number, w: number, bottom: number, textTop: number, words: string, o: { fill?: string; ink?: string; line?: string; max?: number } = {}): { objs: O[]; size: number } {
  const fill = o.fill || FK.ivory;
  const fit = fitText(cx - w / 2 + 44, textTop, w - 88, words, { centerBlock: true, face: 'andika700', max: o.max ?? 26, min: 20, leading: 1.38, color: o.ink || FK.wine, align: 'left', maxH: bottom - 44 - textTop });
  fit.obj.y += Math.max(0, (bottom - 44 - textTop - fit.h) / 2);
  const objs: O[] = [arch(cx, top, w, bottom, fill, { stroke: FK.saff, sw: 7, label: 'Text arch' }), arch(cx, top + 20, w - 40, bottom - 14, 'none', { stroke: o.line || FK.crim, sw: 3, dash: [10, 7], shadow: false, label: 'Arch inner line' }), ...rosette(cx, top + 72, 30, FK.crim, FK.gold, FK.wine), ...diamondBand(cx - w / 2 + 40, bottom - 40, w - 80, 22, FK.saff, FK.crim), fit.obj];
  return { objs, size: fit.size };
}
/** Ribbon banner with swallow tails: story text on it. Sized from the real text height. */
function ribbon(x: number, y: number, w: number, words: string, o: { max?: number; min?: number; maxH?: number; tail?: string; pad?: number; align?: 'left' | 'center' } = {}): { objs: O[]; h: number; size: number } {
  const pad = o.pad ?? 24;
  const fit = fitText(x + pad, y + pad * .8, w - pad * 2, words, { centerBlock: true, face: 'andika700', max: o.max ?? 27, min: o.min ?? 20, leading: 1.4, color: FK.wine, align: o.align ?? 'center', maxH: o.maxH !== undefined ? o.maxH - pad * 1.6 : undefined });
  const h = fit.h + pad * 1.6; const tail = o.tail || FK.crim;
  const objs: O[] = [poly([[x - 36, y + 16], [x + 24, y + 16], [x + 24, y + h + 6], [x - 36, y + h + 6], [x - 18, y + h / 2 + 11]], tail, { label: 'Ribbon tail' }), poly([[x + w + 36, y + 16], [x + w - 24, y + 16], [x + w - 24, y + h + 6], [x + w + 36, y + h + 6], [x + w + 18, y + h / 2 + 11]], tail, { label: 'Ribbon tail' })];
  objs.push(rect(x, y, w, h, FK.ivory, { rx: 6, shadow: PSH, label: 'Ribbon' }), rect(x + 8, y + 8, w - 16, h - 16, 'none', { rx: 3, stroke: FK.saff, strokeWidth: 2.5, dash: [9, 6], label: 'Stitch line' }), tri(x - 6, y + h / 2 - 10, 20, 20, tail, { rotation: 90, label: 'Ribbon mark' }), tri(x + w - 14, y + h / 2 - 10, 20, 20, tail, { rotation: -90, label: 'Ribbon mark' }), fit.obj);
  return { objs, h, size: fit.size };
}

/** The Grey Wolf (Character Bible: tall grey-and-ivory wolf of sharp triangles, narrow muzzle, amber eyes, ragged coat). Feet at (cx, baseY), scale s. */
function wolf(cx: number, baseY: number, s: number, mode: 'torn' | 'gold', gaze: -1 | 1 = 1): O[] {
  const X = (x: number) => cx + x * s, Y = (y: number) => baseY + y * s; const GREY = '#8E9AA6', IV = FK.ivory, AMB = '#E67E22', DK = '#5E6874';
  const P = (pts: Pt[]) => pts.map(([x, y]) => [X(x), Y(y)] as Pt);
  const out: O[] = [];
  out.push(poly(P([[58, -20], [138, -78], [112, -6]]), DK, { label: 'Wolf tail' }));
  out.push(poly(P([[-76, 0], [0, -236], [76, 0]]), GREY, { shadow: PSH, label: 'Wolf body' }), poly(P([[-30, 0], [0, -150], [30, 0]]), IV, { label: 'Wolf belly' }));
  if (mode === 'torn') {
    out.push(poly(P([[-58, -104], [58, -104], [72, -26], [50, -58], [36, -8], [16, -52], [0, -14], [-16, -56], [-36, -10], [-52, -60], [-72, -24]]), '#6F7A86', { label: 'Torn coat' }));
    out.push(stroke(P([[-30, -96], [-22, -70], [-30, -48]]), DK, 3.5 * s, { label: 'Tear' }), stroke(P([[26, -92], [18, -66], [28, -40]]), DK, 3.5 * s, { label: 'Tear' }), stroke(P([[-4, -100], [4, -74]]), DK, 3.5 * s, { label: 'Tear' }));
  } else {
    out.push(poly(P([[-62, -108], [62, -108], [74, -22], [50, -34], [34, -22], [16, -34], [0, -22], [-16, -34], [-34, -22], [-50, -34], [-74, -22]]), FK.gold, { stroke: FK.saff, strokeWidth: 3 * s, label: 'Gold coat' }));
    out.push(...[-40, -14, 14, 40].map(dx => tri(X(dx - 9), Y(-92), 18 * s, 22 * s, FK.saff, { label: 'Coat stitch' })), poly(P([[-62, -108], [62, -108], [58, -98], [-58, -98]]), FK.crim, { label: 'Coat trim' }));
  }
  out.push(poly(P([[-42, -218], [42, -218], [0, -284]]), GREY, { label: 'Wolf head' }), tri(X(-52), Y(-320), 28 * s, 46 * s, GREY, { label: 'Ear' }), tri(X(24), Y(-320), 28 * s, 46 * s, GREY, { label: 'Ear' }), tri(X(-46), Y(-306), 16 * s, 28 * s, IV, { label: 'Inner ear' }), tri(X(30), Y(-306), 16 * s, 28 * s, IV, { label: 'Inner ear' }));
  out.push(poly(P([[-20, -224], [20, -224], [0, -176]]), IV, { label: 'Wolf muzzle' }), circle(X(0), Y(-178), 5.5 * s, FK.wineD, { label: 'Nose' }));
  const lk: [number, number] = [gaze * (mode === 'torn' ? .2 : .8), mode === 'torn' ? .3 : .4];
  out.push(...eye(X(-17), Y(-238), 9 * s, FK.wineD, lk, AMB), ...eye(X(17), Y(-238), 9 * s, FK.wineD, lk, AMB));
  out.push(stroke(P([[-30, -256], [-8, -246]]), FK.wineD, 3.4 * s, { label: 'Brow' }), stroke(P([[30, -256], [8, -246]]), FK.wineD, 3.4 * s, { label: 'Brow' }));
  if (mode === 'gold') out.push(blush(X(-30), Y(-216), 6 * s, FK.crim), blush(X(30), Y(-216), 6 * s, FK.crim));
  return out;
}
/** The Moon: round cream face, half-closed eyes, rosy cheeks, a thin silver sash that is unravelling (or, once mended, tied with a gold bow). */
function moonFace(cx: number, cy: number, r: number, state: 'fray' | 'bright'): O[] {
  const CREAM = '#F7EBC2', SIL = '#C9D6DF'; const out: O[] = [];
  if (state === 'bright') out.push(circle(cx, cy, r * 1.5, FK.goldL, { opacity: .3, blur: 16, label: 'Moon glow' }), rays(cx, cy, r * 1.12, r * 1.5, 20, FK.goldL, 3, .35));
  out.push(circle(cx, cy, r, CREAM, { shadow: PSH, label: 'Moon' }), circle(cx - r * .42, cy - r * .35, r * .13, '#E6D9B8', { label: 'Crater' }), circle(cx + r * .5, cy + r * .42, r * .17, '#E6D9B8', { label: 'Crater' }), circle(cx + r * .22, cy - r * .62, r * .08, '#E6D9B8', { label: 'Crater' }));
  out.push(stroke(arcPts(cx - r * .34, cy - r * .08, r * .2, r * .11, 10, 170, 8), FK.wineD, Math.max(3, r * .04), { label: 'Sleepy eye' }), stroke(arcPts(cx + r * .34, cy - r * .08, r * .2, r * .11, 10, 170, 8), FK.wineD, Math.max(3, r * .04), { label: 'Sleepy eye' }), blush(cx - r * .55, cy + r * .2, r * .13, FK.crim), blush(cx + r * .55, cy + r * .2, r * .13, FK.crim));
  out.push(state === 'fray' ? ellipse(cx - r * .09, cy + r * .24, r * .18, r * .22, FK.wineD, { label: 'Yawn' }) : smile(cx, cy + r * .26, r * .4, 1, FK.wineD, Math.max(3, r * .04)));
  const a = -18 * Math.PI / 180; const ux = Math.cos(a), uy = Math.sin(a);
  const sx0 = cx - r * 1.02 * ux + r * .55 * uy, sy0 = cy + r * 1.02 * uy + r * .55 * ux;
  void sx0; void sy0;
  const y0 = cy + r * .62; const L: Pt[] = [[cx - r * .98, y0 - r * .12], [cx + r * .98, y0 + r * .2]];
  if (state === 'fray') {
    out.push(poly([[L[0][0], L[0][1]], [cx - r * .1, y0 + r * .04], [cx - r * .1, y0 + r * .17], [L[0][0], L[0][1] + r * .13]], SIL, { label: 'Silver sash' }), poly([[cx + r * .16, y0 + r * .07], [L[1][0], L[1][1]], [L[1][0], L[1][1] + r * .13], [cx + r * .16, y0 + r * .2]], SIL, { label: 'Silver sash' }));
    [[-.1, .17, -.12, .52], [-.02, .15, .03, .5], [.07, .13, .02, .46], [.14, .18, .2, .54]].forEach(([x0, y1, x1, y2]) => out.push(stroke([[cx + r * x0, y0 + r * y1], [cx + r * x1, y0 + r * y2]], SIL, Math.max(2.5, r * .03), { label: 'Loose thread' })));
  } else {
    out.push(poly([[L[0][0], L[0][1]], [L[1][0], L[1][1]], [L[1][0], L[1][1] + r * .15], [L[0][0], L[0][1] + r * .15]], SIL, { label: 'Silver sash' }));
    const bx = cx + r * .2, by = y0 + r * .1;
    out.push(tri(bx - r * .46, by - r * .13, r * .46, r * .3, FK.gold, { rotation: 90, label: 'Bow' }), tri(bx, by - r * .13, r * .46, r * .3, FK.gold, { rotation: -90, label: 'Bow' }), circle(bx, by + r * .02, r * .1, FK.saff, { label: 'Bow knot' }));
  }
  return out;
}
/** The tangled knot at the top of the world (page 8): a ball of gold with loops that do not resolve. */
function knot(cx: number, cy: number, r: number, seed: number): O[] {
  const q = orn.rng(seed); const out: O[] = [circle(cx, cy, r * 1.25, FK.gold, { opacity: .2, blur: 18, label: 'Knot glow' }), circle(cx, cy, r, FK.gold, { stroke: FK.saff, strokeWidth: 6, label: 'Knot' })];
  for (let i = 0; i < 16; i++) { const rot = q() * Math.PI; const rx = r * (.5 + q() * .5), ry = r * (.18 + q() * .35); const pts = arcPts(0, 0, rx, ry, 0, 360, 30).map(([x, y]) => [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)] as Pt); out.push(stroke(pts, i % 3 ? FK.saff : FK.goldL, Math.max(3, r * .03), { opacity: .85, label: 'Tangle' })); }
  return out;
}
/** A small loom: two posts, two beams and a warp of threads. */
function loom(x: number, y: number, w: number, h: number): O[] {
  const n = Math.floor(w / 13);
  return [rect(x, y, 14, h, FK.saff, { label: 'Loom post' }), rect(x + w - 14, y, 14, h, FK.saff, { label: 'Loom post' }), rect(x - 8, y - 8, w + 16, 14, FK.gold, { label: 'Loom beam' }), rect(x - 8, y + h - 6, w + 16, 14, FK.gold, { label: 'Loom beam' }), shape(Array.from({ length: n }, (_, i) => [[x + 20 + i * ((w - 40) / Math.max(1, n - 1)), y + 6], [x + 20 + i * ((w - 40) / Math.max(1, n - 1)), y + h - 6]] as Pt[]), 'none', { stroke: FK.goldL, strokeWidth: 2.2, open: true, opacity: .8, label: 'Warp threads' })];
}

export const folktale: PublicationDesigner = (ctx: PublicationCtx) => {
  const { pageIndex, seed } = ctx; const F = FK; const out: O[] = [];
  const book = showcaseByTemplate(ctx.template.id);
  const sp = book?.spreads[pageIndex];
  if (!book || !sp) throw new Error(`story-folktale: no showcase spread for page ${pageIndex + 1}`);
  const lines = sp.text.split('\n');
  switch (pageIndex) {
    // ── 0 COVER ──
    case 0: {
      out.push(fkGround(lin(90, [0, '#FFD066'], [1, F.saff])));
      out.push(circle(512, 520, 330, F.goldL, { opacity: .5, label: 'Sun aura' }), rays(512, 500, 210, 520, 28, '#FFE9A0', 3, .5), circle(512, 500, 205, F.gold, { stroke: F.saff, strokeWidth: 8, label: 'Sun disc' }), circle(512, 500, 150, F.goldL, { stroke: F.saff, strokeWidth: 4, dash: [10, 8], label: 'Sun ring' }));
      out.push(...mount(180, 690, 460, 360, F.teal, F.tealD, { snow: true, stripe: F.tealL }), ...mount(844, 690, 460, 330, F.teal, F.tealD, { snow: true, stripe: F.tealL }));
      out.push(sawBand(0, 640, PW, 30, F.wine), rect(0, 670, PW, 98, F.wine, { label: 'Hill' }), ...diamondBand(0, 698, PW, 28, F.saff, F.gold));
      out.push(...fir(60, 640, 130, F.tealL), ...fir(960, 640, 150, F.tealL), ...fir(110, 650, 90, F.teal), ...fir(912, 650, 100, F.teal));
      out.push(...thread(route(0, [[150, 540], [270, 630], [415, 588], [512, 612], [616, 566], [730, 540], [800, 560], [900, 450]]), 9));
      out.push(...mira(512, 744, 1.78, { mood: 'happy', hand: [54, -90] }), ...glint(808, 548, 62, 'happy'));
      const [w1, w2] = [lines[0].split(' ').slice(0, 2).join(' '), lines[0].split(' ').slice(2).join(' ')];
      out.push(...lead(w1, 512, 12, 142, [F.ivory, F.gold, F.ivory, F.gold, F.ivory], 11, 11).objs);
      out.push(...lead(w2, 512, 138, 218, [F.gold, F.ivory, F.gold, F.ivory, F.gold, F.ivory], 12, 15, F.crim).objs);
      out.push(...rosette(66, 66, 46, F.crim, F.gold, F.wine), ...rosette(958, 66, 46, F.crim, F.gold, F.wine));
      out.push(text(24, 734, 360, `A PLAJAH BOOKS FOLK TALE · AGES ${book.ageMin}–${book.ageMax}`, { size: 15, font: 'andika', weight: 700, color: F.goldL, align: 'left', tracking: .06, wrap: false, label: 'Imprint', role: 'LABEL' }));
      out.push(paperSpeck(seed, F.ivory, 120, .16));
      return out;
    }
    // ── 1 HERO — the village of Three Hills, a tall arched plaque of story ──
    case 1: {
      out.push(fkGround(lin(90, [0, '#FFD878'], [1, '#FFA63A'])));
      out.push(rays(290, 330, 150, 760, 30, '#FFE9A0', 0, .45), circle(290, 330, 130, F.ivory, { stroke: F.saff, strokeWidth: 6, label: 'Sun disc' }), circle(290, 330, 96, F.gold, { label: 'Sun heart' }), circle(290, 330, 56, F.crim, { label: 'Sun core' }));
      out.push(...mount(110, 560, 420, 360, F.teal, F.tealD, { snow: true, stripe: F.tealL }), ...mount(480, 560, 400, 330, F.teal, F.tealD, { snow: true, stripe: F.tealL }), ...mount(290, 560, 320, 190, F.crim, mix(F.crim, -.3), { stripe: F.gold }));
      out.push(poly([[0, 768], [0, 560], [220, 500], [400, 570], [580, 520], [800, 560], [1024, 540], [1024, 768]], F.wine, { shadow: PSH, label: 'Near hill' }));
      out.push(...house(28, 610, 118, 86, F.ivory, F.crim, { smoke: true }), ...house(170, 585, 84, 64, F.gold, F.crim), ...fir(320, 600, 100, F.tealL), ...fir(560, 640, 90, F.tealL));
      out.push(...loom(300, 470, 170, 190));
      out.push(...thread(route(1, [[92, 336], [150, 380], [250, 470], [360, 560], [470, 625], [570, 690], [720, 672], [880, 696]]), 8));
      out.push(...mira(414, 744, 1.3, { mood: 'happy', hand: [54, -92] }), ...glint(520, 520, 40, 'happy'));
      const pl = archPlaque(784, 28, 440, 640, 168, sp.text, { max: 24 });
      out.push(...pl.objs, paperSpeck(seed + 1, F.ivory, 90, .12));
      return out;
    }
    // ── 2 VIGNETTE — a gold-ringed night window onto the loom; the thread slips out ──
    case 2: {
      out.push(fkGround(undefined, F.wine), paperSpeck(seed + 2, F.ivory, 140, .1));
      const cx = 290, cy = 372;
      out.push(circle(cx, cy, 262, F.saff, { opacity: .25, blur: 14, label: 'Lamp glow' }), circle(cx, cy, 226, F.gold, { label: 'Frame outer' }), circle(cx, cy, 208, F.wine, { label: 'Frame gap' }), circle(cx, cy, 196, F.tealD, { label: 'Window night' }));
      const ring: Pt[][] = Array.from({ length: 24 }, (_, i) => { const a0 = (i * 15 - 2) * Math.PI / 180, a1 = (i * 15 + 2) * Math.PI / 180, a = (i * 15 + 7.5) * Math.PI / 180; return [[cx + 226 * Math.cos(a0), cy + 226 * Math.sin(a0)], [cx + 254 * Math.cos(a), cy + 254 * Math.sin(a)], [cx + 226 * Math.cos(a1), cy + 226 * Math.sin(a1)]] as Pt[]; });
      out.push(shape(ring, F.gold, { label: 'Frame rays' }), ...gStars(10, 5, 150, 200, 280, 100));
      out.push(poly([[96, 540], [200, 450], [290, 520], [390, 440], [486, 540], [486, 580], [96, 580]], mix(F.tealD, -.25), { label: 'Dark hills' }));
      out.push(...loom(176, 290, 230, 250));
      out.push(...thread(route(2, [[130, 640], [210, 600], [290, 520], [350, 440], [430, 420], [520, 520], [640, 600], [820, 590]]), 7));
      out.push(...mira(292, 600, 1.0, { mood: 'awe', hand: [50, -88] }), ...glint(414, 372, 30, 'awe'));
      const sc = scroll(566, 48, 438, 470, sp.text, { hug: true, fill: F.teal, ink: F.ivory, edge: F.teal, stitch: F.goldL, max: 25, align: 'left' });
      out.push(...sc.objs);
      return out;
    }
    // ── 3 PANORAMA — the first sentence rides the thread; the rest on a ribbon ──
    case 3: {
      out.push(fkGround(lin(90, [0, F.tealD], [1, '#12767F'])), ...gStars(26, 8, 20, 20, 980, 300), circle(900, 110, 62, F.ivory, { label: 'Moon' }));
      out.push(...mount(150, 560, 520, 380, F.wine, mix(F.wine, -.35), { snow: true, stripe: F.crim }), ...mount(560, 560, 600, 430, mix(F.crim, -.1), mix(F.crim, -.4), { snow: true, stripe: F.gold }), ...mount(930, 560, 460, 330, F.wine, mix(F.wine, -.35), { snow: true, stripe: F.crim }));
      out.push(...mount(60, 660, 420, 250, F.saff, mix(F.saff, -.3), { stripe: F.goldL }), ...mount(430, 680, 480, 220, F.saff, mix(F.saff, -.3), { stripe: F.goldL }), ...mount(830, 664, 520, 270, F.saff, mix(F.saff, -.3), { stripe: F.goldL }));
      const wave = (y: number, c: string, ph: number): O => poly([[0, 768], ...Array.from({ length: 33 }, (_, i) => [i * 32, y + (i % 2 ? 16 : -4) + ph] as Pt), [1024, 768]], c, { label: 'River zigzag' });
      out.push(wave(676, F.tealL, 0), wave(704, F.teal, 8), wave(734, F.tealD, 4));
      const thr = Array.from({ length: 161 }, (_, k) => { const t = k / 160, x = t * PW; const env = Math.min(1, x / 110, (PW - x) / 140); return [x, FT[3] + (FT[4] - FT[3]) * t - 150 * Math.sin(Math.PI * t) - 78 * env * Math.sin(2 * Math.PI * x / 370)] as Pt; });
      out.push(...thread(thr, 8));
      const ride = lines[0].replace(/ /g, '  '); const room = polylineLength(thr) - 170 - 30; let rs = 28; while (rs > 20 && measureRow(ride, rs, ANDIKA_ADV, 1.4) > room) rs -= 1;
      if (measureRow(ride, rs, ANDIKA_ADV, 1.4) > room) throw new Error('story-folktale: the riding sentence does not fit the thread');
      out.push(...textOnPath(ride, thr, 170, { font: 'andika', adv: ANDIKA_ADV, size: rs, weight: 700, color: F.ivory, stroke: F.wineD, sw: 3.6, lift: 10, track: 1.4, label: 'Story text on the thread' }).objs);
      out.push(...mira(84, yAt(thr, 130) + 196, 1.0, { mood: 'awe', hand: [44, -196] }), ...glint(150, yAt(thr, 150) - 86, 28, 'happy'));
      out.push(...ribbon(268, 548, 700, lines.slice(1).join('\n'), { max: 25, min: 21, maxH: 206, align: 'center' }).objs, sawBand(0, 746, PW, 22, F.ivory, false, 40));
      return out;
    }
    // ── 4 STRIP — three arched panels: the wolf in shadow, the stitching, the golden coat ──
    case 4: {
      out.push(fkGround(undefined, F.ivory), paperSpeck(seed + 4, F.saff, 100, .18), sawBand(0, 0, PW, 28, F.wine, true, 34), sawBand(0, 740, PW, 28, F.wine, false, 34));
      const cols = [F.teal, F.crim, F.wine]; const geo = [{ x: 14, w: 360 }, { x: 394, w: 320 }, { x: 734, w: 270 }];
      const caps = [lines.slice(0, 3).join('\n'), lines.slice(3, 5).join('\n'), lines[5]];
      geo.forEach((g, i) => {
        const cx = g.x + g.w / 2;
        out.push(arch(cx, 44, g.w, 728, cols[i], { stroke: F.saff, sw: 7, label: 'Panel arch' }), arch(cx, 64, g.w - 38, 710, 'none', { stroke: F.goldL, sw: 3, dash: [9, 7], shadow: false, label: 'Panel inner line' }));
        out.push(...rosette(cx, 112, 24, F.gold, F.crim, F.wine));
        const cap = ribbon(g.x + 34, 470, g.w - 68, caps[i], { max: 23, min: 20, maxH: 264, pad: 18, align: 'left', tail: i === 1 ? F.wine : F.crim });
        out.push(...cap.objs);
      });
      // 1: the wolf in shadow, coat in ribbons
      out.push(circle(214, 330, 150, F.tealD, { opacity: .7, label: 'Shadow' }), ...wolf(214, 440, .92, 'torn', 1), ...gStars(4, 21, 60, 150, 300, 80));
      // 2: Mira stitching the coat, a needle of gold between them
      out.push(...wolf(528, 446, .62, 'torn', -1), ...mira(668, 446, .78, { mood: 'happy', hand: [40, -86] }), stroke([[596, 330], [612, 300], [640, 352], [650, 330]], F.gold, 4, { label: 'Needle thread' }), sparkle(612, 290, 14), sparkle(560, 250, 11, F.goldL), sparkle(640, 250, 9, F.goldL));
      // 3: the wolf in a golden coat, looking away
      out.push(...wolf(900, 440, .74, 'gold', -1), ...mira(840, 446, .36, { mood: 'happy', hand: [30, -80] }), ...gStars(5, 22, 820, 140, 150, 80));
      out.push(...thread(route(4, [[200, 480], [400, 456], [520, 486], [700, 462], [900, 486]], 12).map(p => [p[0], p[1]] as Pt), 6));
      return out;
    }
    // ── 5 PANORAMA — the river and the golden bridge, text on a wide ribbon ──
    case 5: {
      out.push(fkGround(lin(90, [0, '#FFD878'], [1, '#FFB347'])));
      out.push(...mount(180, 640, 520, 300, F.teal, F.tealD, { snow: true, stripe: F.tealL }), ...mount(800, 640, 560, 330, F.teal, F.tealD, { snow: true, stripe: F.tealL }));
      out.push(poly([[300, 626], [380, 596], [450, 612], [520, 580], [600, 610], [660, 590], [740, 626]], mix(F.tealD, .05), { label: 'Far ridge' }));
      // the two banks and the fast river between them (mirrored zigzag water)
      out.push(poly([[0, 768], [0, 556], [190, 534], [290, 576], [346, 620], [330, 768]], F.wine, { shadow: PSH, label: 'Left bank' }), poly([[1024, 768], [1024, 560], [850, 536], [750, 578], [690, 620], [708, 768]], F.wine, { shadow: PSH, label: 'Right bank' }));
      out.push(poly([[300, 626], [740, 626], [708, 768], [330, 768]], F.tealL, { gradient: lin(90, [0, F.tealL], [1, F.teal]), label: 'River' }));
      [[640, F.teal, 0], [684, F.tealD, 10], [724, F.teal, 4]].forEach(([wy, col, ph]) => out.push(poly([[336, 768], [340, wy as number + 8], ...Array.from({ length: 14 }, (_, i) => [346 + i * 26.5, (wy as number) + (i % 2 ? 14 : -2) + (ph as number)] as Pt), [706, wy as number + 8], [710, 768]], col as string, { opacity: .9, label: 'River zigzag' })));
      out.push(...fir(110, 600, 110, F.tealL), ...fir(56, 622, 80, F.teal), ...fir(960, 590, 120, F.tealL));
      // the golden bridge: one arch of thread with planks, the same thread that crosses every page
      const bc = 518, by = 618, brx = 172, bry = 160;
      const arcP = arcPts(bc, by, brx, bry, 180, 360, 40);
      out.push(stroke(arcP, FK.wineD, 30, { opacity: .35, label: 'Bridge shadow' }), stroke(arcP, F.gold, 22, { label: 'Bridge deck' }), stroke(arcP, F.saff, 22, { dash: [3, 12], label: 'Bridge planks' }));
      const thr = route(5, [[100, 500], [236, 540], [346, 614], ...[200, 225, 250, 270, 290, 315, 340].map(a => { const r = a * Math.PI / 180; return [bc + brx * Math.cos(r), by + bry * Math.sin(r)] as Pt; }), [706, 614], [800, 574], [910, 548]], 12);
      out.push(...thread(thr, 7));
      out.push(...mira(200, 612, .8, { mood: 'happy', hand: [46, -90] }), ...glint(318, 548, 28, 'happy'));
      // the family waves from the far bank
      [[790, 596, .5, F.crim], [842, 610, .42, F.saff], [884, 598, .34, F.teal]].forEach(([fx, fy, fs, col]) => out.push(...mira(fx as number, fy as number, fs as number, { mood: 'happy', hand: [40, -110], dress: col as string })));
      out.push(...ribbon(70, 34, 884, lines.join('\n'), { max: 24, min: 20, maxH: 360, pad: 26, align: 'left' }).objs, ...gStars(8, 31, 40, 400, 940, 90));
      out.push(sawBand(0, 746, PW, 22, F.crim, false, 40));
      return out;
    }
    // ── 6 VIGNETTE — the sleepy moon on the tallest hill; the thread flies up and ties her sash ──
    case 6: {
      out.push(fkGround(undefined, F.wine), paperSpeck(seed + 6, F.ivory, 140, .1));
      const cx = 748, cy = 330;
      out.push(circle(cx, cy, 266, F.saff, { opacity: .25, blur: 14, label: 'Frame glow' }), circle(cx, cy, 240, F.gold, { label: 'Frame outer' }), circle(cx, cy, 222, F.wine, { label: 'Frame gap' }), circle(cx, cy, 210, F.tealD, { label: 'Night sky' }));
      const ring: Pt[][] = Array.from({ length: 24 }, (_, i) => { const a0 = (i * 15 - 2) * Math.PI / 180, a1 = (i * 15 + 2) * Math.PI / 180, a = (i * 15 + 7.5) * Math.PI / 180; return [[cx + 240 * Math.cos(a0), cy + 240 * Math.sin(a0)], [cx + 268 * Math.cos(a), cy + 268 * Math.sin(a)], [cx + 240 * Math.cos(a1), cy + 240 * Math.sin(a1)]] as Pt; });
      out.push(shape(ring, F.gold, { label: 'Frame rays' }), ...gStars(10, 7, 590, 150, 320, 160));
      out.push(...moonFace(cx, 214, 100, 'bright'));
      out.push(poly([[560, 520], [660, 450], [748, 500], [840, 440], [940, 520], [940, 540], [560, 540]], '#C9D6DF', { label: 'Silver hillside' }), poly([[540, 560], [748, 410], [960, 560]], mix('#C9D6DF', -.25), { label: 'Tall hill' }), poly([[640, 560], [748, 410], [748, 560]], '#C9D6DF', { label: 'Tall hill lit' }));
      out.push(...thread(route(6, [[160, 590], [330, 624], [520, 616], [640, 600], [700, 500], [790, 380], [880, 340], [860, 270], [930, 300], [990, 450]], 14), 7));
      out.push(...mira(690, 560, .62, { mood: 'happy', hand: [50, -140] }), ...glint(850, 450, 24, 'happy'));
      const sc = scroll(44, 48, 450, 470, sp.text, { hug: true, fill: F.ivory, edge: F.ivory, max: 25, align: 'left' });
      out.push(...sc.objs);
      return out;
    }
    // ── 7 QUIET — the stair of stars to the top of the world, a knot as big as a mountain ──
    case 7: {
      out.push(fkGround(lin(90, [0, F.wineD], [1, F.wine])), paperSpeck(seed + 7, F.ivory, 160, .1), ...gStars(26, 14, 20, 20, 980, 520));
      out.push(circle(880, 110, 300, F.gold, { opacity: .16, blur: 20, label: 'Knot aura' }), ...knot(880, 100, 240, 77));
      const stair: Pt[] = [[540, 690], [610, 640], [680, 580], [750, 520], [820, 450], [890, 380], [960, 310]];
      stair.forEach(([sx, sy], i) => out.push(sparkle(sx, sy, 30 - i * 1.5, i % 2 ? F.goldL : F.gold), circle(sx, sy + 34, 6, F.goldL, { opacity: .5, label: 'Star step glow' })));
      out.push(...thread(route(7, [[200, 668], [380, 704], [540, 664], [660, 600], [780, 500], [880, 410], [980, 340]], 14), 7));
      out.push(...mira(500, 756, .72, { mood: 'awe', hand: [46, -100] }));
      const tx = fitText(70, 150, 420, sp.text, { centerBlock: true, face: 'andika700', max: 27, min: 21, leading: 1.45, color: F.ivory, align: 'left', maxH: 440 });
      out.push(rect(40, tx.obj.y - 26, 480, tx.h + 52, F.wineD, { rx: 10, opacity: .55, stroke: F.saff, strokeWidth: 3, dash: [10, 7], label: 'Quiet frame' }), tx.obj);
      return out;
    }
    // ── 8 REVEAL — Glint is big as a mountain; the story on a tall plaque ──
    case 8: {
      out.push(fkGround(lin(90, [0, F.wine], [1, F.wineD])), rays(300, 380, 260, 1100, 32, mix(F.wine, .12), 0, .5), rays(300, 380, 300, 1100, 16, F.crim, 5, .22));
      out.push(...thread(route(8, [[60, 330], [150, 330], [230, 560], [390, 690], [560, 706], [760, 672], [900, 700]], 14), 9));
      out.push(circle(300, 380, 400, F.gold, { opacity: .2, blur: 18, label: 'Great glow' }), ...glint(300, 380, 290, 'awe'));
      out.push(...gStars(8, 12, 20, 20, 560, 120), sparkle(80, 700, 24), sparkle(580, 80, 28));
      out.push(...mira(430, 752, .66, { mood: 'awe', hand: [50, -104] }));
      const sc = scroll(618, 52, 376, 586, sp.text, { fill: F.ivory, edge: F.ivory, max: 25, align: 'left', pad: 28 });
      out.push(...sc.objs);
      return out;
    }
    // ── 9 VIGNETTE — Mira holds out the last of her spool ──
    case 9: {
      out.push(fkGround(undefined, F.wine), paperSpeck(seed + 9, F.ivory, 140, .1));
      const cx = 262, cy = 370;
      out.push(circle(cx, cy, 262, F.saff, { opacity: .25, blur: 14, label: 'Frame glow' }), circle(cx, cy, 238, F.gold, { label: 'Frame outer' }), circle(cx, cy, 220, F.wine, { label: 'Frame gap' }), circle(cx, cy, 208, F.tealD, { label: 'Night sky' }));
      const ring: Pt[][] = Array.from({ length: 24 }, (_, i) => { const a0 = (i * 15 - 2) * Math.PI / 180, a1 = (i * 15 + 2) * Math.PI / 180, a = (i * 15 + 7.5) * Math.PI / 180; return [[cx + 238 * Math.cos(a0), cy + 238 * Math.sin(a0)], [cx + 266 * Math.cos(a), cy + 266 * Math.sin(a)], [cx + 238 * Math.cos(a1), cy + 238 * Math.sin(a1)]] as Pt; });
      out.push(shape(ring, F.gold, { label: 'Frame rays' }), ...gStars(12, 33, 110, 200, 300, 130));
      out.push(circle(cx + 70, 236, 120, F.gold, { opacity: .25, blur: 14, label: 'Knot glow' }), ...glint(cx + 70, 236, 70, 'awe'));
      out.push(poly([[70, 540], [180, 470], [262, 520], [360, 460], [458, 540], [458, 560], [70, 560]], mix(F.tealD, -.25), { label: 'Dark hills' }));
      out.push(...thread(route(9, [[110, 640], [180, 580], [240, 520], [300, 440], [330, 360], [310, 300], [420, 300], [600, 640], [820, 660]], 14), 7));
      out.push(...mira(cx - 6, 600, 1.0, { mood: 'happy', hand: [58, -150] }));
      out.push(circle(cx + 53, 450, 22, F.gold, { stroke: F.saff, strokeWidth: 4, label: 'Last spool' }), circle(cx + 53, 450, 9, F.wineD, { label: 'Spool hole' }));
      const sc = scroll(534, 44, 470, 590, sp.text, { hug: true, fill: F.ivory, edge: F.ivory, max: 25, align: 'left', pad: 28 });
      out.push(...sc.objs);
      return out;
    }
    // ── 10 CLOSING — a quilt of gold across the world; story on two flanking panels ──
    case 10: {
      out.push(fkGround(lin(90, [0, F.tealD], [1, '#0F5A66'])), ...gStars(26, 14, 20, 20, 980, 260), circle(512, 100, 80, F.goldL, { opacity: .3, blur: 6, label: 'Moon halo' }), circle(512, 100, 56, F.ivory, { label: 'Moon' }));
      out.push(...mount(180, 640, 420, 240, mix(F.teal, -.2), mix(F.teal, -.5), { stripe: F.tealL }), ...mount(850, 640, 420, 260, mix(F.teal, -.2), mix(F.teal, -.5), { stripe: F.tealL }));
      // the quilt of triangles, spreading gold across the whole world behind the centre
      const qx = 366, qy = 520, qw = 292, qh = 160, cw = 36.5, ch = 40; const subsBy: Record<string, Pt[][]> = {}; const qc = [F.crim, F.saff, F.gold, F.teal, F.ivory, F.wine];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) { const x = qx + c * cw, y = qy + r * ch; const k1 = qc[(r + c) % qc.length], k2 = qc[(r + c + 3) % qc.length]; (subsBy[k1] = subsBy[k1] || []).push([[x, y], [x + cw, y], [x, y + ch]]); (subsBy[k2] = subsBy[k2] || []).push([[x + cw, y], [x + cw, y + ch], [x, y + ch]]); }
      out.push(circle(512, 330, 170, F.gold, { opacity: .22, blur: 14, label: 'Gold glow' }), rays(512, 330, 100, 200, 24, F.goldL, 2, .3));
      out.push(rect(qx - 8, qy - 8, qw + 16, qh + 16, F.wineD, { rx: 6, shadow: PSH, label: 'Quilt edge' }), ...Object.entries(subsBy).map(([col, subs]) => shape(subs, col, { label: 'Quilt triangles' })), sawBand(qx - 8, qy - 24, qw + 16, 16, F.gold, false, 12));
      out.push(...glint(512, 214, 46, 'happy'));
      out.push(...thread(route(10, [[120, 700], [260, 690], [400, 620], [500, 520], [590, 600], [700, 700], [860, 650]], 14), 8));
      out.push(...mira(512, 540, 1.1, { mood: 'happy', hand: [54, -100] }), circle(572, 432, 15, F.gold, { stroke: F.saff, strokeWidth: 3, label: 'New spool' }), circle(572, 432, 28, F.goldL, { opacity: .5, blur: 6, label: 'Spool glow' }));
      const lp = scroll(22, 34, 338, 566, lines.slice(0, 4).join('\n'), { hug: true, fill: F.ivory, edge: F.ivory, max: 24, align: 'left', pad: 26 });
      const rp = scroll(664, 34, 338, 530, lines.slice(4).join('\n'), { hug: true, fill: F.ivory, edge: F.ivory, max: 24, align: 'left', pad: 26 });
      out.push(...lp.objs, ...rp.objs);
      return out;
    }
    // ── 11 QUIET — the village sleeps under the gold blanket ──
    case 11: {
      out.push(fkGround(lin(90, [0, F.wineD], [1, F.wine])), paperSpeck(seed + 11, F.ivory, 150, .1), ...gStars(30, 41, 20, 20, 980, 400));
      out.push(...mount(170, 640, 500, 300, mix(F.teal, -.3), mix(F.teal, -.55), { stripe: F.tealL }), ...mount(520, 650, 520, 340, mix(F.teal, -.25), mix(F.teal, -.5), { stripe: F.tealL }), ...mount(860, 640, 480, 290, mix(F.teal, -.3), mix(F.teal, -.55), { stripe: F.tealL }));
      // one golden blanket glowing over the three hills
      const blanket: Pt[][] = []; const tri3 = (x: number, y: number, w: number, h: number): Pt[] => [[x, y + h], [x + w / 2, y], [x + w, y + h]];
      out.push(circle(512, 470, 330, F.gold, { opacity: .18, blur: 22, label: 'Blanket glow' }));
      out.push(poly([[60, 640], [200, 440], [350, 520], [512, 380], [680, 520], [830, 440], [964, 640]], F.gold, { stroke: F.saff, strokeWidth: 5, shadow: PSH, label: 'Golden blanket' }));
      for (let i = 0; i < 9; i++) blanket.push(tri3(110 + i * 92, 520 + (i % 2) * 20, 84, 100));
      out.push(shape(blanket, F.saff, { opacity: .6, label: 'Blanket stitches' }), sawBand(60, 618, 904, 22, F.gold, true, 28));
      out.push(poly([[0, 768], [0, 650], [300, 620], [512, 664], [724, 620], [1024, 650], [1024, 768]], F.wineD, { shadow: PSH, label: 'Near hill' }));
      out.push(...house(430, 730, 160, 110, F.ivory, F.crim, { smoke: true }));
      out.push(...mira(512, 710, .34, { mood: 'happy' }), ...glint(560, 640, 14, 'happy'));
      out.push(...thread(route(11, [[160, 640], [300, 690], [450, 700], [600, 690], [760, 720], [900, 700]], 14), 7));
      out.push(...ribbon(150, 36, 724, lines.join('\n'), { max: 30, min: 22, maxH: 250, pad: 28, align: 'center' }).objs);
      return out;
    }
    // ── 12 ACTIVITY — follow the thread home ──
    case 12: {
      out.push(fkGround(undefined, F.ivory), paperSpeck(seed + 12, F.saff, 110, .2), sawBand(0, 0, PW, 24, F.wine, true, 40), sawBand(0, 744, PW, 24, F.wine, false, 40));
      out.push(...lead(lines[0], 512, 22, 96, [F.crim, F.wine, F.teal, F.saff], 17, 9, F.gold).objs);
      const spools: Array<{ y: number; c: string; n: string }> = [{ y: 218, c: F.crim, n: '1' }, { y: 330, c: F.teal, n: '2' }, { y: 442, c: F.saff, n: '3' }];
      const paths: Pt[][] = [[[130, 218], [330, 160], [520, 400], [720, 350], [850, 330]], [[130, 330], [330, 440], [520, 200], [720, 250], [850, 220]], [[130, 442], [330, 340], [520, 480], [720, 440], [850, 440]]];
      paths.forEach(c => out.push(...thread(catmull(c, 14), 6).slice(1, 3)));
      spools.forEach(sp2 => out.push(rect(60, sp2.y - 44, 20, 88, F.wine, { rx: 4, label: 'Spool end' }), rect(112, sp2.y - 44, 20, 88, F.wine, { rx: 4, label: 'Spool end' }), rect(76, sp2.y - 34, 40, 68, sp2.c, { label: 'Spool' }), circle(96, sp2.y, 20, F.ivory, { label: 'Spool badge' }), text(76, sp2.y - 17, 40, sp2.n, { size: 30, font: 'andika', weight: 700, color: F.wine, align: 'center', wrap: false, label: 'Spool number', role: 'LABEL' })));
      out.push(...house(850, 262, 110, 66, '#E8C98A', F.wine, { lit: false }), ...house(850, 374, 110, 66, F.ivory, F.crim, { smoke: true }), ...house(850, 486, 110, 66, '#E8C98A', F.teal, { lit: false }));
      out.push(...mira(992, 374, .3, { mood: 'happy' }), ...glint(300, 570, 26, 'happy'));
      out.push(...ribbon(190, 520, 650, lines.slice(1).join('\n'), { max: 25, min: 21, maxH: 170, pad: 22, align: 'center' }).objs);
      out.push(...thread(route(12, [[200, 706], [420, 698], [640, 712], [860, 700]], 14), 6));
      return out;
    }
    // ── 13 BACK COVER ──
    default: {
      out.push(fkGround(undefined, F.wine), paperSpeck(seed + 8, F.ivory, 150, .1), ...strip(0, F.crim, F.saff, F.gold, true), ...strip(722, F.crim, F.saff, F.gold, false));
      out.push(...lead(book.title, 512, 62, 64, [F.gold, F.ivory], 41, 7).objs);
      out.push(...thread(route(13, [[180, 690], [330, 706], [512, 690], [700, 708], [900, 670]], 10), 6));
      const pl = archPlaque(512, 140, 640, 650, 296, sp.text, { max: 26 });
      out.push(...pl.objs);
      out.push(text(256, 658, 512, `AGES ${book.ageMin}–${book.ageMax} · PLB-0006`, { size: 18, font: 'andika', weight: 700, color: F.gold, align: 'center', tracking: .1, wrap: false, label: 'Age line', role: 'LABEL' }));
      const bars: Array<[number, number, number, number]> = []; const q = orn.rng(seed); let bx = 866; for (let i = 0; i < 20; i++) { const bw = 2 + Math.floor(q() * 3); if (bx + bw < 976) bars.push([bx, 596, bw, 54]); bx += bw + 2 + Math.floor(q() * 3); }
      out.push(rect(852, 582, 140, 86, F.ivory, { rx: 5, label: 'Barcode plate' }), rectsObj(bars, F.wineD, { label: 'Barcode' }));
      out.push(...glint(110, 606, 40, 'happy'));
      return out;
    }
  }
};
void PH;
