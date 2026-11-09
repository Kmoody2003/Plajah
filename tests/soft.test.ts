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
  const big = await printPdf(p, 'a0'); assert.equal(big.pages, big.rows + 1); assert.equal(big.cols, 1);
  assert.ok(printSheet(p, 841 - 20).height <= big.rows * (1189 - 20), 'every A0 row printed: nothing falls off the sheet');
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

// ── Grading, plush from a drawing, new garments, 3D preview, new safety rules ──────────────────
import { gradeSet, gradePom, sizesOf, sizeRange } from '../services/soft/grading';
import { gradedModel } from '../services/soft/layout';
import { traceSilhouette, otsu, type Gray } from '../services/soft/trace';
import { encodeOutline, CHILD_SIZES, patternsForSizes, type Piece } from '../services/soft/patterns';

const validPieces = (label: string, pcs: Piece[]) => {
  for (const x of pcs) {
    assert.ok(area(x.seam) > 0, `${label}/${x.id} CCW`);
    const al = typeof x.allowance === 'number' ? x.seam.map(() => x.allowance as number) : x.allowance; assert.equal(al.length, x.seam.length, `${label}/${x.id} allowance per edge`);
    assert.ok(area(cutLine(x)) >= area(x.seam) - 1e-6, `${label}/${x.id} cut ≥ seam`);
    assert.ok(x.seam.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1])), `${label}/${x.id} finite`);
    if (x.fold != null) assert.ok(Math.abs(area(unfold(x).seam) - 2 * area(x.seam)) < 1, `${label}/${x.id} unfolds`);
  }
};

test('new garments draft valid pieces in every size', () => {
  for (const id of ['trousers', 'dress', 'leggings', 'bucket-hat']) {
    const t = softTemplateById(id)!; const sizes = sizesOf(t); assert.ok(sizes.length >= 7, id);
    for (const size of sizes) { const p = build(id, { size }); assert.equal(p.size, size); validPieces(`${id} ${size}`, p.pieces); assert.ok(p.grading && p.grading.sizes.includes(size), `${id} ${size} graded spec`); }
  }
  assert.deepEqual(sizesOf(softTemplateById('leggings')!), CHILD_SIZES);
  assert.deepEqual(sizesOf(softTemplateById('fitted-sheet')!), [], 'mattress sizes are not graded');
  validPieces('zip-pouch', build('zip-pouch').pieces); validPieces('zip-pouch flat', build('zip-pouch', { g: 0 }).pieces);
  // Dress: bodice and skirt waists match once the dart intake is taken out; darts are internal lines.
  const d = build('dress', { size: 'M' }); const bf = d.pieces.find(x => x.id === 'bodice-front')!, sf = d.pieces.find(x => x.id === 'skirt-front')!;
  assert.ok(bf.lines!.length === 1 && sf.lines!.length === 1);
  const dartW = (l: Pt[]) => Math.abs(l[2][0] - l[0][0]); const bodWaist = bf.seam[1][0] - dartW(bf.lines![0].pts);
  const sw = Math.max(...sf.seam.map(q => q[0]).filter((_, i) => sf.seam[i][1] > bbox(sf.seam).y1 - 1)) - dartW(sf.lines![0].pts);
  assert.ok(Math.abs(bodWaist - sw) < 2, `waist ${bodWaist} vs ${sw}`);
  // Trousers: back leg wider (deeper crotch extension); the waistband passes over the hip.
  const tr = build('trousers', { size: 'M' }); const f = tr.pieces.find(x => x.id === 'front')!, b = tr.pieces.find(x => x.id === 'back')!;
  assert.ok(bbox(b.seam).w > bbox(f.seam).w); const band = tr.pieces.find(x => x.id === 'waistband')!; assert.ok(bbox(band.seam).w >= 1040, `${bbox(band.seam).w}`);
  // Hat: the two side halves' bottom edges make the head opening (57 cm head + 1.5 cm ease).
  const hat = build('bucket-hat', { size: 'M' }); const side = hat.pieces.find(x => x.id === 'side')!;
  const exp = (585 / 2 + 585 * 0.9 / 2) / 2 * Math.round(570 * 0.13); assert.ok(Math.abs(area(side.seam) - exp) / exp < 0.005, `side ${area(side.seam)} vs ${exp}`);
  assert.ok(Math.abs(hat.finished[0][1] - 585) < 1e-6);
});

