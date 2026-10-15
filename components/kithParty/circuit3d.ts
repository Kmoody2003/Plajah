import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {characterById} from './catalog';
import {makeCreature} from './creatures3d';
import {type State, type Player} from './engine';
import {worldPoint, trackFrame, courseById, setActiveCourse, isSupportPillarSafe, type CourseDef} from './course3d';
import {makeKart, crestGeometry} from './karts3d';
import {makeGardenWorld} from './gardenWorld3d';
import {gameAudio} from './audio';

/** ---- Graphics-pass atmosphere helpers: procedural sky, clouds, glow sprites, micro-normal asphalt ---- */

function makeSkyDome(course:CourseDef):T.Mesh{
 const geo=new T.SphereGeometry(480,32,20);
 const sunDir=new T.Vector3(-30,68,28).normalize();
 const cZen=new T.Color(course.skyZenith);
 const cMid=new T.Color(course.skyMid);
 const cHor=new T.Color(course.skyHorizon);
 const isPolar=course.id==='polar-vortex'?1.0:0.0;
 const isAbyss=course.id==='abyssal-trench'?1.0:0.0;
 const material=new T.ShaderMaterial({
  side:T.BackSide,depthWrite:false,fog:false,
  uniforms:{
   sunDir:{value:sunDir},
   uZenith:{value:new T.Vector3(cZen.r,cZen.g,cZen.b)},
   uMid:{value:new T.Vector3(cMid.r,cMid.g,cMid.b)},
   uHorizon:{value:new T.Vector3(cHor.r,cHor.g,cHor.b)},
   uPolar:{value:isPolar},
   uAbyss:{value:isAbyss},
  },
  vertexShader:`
   varying vec3 vDir;
   void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
   varying vec3 vDir;
   uniform vec3 sunDir;
   uniform vec3 uZenith;
   uniform vec3 uMid;
   uniform vec3 uHorizon;
   uniform float uPolar;
   uniform float uAbyss;
   void main(){
    vec3 d=normalize(vDir);
    float h=d.y;
    vec3 below=uHorizon*0.85;
    vec3 col=h>0.0
     ? mix(mix(uHorizon,uMid,smoothstep(0.0,0.32,h)),uZenith,smoothstep(0.28,0.85,h))
     : mix(uHorizon,below,smoothstep(0.0,-0.35,h));
    float s=max(dot(d,normalize(sunDir)),0.0);
    col+=vec3(1.0,0.90,0.70)*pow(s,480.0)*(1.8*(1.0-uAbyss*0.7));
    col+=vec3(1.0,0.74,0.52)*pow(s,8.0)*0.34;
    float band=smoothstep(0.04,0.14,h)*smoothstep(0.65,0.28,h);
    float n=sin(d.x*8.0+1.7)*sin(d.z*6.0-0.6)*sin((d.x+d.z)*4.5+0.8);
    float clouds=smoothstep(0.15,0.8,n)*band;
    col=mix(col,vec3(1.0,0.96,0.99),clouds*0.42*(1.0-uAbyss));
    if(uPolar>0.5 && h>0.05){
     float aurora=sin(d.x*14.0+d.z*9.0)*cos(d.x*7.0-d.z*12.0);
     float rib=smoothstep(0.2,0.85,aurora)*smoothstep(0.08,0.45,h)*smoothstep(0.92,0.35,h);
     col+=mix(vec3(0.1,0.95,0.65),vec3(0.75,0.25,1.0),0.5+0.5*sin(d.x*5.0))*rib*0.65;
    }
    if(uAbyss>0.5 && h>0.0){
     float rays=pow(max(0.0,sin(d.x*22.0)*cos(d.z*22.0)),4.0)*smoothstep(0.1,0.9,h);
     col+=vec3(0.0,0.85,1.0)*rays*0.35;
    }
    gl_FragColor=vec4(col,1.0);
   }`
 });
 const mesh=new T.Mesh(geo,material);mesh.renderOrder=-10;mesh.frustumCulled=false;return mesh;
}

