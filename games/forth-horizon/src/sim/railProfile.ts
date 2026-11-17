import { type P2, cumLen, dist, polyLen, sampleAt } from './geom';

/**
 * Laying a railway on the terrain: smooth the drawn line into a track with a gentle curve, then give it a height profile
 * (max 2.5 % grade) that rides on the ground, bridges narrow water, and goes under the wide shipping river and through hills in a tunnel.
 * Pure: the ground comes in as a function so the same profile can be built for the carving, the meshes and the trains.
 */
export type RailMode = 'ground' | 'bridge' | 'tunnel';

export interface RailProfile {
  pts: P2[]; cum: number[]; len: number;
  /** rail-head height at each point */
  y: number[];
  /** raw ground height at each point (before any carving) */
  g: number[];
  mode: RailMode[];
  /** index ranges of bridges and tunnels, for the meshes */
  bridges: { from: number; to: number; water: boolean }[];
  tunnels: { from: number; to: number }[];
  /** the speed limit from the curve radius, m/s, at each point */
  vmax: number[];
}

export const MAX_GRADE = 0.025;
/** deepest cutting and highest embankment before the line goes into a tunnel or onto a viaduct */
export const CUT_MAX = 7, FILL_MAX = 8;
export const STEP = 10;
const WATER = 0.8, BRIDGE_CLEAR = 7, TUNNEL_COVER = 9, TUNNEL_MIN_SPAN = 250;   // water this wide is tunnelled

/** centripetal-ish smoothing: Catmull-Rom through the drawn points, resampled every STEP metres */
export function smoothPath(pts: P2[], step = STEP): P2[] {
  if (pts.length < 3) {
    const l = polyLen(pts), n = Math.max(1, Math.round(l / step)), out: P2[] = [];
    for (let k = 0; k <= n; k++) out.push([pts[0][0] + (pts[pts.length - 1][0] - pts[0][0]) * (k / n), pts[0][1] + (pts[pts.length - 1][1] - pts[0][1]) * (k / n)]);
    return out;
  }
  const P = (i: number): P2 => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const dense: P2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), n = Math.max(2, Math.round(dist(p1, p2) / 4));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(pts[pts.length - 1]);
  // resample at equal spacing
  const cum = cumLen(dense), total = cum[cum.length - 1], n = Math.max(1, Math.round(total / step)), out: P2[] = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    while (k < dense.length - 2 && cum[k + 1] < s) k++;
    const l = cum[k + 1] - cum[k] || 1, t = Math.max(0, Math.min(1, (s - cum[k]) / l));
    out.push([dense[k][0] + (dense[k + 1][0] - dense[k][0]) * t, dense[k][1] + (dense[k + 1][1] - dense[k][1]) * t]);
  }
  return out;
}

function gauss(a: number[], radius: number): number[] {
  const sig = radius / 2, k: number[] = []; let sum = 0;
  const half = Math.ceil(radius);
  for (let i = -half; i <= half; i++) { const w = Math.exp(-(i * i) / (2 * sig * sig)); k.push(w); sum += w; }
  return a.map((_, i) => { let s = 0, w = 0; for (let j = -half; j <= half; j++) { const q = i + j; if (q < 0 || q >= a.length) continue; s += a[q] * k[j + half]; w += k[j + half]; } return s / (w || sum); });
}

