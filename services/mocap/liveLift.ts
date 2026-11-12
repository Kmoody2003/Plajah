// Live body correction for anything driven by a webcam body: VTuber avatars, character puppets, the fan room's
// cast. Each live MediaPipe frame goes through the Plajah pose lifter (services/mocap/lifter.ts, stream mode: no
// look-ahead, ~2.5 ms a frame), which fixes one-camera depth mistakes in the 3D points (arms and legs pointing the
// wrong way toward or away from the camera). Picture points and masks are untouched. Until the model has loaded
// (4 MB, once, cached by the browser) frames pass through unchanged.
//
//   const lift = createLiveLift();  ...  frame = lift.apply(frame, video.videoWidth, video.videoHeight)
import type { PoseFrame } from '../vtuber/poseTracker';
import { loadLifter, type Lifter, type LiftStream } from './lifter';

let shared: Promise<Lifter> | null = null;
const lifterOnce = () => (shared ??= loadLifter().catch((e) => { shared = null; throw e; }));

export interface LiveLift {
  /** The frame with its 3D body corrected (or as it came, before the model is ready / without 3D points). */
  apply(frame: PoseFrame | null, width: number, height: number): PoseFrame | null;
  readonly ready: boolean;
  /** Average milliseconds per corrected frame so far. */
  readonly ms: number;
  reset(): void;
}

export function createLiveLift(o: { hfovDeg?: number } = {}): LiveLift {
  let lifter: Lifter | null = null, stream: LiveStreamState | null = null, total = 0, count = 0, t0 = performance.now();
  lifterOnce().then((l) => { lifter = l; }).catch(() => undefined);
  interface LiveStreamState { s: LiftStream; w: number; h: number }
  return {
    get ready() { return !!lifter; },
    get ms() { return count ? total / count : 0; },
    reset() { stream = null; },
    apply(frame, width, height) {
      if (!lifter || !width || !height) return frame;
      if (!stream || stream.w !== width || stream.h !== height) {
        // Webcams are about 60–70° across; the lifter is not sensitive to a few degrees either way.
        stream = { s: lifter.stream({ width, height, hfovDeg: o.hfovDeg ?? 65 }), w: width, h: height };
      }
      if (!frame?.world || frame.world.length !== 33 || frame.pts.length !== 33) { stream.s.push(null); return frame; }
      const a = performance.now();
      const out = stream.s.push({ t: (a - t0) / 1000, pts: frame.pts, world: frame.world.map((q) => ({ ...q, v: q.v ?? 1 })) });
      total += performance.now() - a; count++;
      return out ? { ...frame, world: out.world } : frame;
    },
  };
}
