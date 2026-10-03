import type { SceneInst } from './flux';
import { FLUX_MATH_CYCLE, FLUX_MATH_SCENES, type FluxMathSceneId } from '../../../../services/fabula/fluxMathCatalog';
import { FLUX_LEAK_GLSL } from './fluxLightLeaks';

// Every map consumes the same two-dimensional particle coordinates. This lets
// unlike topologies dissolve continuously without rebuilding buffers per frame.
export const FLUX_MATH_GLSL = `
const float PI=3.141592653589793;
const float TAU=6.283185307179586;
uniform float uPhase,uBass,uMid,uTre,uKick,uSnare,uVoice,uHarmony,uHarmonicHue,uEnergy,uHue,uFrom,uTo,uMorph,uChaos;
uniform float uSpectrum[16],uImpulse[16];
uniform vec3 uEye;
uniform float uFocusDistance,uFocusStrength;
uniform vec2 uLeakAnchor,uLeakAspect;
uniform float uLightDrive;
${FLUX_LEAK_GLSL}
attribute float aJet;
varying vec3 vColor;
varying float vAlpha;
varying float vDefocus;
mat2 rot(float a){return mat2(cos(a),sin(a),-sin(a),cos(a));}
float superR(float a,float m,float n){
  return pow(max(0.08,pow(abs(cos(m*a*.25)),2.0)+pow(abs(sin(m*a*.25)),2.0)),-1.0/n);
}
float field(vec2 q){
  float f=0.0,w=.5;
  for(int i=0;i<4;i++){f+=w*sin(q.x)*cos(q.y);q=rot(.7)*q*2.0+vec2(1.3,2.7);w*=.5;}
  return f;
}
float spectral(float coord){
  float f=clamp(coord,0.0,1.0)*15.0;
  int i=int(floor(f));int j=min(i+1,15);
  return mix(uSpectrum[i],uSpectrum[j],fract(f));
}
vec3 shape(float id,vec2 uv,float h){
  float a=TAU*uv.x,b=TAU*uv.y;
  float breath=1.0+.28*uBass;
  vec3 p=vec3(0.0);
  if(id<.5){
    // (p,q) torus knot with a circular filament cross-section.
    float r=2.2+.72*cos(5.0*a+h);
    p=vec3(r*cos(3.0*a),r*sin(3.0*a),.72*sin(5.0*a+h));
    p+=.16*(1.0+uMid)*vec3(cos(b)*cos(3.0*a),cos(b)*sin(3.0*a),sin(b));
  }else if(id<1.5){
    // Common complex phase on S3 yields linked Hopf circles.
    float eta=.52+.20*cos(b),psi=b+h;
    vec4 q=vec4(cos(eta)*cos(a),cos(eta)*sin(a),sin(eta)*cos(a+psi),sin(eta)*sin(a+psi));
    p=1.25*q.xyz/(1.0-q.w);
  }else if(id<2.5){
    vec4 q=.70710678*vec4(cos(a),sin(a),cos(b),sin(b));
    q.xz=rot(h+.18*uMid)*q.xz;
    q.yw=rot(-h)*q.yw;
    // Bounded perspective projection of the 4D Clifford torus.
    p=1.8*q.xyz/(1.45-q.w);
  }else if(id<3.5){
    float lat=PI*(uv.y-.5);
    float m=6.0+2.0*sin(h),n=1.2+.45*cos(h)+.3*uMid;
    float r=superR(a,m,n),s=superR(lat,4.0,n);
    p=1.6*vec3(r*cos(a)*s*cos(lat),r*sin(a)*s*cos(lat),s*sin(lat));
  }else if(id<4.5){
    float w=cos(a*.5)*sin(b)-sin(a*.5)*sin(2.0*b);
    p=vec3((2.0+w)*cos(a),(2.0+w)*sin(a),sin(a*.5)*sin(b)+cos(a*.5)*sin(2.0*b));
  }else if(id<5.5){
    float w=(uv.y-.5)*1.8,angle=a*.5;
    p=vec3((2.0+w*cos(angle))*cos(a),(2.0+w*cos(angle))*sin(a),w*sin(angle));
  }else if(id<6.5){
    vec2 q=(uv-.5)*2.8;
    float x=q.x,y=q.y;
    p=.95*vec3(x-x*x*x/3.0+x*y*y,y-y*y*y/3.0+y*x*x,x*x-y*y);
  }else if(id<7.5){
    float lat=PI*uv.y;
    // Fourier radial sculpture, not an eigenfunction spherical harmonic.
    float r=1.65+.55*sin(5.0*a+h)*pow(sin(lat),2.0)+.35*cos(6.0*lat-h);
    r+=.15*uVoice*sin(3.0*a)*sin(lat);
    p=r*vec3(sin(lat)*cos(a),sin(lat)*sin(a),cos(lat));
  }else if(id<8.5){
    float r=2.8*cos(7.0*a+h)*(.2+.8*uv.y);
    p=vec3(r*cos(a),r*sin(a),.65*sin(b+h)*sin(7.0*a));
  }else if(id<9.5){
    // R=5,r=1: (R-r)/r=4 closes after one revolution.
    float d=1.0+.7*uv.y+.35*sin(h)+.15*uMid;
    p=.55*vec3(4.0*cos(a)+d*cos(4.0*a),4.0*sin(a)-d*sin(4.0*a),sin(b+h));
  }else if(id<10.5){
    vec2 q=(uv-.5)*PI*2.0;
    float f=cos(3.0*q.x)*cos(5.0*q.y)-cos(5.0*q.x)*cos(3.0*q.y);
    float g=cos(2.0*q.x)*cos(7.0*q.y)-cos(7.0*q.x)*cos(2.0*q.y);
    float mode=.5+.4*sin(h+.3*uMid);
    p=vec3(q*.9,.8*mix(f,g,mode));
  }else{
    vec2 q=(uv-.5)*6.0;
    vec2 drift=vec2(cos(h),sin(h));
    vec2 w=vec2(field(q+drift),field(q+vec2(4.2,1.7)-drift));
    vec2 z=vec2(field(q+3.0*w+drift),field(q+3.0*w-drift+2.0));
    p=vec3(q+(.45+.2*uVoice)*w,1.8*field(q+4.0*z+drift));
  }
  p*=breath;
  p.z+=.12*uKick*sin(8.0*a+h)+.10*uVoice*cos(3.0*b-h);
  return p;
}
void main(){
  vec2 uv=position.xy;
  float layer=position.z;
  float flight=fract(layer+uPhase*4.0/TAU);
  float birthPhase=uPhase-(layer>.0?flight*.8:0.0);
  vec3 p=mix(shape(uFrom,uv,birthPhase),shape(uTo,uv,birthPhase),uMorph);
  // Different notes press on different patches of each mathematical manifold.
  float bandCoord=fract(uv.x+.17*uv.y+uFrom/12.0);
  float local=spectral(bandCoord),nearby=spectral(fract(bandCoord+.22));
  float impact=uImpulse[int(floor(bandCoord*15.0))];
  // Keep the source manifold legible; reserve the large forces for high-energy
  // emissions. Individual notes still produce small, visible local ripples.
  float forceGain=layer>0.0?.15+.85*uChaos:.10+.28*uChaos;
  vec3 radial=p/max(length(p),.001);
  vec3 direction=normalize(radial+vec3(.25*cos(TAU*uv.x),.25*sin(TAU*uv.x),.35));
  float fast=uPhase*24.0;
  // Bass pressure and kicks drive travelling compression/expansion waves.
  float pressure=.42*uBass*sin(length(p)*3.8-fast)+.55*uKick*cos(length(p)*2.8-fast*2.0);
  // Spectral resonances buckle the sheet; mids apply torsion around its axis.
  float resonance=(.48*local+.28*impact)*sin(TAU*(uv.y*7.0+uv.x*3.0)-fast*2.0);
  p+=direction*(pressure+resonance)*forceGain;
  p.xy=rot((.32*uMid*sin(p.z*1.5+fast)+.22*(local-nearby))*forceGain)*p.xy;
  p.z+=(.48*uMid*sin(TAU*uv.x*5.0+fast)+.32*uVoice*cos(TAU*uv.y*3.0-fast))*forceGain;
  // Kick attacks move the complete form coherently even in restrained sections.
  // Keep this punch outside the chaos gate so drums remain visibly connected.
  p*=1.0+.16*uKick;
  p+=radial*.24*uKick*cos(length(p)*3.0-fast*2.0);
  p.z+=.14*uKick;
  // Harmony slowly changes the woven symmetry; voice is a broad depth current.
  p.xy=rot(.10*uHarmony*cos(TAU*uv.y*3.0+uPhase))*p.xy;
  p+=direction*.09*uHarmony*sin(TAU*uv.x*6.0+uHarmonicHue*TAU);
  p.z+=.24*uVoice*sin(TAU*uv.x+uPhase*2.0);
  // Snares deliver a brief high-frequency ripple distinct from the kick punch.
  p+=direction*.07*uSnare*sin(TAU*(uv.x*18.0+uv.y*7.0)-fast*3.0);
  // One fifth of particles detach from their source patch as spectral jets.
  // Position comes from age, not accumulated simulation state: seeking is safe.
  float age=fract(uv.y*29.0+uv.x*13.0+uPhase*8.0/TAU);
  float launch=min(1.6,.7*local+.65*impact+.55*uKick+.3*uTre)*uChaos;
  if(aJet>.5){
    vec3 tangent=vec3(-direction.y,direction.x,.3*sin(TAU*uv.y));
    p+=direction*age*(1.2+2.0*launch)+tangent*sin(age*PI)*(uMid+.35*uTre);
    p.z+=age*age*.7*launch;
  }
  p.xy=rot(.12*sin(uPhase))*p.xy;
  p.yz=rot(.25*sin(uPhase)+.08*uVoice)*p.yz;
  // Entire mathematical wavefronts propagate through depth toward the active
  // director camera. Orbit/crane shots reveal the volume rather than a flat veil.
  if(layer>0.0){
    float force=.25+.45*uEnergy+.35*local;
    p*=1.0+flight*(.5+force);
    p.xy=rot(flight*(.7*uMid+.25*sin(uPhase)))*p.xy;
    vec3 eyeDir=uEye/max(length(uEye),.001);
    p+=eyeDir*flight*(length(uEye)+3.0);
    p+=vec3(sin(flight*TAU+uPhase),cos(flight*TAU-uPhase),0.0)*flight*uMid*.7;
  }
  float thread=.5+.5*cos(TAU*(uv.x*12.0+uv.y*4.0)+uPhase);
  vec4 projected=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  vec2 screenUv=projected.xy/max(.001,projected.w)*.5+.5;
  vec3 leakTint;float leakStyle;
  float lightActivity=leakField(screenUv,uLeakAspect,uLeakAnchor,uPhase,leakTint,leakStyle);
  // The optical wash applies a restrained local force, strongest on emissions.
  p+=direction*lightActivity*(.015+.055*uLightDrive)*(layer>0.0?2.0:1.0);
  vColor=.5+.5*cos(TAU*(vec3(0.0,.33,.67)+uHue+uv.y*.35+.18*uHarmony*uHarmonicHue)+uPhase+thread*.65);
  vColor*=.60+.35*thread+.20*local+.12*impact+.12*uTre;
  vColor=mix(vColor,vec3(.65,.9,1.3),min(.65,impact*.35));
  float snareSeam=pow(.5+.5*sin(TAU*(uv.x*24.0+uv.y*9.0)-fast),10.0)*uSnare;
  vColor+=vec3(.30,.5,.75)*snareSeam;
  vColor=mix(vColor,vColor*(.65+leakTint),lightActivity*.18);
  vAlpha=.16+.14*thread+.04*uEnergy;
  if(uFrom>9.5&&uFrom<10.5){
    vec2 q=(uv-.5)*PI*2.0;
    float f=mix(cos(3.0*q.x)*cos(5.0*q.y)-cos(5.0*q.x)*cos(3.0*q.y),
      cos(2.0*q.x)*cos(7.0*q.y)-cos(7.0*q.x)*cos(2.0*q.y),.5+.4*sin(uPhase+.3*uMid));
    vAlpha*=mix(exp(-8.0*abs(f))+.06,1.0,uMorph);
  }
  if(aJet>.5){vAlpha=min(1.0,launch)*pow(1.0-age,1.4)*.5;vColor*=1.1;}
  if(layer>0.0){
    vAlpha*=smoothstep(0.0,.12,flight)*(1.0-smoothstep(.65,1.0,flight))*uChaos*(.05+.12*local+.06*impact);
    vColor=mix(vColor,vec3(.2,.8,1.2),flight*.25);
  }
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  vDefocus=min(1.0,abs(-mv.z-uFocusDistance)/max(1.0,uFocusDistance*.45))*uFocusStrength;
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((2.0+.35*uTre+.35*local+.35*thread)*18.0/max(.5,-mv.z),1.2,5.0);
  gl_PointSize*=1.0+vDefocus*3.0;
  vAlpha/=1.0+vDefocus*2.0;
}
`;

