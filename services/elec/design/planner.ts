// The planner: requirement spec -> blocks, a controller, a pin map and a power plan.
//   1. expand needs into block instances (I²C addresses handed out per instance);
//   2. pick a board that can do the job (radio, native USB, pins) and allocate its pins by
//      capability, scarcest first (analog, then PWM, then plain GPIO), adding ADS1115s when the
//      board runs out of analog inputs;
//   3. add up every load per rail, then size the source (USB port, USB-C 1.5/3 A, adapter, Li-ion
//      with charger + boost, AA pack, mains module) and the protections (fuse, power switch).
// Released by Plajah as public domain (CC0).
import { blockById } from './blocks';
import { MCUS, railMax, type McuDef, type McuKind } from './mcus';
import { PI_MODELS } from '../boards';
import type { Inst, Load, PinNeed, PowerChoice, Spec } from './types';

export interface PinRow { pin: string; role: string; label: string; inst: string }
export interface PowerPlan {
  source: Exclude<PowerChoice, 'auto'>; summary: string;
  /** USB port limit (A) when a USB socket feeds the design. */
  usbA?: number; adapterV?: number; adapterA?: number; mainsV?: number; acdc?: { V: number; I: number };
  fuseA?: number; buck?: { V: number; I: number }; boost?: { V: number; I: number }; ldo3?: boolean;
  cell?: { mAh: number; chargeA: number }; aa?: boolean; powerSwitch: boolean;
  /** SYS rail: what lamp LEDs and battery-powered boards run from. */
  sysV: number; sysIs: 'V5' | 'SYS';
  rows: Array<{ what: string; rail: string; typ: number; peak: number }>;
  totals: Record<string, { typ: number; peak: number; design: number }>;
  capacity: Record<string, number>; notes: string[];
}
export interface Plan {
  errors: string[]; notes: string[]; mcu: McuDef | null; insts: Inst[]; pins: PinRow[];
  i2c?: [string, string]; spi?: [string, string]; ads: number; power: PowerPlan; logicV: number; tried: string[];
}

const STD_A = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
const sizeUp = (a: number, list = STD_A) => list.find(s => s >= a - 1e-9) ?? list[list.length - 1];
const design = (typ: number, peak: number) => typ + 0.5 * (peak - typ);

function instances(spec: Spec, errors: string[]): Inst[] {
  const out: Inst[] = []; const usbMidi = spec.conn.includes('usb-midi'), usbHid = spec.conn.includes('usb-hid'), ha = spec.conn.includes('homeassistant');
  for (const need of spec.needs) {
    const b = blockById(need.block); if (!b) { errors.push(`Unknown block "${need.block}".`); continue; }
    let count = Math.max(1, Math.round(need.count || 1));
    if (!b.instances && count > b.max) { errors.push(`${b.label}: at most ${b.max} in one design (asked for ${count}).`); count = b.max; }
    if (b.addrs && count > b.addrs.length) { errors.push(`${b.label}: only ${b.addrs.length} can share one I²C bus (addresses ${b.addrs.join(', ')}).`); count = b.addrs.length; }
    const opt = { ...Object.fromEntries((b.opts ?? []).map(o => [o.key, o.default])), ...(need.opt ?? {}) };
    const counts = b.instances ? b.instances(count, opt) : Array.from({ length: count }, () => 1);
    counts.forEach((c, k) => {
      const prev = out.filter(x => x.block === b.id).length;
      out.push({ block: b.id, id: `${b.id}${prev + 1}`, k: prev, count: c, opt, label: `${b.label}${counts.length > 1 || prev ? ` ${prev + 1}` : ''}`, pins: {}, addr: b.addrs?.[prev], mcu: null, logicV: 3.3, sysV: 5, usbMidi, usbHid, ha });
    });
  }
  return out;
}

function candidates(spec: Spec): McuKind[] {
  if (spec.mcu !== 'auto' && spec.mcu !== 'none') return [spec.mcu];
  if (spec.conn.includes('usb-midi') || spec.conn.includes('usb-hid')) return ['pico'];
  if (spec.conn.some(c => c === 'wifi' || c === 'homeassistant' || c === 'bluetooth')) return ['esp32', 'rpi'];
  return ['pico', 'esp32', 'nano'];
}

