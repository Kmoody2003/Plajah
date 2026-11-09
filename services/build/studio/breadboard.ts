// Build Studio circuits: a solderless breadboard with real strip connectivity, beginner parts and a
// microcontroller board, mapped onto the Electronics Lab circuit model (services/elec/circuit.ts)
// and solved by our own simulator (services/elec/sim.ts). Board pins become sources with the
// output resistance of a real GPIO, so a missing resistor shows up as a burnt-out LED or an
// overloaded pin, the way it would on the bench.

import type { Circuit, CPart, CWire } from '../../elec/circuit';
import { netlist } from '../../elec/circuit';
import { compByKind, type Pt } from '../../elec/components';
import { simulate } from '../../elec/sim';

// ---------------------------------------------------------------- boards

export type BoardKind = 'uno' | 'nano' | 'pico';
export interface BoardPin { id: string; label: string; kind: 'io' | 'power' | 'gnd'; pwm?: boolean; adc?: boolean }
export interface BoardDef { kind: BoardKind; name: string; logic: number; supply: string; pins: BoardPin[]; maxPinmA: number; about: string }

const avrPins = (): BoardPin[] => [
  ...Array.from({ length: 14 }, (_, i) => ({ id: String(i), label: `D${i}`, kind: 'io' as const, pwm: [3, 5, 6, 9, 10, 11].includes(i) })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `A${i}`, label: `A${i}`, kind: 'io' as const, adc: true })),
  { id: '5V', label: '5V', kind: 'power' }, { id: '3V3', label: '3.3V', kind: 'power' }, { id: 'GND', label: 'GND', kind: 'gnd' },
];
export const BOARDS: Record<BoardKind, BoardDef> = {
  uno: { kind: 'uno', name: 'Arduino Uno', logic: 5, supply: '5V', pins: avrPins(), maxPinmA: 20, about: 'ATmega328P, 5 V pins, 20 mA per pin (40 mA absolute). Powered over USB.' },
  nano: { kind: 'nano', name: 'Arduino Nano', logic: 5, supply: '5V', pins: avrPins(), maxPinmA: 20, about: 'The Uno\'s chip on a small board. Same pins, same code.' },
  pico: { kind: 'pico', name: 'Raspberry Pi Pico', logic: 3.3, supply: 'VBUS', maxPinmA: 12, about: 'RP2040, 3.3 V pins, about 12 mA per pin. Runs MicroPython or Arduino code.',
    pins: [...[...Array.from({ length: 23 }, (_, i) => i), 26, 27, 28].map(i => ({ id: `GP${i}`, label: `GP${i}`, kind: 'io' as const, pwm: true, adc: i >= 26 })), { id: 'VBUS', label: 'VBUS 5V', kind: 'power' }, { id: '3V3', label: '3V3', kind: 'power' }, { id: 'GND', label: 'GND', kind: 'gnd' }] },
};
export const ioPins = (b: BoardKind) => BOARDS[b].pins.filter(p => p.kind === 'io');

// ---------------------------------------------------------------- breadboard geometry

/** Hole rows from top to bottom: top rails (-, +), a–e, gap, f–j, bottom rails (+, -). */
export const ROWS: Array<{ y: number; label: string }> = [
  { y: 0, label: '−' }, { y: 1, label: '+' }, ...'abcde'.split('').map((l, i) => ({ y: 3 + i, label: l })), ...'fghij'.split('').map((l, i) => ({ y: 9 + i, label: l })), { y: 15, label: '+' }, { y: 16, label: '−' },
];
export const COLS = 30;
const VALID_Y = new Set(ROWS.map(r => r.y));
export const holeKey = (col: number, y: number) => `h:${col}:${y}`;
export const isHole = (col: number, y: number) => col >= 1 && col <= COLS && VALID_Y.has(y);
export const parseHole = (k: string): [number, number] | null => { const m = /^h:(\d+):(\d+)$/.exec(k); return m ? [+m[1], +m[2]] : null; };
/** The metal strip a hole belongs to. */
export function stripOf(col: number, y: number): string {
  if (y === 0) return 'rail:top-'; if (y === 1) return 'rail:top+'; if (y === 15) return 'rail:bot+'; if (y === 16) return 'rail:bot-';
  return y <= 7 ? `strip:${col}:top` : `strip:${col}:bot`;
}
export const holeName = (col: number, y: number) => { const r = ROWS.find(x => x.y === y); if (!r) return '?'; return y <= 1 || y >= 15 ? `${y <= 1 ? 'top' : 'bottom'} ${r.label === '+' ? 'plus' : 'minus'} rail` : `${r.label}${col}`; };

