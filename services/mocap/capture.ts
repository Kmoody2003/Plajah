// Camera motion capture: getting landmarks out of a video file or a live camera.
//
// Uploads are processed offline, frame by frame (seek, wait for the frame, detect), with the heavy pose model:
// slower than real time but deterministic and as accurate as MediaPipe gets. The live camera uses the full
// model in real time and records what it saw; the solver runs when recording stops.
import { PoseTracker, type PoseFrame } from '../vtuber/poseTracker';
import type { PoseModel, RawFrame, RawTake } from './types';

const trackers = new Map<string, PoseTracker>();
/** The shared pose tracker for a model (created and started on first use). `confidence` below MediaPipe's 0.5
 *  finds bodies it otherwise drops: armoured, robotic or heavily stylised performers (game and animation reels). */
export async function tracker(model: PoseModel, confidence?: number): Promise<PoseTracker> {
  const key = `${model}:${confidence ?? ''}`;
  let t = trackers.get(key);
  if (!t) { t = new PoseTracker(); trackers.set(key, t); }
  if (!t.isReady && !(await t.init({ model, numPoses: 3, confidence }))) throw new Error('The pose model could not start on this device.');
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
  /** Forget the performer (a camera cut): the next frame picks the biggest person again. */
  reset(): void { this.last = null; }
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
  /** Pose confidence threshold (default MediaPipe's 0.5); ~0.2 for armoured / stylised characters. */
  confidence?: number;
  /** Letterbox padding on every side, as a share of the frame (e.g. 0.25): a performer who fills the frame edge to
   *  edge (close framing, a huge character) is shrunk inside a bigger canvas so the person detector finds the whole
   *  body. Landmarks are mapped back to the original frame. Decode path only. */
  pad?: number;
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

/** Camera-cut signal per frame: how different the whole picture is from the frame before (mean absolute luma
 *  difference of a 32×18 thumbnail, 0..1, after removing the global brightness shift so a flash or a fade doesn't
 *  read as a cut). Edited reels (trailers, AI combat reels) cut between shots; a solve across a cut teleports the
 *  performer, so `services/mocap/shots.ts` splits the take there. */
export class ShotCuts {
  readonly scores: number[] = [];
  private prev: Float32Array | null = null;
  private cv: HTMLCanvasElement | OffscreenCanvas | null = null;
  /** Adds a frame (null = not decoded); true when it looks like a new shot: a spike well above the change of the
   *  last few frames (camera moves and particles change the picture every frame; a cut jumps once). */
  push(src: CanvasImageSource | null, threshold = 0.2): boolean {
    if (!src) { this.scores.push(0); return false; }
    const W = 32, H = 18;
    this.cv ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const g = this.cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!g) { this.scores.push(0); return false; }
    g.drawImage(src, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, cur = new Float32Array(W * H);
    let mean = 0;
    for (let k = 0; k < W * H; k++) { cur[k] = (0.299 * px[k * 4] + 0.587 * px[k * 4 + 1] + 0.114 * px[k * 4 + 2]) / 255; mean += cur[k]; }
    mean /= W * H;
    let d = 0;
    if (this.prev) {
      let pm = 0; for (let k = 0; k < W * H; k++) pm += this.prev[k];
      pm /= W * H;
      for (let k = 0; k < W * H; k++) d += Math.abs((cur[k] - mean) - (this.prev[k] - pm));
      d /= W * H;
    }
    this.prev = cur;
    const s = Math.min(1, d * 4);
    const recent = this.scores.slice(-4).sort((a, b) => a - b)[1] ?? 0;
    this.scores.push(+s.toFixed(3));
    return s > threshold && s > 2.2 * Math.max(0.02, recent);
  }
}

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
    const pose = await tracker(model, o.confidence);
    const sink = new mb.CanvasSink(track, { poolSize: 2 });
    const lock = new PerformerLock();
    const frames: (RawFrame | null)[] = [];
    const times = Array.from({ length: total }, (_, i) => start + i / fps);
    let i = 0, width = track.displayWidth, height = track.displayHeight;
    const cuts = new ShotCuts();
    const pad = Math.max(0, o.pad ?? 0);
    let padCv: HTMLCanvasElement | null = null;
    /** The frame inside its letterbox (or the frame itself), and the landmarks mapped back to the frame. */
    const padded = (src: HTMLCanvasElement): HTMLCanvasElement => {
      if (!pad) return src;
      const W = src.width, H = src.height, px = Math.round(W * pad), py = Math.round(H * pad);
      padCv ??= document.createElement('canvas');
      if (padCv.width !== W + 2 * px || padCv.height !== H + 2 * py) { padCv.width = W + 2 * px; padCv.height = H + 2 * py; }
      const g = padCv.getContext('2d')!;
      g.fillStyle = '#000'; g.fillRect(0, 0, padCv.width, padCv.height);
      g.drawImage(src, px, py);
      return padCv;
    };
    const unpad = (f: PoseFrame | null): PoseFrame | null => {
      if (!pad || !f) return f;
      const k = 1 + 2 * pad;
      return { ...f, pts: f.pts.map((p) => ({ ...p, x: p.x * k - pad, y: p.y * k - pad })) };
    };
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      if (o.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const t = i / fps;
      let f: RawFrame | null = null;
      if (wc) {
        width = wc.canvas.width; height = wc.canvas.height;
        // a camera cut: the lock must not carry the last shot's performer position into the new shot
        if (cuts.push(wc.canvas as HTMLCanvasElement)) lock.reset();
        const people = pose.detectAll(padded(wc.canvas as HTMLCanvasElement), nextTs(performance.now())).map((p) => unpad(p)!);
        f = toRaw(t, lock.pick(people, t));
      } else cuts.push(null);
      frames.push(f);
      // advance the frame clock unconditionally: `onProgress?.(++i)` skips the increment when there's no callback
      // (optional-call arguments aren't evaluated), which stamped every frame t = 0 and collapsed the take
      i++;
      o.onProgress?.(i, total, f);
    }
    return { fps, frames, width, height, cuts: cuts.scores, source: { kind: 'upload', label, model } };
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
/** Several capture passes of one video (different confidence, padding or model) merged frame by frame. The first
 *  pass is the base; later passes only fill the frames it missed, so neighbouring frames come from the same
 *  detector settings wherever possible (switching passes frame to frame adds landmark jitter). A filled run is
 *  kept only if it is at least `minRun` frames or bridges a gap between found frames. All passes share fps. */
export function mergeTakes(passes: RawTake[], o: { minRun?: number } = {}): RawTake {
  if (!passes.length) throw new Error('no passes');
  const n = Math.max(...passes.map((p) => p.frames.length));
  const frames: (RawFrame | null)[] = Array.from({ length: n }, (_, i) => passes[0].frames[i] ?? null);
  for (const p of passes.slice(1)) {
    for (let i = 0; i < n; i++) if (!frames[i] && p.frames[i]) frames[i] = p.frames[i];
  }
  const minRun = o.minRun ?? 1;
  if (minRun > 1) {
    let i = 0;
    while (i < n) {
      if (!frames[i] || passes[0].frames[i]) { i++; continue; }
      let k = i; while (k < n && frames[k] && !passes[0].frames[k]) k++;
      const bridged = i > 0 && !!frames[i - 1] && k < n && !!frames[k];
      if (k - i < minRun && !bridged) for (let q = i; q < k; q++) frames[q] = null;
      i = k;
    }
  }
  return { ...passes[0], frames, source: { ...passes[0].source, label: `${passes[0].source.label} (${passes.length} passes)` } };
}

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
