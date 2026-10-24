/**
 * halloweenFilterEngine.ts
 *
 * Real-time Halloween Face & Camera Filter Engine for the Taleo Halloween Curation Vault
 * Persistent Chat Room & Fan Room.
 *
 * Supports:
 *  - 'jackolantern' : Realistic 3D-shaded carved Jack-o'-Lantern head replacement with
 *                     articulated talking jaw (driven by real face mouth openness / audio),
 *                     deep pumpkin ribs, twisted stem, and flickering internal plasma/candle fire.
 *  - 'ghostface'    : Realistic spectral phantom / elongated scream visage conformed to the
 *                     tracked head, shrouded hood, hollow void eyes, and jaw that stretches into
 *                     a haunting wail when speaking.
 *  - 'zombie'       : Realistic necrotic undead horror transformation — corpse-pallor skin grade,
 *                     branching dark vascular veins, sunken cheekbone sinew, milky bloodshot
 *                     undead eyes tracking gaze, and exposed rotting teeth/jaw on speech.
 *  - 'werewolf'     : Realistic lycanthrope transformation — layered coarse wolf fur around brow,
 *                     cheeks & jaw, twitching lupine ears, wet black canine snout, glowing
 *                     predatory amber-gold irises, and snarling ivory fangs when talking.
 *  - 'vampire'      : Realistic aristocratic Gothic / Nosferatu vampire — marble-pale skin,
 *                     bruised crimson-violet periorbital hollows, hypnotic blood-crimson slit
 *                     irises, pointed ears, and gleaming upper canine fangs with blood droplets.
 *  - 'bats'         : Multi-depth nocturnal bat swarm with flapping leathery wings, glowing
 *                     ember eyes, and ultrasonic echolocation ripples (can be primary or additive).
 *
 * Plus independent stackable toggles:
 *  - dimLightsMode  : "Dim the Lights" Found-Footage Night Mode — crushes ambient room light into
 *                     pitch darkness with a harsh handheld camera flashlight / IR beam locked onto
 *                     the talking head, floating dust motes in the beam, night-cam grain, and
 *                     camcorder REC telemetry OSD.
 *  - batSwarmOverlay: Additive nocturnal bat swarm that can fly across any active face filter.
 */

import { AsyncFaceTracker } from '../vtuber/faceTrackerAsync';
import { FaceTracker, type FaceFrame } from '../vtuber/faceTracker';
import { DetectFeed } from '../vtuber/detectFeed';
import type { FaceEyes } from '../vtuber/eyeGeometry';

export type HalloweenFilterId =
  | 'none'
  | 'jackolantern'
  | 'ghostface'
  | 'zombie'
  | 'werewolf'
  | 'vampire'
  | 'bats';

export interface HalloweenFilterMeta {
  id: HalloweenFilterId;
  label: string;
  shortLabel: string;
  icon: string;
  accent: string;
  blurb: string;
}

export const HALLOWEEN_FILTERS: HalloweenFilterMeta[] = [
  {
    id: 'none',
    label: 'Natural Camera',
    shortLabel: 'Off',
    icon: '🎥',
    accent: '#94A3B8',
    blurb: 'Unfiltered camera feed (stackable with Dim the Lights or Bats)',
  },
  {
    id: 'jackolantern',
    label: "Jack-o'-Lantern Head",
    shortLabel: "Jack-o'-Lantern",
    icon: '🎃',
    accent: '#F97316',
    blurb: 'Turns any talking head into a carved 3D pumpkin with blazing internal fire & hinged jaw',
  },
  {
    id: 'ghostface',
    label: 'Ghost Face Phantom',
    shortLabel: 'Ghost Face',
    icon: '👻',
    accent: '#E2E8F0',
    blurb: 'Shrouded spectral scream visage whose hollow jaw elongates as you speak',
  },
  {
    id: 'zombie',
    label: 'Necrotic Zombie',
    shortLabel: 'Zombie',
    icon: '🧟',
    accent: '#84CC16',
    blurb: 'Undead pallor, dark branching veins, milky cataract eyes & exposed rotting jaw',
  },
  {
    id: 'werewolf',
    label: 'Full-Moon Werewolf',
    shortLabel: 'Werewolf',
    icon: '🐺',
    accent: '#F59E0B',
    blurb: 'Coarse timber-wolf fur, lupine snout, glowing amber eyes & snapping fangs',
  },
  {
    id: 'vampire',
    label: 'Count Vampire',
    shortLabel: 'Vampire',
    icon: '🧛',
    accent: '#EF4444',
    blurb: 'Marble-pale Nosferatu/Tepes complexion, blood-crimson slit irises & razor fangs',
  },
  {
    id: 'bats',
    label: 'Nocturnal Bat Swarm',
    shortLabel: 'Bat Swarm',
    icon: '🦇',
    accent: '#A855F7',
    blurb: 'Depth-layered colony of leathery bats swooping around your head & across the lens',
  },
];

/** Where the tracked head is on the canvas, for layers that draw their own face (3D characters). */
export interface FilterFacePose {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** In-picture tilt, radians. */
  roll: number;
  /** Head turn (-1..1-ish radians), negative = toward the canvas's left. */
  yaw: number;
  /** Nod, positive = looking down. */
  pitch: number;
  mouthOpen: number;
  /** MediaPipe expression scores for a real tracked face (engine built with expressions on). */
  blendshapes: Record<string, number> | null;
  /** MediaPipe facial transformation matrix (4×4, column-major) of the UNMIRRORED camera frame. */
  headMatrix: ArrayLike<number> | null;
}

export type FaceLayer = (ctx: CanvasRenderingContext2D, face: FilterFacePose, W: number, H: number, nowMs: number) => void;

interface TrackedFace {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  roll: number;
  eyes: [
    { x: number; y: number; r: number; gx: number; gy: number; open: number },
    { x: number; y: number; r: number; gx: number; gy: number; open: number }
  ];
  mouth: { x: number; y: number; w: number; open: number };
  seenAt: number;
  alpha: number;
  // Targets for smooth interpolation
  tcx: number;
  tcy: number;
  trx: number;
  try_: number;
  troll: number;
  teyes: [
    { x: number; y: number; r: number; gx: number; gy: number; open: number },
    { x: number; y: number; r: number; gx: number; gy: number; open: number }
  ];
  tmouth: { x: number; y: number; w: number; open: number };
}

