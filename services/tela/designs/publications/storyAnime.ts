// storyAnime: "Sakura and the Sky Whale" (story-anime). Ages 4-8, landscape 960x768.
//
// MEDIUM: anime / manga-inspired, Plajah-original. Clean variable-weight ink line, cel-shaded two-tone
// fills (base + hard shadow + highlight band), huge glossy layered eyes, flowing hair, soft pastel
// gradient skies, cherry petals, twinkle stars, speed lines, impact bursts and emotion marks.
// FORMAT: a manga-influenced mix inside a picture-book frame, read left to right: full-bleed gradient
// scenes, a diagonal-cut panel spread, a close-up eyes strip, a speed-line action page, a double-page
// whale reveal (scale shock), a quiet starlit page, a reaction-panel grid, a flight panorama.
// Spread = one picture (fold at x=480): faces stay out of x 452..508; skies and bodies cross.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import {
  AP, rect, ellipse, circle, poly, multiPoly, halftone, rng, lin, glow, sky, cloud, sparkles, bokeh, petals, petalPts, speedLines, streaks, burst,
  sweatDrop, hearts, veinMark, blushHatch, exclaim, title, titleLine, caption, bubble, body, smooth, taperPts, star4, drawer, type O, type Pt,
} from './kidsArtAnime';
import { sakura, sakuraHead, eye, whale, hill, sakuraTree, townRow, type Mood } from './animeChars';
import { crescent } from './kidsArtA';

const W = 960, H = 768;

// ── shared bits ─────────────────────────────────────────────────────────────
const PAPER = '#FFF7FB';
const SHD = { x: 3, y: 5, blur: 5, color: 'rgba(30,20,80,.25)' };
/** Everything outside the panels is painted paper (even-odd), then each panel gets an ink frame. */
function maskPanels(panels: Pt[][], paper = PAPER): O[] {
  return [multiPoly([[[0, 0], [W, 0], [W, H], [0, H]], ...panels], paper, { label: 'Page paper' }), ...panels.map(p => poly(p, 'none', { stroke: AP.indigo, strokeWidth: 5, label: 'Panel frame' }))];
}
function bigPetal(o: O[], cx: number, cy: number, r: number, rot = .3, glowCol = '#FFF3C4'): void {
  o.push(glow(cx, cy, r * 2.4, glowCol, .9));
  o.push(poly(petalPts(cx, cy, r, rot), AP.sakuraD, { stroke: AP.indigo, strokeWidth: Math.max(3, r * .05), label: 'Glowing petal' }));
  o.push(poly(petalPts(cx - r * .1, cy - r * .1, r * .82, rot), AP.sakura, { label: 'Petal light' }));
  o.push(poly(petalPts(cx - r * .22, cy - r * .22, r * .45, rot), AP.sakuraL, { opacity: .9, label: 'Petal highlight' }));
  o.push(...sparkles(cx - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.8, 6, Math.round(r), [AP.white, AP.gold], 6, 14));
}
function note(cx: number, cy: number, s: number, col: string): O[] {
  return [ellipse(cx - s * .5, cy - s * .3, s, s * .66, col, { rotation: -20, stroke: AP.indigo, strokeWidth: 2.5, label: 'Music note' }), poly(taperPts([[cx + s * .42, cy - s * .15], [cx + s * .42, cy - s * 1.5]], s * .16, s * .16), AP.indigo, { label: 'Note stem' }), poly([[cx + s * .42, cy - s * 1.5], [cx + s * 1.0, cy - s * 1.1], [cx + s * .5, cy - s * .95]], AP.indigo, { label: 'Note flag' })];
}
function waves(o: O[], x: number, y: number, w: number, amp: number, n: number, cols: string[]): void {
  for (let i = 0; i < n; i++) {
    const pts: Pt[] = []; for (let k = 0; k <= 24; k++) pts.push([x + w * k / 24, y + i * 20 + Math.sin(k / 24 * Math.PI * 3 + i) * amp]);
    o.push(poly(taperPts(pts, 3, 12 - i * 2, 0), cols[i % cols.length], { opacity: .85, label: 'Song wave' }));
  }
}
function birds(o: O[], list: Array<[number, number, number]>, col = AP.indigo): void {
  const rings: Pt[][] = [];
  for (const [x, y, s] of list) { rings.push(taperPts(smooth([[x - s, y - s * .2], [x - s * .45, y - s * .55], [x, y]], false, 4), 1, s * .16, 0), taperPts(smooth([[x, y], [x + s * .45, y - s * .55], [x + s, y - s * .2]], false, 4), s * .16, 1, 0)); }
  o.push(multiPoly(rings, col, { label: 'Birds' }));
}

