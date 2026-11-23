import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, defaultBindings, bindKey, bindLabel, padLabel, usersOf, type ActionDef, type Bind } from '../services/input/remap';

const K = (code: string): Bind => ({ t: 'key', code });
const M = (b: number): Bind => ({ t: 'mouse', b });
const ACTIONS: ActionDef[] = [
  { id: 'fire', label: 'Fire', group: 'C', canonical: M(0), defaults: [M(0)], padCanonical: 7 },
  { id: 'surge', label: 'Surge', group: 'S', canonical: K('KeyQ'), defaults: [K('Digit4'), M(3)], padCanonical: 3 },
  { id: 'guard', label: 'Guard', group: 'C', canonical: K('KeyX'), defaults: [K('KeyX'), M(4)] },
  { id: 'jump', label: 'Jump', group: 'M', canonical: K('Space'), defaults: [K('Space')], padCanonical: 0 },
];

test('defaults: side buttons and number keys translate onto the canonical inputs the game reads', () => {
  const c = compile(ACTIONS, defaultBindings(ACTIONS));
  assert.deepEqual(c.map.get(bindKey(K('Digit4'))), K('KeyQ'));
  assert.deepEqual(c.map.get(bindKey(M(3))), K('KeyQ'));      // Mouse 4 (back) → Soul Surge
  assert.deepEqual(c.map.get(bindKey(M(4))), K('KeyX'));      // Mouse 5 (forward) → Guard
  assert.equal(c.map.has(bindKey(M(0))), false);              // left click is fire as it is
  assert.ok(c.swallow.has(bindKey(K('KeyQ'))), 'Q is no longer bound, so it does nothing');
  assert.equal(c.pad.get(7), 7);
});

test('rebinding moves an action and frees the old key', () => {
  const b = defaultBindings(ACTIONS);
  b.jump.binds = [K('KeyJ')];
  const c = compile(ACTIONS, b);
  assert.deepEqual(c.map.get(bindKey(K('KeyJ'))), K('Space'));
  assert.ok(c.swallow.has(bindKey(K('Space'))));
});

test('a key bound to an action keeps working even if it is another action\'s canonical input', () => {
  const b = defaultBindings(ACTIONS);
  b.jump.binds = [K('KeyX')]; b.guard.binds = [M(4)];
  const c = compile(ACTIONS, b);
  assert.deepEqual(c.map.get(bindKey(K('KeyX'))), K('Space'));
  assert.equal(c.swallow.has(bindKey(K('KeyX'))), false);
  assert.deepEqual(usersOf(ACTIONS, b, K('KeyX')), ['jump']);
});

test('controller buttons permute; an unbound action reads as never pressed', () => {
  const b = defaultBindings(ACTIONS);
  b.jump.pad = 2; b.surge.pad = null;
  const c = compile(ACTIONS, b);
  assert.equal(c.pad.get(0), 2);
  assert.equal(c.pad.get(3), -1);
});

test('labels read like the hardware', () => {
  assert.equal(bindLabel(M(3)), 'Mouse 4 (back)');
  assert.equal(bindLabel(M(4)), 'Mouse 5 (forward)');
  assert.equal(bindLabel(M(6)), 'Mouse 7');
  assert.equal(bindLabel(K('Digit4')), '4');
  assert.equal(bindLabel(K('ShiftLeft')), 'Left Shift');
  assert.equal(padLabel(7), 'RT');
});
