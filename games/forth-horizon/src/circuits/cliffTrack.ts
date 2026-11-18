import { GRID } from '../grid';
// The Great Lakes Cliff Raceway as an engineered road, designed once and used by everything that touches it.
//
// A race track is not laid on whatever ground happens to be there: it is designed (a smooth plan line, a smooth long-wavelength profile, banking that follows the curvature), and the ground is
// then graded to it (cuts into the cliff, fills on the lake side, a mountain over the tunnel). This module is that design and that grading:
//   designCliffTrack()      the centre line resampled every 6 m and smoothed, the road height along it (low-pass, grade-limited, never below the lake), the bank angle at each point
//   carveCliffRaceway()     grades the height map to the design: a flat bench under the road, cut and fill slopes back to the natural ground, tunnel cover (the mountain) and the portal approaches
//   cliffSurface()          the exact road surface height at any x,z near the road (crown, bank), so objects, barriers and the car's ground all agree with the drawn asphalt
// Heights here are raw map units (the same as the height map and circuit.y); the builder multiplies by the terrain exaggeration like the rest of the game.

export interface TrackPoint {
  x: number;
  z: number;
  y: number;          // road centre height
  bank: number;       // radians; the road surface rises by sin(bank) per metre toward the +normal side (x - tz, z + tx): negative inside a left-hander etc., already signed
  s: number;          // distance along the track (m)
  curv: number;       // signed curvature (1/m), positive when the plan line turns toward +normal
  src: number;        // index of the original circuit point this one came from
  tunnel: boolean;
}

export interface TrackDesign {
  pts: TrackPoint[];
  half: number;               // road half width
  step: number;
  tunnelFrom: number;         // first and last design indices inside the tunnel (-1 when there is none)
  tunnelTo: number;
  length: number;
}

export interface CircuitSrc { xz: number[][]; y?: number[]; tunnel?: { from: number; to: number } }

const STEP = 6;
export const TRACK_HALF = 7.0;               // 14 m of asphalt: a real race track, wide enough to pass on
export const MIN_ROAD_Y = 3.6;               // the lake is at 2.5: the road never dips toward it
const MAX_GRADE = 0.085;                     // 8.5 %
const MAX_BANK = 0.2;                        // 11.5 degrees

const smoothstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** circular moving average of a closed series, window ±k, repeated */
function blur(a: number[], k: number, times: number): number[] {
  let cur = a.slice();
  const n = a.length;
  for (let t = 0; t < times; t++) {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = -k; j <= k; j++) s += cur[((i + j) % n + n) % n]; out[i] = s / (2 * k + 1); }
    cur = out;
  }
  return cur;
}

