// Output blocks that move air or things: speaker (class-D amp), hobby servo, DC motors on an
// H-bridge, and opto-isolated relays (safety-flagged). Released by Plajah as public domain (CC0).
import type { BlockDef } from './block';
import { n, sid } from './block';

export const speaker: BlockDef = {
  id: 'speaker', label: 'Speaker + amplifier', plural: 'speakers', about: 'PWM tone or audio through an RC filter into a 2.5 W class-D amp and a 4 Ω driver.', max: 1,
  words: /\b(speaker|buzzer|beep(er|s)?|chime|alarm sound|sound|audio|tones?|melod(y|ies)|doorbell)\b/i, needsMcu: () => true,
  pins: () => [{ role: 'pwm', cap: 'pwm', label: 'Audio out' }], loads: () => [{ rail: 'v5', typ: 0.1, peak: 0.6, what: 'class-D amp at full volume' }],
  draw(i, d) {
    const ra = d.part('resistor', 0, 0, 0, { R: '1k' }); const cf = d.part('capacitor', 5, 5, 1, { C: '10n' }); const cc = d.part('capacitor', 10, 0, 0, { C: '1u' });
    const amp = d.part('amp', 22, 2, 0, { gain: 24, P: '2.5' }); const ls = d.part('speaker', 34, 2, 0, { R: 4, P: '3' });
    d.net('@pwm', [ra, '1']); d.net('filt', [ra, '2'], [cf, '1'], [cc, '1']); d.net('GND', [cf, '2']); d.net('ain', [cc, '2'], [amp, 'IN']);
    d.net('V5', [amp, 'VCC']); d.net('GND', [amp, 'GND']); d.net('op', [amp, 'OUT+'], [ls, '+']); d.net('om', [amp, 'OUT-'], [ls, '-']);
  },
  fw(i, f) {
    const p = i.pins.pwm;
    if (f.fw === 'esphome') { f.esp('output', `- platform: ledc\n  pin: ${f.pin(p)}\n  id: ${sid(i, 'out')}`); f.esp('rtttl', `output: ${sid(i, 'out')}`); f.esp('button', `- platform: template\n  name: "Chime"\n  on_press:\n    - rtttl.play: "chime:d=8,o=6,b=180:c,e,g,8c7"`); return; }
    if (f.fw === 'python') { f.imp('from gpiozero import TonalBuzzer'); f.setup(`chime = TonalBuzzer(${f.pin(p)})\nfor note in ("C5", "E5", "G5"):\n    chime.play(note)\n    time.sleep(0.12)\nchime.stop()`); return; }
    if (f.fw === 'arduino') { f.setup(`tone(${f.pin(p)}, 523, 120); delay(130); tone(${f.pin(p)}, 659, 120); delay(130); tone(${f.pin(p)}, 784, 200);`); return; }
    f.imp('import simpleio'); f.lib('simpleio'); f.setup(`for hz in (523, 659, 784):  # start-up chime\n    simpleio.tone(${f.pin(p)}, hz, 0.12)`);
  },
  extras: () => [['1', '40-57 mm 4 Ω speaker, ≥ 3 W', 'behind a hole grille'], ['1', 'Foam or felt', 'damp the box']],
  notes: () => ['PWM audio is fine for tones and chimes; for music use an I²S DAC/amp (MAX98357A) instead.'],
};

