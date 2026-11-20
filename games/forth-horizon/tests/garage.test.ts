import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCar, carPi, newOwnedCar, ratings } from '../src/garage/build';
import { CAR_DEFS, CAR_BY_ID, classFor, stockSpec } from '../src/garage/catalog';
import { OBJECTIVES } from '../src/garage/objectives';
import { PARTS, PART_BY_ID, SLOTS, slotAvailable } from '../src/garage/parts';
import { Garage, medalFor, type StorageLike, type RunResult } from '../src/garage/progress';
import { TUNE_PRESETS, applyTune, defaultTune } from '../src/garage/tuning';
import { levelOf, xpToReach } from '../src/garage/types';

const mem = (): StorageLike & { d: Record<string, string> } => { const d: Record<string, string> = {}; return { d, getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; } }; };
const run = (o: Partial<RunResult> = {}): RunResult => ({ eventId: 'ironport_grand_circuit', timeSec: 130, parSec: 100, collisions: 0, topMph: 120, driftPoints: 0, distanceKm: 5, wetness: 0, assists: { line: true, brake: true, steer: true }, ...o });

test('every car has a sane physics spec and a class that matches its PI', () => {
  assert.equal(CAR_DEFS.length, 81);
  assert.equal(new Set(CAR_DEFS.map((c) => c.id)).size, 81);
  for (const d of CAR_DEFS) {
    assert.notEqual(d.body, 'pending', `${d.id} must have a built 3D body`);
    assert.ok(!/\b(forza|horizon)\b/i.test(`${d.make} ${d.name}`), `${d.id} must not use trademarked names`);
    const s = stockSpec(d);
    for (const v of [s.massKg, s.topSpeedMps, s.corneringGrip, s.engine.peakHp, s.engine.peakTorqueNm, s.wheelbase, s.finalDrive]) assert.ok(Number.isFinite(v) && v > 0, d.id);
    assert.ok(s.topSpeedMps >= 50 && s.topSpeedMps <= 95, `${d.id} top speed ${s.topSpeedMps}`);
    assert.equal(s.engine.peakHp, d.hp, d.id);
    assert.equal(s.massKg, d.kg, d.id);
  }
  assert.equal(classFor(499), 'D'); assert.equal(classFor(510), 'C'); assert.equal(classFor(840), 'S1'); assert.equal(classFor(999), 'X');
  assert.ok(CAR_DEFS.some((c) => c.starter));
  assert.equal(CAR_DEFS.filter((c) => c.traffic).length, 58);
});

test('the faster car out-accelerates and out-runs the slower one, and trucks are better off road', () => {
  const kest = ratings(stockSpec(CAR_BY_ID.kestrel)), conti = ratings(stockSpec(CAR_BY_ID.continental)), kod = ratings(stockSpec(CAR_BY_ID.kodiak));
  assert.ok(kest.zeroTo100 < conti.zeroTo100);
  assert.ok(kest.topKmh > conti.topKmh);
  assert.ok(kod.offroad > kest.offroad);
});

test('parts: five tiers per slot, EVs get motors and no exhaust, and each tier is worth more PI', () => {
  for (const s of SLOTS) for (const pt of ['ice', 'ev'] as const) {
    if (!slotAvailable(s.id, pt)) { assert.equal(s.id, 'exhaust'); assert.equal(pt, 'ev'); continue; }
    const tiers = PARTS.filter((p) => p.slot === s.id && !p.variant && (!p.only || p.only === pt)).sort((a, b) => a.tier - b.tier);
    assert.deepEqual(tiers.map((p) => p.tier), [0, 1, 2, 3, 4], `${s.id} ${pt}`);
    for (let i = 1; i < tiers.length; i++) assert.ok(tiers[i].pi > tiers[i - 1].pi && tiers[i].baseCost > tiers[i - 1].baseCost, `${s.id} ${pt} tier ${i}`);
  }
  assert.equal(new Set(PARTS.map((p) => p.id)).size, PARTS.length);
});

