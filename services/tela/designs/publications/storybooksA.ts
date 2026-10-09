// storybooksA — children's picture books, second pass. Two of the six.
//
//  story-space   "Orbit Party"        torn cut-paper collage, circles ONLY, a huge sun for a light
//                                      (Rebel lead, Radical Minimal counterpoint)
//  story-forest  "Little Fox, Big Trees"  woodblock / stencil, off-register print, vertical columns
//                                      + triangles, a low gold sun through the trunks
//                                      (Classical lead, Rebel counterpoint)
//
// THE STORY IS DATA: both designers read their words, page plan and beats from data/showcase/books/*
// (showcaseByTemplate). The art stays procedural; every page composes its text blocks with `fitText`,
// which wraps the spread's exact words to a box using the Chrome-measured advance tables and THROWS
// if they cannot fit at >= 22px, so a longer story can never be silently clipped or shortened.
//
// Spread = one picture (1024x768, fold at x=512): faces stay out of x 488..536, skies and
// grounds cross. Every page is finished procedural art with the text living INSIDE the art.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import { rng } from '../../ornaments';
import { showcaseByTemplate, type ShowcaseSpread } from '../../../../data/showcase';
import {
  rect, ellipse, circle, line, mix,
  type Pt, type WKey, poly, multiPoly, jitter, tornCircle, tornRect, tornDisc, tornSheet, stickerCircles, cloud, crescent, flecks, halftone, dots, type Dot,
  lettered, block, blockAt, blockH, maxLineW, tw, fitSize, arcLine, arcPts, lerp, SHADOW, PAPER_EDGE,
} from './kidsArtA';

const W = 1024, H = 768, GUT = 512;
const cat = (...a: TelaVectorObject[][]) => a.flat();

// ── The story, as data ────────────────────────────────────────────────────────
function spreadFor(ctx: PublicationCtx): ShowcaseSpread {
  const book = showcaseByTemplate(ctx.template.id);
  const s = book?.spreads[ctx.pageIndex];
  if (!s) throw new Error(`storybooksA: no showcase spread ${ctx.pageIndex + 1} for ${ctx.template.id}`);
  return s;
}
/** The spread's text split on its deliberate line breaks. */
const parasOf = (s: ShowcaseSpread) => s.text.split('\n').map(x => x.trim()).filter(Boolean);
/** Join consecutive lines into one flowing paragraph (a sentence that the data breaks across lines). */
const flow = (...lines: string[]) => lines.join(' ');

/** Greedy word wrap with the measured advance table. */
function wrapPara(wk: WKey, para: string, size: number, maxW: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of para.split(/\s+/).filter(Boolean)) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || tw(wk, t, size) <= maxW) cur = t; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}
export interface Fit { lines: string[]; size: number; h: number; w: number }
/** Largest size (max..min) at which the paragraphs wrap to fit boxW x boxH. THROWS if even `min` does not fit: the story is never cut. */
function fitText(wk: WKey, ps: string[], boxW: number, boxH: number, max: number, min = 22, lh = 1.38): Fit {
  for (let size = max; size >= min; size--) {
    const lines = ps.flatMap(p => wrapPara(wk, p, size, boxW));
    const widest = maxLineW(wk, lines, size), h = lines.length * size * lh;
    if (widest <= boxW && h <= boxH) return { lines, size, h, w: widest };
  }
  throw new Error(`storybooksA: text does not fit ${boxW}x${boxH} at >= ${min}px: "${ps[0]}"`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  ORBIT PARTY — story-space
// ══════════════════════════════════════════════════════════════════════════════
const SP = { ink: '#0D0015', pink: '#FF0055', mint: '#00FFCC', sun: '#FFF200', violet: '#7000FF', white: '#FFFFFF', orange: '#FF8A00', plum: '#2B0072', moon: '#FFE58A' };

/** Dots whose size grows away from the light — a halftone shade printed inside a disc. */
function discDots(cx: number, cy: number, r: number, step: number, color: string, ux: number, uy: number, op = .55): TelaVectorObject[] {
  const list: Dot[] = [];
  for (let y = cy - r; y <= cy + r; y += step) for (let x = cx - r; x <= cx + r; x += step) {
    const px = x + (Math.round((y - (cy - r)) / step) % 2 ? step / 2 : 0); const dx = px - cx, dy = y - cy; const d = Math.hypot(dx, dy);
    if (d > r * .86 || px < -10 || px > W + 10 || y < -10 || y > H + 10) continue;
    const t = ((dx * -ux + dy * -uy) / (r || 1) + 1) / 2; // 1 on the shadow side
    const rad = step * .46 * Math.max(0, t - .35) / .65;
    if (rad > step * .08) list.push([px, y, rad]);
  }
  return dots(list, color, { opacity: op, label: 'Halftone shade' });
}

function planet(cx: number, cy: number, r: number, col: string, seed: number, ux: number, uy: number, o: { ring?: string; craters?: number; dots?: boolean; moon?: string; shadow?: boolean } = {}): TelaVectorObject[] {
  const rd = rng(seed); const out: TelaVectorObject[] = [];
  if (o.ring) out.push(circle(cx, cy, r * 1.5, 'none', { stroke: o.ring, strokeWidth: Math.max(3, r * .05), dash: [r * .08, r * .16], label: 'Orbit ring' }));
  out.push(tornDisc(cx, cy, r, col, seed, { shadow: o.shadow }));
  const cr = crescent(cx, cy, r - 2, ux, uy, r * .34); if (cr.length > 3) out.push(poly(cr, mix(col, -.3), { opacity: .92, label: 'Planet shade' }));
  if (o.dots) out.push(...discDots(cx, cy, r, Math.max(9, r * .14), mix(col, -.5), ux, uy, .5));
  const n = o.craters ?? 3;
  for (let i = 0; i < n; i++) { const a = rd() * 6.28, d = r * (.2 + rd() * .45), cr2 = r * (.07 + rd() * .1); const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d; out.push(circle(px, py, cr2, mix(col, -.22), { label: 'Crater' })); out.push(circle(px + ux * cr2 * .25, py + uy * cr2 * .25, cr2 * .62, mix(col, .22), { label: 'Crater lip' })); }
  out.push(circle(cx + ux * r * .52, cy + uy * r * .52, r * .09, '#FFFFFF', { opacity: .6, label: 'Shine' }));
  if (o.moon) { const a = Math.atan2(-uy, -ux) + 2.3; out.push(tornDisc(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5, r * .22, o.moon, seed + 9, {})); }
  return out;
}

function starsField(x: number, y: number, w: number, h: number, n: number, seed: number, cols = [SP.white, SP.sun, SP.mint]): TelaVectorObject[] {
  const r = rng(seed); const by: Dot[][] = cols.map(() => []); const halos: Dot[] = [];
  for (let i = 0; i < n; i++) { const px = x + r() * w, py = y + r() * h, s = 1.6 + r() * 3.4; by[i % cols.length].push([px, py, s]); if (i % 7 === 0) halos.push([px, py, s * 3.2]); }
  return [...by.flatMap((l, i) => dots(l, cols[i], { opacity: .9, label: 'Stars' })), ...dots(halos, 'none', { stroke: '#FFFFFF', strokeWidth: 1.6, opacity: .5, label: 'Star halos' })];
}

function bigSun(cx: number, cy: number, r: number, seed = 3, face: 'none' | 'happy' | 'sleep' | 'wow' = 'none'): TelaVectorObject[] {
  const out: TelaVectorObject[] = [
    tornDisc(cx, cy, r * 1.42, SP.pink, seed + 1, { fringe: 'none', shadow: false, opacity: .55, rough: r * .05 }),
    tornDisc(cx, cy, r * 1.22, SP.orange, seed + 2, { fringe: 'none', shadow: false, rough: r * .04 }),
    tornDisc(cx, cy, r, SP.sun, seed + 3, { fringe: '#FFFBD0', shadow: false, rough: r * .03 }),
  ];
  out.push(...discDots(cx, cy, r * 1.15, Math.max(12, r * .1), SP.orange, .5, -.6, .5));
  if (face !== 'none') {
    const s = r * .2;
    if (face === 'sleep') { out.push(arcLine(cx - s * 1.4, cy - s * .3, s * .8, 20, 160, SP.ink, Math.max(5, r * .03)), arcLine(cx + s * 1.4, cy - s * .3, s * .8, 20, 160, SP.ink, Math.max(5, r * .03))); }
    else { for (const sx of [-1, 1]) { out.push(circle(cx + sx * s * 1.5, cy - s * .4, s * (face === 'wow' ? .95 : .75), SP.ink, { label: 'Sun eye' }), circle(cx + sx * s * 1.5 + s * .22, cy - s * .62, s * .25, '#fff', { label: 'Eye glint' })); } }
    out.push(circle(cx - s * 2.7, cy + s * .7, s * .62, SP.pink, { opacity: .8, label: 'Cheek' }), circle(cx + s * 2.7, cy + s * .7, s * .62, SP.pink, { opacity: .8, label: 'Cheek' }));
    if (face === 'wow') out.push(ellipse(cx - s * .6, cy + s * .5, s * 1.2, s * 1.5, SP.ink, { label: 'Mouth' }));
    else out.push(arcLine(cx, cy + s * .2, s * 1.5, 25, 155, SP.ink, Math.max(6, r * .04)));
  }
  return out;
}

type Mood = 'happy' | 'wow' | 'sleep' | 'shy';
function eyes(cx: number, cy: number, s: number, mood: Mood): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  if (mood === 'sleep' || mood === 'shy') { out.push(arcLine(cx - s * .3, cy, s * .17, 15, 165, SP.ink, Math.max(3.5, s * .06)), arcLine(cx + s * .3, cy, s * .17, 15, 165, SP.ink, Math.max(3.5, s * .06))); return out; }
  const er = mood === 'wow' ? s * .15 : s * .105;
  for (const sx of [-1, 1]) { out.push(circle(cx + sx * s * .3, cy, er, SP.ink, { label: 'Eye' }), circle(cx + sx * s * .3 + er * .3, cy - er * .35, er * .38, '#fff', { label: 'Eye glint' })); }
  return out;
}

/** Zib: a round little astronaut-blob. cx,cy = helmet centre, s = helmet radius. */
function astro(cx: number, cy: number, s: number, mood: Mood = 'happy', wave = false): TelaVectorObject[] {
  const ow = Math.max(4, s * .1); const out: TelaVectorObject[] = [];
  const body: [number, number, number] = [cx, cy + 1.5 * s, .95 * s];
  const boots: Array<[number, number, number]> = [[cx - .45 * s, cy + 2.35 * s, .36 * s], [cx + .45 * s, cy + 2.35 * s, .36 * s]];
  const armL: [number, number, number] = [cx - 1.0 * s, cy + 1.45 * s, .3 * s];
  const armR: [number, number, number] = wave ? [cx + 1.15 * s, cy + .55 * s, .3 * s] : [cx + 1.0 * s, cy + 1.45 * s, .3 * s];
  const under = [[cx, cy, s], body, ...boots, armL, armR];
  under.forEach(([x, y, r], i) => out.push(circle(x, y, r + ow, SP.white, { shadow: i === 0 ? SHADOW : undefined, label: 'Sticker outline' })));
  out.push(line(cx + .1 * s, cy - s, cx + .28 * s, cy - 1.55 * s, SP.white, Math.max(4, s * .07), { label: 'Antenna' }), circle(cx + .3 * s, cy - 1.62 * s, .17 * s, SP.pink, { stroke: SP.white, strokeWidth: ow * .6, label: 'Antenna bulb' }));
  boots.forEach(([x, y, r]) => out.push(circle(x, y, r, SP.violet, { label: 'Boot' })));
  out.push(circle(body[0], body[1], body[2], SP.pink, { label: 'Suit' }));
  out.push(circle(cx, cy + 1.55 * s, .4 * s, SP.mint, { label: 'Chest panel' }), circle(cx - .17 * s, cy + 1.55 * s, .08 * s, SP.pink), circle(cx + .17 * s, cy + 1.55 * s, .08 * s, SP.sun), circle(cx, cy + 1.7 * s, .08 * s, SP.ink));
  out.push(circle(armL[0], armL[1], armL[2], SP.pink, { label: 'Arm' }), circle(armL[0], armL[1] + armL[2] * .35, armL[2] * .75, SP.white, { label: 'Mitt' }));
  out.push(circle(armR[0], armR[1], armR[2], SP.pink, { label: 'Arm' }), circle(armR[0] + (wave ? .1 * s : 0), armR[1] + (wave ? -armR[2] * .35 : armR[2] * .35), armR[2] * .75, SP.white, { label: 'Mitt' }));
  out.push(circle(cx, cy, s, SP.white, { label: 'Helmet' }), circle(cx, cy + .02 * s, .8 * s, SP.sun, { label: 'Face' }), circle(cx - .38 * s, cy - .5 * s, .1 * s, SP.white, { opacity: .85, label: 'Visor shine' }), circle(cx - .2 * s, cy - .62 * s, .05 * s, SP.white, { opacity: .85, label: 'Visor shine' }));
  out.push(circle(cx - .5 * s, cy + .22 * s, .13 * s, SP.pink, { opacity: .85, label: 'Cheek' }), circle(cx + .5 * s, cy + .22 * s, .13 * s, SP.pink, { opacity: .85, label: 'Cheek' }));
  out.push(...eyes(cx, cy - .08 * s, s, mood));
  if (mood === 'wow') out.push(ellipse(cx - .12 * s, cy + .22 * s, .24 * s, .3 * s, SP.ink, { label: 'Mouth' }));
  else if (mood === 'sleep') out.push(arcLine(cx, cy + .15 * s, .16 * s, 30, 150, SP.ink, Math.max(3.5, s * .06)));
  else out.push(arcLine(cx, cy + .12 * s, .26 * s, 25, 155, SP.ink, Math.max(4, s * .07)));
  return out;
}

/** Nova: a comet pup — mint head, violet ears, a tail of party-colour circles. dir = degrees the tail points. */
function pup(cx: number, cy: number, r: number, dir = 200, mood: Mood = 'happy', tail = 6): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const a = dir * Math.PI / 180; const cols = [SP.pink, SP.orange, SP.sun, SP.pink, SP.orange, SP.sun, SP.pink];
  const ow = Math.max(4, r * .11);
  for (let k = tail; k >= 1; k--) { const d = r * (.85 + k * .72), rr = r * (.8 - k * .085); const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; out.push(circle(x, y, rr + ow * .7, SP.white, { shadow: k === tail ? SHADOW : undefined, label: 'Comet tail outline' }), circle(x, y, rr, cols[k % cols.length], { label: 'Comet tail' })); if (k % 2) out.push(circle(x + rr * .3, y - rr * .3, rr * .22, '#fff', { opacity: .6 })); }
  out.push(circle(cx - .85 * r, cy + .2 * r, .44 * r + ow, SP.white), circle(cx + .85 * r, cy + .2 * r, .44 * r + ow, SP.white), circle(cx, cy, r + ow, SP.white, { shadow: SHADOW, label: 'Sticker outline' }));
  out.push(circle(cx - .85 * r, cy + .2 * r, .44 * r, SP.violet, { label: 'Ear' }), circle(cx + .85 * r, cy + .2 * r, .44 * r, SP.violet, { label: 'Ear' }), circle(cx, cy, r, SP.mint, { label: 'Head' }));
  out.push(circle(cx, cy + .38 * r, .5 * r, SP.white, { label: 'Muzzle' }), circle(cx, cy + .22 * r, .13 * r, SP.pink, { stroke: SP.ink, strokeWidth: Math.max(2, r * .03), label: 'Nose' }));
  if (mood === 'sleep') out.push(arcLine(cx - .38 * r, cy - .2 * r, .17 * r, 15, 165, SP.ink, Math.max(3, r * .05)), arcLine(cx + .38 * r, cy - .2 * r, .17 * r, 15, 165, SP.ink, Math.max(3, r * .05)));
  else for (const sx of [-1, 1]) { out.push(circle(cx + sx * .38 * r, cy - .2 * r, .2 * r, SP.white, { stroke: SP.ink, strokeWidth: Math.max(2, r * .03) }), circle(cx + sx * .38 * r + (mood === 'wow' ? 0 : sx * .02 * r), cy - .18 * r, .11 * r, SP.ink, { label: 'Pupil' }), circle(cx + sx * .38 * r + .04 * r, cy - .22 * r, .04 * r, '#fff')); }
  if (mood === 'wow') out.push(ellipse(cx - .1 * r, cy + .5 * r, .2 * r, .26 * r, SP.ink, { label: 'Mouth' }));
  else { out.push(arcLine(cx, cy + .36 * r, .17 * r, 20, 160, SP.ink, Math.max(3, r * .05)), circle(cx + .02 * r, cy + .64 * r, .1 * r, SP.pink, { label: 'Tongue' })); }
  return out;
}

