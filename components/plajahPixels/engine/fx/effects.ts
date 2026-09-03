// effects.ts — the OFX-shaped GPU effect SDK. Each effect is a "plugin": a name, a
// typed parameter list, and a GLSL body that defines `vec4 fx(vec2 uv)` over its
// input. This is the OFX contract (clip in → params → render) reframed for the web
// GL pipeline; a node in the compositor is one of these, and adding an effect is
// adding a registry entry (or later, a user/WGSL plugin). Deterministic: time +
// audio are injected, so effects export identically.

import { PHASE1_LENS_BLUR_EFFECTS } from './phase1LensBlurEffects';
import { PHASE1_COLOR_KEY_EFFECTS } from './phase1ColorKeyEffects';
import { PHASE1_STYLIZE_GENERATOR_EFFECTS } from './phase1StylizeGeneratorEffects';
import { PHASE1_DISTORT_EFFECTS } from './phase1DistortEffects';
import { PHASE1_ADVANCED_LIGHT_EFFECTS } from './phase1AdvancedLightEffects';
import { PHASE1_ADVANCED_BLUR_EFFECTS } from './phase1AdvancedBlurEffects';
import { PHASE1_ADVANCED_COLOR_EFFECTS } from './phase1AdvancedColorEffects';
import { PHASE1_ADVANCED_KEY_EFFECTS } from './phase1AdvancedKeyEffects';
import { PHASE1_STYLIZE_FINISH_EFFECTS } from './phase1StylizeFinishEffects';
import { PHASE1_DISTORT_FINISH_EFFECTS } from './phase1DistortFinishEffects';
import { PHASE1_MULTI_INPUT_EFFECTS } from './phase1MultiInputEffects';
import { PHASE2_TIME_EFFECTS } from './phase2TimeEffects';
import { PHASE3_PARTICLE_EFFECTS } from './phase3ParticleEffects';
import { PHASE3_GRADS_TINTS_EFFECTS } from './phase3GradsTintsEffects';
import { PHASE3_STYLIZE_VARIANT_EFFECTS } from './phase3StylizeVariantsEffects';
import { PHASE3_GRAPHICS_EFFECTS } from './phase3GraphicsEffects';
import { PHASE3_TEXT_EFFECTS } from './phase3TextEffects';
import { PHASE4_VOLUMETRIC_EFFECTS } from './phase4Volumetric3DEffects';
import { PHASE4_FRAGMENT_EFFECTS } from './phase4FragmentEffects';
import { PHASE3_LENS_FLARE_EFFECTS } from './phase3LensFlareEffects';
import { PHASE3_DVE_EFFECTS } from './phase3DveEffects';
import { PHASE3_CLEANUP_EFFECTS } from './phase3CleanupEffects';
import { PHASE3_BACKLOG_EFFECTS } from './phase3BacklogEffects';

export type FxCategory = 'color' | 'light' | 'blur' | 'stylize' | 'distort' | 'utility' | 'time' | 'generator' | 'mask';
export interface FxParam {
  key: string; label: string; min: number; max: number; default: number;
  step?: number; unit?: string; curve?: 'linear' | 'log' | 'power';
}
export interface FxPreset { id: string; name: string; description: string; params: Record<string, number>; }
export interface FxPass { id: string; glsl: string; }
export interface FxEffect {
  id: string; name: string; params: FxParam[]; glsl: string;
  category?: FxCategory; summary?: string; version?: number;
  passes?: FxPass[]; presets?: FxPreset[];
  /** Secondary texture input. `kind: 'text'` means the host rasterises a string into it
   *  (services/fabula/textOverlay.ts) rather than binding another asset. */
  auxInput?: { label: string; optional?: boolean; kind?: 'image' | 'text' };
  /** Reads its own previous output (prev) / previous source (prevSrc); needs frame history.
   *  A number (2..4) keeps that many previous SOURCE frames (prevSrcN(n, uv), n = 1..4). */
  temporal?: boolean | number;
}