test('fitting parts changes the real numbers and the class', () => {
  const c = newOwnedCar('kestrel', 'a');
  const stock = buildCar(c);
  assert.equal(stock.pi, CAR_BY_ID.kestrel.pi);
  c.parts = { engine: 'engine.4', tires: 'tires.4', weight: 'weight.4', aero: 'aero.4', brakes: 'brakes.4', suspension: 'suspension.4' };
  const built = buildCar(c);
  assert.ok(built.spec.engine.peakHp > stock.spec.engine.peakHp * 1.3);
  assert.ok(built.spec.massKg === stock.spec.massKg - 180);
  assert.ok(built.spec.corneringGrip > stock.spec.corneringGrip + 0.19);
  assert.ok(built.spec.aeroDownforce > stock.spec.aeroDownforce);
  assert.ok(built.spec.brakes.maxTorqueNm > stock.spec.brakes.maxTorqueNm * 1.4);
  assert.ok(built.pi > stock.pi + 150 && built.pi <= 999);
  assert.ok(built.spec.wetSensitivity! > 1.4, 'slicks hurt in the rain');
  assert.ok(carPi(c) === built.pi);
});

test('rally parts trade tarmac for loose-surface grip', () => {
  const c = newOwnedCar('stratos_wrc', 'a');
  const base = buildCar(c);
  c.parts = { tires: 'tires.3.rally', suspension: 'suspension.3.rally' };
  const r = buildCar(c);
  assert.ok((r.spec.offroadGrip ?? 0) > (base.spec.offroadGrip ?? 0) + 0.2);
  assert.ok(r.spec.suspension.travelM > base.spec.suspension.travelM * 1.5);
});

test('tuning has sweet spots and cannot beat parts', () => {
  const spec = stockSpec(CAR_BY_ID.kestrel), d = defaultTune(spec.massKg, spec.drivetrain);
  const base = applyTune(spec, d);
  const bad = applyTune(spec, { ...d, tirePsi: 40, camber: 0, diffLock: 0 });
  assert.ok(bad.corneringGrip < base.corneringGrip - 0.02);
  const speed = applyTune(spec, { ...d, finalDrive: 0.9 }), launch = applyTune(spec, { ...d, finalDrive: 1.15 });
  assert.ok(speed.topSpeedMps > launch.topSpeedMps);
  const lowDf = applyTune(spec, { ...d, downforce: 10 }), hiDf = applyTune(spec, { ...d, downforce: 100 });
  assert.ok(hiDf.aeroDownforce > lowDf.aeroDownforce && hiDf.topSpeedMps < lowDf.topSpeedMps);
  const best = Math.max(...TUNE_PRESETS.map((p) => applyTune(spec, p.make(d, spec.massKg, spec.drivetrain)).corneringGrip));
  assert.ok(best - base.corneringGrip < 0.06, 'a tune is worth a few hundredths of grip, a tyre upgrade is worth more');
  assert.ok(PART_BY_ID['tires.2'].fx.grip! > best - base.corneringGrip);
  assert.equal(base.brakes.frontBias, 0.62);
});

test('the career begins in the Sovereign; other cars are bought, with locks and a price', () => {
  const g = new Garage(mem());
  assert.equal(g.cars.length, 1);
  assert.equal(g.active!.carId, 'kestrel');
  assert.equal(g.needsStarter(), false);
  assert.equal(g.save.credits, 5000);
  const uid = g.active!.uid;
  assert.equal(g.buyCar('kestrel').ok, false, 'already owned');
  assert.equal(g.buyCar('legacy_gtr').ok, false, 'not enough credits');
  assert.equal(g.buyCar('vanguard').ok, false, 'locked');
  assert.equal(g.install(uid, 'engine.3').ok, false, 'locked part');
  g.grant(40000);
  const b = g.buyCar('legacy_gtr'); assert.ok(b.ok);
  assert.equal(g.cars.length, 2);
  assert.equal(g.active!.carId, 'kestrel', 'buying does not change the active car');
  assert.ok(g.setActive(g.cars[1].uid).ok);
});

