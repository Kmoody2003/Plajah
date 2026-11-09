// Light blocks: indicator LEDs, a lamp of white LEDs (switched, or dimmed by a MOSFET), addressable
// pixels and a 12 V LED strip. Released by Plajah as public domain (CC0).
import { ledColor } from '../components';
import type { BlockDef } from './block';
import { e12Up, fmtR, n, sid, cap1 } from './block';
import type { Inst } from './types';

const COLORS = ['red', 'green', 'yellow', 'blue', 'white'];
const vmaxOf = (v: number) => (v < 4 ? 4.2 : v < 4.7 ? 4.8 : v * 1.05);

export const led: BlockDef = {
  id: 'led', label: 'Indicator LED', plural: 'indicator LEDs', about: 'A status LED on a pin, with its series resistor.', max: 6,
  words: /\b(status|indicator|power) (leds?|lights?)\b|\bleds?\b(?!.*\b(strip|lamp|lantern|light)\b)/i,
  opts: [{ key: 'color', label: 'Colour', choices: COLORS, default: 'green' }], needsMcu: () => true,
  pins: i => [{ role: 'led', cap: 'gpio', high: true, label: `LED ${n(i)}` }],
  loads: i => [{ rail: 'logic', typ: 0.008, peak: 0.009, what: `LED ${n(i)}` }],
  draw(i, d) {
    const color = String(i.opt.color ?? 'green'); const I = Math.min(0.008, (i.mcu?.part === 'pico' ? 0.012 : 0.02) * 0.7);
    const r = d.part('resistor', 0, 0, 0, { R: fmtR(e12Up(Math.max(10, (i.logicV - ledColor(color).vf) / I))) }); const dd = d.part('led', 6, 0, 0, { color });
    d.net('@led', [r, '1']); d.net('a', [r, '2'], [dd, 'A']); d.net('GND', [dd, 'K']);
  },
  fw(i, f) {
    const p = i.pins.led;
    if (f.fw === 'esphome') { f.esp('output', `- platform: gpio\n  pin: ${f.pin(p)}\n  id: ${sid(i, 'out')}`); f.esp('light', `- platform: binary\n  name: "LED ${n(i)}"\n  output: ${sid(i, 'out')}`); }
    else if (f.fw === 'circuitpython') { f.imp('import digitalio'); f.setup(`${sid(i)} = digitalio.DigitalInOut(${f.pin(p)})\n${sid(i)}.switch_to_output(value=True)`); }
    else if (f.fw === 'python') { f.imp('from gpiozero import LED'); f.setup(`${sid(i)} = LED(${f.pin(p)})\n${sid(i)}.on()`); }
    else { f.setup(`pinMode(${f.pin(p)}, OUTPUT);\n  digitalWrite(${f.pin(p)}, HIGH);`); }
  },
};

