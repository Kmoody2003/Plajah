// Unit tests for Rift Realm stream water physics & buoyancy, retracting grapple eligibility, and custom Armory loadouts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleWaterAt, stepWaterBuoyancy } from '../games/rift-realm/src/waterPhysics';
import { VESSELS } from '../games/rift-realm/src/vessels';
import { DEFAULT_LOADOUTS, LOOT_CATALOG, WORLD_PICKUPS, computeLoadoutStats } from '../games/rift-realm/src/loadouts';

describe('Rift Realm — Physics-Accurate Stream Water & Swimming Buoyancy', () => {
  it('samples flowing river current with faster mid-channel speed than near-bank eddies', () => {
    // RIVER segment [362, -150, 2.8, 12] -> [300, 0, 1.4, 12]
    const mid = sampleWaterAt(331, -75, 0.5, true);
    assert.ok(mid, 'expected water sample at mid-river');
    assert.ok(mid.depth > 1.5, `expected swimmable depth, got ${mid.depth}`);
    assert.ok(mid.speed > 1.0, `expected downstream flow speed > 1 m/s, got ${mid.speed}`);
    assert.ok(mid.flowZ > 0 && mid.flowX < 0, 'river should flow south-west along the spline');

    // Point near the bank (perpendicular offset ~5.5 m from spline center)
    const bank = sampleWaterAt(331 + 5.2, -75 + 2.1, 1.2, true);
    assert.ok(bank, 'expected water sample near river bank');
    assert.ok(mid.speed > bank.speed, `midstream (${mid.speed.toFixed(2)}) must be faster than bank (${bank.speed.toFixed(2)})`);
  });

  it('samples Elderwood Hollow Waterfall Pool and Violet Vale standing swamp water', () => {
    const pool = sampleWaterAt(30, 60, -3.5, false);
    assert.ok(pool, 'Hollow pool must work even in ?classic mode');
    assert.equal(pool.kind, 'clean');
    assert.ok(pool.depth > 2.0);

    const mire = sampleWaterAt(-330, 620, -51.5, true);
    assert.ok(mire);
    assert.equal(mire.kind, 'swamp');
    assert.ok(mire.depth > 2.0);
  });

  it('simulates Archimedes buoyancy settling at chest-float equilibrium and advecting swimmer downstream', () => {
    const water = sampleWaterAt(331, -75, -1.0, true)!;
    assert.ok(water);
    let feetY = water.y - 1.65; // dropped deep underwater
    let vx = 0, vy = -2.0, vz = 0;
    let lastSwimming = false;

    for (let i = 0; i < 240; i++) {
      const dt = 1 / 60;
      const step = stepWaterBuoyancy({
        feetY, bodyHeight: 1.8, vx, vy, vz,
        wishX: 0, wishZ: 0, swimVertical: 0,
        gravity: 27, dt, water, clock: i * dt,
      });
      vx = step.vx; vy = step.vy; vz = step.vz;
      feetY += vy * dt;
      lastSwimming = step.swimming;
    }

    assert.equal(lastSwimming, true, 'character should remain in swimming state');
    const subDepth = water.y - feetY;
    assert.ok(subDepth > 1.0 && subDepth < 1.65, `expected head-above-water float equilibrium, got subDepth=${subDepth.toFixed(2)}`);
    // Swimmer with zero input should drift cleanly with downstream current
    assert.ok(Math.hypot(vx - water.flowX, vz - water.flowZ) < 0.25, 'passive swimmer should match river current velocity');
  });
});

describe('Rift Realm — Selective Retracting Grapple Capability & Loadout Armory', () => {
  it('grants retracting grappling hook ONLY to agile Vessels (Void Stalker & Sylva), not heavy/winged Vessels', () => {
    assert.ok(VESSELS.stalker.grapple, 'Void Stalker must have retracting grapple');
    assert.ok(VESSELS.sylva.grapple, 'Sylva must have retracting grapple');
    assert.equal(VESSELS.aegis.grapple, undefined, 'Aegis must NOT have grapple');
    assert.equal(VESSELS.seraph.grapple, undefined, 'Seraph-9 must NOT have grapple');
    assert.equal(VESSELS.pyre.grapple, undefined, 'Pyre must NOT have grapple');
  });

  it('computes stacked custom Loadout bonuses across picked-up weapons, shields, and modular 3D armor', () => {
    const custom = {
      ...DEFAULT_LOADOUTS[1],
      weaponId: 'coral_trident',
      shieldId: 'paladin_tower_shield',
      armor: { head: 'sylva_antler_crown', back: 'nyx_fin_crest', chest: 'pyre_obsidian_chest' },
    };
    const stats = computeLoadoutStats(custom);
    assert.ok(stats.dmgMul > 1.3, `expected stacked dmgMul > 1.3, got ${stats.dmgMul}`);
    assert.equal(stats.maxHpBonus, 90, 'expected +45 (tower shield) + +45 (pyre chest) = +90 Max HP');
    assert.ok(stats.swimMul >= 1.65, `expected trident + fin crest swim bonus, got ${stats.swimMul}`);
    assert.ok(stats.grappleRangeMul >= 1.25, 'expected antler crown grapple reach bonus');
    assert.equal(stats.accentColor, LOOT_CATALOG.coral_trident.color);
  });

  it('validates every World Pickup references a real LOOT_CATALOG entry', () => {
    assert.ok(WORLD_PICKUPS.length >= 20, 'expected abundant world pickups across the map');
    for (const p of WORLD_PICKUPS) {
      assert.ok(LOOT_CATALOG[p.lootId], `pickup ${p.id} references unknown lootId ${p.lootId}`);
    }
  });
});