function balloon(x: number, y: number, r: number, col: string, tilt = 0): TelaVectorObject[] {
  return [
    line(x, y + r, x + tilt, y + r * 3.2, SP.white, 2.2, { opacity: .85, label: 'Balloon string' }),
    circle(x, y, r + 3, SP.white, { shadow: SHADOW, label: 'Balloon outline' }), circle(x, y, r, col, { label: 'Balloon' }), circle(x - r * .35, y - r * .38, r * .2, '#fff', { opacity: .7, label: 'Balloon shine' }), circle(x, y + r + 4, r * .14, col, { label: 'Balloon knot' }),
  ];
}

function confettiDots(x: number, y: number, w: number, h: number, n: number, seed: number, cols: string[], rMax = 9): TelaVectorObject[] {
  const r = rng(seed); const by: Dot[][] = cols.map(() => []); const glints: Dot[] = [];
  for (let i = 0; i < n; i++) { const rr = 3 + r() * rMax; const px = x + r() * w, py = y + r() * h; by[i % cols.length].push([px, py, rr]); if (i % 4 === 0) glints.push([px - rr * .25, py - rr * .25, rr * .3]); }
  return [...by.flatMap((l, i) => dots(l, cols[i], { label: 'Confetti', shadow: { x: 1, y: 2, blur: 2, color: 'rgba(0,0,0,.3)' } })), ...dots(glints, '#FFFFFF', { opacity: .6, label: 'Confetti glints' })];
}

function orbitRings(cx: number, cy: number, radii: number[], color: string, w = 3.5, op = .8): TelaVectorObject[] { return radii.map(rr => circle(cx, cy, rr, 'none', { stroke: color, strokeWidth: w, dash: [4, 14], opacity: op, label: 'Orbit' })); }


// ── Locked characters & props added for the real story ────────────────────────
/** Mars (locked look): big rose-red planet, darker craters, two VERY large white eyes with round pupils, a tiny round mouth, a blush patch that goes pinker when shy. look = -1..1 pupils left..right. */
function marsFace(cx: number, cy: number, r: number, mood: 'shy' | 'happy' | 'oneeye' | 'plain', seed = 71, look = 0, ux = .6, uy = -.6): TelaVectorObject[] {
  const out = planet(cx, cy, r, SP.pink, seed, ux, uy, { craters: 3, dots: true });
  const e = r * .3, ex = r * .36, ey = cy - r * .12, sw = Math.max(2.5, r * .028);
  out.push(ellipse(cx - r * .72, cy + r * .08, r * .4, r * .22, '#FF7FA6', { opacity: mood === 'shy' ? .95 : .8, label: 'Blush patch' }), ellipse(cx + r * .32, cy + r * .08, r * .4, r * .22, '#FF7FA6', { opacity: mood === 'shy' ? .95 : .8, label: 'Blush patch' }));
  for (const sx of [-1, 1]) {
    if (mood === 'oneeye' && sx === 1) continue;
    out.push(circle(cx + sx * ex, ey, e, SP.white, { stroke: SP.ink, strokeWidth: sw, label: 'Mars eye' }), circle(cx + sx * ex + look * e * .38, ey + e * .12, e * .5, SP.ink, { label: 'Mars pupil' }), circle(cx + sx * ex + look * e * .38 + e * .17, ey + e * .12 - e * .17, e * .16, '#fff', { label: 'Eye glint' }));
  }
  if (mood === 'happy') out.push(arcLine(cx + look * r * .04, cy + r * .34, r * .13, 15, 165, SP.ink, Math.max(3, r * .035)));
  else out.push(circle(cx + look * r * .05, cy + r * .42, r * .06, SP.ink, { label: 'Tiny mouth' }));
  return out;
}

/** Saturn (locked look): golden-yellow planet, big violet ring tilted like a hula hoop, a grinning face. */
function saturn(cx: number, cy: number, r: number, seed = 81, tilt = -20): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const th = tilt * Math.PI / 180; const rw = Math.max(5, r * .17);
  const ringPts = (t0: number, t1: number): Pt[] => Array.from({ length: 22 }, (_, i) => { const t = (t0 + (t1 - t0) * i / 21) * Math.PI / 180; const x = 1.8 * r * Math.cos(t), y = .46 * r * Math.sin(t); return [cx + x * Math.cos(th) - y * Math.sin(th), cy + x * Math.sin(th) + y * Math.cos(th)] as Pt; });
  out.push(poly(ringPts(180, 360), 'none', { open: true, stroke: SP.violet, strokeWidth: rw, label: 'Saturn ring (back)' }));
  out.push(...planet(cx, cy, r, SP.sun, seed, .6, -.6, { craters: 0, dots: true }));
  out.push(poly(ringPts(0, 180), 'none', { open: true, stroke: SP.violet, strokeWidth: rw, label: 'Saturn ring (front)' }), poly(ringPts(0, 180), 'none', { open: true, stroke: '#B58CFF', strokeWidth: rw * .28, label: 'Ring shine' }));
  const s = r * .5;
  for (const sx of [-1, 1]) out.push(circle(cx + sx * s * .42, cy - s * .38, s * .15, SP.ink, { label: 'Eye' }), circle(cx + sx * s * .42 + s * .05, cy - s * .43, s * .05, '#fff'));
  out.push(poly(arcPts(cx, cy - s * .02, s * .52, 0, 180), SP.ink, { label: 'Grin' }), circle(cx, cy + s * .34, s * .2, SP.pink, { label: 'Tongue' }), circle(cx - s * .78, cy + s * .1, s * .2, SP.pink, { opacity: .7 }), circle(cx + s * .78, cy + s * .1, s * .2, SP.pink, { opacity: .7 }));
  return out;
}

/** Jupiter (locked look): a very large orange planet, cream and brown stripes, a booming wide mouth. */
function jupiter(cx: number, cy: number, r: number, seed = 91, whisper = false): TelaVectorObject[] {
  const out: TelaVectorObject[] = [tornDisc(cx, cy, r, SP.orange, seed, {})];
  const bands: Array<[number, number, string]> = [[-.62, .14, '#FFF3D6'], [-.36, .1, '#A5541C'], [.34, .16, '#FFF3D6'], [.62, .1, '#A5541C'], [.82, .08, '#FFF3D6']];
  bands.forEach(([dy, th, col], i) => { const y = cy + dy * r, half = Math.sqrt(Math.max(0, (r * .97) ** 2 - (dy * r) ** 2)); out.push(tornSheet(cx - half, y - th * r / 2, half * 2, th * r, col, seed + i + 1, { fringe: 'none', shadow: false, rough: 2, label: 'Stripe' })); });
  const cr = crescent(cx, cy, r - 2, .6, -.6, r * .34); if (cr.length > 3) out.push(poly(cr, mix(SP.orange, -.3), { opacity: .5, label: 'Planet shade' }));
  const s = r * .5;
  for (const sx of [-1, 1]) out.push(circle(cx + sx * s * .5, cy - s * .35, s * .17, SP.ink, { label: 'Eye' }), circle(cx + sx * s * .5 + s * .06, cy - s * .41, s * .06, '#fff'));
  if (whisper) out.push(circle(cx, cy + s * .35, s * .16, SP.ink, { label: 'Whisper mouth' }));
  else out.push(poly(arcPts(cx, cy + s * .02, s * .62, 0, 180), SP.ink, { label: 'Booming mouth' }), circle(cx, cy + s * .5, s * .22, SP.pink, { label: 'Tongue' }));
  out.push(circle(cx - s * 1.15, cy + s * .3, s * .22, SP.pink, { opacity: .6 }), circle(cx + s * 1.15, cy + s * .3, s * .22, SP.pink, { opacity: .6 }));
  return out;
}

