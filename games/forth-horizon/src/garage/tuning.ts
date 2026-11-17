// Tuning: eleven sliders per car that nudge the real physics numbers. Every one is a trade-off with a sweet spot, and none can match a better part,
// so tuning rewards care and parts still matter. All effects are small and bounded; see `applyTune`.
import type { CarSpec } from '../manufacturers';

export interface Tune {
  tirePsi: number;      // hot pressure, psi
  camber: number;       // degrees (negative leans the top of the wheel in)
  finalDrive: number;   // x the final drive ratio
  spring: number;       // x spring rate
  damper: number;       // x damping
  antiRoll: number;     // x anti-roll
  rideMm: number;       // ride height change, mm
  downforce: number;    // % of the aero kit's downforce
  brakeBias: number;    // % to the front
  brakePress: number;   // % brake pressure
  diffLock: number;     // % lock on power
}

export interface TuneRange { key: keyof Tune; label: string; unit: string; min: number; max: number; step: number; group: 'Tyres' | 'Gearing' | 'Suspension' | 'Aero' | 'Brakes' | 'Differential'; help: string }
export const TUNE_RANGES: TuneRange[] = [
  { key: 'tirePsi', label: 'Tyre pressure', unit: 'psi', min: 24, max: 42, step: 0.5, group: 'Tyres', help: 'Grip peaks near the pressure that suits the car\'s weight. Too low and the sidewalls fold, too high and the contact patch shrinks.' },
  { key: 'camber', label: 'Camber', unit: '°', min: -4, max: 0, step: 0.1, group: 'Tyres', help: 'A little negative camber keeps the tyre flat in corners. Too much wears the inside edge and loses straight-line grip.' },
  { key: 'finalDrive', label: 'Final drive', unit: 'x', min: 0.85, max: 1.2, step: 0.01, group: 'Gearing', help: 'Higher: quicker acceleration, lower top speed. Lower: the opposite.' },
  { key: 'spring', label: 'Spring rate', unit: 'x', min: 0.7, max: 1.4, step: 0.02, group: 'Suspension', help: 'Stiffer is sharper on smooth tarmac and harsher over kerbs and gravel.' },
  { key: 'damper', label: 'Damping', unit: 'x', min: 0.7, max: 1.4, step: 0.02, group: 'Suspension', help: 'Controls how fast the body settles after a bump.' },
  { key: 'antiRoll', label: 'Anti-roll bar', unit: 'x', min: 0.5, max: 1.5, step: 0.02, group: 'Suspension', help: 'Stiffer reduces body roll in corners but unsettles the car over bumps.' },
  { key: 'rideMm', label: 'Ride height', unit: 'mm', min: -30, max: 40, step: 1, group: 'Suspension', help: 'Lower: more grip and lower centre of gravity. Too low and the car bottoms out.' },
  { key: 'downforce', label: 'Downforce', unit: '%', min: 0, max: 100, step: 1, group: 'Aero', help: 'More grip in fast corners, but drag cuts top speed. Only matters with an aero kit fitted.' },
  { key: 'brakeBias', label: 'Brake balance', unit: '% front', min: 50, max: 75, step: 1, group: 'Brakes', help: 'More front brakes is stable but pushes wide. More rear can spin the car on entry.' },
  { key: 'brakePress', label: 'Brake pressure', unit: '%', min: 70, max: 110, step: 1, group: 'Brakes', help: 'Maximum pedal force. Too high locks the wheels.' },
  { key: 'diffLock', label: 'Differential lock', unit: '%', min: 0, max: 100, step: 1, group: 'Differential', help: 'More lock puts power down out of corners but fights the car turning in.' },
];

export const tuneRange = (k: keyof Tune): TuneRange => TUNE_RANGES.find((r) => r.key === k)!;
export const clampTune = (t: Tune): Tune => {
  const o = { ...t };
  for (const r of TUNE_RANGES) o[r.key] = Math.min(r.max, Math.max(r.min, Number.isFinite(o[r.key]) ? o[r.key] : r.min));
  return o;
};

/** the tyre pressure that suits a car of this mass */
export const optimalPsi = (massKg: number): number => 28 + massKg / 450;
const optimalLock = (d: CarSpec['drivetrain']): number => (d === 'RWD' ? 60 : d === 'AWD' ? 50 : 35);