/** Allocate pins; returns the reason on failure. */
function allocate(mcu: McuDef, insts: Inst[], spec: Spec): { pins: PinRow[]; i2c?: [string, string]; spi?: [string, string]; ads: number } | string {
  const conn = spec.conn;
  if ((conn.includes('usb-midi') || conn.includes('usb-hid')) && !mcu.usbDevice) return `${mcu.label} has no native USB for ${conn.includes('usb-midi') ? 'USB MIDI' : 'USB HID'}`;
  if ((conn.includes('wifi') || conn.includes('homeassistant')) && !mcu.wifi) return `${mcu.label} has no Wi-Fi`;
  if (conn.includes('bluetooth') && !mcu.ble) return `${mcu.label} has no Bluetooth`;
  for (const i of insts) { const why = blockById(i.block)!.notOn?.[mcu.kind]; if (why) return `${i.label} cannot run on ${mcu.label}: ${why}`; }
  const free = [...mcu.gpio]; const take = (p: string) => free.splice(free.indexOf(p), 1);
  const rows: PinRow[] = []; let i2c: [string, string] | undefined, spi: [string, string] | undefined;
  for (const i of insts) i.mcu = mcu;
  const needs: Array<{ i: Inst; n: PinNeed }> = insts.flatMap(i => blockById(i.block)!.pins(i).map(n => ({ i, n })));
  const adcNeeds = needs.filter(x => x.n.cap === 'adc').length;
  const wantI2c = insts.some(i => blockById(i.block)!.bus === 'i2c') || adcNeeds > mcu.adc.length;
  if (wantI2c) { const o = mcu.i2c.find(([a, b]) => free.includes(a) && free.includes(b)); if (!o) return `${mcu.label} has no free I²C pins`; i2c = o; take(o[0]); take(o[1]); rows.push({ pin: o[0], role: 'sda', label: 'I²C SDA (shared bus)', inst: 'bus' }, { pin: o[1], role: 'scl', label: 'I²C SCL (shared bus)', inst: 'bus' }); }
  if (insts.some(i => blockById(i.block)!.bus === 'spi')) { const o = mcu.spi.find(([a, b]) => free.includes(a) && free.includes(b)); if (!o) return `${mcu.label} has no free SPI pins`; spi = o; take(o[0]); take(o[1]); rows.push({ pin: o[0], role: 'sck', label: 'SPI clock', inst: 'bus' }, { pin: o[1], role: 'mosi', label: 'SPI data (MOSI)', inst: 'bus' }); }
  for (const i of insts) { if (i2c) { i.pins.sda = i2c[0]; i.pins.scl = i2c[1]; } if (spi) { i.pins.sck = spi[0]; i.pins.mosi = spi[1]; } }
  const order = { adc: 0, pwm: 1, gpio: 2, in: 2 } as const;
  // Pi neopixels need the hardware PWM pin; claim it before anything else.
  needs.sort((a, b) => (b.i.block === 'neopixel' ? 1 : 0) - (a.i.block === 'neopixel' ? 1 : 0) || order[a.n.cap] - order[b.n.cap]);
  let adsCh = 0;
  for (const { i, n } of needs) {
    let pool: string[];
    if (n.cap === 'adc') pool = mcu.adc.filter(p => free.includes(p));
    else if (n.cap === 'pwm') pool = (mcu.kind === 'rpi' && i.block === 'neopixel' ? ['GPIO18'] : mcu.pwm).filter(p => free.includes(p));
    else if (n.cap === 'in') pool = free.filter(p => !mcu.strap.includes(p));
    else pool = [...free.filter(p => !mcu.strap.includes(p)), ...free.filter(p => mcu.strap.includes(p))];
    if (n.cap === 'adc' && !pool.length) {
      if (!i2c) return `${mcu.label} is out of analog inputs`;
      if (adsCh >= 16) return 'More than 16 analog inputs (four ADS1115s) is beyond this designer';
      i.pins[n.role] = `ADS:${Math.floor(adsCh / 4)}:A${adsCh % 4}`; rows.push({ pin: `ADS1115 #${Math.floor(adsCh / 4) + 1} A${adsCh % 4}`, role: n.role, label: n.label, inst: i.id }); adsCh++; continue;
    }
    if (!pool.length) return `${mcu.label} runs out of ${n.cap === 'pwm' ? 'PWM-capable' : n.cap === 'in' ? 'input' : 'GPIO'} pins (needed for ${n.label}; ${needs.length + (i2c ? 2 : 0) + (spi ? 2 : 0)} pins wanted, ${mcu.gpio.length} available)`;
    const p = pool[0]; take(p); i.pins[n.role] = p; rows.push({ pin: p, role: n.role, label: n.label, inst: i.id });
  }
  return { pins: rows, i2c, spi, ads: Math.ceil(adsCh / 4) };
}

