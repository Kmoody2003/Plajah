// storyDoodle — "Doodle Day" (story-doodle): an ACTIVITY / COLOURING BOOK for all ages.
// Format: portrait US letter (816x1056). Medium: PURE BLACK LINE ART on white — no filled
// backgrounds, uniform and varied line weights, big empty areas to colour. Every puzzle is
// generated (seeded) so it is real: the mazes are solvable, dots trace a real outline, the
// word search contains its words. Solutions are never drawn on the page.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import { rect, text, circle, line } from '../../templateKit';
import type { Pt } from './kidsArtC';
import { INK, DW, ink, loop, open, circPts, arcP, smooth, xf, icon, ring, dotInk, roundBox, doodleTitle, steps, folio, tag, type Sub } from './doodleKit';
import { makeMaze, mazeSegments, dotOutline, starOutline, rocketOutline, makeWordSearch, scramble, makeFindPlan, FIND_TARGETS, type Maze } from './doodleGen';
import { gardenScene, octopusScene, mandala, butterflyHalf, robotHalf, BUTTERFLY_GUIDES, ROBOT_GUIDES, catFace, pencil } from './doodleScenes';

type O = TelaVectorObject;
const ground = (): O => rect(0, 0, DW, 1056, '#FFFFFF', { role: 'GROUND', label: 'White paper' });
const F = (s: string, x: number, y: number, w: number, size: number, o: { weight?: number; align?: 'left' | 'center' | 'right'; wrap?: boolean; label?: string; role?: O['templateRole']; tracking?: number } = {}): O =>
  text(x, y, w, s, { size, font: 'fredoka', weight: o.weight ?? 500, color: INK, align: o.align, wrap: o.wrap ?? true, tracking: o.tracking, leading: 1.25, label: o.label || 'Copy', role: o.role || 'BODY' });

/** Standard activity header: wobbly outline title, numbered steps, a tag, returns where content may start. */
function header(title: string, list: string[], tagText?: string, maxW = 700): { objs: O[]; bottom: number } {
  const objs: O[] = [];
  objs.push(...doodleTitle(title, 48, 40, 62, { maxW }).objs);
  const st = steps(48, 124, tagText ? 560 : 700, list, 20);
  objs.push(...st.objs);
  if (tagText) objs.push(...tag(DW - 48 - 170, 128, tagText));
  return { objs, bottom: st.bottom };
}

// ── maze page ─────────────────────────────────────────────────────────────────
export interface MazePageSpec { cols: number; rows: number; cell: number; seed: number; algo: 'dfs' | 'kruskal'; sw: number }
export const MAZE_EASY: MazePageSpec = { cols: 9, rows: 12, cell: 58, seed: 11, algo: 'dfs', sw: 7 };
export const MAZE_HARD: MazePageSpec = { cols: 15, rows: 19, cell: 37, seed: 29, algo: 'kruskal', sw: 4.5 };
export function mazeOrigin(s: MazePageSpec) { return { x0: Math.round((DW - s.cols * s.cell) / 2), y0: s.cell > 50 ? 262 : 272 }; }
export function buildMaze(s: MazePageSpec): Maze { return makeMaze(s.cols, s.rows, s.seed, s.algo); }
function mazePage(s: MazePageSpec, title: string, list: string[], tagText: string, n: number): O[] {
  const m = buildMaze(s); const { x0, y0 } = mazeOrigin(s); const out: O[] = [ground()];
  const hd = header(title, list, tagText); out.push(...hd.objs);
  const segs = mazeSegments(m, x0, y0, s.cell);
  out.push(ink(segs.map(([a, b]) => open([a, b])), s.sw, { label: 'Maze walls' }));
  // entrance (top-left) and exit (bottom-right) markers sit just outside the walls
  const sx = x0 + s.cell / 2, ex = x0 + (s.cols - 1) * s.cell + s.cell / 2, ey = y0 + s.rows * s.cell;
  out.push(ring(sx, y0 - 24, 15, 4, 'Start face'), dotInk(sx - 5, y0 - 28, 2.4), dotInk(sx + 5, y0 - 28, 2.4), ink([open(arcP(sx, y0 - 26, 7, 6, 20, 160, 6))], 2.5, { label: 'Start smile' }));
  out.push(F('START', sx + 24, y0 - 36, 120, 22, { weight: 700, wrap: false, role: 'LABEL', label: 'Start label' }));
  out.push(icon('star', ex, ey + 30, 20, 0, 4), F('FINISH', ex - 130, ey + 18, 100, 22, { weight: 700, align: 'right', wrap: false, role: 'LABEL', label: 'Finish label' }));
  out.push(folio(n));
  return out;
}

