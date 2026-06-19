// GeneratorRenderer — native GLSL ports of the Canvas2D visualizer generators.
//
// When a generator clip's mode has a GLSL implementation here, the bridge renders
// it straight on the GPU into a layer texture (no Canvas2D context, no extra rAF,
// no per-frame element upload) — reclaiming the main-thread cost that the upload
// path can't. Modes without a port keep the Canvas2D wrap path, so this grows one
// mode at a time. Uniform convention matches ShaderLayer (iChannel0 audio texture,
// iBass/iMid/iTreble/iLevel, palette iC0..iC2, iParam0..3).

import { GL, RenderTarget, createProgram, createFullscreenQuad, makeTarget } from './glUtil';
import { AudioTexture } from './audioTexture';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform sampler2D iChannel0;            // row 0.25 = FFT, row 0.75 = waveform
uniform float iBass, iMid, iTreble, iLevel;
uniform vec3 iC0, iC1, iC2;
uniform float iParam0, iParam1, iParam2, iParam3;
float fft(float x){ return texture(iChannel0, vec2(clamp(x,0.0,1.0), 0.25)).r; }
float wave(float x){ return texture(iChannel0, vec2(clamp(x,0.0,1.0), 0.75)).r; }
`;

// ── Mode shaders (faithful-in-spirit GPU versions). Output opaque; the layer's
//    blend mode (VIZ default = Screen) handles the black background like the
//    original Canvas2D generators did. ──

const WAVEFORM_FS = HEADER + `
void main(){
  vec2 uv = vUv;
  float w = wave(uv.x);                 // 0..1, 0.5 = silence
  float amp = (w - 0.5) * 2.0;          // -1..1
  float y = 0.5 + amp * (0.18 + iLevel * 0.30);
  float d = abs(uv.y - y);
  float core = smoothstep(0.010, 0.0, d);
  float glow = smoothstep(0.060, 0.0, d) * 0.6;
  vec3 col = mix(iC1, iC0, uv.x) * (glow) + vec3(1.0) * core * 0.9;
  fragColor = vec4(col, 1.0);
}`;

const SPECTRUM_FS = HEADER + `
void main(){
  vec2 p = vUv - 0.5;
  p.x *= iResolution.x / max(iResolution.y, 1.0);
  float ang = atan(p.y, p.x);
  float a01 = (ang + 3.14159265) / 6.2831853;        // 0..1 around the ring
  float rad = length(p);
  const float BARS = 96.0;
  float bi = floor(a01 * BARS) / BARS;
  float mag = fft(bi);                               // bar height from FFT
  float inner = 0.12;
  float outer = inner + 0.05 + mag * 0.34;
  float band = step(inner, rad) * step(rad, outer);  // filled bar
  float gap = smoothstep(0.0, 0.06, abs(fract(a01 * BARS) - 0.5)); // bar gaps
  float v = band * gap;
  vec3 col = mix(iC2, iC0, mag) * v;
  col += iC1 * smoothstep(0.02, 0.0, abs(rad - outer)) * v; // bright tip
  fragColor = vec4(col, 1.0);
}`;

const TUNNEL_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = vUv - 0.5; p.x *= aspect;
  float r = length(p);
  float f = fft(clamp(r * 1.2, 0.0, 1.0));
  // receding rings, treble sharpens them
  float rings = smoothstep(0.5, 0.0, abs(fract(r * 9.0 - iTime * 0.6) - 0.5)) ;
  rings *= 0.4 + iTreble * 1.6;
  vec3 col = mix(iC2, iC0, f) * rings * (0.5 + f * 1.6);
  col *= smoothstep(0.0, 0.10, r); // fade the throat
  fragColor = vec4(col, 1.0);
}`;

