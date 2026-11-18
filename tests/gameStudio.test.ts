// Game Studio spine (docs/game-studio-unified-plan.md Phase 0): project schema, validator, ops + undo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from '../services/gamestudio/validate';
import { applyOp, describeOp, History, OpError, type Op } from '../services/gamestudio/ops';
import { effectiveLook, effectiveMarkers, ownsKind, type LevelDefaults } from '../services/gamestudio/schema';
import { newProjectFor, runtimeUrl, RUNTIMES, takeOverOp, isGameMessage } from '../services/gamestudio/runtime';

const fresh = () => newProjectFor('rift-realm', 'Test Arena', 1000);
const defaults: LevelDefaults = {
  module: 'rift-realm.shrine', name: 'Cyber-Forest Shrine',
  markers: [
    { id: 'spawn-a', kind: 'spawn', team: 'a', pos: [-15, 0.1, 0], yaw: 1.57 },
    { id: 'spawn-b', kind: 'spawn', team: 'b', pos: [15, 0.1, 0], yaw: -1.57 },
    { id: 'enemy-0', kind: 'enemySpot', pos: [0, 0.1, 15.8] },
    { id: 'cp-B', kind: 'controlPoint', name: 'Power Node', pos: [0, 0.25, 0], radius: 3 },
  ],
  zones: [], look: { exposure: 1.15, far: 260 },
};

test('new Rift Realm project validates, one level per arena', () => {
  const p = fresh();
  const v = validateProject(p);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.deepEqual(p.levels.map(l => l.module.id), ['rift-realm.shrine', 'rift-realm.glacial', 'rift-realm.volcanic']);
  assert.equal(p.startLevel, 'shrine');
  assert.equal(p.template, 'arena-shooter');
});

test('validator catches broken files with readable paths', () => {
  assert.equal(validateProject(null).ok, false);
  const p: any = fresh();
  p.levels[0].markers.push({ id: 'x', kind: 'portal', pos: [0, 0] });
  p.levels[0].markers.push({ id: 'x', kind: 'spawn', pos: [0, 0, 0], team: 'a' });
  p.levels[1].id = 'shrine';
  p.startLevel = 'nowhere';
  const v = validateProject(p);
  const paths = v.errors.map(e => e.path);
  assert.ok(paths.includes('levels[0].markers[0].kind'));
  assert.ok(paths.includes('levels[0].markers[0].pos'));
  assert.ok(paths.includes('levels[0].markers[1].id'), 'duplicate marker id');
  assert.ok(paths.includes('levels[1].id'), 'duplicate level id');
  assert.ok(paths.includes('startLevel'));
});

test('validator warns (does not block) on far-away positions and missing team', () => {
  const p = fresh();
  p.levels[0].markers.push({ id: 's', kind: 'spawn', pos: [9000, 0, 0] });
  const v = validateProject(p);
  assert.ok(v.ok);
  assert.ok(v.warnings.some(w => w.path === 'levels[0].markers[0].pos'));
  assert.ok(v.warnings.some(w => w.path === 'levels[0].markers[0].team'));
});

test('every op undoes exactly (applyOp(inverse) returns the original)', () => {
  const p0 = fresh();
  const ops: Op[] = [
    { op: 'setProjectName', name: 'Renamed' },
    { op: 'addMarker', levelId: 'shrine', marker: { id: 'p1', kind: 'pickup', pos: [1, 0, 2], radius: 1 } },
    { op: 'setLook', levelId: 'shrine', look: { exposure: 0.9 } },
    { op: 'putZone', levelId: 'glacial', zone: { id: 'h', kind: 'hazardBelow', y: -20 } },
    { op: 'putRule', levelId: 'shrine', rule: { id: 'r1', enabled: true, when: { event: 'enter', zone: 'gate' }, if: [], do: [{ action: 'startWave', wave: 2 }] } },
    { op: 'putInstance', levelId: 'shrine', instance: { id: 'i1', prefab: 'kit.lantern', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] } },
    { op: 'setStartLevel', levelId: 'volcanic' },
    { op: 'renameLevel', levelId: 'glacial', name: 'Ice' },
  ];
  for (const o of ops) {
    const { project, inverse } = applyOp(p0, o);
    assert.notDeepEqual(project, p0, `${o.op} changed nothing`);
    assert.deepEqual(applyOp(project, inverse).project, p0, `${o.op} did not undo cleanly`);
  }
});

