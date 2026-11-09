// Design-rule check on the finished geometry (it does not trust the router): clearance between
// every pair of copper items on different nets (with the mains spacing where it applies), copper to
// board edge, track width (fab minimum and current rating), connectivity (unrouted nets, from the
// copper itself), drill sizes, hole spacing and annular rings. Plus the ratsnest for what is left.

import { cap, dist, bbox, type Shape } from './geom';
import { padShape } from './route';
import { type Board, type Layer, clearanceFor, ipcWidth } from './types';

export type DrcLevel = 'error' | 'warning' | 'pass';
export interface DrcItem { level: DrcLevel; rule: 'clearance' | 'edge' | 'width' | 'unrouted' | 'drill' | 'annular' | 'hole-gap' | 'mains'; text: string; at?: [number, number] }

interface Cu { net: number; layers: Layer[]; s: Shape; label: string; kind: 'pad' | 'track' | 'via'; group?: string }
const f2 = (v: number) => v.toFixed(2);

function copper(b: Board): Cu[] {
  return [
    ...b.pads.map(p => ({ net: p.net, layers: p.layers, s: padShape(p), label: `${p.ref} pad ${p.name || '(NC)'}`, kind: 'pad' as const, group: p.group })),
    ...b.tracks.map(t => ({ net: t.net, layers: [t.layer], s: cap(t.a[0], t.a[1], t.b[0], t.b[1], t.w / 2), label: `${b.nets[t.net]?.name} track`, kind: 'track' as const })),
    ...b.vias.map(v => ({ net: v.net, layers: ['top', 'bottom'] as Layer[], s: cap(v.x, v.y, v.x, v.y, v.d / 2), label: `${b.nets[v.net]?.name} via`, kind: 'via' as const })),
  ];
}
const shareLayer = (a: Cu, c: Cu) => a.layers.some(l => c.layers.includes(l));

/** Connected copper islands per net (pads joined inside a part count as one). Map net → list of components, each a list of pad ids. */
export function connectivity(b: Board): Map<number, string[][]> {
  const cu = copper(b); const parent = cu.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (i: number, j: number) => { const a = find(i), c = find(j); if (a !== c) parent[a] = c; };
  const byGroup = new Map<string, number>();
  cu.forEach((c, i) => { if (c.group) { const g = byGroup.get(c.group); if (g === undefined) byGroup.set(c.group, i); else join(g, i); } });
  const boxes = cu.map(c => bbox(c.s));
  for (let i = 0; i < cu.length; i++) for (let j = i + 1; j < cu.length; j++) {
    if (cu[i].net !== cu[j].net || !shareLayer(cu[i], cu[j])) continue; const a = boxes[i], c = boxes[j];
    if (a[0] > c[2] + 1e-6 || c[0] > a[2] + 1e-6 || a[1] > c[3] + 1e-6 || c[1] > a[3] + 1e-6) continue;
    if (dist(cu[i].s, cu[j].s) <= 1e-6) join(i, j);
  }
  const out = new Map<number, string[][]>();
  const comps = new Map<number, Map<number, string[]>>();
  cu.forEach((c, i) => { if (c.kind !== 'pad' || b.nets[c.net]?.nc) return; const m = comps.get(c.net) ?? new Map(); const r = find(i); const a = m.get(r) ?? []; a.push(b.pads[i].id); m.set(r, a); comps.set(c.net, m); });
  for (const [n, m] of comps) out.set(n, [...m.values()]);
  return out;
}

/** Straight lines still to route: a minimum spanning tree between each net's copper islands. */
export function ratsnest(b: Board): Array<{ net: number; a: [number, number]; b: [number, number] }> {
  const pad = new Map(b.pads.map(p => [p.id, p])); const lines: Array<{ net: number; a: [number, number]; b: [number, number] }> = [];
  for (const [net, comps] of connectivity(b)) {
    if (comps.length < 2) continue; const inTree = new Set([0]);
    while (inTree.size < comps.length) {
      let best: { d: number; k: number; a: [number, number]; c: [number, number] } | null = null;
      comps.forEach((cp, k) => { if (inTree.has(k)) return; for (const t of inTree) for (const pa of comps[t]) for (const pb of cp) { const p = pad.get(pa)!, q = pad.get(pb)!; const d = Math.hypot(p.x - q.x, p.y - q.y); if (!best || d < best.d) best = { d, k, a: [p.x, p.y], c: [q.x, q.y] }; } });
      const bb = best!; inTree.add(bb.k); lines.push({ net, a: bb.a, b: bb.c });
    }
  }
  return lines;
}

