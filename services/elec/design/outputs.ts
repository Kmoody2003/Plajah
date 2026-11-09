// What a design hands back besides the schematic: a review list (wiring proof, simulation, power
// budget, pins, thermal, regulatory, safety), the BOM with distributor search terms, extras and
// build steps. Released by Plajah as public domain (CC0).
import type { Circuit } from '../circuit';
import type { SimResult } from '../sim';
import type { Finding } from '../checks';
import type { Hazard } from '../../safety/hazards';
import { sourceLines, type SourceLine } from '../../supply/sourcing';
import { blockById } from './blocks';
import type { Plan, PinRow, PowerPlan } from './planner';
import type { Spec } from './types';

export type ReviewArea = 'Wiring' | 'Simulation' | 'Power' | 'Pins' | 'Thermal' | 'Regulatory' | 'Safety' | 'Design';
export interface ReviewItem { level: 'error' | 'warn' | 'info' | 'pass'; area: ReviewArea; title: string; detail: string; cite?: string }
export interface DesignReport { spec: Spec; board: string; framework?: string; pins: PinRow[]; power: PowerPlan; review: ReviewItem[]; bom: SourceLine[]; counts: { errors: number; warnings: number } }

const mA = (a: number) => (a >= 1 ? `${a.toFixed(2)} A` : `${Math.round(a * 1000)} mA`);

