// Prompt to design: "a portable speaker", "a lamp with 6 warm LEDs", "a MIDI controller with 3
// knobs and 7 buttons", "my own electric guitar", "a smart lamp for Home Assistant". Each recipe is a
// parametric product: it draws the schematic (wired for the simulator), sizes the parts, writes the
// firmware, and hands its parts to the enclosure fitter (or, for a guitar, plans the body routes).
// The prompt reader is plain rules; the desktop app can pre-read prompts with an on-device model,
// but it only ever fills in these same parameters. Released by Plajah as public domain (CC0).

import { Builder } from './designs';
import type { Circuit } from './circuit';
import type { SimOptions } from './sim';
import { ledColor, parseSi } from './components';
import { PHYSICAL, designEnclosure, type Enclosure, type Item } from './enclosure';
import { guitarPlan, type GuitarPlan } from './guitar';
import { PI_MODELS } from './boards';

export type Values = Record<string, number | string | boolean>;
export interface RecipeParam { key: string; label: string; kind: 'number' | 'choice' | 'bool'; default: number | string | boolean; choices?: string[]; min?: number; max?: number; unit?: string }
export interface Firmware { file: string; lang: string; code: string; about: string; extra?: Array<{ file: string; code: string }> }
export interface Build {
  recipe: string; title: string; summary: string; circuit: Circuit; sim: SimOptions; pairs: Array<[string, string]>;
  values: Values; enclosure?: Enclosure; body?: GuitarPlan; firmware?: Firmware;
  /** Mechanical and wiring extras the schematic does not show: [qty, item, note]. */
  extras: string[][]; steps: string[]; notes: string[]; market: 'US' | 'EU' | 'both'; toy?: boolean;
  /** Open-ended designs (services/elec/design): pin map, power budget, review list, BOM with sourcing. */
  design?: import('./design/outputs').DesignReport;
}
export interface Recipe { id: string; title: string; about: string; examples: string[]; match: RegExp; params: RecipeParam[]; build(v: Values): Build }

const E12 = [10, 12, 15, 18, 22, 27, 33, 39, 47, 56, 68, 82];
/** Nearest standard E12 value at or above `r` ohms. */
export function e12Above(r: number): number { const dec = Math.pow(10, Math.floor(Math.log10(Math.max(1, r)))); for (const m of [...E12, 100]) if (m / 10 * dec >= r - 1e-9) return m / 10 * dec; return r; }
const fmtR = (r: number) => (r >= 1e6 ? `${+(r / 1e6).toPrecision(3)}M` : r >= 1e3 ? `${+(r / 1e3).toPrecision(3)}k` : `${+r.toPrecision(3)}`);
const num = (v: Values, k: string, d: number) => { const x = Number(v[k]); return Number.isFinite(x) ? x : d; };
const str = (v: Values, k: string, d: string) => (v[k] === undefined || v[k] === '' ? d : String(v[k]));
const bool = (v: Values, k: string) => v[k] === true || v[k] === 'true' || v[k] === 'yes';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(x)));
const items = (c: Circuit, extra: Item[] = []): Item[] => [...c.parts.filter(p => PHYSICAL[p.kind]).map(p => ({ name: p.ref, ref: p.ref, ...PHYSICAL[p.kind](p.params) })), ...extra];

// ---------------------------------------------------------------- lamp
const lamp: Recipe = {
  id: 'lamp', title: 'LED lamp', about: 'A desk, night or reading light: LEDs with their own current-limiting resistors, from USB or batteries.',
  examples: ['a USB desk lamp with 6 warm white LEDs', 'battery night light, blue'], match: /\b(lamp|light|night ?light|torch|flashlight|lantern|reading light)\b/i,
  params: [{ key: 'leds', label: 'LEDs', kind: 'number', default: 3, min: 1, max: 12 }, { key: 'color', label: 'Colour', kind: 'choice', default: 'white', choices: ['white', 'red', 'yellow', 'green', 'blue'] },
    { key: 'power', label: 'Power', kind: 'choice', default: 'usb', choices: ['usb', 'battery'] }, { key: 'brightness', label: 'Brightness', kind: 'choice', default: 'normal', choices: ['low', 'normal', 'bright'] }],
  build(v) {
    const n = clamp(num(v, 'leds', 3), 1, 12), color = str(v, 'color', 'white'), usb = str(v, 'power', 'usb') !== 'battery';
    const I = { low: 0.005, normal: 0.015, bright: 0.019 }[str(v, 'brightness', 'normal')] ?? 0.015; const Vs = usb ? 5 : 4.5; const vf = ledColor(color).vf;
    const R = e12Above((Vs - vf) / I); const b = new Builder(); const pin = usb ? 'VBUS' : '+', npin = usb ? 'GND' : '-';
    if (usb) b.part('usb5v', 'J1', 0, 0); else b.part('battery', 'J1', 0, 0, 0, { V: 4.5, Rint: 0.4, mAh: 2400 });
    b.part('switch', 'SW1', 0, -5, 1); b.w(['J1', pin], ['SW1', '2']); b.w(['J1', npin], [b.gnd(0, 4), 'GND']);
    const g = b.gnd(13, -7);
    for (let k = 0; k < n; k++) { const y = -9 - 3 * k; b.part('resistor', `R${k + 1}`, 5, y, 0, { R: fmtR(R) }).part('led', `D${k + 1}`, 11, y, 0, { color }); b.w(['SW1', '1'], [`R${k + 1}`, '1'], [], 'vh'); b.w([`R${k + 1}`, '2'], [`D${k + 1}`, 'A']); b.w([`D${k + 1}`, 'K'], [g, 'GND']); }
    const c = b.done(`${color[0].toUpperCase() + color.slice(1)} LED lamp`);
    const mA = Math.round((Vs - vf) / R * 1000 * n);
    return { recipe: 'lamp', title: c.name, circuit: c, sim: { mode: 'dc' }, pairs: b.pairs, values: { leds: n, color, power: usb ? 'usb' : 'battery', brightness: str(v, 'brightness', 'normal') }, market: 'both',
      summary: `${n} × ${color} LED, each with a ${fmtR(R)} Ω resistor (about ${Math.round((Vs - vf) / R * 1000)} mA each, ${mA} mA total) from ${usb ? 'USB 5 V' : '3 × AA (4.5 V)'}.`,
      enclosure: designEnclosure(items(c), { name: 'lamp' }), extras: [['1', 'Diffuser (frosted acrylic or a printed thin-wall shade)', 'over the LEDs'], ['4', 'M3 × 8 screws', 'lid'], ['1', 'Perfboard 50 × 70 mm', 'or the PCB from the Board tab']],
      steps: ['Solder each LED with its own resistor (long LED leg = anode = A).', 'Wire the switch in the positive lead.', 'Print the base and lid; push the LEDs into the top holes.', 'Run the checks again with your exact LED colour.'],
      notes: usb ? ['Under 500 mA, so any USB port can run it.'] : ['3 × AA alkaline give roughly 2400 mAh.'] };
  },
};

