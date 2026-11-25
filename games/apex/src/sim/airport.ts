import { type P2, centroid, cumLen, polyLen, sampleAt, pointInPoly } from './geom';

/**
 * The airfield: a drawn runway, apron, terminal and hangars become a layout (taxiways, gates, hold points), and planes run
 * a turnaround cycle: final approach on a 3 degree glide, landing roll, taxi to a gate, dwell, taxi out, take-off, climb out.
 * Runway use is a reservation timeline so two aircraft never share it.
 */
export type AirportKind = 'runway' | 'taxiway' | 'apron' | 'terminal' | 'hangar';
export interface AirportInput { id: string; kind: AirportKind; pts: P2[] }

export interface Gate { x: number; z: number; yaw: number; u: number; v: number }
export interface AirportLayout {
  /** runway ends: planes land at a and roll toward b */
  a: P2; b: P2; /** unit vector a to b */ ux: number; uz: number; /** unit vector to the apron side */ vx: number; vz: number;
  len: number; width: number; designator: string;
  taxiways: P2[][]; apron: P2[]; terminal: P2[]; hangars: P2[][];
  gates: Gate[];
  /** taxiway lateral offset from the runway centre line, metres, toward the apron */
  taxiV: number;
  /** exit connector position along the runway */
  exitU: number;
  elevation: number;
}

export const toWorld = (L: AirportLayout, u: number, v: number): P2 => [L.a[0] + L.ux * u + L.vx * v, L.a[1] + L.uz * u + L.vz * v];

export function layoutAirport(items: AirportInput[], elevation = 0): AirportLayout | null {
  const rw = items.find((i) => i.kind === 'runway' && i.pts.length >= 2);
  if (!rw) return null;
  const a = rw.pts[0], b = rw.pts[rw.pts.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 300) return null;
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const apron = items.find((i) => i.kind === 'apron')?.pts ?? [];
  const terminal = items.find((i) => i.kind === 'terminal')?.pts ?? [];
  const hangars = items.filter((i) => i.kind === 'hangar').map((i) => i.pts);
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const refPts = apron.length ? apron : terminal.length ? terminal : hangars[0] ?? [];
  const c = refPts.length ? centroid(refPts) : [mid[0] - uz * 400, mid[1] + ux * 400] as P2;
  let nx = -uz, nz = ux;                                             // perpendicular; turned toward the apron
  if ((c[0] - mid[0]) * nx + (c[1] - mid[1]) * nz < 0) { nx = -nx; nz = -nz; }
  const L: AirportLayout = { a, b, ux, uz, vx: nx, vz: nz, len, width: 45, designator: designatorOf(ux, uz), taxiways: [], apron, terminal, hangars, gates: [], taxiV: 175, exitU: Math.min(len * 0.62, len - 700), elevation };
  // taxiways: the drawn ones, or a parallel taxiway with connectors at both ends, at the exit and to the apron
  const drawn = items.filter((i) => i.kind === 'taxiway' && i.pts.length >= 2).map((i) => i.pts);
  if (drawn.length) L.taxiways = drawn;
  else {
    const T = L.taxiV;
    L.taxiways.push([toWorld(L, 160, T), toWorld(L, len - 160, T)]);
    L.taxiways.push([toWorld(L, 160, 0), toWorld(L, 160, T)]);                 // runway-end connectors
    L.taxiways.push([toWorld(L, len - 160, 0), toWorld(L, len - 160, T)]);
    L.taxiways.push([toWorld(L, L.exitU, 0), toWorld(L, L.exitU + 120, T * 0.5), toWorld(L, L.exitU + 160, T)]);   // high-speed exit
  }
  // gates along the runway side of the apron, nose toward the terminal
  if (apron.length >= 3) {
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of apron) { const u = (p[0] - a[0]) * ux + (p[1] - a[1]) * uz, v = (p[0] - a[0]) * nx + (p[1] - a[1]) * nz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const gv = v1 - v0 > 90 ? v1 - 40 : v0 + (v1 - v0) * 0.5, yaw = Math.atan2(nx, nz);
    const n = Math.max(1, Math.min(8, Math.floor((u1 - u0) / 80)));
    for (let i = 0; i < n; i++) {
      const u = u0 + ((u1 - u0) * (i + 0.5)) / n, p = toWorld(L, u, gv);
      if (pointInPoly(apron, p[0], p[1]) || n === 1) L.gates.push({ x: p[0], z: p[1], yaw, u, v: gv });
    }
    // the taxiway lane the aircraft pull out to must exist: make the connector from the apron to the taxiway if none touches it
    if (!drawn.length) { const u = (u0 + u1) / 2; L.taxiways.push([toWorld(L, u, gv), toWorld(L, u, T0(L))]); }
  }
  return L;
}
const T0 = (L: AirportLayout): number => L.taxiV;

