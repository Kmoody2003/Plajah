// lensEngine — real-time "snap-style" video lenses.
//
//   googly    — big plastic googly eyes pinned to every face (up to 2), pupils that SLOSH: they fall
//               with gravity and swing the opposite way when your head accelerates.
//   cardboard — South Park paper cut-out: you are a flat, thick-outlined cut-out on a flat mountain-town
//               backdrop, your head is one flat skin colour with oval eyes and a black FLAPPING mouth
//               driven by your real mouth, all in 12fps limited animation.
//   comic     — comic-book ink: posterised colour + hard ink lines + paper grain; with a person matte you
//               become a cream-bordered paper figure with a drop shadow.
//   bigface   — big eyes + big mouth: a magnifying bulge on each tracked face's eyes and mouth ONLY.
//   matrix    — falling glyph rain that reads through to the scene (bright where you are bright).
//
// One engine serves BOTH the broadcaster (LiveComposer applies it to the published frame) and any
// <video> (LensVideoOverlay, for viewers and players). The contract is deliberately tiny:
//
//     engine.apply(ctx, canvas, srcVideo, nowMs)
//
// `canvas` already holds the frame (the composer's work canvas, or the overlay with the video drawn
// into it); the lens rewrites it IN PLACE. That keeps the captured output a plain 2D canvas — the
// rule the composer follows because phones won't reliably captureStream a WebGL canvas — while the
// shader work happens on a private offscreen WebGL2 canvas that is blitted back the same task.
//
// Everything degrades instead of throwing: no WebGL2 → shader lenses pass through; no face model →
// googly eyes simply don't appear; no segmenter → cardboard renders without the cut-out.

import { AsyncFaceTracker } from '../vtuber/faceTrackerAsync';
import { FaceTracker, type FaceFrame } from '../vtuber/faceTracker';
import { DetectFeed } from '../vtuber/detectFeed';
import type { FaceEyes } from '../vtuber/eyeGeometry';
import { PersonMatte } from './personMatte';
import { EmotionSmoother, scoreEmotions, EMOTIONS, type AuraState, type EmotionId } from './emotion';
import { AuraOrbs, type Collect } from './auraOrbs';
import { LENS_VERT, MATRIX_FRAG, COMIC_FRAG, SOUTHPARK_FRAG, BIGFACE_FRAG, NIGHT_FRAG, HEAT_FRAG, AURA_FRAG } from './lensShaders';

export type LensId = 'none' | 'googly' | 'cardboard' | 'comic' | 'bigface' | 'matrix' | 'night' | 'heat' | 'aura';
export const LENSES: { id: LensId; label: string; icon: string; blurb: string }[] = [
  { id: 'none', label: 'Off', icon: '🚫', blurb: 'No lens' },
  { id: 'googly', label: 'Googly eyes', icon: '👀', blurb: 'Wobbly plastic eyes' },
  { id: 'bigface', label: 'Big eyes & mouth', icon: '🤪', blurb: 'Faces only — goofy caricature' },
  { id: 'cardboard', label: 'South Park', icon: '✂️', blurb: 'Flat paper cut-out, flappy mouth' },
  { id: 'comic', label: 'Comic book', icon: '💥', blurb: 'Bold ink + flat colour' },
  { id: 'matrix', label: 'The Matrix', icon: '🟩', blurb: '3D digital rain' },
  { id: 'night', label: 'Night vision', icon: '🌙', blurb: 'Goggle phosphor + grain' },
  { id: 'heat', label: 'Heat map', icon: '🔥', blurb: 'Thermal camera' },
  { id: 'aura', label: 'Aura', icon: '🔮', blurb: 'Emotion glow + orbs to collect' },
];

