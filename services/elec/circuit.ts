// Circuit model and netlisting. A circuit is parts on a grid and wires (polylines). Points that
// touch (pin on a wire vertex or segment, wire ends meeting) join one net; ground symbols are net 0.

import { type Pt, compByKind, rotPt } from './components';

export interface CPart { id: string; kind: string; ref: string; x: number; y: number; rot: number; params: Record<string, number | string> }
export interface CWire { id: string; pts: Pt[] }
export interface Circuit { name: string; parts: CPart[]; wires: CWire[]; about?: string }

export interface Netlist {
  /** Net id per part pin: pinNet[partId][pinName]. Net 0 is ground. */
  pinNet: Record<string, Record<string, number>>;
  netCount: number;
  /** For each net: the pins on it ("R1.1"). */
  members: string[][];
  /** Net per wire (all its points share one net). */
  wireNet: Record<string, number>;
  hasGround: boolean;
}

export const pinPos = (p: CPart, at: Pt): Pt => { const r = rotPt(at, p.rot); return [p.x + r[0], p.y + r[1]]; };
const key = (p: Pt) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;

function onSegment(p: Pt, a: Pt, b: Pt) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (Math.abs(cross) > 1e-6) return false;
  return p[0] >= Math.min(a[0], b[0]) - 1e-6 && p[0] <= Math.max(a[0], b[0]) + 1e-6 && p[1] >= Math.min(a[1], b[1]) - 1e-6 && p[1] <= Math.max(a[1], b[1]) + 1e-6;
}

export function netlist(c: Circuit): Netlist {
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) { const n = parent.get(r); if (n === undefined) { parent.set(r, r); return r; } r = n; } return r; };
  const add = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
  const join = (a: string, b: string) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  // Pins.
  const pins: Array<{ part: CPart; name: string; p: Pt; k: string }> = [];
  for (const part of c.parts) { const def = compByKind(part.kind); if (!def) continue; for (const pin of def.pins) { const p = pinPos(part, pin.at); const k = key(p); add(k); pins.push({ part, name: pin.name, p, k }); } }
  // Wires: consecutive vertices are joined; any pin or wire vertex lying on a segment joins it.
  const points: Pt[] = [...pins.map(x => x.p), ...c.wires.flatMap(w => w.pts)];
  for (const w of c.wires) {
    for (let i = 0; i < w.pts.length; i++) { add(key(w.pts[i])); if (i) join(key(w.pts[i - 1]), key(w.pts[i])); }
    for (let i = 0; i + 1 < w.pts.length; i++) for (const p of points) if (onSegment(p, w.pts[i], w.pts[i + 1])) join(key(p), key(w.pts[i]));
  }
  // Ground symbols tie their nets together as net 0.
  const groundKeys = pins.filter(x => x.part.kind === 'ground').map(x => x.k);
  for (let i = 1; i < groundKeys.length; i++) join(groundKeys[0], groundKeys[i]);
  const ids = new Map<string, number>(); let next = 1;
  const gRoot = groundKeys.length ? find(groundKeys[0]) : null; if (gRoot) ids.set(gRoot, 0);
  const netOf = (k: string) => { const r = find(k); let id = ids.get(r); if (id === undefined) { id = next++; ids.set(r, id); } return id; };
  const pinNet: Netlist['pinNet'] = {}; const members: string[][] = [];
  for (const x of pins) { if (x.part.kind === 'ground') continue; const n = netOf(x.k); (pinNet[x.part.id] ??= {})[x.name] = n; (members[n] ??= []).push(`${x.part.ref}.${x.name}`); }
  const wireNet: Record<string, number> = {}; for (const w of c.wires) if (w.pts.length) wireNet[w.id] = netOf(key(w.pts[0]));
  for (let i = 0; i < next; i++) members[i] ??= [];
  return { pinNet, netCount: next, members, wireNet, hasGround: !!gRoot };
}

/** Next free reference for a prefix: R1, R2... */
export function nextRef(c: Circuit, prefix: string): string {
  const used = new Set(c.parts.map(p => p.ref)); for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
}

/** Bill of materials grouped by part and value. */
export function bom(c: Circuit): string[][] {
  const groups = new Map<string, { refs: string[]; name: string; value: string }>();
  for (const p of c.parts) {
    if (p.kind === 'ground') continue; const def = compByKind(p.kind); if (!def) continue;
    const value = def.label ? def.label(p.params) : ''; const k = `${p.kind}|${value}`;
    const g = groups.get(k) ?? { refs: [], name: def.name, value }; g.refs.push(p.ref); groups.set(k, g);
  }
  const sortRef = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [['Qty', 'References', 'Part', 'Value'], ...[...groups.values()].sort((a, b) => sortRef(a.refs[0], b.refs[0])).map(g => [String(g.refs.length), g.refs.sort(sortRef).join(', '), g.name, g.value])];
}
