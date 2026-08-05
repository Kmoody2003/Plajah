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

const COSMIC_FS = HEADER + `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float t = iTime * (0.3 + fi * 0.15);
    vec2 q = p * (3.0 + fi * 3.0);
    vec2 id = floor(q * 8.0);
    vec2 gv = fract(q * 8.0) - 0.5;
    float h = hash(id + fi * 19.0);
    float star = smoothstep(0.14, 0.0, length(gv)) * step(0.86, h);
    float tw = 0.5 + 0.5 * sin(t * 6.0 + h * 30.0);
    col += mix(iC2, iC0, h) * star * tw * (0.5 + iLevel);
  }
  col += iC1 * smoothstep(0.7, 0.0, length(p)) * iBass * 0.6;  // core warp glow
  fragColor = vec4(col, 1.0);
}`;

const RETROGRID_FS = HEADER + `
void main(){
  vec2 uv = vUv;
  float horizon = 0.5;
  vec3 col = vec3(0.0);
  if (uv.y < horizon) {
    float z = 1.0 / ((horizon - uv.y) + 0.02);
    float gx = abs(fract((uv.x - 0.5) * z) - 0.5);
    float gz = abs(fract(z * 0.5 - iTime) - 0.5);
    float line = smoothstep(0.04, 0.0, gx) + smoothstep(0.04, 0.0, gz);
    col = mix(iC1, iC0, 0.5) * line * smoothstep(0.0, 0.4, horizon - uv.y) * (0.6 + iLevel);
  } else {
    float sun = smoothstep(0.25, 0.0, length((uv - vec2(0.5, horizon + 0.18)) * vec2(1.0, 1.4)));
    col = mix(iC2 * 0.2, iC0, sun * (0.6 + iBass));
  }
  fragColor = vec4(col, 1.0);
}`;

const KALEIDO_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float seg = 8.0 + floor(iMid * 8.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  a = mod(a, 6.2831853 / seg);
  a = abs(a - 3.14159265 / seg);
  vec2 q = vec2(cos(a), sin(a)) * r;
  float f = fft(clamp(r * 1.5, 0.0, 1.0));
  float pat = 0.5 + 0.5 * sin(q.x * 20.0 + iTime * 1.5) * sin(q.y * 20.0 - iTime * 1.2);
  float v = pat * smoothstep(0.72, 0.0, r) * (0.4 + f * 1.5);
  vec3 col = mix(iC2, iC0, pat) * v + iC1 * f * 0.4;
  fragColor = vec4(col, 1.0);
}`;

const STAGE_FS = HEADER + `
void main(){
  vec2 uv = vUv;
  float panels = 14.0;
  float idx = floor(uv.x * panels);
  float f = fft(idx / panels);
  float h = 0.08 + f * 0.82;                     // panel height from its bin
  float panel = step(1.0 - h, uv.y);
  float gap = smoothstep(0.0, 0.02, abs(fract(uv.x * panels) - 0.5) - 0.42);
  float v = panel * (1.0 - gap);
  vec3 col = mix(iC2, iC0, f) * v * (0.5 + f);
  col += iC1 * smoothstep(0.03, 0.0, abs(uv.y - (1.0 - h))) * v; // bright top edge
  fragColor = vec4(col, 1.0);
}`;

const LIQUID_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float v = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.5 + fi * 1.3) * 0.3, cos(iTime * 0.4 + fi * 2.1) * 0.3);
    float r = 0.12 + 0.06 * sin(iTime * 1.5 + fi) + iBass * 0.05;
    v += smoothstep(r, r * 0.3, length(p - c));
  }
  v = smoothstep(0.6, 1.2, v);                    // metaball threshold
  vec3 col = mix(iC2, iC0, v) * v * (0.6 + iLevel);
  fragColor = vec4(col, 1.0);
}`;

const PARTICLES_FS = HEADER + `
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float a = h2(vec2(fi, 1.0)), b = h2(vec2(fi, 2.0));
    float ang = a * 6.2831853 + iTime * (0.2 + b * 0.5);
    float rad = 0.1 + b * 0.4 + sin(iTime + fi) * 0.05 + iBass * 0.12;
    vec2 pos = vec2(cos(ang), sin(ang)) * rad;
    col += mix(iC0, iC1, a) * smoothstep(0.02, 0.0, length(p - pos)) * (0.5 + iLevel);
  }
  fragColor = vec4(col, 1.0);
}`;

const STUDIO_AURORA_FS = HEADER + `
void main(){
  vec2 uv = vUv;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = 0.5 + 0.2 * sin(uv.x * 3.0 + iTime * 0.5 + fi * 1.2) + 0.1 * sin(uv.x * 7.0 - iTime * 0.3 + fi);
    col += mix(iC2, iC0, fi / 5.0) * smoothstep(0.08, 0.0, abs(uv.y - y)) * (0.4 + iMid);
  }
  fragColor = vec4(col, 1.0);
}`;