export function drc(b: Board): DrcItem[] {
  const r = b.rules; const out: DrcItem[] = []; const cu = copper(b); const boxes = cu.map(c => bbox(c.s));
  let worstMains = Infinity;
  // Clearance between copper on different nets.
  for (let i = 0; i < cu.length; i++) for (let j = i + 1; j < cu.length; j++) {
    const a = cu[i], c = cu[j]; if (a.net === c.net || !shareLayer(a, c)) continue;
    const need = clearanceFor(r, b.nets[a.net], b.nets[c.net]); const ba = boxes[i], bc = boxes[j];
    if (ba[0] > bc[2] + need || bc[0] > ba[2] + need || ba[1] > bc[3] + need || bc[1] > ba[3] + need) continue;
    const d = dist(a.s, c.s); const mains = b.nets[a.net]?.cls === 'mains' || b.nets[c.net]?.cls === 'mains';
    if (mains && b.nets[a.net]?.cls !== b.nets[c.net]?.cls) worstMains = Math.min(worstMains, d);
    if (d < need - 1e-6) out.push({ level: 'error', rule: mains ? 'mains' : 'clearance', text: `${a.label} to ${c.label}: ${f2(d)} mm, needs ${f2(need)} mm`, at: [(ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2] });
  }
  // Copper to board edge.
  cu.forEach((c, i) => { const bx = boxes[i]; const d = Math.min(bx[0], bx[1], b.W - bx[2], b.H - bx[3]); if (d < r.edge - 1e-6) out.push({ level: 'error', rule: 'edge', text: `${c.label} is ${f2(Math.max(0, d))} mm from the board edge (needs ${f2(r.edge)} mm)`, at: [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2] }); });
  // Track widths.
  const necked = new Map<number, number>();
  for (const t of b.tracks) {
    if (t.w < r.minWidth - 1e-9) out.push({ level: 'error', rule: 'width', text: `${b.nets[t.net]?.name} track ${f2(t.w)} mm is under the ${f2(r.minWidth)} mm fab minimum`, at: t.a });
    const want = ipcWidth(b.nets[t.net]?.current * 1.2, r.tempRise, r.copperOz); if (t.w < want - 1e-6) necked.set(t.net, Math.min(necked.get(t.net) ?? Infinity, t.w));
  }
  for (const [n, w] of necked) { const net = b.nets[n]; out.push({ level: 'warning', rule: 'width', text: `${net.name} carries about ${net.current.toFixed(2)} A: ${f2(w)} mm track is narrower than the ${f2(ipcWidth(net.current * 1.2, r.tempRise, r.copperOz))} mm IPC-2221 width for a ${r.tempRise} °C rise. Use 2 oz copper or widen by hand.` }); }
  // Unrouted.
  for (const [n, comps] of connectivity(b)) if (comps.length > 1) out.push({ level: 'error', rule: 'unrouted', text: `${b.nets[n].name}: ${comps.length - 1} connection${comps.length > 2 ? 's' : ''} unrouted (${comps.map(c => c[0]).join(' ↔ ')})` });
  // Drills, annular rings, hole spacing.
  const holes: Array<{ x: number; y: number; d: number; label: string; net: number }> = [
    ...b.pads.filter(p => p.drill).map(p => ({ x: p.x, y: p.y, d: p.drill!, label: `${p.ref} pad ${p.name || '(NC)'}`, net: p.net })),
    ...b.vias.map(v => ({ x: v.x, y: v.y, d: v.drill, label: `${b.nets[v.net]?.name} via`, net: v.net })),
    ...b.holes.map(h => ({ x: h.x, y: h.y, d: h.d, label: 'mounting hole', net: -1 })),
  ];
  for (const p of b.pads) if (p.drill) {
    if (p.drill < r.minDrill - 1e-9) out.push({ level: 'error', rule: 'drill', text: `${p.ref} pad ${p.name}: ${f2(p.drill)} mm drill under the ${f2(r.minDrill)} mm minimum`, at: [p.x, p.y] });
    const ring = (Math.min(p.w, p.h) - p.drill) / 2; if (ring < r.annular - 1e-9) out.push({ level: 'error', rule: 'annular', text: `${p.ref} pad ${p.name}: ${f2(ring)} mm annular ring (needs ${f2(r.annular)} mm)`, at: [p.x, p.y] });
  }
  for (const v of b.vias) { if (v.drill < r.minDrill - 1e-9) out.push({ level: 'error', rule: 'drill', text: `Via ${f2(v.drill)} mm drill under the minimum`, at: [v.x, v.y] }); if ((v.d - v.drill) / 2 < r.annular - 1e-9) out.push({ level: 'error', rule: 'annular', text: `Via annular ring ${f2((v.d - v.drill) / 2)} mm`, at: [v.x, v.y] }); }
  for (const h of holes) if (h.d > 6.35) out.push({ level: 'warning', rule: 'drill', text: `${h.label}: ${f2(h.d)} mm hole is larger than most fabs drill; it will be routed`, at: [h.x, h.y] });
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    const a = holes[i], c = holes[j]; const gap = Math.hypot(a.x - c.x, a.y - c.y) - a.d / 2 - c.d / 2;
    if (gap < r.holeGap - 1e-6) out.push({ level: 'error', rule: 'hole-gap', text: `${a.label} and ${c.label}: holes ${f2(Math.max(0, gap))} mm apart (needs ${f2(r.holeGap)} mm)`, at: [a.x, a.y] });
  }
  const errs = (k: DrcItem['rule']) => out.some(x => x.level === 'error' && x.rule === k);
  const pass = (rule: DrcItem['rule'], text: string) => { if (!errs(rule)) out.push({ level: 'pass', rule, text }); };
  pass('clearance', `Copper spacing ≥ ${f2(r.clearance)} mm everywhere`);
  pass('edge', `Copper ≥ ${f2(r.edge)} mm from the board edge`);
  pass('unrouted', 'Every net is routed');
  pass('drill', `Drills ≥ ${f2(r.minDrill)} mm`); pass('annular', `Annular rings ≥ ${f2(r.annular)} mm`); pass('hole-gap', `Holes ≥ ${f2(r.holeGap)} mm apart`);
  if (b.nets.some(n => n.cls === 'mains')) pass('mains', `Mains copper ≥ ${f2(r.mainsIso)} mm from low-voltage copper${Number.isFinite(worstMains) ? ` (closest ${f2(worstMains)} mm)` : ''}, ≥ ${f2(r.mainsLN)} mm line to neutral`);
  return out;
}

export const drcCounts = (items: DrcItem[]) => ({ errors: items.filter(x => x.level === 'error').length, warnings: items.filter(x => x.level === 'warning').length });