test('buying, fitting and the shelf', () => {
  const g = new Garage(mem());
  const uid = g.active!.uid;
  const credits0 = g.credits;
  const r = g.install(uid, 'tires.1'); assert.ok(r.ok);
  assert.ok(r.ok && r.paid > 0 && g.credits === credits0 - r.paid);
  assert.equal(g.fitted(uid, 'tires').id, 'tires.1');
  assert.equal(g.install(uid, 'tires.1').ok, false, 'already fitted');
  g.grant(100000, xpToReach(6));                     // level 6
  assert.equal(g.level, 6);
  assert.ok(g.install(uid, 'tires.2').ok);
  assert.equal(g.save.inventory['tires.1'], 1, 'the old tyres went to the shelf');
  const before = g.credits;
  assert.ok(g.install(uid, 'tires.1').ok);           // from the shelf: free
  assert.equal(g.credits, before);
  assert.equal(g.save.inventory['tires.2'], 1);
  assert.ok(g.uninstall(uid, 'tires').ok);
  assert.equal(g.fitted(uid, 'tires').tier, 0);
  assert.equal(g.save.inventory['tires.1'], 1);
  // EV: no exhaust and EV parts only
  g.grant(2_000_000, xpToReach(30));
  g.buyCar('voltstrike');
  const ev = g.cars.find((c) => c.carId === 'voltstrike')!;
  assert.equal(g.install(ev.uid, 'exhaust.1').ok, false);
  assert.equal(g.install(ev.uid, 'engine.1').ok, false, 'ice engine part');
  assert.ok(g.install(ev.uid, 'engine.1.ev').ok);
  // selling
  const v = g.sellValue(ev.uid); const c1 = g.credits;
  const sold = g.sellCar(ev.uid); assert.ok(sold.ok && g.credits === c1 + v);
  assert.equal(g.save.inventory['engine.1.ev'], 1);
  const solo = new Garage(mem());
  assert.equal(solo.sellCar(solo.active!.uid).ok, false);
});

test('medals are measured against the ideal-line time', () => {
  assert.equal(medalFor(104, 100), 'elohim'); assert.equal(medalFor(114, 100), 'gold'); assert.equal(medalFor(129, 100), 'silver'); assert.equal(medalFor(150, 100), 'bronze');
  assert.equal(medalFor(170, 100), undefined); assert.equal(medalFor(0, 100), undefined);
});

test('a run pays, levels, awards medals once, completes objectives and opens parts', () => {
  const g = new Garage(mem());
  const credits0 = g.credits;
  const o = g.recordRun(run({ timeSec: 112 }));
  assert.equal(o.medal, 'gold');
  assert.ok(o.credits > 3000 && g.credits >= credits0 + o.credits);
  assert.ok(o.newMedal);
  assert.ok(o.objectives.some((x) => x.id === 'obj_first_event'));
  assert.ok(o.objectives.some((x) => x.id === 'obj_gold_1'));
  assert.ok(o.achievements.some((x) => x.id === 'forth_first_lap') && o.achievements.some((x) => x.id === 'forth_race_win'));
  assert.ok((g.save.inventory['suspension.2'] ?? 0) === 1, 'the Gold objective hands over a part');
  const o2 = g.recordRun(run({ timeSec: 112 }));
  assert.equal(o2.newMedal, false, 'the same medal is only a bonus once');
  assert.ok(o2.lines.every((l) => !/First/.test(l.label)));
  // the wins unlock rule opens race parts
  assert.equal(g.partUnlocked('engine.3'), false);
  for (const id of ['great_lakes_cliff_raceway', 'pinewood_rally_stage']) g.recordRun(run({ eventId: id, timeSec: 112 }));
  assert.ok(g.partUnlocked('induction.3'), '3 gold medals open the Race boost kit');
  assert.ok(g.level >= 2);
});

test('assists off and clean wet driving pay more', () => {
  const a = new Garage(mem()), b = new Garage(mem());
  const p1 = a.recordRun(run({ timeSec: 140, collisions: 3 }));
  const p2 = b.recordRun(run({ timeSec: 140, collisions: 0, wetness: 0.8, assists: { line: false, brake: false, steer: false } }));
  const pay = (o: { lines: { label: string; credits: number }[] }): number => o.lines.filter((l) => !l.label.startsWith('Objective')).reduce((n, l) => n + l.credits, 0);
  assert.ok(pay(p2) > pay(p1) * 1.3);
});

