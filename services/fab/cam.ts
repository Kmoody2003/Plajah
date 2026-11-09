// Our own CAM: neutral toolpaths for every process family, turned into machine code by gcode.ts.
//   cutJob     laser / plasma / waterjet / router / EDM / drag knife: kerf-compensated profiles,
//              holes before outlines, lead-ins off the part, depth passes for routers.
//   pocketJob  concentric clearing of closed regions (mill / router).
//   fdmJob     our FDM slicer: walls with seam placement, lines/grid/cubic/gyroid infill, solid top and
//              bottom, uniform or adaptive layers, grid or tree supports, ironing, flow limiting.
//   latheJob   turning: roughing passes down to the profile, then a finish pass.
//   writeCli   Common Layer Interface layers for metal powder-bed machines.
// Units are millimetres throughout.

import { type Loop, type P2, area, offset, regions, perimeter, pointInLoop, ccw } from './geom2d';
import { type Layer, type MeshIn, sliceAt, meshBounds, layerHeights, sliceAtHeights } from './slice';
import type { ProcessId } from './machines';
import { supportGrids, treeSupports, hatch, makeGrid, rasterize, dilate, minus, count, type Grid } from './raster';
import { scanFill, infillPaths, type InfillPattern } from './infill';
import { estimateSeconds } from './estimate';

export type Move =
  | { t: 'rapid' | 'feed'; x?: number; y?: number; z?: number; e?: number; f?: number }
  | { t: 'on'; s: number } | { t: 'off' } | { t: 'dwell'; s: number }
  | { t: 'layer'; n: number; z: number } | { t: 'comment'; text: string } | { t: 'tool'; n: number; dia: number }
  | { t: 'fan'; s: number } | { t: 'temp'; s: number; bed?: boolean };

export interface Job { process: ProcessId; kind: 'cut' | 'pocket' | 'fdm' | 'lathe'; moves: Move[]; warnings: string[]; stats: { cutLength: number; rapidLength: number; seconds: number; layers?: number; filamentMm?: number; filamentG?: number; pierces?: number }; bounds: { min: P2; max: P2 }; meta: Record<string, number | string> }

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function rotateTo(l: Loop, i: number): Loop { return [...l.slice(i), ...l.slice(0, i)]; }
function nearestIndex(l: Loop, p: P2) { let bi = 0, bd = Infinity; l.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } }); return bi; }

function finishStats(job: Omit<Job, 'stats' | 'bounds'>, rapidRate: number): Job {
  let x = 0, y = 0, z = 0, f = 1000, cut = 0, rapid = 0, sec = 0; const min: P2 = [Infinity, Infinity], max: P2 = [-Infinity, -Infinity];
  for (const m of job.moves) {
    if (m.t === 'dwell') { sec += m.s; continue; }
    if (m.t !== 'rapid' && m.t !== 'feed') continue;
    const nx = m.x ?? x, ny = m.y ?? y, nz = m.z ?? z; const d = Math.hypot(nx - x, ny - y, nz - z);
    if (m.f) f = m.f; if (m.t === 'rapid') { rapid += d; sec += d / rapidRate * 60; } else { cut += d; sec += d / f * 60; }
    if (m.t === 'feed') { min[0] = Math.min(min[0], nx); min[1] = Math.min(min[1], ny); max[0] = Math.max(max[0], nx); max[1] = Math.max(max[1], ny); }
    x = nx; y = ny; z = nz;
  }
  return { ...job, stats: { cutLength: cut, rapidLength: rapid, seconds: sec }, bounds: { min, max } };
}

