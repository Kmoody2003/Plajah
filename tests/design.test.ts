// Open-ended designer: prompts the fixed recipes cannot serve must still come out as designs whose
// drawn wiring is proven, whose simulation converges and whose checks show no errors; plus unit
// tests for pin allocation, power budgeting and the spec reader.
//   npm run test:design
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { understand, readSpec, specFromLlm, recipeCovers } from '../services/elec/design/spec';
import { designFromSpec } from '../services/elec/design';
import { plan } from '../services/elec/design/planner';
import { verifyDesign } from '../services/elec/designs';
import { simulate } from '../services/elec/sim';
import { checkCircuit } from '../services/elec/checks';
import { designHazards } from '../services/safety/hazards';
import type { Spec } from '../services/elec/design/types';

const S = (needs: Spec['needs'], o: Partial<Spec> = {}): Spec => ({ name: 'Test', needs, mcu: 'auto', power: 'auto', conn: [], market: 'both', ...o });

// Each prompt: what it must contain (blocks), and optionally which board.
const PROMPTS: Array<[string, string[], string?]> = [
  ['a plant monitor with soil moisture, OLED and Wi-Fi', ['soil', 'oled'], 'esp32'],
  ['a 4-channel relay board', ['relay'], 'esp32'],
  ['a battery LED lantern with USB-C charging', ['lamp']],
  ['a midi controller with 8 knobs and 4 buttons', ['pot', 'button'], 'pico'],
  ['a robot car with an ultrasonic distance sensor', ['motor', 'distance']],
  ['a weather station with temperature, light sensor and a colour screen', ['temp', 'light', 'tft']],
  ['a motion activated night light with 12 neopixels', ['neopixel', 'motion']],
  ['a smart doorbell with a button, speaker and wifi', ['button', 'speaker'], 'esp32'],
  ['a pan-tilt camera mount with 2 servos and a joystick', ['servo', 'pot', 'button']],
  ['arduino thermometer with oled', ['temp', 'oled'], 'nano'],
  ['a raspberry pi 4 with 2 knobs and 3 buttons', ['pot', 'button'], 'rpi'],
  ['a tilt alarm with an accelerometer and buzzer', ['imu', 'speaker']],
  ['a garden watering controller with 3 soil probes and 3 relays for pumps', ['soil', 'relay']],
  ['a parking sensor with a time of flight sensor and rgb led ring', ['distance', 'neopixel']],
  ['a home assistant motion sensor with a 12V LED strip', ['motion', 'strip12'], 'esp32'],
  ['a dimmable lantern with 8 white LEDs and a rechargeable battery', ['lamp']],
  ['a usb keyboard macro pad with 6 keys', ['button'], 'pico'],
  ['a mains powered 2-channel relay switch with wifi for europe', ['relay'], 'esp32'],
  // Gaps closed in the second pass.
  ['a macro pad with 9 keys and a volume knob encoder', ['keymatrix', 'encoder'], 'pico'],
  ['an esp32 with 16 relays', ['relay'], 'esp32'],
  ['an arduino nano with 14 separate buttons and 4 leds', ['button', 'led'], 'nano'],
  ['a camera slider with a stepper motor and 2 buttons', ['stepper', 'button']],
  ['a small turntable with a 28byj stepper', ['stepper']],
  ['an internet radio with an esp32, speaker and a knob', ['speaker', 'pot'], 'esp32'],
  ['a pico music box that plays mp3 with 3 buttons', ['speaker', 'button'], 'pico'],
  ['a robot with 3 time of flight sensors and 2 motors', ['distance', 'motor']],
  ['an arduino nano with a color tft display and temperature sensor', ['tft', 'temp'], 'nano'],
  ['a raspberry pi 4 with a colour tft screen and a light sensor', ['tft', 'light'], 'rpi'],
  ['a pico w weather station with temperature and oled', ['temp', 'oled'], 'picow'],
  ['an esp32-s3 midi controller with wifi, 4 knobs and 8 buttons', ['pot', 'button'], 'esp32s3'],
  ['a battery robot car with 2 motors, a servo and an ultrasonic sensor', ['motor', 'servo', 'distance']],
];

