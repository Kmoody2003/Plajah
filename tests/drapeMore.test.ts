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