// ---------------------------------------------------------------- cutting
export interface CutOptions {
  process: ProcessId; kerf: number; feed: number; power?: number;
  /** Router/mill: material thickness, depth per pass, safe height. */ thickness?: number; stepDown?: number; safeZ?: number;
  leadIn?: number; pierceDelay?: number; passes?: number; plunge?: number;
}
export function cutJob(loops: Loop[], open: P2[][], o: CutOptions): Job {
  const warnings: string[] = []; const moves: Move[] = []; const k = o.kerf / 2;
  const spindle = ['router', 'mill3', 'mill5'].includes(o.process); const torch = !spindle;
  const safeZ = o.safeZ ?? 5; const depth = o.thickness ?? 0; const step = spindle ? Math.max(0.1, o.stepDown ?? depth) : depth;
  const levels = spindle ? Array.from({ length: Math.max(1, Math.ceil(depth / step - 1e-9)) }, (_, i) => -Math.min(depth, (i + 1) * step)) : [0];
  const lead = o.leadIn ?? (o.process === 'plasma' ? 4 : o.process === 'waterjet' ? 2 : 0);
  type Path = { pts: Loop; closed: boolean; hole: boolean };
  const paths: Path[] = [];
  for (const r of regions(loops)) {
    for (const h of r.holes) { const off = k ? offset(ccw(h), -k) : [ccw(h)]; if (!off.length) warnings.push(`A ${Math.sqrt(Math.abs(area(h)) / Math.PI * 4).toFixed(1)} mm hole is smaller than the cut width; it will not cut.`); off.forEach(l => paths.push({ pts: [...l].reverse(), closed: true, hole: true })); }
    const outer = k ? offset(r.outer, k) : [r.outer]; outer.forEach(l => paths.push({ pts: l, closed: true, hole: false }));
  }
  for (const p of open) paths.push({ pts: p, closed: false, hole: false });
  // Order: open scores first (part still held), then holes, then outlines; nearest next start within each group.
  const order: Path[] = []; let at: P2 = [0, 0];
  for (const group of [paths.filter(p => !p.closed), paths.filter(p => p.hole), paths.filter(p => p.closed && !p.hole)]) {
    const left = [...group];
    while (left.length) {
      let bi = 0, bd = Infinity, bs = 0;
      left.forEach((p, i) => { const s = p.closed ? nearestIndex(p.pts, at) : 0; const d = dist(at, p.pts[s]); if (d < bd) { bd = d; bi = i; bs = s; } });
      const p = left.splice(bi, 1)[0]; const pts = p.closed ? rotateTo(p.pts, bs) : p.pts; order.push({ ...p, pts }); at = pts[0];
    }
  }
  moves.push({ t: 'comment', text: `${order.length} paths, kerf ${o.kerf} mm` });
  if (spindle) moves.push({ t: 'rapid', z: safeZ }, { t: 'on', s: o.power ?? 18000 });
  let pierces = 0;
  for (const p of order) {
    const start = p.pts[0];
    // Lead-in from scrap: outside an outline, inside a hole.
    let entry = start;
    if (lead && p.closed && p.pts.length > 2) {
      const nxt = p.pts[1]; const dx = nxt[0] - start[0], dy = nxt[1] - start[1]; const L = Math.hypot(dx, dy) || 1;
      const right: P2 = [dy / L, -dx / L]; // outlines run CCW: right is outside; holes run CW: right is inside the hole
      entry = [start[0] + right[0] * lead, start[1] + right[1] * lead];
    }
    for (const z of levels) {
      for (let pass = 0; pass < (o.passes ?? 1); pass++) {
        moves.push({ t: 'rapid', x: entry[0], y: entry[1] });
        if (spindle) moves.push({ t: 'feed', z, f: o.plunge ?? o.feed / 3 });
        else { moves.push({ t: 'on', s: o.power ?? 100 }); pierces++; if (o.pierceDelay) moves.push({ t: 'dwell', s: o.pierceDelay }); }
        if (entry !== start) moves.push({ t: 'feed', x: start[0], y: start[1], f: o.feed });
        for (const q of p.pts.slice(1)) moves.push({ t: 'feed', x: q[0], y: q[1], f: o.feed });
        if (p.closed) moves.push({ t: 'feed', x: start[0], y: start[1], f: o.feed });
        if (spindle) moves.push({ t: 'rapid', z: safeZ }); else moves.push({ t: 'off' });
      }
    }
  }
  if (spindle) moves.push({ t: 'off' });
  if (torch) moves.unshift({ t: 'comment', text: o.process === 'plasma' ? 'Torch height control and pierce height are set on the machine' : 'Focus the head before running' });
  const job = finishStats({ process: o.process, kind: 'cut', moves, warnings, meta: { kerf: o.kerf, feed: o.feed } }, spindle ? 3000 : 6000);
  job.stats.pierces = pierces; return job;
}