for (const [prompt, blocks, board] of PROMPTS) {
  test(`designs: ${prompt}`, () => {
    const u = understand(prompt); assert.equal(u.kind, 'design', `${prompt} should go to the engine`);
    for (const b of blocks) assert.ok(u.reading.spec.needs.some(n => n.block === b), `${prompt}: heard ${b}`);
    const r = designFromSpec(u.reading.spec); assert.ok(r.build, `${prompt}: ${r.errors.join('; ')}`);
    const b = r.build!; if (board) assert.equal(r.plan.mcu?.kind, board);
    const errs = verifyDesign({ id: 'x', title: '', about: '', circuit: b.circuit, sim: b.sim, licence: 'CC0-1.0', tags: [], pairs: b.pairs });
    assert.deepEqual(errs, [], `${prompt}: ${errs.slice(0, 3).join('; ')}`);
    const sim = simulate(b.circuit, b.sim); assert.ok(sim.converged, `${prompt}: did not converge`);
    const checkErrors = checkCircuit(b.circuit, sim, { market: b.market }).filter(f => f.level === 'error');
    assert.deepEqual(checkErrors.map(e => e.title), [], prompt);
    assert.ok(b.design && b.design.counts.errors === 0 && b.design.bom.length > 0 && b.enclosure, `${prompt}: outputs`);
    if (r.plan.mcu) assert.ok(b.firmware && b.firmware.code.length > 200, `${prompt}: firmware`);
  });
}

test('the fixed recipes still take the prompts they fully cover', () => {
  for (const [p, id] of [['a USB desk lamp with 6 warm white LEDs', 'lamp'], ['a midi controller with 3 knobs and 7 buttons', 'midi'], ['my own electric guitar with two humbuckers', 'guitar'], ['wifi led strip light for home assistant', 'smart-lamp'], ['a 2-port USB wall charger', 'charger'], ['a wifi temperature and humidity sensor', 'sensor']] as const) {
    const u = understand(p); assert.equal(u.kind, 'recipe', p); assert.equal(u.interp.recipe?.id, id, p);
  }
  assert.equal(recipeCovers('lamp', S([{ block: 'lamp', count: 6 }], { power: 'liion' })), false);
  assert.equal(understand('a teapot').kind, 'none');
});

test('pin allocation: analog first, I²C bus reserved, ADS1115 added when analog pins run out', () => {
  const p = plan(S([{ block: 'pot', count: 5 }, { block: 'oled', count: 1 }], { mcu: 'pico' }));
  assert.deepEqual(p.errors, []); assert.deepEqual(p.i2c, ['GP4', 'GP5']);
  const pots = p.insts.filter(i => i.block === 'pot').map(i => i.pins.adc);
  assert.deepEqual(pots.slice(0, 3), ['GP26', 'GP27', 'GP28']); assert.ok(pots.slice(3).every(x => x.startsWith('ADS:0:'))); assert.equal(p.ads, 1);
  const used = p.pins.filter(r => !r.pin.startsWith('ADS')).map(r => r.pin); assert.equal(new Set(used).size, used.length, 'no pin used twice');
  // ESP32: only ADC1 pins read analog with Wi-Fi on; buttons stay off strapping pins.
  const e = plan(S([{ block: 'soil', count: 2 }, { block: 'button', count: 9 }], { conn: ['wifi'] }));
  assert.equal(e.mcu?.kind, 'esp32'); assert.deepEqual(e.insts.filter(i => i.block === 'soil').map(i => i.pins.adc), ['IO32', 'IO33']);
  assert.ok(e.insts.filter(i => i.block === 'button').every(i => !['IO2', 'IO5'].includes(i.pins.in)));
  // Too many pins fails honestly; USB MIDI forces a board with native USB.
  // Out of pins: separate buttons move to an MCP23017; native-only needs that cannot fit still fail honestly.
  const many = plan(S([{ block: 'button', count: 14 }, { block: 'led', count: 4 }], { mcu: 'nano' })); assert.deepEqual(many.errors, []); assert.equal(many.exp, 1);
  assert.ok(many.insts.some(i => i.pins.in?.startsWith('EXP:0:')));
  assert.match(plan(S([{ block: 'pot', count: 2 }, { block: 'servo', count: 6 }, { block: 'motor', count: 4 }], { mcu: 'nano' })).errors.join(' '), /runs out/);
  assert.equal(plan(S([{ block: 'button', count: 2 }], { conn: ['usb-midi'] })).mcu?.kind, 'pico');
  assert.deepEqual(plan(S([{ block: 'tft', count: 1 }], { mcu: 'nano' })).errors, [], 'TFT on a Nano gets an LDO and a level shifter');
  assert.match(plan(S([{ block: 'oled', count: 3 }])).errors.join(' '), /at most 2|only 2 can share/);
});

