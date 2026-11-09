// Plan -> schematic. Each block draws its parts at local coordinates and names its nets; nets are
// resolved to rails (V5, LOGIC, V12, SYS), board pins ("IO:GP26"), ADS1115 channels or local
// nets; groups are laid out in columns (power | left I/O | board | right I/O) and the router draws
// every wire. Released by Plajah as public domain (CC0).
import { compByKind, type Pt } from '../components';
import { type CPart, type Circuit, pinPos } from '../circuit';
import { blockById } from './blocks';
import { Router, makePart, partBox } from './router';
import type { Plan } from './planner';
import type { DrawApi, Inst, Params } from './types';

interface Group { id: string; parts: CPart[]; side: 'power' | 'mcu' | 'left' | 'right' }
export interface Assembled { circuit: Circuit; pairs: Array<[string, string]>; mcuRef?: string; refsByInst: Record<string, string[]> }

export function assemble(p: Plan, name: string, market: 'US' | 'EU' | 'both', spread = 1): Assembled {
  const counters: Record<string, number> = {}; const groups: Group[] = []; const nets = new Map<string, Array<[string, string]>>(); const gnd: Array<[string, string]> = [];
  const refsByInst: Record<string, string[]> = {};
  const mcu = p.mcu; const pw = p.power; const mcuRef = mcu ? 'U1' : undefined; if (mcu) counters.U = 1;
  const add = (net: string, pin: [string, string]) => { const l = nets.get(net) ?? []; if (!l.some(x => x[0] === pin[0] && x[1] === pin[1])) l.push(pin); nets.set(net, l); };
  const rail = (n: string) => (n === 'SYS' ? pw.sysIs : n === 'LOGIC' ? (mcu?.logic === 5 ? 'V5' : 'LOGIC') : n);
  const adsRefs: string[] = []; const expRefs: string[] = [];
  const resolve = (inst: Inst | null, gid: string, nm: string, pin: [string, string]) => {
    if (nm === 'GND') { gnd.push(pin); return; }
    if (['V5', 'SYS', 'LOGIC', 'V12'].includes(nm)) { add(rail(nm), pin); return; }
    if (nm.startsWith('@') && inst) {
      const bp = inst.pins[nm.slice(1)]; if (!bp) throw new Error(`${inst.label}: no pin for ${nm}`);
      const x = /^EXP:(\d+):(GP[AB]\d)$/.exec(bp); if (x) { const net = `EXP${x[1]}.${x[2]}`; add(net, [expRefs[+x[1]], x[2]]); add(net, pin); return; }
      const m = /^ADS:(\d+):A(\d)$/.exec(bp); if (m) { const net = `ADS${m[1]}.A${m[2]}`; add(net, [adsRefs[+m[1]], `A${m[2]}`]); add(net, pin); return; }
      add(`IO:${bp}`, [mcuRef!, bp]); add(`IO:${bp}`, pin); return;
    }
    add(`${gid}:${nm}`, pin);
  };
  const group = (id: string, side: Group['side'], inst: Inst | null, fn: (d: DrawApi) => void, row = false) => {
    const g: Group = { id, parts: [], side }; let cursor = 0;
    const d: DrawApi = {
      part(kind, dx, dy, rot = 0, params: Params = {}) {
        const pre = compByKind(kind)!.prefix; counters[pre] = (counters[pre] ?? 0) + 1; const ref = `${pre}${counters[pre]}`;
        let x = dx, y = dy; if (row) { const b = partBox({ kind, x: 0, y: 0, rot }); x = Math.ceil(cursor - b.x0); y = 0; cursor = x + b.x1 + 7; }
        g.parts.push(makePart(kind, ref, x, y, rot, params)); if (inst) (refsByInst[inst.id] ??= []).push(ref); return ref;
      },
      net(nm, ...pins) { for (const pin of pins) resolve(inst, id, nm, pin); },
    };
    fn(d); groups.push(g);
  };

  // ---- power
  group('power', 'power', null, d => {
    const swTo = (from: string, to: string) => { const s = d.part('switch', 0, 0, 0, { state: 'closed', I: '3' }); d.net(from, [s, '1']); d.net(to, [s, '2']); };
    if (pw.source === 'usb') { const j = d.part('usb5v', 0, 0, 0, { Imax: String(pw.usbA ?? 0.5) }); d.net('V5', [j, 'VBUS']); d.net('GND', [j, 'GND']); }
    else if (pw.source === 'adapter5' || pw.source === 'adapter12') {
      const j = d.part('dcsupply', 0, 0, 0, { V: pw.adapterV!, Imax: String(pw.adapterA) }); const f = d.part('fuse', 0, 0, 0, { I: String(pw.fuseA) });
      d.net('vin', [j, '+'], [f, '1']); d.net(pw.source === 'adapter5' ? 'V5' : 'V12', [f, '2']); d.net('GND', [j, '-']);
    } else if (pw.source === 'mains') {
      const j = d.part('mains', 0, 0, 0, { Vrms: String(pw.mainsV), f: pw.mainsV === 230 ? 50 : 60 }); const f = d.part('fuse', 0, 0, 0, { I: String(pw.fuseA) }); const ps = d.part('acdc', 0, 0, 0, { V: pw.acdc!.V, I: String(pw.acdc!.I) });
      d.net('l', [j, 'L'], [f, '1']); d.net('l2', [f, '2'], [ps, 'L']); d.net('n', [j, 'N'], [ps, 'N']); d.net(pw.acdc!.V === 12 ? 'V12' : 'V5', [ps, '+']); d.net('GND', [ps, '-']);
    } else if (pw.source === 'liion') {
      const j = d.part('usb5v', 0, 0, 0, { Imax: '0.5' }); const c = d.part('charger', 0, 0, 0, { Icharge: String(pw.cell!.chargeA), Rprog: '3k' }); const bt = d.part('liion', 0, 0, 0, { mAh: pw.cell!.mAh });
      d.net('vusb', [j, 'VBUS'], [c, 'IN+']); d.net('GND', [j, 'GND']); d.net('GND', [c, 'IN-']); d.net('GND', [c, 'OUT-']); d.net('batp', [bt, '+'], [c, 'B+']); d.net('batn', [bt, '-'], [c, 'B-']);
      const s = d.part('switch', 0, 0, 0, { state: 'closed', I: '3' }); d.net('bout', [c, 'OUT+'], [s, '1']); d.net('SYS', [s, '2']);
    } else if (pw.source === 'aa') {
      const bt = d.part('battery', 0, 0, 0, { V: 4.5, Rint: 0.3, mAh: 2400 }); const s = d.part('switch', 0, 0, 0, { state: 'closed', I: '3' });
      d.net('bp', [bt, '+'], [s, '1']); d.net('SYS', [s, '2']); d.net('GND', [bt, '-']);
    }
    if (pw.source !== 'liion' && pw.source !== 'aa' && pw.powerSwitch) swTo('V5', 'SYS');
    if (pw.buck) { const u = d.part('buck', 0, 0, 0, { V: pw.buck.V, I: String(pw.buck.I) }); d.net('V12', [u, 'VIN']); d.net('GND', [u, 'GND']); d.net('V5', [u, 'VOUT']); }
    if (pw.boost) { const u = d.part('boost', 0, 0, 0, { V: pw.boost.V, I: String(pw.boost.I) }); d.net('SYS', [u, 'VIN']); d.net('GND', [u, 'GND']); d.net('V5', [u, 'VOUT']); }
    if (pw.ldo3) { const u = d.part('ldo', 0, 0, 0, { V: 3.3, I: '0.6' }); d.net('V5', [u, 'VIN']); d.net('GND', [u, 'GND']); d.net('LOGIC', [u, 'VOUT']); }
  }, true);

  // ---- board
  if (mcu) {
    const highAll = p.insts.flatMap(i => blockById(i.block)!.pins(i).filter(n => n.high).map(n => i.pins[n.role])).filter(Boolean);
    const high = highAll.filter(x => !x.startsWith('ADS') && !x.startsWith('EXP'));
    const params: Params = { high: high.join(',') }; if (mcu.variant) params.variant = mcu.variant; if (mcu.kind === 'rpi') params.model = p.power.rows[0]?.what.replace('Raspberry ', '') || 'Pi 5';
    groups.push({ id: 'mcu', side: 'mcu', parts: [makePart(mcu.part, mcuRef!, 0, 0, 0, params)] });
    const on5 = pw.rows[0]?.rail === '5 V'; add(on5 ? 'V5' : rail('SYS'), [mcuRef!, on5 ? mcu.pin5v : mcu.pinBattery!]); gnd.push([mcuRef!, 'GND']);
    for (let k = 0; k < (p.exp ?? 0); k++) group(`exp${k}`, 'right', null, d => { const hi = highAll.filter(x => x.startsWith(`EXP:${k}:`)).map(x => x.split(':')[2]); const u = d.part('mcp23017', 0, 0, 0, { addr: `0x${(0x20 + k).toString(16)}`, high: hi.join(',') }); expRefs.push(u); d.net('LOGIC', [u, 'VDD']); d.net('GND', [u, 'GND']); add(`IO:${p.i2c![0]}`, [mcuRef!, p.i2c![0]]); add(`IO:${p.i2c![0]}`, [u, 'SDA']); add(`IO:${p.i2c![1]}`, [mcuRef!, p.i2c![1]]); add(`IO:${p.i2c![1]}`, [u, 'SCL']); });
    for (let k = 0; k < p.ads; k++) group(`ads${k}`, 'right', null, d => { const u = d.part('ads1115', 0, 0, 0, { addr: `0x${(0x48 + k).toString(16)}` }); adsRefs.push(u); d.net('LOGIC', [u, 'VDD']); d.net('GND', [u, 'GND']); add(`IO:${p.i2c![0]}`, [mcuRef!, p.i2c![0]]); add(`IO:${p.i2c![0]}`, [u, 'SDA']); add(`IO:${p.i2c![1]}`, [mcuRef!, p.i2c![1]]); add(`IO:${p.i2c![1]}`, [u, 'SCL']); });
  }
  // ---- blocks
  const mcuPart = groups.find(g => g.side === 'mcu')?.parts[0];
  const sideOf = (i: Inst): 'left' | 'right' => {
    if (!mcuPart) return 'right'; const def = compByKind(mcuPart.kind)!; const xs = Object.values(i.pins).filter(bp => !bp.startsWith('ADS') && !['sda', 'scl', 'sck', 'mosi'].some(r => i.pins[r] === bp)).map(bp => { const pd = def.pins.find(q => q.name === bp); return pd ? pinPos(mcuPart, pd.at)[0] : 1; });
    return xs.length && xs.every(x => x < 0) ? 'left' : 'right';
  };
  for (const i of p.insts) group(i.id, sideOf(i), i, d => blockById(i.block)!.draw(i, d));
  if (mcu && mcu.rail3v3 && !pw.ldo3 && mcu.logic < 4 && nets.has('LOGIC')) add('LOGIC', [mcuRef!, mcu.rail3v3]);

  // ---- layout
  const box = (g: Group) => { const bs = g.parts.map(partBox); return { x0: Math.min(...bs.map(b => b.x0)), y0: Math.min(...bs.map(b => b.y0)), x1: Math.max(...bs.map(b => b.x1)), y1: Math.max(...bs.map(b => b.y1)) }; };
  const shift = (g: Group, dx: number, dy: number) => { dx = Math.round(dx); dy = Math.round(dy); for (const q of g.parts) { q.x += dx; q.y += dy; } };
  const netCount = nets.size;
  const left = groups.filter(g => g.side === 'left'), right = groups.filter(g => g.side === 'right'), power = groups.find(g => g.side === 'power')!;
  const ch = (k: number) => Math.round((12 + Math.ceil(k / 2)) * spread); const gapY = Math.round(5 * spread);
  const center = mcuPart ? box(groups.find(g => g.side === 'mcu')!) : { x0: 0, y0: -4, x1: 0, y1: 4 };
  let y = center.y0; const rx = center.x1 + ch(right.length * 2 + netCount / 3);
  for (const g of right) { const b = box(g); shift(g, rx - b.x0, y - b.y0); y += b.y1 - b.y0 + gapY; }
  y = center.y0; const lx = center.x0 - ch(left.length * 2 + netCount / 4); let minX = mcuPart ? center.x0 : 0;
  for (const g of left) { const b = box(g); shift(g, lx - b.x1, y - b.y0); y += b.y1 - b.y0 + gapY; minX = Math.min(minX, lx - (b.x1 - b.x0)); }
  if (power.parts.length) { const b = box(power); const px = (mcuPart ? minX : rx) - 14; shift(power, px - b.x1, center.y0 - 8 - b.y0); }

  // ---- route
  const parts = groups.flatMap(g => g.parts);
  // Width-5 symbols put pins on half units: nudge those parts so every pin sits on the grid.
  for (const q of parts) { const pd = compByKind(q.kind)!.pins[0]; if (!pd) continue; const at = pinPos(q, pd.at); if (Math.abs(at[0] - Math.round(at[0])) > 0.25) q.x += 0.5; if (Math.abs(at[1] - Math.round(at[1])) > 0.25) q.y += 0.5; }
  const router = new Router(parts);
  const named = [...nets.entries()].filter(([, l]) => l.length >= 2).map(([n, pins]) => ({ name: n, pins }));
  router.assign(named);
  for (const g of gnd) router.ground(g[0], g[1]);
  const pinXY = (ref: string, pin: string): Pt => { const q = parts.find(x => x.ref === ref)!; return pinPos(q, compByKind(q.kind)!.pins.find(z => z.name === pin)!.at); };
  const hpwl = (pins: Array<[string, string]>) => { const ps = pins.map(([r, pn]) => pinXY(r, pn)); return Math.max(...ps.map(q => q[0])) - Math.min(...ps.map(q => q[0])) + Math.max(...ps.map(q => q[1])) - Math.min(...ps.map(q => q[1])); };
  named.sort((a, b) => hpwl(a.pins) - hpwl(b.pins));
  for (const n of named) router.connect(n.name, n.pins);
  void market;
  return { circuit: { name, parts: router.parts, wires: router.wires }, pairs: router.pairs, mcuRef, refsByInst };
}
