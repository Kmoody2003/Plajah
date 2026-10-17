// generatorsCosmos — ten nebula / aurora generators for GEN_GLSL.
//
// Calm, mid-tempo music response: the audio uniforms arrive envelope-smoothed
// (CALM_AUDIO_MODES in generatorPalettes), and every shader uses them as slow
// light — bass swells emission, mids lift rims and folds, treble sparkles,
// level opens the exposure. Nothing jumps, nothing strobes.
//
// Each body is composed as HEADER + CEL_COMMON + body by generators.ts.
// Slider convention (names in GEN_PARAM_LABELS):
//   iParam0 Shape · iParam1 Detail (cost) · iParam2 Music response · iParam3 Variation

/** Shared helpers for the cosmic and fluid sets. */
export const CEL_COMMON = `
#define PI 3.14159265
#define TAU 6.28318531
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
uniform float iCamZoom;   // director camera zoom (1 when not directed): point sources must not grow with it
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float h31(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = h31(i), b = h31(i + vec3(1.0, 0.0, 0.0)), c = h31(i + vec3(0.0, 1.0, 0.0)), d = h31(i + vec3(1.0, 1.0, 0.0));
  float e = h31(i + vec3(0.0, 0.0, 1.0)), f1 = h31(i + vec3(1.0, 0.0, 1.0)), g = h31(i + vec3(0.0, 1.0, 1.0)), h = h31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
const mat2 ROT2 = mat2(0.80, 0.60, -0.60, 0.80);
const mat3 ROT3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * vnoise(p); n += a; p = ROT2 * p * 2.03 + 11.7; a *= 0.5; }
  return s / n;
}
float fbm(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * vnoise(p); n += a; p = ROT3 * p * 2.02 + 7.3; a *= 0.5; }
  return s / n;
}
float ridged(vec3 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; float v = 1.0 - abs(2.0 * vnoise(p) - 1.0); s += a * v * v; n += a; p = ROT3 * p * 2.07 + 5.1; a *= 0.5; }
  return s / n;
}
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 saturate3(vec3 c, float s){ return max(mix(vec3(dot(c, LUMA)), c, s), 0.0); }
vec3 ramp(float t){
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(iC0, iC1, smoothstep(0.0, 1.0, t * 2.0)) : mix(iC1, iC2, smoothstep(0.0, 1.0, t * 2.0 - 1.0));
}
vec3 finish(vec3 col, vec2 fc, float exposure, float sat){
  col = aces(max(col, 0.0) * exposure);
  col = saturate3(col, sat);
  col += (h21(fc + fract(iTime * 7.13) * 91.0) - 0.5) / 255.0;     // dither: no banding in the dark gradients
  return clamp(col, 0.0, 1.0);
}
vec2 aspectUv(){ vec2 fc = vUv * iResolution; return (fc - 0.5 * iResolution) / iResolution.y; }
float vignette(vec2 p, float k){ return clamp(1.0 - k * dot(p, p), 0.0, 1.0); }
int detailOct(float lo, float hi){ return int(floor(mix(lo, hi, iParam1) + 0.5)); }

// One star per grid cell (some cells empty), sized in real pixels so stars stay
// pin-sharp at any output size. Low densities give the few bright stars room
// for halos and diffraction spikes.
vec3 stars(vec2 p, float density, float seed, float tw){
  vec2 g = p * density + seed * 31.7;
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float r = h21(id + seed);
  if (r < 0.66) return vec3(0.0);
  vec2 o = (h22(id + seed * 1.7 + 3.1) - 0.5) * 0.56;
  vec2 d = f - o;
  float px = density / (iResolution.y * max(iCamZoom, 1.0));
  float mag = pow(h21(id + seed + 9.2), 7.0);
  float dd = dot(d, d) / (px * px);
  float win = smoothstep(0.22, 0.05, length(d));
  float core = exp(-dd * 0.9);
  float halo = mag * 3.2 / (1.0 + dd * 0.4);
  float spike = 0.0;
  if (mag > 0.45) { vec2 a = abs(d) / px; spike = (exp(-a.x * 1.1) * exp(-a.y * 0.10) + exp(-a.y * 1.1) * exp(-a.x * 0.10)) * mag * 1.4; }
  float temp = h21(id + seed + 4.4);
  vec3 tint = temp < 0.5 ? mix(vec3(1.0, 0.62, 0.38), vec3(1.0, 0.93, 0.82), temp * 2.0)
                         : mix(vec3(1.0, 0.96, 0.92), vec3(0.62, 0.76, 1.0), temp * 2.0 - 1.0);
  float twk = 1.0 + tw * 0.55 * sin(iTime * (1.3 + r * 4.0) + r * 61.0);
  return tint * (core * (0.12 + mag * 2.2) + (halo + spike) * win) * twk;
}
// A single hero star at c (aspect space): core, halo, four-point spikes.
vec3 heroStar(vec2 p, vec2 c, float mag, vec3 tint){
  vec2 d = (p - c) * 720.0 * max(iCamZoom, 1.0);   // sized against a 720-line frame; a zoom doesn't enlarge a star
  float dd = dot(d, d);
  vec2 a = abs(d);
  float core = exp(-dd * 0.18);
  float halo = 1.0 / (1.0 + dd * 0.025);
  float spike = exp(-a.x * 0.45) * exp(-a.y * 0.016) + exp(-a.y * 0.45) * exp(-a.x * 0.016);
  return tint * mag * (core * 2.2 + halo * 0.45 + spike * 0.55);
}
// Kali's Kaliset fractal — the formula inside "Star Nest". Fold space by inversion,
// p ← |p| / |p|² − c, and sum how far |p| jumps at each fold. What comes out is the thin,
// branching, self-similar filament structure of real ionised gas, which no stack of noise
// octaves produces. Tiled so the fold stays bounded.
float kaliset(vec3 p){
  p = abs(vec3(0.85) - mod(p, vec3(1.7)));
  float a = 0.0, prev = 0.0;
  for (int i = 0; i < 11; i++){ p = abs(p) / dot(p, p) - 0.53; float l = length(p); a += abs(l - prev); prev = l; }
  return a;
}
float kalFil(vec2 g, float z){ float a = kaliset(vec3(g, z)) / 11.0; return clamp(a * a * a * 0.12, 0.0, 2.0); }
// Calm music bands: soft knees, scaled by the Music response slider (0.5 = designed).
#define BANDS float E_ = iParam2 * 2.0; float B = smoothstep(0.03, 0.85, iBass) * E_; float M = smoothstep(0.03, 0.75, iMid) * E_; float T = smoothstep(0.02, 0.60, iTreble) * E_; float L = smoothstep(0.03, 0.80, iLevel) * E_;
`;


