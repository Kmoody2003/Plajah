import type { GEdge, RoadClass, RoadGraph } from './network';

/**
 * Junction control for the road graph: every place three or more roads meet gets the control a real traffic engineer would give it, and the sim's cars obey it.
 *
 *  - signal     two major roads (collector or bigger) cross, or a four-way downtown junction: an actuated signal. Approaches are split into two groups by axis; each
 *               group gets green, 3.5 s amber and 1.5 s all-red in turn. Green rests on the major road and only changes when a car is waiting on the other one
 *               (after a minimum green), and it gaps out early when its own approaches are empty. Left turns on green yield to oncoming cars; right on red after a full stop.
 *  - allStop    four (or more) equal local streets: an all-way stop, first to stop goes first.
 *  - stop       a minor road joining a bigger one (or the stem of a T of equal streets): a stop sign on the minor approaches, which wait for a gap on the major road.
 *  - none       anything touching a freeway (merges) and plain bends.
 *
 * Pure data, no three.js. The renderer (src/intersections.ts) draws the stop lines, crosswalks, signal heads and signs from the same junctions.
 */
export type Control = 'signal' | 'allStop' | 'stop' | 'none';
export type Lamp = 'G' | 'Y' | 'R';

export interface Approach {
  /** the incoming edge (it ends at a node of the junction) */
  edge: number;
  /** unit direction of travel at the stop line, into the junction */
  dx: number; dz: number;
  cls: RoadClass; rank: number; half: number; lanes: number;
  /** distance along the edge of the stop line */
  stopS: number;
  /** distance back from the junction centre to the stop line */
  setback: number;
  /** signal group (0 or 1); -1 when not signalised */
  group: number;
  /** this approach has a stop sign (stop or allStop control) */
  stopSign: boolean;
  /** a crosswalk is painted in front of the stop line */
  crosswalk: boolean;
}

export interface Junction {
  id: number; x: number; z: number; nodes: number[]; control: Control; approaches: Approach[];
  /** signal state */
  phase: number; t: number; minG: number[]; maxG: number[];
  /** cars inside the box (past their stop line, not yet clear) */
  inside: number;
  /** all-way stop: car ids in the order they stopped */
  queue: number[];
  /** an approach of each group has a car waiting at red (refreshed each step) */
  demand: boolean[];
  /** a car is moving up to a green of each group (refreshed each step) */
  busy: boolean[];
}

/** the parts of a sim car the controller needs; it adds the hold state itself */
export interface SignalCar { id: number; path: number[]; pi: number; s: number; v: number; len: number; stoppedAt?: number; inJ?: number; inJEdge?: number }

const RANK: Record<RoadClass, number> = { highway: 5, avenue: 4, ramp: 3.5, collector: 3, street: 2, service: 1, dirt: 0 };
const AMBER = 3.5, ALL_RED = 1.5, CLUSTER = 12;
/** phases: 0 = group 0 green, 1 amber, 2 all red, 3 = group 1 green, 4 amber, 5 all red */
const PHASE_LEN = (j: Junction, p: number): number => (p === 1 || p === 4 ? AMBER : p === 2 || p === 5 ? ALL_RED : j.maxG[p === 0 ? 0 : 1]);

export class SignalSystem {
  readonly junctions: Junction[] = [];
  /** incoming edge id -> [junction, approach index] */
  readonly byEdge = new Map<number, [number, number]>();
  /** edge ids inside a junction (between two of its nodes) */
  private internal = new Set<number>();
  /** node id -> junction id */
  private byNode = new Map<number, number>();

