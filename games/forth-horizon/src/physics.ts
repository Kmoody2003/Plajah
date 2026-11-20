import * as THREE from 'three/webgpu';
import type { CarSpec } from './manufacturers';
import type { BoxCollider, SurfaceType } from './world';

export interface CarInput {
  throttle: number;  // 0..1
  brake: number;     // 0..1
  steer: number;     // -1 (right) .. +1 (left)
  handbrake: boolean;
}

export interface CarState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  verticalVel: number;
  yaw: number;          // radians, 0 = +Z
  angularVel: number;
  steerAngle: number;   // visual front wheel angle (rad)
  steerInputSmoothed: number; // -1..1 Forza-style filtered steering
  wheelSpin: number;
  // [FL, FR, RL, RR] suspension compression in meters (0 = neutral, + = compressed)
  wheelCompression: [number, number, number, number];
  wheelCompVel: [number, number, number, number];
  wheelLoadN: [number, number, number, number];
  wheelSlip: [number, number, number, number];
  // [FL, FR, RL, RR] normalized brake rotor heat (0..1)
  brakeTemp: [number, number, number, number];
  speedMps: number;
  forwardSpeed: number;
  lateralSpeed: number;
  rpm: number;
  gear: number;         // 1..6, 0 = N, -1 = R
  turboBoost: number;   // 0..1
  shiftTimer: number;   // >0 during clutch/gear cut
  isDrifting: boolean;
  isBraking: boolean;
  isAirborne: boolean;
  suspensionImpact: number; // 0..1 impulse on landing / curb strike
  backfireEvent: boolean;   // 1-frame pulse for exhaust pop & flame
  surface: SurfaceType;
  pitch: number;
  roll: number;
  prevThrottle: number;
  prevGear: number;
  prevCornerGround: [number, number, number, number];
}

export function createCarState(x = 0, y = 0, z = 180, yaw = Math.PI * 0.5): CarState {
  return {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    verticalVel: 0,
    yaw,
    angularVel: 0,
    steerAngle: 0,
    steerInputSmoothed: 0,
    wheelSpin: 0,
    wheelCompression: [0, 0, 0, 0],
    wheelCompVel: [0, 0, 0, 0],
    wheelLoadN: [3600, 3600, 3600, 3600],
    wheelSlip: [0, 0, 0, 0],
    brakeTemp: [0, 0, 0, 0],
    speedMps: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    rpm: 950,
    gear: 1,
    turboBoost: 0,
    shiftTimer: 0,
    isDrifting: false,
    isBraking: false,
    isAirborne: false,
    suspensionImpact: 0,
    backfireEvent: false,
    surface: 'asphalt',
    pitch: 0,
    roll: 0,
    prevThrottle: 0,
    prevGear: 1,
    prevCornerGround: [y, y, y, y],
  };
}

const GRAVITY = 9.81;

function sampleTorqueCurve(curve: readonly number[], rpmFrac: number): number {
  const f = THREE.MathUtils.clamp(rpmFrac, 0, 1) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(f));
  const frac = f - i;
  return THREE.MathUtils.lerp(curve[i], curve[i + 1], frac);
}

/** the drivable world's edges (default: the original 10-mile macro region). The region game sets them from its height grid, whose origin moves as the map grows. */
const WORLD_BOUNDS = { minX: -8550, maxX: 8750, minZ: -5550, maxZ: 5550 };
export function setWorldBounds(minX: number, maxX: number, minZ: number, maxZ: number): void { Object.assign(WORLD_BOUNDS, { minX, maxX, minZ, maxZ }); }