interface BatParticle {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  z: number; // depth 0.2 (far) .. 1.6 (foreground close-up)
  vx: number;
  vy: number;
  wingPhase: number;
  wingSpeed: number;
  orbitAngle: number;
  orbitRadius: number;
  eyeColor: string;
}

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export class HalloweenFilterEngine {
  private filter: HalloweenFilterId = 'jackolantern';
  private dimLights = false;
  private batSwarm = false;
  private audioMouthBoost = 0;
  private mirrored = false;
  private faceLayer: FaceLayer | null = null;
  /** Ask the tracker for blendshapes too (3D characters copy the performer's expressions). */
  private readonly expressions: boolean;
  private blendshapes: Record<string, number> | null = null;
  private headMatrix: ArrayLike<number> | null = null;
  private blendAt = -1e9;

  private worker = new AsyncFaceTracker();
  private sync: FaceTracker | null = null;
  private feed = new DetectFeed();
  private faceState: 'idle' | 'loading' | 'worker' | 'sync' | 'failed' = 'idle';
  private lastSend = -1e9;
  private lastTs = -1;
  private lastSync = -1e9;
  private lastApply = 0;

  private tracks: TrackedFace[] = [];
  private bats: BatParticle[] = [];
  private dust: DustMote[] = [];

  // Flashlight beam smooth tracking target (normalized 0..1)
  private beamX = 0.5;
  private beamY = 0.46;

  constructor(opts: { expressions?: boolean } = {}) {
    this.expressions = !!opts.expressions;
    this.initBats();
    this.initDust();
    this.ensureFaceTracker();
  }

  private initBats() {
    const colors = ['#f97316', '#ef4444', '#fbbf24', '#a855f7'];
    this.bats = Array.from({ length: 22 }, (_, i) => {
      const z = 0.3 + (i / 22) * 1.35;
      return {
        x: Math.random(),
        y: 0.12 + Math.random() * 0.72,
        z,
        vx: (Math.random() > 0.5 ? 1 : -1) * (0.08 + Math.random() * 0.18) * z,
        vy: (Math.random() - 0.5) * 0.08,
        wingPhase: Math.random() * Math.PI * 2,
        wingSpeed: 11 + Math.random() * 8,
        orbitAngle: (i / 22) * Math.PI * 2,
        orbitRadius: 0.14 + (i % 5) * 0.055,
        eyeColor: colors[i % colors.length],
      };
    });
  }

  private initDust() {
    this.dust = Array.from({ length: 38 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.025,
      vy: -0.015 - Math.random() * 0.025,
      size: 1 + Math.random() * 2.4,
      alpha: 0.2 + Math.random() * 0.55,
    }));
  }

  private ensureFaceTracker() {
    if (this.faceState !== 'idle') return;
    this.faceState = 'loading';
    const opts = this.expressions ? { numFaces: 1, blendshapes: true } : { numFaces: 2, blendshapes: false };
    this.worker.init(opts).then(async (ok) => {
      if (ok) {
        this.faceState = 'worker';
        return;
      }
      const s = new FaceTracker();
      if (await s.init(opts)) {
        this.sync = s;
        this.faceState = 'sync';
      } else {
        this.faceState = 'failed';
      }
    });
  }

  setFilter(id: HalloweenFilterId) {
    this.filter = id;
    if (id !== 'none') this.ensureFaceTracker();
  }

  getFilter(): HalloweenFilterId {
    return this.filter;
  }

  /** Tracker state + whether a real face is locked (for the room's status pill and dev checks). */
  getTrackingStatus(nowMs = performance.now()) {
    return {
      state: this.faceState,
      locked: this.tracks.some((t) => nowMs - t.seenAt < 650),
    };
  }

  /** Draw this instead of the selected filter on the tracked face (null = back to filters). */
  setFaceLayer(layer: FaceLayer | null) {
    this.faceLayer = layer;
    if (layer) this.ensureFaceTracker();
  }

  /** Set when the caller draws the video flipped horizontally (selfie view). */
  setMirrored(on: boolean) {
    this.mirrored = on;
  }

  setDimLights(on: boolean) {
    this.dimLights = on;
  }

  getDimLights(): boolean {
    return this.dimLights;
  }

  setBatSwarm(on: boolean) {
    this.batSwarm = on;
  }

  getBatSwarm(): boolean {
    return this.batSwarm;
  }

  /** Optional microphone RMS / speech energy (0..1) to drive jaw movement even more responsively. */
  setAudioLevel(level: number) {
    this.audioMouthBoost = Math.max(0, Math.min(1, level));
  }

  private feedVideoFaces(src: HTMLVideoElement, nowMs: number, W: number, H: number) {
    if (src.readyState < 2 || !src.videoWidth) return;
    const gap = 1000 / 28;
    let frame: FaceFrame | null = null;
    let fresh = false;

    if (this.faceState === 'worker') {
      if (nowMs - this.lastSend >= gap) {
        this.lastTs = Math.max(this.lastTs + 1, Math.round(nowMs));
        this.worker.send(this.feed.src(src), this.lastTs);
        this.lastSend = nowMs;
      }
      const r = this.worker.poll();
      fresh = r.fresh;
      frame = r.frame;
    } else if (this.faceState === 'sync' && this.sync && nowMs - this.lastSync >= 90) {
      this.lastTs = Math.max(this.lastTs + 1, Math.round(nowMs));
      frame = this.sync.detect(this.feed.src(src), this.lastTs);
      this.lastSync = nowMs;
      fresh = true;
    }

    if (fresh && frame?.blendshapes && Object.keys(frame.blendshapes).length) {
      this.blendshapes = frame.blendshapes;
      this.headMatrix = frame.matrix ?? null;
      this.blendAt = nowMs;
    }
    if (fresh && frame?.faces && frame.faces.length > 0) {
      this.ingestDetectedFaces(frame.faces, src.videoWidth, src.videoHeight, W, H, nowMs);
    }
  }

  private ingestDetectedFaces(
    faces: FaceEyes[],
    vw: number,
    vh: number,
    W: number,
    H: number,
    nowMs: number
  ) {
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2;
    const oy = (H - vh * s) / 2;
    // A selfie view draws the webcam mirrored, so landmarks must be mirrored too or every mask
    // lands on the opposite side of the face.
    const mx = (nx: number) => (this.mirrored ? W - (nx * vw * s + ox) : nx * vw * s + ox);
    const gs = this.mirrored ? -1 : 1;

    for (const f of faces) {
      const e0 = {
        x: mx(f.eyes[0].cx),
        y: f.eyes[0].cy * vh * s + oy,
        r: Math.hypot(f.eyes[0].dx * vw, f.eyes[0].dy * vh) * s * 0.65,
        gx: gs * f.eyes[0].gx,
        gy: f.eyes[0].gy,
        open: f.eyes[0].open,
      };
      const e1 = {
        x: mx(f.eyes[1].cx),
        y: f.eyes[1].cy * vh * s + oy,
        r: Math.hypot(f.eyes[1].dx * vw, f.eyes[1].dy * vh) * s * 0.65,
        gx: gs * f.eyes[1].gx,
        gy: f.eyes[1].gy,
        open: f.eyes[1].open,
      };
      // Ensure e0 is left-most in canvas space for consistent orientation
      const [leftEye, rightEye] = e0.x <= e1.x ? [e0, e1] : [e1, e0];
      const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

      const m = {
        x: mx(f.mouth.cx),
        y: f.mouth.cy * vh * s + oy,
        w: Math.hypot(f.mouth.dx * vw, f.mouth.dy * vh) * s,
        open: Math.max(f.mouth.open, this.audioMouthBoost * 0.55),
      };

      const bb = f.bbox;
      const cx = mx(bb.x + bb.w / 2);
      const cy = (bb.y + bb.h / 2) * vh * s + oy;
      const rx = (bb.w * vw * s * 0.5) * 1.12;
      const ry = (bb.h * vh * s * 0.5) * 1.18;

      let best = this.tracks[0];
      if (!best) {
        best = {
          cx,
          cy,
          rx,
          ry,
          roll,
          eyes: [{ ...leftEye }, { ...rightEye }],
          mouth: { ...m },
          seenAt: nowMs,
          alpha: 1,
          tcx: cx,
          tcy: cy,
          trx: rx,
          try_: ry,
          troll: roll,
          teyes: [{ ...leftEye }, { ...rightEye }],
          tmouth: { ...m },
        };
        this.tracks.push(best);
      } else {
        best.seenAt = nowMs;
        best.tcx = cx;
        best.tcy = cy;
        best.trx = rx;
        best.try_ = ry;
        best.troll = roll;
        best.teyes = [{ ...leftEye }, { ...rightEye }];
        best.tmouth = { ...m };
      }
    }
  }

  /**
   * Ensures there is always a valid tracked face — if the user is using the simulated demo talking-head
   * or if MediaPipe hasn't locked onto a face yet, synthesizes a natural breathing/talking head anchor
   * in the center of the frame so every Halloween filter works immediately!
   */
  private stepAndEnsureTracks(dt: number, nowMs: number, W: number, H: number) {
    const tSec = nowMs / 1000;
    const hasRecentRealFace = this.tracks.some((t) => nowMs - t.seenAt < 650);

    if (!hasRecentRealFace) {
      const swayX = Math.sin(tSec * 1.15) * W * 0.025 + Math.cos(tSec * 2.3) * W * 0.008;
      const swayY = Math.sin(tSec * 1.7) * H * 0.016;
      const cx = W * 0.5 + swayX;
      const cy = H * 0.45 + swayY;
      const rx = Math.min(W, H) * 0.21;
      const ry = rx * 1.24;
      const roll = Math.sin(tSec * 0.95) * 0.065;

      // Simulated natural talking cadence + audio boost
      const speechWave =
        Math.max(0, Math.sin(tSec * 6.8) * 0.6 + Math.sin(tSec * 11.3) * 0.4) *
        (0.35 + 0.65 * Math.max(0, Math.sin(tSec * 1.6)));
      const mouthOpen = Math.max(this.audioMouthBoost * 0.65, speechWave * 0.42);
      const gazeX = Math.sin(tSec * 0.8) * 0.22;
      const gazeY = Math.cos(tSec * 1.1) * 0.12;

      const eyeOffsetX = rx * 0.41;
      const eyeOffsetY = -ry * 0.12;
      const eyeR = rx * 0.21;

      const synthLeft = {
        x: cx - eyeOffsetX,
        y: cy + eyeOffsetY,
        r: eyeR,
        gx: gazeX,
        gy: gazeY,
        open: 0.3,
      };
      const synthRight = {
        x: cx + eyeOffsetX,
        y: cy + eyeOffsetY,
        r: eyeR,
        gx: gazeX,
        gy: gazeY,
        open: 0.3,
      };
      const synthMouth = {
        x: cx,
        y: cy + ry * 0.42,
        w: rx * 0.82,
        open: mouthOpen,
      };

      if (this.tracks.length === 0) {
        this.tracks.push({
          cx,
          cy,
          rx,
          ry,
          roll,
          eyes: [synthLeft, synthRight],
          mouth: synthMouth,
          seenAt: nowMs - 700,
          alpha: 1,
          tcx: cx,
          tcy: cy,
          trx: rx,
          try_: ry,
          troll: roll,
          teyes: [synthLeft, synthRight],
          tmouth: synthMouth,
        });
      } else {
        const tr = this.tracks[0];
        tr.tcx = cx;
        tr.tcy = cy;
        tr.trx = rx;
        tr.try_ = ry;
        tr.troll = roll;
        tr.teyes = [synthLeft, synthRight];
        tr.tmouth = synthMouth;
        tr.alpha = 1;
      }
    }

    const kPos = 1 - Math.exp(-dt * 20);
    const kMouth = 1 - Math.exp(-dt * 30);

    for (const t of this.tracks) {
      t.cx += (t.tcx - t.cx) * kPos;
      t.cy += (t.tcy - t.cy) * kPos;
      t.rx += (t.trx - t.rx) * kPos;
      t.ry += (t.try_ - t.ry) * kPos;
      t.roll += (t.troll - t.roll) * kPos;
      for (let i = 0; i < 2; i++) {
        t.eyes[i].x += (t.teyes[i].x - t.eyes[i].x) * kPos;
        t.eyes[i].y += (t.teyes[i].y - t.eyes[i].y) * kPos;
        t.eyes[i].r += (t.teyes[i].r - t.eyes[i].r) * kPos;
        t.eyes[i].gx += (t.teyes[i].gx - t.eyes[i].gx) * kPos;
        t.eyes[i].gy += (t.teyes[i].gy - t.eyes[i].gy) * kPos;
      }
      t.mouth.x += (t.tmouth.x - t.mouth.x) * kPos;
      t.mouth.y += (t.tmouth.y - t.mouth.y) * kPos;
      t.mouth.w += (t.tmouth.w - t.mouth.w) * kPos;
      const targetOpen = Math.max(t.tmouth.open, this.audioMouthBoost * 0.65);
      t.mouth.open += (targetOpen - t.mouth.open) * kMouth;
    }
  }

  /**
   * Main per-frame entry point: applies the selected Halloween face filter, bat swarm,
   * and "Dim the Lights" Found-Footage Night Beam mode onto `canvas` in place.
   */
  apply(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    srcVideo: HTMLVideoElement | null,
    nowMs: number
  ) {
    const W = canvas.width;
    const H = canvas.height;
    if (!W || !H) return;

    const dt = Math.max(
      1 / 120,
      Math.min(0.1, this.lastApply ? (nowMs - this.lastApply) / 1000 : 1 / 30)
    );
    this.lastApply = nowMs;

    if (srcVideo) {
      this.feedVideoFaces(srcVideo, nowMs, W, H);
    }
    this.stepAndEnsureTracks(dt, nowMs, W, H);

    const face = this.tracks[0];
    const tSec = nowMs / 1000;

    // 1. Background bats (behind the face) if 'bats' filter or batSwarm overlay is active
    const showBats = this.filter === 'bats' || this.batSwarm;
    if (showBats) {
      this.stepBats(dt, tSec, face, W, H);
      this.drawBatsLayer(ctx, W, H, tSec, 0, 0.85);
    }

    // 2. Primary Halloween Face Filter (or the caller's own face layer)
    if (face && this.faceLayer) {
      const pose = poseOf(face);
      const live = nowMs - face.seenAt < 650 && nowMs - this.blendAt < 650;
      pose.blendshapes = live ? this.blendshapes : null;
      pose.headMatrix = live ? this.headMatrix : null;
      this.faceLayer(ctx, pose, W, H, nowMs);
    } else if (face) {
      switch (this.filter) {
        case 'jackolantern':
          this.drawJackOLantern(ctx, face, W, H, tSec);
          break;
        case 'ghostface':
          this.drawGhostFace(ctx, face, W, H, tSec);
          break;
        case 'zombie':
          this.drawZombieFace(ctx, face, W, H, tSec);
          break;
        case 'werewolf':
          this.drawWerewolfFace(ctx, face, W, H, tSec);
          break;
        case 'vampire':
          this.drawVampireFace(ctx, face, W, H, tSec);
          break;
        default:
          break;
      }
    }

    // 3. Foreground bats swooping across the camera lens
    if (showBats) {
      this.drawBatsLayer(ctx, W, H, tSec, 0.85, 2.5);
    }

    // 4. "Dim the Lights" Mode — Found-Footage Night Video & Camera Flashlight Beam
    if (this.dimLights) {
      this.drawDimLightsFoundFootage(ctx, face, W, H, dt, tSec);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. JACK-O'-LANTERN TALKING HEAD FILTER
  // ─────────────────────────────────────────────────────────────────────────────
  private drawJackOLantern(
    ctx: CanvasRenderingContext2D,
    f: TrackedFace,
    W: number,
    H: number,
    tSec: number
  ) {
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.roll);

    const rx = f.rx * 1.18;
    const ry = f.ry * 0.98;
    const jawDrop = Math.min(ry * 0.45, f.mouth.open * ry * 0.92);
    const flicker = 0.88 + 0.12 * Math.sin(tSec * 23.0) * Math.cos(tSec * 14.7);

    // Warm orange furnace glow cast onto shoulders/neck beneath the pumpkin
    const neckGlow = ctx.createRadialGradient(0, ry * 0.85, rx * 0.1, 0, ry * 1.15, rx * 1.65);
    neckGlow.addColorStop(0, `rgba(251, 146, 60, ${0.42 * flicker})`);
    neckGlow.addColorStop(0.5, `rgba(234, 88, 12, ${0.18 * flicker})`);
    neckGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neckGlow;
    ctx.beginPath();
    ctx.ellipse(0, ry * 1.0, rx * 1.6, ry * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Drop shadow behind pumpkin head
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.08 + jawDrop * 0.3, rx * 1.08, ry * 1.04 + jawDrop * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gnarled woody pumpkin stem on top
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-rx * 0.16, -ry * 0.86);
    ctx.bezierCurveTo(-rx * 0.22, -ry * 1.24, rx * 0.04, -ry * 1.38, rx * 0.24, -ry * 1.28);
    ctx.bezierCurveTo(rx * 0.16, -ry * 1.12, rx * 0.14, -ry * 0.96, rx * 0.18, -ry * 0.85);
    ctx.closePath();
    const stemGrad = ctx.createLinearGradient(-rx * 0.2, -ry * 1.3, rx * 0.2, -ry * 0.85);
    stemGrad.addColorStop(0, '#3f2e1e');
    stemGrad.addColorStop(0.5, '#293818');
    stemGrad.addColorStop(1, '#1c1917');
    ctx.fillStyle = stemGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(2, rx * 0.025);
    ctx.strokeStyle = '#0c0a09';
    ctx.stroke();
    ctx.restore();

    // Multi-ribbed 3D pumpkin rind (drawn from outer ribs inward for genuine volumetric overlap)
    const ribs = [
      { ox: -0.74, w: 0.42, h: 0.90, shade: -0.28 },
      { ox: 0.74, w: 0.42, h: 0.90, shade: -0.28 },
      { ox: -0.46, w: 0.46, h: 0.97, shade: -0.12 },
      { ox: 0.46, w: 0.46, h: 0.97, shade: -0.12 },
      { ox: -0.21, w: 0.44, h: 1.02, shade: 0.04 },
      { ox: 0.21, w: 0.44, h: 1.02, shade: 0.04 },
      { ox: 0.0, w: 0.46, h: 1.04, shade: 0.14 },
    ];

    for (const rib of ribs) {
      const rCx = rib.ox * rx;
      const rRx = rib.w * rx;
      const rRy = rib.h * ry + jawDrop * (1 - Math.abs(rib.ox) * 0.65);

      const g = ctx.createRadialGradient(
        rCx - rRx * 0.22,
        -rRy * 0.28,
        rRx * 0.08,
        rCx,
        rRy * 0.1,
        Math.max(rRx, rRy) * 1.15
      );
      if (rib.shade > 0) {
        g.addColorStop(0, '#fdba74');
        g.addColorStop(0.32, '#f97316');
        g.addColorStop(0.76, '#c2410c');
        g.addColorStop(1, '#431407');
      } else if (rib.shade > -0.2) {
        g.addColorStop(0, '#fb923c');
        g.addColorStop(0.4, '#ea580c');
        g.addColorStop(0.8, '#9a3412');
        g.addColorStop(1, '#3b0f04');
      } else {
        g.addColorStop(0, '#ea580c');
        g.addColorStop(0.45, '#b45309');
        g.addColorStop(0.85, '#7c2d12');
        g.addColorStop(1, '#270902');
      }

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(rCx, jawDrop * 0.22, rRx, rRy, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep vertical crease groove between ribs
      ctx.lineWidth = Math.max(1.5, rx * 0.022);
      ctx.strokeStyle = 'rgba(28, 10, 3, 0.72)';
      ctx.stroke();
    }

    // Organic mottled surface texture / aged rind spots
    ctx.fillStyle = 'rgba(40, 12, 3, 0.18)';
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + 0.4;
      const bx = Math.cos(ang) * rx * 0.62;
      const by = Math.sin(ang) * ry * 0.58;
      ctx.beginPath();
      ctx.ellipse(bx, by, rx * 0.06, ry * 0.04, ang, 0, Math.PI * 2);
      ctx.fill();
    }

    // Helper for carved cavity with bevelled inner pumpkin flesh & blazing fire
    const drawCarvedCavity = (drawPath: () => void, bevelOffsetY: number) => {
      // 1. Inner golden-amber carved rind thickness (bevel)
      ctx.save();
      ctx.translate(0, bevelOffsetY);
      drawPath();
      ctx.fillStyle = '#d97706';
      ctx.fill();
      ctx.lineWidth = Math.max(2.5, rx * 0.04);
      ctx.strokeStyle = '#78350f';
      ctx.stroke();
      ctx.restore();

      // 2. Blazing internal candle/plasma fire
      ctx.save();
      drawPath();
      ctx.clip();
      const fireGrad = ctx.createRadialGradient(
        0,
        ry * 0.25 + Math.sin(tSec * 19) * ry * 0.04,
        rx * 0.04,
        0,
        0,
        rx * 0.95
      );
      fireGrad.addColorStop(0, `rgba(255, 255, 240, ${0.98 * flicker})`);
      fireGrad.addColorStop(0.28, `rgba(253, 224, 71, ${0.96 * flicker})`);
      fireGrad.addColorStop(0.62, `rgba(249, 115, 22, ${0.92 * flicker})`);
      fireGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = fireGrad;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2.5);

      // Rising internal flame tongues
      for (let k = -2; k <= 2; k++) {
        const fx = k * rx * 0.22 + Math.sin(tSec * 14 + k * 2.1) * rx * 0.05;
        const fh = ry * (0.35 + 0.15 * Math.sin(tSec * 21 + k));
        const fg = ctx.createLinearGradient(fx, ry * 0.6, fx, -fh);
        fg.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
        fg.addColorStop(0.6, 'rgba(249, 115, 22, 0.55)');
        fg.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.ellipse(fx, ry * 0.2, rx * 0.12, fh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 3. Sharp charred inner rim outline
      drawPath();
      ctx.lineWidth = Math.max(2, rx * 0.025);
      ctx.strokeStyle = '#1c0a00';
      ctx.stroke();
    };

    // Carved Jagged Triangular Eyes (reacting to blink/gaze)
    const ex = rx * 0.36;
    const ey = -ry * 0.16;
    const ew = rx * 0.27;
    const eh = ry * 0.25;

    // Left carved eye
    drawCarvedCavity(() => {
      ctx.beginPath();
      ctx.moveTo(-ex - ew * 0.85, ey + eh * 0.38);
      ctx.lineTo(-ex - ew * 0.08, ey - eh * 0.82);
      ctx.lineTo(-ex + ew * 0.78, ey + eh * 0.22);
      ctx.lineTo(-ex + ew * 0.12, ey + eh * 0.45);
      ctx.closePath();
    }, ry * 0.035);

    // Right carved eye
    drawCarvedCavity(() => {
      ctx.beginPath();
      ctx.moveTo(ex + ew * 0.85, ey + eh * 0.38);
      ctx.lineTo(ex + ew * 0.08, ey - eh * 0.82);
      ctx.lineTo(ex - ew * 0.78, ey + eh * 0.22);
      ctx.lineTo(ex - ew * 0.12, ey + eh * 0.45);
      ctx.closePath();
    }, ry * 0.035);

    // Carved Triangular Nose Slit
    drawCarvedCavity(() => {
      ctx.beginPath();
      ctx.moveTo(0, -ry * 0.02);
      ctx.lineTo(-rx * 0.12, ry * 0.19);
      ctx.lineTo(rx * 0.12, ry * 0.19);
      ctx.closePath();
    }, ry * 0.028);

    // Carved Jagged Jack-o'-Lantern Grin — Hinges open with real-time mouth openness!
    const my = ry * 0.36;
    const mw = rx * 0.72;
    const baseOpen = ry * 0.13 + jawDrop * 0.88;

    drawCarvedCavity(() => {
      ctx.beginPath();
      // Left corner of grin
      ctx.moveTo(-mw, my - ry * 0.12);
      // Upper jagged teeth
      ctx.lineTo(-mw * 0.68, my + ry * 0.04);
      ctx.lineTo(-mw * 0.52, my - ry * 0.06);
      ctx.lineTo(-mw * 0.28, my + ry * 0.08);
      ctx.lineTo(-mw * 0.14, my - ry * 0.03);
      ctx.lineTo(mw * 0.14, my - ry * 0.03);
      ctx.lineTo(mw * 0.28, my + ry * 0.08);
      ctx.lineTo(mw * 0.52, my - ry * 0.06);
      ctx.lineTo(mw * 0.68, my + ry * 0.04);
      // Right corner of grin
      ctx.lineTo(mw, my - ry * 0.12);
      // Lower hinged jaw with jagged teeth (moves down by baseOpen)
      ctx.lineTo(mw * 0.76, my + baseOpen * 0.82);
      ctx.lineTo(mw * 0.46, my + baseOpen * 0.48);
      ctx.lineTo(mw * 0.32, my + baseOpen * 0.98);
      ctx.lineTo(0, my + baseOpen * 1.05);
      ctx.lineTo(-mw * 0.32, my + baseOpen * 0.98);
      ctx.lineTo(-mw * 0.46, my + baseOpen * 0.48);
      ctx.lineTo(-mw * 0.76, my + baseOpen * 0.82);
      ctx.closePath();
    }, -ry * 0.032);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. GHOST FACE PHANTOM FILTER (Elongated Scream Mask + Dark Shroud)
  // ─────────────────────────────────────────────────────────────────────────────
  private drawGhostFace(
    ctx: CanvasRenderingContext2D,
    f: TrackedFace,
    W: number,
    H: number,
    tSec: number
  ) {
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.roll);

    const rx = f.rx * 1.08;
    const ry = f.ry * 1.15;
    const screamStretch = Math.min(ry * 0.68, f.mouth.open * ry * 1.25);

    // 1. Dark Reaper Hood / Shroud cowling framing the head
    const hoodGrad = ctx.createRadialGradient(0, -ry * 0.1, rx * 0.6, 0, ry * 0.2, rx * 1.65);
    hoodGrad.addColorStop(0, '#090a0f');
    hoodGrad.addColorStop(0.7, '#030407');
    hoodGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hoodGrad;
    ctx.beginPath();
    ctx.moveTo(0, -ry * 1.32);
    ctx.bezierCurveTo(rx * 1.45, -ry * 1.15, rx * 1.55, ry * 0.55, rx * 1.15, ry * 1.45 + screamStretch);
    ctx.lineTo(-rx * 1.15, ry * 1.45 + screamStretch);
    ctx.bezierCurveTo(-rx * 1.55, ry * 0.55, -rx * 1.45, -ry * 1.15, 0, -ry * 1.32);
    ctx.closePath();
    ctx.fill();

    // 2. Elongated Pale Phantom Mask (stretches downward with mouth openness)
    ctx.beginPath();
    ctx.moveTo(0, -ry * 0.94);
    // Upper cranium
    ctx.bezierCurveTo(rx * 0.88, -ry * 0.92, rx * 0.92, -ry * 0.18, rx * 0.68, ry * 0.18);
    // Sunken gaunt cheeks tapering into elongated screaming chin
    ctx.bezierCurveTo(
      rx * 0.42,
      ry * 0.54,
      rx * 0.44,
      ry * 0.96 + screamStretch,
      0,
      ry * 1.06 + screamStretch
    );
    ctx.bezierCurveTo(
      -rx * 0.44,
      ry * 0.96 + screamStretch,
      -rx * 0.42,
      ry * 0.54,
      -rx * 0.68,
      ry * 0.18
    );
    ctx.bezierCurveTo(-rx * 0.92, -ry * 0.18, -rx * 0.88, -ry * 0.92, 0, -ry * 0.94);
    ctx.closePath();

    const maskGrad = ctx.createRadialGradient(-rx * 0.18, -ry * 0.25, rx * 0.1, 0, ry * 0.2, ry * 1.3);
    maskGrad.addColorStop(0, '#f8fafc');
    maskGrad.addColorStop(0.55, '#e2e8f0');
    maskGrad.addColorStop(0.85, '#94a3b8');
    maskGrad.addColorStop(1, '#334155');
    ctx.fillStyle = maskGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(2, rx * 0.03);
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // Subtle gaunt cheekbone shadow hollows
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.46, ry * 0.24, rx * 0.14, ry * 0.28, 0.25, 0, Math.PI * 2);
    ctx.ellipse(rx * 0.46, ry * 0.24, rx * 0.14, ry * 0.28, -0.25, 0, Math.PI * 2);
    ctx.fill();

    // 3. Drooping Hollow Weeping Eye Cavities
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(dir * rx * 0.14, -ry * 0.22);
      ctx.bezierCurveTo(
        dir * rx * 0.42,
        -ry * 0.36,
        dir * rx * 0.68,
        -ry * 0.12,
        dir * rx * 0.54,
        ry * 0.14
      );
      ctx.bezierCurveTo(
        dir * rx * 0.38,
        ry * 0.32,
        dir * rx * 0.12,
        ry * 0.08,
        dir * rx * 0.14,
        -ry * 0.22
      );
      ctx.closePath();
      ctx.fillStyle = '#050508';
      ctx.fill();

      // Faint spectral pinpoint glint tracking real gaze
      const eyeIdx = dir < 0 ? 0 : 1;
      const gx = f.eyes[eyeIdx].gx * rx * 0.08;
      const gy = f.eyes[eyeIdx].gy * ry * 0.08;
      ctx.fillStyle = 'rgba(165, 243, 252, 0.45)';
      ctx.beginPath();
      ctx.arc(dir * rx * 0.36 + gx, -ry * 0.04 + gy, Math.max(1.5, rx * 0.025), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Sunken Nasal Cavities
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.055, ry * 0.16, rx * 0.032, ry * 0.065, 0.2, 0, Math.PI * 2);
    ctx.ellipse(rx * 0.055, ry * 0.16, rx * 0.032, ry * 0.065, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // 5. Iconic Hollow Elongated Screaming Mouth Void (stretches dynamically with speech)
    const mouthTopY = ry * 0.34;
    const mouthBottomY = ry * 0.72 + screamStretch * 0.95;
    const mouthMidY = (mouthTopY + mouthBottomY) * 0.5;
    const mouthRx = rx * (0.19 + f.mouth.open * 0.08);
    const mouthRy = Math.max(ry * 0.16, (mouthBottomY - mouthTopY) * 0.52);

    ctx.beginPath();
    ctx.ellipse(0, mouthMidY, mouthRx, mouthRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#030407';
    ctx.fill();
    ctx.lineWidth = Math.max(2, rx * 0.025);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
    ctx.stroke();

    // Ectoplasmic mist wisps drifting from the screaming mouth when open
    if (f.mouth.open > 0.08) {
      for (let i = 0; i < 4; i++) {
        const wy = mouthMidY + Math.sin(tSec * 4 + i * 1.7) * mouthRy * 0.6;
        const wx = Math.cos(tSec * 3.2 + i) * mouthRx * 1.4;
        const mg = ctx.createRadialGradient(wx, wy, 2, wx, wy, rx * 0.28);
        mg.addColorStop(0, `rgba(186, 230, 253, ${Math.min(0.32, f.mouth.open * 0.5)})`);
        mg.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(wx, wy, rx * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. NECROTIC ZOMBIE FACE FILTER
  // ─────────────────────────────────────────────────────────────────────────────
  private drawZombieFace(
    ctx: CanvasRenderingContext2D,
    f: TrackedFace,
    W: number,
    H: number,
    tSec: number
  ) {
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.roll);

    const rx = f.rx;
    const ry = f.ry;

    // 1. Necrotic corpse-pallor skin grade over the face oval (multiply/color-burn blend)
    ctx.save();
    const pallor = ctx.createRadialGradient(0, -ry * 0.1, rx * 0.2, 0, 0, Math.max(rx, ry) * 1.15);
    pallor.addColorStop(0, 'rgba(132, 155, 118, 0.52)');
    pallor.addColorStop(0.65, 'rgba(78, 95, 68, 0.62)');
    pallor.addColorStop(0.92, 'rgba(35, 42, 30, 0.45)');
    pallor.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pallor;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.06, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Sunken necrotic cheekbone & temple hollows
    for (const dir of [-1, 1]) {
      const hollow = ctx.createRadialGradient(
        dir * rx * 0.58,
        ry * 0.14,
        rx * 0.04,
        dir * rx * 0.58,
        ry * 0.14,
        rx * 0.34
      );
      hollow.addColorStop(0, 'rgba(42, 18, 21, 0.72)');
      hollow.addColorStop(0.6, 'rgba(63, 29, 36, 0.38)');
      hollow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = hollow;
      ctx.beginPath();
      ctx.arc(dir * rx * 0.58, ry * 0.14, rx * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Branching Dark Coagulated Veins across temples & cheeks
    ctx.strokeStyle = 'rgba(58, 12, 24, 0.68)';
    ctx.lineCap = 'round';
    const veinSeeds = [
      { x: -rx * 0.72, y: -ry * 0.35, dx: 0.22, dy: 0.18 },
      { x: rx * 0.72, y: -ry * 0.35, dx: -0.22, dy: 0.18 },
      { x: -rx * 0.54, y: ry * 0.18, dx: 0.18, dy: -0.14 },
      { x: rx * 0.54, y: ry * 0.18, dx: -0.18, dy: -0.14 },
    ];
    for (const v of veinSeeds) {
      ctx.lineWidth = Math.max(1.4, rx * 0.018);
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      const midX = v.x + v.dx * rx;
      const midY = v.y + v.dy * ry;
      ctx.quadraticCurveTo(v.x + v.dx * rx * 0.5, v.y, midX, midY);
      ctx.stroke();

      // Sub-branch
      ctx.lineWidth = Math.max(1, rx * 0.011);
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(midX + v.dx * rx * 0.55, midY - v.dy * ry * 0.6);
      ctx.moveTo(midX, midY);
      ctx.lineTo(midX + v.dx * rx * 0.45, midY + v.dy * ry * 0.75);
      ctx.stroke();
    }

    // 4. Exposed forehead / cheek flesh wound with stitches
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-rx * 0.48, -ry * 0.56);
    ctx.quadraticCurveTo(-rx * 0.15, -ry * 0.46, rx * 0.18, -ry * 0.62);
    ctx.lineWidth = Math.max(3.5, rx * 0.042);
    ctx.strokeStyle = '#450a0a';
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, rx * 0.018);
    ctx.strokeStyle = '#991b1b';
    ctx.stroke();
    // Sutures
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = Math.max(1.2, rx * 0.014);
    for (let s = 0.15; s <= 0.85; s += 0.18) {
      const sx = -rx * 0.48 + s * rx * 0.66;
      const sy = -ry * 0.56 + Math.sin(s * Math.PI) * ry * 0.05;
      ctx.beginPath();
      ctx.moveTo(sx - rx * 0.02, sy - ry * 0.04);
      ctx.lineTo(sx + rx * 0.02, sy + ry * 0.04);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();

    // 5. Milky Cataract / Bloodshot Undead Eyes (in world canvas coords for exact eye lock)
    for (const e of f.eyes) {
      ctx.save();
      // Dark bruised periorbital socket
      const bruise = ctx.createRadialGradient(e.x, e.y, e.r * 0.3, e.x, e.y, e.r * 1.65);
      bruise.addColorStop(0, 'rgba(30, 10, 18, 0.85)');
      bruise.addColorStop(0.65, 'rgba(68, 18, 30, 0.55)');
      bruise.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bruise;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.65, 0, Math.PI * 2);
      ctx.fill();

      // Milky yellowed sclera
      ctx.fillStyle = '#d9f99d';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.r * 0.92, e.r * 0.64, f.roll, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, e.r * 0.12);
      ctx.strokeStyle = '#450a0a';
      ctx.stroke();

      // Dead milky-gray cataract iris tracking gaze
      const ix = e.x + e.gx * e.r * 0.38;
      const iy = e.y + e.gy * e.r * 0.32;
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(ix, iy, e.r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(ix, iy, e.r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Rotting Undead Jaw & Exposed Teeth (driven by real mouth coordinates & openness)
    ctx.save();
    ctx.translate(f.mouth.x, f.mouth.y);
    ctx.rotate(f.roll);
    const mw = f.mouth.w * 1.25;
    const mh = Math.max(mw * 0.24, f.mouth.open * mw * 0.85);

    // Torn necrotic gum cavity
    ctx.fillStyle = '#2a080c';
    ctx.beginPath();
    ctx.ellipse(0, mh * 0.15, mw * 0.62, mh * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, mw * 0.05);
    ctx.strokeStyle = '#450a0a';
    ctx.stroke();

    // Crooked yellowed zombie teeth (upper & lower rows separate as mouth opens)
    const teethCount = 6;
    const toothW = (mw * 0.88) / teethCount;
    for (let i = 0; i < teethCount; i++) {
      const tx = -mw * 0.44 + i * toothW + toothW * 0.1;
      const jitter = ((i * 37) % 5) * 0.03 * mw;
      // Upper tooth
      ctx.fillStyle = i % 2 === 0 ? '#fef08a' : '#d6d3d1';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(tx, -mh * 0.38, toothW * 0.78, mh * 0.36 + jitter, 2);
      ctx.fill();
      ctx.stroke();

      // Lower tooth
      ctx.beginPath();
      ctx.roundRect(tx, mh * 0.12, toothW * 0.78, mh * 0.36 - jitter * 0.5, 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. FULL-MOON WEREWOLF FACE FILTER
  // ─────────────────────────────────────────────────────────────────────────────
  private drawWerewolfFace(
    ctx: CanvasRenderingContext2D,
    f: TrackedFace,
    W: number,
    H: number,
    tSec: number
  ) {
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.roll);

    const rx = f.rx * 1.15;
    const ry = f.ry * 1.12;
    const earTwitch = Math.sin(tSec * 5.2) * 0.05;

    // 1. Pointed Lupine Ears atop the head
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.translate(dir * rx * 0.68, -ry * 0.72);
      ctx.rotate(dir * (0.28 + earTwitch));
      ctx.beginPath();
      ctx.moveTo(-rx * 0.22, ry * 0.18);
      ctx.lineTo(0, -ry * 0.56);
      ctx.lineTo(rx * 0.22, ry * 0.18);
      ctx.closePath();
      ctx.fillStyle = '#27201c';
      ctx.fill();
      ctx.lineWidth = Math.max(2, rx * 0.025);
      ctx.strokeStyle = '#0c0a09';
      ctx.stroke();

      // Inner pink/brown ear tuft
      ctx.beginPath();
      ctx.moveTo(-rx * 0.11, ry * 0.12);
      ctx.lineTo(0, -ry * 0.36);
      ctx.lineTo(rx * 0.11, ry * 0.12);
      ctx.closePath();
      ctx.fillStyle = '#573b32';
      ctx.fill();
      ctx.restore();
    }

    // 2. Layered Coarse Timber-Wolf Fur Ring (Brow, Sideburns, Cheeks & Mane)
    const spikes = 38;
    ctx.beginPath();
    for (let i = 0; i <= spikes; i++) {
      const ang = (i / spikes) * Math.PI * 2;
      const isCheekOrMane = Math.sin(ang) > -0.25;
      const spikeLen = (i % 2 === 0 ? 1.24 : 1.04) * (isCheekOrMane ? 1.12 : 0.96);
      const px = Math.cos(ang) * rx * spikeLen;
      const py = Math.sin(ang) * ry * (i % 2 === 0 ? 1.12 : 0.96);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Clip out center face so real facial expressions blend with the fur & snout
    const furGrad = ctx.createRadialGradient(0, 0, rx * 0.45, 0, 0, rx * 1.35);
    furGrad.addColorStop(0, 'rgba(41, 32, 26, 0.22)');
    furGrad.addColorStop(0.55, 'rgba(48, 37, 29, 0.86)');
    furGrad.addColorStop(0.85, 'rgba(28, 22, 18, 0.96)');
    furGrad.addColorStop(1, '#0c0a09');
    ctx.fillStyle = furGrad;
    ctx.fill();

    // Fur strand highlights around ruff and brow
    ctx.strokeStyle = 'rgba(168, 142, 118, 0.45)';
    ctx.lineWidth = Math.max(1.5, rx * 0.016);
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const r0 = 0.72;
      const r1 = 1.08 + (i % 3) * 0.06;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * rx * r0, Math.sin(ang) * ry * r0);
      ctx.lineTo(Math.cos(ang) * rx * r1, Math.sin(ang) * ry * r1);
      ctx.stroke();
    }

    // 3. Lupine Snout Bridge & Wet Black Canine Nose
    const snoutGrad = ctx.createLinearGradient(0, -ry * 0.22, 0, ry * 0.28);
    snoutGrad.addColorStop(0, 'rgba(28, 22, 18, 0.75)');
    snoutGrad.addColorStop(1, 'rgba(18, 14, 12, 0.92)');
    ctx.fillStyle = snoutGrad;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.22, -ry * 0.18);
    ctx.lineTo(rx * 0.22, -ry * 0.18);
    ctx.lineTo(rx * 0.28, ry * 0.22);
    ctx.lineTo(-rx * 0.28, ry * 0.22);
    ctx.closePath();
    ctx.fill();

    // Wet black wolf nose pad
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.moveTo(-rx * 0.18, ry * 0.08);
    ctx.quadraticCurveTo(0, ry * 0.02, rx * 0.18, ry * 0.08);
    ctx.lineTo(0, ry * 0.26);
    ctx.closePath();
    ctx.fill();
    // Nose specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.05, ry * 0.11, rx * 0.045, ry * 0.02, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 4. Glowing Predatory Amber-Gold Wolf Eyes
    for (const e of f.eyes) {
      ctx.save();
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.r * 0.98, e.r * 0.62, f.roll, 0, Math.PI * 2);
      ctx.fill();

      const ix = e.x + e.gx * e.r * 0.35;
      const iy = e.y + e.gy * e.r * 0.3;
      const irisGrad = ctx.createRadialGradient(ix, iy, e.r * 0.05, ix, iy, e.r * 0.56);
      irisGrad.addColorStop(0, '#fef08a');
      irisGrad.addColorStop(0.55, '#f59e0b');
      irisGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(ix, iy, e.r * 0.52, 0, Math.PI * 2);
      ctx.fill();

      // Vertical wolf pupil
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(ix, iy, e.r * 0.14, e.r * 0.42, f.roll, 0, Math.PI * 2);
      ctx.fill();

      // Eye shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(ix - e.r * 0.15, iy - e.r * 0.15, e.r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. Snarling Wolf Maw & Ivory Fangs (hinges with mouth.open)
    ctx.save();
    ctx.translate(f.mouth.x, f.mouth.y);
    ctx.rotate(f.roll);
    const mw = f.mouth.w * 1.32;
    const jawOpen = Math.max(mw * 0.18, f.mouth.open * mw * 0.92);

    // Black lupine gums & crimson inner maw
    ctx.fillStyle = '#180508';
    ctx.beginPath();
    ctx.ellipse(0, jawOpen * 0.2, mw * 0.64, jawOpen * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(3, mw * 0.06);
    ctx.strokeStyle = '#09090b';
    ctx.stroke();

    // Long curved upper & lower canine fangs
    const drawFang = (x: number, y: number, w: number, h: number, up: boolean) => {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.5, y);
      ctx.quadraticCurveTo(x, y + (up ? -h : h), x + w * 0.1, y + (up ? -h : h));
      ctx.quadraticCurveTo(x + w * 0.35, y, x + w * 0.5, y);
      ctx.closePath();
      const fg = ctx.createLinearGradient(x, y, x, y + (up ? -h : h));
      fg.addColorStop(0, '#fde68a');
      fg.addColorStop(0.4, '#fafaf9');
      fg.addColorStop(1, '#e7e5e4');
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#292524';
      ctx.stroke();
    };

    // Upper fangs
    drawFang(-mw * 0.38, -jawOpen * 0.25, mw * 0.15, mw * 0.34, false);
    drawFang(mw * 0.38, -jawOpen * 0.25, mw * 0.15, mw * 0.34, false);
    // Upper incisors
    for (let i = -2; i <= 2; i++) {
      drawFang(i * mw * 0.1, -jawOpen * 0.28, mw * 0.08, mw * 0.16, false);
    }
    // Lower fangs
    drawFang(-mw * 0.31, jawOpen * 0.55, mw * 0.13, mw * 0.28, true);
    drawFang(mw * 0.31, jawOpen * 0.55, mw * 0.13, mw * 0.28, true);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. COUNT VAMPIRE FACE FILTER (Nosferatu / Tepes Aristocratic Vampire)
  // ─────────────────────────────────────────────────────────────────────────────
  private drawVampireFace(
    ctx: CanvasRenderingContext2D,
    f: TrackedFace,
    W: number,
    H: number,
    tSec: number
  ) {
    ctx.save();
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.roll);

    const rx = f.rx;
    const ry = f.ry;

    // 1. High Gothic Vampire Collar & Alabaster Pale Skin Luminance
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-rx * 1.38, ry * 0.45);
    ctx.lineTo(-rx * 0.95, -ry * 0.35);
    ctx.lineTo(-rx * 0.55, ry * 1.15);
    ctx.lineTo(rx * 0.55, ry * 1.15);
    ctx.lineTo(rx * 0.95, -ry * 0.35);
    ctx.lineTo(rx * 1.38, ry * 0.45);
    ctx.closePath();
    const collarGrad = ctx.createLinearGradient(0, -ry * 0.35, 0, ry * 1.15);
    collarGrad.addColorStop(0, '#7f1d1d');
    collarGrad.addColorStop(0.5, '#450a0a');
    collarGrad.addColorStop(1, '#09090b');
    ctx.fillStyle = collarGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
    ctx.restore();

    // Pointed aristocratic vampire ears
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * rx * 0.94, -ry * 0.08);
      ctx.lineTo(dir * rx * 1.26, -ry * 0.34);
      ctx.lineTo(dir * rx * 0.98, ry * 0.22);
      ctx.closePath();
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#475569';
      ctx.stroke();
    }

    // Corpse-cold marble-pale face wash + gaunt cheekbone contour
    const paleGrad = ctx.createRadialGradient(0, -ry * 0.12, rx * 0.15, 0, 0, Math.max(rx, ry) * 1.05);
    paleGrad.addColorStop(0, 'rgba(241, 245, 249, 0.38)');
    paleGrad.addColorStop(0.65, 'rgba(203, 213, 225, 0.32)');
    paleGrad.addColorStop(0.92, 'rgba(30, 27, 75, 0.35)');
    paleGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = paleGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.02, ry * 1.04, 0, 0, Math.PI * 2);
    ctx.fill();

    // Widow's peak hairline & arched gothic eyebrows
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.moveTo(-rx * 0.65, -ry * 0.78);
    ctx.quadraticCurveTo(-rx * 0.2, -ry * 0.82, 0, -ry * 0.62);
    ctx.quadraticCurveTo(rx * 0.2, -ry * 0.82, rx * 0.65, -ry * 0.78);
    ctx.quadraticCurveTo(0, -ry * 1.05, -rx * 0.65, -ry * 0.78);
    ctx.fill();

    ctx.restore();

    // 2. Hypnotic Blood-Crimson Vampire Eyes with Dark Violet Rings
    for (let i = 0; i < 2; i++) {
      const e = f.eyes[i];
      const dir = i === 0 ? -1 : 1;
      ctx.save();

      // Bruised violet-crimson periorbital ring
      const ring = ctx.createRadialGradient(e.x, e.y, e.r * 0.2, e.x, e.y, e.r * 1.6);
      ring.addColorStop(0, 'rgba(76, 5, 25, 0.78)');
      ring.addColorStop(0.6, 'rgba(49, 16, 47, 0.45)');
      ring.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // Sharp arched gothic brow
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = Math.max(2.5, e.r * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.x - dir * e.r * 0.95, e.y - e.r * 0.65);
      ctx.quadraticCurveTo(e.x + dir * e.r * 0.2, e.y - e.r * 1.25, e.x + dir * e.r * 1.1, e.y - e.r * 0.55);
      ctx.stroke();

      // Stark white sclera
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.r * 0.9, e.r * 0.56, f.roll, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Blood-Crimson Iris
      const ix = e.x + e.gx * e.r * 0.35;
      const iy = e.y + e.gy * e.r * 0.28;
      const iris = ctx.createRadialGradient(ix, iy, e.r * 0.05, ix, iy, e.r * 0.48);
      iris.addColorStop(0, '#fca5a5');
      iris.addColorStop(0.45, '#ef4444');
      iris.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(ix, iy, e.r * 0.46, 0, Math.PI * 2);
      ctx.fill();

      // Vertical slit pupil
      ctx.fillStyle = '#050505';
      ctx.beginPath();
      ctx.ellipse(ix, iy, e.r * 0.11, e.r * 0.38, f.roll, 0, Math.PI * 2);
      ctx.fill();

      // Specular catchlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.arc(ix - e.r * 0.14, iy - e.r * 0.14, e.r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Blood-Red Lips, Razor Canine Fangs & Crimson Trickle
    ctx.save();
    ctx.translate(f.mouth.x, f.mouth.y);
    ctx.rotate(f.roll);
    const mw = f.mouth.w * 1.12;
    const mh = Math.max(mw * 0.14, f.mouth.open * mw * 0.72);

    // Dark crimson inner mouth
    ctx.fillStyle = '#280509';
    ctx.beginPath();
    ctx.ellipse(0, mh * 0.1, mw * 0.54, mh * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2.5, mw * 0.06);
    ctx.strokeStyle = '#991b1b';
    ctx.stroke();

    // Gleaming Razor Upper Canine Fangs (extend as mouth opens)
    const fangLen = mw * (0.24 + Math.min(0.18, f.mouth.open * 0.3));
    for (const dir of [-1, 1]) {
      const fx = dir * mw * 0.29;
      const fy = -mh * 0.28;
      ctx.beginPath();
      ctx.moveTo(fx - mw * 0.055, fy);
      ctx.lineTo(fx, fy + fangLen);
      ctx.lineTo(fx + mw * 0.055, fy);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();
    }

    // Subtle blood trickle from right corner of mouth
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(mw * 0.34, mh * 0.15);
    ctx.quadraticCurveTo(mw * 0.37, mh * 0.45, mw * 0.35, mh * 0.65);
    ctx.arc(mw * 0.35, mh * 0.68, mw * 0.032, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. NOCTURNAL BAT SWARM ENGINE (Depth-Sorted Flapping Leathery Bats)
  // ─────────────────────────────────────────────────────────────────────────────
  private stepBats(dt: number, tSec: number, face: TrackedFace | undefined, W: number, H: number) {
    const anchorX = face ? face.cx / W : 0.5;
    const anchorY = face ? (face.cy - face.ry * 0.35) / H : 0.38;

    for (let i = 0; i < this.bats.length; i++) {
      const b = this.bats[i];
      b.wingPhase += b.wingSpeed * dt;
      if (i % 3 === 0) {
        // Orbit around the speaker's head
        b.orbitAngle += (0.9 + (i % 4) * 0.35) * dt * (i % 2 === 0 ? 1 : -1);
        b.x = anchorX + Math.cos(b.orbitAngle) * b.orbitRadius * 1.4;
        b.y = anchorY + Math.sin(b.orbitAngle * 2) * b.orbitRadius * 0.65;
      } else {
        // Free swooping across the frame
        b.x += b.vx * dt;
        b.y += (b.vy + Math.sin(tSec * 3.2 + i) * 0.06) * dt;
        if (b.x < -0.15) b.x = 1.15;
        if (b.x > 1.15) b.x = -0.15;
        if (b.y < 0.04) b.vy = Math.abs(b.vy);
        if (b.y > 0.92) b.vy = -Math.abs(b.vy);
      }
    }
  }

  private drawBatsLayer(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    tSec: number,
    minZ: number,
    maxZ: number
  ) {
    const scaleBase = Math.min(W, H) * 0.042;
    for (const b of this.bats) {
      if (b.z < minZ || b.z >= maxZ) continue;
      const bx = b.x * W;
      const by = b.y * H;
      const sz = scaleBase * b.z;
      const flap = Math.sin(b.wingPhase);
      const tilt = Math.atan2(b.vy, b.vx || 0.1) * 0.25;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(tilt);
      ctx.globalAlpha = Math.min(0.96, 0.45 + b.z * 0.38);

      // Leathery wings (left & right scalloped bat membrane)
      ctx.fillStyle = '#09090d';
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = Math.max(1, sz * 0.04);

      for (const dir of [-1, 1]) {
        const wingTipX = dir * sz * 1.75;
        const wingTipY = -flap * sz * 0.95;
        const midX = dir * sz * 0.85;
        const midY = -flap * sz * 0.45 - sz * 0.35;

        ctx.beginPath();
        ctx.moveTo(0, -sz * 0.12);
        // Leading wing bone
        ctx.quadraticCurveTo(midX, midY, wingTipX, wingTipY);
        // Scalloped trailing membrane
        ctx.quadraticCurveTo(
          dir * sz * 1.25,
          wingTipY + sz * 0.48,
          dir * sz * 0.92,
          wingTipY * 0.5 + sz * 0.32
        );
        ctx.quadraticCurveTo(
          dir * sz * 0.55,
          sz * 0.42,
          dir * sz * 0.15,
          sz * 0.25
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Bat body & pointed ears
      ctx.beginPath();
      ctx.ellipse(0, 0, sz * 0.22, sz * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-sz * 0.16, -sz * 0.24);
      ctx.lineTo(-sz * 0.24, -sz * 0.52);
      ctx.lineTo(-sz * 0.04, -sz * 0.3);
      ctx.moveTo(sz * 0.16, -sz * 0.24);
      ctx.lineTo(sz * 0.24, -sz * 0.52);
      ctx.lineTo(sz * 0.04, -sz * 0.3);
      ctx.fill();

      // Glowing nocturnal bat eyes
      ctx.fillStyle = b.eyeColor;
      ctx.beginPath();
      ctx.arc(-sz * 0.07, -sz * 0.18, Math.max(1.2, sz * 0.065), 0, Math.PI * 2);
      ctx.arc(sz * 0.07, -sz * 0.18, Math.max(1.2, sz * 0.065), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. "DIM THE LIGHTS" MODE — FOUND-FOOTAGE NIGHT VIDEO & CAMERA BEAM
  // ─────────────────────────────────────────────────────────────────────────────
  private drawDimLightsFoundFootage(
    ctx: CanvasRenderingContext2D,
    face: TrackedFace | undefined,
    W: number,
    H: number,
    dt: number,
    tSec: number
  ) {
    // Target the tracked face center with slight handheld camera operator lag + tremor
    const targetX = face ? face.cx / W : 0.5;
    const targetY = face ? face.cy / H : 0.46;
    const kBeam = 1 - Math.exp(-dt * 8.5);
    this.beamX += (targetX - this.beamX) * kBeam;
    this.beamY += (targetY - this.beamY) * kBeam;

    const jitterX = (Math.sin(tSec * 7.3) * 0.008 + Math.cos(tSec * 19.1) * 0.003) * W;
    const jitterY = (Math.cos(tSec * 6.1) * 0.008 + Math.sin(tSec * 17.7) * 0.003) * H;
    const bx = this.beamX * W + jitterX;
    const by = this.beamY * H + jitterY;
    const beamRadius = Math.min(W, H) * 0.44;

    ctx.save();

    // 1. Harsh Found-Footage Hotspot Bloom inside the beam cone (screen/overlay blend)
    ctx.globalCompositeOperation = 'screen';
    const hotSpot = ctx.createRadialGradient(bx, by, beamRadius * 0.04, bx, by, beamRadius * 0.85);
    hotSpot.addColorStop(0, 'rgba(220, 245, 235, 0.34)');
    hotSpot.addColorStop(0.38, 'rgba(167, 243, 208, 0.14)');
    hotSpot.addColorStop(0.75, 'rgba(20, 83, 45, 0.04)');
    hotSpot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = hotSpot;
    ctx.fillRect(0, 0, W, H);

    // 2. Deep Nocturnal Darkness Vignette outside the camera flashlight beam
    ctx.globalCompositeOperation = 'source-over';
    const darkMask = ctx.createRadialGradient(bx, by, beamRadius * 0.18, bx, by, beamRadius * 1.45);
    darkMask.addColorStop(0, 'rgba(0, 0, 0, 0.0)');
    darkMask.addColorStop(0.42, 'rgba(2, 8, 6, 0.38)');
    darkMask.addColorStop(0.72, 'rgba(2, 6, 5, 0.82)');
    darkMask.addColorStop(1, 'rgba(1, 3, 3, 0.96)');
    ctx.fillStyle = darkMask;
    ctx.fillRect(0, 0, W, H);

    // 3. Illuminated Floating Dust Motes caught inside the flashlight cone
    for (const d of this.dust) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y < 0) d.y = 1;
      if (d.x < 0) d.x = 1;
      if (d.x > 1) d.x = 0;

      const dx = d.x * W;
      const dy = d.y * H;
      const dist = Math.hypot(dx - bx, dy - by);
      if (dist < beamRadius * 1.05) {
        const falloff = Math.max(0, 1 - dist / (beamRadius * 1.05));
        ctx.fillStyle = `rgba(215, 250, 235, ${d.alpha * falloff * 0.85})`;
        ctx.beginPath();
        ctx.arc(dx, dy, d.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Camcorder Scanlines & Found-Footage Night OSD Telemetry
    ctx.fillStyle = 'rgba(16, 185, 129, 0.035)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }

    // Corner viewfinder brackets
    const pad = Math.max(12, W * 0.035);
    const brk = Math.max(14, W * 0.04);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.48)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(pad, pad + brk);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad + brk, pad);
    // Top-right
    ctx.moveTo(W - pad - brk, pad);
    ctx.lineTo(W - pad, pad);
    ctx.lineTo(W - pad, pad + brk);
    // Bottom-left
    ctx.moveTo(pad, H - pad - brk);
    ctx.lineTo(pad, H - pad);
    ctx.lineTo(pad + brk, H - pad);
    // Bottom-right
    ctx.moveTo(W - pad - brk, H - pad);
    ctx.lineTo(W - pad, H - pad);
    ctx.lineTo(W - pad, H - pad - brk);
    ctx.stroke();

    // REC indicator & Found-Footage Timestamp
    const fontSize = Math.max(10, Math.round(W * 0.024));
    ctx.font = `700 ${fontSize}px "Courier New", monospace`;
    if (Math.floor(tSec * 2) % 2 === 0) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(pad + fontSize * 0.8, pad + fontSize * 1.15, fontSize * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
    ctx.fillText('REC  NIGHT-CAM // IR BEAM ON', pad + fontSize * 1.5, pad + fontSize * 1.5);

    const mins = String(Math.floor(tSec / 60) % 60).padStart(2, '0');
    const secs = String(Math.floor(tSec) % 60).padStart(2, '0');
    const frames = String(Math.floor((tSec % 1) * 24)).padStart(2, '0');
    ctx.fillStyle = 'rgba(167, 243, 208, 0.78)';
    ctx.fillText(`OCT 31  02:${mins}:${secs}:${frames}  ISO 12800`, pad + fontSize * 0.5, H - pad - fontSize * 0.5);

    ctx.restore();
  }

  dispose() {
    this.worker.dispose();
    try {
      this.sync?.dispose();
    } catch {
      /* ignore */
    }
    this.sync = null;
    this.tracks = [];
  }
}

/** Head turn/nod read from where the eyes sit inside the face box (no 3D head matrix needed). */
function poseOf(f: TrackedFace): FilterFacePose {
  const ex = (f.eyes[0].x + f.eyes[1].x) / 2;
  const ey = (f.eyes[0].y + f.eyes[1].y) / 2;
  const clamp = (v: number) => Math.max(-0.7, Math.min(0.7, v));
  return {
    cx: f.cx,
    cy: f.cy,
    rx: f.rx,
    ry: f.ry,
    roll: f.roll,
    yaw: clamp(((ex - f.cx) / Math.max(1, f.rx)) * 1.6),
    // Eyes sit ~0.12 face-heights above the box centre when looking straight ahead.
    pitch: clamp(((ey - f.cy) / Math.max(1, f.ry) + 0.12) * 1.5),
    mouthOpen: f.mouth.open,
    blendshapes: null,
    headMatrix: null,
  };
}