// ── dot-to-dot page ───────────────────────────────────────────────────────────
export interface DotPageSpec { shape: 'star' | 'rocket'; spacing: number; label: number; numSize: number; r: number }
export const DOT_STAR: DotPageSpec = { shape: 'star', spacing: 118, label: 34, numSize: 30, r: 9 };
export const DOT_ROCKET: DotPageSpec = { shape: 'rocket', spacing: 46, label: 26, numSize: 19, r: 5.5 };
export function dotsFor(s: DotPageSpec) {
  const outline = s.shape === 'star' ? starOutline(408, 660, 318, .44) : rocketOutline(408, 626, 1.12);
  return dotOutline(outline, s.spacing, s.label);
}
function dotPage(s: DotPageSpec, title: string, list: string[], tagText: string, n: number): O[] {
  const out: O[] = [ground()]; const hd = header(title, list, tagText); out.push(...hd.objs);
  const d = dotsFor(s);
  d.forEach(p => {
    out.push(circle(p.x, p.y, s.r, INK, { label: `Dot ${p.n}` }));
    out.push(F(String(p.n), p.lx - 24, p.ly - s.numSize * .66, 48, s.numSize, { weight: 700, align: 'center', wrap: false, label: `Dot number ${p.n}`, role: 'LABEL' }));
  });
  if (s.shape === 'star') {
    out.push(icon('cloud', 128, 330, 70, 0, 6), icon('cloud', 700, 370, 56, 0, 6), icon('moon', 700, 884, 46, 20, 6), icon('star', 112, 920, 28, 12, 5), icon('star', 150, 810, 20, -8, 5), icon('star', 650, 330, 20, 14, 5));
    out.push(F('What shines in the night sky?', 48, 968, 500, 22, { weight: 600, label: 'Question', role: 'DECK' }));
  } else {
    out.push(icon('star', 96, 410, 26, 12, 4), icon('star', 726, 330, 22, -10, 4), icon('star', 700, 760, 30, 8, 4), icon('moon', 116, 700, 38, -12, 4), icon('star', 90, 880, 20, 0, 4));
    out.push(ring(408, 556, 46, 3, 'Rocket window'), ring(408, 556, 30, 3, 'Rocket window'));
    out.push(F('Join 1 to 2 to 3, all the way round, then finish at 1.', 48, 982, 700, 20, { weight: 600, label: 'Hint', role: 'DECK' }));
  }
  out.push(folio(n));
  return out;
}

// ── find-and-circle ───────────────────────────────────────────────────────────
export const FIND_BOX = { x: 52, y: 238, w: 712, h: 590 };
export const FIND_SEED = 41;
function findPage(n: number): O[] {
  const out: O[] = [ground()]; const hd = header('FIND AND CIRCLE!', ['Look closely at the picture.', 'Circle every item on your list.', 'Write how many you found in each box.'], 'Little eyes'); out.push(...hd.objs);
  const plan = makeFindPlan(FIND_SEED, FIND_BOX);
  out.push(roundBox(FIND_BOX.x - 12, FIND_BOX.y - 12, FIND_BOX.w + 24, FIND_BOX.h + 24, 24, 6, { label: 'Picture frame' }));
  plan.items.forEach(it => out.push(icon(it.kind, it.x, it.y, it.r * .94, it.rot, 4)));
  // checklist
  const y0 = 862; out.push(F('MY LIST', 48, y0 - 6, 160, 22, { weight: 700, wrap: false, tracking: .1, label: 'List heading', role: 'LABEL' }));
  FIND_TARGETS.forEach((t, i) => {
    const col = i % 3, row = Math.floor(i / 3); const x = 48 + col * 240, y = y0 + 34 + row * 70;
    out.push(icon(t.kind, x + 22, y + 22, 24, 0, 3.5), F(`${t.count} ${t.label}`, x + 56, y + 8, 120, 22, { weight: 600, wrap: false, label: 'List item', role: 'LABEL' }), roundBox(x + 168, y, 44, 44, 10, 3.5, { label: 'Answer box' }));
  });
  out.push(F('Total found:', 560, y0 + 112, 130, 22, { weight: 700, wrap: false, label: 'Total label', role: 'LABEL' }), roundBox(700, y0 + 102, 62, 44, 10, 3.5, { label: 'Total box' }));
  out.push(folio(n));
  return out;
}