// ---------------------------------------------------------------- pocketing
export function pocketJob(loops: Loop[], o: { process: ProcessId; tool: number; stepover?: number; depth: number; stepDown: number; feed: number; rpm?: number; safeZ?: number }): Job {
  const warnings: string[] = []; const moves: Move[] = []; const r = o.tool / 2; const so = (o.stepover ?? 0.45) * o.tool; const safeZ = o.safeZ ?? 5;
  moves.push({ t: 'tool', n: 1, dia: o.tool }, { t: 'rapid', z: safeZ }, { t: 'on', s: o.rpm ?? 12000 });
  const levels = Array.from({ length: Math.max(1, Math.ceil(o.depth / o.stepDown - 1e-9)) }, (_, i) => -Math.min(o.depth, (i + 1) * o.stepDown));
  for (const reg of regions(loops)) {
    if (reg.holes.length) warnings.push('A pocket with islands was cleared around its outline only; islands need their own pass.');
    const rings: Loop[] = []; let cur = offset(reg.outer, -r); let guard = 0;
    while (cur.length && guard++ < 400) { rings.push(...cur); cur = cur.flatMap(l => offset(l, -so)); }
    if (!rings.length) { warnings.push(`A pocket narrower than the ${o.tool} mm tool was skipped.`); continue; }
    rings.reverse(); // centre out
    for (const z of levels) for (const ring of rings) {
      moves.push({ t: 'rapid', x: ring[0][0], y: ring[0][1] }, { t: 'feed', z, f: o.feed / 3 });
      for (const q of ring.slice(1)) moves.push({ t: 'feed', x: q[0], y: q[1], f: o.feed });
      moves.push({ t: 'feed', x: ring[0][0], y: ring[0][1], f: o.feed }, { t: 'rapid', z: safeZ });
    }
  }
  moves.push({ t: 'off' });
  return finishStats({ process: o.process, kind: 'pocket', moves, warnings, meta: { tool: o.tool } }, 3000);
}

// ---------------------------------------------------------------- FDM
export type { InfillPattern } from './infill';
export type SeamMode = 'aligned' | 'rear' | 'nearest' | 'random';
export interface FdmOptions { layer: number; nozzle: number; walls: number; infill: number; solidLayers: number; speed: number; travel: number; filament: number; density: number; nozzleTemp: number; bedTemp: number; firstLayerSpeed?: number; process?: ProcessId; scale?: number;
  /** Support: none, from the bed only, or also resting on the part; grid columns or branching trees. */
  supports?: 'none' | 'buildplate' | 'everywhere'; supportStyle?: 'grid' | 'tree'; overhang?: number; supportDensity?: number;
  /** Bed adhesion: a skirt to prime the nozzle, or a brim glued to the first layer. */
  adhesion?: 'none' | 'skirt' | 'brim'; brimWidth?: number;
  /** Retraction on travel moves longer than 2 mm (mm of filament, mm/s), and Z hop (mm). */
  retract?: number; retractSpeed?: number; zHop?: number;
  /** Part-cooling fan 0..1, off for the first `fanFirstLayers` layers (default 1). */
  fan?: number; fanFirstLayers?: number;
  /** First layer height (mm); top solid layers (defaults to solidLayers, which then counts the bottom). */
  firstLayer?: number; topLayers?: number;
  /** Per-feature speeds, mm/s. Defaults: outer wall 0.6 × speed, others = speed. */
  outerWallSpeed?: number; innerWallSpeed?: number; infillSpeed?: number; solidSpeed?: number;
  infillPattern?: InfillPattern; seam?: SeamMode;
  /** Ironing: a second, nearly dry pass over top surfaces at close spacing to smooth them. */
  ironing?: boolean; ironingSpeed?: number; ironingFlow?: number; ironingSpacing?: number;
  /** Max volumetric flow, mm³/s: feature speeds are lowered so the hotend can melt fast enough. */
  maxVolumetric?: number;
  /** Accelerations for the time estimate, mm/s². */ accel?: number; travelAccel?: number;
  /** Adaptive (variable) layer heights. */ adaptive?: boolean | { min?: number; max?: number; tolerance?: number };
  firstLayerNozzleTemp?: number; firstLayerBedTemp?: number;
  /** Where the part's centre goes on the bed (default the origin), and the bed for a fit check. */
  center?: P2; bed?: { w: number; d: number; shape?: 'rect' | 'circle' } }
