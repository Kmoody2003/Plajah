// Unit tests for Rift Realm stream water physics & buoyancy, retracting grapple eligibility, and custom Armory loadouts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleWaterAt, stepWaterBuoyancy } from '../games/rift-realm/src/waterPhysics';
import { VESSELS } from '../games/rift-realm/src/vessels';
import { DEFAULT_LOADOUTS, LOOT_CATALOG, WORLD_PICKUPS, computeLoadoutStats } from '../games/rift-realm/src/loadouts';
import { findActiveGamepad, applyStickCurve } from '../games/rift-realm/src/controls';
import { RR_ACTIONS } from '../games/rift-realm/src/input/actions';
import { isVesselSwitchAllowed } from '../games/rift-realm/src/modes/index';
import { WARDENS } from '../games/rift-realm/src/ents/wardens';
import { wardenAssetId } from '../games/rift-realm/src/ents/ent';
import { ROSTER_BY_ID } from '../games/rift-realm/src/characters';
import { walkwayTrunkGapAngles } from '../games/rift-realm/src/world/places';
import { cappedPixelRatio } from '../games/rift-realm/src/gfx';
import { resolveForestNetworkSignal } from '../games/rift-realm/src/danger/mycelium';
import { classifyForestHealth, rollInitialForestHealth, wardenReinforcementTarget } from '../games/rift-realm/src/danger/forestHealth';
import { DEMON_CLASSES, demonBudgetForHealth } from '../games/rift-realm/src/danger/demons';
import { isWardenBefriended } from '../games/rift-realm/src/danger/wardens';
import { ELDERWOOD_VILLAGES, initialOccupiedVillageCount } from '../games/rift-realm/src/danger/villages';
import { existsSync } from 'node:fs';
import path from 'node:path';

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

describe('Rift Realm — Gamepad / Controller Support', () => {
  it('finds connected gamepads across any slot (not just index 0) and applies radial deadzone + curve', () => {
    const fakePad = { id: 'Xbox Wireless Controller', index: 2, connected: true, buttons: [], axes: [] } as unknown as Gamepad;
    assert.equal(findActiveGamepad([null, null, fakePad, null]), fakePad);
    assert.equal(findActiveGamepad([null, { ...fakePad, connected: false } as unknown as Gamepad]), null);

    // Inside deadzone snaps cleanly to [0, 0]
    assert.deepEqual(applyStickCurve(0.08, -0.09, 0.15, 1.65), [0, 0]);
    // Full deflection preserves unit magnitude & direction
    const [fx, fy] = applyStickCurve(1, 0, 0.15, 1.65);
    assert.ok(Math.abs(fx - 1) < 1e-6 && Math.abs(fy) < 1e-6);
    // Mid deflection with power > 1 gives finer micro-aim precision than linear
    const [mx] = applyStickCurve(0.5, 0, 0.15, 1.65);
    const [mxLin] = applyStickCurve(0.5, 0, 0.15, 1);
    assert.ok(mx > 0 && mx < mxLin, `expected curved mid-stick (${mx}) < linear (${mxLin})`);
  });

  it('registers grapple on LB (button 4) with zero duplicate padCanonical collisions in RR_ACTIONS', () => {
    const grapple = RR_ACTIONS.find((a) => a.id === 'grapple');
    assert.ok(grapple, 'expected grapple action in RR_ACTIONS');
    assert.equal(grapple.padCanonical, 4, 'expected grapple mapped to LB (button 4)');

    const seen = new Map<number, string>();
    for (const a of RR_ACTIONS) {
      if (a.padCanonical === undefined) continue;
      assert.ok(!seen.has(a.padCanonical), `duplicate padCanonical ${a.padCanonical} on ${a.id} and ${seen.get(a.padCanonical)}`);
      seen.set(a.padCanonical, a.id);
    }
  });
});

