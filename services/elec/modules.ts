// Breakout modules for the open-ended designer: power (Li-ion cell, USB-C charger with protection,
// buck, LDO, boost), I/O (addressable LEDs, encoder, OLED, TFT, IMU, light, distance, soil, PIR),
// actuators (servo, H-bridge + DC motor, isolated relay) and an I²C ADC. Each kind carries a small
// data-driven simulation model (supply draw, regulated rail, pull-ups, driven outputs), its body
// size for the enclosure fitter, a distributor search term, its supply range for the checks, and
// the safety hazards it brings. Electrical figures are rounded from the public datasheets of the
// common parts named in each `about`; they are design guides, not sign-off.
// Released by Plajah as public domain (CC0).

import type { CompDef, PinDef, Pt, Stroke } from './components';

const L = (a: Pt, b: Pt): Stroke => ({ kind: 'line', a, b });
const T = (at: Pt, text: string, size = 0.55, anchor: 'start' | 'middle' | 'end' = 'middle'): Stroke => ({ kind: 'text', at, text, size, anchor });
type Params = Record<string, number | string>;

/** Same block shape as boards.ts: pins down both sides, two grid units apart. */
function block(title: string, left: string[], right: string[], width = 6): { pins: PinDef[]; symbol: Stroke[] } {
  const rows = Math.max(left.length, right.length); const h = rows * 2; const top = -Math.round(h / 2); const hw = width / 2;
  const pins: PinDef[] = []; const sym: Stroke[] = [{ kind: 'poly', pts: [[-hw, top - 1], [hw, top - 1], [hw, top + h - 1], [-hw, top + h - 1]], closed: true }, T([0, top - 1.6], title, 0.7)];
  left.forEach((n, i) => { const y = top + i * 2; pins.push({ name: n, at: [-hw - 1, y] }); sym.push(L([-hw - 1, y], [-hw, y]), T([-hw + 0.3, y + 0.2], n, 0.5, 'start')); });
  right.forEach((n, i) => { const y = top + i * 2; pins.push({ name: n, at: [hw + 1, y] }); sym.push(L([hw, y], [hw + 1, y]), T([hw - 0.3, y + 0.2], n, 0.5, 'end')); });
  return { pins, symbol: sym };
}

export const num = (p: Params, k: string, d: number) => {
  const raw = p[k]; if (raw === undefined || raw === '') return d; if (typeof raw === 'number') return raw;
  const m = /^\s*(-?\d*\.?\d+(?:e-?\d+)?)\s*([GMkmuµn]?)/i.exec(raw.replace(/Ω|ohm|F|H|V|A|W/gi, '')); if (!m) return d;
  const mult: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9 }; return parseFloat(m[1]) * (mult[m[2]] ?? 1);
};

// ---------------------------------------------------------------- simulation models
export interface ModuleModel {
  /** Constant draw from `pwr` to `gnd` (amps), soft-started with the supply. */
  draw?: { pwr: string; gnd: string; A: (p: Params) => number };
  /** Regulated rail. Linear parts pass input current through; switchers draw Pout / efficiency. */
  reg?: { vin: string; vout: string; gnd: string; V: (p: Params) => number; dropout: (p: Params) => number; eff?: (p: Params) => number; boost?: boolean; vinMin?: number };
  /** Resistive links: protection FETs, a relay coil, a motor winding. */
  links?: Array<{ a: string; b: string; R: (p: Params) => number }>;
  /** On-module pull-ups (I²C, encoder). */
  pullups?: Array<{ pin: string; to: string; R: number }>;
  /** Input loads to ground (opto LEDs, internal pull-downs). */
  inputs?: Array<{ pin: string; gnd: string; R: number }>;
  /** Outputs driven to a fraction of the supply, or (with `ctrl`) following a logic input (H-bridge). */
  drives?: Array<{ pin: string; sup: string; gnd: string; R: number; frac?: (p: Params) => number; ctrl?: string }>;
  /** Pins that may stay unconnected (screw terminals, unused channels). */
  free?: string[];
}
export interface ModuleInfo {
  model: ModuleModel;
  /** Supply pin and its allowed range (V), checked after simulation. */
  supply?: { pin: string; gnd: string; min: number; max: number };
  /** Output current limit of a regulator, input limit and thermal resistance for linear parts. */
  limits?: { Iout?: (p: Params) => number; vinMax?: (p: Params) => number; theta?: number; Iin?: number; Ich?: number };
  physical: (p: Params) => { w: number; d: number; h: number; face: 'top' | 'front' | 'back' | 'left' | 'right' | 'inside'; cutout?: { shape: 'circle'; d: number } | { shape: 'rect'; w: number; h: number }; note?: string };
  query: (p: Params) => { query: string; note?: string; authorised?: boolean };
}