export const FDM_DEFAULTS: FdmOptions = { layer: 0.2, nozzle: 0.4, walls: 2, infill: 0.2, solidLayers: 3, speed: 50, travel: 150, filament: 1.75, density: 1.24, nozzleTemp: 210, bedTemp: 60, supports: 'none', overhang: 50, supportDensity: 0.15, adhesion: 'skirt', brimWidth: 5, retract: 0.8, retractSpeed: 35, zHop: 0.2, fan: 1, infillPattern: 'lines', seam: 'aligned', supportStyle: 'grid' };

/** Turn at vertex i of a loop: its angle, and whether the corner is concave (where a seam hides). */
function cornerTurn(l: Loop, i: number) {
  const a = l[(i - 1 + l.length) % l.length], b = l[i], c = l[(i + 1) % l.length];
  const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]; const lu = Math.hypot(u[0], u[1]) || 1, lv = Math.hypot(v[0], v[1]) || 1;
  const cross = (u[0] * v[1] - u[1] * v[0]) / (lu * lv), dot = (u[0] * v[0] + u[1] * v[1]) / (lu * lv);
  return { angle: Math.atan2(cross, dot), concave: cross < 0 };
}
/** Where a closed wall starts: aligned layer to layer (in a corner when one is close), at the back, nearest, or scattered. */
export function seamIndex(l: Loop, mode: SeamMode, ctx: { pos: P2; prev: P2[]; li: number; k: number }): number {
  const n = l.length; if (n < 3) return 0;
  if (mode === 'nearest') return nearestIndex(l, ctx.pos);
  if (mode === 'random') { let h = (ctx.li * 73856093) ^ (ctx.k * 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return Math.abs(h ^ (h >>> 15)) % n; }
  const rear = () => { let bi = 0; const cx = l.reduce((s, p) => s + p[0], 0) / n; for (let i = 1; i < n; i++) { const p = l[i], q = l[bi]; if (p[1] > q[1] + 0.3 || (Math.abs(p[1] - q[1]) <= 0.3 && Math.abs(p[0] - cx) < Math.abs(q[0] - cx))) bi = i; } return bi; };
  if (mode === 'rear') return rear();
  let target: P2 | null = null; let td = Infinity;
  for (const s of ctx.prev) { const i = nearestIndex(l, s); const d = dist(l[i], s); if (d < td) { td = d; target = s; } }
  if (!target || td > 3) target = l[rear()];
  let bi = nearestIndex(l, target), best = Infinity;
  for (let i = 0; i < n; i++) {
    const d = dist(l[i], target); if (d > 2) continue;
    const c = cornerTurn(l, i); const sharp = Math.abs(c.angle) > Math.PI / 6;
    const score = d - (sharp ? (c.concave ? 1.5 : 0.8) : 0); if (score < best) { best = score; bi = i; }
  }
  return bi;
}

export function fdmJob(meshes: MeshIn[], opt: Partial<FdmOptions> = {}): Job & { layers: Layer[]; supportGrids?: Grid[] } {
  const o = { ...FDM_DEFAULTS, ...opt }; const warnings: string[] = []; const moves: Move[] = [];
  const b = meshBounds(meshes); const w = o.nozzle * 1.125; const filArea = Math.PI * (o.filament / 2) ** 2;
  // Place on the bed: centred on `center` (the origin unless the printer's bed centre is given), lowest point at z = 0.
  const c0 = o.center ?? [0, 0];
  const dx = c0[0] - (b.min[0] + b.max[0]) / 2, dy = c0[1] - (b.min[1] + b.max[1]) / 2, dz = -b.min[2];
  const placed = meshes.map(m => { const P = Float32Array.from(m.positions); for (let i = 0; i < P.length; i += 3) { P[i] += dx; P[i + 1] += dy; P[i + 2] += dz; } return { positions: P, indices: m.indices }; });
  if (o.bed) {
    const hx = (b.max[0] - b.min[0]) / 2, hy = (b.max[1] - b.min[1]) / 2;
    const fits = o.bed.shape === 'circle' ? Math.hypot(hx, hy) <= o.bed.w / 2 : hx * 2 <= o.bed.w && hy * 2 <= o.bed.d;
    if (!fits) warnings.push(`The part (${(hx * 2).toFixed(0)} × ${(hy * 2).toFixed(0)} mm) does not fit the ${o.bed.shape === 'circle' ? `Ø${o.bed.w} mm round` : `${o.bed.w} × ${o.bed.d} mm`} bed.`);
  }
  const tops = layerHeights(placed, { layer: o.layer, firstLayer: o.firstLayer, adaptive: o.adaptive, nozzle: o.nozzle });
  const layers = sliceAtHeights(placed, tops);
  const thick = layers.map((L, i) => L.z - (i ? layers[i - 1].z : 0));
  let e = 0; let pos: P2 = [0, 0]; let z = 0; let h = o.layer; let flowCapped = 0;
  const travelTo = (p: P2) => {
    const d = dist(pos, p); if (d <= 0.01) return;
    const r = o.retract ?? 0; const hop = o.zHop ?? 0; const long = d > 2;
    if (long && r > 0) moves.push({ t: 'feed', e: e - r, f: (o.retractSpeed ?? 35) * 60 });
    if (long && hop > 0) moves.push({ t: 'rapid', z: z + hop, f: o.travel * 60 });
    moves.push({ t: 'rapid', x: p[0], y: p[1], f: o.travel * 60 });
    if (long && hop > 0) moves.push({ t: 'rapid', z, f: o.travel * 60 });
    if (long && r > 0) moves.push({ t: 'feed', e, f: (o.retractSpeed ?? 35) * 60 });
    pos = p;
  };
  /** Extrude a path at `f` mm/s; `flow` scales the bead (ironing) and `width` is its line spacing. */
  const extrude = (pts: P2[], f: number, closed: boolean, flow = 1, width = w) => {
    if (pts.length < 2) return; travelTo(pts[0]);
    const eArea = (h * width * flow) / filArea;
    // Volumetric limit: the hotend can only melt so many mm³ per second.
    let v = f; if (o.maxVolumetric && flow >= 1) { const cap = o.maxVolumetric / (h * width); if (v > cap) { v = cap; flowCapped++; } }
    const seq = closed ? [...pts.slice(1), pts[0]] : pts.slice(1); let prev = pts[0];
    for (const q of seq) { e += dist(prev, q) * eArea; moves.push({ t: 'feed', x: q[0], y: q[1], e, f: v * 60 }); prev = q; }
    pos = prev;
  };
  // Supports, computed top-down over the whole stack.
  const meanLayer = layers.length ? layers[layers.length - 1].z / layers.length : o.layer;
  const supBounds = { min: [b.min[0] + dx, b.min[1] + dy] as P2, max: [b.max[0] + dx, b.max[1] + dy] as P2 };
  const supOpts = { overhang: o.overhang ?? 50, layer: meanLayer, mode: o.supports as 'buildplate' | 'everywhere', xyGap: Math.max(0.6, w * 1.5) };
  const wantSup = !!o.supports && o.supports !== 'none' && layers.length > 2;
  const tree = wantSup && o.supportStyle === 'tree' ? treeSupports(layers, supBounds, supOpts) : null;
  const sup = tree ?? (wantSup ? supportGrids(layers, supBounds, supOpts) : null);
  // Top surfaces for ironing: what a layer shows upward (not covered by the layer above).
  const ironCell = Math.max(0.08, o.ironingSpacing ?? 0.15);
  const coarse = o.ironing ? makeGrid(supBounds.min[0] - 2, supBounds.min[1] - 2, supBounds.max[0] + 2, supBounds.max[1] + 2, 1) : null;
  const coarseMask = coarse ? layers.map(L => rasterize(coarse, L.loops)) : [];
  const topLayers = o.topLayers ?? o.solidLayers; const fanFrom = Math.max(0, o.fanFirstLayers ?? 1);
  let supportMm = 0, ironMm = 0; let prevSeams: P2[] = [];
  const outerV = o.outerWallSpeed ?? o.speed * 0.6, innerV = o.innerWallSpeed ?? o.speed, infillV = o.infillSpeed ?? o.speed, solidV = o.solidSpeed ?? o.speed;
  layers.forEach((L, li) => {
    z = L.z; h = thick[li];
    moves.push({ t: 'layer', n: li, z: L.z }, { t: 'rapid', z: L.z, f: o.travel * 60 });
    if (li === fanFrom && (o.fan ?? 0) > 0) moves.push({ t: 'fan', s: o.fan ?? 1 });
    if (li === 1 && o.firstLayerNozzleTemp !== undefined && o.firstLayerNozzleTemp !== o.nozzleTemp) moves.push({ t: 'temp', s: o.nozzleTemp });
    if (li === 1 && o.firstLayerBedTemp !== undefined && o.firstLayerBedTemp !== o.bedTemp) moves.push({ t: 'temp', s: o.bedTemp, bed: true });
    const first = li === 0; const fl = o.firstLayerSpeed ?? o.speed / 2;
    const sp = (v: number) => (first ? Math.min(v, fl) : v);
    if (first && o.adhesion && o.adhesion !== 'none') {
      const outers = regions(L.loops).map(r => r.outer);
      if (o.adhesion === 'skirt') for (const l of outers) offset(l, 4).forEach(sk => extrude(sk, fl, true));
      else { const n = Math.max(1, Math.round((o.brimWidth ?? 5) / w)); for (let k = n; k >= 1; k--) for (const l of outers) offset(l, k * w - w / 2).forEach(br => extrude(br, fl, true)); }
    }
    if (sup && sup.area[li] > 0) {
      const before = e;
      if (tree) {
        // Each branch section prints as a ring, with inner rings once it is thick.
        for (const nd of tree.nodes[li]) for (let rr = nd.r - w / 2; rr >= w / 2; rr -= w * 2.5) {
          const seg = Math.max(8, Math.min(32, Math.round(rr * 8))); const ring: P2[] = Array.from({ length: seg }, (_, k) => [nd.x + rr * Math.cos(k / seg * Math.PI * 2), nd.y + rr * Math.sin(k / seg * Math.PI * 2)] as P2);
          extrude(ring, sp(o.speed * 1.2), true);
        }
      } else for (const seg of hatch(sup.grids[li], w / Math.max(0.05, o.supportDensity ?? 0.15))) extrude(seg, sp(o.speed * 1.2), false);
      supportMm += e - before;
    }
    const solid = li < o.solidLayers || li >= layers.length - topLayers;
    const seams: P2[] = []; let k = 0;
    for (const reg of regions(L.loops)) {
      let inner: Loop[] = [];
      for (let wi = 0; wi < o.walls; wi++) {
        const ring = [...offset(reg.outer, -(w / 2 + wi * w)), ...reg.holes.flatMap(hh => offset(ccw(hh), w / 2 + wi * w).map(x => [...x].reverse()))];
        if (!ring.length) break; inner = ring;
        // Outermost wall slower, for a clean surface; every wall starts at its seam.
        for (const l of ring) { const si = seamIndex(l, o.seam ?? 'aligned', { pos, prev: prevSeams, li, k: k++ }); seams.push(l[si]); extrude(rotateTo(l, si), sp(wi === 0 ? outerV : innerV), true); }
      }
      if (!inner.length) { if (L.loops.length) warnings.push(`Layer ${li + 1} has features thinner than one line (${w.toFixed(2)} mm).`); continue; }
      const fillArea = [...offset(reg.outer, -(o.walls * w)), ...reg.holes.flatMap(hh => offset(ccw(hh), o.walls * w).map(x => [...x].reverse()))];
      const density = solid ? 1 : o.infill; if (density <= 0 || !fillArea.length) continue;
      const paths = solid ? scanFill(fillArea, w, (li % 2 ? 135 : 45) * Math.PI / 180) : infillPaths(fillArea, o.infillPattern ?? 'lines', w / density, L.z, li);
      for (const seg of paths) extrude(seg, sp(solid ? solidV : infillV), false);
    }
    prevSeams = seams;
    // Ironing over this layer's top surfaces, inside the outer wall.
    if (coarse && li > 0) {
      const above = coarseMask[li + 1]; const topC = above ? minus(coarseMask[li], dilate(above, 1)) : coarseMask[li];
      if (count(topC) > 2) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let r = 0; r < topC.h; r++) for (let c = 0; c < topC.w; c++) if (topC.bits[r * topC.w + c]) { x0 = Math.min(x0, c); x1 = Math.max(x1, c); y0 = Math.min(y0, r); y1 = Math.max(y1, r); }
        let cell = ironCell; const gx0 = coarse.x0 + x0 - 1, gy0 = coarse.y0 + y0 - 1, gx1 = coarse.x0 + x1 + 2, gy1 = coarse.y0 + y1 + 2;
        while ((gx1 - gx0) * (gy1 - gy0) / (cell * cell) > 3_000_000) cell *= 1.4;
        const fine = makeGrid(gx0, gy0, gx1, gy1, cell);
        const here = dilate(rasterize(fine, L.loops), -Math.max(1, Math.round(w / cell)));
        const top = layers[li + 1] ? minus(here, rasterize(fine, layers[li + 1].loops)) : here;
        const before = e;
        for (const seg of hatch(top, cell)) extrude(seg, o.ironingSpeed ?? 15, false, o.ironingFlow ?? 0.15, cell);
        ironMm += e - before;
      }
    }
  });
  if (flowCapped) warnings.push(`Some moves were slowed to stay within ${o.maxVolumetric} mm³/s of melt flow.`);
  const fil = e; const grams = fil * filArea / 1000 * o.density;
  const job = finishStats({ process: o.process ?? 'fdm', kind: 'fdm', moves, warnings: [...new Set(warnings)].slice(0, 8), meta: { ...o, center: c0.join(','), bed: o.bed ? `${o.bed.w}x${o.bed.d}` : '', adaptive: o.adaptive ? 1 : 0 } as unknown as Record<string, number> }, o.travel * 60);
  job.meta.secondsNoAccel = Math.round(job.stats.seconds);
  job.stats.seconds = estimateSeconds(moves, { accel: o.accel, travelAccel: o.travelAccel });
  job.stats.layers = layers.length; job.stats.filamentMm = fil; job.stats.filamentG = grams;
  if (sup) job.meta.supportFilamentMm = Math.round(supportMm);
  if (ironMm) job.meta.ironingFilamentMm = +ironMm.toFixed(2);
  if (flowCapped) job.meta.flowCapped = flowCapped;
  return { ...job, layers, supportGrids: sup?.grids };
}