// ── page 0 · cover ───────────────────────────────────────────────────────────
function cover(): O[] {
  const o: O[] = [sky(W, H, '#8D7BFF', '#C7A4FF', '#FFB5D2', '#FFDDBA')];
  o.push(glow(700, 470, 470, '#FFF3C4', .95));
  o.push(...bokeh(0, 120, W, 640, 12, 3, ['#FFFFFF', '#FFD3E3', '#CFF3FF'], 14, 44, .5));
  o.push(...cloud(110, 330, 280, 80, 4, { top: '#FFFFFF', bottom: '#F0E4FF' }), ...cloud(860, 330, 240, 70, 5, { top: '#FFFFFF', bottom: '#F0E4FF' }));
  o.push(...petals(0, 240, W, 520, 34, 2, [AP.sakura, AP.sakuraL, AP.white], 8, 20, [[40, 20, 880, 280]]));
  whale(o, { cx: 610, cy: 530, s: 290, rot: -8 }, { mood: 'smile' });
  o.push(...cloud(850, 730, 380, 110, 6, { top: '#FFFFFF', bottom: '#FFE3F0' }), ...cloud(100, 750, 420, 120, 7, { top: '#FFFFFF', bottom: '#FFE3F0' }));
  sakura(o, { cx: 300, cy: 540, s: 138, rot: -4 }, 'wave', { mood: 'open', look: [.6, -.4], swing: -.25 });
  o.push(...sparkles(0, 280, W, 480, 22, 8, [AP.white, AP.gold, '#FFFFFF'], 7, 20, [[150, 380, 300, 400]]));
  o.push(...title(480, 18, 'Sakura', 170, { colors: [AP.sakura, AP.sakuraL, AP.sakura, AP.peach, AP.sakura, AP.sakuraL], outer: AP.indigo, inner: AP.white, shadow: '#5B3FB0', bounce: 8, rot: 3, seed: 5, ow: 12, label: 'Title' }));
  o.push(...titleLine(480, 214, 'and the Sky Whale', 56, AP.sky, { outer: AP.indigo, inner: AP.white, ow: 7, label: 'Subtitle' }));
  o.push(burst(868, 322, 62, 12, 4, AP.gold, { sw: 4 }), ...title(868, 296, 'Ages', 24, { colors: [AP.indigo], outer: AP.gold, inner: AP.gold, ow: 1, label: 'Age badge' }), ...title(868, 320, '4-8', 30, { colors: [AP.hot], outer: AP.gold, inner: AP.gold, ow: 1, label: 'Age badge' }));
  return o;
}

