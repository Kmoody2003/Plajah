// Electronics Lab: netlisting, our simulator against textbook results, starter designs, checks.
//   npm run test:elec
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSi, si, COMPONENTS, compDefaults } from '../services/elec/components';
import { type Circuit, netlist, bom } from '../services/elec/circuit';
import { simulate } from '../services/elec/sim';
import { DESIGNS, designById, verifyDesign } from '../services/elec/designs';
import { checkCircuit, summarize } from '../services/elec/checks';
import { circuitSvg } from '../services/elec/render';
import { spiceNetlist } from '../services/elec/exportSpice';

const part = (kind: string, ref: string, x: number, y: number, rot = 0, params: Record<string, string | number> = {}) => ({ id: ref, kind, ref, x, y, rot, params: { ...compDefaults(COMPONENTS.find(c => c.kind === kind)!), ...params } });
/** Battery (pins at (0,-2)/(0,2)) across a resistor placed vertically at x=4. */
const divider = (r1: string, r2: string): Circuit => ({ name: 'divider', parts: [part('dcsupply', 'J1', 0, 0, 0, { V: 10 }), part('resistor', 'R1', 4, -3, 1, { R: r1 }), part('resistor', 'R2', 4, 1, 1, { R: r2 }), part('ground', 'G', 0, 3)],
  wires: [{ id: 'a', pts: [[0, -2], [0, -5], [4, -5]] }, { id: 'b', pts: [[4, -1], [4, -1]] }, { id: 'c', pts: [[0, 2], [0, 3], [4, 3]] }] });

test('SI values parse and format', () => {
  assert.equal(parseSi('4.7k'), 4700); assert.ok(Math.abs(parseSi('100n') - 1e-7) < 1e-20); assert.equal(parseSi('2.2u'), 2.2e-6); assert.equal(parseSi('10MΩ'), 1e7); assert.equal(parseSi(0.25), 0.25);
  assert.equal(si(4700), '4.7k'); assert.equal(si(1e-7), '100n');
});

test('netlist joins pins on wires, points on segments, and grounds', () => {
  const c = divider('1k', '1k'); const nl = netlist(c);
  assert.equal(nl.hasGround, true); assert.equal(nl.pinNet.J1['-'], 0); assert.equal(nl.pinNet.R2['2'], 0);
  assert.equal(nl.pinNet.R1['2'], nl.pinNet.R2['1']); assert.notEqual(nl.pinNet.R1['1'], nl.pinNet.R1['2']);
  assert.equal(nl.netCount, 3);
});

test('DC: a resistor divider splits the voltage', () => {
  const r = simulate(divider('3k', '1k'), { mode: 'dc' }); const mid = r.netlist.pinNet.R1['2'];
  assert.ok(Math.abs(r.nets[mid][0] - 2.5) < 0.01, `mid ${r.nets[mid][0]}`);
  assert.ok(Math.abs(r.parts.R1.i[0] - 2.5e-3) < 2e-5);
});

test('every starter design is wired exactly as intended', () => {
  for (const d of DESIGNS) assert.deepEqual(verifyDesign(d), [], d.id);
});

test('LED lamp: each white LED runs near 16 mA and the USB port is not overloaded', () => {
  const d = designById('usb-led-lamp')!; const r = simulate(d.circuit, d.sim); assert.ok(r.converged);
  for (const ref of ['D1', 'D2', 'D3']) { const i = r.parts[ref].i[0]; assert.ok(i > 0.014 && i < 0.019, `${ref} ${i}`); }
  assert.ok(Math.abs(r.parts.J1.i[0]) < 0.1);
});

test('555 astable matches f = 1.44 / ((R1 + 2·R2)·C)', () => {
  const blink = designById('555-led-blinker')!; const rb = simulate(blink.circuit, blink.sim);
  const fb = 1.44 / ((1e3 + 2 * 68e3) * 10e-6); assert.ok(Math.abs(rb.freq.U1 - fb) / fb < 0.05, `blinker ${rb.freq.U1} vs ${fb}`);
  const tone = designById('555-speaker-tone')!; const rt = simulate(tone.circuit, tone.sim);
  const ft = 1.44 / ((1e3 + 2 * 10e3) * 47e-9); assert.ok(Math.abs(rt.freq.U1 - ft) / ft < 0.05, `tone ${rt.freq.U1} vs ${ft}`);
  // The capacitor swings between one third and two thirds of the supply.
  const thr = rb.netlist.pinNet.U1.THR; const late = rb.nets[thr].slice(2000); const vcc = rb.nets[rb.netlist.pinNet.U1.VCC][0];
  assert.ok(Math.max(...late) < vcc * 0.7 && Math.min(...late) > vcc * 0.3);
});

