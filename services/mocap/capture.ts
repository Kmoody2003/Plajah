// Camera motion capture: getting landmarks out of a video file or a live camera.
//
// Uploads are processed offline, frame by frame (seek, wait for the frame, detect), with the heavy pose model:
// slower than real time but deterministic and as accurate as MediaPipe gets. The live camera uses the full
// model in real time and records what it saw; the solver runs when recording stops.
import { PoseTracker, type PoseFrame } from '../vtuber/poseTracker';
import type { PoseModel, RawFrame, RawTake } from './types';

const trackers = new Map<PoseModel, PoseTracker>();
/** The shared pose tracker for a model (created and started on first use). */
export async function tracker(model: PoseModel): Promise<PoseTracker> {
  let t = trackers.get(model);
  if (!t) { t = new PoseTracker(); trackers.set(model, t); }
  if (!t.isReady && !(await t.init({ model, numPoses: 3 }))) throw new Error('The pose model could not start on this device.');
  return t;
}

/** MediaPipe VIDEO mode needs strictly increasing timestamps across every call on one tracker. */
let clock = 0;
export const nextTs = (ms: number) => (clock = Math.max(clock + 1, Math.round(ms)));

/** Follows one performer when several people are in the picture: the person nearest the last pick (by hips and
 *  shoulders on screen), or at the start the biggest one. Someone far from where the performer was is not
 *  swapped in; the frame counts as missing until the performer reappears or enough time has passed. */
export class PerformerLock {
  private last: { x: number; y: number; s: number; t: number } | null = null;
  /** Start following whoever stands where these landmarks are (e.g. the performer in a neighbouring frame). */
  prime(pts: { x: number; y: number }[], t: number): void {
    const q = [11, 12, 23, 24].map((i) => pts[i]);
    this.last = {
      x: q.reduce((a, b) => a + b.x, 0) / 4, y: q.reduce((a, b) => a + b.y, 0) / 4,
      s: Math.hypot(q[0].x - q[2].x, q[0].y - q[2].y) + Math.hypot(q[1].x - q[3].x, q[1].y - q[3].y), t,
    };
  }
  pick(people: PoseFrame[], t: number): PoseFrame | null {
    const ok = people.filter((p) => p.world?.length === 33);
    if (!ok.length) return null;
    const key = (p: PoseFrame) => {
      const q = [11, 12, 23, 24].map((i) => p.pts[i]);
      const x = q.reduce((a, b) => a + b.x, 0) / 4, y = q.reduce((a, b) => a + b.y, 0) / 4;
      const s = Math.hypot(q[0].x - q[2].x, q[0].y - q[2].y) + Math.hypot(q[1].x - q[3].x, q[1].y - q[3].y);
      return { x, y, s };
    };
    let best: PoseFrame | null = null, bestK: ReturnType<typeof key> | null = null;
    if (this.last && t - this.last.t < 1.0) {
      let d = Infinity;
      for (const p of ok) {
        const k = key(p), dd = Math.hypot(k.x - this.last.x, k.y - this.last.y);
        if (dd < d) { d = dd; best = p; bestK = k; }
      }
      if (d > Math.max(0.08, this.last.s * 0.4)) return null; // more than ~0.8 torso lengths away: someone else
    } else {
      for (const p of ok) { const k = key(p); if (!bestK || k.s > bestK.s) { best = p; bestK = k; } }
    }
    if (bestK) this.last = { ...bestK, t };
    return best;
  }
}

export function toRaw(t: number, f: PoseFrame | null): RawFrame | null {
  if (!f || !f.world || f.world.length !== 33) return null;
  return { t, pts: f.pts.map((p) => ({ x: p.x, y: p.y, v: p.v })), world: f.world.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.v })) };
}

export interface VideoCaptureOptions {
  fps?: number;
  model?: PoseModel;
  /** Seconds to process (defaults to the whole video). */
  start?: number; end?: number;
  onProgress?: (done: number, total: number, frame: RawFrame | null) => void;
  signal?: AbortSignal;
  label?: string;
  /** 'decode' reads the file straight through with WebCodecs (fastest; works in a hidden tab); 'play' decodes while
   *  the video plays; 'seek' visits each frame (slow). 'auto' (default): decode, else play then seek-fill. */
  mode?: 'auto' | 'decode' | 'play' | 'seek';
}

/** Seek and wait for the frame. Chrome can stall a seek (readyState stuck at 1); after a while, nudge it. */
const seek = (v: HTMLVideoElement, t: number) => new Promise<void>((resolve) => {
  let tries = 0, timer = 0;
  const done = () => { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); };
  const go = () => {
    if (tries++ > 4) { done(); return; }
    v.currentTime = t + (tries > 1 ? 1e-3 * tries : 0);
    timer = window.setTimeout(go, 2500);
  };
  v.addEventListener('seeked', done);
  go();
});

