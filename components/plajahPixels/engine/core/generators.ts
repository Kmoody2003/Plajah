// GeneratorRenderer — native GLSL ports of the Canvas2D visualizer generators.
//
// When a generator clip's mode has a GLSL implementation here, the bridge renders
// it straight on the GPU into a layer texture (no Canvas2D context, no extra rAF,
// no per-frame element upload) — reclaiming the main-thread cost that the upload
// path can't. Modes without a port keep the Canvas2D wrap path, so this grows one
// mode at a time. Uniform convention matches ShaderLayer (iChannel0 audio texture,
// iBass/iMid/iTreble/iLevel, palette iC0..iC2, iParam0..3).

import { GL, RenderTarget, createProgram, createFullscreenQuad, makeTarget, startProgram, programDone, finishProgram, PendingProgram } from './glUtil';
import { AudioTexture } from './audioTexture';
import {
  OCEAN_LEVIATHAN_GLSL,
  KINETIC_CHROME_MORPH_GLSL,
  VOLCANIC_PLASMA_FIRE_GLSL,
  AERODYNAMIC_WIND_GLSL,
  CRYSTALLINE_CATHEDRAL_GLSL,
  CHLADNI_RESONATOR_GLSL,
  ASTRAL_CYBER_FLUID_GLSL,
  BIOLUMINESCENT_ABYSS_GLSL,
  SOLARIS_MERCURY_OCEAN_GLSL,
  IONIC_THUNDERSTORM_GLSL,
  FROST_FRACTURE_OBSIDIAN_GLSL,
  AURORA_CHRONOS_PILLARS_GLSL,
  IMAGE1_RIPPLE_TRANQUIL_GLSL,
  IMAGE1_RIPPLE_ENERGETIC_GLSL,
  IMAGE2_SLAT_TRANQUIL_GLSL,
  IMAGE2_SLAT_ENERGETIC_GLSL,
  IMAGE3_MONOLITH_TRANQUIL_GLSL,
  IMAGE3_MONOLITH_ENERGETIC_GLSL,
  IMAGE4_CHEVRON_TRANQUIL_GLSL,
  IMAGE4_CHEVRON_ENERGETIC_GLSL,
} from '../presets/milkdropCouncilShaders';
import { CEL_COMMON, COSMOS_GLSL, COSMOS_RENDER_SCALE } from './generatorsCosmos';
import { FLUID_GLSL, FLUID_RENDER_SCALE } from './generatorsFluid';
import { PLANES_GLSL, PLANES_RENDER_SCALE } from './generatorsPlanes';
import { OPTICS_GLSL, OPTICS_RENDER_SCALE } from './generatorsOptics';
import { CALM_AUDIO_MODES } from './generatorPalettes';
import { FluidSim, SIM_MODE_ID, cosmicSimId, simSupported } from './fluidSim';
import { FLUID_SIM_GLSL } from './generatorsFluidSim';
import { STAGE_LIB, STAGE_MAIN, STAGE_BODIES, STAGE_RENDER_SCALE } from './generatorsStage';
import { StageAudio } from './stageAudio';
import { StageLens } from './stageLens';
import { GeneratorDirector, DIRECTOR_SUFFIX, DIRECTOR_VS, directorBase, directorize, hasDirectorVersion } from './generatorDirector';