test('7805 holds 5 V and its junction temperature is computed', () => {
  const d = designById('5v-regulated-supply')!; const r = simulate(d.circuit, d.sim); const out = r.netlist.pinNet.U1.OUT;
  assert.ok(Math.abs(r.nets[out][0] - 5) < 0.02, `out ${r.nets[out][0]}`);
  const f = checkCircuit(d.circuit, r); const tj = f.find(x => x.id === 'tj-U1')!; assert.equal(tj.level, 'pass'); assert.match(tj.title, /°C/);
});

test('RC charging follows 1 − e^(−t/RC)', () => {
  const d = designById('rc-low-pass')!; const r = simulate(d.circuit, d.sim); const n = r.netlist.pinNet.C1['1'];
  const i1ms = r.time.findIndex(t => t >= 1e-3); assert.ok(Math.abs(r.nets[n][i1ms] / 5 - (1 - Math.exp(-1))) < 0.02, `${r.nets[n][i1ms]}`);
});

test('starter designs carry no errors', () => {
  for (const d of DESIGNS) { const f = checkCircuit(d.circuit, simulate(d.circuit, d.sim)); assert.equal(summarize(f).errors, 0, `${d.id}: ${f.filter(x => x.level === 'error').map(x => x.title).join('; ')}`); }
});

test('stress checks catch an LED with no resistor and an overloaded resistor', () => {
  const c: Circuit = { name: 'bad', parts: [part('usb5v', 'J1', 0, 0), part('led', 'D1', 4, -2), part('ground', 'G', 0, 3)], wires: [{ id: 'a', pts: [[0, -2], [2, -2]] }, { id: 'b', pts: [[6, -2], [6, 2], [0, 2]] }] };
  const f = checkCircuit(c, simulate(c, { mode: 'dc' })); assert.equal(f.find(x => x.id === 'led-D1')?.level, 'error');
  const hot = divider('10', '10'); const fh = checkCircuit(hot, simulate(hot, { mode: 'dc' })); assert.equal(fh.find(x => x.id === 'r-R1')?.level, 'error');
});

test('wiring checks flag open pins and shorted supplies', () => {
  const c: Circuit = { name: 'open', parts: [part('dcsupply', 'J1', 0, 0), part('resistor', 'R1', 4, -2)], wires: [{ id: 'a', pts: [[0, -2], [2, -2]] }, { id: 's', pts: [[0, -2], [-2, -2], [-2, 2], [0, 2]] }] };
  const f = checkCircuit(c); assert.ok(f.some(x => x.id === 'open-R1-2')); assert.ok(f.some(x => x.id === 'short-J1')); assert.ok(f.some(x => x.id === 'no-ground'));
});

test('regulatory pre-checks follow the design', () => {
  const coin = designById('coin-cell-keychain-light')!; const fc = checkCircuit(coin.circuit, simulate(coin.circuit, coin.sim));
  assert.match(fc.find(x => x.id === 'reese')!.cite!, /16 CFR part 1263/);
  const blink = designById('555-led-blinker')!; const fb = checkCircuit(blink.circuit, simulate(blink.circuit, blink.sim));
  assert.equal(fb.find(x => x.id === 'fcc-digital')!.level, 'pass');
  const fast = designById('555-speaker-tone')!; const c2 = JSON.parse(JSON.stringify(fast.circuit)) as Circuit; c2.parts.find(p => p.ref === 'C1')!.params.C = '4.7n';
  const f2 = checkCircuit(c2, simulate(c2, { mode: 'tran', tEnd: 0.001, steps: 4000 })); const fcc = f2.find(x => x.id === 'fcc-digital')!;
  assert.match(fcc.cite!, /15\.103\(h\)/); assert.equal(fcc.level, 'info');
  const mains: Circuit = { name: 'mains', parts: [part('mains', 'J1', 0, 0), part('resistor', 'R1', 4, -2, 0, { R: '100k', P: '1' }), part('ground', 'G', 0, 3)], wires: [{ id: 'a', pts: [[0, -2], [2, -2]] }, { id: 'b', pts: [[6, -2], [6, 2], [0, 2]] }] };
  const fm = checkCircuit(mains, null, { market: 'both' });
  assert.ok(fm.some(x => x.id === 'mains-fuse' && x.level === 'error')); assert.ok(fm.some(x => x.id === 'lvd' && x.level === 'warn')); assert.ok(fm.some(x => x.id === 'nrtl'));
  assert.ok(!checkCircuit(mains, null, { market: 'EU' }).some(x => x.market === 'US'));
});

