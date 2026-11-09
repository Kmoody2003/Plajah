// One call from a drafted pattern to a draped garment: pick or build the avatar, arrange and sew
// the pieces, bake the collider, and run the solver until it settles. The UI drives `DrapeRun`
// frame by frame (CPU here, or the WebGPU solver in gpu.ts with the same model); tests and
// "try every size" call `drapeSync`.

import type { Pattern } from '../patterns';
import { type Body, type BodyMeasures, type Pose, type SdfGrid, buildBody, bakeSdf, measuresForSize, poseFor } from './avatar';
import { buildCloth, ClothSim, DEFAULT_SIM, vertexNormals, type ClothModel, type SimOptions, type PlacedPiece } from './cloth';
import { strainMap } from './fit';
import type { Pt } from '../geometry';
import { outfitRig, type FabricFor, type Rig } from './garment';

export interface DrapeSetup { pattern: Pattern; body: Body | null; sdf: SdfGrid | null; rig: Rig; model: ClothModel; /** Every garment in the outfit, innermost first (pattern is garments[0]). */ garments: Pattern[] }
export interface DrapeOptions { measures?: BodyMeasures; pose?: Pose; body?: Body; sdf?: SdfGrid; fabric?: FabricFor; spacing?: number; /** Per-garment fabric chooser for outfits. */ fabricFor?: (garment: number) => FabricFor | undefined }

export function bodyForPattern(pattern: Pattern, measures?: BodyMeasures, pose?: Pose): Body {
  return buildBody(measures ?? measuresForSize(pattern.size && /^(2T|\d+|XS|S|M|L|XL|2XL|3XL)$/.test(pattern.size) ? pattern.size : 'M'), pose ?? poseFor('a-pose'));
}

export function setupDrape(pattern: Pattern, o: DrapeOptions = {}): DrapeSetup { return setupOutfit([pattern], o); }

/** Several garments on one body, innermost first (a tee under a hoodie, leggings under a skirt). */
export function setupOutfit(garments: Pattern[], o: DrapeOptions = {}): DrapeSetup {
  const pattern = garments[0]; const sized = garments.find(g => g.size) ?? pattern;
  const body = o.body ?? bodyForPattern(sized, o.measures, o.pose);
  const rig = outfitRig(garments, body, o.fabricFor ?? (() => o.fabric));
  const useBody = rig.needsBody ? body : null; const sdf = useBody ? (o.sdf ?? bakeSdf(useBody)) : null;
  const plush = rig.kind === 'plush'; const size = Math.max(...rig.placed.map(p => Math.max(...p.seam.map(q => q[1])) - Math.min(...p.seam.map(q => q[1]))));
  const h = o.spacing ?? (plush ? Math.max(6, Math.min(16, size / 28)) : 20);
  const model = buildCloth(rig.placed, rig.seams, h, { pressure: rig.pressure, gathers: rig.gathers, attach: rig.attach });
  if (plush && pattern.fill) addFillMass(model, pattern.fill.grams, pattern.features.beads ? pattern.fill.grams * 0.4 : 0);
  return { pattern, body: useBody, sdf, rig, model, garments };
}

export function simFor(s: DrapeSetup, over: Partial<SimOptions> = {}) {
  const plush = s.rig.kind === 'plush';
  return new ClothSim(s.model, s.sdf, { ...DEFAULT_SIM, ...(plush ? { damping: 2.5, selfCollision: true, sewSpeed: 250, gravity: 0, substeps: 18 } : {}), ...over });
}

/** Run to rest on the CPU: sew, settle, then record contact for the pressure map. */
export function drapeSync(s: DrapeSetup, seconds = 2.5, over: Partial<SimOptions> = {}, onFrame?: (sim: ClothSim, f: number) => void): ClothSim {
  const sim = simFor(s, over); const frames = Math.round(seconds * 60); const rec = Math.max(6, Math.round(frames * 0.12));
  for (let f = 0; f < frames; f++) { if (f === frames - rec) sim.startRecording(); sim.frame(1 / 60); onFrame?.(sim, f); }
  return sim;
}

