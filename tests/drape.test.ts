// 3D fit room: avatar, cloth stability and seams, plush stuffing, fit analysis, grading, AAMA DXF
// round trip, pattern import, 3D→2D flattening, print mapping, cost per size, fit hazards.
//   npm run test:drape
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { softTemplateById, softDefaults, type Pattern } from '../services/soft/patterns';
import { area, bbox, rect, type Pt } from '../services/soft/geometry';
import { buildBody, bakeSdf, sampleSdf, surfaceNets, measuresForSize, poseFor, sdBody, measuresForAge, limitPose, parseMeasurements, smoothMesh } from '../services/soft/drape/avatar';
import { meshPiece } from '../services/soft/drape/mesh';
import { setupDrape, setupOutfit, drapeSync, sitTestSync, refineDrape, simFor, startSitTest, sitAdvice } from '../services/soft/drape/drape';
import { simulateCantilever, expectedOverhang, rigidityKes, calibrate, stripStiffness, gsmFrom, CANTILEVER_DEG } from '../services/soft/drape/calibrate';
import { fabricById, FABRICS } from '../services/soft/drape/fabrics';
import { buildCloth, constraintValue, K_BEND } from '../services/soft/drape/cloth';
import { seamGap, meshVolume } from '../services/soft/drape/cloth';
import { fitReport, fitMaps, clothGirth } from '../services/soft/drape/fit';
import { deriveGrading, gradePattern, gradePiece, ruleMove, nestSvg, type GradeTable } from '../services/soft/drape/grading';
import { writeAama, readAama, readRul, writeRul } from '../services/soft/drape/aama';
import { importSvg } from '../services/soft/drape/importPattern';
import { flattenRegion } from '../services/soft/drape/flatten';
import { projectDecal, printPieces } from '../services/soft/drape/printMap';
import { costPerSize } from '../services/soft/drape/cost';
import { fitHazards } from '../services/soft/drape/safety';
import { trimHazards, cordEnds } from '../services/soft/drape/trims';

const build = (id: string, over: Record<string, unknown> = {}) => { const t = softTemplateById(id)!; return t.build({ ...softDefaults(t), ...over } as never); };
const bodyM = buildBody(measuresForSize('M')); const sdfM = bakeSdf(bodyM);

