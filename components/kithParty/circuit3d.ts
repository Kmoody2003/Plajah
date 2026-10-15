import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {characterById} from './catalog';
import {makeCreature} from './creatures3d';
import {type State, type Player} from './engine';
import {worldPoint, trackFrame, trackBanking} from './course3d';
import {makeKart} from './karts3d';
import {makeGardenWorld} from './gardenWorld3d';

/** ---- Graphics-pass atmosphere helpers: procedural sky, clouds, glow sprites, asphalt ---- */

function makeSkyDome():T.Mesh{
 const geo=new T.SphereGeometry(420,32,20);
 const sunDir=new T.Vector3(-30,68,28).normalize();
 const material=new T.ShaderMaterial({
  side:T.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:sunDir}},
  vertexShader:`
   varying vec3 vDir;
   void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`
   varying vec3 vDir;uniform vec3 sunDir;
   void main(){
    vec3 d=normalize(vDir);
    float h=d.y;
    vec3 zenith=vec3(0.16,0.42,0.94);
    vec3 mid=vec3(0.52,0.72,0.98);
    vec3 horizon=vec3(1.0,0.85,0.92);
    vec3 below=vec3(0.96,0.74,0.86);
    vec3 col=h>0.0
     ? mix(mix(horizon,mid,smoothstep(0.0,0.32,h)),zenith,smoothstep(0.28,0.85,h))
     : mix(horizon,below,smoothstep(0.0,-0.35,h));
    float s=max(dot(d,normalize(sunDir)),0.0);
    col+=vec3(1.0,0.88,0.66)*pow(s,600.0)*1.6;
    col+=vec3(1.0,0.72,0.5)*pow(s,10.0)*0.28;
    float band=smoothstep(0.04,0.14,h)*smoothstep(0.65,0.28,h);
    float n=sin(d.x*8.0+1.7)*sin(d.z*6.0-0.6)*sin((d.x+d.z)*4.5+0.8);
    float clouds=smoothstep(0.15,0.8,n)*band;
    col=mix(col,vec3(1.0,0.96,0.99),clouds*0.5);
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
 g.addColorStop(0,'rgba(255,255,255,0.9)');g.addColorStop(0.4,'rgba(255,255,255,0.35)');g.addColorStop(1,'rgba(255,255,255,0)');
 x.fillStyle=g;x.fillRect(0,0,128,128);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

function makeAsphaltMaps():{map:T.CanvasTexture;rough:T.CanvasTexture}{
 const c=document.createElement('canvas');c.width=256;c.height=256;
 const x=c.getContext('2d')!;
 x.fillStyle='#191a2b';x.fillRect(0,0,256,256);
 for(let i=0;i<2800;i++){
  const v=Math.random();
  x.fillStyle=v>.58?'rgba(255,210,180,0.055)':'rgba(6,8,18,0.28)';
  const s=1+Math.random()*2.2;
  x.fillRect(Math.random()*256,Math.random()*256,s,s);
 }
 for(let i=0;i<42;i++){
  x.fillStyle='rgba(255,150,90,0.04)';
  x.beginPath();x.arc(Math.random()*256,Math.random()*256,9+Math.random()*24,0,7);x.fill();
 }
 const map=new T.CanvasTexture(c);
 map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
 const rc=document.createElement('canvas');rc.width=64;rc.height=64;
 const rx=rc.getContext('2d')!;
 rx.fillStyle='#787888';rx.fillRect(0,0,64,64);
 for(let i=0;i<320;i++){
  const v=80+(Math.random()*95|0);
  rx.fillStyle=`rgb(${v},${v},${v})`;
  rx.fillRect(Math.random()*64,Math.random()*64,2,2);
 }
 const rough=new T.CanvasTexture(rc);rough.wrapS=rough.wrapT=T.RepeatWrapping;
 return {map,rough};
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

/** Tiny procedural sky baked to a PMREM env map so glossy paint & crystals have something vivid to reflect. */
function buildEnvironment(renderer:T.WebGLRenderer):T.WebGLRenderTarget{
 const pmrem=new T.PMREMGenerator(renderer);
 const env=new T.Scene();
 env.add(new T.Mesh(new T.SphereGeometry(50,16,12),new T.MeshBasicMaterial({side:T.BackSide,color:'#7db8f5'})));
 const ground=new T.Mesh(new T.CircleGeometry(45,16),new T.MeshBasicMaterial({color:'#d48aa6'}));
 ground.rotation.x=-Math.PI/2;ground.position.y=-4;env.add(ground);
 const sun=new T.Mesh(new T.SphereGeometry(6,12,10),new T.MeshBasicMaterial({color:'#fff2d0'}));
 sun.position.set(28,32,-12);env.add(sun);
 const pink=new T.Mesh(new T.SphereGeometry(10,10,8),new T.MeshBasicMaterial({color:'#ff9ecf'}));
 pink.position.set(-24,10,22);env.add(pink);
 const warm=new T.Mesh(new T.SphereGeometry(8,10,8),new T.MeshBasicMaterial({color:'#ff9d3b'}));
 warm.position.set(18,4,15);env.add(warm);
 const rt=pmrem.fromScene(env,0.04);
 pmrem.dispose();
 return rt;
}

/** Procedural Web Audio synthesizer for kart racing (engine pitch, drift screech, turbo blast, curb buzz). */
class KartAudioSynthesizer {
 private ctx:AudioContext|null=null;
 private engineGain:GainNode|null=null;
 private engineOsc:OscillatorNode|null=null;
 private engineOsc2:OscillatorNode|null=null;
 private engineFilter:BiquadFilterNode|null=null;
 private driftGain:GainNode|null=null;
 private driftNoise:AudioBufferSourceNode|null=null;
 private curbGain:GainNode|null=null;
 private curbOsc:OscillatorNode|null=null;
 private lastBoost=0;
 private enabled=true;

 init(ctx:AudioContext){
  this.ctx=ctx;
  try{
   // Engine dual oscillator
   this.engineFilter=ctx.createBiquadFilter();
   this.engineFilter.type='lowpass';this.engineFilter.frequency.value=400;this.engineFilter.Q.value=3.5;
   this.engineGain=ctx.createGain();this.engineGain.gain.value=0;
   this.engineOsc=ctx.createOscillator();this.engineOsc.type='sawtooth';this.engineOsc.frequency.value=60;
   this.engineOsc2=ctx.createOscillator();this.engineOsc2.type='triangle';this.engineOsc2.frequency.value=120;
   this.engineOsc.connect(this.engineFilter);this.engineOsc2.connect(this.engineFilter);
   this.engineFilter.connect(this.engineGain);this.engineGain.connect(ctx.destination);
   this.engineOsc.start();this.engineOsc2.start();

   // Drift screech noise buffer
   const bufSize=ctx.sampleRate*2;
   const noiseBuf=ctx.createBuffer(1,bufSize,ctx.sampleRate);
   const out=noiseBuf.getChannelData(0);
   for(let i=0;i<bufSize;i++) out[i]=(Math.random()*2-1)*.8;
   this.driftNoise=ctx.createBufferSource();this.driftNoise.buffer=noiseBuf;this.driftNoise.loop=true;
   const driftFilter=ctx.createBiquadFilter();
   driftFilter.type='bandpass';driftFilter.frequency.value=1600;driftFilter.Q.value=4.5;
   this.driftGain=ctx.createGain();this.driftGain.gain.value=0;
   this.driftNoise.connect(driftFilter);driftFilter.connect(this.driftGain);this.driftGain.connect(ctx.destination);
   this.driftNoise.start();

   // Curb rumble oscillator
   this.curbGain=ctx.createGain();this.curbGain.gain.value=0;
   this.curbOsc=ctx.createOscillator();this.curbOsc.type='square';this.curbOsc.frequency.value=48;
   const curbFilter=ctx.createBiquadFilter();curbFilter.type='lowpass';curbFilter.frequency.value=180;
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
  const baseFreq=60+speedRatio*180+(p.boost>0?65:0);
  if(this.engineOsc) this.engineOsc.frequency.setTargetAtTime(baseFreq,t,.05);
  if(this.engineOsc2) this.engineOsc2.frequency.setTargetAtTime(baseFreq*1.5,t,.05);
  if(this.engineFilter) this.engineFilter.frequency.setTargetAtTime(320+speedRatio*1900+(p.boost>0?800:0),t,.05);
  if(this.engineGain) this.engineGain.gain.setTargetAtTime(.08+speedRatio*.07,t,.05);

  // Drift screech
  if(this.driftGain){
   const target=p.drift>.15?Math.min(.18,.05+p.drift*.09):0;
   this.driftGain.gain.setTargetAtTime(target,t,.04);
  }
  // Curb chatter
  if(this.curbGain){
   const target=p.surface==='curb'?.09:0;
   this.curbGain.gain.setTargetAtTime(target,t,.03);
  }
  // Trigger turbo blast on fresh boost
  if(p.boost>0&&this.lastBoost===0){
   this.playTurboBlast();
  }
  this.lastBoost=p.boost;
 }

 playTurboBlast(){
  if(!this.ctx||!this.enabled||this.ctx.state!=='running') return;
  try{
   const ctx=this.ctx,t=ctx.currentTime;
   const osc=ctx.createOscillator();osc.type='sawtooth';
   osc.frequency.setValueAtTime(340,t);osc.frequency.exponentialRampToValueAtTime(80,t+.35);
   const gain=ctx.createGain();gain.gain.setValueAtTime(.22,t);gain.gain.exponentialRampToValueAtTime(.001,t+.4);
   osc.connect(gain);gain.connect(ctx.destination);
   osc.start(t);osc.stop(t+.42);
  }catch{}
 }

 dispose(){
  try{
   this.engineOsc?.stop();this.engineOsc2?.stop();this.driftNoise?.stop();this.curbOsc?.stop();
  }catch{}
 }
}

export function createCircuit3D(canvas:HTMLCanvasElement,initial:State) {
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(960,560,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
 canvas.dataset.renderer='three-webgl';

 const scene=new T.Scene();
 scene.fog=new T.FogExp2('#f4d5e6',.0019);
 scene.add(makeSkyDome());
 const envRT=buildEnvironment(renderer);
 scene.environment=envRT.texture;
 scene.environmentIntensity=.78;

 // Sun glow billboard, drifting candy clouds, golden air sparkles (with soft radial glow texture!)
 const glowTex=makeGlowTexture();
 const sunGlow=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:'#ffdf9e',transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
 sunGlow.position.set(55,64,-10).normalize().multiplyScalar(390);sunGlow.scale.setScalar(165);scene.add(sunGlow);
 const puffTex=makePuffTexture();
 const clouds:{sprite:T.Sprite;speed:number}[]=[];
 for(let i=0;i<14;i++){
  const sp=new T.Sprite(new T.SpriteMaterial({map:puffTex,transparent:true,opacity:.48+Math.random()*.28,depthWrite:false,fog:false,color:'#fff7fb'}));
  const a=Math.random()*Math.PI*2,r=165+Math.random()*130;
  sp.position.set(Math.cos(a)*r,52+Math.random()*44,Math.sin(a)*r);
  const s=48+Math.random()*54;sp.scale.set(s,s*.52,1);
  scene.add(sp);clouds.push({sprite:sp,speed:.6+Math.random()*1.4});
 }
 const moteCount=150;
 const motePos=new Float32Array(moteCount*3);
 for(let i=0;i<moteCount;i++){motePos[i*3]=(Math.random()-.5)*220;motePos[i*3+1]=2+Math.random()*36;motePos[i*3+2]=(Math.random()-.5)*220;}
 const moteGeo=new T.BufferGeometry();
 moteGeo.setAttribute('position',new T.BufferAttribute(motePos,3));
 const moteMat=new T.PointsMaterial({map:glowTex,color:'#ffe7a0',size:.85,transparent:true,opacity:.65,blending:T.AdditiveBlending,depthWrite:false,alphaTest:.02});
 const motes=new T.Points(moteGeo,moteMat);scene.add(motes);

 const hemi=new T.HemisphereLight('#f6f8ff','#7a5d7e',2.1);scene.add(hemi);
 const sun=new T.DirectionalLight('#ffebd2',3.6);
 sun.position.set(42,68,-18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-95,right:95,top:80,bottom:-80,near:1,far:180});
 sun.shadow.bias=-.0006;scene.add(sun);
 const fill=new T.DirectionalLight('#e38cff',1.35);fill.position.set(-45,26,38);scene.add(fill);

 const mats=new Map<string,T.MeshStandardMaterial>();
 const mat=(color:string,glow=0)=>{
  const key=color+glow;
  if(!mats.has(key)) mats.set(key,new T.MeshStandardMaterial({color,roughness:glow?.32:.58,metalness:glow?.25:.08,emissive:glow?color:'#000',emissiveIntensity:glow}));
  return mats.get(key)!;
 };
 const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,glow=0)=>{
  const m=new T.Mesh(new T.BoxGeometry(sx,sy,sz),mat(color,glow));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
 };

 // High-fidelity Banked Road Ribbons matching Concept Art
 const asphaltMaps=makeAsphaltMaps();
 const asphaltMat=new T.MeshPhysicalMaterial({
  map:asphaltMaps.map,
  roughnessMap:asphaltMaps.rough,
  color:'#202236',
  roughness:.44,
  metalness:.14,
  clearcoat:.38,
  clearcoatRoughness:.26,
  envMapIntensity:.9
 });
 function strip(l1:number,l2:number,color:string,offset=0,glow=0,override?:T.Material){
  const positions:number[]=[],uv:number[]=[],idx:number[]=[];
  for(let i=0;i<=400;i++){
   for(const lane of [l1,l2]){
    const p=worldPoint(i/400,lane,offset);
    positions.push(p.x,p.y,p.z);
    uv.push(lane===l1?0:1,i/8);
   }
   if(i<400){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  const material=override??mat(color,glow);material.side=T.DoubleSide;
  const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
 }

 // Under-deck carved stone bridge foundation & dark reflective asphalt track surface
 strip(-74,74,'#cbb8cc',-.34); // Warm stone viaduct deck foundation underneath road
 strip(-69,-63,'#ded0be',.01); // Left carved stone curb coping
 strip(63,69,'#ded0be',.01);   // Right carved stone curb coping
 strip(-63,63,'#1c1d30',0,0,asphaltMat); // Dark competition tarmac with clearcoat sheen

 // Concept-Art Glowing Orange Edge & Double-Center Striping
 strip(-58.5,-54.5,'#ff7b00',.025,1.25);
 strip(54.5,58.5,'#ff7b00',.025,1.25);
 strip(-2.4,-.7,'#ff9b1f',.03,1.15);
 strip(.7,2.4,'#ff9b1f',.03,1.15);
 // Subtle racing lane guide filaments
 strip(-28.5,-27.5,'#ff8811',.022,.55);
 strip(27.5,28.5,'#ff8811',.022,.55);

 // Alternating Amber & Ivory Corner Apex Curbs
 for(let i=0;i<140;i++){
  const t=i/140;
  for(const side of [-1,1]){
   const p=worldPoint(t,side*60.2,.03);
   const q=worldPoint(t+.001,side*60.2,.03);
   const angle=Math.atan2(q.x-p.x,q.z-p.z);
   const curbColor=i%2===0?'#ff7300':'#f7ead8';
   const curb=box(p.x,p.y,p.z,.95,.06,1.35,curbColor,i%2===0?.65:.05);
   curb.rotation.y=angle;
  }
 }

 // Animated Boost Pads with glowing directional chevrons
 const boostPads:{mesh:T.Mesh;padT:number}[]=[];
 for(const t of [.09,.17,.49,.78]){
  const p=worldPoint(t),q=worldPoint(t+.001),angle=Math.atan2(q.x-p.x,q.z-p.z);
  const pad=box(p.x,p.y+.06,p.z,6.8,.06,3.4,'#ff7300',1.35);
  pad.rotation.y=angle;
  boostPads.push({mesh:pad,padT:t});
  for(let i=0;i<3;i++){
   const v=box(p.x,p.y+.11,p.z,2.4,.03,.18,'#fff4d0',1.6);
   v.rotation.y=angle+Math.PI/4;
   v.position.add(new T.Vector3(Math.sin(angle),0,Math.cos(angle)).multiplyScalar(i*.75-.75));
  }
 }

 // Viaduct stone support columns beneath the circuit
 for(let i=0;i<14;i++){
  const p=worldPoint(i/14);
  const support=box(p.x,-4,p.z,2.6,Math.max(1,p.y+8),2.6,'#8e7b96');
  support.position.y=(p.y-8)/2;
 }

 // Start/Finish Ceremonial Arch (placed slightly behind grid at t=0.985 so opening vista is 100% unobstructed)
 function sign(label:string,width=512,height=128){
  const c=document.createElement('canvas');c.width=width;c.height=height;
  const ctx=c.getContext('2d')!;
  ctx.fillStyle='#2a153d';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#ff9419';ctx.fillRect(0,height-12,width,12);
  ctx.fillStyle='#ff9419';ctx.fillRect(0,0,width,8);
  ctx.fillStyle='#fff6e8';ctx.font=`900 ${height*.44}px Arial, sans-serif`;ctx.textAlign='center';ctx.fillText(label,width/2,height*.65);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
  return new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});
 }
 const gantryT=0.982;
 const start=worldPoint(gantryT);
 for(const lane of [-64,64]){
  const p=worldPoint(gantryT,lane);
  box(p.x,p.y+5.8,p.z,1.1,11.6,1.1,'#e6d7c3');
 }
 const banner=new T.Mesh(new T.BoxGeometry(24,2.4,.42),sign('KITH CIRCUIT'));
 banner.position.set(start.x,start.y+11.2,start.z);
 const startDir=worldPoint(gantryT+.001).sub(start).normalize();
 banner.rotation.y=Math.atan2(startDir.x,startDir.z);scene.add(banner);

 // Start Grid Checkered Line at t=0
 for(let col=0;col<12;col++)for(let row=0;row<2;row++){
  const p=worldPoint(row*.002,(col-5.5)*8.8,.025);
  box(p.x,p.y,p.z,1.45,.02,.72,(row+col)%2?'#fff8eb':'#181426');
 }

 // Glowing Crystal Speed Arches framing the final sector
 for(let i=0;i<6;i++){
  const t=.62+i*.02,p=worldPoint(t),q=worldPoint(t+.001),arch=new T.Mesh(new T.TorusGeometry(11.5,.22,8,32,Math.PI),mat(i%2?'#ff8c00':'#ff2e93',1.35));
  arch.position.copy(p);arch.rotation.y=Math.atan2(q.x-p.x,q.z-p.z);scene.add(arch);
 }

 const garden=makeGardenWorld(scene,worldPoint);
 canvas.dataset.course='crestfall-gardens';canvas.dataset.kartDesigns=String(garden.stats.kartDesigns);

 // Wind Rush & Speed Streak Particles (with soft radial glow texture!)
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

 const mixers:T.AnimationMixer[]=[];let disposed=false;
 let cameraMode:'hero'|'wide'='hero';

 // Initialize Karts with Blender karts.glb + 3D Drivers (rello.glb, chora.glb, and drivers.glb)
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

  // Multi-Tier Drift Sparks: Left and Right rear tire fountains
  const sparkGroup=new T.Group();
  const sparkMats=[
   new T.MeshBasicMaterial({color:'#00e5ff'}), // Tier 1: Blue sparks
   new T.MeshBasicMaterial({color:'#ff7700'}), // Tier 2: Orange flame sparks
   new T.MeshBasicMaterial({color:'#e040fb'}), // Tier 3: Ultra purple lightning sparks
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

  // Soft neon underglow pooling beneath the kart (concept-art warm orange/magenta road reflection)
  const glowColor=p.character==='rello'?'#ff7300':p.character==='chora'?'#ff2e93':c.accent;
  const glowMat=new T.MeshBasicMaterial({map:glowTex,color:glowColor,transparent:true,opacity:.48,blending:T.AdditiveBlending,depthWrite:false});
  const underglow=new T.Mesh(new T.PlaneGeometry(3.8,4.8),glowMat);
  underglow.rotation.x=-Math.PI/2;underglow.position.y=.05;body.add(underglow);

  return {root,body,wheels,flames,sparkMeshes,flameMat,glowMat};
 });

 const humans=initial.players.filter(p=>p.human);
 const cameras=humans.map(()=>new T.PerspectiveCamera(58,960/560,.1,520));
 const cameraTargets=humans.map(()=>new T.Vector3());
 const audioSynthesizer=new KartAudioSynthesizer();
 let initialized=false;let audioInitialized=false;

 return {
  setCameraMode(mode:'hero'|'wide'){cameraMode=mode;},
  getCameraMode(){return cameraMode;},
  render(s:State,dt:number,audioCtx?:AudioContext|null,soundEnabled?:boolean){
   garden.update(dt,Math.max(0,s.time));
   for(const m of mixers)m.update(dt);

   // Update Audio Synthesizer for Player 1
   if(audioCtx&&!audioInitialized){audioSynthesizer.init(audioCtx);audioInitialized=true;}
   if(s.players[0]) audioSynthesizer.update(s.players[0],!!soundEnabled);

   // Update Boost Pad Chevrons Pulse
   boostPads.forEach(bp=>{
    (bp.mesh.material as T.MeshStandardMaterial).emissiveIntensity=0.95+Math.sin(s.time*12)*.4;
   });

   // Drift candy clouds, breathe golden air sparkles
   clouds.forEach(cl=>{cl.sprite.position.x+=cl.speed*dt;if(cl.sprite.position.x>320)cl.sprite.position.x=-320;});
   moteMat.opacity=.45+Math.sin(s.time*2.2)*.15;
   const mAttr=moteGeo.getAttribute('position') as T.BufferAttribute;
   const mArr=mAttr.array as Float32Array;
   for(let mi=0;mi<moteCount;mi++){
    mArr[mi*3+1]+=dt*.7;
    mArr[mi*3]+=Math.sin(s.time*1.4+mi)*dt*.6;
    if(mArr[mi*3+1]>42)mArr[mi*3+1]=2;
   }
   mAttr.needsUpdate=true;

   // Update Karts with authentic banked orientation, chassis physics, and particle FX
   s.players.forEach((p,i)=>{
    const kart=karts[i];
    const frame=trackFrame(p.progress,p.lane);
    const ahead=trackFrame(p.progress+.001,p.lane);
    const direction=ahead.position.clone().sub(frame.position).normalize();

    kart.root.position.copy(frame.position);
    kart.root.rotation.y=Math.atan2(direction.x,direction.z);
    kart.root.rotation.x=-Math.asin(direction.y);
    kart.root.rotation.z=frame.bankAngle;

    // Chassis Pitch, Roll, and Drift Yaw Slant
    const driftAngle=p.drift>0?(p.steerAngle<0?-1:1)*(.28+p.drift*.12):p.steerAngle*.18;
    kart.body.rotation.y=driftAngle;
    kart.body.rotation.z=p.roll;
    kart.body.rotation.x=p.pitch;

    // Front wheels steer cleanly around Y axis (order='YXZ')
    kart.wheels.slice(2,4).forEach(w=>{
     w.rotation.y=p.steerAngle*.38;
    });
    // Spin all wheels with forward speed
    kart.wheels.forEach(w=>w.rotation.x-=p.speed*dt*140);

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

   // Heroic Low Rear-3/4 Chase Camera (Faithfully matching Concept Art Perspective & following curved road corridor)
   cameras.forEach((camera,i)=>{
    const p=s.players[i];
    const frame=trackFrame(p.progress,p.lane);
    const forward=trackFrame(p.progress+.012,p.lane).position.sub(frame.position).normalize();

    const isHero=cameraMode==='hero';
    const arcBack=(isHero?.0128:.0185)+(p.boost>0?.003:p.speed*.022);
    const camHeight=(isHero?2.42:4.35)+(p.boost>0?-.22:0);
    // Subtle rear-3/4 chase offset clamped strictly within [-54, 54] (well inside the ±67 balustrade guardrails!)
    const heroLaneBias=isHero?-2.2:0;
    const driftLaneShift=p.drift>0?(p.steerAngle<0?5.5:-5.5):p.steerAngle*-1.8;
    const camLane=Math.max(-54,Math.min(54,p.lane+heroLaneBias+driftLaneShift));
    const camTrackFrame=trackFrame(p.progress-arcBack,camLane);

    const desired=camTrackFrame.position.clone().add(new T.Vector3(0,camHeight,0));

    // Curb vibration and speed rumble shake
    if(p.surface==='curb'||p.boost>0||p.speed>.07){
     const shakeAmp=p.surface==='curb'?.10:p.boost>0?.06:.025;
     desired.x+=Math.sin(s.time*85)*shakeAmp;
     desired.y+=Math.cos(s.time*95)*shakeAmp;
    }

    const lookLane=Math.max(-54,Math.min(54,p.lane*.92));
    const lookAheadFrame=trackFrame(p.progress+(isHero?.032:.024),lookLane);
    const lookTarget=lookAheadFrame.position.clone().add(new T.Vector3(0,isHero?2.65:1.65,0));

    if(!initialized){
     camera.position.copy(desired);
     cameraTargets[i].copy(lookTarget);
    } else {
     camera.position.lerp(desired,1-Math.exp(-dt*11));
     cameraTargets[i].lerp(lookTarget,1-Math.exp(-dt*14));
    }
    camera.lookAt(cameraTargets[i]);

    // Roll camera slightly into road banking
    camera.rotation.z+=frame.bankAngle*.38;

    const vh=humans.length>1?h/2:h;
    const bottom=humans.length>1?(1-i)*vh:0;
    camera.aspect=w/vh;

    // Dynamic FOV warp: 56° at rest (cinematic 35mm lens), expanding on turbo boost!
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