// ---------------------------------------------------------------- parts

export type PartKind = 'led' | 'resistor' | 'button' | 'pot' | 'buzzer' | 'servo' | 'ldr' | 'ultrasonic' | 'battery';
export interface Leg { name: string; at: [number, number] }
export interface PartDef { kind: PartKind; name: string; prefix: string; legs: Leg[]; about: string; defaults: Record<string, number | string>; safety?: string }
export const PARTS: Record<PartKind, PartDef> = {
  led: { kind: 'led', name: 'LED', prefix: 'LED', legs: [{ name: 'A', at: [0, 0] }, { name: 'K', at: [1, 0] }], defaults: { color: 'red' }, about: 'Lights when current flows from the long leg (+, anode) to the short leg (−, cathode). Always use a resistor (220 Ω is a good start).' },
  resistor: { kind: 'resistor', name: 'Resistor', prefix: 'R', legs: [{ name: '1', at: [0, 0] }, { name: '2', at: [4, 0] }], defaults: { R: 220 }, about: 'Limits current. Either way round.' },
  button: { kind: 'button', name: 'Push button', prefix: 'BTN', legs: [{ name: 'L1', at: [0, 0] }, { name: 'R1', at: [2, 0] }, { name: 'L2', at: [0, 2] }, { name: 'R2', at: [2, 2] }], defaults: {}, about: 'Sits across the middle gap. Pressing joins the left legs to the right legs.' },
  pot: { kind: 'pot', name: 'Knob (potentiometer)', prefix: 'POT', legs: [{ name: '1', at: [0, 0] }, { name: 'W', at: [1, 0] }, { name: '2', at: [2, 0] }], defaults: { R: 10000, pos: 0.5 }, about: 'Outer legs to + and −, middle leg to an analog pin: turning it changes the voltage.' },
  buzzer: { kind: 'buzzer', name: 'Buzzer', prefix: 'BZ', legs: [{ name: '+', at: [0, 0] }, { name: '-', at: [3, 0] }], defaults: {}, about: 'Beeps when its + leg is driven. Use tone() for different notes.' },
  servo: { kind: 'servo', name: 'Servo motor', prefix: 'SRV', legs: [{ name: 'GND', at: [0, 0] }, { name: 'V+', at: [1, 0] }, { name: 'SIG', at: [2, 0] }], defaults: {}, about: 'Turns to an angle from 0° to 180°. Brown wire to GND, red to 5 V, orange to a pin.' },
  ldr: { kind: 'ldr', name: 'Light sensor (LDR)', prefix: 'LDR', legs: [{ name: '1', at: [0, 0] }, { name: '2', at: [2, 0] }], defaults: { light: 0.7 }, about: 'Its resistance drops in bright light. Pair it with a 10 kΩ resistor to read light on an analog pin.' },
  ultrasonic: { kind: 'ultrasonic', name: 'Distance sensor', prefix: 'US', legs: [{ name: 'VCC', at: [0, 0] }, { name: 'TRIG', at: [1, 0] }, { name: 'ECHO', at: [2, 0] }, { name: 'GND', at: [3, 0] }], defaults: { cm: 40 }, about: 'Sends a chirp and times the echo to measure distance (2–400 cm). VCC to 5 V.' },
  battery: { kind: 'battery', name: 'Battery pack', prefix: 'BAT', legs: [{ name: '-', at: [0, 0] }, { name: '+', at: [0, 1] }], defaults: { V: 4.5 }, about: 'AA pack: 3 cells is 4.5 V. Plug it into a rail pair, + to the red rail.', safety: 'Never connect + straight to − (short circuit): the wires get hot.' },
};
export const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'];