// ---------------------------------------------------------------- lathe
/** Turned profile: largest radius about the Z axis along the part, sampled every `dz`. z = 0 is the free end. */
export function turnedProfile(meshes: MeshIn[], dz = 0.5): Array<[number, number]> {
  const b = meshBounds(meshes); const n = Math.max(2, Math.round((b.max[2] - b.min[2]) / dz)); const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const z = b.min[2] + (b.max[2] - b.min[2]) * Math.min(0.999, Math.max(0.001, i / n));
    const loops = sliceAt(meshes, z); const r = Math.max(0, ...loops.flat().map(p => Math.hypot(p[0], p[1])));
    out.push([-(b.max[2] - z), r]); // free end (top) at z = 0, into the part is negative
  }
  return out.sort((a, b) => b[0] - a[0]);
}
export function latheJob(profile: Array<[number, number]>, o: { stock: number; doc: number; finish: number; feed: number; finishFeed: number; rpm: number; safeX?: number }): Job {
  const warnings: string[] = []; const moves: Move[] = []; const stockR = o.stock / 2; const safe = o.safeX ?? stockR + 2;
  const maxR = Math.max(...profile.map(p => p[1])); if (maxR > stockR) warnings.push(`The part (Ø${(maxR * 2).toFixed(1)} mm) is larger than the stock (Ø${o.stock} mm).`);
  const zEnd = Math.min(...profile.map(p => p[0]));
  moves.push({ t: 'tool', n: 1, dia: 0.8 }, { t: 'on', s: o.rpm }, { t: 'rapid', x: safe * 2, z: 2 });
  // Roughing: X here is a diameter, as lathes are programmed.
  for (let R = stockR - o.doc; R > Math.min(...profile.map(p => p[1])) + o.finish - 1e-9; R -= o.doc) {
    let inCut = false;
    for (let i = 0; i < profile.length; i++) {
      const [z, r] = profile[i]; const need = r + o.finish < R;
      if (need && !inCut) { moves.push({ t: 'rapid', x: (R + 1) * 2, z: Math.min(2, z + 0.5) }, { t: 'feed', x: R * 2, f: o.feed }); inCut = true; }
      if (inCut && (!need || i === profile.length - 1)) { moves.push({ t: 'feed', z, f: o.feed }, { t: 'feed', x: (R + 0.5) * 2 }, { t: 'rapid', x: safe * 2 }); inCut = false; }
    }
  }
  // Finish pass along the profile.
  moves.push({ t: 'comment', text: 'Finish pass' }, { t: 'rapid', x: profile[0][1] * 2, z: 1 });
  for (const [z, r] of profile) moves.push({ t: 'feed', x: r * 2, z, f: o.finishFeed });
  moves.push({ t: 'rapid', x: safe * 2 }, { t: 'rapid', z: 2 }, { t: 'off' });
  const job = finishStats({ process: 'lathe', kind: 'lathe', moves, warnings, meta: { stock: o.stock, length: -zEnd } }, 4000);
  return job;
}

