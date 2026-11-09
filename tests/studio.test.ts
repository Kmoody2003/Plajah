// Build Studio: CSG volumes, shapes and print checks, breadboard → simulator mapping, block code
// generation, and the interpreter blinking an LED in the circuit simulator.
//   npm run test:studio
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { union, subtract, intersect, volume, toMesh } from '../services/build/studio/csg';
import { makeShape, solidOf, groupShapes, printReport, align, mirror, shapeBounds, meshes, rotateGroup, scaleGroup, PRINTERS, type Scene } from '../services/build/studio/shapes';
import { textGrid } from '../services/build/studio/pixelFont';
import { connect, evaluate, verifyCircuit, fits, holeKey, pinKey, type CircuitProject } from '../services/build/studio/breadboard';
import { toArduino, toMicroPython, Vm, sid, num, type Program, type Io } from '../services/build/studio/blocks';
import { Runtime } from '../services/build/studio/runtime';
import { STUDIO_STARTERS, buildStarter } from '../services/build/studio/starters';
import { LESSONS, wiredLeds } from '../services/build/studio/lessons';
import { normalizeProject } from '../services/build/studio/project';
import { studio3dHazards, studioCircuitHazards } from '../services/build/studio/safety';
import { writeStl } from '../services/mech/geometry';
import { parseLaunch, routeIdea } from '../services/build/launch';

const close = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
/** Area of a regular n-gon inscribed in radius r: the exact cross-section of our faceted cylinder. */
const ngon = (n: number, r: number) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);

// ---------------------------------------------------------------- CSG
test('box minus a through-cylinder has the exact volume', () => {
  const box = makeShape('box', [0, 0], { size: [20, 20, 20] });
  const cyl = makeShape('cylinder', [0, 0], { size: [10, 10, 30], hole: true, sides: 32 });
  const v = volume(solidOf(groupShapes([box, cyl])));
  close(v, 8000 - ngon(32, 5) * 20, 1e-6, 'box − cylinder');
  // A blind hole (cylinder only 10 mm deep from the top) removes half as much.
  const blind = makeShape('cylinder', [0, 0], { size: [10, 10, 10], pos: [0, 0, 20 - 5], hole: true, sides: 32 });
  close(volume(solidOf(groupShapes([makeShape('box', [0, 0], { size: [20, 20, 20] }), blind]))), 8000 - ngon(32, 5) * 10, 1e-6, 'blind hole');
});
test('union, subtract and intersect of overlapping boxes', () => {
  const a = solidOf(makeShape('box', [0, 0], { size: [20, 20, 20] }));
  const b = solidOf(makeShape('box', [10, 0], { size: [20, 20, 20] }));
  close(volume(union(a, b)), 8000 + 8000 - 4000, 1e-6, 'union');
  close(volume(subtract(a, b)), 4000, 1e-6, 'subtract');
  close(volume(intersect(a, b)), 4000, 1e-6, 'intersect');
});
test('every primitive is a closed solid with a sensible volume', () => {
  close(volume(solidOf(makeShape('wedge'))), 4000, 1e-6, 'wedge');
  close(volume(solidOf(makeShape('pyramid'))), 8000 / 3, 1e-6, 'pyramid');
  close(volume(solidOf(makeShape('sphere', [0, 0], { sides: 64 }))), (4 / 3) * Math.PI * 1000, 60, 'sphere');
  close(volume(solidOf(makeShape('cone', [0, 0], { sides: 64 }))), (Math.PI * 100 * 20) / 3, 15, 'cone');
  for (const k of ['torus', 'star', 'heart', 'text'] as const) assert.ok(volume(solidOf(makeShape(k))) > 100, k);
  // Text volume = filled cells × cell volume.
  const t = makeShape('text', [0, 0], { text: 'HI', size: [22, 14, 2] }); const g = textGrid('HI'); const cells = g.flat().filter(Boolean).length;
  close(volume(solidOf(t)), cells * (22 / g[0].length) * (14 / 7) * 2, 1e-6, 'text cells');
});
test('rotation and mirroring keep volume; mirror flips handedness', () => {
  const w = makeShape('wedge', [0, 0], { rot: [30, 45, 10] });
  close(volume(solidOf(w)), 4000, 1e-6, 'rotated wedge');
  const m = mirror(makeShape('wedge'), 0); close(volume(solidOf(m)), 4000, 1e-6, 'mirrored wedge');
  const b0 = shapeBounds(makeShape('wedge')); const b1 = shapeBounds(m); close(b0.min[0], b1.min[0], 1e-9);
});
test('group tools: align, rotate and scale groups', () => {
  const a = makeShape('box', [0, 0], { size: [10, 10, 10] }), b = makeShape('box', [30, 15], { size: [10, 10, 20] });
  const [a2, b2] = align([a, b], 0, 'min'); close(shapeBounds(a2).min[0], shapeBounds(b2).min[0], 1e-9);
  const g = groupShapes([a, b]); const g2 = rotateGroup(g, 2, 90); close(g2.size[0], g.size[1], 1e-9, 'quarter turn swaps width and depth');
  const g3 = scaleGroup(g, [g.size[0] * 2, g.size[1], g.size[2]]); close(g3.size[0], g.size[0] * 2, 1e-9);
});
test('STL export and print checks', () => {
  const p = buildStarter('keychain', 'ANA')!; const ms = meshes(p.scene); assert.ok(ms.length >= 1);
  const stl = writeStl(ms, 'keychain'); const tris = ms.reduce((s, m) => s + m.indices.length / 3, 0); assert.equal(stl.length, 84 + tris * 50);
  assert.ok(Math.min(...ms.flatMap(m => Array.from(m.positions).filter((_, i) => i % 3 === 2))) >= -1e-6, 'export sits on the bed');
  const kids = printReport(p.scene, PRINTERS[1], 'kids'); assert.ok(!kids.findings.some(f => f.level === 'error')); assert.ok(kids.findings.some(f => f.id === 'small-parts'));
  assert.ok(!kids.findings.some(f => f.id.startsWith('overhang')), 'letters rest on the tag');
  assert.ok(printReport(p.scene, PRINTERS[1], 'under3').findings.some(f => f.id === 'small-parts' && f.level === 'error'));
  const big: Scene = { shapes: [makeShape('box', [0, 0], { size: [300, 20, 20] })], grid: 1, units: 'mm' };
  assert.ok(printReport(big, PRINTERS[1]).findings.some(f => f.id === 'too-big'));
  const loose: Scene = { shapes: [makeShape('box'), makeShape('cylinder', [0, 0], { hole: true })], grid: 1, units: 'mm' };
  assert.ok(printReport(loose).findings.some(f => f.id === 'loose-hole'));
  const m = toMesh(solidOf(makeShape('box'))); assert.equal(m.indices.length, 36);
});

