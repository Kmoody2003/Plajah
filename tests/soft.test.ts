// Sewing & plush patterns: geometry, every template drafts, seams match, layout, PDFs, safety.
//   npm run test:soft
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { area, offset, contour, sdCircle, bbox, pathLength, mirror, ellipsePerimeter, type Pt } from '../services/soft/geometry';
import { SOFT_TEMPLATES, softTemplateById, softDefaults, cutLine, unfold, cutInstances, SIZE_CHART } from '../services/soft/patterns';
import { marker, yardage, printSheet, patternModel, markerSvg, cutChart, isRect } from '../services/soft/layout';
import { printPdf, techPackPdf } from '../services/soft/pdf';
import { softHazards, softLabels, softRecallQueries } from '../services/safety/softHazards';
import { openHazards } from '../services/safety/hazards';
import { writeDxf } from '../services/cad/dxf';

const build = (id: string, over: Record<string, any> = {}) => { const t = softTemplateById(id)!; return t.build({ ...softDefaults(t), ...over }); };

test('offset grows a square by the allowance on every side, per edge', () => {
  const sq: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  assert.equal(Math.round(area(offset(sq, 10))), 120 * 120);
  const b = bbox(offset(sq, [0, 10, 25, 10])); // bottom 0 (fold), right 10, top 25 (hem), left 10
  assert.deepEqual([b.x0, b.y0, b.x1, b.y1].map(Math.round), [-10, 0, 110, 125]);
});

test('contour traces a whole circle, counter-clockwise', () => {
  const r = contour((x, y) => sdCircle(x, y, 0, 0, 50), -60, -60, 60, 60, 1);
  assert.ok(area(r) > 0); assert.ok(Math.abs(area(r) - Math.PI * 2500) / (Math.PI * 2500) < 0.01);
  const b = bbox(r); assert.ok(Math.abs(b.w - 100) < 1 && Math.abs(b.h - 100) < 1);
});

test('every template drafts valid CCW pieces whose cut line encloses the seam line', () => {
  for (const t of SOFT_TEMPLATES) {
    const p = t.build(softDefaults(t)); assert.ok(p.pieces.length > 0, t.id);
    for (const pc of p.pieces) {
      assert.ok(area(pc.seam) > 0, `${t.id}/${pc.id} seam CCW`);
      const al = typeof pc.allowance === 'number' ? pc.seam.map(() => pc.allowance) : pc.allowance; assert.equal(al.length, pc.seam.length, `${t.id}/${pc.id} allowance per edge`);
      assert.ok(area(cutLine(pc)) >= area(pc.seam) - 1e-6, `${t.id}/${pc.id} cut ≥ seam`);
      const u = unfold(pc); assert.ok(area(u.seam) > 0); if (pc.fold != null) assert.ok(Math.abs(area(u.seam) - 2 * area(pc.seam)) < 1, `${t.id}/${pc.id} unfold doubles`);
    }
    assert.equal(cutInstances(p).length, p.pieces.reduce((s, x) => s + x.cut, 0));
  }
});

test('plush critter: exact height, mirrored back, base perimeter matches the bottom seams', () => {
  const p = build('plush-pal', { height: 300 }); const front = p.pieces.find(x => x.id === 'front')!, back = p.pieces.find(x => x.id === 'back')!, base = p.pieces.find(x => x.id === 'base')!;
  assert.ok(Math.abs(bbox(front.seam).h - 300) < 0.5);
  assert.ok(Math.abs(area(front.seam) - area(back.seam)) < 1); assert.ok(Math.abs(bbox(back.seam).x0 + bbox(front.seam).x1) < 0.5);
  const bottom = front.seam.filter(q => q[1] < 0.6); const L = bbox(bottom).w; const per = pathLength([...base.seam, base.seam[0]]);
  assert.ok(Math.abs(per - 2 * L) / (2 * L) < 0.02, `base ${per} vs ${2 * L}`);
  assert.ok(p.fill!.grams > 60 && p.fill!.grams < 400);
  // Changing the shape redrafts it.
  const bunny = build('plush-pal', { ears: 'long' }); assert.notEqual(Math.round(area(bunny.pieces[0].seam)), Math.round(area(front.seam)));
});

test('plush ball gores: N panels make the sphere surface, panel length is half the circumference', () => {
  const p = build('plush-ball', { d: 200, n: 8 }); const g = p.pieces[0];
  assert.equal(g.cut, 8); assert.ok(Math.abs(bbox(g.seam).h - Math.PI * 100) < 0.5);
  assert.ok(Math.abs(8 * area(g.seam) - 4 * Math.PI * 100 * 100) / (4 * Math.PI * 1e4) < 0.02);
});

test('tee: sizes grade up, fold pieces unfold symmetric', () => {
  const t = build('tee', { size: 'M' }); const front = t.pieces.find(x => x.id === 'front')!;
  const u = unfold(front); const b = bbox(u.seam); assert.ok(Math.abs(b.x0 + b.x1) < 0.5, 'symmetric about the centre front');
  assert.ok(Math.abs(b.w - (SIZE_CHART.M[0] * 10 + 100) / 2) < 1, 'front width = half the finished chest');
  const L = build('tee', { size: 'L' }); assert.ok(bbox(L.pieces[0].seam).w > bbox(front.seam).w);
  const sleeve = t.pieces.find(x => x.id === 'sleeve')!; assert.ok(bbox(sleeve.seam).w > 250);
  assert.ok(t.grading && t.grading.sizes.includes('M') && !t.grading.sizes.includes('6'));
});