test('avatar: measured girths, inside/outside field, outward surface, poses move the limbs', () => {
  const m = measuresForSize('M'); assert.equal(m.chest, 1000); assert.ok(m.height > 1600 && m.height < 1800);
  assert.equal(measuresForSize('4').band, 'child'); assert.ok(measuresForSize('4').height < 1100);
  assert.ok(sampleSdf(sdfM, 0, bodyM.y.chest, 0) < -50, 'chest centre is inside');
  assert.ok(sampleSdf(sdfM, 0, bodyM.y.chest, 400) > 30, 'in front of the chest is outside');
  assert.ok(Math.abs(sampleSdf(sdfM, 50, 1000, 30) - sdBody(bodyM, 50, 1000, 30)) < 6, 'baked field matches the exact one');
  const mesh = surfaceNets(sdfM); assert.ok(mesh.indices.length / 3 > 10000);
  // Triangle winding agrees with the outward normals.
  let agree = 0; const P = mesh.positions, N = mesh.normals, I = mesh.indices;
  for (let t = 0; t < I.length; t += 30) { const a = I[t], b = I[t + 1], c = I[t + 2]; const u = [0, 1, 2].map(k => P[3 * b + k] - P[3 * a + k]), v = [0, 1, 2].map(k => P[3 * c + k] - P[3 * a + k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; agree += Math.sign(n[0] * N[3 * a] + n[1] * N[3 * a + 1] + n[2] * N[3 * a + 2]); }
  assert.ok(agree > 0.9 * (I.length / 30), 'outward winding');
  const t = buildBody(m, poseFor('t-pose')); assert.ok(Math.abs(t.arms[0].end[1] - t.arms[0].root[1]) < 60, 'T-pose arm is level');
  const sit = buildBody(m, poseFor('sitting')); assert.ok(sit.legs[0].mid[2] - sit.legs[0].root[2] > 300, 'sitting thigh points forward');
  const w0 = buildBody(m, poseFor('walk', 0)), w2 = buildBody(m, poseFor('walk', 2)); assert.notDeepEqual(w0.legs[0].mid, w2.legs[0].mid);
});

test('cloth mesh: triangles tile the piece and keep its corners on the boundary', () => {
  const p = build('tee'); const front = p.pieces.find(x => x.id === 'front')!; const m = meshPiece(front.seam, 20);
  const A = m.tris.reduce((s, [a, b, c]) => s + area([m.verts[a], m.verts[b], m.verts[c]]), 0); assert.ok(Math.abs(A - area(front.seam)) / area(front.seam) < 0.02, `area ${A} vs ${area(front.seam)}`);
  for (const q of [[0, 0], [front.seam[1][0], 0]] as Pt[]) assert.ok(m.boundary.some(i => Math.hypot(m.verts[i][0] - q[0], m.verts[i][1] - q[1]) < 1e-6));
});

test('tee drapes stably: no NaN, energy falls while settling, every seam closes', () => {
  const s = setupDrape(build('tee'), { body: bodyM, sdf: sdfM, spacing: 28 }); const E: number[] = []; let peakKE = 0;
  const sim = drapeSync(s, 2.0, { substeps: 10 }, (sm, f) => { if (sm.hasNaN()) throw new Error(`NaN at frame ${f}`); peakKE = Math.max(peakKE, sm.kinetic()); if (f >= 60 && f % 10 === 0) E.push(sm.energy()); });
  assert.ok(!sim.hasNaN());
  assert.ok(sim.kinetic() < peakKE * 0.02, `kinetic ${sim.kinetic()} vs peak ${peakKE}`);
  assert.ok(E[E.length - 1] < E[0], 'total energy lower at rest than after sewing');
  for (let i = 1; i < E.length; i++) assert.ok(E[i] <= E[i - 1] * 1.002, `energy rose at sample ${i}: ${E[i - 1]} → ${E[i]}`);
  s.model.seams.forEach((sm, i) => assert.ok(seamGap(s.model, i) < 12, `${sm.name} gap ${seamGap(s.model, i).toFixed(1)} mm`));
  const rep = fitReport(s, sim); const chest = rep.poms.find(p => p.name === 'Chest')!; assert.ok(chest && chest.ease > 0, 'regular tee has positive chest ease');
});

test('hoodie: body, armhole and hood seams close; the fit report sees what the body cannot fit', () => {
  const s = setupDrape(build('hoodie'), { body: bodyM, sdf: sdfM, spacing: 28 }); const sim = drapeSync(s, 2.2, { substeps: 10 });
  assert.ok(!sim.hasNaN());
  for (const [i, sm] of s.model.seams.entries()) if (/^(Side|Shoulder|Armhole|Hood|Waistband)/.test(sm.name)) assert.ok(seamGap(s.model, i) < 15, `${sm.name} ${seamGap(s.model, i).toFixed(1)}`);
  const maps = fitMaps(s.model, sim, s.sdf); assert.ok(maps.strain.every(Number.isFinite) && maps.pressure.every(x => x >= 0));
  const rep = fitReport(s, sim, maps); assert.ok(rep.score >= 0 && rep.score <= 100); assert.ok(rep.poms.some(p => p.name === 'Bicep'));
  assert.ok(rep.neckOpening! > 0 && rep.sleeveEnd != null);
});

test('plush critter stuffs: volume rises toward the planned fill, seams hold, the sit test runs', () => {
  const s = setupDrape(build('plush-pal', { height: 260 })); const v0 = meshVolume(s.model); const sim = drapeSync(s, 2.0);
  assert.ok(!sim.hasNaN()); const v = meshVolume(s.model); const planned = s.model.pressure!.planned!;
  assert.ok(v > v0 * 1.3 && v > planned * 0.8 && v < planned * 1.1, `volume ${v / 1e6} L of ${planned / 1e6} L planned`);
  assert.ok(seamGap(s.model) < 10, `seam gap ${seamGap(s.model).toFixed(1)}`);
  const rep = fitReport(s, sim); assert.ok(rep.plush && rep.plush.fillPct > 80 && !rep.plush.sitTested); assert.ok(rep.plush.seamLoad! < 1.3, `seam load ${rep.plush.seamLoad}`);
  const sits = sitTestSync(sim, 1.5); assert.equal(typeof sits, 'boolean'); assert.ok(!sim.hasNaN());
  const after = fitReport(s, sim); assert.equal(after.plush!.sitTested, true); assert.equal(after.plush!.dropUpright, sits); assert.equal(typeof after.plush!.sitsUp, 'boolean'); assert.ok(after.plush!.advice!.length >= 1);
  const b = bbox(Array.from({ length: s.model.n }, (_, i) => [s.model.pos[3 * i], s.model.pos[3 * i + 2]] as Pt)); assert.ok(Math.abs(b.x0 + b.x1) < 400, 'no runaway drift');
});

test('grading: rules move grade points by exactly the table increments and reproduce the drafts', () => {
  const sizes = ['XS', 'S', 'M', 'L', 'XL']; const drafts = Object.fromEntries(sizes.map(s => [s, build('hoodie', { size: s })])); const g = deriveGrading(drafts, sizes, 'M');
  for (const target of ['XS', 'L', 'XL']) { const graded = gradePattern(g, target);
    for (const piece of g.pattern.pieces) { const gp = graded.pieces.find(p => p.id === piece.id)!; const drafted = drafts[target].pieces.find(p => p.id === piece.id)!;
      for (const pt of g.points[piece.id]) { const mv = ruleMove(g.table, pt.rule, target);
        assert.equal(gp.seam[pt.index][0], piece.seam[pt.index][0] + mv[0]); assert.equal(gp.seam[pt.index][1], piece.seam[pt.index][1] + mv[1]);
        if (drafted.seam.length === piece.seam.length) assert.ok(Math.hypot(gp.seam[pt.index][0] - drafted.seam[pt.index][0], gp.seam[pt.index][1] - drafted.seam[pt.index][1]) < 0.01, `${piece.id}@${pt.index} ${target}`); } } }
  // A hand-written table: one corner, +5/+2 per break up, exact sums down and up.
  const table: GradeTable = { name: 't', sizes: ['S', 'M', 'L', 'XL'], base: 'M', units: 'mm', rules: [{ id: 7, deltas: [[5, 2], [6, 3], [7, 4]] }] };
  const sq = { id: 'sq', name: 'Square', seam: rect(0, 0, 100, 100), allowance: 10, cut: 1, fabric: 'main' as const, grain: [[50, 20], [50, 80]] as [Pt, Pt] };
  assert.deepEqual(gradePiece(sq, [{ index: 2, rule: 7 }], table, 'XL').seam[2], [113, 107]); assert.deepEqual(gradePiece(sq, [{ index: 2, rule: 7 }], table, 'S').seam[2], [95, 98]);
  assert.ok(nestSvg(g).includes('<path'));
});

test('AAMA / ASTM D6673 DXF + RUL round-trip: pieces, grain, notches, fold, grade points, sizes', () => {
  const sizes = ['S', 'M', 'L']; const drafts = Object.fromEntries(sizes.map(s => [s, build('hoodie', { size: s })])); const g = deriveGrading(drafts, sizes, 'M');
  const { dxf, rul } = writeAama(g, { style: 'Test hoodie', date: new Date('2026-11-08T12:00:00Z') });
  assert.match(dxf, /AC1009/); assert.match(dxf, /Piece Name: Front/); assert.match(rul, /SAMPLE SIZE: M/);
  const r = readAama(dxf, rul); const back = r.graded;
  assert.deepEqual(back.table.sizes, sizes); assert.equal(back.table.base, 'M'); assert.deepEqual(back.table.rules, g.table.rules);
  assert.equal(back.pattern.pieces.length, g.pattern.pieces.length);
  for (const p of g.pattern.pieces) { const q = back.pattern.pieces.find(x => x.id === p.id)!; assert.ok(q, p.id);
    assert.equal(q.name, p.name); assert.equal(q.cut, p.cut); assert.equal(q.fold, p.fold); assert.equal(!!q.pair, !!p.pair); assert.equal(q.seam.length, p.seam.length);
    p.seam.forEach((pt, i) => assert.ok(Math.hypot(pt[0] - q.seam[i][0], pt[1] - q.seam[i][1]) < 0.002));
    assert.ok(Math.hypot(q.grain[0][0] - p.grain[0][0], q.grain[0][1] - p.grain[0][1]) < 0.002);
    for (const n of p.notches ?? []) assert.ok((q.notches ?? []).some(m => Math.hypot(m[0] - n[0], m[1] - n[1]) < 0.5), `notch ${p.id}`);
    assert.deepEqual(back.points[p.id], g.points[p.id]); }
  // Graded sizes from the read-back file match the original's.
  const a = gradePattern(g, 'L'), b = gradePattern(back, 'L'); a.pieces.forEach((p, k) => p.seam.forEach((pt, i) => assert.ok(Math.hypot(pt[0] - b.pieces[k].seam[i][0], pt[1] - b.pieces[k].seam[i][1]) < 0.01)));
  // Multi-size DXF without a RUL derives the same moves.
  const all = readAama(writeAama(g, { allSizes: true }).dxf); assert.deepEqual(all.sizes, sizes); const c = gradePattern(all.graded, 'S'), d = gradePattern(g, 'S');
  d.pieces.forEach((p, k) => p.seam.forEach((pt, i) => assert.ok(Math.hypot(pt[0] - c.pieces[k].seam[i][0], pt[1] - c.pieces[k].seam[i][1]) < 0.02)));
  assert.deepEqual(readRul(writeRul(g.table)).rules, g.table.rules);
});

test('Seamly2D/Valentina-style SVG import: cut + seam outlines pair into named pieces', () => {
  const sq = (x: number, y: number, w: number, h: number) => `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="300mm" viewBox="0 0 400 300"><g id="front"><path d="${sq(10, 10, 120, 200)}"/><path d="${sq(20, 20, 100, 180)}"/><text x="50" y="100">Front</text></g>
    <g transform="translate(200,0)"><path d="${sq(10, 10, 80, 120)}"/><path d="M20,20 L80,20 C85,60 85,80 80,120 L20,120 Z" transform="translate(0,0) scale(1)"/><text x="40" y="60">Sleeve</text></g></svg>`;
  const r = importSvg(svg); assert.equal(r.pattern.pieces.length, 2);
  const f = r.pattern.pieces.find(p => p.name === 'Front')!; assert.ok(f); assert.equal(Math.round(area(f.seam)), 100 * 180); assert.equal(f.allowance, 10);
  assert.ok(r.pattern.pieces.some(p => p.name === 'Sleeve'));
});

test('3D → 2D: a panel drawn on the front torso flattens with low distortion', () => {
  const mesh = surfaceNets(sdfM); const y0 = bodyM.y.waist + 30, y1 = bodyM.y.chest + 60;
  const loop: Array<[number, number, number]> = [[-120, y0, 0], [120, y0, 0], [120, y1, 0], [-120, y1, 0]].map(([x, y]) => { let z = 400; while (z > 0 && sampleSdf(sdfM, x, y, z) > 0) z -= 2; return [x, y, z] as [number, number, number]; });
  const r = flattenRegion(mesh, bodyM, loop, { ease: 0 })!; assert.ok(r, 'flattened'); assert.ok(r.distortion < 0.05, `distortion ${r.distortion}`);
  const b = bbox(r.piece.seam); assert.ok(b.h > (y1 - y0) * 0.9 && b.h < (y1 - y0) * 1.25, `height ${b.h} (surface length over the chest)`); assert.ok(b.w > 240, `width ${b.w} follows the curve round the body`);
});

test('print placed on the chest maps back to the front piece only', () => {
  const s = setupDrape(build('tee'), { body: bodyM, sdf: sdfM, spacing: 28 }); drapeSync(s, 1.2, { substeps: 8 });
  let best = -1, bz = -Infinity; const fr = s.model.pieces.find(p => p.id === 'front')!; for (let i = fr.v0; i < fr.v0 + fr.vn; i++) { const y = s.model.pos[3 * i + 1]; if (Math.abs(y - bodyM.y.chest) < 40 && Math.abs(s.model.pos[3 * i]) < 40 && s.model.pos[3 * i + 2] > bz) { bz = s.model.pos[3 * i + 2]; best = i; } }
  const c: [number, number, number] = [s.model.pos[3 * best], s.model.pos[3 * best + 1], s.model.pos[3 * best + 2]];
  const pr = projectDecal(s.model, { center: c, normal: [0, 0, 1], width: 200, height: 200, rotation: 0 }); const pp = printPieces(s.model, pr);
  assert.deepEqual(pp.map(p => p.id), ['front']); assert.ok(pp[0].tris.length > 10); assert.equal(pp[0].mirrored, false);
});

test('cost per size: fabric grows with the size, waste and cost are reported', () => {
  const t = softTemplateById('hoodie')!; const rows = costPerSize({ template: t, params: softDefaults(t) }, ['XS', 'M', '3XL']);
  assert.ok(rows[0].metres <= rows[1].metres && rows[1].metres <= rows[2].metres); assert.ok(rows.every(r => r.cost > 0 && r.wastePct > 0 && r.wastePct < 80));
});

test('fit hazards: tight neck on a child blocks, loose children\'s sleepwear blocks, adults are spared', () => {
  const kid = build('hoodie', { size: '4', sleepwear: true }) as Pattern; const body = buildBody(measuresForSize('4'));
  const s = { body } as never; const base = { poms: [{ name: 'Chest', body: 580, garment: 700, ease: 120 }], score: 50, verdict: [], tightPct: 0, loosePct: 30, maxPressure: 1, meanStrain: 0, maxStrain: 0, seamGap: 0, neckPressure: 2.5, neckOpening: 600, sleeveEnd: 40 };
  const hz = fitHazards(kid, 'child', base, s); const ids = hz.map(h => h.id);
  assert.ok(ids.includes('fit-neck-tight') && hz.find(h => h.id === 'fit-neck-tight')!.block); assert.ok(ids.includes('fit-sleepwear-loose')); assert.ok(ids.includes('fit-sleepwear-long'));
  const adult = fitHazards(build('hoodie') as Pattern, 'adult', { ...base, neckPressure: 2.5 }, { body: bodyM } as never); assert.ok(!adult.some(h => h.id === 'fit-neck-tight' || h.id.startsWith('fit-sleepwear')));
});

test('layering: a tee under a hoodie stays underneath, outer ease is measured to the tee', () => {
  const s = setupOutfit([build('tee'), build('hoodie')], { body: bodyM, sdf: sdfM, spacing: 28 }); const m = s.model; assert.equal(m.layers, 2);
  const sim = drapeSync(s, 2.0, { substeps: 10 }); assert.ok(!sim.hasNaN());
  let bad = 0, tot = 0;
  for (let i = 0; i < m.n; i++) { if (m.layer[i] !== 1) continue; const di = sampleSdf(sdfM, m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]); let worst = Infinity;
    for (let j = 0; j < m.n; j++) { if (m.layer[j] !== 0) continue; const dx = m.pos[3 * i] - m.pos[3 * j], dy = m.pos[3 * i + 1] - m.pos[3 * j + 1], dz = m.pos[3 * i + 2] - m.pos[3 * j + 2]; if (dx * dx + dy * dy + dz * dz < 144) worst = Math.min(worst, di - sampleSdf(sdfM, m.pos[3 * j], m.pos[3 * j + 1], m.pos[3 * j + 2])); }
    if (worst < Infinity) { tot++; if (worst < 0) bad++; } }
  assert.ok(tot > 100 && bad / tot < 0.03, `${bad} of ${tot} overlapping hoodie vertices are inside the tee`);
  for (const [k, sm] of m.seams.entries()) if (/(Side|Shoulder|Armhole)/.test(sm.name)) assert.ok(seamGap(m, k) < 15, `${sm.name} ${seamGap(m, k).toFixed(1)}`);
  const maps = fitMaps(m, sim, s.sdf); let gIn = 0, gBody = 0, k = 0;
  for (let i = 0; i < m.n; i++) if (m.layer[i] === 1) { gIn += maps.gap[i]; gBody += Math.max(0, sampleSdf(sdfM, m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]) - m.offset[i]); k++; }
  assert.ok(gIn / k < gBody / k - 2, `hoodie gap to tee ${(gIn / k).toFixed(1)} vs to body ${(gBody / k).toFixed(1)}`);
  const hood = fitReport(s, sim, maps, 'regular', 1), tee = fitReport(s, sim, maps, 'regular', 0); assert.ok(hood.poms.length && tee.poms.length);
});