test('power budget: rails add up, the supply is sized from them, and impossible budgets are refused', () => {
  const p = plan(S([{ block: 'relay', count: 4 }], { conn: ['wifi'] }));
  const t5 = p.power.totals['5 V']; assert.ok(Math.abs(t5.typ - (0.08 + 4 * 0.072)) < 1e-9, `5 V typ ${t5.typ}`); assert.equal(p.power.usbA, 1.5);
  assert.equal(plan(S([{ block: 'led', count: 1 }], { mcu: 'pico' })).power.usbA, 0.5);
  const big = plan(S([{ block: 'neopixel', count: 120, opt: { cap: '1' } }]));
  assert.equal(big.power.source, 'usb'); assert.match(big.errors.join(' '), /3 A|adapter/);
  assert.equal(plan(S([{ block: 'neopixel', count: 120, opt: { cap: '1' } }], { power: 'adapter5' })).power.adapterA, 8);
  const strip = plan(S([{ block: 'strip12', count: 1, opt: { watts: 12 } }], { conn: ['wifi'] }));
  assert.equal(strip.power.source, 'adapter12'); assert.ok(strip.power.buck && strip.power.fuseA && strip.power.fuseA >= 1);
  const robot = plan(S([{ block: 'motor', count: 2 }, { block: 'servo', count: 1 }], { power: 'liion' })); assert.deepEqual(robot.errors, []); assert.equal(robot.power.source, 'liion2s', 'heavy 5 V loads move to a 2-cell pack');
  assert.match(plan(S([{ block: 'motor', count: 4 }, { block: 'servo', count: 4 }], { power: 'liion' })).errors.join(' '), /beyond a 3 A buck/);
  const lantern = plan(S([{ block: 'lamp', count: 6 }], { power: 'liion' })); assert.ok(lantern.power.cell && !lantern.power.boost && lantern.power.powerSwitch && !lantern.mcu);
  const picoBat = plan(S([{ block: 'temp', count: 1 }, { block: 'oled', count: 1 }], { mcu: 'pico', power: 'liion' })); assert.equal(picoBat.power.boost, undefined, 'Pico runs from the cell on VSYS');
  const espBat = plan(S([{ block: 'temp', count: 1 }], { conn: ['wifi'], power: 'liion' })); assert.equal(espBat.power.boost?.V, 5);
});

test('simulation sees the planned loads: lamp current, relay coils, divider level', () => {
  const lan = designFromSpec(S([{ block: 'lamp', count: 6 }], { power: 'liion' })).build!; const s = simulate(lan.circuit, lan.sim);
  const leds = lan.circuit.parts.filter(p => p.kind === 'led'); for (const d of leds) { const i = s.parts[d.id].i[0]; assert.ok(i > 0.005 && i < 0.02, `LED ${i}`); }
  const rob = designFromSpec(S([{ block: 'distance', count: 1, opt: { kind: 'ultrasonic' } }], { mcu: 'esp32' })).build!; const rs = simulate(rob.circuit, rob.sim);
  const f = checkCircuit(rob.circuit, rs).find(x => x.id.startsWith('level-')); assert.equal(f?.level, 'pass', 'echo divider keeps the ESP32 pin under 3.6 V');
});

