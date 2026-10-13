/**
 * services/anima/videoMotionTracker.ts
 *
 * Plajah Unified Motion & Animation System ("Anima") - Video Motion Tracker
 *
 * Tracks body motion from reference video frames (or live camera) using MediaPipe 33
 * pose landmarks, extracts normalized 2D skeletal joint angles and root trajectory,
 * retargets continuous motion onto 2D character skeletal bone rigs, and bakes
 * motion tracks into timeline keyframes.
 */

import type { AnimaProject, AnimaLayer, AnimaBone, AnimaChannel, Keyframe } from './types.ts';
import type { PosePoint, PoseFrame } from '../vtuber/poseTracker.ts';
import { POSE } from '../vtuber/poseTracker.ts';

export interface SkeletalJointAngles {
  rootX: number;              // Pelvis normalized X (-100 to 100 px relative)
  rootY: number;              // Pelvis normalized Y
  spineRot: number;           // Torso lean angle (degrees from vertical)
  headRot: number;            // Head tilt relative to spine (degrees)
  armL_upperRot: number;      // Left upper arm rotation
  armL_lowerRot: number;      // Left forearm rotation (elbow bend)
  armR_upperRot: number;      // Right upper arm rotation
  armR_lowerRot: number;      // Right forearm rotation (elbow bend)
  legL_upperRot: number;      // Left thigh rotation
  legL_lowerRot: number;      // Left calf rotation (knee bend)
  legR_upperRot: number;      // Right thigh rotation
  legR_lowerRot: number;      // Right calf rotation (knee bend)
  footL_rot: number;          // Left foot angle
  footR_rot: number;          // Right foot angle
}

export interface TrackedMotionFrame {
  timeSec: number;
  frameIndex: number;
  landmarks: PosePoint[];
  angles: SkeletalJointAngles;
  confidence: number;
}

export interface TrackedMotionClip {
  id: string;
  name: string;
  fps: number;
  durationSec: number;
  frames: TrackedMotionFrame[];
}

export interface MotionTrackerConfig {
  mirrorSelfie?: boolean;
  smoothingAlpha?: number;    // Exponential smoothing factor (0.0 to 1.0, default 0.65)
  rootScale?: number;         // Root translation multiplier (default 300)
  minConfidence?: number;     // Visibility threshold (default 0.35)
}

export interface MotionBakeOptions {
  sampleCadence?: 'every_frame' | 'on_2s' | 'adaptive';
  tolerance?: number;
  bakeRootTranslation?: boolean;
  bakeBoneRotations?: boolean;
  targetBoneMapping?: Record<string, keyof SkeletalJointAngles>;
}

const RAD2DEG = 180 / Math.PI;

/**
 * Computes 2D angle of vector (p1 -> p2) in degrees [ -180, 180 ]
 * 0 degrees = pointing straight down (+Y in canvas space)
 */
function vectorAngleDeg(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dx, dy) * RAD2DEG;
}

/**
 * Computes relative angle between parent vector (p0 -> p1) and child vector (p1 -> p2)
 */
