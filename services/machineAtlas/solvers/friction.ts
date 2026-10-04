// Pad/rotor friction with thermal fade. SIMPLIFIED empirical curves, not a pad-compound model.
export const TIER = 'S1' as const;
export const ASSUMPTIONS: string[] = [
  'SIMPLIFIED: mu is a smooth function of pad temperature only (no speed, pressure, moisture or bedding-in dependence).',
  'Fade onset ~300 C and trough ~650 C are typical of a street semi-metallic pad; real compounds differ widely.',
  'Fluid boiling points interpolate published DOT 3/4/5.1 dry and wet minimums linearly with water content.',
  'Wear uses a constant specific wear rate (Archard-style), ignoring temperature acceleration.',
];

export interface PadCompound { mu0: number; onsetC: number; troughC: number; troughFactor: number; coldFactor: number; coldC: number }
export const STREET_SEMI_METALLIC: PadCompound = { mu0: 0.42, onsetC: 300, troughC: 650, troughFactor: 0.55, coldFactor: 0.8, coldC: 40 };

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Friction coefficient vs pad temperature (C). Cold pads are slightly weak; hot pads fade. */
export function muOfTemp(T: number, c: PadCompound = STREET_SEMI_METALLIC): number {
  const cold = c.coldFactor + (1 - c.coldFactor) * smooth(T / c.coldC);
  const fade = 1 - (1 - c.troughFactor) * smooth((T - c.onsetC) / (c.troughC - c.onsetC));
  return c.mu0 * cold * fade;
}

/** Brake torque at one rotor from clamp force (N): two friction faces at effective radius reff (m). */
export const rotorTorque = (clampN: number, mu: number, reff: number) => 2 * mu * clampN * reff;

export type FluidType = 'DOT3' | 'DOT4' | 'DOT5.1';
const BOIL: Record<FluidType, { dry: number; wet: number }> = {
  DOT3: { dry: 205, wet: 140 }, DOT4: { dry: 230, wet: 155 }, 'DOT5.1': { dry: 260, wet: 180 },
};
/** Fluid boiling point (C) for water content 0..3.7 % (the wet minimum is defined at 3.7 %). */
export function fluidBoilC(type: FluidType, waterPct: number): number {
  const b = BOIL[type]; const f = Math.min(1, Math.max(0, waterPct / 3.7));
  return b.dry + (b.wet - b.dry) * f;
}

/** Lining lost (m) per joule of friction work (illustrative constant). */
export const padWear = (workJ: number, kSpecific = 6e-14) => kSpecific * workJ;
