// Measuring your own fabric at home and turning it into solver numbers. Three tests need only a
// ruler, scissors, a kitchen scale and a few coins or weights:
//
//   Weight per area   cut a 10 × 10 cm square (or any rectangle), weigh it: g/m² = g ÷ area.
//   Strip stretch     cut a 5 cm wide strip, mark 10 cm apart, hang it, add a known weight,
//                     re-measure the marks; once along the grain (warp), once across (weft).
//   Cantilever bend   (Peirce / ASTM D1388) slide a 2.5 cm strip over a table edge until its tip
//                     drops to touch a line 41.5° below the edge (a folded card corner works):
//                     the overhang is twice the bending length c, and rigidity D = w·c³.
//
// The same maths runs backwards for the presets (fabrics.ts lists where each number comes from),
// and `simulateCantilever` drapes the strip in our own solver, so the numbers can be checked
// against Peirce's formula end to end.

import { rect } from '../geometry';
import { type Fabric, customFabric } from './fabrics';
import { buildCloth, ClothSim, DEFAULT_SIM } from './cloth';

const G = 9.81;
/** The ASTM D1388 cantilever angle (tip touches a 41.5° line at overhang = 2c). */
export const CANTILEVER_DEG = 41.5;

/** Weight per area (g/m²) from a weighed rectangle in cm. */
export const gsmFrom = (grams: number, widthCm: number, heightCm: number) => grams / (widthCm * heightCm) * 1e4;

/** Membrane stiffness (N/m) from a hanging strip: width (mm), gauge length (mm), stretched length (mm), added mass (g). */
export function stripStiffness(widthMm: number, gaugeMm: number, stretchedMm: number, massG: number) {
  const strain = Math.max(1e-4, (stretchedMm - gaugeMm) / gaugeMm); const force = massG / 1000 * G; return force / (widthMm / 1000) / strain;
}
/** Our "stretch %" convention: elongation under 250 N/m (fabrics.ts). */
export const stretchPctFrom = (stiffnessNm: number) => Math.min(300, 250 / stiffnessNm * 100);

/** Bending length c (mm) from a cantilever overhang (mm) at 41.5°: c = overhang / 2. */
export const bendingLength = (overhangMm: number) => overhangMm / 2;
/** Bending rigidity in KES units (gf·cm²/cm) from the overhang and weight per area: D = w·c³. */
export function rigidityKes(overhangMm: number, gsm: number) {
  const c = bendingLength(overhangMm) / 1000; const w = gsm / 1000 * G; const D = w * c ** 3; return D / 9.81e-5;
}
/** The overhang (mm) a fabric should show in the cantilever test (inverse of rigidityKes). */
export function expectedOverhang(f: Pick<Fabric, 'bend' | 'gsm'>) {
  const D = f.bend * 9.81e-5; const w = f.gsm / 1000 * G; return 2 * Math.cbrt(D / w) * 1000;
}

export interface HomeTests {
  name?: string; knit?: boolean;
  square?: { grams: number; widthCm: number; heightCm: number };
  warp?: { widthMm: number; gaugeMm: number; stretchedMm: number; massG: number };
  weft?: { widthMm: number; gaugeMm: number; stretchedMm: number; massG: number };
  cantilever?: { overhangMm: number };
  thicknessMm?: number;
}
export interface Calibration { fabric: Fabric; notes: string[] }

/** A custom fabric from whichever home tests were run; anything missing keeps the base preset's value. */
export function calibrate(t: HomeTests, base: Fabric = customFabric({})): Calibration {
  const notes: string[] = []; const f: Fabric = { ...base, id: 'custom', name: t.name || 'My fabric (measured)', knit: t.knit ?? base.knit };
  if (t.square) { f.gsm = Math.round(gsmFrom(t.square.grams, t.square.widthCm, t.square.heightCm)); notes.push(`Weight ${f.gsm} g/m² from a ${t.square.widthCm}×${t.square.heightCm} cm piece weighing ${t.square.grams} g.`); }
  for (const dir of ['warp', 'weft'] as const) { const s = t[dir]; if (!s) continue; const k = stripStiffness(s.widthMm, s.gaugeMm, s.stretchedMm, s.massG); const pct = Math.round(stretchPctFrom(k) * 10) / 10;
    if (dir === 'warp') f.stretchWarp = pct; else f.stretchWeft = pct; notes.push(`${dir === 'warp' ? 'Lengthwise' : 'Crosswise'} stiffness ${Math.round(k)} N/m (${pct}% stretch at 250 N/m).`); }
  if (t.cantilever) { f.bend = Math.round(rigidityKes(t.cantilever.overhangMm, f.gsm) * 1000) / 1000; notes.push(`Bending length ${bendingLength(t.cantilever.overhangMm).toFixed(0)} mm → rigidity ${f.bend} gf·cm²/cm.`); }
  if (t.thicknessMm) f.thickness = t.thicknessMm;
  return { fabric: f, notes };
}

/**
 * The cantilever test in our solver: a 25 mm strip on a ledge, `overhangMm` sticking out; returns
 * the angle (degrees below horizontal) from the edge to the drooped tip. For overhang = 2c it
 * should read about 41.5°.
 */
export function simulateCantilever(f: Fabric, overhangMm: number, seconds = 2.5, solver: { substeps?: number; iterations?: number } = {}) {
  const ledge = 40, W = 25, h = Math.max(2.5, Math.min(5, overhangMm / 16));
  const model = buildCloth([{ id: 'strip', name: 'Strip', pieceId: 'strip', role: 'other', seam: rect(-ledge, 0, ledge + overhangMm, W), fabric: f, grainAngle: 0, map: q => [q[0], 500, q[1]] }], [], h);
  for (let i = 0; i < model.n; i++) if (model.rest2[2 * i] <= 0.01) model.invMass[i] = 0;
  const sim = new ClothSim(model, null, { ...DEFAULT_SIM, floor: -1e6, selfCollision: false, damping: 4, substeps: solver.substeps ?? 60, iterations: solver.iterations ?? 10 });
  for (let k = 0; k < seconds * 60; k++) sim.frame(1 / 60);
  let tip = 0, tx = 0, ty = 0, cnt = 0; for (let i = 0; i < model.n; i++) tip = Math.max(tip, model.rest2[2 * i]);
  for (let i = 0; i < model.n; i++) if (model.rest2[2 * i] > tip - 0.01) { tx += model.pos[3 * i]; ty += model.pos[3 * i + 1]; cnt++; }
  tx /= cnt; ty /= cnt; return Math.atan2(500 - ty, tx) * 180 / Math.PI;
}