// ---------------------------------------------------------------- USB wall charger
const charger: Recipe = {
  id: 'charger', title: 'USB wall charger', about: 'Mains to USB using a certified AC-DC module (the hazardous part arrives pre-approved), fused, with a power light.',
  examples: ['a 2-port USB wall charger', 'usb charger for europe, 3 ports'], match: /\b(charger|wall (plug|adapter|wart)|power (brick|adapter)|usb (plug|power supply))\b/i,
  params: [{ key: 'ports', label: 'USB ports', kind: 'number', default: 2, min: 1, max: 4 }, { key: 'amps', label: 'Amps per port', kind: 'choice', default: '2.4', choices: ['1', '2.1', '2.4'] }, { key: 'mains', label: 'Mains', kind: 'choice', default: '120', choices: ['120', '230'] }],
  build(v) {
    const n = clamp(num(v, 'ports', 2), 1, 4), A = num(v, 'amps', 2.4), V = str(v, 'mains', '120'); const need = n * A;
    const sizes = [1, 2, 3, 4, 6]; const I = sizes.find(s => s >= need * 1.1) ?? 6;
    const b = new Builder();
    b.part('mains', 'J1', 0, 0, 0, { Vrms: V, f: V === '230' ? 50 : 60 }).part('fuse', 'F1', 5, -6, 0, { I: '1' }).part('acdc', 'PS1', 14, -4, 0, { V: 5, I: String(I) });
    b.w(['J1', 'L'], ['F1', '1']); b.w(['F1', '2'], ['PS1', 'L']); b.w(['J1', 'N'], ['PS1', 'N'], [[9, 2], [9, -4]]);
    b.w(['PS1', '-'], [b.gnd(19, -1), 'GND']);
    for (let k = 0; k < n; k++) { const x = 24 + 5 * k; b.part('usbload', `P${k + 1}`, x, -2, 0, { I: String(A) }); b.w(['PS1', '+'], [`P${k + 1}`, 'VBUS'], [[x, -6]]); b.w([`P${k + 1}`, 'GND'], [b.gnd(x, 2), 'GND']); }
    const xl = 24 + 5 * n + 4; b.part('resistor', 'R1', xl, -2, 1, { R: '1k' }).part('led', 'D1', xl, 4, 1, { color: 'blue' });
    b.w(['PS1', '+'], ['R1', '1'], [[xl, -6]]); b.w(['R1', '2'], ['D1', 'A']); b.w(['D1', 'K'], [b.gnd(xl, 8), 'GND']);
    const c = b.done(`${n}-port USB charger`);
    return { recipe: 'charger', title: c.name, circuit: c, sim: { mode: 'dc' }, pairs: b.pairs, values: { ports: n, amps: String(A), mains: V }, market: V === '230' ? 'EU' : 'US',
      summary: `${n} USB-A port${n > 1 ? 's' : ''} at up to ${A} A each from a certified 5 V ${I} A (${I * 5} W) module, ${V} V mains in, T1A fuse.`,
      enclosure: designEnclosure(items(c), { name: 'charger', wall: 3 }),
      extras: [['1', `Certified 5 V ${I} A AC-DC module (IEC/UL 62368-1)`, 'e.g. an IRM-class encapsulated module'], ['1', 'Slow-blow fuse T1A + holder', 'in the line conductor'], ['1', 'IEC C8 inlet or approved plug pins', 'never improvise mains pins'],
        [String(n), 'USB-A receptacles', 'short D+ to D- on each port (USB BC1.2 dedicated charging port) so phones draw more than 500 mA'], ['1', 'V-0 flame-rated enclosure material (PC or PC/ABS)', 'PLA is not acceptable around mains']],
      steps: ['Build and test the low-voltage side first from a bench 5 V supply.', 'Mount the AC-DC module with the datasheet creepage and clearance; keep mains copper 6 mm from everything else.', 'Fuse in the line (brown/black) wire, insulated, strain-relieved.', 'Close the case before connecting mains. Get it tested before selling.'],
      notes: ['Mains voltages can kill: if you have not worked on mains before, build it with someone who has.', 'USB-C instead: a 5 V USB-C source advertises 3 A with 10 kΩ pull-ups from VBUS to each CC pin (1.5 A: 22 kΩ); fast-charge voltages need a PD controller chip.'] };
  },
};

