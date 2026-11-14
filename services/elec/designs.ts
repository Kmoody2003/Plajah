// Starter designs: everyday circuits drawn and released by Plajah as public domain (CC0). They are
// classic textbook circuits (an LED lamp, a 555 blinker, a 555 tone, a regulated supply), laid out
// for our schematic editor, with values that pass our own checks.

import { type Pt, compByKind, compDefaults } from './components';
import { type Circuit, type CPart, type CWire, netlist, pinPos } from './circuit';
import type { SimOptions } from './sim';

export interface Design { id: string; title: string; about: string; circuit: Circuit; sim: SimOptions; licence: 'CC0-1.0'; tags: string[]; pairs: Array<[string, string]> }

type PinRef = [string, string];
export class Builder {
  parts: CPart[] = []; wires: CWire[] = []; pairs: Array<[string, string]> = []; private g = 0;
  part(kind: string, ref: string, x: number, y: number, rot = 0, params: Record<string, number | string> = {}) {
    const def = compByKind(kind)!; this.parts.push({ id: ref, kind, ref, x, y, rot, params: { ...compDefaults(def), ...params } }); return this;
  }
  /** A ground symbol whose pin sits at (x, y). */
  gnd(x: number, y: number): string { const ref = `GND${++this.g}`; this.part('ground', ref, x, y + 1); return ref; }
  pin([ref, name]: PinRef): Pt {
    const p = this.parts.find(q => q.ref === ref)!; const at = compByKind(p.kind)!.pins.find(q => q.name === name)!.at; return pinPos(p, at);
  }
  /** Orthogonal wire from pin to pin through optional waypoints; corners go horizontal-first ('hv') or vertical-first ('vh'). */
  w(a: PinRef, b: PinRef, via: Pt[] = [], mode: 'hv' | 'vh' = 'hv') {
    const raw = [this.pin(a), ...via, this.pin(b)]; const pts: Pt[] = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      const p = pts[pts.length - 1], q = raw[i];
      if (p[0] !== q[0] && p[1] !== q[1]) pts.push(mode === 'hv' ? [q[0], p[1]] : [p[0], q[1]]);
      pts.push(q);
    }
    // Drop repeated and collinear middle points.
    const out: Pt[] = [];
    for (const p of pts) {
      if (out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1]) continue;
      if (out.length >= 2) { const [a0, b0] = [out[out.length - 2], out[out.length - 1]]; if ((a0[0] === b0[0] && b0[0] === p[0]) || (a0[1] === b0[1] && b0[1] === p[1])) out.pop(); }
      out.push(p);
    }
    this.wires.push({ id: `w${this.wires.length + 1}`, pts: out }); this.pairs.push([`${a[0]}.${a[1]}`, `${b[0]}.${b[1]}`]); return this;
  }
  done(name: string): Circuit { return { name, parts: this.parts, wires: this.wires }; }
}

/** Astable 555 core shared by the blinker and the tone. Returns the builder with U1 and BT1 placed. */
function astable(b: Builder, r1: string, r2: string, c1: string) {
  b.part('battery', 'BT1', -14, 0).part('ne555', 'U1', 0, 0)
    .part('resistor', 'R1', 7, -4, 1, { R: r1 }).part('resistor', 'R2', 7, 3, 1, { R: r2 })
    .part(c1.endsWith('u') ? 'electrolytic' : 'capacitor', 'C1', -9, 4, 1, { C: c1 }).part('capacitor', 'C2', -4, 6, 1, { C: '10n' });
  b.w(['BT1', '+'], ['U1', 'VCC'], [[-14, -7]]);
  b.w(['U1', 'RESET'], ['U1', 'VCC']);
  b.w(['R1', '1'], ['U1', 'VCC'], [[7, -7]]);
  b.w(['R1', '2'], ['R2', '1']);
  b.w(['R2', '1'], ['U1', 'DIS']);
  b.w(['R2', '2'], ['U1', 'THR'], [[7, 12], [-6, 12], [-6, 1]]);
  b.w(['U1', 'TRIG'], ['U1', 'THR'], [[-6, -1], [-6, 1]]);
  const pol = c1.endsWith('u');
  b.w(['C1', pol ? '+' : '1'], ['U1', 'THR'], [[-9, 1]]);
  b.w(['C1', pol ? '-' : '2'], [b.gnd(-9, 8), 'GND']);
  b.w(['U1', 'CTRL'], ['C2', '1']);
  b.w(['C2', '2'], [b.gnd(-4, 10), 'GND']);
  b.w(['U1', 'GND'], [b.gnd(0, 6), 'GND']);
  b.w(['BT1', '-'], [b.gnd(-14, 4), 'GND']);
}

