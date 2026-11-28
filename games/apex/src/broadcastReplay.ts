// Frame-Accurate Broadcast Replay Engine & Gran Turismo / Forza Camera Director
//
// Records 1:1 vehicle dynamics (exact body pose, true steered wheel angle, brake & rotor glow,
// headlights/wetness, drift/airborne/tunnel/discontinuity flags, RPM, gear, and synchronized
// full-pose opponents) and plays them back via Plajah's Council-guided Replay Director
// (replayDirector.ts) with 3D building/terrain LOS verification and live occlusion recovery.
import * as THREE from 'three';
import {
  DIRECTOR_STYLES,
  type DirectorStyleId,
  type DirectorWorld,
  type DirectedShot,
  MANUAL_SHOT_ORDER,
  REPLAY_FLAG_AIRBORNE,
  REPLAY_FLAG_DISCONTINUITY,
  REPLAY_FLAG_DRIFT,
  REPLAY_FLAG_HEADLIGHTS,
  REPLAY_FLAG_TUNNEL,
  type ReplayOppSample,
  type ReplaySample,
  type ReplayShotType,
  SHOT_LABEL,
  isSegmentClear3D,
  maxObstacleTopNear,
  planBroadcastEdit,
  resolveClearMovingCamera,
  solveStaticRigAnchor,
} from './replayDirector';

export {
  REPLAY_FLAG_AIRBORNE,
  REPLAY_FLAG_DISCONTINUITY,
  REPLAY_FLAG_DRIFT,
  REPLAY_FLAG_HEADLIGHTS,
  REPLAY_FLAG_TUNNEL,
  type DirectorStyleId,
};

// Player frame layout (16 floats):
// 0:t, 1:x, 2:y, 3:z, 4:yaw, 5:pitch, 6:roll, 7:speed, 8:steerAngle,
// 9:brake, 10:wetNight, 11:latSpeed, 12:rpm, 13:gear, 14:hit, 15:flags
const STRIDE = 16;

// Opponent frame layout (10 floats per slot):
// 0:x, 1:y, 2:z, 3:yaw, 4:pitch, 5:roll, 6:speed, 7:steer, 8:brake, 9:wetNight
const OPP_STRIDE = 10;

const MAX_FRAMES = 60 * 60 * 15; // 15 minutes @ 60 Hz
const DISCONTINUITY_JUMP_M = 12.0;

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Time-weighted monotone Cubic Hermite interpolation (Fritsch-Carlson PCHIP):
 * Uses actual frame timestamps (t0, t1, t2, t3) so playback has C1-continuous physical velocity
 * even when recording frames have variable dt (15–60 FPS), with zero surging, stalling, or overshoot!
 */
function monotoneHermite(
  t0: number, p0: number,
  t1: number, p1: number,
  t2: number, p2: number,
  t3: number, p3: number,
  u: number,
): number {
  const h1 = t2 - t1;
  if (h1 <= 1e-6) return p1;
  const d1 = (p2 - p1) / h1;
  const h0 = t1 - t0;
  const h2 = t3 - t2;

  let m1 = d1;
  if (h0 > 1e-6) {
    const d0 = (p1 - p0) / h0;
    if (d0 * d1 > 0) {
      const w0 = 2 * h1 + h0;
      const w1 = h1 + 2 * h0;
      m1 = (w0 + w1) / (w0 / d0 + w1 / d1);
    } else {
      m1 = 0;
    }
  }

  let m2 = d1;
  if (h2 > 1e-6) {
    const d2 = (p3 - p2) / h2;
    if (d1 * d2 > 0) {
      const w1 = 2 * h2 + h1;
      const w2 = h2 + 2 * h1;
      m2 = (w1 + w2) / (w1 / d1 + w2 / d2);
    } else {
      m2 = 0;
    }
  }

  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1
    + (u3 - 2 * u2 + u) * h1 * m1
    + (-2 * u3 + 3 * u2) * p2
    + (u3 - u2) * h1 * m2;
}

export interface ReplayOpponentSource {
  mesh: THREE.Object3D;
  speed?: number;
  steer?: number;
  pitch?: number;
  roll?: number;
  brake?: number;
  wetNight?: number;
}

export interface ReplayRecordFrame {
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
  rpm?: number;
  gear?: number;
  hit?: number;
  flags?: number;
}

export interface ReplayDeps {
  camera: THREE.PerspectiveCamera;
  car: () => THREE.Group | null;
  /** Live opponent / traffic car meshes to record alongside the player car and animate during replay. */
  opponents?: () => ReplayOpponentSource[];
  hAt: (x: number, z: number) => number;
  exag: () => number;
  blocked: (x: number, z: number) => boolean;
  /** Optional 3D building rooftop height oracle at (x, z) expanded by `margin` m (returns -Infinity when clear). */
  buildingTopAt?: (x: number, z: number, margin: number) => number;
  /** Optional tunnel detector so aerial cameras switch cleanly to low tunnel chase rigs. */
  inTunnel?: (x: number, z: number) => boolean;
  lapInfo: () => string;
}

const STYLE_CYCLE: DirectorStyleId[] = ['gt', 'forza', 'auteur'];

export class Replay {
  data = new Float32Array(STRIDE * 4096);
  private oppData = new Float32Array(0);
  private oppCap = 0;
  private savedCar: { pos: THREE.Vector3; rot: THREE.Euler } | null = null;
  private savedOpps: Array<{ mesh: THREE.Object3D; x: number; y: number; z: number; rx: number; ry: number; rz: number }> = [];
  private pendingDiscontinuity = false;

  n = 0;
  active = false;
  paused = false;
  rate = 1;
  pt = 0;
  style: DirectorStyleId = 'gt';

