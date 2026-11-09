// SPICE netlist export: the open, decades-old text format every circuit simulator reads
// (ngspice, LTspice, Qucs-S, KiCad). Behavioural parts (555, 7805) are written as subcircuit calls
// with a note, since their models live in the user's simulator library.

import { compByKind, ledColor, parseSi } from './components';
import { type Circuit, netlist } from './circuit';

export function spiceNetlist(c: Circuit): string {
  const nl = netlist(c); const lines = [`* ${c.name} — exported from Plajah Electronics Lab`];
  const N = (id: string, pin: string) => String(nl.pinNet[id]?.[pin] ?? 0);
  const P = (p: Circuit['parts'][number], k: string) => parseSi(p.params[k] ?? compByKind(p.kind)?.params.find(x => x.key === k)?.default ?? 0);
  const models = new Set<string>();
  for (const p of c.parts) {
    const r = p.ref.replace(/[^A-Za-z0-9_]/g, '');
    switch (p.kind) {
      case 'resistor': lines.push(`R${r} ${N(p.id, '1')} ${N(p.id, '2')} ${P(p, 'R')}`); break;
      case 'potentiometer': { const R = P(p, 'R'), pos = Number(p.params.pos ?? 0.5); lines.push(`R${r}a ${N(p.id, '1')} ${N(p.id, 'W')} ${Math.max(0.1, R * pos)}`, `R${r}b ${N(p.id, 'W')} ${N(p.id, '2')} ${Math.max(0.1, R * (1 - pos))}`); break; }
      case 'capacitor': lines.push(`C${r} ${N(p.id, '1')} ${N(p.id, '2')} ${P(p, 'C')}`); break;
      case 'electrolytic': lines.push(`C${r} ${N(p.id, '+')} ${N(p.id, '-')} ${P(p, 'C')}`); break;
      case 'inductor': lines.push(`L${r} ${N(p.id, '1')} ${N(p.id, '2')} ${P(p, 'L')}`); break;
      case 'speaker': lines.push(`R${r} ${N(p.id, '+')} ${r}_vc ${P(p, 'R')}`, `L${r} ${r}_vc ${N(p.id, '-')} 0.1m`); break;
      case 'led': { const col = String(p.params.color ?? 'red'); const vf = ledColor(col).vf; const m = `LED_${col}`; if (!models.has(m)) { models.add(m); lines.push(`.model ${m} D(IS=${(0.02 / (Math.exp(vf / (2 * 0.025852)) - 1)).toExponential(3)} N=2 BV=5)`); } lines.push(`D${r} ${N(p.id, 'A')} ${N(p.id, 'K')} ${m}`); break; }
      case 'diode': { const m = p.params.type === 'rectifier' ? 'D1N4007' : 'D1N4148'; if (!models.has(m)) { models.add(m); lines.push(m === 'D1N4007' ? '.model D1N4007 D(IS=1n N=1.8 BV=1000)' : '.model D1N4148 D(IS=2.5n N=1.75 BV=75)'); } lines.push(`D${r} ${N(p.id, 'A')} ${N(p.id, 'K')} ${m}`); break; }
      case 'npn': if (!models.has('QNPN')) { models.add('QNPN'); lines.push(`.model QNPN NPN(IS=1e-14 BF=${p.params.beta ?? 100})`); } lines.push(`Q${r} ${N(p.id, 'C')} ${N(p.id, 'B')} ${N(p.id, 'E')} QNPN`); break;
      case 'nmos': if (!models.has('MN')) { models.add('MN'); lines.push(`.model MN NMOS(VTO=${p.params.vth ?? 2} KP=0.5 LAMBDA=0.01)`); } lines.push(`M${r} ${N(p.id, 'D')} ${N(p.id, 'G')} ${N(p.id, 'S')} ${N(p.id, 'S')} MN`); break;
      case 'battery': case 'coincell': case 'liion': lines.push(`V${r} ${r}_int ${N(p.id, '-')} DC ${P(p, 'V')}`, `R${r}int ${r}_int ${N(p.id, '+')} ${P(p, 'Rint')}`); break;
      case 'usb5v': lines.push(`V${r} ${N(p.id, 'VBUS')} ${N(p.id, 'GND')} DC ${P(p, 'V')}`); break;
      case 'dcsupply': lines.push(`V${r} ${N(p.id, '+')} ${N(p.id, '-')} DC ${P(p, 'V')}`); break;
      case 'mains': lines.push(`V${r} ${N(p.id, 'L')} ${N(p.id, 'N')} SIN(0 ${+(P(p, 'Vrms') * Math.SQRT2).toFixed(1)} ${P(p, 'f')})`); break;
      case 'switch': lines.push(`R${r} ${N(p.id, '1')} ${N(p.id, '2')} ${p.params.state === 'open' ? '1G' : '0.05'}`); break;
      case 'fuse': lines.push(`R${r} ${N(p.id, '1')} ${N(p.id, '2')} 0.01`); break;
      case 'ne555': lines.push(`* ${p.ref}: 555 timer — needs a 555 subcircuit model in your simulator library`, `X${r} ${['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'].map(k => N(p.id, k)).join(' ')} NE555`); break;
      case 'reg7805': lines.push(`* ${p.ref}: 7805 regulator — needs a 7805 subcircuit model`, `X${r} ${N(p.id, 'IN')} ${N(p.id, 'GND')} ${N(p.id, 'OUT')} LM7805`); break;
    }
  }
  lines.push('.op', '.end');
  return lines.join('\n') + '\n';
}