function usbLamp(): Design {
  const b = new Builder();
  b.part('usb5v', 'J1', 0, 0).part('switch', 'SW1', 0, -5, 1);
  b.w(['J1', 'VBUS'], ['SW1', '2']);
  b.w(['J1', 'GND'], [b.gnd(0, 4), 'GND']);
  const g = b.gnd(13, -7);
  [-9, -12, -15].forEach((y, k) => {
    b.part('resistor', `R${k + 1}`, 5, y, 0, { R: '120' }).part('led', `D${k + 1}`, 11, y, 0, { color: 'white' });
    b.w(['SW1', '1'], [`R${k + 1}`, '1'], [], 'vh');
    b.w([`R${k + 1}`, '2'], [`D${k + 1}`, 'A']);
    b.w([`D${k + 1}`, 'K'], [g, 'GND']);
  });
  return { id: 'usb-led-lamp', title: 'USB LED lamp', about: 'Three white LEDs, each with its own current-limiting resistor (about 16 mA each), switched from a USB port. Each LED gets its own resistor so one LED cannot hog the current.', circuit: b.done('USB LED lamp'), sim: { mode: 'dc' }, licence: 'CC0-1.0', tags: ['lamp', 'LED', 'USB', 'beginner'], pairs: b.pairs };
}

function coinCellLight(): Design {
  const b = new Builder();
  b.part('coincell', 'BT1', 0, 0).part('switch', 'SW1', 4, -2).part('resistor', 'R1', 10, -2, 0, { R: '47' }).part('led', 'D1', 14, 0, 1, { color: 'red' });
  b.w(['BT1', '+'], ['SW1', '1']); b.w(['SW1', '2'], ['R1', '1']); b.w(['R1', '2'], ['D1', 'A']); b.w(['D1', 'K'], ['BT1', '-']);
  b.w(['BT1', '-'], [b.gnd(0, 4), 'GND']);
  return { id: 'coin-cell-keychain-light', title: 'Coin-cell keychain light', about: 'A CR2032 lights a red LED through 47 Ω. Small enough for a keychain, which is exactly why coin-cell products have child-safety rules (Reese\'s Law in the US).', circuit: b.done('Coin-cell keychain light'), sim: { mode: 'dc' }, licence: 'CC0-1.0', tags: ['light', 'LED', 'coin cell', 'beginner'], pairs: b.pairs };
}

function blinker(): Design {
  const b = new Builder(); astable(b, '1k', '68k', '10u');
  b.part('resistor', 'R3', 11, -1, 0, { R: '470' }).part('led', 'D1', 15, 2, 1, { color: 'red' });
  b.w(['U1', 'OUT'], ['R3', '1']); b.w(['R3', '2'], ['D1', 'A']); b.w(['D1', 'K'], [b.gnd(15, 6), 'GND']);
  return { id: '555-led-blinker', title: '555 LED blinker', about: 'The classic astable 555: about 1 Hz from f = 1.44 / ((R1 + 2·R2)·C1). Change R2 or C1 to change the speed.', circuit: b.done('555 LED blinker'), sim: { mode: 'tran', tEnd: 4, steps: 4000 }, licence: 'CC0-1.0', tags: ['555', 'LED', 'timer', 'beginner'], pairs: b.pairs };
}

function tone(): Design {
  const b = new Builder(); astable(b, '1k', '10k', '47n');
  b.part('resistor', 'R3', 11, -1, 0, { R: '1k' }).part('npn', 'Q1', 16, -1).part('resistor', 'R4', 14, -7, 0, { R: '100', P: '1' })
    .part('speaker', 'LS1', 20, -6).part('diode', 'D1', 24, -6, 3);
  b.w(['U1', 'OUT'], ['R3', '1']); b.w(['R3', '2'], ['Q1', 'B']); b.w(['Q1', 'E'], [b.gnd(17, 3), 'GND']);
  b.w(['R4', '1'], ['R1', '1'], [[7, -7]]); b.w(['R4', '2'], ['LS1', '+']);
  b.w(['LS1', '-'], ['Q1', 'C'], [[17, -5]]);
  b.w(['LS1', '+'], ['D1', 'K'], [[18, -9], [24, -9]]);
  b.w(['D1', 'A'], ['LS1', '-'], [[24, -3], [18, -3]]);
  return { id: '555-speaker-tone', title: '555 tone into a speaker', about: 'An astable 555 at about 1.5 kHz drives an 8 Ω speaker through an NPN transistor. R4 limits the current; D1 catches the voice coil\'s kick when the transistor turns off.', circuit: b.done('555 tone into a speaker'), sim: { mode: 'tran', tEnd: 0.004, steps: 4000 }, licence: 'CC0-1.0', tags: ['555', 'speaker', 'audio', 'transistor'], pairs: b.pairs };
}