function relativeJointAngleDeg(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const aParent = vectorAngleDeg(p0, p1);
  const aChild = vectorAngleDeg(p1, p2);
  let diff = aChild - aParent;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/**
 * VideoMotionTracker engine
 */
export class VideoMotionTracker {
  private config: Required<MotionTrackerConfig>;
  private isRecording = false;
  private recordedFrames: TrackedMotionFrame[] = [];
  private prevAngles: SkeletalJointAngles | null = null;
  private neutralRoot: { x: number; y: number } | null = null;

  constructor(config: MotionTrackerConfig = {}) {
    this.config = {
      mirrorSelfie: config.mirrorSelfie ?? true,
      smoothingAlpha: config.smoothingAlpha ?? 0.65,
      rootScale: config.rootScale ?? 300,
      minConfidence: config.minConfidence ?? 0.35,
    };
  }

  public reset(): void {
    this.isRecording = false;
    this.recordedFrames = [];
    this.prevAngles = null;
    this.neutralRoot = null;
  }

  public startRecording(): void {
    this.recordedFrames = [];
    this.isRecording = true;
    this.prevAngles = null;
  }

  public stopRecording(name = 'Video Mocap Clip'): TrackedMotionClip {
    this.isRecording = false;
    const frames = [...this.recordedFrames];
    const duration = frames.length > 1 ? frames[frames.length - 1].timeSec - frames[0].timeSec : 0;
    const fps = frames.length > 1 ? Math.round((frames.length - 1) / duration) : 24;

    return {
      id: `mocap_${Date.now()}`,
      name,
      fps: fps > 0 ? fps : 24,
      durationSec: Math.max(0.1, duration),
      frames,
    };
  }

  /**
   * Process a single video frame containing MediaPipe 33 landmarks
   */
  public processFrame(frame: PoseFrame, timeSec: number): TrackedMotionFrame | null {
    const pts = frame.pts;
    if (!pts || pts.length < 33) return null;

    const sign = this.config.mirrorSelfie ? -1 : 1;

    // Helper to get landmark with mirroring
    const getPt = (idx: number) => {
      const p = pts[idx];
      return {
        x: this.config.mirrorSelfie ? (1 - p.x) : p.x,
        y: p.y,
        v: p.v,
      };
    };

    const nose = getPt(POSE.nose);
    const shoulderL = getPt(POSE.shoulderL);
    const shoulderR = getPt(POSE.shoulderR);
    const elbowL = getPt(POSE.elbowL);
    const elbowR = getPt(POSE.elbowR);
    const wristL = getPt(POSE.wristL);
    const wristR = getPt(POSE.wristR);
    const hipL = getPt(POSE.hipL);
    const hipR = getPt(POSE.hipR);
    const ankleL = getPt(POSE.ankleL);
    const ankleR = getPt(POSE.ankleR);

    // Midpoints
    const midShoulder = {
      x: (shoulderL.x + shoulderR.x) / 2,
      y: (shoulderL.y + shoulderR.y) / 2,
    };
    const midHip = {
      x: (hipL.x + hipR.x) / 2,
      y: (hipL.y + hipR.y) / 2,
    };

    if (!this.neutralRoot) {
      this.neutralRoot = { x: midHip.x, y: midHip.y };
    }

    // Root translation relative to initial neutral posture
    const rootX = (midHip.x - this.neutralRoot.x) * this.config.rootScale;
    const rootY = (midHip.y - this.neutralRoot.y) * this.config.rootScale;

    // Torso spine angle (from hip to shoulder, 0 = upright)
    // In canvas space, up is -Y, so midHip -> midShoulder is pointing up (-Y)
    const spineVector = { x: midShoulder.x - midHip.x, y: midShoulder.y - midHip.y };
    const spineRot = Math.atan2(spineVector.x, -spineVector.y) * RAD2DEG;

    // Head tilt relative to torso
    const headVector = { x: nose.x - midShoulder.x, y: nose.y - midShoulder.y };
    const rawHeadAngle = Math.atan2(headVector.x, -headVector.y) * RAD2DEG;
    const headRot = rawHeadAngle - spineRot;

    // Arms: Shoulders & Elbows
    const armL_upperRot = vectorAngleDeg(shoulderL, elbowL) - spineRot;
    const armL_lowerRot = relativeJointAngleDeg(shoulderL, elbowL, wristL);

    const armR_upperRot = vectorAngleDeg(shoulderR, elbowR) - spineRot;
    const armR_lowerRot = relativeJointAngleDeg(shoulderR, elbowR, wristR);

    // Legs: Hips & Knees
    // Landmark 25 is kneeL, 26 is kneeR
    const kneeL = getPt(25);
    const kneeR = getPt(26);

    const legL_upperRot = vectorAngleDeg(hipL, kneeL);
    const legL_lowerRot = relativeJointAngleDeg(hipL, kneeL, ankleL);

    const legR_upperRot = vectorAngleDeg(hipR, kneeR);
    const legR_lowerRot = relativeJointAngleDeg(hipR, kneeR, ankleR);

    // Feet: 31 is footL index, 32 is footR index
    const footIndexL = getPt(31);
    const footIndexR = getPt(32);
    const footL_rot = relativeJointAngleDeg(kneeL, ankleL, footIndexL);
    const footR_rot = relativeJointAngleDeg(kneeR, ankleR, footIndexR);

    let rawAngles: SkeletalJointAngles = {
      rootX,
      rootY,
      spineRot,
      headRot,
      armL_upperRot,
      armL_lowerRot,
      armR_upperRot,
      armR_lowerRot,
      legL_upperRot,
      legL_lowerRot,
      legR_upperRot,
      legR_lowerRot,
      footL_rot,
      footR_rot,
    };

    // Smooth angles
    const alpha = this.config.smoothingAlpha;
    if (this.prevAngles) {
      const smoothed: any = {};
      for (const k of Object.keys(rawAngles) as (keyof SkeletalJointAngles)[]) {
        smoothed[k] = this.prevAngles[k] * (1 - alpha) + rawAngles[k] * alpha;
      }
      rawAngles = smoothed as SkeletalJointAngles;
    }
    this.prevAngles = rawAngles;

    // Average visibility confidence across major joints
    const confidence = (shoulderL.v + shoulderR.v + hipL.v + hipR.v + kneeL.v + kneeR.v) / 6;

    const trackedFrame: TrackedMotionFrame = {
      timeSec,
      frameIndex: Math.round(timeSec * 30),
      landmarks: pts,
      angles: rawAngles,
      confidence,
    };

    if (this.isRecording) {
      this.recordedFrames.push(trackedFrame);
    }

    return trackedFrame;
  }
}

/**
 * Standard bone names to joint angle mappings for character rigs
 */
export const DEFAULT_BONE_MAPPING: Record<string, keyof SkeletalJointAngles> = {
  spine: 'spineRot',
  torso: 'spineRot',
  chest: 'spineRot',
  head: 'headRot',
  neck: 'headRot',
  arm_l_upper: 'armL_upperRot',
  arm_l_shoulder: 'armL_upperRot',
  upperarm_l: 'armL_upperRot',
  arm_l_lower: 'armL_lowerRot',
  forearm_l: 'armL_lowerRot',
  arm_r_upper: 'armR_upperRot',
  arm_r_shoulder: 'armR_upperRot',
  upperarm_r: 'armR_upperRot',
  arm_r_lower: 'armR_lowerRot',
  forearm_r: 'armR_lowerRot',
  leg_l_upper: 'legL_upperRot',
  thigh_l: 'legL_upperRot',
  leg_l_lower: 'legL_lowerRot',
  calf_l: 'legL_lowerRot',
  leg_r_upper: 'legR_upperRot',
  thigh_r: 'legR_upperRot',
  leg_r_lower: 'legR_lowerRot',
  calf_r: 'legR_lowerRot',
  foot_l: 'footL_rot',
  foot_r: 'footR_rot',
};

/**
 * Bake tracked video motion clip into timeline keyframes on target bone layer
 */
export function bakeMotionToTimeline(
  project: AnimaProject,
  clip: TrackedMotionClip,
  targetLayerId: string,
  options: MotionBakeOptions = {}
): AnimaProject {
  const layerIndex = project.layers.findIndex((l) => l.id === targetLayerId);
  if (layerIndex === -1) {
    console.warn(`Layer ${targetLayerId} not found in project`);
    return project;
  }

  const layer = project.layers[layerIndex];
  const cadence = options.sampleCadence ?? 'adaptive';
  const stepFrames = cadence === 'on_2s' ? 2 : 1;
  const tolerance = options.tolerance ?? 0.8; // degrees
  const mapping = options.targetBoneMapping ?? DEFAULT_BONE_MAPPING;
  const bakeRoot = options.bakeRootTranslation !== false;
  const bakeBones = options.bakeBoneRotations !== false;

  const updatedChannels = { ...layer.channels };
  const frames = clip.frames;
  if (frames.length === 0) return project;

  const startTime = frames[0].timeSec;

  // Prepare channels for root position if requested
  const channelSamples: Record<string, { t: number; v: number }[]> = {};

  if (bakeRoot) {
    channelSamples['transform.x'] = [];
    channelSamples['transform.y'] = [];
  }

  // Find matching bones in the layer
  const matchedBones: { boneId: string; boneName: string; angleKey: keyof SkeletalJointAngles }[] = [];
  if (bakeBones && layer.bones) {
    for (const bone of layer.bones) {
      const lowerName = bone.name.toLowerCase().replace(/[- ]/g, '_');
      const matchedKey = mapping[lowerName] || mapping[bone.id];
      if (matchedKey) {
        matchedBones.push({ boneId: bone.id, boneName: bone.name, angleKey: matchedKey });
        channelSamples[`bone.${bone.id}.rot`] = [];
      }
    }
  }

  // Populate raw samples
  for (let i = 0; i < frames.length; i += stepFrames) {
    const f = frames[i];
    const relTime = f.timeSec - startTime;

    if (bakeRoot) {
      channelSamples['transform.x'].push({ t: relTime, v: f.angles.rootX });
      channelSamples['transform.y'].push({ t: relTime, v: f.angles.rootY });
    }

    for (const mb of matchedBones) {
      const val = f.angles[mb.angleKey];
      channelSamples[`bone.${mb.boneId}.rot`].push({ t: relTime, v: val });
    }
  }

  // Bake into keyframes with decimation
  for (const [chPath, samples] of Object.entries(channelSamples)) {
    let keyframes: Keyframe<number>[] = [];

    if (cadence === 'adaptive' && samples.length > 2) {
      const decimated = simplifySamples(samples, tolerance);
      keyframes = decimated.map((s, idx) => ({
        id: `k_mocap_${chPath}_${idx}`,
        t: Number(s.t.toFixed(3)),
        v: Number(s.v.toFixed(2)),
        ease: 'smooth',
      }));
    } else {
      keyframes = samples.map((s, idx) => ({
        id: `k_mocap_${chPath}_${idx}`,
        t: Number(s.t.toFixed(3)),
        v: Number(s.v.toFixed(2)),
        ease: 'smooth',
      }));
    }

    const existingCh = updatedChannels[chPath];
    updatedChannels[chPath] = {
      id: existingCh ? existingCh.id : `ch_${chPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name: chPath,
      path: chPath,
      defaultValue: samples.length > 0 ? samples[0].v : 0,
      keyframes,
    };
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

function simplifySamples(points: { t: number; v: number }[], epsilon: number): { t: number; v: number }[] {
  if (points.length <= 2) return points;
  let dmax = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dx = last.t - first.t;
    const dy = last.v - first.v;
    let d = 0;
    if (dx === 0 && dy === 0) {
      d = Math.hypot(points[i].t - first.t, points[i].v - first.v);
    } else {
      d = Math.abs(dy * points[i].t - dx * points[i].v + last.t * first.v - last.v * first.t) / Math.hypot(dx, dy);
    }
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const left = simplifySamples(points.slice(0, index + 1), epsilon);
    const right = simplifySamples(points.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [first, last];
  }
}
