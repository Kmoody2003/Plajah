// doodleGen — pure, seeded generators behind the activity book "Doodle Day"
// (story-doodle): mazes, dot-to-dot outlines, word search, scrambles and a
// non-overlapping scatter. No drawing here, so tests can prove the puzzles work.
import { rng } from '../../ornaments';

export type Pt = [number, number];

// ── MAZE ──────────────────────────────────────────────────────────────────────
/** A perfect maze (every cell reachable, exactly one route between any two cells).
 *  wallE[r][c]: wall on the east side of cell (r,c); wallS[r][c]: wall on its south side.
 *  The outer border is always walled except the entrance (top of cell 0,0) and exit (bottom of the last cell). */
export interface Maze { cols: number; rows: number; wallE: boolean[][]; wallS: boolean[][]; start: [number, number]; end: [number, number]; algo: 'dfs' | 'kruskal' }

function shuffle<T>(a: T[], r: () => number): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function makeMaze(cols: number, rows: number, seed: number, algo: 'dfs' | 'kruskal' = 'dfs'): Maze {
  const r = rng(seed);
  const wallE = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
  const wallS = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
  if (algo === 'dfs') {
    // recursive backtracker: long winding corridors
    const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
    const stack: Array<[number, number]> = [[0, 0]]; seen[0][0] = true;
    while (stack.length) {
      const [cr, cc] = stack[stack.length - 1];
      const nb = shuffle([[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]] as Array<[number, number]>, r).filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && !seen[nr][nc]);
      if (!nb.length) { stack.pop(); continue; }
      const [nr, nc] = nb[0]; seen[nr][nc] = true;
      if (nr === cr - 1) wallS[nr][nc] = false; else if (nr === cr + 1) wallS[cr][cc] = false; else if (nc === cc - 1) wallE[nr][nc] = false; else wallE[cr][cc] = false;
      stack.push([nr, nc]);
    }
  } else {
    // randomised Kruskal: more branching, many short dead ends
    const parent = Array.from({ length: rows * cols }, (_, i) => i);
    const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edges: Array<[number, number, 'E' | 'S']> = [];
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) { if (cc < cols - 1) edges.push([rr, cc, 'E']); if (rr < rows - 1) edges.push([rr, cc, 'S']); }
    for (const [rr, cc, d] of shuffle(edges, r)) {
      const a = find(rr * cols + cc), b = find(d === 'E' ? rr * cols + cc + 1 : (rr + 1) * cols + cc);
      if (a === b) continue; parent[a] = b;
      if (d === 'E') wallE[rr][cc] = false; else wallS[rr][cc] = false;
    }
  }
  return { cols, rows, wallE, wallS, start: [0, 0], end: [rows - 1, cols - 1], algo };
}

/** Breadth-first route from the entrance cell to the exit cell, or null. (Used by tests; never drawn.) */
export function solveMaze(m: Maze): Array<[number, number]> | null {
  const key = (r: number, c: number) => r * m.cols + c; const prev = new Map<number, number>(); const q: Array<[number, number]> = [m.start]; prev.set(key(...m.start), -1);
  while (q.length) {
    const [r, c] = q.shift()!;
    if (r === m.end[0] && c === m.end[1]) { const path: Array<[number, number]> = []; let k = key(r, c); while (k !== -1) { path.push([Math.floor(k / m.cols), k % m.cols]); k = prev.get(k)!; } return path.reverse(); }
    const nx: Array<[number, number]> = [];
    if (r > 0 && !m.wallS[r - 1][c]) nx.push([r - 1, c]);
    if (r < m.rows - 1 && !m.wallS[r][c]) nx.push([r + 1, c]);
    if (c > 0 && !m.wallE[r][c - 1]) nx.push([r, c - 1]);
    if (c < m.cols - 1 && !m.wallE[r][c]) nx.push([r, c + 1]);
    for (const [nr, nc] of nx) if (!prev.has(key(nr, nc))) { prev.set(key(nr, nc), key(r, c)); q.push([nr, nc]); }
  }
  return null;
}

