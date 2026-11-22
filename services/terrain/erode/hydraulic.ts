// Plajah Terrain — hydraulic (droplet) erosion (docs/plajah-terrain.md, phase 3). CPU reference.
//
// Classic particle erosion: rain drops land at random, roll downhill with a little inertia, pick up sediment where they
// speed up and their capacity exceeds what they carry, drop it where they slow down or fill a pit, and evaporate.
// Heights are worked in scaled cell units (metres × heightScale / cell) so the parameters mean the same at any resolution. Each cell's
// change is scaled by (1 − protect), so authored places stay as built. Deterministic for a given seed.

export interface HydraulicOptions {
  /** Number of drops (≈ 0.3–1 per cell for a strong pass). */
  droplets: number;
  seed?: number;
  /** 0 = always straight downhill, 1 = never turns. */
  inertia?: number;
  /** Sediment capacity factor. */
  capacity?: number;
  minCapacity?: number;
  /** Share of excess sediment deposited per step. */
  deposit?: number;
  /** Share of free capacity eroded per step. */
  erode?: number;
  evaporate?: number;
  gravity?: number;
  maxSteps?: number;
  /** Erosion brush radius in cells. */
  radius?: number;
  /** Height units: metres × heightScale / cell. Classic droplet parameters assume gentle unit slopes (a 45° face ≈ 0.02
   *  per step), so the default 0.02 keeps them stable on mountains. */
  heightScale?: number;
  /** 0…1 per cell: 1 = untouched. */
  protect?: Float32Array;
}

export interface HydraulicResult {
  /** Water that passed through each cell (drop-steps weighted by water). */
  flow: Float32Array;
}

/** Erode `h` (n × n, metres, cell size `cell`) in place. */
export function hydraulicErosion(h: Float32Array, n: number, cell: number, o: HydraulicOptions): HydraulicResult {
  const inertia = o.inertia ?? 0.05, capF = o.capacity ?? 4, minCap = o.minCapacity ?? 0.01, depF = o.deposit ?? 0.3, eroF = o.erode ?? 0.3;
  const evap = o.evaporate ?? 0.02, grav = o.gravity ?? 4, maxSteps = o.maxSteps ?? 64, R = Math.max(1, Math.round(o.radius ?? 3));
  const protect = o.protect, flow = new Float32Array(n * n);
  // work in scaled cell units (see heightScale)
  const k = (o.heightScale ?? 0.02) / cell;
  const orig = Float32Array.from(h);
  for (let i = 0; i < h.length; i++) h[i] *= k;

  // erosion brush: weights over a disc, normalised
  const bx: number[] = [], bz: number[] = [], bw: number[] = [];
  let wsum = 0;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    const w = 1 - d / R; bx.push(dx); bz.push(dz); bw.push(w); wsum += w;
  }
  for (let i = 0; i < bw.length; i++) bw[i] /= wsum;

  let s = (o.seed ?? 1) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const keep = (idx: number) => (protect ? 1 - protect[idx] : 1);

  for (let drop = 0; drop < o.droplets; drop++) {
    let x = rnd() * (n - 2), z = rnd() * (n - 2), dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let step = 0; step < maxSteps; step++) {
      const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, idx = xi + zi * n;
      // height and gradient here (bilinear)
      const a = h[idx], b = h[idx + 1], c = h[idx + n], d = h[idx + n + 1];
      const h0 = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      const gx = (b - a) * (1 - v) + (d - c) * v, gz = (c - a) * (1 - u) + (d - b) * u;
      dx = dx * inertia - gx * (1 - inertia);
      dz = dz * inertia - gz * (1 - inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) break;
      dx /= len; dz /= len;
      x += dx; z += dz;
      flow[idx] += water;
      if (x < 1 || z < 1 || x >= n - 2 || z >= n - 2) break;
      // height at the new position
      const xj = Math.floor(x), zj = Math.floor(z), u2 = x - xj, v2 = z - zj, j0 = xj + zj * n;
      const dh = h[j0] * (1 - u2) * (1 - v2) + h[j0 + 1] * u2 * (1 - v2) + h[j0 + n] * (1 - u2) * v2 + h[j0 + n + 1] * u2 * v2 - h0;
      const cap = Math.max(-dh * speed * water * capF, minCap);
      if (sed > cap || dh > 0) {
        // deposit: fill the pit (up to dh) when going uphill, else a share of the excess, spread bilinearly
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depF;
        sed -= amt;
        h[idx] += amt * (1 - u) * (1 - v) * keep(idx);
        h[idx + 1] += amt * u * (1 - v) * keep(idx + 1);
        h[idx + n] += amt * (1 - u) * v * keep(idx + n);
        h[idx + n + 1] += amt * u * v * keep(idx + n + 1);
      } else {
        // erode over the brush, never more than the drop's fall
        const amt = Math.min((cap - sed) * eroF, -dh);
        for (let q = 0; q < bw.length; q++) {
          const cx = xi + bx[q], cz = zi + bz[q];
          if (cx < 0 || cz < 0 || cx >= n || cz >= n) continue;
          const j = cx + cz * n, take = amt * bw[q] * keep(j);
          h[j] -= take; sed += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * grav));
      water *= 1 - evap;
      if (water < 0.01) break;
    }
  }
  // back to metres as orig + change, so cells nothing touched come back bit-exact
  for (let i = 0; i < h.length; i++) { const z0 = Math.fround(orig[i] * k); h[i] = h[i] === z0 ? orig[i] : orig[i] + (h[i] - z0) / k; }
  return { flow };
}
