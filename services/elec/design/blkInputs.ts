// Input blocks: push buttons, rotary encoders and knobs (potentiometers). With USB MIDI they send
// notes / CCs; with USB HID, keys and volume; otherwise they report to Home Assistant or the console.
// Released by Plajah as public domain (CC0).
import type { BlockDef } from './block';
import { n, sid } from './block';
import type { FwApi, Inst } from './types';

const adsCode = (i: Inst, f: FwApi, role: string, name: string) => {
  const a = f.ads(i.pins[role]); if (!a) return null;
  if (f.fw === 'esphome') return `- platform: ads1115\n  ads1115_id: ads${a.idx}\n  multiplexer: 'A${a.ch}_GND'\n  gain: 4.096\n  name: "${name}"\n  id: ${sid(i)}\n  update_interval: 200ms`;
  if (f.fw === 'arduino') return `ads${a.idx}.readADC_SingleEnded(${a.ch})`;
  f.imp('from adafruit_ads1x15.analog_in import AnalogIn as AdsIn', 'import adafruit_ads1x15.ads1115 as ADS'); return `AdsIn(ads${a.idx}, ADS.P${a.ch})`;
};

export const button: BlockDef = {
  id: 'button', label: 'Push button', plural: 'buttons', about: 'Momentary button from a pin to ground; the firmware turns on the pin\'s pull-up.', max: 16,
  words: /\b(buttons?|push ?buttons?|switches|keys|pads?|arcade buttons?|macro keys?)\b/i, needsMcu: () => true,
  pins: i => [{ role: 'in', cap: 'in', label: `Button ${n(i)}`, exp: true }], loads: () => [],
  draw(i, d) { const s = d.part('switch', 0, 0, 0, { state: 'open', I: '0.05' }); d.net('@in', [s, '1']); d.net('GND', [s, '2']); },
  fw(i, f) {
    const p = i.pins.in; const v = sid(i);
    if (f.fw === 'esphome') { f.esp('binary_sensor', `- platform: gpio\n${f.espPin(p, { input: true, pullup: true, inverted: true })}\n  name: "Button ${n(i)}"\n  filters:\n    - delayed_on_off: 10ms`); return; }
    if (f.fw === 'python' && !f.isExp(p)) { f.imp('from gpiozero import Button'); f.setup(`${v} = Button(${f.pin(p)})  # internal pull-up\n${v}.when_pressed = lambda: print("button ${n(i)} pressed", flush=True)`); return; }
    if (f.fw === 'arduino') { const a = f.ard(p); f.glob(`bool ${v}_last = HIGH;`); f.setup(a.mode('INPUT_PULLUP')); f.loop(`{ bool b = ${a.read}; if (b != ${v}_last) { ${v}_last = b; if (b == LOW) Serial.println("button ${n(i)} pressed"); delay(5); } }`); return; }
    f.imp('import digitalio'); f.setup(`${v} = ${f.dio(p)}\n${v}.switch_to_input(pull=digitalio.Pull.UP)  # pressed = pulled to ground\n${v}_last = True`);
    const press = i.usbMidi ? `midi.write(bytes([0x90, ${36 + i.k}, 100]))` : i.usbHid ? `kbd.press(Keycode.F${13 + (i.k % 12)})` : `print("button ${n(i)} pressed")`;
    const rel = i.usbMidi ? `midi.write(bytes([0x80, ${36 + i.k}, 0]))` : i.usbHid ? `kbd.release(Keycode.F${13 + (i.k % 12)})` : 'pass';
    f.loop(`if ${v}.value != ${v}_last:\n    ${v}_last = ${v}.value\n    if not ${v}_last:\n        ${press}\n    else:\n        ${rel}`);
  },
  extras: i => (i.k === 0 ? [['1', 'Button caps', 'for 12 mm tactile or 24/30 mm arcade buttons']] : []),
  notes: i => (i.k === 0 && i.usbHid ? ['Buttons send F13-F24: keys no app uses by default, so you can bind them to anything (macros, OBS scenes, shortcuts).'] : []),
};

