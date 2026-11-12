// Camera motion capture: the shared data types.
//
// A RawTake is what the camera saw (MediaPipe landmarks per frame). A MotionClip is what the solver made of it:
// a fixed-length skeleton, joint rotations per frame, a root path in metres and foot contacts. Clips are plain
// JSON so they cloud-save like every other creative project and can be re-solved from their raw take.

/** One MediaPipe landmark: normalised image coords (x, y in 0..1) and visibility. */
export interface ImagePoint { x: number; y: number; v: number }
/** One MediaPipe world landmark: metres, hip-centred, camera-aligned axes (x right, y down, z away). */
export interface WorldPoint { x: number; y: number; z: number; v: number }

export interface RawFrame {
  /** Seconds from the start of the take. */
  t: number;
  pts: ImagePoint[];   // 33
  world: WorldPoint[]; // 33
}

export type CaptureSourceKind = 'webcam' | 'upload' | 'stream';
export type PoseModel = 'lite' | 'full' | 'heavy';

export interface RawTake {
  fps: number;
  /** null where nobody was found in that frame. */
  frames: (RawFrame | null)[];
  width: number;
  height: number;
  /** Horizontal field of view guess, degrees (phones and webcams are ~60–75). */
  hfovDeg?: number;
  source: { kind: CaptureSourceKind; label: string; model: PoseModel; /** Where the footage can be replayed from, if anywhere. */ url?: string };
}

export interface SkeletonJoint {
  name: string;
  /** Index of the parent joint, -1 for the root. */
  parent: number;
  /** Rest offset from the parent joint, metres (the rest pose is a T-pose facing +Z, Y up). */
  offset: [number, number, number];
  /** Where the bone ends when the joint has no child (BVH "End Site"). */
  end?: [number, number, number];
}

export interface TakeQuality {
  /** Share of frames where the performer was missing or mostly hidden (0..1). */
  occlusion: number;
  /** Mean angular jerk of the main bones after smoothing, degrees per frame² (lower is calmer). */
  jitter: number;
  /** Mean slide of a planted foot after the solve, cm per second (0 = no skating). */
  skate: number;
  /** Plain-words verdict for the UI. */
  grade: 'good' | 'usable' | 'poor';
  notes: string[];
}

export interface MotionMove {
  name: string;
  /** Frame range inside the clip. */
  start: number;
  end: number;
  /** Frame where the blow lands (strikes) — fraction of the way through is (hit - start) / (end - start). */
  hit?: number;
  effector?: 'rHand' | 'lHand' | 'rFoot' | 'lFoot';
  /** How clearly this is a blow (extension × reach in front × speed); higher = more of a strike, less of a block. */
  score?: number;
  /** Hand blows: where the fist lands — 'mid' (chest, a punch), 'high' (often a rising block), 'low' (a down block). */
  level?: 'high' | 'mid' | 'low';
}

export interface MotionClip {
  format: 'plajah.motion';
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  fps: number;
  frames: number;
  skeleton: { id: 'plajah.biped.v1'; joints: SkeletonJoint[] };
  /** Local joint rotations, quaternion xyzw, frames × joints × 4. */
  rot: number[];
  /** Root (hip) position in metres per frame, frames × 3 (Y up, the floor at y = 0, starts at x = z = 0). */
  root: number[];
  /** Foot contacts per frame (1 = planted). */
  contacts: { l: number[]; r: number[] };
  /** How well the performer was seen per frame (0 = missing/filled in, 1 = fully visible). */
  seen?: number[];
  quality: TakeQuality;
  /** What the solver read from the take, for the results panel. */
  stats?: TakeStats;
  source: RawTake['source'] & { width: number; height: number; durationSec: number };
  /** Who is performing: the user themself, someone who gave permission, or not yet confirmed (kept private). */
  rights: { performer: 'self' | 'permission' | 'unknown' };
  moves: MotionMove[];
}

export interface TakeStats {
  /** Performer found in this share of frames (0..1). */
  found: number;
  /** The camera followed the performer (or a treadmill): feet planted by height, hips travel by the stance foot. */
  followedCamera: boolean;
  /** Left/right limb mix-ups repaired (limb-frames). */
  limbSwapsFixed: number;
  /** Foot plants (separate touch-downs) per foot. */
  plants: { l: number; r: number };
  /** Share of frames with no foot down (flight) and with both feet down. */
  airborne: number;
  bothFeet: number;
  /** Straight-line travel speed start→end and average speed along the path, m/s. */
  netSpeed: number;
  pathSpeed: number;
  /** Lowest and highest hip height above the floor, m. */
  hipHeight: [number, number];
  /** Share of planted frames whose foot is pinned by the foot lock. */
  pinned: number;
  /** How far the performer turned over the take (slow turning, degrees), and whether it was straightened out. */
  turnDeg: number;
  straightened: boolean;
}
