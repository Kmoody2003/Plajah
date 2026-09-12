// phase3LensFlareEffects.ts — LENS FLARE DESIGNER (Knoll Light Factory / Real Lens Flares /
// S_LensFlare / BCC Lens Flare 3D class). One physically-motivated element stack rendered in a
// single pass around a light position that is bindable to a VectorTrack point: glow ball,
// anamorphic streak, starburst spikes, iris ghosts along the light→centre axis with chromatic
// edges, halo ring and a spectral rainbow arc. Obscuration reads the source luma at the light
// (bright behind the light = visible flare) so a flare dies when the light goes behind something.
import type { FxEffect } from './effects';

const KIT = `
float lfh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec3 lfhue(float h){ return hsv2rgb(vec3(fract(h),0.75,1.0)); }
// n-gon iris shape distance (r = 1 at the edge)
float ngon(vec2 d, float n){ float a=atan(d.y,d.x); float seg=6.28318/n; float k=cos(floor(0.5+a/seg)*seg-a); return length(d)*k; }
`;

export const PHASE3_LENS_FLARE_EFFECTS: FxEffect[] = [
  {
    id: 'flarerig', name: 'Flare Rig', category: 'light', version: 1,
    summary: 'A full flare rig — glow ball, anamorphic streak, starburst, iris ghosts with chromatic edges, halo, rainbow arc — around a light you can track; occluded by the picture.',
    params: [
      { key: 'x', label: 'Light X', min: -.5, max: 1.5, default: .7, step: .005 },
      { key: 'y', label: 'Light Y', min: -.5, max: 1.5, default: .3, step: .005 },
      { key: 'brightness', label: 'Brightness', min: 0, max: 3, default: 1, step: .01 },
      { key: 'scale', label: 'Scale', min: .2, max: 3, default: 1, step: .01 },
      { key: 'ghosts', label: 'Ghosts', min: 0, max: 12, default: 6, step: 1 },
      { key: 'streak', label: 'Anamorphic Streak', min: 0, max: 2, default: .6, step: .01 },
      { key: 'hue', label: 'Tint (<0 warm white)', min: -1, max: 1, default: -1, step: .01 },
      { key: 'obscure', label: 'Obscuration', min: 0, max: 1, default: .6, step: .01 },
    ],
    presets: [
      { id: 'anamorphic-blue', name: 'Anamorphic Blue', description: 'Long horizontal blue streak, few ghosts.', params: { x: .7, y: .3, brightness: 1.1, scale: 1, ghosts: 3, streak: 1.6, hue: .58, obscure: .6 } },
      { id: 'sun-glare', name: 'Sun Glare', description: 'Warm sun with many iris ghosts and a rainbow arc.', params: { x: .75, y: .2, brightness: 1.3, scale: 1.2, ghosts: 9, streak: .3, hue: -1, obscure: .6 } },
      { id: 'vintage-50mm', name: 'Vintage 50mm', description: 'Soft ghosts and a wide halo.', params: { x: .6, y: .4, brightness: .9, scale: 1.4, ghosts: 6, streak: .1, hue: .09, obscure: .5 } },
      { id: 'sci-fi', name: 'Sci-Fi', description: 'Cyan streak and sharp starburst.', params: { x: .5, y: .5, brightness: 1.4, scale: .9, ghosts: 4, streak: 1.2, hue: .5, obscure: .3 } },
      { id: 'subtle-practical', name: 'Subtle Practical', description: 'Small glow for on-set lamps.', params: { x: .5, y: .5, brightness: .5, scale: .6, ghosts: 2, streak: .2, hue: .1, obscure: .8 } },
    ],
    glsl: KIT + `
vec4 fx(vec2 uv){
  vec4 b=inp(uv); float asp=uResolution.x/uResolution.y;
  vec2 L=vec2(P0,P1); vec2 p=(uv-L)*vec2(asp,1.0); vec2 c=(vec2(0.5)-L)*vec2(asp,1.0);
  // Obscuration: how much of the source is bright around the light (light behind dark = flare fades).
  float occ=0.0; for(int i=0;i<9;i++){ vec2 o=vec2(float(i%3)-1.0,float(i/3)-1.0)*0.012; occ+=dot(inp(clamp(L+o,0.0,1.0)).rgb,vec3(.2126,.7152,.0722)); } occ/=9.0;
  float vis=mix(1.0,smoothstep(0.15,0.75,occ),P7);
  float inFrame=step(-0.2,L.x)*step(L.x,1.2)*step(-0.2,L.y)*step(L.y,1.2);
  vis*=inFrame;
  vec3 tint=P6<0.0?vec3(1.0,0.93,0.82):lfhue(P6);
  float s=P3; float r=length(p)/s;
  vec3 acc=vec3(0.0);
  // 1. glow ball + core
  acc+=tint*(exp(-r*9.0)*1.2+exp(-r*40.0)*2.0);
  // 2. anamorphic streak (horizontal)
  float streak=exp(-abs(p.y)*90.0/s)*exp(-abs(p.x)*1.6/(s*(0.5+P5)))*P5*1.4;
  acc+=mix(tint,vec3(0.55,0.7,1.0),0.6)*streak;
  // 3. starburst spikes
  float ang=atan(p.y,p.x); float spikes=pow(abs(cos(ang*4.0)),24.0)*0.7+pow(abs(cos(ang*6.0+0.4)),60.0)*0.5;
  acc+=tint*spikes*exp(-r*3.0)*0.9;
  // 4. halo ring
  acc+=mix(tint,vec3(1.0,0.5,0.35),0.5)*exp(-pow((r-0.55)*9.0,2.0))*0.35;
  // 5. rainbow arc (spectral halo further out)
  float rb=exp(-pow((r-0.95)*10.0,2.0))*0.25; acc+=hsv2rgb(vec3(fract((r-0.85)*4.0),0.9,1.0))*rb;
  // 6. iris ghosts along the light→centre axis, with chromatic edges
  int n=int(clamp(P4,0.0,12.0)+0.5);
  for(int i=0;i<12;i++){
    if(i>=n) break; float fi=float(i);
    float t=(fi+1.0)/(float(n)+1.0); float h=lfh(vec2(fi,3.7));
    vec2 gc=c*(t*2.2-0.4); float gs=s*(0.03+0.12*h);
    vec2 d=(p-gc); float sides=5.0+floor(h*4.0);
    float rr=ngon(d,sides)/gs;
    float disc=(1.0-smoothstep(0.85,1.0,rr))*(0.35+0.65*smoothstep(0.4,1.0,rr));
    vec3 gcol=lfhue(0.05+h*0.7+t*0.2);
    float chroma=smoothstep(0.75,1.0,rr)*(1.0-smoothstep(1.0,1.1,rr));
    acc+=(gcol*disc*0.35+vec3(1.0,0.4,0.2)*chroma*0.15)*(0.6+0.4*(1.0-t));
  }
  acc*=P2*vis;
  vec3 o=b.rgb+acc-b.rgb*acc*0.3;
  return vec4(clamp(o,0.0,1.0),b.a);
}`,
  },
  {
    id: 'lightsweep', name: 'Light Sweep', category: 'light', version: 1,
    summary: 'A soft light bar sweeping across the frame (logo / title reveal glint), with angle, width and loop.',
    params: [
      { key: 'progress', label: 'Position', min: -.5, max: 1.5, default: .5, step: .005 },
      { key: 'angle', label: 'Angle', min: -90, max: 90, default: 20, step: 1, unit: 'deg' },
      { key: 'width', label: 'Width', min: .01, max: .6, default: .12, step: .005 },
      { key: 'intensity', label: 'Intensity', min: 0, max: 2, default: .8, step: .01 },
      { key: 'speed', label: 'Auto Sweep', min: 0, max: 3, default: 0, step: .05, unit: 'Hz' },
      { key: 'alphaOnly', label: 'Only on Alpha', min: 0, max: 1, default: 0, step: 1 },
    ],
    presets: [
      { id: 'logo-glint', name: 'Logo Glint', description: 'Narrow bright glint, only on the layer alpha.', params: { progress: .5, angle: 25, width: .08, intensity: 1.2, speed: 0, alphaOnly: 1 } },
      { id: 'looping-sweep', name: 'Looping Sweep', description: 'Wide soft sweep that loops.', params: { progress: 0, angle: 15, width: .25, intensity: .6, speed: .4, alphaOnly: 0 } },
      { id: 'hard-bar', name: 'Hard Bar', description: 'Vertical hard-edged light bar.', params: { progress: .5, angle: 0, width: .04, intensity: 1.5, speed: 0, alphaOnly: 0 } },
    ],
    glsl: `vec4 fx(vec2 uv){ vec4 b=inp(uv); float a=radians(P1); vec2 d=vec2(cos(a),sin(a)); float t=dot(uv-0.5,d)+0.5; float pos=P4>0.0?fract(uTime*P4)*2.0-0.5:P0; float band=exp(-pow((t-pos)/max(P2,1e-3),2.0)*2.0); float k=band*P3*(P5>0.5?b.a:1.0); vec3 o=b.rgb+vec3(1.0)*k-b.rgb*k*0.5; return vec4(clamp(o,0.0,1.0),b.a); }`,
  },
];
