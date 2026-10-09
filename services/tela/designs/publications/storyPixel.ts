// storyPixel: "Pixel Quest" (story-pixel). Ages 6-12, landscape 960x720 = a 120x90 grid of 8px cells.
//
// MEDIUM: PIXEL ART / 8-bit on a TRUE grid. Every picture is painted cell by cell into a 16-colour
// palette (pixelKit PG) and rendered as batched square runs, one path per colour. Dithering is Bayer
// ordered, sprites are 1-bit outlined, portraits use Scale2x, HUD panels have chunky notched borders.
// FORMAT: a game manual you can read: title screen, level-map spread, side-scroller panorama, RPG
// dialogue box, quiet save-point, dungeon maze, inventory grid, boss-fight scale shock, scoreboard +
// quest log, credits, game-box back. Faces: Sir Pix the knight, Byte the robot, slimes, the Glitch Dragon.
import type { TelaVectorObject } from '../../../../types';
import type { DesignLesson } from '../types';
import type { PublicationCtx, PublicationDesigner } from './types';
import { rect, text } from '../../templateKit';
import { PG, K, PAL, renderGrid, spr, scale2, rot90, KNIGHT, ROBOT, SLIME, HEART, COIN, stars, cloudPx, mountains, hillsPx, pine, roundTree, grass, brickWall, castle, block, bar, hud, flame, glowDither, moon, maze, dragon, fireBreath, rng, type O, type Pt } from './pixelKit';
import type { FontKey } from '../../telaFonts';

const W = 960, H = 720, CELL = 8, COLS = 120, ROWS = 90;
const knight = (): PG => KNIGHT().outline(K.ink);
const robot = (): PG => ROBOT().outline(K.ink);
const slime = (): PG => SLIME().outline(K.ink);
const hex = (c: number) => PAL[c];

/** Real-font text on the cell grid (x,y,w in cells). */
function T(x: number, y: number, w: number, lines: string[], size: number, color: number, o: { font?: FontKey; align?: 'left' | 'center' | 'right'; lh?: number; weight?: number; label?: string; role?: TelaVectorObject['templateRole'] } = {}): O {
  const lh = o.lh ?? 1.35;
  return text(x * CELL, y * CELL, w * CELL, lines.join('\n'), { size, font: o.font || 'pixelify', weight: o.weight ?? 600, color: hex(color), align: o.align || 'left', leading: lh, wrap: false, h: Math.ceil(lines.length * size * lh), label: o.label || 'Story text', role: o.role || 'BODY' });
}
/** A small caps label (Silkscreen). */
const LAB = (x: number, y: number, w: number, s: string, size: number, color: number, align: 'left' | 'center' | 'right' = 'left'): O => T(x, y, w, [s], size, color, { font: 'silkscreen', weight: 700, align, label: 'HUD label', role: 'LABEL' });
const page = (g: PG, bg: number, extra: O[] = []): O[] => [rect(0, 0, W, H, hex(bg), { label: 'Page ground', role: 'GROUND' }), ...renderGrid(g, CELL), ...extra];
const grid = () => new PG(COLS, ROWS);

/** A big pixel title: ink outline + hard shadow, drawn with the bitmap font (so it is real pixels). */
function bigTitle(g: PG, x: number, y: number, s: string, scale: number, face: number, shadow: number): void { g.text(x, y, s, face, { scale, outline: K.ink, shadow }); }
const star5 = (g: PG, sx: number, sy: number, c: number) => g.poly([[sx + 2, sy], [sx + 3, sy + 2], [sx + 5, sy + 2], [sx + 3.5, sy + 4], [sx + 4, sy + 6], [sx + 2, sy + 5], [sx, sy + 6], [sx + .5, sy + 4], [sx - 1, sy + 2], [sx + 1, sy + 2]], c);

// ── page 0 · title screen ───────────────────────────────────────────────────
function cover(): O[] {
  const g = grid(); g.vgrad(0, 0, COLS, 74, [K.indigo, K.peri, K.pink, K.orange, K.yellow]);
  stars(g, 3, 46, 0, 28); glowDither(g, 94, 60, 26, K.yellow); g.disc(94, 60, 12, K.yellow); g.dither(80, 60, 28, 14, K.yellow, K.orange, 6);
  cloudPx(g, 14, 38, 26, 8, 4, K.pink, K.peri, K.indigo); cloudPx(g, 60, 34, 22, 7, 5, K.pink, K.peri, K.indigo); cloudPx(g, 108, 50, 24, 7, 6, K.white, K.pink, K.peri);
  mountains(g, 72, 22, 9, K.plum, K.indigo, K.ice); mountains(g, 76, 14, 13, K.maroon, K.red, -1);
  hillsPx(g, 74, 6, 4, K.green, K.lime, 80);
  castle(g, 104, 76, K.peri, K.indigo, K.red, K.yellow, .62);
  for (const x of [56, 64, 72, 84]) pine(g, x, 76, 14 + (x % 3) * 2, K.green, K.lime);
  grass(g, 76, 14, 7);
  g.blit(scale2(knight()), 6, 44); g.blit(slime(), 54, 62); g.blit(robot(), 40, 60, true);
  for (let i = 0; i < 4; i++) g.blit(COIN().outline(K.ink), 46 + i * 9, 56 - Math.round(Math.sin(i * .9) * 4));
  for (let i = 0; i < 3; i++) g.blit(HEART(true).outline(K.ink), 92 + i * 9, 46);
  bigTitle(g, 6, 3, 'PIXEL', 3, K.yellow, K.red); bigTitle(g, 27, 25, 'QUEST', 3, K.lime, K.green);
  g.rect(0, 80, COLS, 10, K.ink); g.rect(0, 80, COLS, 1, K.white);
  return page(g, K.ink, [T(6, 82, 80, ['PRESS START'], 36, K.white, { font: 'pressStart', weight: 400, label: 'Press start', role: 'HEADLINE' }), T(84, 83.8, 34, ['AGES 6-12'], 15, K.cyan, { font: 'pressStart', weight: 400, align: 'right', label: 'Age', role: 'LABEL' })]);
}

