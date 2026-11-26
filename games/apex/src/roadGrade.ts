import { GRID } from './grid';
// Road grading & Civil Engineering Geometry Sanitizer:
// Every road gets a vertical profile the way a highway department would design it, and the ground
// is cut or built up to it before the terrain is meshed.
//
//   class      max grade   cut   fill   shoulder   blend
//   freeway        5 %      8 m   9 m      6 m      28 m
//   highway        6 %      8 m   8 m      5 m      24 m      (coastal highway, arterials, ramps)
//   street       8.5 %      9 m   9 m      3.0 m    18 m      (city and town streets)
//   rural         10 %     10 m  10 m      3.5 m    20 m      (paved country roads)
//   lane          12 %    3.5 m 3.5 m      1.5 m    10 m      (dirt roads, farm lanes, trails)
//   drive         12 %    2.0 m 2.0 m      0.5 m     5 m      (driveways: they meet the street they join)
//
// Also includes:
//   - sanitizeRoadPolyline(): eliminates folded <52° acute hairpin spikes & underwater cliff-plunge stubs
//     that otherwise create twisted ribbons and bogus floating bridges visible in aerial shots.
//   - softenTrackBermApron(): widens steep circuit embankments (e.g. Ironport Grand Circuit's 42 m downtown
//     hillclimb berm) into a smooth civil-engineered <=10.5% urban hillside apron so perpendicular downtown
//     avenues never climb impossible 40-55% cliff faces or lean at 50% sideways cross-slopes.
export type GradeClass = 'freeway' | 'highway' | 'street' | 'rural' | 'lane' | 'drive';
export interface GradeRoad { xz: number[][]; half: number; cls: GradeClass }

const RULES = {
  freeway: { g: 0.05, cut: 8, fill: 9, sh: 6, bl: 28 },
  highway: { g: 0.06, cut: 8, fill: 8, sh: 5, bl: 24 },
  street: { g: 0.085, cut: 9, fill: 9, sh: 3.0, bl: 18 },
  rural: { g: 0.10, cut: 10, fill: 10, sh: 3.5, bl: 20 },
  lane: { g: 0.12, cut: 3.5, fill: 3.5, sh: 1.5, bl: 10 },
  drive: { g: 0.12, cut: 2.0, fill: 2.0, sh: 0.5, bl: 5 },
};
const STEP = 6, WATER = 0.3;
/** side slope run per metre of height (the smoothstep's steepest pitch is 1.5x the mean): fill ~1:2, cut ~1:1.2 */
const FILL_RUN = 3.2, CUT_RUN = 1.8;

export interface SanitizeStats {
  roadsIn: number;
  roadsOut: number;
  acuteSpikesRemoved: number;
  waterStubsClipped: number;
  underwaterDropped: number;
}

/**
 * Civil-engineering polyline sanitizer:
 * 1. Deduplicates near-coincident vertices (< 0.75 m) that blow up spline tangents.
 * 2. Removes backtracking acute hairpin fold spikes (< 52 deg turn angle) and gently chamfers
 *    sharp elbows so 3D road ribbons & curbs never fold back over themselves in aerial views.
 * 3. Drops wholly underwater stubs and trims dead-end segments that plunge off dry cliffs (> 8 m)
 *    straight into lake water (< 0.6 m).
 */
