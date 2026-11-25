import { type P2, project, sampleAt, segIntersect } from './geom';
import { ROAD_CLASS, type RoadClass, type RoadGraph } from './network';
import { type RailProfile, railProfile, profileModeAt } from './railProfile';

/**
 * Railways: lines (single or double track) laid on the ground, stations on them, level crossings where they meet roads,
 * and trains that run timetables with dwell times, curve speed limits, block occupancy on single track and headways on double.
 */
export type RailKind = 'single' | 'double';
export type RailService = 'passenger' | 'freight' | 'mixed';
export interface RailLineInput { id: string; kind: RailKind; pts: P2[]; service?: RailService; name?: string }
export interface StationInput { id: string; kind: 'station' | 'halt' | 'freight'; x: number; z: number; name?: string }

export interface Stop { s: number; name: string; kind: 'station' | 'halt' | 'freight' | 'terminus'; id: string }
export interface RailLine { index: number; id: string; name: string; kind: RailKind; service: RailService; profile: RailProfile; stops: Stop[]; tracks: number; trackSpacing: number }
export interface Crossing {
  id: number; line: number; s: number; x: number; z: number; roadClass: string;
  /** level crossing with gates; highways pass over the railway */
  level: boolean;
  /** road edge (the one that was found) and the twin, with the distance along each */
  edge: number; edgeS: number; twin: number; twinS: number;
  /** angle of the road to the track, for the meshes */
  closed: boolean; closedFor: number;
  /** unit direction of the road where it crosses, and the road's half-width in metres */
  rx: number; rz: number; half: number;
}
export interface RailNetwork { lines: RailLine[]; crossings: Crossing[] }