// ── page 1 · LEVEL MAP spread ───────────────────────────────────────────────
function levelMap(): O[] {
  const g = grid(); g.rect(0, 0, COLS, ROWS, K.cyan); const r = rng(5);
  for (let i = 0; i < 330; i++) { const x = Math.floor(r() * 117), y = Math.floor(r() * 74); g.rect(x, y, 3, 1, K.ice); if (r() > .5) g.rect(x + 4, y + 1, 2, 1, K.ice); }
  g.dither(0, 0, COLS, 74, K.cyan, K.peri, 3);
  const nodes: Pt[] = [[14, 64], [36, 50], [60, 60], [82, 42], [100, 28]];
  const nz = (x: number, y: number) => .5 + .28 * Math.sin(x / 4 + Math.sin(y / 5) * 2) + .22 * Math.sin(y / 3.3 + x / 7);
  const seg = (px: number, py: number, a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); };
  const land = (x: number, y: number) => nodes.some(([nx, ny]) => Math.hypot(x - nx, (y - ny) * 1.2) < 8 + 8 * nz(x, y)) || nodes.some((n, i) => i && seg(x, y, nodes[i - 1], n) < 3 + 3 * nz(x, y));
  const L: boolean[][] = Array.from({ length: 74 }, (_, y) => Array.from({ length: COLS }, (_, x) => land(x, y)));
  const isL = (x: number, y: number) => y >= 0 && y < 74 && x >= 0 && x < COLS && L[y][x];
  for (let y = 0; y < 74; y++) for (let x = 0; x < COLS; x++) {
    if (L[y][x]) { const edge = !isL(x - 1, y) || !isL(x + 1, y) || !isL(x, y - 1) || !isL(x, y + 1); const v = nz(x * 1.3, y * 1.3); g.set(x, y, edge ? K.skin : v > .72 ? K.green : K.lime); if (!edge && v > .66 && v <= .72 && ((x + y) & 1)) g.set(x, y, K.green); }
    else { let d = 9; for (let k = 1; k <= 2 && d > k; k++) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) if (isL(x + dx, y + dy)) d = Math.min(d, k); if (d === 1) g.set(x, y, K.white); else if (d === 2) g.set(x, y, ((x + y) & 1) ? K.ice : K.cyan); }
  }
  for (let i = 0; i < 60; i++) { const x = 4 + Math.floor(r() * 112), y = 8 + Math.floor(r() * 62); if (!isL(x, y) || !isL(x - 3, y) || !isL(x + 3, y) || nodes.some(n => Math.hypot(n[0] - x, n[1] - y) < 9) || nodes.some((n, k) => k && seg(x, y, nodes[k - 1], n) < 6)) continue; g.poly([[x - 2, y], [x, y - 6], [x + 2, y]], K.green); g.poly([[x, y - 6], [x + 2, y], [x + 1, y]], K.plum); g.set(x, y + 1, K.brown); }
  for (const [mx, my, sc] of [[92, 56, 1], [100, 58, .8], [70, 32, .9], [76, 36, .7]] as Array<[number, number, number]>) { if (!isL(mx, my)) continue; g.poly([[mx - 8 * sc, my], [mx, my - 12 * sc], [mx + 8 * sc, my]], K.brown); g.poly([[mx, my - 12 * sc], [mx + 8 * sc, my], [mx + 2 * sc, my]], K.maroon); g.poly([[mx - 3 * sc, my - 8 * sc], [mx, my - 12 * sc], [mx + 3 * sc, my - 8 * sc], [mx, my - 6 * sc]], K.white); }
  nodes.forEach((n, i) => { if (!i) return; const a = nodes[i - 1]; const len = Math.hypot(n[0] - a[0], n[1] - a[1]); for (let d = 5; d < len - 5; d += 3.2) { const px = a[0] + (n[0] - a[0]) * d / len, py = a[1] + (n[1] - a[1]) * d / len; g.rect(Math.round(px) - 1, Math.round(py), 2, 2, K.ink); g.rect(Math.round(px) - 1, Math.round(py) - 1, 2, 2, i < 3 ? K.yellow : K.white); } });
  const cx = 100, cb = 20; g.rect(cx - 8, cb - 8, 16, 8, K.peri); g.rect(cx + 1, cb - 8, 7, 8, K.indigo); for (let i = 0; i < 4; i++) g.rect(cx - 8 + i * 5, cb - 10, 3, 2, K.peri); for (const sx of [-1, 1]) { g.rect(cx + sx * 8 - 2, cb - 14, 4, 14, K.peri); g.poly([[cx + sx * 8 - 3, cb - 14], [cx + sx * 8, cb - 19], [cx + sx * 8 + 3, cb - 14]], K.red); } g.rect(cx - 2, cb - 5, 4, 5, K.brown);
  g.outline(K.ink);
  nodes.forEach(([nx, ny], i) => { const done = i < 2, cur = i === 2; g.disc(nx, ny, 5.5, K.ink); g.disc(nx, ny, 4.5, cur ? K.red : done ? K.green : K.peri); g.rect(nx - 3, ny - 4, 3, 1, cur ? K.orange : done ? K.lime : K.ice); g.text(nx - 2, ny - 3, String(i + 1), K.white); });
  g.blit(knight(), 52, 40); g.rect(53, 57, 14, 1, K.ink);
  g.disc(12, 14, 7, K.ink); g.disc(12, 14, 6, K.skin); g.poly([[12, 8], [14, 14], [10, 14]], K.red); g.poly([[12, 20], [14, 14], [10, 14]], K.white); g.disc(12, 14, 1, K.ink); g.text(10, 0, 'N', K.white, { outline: K.ink });
  hud(g, 28, 3, 60, 18); g.text(32, 5, 'WORLD 1', K.yellow);
  hud(g, 3, 25, 22, 11, { fill: K.indigo }); g.blit(HEART(true), 5, 27); g.blit(HEART(true), 15, 27);
  hud(g, 3, 76, 114, 12);
  return page(g, K.cyan, [T(32, 13.7, 56, ['LEVEL MAP'], 15, K.white, { font: 'pressStart', weight: 400, label: 'Map title', role: 'LABEL' }), T(6, 78.8, 108, ['Sir Pix studied the map. Five levels to go before the', 'Golden Pixel! Level 3 is the Slime Cave.'], 21, K.white, { lh: 1.2 })]);
}