// ---------------------------------------------------------------- speaker
const speaker: Recipe = {
  id: 'speaker', title: 'Powered speaker', about: 'A portable speaker: audio in, volume knob, class-D amplifier module and a driver sized to the power.',
  examples: ['a portable bluetooth-free speaker', 'battery powered 3 watt speaker', 'a small amp for my phone'], match: /\b(speaker|boombox|amp(lifier)?|sound ?box|subwoofer)\b/i,
  params: [{ key: 'watts', label: 'Power', kind: 'number', default: 2.5, min: 0.5, max: 3, unit: 'W' }, { key: 'power', label: 'Power from', kind: 'choice', default: 'usb', choices: ['usb', 'battery'] }, { key: 'ohms', label: 'Driver', kind: 'choice', default: '4', choices: ['4', '8'] }],
  build(v) {
    const W = Math.min(3, Math.max(0.5, num(v, 'watts', 2.5))), usb = str(v, 'power', 'usb') !== 'battery', ohms = str(v, 'ohms', '4');
    const b = new Builder(); const pin = usb ? 'VBUS' : '+', npin = usb ? 'GND' : '-';
    if (usb) b.part('usb5v', 'J1', -8, -8, 0, { Imax: '1' }); else b.part('battery', 'J1', -8, -8, 0, { V: 4.5, Rint: 0.3, mAh: 2400 });
    b.part('amp', 'U1', 0, 0, 0, { gain: 24, P: '2.5' }).part('speaker', 'LS1', 10, -2, 0, { R: Number(ohms), P: String(Math.max(3, Math.ceil(W))) });
    b.part('signal', 'V1', -34, 6, 0, { Vpk: '0.2', f: '1k' }).part('potentiometer', 'RV1', -26, 4, 0, { R: '10k', pos: 0.5 }).part('capacitor', 'C1', -14, 1, 0, { C: '1u' });
    b.w(['J1', pin], ['U1', 'VCC'], [[-3.5, -10]]); b.w(['U1', 'GND'], ['J1', npin], [[-6, -1], [-6, -6]]); b.w(['J1', npin], [b.gnd(-8, -4), 'GND']);
    b.w(['V1', '+'], ['RV1', '1']); b.w(['RV1', '2'], [b.gnd(-24, 6), 'GND']); b.w(['V1', '-'], [b.gnd(-34, 10), 'GND']);
    b.w(['RV1', 'W'], ['C1', '1'], [[-16, 2]]); b.w(['C1', '2'], ['U1', 'IN']);
    b.w(['U1', 'OUT+'], ['LS1', '+']); b.w(['U1', 'OUT-'], ['LS1', '-']);
    const c = b.done('Powered speaker');
    const dia = W <= 1 ? 40 : W <= 3 ? 57 : 77; const boxL = Math.round(dia * 1.6);
    const enc = designEnclosure(items(c), { name: 'speaker', minInterior: [boxL, Math.round(dia * 1.1), dia + 6] });
    const litres = enc.W * enc.D * enc.H / 1e6;
    return { recipe: 'speaker', title: 'Powered speaker', circuit: c, sim: { mode: 'tran', tEnd: 0.005, steps: 2000 }, pairs: b.pairs, values: { watts: W, power: usb ? 'usb' : 'battery', ohms }, market: 'both',
      summary: `Class-D amp (PAM8302-class, about 2.5 W into 4 Ω at 5 V) driving a ${dia} mm ${ohms} Ω driver, 10k volume pot, ${usb ? 'USB 5 V (1 A charger)' : '3 × AA'}. Sealed box about ${litres.toFixed(2)} L.`,
      enclosure: enc, extras: [['1', `${dia} mm full-range driver, ${ohms} Ω, ≥ ${Math.max(3, Math.ceil(W))} W`, 'glue or screw behind the grille'], ['1', 'Knob for 6 mm shaft', ''], ['1', 'Foam or polyfill', 'loosely fill the box to tame resonances'], ['1', 'Gasket strip', 'seal the lid: a sealed box gives tighter bass']],
      steps: ['Wire input → volume pot → 1 µF → amp IN; the amp outputs go straight to the speaker (bridged: never to ground).', 'Mount the driver behind the grille holes; seal the lid.', 'Simulate: watch the speaker power at mid volume, then turn RV1 up until the checks warn about clipping or power.'],
      notes: ['Bluetooth: add a certified BT audio receiver module in place of V1; its radio approval is what lets you sell it.', 'More than 3 W needs a 12-24 V amplifier (TPA3116-class) and an adapter; ask for "a 20 W speaker" once that recipe lands.'] };
  },
};