// Flow map from the nebula's own low-resolution fluid (fluidSim, mode 20): where this bit of gas
// sat before the music pushed it. Swirls persist and relax back over ~10 s. Stars stay fixed.
const COSMOS_FLOW = `
uniform sampler2D iChannel1;   // rg = displacement ξ of the gas/plasma, ba = its velocity (fluidSim 20–23)
uniform float iFlowOn;
uniform vec2 iSimTexel;
vec2 gasXi(vec2 uv){ return texture(iChannel1, uv).rg; }
// Where this bit of gas sat before the music moved it.
vec2 gasP(vec2 p){ return iFlowOn > 0.5 ? p - gasXi(vUv) : p; }
// Compression ρ'/ρ = −∇·ξ. Ionised gas emits ∝ ρ², so shock fronts glow and rarefactions dim.
float gasLight(){
  if (iFlowOn < 0.5) return 1.0;
  vec2 e = iSimTexel; float ax = iResolution.x / max(iResolution.y, 1.0);
  float div = (gasXi(vUv + vec2(e.x, 0.0)).x - gasXi(vUv - vec2(e.x, 0.0)).x) / (2.0 * e.x * ax)
            + (gasXi(vUv + vec2(0.0, e.y)).y - gasXi(vUv - vec2(0.0, e.y)).y) / (2.0 * e.y);
  float rho = clamp(-div, -0.6, 1.5);
  return (1.0 + rho) * (1.0 + rho);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Aurora library — shared by the Veil and the Lake.
const AURORA_LIB = `
// Screen-space curtains: each has a wavy lower hem with light streaming up from
// it — sharp lower border, vertical rays, bright folds where the curtain turns.
vec3 aurora(vec2 p, float horizon, float t, float B, float M, float T){
  int oct = detailOct(3.0, 5.0);
  vec3 acc = vec3(0.0);
  float seed = iParam3 * 7.0;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float depth = 1.0 + fi * 0.55;
    float x = p.x * (1.1 + fi * 0.35) + seed + fi * 3.7;
    float tt = t * (0.035 - fi * 0.008);
    float amp = (0.10 + iParam0 * 0.16) / depth;
    float y0 = horizon + 0.30 - fi * 0.075;
    float n = fbm(vec2(x * 1.3 + tt, fi * 5.3), oct);
    float base = y0 + amp * (n - 0.5) * 2.4 + 0.035 * sin(x * 3.1 + n * 6.0 + tt * 2.0);
    float present = smoothstep(0.30, 0.58, fbm(vec2(x * 0.35 - tt * 0.6, fi * 2.1 + 9.0), 3));
    float dy = p.y - base;
    float hem = smoothstep(-0.014, 0.012, dy);
    float height = (0.28 + 0.16 * vnoise(vec2(x * 1.5, fi))) / depth;
    float body = hem * exp(-max(dy, 0.0) / height);
    float rx = x * 26.0 + n * 9.0;
    float rays = 0.30 + 0.70 * pow(vnoise(vec2(rx + tt * 20.0, dy * 1.2 - t * 0.05)), 1.6);
    rays *= 0.75 + 0.25 * vnoise(vec2(rx * 3.1 - t * 0.3, 7.0 + fi)) * (1.0 + T * 0.8);
    float fold = smoothstep(0.4, 2.5, abs(dFdx(base)) * iResolution.y);
    float pulse = 0.72 + 0.28 * sin(x * 1.3 - t * 0.12 + fi * 2.0);
    vec3 tint = mix(iC0, iC1, smoothstep(0.02, height * 1.3, dy));
    tint = mix(tint, iC2, hem * smoothstep(0.03, 0.0, dy) * 0.22);
    acc += tint * body * rays * (1.0 + fold * 1.5) * pulse * present / depth;
  }
  return acc * 1.5 * (0.9 + B * 0.6);
}
vec3 nightSky(vec2 p, float horizonY){
  float h = clamp((p.y - horizonY) * 1.4, 0.0, 1.0);
  vec3 sky = mix(vec3(0.018, 0.030, 0.055), vec3(0.004, 0.006, 0.016), sqrt(h));
  return sky + iC0 * 0.025 * exp(-h * 6.0);
}
float ridgeLine(float x, float base, float amp, float seed){
  float n = fbm(vec2(x * 1.3 + seed, seed * 0.7), 6);
  float peaks = 1.0 - abs(2.0 * vnoise(vec2(x * 2.6 + seed * 3.0, seed)) - 1.0);
  return base + amp * (n * 0.75 + peaks * peaks * 0.45);
}
`;

// ── 1. Pillars of Creation — dust columns lit from above, teal and gold gas ──
const COSMIC_PILLARS = `
float column(vec2 p, float x, float lean, float top, float base, float w){
  float y01 = clamp((p.y + 0.55) / (top + 0.55), 0.0, 1.0);
  float halfW = mix(base, base * 0.38, y01 * y01);
  float cx = x + lean * (p.y + 0.55) + 0.025 * sin(p.y * 9.0 + x * 5.0);
  float d = halfW - abs(p.x - cx);
  float body = smoothstep(-0.018, 0.022, d + (w - 0.5) * 0.24);
  float cap = smoothstep(top + 0.05, top - 0.10, p.y + (w - 0.5) * 0.30 - 0.035 * cos((p.x - cx) * 20.0));
  return body * cap;
}
float pillars(vec2 p, float t, int oct){
  float w = fbm(vec2(p.x * 3.2, p.y * 1.7) + vec2(0.0, t * 0.010), oct);
  float sh = (iParam0 - 0.5) * 0.30;
  float sx = (iParam3 - 0.5) * 0.30;
  float m = column(p, -0.50 + sx, 0.10, 0.26 + sh, 0.17, w);
  m = max(m, column(p, 0.04 + sx * 0.5, -0.07, 0.04 + sh, 0.12, w));
  m = max(m, column(p, 0.52 - sx * 0.3, 0.12, -0.14 + sh, 0.10, w));
  return m;
}
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(3.0, 6.0);
  vec2 gp = gasP(p);
  vec2 q = gp * 1.5 + vec2(t * 0.006, 0.0);
  vec2 wv = vec2(fbm(q + vec2(0.0, t * 0.012), oct), fbm(q + vec2(5.2, 1.3) - vec2(t * 0.010, 0.0), oct));
  float gas = fbm(q + 1.6 * wv, oct);
  float wisp = fbm(q * 2.4 - 1.3 * wv.yx + 3.7, oct);
  vec3 gasCol = mix(iC0, iC1, smoothstep(0.42, 0.78, wisp));
  float em = pow(smoothstep(0.22, 0.85, gas), 1.5);
  vec3 col = vec3(0.004, 0.006, 0.012) + iC0 * 0.012;
  col += stars(p, 110.0, 1.0, T) * 0.35 + stars(p, 45.0, 2.0, T) * 0.6;
  col *= 1.0 - em * 0.7;
  col += gasCol * em * (0.9 + B * 0.5);
  col += iC1 * pow(smoothstep(0.55, 0.95, wisp), 3.0) * 0.7;
  col += mix(iC0, iC1, 0.5) * kalFil(gp * 1.1 + 0.3, t * 0.004 + iParam3) * 0.35 * em;
  vec2 Ld = normalize(vec2(-0.25, 1.0));
  float f = pillars(p, t, oct);
  float fUp = pillars(p + Ld * 0.016, t, oct);
  float fDn = pillars(p - Ld * 0.035, t, oct);
  float rim = clamp(f - fUp, 0.0, 1.0);
  float halo = clamp(fDn - f, 0.0, 1.0);
  float grain = fbm(p * 18.0 + t * 0.01, 3);
  vec3 dust = mix(iC1, iC2, 0.5) * (0.02 + 0.07 * grain * grain) * smoothstep(-0.6, 0.3, p.y);
  rim *= 0.7 + 0.6 * grain;                                      // the lit edge is ragged, not striped
  col = mix(col, dust, f * 0.94);
  vec3 hot = mix(iC1, vec3(1.0, 0.95, 0.85), 0.5);
  col += hot * rim * (2.0 + M * 1.5);
  col += iC2 * halo * (0.55 + M * 0.5);
  col += stars(p, 14.0, 3.0, T) * (1.0 - f) * 1.3;
  col *= vignette(p, 0.35);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.15 + L * 0.35, 1.15), 1.0);
}`;

// ── 2. Aurora Veil — curtains over a mountain ridge ──
const COSMIC_AURORA_VEIL = AURORA_LIB + `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  float horizon = -0.30;
  vec3 col = nightSky(p, horizon);
  col += stars(p, 120.0, 1.0, T) * 0.35 + stars(p, 50.0, 2.0, T) * 0.55 + stars(p, 16.0, 3.0, T);
  vec3 au = aurora(vec2(gasP(p).x, p.y), horizon, t, B, M, T);   // music ripples the curtains sideways
  col = col * (1.0 - clamp(dot(au, LUMA) * 0.6, 0.0, 0.6)) + au;
  // Far ridge, then a nearer one: black rock, snow catching the aurora on the crests.
  float r1 = ridgeLine(p.x, horizon - 0.02, 0.16, 2.0);
  float r2 = ridgeLine(p.x * 0.8 + 3.0, horizon - 0.12, 0.13, 7.0);
  vec3 glowOnSnow = (iC0 * 0.6 + iC1 * 0.2) * (0.10 + B * 0.05);
  float snow1 = smoothstep(0.03, 0.0, r1 - p.y) * vnoise(vec2(p.x * 60.0, p.y * 30.0));
  vec3 far = vec3(0.010, 0.014, 0.024) + glowOnSnow * snow1;
  col = mix(col, far, smoothstep(0.0, 0.002, r1 - p.y));
  col = mix(col, vec3(0.003, 0.004, 0.007) + glowOnSnow * 0.25 * smoothstep(0.02, 0.0, r2 - p.y), smoothstep(0.0, 0.002, r2 - p.y));
  col += iC0 * 0.04 * exp(-abs(p.y - horizon) * 12.0) * (1.0 + B);   // airglow on the horizon
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.35, 1.2), 1.0);
}`;

// ── 3. Orion Bloom — a hollow, lit cavity in ionised gas, volumetric ──
const COSMIC_ORION = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(4.0, 7.0);
  float seed = iParam3 * 10.0;
  vec2 c = vec2(0.06, 0.02);
  vec2 q = (gasP(p) - c) * (1.0 + 0.04 * sin(t * 0.02));
  float r = length(q);
  vec2 w1 = vec2(fbm(q * 2.0 + vec2(seed, t * 0.010), oct), fbm(q * 2.0 + vec2(5.2 + seed, -t * 0.008), oct));
  vec2 w2 = vec2(fbm(q * 3.0 + 3.0 * w1 + vec2(1.7, 9.2), oct), fbm(q * 3.0 + 3.0 * w1 + vec2(8.3, 2.8), oct));
  float gas = fbm(q * 2.5 + 2.5 * w2 * (0.7 + iParam0 * 0.7), oct);
  float fil = ridged(vec3(q * 4.0 + 2.0 * w2, t * 0.01 + seed), oct);
  float light = min(0.10 / (0.012 + r * r), 6.0);
  float cavity = smoothstep(0.04, 0.22, r + (gas - 0.5) * 0.15);
  float dens = pow(smoothstep(0.30, 0.85, gas), 1.6) * cavity;
  vec3 em = mix(iC2, iC1, smoothstep(0.05, 0.30, r + (w2.x - 0.5) * 0.12));
  em = mix(em, iC0, smoothstep(0.20, 0.60, r + (w2.y - 0.5) * 0.25));
  vec3 neb = em * dens * light * 0.20 * (0.9 + B * 0.5);
  neb += mix(em, vec3(1.0), 0.3) * pow(fil, 6.0) * cavity * min(light, 4.0) * 0.16 * (1.0 + M * 0.6);
  neb += em * 0.05 * smoothstep(0.2, 0.8, gas);                              // faint outer veil
  neb += mix(em, iC1, 0.4) * kalFil(q * 1.4 + 0.2, t * 0.003 + seed) * cavity * min(light, 3.0) * 0.06;
  float dustN = fbm(q * 3.5 + w1 * 1.5 + 11.0, oct);
  float dust = smoothstep(0.52, 0.68, dustN) * smoothstep(0.06, 0.3, r);
  float dustEdge = smoothstep(0.49, 0.55, dustN) - smoothstep(0.55, 0.62, dustN);
  neb *= 1.0 - dust * 0.92;
  neb += mix(iC2, iC1, 0.4) * max(dustEdge, 0.0) * min(light, 3.0) * 0.10 * (1.0 + M * 0.5);
  vec3 col = vec3(0.003, 0.004, 0.010);
  col += (stars(p, 120.0, 1.0, T) * 0.35 + stars(p, 48.0, 2.0, T) * 0.6) * (1.0 - dust * 0.9);
  col = col * (1.0 - clamp(dot(neb, LUMA) * 0.8, 0.0, 0.8)) + neb;
  vec3 hot = mix(vec3(0.75, 0.85, 1.0), iC2, 0.25);
  float tw = 1.0 + T * 0.35;
  col += heroStar(p, c + vec2(0.012, 0.006), 0.30 * tw, hot);
  col += heroStar(p, c + vec2(-0.011, 0.010), 0.22 * tw, hot);
  col += heroStar(p, c + vec2(0.004, -0.012), 0.18 * tw, hot);
  col += heroStar(p, c + vec2(-0.007, -0.004), 0.12 * tw, hot);
  col += iC2 * 0.20 * exp(-r * r * 60.0) * (1.0 + B * 0.6);
  col += stars(p, 15.0, 3.0, T) * (1.0 - dust * 0.7);
  col *= vignette(p, 0.3);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.35, 1.18), 1.0);
}`;