export const encoder: BlockDef = {
  id: 'encoder', label: 'Rotary encoder', plural: 'encoders', about: 'Endless knob with a push switch (KY-040-class module with pull-ups).', max: 4,
  words: /\b(rotary )?encoders?\b|\bendless knobs?\b|\bjog wheel\b/i, needsMcu: () => true,
  pins: i => [{ role: 'a', cap: 'in', label: `Encoder ${n(i)} A` }, { role: 'b', cap: 'in', label: `Encoder ${n(i)} B` }, { role: 'sw', cap: 'in', label: `Encoder ${n(i)} push`, exp: true }],
  loads: () => [],
  draw(i, d) { const e = d.part('encoder', 0, 0); d.net('LOGIC', [e, '+']); d.net('GND', [e, 'GND']); d.net('@a', [e, 'CLK']); d.net('@b', [e, 'DT']); d.net('@sw', [e, 'SW']); },
  fw(i, f) {
    const v = sid(i); const { a, b, sw } = i.pins;
    if (f.fw === 'esphome') { f.esp('sensor', `- platform: rotary_encoder\n  name: "Encoder ${n(i)}"\n  id: ${v}\n  pin_a: ${f.pin(a)}\n  pin_b: ${f.pin(b)}`); f.esp('binary_sensor', `- platform: gpio\n${f.espPin(sw, { input: true, pullup: true, inverted: true })}\n  name: "Encoder ${n(i)} push"`); f.read(`Enc ${n(i)}`, v, ''); return; }
    if (f.fw === 'python') { f.imp('from gpiozero import RotaryEncoder, Button'); f.setup(`${v} = RotaryEncoder(${f.pin(a)}, ${f.pin(b)}, max_steps=0)\n${f.isExp(sw) ? `${v}_sw = ${f.dio(sw)}` : `${v}_sw = Button(${f.pin(sw)})`}`); f.read(`Enc ${n(i)}`, `${v}.steps`, ''); return; }
    if (f.fw === 'arduino') { f.imp('#include <Encoder.h>'); f.lib('Encoder (Paul Stoffregen)'); f.glob(`Encoder ${v}(${f.pin(a)}, ${f.pin(b)});`); f.setup(f.ard(sw).mode('INPUT_PULLUP')); f.read(`Enc ${n(i)}`, `${v}.read() / 4`, ''); return; }
    f.imp('import rotaryio', 'import digitalio'); f.setup(`${v} = rotaryio.IncrementalEncoder(${f.pin(a)}, ${f.pin(b)})\n${v}_last = 0\n${v}_sw = ${f.dio(sw)}\n${v}_sw.switch_to_input(pull=digitalio.Pull.UP)`);
    if (i.usbMidi) f.loop(`if ${v}.position != ${v}_last:\n    ${v}_last = ${v}.position\n    midi.write(bytes([0xB0, ${30 + i.k}, max(0, min(127, 64 + ${v}_last))]))`);
    else if (i.usbHid) f.loop(`if ${v}.position != ${v}_last:\n    step = ${v}.position - ${v}_last\n    ${v}_last = ${v}.position\n    for _ in range(abs(step)):\n        cc.send(ConsumerControlCode.VOLUME_INCREMENT if step > 0 else ConsumerControlCode.VOLUME_DECREMENT)`);
    else f.read(`Enc ${n(i)}`, `${v}.position`, '');
  },
  extras: i => (i.k === 0 ? [['1', 'Knob for 6 mm D-shaft', 'per encoder']] : []),
};

export const pot: BlockDef = {
  id: 'pot', label: 'Knob (potentiometer)', plural: 'knobs', about: '10k linear pot across the logic rail; the wiper goes to an analog input (or an ADS1115 channel when the board runs out).', max: 16,
  words: /\b(knobs?|pots?|potentiometers?|faders?|sliders?|dials?)\b/i, needsMcu: () => true,
  pins: i => [{ role: 'adc', cap: 'adc', label: `Knob ${n(i)}` }], loads: () => [{ rail: 'logic', typ: 0.0003, peak: 0.0004, what: 'knob' }],
  draw(i, d) { const r = d.part('potentiometer', 0, 0, 0, { R: '10k', pos: 0.5 }); d.net('LOGIC', [r, '1']); d.net('GND', [r, '2']); d.net('@adc', [r, 'W']); },
  fw(i, f) {
    const v = sid(i); const ads = adsCode(i, f, 'adc', `Knob ${n(i)}`);
    if (f.fw === 'esphome') { f.esp('sensor', ads ?? `- platform: adc\n  pin: ${f.pin(i.pins.adc)}\n  name: "Knob ${n(i)}"\n  id: ${v}\n  attenuation: 12db\n  update_interval: 200ms`); f.read(`Knob ${n(i)}`, v, 'V'); return; }
    if (f.fw === 'arduino') { f.read(`Knob ${n(i)}`, ads ?? `analogRead(${f.pin(i.pins.adc)})`, ''); return; }
    f.imp(f.fw === 'python' ? '' : 'import analogio');
    f.setup(`${v} = ${ads ?? `analogio.AnalogIn(${f.pin(i.pins.adc)})`}\n${v}_last = -1`);
    if (i.usbMidi) f.loop(`cc_val = ${v}.value >> 9  # 16-bit to 0-127\nif abs(cc_val - ${v}_last) > 1 or (cc_val in (0, 127) and cc_val != ${v}_last):\n    ${v}_last = cc_val\n    midi.write(bytes([0xB0, ${20 + i.k}, cc_val]))`);
    else f.read(`Knob ${n(i)}`, `round(${v}.value / 655.35)`, '%');
  },
  extras: i => (i.k === 0 ? [['1', 'Knob for 6 mm shaft', 'per pot']] : []),
};

export const INPUTS = [button, encoder, pot];
