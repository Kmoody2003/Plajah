// Design checks: wiring (ERC), electrical stress against each part's ratings (from a simulation),
// battery life, and regulatory pre-checks. Regulatory items are written in our own words and cite
// the public regulation by section so the designer can read the source; they are pre-checks to
// design with compliance in mind, not a certification or legal advice.

import { compByKind, parseSi } from './components';
import { type Circuit, netlist } from './circuit';
import { type SimResult, boardDraw } from './sim';
import { BOARD_INFO, PI_MODELS } from './boards';
import { MODULES } from './modules';
import { moduleFindings } from './moduleChecks';

export type Level = 'error' | 'warn' | 'info' | 'pass';
export interface Finding { id: string; level: Level; area: 'Wiring' | 'Stress' | 'Thermal' | 'Battery' | 'Regulatory' | 'Security'; title: string; detail: string; refs?: string[]; cite?: string; market?: 'US' | 'EU' | 'UK' }
export interface CheckOptions { market?: 'US' | 'EU' | 'both'; ambient?: number; toy?: boolean }

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const peak = (a: number[]) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const fmt = (v: number, unit: string) => {
  const a = Math.abs(v); if (a >= 1) return `${+v.toPrecision(3)} ${unit}`; if (a >= 1e-3) return `${+(v * 1e3).toPrecision(3)} m${unit}`; if (a >= 1e-6) return `${+(v * 1e6).toPrecision(3)} µ${unit}`; return `0 ${unit}`;
};

