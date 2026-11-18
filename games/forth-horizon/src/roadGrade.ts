// Road grading: every road gets a vertical profile the way a highway department would design it, and the ground is cut or built up to it before the terrain is meshed.
//
//   class      max grade   cut   fill   shoulder   blend
//   freeway        5 %      6 m   8 m      6 m      25 m
//   highway        6 %      6 m   6 m      5 m      22 m      (coastal highway, arterials, ramps)
//   street         8 %      3 m   3 m      2.5 m    12 m      (city and user streets, paved country roads)
//
// The profile is the higher of two slope-limited lines: the highest that never rises above the ground (cuts only) and the lowest that never drops more than the cut
// limit under it. Where the ground already meets the grade the road simply follows it. Roads are graded in priority order (freeways first); where a later road
// meets an earlier one it takes that road's bed as a fixed point and never digs into it, so intersections stay level with the road they join. Water is never
// filled (a road over water is a bridge span), and locked areas (the sunken freeway, the bridge approaches) are left as they are.
export interface GradeRoad { xz: number[][]; half: number; cls: 'freeway' | 'highway' | 'street' }
const RULES = {
  freeway: { g: 0.05, cut: 6, fill: 8, sh: 6, bl: 25 },
  highway: { g: 0.06, cut: 6, fill: 6, sh: 5, bl: 22 },
  street: { g: 0.08, cut: 3, fill: 3, sh: 2.5, bl: 12 },
};
const STEP = 6, WATER = 0.3;

export interface GradeStats { roads: number; cells: number; steepBefore: Record<string, number>; steepAfter: Record<string, number>; ms: number }