/** A blue-violet planet that goes blub-blub (bubbles drift up). */
function neptune(cx: number, cy: number, r: number, seed = 93): TelaVectorObject[] {
  const out = planet(cx, cy, r, '#3D5AFE', seed, .6, -.6, { craters: 0, dots: true });
  out.push(arcLine(cx, cy + r * .2, r * .6, 200, 340, SP.mint, Math.max(4, r * .06), { label: 'Swirl' }), arcLine(cx, cy - r * .1, r * .62, 20, 160, '#9DB0FF', Math.max(3, r * .045), { label: 'Swirl' }));
  const s = r * .5;
  out.push(circle(cx - s * .42, cy - s * .55, s * .15, SP.ink, { label: 'Eye' }), circle(cx + s * .42, cy - s * .55, s * .15, SP.ink, { label: 'Eye' }), ellipse(cx - s * .22, cy - s * .15, s * .44, s * .34, SP.ink, { label: 'Blub mouth' }));
  [[.8, -1.25, .13], [1.05, -1.65, .09], [.62, -1.85, .07]].forEach(([dx, dy, rr]) => out.push(circle(cx + dx * r, cy + dy * r, rr * r, 'none', { stroke: SP.white, strokeWidth: 3, label: 'Bubble' })));
  return out;
}

/** A pale gold moon with craters. */
function moonDisc(cx: number, cy: number, r: number, seed = 95, face = false): TelaVectorObject[] {
  const out = planet(cx, cy, r, SP.moon, seed, .6, -.6, { craters: 3, dots: false });
  if (face) { const s = r * .5; out.push(circle(cx - s * .4, cy - s * .2, s * .14, SP.ink), circle(cx + s * .4, cy - s * .2, s * .14, SP.ink), arcLine(cx, cy + s * .05, s * .35, 20, 160, SP.ink, Math.max(3, r * .04))); }
  return out;
}

/** The party cake: paper tiers, drips, a candle. cx,cy = the middle of the bottom of the cake. */
function cake(cx: number, cy: number, s: number): TelaVectorObject[] {
  const o: TelaVectorObject[] = [];
  o.push(ellipse(cx - s * 1.25, cy - s * .12, s * 2.5, s * .34, SP.white, { shadow: SHADOW, label: 'Cake plate' }));
  o.push(tornSheet(cx - s, cy - s * .7, s * 2, s * .7, SP.pink, 301, { rough: 2, label: 'Cake tier' }), tornSheet(cx - s * .62, cy - s * 1.25, s * 1.24, s * .56, SP.mint, 302, { rough: 2, label: 'Cake tier' }));
  const drips: Dot[] = []; for (let i = 0; i < 6; i++) drips.push([cx - s * .5 + i * s * .2, cy - s * 1.22, s * .1, s * (.1 + (i % 2) * .08)]);
  o.push(...dots(drips, SP.white, { label: 'Frosting drips' }), ...dots([[cx - s * .7, cy - s * .35, s * .07], [cx - s * .2, cy - s * .35, s * .07], [cx + s * .3, cy - s * .35, s * .07], [cx + s * .75, cy - s * .35, s * .07]], SP.sun, { label: 'Sprinkles' }));
  o.push(rect(cx - s * .05, cy - s * 1.7, s * .1, s * .46, SP.sun, { label: 'Candle' }), circle(cx, cy - s * 1.8, s * .13, SP.orange, { label: 'Flame' }), circle(cx, cy - s * 1.78, s * .06, SP.sun));
  return o;
}

/** Zib's kazoo: a little violet tube with a white mouthpiece. */
function kazoo(x: number, y: number, len: number, rot: number): TelaVectorObject[] {
  return [rect(x, y, len, len * .3, SP.violet, { rx: len * .1, rotation: rot, stroke: SP.white, strokeWidth: 3, label: 'Kazoo' }), rect(x + len * .04, y + len * .08, len * .22, len * .14, SP.white, { rx: 3, rotation: rot, label: 'Kazoo mouthpiece' })];
}

function musicNotes(cx: number, cy: number, s: number, cols: string[]): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  cols.forEach((c, i) => { const x = cx + i * s * 1.5, y = cy - (i % 2) * s * .9; out.push(line(x + s * .5, y, x + s * .5, y - s * 1.7, c, Math.max(3, s * .16), { label: 'Note stem' }), circle(x, y, s * .5, c, { stroke: SP.white, strokeWidth: 2.5, label: 'Note' }), poly([[x + s * .5, y - s * 1.7], [x + s * 1.2, y - s * 1.3], [x + s * .5, y - s * 1.1]], c, { label: 'Note flag' })); });
  return out;
}

function barcode(x: number, y: number, w: number, h: number, seed: number): TelaVectorObject[] {
  const r = rng(seed); const rings: Pt[][] = []; let px = x + 14;
  while (px < x + w - 20) { const bw = 2 + Math.floor(r() * 4); rings.push([[px, y + 14], [px + bw, y + 14], [px + bw, y + h - 14], [px, y + h - 14]]); px += bw + 2 + Math.floor(r() * 4); }
  return [tornSheet(x, y, w, h, SP.white, seed + 1, { rough: 3, label: 'Barcode box' }), multiPoly(rings, SP.ink, { label: 'Barcode' })];
}

/** A torn paper sheet with the story text fitted inside it (sheet height grows to the text). */
function sheetText(x: number, y: number, w: number, ps: string[], o: { fill: string; ink: string; max: number; min?: number; maxH: number; rot?: number; seed?: number; padX?: number; padY?: number; align?: 'left' | 'center'; label?: string; rough?: number }): { objs: TelaVectorObject[]; h: number; size: number } {
  const padX = o.padX ?? 36, padY = o.padY ?? 24;
  const fit = fitText('fredoka6', ps, w - padX * 2, o.maxH - padY * 2, o.max, o.min ?? 22);
  const h = Math.ceil(fit.h) + padY * 2;
  return { size: fit.size, h, objs: [tornSheet(x, y, w, h, o.fill, o.seed ?? 51, { rotation: o.rot, rough: o.rough ?? 6, label: o.label || 'Story sheet' }), block(x + padX, y + padY, w - padX * 2, fit.lines, fit.size, 'fredoka6', o.ink, { rotation: o.rot, align: o.align ?? 'left', label: 'Story text' })] };
}

const bg = (c: string) => rect(0, 0, W, H, c, { label: 'Page ground', role: 'GROUND' });
type SpacePage = (s: ShowcaseSpread) => TelaVectorObject[];

// 1 · COVER ─────────────────────────────────────────────────────────────────────
function spaceCover(s: ShowcaseSpread): TelaVectorObject[] {
  const [w1, w2] = s.text.split(/\s+/);
  const o: TelaVectorObject[] = [bg(SP.violet)];
  o.push(...flecks(0, 0, W, H, 70, [SP.white, SP.mint, SP.pink], 11, 3, .5));
  o.push(...halftone(0, 520, 360, 248, 22, SP.plum, { grade: 'y', max: 9, min: 1, opacity: .85 }));
  o.push(...bigSun(905, 700, 215, 4, 'none'));
  o.push(...orbitRings(480, 560, [200, 320, 440], SP.white, 3.5, .75));
  o.push(...planet(150, 330, 58, SP.mint, 31, .8, -.5, { craters: 3 }), ...planet(905, 330, 44, SP.pink, 32, -.7, -.5, { dots: true, ring: 'rgba(255,255,255,.8)' }), ...planet(80, 640, 40, SP.sun, 33, .8, -.5, { craters: 2 }), ...planet(700, 215, 30, SP.mint, 34, -.6, .5, { craters: 1 }));
  o.push(...balloon(150, 520, 38, SP.pink, -10), ...balloon(222, 470, 30, SP.mint, 8), ...balloon(95, 450, 28, SP.sun, 12));
  o.push(...pup(790, 520, 66, 20, 'happy', 6));
  o.push(...astro(470, 520, 100, 'happy', true));
  o.push(...cake(640, 745, 54));
  o.push(...confettiDots(20, 340, 980, 420, 38, 5, [SP.pink, SP.mint, SP.sun, SP.white, SP.orange]));
  const t1 = fitSize('chango', w1.toUpperCase(), 800, 168), t2 = fitSize('chango', w2.toUpperCase(), 860, 168);
  o.push(...lettered(512, 14, w1.toUpperCase(), t1, 'chango', { colors: [SP.sun, SP.mint, SP.white, SP.pink, SP.sun], outline: SP.ink, ow: 14, shadow: SP.ink, sx: 7, sy: 9, bounce: 12, rot: 7, seed: 4, label: 'Title' }));
  o.push(...lettered(512, 176, w2.toUpperCase(), t2, 'chango', { colors: [SP.pink, SP.white, SP.mint, SP.sun, SP.pink, SP.mint], outline: SP.ink, ow: 14, shadow: SP.ink, sx: 7, sy: 9, bounce: 12, rot: 7, seed: 9, label: 'Title' }));
  return o;
}

// 2 · HERO ──────────────────────────────────────────────────────────────────────
function spaceHero(s: ShowcaseSpread): TelaVectorObject[] {
  const o: TelaVectorObject[] = [bg(SP.ink)];
  o.push(...starsField(0, 0, W, H, 90, 7), ...flecks(0, 0, W, H, 40, [SP.violet, SP.pink], 3, 3, .5));
  o.push(...bigSun(960, 70, 200, 6, 'happy'));
  o.push(...orbitRings(960, 70, [330, 450, 570], SP.mint, 3, .6));
  const sx = 960 - 250, sy = 70 - 760; const sl = Math.hypot(sx, sy);
  o.push(...planet(230, 780, 420, SP.pink, 41, sx / sl, sy / sl, { craters: 5, dots: true }));
  o.push(...planet(150, 520, 54, SP.mint, 42, .8, -.6, { craters: 2, ring: 'rgba(255,255,255,.7)' }), ...planet(640, 175, 40, SP.violet, 43, .9, -.4, { craters: 2 }), ...moonDisc(520, 440, 64, 44));
  o.push(...pup(880, 610, 60, 160, 'happy', 6));
  o.push(...astro(720, 430, 88, 'happy', true));
  o.push(...cake(610, 650, 40), ...kazoo(790, 420, 70, -28));
  o.push(...confettiDots(540, 250, 440, 460, 18, 8, [SP.pink, SP.mint, SP.sun, SP.white], 7));
  o.push(...sheetText(34, 38, 600, parasOf(s), { fill: SP.mint, ink: SP.ink, max: 33, maxH: 320, rot: -2.5, seed: 51, padX: 42, padY: 26 }).objs);
  return o;
}

// 3 · VIGNETTE: Nova sniffs out the planets (text inside the big sun) ─────────────
function spaceSun(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.pink)];
  o.push(...flecks(0, 0, W, H, 60, [SP.white, SP.violet], 21, 3, .45));
  o.push(...halftone(560, 0, 464, 260, 22, '#C4003F', { grade: 'y', flip: true, max: 9, min: 1, opacity: .8 }));
  o.push(...orbitRings(300, 400, [330, 420], SP.white, 3.5, .7));
  o.push(...bigSun(300, 400, 232, 9, 'none'));
  o.push(...planet(800, 600, 120, SP.violet, 61, -.6, -.5, { craters: 3, dots: true, ring: 'rgba(255,255,255,.8)' }));
  o.push(...planet(960, 330, 60, SP.mint, 62, -.7, .3, { craters: 2 }), ...planet(560, 560, 40, SP.sun, 63, -.4, .8), ...planet(620, 700, 30, SP.white, 64, -.2, -.8, { craters: 2 }));
  o.push(...pup(850, 150, 76, 190, 'wow', 6));
  o.push(...confettiDots(580, 40, 440, 700, 26, 12, [SP.sun, SP.mint, SP.white, SP.ink], 8));
  const fit = fitText('fredoka6', [flow(L[0], L[1])], 330, 200, 34);
  o.push(blockAt(300, 322, fit.lines, fit.size, 'fredoka6', SP.ink, { align: 'center', label: 'Story text' }));
  const [a, b] = L[2].split(/\s(?=Woof)/); // "Sniff! Sniff!" / "Woof!"
  o.push(...lettered(300, 428, a, fitSize('chango', a, 350, 46), 'chango', { colors: [SP.pink, SP.violet, SP.ink], outline: SP.white, ow: 8, bounce: 4, rot: 3, seed: 3, label: 'Sniff' }));
  o.push(...lettered(300, 480, b, fitSize('chango', b, 300, 64), 'chango', { colors: [SP.pink, SP.ink, SP.violet], outline: SP.white, ow: 9, bounce: 5, rot: 4, seed: 8, label: 'Woof' }));
  return o;
}

