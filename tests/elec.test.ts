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