test('the logic-level check catches a 5 V echo wired straight to a 3.3 V pin', () => {
  const b = designFromSpec(S([{ block: 'distance', count: 1, opt: { kind: 'ultrasonic' } }], { mcu: 'esp32' })).build!;
  // Short the divider's top resistor: ECHO now drives the pin at 5 V.
  const c = { ...b.circuit, parts: b.circuit.parts.map(p => p.kind === 'resistor' && p.params.R === '1k' ? { ...p, params: { ...p.params, R: '0.001' } } : p) };
  const f = checkCircuit(c, simulate(c, { mode: 'dc' })).filter(x => x.level === 'error'); assert.ok(f.some(x => x.id.startsWith('level-')), 'flags the 5 V level');
});

test('firmware follows the board: ESPHome, CircuitPython (MIDI/HID), Arduino, Pi Python', () => {
  const esp = designFromSpec(S([{ block: 'relay', count: 2 }, { block: 'temp', count: 1 }, { block: 'oled', count: 1 }], { conn: ['homeassistant', 'wifi'] })).build!.firmware!;
  assert.equal(esp.file, 'device.yaml'); assert.match(esp.code, /platform: bme280_i2c/); assert.match(esp.code, /ssd1306_i2c/); assert.match(esp.code, /restore_mode: ALWAYS_OFF/); assert.match(esp.code, /i2c:\n  sda: GPIO21/);
  const midi = designFromSpec(S([{ block: 'pot', count: 4 }, { block: 'button', count: 2 }], { conn: ['usb-midi'] })).build!.firmware!;
  assert.equal(midi.file, 'code.py'); assert.match(midi.code, /usb_midi/); assert.match(midi.code, /ADS\.ADS1115/); assert.match(midi.code, /0xB0, 23/);
  const hid = designFromSpec(S([{ block: 'button', count: 3 }, { block: 'encoder', count: 1 }], { conn: ['usb-hid'] })).build!.firmware!; assert.match(hid.code, /Keycode\.F13/); assert.match(hid.code, /VOLUME_INCREMENT/);
  const nano = designFromSpec(S([{ block: 'temp', count: 1 }, { block: 'servo', count: 1 }], { mcu: 'nano' })).build!.firmware!; assert.match(nano.file, /\.ino$/); assert.match(nano.code, /Adafruit_BME280/); assert.match(nano.code, /Servo/);
  const pi = designFromSpec(S([{ block: 'pot', count: 1 }, { block: 'motion', count: 1 }], { mcu: 'rpi' })).build!.firmware!; assert.equal(pi.file, 'device.py'); assert.match(pi.code, /MotionSensor/); assert.match(pi.code, /ADS1115/);
});

test('safety: Li-ion, relays and moving parts raise hazards; relays get the regulatory pre-check', () => {
  const b = designFromSpec(S([{ block: 'relay', count: 1 }, { block: 'servo', count: 1 }], { power: 'adapter5', mcu: 'esp32' })).build!;
  const h = designHazards({ circuit: b.circuit, recipe: 'design' }).map(x => x.id); assert.ok(h.includes('relay-mains') && h.includes('moving-parts'));
  assert.ok(b.design!.review.some(r => r.area === 'Regulatory' && /Relay contacts/.test(r.title)));
  const l = designFromSpec(S([{ block: 'lamp', count: 4 }], { power: 'liion' })).build!; const lh = designHazards({ circuit: l.circuit });
  assert.equal(lh.find(x => x.id === 'li-ion-cell')?.severity, 'critical');
});

test('reader and on-device model fill the same checked spec', () => {
  const r = readSpec('a 4-channel relay board for europe'); assert.equal(r.spec.needs[0].count, 4); assert.equal(r.spec.market, 'EU');
  assert.ok(r.assumed.some(a => /Wi-Fi/.test(a)) && r.heard.includes('4 relays'));
  const m = specFromLlm('ok {"spec":{"name":"Box","needs":[{"block":"relay","count":40},{"block":"laser","count":1},{"block":"neopixel","count":30,"opt":{"cap":"9"}}],"mcu":"esp32","power":"nuclear","conn":["wifi","telepathy"]}}', 'a relay box');
  assert.deepEqual(m.spec.needs.map(n => [n.block, n.count]), [['relay', 16], ['neopixel', 30]]); assert.equal(m.spec.needs[1].opt?.cap, undefined);
  assert.equal(m.spec.power, 'auto'); assert.deepEqual(m.spec.conn, ['wifi']); assert.equal(m.spec.mcu, 'esp32');
  assert.equal(specFromLlm('not json', 'a plant monitor with soil moisture').spec.needs[0].block, 'soil');
});

