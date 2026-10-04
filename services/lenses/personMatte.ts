// personMatte — "which pixels are the person", for lenses that need a cut-out (cardboard).
//
// MediaPipe selfie segmenter (same CDN + model the composer's screen-mask mode already uses),
// run at ~15fps on a downscaled frame; the previous mask is held between runs, because a silhouette
// barely moves in 66ms and segmentation is the heaviest thing a lens does. Everything is optional:
// if the model can't load the lens renders without a cut-out rather than failing.

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

export interface Matte { data: Uint8Array; w: number; h: number; stamp: number }

export class PersonMatte {
  private seg: any = null;
  private loading = false;
  private failed = false;
  private mask: Matte | null = null;
  private lastRun = 0;
  private stamp = 0;

  get state(): 'idle' | 'loading' | 'ready' | 'failed' {
    return this.seg ? 'ready' : this.failed ? 'failed' : this.loading ? 'loading' : 'idle';
  }

  async init(): Promise<void> {
    if (this.seg || this.loading || this.failed) return;
    this.loading = true;
    try {
      const vision: any = await import(/* @vite-ignore */ CDN);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      this.seg = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'VIDEO', outputConfidenceMasks: true,
      });
    } catch (e) {
      console.warn('[lens] person matte unavailable — rendering without a cut-out:', e);
      this.failed = true;
    }
    this.loading = false;
  }

  /** Latest mask (re-segmenting at most every ~66ms). `null` until the model is ready. */
  update(video: HTMLVideoElement, nowMs: number): Matte | null {
    if (!this.seg || !video.videoWidth) return this.mask;
    if (this.mask && nowMs - this.lastRun < 66) return this.mask;
    this.lastRun = nowMs;
    try {
      const res = this.seg.segmentForVideo(video, nowMs);
      const m = res.confidenceMasks?.[0];
      if (m) {
        const f: Float32Array = m.getAsFloat32Array();
        const w = m.width, h = m.height;
        if (!this.mask || this.mask.data.length !== f.length) this.mask = { data: new Uint8Array(f.length), w, h, stamp: 0 };
        const d = this.mask.data;
        for (let i = 0; i < f.length; i++) d[i] = Math.max(0, Math.min(255, (f[i] * 255) | 0));
        this.mask.w = w; this.mask.h = h; this.mask.stamp = ++this.stamp;
      }
      res.close?.();
    } catch { /* keep the previous mask */ }
    return this.mask;
  }

  dispose() {
    try { this.seg?.close?.(); } catch { /* */ }
    this.seg = null; this.mask = null; this.loading = false; this.failed = false;
  }
}