// ── page 2 · side-scroller panorama ─────────────────────────────────────────
function panorama(): O[] {
  const g = grid(); g.vgrad(0, 0, COLS, 62, [K.cyan, K.ice]);
  g.disc(100, 22, 7, K.yellow); glowDither(g, 100, 22, 14, K.white);
  cloudPx(g, 20, 20, 24, 8, 21); cloudPx(g, 54, 28, 30, 9, 22); cloudPx(g, 90, 36, 26, 8, 23); cloudPx(g, 8, 40, 20, 6, 24, K.ice, K.cyan, K.peri);
  mountains(g, 62, 26, 31, K.peri, K.ice, K.white); mountains(g, 66, 18, 32, K.indigo, K.peri, -1);
  hillsPx(g, 64, 8, 33, K.green, K.lime, 76); castle(g, 108, 70, K.peri, K.indigo, K.red, K.yellow, .75);
  for (const x of [8, 20, 44, 70, 90]) { if (x % 4) roundTree(g, x, 72, 18 + (x % 5)); else pine(g, x, 72, 20 + (x % 5), K.green, K.lime); }
  grass(g, 72, 18, 35);
  for (let i = 0; i < 5; i++) block(g, 32 + i * 12, 46, i === 2 ? K.yellow : K.orange, K.red, i === 2);
  for (let i = 0; i < 7; i++) g.blit(COIN().outline(K.ink), 34 + i * 7 + (i > 3 ? 4 : 0), 30 + Math.round(Math.abs(3 - i) * 2.2));
  g.rect(78, 58, 24, 3, K.brown); g.rect(78, 58, 24, 1, K.lime); g.blit(slime(), 84, 46);
  g.blit(slime(), 14, 56); g.blit(slime().recolor(K.green, K.pink).recolor(K.lime, K.skin), 64, 56);
  g.blit(knight(), 52, 24); g.set(50, 41, K.white); g.set(48, 43, K.white); g.set(46, 45, K.white);
  g.rect(0, 0, COLS, 10, K.ink); g.rect(0, 10, COLS, 1, K.white); g.text(3, 1, 'SCORE 4200', K.white); g.blit(COIN(), 66, 1); g.text(77, 1, 'x07', K.yellow); for (let i = 0; i < 3; i++) g.blit(HEART(i < 2), 97 + i * 8, 1);
  hud(g, 3, 76, 78, 12);
  return page(g, K.cyan, [T(6, 78.9, 72, ['Sir Pix ran, jumped and bounced', 'on every slime in Meadow Run.'], 19, K.white, { lh: 1.2 }), LAB(3, 12, 60, 'LEVEL 1-2  MEADOW RUN', 16, K.indigo)]);
}