function designatorOf(ux: number, uz: number): string {
  // magnetic-ish: north is -z
  const hdg = (Math.atan2(ux, -uz) * 180 / Math.PI + 360) % 360, r1 = Math.round(hdg / 10) % 36 || 36, r2 = (Math.round((hdg + 180) % 360 / 10) % 36) || 36;
  return String(r1).padStart(2, '0') + '/' + String(r2).padStart(2, '0');
}

export type PlaneState = 'parked' | 'taxi_out' | 'hold' | 'takeoff' | 'climb' | 'approach' | 'rollout' | 'taxi_in' | 'gone';
export interface Plane {
  id: number; type: 'jet' | 'prop'; state: PlaneState;
  x: number; z: number; /** height above the airfield */ alt: number; yaw: number; pitch: number; v: number;
  gate: number; timer: number;
  /** position along the runway while on it */
  u: number;
  path: P2[]; cum: number[]; ps: number;
}

const APPROACH_FROM = 9000, TOUCH_U = 320, GLIDE = Math.tan(3 * Math.PI / 180);

export class AirportSim {
  planes: Plane[] = [];
  private time = 0;
  private res: [number, number][] = [];            // runway reservations
  private nextArrival = 20;
  private id = 0;
  private seed: number;
  /** how many aircraft the airfield keeps busy; callers turn it down when nobody is looking */
  activity = 1;
  constructor(readonly L: AirportLayout, seed = 3) {
    this.seed = seed;
    // some gates already occupied, one aircraft on final
    L.gates.forEach((g, i) => { if ((i + seed) % 2 === 0) this.addParked(i, 20 + i * 37); });
    if (L.gates.length) this.addArrival(true);
  }
  private rnd(): number { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  private plane(type: 'jet' | 'prop', state: PlaneState): Plane {
    return { id: this.id++, type, state, x: 0, z: 0, alt: 0, yaw: 0, pitch: 0, v: 0, gate: -1, timer: 0, u: 0, path: [], cum: [], ps: 0 };
  }
  private addParked(gate: number, timer: number): void {
    const g = this.L.gates[gate], p = this.plane(this.rnd() < 0.8 ? 'jet' : 'prop', 'parked');
    p.x = g.x; p.z = g.z; p.yaw = g.yaw; p.gate = gate; p.timer = timer; this.planes.push(p);
  }
  private freeGate(): number {
    const used = new Set(this.planes.filter((p) => p.gate >= 0 && p.state !== 'gone').map((p) => p.gate));
    const free = this.L.gates.map((_, i) => i).filter((i) => !used.has(i));
    return free.length ? free[Math.floor(this.rnd() * free.length)] : -1;
  }
  private reserved(t0: number, t1: number): boolean { return this.res.some(([a, b]) => t0 < b && t1 > a); }
  private reserve(t0: number, t1: number): void { this.res.push([t0, t1]); }
  private setPath(p: Plane, pts: P2[]): void { p.path = pts; p.cum = cumLen(pts); p.ps = 0; }

  private addArrival(initial = false): boolean {
    const gate = this.freeGate(); if (gate < 0) return false;
    const L = this.L, p = this.plane(this.rnd() < 0.8 ? 'jet' : 'prop', 'approach');
    const dist0 = initial ? 2200 : APPROACH_FROM, speed = 72, eta = this.time + (dist0 + TOUCH_U) / speed;
    if (this.reserved(eta - 12, eta + 70)) return false;
    this.reserve(eta - 12, eta + 70);
    p.u = -dist0 + TOUCH_U * 0 ; p.v = speed; p.gate = gate; p.alt = (dist0 + TOUCH_U) * GLIDE + 10;
    const w = toWorld(L, p.u, 0); p.x = w[0]; p.z = w[1]; p.yaw = Math.atan2(L.ux, L.uz);
    this.planes.push(p); return true;
  }

  private taxiOutPath(p: Plane): P2[] {
    const L = this.L, g = L.gates[p.gate], T = L.taxiV;
    return [[g.x, g.z], toWorld(L, g.u, T), toWorld(L, 200, T), toWorld(L, 160, T * 0.5), toWorld(L, 160, 0), toWorld(L, 60, 0)];
  }
  private taxiInPath(p: Plane): P2[] {
    const L = this.L, g = L.gates[p.gate], T = L.taxiV;
    return [toWorld(L, L.exitU, 0), toWorld(L, L.exitU + 120, T * 0.5), toWorld(L, L.exitU + 160, T), toWorld(L, g.u, T), [g.x, g.z]];
  }

  step(dt: number): void {
    this.time += dt;
    const L = this.L;
    this.res = this.res.filter((r) => r[1] > this.time - 5);
    this.nextArrival -= dt;
    const active = this.planes.filter((p) => p.state !== 'parked').length;
    if (this.nextArrival <= 0 && active < 2 + Math.round(this.activity) && L.gates.length) {
      if (this.addArrival()) this.nextArrival = (70 + this.rnd() * 60) / Math.max(0.3, this.activity);
      else this.nextArrival = 12;
    }
    for (const p of this.planes) {
      switch (p.state) {
        case 'parked':
          p.timer -= dt;
          if (p.timer <= 0) { p.state = 'taxi_out'; this.setPath(p, this.taxiOutPath(p)); }
          break;
        case 'taxi_out': case 'taxi_in': {
          const total = p.cum[p.cum.length - 1];
          const sp = 9 * Math.min(1, Math.max(0.2, (total - p.ps) / 25));
          p.ps += sp * dt; p.v = sp;
          if (p.ps >= total - 0.5) {
            if (p.state === 'taxi_out') { p.state = 'hold'; p.v = 0; p.timer = 0; } else { p.state = 'parked'; p.v = 0; p.timer = 70 + this.rnd() * 110; const g = L.gates[p.gate]; p.x = g.x; p.z = g.z; p.yaw = g.yaw; break; }
          }
          const sm = sampleAt(p.path, p.cum, Math.min(p.ps, total));
          p.x = sm.x; p.z = sm.z; p.yaw = Math.atan2(sm.dx, sm.dz); p.alt = 0; p.pitch = 0;
          break;
        }
        case 'hold':
          // lined up short of the runway: go when no landing is planned for the next 80 s
          if (!this.reserved(this.time, this.time + 85)) {
            this.reserve(this.time, this.time + 85);
            p.state = 'takeoff'; p.u = 60; p.v = 0; p.gate = -1;
          }
          break;
        case 'takeoff': {
          p.v += 2.3 * dt; p.u += p.v * dt;
          const w = toWorld(L, p.u, 0); p.x = w[0]; p.z = w[1]; p.yaw = Math.atan2(L.ux, L.uz);
          if (p.v >= 76) { p.state = 'climb'; }
          break;
        }
        case 'climb': {
          p.v = Math.min(98, p.v + 1.2 * dt); p.u += p.v * dt; p.alt += p.v * 0.14 * dt; p.pitch = 0.16;
          const w = toWorld(L, p.u, 0); p.x = w[0]; p.z = w[1];
          if (p.u > L.len + 8000) p.state = 'gone';
          break;
        }
        case 'approach': {
          const toTouch = TOUCH_U - p.u;
          p.v = Math.max(62, p.v - (toTouch < 600 ? 0.8 * dt : 0));
          p.u += p.v * dt;
          p.alt = Math.max(0, (TOUCH_U - p.u) * GLIDE + (p.u < TOUCH_U ? 0 : 0));
          p.pitch = -0.05; if (toTouch < 90) p.pitch = 0.05;
          const w = toWorld(L, p.u, 0); p.x = w[0]; p.z = w[1];
          if (p.u >= TOUCH_U) { p.alt = 0; p.state = 'rollout'; p.pitch = 0; }
          break;
        }
        case 'rollout': {
          p.v = Math.max(16, p.v - 3.4 * dt); p.u += p.v * dt;
          const w = toWorld(L, p.u, 0); p.x = w[0]; p.z = w[1];
          if (p.u >= L.exitU && p.v <= 17) { p.state = 'taxi_in'; this.setPath(p, this.taxiInPath(p)); p.v = 0; }
          break;
        }
        case 'gone': break;
      }
    }
    this.planes = this.planes.filter((p) => p.state !== 'gone');
    void polyLen;
  }
}
