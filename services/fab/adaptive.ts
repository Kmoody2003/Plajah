// Adaptive clearing: pockets cleared with a light, steady radial cut at full flute depth, the way
// constant-engagement (HSM) toolpaths do it, from our own pieces:
//   - rings at fixed distances from the walls (iso-contours of the exact distance to the pocket
//     boundary, islands included), cut from the middle out, one `load` apart;
//   - a material simulation on a fine grid measures the tool's engagement angle as it moves;
//   - where the engagement would spike (ring corners, the first ring after the entry, splits) the
//     path turns into trochoidal loops that nibble forward, or the feed drops in proportion;
//   - a helical ramp enters at the widest point; links stay down when they cross cleared floor.
// The outermost ring sits `stockToLeave` off the walls, so a finishing profile can follow.

import { type Loop, type P2, regions, ccw, distToSeg, pointInLoop, offset, area } from './geom2d';
import type { ProcessId } from './machines';
import type { Job, Move } from './cam';
import { sampleGrid, contoursOf } from './contour';

export interface AdaptiveOptions {
  process?: ProcessId; tool: number;
  /** Radial width of cut, mm (the "optimal load"); default 15% of the tool. */ load?: number;
  depth: number; /** Depth per level; adaptive normally takes the full flute length at once. */ stepDown?: number;
  feed: number; rpm?: number; safeZ?: number; stockToLeave?: number;
  /** Engagement allowed before trochoidal loops take over, as a multiple of the nominal angle (default 1.3). */ slack?: number;
  /** Helical entry ramp angle, degrees. */ rampAngle?: number;
  /** Nibble with trochoidal loops where engagement spikes (default); off = slow the feed only. */ trochoidal?: boolean;
}

/** Engagement angle (radians) of a tool of radius r taking a radial width ae along a straight wall. */
export const engagementAngle = (r: number, ae: number) => Math.acos(Math.max(-1, Math.min(1, 1 - ae / r)));

interface Sim { x0: number; y0: number; cell: number; w: number; h: number; m: Uint8Array }

function makeSim(loops: Loop[], holes: Loop[], cell: number): Sim {
  const pts = loops.flat(); const x0 = Math.min(...pts.map(p => p[0])) - cell * 2, y0 = Math.min(...pts.map(p => p[1])) - cell * 2;
  const w = Math.ceil((Math.max(...pts.map(p => p[0])) - x0) / cell) + 3, h = Math.ceil((Math.max(...pts.map(p => p[1])) - y0) / cell) + 3;
  const m = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const p: P2 = [x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell]; if (loops.some(l => pointInLoop(p, l)) && !holes.some(l => pointInLoop(p, l))) m[r * w + c] = 1; }
  return { x0, y0, cell, w, h, m };
}
const at = (s: Sim, x: number, y: number) => { const c = Math.floor((x - s.x0) / s.cell), r = Math.floor((y - s.y0) / s.cell); return c >= 0 && r >= 0 && c < s.w && r < s.h ? s.m[r * s.w + c] : 0; };
function stamp(s: Sim, x: number, y: number, rad: number) {
  const c0 = Math.max(0, Math.floor((x - rad - s.x0) / s.cell)), c1 = Math.min(s.w - 1, Math.floor((x + rad - s.x0) / s.cell));
  const r0 = Math.max(0, Math.floor((y - rad - s.y0) / s.cell)), r1 = Math.min(s.h - 1, Math.floor((y + rad - s.y0) / s.cell));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const px = s.x0 + (c + 0.5) * s.cell - x, py = s.y0 + (r + 0.5) * s.cell - y; if (px * px + py * py <= rad * rad) s.m[r * s.w + c] = 0; }
}
const RING = 120;
/** Engagement angle (radians) at p moving along d: the arc of the cutter's leading half that meets material. */
function engagement(s: Sim, r: number, p: P2, d: P2): number {
  let hit = 0;
  for (let k = 0; k < RING; k++) { const a = (k + 0.5) / RING * 2 * Math.PI; const q: P2 = [Math.cos(a), Math.sin(a)]; if (q[0] * d[0] + q[1] * d[1] < 0) continue; if (at(s, p[0] + q[0] * r * 0.999, p[1] + q[1] * r * 0.999)) hit++; }
  return hit / RING * 2 * Math.PI;
}

