// poseTrackerAsync — main-thread handle on the pose worker (send/poll, never blocks), same design
// as faceTrackerAsync: frames are dropped, not queued, while one is in flight. If workers can't run
// MediaPipe here, init() resolves false and the caller keeps the synchronous PoseTracker.

import type { PoseFrame } from './poseTracker';

export class AsyncPoseTracker {
  private w: Worker | null = null;
  private ready = false;
  private busy = false;
  private latest: PoseFrame | null = null;
  private fresh = false;

  async init(opts: { full?: boolean; segmentation?: boolean } = {}): Promise<boolean> {
    if (this.ready) return true;
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return false;
    try {
      this.w = new Worker(new URL('./poseWorker.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return false;
    }
    const ok = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 25000); // cold model download is slow
      this.w!.onmessage = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === 'ready') { clearTimeout(timer); resolve(!!m.ok); return; }
        if (m.type === 'result') {
          this.busy = false;
          this.latest = m.frame ?? null;
          this.fresh = true;
        }
      };
      this.w!.onerror = () => { clearTimeout(timer); resolve(false); };
      this.w!.postMessage({ type: 'init', full: !!opts.full, segmentation: !!opts.segmentation });
    });
    this.ready = ok;
    if (!ok) this.dispose();
    return ok;
  }

  /** Hand a frame over; does nothing while one is still in flight. */
  send(src: CanvasImageSource, ts: number): void {
    if (!this.ready || !this.w || this.busy) return;
    this.busy = true;
    createImageBitmap(src as ImageBitmapSource)
      .then((bmp) => {
        if (!this.w) { try { bmp.close(); } catch { /* */ } this.busy = false; return; }
        this.w.postMessage({ type: 'frame', bitmap: bmp, ts }, [bmp as unknown as Transferable]);
      })
      .catch(() => { this.busy = false; });
  }

  /** The newest result since the last call ({fresh:false} = nothing new yet). */
  poll(): { fresh: boolean; frame: PoseFrame | null } {
    if (!this.fresh) return { fresh: false, frame: null };
    this.fresh = false;
    return { fresh: true, frame: this.latest };
  }

  get isReady(): boolean { return this.ready; }

  dispose(): void {
    try { this.w?.terminate(); } catch { /* */ }
    this.w = null; this.ready = false; this.busy = false; this.latest = null; this.fresh = false;
  }
}
