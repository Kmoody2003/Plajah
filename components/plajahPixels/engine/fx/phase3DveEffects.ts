// phase3DveEffects.ts — 2D-in-3D DVE kernels (BCC Perspective unit / Sapphire WarpPerspective):
// Page Curl, Cube Face, Cylinder, Sphere, Card Flip. Each maps the frame onto simple 3D
// geometry with a perspective divide, backface handling and edge shading — single pass.
import type { FxEffect } from './effects';

const KIT = `
vec2 aspectUv(vec2 uv, float asp){ return (uv-0.5)*vec2(asp,1.0); }
vec2 unAspect(vec2 p, float asp){ return p/vec2(asp,1.0)+0.5; }
float inb(vec2 uv){ return step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0); }
`;
const d = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'distort' });

export const PHASE3_DVE_EFFECTS: FxEffect[] = [
  d({
    id: 'pagecurl', name: 'Page Curl', version: 1,
    summary: 'Peels the frame like a page from a corner, with a shaded cylinder and the back of the page showing through.',
    params: [
      { key: 'amount', label: 'Curl', min: 0, max: 1, default: .35, step: .005 },
      { key: 'angle', label: 'Direction', min: 0, max: 360, default: 45, step: 1, unit: 'deg' },
      { key: 'radius', label: 'Radius', min: .02, max: .5, default: .12, step: .005 },
      { key: 'backBright', label: 'Back Brightness', min: 0, max: 1, default: .75, step: .01 },
      { key: 'shadow', label: 'Shadow', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'corner', name: 'Corner Peel', description: 'Classic bottom-right corner peel.', params: { amount: .35, angle: 45, radius: .12, backBright: .75, shadow: .5 } },
      { id: 'tight-roll', name: 'Tight Roll', description: 'Small radius, strong shadow.', params: { amount: .5, angle: 30, radius: .05, backBright: .6, shadow: .8 } },
      { id: 'side-turn', name: 'Side Turn', description: 'Left-to-right page turn.', params: { amount: .4, angle: 0, radius: .18, backBright: .85, shadow: .3 } },
    ],
    glsl: KIT + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 p=aspectUv(uv,asp); float a=radians(P1); vec2 dir=vec2(cos(a),sin(a)); float diag=length(vec2(asp,1.0)); float fold=(0.5-P0)*diag*2.0; float t=dot(p,dir); float R=P2; vec4 base=inp(uv); float alpha=base.a; if(t<fold) return base; float dt=t-fold; if(dt<3.14159*R){ float ang=dt/R; float z=sin(ang)*R; float back=cos(ang); vec2 q=p-dir*(dt-sin(ang)*R); vec2 suv=unAspect(q,asp); vec4 c=inp(suv); float shade=1.0-0.35*P4*(1.0-cos(ang)); vec3 col=c.rgb*shade; if(back<0.0){ col=mix(vec3(0.93),c.rgb,0.15)*P3*(0.7+0.3*abs(back)); } return vec4(col,c.a*inb(suv)); } vec2 q=p-dir*(dt-3.14159*R)*1.0; q=p-dir*(2.0*(dt-3.14159*R)+3.14159*R); vec2 suv=unAspect(q,asp); vec4 c=inp(suv); float k=inb(suv); vec3 back=mix(vec3(0.93),c.rgb,0.15)*P3; vec4 under=vec4(0.0); return vec4(mix(under.rgb,back,k),k*c.a); }`,
  }),
  d({
    id: 'cubeface', name: 'Cube Face', version: 1,
    summary: 'Maps the frame onto one rotating face of a cube seen in perspective, with edge shading — the BCC Cube / 3D flip look.',
    params: [
      { key: 'yaw', label: 'Yaw', min: -180, max: 180, default: 25, step: 1, unit: 'deg' },
      { key: 'pitch', label: 'Pitch', min: -90, max: 90, default: 10, step: 1, unit: 'deg' },
      { key: 'depth', label: 'Camera Distance', min: 1, max: 6, default: 2, step: .05 },
      { key: 'size', label: 'Size', min: .2, max: 2, default: 1, step: .01 },
      { key: 'shade', label: 'Shading', min: 0, max: 1, default: .5, step: .01 },
      { key: 'spin', label: 'Spin', min: -2, max: 2, default: 0, step: .01 },
    ],
    presets: [
      { id: 'tumble', name: 'Tumble', description: 'Slow spinning cube face.', params: { yaw: 0, pitch: 12, depth: 2, size: 1, shade: .5, spin: .4 } },
      { id: 'card-tilt', name: 'Card Tilt', description: 'Static tilted card.', params: { yaw: 25, pitch: 10, depth: 2.2, size: 1, shade: .4, spin: 0 } },
      { id: 'flip-mid', name: 'Flip Midway', description: 'Edge-on flip.', params: { yaw: 80, pitch: 0, depth: 1.8, size: 1.2, shade: .7, spin: 0 } },
    ],
    glsl: KIT + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 p=aspectUv(uv,asp); float yaw=radians(P0)+uTime*P5, pit=radians(P1); float cy=cos(yaw), sy=sin(yaw), cp=cos(pit), sp=sin(pit);
  // Card basis: rx along the card's width, ry along its height, n its normal (yaw about Y, pitch about X).
  vec3 rx=vec3(cy,0.0,sy); vec3 ry=vec3(sy*sp,cp,-cy*sp); vec3 n=cross(rx,ry);
  // Camera at z=-dist looking down +z; the card is centred at the origin.
  vec3 ro=vec3(0.0,0.0,-P2); vec3 rd=normalize(vec3(p,1.6));
  float denom=dot(rd,n); if(abs(denom)<1e-5) return vec4(0.0);
  float t=dot(-ro,n)/denom; if(t<0.0) return vec4(0.0);
  vec3 hit=ro+rd*t; vec2 local=vec2(dot(hit,rx),dot(hit,ry));
  float hw=P3*asp*0.5, hh=P3*0.5;
  vec2 suv=vec2(local.x/hw*0.5+0.5, local.y/hh*0.5+0.5);
  if(inb(suv)<0.5) return vec4(0.0);
  vec4 c=inp(suv); float facing=abs(dot(normalize(n),vec3(0.0,0.0,1.0))); float sh=mix(1.0,0.35+0.65*facing,P4);
  if(denom<0.0) c.rgb*=0.6; // normal points away from the camera → back face
  return vec4(c.rgb*sh,c.a); }`,
  }),
  d({
    id: 'cylinderwrap', name: 'Cylinder', version: 1,
    summary: 'Wraps the frame around a vertical or horizontal cylinder with curvature and rotation.',
    params: [
      { key: 'curve', label: 'Curvature', min: 0, max: 1, default: .6, step: .01 },
      { key: 'rotate', label: 'Rotate', min: -180, max: 180, default: 0, step: 1, unit: 'deg' },
      { key: 'axis', label: 'Axis (0 vertical · 1 horizontal)', min: 0, max: 1, default: 0, step: 1 },
      { key: 'shade', label: 'Shading', min: 0, max: 1, default: .4, step: .01 },
      { key: 'spin', label: 'Spin', min: -2, max: 2, default: 0, step: .01 },
    ],
    presets: [
      { id: 'drum', name: 'Drum', description: 'Vertical cylinder slowly spinning.', params: { curve: .7, rotate: 0, axis: 0, shade: .5, spin: .3 } },
      { id: 'roller', name: 'Roller', description: 'Horizontal roll.', params: { curve: .6, rotate: 0, axis: 1, shade: .4, spin: -.4 } },
      { id: 'gentle-bow', name: 'Gentle Bow', description: 'Slight curvature, no spin.', params: { curve: .25, rotate: 0, axis: 0, shade: .2, spin: 0 } },
    ],
    glsl: KIT + `vec4 fx(vec2 uv){ vec2 q=P2>0.5?uv.yx:uv; float x=(q.x-0.5)*2.0; float r=mix(4.0,1.0,P0); float xs=x/r; if(abs(xs)>1.0) return vec4(0.0); float ang=asin(xs)+radians(P1)+uTime*P4; float u=ang/(3.14159)*r*0.5*(1.0+(1.0-P0)*0.0)+0.5; float depthK=cos(asin(xs)); vec2 suv=vec2(fract(u),q.y); if(P2>0.5) suv=suv.yx; vec4 c=inp(suv); float sh=mix(1.0,0.3+0.7*depthK,P3); return vec4(c.rgb*sh,c.a); }`,
  }),
  d({
    id: 'spheremap', name: 'Sphere', version: 1,
    summary: 'Wraps the frame onto a sphere (or a fisheye bulge) with lighting and rotation.',
    params: [
      { key: 'radius', label: 'Radius', min: .1, max: 1, default: .45, step: .005 },
      { key: 'wrap', label: 'Wrap', min: 0, max: 1, default: 1, step: .01 },
      { key: 'rotate', label: 'Rotate', min: -180, max: 180, default: 0, step: 1, unit: 'deg' },
      { key: 'shade', label: 'Shading', min: 0, max: 1, default: .5, step: .01 },
      { key: 'spin', label: 'Spin', min: -2, max: 2, default: 0, step: .01 },
      { key: 'keepBg', label: 'Keep Background', min: 0, max: 1, default: 0, step: 1 },
    ],
    presets: [
      { id: 'globe', name: 'Globe', description: 'Full wrap, spinning globe.', params: { radius: .45, wrap: 1, rotate: 0, shade: .6, spin: .3, keepBg: 0 } },
      { id: 'bulge', name: 'Bulge', description: 'Fisheye bulge over the original.', params: { radius: .5, wrap: .35, rotate: 0, shade: .2, spin: 0, keepBg: 1 } },
      { id: 'marble', name: 'Marble', description: 'Small strongly-lit sphere.', params: { radius: .25, wrap: 1, rotate: 30, shade: .9, spin: .5, keepBg: 0 } },
    ],
    glsl: KIT + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 p=aspectUv(uv,asp); float r=length(p)/P0; if(r>1.0) return P5>0.5?inp(uv):vec4(0.0); float z=sqrt(1.0-r*r); vec3 n=vec3(p/P0,z); float rot=radians(P2)+uTime*P4; float lon=atan(n.x,n.z)+rot; float lat=asin(clamp(n.y,-1.0,1.0)); vec2 sph=vec2(fract(lon/6.28318+0.5), lat/3.14159+0.5); vec2 fl=uv; vec2 suv=mix(fl,sph,P1); vec4 c=inp(suv); float light=max(0.0,dot(n,normalize(vec3(-0.5,0.6,0.7)))); float sh=mix(1.0,0.15+0.85*light,P3); return vec4(c.rgb*sh,c.a); }`,
  }),
  d({
    id: 'cardflip', name: 'Card Flip', version: 1,
    summary: 'Flips the frame around a vertical or horizontal axis in perspective; the aux input (or a darkened copy) shows on the back.',
    params: [
      { key: 'angle', label: 'Flip Angle', min: 0, max: 360, default: 30, step: 1, unit: 'deg' },
      { key: 'axis', label: 'Axis (0 vertical · 1 horizontal)', min: 0, max: 1, default: 0, step: 1 },
      { key: 'depth', label: 'Perspective', min: 0, max: 1, default: .5, step: .01 },
      { key: 'shade', label: 'Shading', min: 0, max: 1, default: .4, step: .01 },
      { key: 'spin', label: 'Spin', min: -2, max: 2, default: 0, step: .01 },
    ],
    auxInput: { label: 'Back face', optional: true },
    presets: [
      { id: 'flip-30', name: 'Tilt 30°', description: 'Static tilted card.', params: { angle: 30, axis: 0, depth: .5, shade: .4, spin: 0 } },
      { id: 'spinning', name: 'Spinning Card', description: 'Continuous flip showing the back face.', params: { angle: 0, axis: 0, depth: .6, shade: .5, spin: .5 } },
      { id: 'table-flip', name: 'Table Flip', description: 'Horizontal-axis flip.', params: { angle: 40, axis: 1, depth: .5, shade: .4, spin: 0 } },
    ],
    glsl: KIT + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 p=aspectUv(uv,asp); if(P1>0.5) p=p.yx; float a=radians(P0)+uTime*P4; float ca=cos(a), sa=sin(a); float persp=1.0+P2*0.8; float denom=persp*ca - p.x*sa*P2*1.2; if(abs(denom)<1e-4) return vec4(0.0); float x=p.x*persp/denom; float y=p.y*persp/denom; vec2 q=vec2(x,y); if(P1>0.5) q=q.yx; vec2 suv=unAspect(q,asp); float k=inb(suv); if(k<0.5) return vec4(0.0); bool back=ca<0.0; vec2 fuv=back?vec2(1.0-suv.x,suv.y):suv; if(P1>0.5&&back) fuv=vec2(suv.x,1.0-suv.y); vec4 c=back?aux(fuv):inp(fuv); if(back){ vec4 f=inp(fuv); c=mix(c,f*0.5,step(0.999,float(c==f))); } float sh=mix(1.0,0.3+0.7*abs(ca),P3); return vec4(c.rgb*sh,c.a); }`,
  }),
];
