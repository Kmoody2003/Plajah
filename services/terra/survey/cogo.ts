/**
 * COGO — coordinate geometry, the surveyor's arithmetic.
 *
 * Plane-survey conventions throughout:
 *   • x = Easting (departure), y = Northing (latitude), both in feet.
 *   • Azimuths are measured clockwise from north, 0–360°.
 *   • Bearings are quadrant bearings (N 30°07'44" W), the form deeds use.
 *   • Latitude  = L · cos(Az)   Departure = L · sin(Az)
 *   • Curves: Δ = L / R (radians), chord C = 2R·sin(Δ/2), tangent T = R·tan(Δ/2),
 *     segment area = R²/2 · (Δ − sin Δ).
 *
 * Feet are INTERNATIONAL feet (0.3048 m) — Michigan's State Plane foot.
 */

export const FT_PER_M = 1 / 0.3048;
const RAD = Math.PI / 180;

export interface Pt { x: number; y: number }

export type Quadrant = 'NE' | 'SE' | 'SW' | 'NW';

export interface Bearing {
  ns: 'N' | 'S';
  ew: 'E' | 'W';
  /** Angle off the meridian, decimal degrees, 0–90. */
  deg: number;
}

// ─── Angles ──────────────────────────────────────────────────────────────────

export function norm360(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

/** Signed difference b − a folded into (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = norm360(b - a);
  if (d > 180) d -= 360;
  return d;
}

export function dmsToDeg(d: number, m = 0, s = 0): number {
  return d + m / 60 + s / 3600;
}

/** 30.12889 → 30°07'44" (seconds rounded; carries handled). */
export function formatDms(deg: number, secDecimals = 0): string {
  const sign = deg < 0 ? '-' : '';
  let a = Math.abs(deg);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = (a - d - m / 60) * 3600;
  const f = 10 ** secDecimals;
  s = Math.round(s * f) / f;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  const ss = secDecimals ? s.toFixed(secDecimals).padStart(3 + secDecimals, '0') : String(s).padStart(2, '0');
  return `${sign}${d}°${String(m).padStart(2, '0')}'${ss}"`;
}

export function bearingToAzimuth(b: Bearing): number {
  if (b.ns === 'N' && b.ew === 'E') return b.deg;
  if (b.ns === 'S' && b.ew === 'E') return 180 - b.deg;
  if (b.ns === 'S' && b.ew === 'W') return 180 + b.deg;
  return norm360(360 - b.deg);
}

export function azimuthToBearing(az: number): Bearing {
  const a = norm360(az);
  if (a <= 90) return { ns: 'N', ew: 'E', deg: a };
  if (a <= 180) return { ns: 'S', ew: 'E', deg: 180 - a };
  if (a <= 270) return { ns: 'S', ew: 'W', deg: a - 180 };
  return { ns: 'N', ew: 'W', deg: 360 - a };
}

export function formatBearing(az: number, secDecimals = 0): string {
  const b = azimuthToBearing(az);
  return `${b.ns} ${formatDms(b.deg, secDecimals)} ${b.ew}`;
}

/** Compass direction words → azimuth. Used for "CONCAVE TO THE NORTHEAST". */
export function compassToAzimuth(word: string): number | null {
  const w = word.toUpperCase().replace(/ERLY|ERN|WARD|LY/g, '').replace(/\s+/g, '');
  const map: Record<string, number> = {
    N: 0, NORTH: 0, NE: 45, NORTHEAST: 45, E: 90, EAST: 90, SE: 135, SOUTHEAST: 135,
    S: 180, SOUTH: 180, SW: 225, SOUTHWEST: 225, W: 270, WEST: 270, NW: 315, NORTHWEST: 315,
  };
  return w in map ? map[w] : null;
}

// ─── Vectors ─────────────────────────────────────────────────────────────────

export function azimuthOf(a: Pt, b: Pt): number {
  return norm360(Math.atan2(b.x - a.x, b.y - a.y) / RAD);
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function latDep(az: number, len: number): { lat: number; dep: number } {
  return { lat: len * Math.cos(az * RAD), dep: len * Math.sin(az * RAD) };
}

/** Shoelace. Positive = counter-clockwise in x=E / y=N. */
export function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function centroid(pts: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

export function distanceToPolygon(p: Pt, ring: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = pointSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]).d;
    if (d < best) best = d;
  }
  return best;
}

