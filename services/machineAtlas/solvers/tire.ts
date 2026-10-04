// Longitudinal tire force vs slip: "Pacejka-lite" (Magic Formula without load/camber/speed terms).
export const TIER = 'S1' as const;
export const ASSUMPTIONS: string[] = [
  'SIMPLIFIED: Magic-Formula-shaped curve, pure longitudinal slip, constant normal load, no transients (no relaxation length).',
  'Surface coefficients (dry, wet, snow, ice) are illustrative, not measured.',
  'Quarter-car model: one wheel carrying one quarter of the vehicle mass; no weight transfer.',
];

export interface Surface { id: string; label: string; B: number; C: number; D: number; E: number }
export const SURFACES: Record<string, Surface> = {
  dry: { id: 'dry', label: 'Dry asphalt', B: 10, C: 1.9, D: 1.0, E: 0.97 },
  wet: { id: 'wet', label: 'Wet asphalt', B: 12, C: 2.0, D: 0.7, E: 0.9 },
  snow: { id: 'snow', label: 'Packed snow (low mu)', B: 9, C: 1.6, D: 0.32, E: 0.3 },
  ice: { id: 'ice', label: 'Ice (very low mu)', B: 8, C: 1.6, D: 0.12, E: 0.3 },
};

/** Friction coefficient for slip ratio s in [0,1] (braking, positive). */
export function mu(s: number, sf: Surface): number {
  const x = sf.B * s;
  return sf.D * Math.sin(sf.C * Math.atan(x - sf.E * (x - Math.atan(x))));
}

/** Slip at which mu peaks (numeric scan) and the locked-wheel (s = 1) value. */
export function peakAndSlide(sf: Surface): { sPeak: number; muPeak: number; muSlide: number } {
  let sp = 0, mp = 0;
  for (let s = 0.005; s <= 1; s += 0.005) { const m = mu(s, sf); if (m > mp) { mp = m; sp = s; } }
  return { sPeak: sp, muPeak: mp, muSlide: mu(1, sf) };
}
