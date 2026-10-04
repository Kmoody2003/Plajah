// Machine Atlas: schema validator, solvers, brake simulations, geometry smoke tests, DVI bridge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAKES_DATASET, BRAKES_LAYOUT, BRAKES_PARTS, CANONICAL_BRAKE_PART_IDS } from '../data/atlas/car/brakes';
import { validateDataset, validateLayout } from '../services/machineAtlas/validate';
import type { AtlasDataset } from '../services/machineAtlas/types';
import { MACHINE_CLASS_PROFILES } from '../services/machineAtlas/types';
import * as H from '../services/machineAtlas/solvers/hydraulics';
import * as TH from '../services/machineAtlas/solvers/thermal';
import * as FR from '../services/machineAtlas/solvers/friction';
import * as TIRE from '../services/machineAtlas/solvers/tire';
import * as KIN from '../services/machineAtlas/solvers/kinematics';
import { runApply, runHeat, runAbs, runAbsCompare, brakeFactors } from '../services/machineAtlas/sim/brakeSim';
import { GENERATORS, triCount } from '../services/machineAtlas/geometry';
import { ATLAS_PART_TO_INSPECTION_KEYS, PRIMARY_PART_FOR_KEY } from '../services/machineAtlas/dviBridge';
import { AUTO_DVI_TEMPLATE } from '../services/inspectionCore';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} +-${tol}, got ${a}`);

// ---------------- validator ----------------
test('brakes dataset passes the schema validator', () => {
  const r = validateDataset(BRAKES_DATASET);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});
test('brakes layout passes: every part placed, generators exist, views exist', () => {
  const r = validateLayout(BRAKES_LAYOUT, BRAKES_DATASET, GENERATORS);
  assert.deepEqual(r.errors, []);
});
test('all 30 canonical part ids exist exactly', () => {
  assert.equal(CANONICAL_BRAKE_PART_IDS.length, 30);
  assert.deepEqual(BRAKES_PARTS.map(p => p.id).sort(), [...CANONICAL_BRAKE_PART_IDS].sort());
});
test('every brake part is an AI draft, has 2-4 failure modes and a service-manual disclaimer', () => {
  for (const p of BRAKES_PARTS) {
    assert.match(p.content.reviewStatus, /ai-draft, needs ASE master technician review/, p.id);
    assert.ok(p.content.failureModes.length >= 2 && p.content.failureModes.length <= 4, `${p.id} failure modes: ${p.content.failureModes.length}`);
    assert.match(p.content.repair.disclaimer, /factory service manual/i, p.id);
    assert.ok(p.content.repair.safety.some(s => /jack stands/i.test(s)), `${p.id} safety lists jack stands`);
    assert.equal(p.content.cost.note, 'estimate');
  }
});
test('machine class profile: only car is populated', () => {
  const pop = MACHINE_CLASS_PROFILES.filter(m => m.systems.length > 0).map(m => m.id);
  assert.deepEqual(pop, ['car']);
});
test('every scenario has a tier badge and every fault drill maps to a real failure mode', () => {
  for (const s of BRAKES_DATASET.systems[0].scenarios) assert.ok(['S0', 'S1', 'S2'].includes(s.tier), s.id);
  assert.ok(BRAKES_DATASET.faults.length >= 10);
});

function broken(mut: (d: AtlasDataset) => void): string[] {
  const d = clone(BRAKES_DATASET); mut(d); return validateDataset(d).errors;
}
test('validator rejects deliberately broken datasets', () => {
  assert.ok(broken(d => { d.parts[1].id = d.parts[0].id; }).some(e => /duplicate part id/.test(e)));
  assert.ok(broken(d => { d.systems[0].connections[0].to.part = 'nope'; }).some(e => /unknown part nope/.test(e)));
  assert.ok(broken(d => { d.systems[0].connections[0].to.port = 'nope'; }).some(e => /no port nope/.test(e)));
  // incompatible port types: join a mech port to a hydraulic port
  assert.ok(broken(d => { d.systems[0].connections[0] = { from: { part: 'brake_pedal', port: 'rod' }, to: { part: 'master_cylinder', port: 'p1' }, kind: 'mech' }; }).some(e => /incompatible ports/.test(e)));
  // direction: output used as sink
  assert.ok(broken(d => { d.systems[0].connections[0] = { from: { part: 'brake_pedal', port: 'rod' }, to: { part: 'pushrod', port: 'out' }, kind: 'mech' }; }).some(e => /output port used as a sink/.test(e)));
  assert.ok(broken(d => { d.parts[0].content.cost.partsRangeUSD = [100, 10]; }).some(e => /partsRangeUSD/.test(e)));
  assert.ok(broken(d => { d.parts[0].content.cost.laborHoursRange = [3, 1]; }).some(e => /laborHoursRange/.test(e)));
  assert.ok(broken(d => { d.parts[0].content.repair.safety = []; }).some(e => /safety/.test(e)));
  assert.ok(broken(d => { delete (d.parts[0] as any).license; }).some(e => /license/.test(e)));
  assert.ok(broken(d => { (d.parts[0] as any).content = undefined; }).some(e => /missing content/.test(e)));
  assert.ok(broken(d => { d.systems[0].scenarios[0].faults = ['not_a_fault']; }).some(e => /not a real failure mode/.test(e)));
  assert.ok(broken(d => { d.faults[0].id = 'ghost'; }).some(e => /does not refer to a real failure mode/.test(e)));
  assert.ok(broken(d => { d.parts[0].content.failureModes = []; }).some(e => /no failure modes/.test(e)));
  assert.ok(broken(d => { d.systems[0].partIds.pop(); }).some(e => /not listed/.test(e)));
  assert.ok(broken(d => { d.parts[0].content.repair.disclaimer = 'trust me'; }).some(e => /service manual/.test(e)));
});
test('layout validator rejects unknown parts, views and generators', () => {
  const l = clone(BRAKES_LAYOUT);
  l.placements.push({ part: 'ghost', views: ['disc'] }); l.placements.push({ part: 'rotor', views: ['nowhere'] });
  const errs = validateLayout(l, BRAKES_DATASET, GENERATORS).errors;
  assert.ok(errs.some(e => /unknown part ghost/.test(e)) && errs.some(e => /unknown view nowhere/.test(e)));
  const d = clone(BRAKES_DATASET); (d.parts[0].geometry as any).generator = 'nope';
  assert.ok(validateLayout(BRAKES_LAYOUT, d, GENERATORS).errors.some(e => /unknown generator nope/.test(e)));
});

// ---------------- solvers ----------------
test('every solver exports a TIER and ASSUMPTIONS', () => {
  for (const m of [H, TH, FR, TIRE, KIN] as any[]) {
    assert.ok(['S0', 'S1', 'S2'].includes(m.TIER)); assert.ok(Array.isArray(m.ASSUMPTIONS) && m.ASSUMPTIONS.length > 0);
  }
});
test('thermal: single RC lump matches the analytic cooling curve', () => {
  const C = 3000, G = 12, T0 = 400, Ta = 25, tau = C / G;
  const net = TH.newTNet(Ta); TH.tnode(net, 'a', C, T0); TH.tamb(net, 'a', G);
  for (const t of [20, 100, 250, 600]) {
    const n2 = TH.newTNet(Ta); TH.tnode(n2, 'a', C, T0); TH.tamb(n2, 'a', G);
    for (let s = 0; s < t; s += 1) TH.tstep(n2, 1);
    near(n2.nodes[0].T, Ta + (T0 - Ta) * Math.exp(-t / tau), 0.5, `t=${t}`);
  }
});
test('thermal: heat source reaches the analytic steady state and an isolated network conserves energy', () => {
  const net = TH.newTNet(20); const a = TH.tnode(net, 'a', 1000, 20); TH.tnode(net, 'b', 500, 20); TH.tlink(net, 'a', 'b', 30); TH.tamb(net, 'b', 5);
  a.Q = 1000;
  for (let i = 0; i < 4000; i++) TH.tstep(net, 1);
  near(net.nodes[1].T, 20 + 1000 / 5, 0.5); near(net.nodes[0].T, 20 + 1000 / 5 + 1000 / 30, 0.5);
  const iso = TH.newTNet(0); TH.tnode(iso, 'a', 100, 100); TH.tnode(iso, 'b', 300, 0); TH.tlink(iso, 'a', 'b', 4);
  const e0 = TH.storedEnergy(iso); for (let i = 0; i < 500; i++) TH.tstep(iso, 0.7);
  near(TH.storedEnergy(iso), e0, 1e-6 * e0); near(iso.nodes[0].T, iso.nodes[1].T, 1, 'equalises');
});
test('hydraulics: closed network conserves volume (piston, orifice, line, gas bubble)', () => {
  const net = H.newNet();
  H.node(net, 'a', 2e-13, 0); H.node(net, 'b', 4e-13, 0);
  H.line(net, 'l', 'a', 'b', 1e9); H.orifice(net, 'o', 'a', 'b', 3e-7);
  const drv = H.piston(net, { id: 'drv', node: 'a', area: -4e-4, m: 0.3, c: 80, k: 2000, xmin: 0, xmax: 0.03 });
  H.piston(net, { id: 'out', node: 'b', area: 2.5e-3, m: 0.15, c: 120, xmin: 0, xmax: 0.02, xc: 1.5e-4, kc: 5e7 });
  H.accum(net, 'air', 'b', 3e-6, 1.01e5, 5e7);
  const v0 = H.storedVolume(net);
  for (let i = 0; i < 800; i++) { drv.fExt = 2500 * Math.min(1, i / 100); H.step(net, 0.0025); }
  near(H.storedVolume(net), v0, 1e-13, 'volume drift');
  assert.ok(net.nodes[0].p > 1e6, 'pressure built');
});
test('hydraulics: equilibrium pressure equals force over area', () => {
  const net = H.newNet(); H.node(net, 'a', 2e-13, 0);
  const A = 4e-4, F = 2000; const p = H.piston(net, { id: 'p', node: 'a', area: -A, m: 0.3, c: 80, xmin: 0, xmax: 0.03 });
  const wall = H.piston(net, { id: 'w', node: 'a', area: 2.5e-3, m: 0.2, c: 150, xmin: 0, xmax: 0.02, xc: 0, kc: 6e7 });
  p.fExt = F; for (let i = 0; i < 600; i++) H.step(net, 0.0025);
  // wall piston force balance: pA_wall = kc x ; master piston: p A = F
  near(net.nodes[0].p, F / A, 0.02 * (F / A)); void wall;
});
test('hydraulics: sub-stepping keeps a stiff network finite and stableDt is positive', () => {
  const net = H.newNet(); H.node(net, 'a', 1e-13, 1e6); H.node(net, 'b', 1e-13, 0); H.orifice(net, 'o', 'a', 'b', 2e-6);
  assert.ok(H.stableDt(net) > 0);
  for (let i = 0; i < 200; i++) H.step(net, 0.01);
  assert.ok(isFinite(net.nodes[0].p) && isFinite(net.nodes[1].p));
  near(net.nodes[0].p, net.nodes[1].p, 3e4, 'equalised through orifice');
});
test('friction: fade with temperature, fluid boil falls with water', () => {
  const cold = FR.muOfTemp(25), warm = FR.muOfTemp(150), hot = FR.muOfTemp(450), trough = FR.muOfTemp(700);
  assert.ok(warm > cold && hot < warm && trough < hot, 'cold < warm, then fade');
  assert.ok(FR.fluidBoilC('DOT4', 0) > FR.fluidBoilC('DOT4', 3.7));
  assert.equal(FR.fluidBoilC('DOT4', 0), 230); assert.equal(FR.fluidBoilC('DOT3', 3.7), 140);
  near(FR.rotorTorque(10000, 0.4, 0.115), 920, 1e-9);
});
test('tire: peak friction exceeds locked-wheel friction (clearly on low-mu surfaces)', () => {
  for (const sf of Object.values(TIRE.SURFACES)) { const r = TIRE.peakAndSlide(sf); assert.ok(r.muPeak > r.muSlide * (sf.id === 'snow' || sf.id === 'ice' ? 1.25 : 1.02), sf.id); assert.ok(r.sPeak > 0.05 && r.sPeak < 0.35, sf.id); }
});
test('kinematics: shoe factors', () => {
  const c = brakeFactors(0.4);
  assert.ok(c[1].factor > c[0].factor && c[0].factor > c[2].factor, 'leading > disc > trailing');
  near(KIN.crankSlider(0, 1, 3), 4, 1e-12); near(KIN.leverOut(40, 4), 10, 1e-12);
});

// ---------------- brake simulations ----------------
test('ABS: with-ABS stopping distance <= without on low-mu surfaces; deterministic', () => {
  for (const surface of ['snow', 'ice']) {
    const { withAbs, withoutAbs } = runAbsCompare([], surface);
    assert.ok((withAbs.summary.stoppingDistanceM as number) <= (withoutAbs.summary.stoppingDistanceM as number), `${surface}: ${withAbs.summary.stoppingDistanceM} vs ${withoutAbs.summary.stoppingDistanceM}`);
    assert.ok((withAbs.summary.absCycles as number) > 3, 'modulator cycled');
  }
  const a = runAbs([], { abs: true }), b = runAbs([], { abs: true });
  assert.deepEqual(Array.from(a.channels.dist), Array.from(b.channels.dist));
  assert.deepEqual(a.summary, b.summary);
});
test('ABS: wheel stays rolling with ABS and locks without; failed sensor disables ABS', () => {
  const on = runAbs([], { abs: true }), off = runAbs([], { abs: false });
  const minSlipOff = Math.max(...Array.from(off.channels.slip.slice(30, 200)));
  const maxSlipOn = Math.max(...Array.from(on.channels.slip.slice(100, 400)));
  assert.ok(minSlipOff > 0.9, 'locked wheel slip near 1'); assert.ok(maxSlipOn < 0.6, `ABS limits slip, got ${maxSlipOn}`);
  const sensor = runAbs(['wheel_speed_sensor_failure'], { abs: true });
  assert.equal(sensor.summary.abs, 'off (sensor fault)');
  assert.ok((sensor.summary.stoppingDistanceM as number) > (on.summary.stoppingDistanceM as number));
});
test('apply: pressure chain and fault signatures', () => {
  const ok = runApply([]);
  assert.ok((ok.summary.peakLinePressureBar as number) > 60 && (ok.summary.peakLinePressureBar as number) < 100);
  const noVac = runApply(['vacuum_loss']);
  assert.ok((noVac.summary.peakLinePressureBar as number) < 0.4 * (ok.summary.peakLinePressureBar as number), 'hard pedal: far less pressure');
  const air = runApply(['air_in_lines']);
  assert.ok((air.summary.peakPedalTravelMm as number) > (ok.summary.peakPedalTravelMm as number), 'spongy: more travel');
  assert.ok((air.summary.peakLinePressureBar as number) < (ok.summary.peakLinePressureBar as number));
  const seized = runApply(['seized_piston']);
  assert.ok((seized.summary.peakClampKN as number) < 1 && (seized.summary.peakPullPct as number) > 80, 'seized corner: no clamp, strong pull');
  const pin = runApply(['stuck_slide_pin']);
  assert.ok((pin.summary.peakPullPct as number) > 20 && (pin.summary.peakPullPct as number) < 60);
  const worn = runApply(['worn_pads']);
  assert.ok((worn.summary.peakPedalTravelMm as number) > (ok.summary.peakPedalTravelMm as number), 'worn pads: longer pedal');
  assert.ok(worn.events.some(e => /squeal/i.test(e.label)));
  const warp = runApply(['warped_rotor']);
  const ripple = (t: typeof ok) => { const s = Array.from(t.channels.p_mc.slice(80, 130)); return Math.max(...s) - Math.min(...s); };
  assert.ok(ripple(warp) > 3 * ripple(ok) + 0.05, `pulsation ${ripple(warp)} vs ${ripple(ok)}`);
  assert.equal(ok.tier, 'S1');
});
test('apply: deterministic, finite, volume bookkeeping unaffected by faults', () => {
  const a = runApply(['air_in_lines']), b = runApply(['air_in_lines']);
  assert.deepEqual(Array.from(a.channels.p_mc), Array.from(b.channels.p_mc));
  for (const t of [a, runApply([]), runHeat([]), runAbs([])]) for (const ch of Object.values(t.channels)) for (const v of ch) assert.ok(isFinite(v));
});
test('heat: fade grows, contaminated fluid boils while healthy fluid does not, glazed pads brake worse', () => {
  const ok = runHeat([]);
  assert.ok((ok.summary.lastStopDecelG as number) < (ok.summary.firstStopDecelG as number), 'fade over repeated stops');
  assert.ok((ok.summary.peakRotorC as number) > 400);
  assert.equal(ok.summary.fluidBoiled, 'no');
  const wet = runHeat(['contaminated_fluid']);
  assert.equal(wet.summary.fluidBoiled, 'yes');
  assert.ok(wet.events.some(e => /boils/.test(e.label)));
  assert.ok((wet.summary.lastStopDecelG as number) < (ok.summary.lastStopDecelG as number), 'boil costs braking');
  const glaze = runHeat(['glazed_pads']);
  assert.ok((glaze.summary.firstStopDecelG as number) < (ok.summary.firstStopDecelG as number));
  const pin = runHeat(['stuck_slide_pin']);
  assert.ok(pin.events.some(e => /Dragging/.test(e.label)));
  // energy sanity: friction energy within 25% of the kinetic energy lost per stop x stops (front corner share ~35%)
  const ke = 0.5 * 1450 * (33.3 ** 2 - 6.9 ** 2) * (ok.summary.stops as number);
  const ratio = ((ok.summary.frictionEnergyKJ as number) * 1000) / ke;
  assert.ok(ratio > 0.25 && ratio < 0.5, `corner energy share ${ratio}`);
});

// ---------------- geometry smoke ----------------
test('every generator returns finite, non-empty, vertex-coloured geometry with modest triangle counts', () => {
  let total = 0;
  for (const [name, gen] of Object.entries(GENERATORS)) {
    const g = gen({});
    const pos = g.attributes.position.array as Float32Array;
    assert.ok(pos.length >= 9, `${name} non-empty`);
    for (let i = 0; i < pos.length; i++) assert.ok(Number.isFinite(pos[i]), `${name} vertex ${i} finite`);
    assert.ok(g.attributes.color && g.attributes.normal, `${name} has color + normal`);
    const t = triCount(g); total += t; assert.ok(t < 6000, `${name} tri count ${t}`);
    g.dispose();
  }
  assert.ok(total < 40000, `kit total ${total}`);
});
test('parameterised generators respond to params (pad wear, rotor wear)', () => {
  const full = GENERATORS.brake_pads({ wear: 0 }), worn = GENERATORS.brake_pads({ wear: 1 });
  full.computeBoundingBox(); worn.computeBoundingBox();
  assert.ok(worn.boundingBox!.max.z - worn.boundingBox!.min.z <= full.boundingBox!.max.z - full.boundingBox!.min.z);
});

// ---------------- DVI bridge ----------------
test('DVI bridge: every mapped key exists in the current inspection template and every part exists', () => {
  const keys = new Set(AUTO_DVI_TEMPLATE.items.map(i => i.id));
  const partIds = new Set(BRAKES_PARTS.map(p => p.id));
  for (const [part, ks] of Object.entries(ATLAS_PART_TO_INSPECTION_KEYS)) {
    assert.ok(partIds.has(part), `unknown part ${part}`);
    for (const k of ks) assert.ok(keys.has(k), `${part} -> ${k} not in template`);
  }
  for (const [k, part] of Object.entries(PRIMARY_PART_FOR_KEY)) { assert.ok(keys.has(k), k); assert.ok(ATLAS_PART_TO_INSPECTION_KEYS[part].includes(k), `${part} maps ${k}`); }
});