function powerPlan(spec: Spec, mcu: McuDef | null, insts: Inst[], ads: number, errors: string[], notes: string[]): PowerPlan {
  const loads: Load[] = insts.flatMap(i => blockById(i.block)!.loads(i));
  if (ads) loads.push({ rail: 'logic', typ: 0.001 * ads, peak: 0.001 * ads, what: `${ads} × ADS1115` });
  const pi = mcu?.kind === 'rpi' ? PI_MODELS[spec.piModel ?? 'Pi 5'] ?? PI_MODELS['Pi 5'] : null;
  const battery0 = spec.power === 'liion' || spec.power === 'aa';
  const mcuOn5 = !!mcu && !(battery0 && mcu.pinBattery && !pi);
  const mcuLoad: Load | null = mcu ? { rail: mcuOn5 ? 'v5' : 'sys', typ: pi ? pi.draw : mcu.typ, peak: pi ? Math.min(pi.recommend, pi.draw * 3) : mcu.peak, what: mcu.kind === 'rpi' ? `Raspberry ${spec.piModel ?? 'Pi 5'}` : mcu.label } : null;
  const v12 = loads.some(l => l.rail === 'v12');
  let source: PowerPlan['source'] = spec.power === 'auto' ? (v12 ? 'adapter12' : 'usb') : spec.power;
  if (v12 && (source === 'usb' || source === 'liion' || source === 'aa' || source === 'adapter5')) { errors.push('A 12 V LED strip needs a 12 V adapter (or mains module); USB and single cells cannot run it.'); source = 'adapter12'; }
  if (pi && (source === 'liion' || source === 'aa')) { errors.push(`A Raspberry Pi needs a 5 V ${pi.recommend} A supply; this designer does not run it from a cell. Use USB-C power, or pick an ESP32 / Pico for battery products.`); source = 'usb'; }
  const battery = source === 'liion' || source === 'aa';
  const sysV = source === 'liion' ? 3.7 : source === 'aa' ? 4.5 : 5;
  for (const i of insts) { i.sysV = sysV; i.logicV = mcu?.logic ?? 3.3; }
  // Logic rail: the board's 3.3 V pin unless it is overloaded (then an LDO from 5 V).
  const logicLoads = loads.filter(l => l.rail === 'logic');
  const logicDesign = logicLoads.reduce((s, l) => s + design(l.typ, l.peak), 0);
  const ldo3 = !!mcu && mcu.logic < 4 && logicDesign > railMax(mcu.kind) * 0.8;
  if (ldo3) notes.push(`3.3 V peripherals need ${(logicDesign * 1000).toFixed(0)} mA, more than the ${mcu!.label}'s 3.3 V pin should give (${railMax(mcu!.kind) * 1000} mA): a separate 600 mA LDO feeds them.`);
  // Which loads land on the 5 V rail (logic and battery-fed boards are counted where they draw).
  const needs5 = loads.some(l => l.rail === 'v5') || mcuOn5 || ldo3;
  const sysIs: PowerPlan['sysIs'] = battery || !mcu ? 'SYS' : 'V5';
  const rows = [...(mcuLoad ? [mcuLoad] : []), ...loads].map(l => ({ what: l.what, rail: l.rail === 'logic' ? (mcu?.logic === 5 ? '5 V' : '3.3 V') : l.rail === 'v5' ? '5 V' : l.rail === 'v12' ? '12 V' : sysIs === 'V5' ? '5 V' : `${sysV} V (switched)`, typ: l.typ, peak: l.peak }));
  const tot = (rail: string) => rows.filter(r => r.rail === rail).reduce((a, r) => ({ typ: a.typ + r.typ, peak: a.peak + r.peak, design: a.design + design(r.typ, r.peak) }), { typ: 0, peak: 0, design: 0 });
  const totals: PowerPlan['totals'] = {}; for (const r of new Set(rows.map(x => x.rail))) totals[r] = tot(r);
  // Current drawn from the 5 V rail: 5 V loads + logic (through the board's linear regulator) + SYS loads when SYS is 5 V.
  const i5 = rows.filter(r => r.rail === '5 V' || (r.rail === '3.3 V' && mcuOn5)).reduce((s, r) => s + design(r.typ, r.peak), 0);
  const iSys = rows.filter(r => r.rail.endsWith('(switched)') || (r.rail === '3.3 V' && !mcuOn5)).reduce((s, r) => s + design(r.typ, r.peak), 0);
  const plan: PowerPlan = { source, summary: '', powerSwitch: battery || !mcu, sysV, sysIs, rows, totals, capacity: {}, notes: [], ldo3 };
  const v5Need = needs5 ? i5 : 0;
  if (source === 'usb') {
    if (!pi && v5Need + iSys > 2.6) { errors.push(`The design wants about ${(v5Need + iSys).toFixed(1)} A at 5 V: more than USB-C gives (3 A). Use a 5 V adapter.`); }
    const I = v5Need + iSys; plan.usbA = pi ? pi.recommend : I <= 0.42 ? 0.5 : I <= 1.25 ? 1.5 : 3;
    plan.summary = plan.usbA === 0.5 ? 'USB 5 V (any port, 500 mA)' : `USB-C 5 V from a charger offering ${plan.usbA} A`;
    if (pi) plan.notes.push(pi.note); else if (plan.usbA > 0.5) plan.notes.push(`Needs a USB-C power adapter that offers 5 V ${plan.usbA} A (a computer port gives only 0.5 A); the USB-C socket needs 5.1 kΩ from each CC pin to ground (most breakout sockets have them).`);
    plan.capacity['5 V'] = plan.usbA;
  } else if (source === 'adapter5') {
    plan.adapterV = 5; plan.adapterA = sizeUp((v5Need + iSys) * 1.3, [1, 2, 3, 4, 5, 6, 8, 10]); plan.fuseA = sizeUp(Math.max(0.5, (v5Need + iSys) * 1.6)); plan.summary = `5 V ${plan.adapterA} A adapter (barrel jack), ${plan.fuseA} A fuse`; plan.capacity['5 V'] = plan.adapterA;
  } else if (source === 'adapter12') {
    const i12 = rows.filter(r => r.rail === '12 V').reduce((s, r) => s + design(r.typ, r.peak), 0); const buckIn = v5Need * 5 / (0.9 * 12);
    plan.adapterV = 12; plan.adapterA = sizeUp((i12 + buckIn) * 1.3, [1, 2, 3, 4, 5, 6, 8, 10]); plan.fuseA = sizeUp(Math.max(0.5, (i12 + buckIn) * 1.6));
    if (needs5) plan.buck = { V: 5, I: v5Need > 1.5 ? 3 : 2 }; plan.summary = `12 V ${plan.adapterA} A adapter, ${plan.fuseA} A fuse${plan.buck ? `, buck to 5 V (${plan.buck.I} A)` : ''}`; plan.capacity['12 V'] = plan.adapterA; if (plan.buck) plan.capacity['5 V'] = plan.buck.I;
  } else if (source === 'mains') {
    plan.mainsV = spec.market === 'EU' ? 230 : 120; const i12 = rows.filter(r => r.rail === '12 V').reduce((s, r) => s + design(r.typ, r.peak), 0);
    if (v12) { const I = sizeUp((i12 + v5Need * 5 / (0.9 * 12)) * 1.3, [0.5, 1, 1.25, 2, 3]); plan.acdc = { V: 12, I }; if (needs5) plan.buck = { V: 5, I: v5Need > 1.5 ? 3 : 2 }; plan.capacity['12 V'] = I; }
    else { plan.acdc = { V: 5, I: sizeUp((v5Need + iSys) * 1.3, [0.6, 1, 2, 3, 4, 6]) }; plan.capacity['5 V'] = plan.acdc.I; }
    plan.fuseA = plan.acdc.V * plan.acdc.I > 20 ? 2 : 1; plan.summary = `${plan.mainsV} V mains through a T${plan.fuseA}A fuse into a certified ${plan.acdc.V} V ${plan.acdc.I} A AC-DC module${plan.buck ? ', buck to 5 V' : ''}`;
  } else {
    // Battery: Li-ion with charger, or 3 × AA; a boost makes 5 V when anything needs it.
    if (source === 'liion') plan.cell = { mAh: 2500, chargeA: 0.4 }; else plan.aa = true;
    if (needs5) {
      const I = sizeUp(v5Need * 1.3, [1, 2]); plan.boost = { V: 5, I }; const iin = v5Need * 5 / (0.85 * 3.2);
      if (v5Need > 1.5 || iin > 2) errors.push(`The 5 V loads want about ${v5Need.toFixed(2)} A; one ${source === 'liion' ? 'Li-ion cell' : 'AA pack'} through a boost converter cannot supply that (${iin.toFixed(1)} A from the battery). Use mains/USB power or fewer motors/servos/pixels.`);
      plan.capacity['5 V'] = I;
    }
    const avg = rows.reduce((s, r) => s + r.typ, 0) * (needs5 ? 5 / (0.85 * sysV) : 1);
    const mAh = source === 'liion' ? 2500 : 2400; plan.notes.push(`Runtime estimate: about ${(mAh / Math.max(1, avg * 1000)).toFixed(1)} h at typical draw from ${source === 'liion' ? 'one 2500 mAh cell' : '3 × AA (2400 mAh)'}.`);
    plan.summary = source === 'liion' ? `One Li-ion cell (2500 mAh) with USB-C charging (0.4 A) and protection${plan.boost ? `, boost to 5 V (${plan.boost.I} A)` : ''}, power switch` : `3 × AA (4.5 V)${plan.boost ? `, boost to 5 V (${plan.boost.I} A)` : ''}, power switch`;
    if (source === 'liion') plan.usbA = 0.5;
  }
  for (const [rail, t] of Object.entries(totals)) { const cap = plan.capacity[rail]; if (cap && t.design > cap) errors.push(`${rail} rail: about ${t.design.toFixed(2)} A wanted from a ${cap} A source.`); }
  return plan;
}

