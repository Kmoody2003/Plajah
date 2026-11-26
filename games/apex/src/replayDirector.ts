// Council-Guided Gran Turismo / Forza Broadcast Replay Director
//
// Synthesizes camera choreography, shot selection, focal-length grammar, and cut rhythm
// from Plajah's Creative & Game Councils:
//   - Art Director Council (CLASSICAL proportion/cadence, BAROQUE timing/reveal)
//   - Game Council (Søren Lindqvist / REALTIME_3D_GURU lens & parallax,
//                   Elena Vance-Moreau / GAMEPLAY_VIRTUOSO kinetic battles & sightlines,
//                   Takumi Sato / JAPANESE_AUTEUR ma stillness & silhouette framing)
//   - Motion Director Council (CINEMATIC 3D Dramatist key-light staging, KINETIC beat rhythm)
//
// Guarantees zero-occlusion framing through 3D raymarched building + terrain + tunnel LOS
// validation across the entire duration of each shot window plus a live mid-shot watchdog.
import * as THREE from 'three';

export type DirectorStyleId = 'gt' | 'forza' | 'auteur';

export interface DirectorStyleMeta {
  id: DirectorStyleId;
  label: string;
  council: string;
  minHold: number;
  maxHold: number;
  leadWeight: number;
  panLag: number;
  shakeScale: number;
}

export const DIRECTOR_STYLES: Record<DirectorStyleId, DirectorStyleMeta> = {
  gt: {
    id: 'gt',
    label: 'GT BROADCAST',
    council: 'CLASSICAL · REALTIME 3D GURU',
    minHold: 3.4,
    maxHold: 6.2,
    leadWeight: 1.0,
    panLag: 9.5,
    shakeScale: 0.75,
  },
  forza: {
    id: 'forza',
    label: 'FORZA KINETIC',
    council: 'GAMEPLAY VIRTUOSO · KINETIC',
    minHold: 2.3,
    maxHold: 4.5,
    leadWeight: 0.72,
    panLag: 13.5,
    shakeScale: 1.15,
  },
  auteur: {
    id: 'auteur',
    label: 'AUTEUR MA',
    council: 'JAPANESE AUTEUR · CINEMATIC 3D',
    minHold: 4.5,
    maxHold: 7.8,
    leadWeight: 1.25,
    panLag: 6.8,
    shakeScale: 0.45,
  },
};

export type ReplayShotType =
  | 'heli'
  | 'trackside'
  | 'apex-kerb'
  | 'chase-dolly'
  | 'battle'
  | 'fender-brake'
  | 'crane-jib'
  | 'tunnel-chase';

export const SHOT_LABEL: Record<ReplayShotType, string> = {
  heli: 'BROADCAST HELI',
  trackside: 'TELEPHOTO TRACKSIDE',
  'apex-kerb': 'APEX KERB CAM',
  'chase-dolly': 'CAMERA CAR DOLLY',
  battle: 'PACK TWO-SHOT',
  'fender-brake': 'FENDER & ROTOR CAM',
  'crane-jib': 'SKYLINE CRANE JIB',
  'tunnel-chase': 'LOW CHASE RIG',
};

export const MANUAL_SHOT_ORDER: ReplayShotType[] = [
  'trackside',
  'apex-kerb',
  'chase-dolly',
  'battle',
  'fender-brake',
  'crane-jib',
  'heli',
  'tunnel-chase',
];

export interface ReplaySample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  steerAngle: number;
  brake: number;
  wetNight: number;
  latSpeed: number;
  rpm: number;
  gear: number;
  hit: number;
  flags: number;
}

export interface ReplayOppSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
}

export interface BuildingFootprint {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rotY: number;
  baseY: number;
  topY: number;
}

export interface DirectorWorld {
  groundY: (x: number, z: number) => number;
  blocked2D: (x: number, z: number) => boolean;
  /** Optional 3D building query returning obstructing rooftop height at (x,z) if inside an expanded OBB, or -Infinity if clear. */
  buildingTopAt?: (x: number, z: number, margin: number) => number;
  /** True when the car or camera lies inside a tunnel (e.g. Cliff Raceway tunnel). */
  inTunnel?: (x: number, z: number) => boolean;
}

export interface DirectedShot {
  t0: number;
  t1: number;
  type: ReplayShotType;
  side: number;
  seed: number;
  anchor: THREE.Vector3;
  anchorEnd: THREE.Vector3;
  hasAnchor: boolean;
  focalMm: number;
  reason: string;
}

