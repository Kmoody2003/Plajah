// pixelKit: a TRUE pixel grid for story-pixel ("Pixel Quest").
//
// Every picture is painted into a PG (a grid of palette indices, 16 colours) and rendered as
// batched square runs: ONE path per colour, so a whole 120x90-cell page is at most 16 objects.
// Painting tools: rects, discs, polygons, lines, Bayer-dithered fills and gradients, 1-bit outlines,
// a 5x7 bitmap font, hand-drawn sprites, Scale2x for big portraits, and procedural scenery.
import type { TelaVectorObject } from '../../../../types';
import { path } from '../../templateKit';
import { rng } from '../../ornaments';

export type O = TelaVectorObject;
export const PAL = ['#14102A', '#2D2A5E', '#4C48A8', '#8478F0', '#2EB5E8', '#B4F2F0', '#2E9E4F', '#94E04A', '#FFE74C', '#F5962A', '#E63B3B', '#8E2A58', '#FF7FB0', '#8A5632', '#F6D2A8', '#FFFFFF'];
export const K = { ink: 0, plum: 1, indigo: 2, peri: 3, cyan: 4, ice: 5, green: 6, lime: 7, yellow: 8, orange: 9, red: 10, maroon: 11, pink: 12, brown: 13, skin: 14, white: 15 } as const;
export type Pt = [number, number];

// ── 5x7 bitmap font ─────────────────────────────────────────────────────────
const GLYPHS: Record<string, string> = {
  A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110', D: '11110,10001,10001,10001,10001,10001,11110',
  E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000', G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001',
  I: '01110,00100,00100,00100,00100,00100,01110', J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,11001,10101,10011,10001,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000',
  Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001', S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,11011,10001', X: '10001,10001,01010,00100,01010,10001,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
  '0': '01110,10001,10011,10101,11001,10001,01110', '1': '00100,01100,00100,00100,00100,00100,01110', '2': '01110,10001,00001,00010,00100,01000,11111', '3': '11110,00001,00001,01110,00001,00001,11110',
  '4': '00010,00110,01010,10010,11111,00010,00010', '5': '11111,10000,11110,00001,00001,10001,01110', '6': '00110,01000,10000,11110,10001,10001,01110', '7': '11111,00001,00010,00100,01000,01000,01000',
  '8': '01110,10001,10001,01110,10001,10001,01110', '9': '01110,10001,10001,01111,00001,00010,01100',
  '!': '00100,00100,00100,00100,00100,00000,00100', '.': '00000,00000,00000,00000,00000,00110,00110', ':': '00000,00110,00110,00000,00110,00110,00000', '-': '00000,00000,00000,11111,00000,00000,00000',
  '?': '01110,10001,00001,00010,00100,00000,00100', ',': '00000,00000,00000,00000,00110,00100,01000', '/': '00001,00010,00010,00100,01000,01000,10000', '+': '00000,00100,00100,11111,00100,00100,00000',
  '>': '01000,00100,00010,00001,00010,00100,01000', '<': '00010,00100,01000,10000,01000,00100,00010', '=': '00000,00000,11111,00000,11111,00000,00000', "'": '00100,00100,01000,00000,00000,00000,00000',
  '*': '00000,10101,01110,11111,01110,10101,00000', 'x': '00000,10001,01010,00100,01010,10001,00000', ' ': '00000,00000,00000,00000,00000,00000,00000',
};
const glyph = (ch: string): number[][] => (GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS[' ']).split(',').map(r => Array.from(r).map(Number));

export interface TextOpts { scale?: number; outline?: number; shadow?: number; gap?: number }

