// storybooksC — the second-generation, art-driven picture books: story-city
// ("Beep Block Street", mid-century screen print) and story-folktale ("The Golden
// Thread", folk papercut). These override the first-pass designers in books.ts.
// Every page is finished procedural illustration (no photo needed): characters
// with faces, a scenery generator behind them, lettering that lives in the art.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import { rect, ellipse, circle, text, alpha, mix } from '../../templateKit';
import * as orn from '../../ornaments';
import {
  PW, PH, shape, poly, tri, rectPts, rectsObj, arcPts, stroke, dots, halftone, ghost, speckle,
  letterRow, textOnPath, measureRow, pointAt, polylineLength, eye, smile, openMouth, blush,
  BUNGEE_ADV, ALMENDRA_ADV, type Pt,
} from './kidsArtC';
import { folktale } from './folktaleC';
import { fitText } from './showcaseFit';
import { showcaseByTemplate } from '../../../../data/showcase';

type O = TelaVectorObject;
const lin = (angle: number, ...s: Array<[number, string, number?]>) => ({ kind: 'LINEAR' as const, angle, stops: s.map(([offset, color, opacity]) => (opacity === undefined ? { offset, color } : { offset, color, opacity })) });
const ground = (fill: string, o: { gradient?: ReturnType<typeof lin>; label?: string } = {}) => rect(0, 0, PW, PH, fill, { role: 'GROUND', label: o.label || 'Paper ground', gradient: o.gradient });
const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length) % a.length];

// ══════════════════════════════════════════════════════════════════════════════
//  STORY-CITY  "Beep Block Street" — mid-century geometric / screen print
//  Shape language: 90-degree blocks on a voxel grid. Light: streetlamp cones.
// ══════════════════════════════════════════════════════════════════════════════
const ROAD = '#2F2F38';
const CI = { ink: '#1A1A1D', red: '#E5173F', yel: '#FFC300', blue: '#1E88E5', mint: '#00D68F', paper: '#FFF6E5', sky: '#5CB8FF', night: '#101B45', nightL: '#22347A' };

/** Sound words, sticker-style: Bungee, ink outline, hard shadow, off-register ghost. */
function sound(str: string, x: number, y: number, size: number, colors: string[], rot = 0, seed = 3): O[] {
  const lr = letterRow(str, x, y, { font: 'bungee', adv: BUNGEE_ADV, size, colors, stroke: CI.ink, sw: size * .13, bounce: size * .06, rot: 5, shadow: { x: size * .05, y: size * .07, color: CI.ink }, align: 'center', seed, track: -size * .02 });
  if (rot) lr.objs.forEach(o => { /* rotate the whole word about its centre */ const cx = x, cy = y + size / 2; const a = rot * Math.PI / 180; const ox = o.x + o.w / 2 - cx, oy = o.y + o.h / 2 - cy; const nx = cx + ox * Math.cos(a) - oy * Math.sin(a), ny = cy + ox * Math.sin(a) + oy * Math.cos(a); o.x = nx - o.w / 2; o.y = ny - o.h / 2; o.rotation = (o.rotation || 0) + rot; });
  return lr.objs;
}
/** A hard-edged signboard with the words INSIDE it. Lines are broken with measured Rubik widths and the board is sized from the real text height; `maxH` shrinks the type (never below 22px) so nothing overflows. */
function signBoard(x: number, y: number, w: number, words: string, o: { fill?: string; ink?: string; size?: number; rot?: number; pad?: number; border?: string; weight?: number; align?: 'left' | 'center'; bolts?: boolean; maxH?: number } = {}): { objs: O[]; h: number } {
  const pad = o.pad ?? 24; const size = o.size ?? 26;
  const fit = fitText(x + pad, y + pad, w - pad * 2, words, { centerBlock: true, face: o.weight === 700 ? 'rubik700' : 'rubik600', max: size, min: 22, leading: 1.38, color: o.ink || CI.ink, align: o.align || 'left', rotation: o.rot, maxH: o.maxH !== undefined ? o.maxH - pad * 2 : undefined });
  const h = fit.h + pad * 2;
  const objs: O[] = [rect(x, y, w, h, o.fill || CI.paper, { rx: 16, stroke: CI.ink, strokeWidth: 5, rotation: o.rot, shadow: { x: 7, y: 8, blur: 0, color: alpha(CI.ink, .9) }, label: 'Sign board' })];
  if (o.bolts !== false) objs.push(dots([[x + 12, y + 12, 3.5], [x + w - 12, y + 12, 3.5], [x + 12, y + h - 12, 3.5], [x + w - 12, y + h - 12, 3.5]], CI.ink, { rotation: o.rot, label: 'Bolts' }));
  objs.push(fit.obj);
  return { objs, h };
}

/** Bo the bus — a square bus whose windscreen is a pair of goggles and whose grille is a grin. */
type BusMood = 'happy' | 'sad' | 'shout' | 'sleep' | 'joy';
function bus(cx: number, baseY: number, w: number, mood: BusMood, bodyColor = CI.red): O[] {
  const s = w / 200; const X = (x: number) => cx - w / 2 + x * s; const Y = (y: number) => baseY - 194 * s + y * s;
  const out: O[] = [];
  out.push(circle(X(54), Y(172), 23 * s, CI.ink, { label: 'Wheel' }), circle(X(146), Y(172), 23 * s, CI.ink, { label: 'Wheel' }), circle(X(54), Y(172), 9 * s, CI.yel, { label: 'Hubcap' }), circle(X(146), Y(172), 9 * s, CI.yel, { label: 'Hubcap' }));
  out.push(circle(X(-3), Y(72), 11 * s, CI.ink, { label: 'Mirror ear' }), circle(X(203), Y(72), 11 * s, CI.ink, { label: 'Mirror ear' }));
  out.push(rect(X(0), Y(18), 200 * s, 140 * s, bodyColor, { rx: 30 * s, stroke: CI.ink, strokeWidth: 5 * s, shadow: { x: 8 * s, y: 9 * s, blur: 0, color: alpha(CI.ink, .35) }, label: 'Bus body' }));
  out.push(rect(X(64), Y(0), 72 * s, 26 * s, CI.yel, { rx: 7 * s, stroke: CI.ink, strokeWidth: 4 * s, label: 'Roof light' }), circle(X(84), Y(13), 6 * s, CI.paper, { label: 'Roof bulb' }), circle(X(116), Y(13), 6 * s, CI.paper, { label: 'Roof bulb' }));
  out.push(rect(X(14), Y(32), 172 * s, 88 * s, '#9ED8FF', { rx: 22 * s, stroke: CI.ink, strokeWidth: 4 * s, label: 'Windscreen' }));
  out.push(poly([[X(24), Y(40)], [X(58), Y(40)], [X(34), Y(112)], [X(24), Y(112)]], '#FFFFFF', { opacity: .45, label: 'Glass shine' }));
  const look: [number, number] = mood === 'sad' ? [0, .8] : mood === 'shout' ? [0, -.1] : mood === 'sleep' ? [0, 0] : [.2, .1];
  if (mood === 'sleep') {
    out.push(stroke(arcPts(X(62), Y(72), 22 * s, 12 * s, 0, 180, 10), CI.ink, 6 * s, { label: 'Closed eye' }), stroke(arcPts(X(138), Y(72), 22 * s, 12 * s, 0, 180, 10), CI.ink, 6 * s, { label: 'Closed eye' }));
  } else out.push(...eye(X(62), Y(76), 29 * s, CI.ink, look), ...eye(X(138), Y(76), 29 * s, CI.ink, look));
  if (mood === 'sad') out.push(stroke([[X(30), Y(56)], [X(88), Y(40)]], CI.ink, 7 * s, { label: 'Worried brow' }), stroke([[X(112), Y(40)], [X(170), Y(56)]], CI.ink, 7 * s, { label: 'Worried brow' }));
  if (mood === 'shout' || mood === 'joy') out.push(stroke([[X(32), Y(40)], [X(88), Y(34)]], CI.ink, 7 * s, { label: 'Brow' }), stroke([[X(112), Y(34)], [X(168), Y(40)]], CI.ink, 7 * s, { label: 'Brow' }));
  // mouth
  if (mood === 'sad') out.push(stroke(arcPts(X(100), Y(150), 40 * s, 14 * s, 200, 340, 14), CI.ink, 7 * s, { label: 'Frown' }));
  else if (mood === 'sleep') out.push(stroke([[X(76), Y(138)], [X(124), Y(138)]], CI.ink, 6 * s, { label: 'Calm mouth' }));
  else {
    const mw = mood === 'happy' ? 104 : 118, mh = mood === 'happy' ? 17 : 22;
    out.push(...openMouth(X(100), Y(124), mw * s, mh * s, CI.ink, CI.red === bodyColor ? '#FF7A8A' : CI.red));
    out.push(rect(X(100 - mw / 2 + 5), Y(124), (mw - 10) * s, 9 * s, '#FFFFFF', { label: 'Teeth' }));
  }
  out.push(circle(X(22), Y(134), 11 * s, CI.yel, { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Headlamp' }), circle(X(178), Y(134), 11 * s, CI.yel, { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Headlamp' }));
  out.push(rect(X(10), Y(152), 180 * s, 16 * s, CI.yel, { rx: 5 * s, stroke: CI.ink, strokeWidth: 4 * s, label: 'Bumper' }));
  return out;
}

