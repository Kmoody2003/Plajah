/**
 * Build compact basemaps for the Douglass motion-graphics film from Natural Earth (public domain).
 *
 *   npx tsx scripts/dossier/buildBasemap.ts
 *
 * Outputs
 *   data/dossier/douglassBasemap.json  US East Coast, lon -80..-69, lat 37..44.5  (< 150 KB)
 *   data/dossier/atlanticBasemap.json  Atlantic world, lon -80..10, lat 15..60    (< 120 KB)
 *
 * Geometry is [lon, lat] with 3 decimals. Polylines (coast, borders) are clipped segment-wise and may
 * be split where they leave the box; land polygons are clipped with Sutherland–Hodgman so they can be
 * filled (edges that run along the bbox are artefacts of clipping, not coastline: stroke `coast`, fill `land`).
 *
 * Source: Natural Earth vector data via https://github.com/nvkelso/natural-earth-vector (GeoJSON build).
 * "Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com." — public domain.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Pt = [number, number];
export type Line = Pt[];
export type BBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, 'node_modules', '.cache', 'natural-earth');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
export const ATTRIBUTION = 'Made with Natural Earth (public domain)';

export async function fetchGeo(name: string): Promise<any> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, name);
  if (!existsSync(file)) {
    process.stdout.write(`downloading ${name} … `);
    const res = await fetch(NE + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log('ok');
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Every line/ring in a FeatureCollection, optionally filtered by feature properties. */
export function linesOf(fc: any, keep: (p: any) => boolean = () => true): { lines: Line[]; rings: Line[][] } {
  const lines: Line[] = []; const rings: Line[][] = [];
  for (const f of fc.features) {
    if (!f.geometry || !keep(f.properties ?? {})) continue;
    const g = f.geometry;
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
    else if (g.type === 'Polygon') rings.push(g.coordinates);
    else if (g.type === 'MultiPolygon') rings.push(...g.coordinates);
  }
  return { lines, rings };
}