export const servo: BlockDef = {
  id: 'servo', label: 'Servo', plural: 'servos', about: 'SG90-class servo on 5 V with a bulk capacitor; 50 Hz PWM from the board.', max: 6,
  words: /\b(servos?|pan[- ]tilt|robot arm|flap|gate|lock|pointer)\b/i, needsMcu: () => true,
  pins: i => [{ role: 'pwm', cap: 'pwm', label: `Servo ${n(i)}` }], loads: i => [{ rail: 'v5', typ: 0.15, peak: 0.7, what: `servo ${n(i)} (stall 0.7 A)` }],
  draw(i, d) { const s = d.part('servo', 10, 0); const c = d.part('electrolytic', 0, -4, 1, { C: '220u', V: '16' }); d.net('V5', [s, 'V+'], [c, '+']); d.net('GND', [s, 'GND']); d.net('GND', [c, '-']); d.net('@pwm', [s, 'SIG']); },
  fw(i, f) {
    const v = sid(i); const p = i.pins.pwm;
    if (f.fw === 'esphome') { f.esp('output', `- platform: ledc\n  pin: ${f.pin(p)}\n  id: ${v}_pwm\n  frequency: 50 Hz`); f.esp('servo', `- id: ${v}\n  output: ${v}_pwm`); f.esp('number', `- platform: template\n  name: "Servo ${n(i)}"\n  min_value: -100\n  max_value: 100\n  step: 1\n  optimistic: true\n  set_action:\n    then:\n      - servo.write:\n          id: ${v}\n          level: !lambda 'return x / 100.0;'`); return; }
    if (f.fw === 'python') { f.imp('from gpiozero import AngularServo'); f.setup(`${v} = AngularServo(${f.pin(p)}, min_angle=0, max_angle=180)\n${v}.angle = 90`); return; }
    if (f.fw === 'arduino') { f.imp('#include <Servo.h>'); f.glob(`Servo ${v};`); f.setup(`${v}.attach(${f.pin(p)});\n  ${v}.write(90);`); return; }
    f.imp('import pwmio', 'from adafruit_motor import servo as servo_lib'); f.lib('adafruit_motor'); f.setup(`${v} = servo_lib.Servo(pwmio.PWMOut(${f.pin(p)}, duty_cycle=0, frequency=50))\n${v}.angle = 90`);
  },
  notes: i => (i.k === 0 ? ['Servo power comes from the 5 V rail, never the board\'s 3.3 V pin; the 220 µF capacitor rides out the start-up surge.'] : []),
};

export const motor: BlockDef = {
  id: 'motor', label: 'DC motor', plural: 'DC motors', about: 'Brushed gear motors, two per DRV8833 H-bridge (forward, reverse, speed).', max: 4,
  words: /\b(motors?|wheels?|robot car|rover|fan|pump|conveyor)\b/i, needsMcu: () => true,
  instances: c => Array.from({ length: Math.ceil(Math.min(4, c) / 2) }, (_, k) => Math.min(2, Math.min(4, c) - 2 * k)),
  pins: i => [{ role: 'a1', cap: 'pwm', high: true, label: `Motor ${2 * i.k + 1} IN1` }, { role: 'a2', cap: 'pwm', label: `Motor ${2 * i.k + 1} IN2` }, ...(i.count > 1 ? [{ role: 'b1', cap: 'pwm' as const, label: `Motor ${2 * i.k + 2} IN1` }, { role: 'b2', cap: 'pwm' as const, label: `Motor ${2 * i.k + 2} IN2` }] : [])],
  loads: i => [{ rail: 'v5', typ: 0.25 * i.count, peak: 1.0 * i.count, what: `${i.count} motor${i.count > 1 ? 's' : ''} (stall 1 A each)` }],
  draw(i, d) {
    const h = d.part('hbridge', 0, 0); const c = d.part('electrolytic', -12, -8, 1, { C: '100u', V: '16' }); const ma = d.part('dcmotor', 12, -2);
    d.net('V5', [h, 'VM'], [c, '+']); d.net('GND', [h, 'GND']); d.net('GND', [c, '-']); d.net('@a1', [h, 'AIN1']); d.net('@a2', [h, 'AIN2']); d.net('ao1', [h, 'AO1'], [ma, '+']); d.net('ao2', [h, 'AO2'], [ma, '-']);
    if (i.count > 1) { const mb = d.part('dcmotor', 12, 6); d.net('@b1', [h, 'BIN1']); d.net('@b2', [h, 'BIN2']); d.net('bo1', [h, 'BO1'], [mb, '+']); d.net('bo2', [h, 'BO2'], [mb, '-']); }
  },
  fw(i, f) {
    const chans: Array<[string, string, number]> = [['a1', 'a2', 2 * i.k + 1], ...(i.count > 1 ? [['b1', 'b2', 2 * i.k + 2] as [string, string, number]] : [])];
    for (const [r1, r2, m] of chans) {
      const v = `motor${m}`; const p1 = i.pins[r1], p2 = i.pins[r2];
      if (f.fw === 'esphome') { f.esp('output', `- platform: ledc\n  pin: ${f.pin(p1)}\n  id: ${v}_a\n- platform: ledc\n  pin: ${f.pin(p2)}\n  id: ${v}_b`); f.esp('fan', `- platform: hbridge\n  name: "Motor ${m}"\n  pin_a: ${v}_a\n  pin_b: ${v}_b\n  decay_mode: slow`); }
      else if (f.fw === 'python') { f.imp('from gpiozero import Motor'); f.setup(`${v} = Motor(forward=${f.pin(p1)}, backward=${f.pin(p2)})\n${v}.forward(0.5)`); }
      else if (f.fw === 'arduino') f.setup(`analogWrite(${f.pin(p1)}, 128);  // motor ${m} half speed forward\n  pinMode(${f.pin(p2)}, OUTPUT); digitalWrite(${f.pin(p2)}, LOW);`);
      else { f.imp('import pwmio', 'from adafruit_motor import motor as motor_lib'); f.lib('adafruit_motor'); f.setup(`${v} = motor_lib.DCMotor(pwmio.PWMOut(${f.pin(p1)}, frequency=20000), pwmio.PWMOut(${f.pin(p2)}, frequency=20000))\n${v}.throttle = 0.5  # -1 reverse .. 1 forward`); }
    }
  },
  extras: i => [[String(i.count), '100 nF ceramic capacitor', 'solder across each motor\'s terminals (cuts electrical noise)']],
};