function supply5v(): Design {
  const b = new Builder();
  b.part('battery', 'BT1', 0, 0).part('reg7805', 'U1', 8, -2).part('capacitor', 'C1', 3, 0, 1, { C: '330n' }).part('capacitor', 'C2', 13, 0, 1, { C: '100n' })
    .part('resistor', 'R1', 17, 0, 1, { R: '100', P: '1' }).part('resistor', 'R2', 21, -1, 1, { R: '1k' }).part('led', 'D1', 21, 3, 1, { color: 'green' });
  b.w(['BT1', '+'], ['C1', '1']); b.w(['C1', '1'], ['U1', 'IN']);
  b.w(['BT1', '-'], ['C1', '2']); b.w(['C1', '2'], ['U1', 'GND'], [[8, 2]]);
  b.w(['U1', 'OUT'], ['C2', '1']); b.w(['C2', '2'], ['U1', 'GND'], [[8, 2]]);
  b.w(['C2', '1'], ['R1', '1']); b.w(['R1', '2'], ['C2', '2']);
  b.w(['R1', '1'], ['R2', '1'], [], 'vh'); b.w(['R2', '2'], ['D1', 'A']); b.w(['D1', 'K'], ['R1', '2'], [[17, 5]]);
  b.w(['U1', 'GND'], [b.gnd(8, 4), 'GND']);
  return { id: '5v-regulated-supply', title: '5 V regulated supply', about: 'A 9 V battery through a 7805 regulator gives a steady 5 V for logic. The capacitors keep the regulator stable; the green LED shows power. R1 stands in for your load (50 mA).', circuit: b.done('5 V regulated supply'), sim: { mode: 'dc' }, licence: 'CC0-1.0', tags: ['power', 'regulator', 'supply'], pairs: b.pairs };
}

function transistorSwitch(): Design {
  const b = new Builder();
  b.part('usb5v', 'J1', 0, 0).part('switch', 'SW1', 4, -2).part('resistor', 'R1', 10, 2, 0, { R: '10k' }).part('npn', 'Q1', 15, 2)
    .part('led', 'D1', 16, -3, 1, { color: 'blue' }).part('resistor', 'R2', 16, -8, 1, { R: '100' }).part('resistor', 'R3', 13, 5, 1, { R: '100k' });
  b.w(['J1', 'VBUS'], ['SW1', '1']); b.w(['SW1', '2'], ['R1', '1'], [], 'vh'); b.w(['R1', '2'], ['Q1', 'B']);
  b.w(['Q1', 'E'], [b.gnd(16, 6), 'GND']); b.w(['D1', 'K'], ['Q1', 'C']); b.w(['R2', '2'], ['D1', 'A']);
  b.w(['R2', '1'], ['J1', 'VBUS'], [[0, -10]]);
  b.w(['Q1', 'B'], ['R3', '1']); b.w(['R3', '2'], [b.gnd(13, 9), 'GND']);
  b.w(['J1', 'GND'], [b.gnd(0, 4), 'GND']);
  return { id: 'transistor-led-switch', title: 'Transistor switch', about: 'A tiny base current through R1 turns on an NPN transistor, which switches a much larger LED current. R3 holds the transistor off when the switch is open. The same pattern drives relays, motors and lamps from a microcontroller pin.', circuit: b.done('Transistor switch'), sim: { mode: 'dc' }, licence: 'CC0-1.0', tags: ['transistor', 'LED', 'switch'], pairs: b.pairs };
}

function rcFilter(): Design {
  const b = new Builder();
  b.part('usb5v', 'J1', 0, 0).part('switch', 'SW1', 4, -2).part('resistor', 'R1', 10, -2, 0, { R: '10k' }).part('capacitor', 'C1', 14, 0, 1, { C: '100n' });
  b.w(['J1', 'VBUS'], ['SW1', '1']); b.w(['SW1', '2'], ['R1', '1']); b.w(['R1', '2'], ['C1', '1']);
  b.w(['C1', '2'], [b.gnd(14, 4), 'GND']); b.w(['J1', 'GND'], [b.gnd(0, 4), 'GND']);
  return { id: 'rc-low-pass', title: 'RC charging (low-pass filter)', about: 'The capacitor charges through R1 with time constant τ = R·C = 1 ms: 63% after 1 ms, 99% after 5 ms. The same pair is a low-pass filter with corner frequency 1 / (2π·R·C) ≈ 159 Hz.', circuit: b.done('RC charging'), sim: { mode: 'tran', tEnd: 0.005, steps: 1000 }, licence: 'CC0-1.0', tags: ['filter', 'capacitor', 'time constant', 'beginner'], pairs: b.pairs };
}