type Fit = 'cover' | 'contain';
type ShaderLens = 'matrix' | 'comic' | 'southpark' | 'bigface' | 'night' | 'heat' | 'aura';
const FRAGS: Record<ShaderLens, string> = { matrix: MATRIX_FRAG, comic: COMIC_FRAG, southpark: SOUTHPARK_FRAG, bigface: BIGFACE_FRAG, night: NIGHT_FRAG, heat: HEAT_FRAG, aura: AURA_FRAG };
const UNIFORMS = ['uTex', 'uGlyph', 'uMask', 'uRes', 'uT', 'uCell', 'uBoil', 'uHasMask', 'uMapA', 'uMapB', 'uHead', 'uSkin', 'uHeadOn', 'uBulge', 'uN', 'uAuraA', 'uAuraB', 'uAuraAmt'];
const MIP_KINDS: ShaderLens[] = ['southpark', 'matrix', 'night', 'heat', 'aura'];
interface Prog { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

/** Where a (vw×vh) video lands on a (W×H) canvas: x_px = x_norm·vw·s + ox. Same form for cover/contain. */
function placement(W: number, H: number, vw: number, vh: number, fit: Fit) {
  const s = fit === 'cover' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
  return { s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2 };
}

// ── googly eye state ──────────────────────────────────────────────────────────
interface Eye {
  x: number; y: number; r: number;            // smoothed centre + radius (canvas px)
  tx: number; ty: number; tr: number;         // latest detection
  vx: number; vy: number; ax: number; ay: number; // frame velocity / low-passed acceleration (px/s, px/s²)
  px: number; py: number; pvx: number; pvy: number; // pupil, in unit-disc space
  gx: number; gy: number; tgx: number; tgy: number;  // iris gaze offset (eye-widths) — South Park pupils
}
/** Mouth centre/width (canvas px) + how open it is (inner-lip gap / width). */
interface Mouth { x: number; y: number; w: number; open: number; tx: number; ty: number; tw: number; topen: number }
/** Head oval (canvas px): centre + radii. */
interface Head { x: number; y: number; rx: number; ry: number; tx: number; ty: number; trx: number; try_: number }
interface Track { cx: number; cy: number; eyes: [Eye, Eye]; mouth: Mouth; head: Head; seen: number; alpha: number }
const newEye = (x: number, y: number, r: number, gx = 0, gy = 0): Eye =>
  ({ x, y, r, tx: x, ty: y, tr: r, vx: 0, vy: 0, ax: 0, ay: 0, px: 0, py: 0.5, pvx: 0, pvy: 0, gx, gy, tgx: gx, tgy: gy });

const PUPIL = 0.44;                       // pupil radius ÷ eye radius
const REACH = 1 - PUPIL;                  // how far the pupil centre may roam
const GRAVITY = 26;                       // eye-radii / s²
const BOUNCE = 0.55, DRAG = 1.3;

export class LensEngine {
  private lens: LensId = 'none';
  private note = '';

  // ── GL (shader lenses) ──
  private glc = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null = null;
  private progs: Partial<Record<ShaderLens, Prog>> = {};
  private quad: WebGLBuffer | null = null;
  private srcTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private glyphTex: WebGLTexture | null = null;
  private maskStamp = -1;
  private tainted = false;                // cross-origin video: the GPU can't read it, lens passes through

  // ── face (googly) ──
  private worker = new AsyncFaceTracker();
  private sync: FaceTracker | null = null;
  private faceBlend = false;                 // tracker was started WITH blendshapes (aura needs them)

  // ── aura: estimated emotion -> colours, plus the collectible orbs ──
  private emotion = new EmotionSmoother();
  private orbs = new AuraOrbs();
  private auraState: AuraState = this.emotion.get();
  private feed = new DetectFeed();
  private faceState: 'idle' | 'loading' | 'worker' | 'sync' | 'failed' = 'idle';
  private lastSend = -1e9; private lastTs = -1; private lastSync = -1e9;
  private tracks: Track[] = [];
  private lastApply = 0;

  // ── matte (comic / cardboard) ──
  private matte = new PersonMatte();

  // ── South Park limited animation: the whole frame re-renders ~12x/s and is held in between ──
  private hold = document.createElement('canvas');
  private holdAt = 0;

  constructor() { this.initGL(); }