// ── page 1 · diagonal-cut panel spread ───────────────────────────────────────
function diagonal(): O[] {
  const A: Pt[] = [[34, 34], [566, 34], [484, 432], [34, 432]], B: Pt[] = [[596, 34], [926, 34], [926, 520], [512, 520]];
  const C: Pt[] = [[34, 466], [470, 466], [426, 734], [34, 734]], D: Pt[] = [[556, 556], [926, 556], [926, 734], [500, 734]];
  const o: O[] = [rect(0, 0, W, H, PAPER, { label: 'Page ground', role: 'GROUND' })];
  // A: morning town, small Sakura seen from behind, a petal falling out of the sky
  o.push(poly(A, '#79D3FF', { gradient: lin(90, '#79D3FF', '#CDEBFF', '#FFE4D0', '#FFD3E3'), label: 'Panel A sky' }), glow(130, 110, 170, '#FFF6C8', .95));
  o.push(...cloud(330, 150, 210, 62, 11, { bottom: '#FFE9F2' }), ...cloud(470, 250, 170, 50, 12, { bottom: '#FFE9F2' }));
  o.push(hill(34, 566, 340, 50, 21, 440, '#C6B5FF'), hill(34, 566, 372, 36, 22, 440, '#FFB5D2'));
  townRow(o, 44, 470, 404, 5, .85); sakuraTree(o, 430, 428, 250, 4);
  o.push(hill(34, 566, 404, 18, 23, 440, '#BDF0C8', ['#BDF0C8', '#8EDDB0']));
  bigPetal(o, 372, 130, 30, .6);
  sakura(o, { cx: 200, cy: 270, s: 46 }, 'stand', { back: true, lite: true });
  // B: close-up, eyes full of sky
  o.push(poly(B, '#B9A6FF', { gradient: lin(90, '#B9A6FF', '#FFB3D1', '#FFE0B8'), label: 'Panel B sky' }));
  o.push(...bokeh(560, 30, 380, 480, 8, 31, ['#FFFFFF', '#FFD3E3', '#CFF3FF'], 16, 46, .55), speedLines(742, 300, 150, 440, 36, 5, '#FFFFFF', 9, .45));
  sakura(o, { cx: 750, cy: 300, s: 118, rot: 5 }, 'stand', { mood: 'wow', look: [.25, -.9], lite: true });
  o.push(...petals(580, 40, 350, 470, 12, 14, [AP.sakura, AP.white], 8, 16, [[640, 160, 220, 300]]), ...sparkles(580, 40, 350, 470, 9, 15, [AP.white, AP.gold], 6, 16, [[640, 160, 220, 300]]));
  // C: the petal in her hands
  o.push(poly(C, '#2B2670', { gradient: lin(90, '#2B2670', '#5B3FB0', '#9A6AD8'), label: 'Panel C ground' }));
  o.push(...bokeh(40, 470, 400, 260, 6, 41, ['#FFD3E3', '#B9A6FF', '#FFF3C4'], 12, 34, .5));
  bigPetal(o, 140, 600, 78, .4);
  o.push(ellipse(40, 668, 150, 76, AP.skin, { rotation: -14, stroke: AP.indigo, strokeWidth: 4, label: 'Hand' }), ellipse(112, 676, 150, 76, AP.skinD, { rotation: 12, stroke: AP.indigo, strokeWidth: 4, label: 'Hand' }));
  o.push(rect(34, 714, 90, 40, AP.lav, { stroke: AP.indigo, strokeWidth: 4, label: 'Sleeve' }));
  // D: the shadow
  o.push(poly(D, '#4B3FA0', { gradient: lin(90, '#4B3FA0', '#9A6AC8', '#FFB89A'), label: 'Panel D sky' }));
  townRow(o, 520, 930, 722, 9, .55, ['#E4D4F7', '#F7DCEB', '#D3E2F7']);
  o.push(ellipse(480, 440, 560, 300, AP.night, { opacity: .6, blur: 12, rotation: -6, label: 'Giant shadow' }));
  birds(o, [[650, 610, 12], [700, 590, 10], [760, 618, 13], [820, 596, 9], [872, 622, 11]], AP.indigo);
  o.push(...maskPanels([A, B, C, D]));
  o.push(...caption(52, 50, ['One spring morning, a deep,', 'soft song drifted down', 'from the sky.'], 23, { w: 316 }));
  o.push(...titleLine(702, 52, 'Ooooh...', 50, AP.sakura, { rotation: -6, label: 'Sound words' }));
  o.push(...caption(238, 560, ['A glowing petal', 'landed in her', 'hands.'], 22, { w: 206 }));
  o.push(...titleLine(742, 560, 'Fwooooom...', 40, AP.white, { rotation: -3, label: 'Sound words' }));
  o.push(...caption(586, 636, ['Then the sky went dark', 'and deep!'], 22, { w: 300 }));
  return o;
}

// ── page 2 · close-up eyes strip ────────────────────────────────────────────
function eyesStrip(): O[] {
  const o: O[] = [sky(W, H, '#FFE9F2', '#FFD3E3')];
  o.push(...halftone(0, 0, W, 120, 18, '#FFB3D1', { grade: 'y', flip: true, max: 7, min: 1, opacity: .75 }), ...halftone(0, 640, W, 128, 18, '#FFB3D1', { grade: 'y', max: 7, min: 1, opacity: .75 }));
  const band: Pt[] = [[0, 130], [W, 108], [W, 630], [0, 652]];
  o.push(poly(band, AP.skin, { gradient: lin(90, '#F0B3A2', '#FFE6D8', '#FFE6D8', '#FFD2C2'), label: 'Close-up skin' }));
  const d = drawer({ cx: 480, cy: 256, s: 520 }, o);
  eye(d, -1, 'wow', [-.1, -.55]); eye(d, 1, 'wow', [-.1, -.55]);
  // sky reflected in the irises: little petals
  for (const sx of [-1, 1]) { const ix = 480 + sx * .43 * 520 - .05 * 520, iy = 256 + (.22 + .03 - .025) * 520; o.push(multiPoly([petalPts(ix + 20, iy + 62, 14, .4), petalPts(ix - 26, iy + 78, 10, -.5), petalPts(ix + 54, iy + 36, 9, 1.1)], AP.sakuraL, { opacity: .95, label: 'Petal reflection' })); }
  o.push(ellipse(60, 518, 300, 120, AP.sakura, { opacity: .5, blur: 6, label: 'Blush' }), ellipse(600, 518, 300, 120, AP.sakura, { opacity: .5, blur: 6, label: 'Blush' }), blushHatch(210, 575, 90), blushHatch(750, 575, 90));
  // bangs along the top of the strip
  const bangs: Pt[] = [[0, 124], [W, 100], [W, 214], [900, 176], [850, 262], [790, 168], [720, 226], [640, 150], [560, 240], [520, 150], [430, 232], [380, 150], [300, 262], [240, 168], [160, 230], [90, 160], [0, 250]];
  o.push(poly(bangs, AP.sakura, { stroke: AP.indigo, strokeWidth: 6, label: 'Bangs' }), poly([[0, 140], [W, 116], [W, 150], [0, 176]], AP.sakuraL, { opacity: .9, label: 'Hair shine' }));
  o.push(...maskPanels([band]));
  o.push(...petals(0, 100, W, 560, 12, 4, [AP.sakura, AP.white], 8, 15, [[100, 190, 320, 340], [560, 190, 320, 340]]), ...sparkles(0, 100, W, 560, 8, 5, [AP.white, AP.gold], 6, 14, [[100, 190, 320, 340], [560, 190, 320, 340]]));
  o.push(...caption(52, 660, ['Her eyes grew as round', 'as two little moons.'], 26, { w: 400 }));
  waves(o, 520, 690, 400, 14, 3, [AP.sky, AP.lav, AP.sakura]);
  o.push(...note(560, 700, 22, AP.lavD), ...note(700, 676, 18, AP.sky), ...note(860, 700, 24, AP.sakuraD));
  return o;
}