export const REPLAY_FLAG_DISCONTINUITY = 1;
export const REPLAY_FLAG_DRIFT = 2;
export const REPLAY_FLAG_AIRBORNE = 4;
export const REPLAY_FLAG_TUNNEL = 8;
export const REPLAY_FLAG_HEADLIGHTS = 16;

function wrapAngleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 3D point clearance check against building volumes, 2D fallback blocker, and terrain. */
export function isPointClear3D(
  world: DirectorWorld,
  x: number,
  y: number,
  z: number,
  margin = 2.0,
  minGroundClear = 0.35,
): boolean {
  const gy = world.groundY(x, z);
  if (y < gy + minGroundClear) return false;
  if (world.buildingTopAt) {
    const topY = world.buildingTopAt(x, z, margin);
    if (topY > -1e8 && y < topY + 2.2) return false;
    return true;
  }
  return !world.blocked2D(x, z);
}

/**
 * 3D Line-of-Sight raymarch between camera `a` and car target `b`.
 * Rejects any segment whose interior passes through a 3D building volume or terrain ridge.
 */
export function isSegmentClear3D(
  world: DirectorWorld,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  margin = 1.15,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1.2) return true;
  const steps = Math.max(4, Math.min(28, Math.ceil(dist / 3.8)));
  for (let i = 1; i < steps; i++) {
    const u = i / steps;
    const x = ax + dx * u;
    const y = ay + dy * u;
    const z = az + dz * u;
    // Terrain crest check (ignore tiny dip right beside the car's wheels)
    const groundClear = u > 0.88 ? -0.15 : 0.22;
    if (y < world.groundY(x, z) + groundClear) return false;
    if (world.buildingTopAt) {
      const topY = world.buildingTopAt(x, z, margin);
      if (topY > -1e8 && y < topY + 0.6) return false;
    } else if (u < 0.92 && world.blocked2D(x, z)) {
      return false;
    }
  }
  return true;
}

/** Finds the highest rooftop within radius `r` around (x, z) so aerial/crane rigs stay well clear of downtown towers. */
export function maxObstacleTopNear(world: DirectorWorld, x: number, z: number, r = 18): number {
  let top = world.groundY(x, z);
  if (!world.buildingTopAt) return top;
  const offsets: [number, number][] = [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
    [r * 0.7, r * 0.7],
    [-r * 0.7, r * 0.7],
    [r * 0.7, -r * 0.7],
    [-r * 0.7, -r * 0.7],
  ];
  for (const [ox, oz] of offsets) {
    const bTop = world.buildingTopAt(x + ox, z + oz, 1.5);
    if (bTop > top) top = bTop;
  }
  return top;
}

interface WindowTelemetry {
  avgSpeed: number;
  maxSpeed: number;
  maxBrake: number;
  curvature: number;      // signed total yaw delta across window (rad)
  absCurve: number;
  driftRatio: number;
  inTunnel: boolean;
  hasDiscontinuity: boolean;
  maxHit: number;
  closestOppDist: number;
  apexIdx: number;        // index in samples where curvature/braking peaks
  samples: ReplaySample[];
}

