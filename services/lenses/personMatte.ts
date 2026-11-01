// personMatte — "which pixels are the person", for lenses that need a cut-out (cardboard).
//
// MediaPipe selfie segmenter, run at ~15fps on a downscaled frame in a worker (matteWorker.worker.ts);
// the previous mask is held between runs, because a silhouette barely moves in 66ms and segmentation is
// the heaviest thing a lens does. Frames are dropped, never queued, while one is in flight. Where module
// workers aren't available it runs inline. Everything is optional: if the model can't load the lens
// renders without a cut-out rather than failing.

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const SEND_SIZE = 256;   // the model's own input size; a larger frame is only wasted copying

export interface Matte { data: Uint8Array; w: number; h: number; stamp: number }

export class PersonMatte {
  private seg: any = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private inFlight = false;
  private loading = false;
  private failed = false;
  private mask: Matte | null = null;
  private lastRun = 0;
  private stamp = 0;

  get state(): 'idle' | 'loading' | 'ready' | 'failed' {
    return this.seg || this.workerReady ? 'ready' : this.failed ? 'failed' : this.loading ? 'loading' : 'idle';
  }

  async init(): Promise<void> {
    if (this.seg || this.workerReady || this.loading || this.failed) return;
    this.loading = true;
    if (await this.startWorker()) { this.loading = false; return; }
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

  private startWorker(): Promise<boolean> {
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return Promise.resolve(false);
    return new Promise(resolve => {
      let w: Worker;
      try { w = new Worker(new URL('./matteWorker.worker.ts', import.meta.url), { type: 'module' }); }
      catch { resolve(false); return; }
      const giveUp = () => { try { w.terminate(); } catch { /* */ } this.worker = null; resolve(false); };
      const timer = setTimeout(giveUp, 20000);
      w.onerror = () => { clearTimeout(timer); giveUp(); };
      w.onmessage = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === 'ready') {
          clearTimeout(timer);
          if (!m.ok) { giveUp(); return; }
          this.worker = w; this.workerReady = true; resolve(true);
        } else if (m.type === 'result') {
          this.inFlight = false;
          if (m.mask) this.mask = { data: m.mask, w: m.w, h: m.h, stamp: ++this.stamp };
        }
      };
      w.postMessage({ type: 'init' });
    });
  }

  /** Latest mask (re-segmenting at most every ~66ms). `null` until the model is ready. */
  update(video: HTMLVideoElement, nowMs: number): Matte | null {
    if (!video.videoWidth) return this.mask;
    if (this.workerReady) {
      if (!this.inFlight && nowMs - this.lastRun >= 66) {
        this.lastRun = nowMs;
        this.inFlight = true;
        const h = Math.max(2, Math.round(SEND_SIZE * video.videoHeight / video.videoWidth));
        createImageBitmap(video, { resizeWidth: SEND_SIZE, resizeHeight: h, resizeQuality: 'low' })
          .then(bmp => {
            if (!this.worker) { bmp.close(); this.inFlight = false; return; }
            this.worker.postMessage({ type: 'frame', bitmap: bmp, ts: Math.round(nowMs) }, [bmp as unknown as Transferable]);
          })
          .catch(() => { this.inFlight = false; });
      }
      return this.mask;
    }
    if (!this.seg) return this.mask;
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
    try { this.worker?.terminate(); } catch { /* */ }
    this.worker = null; this.workerReady = false; this.inFlight = false;
    this.seg = null; this.mask = null; this.loading = false; this.failed = false;
  }
}