export const lamp: BlockDef = {
  id: 'lamp', label: 'Lamp LEDs', plural: 'lamp LEDs', about: 'White (or coloured) 5 mm LEDs, each with its own resistor; dimmed by a MOSFET when there is a controller, else on a switch.', max: 12,
  words: /\b(lamp|lantern|torch|flashlight|night ?light|reading light|desk light)\b/i,
  opts: [{ key: 'color', label: 'Colour', choices: COLORS, default: 'white' }],
  needsMcu: o => o.dim === true, instances: c => [Math.max(1, Math.min(12, c))],
  pins: i => (i.mcu ? [{ role: 'pwm', cap: 'pwm', high: true, label: 'Lamp dimmer' }] : []),
  loads: i => [{ rail: 'sys', typ: i.count * 0.015, peak: i.count * 0.018, what: `${i.count} lamp LED${i.count > 1 ? 's' : ''}` }],
  draw(i, d) {
    const color = String(i.opt.color ?? 'white'); const vf = ledColor(color).vf; const R = e12Up(Math.max(10, (vmaxOf(i.sysV) - vf) / 0.018));
    const anodes: Array<[string, string]> = [], cathodes: Array<[string, string]> = [];
    for (let k = 0; k < i.count; k++) { const r = d.part('resistor', 0, 4 * k, 0, { R: fmtR(R) }); const dd = d.part('led', 7, 4 * k, 0, { color }); anodes.push([r, '1']); d.net(`a${k}`, [r, '2'], [dd, 'A']); cathodes.push([dd, 'K']); }
    d.net('SYS', ...anodes);
    if (i.mcu) {
      const q = d.part('nmos', 16, 4 * i.count, 0); const rg = d.part('resistor', 8, 4 * i.count + 4, 0, { R: '100' }); const rp = d.part('resistor', 12, 4 * i.count + 9, 1, { R: '100k' });
      d.net('drain', ...cathodes, [q, 'D']); d.net('GND', [q, 'S']); d.net('@pwm', [rg, '1']); d.net('gate', [rg, '2'], [q, 'G'], [rp, '1']); d.net('GND', [rp, '2']);
    } else for (const c of cathodes) d.net('GND', c);
  },
  fw(i, f) {
    if (!i.mcu) return; const p = i.pins.pwm;
    if (f.fw === 'esphome') { f.esp('output', `- platform: ledc\n  pin: ${f.pin(p)}\n  id: ${sid(i, 'pwm')}\n  frequency: 1000 Hz`); f.esp('light', `- platform: monochromatic\n  name: "Lamp"\n  output: ${sid(i, 'pwm')}\n  gamma_correct: 2.8\n  default_transition_length: 0.5s`); }
    else if (f.fw === 'circuitpython') { f.imp('import pwmio'); f.setup(`lamp = pwmio.PWMOut(${f.pin(p)}, frequency=1000, duty_cycle=0)\nlamp_level = 0.6  # 0..1\nlamp.duty_cycle = int(65535 * lamp_level ** 2.2)  # gamma for even dimming`); }
    else if (f.fw === 'python') { f.imp('from gpiozero import PWMLED'); f.setup(`lamp = PWMLED(${f.pin(p)})\nlamp.value = 0.6`); }
    else { f.setup(`analogWrite(${f.pin(p)}, 150);  // lamp brightness 0-255`); }
  },
  notes: i => [`Lamp resistors are sized for ${vmaxOf(i.sysV).toFixed(1)} V (a full ${i.sysV < 4 ? 'cell' : 'supply'}) so no LED passes 18 mA; they run a little dimmer as the ${i.sysV < 4.7 ? 'battery drains' : 'supply sags'}.`],
};

export const neopixel: BlockDef = {
  id: 'neopixel', label: 'Addressable RGB LEDs', plural: 'RGB pixels', about: 'WS2812B pixels (strip, ring or matrix) on one data pin, with a series resistor and a bulk capacitor.', max: 120,
  words: /\b(neo ?pixels?|ws2812b?|addressable|rgb (leds?|strip|ring|lights?)|led (ring|matrix)|rainbow)\b/i,
  opts: [{ key: 'cap', label: 'Brightness cap', choices: ['0.2', '0.4', '0.6', '1'], default: '0.4' }], needsMcu: () => true, instances: c => [Math.max(1, Math.min(120, c))],
  pins: () => [{ role: 'data', cap: 'pwm', label: 'Pixel data' }],
  loads: i => [{ rail: 'v5', typ: i.count * 0.02 * Number(i.opt.cap ?? 0.4), peak: i.count * 0.06 * Number(i.opt.cap ?? 0.4), what: `${i.count} RGB pixels (cap ${Math.round(Number(i.opt.cap ?? 0.4) * 100)}%)` }],
  draw(i, d) {
    const px = d.part('neopixel', 12, 0, 0, { n: i.count, cap: String(i.opt.cap ?? 0.4) }); const r = d.part('resistor', 0, 2, 0, { R: '330' }); const c = d.part('electrolytic', 4, -6, 1, { C: '470u', V: '16' });
    d.net('@data', [r, '1']); d.net('din', [r, '2'], [px, 'DIN']); d.net('V5', [px, '5V'], [c, '+']); d.net('GND', [px, 'GND']); d.net('GND', [c, '-']);
  },
  fw(i, f) {
    const p = i.pins.data; const cap = Number(i.opt.cap ?? 0.4);
    if (f.fw === 'esphome') f.esp('light', `- platform: esp32_rmt_led_strip\n  rgb_order: GRB\n  chipset: WS2812\n  pin: ${f.pin(p)}\n  num_leds: ${i.count}\n  name: "Pixels"\n  color_correct: [${Math.round(cap * 100)}%, ${Math.round(cap * 100)}%, ${Math.round(cap * 100)}%]  # power cap the supply was sized for\n  effects:\n    - addressable_rainbow:`);
    else if (f.fw === 'circuitpython' || f.fw === 'python') { f.imp('import neopixel', 'from rainbowio import colorwheel'); f.lib('neopixel'); f.setup(`pixels = neopixel.NeoPixel(${f.bpin(p)}, ${i.count}, brightness=${cap}, auto_write=False)  # cap = what the supply was sized for\nhue = 0`); f.loop(`hue = (hue + 1) % 256\nfor k in range(${i.count}):\n    pixels[k] = colorwheel((hue + k * 256 // ${i.count}) % 256)\npixels.show()`); }
    else { f.imp('#include <Adafruit_NeoPixel.h>'); f.lib('Adafruit NeoPixel'); f.glob(`Adafruit_NeoPixel pixels(${i.count}, ${f.pin(p)}, NEO_GRB + NEO_KHZ800);\nuint16_t hue = 0;`); f.setup(`pixels.begin();\n  pixels.setBrightness(${Math.round(cap * 255)});  // supply was sized for this cap`); f.loop(`hue += 256;\n  pixels.rainbow(hue);\n  pixels.show();`); }
  },
  notes: i => [`${i.count} pixels at ${Math.round(Number(i.opt.cap ?? 0.4) * 100)}% cap: up to ${(i.count * 0.06 * Number(i.opt.cap ?? 0.4)).toFixed(2)} A from 5 V. Raising the cap in firmware needs a bigger supply.`, ...(i.logicV < 4 ? ['3.3 V data into 5 V pixels is below the WS2812B\'s 3.5 V input-high spec; it usually works with short wires, and a 74AHCT125 level shifter makes it reliable.'] : [])],
  extras: () => [['1', '3-pin JST-SM pigtail', 'pixel connector through the case']],
};

