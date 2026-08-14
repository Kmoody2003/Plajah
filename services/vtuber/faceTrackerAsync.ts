// faceTrackerAsync — main-thread handle on the face worker.
//
// Same job as FaceTracker, but nothing here blocks. detect() is replaced by a send/take pair:
// send() hands a frame over and returns immediately, take() collects whatever has come back.
// The engine already interpolates between poses (easeFace), so results arriving a frame or two
// later is invisible — whereas the synchronous stall it replaces was not.
//
// Falls back cleanly: if workers, module workers, or createImageBitmap are unavailable, init()
// returns false and the caller keeps using the synchronous FaceTracker.

import type { FaceFrame } from './faceTracker';

export class AsyncFaceTracker {
  private w: Worker | null = null;
  private ready = false;
  /** A frame is in flight. New frames are DROPPED while set — see send(). */
  private busy = false;
  private latest: FaceFrame | null = null;
  private fresh = false;

  async init(): Promise<boolean> {
    if (this.ready) return true;
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return false;
    try {
      this.w = new Worker(new URL('./faceWorker.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return false;
    }

    const ok = await new Promise<boolean>(resolve => {
      // Model download + WASM init on a cold cache is genuinely slow; well short of that and we
      // would fall back to the blocking tracker for no reason.
      const timer = setTimeout(() => resolve(false), 20000);
      this.w!.onmessage = (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === 'ready') { clearTimeout(timer); resolve(!!m.ok); return; }
        if (m.type === 'result') {
          this.busy = false;
          if (m.frame) {
            this.latest = {
              blendshapes: m.frame.blendshapes,
              matrix: m.frame.matrix ? new Float32Array(m.frame.matrix) : null,
              bbox: m.frame.bbox,
            };
            this.fresh = true;
          } else {
            // Explicit "no face this frame" — surface it so the caller can drop its lock,
            // rather than leaving the avatar frozen on the last good pose forever.
            this.latest = null;
            this.fresh = true;
          }
        }
      };
      this.w!.onerror = () => { clearTimeout(timer); resolve(false); };
      this.w!.postMessage({ type: 'init' });
    });

    this.ready = ok;
    if (!ok) this.dispose();
    return ok;
  }

  /**
   * Hand a frame to the worker. Returns immediately, and does nothing if one is still in flight.
   *
   * Dropping rather than queueing is the important decision: inference slower than the render
   * loop would otherwise build an unbounded backlog, and every queued frame adds latency, so the
   * avatar would drift further behind the performer the longer the stream ran. Dropping keeps it
   * pinned to the present at whatever rate the device can manage.
   */
  send(src: CanvasImageSource, ts: number): void {
    if (!this.ready || !this.w || this.busy) return;
    this.busy = true;
    createImageBitmap(src as any)
      .then(bmp => {
        if (!this.w) { try { bmp.close(); } catch { /* */ } this.busy = false; return; }
        this.w.postMessage({ type: 'frame', bitmap: bmp, ts }, [bmp as unknown as Transferable]);
      })
      .catch(() => { this.busy = false; });
  }

  /** The newest result since the last call, or null if nothing new has arrived. */
  take(): FaceFrame | null {
    if (!this.fresh) return null;
    this.fresh = false;
    return this.latest;
  }

  dispose(): void {
    try { this.w?.terminate(); } catch { /* */ }
    this.w = null; this.ready = false; this.busy = false; this.latest = null; this.fresh = false;
  }

  get isReady(): boolean { return this.ready; }
}