  getLens() { return this.lens; }
  /** Short human-readable state for diagnostics / a status pill ('' when all is well). */
  getStatus(): string {
    if (this.lens === 'none') return '';
    if (this.tainted && this.lens !== 'googly') return 'this video blocks filters (cross-origin)';
    if (this.lens !== 'googly' && !this.gl) return 'GPU filters unavailable on this device';
    if (this.lens === 'googly' || this.lens === 'cardboard' || this.lens === 'bigface' || this.lens === 'aura') {
      if (this.faceState === 'loading') return 'loading face tracker…';
      if (this.faceState === 'failed') return 'face tracker unavailable on this device';
      if (this.tracks.length === 0) return 'looking for a face…';
    }
    if ((this.lens === 'cardboard' || this.lens === 'comic') && this.matte.state === 'loading') return 'loading cut-out model…';
    return this.note;
  }

  setLens(id: LensId) {
    if (id === this.lens) return;
    this.lens = id;
    this.note = '';
    if (id === 'googly' || id === 'cardboard' || id === 'bigface' || id === 'aura') this.startFace(id === 'aura');   // all need eyes/mouth; aura also expressions
    if (id === 'cardboard' || id === 'comic' || id === 'matrix' || id === 'heat' || id === 'aura') void this.matte.init();
    if (id !== 'googly' && id !== 'cardboard' && id !== 'bigface' && id !== 'aura') this.tracks = [];
    if (id !== 'aura') this.orbs.reset();
    this.holdAt = 0;
  }

  // ───────────────────────────── GL ─────────────────────────────
  private initGL() {
    try {
      const gl = this.glc.getContext('webgl2', { alpha: false, preserveDrawingBuffer: false, premultipliedAlpha: false, antialias: false });
      if (!gl) throw new Error('no webgl2');
      this.glc.addEventListener('webglcontextlost', e => { e.preventDefault(); this.gl = null; this.progs = {}; }, false);
      this.glc.addEventListener('webglcontextrestored', () => { this.initGL(); }, false);
      const buf = gl.createBuffer(); this.quad = buf; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const mkTex = (filter: number) => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.srcTex = mkTex(gl.LINEAR);
      this.maskTex = mkTex(gl.LINEAR);
      this.maskStamp = -1;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.glyphTex = null;
      this.gl = gl;
    } catch (e) {
      console.warn('[lens] WebGL2 unavailable — shader lenses pass through:', e);
      this.gl = null;
    }
  }

