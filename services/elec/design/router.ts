// Schematic placement helpers and a grid maze router. The netlister joins any pin or wire vertex
// that lies on a wire, so the router keeps every net to its own grid points: a wire may cross
// another net only straight through a point where neither turns or ends, never runs along it,
// and never touches another net's pin. Grounds get a local ground symbol beside the pin.
// Output: wires plus the intended pin pairs, so verifyDesign can prove the drawing.
// Released by Plajah as public domain (CC0).

import { type Pt, compByKind, compDefaults, rotPt } from '../components';
import { type CPart, type CWire, pinPos } from '../circuit';

export interface NetDef { name: string; pins: Array<[string, string]> }
type Dir = 0 | 1 | 2 | 3; // right, down, left, up
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const K = (x: number, y: number) => `${x},${y}`;

/** Bounding box of a placed part's symbol and pins (grid units). */
export function partBox(p: Pick<CPart, 'kind' | 'x' | 'y' | 'rot'>): { x0: number; y0: number; x1: number; y1: number } {
  const def = compByKind(p.kind)!; const xs: number[] = [], ys: number[] = [];
  const push = (q: Pt) => { const r = rotPt(q, p.rot); xs.push(p.x + r[0]); ys.push(p.y + r[1]); };
  for (const s of def.symbol) { if (s.kind === 'line') { push(s.a); push(s.b); } else if (s.kind === 'poly') s.pts.forEach(push); else if (s.kind === 'circle' || s.kind === 'arc') { push([s.c[0] - s.r, s.c[1] - s.r]); push([s.c[0] + s.r, s.c[1] + s.r]); } }
  for (const pin of def.pins) push(pin.at);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
export const makePart = (kind: string, ref: string, x: number, y: number, rot = 0, params: Record<string, number | string> = {}): CPart => {
  const def = compByKind(kind); if (!def) throw new Error(`Unknown part kind ${kind}`);
  return { id: ref, kind, ref, x, y, rot, params: { ...compDefaults(def), ...params } };
};

/** Which way a pin faces out of its part's body. */
function outward(p: CPart, pin: string): Dir {
  const def = compByKind(p.kind)!; const at = def.pins.find(q => q.name === pin)!.at; const q = pinPos(p, at); const b = partBox(p);
  const d = [b.x1 - q[0], b.y1 - q[1], q[0] - b.x0, q[1] - b.y0]; // distance to right, bottom, left, top edges
  const m = Math.min(...d); return (d.indexOf(m) === 0 ? 0 : d.indexOf(m) === 1 ? 1 : d.indexOf(m) === 2 ? 2 : 3) as Dir;
}

export class Router {
  private blocked = new Set<string>();
  private pinNet = new Map<string, string>();
  private edges = new Map<string, string>(); // "x,y,h" / "x,y,v" -> net
  private use = new Map<string, Array<{ net: string; axis: 'h' | 'v' | 'x' }>>(); // 'x' = vertex (turn, end, tee)
  private tree = new Map<string, Set<string>>(); // net -> points already on it
  wires: CWire[] = []; pairs: Array<[string, string]> = []; private g = 0;
  bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  constructor(public parts: CPart[]) { for (const p of parts) this.register(p); }

  private pinPt(ref: string, pin: string): [number, number] {
    const p = this.parts.find(q => q.ref === ref); if (!p) throw new Error(`No part ${ref}`); const def = compByKind(p.kind)!; const at = def.pins.find(q => q.name === pin); if (!at) throw new Error(`${ref} has no pin ${pin}`);
    const q = pinPos(p, at.at); return [Math.round(q[0]), Math.round(q[1])];
  }
  private register(p: CPart) {
    const b = partBox(p); const def = compByKind(p.kind)!;
    for (const pin of def.pins) { const [x, y] = this.pinPt(p.ref, pin.name); if (!this.pinNet.has(K(x, y))) this.pinNet.set(K(x, y), `__nc:${p.ref}.${pin.name}`); }
    for (let x = Math.ceil(b.x0); x <= Math.floor(b.x1); x++) for (let y = Math.ceil(b.y0); y <= Math.floor(b.y1); y++) if (!this.pinNet.has(K(x, y))) this.blocked.add(K(x, y));
    if (p.kind === 'ground') for (let x = p.x - 1; x <= p.x + 1; x++) this.blocked.add(K(x, p.y));
    this.bounds = this.parts.length === 1 ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : { x0: Math.min(this.bounds.x0, b.x0), y0: Math.min(this.bounds.y0, b.y0), x1: Math.max(this.bounds.x1, b.x1), y1: Math.max(this.bounds.y1, b.y1) };
  }
  /** Claim pins for nets before routing, so no other net can touch them. */
  assign(nets: NetDef[]) {
    for (const n of nets) for (const [r, pin] of n.pins) { const [x, y] = this.pinPt(r, pin); this.pinNet.set(K(x, y), n.name); }
    // Reserve the first two grid points in front of each pin for its own net, so no other wire seals the pin off.
    for (const n of nets) for (const [r, pin] of n.pins) {
      const p = this.parts.find(q => q.ref === r)!; const d = outward(p, pin); const [x, y] = this.pinPt(r, pin);
      for (let s = 1; s <= 2; s++) { const k = K(x + DX[d] * s, y + DY[d] * s); if (this.blocked.has(k) || this.pinNet.has(k)) break; this.pinNet.set(k, n.name); this.reserved.add(k); }
    }
  }
  private reserved = new Set<string>();

  private free(x: number, y: number) { return !this.blocked.has(K(x, y)) && !this.pinNet.has(K(x, y)) && !this.use.has(K(x, y)); }
  /** A ground symbol next to the pin, joined by a short straight wire. */
  ground(ref: string, pin: string) {
    const p = this.parts.find(q => q.ref === ref)!; const [px, py] = this.pinPt(ref, pin); const pref = outward(p, pin);
    const order: Dir[] = [pref, 1, ((pref + 1) % 4) as Dir, ((pref + 3) % 4) as Dir, 3];
    for (const dist of [2, 3, 4, 5, 6, 8]) for (const d of order) {
      const gx = px + DX[d] * dist, gy = py + DY[d] * dist; let ok = true;
      for (let s = 1; s <= dist && ok; s++) ok = this.free(px + DX[d] * s, py + DY[d] * s);
      for (let x = gx - 1; x <= gx + 1 && ok; x++) for (let y = gy; y <= gy + 1 && ok; y++) if (!(x === gx && y === gy) && (this.pinNet.has(K(x, y)) || this.use.has(K(x, y)) || this.blocked.has(K(x, y)))) ok = false;
      if (!ok) continue;
      const gref = `GND${++this.g}`; const gp = makePart('ground', gref, gx, gy + 1); this.parts.push(gp); this.register(gp); this.pinNet.set(K(gx, gy), `GND#${gref}`);
      const net = `GND#${gref}`; this.pinNet.set(K(px, py), net);
      this.commit(net, Array.from({ length: dist + 1 }, (_, s) => [px + DX[d] * s, py + DY[d] * s] as [number, number]));
      this.pairs.push([`${ref}.${pin}`, `${gref}.GND`]); return;
    }
    // No room beside the pin: route to a ground symbol placed in open space below the drawing.
    const gx = Math.round(px), gy = Math.round(this.bounds.y1) + 3 + 2 * this.g; const gref = `GND${++this.g}`; const gp = makePart('ground', gref, gx, gy + 1); this.parts.push(gp); this.register(gp);
    const net = `GND#${gref}`; this.pinNet.set(K(px, py), net); this.pinNet.set(K(gx, gy), net); this.connect(net, [[ref, pin], [gref, 'GND']]);
  }

  private commit(net: string, path: Array<[number, number]>) {
    // Simplify to vertices.
    const v: Array<[number, number]> = [path[0]];
    for (let i = 1; i < path.length - 1; i++) { const a = path[i - 1], b = path[i], c = path[i + 1]; if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue; v.push(b); }
    if (path.length > 1) v.push(path[path.length - 1]);
    const vert = new Set(v.map(([x, y]) => K(x, y))); const t = this.tree.get(net) ?? new Set<string>(); this.tree.set(net, t);
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i]; const k = K(x, y); t.add(k);
      const axis: 'h' | 'v' | 'x' = vert.has(k) ? 'x' : path[i - 1][1] === y ? 'h' : 'v';
      const u = this.use.get(k) ?? []; if (!u.some(e => e.net === net && e.axis === axis)) u.push({ net, axis }); this.use.set(k, u);
      if (i) { const [a, b] = path[i - 1]; this.edges.set(a === x ? `${x},${Math.min(b, y)},v` : `${Math.min(a, x)},${y},h`, net); }
    }
    if (v.length > 1) this.wires.push({ id: `w${this.wires.length + 1}`, pts: v });
  }

  /** Route one net: connect each pin to the growing tree with A* (bend-penalised). */
  connect(net: string, pins: Array<[string, string]>) {
    if (pins.length < 2) return;
    const pts = pins.map(([r, p]) => this.pinPt(r, p)); for (const [x, y] of pts) this.pinNet.set(K(x, y), net);
    const t = this.tree.get(net) ?? new Set<string>(); this.tree.set(net, t); t.add(K(...pts[0]));
    const done = [0]; const todo = pins.map((_, i) => i).slice(1);
    while (todo.length) {
      // Nearest pin to the tree first.
      let bi = 0, bd = Infinity; for (let j = 0; j < todo.length; j++) { const [x, y] = pts[todo[j]]; for (const k of t) { const [a, b] = k.split(',').map(Number); const d = Math.abs(a - x) + Math.abs(b - y); if (d < bd) { bd = d; bi = j; } } }
      const i = todo.splice(bi, 1)[0]; const target = pts[i];
      if (t.has(K(...target))) { this.pairs.push([`${pins[i][0]}.${pins[i][1]}`, `${pins[done[0]][0]}.${pins[done[0]][1]}`]); done.push(i); continue; }
      let path: Array<[number, number]> | null = null;
      for (const margin of [8, 16, 30]) { path = this.search(net, target, margin); if (path) break; }
      if (!path) { const [tx, ty] = target; const nb = [0, 1, 2, 3].map(d => { const k = K(tx + DX[d], ty + DY[d]); return `${k}:${this.blocked.has(k) ? 'B' : ''}${this.pinNet.get(k) ?? ''}${(this.use.get(k) ?? []).map(e => e.net + e.axis).join('/')}`; }); throw new Error(`Could not route ${net} to ${pins[i].join('.')} at ${K(tx, ty)} [${nb.join(' ')}]`); }
      this.commit(net, path);
      this.pairs.push([`${pins[i][0]}.${pins[i][1]}`, `${pins[done[0]][0]}.${pins[done[0]][1]}`]); done.push(i);
    }
  }

  private search(net: string, target: [number, number], margin: number): Array<[number, number]> | null {
    const t = this.tree.get(net)!; const b = { x0: Math.floor(this.bounds.x0) - margin, y0: Math.floor(this.bounds.y0) - margin, x1: Math.ceil(this.bounds.x1) + margin, y1: Math.ceil(this.bounds.y1) + margin };
    const tk = K(...target);
    const otherUse = (k: string) => (this.use.get(k) ?? []).filter(e => e.net !== net);
    // States: point + arrival direction (4 = start). Binary heap on f.
    type S = { x: number; y: number; d: number; g: number; f: number; prev: S | null };
    const heap: S[] = []; const push = (s: S) => { heap.push(s); let i = heap.length - 1; while (i > 0) { const pi = (i - 1) >> 1; if (heap[pi].f <= heap[i].f) break; [heap[pi], heap[i]] = [heap[i], heap[pi]]; i = pi; } };
    const pop = () => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = (x: number, y: number) => Math.abs(x - target[0]) + Math.abs(y - target[1]);
    const best = new Map<string, number>();
    for (const k of t) { const [x, y] = k.split(',').map(Number); if (otherUse(k).length) continue; push({ x, y, d: 4, g: 0, f: h(x, y), prev: null }); }
    let guard = 0;
    while (heap.length && guard++ < 400000) {
      const s = pop(); const sk = `${s.x},${s.y},${s.d}`; if ((best.get(sk) ?? Infinity) < s.g) continue;
      if (s.x === target[0] && s.y === target[1]) { const out: Array<[number, number]> = []; for (let c: S | null = s; c; c = c.prev) out.push([c.x, c.y]); return out.reverse(); }
      const here = K(s.x, s.y); const crossing = otherUse(here).length > 0;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (s.d !== 4 && d === (s.d + 2) % 4) continue;
        if (crossing && d !== s.d) continue; // cannot turn on another net's wire
        const nx = s.x + DX[d], ny = s.y + DY[d]; if (nx < b.x0 || nx > b.x1 || ny < b.y0 || ny > b.y1) continue;
        const nk = K(nx, ny); const isT = nk === tk;
        if (this.blocked.has(nk) && !isT) continue;
        const pn = this.pinNet.get(nk); if (pn !== undefined && pn !== net) continue;
        const ek = d === 0 || d === 2 ? `${Math.min(s.x, nx)},${s.y},h` : `${s.x},${Math.min(s.y, ny)},v`; const en = this.edges.get(ek); if (en !== undefined && en !== net) continue;
        const ou = otherUse(nk);
        if (ou.length) { if (isT) continue; const axis = d === 0 || d === 2 ? 'h' : 'v'; if (ou.some(e => e.axis === 'x' || e.axis === axis)) continue; }
        // A start point on our own tree becomes a tee: it must not sit on another net.
        const turn = s.d !== 4 && d !== s.d ? 4 : 0;
        const g = s.g + 1 + turn + (ou.length ? 2 : 0) + (en === net ? 3 : 0);
        const key = `${nx},${ny},${d}`; if ((best.get(key) ?? Infinity) <= g) continue; best.set(key, g);
        push({ x: nx, y: ny, d, g, f: g + h(nx, ny), prev: s });
      }
    }
    return null;
  }
}