// ── draw the other half ───────────────────────────────────────────────────────
function mirrorPanel(y: number, h: number, half: Sub[], guides: Pt[], cy: number, label: string, scale: number, sw: number): O[] {
  const out: O[] = []; const ax = 408;
  out.push(roundBox(56, y, 704, h, 26, 5, { label: 'Panel frame' }));
  out.push(line(ax, y + 14, ax, y + h - 14, INK, 4, { dash: [14, 10], label: 'Mirror line', role: 'RULE' }));
  out.push(F(label, ax + 16, y + 14, 150, 16, { weight: 700, wrap: false, tracking: .06, label: 'Mirror line label', role: 'LABEL' }));
  out.push(ink(xf(half, ax, cy, scale), sw, { label: 'Half picture' }));
  guides.forEach(([gx, gy]) => out.push(ring(ax - gx * scale, cy + gy * scale, 7, 3, 'Guide dot')));
  return out;
}
function mirrorPage(n: number): O[] {
  const out: O[] = [ground()]; const hd = header('DRAW THE OTHER HALF!', ['Look at the half picture on the left.', 'Use the little rings to find where lines go.', 'Draw the matching half so both sides are the same.'], 'Big kids', 700); out.push(...hd.objs);
  out.push(...mirrorPanel(244, 392, butterflyHalf(), BUTTERFLY_GUIDES, 466, 'mirror line', .96, 6));
  out.push(...mirrorPanel(656, 356, robotHalf(), ROBOT_GUIDES, 846, 'mirror line', .7, 6));
  out.push(folio(n));
  return out;
}

// ── trace the path + pattern completion ───────────────────────────────────────
function patternShape(kind: string, cx: number, cy: number): O {
  const s = 30;
  if (kind === 'circle') return ring(cx, cy, s, 5, 'Pattern circle');
  if (kind === 'square') return roundBox(cx - s, cy - s, s * 2, s * 2, 6, 5, { label: 'Pattern square' });
  if (kind === 'triangle') return ink([loop([[cx, cy - s - 2], [cx + s + 4, cy + s - 4], [cx - s - 4, cy + s - 4]])], 5, { label: 'Pattern triangle' });
  return icon(kind, cx, cy, s + 2, 0, 5);
}
function tracePage(n: number): O[] {
  const out: O[] = [ground()]; const hd = header('TRACE THE PATH!', ['Trace each dotted path with your pencil.', 'Then work out what comes next in each pattern.'], 'Little hands'); out.push(...hd.objs);
  out.push(F('FOLLOW THE PATH', 48, 218, 400, 22, { weight: 700, wrap: false, tracking: .1, label: 'Section', role: 'LABEL' }));
  const rows = [
    { y: 300, from: 'bee', to: 'flower', pts: Array.from({ length: 40 }, (_, i) => [150 + i / 39 * 520, 300 + Math.sin(i / 39 * Math.PI * 4) * 38] as Pt) },
    { y: 440, from: 'fish', to: 'star', pts: [[150, 470], [210, 410], [280, 470], [350, 410], [420, 470], [490, 410], [560, 470], [630, 410], [670, 440]] as Pt[] },
    { y: 580, from: 'rocket', to: 'moon', pts: smooth([[150, 600], [250, 560], [330, 600], [380, 660], [330, 690], [290, 640], [350, 590], [470, 560], [560, 600], [670, 570]], false, 10) },
  ];
  rows.forEach(r => {
    out.push(icon(r.from, 100, r.pts[0][1], 40, 0, 5), icon(r.to, 716, r.pts[r.pts.length - 1][1], 40, 0, 5));
    out.push(ink([open(r.pts)], 7, { dash: [1, 16], label: 'Dotted path to trace' }));
  });
  out.push(F('WHAT COMES NEXT?', 48, 698, 400, 22, { weight: 700, wrap: false, tracking: .1, label: 'Section', role: 'LABEL' }));
  const pats = [['circle', 'square', 'circle', 'square', 'circle'], ['star', 'star', 'heart', 'star', 'star'], ['triangle', 'circle', 'square', 'triangle', 'circle']];
  pats.forEach((p, ri) => {
    const y = 782 + ri * 90;
    p.forEach((k, i) => { const x = 110 + i * 112; out.push(roundBox(x - 44, y - 40, 88, 80, 16, 3, { label: 'Pattern box' }), patternShape(k, x, y)); });
    out.push(roundBox(110 + 5 * 112 - 44, y - 40, 88, 80, 16, 3.5, { dash: [10, 8], label: 'Draw it here' }), F('?', 110 + 5 * 112 - 44, y - 24, 88, 44, { weight: 700, align: 'center', wrap: false, label: 'Question mark', role: 'HEADLINE' }));
  });
  out.push(folio(n));
  return out;
}

