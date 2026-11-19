import test from 'node:test';
import assert from 'node:assert/strict';
import { Fest, SkillChain, emptyFest, passesEarned, PASS_FP, FP, type FestSite } from '../src/garage/fest';

const SITES: FestSite[] = [
  { id: 'main', name: 'Halcyon Shores', kind: 'main', x: 0, z: 0 },
  { id: 'dune', name: 'Dune Sea', kind: 'outpost', x: 1000, z: 0 },
  { id: 'kettle', name: 'Kettle Hills', kind: 'outpost', x: 0, z: 1000 },
];

test('fest: stars pay once per level, personal bests pay on improvement', () => {
  const f = new Fest(emptyFest(), SITES);
  assert.equal(f.challenge('trap_1', 'Trap', 1, 90).reduce((s, e) => s + e.fp, 0), FP.star);
  assert.equal(f.challenge('trap_1', 'Trap', 1, 88).length, 0, 'a worse run pays nothing');
  assert.equal(f.challenge('trap_1', 'Trap', 3, 120).reduce((s, e) => s + e.fp, 0), 2 * FP.star + FP.pb, 'two new stars and a PB');
  assert.equal(f.fp, 3 * FP.star + FP.pb);
});

test('fest: passes at the thresholds, one outpost per pass, opening show on arrival', () => {
  let saves = 0;
  const f = new Fest(emptyFest(), SITES, () => saves++);
  assert.ok(f.isOpen('main') && !f.isOpen('dune'));
  assert.equal(f.openOutpost('dune').length, 0, 'no pass yet');
  const ev = f.discover('road:kettle', 'Kettle Pass driven', PASS_FP[0]);
  assert.ok(ev.some((e) => e.kind === 'pass'), 'crossing a threshold says so');
  assert.equal(f.passes.free, 1);
  assert.equal(f.openOutpost('dune')[0].kind, 'opened');
  assert.equal(f.passes.free, 0);
  assert.equal(f.openOutpost('kettle').length, 0, 'the pass is spent');
  const at = f.arrive(1010, 5);
  assert.ok(at.some((e) => e.kind === 'opening' && e.site === 'dune'), 'opening set when the player gets there');
  assert.ok(at.some((e) => e.text.startsWith('Found')), 'first visit pays');
  assert.equal(f.arrive(1000, 0).length, 0, 'only once');
  assert.ok(f.arrive(0, 1000).every((e) => e.kind !== 'opening'), 'no show at a closed outpost');
  assert.ok(saves > 0);
  assert.equal(passesEarned(PASS_FP[PASS_FP.length - 1] + 1), PASS_FP.length);
});

test('skills: chains build a multiplier, bank after a pause, and a crash loses them', () => {
  const c = new SkillChain();
  let fp = 0;
  for (let i = 0; i < 60; i++) fp += c.step(1 / 20, { drifting: true, airborne: false, speed: 25 });
  fp += c.step(1 / 20, { drifting: false, airborne: false, speed: 25, nearMiss: true });
  assert.ok(c.mult > 1, 'a second skill raises the multiplier');
  for (let i = 0; i < 70; i++) fp += c.step(1 / 20, { drifting: false, airborne: false, speed: 25 });
  assert.ok(fp > 10, 'banked: ' + fp);
  for (let i = 0; i < 40; i++) c.step(1 / 20, { drifting: true, airborne: false, speed: 25 });
  assert.equal(c.step(1 / 20, { drifting: false, airborne: false, speed: 0, crashed: true }), 0);
  assert.equal(c.points, 0, 'lost on a crash');
});
