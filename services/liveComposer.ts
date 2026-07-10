// liveComposer — camera/screen composition engine for the live streamer.
//
// Produces ONE canvas video stream that the RTC layer publishes. Switching modes
// just changes what's drawn onto the canvas — no track swap, no renegotiation, so
// mode changes are instant and don't drop viewers.
//
// Modes:
//   front       — front (selfie) camera, full frame
//   rear        — rear camera, full frame
//   both        — rear full frame + front camera in a rounded PiP corner
//   screen-pip  — screen capture full frame + front camera in a PiP corner
//   screen-mask — screen capture full frame + the person cut out of the front camera
//                 (MediaPipe selfie segmentation) composited into the corner
//
// Caveats it handles gracefully: dual-camera capture is blocked on iOS and some
// Android; browser screen capture (getDisplayMedia) doesn't exist on mobile Safari
// and is limited elsewhere. Unsupported sources throw → the caller reverts the mode.

export type ComposerMode = 'front' | 'rear' | 'both' | 'screen-pip' | 'screen-mask';

const HQ: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };

const makeVideoEl = (): HTMLVideoElement => {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.autoplay = true;
  (v as any).setAttribute?.('playsinline', '');
  return v;
};

const roundRectPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

// object-cover: draw `el` filling the target rect, cropping overflow.
const coverDraw = (c: CanvasRenderingContext2D, el: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number) => {
  const vw = el.videoWidth, vh = el.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(dw / vw, dh / vh);
  const sw = dw / scale, sh = dh / scale;
  const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  c.drawImage(el, sx, sy, sw, sh, dx, dy, dw, dh);
};

