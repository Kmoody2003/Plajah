// liveComposer — camera/screen composition + color-grade engine for the live streamer.
//
// Pipeline: sources → 2D composite (work canvas) → WebGL2 color grade (built-in looks
// or a custom .cube 3D LUT) → output canvas → captureStream → published track.
// Switching modes/looks just changes what's drawn/graded — no track swap, no
// renegotiation, so it's instant and never drops viewers.
//
// Modes:
//   front · rear · both (rear + front PiP) · screen-pip (screen + camera PiP) ·
//   screen-mask (screen + the person cut out of the front camera via MediaPipe)
//
// Looks: neutral · warm · teal-orange · moody · vivid · noir · vintage, plus any
// uploaded .cube 3D LUT. Grading runs on WebGL2; if unavailable it passes through.

export type ComposerMode = 'front' | 'rear' | 'both' | 'screen-pip' | 'screen-mask';
export type LookId = 'none' | 'warm' | 'tealorange' | 'moody' | 'vivid' | 'noir' | 'vintage';
export const LOOKS: { id: LookId; label: string }[] = [
  { id: 'none', label: 'Neutral' },
  { id: 'warm', label: 'Warm film' },
  { id: 'tealorange', label: 'Teal & orange' },
  { id: 'moody', label: 'Moody' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'noir', label: 'Noir' },
  { id: 'vintage', label: 'Vintage' },
];
const LOOK_INDEX: Record<LookId, number> = { none: 0, warm: 1, tealorange: 2, moody: 3, vivid: 4, noir: 5, vintage: 6 };

const HQ: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };

const makeVideoEl = (): HTMLVideoElement => {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.autoplay = true;
  v.setAttribute('playsinline', '');
  return v;
};
const roundRectPath = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
};
const coverDraw = (c: CanvasRenderingContext2D, el: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number) => {
  const vw = el.videoWidth, vh = el.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(dw / vw, dh / vh);
  const sw = dw / scale, sh = dh / scale;
  c.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, dx, dy, dw, dh);
};

const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x*0.5+0.5, 1.0-(p.y*0.5+0.5)); gl_Position = vec4(p,0.0,1.0); }`;
const FRAG = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler3D uLut; uniform bool uUseLut; uniform int uLook;
const vec3 L = vec3(0.299,0.587,0.114);
vec3 grade(vec3 c){
  if(uLook==1){ c.r*=1.06; c.b*=0.94; c=(c-0.5)*1.08+0.5; float l=dot(c,L); c=mix(vec3(l),c,1.12); }
  else if(uLook==2){ float l=dot(c,L); vec3 s=mix(c,c*vec3(0.82,1.05,1.16),1.0-l); vec3 h=mix(s,s*vec3(1.16,1.02,0.84),l); c=(h-0.5)*1.06+0.5; }
  else if(uLook==3){ float l=dot(c,L); c=mix(vec3(l),c,0.85)*0.93; c=(c-0.5)*1.12+0.48; c.b*=1.06; }
  else if(uLook==4){ float l=dot(c,L); c=mix(vec3(l),c,1.38); c=(c-0.5)*1.12+0.5; }
  else if(uLook==5){ float l=dot(c,L); c=vec3((l-0.5)*1.28+0.5); }
  else if(uLook==6){ c=(c-0.5)*0.9+0.52; c.r*=1.05; c.g*=1.02; c.b*=0.9; float l=dot(c,L); c=mix(vec3(l),c,0.8); }
  return c;
}
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  c = uUseLut ? texture(uLut, clamp(c,0.0,1.0)).rgb : grade(c);
  frag = vec4(clamp(c,0.0,1.0),1.0);
}`;

export class LiveComposer {
  readonly canvas = document.createElement('canvas'); // captured (WebGL2 output, or 2D fallback)
  private work = document.createElement('canvas');     // 2D composite target
  private wctx = this.work.getContext('2d', { alpha: false })!;
  private out: MediaStream | null = null;
  private raf = 0;
  private mode: ComposerMode = 'front';

  // Grade stage
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uTex = 0; private uLut = 0; private uUse: WebGLUniformLocation | null = null; private uLookLoc: WebGLUniformLocation | null = null;
  private inTex: WebGLTexture | null = null;
  private lut3d: WebGLTexture | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null; // fallback blit when no WebGL2
  private look: LookId = 'none';
  private useLut = false;

