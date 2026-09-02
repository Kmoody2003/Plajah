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
import { FxRenderer } from '../fx/fxRenderer';
import { ForgeTransitionRenderer, ForgeTransitionInput } from '../fx/transitionRenderer';
import { getEffect } from '../fx/effects';
import { AudioTexture } from './audioTexture';
import type { CubeLutData } from '../../../../services/fabula/cubeLut';

// Blend-mode index — must match the switch in COMPOSITE_FS below.
export const BLEND_INDEX: Record<string, number> = {
  normal: 0, screen: 1, add: 2, multiply: 3, overlay: 4,
  lighten: 5, darken: 6, difference: 7, exclusion: 8, 'color-dodge': 9, 'hard-light': 10,
};

type Mat3Row = number[];
const mul3 = (a: Mat3Row, b: Mat3Row): Mat3Row => { const o = new Array(9).fill(0); for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o[r * 3 + k] = a[r * 3] * b[k] + a[r * 3 + 1] * b[3 + k] + a[r * 3 + 2] * b[6 + k]; return o; };
/** F*M*F with F = flip-y: re-express an image-space (y-down) homography in GL uv space (y-up). */
function flipYMat3(m: Mat3Row): Mat3Row { const F = [1, 0, 0, 0, -1, 1, 0, 0, 1]; return mul3(F, mul3(m, F)); }
function isIdentityMat3(m: Mat3Row): boolean { const s = Math.abs(m[8]) < 1e-12 ? 1 : 1 / m[8]; const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]; for (let i = 0; i < 9; i++) if (Math.abs(m[i] * s - I[i]) > 1e-9) return false; return true; }

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const CUBE_LUT_FS = `#version 300 es
precision highp float; precision highp sampler3D; in vec2 vUv; out vec4 outColor;
uniform sampler2D uTex; uniform sampler3D uLut; uniform float uScale,uOff,uStrength;
void main(){vec4 b=texture(uTex,vUv);vec3 q=clamp(b.rgb,0.,1.)*uScale+uOff;vec3 c=texture(uLut,q).rgb;outColor=vec4(mix(b.rgb,c,uStrength),b.a);}`;

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
// Per-layer HOMOGRAPHY (VectorTrack planar stabilise / corner pin): a SAMPLING matrix in
// GL uv space, output(p) = src(uH*p). uHOn=0 = identity. Applied after the affine transform.
uniform int uHOn;
uniform mat3 uH;
// Per-layer WIPE matte — a spatial reveal for wipe transitions (0=L→R,1=R→L,2=T→B,3=B→T,4=radial).
uniform int uWipeOn, uWipeDir;
uniform float uWipeP, uWipeSoft;
// Per-input GRADE stage (Resolve-style primaries) — applied to the source BEFORE blending.
uniform int uGradeOn;
uniform vec3 uGLift, uGGamma, uGGain;
uniform float uGCon, uGPivot, uGSat, uGHue, uGTemp, uGTint;
// Tone-curve LUT: 256x1 RGBA. R/G/B hold the per-channel curves, A holds master.
uniform int uCurveOn;
uniform sampler2D uCurveTex;
// HSL qualifier (secondary): key a hue/sat/lum range and correct only inside it.
uniform int uQualOn, uQShow;
uniform float uQH, uQHW, uQSL, uQSH, uQLL, uQLH, uQSoft, uQdHue, uQmSat, uQmLum;
// Power window: limit the whole per-input grade to a rect/ellipse region (UV space).
uniform int uWinOn, uWinShape, uWinInvert;
uniform vec2 uWinPos, uWinSize;
uniform float uWinFeather;

vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b), d = mx - mn;
  float l = (mx + mn) * 0.5, h = 0.0, s = 0.0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = mod((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0), 6.0) / 6.0;
    else if (mx == c.g) h = ((c.b - c.r) / d + 2.0) / 6.0;
    else h = ((c.r - c.g) / d + 4.0) / 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  t = fract(t);
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0/3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0/3.0));
}

