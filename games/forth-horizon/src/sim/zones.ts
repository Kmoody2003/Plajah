import { type P2, centroid, dist, distToPoly, pointInPoly, polyArea } from './geom';
import type { RoadGraph } from './network';

/**
 * Zones with demand, land value and service coverage: the Skylines logic without the budget.
 * Each zone has a capacity from its area, a built level 0..1 that grows or shrinks with demand, and a land value.
 */
export type ZoneKind = 'residential' | 'dense' | 'commercial' | 'industrial' | 'waterfront' | 'farmland' | 'parkland' | 'civic';
export type ServiceKind = 'fire' | 'police' | 'school' | 'clinic';
export interface ZoneInput { id: string; kind: ZoneKind; pts: P2[]; name?: string }
export interface ServiceInput { id: string; kind: ServiceKind; x: number; z: number }
export interface Extras { stations: P2[]; airport: P2 | null; water: (x: number, z: number) => boolean }

/** people (homes) and jobs per square metre of fully built zone */
export const DENSITY: Record<ZoneKind, { pop: number; jobs: number; built: number }> = {
  residential: { pop: 0.0035, jobs: 0.0002, built: 0.55 },
  dense: { pop: 0.016, jobs: 0.006, built: 0.7 },
  commercial: { pop: 0.0008, jobs: 0.011, built: 0.5 },
  industrial: { pop: 0, jobs: 0.0045, built: 0.45 },
  waterfront: { pop: 0.0005, jobs: 0.003, built: 0.4 },
  farmland: { pop: 0.00015, jobs: 0.0001, built: 0.6 },
  parkland: { pop: 0, jobs: 0.00003, built: 1 },
  civic: { pop: 0, jobs: 0.004, built: 0.6 },
};
export const SERVICE_RADIUS: Record<ServiceKind, number> = { fire: 1800, police: 1600, school: 1400, clinic: 2200 };

export interface Zone {
  id: string; kind: ZoneKind; name: string; poly: P2[]; area: number; c: P2;
  capPop: number; capJobs: number;
  /** built level 0..1 */
  level: number; pop: number; jobs: number;
  /** nodes of the main road graph inside or next to the zone, where trips start and end */
  anchors: number[];
  /** nearest road distance from the zone, m; Infinity when unserved */
  roadDist: number;
  access: number;
  landValue: number;
  cover: Record<ServiceKind, number>;
}
export interface Demand { R: number; C: number; I: number }

export class ZoneSim {
  zones: Zone[] = [];
  demand: Demand = { R: 0.3, C: 0.2, I: 0.2 };
  private acc = 0;
  /** sim minutes elapsed */
  minutes = 0;
  constructor(inputs: ZoneInput[], readonly services: ServiceInput[], graph: RoadGraph | null, readonly extras: Extras = { stations: [], airport: null, water: () => false }) {
    for (const z of inputs) {
      if (z.pts.length < 3) continue;
      const area = polyArea(z.pts), d = DENSITY[z.kind], c = centroid(z.pts);
      const zone: Zone = { id: z.id, kind: z.kind, name: z.name ?? '', poly: z.pts, area, c, capPop: area * d.pop, capJobs: area * d.jobs, level: 0, pop: 0, jobs: 0, anchors: [], roadDist: Infinity, access: 0, landValue: 0.5, cover: { fire: 0, police: 0, school: 0, clinic: 0 } };
      zone.level = Math.min(1, d.built * (0.55 + 0.3 * hash01(z.id)));
      this.zones.push(zone);
    }
    if (graph) this.wire(graph);
    this.recalc();
    this.settle();
  }