export class PG {
  readonly a: Int8Array;
  constructor(readonly cols: number, readonly rows: number) { this.a = new Int8Array(cols * rows).fill(-1); }
  set(x: number, y: number, c: number): void { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return; this.a[y * this.cols + x] = c; }
  get(x: number, y: number): number { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -2; return this.a[y * this.cols + x]; }
  rect(x: number, y: number, w: number, h: number, c: number): this { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  frame(x: number, y: number, w: number, h: number, c: number, t = 1): this { this.rect(x, y, w, t, c); this.rect(x, y + h - t, w, t, c); this.rect(x, y, t, h, c); this.rect(x + w - t, y, t, h, c); return this; }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, c); }
    return this;
  }
  disc(cx: number, cy: number, r: number, c: number): this { return this.ellipse(cx, cy, r, r, c); }
  poly(pts: Pt[], c: number): this {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yy = y + .5; const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + (yy - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1): this {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { this.rect(x0 - Math.floor((t - 1) / 2), y0 - Math.floor((t - 1) / 2), t, t, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    return this;
  }
  /** Bayer 4x4 ordered dither between c1 and c2; level 0 = all c1, 16 = all c2. */
  dither(x: number, y: number, w: number, h: number, c1: number, c2: number, level: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, BAYER[(y + j) & 3][(x + i) & 3] < level ? c2 : c1);
    return this;
  }
  /** Vertical dithered gradient through a list of palette colours. */
  vgrad(x: number, y: number, w: number, h: number, cols: number[]): this {
    const n = cols.length - 1;
    for (let j = 0; j < h; j++) { const t = (j + .5) / h * n; const i = Math.min(n - 1, Math.floor(t)); const f = t - i; this.dither(x, y + j, w, 1, cols[i], cols[i + 1], Math.round(f * 16)); }
    return this;
  }
  /** Paint src over this at (ox,oy); transparent cells are skipped. */
  blit(src: PG, ox: number, oy: number, flip = false): this {
    for (let j = 0; j < src.rows; j++) for (let i = 0; i < src.cols; i++) { const c = src.a[j * src.cols + (flip ? src.cols - 1 - i : i)]; if (c >= 0) this.set(ox + i, oy + j, c); }
    return this;
  }
  /** Add a 1-cell outline around everything already painted (only into empty cells). */
  outline(c: number, diag = false): this {
    const add: Array<[number, number]> = [];
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (this.a[y * this.cols + x] >= 0) continue;
      let hit = false; for (const [dx, dy] of diag ? D8 : D4) if (this.get(x + dx, y + dy) >= 0) { hit = true; break; }
      if (hit) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }
  recolor(from: number, to: number): this { for (let i = 0; i < this.a.length; i++) if (this.a[i] === from) this.a[i] = to; return this; }
  textW(s: string, scale = 1, gap = 1): number { return Math.max(0, s.length * (5 + gap) * scale - gap * scale); }
  text(x: number, y: number, s: string, c: number, o: TextOpts = {}): this {
    const sc = o.scale ?? 1, gap = o.gap ?? 1, ol = o.outline, sh = o.shadow;
    const draw = (px: number, py: number, col: number) => { let cx = px; for (const ch of Array.from(s)) { const g = glyph(ch); for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i]) this.rect(cx + i * sc, py + j * sc, sc, sc, col); cx += (5 + gap) * sc; } };
    if (sh !== undefined) { const d = Math.max(1, Math.ceil(sc / 2)); draw(x + d, y + d, sh); if (ol !== undefined) for (const [dx, dy] of D8) draw(x + dx * Math.max(1, Math.ceil(sc / 2)) + d, y + dy * Math.max(1, Math.ceil(sc / 2)) + d, sh); }
    if (ol !== undefined) { const t = Math.max(1, Math.ceil(sc / 2)); for (const [dx, dy] of D8) draw(x + dx * t, y + dy * t, ol); }
    draw(x, y, c);
    return this;
  }
  textC(cx: number, y: number, s: string, c: number, o: TextOpts = {}): this { return this.text(Math.round(cx - this.textW(s, o.scale ?? 1, o.gap ?? 1) / 2), y, s, c, o); }
}
const D4: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D8: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// ── rendering: one path per colour, greedy-merged rectangles ────────────────
export function renderGrid(g: PG, cell: number, ox = 0, oy = 0, label = 'Pixel art'): O[] {
  const out: O[] = [];
  for (let c = 0; c < 16; c++) {
    // row runs
    type R = { x: number; y: number; w: number; h: number };
    let open: R[] = []; const done: R[] = [];
    for (let y = 0; y < g.rows; y++) {
      const runs: Array<[number, number]> = []; let x = 0;
      while (x < g.cols) { if (g.a[y * g.cols + x] === c) { let e = x; while (e < g.cols && g.a[y * g.cols + e] === c) e++; runs.push([x, e - x]); x = e; } else x++; }
      const next: R[] = [];
      for (const [rx, rw] of runs) { const m = open.find(r => r.x === rx && r.w === rw && r.y + r.h === y); if (m) { m.h++; next.push(m); } else next.push({ x: rx, y, w: rw, h: 1 }); }
      for (const r of open) if (!next.includes(r)) done.push(r);
      open = next;
    }
    done.push(...open);
    if (!done.length) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; let d = '';
    for (const r of done) { const px = ox + r.x * cell, py = oy + r.y * cell, pw = r.w * cell, ph = r.h * cell; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px + pw); y1 = Math.max(y1, py + ph); d += `M${px} ${py}h${pw}v${ph}h${-pw}z`; }
    const w = x1 - x0, h = y1 - y0;
    out.push(path(x0, y0, w, h, d, PAL[c], { origin: { x: x0, y: y0, w, h }, stroke: PAL[c], strokeWidth: .7, label }));
  }
  return out;
}