// 4 · PANORAMA: the planets arrive ────────────────────────────────────────────────
function spaceParade(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.ink)];
  o.push(...starsField(0, 0, W, H, 100, 57), ...flecks(0, 0, W, H, 40, [SP.violet, SP.pink], 13, 3, .5));
  o.push(...orbitRings(520, 760, [330, 470, 610], SP.mint, 3, .45));
  o.push(...saturn(150, 450, 80, 81, -20), ...jupiter(400, 440, 125, 91), ...neptune(655, 480, 66, 93), ...moonDisc(805, 395, 44, 95, true));
  // the Moon's snack plate
  o.push(ellipse(765, 452, 90, 22, SP.white, { shadow: SHADOW, label: 'Snack plate' }), circle(790, 446, 10, SP.pink), circle(812, 444, 10, SP.mint), circle(834, 446, 10, SP.sun));
  o.push(...astro(905, 170, 52, 'happy', true), ...pup(760, 160, 40, 160, 'happy', 4));
  // the empty place where Mars would be
  o.push(circle(925, 560, 56, 'none', { stroke: SP.white, strokeWidth: 4, dash: [6, 12], label: 'Empty place' }), circle(925, 560, 80, 'none', { stroke: SP.mint, strokeWidth: 3, dash: [4, 14], opacity: .6, label: 'Orbit' }));
  // floating party table
  o.push(tornSheet(610, 712, 380, 34, SP.white, 405, { rough: 3, label: 'Party table' }), ...cake(800, 716, 34));
  o.push(...confettiDots(0, 0, W, H, 18, 15, [SP.pink, SP.mint, SP.sun, SP.white], 7));
  o.push(...sheetText(28, 28, 640, L.slice(0, 4), { fill: SP.mint, ink: SP.ink, max: 31, maxH: 260, rot: -1.5, seed: 52, padX: 36, padY: 22 }).objs);
  o.push(...lettered(300, 592, L[4], fitSize('chango', L[4], 540, 58), 'chango', { colors: [SP.sun, SP.mint, SP.white, SP.pink], outline: SP.ink, ow: 9, shadow: SP.violet, sx: 4, sy: 5, bounce: 6, rot: 3, seed: 4, label: 'Everyone came' }));
  o.push(...lettered(300, 662, L[5], fitSize('chango', L[5], 540, 50), 'chango', { colors: [SP.pink, SP.white, SP.mint, SP.sun], outline: SP.ink, ow: 9, shadow: SP.violet, sx: 4, sy: 5, bounce: 6, rot: 3, seed: 9, label: 'Almost everyone' }));
  return o;
}

// 5 · QUIET: Shhh. ───────────────────────────────────────────────────────────────
function spaceQuiet(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.plum)];
  o.push(...starsField(0, 0, W, H, 60, 17, [SP.white, SP.mint, SP.pink]));
  // Mars hides behind a hill of crater-ground and peeks over it
  o.push(...marsFace(830, 380, 118, 'shy', 71, -.9, -.6, .6));
  o.push(...planet(880, 1010, 540, SP.violet, 72, -.2, -1, { craters: 5, dots: true }));
  o.push(...planet(120, 1010, 380, SP.pink, 73, .3, -1, { craters: 3, dots: true }));
  o.push(...astro(540, 560, 30, 'wow'));
  o.push(...flecks(0, 0, W, H, 30, [SP.violet], 4, 3, .5));
  const fit = fitText('fredoka6', L.slice(1), 470, 150, 36);
  o.push(...lettered(285, 150, L[0], fitSize('chango', L[0], 480, 160), 'chango', { colors: [SP.white, SP.mint, SP.white, SP.sun, SP.pink], outline: SP.ink, ow: 12, shadow: SP.violet, sx: 6, sy: 8, bounce: 8, rot: 4, seed: 2, label: 'Whisper' }));
  o.push(blockAt(280, 450, fit.lines, fit.size, 'fredoka6', SP.white, { align: 'center', label: 'Story text' }));
  return o;
}

// 6 · STRIP: three failed attempts, three round windows ─────────────────────────────
function portholeScene(cx: number, cy: number, r: number, ground: string, seed: number): TelaVectorObject[] {
  return [circle(cx, cy, r + 26, SP.white, { shadow: SHADOW, label: 'Porthole frame' }), circle(cx, cy, r + 8, SP.violet, { label: 'Porthole rim' }), circle(cx, cy, r, ground, { label: 'Porthole glass' }), ...starsField(cx - r * .8, cy - r * .8, r * 1.6, r * 1.6, 12, seed, [SP.white, SP.sun]).filter((_, i) => i < 14)];
}
function spaceStrip(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.sun)];
  o.push(...halftone(0, 0, W, 190, 24, SP.orange, { grade: 'y', flip: true, max: 10, min: 1, opacity: .7 }));
  o.push(...flecks(0, 0, W, H, 40, [SP.pink, SP.violet], 91, 3, .4));
  const R = 90, cys = [140, 388, 636];
  // A: knock, knock (a round crater door; nobody home)
  o.push(...portholeScene(140, cys[0], R, SP.ink, 1), ...planet(168, 125, 56, SP.pink, 81, -.6, -.6, { craters: 2, dots: true }), circle(168, 138, 22, SP.ink, { stroke: SP.white, strokeWidth: 4, label: 'Crater door' }), circle(178, 140, 4, SP.sun, { label: 'Door knob' }));
  o.push(...astro(98, 158, 17, 'happy', true), arcLine(120, 128, 12, 250, 330, SP.white, 3, { label: 'Knock' }), arcLine(120, 128, 22, 250, 330, SP.white, 3, { label: 'Knock' }));
  // B: a balloon pops, a loud song
  o.push(...portholeScene(884, cys[1], R, SP.violet, 2), ...astro(856, 368, 21, 'wow'), ...dots([[920, 335, 5], [932, 352, 4], [908, 322, 4], [938, 330, 3], [925, 365, 3]], SP.pink, { label: 'Balloon scraps' }), ...musicNotes(895, 428, 8, [SP.sun, SP.mint, SP.white]));
  // C: a big stomping dance; Mars peeks with one eye
  o.push(...portholeScene(140, cys[2], R, SP.ink, 3), ...astro(105, 610, 23, 'happy', true), ...pup(172, 676, 14, 200, 'happy', 3), line(60, 690, 84, 700, SP.white, 3, { label: 'Stomp' }), line(100, 704, 112, 722, SP.white, 3, { label: 'Stomp' }), line(140, 706, 160, 720, SP.white, 3, { label: 'Stomp' }), ...marsFace(222, 622, 46, 'oneeye', 74, -.8));
  o.push(...confettiDots(20, 20, 984, 740, 24, 33, [SP.pink, SP.violet, SP.mint, SP.white], 8));
  const rows: Array<[number, number, string[], string, number, number]> = [[300, 24, L.slice(0, 2), SP.white, 42, -1.5], [34, 276, L.slice(2, 4), SP.mint, 38, 1.5], [300, 520, ['Zib tried a big, loud dance.', 'Stomp, stomp, stomp!', L[5]], SP.pink, 36, -1]];
  rows.forEach(([x, y, ps, fill, max, rot], i) => {
    const ink = fill === SP.pink ? SP.white : SP.ink;
    const w = 690, fit = fitText('fredoka6', ps, w - 76, 200, max);
    const h = Math.ceil(fit.h) + 50, yy = cys[i] - h / 2;
    o.push(tornSheet(x, yy, w, h, fill, 120 + i, { rotation: rot, rough: 6, label: 'Story sheet' }), block(x + 38, yy + 25, w - 76, fit.lines, fit.size, 'fredoka6', ink, { rotation: rot, label: 'Story text' }));
  });
  return o;
}

// 7 · REVEAL: the scale-shock face ───────────────────────────────────────────────
function spaceShock(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.ink)];
  o.push(...starsField(0, 0, W, H, 80, 27), ...orbitRings(512, 400, [420, 520, 620], SP.mint, 3, .55));
  const ux = 0.7, uy = -0.7;
  o.push(...planet(512, 560, 540, SP.pink, 101, ux, uy, { craters: 0, dots: true }));
  // the whole face is bigger than the page: eyes either side of the fold, a tiny mouth off to one side
  for (const [ex, ey] of [[310, 270], [725, 255]]) { o.push(circle(ex, ey, 118, SP.white, { stroke: SP.ink, strokeWidth: 8, shadow: SHADOW, label: 'Mars eye' }), circle(ex + 38, ey + 26, 64, SP.ink, { label: 'Mars pupil' }), circle(ex + 60, ey + 2, 23, SP.white, { label: 'Eye glint' }), circle(ex + 32, ey + 56, 9, SP.white)); }
  o.push(ellipse(120, 380, 190, 120, '#FF7FA6', { opacity: .9, label: 'Blush patch' }), ellipse(780, 360, 190, 120, '#FF7FA6', { opacity: .9, label: 'Blush patch' }), ...halftone(150, 410, 110, 70, 14, '#8B0030', { grade: 'x', max: 5, min: 1, opacity: .6 }));
  o.push(circle(610, 430, 16, SP.ink, { label: 'Tiny mouth' }));
  o.push(...astro(78, 96, 28, 'wow'), ...kazoo(40, 168, 60, 70), ...pup(956, 96, 24, 20, 'wow', 3));
  o.push(...sheetText(66, 548, 892, L, { fill: SP.white, ink: SP.ink, max: 30, maxH: 214, rot: -.8, seed: 53, padX: 34, padY: 20 }).objs);
  return o;
}

// 8 · VIGNETTE: Zib sits down beside Mars ─────────────────────────────────────────
function spaceSit(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.plum)];
  o.push(...starsField(0, 0, W, H, 70, 63, [SP.white, SP.mint, SP.sun]), ...flecks(0, 0, W, H, 30, [SP.violet], 14, 3, .5));
  o.push(...planet(512, 1160, 650, SP.violet, 111, 0, -1, { craters: 6, dots: true }));
  o.push(...pup(190, 563, 38, 200, 'happy', 5));
  o.push(...astro(340, 376, 58, 'happy', false));
  o.push(...marsFace(600, 428, 90, 'shy', 75, -.7));
  o.push(...cake(900, 636, 36));
  o.push(...sheetText(28, 22, 480, [L[0], L[1], L[2]], { fill: SP.mint, ink: SP.ink, max: 29, maxH: 300, rot: -1.2, seed: 54, padX: 30, padY: 22 }).objs);
  o.push(...sheetText(528, 22, 470, L.slice(3, 6), { fill: SP.sun, ink: SP.ink, max: 30, maxH: 330, rot: 1.2, seed: 55, padX: 30, padY: 22 }).objs);
  o.push(...sheetText(60, 648, 904, [L[6]], { fill: SP.white, ink: SP.ink, max: 28, maxH: 112, rot: -.6, seed: 56, padX: 34, padY: 14 }).objs);
  return o;
}

// 9 · CLOSING: Mars rolls out and the sky dances small ─────────────────────────────
function spaceDance(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.mint)];
  o.push(...flecks(0, 0, W, H, 60, [SP.white, SP.violet], 5, 3, .4), ...halftone(560, 440, 460, 330, 24, '#00C9A0', { grade: 'y', max: 10, min: 1, opacity: .8 }));
  o.push(line(790, 0, 790, 150, SP.ink, 4, { label: 'Disco string' }));
  o.push(circle(790, 215, 70, SP.ink, { shadow: SHADOW }), ...discDots(790, 215, 70, 14, SP.white, 0, 0, .9), ...discDots(790, 215, 70, 28, SP.mint, -.6, -.6, .9), circle(770, 192, 13, '#fff', { opacity: .8 }));
  o.push(...orbitRings(400, 420, [190, 300], SP.white, 3.5, .7));
  o.push(...jupiter(110, 405, 82, 91, true), ...marsFace(300, 410, 88, 'happy', 76, .2), ...astro(470, 380, 48, 'happy', true), ...pup(260, 620, 40, 200, 'happy', 5), ...saturn(700, 410, 62, 82, -24), ...planet(950, 330, 40, SP.violet, 113, -.6, -.5, { ring: 'rgba(13,0,21,.7)', dots: true }), ...planet(600, 300, 28, SP.pink, 114, -.6, -.5, { craters: 2 }));
  o.push(...confettiDots(0, 0, W, H, 30, 15, [SP.pink, SP.violet, SP.sun, SP.white], 9));
  o.push(...sheetText(28, 26, 520, L.slice(0, 5), { fill: SP.sun, ink: SP.ink, max: 30, maxH: 250, rot: -1.5, seed: 57, padX: 30, padY: 22 }).objs);
  o.push(...sheetText(330, 528, 666, L.slice(5, 10), { fill: SP.white, ink: SP.ink, max: 28, maxH: 226, rot: 1, seed: 58, padX: 30, padY: 20 }).objs);
  return o;
}