  private shots: DirectedShot[] = [];
  private shotIdx = -1;
  private manualCam: number | null = null;
  private manualShown = false;
  private manualAnchor = new THREE.Vector3();
  private manualAnchorEnd = new THREE.Vector3();
  private manualHasAnchor = false;
  private manualAnchorShotIdx = -1;
  private occludedTimer = 0;
  private overrideType: ReplayShotType | null = null;
  private overrideReason = '';

  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fov = 40;
  private slow = 1;
  private t = 0;
  private smoothDt = 1 / 60;
  private poseSmoothReady = false;
  private sPos = new THREE.Vector3();
  private sYaw = 0;
  private sPitch = 0;
  private sRoll = 0;
  private baseFov = 55;
  private world: DirectorWorld;

  private el: {
    root: HTMLElement;
    top: HTMLElement;
    bot: HTMLElement;
    tag: HTMLElement;
    styleBtn: HTMLElement;
    tower: HTMLElement;
    cam: HTMLElement;
    reason: HTMLElement;
    bar: HTMLElement;
    fill: HTMLElement;
    hint: HTMLElement;
  };

  constructor(private d: ReplayDeps) {
    this.world = {
      groundY: (x: number, z: number) => this.d.hAt(x, z) * this.d.exag(),
      blocked2D: (x: number, z: number) => this.d.blocked(x, z),
      buildingTopAt: this.d.buildingTopAt,
      inTunnel: this.d.inTunnel,
    };

    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;display:none;pointer-events:none;font-family:Outfit,Inter,sans-serif;color:#fff;z-index:30';
    root.innerHTML = `
      <div data-r="top" style="position:absolute;left:0;right:0;top:0;height:0;background:linear-gradient(180deg,rgba(0,0,0,0.94),rgba(0,0,0,0.82));transition:height .45s"></div>
      <div data-r="bot" style="position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(0deg,rgba(0,0,0,0.94),rgba(0,0,0,0.82));transition:height .45s"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 58%,rgba(6,4,14,.52) 100%)"></div>
      <div style="position:absolute;left:26px;top:calc(8vh + 16px);display:flex;align-items:center;gap:10px;pointer-events:auto">
        <div data-r="tag" style="padding:6px 15px 6px 11px;background:#c4122f;font:800 18px Outfit,sans-serif;letter-spacing:.09em;border-radius:3px;box-shadow:0 4px 16px rgba(0,0,0,.45)">&#9679; REPLAY</div>
        <button data-r="styleBtn" style="cursor:pointer;padding:6px 13px;background:rgba(16,12,28,.82);color:#eef6ff;border:1px solid rgba(0,218,243,.45);border-radius:3px;font:700 12px Outfit,sans-serif;letter-spacing:.12em;text-transform:uppercase">DIRECTOR · GT BROADCAST</button>
      </div>
      <div data-r="tower" style="position:absolute;left:26px;top:calc(8vh + 60px);min-width:250px;background:rgba(14,10,24,.78);backdrop-filter:blur(8px);border-left:4px solid #FF8C00;font:600 13px JetBrains Mono,monospace;padding:9px 14px;line-height:1.55;border-radius:0 4px 4px 0"></div>
      <div style="position:absolute;left:26px;bottom:calc(8vh + 50px);display:flex;align-items:center;gap:10px">
        <div data-r="cam" style="padding:6px 14px;background:rgba(14,10,24,.82);backdrop-filter:blur(8px);border-left:4px solid #00DAF3;font:700 14px Outfit,sans-serif;letter-spacing:.13em"></div>
        <div data-r="reason" style="padding:5px 10px;background:rgba(14,10,24,.64);font:600 11px JetBrains Mono,monospace;letter-spacing:.08em;color:#ffd166;border-radius:3px"></div>
      </div>
      <div data-r="bar" style="position:absolute;left:26px;right:26px;bottom:calc(8vh + 24px);height:5px;background:rgba(255,255,255,.18);border-radius:3px"><div data-r="fill" style="height:100%;width:0;background:linear-gradient(90deg,#FF8C00,#00DAF3);border-radius:3px"></div></div>
      <div data-r="hint" style="position:absolute;left:26px;bottom:calc(8vh + 5px);font:500 11px Inter,sans-serif;opacity:.78;letter-spacing:.05em">Space pause · ← → seek 5s · [ ] speed · G director style · C next cut · 1-8 pick camera · Esc return</div>`;
    document.body.appendChild(root);
    const q = (k: string): HTMLElement => root.querySelector(`[data-r="${k}"]`) as HTMLElement;
    this.el = {
      root,
      top: q('top'),
      bot: q('bot'),
      tag: q('tag'),
      styleBtn: q('styleBtn'),
      tower: q('tower'),
      cam: q('cam'),
      reason: q('reason'),
      bar: q('bar'),
      fill: q('fill'),
      hint: q('hint'),
    };
    this.el.styleBtn.addEventListener('click', () => this.cycleStyle());
  }

  get startTime(): number {
    return this.n ? this.data[0] : 0;
  }

  get endTime(): number {
    return this.n ? this.data[(this.n - 1) * STRIDE] : 0;
  }

  get length(): number {
    return this.n > 1 ? Math.max(0, this.endTime - this.startTime) : 0;
  }

  /** Marks the next recorded sample as a hard discontinuity (KeyR reset / respawn) so replay snaps instead of flying through walls. */
  markDiscontinuity(): void {
    this.pendingDiscontinuity = true;
  }

  setStyle(style: DirectorStyleId): void {
    this.style = style;
    if (this.active) {
      this.manualCam = null;
      this.overrideType = null;
      this.plan();
      this.shotIdx = -1;
    }
  }

  cycleStyle(): void {
    const next = STYLE_CYCLE[(STYLE_CYCLE.indexOf(this.style) + 1) % STYLE_CYCLE.length];
    this.setStyle(next);
  }

  record(frame: ReplayRecordFrame): void {
    // Reject non-monotonic timestamps (can happen after a race reset before clear)
    if (this.n > 0 && frame.t <= this.data[(this.n - 1) * STRIDE] + 1e-4) return;