// ---------------------------------------------------------------- MIDI controller
const MIDI_BTN = ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP16', 'GP17'];
const MIDI_POT = ['GP26', 'GP27', 'GP28'];
const midi: Recipe = {
  id: 'midi', title: 'USB MIDI controller', about: 'Knobs and buttons on a Raspberry Pi Pico that shows up as a USB MIDI device in any DAW (Chora too), with firmware.',
  examples: ['a midi controller with 3 knobs and 7 buttons', 'a small knob box for my DAW'], match: /\b(midi|controller|knob box|launch ?pad|drum pads?|faders?|macro pad|daw controller)\b/i,
  params: [{ key: 'knobs', label: 'Knobs', kind: 'number', default: 3, min: 1, max: 3 }, { key: 'buttons', label: 'Buttons', kind: 'number', default: 4, min: 1, max: 7 }],
  build(v) {
    const nk = clamp(num(v, 'knobs', 3), 1, 3), nb = clamp(num(v, 'buttons', 4), 1, 7); const b = new Builder();
    b.part('pico', 'U1', 0, 0, 0, { variant: 'Pico', high: 'GP15' }).part('usb5v', 'J1', -14, -6);
    b.w(['J1', 'VBUS'], ['U1', 'VBUS']); b.w(['J1', 'GND'], [b.gnd(-14, -2), 'GND']); b.w(['U1', 'GND'], [b.gnd(-10, -3), 'GND']);
    for (let k = 0; k < nk; k++) {
      const x = -18 - 6 * k; b.part('potentiometer', `RV${k + 1}`, x, 10, 1, { R: '10k', pos: 0.5 });
      b.w(['U1', '3V3'], [`RV${k + 1}`, '1'], [[-6, -2], [-6, -12], [x, -12]]); b.w([`RV${k + 1}`, '2'], [b.gnd(x, 14), 'GND']);
      b.w([`RV${k + 1}`, 'W'], ['U1', MIDI_POT[k]], [[x + 2, 2 * k]]);
    }
    const bus = b.gnd(20, 10);
    for (let k = 0; k < nb; k++) { const pin = MIDI_BTN[k]; const y = [-8, -6, -4, -2, 0, 4, 6][k]; b.part('switch', `SW${k + 1}`, 8, y, 0, { state: 'open', I: '0.05' }); b.w(['U1', pin], [`SW${k + 1}`, '1']); b.w([`SW${k + 1}`, '2'], [bus, 'GND'], [[20, y]]); }
    b.part('resistor', 'R1', 8, 2, 0, { R: '330' }).part('led', 'D1', 14, 2, 0, { color: 'green' }); b.w(['U1', 'GP15'], ['R1', '1']); b.w(['R1', '2'], ['D1', 'A']); b.w(['D1', 'K'], [bus, 'GND'], [[20, 2]]);
    const c = b.done('USB MIDI controller');
    const code = `# Plajah Build: USB MIDI controller for Raspberry Pi Pico (CircuitPython). Public domain (CC0).
# Copy to the CIRCUITPY drive as code.py. Knobs send CC ${20}-${20 + nk - 1}, buttons send notes ${36}-${36 + nb - 1} on channel 1.
import time
import board, analogio, digitalio, usb_midi

midi = usb_midi.ports[1]  # CircuitPython's USB MIDI output port
CHANNEL = 0               # 0 = MIDI channel 1
FIRST_CC, FIRST_NOTE = 20, 36

knobs = [analogio.AnalogIn(p) for p in (${MIDI_POT.slice(0, nk).map(p => `board.${p}`).join(', ')},)]
buttons = []
for pin in (${MIDI_BTN.slice(0, nb).map(p => `board.${p}`).join(', ')},):
    b = digitalio.DigitalInOut(pin)
    b.switch_to_input(pull=digitalio.Pull.UP)  # pressed = pin pulled to ground
    buttons.append(b)
led = digitalio.DigitalInOut(board.GP15)
led.switch_to_output()

last_cc = [-1] * len(knobs)
last_btn = [True] * len(buttons)

def send(*data):
    midi.write(bytes(data))
    led.value = True

while True:
    led.value = False
    for i, k in enumerate(knobs):
        v = k.value >> 9  # 16-bit reading to 0-127
        if abs(v - last_cc[i]) > 1 or (v in (0, 127) and v != last_cc[i]):
            last_cc[i] = v
            send(0xB0 | CHANNEL, FIRST_CC + i, v)
    for i, b in enumerate(buttons):
        if b.value != last_btn[i]:
            last_btn[i] = b.value
            if b.value:
                send(0x80 | CHANNEL, FIRST_NOTE + i, 0)
            else:
                send(0x90 | CHANNEL, FIRST_NOTE + i, 100)
    time.sleep(0.005)
`;
    return { recipe: 'midi', title: c.name, circuit: c, sim: { mode: 'dc' }, pairs: b.pairs, values: { knobs: nk, buttons: nb }, market: 'both',
      summary: `Raspberry Pi Pico with ${nk} knob${nk > 1 ? 's' : ''} (CC ${20}-${20 + nk - 1}) and ${nb} button${nb > 1 ? 's' : ''} (notes ${36}-${36 + nb - 1}), activity LED, USB-powered and class-compliant: no driver needed.`,
      enclosure: designEnclosure(items(c), { name: 'midi-controller' }),
      firmware: { file: 'code.py', lang: 'python', code, about: 'Install CircuitPython on the Pico (hold BOOTSEL, plug in, drop the .uf2), then save this as code.py on the CIRCUITPY drive.' },
      extras: [[String(nk), 'Knobs for 6 mm shafts', ''], [String(nb), 'Button caps', '12 mm tactile or arcade buttons'], ['1', 'USB cable (micro-USB or USB-C to match the Pico)', ''], ['4', 'Rubber feet', '']],
      steps: ['Solder headers to the Pico, or wire straight to its pads.', 'Knob ends go to 3V3 and GND, wipers to GP26-GP28.', 'Each button goes from its GPIO to ground (the firmware turns on internal pull-ups).', 'Flash CircuitPython, copy code.py, and pick "CircuitPython MIDI" as an input in your DAW.'],
      notes: ['The Pico has three analog inputs. For more knobs add a CD4051 8-channel multiplexer per eight knobs.'] };
  },
};

