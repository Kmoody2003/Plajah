import { type P2, rng, sampleAt, dist } from './geom';
import { type GEdge, type RoadClass, type RoadGraph, type RoadInput, buildRoadGraph, shortestPath } from './network';
import { type AirportLayout, AirportSim } from './airport';
import { type RailNetwork, TrainSim } from './rail';
import { type ServiceInput, type Zone, type ZoneInput, ZoneSim } from './zones';
import { SignalSystem, type SignalCar, type PlayerCall } from './signals';

/**
 * The whole sim: road graph, zones with demand, ambient cars and trucks that commute between them, trains and planes.
 * `step(dt)` takes real seconds; the sim clock runs a full day in `dayLength` seconds.
 */
export interface SimInput {
  roads: RoadInput[]; zones: ZoneInput[]; services: ServiceInput[];
  rail?: RailNetwork | null; airport?: AirportLayout | null;
  water?: (x: number, z: number) => boolean;
  seed?: number; maxCars?: number; dayLength?: number; startHour?: number;
  /** inside downtown (every four-way junction there is signalised, and every junction gets crosswalks) */
  downtown?: (x: number, z: number) => boolean;
}

export interface Car {
  id: number; kind: 'car' | 'truck'; path: number[]; pi: number; s: number; v: number; len: number; lane: number; color: number;
  x: number; z: number; yaw: number; dest: string; vFactor: number;
  /** junction state, kept by SignalSystem: stopped at a stop sign / red, inside a junction box */
  stoppedAt?: number; inJ?: number; inJEdge?: number;
}

const LANE0 = 1.7, LANE_W = 3.3;

export class SimWorld {
  readonly graph: RoadGraph;
  /** signals and stop signs at every junction */
  readonly signals: SignalSystem;
  readonly zones: ZoneSim;
  readonly trains: TrainSim | null;
  readonly air: AirportSim | null;
  cars: Car[] = [];
  /** hours since midnight, 0..24 */
  hour: number;
  readonly dayLength: number;
  maxCars: number;
  focus: P2 = [0, 0];
  /** smoothed cars per edge, for the flow overlay */
  flow: Float32Array;
  stats = { spawned: 0, arrived: 0, failedRoutes: 0, trips: { out: 0, back: 0, truck: 0, errand: 0 } };
  private rnd: () => number;
  private id = 0;
  private lanes = new Map<number, Car[]>();
  private load: Int32Array;
  private crossByEdge = new Map<number, { s: number; c: number }[]>();
  private spawnAcc = 0;
  /** the player's car (set each frame while driving, null otherwise): the sim cars stop behind it and give way to it, and the signals answer it */
  player: { x: number; z: number; yaw: number; v: number } | null = null;
  /** red lights and stop signs the player ran since the last `takePlayerCalls` */
  private playerCalls: PlayerCall[] = [];
  takePlayerCalls(): PlayerCall[] { const c = this.playerCalls; this.playerCalls = []; return c; }
  private simAcc = 0;

  constructor(input: SimInput) {
    this.rnd = rng(input.seed ?? 11);
    this.graph = buildRoadGraph(input.roads);
    this.signals = new SignalSystem(this.graph, { downtown: input.downtown, seed: input.seed });
    const stations: P2[] = [];
    if (input.rail) for (const l of input.rail.lines) for (const st of l.stops) if (st.kind !== 'terminus') { const sm = sampleAt(l.profile.pts, l.profile.cum, st.s); stations.push([sm.x, sm.z]); }
    const ap = input.airport ? ([(input.airport.a[0] + input.airport.b[0]) / 2, (input.airport.a[1] + input.airport.b[1]) / 2] as P2) : null;
    this.zones = new ZoneSim(input.zones, input.services, this.graph, { stations, airport: ap, water: input.water ?? (() => false) });
    this.trains = input.rail && input.rail.lines.length ? new TrainSim(input.rail, input.seed ?? 1) : null;
    this.air = input.airport ? new AirportSim(input.airport, input.seed ?? 3) : null;
    this.maxCars = input.maxCars ?? 260;
    this.dayLength = input.dayLength ?? 600;
    this.hour = input.startHour ?? 7.6;
    this.flow = new Float32Array(this.graph.edges.length);
    this.load = new Int32Array(this.graph.edges.length);
    if (input.rail) for (const c of input.rail.crossings) {
      if (!c.level) continue;
      const add = (e: number, s: number): void => { let a = this.crossByEdge.get(e); if (!a) { a = []; this.crossByEdge.set(e, a); } a.push({ s, c: c.id }); };
      add(c.edge, c.edgeS); if (c.twin >= 0) add(c.twin, c.twinS);
    }
    for (const a of this.crossByEdge.values()) a.sort((p, q) => p.s - q.s);
  }