export function designCliffTrack(c: CircuitSrc): TrackDesign {
  // 1. resample the polyline evenly, remembering which original point each sample came from (the tunnel is given in original indices)
  let src = c.xz.map((p) => [p[0], p[1]]);
  if (src.length > 2 && Math.hypot(src[0][0] - src[src.length - 1][0], src[0][1] - src[src.length - 1][1]) < 0.5) src = src.slice(0, -1);
  const m = src.length;
  const rawY = (i: number): number => (c.y ? c.y[i % m] : 0);
  let x: number[] = [], z: number[] = [], y: number[] = [], sidx: number[] = [];
  for (let i = 0; i < m; i++) {
    const a = src[i], b = src[(i + 1) % m], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(len / STEP));
    for (let j = 0; j < k; j++) { const t = j / k; x.push(a[0] + (b[0] - a[0]) * t); z.push(a[1] + (b[1] - a[1]) * t); y.push(rawY(i) + (rawY(i + 1) - rawY(i)) * t); sidx.push(i); }
  }
  const n = x.length;

  // 2. plan line: relax it so no corner is a kink (a Laplacian pass, then pulled back to the original where it strayed, so the layout is the same and the curves are smooth).
  const ox = x.slice(), oz = z.slice();
  for (let it = 0; it < 70; it++) {
    const nx = x.slice(), nz = z.slice();
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n, q = (i + 1) % n;
      nx[i] = x[i] * 0.5 + (x[p] + x[q]) * 0.25; nz[i] = z[i] * 0.5 + (z[p] + z[q]) * 0.25;
    }
    for (let i = 0; i < n; i++) {                                  // leash: never more than 14 m from the drawn layout
      const dx = nx[i] - ox[i], dz = nz[i] - oz[i], d = Math.hypot(dx, dz);
      if (d > 14) { nx[i] = ox[i] + dx / d * 14; nz[i] = oz[i] + dz / d * 14; }
    }
    x = nx; z = nz;
  }

  // 3. profile: the long-wavelength shape of the original heights, 5-point-per-grade-limited, kept above the lake. Smoothness is the point: no bumps, only deliberate crests and dips.
  let prof = blur(y, 9, 3);                                         // ±54 m window, three times: about a 200 m vertical curve
  for (let i = 0; i < n; i++) prof[i] = Math.max(MIN_ROAD_Y, prof[i]);
  for (let pass = 0; pass < 6; pass++) {                            // grade limit, forward and backward around the loop
    for (let i = 0; i < n * 2; i++) { const a = i % n, b = (i + 1) % n, lim = MAX_GRADE * Math.hypot(x[b] - x[a], z[b] - z[a]); if (prof[b] - prof[a] > lim) prof[b] = prof[a] + lim; if (prof[a] - prof[b] > lim) prof[a] = prof[b] + lim; }
    for (let i = n * 2; i > 0; i--) { const a = i % n, b = (i - 1) % n, lim = MAX_GRADE * Math.hypot(x[b] - x[a], z[b] - z[a]); if (prof[b] - prof[a] > lim) prof[b] = prof[a] + lim; if (prof[a] - prof[b] > lim) prof[a] = prof[b] + lim; }
    prof = blur(prof, 2, 1);
  }

  // 4. curvature and banking: lean the road into the corner for a ~30 m/s design speed, taper it in and out, none in the tunnel
  const curv = new Array<number>(n).fill(0);
  const K = 3;
  for (let i = 0; i < n; i++) {
    const a = (i - K + n) % n, b = (i + K) % n;
    const ux = x[i] - x[a], uz = z[i] - z[a], vx = x[b] - x[i], vz = z[b] - z[i];
    const l1 = Math.hypot(ux, uz) || 1, l2 = Math.hypot(vx, vz) || 1;
    const cross = (ux * vz - uz * vx) / (l1 * l2), dot = (ux * vx + uz * vz) / (l1 * l2);
    curv[i] = Math.atan2(cross, dot) / ((l1 + l2) / 2);
  }
  const ck = blur(curv, 3, 2);
  const tunnelA = c.tunnel ? sidx.findIndex((s) => s >= c.tunnel!.from) : -1;
  let tunnelB = -1;
  if (c.tunnel) for (let i = n - 1; i >= 0; i--) if (sidx[i] <= c.tunnel.to) { tunnelB = i; break; }
  const inTun = (i: number): boolean => tunnelA >= 0 && tunnelB >= 0 && i >= tunnelA - 4 && i <= tunnelB + 4;
  let bank = ck.map((k) => {
    const lean = Math.atan(Math.abs(k) * 92) * 0.5;                  // v²/g ≈ 92 m at 30 m/s; half the lean the speed would want (the rest is tyre grip)
    return Math.min(MAX_BANK, lean) * (k > 0 ? -1 : 1);             // inside edge lower: see TrackPoint.bank
  });
  bank = blur(bank, 6, 2);
  for (let i = 0; i < n; i++) if (inTun(i)) bank[i] = 0;
  bank = blur(bank, 4, 1);

  const pts: TrackPoint[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
    pts.push({ x: x[i], z: z[i], y: prof[i], bank: bank[i], s, curv: ck[i], src: sidx[i], tunnel: tunnelA >= 0 && i >= tunnelA && i <= tunnelB });
  }
  return { pts, half: TRACK_HALF, step: STEP, tunnelFrom: tunnelA, tunnelTo: tunnelB, length: s };
}

// ---------- lookup ----------
export interface TrackIndex {
  design: TrackDesign;
  /** nearest design point to x,z within r (index and lateral distance), or null */
  near: (x: number, z: number, r: number) => { i: number; lat: number; along: number } | null;
}

export function indexTrack(design: TrackDesign): TrackIndex {
  const C = 32, h = new Map<number, number[]>();
  design.pts.forEach((p, i) => { const k = Math.floor(p.x / C) * 8192 + Math.floor(p.z / C); let a = h.get(k); if (!a) { a = []; h.set(k, a); } a.push(i); });
  const pts = design.pts, n = pts.length;
  return {
    design,
    near: (x, z, r) => {
      const cx = Math.floor(x / C), cz = Math.floor(z / C), reach = Math.ceil(r / C);
      let best = -1, bd = r * r;
      for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
        const l = h.get((cx + a) * 8192 + cz + b); if (!l) continue;
        for (const i of l) { const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
      }
      if (best < 0) return null;
      const p = pts[best], q = pts[(best + 1) % n], o = pts[(best - 1 + n) % n];
      let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const dx = x - p.x, dz = z - p.z;
      return { i: best, lat: dx * -tz + dz * tx, along: dx * tx + dz * tz };      // lat is positive toward the +normal (x - tz, z + tx)
    },
  };
}

