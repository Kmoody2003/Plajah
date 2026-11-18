// Themed Shows — the finishing pass: the platform's cinematic LUTs and lenses.
//
// Runs after a frame's picture is drawn and BEFORE its text (captions, title cards, chapter
// lines, fades), so a grade or lens never touches the words. A look can be set for the whole
// show and overridden per photo; the renderer passes the look of the shot on screen.
//
//   LUT  — services/color/cinematicLutLibrary (the same library as Go Live, Reello, Cinema),
//          baked into a 17³ 3D texture and applied on the GPU with a strength mix.
//   Lens — services/lenses LensEngine (the same lenses as the live/Reello pickers), run on the
//          rendered picture each frame, so grain, VHS noise etc. stay alive.

import * as THREE from 'three';
import { applyLutToRgba, getLutById } from '../color/cinematicLutLibrary';
import type { ShowLook, ShowPhoto, ShowSpec } from './types';

/** The look in force for a shot: the photo's own, else the show's. */
export function lookFor(spec: ShowSpec, photo?: ShowPhoto | null): ShowLook | null {
  const own = photo?.look;
  const show = spec.look;
  if (own && (own.lut || (own.lens && own.lens !== 'none'))) return own;
  return show && (show.lut || (show.lens && show.lens !== 'none')) ? show : null;
}

const N = 17;
const lutCache = new Map<string, THREE.Data3DTexture>();
function lutTexture(id: string): THREE.Data3DTexture | null {
  let t = lutCache.get(id);
  if (t) return t;
  const lut = getLutById(id);
  if (!lut) return null;
  const data = new Uint8ClampedArray(N * N * N * 4);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const i = ((b * N + g) * N + r) * 4;
    data[i] = Math.round((r / (N - 1)) * 255); data[i + 1] = Math.round((g / (N - 1)) * 255); data[i + 2] = Math.round((b / (N - 1)) * 255); data[i + 3] = 255;
  }
  applyLutToRgba(data, lut, 1);
  t = new THREE.Data3DTexture(new Uint8Array(data.buffer), N, N, N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapR = t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  lutCache.set(id, t);
  return t;
}

const FS = `precision highp float; precision highp sampler3D;
uniform sampler2D uSrc; uniform sampler3D uLut; uniform float uHasLut; uniform float uStrength; uniform float uFlipY;
varying vec2 vUv;
void main(){
  vec2 uv = vec2(vUv.x, uFlipY > 0.5 ? 1.0 - vUv.y : vUv.y);
  vec4 c = texture2D(uSrc, uv);
  if (uHasLut > 0.5) {
    vec3 g = texture(uLut, c.rgb * (${N - 1}.0 / ${N}.0) + 0.5 / ${N}.0).rgb;
    c.rgb = mix(c.rgb, g, uStrength);
  }
  gl_FragColor = vec4(c.rgb, 1.0);
}`;

type LensEngineT = import('../lenses/lensEngine').LensEngine;

export class FinishPass {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private fbTex: THREE.FramebufferTexture | null = null;
  private lensCanvas = document.createElement('canvas');
  private lensCtx = this.lensCanvas.getContext('2d')!;
  private lensTex = new THREE.CanvasTexture(this.lensCanvas);
  private lens: LensEngineT | null = null;
  private lensLoading: Promise<void> | null = null;
  private lensId = 'none';
  private proxy: any = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSrc: { value: null }, uLut: { value: null }, uHasLut: { value: 0 }, uStrength: { value: 1 }, uFlipY: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FS, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.lensTex.minFilter = THREE.LinearFilter;
    this.lensTex.generateMipmaps = false;
  }

  /** Load what a look needs (the lens engine is big; it loads only when a lens is used). */
  async prepare(look: ShowLook | null) {
    if (look?.lut) lutTexture(look.lut);
    if (look?.lens && look.lens !== 'none' && !this.lens) {
      this.lensLoading ??= import('../lenses/lensEngine').then((m) => { this.lens = new m.LensEngine({ models: true }); });
      await this.lensLoading;
    }
  }

  /** Grade the picture already drawn on the canvas. Call before drawing the text. */
  apply(look: ShowLook | null, nowMs: number) {
    if (!look) return;
    const wantLens = !!look.lens && look.lens !== 'none';
    const lut = look.lut ? lutTexture(look.lut) : null;
    if (!wantLens && !lut) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const W = Math.max(2, size.x), H = Math.max(2, size.y);
    let src: THREE.Texture;
    let flip = 0;
    if (wantLens && this.lens) {
      if (this.lensId !== look.lens) { this.lens.setLens(look.lens as any); this.lensId = look.lens!; }
      if (this.lensCanvas.width !== W || this.lensCanvas.height !== H) { this.lensCanvas.width = W; this.lensCanvas.height = H; }
      const gl = r.domElement;
      // the lens engine reads a <video>; the rendered canvas stands in for one
      if (!this.proxy || this.proxy.__c !== gl) {
        this.proxy = gl;
        Object.defineProperty(gl, 'videoWidth', { configurable: true, get: () => gl.width });
        Object.defineProperty(gl, 'videoHeight', { configurable: true, get: () => gl.height });
        Object.defineProperty(gl, 'readyState', { configurable: true, get: () => 4 });
        (gl as any).__c = gl;
      }
      this.lensCtx.drawImage(gl, 0, 0, W, H);
      this.lens.apply(this.lensCtx, this.lensCanvas, gl as unknown as HTMLVideoElement, nowMs, 'cover');
      this.lensTex.needsUpdate = true;
      src = this.lensTex;
      flip = 0;
    } else {
      if (wantLens && !this.lens) void this.prepare(look); // live: load now, apply from the next frames
      if (!lut) return;
      if (!this.fbTex || this.fbTex.image.width !== W || this.fbTex.image.height !== H) {
        this.fbTex?.dispose();
        this.fbTex = new THREE.FramebufferTexture(W, H);
      }
      r.copyFramebufferToTexture(this.fbTex);
      src = this.fbTex;
      flip = 0;
    }
    const u = this.mat.uniforms;
    u.uSrc.value = src;
    u.uLut.value = lut;
    u.uHasLut.value = lut ? 1 : 0;
    u.uStrength.value = Math.max(0, Math.min(1, look.lutStrength ?? 1));
    u.uFlipY.value = flip;
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(this.scene, this.cam);
    r.autoClear = auto;
  }

  dispose() {
    this.fbTex?.dispose();
    this.lensTex.dispose();
    this.mat.dispose();
    this.lens?.dispose();
  }
}
