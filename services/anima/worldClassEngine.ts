/**
 * services/anima/worldClassEngine.ts
 *
 * Plajah Unified Motion & Animation System ("Anima")
 * World-Class Animation Engine: Fun, Easy, Intuitive for Beginners & Deep for Professionals
 *
 * Core Subsystems:
 * 1. Live Motion Puppeteering (Record & Act via pointer/touch with real-time inertia & squash/stretch)
 * 2. Smart Motion Presets (1-tap Walk, Idle Breathing, Jelly Physics, Ghibli Float, Action Burst)
 * 3. Smart Voice Lip-Sync & Beat Synchro (Phoneme visemes & beat-reactive keyframes)
 * 4. Iconic Pose Library (Stampable character keyframe stances with smooth blending)
 * 5. Interactive Spline Curve Graph Editor (Cubic Bézier tangent handles & ease curves)
 * 6. Motion FX Brushes (Real-time particle painting for stardust, autumn leaves, fire, and ink)
 */

import type { Keyframe, AnimaChannel, AnimaLayer, AnimaProject, InterpolationEase, BezierHandle } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1. LIVE MOTION PUPPETEER (Record & Act)
// ─────────────────────────────────────────────────────────────────────────────

export interface PuppeteerPoint {
  x: number;
  y: number;
  time: number; // seconds
}

export interface PuppeteerOptions {
  fps?: number;              // default 24
  stepRate?: number;         // 1 for On 1s, 2 for On 2s (default 2)
  inertia?: number;          // 0.0 (raw) to 0.85 (smooth lag), default 0.45
  enableSquashStretch?: boolean; // automatically infer scale from velocity
  decimationTolerance?: number; // Douglas-Peucker epsilon in pixels (default 1.5)
}

export interface PuppeteerRecordingResult {
  xChannel: AnimaChannel<number>;
  yChannel: AnimaChannel<number>;
  rotationChannel?: AnimaChannel<number>;
  scaleXChannel?: AnimaChannel<number>;
  scaleYChannel?: AnimaChannel<number>;
  keyframeCount: number;
  durationSeconds: number;
}

export class LiveMotionPuppeteer {
  private isRecording: boolean = false;
  private startTime: number = 0;
  private rawPoints: PuppeteerPoint[] = [];
  private smoothedPoints: PuppeteerPoint[] = [];
  private options: Required<PuppeteerOptions>;

  constructor(options?: PuppeteerOptions) {
    this.options = {
      fps: options?.fps ?? 24,
      stepRate: options?.stepRate ?? 2,
      inertia: options?.inertia ?? 0.45,
      enableSquashStretch: options?.enableSquashStretch ?? true,
      decimationTolerance: options?.decimationTolerance ?? 1.5,
    };
  }

  public startRecording(initialX: number, initialY: number, startTimeSec: number = 0): void {
    this.isRecording = true;
    this.startTime = startTimeSec;
    this.rawPoints = [{ x: initialX, y: initialY, time: startTimeSec }];
    this.smoothedPoints = [{ x: initialX, y: initialY, time: startTimeSec }];
  }

  public feedPoint(x: number, y: number, currentTimestampSec: number): void {
    if (!this.isRecording) return;

    const relTime = Math.max(0, currentTimestampSec - this.startTime);
    this.rawPoints.push({ x, y, time: relTime });

    // Apply Real-time Inertia Smoothing Filter
    const prev = this.smoothedPoints[this.smoothedPoints.length - 1];
    const alpha = 1.0 - this.options.inertia;
    const smoothX = prev.x + (x - prev.x) * alpha;
    const smoothY = prev.y + (y - prev.y) * alpha;

    this.smoothedPoints.push({ x: smoothX, y: smoothY, time: relTime });
  }