test('exports: SVG sheet, SPICE netlist, parts list', () => {
  const d = designById('555-speaker-tone')!;
  const s = circuitSvg(d.circuit, { title: d.title }); assert.match(s.svg, /^<svg[^>]+viewBox/); assert.ok(s.width > 200 && s.height > 150);
  const sp = spiceNetlist(d.circuit); assert.match(sp, /^\* 555 tone/); assert.match(sp, /\nQQ1 /); assert.match(sp, /\nXU1 .* NE555/); assert.match(sp, /\.end\n$/);
  const rows = bom(d.circuit); assert.deepEqual(rows[0], ['Qty', 'References', 'Part', 'Value']); assert.ok(rows.some(r => r[1] === 'R1, R3' && r[3] === '1kΩ'));
});

// ---------------------------------------------------------------- boards, prompt-to-design, safety, sourcing
import { RECIPES, recipeById, recipeDefaults, interpret, fromLlm, e12Above } from '../services/elec/recipes';
import { fretPosition } from '../services/elec/guitar';
import { designHazards, processHazards, needsAck, recallQueries, trimCpsc, advisoriesFor } from '../services/safety/hazards';
import { sourceLines, digikeyOffers, mouserOffers, offerWarnings } from '../services/supply/sourcing';
import { SUPPLIERS, suppliersFor } from '../services/supply/directory';
import { BUILD_TERMS, BUILD_TERMS_VERSION } from '../services/safety/terms';

const vd = (b: ReturnType<typeof recipeDefaults> extends never ? never : any) => verifyDesign({ id: 'x', title: '', about: '', circuit: b.circuit, sim: b.sim, licence: 'CC0-1.0', tags: [], pairs: b.pairs });

test('every recipe draws exactly its intended wiring, simulates, and passes the checks', () => {
  for (const r of RECIPES) {
    const b = r.build(recipeDefaults(r));
    const errs = vd(b); assert.deepEqual(errs, [], `${r.id}: ${errs.slice(0, 3).join('; ')}`);
    const sim = simulate(b.circuit, b.sim); assert.ok(sim.converged, `${r.id} did not converge`);
    const errors = checkCircuit(b.circuit, sim, { market: b.market }).filter(f => f.level === 'error');
    assert.deepEqual(errors.map(e => e.id), [], r.id);
  }
});

test('recipes scale with their parameters', () => {
  for (const n of [1, 5, 12]) { const b = recipeById('lamp')!.build({ leds: n, color: 'blue', power: 'battery' }); assert.equal(b.circuit.parts.filter(p => p.kind === 'led').length, n); assert.equal(vd(b).length, 0); }
  const m = recipeById('midi')!.build({ knobs: 2, buttons: 7 }); assert.match(m.firmware!.code, /board\.GP26, board\.GP27,\)/); assert.match(m.firmware!.code, /board\.GP17,\)/);
  const c = recipeById('charger')!.build({ ports: 3, amps: '2.4', mains: '230' }); assert.equal(c.market, 'EU'); assert.equal(vd(c).length, 0);
  assert.equal(e12Above(173), 180); assert.equal(e12Above(120), 120); assert.equal(e12Above(3300.5), 3900);
});