export function sanitizeRoadPolyline(
  rawPts: number[][],
  hAt: (x: number, z: number) => number,
  stats?: SanitizeStats,
): number[][] {
  if (!rawPts || rawPts.length < 2) return [];

  // 1. Deduplicate near-identical consecutive vertices
  let pts: number[][] = [rawPts[0].slice(0, 2)];
  for (let i = 1; i < rawPts.length; i++) {
    const p = rawPts[i];
    const prev = pts[pts.length - 1];
    if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= 0.75) {
      pts.push([p[0], p[1]]);
    }
  }
  if (pts.length < 2) return [];

  // 2. Drop wholly underwater garbage stubs (all vertices below 0.6 m waterline)
  const hs0 = pts.map((p) => hAt(p[0], p[1]));
  if (hs0.every((h) => h < 0.6)) {
    if (stats) stats.underwaterDropped++;
    return [];
  }

  // 3. Trim dead-end cliff-to-water plunges at start or end of polyline
  const trimWaterEnd = (arr: number[][], atStart: boolean): number[][] => {
    if (arr.length < 2) return arr;
    const iEnd = atStart ? 0 : arr.length - 1;
    const iAdj = atStart ? 1 : arr.length - 2;
    const hEnd = hAt(arr[iEnd][0], arr[iEnd][1]);
    const hAdj = hAt(arr[iAdj][0], arr[iAdj][1]);
    if (hEnd < 0.6 && hAdj >= 6.0) {
      // Walk from dry vertex toward water and stop cleanly on dry bluff rim (h >= 2.2 m)
      const a = arr[iAdj], b = arr[iEnd];
      let bestT = 0;
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        if (hAt(x, z) >= 2.4) bestT = t;
        else break;
      }
      if (stats) stats.waterStubsClipped++;
      if (bestT < 0.08 && arr.length === 2) return [];
      const clipped = [a[0] + (b[0] - a[0]) * bestT, a[1] + (b[1] - a[1]) * bestT];
      const next = arr.slice();
      next[iEnd] = clipped;
      return next;
    }
    return arr;
  };
  pts = trimWaterEnd(pts, false);
  pts = trimWaterEnd(pts, true);
  if (pts.length < 2) return [];

  // 4. Iteratively eliminate acute backtracking fold-back spikes (< 54 deg)
  for (let pass = 0; pass < 4 && pts.length >= 3; pass++) {
    const clean: number[][] = [pts[0]];
    let removed = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = clean[clean.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const ux = a[0] - b[0], uz = a[1] - b[1];
      const vx = c[0] - b[0], vz = c[1] - b[1];
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
      if (lu < 0.5 || lv < 0.5) { removed++; continue; }
      const cos = Math.max(-1, Math.min(1, (ux * vx + uz * vz) / (lu * lv)));
      // Interior angle < 54 deg (cos > 0.588) = self-reversing fold spike!
      if (cos > 0.588) {
        removed++;
        if (stats) stats.acuteSpikesRemoved++;
        // If both legs are very long (> 60 m), insert a civil-engineered chamfer bridge instead of snapping straight across a block
        if (lu > 60 && lv > 60) {
          const cut = Math.min(18, lu * 0.2, lv * 0.2);
          clean.push([b[0] + (ux / lu) * cut, b[1] + (uz / lu) * cut]);
          clean.push([b[0] + (vx / lv) * cut, b[1] + (vz / lv) * cut]);
        }
        continue;
      }
      clean.push(b);
    }
    clean.push(pts[pts.length - 1]);
    pts = clean;
    if (removed === 0) break;
  }

  // Final pass: if any two consecutive points collapsed below 0.5 m, prune them
  const finalPts: number[][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = finalPts[finalPts.length - 1];
    if (Math.hypot(pts[i][0] - prev[0], pts[i][1] - prev[1]) >= 0.5) finalPts.push(pts[i]);
  }
  return finalPts.length >= 2 ? finalPts : [];
}

/**
 * Civil-engineered berm apron softening:
 * Around elevated street-circuit hillclimbs (like Ironport Grand Circuit's 42 m downtown hill),
 * widens razor-sharp 50-60% embankment cliffs into a graceful <= 10% urban hillside apron outside
 * the track carriageway (d > 14 m). Preserves the circuit carriageway verbatim while eliminating
 * impossible 40-55% perpendicular cross-street grades and 50% sideways cross-slopes!
 */