  constructor(readonly g: RoadGraph, opts: { downtown?: (x: number, z: number) => boolean; seed?: number } = {}) {
    const { nodes, edges } = g;
    const incoming: number[][] = nodes.map(() => []);
    for (const e of edges) incoming[e.b].push(e.id);
    // legs of a node: undirected roads touching it
    const legs = (n: number): GEdge[] => {
      const out: GEdge[] = [];
      for (const ei of nodes[n].out) out.push(edges[ei]);
      for (const ei of incoming[n]) { const e = edges[ei]; if (e.twin < 0) out.push(e); }
      return out;
    };
    // junction nodes, clustered (an offset T a few metres from a crossing is one junction)
    const jn = nodes.filter((n) => legs(n.id).length >= 3).map((n) => n.id);
    const parent = new Map<number, number>(jn.map((n) => [n, n]));
    const find = (a: number): number => { while (parent.get(a) !== a) { const p = parent.get(parent.get(a)!)!; parent.set(a, p); a = p; } return a; };
    const cell = new Map<number, number[]>();
    const key = (x: number, z: number): number => Math.floor(x / CLUSTER) * 100003 + Math.floor(z / CLUSTER);
    for (const n of jn) { const k = key(nodes[n].x, nodes[n].z); (cell.get(k) ?? (cell.set(k, []), cell.get(k)!)).push(n); }
    for (const n of jn) {
      const cx = Math.floor(nodes[n].x / CLUSTER), cz = Math.floor(nodes[n].z / CLUSTER);
      for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (const m of cell.get((cx + i) * 100003 + cz + k) ?? []) {
        if (m === n) continue;
        // only through a short edge: two junctions on parallel roads 10 m apart stay separate
        const linked = nodes[n].out.some((ei) => edges[ei].b === m && edges[ei].len <= CLUSTER) || nodes[m].out.some((ei) => edges[ei].b === n && edges[ei].len <= CLUSTER);
        if (linked) parent.set(find(n), find(m));
      }
    }
    const groups = new Map<number, number[]>();
    for (const n of jn) { const r = find(n); (groups.get(r) ?? (groups.set(r, []), groups.get(r)!)).push(n); }
    let seed = opts.seed ?? 7; const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

    for (const members of groups.values()) {
      const inJ = new Set(members);
      for (const n of members) for (const ei of nodes[n].out) if (inJ.has(edges[ei].b)) this.internal.add(ei);
      const cx = members.reduce((s, n) => s + nodes[n].x, 0) / members.length, cz = members.reduce((s, n) => s + nodes[n].z, 0) / members.length;
      // approaches: incoming edges from outside the junction
      const app: Approach[] = [];
      for (const n of members) for (const ei of incoming[n]) {
        const e = edges[ei]; if (inJ.has(e.a)) continue;
        const p1 = e.pts[e.pts.length - 1];
        // direction at the stop line: over the last ~10 m of the edge
        let k = e.pts.length - 2; while (k > 0 && Math.hypot(p1[0] - e.pts[k][0], p1[1] - e.pts[k][1]) < 10) k--;
        const p0 = e.pts[Math.max(0, k)], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
        app.push({ edge: ei, dx: (p1[0] - p0[0]) / L, dz: (p1[1] - p0[1]) / L, cls: e.cls, rank: RANK[e.cls], half: e.half, lanes: e.lanes, stopS: e.len, setback: 0, group: -1, stopSign: false, crosswalk: false });
      }
      // the legs (both directions of a road count once) decide the control
      const legList: GEdge[] = []; for (const n of members) for (const l of legs(n)) if (!(inJ.has(l.a) && inJ.has(l.b))) legList.push(l);
      if (app.length < 2 || legList.length < 3) continue;
      const ranks = legList.map((l) => RANK[l.cls]).sort((a, b) => b - a);
      const anyHighway = legList.some((l) => l.cls === 'highway');
      const allDowntown = !!opts.downtown && opts.downtown(cx, cz);
      // two major roads (collector or bigger) that cross, not one major road running through: a signal
      const majors = app.filter((a) => a.rank >= 3);
      const crossingMajors = majors.some((a) => majors.some((b) => Math.abs(a.dx * b.dx + a.dz * b.dz) < 0.7));
      let control: Control;
      if (anyHighway) control = 'none';
      else if (crossingMajors || (allDowntown && legList.length >= 4)) control = 'signal';
      else if (legList.length >= 4 && ranks[0] === ranks[legList.length - 1]) control = 'allStop';
      else control = 'stop';
      // the crossing road's half width at each approach: the widest other leg (the stop line clears it, plus the crosswalk)
      const maxHalf = Math.max(...app.map((a) => a.half));
      for (const a of app) {
        let cross = 0;
        for (const b of app) { if (b === a) continue; const dot = Math.abs(a.dx * b.dx + a.dz * b.dz); if (dot < 0.75) cross = Math.max(cross, b.half); }
        if (!cross) cross = maxHalf;
        a.crosswalk = control === 'signal' || control === 'allStop' || (allDowntown && control !== 'none');
        a.setback = Math.max(4, cross + (a.crosswalk ? 4.6 : 1.4) + Math.max(0, (members.length - 1) * 2));
        const e = edges[a.edge];
        // measured from the junction centre back along the approach
        const end = e.pts[e.pts.length - 1], over = (end[0] - cx) * a.dx + (end[1] - cz) * a.dz;    // how far past the centre the edge ends (>0 when it ends beyond)
        a.stopS = Math.max(e.len * 0.35, e.len - a.setback - over);
      }
      if (control === 'stop') {
        const top = ranks[0];
        const minor = app.filter((a) => a.rank < top);
        if (minor.length) for (const a of minor) a.stopSign = true;
        else {
          // a T or Y of equal roads: the stem stops (the approach least in line with any other)
          let stem: Approach | null = null, worst = 2;
          for (const a of app) { let best = 0; for (const b of app) if (b !== a) best = Math.max(best, -(a.dx * b.dx + a.dz * b.dz)); if (best < worst) { worst = best; stem = a; } }
          if (stem) stem.stopSign = true;
        }
      } else if (control === 'allStop') for (const a of app) a.stopSign = true;
      if (control === 'signal') {
        // group by axis: the major approach sets axis 0
        const major = app.reduce((m, a) => (a.rank > m.rank || (a.rank === m.rank && a.lanes > m.lanes) ? a : m), app[0]);
        for (const a of app) a.group = Math.abs(a.dx * major.dx + a.dz * major.dz) > 0.7071 ? 0 : 1;
        if (!app.some((a) => a.group === 1)) control = 'stop';
      }
      const r0 = Math.max(0, ...app.filter((a) => a.group === 0).map((a) => a.rank)), r1 = Math.max(0, ...app.filter((a) => a.group === 1).map((a) => a.rank));
      const j: Junction = {
        id: this.junctions.length, x: cx, z: cz, nodes: members, control, approaches: app,
        phase: 0, t: rnd() * 10, minG: [r0 >= r1 ? 14 : 9, r1 > r0 ? 14 : 8], maxG: [r0 >= r1 ? 45 : 25, r1 > r0 ? 45 : 22], inside: 0, queue: [], demand: [false, false], busy: [false, false],
      };
      if (control === 'none') { for (const a of app) a.crosswalk = false; }
      this.junctions.push(j);
      for (const n of members) this.byNode.set(n, j.id);
      app.forEach((a, i) => this.byEdge.set(a.edge, [j.id, i]));
    }
  }

