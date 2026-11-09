// Electronic component library: schematic symbols (grid units), pins, parameters, ratings, and
// which simulation model each uses. Values are generic typical parts (not a vendor's datasheet).

export type Pt = [number, number];
export type Stroke = { kind: 'line'; a: Pt; b: Pt } | { kind: 'circle'; c: Pt; r: number; fill?: boolean } | { kind: 'arc'; c: Pt; r: number; start: number; end: number } | { kind: 'text'; at: Pt; text: string; size?: number; anchor?: 'start' | 'middle' | 'end' } | { kind: 'poly'; pts: Pt[]; closed?: boolean; fill?: boolean };

export interface PinDef { name: string; at: Pt }
export interface ParamDef { key: string; label: string; unit?: string; default: number | string; choices?: string[]; kind?: 'number' | 'choice' }
export interface CompDef {
  kind: string; name: string; prefix: string; category: 'Passive' | 'Semiconductor' | 'Power' | 'Integrated circuit' | 'Electromechanical' | 'Output';
  pins: PinDef[]; params: ParamDef[]; symbol: Stroke[];
  /** Shown next to the symbol (e.g. 1k, 100n). */
  label?: (p: Record<string, number | string>) => string;
  about: string;
}

const L = (a: Pt, b: Pt): Stroke => ({ kind: 'line', a, b });
const T = (at: Pt, text: string, size = 0.8, anchor: 'start' | 'middle' | 'end' = 'middle'): Stroke => ({ kind: 'text', at, text, size, anchor });

/** SI value formatting: 4700 -> 4.7k, 1e-7 -> 100n. */
export function si(v: number, unit = ''): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return `0${unit}`;
  const pre: Array<[number, string]> = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const a = Math.abs(v); const [m, s] = pre.find(([k]) => a >= k * 0.9999) ?? pre[pre.length - 1];
  return `${+(v / m).toPrecision(3)}${s}${unit}`;
}
/** Parse "4.7k", "100n", "2.2u", "10M", "0.25" into a number. */
export function parseSi(s: string | number): number {
  if (typeof s === 'number') return s;
  const m = /^\s*(-?\d*\.?\d+(?:e-?\d+)?)\s*([GMkmuµnp]?)/i.exec(s.replace(/Ω|ohm|F|H|V|A|W/gi, ''));
  if (!m) return NaN; const mult: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12 };
  return parseFloat(m[1]) * (mult[m[2]] ?? 1);
}

const RES_SYM: Stroke[] = [L([-2, 0], [-1, 0]), { kind: 'poly', pts: [[-1, -0.35], [1, -0.35], [1, 0.35], [-1, 0.35]], closed: true }, L([1, 0], [2, 0])];
const LED_COLORS: Record<string, { vf: number; hex: string }> = { red: { vf: 2.0, hex: '#ff4d4d' }, yellow: { vf: 2.1, hex: '#ffd43b' }, green: { vf: 2.2, hex: '#51cf66' }, blue: { vf: 3.0, hex: '#4dabf7' }, white: { vf: 3.0, hex: '#f8f9fa' } };
export const ledColor = (c: string) => LED_COLORS[c] ?? LED_COLORS.red;

import { BOARD_COMPONENTS } from './boards';

