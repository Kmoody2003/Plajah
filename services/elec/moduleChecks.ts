// Checks for the breakout modules in modules.ts and for logic levels on board pins: supply range,
// regulator current / dropout / heat, charger current against the cell, H-bridge channel current,
// a 5 V signal reaching a 3.3 V pin, and the regulatory pre-check for relay contacts.
// Called from checkCircuit; same Finding shape. Released by Plajah as public domain (CC0).

import type { Circuit } from './circuit';
import { netlist } from './circuit';
import type { SimResult } from './sim';
import { BOARD_INFO } from './boards';
import { MODULES, num, type ModuleFinding } from './modules';

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const peak = (a: number[]) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const f = (v: number, u: string) => (Math.abs(v) >= 1 ? `${+v.toPrecision(3)} ${u}` : `${+(v * 1000).toPrecision(3)} m${u}`);

export function moduleFindings(c: Circuit, sim: SimResult | null | undefined, o: { market?: 'US' | 'EU' | 'both'; ambient?: number } = {}): ModuleFinding[] {
  const out: ModuleFinding[] = []; const ambient = o.ambient ?? 25; const add = (x: ModuleFinding) => out.push(x);
  const parts = c.parts.filter(p => MODULES[p.kind]);
  if (sim) {
    const nl = sim.netlist;
    for (const p of parts) {
      const info = MODULES[p.kind]; const tr = sim.parts[p.id]; if (!tr) continue; const pp = p.params;
      if (info.supply) {
        const vs = mean(tr.extra.vsup ?? [0]);
        if (vs < info.supply.min - 0.05) add({ id: `msup-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} under-powered: ${f(vs, 'V')} on ${info.supply.pin}`, detail: `It needs ${info.supply.min}-${info.supply.max} V.` });
        else if (vs > info.supply.max + 0.05) add({ id: `msup-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} over-voltage: ${f(vs, 'V')} on ${info.supply.pin}`, detail: `Rated ${info.supply.min}-${info.supply.max} V; it will be damaged.` });
        else add({ id: `msup-${p.ref}`, level: 'pass', area: 'Stress', refs: [p.ref], title: `${p.ref} supply ${f(vs, 'V')}`, detail: `Within ${info.supply.min}-${info.supply.max} V.` });
      }
      const reg = info.model.reg;
      if (reg) {
        const iout = mean(tr.extra.iout ?? [0]), vin = mean(tr.extra.vin ?? [0]), vout = mean(tr.extra.vout ?? [0]), iin = mean(tr.extra.iin ?? [0]); const lim = info.limits?.Iout?.(pp) ?? Infinity; const vset = reg.V(pp);
        if (iout > lim) add({ id: `reg-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} overloaded: ${f(iout, 'A')} from a ${f(lim, 'A')} regulator`, detail: 'Use a bigger regulator or split the load onto its own supply.' });
        else if (iout > lim * 0.8) add({ id: `reg-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} at ${Math.round(iout / lim * 100)}% of its rating`, detail: 'Little headroom for start-up surges.' });
        else add({ id: `reg-${p.ref}`, level: 'pass', area: 'Stress', refs: [p.ref], title: `${p.ref} delivers ${f(iout, 'A')} at ${f(vout, 'V')}`, detail: `Rated ${f(lim, 'A')}; draws ${f(iin, 'A')} from ${f(vin, 'V')}.` });
        const vmax = info.limits?.vinMax?.(pp); if (vmax && vin > vmax) add({ id: `regvin-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} input ${f(vin, 'V')} above ${vmax} V`, detail: 'Over its absolute input rating.' });
        if (vout < vset * 0.95 && vin > 0.5) add({ id: `regdrop-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} cannot hold ${vset} V (${f(vout, 'V')} out)`, detail: reg.boost ? 'Input is above the output: a boost converter passes the input through.' : `It needs about ${+(vset + reg.dropout(pp)).toFixed(2)} V in; it has ${f(vin, 'V')}.` });
        const theta = info.limits?.theta; if (theta) { const pd = Math.max(0, (vin - vout) * iout); const tj = ambient + pd * theta; add({ id: `regtj-${p.ref}`, level: tj > 125 ? 'error' : tj > 100 ? 'warn' : 'pass', area: 'Thermal', refs: [p.ref], title: `${p.ref} junction about ${Math.round(tj)} °C`, detail: `${f(pd, 'W')} × ${theta} °C/W over ${ambient} °C (limit 125 °C). Linear regulators turn the voltage difference into heat.` }); }
        const iinMax = info.limits?.Iin; if (iinMax && iin > iinMax) add({ id: `regiin-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} input current ${f(iin, 'A')} over its ${iinMax} A switch limit`, detail: 'A boost converter draws more current than it delivers; lower the 5 V load.' });
      }
      if (p.kind === 'charger' || p.kind === 'charger2s') {
        const ich = num(pp, 'Icharge', p.kind === 'charger2s' ? 1 : 0.4); const cellPart = c.parts.find(q => q.kind === 'liion'); const mAh = cellPart ? num(cellPart.params, 'mAh', 2500) : 0;
        const ichMax = info.limits?.Ich ?? 1; if (ich > ichMax) add({ id: `chg-${p.ref}`, level: 'error', area: 'Battery', refs: [p.ref], title: `${p.ref} charge current ${f(ich, 'A')} above ${ichMax} A`, detail: 'Above what this charger class can deliver.' });
        else if (mAh && ich * 1000 > mAh) add({ id: `chg-${p.ref}`, level: 'warn', area: 'Battery', refs: [p.ref], title: `${p.ref} charges faster than 1C`, detail: `${f(ich, 'A')} into ${mAh} mAh; most cells want 0.5C or less. Raise R_PROG.` });
        else add({ id: `chg-${p.ref}`, level: 'pass', area: 'Battery', refs: [p.ref], title: `${p.ref} charges at ${f(ich, 'A')}`, detail: `${mAh ? `${(ich * 1000 / mAh).toFixed(2)}C for a ${mAh} mAh cell; ` : ''}R_PROG ${pp.Rprog ?? '3k'}.` });
      }
      if (p.kind === 'hbridge') { const lim = info.limits?.Iout?.(pp) ?? 1.2; const w = Math.max(...['AO1', 'AO2', 'BO1', 'BO2'].map(k => peak(tr.extra[`out:${k}`] ?? []))); add({ id: `hb-${p.ref}`, level: w > lim ? 'error' : w > lim * 0.8 ? 'warn' : 'pass', area: 'Stress', refs: [p.ref], title: `${p.ref} channel current ${f(w, 'A')}`, detail: `DRV8833 channels are good for ${lim} A continuous (1.5 A peak, current-limited).` }); }
    }
    // Logic levels on board pins: a 5 V signal on a 3.3 V GPIO.
    for (const b of c.parts.filter(q => BOARD_INFO[q.kind])) {
      const info = BOARD_INFO[b.kind]; const gn = nl.pinNet[b.id]?.GND ?? 0; let worst = 0, wp = '';
      for (const g of info.gpio) { const n = nl.pinNet[b.id]?.[g]; if (n === undefined || nl.members[n].length < 2) continue; const v = mean(sim.nets[n] ?? [0]) - mean(sim.nets[gn] ?? [0]); if (v > worst) { worst = v; wp = g; } }
      if (worst > info.logic + 0.3) add({ id: `level-${b.ref}`, level: 'error', area: 'Stress', refs: [b.ref], title: `${b.ref} ${wp} sees ${f(worst, 'V')}`, detail: `${b.ref} pins are ${info.logic} V logic and not tolerant of more. Add a divider (1k / 2k) or a level shifter, or power the module from ${info.logic} V.` });
      else if (wp) add({ id: `level-${b.ref}`, level: 'pass', area: 'Stress', refs: [b.ref], title: `${b.ref} pin levels within ${info.logic} V logic`, detail: `Highest ${wp} at ${f(worst, 'V')}.` });
    }
  }
  const relays = parts.filter(p => p.kind === 'relay');
  if (relays.length) add({ id: 'relay-contacts', level: 'warn', area: 'Regulatory', refs: relays.map(p => p.ref), cite: 'UL/IEC 62368-1 §5.4 (clearance and creepage); IEC 61810-1; 29 CFR 1910.303', title: 'Relay contacts: the load side sets the rules', detail: 'Switching under 30 V keeps the product low-voltage. Switching mains makes it mains equipment: reinforced insulation (at least 6 mm creepage) between coil and contacts, a fused line, a closed flame-rated enclosure, and listing (US NRTL) or LVD/CE (EU) before anyone else uses it.' });
  void netlist;
  return out;
}
