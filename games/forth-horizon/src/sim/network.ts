import { type P2, Grid, Heap, cumLen, dist, project, segIntersect } from './geom';

/**
 * The road graph: drawn and generated polylines become nodes (junctions, ends) and directed edges, with a road hierarchy that decides who may join whom.
 * Pure data, no three.js. See docs/apex-elohim/sim-layer.md.
 */
export type RoadClass = 'highway' | 'avenue' | 'collector' | 'street' | 'service' | 'dirt' | 'ramp';

/** speed in m/s, lanes per direction, rank for sorting (higher is bigger) */
export const ROAD_CLASS: Record<RoadClass, { speed: number; lanes: number; rank: number; half: number }> = {
  highway: { speed: 29, lanes: 2, rank: 5, half: 8.0 },
  avenue: { speed: 17, lanes: 2, rank: 4, half: 5.2 },
  ramp: { speed: 14, lanes: 1, rank: 3.5, half: 4.2 },
  collector: { speed: 14, lanes: 1, rank: 3, half: 4.3 },
  street: { speed: 11, lanes: 1, rank: 2, half: 3.4 },
  service: { speed: 7, lanes: 1, rank: 1, half: 3.0 },
  dirt: { speed: 8, lanes: 1, rank: 0, half: 2.6 },
};

/** may two crossing roads of these classes connect? Highways are grade-separated from everything but avenues, ramps and highways. */
export function canJoin(a: RoadClass, b: RoadClass): boolean {
  if (a === 'highway') return b === 'highway' || b === 'avenue' || b === 'ramp';
  if (b === 'highway') return a === 'avenue' || a === 'ramp';
  if (a === 'dirt' && b === 'avenue') return false;
  if (b === 'dirt' && a === 'avenue') return false;
  return true;
}

export interface RoadInput { id: string; cls: RoadClass; pts: P2[]; oneway?: boolean; speed?: number; lanes?: number; /** half the paved width, m (the class default otherwise) */ half?: number }

export interface GNode { id: number; x: number; z: number; out: number[] }
export interface GEdge {
  id: number; a: number; b: number; pts: P2[]; cum: number[]; len: number; cls: RoadClass; speed: number; lanes: number;
  /** half the paved width, m */
  half: number;
  /** the road this piece came from */
  road: string;
  /** the opposite direction's edge, or -1 for one-way */
  twin: number;
  /** in the largest connected part: agents only use these */
  main: boolean;
}

export interface RoadGraph {
  nodes: GNode[]; edges: GEdge[];
  nearestNode: (x: number, z: number, maxR: number, mainOnly?: boolean) => GNode | null;
  nearestEdge: (x: number, z: number, maxR: number) => { edge: GEdge; s: number; d: number } | null;
  /** edges whose segments touch the box */
  edgesNear: (x: number, z: number, r: number) => GEdge[];
  stats: { roads: number; junctions: number; edges: number; mainEdges: number; km: number };
}

interface Cut { road: number; seg: number; t: number; x: number; z: number }

const SNAP = 14;     // an end within this of another road is joined to it
const MERGE = 4;     // two junctions closer than this are one