export const COMPONENTS: CompDef[] = [
  { kind: 'resistor', name: 'Resistor', prefix: 'R', category: 'Passive', about: 'Fixed resistor. Rating is its power limit.',
    pins: [{ name: '1', at: [-2, 0] }, { name: '2', at: [2, 0] }], params: [{ key: 'R', label: 'Resistance', unit: 'Ω', default: '1k' }, { key: 'P', label: 'Power rating', unit: 'W', default: '0.25' }],
    symbol: RES_SYM, label: p => `${si(parseSi(p.R))}Ω` },
  { kind: 'capacitor', name: 'Capacitor', prefix: 'C', category: 'Passive', about: 'Ceramic/film capacitor (non-polarised).',
    pins: [{ name: '1', at: [-2, 0] }, { name: '2', at: [2, 0] }], params: [{ key: 'C', label: 'Capacitance', unit: 'F', default: '100n' }, { key: 'V', label: 'Voltage rating', unit: 'V', default: '50' }],
    symbol: [L([-2, 0], [-0.25, 0]), L([-0.25, -0.8], [-0.25, 0.8]), L([0.25, -0.8], [0.25, 0.8]), L([0.25, 0], [2, 0])], label: p => `${si(parseSi(p.C))}F` },
  { kind: 'electrolytic', name: 'Electrolytic capacitor', prefix: 'C', category: 'Passive', about: 'Polarised: the + pin must stay positive.',
    pins: [{ name: '+', at: [-2, 0] }, { name: '-', at: [2, 0] }], params: [{ key: 'C', label: 'Capacitance', unit: 'F', default: '100u' }, { key: 'V', label: 'Voltage rating', unit: 'V', default: '16' }],
    symbol: [L([-2, 0], [-0.25, 0]), L([-0.25, -0.8], [-0.25, 0.8]), { kind: 'arc', c: [1.15, 0], r: 0.9, start: 145, end: 215 }, L([0.25, 0], [2, 0]), T([-0.9, -0.55], '+', 0.7)], label: p => `${si(parseSi(p.C))}F` },
  { kind: 'inductor', name: 'Inductor', prefix: 'L', category: 'Passive', about: 'Coil.',
    pins: [{ name: '1', at: [-2, 0] }, { name: '2', at: [2, 0] }], params: [{ key: 'L', label: 'Inductance', unit: 'H', default: '10m' }, { key: 'I', label: 'Current rating', unit: 'A', default: '0.5' }],
    symbol: [L([-2, 0], [-1.5, 0]), ...[-1.125, -0.375, 0.375, 1.125].map(c => ({ kind: 'arc', c: [c, 0], r: 0.375, start: 0, end: 180 }) as Stroke), L([1.5, 0], [2, 0])], label: p => `${si(parseSi(p.L))}H` },
  { kind: 'potentiometer', name: 'Potentiometer', prefix: 'RV', category: 'Passive', about: 'Adjustable resistor; the wiper sits at Position (0 to 1).',
    pins: [{ name: '1', at: [-2, 0] }, { name: '2', at: [2, 0] }, { name: 'W', at: [0, -2] }], params: [{ key: 'R', label: 'Resistance', unit: 'Ω', default: '10k' }, { key: 'pos', label: 'Position', default: 0.5 }, { key: 'P', label: 'Power rating', unit: 'W', default: '0.25' }],
    symbol: [...RES_SYM, L([0, -2], [0, -0.75]), { kind: 'poly', pts: [[-0.25, -0.8], [0.25, -0.8], [0, -0.4]], closed: true, fill: true }], label: p => `${si(parseSi(p.R))}Ω` },
  { kind: 'led', name: 'LED', prefix: 'D', category: 'Output', about: 'Light-emitting diode. Typical 20 mA continuous, 30 mA absolute maximum, 5 V reverse.',
    pins: [{ name: 'A', at: [-2, 0] }, { name: 'K', at: [2, 0] }], params: [{ key: 'color', label: 'Colour', default: 'red', kind: 'choice', choices: Object.keys(LED_COLORS) }, { key: 'If', label: 'Rated current', unit: 'A', default: '20m' }],
    symbol: [L([-2, 0], [-0.6, 0]), { kind: 'poly', pts: [[-0.6, -0.7], [-0.6, 0.7], [0.6, 0]], closed: true }, L([0.6, -0.7], [0.6, 0.7]), L([0.6, 0], [2, 0]), L([0.2, -0.9], [0.8, -1.5]), L([0.6, -0.8], [1.2, -1.4])], label: p => String(p.color) },
  { kind: 'diode', name: 'Diode', prefix: 'D', category: 'Semiconductor', about: 'Small-signal (1N4148-class) or rectifier (1N4007-class).',
    pins: [{ name: 'A', at: [-2, 0] }, { name: 'K', at: [2, 0] }], params: [{ key: 'type', label: 'Type', default: 'signal', kind: 'choice', choices: ['signal', 'rectifier'] }],
    symbol: [L([-2, 0], [-0.6, 0]), { kind: 'poly', pts: [[-0.6, -0.7], [-0.6, 0.7], [0.6, 0]], closed: true }, L([0.6, -0.7], [0.6, 0.7]), L([0.6, 0], [2, 0])], label: p => p.type === 'rectifier' ? '1N4007' : '1N4148' },
  { kind: 'npn', name: 'NPN transistor', prefix: 'Q', category: 'Semiconductor', about: 'General-purpose NPN (2N3904-class): 200 mA, 40 V, 625 mW.',
    pins: [{ name: 'C', at: [1, -2] }, { name: 'B', at: [-2, 0] }, { name: 'E', at: [1, 2] }], params: [{ key: 'beta', label: 'Current gain (β)', default: 100 }],
    symbol: [L([-2, 0], [-0.4, 0]), L([-0.4, -0.8], [-0.4, 0.8]), L([-0.4, -0.35], [1, -1.2]), L([1, -1.2], [1, -2]), L([-0.4, 0.35], [1, 1.2]), L([1, 1.2], [1, 2]), { kind: 'poly', pts: [[0.55, 0.65], [1, 1.2], [0.35, 1.05]], closed: true, fill: true }, { kind: 'circle', c: [0.3, 0], r: 1.25 }], label: () => '' },
  { kind: 'nmos', name: 'N-channel MOSFET', prefix: 'Q', category: 'Semiconductor', about: 'Logic-level N-MOSFET: Vth 2 V, 2 A, 30 V.',
    pins: [{ name: 'D', at: [1, -2] }, { name: 'G', at: [-2, 0] }, { name: 'S', at: [1, 2] }], params: [{ key: 'vth', label: 'Threshold', unit: 'V', default: 2 }],
    symbol: [L([-2, 0], [-0.6, 0]), L([-0.6, -0.8], [-0.6, 0.8]), L([-0.3, -0.9], [-0.3, 0.9]), L([-0.3, -0.6], [1, -0.6]), L([1, -0.6], [1, -2]), L([-0.3, 0.6], [1, 0.6]), L([1, 0.6], [1, 2]), L([-0.3, 0], [1, 0]), L([1, 0], [1, 0.6]), { kind: 'circle', c: [0.3, 0], r: 1.25 }], label: () => '' },
  { kind: 'battery', name: 'Battery', prefix: 'BT', category: 'Power', about: 'Battery with internal resistance and capacity (for runtime estimates).',
    pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }], params: [{ key: 'V', label: 'Voltage', unit: 'V', default: 9 }, { key: 'Rint', label: 'Internal resistance', unit: 'Ω', default: 1.5 }, { key: 'mAh', label: 'Capacity', unit: 'mAh', default: 500 }],
    symbol: [L([0, -2], [0, -0.5]), L([-0.9, -0.5], [0.9, -0.5]), L([-0.5, -0.15], [0.5, -0.15]), L([-0.9, 0.2], [0.9, 0.2]), L([-0.5, 0.55], [0.5, 0.55]), L([0, 0.55], [0, 2]), T([1.1, -0.8], '+', 0.7, 'start')], label: p => `${p.V}V` },
  { kind: 'coincell', name: 'Coin cell (CR2032)', prefix: 'BT', category: 'Power', about: '3 V lithium coin cell, ~220 mAh. Products using coin cells fall under Reese\'s Law (16 CFR part 1263) in the US.',
    pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }], params: [{ key: 'V', label: 'Voltage', unit: 'V', default: 3 }, { key: 'Rint', label: 'Internal resistance', unit: 'Ω', default: 15 }, { key: 'mAh', label: 'Capacity', unit: 'mAh', default: 220 }],
    symbol: [L([0, -2], [0, -0.3]), L([-0.9, -0.3], [0.9, -0.3]), L([-0.5, 0.1], [0.5, 0.1]), L([0, 0.1], [0, 2]), { kind: 'circle', c: [0, -0.1], r: 1.2 }, T([1.3, -0.8], '+', 0.7, 'start')], label: () => 'CR2032' },
  { kind: 'usb5v', name: 'USB 5 V supply', prefix: 'J', category: 'Power', about: 'USB power: 5 V; a standard USB 2.0 port supplies 500 mA by default.',
    pins: [{ name: 'VBUS', at: [0, -2] }, { name: 'GND', at: [0, 2] }], params: [{ key: 'V', label: 'Voltage', unit: 'V', default: 5 }, { key: 'Imax', label: 'Port limit', unit: 'A', default: '0.5' }],
    symbol: [{ kind: 'poly', pts: [[-1.2, -1.1], [1.2, -1.1], [1.2, 1.1], [-1.2, 1.1]], closed: true }, L([0, -2], [0, -1.1]), L([0, 1.1], [0, 2]), T([0, 0.3], 'USB', 0.7)], label: () => '5V' },
  { kind: 'dcsupply', name: 'DC supply', prefix: 'J', category: 'Power', about: 'Ideal-ish bench/adapter supply.',
    pins: [{ name: '+', at: [0, -2] }, { name: '-', at: [0, 2] }], params: [{ key: 'V', label: 'Voltage', unit: 'V', default: 12 }, { key: 'Imax', label: 'Current limit', unit: 'A', default: '1' }],
    symbol: [{ kind: 'circle', c: [0, 0], r: 1.1 }, L([0, -2], [0, -1.1]), L([0, 1.1], [0, 2]), T([0, -0.2], '+', 0.7), T([0, 0.75], '−', 0.7)], label: p => `${p.V}V` },
  { kind: 'mains', name: 'AC mains', prefix: 'J', category: 'Power', about: 'Mains supply (hazardous voltage). Brings safety requirements: see the checks.',
    pins: [{ name: 'L', at: [0, -2] }, { name: 'N', at: [0, 2] }], params: [{ key: 'Vrms', label: 'Voltage (rms)', unit: 'V', default: 120, kind: 'choice', choices: ['120', '230'] }, { key: 'f', label: 'Frequency', unit: 'Hz', default: 60, kind: 'choice', choices: ['50', '60'] }],
    symbol: [{ kind: 'circle', c: [0, 0], r: 1.1 }, L([0, -2], [0, -1.1]), L([0, 1.1], [0, 2]), { kind: 'arc', c: [-0.35, 0], r: 0.35, start: 0, end: 180 }, { kind: 'arc', c: [0.35, 0], r: 0.35, start: 180, end: 360 }], label: p => `${p.Vrms}V~` },
  { kind: 'ground', name: 'Ground', prefix: 'GND', category: 'Power', about: 'Reference node (0 V).',
    pins: [{ name: 'GND', at: [0, -1] }], params: [], symbol: [L([0, -1], [0, 0]), L([-0.8, 0], [0.8, 0]), L([-0.5, 0.3], [0.5, 0.3]), L([-0.2, 0.6], [0.2, 0.6])] },
  { kind: 'switch', name: 'Switch', prefix: 'SW', category: 'Electromechanical', about: 'On/off switch.',
    pins: [{ name: '1', at: [-2, 0] }, { name: '2', at: [2, 0] }], params: [{ key: 'state', label: 'State', default: 'closed', kind: 'choice', choices: ['closed', 'open'] }, { key: 'I', label: 'Current rating', unit: 'A', default: '1' }],
    symbol: [L([-2, 0], [-0.8, 0]), { kind: 'circle', c: [-0.8, 0], r: 0.12, fill: true }, { kind: 'circle', c: [0.8, 0], r: 0.12, fill: true }, L([0.8, 0], [2, 0])], label: p => String(p.state) },
  { kind: 'fuse', name: 'Fuse', prefix: 'F', category: 'Electromechanical', about: 'Opens when current exceeds its rating.',
    pins: [{ name: '1', at: [-2, 0] }, { name: '2', at: [2, 0] }], params: [{ key: 'I', label: 'Rating', unit: 'A', default: '1' }],
    symbol: [L([-2, 0], [-1, 0]), { kind: 'poly', pts: [[-1, -0.35], [1, -0.35], [1, 0.35], [-1, 0.35]], closed: true }, L([-1, 0], [1, 0]), L([1, 0], [2, 0])], label: p => `${p.I}A` },
  { kind: 'speaker', name: 'Speaker', prefix: 'LS', category: 'Output', about: '8 Ω speaker (resistance plus voice-coil inductance).',
    pins: [{ name: '+', at: [-2, -1] }, { name: '-', at: [-2, 1] }], params: [{ key: 'R', label: 'Impedance', unit: 'Ω', default: 8 }, { key: 'P', label: 'Power rating', unit: 'W', default: '0.5' }],
    symbol: [L([-2, -1], [-1, -1]), L([-2, 1], [-1, 1]), { kind: 'poly', pts: [[-1, -1.4], [-0.3, -1.4], [-0.3, 1.4], [-1, 1.4]], closed: true }, { kind: 'poly', pts: [[-0.3, -1.4], [1.2, -2.4], [1.2, 2.4], [-0.3, 1.4]], closed: true }], label: p => `${p.R}Ω` },
  { kind: 'ne555', name: '555 timer', prefix: 'U', category: 'Integrated circuit', about: 'Timer IC (behavioural model): thresholds at 1/3 and 2/3 of supply via the internal 5k divider.',
    pins: [{ name: 'TRIG', at: [-4, -1] }, { name: 'THR', at: [-4, 1] }, { name: 'CTRL', at: [-4, 3] }, { name: 'OUT', at: [4, -1] }, { name: 'DIS', at: [4, 1] }, { name: 'VCC', at: [1, -4] }, { name: 'RESET', at: [-1, -4] }, { name: 'GND', at: [0, 4] }],
    params: [], symbol: [{ kind: 'poly', pts: [[-3, -3], [3, -3], [3, 3], [-3, 3]], closed: true }, L([-4, -1], [-3, -1]), L([-4, 1], [-3, 1]), L([-4, 3], [-3, 3]), L([3, -1], [4, -1]), L([3, 1], [4, 1]), L([1, -4], [1, -3]), L([-1, -4], [-1, -3]), L([0, 3], [0, 4]),
      T([-2.8, -0.8], 'TR', 0.55, 'start'), T([-2.8, 1.2], 'TH', 0.55, 'start'), T([-2.8, 2.7], 'CV', 0.55, 'start'), T([2.8, -0.8], 'Q', 0.55, 'end'), T([2.8, 1.2], 'DIS', 0.55, 'end'), T([1, -2.4], 'V+', 0.55), T([-1, -2.4], 'R', 0.55), T([0, 2.7], 'GND', 0.55), T([0, 0.3], '555', 0.9)], label: () => 'NE555' },
  { kind: 'reg7805', name: '5 V linear regulator', prefix: 'U', category: 'Integrated circuit', about: '7805-class: 5 V out, about 2 V dropout, 1 A, TO-220 (about 65 °C/W without heatsink).',
    pins: [{ name: 'IN', at: [-3, 0] }, { name: 'GND', at: [0, 2] }, { name: 'OUT', at: [3, 0] }], params: [{ key: 'theta', label: 'Thermal resistance', unit: '°C/W', default: 65 }],
    symbol: [{ kind: 'poly', pts: [[-2, -1], [2, -1], [2, 1], [-2, 1]], closed: true }, L([-3, 0], [-2, 0]), L([2, 0], [3, 0]), L([0, 1], [0, 2]), T([0, 0.3], '7805', 0.7)], label: () => '7805' },
  ...BOARD_COMPONENTS,
];

export const compByKind = (k: string) => COMPONENTS.find(c => c.kind === k);
export const compDefaults = (d: CompDef) => Object.fromEntries(d.params.map(p => [p.key, p.default])) as Record<string, number | string>;

/** Rotate a local point by rot quarter turns (clockwise on screen, y down). */
export function rotPt(p: Pt, rot: number, flip = false): Pt {
  let [x, y] = p; if (flip) x = -x;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [x, y] = [-y, x];
  return [x, y];
}
