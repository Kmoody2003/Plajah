// phase3CleanupEffects.ts — CLEANUP tools (BCC Wire Remover / Pixel Fixer / Remover-lite class).
// Wire Remover paints over a thin line (rig, wire, boom) by blending the pixels on either side of
// it; its endpoints bind to VectorTrack points so it follows the shot. Spot Fix heals a small disc
// from a ring of surrounding pixels; Clone Patch copies from an offset source region into a disc.
import type { FxEffect } from './effects';

const u = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'utility' });

export const PHASE3_CLEANUP_EFFECTS: FxEffect[] = [
  u({
    id: 'wireremover', name: 'Wire Remover', version: 1,
    summary: 'Removes a thin wire, rig line or boom by filling it from the pixels on both sides; bind the endpoints to a track to follow the shot.',
    params: [
      { key: 'x1', label: 'Start X', min: -.5, max: 1.5, default: .2, step: .002 },
      { key: 'y1', label: 'Start Y', min: -.5, max: 1.5, default: .5, step: .002 },
      { key: 'x2', label: 'End X', min: -.5, max: 1.5, default: .8, step: .002 },
      { key: 'y2', label: 'End Y', min: -.5, max: 1.5, default: .5, step: .002 },
      { key: 'width', label: 'Wire Width', min: .5, max: 40, default: 4, step: .5, unit: 'px' },
      { key: 'feather', label: 'Feather', min: 0, max: 20, default: 3, step: .5, unit: 'px' },
      { key: 'reach', label: 'Sample Reach', min: 1, max: 4, default: 1.5, step: .1 },
      { key: 'noise', label: 'Grain Match', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'thin-wire', name: 'Thin Wire', description: 'Hairline wire or fishing line.', params: { x1: .2, y1: .5, x2: .8, y2: .5, width: 2.5, feather: 2, reach: 1.5, noise: .3 } },
      { id: 'rig-bar', name: 'Rig Bar', description: 'Thicker rig or boom pole.', params: { x1: .2, y1: .5, x2: .8, y2: .5, width: 14, feather: 5, reach: 1.3, noise: .35 } },
      { id: 'cable', name: 'Cable', description: 'Medium cable with wider blend.', params: { x1: .2, y1: .5, x2: .8, y2: .5, width: 6, feather: 4, reach: 2, noise: .25 } },
    ],
    glsl: `float wrh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } vec4 fx(vec2 uv){ vec4 b=inp(uv); vec2 res=uResolution; vec2 p=uv*res, a=vec2(P0,P1)*res, e=vec2(P2,P3)*res; vec2 ab=e-a; float len=max(length(ab),1e-3); vec2 dir=ab/len, perp=vec2(-dir.y,dir.x); float t=dot(p-a,dir); float along=clamp(t,0.0,len); float d=abs(dot(p-a,perp)); float inSeg=step(0.0,t)*step(t,len); float hw=P4*0.5; float m=(1.0-smoothstep(hw,hw+P5,d))*inSeg; if(m<=0.001) return b; float side=sign(dot(p-a,perp)); vec2 q1=(a+dir*along+perp*(hw+P5)*P6)/res, q2=(a+dir*along-perp*(hw+P5)*P6)/res; vec4 c1=inp(q1), c2=inp(q2); float w=clamp(0.5+dot(p-a,perp)/(2.0*(hw+P5)*P6),0.0,1.0); vec3 fill=mix(c2.rgb,c1.rgb,w); float g=(wrh(p)-0.5)*P7*0.06; fill+=g; return vec4(mix(b.rgb,fill,m),b.a); }`,
  }),
  u({
    id: 'spotfix', name: 'Spot Fix', version: 1,
    summary: 'Heals a small blemish, sensor dust spot or marker by blending a ring of surrounding pixels into a disc — position bindable to a track.',
    params: [
      { key: 'x', label: 'X', min: 0, max: 1, default: .5, step: .002 },
      { key: 'y', label: 'Y', min: 0, max: 1, default: .5, step: .002 },
      { key: 'radius', label: 'Radius', min: 1, max: 120, default: 14, step: .5, unit: 'px' },
      { key: 'feather', label: 'Feather', min: 0, max: 40, default: 6, step: .5, unit: 'px' },
      { key: 'ring', label: 'Sample Ring', min: 1.05, max: 3, default: 1.4, step: .05 },
      { key: 'noise', label: 'Grain Match', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'dust', name: 'Sensor Dust', description: 'Small soft spot.', params: { x: .5, y: .5, radius: 10, feather: 5, ring: 1.5, noise: .3 } },
      { id: 'marker', name: 'Tracking Marker', description: 'Mid-size patch, tight ring.', params: { x: .5, y: .5, radius: 22, feather: 6, ring: 1.3, noise: .35 } },
      { id: 'blemish', name: 'Skin Blemish', description: 'Tiny, very soft.', params: { x: .5, y: .5, radius: 6, feather: 6, ring: 1.6, noise: .15 } },
    ],
    glsl: `float sfh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 c=vec2(P0,P1); vec2 d=(uv-c)*vec2(asp,1.0); float r=length(d)*uResolution.y; float m=1.0-smoothstep(P2,P2+P3,r); if(m<=0.001) return b; vec3 acc=vec3(0.0); float w=0.0; float R=(P2+P3)*P4/uResolution.y; for(int i=0;i<12;i++){ float ang=float(i)*0.5236; vec2 o=vec2(cos(ang)/asp,sin(ang))*R; vec2 s=c+o; float wk=1.0/(1.0+length((d-o*vec2(asp,1.0)))*uResolution.y*0.05); acc+=inp(s).rgb*wk; w+=wk; } vec3 fill=acc/max(w,1e-4); fill+=(sfh(uv*uResolution)-0.5)*P5*0.06; return vec4(mix(b.rgb,fill,m),b.a); }`,
  }),
  u({
    id: 'clonepatch', name: 'Clone Patch', version: 1,
    summary: 'Copies a disc of picture from an offset source position over a target — the clone stamp, with both points bindable to tracks.',
    params: [
      { key: 'x', label: 'Target X', min: 0, max: 1, default: .5, step: .002 },
      { key: 'y', label: 'Target Y', min: 0, max: 1, default: .5, step: .002 },
      { key: 'sx', label: 'Source X', min: 0, max: 1, default: .6, step: .002 },
      { key: 'sy', label: 'Source Y', min: 0, max: 1, default: .5, step: .002 },
      { key: 'radius', label: 'Radius', min: 2, max: 200, default: 30, step: 1, unit: 'px' },
      { key: 'feather', label: 'Feather', min: 0, max: 80, default: 10, step: 1, unit: 'px' },
      { key: 'opacity', label: 'Opacity', min: 0, max: 1, default: 1, step: .01 },
      { key: 'matchLuma', label: 'Match Brightness', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'stamp', name: 'Clone Stamp', description: 'Straight copy with a soft edge.', params: { x: .5, y: .5, sx: .6, sy: .5, radius: 30, feather: 10, opacity: 1, matchLuma: .3 } },
      { id: 'texture', name: 'Texture Patch', description: 'Large soft patch, brightness matched.', params: { x: .5, y: .5, sx: .5, sy: .3, radius: 80, feather: 40, opacity: .9, matchLuma: .9 } },
      { id: 'pinpoint', name: 'Pinpoint', description: 'Small hard clone.', params: { x: .5, y: .5, sx: .55, sy: .5, radius: 8, feather: 2, opacity: 1, matchLuma: 0 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 b=inp(uv); float asp=uResolution.x/uResolution.y; vec2 c=vec2(P0,P1); vec2 d=(uv-c)*vec2(asp,1.0); float r=length(d)*uResolution.y; float m=(1.0-smoothstep(P4,P4+P5,r))*P6; if(m<=0.001) return b; vec2 s=uv-c+vec2(P2,P3); vec4 src=inp(s); float lt=dot(b.rgb,vec3(.2126,.7152,.0722)), ls=dot(src.rgb,vec3(.2126,.7152,.0722)); vec3 fill=src.rgb*mix(1.0,clamp(lt/max(ls,1e-3),0.5,2.0),P7*0.5); return vec4(mix(b.rgb,fill,m),b.a); }`,
  }),
];