// ── page 3 · dialogue box ───────────────────────────────────────────────────
function dialogue(): O[] {
  const g = grid(); brickWall(g, 0, 0, COLS, 62, K.maroon, K.red, K.ink, 10, 5);
  g.rect(0, 0, COLS, 6, K.ink); g.dither(0, 6, COLS, 6, K.ink, K.maroon, 9);
  for (const tx of [14, 104]) { g.rect(tx - 1, 28, 3, 8, K.brown); g.rect(tx - 2, 26, 5, 3, K.indigo); flame(g, tx, 26, 1); glowDither(g, tx, 20, 12, K.orange); }
  const wx = 58; g.poly([[wx - 9, 38], [wx - 9, 14], [wx, 6], [wx + 9, 14], [wx + 9, 38]], K.ink); g.poly([[wx - 7, 38], [wx - 7, 15], [wx, 8], [wx + 7, 15], [wx + 7, 38]], K.cyan); g.dither(wx - 7, 8, 14, 30, K.cyan, K.ice, 6); g.rect(wx - 1, 8, 2, 30, K.ink); g.rect(wx - 7, 22, 14, 1, K.ink); stars(g, 2, 8, 12, 30);
  g.rect(0, 62, COLS, 8, K.indigo); for (let x = 0; x < COLS; x += 8) for (let y = 62; y < 70; y += 4) g.rect(x + ((y / 4) & 1 ? 4 : 0), y, 4, 4, K.peri);
  g.rect(0, 62, COLS, 1, K.ink);
  g.blit(scale2(knight()), 10, 30); g.blit(scale2(robot()), 70, 30, true);
  hud(g, 3, 66, 114, 22); g.rect(6, 61, 30, 8, K.ink); g.rect(7, 62, 28, 6, K.red); g.text(10, 62, 'BYTE', K.white);
  hud(g, 92, 36, 25, 18, { fill: K.indigo }); g.text(95, 40, '>', K.yellow);
  g.poly([[108, 83], [114, 83], [111, 86]], K.yellow);
  return page(g, K.ink, [T(6.5, 69.6, 104, ['BEEP BOOP! The Glitch Dragon stole the', 'Golden Pixel from the tower. Will you get it', 'back, Sir Pix?'], 27, K.white, { lh: 1.3 }), T(100.6, 39.4, 16, ['YES!', 'LATER'], 14, K.white, { font: 'pressStart', weight: 400, lh: 1.5, label: 'Menu', role: 'LABEL' })]);
}

// ── page 4 · quiet: the save point ──────────────────────────────────────────
function campfire(): O[] {
  const g = grid(); g.vgrad(0, 0, COLS, 74, [K.ink, K.plum, K.indigo]);
  stars(g, 9, 120, 0, 52); glowDither(g, 96, 20, 18, K.indigo); moon(g, 96, 20, 10, K.white, 4, -3, 9); moon(g, 96, 20, 10, K.ice, 6, -4, 9);
  mountains(g, 66, 22, 41, K.plum, K.indigo, -1);
  for (let x = 2; x < 120; x += 6 + (x % 5)) pine(g, x, 74, 18 + (x * 7) % 9, K.ink, K.plum);
  g.rect(0, 74, COLS, 16, K.ink); g.dither(0, 74, COLS, 3, K.plum, K.ink, 8);
  glowDither(g, 62, 72, 22, K.orange); glowDither(g, 62, 72, 12, K.yellow);
  g.rect(52, 74, 20, 2, K.brown); g.rect(54, 72, 16, 2, K.maroon); flame(g, 62, 74, 1);
  g.blit(rot90(KNIGHT()).outline(K.ink), 78, 62); g.blit(slime(), 98, 66); g.blit(robot(), 36, 58);
  g.text(82, 50, 'ZZZ', K.ice, { scale: 1, outline: K.ink });
  hud(g, 3, 3, 68, 11, { fill: K.indigo }); g.text(8, 5, 'GAME SAVED', K.lime);
  return page(g, K.ink, [T(6, 18, 80, ['Even heroes need to rest.', 'The night was quiet, and the fire was warm.'], 30, K.ice, { lh: 1.5 })]);
}

