// Proofs for the two format books: "Doodle Day" (story-doodle) puzzles are real, and
// "Hello, Colors!" (story-board) keeps to its board-book rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TELA_PUBLICATION_TEMPLATES } from '../services/telaPublicationTemplates';
import { PUBLICATION_DESIGNS } from '../services/tela/designs/publications';
import { solveMaze, makeWordSearch, scramble, makeFindPlan, FIND_TARGETS, starOutline, rocketOutline, type Maze } from '../services/tela/designs/publications/doodleGen';
import { MAZE_EASY, MAZE_HARD, buildMaze, mazeOrigin, dotsFor, DOT_STAR, DOT_ROCKET, WS_WORDS, WS_SEED, SCRAMBLES, FIND_BOX, FIND_SEED } from '../services/tela/designs/publications/storyDoodle';
import type { TelaVectorObject } from '../types';

const tpl = (id: string) => TELA_PUBLICATION_TEMPLATES.find(t => t.id === id)!;
function page(id: string, i: number): TelaVectorObject[] {
  const t = tpl(id);
  return PUBLICATION_DESIGNS[id]({ template: t, pageType: t.pages[i], pageIndex: i, pageCount: t.pages.length, W: t.width, H: t.height, fr: { W: t.width, H: t.height, m: 0, x: 0, y: 0, w: t.width, h: t.height, right: t.width, bottom: t.height, cx: t.width / 2, cy: t.height / 2 }, paper: t.palette[0], ink: t.palette[1], accent: t.palette[2], secondary: t.palette[3], seed: 7 });
}

// Independent solver: reads ONLY the wall path that is drawn on the page, not the generator's data.
function wallsFromPage(objs: TelaVectorObject[], cols: number, rows: number, x0: number, y0: number, cell: number) {
  const walls = objs.find(o => o.objectLabel === 'Maze walls'); assert.ok(walls?.svgPathData, 'page has a Maze walls object');
  const h = Array.from({ length: rows + 1 }, () => Array<boolean>(cols).fill(false)); // h[i][c]: wall on the top edge of row i
  const v = Array.from({ length: rows }, () => Array<boolean>(cols + 1).fill(false)); // v[r][j]: wall on the left edge of column j
  const re = /M\s*([-\d.]+)\s+([-\d.]+)\s*L\s*([-\d.]+)\s+([-\d.]+)/g; let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(walls!.svgPathData!))) {
    const [ax, ay, bx, by] = [+m[1], +m[2], +m[3], +m[4]]; n++;
    if (Math.abs(ay - by) < .6) { const i = Math.round((ay - y0) / cell); const c0 = Math.round((Math.min(ax, bx) - x0) / cell), c1 = Math.round((Math.max(ax, bx) - x0) / cell); for (let c = c0; c < c1; c++) h[i][c] = true; }
    else { const j = Math.round((ax - x0) / cell); const r0 = Math.round((Math.min(ay, by) - y0) / cell), r1 = Math.round((Math.max(ay, by) - y0) / cell); for (let r = r0; r < r1; r++) v[r][j] = true; }
  }
  assert.ok(n > 10, 'walls were parsed');
  return { h, v };
}
function bfsFromPage(h: boolean[][], v: boolean[][], cols: number, rows: number) {
  assert.equal(h[0][0], false, 'entrance (top of first cell) is open');
  assert.equal(h[rows][cols - 1], false, 'exit (bottom of last cell) is open');
  const seen = new Set<number>([0]); const q = [0]; let open = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (c < cols - 1 && !v[r][c + 1]) open++; if (r < rows - 1 && !h[r + 1][c]) open++; }
  while (q.length) {
    const k = q.shift()!; const r = Math.floor(k / cols), c = k % cols; const nx: number[] = [];
    if (r > 0 && !h[r][c]) nx.push(k - cols); if (r < rows - 1 && !h[r + 1][c]) nx.push(k + cols); if (c > 0 && !v[r][c]) nx.push(k - 1); if (c < cols - 1 && !v[r][c + 1]) nx.push(k + 1);
    for (const nk of nx) if (!seen.has(nk)) { seen.add(nk); q.push(nk); }
  }
  return { reachable: seen.size, openEdges: open, exitReached: seen.has(rows * cols - 1) };
}

