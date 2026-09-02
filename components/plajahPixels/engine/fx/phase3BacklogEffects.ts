// phase3BacklogEffects.ts — remaining catalog gaps: Symbol Mapper (ASCII art), Retrograde
// (8/16mm film frame + damage), Carousel (slide frame), Dither & Palettes, Glo Fi (fractal
// glow), Heatwave, ChromaTown, Sketchify, Muzzle Flash (Bang).
import type { FxEffect } from './effects';

const K = `
float bh21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float bnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(bh21(i),bh21(i+vec2(1,0)),f.x),mix(bh21(i+vec2(0,1)),bh21(i+vec2(1,1)),f.x),f.y); }
float bfbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*bnoise(p); p=p*2.03+17.1; a*=0.5; } return v; }
float bluma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
vec3 bhue(float h){ return hsv2rgb(vec3(fract(h),0.85,1.0)); }
`;
const s = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'stylize' });
const l = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'light' });
const d = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'distort' });

export const PHASE3_BACKLOG_EFFECTS: FxEffect[] = [
  s({
    id: 'symbolmapper', name: 'Symbol Mapper', version: 1,
    summary: 'ASCII / symbol art: each cell becomes a glyph whose density matches the picture, in mono or the source colour.',
    params: [
      { key: 'cell', label: 'Cell Size', min: 4, max: 40, default: 10, step: 1, unit: 'px' },
      { key: 'color', label: 'Colour (0 mono · 1 source · 2 green terminal · 3 amber)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'contrast', label: 'Contrast', min: .5, max: 2, default: 1.2, step: .01 },
      { key: 'invert', label: 'Invert', min: 0, max: 1, default: 0, step: 1 },
      { key: 'levels', label: 'Glyph Levels', min: 2, max: 6, default: 5, step: 1 },
      { key: 'bg', label: 'Background', min: 0, max: 1, default: 0, step: .01 },
    ],
    presets: [
      { id: 'terminal', name: 'Green Terminal', description: 'Classic green-on-black ASCII.', params: { cell: 10, color: 2, contrast: 1.3, invert: 0, levels: 5, bg: 0 } },
      { id: 'colour-ascii', name: 'Colour ASCII', description: 'Glyphs in the source colours.', params: { cell: 8, color: 1, contrast: 1.2, invert: 0, levels: 6, bg: .05 } },
      { id: 'print', name: 'Typewriter', description: 'Dark glyphs on paper.', params: { cell: 12, color: 0, contrast: 1.4, invert: 1, levels: 4, bg: .92 } },
    ],
    // glyphs are 5x5 bitmaps encoded per density level: ' ', '.', ':', '+', '#', '@'
    glsl: K + `float glyph(int lvl, ivec2 p){ if(lvl<=0) return 0.0; if(lvl==1) return (p.x==2&&p.y==3)?1.0:0.0; if(lvl==2) return (p.x==2&&(p.y==1||p.y==3))?1.0:0.0; if(lvl==3) return ((p.x==2&&p.y>=0&&p.y<=4)||(p.y==2&&p.x>=0&&p.x<=4))?1.0:0.0; if(lvl==4) return ((p.x+p.y)%2==0)?1.0:0.0; return (p.x>=0&&p.x<=4&&p.y>=0&&p.y<=4&&!(p.x==2&&p.y==2))?1.0:0.0; } vec4 fx(vec2 uv){ vec2 res=uResolution; vec2 g=floor(uv*res/P0); vec2 cuv=(g+0.5)*P0/res; vec4 c=inp(cuv); float l=clamp((bluma(c.rgb)-0.5)*P2+0.5,0.0,1.0); if(P3>0.5) l=1.0-l; int n=int(clamp(P4,2.0,6.0)+0.5); int lvl=int(floor(l*float(n-1)+0.5)); vec2 f=fract(uv*res/P0); ivec2 p=ivec2(int(f.x*6.0)-0, int(f.y*6.0)-0); float on=(p.x<5&&p.y<5)?glyph(lvl,p):0.0; vec3 ink; if(P1<.5) ink=vec3(1.0); else if(P1<1.5) ink=c.rgb/max(bluma(c.rgb),0.2); else if(P1<2.5) ink=vec3(0.25,1.0,0.35); else ink=vec3(1.0,0.72,0.2); vec3 paper=vec3(P5); if(P3>0.5&&P1<.5) ink=vec3(0.08); vec3 o=mix(paper,ink,on); return vec4(o,c.a); }`,
  }),
  s({
    id: 'retrograde', name: 'Retrograde', version: 1,
    summary: '8 mm / 16 mm home-movie look: frame edge with sprocket area, gate weave, flicker, dust and hairs, faded colour.',
    params: [
      { key: 'gauge', label: 'Gauge (0 8mm · 1 16mm)', min: 0, max: 1, default: 0, step: 1 },
      { key: 'frame', label: 'Frame Edge', min: 0, max: 1, default: .7, step: .01 },
      { key: 'weave', label: 'Gate Weave', min: 0, max: 1, default: .4, step: .01 },
      { key: 'flicker', label: 'Flicker', min: 0, max: 1, default: .3, step: .01 },
      { key: 'damage', label: 'Dust & Hairs', min: 0, max: 1, default: .4, step: .01 },
      { key: 'fade', label: 'Colour Fade', min: 0, max: 1, default: .5, step: .01 },
      { key: 'fps', label: 'Judder (0 off · 18 fps)', min: 0, max: 24, default: 18, step: 1 },
    ],
    presets: [
      { id: 'super8', name: 'Super 8', description: 'Warm faded 8 mm with weave and dust.', params: { gauge: 0, frame: .7, weave: .45, flicker: .35, damage: .45, fade: .55, fps: 18 } },
      { id: 'sixteen', name: '16 mm Doc', description: 'Cleaner 16 mm with light damage.', params: { gauge: 1, frame: .5, weave: .2, flicker: .15, damage: .2, fade: .3, fps: 24 } },
      { id: 'attic-reel', name: 'Attic Reel', description: 'Heavily damaged and faded.', params: { gauge: 0, frame: .9, weave: .7, flicker: .6, damage: .9, fade: .85, fps: 18 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float tick=P6>0.0?floor(uTime*P6)/P6:uTime; vec2 weave=vec2(bnoise(vec2(tick*7.0,1.3))-0.5, bnoise(vec2(tick*5.0,9.1))-0.5)*0.02*P2; vec2 q=uv+weave; vec4 b=inp(q); vec3 c=b.rgb; vec3 faded=mix(c,vec3(bluma(c))*vec3(1.05,0.95,0.8)+vec3(0.08,0.04,0.0),P5*0.6); c=mix(c,faded,P5); c*=1.0+(bnoise(vec2(tick*13.0,3.3))-0.5)*P3*0.5; float fl=bh21(vec2(tick,2.2)); float hair=0.0; if(P4>0.0){ float x=uv.x*uResolution.x; float hx=bh21(vec2(tick,7.7))*uResolution.x; float hw=1.0+bh21(vec2(tick,8.8))*2.0; hair=step(abs(x-hx),hw)*step(0.6,bh21(vec2(tick,9.9)))*P4*0.8; float dust=step(1.0-P4*0.02, bh21(floor(uv*uResolution/2.0)+tick*3.0)); c=mix(c,vec3(0.05),hair); c=mix(c,vec3(0.9),dust*0.8); } float asp=uResolution.x/uResolution.y; float inset=P0>0.5?0.06:0.1; float ex=smoothstep(0.0,inset*0.5,uv.x)*smoothstep(0.0,inset*0.5,1.0-uv.x)*smoothstep(0.0,inset*0.7,uv.y)*smoothstep(0.0,inset*0.7,1.0-uv.y); float vign=mix(1.0,ex*(0.85+0.15*bfbm(uv*4.0+tick)),P1); c*=vign; float sprocket=0.0; if(P1>0.0&&P0<0.5){ float sx=step(uv.x,inset*0.35); float sy=step(0.35,fract(uv.y*6.0))*step(fract(uv.y*6.0),0.65); sprocket=sx*sy*P1; } c=mix(c,vec3(0.02),sprocket); return vec4(clamp(c,0.0,1.0),b.a); }`,
  }),
  s({
    id: 'carousel', name: 'Carousel', version: 1,
    summary: 'Vintage slide-projector look: cardboard slide frame, cross-processed colour, dust, flicker and light leaks.',
    params: [
      { key: 'frame', label: 'Slide Frame', min: 0, max: 1, default: .8, step: .01 },
      { key: 'process', label: 'Cross Process', min: 0, max: 1, default: .5, step: .01 },
      { key: 'fading', label: 'Fading', min: 0, max: 1, default: .4, step: .01 },
      { key: 'leak', label: 'Light Leak', min: 0, max: 1, default: .3, step: .01 },
      { key: 'flicker', label: 'Flicker', min: 0, max: 1, default: .2, step: .01 },
      { key: 'dust', label: 'Dust', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'kodachrome', name: 'Kodachrome', description: 'Rich reds, slight fade, cardboard frame.', params: { frame: .8, process: .35, fading: .3, leak: .2, flicker: .15, dust: .25 } },
      { id: 'echokrome', name: 'Echokrome', description: 'Heavy cross-process with green shadows.', params: { frame: .8, process: .9, fading: .5, leak: .4, flicker: .25, dust: .3 } },
      { id: 'grungy', name: 'Grungy Slide', description: 'Faded, dusty, leaking.', params: { frame: 1, process: .5, fading: .8, leak: .7, flicker: .4, dust: .8 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 c=b.rgb; float l=bluma(c); vec3 cp=vec3(pow(c.r,0.85)*1.08, c.g*0.95+(1.0-l)*0.05, pow(c.b,1.2)*0.9+(1.0-l)*0.08); c=mix(c,cp,P1); c=mix(c,(c-0.5)*0.75+0.5+vec3(0.06,0.04,0.0),P2); c*=1.0+(bh21(vec2(floor(uTime*12.0),1.0))-0.5)*P4*0.4; vec2 lp=uv-vec2(0.0,0.5); float leak=exp(-length(lp*vec2(1.0,0.6))*3.0)*P3*(0.6+0.4*sin(uTime*0.7)); c+=vec3(1.0,0.45,0.15)*leak; float dust=step(1.0-P5*0.015,bh21(floor(uv*uResolution/2.0)+floor(uTime*8.0)))*0.7; c=mix(c,vec3(0.95),dust); float inset=0.055; float inFrame=step(inset,uv.x)*step(uv.x,1.0-inset)*step(inset*1.4,uv.y)*step(uv.y,1.0-inset*1.4); vec3 card=vec3(0.92,0.9,0.84)*(0.9+0.1*bnoise(uv*40.0)); c=mix(c,mix(c,card,P0),1.0-inFrame); float edge=smoothstep(0.0,0.008,min(min(uv.x-inset,1.0-inset-uv.x),min(uv.y-inset*1.4,1.0-inset*1.4-uv.y)))*inFrame; c=mix(c*0.6,c,mix(1.0,edge,P0)); return vec4(clamp(c,0.0,1.0),b.a); }`,
  }),
  s({
    id: 'ditherpalettes', name: 'Dither & Palettes', version: 1,
    summary: 'Ordered (Bayer), threshold and halftone dithering into a limited palette — 1-bit, 4-colour Game Boy, CGA, 8-bit and custom hue ramps.',
    params: [
      { key: 'method', label: 'Dither (0 Bayer 8 · 1 Bayer 4 · 2 threshold · 3 noise)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'palette', label: 'Palette (0 1-bit · 1 Game Boy · 2 CGA · 3 8-bit · 4 duotone hue · 5 source-quantised)', min: 0, max: 5, default: 1, step: 1 },
      { key: 'pixel', label: 'Pixel Size', min: 1, max: 12, default: 2, step: 1, unit: 'px' },
      { key: 'levels', label: 'Levels', min: 2, max: 16, default: 4, step: 1 },
      { key: 'contrast', label: 'Contrast', min: .5, max: 2, default: 1.1, step: .01 },
      { key: 'hue', label: 'Duotone Hue', min: 0, max: 1, default: .6, step: .005 },
    ],
    presets: [
      { id: 'gameboy', name: 'Game Boy', description: 'Four greens, Bayer 4.', params: { method: 1, palette: 1, pixel: 3, levels: 4, contrast: 1.15, hue: .6 } },
      { id: 'one-bit', name: '1-bit', description: 'Black and white Bayer 8.', params: { method: 0, palette: 0, pixel: 2, levels: 2, contrast: 1.2, hue: .6 } },
      { id: 'cga', name: 'CGA', description: 'Cyan / magenta / white on black.', params: { method: 0, palette: 2, pixel: 3, levels: 4, contrast: 1.1, hue: .6 } },
      { id: 'eight-bit', name: '8-bit', description: 'Quantised source colour with ordered dither.', params: { method: 0, palette: 5, pixel: 2, levels: 6, contrast: 1, hue: .6 } },
    ],
    glsl: K + `float bayer4(vec2 p){ int x=int(mod(p.x,4.0)), y=int(mod(p.y,4.0)); int idx=(y*4+x); int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5; float v=0.0; for(int i=0;i<16;i++){ if(i==idx) v=float(m[i]); } return (v+0.5)/16.0; } float bayer8(vec2 p){ float a=bayer4(p), b=bayer4(floor(p/2.0)); return (a*0.75+b*0.25); } vec3 pal(float t, float p, float hue, vec3 src, float lv){ if(p<.5) return vec3(step(0.5,t)); if(p<1.5){ vec3 c0=vec3(0.06,0.22,0.06), c1=vec3(0.19,0.38,0.19), c2=vec3(0.55,0.67,0.06), c3=vec3(0.61,0.74,0.06); float k=floor(t*3.999); return k<1.0?c0:(k<2.0?c1:(k<3.0?c2:c3)); } if(p<2.5){ float k=floor(t*3.999); return k<1.0?vec3(0.0):(k<2.0?vec3(0.33,1.0,1.0):(k<3.0?vec3(1.0,0.33,1.0):vec3(1.0))); } if(p<3.5){ vec3 q=floor(src*2.99)/2.99; return q; } if(p<4.5){ return mix(bhue(hue)*0.15, mix(bhue(hue),vec3(1.0),0.6), t); } return floor(src*(lv-1.0)+0.5)/(lv-1.0); } vec4 fx(vec2 uv){ vec2 g=floor(uv*uResolution/P2); vec2 cuv=(g+0.5)*P2/uResolution; vec4 b=inp(cuv); vec3 c=clamp((b.rgb-0.5)*P4+0.5,0.0,1.0); float th; if(P0<.5) th=bayer8(g); else if(P0<1.5) th=bayer4(g); else if(P0<2.5) th=0.5; else th=bh21(g); float lv=max(2.0,floor(P3+0.5)); float l=bluma(c); float t=floor(l*(lv-1.0)+th)/(lv-1.0); vec3 srcQ=floor(c*(lv-1.0)+th)/(lv-1.0); vec3 o=pal(t,P1,P5,srcQ,lv); return vec4(o,b.a); }`,
  }),
  l({
    id: 'glofi', name: 'Glo Fi', version: 1,
    summary: 'Self-animating fractal glow: a flowing noise field lifts and colours the highlights with streaks — the Universe Glo Fi / Quantum family.',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 2, default: .8, step: .01 },
      { key: 'threshold', label: 'Threshold', min: 0, max: 1, default: .4, step: .01 },
      { key: 'scale', label: 'Pattern Scale', min: .5, max: 8, default: 3, step: .1 },
      { key: 'speed', label: 'Speed', min: 0, max: 3, default: .5, step: .01 },
      { key: 'streak', label: 'Streak', min: 0, max: 60, default: 20, step: 1, unit: 'px' },
      { key: 'hueA', label: 'Colour A', min: 0, max: 1, default: .55, step: .005 },
      { key: 'hueB', label: 'Colour B', min: 0, max: 1, default: .85, step: .005 },
    ],
    presets: [
      { id: 'aurora-glow', name: 'Aurora Glow', description: 'Cyan-magenta flowing highlights.', params: { intensity: .8, threshold: .4, scale: 3, speed: .5, streak: 20, hueA: .55, hueB: .85 } },
      { id: 'quantum', name: 'Quantum Trails', description: 'Long streaks and fast flow.', params: { intensity: 1.2, threshold: .55, scale: 5, speed: 1.4, streak: 50, hueA: .6, hueB: .1 } },
      { id: 'ember-fi', name: 'Ember Fi', description: 'Warm slow glow.', params: { intensity: .6, threshold: .35, scale: 2, speed: .2, streak: 8, hueA: .05, hueB: .12 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 px=1.0/uResolution; vec3 acc=vec3(0.0); float w=0.0; for(int i=-6;i<=6;i++){ float k=float(i)/6.0; vec3 s=inp(uv+vec2(k*P4*px.x,0.0)).rgb; float g=exp(-k*k*2.0); acc+=max(s-P2,0.0)*g; w+=g; } acc/=w; float n=bfbm(uv*P2+vec2(uTime*P3*0.3,uTime*P3*0.17)); vec3 col=mix(bhue(P5),bhue(P6),n); vec3 glow=acc*col*P0*2.2*(0.5+n); vec3 o=b.rgb+glow-b.rgb*glow*0.4; return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  d({
    id: 'heatwave', name: 'Heatwave', version: 1,
    summary: 'Rising heat shimmer: flowing refraction with optional blur, strongest where a gradient or mask says.',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 30, default: 8, step: .5, unit: 'px' },
      { key: 'size', label: 'Heat Size', min: .5, max: 10, default: 3, step: .1 },
      { key: 'speed', label: 'Rise Speed', min: 0, max: 3, default: .8, step: .01 },
      { key: 'detail', label: 'Detail', min: 0, max: 1, default: .5, step: .01 },
      { key: 'blur', label: 'Blur', min: 0, max: 8, default: 1.5, step: .5, unit: 'px' },
      { key: 'bias', label: 'Vertical Bias', min: -1, max: 1, default: .4, step: .01 },
    ],
    presets: [
      { id: 'road', name: 'Road Mirage', description: 'Strong at the bottom of frame.', params: { intensity: 10, size: 4, speed: .6, detail: .4, blur: 2, bias: .8 } },
      { id: 'fire', name: 'Fire Rise', description: 'Fast fine shimmer everywhere.', params: { intensity: 6, size: 6, speed: 2, detail: .8, blur: 1, bias: 0 } },
      { id: 'subtle', name: 'Subtle Air', description: 'Barely-there refraction.', params: { intensity: 3, size: 2, speed: .4, detail: .3, blur: .5, bias: .2 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 p=vec2(uv.x*asp,uv.y)*P1; float t=uTime*P2; float n1=bfbm(p+vec2(0.0,-t)); float n2=bfbm(p*1.7+vec2(3.1,-t*1.3)); vec2 off=(vec2(n1,n2)-0.5)*mix(1.0,2.0,P3); float region=P5>=0.0?mix(1.0,1.0-uv.y,P5):mix(1.0,uv.y,-P5); vec2 d=off*P0/uResolution*region; vec3 acc=vec3(0.0); for(int i=-2;i<=2;i++){ acc+=inp(uv+d+vec2(0.0,float(i))*P4/uResolution.y*0.5).rgb; } vec4 b=inp(uv+d); return vec4(mix(b.rgb,acc/5.0,step(0.01,P4)),b.a); }`,
  }),
  s({
    id: 'chromatown', name: 'ChromaTown', version: 1,
    summary: 'Chromatic streak warp: the picture smears into rainbow bands from a start to an end transform — the Universe ChromaTown look.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, default: .5, step: .01 },
      { key: 'angle', label: 'Streak Angle', min: -180, max: 180, default: 0, step: 1, unit: 'deg' },
      { key: 'length', label: 'Length', min: 0, max: 200, default: 60, step: 1, unit: 'px' },
      { key: 'zoom', label: 'Zoom Streak', min: -.3, max: .3, default: 0, step: .005 },
      { key: 'colorful', label: 'Colourfulness', min: 0, max: 1, default: .8, step: .01 },
      { key: 'samples', label: 'Steps', min: 4, max: 24, default: 12, step: 1 },
    ],
    presets: [
      { id: 'rainbow-smear', name: 'Rainbow Smear', description: 'Horizontal spectral streak.', params: { amount: .6, angle: 0, length: 80, zoom: 0, colorful: .9, samples: 16 } },
      { id: 'zoom-prism', name: 'Zoom Prism', description: 'Radial spectral zoom.', params: { amount: .5, angle: 0, length: 0, zoom: .12, colorful: .8, samples: 16 } },
      { id: 'subtle-chroma', name: 'Subtle Chroma', description: 'Light diagonal fringe.', params: { amount: .3, angle: 45, length: 25, zoom: 0, colorful: .6, samples: 8 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float a=radians(P1); vec2 dir=vec2(cos(a),sin(a))*P2/uResolution; int n=int(clamp(P5,4.0,24.0)+0.5); vec3 acc=vec3(0.0); vec3 wsum=vec3(0.0); for(int i=0;i<24;i++){ if(i>=n) break; float t=float(i)/float(n-1); vec2 q=uv+dir*(t-0.5)+(uv-0.5)*P3*(t-0.5); vec3 wgt=mix(vec3(1.0),bhue(t*0.8),P4); acc+=inp(q).rgb*wgt; wsum+=wgt; } vec3 o=acc/max(wsum,vec3(1e-4)); return vec4(mix(b.rgb,o,P0),b.a); }`,
  }),
  s({
    id: 'sketchify', name: 'Sketchify', version: 1,
    summary: 'Ink-line sketch with smoothed colour fill or paper — pencil, ink-and-wash, comic ink and blueprint presets.',
    params: [
      { key: 'ink', label: 'Ink', min: 0, max: 2, default: 1, step: .01 },
      { key: 'thick', label: 'Line Thickness', min: .5, max: 4, default: 1.2, step: .1, unit: 'px' },
      { key: 'fill', label: 'Colour Fill', min: 0, max: 1, default: .7, step: .01 },
      { key: 'smooth', label: 'Fill Smoothing', min: 0, max: 6, default: 2, step: .5, unit: 'px' },
      { key: 'paper', label: 'Paper', min: 0, max: 1, default: .3, step: .01 },
      { key: 'style', label: 'Style (0 ink · 1 pencil · 2 blueprint)', min: 0, max: 2, default: 0, step: 1 },
    ],
    presets: [
      { id: 'ink-wash', name: 'Ink & Wash', description: 'Black ink lines over washed colour.', params: { ink: 1.1, thick: 1.2, fill: .7, smooth: 2, paper: .3, style: 0 } },
      { id: 'pencil', name: 'Pencil', description: 'Grey graphite lines on paper, no colour.', params: { ink: 1, thick: 1.5, fill: 0, smooth: 1, paper: .8, style: 1 } },
      { id: 'blueprint', name: 'Blueprint', description: 'White lines on blue.', params: { ink: 1.4, thick: 1, fill: 0, smooth: 0, paper: 1, style: 2 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec2 px=P1/uResolution; float l00=bluma(inp(uv-px).rgb), l10=bluma(inp(uv+vec2(0.0,-px.y)).rgb), l20=bluma(inp(uv+vec2(px.x,-px.y)).rgb), l01=bluma(inp(uv+vec2(-px.x,0.0)).rgb), l21=bluma(inp(uv+vec2(px.x,0.0)).rgb), l02=bluma(inp(uv+vec2(-px.x,px.y)).rgb), l12=bluma(inp(uv+vec2(0.0,px.y)).rgb), l22=bluma(inp(uv+px).rgb); float gx=-l00-2.0*l01-l02+l20+2.0*l21+l22, gy=-l00-2.0*l10-l20+l02+2.0*l12+l22; float edge=clamp(length(vec2(gx,gy))*P0*2.0,0.0,1.0); vec3 acc=vec3(0.0); float w=0.0; for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){ float g=exp(-float(i*i+j*j)/3.0); acc+=inp(uv+vec2(float(i),float(j))*P3/uResolution).rgb*g; w+=g; } vec3 fillc=acc/w; vec3 paper=vec3(0.96,0.94,0.88)*(0.94+0.06*bnoise(uv*uResolution*0.15)); vec3 base; vec3 ink; if(P5<.5){ base=mix(mix(vec3(1.0),paper,P4),fillc,P2); ink=vec3(0.05); } else if(P5<1.5){ base=mix(vec3(1.0),paper,P4); base=mix(base,fillc,P2); ink=vec3(0.25); edge*=0.7+0.3*bnoise(uv*uResolution*0.5); } else { base=vec3(0.08,0.2,0.5); ink=vec3(0.95); } vec3 o=mix(base,ink,edge); return vec4(o,inp(uv).a); }`,
  }),
  l({
    id: 'muzzleflash', name: 'Muzzle Flash', version: 1,
    summary: 'Gun muzzle flash at a point (bindable to a track): petal burst, core, smoke puff and a scene light kick, triggered by a keyframed intensity.',
    params: [
      { key: 'x', label: 'X', min: -.2, max: 1.2, default: .5, step: .002 },
      { key: 'y', label: 'Y', min: -.2, max: 1.2, default: .5, step: .002 },
      { key: 'intensity', label: 'Intensity (keyframe 0→1→0)', min: 0, max: 1, default: 0, step: .01 },
      { key: 'size', label: 'Size', min: .02, max: .6, default: .18, step: .005 },
      { key: 'petals', label: 'Petals', min: 0, max: 8, default: 5, step: 1 },
      { key: 'angle', label: 'Aim', min: -180, max: 180, default: 0, step: 1, unit: 'deg' },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .08, step: .005 },
      { key: 'light', label: 'Scene Light', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'pistol', name: 'Pistol', description: 'Small round flash.', params: { x: .5, y: .5, intensity: 1, size: .12, petals: 0, angle: 0, hue: .08, light: .4 } },
      { id: 'rifle', name: 'Rifle (compensator)', description: 'Five-petal flash.', params: { x: .5, y: .5, intensity: 1, size: .2, petals: 5, angle: 0, hue: .07, light: .6 } },
      { id: 'sci-fi', name: 'Plasma', description: 'Cyan energy flash.', params: { x: .5, y: .5, intensity: 1, size: .16, petals: 3, angle: 0, hue: .52, light: .7 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); if(P2<=0.001) return b; float asp=uResolution.x/uResolution.y; vec2 p=(uv-vec2(P0,P1))*vec2(asp,1.0); float a=radians(P5); p=vec2(cos(a)*p.x+sin(a)*p.y, -sin(a)*p.x+cos(a)*p.y); float r=length(p)/P3; float ang=atan(p.y,p.x); float n=bfbm(p*8.0/P3+uTime*40.0); float core=exp(-r*r*6.0)*1.5; float petal=P4>0.5?pow(abs(cos(ang*P4*0.5)),3.0)*exp(-r*1.8)*(0.6+0.4*n):0.0; float forward=exp(-pow((p.x/P3-1.2),2.0)*2.0)*exp(-abs(p.y)/P3*4.0)*0.8; float k=(core+petal+forward)*P2; vec3 col=mix(bhue(P6),vec3(1.0),clamp(core,0.0,1.0)); vec3 flash=col*k; float smoke=exp(-r*0.8)*n*0.25*P2; vec3 o=b.rgb*(1.0+P7*P2*0.6*exp(-length((uv-vec2(P0,P1))*vec2(asp,1.0))*1.5))+flash-b.rgb*flash*0.3; o=mix(o,vec3(0.5),smoke*0.3); return vec4(clamp(o,0.0,1.0),max(b.a,clamp(k,0.0,1.0))); }`,
  }),
];