// ---------------------------------------------------------------- electric guitar
const guitar: Recipe = {
  id: 'guitar', title: 'Electric guitar or bass', about: 'Your own instrument: passive pickup wiring (volume + tone), and a body plan for the CNC router with pockets placed from the scale length.',
  examples: ['my own electric guitar with two humbuckers', 'a 34 inch scale bass', 'a single pickup guitar, 24.75" scale'], match: /\b(guitar|bass|telecaster-?like|electric guitar|six ?string)\b/i,
  params: [{ key: 'scale', label: 'Scale length', kind: 'number', default: 648, min: 500, max: 900, unit: 'mm' }, { key: 'pickups', label: 'Pickups', kind: 'number', default: 2, min: 1, max: 2 },
    { key: 'type', label: 'Pickup type', kind: 'choice', default: 'humbucker', choices: ['humbucker', 'single'] }, { key: 'frets', label: 'Frets', kind: 'number', default: 22, min: 19, max: 24 }, { key: 'bass', label: 'Bass', kind: 'bool', default: false }],
  build(v) {
    const bass = bool(v, 'bass'); const scale = num(v, 'scale', bass ? 864 : 648), n = clamp(num(v, 'pickups', 2), 1, 2), type = str(v, 'type', 'humbucker') === 'single' ? 'single' : 'humbucker', frets = clamp(num(v, 'frets', bass ? 20 : 22), 19, 24);
    const hum = type === 'humbucker'; const pot = hum ? '500k' : '250k', cap = hum ? '22n' : '47n';
    const b = new Builder();
    b.part('potentiometer', 'RV1', 8, -4, 0, { R: pot, pos: 0.02 }).part('potentiometer', 'RV2', 8, 6, 0, { R: pot, pos: 0.98 }).part('capacitor', 'C1', 10, 9, 1, { C: cap }).part('jack', 'J1', 18, -6);
    for (let k = 0; k < n; k++) {
      const x = -8 * k; b.part('pickup', `PU${k + 1}`, x, 0, 0, { type, Vpk: '0.2', f: '440' }); b.w([`PU${k + 1}`, '-'], [b.gnd(x, 4), 'GND']);
      if (n > 1) { b.part('switch', `SW${k + 1}`, x, -6, 1, { state: 'closed', I: '0.1' }); b.w([`PU${k + 1}`, '+'], [`SW${k + 1}`, '2']); b.w([`SW${k + 1}`, '1'], ['RV1', '1'], [[x, -10], [6, -10]]); }
      else b.w([`PU${k + 1}`, '+'], ['RV1', '1'], [[x, -10], [6, -10]]);
    }
    b.w(['RV1', '2'], [b.gnd(10, -2), 'GND']); b.w(['RV1', 'W'], ['J1', 'T']); b.w(['J1', 'S'], [b.gnd(18, -2), 'GND']);
    b.w(['RV1', '1'], ['RV2', '1'], [[6, 6]]); b.w(['RV2', 'W'], ['RV2', '2'], [[10, 4]]); b.w(['RV2', '2'], ['C1', '1']); b.w(['C1', '2'], [b.gnd(10, 13), 'GND']);
    const c = b.done(bass ? 'Electric bass' : 'Electric guitar');
    const body = guitarPlan({ scale, frets, pickups: Array.from({ length: n }, () => type), bass, name: bass ? 'bass' : 'guitar' });
    const inch = (scale / 25.4).toFixed(2);
    return { recipe: 'guitar', title: c.name, circuit: c, sim: { mode: 'tran', tEnd: 3 / 440, steps: 3000 }, pairs: b.pairs, values: { scale, pickups: n, type, frets, bass }, market: 'both',
      summary: `${scale} mm (${inch}") scale, ${frets} frets, ${n} ${type}${n > 1 ? 's with on/off switches' : ''}; ${pot} volume and tone pots, ${cap === '22n' ? '22 nF' : '47 nF'} tone cap, ¼" jack. Body on our own Arc outline, neck at fret ${body.edgeFret}.`,
      body, extras: [['1', `Body blank ${bass ? '480 × 360' : '450 × 340'} × 45 mm`, 'alder, ash, mahogany or poplar'], ['1', `${bass ? 'Bass' : 'Guitar'} neck, bolt-on, ${scale} mm scale`, 'or make one: the fretboard drawing has every slot'], ['1', 'Bridge (hardtail or tremolo) + tuners + strap buttons', ''],
        ['1', 'Shielding tape or paint', 'line the control cavity, ground it to the jack sleeve'], ['4', 'Neck screws + neck plate', ''], ['1', 'Pickguard / cavity cover', 'cut from the same DXF on a laser or router']],
      steps: ['Send the body DXF to the CNC router (Make tab): outline last, with tabs.', 'Pocket depths are in the routes table; the control cavity routes from the back.', 'Drill the bridge ground wire hole to the cavity; ground the bridge.', 'Wire pickups → switches → volume → jack; tone pot as a variable resistor into the cap to ground.', 'Simulate: the jack voltage shows how volume and tone shape the signal.'],
      notes: [...body.notes, 'Exact pocket sizes depend on your pickups and bridge: measure them and adjust before routing.'] };
  },
};

// ---------------------------------------------------------------- smart lamp (ESP32)
const secrets = `# secrets.yaml: keep this file private, never commit it.
wifi_ssid: ""
wifi_password: ""
fallback_password: ""   # set a unique one per device (no shared default passwords)
api_key: ""             # generate with: esphome wizard, or 32 random bytes in base64
ota_password: ""
`;
const smartLamp: Recipe = {
  id: 'smart-lamp', title: 'Smart LED lamp (Wi-Fi)', about: 'A dimmable 12 V LED-strip lamp on an ESP32 running ESPHome, so Home Assistant, a phone or a voice assistant can control it.',
  examples: ['a smart lamp I can control from my phone', 'wifi led strip light for home assistant'], match: /\b(smart|wi-?fi|home assistant|alexa|google home|app[- ]controlled|iot)\b.*\b(lamp|light|led|strip)\b|\b(lamp|light|led|strip)\b.*\b(smart|wi-?fi|home assistant|app)\b/i,
  params: [{ key: 'watts', label: 'Strip power', kind: 'number', default: 6, min: 1, max: 24, unit: 'W' }],
  build(v) {
    const W = Math.min(24, Math.max(1, num(v, 'watts', 6))); const supplyA = Math.ceil((W / 12 + 0.15) * 1.3 * 2) / 2; const b = new Builder();
    b.part('dcsupply', 'J1', -24, 0, 0, { V: 12, Imax: String(supplyA) }).part('reg7805', 'U2', -16, -6).part('esp32', 'U1', 0, 0, 0, { high: 'IO5' });
    b.part('ledstrip', 'LED1', 18, -8, 1, { V: 12, W }).part('nmos', 'Q1', 17, -2).part('resistor', 'R1', 9, -5, 0, { R: '100' }).part('resistor', 'R2', 13, 1, 1, { R: '100k' });
    b.w(['J1', '+'], ['U2', 'IN']); b.w(['U2', 'GND'], [b.gnd(-16, -2), 'GND']); b.w(['J1', '-'], [b.gnd(-24, 4), 'GND']);
    b.w(['U2', 'OUT'], ['U1', '5V'], [], 'vh'); b.w(['U1', 'GND'], [b.gnd(-8, -5), 'GND'], [[-8, -7]]);
    b.w(['J1', '+'], ['LED1', '+'], [[-24, -14], [18, -14]]); b.w(['LED1', '-'], ['Q1', 'D']); b.w(['Q1', 'S'], [b.gnd(18, 2), 'GND']);
    b.w(['U1', 'IO5'], ['R1', '1']); b.w(['R1', '2'], ['Q1', 'G'], [[15, -5]]); b.w(['Q1', 'G'], ['R2', '1'], [[13, -2]]); b.w(['R2', '2'], [b.gnd(13, 5), 'GND']);
    const c = b.done('Smart LED lamp');
    const code = `# Plajah Build: smart LED lamp (ESPHome). Public domain (CC0).
# esphome run lamp.yaml   (first flash over USB, then over Wi-Fi)
esphome:
  name: plajah-lamp

esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    password: !secret fallback_password

captive_portal:

api:
  encryption:
    key: !secret api_key

ota:
  - platform: esphome
    password: !secret ota_password

logger:

output:
  - platform: ledc
    pin: GPIO5
    id: strip_pwm
    frequency: 1000 Hz

light:
  - platform: monochromatic
    name: "Lamp"
    output: strip_pwm
    gamma_correct: 2.8
    default_transition_length: 0.5s
`;
    return { recipe: 'smart-lamp', title: c.name, circuit: c, sim: { mode: 'dc' }, pairs: b.pairs, values: { watts: W }, market: 'both',
      summary: `ESP32 dims a ${W} W 12 V LED strip through a logic-level MOSFET (PWM on IO5); a 7805 makes 5 V for the board from the 12 V ${supplyA} A adapter. Runs ESPHome for Home Assistant.`,
      enclosure: designEnclosure(items(c), { name: 'smart-lamp' }),
      firmware: { file: 'lamp.yaml', lang: 'yaml', code, about: 'ESPHome config. Fill in secrets.yaml with your Wi-Fi and unique passwords; Home Assistant finds the lamp automatically.', extra: [{ file: 'secrets.yaml', code: secrets }] },
      extras: [['1', `12 V ${supplyA} A adapter (listed)`, 'buy a certified one: it is the mains part'], ['1', `12 V LED strip, ${W} W total`, ''], ['1', 'Lamp shade / aluminium channel with diffuser', '']],
      steps: ['Wire the adapter barrel jack to the 7805 and to the strip +.', 'MOSFET low-side: strip − to drain, source to ground, gate via 100 Ω from IO5, 100 kΩ gate pull-down.', 'Flash ESPHome over USB once; later updates go over Wi-Fi.'],
      notes: ['The ESP32 module is radio-certified; keep its antenna clear of metal and outside any metal case.'] };
  },
};