// ── word play ─────────────────────────────────────────────────────────────────
export const WS_WORDS = ['SUN', 'MOON', 'STAR', 'FISH', 'TREE', 'BIRD', 'FROG', 'CAKE'];
export const WS_SEED = 17;
export const SCRAMBLES: Array<{ word: string; clue: string }> = [{ word: 'CLOUD', clue: 'It floats in the sky' }, { word: 'HOUSE', clue: 'Where you live' }, { word: 'KITE', clue: 'It flies on a string' }, { word: 'BOAT', clue: 'It sails on the water' }];
export const WS_GEOM = { x0: 48, y0: 248, cell: 50 };
function wordPage(n: number): O[] {
  const out: O[] = [ground()]; const hd = header('WORD PLAY!', ['Find every word in the grid. Words go across, down or diagonally down.', 'Draw a loop round each word you find, then tick it off the list.'], 'Big kids'); out.push(...hd.objs);
  const ws = makeWordSearch(WS_WORDS, 10, WS_SEED); const { x0, y0, cell } = WS_GEOM;
  out.push(roundBox(x0, y0, cell * 10, cell * 10, 10, 5, { label: 'Word grid frame' }));
  const gl: Sub[] = []; for (let i = 1; i < 10; i++) { gl.push(open([[x0 + i * cell, y0], [x0 + i * cell, y0 + cell * 10]]), open([[x0, y0 + i * cell], [x0 + cell * 10, y0 + i * cell]])); }
  out.push(ink(gl, 1.8, { label: 'Grid lines' }));
  ws.grid.forEach((row, r) => row.forEach((ch, c) => out.push(F(ch, x0 + c * cell, y0 + r * cell + cell / 2 - 18, cell, 28, { weight: 600, align: 'center', wrap: false, label: 'Grid letter', role: 'LABEL' }))));
  // word list with tick boxes
  out.push(F('FIND THESE', 590, 248, 180, 20, { weight: 700, wrap: false, tracking: .1, label: 'List heading', role: 'LABEL' }));
  WS_WORDS.forEach((w, i) => out.push(roundBox(590, 286 + i * 52, 28, 28, 6, 3, { label: 'Tick box' }), F(w, 632, 284 + i * 52, 140, 26, { weight: 600, wrap: false, label: 'Search word', role: 'LABEL' })));
  // scramble
  out.push(F('UNSCRAMBLE THE WORDS', 48, 776, 500, 22, { weight: 700, wrap: false, tracking: .1, label: 'Section', role: 'LABEL' }));
  SCRAMBLES.forEach((s, i) => {
    const col = i % 2, row = Math.floor(i / 2); const x = 48 + col * 372, y = 818 + row * 98;
    out.push(F(scramble(s.word, 90 + i * 7), x, y, 190, 32, { weight: 700, wrap: false, tracking: .18, label: 'Scrambled word', role: 'LABEL' }), F(s.clue, x, y + 38, 330, 18, { weight: 500, wrap: false, label: 'Clue', role: 'CAPTION' }));
    out.push(...Array.from({ length: s.word.length }, (_, k) => line(x + 196 + k * 28, y + 30, x + 196 + k * 28 + 22, y + 30, INK, 3.5, { label: 'Answer line' })));
  });
  out.push(folio(n));
  return out;
}

