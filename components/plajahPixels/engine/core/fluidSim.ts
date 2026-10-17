// fluidSim — a real, stateful GPU fluid for the FLUID_* generators (and a flow map for the nebulae).
//
// The stateless generators could only *re-map* a pattern each frame, so music could make them
// wobble but never actually push the liquid. This keeps state between frames:
//
//   velocity   Stam's "Stable Fluids": semi-Lagrangian self-advection, vorticity confinement
//              (the curls that make smoke and ink look alive), and a Jacobi pressure projection
//              that keeps the flow incompressible (∇·u = 0), so a push becomes a swirl, not a smear.
//   dye        advected with Catmull–Rom (bicubic) sampling so filaments stay sharp. Per mode it is
//              ink concentrations, film thickness, temperature, or a *material-coordinate map*
//              (where this parcel of paint started) that the look shader turns into any pattern.
//   waves      the damped wave equation  ∂²h/∂t² = c²∇²h − γ∂h/∂t, carried along by the flow and
//              reflected by the container walls — real ripples that refract the dye and focus light.
//
// Music is energy, not modulation: a kick is an impulse, a sung syllable releases a vortex, a drop
// of dye and a ring of waves at its vocal range's point; sustained singing stirs; treble adds fine
// turbulence. Whatever it does persists and decays naturally. An ambient curl-noise breeze means
// the liquid never stops, music or not.

import { GL, createProgram } from './glUtil';
import type { AudioTexture } from './audioTexture';

/** Mode → sim behaviour id (the shaders branch on it). */
export const SIM_MODE_ID: Record<string, number> = {
  FLUID_INK: 0, FLUID_MARBLE: 1, FLUID_LAMP: 2, FLUID_OILFILM: 3, FLUID_VORTEX: 4,
  FLUID_DENSITY: 5, FLUID_SILK: 6, FLUID_SHEAR: 7, FLUID_CONVECTION: 8, FLUID_CAUSTIC: 9,
};
export const NEBULA_SIM_ID = 20;      // gas: compressible, sound and shock waves
export const PLASMA_ARC_ID = 21;      // plasma, field along the curtain (aurora arcs)
export const PLASMA_RADIAL_ID = 22;   // plasma, field along rays from a point (aurora corona)
export const PLASMA_SHELL_ID = 23;    // plasma, field wrapped around a shell (remnants, planetary)
/** Which medium a cosmic generator is made of. */
export function cosmicSimId(mode: string): number | undefined {
  if (!mode.startsWith('COSMIC_')) return undefined;
  if (mode === 'COSMIC_AURORA_VEIL' || mode === 'COSMIC_AURORA_LAKE') return PLASMA_ARC_ID;
  if (mode === 'COSMIC_CORONA') return PLASMA_RADIAL_ID;
  if (mode === 'COSMIC_REMNANT' || mode === 'COSMIC_PLANETARY') return PLASMA_SHELL_ID;
  return NEBULA_SIM_ID;
}
interface MediumCfg { cs2: number; va2: number; gamma: number; k: number; ambient: number; field: number; center: [number, number] }
// c_s² sound speed², v_A² Alfvén speed², γ damping, k restoring pull, field: 0 none · 1 along x · 2 radial · 3 tangential
const MEDIUM: Record<number, MediumCfg> = {
  20: { cs2: 0.060, va2: 0.000, gamma: 0.55, k: 0.22, ambient: 0.020, field: 0, center: [0, 0] },
  21: { cs2: 0.015, va2: 0.110, gamma: 0.45, k: 0.30, ambient: 0.012, field: 1, center: [0, 0] },
  22: { cs2: 0.015, va2: 0.090, gamma: 0.45, k: 0.30, ambient: 0.010, field: 2, center: [0.07, 0.05] },
  23: { cs2: 0.030, va2: 0.080, gamma: 0.50, k: 0.28, ambient: 0.012, field: 3, center: [0, 0] },
};

interface ModeCfg {
  curl: number;       // vorticity confinement
  velDiss: number;    // velocity damping, 1/s
  dyeDiss: number;    // dye fade, 1/s (concentration modes)
  relax: number;      // pull of coordinate/colour fields back toward rest, 1/s
  ambient: number;    // curl-noise breeze
  buoy: number;       // buoyancy / stratification strength
  shear: number;      // shear relaxation (KH) or steady stir (dish)
  iters: number;      // pressure iterations
  wave: boolean;
  velH: number;       // velocity grid height
}
const CFG: Record<number, ModeCfg> = {
  0: { curl: 0.035, velDiss: 0.6, dyeDiss: 0.06, relax: 0, ambient: 0.07, buoy: 0.10, shear: 0, iters: 20, wave: true, velH: 128 },
  1: { curl: 0.020, velDiss: 0.7, dyeDiss: 0, relax: 0.010, ambient: 0.09, buoy: 0, shear: 0, iters: 20, wave: true, velH: 128 },
  2: { curl: 0.025, velDiss: 0.8, dyeDiss: 0.2, relax: 0, ambient: 0.04, buoy: 0.35, shear: 0, iters: 20, wave: true, velH: 128 },
  3: { curl: 0.025, velDiss: 0.7, dyeDiss: 0, relax: 0.035, ambient: 0.09, buoy: 0, shear: 0, iters: 20, wave: true, velH: 128 },
  4: { curl: 0.025, velDiss: 0.45, dyeDiss: 0.015, relax: 0, ambient: 0.03, buoy: 0, shear: 0.6, iters: 24, wave: true, velH: 128 },
  5: { curl: 0.010, velDiss: 0.5, dyeDiss: 0, relax: 0.025, ambient: 0.02, buoy: 2.2, shear: 0, iters: 24, wave: true, velH: 128 },
  6: { curl: 0.020, velDiss: 0.7, dyeDiss: 0, relax: 0.010, ambient: 0.09, buoy: 0, shear: 0, iters: 20, wave: true, velH: 128 },
  7: { curl: 0.000, velDiss: 0.10, dyeDiss: 0, relax: 0.020, ambient: 0.012, buoy: 0, shear: 0.8, iters: 24, wave: true, velH: 128 },
  8: { curl: 0.020, velDiss: 0.5, dyeDiss: 0, relax: 0.006, ambient: 0.02, buoy: 0.55, shear: 0, iters: 24, wave: true, velH: 128 },
  9: { curl: 0.020, velDiss: 0.6, dyeDiss: 0, relax: 0.030, ambient: 0.05, buoy: 0, shear: 0, iters: 20, wave: true, velH: 128 },
  20: { curl: 0, velDiss: 0, dyeDiss: 0, relax: 0, ambient: 0, buoy: 0, shear: 0, iters: 0, wave: false, velH: 96 },
};

