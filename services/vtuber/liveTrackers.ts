// liveTrackers — face and body tracking for live puppets, worker-first.
//
// Each tracker runs MediaPipe in a worker at camera rate when it can (faceTrackerAsync /
// poseTrackerAsync) and falls back to the blocking main-thread tracker at a lower rate when it
// can't. step() is called every animation frame: it hands over a frame when it's time and returns
// the newest result, or undefined when nothing new has arrived (keep the last pose).

import { AsyncFaceTracker } from './faceTrackerAsync';
import { FaceTracker, type FaceFrame } from './faceTracker';
import { AsyncPoseTracker } from './poseTrackerAsync';
import { PoseTracker, type PoseFrame } from './poseTracker';
import { DetectFeed } from './detectFeed';

interface Backend<F> {
  send(video: HTMLVideoElement, ts: number): void;
  poll(): { fresh: boolean; frame: F | null };
  dispose(): void;
}

class LiveTracker<F> {
  private backend: Backend<F> | null = null;
  private lastSend = -1e9;
  private ts = -1;
  private gap = 33;

  constructor(private start: () => Promise<{ backend: Backend<F>; gap: number } | null>) {
    void this.start().then((b) => {
      if (!b) return;
      this.backend = b.backend;
      this.gap = b.gap;
    });
  }

  get ready(): boolean {
    return !!this.backend;
  }

  /** New result (null = tracked but nothing found), or undefined = nothing new this frame. */
  step(video: HTMLVideoElement, nowMs: number): F | null | undefined {
    const b = this.backend;
    if (!b || video.readyState < 2 || !video.videoWidth) return undefined;
    if (nowMs - this.lastSend >= this.gap) {
      this.lastSend = nowMs;
      this.ts = Math.max(this.ts + 1, Math.round(nowMs));
      b.send(video, this.ts);
    }
    const r = b.poll();
    return r.fresh ? r.frame : undefined;
  }

  dispose() {
    this.backend?.dispose();
    this.backend = null;
  }
}

/** Synchronous tracker → Backend (send runs detection, poll hands the result back). */
function syncBackend<F>(detect: (v: HTMLVideoElement, ts: number) => F | null, dispose: () => void): Backend<F> {
  let pending: { frame: F | null } | null = null;
  return {
    send: (v, ts) => { pending = { frame: detect(v, ts) }; },
    poll: () => {
      const p = pending;
      pending = null;
      return p ? { fresh: true, frame: p.frame } : { fresh: false, frame: null };
    },
    dispose,
  };
}

export class LiveFaceTracker extends LiveTracker<FaceFrame> {
  constructor(opts: { numFaces?: number; blendshapes?: boolean } = {}) {
    super(async () => {
      const a = new AsyncFaceTracker();
      if (await a.init(opts)) {
        return { backend: { send: (v, ts) => a.send(v, ts), poll: () => a.poll(), dispose: () => a.dispose() }, gap: 33 };
      }
      const s = new FaceTracker();
      if (!(await s.init(opts))) return null;
      const feed = new DetectFeed();
      return { backend: syncBackend((v, ts) => s.detect(feed.src(v), ts), () => s.dispose()), gap: 90 };
    });
  }
}

export class LivePoseTracker extends LiveTracker<PoseFrame> {
  constructor(opts: { full?: boolean; segmentation?: boolean } = {}) {
    super(async () => {
      const a = new AsyncPoseTracker();
      if (await a.init(opts)) {
        return { backend: { send: (v, ts) => a.send(v, ts), poll: () => a.poll(), dispose: () => a.dispose() }, gap: 33 };
      }
      const s = new PoseTracker();
      if (!(await s.init(opts))) return null;
      return { backend: syncBackend((v, ts) => s.detect(v, ts), () => s.dispose()), gap: 100 };
    });
  }
}