test('setLook with undefined clears a field, and undo puts it back', () => {
  const p1 = applyOp(fresh(), { op: 'setLook', levelId: 'shrine', look: { exposure: 0.8, far: 300 } }).project;
  const { project, inverse } = applyOp(p1, { op: 'setLook', levelId: 'shrine', look: { far: undefined } });
  assert.deepEqual(project.levels[0].look, { exposure: 0.8 });
  assert.deepEqual(applyOp(project, inverse).project.levels[0].look, { exposure: 0.8, far: 300 });
});

test('removing the start level moves the start, undo restores both', () => {
  const p0 = fresh();
  const { project, inverse } = applyOp(p0, { op: 'removeLevel', levelId: 'shrine' });
  assert.equal(project.startLevel, 'glacial');
  assert.deepEqual(applyOp(project, inverse).project, p0);
});

test('ops refuse bad edits instead of corrupting the file', () => {
  const p = fresh();
  assert.throws(() => applyOp(p, { op: 'removeMarker', levelId: 'shrine', markerId: 'nope' }), OpError);
  assert.throws(() => applyOp(p, { op: 'setProjectName', name: '  ' }), OpError);
  assert.throws(() => applyOp(p, { op: 'updateMarker', levelId: 'void', markerId: 'x', patch: {} }), OpError);
  const one = { ...p, levels: [p.levels[0]] };
  assert.throws(() => applyOp(one, { op: 'removeLevel', levelId: 'shrine' }), OpError);
});

test('module defaults show until the project takes a kind over; take-over copies every marker of that kind', () => {
  const p = fresh();
  const lvl = p.levels[0];
  assert.equal(effectiveMarkers(lvl, defaults).length, 4);
  assert.equal(ownsKind(lvl, 'spawn'), false);
  const take = takeOverOp(lvl, defaults, 'spawn')!;
  assert.ok(take);
  const p2 = applyOp(p, take).project;
  assert.equal(ownsKind(p2.levels[0], 'spawn'), true);
  assert.equal(takeOverOp(p2.levels[0], defaults, 'spawn'), null, 'already owned');
  const p3 = applyOp(p2, { op: 'updateMarker', levelId: 'shrine', markerId: 'spawn-a', patch: { pos: [-10, 0.1, 2] } }).project;
  const eff = effectiveMarkers(p3.levels[0], defaults);
  assert.deepEqual(eff.find(m => m.id === 'spawn-a')!.pos, [-10, 0.1, 2], 'project wins for spawns');
  assert.deepEqual(eff.find(m => m.id === 'spawn-b')!.pos, [15, 0.1, 0], 'other spawn copied unchanged');
  assert.ok(eff.find(m => m.id === 'cp-B'), 'control points still come from the module');
  assert.deepEqual(defaults.markers[0].pos, [-15, 0.1, 0], 'take-over must not alias the defaults');
  assert.deepEqual(effectiveLook(p3.levels[0], defaults), { exposure: 1.15, far: 260 });
});