  setFocus(x: number, z: number): void { this.focus = [x, z]; }

  /** how busy the roads are at an hour of the day: morning and evening peaks over a daytime base */
  static activity(h: number): { out: number; back: number; day: number; level: number } {
    const bell = (m: number, sd: number): number => Math.exp(-((h - m) ** 2) / (2 * sd * sd));
    const out = bell(7.7, 1.1), back = bell(17.2, 1.4), day = h > 6 && h < 20 ? 0.45 : 0.08;
    return { out, back, day, level: Math.min(1, 0.18 + 0.85 * Math.max(out, back) + 0.5 * day * (h > 9 && h < 16 ? 1 : 0.4)) };
  }

  private focusW(z: Zone): number { const d = dist(z.c, this.focus); return 0.12 + 0.88 * Math.exp(-((d / 4200) ** 2)); }
  private pick(weights: number[]): number {
    let t = 0; for (const w of weights) t += w;
    if (t <= 0) return -1;
    let r = this.rnd() * t;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  }
  private anchorNear(z: Zone, toward: P2): number {
    let best = -1, bd = Infinity;
    for (let k = 0; k < 5; k++) { const a = z.anchors[Math.floor(this.rnd() * z.anchors.length)], n = this.graph.nodes[a], d = dist([n.x, n.z], toward); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  /** start one trip: chooses a kind for the hour, an origin and destination zone, routes it */
  private spawn(): boolean {
    const act = SimWorld.activity(this.hour), Z = this.zones.zones;
    const kinds: ('out' | 'back' | 'truck' | 'errand')[] = ['out', 'back', 'truck', 'errand'];
    const kw = [act.out * 2.2, act.back * 2.2, act.day * 0.8, 0.25 + act.day * 0.5];
    const kind = kinds[this.pick(kw)] ?? 'errand';
    const isHome = (z: Zone): boolean => z.kind === 'residential' || z.kind === 'dense';
    const isWork = (z: Zone): boolean => z.kind === 'commercial' || z.kind === 'dense' || z.kind === 'industrial' || z.kind === 'waterfront' || z.kind === 'civic';
    let ow: number[], dw: (o: Zone) => number[];
    if (kind === 'out') { ow = Z.map((z) => (isHome(z) && z.access ? z.pop * this.focusW(z) : 0)); dw = (o) => Z.map((z) => (isWork(z) && z.access && z !== o ? (z.jobs + 1) / (1 + dist(z.c, o.c) / 2500) : 0)); }
    else if (kind === 'back') { ow = Z.map((z) => (isWork(z) && z.access ? z.jobs * this.focusW(z) : 0)); dw = (o) => Z.map((z) => (isHome(z) && z.access && z !== o ? (z.pop + 1) / (1 + dist(z.c, o.c) / 2500) : 0)); }
    else if (kind === 'truck') { ow = Z.map((z) => ((z.kind === 'industrial' || z.kind === 'waterfront') && z.access ? z.jobs * this.focusW(z) : 0)); dw = (o) => Z.map((z) => ((z.kind === 'commercial' || z.kind === 'industrial' || z.kind === 'dense' || z.kind === 'waterfront') && z.access && z !== o ? (z.jobs + 1) / (1 + dist(z.c, o.c) / 4000) : 0)); }
    else { ow = Z.map((z) => (isHome(z) && z.access ? z.pop * this.focusW(z) : 0)); dw = (o) => Z.map((z) => ((z.kind === 'commercial' || z.kind === 'dense' || z.kind === 'civic') && z.access && z !== o ? (z.jobs + 1) / (1 + dist(z.c, o.c) / 1500) : 0)); }
    const oi = this.pick(ow); if (oi < 0) return false;
    const o = Z[oi], di = this.pick(dw(o)); if (di < 0) return false;
    const d = Z[di];
    const from = this.anchorNear(o, this.focus), to = this.anchorNear(d, o.c);
    if (from < 0 || to < 0 || from === to) return false;
    const path = shortestPath(this.graph, from, to, (e) => (this.load[e.id] / Math.max(1, e.len / 9 * e.lanes)) * (e.len / e.speed) * 1.5);
    if (!path || !path.length) { this.stats.failedRoutes++; return false; }
    const truck = kind === 'truck';
    const e0 = this.graph.edges[path[0]];
    const lane = Math.min(e0.lanes - 1, this.rnd() < 0.5 ? 0 : 1);
    const hue = this.rnd();
    const palette = [0xd9d9dc, 0x1c1d20, 0x8a8f96, 0xa8201c, 0x1d3f7a, 0xeeeeee, 0x2f5d3a, 0xb98b2c, 0x59636b, 0x6d1d1d];
    const c: Car = {
      id: this.id++, kind: truck ? 'truck' : 'car', path, pi: 0, s: Math.min(e0.len * 0.5, 3), v: 0, len: truck ? 10.5 : 4.4, lane,
      color: truck ? [0xe8e8e0, 0xb5251f, 0x2d5b9e, 0xd8a31d][Math.floor(hue * 4)] : palette[Math.floor(hue * palette.length) % palette.length],
      x: 0, z: 0, yaw: 0, dest: d.id, vFactor: 0.88 + this.rnd() * 0.18,
    };
    // do not start on top of another car
    const here = this.lanes.get(c.path[0] * 4 + lane);
    if (here && here.some((o) => o.s < 14)) return false;
    this.place(c);
    (here ?? (this.lanes.set(c.path[0] * 4 + lane, []), this.lanes.get(c.path[0] * 4 + lane)!)).unshift(c);
    this.cars.push(c); this.stats.spawned++; this.stats.trips[kind]++;
    return true;
  }

  private place(c: Car): void {
    const e = this.graph.edges[c.path[c.pi]], sm = sampleAt(e.pts, e.cum, c.s), off = (e.cls === 'street' ? 1.45 : LANE0) + Math.min(c.lane, e.lanes - 1) * LANE_W;     // local streets: a little in, clear of the parked cars
    c.x = sm.x - sm.dz * off; c.z = sm.z + sm.dx * off; c.yaw = Math.atan2(sm.dx, sm.dz);
  }

  step(dt: number): void {
    dt = Math.min(dt, 0.1);
    const simSec = dt * (86400 / this.dayLength);
    this.hour = (this.hour + simSec / 3600) % 24;
    this.zones.step(simSec);
    this.trains?.step(dt);
    this.air?.step(dt);
    this.stepCars(dt);
  }

  private stepCars(dt: number): void {
    const edges = this.graph.edges;
    // lanes: cars per (edge, lane), sorted by position
    for (const a of this.lanes.values()) a.length = 0;
    this.load.fill(0);
    for (const c of this.cars) {
      const e = c.path[c.pi], key = e * 4 + Math.min(3, c.lane);
      let a = this.lanes.get(key); if (!a) { a = []; this.lanes.set(key, a); }
      a.push(c); this.load[e]++;
    }
    for (const a of this.lanes.values()) if (a.length > 1) a.sort((p, q) => p.s - q.s);
    // spawn toward a target count that follows the day
    const target = Math.round(this.maxCars * SimWorld.activity(this.hour).level);
    this.spawnAcc += dt * 2.2;
    let tries = 0;
    while (this.spawnAcc >= 1 && tries < 3) { this.spawnAcc -= 1; tries++; if (this.cars.length < target) this.spawn(); }
    if (this.spawnAcc > 3) this.spawnAcc = 3;

    // the cars on an edge, all lanes, for the junction gap checks
    const onEdge = (ei: number): SignalCar[] => { const out: Car[] = []; for (let l = 0; l < 4; l++) { const a = this.lanes.get(ei * 4 + l); if (a) out.push(...a); } return out; };
    this.signals.beginStep();
    const call = this.signals.player(this.player);
    if (call) { this.playerCalls.push(call); if (this.playerCalls.length > 8) this.playerCalls.shift(); }
    const P = this.player;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], e: GEdge = edges[c.path[c.pi]];
      const a = this.lanes.get(c.path[c.pi] * 4 + Math.min(3, c.lane)) ?? [];
      // the car ahead in this lane: next in the list, or the rearmost car on the next edge
      let gap = 1e9;
      const idx = a.indexOf(c);
      if (idx >= 0 && idx + 1 < a.length) gap = a[idx + 1].s - a[idx + 1].len * 0.5 - c.s - c.len * 0.5;
      else if (c.pi + 1 < c.path.length) {
        const ne = c.path[c.pi + 1], b = this.lanes.get(ne * 4 + Math.min(3, c.lane, edges[ne].lanes - 1));
        if (b && b.length) gap = e.len - c.s + b[0].s - b[0].len * 0.5 - c.len * 0.5;
      }
      // the player's car ahead in this car's path: an obstacle like any car
      if (P && Math.abs(P.x - c.x) + Math.abs(P.z - c.z) < 60) {
        const hx = Math.sin(c.yaw), hz = Math.cos(c.yaw), rx = P.x - c.x, rz = P.z - c.z, ahead = rx * hx + rz * hz, lat = Math.abs(rx * hz - rz * hx);
        if (ahead > 0 && ahead < 50 && lat < 2.4) gap = Math.min(gap, ahead - 2.3 - c.len * 0.5);
      }
      let vt = e.speed * c.vFactor;
      // a closed level crossing ahead is an obstacle
      const cr = this.crossByEdge.get(e.id);
      if (cr && this.trains) for (const x of cr) {
        const stop = x.s - 8 - c.len * 0.5, d = stop - c.s;
        if (d > -1 && d < 120 && this.trains.net.crossings[x.c].closed) gap = Math.min(gap, d - 1);
      }
      // slow into a sharp turn at the end of the edge
      const remain = e.len - c.s;
      if (remain < 16 && c.pi + 1 < c.path.length) {
        const n = edges[c.path[c.pi + 1]], a1 = e.pts[e.pts.length - 2], a2 = e.pts[e.pts.length - 1], b1 = n.pts[0], b2 = n.pts[1];
        const turn = Math.abs(Math.atan2((a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]), (a2[0] - a1[0]) * (b2[0] - b1[0]) + (a2[1] - a1[1]) * (b2[1] - b1[1])));
        if (turn > 0.6) vt = Math.min(vt, 6.5);
      }
      // the junction ahead: a red light, a stop sign, a left turn waiting for oncoming traffic (the stop line counts as an obstacle 3 m past it, so the bumper stops at the line)
      const lim = this.signals.limit(c, onEdge);
      if (lim < Infinity) gap = Math.min(gap, lim + 3);
      if (gap < 1e8) vt = Math.min(vt, Math.max(0, (gap - 3.5) / 1.2));
      if (gap < 1.5) c.v = 0;
      c.v += Math.max(-7 * dt, Math.min(2.6 * dt, vt - c.v));
      if (c.v < 0) c.v = 0;
      c.s += c.v * dt;
      while (c.s >= edges[c.path[c.pi]].len) {
        c.s -= edges[c.path[c.pi]].len; c.pi++;
        if (c.pi >= c.path.length) break;
        c.lane = Math.min(c.lane, edges[c.path[c.pi]].lanes - 1);
      }
      if (c.pi >= c.path.length) { this.signals.release(c); this.cars[i] = this.cars[this.cars.length - 1]; this.cars.pop(); this.stats.arrived++; continue; }
      this.signals.moved(c);
      this.place(c);
    }
    this.signals.step(dt);
    const k = Math.min(1, dt * 0.2);
    for (let i = 0; i < this.flow.length; i++) this.flow[i] += (this.load[i] - this.flow[i]) * k;
  }

  /** number of edges carrying traffic, for tests and the editor overlay */
  busyEdges(): number { let n = 0; for (let i = 0; i < this.flow.length; i++) if (this.flow[i] > 0.05) n++; return n; }
}

export type { RoadClass };