vec3 gradeColor(vec3 c) {
  // lift / gamma / gain (per channel): c' = gain * (c + lift) ^ (1/gamma)
  c = uGGain * pow(max(c + uGLift, 0.0), 1.0 / max(uGGamma, vec3(0.05)));
  // contrast around a pivot (Resolve defaults to ~0.435)
  c = (c - uGPivot) * uGCon + uGPivot;
  // temp (R↔B) and tint (G↔magenta) axis gains
  c *= vec3(1.0 + uGTemp, 1.0 + uGTint, 1.0 - uGTemp);
  // saturation around Rec.709 luma
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGSat);
  // hue rotation (luminance-preserving matrix); rows packed as constructor columns so
  // c * m applies the standard matrix (GLSL v*M == transpose(M)*v).
  if (abs(uGHue) > 0.0001) {
    float ch = cos(uGHue), sh = sin(uGHue);
    mat3 m = mat3(
      0.299 + 0.701*ch + 0.168*sh, 0.587 - 0.587*ch + 0.330*sh, 0.114 - 0.114*ch - 0.497*sh,
      0.299 - 0.299*ch - 0.328*sh, 0.587 + 0.413*ch + 0.035*sh, 0.114 - 0.114*ch + 0.292*sh,
      0.299 - 0.300*ch + 1.250*sh, 0.587 - 0.588*ch - 1.050*sh, 0.114 + 0.886*ch - 0.203*sh);
    c = c * m;
  }
  c = clamp(c, 0.0, 1.0);
  // Tone curves: per-channel remap (R/G/B of the LUT), then master remap (A of the LUT).
  if (uCurveOn == 1) {
    c.r = texture(uCurveTex, vec2(c.r, 0.5)).r;
    c.g = texture(uCurveTex, vec2(c.g, 0.5)).g;
    c.b = texture(uCurveTex, vec2(c.b, 0.5)).b;
    c.r = texture(uCurveTex, vec2(c.r, 0.5)).a;
    c.g = texture(uCurveTex, vec2(c.g, 0.5)).a;
    c.b = texture(uCurveTex, vec2(c.b, 0.5)).a;
  }
  // HSL qualifier: build a soft key over the hue/sat/lum ranges, correct inside it.
  if (uQualOn == 1) {
    vec3 hsl = rgb2hsl(c);
    float dh = abs(hsl.x - uQH); dh = min(dh, 1.0 - dh);              // circular hue distance
    float kh = 1.0 - smoothstep(uQHW, uQHW + uQSoft, dh);
    float ks = smoothstep(uQSL - uQSoft, uQSL, hsl.y) * (1.0 - smoothstep(uQSH, uQSH + uQSoft, hsl.y));
    float kl = smoothstep(uQLL - uQSoft, uQLL, hsl.z) * (1.0 - smoothstep(uQLH, uQLH + uQSoft, hsl.z));
    float key = clamp(kh * ks * kl, 0.0, 1.0);
    if (uQShow == 1) {
      float g = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(g) * 0.4, c, key);                                 // grey outside the key
    } else {
      vec3 chsl = vec3(fract(hsl.x + uQdHue), clamp(hsl.y * uQmSat, 0.0, 1.0), clamp(hsl.z * uQmLum, 0.0, 1.0));
      c = mix(c, hsl2rgb(chsl), key);
    }
  }
  return clamp(c, 0.0, 1.0);
}

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
  if (uHOn == 1) { vec3 hp = uH * vec3(suv, 1.0); suv = hp.z > 1e-6 ? hp.xy / hp.z : vec2(-1.0); }
  float inb = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec4 dst = texture(uDst, vUv);
  vec4 src = texture(uSrc, clamp(suv, 0.0, 1.0)) * inb;
  if (uGradeOn == 1) {
    vec3 graded = gradeColor(src.rgb);
    if (uWinOn == 1) {
      // Normalised distance from the window centre; ellipse = length, rect = chebyshev.
      vec2 pw = (suv - uWinPos) / max(uWinSize, vec2(1e-3));
      float dd = uWinShape == 1 ? max(abs(pw.x), abs(pw.y)) : length(pw);
      float wt = 1.0 - smoothstep(1.0 - uWinFeather, 1.0, dd);
      if (uWinInvert == 1) wt = 1.0 - wt;
      src.rgb = mix(src.rgb, graded, clamp(wt, 0.0, 1.0));
    } else {
      src.rgb = graded;
    }
  }
  // Wipe matte: reveal this layer progressively along an edge (wipe transitions).
  if (uWipeOn == 1) {
    float coord = uWipeDir == 0 ? suv.x
      : uWipeDir == 1 ? 1.0 - suv.x
      : uWipeDir == 2 ? suv.y
      : uWipeDir == 3 ? 1.0 - suv.y
      : length(suv - 0.5) * 1.41421;
    float m = 1.0 - smoothstep(uWipeP - uWipeSoft, uWipeP + uWipeSoft, coord);
    src.a *= clamp(m, 0.0, 1.0);
  }
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