test('layering: leggings under an elastic-waist skirt on a child, elastic gathers the waist', () => {
  const kid = buildBody(measuresForSize('6')); const s = setupOutfit([build('leggings', { size: '6' }), build('skirt', { waist: 560, hip: 720, len: 300 })], { body: kid, spacing: 22 });
  assert.equal(s.model.gathers.length, 4); const sim = drapeSync(s, 1.8, { substeps: 10 }); assert.ok(!sim.hasNaN());
  const m = s.model; const skirt = new Set(m.pieces.map((p, i) => (p.garment === 1 ? i : -1)).filter(i => i >= 0));
  let top = -Infinity; for (let i = 0; i < m.n; i++) if (m.garment[i] === 1) top = Math.max(top, m.pos[3 * i + 1]);
  const g = clothGirth(m, [0, top - 15, 0], [0, 1, 0], skirt); const panel = 4 * Math.max(...build('skirt', { waist: 560, hip: 720, len: 300 }).pieces[0].seam.map(q => q[0]));
  assert.ok(g < panel * 0.8, `gathered waist ${g.toFixed(0)} vs flat ${panel.toFixed(0)}`);
  // The crotch point is a four-way junction (inseam + both crotch seams); it sits up to ~2 cm open on snug leggings.
  for (const [k, sm] of m.seams.entries()) assert.ok(seamGap(m, k) < (/Inseam/.test(sm.name) ? 26 : 20), `${sm.name} ${seamGap(m, k).toFixed(1)}`);
});