// ── design your own ───────────────────────────────────────────────────────────
function designPage(n: number): O[] {
  const out: O[] = [ground()]; const hd = header('DESIGN A MONSTER!', ['Start with a shape from the row, or any shape you like.', 'Add eyes, arms, legs, spikes and a funny mouth.', 'Give your monster a name and a superpower.'], 'Everyone'); out.push(...hd.objs);
  const shapes = ['ring', 'triangle', 'diamond', 'star', 'heart', 'zigzag']; out.push(F('SHAPES TO START WITH', 48, 262, 400, 20, { weight: 700, wrap: false, tracking: .1, label: 'Section', role: 'LABEL' }));
  shapes.forEach((k, i) => out.push(icon(k, 100 + i * 124, 340, 36, 0, 5)));
  out.push(roundBox(48, 398, 720, 490, 38, 8, { label: 'Design frame' }), roundBox(62, 412, 692, 462, 28, 4, { dash: [1, 14], label: 'Inner dotted frame' }));
  [[96, 446], [720, 446], [96, 842], [720, 842]].forEach(([x, y]) => out.push(icon('star', x, y, 24, 10, 4)));
  out.push(F('Your monster lives here!', 48, 842, 720, 20, { weight: 600, align: 'center', wrap: false, label: 'Frame caption', role: 'CAPTION' }));
  out.push(F('My monster is called', 48, 920, 260, 22, { weight: 600, wrap: false, label: 'Name label', role: 'LABEL' }), line(316, 944, 768, 944, INK, 3.5, { label: 'Name line' }));
  out.push(F('Its superpower is', 48, 978, 260, 22, { weight: 600, wrap: false, label: 'Power label', role: 'LABEL' }), line(262, 1002, 768, 1002, INK, 3.5, { label: 'Power line' }));
  out.push(folio(n));
  return out;
}

// ── certificate ───────────────────────────────────────────────────────────────
function certificate(n: number): O[] {
  const out: O[] = [ground()];
  out.push(roundBox(36, 36, 744, 984, 40, 10, { label: 'Certificate border' }), roundBox(62, 62, 692, 932, 28, 3, { label: 'Inner border' }));
  [[104, 104, 0], [712, 104, 90], [712, 952, 180], [104, 952, 270]].forEach(([x, y, rot]) => out.push(icon('spiral', x, y, 34, rot, 4.5)));
  out.push(...doodleTitle('CERTIFICATE', 408, 124, 86, { align: 'center', maxW: 640, seed: 8 }).objs);
  out.push(F('OF AWESOME DOODLING', 108, 240, 600, 32, { weight: 700, align: 'center', wrap: false, tracking: .12, label: 'Subtitle', role: 'DECK' }));
  out.push(icon('star', 200, 350, 22, -12, 4), icon('star', 616, 350, 22, 12, 4), icon('star', 408, 332, 30, 0, 4.5));
  out.push(F('This certificate is proudly given to', 108, 396, 600, 26, { weight: 500, align: 'center', wrap: false, label: 'Presented to', role: 'BODY' }), line(158, 500, 658, 500, INK, 4, { label: 'Name line' }));
  out.push(F('for finishing Doodle Day with colours, courage and a very steady pencil.', 128, 526, 560, 26, { weight: 500, align: 'center', label: 'Citation', role: 'BODY' }));
  const cx = 408, cy = 768; const sc: Sub[] = []; const R = 112;
  for (let i = 0; i < 18; i++) { const a0 = i / 18 * Math.PI * 2, a1 = (i + 1) / 18 * Math.PI * 2, am = (a0 + a1) / 2; const rad = R * Math.sin(Math.PI / 18); sc.push(open(arcP(cx + R * Math.cos(am), cy + R * Math.sin(am), rad, rad, am * 180 / Math.PI - 90, am * 180 / Math.PI + 90, 8))); }
  out.push(ink([loop([[cx - 52, cy + 92], [cx - 92, cy + 184], [cx - 52, cy + 160], [cx - 26, cy + 192], [cx - 6, cy + 104]]), loop([[cx + 52, cy + 92], [cx + 92, cy + 184], [cx + 52, cy + 160], [cx + 26, cy + 192], [cx + 6, cy + 104]])], 6, { label: 'Rosette ribbons' }));
  out.push(ink(sc, 6, { label: 'Rosette scallops', fill: true }), ring(cx, cy, 92, 5, 'Rosette ring'), ring(cx, cy, 76, 3, 'Rosette ring'), icon('star', cx, cy + 2, 52, 0, 6));
  out.push(line(120, 904, 290, 904, INK, 3.5, { label: 'Signature line' }), F('signed', 120, 910, 170, 18, { weight: 500, align: 'center', wrap: false, label: 'Signed', role: 'CAPTION' }), line(526, 904, 696, 904, INK, 3.5, { label: 'Date line' }), F('date', 526, 910, 170, 18, { weight: 500, align: 'center', wrap: false, label: 'Date', role: 'CAPTION' }));
  void n;
  return out;
}

