import * as T from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {Pass, FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/examples/jsm/shaders/FXAAShader.js';

/**
 * Kith Racing FX: one GPU particle system (flame, smoke, tyre smoke, sparks, dust, confetti, ice,
 * electric, explosion, splash, leaf), hot-rod afterburners, rubber skid marks, and a split-screen-aware
 * post pipeline (MSAA, bloom, per-view radial speed blur + chromatic fringe, colour grade, vignette).
 */

// ---------------------------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------------------------

export type FxKind='flame'|'smoke'|'tireSmoke'|'spark'|'dust'|'confetti'|'ice'|'electric'|'explosion'|'splash'|'leaf';

export interface FxSystem {
 update(dt:number, camera:T.Camera):void;
 emit(kind:FxKind, pos:T.Vector3, vel:T.Vector3, count?:number, color?:T.ColorRepresentation, size?:number):void;
 dispose():void;
}

/** shape ids understood by the particle fragment shader */
const SHAPE_SOFT=0, SHAPE_STREAK=1, SHAPE_SQUARE=2, SHAPE_SMOKE=3, SHAPE_FLAME=4, SHAPE_LEAF=5;

interface KindDef {
 additive:boolean; shape:number;
 life:[number,number];        // seconds min..max
 size:[number,number];        // start, end (world metres, before size multiplier)
 colors:[string,string,string]; // start, mid, end
 alpha:[number,number,number];  // start, mid, end
 gravity:number; drag:number; buoyancy:number;
 spread:number;               // random velocity added (m/s)
 spin:number;
 flicker:number;
}

const KINDS:Record<Exclude<FxKind,'explosion'>,KindDef>={
 flame:{additive:true,shape:SHAPE_FLAME,life:[.16,.32],size:[.32,.95],colors:['#fff6d0','#ff8a24','#8a1a08'],alpha:[.85,.55,0],gravity:0,drag:3.2,buoyancy:3,spread:1.6,spin:2,flicker:.35},
 smoke:{additive:false,shape:SHAPE_SMOKE,life:[1.3,2.1],size:[.7,3.6],colors:['#4a4650','#6a6670','#8a8890'],alpha:[.0,.5,0],gravity:0,drag:1.4,buoyancy:1.8,spread:1.1,spin:.6,flicker:0},
 tireSmoke:{additive:false,shape:SHAPE_SMOKE,life:[.9,1.5],size:[.55,3.4],colors:['#f2f0f4','#dcdae0','#c4c2ca'],alpha:[.0,.55,0],gravity:0,drag:2.6,buoyancy:.9,spread:1.4,spin:.5,flicker:0},
 spark:{additive:true,shape:SHAPE_STREAK,life:[.25,.5],size:[.22,.08],colors:['#ffffff','#ffc060','#ff6a10'],alpha:[1,1,0],gravity:-16,drag:.8,buoyancy:0,spread:4,spin:0,flicker:.2},
 dust:{additive:false,shape:SHAPE_SMOKE,life:[.8,1.3],size:[.5,2.6],colors:['#d8b888','#c8a070','#b89060'],alpha:[.0,.5,0],gravity:-1,drag:2.2,buoyancy:0,spread:1.6,spin:.4,flicker:0},
 confetti:{additive:false,shape:SHAPE_SQUARE,life:[1.6,2.6],size:[.22,.18],colors:['#ffffff','#ffffff','#ffffff'],alpha:[1,1,0],gravity:-4.5,drag:1.9,buoyancy:0,spread:5,spin:9,flicker:.5},
 ice:{additive:true,shape:SHAPE_STREAK,life:[.5,.9],size:[.26,.1],colors:['#ffffff','#bff4ff','#5fc8ff'],alpha:[1,.9,0],gravity:-7,drag:1.2,buoyancy:0,spread:3.5,spin:0,flicker:.6},
 electric:{additive:true,shape:SHAPE_STREAK,life:[.1,.22],size:[.5,.2],colors:['#ffffff','#fff27a','#7fd8ff'],alpha:[1,1,0],gravity:0,drag:0,buoyancy:0,spread:9,spin:0,flicker:1},
 splash:{additive:false,shape:SHAPE_SOFT,life:[.6,1.0],size:[.3,.7],colors:['#ffffff','#d6f6ff','#9fe0ff'],alpha:[.9,.7,0],gravity:-13,drag:.6,buoyancy:0,spread:4,spin:0,flicker:0},
 leaf:{additive:false,shape:SHAPE_LEAF,life:[1.8,3],size:[.35,.3],colors:['#7ccf4a','#5aa838','#3d7d28'],alpha:[1,1,0],gravity:-2.2,drag:2.4,buoyancy:0,spread:3,spin:4,flicker:0},
};

const PARTICLE_VERT=`
attribute float aSize;
attribute float aAlpha;
attribute float aShape;
attribute float aRot;
attribute vec3 aColor;
uniform float uViewportH;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vRot;
varying float vSeed;
void main(){
 vec4 mv=modelViewMatrix*vec4(position,1.0);
 gl_Position=projectionMatrix*mv;
 float px=aSize*projectionMatrix[1][1]*uViewportH*0.5/max(0.05,-mv.z);
 gl_PointSize=clamp(px,0.0,uViewportH*0.6);
 vColor=aColor; vAlpha=aAlpha; vShape=aShape; vRot=aRot;
 vSeed=fract(sin(dot(position.xz,vec2(12.9898,78.233)))*43758.5453);
}`;

const PARTICLE_FRAG=`
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vRot;
varying float vSeed;
uniform float uAdditive;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
 vec2 c=gl_PointCoord-0.5;
 float cs=cos(vRot),sn=sin(vRot);
 vec2 r=vec2(c.x*cs-c.y*sn,c.x*sn+c.y*cs);
 float d=length(c)*2.0;
 float a=0.0;
 int shape=int(vShape+0.5);
 if(shape==0){ a=smoothstep(1.0,0.2,d); }
 else if(shape==1){ // streak: thin bright line
  float w=abs(r.y)*7.0; float l=abs(r.x)*2.0;
  a=smoothstep(1.0,0.0,w)*smoothstep(1.0,0.2,l);
 }
 else if(shape==2){ // confetti square, tumbling (squash by rotation)
  vec2 q=abs(r)*vec2(2.0,2.0+abs(sin(vRot*1.7))*4.0);
  a=step(max(q.x,q.y),0.9);
 }
 else if(shape==3){ // smoke puff: soft disc broken by noise
  float n=noise(r*5.0+vSeed*17.0)*0.6+noise(r*11.0-vSeed*9.0)*0.4;
  a=smoothstep(1.0,0.15,d+n*0.45-0.15);
 }
 else if(shape==4){ // flame lick: hot core + ragged edge
  float n=noise(r*6.0+vSeed*31.0);
  a=smoothstep(1.0,0.0,d+(n-0.5)*0.6);
  a*=a;
 }
 else { // leaf
  vec2 q=r*vec2(2.6,1.4);
  a=step(dot(q,q),0.22)*(0.75+0.25*step(abs(r.x),0.03));
 }
 a*=vAlpha;
 if(a<0.004) discard;
 vec3 col=vColor;
 if(shape==4){ col=mix(col,vec3(1.0,0.97,0.86),smoothstep(0.55,0.0,d)*0.8); }
 if(uAdditive>0.5) gl_FragColor=vec4(col*a,a);
 else gl_FragColor=vec4(col,a);
}`;

interface Layer {
 points:T.Points; geo:T.BufferGeometry; mat:T.ShaderMaterial;
 pos:Float32Array; col:Float32Array; size:Float32Array; alpha:Float32Array; shape:Float32Array; rot:Float32Array;
}

export function createFxSystem(scene:T.Scene, opts:{maxParticles?:number}={}):FxSystem {
 const MAX=Math.max(256,opts.maxParticles??5000);
 // particle state (struct of arrays)
 const px=new Float32Array(MAX),py=new Float32Array(MAX),pz=new Float32Array(MAX);
 const vx=new Float32Array(MAX),vy=new Float32Array(MAX),vz=new Float32Array(MAX);
 const age=new Float32Array(MAX),life=new Float32Array(MAX),sizeMul=new Float32Array(MAX);
 const rot=new Float32Array(MAX),spin=new Float32Array(MAX);
 const kindIdx=new Uint8Array(MAX);
 const c0=new Float32Array(MAX*3),c1=new Float32Array(MAX*3),c2=new Float32Array(MAX*3);
 const alive=new Uint8Array(MAX);
 const free:number[]=[];for(let i=MAX-1;i>=0;i--)free.push(i);
 const kindList=Object.keys(KINDS) as (keyof typeof KINDS)[];
 const defs=kindList.map(k=>KINDS[k]);
 const tmpCol=new T.Color(), tmpA=new T.Color(), tmpB=new T.Color(), tmpC=new T.Color();
 const parsed=defs.map(d=>d.colors.map(h=>new T.Color(h)));

 const makeLayer=(additive:boolean,cap:number):Layer=>{
  const geo=new T.BufferGeometry();
  const pos=new Float32Array(cap*3),col=new Float32Array(cap*3),size=new Float32Array(cap),alpha=new Float32Array(cap),shape=new Float32Array(cap),rotA=new Float32Array(cap);
  geo.setAttribute('position',new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aColor',new T.BufferAttribute(col,3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aSize',new T.BufferAttribute(size,1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aAlpha',new T.BufferAttribute(alpha,1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aShape',new T.BufferAttribute(shape,1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aRot',new T.BufferAttribute(rotA,1).setUsage(T.DynamicDrawUsage));
  geo.setDrawRange(0,0);
  geo.boundingSphere=new T.Sphere(new T.Vector3(),1e5);
  const mat=new T.ShaderMaterial({
   vertexShader:PARTICLE_VERT,fragmentShader:PARTICLE_FRAG,
   uniforms:{uViewportH:{value:720},uAdditive:{value:additive?1:0}},
   transparent:true,depthWrite:false,
   blending:additive?T.CustomBlending:T.NormalBlending,
   blendSrc:T.OneFactor,blendDst:T.OneFactor,blendEquation:T.AddEquation,
  });
  const points=new T.Points(geo,mat);
  points.frustumCulled=false;
  points.renderOrder=additive?12:11;
  const vp=new T.Vector4();
  points.onBeforeRender=(renderer)=>{renderer.getCurrentViewport(vp);mat.uniforms.uViewportH.value=Math.max(1,vp.w);};
  scene.add(points);
  return {points,geo,mat,pos,col,size,alpha,shape,rot:rotA};
 };
 const addLayer=makeLayer(true,MAX);
 const alphaLayer=makeLayer(false,MAX);

 const rand=(a:number,b:number)=>a+Math.random()*(b-a);
 const confettiPalette=['#ff4f8b','#ffd23f','#3ddcff','#7cff6b','#b06bff','#ff8a3d'].map(h=>new T.Color(h));

 function spawn(k:number,x:number,y:number,z:number,ivx:number,ivy:number,ivz:number,sm:number,color?:T.ColorRepresentation){
  const i=free.pop();
  if(i===undefined) return;
  const d=defs[k];
  alive[i]=1;kindIdx[i]=k;
  px[i]=x;py[i]=y;pz[i]=z;
  const s=d.spread;
  vx[i]=ivx+rand(-s,s);vy[i]=ivy+rand(-s,s)*.6;vz[i]=ivz+rand(-s,s);
  age[i]=0;life[i]=rand(d.life[0],d.life[1]);sizeMul[i]=sm*rand(.8,1.2);
  rot[i]=Math.random()*6.283;spin[i]=rand(-d.spin,d.spin);
  const pal=parsed[k];
  if(kindList[k]==='confetti'&&color===undefined){
   const cc=confettiPalette[(Math.random()*confettiPalette.length)|0];
   for(let j=0;j<3;j++){c0[i*3+j]=c1[i*3+j]=c2[i*3+j]=(j===0?cc.r:j===1?cc.g:cc.b);}
  } else if(color!==undefined){
   tmpCol.set(color);
   // tint: start whiter, mid = colour, end darker colour
   tmpA.copy(tmpCol).lerp(pal[0],.45);tmpB.copy(tmpCol);tmpC.copy(tmpCol).multiplyScalar(.55);
   c0[i*3]=tmpA.r;c0[i*3+1]=tmpA.g;c0[i*3+2]=tmpA.b;
   c1[i*3]=tmpB.r;c1[i*3+1]=tmpB.g;c1[i*3+2]=tmpB.b;
   c2[i*3]=tmpC.r;c2[i*3+1]=tmpC.g;c2[i*3+2]=tmpC.b;
  } else {
   c0[i*3]=pal[0].r;c0[i*3+1]=pal[0].g;c0[i*3+2]=pal[0].b;
   c1[i*3]=pal[1].r;c1[i*3+1]=pal[1].g;c1[i*3+2]=pal[1].b;
   c2[i*3]=pal[2].r;c2[i*3+1]=pal[2].g;c2[i*3+2]=pal[2].b;
  }
 }

 const K=(name:keyof typeof KINDS)=>kindList.indexOf(name);
 const kFlame=K('flame'),kSmoke=K('smoke'),kSpark=K('spark');

 function emit(kind:FxKind,pos:T.Vector3,vel:T.Vector3,count=1,color?:T.ColorRepresentation,size=1){
  const n=Math.max(0,Math.min(400,Math.round(count)));
  if(kind==='explosion'){
   for(let j=0;j<n;j++){
    const dir=new T.Vector3(rand(-1,1),rand(-.2,1),rand(-1,1)).normalize().multiplyScalar(rand(3,9)*size);
    spawn(kFlame,pos.x,pos.y,pos.z,vel.x+dir.x,vel.y+dir.y,vel.z+dir.z,size*2.2,color);
    if(j%2===0) spawn(kSmoke,pos.x,pos.y,pos.z,vel.x+dir.x*.4,vel.y+dir.y*.4+1,vel.z+dir.z*.4,size*1.6);
    if(j%2===1) spawn(kSpark,pos.x,pos.y,pos.z,vel.x+dir.x*2,vel.y+dir.y*2+3,vel.z+dir.z*2,size);
   }
   return;
  }
  const k=K(kind as keyof typeof KINDS);
  if(k<0) return;
  for(let j=0;j<n;j++) spawn(k,pos.x,pos.y,pos.z,vel.x,vel.y,vel.z,size,color);
 }

 const camPos=new T.Vector3(), camDir=new T.Vector3();
 const order:number[]=[];
 const depth=new Float32Array(MAX);

 function update(dt:number,camera:T.Camera){
  dt=Math.min(dt,.05);
  camera.getWorldPosition(camPos);camera.getWorldDirection(camDir);
  let na=0;
  order.length=0;
  for(let i=0;i<MAX;i++){
   if(!alive[i]) continue;
   age[i]+=dt;
   if(age[i]>=life[i]){alive[i]=0;free.push(i);continue;}
   const d=defs[kindIdx[i]];
   const drag=Math.exp(-d.drag*dt);
   vx[i]*=drag;vz[i]*=drag;vy[i]=vy[i]*drag+(d.gravity+d.buoyancy)*dt;
   if(kindList[kindIdx[i]]==='leaf'){vx[i]+=Math.sin(age[i]*5+i)*dt*4;vz[i]+=Math.cos(age[i]*4+i)*dt*4;}
   px[i]+=vx[i]*dt;py[i]+=vy[i]*dt;pz[i]+=vz[i]*dt;
   rot[i]+=spin[i]*dt;
   if(d.additive){
    writeParticle(addLayer,na++,i,d);
   } else {
    depth[i]=(px[i]-camPos.x)*camDir.x+(py[i]-camPos.y)*camDir.y+(pz[i]-camPos.z)*camDir.z;
    order.push(i);
   }
  }
  // back-to-front for the alpha layer
  if(order.length<2500) order.sort((a,b)=>depth[b]-depth[a]);
  for(let j=0;j<order.length;j++) writeParticle(alphaLayer,j,order[j],defs[kindIdx[order[j]]]);
  finish(addLayer,na);finish(alphaLayer,order.length);
 }

 function writeParticle(L:Layer,slot:number,i:number,d:KindDef){
  const u=age[i]/life[i];
  L.pos[slot*3]=px[i];L.pos[slot*3+1]=py[i];L.pos[slot*3+2]=pz[i];
  const m=u<.35?u/.35:(u-.35)/.65;
  const A=u<.35?c0:c1, B=u<.35?c1:c2;
  for(let j=0;j<3;j++)L.col[slot*3+j]=A[i*3+j]+(B[i*3+j]-A[i*3+j])*m;
  const a0=u<.25?d.alpha[0]:d.alpha[1], a1=u<.25?d.alpha[1]:d.alpha[2];
  const am=u<.25?u/.25:(u-.25)/.75;
  let a=a0+(a1-a0)*am;
  if(d.flicker>0) a*=1-d.flicker*.5+Math.random()*d.flicker*.5;
  L.alpha[slot]=a;
  const ease=1-(1-u)*(1-u);
  L.size[slot]=(d.size[0]+(d.size[1]-d.size[0])*ease)*sizeMul[i];
  L.shape[slot]=d.shape;
  L.rot[slot]=d.shape===SHAPE_STREAK?Math.atan2(vy[i],Math.hypot(vx[i],vz[i])||1e-3):rot[i];
 }
 function finish(L:Layer,count:number){
  L.geo.setDrawRange(0,count);
  if(count===0) return;
  for(const name of ['position','aColor','aSize','aAlpha','aShape','aRot']){
   const attr=L.geo.getAttribute(name) as T.BufferAttribute;
   attr.clearUpdateRanges();attr.addUpdateRange(0,count*attr.itemSize);attr.needsUpdate=true;
  }
 }

 return {
  update,emit,
  dispose(){
   for(const L of [addLayer,alphaLayer]){scene.remove(L.points);L.geo.dispose();L.mat.dispose();}
  },
 };
}

// ---------------------------------------------------------------------------------------------
// Afterburner — hot-rod dragster stack with layered shader flame
// ---------------------------------------------------------------------------------------------

export interface Afterburner {
 group:T.Group;
 update(dt:number, time:number, intensity:number, worldVel:T.Vector3, fx?:FxSystem):void;
 setColors(core:T.ColorRepresentation, outer:T.ColorRepresentation):void;
 dispose():void;
}

const FLAME_VERT=`
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
varying float vAlong;
varying vec3 vN;
varying vec3 vView;
void main(){
 vAlong=clamp(-position.z,0.0,1.0);
 vec3 p=position;
 float wob=sin(uTime*38.0+vAlong*14.0+uSeed)*0.5+sin(uTime*61.0-vAlong*23.0+uSeed*2.0)*0.5;
 p.xy*=1.0+wob*0.12*vAlong*(0.4+uIntensity*0.6);
 p.x+=sin(uTime*23.0+vAlong*6.0+uSeed)*0.05*vAlong*vAlong;
 vec4 mv=modelViewMatrix*vec4(p,1.0);
 vN=normalize(normalMatrix*normal);
 vView=normalize(-mv.xyz);
 gl_Position=projectionMatrix*mv;
}`;

const FLAME_FRAG=`
uniform vec3 uCore;
uniform vec3 uOuter;
uniform float uTime;
uniform float uIntensity;
uniform float uLayer; // 0 = core, 1 = plume
uniform float uDiamonds;
varying float vAlong;
varying vec3 vN;
varying vec3 vView;
void main(){
 float facing=abs(dot(normalize(vN),normalize(vView)));
 float rim=pow(facing,uLayer>0.5?1.6:0.8);
 float tail=pow(1.0-vAlong,uLayer>0.5?1.4:2.2);
 float flick=0.82+0.18*sin(uTime*47.0+vAlong*30.0);
 // shock diamonds: bright nodes spaced down the plume when the stack is really lit
 float diamonds=pow(max(0.0,sin(vAlong*30.0-uTime*6.0)),6.0)*uDiamonds*(1.0-vAlong);
 vec3 col=mix(uCore,uOuter,smoothstep(0.0,0.75,vAlong+(uLayer>0.5?0.25:0.0)));
 col+=uCore*diamonds*1.4;
 float a=rim*tail*flick*(0.35+uIntensity*0.65)+diamonds*0.6;
 a*=smoothstep(0.0,0.05,vAlong+0.02);
 gl_FragColor=vec4(col*a*(1.4+uIntensity),a);
}`;

function makeGlowTexture():T.CanvasTexture{
 const c=document.createElement('canvas');c.width=c.height=64;
 const x=c.getContext('2d')!;
 const g=x.createRadialGradient(32,32,1,32,32,32);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');
 x.fillStyle=g;x.fillRect(0,0,64,64);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
let sharedGlow:T.CanvasTexture|null=null;
const glowTexture=()=>sharedGlow??(sharedGlow=makeGlowTexture());

/** heat-blued chrome: polished silver near the header, straw/gold then blue-violet toward the hot tip */
function heatChromeMaterial(){
 return new T.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,metalness:1,roughness:.12,clearcoat:.6,clearcoatRoughness:.08,envMapIntensity:1.6});
}
function paintHeatGradient(geo:T.BufferGeometry,axis:'y'|'z',from:number,to:number){
 const p=geo.getAttribute('position') as T.BufferAttribute;
 const cols=new Float32Array(p.count*3);
 const silver=new T.Color('#e9edf2'),straw=new T.Color('#e8c27a'),blue=new T.Color('#6a74c8'),c=new T.Color();
 for(let i=0;i<p.count;i++){
  const v=axis==='y'?p.getY(i):p.getZ(i);
  const u=T.MathUtils.clamp((v-from)/(to-from),0,1);
  if(u<.55)c.copy(silver);else if(u<.8)c.copy(silver).lerp(straw,(u-.55)/.25);else c.copy(straw).lerp(blue,(u-.8)/.2);
  cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b;
 }
 geo.setAttribute('color',new T.BufferAttribute(cols,3));
}

export function createAfterburner(opts:{core?:T.ColorRepresentation; outer?:T.ColorRepresentation; scale?:number; light?:boolean}={}):Afterburner {
 const scale=opts.scale??1;
 const group=new T.Group();group.name='afterburner';
 group.scale.setScalar(scale);

 // Chrome zoomie stack with flared bell; opening faces -Z (the group origin is the nozzle exit)
 const profile=[
  new T.Vector2(.105,.0),new T.Vector2(.12,.03),new T.Vector2(.15,.06),new T.Vector2(.16,.075),
  new T.Vector2(.135,.09),new T.Vector2(.115,.15),new T.Vector2(.11,.42),new T.Vector2(.115,.46),new T.Vector2(.125,.47),new T.Vector2(.125,.5),
 ];
 const pipeGeo=new T.LatheGeometry(profile,24);
 pipeGeo.rotateX(Math.PI/2); // lathe axis +Y -> +Z: pipe runs from nozzle (z=0) forward into the kart
 paintHeatGradient(pipeGeo,'z',.5,0);
 const pipe=new T.Mesh(pipeGeo,heatChromeMaterial());
 pipe.castShadow=true;
 group.add(pipe);
 // dark inner throat so the opening reads as a hole
 const throat=new T.Mesh(new T.CircleGeometry(.105,20),new T.MeshBasicMaterial({color:'#120806'}));
 throat.position.z=.06;throat.rotation.y=Math.PI;group.add(throat);
 // hot glowing inner ring
 const ringMat=new T.MeshBasicMaterial({color:'#ff7a2a',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false});
 const ring=new T.Mesh(new T.RingGeometry(.06,.11,24),ringMat);ring.position.z=.02;ring.rotation.y=Math.PI;group.add(ring);

 // Flame layers: unit-length cones from z=0 (nozzle) to z=-1 (tip), scaled per frame
 const coneGeo=(rBase:number,rTip:number)=>{
  const g=new T.CylinderGeometry(rTip,rBase,1,20,28,true);
  g.rotateX(-Math.PI/2);g.translate(0,0,-.5);
  return g;
 };
 const core=new T.Color(opts.core??'#fff4c8'),outer=new T.Color(opts.outer??'#ff4a12');
 const mkMat=(layer:number)=>new T.ShaderMaterial({
  vertexShader:FLAME_VERT,fragmentShader:FLAME_FRAG,
  uniforms:{uCore:{value:core},uOuter:{value:outer},uTime:{value:0},uIntensity:{value:0},uLayer:{value:layer},uDiamonds:{value:0},uSeed:{value:Math.random()*10}},
  transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor,
 });
 const coreMat=mkMat(0),plumeMat=mkMat(1);
 const coreMesh=new T.Mesh(coneGeo(.075,.012),coreMat);
 const plumeMesh=new T.Mesh(coneGeo(.13,.03),plumeMat);
 coreMesh.renderOrder=13;plumeMesh.renderOrder=13;
 coreMesh.frustumCulled=plumeMesh.frustumCulled=false;
 group.add(plumeMesh,coreMesh);

 // camera-facing hot disc at the nozzle (reads well from the chase cam, which looks down the plume)
 const discMat=new T.SpriteMaterial({map:glowTexture(),color:outer.clone(),transparent:true,blending:T.AdditiveBlending,depthWrite:false});
 const disc=new T.Sprite(discMat);disc.position.z=-.08;disc.scale.setScalar(.5);disc.renderOrder=14;group.add(disc);
 const coreDiscMat=new T.SpriteMaterial({map:glowTexture(),color:core.clone(),transparent:true,blending:T.AdditiveBlending,depthWrite:false});
 const coreDisc=new T.Sprite(coreDiscMat);coreDisc.position.z=-.05;coreDisc.scale.setScalar(.25);coreDisc.renderOrder=14;group.add(coreDisc);

 let light:T.PointLight|null=null;
 if(opts.light!==false){
  light=new T.PointLight(outer.getHex(),0,6,2);light.position.z=-1.1;group.add(light);
 }

 const wp=new T.Vector3(),back=new T.Vector3(),q=new T.Quaternion(),v=new T.Vector3();
 let acc=0,smokeAcc=0,smooth=0,lastIntensity=0;

 return {
  group,
  update(dt,time,intensity,worldVel,fx){
   const target=Math.max(0,intensity);
   smooth+=(target-smooth)*Math.min(1,dt*(target>smooth?18:7));
   const I=smooth;
   const idle=.06+Math.sin(time*31)*.02+Math.sin(time*13.7)*.015;
   const len=I<.05?idle:.25+I*1.55+(I>1?(I-1)*1.1:0);
   const pulse=1+Math.sin(time*52)*.06*Math.min(1,I);
   coreMesh.scale.set(pulse*(.8+I*.25),pulse*(.8+I*.25),len*.62);
   plumeMesh.scale.set(pulse*(.9+I*.45),pulse*(.9+I*.45),len);
   for(const m of [coreMat,plumeMat]){
    m.uniforms.uTime.value=time;
    m.uniforms.uIntensity.value=Math.min(1.6,I+.08);
    m.uniforms.uDiamonds.value=T.MathUtils.clamp((I-.75)*2.4,0,1.4);
   }
   discMat.opacity=Math.min(1,.25+I*.75);disc.scale.setScalar(.35+I*.55*pulse);
   coreDiscMat.opacity=Math.min(1,.35+I*.65);coreDisc.scale.setScalar(.18+I*.32);
   ringMat.opacity=.45+Math.min(.55,I*.6);
   if(light) light.intensity=I<.05?.08:(.5+I*2.6)*pulse;

   if(fx){
    group.getWorldPosition(wp);
    group.getWorldQuaternion(q);
    back.set(0,0,-1).applyQuaternion(q);
    // backfire pop when the throttle is slammed
    if(target>.9&&lastIntensity<=.9){
     v.copy(worldVel).multiplyScalar(.5).addScaledVector(back,9);
     fx.emit('flame',wp,v,10,outer,1.3*scale);
     fx.emit('spark',wp,v,8,core,scale);
    }
    if(I>.35){
     acc+=dt*(I>.9?55:24)*I;
     while(acc>=1){
      acc-=1;
      v.copy(worldVel).multiplyScalar(.75).addScaledVector(back,6+I*10);
      fx.emit('flame',wp.clone().addScaledVector(back,.2+Math.random()*.35*I),v,1,outer,(.45+I*.35)*scale);
     }
    }
    // fume: thin grey exhaust haze, thicker when boosting
    smokeAcc+=dt*(I>.9?18:I>.3?6:1.5);
    while(smokeAcc>=1){
     smokeAcc-=1;
     v.copy(worldVel).multiplyScalar(.55).addScaledVector(back,2+I*3);v.y+=.6;
     fx.emit('smoke',wp.clone().addScaledVector(back,.6+len*.7),v,1,undefined,(.45+I*.5)*scale);
    }
   }
   lastIntensity=target;
  },
  setColors(c,o){
   core.set(c);outer.set(o);
   discMat.color.copy(outer);coreDiscMat.color.copy(core);
   if(light) light.color.copy(outer);
  },
  dispose(){
   group.parent?.remove(group);
   group.traverse(o=>{
    if(o instanceof T.Mesh||o instanceof T.Sprite){
     if(o instanceof T.Mesh) o.geometry.dispose();
     (o.material as T.Material).dispose();
    }
   });
  },
 };
}

// ---------------------------------------------------------------------------------------------
// Skid marks — ring buffer of rubber quads
// ---------------------------------------------------------------------------------------------

export interface SkidMarks {
 add(id:number, pos:T.Vector3, normal:T.Vector3, right:T.Vector3, strength:number):void;
 update(dt:number):void;
 dispose():void;
}

export function createSkidMarks(scene:T.Scene, opts:{maxSegments?:number; width?:number; life?:number}={}):SkidMarks {
 const MAX=opts.maxSegments??2400;
 const half=(opts.width??.34)/2;
 const lifeS=opts.life??14;
 const pos=new Float32Array(MAX*4*3);
 const alpha=new Float32Array(MAX*4);
 const born=new Float32Array(MAX*4).fill(-1e6);
 const idx=new Uint32Array(MAX*6);
 for(let s=0;s<MAX;s++){const b=s*4;idx.set([b,b+2,b+1,b+1,b+2,b+3],s*6);}
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));
 geo.setAttribute('aAlpha',new T.BufferAttribute(alpha,1).setUsage(T.DynamicDrawUsage));
 geo.setAttribute('aBorn',new T.BufferAttribute(born,1).setUsage(T.DynamicDrawUsage));
 geo.setIndex(new T.BufferAttribute(idx,1));
 geo.boundingSphere=new T.Sphere(new T.Vector3(),1e5);
 const mat=new T.ShaderMaterial({
  uniforms:{uTime:{value:0},uLife:{value:lifeS},uColor:{value:new T.Color('#0a090c')},...T.UniformsLib.fog},
  vertexShader:`attribute float aAlpha;attribute float aBorn;uniform float uTime;uniform float uLife;varying float vA;
   #include <fog_pars_vertex>
   void main(){float age=uTime-aBorn;vA=aAlpha*(1.0-smoothstep(uLife*0.6,uLife,age));vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
   #include <fog_vertex>
   }`,
  fragmentShader:`uniform vec3 uColor;varying float vA;
   #include <fog_pars_fragment>
   void main(){if(vA<0.003)discard;gl_FragColor=vec4(uColor,vA);
   #include <fog_fragment>
   }`,
  transparent:true,depthWrite:false,fog:true,
  polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4,
 });
 const mesh=new T.Mesh(geo,mat);
 mesh.frustumCulled=false;mesh.renderOrder=2;
 scene.add(mesh);
 let head=0,time=0,dirty=false;
 const last=new Map<number,{l:T.Vector3;r:T.Vector3;a:number}>();
 const L=new T.Vector3(),R=new T.Vector3();
 return {
  add(id,p,normal,right,strength){
   if(strength<=0.01){last.delete(id);return;}
   L.copy(p).addScaledVector(normal,.035).addScaledVector(right,-half);
   R.copy(p).addScaledVector(normal,.035).addScaledVector(right,half);
   const prev=last.get(id);
   const a=Math.min(1,strength)*.82;
   if(!prev){last.set(id,{l:L.clone(),r:R.clone(),a});return;}
   const dist=prev.l.distanceToSquared(L);
   if(dist<.09) return;           // < 30 cm: wait
   if(dist>36){prev.l.copy(L);prev.r.copy(R);prev.a=a;return;} // teleport/respawn: restart
   const b=head*4;
   const write=(k:number,v:T.Vector3,al:number)=>{pos[(b+k)*3]=v.x;pos[(b+k)*3+1]=v.y;pos[(b+k)*3+2]=v.z;alpha[b+k]=al;born[b+k]=time;};
   write(0,prev.l,prev.a);write(1,prev.r,prev.a);write(2,L,a);write(3,R,a);
   head=(head+1)%MAX;
   prev.l.copy(L);prev.r.copy(R);prev.a=a;
   dirty=true;
  },
  update(dt){
   time+=dt;mat.uniforms.uTime.value=time;
   if(dirty){
    (geo.getAttribute('position') as T.BufferAttribute).needsUpdate=true;
    (geo.getAttribute('aAlpha') as T.BufferAttribute).needsUpdate=true;
    (geo.getAttribute('aBorn') as T.BufferAttribute).needsUpdate=true;
    dirty=false;
   }
  },
  dispose(){scene.remove(mesh);geo.dispose();mat.dispose();},
 };
}

// ---------------------------------------------------------------------------------------------
// Post pipeline
// ---------------------------------------------------------------------------------------------

export interface PostView {camera:T.Camera; x:number; y:number; w:number; h:number; speedBlur:number; boostTint:number;}
export interface PostFx {
 render(scene:T.Scene, views:PostView[]):void;
 setSize(w:number, h:number):void;
 setQuality(q:'low'|'high'):void;
 dispose():void;
}

/** Renders every view into the composer's read buffer with its own viewport/scissor (split-screen in one pass). */
class MultiViewRenderPass extends Pass {
 scene:T.Scene|null=null;
 views:PostView[]=[];
 pixelRatio=1;
 clearColor=new T.Color(0,0,0);
 constructor(){super();this.needsSwap=false;}
 render(renderer:T.WebGLRenderer,_write:T.WebGLRenderTarget,read:T.WebGLRenderTarget){
  if(!this.scene) return;
  const oldAuto=renderer.autoClear;
  renderer.autoClear=false;
  read.scissorTest=false;
  read.viewport.set(0,0,read.width,read.height);
  renderer.setRenderTarget(read);
  renderer.setClearColor(this.clearColor,1);
  renderer.clear(true,true,true);
  const pr=this.pixelRatio;
  for(const v of this.views){
   const x=Math.round(v.x*pr),y=Math.round(v.y*pr),w=Math.round(v.w*pr),h=Math.round(v.h*pr);
   read.viewport.set(x,y,w,h);read.scissor.set(x,y,w,h);read.scissorTest=true;
   renderer.setRenderTarget(read);
   renderer.clearDepth();
   renderer.render(this.scene,v.camera);
  }
  read.scissorTest=false;read.viewport.set(0,0,read.width,read.height);
  renderer.setRenderTarget(read);
  renderer.autoClear=oldAuto;
 }
}

/** Kills NaN/Inf (MSAA edge samples of clearcoat/iridescent materials can produce them) and clamps fireflies so bloom stays stable. */
const SanitizeShader={
 uniforms:{tDiffuse:{value:null as T.Texture|null},uMax:{value:20}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uMax;varying vec2 vUv;
  void main(){vec4 c=texture2D(tDiffuse,vUv);
   if(any(isnan(c.rgb))||any(isinf(c.rgb))) c.rgb=vec3(0.0);
   c.rgb=clamp(c.rgb,vec3(0.0),vec3(uMax));gl_FragColor=vec4(c.rgb,1.0);}`,
};

const GradeShader={
 uniforms:{
  tDiffuse:{value:null as T.Texture|null},
  uCount:{value:1},
  uRect:{value:[new T.Vector4(0,0,1,1),new T.Vector4(0,0,1,1)]},
  uBlur:{value:[0,0]},
  uTint:{value:[0,0]},
  uAspect:{value:[1,1]},
  uSaturation:{value:1.14},
  uVignette:{value:.32},
  uTime:{value:0},
 },
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`
 uniform sampler2D tDiffuse;
 uniform int uCount;
 uniform vec4 uRect[2];
 uniform float uBlur[2];
 uniform float uTint[2];
 uniform float uAspect[2];
 uniform float uSaturation;
 uniform float uVignette;
 uniform float uTime;
 varying vec2 vUv;
 float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
 void main(){
  int vi=0;
  if(uCount>1 && vUv.x>=uRect[1].x && vUv.x<=uRect[1].x+uRect[1].z && vUv.y>=uRect[1].y && vUv.y<=uRect[1].y+uRect[1].w) vi=1;
  vec4 R=vi==0?uRect[0]:uRect[1];
  float blur=vi==0?uBlur[0]:uBlur[1];
  float tint=vi==0?uTint[0]:uTint[1];
  float aspect=vi==0?uAspect[0]:uAspect[1];
  vec2 local=(vUv-R.xy)/max(R.zw,vec2(1e-4));
  vec2 center=R.xy+R.zw*vec2(0.5,0.56);
  vec2 dir=vUv-center;
  vec2 ld=(local-vec2(0.5,0.56))*vec2(aspect,1.0);
  float dist=length(ld);
  vec3 col;
  if(blur>0.01){
   float strength=blur*0.045*smoothstep(0.18,0.95,dist);
   vec3 acc=vec3(0.0);
   float jitter=hash(vUv*913.0+uTime)*0.5;
   for(int i=0;i<10;i++){
    float t=(float(i)+jitter)/10.0;
    vec2 uv=vUv-dir*strength*t;
    uv=clamp(uv,R.xy+0.001,R.xy+R.zw-0.001);
    acc+=texture2D(tDiffuse,uv).rgb;
   }
   col=acc/10.0;
   // chromatic fringe toward the edges
   float fr=blur*0.006*dist;
   vec2 uvR=clamp(vUv-dir*fr,R.xy,R.xy+R.zw), uvB=clamp(vUv+dir*fr,R.xy,R.xy+R.zw);
   col.r=mix(col.r,texture2D(tDiffuse,uvR).r,0.6);
   col.b=mix(col.b,texture2D(tDiffuse,uvB).b,0.6);
  } else {
   col=texture2D(tDiffuse,vUv).rgb;
  }
  // colour grade (linear HDR, before tone mapping): lush saturation, warm highlights, lifted cool shadows
  float l=dot(col,vec3(0.2126,0.7152,0.0722));
  col=max(vec3(0.0),mix(vec3(l),col,uSaturation));
  col*=vec3(1.035,1.0,0.965);
  col+=vec3(0.010,0.009,0.020)*(1.0-smoothstep(0.0,0.22,l));
  // boost heat tint on the screen edges
  col+=vec3(1.0,0.42,0.12)*tint*0.35*smoothstep(0.35,1.0,dist);
  // vignette (per view)
  float vig=1.0-uVignette*smoothstep(0.45,1.15,dist*(1.0+blur*0.25));
  col*=vig;
  gl_FragColor=vec4(col,1.0);
 }`,
};

/** Some GPUs/drivers silently render black into a multisampled RGBA16F target. Probe once per renderer. */
const msaaHdrOk=new WeakMap<T.WebGLRenderer,boolean>();
function probeMsaaHdr(renderer:T.WebGLRenderer):boolean{
 const cached=msaaHdrOk.get(renderer);
 if(cached!==undefined) return cached;
 let ok=false;
 const rt=new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,samples:4});
 const prevRT=renderer.getRenderTarget(),prevColor=renderer.getClearColor(new T.Color()),prevAlpha=renderer.getClearAlpha(),prevAuto=renderer.autoClear;
 try{
  // draw real geometry (a clear alone resolves fine on drivers where triangle rendering does not)
  const sc=new T.Scene();
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial({color:new T.Color(1,.5,0),toneMapped:false}));
  quad.frustumCulled=false;sc.add(quad);
  const cam=new T.OrthographicCamera(-1,1,1,-1,-1,1);
  renderer.autoClear=true;
  renderer.setClearColor(0x000000,1);
  renderer.setRenderTarget(rt);
  renderer.render(sc,cam);
  quad.geometry.dispose();(quad.material as T.Material).dispose();
  const buf=new Uint16Array(4);
  renderer.readRenderTargetPixels(rt,1,1,1,1,buf);
  ok=buf[0]>0x3000; // half-float ~1.0 is 0x3c00
 }catch{ok=false;}
 renderer.setRenderTarget(prevRT);renderer.setClearColor(prevColor,prevAlpha);renderer.autoClear=prevAuto;
 rt.dispose();
 msaaHdrOk.set(renderer,ok);
 return ok;
}

export function createPostFx(renderer:T.WebGLRenderer):PostFx {
 const size=renderer.getDrawingBufferSize(new T.Vector2());
 let quality:'low'|'high'='high';
 // HDR is kept in every mode (bloom needs >1 values). MSAA only where the driver resolves RGBA16F correctly;
 // otherwise FXAA covers anti-aliasing.
 const msaa=probeMsaaHdr(renderer);
 const rt=new T.WebGLRenderTarget(Math.max(1,size.x),Math.max(1,size.y),{type:T.HalfFloatType,samples:msaa?4:0});
 const composer=new EffectComposer(renderer,rt);
 composer.setPixelRatio(1);
 const scenePass=new MultiViewRenderPass();
 const bloom=new UnrealBloomPass(new T.Vector2(Math.max(1,size.x/2),Math.max(1,size.y/2)),.5,.6,1.35);
 const sanitize=new ShaderPass(SanitizeShader);
 const grade=new ShaderPass(GradeShader);
 const output=new OutputPass();
 const fxaa=new ShaderPass(FXAAShader);
 fxaa.enabled=!msaa;
 composer.addPass(scenePass);composer.addPass(sanitize);composer.addPass(bloom);composer.addPass(grade);composer.addPass(output);composer.addPass(fxaa);
 let w=size.x,h=size.y;
 const applySize=(dw:number,dh:number)=>{
  w=Math.max(1,dw);h=Math.max(1,dh);
  composer.setSize(w,h);
  bloom.resolution.set(w/(quality==='high'?2:3),h/(quality==='high'?2:3));
  (fxaa.material.uniforms.resolution.value as T.Vector2).set(1/w,1/h);
 };
 const clock=new T.Clock();
 return {
  render(scene,views){
   renderer.getDrawingBufferSize(size);
   if(size.x!==w||size.y!==h) applySize(size.x,size.y);
   const pr=renderer.getPixelRatio();
   scenePass.scene=scene;scenePass.views=views;scenePass.pixelRatio=pr;
   if(scene.background instanceof T.Color) scenePass.clearColor.copy(scene.background);
   const U=grade.material.uniforms;
   U.uCount.value=Math.min(2,views.length);
   views.slice(0,2).forEach((v,i)=>{
    (U.uRect.value as T.Vector4[])[i].set(v.x*pr/w,v.y*pr/h,v.w*pr/w,v.h*pr/h);
    (U.uBlur.value as number[])[i]=T.MathUtils.clamp(v.speedBlur,0,1);
    (U.uTint.value as number[])[i]=T.MathUtils.clamp(v.boostTint,0,1);
    (U.uAspect.value as number[])[i]=v.w/Math.max(1,v.h);
   });
   U.uTime.value=clock.getElapsedTime();
   renderer.setScissorTest(false);
   composer.render();
  },
  setSize(dw,dh){
   // accepts renderer.setSize units; the composer itself always follows the drawing buffer
   const pr=renderer.getPixelRatio();
   applySize(Math.round(dw*pr),Math.round(dh*pr));
  },
  setQuality(q){
   if(q===quality) return;
   quality=q;
   const samples=q==='high'&&msaa?4:0;
   if(composer.renderTarget1.samples!==samples){
    composer.renderTarget1.samples=samples;composer.renderTarget2.samples=samples;
    composer.renderTarget1.dispose();composer.renderTarget2.dispose();
   }
   fxaa.enabled=q==='low'||!msaa;
   bloom.strength=q==='high'?.5:.4;
   applySize(w,h);
  },
  dispose(){
   composer.dispose();sanitize.dispose();bloom.dispose();grade.dispose();output.dispose();fxaa.dispose();rt.dispose();
  },
 };
}

// ---------------------------------------------------------------------------------------------
// Car paint
// ---------------------------------------------------------------------------------------------

/** Clearcoat car paint with metallic flake on painted panels, mirror chrome on metal trims. Idempotent. */
export function upgradeKartPaint(root:T.Object3D){
 root.traverse(o=>{
  if(!(o instanceof T.Mesh)) return;
  const mats=Array.isArray(o.material)?o.material:[o.material];
  const next=mats.map(m=>{
   if(!(m instanceof T.MeshStandardMaterial)) return m;
   if(m.userData.kpPaint) return m;
   const glow=m.emissiveIntensity>.5&&(m.emissive.r+m.emissive.g+m.emissive.b)>.3;
   if(glow){m.userData.kpPaint=true;return m;}
   if(m.metalness>=.7&&!(m instanceof T.MeshPhysicalMaterial&&m.vertexColors)){
    const chrome=new T.MeshPhysicalMaterial({color:m.color.clone().lerp(new T.Color('#ffffff'),.5),metalness:1,roughness:Math.min(.14,m.roughness),clearcoat:.5,clearcoatRoughness:.05,envMapIntensity:1.8,emissive:m.emissive,emissiveIntensity:m.emissiveIntensity});
    chrome.userData.kpPaint=true;
    m.dispose();
    return chrome;
   }
   const isDark=m.color.getHSL({h:0,s:0,l:0}).l<.08&&!m.vertexColors;
   const paint=m instanceof T.MeshPhysicalMaterial?m:new T.MeshPhysicalMaterial({
    color:m.color,map:m.map,vertexColors:m.vertexColors,roughness:m.roughness,metalness:m.metalness,
    emissive:m.emissive,emissiveIntensity:m.emissiveIntensity,emissiveMap:m.emissiveMap,normalMap:m.normalMap,
   });
   if(isDark){ // rubber / carbon: satin, no flake
    paint.clearcoat=Math.max(paint.clearcoat,.25);paint.roughness=Math.max(paint.roughness,.45);
    paint.userData.kpPaint=true;
    if(paint!==m) m.dispose();
    return paint;
   }
   paint.clearcoat=1;paint.clearcoatRoughness=.05;
   paint.metalness=T.MathUtils.clamp(paint.metalness,.25,.55);
   paint.roughness=T.MathUtils.clamp(paint.roughness,.22,.38);
   paint.envMapIntensity=Math.max(paint.envMapIntensity??1,1.45);
   const prevCompile=paint.onBeforeCompile;
   paint.onBeforeCompile=(shader,r)=>{
    prevCompile?.call(paint,shader,r);
    shader.vertexShader=shader.vertexShader
     .replace('#include <common>','#include <common>\nvarying vec3 vFlakeP;')
     .replace('#include <begin_vertex>','#include <begin_vertex>\nvFlakeP=position;');
    shader.fragmentShader=shader.fragmentShader
     .replace('#include <common>','#include <common>\nvarying vec3 vFlakeP;\nfloat kpFlake(vec3 p){return fract(sin(dot(floor(p),vec3(12.9898,78.233,37.719)))*43758.5453);}')
     .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      { vec3 fp=vFlakeP*260.0; vec3 fl=vec3(kpFlake(fp),kpFlake(fp+17.1),kpFlake(fp+41.7))-0.5; normal=normalize(normal+fl*0.22); }`);
   };
   paint.customProgramCacheKey=()=>'kp-flake-paint';
   paint.userData.kpPaint=true;
   paint.needsUpdate=true;
   if(paint!==m) m.dispose();
   return paint;
  });
  o.material=Array.isArray(o.material)?next:next[0];
 });
}