test('second pass: expander, key matrix, I²S pins, ToF re-addressing, Nano TFT, Pico W / ESP32-S3, 2S pack', () => {
  const relays = designFromSpec(S([{ block: 'relay', count: 16 }], { mcu: 'esp32', conn: ['wifi'] })); assert.equal(relays.plan.exp, 1);
  assert.match(relays.build!.firmware!.code, /mcp23017:\n  - id: mcp0\n    address: 0x20/); assert.match(relays.build!.firmware!.code, /mcp23xxx: mcp0/);
  const km = designFromSpec(S([{ block: 'keymatrix', count: 12 }], { conn: ['usb-hid'] })).build!;
  assert.equal(km.circuit.parts.filter(p => p.kind === 'diode').length, 12); assert.match(km.firmware!.code, /keypad\.KeyMatrix\(.*columns_to_anodes=True/);
  assert.equal(plan(S([{ block: 'keymatrix', count: 12 }])).pins.length, 7, '3 × 4 matrix = 7 pins');
  const i2s = plan(S([{ block: 'speaker', count: 1, opt: { kind: 'i2s' } }, { block: 'button', count: 3 }], { mcu: 'pico' })); const sp = i2s.insts.find(i => i.block === 'speaker')!;
  assert.equal(+sp.pins.lrc.slice(2), +sp.pins.bclk.slice(2) + 1, 'RP2040 word select is the pin after the bit clock');
  assert.match(plan(S([{ block: 'speaker', count: 1, opt: { kind: 'i2s' } }], { mcu: 'nano' })).errors.join(' '), /no I²S/);
  const tof = designFromSpec(S([{ block: 'distance', count: 3 }], { mcu: 'nano' })).build!.firmware!.code;
  assert.ok(tof.indexOf('hold ToF 3 in reset') < tof.indexOf('distance1.begin'), 'every ToF is held in reset before the first is started'); assert.match(tof, /distance3\.begin\(0x31\)/);
  const nt = designFromSpec(S([{ block: 'tft', count: 1 }], { mcu: 'nano' })).build!; assert.ok(nt.circuit.parts.some(p => p.kind === 'hc4050') && nt.circuit.parts.some(p => p.kind === 'ldo'));
  assert.match(nt.firmware!.code, /Adafruit_ST7789 tft\(/);
  const s3 = designFromSpec(S([{ block: 'pot', count: 2 }, { block: 'button', count: 2 }], { conn: ['usb-midi', 'wifi'] })); assert.equal(s3.plan.mcu?.kind, 'esp32s3'); assert.equal(s3.build!.firmware!.file, 'code.py');
  assert.match(s3.build!.firmware!.code, /usb_midi/); assert.match(s3.build!.firmware!.code, /mqtt\.publish/); assert.ok(s3.build!.firmware!.extra?.some(x => x.file === 'settings.toml'));
  const s3ha = designFromSpec(S([{ block: 'temp', count: 1 }], { mcu: 'esp32s3', conn: ['homeassistant'] })).build!.firmware!; assert.match(s3ha.code, /variant: esp32s3/);
  const pw = designFromSpec(S([{ block: 'temp', count: 1 }], { mcu: 'picow', conn: ['wifi'] })).build!; assert.equal(pw.circuit.parts.find(p => p.kind === 'pico')?.params.variant, 'Pico W');
  const st = designFromSpec(S([{ block: 'stepper', count: 1 }], { mcu: 'esp32', conn: ['wifi'] })); assert.equal(st.plan.power.source, 'adapter12'); assert.match(st.build!.firmware!.code, /platform: a4988/);
  const two = designFromSpec(S([{ block: 'servo', count: 4 }], { power: 'liion2s' })).build!; const cell = two.circuit.parts.find(p => p.kind === 'liion')!; assert.equal(Number(cell.params.V), 7.4);
  assert.ok(designHazards({ circuit: two.circuit }).some(h => h.id === 'li-ion-cell'));
});