// ── cover, contents, back ─────────────────────────────────────────────────────
function cover(): O[] {
  const out: O[] = [ground()];
  out.push(...doodleTitle('DOODLE', 408, 54, 160, { align: 'center', maxW: 700, seed: 3 }).objs);
  out.push(...doodleTitle('DAY!', 408, 196, 270, { align: 'center', maxW: 640, seed: 9 }).objs);
  [[84, 112, 30, -12], [736, 138, 34, 14], [92, 452, 22, 10], [724, 468, 26, -8], [418, 508, 18, 0]].forEach(([x, y, s, r]) => out.push(icon('star', x, y, s, r, 5)));
  out.push(...catFace(250, 700, 1.05));
  out.push(...pencil(612, 702, -34));
  out.push(icon('flower', 606, 512, 44, 12, 6), icon('heart', 120, 868, 44, -10, 6), icon('fish', 470, 548, 42, -8, 5), icon('cloud', 690, 820, 60, 0, 6), icon('flower', 250, 884, 36, 20, 5), icon('moon', 580, 880, 34, 30, 5));
  out.push(roundBox(80, 916, 656, 74, 37, 6, { label: 'Tagline box' }), F('COLOUR  ·  MAZES  ·  DOTS  ·  DRAW', 80, 940, 656, 26, { weight: 700, align: 'center', wrap: false, tracking: .06, label: 'Tagline', role: 'DECK' }));
  out.push(F('ALL AGES  ·  PRINT AS MANY AS YOU LIKE', 80, 1010, 656, 18, { weight: 600, align: 'center', wrap: false, tracking: .08, label: 'Age line', role: 'LABEL' }));
  return out;
}
const TOC: Array<[number, string, string]> = [[3, 'Colour the garden', 'flower'], [4, 'Maze run', 'key'], [5, 'Dot-to-dot star', 'star'], [6, 'Find and circle', 'fish'], [7, 'Mandala magic', 'ring'], [8, 'Draw the other half', 'bee'], [9, 'Mega maze', 'diamond'], [10, 'Trace the path', 'rocket'], [11, 'Colour the octopus', 'heart'], [12, 'Rocket dot-to-dot', 'rocket'], [13, 'Word play', 'moon'], [14, 'Design a monster', 'triangle'], [15, 'Your certificate', 'leaf']];
function contents(): O[] {
  const out: O[] = [ground()]; out.push(...doodleTitle('WHAT’S INSIDE', 48, 40, 66, { maxW: 700 }).objs);
  const st = steps(48, 130, 720, ['Grab a pencil, crayons or markers.', 'Thick lines are friendly for little hands. Fine lines are for big kids.', 'Every maze and puzzle can be solved. Stuck? Breathe, then try again.'], 22, 10); out.push(...st.objs);
  const y0 = 360; out.push(F('PAGE BY PAGE', 48, y0 - 44, 300, 20, { weight: 700, wrap: false, tracking: .1, label: 'Section', role: 'LABEL' }));
  TOC.forEach(([pg, name, ic], i) => {
    const col = i < 7 ? 0 : 1, row = i < 7 ? i : i - 7; const x = 48 + col * 384, y = y0 + row * 88;
    out.push(ring(x + 28, y + 28, 26, 4, 'Page ring'), F(String(pg), x, y + 28 - 17, 56, 26, { weight: 700, align: 'center', wrap: false, label: 'Page number', role: 'LABEL' }), F(name, x + 70, y + 12, 250, 24, { weight: 600, wrap: false, label: 'Entry', role: 'BODY' }), icon(ic, x + 340, y + 28, 22, 0, 4));
    out.push(line(x + 70, y + 60, x + 360, y + 60, INK, 2, { dash: [2, 8], label: 'Leader' }));
  });
  out.push(F('Look for the tag at the top of each page: little hands, big kids or everyone.', 48, 1000, 720, 18, { weight: 500, label: 'Footnote', role: 'CAPTION' }));
  return out;
}
function backCover(): O[] {
  const out: O[] = [ground()];
  out.push(...doodleTitle('DOODLE DAY', 408, 96, 100, { align: 'center', maxW: 700, seed: 5 }).objs);
  out.push(F('A friendly activity and colouring book for every age: scenes to colour, mazes to solve, dots to join, pictures to finish and a certificate to earn.', 120, 250, 576, 26, { weight: 500, align: 'center', label: 'Blurb', role: 'BODY' }));
  ['flower', 'fish', 'star', 'heart', 'moon', 'key'].forEach((k, i) => out.push(icon(k, 160 + (i % 3) * 248, 520 + Math.floor(i / 3) * 170, 62, (i * 13) % 30 - 12, 6)));
  out.push(roundBox(120, 810, 576, 120, 28, 5, { label: 'Note box' }), F('Print as many copies as you like. It is black line art only, so it saves ink. Every maze has exactly one way through.', 148, 830, 520, 20, { weight: 500, align: 'center', label: 'Print note', role: 'BODY' }));
  out.push(F('ALL AGES  ·  PORTRAIT LETTER  ·  PLB-0012', 120, 984, 576, 18, { weight: 600, align: 'center', wrap: false, tracking: .08, label: 'Age line', role: 'LABEL' }));
  return out;
}

