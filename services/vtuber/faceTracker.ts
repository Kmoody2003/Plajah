// faceTracker.ts — markerless face tracking via MediaPipe FaceLandmarker (no special hardware,
// just an RGB webcam). Gives 52 ARKit-style blendshape coefficients + a 4x4 facial transform
// matrix (head pose), per video frame, on the GPU. Loaded from CDN exactly like the existing
// matteEngine (later self-host the WASM/model per the local-first plan). VIDEO running mode.

export interface FaceFrame {
  blendshapes: Record<string, number>; // categoryName -> score (0..1), e.g. jawOpen, eyeBlinkLeft
  matrix: Float32Array | null;          // 4x4 column-major facial transform (head pose)
  bbox: { x: number; y: number; w: number; h: number } | null; // face box, normalized [0..1] video coords
}

export const VTUBER_MP_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
export const VTUBER_FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const CDN = VTUBER_MP_CDN;
const MODEL = VTUBER_FACE_MODEL;

export class FaceTracker {
  private fl: any = null;
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
      // GPU delegate fails inside some WebViews/browsers — fall back to CPU (slower but works).
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          this.fl = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL, delegate },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });
          break;
        } catch (e) {
          console.warn(`[vtuber] FaceLandmarker ${delegate} delegate failed:`, e);
        }
      }
      this.ready = !!this.fl;
    } catch (e) {
      console.warn('[vtuber] FaceLandmarker init failed:', e);
    } finally {
      this.loading = false;
    }
    return this.ready;
  }

  /** Run detection for a video frame (or a preprocessed canvas — see DetectFeed).
   *  `tsMs` must be monotonically increasing (performance.now()). */
  detect(video: HTMLVideoElement | HTMLCanvasElement, tsMs: number): FaceFrame | null {
    if (!this.ready || !this.fl) return null;
    try {
      const res = this.fl.detectForVideo(video, tsMs);
      const cats = res?.faceBlendshapes?.[0]?.categories;
      if (!cats || !cats.length) return null;
      const blendshapes: Record<string, number> = {};
      for (const c of cats) blendshapes[c.categoryName] = c.score;
      const m = res?.facialTransformationMatrixes?.[0]?.data;
      // Face bounding box from the landmark cloud (normalized video coords) — used to
      // position/scale the avatar onto the real face for the face-swap overlay.
      let bbox: FaceFrame['bbox'] = null;
      const lm = res?.faceLandmarks?.[0];
      if (lm && lm.length) {
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const p of lm) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
        bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      return { blendshapes, matrix: m ? new Float32Array(m) : null, bbox };
    } catch {
      return null;
    }
  }

  dispose(): void {
    try { this.fl?.close?.(); } catch { /* */ }
    this.fl = null; this.ready = false;
  }
  get isReady(): boolean { return this.ready; }
}