/** Landmarks for every frame by decoding the file straight through with WebCodecs (mediabunny): each compressed
 *  packet is decoded once, nothing waits on seeks or screen refresh, so it runs at the pose model's own speed and
 *  keeps going in a hidden tab. Returns null when the browser can't decode the file this way. */
async function captureDecoded(blob: Blob, o: VideoCaptureOptions, fps: number, model: PoseModel, label: string): Promise<RawTake | null> {
  if (typeof VideoDecoder === 'undefined') return null;
  let mb: typeof import('mediabunny');
  try { mb = await import('mediabunny'); } catch { return null; }
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const duration = await track.computeDuration();
    const start = Math.max(0, o.start ?? 0), end = Math.min(duration, o.end ?? duration);
    const total = Math.max(1, Math.floor((end - start) * fps));
    const pose = await tracker(model);
    const sink = new mb.CanvasSink(track, { poolSize: 2 });
    const lock = new PerformerLock();
    const frames: (RawFrame | null)[] = [];
    const times = Array.from({ length: total }, (_, i) => start + i / fps);
    let i = 0, width = track.displayWidth, height = track.displayHeight;
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (o.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const t = i / fps;
      let f: RawFrame | null = null;
      if (wc) {
        width = wc.canvas.width; height = wc.canvas.height;
        f = toRaw(t, lock.pick(pose.detectAll(wc.canvas as HTMLCanvasElement, nextTs(performance.now())), t));
      }
      frames.push(f);
      o.onProgress?.(++i, total, f);
    }
    return { fps, frames, width, height, source: { kind: 'upload', label, model } };
  } finally {
    input.dispose?.();
  }
}

/** Landmarks for every frame of a video file (or URL), at a fixed rate. */
export async function captureVideo(src: File | Blob | string, o: VideoCaptureOptions = {}): Promise<RawTake> {
  if ((o.mode ?? 'auto') === 'auto' || o.mode === 'decode') {
    const blob0 = typeof src === 'string' ? await fetch(src).then((r) => { if (!r.ok) throw new Error(`Could not load the video (${r.status}).`); return r.blob(); }) : src;
    const label = o.label ?? (src instanceof File ? src.name.replace(/\.[^.]+$/, '') : 'Video');
    try {
      const t = await captureDecoded(blob0, o, o.fps ?? 30, o.model ?? 'heavy', label);
      if (t) return t;
    } catch (e) { if ((e as Error).name === 'AbortError') throw e; console.warn('[mocap] decode path failed, falling back to playback', e); }
    src = blob0;
  }
  const fps = o.fps ?? 30, model = o.model ?? 'heavy';
  // Seeking frame by frame is only reliable on local data: a URL is fetched whole first.
  const blob = typeof src === 'string' ? await fetch(src).then((r) => { if (!r.ok) throw new Error(`Could not load the video (${r.status}).`); return r.blob(); }) : src;
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  // Chrome may never load a detached <video>: keep it in the page, invisible.
  Object.assign(v.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(v);
  v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      if (v.readyState >= 2) { res(); return; }
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('This video could not be opened in the browser.'));
    });
    const pose = await tracker(model);
    const start = Math.max(0, o.start ?? 0), end = Math.min(v.duration || 0, o.end ?? v.duration ?? 0);
    const total = Math.max(1, Math.floor((end - start) * fps));
    // Frames by time (seconds from `start`); playback lands on the video's own frame times, seeking on 1/fps steps.
    const got: { t: number; f: RawFrame | null }[] = [];
    const report = (f: RawFrame | null) => o.onProgress?.(Math.min(total, got.length), total, f);
    const aborted = () => { if (o.signal?.aborted) throw new DOMException('Stopped', 'AbortError'); };

    // 1. Play pass: the decoder runs forward once (a frame-accurate seek re-decodes from the last keyframe every
    //    time, which made long clips crawl). The playback rate follows detection speed so few frames are skipped.
    const rv = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, m: { mediaTime: number }) => void) => number };
    if (o.mode !== 'seek' && rv.requestVideoFrameCallback) {
      const lock = new PerformerLock();
      await seek(v, start);
      await new Promise<void>((resolve) => {
        let detectMs = 50, last = performance.now(), finished = false;
        const finish = () => { if (finished) return; finished = true; clearInterval(watch); v.pause(); resolve(); };
        // A hidden tab stops presenting frames: if playback stalls, stop and let the seek pass do the rest.
        const watch = window.setInterval(() => { if (o.signal?.aborted || performance.now() - last > 2500) finish(); }, 500);
        const cb = (now: number, meta: { mediaTime: number }) => {
          if (finished) return;
          last = performance.now();
          const t = meta.mediaTime - start;
          if (t > end - start + 0.5 / fps) { finish(); return; }
          if (t >= -0.5 / fps && !got.some((g) => Math.abs(g.t - t) < 0.25 / fps)) {
            const t0 = performance.now();
            const f = toRaw(Math.max(0, t), lock.pick(pose.detectAll(v, nextTs(now)), t));
            detectMs = 0.8 * detectMs + 0.2 * (performance.now() - t0);
            got.push({ t: Math.max(0, t), f });
            report(f);
            const rate = Math.min(1, Math.max(0.1, 1000 / (fps * detectMs * 1.3)));
            if (Math.abs(rate - v.playbackRate) > 0.05) v.playbackRate = Math.round(rate * 20) / 20;
          }
          rv.requestVideoFrameCallback!(cb);
        };
        v.onended = finish;
        v.playbackRate = 0.5;
        rv.requestVideoFrameCallback!(cb);
        v.play().catch(finish);
      });
    }

    // 2. Seek pass: every 1/fps slot that playback didn't reach (all of them in 'seek' mode or a hidden tab).
    got.sort((x, y) => x.t - y.t);
    const near = (t: number) => {
      let lo = 0, hi = got.length - 1, best = Infinity;
      while (lo <= hi) { const m = (lo + hi) >> 1; best = Math.min(best, Math.abs(got[m].t - t)); if (got[m].t < t) lo = m + 1; else hi = m - 1; }
      return best;
    };
    const holes: number[] = [];
    for (let i = 0; i < total; i++) if (near(i / fps) > 0.75 / fps) holes.push(i);
    const lock = new PerformerLock();
    for (const i of holes) {
      aborted();
      const t = i / fps;
      // Re-anchor on the nearest frame we already have, so the lock follows the same performer.
      const prev = got.filter((g) => g.f && g.t < t).pop()?.f;
      if (prev) lock.prime(prev.pts, t - 1 / fps);
      await seek(v, start + t);
      const f = toRaw(t, lock.pick(pose.detectAll(v, nextTs(performance.now())), t));
      got.push({ t, f });
      report(f);
    }
    // Back onto a regular 1/fps grid (the room and the solver index frames by slot): each slot takes the nearest
    // frame we have, at most half a slot away (playback lands on the video's own frame times).
    got.sort((x, y) => x.t - y.t);
    const frames: (RawFrame | null)[] = [];
    let k = 0;
    for (let i = 0; i < total; i++) {
      const t = i / fps;
      while (k < got.length - 1 && Math.abs(got[k + 1].t - t) <= Math.abs(got[k].t - t)) k++;
      const g = got[k];
      frames.push(g && g.f && Math.abs(g.t - t) <= 0.75 / fps ? { ...g.f, t } : null);
    }
    return {
      fps, frames, width: v.videoWidth, height: v.videoHeight,
      source: { kind: 'upload', label: o.label ?? (src instanceof File ? src.name.replace(/\.[^.]+$/, '') : 'Video'), model },
    };
  } finally {
    v.removeAttribute('src'); v.load(); v.remove();
    URL.revokeObjectURL(url);
  }
}

