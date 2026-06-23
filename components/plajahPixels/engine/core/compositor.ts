// Compositor — the single-surface GPU compositor at the heart of Pixels Core.
//
// Replaces the old DOM stack of ~15 CSS `mix-blend-mode` layers. Every layer is a
// texture; layers are blended top-over-bottom into a ping-pong accumulator with
// per-layer opacity + blend mode evaluated in one GLSL pass, then presented to a
// single canvas in one vsync-locked draw (which is what fixes the tearing). Post-FX
// (slice / mirror / grade …) run as ordered full-screen passes over the composite.
//
// WRAP-FIRST: callers can hand in either a ready WebGLTexture (a ported GLSL
// generator rendering straight into our context) or a DOM element (video / image /
// canvas) which we upload to a texture each frame. So we get the single-present win
// immediately, and port generators to native passes incrementally.

import { GL, RenderTarget, createGL, createProgram, createFullscreenQuad, makeTarget, makeSourceTexture, uploadElement } from './glUtil';

// Blend-mode index — must match the switch in COMPOSITE_FS below.
export const BLEND_INDEX: Record<string, number> = {
  normal: 0, screen: 1, add: 2, multiply: 3, overlay: 4,
  lighten: 5, darken: 6, difference: 7, exclusion: 8, 'color-dodge': 9, 'hard-light': 10,
};

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Composite one source layer over the accumulator with a blend mode + opacity.
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uDst;   // accumulator (what's already composited)
uniform sampler2D uSrc;   // this layer
uniform float uOpacity;
uniform int uMode;
uniform vec2 uTrans;      // per-layer translate (UV fraction); 0 = none
uniform float uScale;     // per-layer scale; 1 = none
uniform float uRot;       // per-layer rotation (radians); 0 = none

vec3 blend(int m, vec3 d, vec3 s) {
  if (m == 1) return d + s - d * s;                 // screen
  if (m == 2) return min(d + s, vec3(1.0));         // add (plus-lighter)
  if (m == 3) return d * s;                         // multiply
  if (m == 4) return mix(2.0*d*s, 1.0-2.0*(1.0-d)*(1.0-s), step(0.5, d)); // overlay
  if (m == 5) return max(d, s);                     // lighten
  if (m == 6) return min(d, s);                     // darken
  if (m == 7) return abs(d - s);                    // difference
  if (m == 8) return d + s - 2.0*d*s;               // exclusion
  if (m == 9) return min(vec3(1.0), d / max(1.0 - s, 1e-4)); // color-dodge
  if (m == 10) return mix(2.0*d*s, 1.0-2.0*(1.0-d)*(1.0-s), step(0.5, s)); // hard-light
  return s;                                         // normal
}

void main() {
  // Per-layer transform: rotate + scale about centre, then translate. Identity
  // (uTrans=0,uScale=1,uRot=0) reduces to suv == vUv. Outside [0,1] → transparent
  // so a moved/scaled layer reveals what's beneath it.
  vec2 suv = vUv - 0.5;
  float cs = cos(uRot), sn = sin(uRot);
  suv = mat2(cs, sn, -sn, cs) * suv;
  suv = suv / max(uScale, 1e-3);
  suv += 0.5 - uTrans;
  float inb = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec4 dst = texture(uDst, vUv);
  vec4 src = texture(uSrc, clamp(suv, 0.0, 1.0)) * inb;
  float a = src.a * uOpacity;
  vec3 blended = blend(uMode, dst.rgb, src.rgb);
  outColor = vec4(mix(dst.rgb, blended, a), clamp(dst.a + a, 0.0, 1.0));
}`;

// Final present pass — also applies the camera-shake transform, so the shake is
// baked into the actual output pixels (captured by captureStream recording and the
// offline render), not a CSS transform that only the live page sees. Identity by
// default (off=0, sin=0, cos=1, scale=1) → exact passthrough.
const PRESENT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uShakeOff;
uniform float uShakeSin, uShakeCos, uShakeScale;
void main() {
  vec2 uv = vUv - 0.5;
  uv = mat2(uShakeCos, -uShakeSin, uShakeSin, uShakeCos) * uv; // rotate about centre
  uv = uv / uShakeScale + 0.5 + uShakeOff;                     // overscan + translate
  outColor = vec4(texture(uTex, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}`;