// 10 · QUIET: good night ────────────────────────────────────────────────────────
function spaceNight(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [bg(SP.ink)];
  o.push(...starsField(0, 0, W, H, 70, 41), ...flecks(0, 0, W, H, 40, [SP.violet, SP.pink], 6, 3, .5));
  o.push(...bigSun(512, 360, 190, 7, 'sleep'));
  o.push(...planet(512, 940, 330, SP.violet, 131, 0, -1, { craters: 3, dots: true }));
  o.push(...astro(560, 585, 34, 'sleep'), ...pup(680, 620, 26, 200, 'sleep', 3));
  o.push(...lettered(512, 20, L[0], fitSize('chango', L[0], 960, 70), 'chango', { colors: [SP.sun, SP.mint, SP.white, SP.pink], outline: SP.ink, ow: 11, shadow: SP.violet, sx: 5, sy: 7, bounce: 6, rot: 4, seed: 3, label: 'Closing line' }));
  o.push(...lettered(215, 690, L[1], 50, 'chango', { colors: [SP.mint, SP.white, SP.sun], outline: SP.ink, ow: 9, bounce: 4, rot: 3, seed: 1, label: 'The end' }));
  return o;
}

// 11 · BACK COVER ───────────────────────────────────────────────────────────────
function spaceBack(s: ShowcaseSpread): TelaVectorObject[] {
  const o: TelaVectorObject[] = [bg(SP.violet)];
  o.push(...flecks(0, 0, W, H, 70, [SP.white, SP.mint, SP.pink], 12, 3, .5), ...starsField(0, 0, W, H, 40, 46));
  o.push(...halftone(0, 520, 360, 248, 22, SP.plum, { grade: 'y', max: 9, min: 1, opacity: .85 }));
  // a ring of planets around the floating cake, with one empty place
  const cx = 770, cy = 255;
  o.push(...orbitRings(cx, cy, [175], SP.white, 3.5, .8));
  const guests: Array<[string, number, string]> = [[SP.sun, 40, 'sat'], [SP.mint, 34, 'p'], [SP.orange, 46, 'p'], [SP.white, 30, 'p'], [SP.moon, 34, 'p']];
  const angles = [-100, -40, 20, 80, 150, 210];
  guests.forEach(([col, r], i) => { const a = angles[i] * Math.PI / 180; const px = cx + Math.cos(a) * 175, py = cy + Math.sin(a) * 175; if (i === 0) o.push(...saturn(px, py, r * .8, 83, -18)); else o.push(...planet(px, py, r, col, 140 + i, -.6, -.6, { craters: 1 + (i % 3), dots: i % 2 === 0 })); });
  const ga = angles[5] * Math.PI / 180; o.push(circle(cx + Math.cos(ga) * 175, cy + Math.sin(ga) * 175, 36, 'none', { stroke: SP.white, strokeWidth: 4, dash: [6, 10], label: 'Empty place' }));
  o.push(...cake(cx, cy + 38, 52));
  o.push(...astro(868, 560, 52, 'happy', true), ...pup(700, 600, 34, 200, 'happy', 4));
  o.push(...lettered(300, 22, 'ORBIT PARTY!', fitSize('chango', 'ORBIT PARTY!', 560, 86), 'chango', { colors: [SP.sun, SP.mint, SP.white, SP.pink], outline: SP.ink, ow: 11, shadow: SP.ink, sx: 5, sy: 7, bounce: 7, rot: 4, seed: 4, label: 'Title' }));
  o.push(...sheetText(34, 150, 540, parasOf(s), { fill: SP.mint, ink: SP.ink, max: 32, maxH: 400, rot: -1.2, seed: 59, padX: 34, padY: 26 }).objs);
  o.push(...barcode(40, 598, 230, 128, 410));
  o.push(tornSheet(300, 668, 320, 62, SP.white, 415, { rotation: 1, rough: 4, label: 'Imprint sheet' }), block(312, 679, 296, ['Ages 4-6', 'Plajah Story Studio'], 22, 'fredoka6', SP.ink, { align: 'center', lh: 1.15, rotation: 1, label: 'Imprint' }));
  return o;
}

const SPACE_PLAN: Array<[ShowcaseSpread['beat'], SpacePage]> = [
  ['cover', spaceCover], ['hero', spaceHero], ['vignette', spaceSun], ['panorama', spaceParade], ['quiet', spaceQuiet], ['strip', spaceStrip],
  ['reveal', spaceShock], ['vignette', spaceSit], ['closing', spaceDance], ['quiet', spaceNight], ['back', spaceBack],
];
function spaceDesign(ctx: PublicationCtx): TelaVectorObject[] {
  const s = spreadFor(ctx); const plan = SPACE_PLAN[ctx.pageIndex];
  if (!plan || plan[0] !== s.beat) throw new Error(`story-space: spread ${s.n} is a "${s.beat}" page but the page plan expects "${plan?.[0]}"`);
  return plan[1](s);
}

// ══════════════════════════════════════════════════════════════════════════════
//  LITTLE FOX, BIG TREES — story-forest
// ══════════════════════════════════════════════════════════════════════════════
const FP = { pine: '#0B3C1A', verm: '#FF4500', gold: '#FFD700', bark: '#8B4513', lime: '#ADFF2F', cream: '#FFF3D6', night: '#1E0B00', deep: '#062A12', ember: '#C93200', fawn: '#B8651C' };
const tri = (a: Pt, b: Pt, c: Pt, fill: string, o: Parameters<typeof poly>[2] = {}) => poly([a, b, c], fill, o);
const lerpP = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const circlePtsN = (cx: number, cy: number, r: number, n: number): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(i / n * 6.2832), cy + r * Math.sin(i / n * 6.2832)] as Pt);

function trunk(x: number, y0: number, y1: number, w: number, seed: number, col: string, lit: 'l' | 'r', o: { reg?: string; grain?: string; litCol?: string; label?: string } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const r = rng(seed); const h = y1 - y0;
  const pts = jitter([[x, y0], [x + w / 2, y0], [x + w, y0], [x + w, y0 + h / 2], [x + w, y1], [x + w / 2, y1], [x, y1], [x, y0 + h / 2]], seed, 4, 3);
  if (o.reg) out.push(poly(pts.map(p => [p[0] + 6, p[1] + 3] as Pt), o.reg, { opacity: .9, label: 'Print offset' }));
  out.push(poly(pts, col, { stroke: FP.night, strokeWidth: 3, label: o.label || 'Trunk' }));
  const lw = w * .17; const lx = lit === 'l' ? x + 4 : x + w - lw - 4;
  out.push(poly(tornRect(lx, y0, lw, h, seed + 3, 2, 2), o.litCol || mix(col, .38), { opacity: .75, label: 'Lit edge' }));
  const gr: Pt[][] = [];
  for (let k = 0; k < 7; k++) { const gx = x + w * (.14 + r() * .72), gy = y0 + r() * h * .8, gl = h * (.12 + r() * .25); gr.push([[gx, gy], [gx + 2.6, gy + gl * .5], [gx, gy + gl], [gx - 2.2, gy + gl * .5]]); }
  out.push(multiPoly(gr, o.grain || mix(col, -.4), { opacity: .8, label: 'Wood grain' }));
  const nt: Pt[][] = []; for (let k = 0; k < 4; k++) { const ny = y0 + h * (.15 + r() * .7), nx = r() > .5 ? x : x + w; const d = nx === x ? -1 : 1; nt.push([[nx, ny], [nx + d * 9, ny + 6], [nx, ny + 12]]); }
  out.push(multiPoly(nt, mix(col, -.35), { label: 'Notches' }));
  return out;
}

function fir(cx: number, baseY: number, h: number, w: number, col: string, litCol: string, tiers = 4, o: { stroke?: boolean; lit?: 'l' | 'r' } = {}): TelaVectorObject[] {
  const out: TelaVectorObject[] = []; const step = h / (tiers + .5);
  out.push(rect(cx - w * .07, baseY - step * .5, w * .14, step * .7, FP.bark, { label: 'Fir trunk' }));
  for (let i = tiers - 1; i >= 0; i--) {
    const top = baseY - h + i * step * .78, bot = top + step * 1.45, wi = w * (.42 + .58 * (i + 1) / tiers) / 2;
    const base: Pt[] = [[cx, top], [cx + wi, bot], [cx + wi * .55, bot - step * .12], [cx, bot + step * .06], [cx - wi * .55, bot - step * .12], [cx - wi, bot]];
    out.push(poly(base, col, { stroke: o.stroke ? FP.night : undefined, strokeWidth: o.stroke ? 2.5 : 0, label: 'Fir tier' }));
    const s = o.lit === 'l' ? -1 : 1;
    out.push(poly([[cx, top], [cx + s * wi, bot], [cx + s * wi * .55, bot - step * .12], [cx, bot + step * .06]], litCol, { opacity: .85, label: 'Fir light' }));
  }
  return out;
}

function sunRays(cx: number, cy: number, len: number, n: number, c1: string, c2: string, a0: number, spread: number, seed = 1): TelaVectorObject[] {
  const A: Pt[][] = [], B: Pt[][] = []; const step = spread / n; const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (a0 + i * step) * Math.PI / 180, b = (a0 + (i + .62) * step) * Math.PI / 180, l = len * (.85 + r() * .3);
    (i % 2 ? B : A).push([[cx, cy], [cx + Math.cos(a) * l, cy + Math.sin(a) * l], [cx + Math.cos(b) * l, cy + Math.sin(b) * l]]);
  }
  return [multiPoly(A, c1, { label: 'Sun rays' }), multiPoly(B, c2, { label: 'Sun rays' })];
}
function lowSun(cx: number, cy: number, r: number, rays = true): TelaVectorObject[] {
  const out: TelaVectorObject[] = [];
  if (rays) out.push(...sunRays(cx, cy, r * 3.2, 22, 'rgba(255,215,0,.35)', 'rgba(255,140,0,.28)', 0, 360, 3));
  out.push(poly(circlePtsN(cx, cy, r * 1.25, 16), FP.verm, { opacity: .9, label: 'Sun glow' }), poly(circlePtsN(cx, cy, r, 16), FP.gold, { stroke: FP.cream, strokeWidth: 4, label: 'Sun' }));
  return out;
}

function beams(sx: number, sy: number, targets: Array<[number, number, number]>, op = .24): TelaVectorObject[] {
  return targets.map(([tx, ty, tw2]) => poly([[sx, sy], [tx - tw2, ty], [tx + tw2, ty]], FP.gold, { opacity: op, label: 'Light beam' }));
}

type FMood = 'happy' | 'wow' | 'sleep';
function foxEyes(cx: number, cy: number, s: number, mood: FMood): TelaVectorObject[] {
  if (mood === 'sleep') return [arcLine(cx - .5 * s, cy - .2 * s, .2 * s, 20, 160, FP.night, Math.max(3, s * .07)), arcLine(cx + .5 * s, cy - .2 * s, .2 * s, 20, 160, FP.night, Math.max(3, s * .07))];
  const er = (mood === 'wow' ? .19 : .14) * s; const out: TelaVectorObject[] = [];
  for (const sx of [-1, 1]) out.push(circle(cx + sx * .52 * s, cy - .18 * s, er, FP.night, { label: 'Eye' }), circle(cx + sx * .52 * s + er * .3, cy - .18 * s - er * .3, er * .36, '#fff', { label: 'Eye glint' }));
  return out;
}