test('grading: nests grow monotonically, every size in the PDF, DXF and spec', async () => {
  for (const [id, from, to] of [['tee', 'XS', '3XL'], ['trousers', 'S', 'XL'], ['dress', '2T', '14'], ['leggings', '2T', '14'], ['bucket-hat', 'XS', '3XL']] as const) {
    const t = softTemplateById(id)!; const sizes = sizeRange(sizesOf(t), from, to); const g = gradeSet(t, softDefaults(t), sizes)!; assert.ok(g, id);
    const sheet = printSheet(g.base, undefined, 15, g); assert.ok(sheet.items.length > 0, id);
    for (const it of sheet.items) {
      assert.equal(it.nest!.length, sizes.length, `${id}/${it.piece.id} one line per size`);
      const areas = it.nest!.map(n => area(n.cut)); for (let i = 1; i < areas.length; i++) assert.ok(areas[i] > areas[i - 1], `${id}/${it.piece.id} ${sizes[i]} > ${sizes[i - 1]}`);
    }
    const pom = gradePom(g); assert.deepEqual(pom.sizes, sizes); assert.ok(pom.rows.length >= 3 && pom.rows.every(r => r.values.length === sizes.length));
  }
  const tee = softTemplateById('tee')!; const g = gradeSet(tee, softDefaults(tee), ['S', 'M', 'L', 'XL'])!;
  const dxf = writeDxf(gradedModel(g)); for (const s of ['SIZE-S', 'SIZE-M', 'SIZE-L', 'SIZE-XL']) assert.ok(dxf.includes(s), s);
  const pdf = await printPdf(build('tee', { size: 'M' }), 'letter', 'cm', g); assert.ok(pdf.pages > 2);
  const pack = await techPackPdf(g.base, { audience: 'Adults', hazards: [], labels: [], grade: g }); assert.ok(pack.length > 3000);
  assert.equal(gradeSet(tee, softDefaults(tee), ['M']), null);
  assert.deepEqual(patternsForSizes(tee, softDefaults(tee), ['S', 'L']).map(x => x.size), ['S', 'L'], 'per-size drafts in the order asked');
});

/** A synthetic drawing: dark figure on white, as a canvas would give it. */
function drawing(w: number, h: number, inside: (x: number, y: number) => boolean): Gray {
  const data = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = inside(x, y) ? 20 : 240; return { w, h, data };
}

