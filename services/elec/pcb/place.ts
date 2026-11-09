// Schematic → board: footprints for each part, nets with a class and a current (from our own DC
// simulation plus each part's rating), then auto-placement seeded from where the parts sit on the
// schematic, legalised so courtyards keep a routing gap, and a board outline sized to the parts.

import { type Circuit, type CPart, netlist } from '../circuit';
import { compByKind, parseSi, rotPt } from '../components';
import { simulate } from '../sim';
import { PI_MODELS } from '../boards';
import { footprintFor, usbIsModulePort, type FpStyle } from './footprints';
import { type Board, type Footprint, type Hole, type Net, type Pad, type Placed, type Rules, DEFAULT_RULES, ipcWidth } from './types';

export interface Prepared {
  name: string; parts: Array<{ part: CPart; fp: Footprint; value: string }>; virtual: Board['virtual'];
  nets: Net[];
  /** Board net per part pin (pinNet[partId][pinName]), including footprint ties. */
  pinNet: Record<string, Record<string, number>>;
  rules: Rules;
}

const SUPPLY_PINS: Record<string, string[]> = { usb5v: ['VBUS', 'GND'], dcsupply: ['+', '-'], battery: ['+', '-'], coincell: ['+', '-'], acdc: ['+', '-'], reg7805: ['IN', 'OUT', 'GND'],
  pico: ['VBUS', 'VSYS', '3V3', 'GND'], esp32: ['5V', '3V3', 'GND'], nano: ['5V', '3V3', 'GND'], rpi: ['5V', '3V3', 'GND'], amp: ['VCC', 'GND', 'OUT+', 'OUT-'], ledstrip: ['+', '-'], usbload: ['VBUS', 'GND'], sensor: ['VIN', 'GND'] };
const NAME_PINS = ['VBUS', 'VSYS', '5V', '3V3', 'VCC', 'VIN', 'OUT+', 'OUT-'];

/** Rated or typical current a part puts through its pins (A), used when the simulation is quieter. */
function ratedCurrent(p: CPart): number {
  const v = (k: string, d: number) => { const x = parseSi(p.params?.[k] ?? d); return Number.isFinite(x) ? x : d; };
  switch (p.kind) {
    case 'usbload': return v('I', 1);
    case 'ledstrip': return v('W', 6) / Math.max(1, v('V', 12));
    case 'speaker': return Math.sqrt(v('P', 0.5) / Math.max(1, v('R', 8)));
    case 'amp': return v('P', 2.5) / 5 / 0.85;
    case 'pico': case 'esp32': case 'nano': return v('draw', 0.05);
    case 'rpi': { const d = parseSi(p.params?.draw ?? 'auto'); return Number.isFinite(d) ? d : (PI_MODELS[String(p.params?.model)]?.draw ?? 0.9); }
    case 'led': return v('If', 0.02);
    default: return 0;
  }
}