test('wide bedding pieces itself: centre panel plus two sides, never a seam down the middle', () => {
  const d = build('duvet', { bed: 'king', fw: 1120 }); const top = d.pieces.filter(x => x.id.startsWith('top'));
  assert.equal(top.length, 2); assert.equal(top[1].cut, 2); assert.ok(top[1].pair);
  const widths = top.map(x => bbox(x.seam).w); assert.ok(Math.abs(widths[0] + 2 * widths[1] - 2640) < 1);
  const narrow = build('duvet', { bed: 'king', fw: 2740 }); assert.equal(narrow.pieces.filter(x => x.id.startsWith('top')).length, 1);
});

test('fitted sheet corners: notch is depth + tuck, elastic about 2/3 of the edge', () => {
  const s = build('fitted-sheet', { size: 'queen', depth: 300, tuck: 150 }); const b = bbox(s.pieces[0].seam);
  assert.equal(Math.round(b.w), 1520 + 2 * 450); assert.equal(Math.round(b.h), 2030 + 2 * 450);
  assert.ok(/elastic/.test(s.notions[0].item));
});

test('marker packs every copy inside the fabric width and gives yardage', () => {
  const p = build('tee', { size: 'M' }); const mk = marker(p, 'main', 1500);
  assert.equal(mk.placed.length, p.pieces.filter(x => x.fabric === 'main').reduce((s, x) => s + x.cut, 0));
  for (const pl of mk.placed) for (const q of pl.cut) assert.ok(q[1] >= -0.5 && q[1] <= 1500.5, 'inside the width');
  // Grain parallel to the selvedge (x).
  for (const pl of mk.placed) assert.ok(Math.abs(pl.grain[1][1] - pl.grain[0][1]) < 1e-6);
  assert.ok(mk.efficiency > 0.3 && mk.efficiency <= 1); const y = yardage(mk); assert.ok(y.metres > 0.5 && y.metres < 3, `${y.metres}`);
  // No two placed boxes overlap.
  for (let i = 0; i < mk.placed.length; i++) for (let j = i + 1; j < mk.placed.length; j++) { const a = mk.placed[i], b = mk.placed[j];
    assert.ok(a.at[0] + a.w <= b.at[0] + 1e-6 || b.at[0] + b.w <= a.at[0] + 1e-6 || a.at[1] + a.h <= b.at[1] + 1e-6 || b.at[1] + b.h <= a.at[1] + 1e-6, 'overlap'); }
});

test('print sheet skips rectangles; DXF and SVG come out', () => {
  const pillow = build('pillow-envelope'); assert.ok(pillow.pieces.every(isRect)); assert.equal(printSheet(pillow).items.length, 0);
  assert.ok(cutChart(pillow)[1][3].includes('×'));
  const plush = build('plush-pal'); const dxf = writeDxf(patternModel(plush, { cutOnly: true })); assert.ok(dxf.includes('CUT') && dxf.includes('NOTCH') && !dxf.includes('SEW'));
  assert.ok(markerSvg(marker(plush, 'fur')).startsWith('<svg'));
});

test('print PDF tiles at 1:1 and the tech pack builds', async () => {
  const p = build('hoodie', { size: 'L' });
  const r = await printPdf(p, 'letter'); assert.ok(r.pages === r.cols * r.rows + 1 && r.pages > 4); assert.equal(String.fromCharCode(...r.bytes.slice(0, 5)), '%PDF-');
  const big = await printPdf(p, 'a0'); assert.equal(big.pages, 2);
  const pack = await techPackPdf(p, { audience: 'Adults', hazards: softHazards(p, 'adult', true), labels: softLabels(p, 'adult', true) }); assert.ok(pack.length > 3000);
});

test('safety: small parts and child drawstrings block; acknowledging cannot clear them', () => {
  const eyes = build('plush-pal', { face: 'safety-eyes' });
  const h = softHazards(eyes, 'under3'); const sp = h.find(x => x.id === 'plush-small-parts')!; assert.ok(sp.block);
  assert.ok(openHazards(h, h.map(x => x.id)).some(x => x.id === 'plush-small-parts'), 'still open after ack');
  assert.ok(!softHazards(build('plush-pal'), 'under3').some(x => x.block), 'embroidered eyes are fine');
  assert.ok(softHazards(eyes, 'child').some(x => x.id === 'plush-eyes' && !x.block));
  const kidHood = build('hoodie', { size: '8', drawstring: true }); assert.ok(softHazards(kidHood, 'child').some(x => x.id === 'drawstring-child' && x.block));
  const adultHood = build('hoodie', { size: 'M', drawstring: true }); assert.ok(!softHazards(adultHood, 'adult').some(x => x.block));
  assert.ok(softHazards(build('throw', { weighted: true }), 'under3').some(x => x.id === 'weighted' && x.block));
  assert.ok(softHazards(build('pillow-envelope'), 'infant').some(x => x.id === 'infant-bedding' && x.block));
  assert.ok(!softHazards(build('fitted-sheet', { size: 'crib' }), 'infant').some(x => x.block), 'a tight crib sheet is allowed, with an acknowledgement');
  const sleep = build('tee', { size: '6', sleepwear: true }); assert.ok(softHazards(sleep, 'child').some(x => x.id === 'sleepwear' && x.cite?.includes('1615')));
  assert.ok(softHazards(build('plush-pal'), 'child', true).some(x => x.id === 'cpsia'));
  assert.ok(softLabels(build('plush-pal'), 'child', true).some(l => /tracking/i.test(l)));
  assert.deepEqual(softRecallQueries(build('plush-pal'), 'child'), ['plush toy', 'stuffed animal']);
});

test('geometry helpers', () => {
  assert.ok(Math.abs(ellipsePerimeter(10, 10) - 2 * Math.PI * 10) < 1e-6);
  const m = mirror([[1, 2]], [0, 0], [0, 1]); assert.deepEqual(m[0].map(x => Math.round(x * 1e9) / 1e9), [-1, 2]);
});