// ── page 3 · speed-line action ──────────────────────────────────────────────
function action(): O[] {
  const o: O[] = [sky(W, H, '#FFF4C9', '#FFE3F0', '#D6F2FF')];
  o.push(speedLines(690, 340, 120, 760, 70, 7, AP.white, 14, .95), speedLines(690, 340, 200, 800, 46, 9, AP.indigo, 5, .55));
  o.push(streaks(0, 360, 560, 340, 22, 3, AP.indigo, .5, .25, .8, 4));
  townRow(o, -20, 520, 690, 12, .8, ['#E4D4F7', '#F7DCEB', '#D3E2F7']);
  o.push(hill(0, W, 700, 14, 5, 768, '#BDF0C8', ['#BDF0C8', '#8EDDB0']), streaks(0, 700, W, 60, 14, 4, AP.white, .8, .2, .6, 5));
  bigPetal(o, 860, 200, 36, -.5);
  o.push(...sparkles(560, 60, 400, 260, 8, 6, [AP.white, AP.gold], 6, 14, [[620, 40, 160, 100]]));
  sakura(o, { cx: 650, cy: 320, s: 98, rot: 9 }, 'run', { mood: 'open', look: [.9, -.2], swing: -.9, tailLift: .25, lite: true });
  o.push(...sweatDrop(766, 250, 18));
  o.push(burst(200, 400, 120, 14, 3, AP.gold, { sw: 6 }), ...title(200, 352, 'DASH!', 66, { colors: [AP.hot, AP.white, AP.hot, AP.white, AP.hot], outer: AP.indigo, inner: AP.gold, bounce: 4, rot: 5, seed: 8, ow: 6, label: 'SFX' }));
  o.push(...bubble(300, 130, 380, 130, 590, 300), body(130, 94, 340, ['Wait for me,', 'little petal!'], 32, AP.indigo, { align: 'center', lh: 1.3, label: 'Speech' }));
  o.push(...caption(40, 584, ['Sakura ran and ran after', 'the shining petal.'], 26, { w: 420 }));
  return o;
}

// ── page 4 · the whale reveal (double page, scale shock) ────────────────────
function reveal(): O[] {
  const o: O[] = [sky(W, H, '#6FD3FF', '#CFEFFF', '#FFE8F0', '#FFF3E0')];
  o.push(glow(720, 220, 560, '#FFFFFF', .85));
  for (let i = 0; i < 4; i++) o.push(poly([[900 + i * 30, -40], [200 + i * 180, 780], [320 + i * 180, 780]], AP.white, { opacity: .13, label: 'Light ray' }));
  o.push(...bokeh(0, 0, W, 700, 10, 51, ['#FFFFFF', '#FFD3E3', '#CFF3FF'], 20, 60, .45));
  whale(o, { cx: 480, cy: 330, s: 620, rot: -3 }, { mood: 'smile' });
  o.push(...petals(0, 0, W, 700, 24, 8, [AP.sakura, AP.sakuraL, AP.white], 9, 20), ...sparkles(0, 0, W, 700, 14, 9, [AP.white, AP.gold], 8, 22));
  o.push(...cloud(210, 700, 520, 130, 15, { bottom: '#FFE3F0' }), ...cloud(780, 720, 420, 120, 16, { bottom: '#FFE3F0' }));
  o.push(hill(0, 330, 752, 16, 6, 768, '#BDF0C8', ['#BDF0C8', '#8EDDB0']));
  sakuraTree(o, 300, 756, 130, 3, true);
  sakura(o, { cx: 100, cy: 678, s: 23 }, 'cheer', { mood: 'wow', look: [.5, -.9], lite: true });
  o.push(...caption(340, 646, ['It was the biggest, kindest', 'whale in the whole sky!'], 28, { w: 450 }));
  return o;
}