// ── shaders ──────────────────────────────────────────────────────────────────

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const PRELUDE = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
uniform vec2 uTexel;
uniform float uAspect, uDt, uTime;
uniform int uMode;
vec2 toP(vec2 uv){ return vec2((uv.x - 0.5) * uAspect, uv.y - 0.5); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.03 + 11.7; a *= 0.5; } return s / 0.9375; }
vec3 noised(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
}
// Divergence-free breeze: the curl of two drifting noise octaves.
vec2 curlN(vec2 p, float t){
  vec3 a = noised(p + vec2(t * 0.7, -t * 0.5));
  vec3 b = noised(p * 2.1 + vec2(-t * 0.9, t * 0.6) + 5.7);
  vec2 g = a.yz + b.yz * 1.05;
  return vec2(g.y, -g.x);
}
// Container walls per mode (signed distance, negative inside the liquid).
float containerSD(vec2 p){
  if (uMode == 4) return length(p) - 0.46;
  if (uMode == 9) return length(p) - 0.47;
  if (uMode == 2) return abs(p.x) - 0.40;
  if (uMode == 5) return max(abs(p.x) - 0.64, max(-0.42 - p.y, p.y - 0.36));
  return max(abs(p.x) - uAspect * 0.5, abs(p.y) - 0.5);
}
float inside(vec2 uv){ return step(containerSD(toP(uv)), 0.0); }
`;

const SPLATS = `
uniform vec4 uSA[12];   // x, y, radius, kind (0 push · 1 swirl · 2 burst)
uniform vec4 uSB[12];   // force x, force y, strength, wave amplitude
uniform vec4 uSC[12];   // dye r, g, b, amount
uniform int uSN;
`;

const FORCE_FS = PRELUDE + SPLATS + `
uniform sampler2D uVel, uDye;
uniform float uAmbient, uTreb, uBuoy, uShear, uVoiceStir;
uniform vec2 uStirPos;
void main(){
  vec2 p = toP(vUv);
  vec2 v = texture(uVel, vUv).xy;
  vec4 d = texture(uDye, vUv);
  vec2 F = uAmbient * curlN(p * 2.0 + 3.1, uTime * 0.12);
  F += uTreb * curlN(p * 5.0 + 9.0, uTime * 0.4) * (uMode == 7 ? 0.05 : 0.18);   // treble: a light fine stir
  if (uMode == 0) F.y -= uBuoy * clamp(d.r + d.g + d.b, 0.0, 2.0);          // ink is heavier than water
  if (uMode == 2) F.y += uBuoy * (d.a - 0.2);                               // the lamp heats from below
  if (uMode == 5) F.y += uBuoy * (d.g - p.y);                               // stratified: displaced parcels spring back
  if (uMode == 8) F.y += uBuoy * (d.a - 0.5);                               // hot rises, cold sinks
  if (uMode == 7) {                                                         // shear layers (Kelvin–Helmholtz)
    float U = 0.14 * (tanh((p.y - 0.22) / 0.05) - tanh((p.y + 0.22) / 0.05) + 1.0);
    F.x += uShear * (U - v.x);
  }
  if (uMode == 4) F += uShear * 0.25 * vec2(-p.y, p.x) * exp(-dot(p, p) / 0.05);   // a slow steady stir
  vec2 sd = p - uStirPos;
  F += uVoiceStir * vec2(-sd.y, sd.x) / 0.08 * exp(-dot(sd, sd) / 0.0064);      // a voice holding a note stirs
  v += F * uDt;
  for (int i = 0; i < 12; i++){
    if (i >= uSN) break;
    vec4 a = uSA[i], b = uSB[i];
    vec2 dd = p - a.xy;
    float g = exp(-dot(dd, dd) / (a.z * a.z));
    if (a.w < 0.5) v += b.xy * b.z * g;
    else if (a.w < 1.5) v += vec2(-dd.y, dd.x) / a.z * b.z * g;
    else v += dd / a.z * b.z * g;
  }
  v *= inside(vUv);
  float sp = length(v);
  if (sp > 1.5) v *= 1.5 / sp;
  o = vec4(v, 0.0, 1.0);
}`;

const CURL_FS = PRELUDE + `
uniform sampler2D uVel;
void main(){
  float hx = uTexel.x * uAspect, hy = uTexel.y;
  float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).y, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture(uVel, vUv - vec2(0.0, uTexel.y)).x, T = texture(uVel, vUv + vec2(0.0, uTexel.y)).x;
  o = vec4((R - L) / (2.0 * hx) - (T - B) / (2.0 * hy), 0.0, 0.0, 1.0);
}`;

const VORT_FS = PRELUDE + `
uniform sampler2D uVel, uCurl;
uniform float uCurlK;
void main(){
  float L = abs(texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x), R = abs(texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x);
  float B = abs(texture(uCurl, vUv - vec2(0.0, uTexel.y)).x), T = abs(texture(uCurl, vUv + vec2(0.0, uTexel.y)).x);
  float C = texture(uCurl, vUv).x;
  vec2 f = vec2(T - B, R - L);
  f /= length(f) + 1e-5;
  f *= uCurlK * C;
  f.y *= -1.0;
  vec2 v = texture(uVel, vUv).xy + f * uDt;
  o = vec4(v * inside(vUv), 0.0, 1.0);
}`;

const DIV_FS = PRELUDE + `
uniform sampler2D uVel;
void main(){
  float hx = uTexel.x * uAspect, hy = uTexel.y;
  vec2 C = texture(uVel, vUv).xy;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  vec2 L = texture(uVel, vUv - dx).xy, R = texture(uVel, vUv + dx).xy, B = texture(uVel, vUv - dy).xy, T = texture(uVel, vUv + dy).xy;
  if (inside(vUv - dx) < 0.5) L.x = -C.x;
  if (inside(vUv + dx) < 0.5) R.x = -C.x;
  if (inside(vUv - dy) < 0.5) B.y = -C.y;
  if (inside(vUv + dy) < 0.5) T.y = -C.y;
  o = vec4(0.5 * ((R.x - L.x) / hx + (T.y - B.y) / hy), 0.0, 0.0, 1.0);
}`;

const PSCALE_FS = PRELUDE + `
uniform sampler2D uP;
void main(){ o = vec4(texture(uP, vUv).x * 0.8, 0.0, 0.0, 1.0); }`;

const JACOBI_FS = PRELUDE + `
uniform sampler2D uP, uDiv;
void main(){
  float h2 = uTexel.x * uAspect * uTexel.y;
  float C = texture(uP, vUv).x;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float L = inside(vUv - dx) > 0.5 ? texture(uP, vUv - dx).x : C;
  float R = inside(vUv + dx) > 0.5 ? texture(uP, vUv + dx).x : C;
  float B = inside(vUv - dy) > 0.5 ? texture(uP, vUv - dy).x : C;
  float T = inside(vUv + dy) > 0.5 ? texture(uP, vUv + dy).x : C;
  o = vec4((L + R + B + T - texture(uDiv, vUv).x * h2) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRAD_FS = PRELUDE + `
uniform sampler2D uP, uVel;
void main(){
  float hx = uTexel.x * uAspect, hy = uTexel.y;
  float C = texture(uP, vUv).x;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float L = inside(vUv - dx) > 0.5 ? texture(uP, vUv - dx).x : C;
  float R = inside(vUv + dx) > 0.5 ? texture(uP, vUv + dx).x : C;
  float B = inside(vUv - dy) > 0.5 ? texture(uP, vUv - dy).x : C;
  float T = inside(vUv + dy) > 0.5 ? texture(uP, vUv + dy).x : C;
  vec2 v = texture(uVel, vUv).xy - 0.5 * vec2((R - L) / hx, (T - B) / hy);
  o = vec4(v * inside(vUv), 0.0, 1.0);
}`;

const ADVECT_VEL_FS = PRELUDE + `
uniform sampler2D uVel;
uniform float uDiss;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 back = vUv - v * uDt * vec2(1.0 / uAspect, 1.0);
  vec2 nv = texture(uVel, back).xy / (1.0 + uDiss * uDt);
  o = vec4(nv * inside(vUv), 0.0, 1.0);
}`;

// The resting state of each mode's dye (initial fill, and what relaxing fields drift back to).
const INIT_DYE = `
vec4 initDye(vec2 p){
  if (uMode == 4) {
    vec3 c;
    for (int k = 0; k < 3; k++){
      float a = 0.6 + float(k) * 2.0944;
      vec2 cc = 0.19 * vec2(cos(a), sin(a));
      c[k] = exp(-dot(p - cc, p - cc) / 0.008) + 0.7 * exp(-pow((length(p - cc) - 0.09) / 0.012, 2.0));
    }
    return vec4(c, 0.0);
  }
  if (uMode == 9) return vec4(smoothstep(0.35, 0.70, fbm(p * 2.6)), smoothstep(0.45, 0.80, fbm(p * 3.4 + 7.0)), smoothstep(0.50, 0.85, fbm(p * 2.0 + 13.0)), 0.0);
  if (uMode == 3) return vec4(fbm(p * 1.4) * 0.75 + fbm(p * 4.5 + 3.0) * 0.25, smoothstep(0.38, 0.58, fbm(p * 0.7 + 21.0)), 0.0, 0.0);
  if (uMode == 8) return vec4(p, 0.0, 0.5 - p.y);
  if (uMode == 1 || uMode == 5 || uMode == 6 || uMode == 7) return vec4(p, 0.0, 0.0);
  return vec4(0.0);
}`;

const INIT_FS = PRELUDE + INIT_DYE + `
void main(){ o = initDye(toP(vUv)); }`;

const DYE_FS = PRELUDE + SPLATS + INIT_DYE + `
uniform sampler2D uVel, uDye;
uniform vec2 uDyeSize;
uniform float uDiss, uRelax, uPour;
// Catmull–Rom bicubic in 9 bilinear taps: keeps advected filaments crisp.
vec4 bicubic(sampler2D t, vec2 uv, vec2 size){
  vec2 sp = uv * size, tp = floor(sp - 0.5) + 0.5, f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / w12;
  vec2 t0 = (tp - 1.0) / size, t3 = (tp + 2.0) / size, t12 = (tp + o12) / size;
  vec4 r = vec4(0.0);
  r += texture(t, vec2(t0.x, t0.y)) * w0.x * w0.y;  r += texture(t, vec2(t12.x, t0.y)) * w12.x * w0.y;  r += texture(t, vec2(t3.x, t0.y)) * w3.x * w0.y;
  r += texture(t, vec2(t0.x, t12.y)) * w0.x * w12.y; r += texture(t, vec2(t12.x, t12.y)) * w12.x * w12.y; r += texture(t, vec2(t3.x, t12.y)) * w3.x * w12.y;
  r += texture(t, vec2(t0.x, t3.y)) * w0.x * w3.y;  r += texture(t, vec2(t12.x, t3.y)) * w12.x * w3.y;  r += texture(t, vec2(t3.x, t3.y)) * w3.x * w3.y;
  return r;
}
void main(){
  vec2 p = toP(vUv);
  vec2 v = texture(uVel, vUv).xy;
  vec2 back = vUv - v * uDt * vec2(1.0 / uAspect, 1.0);
  vec4 d = bicubic(uDye, back, uDyeSize);
  float relaxK = 1.0 - exp(-uRelax * uDt);
  bool coords = uMode == 1 || uMode == 5 || uMode == 6 || uMode == 7 || uMode == 8 || uMode == 20;
  if (coords) d.rg = mix(d.rg, p, relaxK);
  else d.rgb *= exp(-uDiss * uDt);
  if (uMode == 3 || uMode == 9) d = mix(d, initDye(p), relaxK);
  if (uMode == 4) d.rgb = mix(d.rgb, initDye(p).rgb, 0.012 * uDt * step(dot(d.rgb, vec3(1.0)), 0.3));   // a drained dish slowly refills
  if (uMode == 0) {                                     // three inks dropped in from the top, in puffs
    for (int k = 0; k < 3; k++){
      float fk = float(k);
      vec2 s = vec2((fk - 1.0) * 0.55 * uAspect * 0.5 + 0.08 * sin(uTime * 0.07 + fk * 2.0), 0.46);
      float puff = smoothstep(0.2, 0.8, sin(uTime * 0.55 + fk * 2.1)) * (0.6 + uPour);
      d[k] += puff * uDt * 2.2 * exp(-dot(p - s, p - s) / 0.0012);
    }
  }
  if (uMode == 2) d.a = mix(d.a * exp(-0.6 * uDt), 1.0, smoothstep(-0.40, -0.47, p.y) * 0.25);   // heat at the bulb
  if (uMode == 8) {                                      // a hot plate below, a cool lid above
    d.a = mix(d.a, 1.0, smoothstep(-0.44, -0.49, p.y) * 0.5);
    d.a = mix(d.a, 0.0, smoothstep(0.44, 0.49, p.y) * 0.5);
  }
  for (int i = 0; i < 12; i++){
    if (i >= uSN) break;
    vec4 a = uSA[i], c = uSC[i];
    if (c.a <= 0.0) continue;
    vec2 dd = p - a.xy;
    float g = exp(-dot(dd, dd) / (a.z * a.z * 0.35));
    if (uMode == 3) d.r = min(d.r + c.a * g * 0.12, 1.0);
    else if (!coords) d.rgb += c.rgb * c.a * g;
  }
  if (!coords) d.rgb = clamp(d.rgb, 0.0, 3.0);
  o = d;
}`;

const WAVE_FS = PRELUDE + SPLATS + `
uniform sampler2D uWave, uVel;
uniform float uC2, uDamp;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 uv = vUv - v * uDt * 0.6 * vec2(1.0 / uAspect, 1.0);         // ripples ride the current
  vec2 hh = texture(uWave, uv).rg;
  float h = hh.r, hp = hh.g;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  float L = inside(uv - dx) > 0.5 ? texture(uWave, uv - dx).r : h;    // walls reflect
  float R = inside(uv + dx) > 0.5 ? texture(uWave, uv + dx).r : h;
  float B = inside(uv - dy) > 0.5 ? texture(uWave, uv - dy).r : h;
  float T = inside(uv + dy) > 0.5 ? texture(uWave, uv + dy).r : h;
  float hn = h + (h - hp) * uDamp + uC2 * (L + R + B + T - 4.0 * h);
  vec2 p = toP(vUv);
  for (int i = 0; i < 12; i++){
    if (i >= uSN) break;
    vec4 a = uSA[i];
    float amp = uSB[i].w;
    if (amp == 0.0) continue;
    vec2 dd = p - a.xy;
    float r = a.z * 0.45;
    hn += amp * exp(-dot(dd, dd) / (r * r));
  }
  float m = inside(vUv);
  o = vec4(hn * m, h * m, 0.0, 1.0);
}`;

// Gas and plasma: linear MHD waves in a displacement field ξ (rg) with velocity v (ba).
//   ∂v/∂t = c_s² ∇(∇·ξ)          sound: compression waves, shocks from impulses
//         + v_A² (b·∇)² ξ         Alfvén: transverse waves running along the magnetic field b
//         − γ v − k ξ             radiative damping, and the cloud's pull back to rest
//         + turbulent forcing     so the clouds never stop drifting
//   ∂ξ/∂t = v
// No pressure projection — gas compresses, it doesn't fold like a liquid. The look shader
// reads ρ'/ρ = −∇·ξ: compressed gas emits more (∝ ρ²), so a shock front lights up as it passes.
const GAS_FS = PRELUDE + SPLATS + `
uniform sampler2D uState;
uniform float uCs2, uVa2, uGamma, uK, uAmbient;
uniform int uField;
uniform vec2 uCenter;
vec2 X(vec2 uv){ return texture(uState, uv).rg; }
vec2 fieldDir(vec2 p){
  if (uField == 1) return vec2(1.0, 0.0);
  vec2 d = p - uCenter; float l = length(d) + 1e-4;
  if (uField == 2) return d / l;
  return vec2(-d.y, d.x) / l;
}
void main(){
  vec2 p = toP(vUv);
  vec4 st = texture(uState, vUv);
  vec2 xi = st.rg, v = st.ba;
  vec2 ex = vec2(uTexel.x, 0.0), ey = vec2(0.0, uTexel.y);
  float hx = uTexel.x * uAspect, hy = uTexel.y;
  vec2 L = X(vUv - ex), R = X(vUv + ex), B = X(vUv - ey), T = X(vUv + ey);
  vec2 xx = (R - 2.0 * xi + L) / (hx * hx);
  vec2 yy = (T - 2.0 * xi + B) / (hy * hy);
  vec2 xy = (X(vUv + ex + ey) - X(vUv - ex + ey) - X(vUv + ex - ey) + X(vUv - ex - ey)) / (4.0 * hx * hy);
  vec2 gradDiv = vec2(xx.x + xy.y, xy.x + yy.y);
  vec2 acc = uCs2 * gradDiv - uGamma * v - uK * xi + uAmbient * curlN(p * 1.6 + 2.0, uTime * 0.08);
  vec2 b = fieldDir(p);
  if (uField > 0) acc += uVa2 * (b.x * b.x * xx + 2.0 * b.x * b.y * xy + b.y * b.y * yy);
  v += acc * uDt;
  for (int i = 0; i < 12; i++){
    if (i >= uSN) break;
    vec4 a = uSA[i], f = uSB[i];
    vec2 dd = p - a.xy;
    float g = exp(-dot(dd, dd) / (a.z * a.z));
    if (a.w < 0.5) v += f.xy * f.z * g;                          // push
    else if (a.w < 2.5) v += dd / a.z * f.z * g;                 // blast: gas thrown outward
    else v += vec2(-b.y, b.x) * f.z * g;                         // pluck the field line sideways
  }
  xi += v * uDt;
  float lx = length(xi);
  if (lx > 0.15) xi *= 0.15 / lx;
  float edge = smoothstep(0.0, 0.03, min(min(vUv.x, 1.0 - vUv.x) * uAspect, min(vUv.y, 1.0 - vUv.y)));
  o = vec4(xi * edge, v * edge);
}`;

// ── GL plumbing ──────────────────────────────────────────────────────────────

interface FT { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
function makeFT(gl: GL, w: number, h: number): FT {
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
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, fbo, w, h };
}
class Pair {
  a: FT; b: FT;
  constructor(gl: GL, w: number, h: number) { this.a = makeFT(gl, w, h); this.b = makeFT(gl, w, h); }
  get read() { return this.a; }
  get write() { return this.b; }
  swap() { const t = this.a; this.a = this.b; this.b = t; }
  dispose(gl: GL) { for (const t of [this.a, this.b]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } }
}

interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }
const PROGS = new WeakMap<GL, Record<string, Prog>>();
const SOURCES: Record<string, string> = {
  force: FORCE_FS, curl: CURL_FS, vort: VORT_FS, div: DIV_FS, pscale: PSCALE_FS, jacobi: JACOBI_FS,
  grad: GRAD_FS, advVel: ADVECT_VEL_FS, dye: DYE_FS, init: INIT_FS, wave: WAVE_FS, gas: GAS_FS,
};
function progs(gl: GL): Record<string, Prog> {
  let r = PROGS.get(gl);
  if (!r) {
    r = {};
    for (const [k, fs] of Object.entries(SOURCES)) r[k] = { p: createProgram(gl, VS, fs), u: new Map() };
    PROGS.set(gl, r);
  }
  return r;
}

const supportCache = new WeakMap<GL, boolean>();
/** Half-float render targets are needed (EXT_color_buffer_float); without them the stateless shaders run. */
export function simSupported(gl: GL): boolean {
  let ok = supportCache.get(gl);
  if (ok === undefined) {
    ok = !!gl.getExtension('EXT_color_buffer_float');
    if (ok) { try { progs(gl); } catch (e) { console.warn('[fluidSim] disabled:', e); ok = false; } }
    supportCache.set(gl, ok);
  }
  return ok;
}

// Small deterministic PRNG for event placement.
function mulberry(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

interface Splat { x: number; y: number; r: number; kind: number; fx: number; fy: number; s: number; wave: number; dye: [number, number, number]; amount: number }

// ── the simulation ───────────────────────────────────────────────────────────

export class FluidSim {
  readonly cfg: ModeCfg;
  private vel!: Pair; private pres!: Pair; private dye!: Pair; private wave?: Pair;
  private div!: FT; private curl!: FT;
  private aspect = 16 / 9;
  private lastT = -1;
  private simT = 0;
  private rnd = mulberry(1234);
  // audio envelopes
  private bassF = 0; private bassS = 0;
  private vocF = [0, 0, 0]; private vocS = [0, 0, 0];
  private treb = 0; private lastOnset = [-9, -9, -9, -9];
  private kickSide = 1;
  private splats: Splat[] = [];
  private sa = new Float32Array(48); private sb = new Float32Array(48); private sc = new Float32Array(48);

  constructor(private gl: GL, readonly modeId: number, private quad: WebGLVertexArrayObject) {
    this.cfg = CFG[modeId] ?? (modeId >= 20 ? CFG[20] : CFG[0]);
  }

  /** Dye (or flow map), velocity and wave height textures for the look shader. */
  get dyeTex() { return this.dye.read.tex; }
  get velTex() { return this.vel.read.tex; }
  get waveTex() { return (this.wave ?? this.dye).read.tex; }
  get waveTexel(): [number, number] { const t = (this.wave ?? this.dye).read; return [1 / t.w, 1 / t.h]; }

  private alloc(aspect: number, outH: number) {
    this.free();
    const gl = this.gl;
    this.aspect = aspect;
    const vh = this.cfg.velH, vw = Math.max(8, Math.round(vh * aspect));
    this.vel = new Pair(gl, vw, vh); this.pres = new Pair(gl, vw, vh);
    this.div = makeFT(gl, vw, vh); this.curl = makeFT(gl, vw, vh);
    const dh = this.modeId >= 20 ? vh : Math.max(180, Math.min(400, Math.round(outH * 0.55)));
    this.dye = new Pair(gl, Math.round(dh * aspect), dh);
    if (this.cfg.wave) { const wh = 200; this.wave = new Pair(gl, Math.round(wh * aspect), wh); }
    this.pass('init', this.dye.write, () => {});
    this.dye.swap();
  }

  private free() {
    const gl = this.gl;
    if (!this.vel) return;
    this.vel.dispose(gl); this.pres.dispose(gl); this.dye.dispose(gl); this.wave?.dispose(gl);
    for (const t of [this.div, this.curl]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    this.wave = undefined;
  }

  dispose() { this.free(); }

  private pass(name: string, target: FT, setup: (u: (n: string) => WebGLUniformLocation | null, bind: (n: string, t: WebGLTexture) => void) => void) {
    const gl = this.gl;
    const pr = progs(gl)[name];
    const u = (n: string) => { if (!pr.u.has(n)) pr.u.set(n, gl.getUniformLocation(pr.p, n)); return pr.u.get(n)!; };
    let unit = 0;
    const bind = (n: string, t: WebGLTexture) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u(n), unit); unit++; };
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(pr.p);
    gl.uniform2f(u('uTexel'), 1 / target.w, 1 / target.h);
    gl.uniform1f(u('uAspect'), this.aspect);
    gl.uniform1f(u('uDt'), this.dt);
    gl.uniform1f(u('uTime'), this.simT);
    gl.uniform1i(u('uMode'), this.modeId);
    setup(u, bind);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  private dt = 1 / 60;

  private setSplats(u: (n: string) => WebGLUniformLocation | null, list: Splat[]) {
    const gl = this.gl;
    const n = Math.min(12, list.length);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      this.sa.set([s.x, s.y, s.r, s.kind], i * 4);
      this.sb.set([s.fx, s.fy, s.s, s.wave], i * 4);
      this.sc.set([s.dye[0], s.dye[1], s.dye[2], s.amount], i * 4);
    }
    gl.uniform4fv(u('uSA'), this.sa); gl.uniform4fv(u('uSB'), this.sb); gl.uniform4fv(u('uSC'), this.sc);
    gl.uniform1i(u('uSN'), n);
  }

  /** Where each vocal range "sings" from: a slow wandering point inside the container. */
  private bandHome(b: number): [number, number] {
    const t = this.simT;
    const m = this.modeId;
    const R = m === 4 || m === 9 ? 0.26 : m === 2 ? 0.22 : 0.42;
    const Ry = m === 4 || m === 9 ? 0.26 : m === 5 ? 0.22 : 0.30;
    const ph = b * 2.1;
    return [R * Math.sin(t * (0.05 + b * 0.013) + ph) * (b === 0 ? 0.5 : 1), Ry * Math.sin(t * (0.037 + b * 0.011) + ph * 1.7) * (b === 0 ? 0.6 : 1)];
  }

  /** Turn this frame's audio into impulses (onsets) and continuous drive. */
  private listen(audio: AudioTexture, dt: number, gain: number) {
    const fol = (cur: number, x: number, up: number, down: number) => cur + (x - cur) * (1 - Math.exp(-dt / (x > cur ? up : down)));
    const sp: Splat[] = [];
    const now = this.simT;
    const m = this.modeId;
    const jit = () => (this.rnd() - 0.5);

    // Kick / bass onset → an impulse whose shape suits the vessel.
    const bass = audio.bass;
    this.bassF = fol(this.bassF, bass, 0.02, 0.12);
    this.bassS = fol(this.bassS, bass, 0.6, 0.6);
    const kick = this.bassF - this.bassS * 1.08;
    if (kick > 0.05 && now - this.lastOnset[3] > 0.22) {
      this.lastOnset[3] = now;
      const s = Math.min(1.4, kick * 7) * gain;
      if (m === 0 || m === 2 || m === 8) sp.push({ x: jit() * 0.6, y: -0.42, r: 0.14, kind: 0, fx: 0, fy: 1, s: 0.22 * s, wave: 0, dye: [0, 0, 0], amount: 0 });
      else if (m === 5) { this.kickSide = -this.kickSide; sp.push({ x: this.kickSide * 0.55, y: jit() * 0.4, r: 0.18, kind: 0, fx: -this.kickSide, fy: 0, s: 0.12 * s, wave: 0.25 * s, dye: [0, 0, 0], amount: 0 }); }
      else if (m === 7) sp.push({ x: jit() * 1.4, y: (this.rnd() > 0.5 ? 0.22 : -0.22), r: 0.1, kind: 1, fx: 0, fy: 0, s: 0.2 * s * (this.rnd() > 0.5 ? 1 : -1), wave: 0, dye: [0, 0, 0], amount: 0 });
      else sp.push({ x: jit() * 0.3, y: jit() * 0.3, r: 0.16, kind: 2, fx: 0, fy: 0, s: 0.12 * s, wave: 0.6 * s, dye: [0, 0, 0], amount: 0 });
    }

    // Vocal ranges: each syllable (onset) releases a vortex, a drop of its colour and a ring of waves.
    const radius = [0.075, 0.045, 0.022];
    const swirl = [0.30, 0.24, 0.14];
    const waveAmp = [0.55, 0.40, 0.22];
    const gap = [0.16, 0.12, 0.08];
    let held = 0;
    for (let b = 0; b < 3; b++) {
      const x = audio.vocal?.[b] ?? 0;
      this.vocF[b] = fol(this.vocF[b], x, 0.025, 0.14);
      this.vocS[b] = fol(this.vocS[b], x, 1.2, 1.2);
      held += this.vocF[b];
      const on = this.vocF[b] - this.vocS[b] * 1.05;
      if (on > 0.035 && now - this.lastOnset[b] > gap[b]) {
        this.lastOnset[b] = now;
        const s = Math.min(1.5, on * 9) * gain;
        const [hx, hy] = this.bandHome(b);
        const drops = b === 2 ? 3 : 1;                     // sibilance scatters a few fine drops
        for (let k = 0; k < drops; k++) {
          const x0 = hx + jit() * (b === 2 ? 0.16 : 0.06), y0 = hy + jit() * (b === 2 ? 0.12 : 0.05);
          const dye: [number, number, number] = [b === 0 ? 1 : 0, b === 1 ? 1 : 0, b === 2 ? 1 : 0];
          if (m === NEBULA_SIM_ID) { if (k === 0) sp.push({ x: x0 * 1.6, y: y0 * 1.4, r: radius[b] * 2.2, kind: 1, fx: 0, fy: 0, s: swirl[b] * 0.16 * s * (this.rnd() > 0.5 ? 1 : -1), wave: 0, dye, amount: 0 }); continue; }
          sp.push({
            x: x0, y: y0, r: radius[b], kind: 1, fx: 0, fy: 0,
            s: swirl[b] * s * (this.rnd() > 0.5 ? 1 : -1) / drops,
            wave: waveAmp[b] * s, dye, amount: (m === 0 ? 0.9 : m === 3 ? 0.6 : 0.7) * s,
          });
        }
      }
    }
    // Continuous drive: a held note stirs at the formant point; treble adds fine turbulence.
    const [stx, sty] = this.bandHome(1);
    this.treb = fol(this.treb, audio.treble, 0.05, 0.3);
    this.splats = sp.slice(0, 12);
    return { stir: Math.min(1, held * 0.6) * (m === NEBULA_SIM_ID ? 0.08 : 0.30) * gain, stirPos: [stx, sty] as [number, number], treb: this.treb * 0.6 * gain };
  }

  /** Gas / plasma: kicks are blast waves, syllables are puffs (gas) or plucked field lines (plasma). */
  private listenGas(audio: AudioTexture, dt: number, gain: number) {
    const fol = (cur: number, x: number, up: number, down: number) => cur + (x - cur) * (1 - Math.exp(-dt / (x > cur ? up : down)));
    const sp: Splat[] = [];
    const now = this.simT, m = this.modeId, jit = () => (this.rnd() - 0.5);
    const med = MEDIUM[m];
    this.bassF = fol(this.bassF, audio.bass, 0.02, 0.12);
    this.bassS = fol(this.bassS, audio.bass, 0.6, 0.6);
    const kick = this.bassF - this.bassS * 1.08;
    if (kick > 0.05 && now - this.lastOnset[3] > 0.35) {
      this.lastOnset[3] = now;
      const s = Math.min(1.4, kick * 7) * gain;
      const cx = m === NEBULA_SIM_ID ? jit() * 0.5 : med.center[0], cy = m === NEBULA_SIM_ID ? jit() * 0.3 : med.center[1];
      sp.push({ x: cx, y: cy, r: 0.09, kind: 2, fx: 0, fy: 0, s: 0.20 * s, wave: 0, dye: [0, 0, 0], amount: 0 });
    }
    const radius = [0.10, 0.06, 0.035], str = [0.16, 0.12, 0.07], gap = [0.18, 0.14, 0.10];
    for (let b = 0; b < 3; b++) {
      const x = audio.vocal?.[b] ?? 0;
      this.vocF[b] = fol(this.vocF[b], x, 0.025, 0.14);
      this.vocS[b] = fol(this.vocS[b], x, 1.2, 1.2);
      const on = this.vocF[b] - this.vocS[b] * 1.05;
      if (on > 0.035 && now - this.lastOnset[b] > gap[b]) {
        this.lastOnset[b] = now;
        const s = Math.min(1.5, on * 9) * gain;
        const [hx, hy] = this.bandHome(b);
        const px = hx * 1.6 + jit() * 0.1, py = hy * 1.3 + jit() * 0.08;
        if (m === NEBULA_SIM_ID) sp.push({ x: px, y: py, r: radius[b], kind: 2, fx: 0, fy: 0, s: str[b] * s, wave: 0, dye: [0, 0, 0], amount: 0 });
        else sp.push({ x: px, y: m === PLASMA_ARC_ID ? 0.05 + jit() * 0.3 : py, r: radius[b] * 1.4, kind: 3, fx: 0, fy: 0, s: str[b] * (m === PLASMA_RADIAL_ID ? 0.8 : 1.6) * s * (this.rnd() > 0.5 ? 1 : -1), wave: 0, dye: [0, 0, 0], amount: 0 });
      }
    }
    this.treb = fol(this.treb, audio.treble, 0.05, 0.3);
    this.splats = sp.slice(0, 12);
    return med.ambient * (1 + this.treb * gain * 1.5);
  }

  private stepGas(audio: AudioTexture, gain: number, flow: number) {
    const gl = this.gl;
    const med = MEDIUM[this.modeId] ?? MEDIUM[20];
    const ambient = this.listenGas(audio, this.dt, gain) * flow;
    const sub = Math.max(1, Math.ceil(this.dt * 120));          // explicit waves: keep c·dt/h small
    const fullDt = this.dt;
    this.dt = fullDt / sub;
    for (let k = 0; k < sub; k++) {
      this.pass('gas', this.dye.write, (u, bind) => {
        bind('uState', this.dye.read.tex);
        gl.uniform1f(u('uCs2'), med.cs2); gl.uniform1f(u('uVa2'), med.va2);
        gl.uniform1f(u('uGamma'), med.gamma); gl.uniform1f(u('uK'), med.k);
        gl.uniform1f(u('uAmbient'), ambient);
        gl.uniform1i(u('uField'), med.field);
        gl.uniform2f(u('uCenter'), med.center[0], med.center[1]);
        this.setSplats(u, k === 0 ? this.splats : []);
      });
      this.dye.swap();
    }
    this.dt = fullDt;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Advance the liquid to `time` (the generator's speed-scaled clock). */
  step(time: number, audio: AudioTexture, params: number[], outW: number, outH: number) {
    const gl = this.gl;
    const aspect = outW / Math.max(1, outH);
    if (!this.vel || Math.abs(aspect - this.aspect) > 0.01) this.alloc(aspect, outH);
    const dt = this.lastT < 0 ? 1 / 60 : Math.min(1 / 20, Math.max(0, time - this.lastT));
    this.lastT = time;
    if (dt <= 0) return;
    this.dt = dt;
    this.simT += dt;
    const c = this.cfg;
    const gain = (params[2] ?? 0.5) * 2;
    const flow = 0.4 + (params[0] ?? 0.5) * 1.2;
    gl.disable(gl.BLEND);
    if (this.modeId >= 20) { this.stepGas(audio, gain, flow); return; }
    const drive = this.listen(audio, dt, gain);

    // 1. forces: breeze, buoyancy, shear, voice, impulses
    this.pass('force', this.vel.write, (u, bind) => {
      bind('uVel', this.vel.read.tex); bind('uDye', this.dye.read.tex);
      gl.uniform1f(u('uAmbient'), c.ambient * flow);
      gl.uniform1f(u('uTreb'), drive.treb);
      gl.uniform1f(u('uBuoy'), c.buoy);
      gl.uniform1f(u('uShear'), c.shear * (this.modeId === 4 ? flow : 1));
      gl.uniform1f(u('uVoiceStir'), drive.stir);
      gl.uniform2f(u('uStirPos'), drive.stirPos[0], drive.stirPos[1]);
      this.setSplats(u, this.splats);
    });
    this.vel.swap();
    // 2. vorticity confinement
    this.pass('curl', this.curl, (u, bind) => { bind('uVel', this.vel.read.tex); });
    this.pass('vort', this.vel.write, (u, bind) => {
      bind('uVel', this.vel.read.tex); bind('uCurl', this.curl.tex);
      gl.uniform1f(u('uCurlK'), c.curl * (1 + (audio.mid ?? 0) * gain * 0.6));
    });
    this.vel.swap();
    // 3. projection
    this.pass('div', this.div, (u, bind) => { bind('uVel', this.vel.read.tex); });
    this.pass('pscale', this.pres.write, (u, bind) => { bind('uP', this.pres.read.tex); });
    this.pres.swap();
    for (let i = 0; i < c.iters; i++) {
      this.pass('jacobi', this.pres.write, (u, bind) => { bind('uP', this.pres.read.tex); bind('uDiv', this.div.tex); });
      this.pres.swap();
    }
    this.pass('grad', this.vel.write, (u, bind) => { bind('uP', this.pres.read.tex); bind('uVel', this.vel.read.tex); });
    this.vel.swap();
    // 4. self-advection
    this.pass('advVel', this.vel.write, (u, bind) => { bind('uVel', this.vel.read.tex); gl.uniform1f(u('uDiss'), c.velDiss); });
    this.vel.swap();
    // 5. dye / flow map
    this.pass('dye', this.dye.write, (u, bind) => {
      bind('uVel', this.vel.read.tex); bind('uDye', this.dye.read.tex);
      gl.uniform2f(u('uDyeSize'), this.dye.read.w, this.dye.read.h);
      gl.uniform1f(u('uDiss'), c.dyeDiss);
      gl.uniform1f(u('uRelax'), c.relax);
      gl.uniform1f(u('uPour'), Math.min(1, (audio.level ?? 0) * gain));
      this.setSplats(u, this.splats);
    });
    this.dye.swap();
    // 6. waves: three substeps of the damped wave equation, drops on the first
    if (this.wave) {
      for (let k = 0; k < 3; k++) {
        this.pass('wave', this.wave.write, (u, bind) => {
          bind('uWave', this.wave!.read.tex); bind('uVel', this.vel.read.tex);
          gl.uniform1f(u('uC2'), 0.42);
          gl.uniform1f(u('uDamp'), 0.986);
          this.setSplats(u, k === 0 ? this.splats : []);
        });
        this.wave.swap();
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