// ---------------------------------------------------------------- CLI (metal powder bed)
/** Common Layer Interface, ASCII: the open layer format read by powder-bed build processors. */
export function writeCli(layers: Layer[], name: string): string {
  const all = layers.flatMap(l => l.loops.flat()); const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const f = (v: number) => v.toFixed(4);
  const head = ['$$HEADERSTART', '$$ASCII', '$$UNITS/00000001.000000', '$$VERSION/200', `$$LABEL/1,${name.replace(/[,\n]/g, ' ')}`, `$$DATE/${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
    `$$DIMENSION/${f(Math.min(...xs, 0))},${f(Math.min(...ys, 0))},${f(0)},${f(Math.max(...xs, 0))},${f(Math.max(...ys, 0))},${f(layers[layers.length - 1]?.z ?? 0)}`, `$$LAYERS/${String(layers.length).padStart(6, '0')}`, '$$HEADEREND'];
  const body = ['$$GEOMETRYSTART'];
  for (const L of layers) {
    body.push(`$$LAYER/${f(L.z)}`);
    for (const l of L.loops) { const pts = [...l, l[0]]; body.push(`$$POLYLINE/1,${area(l) >= 0 ? 1 : 0},${pts.length},${pts.map(p => `${f(p[0])},${f(p[1])}`).join(',')}`); }
  }
  body.push('$$GEOMETRYEND');
  return [...head, ...body].join('\n') + '\n';
}

export const totalLength = (loops: Loop[]) => loops.reduce((s, l) => s + perimeter(l), 0);
export { pointInLoop };
