import * as THREE from 'three/webgpu';
import type { CarState } from './physics';
import type { WorldData } from './world';

const MPS_TO_MPH = 2.23693629;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ambient AI Traffic System
// ─────────────────────────────────────────────────────────────────────────────

export interface TrafficVehicle {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  speedMps: number;
  brakeLights: boolean;
  paintHex: string;
  roadIndex: number;
  t: number;
  direction: 1 | -1;
  laneOffset: number;
  baseSpeedMps: number;
}

interface TrafficRoad {
  name: string;
  curve: THREE.CatmullRomCurve3;
  length: number;
  closed: boolean;
  laneWidth: number;
  speedLimitMps: number;
}

const TRAFFIC_PAINT_PALETTE = [
  '#d8dde6',
  '#2c3440',
  '#7e8896',
  '#1f4e79',
  '#8c2d2d',
  '#3e5c4a',
  '#c99738',
  '#191c22',
  '#5a6675',
  '#b6462b',
];

export class TrafficManager {
  public readonly vehicles: TrafficVehicle[] = [];
  private readonly roads: TrafficRoad[] = [];
  private readonly terrainHeight: (x: number, z: number) => number;

  // Scratch vectors to avoid per-frame allocations
  private readonly _pNow = new THREE.Vector3();
  private readonly _pAhead = new THREE.Vector3();
  private readonly _tanNow = new THREE.Vector3();
  private readonly _tanAhead = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _toOther = new THREE.Vector3();

  constructor(
    world: Pick<WorldData, 'i196Samples' | 'suburbSamples' | 'terrainHeight'>,
    vehicleCount = 18
  ) {
    this.terrainHeight = world.terrainHeight;

    if (world.i196Samples.length >= 2) {
      const i196Curve = new THREE.CatmullRomCurve3(
        world.i196Samples.map((p) => p.clone()),
        false,
        'catmullrom',
        0.4
      );
      this.roads.push({
        name: 'I-196 Highway',
        curve: i196Curve,
        length: i196Curve.getLength(),
        closed: false,
        laneWidth: 4.0,
        speedLimitMps: 29, // ~65 mph
      });
    }

    if (world.suburbSamples.length >= 3) {
      const suburbCurve = new THREE.CatmullRomCurve3(
        world.suburbSamples.map((p) => p.clone()),
        true,
        'catmullrom',
        0.4
      );
      this.roads.push({
        name: 'Suburban Loop',
        curve: suburbCurve,
        length: suburbCurve.getLength(),
        closed: true,
        laneWidth: 3.3,
        speedLimitMps: 19, // ~42 mph
      });
    }

    this.spawnVehicles(vehicleCount);
  }

  private spawnVehicles(count: number): void {
    this.vehicles.length = 0;
    if (this.roads.length === 0) return;

    for (let i = 0; i < count; i++) {
      // Weight I-196 slightly higher than the shorter suburban loop
      const roadIndex = this.roads.length > 1 && i % 3 === 0 ? 1 : 0;
      const road = this.roads[roadIndex];
      const direction: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const t = ((i * 0.61803398875) % 1 + 1) % 1;
      const baseSpeedMps = road.speedLimitMps * (0.86 + ((i % 5) * 0.04));

      const vehicle: TrafficVehicle = {
        id: `traffic_${i}`,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        yaw: 0,
        speedMps: baseSpeedMps,
        brakeLights: false,
        paintHex: TRAFFIC_PAINT_PALETTE[i % TRAFFIC_PAINT_PALETTE.length],
        roadIndex,
        t,
        direction,
        laneOffset: road.laneWidth,
        baseSpeedMps,
      };

      this.placeVehicleOnSpline(vehicle, road);
      this.vehicles.push(vehicle);
    }
  }