test('delivery shifts pay, count towards objectives, and chain', () => {
  const g = new Garage(mem());
  const o = g.recordDelivery({ tier: 'rookie', deliveries: 6, onTime: 5, chainBest: 5, earnings: 4200, passengers: 2, food: 2, packages: 2, distanceKm: 9, topMph: 110, collisions: 1, durationSec: 600, shiftScore: 5000, medal: 'silver' });
  assert.ok(o.objectives.some((x) => x.id === 'obj_deliv_1') && o.objectives.some((x) => x.id === 'obj_deliv_chain_4'));
  assert.ok(o.achievements.some((x) => x.id === 'forth_first_delivery') && o.achievements.some((x) => x.id === 'forth_courier_streak'));
  assert.equal(g.save.medals.delivery_rookie, 'silver');
  assert.equal(g.save.stats.deliveries, 6);
  assert.ok(g.credits > 5000 + 4200);
});

test('levels rise with XP and level-ups pay credits', () => {
  assert.equal(levelOf(0), 1); assert.equal(levelOf(xpToReach(10)), 10); assert.equal(levelOf(xpToReach(10) - 1), 9);
  const g = new Garage(mem());
  const c0 = g.credits;
  g.grant(0, xpToReach(5));
  assert.equal(g.level, 5);
  assert.ok(g.credits > c0, 'level-up bonuses');
});

test('saves round-trip through storage and survive corruption', () => {
  const st = mem();
  const g = new Garage(st);
  g.install(g.active!.uid, 'tires.1'); g.setTune(g.active!.uid, { downforce: 30, tirePsi: 99 });
  const g2 = new Garage(st);
  assert.equal(g2.cars.length, 1);
  assert.equal(g2.fitted(g2.active!.uid, 'tires').id, 'tires.1');
  assert.equal(g2.active!.tune.downforce, 30);
  assert.ok(g2.active!.tune.tirePsi <= 42, 'tunes are clamped');
  st.d['apex.garage.v1'] = '{not json';
  assert.equal(new Garage(st).cars.length, 1, 'a corrupt save starts fresh, in the Sovereign');
  assert.ok(g.importJson(g.exportJson()).ok);
  assert.equal(g.importJson('{}').ok, false);
});

test('every objective can be reached and every part unlock names something real', () => {
  const ids = new Set(OBJECTIVES.map((o) => o.id));
  assert.equal(ids.size, OBJECTIVES.length);
  for (const p of PARTS) if (p.unlock.kind === 'objective') assert.ok(ids.has(p.unlock.id), `${p.id} needs ${p.unlock.id}`);
  for (const o of OBJECTIVES) {
    if (o.reward.part) assert.ok(PART_BY_ID[o.reward.part], o.id);
    if (o.reward.car) assert.ok(CAR_BY_ID[o.reward.car], o.id);
  }
  for (const d of CAR_DEFS) if (d.unlock.kind === 'objective') assert.ok(ids.has(d.unlock.id));
});

// ---------- delivery mode ----------
import { DeliveryShift, TIERS, chainMult, fareFor, allowedFor, nextTarget, shiftMedal, type Spot, type ShiftEvent } from '../src/garage/delivery';

const grid = (): Spot[] => { const out: Spot[] = []; let id = 0; for (let x = -2000; x <= 2000; x += 250) for (let z = -2000; z <= 2000; z += 250) out.push({ id: id++, x, z, name: `S${id}` }); return out; };
const feed = (x: number, z: number, speedMps = 5, hit = false) => ({ x, z, speedMps, hit });

test('delivery: offers appear, loading needs you to slow down, capacity limits the stack', () => {
  const sh = new DeliveryShift('rookie', grid(), 7);
  sh.update(0.1, feed(0, 0));
  assert.ok(sh.offers.length >= TIERS.rookie.capacity + 2);
  const o = sh.offers[0];
  assert.deepEqual(sh.update(0.1, feed(o.from.x, o.from.z, 40)).filter((e) => e.type === 'pickup'), [], 'too fast to load');
  const ev = sh.update(0.1, feed(o.from.x, o.from.z, 6));
  assert.ok(ev.some((e) => e.type === 'pickup'));
  assert.equal(sh.carrying.length >= 1, true);
  assert.ok(sh.carrying.length <= TIERS.rookie.capacity);
});