/** Wall segments in px, runs merged (one segment per straight wall). Entrance/exit gaps are left open. */
export function mazeSegments(m: Maze, x0: number, y0: number, cell: number): Array<[Pt, Pt]> {
  const segs: Array<[Pt, Pt]> = [];
  // horizontal boundary lines: line i is the top of row i (0..rows)
  for (let i = 0; i <= m.rows; i++) {
    let runStart = -1;
    for (let c = 0; c <= m.cols; c++) {
      let wall = false;
      if (c < m.cols) {
        if (i === 0) wall = c !== m.start[1]; else if (i === m.rows) wall = c !== m.end[1]; else wall = m.wallS[i - 1][c];
      }
      if (wall && runStart < 0) runStart = c;
      if (!wall && runStart >= 0) { segs.push([[x0 + runStart * cell, y0 + i * cell], [x0 + c * cell, y0 + i * cell]]); runStart = -1; }
    }
  }
  // vertical lines: line j is the left of column j (0..cols)
  for (let j = 0; j <= m.cols; j++) {
    let runStart = -1;
    for (let r = 0; r <= m.rows; r++) {
      let wall = false;
      if (r < m.rows) wall = j === 0 || j === m.cols ? true : m.wallE[r][j - 1];
      if (wall && runStart < 0) runStart = r;
      if (!wall && runStart >= 0) { segs.push([[x0 + j * cell, y0 + runStart * cell], [x0 + j * cell, y0 + r * cell]]); runStart = -1; }
    }
  }
  return segs;
}

// ── DOT-TO-DOT ────────────────────────────────────────────────────────────────
export interface DotPt { n: number; x: number; y: number; lx: number; ly: number }
function inPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
/** Walk a closed outline and drop numbered dots about `spacing` apart (always on every corner). Number 1 is the first vertex; labels sit outside the shape. */
export function dotOutline(outline: Pt[], spacing: number, labelGap: number): DotPt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const k = Math.max(1, Math.round(len / spacing));
    for (let s = 0; s < k; s++) pts.push([a[0] + (b[0] - a[0]) * s / k, a[1] + (b[1] - a[1]) * s / k]);
  }
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    let tx = next[0] - prev[0], ty = next[1] - prev[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = ty, ny = -tx;
    if (inPoly([p[0] + nx * 6, p[1] + ny * 6], outline)) { nx = -nx; ny = -ny; }
    return { n: i + 1, x: p[0], y: p[1], lx: p[0] + nx * labelGap, ly: p[1] + ny * labelGap };
  });
}
export function starOutline(cx: number, cy: number, R: number, inner = .46): Pt[] {
  const o: Pt[] = []; for (let i = 0; i < 10; i++) { const a = (i * 36 - 90) * Math.PI / 180, r = i % 2 ? R * inner : R; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o;
}
/** A rocket silhouette (clockwise from the nose), right half mirrored. */
export function rocketOutline(cx: number, cy: number, s: number): Pt[] {
  const right: Pt[] = [[0, -310], [48, -252], [82, -172], [92, -90], [92, 92], [172, 172], [172, 262], [92, 220], [74, 262]];
  const left: Pt[] = right.slice(1).reverse().map(([x, y]) => [-x, y] as Pt);
  const pts: Pt[] = [...right, [0, 262], ...left];
  return pts.map(([x, y]) => [cx + x * s, cy + y * s] as Pt);
}

// ── WORD SEARCH + SCRAMBLE ────────────────────────────────────────────────────
export interface WordSearch { size: number; grid: string[][]; placed: Array<{ word: string; r: number; c: number; dr: number; dc: number }> }
export function makeWordSearch(words: string[], size: number, seed: number): WordSearch {
  const dirs: Array<[number, number]> = [[0, 1], [1, 0], [1, 1]];
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng(seed + attempt * 101); const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''));
    const placed: WordSearch['placed'] = []; let ok = true;
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      let done = false;
      for (let t = 0; t < 300 && !done; t++) {
        const [dr, dc] = dirs[Math.floor(r() * dirs.length)];
        const rr = Math.floor(r() * size), cc = Math.floor(r() * size);
        const er = rr + dr * (w.length - 1), ec = cc + dc * (w.length - 1);
        if (er >= size || ec >= size) continue;
        let fits = true; for (let i = 0; i < w.length; i++) { const g = grid[rr + dr * i][cc + dc * i]; if (g && g !== w[i]) { fits = false; break; } }
        if (!fits) continue;
        for (let i = 0; i < w.length; i++) grid[rr + dr * i][cc + dc * i] = w[i];
        placed.push({ word: w, r: rr, c: cc, dr, dc }); done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (!ok) continue;
    const letters = 'ABCDEFGHIJKLMNOPRSTUW';
    for (let rr = 0; rr < size; rr++) for (let cc = 0; cc < size; cc++) if (!grid[rr][cc]) grid[rr][cc] = letters[Math.floor(r() * letters.length)];
    return { size, grid, placed };
  }
  throw new Error('word search could not be placed');
}
export function scramble(word: string, seed: number): string {
  const r = rng(seed);
  for (let i = 0; i < 30; i++) { const s = shuffle(word.split(''), r).join(''); if (s !== word) return s; }
  return word.split('').reverse().join('');
}