test('bending: flat cloth has zero hinge energy; the cantilever matches Peirce (41.5°) across a 40× stiffness range', () => {
  const f = fabricById('poplin')!; const m = buildCloth([{ id: 'p', name: 'p', pieceId: 'p', role: 'other', seam: rect(0, 0, 200, 120), fabric: f, grainAngle: 0, map: q => [q[0], 300, q[1]] }], [], 12);
  for (let c = 0; c < m.nc; c++) if (m.kind[c] === K_BEND) assert.ok(Math.abs(constraintValue(m, c)) < 1e-4); // float32 positions
  for (const id of ['jersey', 'felt', 'denim']) { const fb = fabricById(id)!; const ang = simulateCantilever(fb, expectedOverhang(fb), 2.5); assert.ok(Math.abs(ang - CANTILEVER_DEG) < 6, `${id}: ${ang.toFixed(1)}° vs ${CANTILEVER_DEG}°`); }
});

test('home fabric tests calibrate the solver: weight, strip stretch and cantilever maths round-trip', () => {
  assert.equal(Math.round(gsmFrom(1.8, 10, 10)), 180);
  const k = stripStiffness(50, 100, 110, 127.4); assert.ok(Math.abs(k - 250) < 1, `stiffness ${k}`); // 1.25 N over 5 cm at 10% → 250 N/m
  for (const f of ['jersey', 'denim', 'satin', 'felt'].map(id => fabricById(id)!)) assert.ok(Math.abs(rigidityKes(expectedOverhang(f), f.gsm) - f.bend) / f.bend < 1e-9);
  const cal = calibrate({ name: 'Linen', square: { grams: 1.9, widthCm: 10, heightCm: 10 }, warp: { widthMm: 50, gaugeMm: 100, stretchedMm: 101, massG: 200 }, weft: { widthMm: 50, gaugeMm: 100, stretchedMm: 102, massG: 200 }, cantilever: { overhangMm: 70 } });
  assert.equal(cal.fabric.gsm, 190); assert.ok(cal.fabric.stretchWarp < cal.fabric.stretchWeft); assert.ok(Math.abs(rigidityKes(70, 190) - cal.fabric.bend) < 1e-3); assert.equal(cal.notes.length, 4);
});