// GRADE LAYERS (H2) — a standalone pass that applies ONE Resolve-style grade to a
// texture, run once per layer so secondaries stack. Reuses the same grade math as the
// inline composite grade; the power window folds INSIDE (uses vUv, no per-layer transform).
// The single-grade inline path in COMPOSITE_FS is untouched — this only runs for clips
// that carry fx.grades[].
const GRADEPASS_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform int uGradeOn;
uniform vec3 uGLift, uGGamma, uGGain;
uniform float uGCon, uGPivot, uGSat, uGHue, uGTemp, uGTint;
uniform int uCurveOn;
uniform sampler2D uCurveTex;
uniform int uQualOn, uQShow;
uniform float uQH, uQHW, uQSL, uQSH, uQLL, uQLH, uQSoft, uQdHue, uQmSat, uQmLum;
uniform int uWinOn, uWinShape, uWinInvert;
uniform vec2 uWinPos, uWinSize;
uniform float uWinFeather;

vec3 rgb2hsl(vec3 c) {
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b), d = mx - mn;
  float l = (mx + mn) * 0.5, h = 0.0, s = 0.0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = mod((c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0), 6.0) / 6.0;
    else if (mx == c.g) h = ((c.b - c.r) / d + 2.0) / 6.0;
    else h = ((c.r - c.g) / d + 4.0) / 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  t = fract(t);
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0/3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0/3.0));
}
vec3 gradeOne(vec3 c, vec2 uv) {
  vec3 orig = c;
  c = uGGain * pow(max(c + uGLift, 0.0), 1.0 / max(uGGamma, vec3(0.05)));
  c = (c - uGPivot) * uGCon + uGPivot;
  c *= vec3(1.0 + uGTemp, 1.0 + uGTint, 1.0 - uGTemp);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGSat);
  if (abs(uGHue) > 0.0001) {
    float ch = cos(uGHue), sh = sin(uGHue);
    mat3 m = mat3(
      0.299 + 0.701*ch + 0.168*sh, 0.587 - 0.587*ch + 0.330*sh, 0.114 - 0.114*ch - 0.497*sh,
      0.299 - 0.299*ch - 0.328*sh, 0.587 + 0.413*ch + 0.035*sh, 0.114 - 0.114*ch + 0.292*sh,
      0.299 - 0.300*ch + 1.250*sh, 0.587 - 0.588*ch - 1.050*sh, 0.114 + 0.886*ch - 0.203*sh);
    c = c * m;
  }
  c = clamp(c, 0.0, 1.0);
  if (uCurveOn == 1) {
    c.r = texture(uCurveTex, vec2(c.r, 0.5)).r;
    c.g = texture(uCurveTex, vec2(c.g, 0.5)).g;
    c.b = texture(uCurveTex, vec2(c.b, 0.5)).b;
    c.r = texture(uCurveTex, vec2(c.r, 0.5)).a;
    c.g = texture(uCurveTex, vec2(c.g, 0.5)).a;
    c.b = texture(uCurveTex, vec2(c.b, 0.5)).a;
  }
  if (uQualOn == 1) {
    vec3 hsl = rgb2hsl(c);
    float dh = abs(hsl.x - uQH); dh = min(dh, 1.0 - dh);
    float kh = 1.0 - smoothstep(uQHW, uQHW + uQSoft, dh);
    float ks = smoothstep(uQSL - uQSoft, uQSL, hsl.y) * (1.0 - smoothstep(uQSH, uQSH + uQSoft, hsl.y));
    float kl = smoothstep(uQLL - uQSoft, uQLL, hsl.z) * (1.0 - smoothstep(uQLH, uQLH + uQSoft, hsl.z));
    float key = clamp(kh * ks * kl, 0.0, 1.0);
    if (uQShow == 1) { float g = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(g) * 0.4, c, key); }
    else { vec3 chsl = vec3(fract(hsl.x + uQdHue), clamp(hsl.y * uQmSat, 0.0, 1.0), clamp(hsl.z * uQmLum, 0.0, 1.0)); c = mix(c, hsl2rgb(chsl), key); }
  }
  c = clamp(c, 0.0, 1.0);
  if (uWinOn == 1) {
    vec2 pw = (uv - uWinPos) / max(uWinSize, vec2(1e-3));
    float dd = uWinShape == 1 ? max(abs(pw.x), abs(pw.y)) : length(pw);
    float wt = 1.0 - smoothstep(1.0 - uWinFeather, 1.0, dd);
    if (uWinInvert == 1) wt = 1.0 - wt;
    c = mix(orig, c, clamp(wt, 0.0, 1.0));
  }
  return c;
}
void main() {
  vec4 t = texture(uTex, vUv);
  outColor = vec4(uGradeOn == 1 ? gradeOne(t.rgb, vUv) : t.rgb, t.a);
}`;

export interface GradeParams { brightness: number; contrast: number; saturation: number; gamma: number; }
const NEUTRAL_GRADE: GradeParams = { brightness: 1, contrast: 1, saturation: 1, gamma: 1 };
function isNeutral(g: GradeParams): boolean {
  return g.brightness === 1 && g.contrast === 1 && g.saturation === 1 && g.gamma === 1;
}

/** Per-input Resolve-style primaries, applied in-shader before blending.
 *  lift/gamma/gain are per-channel [r,g,b]; hue in radians; temp/tint ±0.3-ish. */
export interface InputGrade {
  lift?: [number, number, number];
  gamma?: [number, number, number];
  gain?: [number, number, number];
  contrast?: number; pivot?: number;
  sat?: number; hue?: number; temp?: number; tint?: number;
  /** Prebuilt 256×RGBA tone-curve LUT (see services/fabula/gradeCurves.buildCurveLut). */
  curveLut?: Uint8Array;
  /** HSL qualifier (secondary) — keys a hue/sat/lum range and corrects inside it. */
  qualifier?: {
    h: number; hw: number; sl: number; sh: number; ll: number; lh: number;
    soft: number; dHue: number; mSat: number; mLum: number; show?: boolean;
  } | null;
  /** Power window — limits the whole per-input grade to a rect/ellipse region (UV). */
  window?: {
    shape?: 'ellipse' | 'rect'; x: number; y: number; w: number; h: number;
    feather?: number; invert?: boolean;
  } | null;
}
export function isGradeIdentity(g?: InputGrade | null): boolean {
  if (!g) return true;
  if (g.curveLut) return false; // a curves-only grade is still a grade
  if (g.qualifier) return false; // a qualifier-only grade is still a grade
  const v3 = (a?: [number, number, number], d = 0) => !a || (a[0] === d && a[1] === d && a[2] === d);
  return v3(g.lift, 0) && v3(g.gamma, 1) && v3(g.gain, 1)
    && (g.contrast ?? 1) === 1 && (g.sat ?? 1) === 1 && !(g.hue) && !(g.temp) && !(g.tint);
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
  /** Per-layer projective SAMPLING matrix (row-major 3x3, normalized image space, y down):
   *  output(p) = src(H*p). VectorTrack planar stabilise passes H, a corner pin passes inv(H*Q). */
  homography?: number[] | null;
  /** Per-input grade (wheels/temp/tint) — applied in-shader before blending. */
  grade?: InputGrade;
  /** GRADE LAYERS (H2) — a stack of grades applied in sequence before blending.
   *  When present, takes precedence over `grade` (the inline single-grade path). */
  grades?: InputGrade[];
  /** Ordered Fabula Forge stack. The same host-neutral instances are used by clips,
   *  graph nodes and the future OFX adapter. */
  effects?: Array<{
    id: string; effectId: string; enabled?: boolean; mix?: number;
    params: Record<string, number>;
    auxTexture?: WebGLTexture;
    auxElement?: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  }>;
  /** Timeline time supplied to deterministic/animated effects. */
  time?: number;
  /** WIPE matte — a spatial reveal for wipe transitions (progress 0..1). */
  wipe?: { dir: number; p: number; soft?: number } | null;
  /** Native two-input transition. When present, the current accumulator is outgoing
   * and this fully processed layer is incoming. */
  transition?: ForgeTransitionInput | null;
  /** Nested same-context layer stack rendered to one texture before this layer is
   * blended or used as a transition input. */
  precompose?: LayerInput[];
  precomposeGroup?: string;
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
  private inGradeU: Record<string, WebGLUniformLocation | null> = {}; // per-input grade uniforms
  private ping?: RenderTarget; private pong?: RenderTarget;
  private groupPing?: RenderTarget; private groupPong?: RenderTarget;
  private srcTex: WebGLTexture;       // reused for element uploads
  private curveTex: WebGLTexture;     // reused 256×1 tone-curve LUT
  private lastCurveLut: Uint8Array | null = null; // upload only when the LUT reference changes
  private gradePassProg: WebGLProgram;              // GRADE LAYERS (H2) — one grade per pass
  private gradePassU: Record<string, WebGLUniformLocation | null> = {};
  private gradeA?: RenderTarget; private gradeB?: RenderTarget; // grade-layer ping-pong
  private fx: FxRenderer;
  private transitions: ForgeTransitionRenderer;
  private fxAudio: AudioTexture;
  private cubeProg: WebGLProgram; private cubeTex: WebGLTexture; private cubeKey = '';
  private cubeU: Record<string, WebGLUniformLocation | null> = {};
  private auxTextures = new Map<string, WebGLTexture>();
  private width = 0; private height = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = createGL(canvas);
    if (!gl) throw new Error('[PixelsCore] WebGL2 unavailable');
    this.gl = gl;
    this.fx = new FxRenderer(gl);
    this.transitions = new ForgeTransitionRenderer(gl);
    this.fxAudio = new AudioTexture(gl);
    this.cubeProg = createProgram(gl, QUAD_VS, CUBE_LUT_FS);
    this.cubeTex = gl.createTexture()!;
    for (const n of ['uTex','uLut','uScale','uOff','uStrength']) this.cubeU[n] = gl.getUniformLocation(this.cubeProg, n);
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
    for (const n of ['uWipeOn', 'uWipeDir', 'uWipeP', 'uWipeSoft', 'uHOn', 'uH'])
      this.inGradeU[n] = gl.getUniformLocation(this.compositeProg, n);
    for (const n of ['uGradeOn', 'uGLift', 'uGGamma', 'uGGain', 'uGCon', 'uGPivot', 'uGSat', 'uGHue', 'uGTemp', 'uGTint', 'uCurveOn', 'uCurveTex',
      'uQualOn', 'uQShow', 'uQH', 'uQHW', 'uQSL', 'uQSH', 'uQLL', 'uQLH', 'uQSoft', 'uQdHue', 'uQmSat', 'uQmLum',
      'uWinOn', 'uWinShape', 'uWinInvert', 'uWinPos', 'uWinSize', 'uWinFeather'])
      this.inGradeU[n] = gl.getUniformLocation(this.compositeProg, n);
    this.uPresentTex = gl.getUniformLocation(this.presentProg, 'uTex')!;
    for (const n of ['uShakeOff', 'uShakeSin', 'uShakeCos', 'uShakeScale'])
      this.uShake[n] = gl.getUniformLocation(this.presentProg, n);
    for (const n of ['uTex', 'uBright', 'uContrast', 'uSat', 'uGamma'])
      this.gradeU[n] = gl.getUniformLocation(this.gradeProg, n);
    this.srcTex = makeSourceTexture(gl);
    // 256×1 tone-curve LUT texture — LINEAR so intermediate levels interpolate.
    this.curveTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Seed an identity LUT so the sampler on unit 2 is always a complete texture.
    const idLut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) { const v = i; idLut[i * 4] = v; idLut[i * 4 + 1] = v; idLut[i * 4 + 2] = v; idLut[i * 4 + 3] = v; }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, idLut);
    // Grade-layer pass program + its uniform locations.
    this.gradePassProg = createProgram(gl, QUAD_VS, GRADEPASS_FS);
    for (const n of ['uTex', 'uGradeOn', 'uGLift', 'uGGamma', 'uGGain', 'uGCon', 'uGPivot', 'uGSat', 'uGHue', 'uGTemp', 'uGTint',
      'uCurveOn', 'uCurveTex', 'uQualOn', 'uQShow', 'uQH', 'uQHW', 'uQSL', 'uQSH', 'uQLL', 'uQLH', 'uQSoft', 'uQdHue', 'uQmSat', 'uQmLum',
      'uWinOn', 'uWinShape', 'uWinInvert', 'uWinPos', 'uWinSize', 'uWinFeather'])
      this.gradePassU[n] = gl.getUniformLocation(this.gradePassProg, n);
  }

  /** Resize internal targets + canvas backing store (capped to a 1080p-class target). */
  resize(w: number, h: number) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.width && h === this.height && this.ping) return;
    this.width = w; this.height = h;
    (this.canvas as any).width = w; (this.canvas as any).height = h;
    this.ping = makeTarget(this.gl, w, h, this.ping);
    this.pong = makeTarget(this.gl, w, h, this.pong);
    this.gradeA = makeTarget(this.gl, w, h, this.gradeA);
    this.gradeB = makeTarget(this.gl, w, h, this.gradeB);
    this.groupPing = makeTarget(this.gl, w, h, this.groupPing);
    this.groupPong = makeTarget(this.gl, w, h, this.groupPong);
  }

  /** Render a nested compound in the SAME GL context, so procedural generators,
   * alpha, grade layers and Forge effects retain full fidelity. */
  private precomposeLayers(layers: LayerInput[]): WebGLTexture | null {
    if (!this.groupPing || !this.groupPong) return null;
    const mainPing = this.ping, mainPong = this.pong;
    this.ping = this.groupPing; this.pong = this.groupPong;
    this.composite(layers);
    this.groupPing = this.ping; this.groupPong = this.pong;
    const texture = this.groupPing?.tex || null;
    this.ping = mainPing; this.pong = mainPong;
    return texture;
  }

  /** GRADE LAYERS (H2): run each grade over the source in sequence, returning the
   *  final graded texture. Empty/absent grades → the source unchanged. */
  private applyInputGrades(srcTex: WebGLTexture, grades: InputGrade[]): WebGLTexture {
    const gl = this.gl;
    if (!this.gradeA || !this.gradeB) return srcTex;
    const active = grades.filter((g) => !isGradeIdentity(g));
    if (!active.length) return srcTex;
    gl.useProgram(this.gradePassProg);
    gl.bindVertexArray(this.quad);
    gl.disable(gl.BLEND);
    let read = srcTex;
    let dstFbo = this.gradeA, otherFbo = this.gradeB;
    for (const g of active) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo.fbo);
      gl.viewport(0, 0, this.width, this.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, read);
      gl.uniform1i(this.gradePassU.uTex, 0);
      this.setGradePassUniforms(g);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      read = dstFbo.tex;
      const t = dstFbo; dstFbo = otherFbo; otherFbo = t;   // ping-pong
    }
    return read;
  }

  /** Set the grade-pass uniforms + curve LUT (unit 2) for one grade. */
  private setGradePassUniforms(g: InputGrade) {
    const gl = this.gl;
    const U = this.gradePassU;
    gl.uniform1i(U.uGradeOn, 1);
    const l = g.lift ?? [0, 0, 0], gm = g.gamma ?? [1, 1, 1], gn = g.gain ?? [1, 1, 1];
    gl.uniform3f(U.uGLift, l[0], l[1], l[2]);
    gl.uniform3f(U.uGGamma, gm[0], gm[1], gm[2]);
    gl.uniform3f(U.uGGain, gn[0], gn[1], gn[2]);
    gl.uniform1f(U.uGCon, g.contrast ?? 1); gl.uniform1f(U.uGPivot, g.pivot ?? 0.435);
    gl.uniform1f(U.uGSat, g.sat ?? 1); gl.uniform1f(U.uGHue, g.hue ?? 0);
    gl.uniform1f(U.uGTemp, g.temp ?? 0); gl.uniform1f(U.uGTint, g.tint ?? 0);
    // curve LUT on unit 2 (shared texture; re-upload when the layer's LUT changes reference)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    if (g.curveLut) {
      if (g.curveLut !== this.lastCurveLut) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, g.curveLut);
        this.lastCurveLut = g.curveLut;
      }
      gl.uniform1i(U.uCurveOn, 1); gl.uniform1i(U.uCurveTex, 2);
    } else { gl.uniform1i(U.uCurveOn, 0); gl.uniform1i(U.uCurveTex, 2); }
    const q = g.qualifier;
    gl.uniform1i(U.uQualOn, q ? 1 : 0);
    if (q) {
      gl.uniform1i(U.uQShow, q.show ? 1 : 0);
      gl.uniform1f(U.uQH, q.h); gl.uniform1f(U.uQHW, q.hw);
      gl.uniform1f(U.uQSL, q.sl); gl.uniform1f(U.uQSH, q.sh);
      gl.uniform1f(U.uQLL, q.ll); gl.uniform1f(U.uQLH, q.lh);
      gl.uniform1f(U.uQSoft, q.soft); gl.uniform1f(U.uQdHue, q.dHue);
      gl.uniform1f(U.uQmSat, q.mSat); gl.uniform1f(U.uQmLum, q.mLum);
    }
    const win = g.window;
    gl.uniform1i(U.uWinOn, win ? 1 : 0);
    if (win) {
      gl.uniform1i(U.uWinShape, win.shape === 'rect' ? 1 : 0);
      gl.uniform1i(U.uWinInvert, win.invert ? 1 : 0);
      gl.uniform2f(U.uWinPos, win.x, win.y);
      gl.uniform2f(U.uWinSize, Math.max(1e-3, win.w), Math.max(1e-3, win.h));
      gl.uniform1f(U.uWinFeather, Math.max(0, Math.min(1, win.feather ?? 0.1)));
    }
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
    // Curve LUT always lives on unit 2 (identity until a layer supplies one).
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.uniform1i(this.inGradeU.uCurveTex, 2);

    for (const layer of layers) {
      // Resolve the source texture (ported texture, or upload an element).
      let src: WebGLTexture | null = null;
      if (layer.precompose?.length) {
        src = this.precomposeLayers(layer.precompose);
        gl.useProgram(this.compositeProg); gl.bindVertexArray(this.quad); gl.disable(gl.BLEND);
      } else if (layer.texture) {
        src = layer.texture;
      } else if (layer.element) {
        if (uploadElement(gl, this.srcTex, layer.element)) src = this.srcTex;
      }
      if (!src) continue;

      // FORGE STACK: each enabled instance is evaluated in order before grading
      // and compositing. Parameter order is defined by the portable registry.
      if (layer.effects?.length) {
        for (const instance of layer.effects) {
          if (instance.enabled === false) continue;
          const effect = getEffect(instance.effectId);
          if (!effect) continue;
          const values = effect.params.map((param) => instance.params?.[param.key] ?? param.default);
          let auxiliary = instance.auxTexture;
          if (!auxiliary && instance.auxElement) {
            auxiliary = this.auxTextures.get(instance.id);
            if (!auxiliary) { auxiliary = makeSourceTexture(gl); this.auxTextures.set(instance.id, auxiliary); }
            if (!uploadElement(gl, auxiliary, instance.auxElement)) auxiliary = undefined;
          }
          src = this.fx.render(`clip:${instance.id}`, effect.id, values, src, this.width, this.height, { time: layer.time ?? 0, audio: this.fxAudio }, auxiliary, { mix: instance.mix ?? 1 });
        }
        gl.useProgram(this.compositeProg);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
        gl.uniform1i(this.inGradeU.uCurveTex, 2);
      }

      // GRADE LAYERS (H2): pre-grade the source through the layer stack, then blend
      // the result. Switches program/FBO, so restore the composite program after.
      const hasGradeLayers = !!(layer.grades && layer.grades.length);
      if (hasGradeLayers) {
        src = this.applyInputGrades(src, layer.grades!);
        gl.useProgram(this.compositeProg);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
        gl.uniform1i(this.inGradeU.uCurveTex, 2);
      }

      // TRUE TWO-INPUT TRANSITION: evaluate after the incoming stack/grade, using
      // the current accumulator as outgoing. Copy the result through the normal
      // blend path below so accumulator ownership/ping-pong stays deterministic.
      if (layer.transition) {
        src = this.transitions.render(this.ping.tex, src, this.width, this.height, layer.transition);
      }

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
      // Homography (set every layer so identity resets the prior draw). Layers hand us an
      // image-space (y-down) matrix; textures are uploaded Y-flipped so we conjugate with
      // F=flip-y into GL uv space and upload column-major.
      const hm = layer.homography;
      const hOn = !!hm && !isIdentityMat3(hm);
      gl.uniform1i(this.inGradeU.uHOn, hOn ? 1 : 0);
      if (hOn && hm) { const g = flipYMat3(hm); gl.uniformMatrix3fv(this.inGradeU.uH, false, [g[0], g[3], g[6], g[1], g[4], g[7], g[2], g[5], g[8]]); }
      // Wipe matte (set every layer so identity resets the prior draw).
      const wp = layer.wipe;
      gl.uniform1i(this.inGradeU.uWipeOn, wp ? 1 : 0);
      if (wp) {
        gl.uniform1i(this.inGradeU.uWipeDir, wp.dir | 0);
        gl.uniform1f(this.inGradeU.uWipeP, wp.p);
        gl.uniform1f(this.inGradeU.uWipeSoft, Math.max(0.001, wp.soft ?? 0.06));
      }
      // Per-input grade — set EVERY layer (uniforms persist across draws; identity must reset).
      const gr = layer.grade;
      // Grade layers already applied above → skip the inline single-grade path.
      const on = !hasGradeLayers && gr && !isGradeIdentity(gr);
      gl.uniform1i(this.inGradeU.uGradeOn, on ? 1 : 0);
      if (on && gr) {
        const l = gr.lift ?? [0, 0, 0], gm = gr.gamma ?? [1, 1, 1], gn = gr.gain ?? [1, 1, 1];
        gl.uniform3f(this.inGradeU.uGLift, l[0], l[1], l[2]);
        gl.uniform3f(this.inGradeU.uGGamma, gm[0], gm[1], gm[2]);
        gl.uniform3f(this.inGradeU.uGGain, gn[0], gn[1], gn[2]);
        gl.uniform1f(this.inGradeU.uGCon, gr.contrast ?? 1);
        gl.uniform1f(this.inGradeU.uGPivot, gr.pivot ?? 0.435);
        gl.uniform1f(this.inGradeU.uGSat, gr.sat ?? 1);
        gl.uniform1f(this.inGradeU.uGHue, gr.hue ?? 0);
        gl.uniform1f(this.inGradeU.uGTemp, gr.temp ?? 0);
        gl.uniform1f(this.inGradeU.uGTint, gr.tint ?? 0);
      }
      // HSL qualifier (secondary). Set every layer so identity resets the prior draw.
      const q = on && gr ? gr.qualifier : null;
      gl.uniform1i(this.inGradeU.uQualOn, q ? 1 : 0);
      if (q) {
        gl.uniform1i(this.inGradeU.uQShow, q.show ? 1 : 0);
        gl.uniform1f(this.inGradeU.uQH, q.h); gl.uniform1f(this.inGradeU.uQHW, q.hw);
        gl.uniform1f(this.inGradeU.uQSL, q.sl); gl.uniform1f(this.inGradeU.uQSH, q.sh);
        gl.uniform1f(this.inGradeU.uQLL, q.ll); gl.uniform1f(this.inGradeU.uQLH, q.lh);
        gl.uniform1f(this.inGradeU.uQSoft, q.soft);
        gl.uniform1f(this.inGradeU.uQdHue, q.dHue); gl.uniform1f(this.inGradeU.uQmSat, q.mSat); gl.uniform1f(this.inGradeU.uQmLum, q.mLum);
      }
      // Power window — limits the grade above to a region. Set every layer (identity resets).
      const win = on && gr ? gr.window : null;
      gl.uniform1i(this.inGradeU.uWinOn, win ? 1 : 0);
      if (win) {
        gl.uniform1i(this.inGradeU.uWinShape, win.shape === 'rect' ? 1 : 0);
        gl.uniform1i(this.inGradeU.uWinInvert, win.invert ? 1 : 0);
        gl.uniform2f(this.inGradeU.uWinPos, win.x, win.y);
        gl.uniform2f(this.inGradeU.uWinSize, Math.max(1e-3, win.w), Math.max(1e-3, win.h));
        gl.uniform1f(this.inGradeU.uWinFeather, Math.max(0, Math.min(1, win.feather ?? 0.1)));
      }
      // Tone-curve LUT (always bound on TEXTURE2). Upload only when it changes.
      const lut = on && gr ? gr.curveLut : undefined;
      gl.uniform1i(this.inGradeU.uCurveOn, lut ? 1 : 0);
      if (lut && lut !== this.lastCurveLut) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
        this.lastCurveLut = lut;
      }
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

  private applyCubeLut(lut: CubeLutData) {
    const gl = this.gl;
    if (!this.ping || !this.pong || !lut?.size || !lut.bytes?.length) return;
    const key = `${lut.id}:${lut.size}:${lut.bytes.length}`;
    if (key !== this.cubeKey) {
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, this.cubeTex);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB8, lut.size, lut.size, lut.size, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(lut.bytes)); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.cubeKey = key;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pong.fbo); gl.viewport(0, 0, this.width, this.height); gl.useProgram(this.cubeProg); gl.bindVertexArray(this.quad); gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.ping.tex); gl.uniform1i(this.cubeU.uTex, 0);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, this.cubeTex); gl.uniform1i(this.cubeU.uLut, 3);
    gl.uniform1f(this.cubeU.uScale, (lut.size - 1) / lut.size); gl.uniform1f(this.cubeU.uOff, .5 / lut.size); gl.uniform1f(this.cubeU.uStrength, Math.max(0, Math.min(1, lut.strength ?? 1)));
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); const t = this.ping; this.ping = this.pong; this.pong = t;
  }

  /** One-shot: composite + (optional post-FX) + present (with optional camera shake). */
  render(layers: LayerInput[], grade?: GradeParams, shake?: ShakeParams, cubeLut?: CubeLutData | null) {
    if (this.disposed) return;
    this.composite(layers);
    if (grade && !isNeutral(grade)) this.applyGrade(grade);
    if (cubeLut) this.applyCubeLut(cubeLut);
    this.present(shake);
  }

  dispose() {
    this.disposed = true;
    const gl = this.gl;
    if (this.ping) { gl.deleteTexture(this.ping.tex); gl.deleteFramebuffer(this.ping.fbo); }
    if (this.pong) { gl.deleteTexture(this.pong.tex); gl.deleteFramebuffer(this.pong.fbo); }
    gl.deleteTexture(this.srcTex);
    this.fx.dispose();
    this.transitions.dispose();
    this.fxAudio.dispose();
    gl.deleteTexture(this.cubeTex); gl.deleteProgram(this.cubeProg);
    this.auxTextures.forEach((texture) => gl.deleteTexture(texture)); this.auxTextures.clear();
    gl.deleteTexture(this.curveTex);
    if (this.gradeA) { gl.deleteTexture(this.gradeA.tex); gl.deleteFramebuffer(this.gradeA.fbo); }
    if (this.gradeB) { gl.deleteTexture(this.gradeB.tex); gl.deleteFramebuffer(this.gradeB.fbo); }
    if (this.groupPing) { gl.deleteTexture(this.groupPing.tex); gl.deleteFramebuffer(this.groupPing.fbo); }
    if (this.groupPong) { gl.deleteTexture(this.groupPong.tex); gl.deleteFramebuffer(this.groupPong.fbo); }
    gl.deleteProgram(this.gradePassProg);
    gl.deleteProgram(this.compositeProg);
    gl.deleteProgram(this.presentProg);
    gl.deleteProgram(this.gradeProg);
  }
}