export interface SPart { id: string; kind: PartKind; ref: string; col: number; y: number; rot: number; params: Record<string, number | string> }
export interface SWire { id: string; a: string; b: string; color: string }
export interface CircuitProject { board: BoardKind | null; parts: SPart[]; wires: SWire[] }

export const rotLeg = ([dx, dy]: [number, number], rot: number): [number, number] => { let x = dx, y = dy; for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [x, y] = [-y, x]; return [x, y]; };
export const legHoles = (p: Pick<SPart, 'kind' | 'col' | 'y' | 'rot'>) => PARTS[p.kind].legs.map(l => { const [dx, dy] = rotLeg(l.at, p.rot); return { name: l.name, col: p.col + dx, y: p.y + dy }; });
export const fits = (p: Pick<SPart, 'kind' | 'col' | 'y' | 'rot'>) => legHoles(p).every(h => isHole(h.col, h.y));
export function nextPartRef(c: CircuitProject, kind: PartKind) { const pre = PARTS[kind].prefix; const used = new Set(c.parts.map(p => p.ref)); for (let i = 1; ; i++) if (!used.has(`${pre}${i}`)) return `${pre}${i}`; }
export const pinKey = (id: string) => `p:${id}`;
export const isPinKey = (k: string) => k.startsWith('p:');

// ---------------------------------------------------------------- connectivity

export interface Nets { find: (k: string) => string; same: (a: string, b: string) => boolean; members: Map<string, string[]> }
/** Which holes, legs and board pins are joined (by strips, wires and parts' own internal links). */
export function connect(c: CircuitProject): Nets {
  const parent = new Map<string, string>();
  const find = (k: string): string => { if (!parent.has(k)) parent.set(k, k); let r = k; while (parent.get(r) !== r) r = parent.get(r)!; let x = k; while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; } return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const node = (k: string) => { const h = parseHole(k); return h ? stripOf(h[0], h[1]) : k; };
  for (const w of c.wires) join(node(w.a), node(w.b));
  for (const p of c.parts) {
    for (const h of legHoles(p)) join(`leg:${p.id}:${h.name}`, isHole(h.col, h.y) ? stripOf(h.col, h.y) : `nowhere:${p.id}:${h.name}`);
    if (p.kind === 'button') { join(`leg:${p.id}:L1`, `leg:${p.id}:L2`); join(`leg:${p.id}:R1`, `leg:${p.id}:R2`); }
  }
  if (c.board) for (const pin of BOARDS[c.board].pins) find(pinKey(pin.id));
  const members = new Map<string, string[]>();
  for (const k of [...parent.keys()]) { const r = find(k); const m = members.get(r) ?? []; m.push(k); members.set(r, m); }
  return { find, same: (a, b) => find(node(a)) === find(node(b)), members };
}
export const legNet = (n: Nets, p: SPart, leg: string) => n.find(`leg:${p.id}:${leg}`);

// ---------------------------------------------------------------- simulation

export type PinMode = 'out' | 'in' | 'pullup';
/** What the program is doing with each pin: mode and level (0..1; PWM and tone are averaged). */
export type PinIO = Record<string, { mode: PinMode; level: number; tone?: number; servo?: number }>;
export interface Inputs { pressed: Set<string> }

export interface Readout {
  ok: boolean;
  /** LED brightness 0..1 and current (A); burnt when pushed far past its rating. */
  leds: Record<string, { mA: number; glow: number; burnt: boolean }>;
  buzzers: Record<string, { on: boolean; freq: number }>;
  servos: Record<string, { angle: number | null; powered: boolean }>;
  /** Voltage on a board pin's net (V), or null when nothing is connected there. */
  pinV: Record<string, number | null>;
  pinmA: Record<string, number>;
  warnings: string[];
  /** Distance the sensor reports to these trig/echo pins (cm), or 0 when it is not wired. */
  distance: (trig: string, echo: string) => number;
  circuit: Circuit;
}

const ldrOhms = (light: number) => Math.pow(10, 5.3 - 2.6 * Math.max(0, Math.min(1, light))); // ~200 kΩ dark to ~500 Ω bright

