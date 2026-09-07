// phase3ParticleEffects.ts — EMITTER: stateless GPU particles (W3a).
//
// Particular / Particle Illusion / BCC Particles keep a simulation state; a single-pass
// fragment shader cannot. Instead every particle here is a CLOSED-FORM function of time, so
// the same frame index always produces the same picture (export == monitor, scrub-safe) and
// there is nothing to reset on cuts.
//   • particlefield — ambient fields (rain, snow, dust, embers, bokeh, stars, bubbles, confetti,
//     ash). Particles are hashed in a "rest frame" that moves with the wind/fall direction, so
//     positions are static per cell and only the frame moves; three parallax depth layers.
//   • particleburst — a point emitter (sparks, fountain, fireworks, magic dust, snow machine).
//     Each of 64 particles has a phase-offset life cycle, launch direction inside a spread cone,
//     gravity and drag-free ballistic motion. The emitter position is bindable to a track.
// Colour parameter convention: < 0 = white / neutral, 0..1 = hue at 80% saturation.
import type { FxEffect } from './effects';

const KIT = `
float ph21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
vec2 ph22(vec2 p){ return vec2(ph21(p), ph21(p+vec2(19.19,7.7))); }
vec3 pcol(float c){ if(c<0.0) return vec3(1.0); return hsv2rgb(vec3(fract(c),0.8,1.0)); }
// shape: 0 disc, 1 streak, 2 star, 3 ring, 4 hex, 5 square, 6 soft bokeh
float pshape(vec2 d, float r, float shape, vec2 dir, float streak){
  if(shape<0.5){ float q=length(d)/r; return 1.0-smoothstep(0.55,1.0,q); }
  if(shape<1.5){ float along=dot(d,dir), across=dot(d,vec2(-dir.y,dir.x)); float a=abs(along)/(r*streak), b=abs(across)/(r*0.35); return (1.0-smoothstep(0.6,1.0,a))*(1.0-smoothstep(0.4,1.0,b)); }
  if(shape<2.5){ float ang=atan(d.y,d.x); float star=0.55+0.45*pow(abs(cos(ang*2.0)),8.0); float q=length(d)/(r*star); return 1.0-smoothstep(0.5,1.0,q); }
  if(shape<3.5){ float q=length(d)/r; return (1.0-smoothstep(0.75,1.0,q))*smoothstep(0.45,0.7,q); }
  if(shape<4.5){ vec2 q=abs(d)/r; float hx=max(q.x*0.866+q.y*0.5,q.y); return 1.0-smoothstep(0.75,1.0,hx); }
  if(shape<5.5){ vec2 q=abs(d)/r; return 1.0-smoothstep(0.75,1.0,max(q.x,q.y)); }
  float q=length(d)/r; return (1.0-smoothstep(0.85,1.0,q))*(0.55+0.45*smoothstep(0.55,0.95,q));
}
`;