export function defaultTune(massKg: number, drivetrain: CarSpec['drivetrain']): Tune {
  return {
    tirePsi: Math.round(optimalPsi(massKg) * 2) / 2, camber: -1.0, finalDrive: 1, spring: 1, damper: 1, antiRoll: 1, rideMm: 0, downforce: 70, brakeBias: 62, brakePress: 100, diffLock: optimalLock(drivetrain) - 10,
  };
}

export const TUNE_PRESETS: { id: string; label: string; blurb: string; make: (base: Tune, massKg: number, dt: CarSpec['drivetrain']) => Tune }[] = [
  { id: 'balanced', label: 'Balanced', blurb: 'The all-rounder.', make: (_b, m, d) => defaultTune(m, d) },
  { id: 'grip', label: 'Max grip', blurb: 'Circuit grip: stiff, low, lots of downforce.', make: (_b, m, d) => ({ ...defaultTune(m, d), camber: -2.0, tirePsi: Math.round(optimalPsi(m) * 2) / 2, spring: 1.15, damper: 1.15, antiRoll: 1.1, rideMm: -15, downforce: 90, diffLock: optimalLock(d) }) },
  { id: 'speed', label: 'Top speed', blurb: 'Long straights: tall gearing, little downforce.', make: (_b, m, d) => ({ ...defaultTune(m, d), finalDrive: 0.92, downforce: 25, rideMm: -5 }) },
  { id: 'launch', label: 'Acceleration', blurb: 'Tight streets: short gearing.', make: (_b, m, d) => ({ ...defaultTune(m, d), finalDrive: 1.12, downforce: 60 }) },
  { id: 'drift', label: 'Drift', blurb: 'Loose rear, locked diff.', make: (_b, m, d) => ({ ...defaultTune(m, d), brakeBias: 55, diffLock: 90, antiRoll: 0.8, camber: -3.0 }) },
  { id: 'offroad', label: 'Off-road', blurb: 'Soft and tall for gravel and dirt.', make: (_b, m, d) => ({ ...defaultTune(m, d), spring: 0.8, damper: 0.85, antiRoll: 0.65, rideMm: 35, tirePsi: Math.round((optimalPsi(m) - 4) * 2) / 2, camber: -0.5, diffLock: optimalLock(d) + 15 }) },
  { id: 'wet', label: 'Wet', blurb: 'Softer, higher downforce, gentler brakes.', make: (_b, m, d) => ({ ...defaultTune(m, d), tirePsi: Math.round((optimalPsi(m) - 2) * 2) / 2, spring: 0.9, damper: 0.95, downforce: 85, brakePress: 90, diffLock: optimalLock(d) - 15 }) },
];

/** applies a tune to a spec (a copy is returned) */
export function applyTune(spec: CarSpec, tune: Tune, baseMass = spec.massKg): CarSpec {
  const t = clampTune(tune), s: CarSpec = structuredClone(spec);
  const psiOpt = optimalPsi(baseMass);
  let grip = 0;
  grip += Math.max(-0.04, 0.01 - 0.0007 * (t.tirePsi - psiOpt) ** 2);
  grip += Math.max(-0.02, 0.012 - 0.004 * (t.camber + 2.0) ** 2);
  grip += -t.rideMm * 0.0003;
  grip +=Math.max(-0.015, 0.012 - 0.000008 * (t.diffLock - optimalLock(s.drivetrain)) ** 2);
  // aero: the kit's downforce is scaled; drag follows it
  const dfScale = t.downforce / 70;
  s.aeroDownforce = Math.max(0, s.aeroDownforce * dfScale);
  const dragK = 1 - 0.03 * ((t.downforce - 70) / 30) * Math.min(1, s.aeroDownforce / 3 + 0.3);
  s.corneringGrip = Math.max(0.5, s.corneringGrip + grip);
  s.finalDrive *= t.finalDrive;
  s.topSpeedMps *= Math.pow(t.finalDrive, -0.45) * dragK;
  s.suspension.springRateNm *= t.spring;
  s.suspension.damperNsM *= t.damper;
  s.suspension.antiRollFactor *= t.antiRoll;
  s.suspension.rideHeightM = Math.max(0.04, s.suspension.rideHeightM + t.rideMm / 1000);
  s.brakes.frontBias = t.brakeBias / 100;
  s.brakes.maxTorqueNm *= t.brakePress / 100;
  // brakes that grab too hard lock the wheels: past 100% pressure the extra does not stop the car faster
  if (t.brakePress > 100) s.brakes.maxTorqueNm = spec.brakes.maxTorqueNm * (1 + (t.brakePress - 100) / 100 * 0.35);
  return s;
}