test('a lamp LED sees about the current the recipe designed for', () => {
  const b = recipeById('lamp')!.build({ leds: 3, color: 'white', power: 'usb', brightness: 'normal' }); const s = simulate(b.circuit, b.sim);
  const d = b.circuit.parts.find(p => p.ref === 'D1')!; const i = s.parts[d.id].i[0]; assert.ok(i > 0.01 && i < 0.02, `${i}`);
});

test('the speaker amp drives the driver; the Pi sees its supply; GPIO LEDs light', () => {
  const sp = recipeById('speaker')!.build(recipeDefaults(recipeById('speaker')!)); const s = simulate(sp.circuit, sp.sim);
  const ls = sp.circuit.parts.find(p => p.kind === 'speaker')!; const P = s.parts[ls.id].p.reduce((a, x) => a + x, 0) / s.parts[ls.id].p.length; assert.ok(P > 0.05 && P < 3, `speaker ${P} W`);
  const pi = recipeById('pi')!.build({ model: 'Pi 5' }); const ps = simulate(pi.circuit, pi.sim); const u = pi.circuit.parts.find(p => p.kind === 'rpi')!; assert.ok(ps.parts[u.id].extra.vsup[0] > 4.9);
  const led = pi.circuit.parts.find(p => p.ref === 'D1')!; assert.ok(ps.parts[led.id].i[0] > 0.002, 'status LED on GPIO17');
});

test('board checks catch an overloaded pin and an undersized Pi supply', () => {
  const pi = recipeById('pi')!.build({ model: 'Pi 5' }); const c = { ...pi.circuit, parts: pi.circuit.parts.map(p => p.kind === 'usb5v' ? { ...p, params: { ...p.params, Imax: '1' } } : p.ref === 'R1' ? { ...p, params: { ...p.params, R: '10' } } : p) };
  const f = checkCircuit(c, simulate(c, { mode: 'dc' }));
  assert.ok(f.some(x => x.id === 'gpio-U1'), 'pin overload'); assert.ok(f.some(x => x.id === 'pisup-U1' && x.level === 'error'));
  assert.ok(f.some(x => x.id === 'fcc-radio') && f.some(x => x.id === 'red-cyber') && f.some(x => x.id === 'ca-iot'));
});

test('the guitar plan follows the equal-temperament rule and the scale length', () => {
  assert.ok(Math.abs(fretPosition(648, 12) - 324) < 1e-9); assert.ok(Math.abs(fretPosition(648, 1) - 36.37) < 0.01);
  const g = recipeById('guitar')!.build({ scale: 648, pickups: 2, type: 'humbucker', frets: 22 });
  const plan = g.body!; assert.ok(plan.bridgeY > 85 && plan.bridgeY < 130, `${plan.bridgeY}`);
  assert.equal(plan.model.entities.filter(e => e.layer === 'FRET_SLOTS').length, 22); assert.equal(plan.model.entities.filter(e => e.layer === 'PICKUP').length, 2);
  const bass = recipeById('guitar')!.build({ bass: true, scale: 864, pickups: 1, type: 'single', frets: 20 }); assert.ok(bass.body!.bridgeY >= 90);
});

test('enclosures hold every part with clearance and give laser panels', () => {
  const b = recipeById('midi')!.build({ knobs: 3, buttons: 7 }); const e = b.enclosure!;
  for (const it of e.items) { assert.ok(it.x - it.w / 2 >= -0.01 && it.x + it.w / 2 <= e.W + 0.01, `${it.name} x`); assert.ok(it.y - it.d / 2 >= -0.01 && it.y + it.d / 2 <= e.D + 0.01, `${it.name} y`); assert.ok(it.h <= e.H, `${it.name} h`); }
  const loops = e.panels.entities.filter(x => x.type === 'polyline').length; assert.ok(loops >= 6 + 3 + 7, `${loops} panel loops`); // 6 panels + knob + button holes
  assert.equal(e.model.meshes.length, 2); assert.ok(e.model.meshes[0].indices.length > 100);
});