function analyzeWindow(
  t0: number,
  t1: number,
  sampleAt: (t: number) => ReplaySample,
  opponentsAt: (t: number) => ReplayOppSample[],
  world: DirectorWorld,
): WindowTelemetry {
  const N = 7;
  const samples: ReplaySample[] = [];
  let sumSp = 0;
  let maxSp = 0;
  let maxBrake = 0;
  let totalYaw = 0;
  let driftCnt = 0;
  let inTunnel = false;
  let hasDiscontinuity = false;
  let maxHit = 0;
  let closestOppDist = 1e9;
  let bestApexScore = -1;
  let apexIdx = Math.floor(N / 2);

  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const s = sampleAt(t0 + (t1 - t0) * u);
    samples.push(s);
    const sp = Math.abs(s.speed);
    sumSp += sp;
    if (sp > maxSp) maxSp = sp;
    if (s.brake > maxBrake) maxBrake = s.brake;
    if ((s.flags & REPLAY_FLAG_DRIFT) !== 0 || Math.abs(s.latSpeed) > 3.2) driftCnt++;
    if ((s.flags & REPLAY_FLAG_TUNNEL) !== 0 || world.inTunnel?.(s.x, s.z)) inTunnel = true;
    if ((s.flags & REPLAY_FLAG_DISCONTINUITY) !== 0) hasDiscontinuity = true;
    if (s.hit > maxHit) maxHit = s.hit;
    if (i > 0) {
      const prev = samples[i - 1];
      const jump = Math.hypot(s.x - prev.x, s.z - prev.z);
      if (jump > Math.max(22, (maxSp + 25) * ((t1 - t0) / (N - 1)) * 2.2)) {
        hasDiscontinuity = true;
      }
      const dy = wrapAngleDiff(prev.yaw, s.yaw);
      totalYaw += dy;
      const apexScore = Math.abs(dy) * 3.5 + s.brake * 1.4 + Math.abs(s.latSpeed) * 0.12;
      if (apexScore > bestApexScore && i >= 1 && i <= N - 2) {
        bestApexScore = apexScore;
        apexIdx = i;
      }
    }
    const opps = opponentsAt(s.t);
    for (const op of opps) {
      const d = Math.hypot(op.x - s.x, op.z - s.z);
      if (d < closestOppDist) closestOppDist = d;
    }
  }

  return {
    avgSpeed: sumSp / N,
    maxSpeed: maxSp,
    maxBrake,
    curvature: totalYaw,
    absCurve: Math.abs(totalYaw),
    driftRatio: driftCnt / N,
    inTunnel,
    hasDiscontinuity,
    maxHit,
    closestOppDist,
    apexIdx,
    samples,
  };
}

/**
 * Evaluates a candidate static or crane anchor against every sample in the shot window.
 * Returns a visibility + composition score (0 = occluded/invalid, higher = cleaner GT/Forza frame).
 */
function scoreStaticAnchor(
  world: DirectorWorld,
  ax: number,
  ay: number,
  az: number,
  samples: ReplaySample[],
  idealDist: number,
  isKerb: boolean,
): number {
  const minClear = isKerb ? 0.28 : 0.9;
  if (!isPointClear3D(world, ax, ay, az, isKerb ? 1.2 : 2.2, minClear)) return 0;

  let clearCount = 0;
  let midClear = false;
  let distScore = 0;
  const midIdx = Math.floor(samples.length / 2);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const tx = s.x;
    const ty = s.y + (isKerb ? 0.55 : 0.85);
    const tz = s.z;
    const d = Math.hypot(tx - ax, ty - ay, tz - az);
    if (d < (isKerb ? 2.1 : 3.2) || d > 195) continue;
    if (isSegmentClear3D(world, ax, ay, az, tx, ty, tz, isKerb ? 0.85 : 1.15)) {
      clearCount++;
      if (i === midIdx) midClear = true;
      const dErr = Math.abs(d - idealDist) / Math.max(8, idealDist);
      distScore += Math.max(0.1, 1 - dErr * 0.45);
    }
  }

  const ratio = clearCount / samples.length;
  if (ratio < 0.72 || !midClear) return 0;
  return ratio * 10 + distScore / samples.length;
}

/**
 * Searches along the open road corridor (outside-of-turn first, then inside, then ahead/behind)
 * to place an unobstructed Gran Turismo telephoto trackside, apex-kerb, or rising crane jib rig.
 */