const inside = (p: Pt, b: BBox) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** Liang–Barsky segment clip. */
function clipSeg(a: Pt, c: Pt, b: BBox): [Pt, Pt] | null {
  let t0 = 0, t1 = 1;
  const dx = c[0] - a[0], dy = c[1] - a[1];
  const p = [-dx, dx, -dy, dy], q = [a[0] - b[0], b[2] - a[0], a[1] - b[1], b[3] - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

/** Clip a polyline to the box, splitting it into pieces wherever it exits. */
export function clipLine(line: Line, b: BBox): Line[] {
  const out: Line[] = []; let cur: Line = [];
  for (let i = 0; i < line.length - 1; i++) {
    const s = clipSeg(line[i], line[i + 1], b);
    if (!s) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    if (!cur.length) cur.push(s[0]);
    cur.push(s[1]);
    if (!inside(line[i + 1], b)) { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Sutherland–Hodgman ring clip against an axis-aligned box (convex window). */
export function clipRing(ring: Line, b: BBox): Line {
  const edges: Array<[(p: Pt) => boolean, (p: Pt, q: Pt) => Pt]> = [
    [p => p[0] >= b[0], (p, q) => [b[0], p[1] + (q[1] - p[1]) * (b[0] - p[0]) / (q[0] - p[0])]],
    [p => p[0] <= b[2], (p, q) => [b[2], p[1] + (q[1] - p[1]) * (b[2] - p[0]) / (q[0] - p[0])]],
    [p => p[1] >= b[1], (p, q) => [p[0] + (q[0] - p[0]) * (b[1] - p[1]) / (q[1] - p[1]), b[1]]],
    [p => p[1] <= b[3], (p, q) => [p[0] + (q[0] - p[0]) * (b[3] - p[1]) / (q[1] - p[1]), b[3]]],
  ];
  let pts = ring;
  for (const [isIn, cross] of edges) {
    if (!pts.length) break;
    const next: Line = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      if (isIn(p)) { if (!isIn(prev)) next.push(cross(prev, p)); next.push(p); }
      else if (isIn(prev)) next.push(cross(prev, p));
    }
    pts = next;
  }
  return pts;
}

/** Iterative Douglas–Peucker. */
function simplify(line: Line, tol: number): Line {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, line.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = line[s], [bx, by] = line[e];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = line[i];
      let d2: number;
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > best) { best = d2; idx = i; }
    }
    if (best > t2) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return line.filter((_, i) => keep[i]);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
function finish(lines: Line[], tol: number, minPts = 2): Line[] {
  const out: Line[] = [];
  for (const l of lines) {
    const s = simplify(l, tol).map(([x, y]) => [r3(x), r3(y)] as Pt)
      .filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    if (s.length >= minPts) out.push(s);
  }
  return out;
}

export function clipLines(lines: Line[], b: BBox, tol: number) { return finish(lines.flatMap(l => clipLine(l, b)), tol); }
export function clipPolys(rings: Line[][], b: BBox, tol: number) {
  // Outer rings only (holes are lakes/bays handled by the `lakes` layer); drop slivers.
  return finish(rings.map(r => clipRing(r[0], b)).filter(r => r.length >= 3), tol, 4);
}

async function main() {
  const tol = 0.02;
  const east: BBox = [-80, 37, -69, 44.5];
  const STATES = new Set(['Maryland', 'Delaware', 'Pennsylvania', 'New Jersey', 'New York', 'Connecticut', 'Rhode Island',
    'Massachusetts', 'Virginia', 'West Virginia', 'Vermont', 'New Hampshire', 'Maine', 'District of Columbia']);

  const coast = linesOf(await fetchGeo('ne_10m_coastline.geojson')).lines;
  const land = linesOf(await fetchGeo('ne_10m_land.geojson')).rings;
  const states = linesOf(await fetchGeo('ne_10m_admin_1_states_provinces_lines.geojson'),
    p => p.adm0_a3 === 'USA' || p.ADM0_A3 === 'USA').lines;
  const lakes = linesOf(await fetchGeo('ne_10m_lakes.geojson'), p => (p.scalerank ?? 9) <= 2).rings;
  const borders = linesOf(await fetchGeo('ne_10m_admin_0_boundary_lines_land.geojson')).lines;
  const statePolys = await fetchGeo('ne_10m_admin_1_states_provinces.geojson');
  const labels = statePolys.features
    .filter((f: any) => f.properties.adm0_a3 === 'USA' && STATES.has(f.properties.name))
    .map((f: any) => ({ name: f.properties.name, postal: f.properties.postal, lon: r3(f.properties.longitude), lat: r3(f.properties.latitude) }))
    .filter((l: any) => inside([l.lon, l.lat], east));

  const eastOut = {
    attribution: ATTRIBUTION,
    source: 'Natural Earth 1:10m coastline, land, lakes, admin-0 boundary lines, admin-1 states/provinces lines (v5.x), via github.com/nvkelso/natural-earth-vector',
    license: 'public-domain',
    bbox: east,
    simplifyToleranceDeg: tol,
    layers: {
      land: clipPolys(land, east, tol),
      coast: clipLines(coast, east, tol),
      lakes: finish(lakes.map(r => clipRing(r[0], east)).filter(r => r.length >= 3), tol, 4),
      states: clipLines(states, east, tol),
      countries: clipLines(borders, east, tol),
    },
    stateLabels: labels,
  };

  const atl: BBox = [-80, 15, 10, 60];
  const atlTol = 0.05;
  const land110 = linesOf(await fetchGeo('ne_110m_land.geojson')).rings;
  const coast110 = linesOf(await fetchGeo('ne_110m_coastline.geojson')).lines;
  const atlOut = {
    attribution: ATTRIBUTION,
    source: 'Natural Earth 1:110m land and coastline (v5.x), via github.com/nvkelso/natural-earth-vector',
    license: 'public-domain',
    bbox: atl,
    simplifyToleranceDeg: atlTol,
    layers: { land: clipPolys(land110, atl, atlTol), coast: clipLines(coast110, atl, atlTol) },
  };

  const outDir = join(ROOT, 'data', 'dossier');
  for (const [name, obj, limit] of [['douglassBasemap.json', eastOut, 150_000], ['atlanticBasemap.json', atlOut, 120_000]] as const) {
    const json = JSON.stringify(obj);
    writeFileSync(join(outDir, name), json);
    const counts = Object.entries(obj.layers).map(([k, v]) => `${k}:${(v as Line[]).length}`).join(' ');
    console.log(`${name}: ${(json.length / 1024).toFixed(1)} KB (${counts})${json.length > limit ? '  ⚠ OVER LIMIT' : ''}`);
    if (json.length > limit) process.exitCode = 1;
  }
}

if (process.argv[1]?.split('\\').join('/').endsWith('scripts/dossier/buildBasemap.ts')) main().catch(e => { console.error(e); process.exit(1); });