interface Built { circuit: Circuit; members: Map<string, Array<{ part: string; pin: string }>>; pinOf: Map<string, { part: string; pin: string }>; driverOf: Record<string, string>; partOf: Record<string, string[]>; gnd: string | null; v5: string | null }

/** The breadboard as an Electronics Lab circuit: one simulator part per breadboard part, plus the board's supplies and pin drivers. */
export function toCircuit(c: CircuitProject, io: PinIO, inputs: Inputs = { pressed: new Set() }): Built {
  const nets = connect(c); const sim: Array<{ part: CPart; pins: Record<string, string> }> = [];
  const board = c.board ? BOARDS[c.board] : null; let n = 0;
  const add = (kind: string, ref: string, params: CPart['params'], pins: Record<string, string>) => { const part: CPart = { id: `${ref}#${n++}`, kind, ref, x: 0, y: 0, rot: 0, params }; sim.push({ part, pins }); return part.id; };
  const partOf: Record<string, string[]> = {}; const driverOf: Record<string, string> = {};
  const gnd = board ? nets.find(pinKey('GND')) : (() => { const b = c.parts.find(p => p.kind === 'battery'); return b ? legNet(nets, b, '-') : null; })();
  const v5 = board ? nets.find(pinKey(board.supply)) : null;
  if (board && gnd) {
    add('usb5v', 'USB', { V: 5, Imax: '0.5' }, { VBUS: nets.find(pinKey(board.supply)), GND: gnd });
    add('dcsupply', 'REG3V3', { V: 3.3, Imax: '0.15' }, { '+': nets.find(pinKey('3V3')), '-': gnd });
    for (const pin of board.pins.filter(p => p.kind === 'io')) {
      const s = io[pin.id]; if (!s) continue;
      if (s.mode === 'out') driverOf[pin.id] = add('battery', `PIN${pin.id}`, { V: board.logic * Math.max(0, Math.min(1, s.level)), Rint: 25, mAh: 1000 }, { '+': nets.find(pinKey(pin.id)), '-': gnd });
      else if (s.mode === 'pullup') driverOf[pin.id] = add('battery', `PU${pin.id}`, { V: board.logic, Rint: 35000, mAh: 1000 }, { '+': nets.find(pinKey(pin.id)), '-': gnd });
    }
  }
  for (const p of c.parts) {
    const L = (leg: string) => legNet(nets, p, leg); const ids: string[] = [];
    switch (p.kind) {
      case 'led': ids.push(add('led', p.ref, { color: String(p.params.color ?? 'red'), If: '20m' }, { A: L('A'), K: L('K') })); break;
      case 'resistor': ids.push(add('resistor', p.ref, { R: Number(p.params.R ?? 220), P: '0.25' }, { '1': L('1'), '2': L('2') })); break;
      case 'button': ids.push(add('switch', p.ref, { state: inputs.pressed.has(p.id) ? 'closed' : 'open', I: '0.05' }, { '1': L('L1'), '2': L('R1') })); break;
      case 'pot': ids.push(add('potentiometer', p.ref, { R: Number(p.params.R ?? 10000), pos: Number(p.params.pos ?? 0.5) }, { '1': L('1'), W: L('W'), '2': L('2') })); break;
      case 'buzzer': ids.push(add('resistor', p.ref, { R: 160 }, { '1': L('+'), '2': L('-') })); break;
      case 'ldr': ids.push(add('resistor', p.ref, { R: ldrOhms(Number(p.params.light ?? 0.7)) }, { '1': L('1'), '2': L('2') })); break;
      case 'servo': ids.push(add('resistor', `${p.ref}M`, { R: 250 }, { '1': L('V+'), '2': L('GND') }), add('resistor', `${p.ref}S`, { R: 47000 }, { '1': L('SIG'), '2': L('GND') })); break;
      case 'ultrasonic': ids.push(add('resistor', `${p.ref}P`, { R: 330 }, { '1': L('VCC'), '2': L('GND') }), add('resistor', `${p.ref}T`, { R: 47000 }, { '1': L('TRIG'), '2': L('GND') })); break;
      case 'battery': ids.push(add('battery', p.ref, { V: Number(p.params.V ?? 4.5), Rint: 0.4, mAh: 2000 }, { '+': L('+'), '-': L('-') })); break;
    }
    partOf[p.id] = ids;
  }
  // Lay the simulator parts out in a row and star-wire each net to its own hub point. The hubs sit
  // far away on an irrational slope so no wire passes over another part's pin; netlist() confirms it.
  const groups = new Map<string, Array<{ part: string; pin: string; at: Pt }>>(); const pinOf = new Map<string, { part: string; pin: string }>();
  const parts: CPart[] = sim.map(({ part, pins }, i) => {
    part.x = i * 20; const def = compByKind(part.kind)!;
    for (const pd of def.pins) { const net = pins[pd.name]; if (!net) continue; const g = groups.get(net) ?? []; g.push({ part: part.id, pin: pd.name, at: [part.x + pd.at[0], part.y + pd.at[1]] }); groups.set(net, g); if (!pinOf.has(net)) pinOf.set(net, { part: part.id, pin: pd.name }); }
    return part;
  });
  if (gnd && groups.has(gnd)) { const gpart: CPart = { id: 'GND#', kind: 'ground', ref: 'GND', x: -20, y: 1, rot: 0, params: {} }; parts.push(gpart); groups.get(gnd)!.push({ part: gpart.id, pin: 'GND', at: [-20, 0] }); }
  const wires: CWire[] = []; let k = 0;
  for (const g of groups.values()) { if (g.length < 2) continue; const hub: Pt = [-137.31 - k * 9.173, 211.7 + k * 13.391]; k++; for (const m of g) wires.push({ id: `w${wires.length}`, pts: [m.at, hub] }); }
  const circuit: Circuit = { name: 'Build Studio circuit', parts, wires };
  return { circuit, members: new Map([...groups].map(([net, g]) => [net, g.filter(m => m.part !== 'GND#')])), pinOf, driverOf, partOf, gnd, v5 };
}