export const PHASE3_PARTICLE_EFFECTS: FxEffect[] = [
  {
    id: 'particlefield', name: 'Emitter · Field', category: 'generator', version: 1,
    summary: 'Ambient particle weather — rain, snow, dust, embers, bokeh, stars — in three parallax layers, composited over the clip. Deterministic and scrub-safe.',
    params: [
      { key: 'density', label: 'Density', min: 0, max: 1, default: .35, step: .01 },
      { key: 'size', label: 'Size', min: .5, max: 60, default: 4, step: .5, unit: 'px' },
      { key: 'speed', label: 'Speed', min: 0, max: 3, default: .6, step: .01 },
      { key: 'angle', label: 'Direction', min: -180, max: 180, default: 90, step: 1, unit: 'deg' },
      { key: 'turbulence', label: 'Turbulence', min: 0, max: 1, default: .2, step: .01 },
      { key: 'layers', label: 'Depth Layers', min: 1, max: 3, default: 3, step: 1 },
      { key: 'shape', label: 'Shape (0 disc · 1 streak · 2 star · 3 ring · 4 hex · 5 square · 6 bokeh)', min: 0, max: 6, default: 0, step: 1 },
      { key: 'color', label: 'Colour (<0 white)', min: -1, max: 1, default: -1, step: .01 },
    ],
    presets: [
      { id: 'rain', name: 'Rain', description: 'Fast thin streaks falling slightly off-vertical.', params: { density: .45, size: 2.5, speed: 2.2, angle: 100, turbulence: .05, layers: 3, shape: 1, color: -1 } },
      { id: 'snow', name: 'Snow', description: 'Soft flakes drifting down with gentle sway.', params: { density: .35, size: 5, speed: .35, angle: 95, turbulence: .45, layers: 3, shape: 0, color: -1 } },
      { id: 'blizzard', name: 'Blizzard', description: 'Dense wind-driven snow with heavy turbulence.', params: { density: .85, size: 4, speed: 1.6, angle: 160, turbulence: .8, layers: 3, shape: 1, color: -1 } },
      { id: 'dust-motes', name: 'Dust Motes', description: 'Slow floating specks catching the light.', params: { density: .2, size: 3, speed: .08, angle: 0, turbulence: .6, layers: 3, shape: 6, color: .1 } },
      { id: 'embers', name: 'Embers', description: 'Orange sparks rising and swirling.', params: { density: .3, size: 3, speed: .5, angle: -90, turbulence: .7, layers: 2, shape: 0, color: .06 } },
      { id: 'bokeh-lights', name: 'Bokeh Lights', description: 'Large soft out-of-focus discs drifting slowly.', params: { density: .12, size: 40, speed: .06, angle: -20, turbulence: .3, layers: 2, shape: 6, color: .12 } },
      { id: 'starfield', name: 'Starfield', description: 'Tiny static stars with a slow drift.', params: { density: .5, size: 1.5, speed: .02, angle: 0, turbulence: 0, layers: 3, shape: 2, color: -1 } },
      { id: 'bubbles', name: 'Bubbles', description: 'Rings rising with a wobble.', params: { density: .18, size: 14, speed: .3, angle: -90, turbulence: .5, layers: 2, shape: 3, color: .55 } },
      { id: 'confetti', name: 'Confetti', description: 'Square multicoloured pieces tumbling down.', params: { density: .3, size: 7, speed: .6, angle: 95, turbulence: .6, layers: 2, shape: 5, color: .5 } },
      { id: 'ash', name: 'Ash Fall', description: 'Grey flakes falling slowly through still air.', params: { density: .28, size: 3.5, speed: .18, angle: 90, turbulence: .35, layers: 3, shape: 4, color: -1 } },
    ],
    glsl: KIT + `
vec4 fx(vec2 uv){
  vec4 base=inp(uv); float aspect=uResolution.x/uResolution.y;
  float a=radians(P3); vec2 dir=vec2(cos(a),sin(a)); vec2 perp=vec2(-dir.y,dir.x);
  int nl=int(clamp(P5,1.0,3.0)+0.5); vec3 acc=vec3(0.0); float amax=0.0;
  vec3 col=pcol(P7); bool rainbow=(P6>4.5&&P6<5.5&&P7>=0.0);
  for(int li=0;li<3;li++){
    if(li>=nl) break; float L=float(li);
    float depth=1.0-L*0.32;                       // near layer big/fast, far layer small/slow
    float sz=max(0.5,P1*depth)/uResolution.y;     // normalized radius (in y units)
    float sp=P2*depth*0.35;
    vec2 p=vec2(uv.x*aspect,uv.y);
    vec2 rest=p-dir*sp*uTime-L*vec2(0.37,0.61);   // rest frame: particles are static here
    float cell=max(sz*6.0,0.035);
    vec2 cid=floor(rest/cell);
    for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
      vec2 c=cid+vec2(float(i),float(j));
      float seed=ph21(c+L*17.3);
      if(seed>P0) continue;                        // density: fraction of cells that hold a particle
      vec2 jit=ph22(c*1.7+L*3.1);
      vec2 centre=(c+jit)*cell;
      float ph=seed*6.2831;
      centre+=vec2(sin(uTime*(0.8+seed)*1.7+ph),cos(uTime*(0.6+jit.x)*1.3+ph*1.7))*P4*cell*0.5;
      float r=sz*(0.55+0.9*jit.y);
      vec2 d=rest-centre;
      float streak=1.0+P2*6.0;
      float k=pshape(d,r,P6,dir,streak);
      if(k<=0.0) continue;
      float tw=0.75+0.25*sin(uTime*(2.0+seed*5.0)+ph);   // twinkle
      vec3 pc=rainbow?hsv2rgb(vec3(fract(P7+seed),0.85,1.0)):col;
      float w=k*tw*depth;
      acc+=pc*w; amax=max(amax,w);
    }
  }
  vec3 o=base.rgb+acc-base.rgb*clamp(acc,0.0,1.0);     // screen
  return vec4(clamp(o,0.0,1.0),max(base.a,clamp(amax,0.0,1.0)));
}`,
  },
  {
    id: 'particleburst', name: 'Emitter · Burst', category: 'generator', version: 1,
    summary: 'Point emitter — sparks, fountains, fireworks, magic dust — launched from a position you can link to a track. 64 closed-form particles per instance.',
    params: [
      { key: 'x', label: 'Emitter X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'y', label: 'Emitter Y', min: 0, max: 1, default: .6, step: .005 },
      { key: 'speed', label: 'Speed', min: 0, max: 2, default: .6, step: .01 },
      { key: 'spread', label: 'Spread', min: 0, max: 360, default: 60, step: 1, unit: 'deg' },
      { key: 'gravity', label: 'Gravity', min: -1, max: 2, default: .8, step: .01 },
      { key: 'life', label: 'Life', min: .2, max: 6, default: 1.6, step: .1, unit: 's' },
      { key: 'size', label: 'Size', min: .5, max: 40, default: 3, step: .5, unit: 'px' },
      { key: 'color', label: 'Colour (<0 white)', min: -1, max: 1, default: .08, step: .01 },
    ],
    presets: [
      { id: 'sparks', name: 'Sparks', description: 'Hot orange sparks kicked upward and falling.', params: { x: .5, y: .65, speed: .9, spread: 70, gravity: 1.2, life: 1.2, size: 2.5, color: .07 } },
      { id: 'fountain', name: 'Fountain', description: 'Tall arcing fountain of white droplets.', params: { x: .5, y: .8, speed: 1.3, spread: 30, gravity: 1.4, life: 2.2, size: 3, color: -1 } },
      { id: 'fireworks', name: 'Fireworks', description: 'Omni-directional burst with slow fall.', params: { x: .5, y: .35, speed: .8, spread: 360, gravity: .35, life: 2.5, size: 3, color: .9 } },
      { id: 'magic-dust', name: 'Magic Dust', description: 'Slow floating golden motes with no gravity.', params: { x: .5, y: .5, speed: .25, spread: 360, gravity: -.05, life: 3.5, size: 4, color: .13 } },
      { id: 'welding', name: 'Welding', description: 'Fast bright sparks in a tight cone.', params: { x: .5, y: .5, speed: 1.8, spread: 45, gravity: 1.8, life: .7, size: 2, color: -1 } },
      { id: 'snow-machine', name: 'Snow Machine', description: 'Wide slow spray of soft flakes.', params: { x: .5, y: .1, speed: .5, spread: 120, gravity: .25, life: 4, size: 6, color: -1 } },
      { id: 'smoke-puffs', name: 'Smoke Puffs', description: 'Large soft grey particles rising slowly.', params: { x: .5, y: .7, speed: .3, spread: 40, gravity: -.15, life: 4, size: 30, color: -1 } },
    ],
    glsl: KIT + `
vec4 fx(vec2 uv){
  vec4 base=inp(uv); float aspect=uResolution.x/uResolution.y;
  vec2 p=vec2(uv.x*aspect,uv.y); vec2 e=vec2(P0*aspect,P1);
  vec3 col=pcol(P7); vec3 acc=vec3(0.0); float amax=0.0;
  float sz=max(0.5,P6)/uResolution.y;
  for(int i=0;i<64;i++){
    float fi=float(i); vec2 h=ph22(vec2(fi*0.731,fi*1.917)); float h3=ph21(vec2(fi*2.13,0.37));
    float birth=h.x*P5; float age=mod(uTime-birth+P5*4.0,P5);
    float ang=radians(-90.0)+(h.y-0.5)*radians(P3);
    vec2 dir=vec2(cos(ang),sin(ang));
    float v=P2*(0.55+0.7*h3)*0.6;
    vec2 pos=e+dir*v*age+vec2(0.0,P4*0.5)*age*age*0.6;
    pos.x+=sin(age*3.0+fi)*0.006*(1.0-abs(P4));
    float lifeK=1.0-age/P5;
    float r=sz*(0.5+0.8*h3)*(0.35+0.65*lifeK);
    vec2 d=p-pos;
    if(abs(d.x)>r*4.0||abs(d.y)>r*4.0) continue;
    vec2 vel=dir*v+vec2(0.0,P4*0.6)*age;
    float streak=1.0+length(vel)*8.0;
    vec2 vd=normalize(vel+vec2(1e-5));
    float k=pshape(d,r,P6>12.0?6.0:(length(vel)>0.35?1.0:0.0),vd,streak);
    if(k<=0.0) continue;
    float w=k*lifeK*(0.6+0.4*h3);
    vec3 pc=col; if(P7>=0.0) pc=hsv2rgb(vec3(fract(P7+h3*0.08),0.8,1.0)); pc=mix(pc,vec3(1.0),0.5*lifeK*lifeK);
    acc+=pc*w; amax=max(amax,w);
  }
  vec3 o=base.rgb+acc-base.rgb*clamp(acc,0.0,1.0);
  return vec4(clamp(o,0.0,1.0),max(base.a,clamp(amax,0.0,1.0)));
}`,
  },
];