// ── page 5 · dungeon maze (activity) ────────────────────────────────────────
function mazePage(): O[] {
  const g = grid(); g.rect(0, 0, COLS, ROWS, K.plum); g.dither(0, 0, COLS, ROWS, K.plum, K.ink, 3);
  const n = 10, m = 6; const { walls, dead } = maze(n, m, 12); const cw = 7, ww = 2;
  const off = (i: number) => Math.ceil(i / 2) * ww + Math.floor(i / 2) * cw; const size = (i: number) => (i & 1 ? cw : ww);
  const ox = 3, oy = 20; const mw = off(2 * n + 1), mh = off(2 * m + 1);
  g.rect(ox - 1, oy - 1, mw + 2, mh + 2, K.ink); g.rect(ox, oy, mw, mh, K.indigo);
  for (let y = 0; y < 2 * m + 1; y++) for (let x = 0; x < 2 * n + 1; x++) {
    const px = ox + off(x), py = oy + off(y), w = size(x), h = size(y);
    if (walls[y][x]) { g.rect(px, py, w, h, K.maroon); g.rect(px, py, w, 1, K.red); if (h > 2) g.rect(px, py + Math.floor(h / 2), w, 1, K.ink); } else { g.rect(px, py, w, h, K.plum); if (((x * 7 + y * 3) & 3) === 0) g.set(px + 2, py + 2, K.indigo); }
  }
  const cell = (cx: number, cy: number): [number, number] => [ox + off(2 * cx + 1), oy + off(2 * cy + 1)];
  const mini = (rows: string[], l: Record<string, number>) => spr(7, rows.map(r => r.padEnd(7, '.')), l);
  const hero7 = mini(['..rrr..', '.aaaaa.', '.pkpkp.', '.pppmp.', 'aassaaa', '.a...a.'], { r: 10, a: 3, p: 14, k: 0, m: 10, s: 2 });
  const key7 = mini(['.yyy...', '.y.y...', '.yyy...', '..y....', '..yyy..', '..y.y..'], { y: 8 });
  const chest7 = mini(['.bbbbb.', 'bbbbbbb', 'byyyyyb', 'bbbkbbb', 'bbbbbbb', 'bkkkkkb'], { b: 13, y: 8, k: 0 });
  const slime7 = mini(['..ggg..', '.gggGg.', 'gwkgkwg', 'ggggggg', 'gkkkkkg'], { g: 6, G: 7, w: 15, k: 0 });
  const sp = (s: PG, c: [number, number]) => g.blit(s, c[0], c[1]);
  sp(hero7, cell(0, 0)); sp(chest7, cell(n - 1, m - 1)); sp(key7, cell(Math.floor(n / 2), 1));
  dead.filter(([x, y]) => (x + y > 3) && !(x === n - 1 && y === m - 1)).slice(0, 4).forEach(([x, y]) => sp(slime7, cell(x, y)));
  g.text(3, 2, 'DUNGEON', K.yellow, { scale: 2, outline: K.ink, shadow: K.red });
  hud(g, 92, 20, 25, 56, { fill: K.indigo }); g.blit(hero7, 95, 34); g.blit(key7, 95, 46); g.blit(slime7, 95, 58); g.blit(chest7, 95, 68);
  return page(g, K.plum, [T(93, 4, 25, ['FIND THE', 'WAY OUT!'], 17, K.yellow, { font: 'pressStart', weight: 400, lh: 1.5, label: 'Prompt', role: 'LABEL' }), LAB(94.5, 22.6, 23, 'LEGEND', 14, K.white), LAB(104.5, 34.4, 13, 'START', 13, K.white), LAB(104.5, 46.4, 13, 'KEY', 13, K.white), LAB(104.5, 58.4, 13, 'SLIME', 13, K.white), LAB(104.5, 68.4, 13, 'CHEST', 13, K.white), T(3, 78, 114, ['Get the key, dodge the slimes, then open the chest.', 'Trace the path with a pencil. No diagonals!'], 24, K.white, { lh: 1.3 })]);
}