/**
 * Stuffing has weight (fibre fill ≈ 45 g/L, usually several times the fabric): spread it over the
 * shell by area, and any pellet pouch onto the base, so the sit test sees the real centre of mass.
 */
export function addFillMass(m: ClothModel, fillGrams: number, pelletGrams = 0) {
  let A = 0; for (let i = 0; i < m.n; i++) A += m.vArea[i];
  const base = m.pieces.find(p => p.id === 'base'); let AB = 0; if (base) for (let i = base.v0; i < base.v0 + base.vn; i++) AB += m.vArea[i];
  for (let i = 0; i < m.n; i++) { m.mass[i] += fillGrams * m.vArea[i] / A; if (base && pelletGrams && i >= base.v0 && i < base.v0 + base.vn) m.mass[i] += pelletGrams * m.vArea[i] / AB; m.invMass[i] = m.mass[i] > 0 ? 1 / m.mass[i] : 0; }
}

/**
 * Sit test for plush: the stuffed toy (sewn and stuffed with no gravity, as if held) is set on the
 * floor under gravity. It sits if it keeps 80% of its stuffed height.
 */
export function startSitTest(sim: ClothSim) {
  const X = sim.m.pos; let lo = Infinity, hi = -Infinity; for (let i = 0; i < sim.m.n; i++) { lo = Math.min(lo, X[3 * i + 1]); hi = Math.max(hi, X[3 * i + 1]); }
  // Rest it on the floor first.
  const dy = lo - (sim.m.offset[0] ?? 2) - sim.o.floor; for (let i = 0; i < sim.m.n; i++) { X[3 * i + 1] -= dy; sim.m.prev[3 * i + 1] -= dy; }
  sim.stuffedHeight = hi - lo; sim.o.gravity = 9810; sim.o.gravityAfterStuffing = sim.t - sim.pressureStart;
}
export function sitTestSync(sim: ClothSim, seconds = 2) { startSitTest(sim); for (let f = 0; f < seconds * 60; f++) sim.frame(1 / 60); return sitsUp(sim); }
export function sitsUp(sim: ClothSim) { const X = sim.m.pos; let lo = Infinity, hi = -Infinity; for (let i = 0; i < sim.m.n; i++) { lo = Math.min(lo, X[3 * i + 1]); hi = Math.max(hi, X[3 * i + 1]); } return !sim.stuffedHeight || (hi - lo) / sim.stuffedHeight > 0.8; }

/**
 * Adaptive refinement: from a first, coarse drape, find where the cloth folds (large hinge angles)
 * or stretches, and re-mesh every piece with a sizing field that goes down to `hMin` there and
 * grades smoothly (½ mm per mm) back to the coarse spacing. The fine cloth starts exactly where the
 * coarse one settled (barycentric transfer on the flat pieces), so a short settle brings out the
 * small wrinkles the coarse mesh could not hold.
 */
