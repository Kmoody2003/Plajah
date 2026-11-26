// Physics-accurate stream, river, waterfall, pool and swamp water sampling + Archimedes buoyancy & hydrodynamic drag.
// Pure math (zero DOM/WebGPU dependency) so both runtime gameplay (player.ts, world/index.ts) and unit tests share it.
import { GREAT_FALLS, NEON_FALLS, POOL_FALLS, POOL_STREAM, RIVER, WATER_Y, polyNear } from './world/layout';

export type WaterKind = 'clean' | 'rapids' | 'waterfall' | 'swamp';

export interface WaterSample {
  /** World Y height of the water surface (m). */
  y: number;
  /** Water column depth above the bed/ground (m, >= 0). */
  depth: number;
  /** Downstream current velocity vector (m/s). */
  flowX: number;
  flowY: number;
  flowZ: number;
  /** Speed magnitude of horizontal current (m/s). */
  speed: number;
  /** 0..1 whitewater / plunge turbulence (adds surface chop and splash rate). */
  turbulence: number;
  /** Clean stream/pool, whitewater rapids, falling waterfall curtain, or murky mire swamp. */
  kind: WaterKind;
}

const SURF = 0.85;
const HOLLOW_POOL = { x: 30, z: 60, r: 16.5, y: -1.1 };

const sm = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

type Pts = readonly (readonly number[])[];
const STREAM_LINES: readonly [Pts, number, readonly { lip: number; foot: number }[]][] = [
  [RIVER, 1.5, [NEON_FALLS, GREAT_FALLS]],
  [POOL_STREAM, 0.8, [POOL_FALLS]],
];

const steepSeg = (a: readonly number[], b: readonly number[]) =>
  Math.abs(b[2] - a[2]) / Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1])) > 0.5;

/**
 * Sample physics-accurate water surface height, depth, downstream flow velocity and turbulence at (x, z).
 * Matches the visual stream ribbon hydrology in world/water.ts (bed grade, Venturi narrowing, parabolic bank-to-center
 * flow profile, waterfall lip rush, plunge boil, Hollow Waterfall Pool, and Violet Vale / Mangrove Mire).
 */
export function sampleWaterAt(x: number, z: number, groundY: number, wilds = true): WaterSample | null {
  // 1 — Elderwood Hollow Waterfall Pool (always present, both ?classic and Wilds)
  const pd = Math.hypot(x - HOLLOW_POOL.x, z - HOLLOW_POOL.z);
  if (pd < HOLLOW_POOL.r && groundY < HOLLOW_POOL.y + 0.08) {
    const depth = Math.max(0, HOLLOW_POOL.y - groundY);
    // gentle radial outflow away from the waterfall cascade on the north side of the pool
    const dx = x - HOLLOW_POOL.x, dz = z - (HOLLOW_POOL.z - 8);
    const l = Math.hypot(dx, dz) || 1;
    const spd = 1.4 * (1 - sm(2, HOLLOW_POOL.r, pd));
    return {
      y: HOLLOW_POOL.y,
      depth,
      flowX: (dx / l) * spd,
      flowY: 0,
      flowZ: (dz / l) * spd,
      speed: spd,
      turbulence: 0.25 * (1 - sm(0, 10, pd)),
      kind: 'clean',
    };
  }

  if (!wilds) return null;

  // 2 — Wilds flowing river & pool stream ribbons
  for (const [pts, pad, falls] of STREAM_LINES) {
    const n = polyNear(pts, x, z);
    const a = pts[n.i];
    const b = pts[Math.min(pts.length - 1, n.i + 1)];
    const width = a[3] + (b[3] - a[3]) * n.t;
    const halfW = width * 0.5 + pad;
    if (n.d > halfW) continue;

    const surfY = a[2] + (b[2] - a[2]) * n.t + SURF;
    const depth = Math.max(0, surfY - groundY);
    // skip high canyon bridges/banks well above the water surface
    if (groundY > surfY + 0.15) continue;

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const segL = Math.hypot(dx, dz) || 1;
    const ux = dx / segL;
    const uz = dz / segL;
    const grade = Math.max(0, (a[2] - b[2]) / segL);
    const isSteep = steepSeg(a, b);

    // Parabolic channel profile: fastest in midstream, slower eddies near the banks (boundary-layer friction)
    const across = Math.min(1, n.d / Math.max(0.5, halfW));
    const bankProfile = 0.42 + 0.58 * (1 - across * across);

    // Hydrodynamic speed (m/s): base stream pace + slope gravity + Venturi narrowing speedup
    let spd = (1.6 + Math.min(grade, 0.08) * 58) * Math.min(1.55, Math.max(0.7, Math.sqrt(10 / Math.max(2, width))));
    // Waterfall lip rush & plunge boil
    let boil = 0;
    for (const f of falls) {
      const lip = pts[f.lip], foot = pts[f.foot];
      const dLip = Math.hypot(x - lip[0], z - lip[1]);
      const dFoot = Math.hypot(x - foot[0], z - foot[1]);
      spd *= 1 + sm(28, 0, dLip) * 0.85;
      boil = Math.max(boil, sm(26, 0, dFoot));
    }
    spd *= bankProfile;

    const turbulence = isSteep ? 1.0 : Math.min(1, sm(0.016, 0.045, grade) * 0.8 + boil * 0.75);
    const kind: WaterKind = isSteep ? 'waterfall' : turbulence > 0.45 ? 'rapids' : 'clean';
    return {
      y: surfY,
      depth,
      flowX: ux * spd,
      flowY: isSteep ? -Math.min(12, Math.abs(a[2] - b[2]) * 0.35) : 0,
      flowZ: uz * spd,
      speed: spd,
      turbulence,
      kind,
    };
  }

  // 3 — Violet Vale & Mangrove Mire standing swamp water
  if (Math.abs(z - 620) < 380 && groundY < WATER_Y + 0.05) {
    const depth = Math.max(0, WATER_Y - groundY);
    // subtle southward drainage drift toward the lake outlet
    return {
      y: WATER_Y,
      depth,
      flowX: 0,
      flowY: 0,
      flowZ: 0.25,
      speed: 0.25,
      turbulence: 0.06,
      kind: 'swamp',
    };
  }

  return null;
}