// ── page 6 · inventory grid ─────────────────────────────────────────────────
type Icon = (s: PG) => void;
const ICONS: Array<{ name: string; draw: Icon }> = [
  { name: 'SWORD', draw: s => { s.line(2, 9, 9, 2, K.ice, 2); s.line(3, 9, 9, 3, K.white, 1); s.rect(2, 7, 4, 1, K.yellow); s.rect(3, 6, 1, 4, K.yellow); s.rect(1, 10, 2, 1, K.brown); } },
  { name: 'SHIELD', draw: s => { s.poly([[2, 2], [10, 2], [10, 7], [6, 11], [2, 7]], K.peri); s.rect(5, 2, 2, 8, K.red); s.rect(2, 4, 8, 2, K.red); } },
  { name: 'POTION', draw: s => { s.disc(6, 8, 3.5, K.red); s.rect(5, 2, 2, 4, K.ice); s.rect(5, 1, 2, 1, K.brown); s.rect(4, 7, 2, 1, K.pink); } },
  { name: 'ELIXIR', draw: s => { s.disc(6, 8, 3.5, K.cyan); s.rect(5, 2, 2, 4, K.ice); s.rect(5, 1, 2, 1, K.brown); s.rect(4, 7, 2, 1, K.white); } },
  { name: 'KEY', draw: s => { s.disc(4, 4, 2.6, K.yellow); s.disc(4, 4, 1, K.ink); s.rect(5, 5, 2, 6, K.yellow); s.rect(7, 8, 2, 1, K.yellow); s.rect(7, 10, 2, 1, K.yellow); } },
  { name: 'COINS', draw: s => { for (let i = 0; i < 3; i++) { s.ellipse(6, 9 - i * 2.4, 4.5, 2, K.orange); s.ellipse(6, 8.4 - i * 2.4, 4.5, 2, K.yellow); } } },
  { name: 'APPLE', draw: s => { s.disc(4.5, 7, 3, K.red); s.disc(7.5, 7, 3, K.red); s.rect(6, 2, 1, 3, K.brown); s.rect(7, 2, 3, 2, K.lime); s.set(3, 5, K.pink); } },
  { name: 'BOOTS', draw: s => { s.rect(2, 3, 3, 6, K.brown); s.rect(2, 8, 5, 2, K.brown); s.rect(7, 3, 3, 6, K.maroon); s.rect(7, 8, 4, 2, K.maroon); s.rect(2, 3, 3, 1, K.skin); s.rect(7, 3, 3, 1, K.skin); } },
  { name: 'MAP', draw: s => { s.rect(2, 3, 8, 7, K.skin); s.rect(1, 2, 1, 9, K.brown); s.rect(10, 2, 1, 9, K.brown); s.line(3, 8, 5, 5, K.red); s.line(5, 5, 8, 7, K.red); s.set(8, 7, K.red); s.rect(3, 4, 2, 1, K.green); } },
  { name: 'GEM', draw: s => { s.poly([[2, 5], [4, 2], [8, 2], [10, 5], [6, 11]], K.cyan); s.poly([[4, 2], [8, 2], [7, 5], [5, 5]], K.ice); s.set(4, 3, K.white); } },
  { name: 'SHROOM', draw: s => { s.ellipse(6, 5.5, 5, 3.6, K.red); s.rect(5, 7, 3, 4, K.skin); s.rect(3, 4, 2, 2, K.white); s.rect(7, 3, 2, 2, K.white); s.rect(9, 6, 1, 1, K.white); } },
  { name: 'BOMB', draw: s => { s.disc(5.5, 7.5, 3.8, K.indigo); s.rect(4, 5, 2, 1, K.peri); s.line(8, 4, 10, 2, K.brown); s.set(10, 1, K.yellow); s.set(9, 1, K.orange); } },
  { name: 'STAR', draw: s => { s.poly([[6, 1], [7.5, 4.6], [11, 4.8], [8.3, 7], [9.2, 10.6], [6, 8.6], [2.8, 10.6], [3.7, 7], [1, 4.8], [4.5, 4.6]], K.yellow); s.set(5, 4, K.white); } },
  { name: 'HEART', draw: s => { s.blit(HEART(true), 2, 2); } },
  { name: 'ROBOT', draw: s => { s.rect(3, 3, 6, 5, K.ice); s.rect(4, 4, 1, 2, K.ink); s.rect(7, 4, 1, 2, K.ink); s.rect(5, 6, 2, 1, K.ink); s.rect(5, 1, 2, 2, K.yellow); s.rect(3, 8, 6, 3, K.peri); } },
  { name: 'LUNCH', draw: s => { s.rect(2, 4, 8, 6, K.orange); s.rect(2, 4, 8, 2, K.yellow); s.rect(4, 2, 4, 2, K.brown); s.rect(5, 6, 2, 3, K.red); } },
];
function inventory(): O[] {
  const g = grid(); g.rect(0, 0, COLS, ROWS, K.indigo); g.dither(0, 0, COLS, ROWS, K.indigo, K.plum, 5);
  g.text(3, 3, 'INVENTORY', K.yellow, { scale: 2, outline: K.ink, shadow: K.red });
  hud(g, 3, 20, 82, 52, { fill: K.plum });
  const cols = 6, sz = 12, gp = 1, ax = 8, ay = 25;
  for (let i = 0; i < cols * 4; i++) {
    const x = ax + (i % cols) * (sz + gp), y = ay + Math.floor(i / cols) * (sz + gp); const sel = i === 8;
    g.rect(x, y, sz, sz, sel ? K.yellow : K.ink); g.rect(x + 1, y + 1, sz - 2, sz - 2, sel ? K.orange : K.indigo); g.rect(x + 2, y + 2, sz - 4, sz - 4, sel ? K.indigo : K.plum);
    if (i < ICONS.length) { const ic = new PG(12, 12); ICONS[i].draw(ic); ic.outline(K.ink); g.blit(ic, x, y); if (i === 3 || i === 5 || i === 6) g.text(x + sz - 4, y + sz - 6, i === 3 ? '2' : i === 5 ? '9' : '3', K.white, { outline: K.ink }); } else g.rect(x + 4, y + 4, 4, 4, K.ink);
  }
  hud(g, 89, 20, 28, 52, { fill: K.plum }); g.blit(knight(), 95, 24); g.blit(COIN(), 92, 63); g.blit(HEART(true), 92, 52);
  bar(g, 92, 46, 22, .85, K.lime); g.rect(0, 0, 0, 0, 0);
  hud(g, 3, 76, 114, 12, { fill: K.plum }); const mic = new PG(12, 12); ICONS[8].draw(mic); mic.outline(K.ink); g.blit(mic, 6, 76);
  return page(g, K.indigo, [LAB(91.5, 42, 24, 'SIR PIX  LV 3', 13, K.yellow), LAB(102.5, 52.6, 14, 'HP 17/20', 12, K.white), LAB(102.5, 63.4, 14, 'x 07', 14, K.yellow), T(20, 79, 94, ['MAP: shows every level. Look for the star!', 'Tap a slot to pick an item. A dot means it is empty.'], 19, K.white, { lh: 1.2 })]);
}

