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

import { gradeSet, sizesOf, sizeRange } from '../services/soft/grading';
import { printSheet, gradedModel } from '../services/soft/layout';
import { writeDxf } from '../services/cad/dxf';
import { deriveGrading } from '../services/soft/drape/grading';
import { writeAama, readAama } from '../services/soft/drape/aama';
import { CHILD_SIZES } from '../services/soft/patterns';

/** Side seam and inseam of a trouser leg: the side runs from the topmost left point down to the hem corner (ring index 0); the inseam from index 1 to the crotch point. */
function legSeams(r: Pt[]) {
  let top = -1; r.forEach((q, i) => { if (q[0] < 0 && (top < 0 || q[1] > r[top][1])) top = i; });
  let cr = 0; r.forEach((q, i) => { if (q[0] > r[cr][0]) cr = i; });
  return { side: pathLength([...r.slice(top), r[0]]), inseam: pathLength(r.slice(1, cr + 1)) };
}

test('fly-front trousers: closed pieces in every size, side seams and inseams match, waistband fits the waist', () => {
  const t = softTemplateById('trousers')!;
  for (const size of sizesOf(t)) for (const waist of ['elastic', 'fly']) {
    const p = build('trousers', { size, waist }); closedPieces(`trousers ${waist} ${size}`, p.pieces);
    const f = p.pieces.find(x => x.id === 'front')!, b = p.pieces.find(x => x.id === 'back')!; const sf = legSeams(f.seam), sb = legSeams(b.seam);
    assert.ok(Math.abs(sf.side - sb.side) < 3, `${size} ${waist} side ${sf.side} vs ${sb.side}`);
    assert.ok(sb.inseam >= sf.inseam && sb.inseam - sf.inseam <= 10, `${size} ${waist} inseam: back eases onto front by ≤ 1 cm (${sf.inseam} / ${sb.inseam})`);
    if (waist === 'fly') {
      assert.ok(p.pieces.some(x => x.id === 'fly-shield') && p.features.zip && !p.features.elastic, 'fly parts');
      // Waist edge on each leg (top edge, less the fly extension and the dart) ×2 + extension = waistband length.
      const edge = (pc: typeof f, fly: number) => { const yt = Math.max(...pc.seam.map(q => q[1])); let cfTop = pc.seam.filter(q => q[1] > yt - 30 && q[0] > 0).reduce((a, q) => (q[1] > a[1] ? q : a)); const swp = pc.seam.filter(q => q[0] < 0).reduce((a, q) => (q[1] > a[1] ? q : a));
        cfTop = [cfTop[0] - fly, cfTop[1]]; const dart = pc.lines?.find(l => l.label === 'dart'); const dw = dart ? dist(dart.pts[0], dart.pts[2]) : 0; return dist(cfTop, swp) - dw; };
      const flyW = CHILD_SIZES.includes(size) ? 28 : 35; const band = bbox(p.pieces.find(x => x.id === 'waistband')!.seam).w;
      const fw = edge(f, flyW), bw = edge(b, 0); assert.ok(Math.abs(band - (flyW + 5) - 2 * (fw + bw)) < 3, `${size} band ${band} vs ${2 * (fw + bw)}`);
      const finWaist = p.finished.find(x => x[0] === 'Waist (finished)')![1]; assert.ok(Math.abs(2 * (fw + bw) - finWaist) < 3);
    }
  }
  assert.ok(!build('trousers', { waist: 'fly', use: 'pajama' }).pieces.some(x => x.id === 'fly-shield'), 'pajamas stay elastic');
  // Safety: a fly button on a 2T is flagged (acknowledge, not blocked); a child drawcord is impossible with a fly.
  const kid = build('trousers', { size: '2T', waist: 'fly', drawstring: true }); const hz = softHazards(kid, 'under3');
  assert.ok(hz.some(h => h.id === 'button-toddler' && !h.block) && hz.some(h => h.id === 'zip-toddler')); assert.ok(!kid.features.waistDrawstring);
});

test('princess dress: closed panels in every size, princess seams match, bodice and skirt waists join', () => {
  const t = softTemplateById('dress')!;
  for (const size of sizesOf(t)) {
    const p = build('dress', { size, bodice: 'princess' }); closedPieces(`dress ${size}`, p.pieces);
    const by = (id: string) => p.pieces.find(x => x.id === id)!;
    for (const [c, s] of [['bodice-cf', 'bodice-sf'], ['bodice-cb', 'bodice-sb']]) {
      const C = by(c), S = by(s); const shared = C.seam.filter(q => S.seam.some(r => dist(q, r) < 1e-6)); assert.ok(shared.length >= 10, `${size} ${c}/${s} share the princess curve`);
      const seamOf = (r: Pt[]) => { const on = r.map(q => shared.some(z => dist(z, q) < 1e-6)); let L = 0; for (let i = 0; i < r.length; i++) if (on[i] && on[(i + 1) % r.length]) L += dist(r[i], r[(i + 1) % r.length]); return L; };
      assert.ok(Math.abs(seamOf(C.seam) - seamOf(S.seam)) < 1e-6, `${size} ${c}/${s} princess seam lengths`);
    }
    // Waist: centre + side panel widths at y = 0 equal the skirt front's waist less its dart (as the darted bodice does).
    const w0 = (r: Pt[]) => { const xs = r.filter(q => Math.abs(q[1]) < 1e-6).map(q => q[0]); return Math.max(...xs) - Math.min(...xs); };
    const sk = by('skirt-front'); const skTop = Math.max(...sk.seam.filter(q => q[0] > 0 && q[1] > bbox(sk.seam).y1 - 10).map(q => q[0])); const skDart = sk.lines?.[0] ? Math.abs(sk.lines[0].pts[2][0] - sk.lines[0].pts[0][0]) : 0;
    assert.ok(Math.abs(w0(by('bodice-cf').seam) + w0(by('bodice-sf').seam) - (skTop - skDart)) < 2.5, `${size} waist join`);
  }
});

test('graded nests and AAMA DXF: fly trousers 2T–14 and princess dress XS–3XL grow with every size', () => {
  for (const [id, over, from, to] of [['trousers', { waist: 'fly' }, '2T', '14'], ['trousers', { waist: 'fly' }, 'XS', '3XL'], ['dress', { bodice: 'princess' }, 'XS', '3XL'], ['dress', { bodice: 'princess' }, '2T', '14']] as const) {
    const t = softTemplateById(id)!; const sizes = sizeRange(sizesOf(t), from, to); const v = { ...softDefaults(t), ...over }; const g = gradeSet(t, v, sizes)!; assert.ok(g, `${id} ${from}`);
    const sheet = printSheet(g.base, undefined, 15, g);
    for (const it of sheet.items) { assert.equal(it.nest!.length, sizes.length); const ar = it.nest!.map(n => area(n.cut)); for (let i = 1; i < ar.length; i++) assert.ok(ar[i] > ar[i - 1], `${id}/${it.piece.id} ${sizes[i]} > ${sizes[i - 1]}`); }
    const dxf = writeDxf(gradedModel(g)); for (const s of sizes) assert.ok(dxf.includes(`SIZE-${s}`), `${id} DXF ${s}`);
    const drafts = Object.fromEntries(sizes.map((s, i) => [s, g.patterns[i]])); const gr = deriveGrading(drafts, sizes, sizes[Math.floor(sizes.length / 2)]);
    const aama = writeAama(gr, { allSizes: true }); const back = readAama(aama.dxf); assert.deepEqual(back.sizes, sizes, `${id} AAMA sizes`);
    assert.equal(back.graded.pattern.pieces.length, gr.pattern.pieces.length);
  }
});
