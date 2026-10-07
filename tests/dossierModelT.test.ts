import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_T_PARTS, MODEL_T_DISCLAIMER, MODEL_T_PART_IDS, MODEL_T_GROUP_LABELS } from '../data/dossier/modelTParts';
import { fordDossier } from '../data/dossier/ford';
import { validateDossier } from '../services/dossier/dossierTypes';

test('Model T parts: unique ids, label, sentence, finite explode vector', () => {
  assert.equal(new Set(MODEL_T_PART_IDS).size, MODEL_T_PARTS.length, 'no duplicate ids');
  assert.equal(new Set(MODEL_T_PARTS.map(p => p.label)).size, MODEL_T_PARTS.length, 'no duplicate labels');
  for (const p of MODEL_T_PARTS) {
    assert.ok(p.label.trim().length > 2, p.id);
    assert.ok(p.sentence.trim().length > 20 && p.sentence.trim().endsWith('.'), `${p.id} sentence`);
    assert.equal(p.explode.length, 3, p.id);
    assert.ok(p.explode.every(Number.isFinite), p.id);
    assert.ok(p.claim === null || (p.claim.trim().length > 20 && p.claim.trim().endsWith('.')), `${p.id} claim is null or real text`);
    assert.ok(p.group in MODEL_T_GROUP_LABELS, `${p.id} has a known group`);
  }
});

test('Model T parts: the drive-line, control, body and lamp parts the exhibit promises are present', () => {
  const promised = [
    // original set
    'frame', 'engine', 'magneto', 'transmission', 'torque-tube', 'rear-axle', 'front-axle', 'front-spring', 'rear-spring', 'radiator', 'fuel-tank',
    'steering', 'pedals', 'wheels-front', 'wheels-rear', 'body', 'seats', 'fenders', 'running-boards', 'hood',
    // added after the audit against the 1919 Ford Manual and The Henry Ford's 1913 touring car record
    'crank', 'headlamps', 'side-lamps', 'tail-lamp', 'windshield', 'doors', 'top-bows', 'top-cover', 'muffler', 'exhaust-manifold',
    'carburetor', 'front-radius-rod', 'rear-radius-rods', 'brake-drums', 'horn', 'column-levers', 'hand-lever', 'fan', 'radiator-hoses', 'coil-box',
  ];
  for (const id of promised) assert.ok(MODEL_T_PART_IDS.includes(id as never), id);
  assert.equal(MODEL_T_PARTS.length, promised.length, 'every part is listed here, so a new part needs a test line');
  assert.match(MODEL_T_DISCLAIMER, /not measured CAD/);
});

test('Model T parts: all four wheels are modelled (two front, two rear) and only the top parts are optional', () => {
  const byId = new Map(MODEL_T_PARTS.map(p => [p.id, p]));
  assert.match(byId.get('wheels-front')!.label, /two/i);
  assert.match(byId.get('wheels-rear')!.label, /two/i);
  // the front pair moves forward and the rear pair backward, so the four wheels separate along the car
  assert.ok(byId.get('wheels-front')!.explode[0] > 0 && byId.get('wheels-rear')!.explode[0] < 0);
  const optional = MODEL_T_PARTS.filter(p => p.optional).map(p => p.id).sort();
  assert.deepEqual(optional, ['top-bows', 'top-cover']);
});

test('Model T parts: exploded positions do not stack two different parts on the same spot', () => {
  const key = (p: (typeof MODEL_T_PARTS)[number]) => p.explode.join(',');
  // wheels, axles and drums intentionally share an offset (they sit on the same axle); body and doors share one too
  const shared = new Set(['front-axle', 'wheels-front', 'rear-axle', 'brake-drums', 'wheels-rear', 'body', 'doors']);
  const seen = new Map<string, string>();
  for (const p of MODEL_T_PARTS.filter(p => !shared.has(p.id))) {
    assert.ok(!seen.has(key(p)), `${p.id} has the same explode vector as ${seen.get(key(p))}`);
    seen.set(key(p), p.id);
  }
});

test('Model T node is wired into the Ford hall and cites ledger claims', () => {
  const node = fordDossier.rooms.find(r => r.id === 'r3')!.nodes.find(n => n.experience === 'model-t-exploded');
  assert.ok(node, 'r3 has a model-t-exploded node');
  const ids = new Set(fordDossier.ledger.claims.map(c => c.id));
  for (const c of node!.claimIds) assert.ok(ids.has(c), c);
  for (const c of ['c-modelt-controls', 'c-modelt-start-coils', 'c-modelt-fuel-cooling', 'c-modelt-radius-rods', 'c-modelt-lamps', 'c-modelt-touring', 'c-modelt-top'])
    assert.ok(node!.claimIds.includes(c), `node cites ${c}`);
});

test('Model T ledger additions cite real, fetched sources and the Ford dossier still validates', () => {
  const sources = new Map(fordDossier.ledger.sources.map(s => [s.id, s]));
  for (const id of ['s-ford-manual-1919', 's-thf-touring-1913', 's-wiki-modelt-engine']) {
    const s = sources.get(id);
    assert.ok(s, id);
    assert.match(s!.url, /^https:\/\//, id);
  }
  const mt = fordDossier.ledger.claims.filter(c => c.id.startsWith('c-modelt-'));
  for (const c of mt) assert.ok(c.sourceIds.length > 0 && c.text.trim().length > 20, c.id);
  const errors = validateDossier(fordDossier).filter(i => i.severity === 'error');
  assert.deepEqual(errors, []);
});