// ── sprites ─────────────────────────────────────────────────────────────────
type Legend = Record<string, number>;
/** Rows are centred inside `width`; '.' is transparent. */
export function spr(width: number, rows: string[], legend: Legend): PG {
  const g = new PG(width, rows.length);
  rows.forEach((r, y) => { const left = Math.floor((width - r.length) / 2); Array.from(r).forEach((ch, i) => { if (ch !== '.' && legend[ch] !== undefined) g.set(left + i, y, legend[ch]); }); });
  return g;
}
/** Scale2x (AdvMAME2x): doubles resolution and smooths diagonals, keeping the pixel look. */
export function scale2(src: PG): PG {
  const g = new PG(src.cols * 2, src.rows * 2); const P = (x: number, y: number) => src.get(x, y) === -2 ? -1 : src.get(x, y);
  for (let y = 0; y < src.rows; y++) for (let x = 0; x < src.cols; x++) {
    const p = P(x, y), A = P(x, y - 1), B = P(x + 1, y), C = P(x - 1, y), D = P(x, y + 1);
    let e0 = p, e1 = p, e2 = p, e3 = p;
    if (C === A && C !== D && A !== B) e0 = A; if (A === B && A !== C && B !== D) e1 = B; if (D === C && D !== B && C !== A) e2 = C; if (B === D && B !== A && D !== C) e3 = D;
    g.a[(y * 2) * g.cols + x * 2] = e0; g.a[(y * 2) * g.cols + x * 2 + 1] = e1; g.a[(y * 2 + 1) * g.cols + x * 2] = e2; g.a[(y * 2 + 1) * g.cols + x * 2 + 1] = e3;
  }
  return g;
}
export function rot90(src: PG): PG { const g = new PG(src.rows, src.cols); for (let y = 0; y < src.rows; y++) for (let x = 0; x < src.cols; x++) g.a[x * g.cols + (src.rows - 1 - y)] = src.a[y * src.cols + x]; return g; }

