// stageLens — the camera the concert-stage rigs (RIG_*) are photographed through.
//
// A real photo of a show is mostly about what the lens does to light: every source blooms into the
// haze-dark frame, highlights bleed red into the film (halation), the edges fringe (lateral chromatic
// aberration) and fall off (cos⁴ vignette), and the shadows carry grain. None of that can be done in
// one pass, so the rigs render scene-referred HDR into a half-float target and this runs after:
//
//   HDR scene ─► dual-filter bloom (5 mips down, tent up) ─► composite: bloom + halation, CA,
//   vignette, ACES, saturation, luminance-weighted grain, dither ─► the layer's RGBA8 texture.
//
// Without EXT_color_buffer_float the rigs fall back to tone-mapping in their own shader (iHDR = 0).

import { GL, RenderTarget, createProgram } from './glUtil';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

// Dual-filter (Kawase) down: centre ×4 + four diagonal half-texel taps.
const DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel * 0.5;
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv - h).rgb + texture(uSrc, vUv + h).rgb;
  c += texture(uSrc, vUv + vec2(h.x, -h.y)).rgb + texture(uSrc, vUv - vec2(h.x, -h.y)).rgb;
  o = vec4(min(c / 8.0, vec3(64.0)), 1.0);      // clamp: a single fixture lens must not flood the frame
}`;

// Dual-filter up: an 8-tap tent, added onto the next larger mip.
const UP = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main(){
  vec2 h = uTexel * 0.5;
  vec3 c = texture(uSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture(uSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  c += texture(uSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb + texture(uSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  c += (texture(uSrc, vUv + vec2(-h.x, h.y)).rgb + texture(uSrc, vUv + h).rgb
      + texture(uSrc, vUv + vec2(h.x, -h.y)).rgb + texture(uSrc, vUv - h).rgb) * 2.0;
  o = vec4(c / 12.0, 1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uHdr, uBloom;
uniform vec2 uRes;
uniform float uTime, uBloomK;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 d = vUv - 0.5;
  // Lateral chromatic aberration: red lands a touch wide, blue a touch narrow, growing to the corners.
  float ca = 0.0016 * dot(d, d) * 4.0;
  vec3 col;
  col.r = texture(uHdr, vUv + d * ca).r;
  col.g = texture(uHdr, vUv).g;
  col.b = texture(uHdr, vUv - d * ca).b;
  vec3 bloom = texture(uBloom, vUv).rgb;
  // Halation: the film's red layer catches light scattered back off the base — warm fringes on hot sources.
  vec3 hal = bloom * vec3(1.0, 0.55, 0.35);
  col += bloom * uBloomK + hal * uBloomK * 0.35;
  // cos⁴ optical vignette.
  float asp = uRes.x / max(uRes.y, 1.0);
  float r2 = dot(d * vec2(asp, 1.0), d * vec2(asp, 1.0));
  float v = 1.0 / (1.0 + r2 * 0.55); col *= v * v;
  col = aces(max(col, 0.0));
  col = max(mix(vec3(dot(col, LUMA)), col, 1.1), 0.0);
  // Grain: strongest in the mids, as on a sensor/film; plus a 1/255 dither so the haze never bands.
  vec2 fc = vUv * uRes;
  float l = dot(col, LUMA);
  float g = h21(fc + fract(uTime * 13.7) * 117.0) + h21(fc * 1.7 + fract(uTime * 7.1) * 51.0) - 1.0;
  col += g * 0.035 * (l * (1.0 - l) * 2.0 + 0.08);
  col += (h21(fc + 3.1 + fract(uTime) * 91.0) - 0.5) / 255.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

interface Chain { hdr: RenderTarget; mips: RenderTarget[]; w: number; h: number }

function floatTarget(gl: GL, w: number, h: number): RenderTarget {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, width: w, height: h };
}

const MIPS = 5;

export class StageLens {
  private down: WebGLProgram; private up: WebGLProgram; private comp: WebGLProgram;
  private chains = new Map<string, Chain>();
  private loc = new Map<WebGLProgram, Record<string, WebGLUniformLocation | null>>();

  constructor(private gl: GL, private quad: WebGLVertexArrayObject) {
    this.down = createProgram(gl, VS, DOWN);
    this.up = createProgram(gl, VS, UP);
    this.comp = createProgram(gl, VS, COMPOSITE);
    for (const p of [this.down, this.up, this.comp]) {
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of ['uSrc', 'uTexel', 'uHdr', 'uBloom', 'uRes', 'uTime', 'uBloomK']) u[n] = gl.getUniformLocation(p, n);
      this.loc.set(p, u);
    }
  }

  /** The HDR target a rig renders its scene into (per layer id, w×h). */
  hdrTarget(id: string, w: number, h: number): RenderTarget {
    let c = this.chains.get(id);
    if (!c || c.w !== w || c.h !== h) {
      if (c) this.free(c);
      const mips: RenderTarget[] = [];
      let mw = w, mh = h;
      for (let i = 0; i < MIPS; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(floatTarget(this.gl, mw, mh)); }
      c = { hdr: floatTarget(this.gl, w, h), mips, w, h };
      this.chains.set(id, c);
    }
    return c.hdr;
  }

  /** Bloom + lens + tone-map the HDR scene of `id` into `out`. */
  develop(id: string, out: RenderTarget, time: number) {
    const gl = this.gl, c = this.chains.get(id);
    if (!c) return;
    gl.bindVertexArray(this.quad);
    gl.disable(gl.BLEND);
    // Down the chain.
    let src = c.hdr;
    gl.useProgram(this.down);
    let u = this.loc.get(this.down)!;
    for (const m of c.mips) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo); gl.viewport(0, 0, m.width, m.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uTexel, 1 / src.width, 1 / src.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = m;
    }
    // Back up, adding each blurred level onto the larger one: a wide, physically-shaped glow.
    gl.useProgram(this.up);
    u = this.loc.get(this.up)!;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = c.mips.length - 1; i > 0; i--) {
      const from = c.mips[i], to = c.mips[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo); gl.viewport(0, 0, to.width, to.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform1i(u.uSrc, 0); gl.uniform2f(u.uTexel, 1 / from.width, 1 / from.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    // Composite into the layer's texture.
    gl.useProgram(this.comp);
    u = this.loc.get(this.comp)!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, out.width, out.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, c.hdr.tex); gl.uniform1i(u.uHdr, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.mips[0].tex); gl.uniform1i(u.uBloom, 1);
    gl.uniform2f(u.uRes, out.width, out.height);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uBloomK, 0.018);  // mip0 holds the sum of 5 levels: ≈ 9% veiling glare, a good zoom lens at a show
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private free(c: Chain) {
    const gl = this.gl;
    for (const t of [c.hdr, ...c.mips]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
  }

  dispose() {
    this.chains.forEach(c => this.free(c));
    this.chains.clear();
    for (const p of [this.down, this.up, this.comp]) this.gl.deleteProgram(p);
  }
}
