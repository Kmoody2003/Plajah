import type { AirportInput, AirportKind } from './airport';
import type { RoadClass, RoadInput } from './network';
import type { RailKind, RailLineInput, RailService, StationInput } from './rail';
import type { ServiceInput, ServiceKind, ZoneInput, ZoneKind } from './zones';

/** What the map editor saves (region/user_map.json, version 1). New feature types are additive, so older files load unchanged. */
export interface UserFeature {
  id: string;
  type: 'road' | 'zone' | 'rail' | 'station' | 'airport' | 'service';
  kind: string; name: string; note: string; pts: number[][];
  oneway?: boolean; lanes?: number; service?: RailService;
}
export interface UserMapData { version: 1; features: UserFeature[] }

export interface GeneratedRoads {
  /** country_roads.json, user_streets.json: { roads: [{ kind: 'paved' | 'dirt', xz }] } */
  country?: { roads: { kind: string; xz: number[][]; half?: number }[] }[];
  /** the downtown street runs (city_streets.json): [{ c: street | arterial | freeway | ramp, p }] */
  city?: { c: string; p: number[][] }[];
  /** shoreline_highway.json */
  shoreline?: { xz: number[][] } | null;
}

const ROAD_KINDS: Record<string, RoadClass> = { street: 'street', avenue: 'avenue', highway: 'highway', dirt: 'dirt', collector: 'collector', service: 'service', ramp: 'ramp' };
const CITY: Record<string, RoadClass> = { street: 'street', arterial: 'avenue', freeway: 'highway', ramp: 'ramp' };
/** the downtown carriageway widths (tools/build_city_mask.py), halved */
const CITY_HALF: Record<string, number> = { street: 4.25, arterial: 7, freeway: 6.25, ramp: 2.75 };

const p2 = (a: number[][]): [number, number][] => a.map((p) => [p[0], p[1]]);

export interface SimData { roads: RoadInput[]; zones: ZoneInput[]; services: ServiceInput[]; rails: RailLineInput[]; stations: StationInput[]; airport: AirportInput[] }

export function featuresToSim(map: UserMapData | null, gen: GeneratedRoads = {}): SimData {
  const out: SimData = { roads: [], zones: [], services: [], rails: [], stations: [], airport: [] };
  // the generated road set mixes every kind; its width says what each one is: the freeway (half 10) is grade-separated, the coastal highway (6.4) a fast two-lane road,
  // town connectors and main streets (5.0) collectors, subdivision streets (3.4) local streets, the country section roads (no width) collectors
  gen.country?.forEach((set, si) => set.roads.forEach((r, i) => {
    if (r.xz.length < 2 || (r.kind as string) === 'drive' || (r as { trail?: boolean }).trail) return;
    const h = r.half ?? 3.6;
    const cls: RoadClass = r.kind === 'dirt' ? 'dirt' : h >= 9 ? 'highway' : h >= 6 ? 'collector' : h >= 4.6 ? 'collector' : h <= 3.5 ? 'street' : si === 0 ? 'collector' : 'street';
    out.roads.push({ id: `g${si}-${i}`, cls, pts: p2(r.xz), half: r.half, speed: h >= 6 && h < 9 ? 22 : undefined });
  }));
  gen.city?.forEach((r, i) => { if (r.p.length >= 2) out.roads.push({ id: `c${i}`, cls: CITY[r.c] ?? 'street', pts: p2(r.p), half: CITY_HALF[r.c] }); });
  if (gen.shoreline && gen.shoreline.xz.length >= 2) out.roads.push({ id: 'shoreline', cls: 'collector', speed: 20, pts: p2(gen.shoreline.xz) });
  for (const f of map?.features ?? []) {
    if (!f.pts || !f.pts.length) continue;
    if (f.type === 'road') { const cls = ROAD_KINDS[f.kind]; if (cls && f.pts.length >= 2) out.roads.push({ id: f.id, cls, pts: p2(f.pts), oneway: f.oneway ?? f.kind === 'ramp', lanes: f.lanes }); }
    else if (f.type === 'zone') { if (f.pts.length >= 3) out.zones.push({ id: f.id, kind: f.kind as ZoneKind, pts: p2(f.pts), name: f.name }); }
    else if (f.type === 'rail') { if (f.pts.length >= 2) out.rails.push({ id: f.id, kind: (f.kind === 'double' ? 'double' : 'single') as RailKind, pts: p2(f.pts), service: f.service, name: f.name || undefined }); }
    else if (f.type === 'station') out.stations.push({ id: f.id, kind: f.kind as StationInput['kind'], x: f.pts[0][0], z: f.pts[0][1], name: f.name || undefined });
    else if (f.type === 'airport') out.airport.push({ id: f.id, kind: f.kind as AirportKind, pts: p2(f.pts) });
    else if (f.type === 'service') out.services.push({ id: f.id, kind: f.kind as ServiceKind, x: f.pts[0][0], z: f.pts[0][1] });
  }
  return out;
}