export function softenTrackBermApron(
  heights: Float32Array,
  W: number,
  H: number,
  mpp: number,
  trackXz: number[][],
  locked?: (x: number, z: number) => boolean,
): { cellsRaised: number; maxRaise: number } {
  if (!trackXz || trackXz.length < 4) return { cellsRaised: 0, maxRaise: 0 };

  const sample = (x: number, z: number): number => {
    const fx = Math.min(W - 1.001, Math.max(0, (x - GRID.ox) / mpp + W / 2));
    const fz = Math.min(H - 1.001, Math.max(0, (z - GRID.oz) / mpp + H / 2));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (
      heights[j * W + i] * (1 - u) * (1 - v) +
      heights[j * W + i + 1] * u * (1 - v) +
      heights[(j + 1) * W + i] * (1 - u) * v +
      heights[(j + 1) * W + i + 1] * u * v
    );
  };

  // Densify elevated portions of the circuit every 8 m
  const pts: { x: number; z: number; y: number }[] = [];
  for (let i = 0; i < trackXz.length; i++) {
    const a = trackXz[i], b = trackXz[(i + 1) % trackXz.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(L / 8));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const y = sample(x, z);
      if (y > 16.5) pts.push({ x, z, y });
    }
  }
  if (!pts.length) return { cellsRaised: 0, maxRaise: 0 };

  const REACH = 270;
  const SHOULDER = 14;
  const MAX_SLOPE = 0.095; // 9.5% civil-engineered urban hillside apron
  const CELL = 48;
  const hash = new Map<number, number[]>();
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  pts.forEach((p, idx) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    const k = Math.floor(p.x / CELL) * 8192 + Math.floor(p.z / CELL);
    let arr = hash.get(k);
    if (!arr) { arr = []; hash.set(k, arr); }
    arr.push(idx);
  });

  const i0 = Math.max(0, Math.floor((minX - REACH - GRID.ox) / mpp + W / 2));
  const i1 = Math.min(W - 1, Math.ceil((maxX + REACH - GRID.ox) / mpp + W / 2));
  const j0 = Math.max(0, Math.floor((minZ - REACH - GRID.oz) / mpp + H / 2));
  const j1 = Math.min(H - 1, Math.ceil((maxZ + REACH - GRID.oz) / mpp + H / 2));
  const rCells = Math.ceil(REACH / CELL);

  let cellsRaised = 0;
  let maxRaise = 0;
  const orig = heights.slice();

  for (let j = j0; j <= j1; j++) {
    const wz = (j - H / 2) * mpp + GRID.oz;
    const cz = Math.floor(wz / CELL);
    for (let i = i0; i <= i1; i++) {
      const k = j * W + i;
      const h = orig[k];
      if (h < 2.2) continue; // never raise river/lake water or shoreline banks
      const wx = (i - W / 2) * mpp + GRID.ox;
      if (locked?.(wx, wz)) continue;

      const cx = Math.floor(wx / CELL);
      let bestFloor = -1e9;
      let minDist = 1e9;
      for (let a = -rCells; a <= rCells; a++) {
        for (let b = -rCells; b <= rCells; b++) {
          const list = hash.get((cx + a) * 8192 + (cz + b));
          if (!list) continue;
          for (const pi of list) {
            const p = pts[pi];
            const d = Math.hypot(wx - p.x, wz - p.z);
            if (d < minDist) minDist = d;
            if (d > REACH) continue;
            const dOut = Math.max(0, d - SHOULDER);
            // Smooth parabolic crest transition over the first 24 m from the shoulder, then linear 9.5% grade
            const drop = dOut < 24 ? (dOut * dOut) / (2 * 24) * MAX_SLOPE : (12 + (dOut - 24)) * MAX_SLOPE;
            const fl = p.y - 0.15 - drop;
            if (fl > bestFloor) bestFloor = fl;
          }
        }
      }
      if (minDist <= SHOULDER || bestFloor <= h + 0.05) continue;
      // Soft feather near outer reach so there is zero step edge where apron meets flat downtown
      const edgeT = Math.min(1, Math.max(0, (REACH - minDist) / 55));
      const feather = edgeT * edgeT * (3 - 2 * edgeT);
      const nextH = h + (bestFloor - h) * feather;
      if (nextH > h + 0.02) {
        heights[k] = nextH;
        cellsRaised++;
        if (nextH - h > maxRaise) maxRaise = nextH - h;
      }
    }
  }

  // Light 1-pass Laplacian polish over the raised apron cells to eliminate any ridge crease
  if (cellsRaised > 0) {
    const tmp = heights.slice();
    for (let j = Math.max(1, j0); j <= Math.min(H - 2, j1); j++) {
      for (let i = Math.max(1, i0); i <= Math.min(W - 2, i1); i++) {
        const k = j * W + i;
        if (tmp[k] <= orig[k] + 0.05) continue;
        const avg = (tmp[k - 1] + tmp[k + 1] + tmp[k - W] + tmp[k + W]) * 0.25;
        heights[k] = tmp[k] * 0.65 + avg * 0.35;
      }
    }
  }

  return { cellsRaised, maxRaise: Number(maxRaise.toFixed(2)) };
}

export interface GradeStats {
  roads: number;
  cells: number;
  steepBefore: Record<string, number>;
  steepAfter: Record<string, number>;
  ms: number;
}