export const relay: BlockDef = {
  id: 'relay', label: 'Relay (isolated)', plural: 'relays', about: 'Opto-isolated 5 V relay module per channel; the contacts are screw terminals for your load.', max: 16,
  words: /\b(relays?|switch (a|the|my) (lamp|light|fan|heater|appliance|pump)|channel (relay|switch)|power switch board)\b/i, needsMcu: () => true,
  pins: i => [{ role: 'out', cap: 'gpio', high: true, label: `Relay ${n(i)}`, exp: true }], loads: i => [{ rail: 'v5', typ: 0.072, peak: 0.075, what: `relay ${n(i)} coil` }],
  draw(i, d) { const k = d.part('relay', 0, 0); d.net('V5', [k, 'VCC']); d.net('GND', [k, 'GND']); d.net('@out', [k, 'IN']); },
  fw(i, f) {
    const v = sid(i); const p = i.pins.out;
    if (f.fw === 'esphome') { f.esp('switch', `- platform: gpio\n${f.espPin(p)}\n  name: "Relay ${n(i)}"\n  id: ${v}\n  restore_mode: ALWAYS_OFF  # never switch a load on by itself after a power cut`); return; }
    if (f.fw === 'python' && !f.isExp(p)) { f.imp('from gpiozero import OutputDevice'); f.setup(`${v} = OutputDevice(${f.pin(p)}, active_high=True, initial_value=False)`); return; }
    if (f.fw === 'arduino') { const a = f.ard(p); f.setup(`${a.mode('OUTPUT')}\n  ${a.write('LOW')}  // relay ${n(i)} off at start`); return; }
    f.imp('import digitalio'); f.setup(`${v} = ${f.dio(p)}\n${v}.switch_to_output(value=False)  # relay ${n(i)} off at start`);
  },
  notes: i => (i.k === 0 ? ['Relay modules come active-high or active-low (some have a jumper): set it to active-high to match the firmware, so every relay starts off.', 'Keep load wiring low-voltage unless the whole product is built and tested as mains equipment (see Safety).'] : []),
  extras: i => (i.k === 0 ? [['1', 'Cable glands / strain reliefs', 'one per load cable']] : []),
};

export const ACTUATORS = [speaker, servo, motor, relay];
