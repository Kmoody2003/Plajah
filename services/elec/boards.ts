// Development boards, modules and smart-device parts: Raspberry Pi, Raspberry Pi Pico, ESP32,
// Arduino Nano, a class-D amplifier module, a certified AC-DC module, sensors, guitar pickups.
// Pin names follow each board's printed silkscreen. Electrical limits are from the makers' public
// datasheets (rounded, conservative) and drive the checks in checks.ts.

import type { CompDef, PinDef, Pt, Stroke } from './components';

const L = (a: Pt, b: Pt): Stroke => ({ kind: 'line', a, b });
const T = (at: Pt, text: string, size = 0.55, anchor: 'start' | 'middle' | 'end' = 'middle'): Stroke => ({ kind: 'text', at, text, size, anchor });

/** A rectangular block with pins down the left and right sides, two grid units apart. */
function block(title: string, left: string[], right: string[], width = 6): { pins: PinDef[]; symbol: Stroke[] } {
  const rows = Math.max(left.length, right.length); const h = rows * 2; const top = -Math.round(h / 2); const hw = width / 2;
  const pins: PinDef[] = []; const sym: Stroke[] = [{ kind: 'poly', pts: [[-hw, top - 1], [hw, top - 1], [hw, top + h - 1], [-hw, top + h - 1]], closed: true }, T([0, top - 1.6], title, 0.7)];
  left.forEach((n, i) => { const y = top + i * 2; pins.push({ name: n, at: [-hw - 1, y] }); sym.push(L([-hw - 1, y], [-hw, y]), T([-hw + 0.3, y + 0.2], n, 0.5, 'start')); });
  right.forEach((n, i) => { const y = top + i * 2; pins.push({ name: n, at: [hw + 1, y] }); sym.push(L([hw, y], [hw + 1, y]), T([hw - 0.3, y + 0.2], n, 0.5, 'end')); });
  return { pins, symbol: sym };
}

