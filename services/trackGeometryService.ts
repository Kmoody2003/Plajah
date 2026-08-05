// Track geometry for 3D race course maps (F1 / NASCAR / IndyCar).
//
// Sources:
//  - F1: real circuit centerlines from the public f1-circuits GeoJSON
//    (github.com/bacinger/f1-circuits, ODbL) — includes length & altitude.
//  - NASCAR / IndyCar ovals: parametric generators driven by each track's
//    real published specs (length, banking, layout type).
//  - Road/street courses outside F1: OpenStreetMap raceway ways via the
//    Overpass API (ODbL), fetched by track name and cached.
//
// All geometry is returned as local-meter coordinates centred on the track.

export interface TrackPoint { x: number; y: number; z: number }

export interface TrackTurn {
  index: number;          // index into points[]
  label: string;          // "Turn 1", "Tri-Oval", ...
  banking?: number;       // degrees
}

export interface TrackGeometry {
  id: string;
  name: string;
  series: ('F1' | 'NASCAR' | 'INDYCAR')[];
  location: string;
  country: string;
  lengthKm: number;
  type: 'oval' | 'road' | 'street';
  maxBankingDeg: number;
  points: TrackPoint[];   // closed centerline loop, local meters
  turns: TrackTurn[];
  source: string;
}

export interface TrackCatalogEntry {
  id: string;
  name: string;
  series: ('F1' | 'NASCAR' | 'INDYCAR')[];
  location: string;
  country: string;
  type: 'oval' | 'road' | 'street';
}

const F1_GEOJSON_URL = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const _cache = new Map<string, any>();

const LS_TTL = 7 * 24 * 60 * 60 * 1000;