export function prepare(c: Circuit, o: { style?: FpStyle; rules?: Partial<Rules> } = {}): Prepared {
  const rules: Rules = { ...DEFAULT_RULES, ...(o.rules ?? {}) };
  const nl = netlist(c); const byId = new Map(c.parts.map(p => [p.id, p]));
  // Which kind each net touches, to spot a USB supply that is really a module's own USB port.
  const netPins = new Map<number, Array<{ part: CPart; pin: string }>>();
  for (const p of c.parts) for (const [pin, n] of Object.entries(nl.pinNet[p.id] ?? {})) { const a = netPins.get(n) ?? []; a.push({ part: p, pin }); netPins.set(n, a); }
  const virtual: Board['virtual'] = []; const parts: Prepared['parts'] = [];
  for (const p of c.parts) {
    if (p.kind === 'ground') continue;
    if (p.kind === 'usb5v') {
      const vb = nl.pinNet[p.id]?.VBUS; const mod = (netPins.get(vb) ?? []).find(x => usbIsModulePort(`${x.part.kind}.${x.pin}`));
      if (mod) { virtual.push({ ref: p.ref, why: `power comes from ${mod.part.ref}'s own USB socket` }); continue; }
    }
    const fp = footprintFor(p, o.style ?? 'tht');
    if (!fp) { virtual.push({ ref: p.ref, why: 'no physical part' }); continue; }
    const def = compByKind(p.kind); parts.push({ part: p, fp, value: def?.label ? def.label(p.params) : def?.name ?? p.kind });
  }

  // Part currents: our DC operating point, floored by ratings.
  const cur = new Map<string, number>();
  try { const s = simulate(c, { mode: 'dc' }); for (const p of c.parts) cur.set(p.id, Math.abs(s.parts[p.id]?.i?.[0] ?? 0)); } catch { /* sizes from ratings alone */ }
  const partI = (p: CPart) => Math.max(Number.isFinite(cur.get(p.id)!) ? cur.get(p.id)! : 0, ratedCurrent(p));

  // Board nets: schematic nets that reach a physical pad, then per-part ties, then each unconnected pad gets its own.
  const nets: Net[] = []; const map = new Map<number, number>(); const pinNet: Prepared['pinNet'] = {}; const used = new Set<string>();
  const physical = new Set(parts.map(x => x.part.id));
  const uniq = (n: string) => { let s = n, k = 2; while (used.has(s)) s = `${n}_${k++}`; used.add(s); return s; };
  const schNets = [...netPins.keys()].sort((a, b) => a - b);
  for (const sn of schNets) {
    const pins = netPins.get(sn)!.filter(x => physical.has(x.part.id)); if (!pins.length) continue;
    const all = netPins.get(sn)!;
    let name = sn === 0 && nl.hasGround ? 'GND' : '';
    if (!name) { const mains = all.find(x => (x.part.kind === 'mains' || x.part.kind === 'acdc') && (x.pin === 'L' || x.pin === 'N')); if (mains) name = `MAINS_${mains.pin}`; }
    if (!name) { const g = all.find(x => x.pin === 'GND' || (x.pin === '-' && SUPPLY_PINS[x.part.kind])); if (g && all.some(x => x.part.kind === 'ground')) name = 'GND'; }
    if (!name) { const pw = all.find(x => NAME_PINS.includes(x.pin)); if (pw) name = pw.pin === 'OUT+' || pw.pin === 'OUT-' ? `${pw.part.ref}_${pw.pin}` : pw.pin; }
    if (!name) { const s = all.find(x => SUPPLY_PINS[x.part.kind]?.includes(x.pin) && x.pin === '+'); if (s) name = `${s.part.ref}_POS`; }
    if (!name) name = `${pins[0].part.ref}_${pins[0].pin}`;
    const id = nets.length; map.set(sn, id);
    const supply = all.some(x => SUPPLY_PINS[x.part.kind]?.includes(x.pin)) || name === 'GND';
    const loads = all.map(x => partI(x.part)); const I = Math.max(Math.max(0, ...loads), loads.reduce((a, b) => a + b, 0) / 2);
    nets.push({ id, name: uniq(name.replace(/[^A-Za-z0-9_+-]/g, '_')), cls: supply || I >= 0.25 ? 'power' : 'signal', current: I, width: 0 });
    for (const x of all) (pinNet[x.part.id] ??= {})[x.pin] = id;
  }
  // Mains reaches through fuses and switches in the line.
  const mains = new Set(nets.filter(n => n.name.startsWith('MAINS_')).map(n => n.id));
  for (let it = 0; it < 4; it++) for (const { part } of parts) if (part.kind === 'fuse' || part.kind === 'switch') {
    const a = pinNet[part.id]?.['1'], b = pinNet[part.id]?.['2']; if (a === undefined || b === undefined) continue;
    if (mains.has(a)) mains.add(b); if (mains.has(b)) mains.add(a);
  }
  for (const id of mains) nets[id].cls = 'mains';
  for (const { part, fp } of parts) for (const tie of fp.ties ?? []) {
    const id = nets.length; nets.push({ id, name: uniq(`${part.ref}_${tie.join('').replace(/[^A-Za-z0-9]/g, '')}`), cls: 'signal', current: 0, width: 0 });
    for (const pin of tie) (pinNet[part.id] ??= {})[pin] = id;
  }
  for (const n of nets) {
    const need = ipcWidth(n.current * 1.2, rules.tempRise, rules.copperOz);
    const w = Math.max(rules.signalWidth, n.cls === 'signal' ? 0 : rules.powerMinWidth, need);
    n.width = Math.ceil(w * 20 - 1e-9) / 20;
  }
  return { name: c.name, parts, virtual, nets, pinNet, rules };
}

// ---------------------------------------------------------------- placement

