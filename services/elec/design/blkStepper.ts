// Stepper motors: a NEMA 17 on an A4988 (12 V motor supply, STEP/DIR from the board) or the small
// 5 V 28BYJ-48 on its ULN2003 board (four pins, half-stepping). Released by Plajah as public domain (CC0).
import type { BlockDef } from './block';
import { n, sid } from './block';

const big = (o: Record<string, unknown>) => o.kind !== '28byj48';
export const stepper: BlockDef = {
  id: 'stepper', label: 'Stepper motor', plural: 'stepper motors', about: 'Precise positioning: NEMA 17 on an A4988 driver (12 V), or a small 5 V 28BYJ-48 on a ULN2003 board.', max: 3,
  words: /\b(steppers?|stepper motors?|nema ?17|28byj|cnc|plotter|turntable|camera slider|linear stage|precise (position|rotation))\b/i,
  opts: [{ key: 'kind', label: 'Motor', choices: ['nema17', '28byj48'], default: 'nema17' }], needsMcu: () => true,
  pins: i => (big(i.opt) ? [{ role: 'step', cap: 'gpio', label: `Stepper ${n(i)} STEP` }, { role: 'dir', cap: 'gpio', label: `Stepper ${n(i)} DIR` }]
    : [1, 2, 3, 4].map(k => ({ role: `in${k}`, cap: 'gpio' as const, label: `Stepper ${n(i)} IN${k}` }))),
  loads: i => (big(i.opt) ? [{ rail: 'v12', typ: 0.4, peak: 0.8, what: `stepper ${n(i)} (NEMA 17, 12 V)` }, { rail: 'logic', typ: 0.005, peak: 0.008, what: `A4988 ${n(i)} logic` }] : [{ rail: 'v5', typ: 0.16, peak: 0.24, what: `stepper ${n(i)} (28BYJ-48)` }]),
  draw(i, d) {
    if (big(i.opt)) {
      const u = d.part('a4988', 0, 0); const c = d.part('electrolytic', -12, -10, 1, { C: '100u', V: '35' }); const m = d.part('stepper', 14, 0);
      d.net('V12', [u, 'VMOT'], [c, '+']); d.net('GND', [u, 'GND']); d.net('GND', [c, '-']); d.net('LOGIC', [u, 'VDD']); d.net('@step', [u, 'STEP']); d.net('@dir', [u, 'DIR']);
      d.net('a1', [u, '1A'], [m, 'A1']); d.net('a2', [u, '1B'], [m, 'A2']); d.net('b1', [u, '2A'], [m, 'B1']); d.net('b2', [u, '2B'], [m, 'B2']);
    } else {
      const u = d.part('uln2003', 0, 0); d.net('V5', [u, '+']); d.net('GND', [u, '-']); for (let k = 1; k <= 4; k++) d.net(`@in${k}`, [u, `IN${k}`]);
    }
  },
  fw(i, f) {
    const v = sid(i);
    if (big(i.opt)) {
      const { step, dir } = i.pins;
      if (f.fw === 'esphome') { f.esp('stepper', `- platform: a4988\n  id: ${v}\n  step_pin: ${f.pin(step)}\n  dir_pin: ${f.pin(dir)}\n  max_speed: 400 steps/s\n  acceleration: 800 steps/s^2\n  deceleration: 800 steps/s^2`); f.esp('number', `- platform: template\n  name: "Stepper ${n(i)} position"\n  min_value: -2000\n  max_value: 2000\n  step: 1\n  optimistic: true\n  set_action:\n    then:\n      - stepper.set_target:\n          id: ${v}\n          target: !lambda 'return x;'`); return; }
      if (f.fw === 'arduino') { f.imp('#include <AccelStepper.h>'); f.lib('AccelStepper'); f.glob(`AccelStepper ${v}(AccelStepper::DRIVER, ${f.pin(step)}, ${f.pin(dir)});`); f.setup(`${v}.setMaxSpeed(400);\n  ${v}.setAcceleration(800);\n  ${v}.moveTo(200);  // one turn at full steps`); f.loop(`if (${v}.distanceToGo() == 0) ${v}.moveTo(-${v}.currentPosition());\n  ${v}.run();`); return; }
      f.imp('import digitalio');
      f.setup(`${v}_step = ${f.dio(step)}\n${v}_step.switch_to_output()\n${v}_dir = ${f.dio(dir)}\n${v}_dir.switch_to_output()\ndef ${v}_move(steps, delay=0.002):  # 200 full steps = one turn (more with microstepping)\n    ${v}_dir.value = steps > 0\n    for _ in range(abs(steps)):\n        ${v}_step.value = True\n        time.sleep(delay)\n        ${v}_step.value = False\n        time.sleep(delay)\n${v}_move(200)`); return;
    }
    const pins = [1, 2, 3, 4].map(k => i.pins[`in${k}`]);
    if (f.fw === 'esphome') { f.esp('stepper', `- platform: uln2003\n  id: ${v}\n  pin_a: ${f.pin(pins[0])}\n  pin_b: ${f.pin(pins[1])}\n  pin_c: ${f.pin(pins[2])}\n  pin_d: ${f.pin(pins[3])}\n  max_speed: 250 steps/s\n  step_mode: HALF_STEP\n  sleep_when_done: true`); return; }
    if (f.fw === 'arduino') { f.imp('#include <AccelStepper.h>'); f.lib('AccelStepper'); f.glob(`AccelStepper ${v}(AccelStepper::HALF4WIRE, ${f.pin(pins[0])}, ${f.pin(pins[2])}, ${f.pin(pins[1])}, ${f.pin(pins[3])});`); f.setup(`${v}.setMaxSpeed(500);\n  ${v}.setAcceleration(300);\n  ${v}.moveTo(4096);  // one turn in half steps`); f.loop(`if (${v}.distanceToGo() == 0) ${v}.moveTo(-${v}.currentPosition());\n  ${v}.run();`); return; }
    f.imp('import digitalio');
    f.setup(`${v}_coils = [${pins.map(p => f.dio(p)).join(', ')}]\nfor c in ${v}_coils:\n    c.switch_to_output()\nHALF = ((1,0,0,0),(1,1,0,0),(0,1,0,0),(0,1,1,0),(0,0,1,0),(0,0,1,1),(0,0,0,1),(1,0,0,1))\ndef ${v}_move(steps, delay=0.0012):  # 4096 half steps = one turn of the output shaft\n    for k in range(abs(steps)):\n        for c, on in zip(${v}_coils, HALF[(k if steps > 0 else -k) % 8]):\n            c.value = bool(on)\n        time.sleep(delay)\n    for c in ${v}_coils:\n        c.value = False  # rest unpowered: no heat\n${v}_move(4096)`);
  },
  notes: i => (big(i.opt) ? [`Stepper ${n(i)}: set the A4988 current limit before first run (Vref ≈ coil current × 8 × 0.068 for the common 68 mΩ sense resistors); the 100 µF capacitor at VMOT protects the driver from supply spikes.`] : []),
  extras: i => (big(i.opt) ? [['1', 'Heatsink for the A4988 (usually supplied)', ''], ['1', 'NEMA 17 mount + coupler', 'for the mechanism']] : [['1', '28BYJ-48 5 V stepper (comes with the ULN2003 board)', 'plugs into the board socket']]),
};