test('adaptive refinement adds a fine mesh at the folds, stays stable, seams and the sewn-on pocket hold', () => {
  const s = setupDrape(build('hoodie'), { body: bodyM, sdf: sdfM, spacing: 26 }); assert.ok(s.model.pieces.some(p => p.id === 'pocket'));
  const sim = drapeSync(s, 1.6, { substeps: 10, iterations: 2 }); const r = refineDrape(s, { hMin: 6 }); assert.ok(r.model.n > s.model.n * 1.2, `${s.model.n} → ${r.model.n}`);
  let minEdge = Infinity; for (let c = 0; c < r.model.nc; c++) if (r.model.kind[c] === 0) minEdge = Math.min(minEdge, r.model.rest[c]); assert.ok(minEdge > 1.5, `shortest edge ${minEdge}`);
  const sim2 = simFor(r, { substeps: 10, iterations: 2 }); sim2.t = sim.t; for (let f = 0; f < 30; f++) sim2.frame(); assert.ok(!sim2.hasNaN());
  for (const [k, sm] of r.model.seams.entries()) if (/(Side|Shoulder|Armhole|Pocket)/.test(sm.name)) assert.ok(seamGap(r.model, k) < 12, `${sm.name} ${seamGap(r.model, k).toFixed(1)}`);
});

