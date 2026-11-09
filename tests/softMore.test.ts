// Sewing & Plush, second round: plush from a drawn path or picture with a side gusset, fly-front
// trousers, princess-seam dress, kids' sizes graded into one nest + AAMA DXF, print-on-demand panels.
//   npm run test:soft
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { area, bbox, pathLength, dist, type Pt } from '../services/soft/geometry';
import { softTemplateById, softDefaults, cutLine, encodeOutline, type Piece, type Pattern } from '../services/soft/patterns';
import { traceSilhouette, outlineFromStrokes, traceImage, type Gray } from '../services/soft/trace';
import { softHazards } from '../services/safety/softHazards';

export const build = (id: string, over: Record<string, unknown> = {}): Pattern => { const t = softTemplateById(id)!; return t.build({ ...softDefaults(t), ...over } as never); };

/** Closed, CCW, no zero-length edges, one allowance per edge, cut line encloses the seam line. */
export function closedPieces(label: string, pieces: Piece[]) {
  for (const p of pieces) {
    assert.ok(p.seam.length >= 3 && area(p.seam) > 0, `${label}/${p.id} CCW`);
    for (let i = 0; i < p.seam.length; i++) assert.ok(dist(p.seam[i], p.seam[(i + 1) % p.seam.length]) > 0.01, `${label}/${p.id} edge ${i} has length`);
    const al = typeof p.allowance === 'number' ? p.seam.map(() => p.allowance) : p.allowance; assert.equal(al.length, p.seam.length, `${label}/${p.id} allowance per edge`);
    assert.ok(area(cutLine(p)) >= area(p.seam) - 1e-6, `${label}/${p.id} cut ≥ seam`);
  }
}
const perimeter = (r: Pt[]) => pathLength([...r, r[0]]);

test('trace round trip: a drawn disk and a drawn circle path come back within 2% of their area', () => {
  const R = 70, w = 200, h = 200; const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = Math.hypot(x - 100, y - 100) < R ? 20 : 240;
  const g: Gray = { w, h, data }; const ring = traceSilhouette(g, { threshold: 130 });
  assert.ok(Math.abs(area(ring) - Math.PI * R * R) / (Math.PI * R * R) < 0.02, `disk ${area(ring)}`);
  // The same through the RGBA path with the automatic threshold and simplification.
  const rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { rgba.fill(data[i], i * 4, i * 4 + 3); rgba[i * 4 + 3] = 255; }
  const r2 = traceImage(rgba, w, h); assert.ok(r2.length < ring.length && Math.abs(area(r2) - area(ring)) / area(ring) < 0.01, 'simplified, same area');
  // Freehand stroke: a circle of radius 100 in its own units (y up), drawn clockwise and not quite closed.
  const stroke: Pt[] = Array.from({ length: 70 }, (_, i) => { const t = -i / 72 * 2 * Math.PI; return [300 + 100 * Math.cos(t), 50 + 100 * Math.sin(t)] as Pt; });
  const o = outlineFromStrokes([stroke]); const exact = Math.abs(area(stroke));
  assert.ok(area(o) > 0 && Math.abs(area(o) - exact) / exact < 0.02, `stroke ${area(o)} vs ${exact}`);
  const b = bbox(o); assert.ok(Math.abs((b.x0 + b.x1) / 2 - 300) < 2 && Math.abs((b.y0 + b.y1) / 2 - 50) < 2, 'stays in the stroke units');
  // A scribbled double loop fills once; an ear stroke overlapping the head unions with it.
  const twice = outlineFromStrokes([[...stroke, ...stroke]]); assert.ok(Math.abs(area(twice) - area(o)) / area(o) < 0.01);
  const ear: Pt[] = Array.from({ length: 30 }, (_, i) => [380 + 40 * Math.cos(i / 30 * 2 * Math.PI), 130 + 40 * Math.sin(i / 30 * 2 * Math.PI)] as Pt);
  const both = outlineFromStrokes([stroke, ear]); assert.ok(area(both) > area(o) * 1.05 && bbox(both).y1 > b.y1 + 15);
  assert.deepEqual(outlineFromStrokes([[[0, 0], [1, 1]]]), []);
});

test('plush side gusset: closed pieces, gusset length matches the front and back seams, notches line up, safety rules hold', () => {
  const stroke: Pt[] = Array.from({ length: 90 }, (_, i) => { const t = i / 90 * 2 * Math.PI; const r = 100 + 25 * Math.cos(3 * t); return [r * Math.cos(t), r * Math.sin(t)] as Pt; });
  const outline = encodeOutline(outlineFromStrokes([stroke]));
  const p = build('plush-drawing', { outline, height: 320, side: true, gussetW: 70 }); closedPieces('plush gusset', p.pieces);
  const fr = p.pieces.find(x => x.id === 'front')!, bk = p.pieces.find(x => x.id === 'back')!, gu = p.pieces.find(x => x.id === 'gusset')!;
  assert.ok(!p.pieces.some(x => x.id.startsWith('base')), 'the side gusset replaces the base');
  const gb = bbox(gu.seam); assert.ok(Math.abs(gb.h - 70) < 1e-6);
  assert.ok(Math.abs(gb.w - perimeter(fr.seam)) < 0.5 && Math.abs(gb.w - perimeter(bk.seam)) < 0.5, `gusset ${gb.w} vs ${perimeter(fr.seam)} / ${perimeter(bk.seam)}`);
  assert.ok(Math.abs(bbox(fr.seam).h - 320) < 0.5, 'exact height');
  // Each gusset notch sits at the same arc length along the front as the front's own notch.
  const arc = (r: Pt[], q: Pt) => { let s = 0; for (let i = 0; i < r.length; i++) { if (dist(r[i], q) < 1e-6) return s; s += dist(r[i], r[(i + 1) % r.length]); } return NaN; };
  const fn = fr.notches!.map(q => arc(fr.seam, q)); const gn = gu.notches!.filter(q => q[1] === 0).map(q => q[0]);
  assert.deepEqual(gn.map(Math.round), fn.map(Math.round));
  assert.ok(p.fill!.grams > 0 && p.fill!.litres > 0); const flat = build('plush-drawing', { outline, height: 320, base: false });
  assert.ok(p.fill!.litres > flat.fill!.litres * 0.5, 'a deep gusset holds a sensible volume');
  // Safety: eyes on an under-3s toy still block; embroidered is fine; the base (default) still drafts.
  const eyes = build('plush-drawing', { outline, side: true, face: 'safety-eyes' });
  assert.ok(softHazards(eyes, 'under3').some(h => h.id === 'plush-small-parts' && h.block));
  assert.ok(!softHazards(p, 'under3').some(h => h.block)); assert.ok(softHazards(eyes, 'child').some(h => h.id === 'plush-eyes' && !h.block));
  closedPieces('plush base', build('plush-drawing', { outline }).pieces);
});