// ── page 7 · boss fight (scale shock) ───────────────────────────────────────
function boss(): O[] {
  const g = grid(); g.vgrad(0, 0, COLS, 76, [K.ink, K.plum, K.maroon]);
  for (const px of [4, 116]) { g.rect(px - 5, 0, 10, 76, K.plum); g.rect(px - 5, 0, 2, 76, K.indigo); }
  stars(g, 6, 40, 20, 50, [K.red, K.orange, K.maroon]);
  g.rect(0, 76, COLS, 14, K.red); g.dither(0, 76, COLS, 6, K.orange, K.red, 8); g.dither(0, 74, COLS, 4, K.maroon, K.red, 8); for (let x = 0; x < COLS; x += 5) g.rect(x, 82 + ((x * 3) % 5), 3, 1, K.yellow);
  g.rect(0, 70, 36, 8, K.ink); brickWall(g, 0, 71, 36, 6, K.maroon, K.red, K.ink, 6, 3);
  g.blit(dragon(), 30, 12, true);
  g.blit(knight(), 12, 54);
  g.rect(26, 12, 1, 59, K.yellow); g.rect(24, 12, 5, 1, K.yellow); g.rect(24, 70, 5, 1, K.yellow);
  g.rect(8, 54, 1, 16, K.white); g.rect(6, 54, 5, 1, K.white); g.rect(6, 69, 5, 1, K.white);
  hud(g, 3, 3, 114, 14, { fill: K.plum }); bar(g, 66, 6, 48, 1, K.red, K.maroon); bar(g, 66, 12, 48, .7, K.lime, K.green);
  hud(g, 50, 78, 66, 10, { fill: K.ink });
  return page(g, K.ink, [LAB(6, 4.2, 58, 'GLITCH DRAGON', 22, K.red), LAB(6, 10.2, 58, 'SIR PIX', 22, K.lime), LAB(1, 24, 24, 'BOSS IS', 14, K.yellow), LAB(1, 27, 24, '8x TALLER', 14, K.yellow), LAB(10, 46, 18, 'HERO', 14, K.white), T(53, 80.8, 62, ['It was HUGE. Sir Pix gulped.'], 21, K.white, { lh: 1.2 })]);
}

// ── page 8 · scoreboard + quest log ─────────────────────────────────────────
function scoreboard(): O[] {
  const g = grid(); g.rect(0, 0, COLS, ROWS, K.ink); g.dither(0, 0, COLS, ROWS, K.ink, K.plum, 3);
  g.text(4, 3, 'SCORES', K.yellow, { scale: 2, outline: K.ink, shadow: K.red });
  hud(g, 3, 24, 62, 50, { fill: K.plum });
  for (let i = 0; i < 5; i++) g.rect(7, 31 + i * 8, 54, 1, K.indigo);
  g.blit(COIN().outline(K.ink), 54, 25);
  const qs: Pt[] = [[78, 22], [78, 34], [78, 46], [78, 58], [78, 70]]; const st = [3, 3, 2, 0, 0];
  qs.forEach((p, i) => { if (i) for (let y = qs[i - 1][1] + 5; y < p[1] - 4; y += 3) g.rect(77, y, 2, 2, i < 3 ? K.yellow : K.peri); g.disc(p[0], p[1], 5, K.ink); g.disc(p[0], p[1], 4, i < 2 ? K.green : i === 2 ? K.red : K.peri); g.text(p[0] - 2, p[1] - 3, String(i + 1), K.white); for (let q = 0; q < 3; q++) star5(g, 104 + q * 5, p[1] - 3, q < st[i] ? K.yellow : K.plum); });
  const rows: Array<[string, string, string]> = [['1ST', 'PIX', '099950'], ['2ND', 'BYT', '087200'], ['3RD', 'SLM', '045100'], ['4TH', 'DRG', '031337'], ['5TH', 'YOU', '000000']];
  const cols = [K.yellow, K.white, K.orange, K.cyan, K.lime];
  return page(g, K.ink, [...rows.map((r, i) => T(7, 26.2 + i * 8, 56, [`${r[0]}  ${r[1]}  ${r[2]}`], 22, cols[i], { font: 'pressStart', weight: 400, label: 'Score row', role: 'LABEL' })), LAB(76, 4.2, 42, 'QUEST LOG', 24, K.cyan), ...['MEADOW RUN', 'PINE FOREST', 'SLIME CAVE', 'SKY BRIDGE', 'DRAGON KEEP'].map((n, i) => LAB(85, qs[i][1] - 1.6, 21, n, 14, i < 3 ? K.white : K.peri)), T(4, 77, 112, ['Beat each level for up to three stars.', 'Can you reach 099950?'], 21, K.white, { lh: 1.2 })]);
}