export function buildRoadGraph(inputs: RoadInput[]): RoadGraph {
  const roads = inputs.filter((r) => r.pts.length >= 2);
  const segGrid = new Grid<{ r: number; i: number }>(160);
  roads.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1], l = dist(a, b), n = Math.max(1, Math.ceil(l / 80));
      const seen = new Set<number>();
      for (let k = 0; k <= n; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / n), z = a[1] + (b[1] - a[1]) * (k / n), key = Math.floor(x / 160) * 100003 + Math.floor(z / 160);
        if (!seen.has(key)) { seen.add(key); segGrid.add(x, z, { r: ri, i }); }
      }
    }
  });

  const cuts: Cut[] = [];
  // 1. crossings (only where the hierarchy allows a junction)
  const done = new Set<string>();
  roads.forEach((r, ri) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i], b = r.pts[i + 1];
      const x0 = Math.min(a[0], b[0]) - 1, x1 = Math.max(a[0], b[0]) + 1, z0 = Math.min(a[1], b[1]) - 1, z1 = Math.max(a[1], b[1]) + 1;
      if (x1 - x0 > 2000 || z1 - z0 > 2000) {
        // a very long segment: query along it instead of its whole box
        const n = Math.ceil(dist(a, b) / 120);
        for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * (k / n), z = a[1] + (b[1] - a[1]) * (k / n); scan(ri, i, x - 100, z - 100, x + 100, z + 100); }
      } else scan(ri, i, x0, z0, x1, z1);
    }
  });
  function scan(ri: number, i: number, x0: number, z0: number, x1: number, z1: number): void {
    const r = roads[ri], a = r.pts[i], b = r.pts[i + 1];
    segGrid.query(x0, z0, x1, z1, (o) => {
      if (o.r <= ri) return;
      const q = roads[o.r];
      if (!canJoin(r.cls, q.cls)) return;
      const key = ri + ':' + i + ':' + o.r + ':' + o.i;
      if (done.has(key)) return; done.add(key);
      const hit = segIntersect(a, b, q.pts[o.i], q.pts[o.i + 1]);
      if (!hit) return;
      const x = a[0] + (b[0] - a[0]) * hit.t, z = a[1] + (b[1] - a[1]) * hit.t;
      cuts.push({ road: ri, seg: i, t: hit.t, x, z }, { road: o.r, seg: o.i, t: hit.u, x, z });
    });
  }
  // 2. loose ends: an end near another road joins it (T junctions, and roads that stop a few metres short)
  roads.forEach((r, ri) => {
    for (const endIdx of [0, r.pts.length - 1]) {
      const e = r.pts[endIdx];
      let best: { r: number; i: number; t: number; d: number; x: number; z: number } | null = null;
      segGrid.query(e[0] - SNAP, e[1] - SNAP, e[0] + SNAP, e[1] + SNAP, (o) => {
        if (o.r === ri) return;
        const q = roads[o.r], a = q.pts[o.i], b = q.pts[o.i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((e[0] - a[0]) * dx + (e[1] - a[1]) * dz) / l2));
        const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - e[0], pz - e[1]);
        // a highway end may meet anything (it is a terminus); other classes follow the hierarchy
        if (d < SNAP && (!best || d < best.d) && (r.cls === 'highway' || canJoin(r.cls, q.cls))) best = { r: o.r, i: o.i, t, d, x: px, z: pz };
      });
      if (best) {
        const bb = best as { r: number; i: number; t: number; d: number; x: number; z: number };
        cuts.push({ road: bb.r, seg: bb.i, t: bb.t, x: bb.x, z: bb.z });
        // the end moves exactly onto the other road
        if (bb.d > 0.01) r.pts[endIdx] = [bb.x, bb.z];
      }
    }
  });

  // 3. nodes and edges
  const nodes: GNode[] = [];
  const nodeGrid = new Grid<number>(32);
  const nodeAt = (x: number, z: number): number => {
    let found = -1;
    nodeGrid.query(x - MERGE, z - MERGE, x + MERGE, z + MERGE, (id) => { if (found < 0 && Math.hypot(nodes[id].x - x, nodes[id].z - z) <= MERGE) found = id; });
    if (found >= 0) return found;
    const id = nodes.length; nodes.push({ id, x, z, out: [] }); nodeGrid.add(x, z, id); return id;
  };
  const byRoad: Cut[][] = roads.map(() => []);
  for (const c of cuts) byRoad[c.road].push(c);
  const edges: GEdge[] = [];
  roads.forEach((r, ri) => {
    const cs = byRoad[ri].sort((p, q) => (p.seg - q.seg) || (p.t - q.t));
    // walk the polyline, ending a piece at every cut
    let cur: P2[] = [r.pts[0]], startNode = nodeAt(r.pts[0][0], r.pts[0][1]), ci = 0;
    const flush = (endPt: P2): void => {
      cur.push(endPt);
      const endNode = nodeAt(endPt[0], endPt[1]);
      const cum = cumLen(cur), len = cum[cum.length - 1];
      if (len >= 1.5 && endNode !== startNode) addEdge(r, ri, startNode, endNode, cur, cum, len);
      startNode = endNode; cur = [endPt];
    };
    for (let i = 0; i < r.pts.length - 1; i++) {
      while (ci < cs.length && cs[ci].seg === i) {
        const c = cs[ci++];
        if (cur.length === 1 && dist([c.x, c.z], cur[0]) < 0.5) continue;      // two cuts at the same spot
        flush([c.x, c.z]);
      }
      if (i + 1 < r.pts.length - 1) cur.push(r.pts[i + 1]);
    }
    flush(r.pts[r.pts.length - 1]);
  });
  function addEdge(r: RoadInput, ri: number, a: number, b: number, pts: P2[], cum: number[], len: number): void {
    const meta = ROAD_CLASS[r.cls];
    const speed = r.speed ?? meta.speed, lanes = r.lanes ?? meta.lanes;
    const half = r.half ?? meta.half;
    const e: GEdge = { id: edges.length, a, b, pts, cum, len, cls: r.cls, speed, lanes, half, road: r.id, twin: -1, main: false };
    edges.push(e); nodes[a].out.push(e.id);
    if (!r.oneway) {
      const rp = pts.slice().reverse(), rc = cumLen(rp);
      const t: GEdge = { id: edges.length, a: b, b: a, pts: rp, cum: rc, len, cls: r.cls, speed, lanes, half, road: r.id, twin: e.id, main: false };
      e.twin = t.id; edges.push(t); nodes[b].out.push(t.id);
    }
    void ri;
  }

  // 4. connected parts; agents use the biggest ones (> 1.5 km of road)
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (const e of edges) parent[find(e.a)] = find(e.b);
  const km = new Map<number, number>();
  for (const e of edges) km.set(find(e.a), (km.get(find(e.a)) ?? 0) + e.len);
  const biggest = Math.max(0, ...km.values());
  for (const e of edges) e.main = (km.get(find(e.a)) ?? 0) >= Math.min(1500, biggest * 0.5);

  // 5. spatial lookup for edges
  const edgeGrid = new Grid<{ e: number; i: number }>(120);
  for (const e of edges) {
    if (e.twin >= 0 && e.twin < e.id) continue;      // one of a pair is enough for geometry queries
    for (let i = 0; i < e.pts.length - 1; i++) {
      const a = e.pts[i], b = e.pts[i + 1], n = Math.max(1, Math.ceil(dist(a, b) / 60)), seen = new Set<number>();
      for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * (k / n), z = a[1] + (b[1] - a[1]) * (k / n), key = Math.floor(x / 120) * 100003 + Math.floor(z / 120); if (!seen.has(key)) { seen.add(key); edgeGrid.add(x, z, { e: e.id, i }); } }
    }
  }
  const nearestNode: RoadGraph['nearestNode'] = (x, z, maxR, mainOnly = true) => {
    let best: GNode | null = null, bd = maxR;
    nodeGrid.query(x - maxR, z - maxR, x + maxR, z + maxR, (id) => {
      const n = nodes[id]; if (!n.out.length) return;
      if (mainOnly && !edges[n.out[0]].main) return;
      const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; }
    });
    return best;
  };
  const nearestEdge: RoadGraph['nearestEdge'] = (x, z, maxR) => {
    let best: { edge: GEdge; s: number; d: number } | null = null;
    edgeGrid.query(x - maxR, z - maxR, x + maxR, z + maxR, (o) => {
      const e = edges[o.e], a = e.pts[o.i], b = e.pts[o.i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
      if (d < maxR && (!best || d < best.d)) best = { edge: e, s: e.cum[o.i] + Math.sqrt(l2) * t, d };
    });
    return best;
  };
  const edgesNear: RoadGraph['edgesNear'] = (x, z, r) => {
    const seen = new Set<number>(), out: GEdge[] = [];
    edgeGrid.query(x - r, z - r, x + r, z + r, (o) => { if (!seen.has(o.e)) { seen.add(o.e); out.push(edges[o.e]); } });
    return out;
  };
  const mainEdges = edges.filter((e) => e.main).length;
  const junctions = nodes.filter((n) => n.out.length >= 3).length;
  void project;
  return { nodes, edges, nearestNode, nearestEdge, edgesNear, stats: { roads: roads.length, junctions, edges: edges.length, mainEdges, km: edges.reduce((s, e) => s + e.len, 0) / 2000 } };
}