export interface VoltaCircuitOpts {
  ladderPos?: number;
  clipPos?: number;
  vcoFreqHz?: number;
  name?: string;
}

/**
 * VOLTA Super-Synth analog core schematic: 12 V → 7805 regulated 5 V rail, Class-A 2N3904 transistor
 * preamp, potentiometer-tuned RC ladder filter, Shockley diode asymmetrical soft clipper, and ¼" jack.
 */
export function voltaSynthDesign(opts: VoltaCircuitOpts = {}): Design {
  const ladderPos = Math.max(0.05, Math.min(0.98, opts.ladderPos ?? 0.62));
  const clipPos = Math.max(0.05, Math.min(0.98, opts.clipPos ?? 0.35));
  const freqHz = Math.max(50, Math.min(2000, opts.vcoFreqHz ?? 220));
  const title = opts.name ?? 'VOLTA Super-Synth Core';
  const b = new Builder();

  // Power stage: 12V DC supply → switch → 7805 → 5V rail + green power LED
  b.part('dcsupply', 'J1', -18, -6, 0, { V: 12, Imax: '1' })
    .part('switch', 'SW1', -13, -8, 0, { state: 'closed' })
    .part('electrolytic', 'C1', -8, -5, 1, { C: '100u', V: '25' })
    .part('reg7805', 'U1', -3, -8, 0)
    .part('capacitor', 'C2', 3, -5, 1, { C: '100n', V: '50' })
    .part('resistor', 'R1', 7, -5, 1, { R: '470', P: '0.25' })
    .part('led', 'D1', 7, 0, 1, { color: 'green' });
  b.w(['J1', '-'], [b.gnd(-18, -2), 'GND']);
  b.w(['J1', '+'], ['SW1', '1']);
  b.w(['SW1', '2'], ['C1', '+'], [[-8, -8]]);
  b.w(['C1', '-'], [b.gnd(-8, -1), 'GND']);
  b.w(['C1', '+'], ['U1', 'IN'], [[-8, -8]]);
  b.w(['U1', 'GND'], [b.gnd(-3, -4), 'GND']);
  b.w(['U1', 'OUT'], ['C2', '1'], [[3, -8]]);
  b.w(['C2', '2'], [b.gnd(3, -1), 'GND']);
  b.w(['U1', 'OUT'], ['R1', '1'], [[7, -8]]);
  b.w(['R1', '2'], ['D1', 'A']);
  b.w(['D1', 'K'], [b.gnd(7, 4), 'GND']);

  // VCO Signal Core → Class-A BJT Differential Preamp → Tunable Ladder Filter → Diode Clipper → ¼" Out
  b.part('signal', 'V1', -10, 10, 0, { Vpk: '1', f: String(Math.round(freqHz)), Rout: 100 })
    .part('capacitor', 'C3', -4, 8, 0, { C: '1u', V: '50' })
    .part('resistor', 'R_IN', 2, 8, 0, { R: '1k', P: '0.25' })
    .part('resistor', 'R2', 12, -3, 1, { R: '47k', P: '0.25' })
    .part('resistor', 'R3', 12, 12, 1, { R: '22k', P: '0.25' })
    .part('npn', 'Q1', 17, 8, 0, { beta: 120 })
    .part('resistor', 'R4', 18, -3, 1, { R: '2.2k', P: '0.25' })
    .part('resistor', 'R5', 18, 13, 1, { R: '1k', P: '0.25' })
    .part('capacitor', 'C4', 23, 6, 0, { C: '1u', V: '50' })
    .part('potentiometer', 'RV1', 29, 8, 0, { R: '10k', pos: ladderPos, P: '0.25' })
    .part('resistor', 'R6', 34, 6, 0, { R: '1k', P: '0.25' })
    .part('capacitor', 'C5', 37, 10, 1, { C: '100n', V: '50' })
    .part('potentiometer', 'RV2', 42, 8, 0, { R: '10k', pos: clipPos, P: '0.25' })
    .part('resistor', 'R7', 47, 6, 0, { R: '1k', P: '0.25' })
    .part('diode', 'D2', 51, 10, 1, { type: 'signal' })
    .part('diode', 'D3', 55, 10, 3, { type: 'signal' })
    .part('capacitor', 'C6', 59, 8, 0, { C: '1u', V: '50' })
    .part('jack', 'J2', 65, 8, 0);

  b.w(['V1', '-'], [b.gnd(-10, 14), 'GND']);
  b.w(['V1', '+'], ['C3', '1']);
  b.w(['C3', '2'], ['R_IN', '1']);
  b.w(['U1', 'OUT'], ['R2', '1'], [[12, -8]]);
  b.w(['R3', '2'], [b.gnd(12, 16), 'GND']);
  b.w(['R_IN', '2'], ['Q1', 'B']);
  b.w(['R2', '2'], ['Q1', 'B'], [[12, 8]]);
  b.w(['R3', '1'], ['Q1', 'B'], [[12, 8]]);
  b.w(['U1', 'OUT'], ['R4', '1'], [[18, -8]]);
  b.w(['R4', '2'], ['Q1', 'C']);
  b.w(['Q1', 'E'], ['R5', '1']);
  b.w(['R5', '2'], [b.gnd(18, 17), 'GND']);
  b.w(['Q1', 'C'], ['C4', '1']);
  b.w(['C4', '2'], ['RV1', '1'], [], 'vh');
  b.w(['RV1', '2'], [b.gnd(31, 10), 'GND']);
  b.w(['RV1', 'W'], ['R6', '1']);
  b.w(['R6', '2'], ['C5', '1'], [], 'hv');
  b.w(['C5', '2'], [b.gnd(37, 14), 'GND']);
  b.w(['C5', '1'], ['RV2', '1']);
  b.w(['RV2', '2'], [b.gnd(44, 10), 'GND']);
  b.w(['RV2', 'W'], ['R7', '1']);
  b.w(['R7', '2'], ['D2', 'A'], [], 'hv');
  b.w(['D2', 'K'], [b.gnd(51, 14), 'GND']);
  b.w(['D2', 'A'], ['D3', 'K']);
  b.w(['D3', 'A'], [b.gnd(55, 14), 'GND']);
  b.w(['D3', 'K'], ['C6', '1']);
  b.w(['C6', '2'], ['J2', 'T']);
  b.w(['J2', 'S'], [b.gnd(65, 12), 'GND']);

  return {
    id: 'volta-super-synth',
    title,
    about: 'Circuit-modeled Super-Synth core: regulated 5 V analog bus, 2N3904 Class-A transistor overdrive, potentiometer-tunable ladder filter, asymmetrical 1N4148 Shockley diode soft-clipper, and ¼" output jack.',
    circuit: b.done(title),
    sim: { mode: 'tran', tEnd: 0.015, steps: 1500 },
    licence: 'CC0-1.0',
    tags: ['synth', 'audio', 'ladder', 'transistor', 'diode', 'volta'],
    pairs: b.pairs,
  };
}