/** Fen the fox: every part a triangle. cx,cy = head centre; s = head half-width; dir = 1 tail right, -1 tail left. */
function fox(cx: number, cy: number, s: number, mood: FMood = 'happy', dir = 1, tail = true, o: { ring?: boolean } = {}): TelaVectorObject[] {
  const P = (dx: number, dy: number): Pt => [cx + dir * dx * s, cy + dy * s]; const sw = Math.max(2.5, s * .05); const st = { stroke: FP.night, strokeWidth: sw };
  const out: TelaVectorObject[] = [];
  if (tail) out.push(poly([P(.8, 3.0), P(3.1, 1.3), P(2.1, 3.35)], FP.verm, { ...st, label: 'Tail' }), tri(P(3.1, 1.3), lerpP(P(.8, 3.0), P(3.1, 1.3), .62), lerpP(P(2.1, 3.35), P(3.1, 1.3), .62), FP.cream, { label: 'Tail tip' }));
  out.push(poly([P(.2, .9), P(-.95, 3.45), P(1.35, 3.45)], FP.ember, { opacity: .8, label: 'Print offset' }));
  out.push(poly([P(0, .8), P(-1.15, 3.35), P(1.15, 3.35)], FP.verm, { ...st, label: 'Body' }), tri(P(-.55, 1.35), P(.55, 1.35), P(0, 3.3), FP.cream, { label: 'Bib' }));
  out.push(rect(cx - .85 * s, cy + 3.3 * s, .6 * s, .32 * s, FP.night, { label: 'Paw' }), rect(cx + .25 * s, cy + 3.3 * s, .6 * s, .32 * s, FP.night, { label: 'Paw' }));
  for (const sx of [-1, 1]) out.push(poly([P(sx * 1.2, -.5), P(sx * 1.08, -1.75), P(sx * .3, -.6)], FP.verm, { ...st, label: 'Ear' }), tri(P(sx * .95, -.6), P(sx * 1.0, -1.35), P(sx * .5, -.62), FP.cream, { label: 'Ear inner' }));
  out.push(poly([P(-1.0, -.42), P(1.4, -.42), P(.8, .62), P(.2, 1.12), P(-.42, .62)], FP.ember, { opacity: .8, label: 'Print offset' }));
  out.push(poly([P(-1.2, -.5), P(1.2, -.5), P(.62, .55), P(0, 1.05), P(-.62, .55)], FP.verm, { ...st, label: 'Head' }));
  out.push(poly([P(-.95, .02), P(.95, .02), P(.5, .6), P(0, 1.05), P(-.5, .6)], FP.cream, { label: 'Muzzle' }));
  if (o.ring) out.push(circle(...P(1.12, -1.15), .26 * s, 'none', { stroke: FP.gold, strokeWidth: Math.max(3, s * .13), label: 'Gold ear ring' }));
  out.push(...foxEyes(cx, cy, s, mood), tri([cx - .17 * s, cy + .3 * s], [cx + .17 * s, cy + .3 * s], [cx, cy + .5 * s], FP.night, { label: 'Nose' }));
  if (mood === 'wow') out.push(ellipse(cx - .11 * s, cy + .6 * s, .22 * s, .28 * s, FP.night, { label: 'Mouth' }));
  else out.push(arcLine(cx - .14 * s, cy + .52 * s, .14 * s, 10, 170, FP.night, sw), arcLine(cx + .14 * s, cy + .52 * s, .14 * s, 10, 170, FP.night, sw));
  return out;
}

/** Dot the fawn: tall columns for legs, triangles for the rest. */
function fawn(cx: number, cy: number, s: number, mood: FMood = 'happy', legs = true, o: { adult?: boolean } = {}): TelaVectorObject[] {
  const P = (dx: number, dy: number): Pt => [cx + dx * s, cy + dy * s]; const sw = Math.max(2.5, s * .05); const st = { stroke: FP.night, strokeWidth: sw }; const out: TelaVectorObject[] = [];
  if (legs) for (const dx of [-.75, .45]) out.push(poly([P(dx, 2.9), P(dx + .36, 2.9), P(dx + .26, 4.55), P(dx + .1, 4.55)], mix(FP.fawn, -.15), { ...st, label: 'Leg' }), rect(cx + (dx + .06) * s, cy + 4.55 * s, .24 * s, .14 * s, FP.night, { label: 'Hoof' }));
  out.push(poly([P(-.45, .9), P(.45, .9), P(1.2, 3.1), P(-1.2, 3.1)], FP.fawn, { ...st, label: 'Body' }));
  const spots: Pt[][] = [[P(-.5, 1.6), P(-.3, 1.5), P(-.4, 1.8)], [P(.3, 1.9), P(.55, 1.8), P(.4, 2.1)], [P(-.2, 2.4), P(.05, 2.3), P(-.1, 2.6)], [P(.55, 2.6), P(.8, 2.5), P(.65, 2.8)], [P(-.8, 2.7), P(-.55, 2.6), P(-.7, 2.9)]];
  if (!o.adult) out.push(multiPoly(spots, FP.cream, { label: 'Spots' }));
  for (const sx of [-1, 1]) out.push(poly([P(sx * .95, -.4), P(sx * 2.0, -.85), P(sx * .55, -.9)], FP.fawn, { ...st, label: 'Ear' }), tri(P(sx * .95, -.52), P(sx * 1.7, -.8), P(sx * .65, -.82), FP.cream, { label: 'Ear inner' }));
  out.push(poly([P(-1.05, -.45), P(1.05, -.45), P(.5, .6), P(0, 1.2), P(-.5, .6)], FP.fawn, { ...st, label: 'Head' }), poly([P(-.5, .1), P(.5, .1), P(0, 1.2)], FP.cream, { label: 'Muzzle' }));
  if (mood === 'sleep') out.push(arcLine(cx - .45 * s, cy - .1 * s, .18 * s, 20, 160, FP.night, sw), arcLine(cx + .45 * s, cy - .1 * s, .18 * s, 20, 160, FP.night, sw));
  else for (const sx of [-1, 1]) out.push(circle(cx + sx * .46 * s, cy - .08 * s, .17 * s, FP.night, { label: 'Eye' }), circle(cx + sx * .46 * s + .06 * s, cy - .14 * s, .06 * s, '#fff'));
  out.push(tri(P(-.14, .72), P(.14, .72), P(0, .92), FP.night, { label: 'Nose' }), arcLine(cx, cy + 1.0 * s, .13 * s, 15, 165, FP.night, sw));
  return out;
}

const text0 = (cx: number, y: number, word: string, size: number, color: string, rot = 0) => block(cx - tw('andika7', word, size) / 2 - 4, y, tw('andika7', word, size) + 8, [word], size, 'andika7', color, { align: 'center', rotation: rot, label: 'Flag word', lh: 1.1 });
function flag(x: number, y: number, w: number, word: string, fill: string, ink: string, rot = 0, size = 34): TelaVectorObject[] {
  return [poly([[x, y], [x + w, y], [x + w / 2, y + w * .95]], fill, { stroke: FP.night, strokeWidth: 4, rotation: rot, label: 'Flag' }), text0(x + w / 2, y + w * .06, word, size, ink, rot)];
}

function zig(x: number, y: number, w: number, h: number, n: number, fill: string, up = true): TelaVectorObject {
  const pts: Pt[] = [[x, y + (up ? h : 0)]]; const st = w / n;
  for (let i = 0; i < n; i++) { pts.push([x + i * st + st / 2, y + (up ? 0 : h)], [x + (i + 1) * st, y + (up ? h : 0)]); }
  pts.push([x + w, y + (up ? h + 300 : -300)], [x, y + (up ? h + 300 : -300)]);
  return poly(pts, fill, { label: 'Zigzag' });
}

function bokeh(x: number, y: number, w: number, h: number, n: number, seed: number, col = FP.gold): TelaVectorObject[] {
  const r = rng(seed); const pts: Pt[][] = [];
  for (let i = 0; i < n; i++) { const px = x + r() * w, py = y + r() * h, s = 4 + r() * 7; pts.push([[px, py - s * 1.3], [px + s, py], [px, py + s * 1.3], [px - s, py]]); }
  return [multiPoly(pts, col, { opacity: .9, label: 'Fireflies' })];
}

const fbg = (c: string) => rect(0, 0, W, H, c, { label: 'Page ground', role: 'GROUND' });
const speck = (seed: number, cols = [FP.cream, FP.night], n = 70, op = .35) => flecks(0, 0, W, H, n, cols, seed, 3, op);


// ── Signs, flags and silhouettes that carry the story text ──────────────────────
/** A hung wood sign whose box GROWS to the (fitted) story text. Returns the objects and its height. */
function signFit(x: number, y: number, w: number, ps: string[], o: { max: number; min?: number; maxH: number; rot?: number; fill?: string; ink?: string; reg?: string; rope?: boolean; seed?: number; padX?: number; padY?: number; align?: 'left' | 'center' }): { objs: TelaVectorObject[]; h: number; size: number } {
  const padX = o.padX ?? 26, padY = o.padY ?? 22, lh = 1.36;
  const fit = fitText('andika7', ps, w - padX * 2, o.maxH - padY * 2, o.max, o.min ?? 22, lh);
  const h = Math.ceil(fit.h) + padY * 2; const seed = o.seed ?? 5; const out: TelaVectorObject[] = [];
  if (o.rope) out.push(line(x + 40, y - 90, x + 40, y + 8, FP.bark, 5, { label: 'Rope' }), line(x + w - 40, y - 90, x + w - 40, y + 8, FP.bark, 5, { label: 'Rope' }));
  out.push(poly(tornRect(x + 7, y + 6, w, h, seed + 1, 5, 2), o.reg || FP.verm, { rotation: o.rot, opacity: .95, label: 'Print offset' }));
  out.push(poly(tornRect(x, y, w, h, seed, 5, 2), o.fill || FP.cream, { stroke: FP.night, strokeWidth: 4.5, rotation: o.rot, label: 'Wood sign' }));
  out.push(block(x + padX, y + padY, w - padX * 2, fit.lines, fit.size, 'andika7', o.ink || FP.night, { align: o.align ?? 'left', lh, rotation: o.rot, label: 'Story text' }));
  return { objs: out, h, size: fit.size };
}
/** Flatten a figure into a one-colour print silhouette. */
function silhouette(objs: TelaVectorObject[], col: string): TelaVectorObject[] {
  return objs.map(o => ({ ...o, fill: o.fill === 'none' ? 'none' : col, stroke: o.stroke === 'none' ? 'none' : col, shadow: undefined }));
}

// 1 · COVER ─────────────────────────────────────────────────────────────────────
function forestCover(s: ShowcaseSpread): TelaVectorObject[] {
  const [l1, l2] = parasOf(s);
  const o: TelaVectorObject[] = [fbg(FP.verm)];
  o.push(...sunRays(512, 600, 1100, 26, FP.gold, '#FF8A00', 180, 180, 4));
  o.push(poly(circlePtsN(512, 600, 190, 18), FP.gold, { stroke: FP.cream, strokeWidth: 6, label: 'Low sun' }));
  for (let i = 0; i < 7; i++) o.push(...fir(60 + i * 150, 700, 190 + (i % 3) * 40, 120, i % 2 ? FP.pine : FP.deep, FP.lime, 4, { lit: 'r' }));
  o.push(zig(0, 640, W, 70, 22, FP.lime), zig(0, 700, W, 70, 18, FP.pine));
  o.push(...trunk(-30, -20, 780, 190, 7, FP.pine, 'r', { reg: FP.gold, litCol: FP.lime }), ...trunk(858, -20, 780, 196, 9, FP.pine, 'l', { reg: FP.gold, litCol: FP.lime }));
  o.push(...fawn(805, 470, 30, 'happy', false));
  o.push(...fox(480, 440, 84, 'happy', 1));
  o.push(...bokeh(190, 250, 650, 350, 22, 3));
  const t2s = l2.toUpperCase();
  const t1 = fitSize('slackey', l1, 800, 104), t2 = fitSize('slackey', t2s, 940, 150);
  o.push(...lettered(512, 8, l1, t1, 'slackey', { colors: [FP.cream, FP.gold, FP.cream, FP.lime], outline: FP.night, ow: 13, shadow: FP.pine, sx: 6, sy: 8, bounce: 7, rot: 4, seed: 4, label: 'Title' }));
  o.push(...lettered(512, 100, t2s, t2, 'slackey', { colors: [FP.cream, FP.gold, FP.lime, FP.cream], outline: FP.night, ow: 15, shadow: FP.pine, sx: 7, sy: 9, bounce: 6, rot: 3, seed: 8, label: 'Title' }));
  o.push(...speck(2, [FP.cream, FP.night], 60, .3));
  return o;
}