const VORTEX_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = vUv - 0.5; p.x *= aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  float spiral = sin(a * 3.0 + r * 18.0 - iTime * 2.0);
  float m = smoothstep(0.45, 0.95, spiral);
  float f = fft(clamp(r, 0.0, 1.0));
  vec3 col = mix(iC1, iC0, clamp(r * 1.5, 0.0, 1.0)) * m * (0.5 + iLevel * 1.2 + f);
  col *= smoothstep(0.62, 0.0, r);
  fragColor = vec4(col, 1.0);
}`;

const NEBULA_FS = HEADER + `
void main(){
  vec2 p = vUv;
  float n = 0.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    n += sin(p.x * fi * 6.0 + iTime * 0.5 * fi + p.y * 3.0) * 0.5 / fi;
  }
  float band = 0.5 + 0.5 * n;
  float glow = smoothstep(0.28, 0.92, band + iLevel * 0.45);
  vec3 col = mix(iC2, iC0, band) * glow;
  col += iC1 * pow(glow, 3.0) * 0.5;
  fragColor = vec4(col, 1.0);
}`;

const GEN_GLSL: Record<string, string> = {
  WAVEFORM: WAVEFORM_FS,
  SPECTRUM: SPECTRUM_FS,
  TUNNEL: TUNNEL_FS,
  VORTEX: VORTEX_FS,
  NEBULA: NEBULA_FS,
};

export function hasGenerator(mode: string | undefined): boolean {
  return !!mode && mode in GEN_GLSL;
}

export interface GenContext {
  time: number;
  audio: AudioTexture;
  colors: number[][];   // up to 3 [r,g,b] 0..1
  params: number[];     // iParam0..3
}

export class GeneratorRenderer {
  private quad: WebGLVertexArrayObject;
  private progs = new Map<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>();
  private pool = new Map<string, RenderTarget>();

  constructor(private gl: GL) {
    this.quad = createFullscreenQuad(gl);
  }

  private program(mode: string) {
    let entry = this.progs.get(mode);
    if (!entry) {
      const p = createProgram(this.gl, VS, GEN_GLSL[mode]);
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const name of ['iResolution', 'iTime', 'iChannel0', 'iBass', 'iMid', 'iTreble', 'iLevel', 'iC0', 'iC1', 'iC2', 'iParam0', 'iParam1', 'iParam2', 'iParam3'])
        u[name] = this.gl.getUniformLocation(p, name);
      entry = { p, u };
      this.progs.set(mode, entry);
    }
    return entry;
  }

  /** Render a generator mode into a pooled texture (keyed by layer id) and return it. */
  render(id: string, mode: string, w: number, h: number, ctx: GenContext): WebGLTexture {
    const gl = this.gl;
    const target = makeTarget(gl, w, h, this.pool.get(id));
    this.pool.set(id, target);
    const { p, u } = this.program(mode);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.quad);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, ctx.audio.tex);
    gl.uniform1i(u.iChannel0, 2);
    gl.uniform2f(u.iResolution, w, h);
    gl.uniform1f(u.iTime, ctx.time);
    gl.uniform1f(u.iBass, ctx.audio.bass);
    gl.uniform1f(u.iMid, ctx.audio.mid);
    gl.uniform1f(u.iTreble, ctx.audio.treble);
    gl.uniform1f(u.iLevel, ctx.audio.level);
    const c = (i: number) => ctx.colors[i] ?? [1, 1, 1];
    gl.uniform3f(u.iC0, c(0)[0], c(0)[1], c(0)[2]);
    gl.uniform3f(u.iC1, c(1)[0], c(1)[1], c(1)[2]);
    gl.uniform3f(u.iC2, c(2)[0], c(2)[1], c(2)[2]);
    gl.uniform1f(u.iParam0, ctx.params[0] ?? 0.5);
    gl.uniform1f(u.iParam1, ctx.params[1] ?? 0.5);
    gl.uniform1f(u.iParam2, ctx.params[2] ?? 0.5);
    gl.uniform1f(u.iParam3, ctx.params[3] ?? 0.5);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return target.tex;
  }

  dispose() {
    const gl = this.gl;
    this.pool.forEach(t => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    this.progs.forEach(e => gl.deleteProgram(e.p));
    this.pool.clear(); this.progs.clear();
  }
}

/** Parse "#rrggbb" → [r,g,b] in 0..1. */
export function hexToRgb(hex: string): number[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
