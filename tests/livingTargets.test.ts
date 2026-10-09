import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveTarget, unionBox, PAGE_ID } from '../services/living/runtime/targets';
import { evalCond, condVars, compareScalars } from '../services/living/runtime/conditions';
import { VarStore } from '../services/living/runtime/state';
import { GoalTracker } from '../services/living/runtime/goals';
import { mulberry32, hashString } from '../services/living/runtime/rng';
import { OBJS } from './livingMocks';

describe('living targets', () => {
  it('resolves by id, exact label, prefix label, role, group and page', () => {
    assert.deepEqual(resolveTarget({ id: 'bo-body' }, OBJS), ['bo-body']);
    assert.deepEqual(resolveTarget({ id: 'nope' }, OBJS), []);
    assert.deepEqual(resolveTarget({ label: 'Bo eye L' }, OBJS), ['bo-eye-l']);
    assert.deepEqual(resolveTarget({ label: 'Bo eye*' }, OBJS), ['bo-eye-l', 'bo-eye-r']);
    assert.deepEqual(resolveTarget({ label: 'Bo eye' }, OBJS), [], 'no implicit prefix match without *');
    assert.deepEqual(resolveTarget({ role: 'HEADLINE' }, OBJS), ['title']);
    assert.deepEqual(resolveTarget({ page: true }, OBJS), [PAGE_ID]);
  });
  it('resolves groups made of ids, label: and role: entries, in page order, de-duplicated', () => {
    const groups = { eyes: ['bo-eye-r', 'label:Bo eye L', 'bo-eye-r'], windows: ['label:Window*'], heads: ['role:HEADLINE', 'ghost-id'] };
    assert.deepEqual(resolveTarget({ group: 'eyes' }, OBJS, groups), ['bo-eye-l', 'bo-eye-r']);
    assert.deepEqual(resolveTarget({ group: 'windows' }, OBJS, groups), ['win-1', 'win-2']);
    assert.deepEqual(resolveTarget({ group: 'heads' }, OBJS, groups), ['title']);
    assert.deepEqual(resolveTarget({ group: 'missing' }, OBJS, groups), []);
  });
  it('unionBox covers the targets', () => {
    assert.deepEqual(unionBox(['win-1', 'win-2'], OBJS), { x: 20, y: 20, w: 100, h: 40 });
    assert.equal(unionBox([], OBJS), null);
  });
});

describe('living conditions and state', () => {
  const get = (m: Record<string, number | string | boolean>) => (n: string) => m[n];
  it('compares with sensible defaults for missing variables', () => {
    assert.equal(compareScalars(undefined, '==', 0), true);
    assert.equal(compareScalars(undefined, '>=', 1), false);
    assert.equal(compareScalars(undefined, '==', ''), true);
    assert.equal(compareScalars(undefined, '==', false), true);
    assert.equal(compareScalars('3', '>=', 3), true, 'numeric strings coerce when compared with numbers');
  });
  it('evaluates var / all / any / not', () => {
    const v = get({ n: 3, on: true, name: 'x' });
    assert.equal(evalCond({ var: 'n', op: '>=', value: 3 }, v), true);
    assert.equal(evalCond({ var: 'n', op: '<', value: 3 }, v), false);
    assert.equal(evalCond({ all: [{ var: 'on', op: '==', value: true }, { var: 'name', op: '!=', value: 'y' }] }, v), true);
    assert.equal(evalCond({ any: [{ var: 'n', op: '>', value: 9 }, { var: 'on', op: '==', value: true }] }, v), true);
    assert.equal(evalCond({ not: { var: 'n', op: '==', value: 3 } }, v), false);
    assert.equal(evalCond(undefined, v), true);
    assert.deepEqual([...condVars({ all: [{ var: 'a', op: '==', value: 1 }, { not: { var: 'b', op: '==', value: 1 } }] })].sort(), ['a', 'b']);
  });
  it('VarStore applies ops, notifies once per change, resets', () => {
    const s = new VarStore({ n: 0, f: false });
    const seen: string[] = [];
    const off = s.subscribe((k, v) => seen.push(`${k}=${v}`));
    s.apply('n', 'inc'); s.apply('n', 'inc', 2); s.apply('n', 'dec'); s.apply('f', 'toggle'); s.apply('f', 'set', true); s.apply('x', 'set', 'hi');
    assert.deepEqual(seen, ['n=1', 'n=3', 'n=2', 'f=true', 'x=hi'], 'setting the same value again is not a change');
    assert.equal(s.num('n'), 2);
    off(); s.apply('n', 'inc'); assert.equal(seen.length, 5);
    s.reset(); assert.deepEqual(s.snapshot(), { n: 0, f: false });
  });
  it('GoalTracker fires each goal once', () => {
    const g = new GoalTracker([{ id: 'a', label: 'A', when: { var: 'n', op: '>=', value: 2 } }, { id: 'b', label: 'B', when: { var: 'n', op: '>=', value: 3 }, celebrate: true }]);
    assert.deepEqual(g.check(get({ n: 1 })).map(x => x.id), []);
    assert.deepEqual(g.check(get({ n: 2 })).map(x => x.id), ['a']);
    assert.deepEqual(g.check(get({ n: 2 })).map(x => x.id), [], 'a does not fire twice');
    assert.deepEqual(g.check(get({ n: 5 })).map(x => x.id), ['b']);
    assert.deepEqual(g.completed(), ['a', 'b']);
    g.reset(); assert.deepEqual(g.check(get({ n: 9 })).map(x => x.id), ['a', 'b']);
  });
  it('seeded rng is deterministic and spread out', () => {
    const a = mulberry32(42), b = mulberry32(42); const xs = Array.from({ length: 5 }, a), ys = Array.from({ length: 5 }, b);
    assert.deepEqual(xs, ys);
    assert.notDeepEqual(xs, Array.from({ length: 5 }, mulberry32(43)));
    assert.ok(xs.every(x => x >= 0 && x < 1));
    assert.equal(hashString('bo-eye-l'), hashString('bo-eye-l')); assert.notEqual(hashString('a'), hashString('b'));
  });
});