/** A live camera with pose tracking; records frames between start() and stop(). */
export class LiveCapture {
  private raf = 0;
  private recording: RawFrame[] | null = null;
  private t0 = 0;
  private pose: PoseTracker | null = null;
  private lock = new PerformerLock();
  latest: RawFrame | null = null;
  onFrame?: (f: RawFrame | null) => void;

  constructor(readonly video: HTMLVideoElement, readonly model: PoseModel = 'full') {}

  async open(): Promise<void> {
    this.pose = await tracker(this.model);
    const loop = () => {
      const v = this.video;
      if (v.readyState >= 2 && this.pose) {
        const now = performance.now();
        const f = toRaw(this.recording ? (now - this.t0) / 1000 : 0, this.lock.pick(this.pose.detectAll(v, nextTs(now)), now / 1000));
        this.latest = f;
        if (this.recording) this.recording.push(f ?? ({ t: (now - this.t0) / 1000, pts: [], world: [] } as RawFrame));
        this.onFrame?.(f);
      }
      const rv = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      this.raf = rv.requestVideoFrameCallback ? rv.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    };
    loop();
  }

  get isRecording(): boolean { return !!this.recording; }

  start(): void { this.recording = []; this.t0 = performance.now(); }

  /** Stops recording and returns the take (frames without a performer come back as gaps). */
  stop(label = 'Camera take'): RawTake {
    const rec = this.recording ?? [];
    this.recording = null;
    return {
      fps: 30,
      frames: rec.map((f) => (f.world.length === 33 ? f : null)),
      width: this.video.videoWidth, height: this.video.videoHeight,
      source: { kind: 'webcam', label, model: this.model },
    };
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    const v = this.video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    v.cancelVideoFrameCallback?.(this.raf);
    this.recording = null;
  }
}

/** Round landmark numbers so a raw take stays small when saved alongside its clip. */
export function compactTake(t: RawTake): RawTake {
  const r = (x: number, d = 4) => +x.toFixed(d);
  return {
    ...t,
    frames: t.frames.map((f) => f && {
      t: r(f.t, 4),
      pts: f.pts.map((p) => ({ x: r(p.x), y: r(p.y), v: r(p.v, 2) })),
      world: f.world.map((p) => ({ x: r(p.x), y: r(p.y), z: r(p.z), v: r(p.v, 2) })),
    }),
  };
}
