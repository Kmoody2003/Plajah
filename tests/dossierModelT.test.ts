import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_T_PARTS, MODEL_T_DISCLAIMER, MODEL_T_PART_IDS } from '../data/dossier/modelTParts';
import { fordDossier } from '../data/dossier/ford';

test('Model T parts: unique ids, label, sentence, finite explode vector', () => {
  assert.equal(new Set(MODEL_T_PART_IDS).size, MODEL_T_PARTS.length, 'no duplicate ids');
  for (const p of MODEL_T_PARTS) {
    assert.ok(p.label.trim().length > 2, p.id);
    assert.ok(p.sentence.trim().length > 20 && p.sentence.trim().endsWith('.'), `${p.id} sentence`);
    assert.equal(p.explode.length, 3, p.id);
    assert.ok(p.explode.every(Number.isFinite), p.id);
    assert.ok(p.claim === null || p.claim.trim().length > 20, `${p.id} claim is null or real text`);
  }
});

test('Model T parts: the drive-line and control parts the exhibit promises are present', () => {
  for (const id of ['frame', 'engine', 'magneto', 'transmission', 'torque-tube', 'rear-axle', 'front-spring', 'rear-spring', 'radiator', 'fuel-tank', 'steering', 'pedals', 'wheels-front', 'wheels-rear', 'body', 'seats', 'fenders', 'running-boards', 'lamps'])
    assert.ok(MODEL_T_PART_IDS.includes(id as never), id);
  assert.match(MODEL_T_DISCLAIMER, /not measured CAD/);
});

test('Model T node is wired into the Ford hall and cites ledger claims', () => {
  const node = fordDossier.rooms.find(r => r.id === 'r3')!.nodes.find(n => n.experience === 'model-t-exploded');
  assert.ok(node, 'r3 has a model-t-exploded node');
  const ids = new Set(fordDossier.ledger.claims.map(c => c.id));
  for (const c of node!.claimIds) assert.ok(ids.has(c), c);
});
