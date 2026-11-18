import { type P2, Grid, distToPoly } from './geom';
import type { AirportLayout } from './airport';
import type { RailProfile } from './railProfile';
import { GRID } from '../grid';

/**
 * Cut and fill: grade the height map (metres, 1 sample per `mpp`) for railway beds and the airfield before the terrain is meshed,
 * the way carveShoreline does for the shoreline highway. The terrain mesh has a vertex every 24 m, so flat beds must be wider than that.
 */
const smooth = (t: number): number => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export interface RailCarve { profile: RailProfile; double: boolean }

/** bed half-width: 14 m single, 17 m double; the slope out to natural ground takes another 38 m */
export const railFlat = (double: boolean): number => (double ? 17 : 14);
const RAIL_REACH = 38;

export function carveRail(heights: Float32Array, W: number, H: number, mpp: number, lines: RailCarve[]): number {
  const pts = new Grid<{ x: number; z: number; y: number; flat: number }>(24);
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, n = 0;
  for (const l of lines) {
    const P = l.profile, flat = railFlat(l.double);
    for (let i = 0; i < P.pts.length; i++) {
      // only where the track is on the ground (a bridge or tunnel leaves the terrain alone; cuttings up to 7 m and banks up to 8 m are graded); interpolate between samples so there are no gaps
      if (P.mode[i] !== 'ground') continue;
      const j = Math.min(P.pts.length - 1, i + 1);
      for (let k = 0; k < (P.mode[j] === 'ground' && j > i ? 3 : 1); k++) {
        const t = k / 3, x = P.pts[i][0] + (P.pts[j][0] - P.pts[i][0]) * t, z = P.pts[i][1] + (P.pts[j][1] - P.pts[i][1]) * t, y = P.y[i] + (P.y[j] - P.y[i]) * t;
        pts.add(x, z, { x, z, y, flat }); n++;
        mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z);
      }
    }
  }
  if (!n) return 0;
  const R = 17 + RAIL_REACH, x0 = Math.max(0, Math.floor(((mnx - R) - GRID.ox) / mpp + W / 2)), x1 = Math.min(W - 1, Math.ceil(((mxx + R) - GRID.ox) / mpp + W / 2));
  const z0 = Math.max(0, Math.floor(((mnz - R) - GRID.oz) / mpp + H / 2)), z1 = Math.min(H - 1, Math.ceil(((mxz + R) - GRID.oz) / mpp + H / 2));
  let touched = 0;
  // process cell by cell, but only those near a line
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    const x = (((ix - W / 2) * mpp) + GRID.ox), z = (((iz - H / 2) * mpp) + GRID.oz);
    let best = 1e9, by = 0, bflat = 0;
    pts.query(x - R, z - R, x + R, z + R, (p) => { const d = Math.hypot(p.x - x, p.z - z); if (d < best) { best = d; by = p.y; bflat = p.flat; } });
    if (best > bflat + RAIL_REACH) continue;
    const w = 1 - smooth((best - bflat) / RAIL_REACH), k = iz * W + ix;
    if (heights[k] < 2.6) continue;                                           // never fill the river: a rail crossing water is a bridge or a tunnel, not a bank across it
    heights[k] = heights[k] * (1 - w) + (by - 0.25) * w; touched++;
  }
  return touched;
}

/** shapes that make up the airfield, with how far past each the ground is levelled */
function footprint(L: AirportLayout): ((x: number, z: number) => number)[] {
  const sh: ((x: number, z: number) => number)[] = [];
  const hw = 140, ext = 260;
  sh.push((x, z) => { const u = (x - L.a[0]) * L.ux + (z - L.a[1]) * L.uz, v = (x - L.a[0]) * L.vx + (z - L.a[1]) * L.vz; return Math.hypot(Math.max(0, -ext - u, u - (L.len + ext)), Math.max(0, Math.abs(v) - hw)); });
  for (const t of L.taxiways) sh.push((x, z) => { let d = 1e9; for (let i = 0; i < t.length - 1; i++) { const a = t[i], b = t[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); d = Math.min(d, Math.hypot(a[0] + dx * k - x, a[1] + dz * k - z)); } return Math.max(0, d - 45); });
  if (L.apron.length >= 3) sh.push((x, z) => distToPoly(L.apron, x, z));
  if (L.terminal.length >= 3) sh.push((x, z) => Math.max(0, distToPoly(L.terminal, x, z) - 70));
  for (const h of L.hangars) if (h.length >= 3) sh.push((x, z) => Math.max(0, distToPoly(h, x, z) - 50));
  return sh;
}

/** level the airfield; returns the field elevation (metres) and sets it on the layout */
export function carveAirport(heights: Float32Array, W: number, H: number, mpp: number, L: AirportLayout, reach = 150): number {
  const sh = footprint(L);
  const allPts: P2[] = [L.a, L.b, ...L.taxiways.flat(), ...L.apron, ...L.terminal, ...L.hangars.flat()];
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
  for (const p of allPts) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[1]); mxz = Math.max(mxz, p[1]); }
  const pad = reach + 300;
  const x0 = Math.max(0, Math.floor(((mnx - pad) - GRID.ox) / mpp + W / 2)), x1 = Math.min(W - 1, Math.ceil(((mxx + pad) - GRID.ox) / mpp + W / 2));
  const z0 = Math.max(0, Math.floor(((mnz - pad) - GRID.oz) / mpp + H / 2)), z1 = Math.min(H - 1, Math.ceil(((mxz + pad) - GRID.oz) / mpp + H / 2));
  const dist = (x: number, z: number): number => { let d = 1e9; for (const f of sh) d = Math.min(d, f(x, z)); return d; };
  // the level: the average of the ground under the footprint itself
  let sum = 0, cnt = 0;
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    const x = (((ix - W / 2) * mpp) + GRID.ox), z = (((iz - H / 2) * mpp) + GRID.oz);
    if (dist(x, z) <= 0) { sum += heights[iz * W + ix]; cnt++; }
  }
  const level = cnt ? sum / cnt : 0;
  for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
    const x = (((ix - W / 2) * mpp) + GRID.ox), z = (((iz - H / 2) * mpp) + GRID.oz), d = dist(x, z);
    if (d > reach) continue;
    const w = 1 - smooth(d / reach), k = iz * W + ix;
    heights[k] = heights[k] * (1 - w) + (level - 0.3) * w;
  }
  L.elevation = level;
  return level;
}