export const strip12: BlockDef = {
  id: 'strip12', label: '12 V LED strip (dimmable)', plural: 'LED strips', about: 'A single-colour 12 V strip switched low-side by a logic-level MOSFET on a PWM pin.', max: 1,
  words: /\b(12 ?v (led )?strip|led strip|strip lights?|light strip|under-?cabinet)\b/i,
  opts: [{ key: 'watts', label: 'Strip power (W)', default: 6 }], needsMcu: () => true, instances: () => [1],
  pins: () => [{ role: 'pwm', cap: 'pwm', high: true, label: 'Strip dimmer' }],
  loads: i => [{ rail: 'v12', typ: Number(i.opt.watts ?? 6) / 12, peak: Number(i.opt.watts ?? 6) / 12, what: `${i.opt.watts ?? 6} W strip` }],
  draw(i, d) {
    const s = d.part('ledstrip', 14, -8, 1, { V: 12, W: Number(i.opt.watts ?? 6) }); const q = d.part('nmos', 13, 0, 0); const rg = d.part('resistor', 0, 0, 0, { R: '100' }); const rp = d.part('resistor', 7, 5, 1, { R: '100k' });
    d.net('V12', [s, '+']); d.net('drain', [s, '-'], [q, 'D']); d.net('GND', [q, 'S']); d.net('@pwm', [rg, '1']); d.net('gate', [rg, '2'], [q, 'G'], [rp, '1']); d.net('GND', [rp, '2']);
  },
  fw(i, f) {
    const p = i.pins.pwm;
    if (f.fw === 'esphome') { f.esp('output', `- platform: ledc\n  pin: ${f.pin(p)}\n  id: ${sid(i, 'pwm')}\n  frequency: 1000 Hz`); f.esp('light', `- platform: monochromatic\n  name: "Strip"\n  output: ${sid(i, 'pwm')}\n  gamma_correct: 2.8`); }
    else if (f.fw === 'circuitpython') { f.imp('import pwmio'); f.setup(`strip = pwmio.PWMOut(${f.pin(p)}, frequency=1000, duty_cycle=40000)`); }
    else if (f.fw === 'python') { f.imp('from gpiozero import PWMLED'); f.setup(`strip = PWMLED(${f.pin(p)})\nstrip.value = 0.6`); }
    else f.setup(`analogWrite(${f.pin(p)}, 150);  // strip brightness`);
  },
  extras: i => [['1', `12 V LED strip, ${i.opt.watts ?? 6} W total`, ''], ['1', 'Aluminium channel with diffuser', 'spreads the heat and the light']],
};

export const LIGHTS = [led, lamp, neopixel, strip12];
void cap1; void ({} as Inst);
