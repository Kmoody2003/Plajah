import * as THREE from 'three/webgpu';
import type { CarSpec } from './manufacturers';
import { createCarState, stepCarPhysics, type CarInput, type CarState } from './physics';
import type { BoxCollider, SurfaceType } from './world';

export interface RacerEntry {
  id: string;
  isPlayer: boolean;
  driverName: string;
  carName: string;
  paintHex: number;
  spec: CarSpec;
  state: CarState;
  splineT: number;
  laneOffset: number;
  targetLaneOffset: number;
  basePace: number;
  lap: number;
  sector: number;
  bestLapSec: number | null;
  lastLapSec: number | null;
  lapStartTime: number;
  totalProgress: number;
  position: number;
  gapToLeaderSec: number;
  finished: boolean;
  brakeAmt: number;
}

interface SplineSample {
  t: number;
  pos: THREE.Vector3;
  tanX: number;
  tanZ: number;
  rightX: number;
  rightZ: number;
  cumLen: number;
}

const DRIVER_ROSTER: readonly { name: string; paintHex: number; basePace: number }[] = [
  { name: 'L. Vance', paintHex: 0xd92b2b, basePace: 1.015 },
  { name: 'M. Rossi', paintHex: 0x1e6bd6, basePace: 1.005 },
  { name: 'K. Takahashi', paintHex: 0xf0b429, basePace: 0.992 },
  { name: 'S. Lindqvist', paintHex: 0x22a861, basePace: 0.980 },
  { name: 'E. Moreau', paintHex: 0xe66a19, basePace: 0.968 },
  { name: 'D. Alvarez', paintHex: 0x7b3fe4, basePace: 0.955 },
  { name: 'R. Sterling', paintHex: 0x0ea5e9, basePace: 0.940 },
  { name: 'A. Novak', paintHex: 0xec4899, basePace: 0.926 },
  { name: 'T. Lindholm', paintHex: 0x14b8a6, basePace: 0.912 },
  { name: 'C. Ferreira', paintHex: 0x94a3b8, basePace: 0.896 },
  { name: 'J. Mercer', paintHex: 0x84cc16, basePace: 0.880 },
  { name: 'You', paintHex: 0xffffff, basePace: 0.865 },
];

const SPLINE_SAMPLES = 720;
const TRACK_HALF_WIDTH = 5.2;

function wrap01(t: number): number {
  const r = t % 1;
  return r < 0 ? r + 1 : r;
}

function wrapAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class CompetitionEngine {
  public racers: RacerEntry[] = [];
  public totalLaps = 3;
  public circuitLength = 1;

  private curve: THREE.CatmullRomCurve3 | null = null;
  private samples: SplineSample[] = [];
  private completedLapsMap = new Map<string, number>();
  private finishOrderTime = new Map<string, number>();
  private _ranked: RacerEntry[] = [];
  private goElapsed = 0;
  private _sampleA: SplineSample = { t: 0, pos: new THREE.Vector3(), tanX: 0, tanZ: 1, rightX: 1, rightZ: 0, cumLen: 0 };
  private _sampleB: SplineSample = { t: 0, pos: new THREE.Vector3(), tanX: 0, tanZ: 1, rightX: 1, rightZ: 0, cumLen: 0 };
  private _sampleC: SplineSample = { t: 0, pos: new THREE.Vector3(), tanX: 0, tanZ: 1, rightX: 1, rightZ: 0, cumLen: 0 };
  private _proj = { t: 0, lateralOffset: 0, distSq: 0 };

  public createGrid(
    circuitPts: THREE.Vector3[],
    specs: CarSpec[],
    ground: (x: number, z: number) => number,
    options?: { totalLaps?: number; includePlayer?: boolean; totalCars?: number }
  ): RacerEntry[] {
    if (circuitPts.length < 3) {
      throw new Error('CompetitionEngine.createGrid requires at least 3 circuit points.');
    }
    if (specs.length === 0) {
      throw new Error('CompetitionEngine.createGrid requires at least 1 CarSpec.');
    }

    this.totalLaps = options?.totalLaps ?? 3;
    const includePlayer = options?.includePlayer ?? true;

    this.curve = new THREE.CatmullRomCurve3(circuitPts, true, 'centripetal', 0.5);
    this.samples = [];
    this.completedLapsMap.clear();
    this.finishOrderTime.clear();
    this.goElapsed = 0;

    let cumLen = 0;
    let prevPos: THREE.Vector3 | null = null;
    for (let i = 0; i < SPLINE_SAMPLES; i++) {
      const t = i / SPLINE_SAMPLES;
      const pos = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const tanLen = Math.hypot(tan.x, tan.z) || 1;
      const tanX = tan.x / tanLen;
      const tanZ = tan.z / tanLen;
      // Matches physics.ts: fwd = (sinY, cosY), right = (cosY, -sinY)
      const rightX = tanZ;
      const rightZ = -tanX;

      if (prevPos) {
        cumLen += Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z);
      }
      this.samples.push({ t, pos, tanX, tanZ, rightX, rightZ, cumLen });
      prevPos = pos;
    }

    const lastSample = this.samples[this.samples.length - 1];
    const firstSample = this.samples[0];
    this.circuitLength =
      cumLen + Math.hypot(firstSample.pos.x - lastSample.pos.x, firstSample.pos.z - lastSample.pos.z);

    this.racers = [];
    const totalCars = Math.max(2, Math.min(12, options?.totalCars ?? 12));

    for (let i = 0; i < totalCars; i++) {
      const row = Math.floor(i / 2); // 0..5
      const col = i % 2; // 0 = left, 1 = right
      const isPlayer = includePlayer && i === totalCars - 1;

      const roster = DRIVER_ROSTER[i % DRIVER_ROSTER.length];
      const spec = specs[i % specs.length];

      // Staggered 2x6 grid behind the start/finish line (t = 0)
      const distBehindStart = 7 + row * 9.0 + col * 4.2;
      const splineT = wrap01(1 - distBehindStart / this.circuitLength);
      const laneOffset = col === 0 ? -2.7 : 2.7;

      const sp = this.sampleAtT(splineT);
      const x = sp.pos.x + sp.rightX * laneOffset;
      const z = sp.pos.z + sp.rightZ * laneOffset;
      const y = ground(x, z);
      const yaw = Math.atan2(sp.tanX, sp.tanZ);

      const state = createCarState(x, y, z, yaw);
      const id = isPlayer ? 'player' : `ai-${i + 1}`;
      const completedLaps = -1; // Behind start line until crossing t = 0
      this.completedLapsMap.set(id, completedLaps);

      this.racers.push({
        id,
        isPlayer,
        driverName: isPlayer ? 'Player' : roster.name,
        carName: `${spec.manufacturer} ${spec.model}`,
        paintHex: isPlayer ? spec.paintHex : roster.paintHex,
        spec,
        state,
        splineT,
        laneOffset,
        targetLaneOffset: laneOffset,
        basePace: THREE.MathUtils.clamp(roster.basePace, 0.86, 1.02),
        lap: 1,
        sector: 3,
        bestLapSec: null,
        lastLapSec: null,
        lapStartTime: 0,
        totalProgress: completedLaps + splineT,
        position: i + 1,
        gapToLeaderSec: i * 0.25,
        finished: false,
        brakeAmt: 1,
      });
    }

    return this.racers;
  }

  public step(
    dt: number,
    elapsed: number,
    terrainHeight: (x: number, z: number) => number,
    surfaceAt: (x: number, z: number) => SurfaceType,
    colliders: BoxCollider[],
    playerState?: CarState,
    locked = false
  ): RacerEntry[] {
    if (this.racers.length === 0 || this.samples.length === 0) {
      return this.racers;
    }

    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    if (locked) {
      this.goElapsed = 0;
    } else {
      this.goElapsed += safeDt;
    }

    // Sync external player state if provided
    if (playerState) {
      const playerEntry = this.racers.find((r) => r.isPlayer) ?? this.racers[this.racers.length - 1];
      if (playerEntry) {
        playerEntry.isPlayer = true;
        playerEntry.state = playerState;
      }
    }

    // 1. Compute AI inputs & step physics for non-player cars (hold cleanly on grid during 3-2-1 countdown!)
    const maxLat = TRACK_HALF_WIDTH - 0.65;
    for (let i = 0; i < this.racers.length; i++) {
      const entry = this.racers[i];
      if (entry.isPlayer && playerState) {
        continue;
      }

      // Hold AI opponents on the starting grid until GO!, plus realistic 0.04..0.22s human reaction stagger
      const reactionDelay = 0.04 + ((i * 7) % 6) * 0.032;
      if (locked || this.goElapsed < reactionDelay) {
        entry.state.vel.set(0, 0, 0);
        entry.state.angularVel = 0;
        entry.state.forwardSpeed = 0;
        entry.state.lateralSpeed = 0;
        entry.state.speedMps = 0;
        entry.state.gear = 0;
        entry.brakeAmt = 1;
        entry.state.pos.y = terrainHeight(entry.state.pos.x, entry.state.pos.z);
        continue;
      }

      const input = this.computeAIInput(entry, i, safeDt);
      entry.brakeAmt = input.brake;
      stepCarPhysics(entry.state, entry.spec, input, safeDt, terrainHeight, surfaceAt, colliders);

      // Slipstream draft bonus when within 14m directly behind another car
      this.applySlipstreamDraft(entry, i, safeDt);

      // Hard track-corridor barrier containment so AI cars never pierce walls or fly off the circuit
      const cProj = this.projectToSpline(entry.state.pos.x, entry.state.pos.z, entry.splineT);
      const sp = this.sampleAtT(cProj.t, this._sampleC);
      const st = entry.state;
      if (Math.abs(cProj.lateralOffset) > maxLat) {
        const sgn = Math.sign(cProj.lateralOffset);
        st.pos.x = sp.pos.x + sp.rightX * sgn * maxLat;
        st.pos.z = sp.pos.z + sp.rightZ * sgn * maxLat;
        const vFwd = Math.max(0, st.vel.x * sp.tanX + st.vel.z * sp.tanZ) * 0.88;
        const vLat = st.vel.x * sp.rightX + st.vel.z * sp.rightZ;
        // Cancel outward velocity into the barrier and gently bounce inward
        const vLatNew = vLat * sgn > 0 ? -sgn * Math.min(2.2, Math.abs(vLat) * 0.25) : vLat * 0.4;
        st.vel.x = sp.tanX * vFwd + sp.rightX * vLatNew;
        st.vel.z = sp.tanZ * vFwd + sp.rightZ * vLatNew;
        const trackYaw = Math.atan2(sp.tanX, sp.tanZ);
        const yawDiff = wrapAngle(trackYaw - st.yaw);
        st.yaw = wrapAngle(st.yaw + yawDiff * 0.55 - sgn * 0.04);
        st.angularVel *= 0.25;
        st.speedMps = Math.hypot(st.vel.x, st.vel.z);
        st.forwardSpeed = vFwd;
      }
      // Keep AI wheels grounded on track elevation (prevents airborne launches over kerbs/barriers)
      const gY = terrainHeight(st.pos.x, st.pos.z);
      if (st.pos.y > gY + 0.35 || st.pos.y < gY - 0.15) {
        st.pos.y = gY;
        if (st.vel.y > 0) st.vel.y = 0;
        st.isAirborne = false;
      }
    }

    // 2. Update spline progress, laps, sectors, and finish status for all racers
    for (const entry of this.racers) {
      const prevT = entry.splineT;
      const proj = this.projectToSpline(entry.state.pos.x, entry.state.pos.z, prevT);
      entry.splineT = proj.t;
      entry.laneOffset = proj.lateralOffset;

      let completedLaps = this.completedLapsMap.get(entry.id) ?? 0;

      // Detect start/finish line crossing
      if (prevT > 0.85 && proj.t < 0.15) {
        completedLaps += 1;
        this.completedLapsMap.set(entry.id, completedLaps);

        if (completedLaps >= 1) {
          const lapTime = elapsed - entry.lapStartTime;
          if (lapTime > 3.0) {
            entry.lastLapSec = lapTime;
            entry.bestLapSec =
              entry.bestLapSec === null ? lapTime : Math.min(entry.bestLapSec, lapTime);
          }
          entry.lapStartTime = elapsed;
          if (completedLaps >= this.totalLaps && !entry.finished) {
            entry.finished = true;
            this.finishOrderTime.set(entry.id, elapsed);
          }
        } else if (completedLaps === 0) {
          // Crossed start line at launch
          entry.lapStartTime = elapsed;
        }
      } else if (prevT < 0.15 && proj.t > 0.85) {
        completedLaps -= 1;
        this.completedLapsMap.set(entry.id, completedLaps);
      }

      entry.lap = Math.max(1, completedLaps + 1);
      entry.sector = proj.t < 1 / 3 ? 1 : proj.t < 2 / 3 ? 2 : 3;
      entry.totalProgress = completedLaps + proj.t;
    }

    // 3. Update 1..12 live race standings & gap-to-leader times
    const ranked = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) {
        const ta = this.finishOrderTime.get(a.id) ?? Infinity;
        const tb = this.finishOrderTime.get(b.id) ?? Infinity;
        if (ta !== tb) return ta - tb;
      }
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.totalProgress - a.totalProgress;
    });

    const leader = ranked[0];
    for (let posIdx = 0; posIdx < ranked.length; posIdx++) {
      const r = ranked[posIdx];
      r.position = posIdx + 1;
      if (posIdx === 0) {
        r.gapToLeaderSec = 0;
      } else {
        const deltaProgress = Math.max(0, leader.totalProgress - r.totalProgress);
        const distGapM = deltaProgress * this.circuitLength;
        const avgSpeed = Math.max(18, (r.state.speedMps + leader.state.speedMps) * 0.5);
        r.gapToLeaderSec = distGapM / avgSpeed;
      }
    }

    return this.racers;
  }

  private computeAIInput(entry: RacerEntry, selfIdx: number, dt: number): CarInput {
    const state = entry.state;
    const spec = entry.spec;

    // ── A. Car-to-car avoidance & overtaking (within 18m ahead) ──
    const sinY = Math.sin(state.yaw);
    const cosY = Math.cos(state.yaw);
    const fwdX = sinY;
    const fwdZ = cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    let desiredLane = THREE.MathUtils.lerp(entry.targetLaneOffset, 0, 1 - Math.exp(-0.9 * dt));
    let trafficThrottleCap = 1.0;

    for (let j = 0; j < this.racers.length; j++) {
      if (j === selfIdx) continue;
      const other = this.racers[j];
      const dx = other.state.pos.x - state.pos.x;
      const dz = other.state.pos.z - state.pos.z;
      const fwdDot = dx * fwdX + dz * fwdZ;
      const rightDot = dx * rightX + dz * rightZ;

      // Car ahead within 18m
      if (fwdDot > 0.5 && fwdDot < 18.0 && Math.abs(rightDot) < 3.6) {
        const closing = state.speedMps > other.state.speedMps - 1.5;
        if (closing) {
          // Shift left or right into open space to pass cleanly
          const passDir = other.laneOffset >= 0 ? -1 : 1;
          desiredLane = THREE.MathUtils.clamp(
            other.laneOffset + passDir * 3.4,
            -TRACK_HALF_WIDTH + 1.1,
            TRACK_HALF_WIDTH - 1.1
          );
        }
        // Prevent rear-end collision if directly blocked very close
        if (fwdDot < 6.0 && Math.abs(rightDot) < 2.2) {
          trafficThrottleCap = Math.min(trafficThrottleCap, 0.35);
        }
      }

      // Side-by-side clearance nudge
      if (Math.abs(fwdDot) < 4.5 && Math.abs(rightDot) < 2.6) {
        const pushDir = rightDot >= 0 ? -1 : 1;
        desiredLane = THREE.MathUtils.clamp(
          desiredLane + pushDir * 1.8,
          -TRACK_HALF_WIDTH + 1.0,
          TRACK_HALF_WIDTH - 1.0
        );
      }
    }

    entry.targetLaneOffset = THREE.MathUtils.clamp(
      desiredLane,
      -TRACK_HALF_WIDTH + 1.5,
      TRACK_HALF_WIDTH - 1.5
    );

    // ── B. Adaptive curvature-aware lookahead steering (never cuts inside tight hairpins!) ──
    const cornerSpeedLimit = this.computeLookaheadCornerSpeed(entry.splineT, spec, entry.basePace);
    const inTightBend = cornerSpeedLimit < 32;
    const lookaheadM = THREE.MathUtils.clamp(
      (inTightBend ? 8.5 : 11.0) + state.speedMps * (inTightBend ? 0.22 : 0.30),
      8.5,
      25
    );
    const targetT = wrap01(entry.splineT + lookaheadM / this.circuitLength);
    const targetSample = this.sampleAtT(targetT, this._sampleA);
    // Center toward racing apex in tight turns so opponents never clip inner barriers
    const laneUse = inTightBend ? entry.targetLaneOffset * 0.45 : entry.targetLaneOffset;
    const tx = targetSample.pos.x + targetSample.rightX * laneUse;
    const tz = targetSample.pos.z + targetSample.rightZ * laneUse;

    const desiredYaw = Math.atan2(tx - state.pos.x, tz - state.pos.z);
    const yawErr = wrapAngle(desiredYaw - state.yaw);
    const steer = THREE.MathUtils.clamp(yawErr * 2.5 - state.angularVel * 0.22, -1, 1);

    // ── C. Kinematic braking-distance speed control ──
    const topPaceSpeed = spec.topSpeedMps * entry.basePace;
    const targetSpeed = Math.min(cornerSpeedLimit, topPaceSpeed);

    let throttle = 0;
    let brake = 0;
    const speedExcess = state.speedMps - targetSpeed;

    if (speedExcess > 1.4 && state.speedMps > 11.0) {
      brake = THREE.MathUtils.clamp(speedExcess / 9.5, 0.22, 1.0);
      throttle = 0;
    } else if (speedExcess > -1.2 && state.speedMps > 11.0) {
      throttle = 0.30 * trafficThrottleCap;
      brake = 0;
    } else {
      const turnMod = 1 - Math.min(0.45, Math.abs(yawErr) * 0.75);
      throttle = THREE.MathUtils.clamp((0.78 + 0.22 * entry.basePace) * trafficThrottleCap * turnMod, state.speedMps < 10 ? 0.55 : 0, 1);
      brake = 0;
    }

    // Cooldown slightly after finishing
    if (entry.finished) {
      throttle = Math.min(throttle, 0.35);
    }

    return {
      throttle,
      brake,
      steer,
      handbrake: false,
    };
  }

  private computeLookaheadCornerSpeed(splineT: number, spec: CarSpec, basePace: number): number {
    // True kinematic braking envelope across 8..175 m ahead so 180 mph supercars brake smoothly for 90-deg hairpins
    const checkDistances = [8, 16, 26, 40, 56, 76, 100, 130, 165];
    const maxLatAccel = spec.corneringGrip * 9.81 * 0.78;
    const aiBrakeDecel = 13.0; // m/s^2 conservative braking budget (stays clean even on wet tarmac)
    let allowedSpeed = spec.topSpeedMps * basePace;

    for (const distM of checkDistances) {
      for (const stepM of [10, 22]) {
        const tA = wrap01(splineT + distM / this.circuitLength);
        const tB = wrap01(splineT + (distM + stepM) / this.circuitLength);
        const sA = this.sampleAtT(tA, this._sampleA);
        const sB = this.sampleAtT(tB, this._sampleB);

        const dot = THREE.MathUtils.clamp(sA.tanX * sB.tanX + sA.tanZ * sB.tanZ, -1, 1);
        const dTheta = Math.acos(dot);
        const kappa = dTheta / stepM;
        if (kappa > 1e-4) {
          const vCorner = THREE.MathUtils.clamp(Math.sqrt(maxLatAccel / kappa) * basePace, 11.5, spec.topSpeedMps * basePace);
          const brakeDist = Math.max(0, distM - 6);
          const vEntry = Math.sqrt(vCorner * vCorner + 2 * aiBrakeDecel * brakeDist);
          if (vEntry < allowedSpeed) allowedSpeed = vEntry;
        }
      }
    }

    return THREE.MathUtils.clamp(allowedSpeed, 11.5, spec.topSpeedMps * basePace);
  }

  private applySlipstreamDraft(entry: RacerEntry, selfIdx: number, dt: number): void {
    const state = entry.state;
    if (state.speedMps < 16 || state.isAirborne) return;

    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);

    let bestDraft = 0;
    for (let j = 0; j < this.racers.length; j++) {
      if (j === selfIdx) continue;
      const other = this.racers[j];
      const dx = other.state.pos.x - state.pos.x;
      const dz = other.state.pos.z - state.pos.z;
      const fwdDot = dx * fwdX + dz * fwdZ;
      const rightDot = dx * rightX + dz * rightZ;

      if (fwdDot > 2.5 && fwdDot <= 14.0 && Math.abs(rightDot) < 1.8 && other.state.speedMps > 16) {
        const factor = 1 - Math.abs(fwdDot - 7.5) / 8.5;
        bestDraft = Math.max(bestDraft, THREE.MathUtils.clamp(factor, 0, 1));
      }
    }

    if (bestDraft > 0 && state.speedMps < entry.spec.topSpeedMps * 1.05) {
      const draftAccel = 2.4 * bestDraft;
      state.vel.x += fwdX * draftAccel * dt;
      state.vel.z += fwdZ * draftAccel * dt;
    }
  }

  private sampleAtT(t: number, out?: SplineSample): SplineSample {
    const wt = wrap01(t);
    const f = wt * SPLINE_SAMPLES;
    const idx0 = Math.floor(f) % SPLINE_SAMPLES;
    const idx1 = (idx0 + 1) % SPLINE_SAMPLES;
    const alpha = f - Math.floor(f);

    const s0 = this.samples[idx0];
    const s1 = this.samples[idx1];

    const dst = out ?? { t: 0, pos: new THREE.Vector3(), tanX: 0, tanZ: 1, rightX: 1, rightZ: 0, cumLen: 0 };
    dst.t = wt;
    dst.pos.lerpVectors(s0.pos, s1.pos, alpha);
    const tx = THREE.MathUtils.lerp(s0.tanX, s1.tanX, alpha);
    const tz = THREE.MathUtils.lerp(s0.tanZ, s1.tanZ, alpha);
    const tLen = Math.hypot(tx, tz) || 1;
    dst.tanX = tx / tLen;
    dst.tanZ = tz / tLen;
    dst.rightX = dst.tanZ;
    dst.rightZ = -dst.tanX;
    dst.cumLen = THREE.MathUtils.lerp(s0.cumLen, s1.cumLen, alpha);
    return dst;
  }

  private projectToSpline(
    x: number,
    z: number,
    hintT?: number
  ): { t: number; lateralOffset: number; distSq: number } {
    let bestIdx = 0;
    let bestD2 = Infinity;

    if (hintT !== undefined) {
      const centerIdx = Math.floor(wrap01(hintT) * SPLINE_SAMPLES);
      const windowRadius = Math.floor(SPLINE_SAMPLES * 0.08);
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (centerIdx + offset + SPLINE_SAMPLES) % SPLINE_SAMPLES;
        const s = this.samples[idx];
        const dx = x - s.pos.x;
        const dz = z - s.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    }

    // Fallback to full scan if no hint or far from hinted window
    if (hintT === undefined || bestD2 > 45 * 45) {
      bestD2 = Infinity;
      for (let idx = 0; idx < SPLINE_SAMPLES; idx++) {
        const s = this.samples[idx];
        const dx = x - s.pos.x;
        const dz = z - s.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    }

    const s = this.samples[bestIdx];
    const dx = x - s.pos.x;
    const dz = z - s.pos.z;
    const along = dx * s.tanX + dz * s.tanZ;
    const lateralOffset = dx * s.rightX + dz * s.rightZ;
    const t = wrap01(s.t + along / this.circuitLength);

    this._proj.t = t;
    this._proj.lateralOffset = lateralOffset;
    this._proj.distSq = bestD2;
    return this._proj;
  }
}
