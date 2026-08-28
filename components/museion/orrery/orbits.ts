// orbits — real Keplerian mechanics for the orrery.
//
// The module drew every planet on a perfect circle in a single flat plane. That
// is the most visible lie in the scene: no orbit in the solar system is circular
// and no two share a plane, and the eye reads the uniformity as a diagram long
// before it reads the textures as planets.
//
// This does it properly — ellipses, with each planet's real eccentricity,
// inclination, ascending node and perihelion direction, positioned by solving
// Kepler's equation.
//
// ── The one deliberate departure from reality ────────────────────────────────
// DISTANCES STAY ARTISTIC. A true-to-scale solar system is almost entirely empty
// space: if Earth sits at 1 screen unit, Neptune is 30 units out and every planet
// is a sub-pixel speck. So the module's hand-chosen semi-major axes are kept as
// the scale, and real SHAPE is applied to them. The result is a scene you can
// actually read where every orbit is genuinely elliptical, tilted, and pointed
// the right way. Sizes are likewise artistic for the same reason.
//
// Pure module — no three.js, no React — so the mechanics can be tested headlessly.

const DEG = Math.PI / 180;

export interface OrbitalElements {
  /** Eccentricity: 0 is a circle, and nothing here is 0. */
  e: number;
  /** Inclination to the ecliptic, radians. */
  i: number;
  /** Longitude of the ascending node, radians — where the orbit crosses upward. */
  node: number;
  /** Longitude of perihelion, radians — which way the ellipse points. */
  peri: number;
  /** Orbital period in Earth years. Sets the relative speeds. */
  period: number;
  /** Mean longitude at J2000, radians — so the planets start where they really were. */
  epochL: number;
}

/**
 * J2000 elements, from the JPL approximate-positions tables. Only the shape and
 * orientation terms are used; the semi-major axis comes from the scene layout
 * for the reason given above.
 */
export const ELEMENTS: Record<string, OrbitalElements> = {
  Mercury: { e: 0.20563, i: 7.005 * DEG, node: 48.331 * DEG, peri: 77.456 * DEG, period: 0.2408, epochL: 252.251 * DEG },
  Venus:   { e: 0.00677, i: 3.395 * DEG, node: 76.680 * DEG, peri: 131.533 * DEG, period: 0.6152, epochL: 181.980 * DEG },
  Earth:   { e: 0.01671, i: 0.000 * DEG, node: -11.261 * DEG, peri: 102.947 * DEG, period: 1.0000, epochL: 100.464 * DEG },
  Mars:    { e: 0.09340, i: 1.850 * DEG, node: 49.558 * DEG, peri: 336.041 * DEG, period: 1.8808, epochL: 355.453 * DEG },
  Jupiter: { e: 0.04839, i: 1.304 * DEG, node: 100.464 * DEG, peri: 14.331 * DEG, period: 11.862, epochL: 34.396 * DEG },
  Saturn:  { e: 0.05386, i: 2.485 * DEG, node: 113.666 * DEG, peri: 93.057 * DEG, period: 29.457, epochL: 49.954 * DEG },
  Uranus:  { e: 0.04726, i: 0.773 * DEG, node: 74.010 * DEG, peri: 173.005 * DEG, period: 84.011, epochL: 313.238 * DEG },
  Neptune: { e: 0.00859, i: 1.770 * DEG, node: 131.784 * DEG, peri: 48.124 * DEG, period: 164.79, epochL: 304.880 * DEG },
};

/**
 * Kepler's equation, M = E − e·sin E, solved for E.
 *
 * There is no closed form, so this is Newton–Raphson. For every eccentricity in
 * this solar system (the worst is Mercury at 0.21) it converges to well under a
 * pixel in three or four passes; the iteration cap is a guard, not a budget.
 */
export function solveKepler(M: number, e: number, tol = 1e-8, maxIter = 12): number {
  // Wrap into −π..π, where the initial guess below is best conditioned.
  let m = M % (Math.PI * 2);
  if (m > Math.PI) m -= Math.PI * 2;
  if (m < -Math.PI) m += Math.PI * 2;

  let E = m + e * Math.sin(m) * (1 + e * Math.cos(m));   // standard warm start
  for (let n = 0; n < maxIter; n++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < tol) break;
  }
  return E;
}