  public stopRecording(layerId: string = 'l_puppet'): PuppeteerRecordingResult {
    this.isRecording = false;
    if (this.smoothedPoints.length === 0) {
      return this.createEmptyResult(layerId);
    }

    const durationSeconds = this.smoothedPoints[this.smoothedPoints.length - 1].time;
    const frameInterval = (1 / this.options.fps) * this.options.stepRate;

    // Resample along cadence (On 1s or On 2s)
    const resampled: PuppeteerPoint[] = [];
    let currentT = 0;
    while (currentT <= durationSeconds + 0.0001) {
      const pt = this.samplePointAtTime(currentT);
      resampled.push(pt);
      currentT += frameInterval;
    }

    // Apply Douglas-Peucker simplification to suppress redundant collinear keys
    const simplified = this.douglasPeucker(resampled, this.options.decimationTolerance);

    // Build Keyframe Tracks
    const xKeys: Keyframe<number>[] = [];
    const yKeys: Keyframe<number>[] = [];
    const rotKeys: Keyframe<number>[] = [];
    const scaleXKeys: Keyframe<number>[] = [];
    const scaleYKeys: Keyframe<number>[] = [];

    for (let i = 0; i < simplified.length; i++) {
      const pt = simplified[i];
      const t = pt.time;
      const ease: InterpolationEase = 'smooth';

      xKeys.push({ id: `kf_x_${i}`, t, v: Math.round(pt.x * 10) / 10, ease });
      yKeys.push({ id: `kf_y_${i}`, t, v: Math.round(pt.y * 10) / 10, ease });

      // Infer velocity vector for dynamic tilt & squash/stretch
      if (this.options.enableSquashStretch) {
        let vx = 0;
        let vy = 0;
        if (i < simplified.length - 1) {
          const next = simplified[i + 1];
          const dt = Math.max(0.01, next.time - t);
          vx = (next.x - pt.x) / dt;
          vy = (next.y - pt.y) / dt;
        } else if (i > 0) {
          const prev = simplified[i - 1];
          const dt = Math.max(0.01, t - prev.time);
          vx = (pt.x - prev.x) / dt;
          vy = (pt.y - prev.y) / dt;
        }

        const speed = Math.sqrt(vx * vx + vy * vy);
        // Tilt into motion
        const angleDeg = Math.max(-25, Math.min(25, (vx / 400) * 20));
        rotKeys.push({ id: `kf_rot_${i}`, t, v: Math.round(angleDeg * 10) / 10, ease });

        // Squash & Stretch: Stretch along velocity, squash perpendicular
        const stretchAmount = Math.min(0.35, speed / 1200);
        const sx = 1.0 - stretchAmount * 0.5;
        const sy = 1.0 + stretchAmount;
        scaleXKeys.push({ id: `kf_sx_${i}`, t, v: Math.round(sx * 100) / 100, ease });
        scaleYKeys.push({ id: `kf_sy_${i}`, t, v: Math.round(sy * 100) / 100, ease });
      }
    }

    return {
      xChannel: {
        id: `ch_x_${layerId}`,
        name: 'Position X (Puppeted)',
        path: 'transform.x',
        defaultValue: xKeys[0]?.v ?? 0,
        keyframes: xKeys,
      },
      yChannel: {
        id: `ch_y_${layerId}`,
        name: 'Position Y (Puppeted)',
        path: 'transform.y',
        defaultValue: yKeys[0]?.v ?? 0,
        keyframes: yKeys,
      },
      rotationChannel: {
        id: `ch_rot_${layerId}`,
        name: 'Dynamic Lean (Auto Tilt)',
        path: 'transform.rotationZ',
        defaultValue: 0,
        keyframes: rotKeys,
      },
      scaleXChannel: {
        id: `ch_sx_${layerId}`,
        name: 'Squash X',
        path: 'transform.scaleX',
        defaultValue: 1,
        keyframes: scaleXKeys,
      },
      scaleYChannel: {
        id: `ch_sy_${layerId}`,
        name: 'Stretch Y',
        path: 'transform.scaleY',
        defaultValue: 1,
        keyframes: scaleYKeys,
      },
      keyframeCount: simplified.length,
      durationSeconds,
    };
  }