describe('Rift Realm — High-Quality Grovewarden Rigs & Mode Character Locking', () => {
  it('maps every Grovewarden in WARDENS to a real sculpted GLB, GPU KTX2 GLB, and clip library on disk', () => {
    assert.equal(WARDENS.length, 12, 'expected all 12 Grovewarden species');
    for (const w of WARDENS) {
      const assetId = wardenAssetId(w.id);
      assert.ok(ROSTER_BY_ID[assetId], `missing ROSTER_BY_ID entry for ${assetId}`);
      assert.equal(ROSTER_BY_ID[assetId].category, 'warden');
      const glbPath = path.resolve('public/games/rift-realm/assets/characters', `${assetId}.glb`);
      const gpuPath = path.resolve('public/games/rift-realm/assets/characters/gpu', `${assetId}.glb`);
      const clipPath = path.resolve('public/games/rift-realm/assets/characters/clips', `${assetId}.json`);
      assert.ok(existsSync(glbPath), `missing GLB on disk: ${glbPath}`);
      assert.ok(existsSync(gpuPath), `missing GPU GLB on disk: ${gpuPath}`);
      assert.ok(existsSync(clipPath), `missing animation clip library on disk: ${clipPath}`);
    }
  });

  it('locks mid-game character switching in structured modes and permits it only in Free Roam', () => {
    assert.equal(isVesselSwitchAllowed({ modeId: 'explore', modeRunning: false, inCampaign: false, ruled: false }), true);
    assert.equal(isVesselSwitchAllowed({ modeId: null, modeRunning: false, inCampaign: false, ruled: false }), true);
    assert.equal(isVesselSwitchAllowed({ modeId: 'survival', modeRunning: true, inCampaign: false, ruled: false }), false);
    assert.equal(isVesselSwitchAllowed({ modeId: 'trials', modeRunning: true, inCampaign: false, ruled: false }), false);
    assert.equal(isVesselSwitchAllowed({ modeId: 'boss', modeRunning: true, inCampaign: false, ruled: false }), false);
    assert.equal(isVesselSwitchAllowed({ modeId: 'campaign', modeRunning: false, inCampaign: true, ruled: false }), false);
    assert.equal(isVesselSwitchAllowed({ modeId: 'explore', modeRunning: true, inCampaign: false, ruled: false }), false);
    assert.equal(isVesselSwitchAllowed({ modeId: 'explore', modeRunning: false, inCampaign: false, ruled: true }), false);
  });
});

describe('Rift Realm — Walk-Through Tree Alignment & Ultra-Wide / Mobile Pixel Budgets', () => {
  it('aligns Mangrove Mire boardwalk walk-through trunk doorways directly along the walkway axis', () => {
    // Boardwalk segment [-250, 500] -> [-300, 570] has direction (-50, +70)
    const [a1, a2] = walkwayTrunkGapAngles(-250, 500, -300, 570);
    const dx = -50, dz = 70, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    // shell() places gap centers at (sin(a), cos(a))
    const dot1 = Math.sin(a1) * ux + Math.cos(a1) * uz;
    const dot2 = Math.sin(a2) * ux + Math.cos(a2) * uz;
    assert.ok(dot1 > 0.9999, `front archway must align with walkway forward vector, got dot=${dot1}`);
    assert.ok(dot2 < -0.9999, `rear archway must align opposite walkway vector, got dot=${dot2}`);

    // Cardinal north-south walkway check
    const [c1, c2] = walkwayTrunkGapAngles(0, 0, 0, 100);
    assert.ok(Math.abs(Math.sin(c1)) < 1e-6 && Math.cos(c1) > 0.9999);
    assert.ok(Math.abs(Math.sin(c2)) < 1e-6 && Math.cos(c2) < -0.9999);
  });

  it('caps pixel ratio on 32:9 ultra-wide displays and high-DPI Android mobile screens to prevent GPU fill stalls', () => {
    // 5120x1440 ultrawide @ DPR 2 on high tier (4.8M pixel cap)
    const uwPr = cappedPixelRatio(5120, 1440, 2, 4_800_000, 2);
    const uwPixels = 5120 * 1440 * uwPr * uwPr;
    assert.ok(uwPr >= 0.65 && uwPr < 1.0, `expected ultrawide pixelRatio clamped below 1.0, got ${uwPr}`);
    assert.ok(uwPixels <= 4_850_000, `expected ultrawide shaded pixels <= 4.85M, got ${Math.round(uwPixels)}`);

    // Android phone 915x412 @ DPR 3 (1.55M pixel cap, maxDpr 1.25)
    const mobPr = cappedPixelRatio(915, 412, 3, 1_550_000, 1.25);
    assert.ok(mobPr >= 0.65 && mobPr <= 1.25, `expected mobile pixelRatio in [0.65, 1.25], got ${mobPr}`);
    assert.ok(915 * 412 * mobPr * mobPr <= 1_560_000);
  });
});

