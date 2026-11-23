// Rift Realm spirit energy (games/rift-realm/src/weapons.ts WeaponEnergy): charge, heat, overheat, vent, recharge.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WeaponEnergy } from '../games/rift-realm/src/weapons';

describe('WeaponEnergy', () => {
  it('a shot spends charge and builds heat; on the beat it costs less and runs cooler', () => {
    const w = new WeaponEnergy(), e = WEAPONS.aegis.energy;
    assert.equal(w.spend('OFF'), 'ok');
    let c = w.getCharge();
    assert.equal(c.charge, e.capacity - e.costPerShot);
    assert.ok(Math.abs(c.heat - e.heatPerShot) < 1e-9);
    const w2 = new WeaponEnergy();
    w2.spend('PERFECT');
    c = w2.getCharge();
    assert.equal(c.charge, e.capacity - e.costPerShot * e.beat.perfect.cost);
    assert.ok(c.heat < e.heatPerShot);
  });

  it('firing past full heat overheats: no shots until the forced cool-down ends, then cool', () => {
    const w = new WeaponEnergy(), e = WEAPONS.stalker.energy;
    w.current = 'stalker';
    let over = 0; w.onOverheat = () => { over++; };
    let shots = 0;
    while (w.spend('OFF') === 'ok') shots++;
    assert.equal(over, 1);
    assert.equal(shots, Math.ceil(1 / e.heatPerShot));
    assert.equal(w.canFire(), 'hot');
    for (let t = 0; t < e.overheatSec - 0.05; t += 1 / 60) w.update(1 / 60);
    assert.equal(w.canFire(), 'hot');
    for (let t = 0; t < 0.2; t += 1 / 60) w.update(1 / 60);
    assert.equal(w.canFire(), 'ok');
    assert.equal(w.getCharge().heat, 0);
  });

  it('heat cools by itself after a pause; vent dumps it early for a little charge', () => {
    const w = new WeaponEnergy(), e = WEAPONS.aegis.energy;
    w.spend(); w.spend();
    const h = w.getCharge().heat;
    for (let t = 0; t < e.coolDelay + 0.2; t += 1 / 60) w.update(1 / 60);
    assert.ok(w.getCharge().heat < h);
    w.spend(); w.spend();
    const before = w.getCharge().charge;
    assert.equal(w.vent(), true);
    assert.equal(w.getCharge().charge, before - e.ventCost);
    assert.equal(w.canFire(), 'hot');
    for (let t = 0; t < e.ventSec + 0.05; t += 1 / 60) w.update(1 / 60);
    assert.equal(w.getCharge().heat, 0);
    assert.equal(w.vent(), false); // nothing left to vent
  });

  it('running dry fires onDry; the trigger then reports dry; regen is slow; addCharge refills and reports', () => {
    const w = new WeaponEnergy(), e = WEAPONS.seraph.energy;
    w.current = 'seraph';
    let dry = 0; w.onDry = () => { dry++; };
    const got: [number, string][] = []; w.onCharge = (_id, a, s) => { got.push([a, s]); };
    for (let i = 0; i < 400 && w.getCharge().shotsLeft > 0; i++) { if (w.spend() === 'hot') for (let t = 0; t < 2; t += 0.1) w.update(0.1); }
    assert.equal(dry, 1);
    for (let t = 0; t < 2.5; t += 0.1) w.update(0.1); // cool fully (no shot since)
    assert.equal(w.canFire(), 'dry');
    const c0 = w.getCharge().charge;
    for (let t = 0; t < 2; t += 0.1) w.update(0.1);
    assert.ok(w.getCharge().charge - c0 <= e.regenPerSec * 2 + 1e-6); // slow regen, and silent (no onCharge)
    assert.equal(got.length, 0);
    assert.equal(w.addCharge(40, 'chargecap'), 40);
    assert.deepEqual(got, [[40, 'chargecap']]);
    assert.equal(w.canFire(), 'ok');
    const room = e.capacity - w.getCharge().charge;
    assert.equal(w.addCharge(1e6, 'fungus'), room); // capped at capacity
    assert.equal(w.getCharge().charge, e.capacity);
  });

  it('each vessel keeps its own charge; reset() cools and tops up to half', () => {
    const w = new WeaponEnergy();
    w.spend(); w.current = 'stalker';
    assert.equal(w.getCharge().charge, WEAPONS.stalker.energy.capacity);
    assert.ok(w.getCharge('aegis').charge < WEAPONS.aegis.energy.capacity);
    w.addCharge(-1, 'x'); // negative gifts are ignored
    for (let i = 0; i < 20; i++) w.spend();
    w.reset();
    assert.equal(w.getCharge().heat, 0);
    assert.ok(w.getCharge().charge >= WEAPONS.stalker.energy.capacity * 0.5);
  });
});