const doodle: PublicationDesigner = (ctx: PublicationCtx) => {
  const { pageIndex: i } = ctx; const n = i + 1;
  switch (i) {
    case 0: return cover();
    case 1: return contents();
    case 2: { const o = [ground(), ...header('COLOUR THE GARDEN!', ['Pick your favourite crayons.', 'Colour every shape, even the bugs!'], 'Little hands').objs, ...gardenScene(ctx.seed), folio(n)]; return o; }
    case 3: return mazePage(MAZE_EASY, 'MAZE RUN!', ['Put your pencil on START.', 'Find the way to FINISH without crossing a wall.', 'Dead end? Back up and try another way.'], 'Little hands', n);
    case 4: return dotPage(DOT_STAR, 'DOT-TO-DOT!', ['Start at number 1.', 'Join the dots in order with a ruler or a steady hand.', 'Finish by joining the last dot back to 1.'], 'Little hands', n);
    case 5: return findPage(n);
    case 6: return [ground(), ...header('MANDALA MAGIC', ['Colour from the middle out, one ring at a time.', 'Try two colours that sit next to each other, then two that clash.'], 'Big kids').objs, ...mandala(408, 648, 338, ctx.seed), folio(n)];
    case 7: return mirrorPage(n);
    case 8: return mazePage(MAZE_HARD, 'MEGA MAZE!', ['Start at the top left.', 'Find the one path to the bottom right.', 'Use a pencil, so you can rub out wrong turns.'], 'Big kids', n);
    case 9: return tracePage(n);
    case 10: return [ground(), ...header('OCTOPUS PARTY!', ['Give your octopus a colour for every arm.', 'Fill the sea with bubbles, fish and shells.'], 'Everyone').objs, ...octopusScene(ctx.seed + 5), folio(n)];
    case 11: return dotPage(DOT_ROCKET, 'ROCKET DOTS!', ['Start at number 1 at the nose.', 'Follow the numbers all the way round.', 'Colour your rocket when you are done.'], 'Big kids', n);
    case 12: return wordPage(n);
    case 13: return designPage(n);
    case 14: return certificate(n);
    default: return backCover();
  }
};

export const DESIGNS: Record<string, PublicationDesigner> = { 'story-doodle': doodle };
export const LESSONS: Record<string, DesignLesson> = {
  'story-doodle': {
    principle: 'An activity book works when every page is a clear job for a pencil: one instruction, a few numbered steps, and big empty space to act in. Pure black line on white keeps it printable at home, and thick lines for small hands sit beside fine lines for older kids.',
    history: 'Colouring and puzzle books grew from newspaper puzzle pages and the 1930s colouring books that let children finish the picture themselves. Mazes are among the oldest puzzles, and computer maze algorithms such as the recursive backtracker produce a “perfect” maze with exactly one route, which is why a generated maze is always solvable.',
    tryThis: 'Print the mazes and solve each from FINISH back to START: a perfect maze has exactly one route, so the way back is the same. Then change the page’s seed number and watch a new maze appear that is still solvable.',
    interestTag: 'Activity books',
    related: ['Colouring pages', 'Mazes and puzzles', 'Line art'],
  },
};