  private frontStream: MediaStream | null = null;
  private rearStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private frontEl = makeVideoEl();
  private rearEl = makeVideoEl();
  private screenEl = makeVideoEl();

  private seg: any = null;
  private segLoading = false;
  private maskCanvas = document.createElement('canvas');
  private maskCtx = this.maskCanvas.getContext('2d')!;

  constructor(private onScreenEnded?: () => void) {
    this.initGL();
    this.setCanvas(720, 1280);
  }

  private initGL() {
    try {
      const gl = this.canvas.getContext('webgl2', { alpha: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('no webgl2');
      this.gl = gl;
      const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, VERT); gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, FRAG); gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs) || 'fs');
      const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      this.prog = prog; gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uLut'), 1);
      this.uUse = gl.getUniformLocation(prog, 'uUseLut');
      this.uLookLoc = gl.getUniformLocation(prog, 'uLook');
      this.inTex = gl.createTexture();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.inTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (e) {
      console.warn('[liveComposer] WebGL2 grade unavailable — passing through:', e);
      this.gl = null; this.ctx2d = this.canvas.getContext('2d', { alpha: false });
    }
  }

  private setCanvas(w: number, h: number) {
    if (this.work.width !== w) { this.work.width = w; this.work.height = h; }
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = h; this.gl?.viewport(0, 0, w, h); }
  }

  getStream(): MediaStream {
    if (!this.out) { this.out = this.canvas.captureStream(30); if (!this.raf) this.loop(); }
    return this.out;
  }
  getMode() { return this.mode; }
  getLook() { return this.useLut ? 'custom' : this.look; }
  hasGrade() { return !!this.gl; }

  getActiveCameraTrack(): MediaStreamTrack | null {
    return this.frontStream?.getVideoTracks()[0] || this.rearStream?.getVideoTracks()[0] || null;
  }

  setLook(look: LookId) { this.look = look; this.useLut = false; }
  clearLut() { this.useLut = false; }

  /** Parse + upload a .cube 3D LUT (LUT_3D_SIZE). Falls back silently if no WebGL2. */
  setCubeLut(text: string): boolean {
    const gl = this.gl; if (!gl) return false;
    let size = 0; const data: number[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('TITLE') || line.startsWith('DOMAIN')) continue;
      const m = line.match(/^LUT_3D_SIZE\s+(\d+)/i); if (m) { size = parseInt(m[1], 10); continue; }
      if (/^LUT_1D_SIZE/i.test(line)) return false; // 1D not supported here
      const p = line.split(/\s+/).map(Number);
      if (p.length === 3 && p.every(n => !isNaN(n))) data.push(p[0], p[1], p[2]);
    }
    if (!size || data.length !== size * size * size * 3) return false;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, size, size, size, 0, gl.RGB, gl.FLOAT, new Float32Array(data));
    if (this.lut3d) gl.deleteTexture(this.lut3d);
    this.lut3d = tex; this.useLut = true;
    return true;
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
    if (typeof md.getDisplayMedia !== 'function') throw new Error("Screen sharing isn't supported on this device.");
    this.screenStream = await md.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: false });
    this.screenEl.srcObject = this.screenStream; await this.screenEl.play().catch(() => {});
    this.screenStream.getVideoTracks()[0]?.addEventListener('ended', () => { this.releaseScreen(); this.onScreenEnded?.(); });
  }
  private stop(s: MediaStream | null) { s?.getTracks().forEach(t => t.stop()); }
  private releaseFront() { this.stop(this.frontStream); this.frontStream = null; this.frontEl.srcObject = null; }
  private releaseRear() { this.stop(this.rearStream); this.rearStream = null; this.rearEl.srcObject = null; }
  private releaseScreen() { this.stop(this.screenStream); this.screenStream = null; this.screenEl.srcObject = null; }

  async setMode(mode: ComposerMode): Promise<void> {
    const needFront = mode !== 'rear';
    const needRear = mode === 'rear' || mode === 'both';
    const needScreen = mode === 'screen-pip' || mode === 'screen-mask';
    if (needFront) await this.ensureFront();
    if (needRear) await this.ensureRear();
    if (needScreen) await this.ensureScreen();
    if (mode === 'screen-mask') await this.ensureSegmenter();
    if (!needFront) this.releaseFront();
    if (!needRear) this.releaseRear();
    if (!needScreen) this.releaseScreen();
    if (needScreen) this.setCanvas(1280, 720); else this.setCanvas(720, 1280);
    this.mode = mode;
    this.getStream();
  }

  private async ensureSegmenter() {
    if (this.seg || this.segLoading) return;
    this.segLoading = true;
    try {
      const vision: any = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
      const fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      this.seg = await vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' },
        runningMode: 'VIDEO', outputConfidenceMasks: true,
      });
    } catch (e) { console.warn('[liveComposer] segmenter unavailable, PiP fallback:', e); this.seg = null; }
    this.segLoading = false;
  }

  private renderMaskedPerson(): HTMLCanvasElement | null {
    const el = this.frontEl, vw = el.videoWidth, vh = el.videoHeight;
    if (!vw || !vh || !this.seg) return null;
    const bw = 320, bh = Math.round(bw * vh / vw);
    if (this.maskCanvas.width !== bw) { this.maskCanvas.width = bw; this.maskCanvas.height = bh; }
    const m = this.maskCtx; m.drawImage(el, 0, 0, bw, bh);
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
    } catch { /* skip frame */ }
    return this.maskCanvas;
  }

  private draw() {
    const c = this.wctx, W = this.work.width, H = this.work.height;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    if (this.mode === 'front') coverDraw(c, this.frontEl, 0, 0, W, H);
    else if (this.mode === 'rear') coverDraw(c, this.rearEl, 0, 0, W, H);
    else if (this.mode === 'both') { coverDraw(c, this.rearEl, 0, 0, W, H); this.drawPip(this.frontEl); }
    else if (this.mode === 'screen-pip') { coverDraw(c, this.screenEl, 0, 0, W, H); this.drawPip(this.frontEl); }
    else if (this.mode === 'screen-mask') {
      coverDraw(c, this.screenEl, 0, 0, W, H);
      const person = this.seg ? this.renderMaskedPerson() : null;
      if (person && person.width) this.drawMaskedCorner(person); else this.drawPip(this.frontEl);
    }
  }
  private pipRect() {
    const W = this.work.width, H = this.work.height;
    const pw = Math.round(W * (W > H ? 0.24 : 0.34)), ph = Math.round(pw * 4 / 3), pad = Math.round(W * 0.03);
    return { x: W - pw - pad, y: H - ph - pad, w: pw, h: ph };
  }
  private drawPip(el: HTMLVideoElement) {
    const c = this.wctx, { x, y, w, h } = this.pipRect(), r = Math.round(w * 0.09);
    c.save(); roundRectPath(c, x, y, w, h, r);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = '#000'; c.fill();
    c.shadowColor = 'transparent'; c.clip(); coverDraw(c, el, x, y, w, h); c.restore();
    c.save(); roundRectPath(c, x, y, w, h, r); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(); c.restore();
  }
  private drawMaskedCorner(person: HTMLCanvasElement) {
    const c = this.wctx, W = this.work.width, H = this.work.height;
    const th = Math.round(H * 0.5), dw = Math.round(th * person.width / person.height);
    c.drawImage(person, W - dw - Math.round(W * 0.01), H - th, dw, th);
  }

  private present() {
    const gl = this.gl;
    if (!gl || !this.prog) { this.ctx2d?.drawImage(this.work, 0, 0); return; }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.inTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.work);
    if (this.useLut && this.lut3d) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.lut3d); }
    gl.uniform1i(this.uUse, this.useLut && this.lut3d ? 1 : 0);
    gl.uniform1i(this.uLookLoc, LOOK_INDEX[this.look] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private loop = () => {
    try { this.draw(); this.present(); } catch { /* keep alive */ }
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.releaseFront(); this.releaseRear(); this.releaseScreen();
    this.out?.getTracks().forEach(t => t.stop()); this.out = null;
    try { this.seg?.close?.(); } catch { /* */ }
    this.seg = null;
    if (this.gl) { if (this.lut3d) this.gl.deleteTexture(this.lut3d); if (this.inTex) this.gl.deleteTexture(this.inTex); }
  }
}
