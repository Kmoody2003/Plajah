import test from 'node:test';
import assert from 'node:assert/strict';
import { saddleStitchSpreads, creepOffsets, signatures, nUp, homeBooklet } from '../services/print/imposition';
import { coverSpread, pageCountRule, spineWidthFromStock, spineTextAllowed } from '../services/print/binding';
import { printerMarks } from '../services/print/marks';
import { paperById } from '../services/print/conditions';
import { DEFAULT_MARKS } from '../services/print/types';
import type { RectIn } from '../services/print/types';

const gloss = paperById('gloss-70lb');

test('saddle spreads: 8 pages', () => {
  assert.deepEqual(saddleStitchSpreads(8), [
    { sheet: 1, front: [8, 1], back: [2, 7] },
    { sheet: 2, front: [6, 3], back: [4, 5] },
  ]);
});

test('saddle spreads: 12 pages and 10 padded to 12', () => {
  assert.deepEqual(saddleStitchSpreads(12), [
    { sheet: 1, front: [12, 1], back: [2, 11] },
    { sheet: 2, front: [10, 3], back: [4, 9] },
    { sheet: 3, front: [8, 5], back: [6, 7] },
  ]);
  const padded = saddleStitchSpreads(10);
  assert.equal(padded.length, 3);
  assert.deepEqual(padded[0], { sheet: 1, front: [null, 1], back: [2, null] });
  assert.deepEqual(padded[1].front, [10, 3]);
});

test('saddle spreads: 16 pages — every page once, facing pairs sum to n+1', () => {
  const s = saddleStitchSpreads(16);
  assert.equal(s.length, 4);
  assert.deepEqual(s[0], { sheet: 1, front: [16, 1], back: [2, 15] });
  assert.deepEqual(s[3], { sheet: 4, front: [10, 7], back: [8, 9] });
  const all = s.flatMap(x => [...x.front, ...x.back]).sort((a, b) => (a as number) - (b as number));
  assert.deepEqual(all, Array.from({ length: 16 }, (_, i) => i + 1));
  for (const x of s) { assert.equal((x.front[0] as number) + (x.front[1] as number), 17); assert.equal((x.back[0] as number) + (x.back[1] as number), 17); }
});

test('home booklet lists front/back sides in sheet order', () => {
  const hb = homeBooklet(8);
  assert.equal(hb.sides.length, 4);
  assert.deepEqual(hb.sides.map(s => [s.left, s.right]), [[8, 1], [2, 7], [6, 3], [4, 5]]);
  assert.match(hb.note, /short edge/);
});

test('creep: zero on the outer sheet, monotonic inward, max at the centre spread', () => {
  const c = creepOffsets(16, gloss);
  assert.equal(c[1], 0); assert.equal(c[2], 0); assert.equal(c[15], 0); assert.equal(c[16], 0);
  for (let p = 1; p < 8; p++) assert.ok(c[p + 1] >= c[p], `front half page ${p}`);
  for (let p = 9; p < 16; p++) assert.ok(c[p + 1] <= c[p], `back half page ${p}`);
  assert.equal(c[8], 3 * gloss.caliperIn); assert.equal(c[9], 3 * gloss.caliperIn);
});

test('signatures pad the last one with blanks', () => {
  const s = signatures(40, 16);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map(x => x.blanks), [0, 0, 8]);
  assert.equal(s[2].pages[0], 33); assert.equal(s[2].pages[15], 48);
  assert.equal(signatures(32, 32).length, 1);
  assert.equal(signatures(32, 32)[0].blanks, 0);
});

const overlap = (a: RectIn, b: RectIn) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('nUp: 3.5×2 business cards on 12×18 with bleed and gutter', () => {
  const p = { sheetIn: [12, 18] as [number, number], itemIn: [3.5, 2] as [number, number], bleedIn: 0.125, gutterIn: 0.125, marginIn: 0.25, allowRotate: true };
  const r = nUp(p);
  assert.equal(r.count, r.positions.length);
  assert.equal(r.count, 21); // 3 × 7 upright beats 4 × 4 rotated
  assert.equal(r.rotated, false);
  assert.ok(r.wastePct > 0 && r.wastePct < 50);
  for (let i = 0; i < r.positions.length; i++) {
    const a = r.positions[i];
    // Bleed box stays within the sheet minus margins.
    assert.ok(a.x - p.bleedIn >= p.marginIn - 1e-9 && a.y - p.bleedIn >= p.marginIn - 1e-9);
    assert.ok(a.x + a.w + p.bleedIn <= 12 - p.marginIn + 1e-9 && a.y + a.h + p.bleedIn <= 18 - p.marginIn + 1e-9);
    for (let j = i + 1; j < r.positions.length; j++) {
      const b = r.positions[j];
      const grow = (q: RectIn): RectIn => ({ x: q.x - p.bleedIn, y: q.y - p.bleedIn, w: q.w + 2 * p.bleedIn, h: q.h + 2 * p.bleedIn });
      assert.ok(!overlap(grow(a), grow(b)), `bleeds ${i}/${j} overlap`);
    }
  }
  const rot = nUp({ ...p, itemIn: [2, 3.5] });
  assert.equal(rot.count, 21);
  assert.equal(rot.rotated, true);
});