// ── page 5 · the quiet starlit page ─────────────────────────────────────────
function quiet(): O[] {
  const o: O[] = [sky(W, H, '#0B0933', '#1E1B63', '#3B2C8E', '#6A47B8')];
  o.push(glow(160, 150, 260, '#B9A6FF', .35), ...bokeh(0, 0, W, 768, 7, 61, ['#B9A6FF', '#7FD8FF', '#FFD3E3'], 18, 48, .25));
  o.push(...sparkles(0, 0, W, 560, 54, 62, ['#FFFFFF', AP.gold, '#CFF3FF'], 3, 10), ...sparkles(0, 0, W, 300, 10, 63, ['#FFFFFF'], 9, 17));
  const cr = crescent(790, 160, 76, -.7, -.5, 58); if (cr.length > 3) o.push(glow(790, 160, 150, '#FFF3C4', .45), poly(cr, '#FFF1B8', { stroke: '#FFE9A0', strokeWidth: 2, label: 'Crescent moon' }));
  // a whale constellation
  const cs: Pt[] = [[560, 90], [610, 70], [670, 84], [706, 120], [680, 156], [620, 160], [572, 134]];
  o.push(poly(cs, 'none', { open: true, stroke: '#CFF3FF', strokeWidth: 2, dash: [3, 7], opacity: .7, label: 'Constellation' }), multiPoly(cs.map(([x, y]) => star4(x, y, 9, .3)), AP.white, { label: 'Constellation stars' }));
  o.push(poly(taperPts([[300, 70], [180, 130]], 2, 10, 0), AP.white, { opacity: .85, label: 'Shooting star' }), multiPoly([star4(302, 69, 10, .3)], AP.white, { label: 'Shooting star head' }));
  o.push(...cloud(220, 640, 520, 130, 17, { top: '#6A47B8', bottom: '#3B2C8E', shade: '#2A1F75', opacity: .85 }), ...cloud(900, 700, 400, 120, 18, { top: '#6A47B8', bottom: '#3B2C8E', shade: '#2A1F75', opacity: .85 }));
  whale(o, { cx: 650, cy: 560, s: 215, rot: -3 }, { mood: 'sleep', night: true, glowOn: true });
  sakura(o, { cx: 520, cy: 478, s: 40, rot: -80 }, 'stand', { mood: 'sleepy', lite: true });
  o.push(...cloud(610, 735, 600, 120, 19, { top: '#7C5CC8', bottom: '#4B3AA0', shade: '#2A1F75', opacity: .95 }));
  o.push(body(70, 250, 420, ['Up high, the night was quiet.', 'Even the stars', 'sang softly.'], 30, '#E6DEFF', { lh: 1.6, label: 'Story text' }));
  o.push(...note(330, 440, 20, '#CFF3FF'), ...note(260, 400, 15, '#FFD3E3'));
  return o;
}