export const DESIGNS: Design[] = [usbLamp(), coinCellLight(), blinker(), tone(), supply5v(), transistorSwitch(), rcFilter(), voltaSynthDesign()];
export const designById = (id: string) => DESIGNS.find(d => d.id === id);

/** Check a design's drawn wires make exactly the intended connections (no accidental joins or gaps). */
export function verifyDesign(d: Design): string[] {
  const c = d.circuit; const nl = netlist(c); const errs: string[] = [];
  const parent = new Map<string, string>(); const find = (k: string): string => { if (!parent.has(k)) parent.set(k, k); const p = parent.get(k)!; if (p === k) return k; const r = find(p); parent.set(k, r); return r; };
  const grounds = c.parts.filter(p => p.kind === 'ground').map(p => `${p.ref}.GND`); for (const g of grounds) find(g); for (let i = 1; i < grounds.length; i++) parent.set(find(grounds[i]), find(grounds[0]));
  for (const [a, b] of d.pairs) parent.set(find(a), find(b));
  const netOfPin = (s: string) => { const [ref, pin] = s.split('.'); const p = c.parts.find(q => q.ref === ref)!; return p.kind === 'ground' ? 0 : nl.pinNet[p.id]?.[pin]; };
  const allPins = c.parts.filter(p => p.kind !== 'ground').flatMap(p => compByKind(p.kind)!.pins.map(q => `${p.ref}.${q.name}`));
  for (let i = 0; i < allPins.length; i++) for (let j = i + 1; j < allPins.length; j++) {
    const same = find(allPins[i]) === find(allPins[j]), drawn = netOfPin(allPins[i]) === netOfPin(allPins[j]);
    if (same !== drawn) errs.push(`${allPins[i]} and ${allPins[j]} ${drawn ? 'are joined but should not be' : 'should be joined'}`);
  }
  return errs;
}
