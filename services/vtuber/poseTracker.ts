// poseTracker.ts — markerless BODY tracking via MediaPipe PoseLandmarker (lite model, fast
// enough for phones). 33 landmarks per frame, normalized video coords. Same design rules as
// faceTracker: VIDEO mode, GPU→CPU delegate fallback, and ALL CV runs on the real person —
// never on the artwork (see puppet2D.ts for why).

export interface PosePoint { x: number; y: number; v: number } // v = visibility 0..1
export interface PoseFrame { pts: PosePoint[] }                // MediaPipe's 33 pose landmarks

// Landmark indices we drive the puppet with.
export const POSE = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16,
  hipL: 23, hipR: 24, ankleL: 27, ankleR: 28,
} as const;

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseTracker {
  private pl: any = null;
  private ready = false;
  private loading = false;

  async init(): Promise<boolean> {
    if (this.ready) return true;
    if (this.loading) return false;
    this.loading = true;
    try {
      const vision: any = await import(
        // @ts-ignore — resolved at runtime from CDN, not bundled
        /* @vite-ignore */ CDN
      );
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          this.pl = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL, delegate },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
          break;
        } catch (e) {
          console.warn(`[vtuber] PoseLandmarker ${delegate} delegate failed:`, e);
        }
      }
      this.ready = !!this.pl;
    } catch (e) {
      console.warn('[vtuber] PoseLandmarker init failed:', e);
    } finally {
      this.loading = false;
    }
    return this.ready;
  }

  /** Run detection for a video frame (or a preprocessed canvas — see DetectFeed).
   *  `tsMs` must be monotonically increasing. */
  detect(video: HTMLVideoElement | HTMLCanvasElement, tsMs: number): PoseFrame | null {
    if (!this.ready || !this.pl) return null;
    try {
      const res = this.pl.detectForVideo(video, tsMs);
      const lm = res?.landmarks?.[0];
      if (!lm || !lm.length) return null;
      return { pts: lm.map((p: any) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })) };
    } catch {
      return null;
    }
  }

  dispose(): void {
    try { this.pl?.close?.(); } catch { /* */ }
    this.pl = null; this.ready = false;
  }
  get isReady(): boolean { return this.ready; }
}