// ---------------------------------------------------------------- circuits
const ledCircuit = (withResistor = true): CircuitProject => ({ board: 'uno', parts: [
  { id: 'led', kind: 'led', ref: 'LED1', col: 5, y: 5, rot: 0, params: { color: 'red' } },
  ...(withResistor ? [{ id: 'r', kind: 'resistor' as const, ref: 'R1', col: 6, y: 7, rot: 1, params: { R: 220 } }] : []),
], wires: [
  { id: 'w1', a: pinKey('13'), b: holeKey(5, 3), color: '' },
  withResistor ? { id: 'w2', a: holeKey(6, 13), b: holeKey(6, 16), color: '' } : { id: 'w2', a: holeKey(6, 4), b: holeKey(6, 16), color: '' },
  { id: 'w3', a: pinKey('GND'), b: holeKey(1, 16), color: '' },
] });
test('breadboard strips connect, and the simulator circuit matches them', () => {
  const c = ledCircuit(); const n = connect(c);
  assert.ok(n.same(holeKey(5, 3), holeKey(5, 7)), 'a5 and e5 share a strip'); assert.ok(!n.same(holeKey(5, 7), holeKey(5, 9)), 'the gap splits e and f');
  assert.ok(n.same(holeKey(1, 16), holeKey(30, 16)), 'rails run the full length'); assert.ok(n.same(pinKey('GND'), holeKey(6, 13)));
  assert.ok(fits({ kind: 'button', col: 10, y: 7, rot: 0 })); assert.ok(!fits({ kind: 'resistor', col: 28, y: 5, rot: 0 }));
  assert.ok(verifyCircuit(c, { '13': { mode: 'out', level: 1 } }));
  assert.deepEqual(wiredLeds(c), ['led']);
});
test('an LED lights through 220 Ω and burns out without a resistor', () => {
  const on = evaluate(ledCircuit(), { '13': { mode: 'out', level: 1 } }); close(on.leds.led.mA, 12, 2.5, 'LED current'); assert.ok(on.leds.led.glow > 0.5);
  assert.equal(evaluate(ledCircuit(), { '13': { mode: 'out', level: 0 } }).leds.led.glow, 0);
  const bad = evaluate(ledCircuit(false), { '13': { mode: 'out', level: 1 } }); assert.ok(bad.leds.led.burnt, 'no resistor burns the LED');
  assert.ok(bad.warnings.some(w => /resistor/.test(w))); assert.ok(bad.warnings.some(w => /Pin D13/.test(w)), 'pin overload is reported');
});
test('a battery shorted across the rails is caught', () => {
  const c: CircuitProject = { board: null, parts: [{ id: 'b', kind: 'battery', ref: 'BAT1', col: 3, y: 0, rot: 0, params: { V: 4.5 } }], wires: [{ id: 'w', a: holeKey(10, 0), b: holeKey(10, 1), color: '' }] };
  assert.ok(evaluate(c, {}).warnings.some(w => /short/i.test(w)));
});