for (const [name, spec, pageIdx] of [['easy', MAZE_EASY, 3], ['hard', MAZE_HARD, 8]] as const) {
  test(`doodle maze (${name}) drawn on the page is solvable, perfect, and keeps its solution off the page`, () => {
    const m: Maze = buildMaze(spec);
    const route = solveMaze(m); assert.ok(route, 'generator solves it'); assert.ok(route!.length >= spec.cols + spec.rows - 1, 'route is at least Manhattan length');
    const objs = page('story-doodle', pageIdx); const { x0, y0 } = mazeOrigin(spec);
    const { h, v } = wallsFromPage(objs, spec.cols, spec.rows, x0, y0, spec.cell);
    const r = bfsFromPage(h, v, spec.cols, spec.rows);
    assert.equal(r.exitReached, true, 'exit reachable from the entrance using only the drawn walls');
    assert.equal(r.reachable, spec.cols * spec.rows, 'every cell reachable (no sealed rooms)');
    assert.equal(r.openEdges, spec.cols * spec.rows - 1, 'exactly cells-1 openings: a perfect maze with ONE route');
    assert.ok(!objs.some(o => /solution|answer path|route/i.test(o.objectLabel || '')), 'no solution object is drawn');
    console.log(`maze ${name}: ${spec.cols}x${spec.rows} ${m.algo}, solution length ${route!.length} cells, drawn-walls BFS reaches exit, open edges ${r.openEdges}`);
  });
}

for (const [name, spec, idx, outline] of [['star', DOT_STAR, 4, starOutline(408, 660, 318, .44)], ['rocket', DOT_ROCKET, 11, rocketOutline(408, 626, 1.12)]] as const) {
  test(`doodle dot-to-dot (${name}) numbers run 1..N in order round a real outline, legibly`, () => {
    const d = dotsFor(spec); const N = d.length;
    assert.ok(N >= 16, 'enough dots'); d.forEach((p, i) => assert.equal(p.n, i + 1));
    // each dot lies ON the outline and the distance travelled round the outline strictly increases
    const segLen = outline.map((p, i) => { const q = outline[(i + 1) % outline.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
    const param = (x: number, y: number) => { let best = Infinity, at = 0, acc = 0; outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length]; const L = segLen[i]; const t = Math.max(0, Math.min(1, ((x - p[0]) * (q[0] - p[0]) + (y - p[1]) * (q[1] - p[1])) / (L * L))); const dd = Math.hypot(x - (p[0] + (q[0] - p[0]) * t), y - (p[1] + (q[1] - p[1]) * t)); if (dd < best) { best = dd; at = acc + t * L; } acc += L; }); return { best, at }; };
    let prev = -1; d.forEach(p => { const { best, at } = param(p.x, p.y); assert.ok(best < .6, `dot ${p.n} is on the outline`); assert.ok(at > prev - 1e-6, `dot ${p.n} follows dot ${p.n - 1} round the outline`); prev = at; });
    // neighbours are close (so 'join in order' draws the shape) and no two dots or labels collide
    for (let i = 0; i < N; i++) { const a = d[i], b = d[(i + 1) % N]; assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= spec.spacing * 1.55, `dots ${a.n}-${b.n} are neighbours`); }
    let minDot = Infinity, minLabel = Infinity;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { if (i === j) continue; minDot = Math.min(minDot, Math.hypot(d[i].x - d[j].x, d[i].y - d[j].y)); minLabel = Math.min(minLabel, Math.hypot(d[i].lx - d[j].x, d[i].ly - d[j].y), Math.hypot(d[i].lx - d[j].lx, d[i].ly - d[j].ly)); }
    assert.ok(minDot >= 36, `dots at least 36px apart (min ${minDot.toFixed(1)})`); assert.ok(minLabel >= 20, `labels clear of other dots and labels (min ${minLabel.toFixed(1)})`);
    // the page prints exactly those numbers, in a rounded face >= 16px
    const objs = page('story-doodle', idx); const nums = objs.filter(o => /^Dot number /.test(o.objectLabel || ''));
    assert.equal(nums.length, N); nums.forEach((o, i) => { assert.equal(o.text, String(i + 1)); assert.ok((o.fontSize || 0) >= 16); });
    console.log(`dot-to-dot ${name}: ${N} dots numbered 1..${N}, strictly increasing round the outline, min dot gap ${minDot.toFixed(0)}px, min label clearance ${minLabel.toFixed(0)}px`);
  });
}