describe('Rift Realm — Elderwood Living Forest Network, Health States, Demons, Wardens & Villages', () => {
  it('resolves Tree & Fungi Network pulses: crimson demon alarm, emerald heal beckon, silent decline, and dark hostility', () => {
    // Willing forest + lurking demon => crimson danger alarm
    const alarm = resolveForestNetworkSignal({
      soul: 0.2, forestTrust: 0.5, hpFrac: 0.85, poisoned: false, chargeFrac: 0.9,
      nearestDemonDist: 42, nearestAidDist: 15, inCombat: false,
    });
    assert.equal(alarm.disposition, 'helping');
    assert.equal(alarm.signal, 'danger');
    assert.equal(alarm.urgent, true);

    // Willing forest + wounded player + no demon => urgent emerald aid beckon
    const aid = resolveForestNetworkSignal({
      soul: 0.1, forestTrust: 0, hpFrac: 0.35, poisoned: false, chargeFrac: 0.8,
      nearestDemonDist: null, nearestAidDist: 38, inCombat: true,
    });
    assert.equal(aid.disposition, 'helping');
    assert.equal(aid.signal, 'aid');
    assert.equal(aid.urgent, true);

    // Cold/declining forest => silent (no red warning even with demon right there, no heal aid)
    const silent = resolveForestNetworkSignal({
      soul: -0.2, forestTrust: 0, hpFrac: 0.2, poisoned: true, chargeFrac: 0.1,
      nearestDemonDist: 20, nearestAidDist: 10, inCombat: false,
    });
    assert.equal(silent.disposition, 'silent');
    assert.equal(silent.signal, 'off');

    // Darkened soul => hostile & silent on aid/warnings
    const hostile = resolveForestNetworkSignal({
      soul: -0.45, forestTrust: 0, hpFrac: 0.25, poisoned: false, chargeFrac: 0.5,
      nearestDemonDist: 30, nearestAidDist: 12, inCombat: false,
    });
    assert.equal(hostile.disposition, 'hostile');
    assert.equal(hostile.signal, 'off');
  });

  it('classifies Forest Health bands, parses URL overrides, and scales Grovewarden reinforcements', () => {
    assert.equal(classifyForestHealth(18), 'blighted');
    assert.equal(classifyForestHealth(44), 'struggling');
    assert.equal(classifyForestHealth(72), 'recovering');
    assert.equal(classifyForestHealth(92), 'thriving');

    assert.equal(rollInitialForestHealth('blighted'), 18);
    assert.equal(rollInitialForestHealth('thriving'), 92);
    assert.equal(rollInitialForestHealth('50'), 50);

    assert.ok(wardenReinforcementTarget(95) > wardenReinforcementTarget(20), 'restoring the forest must summon more Grovewardens');
    assert.equal(wardenReinforcementTarget(18), 2);
    assert.equal(wardenReinforcementTarget(95), 6);
  });

  it('validates all 5 Demon Classes back onto real sculpted GLBs on disk and scale with Forest Health', () => {
    const classes = Object.values(DEMON_CLASSES);
    assert.equal(classes.length, 5, 'expected 5 distinct Demon Classes');
    for (const c of classes) {
      assert.ok(ROSTER_BY_ID[c.assetId], `missing ROSTER_BY_ID entry for demon asset ${c.assetId}`);
      const glbPath = path.resolve('public/games/rift-realm/assets/characters', `${c.assetId}.glb`);
      assert.ok(existsSync(glbPath), `missing sculpted demon GLB on disk: ${glbPath}`);
    }
    assert.ok(demonBudgetForHealth(18, false) > demonBudgetForHealth(92, false), 'blighted forest must spawn heavier demon legions');
    assert.equal(isWardenBefriended(1, false), false);
    assert.equal(isWardenBefriended(2, false), true);
    assert.equal(isWardenBefriended(0, true), true);
  });

  it('validates Elderwood Villages and Demon Fortress occupation scaling from Blighted to Thriving', () => {
    assert.equal(ELDERWOOD_VILLAGES.length, 4, 'expected 4 Elderwood villages');
    assert.equal(initialOccupiedVillageCount(18), 3, 'blighted forest occupies 3 villages as Demon Fortresses');
    assert.equal(initialOccupiedVillageCount(45), 2);
    assert.equal(initialOccupiedVillageCount(72), 1);
    assert.equal(initialOccupiedVillageCount(92), 0, 'thriving forest starts with all 4 villages free');
  });
});