type Box = [number, number, number, number];
const rotBox = (b: Box, rot: number): Box => {
  const pts = [rotPt([b[0], b[1]], rot), rotPt([b[2], b[3]], rot)];
  return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
};
const overlap = (a: Box, b: Box, g: number) => a[0] < b[2] + g && b[0] < a[2] + g && a[1] < b[3] + g && b[1] < a[3] + g;
const snap = (v: number, s = 1.27) => Math.round(v / s) * s;

/** Pads of a placed part on the board. */
export function padsOf(pl: Placed, pinNet: Record<string, number> | undefined, ncNet: () => number): Pad[] {
  return pl.fp.pads.map((d, i) => {
    const [dx, dy] = rotPt([d.x, d.y], pl.rot); const odd = pl.rot % 2 === 1;
    const net = d.name && pinNet?.[d.name] !== undefined ? pinNet[d.name] : ncNet();
    return { id: `${pl.ref}.${i + 1}`, part: pl.id, ref: pl.ref, name: d.name, x: pl.x + dx, y: pl.y + dy, shape: d.shape, w: odd ? d.h : d.w, h: odd ? d.w : d.h, drill: d.drill, layers: d.drill ? ['top', 'bottom'] : ['top'], net, group: d.name ? `${pl.id}:${d.name}` : `${pl.id}:#${i}` };
  });
}