/** Run the circuit once at DC with the program's current pin levels and read what a beginner sees. */
export function evaluate(c: CircuitProject, io: PinIO, inputs: Inputs = { pressed: new Set() }): Readout {
  const b = toCircuit(c, io, inputs); const board = c.board ? BOARDS[c.board] : null; const warnings: string[] = [];
  const res = simulate(b.circuit, { mode: 'dc' }); const nets = connect(c);
  const netV = (net: string | null): number | null => { if (!net) return null; const m = b.pinOf.get(net); if (!m) return null; const nid = res.netlist.pinNet[m.part]?.[m.pin]; return nid === undefined ? null : (res.nets[nid]?.[0] ?? null); };
  const cur = (id: string) => Math.abs(res.parts[id]?.i[0] ?? 0);
  const gV = netV(b.gnd) ?? 0;
  const leds: Readout['leds'] = {}, buzzers: Readout['buzzers'] = {}, servos: Readout['servos'] = {}, pinV: Readout['pinV'] = {}, pinmA: Readout['pinmA'] = {};
  for (const p of c.parts) {
    const ids = b.partOf[p.id] ?? [];
    if (p.kind === 'led') {
      const i = res.parts[ids[0]]?.i[0] ?? 0; const mA = i * 1000; const burnt = mA > 60;
      leds[p.id] = { mA, glow: burnt ? 0 : Math.max(0, Math.min(1, mA / 15)), burnt };
      if (burnt) warnings.push(`${p.ref} has ${mA.toFixed(0)} mA through it: a real LED would burn out. Add a 220 Ω resistor in line with it.`);
      else if (mA > 25) warnings.push(`${p.ref} is running at ${mA.toFixed(0)} mA, above its 20 mA rating. Use a bigger resistor.`);
      else if (i < -1e-4) warnings.push(`${p.ref} is in backwards: the long leg (+) goes toward the pin or + rail.`);
    }
    if (p.kind === 'buzzer') {
      const on = (res.parts[ids[0]]?.i[0] ?? 0) > 0.008; const drive = Object.entries(io).find(([id, s]) => s.tone && nets.same(pinKey(id), `leg:${p.id}:+`));
      buzzers[p.id] = { on: on || !!drive, freq: drive?.[1].tone ?? (on ? 2300 : 0) };
    }
    if (p.kind === 'servo') {
      const vplus = (netV(legNet(nets, p, 'V+')) ?? 0) - (netV(legNet(nets, p, 'GND')) ?? 0); const powered = vplus > 4;
      const drive = Object.entries(io).find(([id, s]) => s.servo !== undefined && nets.same(pinKey(id), `leg:${p.id}:SIG`));
      servos[p.id] = { angle: powered && drive ? drive[1].servo! : null, powered };
      if (drive && !powered) warnings.push(`${p.ref} gets a signal but no power: red wire to 5 V, brown to GND.`);
    }
    if (p.kind === 'battery' && cur(ids[0]) > 2) warnings.push(`${p.ref} is short-circuited (${cur(ids[0]).toFixed(1)} A): + is wired straight to −. Real wires and batteries get hot. Unplug it.`);
    if (p.kind === 'resistor') { const pw = res.parts[ids[0]]?.p[0] ?? 0; if (pw > 0.25) warnings.push(`${p.ref} is turning ${pw.toFixed(2)} W into heat, more than its ¼ W rating: it would get too hot to touch.`); }
  }
  if (board) {
    for (const pd of board.pins) { const v = netV(nets.find(pinKey(pd.id))); pinV[pd.id] = v === null ? null : v - gV; }
    for (const [id, part] of Object.entries(b.driverOf)) { const mA = cur(part) * 1000; pinmA[id] = mA; const label = board.pins.find(x => x.id === id)?.label ?? id; if (io[id]?.mode === 'out' && mA > board.maxPinmA * 2) warnings.push(`Pin ${label} is supplying ${mA.toFixed(0)} mA: far over its ${board.maxPinmA} mA limit. On a real board this damages the chip.`); else if (io[id]?.mode === 'out' && mA > board.maxPinmA * 1.1) warnings.push(`Pin ${label} is supplying ${mA.toFixed(0)} mA, over the ${board.maxPinmA} mA recommended.`); }
    const usb = b.circuit.parts.find(p => p.ref === 'USB'); if (usb && cur(usb.id) > 0.6) warnings.push(`The board is drawing ${(cur(usb.id) * 1000).toFixed(0)} mA from USB, more than the 500 mA a USB port gives. Short circuit between 5V and GND?`);
    const reg = b.circuit.parts.find(p => p.ref === 'REG3V3'); if (reg && cur(reg.id) > 0.2) warnings.push('The 3.3 V pin is overloaded or shorted to GND.');
  }
  if (!res.converged) warnings.push('The simulator could not settle this circuit; check for parts wired in a loop.');
  const distance = (trig: string, echo: string) => {
    const us = c.parts.find(p => p.kind === 'ultrasonic' && nets.same(pinKey(trig), `leg:${p.id}:TRIG`) && nets.same(pinKey(echo), `leg:${p.id}:ECHO`)); if (!us) return 0;
    const vcc = (netV(legNet(nets, us, 'VCC')) ?? 0) - (netV(legNet(nets, us, 'GND')) ?? 0); return vcc > 4.2 ? Math.max(2, Math.min(400, Number(us.params.cm ?? 40))) : 0;
  };
  return { ok: res.converged, leds, buzzers, servos, pinV, pinmA, warnings: [...new Set(warnings)], distance, circuit: b.circuit };
}

/** Check the generated circuit really has the intended connections (used by the tests). */
export function verifyCircuit(c: CircuitProject, io: PinIO): boolean {
  const b = toCircuit(c, io); const nl = netlist(b.circuit); const seen = new Map<number, string>();
  for (const [net, g] of b.members) for (const m of g) {
    const got = nl.pinNet[m.part]?.[m.pin];
    if (got === undefined || (net === b.gnd && got !== 0)) return false; if (seen.has(got) && seen.get(got) !== net) return false; seen.set(got, net);
  }
  // Every member of one breadboard net must land on one simulator net.
  for (const g of b.members.values()) { const ids = new Set(g.map(m => nl.pinNet[m.part]?.[m.pin])); if (ids.size > 1) return false; }
  return true;
}