const S = (p: string, gnd = 'GND') => ({ pwr: p, gnd });
export const MODULES: Record<string, ModuleInfo> = {
  liion: { model: {}, physical: () => ({ w: 77, d: 22, h: 21, face: 'inside', note: '18650 holder (or a LiPo pouch in a padded pocket); keep it away from heat and screws' }),
    query: () => ({ query: '18650 Li-ion cell protected 2500mAh', note: 'Buy cells from an authorised distributor (counterfeit and re-wrapped cells are common); ask for the UN 38.3 test summary.', authorised: true }) },
  charger: { model: { draw: { pwr: 'IN+', gnd: 'IN-', A: p => num(p, 'Icharge', 0.4) }, links: [{ a: 'B+', b: 'OUT+', R: () => 0.05 }, { a: 'B-', b: 'OUT-', R: () => 0.05 }] },
    supply: { pin: 'IN+', gnd: 'IN-', min: 4.5, max: 6 }, limits: { Ich: 1 },
    physical: () => ({ w: 26, d: 17, h: 5, face: 'back', cutout: { shape: 'rect', w: 9.5, h: 3.8 }, note: 'USB-C charge port + charge LEDs (light pipe or a 3 mm hole)' }),
    query: () => ({ query: 'TP4056 USB-C lithium charger module DW01 protection' }) },
  buck: { model: { reg: { vin: 'VIN', vout: 'VOUT', gnd: 'GND', V: p => num(p, 'V', 5), dropout: () => 1, eff: p => num(p, 'eff', 0.9) } },
    limits: { Iout: p => num(p, 'I', 2), vinMax: () => 28 },
    physical: () => ({ w: 22, d: 17, h: 5, face: 'inside', note: 'Buck converter: keep its inductor away from the radio antenna' }),
    query: p => ({ query: `MP1584 buck converter module ${num(p, 'V', 5)}V fixed` }) },
  ldo: { model: { reg: { vin: 'VIN', vout: 'VOUT', gnd: 'GND', V: p => num(p, 'V', 3.3), dropout: p => num(p, 'dropout', 0.25) } },
    limits: { Iout: p => num(p, 'I', 0.6), vinMax: () => 6, theta: 150 },
    physical: () => ({ w: 10, d: 7, h: 3, face: 'inside' }), query: p => ({ query: `AP2112K-${num(p, 'V', 3.3)} LDO regulator 600mA` }) },
  boost: { model: { reg: { vin: 'VIN', vout: 'VOUT', gnd: 'GND', V: p => num(p, 'V', 5), dropout: () => 0.3, eff: p => num(p, 'eff', 0.85), boost: true, vinMin: 2 } },
    limits: { Iout: p => num(p, 'I', 1), vinMax: () => 5.5, Iin: 2 },
    physical: () => ({ w: 37, d: 17, h: 6, face: 'inside' }), query: p => ({ query: `5V boost converter module ${num(p, 'I', 1)}A lithium input` }) },
  neopixel: { model: { draw: { pwr: '5V', gnd: 'GND', A: p => num(p, 'n', 8) * 0.06 * num(p, 'cap', 0.4) }, inputs: [{ pin: 'DIN', gnd: 'GND', R: 1e6 }] },
    supply: { pin: '5V', gnd: 'GND', min: 3.5, max: 5.3 },
    physical: () => ({ w: 0, d: 0, h: 0, face: 'inside', note: 'Addressable strip/ring outside the box: 3-pin connector (5V, data, GND)' }),
    query: p => ({ query: `WS2812B addressable LED ${num(p, 'n', 8)} pixels 5V` }) },
  encoder: { model: { pullups: [{ pin: 'CLK', to: '+', R: 10e3 }, { pin: 'DT', to: '+', R: 10e3 }] }, supply: { pin: '+', gnd: 'GND', min: 3, max: 5.5 },
    physical: () => ({ w: 13, d: 13, h: 20, face: 'top', cutout: { shape: 'circle', d: 7.5 }, note: 'Rotary encoder with push switch: 7.5 mm hole, knob for a 6 mm shaft' }),
    query: () => ({ query: 'rotary encoder module KY-040 push switch' }) },
  oled: { model: { draw: { ...S('VCC'), A: () => 0.02 }, pullups: [{ pin: 'SCL', to: 'VCC', R: 4.7e3 }, { pin: 'SDA', to: 'VCC', R: 4.7e3 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 3, max: 5.5 },
    physical: () => ({ w: 27, d: 28, h: 4, face: 'top', cutout: { shape: 'rect', w: 24, h: 13 }, note: '0.96" OLED: 24 × 13 mm window' }), query: () => ({ query: 'SSD1306 0.96 inch OLED 128x64 I2C' }) },
  tft: { model: { draw: { ...S('VCC'), A: () => 0.04 }, inputs: [{ pin: 'BL', gnd: 'GND', R: 100 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 3, max: 3.6 },
    physical: () => ({ w: 31, d: 39, h: 4, face: 'top', cutout: { shape: 'rect', w: 24, h: 24 }, note: '1.3" 240 × 240 IPS TFT: 24 × 24 mm window' }), query: () => ({ query: 'ST7789 1.3 inch 240x240 SPI TFT' }) },
  imu: { model: { draw: { ...S('VCC'), A: () => 0.005 }, pullups: [{ pin: 'SCL', to: 'VCC', R: 4.7e3 }, { pin: 'SDA', to: 'VCC', R: 4.7e3 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 3, max: 5.5 },
    physical: () => ({ w: 21, d: 16, h: 3, face: 'inside', note: 'Screw the IMU down flat; it measures the box\'s motion' }), query: () => ({ query: 'MPU-6050 accelerometer gyro module GY-521' }) },
  lux: { model: { draw: { ...S('VCC'), A: () => 0.001 }, pullups: [{ pin: 'SCL', to: 'VCC', R: 4.7e3 }, { pin: 'SDA', to: 'VCC', R: 4.7e3 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 3, max: 5.5 },
    physical: () => ({ w: 19, d: 14, h: 3, face: 'top', cutout: { shape: 'circle', d: 6 }, note: 'Light sensor under a 6 mm window' }), query: () => ({ query: 'BH1750 light sensor module I2C' }) },
  tof: { model: { draw: { ...S('VCC'), A: () => 0.02 }, pullups: [{ pin: 'SCL', to: 'VCC', R: 10e3 }, { pin: 'SDA', to: 'VCC', R: 10e3 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 2.8, max: 5.5 },
    physical: () => ({ w: 25, d: 13, h: 3, face: 'front', cutout: { shape: 'rect', w: 8, h: 4 }, note: 'Time-of-flight sensor: clear window, no tinted plastic' }), query: () => ({ query: 'VL53L0X time of flight distance sensor module' }) },
  sonar: { model: { draw: { ...S('VCC'), A: () => 0.015 }, inputs: [{ pin: 'TRIG', gnd: 'GND', R: 1e5 }], drives: [{ pin: 'ECHO', sup: 'VCC', gnd: 'GND', R: 100, frac: () => 1 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 4.5, max: 5.5 },
    physical: () => ({ w: 45, d: 20, h: 15, face: 'front', cutout: { shape: 'rect', w: 42, h: 17 }, note: 'HC-SR04 transducers through the front (two 16 mm holes or one slot)' }), query: () => ({ query: 'HC-SR04 ultrasonic distance sensor' }) },
  soil: { model: { draw: { ...S('VCC'), A: () => 0.005 }, drives: [{ pin: 'AOUT', sup: 'VCC', gnd: 'GND', R: 10e3, frac: () => 0.45 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 3.3, max: 5.5 },
    physical: () => ({ w: 0, d: 0, h: 0, face: 'inside', note: 'Capacitive soil probe outside the box on a 3-wire cable; seal its top edge with lacquer' }), query: () => ({ query: 'capacitive soil moisture sensor v1.2' }) },
  pir: { model: { draw: { ...S('VCC'), A: () => 0.0001 }, drives: [{ pin: 'OUT', sup: 'VCC', gnd: 'GND', R: 1e3, frac: () => 0.66 }] }, supply: { pin: 'VCC', gnd: 'GND', min: 4.5, max: 20 },
    physical: () => ({ w: 32, d: 24, h: 25, face: 'top', cutout: { shape: 'circle', d: 23 }, note: 'PIR dome through a 23 mm hole' }), query: () => ({ query: 'HC-SR501 PIR motion sensor' }) },
  servo: { model: { draw: { pwr: 'V+', gnd: 'GND', A: p => num(p, 'Irun', 0.15) }, inputs: [{ pin: 'SIG', gnd: 'GND', R: 1e5 }] }, supply: { pin: 'V+', gnd: 'GND', min: 4.6, max: 6 },
    physical: () => ({ w: 0, d: 0, h: 0, face: 'inside', note: 'Servo mounts on the mechanism; 3-pin lead through a grommet' }), query: () => ({ query: 'SG90 micro servo' }) },
  hbridge: { model: { draw: { pwr: 'VM', gnd: 'GND', A: () => 0.002 }, inputs: ['AIN1', 'AIN2', 'BIN1', 'BIN2'].map(pin => ({ pin, gnd: 'GND', R: 1e5 })),
      drives: [['AO1', 'AIN1'], ['AO2', 'AIN2'], ['BO1', 'BIN1'], ['BO2', 'BIN2']].map(([pin, ctrl]) => ({ pin, ctrl, sup: 'VM', gnd: 'GND', R: 0.5 })), free: ['BIN1', 'BIN2', 'BO1', 'BO2'] },
    supply: { pin: 'VM', gnd: 'GND', min: 2.7, max: 10.8 }, limits: { Iout: () => 1.2 },
    physical: () => ({ w: 18, d: 16, h: 4, face: 'inside', note: 'Motor driver: give it airflow; it warms at full current' }), query: () => ({ query: 'DRV8833 dual motor driver module' }) },
  dcmotor: { model: { links: [{ a: '+', b: '-', R: p => num(p, 'R', 20) }] },
    physical: () => ({ w: 0, d: 0, h: 0, face: 'inside', note: 'Motor on the mechanism; twist its leads and add a 100 nF cap across the terminals' }), query: () => ({ query: 'TT gear motor 3-6V' }) },
  relay: { model: { links: [{ a: 'VCC', b: 'GND', R: () => 70 }], inputs: [{ pin: 'IN', gnd: 'GND', R: 1e3 }], free: ['COM', 'NO', 'NC'] }, supply: { pin: 'VCC', gnd: 'GND', min: 4.5, max: 5.5 },
    physical: () => ({ w: 50, d: 26, h: 19, face: 'inside', note: 'Relay module: load wiring through a strain-relieved gland into its own closed compartment' }),
    query: () => ({ query: '5V relay module optocoupler isolated 10A', note: 'Pick a module whose relay is UL/VDE recognised and whose board has a slot between coil and contacts.' }) },
  ads1115: { model: { draw: { ...S('VDD'), A: () => 0.001 }, pullups: [{ pin: 'SCL', to: 'VDD', R: 10e3 }, { pin: 'SDA', to: 'VDD', R: 10e3 }], free: ['A0', 'A1', 'A2', 'A3'] }, supply: { pin: 'VDD', gnd: 'GND', min: 2, max: 5.5 },
    physical: () => ({ w: 28, d: 17, h: 3, face: 'inside' }), query: () => ({ query: 'ADS1115 16-bit ADC module I2C' }) },
};

const twoPin = (label: string): { pins: PinDef[]; symbol: Stroke[] } => ({ pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }],
  symbol: [L([0, -2], [0, -1.1]), L([0, 1.1], [0, 2]), { kind: 'circle', c: [0, 0], r: 1.1 }, T([0, 0.25], label, 0.6), T([1.2, -0.9], '+', 0.6, 'start')] });
const cell = { pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }] as PinDef[], symbol: [L([0, -2], [0, -0.5]), L([-0.9, -0.5], [0.9, -0.5]), L([-0.5, -0.15], [0.5, -0.15]), L([0, -0.15], [0, 2]), T([1.1, -0.8], '+', 0.7, 'start'), T([1.1, 0.7], 'Li', 0.55, 'start')] as Stroke[] };

const C = (kind: string, name: string, prefix: string, category: CompDef['category'], shape: { pins: PinDef[]; symbol: Stroke[] }, about: string, params: CompDef['params'] = [], label?: CompDef['label']): CompDef =>
  ({ kind, name, prefix, category, ...shape, params, about, label });
const addr = (d: string) => ({ key: 'addr', label: 'I²C address', default: d });

export const MODULE_COMPONENTS: CompDef[] = [
  C('liion', 'Li-ion cell (18650 / LiPo)', 'BT', 'Power', cell, 'Single lithium-ion cell: 3.0 V empty, 3.7 V nominal, 4.2 V full. Needs a protection circuit and a matched charger.',
    [{ key: 'V', label: 'Voltage', unit: 'V', default: 3.7 }, { key: 'Rint', label: 'Internal resistance', unit: 'Ω', default: 0.08 }, { key: 'mAh', label: 'Capacity', unit: 'mAh', default: 2500 }], p => `${p.mAh}mAh`),
  C('charger', 'Li-ion charger + protection (TP4056/DW01)', 'U', 'Power', block('CHARGE', ['IN+', 'IN-'], ['B+', 'B-', 'OUT+', 'OUT-'], 6), 'USB-C single-cell charger (TP4056-class, 4.2 V CC/CV, current set by R_PROG) with DW01 + dual-FET protection against over-charge, over-discharge and short circuit. Load goes on OUT, never straight on the cell.',
    [{ key: 'Icharge', label: 'Charge current', unit: 'A', default: '0.4' }, { key: 'Rprog', label: 'R_PROG', unit: 'Ω', default: '3k' }], p => `${num(p, 'Icharge', 0.4) * 1000}mA`),
  C('buck', 'Buck converter module', 'U', 'Power', block('BUCK', ['VIN', 'GND'], ['VOUT'], 5), 'Step-down switching regulator (MP1584-class): 4.5-28 V in, about 90% efficient, up to 2-3 A.',
    [{ key: 'V', label: 'Output', unit: 'V', default: 5 }, { key: 'I', label: 'Rated current', unit: 'A', default: '2' }, { key: 'eff', label: 'Efficiency', default: 0.9 }], p => `${p.V}V`),
  C('ldo', 'Low-dropout regulator', 'U', 'Power', block('LDO', ['VIN', 'GND'], ['VOUT'], 5), 'Linear LDO (AP2112K-class): 600 mA, about 0.25 V dropout at full load; burns (Vin − Vout) × I as heat.',
    [{ key: 'V', label: 'Output', unit: 'V', default: 3.3 }, { key: 'I', label: 'Rated current', unit: 'A', default: '0.6' }, { key: 'dropout', label: 'Dropout', unit: 'V', default: 0.25 }], p => `${p.V}V`),
  C('boost', 'Boost converter module', 'U', 'Power', block('BOOST', ['VIN', 'GND'], ['VOUT'], 5), 'Step-up regulator for one Li-ion cell to 5 V (about 85% efficient, 2 A switch limit on the input side).',
    [{ key: 'V', label: 'Output', unit: 'V', default: 5 }, { key: 'I', label: 'Rated current', unit: 'A', default: '1' }, { key: 'eff', label: 'Efficiency', default: 0.85 }], p => `${p.V}V ${p.I}A`),
  C('neopixel', 'Addressable LEDs (WS2812B)', 'LED', 'Output', block('WS2812', ['5V', 'GND', 'DIN'], [], 5), 'Chained RGB LEDs with built-in drivers: up to 60 mA per pixel at full white. Firmware caps brightness; budget is pixels × 60 mA × cap.',
    [{ key: 'n', label: 'Pixels', default: 8 }, { key: 'cap', label: 'Brightness cap', default: 0.4 }], p => `${p.n} px`),
  C('encoder', 'Rotary encoder module', 'SW', 'Electromechanical', block('ENC', ['+', 'GND'], ['CLK', 'DT', 'SW'], 5), 'Incremental encoder with push switch (KY-040-class), 10k pull-ups on CLK/DT.'),
  C('oled', 'OLED display (SSD1306, I²C)', 'DS', 'Output', block('OLED', ['VCC', 'GND'], ['SCL', 'SDA'], 5), '0.96" 128 × 64 monochrome OLED, I²C at 0x3C, on-board regulator and pull-ups.', [addr('0x3C')], () => '128x64'),
  C('tft', 'TFT display (ST7789, SPI)', 'DS', 'Output', block('TFT', ['VCC', 'GND', 'BL'], ['SCK', 'MOSI', 'CS', 'DC', 'RST'], 6), '1.3" 240 × 240 colour IPS on SPI; 3.3 V only; backlight about 30 mA.', [], () => '240x240'),
  C('imu', 'Motion sensor (MPU-6050)', 'U', 'Integrated circuit', block('IMU', ['VCC', 'GND'], ['SCL', 'SDA'], 5), '3-axis accelerometer + gyro, I²C at 0x68 (0x69 with AD0 high).', [addr('0x68')], () => 'MPU-6050'),
  C('lux', 'Light sensor (BH1750)', 'U', 'Integrated circuit', block('LUX', ['VCC', 'GND'], ['SCL', 'SDA'], 5), 'Ambient light in lux, I²C at 0x23 (0x5C with ADDR high).', [addr('0x23')], () => 'BH1750'),
  C('tof', 'Distance sensor (VL53L0X)', 'U', 'Integrated circuit', block('TOF', ['VCC', 'GND'], ['SCL', 'SDA'], 5), 'Laser time-of-flight ranging to about 2 m, I²C at 0x29 (Class 1 laser).', [addr('0x29')], () => 'VL53L0X'),
  C('sonar', 'Ultrasonic distance (HC-SR04)', 'U', 'Integrated circuit', block('SONAR', ['VCC', 'GND'], ['TRIG', 'ECHO'], 5), '2 cm to 4 m ultrasonic ranging. 5 V part: its ECHO output is 5 V, so 3.3 V boards need a divider.', [], () => 'HC-SR04'),
  C('soil', 'Soil moisture probe (capacitive)', 'U', 'Integrated circuit', block('SOIL', ['VCC', 'GND'], ['AOUT'], 5), 'Capacitive probe (no exposed electrodes to corrode); analog out falls as the soil gets wetter.', [], () => 'Capacitive'),
  C('pir', 'Motion detector (PIR, HC-SR501)', 'U', 'Integrated circuit', block('PIR', ['VCC', 'GND'], ['OUT'], 5), 'Passive infrared motion detector, 4.5-20 V in, 3.3 V logic output, adjustable hold time.', [], () => 'HC-SR501'),
  C('servo', 'Hobby servo (SG90)', 'M', 'Electromechanical', block('SERVO', ['V+', 'GND'], ['SIG'], 5), 'Micro servo: 4.8-6 V, about 150 mA moving and 650 mA stalled; 50 Hz PWM, 0.5-2.5 ms pulse.', [{ key: 'Irun', label: 'Running current', unit: 'A', default: '0.15' }], () => 'SG90'),
  C('hbridge', 'Dual H-bridge motor driver (DRV8833)', 'U', 'Integrated circuit', block('DRV8833', ['VM', 'GND', 'AIN1', 'AIN2', 'BIN1', 'BIN2'], ['AO1', 'AO2', 'BO1', 'BO2'], 6), 'Two brushed-motor channels, 2.7-10.8 V, 1.2 A each (1.5 A peak), with current limiting and thermal shutdown.', [], () => 'DRV8833'),
  C('dcmotor', 'DC gear motor', 'M', 'Electromechanical', twoPin('M'), 'Small brushed gear motor (TT-class), 3-6 V; about 250 mA running, 1 A stalled.', [{ key: 'R', label: 'Running resistance', unit: 'Ω', default: 20 }], () => 'TT motor'),
  C('relay', 'Relay module (opto-isolated)', 'K', 'Electromechanical', block('RELAY', ['VCC', 'GND', 'IN'], ['COM', 'NO', 'NC'], 6), '5 V relay with optocoupler input, transistor driver and flyback diode on the module; contacts on screw terminals (typically 10 A 250 V AC rated relay).', [], () => '5V relay'),
  C('ads1115', 'I²C ADC (ADS1115)', 'U', 'Integrated circuit', block('ADS1115', ['VDD', 'GND', 'SCL', 'SDA'], ['A0', 'A1', 'A2', 'A3'], 6), '4-channel 16-bit ADC on I²C (0x48-0x4B by the ADDR pin): adds analog inputs to boards that have too few (or none, like the Raspberry Pi).', [addr('0x48')], p => String(p.addr ?? '0x48')),
];

// ---------------------------------------------------------------- safety (read by services/safety/hazards.ts)
export interface ModuleHazard { id: string; stage: 'idea' | 'schematic' | 'enclosure' | 'build' | 'make' | 'source' | 'sell'; severity: 'critical' | 'high' | 'medium' | 'low'; ack?: boolean; title: string; why: string; mitigate: string[]; cite?: string }
export function moduleHazards(kinds: Set<string>): ModuleHazard[] {
  const out: ModuleHazard[] = [];
  if (kinds.has('liion')) out.push({ id: 'li-ion-cell', stage: 'schematic', severity: 'critical', ack: true, title: 'Lithium-ion cell: fire if abused', why: 'Over-charge, deep discharge, a short or a puncture can drive a Li-ion cell into thermal runaway: a fire that vents flammable gas and can re-ignite.',
    mitigate: ['Keep the charger + protection module (over-charge, over-discharge, short-circuit) between the cell and every load; never wire a load straight to the cell.', 'Protected cells from an authorised distributor only; no salvaged or re-wrapped cells.', 'Hold the cell in a holder or padded pocket away from screws, heat and sharp edges; vent the case.', 'Charge where you can see it during prototyping; stop if the cell swells or gets hot.', 'Shipping or selling: UN 38.3 test summary and IEC 62133-2 for the pack.'], cite: 'IEC 62133-2; UL 1642; UL 2054; UN 38.3' });
  if (kinds.has('relay')) out.push({ id: 'relay-mains', stage: 'schematic', severity: 'critical', ack: true, title: 'Relay contacts may switch mains', why: 'Relays are often used to switch lamps and appliances. Mains on a hobby relay board can shock through thin board gaps, loose screw terminals or an open case, and overloaded contacts can start a fire.',
    mitigate: ['Low-voltage loads (under 30 V) are the safe default; treat any mains use as a mains product.', 'For mains: a relay rated for the load (inductive loads derate heavily), a fuse in the line, at least 6 mm between mains and low-voltage copper, a closed flame-rated (UL 94 V-0) compartment and strain-relieved cords.', 'Prefer a listed smart plug or a certified relay module with mains-rated isolation.', 'Never work on it plugged in; have mains products tested by an accredited lab.'], cite: 'UL/IEC 62368-1; IEC 61810-1; 29 CFR 1910.303; Directive 2014/35/EU' });
  if (kinds.has('servo') || kinds.has('dcmotor')) out.push({ id: 'moving-parts', stage: 'build', severity: 'medium', title: 'Moving parts: pinching and stalled motors', why: 'Gears and arms can pinch fingers, and a stalled motor draws several times its running current and heats the motor, driver and wiring.',
    mitigate: ['Guard gears and pinch points; limit servo travel in firmware.', 'Size the supply and wiring for stall current; the driver\'s current limit and thermal shutdown are the last line.', 'Add a power switch the user can reach.'], cite: 'ISO 13857 (safety distances); IEC 60335-1 §20 (stability and mechanical hazards)' });
  if (kinds.has('tof')) out.push({ id: 'laser-class1', stage: 'idea', severity: 'low', title: 'Class 1 laser emitter', why: 'Time-of-flight sensors emit invisible 940 nm laser light; Class 1 is eye-safe in normal use, which stops being true if the optics are altered.', mitigate: ['Do not add lenses in front of the emitter; keep the maker\'s Class 1 label information in your manual.'], cite: 'IEC 60825-1; 21 CFR 1040.10' });
  return out;
}

// ---------------------------------------------------------------- checks (called from checks.ts)
export interface ModuleFinding { id: string; level: 'error' | 'warn' | 'info' | 'pass'; area: 'Wiring' | 'Stress' | 'Thermal' | 'Battery' | 'Regulatory' | 'Security'; title: string; detail: string; refs?: string[]; cite?: string }