export interface PlaceOptions { gap?: number; holes?: boolean }
/** Auto-place the prepared parts and size the board. Returns a board with no copper routed yet. */
export function place(prep: Prepared, o: PlaceOptions = {}): Board {
  const gap = o.gap ?? 2.5; const items = prep.parts;
  // Seeds from the schematic, scaled so the spread matches the parts' area.
  const xs = items.map(x => x.part.x), ys = items.map(x => x.part.y);
  const span = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const area = items.reduce((a, x) => a + (x.fp.court[2] - x.fp.court[0] + gap) * (x.fp.court[3] - x.fp.court[1] + gap), 0);
  const scale = Math.max(1.5, Math.sqrt(area * 1.6) / span);
  const seed = new Map(items.map(x => [x.part.id, [x.part.x * scale, x.part.y * scale] as [number, number]]));
  const placed: Placed[] = []; const pos = new Map<string, Placed>();
  const netsOf = (id: string) => new Set(Object.values(prep.pinNet[id] ?? {}));
  const power = (n: number) => prep.nets[n]?.name === 'GND';
  const cost = (it: typeof items[number], x: number, y: number, rot: number, others: Placed[]) => {
    let wl = 0; const pn = prep.pinNet[it.part.id] ?? {};
    for (const d of it.fp.pads) {
      const n = d.name ? pn[d.name] : undefined; if (n === undefined) continue;
      const [dx, dy] = rotPt([d.x, d.y], rot); const px = x + dx, py = y + dy; let best = Infinity;
      for (const q of others) { const qn = prep.pinNet[q.id] ?? {}; for (const e of q.fp.pads) { if (!e.name || qn[e.name] !== n) continue; const [ex, ey] = rotPt([e.x, e.y], q.rot); best = Math.min(best, Math.abs(q.x + ex - px) + Math.abs(q.y + ey - py)); } }
      if (best < Infinity) wl += power(n) ? best * 0.5 : best;
    }
    const s = seed.get(it.part.id)!; return wl + 0.15 * (Math.abs(x - s[0]) + Math.abs(y - s[1]));
  };
  const search = (it: typeof items[number], cx: number, cy: number, others: Placed[], maxR = 200): Placed | null => {
    let best: { c: number; x: number; y: number; rot: number } | null = null; let foundAt = -1;
    for (let r = 0; r <= maxR; r++) {
      const ring: Array<[number, number]> = [];
      if (r === 0) ring.push([0, 0]); else for (let k = -r; k <= r; k++) ring.push([k, -r], [k, r], [-r, k], [r, k]);
      for (const [i, j] of ring) for (let rot = 0; rot < 4; rot++) {
        const x = snap(cx) + i * 1.27, y = snap(cy) + j * 1.27; const b0 = rotBox(it.fp.court, rot); const bx: Box = [x + b0[0], y + b0[1], x + b0[2], y + b0[3]];
        if (others.some(q => overlap(bx, q.box, gap))) continue;
        const c = cost(it, x, y, rot, others); if (!best || c < best.c) best = { c, x, y, rot }; if (foundAt < 0) foundAt = r;
      }
      if (foundAt >= 0 && r >= foundAt + 3) break;
    }
    if (!best) return null; const b0 = rotBox(it.fp.court, best.rot);
    return { id: it.part.id, ref: it.part.ref, kind: it.part.kind, fp: it.fp, x: best.x, y: best.y, rot: best.rot, value: it.value, box: [best.x + b0[0], best.y + b0[1], best.x + b0[2], best.y + b0[3]] };
  };
  const areaOf = (it: typeof items[number]) => (it.fp.court[2] - it.fp.court[0]) * (it.fp.court[3] - it.fp.court[1]);
  const left = [...items].sort((a, b) => areaOf(b) - areaOf(a));
  while (left.length) {
    let k = 0;
    if (placed.length) { let bestScore = -1; left.forEach((it, i) => { const mine = netsOf(it.part.id); let s = 0; for (const q of placed) for (const n of netsOf(q.id)) if (mine.has(n) && !power(n)) s++; const score = s * 1000 + areaOf(it); if (score > bestScore) { bestScore = score; k = i; } }); }
    const it = left.splice(k, 1)[0];
    // Aim between the schematic seed and the parts it connects to.
    const s = seed.get(it.part.id)!; const mine = netsOf(it.part.id); const near = placed.filter(q => [...netsOf(q.id)].some(n => mine.has(n) && !power(n)));
    const tx = near.length ? (s[0] + near.reduce((a, q) => a + q.x, 0) / near.length) / 2 : s[0], ty = near.length ? (s[1] + near.reduce((a, q) => a + q.y, 0) / near.length) / 2 : s[1];
    const pl = search(it, tx, ty, placed)!; placed.push(pl); pos.set(pl.id, pl);
  }
  // Two refinement passes: move each part to its cheapest nearby spot given all the others.
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < placed.length; i++) {
    const it = items.find(x => x.part.id === placed[i].id)!; const others = placed.filter((_, j) => j !== i);
    const cand = search(it, placed[i].x, placed[i].y, others, 10);
    if (cand && cost(it, cand.x, cand.y, cand.rot, others) < cost(it, placed[i].x, placed[i].y, placed[i].rot, others) - 0.01) placed[i] = cand;
  }
  // Board outline: courtyards plus a margin (room for mounting holes in the corners).
  const holes = o.holes ?? true; const margin = holes ? 6.5 : 3;
  const x0 = Math.min(...placed.map(p => p.box[0])), y0 = Math.min(...placed.map(p => p.box[1])), x1 = Math.max(...placed.map(p => p.box[2])), y1 = Math.max(...placed.map(p => p.box[3]));
  const W = Math.ceil((x1 - x0 + 2 * margin) * 2) / 2, H = Math.ceil((y1 - y0 + 2 * margin) * 2) / 2;
  const dx = snap(margin - x0), dy = snap(margin - y0);
  const final = placed.map(p => ({ ...p, x: +(p.x + dx).toFixed(4), y: +(p.y + dy).toFixed(4), box: [p.box[0] + dx, p.box[1] + dy, p.box[2] + dx, p.box[3] + dy] as Box }));
  const W2 = Math.max(W, Math.ceil(Math.max(...final.map(p => p.box[2])) + margin)), H2 = Math.max(H, Math.ceil(Math.max(...final.map(p => p.box[3])) + margin));
  const nets = prep.nets.map(n => ({ ...n }));
  const ncNet = () => { const id = nets.length; nets.push({ id, name: '', cls: 'signal', current: 0, width: 0, nc: true }); return id; };
  const pads = final.flatMap(p => padsOf(p, prep.pinNet[p.id], ncNet));
  const mount: Hole[] = holes && W2 >= 25 && H2 >= 25 ? [[3.5, 3.5], [W2 - 3.5, 3.5], [3.5, H2 - 3.5], [W2 - 3.5, H2 - 3.5]].map(([x, y]) => ({ x, y, d: 3.2 })) : [];
  const fpHoles = final.flatMap(p => (p.fp.holes ?? []).map(h => { const [hx, hy] = rotPt([h.x, h.y], p.rot); return { x: p.x + hx, y: p.y + hy, d: h.d }; }));
  return { name: prep.name, W: W2, H: H2, parts: final, pads, nets, tracks: [], vias: [], holes: [...mount, ...fpHoles], rules: prep.rules, virtual: prep.virtual, notes: [] };
}