    const opps = this.d.opponents?.() ?? [];
    const needOppCap = opps.length;
    if (needOppCap > this.oppCap) {
      const oldCap = this.oppCap;
      const oldFrameStride = oldCap * OPP_STRIDE;
      const newCap = Math.max(needOppCap, oldCap);
      const newFrameStride = newCap * OPP_STRIDE;
      const frameCap = Math.max(4096, Math.floor(this.data.length / STRIDE));
      const nextOpp = new Float32Array(frameCap * newFrameStride);
      nextOpp.fill(Number.NaN);
      if (oldCap > 0 && this.n > 0) {
        for (let f = 0; f < this.n; f++) {
          nextOpp.set(
            this.oppData.subarray(f * oldFrameStride, f * oldFrameStride + oldFrameStride),
            f * newFrameStride,
          );
        }
      }
      this.oppData = nextOpp;
      this.oppCap = newCap;
    }

    if (this.n * STRIDE >= this.data.length) {
      if (this.n >= MAX_FRAMES) {
        const drop = 600;
        this.data.copyWithin(0, STRIDE * drop);
        if (this.oppCap > 0) this.oppData.copyWithin(0, this.oppCap * OPP_STRIDE * drop);
        this.n -= drop;
      } else {
        const nd = new Float32Array(this.data.length * 2);
        nd.set(this.data);
        this.data = nd;
        if (this.oppCap > 0) {
          const newFrameCap = Math.floor(this.data.length / STRIDE);
          const no = new Float32Array(newFrameCap * this.oppCap * OPP_STRIDE);
          no.fill(Number.NaN);
          no.set(this.oppData);
          this.oppData = no;
        }
      }
    }

    let flags = frame.flags ?? 0;
    if (this.pendingDiscontinuity) {
      flags |= REPLAY_FLAG_DISCONTINUITY;
      this.pendingDiscontinuity = false;
    } else if (this.n > 0) {
      const prevO = (this.n - 1) * STRIDE;
      const jump = Math.hypot(frame.x - this.data[prevO + 1], frame.z - this.data[prevO + 3]);
      if (jump > DISCONTINUITY_JUMP_M) flags |= REPLAY_FLAG_DISCONTINUITY;
    }

    const o = this.n * STRIDE;
    this.data[o] = frame.t;
    this.data[o + 1] = frame.x;
    this.data[o + 2] = frame.y;
    this.data[o + 3] = frame.z;
    this.data[o + 4] = frame.yaw;
    this.data[o + 5] = frame.pitch;
    this.data[o + 6] = frame.roll;
    this.data[o + 7] = frame.speed;
    this.data[o + 8] = frame.steerAngle;
    this.data[o + 9] = frame.brake;
    this.data[o + 10] = frame.wetNight;
    this.data[o + 11] = frame.latSpeed;
    this.data[o + 12] = frame.rpm ?? 0;
    this.data[o + 13] = frame.gear ?? 1;
    this.data[o + 14] = frame.hit ?? 0;
    this.data[o + 15] = flags;

    if (this.oppCap > 0) {
      const base = this.n * this.oppCap * OPP_STRIDE;
      for (let i = 0; i < this.oppCap; i++) {
        const op = opps[i];
        const oo = base + i * OPP_STRIDE;
        if (op) {
          this.oppData[oo] = op.mesh.position.x;
          this.oppData[oo + 1] = op.mesh.position.y;
          this.oppData[oo + 2] = op.mesh.position.z;
          this.oppData[oo + 3] = op.mesh.rotation.y;
          this.oppData[oo + 4] = op.pitch ?? op.mesh.rotation.x;
          this.oppData[oo + 5] = op.roll ?? op.mesh.rotation.z;
          this.oppData[oo + 6] = op.speed ?? 0;
          this.oppData[oo + 7] = op.steer ?? 0;
          this.oppData[oo + 8] = op.brake ?? 0;
          this.oppData[oo + 9] = op.wetNight ?? 0;
        } else {
          this.oppData[oo] = Number.NaN;
        }
      }
    }
    this.n++;
  }

  clear(): void {
    this.n = 0;
    this.oppCap = 0;
    this.oppData = new Float32Array(0);
    this.pendingDiscontinuity = false;
  }