// 2 · HERO: Tam is tiny, the trees are huge ──────────────────────────────────────────
function forestHero(s: ShowcaseSpread): TelaVectorObject[] {
  const o: TelaVectorObject[] = [fbg(FP.deep)];
  o.push(rect(0, 0, W, 540, FP.pine, { label: 'Forest air' }));
  o.push(...lowSun(930, 470, 72));
  o.push(...beams(930, 470, [[120, 700, 40], [330, 720, 55], [560, 700, 36], [760, 720, 50]], .2));
  const xs = [60, 215, 395, 600, 770];
  xs.forEach((x, i) => o.push(...trunk(x, -20, 700, 96 + (i % 3) * 36, 20 + i, i % 2 ? FP.bark : FP.pine, 'r', { reg: i % 2 ? FP.verm : FP.gold, litCol: FP.lime })));
  o.push(zig(0, 640, W, 60, 26, FP.lime), rect(0, 700, W, 70, FP.pine, { label: 'Ground' }), tornSheet(120, 700, 560, 40, FP.cream, 31, { fringe: 'none', shadow: false, label: 'Path' }));
  o.push(...fox(320, 530, 46, 'wow', 1));
  o.push(...bokeh(40, 60, 940, 560, 28, 11));
  o.push(...signFit(150, 96, 760, parasOf(s), { max: 32, maxH: 300, rot: -1.5, seed: 9, rope: true, padX: 32, padY: 22 }).objs);
  o.push(...speck(5, [FP.cream, FP.gold], 70, .3));
  return o;
}

// 3 · VIGNETTE: counting trunks ───────────────────────────────────────────────────
function forestTrunks(s: ShowcaseSpread): TelaVectorObject[] {
  const o: TelaVectorObject[] = [fbg(FP.lime)];
  o.push(...sunRays(0, 760, 1300, 18, FP.gold, '#E8FF6A', -90, 90, 6));
  for (let i = 0; i < 7; i++) o.push(...fir(60 + i * 160, 740 - (i % 2) * 20, 260 + (i % 3) * 50, 130, i % 2 ? FP.pine : FP.deep, FP.lime, 5, { lit: 'l' }));
  // a stack of towers rising out of the picture
  o.push(...trunk(-40, -20, 800, 230, 14, FP.bark, 'r', { reg: FP.verm, litCol: FP.gold }), ...trunk(210, -20, 800, 110, 15, FP.pine, 'r', { reg: FP.gold, litCol: FP.lime }), ...trunk(350, -20, 800, 66, 16, FP.deep, 'r', { reg: FP.verm, litCol: FP.lime }));
  o.push(multiPoly([[[-40, 790], [60, 800], [-10, 700]]], FP.bark, { stroke: FP.night, strokeWidth: 3, label: 'Roots' }));
  o.push(...bokeh(40, 80, 360, 560, 12, 5, FP.gold));
  o.push(...fox(205, 600, 40, 'wow', 1), poly([[120, 300], [160, 240], [200, 300]], FP.gold, { stroke: FP.night, strokeWidth: 4, label: 'Carved lantern' }));
  o.push(...signFit(430, 40, 560, parasOf(s), { max: 30, maxH: 700, rot: 1, seed: 21, rope: true, padX: 28, padY: 24 }).objs);
  o.push(...speck(4, [FP.pine, FP.night], 50, .22));
  return o;
}

// 4 · QUIET: the forest holds its breath ─────────────────────────────────────────────
function forestQuiet(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [fbg(FP.deep)];
  for (const [x, w, sd] of [[-20, 90, 1], [90, 40, 2], [905, 80, 3], [990, 60, 4]] as Array<[number, number, number]>) o.push(...trunk(x, -20, 790, w, 40 + sd, mix(FP.pine, .04 * sd), 'r', { grain: FP.night, litCol: FP.pine }));
  o.push(...fox(760, 600, 24, 'wow', 1), ...bokeh(700, 330, 220, 160, 4, 8, FP.gold));
  o.push(poly([[800, 380], [775, 415], [825, 415]], FP.gold, { stroke: FP.night, strokeWidth: 3, label: 'Lantern' }), zig(0, 735, W, 34, 40, FP.pine));
  o.push(...speck(9, [FP.pine, FP.cream], 50, .2));
  const fit = fitText('andika7', L.slice(0, 4), 600, 260, 38, 22, 1.42);
  o.push(blockAt(380, 250, fit.lines, fit.size, 'andika7', FP.cream, { label: 'Story text', lh: 1.42 }));
  o.push(...lettered(380, 440, L[4], fitSize('slackey', L[4], 520, 200), 'slackey', { colors: [FP.cream, FP.gold, FP.cream], outline: FP.night, ow: 12, shadow: FP.verm, sx: 6, sy: 8, bounce: 7, rot: 5, seed: 6, label: 'Whisper' }));
  return o;
}

// 5 · STRIP: crunch, rustle, peek ───────────────────────────────────────────────────
function panelFrame(x: number, y: number, w: number, h: number, ground: string, seed: number): TelaVectorObject[] {
  return [poly(tornRect(x - 14, y - 14, w + 28, h + 28, seed, 5, 2), FP.bark, { stroke: FP.night, strokeWidth: 4, label: 'Panel frame' }), rect(x, y, w, h, ground, { label: 'Panel ground' })];
}
function forestStrip(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s); // 0 Crunch. 1 Tam jumped. 2 Rustle. 3 ears flat. 4 wanted to run. 5 Peek! 6 something with spots
  const o: TelaVectorObject[] = [fbg(FP.gold)];
  o.push(...sunRays(512, 900, 1400, 30, '#FFE45A', FP.gold, 180, 180, 2));
  // A: a twig snaps
  o.push(...panelFrame(50, 40, 200, 400, FP.pine, 71), ...fir(150, 430, 190, 120, FP.deep, FP.lime, 4), ...fox(150, 215, 42, 'wow', 1, false).filter(ob => ob.objectLabel !== 'Paw'), ...bokeh(60, 50, 180, 110, 4, 3));
  o.push(poly([[70, 400], [150, 380], [230, 405], [150, 392]], FP.bark, { stroke: FP.night, strokeWidth: 3, label: 'Twig' }), poly([[130, 372], [150, 345], [170, 372], [150, 362]], FP.gold, { stroke: FP.night, strokeWidth: 2.5, label: 'Crunch burst' }));
  // B: leaves rustle, two eyes
  o.push(...panelFrame(290, 40, 200, 400, FP.verm, 72), ...trunk(300, 40, 400, 54, 5, FP.pine, 'r'), ...trunk(430, 40, 400, 54, 6, FP.pine, 'l'), ...[345, 395].map(x => circle(x, 260, 16, FP.cream, { stroke: FP.night, strokeWidth: 3, label: 'Peeking eye' })), ...[345, 395].map(x => circle(x + 3, 263, 7, FP.night)));
  o.push(multiPoly([[[310, 120], [345, 150], [318, 175]], [[470, 150], [440, 185], [466, 205]], [[330, 330], [362, 356], [335, 380]]], FP.lime, { stroke: FP.night, strokeWidth: 2.5, label: 'Rustling leaves' }));
  // C: a spotted face behind a trunk
  o.push(...panelFrame(560, 40, 420, 400, FP.pine, 73), ...beams(770, 50, [[690, 430, 36], [860, 430, 42]], .22), ...fir(620, 430, 280, 150, FP.deep, FP.lime, 4), ...fawn(850, 190, 62, 'happy', false), ...trunk(790, 40, 400, 70, 8, FP.bark, 'r', { reg: FP.verm }), ...fox(660, 300, 36, 'wow', 1, false).filter(ob => ob.objectLabel !== 'Paw'), ...bokeh(580, 60, 380, 340, 10, 13));
  // bunting rope + flags (the sound words), captions on signs
  o.push(line(30, 470, 1000, 470, FP.bark, 5, { label: 'Bunting rope' }));
  o.push(...flag(60, 474, 150, L[0], FP.verm, FP.cream, -3, 26));
  o.push(...signFit(40, 612, 230, [L[1]], { max: 28, maxH: 80, rot: 1.5, seed: 31, padX: 16, padY: 16 }).objs);
  o.push(...flag(300, 474, 150, L[2], FP.cream, FP.night, 2, 26));
  o.push(...signFit(290, 612, 210, [L[3]], { max: 26, maxH: 130, rot: -1.5, seed: 32, padX: 14, padY: 16, fill: FP.lime }).objs);
  o.push(...signFit(540, 480, 330, [L[4]], { max: 26, maxH: 160, rot: -1, seed: 33, padX: 20, padY: 18 }).objs);
  o.push(...flag(886, 474, 118, L[5], FP.lime, FP.night, 3, 30));
  o.push(...signFit(540, 640, 470, [L[6]], { max: 26, maxH: 110, rot: 1, seed: 34, padX: 20, padY: 14, fill: FP.cream }).objs);
  o.push(zig(0, 748, W, 24, 40, FP.pine), ...speck(7, [FP.verm, FP.night], 50, .25));
  return o;
}

// 6 · REVEAL: Dot, up close ──────────────────────────────────────────────────────
function forestShock(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [fbg(FP.pine)];
  o.push(...lowSun(80, 90, 50), ...beams(80, 90, [[300, 770, 60], [600, 770, 90], [900, 770, 70]], .16));
  o.push(...fawn(700, 270, 205, 'happy', false));
  o.push(...trunk(-10, -20, 800, 100, 33, FP.bark, 'r', { reg: FP.verm }));
  o.push(zig(0, 690, W, 80, 18, FP.lime), ...fox(250, 668, 22, 'wow', 1, false).filter(ob => ob.objectLabel !== 'Paw'));
  o.push(...bokeh(120, 300, 280, 360, 10, 17), ...speck(14, [FP.cream, FP.night], 50, .22));
  o.push(...signFit(24, 196, 440, [L[0], flow(L[1], L[2], L[3])], { max: 28, maxH: 440, rot: -2, seed: 8, rope: false, padX: 24, padY: 20 }).objs);
  return o;
}

// 7 · VIGNETTE: Tam goes first ──────────────────────────────────────────────────
function forestWalk(s: ShowcaseSpread): TelaVectorObject[] {
  const o: TelaVectorObject[] = [fbg(FP.cream)];
  o.push(...sunRays(512, -60, 1200, 26, 'rgba(255,215,0,.45)', 'rgba(255,69,0,.2)', 0, 180, 5));
  o.push(zig(0, 40, W, 40, 40, FP.verm, false), zig(0, 700, W, 40, 40, FP.pine));
  o.push(...panelFrame(60, 120, 450, 520, FP.gold, 90));
  o.push(...fir(130, 560, 340, 190, FP.pine, FP.lime, 5, { lit: 'r' }), ...fir(440, 580, 300, 170, FP.deep, FP.lime, 5, { lit: 'l' }));
  o.push(...beams(285, 130, [[150, 630, 30], [300, 630, 40], [440, 630, 30]], .3));
  o.push(poly([[60, 628], [510, 628], [470, 560], [120, 560]], FP.cream, { opacity: .85, label: 'Path' }), ...[170, 290, 410].map(x => poly([[x, 560], [x + 26, 628], [x + 4, 628]], FP.gold, { opacity: .7, label: 'Stripe of light' })));
  o.push(...fox(210, 300, 48, 'happy', 1).filter(ob => ob.objectLabel !== 'Paw'), ...fawn(385, 262, 48, 'happy', true));
  o.push(...bokeh(80, 140, 420, 330, 10, 5));
  o.push(...signFit(540, 96, 462, parasOf(s), { max: 30, maxH: 560, rot: 1.2, seed: 4, rope: false, padX: 26, padY: 22 }).objs);
  o.push(...speck(6, [FP.verm, FP.pine], 40, .2));
  return o;
}