/** The drawn road surface height (raw units) at x,z, or NaN when the point is not on the road or its shoulders (within `reach` metres of the centre line). */
export function cliffSurface(ix: TrackIndex, x: number, z: number, reach = TRACK_HALF + 5): number {
  const hit = ix.near(x, z, reach + 4);
  if (!hit) return NaN;
  const p = ix.design.pts[hit.i];
  if (Math.abs(hit.lat) > reach) return NaN;
  const lat = Math.max(-ix.design.half - 3, Math.min(ix.design.half + 3, hit.lat));
  const g = (ix.design.pts[(hit.i + 1) % ix.design.pts.length].y - ix.design.pts[(hit.i - 1 + ix.design.pts.length) % ix.design.pts.length].y) / (2 * ix.design.step);
  return p.y + g * hit.along + lat * Math.sin(p.bank);
}

// ---------- grading the ground ----------
const FLAT = 26;                // the terrain mesh has a vertex every 24 m: the bench must reach past the next vertex on each side or a slope vertex lifts the road under the ground
const COVER = 18;               // metres of mountain over the tunnel roof line at the centre of the tunnel
const PORTAL_RAMP = 80;         // metres from a portal over which the hillside rises from road level to full cover

/** Grades `heights` (raw map units, W x H, `mpp` metres per cell, centred on the origin) to the design. */
export function carveCliffRaceway(heights: Float32Array, W: number, H: number, mpp: number, design: TrackDesign): void {
  const pts = design.pts, n = pts.length;
  const ix = indexTrack(design);
  const R = 150;                                                              // widest reach of any cut or fill slope
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const p of pts) { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mnz = Math.min(mnz, p.z); mxz = Math.max(mxz, p.z); }
  const x0 = Math.max(0, Math.floor(((mnx - R) - GRID.ox) / mpp + W / 2)), x1 = Math.min(W - 1, Math.ceil(((mxx + R) - GRID.ox) / mpp + W / 2));
  const z0 = Math.max(0, Math.floor(((mnz - R) - GRID.oz) / mpp + H / 2)), z1 = Math.min(H - 1, Math.ceil(((mxz + R) - GRID.oz) / mpp + H / 2));
  // distance of each tunnel point from its nearest portal along the track, for the cover ramp
  const portalDist = (i: number): number => {
    if (!pts[i].tunnel) return -1;
    return Math.min(Math.abs(pts[i].s - pts[design.tunnelFrom].s), Math.abs(pts[design.tunnelTo].s - pts[i].s));
  };
  for (let iz = z0; iz <= z1; iz++) for (let iix = x0; iix <= x1; iix++) {
    const x = (((iix - W / 2) * mpp) + GRID.ox), z = (((iz - H / 2) * mpp) + GRID.oz);
    const hit = ix.near(x, z, R);
    if (!hit) continue;
    const p = pts[hit.i], k = iz * W + iix, h0 = heights[k], d = Math.abs(hit.lat);
    const g = (pts[(hit.i + 1) % n].y - pts[(hit.i - 1 + n) % n].y) / (2 * design.step);
    const yHere = p.y + g * hit.along;
    if (p.tunnel) {
      const pd = portalDist(hit.i), t = smoothstep(0, 1, pd / PORTAL_RAMP);
      const top = yHere + 8.5 + COVER * t;                                    // road + the portal / tunnel height + the mountain over it (rising away from the portal)
      if (pd < PORTAL_RAMP) {
        // the portal: the hillside is cut back to a rock face just over the opening, then rises over the tunnel
        const w = 1 - smoothstep(FLAT, FLAT + 22, d);
        heights[k] = h0 * (1 - w) + top * w;
      } else {
        const lw = 1 - smoothstep(24, 52, d);                                 // the mountain is a bump about 100 m wide
        heights[k] = h0 + Math.max(0, top - h0) * lw;
      }
      continue;
    }
    // bench: under the whole banked width, a little below the lowest edge, so the drawn road always lies above the ground
    const bench = yHere - Math.abs(Math.sin(p.bank)) * design.half - 0.35;
    if (d <= FLAT) { heights[k] = bench; continue; }
    const reach = FLAT + Math.min(R - FLAT, Math.max(8, Math.abs(bench - h0) * 2.6));       // slopes of about 1:2.6 back to the natural ground
    if (d >= reach) continue;
    const w = 1 - smoothstep(FLAT, reach, d);
    heights[k] = h0 * (1 - w) + bench * w;
  }
}