// ── SCATTER (find-and-circle) ─────────────────────────────────────────────────
export interface Placed { id: number; x: number; y: number; r: number }
/** Place circles of the given radii in a box so none overlap (with `gap`), avoiding rectangles. */
export function scatter(radii: number[], box: { x: number; y: number; w: number; h: number }, seed: number, gap = 10, avoid: Array<{ x: number; y: number; w: number; h: number }> = []): Placed[] {
  const r = rng(seed); const out: Placed[] = [];
  radii.forEach((rad, id) => {
    let g = gap;
    for (let tries = 0; ; tries++) {
      if (tries % 600 === 599) g = Math.max(2, g - 2);
      if (tries > 6000) throw new Error('scatter could not fit');
      const x = box.x + rad + r() * (box.w - rad * 2), y = box.y + rad + r() * (box.h - rad * 2);
      if (avoid.some(a => x + rad > a.x && x - rad < a.x + a.w && y + rad > a.y && y - rad < a.y + a.h)) continue;
      if (out.some(p => Math.hypot(p.x - x, p.y - y) < p.r + rad + g)) continue;
      out.push({ id, x, y, r: rad }); return;
    }
  });
  return out;
}

export const FIND_TARGETS: Array<{ kind: 'star' | 'heart' | 'fish' | 'key' | 'moon'; label: string; count: number }> = [
  { kind: 'star', label: 'stars', count: 3 }, { kind: 'heart', label: 'hearts', count: 3 }, { kind: 'fish', label: 'fish', count: 4 }, { kind: 'key', label: 'keys', count: 2 }, { kind: 'moon', label: 'moons', count: 3 },
];
export const FIND_DISTRACTORS = ['spiral', 'zigzag', 'squiggle', 'triangle', 'flower', 'leaf', 'plus', 'diamond', 'ring', 'cloud'] as const;
export interface FindPlan { items: Array<{ kind: string; target: boolean; x: number; y: number; r: number; rot: number }> }
export function makeFindPlan(seed: number, box: { x: number; y: number; w: number; h: number }): FindPlan {
  const r = rng(seed); const kinds: Array<{ kind: string; target: boolean }> = [];
  for (const t of FIND_TARGETS) for (let i = 0; i < t.count; i++) kinds.push({ kind: t.kind, target: true });
  for (let i = 0; i < 16; i++) kinds.push({ kind: FIND_DISTRACTORS[i % FIND_DISTRACTORS.length], target: false });
  const order = shuffle(kinds, r); const radii = order.map(k => (k.target ? 38 : 32) + Math.floor(r() * 8));
  const pl = scatter(radii, box, seed + 7, 12);
  return { items: pl.map(p => ({ kind: order[p.id].kind, target: order[p.id].target, x: p.x, y: p.y, r: p.r, rot: Math.round((r() - .5) * 70) })) };
}