test('fabric library: every preset states its source, and its rigidity is exactly D = w·c³ from its bending length', () => {
  for (const f of FABRICS) { assert.ok(f.source && f.source.length > 60, `${f.id} source`); assert.ok(f.bendingLength! > 5, `${f.id} bending length`); assert.ok(f.finish, `${f.id} finish`);
    assert.ok(Math.abs(rigidityKes(2 * f.bendingLength!, f.gsm) - f.bend) < 0.001, `${f.id} rigidity`); }
});

test('avatars: shape variations, ages, joint limits, measurement import, smoother skin that keeps its size', () => {
  const base = measuresForSize('M'); const z = (b: ReturnType<typeof buildBody>) => { let f = -Infinity; for (let zz = 0; zz < 400; zz += 1) if (sdBody(b, 0, b.y.chest, zz) < 0) f = zz; return f; };
  const plain = buildBody(base), busty = buildBody({ ...base, shape: { bust: 80 } }); assert.ok(z(busty) - z(plain) > 30, `bust adds front depth ${z(busty) - z(plain)}`);
  const seat = buildBody({ ...base, shape: { seat: 80 } }); let back0 = 0, back1 = 0; for (let zz = 0; zz > -400; zz--) { if (sdBody(plain, 0, plain.y.hip, zz) < 0) back0 = zz; if (sdBody(seat, 0, seat.y.hip, zz) < 0) back1 = zz; } assert.ok(back0 - back1 > 30);
  const long = buildBody({ ...base, shape: { torso: 60 } }); assert.ok(long.y.crotch < plain.y.crotch - 50 && Math.abs(long.y.top - plain.y.top) < 1e-6);
  const sloped = buildBody({ ...base, shape: { shoulderSlope: 30 } }); assert.ok(sloped.arms[0].root[1] < plain.arms[0].root[1] - 10);
  const ages = [2, 5, 9, 14].map(measuresForAge); for (let i = 1; i < ages.length; i++) assert.ok(ages[i].height > ages[i - 1].height && ages[i].chest > ages[i - 1].chest); assert.ok(ages.every(a => a.band === 'child'));
  const lim = limitPose({ ...poseFor('a-pose'), elbow: [200, -30], knee: [170, 10] }); assert.deepEqual(lim.elbow, [145, 0]); assert.deepEqual(lim.knee, [140, 10]);
  const r = parseMeasurements('Chest: 96 cm\nwaist, 31 in\nhip = 1020 mm\nshoulder slope: 24°'); assert.equal(r.chest, 960); assert.ok(Math.abs(r.waist! - 787.4) < 0.1); assert.equal(r.hip, 1020); assert.equal(r.shape?.shoulderSlope, 24);
  assert.equal(parseMeasurements('{"height": 168, "inseam": "76 cm"}').height, 1680);
  const raw = surfaceNets(sdfM), smooth = smoothMesh(raw, sdfM, 3); let dev = 0; for (let i = 0; i < smooth.positions.length; i += 30) dev += Math.abs(sampleSdf(sdfM, smooth.positions[i], smooth.positions[i + 1], smooth.positions[i + 2])); assert.ok(dev / (smooth.positions.length / 30) < 1.5, 'stays on the body surface');
});