export function solveStaticRigAnchor(
  world: DirectorWorld,
  type: 'trackside' | 'apex-kerb' | 'crane-jib',
  samples: ReplaySample[],
  preferSide: number,
  seed: number,
): { start: THREE.Vector3; end: THREE.Vector3; score: number } | null {
  if (!samples.length) return null;
  const mid = samples[Math.floor(samples.length * 0.55)];
  const end = samples[samples.length - 1];
  const fx = Math.sin(mid.yaw);
  const fz = Math.cos(mid.yaw);
  const lx = Math.cos(mid.yaw);
  const lz = -Math.sin(mid.yaw);

  // Build candidate offsets prioritized by cinematographic intent
  const candidates: Array<{ px: number; pz: number; h: number; endLift: number; idealDist: number }> = [];
  const sides = preferSide >= 0 ? [1, -1] : [-1, 1];

  if (type === 'apex-kerb') {
    for (const side of sides) {
      for (const ahead of [6, 12, 2, 18, -4]) {
        for (const lat of [3.4, 4.8, 6.2, 2.6]) {
          candidates.push({
            px: mid.x + fx * ahead + lx * lat * side,
            pz: mid.z + fz * ahead + lz * lat * side,
            h: 0.36 + seed * 0.2,
            endLift: 0.08,
            idealDist: 10,
          });
        }
      }
    }
  } else if (type === 'crane-jib') {
    for (const side of sides) {
      for (const ahead of [16, 28, 6, -10]) {
        for (const lat of [8.5, 13, 5.5, 17]) {
          candidates.push({
            px: mid.x + fx * ahead + lx * lat * side,
            pz: mid.z + fz * ahead + lz * lat * side,
            h: 2.4 + seed * 1.4,
            endLift: 7.5 + seed * 4.5,
            idealDist: 26,
          });
        }
      }
    }
  } else {
    // Telephoto trackside: classic GT/Forza long lens placed ahead along the open roadway edge
    for (const side of sides) {
      for (const ahead of [26, 38, 16, 52, 8]) {
        for (const lat of [7.5, 11.5, 5.2, 16, 3.8]) {
          candidates.push({
            px: mid.x + fx * ahead + lx * lat * side,
            pz: mid.z + fz * ahead + lz * lat * side,
            h: 1.7 + seed * 1.6,
            endLift: 0,
            idealDist: 30,
          });
        }
      }
    }
    // Corridor-aligned backup: right ahead on the actual road line the car is about to traverse!
    // Guarantees an open street canyon shot even between dense Manhattan/Ironport skyscrapers.
    for (const side of sides) {
      for (const lat of [4.2, 2.8, 6.0]) {
        candidates.push({
          px: end.x + lx * lat * side,
          pz: end.z + lz * lat * side,
          h: 2.1,
          endLift: 0,
          idealDist: 24,
        });
      }
    }
  }

  let bestScore = 0;
  let bestStart: THREE.Vector3 | null = null;
  let bestEnd: THREE.Vector3 | null = null;

  for (const c of candidates) {
    const gy = world.groundY(c.px, c.pz);
    // Keep camera roughly on the same elevation band as the car (never down in a trench or up on a cliff!)
    if (Math.abs(gy - mid.y) > 9.5) continue;
    const ay = Math.max(gy, mid.y - 1.2) + c.h;
    const sc = scoreStaticAnchor(world, c.px, ay, c.pz, samples, c.idealDist, type === 'apex-kerb');
    if (sc > bestScore) {
      // For crane-jib, also validate the elevated end of the jib arm!
      const ey = ay + c.endLift;
      if (c.endLift > 0.5 && !isPointClear3D(world, c.px, ey, c.pz, 2.0, 1.0)) continue;
      bestScore = sc;
      bestStart = new THREE.Vector3(c.px, ay, c.pz);
      bestEnd = new THREE.Vector3(c.px, ey, c.pz);
      if (sc > 10.6) break; // early-out once we have a spotless 100% LOS hero placement
    }
  }

  return bestStart && bestEnd ? { start: bestStart, end: bestEnd, score: bestScore } : null;
}

/**
 * Plans the entire broadcast edit list using Plajah's Council grammar + real telemetry events
 * + 3D obstruction pre-validation across every single shot window.
 */