test('delivery: an on-time drop pays, adds time and builds the chain; late drops pay a fraction and break it', () => {
  const sh = new DeliveryShift('pro', grid(), 11);
  sh.update(0.1, feed(0, 0));
  const run = (): ShiftEvent | undefined => {
    const j = sh.offers[0];
    sh.update(0.1, feed(j.from.x, j.from.z, 5));
    sh.update(0.1, feed(j.to.x - 400, j.to.z, 30));
    return sh.update(0.1, feed(j.to.x, j.to.z, 6)).find((e) => e.type === 'deliver');
  };
  const clock0 = sh.clock;
  const d1 = run() as Extract<ShiftEvent, { type: 'deliver' }>;
  assert.ok(d1 && d1.onTime && d1.pay > 0 && d1.chain === 1 && d1.bonusSec > 0);
  assert.ok(sh.clock > clock0 - 1, 'the drop gave time back');
  const d2 = run() as Extract<ShiftEvent, { type: 'deliver' }>;
  assert.ok(d2.chain === 2 && d2.mult > d1.mult);
  // late: pick up, let the timer run out, then deliver
  const j = sh.offers[0];
  sh.update(0.1, feed(j.from.x, j.from.z, 5));
  sh.update(j.allowedSec + 5, feed(j.from.x, j.from.z + 300, 30));
  assert.equal(sh.chain, 0);
  const late = sh.update(0.1, feed(j.to.x, j.to.z, 5)).find((e) => e.type === 'deliver') as Extract<ShiftEvent, { type: 'deliver' }>;
  assert.ok(late && !late.onTime && late.pay < j.fare);
  assert.equal(sh.chainBest, 2);
});

test('delivery: a job left far past its timer fails; knocks cost; the clock ends the shift with a summary', () => {
  const sh = new DeliveryShift('rookie', grid(), 3);
  sh.update(0.1, feed(0, 0));
  const j = sh.offers[0];
  sh.update(0.1, feed(j.from.x, j.from.z, 4));
  const hit = sh.update(0.1, feed(j.from.x, j.from.z, 20, true));
  assert.ok(hit.some((e) => e.type === 'hit') && j.hits === 1);
  const ev = sh.update(j.allowedSec + 60, feed(j.from.x, j.from.z + 800, 30));
  assert.ok(ev.some((e) => e.type === 'failed'));
  const end = sh.update(1000, feed(0, 0, 0)).find((e) => e.type === 'end') as Extract<ShiftEvent, { type: 'end' }>;
  assert.ok(end && end.summary.tier === 'rookie' && end.summary.deliveries === 0);
  assert.ok(sh.over);
  assert.deepEqual(sh.update(1, feed(0, 0)), []);
});

test('delivery: multipliers, fares, timers and medals', () => {
  assert.ok(chainMult(0) === 1 && chainMult(3) > chainMult(1) && chainMult(12) === 3);
  assert.ok(fareFor('package', 1000, TIERS.pro) > fareFor('food', 1000, TIERS.pro));
  assert.ok(allowedFor('food', 1000, TIERS.rookie) < allowedFor('passenger', 1000, TIERS.rookie));
  assert.ok(allowedFor('passenger', 1000, TIERS.legend) < allowedFor('passenger', 1000, TIERS.rookie));
  assert.equal(shiftMedal(TIERS.rookie, 1000), undefined); assert.equal(shiftMedal(TIERS.rookie, 9000), 'gold'); assert.equal(shiftMedal(TIERS.rookie, 20000), 'elohim');
  const sh = new DeliveryShift('rookie', grid(), 1); sh.update(0.1, feed(0, 0));
  assert.ok(nextTarget(sh, { x: 0, z: 0 })?.kind === 'pickup');
});