// ---------------------------------------------------------------- sensor node (ESP32 + BME280)
const sensorNode: Recipe = {
  id: 'sensor', title: 'Wi-Fi environment sensor', about: 'Temperature, humidity and pressure on an ESP32 with ESPHome: for a room, a greenhouse or a weather station.',
  examples: ['a wifi temperature and humidity sensor', 'a weather station for home assistant'], match: /\b(sensor|weather|thermometer|temperature|humidity|hygrometer|barometer|air quality|greenhouse)\b/i,
  params: [{ key: 'interval', label: 'Update every', kind: 'number', default: 60, min: 5, max: 3600, unit: 's' }],
  build(v) {
    const every = clamp(num(v, 'interval', 60), 5, 3600); const b = new Builder();
    b.part('usb5v', 'J1', -14, -8).part('esp32', 'U1', 0, 0, 0, { high: 'IO2' }).part('sensor', 'U2', -16, 8);
    b.w(['J1', 'VBUS'], ['U1', '5V'], [[-4, -10]]); b.w(['J1', 'GND'], [b.gnd(-14, -4), 'GND']); b.w(['U1', 'GND'], [b.gnd(-8, -5), 'GND'], [[-8, -7]]);
    b.w(['U1', '3V3'], ['U2', 'VIN'], [[-6, -5], [-6, 2], [-22, 2], [-22, 6]]); b.w(['U2', 'GND'], [b.gnd(-21, 10), 'GND'], [[-21, 8]]);
    b.w(['U1', 'IO22'], ['U2', 'SCL'], [[6, 7], [6, 12], [-10, 12], [-10, 6]]); b.w(['U1', 'IO21'], ['U2', 'SDA'], [[8, 5], [8, 14], [-8, 14], [-8, 8]]);
    b.part('resistor', 'R1', 9, -9, 0, { R: '330' }).part('led', 'D1', 15, -9, 0, { color: 'green' }); b.w(['U1', 'IO2'], ['R1', '1']); b.w(['R1', '2'], ['D1', 'A']); b.w(['D1', 'K'], [b.gnd(17, -7), 'GND']);
    const c = b.done('Wi-Fi environment sensor');
    const code = `# Plajah Build: Wi-Fi environment sensor (ESPHome). Public domain (CC0).
esphome:
  name: plajah-sensor

esp32:
  board: esp32dev

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    password: !secret fallback_password

api:
  encryption:
    key: !secret api_key

ota:
  - platform: esphome
    password: !secret ota_password

logger:

i2c:
  sda: GPIO21
  scl: GPIO22

sensor:
  - platform: bme280_i2c
    address: 0x76
    update_interval: ${every}s
    temperature:
      name: "Temperature"
    humidity:
      name: "Humidity"
    pressure:
      name: "Pressure"

status_led:
  pin: GPIO2
`;
    return { recipe: 'sensor', title: c.name, circuit: c, sim: { mode: 'dc' }, pairs: b.pairs, values: { interval: every }, market: 'both',
      summary: `ESP32 reads a BME280 over I²C (SDA IO21, SCL IO22) every ${every} s and reports to Home Assistant over Wi-Fi; USB powered with a status LED.`,
      enclosure: designEnclosure(items(c), { name: 'sensor' }),
      firmware: { file: 'sensor.yaml', lang: 'yaml', code, about: 'ESPHome config; some BME280 boards answer at 0x77 instead of 0x76.', extra: [{ file: 'secrets.yaml', code: secrets }] },
      extras: [['1', 'USB power supply 5 V 1 A (listed)', ''], ['1', 'Vent slots or a radiation shield', 'outdoors: a louvred shield keeps sun off the sensor']],
      steps: ['Mount the sensor at the vent, away from the ESP32 (its warmth reads as +1-2 °C).', 'Flash ESPHome; adopt the device in Home Assistant.'], notes: [] };
  },
};