test('sit advice: a toy whose balance point overhangs its base gets pellet grams and a deeper base', () => {
  const s = setupDrape(build('plush-pal', { height: 240 })); const sim = drapeSync(s, 1.5); startSitTest(sim);
  // Push the stuffed shape's balance point forward by moving the head region 60 mm to the front.
  const m = s.model; const X = (sim as unknown as { stuffedPos: Float32Array }).stuffedPos; for (let i = 0; i < m.n; i++) if (X[3 * i + 1] > 120) X[3 * i + 2] += 120;
  const a = sitAdvice(s, sim); assert.equal(a.direction, 'front'); assert.ok(a.pelletGrams > 0 && a.widenBaseMm > 0); assert.ok(a.text.join(' ').includes('pellets'));
});

test('trims: a hood drawcord hangs and is blocked on children, cord ends and small buttons are flagged, a zip stays stable', () => {
  const h = build('hoodie', { drawstring: true }) as Pattern; const s = setupDrape(h, { body: bodyM, sdf: sdfM, spacing: 26 }); assert.equal(s.trimState?.cords.length, 1);
  const sim = drapeSync(s, 1.5, { substeps: 10 }); assert.ok(!sim.hasNaN()); const [e0, e1] = cordEnds(s.model, s.trimState!.cords[0]); assert.ok(e0 > 120 && e1 > 120, `ends ${e0} ${e1}`);
  assert.deepEqual(trimHazards(h, 'adult', s.trimState!, s.model).filter(x => x.severity === 'critical'), []);
  assert.ok(trimHazards(h, 'child', s.trimState!, s.model).some(x => x.id === 'trim-cord-hood-child' && x.block));
  const lg = build('leggings', { size: '6' }) as Pattern; const ls = setupDrape(lg, { spacing: 24, trims: [{ kind: 'drawcord', where: 'waist', endMm: 120, label: 'Waist cord', casing: [{ piece: 'leg-L', from: [-150, 330], to: [150, 330] }] }, { kind: 'button', piece: 'leg-L', at: [0, 300], diameterMm: 15 }] });
  const lsim = drapeSync(ls, 1.0, { substeps: 8 }); assert.ok(!lsim.hasNaN()); const ids = trimHazards(lg, 'under3', ls.trimState!, ls.model).map(x => x.id); assert.ok(ids.includes('trim-small-part') && ids.includes('trim-cord-ends'));
  const before = setupDrape(build('hoodie'), { body: bodyM, sdf: sdfM, spacing: 26 }).model.mass.reduce((a, b) => a + b, 0);
  const z = setupDrape(build('hoodie'), { body: bodyM, sdf: sdfM, spacing: 26, trims: [{ kind: 'zip', piece: 'front', from: [0, 0], to: [0, 600] }] }); assert.ok(z.model.mass.reduce((a, b) => a + b, 0) > before + 10);
  const zs = drapeSync(z, 1.0, { substeps: 8 }); assert.ok(!zs.hasNaN());
});