function wrapCouncil(src: string): string {
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform sampler2D iChannel0;
uniform float iBass, iMid, iTreble, iLevel;
uniform vec3 iC0, iC1, iC2;
uniform float iParam0, iParam1, iParam2, iParam3;

${src}

void main() {
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  float fitScale = 1.32 * max(1.0, 1.7777778 / max(aspect, 0.1));
  vec2 fc = 0.5 * iResolution + (vUv - 0.5) * iResolution * fitScale;
  mainImage(fragColor, fc);
}
`;
}

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
vec2 fitP(vec2 uv, vec2 res){
  float aspect = res.x / max(res.y, 1.0);
  float fitScale = 1.35 * max(1.0, 1.7777778 / max(aspect, 0.1));
  vec2 p = (uv - 0.5) * fitScale;
  p.x *= aspect;
  return p;
}
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
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
  vec2 p = fitP(vUv, iResolution);
  float r = length(p);
  float v = 0.5 + 0.5 * sin(r * 40.0 - iTime * 4.0 - iBass * 10.0);
  v *= smoothstep(0.7, 0.0, r);
  vec3 col = mix(iC2, iC0, v) * (0.4 + iLevel) + iC1 * smoothstep(0.95, 1.0, v) * 0.5;
  fragColor = vec4(col, 1.0);
}`;


// ── Polar Drift — a log-polar raymarch through a cosine-noise cavern ────────
//
// Expanded from a twigl "geekest" golf (83 march steps over a 13-octave
// cos·cos noise field, read in log-polar space so the camera forever zooms
// into the same cavern). The golf is kept move-for-move — the .yx framing,
// the i/2000 brightening, the ray folding to (-1,-1,-1) after step 60 — and
// then the mix drives it: bass rocks the camera and deepens the glow, the
// spectrum rides the azimuth as ridges on the cavern wall, mids sharpen the
// fine grain, treble delays the fold, level lifts the exposure.
//
//   iParam0  Shape      zoom pace through the field
//   iParam1  Detail     noise octaves (render cost scales with this)
//   iParam2  Energy     how hard the audio pushes everything (0 = pure golf)
//   iParam3  Variation  twist of the framing + where the palette turns
const POLAR_DRIFT_FS = HEADER + `
mat3 rotate3D(float angle, vec3 axis){
  vec3 a = normalize(axis);
  float s = sin(angle), c = cos(angle), r = 1.0 - c;
  return mat3(
    a.x*a.x*r + c,      a.y*a.x*r + a.z*s,  a.z*a.x*r - a.y*s,
    a.x*a.y*r - a.z*s,  a.y*a.y*r + c,      a.z*a.y*r + a.x*s,
    a.x*a.z*r + a.y*s,  a.y*a.z*r - a.x*s,  a.z*a.z*r + c);
}
void main(){
  float react  = iParam2 * 2.0;                       // 0..2, 0.5 → 1× (the golf's own pace)
  float bass   = iBass   * react;
  float mid    = iMid    * react;
  float treble = iTreble * react;
  float level  = iLevel  * react;
  float t = iTime;

  // The golf's framing: d = vec3(FC.yx / r.y * 1.4 - 1, 1). The swizzle is part of the look.
  vec2 fc = vUv * iResolution;
  vec3 d = vec3(fc.yx / max(iResolution.y, 1.0) * 1.4 - 1.0, 1.0);
  float tw = (iParam3 - 0.5) * 1.2;
  d.xy = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * d.xy;

  float zoomPace = 0.2 + iParam0 * 0.7;               // golf: t * 0.5
  float wobble   = 0.1 + bass * 0.22;                 // golf: cos(t) * 0.1
  mat3 rot = rotate3D(cos(t) * wobble, vec3(1.0));
  float octaves = mix(128.0, 2048.0, iParam1);        // golf: s < 5e3 (13 octaves); 8…12 here, the rest is sub-pixel
  float foldAt  = 59.0 + treble * 10.0;               // golf: after step 60 the ray folds
  float ridge   = 0.28 * react;                       // spectrum displacing the cavern wall

  vec3 q = vec3(-1.0), p;
  float e = 0.0, R = 0.0, s;
  vec3 col = vec3(0.0);
  float glow = 0.0;

  for (float i = 1.0; i <= 83.0; i += 1.0) {
    e += i / 2000.0;
    float w = e * e / 24.0;                           // golf: o += e*e/24
    glow += w;
    // Depth-tinted accumulation — near steps take Colour 1, the far field Colour 2 → 3.
    float depth = i / 83.0;
    float turn = 0.35 + iParam3 * 0.3;
    vec3 tint = depth < turn ? mix(iC0, iC1, depth / turn) : mix(iC1, iC2, (depth - turn) / (1.0 - turn));
    col += w * tint;

    q += d * e * R * 0.2 * rot;                       // golf: p = q += d*e*R*.2*rotate3D(...)
    p = q;
    R = length(p);
    p = vec3(log2(R) - t * zoomPace, -p.z / R, atan(p.x, p.y));   // log-polar: zoom is a slide in x

    // The spectrum rides the azimuth: loud bins push the wall out into ridges.
    float az = fract(p.z / 6.2831853 + 0.5);
    p.y -= fft(az) * ridge;

    p.y -= 1.0;                                       // golf: e = --p.y
    e = p.y;
    for (s = 1.0; s < octaves; s += s) {
      float gain = 1.0 + mid * 0.25 * step(16.0, s); // mids sharpen the fine grain only
      e += cos(dot(cos(p.zyy * s), cos(p * s))) / s * gain;
    }
    if (i > foldAt) d = vec3(-1.0);                   // golf: d /= -d  (NaN-safe)
  }

  // Exposure: level lifts it, bass adds a warm core where the march ran hot.
  float exposure = 1.1 + level * 0.9;
  col = col * exposure + iC1 * glow * glow * 0.012 * bass;
  col = 1.0 - exp(-col);                              // soft shoulder, never clips to white
  fragColor = vec4(col, 1.0);
}`;

const GEN_GLSL: Record<string, string> = {
  POLAR_DRIFT: POLAR_DRIFT_FS,
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
  COUNCIL_OCEAN_LEVIATHAN: wrapCouncil(OCEAN_LEVIATHAN_GLSL),
  COUNCIL_KINETIC_CHROME: wrapCouncil(KINETIC_CHROME_MORPH_GLSL),
  COUNCIL_VOLCANIC_FIRE: wrapCouncil(VOLCANIC_PLASMA_FIRE_GLSL),
  COUNCIL_AERODYNAMIC_WIND: wrapCouncil(AERODYNAMIC_WIND_GLSL),
  COUNCIL_CRYSTALLINE_CATHEDRAL: wrapCouncil(CRYSTALLINE_CATHEDRAL_GLSL),
  COUNCIL_CHLADNI_RESONATOR: wrapCouncil(CHLADNI_RESONATOR_GLSL),
  COUNCIL_ASTRAL_ABLATION: wrapCouncil(ASTRAL_CYBER_FLUID_GLSL),
  COUNCIL_BIOLUMINESCENT_ABYSS: wrapCouncil(BIOLUMINESCENT_ABYSS_GLSL),
  COUNCIL_SOLARIS_OCEAN: wrapCouncil(SOLARIS_MERCURY_OCEAN_GLSL),
  COUNCIL_IONIC_THUNDER: wrapCouncil(IONIC_THUNDERSTORM_GLSL),
  COUNCIL_FROST_FRACTURE: wrapCouncil(FROST_FRACTURE_OBSIDIAN_GLSL),
  COUNCIL_AURORA_CHRONOS: wrapCouncil(AURORA_CHRONOS_PILLARS_GLSL),
  COUNCIL_RIPPLE_TRANQUIL: wrapCouncil(IMAGE1_RIPPLE_TRANQUIL_GLSL),
  COUNCIL_RIPPLE_ENERGETIC: wrapCouncil(IMAGE1_RIPPLE_ENERGETIC_GLSL),
  COUNCIL_SLAT_TRANQUIL: wrapCouncil(IMAGE2_SLAT_TRANQUIL_GLSL),
  COUNCIL_SLAT_ENERGETIC: wrapCouncil(IMAGE2_SLAT_ENERGETIC_GLSL),
  COUNCIL_MONOLITH_TRANQUIL: wrapCouncil(IMAGE3_MONOLITH_TRANQUIL_GLSL),
  COUNCIL_MONOLITH_ENERGETIC: wrapCouncil(IMAGE3_MONOLITH_ENERGETIC_GLSL),
  COUNCIL_CHEVRON_TRANQUIL: wrapCouncil(IMAGE4_CHEVRON_TRANQUIL_GLSL),
  COUNCIL_CHEVRON_ENERGETIC: wrapCouncil(IMAGE4_CHEVRON_ENERGETIC_GLSL),
};
// Cosmos (nebulae / aurorae), Fluid (liquids mixing), Planes (folding sheets) and Optics (light phenomena) share CEL_COMMON.
for (const [mode, body] of Object.entries({ ...COSMOS_GLSL, ...FLUID_GLSL, ...PLANES_GLSL, ...OPTICS_GLSL })) GEN_GLSL[mode] = HEADER + CEL_COMMON + body;
// Concert stages: a ray-traced venue + a virtual lighting rig cued by StageAudio (generatorsStage.ts).
// Each rig also comes as a Director version (a 3D camera that cuts on the music), an Empty version
// (no performers: a locked-off set-extension plate) and an Empty Director version (the empty stage,
// shot by the director). All are their own shaders, not the 2D crop director.
for (const [mode, body] of Object.entries(STAGE_BODIES)) {
  GEN_GLSL[mode] = HEADER + CEL_COMMON + STAGE_LIB + body + STAGE_MAIN;
  GEN_GLSL[mode + DIRECTOR_SUFFIX] = HEADER + '#define STAGE_DIRECTOR\n' + CEL_COMMON + STAGE_LIB + body + STAGE_MAIN;
  GEN_GLSL[mode + '_EMPTY'] = HEADER + '#define STAGE_EMPTY\n' + CEL_COMMON + STAGE_LIB + body + STAGE_MAIN;
  GEN_GLSL[mode + '_EMPTY' + DIRECTOR_SUFFIX] = HEADER + '#define STAGE_EMPTY\n#define STAGE_DIRECTOR\n' + CEL_COMMON + STAGE_LIB + body + STAGE_MAIN;
}
/** The 2D crop director applies to the Cosmos/Fluid sets; stage rigs carry their own 3D camera. */
const cropDirectorBase = (mode: string) => (mode.startsWith('RIG_') ? null : directorBase(mode));
// Director versions: the same scene seen through the beat-cut camera director (generatorDirector.ts).
for (const mode of Object.keys(GEN_GLSL)) if (hasDirectorVersion(mode)) GEN_GLSL[mode + DIRECTOR_SUFFIX] = directorize(GEN_GLSL[mode]);

// Modes whose cost is in the march, not the pixels, render into a smaller target. Every
// consumer samples the returned texture by UV (compositor LayerInput, the present pass),
// so the bilinear upscale is free and the framing (vUv * iResolution) is unchanged.
const GEN_RENDER_SCALE: Record<string, number> = {
  POLAR_DRIFT: 0.5,   // 83 steps × up to 12 octaves per pixel; the cavern is soft fog anyway
  ...COSMOS_RENDER_SCALE,
  ...FLUID_RENDER_SCALE,
  ...STAGE_RENDER_SCALE,
  ...PLANES_RENDER_SCALE,
  ...OPTICS_RENDER_SCALE,
};

// Calm modes breathe with the music instead of flickering: each band follows an
// envelope (fast-ish attack, slow release) per layer, so a kick swells the light
// and lets it settle rather than strobing it.
const CALM_ATTACK = 0.22, CALM_RELEASE = 0.9; // seconds
interface Env { b: number; m: number; t: number; l: number; at: number }

// Vocal ripple history: per layer, 48 samples at 30 Hz (1.6 s) of three vocal ranges, newest first.
// Each sample is "how much voice is arriving now": a fast envelope of the range, boosted by how far
// it rises above its own slow average — syllables and phrase onsets, not a sustained pad.
const VOCAL_N = 48, VOCAL_HZ = 30;
interface VocalHist { hist: Float32Array; fast: number[]; slow: number[]; acc: number; at: number }

export function hasGenerator(mode: string | undefined): boolean {
  return !!mode && mode in GEN_GLSL;
}

/** Every GLSL generator mode, in registry order (for dev galleries and pickers). */
export function generatorModes(): string[] {
  // Each director version sits right after its standard one.
  const out: string[] = [];
  for (const m of Object.keys(GEN_GLSL)) {
    if (directorBase(m)) continue;
    out.push(m);
    if (GEN_GLSL[m + DIRECTOR_SUFFIX]) out.push(m + DIRECTOR_SUFFIX);
  }
  return out;
}

export interface GenContext {
  time: number;
  audio: AudioTexture;
  colors: number[][];   // up to 3 [r,g,b] 0..1
  params: number[];     // iParam0..3
  /** Media clock in seconds for the audio followers (beat tracker, calm envelopes). Offline renders
   *  run faster than real time, so they pass it; live playback leaves it out and wall time is used. */
  clock?: number;
}

export class GeneratorRenderer {
  private quad: WebGLVertexArrayObject;
  private progs = new Map<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>();
  // Stage rigs are large shaders (seconds to build on some drivers): they compile in parallel and the
  // layer stays black until ready, instead of freezing the show.
  private pending = new Map<string, PendingProgram>();
  private parallel: { COMPLETION_STATUS_KHR: number } | null | undefined;
  private pool = new Map<string, RenderTarget>();
  private envs = new Map<string, Env>();
  private vocals = new Map<string, VocalHist>();
  private sims = new Map<string, FluidSim>();
  private directors = new Map<string, { base: string; d: GeneratorDirector }>();
  private simModes = new Map<string, string>();
  private stageEars = new Map<string, StageAudio>();
  private lens?: StageLens;

  /** waitForShaders: offline renders (exports) must never emit a frame before its shader is built. */
  constructor(private gl: GL, private opts: { waitForShaders?: boolean } = {}) {
    this.quad = createFullscreenQuad(gl);
  }

  private program(mode: string, sim = false, wait = true) {
    const key = sim ? mode + '#sim' : mode;
    let entry = this.progs.get(key);
    if (!entry) {
      const base = cropDirectorBase(mode);
      const b = base ?? mode;
      let src = sim && FLUID_SIM_GLSL[b] ? HEADER + CEL_COMMON + FLUID_SIM_GLSL[b] : GEN_GLSL[b];
      if (base) src = directorize(src);
      let p: WebGLProgram;
      if (mode.startsWith('RIG_')) {
        if (this.parallel === undefined) this.parallel = this.gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
        let pp = this.pending.get(key);
        if (!pp) { pp = startProgram(this.gl, VS, src); this.pending.set(key, pp); }
        if (!wait && !this.opts.waitForShaders && !programDone(this.gl, pp, this.parallel)) return null;
        this.pending.delete(key);
        p = finishProgram(this.gl, pp);
      } else p = createProgram(this.gl, base ? DIRECTOR_VS : VS, src);
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const name of ['iResolution', 'iTime', 'iChannel0', 'iBass', 'iMid', 'iTreble', 'iLevel', 'iC0', 'iC1', 'iC2', 'iParam0', 'iParam1', 'iParam2', 'iParam3', 'iVocal', 'iChannel1', 'iChannel2', 'iChannel3', 'iSimTexel', 'iFlowOn', 'iCam', 'iCamZoom', 'iStage', 'iStage2', 'iHDR'])
        u[name] = this.gl.getUniformLocation(p, name);
      entry = { p, u };
      this.progs.set(key, entry);
    }
    return entry;
  }

  /** Build a mode's shader now, waiting for it (dev tools and offline renders that need frame one). */
  prepare(mode: string) { this.program(mode, false, true); }

  /** True once a mode's shader is built (stage rigs compile in the background). */
  isReady(mode: string): boolean { return !!this.program(mode, false, false); }

  /** Render a generator mode into a pooled texture (keyed by layer id) and return it. */
  render(id: string, mode: string, w: number, h: number, ctx: GenContext): WebGLTexture {
    const gl = this.gl;
    // Stateful modes: advance the live fluid (or the nebula's flow map) before drawing.
    const dBase = cropDirectorBase(mode);
    const base = dBase ?? mode;
    const simId = SIM_MODE_ID[base] ?? cosmicSimId(base);
    let sim: FluidSim | undefined;
    if (simId !== undefined && simSupported(gl)) {
      sim = this.sims.get(id);
      if (!sim || this.simModes.get(id) !== base) {
        sim?.dispose();
        sim = new FluidSim(gl, simId, this.quad);
        this.sims.set(id, sim); this.simModes.set(id, base);
      }
    }
    const scale = sim && simId !== undefined && simId < 20 ? 1 : (GEN_RENDER_SCALE[base] ?? 1);
    if (scale !== 1) { w = Math.max(2, Math.round(w * scale)); h = Math.max(2, Math.round(h * scale)); }
    sim?.step(ctx.time, ctx.audio, ctx.params, w, h);
    const target = makeTarget(gl, w, h, this.pool.get(id));
    this.pool.set(id, target);
    const built = this.program(mode, !!sim, false);
    if (!built) {                                   // still compiling: hold black rather than stall the frame
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      return target.tex;
    }
    const { p, u } = built;
    // Stage rigs render scene-referred HDR and are developed through the lens (bloom, halation, grain).
    const lens = u.iHDR && simSupported(gl) ? (this.lens ??= new StageLens(gl, this.quad)) : null;
    const drawTarget = lens ? lens.hdrTarget(id, w, h) : target;

    gl.bindFramebuffer(gl.FRAMEBUFFER, drawTarget.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.quad);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, ctx.audio.tex);
    gl.uniform1i(u.iChannel0, 2);
    gl.uniform1f(u.iFlowOn, sim ? 1 : 0);
    if (dBase) {
      let dir = this.directors.get(id);
      if (!dir || dir.base !== base) { dir = { base, d: new GeneratorDirector(base.startsWith('COSMIC_')) }; this.directors.set(id, dir); }
      const [cx, cy, zoom, roll] = dir.d.update(ctx.time, ctx.audio, w / Math.max(1, h));
      gl.uniform4f(u.iCam, cx, cy, zoom, roll);
      gl.uniform1f(u.iCamZoom, zoom);
    } else gl.uniform1f(u.iCamZoom, 1);
    if (sim) {
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, sim.dyeTex); gl.uniform1i(u.iChannel1, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, sim.velTex); gl.uniform1i(u.iChannel2, 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, sim.waveTex); gl.uniform1i(u.iChannel3, 5);
      const [tx, ty] = sim.waveTexel; gl.uniform2f(u.iSimTexel, tx, ty);
    }
    gl.uniform2f(u.iResolution, w, h);
    gl.uniform1f(u.iTime, ctx.time);
    const au = ctx.audio;
    const e = CALM_AUDIO_MODES.has(base) ? this.envelope(id, au, ctx.clock) : null;
    gl.uniform1f(u.iBass, e ? e.b : au.bass);
    gl.uniform1f(u.iMid, e ? e.m : au.mid);
    gl.uniform1f(u.iTreble, e ? e.t : au.treble);
    gl.uniform1f(u.iLevel, e ? e.l : au.level);
    const c = (i: number) => ctx.colors[i] ?? [1, 1, 1];
    gl.uniform3f(u.iC0, c(0)[0], c(0)[1], c(0)[2]);
    gl.uniform3f(u.iC1, c(1)[0], c(1)[1], c(1)[2]);
    gl.uniform3f(u.iC2, c(2)[0], c(2)[1], c(2)[2]);
    if (u.iVocal) gl.uniform3fv(u.iVocal, this.vocalHistory(id, au));
    if (u.iStage) {
      let ears = this.stageEars.get(id);
      if (!ears) { ears = new StageAudio(); this.stageEars.set(id, ears); }
      const cue = ears.update(au, ctx.clock);
      gl.uniform4f(u.iStage, cue.stage[0], cue.stage[1], cue.stage[2], cue.stage[3]);
      gl.uniform4f(u.iStage2, cue.stage2[0], cue.stage2[1], cue.stage2[2], cue.stage2[3]);
    }
    gl.uniform1f(u.iParam0, ctx.params[0] ?? 0.5);
    gl.uniform1f(u.iParam1, ctx.params[1] ?? 0.5);
    gl.uniform1f(u.iParam2, ctx.params[2] ?? 0.5);
    gl.uniform1f(u.iParam3, ctx.params[3] ?? 0.5);

    if (u.iHDR) gl.uniform1f(u.iHDR, lens ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    if (lens) lens.develop(id, target, ctx.time);
    return target.tex;
  }

  private vocalHistory(id: string, audio: AudioTexture): Float32Array {
    const now = performance.now() / 1000;
    let v = this.vocals.get(id);
    if (!v) { v = { hist: new Float32Array(VOCAL_N * 3), fast: [0, 0, 0], slow: [0, 0, 0], acc: 0, at: now }; this.vocals.set(id, v); }
    const dt = Math.min(0.25, Math.max(0, now - v.at)); v.at = now;
    const sample = [0, 0, 0];
    for (let b = 0; b < 3; b++) {
      const x = audio.vocal?.[b] ?? 0;
      const tauF = x > v.fast[b] ? 0.03 : 0.16;
      v.fast[b] += (x - v.fast[b]) * (1 - Math.exp(-dt / tauF));
      v.slow[b] += (x - v.slow[b]) * (1 - Math.exp(-dt / 1.6));
      sample[b] = Math.min(1, Math.max(0, (v.fast[b] - v.slow[b] * 0.9) * 4.5) + v.fast[b] * 0.35);
    }
    v.acc += dt;
    while (v.acc >= 1 / VOCAL_HZ) {
      v.acc -= 1 / VOCAL_HZ;
      v.hist.copyWithin(3, 0, (VOCAL_N - 1) * 3);
      v.hist[0] = sample[0]; v.hist[1] = sample[1]; v.hist[2] = sample[2];
    }
    return v.hist;
  }

  private envelope(id: string, audio: AudioTexture, clock?: number): Env {
    const now = clock ?? performance.now() / 1000;
    let e = this.envs.get(id);
    if (!e) { e = { b: audio.bass, m: audio.mid, t: audio.treble, l: audio.level, at: now }; this.envs.set(id, e); return e; }
    const dt = Math.min(0.25, Math.max(0, now - e.at));
    e.at = now;
    const follow = (cur: number, target: number) => {
      const tau = target > cur ? CALM_ATTACK : CALM_RELEASE;
      return cur + (target - cur) * (1 - Math.exp(-dt / tau));
    };
    e.b = follow(e.b, audio.bass); e.m = follow(e.m, audio.mid);
    e.t = follow(e.t, audio.treble); e.l = follow(e.l, audio.level);
    return e;
  }

  dispose() {
    const gl = this.gl;
    this.envs.clear();
    this.vocals.clear();
    this.stageEars.clear();
    this.lens?.dispose(); this.lens = undefined;
    this.sims.forEach(s => s.dispose());
    this.sims.clear(); this.simModes.clear();
    this.directors.clear();
    this.pool.forEach(t => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    this.progs.forEach(e => gl.deleteProgram(e.p));
    this.pending.forEach(pp => { gl.deleteShader(pp.vs); gl.deleteShader(pp.fs); gl.deleteProgram(pp.prog); });
    this.pending.clear();
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