export function pointInPolygon(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function rotate(p: Pt, deg: number, about: Pt = { x: 0, y: 0 }): Pt {
  // Clockwise rotation by `deg` — matches azimuth sense (adds deg to every azimuth).
  const r = deg * RAD, c = Math.cos(r), s = Math.sin(r);
  const x = p.x - about.x, y = p.y - about.y;
  return { x: about.x + x * c + y * s, y: about.y - x * s + y * c };
}

// ─── Curves ──────────────────────────────────────────────────────────────────

export interface CurveElements {
  radius: number;
  /** Central angle Δ, degrees. */
  delta: number;
  arc: number;
  chord: number;
  tangent: number;
  /** Middle ordinate M = R(1 − cos Δ/2). */
  middleOrdinate: number;
  /** External E = R(sec Δ/2 − 1). */
  external: number;
  /** Area between arc and chord. */
  segmentArea: number;
}

/**
 * Solve a circular curve from any two of radius / arc / chord / delta.
 * Returns null if under-determined or inconsistent (chord > diameter).
 */
export function solveCurve(input: { radius?: number; arc?: number; chord?: number; delta?: number }): CurveElements | null {
  let { radius: R, arc: L, chord: C, delta: D } = input;
  let dRad: number | undefined = D !== undefined ? D * RAD : undefined;
  if (R && L) dRad = L / R;
  else if (R && dRad !== undefined) L = R * dRad;
  else if (R && C) { if (C > 2 * R) return null; dRad = 2 * Math.asin(C / (2 * R)); L = R * dRad; }
  else if (L && dRad) R = L / dRad;
  else if (C && dRad) R = C / (2 * Math.sin(dRad / 2));
  else if (L && C) {
    // Solve C/L = sin(Δ/2)/(Δ/2) by Newton on Δ.
    if (C >= L) return null;
    let x = Math.sqrt(6 * (1 - C / L)) * 2; // small-angle seed for Δ
    for (let i = 0; i < 40; i++) {
      const h = x / 2;
      const f = Math.sin(h) / h - C / L;
      const df = (h * Math.cos(h) - Math.sin(h)) / (h * h) / 2;
      const nx = x - f / df;
      if (!Number.isFinite(nx)) break;
      if (Math.abs(nx - x) < 1e-12) { x = nx; break; }
      x = nx;
    }
    dRad = x; R = L / x;
  }
  if (!R || dRad === undefined || !(dRad > 0)) return null;
  L = R * dRad;
  const chord = 2 * R * Math.sin(dRad / 2);
  return {
    radius: R,
    delta: dRad / RAD,
    arc: L,
    chord,
    tangent: R * Math.tan(dRad / 2),
    middleOrdinate: R * (1 - Math.cos(dRad / 2)),
    external: R * (1 / Math.cos(dRad / 2) - 1),
    segmentArea: (R * R / 2) * (dRad - Math.sin(dRad)),
  };
}

// ─── Projection ──────────────────────────────────────────────────────────────

/**
 * Local tangent-plane projection at an origin, on the GRS80 ellipsoid. Over a
 * city block the distortion is a few parts per million — far below the noise of
 * any GIS parcel layer — and it needs no State Plane zone table.
 */
export function makeLocalProjection(lat0: number, lng0: number) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f);
  const s = Math.sin(lat0 * RAD);
  const w = Math.sqrt(1 - e2 * s * s);
  const M = (a * (1 - e2)) / (w * w * w); // meridian radius of curvature
  const N = a / w;                         // prime vertical
  const kx = N * Math.cos(lat0 * RAD) * RAD * FT_PER_M;
  const ky = M * RAD * FT_PER_M;
  return {
    toLocal: (lng: number, lat: number): Pt => ({ x: (lng - lng0) * kx, y: (lat - lat0) * ky }),
    toLngLat: (p: Pt): [number, number] => [lng0 + p.x / kx, lat0 + p.y / ky],
  };
}