// ---------------------------------------------------------------- Raspberry Pi hub
const piHub: Recipe = {
  id: 'pi', title: 'Raspberry Pi smart-home hub', about: 'A Raspberry Pi with a status light, a button and an I²C environment sensor, plus a Python service: the base for a home hub, kiosk or media box.',
  examples: ['a raspberry pi home hub with a sensor', 'pi 4 project box with a button and light'], match: /\b(raspberry ?pi|rpi|\bpi ?[345]\b|pi zero|home hub|smart home hub|home server|media (box|center|centre)|retro ?(game|console))\b/i,
  params: [{ key: 'model', label: 'Model', kind: 'choice', default: 'Pi 5', choices: Object.keys(PI_MODELS) }],
  build(v) {
    const model = str(v, 'model', 'Pi 5'); const rec = PI_MODELS[model] ?? PI_MODELS['Pi 5']; const b = new Builder();
    b.part('usb5v', 'J1', -16, -8, 0, { Imax: String(rec.recommend) }).part('rpi', 'U1', 0, 0, 0, { model, high: 'GPIO17' }).part('sensor', 'U2', -18, 6);
    b.w(['J1', 'VBUS'], ['U1', '5V'], [[-5, -10]]); b.w(['J1', 'GND'], [b.gnd(-16, -4), 'GND']); b.w(['U1', 'GND'], [b.gnd(-9, -4), 'GND'], [[-9, -6]]);
    b.w(['U1', '3V3'], ['U2', 'VIN'], [[-7, -4], [-7, 1], [-24, 1], [-24, 4]]); b.w(['U2', 'GND'], [b.gnd(-23, 8), 'GND'], [[-23, 6]]);
    b.w(['U1', 'GPIO2'], ['U2', 'SDA'], [[-11, -2], [-11, 6]]); b.w(['U1', 'GPIO3'], ['U2', 'SCL'], [[-13, 0], [-13, 4]]);
    b.part('resistor', 'R1', 9, -6, 0, { R: '330' }).part('led', 'D1', 15, -6, 0, { color: 'green' }); b.w(['U1', 'GPIO17'], ['R1', '1']); b.w(['R1', '2'], ['D1', 'A']); b.w(['D1', 'K'], [b.gnd(17, -4), 'GND']);
    b.part('switch', 'SW1', 9, -4, 0, { state: 'open', I: '0.05' }); b.w(['U1', 'GPIO27'], ['SW1', '1']); b.w(['SW1', '2'], [b.gnd(11, -2), 'GND']);
    const c = b.done(`${model} hub`);
    const code = `#!/usr/bin/env python3
# Plajah Build: Raspberry Pi hub service. Public domain (CC0).
# sudo apt install python3-gpiozero python3-smbus2 && pip install RPi.bme280 --break-system-packages
# Enable I2C first: sudo raspi-config  ->  Interface Options  ->  I2C
import time, json
from gpiozero import LED, Button
import smbus2, bme280

status = LED(17)
button = Button(27)          # to ground; gpiozero uses the internal pull-up
bus = smbus2.SMBus(1)
ADDRESS = 0x76               # some boards use 0x77
calibration = bme280.load_calibration_params(bus, ADDRESS)

def read():
    s = bme280.sample(bus, ADDRESS, calibration)
    return {"temperature_c": round(s.temperature, 2), "humidity": round(s.humidity, 1), "pressure_hpa": round(s.pressure, 1)}

button.when_pressed = lambda: print(json.dumps({"button": "pressed", **read()}), flush=True)

while True:
    status.on()
    print(json.dumps(read()), flush=True)
    time.sleep(0.1)
    status.off()
    time.sleep(30)
`;
    return { recipe: 'pi', title: c.name, circuit: c, sim: { mode: 'dc' }, pairs: b.pairs, values: { model }, market: 'both',
      summary: `${model} on a ${rec.recommend} A supply with a status LED (GPIO17), a button (GPIO27) and a BME280 on I²C (GPIO2/3); Python service included.`,
      enclosure: designEnclosure(items(c), { name: 'pi-hub' }),
      firmware: { file: 'hub.py', lang: 'python', code, about: 'Runs on Raspberry Pi OS. Start it at boot with a systemd service, or swap it for Home Assistant OS and add the sensor there.' },
      extras: [['1', `Official ${model} power supply`, rec.note], ['1', 'microSD card 32 GB+ (or NVMe on Pi 5)', ''], ['1', 'Active cooler or heatsink', model === 'Pi 5' ? 'Pi 5 throttles without one under load' : ''], ['4', 'M2.5 standoffs + screws', 'board mounting holes']],
      steps: ['Flash Raspberry Pi OS with Raspberry Pi Imager; set a unique user and password there (no defaults).', 'Wire LED, button and sensor to the header (3.3 V logic only: never 5 V into a GPIO).', 'Enable I²C, install the packages, run hub.py.'],
      notes: [rec.note, 'The Pi\'s own Wi-Fi/Bluetooth is pre-certified; selling a product built around it still needs your product\'s own checks.'] };
  },
};

export const RECIPES: Recipe[] = [smartLamp, lamp, charger, speaker, midi, guitar, sensorNode, piHub];
export const recipeById = (id: string) => RECIPES.find(r => r.id === id);
export const recipeDefaults = (r: Recipe): Values => Object.fromEntries(r.params.map(p => [p.key, p.default]));

// ---------------------------------------------------------------- reading a prompt
export interface Interpretation { recipe: Recipe | null; values: Values; heard: string[]; assumed: string[]; market: 'US' | 'EU' | 'both' }

const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, single: 1, dual: 2, double: 2, triple: 3 };
const numIn = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : WORDNUM[s.toLowerCase()]; };
const NUM = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single|dual|double|triple)';
// A count, up to two describing words, then the unit: "6 warm white LEDs", "3 big knobs".
const grab = (p: string, unit: string) => { const m = new RegExp(`${NUM}\\s*-?\\s*(?:[a-z-]+\\s+){0,2}?(?:${unit})`, 'i').exec(p); return m ? numIn(m[1]) : undefined; };