// Global color grade — the first post-FX pass over the whole composite.
const GRADE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform float uBright, uContrast, uSat, uGamma;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c = (c - 0.5) * uContrast + 0.5;            // contrast around mid-grey
  c *= uBright;                                // brightness
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);                   // saturation
  c = pow(max(c, 0.0), vec3(1.0 / max(uGamma, 0.01))); // gamma
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export interface GradeParams { brightness: number; contrast: number; saturation: number; gamma: number; }
const NEUTRAL_GRADE: GradeParams = { brightness: 1, contrast: 1, saturation: 1, gamma: 1 };
function isNeutral(g: GradeParams): boolean {
  return g.brightness === 1 && g.contrast === 1 && g.saturation === 1 && g.gamma === 1;
}

export interface LayerInput {
  /** A texture already in our GL context (ported generator) … */
  texture?: WebGLTexture;
  /** … or a DOM element to upload this frame (wrap-first bridge). */
  element?: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  opacity: number;
  blendMode: string;
  /** Per-layer transform: translate (UV fraction), scale, rotation (radians). */
  transform?: { x: number; y: number; scale: number; rot: number };
}

/** Camera-shake transform applied in the present pass (UV space). Identity = no shake. */
export interface ShakeParams { offX: number; offY: number; sin: number; cos: number; scale: number; }
const NO_SHAKE: ShakeParams = { offX: 0, offY: 0, sin: 0, cos: 1, scale: 1 };