// Shared header: the effect body samples its input via inp(uv) and reads P0..P7 (its
// params, in declared order) + audio + time.
export const FX_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform sampler2D uSource;
uniform sampler2D uAux;
uniform sampler2D uPrev;     // this effect's previous OUTPUT (feedback); = input on the first frame
uniform sampler2D uPrevSrc;  // the previous SOURCE frame; = input on the first frame
uniform sampler2D uPrevSrc2, uPrevSrc3, uPrevSrc4; // older source frames (temporal: N); = nearest available
uniform vec2 uResolution;
uniform float uTime;
uniform float uDeltaT;       // seconds since the previous frame; 0 = first frame / time jump
uniform float uFrame;        // frames of continuous history for this instance
uniform float iBass, iMid, iTreble, iLevel;
uniform float P0,P1,P2,P3,P4,P5,P6,P7;
vec4 inp(vec2 uv){ return texture(uInput, clamp(uv, 0.0, 1.0)); }
vec4 src(vec2 uv){ return texture(uSource, clamp(uv, 0.0, 1.0)); }
vec4 aux(vec2 uv){ return texture(uAux, clamp(uv, 0.0, 1.0)); }
vec4 prev(vec2 uv){ return texture(uPrev, clamp(uv, 0.0, 1.0)); }
vec4 prevSrc(vec2 uv){ return texture(uPrevSrc, clamp(uv, 0.0, 1.0)); }
vec4 prevSrcN(int n, vec2 uv){ vec2 q=clamp(uv,0.0,1.0); if(n<=1) return texture(uPrevSrc,q); if(n==2) return texture(uPrevSrc2,q); if(n==3) return texture(uPrevSrc3,q); return texture(uPrevSrc4,q); }
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`;
export const FX_MAIN = `\nvoid main(){ outColor = fx(vUv); }\n`;

export const FX_EFFECTS: FxEffect[] = [
  ...PHASE1_LENS_BLUR_EFFECTS,
  ...PHASE1_COLOR_KEY_EFFECTS,
  ...PHASE1_STYLIZE_GENERATOR_EFFECTS,
  ...PHASE1_DISTORT_EFFECTS,
  ...PHASE1_ADVANCED_LIGHT_EFFECTS,
  ...PHASE1_ADVANCED_BLUR_EFFECTS,
  ...PHASE1_ADVANCED_COLOR_EFFECTS,
  ...PHASE1_ADVANCED_KEY_EFFECTS,
  ...PHASE1_STYLIZE_FINISH_EFFECTS,
  ...PHASE1_DISTORT_FINISH_EFFECTS,
  ...PHASE1_MULTI_INPUT_EFFECTS,
  ...PHASE2_TIME_EFFECTS,
  ...PHASE3_PARTICLE_EFFECTS,
  ...PHASE3_GRADS_TINTS_EFFECTS,
  ...PHASE3_STYLIZE_VARIANT_EFFECTS,
  ...PHASE3_GRAPHICS_EFFECTS,
  ...PHASE3_TEXT_EFFECTS,
  ...PHASE4_VOLUMETRIC_EFFECTS,
  ...PHASE4_FRAGMENT_EFFECTS,
  ...PHASE3_LENS_FLARE_EFFECTS,
  ...PHASE3_DVE_EFFECTS,
  ...PHASE3_CLEANUP_EFFECTS,
  ...PHASE3_BACKLOG_EFFECTS,
  {
    id: 'cinematiccolor', name: 'Cinematic Color', category: 'color', version: 1,
    summary: 'Filmic contrast, split-tone color separation and highlight rolloff in one tasteful finishing tool.',
    params: [
      { key: 'exposure', label: 'Exposure', min: -2, max: 2, default: 0, step: .01, unit: 'stops' },
      { key: 'contrast', label: 'Contrast', min: .5, max: 1.8, default: 1.08, step: .01 },
      { key: 'sat', label: 'Saturation', min: 0, max: 1.8, default: 1.02, step: .01 },
      { key: 'shadowHue', label: 'Shadow Hue', min: -1, max: 1, default: -.12, step: .01 },
      { key: 'highlightHue', label: 'Highlight Hue', min: -1, max: 1, default: .1, step: .01 },
      { key: 'rolloff', label: 'Highlight Rolloff', min: 0, max: 1, default: .55, step: .01 },
      { key: 'fade', label: 'Black Fade', min: 0, max: .3, default: .02, step: .005 },
    ],
    presets: [
      { id: 'teal-amber', name: 'Teal & Amber', description: 'Controlled complementary separation without radioactive skin.', params: { exposure: 0, contrast: 1.14, sat: 1.05, shadowHue: -.48, highlightHue: .36, rolloff: .62, fade: .015 } },
      { id: 'prestige-drama', name: 'Prestige Drama', description: 'Dense blacks, restrained color and elegant warm highlights.', params: { exposure: -.08, contrast: 1.22, sat: .82, shadowHue: -.16, highlightHue: .18, rolloff: .72, fade: .01 } },
      { id: 'pastel-daylight', name: 'Pastel Daylight', description: 'Open shadows and soft color for lifestyle and editorial footage.', params: { exposure: .18, contrast: .88, sat: .9, shadowHue: .06, highlightHue: .2, rolloff: .82, fade: .055 } },
      { id: 'night-luxe', name: 'Night Luxe', description: 'Rich cool shadows with protected practical lights.', params: { exposure: -.2, contrast: 1.18, sat: 1.12, shadowHue: -.58, highlightHue: .12, rolloff: .9, fade: .018 } },
    ],
    glsl: `vec3 hueTint(float h){ return .5+.5*cos(6.28318*(vec3(0.0,.333,.667)+h)); } vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 c=b.rgb*exp2(P0); c=(c-.435)*P1+.435; float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,P2); float sh=1.0-smoothstep(.12,.58,l),hi=smoothstep(.42,.95,l); c+=((hueTint(P3*.5+.58)-.5)*sh+(hueTint(P4*.5+.08)-.5)*hi)*.12; c=mix(c,c/(1.0+c),smoothstep(.55,1.4,max(max(c.r,c.g),c.b))*P5); c=mix(c,vec3(P6)+c*(1.0-P6),step(l,.5)); return vec4(clamp(c,0.0,1.0),b.a); }`,
  },
  {
    id: 'filmstock', name: 'Film Stock', category: 'color', version: 1,
    summary: 'Organic stock response with density, halation color, grain and subtle gate variation.',
    params: [
      { key: 'density', label: 'Density', min: .5, max: 1.8, default: 1.08, step: .01 },
      { key: 'curve', label: 'Stock Curve', min: 0, max: 1, default: .55, step: .01 },
      { key: 'grain', label: 'Grain', min: 0, max: 1, default: .18, step: .01 },
      { key: 'size', label: 'Grain Size', min: .5, max: 4, default: 1.2, step: .1 },
      { key: 'color', label: 'Color Grain', min: 0, max: 1, default: .25, step: .01 },
      { key: 'flicker', label: 'Flicker', min: 0, max: .2, default: .015, step: .005 },
    ],
    presets: [
      { id: 'modern-35', name: 'Modern 35', description: 'Fine-grain contemporary negative with gentle shoulder.', params: { density: 1.08, curve: .58, grain: .16, size: .9, color: .18, flicker: .006 } },
      { id: 'vintage-16', name: 'Vintage 16', description: 'Visible organic texture and warmer, denser color.', params: { density: 1.16, curve: .72, grain: .38, size: 1.8, color: .36, flicker: .025 } },
      { id: 'reversal-pop', name: 'Reversal Pop', description: 'Punchy slide-film contrast and saturated color.', params: { density: 1.28, curve: .35, grain: .14, size: .8, color: .28, flicker: .008 } },
      { id: 'archive', name: 'Archive', description: 'Aged newsreel texture with stronger instability.', params: { density: .92, curve: .8, grain: .52, size: 2.5, color: .06, flicker: .07 } },
    ],
    glsl: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 c=b.rgb*P0; c=mix(c,smoothstep(vec3(0.0),vec3(1.0),c),P1); float mono=hash(floor(uv*uResolution/P3)+floor(uTime*24.0)); vec3 rgb=vec3(mono,hash(floor(uv*uResolution/P3)+vec2(17.0,3.0)+floor(uTime*24.0)),hash(floor(uv*uResolution/P3)+vec2(5.0,29.0)+floor(uTime*24.0))); vec3 noise=mix(vec3(mono),rgb,P4)-.5; float lum=dot(c,vec3(.2126,.7152,.0722)); c+=noise*P2*(.35+.65*(1.0-lum)); c*=1.0+sin(uTime*15.7)*P5; return vec4(clamp(c,0.0,1.0),b.a); }`,
  },
  {
    id: 'chromakey', name: 'Precision Chroma Key', category: 'utility', version: 1,
    summary: 'Professional green/blue-screen key with tolerance, softness, spill suppression and edge recovery.',
    params: [
      { key: 'hue', label: 'Key Hue', min: 0, max: 1, default: .333, step: .001 },
      { key: 'tolerance', label: 'Tolerance', min: .01, max: .5, default: .13, step: .005 },
      { key: 'softness', label: 'Softness', min: .001, max: .3, default: .06, step: .005 },
      { key: 'satMin', label: 'Minimum Saturation', min: 0, max: 1, default: .22, step: .01 },
      { key: 'spill', label: 'Spill Suppression', min: 0, max: 1, default: .72, step: .01 },
      { key: 'edge', label: 'Edge Color', min: 0, max: 1, default: .38, step: .01 },
    ],
    presets: [
      { id: 'studio-green', name: 'Studio Green', description: 'Balanced green-screen key for properly lit stages.', params: { hue: .333, tolerance: .13, softness: .055, satMin: .2, spill: .76, edge: .42 } },
      { id: 'studio-blue', name: 'Studio Blue', description: 'Clean blue-screen starting point.', params: { hue: .61, tolerance: .12, softness: .05, satMin: .2, spill: .65, edge: .35 } },
      { id: 'uneven-green', name: 'Uneven Green', description: 'Broader, softer key for imperfect portable screens.', params: { hue: .333, tolerance: .21, softness: .11, satMin: .13, spill: .88, edge: .56 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 h=rgb2hsv(b.rgb); float d=abs(h.x-P0); d=min(d,1.0-d); float hueKey=1.0-smoothstep(P1,P1+P2,d); float satKey=smoothstep(P3,P3+P2,h.y); float key=clamp(hueKey*satKey,0.0,1.0); float lum=dot(b.rgb,vec3(.2126,.7152,.0722)); vec3 neutral=mix(b.rgb,vec3(lum),key*P4); vec3 edge=mix(neutral,vec3(lum,lum*.96,lum),key*(1.0-key)*P5*4.0); return vec4(edge,b.a*(1.0-key)); }`,
  },
  {
    id: 'lumamatte', name: 'Luma Matte', category: 'utility', version: 1,
    summary: 'Smooth luminance key with invert, gamma shaping and clean transparent output.',
    params: [
      { key: 'low', label: 'Low', min: 0, max: 1, default: .18, step: .005 },
      { key: 'high', label: 'High', min: 0, max: 1, default: .72, step: .005 },
      { key: 'soft', label: 'Softness', min: 0, max: .5, default: .08, step: .005 },
      { key: 'gamma', label: 'Gamma', min: .2, max: 3, default: 1, step: .02 },
      { key: 'invert', label: 'Invert', min: 0, max: 1, default: 0, step: 1 },
    ],
    presets: [
      { id: 'keep-highlights', name: 'Keep Highlights', description: 'Extract bright practicals, skies and luminous graphics.', params: { low: .34, high: .82, soft: .12, gamma: 1, invert: 0 } },
      { id: 'keep-shadows', name: 'Keep Shadows', description: 'Extract dark silhouettes and shadow detail.', params: { low: .12, high: .55, soft: .1, gamma: 1, invert: 1 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 b=inp(uv); float l=dot(b.rgb,vec3(.2126,.7152,.0722)); float a=smoothstep(P0-P2,P1+P2,l); a=pow(clamp(a,0.0,1.0),P3); a=mix(a,1.0-a,step(.5,P4)); return vec4(b.rgb,b.a*a); }`,
  },
  {
    id: 'developtone', name: 'Develop · Tone', category: 'color', version: 1,
    summary: 'Linear-light photographic exposure and selective tonal recovery shared by Photo Develop and Fabula.',
    params: [
      { key: 'exposure', label: 'Exposure', min: -100, max: 100, default: 0, step: .1 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100, default: 0, step: .1 },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100, default: 0, step: .1 },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100, default: 0, step: .1 },
      { key: 'whites', label: 'Whites', min: -100, max: 100, default: 0, step: .1 },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100, default: 0, step: .1 },
      { key: 'warmth', label: 'Temperature', min: -100, max: 100, default: 0, step: .1 },
      { key: 'tint', label: 'Tint', min: -100, max: 100, default: 0, step: .1 },
    ],
    glsl: `
vec3 lin(vec3 c){ return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c)); }
vec3 srgb(vec3 c){ return mix(c*12.92,1.055*pow(max(c,0.0),vec3(1.0/2.4))-.055,step(vec3(.0031308),c)); }
vec4 fx(vec2 uv){
  vec4 s=inp(uv); vec3 c=lin(max(s.rgb,0.0));
  c*=exp2(P0/50.0); float y=dot(c,vec3(.2126,.7152,.0722));
  float sh=1.0-smoothstep(.04,.48,y), hi=smoothstep(.32,1.0,y);
  c*=1.0+(P3/100.0)*sh*.72; c*=1.0+(P2/100.0)*hi*.62;
  c+=vec3(P5/100.0)*(.055*(1.0-smoothstep(.0,.28,y)));
  c+=vec3(P4/100.0)*(.12*smoothstep(.55,1.15,y));
  float k=exp2(P1/100.0); c=(c-vec3(.18))*k+vec3(.18);
  float t=P6/100.0, m=P7/100.0; c*=vec3(1.0+.10*t+.035*m,1.0-.06*m,1.0-.10*t+.035*m);
  return vec4(clamp(srgb(max(c,0.0)),0.0,1.0),s.a);
}`,
  },
  {
    id: 'developfinish', name: 'Develop · Presence', category: 'color', version: 1,
    summary: 'High precision photographic presence, dehaze, vignette and deterministic grain.',
    params: [
      { key: 'saturation', label: 'Saturation', min: -100, max: 100, default: 0, step: .1 },
      { key: 'brilliance', label: 'Brilliance', min: -100, max: 100, default: 0, step: .1 },
      { key: 'clarity', label: 'Clarity', min: -100, max: 100, default: 0, step: .1 },
      { key: 'structure', label: 'Structure', min: -100, max: 100, default: 0, step: .1 },
      { key: 'dehaze', label: 'Dehaze', min: -100, max: 100, default: 0, step: .1 },
      { key: 'fade', label: 'Fade', min: -100, max: 100, default: 0, step: .1 },
      { key: 'vignette', label: 'Vignette', min: -100, max: 100, default: 0, step: .1 },
      { key: 'grain', label: 'Grain', min: 0, max: 100, default: 0, step: .1 },
    ],
    glsl: `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
vec4 fx(vec2 uv){
  vec4 s=inp(uv); vec3 c=s.rgb; vec2 px=1.0/uResolution;
  vec3 blur=(inp(uv+vec2(px.x,0)).rgb+inp(uv-vec2(px.x,0)).rgb+inp(uv+vec2(0,px.y)).rgb+inp(uv-vec2(0,px.y)).rgb)*.25;
  float l=dot(c,vec3(.2126,.7152,.0722)); float bl=dot(blur,vec3(.2126,.7152,.0722));
  c+=(c-blur)*(P3/100.0)*1.1; c+=vec3(l-bl)*(P2/100.0)*.75;
  float sat=1.0+P0/100.0; c=mix(vec3(l),c,max(0.0,sat));
  c+=vec3(P1/100.0)*(.10*(1.0-abs(l-.5)*1.45));
  c=(c-vec3(max(0.0,-P4/100.0)*.08))*(1.0+P4/100.0*.18);
  c=mix(c,vec3(.075)+c*.88,max(0.0,P5/100.0));
  float d=length((uv-.5)*vec2(uResolution.x/uResolution.y,1.0));
  float vig=smoothstep(.25,.78,d); c*=1.0-vig*(P6/100.0)*.72;
  float n=hash(floor(uv*uResolution)+floor(uTime*24.0))-.5; c+=n*(P7/100.0)*.075*(.35+.65*(1.0-l));
  return vec4(clamp(c,0.0,1.0),s.a);
}`,
  },
  {
    id: 'cineglow', name: 'Cine Glow', category: 'light', version: 1,
    summary: 'Soft, source-preserving highlight bloom with a filmic knee and color-safe rolloff.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 2, default: 0.65, step: 0.01 },
      { key: 'radius', label: 'Radius', min: 1, max: 80, default: 24, step: 0.5, unit: 'px', curve: 'power' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 2, default: 0.72, step: 0.01 },
      { key: 'knee', label: 'Soft Knee', min: 0.01, max: 1, default: 0.35, step: 0.01 },
      { key: 'warmth', label: 'Warmth', min: -1, max: 1, default: 0.08, step: 0.01 },
      { key: 'protect', label: 'Highlight Protect', min: 0, max: 1, default: 0.35, step: 0.01 },
    ],
    presets: [
      { id: 'silk', name: 'Silk Highlights', description: 'Polished beauty bloom that keeps skin and whites controlled.', params: { amount: .48, radius: 30, threshold: .78, knee: .42, warmth: .12, protect: .55 } },
      { id: 'golden-hour', name: 'Golden Hour', description: 'Warm, broad halation-like light for backlit footage.', params: { amount: .82, radius: 42, threshold: .62, knee: .5, warmth: .48, protect: .32 } },
      { id: 'neon-dream', name: 'Neon Dream', description: 'Dense, cooler bloom for saturated night lighting.', params: { amount: 1.2, radius: 22, threshold: .42, knee: .3, warmth: -.22, protect: .18 } },
      { id: 'clean-commercial', name: 'Clean Commercial', description: 'Subtle premium polish with nearly invisible diffusion.', params: { amount: .3, radius: 16, threshold: .9, knee: .28, warmth: .04, protect: .7 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'prefilter', glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); float l=max(max(c.r,c.g),c.b); float soft=clamp((l-P2+P3)/(2.0*P3),0.0,1.0); soft=soft*soft*(3.0-2.0*soft); float contribution=max(l-P2,0.0)+soft*P3; return vec4(c.rgb*(contribution/max(l,1e-5)),c.a); }` },
      { id: 'blur-x', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(P1/uResolution.x,0.0); vec4 c=inp(uv)*0.227027; c+=inp(uv+d*0.384615)*0.316216; c+=inp(uv-d*0.384615)*0.316216; c+=inp(uv+d*1.384615)*0.070270; c+=inp(uv-d*1.384615)*0.070270; return c; }` },
      { id: 'blur-y', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(0.0,P1/uResolution.y); vec4 c=inp(uv)*0.227027; c+=inp(uv+d*0.384615)*0.316216; c+=inp(uv-d*0.384615)*0.316216; c+=inp(uv+d*1.384615)*0.070270; c+=inp(uv-d*1.384615)*0.070270; return c; }` },
      { id: 'composite', glsl: `vec4 fx(vec2 uv){ vec4 base=src(uv); vec3 bloom=inp(uv).rgb; vec3 tint=mix(vec3(0.92,0.97,1.08),vec3(1.10,0.96,0.82),P4*0.5+0.5); bloom*=tint; float peak=max(max(base.r,base.g),base.b); float guard=mix(1.0,1.0-smoothstep(0.8,1.5,peak),P5); vec3 added=bloom*P0*guard; vec3 outRgb=1.0-(1.0-clamp(base.rgb,0.0,1.0))*exp(-added); return vec4(outRgb,base.a); }` },
    ],
  },
  {
    id: 'filmhalation', name: 'Film Halation', category: 'light', version: 1,
    summary: 'Red-orange emulsion glow around bright edges without tinting the whole frame.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 2, default: .55, step: .01 },
      { key: 'radius', label: 'Radius', min: 1, max: 50, default: 12, step: .5, unit: 'px', curve: 'power' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 2, default: .82, step: .01 },
      { key: 'red', label: 'Red Bias', min: 0, max: 1, default: .72, step: .01 },
    ],
    presets: [
      { id: '35mm', name: '35mm Edge', description: 'Balanced red edge bloom for modern film emulation.', params: { amount: .5, radius: 11, threshold: .82, red: .72 } },
      { id: 'super8', name: 'Super 8 Glow', description: 'Bolder, softer halation for nostalgic footage.', params: { amount: .95, radius: 20, threshold: .64, red: .82 } },
      { id: 'subtle-stock', name: 'Subtle Stock', description: 'A restrained finishing pass for graded footage.', params: { amount: .28, radius: 8, threshold: .94, red: .62 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'edges', glsl: `vec4 fx(vec2 uv){ vec2 p=1.0/uResolution; vec3 c=inp(uv).rgb; float l=max(max(c.r,c.g),c.b); float n=max(max(inp(uv+vec2(p.x,0)).r,inp(uv-vec2(p.x,0)).r),max(inp(uv+vec2(0,p.y)).r,inp(uv-vec2(0,p.y)).r)); float m=smoothstep(P2,P2+.3,max(l,n)); return vec4(c*m,m); }` },
      { id: 'spread', glsl: `vec4 fx(vec2 uv){ vec2 x=vec2(P1/uResolution.x,0.0),y=vec2(0.0,P1/uResolution.y); vec4 c=inp(uv)*.28; c+=(inp(uv+x)+inp(uv-x)+inp(uv+y)+inp(uv-y))*.13; c+=(inp(uv+x+y)+inp(uv-x+y)+inp(uv+x-y)+inp(uv-x-y))*.05; return c; }` },
      { id: 'composite', glsl: `vec4 fx(vec2 uv){ vec4 b=src(uv); vec3 h=inp(uv).rgb*mix(vec3(1.0,.34,.08),vec3(1.0,.16,.02),P3); vec3 o=1.0-(1.0-clamp(b.rgb,0.0,1.0))*exp(-h*P0); return vec4(o,b.a); }` },
    ],
  },
  {
    id: 'softdiffusion', name: 'Soft Diffusion', category: 'light', version: 1,
    summary: 'Lens-like highlight diffusion with preserved blacks and adjustable detail recovery.',
    params: [
      { key: 'amount', label: 'Diffusion', min: 0, max: 1.5, default: .42, step: .01 },
      { key: 'radius', label: 'Radius', min: 1, max: 40, default: 14, step: .5, unit: 'px', curve: 'power' },
      { key: 'threshold', label: 'Highlight Bias', min: 0, max: 1, default: .28, step: .01 },
      { key: 'detail', label: 'Detail Recovery', min: 0, max: 1, default: .62, step: .01 },
      { key: 'black', label: 'Black Protect', min: 0, max: 1, default: .78, step: .01 },
    ],
    presets: [
      { id: 'beauty-silk', name: 'Beauty Silk', description: 'Gentle complexion polish with crisp eyes and protected blacks.', params: { amount: .45, radius: 16, threshold: .24, detail: .72, black: .84 } },
      { id: 'vintage-glass', name: 'Vintage Glass', description: 'Broader low-contrast bloom inspired by older coated lenses.', params: { amount: .76, radius: 28, threshold: .16, detail: .38, black: .62 } },
      { id: 'bridal-air', name: 'Bridal Air', description: 'Bright, airy diffusion for soft daylight and white fabrics.', params: { amount: .62, radius: 22, threshold: .34, detail: .58, black: .9 } },
      { id: 'clean-skin', name: 'Clean Skin', description: 'Subtle finishing diffusion that avoids an obvious filtered look.', params: { amount: .25, radius: 10, threshold: .3, detail: .82, black: .88 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'blur-x', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(P1/uResolution.x,0.0); vec4 c=inp(uv)*.227027; c+=(inp(uv+d*.75)+inp(uv-d*.75))*.194594; c+=(inp(uv+d*1.75)+inp(uv-d*1.75))*.121622; c+=(inp(uv+d*3.0)+inp(uv-d*3.0))*.068919; return c; }` },
      { id: 'blur-y', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(0.0,P1/uResolution.y); vec4 c=inp(uv)*.227027; c+=(inp(uv+d*.75)+inp(uv-d*.75))*.194594; c+=(inp(uv+d*1.75)+inp(uv-d*1.75))*.121622; c+=(inp(uv+d*3.0)+inp(uv-d*3.0))*.068919; return c; }` },
      { id: 'composite', glsl: `vec4 fx(vec2 uv){ vec4 b=src(uv); vec3 soft=inp(uv).rgb; float l=dot(b.rgb,vec3(.2126,.7152,.0722)); float hi=smoothstep(P2,1.0,l); float blacks=mix(1.0,smoothstep(.015,.22,l),P4); vec3 low=mix(b.rgb,soft,P0*hi*blacks); vec3 detail=b.rgb-soft; low+=detail*P3; return vec4(clamp(low,0.0,1.0),b.a); }` },
    ],
  },
  {
    id: 'starglint', name: 'Star Glint', category: 'light', version: 1,
    summary: 'Elegant anamorphic or star-shaped glints extracted only from chosen highlights.',
    params: [
      { key: 'amount', label: 'Brightness', min: 0, max: 3, default: .8, step: .01 },
      { key: 'length', label: 'Length', min: 1, max: 120, default: 36, step: 1, unit: 'px', curve: 'power' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 2, default: .82, step: .01 },
      { key: 'angle', label: 'Angle', min: -180, max: 180, default: 0, step: 1, unit: '°' },
      { key: 'cross', label: 'Cross', min: 0, max: 1, default: .2, step: .01 },
      { key: 'rainbow', label: 'Prism', min: 0, max: 1, default: .12, step: .01 },
    ],
    presets: [
      { id: 'anamorphic-clean', name: 'Anamorphic Clean', description: 'Long, restrained horizontal streaks for practical lights.', params: { amount: .7, length: 54, threshold: .9, angle: 0, cross: .05, rainbow: .08 } },
      { id: 'diamond-star', name: 'Diamond Star', description: 'Four-point diagonal sparkle with a polished commercial finish.', params: { amount: 1.0, length: 34, threshold: .78, angle: 45, cross: .8, rainbow: .05 } },
      { id: 'prism-pop', name: 'Prism Pop', description: 'Color-split music-video glints for vivid sources.', params: { amount: 1.35, length: 44, threshold: .62, angle: -8, cross: .25, rainbow: .62 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'extract', glsl: `vec4 fx(vec2 uv){ vec3 c=inp(uv).rgb; float l=max(max(c.r,c.g),c.b); float m=smoothstep(P2,P2+.2,l); return vec4(c*m,m); }` },
      { id: 'streak', glsl: `vec4 fx(vec2 uv){ float a=radians(P3); vec2 d=vec2(cos(a)/uResolution.x,sin(a)/uResolution.y)*P1; vec3 c=inp(uv).rgb*.24; c+=(inp(uv+d*.2).rgb+inp(uv-d*.2).rgb)*.18; c+=(inp(uv+d*.48).rgb+inp(uv-d*.48).rgb)*.11; c+=(inp(uv+d*.85).rgb+inp(uv-d*.85).rgb)*.045; float b=a+1.570796; vec2 q=vec2(cos(b)/uResolution.x,sin(b)/uResolution.y)*P1; vec3 cross=(inp(uv+q*.28).rgb+inp(uv-q*.28).rgb)*.22+(inp(uv+q*.68).rgb+inp(uv-q*.68).rgb)*.08; c+=cross*P4; float shift=P5*2.5/uResolution.x; c=vec3(inp(uv+vec2(shift,0)).r,c.g,inp(uv-vec2(shift,0)).b)+c*.65; return vec4(c,1.0); }` },
      { id: 'composite', glsl: `vec4 fx(vec2 uv){ vec4 b=src(uv); vec3 g=inp(uv).rgb*P0; vec3 o=1.0-(1.0-clamp(b.rgb,0.0,1.0))*exp(-g); return vec4(o,b.a); }` },
    ],
  },
  {
    id: 'volumetricrays', name: 'Volumetric Rays', category: 'light', version: 1,
    summary: 'High-quality radial light scattering for windows, skies, titles and practical sources.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 2.5, default: .75, step: .01 },
      { key: 'length', label: 'Length', min: 0, max: 1, default: .62, step: .01 },
      { key: 'threshold', label: 'Threshold', min: 0, max: 2, default: .72, step: .01 },
      { key: 'centerX', label: 'Source X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'centerY', label: 'Source Y', min: 0, max: 1, default: .38, step: .005 },
      { key: 'warmth', label: 'Warmth', min: -1, max: 1, default: .12, step: .01 },
    ],
    presets: [
      { id: 'window-morning', name: 'Window Morning', description: 'Warm, natural shafts from an upper-frame window.', params: { amount: .68, length: .58, threshold: .76, centerX: .34, centerY: .18, warmth: .35 } },
      { id: 'heavenly', name: 'Heavenly', description: 'Broad luminous rays for clouds, architecture and spiritual imagery.', params: { amount: 1.15, length: .82, threshold: .58, centerX: .5, centerY: .12, warmth: .18 } },
      { id: 'cold-stage', name: 'Cold Stage', description: 'Cool focused beams for concert and performance footage.', params: { amount: .95, length: .7, threshold: .66, centerX: .5, centerY: .05, warmth: -.5 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'scatter', glsl: `vec4 fx(vec2 uv){ vec2 light=vec2(P3,P4); vec2 delta=(uv-light)*P1/12.0; vec2 p=uv; vec3 sum=vec3(0.0); float decay=1.0; for(int i=0;i<12;i++){ p-=delta; vec3 c=inp(p).rgb; float l=max(max(c.r,c.g),c.b); sum+=c*smoothstep(P2,P2+.25,l)*decay; decay*=.91; } return vec4(sum/7.5,1.0); }` },
      { id: 'composite', glsl: `vec4 fx(vec2 uv){ vec4 b=src(uv); vec3 tint=mix(vec3(.82,.92,1.12),vec3(1.12,.98,.78),P5*.5+.5); vec3 rays=inp(uv).rgb*tint*P0; vec3 o=1.0-(1.0-clamp(b.rgb,0.0,1.0))*exp(-rays); return vec4(o,b.a); }` },
    ],
  },
  {
    id: 'velvetblur', name: 'Velvet Blur', category: 'blur', version: 1,
    summary: 'Clean separable blur with soft highlight bloom, edge control and a polished lens-like response.',
    params: [
      { key: 'radius', label: 'Radius', min: 0, max: 100, default: 18, step: .5, unit: 'px', curve: 'power' },
      { key: 'bloom', label: 'Highlight Bloom', min: 0, max: 1, default: .12, step: .01 },
      { key: 'edge', label: 'Edge Preserve', min: 0, max: 1, default: .2, step: .01 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'cream', name: 'Cream', description: 'Smooth premium defocus with gentle highlight bloom.', params: { radius: 24, bloom: .2, edge: .12, mix: 1 } },
      { id: 'portrait-backdrop', name: 'Portrait Backdrop', description: 'Strong blur that retains important tonal edges.', params: { radius: 42, bloom: .08, edge: .55, mix: 1 } },
      { id: 'soft-focus', name: 'Soft Focus', description: 'A restrained mix that softens without losing the shot.', params: { radius: 12, bloom: .16, edge: .3, mix: .48 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'blur-x', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(P0/uResolution.x,0.0); vec4 c=inp(uv)*.196482; c+=(inp(uv+d*.55)+inp(uv-d*.55))*.174697; c+=(inp(uv+d*1.35)+inp(uv-d*1.35))*.121621; c+=(inp(uv+d*2.35)+inp(uv-d*2.35))*.075114; c+=(inp(uv+d*3.5)+inp(uv-d*3.5))*.030326; return c; }` },
      { id: 'blur-y', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(0.0,P0/uResolution.y); vec4 c=inp(uv)*.196482; c+=(inp(uv+d*.55)+inp(uv-d*.55))*.174697; c+=(inp(uv+d*1.35)+inp(uv-d*1.35))*.121621; c+=(inp(uv+d*2.35)+inp(uv-d*2.35))*.075114; c+=(inp(uv+d*3.5)+inp(uv-d*3.5))*.030326; return c; }` },
      { id: 'finish', glsl: `vec4 fx(vec2 uv){ vec4 b=src(uv); vec3 soft=inp(uv).rgb; float dl=abs(dot(b.rgb-soft,vec3(.2126,.7152,.0722))); float keep=smoothstep(.02,.22,dl)*P2; vec3 shaped=mix(soft,b.rgb,keep); float hi=smoothstep(.62,1.0,max(max(soft.r,soft.g),soft.b)); shaped+=soft*hi*P1*.28; return vec4(mix(b.rgb,shaped,P3),b.a); }` },
    ],
  },
  {
    id: 'directionalblur', name: 'Directional Blur', category: 'blur', version: 1,
    summary: 'Smooth camera-direction blur for movement, transitions and graphic streaking.',
    params: [
      { key: 'distance', label: 'Distance', min: 0, max: 160, default: 26, step: 1, unit: 'px', curve: 'power' },
      { key: 'angle', label: 'Angle', min: -180, max: 180, default: 0, step: 1, unit: '°' },
      { key: 'center', label: 'Center Weight', min: 0, max: 1, default: .42, step: .01 },
    ],
    presets: [
      { id: 'whip-pan', name: 'Whip Pan', description: 'Fast horizontal camera smear for energetic transitions.', params: { distance: 92, angle: 0, center: .18 } },
      { id: 'vertical-rush', name: 'Vertical Rush', description: 'Vertical motion streak for reveals and drops.', params: { distance: 70, angle: 90, center: .24 } },
      { id: 'gentle-drift', name: 'Gentle Drift', description: 'Soft directional motion that keeps a readable center image.', params: { distance: 22, angle: -12, center: .68 } },
    ],
    glsl: `vec4 fx(vec2 uv){ float a=radians(P1); vec2 d=vec2(cos(a)/uResolution.x,sin(a)/uResolution.y)*P0; vec4 c=inp(uv)*mix(.08,.52,P2); float w=(1.0-mix(.08,.52,P2))/10.0; for(int i=1;i<=5;i++){ float t=float(i)/5.0; c+=(inp(uv+d*t)+inp(uv-d*t))*w; } return c; }`,
  },
  {
    id: 'radialfocus', name: 'Radial Focus', category: 'blur', version: 1,
    summary: 'Center-weighted zoom blur for dream transitions, speed ramps and attention pulls.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .3, step: .01 },
      { key: 'centerX', label: 'Center X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'centerY', label: 'Center Y', min: 0, max: 1, default: .5, step: .005 },
      { key: 'protect', label: 'Center Protect', min: 0, max: 1, default: .35, step: .01 },
    ],
    presets: [
      { id: 'dream-pull', name: 'Dream Pull', description: 'Soft outward drift with a readable center.', params: { amount: .24, centerX: .5, centerY: .46, protect: .62 } },
      { id: 'speed-tunnel', name: 'Speed Tunnel', description: 'Aggressive zoom smear for action and music edits.', params: { amount: .72, centerX: .5, centerY: .5, protect: .12 } },
      { id: 'subject-lock', name: 'Subject Lock', description: 'Keeps a centered subject legible while the frame rushes.', params: { amount: .48, centerX: .5, centerY: .42, protect: .8 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec2 center=vec2(P1,P2); vec2 ray=uv-center; vec4 sum=vec4(0.0); float total=0.0; for(int i=0;i<12;i++){ float t=float(i)/11.0; float w=1.0-t*.55; sum+=inp(uv-ray*t*P0)*w; total+=w; } vec4 z=sum/total; float dist=length(ray)*1.414; float m=mix(1.0,smoothstep(P3,1.0,dist),P3); return mix(inp(uv),z,m); }`,
  },
  {
    id: 'prismgrade', name: 'Prism Grade', category: 'stylize', version: 1,
    summary: 'High-design duotone and tritone mapping that preserves useful luminance detail.',
    params: [
      { key: 'hueA', label: 'Shadow Hue', min: 0, max: 1, default: .66, step: .005 },
      { key: 'hueB', label: 'Highlight Hue', min: 0, max: 1, default: .08, step: .005 },
      { key: 'sat', label: 'Color', min: 0, max: 1.5, default: .82, step: .01 },
      { key: 'split', label: 'Split', min: .1, max: .9, default: .52, step: .01 },
      { key: 'detail', label: 'Original Detail', min: 0, max: 1, default: .24, step: .01 },
    ],
    presets: [
      { id: 'royal-citrus', name: 'Royal Citrus', description: 'Deep violet shadows with glowing orange highlights.', params: { hueA: .76, hueB: .075, sat: 1.0, split: .5, detail: .18 } },
      { id: 'mint-rose', name: 'Mint & Rose', description: 'Fashion-forward green shadows and pink highlights.', params: { hueA: .43, hueB: .94, sat: .72, split: .48, detail: .28 } },
      { id: 'noir-gold', name: 'Noir Gold', description: 'Near-black neutral shadows graduating into warm metallic light.', params: { hueA: .62, hueB: .11, sat: .58, split: .68, detail: .1 } },
    ],
    glsl: `vec3 hc(float h,float s,float v){ return hsv2rgb(vec3(h,s,v)); } vec4 fx(vec2 uv){ vec4 b=inp(uv); float l=dot(b.rgb,vec3(.2126,.7152,.0722)); vec3 a=hc(P0,P2,l/P3*.5); vec3 z=hc(P1,P2,.35+(l-P3)/max(1.0-P3,.01)*.65); vec3 duo=mix(a,z,smoothstep(P3-.12,P3+.12,l)); return vec4(mix(duo,b.rgb,P4),b.a); }`,
  },
  {
    id: 'editorialprint', name: 'Editorial Print', category: 'stylize', version: 1,
    summary: 'Refined halftone, ink and paper treatment for posters, comics and editorial motion design.',
    params: [
      { key: 'scale', label: 'Dot Size', min: 2, max: 24, default: 7, step: .5, unit: 'px' },
      { key: 'ink', label: 'Ink', min: 0, max: 1, default: .72, step: .01 },
      { key: 'color', label: 'Color Retention', min: 0, max: 1, default: .55, step: .01 },
      { key: 'angle', label: 'Screen Angle', min: -90, max: 90, default: 15, step: 1, unit: '°' },
      { key: 'paper', label: 'Paper Texture', min: 0, max: 1, default: .12, step: .01 },
    ],
    presets: [
      { id: 'fashion-zine', name: 'Fashion Zine', description: 'Fine dots, retained color and tactile print texture.', params: { scale: 5, ink: .68, color: .72, angle: 15, paper: .18 } },
      { id: 'comic-ink', name: 'Comic Ink', description: 'Bold graphic dots and strong black line character.', params: { scale: 9, ink: .92, color: .42, angle: 32, paper: .08 } },
      { id: 'newsprint', name: 'Newsprint', description: 'Coarse restrained monochrome newspaper texture.', params: { scale: 7, ink: .82, color: .08, angle: 45, paper: .3 } },
    ],
    glsl: `float hs(vec2 p){ return fract(sin(dot(p,vec2(91.7,271.9)))*43758.5); } vec4 fx(vec2 uv){ vec4 b=inp(uv); float a=radians(P3),cs=cos(a),sn=sin(a); vec2 p=mat2(cs,-sn,sn,cs)*(uv*uResolution)/P0; vec2 q=fract(p)-.5; float l=dot(b.rgb,vec3(.2126,.7152,.0722)); float dotv=smoothstep(.52,.42,length(q)+(.5-l)*P1); vec3 ink=mix(vec3(l),b.rgb,P2)*dotv; float grain=(hs(floor(uv*uResolution*.5))-.5)*P4*.16; return vec4(clamp(ink+grain,0.0,1.0),b.a); }`,
  },
  {
    id: 'lenswarp', name: 'Lens Warp', category: 'distort', version: 1,
    summary: 'Correct or create barrel/pincushion distortion with chromatic fringe and protected borders.',
    params: [
      { key: 'distortion', label: 'Distortion', min: -.8, max: .8, default: 0, step: .005 },
      { key: 'fringe', label: 'Chromatic Fringe', min: 0, max: 8, default: 0, step: .1, unit: 'px' },
      { key: 'zoom', label: 'Edge Zoom', min: .7, max: 1.4, default: 1, step: .005 },
      { key: 'vignette', label: 'Lens Vignette', min: 0, max: 1, default: 0, step: .01 },
    ],
    presets: [
      { id: 'action-cam-fix', name: 'Action Cam Fix', description: 'Moderate barrel correction with safe edge zoom.', params: { distortion: -.28, fringe: .4, zoom: 1.1, vignette: 0 } },
      { id: 'dream-lens', name: 'Dream Lens', description: 'Soft barrel character and colored lens edges.', params: { distortion: .22, fringe: 2.4, zoom: 1.04, vignette: .28 } },
      { id: 'peephole', name: 'Peephole', description: 'Strong stylized curvature with intentional edge falloff.', params: { distortion: .62, fringe: 4.2, zoom: .84, vignette: .72 } },
    ],
    glsl: `vec2 warp(vec2 uv,float k){ vec2 p=(uv-.5)/P2; float r2=dot(p,p); return .5+p*(1.0+k*r2); } vec4 fx(vec2 uv){ vec2 p=warp(uv,P0); vec2 dir=normalize(p-.5+1e-5)*P1/uResolution; vec4 c=vec4(inp(p+dir).r,inp(p).g,inp(p-dir).b,inp(p).a); float v=smoothstep(.78,.18,length((uv-.5)*vec2(uResolution.x/uResolution.y,1.0))); c.rgb*=mix(1.0,v,P3); return c; }`,
  },
  {
    id: 'fluidwarp', name: 'Fluid Warp', category: 'distort', version: 1,
    summary: 'Smooth animated displacement for heat, water, dream states and organic transitions.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 80, default: 12, step: .5, unit: 'px' },
      { key: 'scale', label: 'Scale', min: .5, max: 12, default: 3.2, step: .1 },
      { key: 'speed', label: 'Speed', min: -3, max: 3, default: .6, step: .05 },
      { key: 'direction', label: 'Direction', min: -180, max: 180, default: 90, step: 1, unit: '°' },
      { key: 'detail', label: 'Detail', min: 0, max: 1, default: .42, step: .01 },
    ],
    presets: [
      { id: 'heat-haze', name: 'Heat Haze', description: 'Fine upward shimmer for roads, fire and hot practicals.', params: { amount: 8, scale: 7.5, speed: 1.2, direction: 90, detail: .68 } },
      { id: 'underwater', name: 'Underwater', description: 'Broad slow refraction with layered organic movement.', params: { amount: 18, scale: 2.4, speed: .36, direction: 18, detail: .48 } },
      { id: 'liquid-dream', name: 'Liquid Dream', description: 'Strong flowing displacement for surreal transitions.', params: { amount: 42, scale: 1.4, speed: .72, direction: -24, detail: .8 } },
    ],
    glsl: `vec4 fx(vec2 uv){ float a=radians(P3); vec2 flow=vec2(cos(a),sin(a))*uTime*P2*.12; vec2 p=uv*P1+flow; float n=sin(p.x*5.1+sin(p.y*3.7))+cos(p.y*4.3+sin(p.x*2.9)); n+=sin((p.x+p.y)*9.0+uTime*P2)*P4*.45; vec2 d=vec2(cos(n*2.1),sin(n*1.7))*P0/uResolution; return inp(uv+d); }`,
  },
  {
    id: 'edgeglow', name: 'Edge Glow', category: 'light', version: 1,
    summary: 'Detail-aware luminous edges with controllable threshold, spread and color.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 3, default: .8, step: .01 },
      { key: 'radius', label: 'Spread', min: 1, max: 40, default: 10, step: .5, unit: 'px' },
      { key: 'threshold', label: 'Edge Threshold', min: 0, max: 1, default: .14, step: .01 },
      { key: 'hue', label: 'Hue', min: 0, max: 1, default: .08, step: .005 },
      { key: 'color', label: 'Color Amount', min: 0, max: 1, default: .35, step: .01 },
    ],
    presets: [
      { id: 'gold-rim', name: 'Gold Rim', description: 'Warm elegant edge light for portraits and products.', params: { amount: .72, radius: 9, threshold: .13, hue: .1, color: .58 } },
      { id: 'electric-blue', name: 'Electric Blue', description: 'Bright cool outlines for technology and performance imagery.', params: { amount: 1.4, radius: 14, threshold: .08, hue: .58, color: .9 } },
      { id: 'soft-detail', name: 'Soft Detail', description: 'Subtle neutral definition with a luminous finish.', params: { amount: .38, radius: 6, threshold: .2, hue: .08, color: .08 } },
    ],
    glsl: `vec4 fx(vec2 uv){ return inp(uv); }`,
    passes: [
      { id: 'detect', glsl: `vec4 fx(vec2 uv){ vec2 p=1.0/uResolution; vec3 c=inp(uv).rgb; float l=dot(c,vec3(.2126,.7152,.0722)); float gx=dot(inp(uv+vec2(p.x,0)).rgb-inp(uv-vec2(p.x,0)).rgb,vec3(.2126,.7152,.0722)); float gy=dot(inp(uv+vec2(0,p.y)).rgb-inp(uv-vec2(0,p.y)).rgb,vec3(.2126,.7152,.0722)); float e=smoothstep(P2,P2+.18,length(vec2(gx,gy))); return vec4(c*e,e); }` },
      { id: 'spread', glsl: `vec4 fx(vec2 uv){ vec2 x=vec2(P1/uResolution.x,0),y=vec2(0,P1/uResolution.y); return inp(uv)*.28+(inp(uv+x)+inp(uv-x)+inp(uv+y)+inp(uv-y))*.13+(inp(uv+x+y)+inp(uv-x+y)+inp(uv+x-y)+inp(uv-x-y))*.05; }` },
      { id: 'finish', glsl: `vec4 fx(vec2 uv){ vec4 b=src(uv); vec3 tint=hsv2rgb(vec3(P3,.82,1.0)); vec3 g=mix(inp(uv).rgb,inp(uv).aaa*tint,P4)*P0; vec3 o=1.0-(1.0-b.rgb)*exp(-g); return vec4(clamp(o,0.0,1.0),b.a); }` },
    ],
  },
  {
    id: 'chromaticfringe', name: 'Chromatic Fringe', category: 'distort', version: 1,
    summary: 'Radial or directional lens color separation with center protection and edge falloff.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 24, default: 3, step: .1, unit: 'px' },
      { key: 'radial', label: 'Radial', min: 0, max: 1, default: 1, step: 1 },
      { key: 'angle', label: 'Direction', min: -180, max: 180, default: 0, step: 1, unit: '°' },
      { key: 'protect', label: 'Center Protect', min: 0, max: 1, default: .32, step: .01 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'subtle-lens', name: 'Subtle Lens', description: 'Natural edge fringing that reads as optical character.', params: { amount: 1.2, radial: 1, angle: 0, protect: .55, mix: .72 } },
      { id: 'music-split', name: 'Music Split', description: 'Bold directional RGB separation.', params: { amount: 12, radial: 0, angle: 0, protect: 0, mix: 1 } },
      { id: 'prism-edge', name: 'Prism Edge', description: 'Strong radial prism color around the frame.', params: { amount: 8, radial: 1, angle: 0, protect: .2, mix: .9 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec2 radial=normalize(uv-.5+1e-5); float a=radians(P2); vec2 linear=vec2(cos(a),sin(a)); vec2 dir=mix(linear,radial,step(.5,P1)); float edge=mix(1.0,smoothstep(P3,1.0,length((uv-.5)*1.414)),step(.5,P1)); vec2 d=dir*P0*edge/uResolution; vec4 b=inp(uv); vec3 c=vec3(inp(uv+d).r,b.g,inp(uv-d).b); return vec4(mix(b.rgb,c,P4),b.a); }`,
  },
  {
    id: 'graphiccartoon', name: 'Graphic Cartoon', category: 'stylize', version: 1,
    summary: 'Clean posterized color with controllable ink lines and detail smoothing.',
    params: [
      { key: 'levels', label: 'Color Levels', min: 2, max: 16, default: 6, step: 1 },
      { key: 'ink', label: 'Ink', min: 0, max: 1, default: .62, step: .01 },
      { key: 'edge', label: 'Edge Threshold', min: .01, max: .5, default: .12, step: .01 },
      { key: 'sat', label: 'Color', min: 0, max: 2, default: 1.15, step: .01 },
      { key: 'smooth', label: 'Smoothing', min: 0, max: 1, default: .28, step: .01 },
    ],
    presets: [
      { id: 'animation-clean', name: 'Animation Clean', description: 'Balanced color blocks and readable line work.', params: { levels: 7, ink: .58, edge: .12, sat: 1.18, smooth: .32 } },
      { id: 'bold-comic', name: 'Bold Comic', description: 'Heavy ink and punchy limited color.', params: { levels: 4, ink: .9, edge: .08, sat: 1.42, smooth: .18 } },
      { id: 'soft-paint', name: 'Soft Paint', description: 'Gentler posterization with minimal outlines.', params: { levels: 10, ink: .24, edge: .2, sat: .92, smooth: .62 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec2 p=1.0/uResolution; vec4 b=inp(uv); vec3 avg=(b.rgb+inp(uv+vec2(p.x,0)).rgb+inp(uv-vec2(p.x,0)).rgb+inp(uv+vec2(0,p.y)).rgb+inp(uv-vec2(0,p.y)).rgb)/5.0; vec3 c=mix(b.rgb,avg,P4); float l=dot(c,vec3(.2126,.7152,.0722)); c=mix(vec3(l),c,P3); c=floor(c*P0+.5)/P0; float gx=length(inp(uv+vec2(p.x,0)).rgb-inp(uv-vec2(p.x,0)).rgb); float gy=length(inp(uv+vec2(0,p.y)).rgb-inp(uv-vec2(0,p.y)).rgb); float line=smoothstep(P2,P2+.12,length(vec2(gx,gy)))*P1; return vec4(mix(c,vec3(0.015),line),b.a); }`,
  },
  {
    id: 'analogdamage', name: 'Analog Damage', category: 'stylize', version: 1,
    summary: 'Designed VHS/CRT degradation with stable controls instead of random visual noise.',
    params: [
      { key: 'tracking', label: 'Tracking', min: 0, max: 1, default: .24, step: .01 },
      { key: 'chroma', label: 'Chroma Delay', min: 0, max: 16, default: 3, step: .1, unit: 'px' },
      { key: 'noise', label: 'Noise', min: 0, max: 1, default: .18, step: .01 },
      { key: 'scan', label: 'Scanlines', min: 0, max: 1, default: .22, step: .01 },
      { key: 'roll', label: 'Vertical Roll', min: 0, max: 1, default: .04, step: .01 },
      { key: 'bleed', label: 'Highlight Bleed', min: 0, max: 1, default: .2, step: .01 },
    ],
    presets: [
      { id: 'clean-vhs', name: 'Clean VHS', description: 'Believable consumer tape texture with readable detail.', params: { tracking: .16, chroma: 2.2, noise: .12, scan: .18, roll: .015, bleed: .18 } },
      { id: 'late-night-tv', name: 'Late Night TV', description: 'Broadcast scanlines, chroma delay and mild instability.', params: { tracking: .32, chroma: 4.5, noise: .2, scan: .38, roll: .05, bleed: .3 } },
      { id: 'broken-tape', name: 'Broken Tape', description: 'Aggressive tracking tears and noisy color damage.', params: { tracking: .82, chroma: 10, noise: .55, scan: .42, roll: .24, bleed: .58 } },
    ],
    glsl: `float hh(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); } vec4 fx(vec2 uv){ float band=floor(uv.y*120.0); float tear=(hh(vec2(band,floor(uTime*8.0)))-.5)*P0*smoothstep(.78,1.0,hh(vec2(band*.3,floor(uTime*3.0)))); vec2 q=vec2(fract(uv.x+tear),fract(uv.y+uTime*P4*.08)); vec2 cd=vec2(P1/uResolution.x,0); vec4 b=inp(q); vec3 c=vec3(inp(q+cd).r,b.g,inp(q-cd).b); float n=(hh(floor(uv*uResolution*.7)+floor(uTime*24.0))-.5)*P2; float scan=1.0-sin(uv.y*uResolution.y*3.14159)*P3*.12; float hi=smoothstep(.65,1.0,max(max(c.r,c.g),c.b)); c+=inp(q-vec2(P5*10.0/uResolution.x,0)).rgb*hi*P5*.18; return vec4(clamp(c*scan+n,0.0,1.0),b.a); }`,
  },
  {
    id: 'invert', name: 'Invert', params: [{ key: 'amt', label: 'Amount', min: 0, max: 1, default: 1 }],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); return vec4(mix(c.rgb, 1.0-c.rgb, P0), c.a); }`,
  },
  {
    id: 'color', name: 'Color', params: [
      { key: 'bri', label: 'Brightness', min: 0, max: 3, default: 1 },
      { key: 'con', label: 'Contrast', min: 0, max: 3, default: 1 },
      { key: 'sat', label: 'Saturation', min: 0, max: 3, default: 1 },
      { key: 'hue', label: 'Hue', min: -180, max: 180, default: 0 },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); vec3 h=rgb2hsv(c.rgb); h.x=fract(h.x+P3/360.0); h.y*=P2; vec3 r=hsv2rgb(h); r=(r-0.5)*P1+0.5; r*=P0; return vec4(clamp(r,0.0,1.0), c.a); }`,
  },
  {
    id: 'blur', name: 'Blur', params: [{ key: 'rad', label: 'Radius (px)', min: 0, max: 24, default: 4 }],
    glsl: `vec4 fx(vec2 uv){ vec2 px=P0/uResolution; vec4 s=vec4(0.0); float w=0.0; for(int i=-4;i<=4;i++){ for(int j=-4;j<=4;j++){ float g=exp(-float(i*i+j*j)/8.0); s+=inp(uv+vec2(float(i),float(j))*px*0.6)*g; w+=g; } } return s/max(w,1e-3); }`,
  },
  {
    id: 'glow', name: 'Glow', params: [
      { key: 'int', label: 'Intensity', min: 0, max: 2, default: 0.6 },
      { key: 'rad', label: 'Radius (px)', min: 0, max: 30, default: 10 },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 base=inp(uv); vec2 px=P1/uResolution; vec3 b=vec3(0.0); float w=0.0; for(int i=-4;i<=4;i++){ for(int j=-4;j<=4;j++){ float g=exp(-float(i*i+j*j)/8.0); vec3 s=inp(uv+vec2(float(i),float(j))*px*0.7).rgb; b+=max(s-0.6,0.0)*g; w+=g; } } return vec4(base.rgb + (b/max(w,1e-3))*P0*3.0, base.a); }`,
  },
  {
    id: 'pixelate', name: 'Pixelate', params: [{ key: 'size', label: 'Cell', min: 1, max: 80, default: 12 }],
    glsl: `vec4 fx(vec2 uv){ vec2 d=P0/uResolution; vec2 q=(floor(uv/d)+0.5)*d; return inp(q); }`,
  },
  {
    id: 'rgbshift', name: 'RGB Shift', params: [{ key: 'amt', label: 'Amount (px)', min: 0, max: 40, default: 6 }],
    glsl: `vec4 fx(vec2 uv){ vec2 o=vec2(P0/uResolution.x,0.0); float r=inp(uv+o).r; float g=inp(uv).g; float b=inp(uv-o).b; return vec4(r,g,b, inp(uv).a); }`,
  },
  {
    id: 'vignette', name: 'Vignette', params: [{ key: 'amt', label: 'Amount', min: 0, max: 1, default: 0.5 }],
    glsl: `vec4 fx(vec2 uv){ vec4 c=inp(uv); float d=distance(uv, vec2(0.5)); float v=smoothstep(0.8, 0.2, d*1.3); return vec4(c.rgb*mix(1.0, v, P0), c.a); }`,
  },
  {
    id: 'sharpen', name: 'Sharpen', params: [{ key: 'amt', label: 'Amount', min: 0, max: 3, default: 0.8 }],
    glsl: `vec4 fx(vec2 uv){ vec2 px=1.0/uResolution; vec4 c=inp(uv); vec4 s=inp(uv+vec2(px.x,0.))+inp(uv-vec2(px.x,0.))+inp(uv+vec2(0.,px.y))+inp(uv-vec2(0.,px.y)); return vec4(clamp(c.rgb + (c.rgb*4.0 - s.rgb)*P0, 0.0, 1.0), c.a); }`,
  },
  {
    id: 'mirror', name: 'Mirror', params: [{ key: 'mode', label: 'Mode (0-2)', min: 0, max: 2, default: 0 }],
    glsl: `vec4 fx(vec2 uv){ if(P0<0.5) uv.x=uv.x<0.5?uv.x:1.0-uv.x; else if(P0<1.5) uv.y=uv.y<0.5?uv.y:1.0-uv.y; else { uv.x=uv.x<0.5?uv.x:1.0-uv.x; uv.y=uv.y<0.5?uv.y:1.0-uv.y; } return inp(uv); }`,
  },
  {
    id: 'shake', name: 'Shake', params: [{ key: 'amt', label: 'Amount (px)', min: 0, max: 40, default: 8 }],
    glsl: `vec4 fx(vec2 uv){ float t=uTime*30.0; vec2 o=vec2(sin(t*1.7),cos(t*2.3))*(P0*(0.3+iBass))/uResolution; return inp(uv+o); }`,
  },
];

const _byId = new Map(FX_EFFECTS.map(e => [e.id, e]));
export function getEffect(id: string): FxEffect | undefined { return _byId.get(id); }