const STUDIO_CHROME_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.3 + fi) * 0.35, cos(iTime * 0.25 + fi * 1.7) * 0.35);
    col += mix(iC0, iC2, fi / 7.0) * smoothstep(0.25, 0.0, length(p - c)) * (0.5 + iLevel * 0.8);
  }
  fragColor = vec4(col, 1.0);
}`;

const STUDIO_BAUHAUS_FS = HEADER + `
void main(){
  vec2 uv = vUv * vec2(5.0, 3.0);
  vec2 id = floor(uv);
  vec2 gv = fract(uv) - 0.5;
  float h = fract(sin(dot(id, vec2(12.9, 78.2))) * 43758.5);
  float shape;
  if (h < 0.33) shape = smoothstep(0.40, 0.35, length(gv));
  else if (h < 0.66) shape = step(max(abs(gv.x), abs(gv.y)), 0.38);
  else shape = step(gv.y, 0.38 - abs(gv.x) * 1.5) * step(-0.38, gv.y);
  float f = fft(h);
  vec3 col = mix(iC2, iC0, h) * shape * (0.5 + f);
  fragColor = vec4(col, 1.0);
}`;

const STORM_FS = HEADER + `
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 uv = vUv;
  float clouds = 0.0; vec2 q = uv * 3.0 + vec2(iTime * 0.05, 0.0);
  for (int i = 0; i < 4; i++) { clouds += noise(q) * pow(0.5, float(i + 1)); q *= 2.0; }
  vec3 col = mix(vec3(0.02, 0.02, 0.05), iC2 * 0.4, clouds);
  float rain = step(0.97, h(vec2(floor(uv.x * 200.0), floor((uv.y + iTime * 2.0) * 40.0))));
  col += vec3(0.6) * rain * 0.3;
  col += iC0 * smoothstep(0.6, 1.0, iBass) * clouds * 2.0;   // lightning flash
  fragColor = vec4(col, 1.0);
}`;

const LUMINANCE_FS = HEADER + `
void main(){
  vec2 uv = vUv;
  float v = 0.5 + 0.5 * sin(uv.x * 8.0 + iTime) * sin(uv.y * 8.0 - iTime * 0.7);
  v = pow(v, 1.0 + iTreble * 3.0);
  vec3 col = mix(iC2, iC0, v) * (0.3 + iLevel * 1.4) + iC1 * iBass * 0.5;
  fragColor = vec4(col, 1.0);
}`;

const STUDIO_NEBULA_FS = HEADER + `
float hn(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 60; i++) {
    float fi = float(i);
    float a = hn(vec2(fi, 1.0)), b = hn(vec2(fi, 2.0)), c = hn(vec2(fi, 3.0));
    float ang = a * 6.2831853 + iTime * 0.1 * (0.5 + b);
    vec2 pos = vec2(cos(ang), sin(ang)) * (0.05 + c * 0.45) * (1.0 + iBass * 0.3);
    col += mix(iC2, iC0, a) * smoothstep(0.03, 0.0, length(p - pos)) * (0.4 + iLevel);
  }
  fragColor = vec4(col, 1.0);
}`;

const STUDIO_GRAVITY_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.3 + fi * 1.6), cos(iTime * 0.4 + fi * 2.1)) * 0.3;
    float d = length(p - c);
    col += mix(iC0, iC1, fi / 4.0) * (0.02 + iLevel * 0.04) / (d * d + 0.01);
  }
  fragColor = vec4(min(col, vec3(1.5)), 1.0);
}`;

const STUDIO_KINETIC_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float seg = 6.0;
  float a = atan(p.y, p.x); float r = length(p);
  a = mod(a, 6.2831853 / seg); a = abs(a - 3.14159265 / seg);
  vec2 q = vec2(cos(a), sin(a)) * r;
  float grid = step(0.9, max(sin(q.x * 20.0 + iTime), sin(q.y * 20.0 - iTime)));
  vec3 col = mix(iC2, iC0, r * 1.5) * grid * smoothstep(0.7, 0.0, r) * (0.5 + iMid);
  fragColor = vec4(col, 1.0);
}`;

const STUDIO_RIPPLE_FS = HEADER + `
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float r = length(p);
  float v = 0.5 + 0.5 * sin(r * 40.0 - iTime * 4.0 - iBass * 10.0);
  v *= smoothstep(0.7, 0.0, r);
  vec3 col = mix(iC2, iC0, v) * (0.4 + iLevel) + iC1 * smoothstep(0.95, 1.0, v) * 0.5;
  fragColor = vec4(col, 1.0);
}`;

const GEN_GLSL: Record<string, string> = {
  WAVEFORM: WAVEFORM_FS,
  SPECTRUM: SPECTRUM_FS,
  TUNNEL: TUNNEL_FS,
  VORTEX: VORTEX_FS,
  NEBULA: NEBULA_FS,
  COSMIC: COSMIC_FS,
  RETROGRID: RETROGRID_FS,
  KALEIDOSCOPE: KALEIDO_FS,
  STAGE: STAGE_FS,
  LIQUID: LIQUID_FS,
  PARTICLES: PARTICLES_FS,
  STORM: STORM_FS,
  LUMINANCE: LUMINANCE_FS,
  STUDIO_AURORA: STUDIO_AURORA_FS,
  STUDIO_CHROME: STUDIO_CHROME_FS,
  STUDIO_BAUHAUS: STUDIO_BAUHAUS_FS,
  STUDIO_NEBULA: STUDIO_NEBULA_FS,
  STUDIO_GRAVITY: STUDIO_GRAVITY_FS,
  STUDIO_KINETIC: STUDIO_KINETIC_FS,
  STUDIO_RIPPLE: STUDIO_RIPPLE_FS,
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