test('plush from a drawing: traced panels are valid CCW pieces and the base matches the bottom seam', () => {
  // A round critter with one ear on the left only (asymmetric).
  const img = drawing(200, 240, (x, y) => Math.hypot(x - 100, y - 140) < 70 || Math.hypot(x - 100, y - 70) < 45 || Math.hypot(x - 62, y - 30) < 16);
  const T = otsu(img); assert.ok(T > 20 && T < 240);
  const ring = traceSilhouette(img, { threshold: T, smooth: 1 }); assert.ok(area(ring) > 0 && ring.length > 30);
  const b0 = bbox(ring); assert.ok(Math.abs(b0.h - 196) < 6, `height ${b0.h}`);
  const p = build('plush-drawing', { outline: encodeOutline(ring), height: 300 });
  validPieces('plush-drawing', p.pieces);
  const front = p.pieces.find(x => x.id === 'front')!, back = p.pieces.find(x => x.id === 'back')!, base = p.pieces.find(x => x.id === 'base')!;
  assert.ok(Math.abs(bbox(front.seam).h - 300) < 0.5, 'exact height');
  assert.ok(Math.abs(area(front.seam) - area(back.seam)) < 1 && Math.abs(bbox(back.seam).x0 + bbox(front.seam).x1) < 0.5, 'back mirrors front');
  const L = front.seam.reduce((s, q, i) => { const r = front.seam[(i + 1) % front.seam.length]; return s + (q[1] === 0 && r[1] === 0 ? Math.abs(r[0] - q[0]) : 0); }, 0);
  assert.ok(L > 20, `bottom ${L}`); const per = pathLength([...base.seam, base.seam[0]]); assert.ok(Math.abs(per - 2 * L) / (2 * L) < 0.02, `base ${per} vs ${2 * L}`);
  assert.ok(p.fill!.grams > 20);
  // Mirror half: the left ear is copied to the right, so the outline becomes symmetric.
  const sym = traceSilhouette(img, { threshold: T, smooth: 1, mirror: 'left' }); const sb = bbox(sym);
  assert.ok(Math.abs((sb.x0 + sb.x1) / 2 - 100) < 2 && area(sym) > area(ring), 'mirrored left half');
  // Two feet: each gets its own pad.
  const feet = drawing(200, 240, (x, y) => Math.hypot(x - 100, y - 100) < 70 || (y > 150 && y < 220 && ((x > 50 && x < 85) || (x > 115 && x < 150))));
  const p2 = build('plush-drawing', { outline: encodeOutline(traceSilhouette(feet, { threshold: 128 })), flat: 0.03 }); assert.equal(p2.pieces.filter(x => x.id.startsWith('base-')).length, 2);
  // Light-on-dark needs invert; a blank page traces to nothing rather than crashing.
  const neg: Gray = { ...img, data: img.data.map(v => 255 - v) }; assert.ok(area(traceSilhouette(neg, { threshold: T, invert: true })) > 0);
  assert.equal(traceSilhouette(drawing(50, 50, () => false), { threshold: 128 }).length, 0);
});

test('safety for the new items: waist cords, sleepwear, chin cords, toddler zips', () => {
  const kidCord = build('trousers', { size: '8', drawstring: true }); const h = softHazards(kidCord, 'child');
  assert.ok(h.some(x => x.id === 'drawstring-waist-child' && !x.block && x.cite?.includes('1120')));
  assert.ok(softHazards(build('trousers', { size: '2T', drawstring: true }), 'under3').some(x => x.id === 'drawstring-waist-child' && x.block));
  assert.ok(!softHazards(build('trousers', { size: 'M', drawstring: true }), 'adult').some(x => x.block));
  const pj = build('trousers', { size: '6', use: 'pajama' }); const hp = softHazards(pj, 'child');
  assert.ok(hp.some(x => x.id === 'sleepwear') && hp.some(x => x.id === 'sleepwear-fit' && x.cite?.includes('1616')));
  assert.ok(!softHazards(build('trousers', { size: '6', use: 'pajama', fit: 'snug' }), 'child').some(x => x.id === 'sleepwear-fit'));
  assert.ok(softHazards(build('bucket-hat', { size: '2T', cord: true }), 'under3').some(x => x.id === 'chin-cord-young' && x.block));
  assert.ok(softHazards(build('bucket-hat', { size: '8', cord: true }), 'child').some(x => x.id === 'chin-cord-child' && !x.block));
  assert.ok(softHazards(build('zip-pouch'), 'under3').some(x => x.id === 'zip-toddler'));
  assert.ok(softHazards(build('dress', { size: '2T' }), 'under3').some(x => x.id === 'zip-toddler'));
  assert.ok(!softHazards(build('dress', { size: 'M' }), 'adult').some(x => x.id === 'zip-toddler'));
  assert.ok(softRecallQueries(kidCord, 'child').includes("children's pants drawstring"));
});