// ── 4. Veil Remnant — the filament shell of an old supernova ──
const COSMIC_REMNANT = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(4.0, 7.0);
  vec2 gp = gasP(p);
  float r = length(gp);
  vec2 dir = gp / max(r, 1e-4);
  float R = 0.35 + (iParam0 - 0.5) * 0.14 + 0.006 * sin(t * 0.07);
  float seed = iParam3 * 9.0;
  float warp = fbm(dir * 1.5 + vec2(t * 0.004, seed), 4) - 0.5;
  float shellR = R * (1.0 + warp * 0.38);
  float thick = 0.055 + 0.05 * fbm(dir * 3.0 + 7.0 + seed, 3);
  float sOuter = (r - shellR) / thick;
  float shell = exp(-sOuter * sOuter);
  float sInner = (r - shellR + 0.03) / (thick * 1.3);
  float shellIn = exp(-sInner * sInner);
  vec3 fp = vec3(dir * 3.4, r * 8.0 - t * 0.008) + vec3(warp * 2.0, seed, 0.0);
  float sharp = 5.0 - T * 1.2;
  float fa = pow(ridged(fp, oct), sharp);
  float fb = pow(ridged(fp * 1.13 + vec3(3.1, 1.7, 0.4), oct), sharp);
  float fcF = pow(ridged(fp * 0.8 + vec3(9.0, 4.0, 2.0), oct), sharp + 1.0);
  vec3 col = vec3(0.003, 0.004, 0.009);
  col += stars(p, 120.0, 1.0, T) * 0.35 + stars(p, 48.0, 2.0, T) * 0.55;
  col += iC0 * fa * shell * (2.6 + B * 1.2);
  col += iC1 * fb * shellIn * (2.0 + M * 1.2);
  col += iC2 * fcF * (shell + shellIn) * 0.9;
  col += mix(iC1, iC0, 0.5) * 0.05 * smoothstep(shellR, 0.0, r) * fbm(p * 4.0 + seed, 4);
  col += iC0 * 0.06 * exp(-sOuter * sOuter * 0.12) * (1.0 + B * 0.5);  // diffuse outer glow
  col += stars(p, 15.0, 3.0, T) * 1.2;
  col *= vignette(p, 0.3);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.15 + L * 0.35, 1.2), 1.0);
}`;

// ── 5. Galactic Spiral — density-wave arms, dust lanes, HII knots ──
const COSMIC_GALAXY = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(3.0, 6.0);
  float incl = mix(0.34, 0.78, iParam0);
  float rot = -0.45 + (iParam3 - 0.5) * 1.6;
  vec2 q = rot2(rot) * gasP(p);
  vec2 d = vec2(q.x, q.y / incl) * 1.3;
  float r = length(d), a = atan(d.y, d.x);
  float pattern = t * 0.010;                                // the pattern turns rigidly (density waves)
  vec2 dr = rot2(pattern) * d;
  float wind = 4.2;
  float phase = 2.0 * (a - pattern) + wind * log(r + 0.03);
  float arm = pow(0.5 + 0.5 * cos(phase), 2.5);
  float floc = fbm(dr * 7.0, oct);
  float disc = exp(-r * 2.4) * smoothstep(1.15, 0.6, r);
  float lane = pow(0.5 + 0.5 * cos(phase + 0.75), 7.0) * smoothstep(0.05, 0.22, r) * smoothstep(1.0, 0.35, r) * (0.4 + 0.9 * floc);
  float bulge = exp(-r * r * 36.0) * 2.6 + exp(-r * 7.0) * 0.6;
  vec3 col = vec3(0.003, 0.004, 0.009);
  col += stars(p, 120.0, 1.0, T) * 0.3 + stars(p, 40.0, 2.0, T) * 0.45;
  vec3 galaxy = iC0 * disc * (0.22 + arm * (0.9 + floc * 1.4)) * (1.0 + M * 0.45);
  galaxy += iC1 * bulge * (1.0 + B * 0.4);
  galaxy *= 1.0 - clamp(lane * 1.25, 0.0, 0.92);
  float knots = smoothstep(0.80, 0.97, vnoise(dr * 40.0)) * arm * disc * 2.4;
  galaxy += iC2 * knots * (1.3 + T * 1.6);
  galaxy += stars(p, 210.0, 5.0, T) * arm * disc * 3.0;
  float mid = exp(-pow((q.y + 0.004) / 0.012, 2.0)) * exp(-q.x * q.x * 12.0) * (1.0 - incl) * 0.85;
  galaxy *= 1.0 - mid;
  col = col * (1.0 - clamp(dot(galaxy, LUMA), 0.0, 0.8)) + galaxy;
  col += stars(p, 14.0, 3.0, T) * 1.1;
  col *= vignette(p, 0.3);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.35, 1.18), 1.0);
}`;

