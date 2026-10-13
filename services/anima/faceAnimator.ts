/**
 * services/anima/faceAnimator.ts
 *
 * Plajah Unified Motion & Animation System ("Anima") - Character Face Animator
 *
 * Extracts VTuber tracking technology (52 ARKit blendshapes + 3D head pose) into
 * a dedicated Character Face Animator that can capture performance from live webcam
 * or uploaded video files, continuously retarget to 2D character rigs (Kith Kaijus,
 * authentic classic cartoon rigs, and custom bone/layer facial rigs), and bake
 * performance streams directly into timeline keyframes.
 */

import type { AnimaProject, AnimaLayer, AnimaChannel, Keyframe } from './types.ts';
import { REST, type Pose as KaijuPose } from '../../components/kaiju/kaijuPose.ts';

export interface FacePerformanceFrame {
  timeSec: number;
  frameIndex: number;
  blendshapes: Record<string, number>;
  head: {
    pitch: number; // rotationX (degrees)
    yaw: number;   // rotationY
    roll: number;  // rotationZ
    x: number;     // translation
    y: number;
    z: number;
  };
  expressions: Record<string, number>;
  gaze: {
    lookX: number; // -1 (left) to +1 (right)
    lookY: number; // -1 (up) to +1 (down)
  };
}

export interface FacePerformanceClip {
  id: string;
  name: string;
  fps: number;
  durationSec: number;
  frames: FacePerformanceFrame[];
}

export interface FaceAnimatorConfig {
  mirrorSelfie?: boolean;
  gain?: number;            // 1.0 = natural, 1.4 = anime exaggeration
  smoothing?: number;       // 0..1 OneEuro responsiveness
  neutralOffset?: Record<string, number>;
  jawSensitivity?: number;
  blinkSensitivity?: number;
}

export interface FaceBakeOptions {
  sampleCadence?: 'every_frame' | 'on_2s' | 'adaptive';
  tolerance?: number;       // for adaptive decimation (e.g. 0.015)
  channels?: string[];      // filter specific channels to bake, e.g. ['mouth', 'blink', 'head.rotZ']
  startFrame?: number;
  fps?: number;
}

export interface ClassicFaceChannels {
  mouthOpen: number;      // 0..1
  mouthPucker: number;    // 0..1 (whistling, o-shape)
  mouthSmile: number;     // -1 (frown) to +1 (broad smile)
  eyeBlinkL: number;      // 0 (open) .. 1 (closed)
  eyeBlinkR: number;      // 0 (open) .. 1 (closed)
  browY: number;          // -1 (furrowed) .. +1 (raised surprised)
  headRotZ: number;       // degrees
  headX: number;          // pixels offset
  headY: number;
}

/** One-Euro filter implementation */
class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(x: number, t: number): number {
    if (this.xPrev === null || t <= this.tPrev) {
      this.xPrev = x;
      this.tPrev = t;
      this.dxPrev = 0;
      return x;
    }
    const dt = t - this.tPrev;
    const alpha = (cutoff: number) => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    };
    const dx = (x - this.xPrev) / dt;
    const edx = this.dxPrev + alpha(this.dCutoff) * (dx - this.dxPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    const x2 = this.xPrev + alpha(cutoff) * (x - this.xPrev);
    this.xPrev = x2;
    this.dxPrev = edx;
    this.tPrev = t;
    return x2;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }
}

class OneEuroFilterBank {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private map = new Map<string, OneEuroFilter>();

  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(key: string, x: number, t: number): number {
    let f = this.map.get(key);
    if (!f) {
      f = new OneEuroFilter(this.minCutoff, this.beta, this.dCutoff);
      this.map.set(key, f);
    }
    return f.filter(x, t);
  }

  reset(): void {
    this.map.forEach((f) => f.reset());
  }
}

/**
 * CharacterFaceAnimator engine
 */
export class CharacterFaceAnimator {
  private filterBank = new OneEuroFilterBank(2.5, 0.02);
  private config: Required<FaceAnimatorConfig>;
  private isRecording = false;
  private recordedFrames: FacePerformanceFrame[] = [];
  private recordingStartTime = 0;

  constructor(config: FaceAnimatorConfig = {}) {
    this.config = {
      mirrorSelfie: config.mirrorSelfie ?? true,
      gain: config.gain ?? 1.2,
      smoothing: config.smoothing ?? 0.8,
      neutralOffset: config.neutralOffset ?? {},
      jawSensitivity: config.jawSensitivity ?? 1.25,
      blinkSensitivity: config.blinkSensitivity ?? 1.1,
    };
  }

