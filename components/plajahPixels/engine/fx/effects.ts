// effects.ts — the OFX-shaped GPU effect SDK. Each effect is a "plugin": a name, a
// typed parameter list, and a GLSL body that defines `vec4 fx(vec2 uv)` over its
// input. This is the OFX contract (clip in → params → render) reframed for the web
// GL pipeline; a node in the compositor is one of these, and adding an effect is
// adding a registry entry (or later, a user/WGSL plugin). Deterministic: time +
// audio are injected, so effects export identically.

export interface FxParam { key: string; label: string; min: number; max: number; default: number; }
export interface FxEffect { id: string; name: string; params: FxParam[]; glsl: string; }

// Shared header: the effect body samples its input via inp(uv) and reads P0..P7 (its
// params, in declared order) + audio + time.
export const FX_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform vec2 uResolution;
uniform float uTime;
uniform float iBass, iMid, iTreble, iLevel;
uniform float P0,P1,P2,P3,P4,P5,P6,P7;
vec4 inp(vec2 uv){ return texture(uInput, clamp(uv, 0.0, 1.0)); }
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`;
export const FX_MAIN = `\nvoid main(){ outColor = fx(vUv); }\n`;

export const FX_EFFECTS: FxEffect[] = [
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
