// 3D fit room, second round: side-gusset plush, fly-front trousers, princess dress.
//   npm run test:drape
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { softTemplateById, softDefaults, encodeOutline, type Pattern } from '../services/soft/patterns';
import { type Pt } from '../services/soft/geometry';
import { outlineFromStrokes } from '../services/soft/trace';
import { setupDrape, drapeSync } from '../services/soft/drape/drape';
import { seamGap, meshVolume } from '../services/soft/drape/cloth';

const build = (id: string, over: Record<string, unknown> = {}): Pattern => { const t = softTemplateById(id)!; return t.build({ ...softDefaults(t), ...over } as never); };

test('side-gusset plush from a drawn path: gusset seams close and it stuffs toward the planned fill', () => {
  const stroke: Pt[] = Array.from({ length: 80 }, (_, i) => { const t = i / 80 * 2 * Math.PI; return [90 * Math.cos(t), 120 * Math.sin(t)] as Pt; });
  const p = build('plush-drawing', { outline: encodeOutline(outlineFromStrokes([stroke])), height: 240, side: true, gussetW: 60 });
  const s = setupDrape(p); assert.ok(s.model.pieces.some(x => x.pieceId === 'gusset')); assert.equal(s.model.seams.length, 5);
  const v0 = meshVolume(s.model); const sim = drapeSync(s, 1.6); assert.ok(!sim.hasNaN());
  const v = meshVolume(s.model), planned = s.model.pressure!.planned!;
  assert.ok(v0 > 0 && v > planned * 0.8 && v < planned * 1.15, `volume ${v / 1e6} L of ${planned / 1e6} L`);
  s.model.seams.forEach((sm, i) => assert.ok(seamGap(s.model, i) < 10, `${sm.name} gap ${seamGap(s.model, i).toFixed(1)}`));
});

import { buildBody, bakeSdf, measuresForSize } from '../services/soft/drape/avatar';
import { rigFor } from '../services/soft/drape/garment';
const bodyM = buildBody(measuresForSize('M')); const sdfM = bakeSdf(bodyM);

test('trousers and dress rig: every piece is sewn (no loose hang), seam sides pair up', () => {
  for (const [id, over] of [['trousers', {}], ['trousers', { waist: 'fly' }], ['trousers', { size: '6' }], ['dress', {}], ['dress', { bodice: 'princess' }], ['dress', { size: '8', bodice: 'princess' }]] as const) {
    const p = build(id, over); const r = rigFor(p, bodyM); assert.equal(r.kind, 'garment', `${id} ${JSON.stringify(over)}`);
    const ids = new Set(r.placed.map(x => x.id)); for (const sm of r.seams) for (const sd of [...sm.a, ...sm.b]) assert.ok(ids.has(sd.piece), `${sm.name} → ${sd.piece}`);
    for (const pp of r.placed) assert.ok(r.seams.some(sm => [...sm.a, ...sm.b].some(x => x.piece === pp.id)), `${pp.id} is sewn to something`);
  }
});

for (const [id, over, label] of [['trousers', {}, 'elastic trousers'], ['trousers', { waist: 'fly' }, 'fly-front trousers'], ['dress', {}, 'darted dress'], ['dress', { bodice: 'princess' }, 'princess dress']] as const) {
  test(`${label} drapes on the M avatar: stable, seams close`, () => {
    const s = setupDrape(build(id, { size: 'M', ...over }), { body: bodyM, sdf: sdfM, spacing: 30 }); const sim = drapeSync(s, 1.6, { substeps: 10 }, sm => { if (sm.hasNaN()) throw new Error('NaN'); });
    assert.ok(!sim.hasNaN());
    s.model.seams.forEach((sm, i) => { const g = seamGap(s.model, i); assert.ok(g < 15, `${sm.name} gap ${g.toFixed(1)} mm`); });
    // Hangs on the body, not on the floor: the lowest point is near the hem height, the highest near the waist or shoulders.
    let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < s.model.n; i++) { const y = s.model.pos[3 * i + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    assert.ok(y1 > bodyM.y.hip && y1 < bodyM.y.top, `top ${y1}`); assert.ok(y0 > -50, `bottom ${y0}`);
  });
}

test('kids\' fly-front trousers (size 6) and princess dress (size 8) drape on child avatars', () => {
  for (const [id, over, size] of [['trousers', { waist: 'fly' }, '6'], ['dress', { bodice: 'princess' }, '8']] as const) {
    const kid = buildBody(measuresForSize(size)); const s = setupDrape(build(id, { size, ...over }), { body: kid, spacing: 26 }); const sim = drapeSync(s, 1.4, { substeps: 10 });
    assert.ok(!sim.hasNaN()); s.model.seams.forEach((sm, i) => assert.ok(seamGap(s.model, i) < 15, `${id} ${size} ${sm.name} ${seamGap(s.model, i).toFixed(1)}`));
    let y1 = -Infinity; for (let i = 0; i < s.model.n; i++) y1 = Math.max(y1, s.model.pos[3 * i + 1]); assert.ok(y1 > kid.y.hip, `${id} ${size} stays up (${y1})`);
  }
});