// ── 6. Aurora Corona — looking straight up into the converging rays ──
const COSMIC_CORONA = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(3.0, 6.0);
  vec2 z = gasP(p) - vec2(0.07, 0.05);
  float r = length(z), a = atan(z.y, z.x);
  float twist = a + (0.03 + iParam0 * 0.22) / (r + 0.3) + 0.04 * sin(t * 0.05 + r * 6.0);
  vec2 ang = vec2(cos(twist), sin(twist));
  float seed = iParam3 * 11.0;
  float broad = fbm(ang * 6.0 + vec2(t * 0.02, seed - t * 0.015), oct);
  float thin = vnoise(ang * 48.0 + vec2(t * 0.10, seed));
  float fine = vnoise(ang * 120.0 + vec2(-t * 0.16, seed + 3.0));
  float rays = (0.35 + 0.65 * smoothstep(0.25, 0.85, broad)) * (0.45 + 0.55 * smoothstep(0.3, 0.9, thin)) * (0.75 + 0.25 * fine * (1.0 + T * 0.6));
  // The curtains' lower borders seen from below: a wavy, folded ring.
  vec2 ua = vec2(cos(a), sin(a));
  float hemR = 0.36 + 0.06 * (fbm(ua * 1.8 + vec2(t * 0.012, seed), 4) - 0.5) * 2.0 + 0.010 * sin(a * 7.0 + t * 0.07);
  hemR *= 0.88 + iParam0 * 0.24;
  float inside = smoothstep(hemR + 0.04, hemR - 0.02, r);
  inside += (1.0 - inside) * exp(-max(r - hemR, 0.0) * 14.0) * 0.45;      // rays thin out past the hem
  float rise = smoothstep(0.0, hemR, r);
  float radial = smoothstep(0.01, 0.12, r) * inside * (0.25 + 0.75 * rise * rise);
  float hemGlow = exp(-pow((r - hemR + 0.012) / 0.018, 2.0));
  vec3 col = vec3(0.006, 0.008, 0.018);
  col += stars(p, 120.0, 1.0, T) * 0.35 + stars(p, 48.0, 2.0, T) * 0.55 + stars(p, 15.0, 3.0, T);
  vec3 tint = mix(iC1, iC0, smoothstep(0.25, 0.85, rise));
  vec3 au = tint * rays * radial * 1.5;
  au += mix(iC0, iC2, 0.45) * hemGlow * rays * 0.9;
  au += iC1 * exp(-r * r * 35.0) * 0.25;
  au *= 0.85 + B * 0.7;
  col = col * (1.0 - clamp(dot(au, LUMA), 0.0, 0.7)) + au;
  // Looking straight up: the low sky glows faintly toward the frame edges, then falls off.
  float R = length(p * vec2(0.70, 1.0));
  col += mix(vec3(0.06, 0.09, 0.15), iC0 * 0.15, 0.3) * smoothstep(0.25, 0.55, R) * (1.0 + B * 0.3);
  col *= vignette(p, 0.55);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.35, 1.2), 1.0);
}`;

// ── 7. Milky River — the galactic band, dark rift, a quiet landscape ──
const COSMIC_MILKYWAY = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(4.0, 7.0);
  float angle = 0.55 + (iParam3 - 0.5) * 1.2 + t * 0.0015;
  vec2 q = rot2(angle) * (gasP(p) - vec2(0.0, 0.05));
  float u = q.x, v = q.y;
  float width = 0.08 + iParam0 * 0.10;
  float wob = fbm(vec2(u * 2.0, 0.5), 4) - 0.5;
  float vv = v + wob * 0.05;
  float band = exp(-vv * vv / (width * width));
  float core = exp(-pow((u - 0.30) / 0.38, 2.0));
  vec2 nq = vec2(u * 3.0, vv * 9.0);
  float haze = fbm(nq + vec2(t * 0.002, 0.0), oct);
  float rift = smoothstep(0.48, 0.74, fbm(nq * vec2(1.0, 1.3) + 5.0 + haze, oct)) * exp(-vv * vv / (width * width * 0.25));
  float neb = smoothstep(0.66, 0.90, fbm(q * 7.0 + 13.0, oct)) * band;
  vec3 col = vec3(0.006, 0.009, 0.020) + vec3(0.010, 0.020, 0.012) * smoothstep(0.0, -0.45, p.y);
  float starBoost = 0.3 + band * 2.4 + core * band * 1.5;
  col += stars(p, 230.0, 1.0, T) * 0.30 * starBoost;
  col += stars(p, 110.0, 4.0, T) * 0.35 * (0.5 + band * 1.5);
  col += stars(p, 45.0, 2.0, T) * 0.6;
  vec3 haloCol = mix(iC0, iC1, smoothstep(0.1, 0.8, core));
  col += haloCol * band * (0.18 + haze * 0.55) * (1.0 + core * 1.6) * (0.9 + B * 0.45);
  col += iC2 * neb * (0.7 + M * 0.9);
  col *= 1.0 - rift * 0.88;
  col += stars(p, 14.0, 3.0, T) * 1.15;
  float horizon = -0.36 + 0.05 * fbm(vec2(p.x * 1.4, 2.0), 5) + 0.03 * sin(p.x * 2.0 + 1.0);
  col += vec3(0.06, 0.10, 0.05) * exp(-max(p.y - horizon, 0.0) * 14.0) * 0.35;
  col = mix(col, vec3(0.004, 0.005, 0.008), smoothstep(0.0, 0.003, horizon - p.y));
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.35, 1.15), 1.0);
}`;