test('doodle word search contains every listed word, scrambles are real anagrams', () => {
  const ws = makeWordSearch(WS_WORDS, 10, WS_SEED);
  const dirs: Array<[number, number]> = [[0, 1], [1, 0], [1, 1]];
  for (const w of WS_WORDS) {
    let found = false;
    for (let r = 0; r < 10 && !found; r++) for (let c = 0; c < 10 && !found; c++) for (const [dr, dc] of dirs) { let ok = true; for (let i = 0; i < w.length; i++) { const rr = r + dr * i, cc = c + dc * i; if (rr > 9 || cc > 9 || ws.grid[rr][cc] !== w[i]) { ok = false; break; } } if (ok) { found = true; break; } }
    assert.ok(found, `${w} is in the grid`);
  }
  ws.grid.forEach(row => row.forEach(ch => assert.match(ch, /^[A-Z]$/)));
  SCRAMBLES.forEach((s, i) => { const sc = scramble(s.word, 90 + i * 7); assert.notEqual(sc, s.word); assert.equal(sc.split('').sort().join(''), s.word.split('').sort().join('')); });
});

test('doodle find-and-circle: the checklist counts match what is hidden, nothing overlaps', () => {
  const plan = makeFindPlan(FIND_SEED, FIND_BOX);
  for (const t of FIND_TARGETS) assert.equal(plan.items.filter(i => i.target && i.kind === t.kind).length, t.count, t.kind);
  for (let i = 0; i < plan.items.length; i++) { const a = plan.items[i]; assert.ok(a.x - a.r >= FIND_BOX.x && a.x + a.r <= FIND_BOX.x + FIND_BOX.w && a.y - a.r >= FIND_BOX.y && a.y + a.r <= FIND_BOX.y + FIND_BOX.h); for (let j = i + 1; j < plan.items.length; j++) assert.ok(Math.hypot(a.x - plan.items[j].x, a.y - plan.items[j].y) >= a.r + plan.items[j].r, 'no overlap'); }
  // the page draws one icon per planned item
  const objs = page('story-doodle', 5); assert.equal(objs.filter(o => /^Doodle /.test(o.objectLabel || '') && o.y > FIND_BOX.y - 5 && o.y < FIND_BOX.y + FIND_BOX.h).length, plan.items.length);
});

test('doodle book is printable: black line on white, no fills, no effects, type >= 16px, 12-20 pages', () => {
  const t = tpl('story-doodle'); assert.ok(t.pages.length >= 12 && t.pages.length <= 20); assert.equal(t.width, 816); assert.equal(t.height, 1056);
  for (let i = 0; i < t.pages.length; i++) {
    const objs = page('story-doodle', i);
    for (const o of objs) {
      assert.ok(['none', '#FFFFFF', '#111111'].includes(o.fill) , `p${i + 1} ${o.objectLabel}: fill ${o.fill}`);
      assert.ok(['none', '#111111'].includes(o.stroke), `p${i + 1} ${o.objectLabel}: stroke ${o.stroke}`);
      assert.ok(!o.gradient && !o.shadow && !o.blendMode && !o.blur, `p${i + 1} ${o.objectLabel}: no effects`);
      if (o.kind === 'TEXT') { assert.ok((o.fontSize || 0) >= 16, `p${i + 1} text ${o.fontSize}px`); assert.equal(o.fill, '#111111'); }
    }
    const solidInk = objs.filter(o => o.fill === '#111111' && o.kind !== 'TEXT'); const area = solidInk.reduce((a, o) => a + o.w * o.h, 0);
    assert.ok(area < 816 * 1056 * .05, `p${i + 1}: solid ink area ${Math.round(area)} stays tiny (ink-saving)`);
  }
});

test('board book: square single pages, primaries only, one word, no small type, 12-16 pages', () => {
  const t = tpl('story-board'); assert.ok(t.pages.length >= 12 && t.pages.length <= 16); assert.equal(t.width, 576); assert.equal(t.height, 576);
  const ok = new Set(['#E4141C', '#1649E0', '#FFD200', '#111111', '#FFFFFF', 'none']);
  for (let i = 0; i < t.pages.length; i++) {
    const objs = page('story-board', i);
    for (const o of objs) { assert.ok(ok.has(o.fill), `p${i + 1} ${o.objectLabel}: fill ${o.fill}`); assert.ok(ok.has(o.stroke), `p${i + 1} ${o.objectLabel}: stroke ${o.stroke}`); assert.ok(!o.gradient && !o.shadow && !o.blendMode && !o.blur); }
    if (i < t.pages.length - 1) {
      const words = objs.filter(o => o.kind === 'TEXT'); const spoken = words.map(o => o.text || '').join('').replace(/[^A-Za-z]/g, '');
      assert.ok(words.length >= 1 && words.length <= 14, `p${i + 1} text objects`); assert.ok(words.every(o => (o.fontSize || 0) >= 40), `p${i + 1}: every text is huge`); assert.ok(spoken.length <= 20, `p${i + 1}: 1-5 words`);
    }
  }
});
