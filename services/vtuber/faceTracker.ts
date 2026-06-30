// faceTracker.ts — markerless face tracking via MediaPipe FaceLandmarker (no special hardware,
// just an RGB webcam). Gives 52 ARKit-style blendshape coefficients + a 4x4 facial transform
// matrix (head pose), per video frame, on the GPU. Loaded from CDN exactly like the existing
// matteEngine (later self-host the WASM/model per the local-first plan). VIDEO running mode.

export interface FaceFrame {
  blendshapes: Record<string, number>; // categoryName -> score (0..1), e.g. jawOpen, eyeBlinkLeft
  matrix: Float32Array | null;          // 4x4 column-major facial transform (head pose)
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
      this.fl = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      this.ready = true;
    } catch (e) {
      console.warn('[vtuber] FaceLandmarker init failed:', e);
    } finally {
      this.loading = false;
    }
    return this.ready;
  }

  /** Run detection for a video frame. `tsMs` must be monotonically increasing (performance.now()). */
  detect(video: HTMLVideoElement, tsMs: number): FaceFrame | null {
    if (!this.ready || !this.fl) return null;
    try {
      const res = this.fl.detectForVideo(video, tsMs);
      const cats = res?.faceBlendshapes?.[0]?.categories;
      if (!cats || !cats.length) return null;
      const blendshapes: Record<string, number> = {};
      for (const c of cats) blendshapes[c.categoryName] = c.score;
      const m = res?.facialTransformationMatrixes?.[0]?.data;
      return { blendshapes, matrix: m ? new Float32Array(m) : null };
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