/**
 * Where a planet is, in scene units.
 *
 * `a` is the scene's semi-major axis (artistic), `t` is elapsed time in Earth
 * years. The ellipse is built in its own plane and then rotated by perihelion,
 * inclination and node — in that order, which is what puts each orbit on its own
 * correctly-tilted plane rather than all of them flat.
 *
 * Returns three.js coordinates: the ecliptic lies in XZ and Y is "up", so the
 * inclinations show as the vertical spread the scene was missing.
 */
export function orbitalPosition(
  el: OrbitalElements, a: number, t: number,
): [number, number, number] {
  const M = el.epochL - el.peri + (Math.PI * 2 * t) / el.period;
  const E = solveKepler(M, el.e);

  // Position in the orbital plane, with the focus (the Sun) at the origin —
  // which is the whole point of an ellipse and what a circle gets wrong: the
  // planet is genuinely nearer the Sun at perihelion.
  const b = a * Math.sqrt(1 - el.e * el.e);
  const px = a * (Math.cos(E) - el.e);
  const pz = b * Math.sin(E);

  // Argument of perihelion, measured from the ascending node.
  const w = el.peri - el.node;
  const cw = Math.cos(w), sw = Math.sin(w);
  const x1 = px * cw - pz * sw;
  const z1 = px * sw + pz * cw;

  // Tilt out of the ecliptic.
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const y2 = z1 * si;
  const z2 = z1 * ci;

  // Swing to the ascending node.
  const cn = Math.cos(el.node), sn = Math.sin(el.node);
  return [x1 * cn - z2 * sn, y2, x1 * sn + z2 * cn];
}

/**
 * The orbit's traced path, as a flat XYZ array ready for a line geometry.
 *
 * Sampled in ECCENTRIC ANOMALY rather than time, which spaces points evenly
 * around the ellipse. Sampling in time would crowd them at aphelion, where the
 * planet moves slowest, and visibly thin the line at perihelion.
 */
export function orbitPath(el: OrbitalElements, a: number, segments = 256): Float32Array {
  const out = new Float32Array((segments + 1) * 3);
  const b = a * Math.sqrt(1 - el.e * el.e);
  const w = el.peri - el.node;
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const cn = Math.cos(el.node), sn = Math.sin(el.node);

  for (let s = 0; s <= segments; s++) {
    const E = (s / segments) * Math.PI * 2;
    const px = a * (Math.cos(E) - el.e);
    const pz = b * Math.sin(E);
    const x1 = px * cw - pz * sw;
    const z1 = px * sw + pz * cw;
    const y2 = z1 * si;
    const z2 = z1 * ci;
    out[s * 3] = x1 * cn - z2 * sn;
    out[s * 3 + 1] = y2;
    out[s * 3 + 2] = x1 * sn + z2 * cn;
  }
  return out;
}

/** Axial tilt in radians — why Uranus rolls and why Earth has seasons. */
export const AXIAL_TILT: Record<string, number> = {
  Sun: 7.25 * DEG,
  Mercury: 0.034 * DEG,
  Venus: 177.36 * DEG,      // retrograde: it is effectively upside down
  Earth: 23.44 * DEG,
  Mars: 25.19 * DEG,
  Jupiter: 3.13 * DEG,
  Saturn: 26.73 * DEG,
  Uranus: 97.77 * DEG,      // the oddity — it orbits on its side
  Neptune: 28.32 * DEG,
};

/** Sidereal day in Earth days. Negative means it spins backwards. */
export const ROTATION_PERIOD: Record<string, number> = {
  Sun: 25.38,
  Mercury: 58.646,
  Venus: -243.025,
  Earth: 0.99727,
  Mars: 1.02595,
  Jupiter: 0.41354,
  Saturn: 0.44401,
  Uranus: -0.71833,
  Neptune: 0.67125,
};