// ── 8. Planetary Eye — a Helix-style planetary nebula ──
const COSMIC_PLANETARY = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(3.0, 6.0);
  vec2 e = rot2(0.4 + (iParam3 - 0.5) * 2.0 + t * 0.002) * gasP(p);
  e.y *= 1.0 + (iParam0 - 0.5) * 0.7;
  float r = length(e);
  vec2 dir = e / max(r, 1e-4);
  float wob = fbm(dir * 2.0 + t * 0.006, 4) - 0.5;
  float rIn = 0.16 * (1.0 + wob * 0.3);
  float inner = smoothstep(rIn, 0.0, r) * (0.45 + 0.55 * fbm(e * 9.0 + t * 0.01, oct));
  float ringR = 0.27 * (1.0 + wob * 0.25);
  float ringD = (r - ringR) / 0.075;
  float ring = exp(-ringD * ringD);
  float kn = vnoise(vec3(dir * 34.0, r * 6.0 - t * 0.008));
  float knots = pow(kn, 3.0) * smoothstep(0.14, 0.23, r) * smoothstep(0.43, 0.25, r);
  float tex = fbm(e * 12.0 + 3.0, oct);
  float halo = exp(-pow((r - 0.43) / 0.11, 2.0));
  vec3 col = vec3(0.003, 0.004, 0.009);
  col += stars(p, 120.0, 1.0, T) * 0.35 + stars(p, 48.0, 2.0, T) * 0.55;
  vec3 neb = iC0 * inner * (1.3 + M * 0.5);
  vec3 ringCol = mix(iC1, iC2, smoothstep(0.27, 0.40, r));
  neb += ringCol * ring * (0.6 + tex * 1.2) * (1.0 + B * 0.6);
  neb += mix(iC1, vec3(1.0, 0.85, 0.7), 0.3) * knots * (1.4 + M * 1.2);
  neb += iC2 * halo * 0.22 * (0.6 + tex);
  col = col * (1.0 - clamp(dot(neb, LUMA), 0.0, 0.75)) + neb;
  col += heroStar(p, vec2(0.0), 0.35 * (1.0 + T * 0.45), vec3(0.78, 0.88, 1.0));
  col += stars(p, 15.0, 3.0, T) * 1.1;
  col *= vignette(p, 0.3);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.35, 1.2), 1.0);
}`;

// ── 9. Stellar Nursery — drifting forward through glowing clouds ──
const COSMIC_NURSERY = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  int oct = detailOct(4.0, 6.0);
  float seed = iParam3 * 10.0;
  float thr = mix(0.60, 0.40, iParam0);
  float sk[4]; vec3 ek[4]; float ak[4];
  for (int k = 0; k < 4; k++){
    float fk = float(k);
    float ph = t * 0.012 + fk / 4.0;
    float s = fract(ph), id = floor(ph);
    float sc = mix(3.2, 0.45, s);
    vec2 off = h22(vec2(id, fk + seed)) * 20.0;
    vec2 q = rot2(fk * 1.7 + id) * gasP(p) * sc + off;
    float fade = smoothstep(0.0, 0.25, s) * smoothstep(1.0, 0.72, s);
    vec2 w = vec2(fbm(q + vec2(0.0, t * 0.004), oct), fbm(q + vec2(5.2, 1.3), oct));
    float n = fbm(q * 1.2 + 2.0 * w, oct);
    float d = smoothstep(thr, thr + 0.25, n) * fade;
    vec3 em = mix(iC0, iC1, smoothstep(0.38, 0.62, w.x));
    em += iC2 * pow(smoothstep(0.62, 0.90, n), 2.0) * 1.3;
    sk[k] = s;
    ek[k] = em * d * (0.45 + 0.25 * s);
    ak[k] = smoothstep(0.56, 0.72, w.y) * fade * 0.85;
  }
  vec3 neb = vec3(0.0);
  float farAtt = 1.0;
  for (int k = 0; k < 4; k++){
    float att = 1.0;
    for (int j = 0; j < 4; j++) if (sk[j] > sk[k]) att *= 1.0 - ak[j];
    neb += ek[k] * att;
    farAtt *= 1.0 - ak[k];
  }
  vec3 col = vec3(0.003, 0.004, 0.010);
  for (int k = 0; k < 3; k++){
    float s = fract(t * 0.012 + float(k) / 3.0);
    float sc = mix(2.6, 0.7, s);
    float fade = smoothstep(0.0, 0.25, s) * smoothstep(1.0, 0.7, s);
    col += stars(p * sc, 60.0, float(k) + 1.0, T) * fade * 0.8;
  }
  col *= farAtt;
  col = col * (1.0 - clamp(dot(neb, LUMA), 0.0, 0.7)) + neb * (0.9 + B * 0.5 + M * 0.15);
  col += mix(iC0, iC1, 0.5) * kalFil(gasP(p) * 1.3, t * 0.004 + seed) * 0.10 * clamp(dot(neb, LUMA) * 3.0, 0.0, 1.0);
  col += stars(p, 16.0, 7.0, T) * 0.9;
  col *= vignette(p, 0.3);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 0.95 + L * 0.35, 1.25), 1.0);
}`;