test('history: undo/redo, sentences, drags merge into one step', () => {
  let t = 0;
  const h = new History(fresh(), () => t);
  h.apply(takeOverOp(h.project.levels[0], defaults, 'spawn')!);
  t = 1000;
  for (let i = 1; i <= 5; i++) { h.apply({ op: 'updateMarker', levelId: 'shrine', markerId: 'spawn-a', patch: { pos: [-15 + i, 0.1, 0] } }); t += 50; }
  assert.equal(h.entries.length, 2, 'five drag frames = one step');
  assert.match(h.entries[1].label, /^Team A spawn in Cyber-Forest Shrine: moved to -10, 0\.1, 0$/);
  assert.match(h.entries[0].label, /Took over spawns in Cyber-Forest Shrine \(2\)/);
  h.undo();
  assert.deepEqual(h.project.levels[0].markers.find(m => m.id === 'spawn-a')!.pos, [-15, 0.1, 0], 'one undo returns to before the drag');
  h.redo();
  assert.deepEqual(h.project.levels[0].markers.find(m => m.id === 'spawn-a')!.pos, [-10, 0.1, 0]);
  h.undo(); h.undo();
  assert.equal(ownsKind(h.project.levels[0], 'spawn'), false);
  assert.equal(h.canUndo, false);
  assert.ok(validateProject(h.project).ok);
});

test('a drag that starts on a module marker (take-over + move) is one undo step', () => {
  let t = 0;
  const h = new History(fresh(), () => t);
  const lvl = h.project.levels[0];
  const move = (x: number): Op => ({ op: 'updateMarker', levelId: 'shrine', markerId: 'cp-B', patch: { pos: [x, 0.25, 0] } });
  h.apply({ op: 'batch', label: 'Moved Power Node', ops: [takeOverOp(lvl, defaults, 'controlPoint')!, move(1)] });
  for (let x = 2; x <= 6; x++) { t += 40; h.apply(move(x)); }
  assert.equal(h.entries.length, 1);
  assert.equal(h.entries[0].label, 'Power Node in Cyber-Forest Shrine: moved to 6, 0.3, 0', 'the step reads as where the drag ended');
  assert.deepEqual(h.project.levels[0].markers[0].pos, [6, 0.25, 0]);
  h.undo();
  assert.equal(ownsKind(h.project.levels[0], 'controlPoint'), false, 'undo returns the kind to the module');
  h.redo();
  assert.deepEqual(h.project.levels[0].markers[0].pos, [6, 0.25, 0], 'redo lands on the last drag position');
});

test('batch undoes as one step and reads as its label', () => {
  const h = new History(fresh());
  h.apply({ op: 'batch', label: 'Aria placed two pickups', ops: [
    { op: 'addMarker', levelId: 'shrine', marker: { id: 'a', kind: 'pickup', pos: [1, 0, 1] } },
    { op: 'addMarker', levelId: 'shrine', marker: { id: 'b', kind: 'pickup', pos: [2, 0, 2] } },
  ] });
  assert.equal(h.entries[0].label, 'Aria placed two pickups');
  assert.equal(h.project.levels[0].markers.length, 2);
  h.undo();
  assert.equal(h.project.levels[0].markers.length, 0);
});

test('describeOp reads like a sentence', () => {
  const p = fresh();
  assert.equal(describeOp(p, { op: 'setLook', levelId: 'glacial', look: { exposure: 0.78 } }), 'Set look in Glacial Citadel: exposure 0.8');
  assert.equal(describeOp(p, { op: 'putZone', levelId: 'volcanic', zone: { id: 'h', kind: 'hazardBelow', y: -3.5 } }), 'Hazard in Obsidian Volcanic Compound below -3.5 m');
});

test('runtime urls and message guard', () => {
  const rt = RUNTIMES['rift-realm'];
  assert.equal(runtimeUrl(rt, 'studio', rt.levels[1]), '/games/rift-realm/play/studio.html?level=glacial&studio=1');
  assert.equal(runtimeUrl(rt, 'play', rt.levels[0], { dev: true }), 'http://localhost:4332/index.html?level=shrine&studio=1');
  assert.ok(isGameMessage({ source: 'plajah-studio-game', type: 'ready' }));
  assert.ok(!isGameMessage({ source: 'other', type: 'ready' }));
});