test('delivery: a full shift flows into the garage', () => {
  const sh = new DeliveryShift('rookie', grid(), 5);
  sh.update(0.1, feed(0, 0));
  for (let i = 0; i < 4; i++) {
    const j = sh.offers[0];
    sh.update(0.1, feed(j.from.x, j.from.z, 5));
    sh.update(0.1, feed(j.to.x, j.to.z, 5));
  }
  const s = sh.summary();
  assert.ok(s.deliveries >= 3 && s.earnings > 0 && s.chainBest >= 3);
  const g = new Garage(mem());
  const o = g.recordDelivery(s);
  assert.ok(o.credits >= s.earnings && g.save.stats.deliveries === s.deliveries);
});


// ---------- where the garage stands ----------
import { findCitySite, findFarmSite, exitPoint, wallBoxes, GARAGE_D, type SiteCtx } from '../src/garage/sites';

const flatCtx = (over: Partial<SiteCtx> = {}): SiteCtx => ({
  ground: () => 12, road: (x, z, pad) => Math.abs(z) < 6 + pad, blocked: () => false,
  runs: [Array.from({ length: 60 }, (_, i) => ({ x: -300 + i * 10, z: 0 }))], center: { x: 0, z: 0 },
  bounds: { minX: -9000, maxX: 9000, minZ: -9000, maxZ: 9000 }, ...over,
});

test('home: a new garage is in the city and the choice is saved', () => {
  const g = new Garage(mem());
  assert.equal(g.home, 'city');
  g.setHome('farm'); assert.equal(g.home, 'farm');
  // @ts-expect-error not a home
  g.setHome('moon'); assert.equal(g.home, 'farm');
});

test('city site: beside the street, clear of the road, bay door facing it, and the car exits onto the street side', () => {
  const site = findCitySite(flatCtx())!;
  assert.ok(site, 'a plot was found');
  assert.ok(Math.abs(site.z) > 14 && Math.abs(site.z) < 40, 'a lot back from the street, not on it');
  const door = exitPoint(site, 0);                         // the front of the building
  assert.ok(Math.abs(door.z) < Math.abs(site.z), 'the door is the side nearer the street');
  assert.ok(Math.abs(site.padY - 12) < 0.01);
  const none = findCitySite(flatCtx({ blocked: () => true }));
  assert.equal(none, null, 'no plot when everything is built over');
  const hilly = findCitySite(flatCtx({ ground: (x, z) => 12 + z * 0.4 }));
  assert.equal(hilly, null, 'no plot on a steep slope');
});

test('farm site: out in the country, level, with a road within reach and trees kept off', () => {
  const ctx = flatCtx({ road: (x, z, pad) => Math.abs(x - 5200) < 5 + pad, tree: (x, z) => Math.hypot(x - 5000, z) < 300 });
  const site = findFarmSite(ctx)!;
  assert.ok(site);
  assert.ok(Math.hypot(site.x, site.z) >= 3000, 'well away from downtown');
  assert.ok(Math.hypot(site.roadX - site.x, site.roadZ - site.z) <= 230);
  assert.ok(Math.hypot(site.x - 5000, site.z) >= 300, 'not among the trees');
  assert.equal(findFarmSite(flatCtx({ road: () => false })), null, 'a farm with no road is no use');
});

test('garage walls leave the door open for the car', () => {
  const site = { home: 'city' as const, x: 100, z: 50, yaw: 0.6, padY: 10, roadX: 0, roadZ: 0 };
  const boxes = wallBoxes(site);
  assert.equal(boxes.length, 5);
  const dx = Math.sin(site.yaw) * (GARAGE_D / 2), dz = Math.cos(site.yaw) * (GARAGE_D / 2);   // the middle of the door
  const inBox = (b: { x: number; z: number; rotY: number; w: number; d: number }, x: number, z: number): boolean => { const c = Math.cos(b.rotY), s = Math.sin(b.rotY), ex = x - b.x, ez = z - b.z; return Math.abs(ex * c - ez * s) < b.w / 2 && Math.abs(ex * s + ez * c) < b.d / 2; };
  assert.ok(!boxes.some((b) => inBox(b, site.x + dx, site.z + dz)), 'nothing blocks the middle of the door');
  assert.ok(boxes.some((b) => inBox(b, site.x - dx * 0.97, site.z - dz * 0.97)), 'the back wall is solid');
});