export function railProfile(drawn: P2[], ground: (x: number, z: number) => number, opts: { maxGrade?: number; smoothM?: number } = {}): RailProfile {
  const pts = smoothPath(drawn), n = pts.length, cum = cumLen(pts);
  const gr = (opts.maxGrade ?? MAX_GRADE) * STEP;
  const g = pts.map((p) => ground(p[0], p[1]));
  const water = g.map((v) => v < WATER);
  // water spans
  const spans: { a: number; b: number }[] = [];
  for (let i = 0; i < n; i++) if (water[i]) { let j = i; while (j + 1 < n && water[j + 1]) j++; spans.push({ a: i, b: j }); i = j; }
  const sm = gauss(g.map((v) => Math.max(v, 0.6)), Math.round((opts.smoothM ?? 90) / STEP));
  const y = sm.map((v) => v + 0.6);
  const lb = new Array<number>(n).fill(-1e9), ub = new Array<number>(n).fill(1e9);
  const bridges: RailProfile['bridges'] = [], tunnels: RailProfile['tunnels'] = [];
  for (const sp of spans) {
    const spanLen = (sp.b - sp.a + 1) * STEP;
    const bankA = g[Math.max(0, sp.a - 1)], bankB = g[Math.min(n - 1, sp.b + 1)];
    if (spanLen < TUNNEL_MIN_SPAN) {
      // creeks and narrow channels: a bridge
      const deck = Math.max(bankA, bankB, 1) + BRIDGE_CLEAR;
      for (let i = 0; i < n; i++) { const d = i < sp.a ? sp.a - i : i > sp.b ? i - sp.b : 0; lb[i] = Math.max(lb[i], deck - gr * d); }
      bridges.push({ from: Math.max(0, sp.a - 2), to: Math.min(n - 1, sp.b + 2), water: true });
    } else {
      // the wide shipping river is passed in a tunnel under its bed, so ships need no clearance
      let bed = 1e9; for (let i = sp.a; i <= sp.b; i++) bed = Math.min(bed, g[i]);
      const floor = bed - TUNNEL_COVER;
      for (let i = 0; i < n; i++) { const d = i < sp.a ? sp.a - i : i > sp.b ? i - sp.b : 0; ub[i] = Math.min(ub[i], floor + gr * d); }
    }
  }
  // grade-limit, keeping to the bounds
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < n; i++) y[i] = Math.max(lb[i], Math.min(ub[i], y[i]));
    for (let i = 1; i < n; i++) y[i] = Math.max(y[i - 1] - gr, Math.min(y[i - 1] + gr, y[i]));
    for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i + 1] - gr, Math.min(y[i + 1] + gr, y[i]));
  }
  for (let i = 0; i < n; i++) y[i] = Math.max(lb[i], Math.min(ub[i], y[i]));
  // modes
  const mode: RailMode[] = y.map((v, i) => (v > g[i] + FILL_MAX * 0.5 && (water[i] || bridges.some((b) => i >= b.from && i <= b.to)) ? 'bridge' : v < g[i] - CUT_MAX || (water[i] && v < g[i]) ? 'tunnel' : v > g[i] + FILL_MAX ? 'bridge' : 'ground'));
  // a ground point with water under it has to be a bridge
  for (let i = 0; i < n; i++) if (water[i] && mode[i] === 'ground') mode[i] = 'bridge';
  const runs = (m: RailMode): { from: number; to: number }[] => { const out: { from: number; to: number }[] = []; for (let i = 0; i < n; i++) if (mode[i] === m) { let j = i; while (j + 1 < n && mode[j + 1] === m) j++; out.push({ from: i, to: j }); i = j; } return out; };
  const bridgeRuns = runs('bridge').filter((r) => r.to - r.from >= 1).map((r) => ({ ...r, water: water.slice(r.from, r.to + 1).some(Boolean)}));
  const tunnelRuns = runs('tunnel').filter((r) => r.to - r.from >= 2);
  // short bridge/tunnel slivers go back to ground
  for (let i = 0; i < n; i++) if (mode[i] === 'bridge' && !bridgeRuns.some((r) => i >= r.from && i <= r.to)) mode[i] = 'ground';
  for (let i = 0; i < n; i++) if (mode[i] === 'tunnel' && !tunnelRuns.some((r) => i >= r.from && i <= r.to)) mode[i] = 'ground';
  // curve speed limit: v = sqrt(a_lat R), a_lat 0.9 m/s2
  const vmax = pts.map((_, i) => {
    if (i < 3 || i > n - 4) return 40;
    const a = pts[i - 3], b = pts[i], c = pts[i + 3];
    const ab = dist(a, b), bc = dist(b, c), ca = dist(c, a);
    const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const R = area2 < 1e-6 ? 1e6 : (ab * bc * ca) / (2 * area2);
    return Math.max(8, Math.min(40, Math.sqrt(0.9 * R)));
  });
  const vm = gauss(vmax, 3).map((v, i) => Math.min(v, vmax[i] * 1.15));
  return { pts, cum, len: cum[n - 1], y, g, mode, bridges: bridgeRuns, tunnels: tunnelRuns, vmax: vm };
}

/** height at arc length s along a profile */
export function profileY(p: RailProfile, s: number): number {
  const f = Math.max(0, Math.min(p.pts.length - 1, s / STEP)), i = Math.min(p.pts.length - 2, Math.floor(f)), t = f - i;
  return p.y[i] + (p.y[i + 1] - p.y[i]) * t;
}
export function profileModeAt(p: RailProfile, s: number): RailMode { return p.mode[Math.max(0, Math.min(p.pts.length - 1, Math.round(s / STEP)))]; }
export const profileSample = (p: RailProfile, s: number): ReturnType<typeof sampleAt> => sampleAt(p.pts, p.cum, s);
