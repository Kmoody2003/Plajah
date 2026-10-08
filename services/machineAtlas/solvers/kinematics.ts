// S0 kinematic helpers: closed-form constraints, no dynamics.
export const TIER = 'S0' as const;
export const ASSUMPTIONS: string[] = [
  'Rigid bodies, no compliance, no friction, no inertia: motion is a pure function of the input angle/stroke.',
  'Animated for understanding, not for dimensioning.',
];

/** Lever: input arm travel -> output arm travel (small-angle linear ratio). */
export const leverOut = (inTravel: number, ratio: number) => inTravel / ratio;

/** Crank-slider: slider position for crank angle (rad). r = crank radius, l = rod length. */
export function crankSlider(theta: number, r: number, l: number): number {
  const s = (r / l) * Math.sin(theta);
  return r * Math.cos(theta) + l * Math.sqrt(Math.max(0, 1 - s * s));
}

/** Gear train output angle for input angle and tooth counts (external mesh flips sign). */
export const gearOut = (thetaIn: number, teethIn: number, teethOut: number) => -thetaIn * (teethIn / teethOut);

/** Wheel angle advanced by speed (m/s) over dt for rolling radius r. */
export const wheelAngle = (angle: number, speed: number, r: number, dt: number) => (angle + (speed / r) * dt) % (Math.PI * 2);

/** Drum brake leading (self-energising) shoe factor: C = 2 mu / (1 - k mu); k is a geometry factor. */
export function leadingShoeFactor(mu: number, k = 1.2): number {
  const d = 1 - k * mu;
  return d <= 0.02 ? Infinity : (2 * mu) / d;
}
/** Trailing shoe factor: C = 2 mu / (1 + k mu). */
export const trailingShoeFactor = (mu: number, k = 1.2) => (2 * mu) / (1 + k * mu);
/** Disc brake pair factor: C = 2 mu (no self-energising). */
export const discFactor = (mu: number) => 2 * mu;