  /** what an approach's signal shows */
  lamp(j: Junction, a: Approach): Lamp {
    if (j.control !== 'signal') return 'R';
    const g = a.group === 0 ? [0, 1, 2] : [3, 4, 5];
    return j.phase === g[0] ? 'G' : j.phase === g[1] ? 'Y' : 'R';
  }

  stats(): Record<Control, number> {
    const s: Record<Control, number> = { signal: 0, allStop: 0, stop: 0, none: 0 };
    for (const j of this.junctions) s[j.control]++;
    return s;
  }

  /** advance the signals; call once per sim step, after `observe` has seen the cars */
  step(dt: number): void {
    for (const j of this.junctions) {
      if (j.control !== 'signal') continue;
      j.t += dt;
      const p = j.phase;
      if (p === 0 || p === 3) {
        const g = p === 0 ? 0 : 1, o = 1 - g;
        // rest in green until the other group has a car waiting; after the minimum green, change when this group's flow gaps out, or at the maximum
        const change = j.demand[o] && j.t >= j.minG[g] && (!j.busy[g] || j.t >= j.maxG[g]);
        if (change) { j.phase = p + 1; j.t = 0; }
      } else if (j.t >= PHASE_LEN(j, p)) { j.phase = (p + 1) % 6; j.t = 0; }
    }
  }

  /** clear the per-step demand flags */
  beginStep(): void { for (const j of this.junctions) { j.demand[0] = j.demand[1] = false; j.busy[0] = j.busy[1] = false; } }

  /** a car left the sim: release anything it held */
  release(c: SignalCar): void {
    if (c.inJ !== undefined) { const j = this.junctions[c.inJ]; if (j) j.inside = Math.max(0, j.inside - 1); c.inJ = undefined; }
    if (c.stoppedAt !== undefined) { const j = this.junctions[c.stoppedAt]; if (j) { const i = j.queue.indexOf(c.id); if (i >= 0) j.queue.splice(i, 1); } c.stoppedAt = undefined; }
  }

  /** after a car moved: track when it enters and leaves a junction box */
  moved(c: SignalCar): void {
    const e = c.path[c.pi];
    if (c.inJ !== undefined) {
      // clear once it is on an edge leaving the junction and past the far crosswalk
      if (e !== c.inJEdge && !this.internal.has(e) && c.s > 10 + c.len) { const j = this.junctions[c.inJ]; if (j) j.inside = Math.max(0, j.inside - 1); c.inJ = undefined; }
      return;
    }
    const hit = this.byEdge.get(e);
    if (!hit) return;
    const j = this.junctions[hit[0]], a = j.approaches[hit[1]];
    if (c.s + c.len * 0.5 > a.stopS + 0.5) {
      j.inside++; c.inJ = j.id; c.inJEdge = e;
      if (c.stoppedAt !== undefined) { const i = j.queue.indexOf(c.id); if (i >= 0) j.queue.splice(i, 1); c.stoppedAt = undefined; }
    }
  }