function makePuffTexture():T.CanvasTexture{
 const c=document.createElement('canvas');c.width=128;c.height=128;
 const x=c.getContext('2d')!;
 for(let i=0;i<9;i++){
  const px=34+Math.random()*60,py=44+Math.random()*40,r=18+Math.random()*22;
  const g=x.createRadialGradient(px,py,0,px,py,r);
  g.addColorStop(0,'rgba(255,255,255,0.85)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,7);x.fill();
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

function makeGlowTexture():T.CanvasTexture{
 const c=document.createElement('canvas');c.width=128;c.height=128;
 const x=c.getContext('2d')!;
 const g=x.createRadialGradient(64,64,4,64,64,64);
 g.addColorStop(0,'rgba(255,255,255,0.92)');g.addColorStop(0.4,'rgba(255,255,255,0.35)');g.addColorStop(1,'rgba(255,255,255,0)');
 x.fillStyle=g;x.fillRect(0,0,128,128);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

function makeContactShadowTexture():T.CanvasTexture{
 const c=document.createElement('canvas');c.width=128;c.height=128;
 const x=c.getContext('2d')!;
 const g=x.createRadialGradient(64,64,8,64,64,60);
 g.addColorStop(0,'rgba(5,4,12,0.82)');
 g.addColorStop(0.55,'rgba(5,4,12,0.42)');
 g.addColorStop(1,'rgba(5,4,12,0)');
 x.fillStyle=g;x.fillRect(0,0,128,128);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

/**
 * Generates high-detail Asphalt Diffuse + Specular Roughness + Aggregate Micro-Normal Maps
 * with a darkened rubbered-in racing line down the center and grazing sun sheen.
 */
function makeAsphaltMaps(baseColor='#191a2b'):{map:T.CanvasTexture;rough:T.CanvasTexture;normal:T.CanvasTexture}{
 const c=document.createElement('canvas');c.width=256;c.height=256;
 const x=c.getContext('2d')!;
 x.fillStyle=baseColor;x.fillRect(0,0,256,256);
 // Rubbered-in racing groove wear bands
 const groove=x.createLinearGradient(0,0,256,0);
 groove.addColorStop(0,'rgba(0,0,0,0)');
 groove.addColorStop(0.28,'rgba(0,0,0,0.18)');
 groove.addColorStop(0.50,'rgba(255,255,255,0.03)');
 groove.addColorStop(0.72,'rgba(0,0,0,0.18)');
 groove.addColorStop(1,'rgba(0,0,0,0)');
 x.fillStyle=groove;x.fillRect(0,0,256,256);
 for(let i=0;i<3400;i++){
  const v=Math.random();
  x.fillStyle=v>.58?'rgba(255,220,195,0.065)':'rgba(6,8,18,0.30)';
  const s=1+Math.random()*2.2;
  x.fillRect(Math.random()*256,Math.random()*256,s,s);
 }
 const map=new T.CanvasTexture(c);
 map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;

 const rc=document.createElement('canvas');rc.width=128;rc.height=128;
 const rx=rc.getContext('2d')!;
 rx.fillStyle='#6e6e7e';rx.fillRect(0,0,128,128);
 // Polished tire tracks have slightly lower roughness (shinier under grazing sun glare)
 rx.fillStyle='#4e4e5c';
 rx.fillRect(28,0,24,128);rx.fillRect(76,0,24,128);
 for(let i=0;i<600;i++){
  const v=70+(Math.random()*95|0);
  rx.fillStyle=`rgb(${v},${v},${v})`;
  rx.fillRect(Math.random()*128,Math.random()*128,2,2);
 }
 const rough=new T.CanvasTexture(rc);rough.wrapS=rough.wrapT=T.RepeatWrapping;

 const nc=document.createElement('canvas');nc.width=128;nc.height=128;
 const nx=nc.getContext('2d')!;
 nx.fillStyle='rgb(128,128,255)';nx.fillRect(0,0,128,128);
 for(let i=0;i<1400;i++){
  const r=110+(Math.random()*36|0),g=110+(Math.random()*36|0);
  nx.fillStyle=`rgb(${r},${g},255)`;
  nx.fillRect(Math.random()*128,Math.random()*128,2,2);
 }
 const normal=new T.CanvasTexture(nc);normal.wrapS=normal.wrapT=T.RepeatWrapping;
 return {map,rough,normal};
}

/** Shared cached loader for Blender-sculpted drivers.glb (for the 8 non-locked Kith drivers). */
let driversGlbPromise:Promise<T.Group>|null=null;
function loadDriversGlb():Promise<T.Group>{
 if(!driversGlbPromise){
  driversGlbPromise=new Promise((resolve,reject)=>{
   if(typeof window==='undefined'){reject(new Error('no-window'));return;}
   new GLTFLoader().load('/kith-party/models/drivers.glb',gltf=>resolve(gltf.scene),undefined,err=>reject(err));
  });
 }
 return driversGlbPromise;
}

/** Course-aware HDR procedural studio/sky dome baked to a PMREM env map for realistic automotive reflections. */
function buildEnvironment(renderer:T.WebGLRenderer,course:CourseDef):T.WebGLRenderTarget{
 const pmrem=new T.PMREMGenerator(renderer);
 const env=new T.Scene();
 env.add(new T.Mesh(new T.SphereGeometry(50,16,12),new T.MeshBasicMaterial({side:T.BackSide,color:course.skyMid})));
 const ground=new T.Mesh(new T.CircleGeometry(45,16),new T.MeshBasicMaterial({color:course.terrainColorA}));
 ground.rotation.x=-Math.PI/2;ground.position.y=-4;env.add(ground);
 const sun=new T.Mesh(new T.SphereGeometry(7,12,10),new T.MeshBasicMaterial({color:'#fff6dc'}));
 sun.position.set(28,32,-12);env.add(sun);
 const rimA=new T.Mesh(new T.SphereGeometry(10,10,8),new T.MeshBasicMaterial({color:course.skyHorizon}));
 rimA.position.set(-24,10,22);env.add(rimA);
 const rimB=new T.Mesh(new T.SphereGeometry(8,10,8),new T.MeshBasicMaterial({color:course.accent}));
 rimB.position.set(18,5,15);env.add(rimB);
 const rt=pmrem.fromScene(env,0.035);
 pmrem.dispose();
 return rt;
}

function makeWarmSaturationCurve():Float32Array{
 const n=256, curve=new Float32Array(n);
 for(let i=0;i<n;i++){
  const x=(i*2)/n-1;
  curve[i]=Math.tanh(x*2.2);
 }
 return curve;
}

/**
 * Visceral Multi-Harmonic Kart Audio Synthesizer:
 * - 3-oscillator Boxer/V-Twin engine + WaveShaper warm saturation + intake formant filter
 * - Transmission gear-shift bark & off-throttle overrun burble/crackle pops
 * - 3-tier ascending Mini-Turbo charge chimes (Blue / Orange / Ultra Purple)
 * - Dual-layered tire screech + serrated apex curb rumble buzz
 * - Suspension hop boing & landing thump + jet-afterburner turbo ignition
 */
class KartAudioSynthesizer {
 private ctx:AudioContext|null=null;
 private engineGain:GainNode|null=null;
 private engineOsc:OscillatorNode|null=null;
 private engineOsc2:OscillatorNode|null=null;
 private engineOsc3:OscillatorNode|null=null;
 private engineFilter:BiquadFilterNode|null=null;
 private driftGain:GainNode|null=null;
 private driftFilter:BiquadFilterNode|null=null;
 private driftNoise:AudioBufferSourceNode|null=null;
 private curbGain:GainNode|null=null;
 private curbOsc:OscillatorNode|null=null;
 private lastBoost=0;
 private lastHop=0;
 private lastGear=1;
 private lastDriftStage=0;
 private lastSpeed=0;
 private lastBurbleAt=0;
 private enabled=true;

 init(ctx:AudioContext){
  this.ctx=ctx;
  try{
   const shaper=ctx.createWaveShaper();
   shaper.curve=makeWarmSaturationCurve() as any;
   shaper.oversample='2x';

   this.engineFilter=ctx.createBiquadFilter();
   this.engineFilter.type='lowpass';this.engineFilter.frequency.value=520;this.engineFilter.Q.value=3.2;
   this.engineGain=ctx.createGain();this.engineGain.gain.value=0;

   // Osc 1: Boxer fundamental growl; Osc 2: 2nd harmonic body; Osc 3: 5th harmonic intake rasp
   this.engineOsc=ctx.createOscillator();this.engineOsc.type='sawtooth';this.engineOsc.frequency.value=62;
   this.engineOsc2=ctx.createOscillator();this.engineOsc2.type='triangle';this.engineOsc2.frequency.value=124;
   this.engineOsc3=ctx.createOscillator();this.engineOsc3.type='square';this.engineOsc3.frequency.value=186;
   const g3=ctx.createGain();g3.gain.value=0.28;
   this.engineOsc.connect(shaper);
   this.engineOsc2.connect(shaper);
   this.engineOsc3.connect(g3);g3.connect(shaper);
   shaper.connect(this.engineFilter);
   this.engineFilter.connect(this.engineGain);
   this.engineGain.connect(ctx.destination);
   this.engineOsc.start();this.engineOsc2.start();this.engineOsc3.start();

   const bufSize=ctx.sampleRate*2;
   const noiseBuf=ctx.createBuffer(1,bufSize,ctx.sampleRate);
   const out=noiseBuf.getChannelData(0);
   for(let i=0;i<bufSize;i++) out[i]=(Math.random()*2-1)*.85;
   this.driftNoise=ctx.createBufferSource();this.driftNoise.buffer=noiseBuf;this.driftNoise.loop=true;
   this.driftFilter=ctx.createBiquadFilter();
   this.driftFilter.type='bandpass';this.driftFilter.frequency.value=1750;this.driftFilter.Q.value=4.8;
   this.driftGain=ctx.createGain();this.driftGain.gain.value=0;
   this.driftNoise.connect(this.driftFilter);this.driftFilter.connect(this.driftGain);this.driftGain.connect(ctx.destination);
   this.driftNoise.start();

   this.curbGain=ctx.createGain();this.curbGain.gain.value=0;
   this.curbOsc=ctx.createOscillator();this.curbOsc.type='sawtooth';this.curbOsc.frequency.value=58;
   const curbFilter=ctx.createBiquadFilter();curbFilter.type='bandpass';curbFilter.frequency.value=210;curbFilter.Q.value=2.4;
   this.curbOsc.connect(curbFilter);curbFilter.connect(this.curbGain);this.curbGain.connect(ctx.destination);
   this.curbOsc.start();
  }catch{}
 }

 update(p:Player,soundEnabled:boolean){
  this.enabled=soundEnabled;
  if(!this.ctx||!soundEnabled||this.ctx.state!=='running') {
   if(this.engineGain) this.engineGain.gain.value=0;
   if(this.driftGain) this.driftGain.gain.value=0;
   if(this.curbGain) this.curbGain.gain.value=0;
   return;
  }
  const t=this.ctx.currentTime;
  const speedRatio=Math.min(1.5,p.speed/.070);
  // Realistic RPM-coupled frequency so gear changes audibly step the engine note!
  const rpmNorm=Math.max(0,Math.min(1.3,((p.rpm||1200)-1000)/7800));
  const baseFreq=52+rpmNorm*145+speedRatio*42+(p.boost>0?48:0)+(p.inLoop?24:0);

  if(this.engineOsc) this.engineOsc.frequency.setTargetAtTime(baseFreq,t,.035);
  if(this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(baseFreq*2.0,t,.035);
  if(this.engineOsc3) this.engineOsc3.frequency.setTargetAtTime(baseFreq*3.02,t,.035);
  if(this.engineFilter) this.engineFilter.frequency.setTargetAtTime(380+rpmNorm*2100+(p.boost>0?1100:0),t,.04);
  if(this.engineGain) this.engineGain.gain.setTargetAtTime(.075+speedRatio*.075+(p.boost>0?.035:0),t,.04);

  // Gear-shift bark / transmission pop when gear changes
  if(p.gear!==this.lastGear&&p.speed>.025){
   this.playGearShiftBark(p.gear>this.lastGear);
   this.lastGear=p.gear;
  }

  // Off-throttle exhaust overrun crackle when decelerating or entering a hard drift
  if(p.speed<this.lastSpeed-0.0004&&p.speed>.03&&t-this.lastBurbleAt>0.16){
   this.lastBurbleAt=t;
   this.playExhaustCrackle();
  }
  this.lastSpeed=p.speed;

  // Drift tire squeal with slip-angle pitch modulation + 3-tier Mini-Turbo charge chimes
  if(this.driftGain&&this.driftFilter){
   const target=p.drift>.12?Math.min(.19,.055+p.drift*.095):0;
   this.driftGain.gain.setTargetAtTime(target,t,.035);
   this.driftFilter.frequency.setTargetAtTime(1480+p.driftStage*320+Math.abs(p.steerAngle)*260,t,.04);
  }
  if(p.driftStage>this.lastDriftStage&&p.driftStage>0){
   this.playDriftTierChime(p.driftStage);
  }
  this.lastDriftStage=p.driftStage;

  // Serrated Apex Curb Rumble Strip Buzz (`brrrrt`)
  if(this.curbGain&&this.curbOsc){
   const target=p.surface==='curb'?.13:p.surface==='offroad'?.06:0;
   this.curbOsc.frequency.setTargetAtTime(p.surface==='curb'?52+speedRatio*38:34,t,.02);
   this.curbGain.gain.setTargetAtTime(target,t,.025);
  }

  if(p.boost>0&&this.lastBoost===0){
   this.playTurboBlast();
  }
  if(p.hopVy>1.5&&this.lastHop<=0.02){
   this.playHopBoing();
  } else if(this.lastHop>0.06&&p.hopY<=0.02){
   this.playLandingThud();
  }
  this.lastBoost=p.boost;
  this.lastHop=p.hopY;
 }

 playGearShiftBark(upshift:boolean){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   const osc=ctx.createOscillator();osc.type='sawtooth';
   osc.frequency.setValueAtTime(upshift?180:130,t);
   osc.frequency.exponentialRampToValueAtTime(upshift?72:220,t+.065);
   const g=ctx.createGain();g.gain.setValueAtTime(.14,t);g.gain.exponentialRampToValueAtTime(.001,t+.075);
   osc.connect(g);g.connect(ctx.destination);
   osc.start(t);osc.stop(t+.08);
  }catch{}
 }

 playExhaustCrackle(){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   const osc=ctx.createOscillator();osc.type='triangle';
   osc.frequency.setValueAtTime(115+Math.random()*45,t);
   osc.frequency.exponentialRampToValueAtTime(42,t+.055);
   const g=ctx.createGain();g.gain.setValueAtTime(.11,t);g.gain.exponentialRampToValueAtTime(.001,t+.06);
   osc.connect(g);g.connect(ctx.destination);
   osc.start(t);osc.stop(t+.065);
  }catch{}
 }

 playDriftTierChime(tier:number){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   const notes=tier===3?[783.99,1046.5,1318.5,1567.98]:tier===2?[659.25,880,1174.66]:[523.25,659.25];
   notes.forEach((freq,idx)=>{
    const osc=ctx.createOscillator();osc.type='triangle';
    osc.frequency.setValueAtTime(freq,t+idx*.038);
    const g=ctx.createGain();g.gain.setValueAtTime(.13,t+idx*.038);
    g.gain.exponentialRampToValueAtTime(.001,t+idx*.038+.14);
    osc.connect(g);g.connect(ctx.destination);
    osc.start(t+idx*.038);osc.stop(t+idx*.038+.15);
   });
  }catch{}
 }

 playHopBoing(){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   const osc=ctx.createOscillator();osc.type='sine';
   osc.frequency.setValueAtTime(210,t);osc.frequency.exponentialRampToValueAtTime(460,t+.10);
   const gain=ctx.createGain();gain.gain.setValueAtTime(.15,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(t);osc.stop(t+.13);
  }catch{}
 }

 playLandingThud(){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   const osc=ctx.createOscillator();osc.type='sine';
   osc.frequency.setValueAtTime(115,t);osc.frequency.exponentialRampToValueAtTime(38,t+.11);
   const gain=ctx.createGain();gain.gain.setValueAtTime(.20,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(t);osc.stop(t+.13);
  }catch{}
 }

 playTurboBlast(){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   // Sub-bass ignition punch + rising jet-turbine shimmer chord
   const sub=ctx.createOscillator();sub.type='sawtooth';
   sub.frequency.setValueAtTime(240,t);sub.frequency.exponentialRampToValueAtTime(58,t+.38);
   const gSub=ctx.createGain();gSub.gain.setValueAtTime(.24,t);gSub.gain.exponentialRampToValueAtTime(.001,t+.42);
   sub.connect(gSub);gSub.connect(ctx.destination);
   sub.start(t);sub.stop(t+.44);

   [587.33,880,1174.66].forEach((f,i)=>{
    const osc=ctx.createOscillator();osc.type='triangle';
    osc.frequency.setValueAtTime(f,t+i*.03);
    osc.frequency.exponentialRampToValueAtTime(f*1.25,t+.32);
    const g=ctx.createGain();g.gain.setValueAtTime(.11,t+i*.03);g.gain.exponentialRampToValueAtTime(.001,t+.36);
    osc.connect(g);g.connect(ctx.destination);
    osc.start(t+i*.03);osc.stop(t+.38);
   });
  }catch{}
 }

 dispose(){
  try{
   this.engineOsc?.stop();this.engineOsc2?.stop();this.engineOsc3?.stop();this.driftNoise?.stop();this.curbOsc?.stop();
  }catch{}
 }
}

export function createCircuit3D(canvas:HTMLCanvasElement,initial:State) {
 const courseDef=courseById(initial.course);
 setActiveCourse(courseDef.id);
 gameAudio.setCourse(courseDef.id);

 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(960,560,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
 canvas.dataset.renderer='three-webgl';

 const scene=new T.Scene();
 scene.fog=new T.FogExp2(courseDef.fogColor,courseDef.fogDensity);
 scene.add(makeSkyDome(courseDef));
 const envRT=buildEnvironment(renderer,courseDef);
 scene.environment=envRT.texture;
 scene.environmentIntensity=.92;

 // Sun glow billboard, anamorphic horizon flare, drifting clouds, air sparkles
 const glowTex=makeGlowTexture();
 const sunGlow=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:courseDef.id==='abyssal-trench'?'#3df5ff':'#ffdf9e',transparent:true,opacity:.88,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
 sunGlow.position.set(55,64,-10).normalize().multiplyScalar(420);sunGlow.scale.setScalar(185);scene.add(sunGlow);
 const sunStreak=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:'#fff0cc',transparent:true,opacity:.42,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
 sunStreak.position.copy(sunGlow.position);sunStreak.scale.set(340,28,1);scene.add(sunStreak);

 const puffTex=makePuffTexture();
 const clouds:{sprite:T.Sprite;speed:number}[]=[];
 for(let i=0;i<14;i++){
  const sp=new T.Sprite(new T.SpriteMaterial({map:puffTex,transparent:true,opacity:.48+Math.random()*.28,depthWrite:false,fog:false,color:courseDef.id==='abyssal-trench'?'#2088b8':'#fff7fb'}));
  const a=Math.random()*Math.PI*2,r=210+Math.random()*130;
  sp.position.set(Math.cos(a)*r,58+Math.random()*44,Math.sin(a)*r);
  const s=52+Math.random()*54;sp.scale.set(s,s*.52,1);
  scene.add(sp);clouds.push({sprite:sp,speed:.6+Math.random()*1.4});
 }
 const moteCount=160;
 const motePos=new Float32Array(moteCount*3);
 for(let i=0;i<moteCount;i++){motePos[i*3]=(Math.random()-.5)*280;motePos[i*3+1]=2+Math.random()*38;motePos[i*3+2]=(Math.random()-.5)*280;}
 const moteGeo=new T.BufferGeometry();
 moteGeo.setAttribute('position',new T.BufferAttribute(motePos,3));
 const moteMat=new T.PointsMaterial({map:glowTex,color:courseDef.accent,size:.88,transparent:true,opacity:.65,blending:T.AdditiveBlending,depthWrite:false,alphaTest:.02});
 const motes=new T.Points(moteGeo,moteMat);scene.add(motes);

 const hemi=new T.HemisphereLight('#f6f8ff','#7a5d7e',2.15);scene.add(hemi);
 const sun=new T.DirectionalLight('#ffebd2',3.7);
 sun.position.set(55,82,-24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-165,right:165,top:155,bottom:-155,near:1,far:290});
 sun.shadow.bias=-.0005;scene.add(sun);
 const fill=new T.DirectionalLight(courseDef.accent,1.35);fill.position.set(-55,32,48);scene.add(fill);

 const mats=new Map<string,T.MeshStandardMaterial>();
 const mat=(color:string,glow=0)=>{
  const key=color+glow;
  if(!mats.has(key)) mats.set(key,new T.MeshStandardMaterial({color,roughness:glow?.32:.54,metalness:glow?.25:.08,emissive:glow?color:'#000',emissiveIntensity:glow}));
  return mats.get(key)!;
 };
 const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,glow=0)=>{
  const m=new T.Mesh(new T.BoxGeometry(sx,sy,sz),mat(color,glow));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
 };

 // High-fidelity Banked & Loop-Capable Road Ribbons with Aggregate Micro-Normal & Specular Maps
 const asphaltMaps=makeAsphaltMaps(courseDef.roadColor);
 const asphaltMat=new T.MeshPhysicalMaterial({
  map:asphaltMaps.map,
  roughnessMap:asphaltMaps.rough,
  normalMap:asphaltMaps.normal,
  normalScale:new T.Vector2(0.18,0.18),
  color:courseDef.roadColor,
  roughness:courseDef.id==='polar-vortex'?.18:.42,
  metalness:courseDef.id==='polar-vortex'?.28:.15,
  clearcoat:courseDef.id==='polar-vortex'?.85:.42,
  clearcoatRoughness:.20,
  envMapIntensity:1.25
 });
 const stepsCount=courseDef.loops.length>0?680:520;
 function strip(l1:number,l2:number,color:string,offset=0,glow=0,override?:T.Material){
  const positions:number[]=[],uv:number[]=[],idx:number[]=[];
  for(let i=0;i<=stepsCount;i++){
   for(const lane of [l1,l2]){
    const p=worldPoint(i/stepsCount,lane,offset,courseDef.id);
    positions.push(p.x,p.y,p.z);
    uv.push(lane===l1?0:1,i/6);
   }
   if(i<stepsCount){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  const material=override??mat(color,glow);material.side=T.DoubleSide;
  const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
 }

 // Under-deck bridge foundation & competition road surface
 strip(-74,74,courseDef.deckColor,-.38);
 strip(-69,-63,courseDef.copingColor,.01);
 strip(63,69,courseDef.copingColor,.01);
 strip(-63,63,courseDef.roadColor,0,0,asphaltMat);

 // Glowing Edge & Double-Center Striping
 strip(-58.5,-54.5,courseDef.stripeColor,.025,1.25);
 strip(54.5,58.5,courseDef.stripeColor,.025,1.25);
 strip(-2.4,-.7,courseDef.stripeColor,.03,1.15);
 strip(.7,2.4,courseDef.stripeColor,.03,1.15);
 strip(-28.5,-27.5,courseDef.stripeColor,.022,.55);
 strip(27.5,28.5,courseDef.stripeColor,.022,.55);

 // Alternating Corner Apex Curbs (oriented with full 3D basis so they wrap around 360° loops!)
 const basisHelper=new T.Matrix4();
 for(let i=0;i<160;i++){
  const t=i/160;
  const f=trackFrame(t,0,courseDef.id);
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  for(const side of [-1,1]){
   const p=worldPoint(t,side*60.2,.03,courseDef.id);
   const curbColor=i%2===0?courseDef.curbColorA:courseDef.curbColorB;
   const curb=box(p.x,p.y,p.z,.95,.06,1.45,curbColor,i%2===0?.65:.05);
   curb.quaternion.setFromRotationMatrix(basisHelper);
  }
 }

 // Animated Boost Pads with glowing directional chevrons (including Loop Power Boost pads!)
 const boostPads:{mesh:T.Mesh;padT:number}[]=[];
 for(const t of courseDef.boostPads){
  const f=trackFrame(t,0,courseDef.id);
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  const isLoopPad=courseDef.loops.some(l=>Math.abs(l.boostPadT-t)<0.01);
  const padWidth=isLoopPad?11.5:6.8;
  const padColor=isLoopPad?'#9dff2e':courseDef.stripeColor;
  const pad=box(f.position.x,f.position.y,f.position.z,padWidth,.08,3.8,padColor,1.45);
  pad.position.addScaledVector(f.normal,0.06);
  pad.quaternion.setFromRotationMatrix(basisHelper);
  boostPads.push({mesh:pad,padT:t});
  for(let i=0;i<3;i++){
   const v=box(f.position.x,f.position.y,f.position.z,padWidth*0.36,.04,.22,'#fff4d0',1.7);
   v.position.addScaledVector(f.normal,0.11).addScaledVector(f.tangent,i*.85-.85);
   v.quaternion.setFromRotationMatrix(basisHelper);
  }
 }

 // Small Single-Lane Avoidable Surface Hazards (occupy only ~1.6m of the 22.6m wide road!)
 for(const h of courseDef.hazards){
  const f=trackFrame(h.t,h.lane,courseDef.id);
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  const hCol=h.kind==='crystal'?'#ff9d00':h.kind==='geyser'?'#00f5ff':h.kind==='ice-patch'?'#80f5ff':h.kind==='sand-pocket'?'#e6953e':'#78d629';
  const ring=new T.Mesh(new T.CylinderGeometry(1.35,1.55,0.12,12),mat(hCol,0.95));
  ring.position.copy(f.position).addScaledVector(f.normal,0.06);
  ring.quaternion.setFromRotationMatrix(basisHelper);
  scene.add(ring);
  const spike=new T.Mesh(crestGeometry(),mat(hCol,1.35));
  spike.scale.set(0.55,0.68,0.55);
  spike.position.copy(f.position).addScaledVector(f.normal,0.38);
  spike.quaternion.setFromRotationMatrix(basisHelper);
  scene.add(spike);
 }

 // Viaduct stone support columns beneath elevated sections (checked with isSupportPillarSafe & recessed below deck!)
 for(let i=0;i<18;i++){
  const t=i/18;
  if(!isSupportPillarSafe(t,courseDef.id)) continue;
  const f=trackFrame(t,0,courseDef.id);
  if(!f.inLoop&&f.position.y>-2){
   const topY=f.position.y-0.75; // Safely below the -0.38 under-deck so it NEVER pokes through the road!
   const botY=-14;
   const colH=Math.max(1,topY-botY);
   for(const side of [-1,1]){
    const sp=worldPoint(t,side*46,0,courseDef.id);
    const support=box(sp.x,botY+colH*0.5,sp.z,2.1,colH,2.1,courseDef.deckColor);
    support.position.y=botY+colH*0.5;
   }
  }
 }

 // Start/Finish Ceremonial Arch (Piers placed outside the road at lane ±66)
 function sign(label:string,width=512,height=128){
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d')!;
  ctx.fillStyle='#2a153d';ctx.fillRect(0,0,width,height);
  ctx.fillStyle=courseDef.accent;ctx.fillRect(0,height-12,width,12);
  ctx.fillStyle=courseDef.accent;ctx.fillRect(0,0,width,8);
  ctx.fillStyle='#fff6e8';ctx.font=`900 ${height*.40}px Arial, sans-serif`;ctx.textAlign='center';ctx.fillText(label,width/2,height*.64);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
  return new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
 }
 const gantryT=0.985;
 const startF=trackFrame(gantryT,0,courseDef.id);
 basisHelper.makeBasis(startF.right,startF.normal,startF.tangent);
 for(const lane of [-67,67]){
  const p=worldPoint(gantryT,lane,0,courseDef.id);
  const pier=box(p.x,p.y+6.2,p.z,1.1,12.4,1.1,courseDef.copingColor);
  pier.quaternion.setFromRotationMatrix(basisHelper);
 }
 const banner=new T.Mesh(new T.BoxGeometry(25.5,2.4,.42),sign(courseDef.name.toUpperCase()));
 banner.position.copy(startF.position).addScaledVector(startF.normal,11.8);
 banner.quaternion.setFromRotationMatrix(basisHelper);
 scene.add(banner);

 // Start Grid Checkered Line at t=0
 const t0F=trackFrame(0,0,courseDef.id);
 basisHelper.makeBasis(t0F.right,t0F.normal,t0F.tangent);
 for(let col=0;col<12;col++)for(let row=0;row<2;row++){
  const p=worldPoint(row*.0015,(col-5.5)*8.8,.025,courseDef.id);
  const tile=box(p.x,p.y,p.z,1.45,.02,.72,(row+col)%2?'#fff8eb':'#181426');
  tile.quaternion.setFromRotationMatrix(basisHelper);
 }

 // Wide Glowing Speed Arches framing the final sector (radius 15.8m, outside the ±12m road!)
 for(let i=0;i<5;i++){
  const t=.86+i*.022;
  const f=trackFrame(t,0,courseDef.id);
  if(f.inLoop) continue;
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  const arch=new T.Mesh(new T.TorusGeometry(15.8,.24,8,32,Math.PI),mat(i%2?courseDef.accent:'#ff2e93',1.35));
  arch.position.copy(f.position);
  arch.quaternion.setFromRotationMatrix(basisHelper);
  scene.add(arch);
 }

 const garden=makeGardenWorld(scene,(t,lane=0,offset=0)=>worldPoint(t,lane,offset,courseDef.id),courseDef.id);
 canvas.dataset.course=courseDef.id;
 canvas.dataset.kartDesigns=String(garden.stats.kartDesigns);

 // Wind Rush & Speed Streak Particles
 const speedStreakCount=120;
 const streakPositions=new Float32Array(speedStreakCount*3);
 for(let i=0;i<speedStreakCount;i++){
  streakPositions[i*3]=(Math.random()-.5)*24;
  streakPositions[i*3+1]=(Math.random()-.5)*12;
  streakPositions[i*3+2]=(Math.random()-.5)*35;
 }
 const streakGeo=new T.BufferGeometry();
 streakGeo.setAttribute('position',new T.BufferAttribute(streakPositions,3));
 const streakMat=new T.PointsMaterial({map:glowTex,color:'#fff4d8',size:.42,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,alphaTest:.02});
 const speedStreaks=new T.Points(streakGeo,streakMat);
 scene.add(speedStreaks);

 const contactShadowTex=makeContactShadowTexture();
 const mixers:T.AnimationMixer[]=[];let disposed=false;
 let cameraMode:'hero'|'wide'='hero';

 // Initialize Karts with Blender karts.glb + 3D Drivers + Contact AO Shadow + FIA Harvest LED
 const karts=initial.players.map((p)=>{
  const c=characterById(p.character),root=new T.Group(),{body,wheels,exhaustPorts}=makeKart(c);
  root.add(body);scene.add(root);
  const driver=makeCreature(c);driver.position.set(0,.78,-.18);driver.scale.setScalar(.9);body.add(driver);

  if(p.character==='rello'||p.character==='chora'){
   new GLTFLoader().load(`/kith-party/models/${p.character}.glb`,gltf=>{
    if(disposed){disposeTree(gltf.scene);return;}
    const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const wrapper=new T.Group();const scale=1.68/size.y;
    gltf.scene.position.set(-center.x,-bounds.min.y,-center.z);
    wrapper.add(gltf.scene);wrapper.scale.setScalar(scale);wrapper.position.set(0,.68,-.18);
    gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    body.remove(driver);disposeTree(driver);body.add(wrapper);
    const idle=gltf.animations.find(a=>a.name==='idle');
    if(idle){const mixer=new T.AnimationMixer(gltf.scene);mixer.clipAction(idle).play();mixers.push(mixer);}
   },undefined,()=>{canvas.dataset.modelFallback='true';});
  } else {
   loadDriversGlb().then(driversRoot=>{
    if(disposed) return;
    const template=driversRoot.getObjectByName(`driver_${p.character}`);
    if(!template) return;
    const clonedDriver=template.clone(true);
    clonedDriver.position.set(0,.56,-.18);
    clonedDriver.scale.setScalar(.95);
    clonedDriver.traverse(o=>{
     if(o instanceof T.Mesh){
      o.castShadow=true;o.receiveShadow=true;
      const hasVcol=o.geometry.hasAttribute('color');
      o.material=new T.MeshPhysicalMaterial({
       color:hasVcol?'#ffffff':c.color,
       vertexColors:hasVcol,
       roughness:.34,
       metalness:.06,
       clearcoat:.45,
       envMapIntensity:1.25
      });
     }
    });
    body.remove(driver);disposeTree(driver);body.add(clonedDriver);
   }).catch(()=>{});
  }

  // Dual Rocket Exhaust Flame Plumes
  const flames:T.Mesh[]=[];
  const flameMat=new T.MeshBasicMaterial({color:'#ff8c00',transparent:true,opacity:.92});
  const ports=exhaustPorts||[new T.Vector3(-.36,.48,-1.50),new T.Vector3(.36,.48,-1.50)];
  ports.forEach(pos=>{
   const flame=new T.Mesh(new T.ConeGeometry(.18,1.5,12),flameMat);
   flame.rotation.x=-Math.PI/2;
   flame.position.set(pos.x,pos.y,pos.z-.75);
   flame.visible=false;body.add(flame);flames.push(flame);
  });

  // FIA-style Center Rear Diffuser Rain/Harvest LED Cluster
  const fiaLedMat=new T.MeshBasicMaterial({color:'#ff1e38'});
  const fiaLed=new T.Mesh(new T.BoxGeometry(0.16,0.22,0.06),fiaLedMat);
  fiaLed.position.set(0,0.42,-1.58);
  body.add(fiaLed);

  // Multi-Tier Drift Sparks: Left and Right rear tire fountains
  const sparkGroup=new T.Group();
  const sparkMats=[
   new T.MeshBasicMaterial({color:'#00e5ff'}),
   new T.MeshBasicMaterial({color:'#ff7700'}),
   new T.MeshBasicMaterial({color:'#e040fb'}),
  ];
  const sparkMeshes:T.Mesh[]=[];
  for(const sign of [-1,1]){
   for(let k=0;k<3;k++){
    const m=new T.Mesh(new T.SphereGeometry(.14,6,5),sparkMats[k]);
    m.position.set(sign*1.08,.38,-.95+k*.1);
    m.visible=false;sparkGroup.add(m);sparkMeshes.push(m);
   }
  }
  body.add(sparkGroup);

  // Soft Ground Ambient Occlusion Contact Shadow + Neon Underglow
  const aoShadow=new T.Mesh(
   new T.PlaneGeometry(3.1,4.2),
   new T.MeshBasicMaterial({map:contactShadowTex,transparent:true,opacity:.85,depthWrite:false})
  );
  aoShadow.rotation.x=-Math.PI/2;aoShadow.position.y=.02;root.add(aoShadow);

  const glowColor=p.character==='rello'?'#ff7300':p.character==='chora'?'#ff2e93':c.accent;
  const glowMat=new T.MeshBasicMaterial({map:glowTex,color:glowColor,transparent:true,opacity:.48,blending:T.AdditiveBlending,depthWrite:false});
  const underglow=new T.Mesh(new T.PlaneGeometry(3.8,4.8),glowMat);
  underglow.rotation.x=-Math.PI/2;underglow.position.y=.05;body.add(underglow);

  return {root,body,wheels,flames,sparkMeshes,flameMat,glowMat,fiaLedMat};
 });

 const humans=initial.players.filter(p=>p.human);
 const cameras=humans.map(()=>new T.PerspectiveCamera(58,960/560,.1,620));
 const cameraTargets=humans.map(()=>new T.Vector3());
 const cameraUps=humans.map(()=>new T.Vector3(0,1,0));
 const audioSynthesizer=new KartAudioSynthesizer();
 const kartBasis=new T.Matrix4();
 let initialized=false;let audioInitialized=false;

 return {
  setCameraMode(mode:'hero'|'wide'){cameraMode=mode;},
  getCameraMode(){return cameraMode;},
  render(s:State,dt:number,audioCtx?:AudioContext|null,soundEnabled?:boolean){
   garden.update(dt,Math.max(0,s.time));
   for(const m of mixers)m.update(dt);

   if(audioCtx&&!audioInitialized){audioSynthesizer.init(audioCtx);audioInitialized=true;}
   const leadHuman=s.players[0];
   if(leadHuman){
    audioSynthesizer.update(leadHuman,!!soundEnabled);
    gameAudio.updateRaceTelemetry({
     speedNorm:Math.min(1.5,leadHuman.speed/.070),
     driftStage:leadHuman.driftStage||0,
     boostActive:leadHuman.boost>0,
     inLoop:!!leadHuman.inLoop,
     lap:Math.min(3,Math.max(1,Math.floor(leadHuman.progress)+1)),
    });
   }

   boostPads.forEach(bp=>{
    (bp.mesh.material as T.MeshStandardMaterial).emissiveIntensity=0.95+Math.sin(s.time*12)*.4;
   });

   clouds.forEach(cl=>{cl.sprite.position.x+=cl.speed*dt;if(cl.sprite.position.x>360)cl.sprite.position.x=-360;});
   moteMat.opacity=.45+Math.sin(s.time*2.2)*.15;
   const mAttr=moteGeo.getAttribute('position') as T.BufferAttribute;
   const mArr=mAttr.array as Float32Array;
   for(let mi=0;mi<moteCount;mi++){
    mArr[mi*3+1]+=dt*.7;
    mArr[mi*3]+=Math.sin(s.time*1.4+mi)*dt*.6;
    if(mArr[mi*3+1]>42)mArr[mi*3+1]=2;
   }
   mAttr.needsUpdate=true;

   // Update Karts with full 3D Orthonormal Basis, Hop-Drift, 4-Wheel Suspension & Real-Time 3D Tire Deformation!
   s.players.forEach((p,i)=>{
    const kart=karts[i];
    const frame=trackFrame(p.progress,p.lane,courseDef.id);

    kart.root.position.copy(frame.position).addScaledVector(frame.normal,p.hopY||0);
    kartBasis.makeBasis(frame.right,frame.normal,frame.tangent);
    kart.root.quaternion.setFromRotationMatrix(kartBasis);

    const driftDir=p.driftDir!==0?p.driftDir:(p.steerAngle<0?-1:1);
    const driftAngle=p.drift>0?driftDir*(.30+p.drift*.12)-p.steerAngle*.08:p.steerAngle*.18;
    kart.body.position.y=(p.jounce||0)*0.45;
    kart.body.rotation.y=driftAngle;
    kart.body.rotation.z=p.roll;
    kart.body.rotation.x=p.pitch;

    // 4-Wheel Independent Suspension Travel [RL, RR, FL, FR] + Real-Time 3D Tire Carcass Squish & Slip Deformation
    const wheelTravels=[p.suspensionRL||0, p.suspensionRR||0, p.suspensionFL||0, p.suspensionFR||0];
    kart.wheels.forEach((w,wIdx)=>{
     const baseY=typeof w.userData.baseY==='number'?w.userData.baseY:0.46;
     const load=wheelTravels[wIdx];
     w.position.y=baseY-load*0.55;
     if(wIdx>=2) w.rotation.y=p.steerAngle*.38;
     w.rotation.x-=p.speed*dt*140;
     // Real-time 3D tire carcass deformation based on vertical load and lateral slip angle!
     const squish=Math.max(-0.12,Math.min(0.14,load*0.65+(p.slip||0)*0.06));
     w.scale.set(1+squish*0.85,1-squish*0.55,1+squish*0.35);
    });

    // Blinking FIA Rear Harvest LED cluster
    kart.fiaLedMat.color.set((Math.floor(s.time*12)%2===0||p.boost>0)?'#ff1e38':'#4a0610');

    // Dual Rocket Exhaust Flame Plumes
    const isBoost=p.boost>0;
    const isDrift=p.driftStage>0;
    kart.flames.forEach((flame,fIdx)=>{
     flame.visible=isBoost||p.speed>.035;
     const flameLen=isBoost?2.2+Math.sin(s.time*45+fIdx)*.3:0.55+p.speed*7.5;
     flame.scale.y=flameLen;
     kart.flameMat.color.set(isBoost?'#ff5500':'#ff9900');
    });

    // Multi-tier Drift Spark Particle Emitters
    kart.sparkMeshes.forEach((spark,sIdx)=>{
     const tierIdx=sIdx%3;
     spark.visible=isDrift&&(tierIdx===p.driftStage-1||(p.driftStage===3));
     if(spark.visible){
      spark.position.x=(sIdx<3?-1.08:1.08)+Math.sin(s.time*60+sIdx)*.08;
      spark.position.y=.38+Math.cos(s.time*70+sIdx)*.06;
     }
    });
    kart.glowMat.opacity=isBoost?.72+Math.sin(s.time*26)*.12:.38+p.speed*1.6;
   });

   // Speed Streaks / Wind Rush Particle FX
   const humanP=s.players[0];
   const speedFactor=humanP?Math.max(0,(humanP.speed-.045)/.065):0;
   streakMat.opacity=humanP?.boost>0?0.65:speedFactor*0.35;
   if(humanP&&streakMat.opacity>0){
    const camPos=cameras[0].position;
    speedStreaks.position.copy(camPos);
    speedStreaks.rotation.y=cameras[0].rotation.y;
    const attr=streakGeo.getAttribute('position') as T.BufferAttribute;
    const arr=attr.array as Float32Array;
    for(let k=0;k<speedStreakCount;k++){
     arr[k*3+2]+=dt*(60+(humanP.boost>0?45:0));
     if(arr[k*3+2]>5) arr[k*3+2]=-35;
    }
    attr.needsUpdate=true;
   }

   const rect=canvas.getBoundingClientRect();
   const w=Math.max(320,Math.round(rect.width)),h=Math.max(190,Math.round(rect.height));
   const size=renderer.getSize(new T.Vector2());
   if(size.x!==w||size.y!==h) renderer.setSize(w,h,false);
   renderer.setScissorTest(true);

   // Heroic Low Rear-3/4 Chase Camera (follows curved corridor AND 360° vertical loops!)
   cameras.forEach((camera,i)=>{
    const p=s.players[i];
    const frame=trackFrame(p.progress,p.lane,courseDef.id);

    const isHero=cameraMode==='hero';
    const arcBack=(isHero?.0095:.014)+(p.boost>0?.0022:p.speed*.016);
    const camHeight=(isHero?2.45:4.35)+(p.boost>0?-.22:0);
    const heroLaneBias=isHero?-2.2:0;
    const driftLaneShift=p.drift>0?(p.steerAngle<0?5.5:-5.5):p.steerAngle*-1.8;
    const camLane=Math.max(-54,Math.min(54,p.lane+heroLaneBias+driftLaneShift));
    const camTrackFrame=trackFrame(p.progress-arcBack,camLane,courseDef.id);

    const desired=camTrackFrame.position.clone().addScaledVector(camTrackFrame.normal,camHeight);

    if(p.surface==='curb'||p.boost>0||p.speed>.07){
     const shakeAmp=p.surface==='curb'?.09:p.boost>0?.055:.022;
     desired.x+=Math.sin(s.time*85)*shakeAmp;
     desired.y+=Math.cos(s.time*95)*shakeAmp;
    }

    const lookLane=Math.max(-54,Math.min(54,p.lane*.92));
    const lookAheadFrame=trackFrame(p.progress+(isHero?.024:.018),lookLane,courseDef.id);
    const lookTarget=lookAheadFrame.position.clone().addScaledVector(lookAheadFrame.normal,isHero?2.55:1.65);

    if(!initialized){
     camera.position.copy(desired);
     cameraTargets[i].copy(lookTarget);
     cameraUps[i].copy(frame.normal);
    } else {
     camera.position.lerp(desired,1-Math.exp(-dt*11));
     cameraTargets[i].lerp(lookTarget,1-Math.exp(-dt*14));
     cameraUps[i].lerp(frame.normal,1-Math.exp(-dt*10)).normalize();
    }
    camera.up.copy(cameraUps[i]);
    camera.lookAt(cameraTargets[i]);
    camera.rotation.z+=frame.bankAngle*.38;

    const vh=humans.length>1?h/2:h;
    const bottom=humans.length>1?(1-i)*vh:0;
    camera.aspect=w/vh;

    const baseFov=isHero?56:62;
    const targetFov=p.boost>0?baseFov+18:baseFov+(p.speed/.070)*10;
    camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*8);
    camera.updateProjectionMatrix();

    renderer.setViewport(0,bottom,w,vh);
    renderer.setScissor(0,bottom,w,vh);
    renderer.render(scene,camera);
   });

   initialized=true;
   canvas.dataset.drawCalls=String(renderer.info.render.calls);
  },
  dispose(){
   disposed=true;
   mixers.forEach(m=>m.stopAllAction());
   audioSynthesizer.dispose();
   disposeTree(scene);
   envRT.dispose();
   renderer.dispose();
   renderer.forceContextLoss();
   delete canvas.dataset.renderer;
  },
 };
}

function disposeTree(root:T.Object3D){
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 root.traverse(o=>{
  if(o instanceof T.Mesh||o instanceof T.Points){
   geometries.add(o.geometry);
   (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
    materials.add(m);
    Object.values(m).forEach(v=>{if(v instanceof T.Texture)textures.add(v);});
   });
  }
 });
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