async function proxiedJson(url: string): Promise<any> {
  if (_cache.has(url)) return _cache.get(url);
  const isBrowser = typeof window !== 'undefined';
  const lsKey = `plajah_trackgeo:${url}`;
  if (isBrowser) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < LS_TTL) { _cache.set(url, data); return data; }
      }
    } catch { /* corrupted entry — refetch */ }
  }
  try {
    // Overpass rejects "Mozilla/5.0 (compatible; ...)" bot UAs with 406 but
    // serves real browsers (CORS enabled) and plainly-identified bots — so hit
    // it directly from the browser and with a bot UA from node. Everything
    // else goes through the server proxy in the browser as usual.
    const isOverpass = url.includes('overpass');
    const requestUrl = isBrowser && !isOverpass ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
    const res = await fetch(requestUrl, {
      signal: AbortSignal.timeout(20000),
      ...(isBrowser ? {} : { headers: { 'User-Agent': 'Plajah/1.0 (sports data archive)' } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    _cache.set(url, data);
    if (isBrowser) {
      try { localStorage.setItem(lsKey, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
    }
    return data;
  } catch { return null; }
}

// ─── Coordinate projection: lon/lat → local meters ──────────────────────────

function projectToLocal(coords: [number, number][]): TrackPoint[] {
  if (!coords.length) return [];
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const mPerDegLat = 111_132;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const pts = coords.map(([lon, lat]) => ({
    x: (lon - lon0) * mPerDegLon,
    y: (lat - lat0) * mPerDegLat,
    z: 0,
  }));
  return resampleLoop(pts, 300);
}

// Evenly resample a closed polyline — OSM/GeoJSON sources vary from ~25 to
// ~150 vertices; a uniform 300 keeps ribbons smooth and turn detection stable.
function resampleLoop(pts: TrackPoint[], n: number): TrackPoint[] {
  if (pts.length < 3) return pts;
  const closed = [...pts, pts[0]];
  const cum: number[] = [0];
  for (let i = 1; i < closed.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return pts;
  const out: TrackPoint[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (seg < cum.length - 2 && cum[seg + 1] < target) seg++;
    const t = (target - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]);
    out.push({
      x: closed[seg].x + (closed[seg + 1].x - closed[seg].x) * t,
      y: closed[seg].y + (closed[seg + 1].y - closed[seg].y) * t,
      z: 0,
    });
  }
  return out;
}

// ─── F1 circuits (real geometry) ─────────────────────────────────────────────

let f1Features: any[] | null = null;

export async function loadF1Circuits(): Promise<TrackCatalogEntry[]> {
  const data = await proxiedJson(F1_GEOJSON_URL);
  f1Features = data?.features ?? [];
  return (f1Features ?? []).map((f: any) => ({
    id: `f1:${f.properties?.id ?? f.properties?.Name}`,
    name: f.properties?.Name ?? 'Circuit',
    series: ['F1'] as TrackGeometry['series'],
    location: f.properties?.Location ?? '',
    country: '',
    type: 'road' as const,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

async function f1Geometry(id: string): Promise<TrackGeometry | null> {
  if (!f1Features) await loadF1Circuits();
  const slug = id.replace(/^f1:/, '');
  const f = (f1Features ?? []).find((x: any) => String(x.properties?.id) === slug || x.properties?.Name === slug);
  if (!f) return null;
  const line: [number, number][] = f.geometry?.type === 'LineString' ? f.geometry.coordinates
    : f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates.flat() : [];
  if (line.length < 10) return null;
  const points = projectToLocal(line.map(c => [c[0], c[1]] as [number, number]));
  return {
    id, name: f.properties?.Name ?? slug,
    series: ['F1'],
    location: f.properties?.Location ?? '',
    country: '',
    lengthKm: (f.properties?.length ?? 0) / 1000,
    type: 'road',
    maxBankingDeg: 0,
    points,
    turns: deriveTurnsFromCurvature(points),
    source: 'f1-circuits GeoJSON (ODbL)',
  };
}

// Detect corners on real geometry by local curvature peaks → numbered turns
function deriveTurnsFromCurvature(points: TrackPoint[]): TrackTurn[] {
  const n = points.length;
  if (n < 30) return [];
  const win = Math.max(3, Math.round(n / 150));
  const angles: number[] = points.map((_, i) => {
    const a = points[(i - win + n) % n], b = points[i], c = points[(i + win) % n];
    const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const dot = v1x * v2x + v1y * v2y;
    const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
    if (!m1 || !m2) return 0;
    return Math.acos(Math.min(1, Math.max(-1, dot / (m1 * m2))));
  });
  const turns: TrackTurn[] = [];
  const minGap = Math.round(n / 40);
  let lastIdx = -minGap;
  angles.forEach((ang, i) => {
    if (ang > 0.12 && i - lastIdx >= minGap) {
      const isPeak = ang >= (angles[(i - 1 + n) % n] ?? 0) && ang >= (angles[(i + 1) % n] ?? 0);
      if (isPeak) { turns.push({ index: i, label: `Turn ${turns.length + 1}` }); lastIdx = i; }
    }
  });
  return turns.slice(0, 30);
}

// ─── Parametric oval generator ───────────────────────────────────────────────

type OvalShape = 'oval' | 'tri-oval' | 'quad-oval' | 'd-oval' | 'paperclip' | 'egg' | 'triangle' | 'rectangle' | 'dogleg';

interface OvalSpec {
  name: string;
  series: ('NASCAR' | 'INDYCAR')[];
  location: string;
  lengthMiles: number;
  bankingDeg: number;     // max corner banking
  shape: OvalShape;
}

// Real published specs for active ovals.
const OVALS: Record<string, OvalSpec> = {
  daytona:        { name: 'Daytona International Speedway', series: ['NASCAR'], location: 'Daytona Beach, FL', lengthMiles: 2.5,   bankingDeg: 31, shape: 'tri-oval' },
  talladega:      { name: 'Talladega Superspeedway',        series: ['NASCAR'], location: 'Lincoln, AL',       lengthMiles: 2.66,  bankingDeg: 33, shape: 'tri-oval' },
  atlanta:        { name: 'EchoPark Speedway (Atlanta)',    series: ['NASCAR'], location: 'Hampton, GA',       lengthMiles: 1.54,  bankingDeg: 28, shape: 'quad-oval' },
  charlotte:      { name: 'Charlotte Motor Speedway',       series: ['NASCAR'], location: 'Concord, NC',       lengthMiles: 1.5,   bankingDeg: 24, shape: 'quad-oval' },
  texas:          { name: 'Texas Motor Speedway',           series: ['NASCAR'], location: 'Fort Worth, TX',    lengthMiles: 1.5,   bankingDeg: 20, shape: 'quad-oval' },
  kansas:         { name: 'Kansas Speedway',                series: ['NASCAR'], location: 'Kansas City, KS',   lengthMiles: 1.5,   bankingDeg: 19, shape: 'tri-oval' },
  lasvegas:       { name: 'Las Vegas Motor Speedway',       series: ['NASCAR'], location: 'Las Vegas, NV',     lengthMiles: 1.5,   bankingDeg: 20, shape: 'tri-oval' },
  homestead:      { name: 'Homestead-Miami Speedway',       series: ['NASCAR'], location: 'Homestead, FL',     lengthMiles: 1.5,   bankingDeg: 20, shape: 'oval' },
  michigan:       { name: 'Michigan International Speedway',series: ['NASCAR'], location: 'Brooklyn, MI',      lengthMiles: 2.0,   bankingDeg: 18, shape: 'd-oval' },
  pocono:         { name: 'Pocono Raceway',                 series: ['NASCAR'], location: 'Long Pond, PA',     lengthMiles: 2.5,   bankingDeg: 14, shape: 'triangle' },
  indianapolis:   { name: 'Indianapolis Motor Speedway',    series: ['NASCAR', 'INDYCAR'], location: 'Speedway, IN', lengthMiles: 2.5, bankingDeg: 9, shape: 'rectangle' },
  darlington:     { name: 'Darlington Raceway',             series: ['NASCAR'], location: 'Darlington, SC',    lengthMiles: 1.366, bankingDeg: 25, shape: 'egg' },
  dover:          { name: 'Dover Motor Speedway',           series: ['NASCAR'], location: 'Dover, DE',         lengthMiles: 1.0,   bankingDeg: 24, shape: 'oval' },
  nashville:      { name: 'Nashville Superspeedway',        series: ['NASCAR'], location: 'Lebanon, TN',       lengthMiles: 1.33,  bankingDeg: 14, shape: 'd-oval' },
  phoenix:        { name: 'Phoenix Raceway',                series: ['NASCAR'], location: 'Avondale, AZ',      lengthMiles: 1.0,   bankingDeg: 11, shape: 'dogleg' },
  richmond:       { name: 'Richmond Raceway',               series: ['NASCAR'], location: 'Richmond, VA',      lengthMiles: 0.75,  bankingDeg: 14, shape: 'd-oval' },
  martinsville:   { name: 'Martinsville Speedway',          series: ['NASCAR'], location: 'Ridgeway, VA',      lengthMiles: 0.526, bankingDeg: 12, shape: 'paperclip' },
  bristol:        { name: 'Bristol Motor Speedway',         series: ['NASCAR'], location: 'Bristol, TN',       lengthMiles: 0.533, bankingDeg: 26, shape: 'oval' },
  newhampshire:   { name: 'New Hampshire Motor Speedway',   series: ['NASCAR'], location: 'Loudon, NH',        lengthMiles: 1.058, bankingDeg: 7,  shape: 'paperclip' },
  gateway:        { name: 'World Wide Technology Raceway',  series: ['NASCAR', 'INDYCAR'], location: 'Madison, IL', lengthMiles: 1.25, bankingDeg: 11, shape: 'egg' },
  iowa:           { name: 'Iowa Speedway',                  series: ['NASCAR', 'INDYCAR'], location: 'Newton, IA', lengthMiles: 0.875, bankingDeg: 13, shape: 'd-oval' },
  northwilkesboro:{ name: 'North Wilkesboro Speedway',      series: ['NASCAR'], location: 'N. Wilkesboro, NC', lengthMiles: 0.625, bankingDeg: 14, shape: 'oval' },
  milwaukee:      { name: 'Milwaukee Mile',                 series: ['INDYCAR'], location: 'West Allis, WI',   lengthMiles: 1.015, bankingDeg: 9,  shape: 'oval' },
};

const MI_TO_M = 1609.344;

// Build a closed oval centerline of the requested shape, scaled so the lap
// length matches the real track length.
function generateOval(spec: OvalSpec): TrackPoint[] {
  const N = 400;
  const pts: TrackPoint[] = [];

  // Base half-dimensions (arbitrary units, rescaled to true length afterwards)
  let a = 2.2, b = 1;           // straight half-length / turn radius
  switch (spec.shape) {
    case 'paperclip':  a = 2.8; b = 0.7; break;
    case 'tri-oval':   a = 2.0; b = 1.1; break;
    case 'quad-oval':  a = 2.1; b = 1.05; break;
    case 'd-oval':     a = 2.0; b = 1.1; break;
    case 'egg':        a = 2.2; b = 1.0; break;
    case 'rectangle':  a = 2.5; b = 0.9; break;
    case 'triangle':   a = 2.2; b = 1.0; break;
    case 'dogleg':     a = 2.0; b = 1.0; break;
  }

  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    // Superellipse base gives flat straights + rounded turns
    const exp = spec.shape === 'rectangle' ? 4 : spec.shape === 'paperclip' ? 3 : 2.4;
    const cos = Math.cos(t), sin = Math.sin(t);
    let x = a * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / exp);
    let y = b * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / exp);

    // Shape-specific deformations
    if (spec.shape === 'tri-oval' || spec.shape === 'quad-oval' || spec.shape === 'd-oval' || spec.shape === 'dogleg') {
      // Bow the frontstretch (y < 0 side) outward
      if (y < 0) y -= (spec.shape === 'd-oval' ? 0.35 : 0.22) * Math.pow(Math.abs(cos), 1.5) * (1 - Math.abs(cos));
    }
    if (spec.shape === 'egg') {
      // One end tighter than the other (Darlington/Gateway)
      if (x > 0) { y *= 0.82; x *= 0.92; }
    }
    if (spec.shape === 'triangle') {
      // Pocono: three distinct corners
      const t3 = ((t / (Math.PI * 2)) * 3) % 1;
      const corner = Math.pow(Math.abs(Math.sin(t3 * Math.PI)), 0.45);
      x = a * Math.cos(t) * (0.72 + 0.28 * corner);
      y = b * Math.sin(t) * (0.72 + 0.28 * corner);
    }
    pts.push({ x, y, z: 0 });
  }

  // Rescale so polyline length == real lap length
  let len = 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i], q = pts[(i + 1) % N];
    len += Math.hypot(q.x - p.x, q.y - p.y);
  }
  const scale = (spec.lengthMiles * MI_TO_M) / len;
  return pts.map(p => ({ x: p.x * scale, y: p.y * scale, z: 0 }));
}

function ovalTurns(spec: OvalSpec, points: TrackPoint[]): TrackTurn[] {
  const N = points.length;
  if (spec.shape === 'triangle') {
    return [0, 1, 2].map(k => ({ index: Math.round((k / 3) * N + N / 6) % N, label: `Turn ${k + 1}`, banking: spec.bankingDeg }));
  }
  return [0, 1, 2, 3].map(k => ({
    index: Math.round(((k + 0.5) / 4) * N) % N,
    label: `Turn ${k + 1}`,
    banking: spec.bankingDeg,
  }));
}

// ─── Road courses without F1 geometry → OpenStreetMap Overpass ──────────────

interface OsmCourse {
  name: string;
  series: ('NASCAR' | 'INDYCAR')[];
  location: string;
  lat: number;            // track centre — bounds the Overpass query
  lon: number;
  lengthKm: number;
  type: 'road' | 'street';
}

const OSM_COURSES: Record<string, OsmCourse> = {
  watkinsglen:  { name: 'Watkins Glen International', series: ['NASCAR'],       location: 'Watkins Glen, NY',   lat: 42.3369, lon: -76.9272,  lengthKm: 3.94, type: 'road' },
  sonoma:       { name: 'Sonoma Raceway',             series: ['NASCAR'],       location: 'Sonoma, CA',         lat: 38.1612, lon: -122.4547, lengthKm: 3.19, type: 'road' },
  roadamerica:  { name: 'Road America',               series: ['INDYCAR'],      location: 'Elkhart Lake, WI',   lat: 43.7980, lon: -87.9896,  lengthKm: 6.51, type: 'road' },
  midohio:      { name: 'Mid-Ohio Sports Car Course', series: ['INDYCAR'],      location: 'Lexington, OH',      lat: 40.6894, lon: -82.6361,  lengthKm: 3.86, type: 'road' },
  lagunaseca:   { name: 'WeatherTech Raceway Laguna Seca', series: ['INDYCAR'], location: 'Monterey, CA',       lat: 36.5841, lon: -121.7536, lengthKm: 3.60, type: 'road' },
  barber:       { name: 'Barber Motorsports Park',    series: ['INDYCAR'],      location: 'Birmingham, AL',     lat: 33.5301, lon: -86.6196,  lengthKm: 3.83, type: 'road' },
  portland:     { name: 'Portland International Raceway', series: ['INDYCAR'],  location: 'Portland, OR',       lat: 45.5953, lon: -122.6942, lengthKm: 3.16, type: 'road' },
  longbeach:    { name: 'Long Beach Street Circuit',  series: ['INDYCAR'],      location: 'Long Beach, CA',     lat: 33.7651, lon: -118.1890, lengthKm: 3.17, type: 'street' },
  stpete:       { name: 'Streets of St. Petersburg',  series: ['INDYCAR'],      location: 'St. Petersburg, FL', lat: 27.7681, lon: -82.6332,  lengthKm: 2.90, type: 'street' },
};

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Spatially-bounded raceway lookup — a global name regex scan times out, but a
// 6 km around() query answers in well under a second.
async function overpassRaceways(lat: number, lon: number): Promise<any[]> {
  const query = `[out:json][timeout:15];way["highway"="raceway"](around:6000,${lat},${lon});out geom;`;
  for (const base of OVERPASS_MIRRORS) {
    const data = await proxiedJson(`${base}?data=${encodeURIComponent(query)}`);
    const ways = (data?.elements ?? []).filter((e: any) => e.type === 'way' && Array.isArray(e.geometry));
    if (ways.length) return ways;
  }
  return [];
}

// OSM often splits a circuit into multiple ways — stitch ways end-to-end
// (matching endpoints within ~40 m) starting from the longest segment.
function stitchWays(ways: any[]): [number, number][] {
  const segs: [number, number][][] = ways
    .map(w => w.geometry.map((g: any) => [g.lon, g.lat] as [number, number]))
    .filter(s => s.length >= 2);
  if (!segs.length) return [];
  segs.sort((a, b) => b.length - a.length);

  const close = (a: [number, number], b: [number, number]) =>
    Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111132) < 40;

  let chain = segs.shift()!;
  let extended = true;
  while (extended && segs.length) {
    extended = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const head = chain[0], tail = chain[chain.length - 1];
      if (close(tail, s[0]))      { chain = chain.concat(s.slice(1)); }
      else if (close(tail, s[s.length - 1])) { chain = chain.concat([...s].reverse().slice(1)); }
      else if (close(head, s[s.length - 1])) { chain = s.slice(0, -1).concat(chain); }
      else if (close(head, s[0])) { chain = [...s].reverse().slice(0, -1).concat(chain); }
      else continue;
      segs.splice(i, 1);
      extended = true;
      break;
    }
  }
  return chain;
}

async function osmGeometry(id: string): Promise<TrackGeometry | null> {
  const spec = OSM_COURSES[id.replace(/^osm:/, '')];
  if (!spec) return null;
  const ways = await overpassRaceways(spec.lat, spec.lon);
  if (!ways.length) return null;
  const coords = stitchWays(ways);
  if (coords.length < 20) return null;
  const points = projectToLocal(coords);
  return {
    id: `osm:${id.replace(/^osm:/, '')}`,
    name: spec.name,
    series: spec.series,
    location: spec.location,
    country: 'USA',
    lengthKm: spec.lengthKm,
    type: spec.type,
    maxBankingDeg: 0,
    points,
    turns: deriveTurnsFromCurvature(points),
    source: 'OpenStreetMap (ODbL)',
  };
}

// ─── Public catalog + geometry API ───────────────────────────────────────────

export async function getTrackCatalog(series: 'F1' | 'NASCAR' | 'INDYCAR'): Promise<TrackCatalogEntry[]> {
  if (series === 'F1') return loadF1Circuits();
  const ovals: TrackCatalogEntry[] = Object.entries(OVALS)
    .filter(([, s]) => (s.series as string[]).includes(series))
    .map(([id, s]) => ({ id: `oval:${id}`, name: s.name, series: s.series, location: s.location, country: 'USA', type: 'oval' as const }));
  const osm: TrackCatalogEntry[] = Object.entries(OSM_COURSES)
    .filter(([, s]) => (s.series as string[]).includes(series))
    .map(([id, s]) => ({ id: `osm:${id}`, name: s.name, series: s.series, location: s.location, country: 'USA', type: s.type }));
  // NASCAR also visits two F1 venues with real geometry available
  const f1Shared: TrackCatalogEntry[] = series === 'NASCAR'
    ? [
        { id: 'f1:us-2012', name: 'Circuit of the Americas', series: ['NASCAR'], location: 'Austin, TX', country: 'USA', type: 'road' },
        { id: 'f1:mx-1962', name: 'Autódromo Hermanos Rodríguez', series: ['NASCAR'], location: 'Mexico City', country: 'Mexico', type: 'road' },
      ]
    : [];
  return [...ovals, ...osm, ...f1Shared].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTrackGeometry(id: string): Promise<TrackGeometry | null> {
  const key = `geom:${id}`;
  if (_cache.has(key)) return _cache.get(key);

  let geom: TrackGeometry | null = null;
  if (id.startsWith('f1:')) geom = await f1Geometry(id);
  else if (id.startsWith('osm:')) geom = await osmGeometry(id);
  else if (id.startsWith('oval:')) {
    const spec = OVALS[id.replace(/^oval:/, '')];
    if (spec) {
      const points = generateOval(spec);
      geom = {
        id,
        name: spec.name,
        series: spec.series,
        location: spec.location,
        country: 'USA',
        lengthKm: spec.lengthMiles * 1.609344,
        type: 'oval',
        maxBankingDeg: spec.bankingDeg,
        points,
        turns: ovalTurns(spec, points),
        source: 'Plajah parametric model from published track specs',
      };
    }
  }

  if (geom) _cache.set(key, geom);
  return geom;
}