  private program(kind: ShaderLens): Prog | null {
    const gl = this.gl; if (!gl) return null;
    const have = this.progs[kind]; if (have) return have;
    try {
      const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, LENS_VERT); gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, FRAGS[kind]); gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs) || 'fragment shader');
      const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'p');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of UNIFORMS) u[n] = gl.getUniformLocation(prog, n);
      return (this.progs[kind] = { prog, u });
    } catch (e) {
      console.warn(`[lens] ${kind} shader failed:`, e);
      this.gl = null; // don't retry a broken GPU every frame
      return null;
    }
  }

  /** Katakana + digits atlas (8×8) for the Matrix rain, drawn once. */
  private ensureGlyphs() {
    const gl = this.gl; if (!gl || this.glyphTex) return;
    const S = 512, C = S / 8;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d')!;
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${Math.round(C * 0.78)}px "MS Gothic","Noto Sans Mono CJK JP","Noto Sans JP","Hiragino Kaku Gothic ProN",monospace`;
    const chars: string[] = [];
    for (let k = 0xff66; k <= 0xff9d; k++) chars.push(String.fromCharCode(k));   // half-width katakana
    for (const d of '0123456789') chars.push(d);
    chars.slice(0, 64).forEach((ch, i) => x.fillText(ch, (i % 8) * C + C / 2, Math.floor(i / 8) * C + C / 2 + 2));
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.glyphTex = t;
  }

  /** Upload the latest person matte on texture `unit` and set the mask uniforms (+ canvas to video uv map). */
  private bindMatte(P: Prog, src: HTMLVideoElement, W: number, H: number, nowMs: number, fit: Fit, unit: number) {
    const gl = this.gl!;
    const m = this.matte.update(src, nowMs);
    const has = !!m && m.w > 0;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    if (has && m!.stamp !== this.maskStamp) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m!.w, m!.h, 0, gl.RED, gl.UNSIGNED_BYTE, m!.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.maskStamp = m!.stamp;
    }
    gl.uniform1i(P.u.uMask, unit);
    gl.uniform1f(P.u.uHasMask, has ? 1 : 0);
    // canvas uv to video uv, so the matte lines up with however the video was cropped onto the canvas
    const vw = src.videoWidth || W, vh = src.videoHeight || H;
    const pl = placement(W, H, vw, vh, fit);
    gl.uniform2f(P.u.uMapA, W / (vw * pl.s), H / (vh * pl.s));
    gl.uniform2f(P.u.uMapB, -pl.ox / (vw * pl.s), -pl.oy / (vh * pl.s));
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Aura colours: driven by the emotion layer; neutral violet/teal until a face is read. */
  private auraA: [number, number, number] = [0.48, 0.36, 1];
  private auraB: [number, number, number] = [0.18, 0.9, 0.84];
  private auraAmt = 0.3;
  private setAuraUniforms(P: Prog) {
    const gl = this.gl!;
    gl.uniform3f(P.u.uAuraA, ...this.auraA); gl.uniform3f(P.u.uAuraB, ...this.auraB); gl.uniform1f(P.u.uAuraAmt, this.auraAmt);
  }

  private shade(kind: ShaderLens, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, src: HTMLVideoElement, nowMs: number, fit: Fit) {
    const gl = this.gl; if (!gl || this.tainted) return;
    const P = this.program(kind); if (!P || !this.gl) return;
    const W = canvas.width, H = canvas.height;
    if (this.glc.width !== W || this.glc.height !== H) { this.glc.width = W; this.glc.height = H; }
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); }
    catch { this.tainted = true; return; }          // SecurityError: cross-origin video
    // lenses that sample blurred MIP levels (flat colour, local contrast, bloom); the rest read level 0
    if (MIP_KINDS.includes(kind)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.uniform1i(P.u.uTex, 0);
    gl.uniform2f(P.u.uRes, W, H);

    gl.uniform1f(P.u.uT, nowMs / 1000);
    if (kind === 'matrix') {
      this.ensureGlyphs();
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
      gl.uniform1i(P.u.uGlyph, 1);
      gl.uniform1f(P.u.uCell, Math.max(7, Math.round(W / 66)));
      this.bindMatte(P, src, W, H, nowMs, fit, 2);        // unit 2: the glyph atlas holds unit 1
    } else if (kind === 'bigface') {
      // up to 3 faces x (2 eyes + mouth). Radii follow the face's own scale; the mouth swells further as it opens.
      const b = new Float32Array(36); let n = 0;
      for (const t of this.tracks) {
        if (t.alpha < 0.3 || n > 6) continue;
        const k = Math.min(1, t.alpha);
        for (const e of t.eyes) b.set([e.x, e.y, Math.max(6, e.r * 2.3), 0.72 * k], 4 * n++);
        const m = t.mouth;
        b.set([m.x, m.y, Math.max(8, m.w * (0.95 + m.open * 0.5)), (0.5 + Math.min(0.2, m.open * 0.6)) * k], 4 * n++);
      }
      gl.uniform4fv(P.u.uBulge, b); gl.uniform1i(P.u.uN, n);
    } else if (kind !== 'night') {                       // comic, southpark, heat, aura all want the person matte
      this.bindMatte(P, src, W, H, nowMs, fit, 1);
      gl.uniform1f(P.u.uBoil, Math.floor(nowMs / 83));   // ~12 fps stop-motion
      if (kind === 'southpark') {
        const heads = new Float32Array(8), skins = new Float32Array(4), on = new Float32Array(2);
        this.tracks.filter(t => t.alpha > 0.3).slice(0, 2).forEach((t, i) => {
          heads.set([t.head.x, t.head.y, Math.max(8, t.head.rx), Math.max(8, t.head.ry)], i * 4);
          // skin tone is read at the nose: halfway between the eyes and the mouth
          const ex = (t.eyes[0].x + t.eyes[1].x) / 2, ey = (t.eyes[0].y + t.eyes[1].y) / 2;
          skins.set([((ex + t.mouth.x) / 2) / W, ((ey + t.mouth.y) / 2) / H], i * 2);
          on[i] = 1;
        });
        gl.uniform4fv(P.u.uHead, heads); gl.uniform2fv(P.u.uSkin, skins); gl.uniform1fv(P.u.uHeadOn, on);
      }
      if (kind === 'aura') this.setAuraUniforms(P);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ctx.drawImage(this.glc, 0, 0, W, H);            // same-task blit: spec-guaranteed to see this frame
  }

  // ───────────────────────────── googly eyes ─────────────────────────────
  private startFace(blend = false) {
    // Started without expressions but the aura now needs them: rebuild the tracker with the fuller graph.
    if (blend && !this.faceBlend && (this.faceState === 'worker' || this.faceState === 'sync' || this.faceState === 'failed')) {
      this.worker.dispose(); this.worker = new AsyncFaceTracker();
      try { this.sync?.dispose(); } catch { /* */ }
      this.sync = null; this.faceState = 'idle';
    }
    if (this.faceState !== 'idle') return;
    this.faceState = 'loading';
    this.faceBlend = blend;
    const opts = { numFaces: 2, blendshapes: blend };       // landmarks only unless asked: cheaper graph on phones
    this.worker.init(opts).then(async ok => {
      if (ok) { this.faceState = 'worker'; return; }
      const s = new FaceTracker();
      if (await s.init(opts)) { this.sync = s; this.faceState = 'sync'; } else this.faceState = 'failed';
    });
  }

  private feedFaces(src: HTMLVideoElement, nowMs: number, W: number, H: number, fit: Fit) {
    if (src.readyState < 2 || !src.videoWidth) return;
    const gap = isAndroid() ? 1000 / 18 : 1000 / 30;
    let frame: FaceFrame | null = null, fresh = false;
    if (this.faceState === 'worker') {
      if (nowMs - this.lastSend >= gap) {
        this.lastTs = Math.max(this.lastTs + 1, Math.round(nowMs));
        this.worker.send(this.feed.src(src), this.lastTs);
        this.lastSend = nowMs;
      }
      const r = this.worker.poll(); fresh = r.fresh; frame = r.frame;
    } else if (this.faceState === 'sync' && this.sync && nowMs - this.lastSync >= 100) {
      this.lastTs = Math.max(this.lastTs + 1, Math.round(nowMs));
      frame = this.sync.detect(this.feed.src(src), this.lastTs);
      this.lastSync = nowMs; fresh = true;
    }
    if (!fresh) return;
    if (this.lens === 'aura') this.emotion.push(frame && Object.keys(frame.blendshapes).length ? scoreEmotions(frame.blendshapes) : null, gap / 1000);
    this.ingest(frame?.faces ?? [], src, nowMs, W, H, fit);
  }

  private ingest(faces: FaceEyes[], src: HTMLVideoElement, nowMs: number, W: number, H: number, fit: Fit) {
    const vw = src.videoWidth, vh = src.videoHeight;
    const pl = placement(W, H, vw, vh, fit);
    const used = new Set<Track>();
    for (const f of faces) {
      const eyes = f.eyes.map(e => ({
        x: e.cx * vw * pl.s + pl.ox, y: e.cy * vh * pl.s + pl.oy,
        // true eye width in canvas px, then enlarged: googly eyes are meant to be absurd
        r: Math.hypot(e.dx * vw, e.dy * vh) * pl.s * 0.95,
        gx: e.gx, gy: e.gy,
      }));
      const m = f.mouth, bb = f.bbox;
      const mouth = { x: m.cx * vw * pl.s + pl.ox, y: m.cy * vh * pl.s + pl.oy, w: Math.hypot(m.dx * vw, m.dy * vh) * pl.s, open: m.open };
      const head = {
        x: (bb.x + bb.w / 2) * vw * pl.s + pl.ox, y: (bb.y + bb.h / 2) * vh * pl.s + pl.oy,
        rx: (bb.w * vw * pl.s / 2) * 1.02, ry: (bb.h * vh * pl.s / 2) * 1.05,
      };
      const cx = (eyes[0].x + eyes[1].x) / 2, cy = (eyes[0].y + eyes[1].y) / 2;
      let best: Track | null = null, bd = W * 0.3;
      for (const t of this.tracks) {
        if (used.has(t)) continue;
        const d = Math.hypot(t.cx - cx, t.cy - cy);
        if (d < bd) { bd = d; best = t; }
      }
      if (!best) {
        if (this.tracks.length >= 3) continue;
        best = {
          cx, cy, seen: nowMs, alpha: 0,
          eyes: [newEye(eyes[0].x, eyes[0].y, eyes[0].r, eyes[0].gx, eyes[0].gy), newEye(eyes[1].x, eyes[1].y, eyes[1].r, eyes[1].gx, eyes[1].gy)],
          mouth: { ...mouth, tx: mouth.x, ty: mouth.y, tw: mouth.w, topen: mouth.open },
          head: { ...head, tx: head.x, ty: head.y, trx: head.rx, try_: head.ry },
        };
        this.tracks.push(best);
      }
      used.add(best);
      best.cx = cx; best.cy = cy; best.seen = nowMs;
      best.eyes.forEach((ey, i) => { ey.tx = eyes[i].x; ey.ty = eyes[i].y; ey.tr = eyes[i].r; ey.tgx = eyes[i].gx; ey.tgy = eyes[i].gy; });
      best.mouth.tx = mouth.x; best.mouth.ty = mouth.y; best.mouth.tw = mouth.w; best.mouth.topen = mouth.open;
      best.head.tx = head.x; best.head.ty = head.y; best.head.trx = head.rx; best.head.try_ = head.ry;
    }
  }

  /** Per-frame smoothing for every tracked face (shared by all face lenses): eases the 15-30Hz
   *  detections into 30fps motion, derives eye acceleration for the pupil physics, fades/prunes tracks. */
  private stepTracks(dt: number, nowMs: number) {
    const kPos = 1 - Math.exp(-dt * 20), kMouth = 1 - Math.exp(-dt * 28);
    const keep: Track[] = [];
    for (const t of this.tracks) {
      const lost = nowMs - t.seen;
      t.alpha += ((lost < 350 ? 1 : 0) - t.alpha) * (1 - Math.exp(-dt * 10));
      if (lost > 900 && t.alpha < 0.02) continue;
      keep.push(t);
      for (const e of t.eyes) {
        const ox = e.x, oy = e.y;
        e.x += (e.tx - e.x) * kPos; e.y += (e.ty - e.y) * kPos; e.r += (e.tr - e.r) * kPos;
        e.gx += (e.tgx - e.gx) * kPos; e.gy += (e.tgy - e.gy) * kPos;
        // frame acceleration (low-passed, clamped: tracker jitter must not fling the pupils)
        const vx = (e.x - ox) / dt, vy = (e.y - oy) / dt;
        const ax = Math.max(-1, Math.min(1, ((vx - e.vx) / dt) / (e.r * 120)));
        const ay = Math.max(-1, Math.min(1, ((vy - e.vy) / dt) / (e.r * 120)));
        e.vx = vx; e.vy = vy;
        e.ax += (ax - e.ax) * 0.35; e.ay += (ay - e.ay) * 0.35;
      }
      const m = t.mouth;
      m.x += (m.tx - m.x) * kPos; m.y += (m.ty - m.y) * kPos; m.w += (m.tw - m.w) * kPos;
      m.open += (m.topen - m.open) * kMouth;           // a mouth must snap open/shut, not glide
      const h = t.head;
      h.x += (h.tx - h.x) * kPos; h.y += (h.ty - h.y) * kPos; h.rx += (h.trx - h.rx) * kPos; h.ry += (h.try_ - h.ry) * kPos;
    }
    this.tracks = keep;
  }

  private drawGoogly(ctx: CanvasRenderingContext2D, dt: number) {
    for (const t of this.tracks) {
      if (t.alpha < 0.02) continue;
      for (const e of t.eyes) {
        // pupil dynamics in the eye's own frame: gravity, minus the frame's acceleration (inertia)
        const aX = -e.ax * 120, aY = GRAVITY - e.ay * 120;
        e.pvx += aX * dt; e.pvy += aY * dt;
        const damp = Math.exp(-DRAG * dt); e.pvx *= damp; e.pvy *= damp;
        e.px += e.pvx * dt; e.py += e.pvy * dt;
        const d = Math.hypot(e.px, e.py);
        if (d > REACH) {                                   // hit the rim: reflect with loss
          const nx = e.px / d, ny = e.py / d;
          e.px = nx * REACH; e.py = ny * REACH;
          const vn = e.pvx * nx + e.pvy * ny;
          if (vn > 0) { e.pvx -= (1 + BOUNCE) * vn * nx; e.pvy -= (1 + BOUNCE) * vn * ny; }
        }
        if (e.r < 3) continue;
        this.paintEye(ctx, e, t.alpha);
      }
    }
  }

  /** South Park face parts, drawn over the flat skin patch the shader laid down: two wide oval eyes
   *  with tiny pupils that follow your gaze, and a black mouth flap that opens with your real mouth. */
  private paintSouthPark(c: CanvasRenderingContext2D) {
    for (const t of this.tracks) {
      if (t.alpha < 0.02) continue;
      c.save(); c.globalAlpha = t.alpha;
      for (const e of t.eyes) {
        const rx = e.r * 0.8, ry = rx * 1.22;
        if (rx < 3) continue;
        c.fillStyle = '#ffffff'; c.strokeStyle = '#070707'; c.lineWidth = Math.max(2, rx * 0.15);
        c.beginPath(); c.ellipse(e.x, e.y, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        const off = (v: number) => Math.max(-0.55, Math.min(0.55, v * 3));
        c.fillStyle = '#070707';
        c.beginPath(); c.arc(e.x + off(e.gx) * rx, e.y + off(e.gy) * ry, Math.max(1.5, rx * 0.17), 0, Math.PI * 2); c.fill();
      }
      const m = t.mouth, w = m.w * 1.2;
      if (w > 6) {
        const roll = Math.atan2(t.eyes[1].y - t.eyes[0].y, t.eyes[1].x - t.eyes[0].x);   // follow head tilt
        c.translate(m.x, m.y); c.rotate(roll);
        c.fillStyle = '#070707'; c.strokeStyle = '#070707';
        if (m.open < 0.07) {                               // closed: a short smile line
          c.lineWidth = Math.max(3, w * 0.075); c.lineCap = 'round';
          c.beginPath(); c.moveTo(-w / 2, 0); c.quadraticCurveTo(0, w * 0.16, w / 2, 0); c.stroke();
        } else {                                           // open: the cut-out flap - flat top, round bottom
          const h = Math.min(w * 0.95, m.open * w * 1.7), top = -h * 0.25;
          c.beginPath(); c.moveTo(-w / 2, top); c.lineTo(w / 2, top); c.ellipse(0, top, w / 2, h, 0, 0, Math.PI); c.closePath(); c.fill();
          if (h > w * 0.42) {                              // wide open: a flat pink tongue
            c.save(); c.clip();
            c.fillStyle = '#d9526b'; c.beginPath(); c.ellipse(0, top + h * 0.95, w * 0.3, h * 0.38, 0, 0, Math.PI * 2); c.fill();
            c.restore();
          }
        }
      }
      c.restore();
    }
  }

  private paintEye(c: CanvasRenderingContext2D, e: Eye, alpha: number) {
    const { x, y, r } = e;
    c.save();
    c.globalAlpha = alpha;
    // soft contact shadow so the eye sits ON the face rather than floating over it
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath(); c.ellipse(x + r * 0.07, y + r * 0.13, r * 1.04, r * 1.0, 0, 0, Math.PI * 2); c.fill();
    // plastic dome
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#f4f4f2'); g.addColorStop(1, '#cfcfcc');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = Math.max(1.5, r * 0.09); c.strokeStyle = '#141414'; c.stroke();
    // pupil + fixed (screen-space) specular so it always reads as a glossy bead
    const pr = r * PUPIL, px = x + e.px * r, py = y + e.py * r;
    c.fillStyle = '#0b0b0b';
    c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.arc(px - pr * 0.32, py - pr * 0.34, pr * 0.24, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ───────────────────────────── public ─────────────────────────────
  /**
   * Rewrite `canvas` in place with the active lens. `src` is the video the frame came from (face and
   * person detection read it directly). Call once per drawn frame, after the frame is composited.
   */
  apply(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, src: HTMLVideoElement, nowMs: number, fit: Fit = 'cover') {
    if (this.lens === 'none') return;
    const dt = Math.max(1 / 120, Math.min(0.1, this.lastApply ? (nowMs - this.lastApply) / 1000 : 1 / 30));
    this.lastApply = nowMs;
    ctx.globalAlpha = 1;
    const W = canvas.width, H = canvas.height;
    if (this.lens === 'googly') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      this.drawGoogly(ctx, dt);
    } else if (this.lens === 'aura') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      this.updateAura(nowMs);
      this.shade('aura', ctx, canvas, src, nowMs, fit);
      this.orbs.update(dt, nowMs);
      this.orbs.draw(ctx, W, H, nowMs);
      this.frameAspect = W / H;
    } else if (this.lens === 'bigface') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      if (this.tracks.some(t => t.alpha > 0.3)) this.shade('bigface', ctx, canvas, src, nowMs, fit);   // no face -> untouched
    } else if (this.lens === 'cardboard') {
      this.feedFaces(src, nowMs, W, H, fit);
      this.stepTracks(dt, nowMs);
      // limited animation: re-render ~12x/s, hold the last frame in between - the jerky cut-out feel
      const h = this.hold;
      if (h.width === W && h.height === H && this.holdAt && nowMs - this.holdAt < 83) { ctx.drawImage(h, 0, 0, W, H); return; }
      this.holdAt = nowMs;
      this.shade('southpark', ctx, canvas, src, nowMs, fit);
      if (!this.gl || this.tainted) return;                // shader unavailable -> leave the plain frame
      this.paintSouthPark(ctx);
      if (h.width !== W || h.height !== H) { h.width = W; h.height = H; }
      h.getContext('2d')!.drawImage(canvas, 0, 0, W, H);
    } else {
      this.shade(this.lens, ctx, canvas, src, nowMs, fit);
    }
  }

  // ───────────────────────────── aura API ─────────────────────────────
  private frameAspect = 9 / 16;
  /** Fold the smoothed emotion (and a brief tint from the last collected orb) into the shader colours. */
  private updateAura(nowMs: number) {
    const st = (this.auraState = this.emotion.get());
    let a = st.a, b = st.b, amt = st.intensity;
    const lc = this.orbs.lastCollect;
    if (lc && nowMs - lc.at < 2200) {                    // collecting an orb washes its colour through your aura
      const k = (1 - (nowMs - lc.at) / 2200) * 0.7, c = EMOTIONS[lc.emo];
      a = a.map((v, i) => v + (c.a[i] - v) * k) as typeof a; b = b.map((v, i) => v + (c.b[i] - v) * k) as typeof b;
      amt = Math.min(1, amt + k * 0.6);
    }
    this.auraA = a as [number, number, number]; this.auraB = b as [number, number, number]; this.auraAmt = amt;
  }
  /** A tap on the frame (normalized 0..1). Returns true if it collected an orb. `who` = the tapper's name. */
  tap(nx: number, ny: number, who: string): boolean {
    return this.lens === 'aura' ? this.orbs.tap(nx, ny, who, this.frameAspect, performance.now()) : false;
  }
  setOrbListener(cb: ((c: Collect) => void) | undefined) { this.orbs.onCollect = cb; }
  getAuraInfo() {
    const st = this.auraState, e = EMOTIONS[st.dominant];
    return { emotion: st.dominant as EmotionId, label: e.label, icon: e.icon, intensity: st.intensity, leaderboard: this.orbs.leaderboard(5), orbsOnScreen: this.orbs.orbs.length };
  }

  dispose() {
    this.worker.dispose();
    try { this.sync?.dispose(); } catch { /* */ }
    this.matte.dispose();
    const gl = this.gl;
    if (gl) {
      for (const t of [this.srcTex, this.maskTex, this.glyphTex]) if (t) gl.deleteTexture(t);
      for (const p of Object.values(this.progs)) if (p) gl.deleteProgram(p.prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null; this.progs = {}; this.tracks = [];
  }
}
