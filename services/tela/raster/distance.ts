// raster/distance — exact Euclidean distance transform (Felzenszwalb & Huttenlocher 2012).
// O(N) per row/column; used by layer-style strokes, selection expand/contract/border and
// the healing brush's boundary weights.

const INF = 1e20;
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** Distance (px) from every pixel to the nearest pixel where `inside(i)` is true. */
export function distanceTransform(W: number, H: number, inside: (i: number) => boolean): Float32Array {
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const grid = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) grid[i] = inside(i) ? 0 : INF;
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = grid[y * W + x]; edt1d(f, H, d, v, z); for (let y = 0; y < H; y++) grid[y * W + x] = d[y]; }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = grid[y * W + x]; edt1d(f, W, d, v, z); for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]); }
  return out;
}
/** Signed distance to the 0.5 iso-contour of a coverage map: > 0 outside, < 0 inside. */
export function signedDistance(W: number, H: number, coverage: (i: number) => number): Float32Array {
  const out = distanceTransform(W, H, i => coverage(i) >= 0.5), inn = distanceTransform(W, H, i => coverage(i) < 0.5);
  const sd = new Float32Array(W * H);
  for (let i = 0; i < sd.length; i++) sd[i] = out[i] > 0 ? out[i] - 0.5 : -(inn[i] - 0.5);
  return sd;
}