  /** find the road nodes serving each zone */
  wire(graph: RoadGraph): void {
    for (const z of this.zones) {
      let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
      for (const p of z.poly) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]); }
      const inside: { id: number; d: number }[] = [];
      // main nodes inside the polygon (sample the graph on a coarse grid of lookups for big zones)
      const step = Math.max(120, Math.min(700, Math.sqrt(z.area) / 7));
      const seen = new Set<number>();
      for (let x = minx; x <= maxx; x += step) for (let zz = minz; zz <= maxz; zz += step) {
        const n = graph.nearestNode(x, zz, step * 0.8);
        if (n && !seen.has(n.id) && pointInPoly(z.poly, n.x, n.z)) { seen.add(n.id); inside.push({ id: n.id, d: dist([n.x, n.z], z.c) }); }
      }
      if (!inside.length) { const n = graph.nearestNode(z.c[0], z.c[1], 900); if (n) { inside.push({ id: n.id, d: dist([n.x, n.z], z.c) }); z.roadDist = Math.max(0, distToPoly(z.poly, n.x, n.z)); } }
      else z.roadDist = 0;
      z.anchors = inside.slice(0, 40).map((i) => i.id);
      z.access = z.anchors.length ? 1 : 0;
      if (z.roadDist > 220) z.access = 0;
    }
  }

  /** land value 0..1.5 and service coverage per zone */
  recalc(): void {
    const ex = this.extras;
    for (const z of this.zones) {
      for (const k of Object.keys(SERVICE_RADIUS) as ServiceKind[]) {
        let best = 0;
        for (const s of this.services) if (s.kind === k) best = Math.max(best, Math.max(0, 1 - dist([s.x, s.z], z.c) / SERVICE_RADIUS[k]));
        z.cover[k] = best;
      }
      let v = 0.5 + 0.1 * (z.cover.fire + z.cover.police + z.cover.school + z.cover.clinic);
      // parks and water nearby are worth something; works and the airport are a nuisance for homes
      let parkNear = 0, indNear = 0;
      for (const o of this.zones) {
        if (o === z) continue;
        const d = dist(o.c, z.c);
        if (o.kind === 'parkland' && d < 2500) parkNear = Math.max(parkNear, 1 - d / 2500);
        if ((o.kind === 'industrial') && d < 2500) indNear = Math.max(indNear, 1 - d / 2500);
      }
      v += 0.2 * parkNear;
      if (z.kind === 'residential' || z.kind === 'dense') v -= 0.3 * indNear;
      if (z.kind === 'commercial') v += 0.1 * (z.access > 0 ? 1 : 0);
      for (const st of ex.stations) { const d = dist(st, z.c); if (d < 1500) v += 0.2 * (1 - d / 1500); }
      if (ex.airport) { const d = dist(ex.airport, z.c); if ((z.kind === 'residential' || z.kind === 'dense') && d < 2800) v -= 0.25 * (1 - d / 2800); if (z.kind === 'industrial' && d < 3000) v += 0.1; }
      if (ex.water(z.c[0], z.c[1]) || z.kind === 'waterfront') v += 0.15;
      z.landValue = Math.max(0.1, Math.min(1.5, v));
    }
  }

  private totals(): { pop: number; jobsCom: number; jobsInd: number; jobs: number; capPop: number; capCom: number; capInd: number } {
    let pop = 0, jobsCom = 0, jobsInd = 0, capPop = 0, capCom = 0, capInd = 0;
    for (const z of this.zones) {
      z.pop = z.capPop * z.level; z.jobs = z.capJobs * z.level;
      pop += z.pop;
      if (z.kind === 'commercial' || z.kind === 'dense' || z.kind === 'civic') jobsCom += z.jobs; else jobsInd += z.jobs;
      if (z.kind === 'residential' || z.kind === 'dense') capPop += z.capPop;
      if (z.kind === 'commercial' || z.kind === 'dense' || z.kind === 'civic') capCom += z.capJobs;
      if (z.kind === 'industrial' || z.kind === 'waterfront') capInd += z.capJobs;
    }
    return { pop, jobsCom, jobsInd, jobs: jobsCom + jobsInd, capPop, capCom, capInd };
  }

  /** the three demand figures (-1..1): housing wants jobs, shops want people, works want people and goods */
  private updateDemand(): void {
    const t = this.totals(), workers = t.pop * 0.5;
    const R = Math.tanh((t.jobs - workers) / Math.max(200, workers) * 1.6 + 0.15);
    const C = Math.tanh((workers * 0.8 - t.jobsCom) / Math.max(200, t.jobsCom) * 1.4 + 0.1);
    const I = Math.tanh((workers * 0.3 + 100 - t.jobsInd * 0.5) / Math.max(200, t.jobsInd) * 1.2 + 0.05);
    this.demand = { R, C, I };
  }

  /** one sim minute of growth */
  private tick(): void {
    this.updateDemand();
    const dem = this.demand;
    for (const z of this.zones) {
      const maxLevel = DENSITY[z.kind].built + (z.landValue > 0.9 ? 0.25 : 0) + (z.landValue > 1.1 ? 0.1 : 0);
      const d = z.kind === 'residential' || z.kind === 'dense' ? dem.R : z.kind === 'commercial' || z.kind === 'civic' ? dem.C : z.kind === 'industrial' || z.kind === 'waterfront' ? dem.I : 0;
      let g = 0;
      if (z.kind === 'farmland' || z.kind === 'parkland') g = 0;
      else if (!z.access) g = -0.0006;              // no road: abandoned slowly
      else g = (d > 0 ? d * (0.5 + z.landValue) : d * 0.5) * 0.0045;
      z.level = Math.max(0.03, Math.min(Math.min(1, maxLevel), z.level + g));
    }
  }
  step(dtSimSeconds: number): void {
    this.acc += dtSimSeconds;
    while (this.acc >= 60) { this.acc -= 60; this.minutes++; this.tick(); if (this.minutes % 30 === 0) this.recalc(); }
  }
  /** run the zones forward so a fresh world starts in a plausible state */
  settle(minutes = 600): void { for (let i = 0; i < minutes; i++) this.tick(); }

  zoneAt(x: number, z: number): Zone | null {
    for (const zn of this.zones) if (pointInPoly(zn.poly, x, z)) return zn;
    return null;
  }
}

function hash01(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return (h % 1000) / 1000; }
