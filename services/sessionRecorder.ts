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
  /** Fired for every recorded chunk as it arrives — used to stream a durable
   *  on-device copy (crash/upload-failure safe) in parallel with the in-memory buffer. */
  onData?: (chunk: Blob) => void;
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
  private locked = false; // single-source canvas aspect locked to the source
  private beginRecorder: (() => void) | null = null; // deferred start (after aspect lock)
  recording = false;

  private onData: ((chunk: Blob) => void) | null;

  constructor(options: SessionRecorderOptions = {}) {
    this.opts = {
      audioOnly: options.audioOnly ?? false,
      fps: options.fps ?? 24,
      maxSize: options.maxSize ?? 1280,
      onData: options.onData ?? (() => {}),
    };
    this.onData = options.onData ?? null;
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

      if (this.opts.audioOnly) {
        const mixed = new MediaStream(this.dest.stream.getAudioTracks());
        const mime = this.pickMime();
        this.recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
        this.chunks = [];
        this.recorder.ondataavailable = e => { if (e.data.size > 0) { this.chunks.push(e.data); this.onData?.(e.data); } };
        this.recorder.start(1000);
      } else {
        // Portrait default (the live streamer is portrait). drawGrid re-locks to the real
        // source aspect on the first ready frame — but ONLY before MediaRecorder starts.
        this.canvas = document.createElement('canvas');
        this.canvas.width = 720; this.canvas.height = 1280;
        const draw = () => { this.drawGrid(); this.raf = requestAnimationFrame(draw); };
        this.raf = requestAnimationFrame(draw);
        // Deferred: capture the canvas + start MediaRecorder ONLY once the canvas is locked
        // to the source's real aspect. Starting before that (then resizing the canvas)
        // squished every recording — the muxer's dimensions are fixed at start().
        this.beginRecorder = () => {
          if (this.recorder || !this.canvas || !this.dest) return;
          const canvasStream = this.canvas.captureStream(this.opts.fps);
          const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
          const mime = this.pickMime();
          this.recorder = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined);
          this.chunks = [];
          this.recorder.ondataavailable = e => { if (e.data.size > 0) { this.chunks.push(e.data); this.onData?.(e.data); } };
          this.recorder.start(1000);
        };
      }
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

    // Single source (the broadcast case: the composited/graded canvas): record it at
    // its NATIVE aspect, uncropped — the old grid cover-cropped a portrait composite
    // into a 16:9 cell, cutting off the PiP corner (looked like "only the rear feed").
    if (els.length === 1) {
      const v = els[0];
      // Wait for REAL decoded frames before locking the canvas aspect — early metadata can
      // report a transient aspect (Android raw-camera race), which recorded squished video.
      if (v.readyState < 2) return;
      const ar = v.videoWidth / v.videoHeight;
      const car = canvas.width / canvas.height;
      // Lock the canvas to the source aspect — but ONLY before MediaRecorder has started.
      // Resizing the canvas after the recorder is running re-writes the muxer dimensions =
      // squished output. Once recording, the size is frozen and we letterbox instead.
      if (!this.recorder && (!this.locked || Math.abs(ar - car) / car > 0.12)) {
        let w: number, h: number;
        if (ar >= 1) { w = this.opts.maxSize; h = Math.round(w / ar); }
        else { h = this.opts.maxSize; w = Math.round(h * ar); }
        canvas.width = w; canvas.height = h; this.locked = true;
      }
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const car2 = canvas.width / canvas.height; // recompute — a re-lock may have resized
      let dw = canvas.width, dh = canvas.height;
      if (ar > car2) { dw = canvas.width; dh = dw / ar; } else { dh = canvas.height; dw = dh * ar; }
      try { ctx.drawImage(v, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh); } catch { /* not ready */ }
      // First real frame is drawn at the locked aspect → NOW safe to start the recorder.
      if (this.beginRecorder) { this.beginRecorder(); this.beginRecorder = null; }
      return;
    }

    const n = Math.max(1, els.length);
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    // Size the canvas to a 16:9-ish grid capped at maxSize on the long edge.
    const targetW = this.opts.maxSize;
    const targetH = Math.round((targetW / cols) * rows * (9 / 16)) || Math.round(targetW * 9 / 16);
    if (!this.recorder && (canvas.width !== targetW || canvas.height !== targetH)) { canvas.width = targetW; canvas.height = targetH; }

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
    // Grid is sized + drawn → safe to start the recorder (deferred from start()).
    if (els.length && this.beginRecorder) { this.beginRecorder(); this.beginRecorder = null; }
  }

  private cleanup() {
    this.recording = false;
    this.locked = false;
    this.beginRecorder = null;
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
