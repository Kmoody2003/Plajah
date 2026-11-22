// Plajah Terrain — derived maps (docs/plajah-terrain.md, phase 3): what the land tells materials and the EcoSystem.
//
// slope (rise per run), flow accumulation (upslope area draining through each cell, D8), wetness (topographic wetness
// index ln(a / tan β), normalised 0…1), and helpers to quantise maps for shipping.

/** tan of the slope at each cell (central differences). */
export function slopeMap(h: Float32Array, n: number, cell: number) {
  const out = new Float32Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const xl = Math.max(0, x - 1), xr = Math.min(n - 1, x + 1), zl = Math.max(0, z - 1), zr = Math.min(n - 1, z + 1);
    const gx = (h[xr + z * n] - h[xl + z * n]) / ((xr - xl) * cell), gz = (h[x + zr * n] - h[x + zl * n]) / ((zr - zl) * cell);
    out[x + z * n] = Math.hypot(gx, gz);
  }
  return out;
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** D8 flow accumulation: each cell passes its area (in cells, itself included) to its steepest lower neighbour. */
export function flowAccumulation(h: Float32Array, n: number) {
  const N = n * n, order = new Uint32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  order.sort((a, b) => h[b] - h[a]);
  const acc = new Float32Array(N).fill(1);
  const dist = NB.map(([dx, dz]) => Math.hypot(dx, dz));
  for (let k = 0; k < N; k++) {
    const i = order[k], x = i % n, z = (i - x) / n, hi = h[i];
    let best = -1, drop = 0;
    for (let q = 0; q < 8; q++) {
      const nx = x + NB[q][0], nz = z + NB[q][1];
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const s = (hi - h[nx + nz * n]) / dist[q];
      if (s > drop) { drop = s; best = nx + nz * n; }
    }
    if (best >= 0) acc[best] += acc[i];
  }
  return acc;
}

/** Topographic wetness ln(a / (tan β + ε)), normalised 0…1 between its 2nd and 98th percentiles. */
export function wetnessMap(acc: Float32Array, slope: Float32Array, cell: number) {
  const N = acc.length, w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = Math.log((acc[i] * cell) / (slope[i] + 0.02));
  const sorted = Float32Array.from(w).sort();
  const lo = sorted[Math.floor(N * 0.02)], hi = sorted[Math.floor(N * 0.98)];
  for (let i = 0; i < N; i++) w[i] = Math.min(1, Math.max(0, (w[i] - lo) / (hi - lo || 1)));
  return w;
}

/** log-scaled 0…1 for flow-like maps (1 = the biggest river on the map). */
export function logNormalise(m: Float32Array) {
  let hi = 0;
  for (const v of m) hi = Math.max(hi, v);
  const k = 1 / Math.log1p(hi || 1), out = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = Math.log1p(Math.max(0, m[i])) * k;
  return out;
}

/** Average-pool an n × n map by an integer factor (edges included): (n − 1) / f + 1 per side. */
export function downsample(m: Float32Array, n: number, f: number) {
  const m2 = Math.floor((n - 1) / f) + 1, out = new Float32Array(m2 * m2);
  for (let z = 0; z < m2; z++) for (let x = 0; x < m2; x++) {
    let s = 0, c = 0;
    for (let dz = -(f >> 1); dz <= f >> 1; dz++) for (let dx = -(f >> 1); dx <= f >> 1; dx++) {
      const X = x * f + dx, Z = z * f + dz;
      if (X < 0 || Z < 0 || X >= n || Z >= n) continue;
      s += m[X + Z * n]; c++;
    }
    out[x + z * m2] = s / c;
  }
  return out;
}
