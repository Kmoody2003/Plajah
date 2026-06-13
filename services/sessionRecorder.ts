/**
 * sessionRecorder — generalized recording for the rtcCore backbone.
 *
 * Turns ANY real-time session into a content artifact: it composites every
 * participant's video into a grid on a canvas and mixes all audio through one
 * AudioContext, then records the result with MediaRecorder. Audio-only mode
 * (talk rooms / Spaces) skips the canvas and records the mixed audio alone — a
 * ready-to-publish podcast episode.
 *
 * It reads the live set of streams via a provider callback each frame, so
 * participants joining/leaving mid-recording are handled automatically (the same
 * reason the live engine records a canvas, not a raw track).
 *
 * This is the content flywheel: a call becomes a clip, a video room becomes a
 * highlight, a Space becomes a podcast — fed straight into uploadVideo.
 */

export interface SessionRecorderOptions {
  /** true = mix audio only (talk rooms → podcast). false = video grid + audio. */
  audioOnly?: boolean;
  fps?: number;
  /** Max canvas dimension (the grid is capped to this on the long edge). */
  maxSize?: number;
}

type StreamsProvider = () => MediaStream[];

export class SessionRecorder {
  private opts: Required<SessionRecorderOptions>;
  private provider: StreamsProvider | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private audioCtx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private connected = new Map<string, MediaStreamAudioSourceNode>();
  private videoEls = new Map<string, HTMLVideoElement>();
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  recording = false;

  constructor(options: SessionRecorderOptions = {}) {
    this.opts = {
      audioOnly: options.audioOnly ?? false,
      fps: options.fps ?? 24,
      maxSize: options.maxSize ?? 1280,
    };
  }

  /** How many seconds have been recorded so far. */
  get elapsedSec(): number { return this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0; }

  start(provider: StreamsProvider): boolean {
    if (this.recording) return true;
    this.provider = provider;
    try {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.dest = this.audioCtx.createMediaStreamDestination();
      this.reconcileAudio();

      let mixed: MediaStream;
      if (this.opts.audioOnly) {
        mixed = new MediaStream(this.dest.stream.getAudioTracks());
      } else {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1280; this.canvas.height = 720;
        const draw = () => { this.drawGrid(); this.raf = requestAnimationFrame(draw); };
        this.raf = requestAnimationFrame(draw);
        const canvasStream = this.canvas.captureStream(this.opts.fps);
        mixed = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...this.dest.stream.getAudioTracks(),
        ]);
      }

      const mime = this.pickMime();
      this.recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
      this.chunks = [];
      this.recorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data); };
      this.recorder.start(1000);
      this.startedAt = Date.now();
      this.recording = true;
      return true;
    } catch (e) {
      console.warn('[recorder] start failed', e);
      this.cleanup();
      return false;
    }
  }

  async stop(): Promise<Blob | null> {
    if (!this.recorder || !this.recording) { this.cleanup(); return null; }
    const type = this.recorder.mimeType || (this.opts.audioOnly ? 'audio/webm' : 'video/webm');
    const blob: Blob = await new Promise(resolve => {
      this.recorder!.onstop = () => resolve(new Blob(this.chunks, { type }));
      try { this.recorder!.stop(); } catch { resolve(new Blob(this.chunks, { type })); }
    });
    this.cleanup();
    return blob.size > 0 ? blob : null;
  }

  // ── internals ──────────────────────────────────────────────────────────────
  private pickMime(): string {
    const candidates = this.opts.audioOnly
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    return candidates.find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';
  }

  /** Connect any newly-present audio tracks into the mix (idempotent). */
  private reconcileAudio() {
    if (!this.audioCtx || !this.dest || !this.provider) return;
    const streams = this.provider();
    for (const s of streams) {
      if (!s || this.connected.has(s.id)) continue;
      if (s.getAudioTracks().length === 0) continue;
      try {
        const src = this.audioCtx.createMediaStreamSource(s);
        src.connect(this.dest);
        this.connected.set(s.id, src);
      } catch { /* already connected / no audio */ }
    }
  }

  /** Draw all participant videos into a responsive grid. */
  private drawGrid() {
    const canvas = this.canvas;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !this.provider) return;
    this.reconcileAudio(); // also picks up late audio joiners

    const streams = this.provider().filter(s => s && s.getVideoTracks().length > 0);
    // Maintain a hidden <video> per stream so we can sample frames.
    const liveIds = new Set(streams.map(s => s.id));
    for (const [id, el] of this.videoEls) {
      if (!liveIds.has(id)) { el.srcObject = null; this.videoEls.delete(id); }
    }
    for (const s of streams) {
      if (!this.videoEls.has(s.id)) {
        const v = document.createElement('video');
        v.autoplay = true; v.muted = true; (v as any).playsInline = true;
        v.srcObject = s; v.play().catch(() => {});
        this.videoEls.set(s.id, v);
      }
    }

    const els = [...this.videoEls.values()].filter(v => v.videoWidth > 0);
    const n = Math.max(1, els.length);
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    // Size the canvas to a 16:9-ish grid capped at maxSize on the long edge.
    const targetW = this.opts.maxSize;
    const targetH = Math.round((targetW / cols) * rows * (9 / 16)) || Math.round(targetW * 9 / 16);
    if (canvas.width !== targetW || canvas.height !== targetH) { canvas.width = targetW; canvas.height = targetH; }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cw = canvas.width / cols;
    const ch = canvas.height / rows;
    els.forEach((v, i) => {
      const cx = (i % cols) * cw;
      const cy = Math.floor(i / cols) * ch;
      // object-fit: cover within the cell
      const vr = v.videoWidth / v.videoHeight;
      const cr = cw / ch;
      let dw = cw, dh = ch, dx = cx, dy = cy;
      if (vr > cr) { dh = ch; dw = ch * vr; dx = cx - (dw - cw) / 2; }
      else { dw = cw; dh = cw / vr; dy = cy - (dh - ch) / 2; }
      try { ctx.drawImage(v, dx, dy, dw, dh); } catch { /* not ready */ }
    });
  }

  private cleanup() {
    this.recording = false;
    cancelAnimationFrame(this.raf);
    this.connected.forEach(src => { try { src.disconnect(); } catch {} });
    this.connected.clear();
    this.videoEls.forEach(v => { v.srcObject = null; });
    this.videoEls.clear();
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null; this.dest = null; this.canvas = null;
    this.recorder = null; this.provider = null;
  }
}