const LK: Legend = { k: 0, s: 2, a: 3, A: 5, r: 10, p: 14, w: 15, m: 10, y: 8, b: 13, c: 4, g: 6, G: 7, o: 9, d: 1, t: 11, n: 12, i: 2 };
export const KNIGHT = (): PG => spr(16, ['rrrr', 'rrrrrr', 'kkkkkkkkkk', 'kaaAAaaaask', 'kaAaaaaaassk', 'kkkkkkkkkkkk', 'kppppppppppk', 'kppkppppkppk', 'kppppppppppk', 'kppppmmppppk', 'kkppppppkk', 'kssaaaaaassk', 'kaakaaAAaakaak', 'kaakaaaaaakaak', 'kk.kssssssk.kk', 'kbbk..kbbk'], LK);
export const ROBOT = (): PG => spr(16, ['yy', 'kk', 'kkkkkkkkkkkk', 'kAAAAAAAAAAk', 'kAkkkkkkkkAk', 'kAkcckkcckAk', 'kAkcckkcckAk', 'kAkkkkkkkkAk', 'kAkckkkkckAk', 'kAkkcccckkAk', 'kAAAAAAAAAAk', 'kkkAAAAAAkkk', 'ksAAAAAAAAsk', 'ksAAcyycAAsk', 'ksAAAAAAAAsk', 'kkkk..kkkk'], LK);
export const SLIME = (): PG => spr(16, ['kkkk', 'kkGGggkk', 'kGGggggggk', 'kGgggggggggk', 'kggwwggggwwggk', 'kggwkggggkwggk', 'kggggggggggggggk', 'kgggggkkkkgggggk', 'kkggggggggggggkk', 'kkkkkkkkkkkkkk'], LK);
export const HEART = (full = true): PG => { const f = full ? 'r' : 'd'; const hi = full ? 'w' : 'd'; return spr(8, ['.kk..kk.', `k${f}${f}kk${f}${f}k`, `k${hi}${f}${f}${f}${f}${f}k`, `k${f}${f}${f}${f}${f}${f}k`, `.k${f}${f}${f}${f}k.`, `..k${f}${f}k..`, '...kk...'], LK); };
export const COIN = (): PG => spr(8, ['..kkkk..', '.kyyyyk.', 'kywyyyok', 'kywyyyok', 'kyyyyyok', 'kyyyyyok', '.kyyyok.', '..kkkk..'], LK);

