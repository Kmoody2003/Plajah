// liveComposer — camera/screen composition + color-grade engine for the live streamer.
//
// Pipeline: sources → 2D composite (work canvas) → grade → OUTPUT 2D canvas →
// captureStream → published track. The captured surface is ALWAYS a 2D canvas
// (mobile GPUs won't reliably captureStream a WebGL canvas); the grade itself runs
// on an OFFSCREEN WebGL2 canvas (built-in looks + custom .cube 3D LUTs in a shader)
// and is blitted synchronously into the output — drawImage from a WebGL canvas in
// the same task is spec-guaranteed to see the frame, no preserveDrawingBuffer games.
// Fallback chain: WebGL2 shader → ctx.filter looks → passthrough.
// Switching modes/looks just changes what's drawn/graded — no track swap, no
// renegotiation, so it's instant and never drops viewers.
//
// Modes:
//   front · rear · both (rear + front PiP) · screen-pip (screen + camera PiP) ·
//   screen-mask (screen + the person cut out of the front camera via MediaPipe)
//
// Looks: neutral · warm · teal-orange · moody · vivid · noir · vintage, plus any
// uploaded .cube 3D LUT. Grading runs on WebGL2; if unavailable it passes through.

import type { VTuberHandle } from './vtuber/vtuberEngine';
import type { AvatarDescriptor } from './vtuber/avatarFactory';

export type ComposerMode = 'front' | 'rear' | 'both' | 'screen-pip' | 'screen-mask' | 'vtuber';
export type LookId = 'none' | 'warm' | 'tealorange' | 'moody' | 'vivid' | 'noir' | 'vintage'
  | 'golden' | 'cyberpunk' | 'pastel' | 'sunset' | 'arctic';
export const LOOKS: { id: LookId; label: string }[] = [
  { id: 'none', label: 'Neutral' },
  { id: 'warm', label: 'Warm film' },
  { id: 'tealorange', label: 'Teal & orange' },
  { id: 'moody', label: 'Moody' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'noir', label: 'Noir' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'golden', label: 'Golden hour' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'pastel', label: 'Pastel dream' },
  { id: 'sunset', label: 'Sunset pop' },
  { id: 'arctic', label: 'Arctic' },
];
// ── Grade shader (runs on an OFFSCREEN WebGL2 canvas; result is blitted into the captured
//    2D output the same task, so capture reliability never depends on WebGL). ──────────────
const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x*0.5+0.5, 1.0-(p.y*0.5+0.5)); gl_Position = vec4(p,0.0,1.0); }`;
const FRAG = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler3D uLut; uniform bool uUseLut; uniform int uLook;
uniform float uLutScale; uniform float uLutOff; // texel-centre mapping: c*(N-1)/N + 0.5/N
uniform bool uNight; // low-light boost: gamma shadow-lift before the look/LUT
const vec3 L = vec3(0.299,0.587,0.114);
vec3 grade(vec3 c){
  if(uLook==1){ c.r*=1.06; c.b*=0.94; c=(c-0.5)*1.08+0.5; float l=dot(c,L); c=mix(vec3(l),c,1.12); }
  else if(uLook==2){ float l=dot(c,L); vec3 s=mix(c,c*vec3(0.82,1.05,1.16),1.0-l); vec3 h=mix(s,s*vec3(1.16,1.02,0.84),l); c=(h-0.5)*1.06+0.5; }
  else if(uLook==3){ float l=dot(c,L); c=mix(vec3(l),c,0.85)*0.93; c=(c-0.5)*1.12+0.48; c.b*=1.06; }
  else if(uLook==4){ float l=dot(c,L); c=mix(vec3(l),c,1.38); c=(c-0.5)*1.12+0.5; }
  else if(uLook==5){ float l=dot(c,L); c=vec3((l-0.5)*1.28+0.5); }
  else if(uLook==6){ c=(c-0.5)*0.9+0.52; c.r*=1.05; c.g*=1.02; c.b*=0.9; float l=dot(c,L); c=mix(vec3(l),c,0.8); }
  else if(uLook==7){ c.r*=1.14; c.g*=1.04; c.b*=0.82; c=(c-0.5)*1.06+0.52; float l=dot(c,L); c=mix(vec3(l),c,1.15); }
  else if(uLook==8){ float l=dot(c,L); vec3 s=mix(c,c*vec3(0.6,0.9,1.5),1.0-l); vec3 h=mix(s,s*vec3(1.4,0.75,1.25),l); c=(h-0.5)*1.18+0.48; }
  else if(uLook==9){ c=(c-0.5)*0.82+0.56; float l=dot(c,L); c=mix(vec3(l),c,1.12); c.r*=1.03; c.b*=1.06; }
  else if(uLook==10){ float l=dot(c,L); c=mix(c,c*vec3(1.28,0.92,0.72),0.5+0.5*l); c=(c-0.5)*1.14+0.5; c=mix(vec3(dot(c,L)),c,1.2); }
  else if(uLook==11){ c.r*=0.88; c.b*=1.14; c=(c-0.5)*1.08+0.53; float l=dot(c,L); c=mix(vec3(l),c,0.92); }
  return c;
}
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  if(uNight){ c = pow(c, vec3(0.62)) * 1.06; float l=dot(c,L); c = mix(vec3(l), c, 1.12); }
  c = grade(c);
  if(uUseLut) c = texture(uLut, clamp(c,0.0,1.0)*uLutScale+uLutOff).rgb;
  frag = vec4(clamp(c,0.0,1.0),1.0);
}`;
const LOOK_INDEX: Record<LookId, number> = { none: 0, warm: 1, tealorange: 2, moody: 3, vivid: 4, noir: 5, vintage: 6, golden: 7, cyberpunk: 8, pastel: 9, sunset: 10, arctic: 11 };

