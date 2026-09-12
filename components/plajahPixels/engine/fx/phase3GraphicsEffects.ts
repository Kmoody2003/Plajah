// phase3GraphicsEffects.ts — MOTION-GRAPHICS generators and light scenes from the Universe /
// Sapphire catalog: Array Gun (shape grids), HUD rings, Progress bar, Long Shadow, Luster bevel,
// Laser beam / Zap-to-point, Aurora, Night Sky / Luna. Generators composite over the clip.
import type { FxEffect } from './effects';

const K = `
float gh21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float gnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(gh21(i),gh21(i+vec2(1,0)),f.x),mix(gh21(i+vec2(0,1)),gh21(i+vec2(1,1)),f.x),f.y); }
float gfbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*gnoise(p); p=p*2.02+13.1; a*=0.5; } return v; }
vec3 ghue(float h){ return hsv2rgb(vec3(fract(h),0.85,1.0)); }
vec2 grot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x-s*p.y, s*p.x+c*p.y); }
float gluma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
`;
const g = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'generator' });
const s = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'stylize' });
const l = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'light' });

export const PHASE3_GRAPHICS_EFFECTS: FxEffect[] = [
  g({
    id: 'arraygun', name: 'Array Gun', version: 1,
    summary: 'Animated grids of shapes (dots, rings, squares, crosses, triangles) with a radial effector that scales and staggers them.',
    params: [
      { key: 'columns', label: 'Columns', min: 2, max: 60, default: 16, step: 1 },
      { key: 'shape', label: 'Shape (0 dot · 1 ring · 2 square · 3 cross · 4 triangle · 5 line)', min: 0, max: 5, default: 0, step: 1 },
      { key: 'size', label: 'Size', min: .05, max: 1, default: .35, step: .01 },
      { key: 'effector', label: 'Effector Radius', min: 0, max: 1.5, default: .5, step: .01 },
      { key: 'ex', label: 'Effector X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'ey', label: 'Effector Y', min: 0, max: 1, default: .5, step: .005 },
      { key: 'hue', label: 'Colour (<0 white)', min: -1, max: 1, default: -1, step: .01 },
      { key: 'speed', label: 'Animate', min: 0, max: 4, default: .5, step: .05 },
    ],
    presets: [
      { id: 'dot-matrix', name: 'Dot Matrix', description: 'Dots that grow toward the effector.', params: { columns: 20, shape: 0, size: .35, effector: .5, ex: .5, ey: .5, hue: -1, speed: .5 } },
      { id: 'ring-wave', name: 'Ring Wave', description: 'Rings pulsing outward.', params: { columns: 12, shape: 1, size: .5, effector: .8, ex: .5, ey: .5, hue: .55, speed: 1.2 } },
      { id: 'cross-grid', name: 'Cross Grid', description: 'Static technical cross grid.', params: { columns: 24, shape: 3, size: .3, effector: 0, ex: .5, ey: .5, hue: -1, speed: 0 } },
      { id: 'tri-field', name: 'Triangle Field', description: 'Rotating triangles.', params: { columns: 14, shape: 4, size: .45, effector: .6, ex: .3, ey: .6, hue: .08, speed: .8 } },
    ],
    glsl: K + `float gshape(vec2 f, float sh, float r, float rot){ f=grot(f,rot); if(sh<.5) return 1.0-smoothstep(r-0.02,r+0.02,length(f)); if(sh<1.5){ float d=abs(length(f)-r*0.8); return 1.0-smoothstep(r*0.12,r*0.2,d); } if(sh<2.5) return 1.0-smoothstep(r-0.02,r+0.02,max(abs(f.x),abs(f.y))); if(sh<3.5){ float c=min(abs(f.x),abs(f.y)); return (1.0-smoothstep(r*0.12,r*0.2,c))*step(max(abs(f.x),abs(f.y)),r); } if(sh<4.5){ vec2 q=vec2(abs(f.x),f.y); float d=max(q.x*0.866+q.y*0.5, -q.y); return 1.0-smoothstep(r*0.5-0.02,r*0.5+0.02,d); } return (1.0-smoothstep(r*0.08,r*0.14,abs(f.y)))*step(abs(f.x),r); } vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; float n=max(2.0,floor(P0+.5)); vec2 gg=vec2(uv.x*asp,uv.y)*n/asp; vec2 id=floor(gg); vec2 f=fract(gg)-0.5; vec2 centre=(id+0.5)/n*asp; vec2 e=vec2(P4*asp,P5); float d=length(centre-e); float ef=P3>0.0?1.0-smoothstep(0.0,P3,d):1.0; float pulse=0.5+0.5*sin(uTime*P7*3.0-d*6.0); float r=P2*0.5*(0.25+0.75*mix(1.0,ef*(0.6+0.4*pulse),step(0.001,P3))); float rot=uTime*P7*0.5+d*2.0; float k=gshape(f,P1,r,rot); vec3 col=P6<0.0?vec3(1.0):ghue(P6+d*0.15); vec3 o=b.rgb+col*k-b.rgb*col*k; return vec4(clamp(o,0.0,1.0),max(b.a,k)); }`,
  }),
  g({
    id: 'hudrings', name: 'HUD Rings', version: 1,
    summary: 'Sci-fi HUD: concentric rings, tick marks, arcs and a sweeping radar line around a point you can track.',
    params: [
      { key: 'cx', label: 'Centre X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'cy', label: 'Centre Y', min: 0, max: 1, default: .5, step: .005 },
      { key: 'radius', label: 'Radius', min: .05, max: 1, default: .3, step: .005 },
      { key: 'rings', label: 'Rings', min: 1, max: 8, default: 3, step: 1 },
      { key: 'ticks', label: 'Ticks', min: 0, max: 120, default: 36, step: 1 },
      { key: 'sweep', label: 'Sweep Speed', min: -3, max: 3, default: .6, step: .05 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .52, step: .005 },
      { key: 'glow', label: 'Glow', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'radar', name: 'Radar', description: 'Three rings, sweeping line, cyan.', params: { cx: .5, cy: .5, radius: .3, rings: 3, ticks: 36, sweep: .6, hue: .52, glow: .5 } },
      { id: 'targeting', name: 'Targeting', description: 'Tight orange reticle with fast ticks.', params: { cx: .5, cy: .5, radius: .15, rings: 2, ticks: 72, sweep: 2, hue: .07, glow: .4 } },
      { id: 'iris', name: 'Iris', description: 'Many rings, slow rotation, violet.', params: { cx: .5, cy: .5, radius: .4, rings: 7, ticks: 24, sweep: -.3, hue: .75, glow: .7 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 p=(uv-vec2(P0,P1))*vec2(asp,1.0); float r=length(p)/P2; float ang=atan(p.y,p.x); float k=0.0; int n=int(clamp(P3,1.0,8.0)+0.5); for(int i=1;i<=8;i++){ if(i>n) break; float rr=float(i)/float(n); float d=abs(r-rr); float wdt=0.006/P2; k=max(k,1.0-smoothstep(wdt,wdt*2.5,d)); float dash=step(0.4,fract((ang+uTime*P5*(mod(float(i),2.0)*2.0-1.0)*0.5)*float(i)*2.0/6.2831*4.0)); if(i<n) k*= mix(1.0,dash,0.5); } float tk=0.0; if(P4>0.5){ float ta=fract(ang/6.2831*P4); float tw=1.0-smoothstep(0.03,0.08,min(ta,1.0-ta)); tk=tw*(1.0-smoothstep(0.02,0.06,abs(r-1.0)))*step(0.94,r)*step(r,1.08); } float sw=fract((ang-uTime*P5)/6.2831); float sweep=pow(1.0-sw,6.0)*step(r,1.0)*0.6; float dotc=1.0-smoothstep(0.02,0.05,r); float m=clamp(k+tk+sweep+dotc,0.0,1.0); vec3 col=ghue(P6); vec3 glow=col*P7*exp(-abs(r-1.0)*12.0)*0.35; vec3 o=b.rgb+col*m+glow-b.rgb*col*m; return vec4(clamp(o,0.0,1.0),max(b.a,m)); }`,
  }),
  g({
    id: 'progressbar', name: 'Progress Bar', version: 1,
    summary: 'Animated progress: linear bar, arc or ring with a fill percentage you keyframe or drive from a track.',
    params: [
      { key: 'progress', label: 'Progress', min: 0, max: 1, default: .6, step: .005 },
      { key: 'style', label: 'Style (0 bar · 1 arc · 2 ring · 3 segments)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'x', label: 'X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'y', label: 'Y', min: 0, max: 1, default: .85, step: .005 },
      { key: 'length', label: 'Length', min: .05, max: 1, default: .5, step: .005 },
      { key: 'thick', label: 'Thickness', min: .005, max: .2, default: .03, step: .0025 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .35, step: .005 },
      { key: 'track', label: 'Track Opacity', min: 0, max: 1, default: .25, step: .01 },
    ],
    presets: [
      { id: 'lower-bar', name: 'Lower Bar', description: 'Green bar near the bottom.', params: { progress: .6, style: 0, x: .5, y: .85, length: .5, thick: .03, hue: .35, track: .25 } },
      { id: 'ring', name: 'Ring', description: 'Circular progress ring.', params: { progress: .7, style: 2, x: .5, y: .5, length: .25, thick: .04, hue: .55, track: .2 } },
      { id: 'segments', name: 'Segments', description: 'Ten-segment loading bar.', params: { progress: .4, style: 3, x: .5, y: .8, length: .6, thick: .04, hue: .08, track: .3 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 p=(uv-vec2(P2,P3))*vec2(asp,1.0); float fill=0.0, track=0.0; if(P1<.5||P1>2.5){ float hx=P4*0.5; float inside=step(abs(p.x),hx)*step(abs(p.y),P5*0.5); float t=(p.x+hx)/(2.0*hx); track=inside; float f=step(t,P0); if(P1>2.5){ float seg=fract(t*10.0); f*=step(0.12,seg); track*=step(0.12,seg); } fill=inside*f; } else { float r=length(p); float ring=1.0-smoothstep(P5*0.5,P5*0.5+0.004,abs(r-P4)); float a=fract((atan(p.y,p.x)+1.5708)/6.2831); if(P1<1.5){ a=fract(a+0.375)/0.75; ring*=step(a,1.0); } track=ring; fill=ring*step(a,P0); } vec3 col=ghue(P6); vec3 o=mix(b.rgb,mix(b.rgb,col*0.6,P7),track); o=mix(o,col,fill); return vec4(clamp(o,0.0,1.0),max(b.a,max(fill,track*P7))); }`,
  }),
  s({
    id: 'longshadow', name: 'Long Shadow', version: 1,
    summary: 'Extruded flat-design shadow from the layer alpha or bright graphics, at any angle and length.',
    params: [
      { key: 'length', label: 'Length', min: 0, max: 400, default: 120, step: 1, unit: 'px' },
      { key: 'angle', label: 'Angle', min: 0, max: 360, default: 45, step: 1, unit: 'deg' },
      { key: 'opacity', label: 'Opacity', min: 0, max: 1, default: .5, step: .01 },
      { key: 'fade', label: 'Fade', min: 0, max: 1, default: .5, step: .01 },
      { key: 'source', label: 'Source (0 alpha · 1 luma)', min: 0, max: 1, default: 0, step: 1 },
      { key: 'threshold', label: 'Luma Threshold', min: 0, max: 1, default: .6, step: .01 },
    ],
    presets: [
      { id: 'flat-45', name: 'Flat 45°', description: 'The classic flat-design shadow.', params: { length: 120, angle: 45, opacity: .45, fade: .4, source: 0, threshold: .6 } },
      { id: 'title-drop', name: 'Title Drop', description: 'Short strong shadow for titles.', params: { length: 40, angle: 60, opacity: .7, fade: .1, source: 0, threshold: .6 } },
      { id: 'luma-extrude', name: 'Luma Extrude', description: 'Extrudes bright graphics on footage.', params: { length: 160, angle: 30, opacity: .5, fade: .7, source: 1, threshold: .7 } },
    ],
    glsl: K + `float cov(vec2 uv){ vec4 c=inp(uv); return P4<.5?c.a:smoothstep(P5-0.05,P5+0.05,gluma(c.rgb)); } vec4 fx(vec2 uv){ vec4 b=inp(uv); float a=radians(P1); vec2 dir=vec2(cos(a),-sin(a))/uResolution; float sh=0.0; for(int i=1;i<=24;i++){ float t=float(i)/24.0; float k=cov(uv-dir*P0*t); sh=max(sh,k*(1.0-t*P3)); } float own=P4<.5?b.a:smoothstep(P5-0.05,P5+0.05,gluma(b.rgb)); float shadow=sh*(1.0-own)*P2; vec3 o=mix(b.rgb,vec3(0.0),shadow); return vec4(o,max(b.a,shadow)); }`,
  }),
  s({
    id: 'luster', name: 'Luster', version: 1,
    summary: 'Chrome / gold bevel on graphics and titles: edge-derived relief with a reflection gradient and highlight.',
    params: [
      { key: 'bevel', label: 'Bevel Size', min: 1, max: 30, default: 8, step: .5, unit: 'px' },
      { key: 'metal', label: 'Metal (0 chrome · 1 gold · 2 copper · 3 hue)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'hue', label: 'Custom Hue', min: 0, max: 1, default: .6, step: .005 },
      { key: 'light', label: 'Light Angle', min: 0, max: 360, default: 120, step: 1, unit: 'deg' },
      { key: 'shine', label: 'Shine', min: 0, max: 1, default: .7, step: .01 },
      { key: 'source', label: 'Source (0 alpha · 1 luma)', min: 0, max: 1, default: 0, step: 1 },
    ],
    presets: [
      { id: 'chrome', name: 'Chrome', description: 'Cold 80s chrome.', params: { bevel: 8, metal: 0, hue: .6, light: 120, shine: .8, source: 0 } },
      { id: 'gold', name: 'Gold', description: 'Warm polished gold.', params: { bevel: 10, metal: 1, hue: .6, light: 110, shine: .7, source: 0 } },
      { id: 'neon-metal', name: 'Neon Metal', description: 'Coloured metal from a custom hue.', params: { bevel: 6, metal: 3, hue: .85, light: 140, shine: .9, source: 0 } },
    ],
    glsl: K + `float lcov(vec2 uv){ vec4 c=inp(uv); return P5<.5?c.a:smoothstep(0.5,0.7,gluma(c.rgb)); } vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 px=P0/uResolution; float c0=lcov(uv); if(c0<0.02) return b; float gx=lcov(uv+vec2(px.x,0.))-lcov(uv-vec2(px.x,0.)); float gy=lcov(uv+vec2(0.,px.y))-lcov(uv-vec2(0.,px.y)); vec3 nrm=normalize(vec3(-gx*3.0,-gy*3.0,1.0)); float a=radians(P3); vec3 L=normalize(vec3(cos(a),sin(a),0.6)); float diff=max(0.0,dot(nrm,L)); float spec=pow(max(0.0,dot(reflect(-L,nrm),vec3(0.0,0.0,1.0))),24.0)*P4; float band=nrm.y*0.5+0.5; vec3 base; if(P1<.5) base=mix(vec3(0.15,0.18,0.25),vec3(0.9,0.95,1.0),band); else if(P1<1.5) base=mix(vec3(0.35,0.2,0.02),vec3(1.0,0.85,0.35),band); else if(P1<2.5) base=mix(vec3(0.3,0.12,0.05),vec3(1.0,0.6,0.4),band); else base=mix(ghue(P2)*0.25,ghue(P2)*1.1,band); vec3 col=base*(0.35+0.65*diff)+spec; vec3 o=mix(b.rgb,col,c0); return vec4(o,b.a); }`,
  }),
  l({
    id: 'laserbeam', name: 'Laser Beam', version: 1,
    summary: 'A glowing laser from a start point to an end point (both bindable to tracks) with core, glow and optional pulse.',
    params: [
      { key: 'x1', label: 'Start X', min: -.5, max: 1.5, default: .1, step: .005 },
      { key: 'y1', label: 'Start Y', min: -.5, max: 1.5, default: .8, step: .005 },
      { key: 'x2', label: 'End X', min: -.5, max: 1.5, default: .7, step: .005 },
      { key: 'y2', label: 'End Y', min: -.5, max: 1.5, default: .3, step: .005 },
      { key: 'width', label: 'Width', min: .5, max: 40, default: 3, step: .5, unit: 'px' },
      { key: 'glow', label: 'Glow', min: 0, max: 1, default: .6, step: .01 },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: 0, step: .005 },
      { key: 'pulse', label: 'Pulse', min: 0, max: 20, default: 0, step: .5, unit: 'Hz' },
    ],
    presets: [
      { id: 'red-laser', name: 'Red Laser', description: 'Thin red beam with a soft glow.', params: { x1: .1, y1: .8, x2: .7, y2: .3, width: 3, glow: .6, hue: 0, pulse: 0 } },
      { id: 'plasma', name: 'Plasma Bolt', description: 'Thick cyan beam pulsing.', params: { x1: .1, y1: .5, x2: .9, y2: .5, width: 14, glow: .9, hue: .5, pulse: 6 } },
      { id: 'green-sight', name: 'Green Sight', description: 'Hair-thin green targeting beam.', params: { x1: 0, y1: .9, x2: .6, y2: .4, width: 1, glow: .3, hue: .33, pulse: 0 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 p=vec2(uv.x*asp,uv.y), a=vec2(P0*asp,P1), e=vec2(P2*asp,P3); vec2 ab=e-a; float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.0,1.0); float d=length(p-(a+ab*t))*uResolution.y; float core=1.0-smoothstep(P4*0.5,P4*0.5+1.0,d); float glow=exp(-d/(P4*1.5+6.0))*P5; float pulse=P7>0.0?0.7+0.3*sin(uTime*P7*6.2831):1.0; vec3 col=ghue(P6); vec3 beam=(vec3(1.0)*core+col*glow*1.2)*pulse; vec3 o=b.rgb+beam-b.rgb*beam; return vec4(clamp(o,0.0,1.0),max(b.a,clamp(core+glow,0.0,1.0))); }`,
  }),
  l({
    id: 'zaptopoint', name: 'Zap', version: 1,
    summary: 'Electric lightning bolt between two points with branching jitter and a glow — Sapphire Zap / BCC Lightning.',
    params: [
      { key: 'x1', label: 'Start X', min: -.5, max: 1.5, default: .2, step: .005 },
      { key: 'y1', label: 'Start Y', min: -.5, max: 1.5, default: .2, step: .005 },
      { key: 'x2', label: 'End X', min: -.5, max: 1.5, default: .8, step: .005 },
      { key: 'y2', label: 'End Y', min: -.5, max: 1.5, default: .8, step: .005 },
      { key: 'wander', label: 'Wander', min: 0, max: .3, default: .08, step: .005 },
      { key: 'width', label: 'Width', min: .5, max: 20, default: 2.5, step: .5, unit: 'px' },
      { key: 'hue', label: 'Colour', min: 0, max: 1, default: .6, step: .005 },
      { key: 'speed', label: 'Flicker', min: 0, max: 60, default: 24, step: 1, unit: 'Hz' },
    ],
    presets: [
      { id: 'blue-bolt', name: 'Blue Bolt', description: 'Classic electric blue.', params: { x1: .2, y1: .2, x2: .8, y2: .8, wander: .08, width: 2.5, hue: .6, speed: 24 } },
      { id: 'tesla', name: 'Tesla', description: 'Violet, wide wander, fast flicker.', params: { x1: .5, y1: .1, x2: .5, y2: .9, wander: .18, width: 2, hue: .75, speed: 48 } },
      { id: 'ember-arc', name: 'Ember Arc', description: 'Orange slow-moving arc.', params: { x1: .1, y1: .5, x2: .9, y2: .5, wander: .05, width: 4, hue: .07, speed: 8 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 p=vec2(uv.x*asp,uv.y), a=vec2(P0*asp,P1), e=vec2(P2*asp,P3); vec2 ab=e-a; float len=max(length(ab),1e-4); vec2 dir=ab/len, perp=vec2(-dir.y,dir.x); float t=clamp(dot(p-a,dir)/len,0.0,1.0); float seed=floor(uTime*max(P7,0.001)); float off=(gfbm(vec2(t*6.0,seed*7.3))-0.5)*2.0*P4+(gnoise(vec2(t*30.0,seed*3.1))-0.5)*P4*0.6; off*=sin(t*3.14159); vec2 q=a+dir*t*len+perp*off; float d=length(p-q)*uResolution.y; float core=1.0-smoothstep(P5*0.5,P5*0.5+1.2,d); float glow=exp(-d/(P5*2.0+8.0))*0.8; float off2=(gfbm(vec2(t*9.0+4.0,seed*5.7))-0.5)*2.0*P4*0.7*sin(t*3.14159); float d2=length(p-(a+dir*t*len+perp*off2))*uResolution.y; float branch=(1.0-smoothstep(P5*0.3,P5*0.3+1.0,d2))*0.6*step(0.5,gh21(vec2(seed,1.0))); vec3 col=ghue(P6); vec3 bolt=vec3(1.0)*max(core,branch)+col*glow; vec3 o=b.rgb+bolt-b.rgb*bolt; return vec4(clamp(o,0.0,1.0),max(b.a,clamp(core+glow+branch,0.0,1.0))); }`,
  }),
  g({
    id: 'aurora', name: 'Aurora', version: 1,
    summary: 'Northern lights curtains: layered flowing bands with height falloff and colour drift, composited over the clip.',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 2, default: .8, step: .01 },
      { key: 'height', label: 'Height', min: .1, max: 1, default: .5, step: .01 },
      { key: 'speed', label: 'Speed', min: 0, max: 2, default: .3, step: .01 },
      { key: 'scale', label: 'Scale', min: .5, max: 6, default: 2, step: .1 },
      { key: 'hue', label: 'Hue', min: 0, max: 1, default: .38, step: .005 },
      { key: 'hueDrift', label: 'Hue Drift', min: 0, max: .5, default: .15, step: .005 },
    ],
    presets: [
      { id: 'green-curtain', name: 'Green Curtain', description: 'Classic green aurora.', params: { intensity: .8, height: .5, speed: .3, scale: 2, hue: .38, hueDrift: .15 } },
      { id: 'magenta-storm', name: 'Magenta Storm', description: 'Fast violet-magenta bands.', params: { intensity: 1.2, height: .7, speed: .8, scale: 3, hue: .8, hueDrift: .2 } },
      { id: 'faint-haze', name: 'Faint Haze', description: 'Subtle high haze.', params: { intensity: .35, height: .35, speed: .15, scale: 1.2, hue: .45, hueDrift: .1 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 acc=vec3(0.0); for(int i=0;i<3;i++){ float k=float(i); float x=uv.x*P3+k*3.7+uTime*P2*(0.3+k*0.2); float band=gfbm(vec2(x,k*2.0+uTime*P2*0.2)); float centre=0.15+band*P1; float y=uv.y; float dist=(y-centre); float curtain=exp(-abs(dist)*10.0/(P1+0.2))*smoothstep(-0.05,0.25,y)*(1.0-smoothstep(0.6,1.0,y)); float rays=0.6+0.4*gnoise(vec2(uv.x*40.0*P3+k*9.0,uTime*P2*2.0)); vec3 col=ghue(P4+P5*(y-0.3)+k*0.05); acc+=col*curtain*rays*(0.5+0.5*band); } acc*=P0*0.6; vec3 o=b.rgb+acc-b.rgb*acc*0.5; return vec4(clamp(o,0.0,1.0),max(b.a,clamp(gluma(acc),0.0,1.0))); }`,
  }),
  g({
    id: 'nightsky', name: 'Night Sky', version: 1,
    summary: 'Star field with twinkle, a Milky Way band and an optional moon (Luna) with soft halo, over the clip.',
    params: [
      { key: 'stars', label: 'Star Density', min: 0, max: 1, default: .5, step: .01 },
      { key: 'twinkle', label: 'Twinkle', min: 0, max: 1, default: .5, step: .01 },
      { key: 'milkyway', label: 'Milky Way', min: 0, max: 1, default: .4, step: .01 },
      { key: 'moon', label: 'Moon Size', min: 0, max: .3, default: .06, step: .005 },
      { key: 'mx', label: 'Moon X', min: 0, max: 1, default: .75, step: .005 },
      { key: 'my', label: 'Moon Y', min: 0, max: 1, default: .25, step: .005 },
      { key: 'phase', label: 'Moon Phase', min: 0, max: 1, default: .5, step: .01 },
      { key: 'drift', label: 'Drift', min: 0, max: 1, default: .05, step: .01 },
    ],
    presets: [
      { id: 'clear-night', name: 'Clear Night', description: 'Dense stars, faint galaxy, small moon.', params: { stars: .6, twinkle: .5, milkyway: .35, moon: .05, mx: .75, my: .25, phase: .5, drift: .05 } },
      { id: 'full-moon', name: 'Full Moon', description: 'Big bright moon, fewer stars.', params: { stars: .3, twinkle: .3, milkyway: .1, moon: .12, mx: .7, my: .3, phase: 1, drift: .02 } },
      { id: 'galaxy', name: 'Galaxy Core', description: 'Strong Milky Way band, no moon.', params: { stars: .8, twinkle: .6, milkyway: .9, moon: 0, mx: .5, my: .5, phase: .5, drift: .08 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 p=vec2(uv.x*asp,uv.y)+vec2(uTime*P7*0.02,0.0); vec3 acc=vec3(0.0); for(int L=0;L<2;L++){ float sc=mix(90.0,180.0,float(L)); vec2 g=p*sc; vec2 id=floor(g); vec2 f=fract(g)-0.5; float h=gh21(id+float(L)*11.0); if(h<P0*(0.35-float(L)*0.1)){ vec2 c=vec2(gh21(id*1.3),gh21(id*2.7))-0.5; float d=length(f-c*0.8); float tw=1.0-P1*0.5*(0.5+0.5*sin(uTime*(2.0+h*6.0)+h*30.0)); float sz=0.08+0.1*gh21(id*5.1)*(1.0-float(L)*0.5); float s=(1.0-smoothstep(sz,sz*2.5,d))*tw; vec3 col=mix(vec3(0.8,0.85,1.0),vec3(1.0,0.9,0.7),gh21(id*9.9)); acc+=col*s; } } float band=exp(-pow((uv.y-0.5-(uv.x-0.5)*0.4)*4.0,2.0))*gfbm(vec2(uv.x*6.0,uv.y*3.0))*P2; acc+=vec3(0.55,0.6,0.85)*band*0.5; if(P3>0.001){ vec2 mp=(uv-vec2(P4,P5))*vec2(asp,1.0); float r=length(mp)/P3; float disc=1.0-smoothstep(0.95,1.0,r); float shade=smoothstep(-0.2,0.6,mp.x/P3*(P6*2.0-1.0)+ (P6*2.0-1.0)*0.4); float lit=P6>0.98?1.0:clamp(mix(0.05,1.0,shade),0.0,1.0); float tex=0.85+0.15*gfbm(mp/P3*5.0+3.0); float halo=exp(-max(r-1.0,0.0)*3.0)*0.35; acc+=vec3(1.0,0.97,0.9)*(disc*lit*tex)+vec3(0.8,0.85,1.0)*halo; } vec3 o=b.rgb+acc-b.rgb*acc; return vec4(clamp(o,0.0,1.0),max(b.a,clamp(gluma(acc),0.0,1.0))); }`,
  }),
];