export interface BoardInfo {
  /** Pin that powers the board, its typical draw (A) and recommended supply (A). */
  power: string; draw: number; recommend: number; logic: number;
  /** Per-pin GPIO limit (A), and total from the 3V3 pin (A). */
  pinMax: number; rail3v3Max: number; radio: boolean; gpio: string[]; footprint: [number, number, number];
  firmware: string[];
}
export const BOARD_INFO: Record<string, BoardInfo> = {
  pico: { power: 'VSYS', draw: 0.03, recommend: 0.5, logic: 3.3, pinMax: 0.012, rail3v3Max: 0.3, radio: false, gpio: ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17', 'GP26', 'GP27', 'GP28', 'GP22'], footprint: [51, 21, 4], firmware: ['CircuitPython', 'MicroPython', 'Arduino', 'C SDK'] },
  esp32: { power: '5V', draw: 0.08, recommend: 0.5, logic: 3.3, pinMax: 0.02, rail3v3Max: 0.5, radio: true, gpio: ['IO2', 'IO4', 'IO5', 'IO13', 'IO14', 'IO18', 'IO19', 'IO21', 'IO22', 'IO25', 'IO26', 'IO32', 'IO33', 'IO23', 'IO27'], footprint: [55, 28, 8], firmware: ['ESPHome', 'MicroPython', 'Arduino', 'ESP-IDF'] },
  nano: { power: '5V', draw: 0.02, recommend: 0.5, logic: 5, pinMax: 0.02, rail3v3Max: 0.05, radio: false, gpio: ['D2', 'D3', 'D4', 'D5', 'D6', 'D9', 'D10', 'D11', 'A0', 'A1', 'A4', 'A5', 'D12', 'D13'], footprint: [45, 18, 7], firmware: ['Arduino'] },
  esp32s3: { power: '5V', draw: 0.1, recommend: 0.5, logic: 3.3, pinMax: 0.02, rail3v3Max: 0.5, radio: true, gpio: ['IO1', 'IO2', 'IO4', 'IO5', 'IO6', 'IO7', 'IO8', 'IO9', 'IO10', 'IO11', 'IO12', 'IO13', 'IO14', 'IO15', 'IO16', 'IO17', 'IO18', 'IO21', 'IO38', 'IO39', 'IO40', 'IO41', 'IO42'], footprint: [63, 26, 8], firmware: ['ESPHome', 'CircuitPython', 'Arduino', 'ESP-IDF'] },
  rpi: { power: '5V', draw: 0.8, recommend: 5, logic: 3.3, pinMax: 0.016, rail3v3Max: 0.5, radio: true, gpio: ['GPIO2', 'GPIO3', 'GPIO4', 'GPIO17', 'GPIO27', 'GPIO22', 'GPIO18', 'GPIO23', 'GPIO24', 'GPIO25', 'GPIO10', 'GPIO11', 'GPIO8'], footprint: [85, 56, 17], firmware: ['Python (gpiozero)', 'Node-RED', 'Home Assistant OS'] },
};
/** Raspberry Pi models: typical draw under light load and the maker's recommended supply. */
export const PI_MODELS: Record<string, { draw: number; recommend: number; note: string }> = {
  'Pi 5': { draw: 0.9, recommend: 5, note: 'Official 27 W (5 V 5 A) USB-C PD supply; on a 3 A supply USB ports are limited to 600 mA total.' },
  'Pi 4': { draw: 0.7, recommend: 3, note: '5 V 3 A USB-C supply.' },
  'Pi Zero 2 W': { draw: 0.3, recommend: 2.5, note: '5 V 2.5 A micro-USB supply.' },
  'Pi 3B+': { draw: 0.6, recommend: 2.5, note: '5 V 2.5 A micro-USB supply.' },
};

const pico = block('Pico', ['VBUS', 'VSYS', 'GND', '3V3', 'GP26', 'GP27', 'GP28', 'GP22'], ['GP2', 'GP3', 'GP4', 'GP5', 'GP14', 'GP15', 'GP16', 'GP17']);
const esp32 = block('ESP32', ['5V', 'GND', '3V3', 'IO32', 'IO33', 'IO25', 'IO26', 'IO23', 'IO27'], ['IO2', 'IO4', 'IO5', 'IO13', 'IO14', 'IO18', 'IO19', 'IO21', 'IO22']);
const nano = block('Nano', ['5V', 'GND', 'A0', 'A1', 'A4', 'A5', 'D12', 'D13'], ['D2', 'D3', 'D4', 'D5', 'D6', 'D9', 'D10', 'D11']);
const rpi = block('Raspberry Pi', ['5V', 'GND', '3V3', 'GPIO2', 'GPIO3', 'GPIO10', 'GPIO11', 'GPIO8'], ['GPIO4', 'GPIO17', 'GPIO27', 'GPIO22', 'GPIO18', 'GPIO23', 'GPIO24', 'GPIO25'], 8);
const esp32s3 = block('ESP32-S3', ['5V', 'GND', '3V3', 'IO1', 'IO2', 'IO4', 'IO5', 'IO6', 'IO7', 'IO15', 'IO16', 'IO17'], ['IO8', 'IO9', 'IO10', 'IO11', 'IO12', 'IO13', 'IO14', 'IO18', 'IO21', 'IO38', 'IO39', 'IO40', 'IO41', 'IO42'], 7);
const amp = block('AMP', ['VCC', 'GND', 'IN'], ['OUT+', 'OUT-'], 5);
const acdc = block('AC-DC', ['L', 'N'], ['+', '-'], 5);
const sensor = block('BME280', ['VIN', 'GND'], ['SCL', 'SDA'], 5);

const highParam = { key: 'high', label: 'Pins set high (comma list)', default: '' };
export const BOARD_COMPONENTS: CompDef[] = [
  { kind: 'pico', name: 'Raspberry Pi Pico', prefix: 'U', category: 'Integrated circuit', ...pico, about: 'RP2040/RP2350 board. Power on VSYS 1.8-5.5 V (USB feeds VBUS → VSYS). GPIO is 3.3 V, about 12 mA per pin. Pico W / 2 W add Wi-Fi and Bluetooth.',
    params: [{ key: 'variant', label: 'Variant', default: 'Pico', kind: 'choice', choices: ['Pico', 'Pico W', 'Pico 2', 'Pico 2 W'] }, highParam, { key: 'draw', label: 'Board current', unit: 'A', default: '30m' }], label: p => String(p.variant) },
  { kind: 'esp32', name: 'ESP32 dev board', prefix: 'U', category: 'Integrated circuit', ...esp32, about: 'ESP32-WROOM module board with Wi-Fi + Bluetooth. 5 V in, 3.3 V logic, about 20 mA per pin (40 mA absolute). Wi-Fi bursts draw ~250 mA.',
    params: [highParam, { key: 'draw', label: 'Average current', unit: 'A', default: '80m' }], label: () => 'ESP32-WROOM' },
  { kind: 'esp32s3', name: 'ESP32-S3 dev board', prefix: 'U', category: 'Integrated circuit', ...esp32s3, about: 'ESP32-S3-DevKitC-1: Wi-Fi + Bluetooth LE and native USB (MIDI, keyboard) on one chip. 5 V in, 3.3 V logic, about 20 mA per pin. ADC1 on IO1-IO10 works with Wi-Fi on.',
    params: [highParam, { key: 'draw', label: 'Average current', unit: 'A', default: '100m' }], label: () => 'ESP32-S3' },
  { kind: 'nano', name: 'Arduino Nano (5 V)', prefix: 'U', category: 'Integrated circuit', ...nano, about: 'ATmega328P board, 5 V logic, 20 mA per pin recommended (40 mA absolute), 200 mA total.',
    params: [highParam, { key: 'draw', label: 'Board current', unit: 'A', default: '20m' }], label: () => 'Nano' },
  { kind: 'rpi', name: 'Raspberry Pi', prefix: 'U', category: 'Integrated circuit', ...rpi, about: 'Single-board computer (40-pin header subset). 5 V in, 3.3 V GPIO at about 16 mA per pin; not 5 V tolerant.',
    params: [{ key: 'model', label: 'Model', default: 'Pi 5', kind: 'choice', choices: Object.keys(PI_MODELS) }, highParam, { key: 'draw', label: 'Board current', unit: 'A', default: 'auto' }], label: p => String(p.model) },
  { kind: 'amp', name: 'Class-D amplifier module', prefix: 'U', category: 'Integrated circuit', ...amp, about: 'PAM8302-class mono class-D: 2.5-5.5 V, about 2.5 W into 4 Ω at 5 V, bridged outputs (never connect OUT- to ground).',
    params: [{ key: 'gain', label: 'Gain', unit: 'V/V', default: 24 }, { key: 'P', label: 'Rated power', unit: 'W', default: '2.5' }], label: () => 'Class-D' },
  { kind: 'acdc', name: 'AC-DC module (certified)', prefix: 'PS', category: 'Power', ...acdc, about: 'Encapsulated, safety-certified mains-to-DC module (IRM-class). Buying a listed module keeps the hazardous part pre-approved; you still own creepage, fusing and the enclosure.',
    params: [{ key: 'V', label: 'Output', unit: 'V', default: 5 }, { key: 'I', label: 'Rated current', unit: 'A', default: '2' }, { key: 'eff', label: 'Efficiency', default: 0.8 }], label: p => `${p.V}V ${p.I}A` },
  { kind: 'sensor', name: 'Environment sensor (BME280, I²C)', prefix: 'U', category: 'Integrated circuit', ...sensor, about: 'Temperature, humidity and pressure breakout with on-board 10k I²C pull-ups. 3.3 V.',
    params: [], label: () => 'BME280' },
  { kind: 'signal', name: 'Audio / signal source', prefix: 'V', category: 'Power', about: 'Sine source standing in for a phone or line input (for transient simulation).',
    pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }], params: [{ key: 'Vpk', label: 'Peak', unit: 'V', default: '0.2' }, { key: 'f', label: 'Frequency', unit: 'Hz', default: '1k' }, { key: 'Rout', label: 'Source resistance', unit: 'Ω', default: 100 }],
    symbol: [{ kind: 'circle', c: [0, 0], r: 1.1 }, L([0, -2], [0, -1.1]), L([0, 1.1], [0, 2]), { kind: 'arc', c: [-0.35, 0], r: 0.35, start: 180, end: 360 }, { kind: 'arc', c: [0.35, 0], r: 0.35, start: 0, end: 180 }], label: p => `${p.f}Hz` },
  { kind: 'pickup', name: 'Guitar pickup', prefix: 'PU', category: 'Electromechanical', about: 'Magnetic pickup: a coil (inductance + resistance) that generates a voltage from the vibrating string.',
    pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }], params: [{ key: 'type', label: 'Type', default: 'humbucker', kind: 'choice', choices: ['single', 'humbucker'] }, { key: 'Vpk', label: 'String signal', unit: 'V', default: '0.2' }, { key: 'f', label: 'Test note', unit: 'Hz', default: '440' }],
    symbol: [L([0, -2], [0, -1.5]), ...[-1.1, -0.4, 0.3, 1.0].map(c => ({ kind: 'arc', c: [0, c], r: 0.35, start: 270, end: 450 }) as Stroke), L([0, 1.35], [0, 2]), L([-0.9, -1.4], [-0.9, 1.4]), L([-1.1, -1.4], [-1.1, 1.4])], label: p => p.type === 'single' ? 'Single' : 'Humbucker' },
  { kind: 'jack', name: 'Output jack (¼" / 6.35 mm)', prefix: 'J', category: 'Electromechanical', about: 'Guitar output jack; the simulation adds a 1 MΩ amplifier input and cable capacitance.',
    pins: [{ name: 'T', at: [-2, 0] }, { name: 'S', at: [0, 2] }], params: [{ key: 'Rin', label: 'Amp input', unit: 'Ω', default: '1M' }, { key: 'Cc', label: 'Cable', unit: 'F', default: '500p' }],
    symbol: [L([-2, 0], [-0.4, 0]), { kind: 'poly', pts: [[-0.4, -0.5], [1.2, -0.5], [1.2, 0.5], [-0.4, 0.5]], closed: true }, L([0, 0.5], [0, 2])], label: () => '¼"' },
  { kind: 'usbload', name: 'USB device being charged', prefix: 'LD', category: 'Output', about: 'A phone or gadget on a USB port, drawing its charge current.',
    pins: [{ name: 'VBUS', at: [0, -2] }, { name: 'GND', at: [0, 2] }], params: [{ key: 'I', label: 'Charge current', unit: 'A', default: '1' }],
    symbol: [{ kind: 'poly', pts: [[-0.8, -1.4], [0.8, -1.4], [0.8, 1.4], [-0.8, 1.4]], closed: true }, L([0, -2], [0, -1.4]), L([0, 1.4], [0, 2]), L([-0.3, 1], [0.3, 1])], label: p => `${p.I}A` },
  { kind: 'ledstrip', name: 'LED strip', prefix: 'LED', category: 'Output', about: 'Constant-voltage LED strip (12 V or 5 V) with built-in resistors; power is per whole length.',
    pins: [{ name: '+', at: [-2, 0] }, { name: '-', at: [2, 0] }], params: [{ key: 'V', label: 'Strip voltage', unit: 'V', default: 12 }, { key: 'W', label: 'Power (whole length)', unit: 'W', default: 6 }],
    symbol: [L([-2, 0], [-1.6, 0]), { kind: 'poly', pts: [[-1.6, -0.5], [1.6, -0.5], [1.6, 0.5], [-1.6, 0.5]], closed: true }, ...[-1, 0, 1].map(x => ({ kind: 'circle', c: [x, 0], r: 0.2, fill: true }) as Stroke), L([1.6, 0], [2, 0])], label: p => `${p.V}V ${p.W}W` },
];