export function refineDrape(s: DrapeSetup, o: { hMin?: number; foldRad?: number } = {}): DrapeSetup {
  const m = s.model; const hMin = o.hMin ?? 5; const H = m.spacing; const fold = o.foldRad ?? 0.22; const nrm = vertexNormals(m); const strain = strainMap(m).vert;
  // Per-vertex wanted size: each hinge should bend ≤ `fold` radians.
  const want = new Float32Array(m.n).fill(H); const T = m.tris;
  const tn = new Float32Array(T.length); for (let t = 0; t < T.length; t += 3) { const a = T[t], b = T[t + 1], c = T[t + 2]; const X = m.pos;
    const ux = X[3 * b] - X[3 * a], uy = X[3 * b + 1] - X[3 * a + 1], uz = X[3 * b + 2] - X[3 * a + 2], vx = X[3 * c] - X[3 * a], vy = X[3 * c + 1] - X[3 * a + 1], vz = X[3 * c + 2] - X[3 * a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; tn[t] = nx / l; tn[t + 1] = ny / l; tn[t + 2] = nz / l; }
  for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) { const i = T[t + k]; const ang = Math.acos(Math.max(-1, Math.min(1, tn[t] * nrm[3 * i] + tn[t + 1] * nrm[3 * i + 1] + tn[t + 2] * nrm[3 * i + 2]))) * 2;
    let w = ang > fold ? H * fold / ang : H; if (strain[i] > 0.08) w = Math.min(w, H * 0.6); want[i] = Math.max(hMin, Math.min(want[i], w)); }
  const placed: PlacedPiece[] = s.rig.placed.map((P, pi) => {
    const C = m.pieces[pi]; const vs: number[] = []; for (let i = C.v0; i < C.v0 + C.vn; i++) vs.push(i); const R2 = m.rest2;
    const cell = Math.max(H, 10); const grid = new Map<string, number[]>(); for (const i of vs) { const k = `${Math.floor(R2[2 * i] / cell)},${Math.floor(R2[2 * i + 1] / cell)}`; const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]); }
    const near = (q: Pt, r: number) => { const out: number[] = []; const ci = Math.floor(q[0] / cell), cj = Math.floor(q[1] / cell), rr = Math.ceil(r / cell); for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) for (const i of grid.get(`${ci + di},${cj + dj}`) ?? []) out.push(i); return out; };
    const sizing = (q: Pt) => { let best = H; for (const i of near(q, (H - hMin) * 2)) best = Math.min(best, want[i] + 0.5 * Math.hypot(R2[2 * i] - q[0], R2[2 * i + 1] - q[1])); return best; };
    const tris: number[] = []; for (let t = C.t0; t < C.t0 + C.tn; t++) tris.push(t);
    const tcell = new Map<string, number[]>(); for (const t of tris) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2]; const xs = [R2[2 * a], R2[2 * b], R2[2 * c]], ys = [R2[2 * a + 1], R2[2 * b + 1], R2[2 * c + 1]];
      for (let j = Math.floor(Math.min(...ys) / cell); j <= Math.floor(Math.max(...ys) / cell); j++) for (let i = Math.floor(Math.min(...xs) / cell); i <= Math.floor(Math.max(...xs) / cell); i++) { const k = `${i},${j}`; const l = tcell.get(k); if (l) l.push(t); else tcell.set(k, [t]); } }
    const map = (q: Pt): [number, number, number] => {
      let best: [number, number, number] | null = null, bd = Infinity;
      for (const t of tcell.get(`${Math.floor(q[0] / cell)},${Math.floor(q[1] / cell)}`) ?? []) { const a = T[3 * t], b = T[3 * t + 1], c = T[3 * t + 2];
        const ax = R2[2 * a], ay = R2[2 * a + 1], bx = R2[2 * b], by = R2[2 * b + 1], cx = R2[2 * c], cy = R2[2 * c + 1]; const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(det) < 1e-9) continue;
        const l1 = ((by - cy) * (q[0] - cx) + (cx - bx) * (q[1] - cy)) / det, l2 = ((cy - ay) * (q[0] - cx) + (ax - cx) * (q[1] - cy)) / det, l3 = 1 - l1 - l2; const out = Math.max(-l1, -l2, -l3, 0);
        if (out < bd) { bd = out; best = [0, 1, 2].map(k => m.pos[3 * a + k] * l1 + m.pos[3 * b + k] * l2 + m.pos[3 * c + k] * l3) as [number, number, number]; } if (out === 0) break; }
      if (best) return best; let bi = vs[0], bdd = Infinity; for (const i of near(q, cell * 2)) { const d = Math.hypot(R2[2 * i] - q[0], R2[2 * i + 1] - q[1]); if (d < bdd) { bdd = d; bi = i; } } return [m.pos[3 * bi], m.pos[3 * bi + 1], m.pos[3 * bi + 2]];
    };
    return { ...P, map, sizing };
  });
  const model = buildCloth(placed, s.rig.seams, H, { pressure: m.pressure, gathers: s.rig.gathers, attach: s.rig.attach });
  if (s.rig.kind === 'plush' && s.pattern.fill) addFillMass(model, s.pattern.fill.grams, s.pattern.features.beads ? s.pattern.fill.grams * 0.4 : 0);
  return { ...s, rig: { ...s.rig, placed }, model };
}