export function gradeRoads(
  heights: Float32Array,
  W: number,
  H: number,
  mpp: number,
  roads: GradeRoad[],
  locked: (x: number, z: number) => boolean,
  preLock?: Uint8Array,
): GradeStats {
  const t0 = performance.now();
  const lock = preLock ? preLock.slice() : new Uint8Array(W * H);              // 1 = fixed: an earlier road's carriageway, or (preLock) a scenic road's flat band
  const bestD = new Float32Array(W * H), bestI = new Int32Array(W * H);
  const lockedCell = new Uint8Array(W * H);                                      // 0 unknown, 1 free, 2 locked (cached corridor test)
  const order: Record<GradeClass, number> = { freeway: 0, highway: 1, street: 2, rural: 3, lane: 4, drive: 5 };
  const list = roads.filter((r) => r.xz.length > 1).sort((a, b) => order[a.cls] - order[b.cls]);
  const idx = (x: number, z: number): number => {
    const i = Math.min(W - 1, Math.max(0, Math.round((x - GRID.ox) / mpp + W / 2)));
    const j = Math.min(H - 1, Math.max(0, Math.round((z - GRID.oz) / mpp + H / 2)));
    return j * W + i;
  };
  const sample = (x: number, z: number): number => {
    const fx = Math.min(W - 1.001, Math.max(0, (x - GRID.ox) / mpp + W / 2));
    const fz = Math.min(H - 1.001, Math.max(0, (z - GRID.oz) / mpp + H / 2));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (
      heights[j * W + i] * (1 - u) * (1 - v) +
      heights[j * W + i + 1] * u * (1 - v) +
      heights[(j + 1) * W + i] * (1 - u) * v +
      heights[(j + 1) * W + i + 1] * u * v
    );
  };
  const steepBefore: Record<string, number> = {}, steepAfter: Record<string, number> = {};
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
    const gs = g.map((_, i) => {
      if (hard[i]) return g[i];
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += g[j]; c++; }
      return s / c;
    });
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
      if (!wet[i] && !wet[i - 1] && Math.abs(raw[i] - raw[i - 1]) / d > R.g + 0.01) steepBefore[r.cls] = (steepBefore[r.cls] ?? 0) + 1;
      if (Math.abs(y[i] - y[i - 1]) / d > R.g + 0.01) steepAfter[r.cls] = (steepAfter[r.cls] ?? 0) + 1;
    }
    // carve: nearest sample decides the target (stamped around each sample, nearest wins); carriageway + shoulder take it fully, the blend band eases back
    const reach = r.half + R.sh + Math.max(R.bl, R.fill * FILL_RUN), rc = Math.ceil(reach / mpp), touched: number[] = [];
    for (let q = 0; q < n; q++) {
      if (skip[q] || wet[q]) continue;
      const ci = Math.round((S[q][0] - GRID.ox) / mpp + W / 2), cj = Math.round((S[q][1] - GRID.oz) / mpp + H / 2);
      for (let j = Math.max(0, cj - rc); j <= Math.min(H - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(W - 1, ci + rc); i++) {
        const k = j * W + i; if (lock[k]) continue;
        const wx = ((i - W / 2) * mpp) + GRID.ox, wz = ((j - H / 2) * mpp) + GRID.oz;
        const d = Math.hypot(wx - S[q][0], wz - S[q][1]); if (d > reach) continue;
        if (lockedCell[k] === 0) lockedCell[k] = locked(wx, wz) ? 2 : 1;
        if (lockedCell[k] === 2) continue;
        if (bestD[k] === 0) { touched.push(k); bestD[k] = d + 1; bestI[k] = q; } else if (d + 1 < bestD[k]) { bestD[k] = d + 1; bestI[k] = q; }
      }
    }
    const mine: number[] = [];
    for (const k of touched) {
      const bd = bestD[k] - 1, bi = bestI[k]; bestD[k] = 0;
      const h = heights[k]; if (h < WATER) continue;                          // never fill water
      const tgt = Math.min(h + R.fill, Math.max(h - R.cut, y[bi] - 0.15));      // at most the class's cut or fill: grade as far as allowed
      // the side slope widens with its height: embankments ~1:2 at their steepest, cuts ~1:1.2
      const bl = Math.max(R.bl, Math.abs(tgt - h) * (tgt > h ? FILL_RUN : CUT_RUN));
      const dOut = bd - (r.half + R.sh), w = dOut <= 0 ? 1 : dOut >= bl ? 0 : 1 - (dOut / bl) ** 2 * (3 - 2 * dOut / bl);
      heights[k] = h + (tgt - h) * w; cells++;
      if (bd <= Math.max(r.half + R.sh, mpp * 0.75)) mine.push(k);           // the carriageway and shoulders are fixed for every road graded after
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
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      const key = Math.floor(x / C) * 8192 + Math.floor(z / C);
      let arr = h.get(key); if (!arr) { arr = []; h.set(key, arr); } arr.push(x, z, l.r);
    }
  }
  return (x, z) => {
    const cx = Math.floor(x / C), cz = Math.floor(z / C);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = h.get((cx + a) * 8192 + cz + b); if (!arr) continue;
      for (let k = 0; k < arr.length; k += 3) { const dx = arr[k] - x, dz = arr[k + 1] - z; if (dx * dx + dz * dz < arr[k + 2] * arr[k + 2]) return true; }
    }
    return false;
  };
}