export function buildMathScene(T: any, id: FluxMathSceneId | 'math-morph'): SceneInst {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(46, 1, .1, 100);
  const sourceSide=256,emissionSide=128,layers=4;
  const count=sourceSide*sourceSide+(layers-1)*emissionSide*emissionSide;
  const positions = new Float32Array(count*3);
  let particle=0;
  for(let layer=0;layer<layers;layer++){
    const side=layer===0?sourceSide:emissionSide;
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){
      const i=particle++*3;positions[i]=(x+.5)/side;positions[i+1]=(y+.5)/side;
      positions[i+2]=layer===0?0:layer/4;
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const jets=new Float32Array(count);
  for(let i=0;i<jets.length;i++)jets[i]=i>=sourceSide*sourceSide&&i%5===0?1:0;
  geometry.setAttribute('aJet',new T.BufferAttribute(jets,1));
  const index = FLUX_MATH_SCENES.findIndex(s => s.id === id);
  const uniforms = Object.fromEntries(['Phase','Bass','Mid','Tre','Kick','Snare','Voice','Harmony','HarmonicHue','Energy','Hue','From','To','Morph','Chaos'].map(k => ['u'+k, { value: 0 }]));
  const spectrumUniform={value:new Float32Array(16)},impulseUniform={value:new Float32Array(16)};
  const eyeUniform={value:new T.Vector3(0,0,12)};
  const focusDistance={value:12},focusStrength={value:0};
  const leakAnchor={value:new T.Vector2(.8,.7)},leakAspect={value:new T.Vector2(1,1)},lightDrive={value:0};
  let lightEnergy=0,lastTime=-1;
  const lightWorld=new T.Vector3(5,3,-3),lightScreen=new T.Vector3();
  const material = new T.ShaderMaterial({ uniforms:{...uniforms,uSpectrum:spectrumUniform,uImpulse:impulseUniform,uEye:eyeUniform,uFocusDistance:focusDistance,uFocusStrength:focusStrength,uLeakAnchor:leakAnchor,uLeakAspect:leakAspect,uLightDrive:lightDrive}, vertexShader: FLUX_MATH_GLSL,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    fragmentShader: `varying vec3 vColor; varying float vAlpha,vDefocus;
      void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;
      float core=1.0-smoothstep(.05,.5,r);
      float soft=exp(-r*r*16.0)*(1.0-smoothstep(.4,.5,r));
      gl_FragColor=vec4(vColor,mix(core,soft,vDefocus)*vAlpha);}` });
  const points = new T.Points(geometry, material); points.frustumCulled = false; scene.add(points);
  return { scene, camera, cam: { target: [0,0,0], radius: 12, pitch: 12, yaw: 0, fov: 52 },
    exposure: 1.05, brightThreshold: .6, grain: 0,
    setFocus(distance,strength){focusDistance.value=distance;focusStrength.value=strength;},
    optics(){return {energy:lightEnergy,x:leakAnchor.value.x,y:leakAnchor.value.y,phase:uniforms.uPhase.value};},
    update(t, a, spec) {
      eyeUniform.value.copy(camera.position);
      const energy=Math.min(1,Math.max(0,a.intensity*.7+Math.min(1,a.energy)*.3));
      const dt=lastTime<0?0:t-lastTime;
      lightEnergy=lastTime<0||dt<0||dt>.25?energy:lightEnergy+(energy-lightEnergy)*(1-Math.exp(-dt/1.8));
      lastTime=t;
      lightScreen.copy(lightWorld).project(camera);
      leakAnchor.value.set(Math.max(-.15,Math.min(1.15,lightScreen.x*.5+.5)),Math.max(-.15,Math.min(1.15,lightScreen.y*.5+.5)));
      leakAspect.value.set(camera.aspect,1);lightDrive.value=lightEnergy;
      const gate=Math.max(0,Math.min(1,(energy-.5)/.4));
      uniforms.uChaos.value=gate*gate*(3-2*gate);
      const seconds = Math.max(0, t), segment = Math.floor(seconds / FLUX_MATH_CYCLE);
      const phase = seconds % FLUX_MATH_CYCLE / FLUX_MATH_CYCLE;
      // Fixed formulas loop exactly. The journey dwells then morphs smoothly;
      // mids alter the transition curve without advancing a stateful clock.
      const from = index < 0 ? segment % FLUX_MATH_SCENES.length : index;
      const x = Math.max(0, Math.min(1, (phase - .45) / .55));
      const ease = x*x*(3-2*x);
      uniforms.uFrom.value = from; uniforms.uTo.value = (from + 1) % FLUX_MATH_SCENES.length;
      uniforms.uMorph.value = index < 0 ? ease + .15*a.mid*ease*(1-ease) : 0;
      uniforms.uPhase.value = phase * Math.PI * 2;
      for(let i=0;i<16;i++){
        spectrumUniform.value[i]=Math.min(1.4,Math.max(0,a.spectrum?.[i]??(i<5?a.bass:i<11?a.mid:a.tre)));
        impulseUniform.value[i]=Math.min(1.4,Math.max(0,a.spectralImpulse?.[i]??0));
      }
      for (const [key,value] of Object.entries({Bass:a.bass,Mid:a.mid,Tre:a.tre,Kick:a.kickOnset??a.kick,Snare:a.snare,Voice:a.voice,Harmony:a.harmony??0,HarmonicHue:a.harmonicHue??0,Energy:a.energy,Hue:spec.hue})) uniforms['u'+key].value=value;
    }, bloom: a => .42 + .12*a.tre + .08*a.kick,
    dispose() { geometry.dispose(); material.dispose(); scene.remove(points); },
  };
}
