// Footprints for every part in the Electronics Lab: our own drawings from the common package
// standards (2.54 mm headers, DIP/SOIC, TO-92/TO-220, 0805, SOT-23, radial/axial leads, the module
// pinouts printed on each board). Each pad carries the schematic pin it belongs to. Where a real part
// family varies (pots, holders, modules), the footprint says so: check the datasheet before ordering.
// Released by Plajah to the public domain (CC0).

import type { CPart } from '../circuit';
import { parseSi, compByKind } from '../components';
import { MODULES } from '../modules';
import type { Footprint, PadDef } from './types';

export type FpStyle = 'tht' | 'smd';
type Seg = [number, number, number, number];

const box = (x0: number, y0: number, x1: number, y1: number): Seg[] => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
const circle = (cx: number, cy: number, r: number, n = 20): Seg[] => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)] as Seg; });
const th = (name: string, x: number, y: number, drill: number, d: number, square = false): PadDef => ({ name, x, y, shape: square ? 'rect' : 'circle', w: d, h: d, drill });
const sm = (name: string, x: number, y: number, w: number, h: number): PadDef => ({ name, x, y, shape: 'rect', w, h });

function fp(id: string, name: string, pads: PadDef[], o: { body?: [number, number, number, number]; silk?: Seg[]; holes?: Footprint['holes']; ties?: string[][]; note?: string; margin?: number } = {}): Footprint {
  const m = o.margin ?? 0.5;
  let [x0, y0, x1, y1] = o.body ?? [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pads) { x0 = Math.min(x0, p.x - p.w / 2); y0 = Math.min(y0, p.y - p.h / 2); x1 = Math.max(x1, p.x + p.w / 2); y1 = Math.max(y1, p.y + p.h / 2); }
  for (const h of o.holes ?? []) { x0 = Math.min(x0, h.x - h.d / 2); y0 = Math.min(y0, h.y - h.d / 2); x1 = Math.max(x1, h.x + h.d / 2); y1 = Math.max(y1, h.y + h.d / 2); }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { id, name, pads, court: [r2(x0 - m), r2(y0 - m), r2(x1 + m), r2(y1 + m)], silk: o.silk ?? (o.body ? box(...o.body) : []), holes: o.holes, smd: pads.every(p => !p.drill), ties: o.ties, note: o.note };
}

/** Two pins on a pitch along x: axial resistors, diodes, film caps, headers. */
function twoPin(id: string, name: string, pitch: number, drill: number, d: number, names: [string, string], body: [number, number], square1 = false, note?: string): Footprint {
  const h = pitch / 2; const [bw, bh] = body;
  return fp(id, name, [th(names[0], -h, 0, drill, d, square1), th(names[1], h, 0, drill, d)], { body: [-bw / 2, -bh / 2, bw / 2, bh / 2], silk: [...box(-bw / 2, -bh / 2, bw / 2, bh / 2), ...(pitch > bw + 1.6 ? [[-h + d / 2 + 0.3, 0, -bw / 2, 0], [bw / 2, 0, h - d / 2 - 0.3, 0]] as Seg[] : [])], note });
}
function chip(id: string, name: string, names: [string, string], pw = 1.0, ph = 1.3, cx = 0.95): Footprint {
  return fp(id, name, [sm(names[0], -cx, 0, pw, ph), sm(names[1], cx, 0, pw, ph)], { body: [-1.0, -0.65, 1.0, 0.65], silk: [[-0.2, -1.0, 0.2, -1.0], [-0.2, 1.0, 0.2, 1.0]], margin: 0.3 });
}
/** A single row of pins (headers, TO-92/TO-220, module breakouts), centred. */
function row(id: string, name: string, names: string[], o: { pitch?: number; drill?: number; d?: number; body?: [number, number]; note?: string; bodyDy?: number } = {}): Footprint {
  const pitch = o.pitch ?? 2.54, drill = o.drill ?? 1.0, d = o.d ?? 1.7; const n = names.length; const x0 = -((n - 1) * pitch) / 2;
  const pads = names.map((nm, i) => th(nm, x0 + i * pitch, 0, drill, d, i === 0));
  const bw = o.body?.[0] ?? n * pitch, bh = o.body?.[1] ?? 2.54; const dy = o.bodyDy ?? 0;
  return fp(id, name, pads, { body: [-bw / 2, -bh / 2 + dy, bw / 2, bh / 2 + dy], note: o.note });
}
/** Dual rows: DIP (pins counter-clockwise), or a module with named left/right columns. */
function dual(id: string, name: string, left: string[], right: string[], o: { pitch?: number; span: number; drill?: number; d?: number; body?: [number, number]; note?: string }): Footprint {
  const pitch = o.pitch ?? 2.54, drill = o.drill ?? 1.0, d = o.d ?? 1.7; const n = Math.max(left.length, right.length); const y0 = -((n - 1) * pitch) / 2; const hx = o.span / 2;
  const pads = [...left.map((nm, i) => th(nm, -hx, y0 + i * pitch, drill, d, i === 0)), ...right.map((nm, i) => th(nm, hx, y0 + i * pitch, drill, d))];
  const bw = o.body?.[0] ?? o.span + d + 1, bh = o.body?.[1] ?? n * pitch + 1;
  return fp(id, name, pads, { body: [-bw / 2, -bh / 2, bw / 2, bh / 2], silk: [...box(-bw / 2, -bh / 2, bw / 2, bh / 2), [-bw / 2, -bh / 2 + 2, -bw / 2 + 2, -bh / 2]], note: o.note });
}

