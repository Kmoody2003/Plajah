// Plajah Terrain — thermal erosion (talus slip). CPU reference.
//
// Where a cell stands above a neighbour by more than the angle of repose allows, part of the excess slides down to the
// lower neighbours (shared by how much each is over the limit). Builds scree aprons under cliffs and rounds sharp crests.
// Each iteration reads the old heights and writes the changes afterwards (order-independent). Scaled by (1 − protect).

export interface ThermalOptions {
  iterations?: number;
  /** Angle of repose in degrees (loose rock ~ 33–38°). */
  talus?: number;
  /** Share of the excess moved per iteration (0…0.5). */
  rate?: number;
  protect?: Float32Array;
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function thermalErosion(h: Float32Array, n: number, cell: number, o: ThermalOptions = {}) {
  const iters = o.iterations ?? 20, tan = Math.tan(((o.talus ?? 36) * Math.PI) / 180), rate = o.rate ?? 0.25, protect = o.protect;
  const lim = NB.map(([dx, dz]) => tan * cell * Math.hypot(dx, dz));
  const off = NB.map(([dx, dz]) => dx + dz * n);
  const d = new Float32Array(n * n);
  for (let it = 0; it < iters; it++) {
    d.fill(0);
    for (let z = 1; z < n - 1; z++) for (let x = 1; x < n - 1; x++) {
      const i = x + z * n, hi = h[i];
      let total = 0, maxEx = 0;
      for (let k = 0; k < 8; k++) { const ex = hi - h[i + off[k]] - lim[k]; if (ex > 0) { total += ex; if (ex > maxEx) maxEx = ex; } }
      if (total <= 0) continue;
      const keep = protect ? 1 - protect[i] : 1;
      if (keep <= 0) continue;
      const move = maxEx * rate * keep;
      d[i] -= move;
      for (let k = 0; k < 8; k++) { const ex = hi - h[i + off[k]] - lim[k]; if (ex > 0) d[i + off[k]] += move * (ex / total); }
    }
    for (let i = 0; i < h.length; i++) h[i] += d[i];
  }
}
