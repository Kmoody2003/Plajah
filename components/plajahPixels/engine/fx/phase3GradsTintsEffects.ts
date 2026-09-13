// phase3GradsTintsEffects.ts — GRADS & TINTS (Continuum Grads and Tints / Optics / Silhouette
// Tints) and OPTICAL DIFFUSION glass (Tiffen-style Net, Silk, Frost, Mist, Center Spot, Split
// Field, Double Fog). All single-pass kernels; every effect ships with curated presets.
import type { FxEffect } from './effects';

const RAMP = `
// Linear ramp across the frame: P angle in degrees, centre c (0..1), width w (0..1 = full frame).
float gradRamp(vec2 uv, float angDeg, float c, float w){ float a=radians(angDeg); vec2 d=vec2(cos(a),sin(a)); float t=dot(uv-0.5,d)+0.5; return smoothstep(c-w*0.5, c+w*0.5, t); }
vec3 hueCol(float h, float s){ return hsv2rgb(vec3(fract(h), clamp(s,0.0,1.0), 1.0)); }
float luma709(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
`;

const g = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'color' });
const d = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'blur' });

export const PHASE3_GRADS_TINTS_EFFECTS: FxEffect[] = [
  g({
    id: 'ndgrad', name: 'ND Gradient', version: 1,
    summary: 'Neutral-density graduated filter: darkens (or lifts) one side of the frame with a soft transition — sky control after the fact.',
    params: [
      { key: 'stops', label: 'Density', min: -3, max: 3, default: -1.2, step: .05, unit: 'stops' },
      { key: 'angle', label: 'Angle', min: -180, max: 180, default: -90, step: 1, unit: 'deg' },
      { key: 'center', label: 'Transition', min: 0, max: 1, default: .5, step: .005 },
      { key: 'width', label: 'Softness', min: .01, max: 1, default: .35, step: .01 },
      { key: 'protect', label: 'Protect Highlights', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'sky-nd', name: 'Sky ND', description: 'Classic top-down neutral grad for bright skies.', params: { stops: -1.4, angle: -90, center: .45, width: .4, protect: .2 } },
      { id: 'hard-horizon', name: 'Hard Horizon', description: 'Tight transition for a flat horizon line.', params: { stops: -1.8, angle: -90, center: .5, width: .08, protect: .4 } },
      { id: 'lift-foreground', name: 'Lift Foreground', description: 'Brightens the bottom of frame instead.', params: { stops: .8, angle: 90, center: .55, width: .5, protect: .6 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float m=gradRamp(uv,P1,P2,P3); float gain=exp2(P0*m); vec3 c=b.rgb*gain; float l=luma709(b.rgb); c=mix(c,b.rgb,P4*smoothstep(.7,1.0,l)*step(0.0,-P0)); return vec4(clamp(c,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'colorgrad', name: 'Color Gradient', version: 1,
    summary: 'Coloured graduated filter — tints one region of the frame with a chosen hue, from subtle sky warmth to bold editorial washes.',
    params: [
      { key: 'hue', label: 'Hue', min: 0, max: 1, default: .58, step: .005 },
      { key: 'sat', label: 'Saturation', min: 0, max: 1, default: .6, step: .01 },
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .35, step: .01 },
      { key: 'angle', label: 'Angle', min: -180, max: 180, default: -90, step: 1, unit: 'deg' },
      { key: 'center', label: 'Transition', min: 0, max: 1, default: .5, step: .005 },
      { key: 'width', label: 'Softness', min: .01, max: 1, default: .4, step: .01 },
      { key: 'mode', label: 'Blend (0 tint · 1 multiply · 2 screen · 3 overlay)', min: 0, max: 3, default: 0, step: 1 },
    ],
    presets: [
      { id: 'sunset-sky', name: 'Sunset Sky', description: 'Warm amber wash across the top of frame.', params: { hue: .07, sat: .7, amount: .4, angle: -90, center: .45, width: .5, mode: 3 } },
      { id: 'cool-blue-sky', name: 'Cool Blue Sky', description: 'Deep blue graduated tint for washed-out skies.', params: { hue: .6, sat: .75, amount: .45, angle: -90, center: .5, width: .35, mode: 1 } },
      { id: 'tobacco', name: 'Tobacco', description: 'The classic brown tobacco grad.', params: { hue: .08, sat: .55, amount: .5, angle: -90, center: .5, width: .45, mode: 1 } },
      { id: 'side-light', name: 'Side Light', description: 'Lateral warm-to-neutral wash.', params: { hue: .1, sat: .5, amount: .3, angle: 0, center: .4, width: .8, mode: 2 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float m=gradRamp(uv,P3,P4,P5)*P2; vec3 t=hueCol(P0,P1); vec3 o; if(P6<.5) o=mix(b.rgb,b.rgb*0.35+t*luma709(b.rgb)*0.9,m); else if(P6<1.5) o=mix(b.rgb,b.rgb*t,m); else if(P6<2.5) o=mix(b.rgb,b.rgb+t-b.rgb*t,m); else { vec3 ov=mix(2.0*b.rgb*t,1.0-2.0*(1.0-b.rgb)*(1.0-t),step(0.5,b.rgb)); o=mix(b.rgb,ov,m); } return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'dualgrad', name: 'Dual Gradient', version: 1,
    summary: 'Two opposing coloured grads meeting in the middle — sky one colour, ground another.',
    params: [
      { key: 'hueA', label: 'Top Hue', min: 0, max: 1, default: .6, step: .005 },
      { key: 'hueB', label: 'Bottom Hue', min: 0, max: 1, default: .08, step: .005 },
      { key: 'sat', label: 'Saturation', min: 0, max: 1, default: .6, step: .01 },
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .3, step: .01 },
      { key: 'angle', label: 'Angle', min: -180, max: 180, default: -90, step: 1, unit: 'deg' },
      { key: 'center', label: 'Meeting Line', min: 0, max: 1, default: .5, step: .005 },
      { key: 'width', label: 'Softness', min: .01, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'blue-amber', name: 'Blue / Amber', description: 'Cool sky over warm ground.', params: { hueA: .6, hueB: .08, sat: .6, amount: .32, angle: -90, center: .5, width: .3 } },
      { id: 'magenta-teal', name: 'Magenta / Teal', description: 'Editorial split with a wide blend.', params: { hueA: .88, hueB: .48, sat: .55, amount: .35, angle: -90, center: .5, width: .6 } },
      { id: 'sunrise', name: 'Sunrise', description: 'Violet top into orange bottom, soft meeting line.', params: { hueA: .75, hueB: .06, sat: .5, amount: .3, angle: -90, center: .58, width: .5 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float m=gradRamp(uv,P4,P5,P6); vec3 t=mix(hueCol(P0,P2),hueCol(P1,P2),m); float l=luma709(b.rgb); vec3 o=mix(b.rgb,b.rgb*t*1.15,P3); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'radialtint', name: 'Radial Tint', version: 1,
    summary: 'Colour tint that changes from the centre outward — warm centre, cool edges, or a coloured vignette.',
    params: [
      { key: 'hueIn', label: 'Centre Hue', min: 0, max: 1, default: .1, step: .005 },
      { key: 'hueOut', label: 'Edge Hue', min: 0, max: 1, default: .6, step: .005 },
      { key: 'sat', label: 'Saturation', min: 0, max: 1, default: .5, step: .01 },
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .3, step: .01 },
      { key: 'radius', label: 'Radius', min: .05, max: 1.2, default: .55, step: .01 },
      { key: 'softness', label: 'Softness', min: .01, max: 1, default: .5, step: .01 },
      { key: 'cx', label: 'Centre X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'cy', label: 'Centre Y', min: 0, max: 1, default: .5, step: .005 },
    ],
    presets: [
      { id: 'warm-core', name: 'Warm Core', description: 'Warm centre fading to cool corners.', params: { hueIn: .09, hueOut: .6, sat: .5, amount: .3, radius: .5, softness: .6, cx: .5, cy: .5 } },
      { id: 'blue-vignette', name: 'Blue Vignette', description: 'Neutral centre, deep blue edges.', params: { hueIn: .6, hueOut: .62, sat: .8, amount: .35, radius: .7, softness: .4, cx: .5, cy: .5 } },
      { id: 'candle', name: 'Candle', description: 'Tight amber pool of light.', params: { hueIn: .07, hueOut: .72, sat: .6, amount: .45, radius: .3, softness: .5, cx: .5, cy: .55 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 dd=(uv-vec2(P6,P7))*vec2(asp,1.0); float r=length(dd)/max(P4,1e-3); float m=smoothstep(1.0-P5,1.0+P5*0.2,r); vec3 t=mix(hueCol(P0,P2),hueCol(P1,P2),m); float w=P3*(0.4+0.6*m*m+0.4*(1.0-m)); vec3 o=mix(b.rgb,b.rgb*t*1.1,P3); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'splittone', name: 'Split Tone', version: 1,
    summary: 'Independent hues for shadows and highlights with balance and saturation — the darkroom split-tone.',
    params: [
      { key: 'shadowHue', label: 'Shadow Hue', min: 0, max: 1, default: .6, step: .005 },
      { key: 'shadowSat', label: 'Shadow Saturation', min: 0, max: 1, default: .3, step: .01 },
      { key: 'hiHue', label: 'Highlight Hue', min: 0, max: 1, default: .1, step: .005 },
      { key: 'hiSat', label: 'Highlight Saturation', min: 0, max: 1, default: .25, step: .01 },
      { key: 'balance', label: 'Balance', min: -1, max: 1, default: 0, step: .01 },
      { key: 'preserve', label: 'Preserve Luma', min: 0, max: 1, default: 1, step: .01 },
    ],
    presets: [
      { id: 'classic', name: 'Classic Split', description: 'Cool shadows, warm highlights.', params: { shadowHue: .6, shadowSat: .3, hiHue: .1, hiSat: .25, balance: 0, preserve: 1 } },
      { id: 'sepia-selenium', name: 'Sepia / Selenium', description: 'Darkroom: selenium-purple shadows, sepia highlights.', params: { shadowHue: .78, shadowSat: .25, hiHue: .09, hiSat: .35, balance: .1, preserve: 1 } },
      { id: 'mint-rose', name: 'Mint / Rose', description: 'Pastel modern split.', params: { shadowHue: .42, shadowSat: .22, hiHue: .95, hiSat: .22, balance: -.1, preserve: 1 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float l=luma709(b.rgb); float t=smoothstep(0.0,1.0,clamp(l+P4*0.5,0.0,1.0)); vec3 sh=hueCol(P0,1.0), hi=hueCol(P2,1.0); vec3 tint=mix(sh,vec3(1.0),1.0-P1*(1.0-t))*mix(hi,vec3(1.0),1.0-P3*t); vec3 o=b.rgb*tint; float l2=luma709(o); o*=mix(1.0,l/max(l2,1e-4),P5); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'gels', name: 'Gels', version: 1,
    summary: 'Lighting-gel colour cast over the whole frame with density and a white-point protect — CTO, CTB, plus theatrical colours.',
    params: [
      { key: 'hue', label: 'Hue', min: 0, max: 1, default: .08, step: .005 },
      { key: 'sat', label: 'Saturation', min: 0, max: 1, default: .5, step: .01 },
      { key: 'density', label: 'Density', min: 0, max: 1, default: .4, step: .01 },
      { key: 'protect', label: 'Protect Whites', min: 0, max: 1, default: .4, step: .01 },
    ],
    presets: [
      { id: 'cto', name: 'CTO', description: 'Colour-temperature orange.', params: { hue: .075, sat: .55, density: .4, protect: .4 } },
      { id: 'ctb', name: 'CTB', description: 'Colour-temperature blue.', params: { hue: .58, sat: .5, density: .4, protect: .4 } },
      { id: 'congo-blue', name: 'Congo Blue', description: 'Deep theatrical blue.', params: { hue: .68, sat: .9, density: .75, protect: .15 } },
      { id: 'rose-pink', name: 'Rose Pink', description: 'Soft pink stage gel.', params: { hue: .93, sat: .5, density: .35, protect: .5 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 gel=hueCol(P0,P1); vec3 o=mix(b.rgb,b.rgb*gel,P2); float l=luma709(b.rgb); o=mix(o,b.rgb,P3*smoothstep(.75,1.0,l)); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'skintone', name: 'Skin Tone', version: 1,
    summary: 'Pulls skin hues toward a target warmth and saturation without touching the rest of the frame.',
    params: [
      { key: 'warmth', label: 'Warmth', min: -1, max: 1, default: .15, step: .01 },
      { key: 'sat', label: 'Saturation', min: .5, max: 1.5, default: 1.05, step: .01 },
      { key: 'smooth', label: 'Tone Smooth', min: 0, max: 1, default: .3, step: .01 },
      { key: 'range', label: 'Hue Range', min: .02, max: .2, default: .08, step: .005 },
      { key: 'centerHue', label: 'Skin Hue', min: 0, max: .15, default: .055, step: .0025 },
    ],
    presets: [
      { id: 'natural', name: 'Natural', description: 'Gentle warmth and unification.', params: { warmth: .12, sat: 1.04, smooth: .25, range: .08, centerHue: .055 } },
      { id: 'golden', name: 'Golden', description: 'Warmer, richer skin.', params: { warmth: .35, sat: 1.15, smooth: .3, range: .09, centerHue: .06 } },
      { id: 'porcelain', name: 'Porcelain', description: 'Cooler, desaturated, smoothed.', params: { warmth: -.2, sat: .88, smooth: .55, range: .08, centerHue: .05 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 h=rgb2hsv(b.rgb); float dh=abs(h.x-P4); dh=min(dh,1.0-dh); float k=(1.0-smoothstep(P3*0.6,P3*1.4,dh))*smoothstep(.12,.35,h.y)*smoothstep(.15,.4,h.z); vec3 t=h; t.x=fract(t.x+P0*0.02); t.y*=P1; t.y=mix(t.y,t.y*0.9,P2*0.5); vec3 o=mix(b.rgb,hsv2rgb(t),k); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  g({
    id: 'sunsetgrad', name: 'Sunset', version: 1,
    summary: 'Three-band sky grad (violet → orange → gold) with a horizon line — instant golden hour.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .45, step: .01 },
      { key: 'horizon', label: 'Horizon', min: 0, max: 1, default: .55, step: .005 },
      { key: 'warmth', label: 'Warmth', min: 0, max: 1, default: .6, step: .01 },
      { key: 'spread', label: 'Spread', min: .1, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'golden-hour', name: 'Golden Hour', description: 'Warm, wide, natural.', params: { amount: .4, horizon: .55, warmth: .65, spread: .55 } },
      { id: 'dusk', name: 'Dusk', description: 'Violet-heavy with a thin gold line.', params: { amount: .5, horizon: .6, warmth: .3, spread: .35 } },
      { id: 'inferno', name: 'Inferno', description: 'Saturated red-orange sky.', params: { amount: .7, horizon: .5, warmth: 1, spread: .7 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float y=(P1-uv.y)/max(P3,1e-3); vec3 top=vec3(.35,.2,.55), mid=vec3(1.0,.45,.15), low=vec3(1.0,.8,.35); mid=mix(mid,vec3(1.0,.25,.05),P2*0.5); vec3 sky=y>0.5?mix(mid,top,smoothstep(0.5,1.5,y)):mix(low,mid,smoothstep(-0.2,0.5,y)); float m=smoothstep(-0.35,0.15,y)*P0; vec3 o=mix(b.rgb,b.rgb*sky*1.25+sky*0.1,m); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  // ── Optical diffusion glass ─────────────────────────────────────────────────────────────
  d({
    id: 'netdiffusion', name: 'Net', version: 1,
    summary: 'Black-net diffusion: softens highlights with a fine mesh pattern and lowers contrast like a stocking over the lens.',
    params: [
      { key: 'density', label: 'Density', min: 0, max: 1, default: .5, step: .01 },
      { key: 'mesh', label: 'Mesh Pitch', min: 2, max: 24, default: 6, step: .5, unit: 'px' },
      { key: 'halo', label: 'Halation', min: 0, max: 1, default: .35, step: .01 },
      { key: 'lift', label: 'Black Lift', min: 0, max: .3, default: .05, step: .005 },
      { key: 'blur', label: 'Blur', min: 0, max: 12, default: 3, step: .5, unit: 'px' },
    ],
    presets: [
      { id: 'black-net-1', name: 'Black Net 1', description: 'Light stocking softness.', params: { density: .35, mesh: 5, halo: .25, lift: .03, blur: 2 } },
      { id: 'black-net-3', name: 'Black Net 3', description: 'Heavier, dreamy portrait glass.', params: { density: .7, mesh: 7, halo: .5, lift: .07, blur: 5 } },
      { id: 'white-net', name: 'White Net', description: 'Lifted blacks and milky highlights.', params: { density: .5, mesh: 6, halo: .4, lift: .14, blur: 3 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 px=1.0/uResolution; vec3 s=vec3(0.0); float w=0.0; for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){ float g=exp(-float(i*i+j*j)/3.0); s+=inp(uv+vec2(float(i),float(j))*px*P4*0.6).rgb*g; w+=g; } s/=w; vec2 m=fract(uv*uResolution/P1); float mesh=1.0-0.35*P0*(smoothstep(.45,.5,abs(m.x-.5))+smoothstep(.45,.5,abs(m.y-.5))); vec3 hi=max(s-0.55,0.0)*P2*1.6; vec3 o=mix(b.rgb,s,P0*0.6)*mesh+hi; o=o*(1.0-P3)+P3; return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'silkdiffusion', name: 'Silk', version: 1,
    summary: 'Silk-stocking glow: highlights bloom softly across the frame while detail stays intact.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .5, step: .01 },
      { key: 'radius', label: 'Radius', min: 2, max: 60, default: 18, step: 1, unit: 'px' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 1, default: .5, step: .01 },
      { key: 'warm', label: 'Warmth', min: -1, max: 1, default: .1, step: .01 },
    ],
    presets: [
      { id: 'silk-light', name: 'Silk 1', description: 'Delicate highlight bloom.', params: { amount: .35, radius: 14, threshold: .58, warm: .1 } },
      { id: 'silk-heavy', name: 'Silk 3', description: 'Full romantic glow.', params: { amount: .7, radius: 30, threshold: .42, warm: .2 } },
      { id: 'cool-silk', name: 'Cool Silk', description: 'Neutral-cool bloom for night scenes.', params: { amount: .5, radius: 22, threshold: .5, warm: -.4 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 px=P1/uResolution; vec3 s=vec3(0.0); float w=0.0; for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){ float g=exp(-float(i*i+j*j)/6.0); vec3 c=inp(uv+vec2(float(i),float(j))*px*0.33).rgb; s+=max(c-P2,0.0)*g; w+=g; } s/=w; s*=vec3(1.0+P3*0.25,1.0,1.0-P3*0.25); vec3 o=b.rgb+s*P0*2.2-b.rgb*s*P0; return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'frostdiffusion', name: 'Frost', version: 1,
    summary: 'Frosted-glass diffusion: a crystalline scatter that softens the whole image with a slight sparkle.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .5, step: .01 },
      { key: 'scatter', label: 'Scatter', min: 1, max: 30, default: 8, step: .5, unit: 'px' },
      { key: 'crystal', label: 'Crystal Size', min: 2, max: 40, default: 10, step: 1, unit: 'px' },
      { key: 'sparkle', label: 'Sparkle', min: 0, max: 1, default: .2, step: .01 },
    ],
    presets: [
      { id: 'frost-1', name: 'Frost 1', description: 'Gentle crystalline softness.', params: { amount: .35, scatter: 5, crystal: 8, sparkle: .1 } },
      { id: 'frost-3', name: 'Frost 3', description: 'Heavy winter-window look.', params: { amount: .8, scatter: 16, crystal: 14, sparkle: .35 } },
      { id: 'ice-sparkle', name: 'Ice Sparkle', description: 'Light scatter, strong sparkle on highlights.', params: { amount: .4, scatter: 6, crystal: 6, sparkle: .7 } },
    ],
    glsl: RAMP + `float fh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 cell=floor(uv*uResolution/P2); vec2 j=vec2(fh(cell),fh(cell+7.7))-0.5; vec3 s=inp(uv+j*P1/uResolution).rgb; vec3 acc=vec3(0.0); for(int k=0;k<6;k++){ float a=float(k)*1.047; vec2 o=vec2(cos(a),sin(a))*P1/uResolution*(0.4+0.6*fh(cell+float(k))); acc+=inp(uv+o).rgb; } acc/=6.0; vec3 soft=mix(acc,s,0.4); float l=luma709(soft); float sp=smoothstep(.6,.95,l)*fh(cell*1.3)*P3; vec3 o=mix(b.rgb,soft,P0)+sp*0.5; return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'mistdiffusion', name: 'Mist', version: 1,
    summary: 'Black/white mist filters: lowers contrast, lifts shadows and halates highlights for a misty, atmospheric image.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .5, step: .01 },
      { key: 'radius', label: 'Radius', min: 4, max: 80, default: 30, step: 1, unit: 'px' },
      { key: 'lift', label: 'Shadow Lift', min: 0, max: .3, default: .06, step: .005 },
      { key: 'type', label: 'Type (0 black mist · 1 white mist)', min: 0, max: 1, default: 0, step: 1 },
    ],
    presets: [
      { id: 'black-mist-quarter', name: 'Black Mist 1/4', description: 'The subtle cinematic standard.', params: { amount: .3, radius: 24, lift: .03, type: 0 } },
      { id: 'black-mist-1', name: 'Black Mist 1', description: 'Full black-mist halation.', params: { amount: .65, radius: 40, lift: .06, type: 0 } },
      { id: 'white-mist', name: 'White Mist', description: 'Milky, lifted, dreamy.', params: { amount: .6, radius: 36, lift: .16, type: 1 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 px=P1/uResolution; vec3 s=vec3(0.0); float w=0.0; for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){ float g=exp(-float(i*i+j*j)/7.0); s+=inp(uv+vec2(float(i),float(j))*px*0.33).rgb*g; w+=g; } s/=w; vec3 halo=max(s-0.45,0.0)*1.4; vec3 o=b.rgb+halo*P0*(P3>0.5?1.4:0.9); o=mix(o,mix(o,s,0.5),P0*(P3>0.5?0.5:0.2)); o=o*(1.0-P2)+P2*(P3>0.5?1.4:0.8); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'centerspot', name: 'Center Spot', version: 1,
    summary: 'Sharp centre, diffused edges — the classic portrait centre-spot filter with a soft vignette blend.',
    params: [
      { key: 'radius', label: 'Clear Radius', min: .05, max: 1, default: .35, step: .01 },
      { key: 'softness', label: 'Softness', min: .01, max: 1, default: .4, step: .01 },
      { key: 'blur', label: 'Edge Blur', min: 0, max: 30, default: 10, step: .5, unit: 'px' },
      { key: 'glow', label: 'Edge Glow', min: 0, max: 1, default: .3, step: .01 },
      { key: 'cx', label: 'Centre X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'cy', label: 'Centre Y', min: 0, max: 1, default: .5, step: .005 },
    ],
    presets: [
      { id: 'portrait', name: 'Portrait', description: 'Face sharp, surroundings dreamy.', params: { radius: .32, softness: .45, blur: 10, glow: .3, cx: .5, cy: .45 } },
      { id: 'tight', name: 'Tight Spot', description: 'Small clear area, heavy diffusion.', params: { radius: .18, softness: .3, blur: 18, glow: .45, cx: .5, cy: .5 } },
      { id: 'wide', name: 'Wide Spot', description: 'Only the corners diffuse.', params: { radius: .6, softness: .5, blur: 8, glow: .2, cx: .5, cy: .5 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; float r=length((uv-vec2(P4,P5))*vec2(asp,1.0)); float m=smoothstep(P0,P0+P1,r); vec2 px=P2/uResolution; vec3 s=vec3(0.0); float w=0.0; for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){ float g=exp(-float(i*i+j*j)/3.0); s+=inp(uv+vec2(float(i),float(j))*px*0.5).rgb*g; w+=g; } s/=w; vec3 soft=s+max(s-0.5,0.0)*P3; vec3 o=mix(b.rgb,soft,m); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'splitfield', name: 'Split Field', version: 1,
    summary: 'Split-field diopter look: one half of the frame in focus, the other defocused, with a controllable seam.',
    params: [
      { key: 'position', label: 'Seam', min: 0, max: 1, default: .5, step: .005 },
      { key: 'angle', label: 'Angle', min: -180, max: 180, default: 0, step: 1, unit: 'deg' },
      { key: 'softness', label: 'Seam Softness', min: .005, max: .5, default: .06, step: .005 },
      { key: 'blur', label: 'Defocus', min: 0, max: 40, default: 14, step: .5, unit: 'px' },
      { key: 'side', label: 'Blur Side (0 far · 1 near)', min: 0, max: 1, default: 0, step: 1 },
    ],
    presets: [
      { id: 'vertical', name: 'Vertical Split', description: 'Left sharp, right soft.', params: { position: .5, angle: 0, softness: .04, blur: 14, side: 0 } },
      { id: 'horizon', name: 'Horizon Diopter', description: 'Bottom sharp, top soft.', params: { position: .5, angle: 90, softness: .08, blur: 18, side: 0 } },
      { id: 'diagonal', name: 'Diagonal', description: 'Angled seam with a wide blend.', params: { position: .5, angle: 35, softness: .2, blur: 12, side: 1 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float m=gradRamp(uv,P1,P0,P2); if(P4>0.5) m=1.0-m; vec2 px=P3/uResolution; vec3 s=vec3(0.0); float w=0.0; for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){ float g=exp(-float(i*i+j*j)/6.0); s+=inp(uv+vec2(float(i),float(j))*px*0.33).rgb*g; w+=g; } s/=w; vec3 o=mix(b.rgb,s,m); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'doublefog', name: 'Double Fog', version: 1,
    summary: 'Fog filter that blooms highlights heavily while keeping shadows relatively clean — heavier than mist, softer than a blur.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .5, step: .01 },
      { key: 'radius', label: 'Radius', min: 8, max: 120, default: 50, step: 1, unit: 'px' },
      { key: 'threshold', label: 'Threshold', min: 0, max: 1, default: .35, step: .01 },
      { key: 'contrast', label: 'Contrast Loss', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'double-fog-1', name: 'Double Fog 1', description: 'Moderate highlight fog.', params: { amount: .4, radius: 40, threshold: .4, contrast: .2 } },
      { id: 'double-fog-3', name: 'Double Fog 3', description: 'Heavy atmospheric bloom.', params: { amount: .8, radius: 80, threshold: .25, contrast: .45 } },
      { id: 'night-fog', name: 'Night Fog', description: 'Practical lights bloom, shadows stay.', params: { amount: .6, radius: 60, threshold: .55, contrast: .1 } },
    ],
    glsl: RAMP + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 px=P1/uResolution; vec3 s=vec3(0.0); float w=0.0; for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){ float g=exp(-float(i*i+j*j)/7.0); s+=max(inp(uv+vec2(float(i),float(j))*px*0.33).rgb-P2,0.0)*g; w+=g; } s/=w; vec3 o=b.rgb+s*P0*2.5-b.rgb*s*P0; o=mix(o,(o-0.5)*(1.0-P3*0.6)+0.5+P3*0.08,P0); return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
];