  private samplePointAtTime(t: number): PuppeteerPoint {
    if (this.smoothedPoints.length === 0) return { x: 0, y: 0, time: t };
    if (t <= this.smoothedPoints[0].time) return { ...this.smoothedPoints[0], time: t };
    const last = this.smoothedPoints[this.smoothedPoints.length - 1];
    if (t >= last.time) return { ...last, time: t };

    // Binary search interval
    let low = 0;
    let high = this.smoothedPoints.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const pt = this.smoothedPoints[mid];
      if (pt.time <= t && this.smoothedPoints[mid + 1]?.time >= t) {
        const next = this.smoothedPoints[mid + 1];
        const span = Math.max(0.0001, next.time - pt.time);
        const u = (t - pt.time) / span;
        return {
          x: pt.x + (next.x - pt.x) * u,
          y: pt.y + (next.y - pt.y) * u,
          time: t,
        };
      }
      if (pt.time < t) low = mid + 1;
      else high = mid - 1;
    }
    return { ...last, time: t };
  }

  private douglasPeucker(pts: PuppeteerPoint[], epsilon: number): PuppeteerPoint[] {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let index = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];

    for (let i = 1; i < pts.length - 1; i++) {
      const d = this.perpendicularDistance(pts[i], first, last);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.douglasPeucker(pts.slice(0, index + 1), epsilon);
      const right = this.douglasPeucker(pts.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  private perpendicularDistance(p: PuppeteerPoint, lineA: PuppeteerPoint, lineB: PuppeteerPoint): number {
    const dx = lineB.x - lineA.x;
    const dy = lineB.y - lineA.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const dpx = p.x - lineA.x;
      const dpy = p.y - lineA.y;
      return Math.sqrt(dpx * dpx + dpy * dpy);
    }
    const t = Math.max(0, Math.min(1, ((p.x - lineA.x) * dx + (p.y - lineA.y) * dy) / lenSq));
    const projX = lineA.x + t * dx;
    const projY = lineA.y + t * dy;
    const rx = p.x - projX;
    const ry = p.y - projY;
    return Math.sqrt(rx * rx + ry * ry);
  }

  private createEmptyResult(layerId: string): PuppeteerRecordingResult {
    return {
      xChannel: { id: `ch_x_${layerId}`, name: 'Position X', path: 'transform.x', defaultValue: 0, keyframes: [] },
      yChannel: { id: `ch_y_${layerId}`, name: 'Position Y', path: 'transform.y', defaultValue: 0, keyframes: [] },
      keyframeCount: 0,
      durationSeconds: 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SMART MOTION PRESETS (Zero-Tedium Instant Gratification)
// ─────────────────────────────────────────────────────────────────────────────

export type MagicPresetKind =
  | 'auto_walk'
  | 'idle_breathing'
  | 'jelly_physics'
  | 'ghibli_float'
  | 'comic_impact_burst';

export interface SmartPresetOptions {
  durationSeconds?: number; // default 3.0
  fps?: number;             // default 24
  cadence?: number;         // 1 or 2 (default 2)
  intensity?: number;       // 0.5 to 2.0 (default 1.0)
}

export class SmartMotionPresets {
  /**
   * 1-Tap Auto Walk: Injects an 8-pose contact cycle on 2s with hip bob & forward stride
   */
  public static generateAutoWalk(options?: SmartPresetOptions): Record<string, AnimaChannel<number>> {
    const dur = options?.durationSeconds ?? 3.0;
    const intensity = options?.intensity ?? 1.0;
    const cycleTime = 1.0; // 1 second per 2 steps
    const stepCount = Math.floor(dur / cycleTime);

    const xKeys: Keyframe<number>[] = [];
    const yKeys: Keyframe<number>[] = [];
    const rotKeys: Keyframe<number>[] = [];

    const totalFrames = dur * 24;
    for (let f = 0; f <= totalFrames; f += 2) {
      const t = f / 24;
      const phase = (t % cycleTime) / cycleTime; // 0 to 1

      // Stride forward progression
      const strideX = (t / dur) * (200 * intensity);

      // Classic 2-beat hip bounce (down on contact, up on pass)
      const bobY = Math.sin(phase * Math.PI * 4) * (-14 * intensity);

      // Subtle torso lean
      const leanRot = Math.sin(phase * Math.PI * 2) * (3.5 * intensity);

      xKeys.push({ id: `walk_x_${f}`, t, v: Math.round(strideX * 10) / 10, ease: 'smooth' });
      yKeys.push({ id: `walk_y_${f}`, t, v: Math.round(bobY * 10) / 10, ease: 'smooth' });
      rotKeys.push({ id: `walk_rot_${f}`, t, v: Math.round(leanRot * 10) / 10, ease: 'smooth' });
    }

    return {
      'transform.x': { id: 'ch_walk_x', name: 'Auto Walk Stride', path: 'transform.x', defaultValue: 0, keyframes: xKeys },
      'transform.y': { id: 'ch_walk_y', name: 'Walk Hip Bob (On 2s)', path: 'transform.y', defaultValue: 0, keyframes: yKeys },
      'transform.rotationZ': { id: 'ch_walk_rot', name: 'Walk Torso Sway', path: 'transform.rotationZ', defaultValue: 0, keyframes: rotKeys },
    };
  }

  /**
   * 1-Tap Idle Breathing: Makes any character look alive with breathing chest & micro-wiggles
   */
  public static generateIdleBreathing(options?: SmartPresetOptions): Record<string, AnimaChannel<number>> {
    const dur = options?.durationSeconds ?? 3.0;
    const intensity = options?.intensity ?? 1.0;
    const breatheCycle = 2.4; // deep breath every 2.4 seconds

    const syKeys: Keyframe<number>[] = [];
    const yKeys: Keyframe<number>[] = [];
    const rotKeys: Keyframe<number>[] = [];

    const totalFrames = dur * 24;
    for (let f = 0; f <= totalFrames; f += 2) {
      const t = f / 24;
      const angle = (t / breatheCycle) * Math.PI * 2;

      // Vertical chest expansion
      const sy = 1.0 + Math.sin(angle) * (0.035 * intensity);
      // Subtle shoulder heave
      const heaveY = -Math.sin(angle) * (5 * intensity);
      // Organic micro-wiggle
      const microRot = Math.sin(t * 3.7) * (0.8 * intensity);

      syKeys.push({ id: `idle_sy_${f}`, t, v: Math.round(sy * 1000) / 1000, ease: 'smooth' });
      yKeys.push({ id: `idle_y_${f}`, t, v: Math.round(heaveY * 10) / 10, ease: 'smooth' });
      rotKeys.push({ id: `idle_rot_${f}`, t, v: Math.round(microRot * 10) / 10, ease: 'smooth' });
    }

    return {
      'transform.scaleY': { id: 'ch_breathe_sy', name: 'Chest Breath Expand', path: 'transform.scaleY', defaultValue: 1, keyframes: syKeys },
      'transform.y': { id: 'ch_breathe_y', name: 'Breath Heave Y', path: 'transform.y', defaultValue: 0, keyframes: yKeys },
      'transform.rotationZ': { id: 'ch_breathe_rot', name: 'Life Micro-Wiggle', path: 'transform.rotationZ', defaultValue: 0, keyframes: rotKeys },
    };
  }

  /**
   * 1-Tap Jelly Physics: Elastic bouncy wobble with spring decay
   */
  public static generateJellyPhysics(options?: SmartPresetOptions): Record<string, AnimaChannel<number>> {
    const dur = options?.durationSeconds ?? 2.0;
    const intensity = options?.intensity ?? 1.0;
    const sxKeys: Keyframe<number>[] = [];
    const syKeys: Keyframe<number>[] = [];

    // Trigger impacts at t = 0.4s and t = 1.2s
    const impacts = [0.4, 1.2];
    const totalFrames = dur * 24;

    for (let f = 0; f <= totalFrames; f += 2) {
      const t = f / 24;
      let totalWobble = 0;

      for (const imp of impacts) {
        if (t >= imp) {
          const dt = t - imp;
          const decay = Math.exp(-dt * 4.5);
          const oscillation = Math.sin(dt * 18.0);
          totalWobble += oscillation * decay * (0.28 * intensity);
        }
      }

      const sy = 1.0 + totalWobble;
      const sx = 1.0 - totalWobble * 0.8; // Volume preservation

      syKeys.push({ id: `jelly_sy_${f}`, t, v: Math.round(sy * 1000) / 1000, ease: 'smooth' });
      sxKeys.push({ id: `jelly_sx_${f}`, t, v: Math.round(sx * 1000) / 1000, ease: 'smooth' });
    }

    return {
      'transform.scaleX': { id: 'ch_jelly_sx', name: 'Jelly Squash X', path: 'transform.scaleX', defaultValue: 1, keyframes: sxKeys },
      'transform.scaleY': { id: 'ch_jelly_sy', name: 'Jelly Stretch Y', path: 'transform.scaleY', defaultValue: 1, keyframes: syKeys },
    };
  }

  /**
   * 1-Tap Ghibli Float: Organic drifting levitation with gentle wind tilt
   */
  public static generateGhibliFloat(options?: SmartPresetOptions): Record<string, AnimaChannel<number>> {
    const dur = options?.durationSeconds ?? 3.5;
    const intensity = options?.intensity ?? 1.0;
    const yKeys: Keyframe<number>[] = [];
    const xKeys: Keyframe<number>[] = [];
    const rotKeys: Keyframe<number>[] = [];

    const totalFrames = dur * 24;
    for (let f = 0; f <= totalFrames; f += 2) {
      const t = f / 24;
      // Multi-harmonic floating curve
      const floatY = (Math.sin(t * 1.8) * 16 + Math.cos(t * 0.9) * 8) * intensity;
      const driftX = Math.sin(t * 1.1) * (14 * intensity);
      const windRot = Math.sin(t * 1.4) * (2.8 * intensity);

      yKeys.push({ id: `ghibli_y_${f}`, t, v: Math.round(floatY * 10) / 10, ease: 'smooth' });
      xKeys.push({ id: `ghibli_x_${f}`, t, v: Math.round(driftX * 10) / 10, ease: 'smooth' });
      rotKeys.push({ id: `ghibli_rot_${f}`, t, v: Math.round(windRot * 10) / 10, ease: 'smooth' });
    }

    return {
      'transform.y': { id: 'ch_ghibli_y', name: 'Ghibli Volumetric Float', path: 'transform.y', defaultValue: 0, keyframes: yKeys },
      'transform.x': { id: 'ch_ghibli_x', name: 'Ghibli Wind Drift', path: 'transform.x', defaultValue: 0, keyframes: xKeys },
      'transform.rotationZ': { id: 'ch_ghibli_rot', name: 'Airfoil Tilt', path: 'transform.rotationZ', defaultValue: 0, keyframes: rotKeys },
    };
  }

  /**
   * 1-Tap Comic Action Impact: Anticipation squat -> explosive pop -> recovery
   */
  public static generateComicImpactBurst(): Record<string, AnimaChannel<number>> {
    const keysY: Keyframe<number>[] = [
      { id: 'cb_y_1', t: 0.0, v: 0, ease: 'linear' },
      { id: 'cb_y_2', t: 0.15, v: 24, ease: 'smooth' },    // Anticipation squat down
      { id: 'cb_y_3', t: 0.25, v: -90, ease: 'bounce' },   // Explosive upward burst
      { id: 'cb_y_4', t: 0.45, v: -10, ease: 'smooth' },   // Overshoot dip
      { id: 'cb_y_5', t: 0.65, v: 0, ease: 'smooth' },     // Settle
    ];

    const keysScaleY: Keyframe<number>[] = [
      { id: 'cb_sy_1', t: 0.0, v: 1.0, ease: 'linear' },
      { id: 'cb_sy_2', t: 0.15, v: 0.72, ease: 'smooth' }, // Squashed flat
      { id: 'cb_sy_3', t: 0.25, v: 1.45, ease: 'bounce' }, // Stretched tall
      { id: 'cb_sy_4', t: 0.45, v: 0.92, ease: 'smooth' }, // Secondary bounce
      { id: 'cb_sy_5', t: 0.65, v: 1.0, ease: 'smooth' },  // Rest
    ];

    return {
      'transform.y': { id: 'ch_comic_burst_y', name: 'Action Jump Y', path: 'transform.y', defaultValue: 0, keyframes: keysY },
      'transform.scaleY': { id: 'ch_comic_burst_sy', name: 'Squash Anticipation', path: 'transform.scaleY', defaultValue: 1, keyframes: keysScaleY },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SMART VOICE LIP-SYNC & BEAT SYNCHRO
// ─────────────────────────────────────────────────────────────────────────────

export interface VisemeFrame {
  time: number;
  jawOpen: number;     // 0 to 1
  mouthWide: number;    // 0 to 1
  mouthPucker: number;  // 0 to 1
  mouthSmile: number;   // 0 to 1
  phoneme: 'silence' | 'A' | 'E' | 'I' | 'O' | 'U' | 'M';
}

export class VoiceLipSyncEngine {
  /**
   * Synthesize audio frequencies & loudness into continuous vowel mouth visemes
   */
  public static analyzeAudioBuffer(
    samples: Float32Array,
    sampleRate: number,
    fps: number = 24,
    cadence: number = 2
  ): VisemeFrame[] {
    const totalDuration = samples.length / sampleRate;
    const frameInterval = (1 / fps) * cadence;
    const visemes: VisemeFrame[] = [];

    const windowSize = Math.floor(sampleRate * 0.035); // 35ms analysis window

    for (let t = 0; t <= totalDuration; t += frameInterval) {
      const sampleIdx = Math.floor(t * sampleRate);
      let rms = 0;
      let zeroCrossings = 0;

      for (let i = 0; i < windowSize && sampleIdx + i < samples.length; i++) {
        const val = samples[sampleIdx + i];
        rms += val * val;
        if (i > 0 && Math.sign(val) !== Math.sign(samples[sampleIdx + i - 1])) {
          zeroCrossings++;
        }
      }

      rms = Math.sqrt(rms / windowSize);
      const zcr = zeroCrossings / windowSize; // Rough frequency centroid proxy

      let phoneme: VisemeFrame['phoneme'] = 'silence';
      let jawOpen = 0;
      let mouthWide = 0.2;
      let mouthPucker = 0;
      let mouthSmile = 0.1;

      if (rms > 0.03) {
        const volumeFactor = Math.min(1.0, rms * 4.0);

        if (zcr > 0.3) {
          // High frequency: /E/ or /I/
          phoneme = zcr > 0.4 ? 'E' : 'I';
          jawOpen = 0.45 * volumeFactor;
          mouthWide = 0.85;
          mouthSmile = 0.7;
        } else if (zcr < 0.12) {
          // Low frequency round: /O/ or /U/
          phoneme = zcr < 0.08 ? 'U' : 'O';
          jawOpen = 0.55 * volumeFactor;
          mouthPucker = 0.8;
          mouthWide = 0.15;
        } else {
          // Mid frequency: /A/ wide vowel
          phoneme = 'A';
          jawOpen = 0.9 * volumeFactor;
          mouthWide = 0.6;
        }
      }

      visemes.push({
        time: t,
        jawOpen: Math.round(jawOpen * 100) / 100,
        mouthWide: Math.round(mouthWide * 100) / 100,
        mouthPucker: Math.round(mouthPucker * 100) / 100,
        mouthSmile: Math.round(mouthSmile * 100) / 100,
        phoneme,
      });
    }

    return visemes;
  }

  /**
   * Generates keyframe channels from analyzed visemes ready to insert into timeline
   */
  public static visemesToChannels(visemes: VisemeFrame[], layerId: string = 'l_face'): Record<string, AnimaChannel<number>> {
    const jawKeys: Keyframe<number>[] = [];
    const smileKeys: Keyframe<number>[] = [];
    const puckerKeys: Keyframe<number>[] = [];

    visemes.forEach((vf, idx) => {
      jawKeys.push({ id: `v_j_${idx}`, t: vf.time, v: vf.jawOpen, ease: 'smooth' });
      smileKeys.push({ id: `v_s_${idx}`, t: vf.time, v: vf.mouthSmile, ease: 'smooth' });
      puckerKeys.push({ id: `v_p_${idx}`, t: vf.time, v: vf.mouthPucker, ease: 'smooth' });
    });

    return {
      'face.jawOpen': { id: `ch_jaw_${layerId}`, name: 'Jaw Open (Speech)', path: 'face.jawOpen', defaultValue: 0, keyframes: jawKeys },
      'face.mouthSmile': { id: `ch_smile_${layerId}`, name: 'Mouth Smile', path: 'face.mouthSmile', defaultValue: 0, keyframes: smileKeys },
      'face.mouthPucker': { id: `ch_pucker_${layerId}`, name: 'Mouth Pucker (O/U)', path: 'face.mouthPucker', defaultValue: 0, keyframes: puckerKeys },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ICONIC POSE LIBRARY (Stamps)
// ─────────────────────────────────────────────────────────────────────────────

export interface PoseDefinition {
  id: string;
  name: string;
  category: 'action' | 'emotion' | 'dance' | 'comedy';
  icon: string;
  description: string;
  boneRotations: Record<string, number>; // jointName -> degrees
  facialBlendweights: Record<string, number>; // blendshape -> 0 to 1
  squashFactor?: { x: number; y: number };
}

export const POSE_LIBRARY: PoseDefinition[] = [
  {
    id: 'happy_jump',
    name: 'Happy Star Jump',
    category: 'action',
    icon: '⭐',
    description: 'Arms spread wide aloft, head tilted joyfully, knees tucked',
    boneRotations: { 'arm_l': -125, 'arm_r': 125, 'leg_l': -25, 'leg_r': 25, 'head': -12, 'spine': -6 },
    facialBlendweights: { 'mouthSmile': 0.9, 'jawOpen': 0.65, 'eyeWide': 0.8 },
    squashFactor: { x: 0.9, y: 1.15 },
  },
  {
    id: 'sneak_crouch',
    name: 'Stealth Sneak',
    category: 'action',
    icon: '🤫',
    description: 'Hunched low stealth crouch with tip-toe balance',
    boneRotations: { 'spine': 28, 'head': -18, 'arm_l': 45, 'arm_r': -35, 'leg_l': 40, 'leg_r': -30 },
    facialBlendweights: { 'eyeSquint': 0.75, 'mouthSmile': 0.2, 'jawOpen': 0.05 },
    squashFactor: { x: 1.25, y: 0.8 },
  },
  {
    id: 'shocked_take',
    name: 'Tex Avery Wild Take',
    category: 'comedy',
    icon: '😱',
    description: 'Eyes bugging out, jaw dropped to floor, spine recoil',
    boneRotations: { 'spine': -22, 'head': -28, 'arm_l': -80, 'arm_r': 80, 'leg_l': -10, 'leg_r': 10 },
    facialBlendweights: { 'jawOpen': 1.0, 'eyeWide': 1.0, 'browInnerUp': 0.95 },
    squashFactor: { x: 0.82, y: 1.35 },
  },
  {
    id: 'hero_landing',
    name: 'Three-Point Hero Landing',
    category: 'action',
    icon: '🦸',
    description: 'One fist planted into ground, dust blast posture',
    boneRotations: { 'spine': 35, 'head': 12, 'arm_l': 75, 'arm_r': -40, 'leg_l': 65, 'leg_r': -55 },
    facialBlendweights: { 'browDown': 0.8, 'jawOpen': 0.0, 'mouthFrown': 0.4 },
    squashFactor: { x: 1.3, y: 0.75 },
  },
  {
    id: 'jazz_shimmy',
    name: '1930s Jazz Shimmy',
    category: 'dance',
    icon: '💃',
    description: 'Snapping finger jazz hands, syncopated hip cock',
    boneRotations: { 'spine': -8, 'head': 14, 'arm_l': -48, 'arm_r': 48, 'leg_l': -18, 'leg_r': 18 },
    facialBlendweights: { 'mouthSmile': 0.8, 'eyeWink': 0.9 },
    squashFactor: { x: 1.05, y: 0.98 },
  },
  {
    id: 'triumphant_roar',
    name: 'Kaiju Mascot Roar',
    category: 'action',
    icon: '🦖',
    description: 'Chest puffed forward, frills radiating, mighty roar stance',
    boneRotations: { 'spine': -15, 'head': -25, 'arm_l': -95, 'arm_r': 95, 'leg_l': -15, 'leg_r': 15 },
    facialBlendweights: { 'jawOpen': 0.95, 'mouthWide': 0.9, 'eyeWide': 0.7 },
    squashFactor: { x: 1.15, y: 1.1 },
  },
];

export function stampPoseOntoLayer(
  layer: AnimaLayer,
  poseId: string,
  currentTimeSec: number,
  blendDurationSec: number = 0.25
): void {
  const pose = POSE_LIBRARY.find(p => p.id === poseId);
  if (!pose) return;

  // Insert bone rotation keys
  for (const [bone, deg] of Object.entries(pose.boneRotations)) {
    const channelKey = `bone.${bone}.rot`;
    if (!layer.channels[channelKey]) {
      layer.channels[channelKey] = {
        id: `ch_${bone}_rot`,
        name: `Bone ${bone} Rot`,
        path: channelKey,
        defaultValue: 0,
        keyframes: [],
      };
    }
    const ch = layer.channels[channelKey];
    ch.keyframes.push({
      id: `pose_${poseId}_${bone}_${Date.now()}`,
      t: currentTimeSec + blendDurationSec,
      v: deg,
      ease: 'smooth',
    });
    ch.keyframes.sort((a, b) => a.t - b.t);
  }

  // Insert facial blendshape keys
  for (const [shape, weight] of Object.entries(pose.facialBlendweights)) {
    const channelKey = `face.${shape}`;
    if (!layer.channels[channelKey]) {
      layer.channels[channelKey] = {
        id: `ch_face_${shape}`,
        name: `Face ${shape}`,
        path: channelKey,
        defaultValue: 0,
        keyframes: [],
      };
    }
    const ch = layer.channels[channelKey];
    ch.keyframes.push({
      id: `pose_face_${shape}_${Date.now()}`,
      t: currentTimeSec + blendDurationSec,
      v: weight,
      ease: 'smooth',
    });
    ch.keyframes.sort((a, b) => a.t - b.t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. INTERACTIVE SPLINE GRAPH EDITOR (Pro Curves)
// ─────────────────────────────────────────────────────────────────────────────

export class InteractiveSplineGraph {
  /**
   * Evaluates cubic Bézier spline interpolation between two keyframes with control handles
   */
  public static evaluateSegment(
    k0: Keyframe<number>,
    k1: Keyframe<number>,
    t: number
  ): number {
    const span = Math.max(0.0001, k1.t - k0.t);
    const u = Math.max(0, Math.min(1, (t - k0.t) / span));

    if (k0.ease === 'hold') return k0.v;
    if (k0.ease === 'linear') return k0.v + (k1.v - k0.v) * u;

    // Cubic Bézier with Tangent Handles
    const p0 = k0.v;
    const p3 = k1.v;

    // Default handle span is 1/3 of the interval
    const h0y = k0.outHandle ? k0.v + k0.outHandle.dy : k0.v;
    const h1y = k1.inHandle ? k1.v + k1.inHandle.dy : k1.v;

    // Bernstein polynomials: B(u) = (1-u)^3*p0 + 3(1-u)^2*u*p1 + 3(1-u)*u^2*p2 + u^3*p3
    const oneMinusU = 1 - u;
    const b0 = oneMinusU * oneMinusU * oneMinusU;
    const b1 = 3 * oneMinusU * oneMinusU * u;
    const b2 = 3 * oneMinusU * u * u;
    const b3 = u * u * u;

    return b0 * p0 + b1 * h0y + b2 * h1y + b3 * p3;
  }

  /**
   * Sets classic animation ease presets onto a keyframe pair
   */
  public static setEasePreset(
    k0: Keyframe<number>,
    k1: Keyframe<number>,
    preset: 'easy_ease' | 'ease_in' | 'ease_out' | 'back_overshoot' | 'linear'
  ): void {
    const span = k1.t - k0.t;
    const deltaV = k1.v - k0.v;

    if (preset === 'linear') {
      k0.ease = 'linear';
      k0.outHandle = { dx: span * 0.33, dy: deltaV * 0.33 };
      k1.inHandle = { dx: -span * 0.33, dy: -deltaV * 0.33 };
    } else if (preset === 'easy_ease') {
      k0.ease = 'bezier';
      k0.outHandle = { dx: span * 0.35, dy: 0 }; // flat tangent out
      k1.inHandle = { dx: -span * 0.35, dy: 0 }; // flat tangent in
    } else if (preset === 'ease_in') {
      k0.ease = 'bezier';
      k0.outHandle = { dx: span * 0.45, dy: 0 };
      k1.inHandle = { dx: -span * 0.1, dy: -deltaV * 0.5 };
    } else if (preset === 'ease_out') {
      k0.ease = 'bezier';
      k0.outHandle = { dx: span * 0.1, dy: deltaV * 0.5 };
      k1.inHandle = { dx: -span * 0.45, dy: 0 };
    } else if (preset === 'back_overshoot') {
      k0.ease = 'bezier';
      k0.outHandle = { dx: span * 0.3, dy: 0 };
      k1.inHandle = { dx: -span * 0.3, dy: deltaV * 0.25 }; // shoots past target
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. MOTION FX BRUSHES (Real-Time Particle Painting)
// ─────────────────────────────────────────────────────────────────────────────

export type MotionBrushKind =
  | 'sparkle_stardust'
  | 'ghibli_leaves'
  | 'action_fire'
  | 'manga_ink';

export interface MotionParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  life: number;     // 1.0 to 0.0
  decay: number;
  kind: MotionBrushKind;
}

export class MotionFXBrushEngine {
  private particles: MotionParticle[] = [];

  public emitFromBrush(kind: MotionBrushKind, x: number, y: number, count: number = 3): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 80;

      let color = '#00DAF3';
      let size = 6;
      let rotSpeed = (Math.random() - 0.5) * 4;

      if (kind === 'sparkle_stardust') {
        color = Math.random() > 0.5 ? '#FFD700' : '#00DAF3';
        size = 3 + Math.random() * 5;
      } else if (kind === 'ghibli_leaves') {
        const leafPalette = ['#E65100', '#F57C00', '#FFB74D', '#C2185B', '#4CAF50'];
        color = leafPalette[Math.floor(Math.random() * leafPalette.length)];
        size = 8 + Math.random() * 8;
      } else if (kind === 'action_fire') {
        color = Math.random() > 0.4 ? '#FF5722' : '#FFEB3B';
        size = 8 + Math.random() * 12;
      } else if (kind === 'manga_ink') {
        color = '#111111';
        size = 4 + Math.random() * 10;
      }

      this.particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed,
        color,
        life: 1.0,
        decay: 0.4 + Math.random() * 0.6,
        kind,
      });
    }
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotSpeed * dt;

      // Gravity or wind drift
      if (p.kind === 'ghibli_leaves') {
        p.vy += 30 * dt; // gentle flutter gravity
        p.vx += Math.sin(p.rotation) * 20 * dt;
      } else if (p.kind === 'action_fire') {
        p.vy -= 90 * dt; // buoyant upward flames
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const p of this.particles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, p.life);

      if (p.kind === 'sparkle_stardust') {
        // 4-point twinkling star
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const s = p.size;
        ctx.moveTo(0, -s * 1.5);
        ctx.lineTo(s * 0.3, -s * 0.3);
        ctx.lineTo(s * 1.5, 0);
        ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s * 1.5);
        ctx.lineTo(-s * 0.3, s * 0.3);
        ctx.lineTo(-s * 1.5, 0);
        ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'ghibli_leaves') {
        // Organic leaf ellipse
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fire or Ink droplet
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
    ctx.restore();
  }

  public clear(): void {
    this.particles = [];
  }
}