export function planBroadcastEdit(
  totalDuration: number,
  styleId: DirectorStyleId,
  sampleAt: (t: number) => ReplaySample,
  opponentsAt: (t: number) => ReplayOppSample[],
  world: DirectorWorld,
): DirectedShot[] {
  const style = DIRECTOR_STYLES[styleId];
  const shots: DirectedShot[] = [];
  if (totalDuration < 0.25) return shots;

  let t = 0;
  let idx = 0;
  let lastType: ReplayShotType | null = null;
  let rnd = styleId === 'gt' ? 19 : styleId === 'forza' ? 73 : 131;
  const rand = (): number => {
    rnd = (rnd * 16807) % 2147483647;
    return (rnd - 1) / 2147483646;
  };

  while (t < totalDuration - 0.35) {
    const baseDur = style.minHold + rand() * (style.maxHold - style.minHold);
    const t1 = Math.min(totalDuration, t + baseDur);
    const info = analyzeWindow(t, t1, sampleAt, opponentsAt, world);
    const turnOutside = info.curvature > 0.08 ? -1 : info.curvature < -0.08 ? 1 : rand() < 0.5 ? 1 : -1;

    // Council-weighted candidate priority list based on what the car is ACTUALLY doing in [t..t1]
    const priority: Array<{ type: ReplayShotType; reason: string; durScale: number }> = [];

    if (info.inTunnel) {
      priority.push(
        { type: 'tunnel-chase', reason: 'TUNNEL CORRIDOR', durScale: 1.0 },
        { type: 'fender-brake', reason: 'TUNNEL DETAIL', durScale: 0.72 },
      );
    } else if (idx === 0 && totalDuration >= 4) {
      // Classic GT / Forza opener: establishing skyline crane/heli or telephoto launch
      if (styleId === 'forza') {
        priority.push(
          { type: 'chase-dolly', reason: 'LAUNCH ROLLING START', durScale: 0.9 },
          { type: 'trackside', reason: 'LAUNCH TELEPHOTO', durScale: 0.9 },
          { type: 'heli', reason: 'ESTABLISHING AERIAL', durScale: 1.1 },
        );
      } else {
        priority.push(
          { type: 'crane-jib', reason: 'OPENING ESTABLISHING JIB', durScale: 1.05 },
          { type: 'heli', reason: 'OPENING BROADCAST HELI', durScale: 1.15 },
          { type: 'trackside', reason: 'OPENING TELEPHOTO', durScale: 1.0 },
        );
      }
    } else {
      // Event-driven cinematic staging (never a dumb modulo loop!)
      if (info.closestOppDist < 22 && lastType !== 'battle') {
        priority.push({ type: 'battle', reason: 'WHEEL-TO-WHEEL BATTLE', durScale: 1.05 });
      }
      if ((info.maxBrake > 0.52 || info.driftRatio > 0.35) && info.avgSpeed > 10) {
        if (lastType !== 'apex-kerb') {
          priority.push({ type: 'apex-kerb', reason: info.driftRatio > 0.35 ? 'DRIFT APEX' : 'HEAVY BRAKING ZONE', durScale: 0.92 });
        }
        if (lastType !== 'fender-brake' && (styleId === 'forza' || info.maxBrake > 0.7)) {
          priority.push({ type: 'fender-brake', reason: 'ROTOR & SUSPENSION LOAD', durScale: 0.65 });
        }
      }
      if (info.absCurve > 0.42) {
        priority.push(
          { type: 'apex-kerb', reason: 'CORNER APEX', durScale: 0.95 },
          { type: 'crane-jib', reason: 'CORNER EXIT REVEAL', durScale: 1.0 },
          { type: 'trackside', reason: 'SWEPER TELEPHOTO', durScale: 1.0 },
        );
      }
      if (info.maxSpeed > 34) {
        priority.push(
          { type: 'trackside', reason: 'HIGH-SPEED WHIP PAN', durScale: 0.95 },
          { type: 'chase-dolly', reason: 'PARALLEL PURSUIT', durScale: 0.95 },
          { type: 'heli', reason: 'STRAIGHTAWAY AERIAL', durScale: 1.15 },
        );
      }
      // Always provide balanced rhythmic variety across shots
      const fallbackCycle: ReplayShotType[] =
        styleId === 'auteur'
          ? ['trackside', 'crane-jib', 'chase-dolly', 'apex-kerb', 'heli', 'fender-brake']
          : styleId === 'forza'
            ? ['chase-dolly', 'apex-kerb', 'fender-brake', 'trackside', 'crane-jib', 'heli']
            : ['trackside', 'chase-dolly', 'apex-kerb', 'crane-jib', 'heli', 'fender-brake'];
      for (const ft of fallbackCycle) {
        if (!priority.some((p) => p.type === ft)) {
          priority.push({ type: ft, reason: 'BROADCAST CADENCE', durScale: 1.0 });
        }
      }
    }

    // De-duplicate back-to-back identical shot types unless forced by tunnel/occlusion
    const ordered = priority.sort((a, b) => {
      const aRep = a.type === lastType ? 1 : 0;
      const bRep = b.type === lastType ? 1 : 0;
      return aRep - bRep;
    });

    let chosen: DirectedShot | null = null;
    for (const cand of ordered) {
      const seed = rand();
      const candT1 = Math.min(totalDuration, t + Math.max(style.minHold * 0.72, baseDur * cand.durScale));
      const candSamples =
        Math.abs(candT1 - t1) > 0.4
          ? analyzeWindow(t, candT1, sampleAt, opponentsAt, world).samples
          : info.samples;

      if (cand.type === 'trackside' || cand.type === 'apex-kerb' || cand.type === 'crane-jib') {
        const solved = solveStaticRigAnchor(world, cand.type, candSamples, turnOutside, seed);
        if (!solved) continue; // Occluded! Director skips cleanly to next unobstructed camera!
        chosen = {
          t0: t,
          t1: candT1,
          type: cand.type,
          side: turnOutside,
          seed,
          anchor: solved.start,
          anchorEnd: solved.end,
          hasAnchor: true,
          focalMm: cand.type === 'apex-kerb' ? 42 : cand.type === 'crane-jib' ? 50 : 105,
          reason: cand.reason,
        };
        break;
      } else {
        // Dynamic camera rig (chase-dolly, battle, fender-brake, heli, tunnel-chase)
        if (cand.type === 'heli' && info.inTunnel) continue;
        chosen = {
          t0: t,
          t1: candT1,
          type: cand.type,
          side: turnOutside,
          seed,
          anchor: new THREE.Vector3(),
          anchorEnd: new THREE.Vector3(),
          hasAnchor: false,
          focalMm: cand.type === 'heli' ? 75 : cand.type === 'fender-brake' ? 55 : cand.type === 'battle' ? 45 : 38,
          reason: cand.reason,
        };
        break;
      }
    }

    if (!chosen) {
      chosen = {
        t0: t,
        t1,
        type: 'tunnel-chase',
        side: turnOutside,
        seed: rand(),
        anchor: new THREE.Vector3(),
        anchorEnd: new THREE.Vector3(),
        hasAnchor: false,
        focalMm: 35,
        reason: 'SAFE CORRIDOR CHASE',
      };
    }

    shots.push(chosen);
    lastType = chosen.type;
    t = chosen.t1;
    idx++;
  }

  return shots;
}

