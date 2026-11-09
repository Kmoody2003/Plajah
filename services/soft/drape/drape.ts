// One call from a drafted pattern to a draped garment: pick or build the avatar, arrange and sew
// the pieces, bake the collider, and run the solver until it settles. The UI drives `DrapeRun`
// frame by frame (CPU here, or the WebGPU solver in gpu.ts with the same model); tests and
// "try every size" call `drapeSync`.

import type { Pattern } from '../patterns';
import { type Body, type BodyMeasures, type Pose, type SdfGrid, buildBody, bakeSdf, measuresForSize, poseFor } from './avatar';
import { buildCloth, ClothSim, DEFAULT_SIM, type ClothModel, type SimOptions } from './cloth';
import { rigFor, type FabricFor, type Rig } from './garment';

export interface DrapeSetup { pattern: Pattern; body: Body | null; sdf: SdfGrid | null; rig: Rig; model: ClothModel }
export interface DrapeOptions { measures?: BodyMeasures; pose?: Pose; body?: Body; sdf?: SdfGrid; fabric?: FabricFor; spacing?: number }

export function bodyForPattern(pattern: Pattern, measures?: BodyMeasures, pose?: Pose): Body {
  return buildBody(measures ?? measuresForSize(pattern.size && /^(2T|\d+|XS|S|M|L|XL|2XL|3XL)$/.test(pattern.size) ? pattern.size : 'M'), pose ?? poseFor('a-pose'));
}

export function setupDrape(pattern: Pattern, o: DrapeOptions = {}): DrapeSetup {
  const body = o.body ?? bodyForPattern(pattern, o.measures, o.pose);
  const rig = rigFor(pattern, body, o.fabric);
  const useBody = rig.needsBody ? body : null; const sdf = useBody ? (o.sdf ?? bakeSdf(useBody)) : null;
  const plush = rig.kind === 'plush'; const size = Math.max(...rig.placed.map(p => Math.max(...p.seam.map(q => q[1])) - Math.min(...p.seam.map(q => q[1]))));
  const h = o.spacing ?? (plush ? Math.max(6, Math.min(16, size / 28)) : 20);
  const model = buildCloth(rig.placed, rig.seams, h, { pressure: rig.pressure });
  if (plush && pattern.fill) addFillMass(model, pattern.fill.grams, pattern.features.beads ? pattern.fill.grams * 0.4 : 0);
  return { pattern, body: useBody, sdf, rig, model };
}

export function simFor(s: DrapeSetup, over: Partial<SimOptions> = {}) {
  const plush = s.rig.kind === 'plush';
  return new ClothSim(s.model, s.sdf, { ...DEFAULT_SIM, ...(plush ? { damping: 2.5, selfCollision: true, sewSpeed: 250, gravity: 0, substeps: 18 } : {}), ...over });
}

/** Run to rest on the CPU: sew, settle, then record contact for the pressure map. */
export function drapeSync(s: DrapeSetup, seconds = 2.5, over: Partial<SimOptions> = {}, onFrame?: (sim: ClothSim, f: number) => void): ClothSim {
  const sim = simFor(s, over); const frames = Math.round(seconds * 60); const rec = Math.max(6, Math.round(frames * 0.12));
  for (let f = 0; f < frames; f++) { if (f === frames - rec) { sim.recordContact = true; sim.contact.fill(0); sim.contactSteps = 0; } sim.frame(1 / 60); onFrame?.(sim, f); }
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
