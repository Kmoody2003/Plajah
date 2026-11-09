// Two-layer grid autorouter (Lee/A* maze search over a 1/16" grid, both copper layers, vias).
// For each net the other nets' copper is rasterised, inflated by the clearance that pair of nets
// needs (mains gets more) plus half the trace width plus half a grid step, so any trace drawn between
// free cell centres keeps its clearance exactly. Nets are connected pad-group by pad-group (Prim),
// wide power traces neck down only when the full width cannot get through (DRC then warns).

import { cap, ptDist, rect, bbox, type Shape } from './geom';
import { type Board, type Layer, type Pad, type Track, type Via, clearanceFor } from './types';

interface Obs { net: number; layers: 0 | 1 | 2; s: Shape; kind: 'pad' | 'track' | 'via' | 'hole' }
export const padShape = (p: Pad): Shape => p.shape === 'circle' ? cap(p.x, p.y, p.x, p.y, p.w / 2) : rect(p.x, p.y, p.w, p.h);
const L = (l: Layer) => (l === 'top' ? 0 : 1);

export interface RouteFail { net: number; name: string; to: string }
export interface RouteResult { failed: RouteFail[]; necked: Array<{ net: number; want: number; got: number }>; ms: number }

class Heap {
  k = new Float64Array(1024); v = new Int32Array(1024); n = 0;
  push(key: number, val: number) {
    if (this.n === this.k.length) { const k = new Float64Array(this.n * 2); k.set(this.k); this.k = k; const v = new Int32Array(this.n * 2); v.set(this.v); this.v = v; }
    let i = this.n++; while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] <= key) break; this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p; } this.k[i] = key; this.v[i] = val;
  }
  pop(): number {
    const top = this.v[0]; const key = this.k[--this.n], val = this.v[this.n]; let i = 0;
    while (true) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++; if (this.k[c] >= key) break; this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c; }
    this.k[i] = key; this.v[i] = val; return top;
  }
}

/** Default routing order: mains, then power by width, then signals shortest first, ground last. */
export function defaultOrder(b: Board): number[] {
  const span = (n: number) => { const ps = b.pads.filter(p => p.net === n); if (!ps.length) return 0; const xs = ps.map(p => p.x), ys = ps.map(p => p.y); return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys); };
  const rank = (n: number) => { const net = b.nets[n]; return net.cls === 'mains' ? 0 : net.name === 'GND' ? 3 : net.cls === 'power' ? 1 : 2; };
  return b.nets.filter(n => !n.nc && b.pads.filter(p => p.net === n.id).length > 1).map(n => n.id)
    .sort((a, c) => rank(a) - rank(c) || (rank(a) === 1 ? b.nets[c].width - b.nets[a].width : 0) || span(a) - span(c));
}