export function layoutRail(inputs: RailLineInput[], stationsIn: StationInput[], ground: (x: number, z: number) => number, graph?: RoadGraph | null): RailNetwork {
  const lines: RailLine[] = inputs.filter((l) => l.pts.length >= 2).map((l, index) => {
    const profile = railProfile(l.pts, ground, { maxGrade: l.kind === 'double' ? 0.03 : 0.035 });
    return { index, id: l.id, name: l.name || `Line ${index + 1}`, kind: l.kind, service: l.service ?? 'mixed', profile, stops: [], tracks: l.kind === 'double' ? 2 : 1, trackSpacing: l.kind === 'double' ? 4.6 : 0 };
  });
  // stations snap to the nearest line within 120 m
  for (const st of stationsIn) {
    let best: { line: RailLine; s: number; d: number } | null = null;
    for (const line of lines) { const pr = project(line.profile.pts, line.profile.cum, st.x, st.z); if (pr.d < 120 && (!best || pr.d < best.d)) best = { line, s: pr.s, d: pr.d }; }
    if (best) best.line.stops.push({ s: best.s, name: st.name || 'Station', kind: st.kind, id: st.id });
  }
  for (const line of lines) {
    line.stops.sort((a, b) => a.s - b.s);
    // the ends are always stops (trains turn round there)
    if (!line.stops.length || line.stops[0].s > 260) line.stops.unshift({ s: 150, name: line.name + ' (end A)', kind: 'terminus', id: line.id + '-a' });
    else line.stops[0].s = Math.max(150, Math.min(line.stops[0].s, 260));
    const last = line.stops[line.stops.length - 1];
    if (last.s < line.profile.len - 260) line.stops.push({ s: line.profile.len - 150, name: line.name + ' (end B)', kind: 'terminus', id: line.id + '-b' });
    else last.s = Math.min(line.profile.len - 150, Math.max(last.s, line.profile.len - 260));
  }
  const crossings: Crossing[] = [];
  if (graph) {
    for (const line of lines) {
      const P = line.profile;
      for (let i = 0; i < P.pts.length - 1; i++) {
        const a = P.pts[i], b = P.pts[i + 1];
        for (const e of graph.edgesNear((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 30)) {
          if (e.twin >= 0 && e.twin < e.id) continue;
          for (let k = 0; k < e.pts.length - 1; k++) {
            const hit = segIntersect(a, b, e.pts[k], e.pts[k + 1]);
            if (!hit) continue;
            const s = P.cum[i] + hit.t * (P.cum[i + 1] - P.cum[i]);
            const x = a[0] + (b[0] - a[0]) * hit.t, z = a[1] + (b[1] - a[1]) * hit.t;
            if (crossings.some((c) => c.line === line.index && Math.abs(c.s - s) < 12 && c.edge === e.id)) continue;
            const edgeS = e.cum[k] + hit.u * (e.cum[k + 1] - e.cum[k]);
            const level = e.cls !== 'highway' && e.cls !== 'ramp' && profileModeAt(P, s) === 'ground';
            crossings.push({ id: crossings.length, line: line.index, s, x, z, roadClass: e.cls, level, edge: e.id, edgeS, twin: e.twin, twinS: e.twin >= 0 ? e.len - edgeS : 0, closed: false, closedFor: 0, rx: (e.pts[k + 1][0] - e.pts[k][0]) / (Math.hypot(e.pts[k + 1][0] - e.pts[k][0], e.pts[k + 1][1] - e.pts[k][1]) || 1), rz: (e.pts[k + 1][1] - e.pts[k][1]) / (Math.hypot(e.pts[k + 1][0] - e.pts[k][0], e.pts[k + 1][1] - e.pts[k][1]) || 1), half: ROAD_CLASS[e.cls as RoadClass].half });
          }
        }
      }
    }
  }
  return { lines, crossings };
}

export type TrainKind = 'passenger' | 'freight';
export interface Train {
  id: number; line: number; kind: TrainKind; dir: 1 | -1;
  /** arc length of the front of the train */
  s: number; v: number; cars: number; carLen: number; len: number;
  state: 'run' | 'dwell' | 'hold';
  /** stop index it is at, or leaving; and the one it is heading for */
  at: number; to: number; dwell: number;
  /** blocks (between consecutive stops) held on single track */
  blocks: number[];
  /** metres to the side of the track centre line (double track) */
  lane: number;
  /** inside a tunnel (not drawn) */
  hidden: boolean;
}

const ACCEL = { passenger: 0.8, freight: 0.35 }, DECEL = { passenger: 0.9, freight: 0.5 }, CRUISE = { passenger: 36, freight: 21 };

export class TrainSim {
  trains: Train[] = [];
  private owner: Map<string, number> = new Map();         // "line:block" -> train id
  private time = 0;
  constructor(readonly net: RailNetwork, seed = 1) {
    let id = 0;
    for (const line of net.lines) {
      const L = line.profile.len;
      if (L < 400 || line.stops.length < 2) continue;
      const n = Math.max(1, Math.min(line.kind === 'double' ? 4 : 3, Math.round(L / 3200)));
      for (let k = 0; k < n; k++) {
        const kind: TrainKind = line.service === 'freight' ? 'freight' : line.service === 'passenger' ? 'passenger' : k % 2 ? 'freight' : 'passenger';
        const cars = kind === 'passenger' ? 4 : 11, carLen = kind === 'passenger' ? 24 : 16;
        const dir: 1 | -1 = line.kind === 'double' ? (k % 2 ? -1 : 1) : 1;
        const s = L * ((k + 0.5 + ((seed * 7 + k * 3) % 5) * 0.03) / n);
        const t: Train = { id: id++, line: line.index, kind, dir, s: 0, v: 0, cars, carLen, len: cars * carLen, state: 'run', at: 0, to: 0, dwell: 0, blocks: [], lane: 0, hidden: false };
        // start between two stops, already moving
        let behind = 0; for (let i = 0; i < line.stops.length; i++) if (line.stops[i].s <= s) behind = i;
        const ahead = dir > 0 ? behind + 1 : behind;
        const atIdx = dir > 0 ? behind : Math.min(line.stops.length - 1, behind + 1);
        t.at = atIdx; t.to = this.nextStop(line, t, atIdx);
        if (t.to === atIdx || (dir > 0 && ahead >= line.stops.length)) { t.dir = dir > 0 ? -1 : 1; t.to = this.nextStop(line, t, atIdx); }
        t.s = s; t.v = 0.6 * CRUISE[kind];
        if (line.kind === 'single' && !this.reserve(line, t)) continue;
        t.lane = line.kind === 'double' ? t.dir * line.trackSpacing / 2 : 0;
        this.trains.push(t);
      }
    }
  }

  /** the next stop in the train's direction at which it actually stops */
  private nextStop(line: RailLine, t: Train, from: number): number {
    let i = from;
    for (;;) {
      const j = i + t.dir;
      if (j < 0 || j >= line.stops.length) return i;
      i = j;
      const st = line.stops[i];
      if (t.kind === 'passenger' ? st.kind !== 'freight' : (st.kind === 'freight' || st.kind === 'terminus')) return i;
      if (i === 0 || i === line.stops.length - 1) return i;
    }
  }
  private blockKeys(line: RailLine, t: Train): string[] {
    const a = Math.min(t.at, t.to), b = Math.max(t.at, t.to), out: string[] = [];
    for (let i = a; i < b; i++) out.push(line.index + ':' + i);
    return out;
  }
  private reserve(line: RailLine, t: Train): boolean {
    const keys = this.blockKeys(line, t);
    for (const k of keys) { const o = this.owner.get(k); if (o !== undefined && o !== t.id) return false; }
    keys.forEach((k, i) => { this.owner.set(k, t.id); t.blocks[i] = 1; });
    return true;
  }
  private release(line: RailLine, t: Train): void {
    for (const [k, o] of this.owner) if (o === t.id) this.owner.delete(k);
    t.blocks.length = 0; void line;
  }

  step(dt: number): void {
    this.time += dt;
    for (const t of this.trains) {
      const line = this.net.lines[t.line], P = line.profile, a = ACCEL[t.kind], d = DECEL[t.kind];
      if (t.state === 'dwell') {
        t.dwell -= dt; t.v = 0;
        if (t.dwell <= 0) {
          // at a terminus the train turns round
          if (t.at === 0 && t.dir < 0) t.dir = 1; else if (t.at === line.stops.length - 1 && t.dir > 0) t.dir = -1;
          t.to = this.nextStop(line, t, t.at); t.state = 'hold';
          if (line.kind === 'double') t.lane = t.dir * line.trackSpacing / 2;
        }
        continue;
      }
      if (t.state === 'hold') {
        t.v = 0;
        if (t.to === t.at) { t.dir = (t.dir > 0 ? -1 : 1); t.to = this.nextStop(line, t, t.at); }
        if (line.kind === 'single' ? this.reserve(line, t) : true) t.state = 'run';
        continue;
      }
      // running
      const stop = line.stops[t.to];
      const stopFront = stop.s + t.dir * Math.min(t.len, 120) * 0.5;            // the train stands centred on the platform
      const dRem = (stopFront - t.s) * t.dir;
      let vt = CRUISE[t.kind];
      // curve limit looking 160 m ahead
      for (let q = 0; q <= 160; q += 40) vt = Math.min(vt, P.vmax[Math.max(0, Math.min(P.pts.length - 1, Math.round((t.s + t.dir * q) / 10)))] * (t.kind === 'freight' ? 0.7 : 1));
      vt = Math.min(vt, Math.sqrt(2 * d * Math.max(0, dRem - 3)) + 0.3);
      // headway: the nearest train ahead on the same line and direction
      for (const o of this.trains) {
        if (o === t || o.line !== t.line || o.dir !== t.dir) continue;
        const gap = (o.s - t.s) * t.dir - o.len;
        if (gap > -5 && gap < 900) vt = Math.min(vt, Math.sqrt(2 * d * Math.max(0, gap - 80)));
      }
      t.v += Math.max(-d * 1.3 * dt, Math.min(a * dt, vt - t.v));
      if (t.v < 0) t.v = 0;
      t.s += t.dir * t.v * dt;
      if (dRem < 0.4 || (dRem < 6 && t.v < 0.5)) {
        t.s = stopFront; t.v = 0; t.at = t.to; t.state = 'dwell';
        t.dwell = (t.at === 0 || t.at === line.stops.length - 1 ? 50 : t.kind === 'passenger' ? 26 : 45) + (t.id % 5) * 3;
        if (line.kind === 'single') this.release(line, t);
      }
      t.hidden = profileModeAt(P, Math.max(0, Math.min(P.len, t.s))) === 'tunnel';
    }
    // level crossings: closed while a train is coming or on it
    for (const c of this.net.crossings) {
      if (!c.level) continue;
      let closed = false;
      for (const t of this.trains) {
        if (t.line !== c.line) continue;
        const ahead = Math.max(90, t.v * 15), tail = t.s - t.dir * t.len;
        const lo = t.dir > 0 ? tail - 14 : t.s - ahead, hi = t.dir > 0 ? t.s + ahead : tail + 14;
        if (c.s >= lo && c.s <= hi) { closed = true; break; }
      }
      c.closed = closed; c.closedFor = closed ? c.closedFor + dt : 0;
    }
  }

  /** position and heading of a point `back` metres behind the front of a train, plus the track offset */
  place(t: Train, back: number, out = { x: 0, z: 0, yaw: 0, y: 0 }): { x: number; z: number; yaw: number; y: number } {
    const line = this.net.lines[t.line], P = line.profile;
    const s = Math.max(0, Math.min(P.len, t.s - t.dir * back));
    const sm = sampleAt(P.pts, P.cum, s);
    const nx = -sm.dz, nz = sm.dx;
    out.x = sm.x + nx * t.lane; out.z = sm.z + nz * t.lane;
    out.yaw = Math.atan2(sm.dx * t.dir, sm.dz * t.dir);
    const f = Math.max(0, Math.min(P.pts.length - 1.001, s / 10)), i = Math.floor(f);
    out.y = P.y[i] + (P.y[i + 1] - P.y[i]) * (f - i);
    return out;
  }
}