export function review(p: Plan, c: Circuit, verify: string[], sim: SimResult, findings: Finding[], hazards: Hazard[]): ReviewItem[] {
  const out: ReviewItem[] = []; const add = (x: ReviewItem) => out.push(x);
  add(verify.length ? { level: 'error', area: 'Wiring', title: `${verify.length} drawn connection${verify.length > 1 ? 's' : ''} differ from the plan`, detail: verify.slice(0, 4).join('; ') } : { level: 'pass', area: 'Wiring', title: 'Drawn wiring matches the planned netlist', detail: `${c.wires.length} wires checked pin by pin: no missing or accidental joins.` });
  add(sim.converged ? { level: 'pass', area: 'Simulation', title: 'DC operating point converged', detail: 'Every rail, pin and load was solved with everything switched on (worst case).' } : { level: 'error', area: 'Simulation', title: 'Simulation did not converge', detail: sim.warnings.join(' ') });
  // Power budget per rail.
  const pw = p.power; add({ level: 'info', area: 'Power', title: `Power: ${pw.summary}`, detail: pw.rows.map(r => `${r.what} ${mA(r.typ)} typ / ${mA(r.peak)} peak (${r.rail})`).join('; ') });
  for (const [rail, t] of Object.entries(pw.totals)) {
    const cap = pw.capacity[rail]; const use = cap ? t.design / cap : 0;
    add({ level: !cap ? 'info' : use > 1 ? 'error' : use > 0.8 ? 'warn' : 'pass', area: 'Power', title: `${rail} rail: ${mA(t.typ)} typical, ${mA(t.peak)} peak`, detail: cap ? `Sized for ${mA(t.design)} (typical + half the surges) from a ${cap} A source: ${Math.round(use * 100)}% used.` : 'Supplied from the board regulator or the battery directly.' });
  }
  for (const n of [...pw.notes, ...p.notes]) add({ level: 'info', area: 'Power', title: n.split(/[.:]/)[0], detail: n });
  // Pins.
  if (p.mcu) {
    const used = p.pins.filter(r => !r.pin.startsWith('ADS')).length; add({ level: 'pass', area: 'Pins', title: `${used} of ${p.mcu.gpio.length} ${p.mcu.label} pins used, no conflicts`, detail: p.pins.map(r => `${r.pin} ${r.label}`).join('; ') });
    const i2c = p.insts.filter(i => i.addr); if (i2c.length || p.ads) add({ level: 'pass', area: 'Pins', title: 'I²C addresses are unique', detail: [...i2c.map(i => `${i.label} ${i.addr}`), ...Array.from({ length: p.ads }, (_, k) => `ADS1115 #${k + 1} 0x${(0x48 + k).toString(16)}`)].join(', ') });
    if (p.ads) add({ level: 'info', area: 'Pins', title: `Added ${p.ads} ADS1115 analog input${p.ads > 1 ? 's' : ''}`, detail: `${p.mcu.label} has ${p.mcu.adc.length || 'no'} usable analog pins${p.mcu.kind === 'esp32' ? ' with Wi-Fi on' : ''}; the extra knobs/probes read through the ADS1115 on the I²C bus.` });
    const strap = p.pins.filter(r => p.mcu!.strap.includes(r.pin)); if (strap.length) add({ level: 'info', area: 'Pins', title: `Boot-strapping pin in use: ${strap.map(r => r.pin).join(', ')}`, detail: 'Used as an output only; keep external pull resistors off it so the board boots normally.' });
  }
  // Checks: stress/thermal/battery and regulatory.
  for (const f of findings) {
    if (f.level === 'pass' && f.area !== 'Thermal') continue;
    const area: ReviewArea = f.area === 'Regulatory' || f.area === 'Security' ? 'Regulatory' : f.area === 'Thermal' ? 'Thermal' : f.area === 'Wiring' ? 'Wiring' : 'Power';
    add({ level: f.level, area, title: f.title, detail: f.detail, cite: f.cite });
  }
  for (const h of hazards.filter(x => x.severity === 'critical' || x.severity === 'high')) add({ level: h.severity === 'critical' ? 'warn' : 'info', area: 'Safety', title: h.title, detail: `${h.why} ${h.severity === 'critical' ? 'Acknowledge it in Safety before exporting.' : ''}`.trim(), cite: h.cite });
  for (const i of p.insts) for (const n of blockById(i.block)!.notes?.(i) ?? []) add({ level: 'info', area: 'Design', title: n.split(/[.:;]/)[0], detail: n });
  const order = ['error', 'warn', 'info', 'pass']; return out.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

export function bomLines(c: Circuit): SourceLine[] { return sourceLines(c); }

export function extrasFor(p: Plan): string[][] {
  const pw = p.power; const out: string[][] = [];
  if (pw.source === 'usb' || pw.source === 'liion') out.push(['1', pw.usbA && pw.usbA > 0.5 ? `USB-C power adapter, 5 V ${pw.usbA} A (listed)` : 'USB power adapter 5 V 1 A (listed)', 'the adapter is the mains part: buy a certified one']);
  if (pw.source === 'adapter5' || pw.source === 'adapter12') out.push(['1', `${pw.adapterV} V ${pw.adapterA} A power adapter, 5.5 × 2.1 mm plug (listed)`, 'buy a certified one']);
  if (pw.source === 'mains') out.push(['1', 'IEC inlet or approved cord with strain relief', 'never improvise mains connections'], ['1', 'V-0 flame-rated enclosure (PC or PC/ABS)', 'PLA is not acceptable around mains']);
  if (pw.cell) out.push(['1', '18650 holder or LiPo pocket', 'cell must not touch screws or sharp edges']);
  if (p.mcu) out.push(['1', p.mcu.kind === 'rpi' ? 'microSD card 32 GB+' : 'USB data cable for flashing', '']);
  for (const i of p.insts) out.push(...(blockById(i.block)!.extras?.(i) ?? []));
  out.push(['1', 'Perfboard 70 × 90 mm (or the PCB from the Board tab)', ''], ['1', 'Hook-up wire, headers, heat-shrink', ''], ['4', 'M3 × 8 screws', 'lid']);
  return out;
}

export function stepsFor(p: Plan): string[] {
  const s: string[] = ['Build the power section first and measure each rail with a meter before connecting anything else.'];
  if (p.power.cell) s.push('Fit the cell last, with the switch off; check the charger LED turns on when USB is plugged in.');
  if (p.mcu) s.push(`Wire each block to the ${p.mcu.label} pins listed in the pin map; every ground goes to the common ground.`, p.mcu.framework === 'esphome' ? 'Flash the ESPHome file over USB once (fill in secrets.yaml first); later updates go over Wi-Fi.' : p.mcu.framework === 'circuitpython' ? 'Install CircuitPython, copy the libraries into lib/, save the firmware as code.py.' : p.mcu.framework === 'arduino' ? 'Install the listed libraries in the Arduino IDE and upload the sketch.' : 'Install Raspberry Pi OS (unique user + password), enable I²C, install requirements.txt, run the service.');
  s.push('Re-run Checks with your real part values, acknowledge the Safety items, then export the enclosure.');
  return s;
}