  private findBracket(relT: number): { lo: number; hi: number; f: number } {
    const D = this.data;
    const n = this.n;
    const absT = this.startTime + Math.max(0, Math.min(this.length, relT));
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const m = (lo + hi) >> 1;
      if (D[m * STRIDE] <= absT) lo = m;
      else hi = m;
    }
    const next = Math.min(n - 1, lo + 1);
    const a = lo * STRIDE;
    const b = next * STRIDE;
    const span = D[b] - D[a];
    const f = span > 1e-6 ? Math.min(1, Math.max(0, (absT - D[a]) / span)) : 0;
    return { lo, hi: next, f };
  }

  private isDiscontinuousPair(lo: number, hi: number): boolean {
    if (lo === hi) return false;
    const a = lo * STRIDE;
    const b = hi * STRIDE;
    if ((this.data[b + 15] & REPLAY_FLAG_DISCONTINUITY) !== 0) return true;
    const jump = Math.hypot(this.data[b + 1] - this.data[a + 1], this.data[b + 3] - this.data[a + 3]);
    return jump > DISCONTINUITY_JUMP_M;
  }

  sampleAt(relT: number): ReplaySample {
    const D = this.data;
    const clamped = Math.max(0, Math.min(this.length, relT));
    const { lo, hi, f } = this.findBracket(clamped);
    const a = lo * STRIDE;
    const b = hi * STRIDE;

    // Never interpolate across a reset / water-respawn teleport!
    if (this.isDiscontinuousPair(lo, hi)) {
      const src = f < 0.5 ? a : b;
      return {
        t: clamped,
        x: D[src + 1],
        y: D[src + 2],
        z: D[src + 3],
        yaw: D[src + 4],
        pitch: D[src + 5],
        roll: D[src + 6],
        speed: D[src + 7],
        steerAngle: D[src + 8],
        brake: D[src + 9],
        wetNight: D[src + 10],
        latSpeed: D[src + 11],
        rpm: D[src + 12],
        gear: D[src + 13],
        hit: D[src + 14],
        flags: D[src + 15],
      };
    }

    // Use true time-weighted monotone Cubic Hermite interpolation (C1-continuous velocity even under variable 15–60 fps recording!)
    const p0Idx = lo > 0 && !this.isDiscontinuousPair(lo - 1, lo) ? lo - 1 : lo;
    const p3Idx = hi + 1 < this.n && !this.isDiscontinuousPair(hi, hi + 1) ? hi + 1 : hi;
    const o0 = p0Idx * STRIDE;
    const o3 = p3Idx * STRIDE;
    const t0 = D[o0], t1 = D[a], t2 = D[b], t3 = D[o3];

    return {
      t: clamped,
      x: monotoneHermite(t0, D[o0 + 1], t1, D[a + 1], t2, D[b + 1], t3, D[o3 + 1], f),
      y: monotoneHermite(t0, D[o0 + 2], t1, D[a + 2], t2, D[b + 2], t3, D[o3 + 2], f),
      z: monotoneHermite(t0, D[o0 + 3], t1, D[a + 3], t2, D[b + 3], t3, D[o3 + 3], f),
      yaw: lerpAngle(D[a + 4], D[b + 4], f),
      pitch: D[a + 5] + (D[b + 5] - D[a + 5]) * f,
      roll: D[a + 6] + (D[b + 6] - D[a + 6]) * f,
      speed: D[a + 7] + (D[b + 7] - D[a + 7]) * f,
      steerAngle: D[a + 8] + (D[b + 8] - D[a + 8]) * f,
      brake: D[a + 9] + (D[b + 9] - D[a + 9]) * f,
      wetNight: D[a + 10] + (D[b + 10] - D[a + 10]) * f,
      latSpeed: D[a + 11] + (D[b + 11] - D[a + 11]) * f,
      rpm: D[a + 12] + (D[b + 12] - D[a + 12]) * f,
      gear: Math.round(f < 0.5 ? D[a + 13] : D[b + 13]),
      hit: D[a + 14] + (D[b + 14] - D[a + 14]) * f,
      flags: f < 0.5 ? D[a + 15] : D[b + 15],
    };
  }

  private sampleOpponentsAt(relT: number): ReplayOppSample[] {
    const out: ReplayOppSample[] = [];
    if (this.oppCap <= 0 || this.n < 2) return out;
    const { lo, hi, f } = this.findBracket(relT);
    const frameStride = this.oppCap * OPP_STRIDE;
    const aBase = lo * frameStride;
    const bBase = hi * frameStride;
    for (let i = 0; i < this.oppCap; i++) {
      const oa = aBase + i * OPP_STRIDE;
      const ob = bBase + i * OPP_STRIDE;
      const ax = this.oppData[oa];
      const bx = this.oppData[ob];
      if (!Number.isFinite(ax) && !Number.isFinite(bx)) continue;
      const snap = !Number.isFinite(ax) || !Number.isFinite(bx) || Math.hypot(bx - ax, this.oppData[ob + 2] - this.oppData[oa + 2]) > DISCONTINUITY_JUMP_M;
      const useB = snap && (!Number.isFinite(ax) || f >= 0.5);
      const x = snap ? (useB ? bx : ax) : ax + (bx - ax) * f;
      const y = snap ? (useB ? this.oppData[ob + 1] : this.oppData[oa + 1]) : this.oppData[oa + 1] + (this.oppData[ob + 1] - this.oppData[oa + 1]) * f;
      const z = snap ? (useB ? this.oppData[ob + 2] : this.oppData[oa + 2]) : this.oppData[oa + 2] + (this.oppData[ob + 2] - this.oppData[oa + 2]) * f;
      const yaw = snap ? (useB ? this.oppData[ob + 3] : this.oppData[oa + 3]) : lerpAngle(this.oppData[oa + 3], this.oppData[ob + 3], f);
      const speed = snap ? (useB ? this.oppData[ob + 6] : this.oppData[oa + 6]) : this.oppData[oa + 6] + (this.oppData[ob + 6] - this.oppData[oa + 6]) * f;
      out.push({ x, y, z, yaw, speed });
    }
    return out;
  }

  private plan(): void {
    this.shots = planBroadcastEdit(
      this.length,
      this.style,
      (t) => this.sampleAt(t),
      (t) => this.sampleOpponentsAt(t),
      this.world,
    );
  }

  /** Diagnostics hook for verification & debugging: exposes current shot plan and occlusion state. */
  getDiagnostics(): {
    active: boolean;
    frames: number;
    length: number;
    style: DirectorStyleId;
    shotCount: number;
    shotIdx: number;
    activeShot: string;
    cameraOccluded: boolean;
    camPos: [number, number, number];
  } {
    const sh = this.shots[Math.max(0, this.shotIdx)];
    const s = this.n > 0 ? this.sampleAt(this.pt) : null;
    const occ = s ? !isSegmentClear3D(this.world, this.camPos.x, this.camPos.y, this.camPos.z, s.x, s.y + 0.72, s.z, 0.85) : false;
    return {
      active: this.active,
      frames: this.n,
      length: Number(this.length.toFixed(2)),
      style: this.style,
      shotCount: this.shots.length,
      shotIdx: this.shotIdx,
      activeShot: this.overrideType ?? (this.manualCam !== null ? MANUAL_SHOT_ORDER[this.manualCam] : sh?.type ?? 'none'),
      cameraOccluded: occ,
      camPos: [Number(this.camPos.x.toFixed(1)), Number(this.camPos.y.toFixed(1)), Number(this.camPos.z.toFixed(1))],
    };
  }

  start(): boolean {
    if (this.n < 10 || this.length < 0.3) return false;
    this.active = true;
    this.paused = false;
    this.rate = 1;
    this.pt = 0;
    this.slow = 1;
    this.smoothDt = 1 / 60;
    this.poseSmoothReady = false;
    this.occludedTimer = 0;
    this.overrideType = null;
    this.overrideReason = '';
    this.baseFov = this.d.camera.fov;

    const c = this.d.car();
    this.savedCar = c ? { pos: c.position.clone(), rot: c.rotation.clone() } : null;
    this.savedOpps = (this.d.opponents?.() ?? []).map((o) => ({
      mesh: o.mesh,
      x: o.mesh.position.x,
      y: o.mesh.position.y,
      z: o.mesh.position.z,
      rx: o.mesh.rotation.x,
      ry: o.mesh.rotation.y,
      rz: o.mesh.rotation.z,
    }));

    this.plan();
    this.shotIdx = -1;
    this.manualCam = null;
    this.manualShown = false;
    this.manualHasAnchor = false;
    this.el.root.style.display = 'block';
    requestAnimationFrame(() => {
      this.el.top.style.height = '8vh';
      this.el.bot.style.height = '8vh';
    });
    return true;
  }

  stop(): void {
    this.active = false;
    const c = this.d.car();
    if (c && this.savedCar) {
      c.position.copy(this.savedCar.pos);
      c.rotation.copy(this.savedCar.rot);
    }
    for (const o of this.savedOpps) {
      o.mesh.position.set(o.x, o.y, o.z);
      o.mesh.rotation.set(o.rx, o.ry, o.rz);
    }
    this.savedCar = null;
    this.savedOpps = [];
    this.el.root.style.display = 'none';
    this.el.top.style.height = '0';
    this.el.bot.style.height = '0';
    this.d.camera.fov = this.baseFov;
    this.d.camera.updateProjectionMatrix();
  }

  key(code: string): boolean {
    if (!this.active) return false;
    if (code === 'Escape') { this.stop(); return true; }
    if (code === 'Space') this.paused = !this.paused;
    else if (code === 'ArrowRight') { this.pt = Math.min(this.length, this.pt + 5); this.poseSmoothReady = false; }
    else if (code === 'ArrowLeft') { this.pt = Math.max(0, this.pt - 5); this.poseSmoothReady = false; }
    else if (code === 'BracketRight') this.rate = Math.min(4, this.rate * 2);
    else if (code === 'BracketLeft') this.rate = Math.max(0.125, this.rate / 2);
    else if (code === 'KeyG') this.cycleStyle();
    else if (code === 'KeyC') {
      this.manualCam = null;
      this.overrideType = null;
      const next = this.shots[Math.min(this.shots.length - 1, Math.max(0, this.shotIdx) + 1)];
      this.pt = next ? next.t0 : 0;
    } else if (/^Digit[1-8]$/.test(code)) {
      this.manualCam = Number(code.slice(5)) - 1;
      this.manualShown = false;
      this.manualHasAnchor = false;
      this.overrideType = null;
    }
    return true;
  }

  private local(s: ReplaySample, lx: number, ly: number, lz: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    return out.set(s.x + lx * c + lz * sn, s.y + ly, s.z - lx * sn + lz * c);
  }

  private computeRigFrame(
    type: ReplayShotType,
    shot: DirectedShot,
    u: number,
    s: ReplaySample,
    opps: ReplayOppSample[],
    anchorStart: THREE.Vector3,
    anchorEnd: THREE.Vector3,
    hasAnchor: boolean,
  ): { want: THREE.Vector3; look: THREE.Vector3; fov: number; follow: number; isStatic: boolean } {
    const style = DIRECTOR_STYLES[this.style];
    const speed = Math.abs(s.speed);
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const lx = Math.cos(s.yaw);
    const lz = -Math.sin(s.yaw);
    const inTun = (s.flags & REPLAY_FLAG_TUNNEL) !== 0 || !!this.world.inTunnel?.(s.x, s.z);

    // Rule-of-thirds lead space: look slightly ahead of the car along its travel vector
    const leadDist = Math.min(4.8, 0.8 + speed * 0.065) * style.leadWeight;
    const want = new THREE.Vector3();
    const look = new THREE.Vector3(s.x + fx * leadDist * 0.45, s.y + 0.72, s.z + fz * leadDist * 0.45);
    let fov = 40;
    let follow = 8;
    let isStatic = false;

    switch (type) {
      case 'trackside':
      case 'apex-kerb':
      case 'crane-jib': {
        if (hasAnchor) {
          if (type === 'crane-jib') {
            const ease = u * u * (3 - 2 * u);
            want.lerpVectors(anchorStart, anchorEnd, ease);
          } else {
            want.copy(anchorStart);
          }
          const d = want.distanceTo(look);
          if (type === 'apex-kerb') {
            look.set(s.x + fx * 0.9, s.y + 0.46, s.z + fz * 0.9);
            fov = Math.max(24, Math.min(48, 50 - d * 0.52));
          } else if (type === 'crane-jib') {
            look.set(s.x + fx * leadDist * 0.75, s.y + 0.85, s.z + fz * leadDist * 0.75);
            fov = Math.max(22, Math.min(44, 46 - d * 0.25));
          } else {
            // Classic GT telephoto lens breathing as car streaks past camera
            look.set(s.x + fx * leadDist * 0.5, s.y + 0.74, s.z + fz * leadDist * 0.5);
            fov = Math.max(12, Math.min(34, 430 / Math.max(12, d + 9)));
          }
          follow = 0;
          isStatic = true;
          break;
        }
        // If no static anchor was clear, fall straight into chase-dolly below!
      }
      // eslint-disable-next-line no-fallthrough
      case 'chase-dolly': {
        // Parallel broadcast camera-car tracking beside front-3/4 or rear-3/4 quarter panel
        const sweep = shot.side * (0.68 - u * 0.55);
        const ang = s.yaw + Math.PI + sweep;
        const r = 5.4 + Math.min(2.2, speed * 0.032);
        want.set(s.x + Math.sin(ang) * r, s.y + 1.28 + u * 0.34, s.z + Math.cos(ang) * r);
        look.set(s.x + fx * leadDist * 0.95, s.y + 0.78, s.z + fz * leadDist * 0.95);
        fov = 42 + Math.min(10, speed * 0.11);
        follow = 8.5;
        break;
      }
      case 'battle': {
        // Two-shot framing both player AND nearest rival!
        let bestOpp: ReplayOppSample | null = null;
        let bestD = 32;
        for (const op of opps) {
          const d = Math.hypot(op.x - s.x, op.z - s.z);
          if (d < bestD) { bestD = d; bestOpp = op; }
        }
        if (bestOpp) {
          const midX = (s.x + bestOpp.x) * 0.5;
          const midY = (s.y + bestOpp.y) * 0.5 + 0.8;
          const midZ = (s.z + bestOpp.z) * 0.5;
          const back = Math.max(7.2, bestD * 0.72 + 4.5);
          const sideOff = shot.side * (3.6 + bestD * 0.22);
          want.set(midX - fx * back + lx * sideOff, midY + 2.3 + bestD * 0.08, midZ - fz * back + lz * sideOff);
          look.set(midX + fx * 2.5, midY + 0.2, midZ + fz * 2.5);
          fov = Math.max(32, Math.min(50, 34 + bestD * 0.45));
          follow = 7.5;
        } else {
          // Graceful fallback to low front-3/4 hero tracking
          const ang = s.yaw + shot.side * (0.48 - u * 0.22);
          want.set(s.x + Math.sin(ang) * 6.4, s.y + 1.25, s.z + Math.cos(ang) * 6.4);
          look.set(s.x, s.y + 0.68, s.z);
          fov = 38;
          follow = 8.5;
        }
        break;
      }
      case 'fender-brake': {
        // Tight GT/Forza wheel-arch & glowing brake-disc shot (stays tightly hugged to body = zero building clip!)
        const side = shot.side;
        this.local(s, side * 1.95, 0.44 + s.brake * 0.06, 0.92 - u * 0.55, want);
        this.local(s, side * 0.78, 0.38, 1.42, look);
        fov = 34;
        follow = 14;
        break;
      }
      case 'heli': {
        // Broadcast helicopter sweeping smoothly above downtown skyline (auto-elevated above surrounding roofs)
        const ang = s.yaw + Math.PI + shot.side * (0.78 - u * 1.28);
        const r = 46 - u * 11;
        const rawX = s.x + Math.sin(ang) * r;
        const rawZ = s.z + Math.cos(ang) * r;
        const obstacleTop = maxObstacleTopNear(this.world, rawX, rawZ, 22);
        const h = Math.max(s.y + 34 - u * 6, obstacleTop + 14);
        want.set(rawX, h, rawZ);
        look.set(s.x + fx * 12, s.y + 0.8, s.z + fz * 12);
        fov = 32;
        follow = 3.2;
        break;
      }
      case 'tunnel-chase': {
        // Tight low-slung chase camera guaranteed clear inside tunnels & narrow street canyons
        const dist = inTun ? 4.4 : 4.9;
        const h = inTun ? 1.25 : 1.45;
        want.set(s.x - fx * dist + lx * shot.side * 0.85, s.y + h, s.z - fz * dist + lz * shot.side * 0.85);
        look.set(s.x + fx * 6.0, s.y + 0.78, s.z + fz * 6.0);
        fov = 50 + Math.min(10, speed * 0.12);
        follow = 10;
        break;
      }
    }

    if (!isStatic) {
      want.copy(resolveClearMovingCamera(this.world, s.x, s.y, s.z, want, type === 'fender-brake' ? 0.28 : 0.7, inTun));
    }

    return { want, look, fov, follow, isStatic };
  }

  private applyLivePose(s: ReplaySample, stepDt: number): void {
    const car = this.d.car();
    if (car) {
      car.position.set(s.x, s.y, s.z);
      car.rotation.order = 'YXZ';
      car.rotation.set(s.pitch, s.yaw, s.roll);
      const upd = car.userData.update as
        | ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void)
        | undefined;
      // Pass EXACT recorded steerAngle, headlights, brakeAmt, and wetNightAmt so brake lights, rotors & wheels match 1:1!
      upd?.(s.speed, s.steerAngle, stepDt, (s.flags & REPLAY_FLAG_HEADLIGHTS) !== 0 || s.wetNight > 0.25, s.brake, s.wetNight);
    }

    if (this.oppCap > 0) {
      const opps = this.d.opponents?.() ?? [];
      if (opps.length) {
        const { lo, hi, f } = this.findBracket(this.pt);
        const frameStride = this.oppCap * OPP_STRIDE;
        const aBase = lo * frameStride;
        const bBase = hi * frameStride;
        const nOpp = Math.min(opps.length, this.oppCap);
        for (let i = 0; i < nOpp; i++) {
          const oa = aBase + i * OPP_STRIDE;
          const ob = bBase + i * OPP_STRIDE;
          const ax = this.oppData[oa];
          const bx = this.oppData[ob];
          if (!Number.isFinite(ax) && !Number.isFinite(bx)) continue;
          const snap =
            !Number.isFinite(ax) ||
            !Number.isFinite(bx) ||
            Math.hypot(bx - ax, this.oppData[ob + 2] - this.oppData[oa + 2]) > DISCONTINUITY_JUMP_M;
          const useB = snap && (!Number.isFinite(ax) || f >= 0.5);
          const x = snap ? (useB ? bx : ax) : ax + (bx - ax) * f;
          const y = snap ? (useB ? this.oppData[ob + 1] : this.oppData[oa + 1]) : this.oppData[oa + 1] + (this.oppData[ob + 1] - this.oppData[oa + 1]) * f;
          const z = snap ? (useB ? this.oppData[ob + 2] : this.oppData[oa + 2]) : this.oppData[oa + 2] + (this.oppData[ob + 2] - this.oppData[oa + 2]) * f;
          const yaw = snap ? (useB ? this.oppData[ob + 3] : this.oppData[oa + 3]) : lerpAngle(this.oppData[oa + 3], this.oppData[ob + 3], f);
          const pitch = snap ? (useB ? this.oppData[ob + 4] : this.oppData[oa + 4]) : this.oppData[oa + 4] + (this.oppData[ob + 4] - this.oppData[oa + 4]) * f;
          const roll = snap ? (useB ? this.oppData[ob + 5] : this.oppData[oa + 5]) : this.oppData[oa + 5] + (this.oppData[ob + 5] - this.oppData[oa + 5]) * f;
          const sp = snap ? (useB ? this.oppData[ob + 6] : this.oppData[oa + 6]) : this.oppData[oa + 6] + (this.oppData[ob + 6] - this.oppData[oa + 6]) * f;
          const st = snap ? (useB ? this.oppData[ob + 7] : this.oppData[oa + 7]) : this.oppData[oa + 7] + (this.oppData[ob + 7] - this.oppData[oa + 7]) * f;
          const brk = snap ? (useB ? this.oppData[ob + 8] : this.oppData[oa + 8]) : this.oppData[oa + 8] + (this.oppData[ob + 8] - this.oppData[oa + 8]) * f;
          const wn = snap ? (useB ? this.oppData[ob + 9] : this.oppData[oa + 9]) : this.oppData[oa + 9] + (this.oppData[ob + 9] - this.oppData[oa + 9]) * f;
          const m = opps[i].mesh;
          m.position.set(x, y, z);
          m.rotation.order = 'YXZ';
          m.rotation.set(pitch, yaw, roll);
          const upd = m.userData.update as
            | ((sp: number, st: number, dt: number, lights?: boolean, brake?: number, wetNight?: number) => void)
            | undefined;
          upd?.(sp, st, stepDt, wn > 0.25, brk, wn);
        }
      }
    }
  }

  step(dt: number): void {
    if (!this.active || this.n < 2) return;
    // Smooth playback dt gently so display micro-jitter never causes jerky replay clock stepping
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);
    this.smoothDt += (clampedDt - this.smoothDt) * Math.min(1, clampedDt * 10);
    const playDt = this.smoothDt;
    this.t += playDt;

    // Only apply dramatic slow-mo on genuine high-impact crashes (>= 0.78), never on ordinary driving or minor kerb taps
    const curS = this.sampleAt(this.pt);
    const nextS = this.sampleAt(this.pt + 0.35);
    const heavyCrash = curS.hit >= 0.78 || nextS.hit >= 0.78;
    this.slow += ((heavyCrash ? 0.35 : 1) - this.slow) * Math.min(1, playDt * 4.5);

    if (!this.paused) this.pt += playDt * this.rate * this.slow;
    if (this.pt >= this.length) {
      this.pt = 0;
      this.shotIdx = -1;
      this.overrideType = null;
      this.poseSmoothReady = false;
    }

    const rawS = this.sampleAt(this.pt);
    const opps = this.sampleOpponentsAt(this.pt);
    const stepDt = this.paused ? 0 : playDt * this.rate * this.slow;

    // Lightly filter sub-frame physics suspension chatter & yaw micro-noise (resets instantly on cut, seek, or >6m discontinuity)
    let s = rawS;
    if (!this.poseSmoothReady || Math.hypot(rawS.x - this.sPos.x, rawS.z - this.sPos.z) > 6.0 || (rawS.flags & REPLAY_FLAG_DISCONTINUITY) !== 0) {
      this.sPos.set(rawS.x, rawS.y, rawS.z);
      this.sYaw = rawS.yaw;
      this.sPitch = rawS.pitch;
      this.sRoll = rawS.roll;
      this.poseSmoothReady = true;
    } else if (!this.paused) {
      const kPos = 1 - Math.exp(-playDt * 34);
      const kAng = 1 - Math.exp(-playDt * 20);
      this.sPos.x += (rawS.x - this.sPos.x) * kPos;
      this.sPos.y += (rawS.y - this.sPos.y) * kPos;
      this.sPos.z += (rawS.z - this.sPos.z) * kPos;
      this.sYaw = lerpAngle(this.sYaw, rawS.yaw, kAng);
      this.sPitch += (rawS.pitch - this.sPitch) * kAng;
      this.sRoll += (rawS.roll - this.sRoll) * kAng;
      s = { ...rawS, x: this.sPos.x, y: this.sPos.y, z: this.sPos.z, yaw: this.sYaw, pitch: this.sPitch, roll: this.sRoll };
    }
    this.applyLivePose(s, stepDt);

    if (!this.shots.length) this.plan();
    let idx = this.shots.findIndex((x) => this.pt >= x.t0 && this.pt < x.t1);
    if (idx < 0) idx = Math.max(0, this.shots.length - 1);
    const baseShot = this.shots[idx];

    const cutNow = idx !== this.shotIdx || (this.manualCam !== null && !this.manualShown);
    if (cutNow) {
      this.shotIdx = idx;
      this.manualShown = this.manualCam !== null;
      this.occludedTimer = 0;
      this.overrideType = null;
      this.overrideReason = '';
      if (this.manualCam !== null) {
        const mType = MANUAL_SHOT_ORDER[this.manualCam];
        if (mType === 'trackside' || mType === 'apex-kerb' || mType === 'crane-jib') {
          const samples: ReplaySample[] = [];
          const wEnd = Math.min(this.length, this.pt + 4.0);
          for (let k = 0; k < 7; k++) samples.push(this.sampleAt(this.pt + ((wEnd - this.pt) * k) / 6));
          const solved = solveStaticRigAnchor(this.world, mType, samples, baseShot.side, baseShot.seed);
          if (solved) {
            this.manualAnchor.copy(solved.start);
            this.manualAnchorEnd.copy(solved.end);
            this.manualHasAnchor = true;
          } else {
            this.manualHasAnchor = false;
          }
          this.manualAnchorShotIdx = idx;
        }
      }
    }
    if (this.manualCam === null) this.manualShown = false;

    const activeType: ReplayShotType =
      this.overrideType ?? (this.manualCam !== null ? MANUAL_SHOT_ORDER[this.manualCam] : baseShot.type);
    const useManualAnchor = this.manualCam !== null && this.manualAnchorShotIdx === idx;
    const anchorStart = useManualAnchor ? this.manualAnchor : baseShot.anchor;
    const anchorEnd = useManualAnchor ? this.manualAnchorEnd : baseShot.anchorEnd;
    const hasAnchor = useManualAnchor ? this.manualHasAnchor : baseShot.hasAnchor;

    const u = Math.max(0, Math.min(1, (this.pt - baseShot.t0) / Math.max(0.05, baseShot.t1 - baseShot.t0)));
    let rig = this.computeRigFrame(activeType, baseShot, u, s, opps, anchorStart, anchorEnd, hasAnchor);

    // Live mid-shot 3D occlusion watchdog: if a building/bridge/cliff blocks sightline for > 0.14s,
    // cleanly cut to an unobstructed camera-car dolly / tunnel-chase rig!
    const clearNow = isSegmentClear3D(this.world, rig.want.x, rig.want.y, rig.want.z, s.x, s.y + 0.72, s.z, 0.85);
    if (!clearNow) {
      this.occludedTimer += playDt;
      if (this.occludedTimer > 0.14 && activeType !== 'tunnel-chase' && activeType !== 'fender-brake') {
        const inTun = (s.flags & REPLAY_FLAG_TUNNEL) !== 0 || !!this.world.inTunnel?.(s.x, s.z);
        this.overrideType = inTun ? 'tunnel-chase' : 'chase-dolly';
        this.overrideReason = 'LOS RECOVERY CUT';
        this.occludedTimer = 0;
        rig = this.computeRigFrame(this.overrideType, baseShot, u, s, opps, anchorStart, anchorEnd, false);
        this.camPos.copy(rig.want);
        this.camLook.copy(rig.look);
        this.fov = rig.fov;
      }
    } else {
      this.occludedTimer = Math.max(0, this.occludedTimer - playDt * 2);
    }

    const styleMeta = DIRECTOR_STYLES[this.style];
    if (cutNow) {
      // Snap cleanly on broadcast cuts — never swoop across the city!
      this.camPos.copy(rig.want);
      this.camLook.copy(rig.look);
      this.fov = rig.fov;
    } else {
      if (rig.follow === 0) this.camPos.copy(rig.want);
      else this.camPos.lerp(rig.want, 1 - Math.exp(-playDt * rig.follow));
      this.camLook.lerp(rig.look, 1 - Math.exp(-playDt * styleMeta.panLag));
      this.fov += (rig.fov - this.fov) * (1 - Math.exp(-playDt * 6.5));
    }

    const cam = this.d.camera;
    cam.position.copy(this.camPos);
    if (activeType !== 'heli' && activeType !== 'fender-brake') {
      // Subtle low-frequency broadcast camera breathing (eliminates 39/53 rad/s high-frequency aliasing jitter!)
      const speed = Math.abs(s.speed);
      const prox = 1 / Math.max(1, this.camPos.distanceTo(this.camLook) * 0.08);
      const amp = speed * 0.00008 * styleMeta.shakeScale * (activeType === 'apex-kerb' ? 1.8 : 1.0) * (0.4 + prox);
      cam.position.x += Math.sin(this.t * 3.1) * amp;
      cam.position.y += Math.sin(this.t * 4.3) * amp;
    }
    cam.lookAt(this.camLook);
    if (Math.abs(cam.fov - this.fov) > 0.04) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }

    this.updateUi(activeType, baseShot, s);
  }

  private updateUi(type: ReplayShotType, shot: DirectedShot, s: ReplaySample): void {
    const e = this.el;
    const styleMeta = DIRECTOR_STYLES[this.style];
    e.fill.style.width = `${(this.pt / Math.max(0.01, this.length)) * 100}%`;
    const mm = Math.floor(this.pt / 60);
    const ss = (this.pt % 60).toFixed(1).padStart(4, '0');
    const kmh = Math.round(Math.abs(s.speed) * 3.6);
    const gearStr = s.speed < -0.5 ? 'R' : s.gear <= 0 ? 'N' : String(s.gear);
    const badges: string[] = [];
    if (s.brake > 0.35) badges.push('<span style="color:#ff5252">BRK</span>');
    if ((s.flags & REPLAY_FLAG_DRIFT) !== 0 || Math.abs(s.latSpeed) > 3.2) badges.push('<span style="color:#00daf3">DRIFT</span>');
    if (this.rate !== 1) badges.push(`${this.rate}x`);
    if (this.slow < 0.8) badges.push('SLOW-MO');

    e.styleBtn.textContent = `DIRECTOR · ${styleMeta.label}`;
    e.tower.innerHTML =
      `<div style="opacity:.72;font-size:11px;letter-spacing:.12em">${this.d.lapInfo() || 'FREE ROAM'}</div>` +
      `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;margin-top:2px">` +
      `<span style="font-size:18px;font-weight:800">${kmh} <span style="font-size:11px;opacity:.75">km/h</span></span>` +
      `<span style="color:#ffd166;font-weight:800">G${gearStr}</span>` +
      `<span style="opacity:.85">${mm}:${ss}</span></div>` +
      `<div style="opacity:.72;font-size:10px;letter-spacing:.08em;margin-top:3px">${styleMeta.council}${badges.length ? ' · ' + badges.join(' · ') : ''}${this.paused ? ' · PAUSED' : ''}</div>`;

    const focalEq = Math.round(24 / Math.max(0.15, Math.tan((this.fov * Math.PI) / 360)));
    e.cam.textContent = `CAM ${this.shotIdx + 1} · ${SHOT_LABEL[type]} · ${focalEq}mm`;
    e.reason.textContent = this.overrideReason || (this.manualCam !== null ? 'MANUAL LOCK' : shot.reason);
  }
}