// Fallback: built-in looks as 2D-canvas filter strings (used when WebGL2 is unavailable).
const LOOK_FILTERS: Record<LookId, string> = {
  none: 'none',
  warm: 'saturate(1.12) contrast(1.08) sepia(0.16) hue-rotate(-10deg) brightness(1.02)',
  tealorange: 'saturate(1.28) contrast(1.12) hue-rotate(-6deg)',
  moody: 'saturate(0.82) brightness(0.92) contrast(1.14) hue-rotate(6deg)',
  vivid: 'saturate(1.5) contrast(1.12)',
  noir: 'grayscale(1) contrast(1.3) brightness(1.03)',
  vintage: 'sepia(0.4) saturate(0.82) contrast(0.9) brightness(1.05)',
  golden: 'sepia(0.28) saturate(1.25) contrast(1.06) brightness(1.06) hue-rotate(-8deg)',
  cyberpunk: 'saturate(1.5) contrast(1.2) hue-rotate(12deg) brightness(0.96)',
  pastel: 'saturate(1.1) contrast(0.84) brightness(1.12)',
  sunset: 'sepia(0.2) saturate(1.4) contrast(1.14) hue-rotate(-14deg)',
  arctic: 'saturate(0.92) contrast(1.08) brightness(1.05) hue-rotate(8deg)',
};

const HQ: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };

// ── Fun FX layer: emoji particles drawn ON the published output (bursts triggered by the
//    streamer or the audience, plus continuous ambient effects). Drawn AFTER the grade so
//    the emotes stay vibrant regardless of the active look/LUT. ─────────────────────────
export type AmbientFx = 'none' | 'hearts' | 'sparkles' | 'confetti' | 'snow' | 'bubbles';
export const AMBIENT_FX: { id: AmbientFx; label: string; icon: string }[] = [
  { id: 'none', label: 'Off', icon: '—' },
  { id: 'hearts', label: 'Hearts', icon: '💜' },
  { id: 'sparkles', label: 'Sparkles', icon: '✨' },
  { id: 'confetti', label: 'Confetti', icon: '🎊' },
  { id: 'snow', label: 'Snow', icon: '❄️' },
  { id: 'bubbles', label: 'Bubbles', icon: '🫧' },
];
interface FxParticle {
  kind: 'emoji' | 'rect';
  e?: string; color?: string;
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; s: number;
  life: number; ttl: number; sway: number;
}
const CONFETTI_COLORS = ['#FF8C00', '#6B0099', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#ef4444'];
const AMBIENT_EMOJI: Record<Exclude<AmbientFx, 'none' | 'confetti'>, string[]> = {
  hearts: ['💜', '❤️', '🧡', '💖'],
  sparkles: ['✨', '⭐', '💫'],
  snow: ['❄️', '❄️', '✻'],
  bubbles: ['🫧'],
};
const AMBIENT_RATE: Record<AmbientFx, number> = { none: 0, hearts: 1.6, sparkles: 4, confetti: 7, snow: 3.5, bubbles: 1.8 };

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

export class LiveComposer {
  readonly canvas = document.createElement('canvas'); // captured 2D output (composite + graded)
  private octx = this.canvas.getContext('2d', { alpha: false })!;
  private work = document.createElement('canvas');     // 2D composite target
  private wctx = this.work.getContext('2d', { alpha: false })!;
  private out: MediaStream | null = null;
  private raf = 0;
  private mode: ComposerMode = 'front';

  // Grade stage — offscreen WebGL2 shader (looks + .cube LUTs), sync-blitted into the
  // captured 2D output. ctx.filter is the no-WebGL fallback for the built-in looks.
  private look: LookId = 'none';
  private useLut = false;
  private night = false;
  private glCanvas = document.createElement('canvas'); // offscreen — never captured
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private uUse: WebGLUniformLocation | null = null;
  private uLookLoc: WebGLUniformLocation | null = null;
  private uNightLoc: WebGLUniformLocation | null = null;
  private inTex: WebGLTexture | null = null;
  private lut3d: WebGLTexture | null = null;
  private filter2dOk = (() => {
    try { const c = document.createElement('canvas').getContext('2d'); if (!c) return false; c.filter = 'grayscale(1)'; return typeof c.filter === 'string' && c.filter.includes('grayscale'); }
    catch { return false; }
  })();

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

  // VTuber: a face-tracked avatar (2D puppet or VRM) driven by the front camera —
  // 'face' = face-swap on your head; 'body' = full-body paper doll driven by your pose.
  private avatar: AvatarDescriptor | null = null;
  private bodyAvatar: AvatarDescriptor | null = null;
  private vtuberStyle: 'face' | 'body' = 'face';
  private vtuber: VTuberHandle | null = null;
  private vtuberStarting = false;

  // Fun FX layer (emoji bursts + ambient effects), baked into the published output.
  private parts: FxParticle[] = [];
  private ambient: AmbientFx = 'none';
  private emitAcc = 0;
  private lastFxT = 0;

  constructor(private onScreenEnded?: () => void) {
    this.initGL();
    this.setCanvas(720, 1280);
  }

  private initGL() {
    try {
      const gl = this.glCanvas.getContext('webgl2', { alpha: false, preserveDrawingBuffer: false, premultipliedAlpha: false });
      if (!gl) throw new Error('no webgl2');
      const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, VERT); gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, FRAG); gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs) || 'fs');
      const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uLut'), 1);
      this.uUse = gl.getUniformLocation(prog, 'uUseLut');
      this.uLookLoc = gl.getUniformLocation(prog, 'uLook');
      this.uNightLoc = gl.getUniformLocation(prog, 'uNight');
      this.inTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.inTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.gl = gl; this.prog = prog;
    } catch (e) {
      console.warn('[liveComposer] WebGL2 grade unavailable — 2D-filter fallback:', e);
      this.gl = null; this.prog = null;
    }
  }

  private setCanvas(w: number, h: number) {
    if (this.work.width !== w) { this.work.width = w; this.work.height = h; }
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = h; }
    if (this.gl && this.glCanvas.width !== w) { this.glCanvas.width = w; this.glCanvas.height = h; this.gl.viewport(0, 0, w, h); }
  }

  getStream(): MediaStream {
    if (!this.out) { this.out = this.canvas.captureStream(30); if (!this.raf) this.loop(); }
    return this.out;
  }
  getMode() { return this.mode; }
  getLook() { return this.useLut ? 'custom' : this.look; }
  hasGrade() { return !!this.gl || this.filter2dOk; }
  /** What the engine is actually running — surfaced in the UI for on-device debugging. */
  getDiagnostics() {
    return {
      grade: this.gl ? 'webgl' : this.filter2dOk ? '2d-filter' : 'none',
      look: this.getLook(), mode: this.mode, night: this.night,
      size: `${this.canvas.width}x${this.canvas.height}`,
      vtuber: this.vtuber ? `live-${this.vtuberStyle}` : this.hasAvatar() ? 'ready' : 'off',
    };
  }

  getActiveCameraTrack(): MediaStreamTrack | null {
    return this.frontStream?.getVideoTracks()[0] || this.rearStream?.getVideoTracks()[0] || null;
  }

  setLook(look: LookId) { this.look = look; this.useLut = false; }
  clearLut() { this.useLut = false; }

  /** Night mode: real low-light help in the browser. Three layers stacked —
   *  1) camera: 15fps (≈2× sensor integration time) + max exposure compensation,
   *  2) temporal frame-blend in draw() (the same trick native night modes use for noise),
   *  3) shader shadow-lift before the look/LUT.
   *  Especially for front cameras, which have far smaller sensors than the rear. */
  getNightMode() { return this.night; }
  async setNightMode(on: boolean): Promise<void> {
    this.night = on;
    for (const s of [this.frontStream, this.rearStream]) {
      const t = s?.getVideoTracks()[0];
      if (!t || t.readyState !== 'live') continue;
      try {
        const caps: any = t.getCapabilities?.() ?? {};
        const adv: any[] = [];
        if (caps.exposureMode?.includes?.('continuous')) adv.push({ exposureMode: 'continuous' });
        if (caps.exposureCompensation && typeof caps.exposureCompensation.max === 'number') {
          const neutral = Math.min(Math.max(0, caps.exposureCompensation.min), caps.exposureCompensation.max);
          adv.push({ exposureCompensation: on ? caps.exposureCompensation.max : neutral });
        }
        await t.applyConstraints({ frameRate: on ? 15 : 30, ...(adv.length ? { advanced: adv } : {}) } as any);
      } catch { /* per-device — the shader+temporal layers still apply */ }
    }
  }

  /** Set the VTuber avatar (2D puppet built from a character sheet, or a VRM). Takes
   *  effect next time 'vtuber' mode starts; if already in vtuber mode, restart it. */
  setAvatar(a: AvatarDescriptor | null) {
    this.avatar = a;
    if (this.vtuber) { this.vtuber.dispose(); this.vtuber = null; }
  }
  setBodyAvatar(a: AvatarDescriptor | null) {
    this.bodyAvatar = a;
    if (this.vtuberStyle === 'body' && this.vtuber) { this.vtuber.dispose(); this.vtuber = null; }
  }
  hasAvatar() { return !!(this.avatar || this.bodyAvatar); }
  getVtuberStyle() { return this.vtuberStyle; }
  /** Switch face-swap ↔ full-body live (restarts the engine on the same camera). */
  async setVtuberStyle(style: 'face' | 'body'): Promise<void> {
    if (style === this.vtuberStyle) return;
    this.vtuberStyle = style;
    this.releaseVtuber();
    if (this.mode === 'vtuber') await this.ensureVtuber();
  }
  private async ensureVtuber() {
    const desc = this.vtuberStyle === 'body' ? this.bodyAvatar : this.avatar;
    if (this.vtuber || this.vtuberStarting || !desc || !this.frontStream) return;
    this.vtuberStarting = true;
    try {
      // Lazy-load the VTuber engine (pulls in three.js) only when actually used.
      const { createVTuberStream } = await import('./vtuber/vtuberEngine');
      this.vtuber = await createVTuberStream(this.frontStream, {
        avatar: desc, mode: 'FACE_SWAP', width: 540, height: 960, fps: 24,
        background: { type: 'transparent' },
      });
    } catch (e) { console.warn('[liveComposer] vtuber start failed:', e); this.vtuber = null; }
    this.vtuberStarting = false;
  }
  private releaseVtuber() { if (this.vtuber) { this.vtuber.dispose(); this.vtuber = null; } }

  /** Parse + upload a .cube 3D LUT (LUT_3D_SIZE). Needs the WebGL grade path. */
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
    // 8-bit LUT texture: float (RGB32F) 3D textures aren't LINEAR-filterable in WebGL2
    // without an extension — the sampler returns black. 8-bit is exactly what .cube LUTs
    // are applied to in practice, and is filterable on every GPU.
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); // RGB rows aren't 4-byte multiples for most sizes
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, size, size, size, 0, gl.RGB, gl.UNSIGNED_BYTE, bytes);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(gl.getUniformLocation(this.prog!, 'uLutScale'), (size - 1) / size);
    gl.uniform1f(gl.getUniformLocation(this.prog!, 'uLutOff'), 0.5 / size);
    if (this.lut3d) gl.deleteTexture(this.lut3d);
    this.lut3d = tex; this.useLut = true; this.look = 'none';
    return true;
  }

  /** Use an already-open camera track as the front source. Pass a CLONE — the composer
   *  owns it from here. Avoids a second getUserMedia on the same camera, which fails on
   *  some Android devices (double-capture). */
  adoptFrontTrack(track: MediaStreamTrack) {
    this.releaseFront();
    this.frontStream = new MediaStream([track]);
    this.frontEl.srcObject = this.frontStream;
    this.frontEl.play().catch(() => {});
  }
  private async ensureFront() {
    if (this.frontStream?.getVideoTracks()[0]?.readyState === 'live') return;
    this.frontStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...HQ, facingMode: 'user' } });
    this.frontEl.srcObject = this.frontStream; await this.frontEl.play().catch(() => {});
  }
  private async ensureRear() {
    if (this.rearStream?.getVideoTracks()[0]?.readyState === 'live') return;
    this.releaseRear();
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
    if (mode === 'vtuber') await this.ensureVtuber(); else this.releaseVtuber();
    if (!needFront) this.releaseFront();
    if (!needRear) this.releaseRear();
    if (!needScreen) this.releaseScreen();
    if (needScreen) this.setCanvas(1280, 720); else this.setCanvas(720, 1280);
    this.mode = mode;
    if (this.night) this.setNightMode(true).catch(() => {}); // retune any freshly-opened camera
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
    // Night: skip the clear and blend the new frame over the previous one (exponential
    // moving average) — temporal noise reduction, the core of every native night mode.
    if (this.night) c.globalAlpha = 0.62;
    else { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    if (this.mode === 'front') coverDraw(c, this.frontEl, 0, 0, W, H);
    else if (this.mode === 'rear') coverDraw(c, this.rearEl, 0, 0, W, H);
    else if (this.mode === 'both') { coverDraw(c, this.rearEl, 0, 0, W, H); this.drawPip(this.frontEl); }
    else if (this.mode === 'screen-pip') { coverDraw(c, this.screenEl, 0, 0, W, H); this.drawPip(this.frontEl); }
    else if (this.mode === 'screen-mask') {
      coverDraw(c, this.screenEl, 0, 0, W, H);
      const person = this.seg ? this.renderMaskedPerson() : null;
      if (person && person.width) this.drawMaskedCorner(person); else this.drawPip(this.frontEl);
    }
    else if (this.mode === 'vtuber') {
      const src = this.vtuber?.canvas;
      if (src && src.width) {
        const scale = Math.max(W / src.width, H / src.height);
        const sw = W / scale, sh = H / scale;
        c.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
      } else {
        c.fillStyle = '#0d0d14'; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.font = `${Math.round(W * 0.04)}px system-ui`;
        c.textAlign = 'center'; c.fillText(this.avatar ? 'Loading avatar…' : 'Add a character first', W / 2, H / 2);
        c.textAlign = 'left';
      }
      this.drawVtuberStatus(c, W, H);
    }
    c.globalAlpha = 1;
  }

  /** Small on-video status pill in vtuber mode — shows exactly what the face tracker is
   *  doing on THIS device (loading / tracking / unavailable), so failures are visible
   *  instead of silent. */
  private drawVtuberStatus(c: CanvasRenderingContext2D, W: number, H: number) {
    const st = (this.vtuber as any)?.getStatus?.();
    if (!st) return;
    const a = c.globalAlpha; c.globalAlpha = 1;
    const fs = Math.round(W * 0.028);
    c.font = `600 ${fs}px system-ui`;
    const label = `Face: ${st}`;
    const tw = c.measureText(label).width;
    const x = Math.round(W * 0.03), y = H - Math.round(W * 0.05) - fs;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(x - 8, y - fs - 4, tw + 16, fs + 14);
    c.fillStyle = /live|locked/i.test(st) ? '#7CFC9B' : /unavailable|failed|timed/i.test(st) ? '#ff9d9d' : 'rgba(255,255,255,0.85)';
    c.fillText(label, x, y);
    c.globalAlpha = a;
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
    const o = this.octx, W = this.canvas.width, H = this.canvas.height;
    const gl = this.gl;
    const grading = this.night || (this.useLut && this.lut3d ? true : this.look !== 'none');
    if (gl && this.prog && grading) {
      // work → shader (look and/or LUT) → offscreen GL canvas → SYNCHRONOUS blit into the
      // captured 2D output. Same-task drawImage from a WebGL canvas is spec-guaranteed to
      // see the just-rendered frame — no preserveDrawingBuffer, no capture flakiness.
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.inTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.work);
      if (this.useLut && this.lut3d) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, this.lut3d); gl.activeTexture(gl.TEXTURE0); }
      gl.uniform1i(this.uUse, this.useLut && this.lut3d ? 1 : 0);
      gl.uniform1i(this.uLookLoc, LOOK_INDEX[this.look] ?? 0);
      gl.uniform1i(this.uNightLoc, this.night ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      o.drawImage(this.glCanvas, 0, 0, W, H);
    } else if (grading && this.filter2dOk) {
      const nightF = this.night ? 'brightness(1.55) contrast(0.9) saturate(1.15) ' : '';
      o.filter = (nightF + (this.look !== 'none' ? LOOK_FILTERS[this.look] : '')).trim() || 'none';
      o.drawImage(this.work, 0, 0, W, H);
      o.filter = 'none';
    } else {
      o.drawImage(this.work, 0, 0, W, H);
    }
  }

  // ── FX layer ────────────────────────────────────────────────────────────────
  setAmbient(fx: AmbientFx) { this.ambient = fx; }
  getAmbient() { return this.ambient; }
  /** Fire an emoji burst into the published video (streamer or audience triggered). */
  spawnBurst(emoji: string, n = 12) {
    const W = this.canvas.width, H = this.canvas.height;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        kind: 'emoji', e: emoji,
        x: W * (0.25 + Math.random() * 0.5), y: H + 30,
        vx: (Math.random() - 0.5) * W * 0.22, vy: -H * (0.28 + Math.random() * 0.34),
        rot: (Math.random() - 0.5) * 0.8, vr: (Math.random() - 0.5) * 2.4,
        s: W * (0.045 + Math.random() * 0.05), life: 0, ttl: 2.4 + Math.random() * 1.4,
        sway: Math.random() * Math.PI * 2,
      });
    }
    if (this.parts.length > 240) this.parts.splice(0, this.parts.length - 240);
  }
  private emitAmbient(dt: number) {
    const rate = AMBIENT_RATE[this.ambient];
    if (!rate) return;
    this.emitAcc += dt * rate;
    const W = this.canvas.width, H = this.canvas.height;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const a = this.ambient;
      if (a === 'confetti') {
        this.parts.push({ kind: 'rect', color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          x: Math.random() * W, y: -14, vx: (Math.random() - 0.5) * W * 0.05, vy: H * (0.12 + Math.random() * 0.1),
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 6, s: W * (0.012 + Math.random() * 0.012),
          life: 0, ttl: 12, sway: Math.random() * Math.PI * 2 });
      } else if (a === 'snow') {
        const es = AMBIENT_EMOJI.snow;
        this.parts.push({ kind: 'emoji', e: es[(Math.random() * es.length) | 0],
          x: Math.random() * W, y: -20, vx: 0, vy: H * (0.05 + Math.random() * 0.05),
          rot: 0, vr: (Math.random() - 0.5) * 0.6, s: W * (0.02 + Math.random() * 0.025),
          life: 0, ttl: 16, sway: Math.random() * Math.PI * 2 });
      } else if (a === 'sparkles') {
        const es = AMBIENT_EMOJI.sparkles;
        this.parts.push({ kind: 'emoji', e: es[(Math.random() * es.length) | 0],
          x: Math.random() * W, y: Math.random() * H, vx: 0, vy: -H * 0.01,
          rot: 0, vr: 0, s: W * (0.02 + Math.random() * 0.035),
          life: 0, ttl: 1.2 + Math.random() * 0.8, sway: Math.random() * Math.PI * 2 });
      } else { // hearts / bubbles — rise from the bottom with a sway
        const es = a === 'hearts' ? AMBIENT_EMOJI.hearts : AMBIENT_EMOJI.bubbles;
        this.parts.push({ kind: 'emoji', e: es[(Math.random() * es.length) | 0],
          x: Math.random() * W, y: H + 24, vx: 0, vy: -H * (0.07 + Math.random() * 0.06),
          rot: (Math.random() - 0.5) * 0.5, vr: (Math.random() - 0.5) * 0.8, s: W * (0.028 + Math.random() * 0.03),
          life: 0, ttl: 9, sway: Math.random() * Math.PI * 2 });
      }
    }
  }
  private stepFx(dt: number) {
    this.emitAmbient(dt);
    if (!this.parts.length) return;
    const o = this.octx, W = this.canvas.width, H = this.canvas.height;
    const keep: FxParticle[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life > p.ttl) continue;
      p.vy += (p.kind === 'rect' ? H * 0.02 : p.vy < 0 ? H * 0.09 : 0) * dt; // gravity on bursts/confetti
      p.x += (p.vx + Math.sin(p.life * 2.2 + p.sway) * W * 0.02) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y < -60 || p.y > H + 80) continue;
      const fade = Math.min(1, Math.min(p.life / 0.18, (p.ttl - p.life) / 0.5));
      o.save();
      o.globalAlpha = Math.max(0, fade);
      o.translate(p.x, p.y); o.rotate(p.rot);
      if (p.kind === 'rect') { o.fillStyle = p.color!; o.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
      else { o.font = `${Math.round(p.s)}px serif`; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(p.e!, 0, 0); }
      o.restore();
      keep.push(p);
    }
    this.parts = keep;
  }

  private loop = () => {
    try {
      const t = performance.now();
      const dt = Math.min(0.05, this.lastFxT ? (t - this.lastFxT) / 1000 : 0.016);
      this.lastFxT = t;
      this.draw(); this.present(); this.stepFx(dt);
    } catch { /* keep alive */ }
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0;
    this.releaseVtuber();
    this.releaseFront(); this.releaseRear(); this.releaseScreen();
    this.out?.getTracks().forEach(t => t.stop()); this.out = null;
    try { this.seg?.close?.(); } catch { /* */ }
    this.seg = null;
    if (this.gl) { if (this.lut3d) this.gl.deleteTexture(this.lut3d); if (this.inTex) this.gl.deleteTexture(this.inTex); }
  }
}