export function route(b: Board, o: { order?: number[]; viaCost?: number } = {}): RouteResult {
  const t0 = Date.now(); const r = b.rules; const g = r.grid; const NX = Math.floor(b.W / g) + 1, NY = Math.floor(b.H / g) + 1; const NC = NX * NY;
  b.tracks = []; b.vias = [];
  const obs: Obs[] = [
    ...b.pads.map(p => ({ net: p.net, layers: (p.drill ? 2 : L(p.layers[0])) as 0 | 1 | 2, s: padShape(p), kind: 'pad' as const })),
    ...b.holes.map(h => ({ net: -1, layers: 2 as const, s: cap(h.x, h.y, h.x, h.y, h.d / 2), kind: 'hole' as const })),
  ];
  const groupsOf = (net: number) => { const m = new Map<string, Pad[]>(); for (const p of b.pads) if (p.net === net) { const a = m.get(p.group) ?? []; a.push(p); m.set(p.group, a); } return [...m.values()]; };
  const blocked = [new Uint8Array(NC), new Uint8Array(NC)]; const viaBad = new Uint8Array(NC);
  const S = NC * 2 * 4; const gs = new Float32Array(S); const par = new Int32Array(S); const stamp = new Uint32Array(S); let gen = 0;
  const isTarget = new Uint32Array(NC * 2); let tgen = 0;
  const viaCost = o.viaCost ?? 14;

  const raster = (net: number, w: number) => {
    blocked[0].fill(0); blocked[1].fill(0); viaBad.fill(0); const me = b.nets[net];
    const edgeT = r.edge + w / 2, edgeV = r.edge + r.viaD / 2;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = i * g, y = j * g; const d = Math.min(x, y, b.W - x, b.H - y); const k = j * NX + i;
      if (d < edgeT) { blocked[0][k] = 1; blocked[1][k] = 1; } if (d < edgeV) viaBad[k] = 1;
    }
    const mark = (s: Shape, R: number, layers: 0 | 1 | 2 | 'via') => {
      const [x0, y0, x1, y1] = bbox(s); const i0 = Math.max(0, Math.floor((x0 - R) / g)), i1 = Math.min(NX - 1, Math.ceil((x1 + R) / g)), j0 = Math.max(0, Math.floor((y0 - R) / g)), j1 = Math.min(NY - 1, Math.ceil((y1 + R) / g));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (ptDist(i * g, j * g, s) >= R - 1e-9) continue; const k = j * NX + i;
        if (layers === 'via') viaBad[k] = 1; else { if (layers !== 1) blocked[0][k] = 1; if (layers !== 0) blocked[1][k] = 1; }
      }
    };
    for (const ob of obs) {
      // Own net: no via inside or hard against its own pads, and keep drill-to-drill spacing to its own vias.
      if (ob.net === net) { if (ob.kind === 'pad') mark(ob.s, r.viaD / 2 + r.holeGap, 'via'); else if (ob.kind === 'via') mark(ob.s, r.holeGap + r.viaDrill - r.viaD / 2, 'via'); continue; }
      const hole = ob.kind === 'hole'; const c = hole ? r.edge : clearanceFor(r, me, b.nets[ob.net]);
      mark(ob.s, c + w / 2 + g / 2, ob.layers);
      mark(ob.s, Math.max(c + r.viaD / 2, hole ? r.holeGap + r.viaDrill / 2 : 0), 'via');
    }
  };
  const padCells = (p: Pad, out: number[]) => {
    const s = padShape(p); const [x0, y0, x1, y1] = bbox(s);
    for (let j = Math.max(0, Math.ceil(y0 / g)); j <= Math.min(NY - 1, Math.floor(y1 / g)); j++) for (let i = Math.max(0, Math.ceil(x0 / g)); i <= Math.min(NX - 1, Math.floor(x1 / g)); i++) {
      if (ptDist(i * g, j * g, s) > 1e-9) continue; for (const l of p.layers) { const li = L(l); if (!blocked[li][j * NX + i]) out.push(li * NC + j * NX + i); }
    }
  };

  /** A* from any source cell to any target cell. Returns the path (cell ids with layer) or null. */
  const search = (sources: number[], targets: Pad[]): number[] | null => {
    tgen++; let any = false; const tc: number[] = []; for (const p of targets) padCells(p, tc); for (const c of tc) { isTarget[c] = tgen; any = true; } if (!any) return null;
    const hx = targets.map(p => [p.x / g, p.y / g, Math.min(p.w, p.h) / 2 / g]);
    const h = (i: number, j: number) => { let m = Infinity; for (const [x, y, rr] of hx) m = Math.min(m, Math.max(0, Math.abs(i - x) + Math.abs(j - y) - rr)); return m; };
    gen++; const heap = new Heap();
    for (const c of sources) { const li = c >= NC ? 1 : 0, k = c - li * NC; if (blocked[li][k]) continue; if (isTarget[c] === tgen) return [c];
      for (let d = 0; d < 4; d++) { const s = c * 4 + d; stamp[s] = gen; gs[s] = 0; par[s] = -1; heap.push(h(k % NX, (k / NX) | 0), s); } }
    const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1]; let pops = 0;
    while (heap.n) {
      const s = heap.pop(); const c = s >> 2, d = s & 3; const li = c >= NC ? 1 : 0, k = c - li * NC; const i = k % NX, j = (k / NX) | 0; const gc = gs[s];
      if (++pops > 4_000_000) return null;
      if (isTarget[c] === tgen) { const path: number[] = []; let q = s; while (q >= 0) { const cc = q >> 2; if (path[path.length - 1] !== cc) path.push(cc); q = par[q]; } return path.reverse(); }
      for (let nd = 0; nd < 4; nd++) {
        const ni = i + DI[nd], nj = j + DJ[nd]; if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue; const nk = nj * NX + ni; if (blocked[li][nk]) continue;
        const pref = (li === 0) === (nd < 2) ? 0 : 0.6; const cost = gc + 1 + pref + (nd !== d ? 0.8 : 0);
        const ns = (li * NC + nk) * 4 + nd; if (stamp[ns] === gen && gs[ns] <= cost) continue; stamp[ns] = gen; gs[ns] = cost; par[ns] = s; heap.push(cost + h(ni, nj), ns);
      }
      const ol = 1 - li; if (!viaBad[k] && !blocked[ol][k] && !blocked[li][k]) {
        const ns = (ol * NC + k) * 4 + d; const cost = gc + viaCost; if (!(stamp[ns] === gen && gs[ns] <= cost)) { stamp[ns] = gen; gs[ns] = cost; par[ns] = s; heap.push(cost + h(i, j), ns); }
      }
    }
    return null;
  };

  const emit = (net: number, w: number, path: number[]) => {
    const pt = (c: number): [number, number, number] => { const li = c >= NC ? 1 : 0, k = c - li * NC; return [(k % NX) * g, ((k / NX) | 0) * g, li]; };
    let run: Array<[number, number]> = []; let lay = -1;
    const flush = () => {
      // Keep only corners.
      const pts = run.filter((p, i) => { if (i === 0 || i === run.length - 1) return true; const a = run[i - 1], c = run[i + 1]; return !((a[0] === p[0] && p[0] === c[0]) || (a[1] === p[1] && p[1] === c[1])); });
      for (let i = 0; i + 1 < pts.length; i++) { const t: Track = { net, layer: lay ? 'bottom' : 'top', a: [+pts[i][0].toFixed(5), +pts[i][1].toFixed(5)], b: [+pts[i + 1][0].toFixed(5), +pts[i + 1][1].toFixed(5)], w }; b.tracks.push(t); obs.push({ net, layers: L(t.layer), s: cap(t.a[0], t.a[1], t.b[0], t.b[1], w / 2), kind: 'track' }); }
      run = [];
    };
    for (const c of path) {
      const [x, y, li] = pt(c);
      if (li !== lay && lay >= 0) { flush(); const v: Via = { net, x: +x.toFixed(5), y: +y.toFixed(5), d: r.viaD, drill: r.viaDrill }; b.vias.push(v); obs.push({ net, layers: 2, s: cap(v.x, v.y, v.x, v.y, v.d / 2), kind: 'via' }); }
      lay = li; run.push([x, y]);
    }
    flush();
  };

  const failed: RouteFail[] = []; const necked: RouteResult['necked'] = [];
  for (const net of o.order ?? defaultOrder(b)) {
    const groups = groupsOf(net); if (groups.length < 2) continue;
    const want = b.nets[net].width; const widths = [...new Set([want, Math.max(r.signalWidth, Math.ceil(want * 10) / 20), r.signalWidth])].filter(w => w <= want);
    // Start from the group with the most pads (a module's ground, say).
    const inTree = new Set<number>([groups.reduce((bi, gp, i) => gp.length > groups[bi].length ? i : bi, 0)]); let sources: number[] = [];
    let wi = 0; raster(net, widths[0]); for (const p of groups[[...inTree][0]]) padCells(p, sources);
    let narrowest = want;
    while (inTree.size < groups.length) {
      // Next: the unconnected group closest to the tree.
      let best = -1, bd = Infinity;
      groups.forEach((gp, i) => { if (inTree.has(i)) return; for (const p of gp) for (const t of inTree) for (const q of groups[t]) { const d = Math.abs(p.x - q.x) + Math.abs(p.y - q.y); if (d < bd) { bd = d; best = i; } } });
      let path = search(sources, groups[best]);
      while (!path && wi + 1 < widths.length) {
        // Neck down: re-rasterise for a narrower trace and rebuild the source cells at that width.
        wi++; raster(net, widths[wi]); sources = []; for (const t of inTree) for (const p of groups[t]) padCells(p, sources);
        for (const t of b.tracks) if (t.net === net) traceCells(t, sources); path = search(sources, groups[best]);
      }
      inTree.add(best);
      if (!path) { failed.push({ net, name: b.nets[net].name, to: groups[best].map(p => p.id).join('/') }); continue; }
      const w = widths[wi]; narrowest = Math.min(narrowest, w);
      emit(net, w, path); for (const c of path) sources.push(c); for (const p of groups[best]) padCells(p, sources);
    }
    if (narrowest < want) necked.push({ net, want, got: narrowest });
  }
  function traceCells(t: Track, out: number[]) {
    const li = L(t.layer); const i0 = Math.round(t.a[0] / g), j0 = Math.round(t.a[1] / g), i1 = Math.round(t.b[0] / g), j1 = Math.round(t.b[1] / g);
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)); for (let s = 0; s <= n; s++) { const i = i0 + Math.round((i1 - i0) * s / (n || 1)), j = j0 + Math.round((j1 - j0) * s / (n || 1)); const k = j * NX + i; if (!blocked[li][k]) out.push(li * NC + k); }
  }
  return { failed, necked, ms: Date.now() - t0 };
}