export function plan(spec: Spec): Plan {
  const errors: string[] = []; const notes: string[] = []; const insts = instances(spec, errors);
  const needMcu = insts.some(i => blockById(i.block)!.needsMcu(i.opt)) || spec.conn.length > 0 || (spec.mcu !== 'auto' && spec.mcu !== 'none');
  if (!insts.length) errors.push('Nothing to build yet: no blocks were recognised.');
  let mcu: McuDef | null = null; let alloc: Exclude<ReturnType<typeof allocate>, string> = { pins: [], ads: 0 }; const tried: string[] = [];
  if (needMcu) {
    if (spec.mcu === 'none') errors.push('These functions need a controller board; pick one (or Auto).');
    else {
      for (const k of candidates(spec)) {
        for (const i of insts) { i.pins = {}; }
        const r = allocate(MCUS[k], insts, spec); if (typeof r === 'string') { tried.push(r); continue; }
        mcu = MCUS[k]; alloc = r; break;
      }
      if (!mcu) errors.push(...tried.map(t => `${t}.`));
    }
  }
  for (const i of insts) i.mcu = mcu;
  const power = powerPlan(spec, mcu, insts, alloc.ads, errors, notes);
  return { errors, notes, mcu, insts, pins: alloc.pins, i2c: alloc.i2c, spi: alloc.spi, ads: alloc.ads, power, logicV: mcu?.logic ?? 3.3, tried };
}