// ── 10. Aurora Lake — curtains over a ridge, mirrored in still water ──
const COSMIC_AURORA_LAKE = AURORA_LIB + `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  float horizon = -0.10;
  bool water = p.y < horizon;
  vec2 sp = p;
  float fres = 1.0;
  if (water){
    float depth = 1.0 / max(horizon - p.y, 0.004);
    vec2 wq = vec2(p.x * depth * 0.6, depth * 1.4 - t * 0.25);
    float rip = fbm(wq * vec2(1.0, 0.35), 4) - 0.5;
    float fineRip = vnoise(wq * vec2(3.0, 1.0) + t * 0.4) - 0.5;
    float amp = 0.006 + 0.004 * B + 0.004 * T * fineRip;
    sp = vec2(p.x + rip * 0.02, 2.0 * horizon - p.y + rip * amp * 4.0 + fineRip * amp);
    fres = 0.38 + 0.45 * exp(-(horizon - p.y) * 6.0);
  }
  vec3 col = nightSky(sp, horizon);
  col += stars(sp, 120.0, 1.0, T) * 0.35 + stars(sp, 50.0, 2.0, T) * 0.55 + stars(sp, 16.0, 3.0, T);
  vec3 au = aurora(sp + vec2(gasP(p).x - p.x, 0.0), horizon, t, B, M, T);
  col = col * (1.0 - clamp(dot(au, LUMA) * 0.6, 0.0, 0.6)) + au;
  float r1 = ridgeLine(sp.x, horizon - 0.01, 0.16, 4.0);
  float r2 = ridgeLine(sp.x * 0.7 + 5.0, horizon, 0.05, 9.0);
  vec3 glowOnSnow = (iC0 * 0.6 + iC1 * 0.2) * 0.10;
  float snow = smoothstep(0.025, 0.0, r1 - sp.y) * vnoise(vec2(sp.x * 60.0, sp.y * 30.0));
  col = mix(col, vec3(0.010, 0.013, 0.022) + glowOnSnow * snow, smoothstep(0.0, 0.002, r1 - sp.y));
  col = mix(col, vec3(0.004, 0.005, 0.008), smoothstep(0.0, 0.002, r2 - sp.y));
  if (water){
    col *= fres;
    col += vec3(0.004, 0.006, 0.010);
    float glint = pow(vnoise(vec2(p.x * 90.0, (horizon - p.y) * 400.0 / max(horizon - p.y + 0.05, 0.05) - t * 2.0)), 14.0);
    col += (iC0 + iC1) * 0.5 * glint * (0.3 + T * 0.9) * exp(-(horizon - p.y) * 4.0);
  }
  col += iC0 * 0.05 * exp(-abs(p.y - horizon) * 30.0) * (1.0 + B);
  col *= mix(1.0, gasLight(), 0.85);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.35, 1.2), 1.0);
}`;

export const COSMOS_GLSL: Record<string, string> = {
  COSMIC_PILLARS: COSMOS_FLOW + COSMIC_PILLARS,
  COSMIC_AURORA_VEIL: COSMOS_FLOW + COSMIC_AURORA_VEIL,
  COSMIC_ORION: COSMOS_FLOW + COSMIC_ORION,
  COSMIC_REMNANT: COSMOS_FLOW + COSMIC_REMNANT,
  COSMIC_GALAXY: COSMOS_FLOW + COSMIC_GALAXY,
  COSMIC_CORONA: COSMOS_FLOW + COSMIC_CORONA,
  COSMIC_MILKYWAY: COSMOS_FLOW + COSMIC_MILKYWAY,
  COSMIC_PLANETARY: COSMOS_FLOW + COSMIC_PLANETARY,
  COSMIC_NURSERY: COSMOS_FLOW + COSMIC_NURSERY,
  COSMIC_AURORA_LAKE: COSMOS_FLOW + COSMIC_AURORA_LAKE,
};

/** Volumetric marches render smaller; the gas is soft, stars are drawn per-pixel at that size. */
export const COSMOS_RENDER_SCALE: Record<string, number> = {
};