test('coverSpread: perfect = 2×bleed + 2×trimW + spine', () => {
  const c = coverSpread({ trimIn: [6, 9], bleedIn: 0.125, binding: 'perfect', pages: 200, paper: paperById('uncoated-50lb') });
  const spine = spineWidthFromStock(200, paperById('uncoated-50lb'));
  assert.equal(spine, 0.42);
  assert.equal(c.spineIn, spine);
  assert.ok(Math.abs(c.widthIn - (2 * 0.125 + 2 * 6 + spine)) < 1e-6);
  assert.equal(c.heightIn, 9.25);
  assert.deepEqual(c.panels.map(p => p.name), ['back', 'spine', 'front']);
  assert.equal(c.panels[2].x, 0.125 + 6 + spine);
  const fromTemplate = coverSpread({ trimIn: [6, 9], bleedIn: 0.125, binding: 'perfect', pages: 200, paper: gloss, spineIn: 0.5 });
  assert.equal(fromTemplate.widthIn, 12.75);
  assert.equal(fromTemplate.estimated, false);
});

test('coverSpread: case and jacket are estimates; saddle has no spine', () => {
  const caseC = coverSpread({ trimIn: [6, 9], bleedIn: 0.125, binding: 'case', pages: 200, paper: gloss, spineIn: 0.75 });
  assert.equal(caseC.estimated, true);
  assert.equal(caseC.widthIn, 1.5 + 12 + 0.75 + 0.25 + 0.5);
  assert.equal(caseC.heightIn, 1.5 + 9 + 0.25);
  const j = coverSpread({ trimIn: [6, 9], bleedIn: 0.125, binding: 'case', pages: 200, paper: gloss, spineIn: 0.75, jacket: true });
  assert.ok(j.panels.some(p => p.name === 'front-flap') && j.panels.some(p => p.name === 'back-flap'));
  assert.ok(j.estimated);
  const s = coverSpread({ trimIn: [8.5, 11], bleedIn: 0.125, binding: 'saddle', pages: 16, paper: gloss });
  assert.equal(s.spineIn, 0);
  assert.equal(s.widthIn, 17.25);
});

test('pageCountRule and spine text rule', () => {
  assert.deepEqual(pageCountRule('saddle', 10).padTo, 12);
  assert.equal(pageCountRule('saddle', 12).ok, true);
  assert.equal(pageCountRule('perfect', 201).padTo, 202);
  assert.equal(pageCountRule('fold', 6).padTo, 8);
  assert.equal(pageCountRule('none', 3).ok, true);
  assert.equal(spineTextAllowed(0.24), false);
  assert.equal(spineTextAllowed(0.25), true);
});

test('printer marks never enter the bleed box', () => {
  const inside = (b: RectIn, x: number, y: number) => x > b.x + 1e-9 && x < b.x + b.w - 1e-9 && y > b.y + 1e-9 && y < b.y + b.h - 1e-9;
  for (const offsetIn of [0.1875, 0.05]) {
    const pm = printerMarks({ trimIn: [6, 9], bleedIn: 0.125, marks: { ...DEFAULT_MARKS, bleed: true, offsetIn }, slugText: 'test.pdf' });
    assert.equal(pm.lines.filter(l => l.kind === 'crop').length, 8);
    assert.equal(pm.lines.filter(l => l.kind === 'bleed').length, 8);
    for (const l of pm.lines) for (let t = 0; t <= 1; t += 0.1) {
      assert.ok(!inside(pm.bleedBox, l.x1 + (l.x2 - l.x1) * t, l.y1 + (l.y2 - l.y1) * t), `${l.kind} line enters bleed`);
    }
    for (const r of pm.registration) {
      const b = pm.bleedBox;
      const dx = Math.max(b.x - r.cx, 0, r.cx - (b.x + b.w)), dy = Math.max(b.y - r.cy, 0, r.cy - (b.y + b.h));
      assert.ok(Math.hypot(dx, dy) >= r.r, 'registration target enters bleed');
    }
    assert.ok(pm.colorBar && pm.colorBar.y + pm.colorBar.patchIn <= pm.bleedBox.y + 1e-9);
    assert.equal(pm.colorBar!.patches.length, 12);
    assert.ok(pm.colorBar!.x + pm.colorBar!.patchIn * 12 <= pm.mediaIn[0]);
    assert.ok(pm.slug && pm.slug.y > pm.bleedBox.y + pm.bleedBox.h && pm.slug.y < pm.mediaIn[1]);
    if (offsetIn < 0.125) assert.ok(pm.notes.some(n => /clamped/.test(n)));
  }
});