/** Pip the pigeon — mint body, paper belly, a neck patch, a yellow beak that talks. */
function pigeon(cx: number, cy: number, s: number, o: { dir?: 1 | -1; beak?: 'closed' | 'open'; mood?: 'happy' | 'sleep' | 'shock' | 'peek' } = {}): O[] {
  const d = o.dir ?? 1; const X = (x: number) => cx + x * s * d; const Y = (y: number) => cy + y * s; const out: O[] = [];
  const mood = o.mood ?? 'happy';
  out.push(stroke([[X(-4), Y(34)], [X(-4), Y(54)]], CI.red, 4 * s, { label: 'Leg' }), stroke([[X(14), Y(34)], [X(14), Y(54)]], CI.red, 4 * s, { label: 'Leg' }));
  out.push(stroke([[X(-16), Y(56)], [X(-4), Y(54)], [X(6), Y(57)]], CI.red, 4 * s, { label: 'Foot' }), stroke([[X(2), Y(57)], [X(14), Y(54)], [X(24), Y(57)]], CI.red, 4 * s, { label: 'Foot' }));
  out.push(poly([[X(-34), Y(-4)], [X(-86), Y(-16)], [X(-80), Y(22)], [X(-34), Y(30)]], mix(CI.mint, -.3), { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Tail' }));
  out.push(ellipse(cx - 46 * s, cy - 34 * s, 92 * s, 72 * s, CI.mint, { stroke: CI.ink, strokeWidth: 4 * s, label: 'Pigeon body' }));
  out.push(ellipse(cx - (d > 0 ? -2 : 40) * s, cy - 6 * s, 38 * s, 38 * s, CI.paper, { label: 'Belly' }));
  out.push(ellipse(cx - 40 * s, cy - 26 * s, 58 * s, 40 * s, mix(CI.mint, -.28), { stroke: CI.ink, strokeWidth: 3.5 * s, rotation: d > 0 ? -18 : 18, label: 'Wing' }));
  out.push(circle(X(34), Y(-36), 27 * s, CI.mint, { stroke: CI.ink, strokeWidth: 4 * s, label: 'Pigeon head' }), ellipse(X(14) - (d > 0 ? 0 : 22 * s), Y(-20), 22 * s, 14 * s, CI.blue, { rotation: 20 * d, label: 'Neck patch' }));
  const open = o.beak === 'open';
  out.push(poly([[X(56), Y(-44)], [X(86), Y(open ? -50 : -38)], [X(56), Y(-33)]], CI.yel, { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Upper beak' }));
  if (open) out.push(poly([[X(56), Y(-32)], [X(82), Y(-22)], [X(56), Y(-26)]], CI.yel, { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Lower beak' }));
  if (mood === 'sleep') out.push(stroke(arcPts(X(40), Y(-40), 9 * s, 6 * s, 0, 180, 8), CI.ink, 3.5 * s, { label: 'Closed eye' }));
  else out.push(...eye(X(38), Y(-42), (mood === 'shock' ? 13 : 11) * s, CI.ink, [d * .6, mood === 'peek' ? .5 : 0]));
  out.push(blush(X(30), Y(-24), 6 * s, '#FF6B81'));
  return out;
}

/** A little car with worried eyes (the traffic). */
function car(x: number, baseY: number, w: number, color: string, mood: 'worried' | 'cross' | 'ok' = 'worried', dir: 1 | -1 = 1): O[] {
  const s = w / 160; const out: O[] = [];
  out.push(circle(x + 36 * s, baseY - 12 * s, 14 * s, CI.ink, { label: 'Wheel' }), circle(x + 124 * s, baseY - 12 * s, 14 * s, CI.ink, { label: 'Wheel' }));
  out.push(poly([[x + 28 * s, baseY - 52 * s], [x + 46 * s, baseY - 86 * s], [x + 114 * s, baseY - 86 * s], [x + 134 * s, baseY - 52 * s]], color, { stroke: CI.ink, strokeWidth: 4 * s, label: 'Cabin' }));
  out.push(rect(x, baseY - 62 * s, 160 * s, 44 * s, color, { rx: 14 * s, stroke: CI.ink, strokeWidth: 4 * s, shadow: { x: 5 * s, y: 6 * s, blur: 0, color: alpha(CI.ink, .3) }, label: 'Car body' }));
  const ex1 = x + 62 * s, ex2 = x + 100 * s, ey = baseY - 70 * s;
  out.push(...eye(ex1, ey, 12 * s, CI.ink, [dir * .5, mood === 'worried' ? -.6 : 0]), ...eye(ex2, ey, 12 * s, CI.ink, [dir * .5, mood === 'worried' ? -.6 : 0]));
  if (mood === 'cross') out.push(stroke([[ex1 - 12 * s, ey - 16 * s], [ex1 + 10 * s, ey - 9 * s]], CI.ink, 4 * s, { label: 'Brow' }), stroke([[ex2 - 10 * s, ey - 9 * s], [ex2 + 12 * s, ey - 16 * s]], CI.ink, 4 * s, { label: 'Brow' }));
  out.push(mood === 'ok' ? smile(x + 81 * s, baseY - 44 * s, 24 * s, 1, CI.ink, 3.5 * s) : smile(x + 81 * s, baseY - 38 * s, 22 * s, -1, CI.ink, 3.5 * s));
  return out;
}

/** One building on the voxel grid: pitch 32, windows lit by chance, awning, door, and a rooftop thing. */
function tower(x: number, baseY: number, w: number, h: number, color: string, seed: number, o: { lit?: number; sign?: string; signFill?: string; dim?: string; roof?: 'tank' | 'aerial' | 'flat' | 'step' } = {}): O[] {
  const r = orn.rng(seed); const out: O[] = [];
  const top = baseY - h; const cols = Math.max(1, Math.floor((w - 14) / 34)), rows = Math.max(1, Math.floor((h - 78) / 52));
  const ww = Math.min(24, (w - 14) / cols - 10), wh = 30; const ox = x + (w - (cols * (ww + 10) - 10)) / 2;
  out.push(rect(x, top, w, h, color, { stroke: CI.ink, strokeWidth: 5, label: 'Building' }));
  out.push(rect(x + w * .74, top + 3, w * .26 - 3, h - 6, mix(color, -.2), { label: 'Block shade' }));
  out.push(rect(x - 6, top - 12, w + 12, 14, CI.ink, { label: 'Cornice' }));
  const roof = o.roof || pick(r, ['tank', 'aerial', 'flat', 'step'] as const);
  if (roof === 'tank') out.push(rect(x + w * .2, top - 52, w * .36, 34, mix(CI.yel, -.1), { rx: 6, stroke: CI.ink, strokeWidth: 4, label: 'Water tank' }), rect(x + w * .24, top - 18, 5, 8, CI.ink, { label: 'Leg' }), rect(x + w * .48, top - 18, 5, 8, CI.ink, { label: 'Leg' }));
  else if (roof === 'aerial') out.push(stroke([[x + w * .5, top - 10], [x + w * .5, top - 58]], CI.ink, 5, { label: 'Aerial' }), stroke([[x + w * .5 - 16, top - 44], [x + w * .5 + 16, top - 44]], CI.ink, 5, { label: 'Aerial' }), stroke([[x + w * .5 - 11, top - 56], [x + w * .5 + 11, top - 56]], CI.ink, 4, { label: 'Aerial' }));
  else if (roof === 'step') out.push(rect(x + w * .25, top - 36, w * .5, 26, color, { stroke: CI.ink, strokeWidth: 4, label: 'Penthouse' }));
  const lit: Array<[number, number, number, number]> = [], dim: Array<[number, number, number, number]> = [];
  const p = o.lit ?? .38;
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) { const bx = ox + c * (ww + 10), by = top + 22 + rr * 52; (r() < p ? lit : dim).push([bx, by, ww, wh]); }
  if (dim.length) out.push(rectsObj(dim, o.dim || mix(color, -.42), { label: 'Dark windows' }));
  if (lit.length) out.push(rectsObj(lit, CI.yel, { label: 'Lit windows' }));
  out.push(rect(x + w / 2 - 15, baseY - 44, 30, 44, CI.ink, { rx: 15, label: 'Door' }));
  out.push(poly([[x + w / 2 - 36, baseY - 54], [x + w / 2 + 36, baseY - 54], [x + w / 2 + 44, baseY - 72], [x + w / 2 - 44, baseY - 72]], pick(r, [CI.yel, CI.paper, CI.mint, CI.red]), { stroke: CI.ink, strokeWidth: 3.5, label: 'Awning' }));
  if (o.sign && w >= 110) { const sx = Math.max(x + 10, 6), ex = Math.min(x + w - 10, PW - 6); out.push(rect(sx, top + h * .5 - 6, ex - sx, 34, o.signFill || CI.paper, { rx: 4, stroke: CI.ink, strokeWidth: 3.5, label: 'Shop sign' }), text(sx, top + h * .5 + 1, ex - sx, o.sign, { size: 20, font: 'bungee', color: CI.ink, align: 'center', wrap: false, label: 'Shop name', role: 'LABEL' })); }
  return out;
}
/** Far skyline: flat blocks and window grids merged into 3 objects — cheap, deep, plenty of lit windows. */
function farTowers(baseY: number, x0: number, x1: number, seed: number, color: string, hMin: number, hMax: number, lit = CI.yel, dimC?: string, p = .3): O[] {
  const r = orn.rng(seed); const bodies: Array<[number, number, number, number]> = []; const win: Array<[number, number, number, number]> = [], dim: Array<[number, number, number, number]> = [];
  let x = x0;
  while (x < x1) {
    const w = 64 + Math.floor(r() * 4) * 32; const h = Math.round((hMin + r() * (hMax - hMin)) / 32) * 32;
    bodies.push([x, baseY - h, w, h]);
    for (let wy = baseY - h + 20; wy < baseY - 40; wy += 46) for (let wx = x + 14; wx < x + w - 24; wx += 34) (r() < p ? win : dim).push([wx, wy, 18, 26]);
    x += w + 6 + Math.floor(r() * 2) * 6;
  }
  const out: O[] = [rectsObj(bodies, color, { stroke: CI.ink, strokeWidth: 4, label: 'Far buildings' })];
  if (dim.length) out.push(rectsObj(dim, dimC || mix(color, -.4), { label: 'Far dark windows' }));
  if (win.length) out.push(rectsObj(win, lit, { label: 'Far lit windows' }));
  return out;
}
function lamp(x: number, baseY: number, h: number, o: { cone?: boolean; coneW?: number; flip?: 1 | -1; color?: string; strength?: number; arm?: number; endAlpha?: number } = {}): O[] {
  const f = o.flip ?? 1; const top = baseY - h; const out: O[] = [];
  const cw = o.coneW ?? 300; const hx = x + (o.arm ?? 40) * f;
  if (o.cone !== false) out.push(poly([[hx - 20, top + 24], [hx + 20, top + 24], [hx + cw / 2, baseY], [hx - cw / 2, baseY]], o.color || '#FFE680', { gradient: lin(90, [0, o.color || '#FFE680', o.strength ?? .85], [1, o.color || '#FFE680', o.endAlpha ?? .12]), label: 'Lamp light cone' }));
  out.push(rect(x - 5, top + 20, 10, h - 20, CI.ink, { label: 'Lamp post' }), rect(Math.min(x, hx) - 5, top + 16, Math.abs(hx - x) + 10, 9, CI.ink, { label: 'Lamp arm' }));
  out.push(rect(hx - 24, top + 10, 48, 20, CI.yel, { rx: 6, stroke: CI.ink, strokeWidth: 4, label: 'Lamp head' }));
  return out;
}
const roadStripe = (y: number, seed: number, color = CI.paper): O => { const r = orn.rng(seed); const a: Array<[number, number, number, number]> = []; for (let x = -20 + r() * 20; x < PW; x += 110) a.push([x, y, 60, 9]); return rectsObj(a, color, { label: 'Road dashes' }); };
const blockCloud = (x: number, y: number, s: number, c = '#FFFFFF'): O[] => [rect(x, y + 20 * s, 150 * s, 36 * s, c, { rx: 18 * s, label: 'Cloud' }), rect(x + 28 * s, y, 70 * s, 36 * s, c, { rx: 18 * s, label: 'Cloud' })];
const burst = (cx: number, cy: number, r: number, fill: string, seed: number, spikes = 14, o: { stroke?: string; sw?: number; rot?: number } = {}): O => shape([ (() => { const q = orn.rng(seed); const pts: Pt[] = []; for (let i = 0; i < spikes * 2; i++) { const rad = i % 2 ? r * (.62 + q() * .08) : r * (.94 + q() * .06); const a = (i * 180 / spikes - 90) * Math.PI / 180; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); } return pts; })() ], fill, { stroke: o.stroke || CI.ink, strokeWidth: o.sw ?? 5, rotation: o.rot, label: 'Sound burst' });
const rays = (cx: number, cy: number, r0: number, r1: number, n: number, color: string, phase = 0, wide = .5): O => shape(Array.from({ length: n }, (_, i) => { const a0 = (phase + i * 360 / n) * Math.PI / 180, a1 = (phase + (i + wide) * 360 / n) * Math.PI / 180; return [[cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0)], [cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)], [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1)], [cx + r0 * Math.cos(a1), cy + r0 * Math.sin(a1)]] as Pt[]; }), color, { label: 'Rays' });

/** A limb: ink outline + colour, so arms read as cut shapes on the pop-print palette. */
const limb = (pts: Pt[], color: string, w: number): O[] => [stroke(pts, CI.ink, w + 8, { label: 'Arm outline' }), stroke(pts, color, w, { label: 'Arm' })];

/** Tilly the taxi: sunshine yellow, checkered stripe, TAXI sign, cross slanted brows over round eyes. */
function taxi(x: number, baseY: number, w: number, mood: 'cross' | 'ok' = 'cross'): O[] {
  const s = w / 200; const X = (v: number) => x + v * s; const Y = (v: number) => baseY + v * s; const out: O[] = [];
  out.push(circle(X(50), Y(-18), 22 * s, CI.ink, { label: 'Wheel' }), circle(X(150), Y(-18), 22 * s, CI.ink, { label: 'Wheel' }), circle(X(50), Y(-18), 8 * s, CI.yel, { label: 'Hubcap' }), circle(X(150), Y(-18), 8 * s, CI.yel, { label: 'Hubcap' }));
  out.push(poly([[X(32), Y(-74)], [X(58), Y(-122)], [X(142), Y(-122)], [X(168), Y(-74)]], CI.yel, { stroke: CI.ink, strokeWidth: 5 * s, shadow: { x: 5 * s, y: 6 * s, blur: 0, color: alpha(CI.ink, .3) }, label: 'Taxi cabin' }));
  out.push(rect(X(0), Y(-82), 200 * s, 58 * s, CI.yel, { rx: 16 * s, stroke: CI.ink, strokeWidth: 5 * s, label: 'Taxi body' }));
  out.push(poly([[X(44), Y(-80)], [X(64), Y(-114)], [X(136), Y(-114)], [X(156), Y(-80)]], '#9ED8FF', { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Taxi windscreen' }));
  const chk: Array<[number, number, number, number]> = []; for (let i = 0; i < 10; i++) { chk.push([X(10 + i * 18), Y(-52), 9 * s, 9 * s], [X(19 + i * 18), Y(-43), 9 * s, 9 * s]); }
  out.push(rectsObj(chk, CI.ink, { label: 'Checker stripe' }));
  out.push(rect(X(78), Y(-146), 44 * s, 26 * s, CI.paper, { rx: 5 * s, stroke: CI.ink, strokeWidth: 4 * s, label: 'Taxi sign' }), rect(X(86), Y(-137), 28 * s, 8 * s, CI.ink, { label: 'Taxi sign letters' }));
  const e1 = X(80), e2 = X(120), ey = Y(-96);
  out.push(...eye(e1, ey, 12 * s, CI.ink, [.3, 0]), ...eye(e2, ey, 12 * s, CI.ink, [.3, 0]));
  if (mood === 'cross') out.push(stroke([[e1 - 14 * s, ey - 20 * s], [e1 + 12 * s, ey - 11 * s]], CI.ink, 5 * s, { label: 'Cross brow' }), stroke([[e2 - 12 * s, ey - 11 * s], [e2 + 14 * s, ey - 20 * s]], CI.ink, 5 * s, { label: 'Cross brow' }));
  out.push(...openMouth(X(100), Y(-66), 50 * s, 9 * s, CI.ink, CI.red));
  out.push(circle(X(10), Y(-48), 8 * s, CI.paper, { stroke: CI.ink, strokeWidth: 3 * s, label: 'Headlamp' }), rect(X(-4), Y(-30), 208 * s, 10 * s, CI.ink, { rx: 4 * s, label: 'Bumper' }));
  return out;
}
/** Gus the dump truck: leaf green cab, rusty-orange tipper, round sleepy eyes. */
function dumper(x: number, baseY: number, w: number, mood: 'grumble' | 'cheer' = 'grumble'): O[] {
  const s = w / 260; const X = (v: number) => x + v * s; const Y = (v: number) => baseY + v * s; const out: O[] = [];
  const GREEN = '#2AAE5E', RUST = '#E8883A';
  out.push(poly([[X(0), Y(-62)], [X(8), Y(-142)], [X(150), Y(-132)], [X(150), Y(-62)]], RUST, { stroke: CI.ink, strokeWidth: 5 * s, shadow: { x: 6 * s, y: 7 * s, blur: 0, color: alpha(CI.ink, .3) }, label: 'Tipper' }));
  out.push(stroke([[X(36), Y(-132)], [X(34), Y(-66)]], mix(RUST, -.25), 6 * s, { label: 'Tipper rib' }), stroke([[X(76), Y(-134)], [X(76), Y(-64)]], mix(RUST, -.25), 6 * s, { label: 'Tipper rib' }), stroke([[X(116), Y(-133)], [X(116), Y(-64)]], mix(RUST, -.25), 6 * s, { label: 'Tipper rib' }));
  out.push(rect(X(-6), Y(-70), 270 * s, 20 * s, CI.ink, { rx: 6 * s, label: 'Chassis' }));
  out.push(poly([[X(154), Y(-62)], [X(154), Y(-132)], [X(212), Y(-132)], [X(246), Y(-92)], [X(254), Y(-62)]], GREEN, { stroke: CI.ink, strokeWidth: 5 * s, label: 'Cab' }));
  out.push(poly([[X(168), Y(-122)], [X(208), Y(-122)], [X(236), Y(-92)], [X(168), Y(-92)]], '#9ED8FF', { stroke: CI.ink, strokeWidth: 3.5 * s, label: 'Cab window' }));
  const lid = mood === 'grumble' ? .45 : 0;
  out.push(...eye(X(184), Y(-105), 11 * s, CI.ink, [.4, .4]), ...eye(X(210), Y(-105), 11 * s, CI.ink, [.4, .4]));
  if (lid) out.push(stroke([[X(171), Y(-118)], [X(194), Y(-113)]], GREEN, 7 * s, { label: 'Heavy lid' }), stroke([[X(197), Y(-113)], [X(221), Y(-110)]], GREEN, 7 * s, { label: 'Heavy lid' }));
  out.push(mood === 'grumble' ? stroke([[X(228), Y(-80)], [X(246), Y(-77)]], CI.ink, 4 * s, { label: 'Grumble mouth' }) : smile(X(238), Y(-79), 18 * s, 1, CI.ink, 4 * s));
  [[40, 28], [100, 28], [200, 28]].forEach(([wx, rr]) => out.push(circle(X(wx), Y(-24), rr * s, CI.ink, { label: 'Wheel' }), circle(X(wx), Y(-24), 10 * s, CI.yel, { label: 'Hubcap' })));
  out.push(circle(X(252), Y(-74), 7 * s, CI.yel, { stroke: CI.ink, strokeWidth: 3 * s, label: 'Headlamp' }));
  return out;
}
/** A shopkeeper face for the three windows: round, eyes shut, mid-yawn. */
function sleeper(cx: number, cy: number, r: number, hairColor: string): O[] {
  return [
    circle(cx, cy, r, '#FFC9A3', { stroke: CI.ink, strokeWidth: 4, label: 'Face' }),
    stroke(arcPts(cx - r * .38, cy - r * .1, r * .2, r * .13, 0, 180, 8), CI.ink, 3.5, { label: 'Closed eye' }), stroke(arcPts(cx + r * .38, cy - r * .1, r * .2, r * .13, 0, 180, 8), CI.ink, 3.5, { label: 'Closed eye' }),
    ...openMouth(cx, cy + r * .28, r * .56, r * .3, CI.ink, '#FF7A8A'), blush(cx - r * .62, cy + r * .2, r * .13, '#FF6B81'), blush(cx + r * .62, cy + r * .2, r * .13, '#FF6B81'),
    poly([[cx - r, cy - r * .2], [cx - r * .8, cy - r * .8], [cx, cy - r * 1.04], [cx + r * .8, cy - r * .8], [cx + r, cy - r * .2], [cx + r * .6, cy - r * .55], [cx - r * .6, cy - r * .55]], hairColor, { stroke: CI.ink, strokeWidth: 3.5, label: 'Hair' }),
  ];
}

const city: PublicationDesigner = (ctx: PublicationCtx) => {
  const { pageIndex, seed } = ctx;
  const book = showcaseByTemplate(ctx.template.id);
  const sp = book?.spreads[pageIndex];
  if (!book || !sp) throw new Error(`story-city: no showcase spread for page ${pageIndex + 1}`);
  const lines = sp.text.split('\n');
  const C = CI; const out: O[] = [];
  switch (sp.beat) {
    // ── cover: poster, a big bus with a face, a title you can hear ──
    case 'cover': {
      out.push(ground(C.blue, { label: 'Sky ground' }));
      out.push(halftone(0, 0, PW, 520, 22, 10, C.sky, 'down', { label: 'Sky halftone' }));
      out.push(rect(820, 36, 150, 150, C.yel, { rx: 22, rotation: 14, stroke: C.ink, strokeWidth: 6, label: 'Square sun' }), rays(895, 111, 100, 130, 12, C.yel, 7, .38));
      out.push(...blockCloud(40, 262, 1.1), ...blockCloud(760, 250, .9));
      out.push(...farTowers(600, -10, PW + 10, seed + 2, C.red, 160, 290, C.yel, mix(C.red, -.45), .42));
      out.push(...farTowers(612, 40, 330, seed + 9, C.mint, 90, 170, C.yel, mix(C.mint, -.5), .4), ...farTowers(612, 700, 990, seed + 11, C.yel, 90, 190, C.paper, mix(C.yel, -.45), .35));
      out.push(rect(0, 596, PW, 40, C.paper, { stroke: C.ink, strokeWidth: 5, label: 'Pavement' }), rect(0, 636, PW, 132, ROAD, { label: 'Road' }), roadStripe(700, 5, C.yel));
      out.push(...lamp(150, 636, 330, { coneW: 330, strength: .7 }), ...pigeon(842, 520, 1.5, { dir: -1, beak: 'open', mood: 'happy' }));
      out.push(...bus(512, 738, 430, 'joy'));
      // Title "Beep! Block Street": BEEP! is the sound word, BLOCK STREET sits on the banner.
      const words = sp.text.split(/\s+/);
      out.push(...sound(words[0].toUpperCase(), 512, 22, 212, [C.red, C.yel, C.red, C.yel, C.paper], 0, 4));
      out.push(rect(162, 262, 700, 80, C.ink, { rx: 10, rotation: -2, stroke: C.paper, strokeWidth: 5, shadow: { x: 8, y: 9, blur: 0, color: alpha(C.ink, .45) }, label: 'Title banner' }));
      out.push(...letterRow(words.slice(1).join(' ').toUpperCase(), 512, 270, { font: 'bungee', adv: BUNGEE_ADV, size: 68, colors: [C.paper, C.mint, C.yel], stroke: C.ink, sw: 2, bounce: 5, rot: 2, align: 'center', seed: 8 }).objs.map(o => ({ ...o, rotation: (o.rotation || 0) - 2 })));
      out.push(burst(928, 672, 70, C.yel, 4, 12, { rot: 8 }), text(868, 650, 120, `AGES\n${book.ageMin}–${book.ageMax}`, { size: 24, font: 'bungee', color: C.ink, align: 'center', leading: 1, rotation: 8, label: 'Age burst', role: 'LABEL' }));
      out.push(text(36, 712, 330, 'A PLAJAH BOOKS PICTURE BOOK', { size: 15, font: 'rubik', weight: 800, color: C.paper, tracking: .08, wrap: false, label: 'Imprint', role: 'LABEL' }));
      return out;
    }
    case 'hero': {
      if (pageIndex === 1) {
        // ── hero 1: full-bleed street, text on a sign, Bo about to BEEP ──
        out.push(ground(C.sky, { label: 'Sky ground' }), halftone(0, 0, PW, 420, 20, 9, '#8ED2FF', 'down', { label: 'Sky halftone' }));
        out.push(rect(660, 60, 124, 124, C.yel, { rx: 20, rotation: 10, stroke: C.ink, strokeWidth: 6, label: 'Square sun' }), rays(722, 122, 88, 114, 12, C.yel, 3, .36), ...blockCloud(830, 70, 1), ...blockCloud(720, 220, .7));
        out.push(...farTowers(560, 170, 860, seed + 3, C.blue, 150, 330, C.yel, mix(C.blue, -.5), .35));
        out.push(...tower(-30, 600, 250, 500, C.red, seed + 1, { lit: .4, sign: 'BAKERY', roof: 'flat' }), ...tower(800, 600, 250, 480, C.mint, seed + 4, { lit: .35, sign: 'SHOES', roof: 'flat' }));
        out.push(rect(0, 566, PW, 38, C.paper, { stroke: C.ink, strokeWidth: 5, label: 'Pavement' }), rect(0, 604, PW, 164, ROAD, { label: 'Road' }), roadStripe(690, 7, C.yel));
        out.push(rectsObj([[40, 520, 120, 10], [70, 566, 100, 10], [30, 612, 140, 10]].map(a => a as [number, number, number, number]), C.paper, { opacity: .85, label: 'Speed lines' }));
        out.push(...bus(400, 748, 380, 'happy'), ...pigeon(500, 306, 1.25, { dir: 1, beak: 'open', mood: 'happy' }));
        out.push(rays(800, 450, 150, 250, 16, C.yel, 6, .12), ...sound('BEEP!', 800, 380, 126, [C.red, C.paper, C.red, C.paper, C.yel], -8, 6));
        out.push(...signBoard(36, 22, 560, sp.text, { fill: C.yel, size: 27, rot: -1, maxH: 208 }).objs);
        return out;
      }
      // ── hero 2: three windows wake up, one BEEP each ──
      out.push(ground(C.sky, { label: 'Sky ground' }), halftone(0, 0, PW, 400, 20, 9, '#8ED2FF', 'down', { label: 'Sky halftone' }));
      out.push(rect(0, 566, PW, 38, C.paper, { stroke: C.ink, strokeWidth: 5, label: 'Pavement' }), rect(0, 604, PW, 164, ROAD, { label: 'Road' }), roadStripe(700, 12, C.yel));
      const bays: Array<{ x: number; col: string; kind: 'baker' | 'barber' | 'pigeons' }> = [{ x: 28, col: C.yel, kind: 'baker' }, { x: 362, col: C.mint, kind: 'barber' }, { x: 696, col: '#9B8CFF', kind: 'pigeons' }];
      bays.forEach((b, i) => {
        const wx = b.x + 30, wy = 66;
        out.push(rect(b.x, 24, 300, 334, b.col, { stroke: C.ink, strokeWidth: 5, label: 'Shop front' }), rect(b.x + 226, 30, 68, 322, mix(b.col, -.18), { label: 'Block shade' }), rect(b.x - 6, 16, 312, 16, C.ink, { label: 'Cornice' }));
        const awning = (fill: string) => poly([[wx - 8, wy - 4], [wx + 248, wy - 4], [wx + 256, wy - 38], [wx - 16, wy - 38]], fill, { stroke: C.ink, strokeWidth: 4, label: 'Awning' });
        if (b.kind === 'baker') {
          out.push(rect(wx, wy, 240, 200, '#FFE3B0', { rx: 12, stroke: C.ink, strokeWidth: 5, label: 'Bakery window' }), rect(wx + 10, wy + 156, 220, 12, '#8B4A1E', { label: 'Shelf' }), ellipse(wx + 16, wy + 128, 64, 30, '#C77A24', { stroke: C.ink, strokeWidth: 4, label: 'Loaf' }), ellipse(wx + 158, wy + 128, 64, 30, '#C77A24', { stroke: C.ink, strokeWidth: 4, label: 'Loaf' }));
          out.push(...limb([[wx + 90, wy + 140], [wx + 50, wy + 86]], '#FFFFFF', 14), ...limb([[wx + 150, wy + 140], [wx + 192, wy + 86]], '#FFFFFF', 14));
          out.push(rect(wx + 84, wy + 118, 72, 82, '#FFFFFF', { rx: 14, stroke: C.ink, strokeWidth: 4, label: 'Apron' }), ...sleeper(wx + 120, wy + 98, 32, '#FFFFFF'), circle(wx + 100, wy + 52, 20, '#FFFFFF', { stroke: C.ink, strokeWidth: 4, label: 'Chef hat' }), circle(wx + 122, wy + 40, 24, '#FFFFFF', { stroke: C.ink, strokeWidth: 4, label: 'Chef hat' }), circle(wx + 144, wy + 52, 20, '#FFFFFF', { stroke: C.ink, strokeWidth: 4, label: 'Chef hat' }));
          out.push(awning(C.red));
        } else if (b.kind === 'barber') {
          out.push(rect(wx, wy, 240, 200, '#CFEAFF', { rx: 12, stroke: C.ink, strokeWidth: 5, label: 'Barber window' }), rect(wx + 190, wy + 24, 34, 150, C.paper, { rx: 12, stroke: C.ink, strokeWidth: 4, label: 'Barber pole' }));
          const st: Pt[][] = []; for (let k = 0; k < 4; k++) st.push([[wx + 192, wy + 40 + k * 32], [wx + 222, wy + 58 + k * 32], [wx + 222, wy + 74 + k * 32], [wx + 192, wy + 56 + k * 32]]);
          out.push(shape(st, C.red, { label: 'Pole stripes' }));
          out.push(...limb([[wx + 66, wy + 150], [wx + 30, wy + 94]], C.blue, 14), ...limb([[wx + 126, wy + 150], [wx + 160, wy + 100]], C.blue, 14));
          out.push(rect(wx + 56, wy + 124, 80, 76, C.blue, { rx: 14, stroke: C.ink, strokeWidth: 4, label: 'Barber coat' }), ...sleeper(wx + 96, wy + 92, 34, C.ink), poly([[wx + 70, wy + 108], [wx + 122, wy + 108], [wx + 112, wy + 118], [wx + 96, wy + 114], [wx + 80, wy + 118]], C.ink, { label: 'Moustache' }));
          out.push(awning(C.paper));
        } else {
          out.push(rect(wx, wy, 240, 200, '#BFE6FF', { rx: 12, stroke: C.ink, strokeWidth: 5, label: 'Pigeon window' }), rect(wx - 10, wy + 176, 260, 18, C.paper, { stroke: C.ink, strokeWidth: 4, label: 'Window ledge' }));
          ([[56, 150, .62, 1], [128, 128, .66, -1], [196, 152, .6, 1]] as Array<[number, number, number, 1 | -1]>).forEach(([px, py, ps, dir]) => {
            out.push(...pigeon(wx + px, wy + py, ps, { dir, mood: 'shock', beak: 'open' }));
            out.push(stroke(arcPts(wx + px - 30 * ps, wy + py - 70 * ps, 26 * ps, 18 * ps, 200, 340, 8), C.ink, 4, { label: 'Flap line' }), stroke(arcPts(wx + px + 8 * ps, wy + py - 86 * ps, 22 * ps, 14 * ps, 200, 340, 8), C.ink, 4, { label: 'Flap line' }));
          });
          out.push(awning(C.yel));
        }
        out.push(burst(b.x + 244, 304, 70, C.yel, 20 + i, 12, { rot: 8 * i }), ...sound('BEEP!', b.x + 244, 280, 40, [C.red, C.blue, C.red, C.blue, C.red], i % 2 ? 6 : -6, 30 + i));
      });
      out.push(rays(450, 640, 150, 320, 20, C.yel, 4, .1), ...bus(450, 756, 250, 'joy'), ...pigeon(700, 690, .9, { dir: -1, mood: 'happy', beak: 'open' }));
      lines.forEach((ln, i) => { out.push(...signBoard(bays[i].x, 372, 300, ln, { fill: C.paper, size: 25, rot: (i - 1) * 1.2, pad: 18, maxH: 170 }).objs); });
      return out;
    }
    // ── quiet: a colour-block pause, one lamp, one small sad bus ──
    case 'quiet': {
      out.push(ground(C.night, { label: 'Night ground' }));
      out.push(rect(640, 0, 384, PH, C.nightL, { label: 'Night block' }), halftone(640, 0, 384, 768, 24, 9, '#3A55B0', 'left', { label: 'Night halftone' }));
      out.push(...farTowers(640, 620, 1034, seed + 5, mix(C.night, -.2), 260, 520, C.yel, C.nightL, .07));
      out.push(rect(0, 660, PW, 108, mix(C.night, -.35), { label: 'Night road' }));
      out.push(...lamp(90, 660, 500, { arm: 250, coneW: 780, strength: .96, endAlpha: .7, color: '#FFF0A8' }));
      out.push(...signBoard(110, 206, 470, sp.text, { fill: C.paper, size: 30, rot: -1, weight: 700, maxH: 330 }).objs);
      out.push(...bus(340, 744, 190, 'sad'), ...pigeon(352, 120, .95, { dir: 1, mood: 'peek' }));
      out.push(stroke([[690, 700], [740, 700]], C.nightL, 3, { label: 'Kerb' }));
      return out;
    }
    // ── panorama: the traffic jam, everyone honking ──
    case 'panorama': {
      out.push(ground(C.yel, { label: 'Sky ground' }), halftone(0, 0, PW, 380, 20, 10, '#FFE066', 'down', { label: 'Sky halftone' }));
      out.push(...farTowers(390, -10, PW + 10, seed + 6, C.red, 120, 260, C.yel, mix(C.red, -.5), .4));
      out.push(rect(0, 390, PW, 378, ROAD, { label: 'Road' }), rect(0, 382, PW, 14, C.paper, { label: 'Kerb' }));
      out.push(roadStripe(520, 3), roadStripe(660, 4));
      // the jam: ordinary cars with worried eyes behind, then Tilly, Gus and Bo in front
      ([[10, 150, C.blue, 'worried'], [330, 150, C.mint, 'cross'], [490, 150, C.paper, 'worried'], [830, 150, C.red, 'cross']] as Array<[number, number, string, 'worried' | 'cross']>).forEach(([cx, w, col, m], i) => out.push(...car(cx, 476, w, col, m, i % 2 ? -1 : 1)));
      out.push(...taxi(16, 668, 250));
      out.push(...dumper(742, 676, 270));
      out.push(...bus(512, 756, 300, 'shout'));
      out.push(...sound('HONK!', 214, 312, 92, [C.red, C.paper], -6, 9), ...sound('TOOT!', 868, 330, 80, [C.mint, C.blue], 6, 12));
      out.push(stroke([[96, 0], [96, 40]], C.ink, 9, { label: 'Banner pole' }), stroke([[540, 0], [540, 40]], C.ink, 9, { label: 'Banner pole' }));
      out.push(...signBoard(40, 22, 560, lines.slice(0, 4).join('\n'), { fill: C.blue, ink: C.paper, size: 28, align: 'center', weight: 700, maxH: 250 }).objs);
      out.push(stroke([[700, 0], [700, 130]], C.ink, 9, { label: 'Banner pole' }), stroke([[960, 0], [960, 130]], C.ink, 9, { label: 'Banner pole' }));
      out.push(...pigeon(830, 108, .85, { dir: -1, mood: 'peek', beak: 'closed' }));
      out.push(...signBoard(640, 134, 354, lines.slice(4).join('\n'), { fill: C.paper, size: 26, rot: 1, maxH: 230 }).objs);
      return out;
    }
    // ── strip: three panels, Pip looks everywhere ──
    case 'strip': {
      out.push(ground(C.ink, { label: 'Ink ground' }), halftone(0, 0, PW, PH, 18, 6, '#33333A', 'down', { label: 'Ink halftone' }));
      out.push(...letterRow(lines[0].toUpperCase(), 512, 22, { font: 'bungee', adv: BUNGEE_ADV, size: 62, colors: [C.yel, C.paper, C.mint], stroke: C.ink, sw: 9, bounce: 7, rot: 3, shadow: { x: 4, y: 5, color: C.red }, align: 'center', seed: 21, track: -2 }).objs);
      const caps = [lines[1], lines[2], lines.slice(3).join('\n')];
      const panels: Array<{ x: number; y: number; w: number; h: number; col: string; kind: 'bakery' | 'barber' | 'pipe' }> = [
        { x: 36, y: 130, w: 300, h: 600, col: C.red, kind: 'bakery' },
        { x: 362, y: 100, w: 300, h: 630, col: C.blue, kind: 'barber' },
        { x: 688, y: 130, w: 300, h: 600, col: C.mint, kind: 'pipe' },
      ];
      panels.forEach((p, i) => {
        out.push(rect(p.x, p.y, p.w, p.h, p.col, { stroke: C.paper, strokeWidth: 8, label: 'Panel' }));
        out.push(halftone(p.x, p.y, p.w, p.h * .55, 16, 6, mix(p.col, .3), 'down', { label: 'Panel halftone' }));
        if (p.kind === 'bakery') {
          out.push(rect(p.x + 34, p.y + 30, 232, 230, '#7A2A0A', { rx: 10, stroke: C.ink, strokeWidth: 6, label: 'Oven door' }), rect(p.x + 54, p.y + 50, 192, 190, C.yel, { rx: 6, label: 'Oven glow' }));
          [[80, 140], [170, 120], [130, 190]].forEach(([bx, by]) => out.push(ellipse(p.x + bx, p.y + by, 84, 34, '#C77A24', { stroke: C.ink, strokeWidth: 4, label: 'Loaf' })));
          out.push(rect(p.x + 20, p.y + 270, 260, 14, C.ink, { label: 'Shelf' }));
        } else if (p.kind === 'barber') {
          out.push(rect(p.x + 100, p.y + 30, 100, 250, C.paper, { rx: 16, stroke: C.ink, strokeWidth: 6, label: 'Barber pole' }));
          const st: Pt[][] = []; for (let k = 0; k < 5; k++) st.push([[p.x + 106, p.y + 56 + k * 42], [p.x + 194, p.y + 84 + k * 42], [p.x + 194, p.y + 106 + k * 42], [p.x + 106, p.y + 78 + k * 42]]);
          out.push(shape(st, C.red, { label: 'Pole stripes' }), circle(p.x + 150, p.y + 26, 28, C.yel, { stroke: C.ink, strokeWidth: 5, label: 'Pole cap' }));
        } else {
          out.push(circle(p.x + 150, p.y + 140, 124, C.ink, { label: 'Tailpipe' }), circle(p.x + 150, p.y + 140, 94, '#0B0B0D', { label: 'Pipe dark' }), circle(p.x + 150, p.y + 140, 124, 'none', { stroke: '#9AA0A6', strokeWidth: 12, label: 'Pipe rim' }));
          out.push(poly([[p.x + 134, p.y + 144], [p.x + 166, p.y + 144], [p.x + 158, p.y + 168], [p.x + 142, p.y + 168]], C.red, { stroke: C.paper, strokeWidth: 3, label: 'Tiny stuck beep' }));
          out.push(star4(p.x + 150, p.y + 110, 22, C.yel), star4(p.x + 100, p.y + 190, 13, C.paper), star4(p.x + 204, p.y + 194, 15, C.paper));
        }
        out.push(...pigeon(p.x + 150 + (i === 1 ? -6 : 0), p.y + 374 - (i === 2 ? 30 : 0), 1.3, { dir: i === 1 ? -1 : 1, mood: i === 2 ? 'shock' : 'peek', beak: i === 2 ? 'open' : 'closed' }));
        const capTop = p.y + p.h - 170;
        const cap = fitText(p.x + 26, capTop + 18, p.w - 52, caps[i], { face: 'rubik700', max: 25, min: 22, leading: 1.3, color: C.ink, rotation: i === 1 ? .8 : -.8, maxH: 118 });
        out.push(rect(p.x + 8, capTop, p.w - 16, cap.h + 36, C.paper, { rx: 10, stroke: C.ink, strokeWidth: 4, rotation: i === 1 ? .8 : -.8, label: 'Caption tag' }), cap.obj);
      });
      return out;
    }
    // ── reveal: scale shock, the BEEP is enormous and Bo is tiny ──
    case 'reveal': {
      out.push(ground(C.red, { label: 'Red ground' }), rays(512, 400, 120, 1100, 26, mix(C.red, -.16), 4, .5), halftone(0, 0, PW, PH, 26, 11, '#FF5C7D', 'left', { label: 'Burst halftone' }));
      out.push(rays(512, 400, 120, 1100, 26, C.yel, 17, .09));
      out.push(...sound('BEEP!', 512, 190, 292, [C.yel, C.paper, C.yel, C.paper, C.yel], -5, 31));
      out.push(star4(130, 330, 50, C.paper), star4(940, 330, 44, C.yel), star4(920, 600, 54, C.paper), star4(70, 560, 40, C.yel));
      out.push(...bus(850, 754, 190, 'joy'), ...pigeon(850, 532, .9, { dir: -1, beak: 'open', mood: 'happy' }));
      out.push(...signBoard(36, 22, 560, lines[0], { fill: C.paper, size: 28, rot: -1.2, maxH: 130 }).objs);
      out.push(burst(840, 100, 92, C.yel, 33, 14, { rot: 6 }), ...sound(lines[1], 840, 60, 62, [C.red, C.blue, C.red], 6, 36));
      out.push(...signBoard(36, 560, 620, lines.slice(2).join('\n'), { fill: C.paper, size: 28, rot: 1, maxH: 190 }).objs);
      return out;
    }
    // ── closing: soft dusk, Bo parked, Pip asleep on the roof ──
    case 'closing': {
      out.push(ground('#FF7A59', { gradient: lin(90, [0, C.blue], [.55, '#FF8F6B'], [1, C.yel]), label: 'Dusk sky' }));
      out.push(halftone(0, 360, PW, 220, 20, 8, '#FFC9A3', 'up', { label: 'Dusk halftone' }));
      out.push(rect(414, 330, 200, 200, C.yel, { rx: 28, stroke: C.ink, strokeWidth: 6, label: 'Setting square sun' }), rays(514, 430, 120, 170, 14, '#FFD84D', 5, .34));
      out.push(...farTowers(640, -10, PW + 10, seed + 8, mix(C.red, -.35), 170, 330, C.yel, mix(C.red, -.55), .55));
      out.push(rect(0, 640, PW, 128, ROAD, { label: 'Road' }), roadStripe(710, 6, C.yel));
      out.push(...lamp(150, 640, 360, { coneW: 340, strength: .6 }), ...lamp(880, 640, 330, { coneW: 300, flip: -1, strength: .6 }));
      out.push(...bus(514, 740, 330, 'sleep'));
      out.push(...pigeon(526, 460, 1.0, { dir: 1, mood: 'sleep' }));
      out.push(...signBoard(34, 26, 600, sp.text, { fill: C.paper, size: 27, rot: -1, maxH: 352, pad: 22 }).objs);
      out.push(...letterRow('THE END', 840, 74, { font: 'bungee', adv: BUNGEE_ADV, size: 62, colors: [C.yel, C.paper], stroke: C.ink, sw: 9, bounce: 6, rot: 4, shadow: { x: 4, y: 5, color: C.ink }, align: 'center', seed: 61 }).objs);
      return out;
    }
    // ── activity: a voxel-grid facade, find Pip in the windows ──
    case 'activity': {
      out.push(ground(C.paper, { label: 'Paper ground' }), halftone(0, 0, PW, PH, 22, 7, '#FFE3B0', 'right', { label: 'Paper halftone' }));
      const gx = 60, gy = 150, cell = 118; const kinds = ['pip', 'plant', 'cat', 'lamp', 'bus', 'plant', 'lamp', 'cat', 'dark', 'pip', 'lamp', 'plant', 'cat', 'dark', 'pip', 'lamp'];
      out.push(rect(gx - 22, gy - 56, cell * 4 + 44, cell * 4 + 78, C.blue, { stroke: C.ink, strokeWidth: 7, shadow: { x: 10, y: 11, blur: 0, color: alpha(C.ink, .85) }, label: 'Tall building' }), rect(gx - 34, gy - 78, cell * 4 + 68, 26, C.ink, { label: 'Cornice' }));
      kinds.forEach((k, i) => {
        const cx = gx + (i % 4) * cell, cy = gy + Math.floor(i / 4) * cell; const bw = cell - 18;
        const bg = k === 'dark' ? mix(C.blue, -.55) : k === 'lamp' ? C.yel : mix(C.blue, .55);
        out.push(rect(cx, cy, bw, bw, bg, { rx: 6, stroke: C.ink, strokeWidth: 4, label: 'Window' }));
        if (k === 'pip') out.push(...pigeon(cx + bw / 2 - 2, cy + bw * .62, .5, { dir: i % 2 ? -1 : 1, mood: 'peek' }));
        else if (k === 'plant') out.push(rect(cx + bw / 2 - 18, cy + bw - 36, 36, 30, C.red, { rx: 5, stroke: C.ink, strokeWidth: 3, label: 'Pot' }), tri(cx + bw / 2 - 28, cy + 22, 22, 46, C.mint, { stroke: C.ink, strokeWidth: 3, label: 'Leaf' }), tri(cx + bw / 2 + 4, cy + 14, 26, 56, C.mint, { stroke: C.ink, strokeWidth: 3, label: 'Leaf' }));
        else if (k === 'cat') out.push(circle(cx + bw / 2, cy + bw * .6, 28, C.yel === bg ? C.paper : '#FF9A3C', { stroke: C.ink, strokeWidth: 3.5, label: 'Cat' }), tri(cx + bw / 2 - 28, cy + bw * .6 - 46, 20, 26, '#FF9A3C', { stroke: C.ink, strokeWidth: 3, label: 'Ear' }), tri(cx + bw / 2 + 8, cy + bw * .6 - 46, 20, 26, '#FF9A3C', { stroke: C.ink, strokeWidth: 3, label: 'Ear' }), circle(cx + bw / 2 - 10, cy + bw * .6 - 4, 4, C.ink, { label: 'Cat eye' }), circle(cx + bw / 2 + 10, cy + bw * .6 - 4, 4, C.ink, { label: 'Cat eye' }));
        else if (k === 'lamp') out.push(circle(cx + bw / 2, cy + bw / 2, 24, C.paper, { stroke: C.ink, strokeWidth: 3.5, label: 'Lamp' }), circle(cx + bw / 2, cy + bw / 2, 11, '#FFF3B0', { label: 'Lamp glow' }));
        else if (k === 'bus') out.push(...bus(cx + bw / 2, cy + bw - 6, 72, 'happy'));
      });
      // "Where is Pip now?" is the headline (two Bungee rows); the two questions ride a sign board.
      out.push(...letterRow('WHERE IS PIP', 762, 28, { font: 'bungee', adv: BUNGEE_ADV, size: 56, colors: [C.red, C.blue, C.mint], stroke: C.ink, sw: 8, bounce: 6, rot: 4, shadow: { x: 4, y: 5, color: C.ink }, align: 'center', seed: 41 }).objs);
      out.push(...letterRow('NOW?', 762, 98, { font: 'bungee', adv: BUNGEE_ADV, size: 56, colors: [C.mint, C.red, C.blue], stroke: C.ink, sw: 8, bounce: 6, rot: 4, shadow: { x: 4, y: 5, color: C.ink }, align: 'center', seed: 43 }).objs);
      out.push(...signBoard(556, 190, 410, lines.slice(1).join('\n'), { fill: C.yel, size: 27, rot: 1.2, maxH: 230 }).objs);
      out.push(...pigeon(640, 540, 1.1, { dir: 1, mood: 'peek' }));
      out.push(text(724, 500, 90, 'Pips:', { size: 26, font: 'rubik', weight: 800, color: C.ink, wrap: false, label: 'Answer label', role: 'LABEL' }), rect(814, 490, 110, 54, C.paper, { rx: 12, stroke: C.ink, strokeWidth: 4, label: 'Answer box' }));
      out.push(circle(745, 630, 26, C.yel, { stroke: C.ink, strokeWidth: 4, label: 'Lamp icon' }), text(790, 606, 110, 'Lamps:', { size: 26, font: 'rubik', weight: 800, color: C.ink, wrap: false, label: 'Answer label', role: 'LABEL' }), rect(904, 600, 70, 54, C.paper, { rx: 12, stroke: C.ink, strokeWidth: 4, label: 'Answer box' }));
      return out;
    }
    // ── back cover ──
    default: {
      out.push(ground(C.blue, { label: 'Sky ground' }), halftone(0, 0, PW, 400, 22, 9, C.sky, 'down', { label: 'Sky halftone' }), ...blockCloud(60, 80, 1), ...blockCloud(780, 380, .8));
      out.push(...farTowers(640, -10, PW + 10, seed + 12, C.mint, 120, 250, C.yel, mix(C.mint, -.5), .4), ...farTowers(652, 20, 400, seed + 13, C.red, 90, 180, C.yel, mix(C.red, -.5), .4));
      out.push(rect(0, 640, PW, 128, ROAD, { label: 'Road' }), roadStripe(710, 8, C.yel));
      out.push(...bus(250, 740, 250, 'happy'), ...pigeon(640, 620, 1.0, { dir: -1, mood: 'happy' }));
      out.push(...letterRow(book.title.toUpperCase(), 512, 34, { font: 'bungee', adv: BUNGEE_ADV, size: 62, colors: [C.yel, C.paper, C.red], stroke: C.ink, sw: 9, bounce: 6, rot: 3, shadow: { x: 4, y: 5, color: C.ink }, align: 'center', seed: 71, track: -1 }).objs);
      const b = signBoard(150, 150, 724, sp.text, { fill: C.paper, size: 29, rot: -1, maxH: 280 });
      out.push(...b.objs);
      out.push(text(150, 150 + b.h + 24, 560, `AGES ${book.ageMin}–${book.ageMax}  ·  READ ALOUD  ·  PLB-0005`, { size: 21, font: 'rubik', weight: 800, color: C.yel, wrap: false, label: 'Age line', role: 'LABEL' }));
      const bars: Array<[number, number, number, number]> = []; const q = orn.rng(seed); let bx = 842; for (let i = 0; i < 24; i++) { const bw = 2 + Math.floor(q() * 3); bars.push([bx, 668, bw, 56]); bx += bw + 2 + Math.floor(q() * 3); }
      out.push(rect(826, 652, 150, 88, C.paper, { rx: 6, label: 'Barcode plate' }), rectsObj(bars.filter(bb => bb[0] < 960), C.ink, { label: 'Barcode' }));
      return out;
    }
  }
};
function star4(cx: number, cy: number, r: number, fill: string): O {
  const pts: Pt[] = []; for (let i = 0; i < 8; i++) { const a = (i * 45 - 90) * Math.PI / 180; const rad = i % 2 ? r * .32 : r; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
  return poly(pts, fill, { stroke: CI.ink, strokeWidth: 3.5, label: 'Sparkle' });
}


export const DESIGNS: Record<string, PublicationDesigner> = { 'story-city': city, 'story-folktale': folktale };
export const LESSONS: Record<string, DesignLesson> = {
  'story-city': {
    principle: 'A picture book is built from one shape and one idea per spread: here the shape is the 90-degree block, so every tower, sign, window and bus sits on the same grid, while scale does the storytelling (a tiny bus under one lamp, then a BEEP bigger than the page).',
    history: 'The flat, saturated, hard-edged look of mid-century children’s books came from screen printing and lithography, where each colour was a separate plate. Artists such as Miroslav Šašek and the Provensens used few inks, off-register overprints and big simple shapes so that a picture could be read from across a room. Sound words set as part of the picture come from comics and sign painting.',
    tryThis: 'Print the cover at thumbnail size, then change the bus from red to blue and see whether it still pops against the blue sky. Then move one lit window and notice how the whole street changes mood.',
    interestTag: 'Picture books',
    related: ['Screen printing', 'Mid-century illustration', 'Sound words'],
  },
  'story-folktale': {
    principle: 'A folk tale is carried by a single through-line: one golden thread enters every page at the height where it left the last, so the reader’s eye follows it through the whole book, and triangles and mirror symmetry keep the pictures calm enough to hold the story.',
    history: 'Folk papercut and block-print illustration grew from village crafts: Polish wycinanki, Mexican papel picado, Russian lubok and Indian textile blocks all cut or carved bold triangles, diamonds and mirrored motifs because a single tool could repeat them. Picture-book artists later borrowed that look because it reads instantly, even to a very young child.',
    tryThis: 'Find the thread on every page, then cover one page’s thread with a finger and see whether you can still tell where it left and where it enters next. Then re-colour the thread red and notice how the eye loses the line against the crimson hills.',
    interestTag: 'Picture books',
    related: ['Folk art', 'Papercut', 'Block printing'],
  },
};