export function stepCarPhysics(
  state: CarState,
  spec: CarSpec,
  input: CarInput,
  dt: number,
  terrainHeight: (x: number, z: number) => number,
  surfaceAt: (x: number, z: number) => SurfaceType,
  colliders: BoxCollider[]
): void {
  const safeDt = Math.min(dt, 0.05);
  if (safeDt <= 1e-6) return;

  state.surface = surfaceAt(state.pos.x, state.pos.z);
  state.backfireEvent = false;
  state.suspensionImpact = Math.max(0, state.suspensionImpact - safeDt * 4.5);

  const isOffroadSpec = spec.suspension.travelM >= 0.22 || spec.vehicleClass === 'buggy' || spec.vehicleClass === 'rally' || spec.vehicleClass === 'truck';
  const offroadBonus = (isOffroadSpec ? 0.16 : 0) + (spec.offroadGrip ?? 0);

  const surfaceGrip =
    state.surface === 'asphalt'
      ? 1.0
      : state.surface === 'grass'
      ? 0.72 + offroadBonus * 0.5
      : state.surface === 'gravel'
      ? 0.8 + offroadBonus * 0.55                    // a packed rally road: loose, but a lot more grip than sand, and a rally car makes more of it
      : 0.62 + offroadBonus;
  const surfaceDrag =
    state.surface === 'asphalt' ? 0.0 : state.surface === 'grass' ? 0.42 : state.surface === 'gravel' ? Math.max(0.06, 0.2 - offroadBonus * 0.5) : 0.68 - offroadBonus;

  const sinY = Math.sin(state.yaw);
  const cosY = Math.cos(state.yaw);
  const fwdX = sinY;
  const fwdZ = cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  const vFwd = state.vel.x * fwdX + state.vel.z * fwdZ;
  const vLat = state.vel.x * rightX + state.vel.z * rightZ;
  state.forwardSpeed = vFwd;
  state.lateralSpeed = vLat;
  state.speedMps = Math.hypot(state.vel.x, state.vel.z);

  // ── 1. Precision Speed-Sensitive Steering + Instant Self-Centering & Counter-Steer Authority ──
  const speedRatio = THREE.MathUtils.clamp(state.speedMps / spec.topSpeedMps, 0, 1);
  const isReturning = Math.abs(input.steer) < 0.05 || Math.sign(input.steer) !== Math.sign(state.steerInputSmoothed);
  const steerRate = isReturning ? 18.5 : THREE.MathUtils.lerp(15.0, 10.2, speedRatio);
  state.steerInputSmoothed = THREE.MathUtils.lerp(
    state.steerInputSmoothed,
    input.steer,
    1 - Math.exp(-steerRate * safeDt)
  );
  // Subtle non-linear center precision curve (fine micro-corrections around center, decisive lock into corners)
  const steerShaped = Math.sign(state.steerInputSmoothed) * Math.pow(Math.abs(state.steerInputSmoothed), 1.12);
  const maxWheelLock = THREE.MathUtils.lerp(spec.steerMaxRad, 0.135, Math.pow(speedRatio, 0.82));
  state.steerAngle = steerShaped * maxWheelLock;

  // ── 2. Powertrain, Turbo/Supercharger Boost, Shift Cut & Line-Lock Burnout ──
  const absFwd = Math.abs(vFwd);
  const maxPerGear = spec.topSpeedMps / spec.gearRatios.length;
  const gearIdx = THREE.MathUtils.clamp(Math.floor(absFwd / (maxPerGear * 0.92)), 0, spec.gearRatios.length - 1);
  const gearRatio = spec.gearRatios[gearIdx];
  const rpmFrac = THREE.MathUtils.clamp(
    (state.rpm - spec.engine.idleRpm) / Math.max(1, spec.engine.redlineRpm - spec.engine.idleRpm),
    0,
    1
  );

  // Turbo / Supercharger boost spool
  const targetBoost =
    spec.engine.aspiration === 'Twin-Turbo'
      ? input.throttle * THREE.MathUtils.clamp((rpmFrac - 0.18) / 0.65, 0, 1)
      : spec.engine.aspiration === 'Supercharged'
      ? input.throttle * (0.35 + 0.65 * rpmFrac)
      : input.throttle * rpmFrac;
  const boostRate = targetBoost > state.turboBoost ? 5.5 : 8.5;
  state.turboBoost = THREE.MathUtils.lerp(state.turboBoost, targetBoost, 1 - Math.exp(-boostRate * safeDt));

  // Shift cut & exhaust overrun backfire detection
  if (state.shiftTimer > 0) {
    state.shiftTimer = Math.max(0, state.shiftTimer - safeDt);
  }
  const throttleLift = state.prevThrottle > 0.55 && input.throttle < 0.15 && rpmFrac > 0.56;
  if (throttleLift && spec.engine.aspiration !== 'Electric') {
    state.backfireEvent = true;
  }
  state.prevThrottle = input.throttle;

  let longForce = 0;
  state.isBraking = false;
  let burnoutActive = false;

  // Aerodynamic downforce (computed ahead of braking so high-downforce race cars stop dramatically harder at speed)
  const aeroDownforceN = 0.5 * 1.225 * spec.aeroDownforce * state.speedMps * state.speedMps;

  // Reactive ABS-modulated braking: initial pedal bite + aero-assisted tyre grip ceiling, scaling cleanly from street cars to carbon-ceramic track hypercars
  const effectiveWeightN = spec.massKg * GRAVITY + aeroDownforceN * 0.85;
  const maxBrakeForce = Math.min(
    Math.max((spec.brakes.maxTorqueNm * 4.6) / spec.wheelRadius, effectiveWeightN * 1.08 * surfaceGrip),
    effectiveWeightN * Math.max(1.05, spec.corneringGrip) * surfaceGrip * 1.58
  );
  const isStandingBurnout =
    spec.drivetrain === 'RWD' && input.throttle > 0.65 && input.brake > 0.45 && state.speedMps < 10;

  if (isStandingBurnout) {
    burnoutActive = true;
    state.isBraking = true;
    longForce += input.throttle * 1800; // creeping forward slightly while roasting rear tires
  } else {
    if (input.throttle > 0.01 && vFwd < spec.topSpeedMps && !state.isAirborne) {
      const engineTorque = spec.engine.peakTorqueNm * sampleTorqueCurve(spec.engine.torqueCurve, rpmFrac);
      const shiftMult = state.shiftTimer > 0 ? 0.12 : 1.0;
      let wheelForce = (engineTorque * gearRatio * spec.finalDrive * 0.90) / spec.wheelRadius;
      // power and traction limits: the engine cannot deliver more than its peak power at speed, and the driven tyres cannot put down more than their grip
      const powerCap = (spec.engine.peakHp * 745.7 * 0.82) / Math.max(vFwd, 3.6);
      const tractionCap = effectiveWeightN * spec.corneringGrip * surfaceGrip * (spec.drivetrain === 'AWD' ? 0.78 : 0.66);
      wheelForce = Math.min(wheelForce, powerCap, tractionCap);
      const topTaper = 1 - Math.pow(THREE.MathUtils.clamp(vFwd / spec.topSpeedMps, 0, 1), 3.0);
      longForce += input.throttle * wheelForce * shiftMult * Math.max(0.08, topTaper);
    }

    if (input.brake > 0.01 && !state.isAirborne) {
      const reactiveBrake = Math.pow(THREE.MathUtils.clamp(input.brake, 0, 1), 0.78);
      if (vFwd > 1.0) {
        longForce -= reactiveBrake * maxBrakeForce;
        state.isBraking = true;
      } else {
        longForce -= reactiveBrake * 5800;
        state.isBraking = true;
      }
    }
  }

  if (input.handbrake && !state.isAirborne) {
    longForce -= Math.sign(vFwd) * maxBrakeForce * 0.40;
    state.isBraking = true;
  }

  // Aerodynamic drag + rolling resistance
  const aeroDrag = 0.40 * state.speedMps * state.speedMps + (state.isAirborne ? 15 : 110 + surfaceDrag * 2200);
  if (state.speedMps > 0.1) {
    longForce -= (vFwd / state.speedMps) * aeroDrag;
  }

  const longAccel = state.isAirborne ? 0 : longForce / spec.massKg;
  let newVFwd = vFwd + longAccel * safeDt;
  if (!state.isAirborne && Math.abs(newVFwd) < 0.22 && input.throttle < 0.05 && input.brake < 0.05) {
    newVFwd = 0;
  }

  // ── 3. Brake Rotor Thermal Simulation (heating + speed cooling) ──
  const heatSpeedFactor = burnoutActive ? 1.0 : state.speedMps > 4 ? 1.0 : 0;
  const frontHeatAdd = state.isBraking && !burnoutActive && state.speedMps > 4 ? input.brake * spec.brakes.frontBias * 1.45 * safeDt : 0;
  const rearHeatAdd =
    (state.isBraking && heatSpeedFactor > 0 ? input.brake * (1 - spec.brakes.frontBias) * (burnoutActive ? 2.1 : 1.45) * safeDt : 0) +
    (input.handbrake && state.speedMps > 4 ? 0.95 * safeDt : 0);
  const cool = spec.brakes.coolingRate * (0.35 + speedRatio * 1.85) * safeDt;
  state.brakeTemp[0] = THREE.MathUtils.clamp(state.brakeTemp[0] + frontHeatAdd - cool, 0, 1);
  state.brakeTemp[1] = THREE.MathUtils.clamp(state.brakeTemp[1] + frontHeatAdd - cool, 0, 1);
  state.brakeTemp[2] = THREE.MathUtils.clamp(state.brakeTemp[2] + rearHeatAdd - cool, 0, 1);
  state.brakeTemp[3] = THREE.MathUtils.clamp(state.brakeTemp[3] + rearHeatAdd - cool, 0, 1);

  // ── 4. Pacejka-Inspired Tire Grip, Weight Transfer & Precision Drivetrain Yaw ──
  const aeroLoadFactor = 1 + aeroDownforceN / 22000;
  const trailBrakeBonus = state.isBraking && !input.handbrake ? 1.18 : 1.0;
  const mu = spec.corneringGrip * surfaceGrip * aeroLoadFactor * trailBrakeBonus * 1.22;
  const maxLatAccel = mu * GRAVITY;

  const turnSign = newVFwd >= -0.2 ? 1 : -1;
  const absNewFwd = Math.abs(newVFwd);

  const kinematicYaw = (absNewFwd / spec.wheelbase) * Math.tan(state.steerAngle) * turnSign;
  const gripLimitedMaxYaw = absNewFwd > 2.0 ? maxLatAccel / absNewFwd : Math.abs(kinematicYaw);

  // RWD power oversteer vs AWD neutral pull vs FWD understeer
  const rwdPowerOversteer =
    spec.drivetrain === 'RWD' && input.throttle > 0.65 && Math.abs(state.steerAngle) > 0.08 && !state.isAirborne
      ? 1.0 + 0.20 * input.throttle * (1 - speedRatio * 0.62)
      : 1.0;
  const handbrakeYawMult = (input.handbrake ? 1.52 : 1.0) * rwdPowerOversteer;

  const clampedYaw = THREE.MathUtils.clamp(
    kinematicYaw * handbrakeYawMult,
    -gripLimitedMaxYaw * handbrakeYawMult,
    gripLimitedMaxYaw * handbrakeYawMult
  );

  const slipAngle = absNewFwd > 4 ? Math.atan2(vLat, absNewFwd) : 0;
  const counterSteerAssist = input.handbrake || burnoutActive ? 0 : -slipAngle * (spec.drivetrain === 'AWD' ? 1.55 : 1.32);

  const targetYawRate = state.isAirborne ? state.angularVel * 0.98 : clampedYaw + counterSteerAssist * 0.32;
  const gripScale = THREE.MathUtils.clamp(spec.corneringGrip, 0.8, 1.35);
  const yawResponsiveness = (input.handbrake ? 8.5 : spec.drivetrain === 'AWD' ? 14.8 : spec.drivetrain === 'RWD' ? 13.5 : 12.2) * gripScale;
  state.angularVel = THREE.MathUtils.lerp(
    state.angularVel,
    targetYawRate,
    1 - Math.exp(-yawResponsiveness * safeDt)
  );
  state.yaw += state.angularVel * safeDt;

  const latGripRate = state.isAirborne
    ? 0.2
    : (input.handbrake ? 2.4 : 11.4) * spec.corneringGrip * surfaceGrip;
  const lateralKill = THREE.MathUtils.clamp(latGripRate * safeDt, 0, 0.96);
  const newVLat = vLat * (1 - lateralKill);
  const latAccel = (newVLat - vLat) / safeDt;

  const nSin = Math.sin(state.yaw);
  const nCos = Math.cos(state.yaw);
  state.vel.x = nSin * newVFwd + nCos * newVLat;
  state.vel.z = nCos * newVFwd - nSin * newVLat;

  state.pos.x += state.vel.x * safeDt;
  state.pos.z += state.vel.z * safeDt;

  // World bounds (the macro region; the open-world region sets its own from the height grid, which grew north)
  const B = WORLD_BOUNDS;
  if (state.pos.x < B.minX) { state.pos.x = B.minX; state.vel.x = Math.max(0, state.vel.x * -0.3); }
  if (state.pos.x > B.maxX) { state.pos.x = B.maxX; state.vel.x = Math.min(0, state.vel.x * -0.3); }
  if (state.pos.z < B.minZ) { state.pos.z = B.minZ; state.vel.z = Math.max(0, state.vel.z * -0.3); }
  if (state.pos.z > B.maxZ) { state.pos.z = B.maxZ; state.vel.z = Math.min(0, state.vel.z * -0.3); }

  // Building / landmark AABB collisions
  const carRadius = 1.9;
  for (const box of colliders) {
    const cx = THREE.MathUtils.clamp(state.pos.x, box.minX, box.maxX);
    const cz = THREE.MathUtils.clamp(state.pos.z, box.minZ, box.maxZ);
    const dx = state.pos.x - cx;
    const dz = state.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < carRadius * carRadius && d2 > 1e-6) {
      const dist = Math.sqrt(d2);
      const nx = dx / dist;
      const nz = dz / dist;
      const push = carRadius - dist;
      state.pos.x += nx * push;
      state.pos.z += nz * push;
      const vn = state.vel.x * nx + state.vel.z * nz;
      if (vn < 0) {
        state.vel.x -= 1.35 * vn * nx;
        state.vel.z -= 1.35 * vn * nz;
        state.vel.multiplyScalar(0.82);
        state.suspensionImpact = Math.max(state.suspensionImpact, Math.min(1, -vn / 18));
      }
    }
  }

  // ── 5. 4-Corner Spring-Damper-AntiRoll Suspension & Airborne Physics ──
  const halfT = spec.trackWidth * 0.5;
  const halfW = spec.wheelbase * 0.5;
  const cornerCoords: [number, number][] = [
    [state.pos.x - rightX * halfT + fwdX * halfW, state.pos.z - rightZ * halfT + fwdZ * halfW], // FL
    [state.pos.x + rightX * halfT + fwdX * halfW, state.pos.z + rightZ * halfT + fwdZ * halfW], // FR
    [state.pos.x - rightX * halfT - fwdX * halfW, state.pos.z - rightZ * halfT - fwdZ * halfW], // RL
    [state.pos.x + rightX * halfT - fwdX * halfW, state.pos.z + rightZ * halfT - fwdZ * halfW], // RR
  ];

  const cornerGround: [number, number, number, number] = [
    terrainHeight(cornerCoords[0][0], cornerCoords[0][1]),
    terrainHeight(cornerCoords[1][0], cornerCoords[1][1]),
    terrainHeight(cornerCoords[2][0], cornerCoords[2][1]),
    terrainHeight(cornerCoords[3][0], cornerCoords[3][1]),
  ];
  const avgGround = (cornerGround[0] + cornerGround[1] + cornerGround[2] + cornerGround[3]) * 0.25;
  const maxT = spec.suspension.travelM;

  // Check airborne state & vertical integration
  const wasAirborne = state.isAirborne;
  state.verticalVel -= GRAVITY * safeDt;
  state.pos.y += state.verticalVel * safeDt;

  if (state.pos.y <= avgGround) {
    if (wasAirborne && state.verticalVel < -1.6) {
      state.suspensionImpact = Math.max(state.suspensionImpact, Math.min(1, (-state.verticalVel - 1.2) / 9.0));
    }
    state.pos.y = avgGround;
    if (state.verticalVel < 0) state.verticalVel = 0;
    state.isAirborne = false;
  } else if (state.pos.y > avgGround + Math.max(maxT * 0.85, 0.5)) {      // a crest or a drop-off is not a jump: stay planted so the car keeps steering and driving
    state.isAirborne = true;
  } else {
    state.pos.y = THREE.MathUtils.lerp(state.pos.y, avgGround, 1 - Math.exp(-26 * safeDt));
    state.isAirborne = false;
  }

  // Longitudinal & lateral weight transfer (Newtons per corner)
  const cgH = spec.cgHeightM ?? (spec.suspension.rideHeightM + 0.36);
  const staticCornerN = (spec.massKg * GRAVITY) * 0.25 + aeroDownforceN * 0.25;
  const dWLong = ((longAccel * spec.massKg * cgH) / spec.wheelbase) * 0.5;
  const dWLat = ((latAccel * spec.massKg * cgH) / spec.trackWidth) * 0.5;

  // Off-road surface micro-bump excitation
  const bumpAmp = state.surface === 'asphalt' ? 0 : state.surface === 'grass' ? 0.018 : 0.032;
  const bumpPhase = state.wheelSpin * 2.3;

  const targetLoads: [number, number, number, number] = [
    Math.max(0, staticCornerN - dWLong - dWLat), // FL
    Math.max(0, staticCornerN - dWLong + dWLat), // FR
    Math.max(0, staticCornerN + dWLong - dWLat), // RL
    Math.max(0, staticCornerN + dWLong + dWLat), // RR
  ];

  // Solve spring-damper per corner with 2 sub-steps
  const subDt = safeDt * 0.5;
  const kSpring = spec.suspension.springRateNm;
  const cDamper = spec.suspension.damperNsM;
  const antiRollK = kSpring * 0.45 * spec.suspension.antiRollFactor;

  for (let sub = 0; sub < 2; sub++) {
    for (let i = 0; i < 4; i++) {
      if (state.isAirborne) {
        const droop = -maxT * 0.85;
        state.wheelCompVel[i] = (droop - state.wheelCompression[i]) * 8.0;
        state.wheelCompression[i] = THREE.MathUtils.lerp(state.wheelCompression[i], droop, 1 - Math.exp(-10 * subDt));
        state.wheelLoadN[i] = 0;
        continue;
      }

      const groundDelta = cornerGround[i] - avgGround;
      const groundVel = (cornerGround[i] - state.prevCornerGround[i]) / safeDt;
      if (sub === 0 && Math.abs(groundVel) > 0.45 && state.speedMps > 6) {
        state.suspensionImpact = Math.max(state.suspensionImpact, Math.min(1, Math.abs(groundVel) / 3.5));
      }

      const surfaceRipple = bumpAmp * Math.sin(bumpPhase + i * 1.7) * Math.min(1, state.speedMps / 12);
      const oppIdx = i ^ 1; // FL<->FR, RL<->RR
      const arbForce = antiRollK * (state.wheelCompression[oppIdx] - state.wheelCompression[i]);

      const targetComp = THREE.MathUtils.clamp(
        (targetLoads[i] - staticCornerN + arbForce) / kSpring + groundDelta * 0.65 + surfaceRipple,
        -maxT,
        maxT
      );

      // 2nd-order spring-damper with asymmetric rebound damping (rebound 1.35x stiffer than bump)
      const disp = targetComp - state.wheelCompression[i];
      const dampMult = state.wheelCompVel[i] < 0 ? 1.35 : 1.0;
      const accel = (disp * (kSpring / (spec.massKg * 0.25)) - state.wheelCompVel[i] * ((cDamper * dampMult) / (spec.massKg * 0.25))) * 0.38;
      state.wheelCompVel[i] = THREE.MathUtils.clamp(state.wheelCompVel[i] + accel * subDt, -2.5, 2.5);
      state.wheelCompression[i] = THREE.MathUtils.clamp(
        state.wheelCompression[i] + state.wheelCompVel[i] * subDt,
        -maxT,
        maxT
      );
      state.wheelLoadN[i] = Math.max(0, targetLoads[i] + state.wheelCompression[i] * kSpring * 0.25);
    }
  }
  state.prevCornerGround = cornerGround;

  // Body pitch & roll directly from 4-corner suspension deflections
  const frontCompAvg = (state.wheelCompression[0] + state.wheelCompression[1]) * 0.5;
  const rearCompAvg = (state.wheelCompression[2] + state.wheelCompression[3]) * 0.5;
  const leftCompAvg = (state.wheelCompression[0] + state.wheelCompression[2]) * 0.5;
  const rightCompAvg = (state.wheelCompression[1] + state.wheelCompression[3]) * 0.5;

  const targetPitch = THREE.MathUtils.clamp((frontCompAvg - rearCompAvg) / spec.wheelbase * 0.85, -0.055, 0.055);
  const targetRoll = THREE.MathUtils.clamp((rightCompAvg - leftCompAvg) / spec.trackWidth * 0.95, -0.075, 0.075);
  state.pitch = THREE.MathUtils.lerp(state.pitch, targetPitch, 1 - Math.exp(-14 * safeDt));
  state.roll = THREE.MathUtils.lerp(state.roll, targetRoll, 1 - Math.exp(-14 * safeDt));

  // Per-corner slip ratios (for tire smoke, gravel spray, & multi-band audio)
  const latSlip = THREE.MathUtils.clamp(Math.abs(newVLat) / 7.5, 0, 1);
  const rearSpinSlip = burnoutActive ? 1.0 : input.handbrake && state.speedMps > 4 ? 0.9 : 0;
  state.wheelSlip[0] = state.isAirborne ? 0 : latSlip * 0.85;
  state.wheelSlip[1] = state.isAirborne ? 0 : latSlip * 0.85;
  state.wheelSlip[2] = state.isAirborne ? 0 : Math.max(latSlip, rearSpinSlip);
  state.wheelSlip[3] = state.isAirborne ? 0 : Math.max(latSlip, rearSpinSlip);

  // Wheel spin & Drift detection
  const spinRate = burnoutActive ? 28.0 : newVFwd / spec.wheelRadius;
  state.wheelSpin += spinRate * safeDt;
  state.isDrifting =
    !state.isAirborne &&
    (burnoutActive ||
      (state.speedMps > 11 &&
        (Math.abs(newVLat) > 4.2 || (input.handbrake && Math.abs(state.steerAngle) > 0.06))));

  // ── 6. Gearbox, Shift Cut & Rev-Limiter ──
  if (newVFwd < -0.5) {
    state.gear = -1;
    state.rpm = THREE.MathUtils.clamp(
      spec.engine.idleRpm + Math.abs(newVFwd) * 220,
      spec.engine.idleRpm,
      spec.engine.redlineRpm
    );
  } else if (state.speedMps < 0.4 && input.throttle < 0.05) {
    state.gear = 0;
    state.rpm = THREE.MathUtils.lerp(state.rpm, spec.engine.idleRpm, 1 - Math.exp(-8 * safeDt));
  } else if (burnoutActive) {
    state.gear = 1;
    state.rpm = THREE.MathUtils.lerp(state.rpm, spec.engine.redlineRpm * 0.92, 1 - Math.exp(-10 * safeDt));
  } else {
    const g = gearIdx + 1;
    if (g !== state.prevGear && state.prevGear > 0) {
      state.shiftTimer = 0.11;
      if (g > state.prevGear && spec.engine.aspiration !== 'Electric') {
        state.backfireEvent = true;
      }
    }
    state.prevGear = g;
    state.gear = g;
    const gearMin = (g - 1) * maxPerGear * 0.82;
    const gearMax = g * maxPerGear * 1.04;
    const frac = THREE.MathUtils.clamp((absNewFwd - gearMin) / Math.max(1, gearMax - gearMin), 0, 1);
    const targetRpm = spec.engine.idleRpm + frac * (spec.engine.redlineRpm - spec.engine.idleRpm);
    state.rpm = THREE.MathUtils.lerp(state.rpm, targetRpm, 1 - Math.exp(-18 * safeDt));
  }
}