  /**
   * How far ahead (m, bumper to stop line) the car must treat as blocked by the junction, or Infinity to go. Also records demand for the signal.
   * `others` gives the cars on an edge, for gap checks (sorted by s).
   */
  limit(c: SignalCar, others: (edge: number) => SignalCar[]): number {
    if (c.inJ !== undefined) return Infinity;                                   // (a car whose trip ends at the junction obeys it too)
    const e = c.path[c.pi], hit = this.byEdge.get(e);
    if (!hit) return Infinity;
    const j = this.junctions[hit[0]], a = j.approaches[hit[1]];
    if (j.control === 'none') return Infinity;
    const d = a.stopS - (c.s + c.len * 0.5);
    if (d > 90) return Infinity;
    const turn = this.turnOf(c, a);
    if (j.control === 'signal') {
      const lamp = this.lamp(j, a);
      if (lamp === 'G') {
        if (d < 70) j.busy[a.group] = true;
        if (turn === 'left' && this.oncoming(j, a, others)) return d;
        return Infinity;
      }
      if (lamp === 'Y') {
        // stop if it can do so comfortably (3.5 m/s2 after 1 s), else carry on through
        if (d > c.v * 1.0 + (c.v * c.v) / 7) return d;
        return Infinity;
      }
      if (d < 60) j.demand[a.group] = true;
      // right on red: after a full stop at the line, when the cross traffic leaves a gap
      if (turn === 'right' && d < 2.5) {
        if (c.v < 0.3) c.stoppedAt = j.id;
        if (c.stoppedAt === j.id && !this.crossTraffic(j, a, others, 6)) return Infinity;
      }
      return d;
    }
    // stop signs
    if (!a.stopSign) return Infinity;
    if (c.stoppedAt !== j.id) {
      if (d < 2.5 && c.v < 0.3) { c.stoppedAt = j.id; if (j.control === 'allStop') j.queue.push(c.id); }
      return d;
    }
    if (j.control === 'allStop') {
      if (j.queue[0] === c.id && j.inside === 0) return Infinity;
      return d;
    }
    // two-way stop: a gap in the major road's traffic and an empty box
    if (j.inside === 0 && !this.crossTraffic(j, a, others, 5)) return Infinity;
    return d;
  }

  private turnOf(c: SignalCar, a: Approach): 'left' | 'right' | 'through' {
    const ne = c.path[c.pi + 1]; if (ne === undefined) return 'through';
    let e = this.g.edges[ne];
    // through the junction's internal edges to the one that leaves it
    for (let k = c.pi + 2; this.internal.has(e.id) && k < c.path.length; k++) e = this.g.edges[c.path[k]];
    const p0 = e.pts[0]; let k = 1; while (k < e.pts.length - 1 && Math.hypot(e.pts[k][0] - p0[0], e.pts[k][1] - p0[1]) < 10) k++;
    const p1 = e.pts[k], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, ox = (p1[0] - p0[0]) / L, oz = (p1[1] - p0[1]) / L;
    const dot = a.dx * ox + a.dz * oz, side = ox * a.dz - oz * a.dx;     // > 0: to the driver's left (right-hand traffic, three.js axes)
    if (dot > 0.8) return 'through';
    return side > 0 ? 'left' : 'right';
  }

  /** an oncoming car (from the opposite approach of the same signal group) that a left turn must let by */
  private oncoming(j: Junction, a: Approach, others: (edge: number) => SignalCar[]): boolean {
    for (const b of j.approaches) {
      if (b === a || b.group !== a.group || a.dx * b.dx + a.dz * b.dz > -0.7) continue;
      for (const o of others(b.edge)) { const d = b.stopS - (o.s + o.len * 0.5); if (d > -2 && d < 45 && (o.v > 1.5 || d < 6)) return true; }
    }
    return false;
  }

  /** a car on a crossing (or, for stop signs, any priority) approach close enough in time that pulling out now is unsafe */
  private crossTraffic(j: Junction, a: Approach, others: (edge: number) => SignalCar[], secs: number): boolean {
    for (const b of j.approaches) {
      if (b === a || b.stopSign) continue;
      if (j.control === 'signal' && b.group === a.group) continue;
      for (const o of others(b.edge)) { const d = b.stopS - (o.s + o.len * 0.5); if (d > -3 && d < Math.max(12, o.v * secs)) return true; }
    }
    return j.inside > 0;
  }
}

/** "inside downtown": at least `min` tall buildings within `r` m (points = the tall buildings' positions); a 50 m grid so the test is cheap */
export function denseArea(points: [number, number][], r = 220, min = 6): (x: number, z: number) => boolean {
  const C = 50, grid = new Map<number, [number, number][]>();
  for (const p of points) { const k = Math.floor(p[0] / C) * 100003 + Math.floor(p[1] / C); (grid.get(k) ?? (grid.set(k, []), grid.get(k)!)).push(p); }
  const n = Math.ceil(r / C);
  return (x, z) => {
    let cnt = 0; const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) for (const p of grid.get((cx + i) * 100003 + cz + k) ?? []) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < r * r && ++cnt >= min) return true;
    return false;
  };
}