// ---- Modules: pins in the board's own physical order; names match the schematic symbol. ----
const PICO_L = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15'];
const PICO_R = ['VBUS', 'VSYS', 'GND', '3V3_EN', '3V3', 'ADC_VREF', 'GP28', 'GND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND', 'GP21', 'GP20', 'GP19', 'GP18', 'GND', 'GP17', 'GP16'];
const ESP_L = ['3V3', 'EN', 'IO36', 'IO39', 'IO34', 'IO35', 'IO32', 'IO33', 'IO25', 'IO26', 'IO27', 'IO14', 'IO12', 'GND', 'IO13', 'IO9', 'IO10', 'IO11', '5V'];
const ESP_R = ['GND', 'IO23', 'IO22', 'IO1', 'IO3', 'IO21', 'GND', 'IO19', 'IO18', 'IO5', 'IO17', 'IO16', 'IO4', 'IO0', 'IO2', 'IO15', 'IO8', 'IO7', 'IO6'];
const NANO_L = ['D1', 'D0', 'RST', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'];
const NANO_R = ['VIN', 'GND', 'RST', '5V', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'AREF', '3V3', 'D13'];
// Raspberry Pi 40-pin header: odd pins in the left column, even in the right, pin 1 top-left.
const PI_ODD = ['3V3', 'GPIO2', 'GPIO3', 'GPIO4', 'GND', 'GPIO17', 'GPIO27', 'GPIO22', '3V3', 'GPIO10', 'GPIO9', 'GPIO11', 'GND', 'ID_SD', 'GPIO5', 'GPIO6', 'GPIO13', 'GPIO19', 'GPIO26', 'GND'];
const PI_EVEN = ['5V', '5V', 'GND', 'GPIO14', 'GPIO15', 'GPIO18', 'GND', 'GPIO23', 'GPIO24', 'GND', 'GPIO25', 'GPIO8', 'GPIO7', 'ID_SC', 'GND', 'GPIO12', 'GND', 'GPIO16', 'GPIO20', 'GPIO21'];

function radialCap(c: number, v: number): Footprint {
  const sizes: Array<[number, number]> = [[5, 2.0], [6.3, 2.5], [8, 3.5], [10, 5.0], [12.5, 5.0]];
  let i = c <= 10e-6 ? 0 : c <= 100e-6 ? 1 : c <= 470e-6 ? 2 : c <= 1000e-6 ? 3 : 4; if (v > 25) i = Math.min(4, i + 1);
  const [D, P] = sizes[i]; const pad = P <= 2 ? 1.5 : 1.7;
  return fp(`CP_Radial_D${D}_P${P}`, `Radial electrolytic Ø${D} mm, ${P} mm pitch`, [th('+', -P / 2, 0, 0.8, pad, true), th('-', P / 2, 0, 0.8, pad)],
    { body: [-D / 2, -D / 2, D / 2, D / 2], silk: [...circle(0, 0, D / 2), [-D / 2 - 0.6, -D / 2 + 0.6, -D / 2 + 0.4, -D / 2 + 0.6], [-D / 2 - 0.1, -D / 2 + 0.1, -D / 2 - 0.1, -D / 2 + 1.1]] });
}

const BOARD_POWER_PINS = new Set(['pico.VBUS', 'pico.VSYS', 'esp32.5V', 'nano.5V', 'rpi.5V']);
/** A USB supply wired only to a module's own USB rail is that module's USB socket, not a separate part. */
export const usbIsModulePort = (kindPin: string) => BOARD_POWER_PINS.has(kindPin);

/** Footprint for a schematic part, or null when it has no physical part on the board. */
export function footprintFor(p: CPart, style: FpStyle = 'tht'): Footprint | null {
  const smd = style === 'smd'; const pr = p.params ?? {};
  switch (p.kind) {
    case 'ground': return null;
    case 'resistor': return smd ? chip('R_0805', 'Resistor 0805 (2012 metric)', ['1', '2']) : twoPin('R_Axial_P10.16', 'Axial resistor, 10.16 mm pitch', 10.16, 0.8, 1.6, ['1', '2'], [6.3, 2.5]);
    case 'capacitor': return smd ? chip('C_0805', 'Capacitor 0805 (2012 metric)', ['1', '2']) : twoPin('C_Disc_P5.08', 'Ceramic/film capacitor, 5.08 mm pitch', 5.08, 0.8, 1.6, ['1', '2'], [5.5, 2.8]);
    case 'electrolytic': return radialCap(parseSi(pr.C ?? '100u'), parseSi(pr.V ?? 16));
    case 'inductor': return twoPin('L_Axial_P12.7', 'Axial inductor, 12.7 mm pitch', 12.7, 0.9, 1.8, ['1', '2'], [8, 3.6]);
    case 'potentiometer': return fp('Pot_9mm_Vertical', '9 mm vertical potentiometer (Alpha RV09 class), 2.5 mm pitch', [th('1', -2.5, 0, 1.0, 1.8, true), th('W', 0, 0, 1.0, 1.8), th('2', 2.5, 0, 1.0, 1.8)],
      { body: [-4.9, -10.5, 4.9, 1.2], silk: [...box(-4.9, -10.5, 4.9, 1.2), ...circle(0, -5, 3.5)], note: 'Mounting tabs vary by maker: check your pot; many need two extra 2 mm slots.' });
    case 'led': return smd ? chip('LED_0805', 'LED 0805, cathode pad 1', ['K', 'A']) : fp('LED_D5.0mm', '5 mm LED, cathode square pad', [th('K', -1.27, 0, 0.9, 1.8, true), th('A', 1.27, 0, 0.9, 1.8)], { body: [-2.9, -2.9, 2.9, 2.9], silk: [...circle(0, 0, 2.9), [-2.6, -1.2, -2.6, 1.2]] });
    case 'diode':
      if (smd) return chip('D_SOD-123', 'Diode SOD-123, cathode pad 1', ['K', 'A'], 0.9, 1.2, 1.65);
      return pr.type === 'rectifier' ? twoPin('D_DO-41_P10.16', 'DO-41 diode (1N4007), cathode square', 10.16, 1.0, 2.0, ['K', 'A'], [5.2, 2.7], true) : twoPin('D_DO-35_P7.62', 'DO-35 diode (1N4148), cathode square', 7.62, 0.8, 1.6, ['K', 'A'], [4, 2], true);
    case 'npn': return smd ? fp('SOT-23_NPN', 'SOT-23 NPN (MMBT3904: 1 B, 2 E, 3 C)', [sm('B', -0.95, 1.0, 0.6, 0.9), sm('E', 0.95, 1.0, 0.6, 0.9), sm('C', 0, -1.0, 0.6, 0.9)], { body: [-1.5, -0.7, 1.5, 0.7], margin: 0.3 })
      : row('TO-92_Wide', 'TO-92, legs spread to 2.54 mm (2N3904: E B C)', ['E', 'B', 'C'], { drill: 0.8, d: 1.5, body: [5, 4], bodyDy: 0.6 });
    case 'nmos': return smd ? fp('SOT-23_NMOS', 'SOT-23 N-MOSFET (AO3400 class: 1 G, 2 S, 3 D)', [sm('G', -0.95, 1.0, 0.6, 0.9), sm('S', 0.95, 1.0, 0.6, 0.9), sm('D', 0, -1.0, 0.6, 0.9)], { body: [-1.5, -0.7, 1.5, 0.7], margin: 0.3 })
      : row('TO-220_Vertical_GDS', 'TO-220 vertical (G D S)', ['G', 'D', 'S'], { drill: 1.1, d: 1.8, body: [10.4, 4.6], bodyDy: -1.0 });
    case 'reg7805': return row('TO-220_Vertical_7805', 'TO-220 vertical 7805 (IN GND OUT)', ['IN', 'GND', 'OUT'], { drill: 1.1, d: 1.8, body: [10.4, 4.6], bodyDy: -1.0 });
    case 'ne555': {
      const L = ['GND', 'TRIG', 'OUT', 'RESET'], R = ['VCC', 'DIS', 'THR', 'CTRL']; // DIP numbering: 1-4 down the left, 5-8 up the right
      if (smd) { const pads = [...L.map((n, i) => sm(n, -2.7, -1.905 + i * 1.27, 1.55, 0.6)), ...R.map((n, i) => sm(n, 2.7, -1.905 + i * 1.27, 1.55, 0.6))]; return fp('SOIC-8', 'SOIC-8 (NE555)', pads, { body: [-1.95, -2.45, 1.95, 2.45], silk: [[-1.95, -2.45, 1.95, -2.45], [-1.95, 2.45, 1.95, 2.45], [-3.6, -2.6, -2.1, -2.6]], margin: 0.3 }); }
      return dual('DIP-8', 'DIP-8, 7.62 mm rows (NE555)', L, R, { span: 7.62, drill: 0.8, d: 1.6, body: [6.4, 10.2] });
    }
    case 'battery': return twoPin('Battery_Lead_2.54', 'Battery lead: 2-pin 2.54 mm (JST-XH or soldered wires)', 2.54, 1.0, 1.7, ['+', '-'], [5.1, 2.6], true);
    case 'coincell': return fp('CR2032_Holder', 'CR2032 holder (two + tabs, − contact pad)', [th('+', -10.0, 0, 1.2, 2.2, true), th('+', 10.0, 0, 1.2, 2.2), { name: '-', x: 0, y: 0, shape: 'circle', w: 8, h: 8 }], { body: [-11, -10.5, 11, 10.5], silk: circle(0, 0, 10.5, 28), note: 'Holder tab spacing varies: check your holder. The cell door still needs a screw (Reese\'s Law).' });
    case 'usb5v': return fp('USB_B_THT', 'USB-B receptacle, through-hole (power only)', [th('VBUS', -1.25, -1.0, 0.92, 1.6, true), th('', 1.25, -1.0, 0.92, 1.6), th('', 1.25, 1.0, 0.92, 1.6), th('GND', -1.25, 1.0, 0.92, 1.6), th('', -6.02, 3.71, 2.3, 3.3), th('', 6.02, 3.71, 2.3, 3.3)],
      { body: [-6.0, -10.3, 6.0, 5.8], note: 'Check against your connector\'s drawing before ordering.' });
    case 'dcsupply': return twoPin('Terminal_2P_5.08_DC', 'DC in: 2-pin 5.08 mm screw terminal', 5.08, 1.3, 2.4, ['+', '-'], [10.2, 7.6], true);
    case 'mains': return twoPin('Terminal_2P_5.08_Mains', 'Mains in: 2-pin 5.08 mm screw terminal (rated 250 V AC); wire from an approved inlet', 5.08, 1.3, 2.4, ['L', 'N'], [10.2, 7.6], true);
    case 'switch': return pr.state === 'open' && parseSi(pr.I ?? 1) <= 0.1
      ? fp('SW_Tactile_6x6', 'Tactile switch 6 × 6 mm (legs on each side joined inside)', [th('1', -3.25, -2.25, 1.0, 1.7, true), th('1', 3.25, -2.25, 1.0, 1.7), th('2', -3.25, 2.25, 1.0, 1.7), th('2', 3.25, 2.25, 1.0, 1.7)], { body: [-3, -3, 3, 3], silk: [...box(-3, -3, 3, 3), ...circle(0, 0, 1.7)] })
      : twoPin('SW_Lead_2.54', 'Switch lead: 2-pin 2.54 mm to a panel switch', 2.54, 1.0, 1.7, ['1', '2'], [5.1, 2.6], true);
    case 'fuse': return twoPin('Fuse_TR5', 'Radial fuse TR5 (5.08 mm pitch)', 5.08, 0.9, 1.8, ['1', '2'], [8.5, 4], false, 'For mains, use a fuse rated for the voltage (250 V AC) and a slow-blow type sized to the module.');
    case 'speaker': return twoPin('Speaker_Lead_2.54', 'Speaker lead: 2-pin 2.54 mm', 2.54, 1.0, 1.7, ['+', '-'], [5.1, 2.6], true);
    case 'pickup': return twoPin('Pickup_Lead_2.54', 'Pickup lead: 2-pin 2.54 mm', 2.54, 1.0, 1.7, ['+', '-'], [5.1, 2.6], true);
    case 'jack': return twoPin('Jack_Lead_2.54', 'Output jack lead: 2-pin 2.54 mm (tip, sleeve)', 2.54, 1.0, 1.7, ['T', 'S'], [5.1, 2.6], true);
    case 'signal': return twoPin('Audio_In_2.54', 'Audio input lead: 2-pin 2.54 mm', 2.54, 1.0, 1.7, ['+', '-'], [5.1, 2.6], true);
    case 'usbload': return fp('USB_A_THT', 'USB-A receptacle, through-hole (D+ tied to D− = charge port)', [th('VBUS', -3.5, 0, 0.92, 1.6, true), th('D-', -1.0, 0, 0.92, 1.6), th('D+', 1.0, 0, 0.92, 1.6), th('GND', 3.5, 0, 0.92, 1.6), th('', -6.57, 2.71, 2.3, 3.3), th('', 6.57, 2.71, 2.3, 3.3)],
      { body: [-7.2, -1.5, 7.2, 14], ties: [['D-', 'D+']], note: 'Check against your connector\'s drawing before ordering.' });
    case 'ledstrip': return twoPin('Terminal_2P_5.08_Strip', 'LED strip: 2-pin 5.08 mm screw terminal', 5.08, 1.3, 2.4, ['+', '-'], [10.2, 7.6], true);
    case 'amp': return row('Module_Amp_1x5', 'Class-D amp breakout, 1 × 5 header (match your module\'s pin order)', ['VCC', 'GND', 'IN', 'OUT+', 'OUT-'], { body: [20, 18], bodyDy: 7, note: 'Breakout pin orders differ: match the silkscreen of the module you buy.' });
    case 'sensor': return row('Module_BME280_1x4', 'BME280 breakout, 1 × 4 header', ['VIN', 'GND', 'SCL', 'SDA'], { body: [13, 11], bodyDy: 4.5, note: 'Breakout pin orders differ: match the silkscreen of the module you buy.' });
    case 'acdc': return fp('Module_ACDC_34x20', 'Encapsulated AC-DC module (HLK-PM / IRM class, 34 × 20 mm)', [th('L', -13.0, -2.54, 1.0, 2.0, true), th('N', -13.0, 2.54, 1.0, 2.0), th('+', 13.0, -2.54, 1.0, 2.0), th('-', 13.0, 2.54, 1.0, 2.0)],
      { body: [-17, -10, 17, 10], silk: [...box(-17, -10, 17, 10), [-6, -10, -6, 10]], note: 'Pin positions differ between modules: check yours. Keep the mains side (left of the line) clear of low-voltage copper.' });
    case 'pico': return dual('Module_Pico', 'Raspberry Pi Pico (2 × 20, 17.78 mm rows)', PICO_L, PICO_R, { span: 17.78, body: [21, 51], note: 'Solder the Pico on pin headers or by its castellated edge.' });
    case 'esp32': return dual('Module_ESP32_DevKitC', 'ESP32 DevKitC-class (2 × 19, 25.4 mm rows)', ESP_L, ESP_R, { span: 25.4, body: [28, 55], note: 'Dev-board pinouts vary (30- and 38-pin): this is the 38-pin DevKitC layout.' });
    case 'nano': return dual('Module_Arduino_Nano', 'Arduino Nano (2 × 15, 15.24 mm rows)', NANO_L, NANO_R, { span: 15.24, body: [18, 45] });
    case 'rpi': return dual('RPi_40pin_Header', 'Raspberry Pi 40-pin header (2 × 20 female, HAT style)', PI_ODD, PI_EVEN, { span: 2.54, body: [5.1, 51], note: 'The Pi plugs into this header; the board sits on it like a HAT.' });
    default: return moduleFootprint(p);
  }
}

/**
 * Breakout modules (from the describe-it block library): a 1 x N pin header in schematic pin order,
 * the outline sized from the module's physical size. Off-board parts (strips, servos, motors, probes)
 * get a labelled lead connector. The relay keeps its contacts on 5.08 mm terminals at the far end of
 * the board, away from the low-voltage header, so load wiring gets its own clearance.
 */
function moduleFootprint(p: CPart): Footprint | null {
  const info = MODULES[p.kind]; const def = compByKind(p.kind); if (!info || !def) return null;
  const names = def.pins.map(pin => pin.name); const phys = info.physical(p.params ?? {});
  const note = 'Breakout pin orders differ: match the silkscreen of the module you buy.';
  if (p.kind === 'relay') {
    const ctl = names.filter(n => !['COM', 'NO', 'NC'].includes(n)), load = names.filter(n => ['COM', 'NO', 'NC'].includes(n));
    const pads = [...ctl.map((n, i) => th(n, -21, (i - (ctl.length - 1) / 2) * 2.54, 1.0, 1.7, i === 0)), ...load.map((n, i) => th(n, 21, (i - (load.length - 1) / 2) * 5.08, 1.3, 2.4))];
    return fp('Module_Relay_1ch', 'Relay module: 2.54 mm control header, 5.08 mm screw terminals for the load', pads, { body: [-25, -13, 25, 13], note: 'Load side carries the switched current: keep its wiring in its own closed compartment. Match the terminal order on your module.' });
  }
  if (!phys.w || !phys.d) return row(`Lead_${p.kind}_1x${names.length}`, `${def.name} lead: 1 × ${names.length} 2.54 mm header (off-board part)`, names, { note: phys.note });
  return row(`Module_${p.kind}_1x${names.length}`, `${def.name} breakout, 1 × ${names.length} header`, names, { body: [Math.max(phys.w, names.length * 2.54 + 2), phys.d], bodyDy: phys.d / 2 - 1.5, note });
}