// ── page 9 · credits ────────────────────────────────────────────────────────
function credits(): O[] {
  const g = grid(); g.vgrad(0, 0, COLS, 90, [K.ink, K.plum, K.indigo]); stars(g, 14, 160, 0, 80);
  const bursts: Array<[number, number, number, number]> = [[20, 24, 12, K.yellow], [100, 20, 10, K.pink], [60, 14, 8, K.cyan]];
  for (const [bx, by, br, c] of bursts) for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; for (let rr = br * .5; rr < br; rr += 2) g.rect(Math.round(bx + Math.cos(an) * rr), Math.round(by + Math.sin(an) * rr), 1, 1, rr > br * .8 ? K.white : c); }
  g.textC(60, 28, 'THE END', K.yellow, { scale: 2, outline: K.ink, shadow: K.red });
  g.rect(0, 74, COLS, 16, K.ink); g.rect(0, 74, COLS, 2, K.green); g.rect(0, 74, COLS, 1, K.lime); g.dither(0, 76, COLS, 3, K.green, K.brown, 8);
  g.blit(scale2(knight()), 14, 42); g.blit(scale2(robot()), 48, 42); g.blit(scale2(slime()), 82, 50); g.blit(HEART(true).outline(K.ink), 58, 34); g.blit(COIN().outline(K.ink), 26, 34);
  hud(g, 3, 77, 114, 12, { fill: K.plum });
  return page(g, K.ink, [T(10, 8, 100, ['Thanks for playing!'], 34, K.white, { align: 'center', weight: 700, label: 'Thanks', role: 'HEADLINE' }), T(6, 79.6, 108, ['Hero: Sir Pix.  Sidekick: Byte.', 'Boss: the Glitch Dragon, now a friend.'], 18, K.white, { lh: 1.15, label: 'Credits' })]);
}

// ── page 10 · back cover (the game box) ─────────────────────────────────────
function backCover(): O[] {
  const g = grid(); g.rect(0, 0, COLS, ROWS, K.indigo); g.dither(0, 0, COLS, ROWS, K.indigo, K.plum, 4);
  for (let x = 0; x < COLS; x += 2) { g.rect(x, 0, 1, 2, x % 4 ? K.yellow : K.red); g.rect(x, 88, 1, 2, x % 4 ? K.yellow : K.red); }
  g.text(5, 5, 'PIXEL', K.yellow, { scale: 2, outline: K.ink, shadow: K.red }); g.text(5, 22, 'QUEST', K.lime, { scale: 2, outline: K.ink, shadow: K.green });
  hud(g, 66, 5, 52, 30, { fill: K.plum }); g.textC(92, 18, '6-12', K.yellow, { scale: 2, outline: K.ink });
  const shot = (x: number, y: number, draw: (s: PG) => void) => { const s = new PG(34, 22); draw(s); g.rect(x - 1, y - 1, 36, 24, K.white); g.rect(x - 2, y - 2, 38, 26, K.ink); g.blit(s, x, y); };
  shot(6, 42, s => { s.vgrad(0, 0, 34, 22, [K.cyan, K.ice]); cloudPx(s, 10, 5, 12, 5, 3); grass(s, 16, 6, 4); s.blit(knight(), 12, 2); });
  shot(46, 42, s => { s.rect(0, 0, 34, 22, K.plum); brickWall(s, 0, 0, 34, 7, K.maroon, K.red, K.ink, 6, 3); s.rect(0, 15, 34, 7, K.indigo); s.blit(slime(), 4, 8); s.blit(robot(), 18, 5); });
  shot(86, 42, s => { s.vgrad(0, 0, 34, 22, [K.ink, K.maroon]); s.blit(dragon(), -2, -8, true); });
  hud(g, 4, 70, 84, 18, { fill: K.plum });
  g.rect(92, 72, 24, 15, K.white); const r = rng(8); let bx = 94; while (bx < 114) { const w = 1 + Math.floor(r() * 2); g.rect(bx, 74, w, 11, K.ink); bx += w + 1 + Math.floor(r() * 2); }
  return page(g, K.indigo, [LAB(66, 7.6, 52, 'AGES', 20, K.white, 'center'), LAB(6, 38.6, 30, 'RUN & JUMP', 14, K.white), LAB(46, 38.6, 30, 'MAZES', 14, K.white), LAB(86, 38.6, 30, 'BOSS!', 14, K.white), T(8, 73.8, 78, ['5 levels, 1 big boss, a maze', 'and a map. Read it like a game manual!'], 19, K.white, { lh: 1.2 })]);
}

const PAGES: Array<() => O[]> = [cover, levelMap, panorama, dialogue, campfire, mazePage, inventory, boss, scoreboard, credits, backCover];
const pixel: PublicationDesigner = (ctx: PublicationCtx) => PAGES[Math.min(ctx.pageIndex, PAGES.length - 1)]();

export const DESIGNS: Record<string, PublicationDesigner> = { 'story-pixel': pixel };
export const LESSONS: Record<string, DesignLesson> = {
  'story-pixel': {
    principle: 'Pixel art is a discipline of limits: a fixed grid, sixteen colours, one-pixel outlines, and dithering (a checkerboard of two colours) to fake the shades you are not allowed. Because every shape is built from the same square, a knight, a castle and a letter all feel like one world, and a boss can be eight times taller than a hero in a single glance.',
    history: 'Early game consoles of the 1980s could only show a few colours and tiny sprites, so artists drew characters pixel by pixel and used patterns of alternating dots to suggest gradients. Those limits became a style: the title screen, the health bar, the dialogue box and the level map are all inherited from that era, and many artists still choose them on purpose today.',
    tryThis: 'Zoom into the knight until you can see every square, then change one colour in the palette and watch the whole page update. Next, find a dithered sky and a dithered shadow and notice they use exactly the same checkerboard rule.',
    interestTag: 'Picture books',
    related: ['Pixel art', 'Video game design', 'Dithering'],
  },
};
export type { TelaVectorObject };
void [SLIME, spr];