/** Rules-based reading of a prompt into a recipe and its parameters. */
export function interpret(prompt: string): Interpretation {
  const p = ` ${prompt.toLowerCase()} `; const heard: string[] = []; const assumed: string[] = [];
  const recipe = RECIPES.find(r => r.match.test(p)) ?? null;
  const market: Interpretation['market'] = /\b(eu|europe|european|uk|britain|germany|france|230 ?v|240 ?v)\b/.test(p) ? 'EU' : /\b(us|usa|america|canada|120 ?v|110 ?v)\b/.test(p) ? 'US' : 'both';
  if (!recipe) return { recipe: null, values: {}, heard, assumed, market };
  const values = recipeDefaults(recipe);
  const setKeys = new Set<string>();
  const set = (k: string, val: number | string | boolean, why: string) => { values[k] = val; heard.push(why); setKeys.add(k); };
  const leds = grab(p, 'leds?|lights?|bulbs?'); const watts = grab(p, 'w\\b|watts?'); const knobs = grab(p, 'knobs?|pots?|faders?|sliders?|dials?');
  const buttons = grab(p, 'buttons?|pads?|keys?|switches'); const ports = grab(p, 'ports?|outputs?|sockets?'); const pickups = grab(p, 'pickups?|humbuckers?|single ?coils?');
  const inches = grab(p, '"|inch(?:es)?|in\\b'); const mmScale = /scale/.test(p) ? grab(p, 'mm') : undefined; const frets = grab(p, 'frets?');
  switch (recipe.id) {
    case 'lamp':
      if (leds) set('leds', leds, `${leds} LEDs`);
      for (const c of ['white', 'red', 'yellow', 'green', 'blue']) if (p.includes(c)) set('color', c, c);
      if (/warm/.test(p) && !/white/.test(p)) set('color', 'white', 'warm white');
      if (/batter|\baa\b|cordless|portable|rechargeable/.test(p)) set('power', 'battery', 'battery powered');
      if (/dim|soft|night/.test(p)) set('brightness', 'low', 'soft light'); if (/bright|reading|work ?light/.test(p)) set('brightness', 'bright', 'bright');
      break;
    case 'smart-lamp': if (watts) set('watts', Math.min(24, watts), `${watts} W strip`); break;
    case 'charger':
      if (ports) set('ports', Math.min(4, ports), `${ports} ports`);
      if (/fast|2\.4|ipad|tablet/.test(p)) set('amps', '2.4', '2.4 A per port'); else if (/\b1 ?a\b|slow|small/.test(p)) set('amps', '1', '1 A per port');
      if (market === 'EU') set('mains', '230', '230 V mains');
      break;
    case 'speaker':
      if (watts) set('watts', Math.min(3, watts), `${watts} W`); if (/batter|portable|cordless/.test(p)) set('power', 'battery', 'battery powered');
      if (/8 ?(ohm|Ω)/.test(p)) set('ohms', '8', '8 Ω driver');
      break;
    case 'midi': if (knobs) set('knobs', Math.min(3, knobs), `${knobs} knobs`); if (buttons) set('buttons', Math.min(7, buttons), `${buttons} buttons`); break;
    case 'guitar':
      if (/\bbass\b/.test(p)) { set('bass', true, 'bass'); values.scale = 864; values.frets = 20; }
      if (inches && inches > 20 && inches < 37) set('scale', Math.round(inches * 25.4), `${inches}" scale`); else if (mmScale && mmScale > 500) set('scale', mmScale, `${mmScale} mm scale`);
      if (pickups) set('pickups', Math.min(2, pickups), `${pickups} pickup${pickups > 1 ? 's' : ''}`);
      if (/single ?coil|\bsingles?\b|p-?90/.test(p)) set('type', 'single', 'single-coil'); else if (/humbucker/.test(p)) set('type', 'humbucker', 'humbuckers');
      if (frets) set('frets', frets, `${frets} frets`);
      break;
    case 'sensor': { const m = /every\s+(\d+)\s*(s|sec|seconds?|min|minutes?)/.exec(p); if (m) set('interval', Number(m[1]) * (m[2].startsWith('m') ? 60 : 1), `every ${m[1]} ${m[2]}`); break; }
    case 'pi': for (const k of Object.keys(PI_MODELS)) if (p.includes(k.toLowerCase())) set('model', k, k); break;
  }
  for (const prm of recipe.params) if (!setKeys.has(prm.key)) assumed.push(`${prm.label}: ${values[prm.key]}${prm.unit ? ` ${prm.unit}` : ''}`);
  return { recipe, values, heard, assumed, market };
}

/** The on-device model prompt (desktop app). Its JSON reply is validated against the recipe params. */
export function llmPrompt(prompt: string): Array<{ role: 'system' | 'user'; content: string }> {
  const catalogue = RECIPES.map(r => `- ${r.id}: ${r.title}. Params: ${r.params.map(p => `${p.key} (${p.kind}${p.choices ? `: ${p.choices.join('|')}` : ''}${p.min !== undefined ? `, ${p.min}-${p.max}` : ''})`).join(', ')}`).join('\n');
  return [{ role: 'system', content: `You map a maker's request onto one product recipe. Reply with JSON only: {"recipe": "<id or null>", "values": {...}, "market": "US"|"EU"|"both"}. Recipes:\n${catalogue}` }, { role: 'user', content: prompt }];
}
/** Validate a model's JSON reply: unknown recipes, keys or out-of-range values fall back to the rules. */
export function fromLlm(reply: string, prompt: string): Interpretation {
  const base = interpret(prompt);
  try {
    const j = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)); const r = recipeById(String(j.recipe)); if (!r) return base;
    const values = r.id === base.recipe?.id ? { ...base.values } : recipeDefaults(r); const heard: string[] = [];
    for (const prm of r.params) { const x = j.values?.[prm.key]; if (x === undefined) continue;
      if (prm.kind === 'number' && Number.isFinite(Number(x))) { values[prm.key] = Math.max(prm.min ?? -Infinity, Math.min(prm.max ?? Infinity, Number(x))); heard.push(`${prm.label} ${values[prm.key]}`); }
      else if (prm.kind === 'choice' && prm.choices?.includes(String(x))) { values[prm.key] = String(x); heard.push(String(x)); }
      else if (prm.kind === 'bool') { values[prm.key] = !!x; heard.push(prm.label); } }
    return { recipe: r, values, heard, assumed: [], market: j.market === 'EU' || j.market === 'US' ? j.market : base.market };
  } catch { return base; }
}

void parseSi;