test('the prompt reader hears counts, colours, scale lengths and markets', () => {
  const a = interpret('a USB desk lamp with 6 warm white LEDs'); assert.equal(a.recipe?.id, 'lamp'); assert.equal(a.values.leds, 6);
  const g = interpret('my own electric guitar with two humbuckers, 24.75" scale'); assert.equal(g.recipe?.id, 'guitar'); assert.equal(g.values.scale, 629); assert.equal(g.values.pickups, 2);
  assert.equal(interpret('wifi led strip light for home assistant').recipe?.id, 'smart-lamp');
  assert.equal(interpret('usb charger for the uk, 2 ports').values.mains, '230');
  assert.equal(interpret('a teapot').recipe, null);
  // A model reply is validated: unknown keys and out-of-range values are dropped or clamped.
  const m = fromLlm('Sure! {"recipe":"midi","values":{"knobs":40,"buttons":"x","evil":1},"market":"EU"}', 'controller'); assert.equal(m.recipe?.id, 'midi'); assert.equal(m.values.knobs, 3); assert.equal(m.values.evil, undefined); assert.equal(m.market, 'EU');
});

test('safety: hazards follow the design and critical ones need acknowledgement', () => {
  const ch = recipeById('charger')!.build(recipeDefaults(recipeById('charger')!)); const h = designHazards({ circuit: ch.circuit, recipe: 'charger' });
  assert.equal(h[0].severity, 'critical'); assert.ok(needsAck(h).some(x => x.id === 'mains-shock'));
  const coin = designHazards({ circuit: designById('coin-cell-keychain-light')!.circuit }); assert.ok(coin.some(x => x.id === 'coin-ingestion' && x.ack));
  assert.ok(designHazards({ circuit: ch.circuit, toy: true }).some(x => x.id === 'small-parts'));
  assert.ok(processHazards('laser-co2', 'PVC').some(x => x.id === 'laser-fumes' && x.severity === 'critical'));
  assert.ok(needsAck(processHazards('lathe')).length >= 1 && needsAck(processHazards('lpbf')).length >= 1);
  { const q = recallQueries(ch.circuit, 'charger'); assert.ok(q.includes('power adapter') && q.includes('USB charger') && q.length <= 6); }
  assert.ok(advisoriesFor(ch.circuit).some(a => a.id === 'adv-uncert-acdc'));
  const hit = trimCpsc({ RecallID: 1, RecallNumber: '26670', RecallDate: '2026-08-06T00:00:00', Title: 'T', URL: 'https://x', Hazards: [{ Name: 'Ingestion' }], Remedies: [{ Name: 'Refund' }], Products: [{ NumberOfUnits: 'About 4,930' }] });
  assert.deepEqual([hit.date, hit.hazard, hit.units], ['2026-08-06', 'Ingestion', 'About 4,930']);
  assert.ok(BUILD_TERMS.some(t => /infringe/.test(t.body)) && BUILD_TERMS.some(t => /assumption of risk/i.test(t.heading)) && /^\d{4}-\d{2}-\d{2}$/.test(BUILD_TERMS_VERSION));
});

test('sourcing groups parts and reads distributor replies', () => {
  const lines = sourceLines(recipeById('charger')!.build({ ports: 2, amps: '2.4', mains: '120' }).circuit);
  assert.ok(lines.find(l => l.part.startsWith('AC-DC'))!.authorised); assert.equal(lines.find(l => l.refs.includes('P1'))!.qty, 2);
  const dk = digikeyOffers({ Products: [{ ManufacturerProductNumber: 'NE555P', Manufacturer: { Name: 'TI' }, Description: { ProductDescription: 'Timer' }, QuantityAvailable: 1000, UnitPrice: 0.52, ProductUrl: 'u', ProductStatus: { Status: 'Obsolete' } }] });
  assert.equal(dk[0].mpn, 'NE555P'); assert.match(offerWarnings(dk[0])[0], /Obsolete/);
  const mo = mouserOffers({ SearchResults: { Parts: [{ ManufacturerPartNumber: 'L7805CV', Manufacturer: 'ST', AvailabilityInStock: '12,345', PriceBreaks: [{ Price: '$0.61', Currency: 'USD' }], ProductDetailUrl: 'u' }] } });
  assert.deepEqual([mo[0].stock, mo[0].price], [12345, 0.61]);
  assert.ok(suppliersFor(['plush']).length >= 2 && suppliersFor(['textile']).length >= 4 && SUPPLIERS.every(s => /^https:\/\//.test(s.url)));
});