/** Optional: fullscreen-safe speed-line overlay drawn as an additive screen-space quad. Cheap; call render after the scene. */
export function makeSpeedLinesOverlay(){
 const mat=new T.ShaderMaterial({
  uniforms:{uTime:{value:0},uAmount:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
  fragmentShader:`uniform float uTime;uniform float uAmount;varying vec2 vUv;
   float hash(float n){return fract(sin(n)*43758.5453);}
   void main(){vec2 d=vUv-vec2(0.5,0.56);float a=atan(d.y,d.x);float r=length(d);
    float ray=floor(a*60.0);float h=hash(ray);
    float streak=step(0.82,h)*smoothstep(0.25,0.75,r)*fract(h*13.0+uTime*(2.0+h*3.0)-r*2.0);
    float al=streak*uAmount*0.35;if(al<0.004)discard;gl_FragColor=vec4(vec3(1.0)*al,al);}`,
  transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,
 });
 const quad=new FullScreenQuad(mat);
 return {
  render(renderer:T.WebGLRenderer,time:number,amount:number){
   if(amount<=.01) return;
   mat.uniforms.uTime.value=time;mat.uniforms.uAmount.value=amount;
   const auto=renderer.autoClear;renderer.autoClear=false;quad.render(renderer);renderer.autoClear=auto;
  },
  dispose(){quad.dispose();mat.dispose();},
 };
}