  private placeVehicleOnSpline(vehicle: TrafficVehicle, road: TrafficRoad): void {
    road.curve.getPointAt(vehicle.t, this._pNow);
    road.curve.getTangentAt(vehicle.t, this._tanNow);
    this._tanNow.y = 0;
    if (this._tanNow.lengthSq() < 1e-6) {
      this._tanNow.set(0, 0, 1);
    } else {
      this._tanNow.normalize();
    }

    if (vehicle.direction < 0) {
      this._tanNow.negate();
    }

    // Right-hand side normal in XZ when +Y is up and yaw=0 points +Z
    this._right.set(-this._tanNow.z, 0, this._tanNow.x);

    const x = this._pNow.x + this._right.x * vehicle.laneOffset;
    const z = this._pNow.z + this._right.z * vehicle.laneOffset;
    const y = this.terrainHeight(x, z);

    vehicle.pos.set(x, y, z);
    vehicle.yaw = Math.atan2(this._tanNow.x, this._tanNow.z);
    vehicle.vel.set(
      this._tanNow.x * vehicle.speedMps,
      0,
      this._tanNow.z * vehicle.speedMps
    );
  }

  public update(dt: number, playerState: CarState): void {
    if (dt <= 0 || this.roads.length === 0) return;
    const clampedDt = Math.min(dt, 0.1);

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const road = this.roads[v.roadIndex];
      if (!road || road.length <= 1) continue;

      // Current forward tangent & right vector
      road.curve.getTangentAt(v.t, this._tanNow);
      this._tanNow.y = 0;
      if (this._tanNow.lengthSq() < 1e-6) {
        this._tanNow.set(0, 0, 1);
      } else {
        this._tanNow.normalize();
      }
      if (v.direction < 0) this._tanNow.negate();
      this._right.set(-this._tanNow.z, 0, this._tanNow.x);

      // 1. Look ahead along the spline to slow for curves
      const lookaheadT = (45 / road.length) * v.direction;
      let tAhead = v.t + lookaheadT;
      if (road.closed) {
        tAhead = ((tAhead % 1) + 1) % 1;
      } else {
        tAhead = THREE.MathUtils.clamp(tAhead, 0, 1);
      }

      road.curve.getTangentAt(tAhead, this._tanAhead);
      this._tanAhead.y = 0;
      if (this._tanAhead.lengthSq() > 1e-6) {
        this._tanAhead.normalize();
      }
      if (v.direction < 0) this._tanAhead.negate();

      const dotCurve = THREE.MathUtils.clamp(this._tanNow.dot(this._tanAhead), -1, 1);
      const curveAngle = Math.acos(dotCurve); // radians
      const curveFactor = THREE.MathUtils.clamp(1 - curveAngle * 0.72, 0.35, 1);
      let targetSpeed = v.baseSpeedMps * curveFactor;

      // 2. Slow for the player car if ahead in the same lane corridor
      this._toOther.subVectors(playerState.pos, v.pos);
      this._toOther.y = 0;
      const playerFwd = this._toOther.dot(this._tanNow);
      const playerLat = Math.abs(this._toOther.dot(this._right));
      if (playerFwd > 0 && playerFwd < 50 && playerLat < 3.6) {
        const followFactor = THREE.MathUtils.clamp((playerFwd - 9) / 41, 0, 1);
        const matchSpeed = Math.max(0, playerState.speedMps * 0.95);
        targetSpeed = Math.min(targetSpeed, matchSpeed + followFactor * 10);
      }

      // 3. Slow for other AI traffic vehicles ahead in the same lane
      for (let j = 0; j < this.vehicles.length; j++) {
        if (i === j) continue;
        const other = this.vehicles[j];
        if (other.roadIndex !== v.roadIndex || other.direction !== v.direction) continue;

        this._toOther.subVectors(other.pos, v.pos);
        this._toOther.y = 0;
        const otherFwd = this._toOther.dot(this._tanNow);
        const otherLat = Math.abs(this._toOther.dot(this._right));
        if (otherFwd > 0 && otherFwd < 38 && otherLat < 3.0) {
          const gapFactor = THREE.MathUtils.clamp((otherFwd - 8.5) / 29.5, 0, 1);
          targetSpeed = Math.min(targetSpeed, other.speedMps * gapFactor);
        }
      }

      // Smooth acceleration / braking
      const prevSpeed = v.speedMps;
      const accelRate = targetSpeed < prevSpeed ? 14.0 : 5.5;
      v.speedMps = THREE.MathUtils.lerp(
        prevSpeed,
        targetSpeed,
        1 - Math.exp(-accelRate * clampedDt)
      );
      v.brakeLights = targetSpeed < prevSpeed - 0.8 || v.speedMps < 1.2;

      // Advance along spline
      const dtParam = (v.speedMps * clampedDt) / road.length;
      v.t += dtParam * v.direction;

      if (road.closed) {
        v.t = ((v.t % 1) + 1) % 1;
      } else if (v.t >= 1) {
        v.t = 1;
        v.direction = -1;
      } else if (v.t <= 0) {
        v.t = 0;
        v.direction = 1;
      }

      this.placeVehicleOnSpline(v, road);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Point-to-Point Sprint Races
// ─────────────────────────────────────────────────────────────────────────────

export interface SprintCheckpoint {
  pos: THREE.Vector3;
  radius: number;
  label?: string;
}

export interface PointToPointRoute {
  id: string;
  name: string;
  description: string;
  startYaw: number;
  checkpoints: SprintCheckpoint[];
}

export interface SprintStepResult {
  started: boolean;
  finished: boolean;
  activeCheckpointIndex: number;
  totalCheckpoints: number;
  distanceToNextGate: number;
  elapsedTime: number;
  checkpointReached: number | null;
  splitTime: number | null;
}

function cp(x: number, z: number, radius = 26, label?: string): SprintCheckpoint {
  return { pos: new THREE.Vector3(x, 0, z), radius, label };
}

export const PRESET_SPRINT_ROUTES: PointToPointRoute[] = [
  {
    id: 'ironport_to_pinewood',
    name: 'Ironport to Pinewood Ridge',
    description:
      'High-speed point-to-point sprint from Downtown Ironport west along I-196 into the rolling Pinewood Ridge hills.',
    startYaw: -Math.PI * 0.45,
    checkpoints: [
      cp(6120, -680, 28, 'Ironport West Gate'),
      cp(4400, -450, 28, 'Suburban Interchange'),
      cp(2200, -250, 28, 'Outer Suburbs'),
      cp(0, 120, 28, 'Farmland Crossing'),
      cp(-1800, 280, 28, 'Harvest Valley'),
      cp(-2650, -680, 30, 'Moraine Foothills'),
      cp(-3350, -1650, 34, 'Pinewood Ridge Finish'),
    ],
  },
  {
    id: 'lakeshore_sunset',
    name: 'Lakeshore Sunset Run',
    description:
      'Coastal sprint starting at Harborfest Waterfront, climbing the Lake Michigan bluffs past Great Lakes Raceway to Lighthouse Point.',
    startYaw: -Math.PI * 0.15,
    checkpoints: [
      cp(-6850, 980, 28, 'Harborfest Waterfront'),
      cp(-7450, 160, 28, 'South Bluffs'),
      cp(-7580, -1250, 28, 'Lakeshore Bluffs Mid'),
      cp(-7450, -2100, 28, 'Raceway Access'),
      cp(-7380, -3050, 30, 'Coastal Backstretch'),
      cp(-7250, -3850, 34, 'Lighthouse Point Finish'),
    ],
  },
];

export class PointToPointRace {
  public route: PointToPointRoute;
  public activeCheckpointIndex = 0;
  public splitTimes: number[] = [];
  public elapsedTime = 0;
  public distanceToNextGate = 0;
  public started = false;
  public finished = false;
  public bestTimesByRoute: Record<string, number> = {};

  constructor(initialRoute: string | PointToPointRoute = PRESET_SPRINT_ROUTES[0]) {
    this.route = this.resolveRoute(initialRoute);
  }

  private resolveRoute(routeOrId: string | PointToPointRoute): PointToPointRoute {
    if (typeof routeOrId !== 'string') return routeOrId;
    return (
      PRESET_SPRINT_ROUTES.find((r) => r.id === routeOrId) ??
      PRESET_SPRINT_ROUTES[0]
    );
  }

  public start(routeOrId?: string | PointToPointRoute): void {
    if (routeOrId) {
      this.route = this.resolveRoute(routeOrId);
    }
    this.activeCheckpointIndex = 0;
    this.splitTimes = [];
    this.elapsedTime = 0;
    this.distanceToNextGate = 0;
    this.started = true;
    this.finished = false;
  }

  public reset(): void {
    this.activeCheckpointIndex = 0;
    this.splitTimes = [];
    this.elapsedTime = 0;
    this.distanceToNextGate = 0;
    this.started = false;
    this.finished = false;
  }

  public getActiveCheckpoint(): SprintCheckpoint | null {
    if (this.finished || this.activeCheckpointIndex >= this.route.checkpoints.length) {
      return null;
    }
    return this.route.checkpoints[this.activeCheckpointIndex];
  }

  public getProgress(): number {
    const total = this.route.checkpoints.length;
    if (total === 0) return 0;
    if (this.finished) return 1;
    return this.activeCheckpointIndex / total;
  }

  public step(state: CarState, dt: number): SprintStepResult {
    const totalCheckpoints = this.route.checkpoints.length;

    if (!this.started || this.finished || totalCheckpoints === 0) {
      return {
        started: this.started,
        finished: this.finished,
        activeCheckpointIndex: this.activeCheckpointIndex,
        totalCheckpoints,
        distanceToNextGate: this.distanceToNextGate,
        elapsedTime: this.elapsedTime,
        checkpointReached: null,
        splitTime: null,
      };
    }

    this.elapsedTime += Math.max(0, dt);

    const gate = this.route.checkpoints[this.activeCheckpointIndex];
    const dx = state.pos.x - gate.pos.x;
    const dz = state.pos.z - gate.pos.z;
    this.distanceToNextGate = Math.hypot(dx, dz);

    let checkpointReached: number | null = null;
    let splitTime: number | null = null;

    if (this.distanceToNextGate <= gate.radius) {
      checkpointReached = this.activeCheckpointIndex;
      splitTime = this.elapsedTime;
      this.splitTimes.push(splitTime);
      this.activeCheckpointIndex += 1;

      if (this.activeCheckpointIndex >= totalCheckpoints) {
        this.finished = true;
        this.distanceToNextGate = 0;
        const prevBest = this.bestTimesByRoute[this.route.id];
        if (prevBest === undefined || this.elapsedTime < prevBest) {
          this.bestTimesByRoute[this.route.id] = this.elapsedTime;
        }
      } else {
        const nextGate = this.route.checkpoints[this.activeCheckpointIndex];
        this.distanceToNextGate = Math.hypot(
          state.pos.x - nextGate.pos.x,
          state.pos.z - nextGate.pos.z
        );
      }
    }

    return {
      started: this.started,
      finished: this.finished,
      activeCheckpointIndex: this.activeCheckpointIndex,
      totalCheckpoints,
      distanceToNextGate: this.distanceToNextGate,
      elapsedTime: this.elapsedTime,
      checkpointReached,
      splitTime,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Open-World Challenges (Speed Traps, Drift Zones, Danger Signs)
// ─────────────────────────────────────────────────────────────────────────────

export interface SpeedTrapChallenge {
  id: string;
  name: string;
  pos: THREE.Vector3;
  radius: number;
  targetMph: number;
  personalBestMph: number;
  cooldownSec: number;
}

export interface DriftZoneChallenge {
  id: string;
  name: string;
  entryPos: THREE.Vector3;
  exitPos: THREE.Vector3;
  gateRadius: number;
  corridorWidth: number;
  targetScore: number;
  personalBestScore: number;
}

export interface DangerSignChallenge {
  id: string;
  name: string;
  pos: THREE.Vector3;
  radius: number;
  targetDistanceM: number;
  personalBestDistanceM: number;
  personalBestAirtimeSec: number;
}

export type ChallengeType = 'speed_trap' | 'drift_zone' | 'danger_sign';

/** region/festival.json (tools/plan_festival.py) */
export interface FestivalData {
  sites: { id: string; name: string; kind: 'main' | 'outpost'; stage: string; x: number; z: number; y: number; pad?: boolean }[];
  access?: { site: string; kind: string; half: number; xz: number[][] }[];   // gravel access tracks to the stages
  speedTraps: { id: string; name: string; x: number; z: number; dir: number[]; road: string; targetMph: number }[];
  speedZones: { id: string; name: string; a: number[]; b: number[]; road: string; targetMph: number }[];
  driftZones: { id: string; name: string; a: number[]; b: number[]; road: string; targetScore: number }[];
  dangerSigns: { id: string; name: string; x: number; z: number; dir: number[]; road: string; targetM: number }[];
}

export interface ChallengeEvent {
  challengeId: string;
  type: ChallengeType;
  title: string;
  subtitle: string;
  status: 'active' | 'completed' | 'failed';
  value: number;
  unit: 'mph' | 'pts' | 'm';
  target: number;
  isPersonalBest: boolean;
  stars: 0 | 1 | 2 | 3;
  airtimeSec?: number;
}

interface ActiveDriftRun {
  zone: DriftZoneChallenge;
  enteredFrom: 'entry' | 'exit';
  score: number;
  elapsedSec: number;
}

interface ActiveJumpRun {
  sign: DangerSignChallenge;
  takeoffPos: THREE.Vector3;
  airtimeSec: number;
  hasLeftGround: boolean;
  elapsedSinceTriggerSec: number;
}

function computeStars(value: number, target: number): 0 | 1 | 2 | 3 {
  if (value >= target * 1.25) return 3;
  if (value >= target) return 2;
  if (value >= target * 0.7) return 1;
  return 0;
}

export class OpenWorldChallengeManager {
  public speedTraps: SpeedTrapChallenge[];
  public driftZones: DriftZoneChallenge[];
  public dangerSigns: DangerSignChallenge[];

  public activeDriftRun: ActiveDriftRun | null = null;
  public activeJumpRun: ActiveJumpRun | null = null;

  constructor(festival?: FestivalData | null) {
    this.speedTraps = [
      {
        id: 'trap_i196_straight',
        name: 'I-196 Harvest Straight',
        pos: new THREE.Vector3(-1200, 0, 260),
        radius: 24,
        targetMph: 145,
        personalBestMph: 0,
        cooldownSec: 0,
      },
      {
        id: 'trap_ironport_bridge',
        name: 'Ironport Riverfront',
        pos: new THREE.Vector3(6900, 0, -340),
        radius: 22,
        targetMph: 120,
        personalBestMph: 0,
        cooldownSec: 0,
      },
      {
        id: 'trap_lakeshore_bluffs',
        name: 'Lakeshore Bluffs',
        pos: new THREE.Vector3(-7520, 0, -600),
        radius: 24,
        targetMph: 130,
        personalBestMph: 0,
        cooldownSec: 0,
      },
    ];

    this.driftZones = [
      {
        id: 'drift_suburban_s',
        name: 'Suburban S-Bends',
        entryPos: new THREE.Vector3(4400, 0, -450),
        exitPos: new THREE.Vector3(4100, 0, -1850),
        gateRadius: 24,
        corridorWidth: 1600,
        targetScore: 18000,
        personalBestScore: 0,
      },
      {
        id: 'drift_foundry_quay',
        name: 'Foundry Quay Hairpins',
        entryPos: new THREE.Vector3(6600, 0, 420),
        exitPos: new THREE.Vector3(6150, 0, 740),
        gateRadius: 22,
        corridorWidth: 420,
        targetScore: 12000,
        personalBestScore: 0,
      },
    ];

    this.dangerSigns = [
      {
        id: 'jump_silver_lake_crest',
        name: 'Silver Lake Dune Crest',
        pos: new THREE.Vector3(-7450, 0, 2650),
        radius: 26,
        targetDistanceM: 85,
        personalBestDistanceM: 0,
        personalBestAirtimeSec: 0,
      },
      {
        id: 'jump_moraine_ridge',
        name: 'Pinewood Ridge Crest',
        pos: new THREE.Vector3(-3350, 0, -1650),
        radius: 26,
        targetDistanceM: 70,
        personalBestDistanceM: 0,
        personalBestAirtimeSec: 0,
      },
    ];
    // the festival map (region/festival.json, tools/plan_festival.py): stunts placed on the real roads replace the built-in set
    if (festival) {
      const v = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);
      if (festival.speedTraps?.length) this.speedTraps = festival.speedTraps.map((t) => ({ id: t.id, name: t.name, pos: v(t.x, t.z), radius: 24, targetMph: t.targetMph, personalBestMph: 0, cooldownSec: 0 }));
      if (festival.driftZones?.length) this.driftZones = festival.driftZones.map((d) => ({ id: d.id, name: d.name, entryPos: v(d.a[0], d.a[1]), exitPos: v(d.b[0], d.b[1]), gateRadius: 22, corridorWidth: Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) * 1.3, targetScore: d.targetScore, personalBestScore: 0 }));
      if (festival.dangerSigns?.length) this.dangerSigns = festival.dangerSigns.map((j) => ({ id: j.id, name: j.name, pos: v(j.x, j.z), radius: 26, targetDistanceM: j.targetM, personalBestDistanceM: 0, personalBestAirtimeSec: 0 }));
    }
  }

  public step(state: CarState, dt: number): ChallengeEvent[] {
    const events: ChallengeEvent[] = [];
    const safeDt = Math.max(0, Math.min(dt, 0.2));

    this.stepSpeedTraps(state, safeDt, events);
    this.stepDriftZones(state, safeDt, events);
    this.stepDangerSigns(state, safeDt, events);

    return events;
  }

  private stepSpeedTraps(
    state: CarState,
    dt: number,
    events: ChallengeEvent[]
  ): void {
    for (const trap of this.speedTraps) {
      if (trap.cooldownSec > 0) {
        trap.cooldownSec = Math.max(0, trap.cooldownSec - dt);
        continue;
      }

      const dist = Math.hypot(state.pos.x - trap.pos.x, state.pos.z - trap.pos.z);
      if (dist <= trap.radius) {
        const mph = state.speedMps * MPS_TO_MPH;
        const isPB = mph > trap.personalBestMph;
        if (isPB) {
          trap.personalBestMph = mph;
        }
        trap.cooldownSec = 4.0;

        const stars = computeStars(mph, trap.targetMph);
        events.push({
          challengeId: trap.id,
          type: 'speed_trap',
          title: trap.name,
          subtitle: isPB
            ? `New Personal Best: ${mph.toFixed(1)} MPH`
            : `Speed Trap: ${mph.toFixed(1)} MPH`,
          status: 'completed',
          value: mph,
          unit: 'mph',
          target: trap.targetMph,
          isPersonalBest: isPB,
          stars,
        });
      }
    }
  }

  private stepDriftZones(
    state: CarState,
    dt: number,
    events: ChallengeEvent[]
  ): void {
    if (this.activeDriftRun) {
      const run = this.activeDriftRun;
      run.elapsedSec += dt;

      if (state.isDrifting) {
        const driftRate =
          state.speedMps * 14 + Math.abs(state.lateralSpeed) * 28;
        run.score += driftRate * dt;
      }

      const finishGate =
        run.enteredFrom === 'entry' ? run.zone.exitPos : run.zone.entryPos;
      const distToExit = Math.hypot(
        state.pos.x - finishGate.x,
        state.pos.z - finishGate.z
      );

      if (distToExit <= run.zone.gateRadius && run.elapsedSec > 1.0) {
        const finalScore = Math.round(run.score);
        const isPB = finalScore > run.zone.personalBestScore;
        if (isPB) {
          run.zone.personalBestScore = finalScore;
        }
        const stars = computeStars(finalScore, run.zone.targetScore);

        events.push({
          challengeId: run.zone.id,
          type: 'drift_zone',
          title: run.zone.name,
          subtitle: isPB
            ? `New Personal Best: ${finalScore.toLocaleString()} PTS`
            : `Drift Zone Complete: ${finalScore.toLocaleString()} PTS`,
          status: 'completed',
          value: finalScore,
          unit: 'pts',
          target: run.zone.targetScore,
          isPersonalBest: isPB,
          stars,
        });

        this.activeDriftRun = null;
        return;
      }

      // Cancel if player wanders too far from the zone corridor
      const midX = (run.zone.entryPos.x + run.zone.exitPos.x) * 0.5;
      const midZ = (run.zone.entryPos.z + run.zone.exitPos.z) * 0.5;
      const distFromMid = Math.hypot(state.pos.x - midX, state.pos.z - midZ);
      if (distFromMid > run.zone.corridorWidth) {
        events.push({
          challengeId: run.zone.id,
          type: 'drift_zone',
          title: run.zone.name,
          subtitle: 'Drift Zone Failed — Left Corridor',
          status: 'failed',
          value: Math.round(run.score),
          unit: 'pts',
          target: run.zone.targetScore,
          isPersonalBest: false,
          stars: 0,
        });
        this.activeDriftRun = null;
        return;
      }

      // Live HUD update while inside the drift zone
      events.push({
        challengeId: run.zone.id,
        type: 'drift_zone',
        title: run.zone.name,
        subtitle: state.isDrifting ? 'DRIFTING' : 'Keep Drifting to Exit Gate',
        status: 'active',
        value: Math.round(run.score),
        unit: 'pts',
        target: run.zone.targetScore,
        isPersonalBest: false,
        stars: computeStars(run.score, run.zone.targetScore),
      });
      return;
    }

    // Check for entry into any drift zone
    for (const zone of this.driftZones) {
      const dEntry = Math.hypot(
        state.pos.x - zone.entryPos.x,
        state.pos.z - zone.entryPos.z
      );
      const dExit = Math.hypot(
        state.pos.x - zone.exitPos.x,
        state.pos.z - zone.exitPos.z
      );

      if (dEntry <= zone.gateRadius || dExit <= zone.gateRadius) {
        this.activeDriftRun = {
          zone,
          enteredFrom: dEntry <= zone.gateRadius ? 'entry' : 'exit',
          score: 0,
          elapsedSec: 0,
        };
        events.push({
          challengeId: zone.id,
          type: 'drift_zone',
          title: zone.name,
          subtitle: 'Drift Zone Started',
          status: 'active',
          value: 0,
          unit: 'pts',
          target: zone.targetScore,
          isPersonalBest: false,
          stars: 0,
        });
        break;
      }
    }
  }

  private stepDangerSigns(
    state: CarState,
    dt: number,
    events: ChallengeEvent[]
  ): void {
    if (this.activeJumpRun) {
      const run = this.activeJumpRun;
      run.elapsedSinceTriggerSec += dt;

      if (state.isAirborne) {
        if (!run.hasLeftGround) {
          run.hasLeftGround = true;
          run.takeoffPos.copy(state.pos);
        }
        run.airtimeSec += dt;

        const liveDist = Math.hypot(
          state.pos.x - run.takeoffPos.x,
          state.pos.z - run.takeoffPos.z
        );
        events.push({
          challengeId: run.sign.id,
          type: 'danger_sign',
          title: run.sign.name,
          subtitle: `Airborne · ${run.airtimeSec.toFixed(2)}s`,
          status: 'active',
          value: liveDist,
          unit: 'm',
          target: run.sign.targetDistanceM,
          isPersonalBest: false,
          stars: computeStars(liveDist, run.sign.targetDistanceM),
          airtimeSec: run.airtimeSec,
        });
      } else if (run.hasLeftGround) {
        // Landed
        const jumpDistanceM = Math.hypot(
          state.pos.x - run.takeoffPos.x,
          state.pos.z - run.takeoffPos.z
        );
        const isPB = jumpDistanceM > run.sign.personalBestDistanceM;
        if (isPB) {
          run.sign.personalBestDistanceM = jumpDistanceM;
        }
        if (run.airtimeSec > run.sign.personalBestAirtimeSec) {
          run.sign.personalBestAirtimeSec = run.airtimeSec;
        }

        events.push({
          challengeId: run.sign.id,
          type: 'danger_sign',
          title: run.sign.name,
          subtitle: isPB
            ? `New Personal Best: ${jumpDistanceM.toFixed(1)}m (${run.airtimeSec.toFixed(2)}s)`
            : `Jump Landed: ${jumpDistanceM.toFixed(1)}m (${run.airtimeSec.toFixed(2)}s)`,
          status: 'completed',
          value: jumpDistanceM,
          unit: 'm',
          target: run.sign.targetDistanceM,
          isPersonalBest: isPB,
          stars: computeStars(jumpDistanceM, run.sign.targetDistanceM),
          airtimeSec: run.airtimeSec,
        });
        this.activeJumpRun = null;
      } else if (run.elapsedSinceTriggerSec > 2.5) {
        // Player drove through the ramp zone without leaving the ground
        this.activeJumpRun = null;
      }
      return;
    }

    for (const sign of this.dangerSigns) {
      const dist = Math.hypot(state.pos.x - sign.pos.x, state.pos.z - sign.pos.z);
      if (dist <= sign.radius && (state.isAirborne || state.speedMps > 12)) {
        this.activeJumpRun = {
          sign,
          takeoffPos: state.pos.clone(),
          airtimeSec: 0,
          hasLeftGround: state.isAirborne,
          elapsedSinceTriggerSec: 0,
        };
        break;
      }
    }
  }
}