/**
 * Shortest travel time between two nodes (A* with an optional extra cost per edge, e.g. for crowding).
 * Returns the directed edge ids from `from` to `to`, or null.
 */
export function shortestPath(g: RoadGraph, from: number, to: number, extra?: (e: GEdge) => number): number[] | null {
  if (from === to) return [];
  const N = g.nodes.length, gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const goal = g.nodes[to], H = (n: number): number => Math.hypot(g.nodes[n].x - goal.x, g.nodes[n].z - goal.z) / 30;
  const open = new Heap<number>(); gs[from] = 0; open.push(H(from), from);
  const closed = new Uint8Array(N);
  for (let it = 0; it < 400000; it++) {
    const top = open.pop(); if (!top) return null;
    const n = top.val; if (closed[n]) continue; closed[n] = 1;
    if (n === to) break;
    for (const ei of g.nodes[n].out) {
      const e = g.edges[ei]; if (!e.main) continue;
      const c = gs[n] + e.len / e.speed + (extra ? extra(e) : 0);
      if (c < gs[e.b]) { gs[e.b] = c; prev[e.b] = ei; open.push(c + H(e.b), e.b); }
    }
  }
  if (prev[to] < 0) return null;
  const path: number[] = [];
  for (let n = to; n !== from;) { const ei = prev[n]; path.push(ei); n = g.edges[ei].a; }
  return path.reverse();
}