export function checkCircuit(c: Circuit, sim?: SimResult | null, o: CheckOptions = {}): Finding[] {
  const out: Finding[] = []; const market = o.market ?? 'both'; const ambient = o.ambient ?? 25;
  const us = market !== 'EU', eu = market !== 'US';
  const nl = netlist(c); const parts = c.parts.filter(p => p.kind !== 'ground');
  const P = (p: typeof parts[number], k: string) => parseSi(p.params[k] ?? compByKind(p.kind)!.params.find(x => x.key === k)?.default ?? NaN);
  const add = (f: Finding) => out.push(f);
  const has = (k: string) => parts.some(p => p.kind === k);

  // ---- Wiring ----
  if (!parts.length) return [{ id: 'empty', level: 'info', area: 'Wiring', title: 'Nothing to check yet', detail: 'Place some parts and wire them up.' }];
  if (!nl.hasGround) add({ id: 'no-ground', level: 'warn', area: 'Wiring', title: 'No ground symbol', detail: 'Add a ground symbol to the negative side of your supply so voltages have a reference.' });
  for (const p of parts) {
    const def = compByKind(p.kind)!;
    for (const pin of def.pins) {
      const n = nl.pinNet[p.id]?.[pin.name]; if (n === undefined) continue;
      if (n !== 0 && nl.members[n].length === 1 && !BOARD_INFO[p.kind] && !MODULES[p.kind]?.model.free?.includes(pin.name)) { // unused board pins are normal
        const optional = p.kind === 'ne555' && pin.name === 'CTRL';
        add({ id: `open-${p.ref}-${pin.name}`, level: optional ? 'info' : p.kind === 'ne555' && pin.name === 'RESET' ? 'warn' : 'error', area: 'Wiring', refs: [p.ref],
          title: `${p.ref} pin ${pin.name} is not connected`, detail: optional ? 'The 555 control pin can float, but a 10 nF capacitor to ground makes the timing steadier.' : p.kind === 'ne555' && pin.name === 'RESET' ? 'Tie RESET to the supply, or the 555 may reset at random.' : 'An unconnected pin usually means a missing wire.' });
      }
    }
    if (['battery', 'coincell', 'liion', 'usb5v', 'dcsupply', 'mains'].includes(p.kind)) {
      const nets = Object.values(nl.pinNet[p.id] ?? {}); if (nets.length === 2 && nets[0] === nets[1]) add({ id: `short-${p.ref}`, level: 'error', area: 'Wiring', refs: [p.ref], title: `${p.ref} is shorted`, detail: 'Both supply terminals are on the same net. A real supply would overheat or blow.' });
    }
  }

  // ---- Stress (needs a simulation) ----
  if (sim) {
    if (!sim.converged) add({ id: 'sim-nc', level: 'warn', area: 'Stress', title: 'Simulation did not fully converge', detail: sim.warnings.join(' ') || 'Results may be incomplete.' });
    const tran = sim.mode === 'tran';
    const pass = (ref: string, what: string) => add({ id: `ok-${ref}`, level: 'pass', area: 'Stress', refs: [ref], title: `${ref} within ratings`, detail: what });
    for (const p of parts) {
      const tr = sim.parts[p.id]; if (!tr) continue;
      const Iavg = Math.abs(mean(tr.i)), Ipk = peak(tr.i), Pavg = Math.abs(mean(tr.p));
      const avgWord = tran ? 'average' : 'steady';
      switch (p.kind) {
        case 'resistor': case 'potentiometer': {
          const rating = P(p, 'P');
          if (Pavg > rating) add({ id: `r-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} overloaded: ${fmt(Pavg, 'W')} in a ${fmt(rating, 'W')} part`, detail: `Use at least a ${rating < 0.5 ? '1/2' : rating < 1 ? '1' : rating < 2 ? '2' : '5'} W resistor, or raise the resistance.` });
          else if (Pavg > rating * 0.5) add({ id: `r-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} runs hot: ${fmt(Pavg, 'W')} of ${fmt(rating, 'W')}`, detail: 'Good practice keeps resistors under half their rating (50% derating) so they last and stay cool.' });
          else pass(p.ref, `${fmt(Pavg, 'W')} ${avgWord}, rated ${fmt(rating, 'W')}.`);
          break;
        }
        case 'led': {
          const rated = P(p, 'If'); const vr = peak((tr.extra.vr ?? []).map(v => Math.max(0, v)));
          if (Ipk > rated * 1.5) add({ id: `led-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} current ${fmt(Ipk, 'A')} is past the absolute maximum`, detail: `Typical LEDs allow ${fmt(rated, 'A')} continuous and about ${fmt(rated * 1.5, 'A')} absolute maximum. Add or raise the series resistor: R ≈ (Vsupply − Vf) / ${fmt(rated, 'A')}.` });
          else if (Iavg > rated) add({ id: `led-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} runs above its rated current (${fmt(Iavg, 'A')})`, detail: 'It will be bright but will dim and fail early. Raise the series resistor.' });
          else if (Iavg < 0.5e-3 && !tran) add({ id: `led-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} is barely lit (${fmt(Iavg, 'A')})`, detail: 'Check polarity (anode to the positive side) and the series resistor.' });
          else pass(p.ref, `${fmt(Iavg, 'A')} ${avgWord}${tran ? `, ${fmt(Ipk, 'A')} peak` : ''}, rated ${fmt(rated, 'A')}.`);
          if (vr > 5) add({ id: `ledrev-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} sees ${fmt(vr, 'V')} reverse`, detail: 'LEDs typically tolerate only 5 V in reverse. Add a diode in series or across it.' });
          break;
        }
        case 'diode': {
          const rect = p.params.type === 'rectifier'; const iMax = rect ? 1 : 0.2, vrMax = rect ? 1000 : 75; const vr = peak((tr.extra.vr ?? []).map(v => Math.max(0, v)));
          if (Iavg > iMax) add({ id: `d-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} carries ${fmt(Iavg, 'A')}, above ${fmt(iMax, 'A')}`, detail: rect ? 'Use a 3 A rectifier (1N5400-class).' : 'Use a rectifier diode (1N4007-class) for currents this large.' });
          else if (vr > vrMax * 0.8) add({ id: `d-${p.ref}`, level: vr > vrMax ? 'error' : 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} reverse voltage ${fmt(vr, 'V')}`, detail: `Rated ${vrMax} V; keep under 80%.` });
          else pass(p.ref, `${fmt(Iavg, 'A')} ${avgWord}, ${fmt(vr, 'V')} reverse peak.`);
          break;
        }
        case 'capacitor': case 'electrolytic': {
          const vRating = P(p, 'V'); const v = tr.extra.v ?? []; const vpk = peak(v); const vmin = v.length ? Math.min(...v) : 0;
          if (p.kind === 'electrolytic' && vmin < -0.5) add({ id: `crev-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} is reverse-biased (${fmt(vmin, 'V')})`, detail: 'Electrolytic capacitors can vent or burst when reversed. Flip it so + faces the higher voltage.' });
          if (vpk > vRating) add({ id: `c-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} sees ${fmt(vpk, 'V')}, above its ${vRating} V rating`, detail: 'Choose a higher voltage rating.' });
          else if (vpk > vRating * 0.8) add({ id: `c-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} at ${Math.round(vpk / vRating * 100)}% of its voltage rating`, detail: 'Keep capacitors under 80% of rated voltage; electrolytics last much longer with margin.' });
          else pass(p.ref, `${fmt(vpk, 'V')} peak, rated ${vRating} V.`);
          break;
        }
        case 'npn': {
          const vce = peak(tr.extra.vce ?? []);
          if (Ipk > 0.2 || vce > 40 || Pavg > 0.625) add({ id: `q-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} beyond a small-signal transistor`, detail: `Ic ${fmt(Ipk, 'A')} (max 200 mA), Vce ${fmt(vce, 'V')} (max 40 V), ${fmt(Pavg, 'W')} (max 625 mW). Use a power transistor or a logic-level MOSFET.` });
          else if (Ipk > 0.15 || Pavg > 0.3) add({ id: `q-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} close to its limits`, detail: `Ic ${fmt(Ipk, 'A')} peak, ${fmt(Pavg, 'W')}.` });
          else pass(p.ref, `Ic ${fmt(Ipk, 'A')} peak, ${fmt(Pavg, 'W')} ${avgWord}.`);
          break;
        }
        case 'nmos': {
          const vds = peak(tr.extra.vds ?? []);
          if (Ipk > 2 || vds > 30) add({ id: `m-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} past its ratings`, detail: `Id ${fmt(Ipk, 'A')} (max 2 A), Vds ${fmt(vds, 'V')} (max 30 V).` });
          else pass(p.ref, `Id ${fmt(Ipk, 'A')} peak.`);
          break;
        }
        case 'reg7805': {
          const theta = P(p, 'theta'); const tj = ambient + Pavg * theta; const vin = mean(tr.extra.vin ?? [0]);
          if (Iavg > 1) add({ id: `u-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} asked for ${fmt(Iavg, 'A')}`, detail: '7805-class regulators supply up to 1 A.' });
          if (tj > 125) add({ id: `tj-${p.ref}`, level: 'error', area: 'Thermal', refs: [p.ref], title: `${p.ref} would reach ${Math.round(tj)} °C`, detail: `It dissipates ${fmt(Pavg, 'W')}. Above 125 °C it shuts down. Add a heatsink (lower °C/W), lower the input voltage, or use a switching regulator.` });
          else if (tj > 100) add({ id: `tj-${p.ref}`, level: 'warn', area: 'Thermal', refs: [p.ref], title: `${p.ref} runs hot: about ${Math.round(tj)} °C`, detail: `${fmt(Pavg, 'W')} × ${theta} °C/W over ${ambient} °C ambient. A small heatsink adds margin.` });
          else add({ id: `tj-${p.ref}`, level: 'pass', area: 'Thermal', refs: [p.ref], title: `${p.ref} junction about ${Math.round(tj)} °C`, detail: `${fmt(Pavg, 'W')} × ${theta} °C/W over ${ambient} °C ambient (limit 125 °C).` });
          if (vin < 7) add({ id: `drop-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} is in dropout (${fmt(vin, 'V')} in)`, detail: 'A 7805 needs about 7 V in to hold 5 V out. Raise the input or use a low-dropout regulator.' });
          break;
        }
        case 'ne555': {
          const nets = nl.pinNet[p.id] ?? {}; const vcc = Math.abs(mean(sim.nets[nets.VCC ?? 0] ?? [0]) - mean(sim.nets[nets.GND ?? 0] ?? [0]));
          if (vcc > 16) add({ id: `u-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} supply ${fmt(vcc, 'V')} is above 16 V`, detail: 'Bipolar 555s run from 4.5 to 16 V.' });
          else if (vcc < 4.5) add({ id: `u-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} supply ${fmt(vcc, 'V')} is low`, detail: 'Below 4.5 V use a CMOS 555 (7555 / TLC555-class).' });
          else pass(p.ref, `Supply ${fmt(vcc, 'V')}${sim.freq[p.id] ? `, running at ${sim.freq[p.id] >= 1000 ? `${(sim.freq[p.id] / 1000).toPrecision(3)} kHz` : `${sim.freq[p.id].toPrecision(3)} Hz`}` : ''}.`);
          break;
        }
        case 'speaker': {
          const rating = P(p, 'P');
          if (Pavg > rating) add({ id: `ls-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} gets ${fmt(Pavg, 'W')}, rated ${fmt(rating, 'W')}`, detail: 'The voice coil will overheat. Add series resistance or lower the drive.' });
          else pass(p.ref, `${fmt(Pavg, 'W')} ${avgWord}, rated ${fmt(rating, 'W')}.`);
          break;
        }
        case 'switch': case 'fuse': case 'inductor': {
          const rating = P(p, 'I');
          if (p.kind === 'fuse' && Iavg > rating) add({ id: `f-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} would blow (${fmt(Iavg, 'A')} through a ${fmt(rating, 'A')} fuse)`, detail: 'Pick a fuse about 1.5 to 2 times the normal current.' });
          else if (Iavg > rating) add({ id: `i-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} carries ${fmt(Iavg, 'A')}, rated ${fmt(rating, 'A')}`, detail: 'Choose a part with a higher current rating.' });
          else if (p.kind === 'fuse' && Iavg < rating / 10) add({ id: `f-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} is oversized`, detail: `Normal current is ${fmt(Iavg, 'A')}; a ${fmt(rating, 'A')} fuse may not protect the circuit.` });
          break;
        }
        case 'usb5v': { const lim = P(p, 'Imax');
          if (Iavg > lim) add({ id: `usb-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} draws ${fmt(Iavg, 'A')}, over the ${fmt(lim, 'A')} port limit`, detail: 'A standard USB 2.0 port gives 500 mA by default. More needs a charger that advertises it (USB Battery Charging or USB Power Delivery) or a separate supply.' });
          else if (Iavg > lim * 0.8) add({ id: `usb-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} uses ${Math.round(Iavg / lim * 100)}% of the port`, detail: 'Little headroom for inrush or a weak port.' });
          else pass(p.ref, `Draws ${fmt(Iavg, 'A')} of ${fmt(lim, 'A')}.`);
          break; }
        case 'pico': case 'esp32': case 'nano': case 'rpi': {
          const info = BOARD_INFO[p.kind]; const name = p.kind === 'rpi' ? String(p.params.model ?? 'Raspberry Pi') : compByKind(p.kind)!.name;
          const vsup = mean(tr.extra.vsup ?? [0]);
          const minV = p.kind === 'pico' ? 1.8 : p.kind === 'nano' ? 4.5 : 4.75;
          if (vsup < minV) add({ id: `bpwr-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} under-powered: ${fmt(vsup, 'V')} on ${info.power}`, detail: `${name} needs at least ${minV} V on ${info.power}${p.kind === 'rpi' ? ' (below about 4.63 V it flags under-voltage and throttles)' : ''}.` });
          else if (p.kind !== 'pico' && vsup > 5.5) add({ id: `bpwr-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} over-voltage: ${fmt(vsup, 'V')} on ${info.power}`, detail: `${info.power} expects a regulated 5 V.` });
          let worst = 0, worstPin = '', total = 0;
          for (const g of info.gpio) { const a = peak(tr.extra[`gpio:${g}`] ?? []); total += a; if (a > worst) { worst = a; worstPin = g; } }
          if (worst > info.pinMax * 1.05) add({ id: `gpio-${p.ref}`, level: worst > info.pinMax * 2 ? 'error' : 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} ${worstPin} sources ${fmt(worst, 'A')}`, detail: `${name} pins are good for about ${fmt(info.pinMax, 'A')}. Use a larger series resistor, or switch the load with a transistor or MOSFET.` });
          else if (total > 0) pass(p.ref, `GPIO loads within limits (worst ${worstPin} ${fmt(worst, 'A')}).`);
          const i33 = peak(tr.extra.i3v3 ?? []);
          if (i33 > info.rail3v3Max) add({ id: `r33-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} 3V3 pin overloaded (${fmt(i33, 'A')})`, detail: `The board's 3.3 V output is good for about ${fmt(info.rail3v3Max, 'A')}; power big loads from the 5 V supply directly.` });
          if (p.kind === 'esp32') add({ id: `burst-${p.ref}`, level: 'info', area: 'Stress', refs: [p.ref], title: 'Wi-Fi bursts', detail: 'ESP32 radio transmit pulls about 250 mA peaks. Keep the supply able to deliver 500 mA and put 10-100 µF near the module.' });
          if (p.kind === 'rpi') {
            const m = PI_MODELS[String(p.params.model ?? 'Pi 5')]; const supply = c.parts.find(s => (s.kind === 'usb5v' || s.kind === 'dcsupply' || s.kind === 'acdc') && Object.values(nl.pinNet[s.id] ?? {}).includes(nl.pinNet[p.id]?.['5V'] ?? -1));
            const lim = supply ? P(supply, supply.kind === 'acdc' ? 'I' : 'Imax') : NaN;
            if (m && Number.isFinite(lim) && lim < m.recommend) add({ id: `pisup-${p.ref}`, level: lim < m.draw * 2 ? 'error' : 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} supply ${fmt(lim, 'A')} is under the recommended ${m.recommend} A`, detail: m.note });
            else if (m) pass(p.ref, `Supply meets the recommended ${m.recommend} A. ${m.note}`);
          }
          void boardDraw;
          break;
        }
        case 'amp': {
          const vo = tr.extra.vout ?? []; const rms = Math.sqrt(mean(vo.map(x => x * x))); const vcc = mean(tr.extra.vcc ?? [0]);
          const spk = c.parts.find(s => s.kind === 'speaker'); const R = spk ? P(spk, 'R') : 8; const Pout = rms * rms / R;
          if (vcc > 5.5) add({ id: `amp-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} supply ${fmt(vcc, 'V')} is above 5.5 V`, detail: 'PAM8302-class amplifiers run from 2.5 to 5.5 V.' });
          else if (tran) pass(p.ref, `About ${fmt(Pout, 'W')} into ${R} Ω at this input level (rated ${fmt(P(p, 'P'), 'W')}).`);
          break;
        }
        case 'acdc': {
          const rated = P(p, 'I');
          if (Iavg > rated) add({ id: `psu-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} overloaded: ${fmt(Iavg, 'A')} from a ${fmt(rated, 'A')} module`, detail: 'Pick a larger module or reduce the load.' });
          else if (Iavg > rated * 0.8) add({ id: `psu-${p.ref}`, level: 'warn', area: 'Stress', refs: [p.ref], title: `${p.ref} at ${Math.round(Iavg / rated * 100)}% of rating`, detail: 'Sealed modules run hot near full load; 80% is a comfortable ceiling.' });
          else pass(p.ref, `${fmt(Iavg, 'A')} of ${fmt(rated, 'A')}.`);
          break;
        }
        case 'dcsupply': { const lim = P(p, 'Imax'); if (Iavg > lim) add({ id: `dc-${p.ref}`, level: 'error', area: 'Stress', refs: [p.ref], title: `${p.ref} overloaded`, detail: `Draws ${fmt(Iavg, 'A')}, supply limit ${fmt(lim, 'A')}.` }); break; }
        case 'battery': case 'coincell': case 'liion': {
          const mAh = P(p, 'mAh'); const mA = Iavg * 1000;
          if (mA > 0.001) { const h = mAh / mA; add({ id: `life-${p.ref}`, level: p.kind === 'coincell' && mA > 3 ? 'warn' : 'info', area: 'Battery', refs: [p.ref], title: `${p.ref} lasts about ${h >= 48 ? `${Math.round(h / 24)} days` : `${h.toPrecision(2)} hours`}`, detail: `${mAh} mAh at ${fmt(Iavg, 'A')} ${avgWord}.${p.kind === 'coincell' && mA > 3 ? ' Coin cells deliver much less than their rated capacity above a few mA; expect shorter life.' : ''} Real capacity drops with temperature and age.` }); }
          break;
        }
      }
    }
  } else add({ id: 'no-sim', level: 'info', area: 'Stress', title: 'Run a simulation to check part ratings', detail: 'Wiring and regulatory checks run on the drawing; current, power and temperature checks need a simulation.' });

  // ---- Regulatory pre-checks ----
  const reg = (f: Omit<Finding, 'area'>) => add({ ...f, area: 'Regulatory' });
  const mains = parts.filter(p => p.kind === 'mains');
  const vMax = Math.max(0, ...parts.filter(p => p.kind === 'dcsupply' || p.kind === 'battery').map(p => P(p, 'V')));
  const oscillators = parts.filter(p => p.kind === 'ne555');
  const fMax = Math.max(0, ...oscillators.map(p => sim?.freq[p.id] ?? 0));
  const coin = parts.filter(p => p.kind === 'coincell'); const batteries = parts.filter(p => p.kind === 'battery' || p.kind === 'coincell' || p.kind === 'liion');

  if (us) {
    if (oscillators.length || fMax) {
      if (fMax >= 9000) {
        reg({ id: 'fcc-digital', level: mains.length ? 'warn' : 'info', market: 'US', cite: '47 CFR 15.3(k), 15.103(h), 15.5', title: 'FCC Part 15: unintentional radiator', detail: mains.length
          ? `It generates timing signals above 9 kHz (${(fMax / 1000).toPrecision(3)} kHz), which makes it a digital device under 15.3(k). Running from AC mains, it needs emissions testing and authorisation (Supplier's Declaration of Conformity, 47 CFR 2.906 and 2.938), labelling (15.19) and user information (15.105).`
          : `It generates timing signals above 9 kHz (${(fMax / 1000).toPrecision(3)} kHz), so it counts as a digital device under 15.3(k). Battery-powered devices whose highest frequency is below 1.705 MHz are exempt from the technical rules (15.103(h)), but must still not cause harmful interference (15.5).` });
      } else reg({ id: 'fcc-digital', level: 'pass', market: 'US', cite: '47 CFR 15.3(k)', title: 'FCC Part 15: below the 9 kHz digital-device threshold', detail: `The fastest oscillator runs at ${fMax ? `${fMax.toPrecision(3)} Hz` : 'an unmeasured rate (run a transient simulation)'}; the digital-device definition starts at 9 kHz. It must still not cause harmful interference (15.5).` });
    }
    if (coin.length) reg({ id: 'reese', level: 'warn', market: 'US', refs: coin.map(p => p.ref), cite: '16 CFR part 1263; Public Law 117-171', title: "Reese's Law: coin-cell product", detail: 'Products that use or could use coin or button cells must keep the battery compartment secure (opening needs a tool or at least two independent, simultaneous hand movements), pass abuse testing (drop, crush, compression and torque) without exposing the cell, and carry warnings on the product, packaging and instructions. Battery packaging must be child-resistant.' });
    if (mains.length) {
      reg({ id: 'nrtl', level: 'warn', market: 'US', refs: mains.map(p => p.ref), cite: '29 CFR 1910.303(a), 1910.7', title: 'Mains-powered: plan for safety listing', detail: 'Equipment used in workplaces must be approved, which in practice means listed by a Nationally Recognized Testing Laboratory (NRTL). Retailers expect the same for consumer products. Design for it now: enclosure, creepage and clearance distances, insulation, and a fuse on the line side.' });
      if (!has('fuse')) reg({ id: 'mains-fuse', level: 'error', market: 'US', refs: mains.map(p => p.ref), cite: '29 CFR 1910.303(b)', title: 'No overcurrent protection on mains', detail: 'Put a fuse in series with the line (L) conductor, sized about 1.5 to 2 times the normal current.' });
    }
    if (o.toy && batteries.length) reg({ id: 'toy', level: 'warn', market: 'US', cite: '16 CFR part 1250 (ASTM F963 battery sections)', title: "Children's toy with batteries", detail: 'Toy safety rules require battery compartments that children cannot open without a tool, limits on battery surface temperature, and protection against charging non-rechargeable cells. Third-party testing and a Children\'s Product Certificate apply (16 CFR part 1107).' });
  }
  if (eu) {
    const lvd = mains.length || vMax >= 75;
    if (lvd) reg({ id: 'lvd', level: 'warn', market: 'EU', cite: 'Directive 2014/35/EU, Art. 1 and Annex I', title: 'EU Low Voltage Directive applies', detail: 'Equipment rated 50 to 1000 V AC or 75 to 1500 V DC needs a risk assessment, a technical file, a Declaration of Conformity and CE marking. Design for protection against electric shock, heat and fire from the start.' });
    else reg({ id: 'lvd', level: 'pass', market: 'EU', cite: 'Directive 2014/35/EU, Art. 1', title: 'Below the Low Voltage Directive range', detail: `Highest supply ${vMax || 5} V DC; the directive starts at 75 V DC or 50 V AC.` });
    if (oscillators.length || mains.length) reg({ id: 'emc', level: 'info', market: 'EU', cite: 'Directive 2014/30/EU, Art. 6 and Annex I', title: 'EU EMC Directive: CE marking', detail: 'Apparatus that can generate electromagnetic disturbance must neither cause interference above acceptable limits nor be unduly affected by it. Keep switching loops small, decouple ICs close to their pins, and plan an emissions pre-scan.' });
    reg({ id: 'rohs', level: 'info', market: 'EU', cite: 'Directive 2011/65/EU, Art. 4 and Annex II; Directive (EU) 2015/863', title: 'RoHS: restricted substances', detail: 'Use RoHS-compliant parts and lead-free solder: lead, mercury, cadmium, hexavalent chromium, PBB, PBDE and four phthalates are restricted in electrical and electronic equipment.' });
    reg({ id: 'weee', level: 'info', market: 'EU', cite: 'Directive 2012/19/EU, Art. 14 and Annex IX', title: 'WEEE: crossed-out bin marking', detail: 'Electrical products sold in the EU carry the crossed-out wheelie-bin symbol and the producer joins a take-back scheme.' });
    if (batteries.length) reg({ id: 'eu-battery', level: 'info', market: 'EU', refs: batteries.map(p => p.ref), cite: 'Regulation (EU) 2023/1542, Art. 11', title: 'EU Battery Regulation: user-replaceable batteries', detail: 'Portable batteries built into appliances must be removable and replaceable by the end user with commonly available tools (applies from 18 February 2027). A battery holder or clip already meets this.' });
  }
  // ---- Radios and connected devices ----
  const radios = parts.filter(p => (p.kind === 'esp32' || p.kind === 'rpi') || (p.kind === 'pico' && /W$/.test(String(p.params.variant ?? ''))));
  if (radios.length) {
    const refs = radios.map(p => p.ref);
    if (us) {
      reg({ id: 'fcc-radio', level: 'warn', market: 'US', refs, cite: '47 CFR 15.212, 15.247, 2.925', title: 'FCC: intentional radiator (Wi-Fi / Bluetooth)', detail: 'Keep the radio as the certified module it ships as, with its antenna unchanged, and follow the module maker\'s integration guide so its modular grant carries over. Label the outside of your product "Contains FCC ID: ..." with the module\'s ID. Your finished product is still a digital device under Part 15 Subpart B and needs its own emissions check (Supplier\'s Declaration of Conformity).' });
      reg({ id: 'ca-iot', level: 'warn', market: 'US', refs, cite: 'Cal. Civ. Code §1798.91.04 (SB-327)', title: 'California connected-device security', detail: 'A connected device needs reasonable security: either a password unique to each unit, or one the user must set before first use. Never ship a shared default password.' });
      reg({ id: 'cyber-mark', level: 'info', market: 'US', refs, cite: 'FCC IoT labeling program (U.S. Cyber Trust Mark, 2024)', title: 'Optional: U.S. Cyber Trust Mark', detail: 'A voluntary label for consumer smart devices that meet baseline security criteria (unique credentials, updates, data protection).' });
    }
    if (eu) {
      reg({ id: 'red', level: 'warn', market: 'EU', refs, cite: 'Directive 2014/53/EU, Art. 3(1)(a), 3(1)(b), 3(2)', title: 'EU Radio Equipment Directive replaces LVD/EMC', detail: 'With a radio inside, the whole product is radio equipment: safety, EMC and efficient use of spectrum are assessed under RED, with a Declaration of Conformity and CE marking. A pre-certified module\'s test reports cover much of the radio part.' });
      reg({ id: 'red-cyber', level: 'warn', market: 'EU', refs, cite: 'Delegated Regulation (EU) 2022/30, Art. 3(3)(d), (e), (f); EN 18031-1/-2/-3', title: 'RED cybersecurity (since 1 Aug 2025)', detail: 'Internet-connected radio products must protect the network, personal data and against fraud: no universal default passwords, secure updates, protected stored credentials.' });
      reg({ id: 'cra', level: 'info', market: 'EU', refs, cite: 'Regulation (EU) 2024/2847 (Cyber Resilience Act), Art. 14; Annex I', title: 'Cyber Resilience Act timeline', detail: 'Manufacturers of products with digital elements must report actively exploited vulnerabilities from 11 Sep 2026; the full security requirements and CE marking under the CRA apply from 11 Dec 2027. Plan a vulnerability contact and a support period now.' });
      reg({ id: 'psti', level: 'info', market: 'UK', refs, cite: 'Product Security and Telecommunications Infrastructure Act 2022; SI 2023/1007, Sch. 1', title: 'UK: connectable product security', detail: 'Selling in the UK: no universal default passwords, a published way to report vulnerabilities, and a stated minimum period of security updates.' });
    }
  }
  if (parts.some(p => p.kind === 'acdc')) reg({ id: 'acdc-module', level: 'info', refs: parts.filter(p => p.kind === 'acdc').map(p => p.ref), cite: 'UL/IEC 62368-1', title: 'Certified AC-DC module', detail: 'Choose a module certified to IEC/UL 62368-1 and follow its datasheet: input fuse, creepage and clearance on your board (keep at least 6 mm between mains and low-voltage copper as a starting point) and an enclosure that keeps fingers off mains. The finished product still needs its own approval.' });

  for (const m of moduleFindings(c, sim, o)) add(m);
  const order: Level[] = ['error', 'warn', 'info', 'pass'];
  return out.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

export const summarize = (f: Finding[]) => ({ errors: f.filter(x => x.level === 'error').length, warnings: f.filter(x => x.level === 'warn').length, passes: f.filter(x => x.level === 'pass').length });