// ── page 6 · reaction panels ────────────────────────────────────────────────
function reactions(): O[] {
  const o: O[] = [rect(0, 0, W, H, PAPER, { label: 'Page ground', role: 'GROUND' })];
  const L1: Pt[] = [[30, 30], [470, 30], [446, 270], [30, 270]], L2: Pt[] = [[30, 296], [236, 296], [236, 520], [30, 520]], L3: Pt[] = [[262, 296], [450, 296], [430, 520], [262, 520]], L4: Pt[] = [[30, 546], [440, 546], [440, 738], [30, 738]];
  const R1: Pt[] = [[512, 30], [930, 30], [930, 330], [534, 330]], R2: Pt[] = [[556, 356], [740, 356], [722, 560], [540, 560]], R3: Pt[] = [[766, 356], [930, 356], [930, 560], [748, 560]], R4: Pt[] = [[496, 586], [930, 586], [930, 738], [496, 738]];
  const fills: Array<[Pt[], string[]]> = [[L1, ['#CFF3FF', '#7FD8FF']], [L2, ['#FFE3EE', '#FFB3D1']], [L3, ['#FFF3C4', '#FFE0B8']], [L4, ['#E6DEFF', '#B9A6FF']], [R1, ['#B9C4FF', '#8E9CFF']], [R2, ['#FFF3C4', '#FFC58F']], [R3, ['#CFF3FF', '#B9A6FF']], [R4, ['#FFE3EE', '#FFD3E3']]];
  const fillP = (i: number) => { const [p, c] = fills[i]; o.push(poly(p, c[0], { gradient: lin(90, c[0], c[1]), label: `Panel ${i + 1}` })); };
  // screentone in a few panels
  // L1 worry
  fillP(0); o.push(...halftone(30, 30, 440, 240, 16, '#FFFFFF', { grade: 'x', max: 6, min: 1, opacity: .6 }));
  sakuraHead(o, { cx: 170, cy: 160, s: 78 }, { mood: 'worry', lite: true }); o.push(...sweatDrop(262, 98, 20), ...titleLine(366, 184, 'Gulp!', 46, AP.white, { rotation: -6, label: 'Sound words' }));
  // L2 shy
  fillP(1);
  sakuraHead(o, { cx: 133, cy: 428, s: 58 }, { mood: 'shy', lite: true, blush: 2 }); o.push(blushHatch(80, 460, 36));
  // L3 happy + hearts
  fillP(2);
  sakuraHead(o, { cx: 352, cy: 420, s: 60 }, { mood: 'happy', lite: true }); o.push(...hearts([[286, 340, 16, -.3], [420, 344, 20, .3], [400, 470, 12]]));
  // L4 fierce
  fillP(3); o.push(...halftone(30, 546, 410, 192, 14, '#8570E6', { grade: 'y', flip: true, max: 5, min: 1, opacity: .5 }));
  sakuraHead(o, { cx: 140, cy: 654, s: 62 }, { mood: 'fierce', lite: true }); o.push(veinMark(220, 590, 24), ...titleLine(318, 612, 'Hmph!', 52, AP.hot, { rotation: 4, label: 'Sound words' }));
  // R1 giant whale eye
  fillP(4);
  const d = drawer({ cx: 760, cy: 150, s: 330 }, o);
  d.ell(0, 0, .9, .52, '#B9C4FF', { ow: .014 }); d.ell(0, 0, .5, .36, AP.white, { ow: .012 }); d.ell(0, .02, .3, .34, '#4B3FD0', { gradient: lin(90, '#2A1F75', '#5946E0', '#6FE6FF') }); d.ell(0, .04, .14, .2, '#140F3A'); d.ell(-.1, -.1, .1, .12, AP.white); d.circ(.12, .12, .05, AP.white); d.taper([[-.5, .0], [-.2, -.32], [.25, -.38], [.52, -.1]], .02, .07, .05, AP.ink);
  o.push(...sparkles(560, 50, 360, 260, 7, 71, [AP.white, AP.gold], 7, 16, [[640, 90, 240, 130]]));
  // R2 wow, R3 sleepy
  fillP(5); fillP(6); fillP(7); o.push(...halftone(496, 586, 434, 152, 16, '#FF8FB8', { grade: 'y', max: 6, min: 1, opacity: .45 }));
  sakuraHead(o, { cx: 648, cy: 466, s: 56 }, { mood: 'wow', lite: true }); o.push(...exclaim(712, 392, 18));
  sakuraHead(o, { cx: 842, cy: 470, s: 52 }, { mood: 'sleepy', lite: true }); o.push(...titleLine(842, 372, 'zzz', 40, AP.white, { rotation: -8, label: 'Sound words' }), ...sparkles(770, 360, 150, 190, 5, 72, [AP.white, AP.gold], 5, 11));
  o.push(...maskPanels([L1, L2, L3, L4, R1, R2, R3, R4]));
  o.push(...caption(562, 602, ['Sakura giggled, gulped, blushed,', 'huffed... and then waved hello!'], 24, { w: 400 }));
  o.push(...caption(540, 40, ['Kumo smiled.'], 26, { w: 190 }));
  return o;
}