  public updateConfig(newConfig: Partial<FaceAnimatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public reset(): void {
    this.filterBank.reset();
    this.recordedFrames = [];
    this.isRecording = false;
  }

  /**
   * Process a single video frame / tracker output and return normalized performance data
   */
  public processFrame(frame: { blendshapes: Record<string, number>; matrix?: Float32Array | null; bbox?: any }, timeSec: number): FacePerformanceFrame {
    const bs = (k: string) => frame.blendshapes[k] ?? 0;

    const rawJaw = Math.min(1, Math.max(0, bs('jawOpen') * this.config.jawSensitivity));
    const rawBlinkL = Math.min(1, Math.max(0, bs('eyeBlinkLeft') * this.config.blinkSensitivity));
    const rawBlinkR = Math.min(1, Math.max(0, bs('eyeBlinkRight') * this.config.blinkSensitivity));
    const rawSmileL = bs('mouthSmileLeft');
    const rawSmileR = bs('mouthSmileRight');
    const rawPucker = bs('mouthPucker');
    const rawFunnel = bs('mouthFunnel');
    const rawBrowInner = bs('browInnerUp');
    const rawBrowDownL = bs('browDownLeft');
    const rawBrowDownR = bs('browDownRight');

    const jaw = this.filterBank.filter('jaw', rawJaw, timeSec);
    const blinkL = this.filterBank.filter('blinkL', rawBlinkL, timeSec);
    const blinkR = this.filterBank.filter('blinkR', rawBlinkR, timeSec);
    const smile = this.filterBank.filter('smile', (rawSmileL + rawSmileR) / 2, timeSec);

    const lookX = ((bs('eyeLookRightLeft') || bs('eyeLookOutRight')) - (bs('eyeLookLeftLeft') || bs('eyeLookInRight'))) * 1.3;
    const lookY = ((bs('eyeLookDownLeft') + bs('eyeLookDownRight')) / 2 - (bs('eyeLookUpLeft') + bs('eyeLookUpRight')) / 2) * 1.3;

    // Decompose 4x4 matrix into Euler angles in degrees
    let pitch = 0;
    let yaw = 0;
    let roll = 0;

    if (frame.matrix && frame.matrix.length >= 16) {
      const m = frame.matrix;
      // YXZ Euler order decomposition from column-major matrix
      // m00=m[0], m10=m[1], m20=m[2]
      // m01=m[4], m11=m[5], m21=m[6]
      // m02=m[8], m12=m[9], m22=m[10]
      const RAD2DEG = 180 / Math.PI;
      const m12 = Math.max(-1, Math.min(1, m[9]));
      pitch = Math.asin(-m12) * RAD2DEG;

      if (Math.abs(m12) < 0.99999) {
        yaw = Math.atan2(m[8], m[10]) * RAD2DEG;
        roll = Math.atan2(m[1], m[5]) * RAD2DEG;
      } else {
        yaw = Math.atan2(-m[2], m[0]) * RAD2DEG;
        roll = 0;
      }
    }

    const sign = this.config.mirrorSelfie ? -1 : 1;
    yaw = this.filterBank.filter('yaw', yaw * sign, timeSec);
    pitch = this.filterBank.filter('pitch', pitch, timeSec);
    roll = this.filterBank.filter('roll', roll * sign, timeSec);

    const perfFrame: FacePerformanceFrame = {
      timeSec,
      frameIndex: Math.round(timeSec * 30),
      blendshapes: {
        ...frame.blendshapes,
        jawOpen: jaw,
        mouthSmileLeft: smile,
        mouthSmileRight: smile,
        eyeBlinkLeft: blinkL,
        eyeBlinkRight: blinkR,
      },
      head: {
        pitch,
        yaw,
        roll,
        x: (frame.bbox ? (frame.bbox.x + frame.bbox.w / 2 - 0.5) * 200 : 0) * sign,
        y: frame.bbox ? (frame.bbox.y + frame.bbox.h / 2 - 0.5) * 200 : 0,
        z: frame.bbox ? (1 - frame.bbox.w) * 100 : 0,
      },
      expressions: {
        jaw,
        blinkLeft: blinkL,
        blinkRight: blinkR,
        happy: smile,
        mouthPucker: rawPucker,
        mouthFunnel: rawFunnel,
        browInner: rawBrowInner,
      },
      gaze: {
        lookX: Math.max(-1, Math.min(1, lookX)),
        lookY: Math.max(-1, Math.min(1, lookY)),
      },
    };

    if (this.isRecording) {
      this.recordedFrames.push(perfFrame);
    }

    return perfFrame;
  }

  public startRecording(startTimeSec = 0): void {
    this.recordedFrames = [];
    this.isRecording = true;
    this.recordingStartTime = startTimeSec;
  }

  public stopRecording(name = 'Face Performance'): FacePerformanceClip {
    this.isRecording = false;
    const frames = [...this.recordedFrames];
    const duration = frames.length > 1 ? frames[frames.length - 1].timeSec - frames[0].timeSec : 0;
    const fps = frames.length > 1 ? Math.round((frames.length - 1) / duration) : 24;

    return {
      id: `perf_${Date.now()}`,
      name,
      fps: fps > 0 ? fps : 24,
      durationSec: Math.max(0.1, duration),
      frames,
    };
  }

  /**
   * Retarget a performance frame onto a Plajah Kith Kaiju (Rello / Lumi & Chora / Lorik)
   */
  public retargetToKaiju(frame: FacePerformanceFrame): KaijuPose {
    const out: KaijuPose = { ...REST };
    const bs = (k: string) => frame.blendshapes[k] ?? 0;
    const g = this.config.gain;

    const blinkL = frame.expressions.blinkLeft ?? bs('eyeBlinkLeft');
    const blinkR = frame.expressions.blinkRight ?? bs('eyeBlinkRight');

    out.eyeL = 1 - 0.96 * Math.min(1, blinkL * 1.15);
    out.eyeR = 1 - 0.96 * Math.min(1, blinkR * 1.15);
    out.eyeOpen = 1;

    const wide = (bs('eyeWideLeft') + bs('eyeWideRight')) / 2;
    out.eyeScale = 1 + 0.3 * Math.min(1, wide * g);

    const smile = (bs('mouthSmileLeft') + bs('mouthSmileRight')) / 2;
    const jaw = bs('jawOpen');

    out.mouth = Math.min(1, Math.max(0, jaw * 1.3 - 0.02));
    out.smile = Math.min(1, Math.max(-1, -0.4 + 1.9 * smile * g));
    out.happy = Math.min(1, smile * 2.2);

    out.headRot = frame.head.roll;
    out.headX = frame.head.x;
    out.headY = frame.head.y;
    out.lookX = frame.gaze.lookX;
    out.lookY = frame.gaze.lookY;

    return out;
  }

  /**
   * Retarget a performance frame onto authentic classic cartoon channels
   */
  public retargetToClassic(frame: FacePerformanceFrame, characterId: string): ClassicFaceChannels {
    const bs = (k: string) => frame.blendshapes[k] ?? 0;
    const jaw = bs('jawOpen');
    const pucker = bs('mouthPucker');
    const smile = (bs('mouthSmileLeft') + bs('mouthSmileRight')) / 2;
    const frown = (bs('mouthFrownLeft') + bs('mouthFrownRight')) / 2;
    const blinkL = frame.expressions.blinkLeft ?? bs('eyeBlinkLeft');
    const blinkR = frame.expressions.blinkRight ?? bs('eyeBlinkRight');
    const browInner = bs('browInnerUp');
    const browDown = (bs('browDownLeft') + bs('browDownRight')) / 2;

    const netSmile = Math.max(-1, Math.min(1, smile * 1.5 - frown * 1.3));
    const netBrow = Math.max(-1, Math.min(1, browInner * 1.4 - browDown * 1.4));

    let puckerMult = 1.0;
    let rollMult = 1.0;

    if (characterId === 'steamboat_willie') {
      puckerMult = 1.8; // whistling mouth focus
      rollMult = 1.25;  // rubber-hose rhythm
    } else if (characterId === 'felix_the_cat' || characterId === 'felix_cat') {
      rollMult = 1.4;   // contemplative pacing head tilt
    } else if (characterId === 'fleischer_flapper') {
      rollMult = 1.3;   // jazz head bob
    }

    return {
      mouthOpen: Math.min(1, jaw * 1.2),
      mouthPucker: Math.min(1, pucker * puckerMult),
      mouthSmile: netSmile,
      eyeBlinkL: Math.min(1, blinkL * 1.2),
      eyeBlinkR: Math.min(1, blinkR * 1.2),
      browY: netBrow,
      headRotZ: frame.head.roll * rollMult,
      headX: frame.head.x,
      headY: frame.head.y,
    };
  }

  public retargetToChannels(frame: FacePerformanceFrame): Record<string, number> {
    const classic = this.retargetToClassic(frame, 'generic');
    return {
      'face.mouthOpen': classic.mouthOpen,
      'face.mouthPucker': classic.mouthPucker,
      'face.mouthSmile': classic.mouthSmile,
      'face.eyeBlinkL': classic.eyeBlinkL,
      'face.eyeBlinkR': classic.eyeBlinkR,
      'face.browY': classic.browY,
      'face.lookX': frame.gaze.lookX,
      'face.lookY': frame.gaze.lookY,
      'transform.rotationZ': frame.head.roll,
      'transform.rotationX': frame.head.pitch,
      'transform.rotationY': frame.head.yaw,
      'transform.x': frame.head.x,
      'transform.y': frame.head.y,
    };
  }
}

/**
 * Bake recorded face performance clip into timeline keyframes on a target layer
 */
export function bakeFacePerformanceToTimeline(
  project: AnimaProject,
  clip: FacePerformanceClip,
  targetLayerId: string,
  options: FaceBakeOptions = {}
): AnimaProject {
  const layerIndex = project.layers.findIndex((l) => l.id === targetLayerId);
  if (layerIndex === -1) {
    console.warn(`Layer with ID ${targetLayerId} not found in project`);
    return project;
  }

  const layer = project.layers[layerIndex];
  const cadence = options.sampleCadence ?? 'adaptive';
  const tolerance = options.tolerance ?? 0.012;
  const stepFrames = cadence === 'on_2s' ? 2 : 1;

  const updatedChannels = { ...layer.channels };
  const animator = new CharacterFaceAnimator();

  const channelStreams: Record<string, { t: number; v: number }[]> = {};
  const frames = clip.frames;
  if (frames.length === 0) return project;

  const startTime = frames[0].timeSec;

  for (let i = 0; i < frames.length; i += stepFrames) {
    const frame = frames[i];
    const relTime = frame.timeSec - startTime;
    const channelValues = animator.retargetToChannels(frame);

    for (const [chPath, val] of Object.entries(channelValues)) {
      if (options.channels && !options.channels.includes(chPath)) continue;
      if (!channelStreams[chPath]) {
        channelStreams[chPath] = [];
      }
      channelStreams[chPath].push({ t: relTime, v: val });
    }
  }

  for (const [chPath, samples] of Object.entries(channelStreams)) {
    let keyframes: Keyframe<number>[] = [];

    if (cadence === 'adaptive' && samples.length > 2) {
      const decimated = simplifyPoints(samples, tolerance);
      keyframes = decimated.map((pt, idx) => ({
        id: `k_face_${chPath}_${idx}`,
        t: Number(pt.t.toFixed(3)),
        v: Number(pt.v.toFixed(3)),
        ease: 'smooth',
      }));
    } else {
      keyframes = samples.map((pt, idx) => ({
        id: `k_face_${chPath}_${idx}`,
        t: Number(pt.t.toFixed(3)),
        v: Number(pt.v.toFixed(3)),
        ease: 'smooth',
      }));
    }

    const existingCh = updatedChannels[chPath];
    const newChannel: AnimaChannel<number> = {
      id: existingCh ? existingCh.id : `ch_${chPath.replace('.', '_')}`,
      name: chPath,
      path: chPath,
      defaultValue: samples.length > 0 ? samples[0].v : 0,
      keyframes,
    };
    updatedChannels[chPath] = newChannel;
  }

  const updatedLayers = [...project.layers];
  updatedLayers[layerIndex] = {
    ...layer,
    channels: updatedChannels,
  };

  return {
    ...project,
    layers: updatedLayers,
  };
}

function simplifyPoints(points: { t: number; v: number }[], epsilon: number): { t: number; v: number }[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = simplifyPoints(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyPoints(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [first, last];
  }
}

function perpendicularDistance(
  pt: { t: number; v: number },
  lineStart: { t: number; v: number },
  lineEnd: { t: number; v: number }
): number {
  const dx = lineEnd.t - lineStart.t;
  const dy = lineEnd.v - lineStart.v;
  if (dx === 0 && dy === 0) {
    return Math.hypot(pt.t - lineStart.t, pt.v - lineStart.v);
  }
  const numerator = Math.abs(dy * pt.t - dx * pt.v + lineEnd.t * lineStart.v - lineEnd.v * lineStart.t);
  const denominator = Math.hypot(dx, dy);
  return numerator / denominator;
}