// ── procedural scenery ──────────────────────────────────────────────────────
export function stars(g: PG, seed: number, n: number, y0: number, y1: number, cols: number[] = [K.white, K.ice, K.yellow]): void {
  const r = rng(seed); for (let i = 0; i < n; i++) { const x = Math.floor(r() * g.cols), y = Math.floor(y0 + r() * (y1 - y0)), c = cols[i % cols.length]; g.set(x, y, c); if (i % 6 === 0) { g.set(x - 1, y, c); g.set(x + 1, y, c); g.set(x, y - 1, c); g.set(x, y + 1, c); } }
}
export function cloudPx(g: PG, cx: number, cy: number, w: number, h: number, seed: number, top: number = K.white, shade: number = K.ice, shade2: number = K.peri): void {
  const r = rng(seed); const L = new PG(g.cols, g.rows); const n = Math.max(3, Math.round(w / (h * .8)));
  for (let i = 0; i < n; i++) { const t = n === 1 ? .5 : i / (n - 1); const rr = h * (.36 + r() * .22) * (1 - Math.abs(t - .5) * .5); L.disc(cx - w / 2 + rr + (w - rr * 2) * t, cy + h * .25 - rr * (.5 + r() * .5), rr, top); }
  L.ellipse(cx, cy + h * .1, w * .38, h * .38, top);
  const base = Math.round(cy + h * .28);
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) { if (L.a[y * L.cols + x] < 0) continue; if (y > base) L.a[y * L.cols + x] = -1; else if (y >= base - 1) L.a[y * L.cols + x] = shade2; else if (y >= base - 3) L.a[y * L.cols + x] = ((x + y) & 1) && y === base - 3 ? top : shade; }
  g.blit(L, 0, 0);
}
export function mountains(g: PG, baseY: number, hMax: number, seed: number, fill: number, light: number, snow = -1, x0 = 0, x1 = g.cols): void {
  const r = rng(seed); const ph = [r() * 6, r() * 6, r() * 6]; const hs: number[] = [];
  for (let x = x0; x < x1; x++) hs.push(hMax * (.45 + .3 * Math.sin(x / 11 + ph[0]) + .2 * Math.sin(x / 5.3 + ph[1]) + .08 * Math.sin(x / 2.1 + ph[2])));
  for (let x = x0; x < x1; x++) {
    const h = Math.max(2, Math.round(hs[x - x0])); const top = baseY - h; g.rect(x, top, 1, h + 1, fill);
    const prev = hs[Math.max(0, x - x0 - 1)];
    if (hs[x - x0] > prev) for (let k = 0; k < 4; k++) g.set(x, top + k, ((x + top + k) & 1) || k < 2 ? light : fill);
    if (snow >= 0 && h > hMax * .74) for (let k = 0; k < Math.round((h - hMax * .74) / 2) + 1; k++) g.set(x, top + k, snow);
  }
}
export function hillsPx(g: PG, baseY: number, amp: number, seed: number, fill: number, edge: number, bottom = g.rows): void {
  const r = rng(seed); const p1 = r() * 6, p2 = r() * 6;
  for (let x = 0; x < g.cols; x++) { const y = Math.round(baseY - amp * (.5 + .35 * Math.sin(x / 9 + p1) + .15 * Math.sin(x / 3.7 + p2))); g.rect(x, y, 1, bottom - y, fill); g.set(x, y, edge); if ((x & 1) === 0) g.set(x, y + 1, edge); }
}
export function pine(g: PG, cx: number, baseY: number, h: number, c1: number, c2: number): void {
  const w = Math.round(h * .46); g.rect(cx - 1, baseY - Math.round(h * .16), 2, Math.round(h * .16), K.brown);
  const tiers = 3; for (let t = 0; t < tiers; t++) { const ty = baseY - Math.round(h * .16) - Math.round((t + 1) * (h * .84 / tiers)), th = Math.round(h * .84 / tiers) + 3, tw = Math.round(w * (1 - t * .25)); g.poly([[cx - tw, ty + th], [cx, ty], [cx + tw, ty + th]], c1); g.poly([[cx, ty], [cx + tw, ty + th], [cx + 1, ty + th]], c2); }
}
export function roundTree(g: PG, cx: number, baseY: number, h: number, c1: number = K.green, c2: number = K.lime): void {
  g.rect(cx - 1, baseY - Math.round(h * .45), 3, Math.round(h * .45), K.brown); g.rect(cx + 1, baseY - Math.round(h * .45), 1, Math.round(h * .45), K.maroon);
  const r = h * .32; g.disc(cx, baseY - h * .68, r, c1); g.disc(cx - r * .5, baseY - h * .62, r * .7, c1); g.disc(cx + r * .55, baseY - h * .6, r * .7, c1);
  g.dither(Math.round(cx - r), Math.round(baseY - h * 1.0), Math.round(r * 1.3), Math.round(r * .8), c1, c2, 7);
}
export function grass(g: PG, y: number, h: number, seed: number, x0 = 0, x1 = g.cols): void {
  const r = rng(seed); g.rect(x0, y, x1 - x0, 1, K.lime); g.rect(x0, y + 1, x1 - x0, 2, K.green);
  for (let x = x0; x < x1; x++) { if (r() > .55) g.set(x, y - 1, K.lime); if ((x & 1) === 0) g.set(x, y + 3, K.green); }
  g.rect(x0, y + 3, x1 - x0, h - 3, K.brown);
  for (let x = x0; x < x1; x++) for (let j = 4; j < h; j++) if (r() > .93) g.set(x, y + j, r() > .5 ? K.maroon : K.skin);
  for (let x = x0; x < x1; x += 8) g.rect(x, y + 4, 1, h - 4, K.maroon);
  g.dither(x0, y + 3, x1 - x0, 2, K.green, K.brown, 8);
}
export function brickWall(g: PG, x: number, y: number, w: number, h: number, c: number = K.maroon, light: number = K.red, mortar: number = K.ink, bw = 8, bh = 4): void {
  g.rect(x, y, w, h, c);
  for (let j = 0; j * bh < h; j++) { g.rect(x, y + j * bh, w, 1, mortar); const off = (j & 1) ? bw / 2 : 0; for (let i = -1; i * bw < w + bw; i++) { const bx = x + i * bw + off; if (bx >= x && bx < x + w) g.rect(bx, y + j * bh, 1, bh, mortar); if (bx + 1 >= x && bx + 1 < x + w) for (let k = 1; k < 3; k++) g.set(bx + 2 + k, y + j * bh + 1, light); } }
}
export function castle(g: PG, x: number, baseY: number, wall: number = K.peri, shade: number = K.indigo, roof: number = K.red, flag: number = K.yellow, k = 1): void {
  const L = new PG(g.cols, g.rows); const q = (n: number) => Math.max(1, Math.round(n * k));
  const keepW = q(22), keepH = q(20); L.rect(x - Math.floor(keepW / 2), baseY - keepH, keepW, keepH, wall); L.rect(x + q(2), baseY - keepH, Math.floor(keepW / 2) - q(2), keepH, shade);
  for (let i = 0; i < keepW; i += Math.max(2, q(4))) L.rect(x - Math.floor(keepW / 2) + i, baseY - keepH - q(2), Math.max(1, q(2)), q(2), wall);
  for (const sx of [-1, 1]) { const tx = x + sx * q(16), tw = q(10), th = q(32); L.rect(tx - Math.floor(tw / 2), baseY - th, tw, th, wall); L.rect(tx + 1, baseY - th, Math.floor(tw / 2) - 1, th, shade); L.poly([[tx - tw / 2 - q(2), baseY - th], [tx, baseY - th - q(12)], [tx + tw / 2 + q(2), baseY - th]], roof); L.poly([[tx, baseY - th - q(12)], [tx + tw / 2 + q(2), baseY - th], [tx + 1, baseY - th]], K.maroon); L.rect(tx - 1, baseY - th + q(6), 2, q(4), K.yellow); L.rect(tx - 1, baseY - th + q(16), 2, q(4), K.yellow); }
  L.rect(x - q(4), baseY - q(11), q(8), q(11), K.brown); L.rect(x - q(3), baseY - q(12), q(6), 1, K.brown); L.rect(x, baseY - q(11), 1, q(11), K.ink);
  L.rect(x - q(8), baseY - q(15), 2, q(4), K.yellow); L.rect(x + q(6), baseY - q(15), 2, q(4), K.yellow);
  const fx = x - q(16), fy = baseY - q(32) - q(12); L.line(fx, fy, fx, fy - q(10), K.ink); L.poly([[fx, fy - q(10)], [fx + q(8), fy - q(7)], [fx, fy - q(4)]], flag);
  L.outline(K.ink); g.blit(L, 0, 0);
}
/** Question block / crate style tile. */
export function block(g: PG, x: number, y: number, face: number = K.yellow, edge: number = K.orange, mark = true): void {
  g.rect(x, y, 12, 12, K.ink); g.rect(x + 1, y + 1, 10, 10, face); g.rect(x + 1, y + 10, 10, 1, edge); g.rect(x + 10, y + 1, 1, 10, edge);
  for (const [px, py] of [[2, 2], [9, 2], [2, 9], [9, 9]]) g.set(x + px, y + py, K.ink);
  if (mark) g.text(x + 3, y + 3, '?', K.ink);
}
export function coinPx(g: PG, x: number, y: number): void { g.blit(COIN(), x, y); }
export function heartPx(g: PG, x: number, y: number, full = true): void { g.blit(HEART(full), x, y); }
export function bar(g: PG, x: number, y: number, w: number, frac: number, fill: number, back: number = K.plum): void {
  g.rect(x, y, w, 5, K.ink); g.rect(x + 1, y + 1, w - 2, 3, back); g.rect(x + 1, y + 1, Math.round((w - 2) * frac), 3, fill); g.rect(x + 1, y + 1, Math.round((w - 2) * frac), 1, K.white);
}
/** Chunky HUD panel: ink edge, bright rim, inner rim, notched corners and a hard drop shadow. */
export function hud(g: PG, x: number, y: number, w: number, h: number, o: { fill?: number; rim?: number; inner?: number; shadow?: number } = {}): void {
  const fill = o.fill ?? K.plum, rim = o.rim ?? K.white, inner = o.inner ?? K.indigo;
  g.rect(x + 2, y + 2, w, h, o.shadow ?? K.ink);
  g.rect(x, y, w, h, K.ink); g.rect(x + 1, y + 1, w - 2, h - 2, rim); g.rect(x + 2, y + 2, w - 4, h - 4, inner); g.rect(x + 3, y + 3, w - 6, h - 6, fill);
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) g.set(cx, cy, -1);
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]]) g.set(cx, cy, K.ink);
}
export function moon(g: PG, cx: number, cy: number, r: number, c: number, dx: number, dy: number, r2: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const in1 = Math.hypot(x + .5 - cx, y + .5 - cy) <= r, in2 = Math.hypot(x + .5 - cx - dx, y + .5 - cy - dy) <= r2; if (in1 && !in2) g.set(x, y, c); }
}
export function flame(g: PG, cx: number, baseY: number, s = 1): void {
  g.poly([[cx - 4 * s, baseY], [cx - 3 * s, baseY - 7 * s], [cx - s, baseY - 11 * s], [cx, baseY - 14 * s], [cx + 2 * s, baseY - 9 * s], [cx + 4 * s, baseY - 6 * s], [cx + 4 * s, baseY]], K.orange);
  g.poly([[cx - 2 * s, baseY], [cx - s, baseY - 6 * s], [cx, baseY - 9 * s], [cx + 2 * s, baseY - 5 * s], [cx + 2 * s, baseY]], K.yellow); g.poly([[cx - s, baseY], [cx, baseY - 4 * s], [cx + s, baseY]], K.white);
}
export function glowDither(g: PG, cx: number, cy: number, r: number, c: number, over: boolean[] | null = null): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const d = Math.hypot(x + .5 - cx, y + .5 - cy) / r; if (d >= 1) continue; const lvl = Math.round((1 - d) * 11); if (BAYER[y & 3][x & 3] < lvl && g.get(x, y) >= 0 && (!over || over[0] !== false)) g.set(x, y, c); }
}
/** Perfect maze via recursive backtracker; returns a (2n+1)x(2m+1) boolean grid (true = wall). */
export function maze(n: number, m: number, seed: number): { walls: boolean[][]; dead: Array<[number, number]> } {
  const r = rng(seed); const W = 2 * n + 1, H = 2 * m + 1; const walls: boolean[][] = Array.from({ length: H }, () => Array(W).fill(true)); const seen = Array.from({ length: m }, () => Array(n).fill(false));
  const stack: Array<[number, number]> = [[0, 0]]; seen[0][0] = true; walls[1][1] = false;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1]; const nb: Array<[number, number]> = [];
    for (const [dx, dy] of D4) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < n && ny < m && !seen[ny][nx]) nb.push([nx, ny]); }
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny] = nb[Math.floor(r() * nb.length)]; seen[ny][nx] = true; walls[2 * ny + 1][2 * nx + 1] = false; walls[cy + ny + 1][cx + nx + 1] = false; stack.push([nx, ny]);
  }
  const dead: Array<[number, number]> = [];
  for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) { let open = 0; for (const [dx, dy] of D4) if (!walls[2 * y + 1 + dy][2 * x + 1 + dx]) open++; if (open === 1) dead.push([x, y]); }
  return { walls, dead };
}
/** The giant, slightly goofy Glitch Dragon, drawn into an 86x62 layer with a 1-cell ink outline. */
export function dragon(): PG {
  const L = new PG(88, 64);
  // wing (behind)
  L.poly([[34, 34], [10, 4], [30, 10], [44, 2], [54, 14], [62, 6], [66, 30]], K.indigo); L.poly([[34, 34], [30, 10], [44, 2], [54, 14], [50, 34]], K.peri); L.dither(34, 6, 30, 28, K.indigo, K.peri, 6);
  for (const [x, y] of [[10, 4], [30, 10], [44, 2], [62, 6]] as Pt[]) L.line(40, 34, x, y, K.ink);
  // tail
  L.poly([[22, 40], [2, 52], [0, 62], [10, 58], [30, 54], [30, 36]], K.red); L.poly([[10, 58], [30, 54], [30, 48], [6, 56]], K.maroon);
  for (let i = 0; i < 4; i++) L.poly([[6 + i * 5, 55 - i * 2], [9 + i * 5, 49 - i * 2], [12 + i * 5, 53 - i * 2]], K.yellow);
  // body, belly
  L.ellipse(42, 42, 25, 17, K.red); L.dither(20, 48, 48, 12, K.red, K.maroon, 10); L.ellipse(46, 49, 17, 9, K.yellow); L.dither(34, 52, 28, 6, K.yellow, K.orange, 9);
  for (let i = 0; i < 5; i++) L.rect(34 + i * 6, 46 + (i & 1), 5, 1, K.orange);
  // neck + head
  L.poly([[52, 36], [58, 16], [70, 14], [70, 32], [62, 44]], K.red); L.poly([[66, 20], [70, 14], [70, 32], [64, 42]], K.maroon);
  L.ellipse(70, 16, 12, 9, K.red); L.poly([[74, 16], [88 - 1, 18], [86, 26], [72, 26]], K.red);
  L.poly([[74, 24], [86, 26], [86, 30], [72, 30]], K.maroon); for (let i = 0; i < 4; i++) L.poly([[75 + i * 3, 24], [77 + i * 3, 24], [76 + i * 3, 28]], K.white);
  L.rect(84, 19, 2, 2, K.ink);
  L.poly([[64, 8], [62, -1 + 1], [68, 6]], K.yellow); L.poly([[72, 7], [74, 0], [77, 8]], K.yellow);
  L.ellipse(70, 14, 4, 3, K.white); L.rect(70, 13, 3, 3, K.ink); L.rect(71, 13, 1, 1, K.white); L.line(65, 10, 74, 12, K.maroon, 2);
  // back spikes and legs
  for (let i = 0; i < 6; i++) L.poly([[28 + i * 6, 27 + Math.abs(i - 3)], [31 + i * 6, 21 + Math.abs(i - 3)], [34 + i * 6, 27 + Math.abs(i - 3)]], K.yellow);
  for (const lx of [34, 56]) { L.ellipse(lx, 58, 6, 6, K.red); L.rect(lx - 6, 60, 13, 4, K.maroon); for (let i = 0; i < 3; i++) L.rect(lx - 5 + i * 5, 62, 2, 2, K.white); }
  L.outline(K.ink); return L;
}
export function fireBreath(g: PG, x: number, y: number, len: number): void {
  g.poly([[x, y], [x + len, y - 12], [x + len + 4, y + 2], [x + len, y + 18]], K.orange); g.poly([[x, y + 1], [x + len * .8, y - 5], [x + len * .85, y + 9]], K.yellow); g.poly([[x, y + 1], [x + len * .5, y - 1], [x + len * .5, y + 4]], K.white);
  g.dither(x + len * .55, y - 12, len * .5, 30, K.orange, K.red, 6);
}
export { rng };