// 8 · PANORAMA: the trees make a path ──────────────────────────────────────────────
function forestPath(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s); // 0..2 sun/trees/Look  3 followed the gold  4 bridge+hill  5 voice  6 doe
  const o: TelaVectorObject[] = [fbg(FP.verm)];
  o.push(...sunRays(512, 420, 1300, 32, FP.gold, '#FF8A00', 180, 180, 3));
  o.push(rect(0, 420, W, 350, FP.pine, { label: 'Forest floor' }));
  o.push(...lowSun(512, 420, 56));
  // glowing trunks forming a corridor toward the sun
  const left = [[-30, 150], [120, 110], [250, 78], [350, 54]], right = [[880, 150], [800, 110], [720, 78], [650, 54]];
  [...left, ...right].forEach(([x, w], i) => o.push(...trunk(x, -20, 800, w, 60 + i, i % 2 ? FP.pine : FP.deep, x < 512 ? 'r' : 'l', { reg: FP.gold, litCol: FP.gold })));
  o.push(poly([[0, 770], [1024, 770], [560, 420], [464, 420]], FP.cream, { opacity: .9, label: 'Golden path' }));
  o.push(poly([[0, 680], [250, 600], [280, 640], [0, 770]], FP.lime, { stroke: FP.night, strokeWidth: 3, label: 'Hill of moss' }), poly([[760, 560], [820, 600], [800, 640], [760, 620], [730, 640], [720, 600]], FP.bark, { stroke: FP.night, strokeWidth: 3, label: 'Bridge of roots' }));
  o.push(...fawn(890, 300, 36, 'happy', true, { adult: true }), ...fox(370, 330, 30, 'happy', 1, true).filter(ob => ob.objectLabel !== 'Paw'), ...fawn(470, 336, 22, 'happy', true), ...bokeh(180, 200, 700, 250, 20, 9));
  o.push(...speck(8, [FP.cream, FP.night], 50, .22));
  const top = signFit(60, 24, 904, L.slice(0, 3), { max: 30, maxH: 190, rot: -.6, seed: 12, padX: 28, padY: 16 });
  o.push(...top.objs);
  o.push(...signFit(60, 480, 904, L.slice(3), { max: 28, maxH: 275, rot: .6, seed: 13, padX: 28, padY: 16, fill: FP.cream }).objs);
  return o;
}

// 9 · CLOSING: at the den ─────────────────────────────────────────────────────────
function forestDen(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [fbg(FP.ember)];
  o.push(rect(0, 0, W, 300, FP.verm, { label: 'Dusk band' }), rect(0, 300, W, 200, '#FF7A00', { label: 'Dusk band' }), rect(0, 500, W, 268, FP.gold, { label: 'Dusk band' }));
  o.push(...lowSun(420, 540, 80));
  for (let i = 0; i < 8; i++) o.push(...fir(40 + i * 135, 700, 200 + (i % 3) * 50, 120, i % 2 ? FP.pine : FP.deep, FP.lime, 4));
  o.push(zig(0, 690, W, 60, 24, FP.lime), rect(0, 740, W, 40, FP.pine, { label: 'Ground' }));
  o.push(...trunk(-50, -20, 770, 150, 83, FP.pine, 'r', { reg: FP.gold, litCol: FP.lime }), ...trunk(930, -20, 770, 160, 84, FP.pine, 'l', { reg: FP.gold, litCol: FP.lime }));
  // the den door and the firefly lantern
  o.push(poly([[640, 700], [660, 520], [780, 450], [900, 520], [920, 700]], FP.night, { stroke: FP.bark, strokeWidth: 6, label: 'Den door' }));
  o.push(rect(582, 560, 22, 34, FP.cream, { stroke: FP.night, strokeWidth: 3, rx: 5, label: 'Lantern jar' }), ...bokeh(570, 520, 48, 40, 5, 4));
  o.push(...fox(790, 560, 44, 'happy', -1, true, { ring: true }).filter(ob => ob.objectLabel !== 'Paw'), ...fox(660, 640, 26, 'happy', 1, true).filter(ob => ob.objectLabel !== 'Paw'));
  o.push(...bokeh(40, 230, 540, 330, 12, 6), ...speck(3, [FP.cream, FP.night], 40, .22));
  o.push(...signFit(28, 32, 560, L.slice(0, 5), { max: 28, maxH: 520, rot: -1, seed: 15, rope: true, padX: 26, padY: 20 }).objs);
  const last = signFit(150, 590, 420, L.slice(5), { max: 28, maxH: 150, rot: 1.2, seed: 16, padX: 24, padY: 16, fill: FP.cream });
  o.push(...last.objs);
  return o;
}

// 10 · ACTIVITY ───────────────────────────────────────────────────────────────────
function forestActivity(s: ShowcaseSpread): TelaVectorObject[] {
  const L = parasOf(s);
  const o: TelaVectorObject[] = [fbg(FP.gold)];
  o.push(...sunRays(512, 840, 1500, 30, '#FFE45A', FP.gold, 180, 180, 8));
  o.push(...panelFrame(50, 50, 570, 670, FP.pine, 55));
  for (let i = 0; i < 5; i++) o.push(...trunk(70 + i * 112, 50, 670, 44 + (i % 2) * 34 + (i === 3 ? 40 : 0), 60 + i, i % 2 ? FP.bark : FP.deep, 'r', { litCol: FP.lime }));
  [[130, 690], [300, 700], [470, 690], [585, 680]].forEach(([x, y], i) => o.push(...fir(x, y, 220 + i * 20, 120, i % 2 ? FP.deep : FP.pine, FP.lime, 4, { lit: 'r' })));
  // the hidden gold lights, a twig that went crunch, and two friends
  o.push(...bokeh(80, 90, 520, 260, 5, 77, FP.gold), ...bokeh(90, 420, 500, 200, 2, 78, FP.gold));
  o.push(poly([[300, 668], [372, 654], [440, 672], [372, 664]], FP.bark, { stroke: FP.night, strokeWidth: 3, label: 'The twig' }));
  o.push(...fox(150, 560, 22, 'happy', 1).filter(ob => ob.objectLabel !== 'Paw'), ...fawn(540, 520, 20, 'happy', true));
  const q1 = signFit(652, 44, 352, [L[0]], { max: 28, maxH: 220, rot: 1.5, seed: 2, rope: false, padX: 22, padY: 18 });
  const q2 = signFit(652, 44 + q1.h + 86, 352, [L[1]], { max: 28, maxH: 220, rot: -1.5, seed: 3, rope: false, padX: 22, padY: 18, fill: FP.lime });
  const q3 = signFit(652, 44 + q1.h + 86 + q2.h + 56, 352, [L[2]], { max: 28, maxH: 200, rot: 1, seed: 4, rope: false, padX: 22, padY: 18 });
  o.push(...q1.objs);
  for (let i = 0; i < 5; i++) o.push(poly([[690 + i * 58, 44 + q1.h + 26], [716 + i * 58, 44 + q1.h + 52], [690 + i * 58, 44 + q1.h + 78], [664 + i * 58, 44 + q1.h + 52]], 'none', { stroke: FP.night, strokeWidth: 4, dash: [3, 7], label: 'Answer diamond' }));
  o.push(...q2.objs, circle(978, 44 + q1.h + 86 + q2.h + 26, 18, 'none', { stroke: FP.night, strokeWidth: 4, dash: [3, 7], label: 'Answer ring' }), ...q3.objs);
  o.push(...speck(3, [FP.verm, FP.night], 40, .22));
  return o;
}

// 11 · BACK COVER ───────────────────────────────────────────────────────────────────
function forestBack(s: ShowcaseSpread): TelaVectorObject[] {
  const o: TelaVectorObject[] = [fbg(FP.ember)];
  o.push(rect(0, 0, W, 300, FP.verm, { label: 'Dusk band' }), rect(0, 300, W, 200, '#FF7A00', { label: 'Dusk band' }), rect(0, 500, W, 268, FP.gold, { label: 'Dusk band' }));
  o.push(...lowSun(512, 520, 80));
  for (let i = 0; i < 8; i++) o.push(...fir(40 + i * 135, 700, 200 + (i % 3) * 50, 120, i % 2 ? FP.pine : FP.deep, FP.lime, 4));
  o.push(zig(0, 690, W, 60, 24, FP.lime), rect(0, 740, W, 40, FP.pine, { label: 'Ground' }));
  o.push(...trunk(40, -20, 770, 170, 83, FP.pine, 'r', { reg: FP.gold, litCol: FP.lime }), ...trunk(850, -20, 770, 170, 84, FP.pine, 'l', { reg: FP.gold, litCol: FP.lime }));
  // two small foxes and a fawn in silhouette against the sunset
  o.push(...silhouette(fox(420, 590, 34, 'happy', 1, true, { ring: false }).filter(ob => ob.objectLabel !== 'Paw'), FP.night), ...silhouette(fox(330, 640, 22, 'happy', 1, true).filter(ob => ob.objectLabel !== 'Paw'), FP.night), ...silhouette(fawn(590, 590, 26, 'happy', true), FP.night));
  o.push(...bokeh(190, 330, 650, 200, 12, 6), ...speck(3, [FP.cream, FP.night], 40, .22));
  const t = 'Little Fox, Big Trees';
  o.push(...lettered(512, 22, t, fitSize('slackey', t, 860, 84), 'slackey', { colors: [FP.cream, FP.gold, FP.cream, FP.lime], outline: FP.night, ow: 10, shadow: FP.pine, sx: 5, sy: 7, bounce: 5, rot: 3, seed: 5, label: 'Title' }));
  o.push(...signFit(180, 150, 664, parasOf(s), { max: 34, maxH: 260, rot: -1, seed: 12, rope: true, padX: 30, padY: 22 }).objs);
  o.push(...barcode(786, 536, 200, 118, 420));
  o.push(...signFit(760, 672, 250, ['Ages 5-7', 'Plajah Story Studio'], { max: 22, maxH: 90, rot: 0, seed: 17, padX: 14, padY: 8, align: 'center' }).objs);
  return o;
}

const FOREST_PLAN: Array<[ShowcaseSpread['beat'], (s: ShowcaseSpread) => TelaVectorObject[]]> = [
  ['cover', forestCover], ['hero', forestHero], ['vignette', forestTrunks], ['quiet', forestQuiet], ['strip', forestStrip], ['reveal', forestShock],
  ['vignette', forestWalk], ['panorama', forestPath], ['closing', forestDen], ['activity', forestActivity], ['back', forestBack],
];
function forestDesign(ctx: PublicationCtx): TelaVectorObject[] {
  const s = spreadFor(ctx); const plan = FOREST_PLAN[ctx.pageIndex];
  if (!plan || plan[0] !== s.beat) throw new Error(`story-forest: spread ${s.n} is a "${s.beat}" page but the page plan expects "${plan?.[0]}"`);
  return plan[1](s);
}

/** Drop art that is wholly off the page (planets bleed off the edge; their dots and craters should not follow). */
function onPage(objs: TelaVectorObject[]): TelaVectorObject[] {
  return objs.filter(o => o.kind === 'TEXT' || o.kind === 'LINE' || !(o.x + o.w < -4 || o.y + o.h < -4 || o.x > W + 4 || o.y > H + 4));
}

export const DESIGNS: Record<string, PublicationDesigner> = {
  'story-forest': (ctx: PublicationCtx) => onPage(forestDesign(ctx)),
  'story-space': (ctx: PublicationCtx) => onPage(spaceDesign(ctx)),
};

export const LESSONS: Record<string, DesignLesson> = {
  'story-forest': {
    principle: 'A print look comes from limits: three or four inks, shapes cut with a knife, and a deliberate misregistration. Little Fox, Big Trees builds everything from vertical columns and triangles, so the trees tower and the fox stays small without a word about size.',
    history: 'Woodblock and linocut printing gave picture books some of their boldest pages: each colour is a separate block pressed on the paper, so the colours never line up perfectly and the slight offset became part of the charm. Stencil and folk-print traditions in Europe and Japan used the same flat, saturated colour and strong dark outline.',
    tryThis: 'Select a trunk and nudge its offset colour layer a few pixels in another direction. Notice how much more printed, and less digital, the page feels.',
    interestTag: 'Picture books',
    related: ['Woodblock printing', 'Children’s illustration', 'Hand lettering'],
  },
  'story-space': {
    principle: 'Scale and a single shape do the storytelling: every planet, helmet, star and crumb in Orbit Party is a circle, so a three-year-old can name the whole world, and the only thing that changes from spread to spread is how big the circle is.',
    history: 'Torn and cut-paper collage became a picture-book language in the mid twentieth century, when printers and illustrators such as Leo Lionni and Eric Carle showed that simple coloured paper shapes could carry a whole story. The deliberately ragged, off-grid look of this template comes from the punk and zine tradition that grew up alongside it.',
    tryThis: 'Change the colour of the sun and watch every planet shade swing with it; then drag the shy planet to the other page and see how the story turn changes.',
    interestTag: 'Picture books',
    related: ['Cut-paper collage', 'Children’s illustration', 'Hand lettering'],
  },
};
