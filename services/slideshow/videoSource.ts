// Frame-exact video for themed shows. One code path for live, render and Fabula:
// mediabunny decodes forward from the requested time (a running generator, so playing
// forward costs one decode per frame), each frame is copied into our own canvas, and the
// caller learns the timestamp of the frame actually on screen — which is what keeps the
// tracked polaroid windows locked to the footage.

import * as THREE from 'three';

type MB = typeof import('mediabunny');

export class VideoFrameSource {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  /** Timestamp (s) of the frame currently in `canvas`, or -1 before the first frame. */
  shown = -1;
  duration = 0;
  private ready: Promise<void>;
  private sink: any = null;
  private gen: AsyncGenerator<any, void, unknown> | null = null;
  private genNext: any = null; // a frame pulled ahead of what was asked for
  private genAt = -1;
  private busy: Promise<void> = Promise.resolve();
  private want = -1;
  private disposed = false;

  constructor(readonly url: string, width = 1280, height = 720) {
    this.canvas.width = width; this.canvas.height = height;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.ready = this.open();
  }

  private async open() {
    const mb: MB = await import('mediabunny');
    const input = new mb.Input({ source: new mb.UrlSource(this.url), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`No video track in ${this.url}`);
    this.duration = await track.computeDuration();
    this.sink = new mb.CanvasSink(track, { poolSize: 3 });
  }

  /** Map any show-local time into the clip: forward, then ping-pong so long holds never jump. */
  clipTime(t: number) {
    const d = Math.max(0.1, this.duration - 0.05);
    const m = t % (2 * d);
    return m < d ? m : 2 * d - m;
  }

  /** Bring the frame at clip time `time` into the canvas (awaitable; exact). */
  seek(time: number): Promise<void> {
    this.want = time;
    const job = this.busy.then(() => this.load(time));
    this.busy = job.catch(() => {});
    return job;
  }

  /** Fire-and-forget version for live playback: always converges on the latest request. */
  request(time: number) {
    if (Math.abs(time - this.want) < 1e-4) return;
    this.want = time;
    this.busy = this.busy.then(() => (this.want === time ? this.load(time) : undefined)).catch(() => {});
  }

  private async load(time: number) {
    await this.ready;
    if (this.disposed) return;
    const fdur = 1 / 24;
    if (Math.abs(time - this.shown) < fdur * 0.5) return;
    // forward within ~2 s → keep pulling from the running generator; otherwise restart there
    if (!this.gen || time < this.genAt - 1e-3 || time > this.genAt + 2) {
      await this.gen?.return?.(undefined);
      this.gen = this.sink.canvases(Math.max(0, time - fdur * 0.5));
      this.genNext = null;
    }
    let frame = this.genNext;
    this.genNext = null;
    while (true) {
      if (!frame) {
        const r = await this.gen!.next();
        if (r.done) break;
        frame = r.value;
      }
      const end = frame.timestamp + (frame.duration || fdur);
      if (end > time + 1e-4) break;
      frame = null;
    }
    if (!frame) return;
    const g = this.canvas.getContext('2d')!;
    g.drawImage(frame.canvas, 0, 0, this.canvas.width, this.canvas.height);
    this.shown = frame.timestamp;
    this.genAt = frame.timestamp;
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    void this.gen?.return?.(undefined);
    this.texture.dispose();
  }
}