// ── page 7 · flight panorama ────────────────────────────────────────────────
function flight(): O[] {
  const o: O[] = [sky(W, H, '#5B4BC8', '#B58CF0', '#FF9EC4', '#FFD0A0')];
  o.push(glow(140, 560, 330, '#FFF3C4', .95), circle(140, 560, 78, '#FFF1B8', { gradient: lin(90, '#FFF8D8', '#FFE08A'), label: 'Setting sun' }));
  o.push(...sparkles(0, 0, W, 300, 26, 81, ['#FFFFFF', AP.gold], 3, 9), ...bokeh(0, 100, W, 500, 8, 82, ['#FFFFFF', '#FFD3E3'], 16, 40, .35));
  o.push(...cloud(780, 150, 300, 80, 20, { top: '#FFE3F0', bottom: '#E6B6F0', shade: '#C77FE6', opacity: .9 }), ...cloud(300, 250, 260, 70, 21, { top: '#FFE3F0', bottom: '#E6B6F0', shade: '#C77FE6', opacity: .9 }));
  o.push(hill(0, W, 640, 60, 25, 768, '#8A6BD8'), hill(0, W, 690, 40, 26, 768, '#6A4BB8'));
  townRow(o, 20, 940, 740, 27, .6, ['#4A3A9A', '#5B4BAE', '#7A5CC8']);
  // petal river trailing from Kumo's tail
  const r = rng(9); const pa: Pt[][] = [], pb: Pt[][] = [];
  for (let i = 0; i < 46; i++) { const t = i / 46; const x = 560 - t * 560, y = 410 + Math.sin(t * 9) * 40 + (r() - .5) * 90 + t * 30; (i % 2 ? pa : pb).push(petalPts(x, y, 7 + r() * 8, r() * 6.28, .6)); }
  o.push(multiPoly(pa, AP.sakura, { label: 'Petal river' }), multiPoly(pb, AP.sakuraL, { label: 'Petal river' }));
  whale(o, { cx: 540, cy: 400, s: 250, rot: -6 }, { mood: 'smile', tailBend: 1 });
  sakura(o, { cx: 652, cy: 204, s: 36, rot: -4 }, 'cheer', { mood: 'happy', swing: -.9, tailLift: .3, lite: true });
  birds(o, [[820, 300, 14], [860, 270, 11], [900, 310, 12], [790, 250, 9]], '#4A3A9A');
  o.push(...cloud(310, 640, 560, 170, 22, { top: '#FFFFFF', bottom: '#FFE3F0' }));
  o.push(body(110, 588, 400, ['Higher and higher they flew,', 'over the town and the sea.'], 25, AP.indigo, { align: 'center', lh: 1.4, label: 'Story text' }));
  o.push(...sparkles(0, 300, W, 400, 14, 83, [AP.white, AP.gold], 6, 16));
  return o;
}

// ── page 8 · activity: match the feeling ────────────────────────────────────
function activity(): O[] {
  const o: O[] = [sky(W, H, '#FFF7FB', '#FFE9F2')];
  o.push(...halftone(0, 0, W, 130, 18, '#FFD3E3', { grade: 'y', flip: true, max: 7, min: 1, opacity: .8 }), ...halftone(0, 640, W, 128, 18, '#CFF3FF', { grade: 'y', max: 7, min: 1, opacity: .8 }));
  o.push(...titleLine(480, 16, 'Feelings Match!', 66, AP.sakura, { outer: AP.indigo, inner: AP.white, ow: 8, label: 'Title' }));
  const cards: Array<[number, number, Mood, string]> = [[30, 130, 'worry', '#CFF3FF'], [236, 130, 'happy', '#FFE3EE'], [30, 340, 'fierce', '#E6DEFF'], [236, 340, 'wow', '#FFF3C4']];
  cards.forEach(([x, y, m, c], i) => {
    o.push(rect(x, y, 190, 190, c, { rx: 22, stroke: AP.indigo, strokeWidth: 4, shadow: SHD, label: 'Face card' }));
    sakuraHead(o, { cx: x + 95, cy: y + 104, s: 44 }, { mood: m, lite: true });
    if (m === 'worry') o.push(...sweatDrop(x + 160, y + 40, 15));
    if (m === 'happy') o.push(...hearts([[x + 30, y + 36, 12], [x + 164, y + 40, 15, .3]]));
    if (m === 'fierce') o.push(veinMark(x + 160, y + 36, 18));
    if (m === 'wow') o.push(...exclaim(x + 162, y + 38, 14));
    o.push(circle(x + 20, y + 172, 12, AP.white, { stroke: AP.indigo, strokeWidth: 3, label: 'Number dot' }), body(x + 10, y + 158, 20, [String(i + 1)], 20, AP.indigo, { align: 'center', lh: 1.1, label: 'Number' }));
  });
  const words: Array<[number, string, string]> = [[160, 'A. IN LOVE', AP.sakuraL], [250, 'B. GRUMPY', '#E6DEFF'], [340, 'C. AMAZED', '#FFF3C4'], [430, 'D. NERVOUS', '#CFF3FF']];
  words.forEach(([y, t, c]) => { o.push(rect(600, y, 330, 66, c, { rx: 33, stroke: AP.indigo, strokeWidth: 4, shadow: SHD, label: 'Word chip' }), circle(572, y + 33, 14, 'none', { stroke: AP.indigo, strokeWidth: 3, dash: [3, 6], label: 'Answer dot' }), body(630, y + 14, 290, [t], 30, AP.indigo, { lh: 1.2, label: 'Word' })); });
  for (const y of [190, 280, 370, 460]) o.push(poly([[452, y], [560, y]], 'none', { open: true, stroke: AP.lavD, strokeWidth: 3, dash: [4, 9], label: 'Match line' }));
  o.push(...caption(40, 570, ['Match each face to its feeling.', 'Draw a line from 1, 2, 3, 4.'], 24, { w: 430 }));
  o.push(...cloud(740, 690, 330, 90, 31, { bottom: '#E6F6FF' }));
  whale(o, { cx: 730, cy: 640, s: 100, rot: -4 }, { mood: 'smile' });
  o.push(body(560, 560, 380, ['Count Kumo’s gold stars!', '__ __ __'], 24, AP.indigo, { align: 'center', lh: 1.3, label: 'Count prompt' }));
  return o;
}