export class Compositor {
  readonly gl: GL;
  private quad: WebGLVertexArrayObject;
  private compositeProg: WebGLProgram;
  private presentProg: WebGLProgram;
  private gradeProg: WebGLProgram;
  private uDst: WebGLUniformLocation; private uSrc: WebGLUniformLocation;
  private uOpacity: WebGLUniformLocation; private uMode: WebGLUniformLocation;
  private uTrans: WebGLUniformLocation | null; private uScale: WebGLUniformLocation | null; private uRot: WebGLUniformLocation | null;
  private uPresentTex: WebGLUniformLocation;
  private uShake: Record<string, WebGLUniformLocation | null> = {};
  private gradeU: Record<string, WebGLUniformLocation | null> = {};
  private ping?: RenderTarget; private pong?: RenderTarget;
  private srcTex: WebGLTexture;       // reused for element uploads
  private width = 0; private height = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = createGL(canvas);
    if (!gl) throw new Error('[PixelsCore] WebGL2 unavailable');
    this.gl = gl;
    this.quad = createFullscreenQuad(gl);
    this.compositeProg = createProgram(gl, QUAD_VS, COMPOSITE_FS);
    this.presentProg = createProgram(gl, QUAD_VS, PRESENT_FS);
    this.gradeProg = createProgram(gl, QUAD_VS, GRADE_FS);
    this.uDst = gl.getUniformLocation(this.compositeProg, 'uDst')!;
    this.uSrc = gl.getUniformLocation(this.compositeProg, 'uSrc')!;
    this.uOpacity = gl.getUniformLocation(this.compositeProg, 'uOpacity')!;
    this.uMode = gl.getUniformLocation(this.compositeProg, 'uMode')!;
    this.uTrans = gl.getUniformLocation(this.compositeProg, 'uTrans');
    this.uScale = gl.getUniformLocation(this.compositeProg, 'uScale');
    this.uRot = gl.getUniformLocation(this.compositeProg, 'uRot');
    this.uPresentTex = gl.getUniformLocation(this.presentProg, 'uTex')!;
    for (const n of ['uShakeOff', 'uShakeSin', 'uShakeCos', 'uShakeScale'])
      this.uShake[n] = gl.getUniformLocation(this.presentProg, n);
    for (const n of ['uTex', 'uBright', 'uContrast', 'uSat', 'uGamma'])
      this.gradeU[n] = gl.getUniformLocation(this.gradeProg, n);
    this.srcTex = makeSourceTexture(gl);
  }

  /** Resize internal targets + canvas backing store (capped to a 1080p-class target). */
  resize(w: number, h: number) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.width && h === this.height && this.ping) return;
    this.width = w; this.height = h;
    (this.canvas as any).width = w; (this.canvas as any).height = h;
    this.ping = makeTarget(this.gl, w, h, this.ping);
    this.pong = makeTarget(this.gl, w, h, this.pong);
  }

  /** Composite an ordered list of layers (index 0 = bottom) into the accumulator. */
  composite(layers: LayerInput[]) {
    const gl = this.gl;
    if (!this.ping || !this.pong) return;
    gl.bindVertexArray(this.quad);
    gl.disable(gl.BLEND); // blending happens in-shader against the accumulator

    // Clear the accumulator (ping) to opaque black.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ping.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.compositeProg);
    gl.uniform1i(this.uDst, 0);
    gl.uniform1i(this.uSrc, 1);

    for (const layer of layers) {
      // Resolve the source texture (ported texture, or upload an element).
      let src: WebGLTexture | null = null;
      if (layer.texture) {
        src = layer.texture;
      } else if (layer.element) {
        if (uploadElement(gl, this.srcTex, layer.element)) src = this.srcTex;
      }
      if (!src) continue;

      // dst=ping → render blended into pong, then swap.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pong.fbo);
      gl.viewport(0, 0, this.width, this.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1f(this.uOpacity, Math.max(0, Math.min(1, layer.opacity)));
      gl.uniform1i(this.uMode, BLEND_INDEX[layer.blendMode?.toLowerCase()] ?? 0);
      const tf = layer.transform;
      gl.uniform2f(this.uTrans, tf?.x ?? 0, tf?.y ?? 0);
      gl.uniform1f(this.uScale, tf?.scale ?? 1);
      gl.uniform1f(this.uRot, tf?.rot ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const t = this.ping; this.ping = this.pong; this.pong = t; // swap
    }
    gl.bindVertexArray(null);
  }

  /** The current accumulator texture (after composite / before present) — for
   *  post-FX passes and for the recorder/render-mode to read. */
  get outputTexture(): WebGLTexture | undefined { return this.ping?.tex; }

  /** Present the accumulator to the canvas (one vsync-locked draw), optionally with
   *  a camera-shake transform baked into the output pixels. */
  present(shake: ShakeParams = NO_SHAKE) {
    const gl = this.gl;
    if (!this.ping) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.presentProg);
    gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
    gl.uniform1i(this.uPresentTex, 0);
    gl.uniform2f(this.uShake.uShakeOff, shake.offX, shake.offY);
    gl.uniform1f(this.uShake.uShakeSin, shake.sin);
    gl.uniform1f(this.uShake.uShakeCos, shake.cos);
    gl.uniform1f(this.uShake.uShakeScale, shake.scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** A post-FX grade pass: ping → pong, then swap so the accumulator is graded. */
  private applyGrade(g: GradeParams) {
    const gl = this.gl;
    if (!this.ping || !this.pong) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pong.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.gradeProg);
    gl.bindVertexArray(this.quad);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
    gl.uniform1i(this.gradeU.uTex, 0);
    gl.uniform1f(this.gradeU.uBright, g.brightness);
    gl.uniform1f(this.gradeU.uContrast, g.contrast);
    gl.uniform1f(this.gradeU.uSat, g.saturation);
    gl.uniform1f(this.gradeU.uGamma, g.gamma);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    const t = this.ping; this.ping = this.pong; this.pong = t; // graded → accumulator
  }

  /** One-shot: composite + (optional post-FX) + present (with optional camera shake). */
  render(layers: LayerInput[], grade?: GradeParams, shake?: ShakeParams) {
    if (this.disposed) return;
    this.composite(layers);
    if (grade && !isNeutral(grade)) this.applyGrade(grade);
    this.present(shake);
  }

  dispose() {
    this.disposed = true;
    const gl = this.gl;
    if (this.ping) { gl.deleteTexture(this.ping.tex); gl.deleteFramebuffer(this.ping.fbo); }
    if (this.pong) { gl.deleteTexture(this.pong.tex); gl.deleteFramebuffer(this.pong.fbo); }
    gl.deleteTexture(this.srcTex);
    gl.deleteProgram(this.compositeProg);
    gl.deleteProgram(this.presentProg);
    gl.deleteProgram(this.gradeProg);
  }
}