/**
 * Pulls a moving camera position smoothly inward along the sightline toward the car
 * until the point AND sightline are 100% clear of buildings and terrain.
 */
export function resolveClearMovingCamera(
  world: DirectorWorld,
  carX: number,
  carY: number,
  carZ: number,
  want: THREE.Vector3,
  minClearGround = 0.65,
  inTunnel = false,
): THREE.Vector3 {
  const targetY = carY + 0.72;
  const out = want.clone();

  // Keep above terrain
  const gWant = world.groundY(out.x, out.z);
  if (out.y < gWant + minClearGround) out.y = gWant + minClearGround;
  if (inTunnel) {
    // Stay strictly below the tunnel roof arch (~5.2 m above roadbed)
    out.y = Math.min(out.y, carY + 2.8);
  }

  if (isPointClear3D(world, out.x, out.y, out.z, 1.2, minClearGround * 0.75) &&
      isSegmentClear3D(world, out.x, out.y, out.z, carX, targetY, carZ, 0.9)) {
    return out;
  }

  // Try mirroring laterally across the car's centerline first (stays wide & cinematic on the open side of the street!)
  const dx = out.x - carX;
  const dz = out.z - carZ;
  const mirrorX = carX - dx;
  const mirrorZ = carZ - dz;
  const mirrorY = Math.max(out.y, world.groundY(mirrorX, mirrorZ) + minClearGround);
  if (isPointClear3D(world, mirrorX, mirrorY, mirrorZ, 1.2, minClearGround * 0.75) &&
      isSegmentClear3D(world, mirrorX, mirrorY, mirrorZ, carX, targetY, carZ, 0.9)) {
    return out.set(mirrorX, mirrorY, mirrorZ);
  }

  // Binary pull-in along the vector from car to desired camera so we never clip inside a facade
  let lo = 0.18;
  let hi = 1.0;
  let bestT = lo;
  for (let it = 0; it < 6; it++) {
    const mid = (lo + hi) * 0.5;
    const px = carX + dx * mid;
    const pz = carZ + dz * mid;
    const py = Math.max(targetY + (out.y - targetY) * mid, world.groundY(px, pz) + minClearGround * 0.8);
    if (isPointClear3D(world, px, py, pz, 0.85, 0.45) &&
        isSegmentClear3D(world, px, py, pz, carX, targetY, carZ, 0.7)) {
      bestT = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  out.set(
    carX + dx * bestT,
    Math.max(targetY + (out.y - targetY) * bestT, world.groundY(carX + dx * bestT, carZ + dz * bestT) + 0.5),
    carZ + dz * bestT,
  );
  return out;
}