export interface AdaptivePath { /** Path points with feed and measured engagement (radians); x = NaN marks a link (f = 1: lift over it). */ pts: Array<{ x: number; y: number; f: number; e: number }>; maxEngagement: number; trochoids: number; slowed: number; entry: { c: P2; r: number } | null; uncleared: number; rings: number }

/** The 2D clearing path for one level (the same at every depth). */
export function adaptivePath(loops: Loop[], o: AdaptiveOptions): AdaptivePath & { warnings: string[] } {
  const warnings: string[] = []; const r = o.tool / 2; const load = o.load ?? 0.15 * o.tool; const leave = o.stockToLeave ?? 0;
  const nominal = engagementAngle(r, load); const maxEng = nominal * (o.slack ?? 1.3);
  const all: AdaptivePath = { pts: [], maxEngagement: 0, trochoids: 0, slowed: 0, entry: null, uncleared: 0, rings: 0 };
  for (const reg of regions(loops)) {
    const outer = ccw(reg.outer), holes = reg.holes; const bounds = [outer, ...holes];
    // Signed distance: positive inside the material to clear, measured to the nearest wall or island.
    const sd = (x: number, y: number) => { const p: P2 = [x, y]; let d = Infinity; for (const l of bounds) for (let i = 0, j = l.length - 1; i < l.length; j = i++) d = Math.min(d, distToSeg(p, l[j], l[i])); const inMat = pointInLoop(p, outer) && !holes.some(h => pointInLoop(p, h)); return inMat ? d : -d; };
    const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]); const res = Math.max(0.05, Math.min(load, r) / 2);
    const box = { x0: Math.min(...xs) - res * 2, y0: Math.min(...ys) - res * 2, x1: Math.max(...xs) + res * 2, y1: Math.max(...ys) + res * 2 };
    const G = sampleGrid(sd, box, res); let maxD = -Infinity, cIdx = 0; G.v.forEach((v, i) => { if (v > maxD) { maxD = v; cIdx = i; } });
    const wall = r + leave; if (maxD < wall) { warnings.push(`A pocket narrower than the ${o.tool} mm tool was skipped.`); continue; }
    // Rings one load apart, wall ring last.
    const levels: number[] = []; for (let L = wall; L < maxD - 1e-6; L += load) levels.push(L);
    // Round each ring's corners (an opening: in by rho, out by rho) so successive rings stay concentric
    // round corners: rho grows by one load per ring outward. The wall ring then gets clean-up passes
    // with tighter and tighter corners, each taking at most one load out of a 90° corner.
    const K = levels.length - 1; const open = (l: Loop, rho: number): Loop[] => (rho > 1e-3 && area(l) > 0 ? offset(l, -rho).flatMap(x => offset(x, rho)) : [l]);
    const rings: Loop[][] = [];
        // Polygon offsets can stray a hair outside the true ring near merged islands: push any such point back onto it.
    const keep = (l: Loop, L: number): Loop => l.map(p => { let q: P2 = p; for (let it = 0; it < 8; it++) { const v = sd(q[0], q[1]); if (v >= L - 1e-6) break; const h = 1e-4; const gx = (sd(q[0] + h, q[1]) - sd(q[0] - h, q[1])) / (2 * h), gy = (sd(q[0], q[1] + h) - sd(q[0], q[1] - h)) / (2 * h); const g = Math.hypot(gx, gy) || 1; q = [q[0] + gx / g * (L - v + 1e-5), q[1] + gy / g * (L - v + 1e-5)]; } return q; });
    // Straight moves between contour points cut a chord across the arcs around islands and corners:
    // split any segment whose middle comes closer than the ring's distance, until the sag is negligible.
    const refine = (l: Loop, L: number): Loop => { const out: Loop = []; const go = (a: P2, b: P2, depth: number) => { const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (depth < 8 && sd(m[0], m[1]) < L - 2e-4) { const q = keep([m], L)[0]; go(a, q, depth + 1); out.push(q); go(q, b, depth + 1); } }; l.forEach((p, i) => { out.push(p); go(p, l[(i + 1) % l.length], 0); }); return out; };
    levels.forEach((L, k) => { const base = contoursOf(G, sd, L); const rho = (K - k) * load; rings.push(base.flatMap(l => open(l, rho).map(x => refine(keep(x, L), L)))); });
    const wallBase = contoursOf(G, sd, wall); const corner = load / (Math.SQRT2 - 1);
    for (let rho = K * load - corner; rho > 1e-3; rho -= corner) rings.unshift(wallBase.flatMap(l => open(l, rho).map(x => refine(keep(x, wall), wall))));
    if (K > 0) rings.unshift(wallBase.map(l => refine(l, wall)));
    rings.reverse(); all.rings += rings.reduce((s, x) => s + x.length, 0);
    const sim = makeSim([outer], holes, Math.min(r / 14, load / 5));
    const before = sim.m.reduce((s, v) => s + v, 0);
    // Helical entry at the widest point, as wide as fits.
    let c: P2 = [G.x0 + (cIdx % G.nx) * G.dx, G.y0 + Math.floor(cIdx / G.nx) * G.dy];
    // Refine the centre by a few hill-climbing steps on the exact distance.
    for (let step = res; step > 1e-3; step /= 2) for (let moved = true; moved;) { moved = false; for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const q: P2 = [c[0] + dx, c[1] + dy]; if (sd(q[0], q[1]) > sd(c[0], c[1]) + 1e-9) { c = q; moved = true; } } }
    const rh = Math.max(0, Math.min(r * 0.8, sd(c[0], c[1]) - wall));
    if (rh < 0.1 * r) warnings.push('No room for a helical entry: the tool plunges straight down and must be centre-cutting.');
    all.entry = all.entry ?? { c, r: rh }; stamp(sim, c[0], c[1], rh + r);
    const emit = (p: P2, f: number, e = 0) => { const q = all.pts[all.pts.length - 1]; if (!q || Number.isNaN(q.x) || Math.hypot(q.x - p[0], q.y - p[1]) > 1e-6) all.pts.push({ x: p[0], y: p[1], f, e }); };
    emit([c[0] + rh, c[1]], o.feed);
    let pos: P2 = [c[0] + rh, c[1]]; const ds = sim.cell;
    for (const level of rings) {
      // Nearest ring of this level first; each ring starts at its point closest to the tool.
      const left = [...level];
      while (left.length) {
        let bi = 0, bj = 0, bd = Infinity;
        left.forEach((l, i) => l.forEach((p, j) => { const d = Math.hypot(p[0] - pos[0], p[1] - pos[1]); if (d < bd) { bd = d; bi = i; bj = j; } }));
        const ring = left.splice(bi, 1)[0]; const seq = [...ring.slice(bj), ...ring.slice(0, bj), ring[bj]];
        // Climb cut: rings run with the wall on the right, which is clockwise around the pocket centre.
        seq.reverse();
        // Link: mark it, the job decides between staying down and lifting.
        // Link: stay down if the straight move crosses only cleared floor inside the walls, else lift over it.
        const LL = Math.hypot(seq[0][0] - pos[0], seq[0][1] - pos[1]); const ld: P2 = LL ? [(seq[0][0] - pos[0]) / LL, (seq[0][1] - pos[1]) / LL] : [1, 0];
        let lift = false; for (let k = 1, n = Math.ceil(LL / ds); k <= n && !lift; k++) { const q: P2 = [pos[0] + ld[0] * LL * k / n, pos[1] + ld[1] * LL * k / n]; if (sd(q[0], q[1]) < wall - 1e-6 || engagement(sim, r, q, ld) > maxEng) lift = true; }
        all.pts.push({ x: NaN, y: NaN, f: lift ? 1 : 0, e: 0 }); { const e0 = engagement(sim, r, seq[0], ld); emit(seq[0], e0 > maxEng ? o.feed * maxEng / e0 : o.feed, e0); } stamp(sim, seq[0][0], seq[0][1], r); pos = seq[0];
        for (let i = 1; i < seq.length; i++) {
          const a = seq[i - 1], b = seq[i]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue; const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
          const n = Math.max(1, Math.ceil(L / ds));
          for (let k = 1; k <= n; k++) {
            const p: P2 = [a[0] + d[0] * L * k / n, a[1] + d[1] * L * k / n];
            let e = engagement(sim, r, p, d);
            if (e > Math.max(maxEng * 1.8, 150 * Math.PI / 180)) {
              // Trochoidal nibbling: loops around points stepping up to p, each as wide as the walls allow.
              const room = sd(p[0], p[1]) - wall; const rt = Math.min(r * 0.5, room);
              if (o.trochoidal !== false && rt > 0.05 * r) {
                const pitch = load * 0.5; const back: P2 = [p[0] - d[0] * Math.min(L * k / n, r), p[1] - d[1] * Math.min(L * k / n, r)];
                const steps = Math.max(1, Math.ceil(Math.hypot(p[0] - back[0], p[1] - back[1]) / pitch));
                for (let t = 1; t <= steps; t++) {
                  const cc: P2 = [back[0] + (p[0] - back[0]) * t / steps, back[1] + (p[1] - back[1]) * t / steps];
                  // Each loop leaves from the trailing side so it starts in cleared floor.
                  const a0 = Math.atan2(-d[1], -d[0]); const segs = 24; const rc = Math.min(rt, sd(cc[0], cc[1]) - wall) * Math.cos(Math.PI / segs);
                  if (rc < 0.05 * r) continue;
                  for (let s = 0; s <= segs; s++) {
                    const th = a0 - s / segs * 2 * Math.PI; const q: P2 = [cc[0] + rc * Math.cos(th), cc[1] + rc * Math.sin(th)];
                    const qd: P2 = [Math.sin(th), -Math.cos(th)]; const eq = engagement(sim, r, q, qd);
                    const f = eq > maxEng ? o.feed * maxEng / eq : o.feed; if (eq > maxEng) all.slowed++;
                    all.maxEngagement = Math.max(all.maxEngagement, eq); emit(q, f, eq); stamp(sim, q[0], q[1], r);
                  }
                }
                all.trochoids++; emit(p, o.feed); e = engagement(sim, r, p, d);
              }
            }
            // Whatever is left over: slow down in proportion, as chip thickness grows with engagement.
            const f = e > maxEng ? o.feed * maxEng / e : o.feed; if (e > maxEng) all.slowed++;
            all.maxEngagement = Math.max(all.maxEngagement, e); emit(p, f, e); stamp(sim, p[0], p[1], r); pos = p;
          }
        }
      }
    }
    // Material still there that the tool was meant to reach (inside the wall ring).
    let left = 0; for (let rr = 0; rr < sim.h; rr++) for (let cc = 0; cc < sim.w; cc++) if (sim.m[rr * sim.w + cc]) { const x = sim.x0 + (cc + 0.5) * sim.cell, y = sim.y0 + (rr + 0.5) * sim.cell; if (sd(x, y) > leave + sim.cell * 1.5) left++; }
    all.uncleared += before ? left / before : 0;
  }
  return { ...all, warnings };
}