export interface AIRival {
  state: CarState;
  spec: CarSpec;
  splineT: number;
  laneOffset: number;
  pace: number;
}

export function stepAIRival(
  rival: AIRival,
  spline: THREE.CatmullRomCurve3,
  dt: number,
  terrainHeight: (x: number, z: number) => number,
  surfaceAt: (x: number, z: number) => SurfaceType,
  colliders: BoxCollider[]
): void {
  const lookAheadT = (rival.splineT + 0.025) % 1;
  const targetPt = spline.getPointAt(lookAheadT);
  const tangent = spline.getTangentAt(lookAheadT);
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
  targetPt.addScaledVector(right, rival.laneOffset);

  const dx = targetPt.x - rival.state.pos.x;
  const dz = targetPt.z - rival.state.pos.z;
  const targetYaw = Math.atan2(dx, dz);
  let yawDiff = targetYaw - rival.state.yaw;
  while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
  while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

  const steer = THREE.MathUtils.clamp(yawDiff * 1.5, -1, 1);
  const sharpTurn = Math.abs(yawDiff) > 0.35;
  const throttle = sharpTurn ? 0.55 * rival.pace : 0.94 * rival.pace;
  const brake = sharpTurn && rival.state.speedMps > 32 ? 0.45 : 0;

  stepCarPhysics(
    rival.state,
    rival.spec,
    { throttle, brake, steer, handbrake: false },
    dt,
    terrainHeight,
    surfaceAt,
    colliders
  );

  const estStep = (rival.state.speedMps * dt) / 2250;
  rival.splineT = (rival.splineT + estStep) % 1;
}