export class LiveComposer {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { alpha: false })!;
  private out: MediaStream | null = null;
  private raf = 0;
  private mode: ComposerMode = 'front';

  private frontStream: MediaStream | null = null;
  private rearStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private frontEl = makeVideoEl();
  private rearEl = makeVideoEl();
  private screenEl = makeVideoEl();

  // Segmentation (lazy — only when a mask mode is used).
  private seg: any = null;
  private segLoading = false;
  private maskCanvas = document.createElement('canvas'); // person cut-out (with alpha)
  private maskCtx = this.maskCanvas.getContext('2d')!;

  constructor(private onScreenEnded?: () => void) {
    this.setCanvas(720, 1280);
  }

  private setCanvas(w: number, h: number) {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  /** The stream to publish. Stable across mode changes. */
  getStream(): MediaStream {
    if (!this.out) {
      this.out = this.canvas.captureStream(30);
      if (!this.raf) this.loop();
    }
    return this.out;
  }

  getMode() { return this.mode; }

  /** The physical camera track currently feeding the composite (front takes priority,
   *  else rear) so manual camera controls can be applied to the real source. */
  getActiveCameraTrack(): MediaStreamTrack | null {
    return this.frontStream?.getVideoTracks()[0] || this.rearStream?.getVideoTracks()[0] || null;
  }

  private async ensureFront() {
    if (this.frontStream) return;
    this.frontStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: 'user' } });
    this.frontEl.srcObject = this.frontStream; await this.frontEl.play().catch(() => {});
  }
  private async ensureRear() {
    if (this.rearStream) return;
    try { this.rearStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: { exact: 'environment' } } }); }
    catch { this.rearStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: 'environment' } }); }
    this.rearEl.srcObject = this.rearStream; await this.rearEl.play().catch(() => {});
  }
  private async ensureScreen() {
    if (this.screenStream) return;
    const md: any = navigator.mediaDevices;
    if (typeof md.getDisplayMedia !== 'function') throw new Error('Screen sharing isn\'t supported on this device.');
    this.screenStream = await md.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
    this.screenEl.srcObject = this.screenStream; await this.screenEl.play().catch(() => {});
    // If the user stops sharing via the browser UI, tell the caller.
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () => { this.releaseScreen(); this.onScreenEnded?.(); });
  }
  private stopStream(s: MediaStream | null) { s?.getTracks().forEach(t => t.stop()); }
  private releaseFront() { this.stopStream(this.frontStream); this.frontStream = null; this.frontEl.srcObject = null; }
  private releaseRear() { this.stopStream(this.rearStream); this.rearStream = null; this.rearEl.srcObject = null; }
  private releaseScreen() { this.stopStream(this.screenStream); this.screenStream = null; this.screenEl.srcObject = null; }

  /** Switch composition mode — acquires the sources it needs, releases the rest.
   *  Throws (leaving the previous mode's sources intact) if a required source is
   *  unavailable, so the caller can revert the UI. */
  async setMode(mode: ComposerMode): Promise<void> {
    const needFront = mode === 'front' || mode === 'both' || mode === 'screen-pip' || mode === 'screen-mask';
    const needRear = mode === 'rear' || mode === 'both';
    const needScreen = mode === 'screen-pip' || mode === 'screen-mask';

    if (needFront) await this.ensureFront();
    if (needRear) await this.ensureRear();
    if (needScreen) await this.ensureScreen();
    if (mode === 'screen-mask') await this.ensureSegmenter();

    // Release what the new mode doesn't use (frees the camera / stops screen capture).
    if (!needFront) this.releaseFront();
    if (!needRear) this.releaseRear();
    if (!needScreen) this.releaseScreen();

    // Portrait for camera-centric modes; landscape to match a shared screen.
    if (needScreen) this.setCanvas(1280, 720); else this.setCanvas(720, 1280);
    this.mode = mode;
    this.getStream(); // ensure the loop is running
  }

  private async ensureSegmenter() {
    if (this.seg || this.segLoading) return;
    this.segLoading = true;
    try {
      const vision: any = await import(
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
      );
      const fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      this.seg = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' },
        runningMode: 'VIDEO', outputConfidenceMasks: true,
      });
    } catch (e) {
      console.warn('[liveComposer] segmenter unavailable, falling back to PiP box:', e);
      this.seg = null; // draw() falls back to a plain PiP box
    }
    this.segLoading = false;
  }

  // Render the front camera with the background removed into maskCanvas (with alpha).
  private renderMaskedPerson(): HTMLCanvasElement | null {
    const el = this.frontEl;
    const vw = el.videoWidth, vh = el.videoHeight;
    if (!vw || !vh || !this.seg) return null;
    const bw = 320, bh = Math.round(bw * vh / vw);
    if (this.maskCanvas.width !== bw) { this.maskCanvas.width = bw; this.maskCanvas.height = bh; }
    const m = this.maskCtx;
    m.drawImage(el, 0, 0, bw, bh);
    try {
      const res = this.seg.segmentForVideo(el, performance.now());
      const mask = res.confidenceMasks?.[0];
      if (mask) {
        const mf = mask.getAsFloat32Array();
        const img = m.getImageData(0, 0, bw, bh), d = img.data;
        for (let p = 0, j = 3; p < mf.length; p++, j += 4) d[j] = mf[p] > 0.5 ? 255 : Math.round(mf[p] * mf[p] * 255);
        m.putImageData(img, 0, 0);
      }
      res.close?.();
    } catch { /* skip this frame */ }
    return this.maskCanvas;
  }

  private draw() {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);

    if (this.mode === 'front') { coverDraw(c, this.frontEl, 0, 0, W, H); }
    else if (this.mode === 'rear') { coverDraw(c, this.rearEl, 0, 0, W, H); }
    else if (this.mode === 'both') {
      coverDraw(c, this.rearEl, 0, 0, W, H);
      this.drawPip(this.frontEl);
    } else if (this.mode === 'screen-pip') {
      coverDraw(c, this.screenEl, 0, 0, W, H);
      this.drawPip(this.frontEl);
    } else if (this.mode === 'screen-mask') {
      coverDraw(c, this.screenEl, 0, 0, W, H);
      const person = this.seg ? this.renderMaskedPerson() : null;
      if (person && person.width) this.drawMaskedCorner(person);
      else this.drawPip(this.frontEl); // segmenter not ready → plain box
    }
  }

  private pipRect() {
    const W = this.canvas.width, H = this.canvas.height;
    const pw = Math.round(W * (W > H ? 0.24 : 0.34));
    const ph = Math.round(pw * 4 / 3);
    const pad = Math.round(W * 0.03);
    return { x: W - pw - pad, y: H - ph - pad, w: pw, h: ph, pad };
  }
  private drawPip(el: HTMLVideoElement) {
    const c = this.ctx, { x, y, w, h } = this.pipRect();
    c.save();
    roundRectPath(c, x, y, w, h, Math.round(w * 0.09));
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = '#000'; c.fill(); c.shadowColor = 'transparent';
    c.clip();
    coverDraw(c, el, x, y, w, h);
    c.restore();
    c.save();
    roundRectPath(c, x, y, w, h, Math.round(w * 0.09));
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke();
    c.restore();
  }
  // The cut-out person, scaled to sit in the corner over the screen (no box/border).
  private drawMaskedCorner(person: HTMLCanvasElement) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    const targetH = Math.round(H * 0.5);
    const dw = Math.round(targetH * person.width / person.height);
    const dx = W - dw - Math.round(W * 0.01), dy = H - targetH;
    c.drawImage(person, dx, dy, dw, targetH);
  }

  private loop = () => {
    try { this.draw(); } catch { /* keep the loop alive */ }
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.releaseFront(); this.releaseRear(); this.releaseScreen();
    this.out?.getTracks().forEach(t => t.stop()); this.out = null;
    try { this.seg?.close?.(); } catch { /* */ }
    this.seg = null;
  }
}