/** Adaptive clearing job: the path at every depth level, helical entry, links kept down over cleared floor. */
export function adaptiveJob(loops: Loop[], o: AdaptiveOptions): Job & { path: AdaptivePath } {
  const path = adaptivePath(loops, o); const warnings = [...path.warnings]; const moves: Move[] = []; const safeZ = o.safeZ ?? 5;
  const step = Math.max(0.1, o.stepDown ?? Math.min(o.depth, o.tool * 2));
  const levels = Array.from({ length: Math.max(1, Math.ceil(o.depth / step - 1e-9)) }, (_, i) => -Math.min(o.depth, (i + 1) * step));
  const ramp = Math.tan((o.rampAngle ?? 3) * Math.PI / 180);
  moves.push({ t: 'comment', text: `Adaptive clearing, Ø${o.tool} mm, ${(o.load ?? 0.15 * o.tool).toFixed(2)} mm radial load` }, { t: 'tool', n: 1, dia: o.tool }, { t: 'rapid', z: safeZ }, { t: 'on', s: o.rpm ?? 12000 });
  let top = 0;
  for (const z of levels) {
    const e = path.entry;
    if (e) {
      // Helix down from just above the last floor.
      moves.push({ t: 'rapid', x: e.c[0] + e.r, y: e.c[1] }, { t: 'rapid', z: top + 1 });
      if (e.r > 0.05) { let zz = top + 1; const perRev = 2 * Math.PI * e.r * ramp; while (zz > z) { for (let s = 1; s <= 24; s++) { zz = Math.max(z, zz - perRev / 24); const th = s / 24 * 2 * Math.PI; moves.push({ t: 'feed', x: e.c[0] + e.r * Math.cos(th), y: e.c[1] + e.r * Math.sin(th), z: zz, f: o.feed / 2 }); } }
        for (let s = 1; s <= 24; s++) { const th = s / 24 * 2 * Math.PI; moves.push({ t: 'feed', x: e.c[0] + e.r * Math.cos(th), y: e.c[1] + e.r * Math.sin(th), f: o.feed / 2 }); } }
      else moves.push({ t: 'feed', z, f: o.feed / 4 });
    }
    let link: 'down' | 'lift' | null = null;
    for (const p of path.pts) {
      if (Number.isNaN(p.x)) { link = p.f ? 'lift' : 'down'; continue; }
      // Lifted links clear the uncut stock of this level (its top is the last floor) and plunge gently.
      if (link === 'lift') moves.push({ t: 'rapid', z: top + 1 }, { t: 'rapid', x: p.x, y: p.y }, { t: 'feed', z, f: o.feed / 4 });
      else moves.push({ t: 'feed', x: p.x, y: p.y, f: Math.round(p.f) });
      link = null;
    }
    moves.push({ t: 'rapid', z: safeZ }); top = z;
  }
  moves.push({ t: 'off' });
  if (path.slowed) warnings.push(`The feed drops in ${path.slowed} spots where the cut would otherwise get heavy.`);
  if (path.uncleared > 0.01) warnings.push(`About ${(path.uncleared * 100).toFixed(1)}% of the pocket floor is out of the tool's reach (narrow corners); a smaller tool can rest-machine it.`);
  let x = 0, y = 0, zc = 0, f = o.feed, cut = 0, rapid = 0, sec = 0; const min: P2 = [Infinity, Infinity], max: P2 = [-Infinity, -Infinity];
  for (const m of moves) { if (m.t !== 'rapid' && m.t !== 'feed') continue; const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? zc; const d = Math.hypot(nx - x, ny - y, nz - zc); if (m.f) f = m.f; if (m.t === 'rapid') { rapid += d; sec += d / 3000 * 60; } else { cut += d; sec += d / f * 60; min[0] = Math.min(min[0], nx); min[1] = Math.min(min[1], ny); max[0] = Math.max(max[0], nx); max[1] = Math.max(max[1], ny); } x = nx; y = ny; zc = nz; }
  return { process: o.process ?? 'mill3', kind: 'adaptive', moves, warnings, meta: { tool: o.tool, load: o.load ?? 0.15 * o.tool, maxEngagementDeg: +(path.maxEngagement * 180 / Math.PI).toFixed(1), trochoids: path.trochoids, rings: path.rings }, stats: { cutLength: cut, rapidLength: rapid, seconds: sec }, bounds: { min, max }, path };
}