// ── page 9 · back cover ─────────────────────────────────────────────────────
function backCover(): O[] {
  const o: O[] = [sky(W, H, '#7C6BEA', '#C7A4FF', '#FFB5D2', '#FFE0C0')];
  o.push(glow(740, 250, 420, '#FFF3C4', .9), ...bokeh(0, 0, W, 768, 9, 91, ['#FFFFFF', '#FFD3E3', '#CFF3FF'], 14, 44, .45));
  o.push(...sparkles(0, 0, W, 520, 24, 92, [AP.white, AP.gold], 5, 14), ...petals(0, 0, W, 768, 26, 93, [AP.sakura, AP.sakuraL, AP.white], 8, 18, [[40, 90, 520, 380]]));
  whale(o, { cx: 770, cy: 250, s: 110, rot: -10 }, { mood: 'smile' });
  o.push(...cloud(210, 740, 520, 130, 94, { bottom: '#FFE3F0' }), ...cloud(800, 730, 420, 120, 95, { bottom: '#FFE3F0' }));
  sakura(o, { cx: 780, cy: 560, s: 74, rot: 3 }, 'wave', { mood: 'happy', lite: true, swing: -.2 });
  o.push(...title(300, 32, 'The End', 88, { colors: [AP.sakura, AP.sakuraL, AP.sky, AP.peach, AP.sakura, AP.sakuraL], outer: AP.indigo, inner: AP.white, shadow: '#5B3FB0', bounce: 6, rot: 3, seed: 7, ow: 9, label: 'Title' }));
  o.push(...caption(52, 170, ['Sakura heard a song from the sky.', 'Follow her and Kumo, the kindest', 'whale of all, on one big, bright,', 'petal-pink adventure!'], 25, { w: 500 }));
  o.push(rect(52, 560, 200, 110, AP.white, { rx: 12, stroke: AP.indigo, strokeWidth: 3, label: 'Barcode plate' }));
  const bars: Pt[][] = []; const r = rng(4); let bx = 68; for (let i = 0; i < 22 && bx < 236; i++) { const bw = 2 + Math.floor(r() * 4); bars.push([[bx, 574], [bx + bw, 574], [bx + bw, 640], [bx, 640]]); bx += bw + 2 + Math.floor(r() * 3); }
  o.push(multiPoly(bars, AP.indigo, { label: 'Barcode' }), body(52, 644, 200, ['PLAJAH TELA - AGES 4-8'], 11, AP.indigo, { align: 'center', lh: 1.2, label: 'Imprint' }));
  return o;
}

const PAGES: Array<() => O[]> = [cover, diagonal, eyesStrip, action, reveal, quiet, reactions, flight, activity, backCover];
const anime: PublicationDesigner = (ctx: PublicationCtx) => PAGES[Math.min(ctx.pageIndex, PAGES.length - 1)]();

export const DESIGNS: Record<string, PublicationDesigner> = { 'story-anime': anime };
export const LESSONS: Record<string, DesignLesson> = {
  'story-anime': {
    principle: 'Anime-style art is a system of clean line and two-tone light: every colour is a base, a hard-edged shadow and a highlight band, the eyes carry the feeling with layered glossy highlights, and speed lines, bursts and tiny emotion marks tell you what the character feels before a word is read.',
    history: 'Japanese manga grew from woodblock print, kamishibai paper theatre and twentieth-century comics, and learned to show motion and emotion with a small visual vocabulary: speed lines, impact bursts, sweat drops, blush hatching and huge expressive eyes. Children’s picture books in Japan and around the world borrow the same toolkit because a child can read a face and a feeling at a glance.',
    tryThis: 'Select Sakura’s eye and look at the layers: sclera, iris gradient, pupil, top shade, two highlights and a rim light. Delete the highlights and see how the character goes dull; then move the shadow band on her hair to the other side and watch the light source flip.',
    interestTag: 'Picture books',
    related: ['Manga', 'Cel animation', 'Kamishibai'],
  },
};
export type { TelaVectorObject };