// ---------------------------------------------------------------- blocks
const blink: Program = { setup: [{ id: sid(), t: 'pinMode', pin: '13', mode: 'OUTPUT' }], loop: [{ id: sid(), t: 'digitalWrite', pin: '13', value: 'HIGH' }, { id: sid(), t: 'delay', ms: num(500) }, { id: sid(), t: 'digitalWrite', pin: '13', value: 'LOW' }, { id: sid(), t: 'delay', ms: num(500) }] };
test('blocks generate Arduino C++', () => {
  const c = toArduino(blink, 'Blink');
  assert.match(c, /void setup\(\) \{\n  pinMode\(13, OUTPUT\);\n\}/); assert.match(c, /void loop\(\) \{\n  digitalWrite\(13, HIGH\);\n  delay\(500\);\n  digitalWrite\(13, LOW\);\n  delay\(500\);\n\}/);
  const servo = toArduino(buildStarter('servo-sweep')!.program); assert.match(servo, /#include <Servo\.h>/); assert.match(servo, /servo_9\.attach\(9\);/); assert.match(servo, /servo_9\.write\(angle\);/);
  const game = toArduino(buildStarter('reaction-game')!.program); assert.match(game, /Serial\.begin\(9600\)/); assert.match(game, /random\(1000, 4000\)/); assert.match(game, /while \(!\(\(digitalRead\(2\) == 0\)\)\)/);
  assert.match(toArduino(buildStarter('distance-alarm')!.program), /long readDistanceCm\(int trig, int echo\)/);
  // Variable names that clash with Arduino or C++ words are renamed.
  assert.match(toArduino({ setup: [{ id: 'x', t: 'set', name: 'delay', value: num(1) }], loop: [] }), /long delay_v = 0;/);
});
test('blocks generate MicroPython for the Pico', () => {
  const py = toMicroPython(buildStarter('pico-blink')!.program);
  assert.match(py, /from machine import Pin/); assert.match(py, /pin_15 = Pin\(15, Pin\.OUT\)/); assert.match(py, /pin_15\.value\(1\)/); assert.match(py, /time\.sleep_ms\(int\(300\)\)/); assert.match(py, /while True:\n    loop\(\)/);
  const night = toMicroPython(buildStarter('nightlight')!.program); assert.match(night, /adc_26 = ADC\(26\)/); assert.match(night, /\(adc_26\.read_u16\(\) >> 6\)/); assert.match(night, /    global light/);
});
test('the interpreter runs in virtual time', () => {
  const log: string[] = []; const io: Io = { pinMode: () => {}, digitalWrite: (p, h) => log.push(`${p}=${h ? 1 : 0}`), analogWrite: () => {}, digitalRead: () => 0, analogRead: () => 512, tone: () => {}, noTone: () => {}, servo: () => {}, print: (t, l) => log.push(`print:${t}${l ? '\\n' : ''}`), distance: () => 0 };
  const vm = new Vm(blink, io); vm.runUntil(1250); assert.deepEqual(log, ['13=1', '13=0', '13=1']);
  const count: Program = { setup: [{ id: 'a', t: 'set', name: 'n', value: num(0) }], loop: [{ id: 'b', t: 'repeat', times: num(3), body: [{ id: 'c', t: 'change', name: 'n', by: num(2) }] }, { id: 'd', t: 'print', value: { t: 'var', name: 'n' }, line: true }, { id: 'e', t: 'delay', ms: num(100) }] };
  const out: string[] = []; const vm2 = new Vm(count, { ...io, print: t => out.push(t) }); vm2.runUntil(250); assert.deepEqual(out, ['6', '12', '18']);
  // A loop with no wait never hangs the page.
  const spin = new Vm({ setup: [], loop: [{ id: 'x', t: 'set', name: 'k', value: num(1) }] }, io); spin.runUntil(5); assert.ok(spin.t <= 5 && !spin.error);
});
test('the interpreter blinks an LED in the circuit simulator', () => {
  const rt = new Runtime(ledCircuit(), blink);
  const at = (ms: number) => { rt.step(ms); return rt.readout().leds.led; };
  assert.ok(at(250).glow > 0.5, 'on at 250 ms'); assert.equal(at(750).glow, 0, 'off at 750 ms');
  assert.ok(at(1250).glow > 0.5, 'on again at 1250 ms'); assert.equal(at(1750).mA < 0.01, true);
  assert.equal(rt.hints.size, 0);
  // Forgetting pinMode only turns on the weak pull-up, like a real board, and says so.
  const rt2 = new Runtime(ledCircuit(), { setup: [], loop: blink.loop }); rt2.step(250); assert.ok(rt2.readout().leds.led.mA < 1); assert.ok([...rt2.hints].some(h => /OUTPUT/.test(h)));
});
test('the traffic-light starter cycles red, green, yellow', () => {
  const p = buildStarter('traffic-light')!; const rt = new Runtime(p.circuit, p.program);
  const lit = (ms: number) => { rt.step(ms); const r = rt.readout(); return p.circuit.parts.filter(x => x.kind === 'led' && r.leds[x.id].glow > 0.3).map(x => x.params.color); };
  assert.deepEqual(lit(1000), ['red']); assert.deepEqual(lit(4000), ['green']); assert.deepEqual(lit(6500), ['yellow']); assert.deepEqual(lit(7500), ['red']);
  assert.equal(wiredLeds(p.circuit).length, 3);
});
test('inputs: buttons, light sensor and serial output', () => {
  const p = buildStarter('reaction-game')!; const pressed = new Set<string>(); const rt = new Runtime(p.circuit, p.program, { pressed }, () => 0);
  rt.step(1500); const led = p.circuit.parts.find(x => x.kind === 'led')!; assert.ok(rt.readout().leds[led.id].glow > 0.3, 'light on after the random wait');
  pressed.add(p.circuit.parts.find(x => x.kind === 'button')!.id); rt.touch(); rt.step(1800);
  assert.match(rt.serial, /Your time in ms: \d+\n/);
  const n = buildStarter('nightlight')!; const ldr = n.circuit.parts.find(x => x.kind === 'ldr')!; const ledN = n.circuit.parts.find(x => x.kind === 'led')!;
  const bright = new Runtime(n.circuit, n.program); bright.step(500); assert.equal(bright.readout().leds[ledN.id].glow, 0);
  ldr.params.light = 0.05; const dark = new Runtime(n.circuit, n.program); dark.step(500); assert.ok(dark.readout().leds[ledN.id].glow > 0.3, 'dark turns the nightlight on');
});

// ---------------------------------------------------------------- classroom contract
test('starters, lessons and the launch contract', () => {
  assert.ok(STUDIO_STARTERS.length >= 6);
  for (const s of STUDIO_STARTERS) { const p = buildStarter(s.id)!; assert.ok(p, s.id); assert.ok(['K-2', '3-5', '6-8', '9-12'].includes(s.level)); if (s.mode !== '3d') assert.ok(verifyCircuit(p.circuit, {}), s.id); }
  for (const id of ['keychain', 'name-tag', 'phone-stand', 'nightlight', 'traffic-light', 'reaction-game']) assert.ok(STUDIO_STARTERS.some(s => s.id === id), id);
  // Starters satisfy the matching lesson's checks (except the export/run steps).
  const traffic = buildStarter('traffic-light')!; const L = LESSONS.find(l => l.id === 'traffic-light-101')!; const ctx = { exported: false, ran: true, litLeds: new Set(traffic.circuit.parts.filter(x => x.kind === 'led').map(x => x.id)), sentToMake: false };
  assert.ok(L.steps.every(s => !s.check || s.check(traffic, ctx)));
  const key = buildStarter('keychain')!; const K = LESSONS.find(l => l.id === 'keychain-101')!; assert.ok(K.steps.slice(0, 5).every(s => !s.check || s.check(key, { ...ctx, ran: false })));
  assert.equal(normalizeProject({ title: 'x', scene: { shapes: 'bad' } })!.scene.shapes.length, 0);
  assert.ok(studio3dHazards('under3').some(h => h.id === 'small-parts' && h.severity === 'critical'));
  assert.ok(studioCircuitHazards().some(h => h.id === 'studio-unplug'));
  assert.deepEqual(parseLaunch('{"room":"studio","starter":"keychain","lesson":"keychain-101"}'), { room: 'studio', prompt: undefined, template: undefined, starter: 'keychain', lesson: 'keychain-101' });
  assert.equal(parseLaunch({ room: 'nope' }), null); assert.equal(parseLaunch('not json'), null);
  assert.deepEqual(routeIdea('a keychain with my name'), { room: 'studio', starter: 'keychain' });
});