export function gradeRoads(heights: Float32Array, W: number, H: number, mpp: number, roads: GradeRoad[], locked: (x: number, z: number) => boolean): GradeStats {
  const t0 = performance.now();
  const lock = new Uint8Array(W * H);                                          // 1 = an earlier road's carriageway: fixed
  const bestD = new Float32Array(W * H), bestI = new Int32Array(W * H);          // per-road scratch: nearest sample distance (+1, 0 = untouched) and its index
  const order = { freeway: 0, highway: 1, street: 2 };
  const list = roads.filter((r) => r.xz.length > 1).sort((a, b) => order[a.cls] - order[b.cls]);
  const idx = (x: number, z: number): number => { const i = Math.min(W - 1, Math.max(0, Math.round(x / mpp + W / 2))), j = Math.min(H - 1, Math.max(0, Math.round(z / mpp + H / 2))); return j * W + i; };
  const sample = (x: number, z: number): number => {
    const fx = Math.min(W - 1.001, Math.max(0, x / mpp + W / 2)), fz = Math.min(H - 1.001, Math.max(0, z / mpp + H / 2)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return heights[j * W + i] * (1 - u) * (1 - v) + heights[j * W + i + 1] * u * (1 - v) + heights[(j + 1) * W + i] * (1 - u) * v + heights[(j + 1) * W + i + 1] * u * v;
  };
  const steepBefore: Record<string, number> = { freeway: 0, highway: 0, street: 0 }, steepAfter: Record<string, number> = { freeway: 0, highway: 0, street: 0 };
  let cells = 0, done = 0;
  for (const r of list) {
    const R = RULES[r.cls];
    // samples every 6 m
    const S: number[][] = [];
    for (let i = 0; i < r.xz.length - 1; i++) {
      const a = r.xz[i], b = r.xz[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / STEP));
      for (let k = 0; k < n; k++) S.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    S.push(r.xz[r.xz.length - 1]);
    const n = S.length; if (n < 3) continue;
    const skip = S.map((p) => locked(p[0], p[1]));
    const raw = S.map((p) => sample(p[0], p[1]));
    const hard = S.map((p) => lock[idx(p[0], p[1])] === 1);
    const wet = raw.map((h) => h < WATER);
    // over water the road is a span: the ground there does not count, the profile runs between the banks
    const g = raw.slice();
    for (let i = 0; i < n; i++) if (wet[i]) {
      let a = i; while (a >= 0 && wet[a]) a--; let b = i; while (b < n && wet[b]) b++;
      g[i] = a < 0 && b >= n ? WATER : a < 0 ? raw[b] : b >= n ? raw[a] : raw[a] + (raw[b] - raw[a]) * (i - a) / (b - a);
    }
    // 5-sample smoothing (30 m): the road ignores the map's small bumps; fixed points keep their height
    const gs = g.map((_, i) => { if (hard[i]) return g[i]; let s = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += g[j]; c++; } return s / c; });
    const s = R.g * STEP;
    const hi = gs.slice();
    for (let i = 1; i < n; i++) hi[i] = Math.min(hi[i], hi[i - 1] + s);
    for (let i = n - 2; i >= 0; i--) hi[i] = Math.min(hi[i], hi[i + 1] + s);
    const lo = gs.map((v, i) => (hard[i] ? v : v - R.cut));
    for (let i = 1; i < n; i++) lo[i] = Math.max(lo[i], lo[i - 1] - s);
    for (let i = n - 2; i >= 0; i--) lo[i] = Math.max(lo[i], lo[i + 1] - s);
    const y = hi.map((v, i) => (hard[i] ? gs[i] : Math.max(v, lo[i])));
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]) || 1;
      if (!wet[i] && !wet[i - 1] && Math.abs(raw[i] - raw[i - 1]) / d > R.g + 0.01) steepBefore[r.cls]++;
      if (Math.abs(y[i] - y[i - 1]) / d > R.g + 0.01) steepAfter[r.cls]++;
    }
    // carve: nearest sample decides the target (stamped around each sample, nearest wins); carriageway + shoulder take it fully, the blend band eases back
    const reach = r.half + R.sh + R.bl, rc = Math.ceil(reach / mpp), touched: number[] = [];
    for (let q = 0; q < n; q++) {
      if (skip[q] || wet[q]) continue;
      const ci = Math.round(S[q][0] / mpp + W / 2), cj = Math.round(S[q][1] / mpp + H / 2);
      for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(W - 1, ci + rc); i++) {
        const k = j * W + i; if (lock[k]) continue;
        const d = Math.hypot((i - W / 2) * mpp - S[q][0], (j - H / 2) * mpp - S[q][1]); if (d > reach) continue;
        if (bestD[k] === 0) { touched.push(k); bestD[k] = d + 1; bestI[k] = q; } else if (d + 1 < bestD[k]) { bestD[k] = d + 1; bestI[k] = q; }
      }
    }
    const mine: number[] = [];
    for (const k of touched) {
      const bd = bestD[k] - 1, bi = bestI[k]; bestD[k] = 0;
      const h = heights[k]; if (h < WATER) continue;                          // never fill water
      const tgt = y[bi] - 0.15;
      if (tgt - h > R.fill || h - tgt > R.cut + 2) continue;                  // beyond what the class may cut or fill: leave the ground (a structure would be needed)
      const dOut = bd - (r.half + R.sh), w = dOut <= 0 ? 1 : 1 - (dOut / R.bl) ** 2 * (3 - 2 * dOut / R.bl);
      heights[k] = h + (tgt - h) * w; cells++;
      if (bd <= r.half) mine.push(k);
    }
    for (const k of mine) lock[k] = 1;
    done++;
  }
  return { roads: done, cells, steepBefore, steepAfter, ms: Math.round(performance.now() - t0) };
}

/** a quick corridor test: points with a radius, hashed on a 40 m grid */
export function corridor(lines: { xz: number[][]; r: number }[]): (x: number, z: number) => boolean {
  const C = 40, h = new Map<number, number[]>();
  for (const l of lines) for (let i = 0; i < l.xz.length - 1; i++) {
    const a = l.xz[i], b = l.xz[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 10));
    for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, key = Math.floor(x / C) * 8192 + Math.floor(z / C); let arr = h.get(key); if (!arr) { arr = []; h.set(key, arr); } arr.push(x, z, l.r); }
  }
  return (x, z) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = h.get((cx + a) * 8192 + cz + b); if (!arr) continue; for (let k = 0; k < arr.length; k += 3) { const dx = arr[k] - x, dz = arr[k + 1] - z; if (dx * dx + dz * dz < arr[k + 2] * arr[k + 2]) return true; } }
    return false;
  };
}