export interface BuoyancyState {
  /** Vertical velocity (m/s) — updated in place. */
  vy: number;
  /** Horizontal velocity x/z (m/s) — updated in place. */
  vx: number;
  vz: number;
  /** Submerged fraction 0..1 (0 dry, 1 fully underwater). */
  submerged: number;
  /** True when water reaches chest depth and swimming controls engage. */
  swimming: boolean;
  /** True when head/eyes are below the water surface. */
  underwater: boolean;
}

export interface BuoyancyInput {
  feetY: number;
  bodyHeight: number;
  vx: number;
  vy: number;
  vz: number;
  /** Desired swim horizontal velocity (world m/s) from player input. */
  wishX: number;
  wishZ: number;
  /** Desired swim vertical thrust (-1 dive, 0 neutral surface float, +1 swim up). */
  swimVertical: number;
  gravity: number;
  dt: number;
  water: WaterSample;
  clock: number;
}

/**
 * Integrate one physics step of Archimedes buoyancy, stream current advection, and quadratic hydrodynamic drag.
 * Returns updated velocities and immersion flags.
 */
export function stepWaterBuoyancy(inp: BuoyancyInput): BuoyancyState {
  const { feetY, bodyHeight, water, gravity, dt, clock } = inp;
  // Subtle surface wave chop (stronger in whitewater rapids)
  const wave = Math.sin(clock * 2.8 + water.flowX * 0.6) * (0.04 + water.turbulence * 0.09);
  const surfY = water.y + wave;
  const subDepth = Math.max(0, surfY - feetY);
  const submerged = Math.min(1, subDepth / Math.max(0.5, bodyHeight));
  const swimming = subDepth >= bodyHeight * 0.56; // chest-deep (~1.01 m on a 1.8 m body)
  const underwater = surfY > feetY + bodyHeight * 0.86;

  let vx = inp.vx;
  let vy = inp.vy;
  let vz = inp.vz;

  if (swimming) {
    // 1 — Archimedes buoyancy: buoyant equilibrium holds chin just above surface (submerged ≈ 0.78) when neutral
    const neutralSub = 0.76;
    const buoyancyRatio = 1.0 / neutralSub; // ~1.315 -> floats smoothly at chest/neck level
    const netVerticalAccel = gravity * (buoyancyRatio * submerged - 1.0);
    // Active swim up/down thrust
    const swimAccelY = inp.swimVertical > 0 ? 15.5 * inp.swimVertical : inp.swimVertical < 0 ? 13.5 * inp.swimVertical : 0;
    // Vertical hydrodynamic damping (prevents wild spring oscillation at the surface)
    const relVy = vy - water.flowY;
    const dragY = -relVy * (3.6 + 0.55 * Math.abs(relVy));
    vy += (netVerticalAccel + swimAccelY + dragY) * dt;
    // Clamp vertical swim speed
    vy = Math.max(-9.5, Math.min(9.5, vy));

    // 2 — Horizontal stream current advection + swim propulsion + quadratic water drag
    const targetVx = water.flowX + inp.wishX;
    const targetVz = water.flowZ + inp.wishZ;
    const relVx = vx - targetVx;
    const relVz = vz - targetVz;
    const relSpd = Math.hypot(relVx, relVz);
    const dragK = 3.2 + 0.35 * relSpd + water.turbulence * 1.1;
    vx -= relVx * Math.min(1, dragK * dt);
    vz -= relVz * Math.min(1, dragK * dt);
  } else if (submerged > 0.16) {
    // Wading: stream current gently pushes you downstream and water adds drag proportional to submerged depth
    const pushK = submerged * 2.2;
    vx += (water.flowX - vx * 0.25) * Math.min(0.6, pushK * dt);
    vz += (water.flowZ - vz * 0.25) * Math.min(0.6, pushK * dt);
  }

  return { vx, vy, vz, submerged, swimming, underwater };
}
