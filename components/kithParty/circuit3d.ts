import * as T from 'three';
import {kithGltfLoader} from './kithGltf';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {characterById} from './catalog';
import {makeCreature} from './creatures3d';
import {type State, type Player, CIRCUIT_INTRO} from './engine';
import {worldPoint, trackFrame, courseById, setActiveCourse, isSupportPillarSafe, isGapAt, shortcutFrame, finishProgress, courseShortcuts, normT, courseLength, courseMorphs, morphState, hazardSolid, windFans, FAN_RADIUS, type CourseDef} from './course3d';
import {makeKart, crestGeometry} from './karts3d';
import {makeGardenWorld} from './gardenWorld3d';
import {gameAudio} from './audio';
import {buildTrackFeatures} from './trackFeatures3d';
import {createFxSystem, createAfterburner, createSkidMarks, createPostFx, upgradeKartPaint, type Afterburner} from './fx3d';
import {kithKart, ITEMS} from './abilities';
import type {RaceEvent} from './race';

/** World frame for a racer, following shortcuts when they're on one. */
function racerFrame(p:Player,courseId:CourseDef['id']){
 return p.cut>=0?shortcutFrame(courseId,p.cut,p.cutU,p.lane):trackFrame(p.progress,p.lane,courseId);
}

/** ---- Graphics-pass atmosphere helpers: procedural sky, clouds, glow sprites, micro-normal asphalt ---- */

export function makeSkyDome(course:CourseDef):T.Mesh{
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

export function makePuffTexture():T.CanvasTexture{
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

export function makeGlowTexture():T.CanvasTexture{
 const c=document.createElement('canvas');c.width=128;c.height=128;
 const x=c.getContext('2d')!;
 const g=x.createRadialGradient(64,64,4,64,64,64);
 g.addColorStop(0,'rgba(255,255,255,0.92)');g.addColorStop(0.4,'rgba(255,255,255,0.35)');g.addColorStop(1,'rgba(255,255,255,0)');
 x.fillStyle=g;x.fillRect(0,0,128,128);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

export function makeContactShadowTexture():T.CanvasTexture{
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
export function loadDriversGlb():Promise<T.Group>{
 if(!driversGlbPromise){
  driversGlbPromise=new Promise((resolve,reject)=>{
   if(typeof window==='undefined'){reject(new Error('no-window'));return;}
   kithGltfLoader().load('/kith-party/models/drivers.glb',gltf=>resolve(gltf.scene),undefined,err=>reject(err));
  });
 }
 return driversGlbPromise;
}

/** Course-aware HDR procedural studio/sky dome baked to a PMREM env map for realistic automotive reflections. */
export function buildEnvironment(renderer:T.WebGLRenderer,course:CourseDef):T.WebGLRenderTarget{
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

// Kart engines, tyres and race one-shots live in audio.ts (RaceSoundscape via gameAudio.race).

export function createCircuit3D(canvas:HTMLCanvasElement,initial:State) {
 const courseDef=courseById(initial.course);
 setActiveCourse(courseDef.id);
 gameAudio.setCourse(courseDef.id);

 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 const maxPixelRatio=Math.min(window.devicePixelRatio||1,1.75);renderer.setPixelRatio(maxPixelRatio);let warmed=false,compiled=false,uploaded=false,slowFor=0,fastFor=0;const warmHidden:T.Object3D[]=[],warmTex:T.Texture[]=[];renderer.setSize(960,560,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 canvas.dataset.renderer='three-webgl';

 const scene=new T.Scene();
 scene.fog=new T.FogExp2(courseDef.fogColor,courseDef.fogDensity);
 scene.add(makeSkyDome(courseDef));
 const envRT=buildEnvironment(renderer,courseDef);
 scene.environment=envRT.texture;
 scene.environmentIntensity=.92;

 // Sun glow billboard, anamorphic horizon flare, drifting clouds, air sparkles
 const glowTex=makeGlowTexture();
 const sunGlow=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:courseDef.id==='abyssal-trench'?'#3df5ff':'#ffdf9e',transparent:true,opacity:.55,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
 sunGlow.position.set(55,64,-10).normalize().multiplyScalar(420);sunGlow.scale.setScalar(185);scene.add(sunGlow);
 const sunStreak=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:'#fff0cc',transparent:true,opacity:.24,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
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
 sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;scene.add(sun);scene.add(sun.target);
 const sunOffset=new T.Vector3(55,82,-24).normalize().multiplyScalar(120);
 Object.assign(sun.shadow.camera,{left:-75,right:75,top:75,bottom:-75,near:1,far:260});sun.shadow.camera.updateProjectionMatrix();
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
 // ---- track morphs: road strips + set dressing inside a morph zone are re-laid whenever the zone reshapes ----
 const morphZones=courseMorphs(courseDef.id);
 const inMorph=(t:number,pad=0)=>morphZones.some(z=>t>z.startT-pad&&t<z.endT+pad);
 const dynStrips:{mesh:T.Mesh;l1:number;l2:number;offset:number;steps:number;t0:number;t1:number;wall?:boolean}[]=[];
 const followers:{obj:T.Object3D;t:number;local:T.Matrix4}[]=[];
 const frameMat=(t:number)=>{const f=trackFrame(t,0,courseDef.id);return new T.Matrix4().makeBasis(f.right,f.normal,f.tangent).setPosition(f.position);};
 /** Keep a static prop glued to the road at progress t when its section morphs. */
 function follow(obj:T.Object3D,t:number){if(!inMorph(t,.004))return;obj.updateMatrix();followers.push({obj,t,local:frameMat(t).invert().multiply(obj.matrix.clone())});}
 let morphApplied:number[]=morphZones.map(()=>-1);
 function refreshMorphs(){
  const st=morphState(courseDef.id);
  const dirty=morphZones.map((_,i)=>Math.abs(st[i].m-morphApplied[i])>.0015||(st[i].m===0&&morphApplied[i]!==0));
  if(!dirty.some(Boolean))return;
  morphZones.forEach((z,zi)=>{
   if(!dirty[zi])return;
   morphApplied[zi]=st[zi].m;
   // one morph-aware frame per sample row, shared by every strip on the same grid (was 2 frames per vertex
   // per strip, plus full-mesh normal + bounds rebuilds: ~40 ms a frame while a section reshaped)
   const frameCache=new Map<number,{p:T.Vector3;r:T.Vector3;n:T.Vector3}>();
   const fr=(t:number)=>{let f=frameCache.get(t);if(!f){const q=trackFrame(t,0,courseDef.id);f={p:q.position,r:q.right,n:q.normal};frameCache.set(t,f);}return f;};
   const A=new T.Vector3(),B=new T.Vector3(),A2=new T.Vector3(),along=new T.Vector3(),across=new T.Vector3();
   const put=(out:T.Vector3,f:{p:T.Vector3;r:T.Vector3;n:T.Vector3},lane:number,off:number)=>out.copy(f.p).addScaledVector(f.r,lane*.18).addScaledVector(f.n,off);
   for(const d of dynStrips){
    const geo=d.mesh.geometry,pos=geo.getAttribute('position') as T.BufferAttribute,nor=geo.getAttribute('normal') as T.BufferAttribute|undefined;
    const i0=Math.max(0,Math.floor((z.startT-.003-d.t0)/(d.t1-d.t0)*d.steps)),i1=Math.min(d.steps,Math.ceil((z.endT+.003-d.t0)/(d.t1-d.t0)*d.steps));
    if(i1<i0)continue;
    for(let i=i0;i<=i1;i++){
     const f=fr(d.t0+(d.t1-d.t0)*i/d.steps);
     if(d.wall){put(A,f,d.l1,0);put(B,f,d.l1,d.offset);}else{put(A,f,d.l1,d.offset);put(B,f,d.l2,d.offset);}
     pos.setXYZ(i*2,A.x,A.y,A.z);pos.setXYZ(i*2+1,B.x,B.y,B.z);
    }
    if(nor){ // flat ribbon normals for just the touched rows (same winding as computeVertexNormals)
     for(let i=i0;i<=i1;i++){
      const j=i<d.steps?i:i-1;
      A.fromBufferAttribute(pos,j*2);A2.fromBufferAttribute(pos,(j+1)*2);B.fromBufferAttribute(pos,j*2+1);
      along.subVectors(A2,A);across.subVectors(B,A);along.cross(across).normalize();
      nor.setXYZ(i*2,along.x,along.y,along.z);nor.setXYZ(i*2+1,along.x,along.y,along.z);
     }
     nor.addUpdateRange(i0*6,(i1-i0+1)*6);nor.needsUpdate=true;
    }
    pos.addUpdateRange(i0*6,(i1-i0+1)*6);pos.needsUpdate=true;
   }
   for(const f of followers)if(f.t>z.startT-.004&&f.t<z.endT+.004){f.obj.matrix.copy(frameMat(f.t).multiply(f.local));f.obj.matrix.decompose(f.obj.position,f.obj.quaternion,f.obj.scale);}
  });
 }
 function strip(l1:number,l2:number,color:string,offset=0,glow=0,override?:T.Material,skipGaps=true){
  const positions:number[]=[],uv:number[]=[],idx:number[]=[];
  for(let i=0;i<=stepsCount;i++){
   for(const lane of [l1,l2]){
    const p=worldPoint(i/stepsCount,lane,offset,courseDef.id);
    positions.push(p.x,p.y,p.z);
    uv.push(lane===l1?0:1,i/6);
   }
   if(i<stepsCount&&!(skipGaps&&isGapAt((i+.5)/stepsCount,courseDef.id))){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  const material=override??mat(color,glow);material.side=T.DoubleSide;
  const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);
  if(morphZones.length)dynStrips.push({mesh,l1,l2,offset,steps:stepsCount,t0:0,t1:1});
  return mesh;
 }
 /** Glowing energy rails + compression field marking each morph zone (opacity follows the morph). */
 const morphFx:{mats:T.MeshBasicMaterial[];zi:number;tex:T.Texture}[]=[];
 if(morphZones.length){
  const c=document.createElement('canvas');c.width=64;c.height=128;const x=c.getContext('2d')!;
  x.clearRect(0,0,64,128);x.strokeStyle='#ffffff';x.lineWidth=10;x.lineCap='round';
  for(const y of [24,88]){x.beginPath();x.moveTo(8,y+28);x.lineTo(32,y);x.lineTo(56,y+28);x.stroke();}
  morphZones.forEach((z,zi)=>{
   const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;
   const steps=Math.max(24,Math.round((z.endT-z.startT)*900));
   const field=new T.MeshBasicMaterial({map:tex,color:courseDef.accent,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
   const rail=new T.MeshBasicMaterial({color:courseDef.accent,transparent:true,opacity:.35,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
   const mk=(l1:number,l2:number,off:number,m:T.Material,wall:boolean)=>{
    const P:number[]=[],UV:number[]=[],I:number[]=[];
    for(let i=0;i<=steps;i++){const t=z.startT+(z.endT-z.startT)*i/steps;
     const a=wall?worldPoint(t,l1,0,courseDef.id):worldPoint(t,l1,off,courseDef.id),b=wall?worldPoint(t,l1,off,courseDef.id):worldPoint(t,l2,off,courseDef.id);
     P.push(a.x,a.y,a.z,b.x,b.y,b.z);UV.push(0,i/steps*(z.endT-z.startT)*courseLength(courseDef.id)/6,wall?0:4,i/steps*(z.endT-z.startT)*courseLength(courseDef.id)/6);
     if(i<steps){const j=i*2;I.push(j,j+2,j+1,j+1,j+2,j+3);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('uv',new T.Float32BufferAttribute(UV,2));g.setIndex(I);g.computeVertexNormals();
    const mesh=new T.Mesh(g,m);mesh.renderOrder=2;mesh.frustumCulled=false;scene.add(mesh);dynStrips.push({mesh,l1,l2,offset:off,steps,t0:z.startT,t1:z.endT,wall});
   };
   mk(-63,63,.06,field,false);
   for(const side of [-1,1]){mk(side*64.5,0,1.15,rail,true);mk(side*64.5,0,.12,rail,true);}
   morphFx.push({mats:[field,rail],zi,tex});
  });
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
  if(isGapAt(t,courseDef.id)||isGapAt(t+.003,courseDef.id)||isGapAt(t-.003,courseDef.id)) continue;
  const f=trackFrame(t,0,courseDef.id);
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  for(const side of [-1,1]){
   const p=worldPoint(t,side*60.2,.03,courseDef.id);
   const curbColor=i%2===0?courseDef.curbColorA:courseDef.curbColorB;
   const curb=box(p.x,p.y,p.z,.95,.06,1.45,curbColor,i%2===0?.65:.05);
   curb.quaternion.setFromRotationMatrix(basisHelper);follow(curb,t);
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
  pad.quaternion.setFromRotationMatrix(basisHelper);follow(pad,t);
  boostPads.push({mesh:pad,padT:t});
  for(let i=0;i<3;i++){
   const v=box(f.position.x,f.position.y,f.position.z,padWidth*0.36,.04,.22,'#fff4d0',1.7);
   v.position.addScaledVector(f.normal,0.11).addScaledVector(f.tangent,i*.85-.85);
   v.quaternion.setFromRotationMatrix(basisHelper);follow(v,t);
  }
 }

 // Small Single-Lane Avoidable Surface Hazards (occupy only ~1.6m of the 22.6m wide road!)
 const fanSpinners:T.Object3D[]=[],fanColumns:T.Mesh[]=[];
 for(const h of courseDef.hazards){
  const f=trackFrame(h.t,h.lane,courseDef.id);
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  if(h.kind==='sand-pocket'){
   // a real, solid sand pile (race.ts hazardSolid): wind-rippled mound you bounce off unless you fly over it
   const sol=hazardSolid(h)!;
   const g=new T.SphereGeometry(sol.radius,28,14,0,Math.PI*2,0,Math.PI/2),pos=g.getAttribute('position');
   for(let k=0;k<pos.count;k++){const x=pos.getX(k),y=pos.getY(k),z=pos.getZ(k),a=Math.atan2(z,x);
    const ripple=1+.06*Math.sin(a*5+y*2.2)+.04*Math.sin(x*3.1+z*2.3);pos.setXYZ(k,x*ripple,y*(sol.height/sol.radius)*(1+.05*Math.sin(a*3)),z*ripple);}
   g.computeVertexNormals();
   const sand=new T.MeshStandardMaterial({color:'#e3a55c',roughness:.97,metalness:0});
   const mound=new T.Mesh(g,sand);mound.castShadow=true;mound.receiveShadow=true;
   mound.position.copy(f.position).addScaledVector(f.normal,-.05);mound.quaternion.setFromRotationMatrix(basisHelper);
   scene.add(mound);follow(mound,h.t);
   // no loose-sand skirt: what you see is exactly what's solid (race.ts hazardSolid radius)
   continue;
  }
  const hCol=h.kind==='crystal'?'#ff9d00':h.kind==='geyser'?'#00f5ff':h.kind==='ice-patch'?'#80f5ff':(h.kind as string)==='sand-pocket'?'#e6953e':'#78d629';
  const ring=new T.Mesh(new T.CylinderGeometry(1.35,1.55,0.12,12),mat(hCol,0.95));
  ring.position.copy(f.position).addScaledVector(f.normal,0.06);
  ring.quaternion.setFromRotationMatrix(basisHelper);
  scene.add(ring);follow(ring,h.t);
  const spike=new T.Mesh(crestGeometry(),mat(hCol,1.35));
  spike.scale.set(0.55,0.68,0.55);
  spike.position.copy(f.position).addScaledVector(f.normal,0.38);
  spike.quaternion.setFromRotationMatrix(basisHelper);
  scene.add(spike);follow(spike,h.t);
 }

 // Wind fans set into the road before each sand pile: grate, spinning rotor, glowing rim, shimmering updraft
 for(const fan of windFans(courseDef.id)){
  const f=trackFrame(fan.t,fan.lane,courseDef.id);
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  const g=new T.Group();g.position.copy(f.position).addScaledVector(f.normal,.04);g.quaternion.setFromRotationMatrix(basisHelper);
  const R=FAN_RADIUS;
  const well=new T.Mesh(new T.CylinderGeometry(R,R,.08,36),new T.MeshStandardMaterial({color:'#1c1a22',roughness:.6,metalness:.6}));g.add(well);
  const rim=new T.Mesh(new T.TorusGeometry(R,.16,10,48),mat('#ffb347',1.6));rim.rotation.x=Math.PI/2;rim.position.y=.07;g.add(rim);
  const rotor=new T.Group();rotor.position.y=.06;
  for(let b=0;b<6;b++){const blade=new T.Mesh(new T.BoxGeometry(R*.9,.05,.5),new T.MeshStandardMaterial({color:'#c9ccd6',roughness:.35,metalness:.85}));blade.position.x=R*.47;blade.rotation.x=.45;const arm=new T.Group();arm.rotation.y=b*Math.PI/3;arm.add(blade);rotor.add(arm);}
  const hub=new T.Mesh(new T.CylinderGeometry(.45,.45,.14,16),mat('#ff8c00',1.2));rotor.add(hub);g.add(rotor);fanSpinners.push(rotor);
  for(let k=-3;k<=3;k++){const bar=new T.Mesh(new T.BoxGeometry(.07,.06,R*2*Math.sqrt(1-(k/3.6)**2)),new T.MeshStandardMaterial({color:'#3a3844',metalness:.7,roughness:.4}));bar.position.set(k*R/3.6,.12,0);g.add(bar);}
  // updraft: a few faint vertical streaks (a solid additive column blooms into a white-out when you drive through it)
  const colMat=new T.MeshBasicMaterial({color:'#fff0d0',transparent:true,opacity:.07,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide});
  for(let k=0;k<5;k++){const a=k*1.257,streak=new T.Mesh(new T.PlaneGeometry(.22,5.5),colMat);streak.position.set(Math.cos(a)*R*.55,2.9,Math.sin(a)*R*.55);streak.rotation.y=-a;g.add(streak);fanColumns.push(streak);}
  const arrow=new T.Mesh(new T.ConeGeometry(.55,1.1,4),mat('#ffd27a',1.4));arrow.position.y=2.2;g.add(arrow);fanColumns.push(arrow as T.Mesh);
  scene.add(g);follow(g,fan.t);
 }

 // Viaduct stone support columns beneath elevated sections (checked with isSupportPillarSafe & recessed below deck!)
 for(let i=0;i<18;i++){
  const t=i/18;
  if(!isSupportPillarSafe(t,courseDef.id)||isGapAt(t,courseDef.id)||inMorph(t,.02)||courseDef.tunnels.some(z=>t>z.startT-.01&&t<z.endT+.01)) continue;
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
 const gantryT=courseDef.kind==='sprint'?finishProgress(courseDef.id)+.004:0.985;
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
 const t0F=trackFrame(courseDef.kind==='sprint'?.02:0,0,courseDef.id);
 basisHelper.makeBasis(t0F.right,t0F.normal,t0F.tangent);
 for(let col=0;col<12;col++)for(let row=0;row<2;row++){
  const p=worldPoint((courseDef.kind==='sprint'?.02:0)+row*.0015,(col-5.5)*8.8,.025,courseDef.id);
  const tile=box(p.x,p.y,p.z,1.45,.02,.72,(row+col)%2?'#fff8eb':'#181426');
  tile.quaternion.setFromRotationMatrix(basisHelper);
 }

 // Wide Glowing Speed Arches framing the final sector (radius 15.8m, outside the ±12m road!)
 for(let i=0;i<5;i++){
  const t=(courseDef.kind==='sprint'?.88:.86)+i*.022;
  const f=trackFrame(t,0,courseDef.id);
  if(f.inLoop||isGapAt(t,courseDef.id)||courseDef.tunnels.some(z=>t>z.startT-.01&&t<z.endT+.01)) continue;
  basisHelper.makeBasis(f.right,f.normal,f.tangent);
  const arch=new T.Mesh(new T.TorusGeometry(15.8,.24,8,32,Math.PI),mat(i%2?courseDef.accent:'#ff2e93',1.35));
  arch.position.copy(f.position);
  arch.quaternion.setFromRotationMatrix(basisHelper);
  scene.add(arch);follow(arch,t);
 }

 const garden=makeGardenWorld(scene,(t:number,lane=0,offset=0)=>worldPoint(t,lane,offset,courseDef.id),courseDef.id);
 const features=buildTrackFeatures(scene,courseDef);
 const fx=createFxSystem(scene,{maxParticles:7000});
 const skid=createSkidMarks(scene,{maxSegments:2400});
 const post=createPostFx(renderer);
 const L=courseLength(courseDef.id);
 const shortcutLens=courseShortcuts(courseDef.id).map(sc=>sc.length);
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

 // ---- cinematic intro (course flyover) + countdown drone shot into each player's kart ----
 const cMin=new T.Vector3(1e9,1e9,1e9),cMax=new T.Vector3(-1e9,-1e9,-1e9);
 for(let i=0;i<160;i++){const q=trackFrame(i/160*.999,0,courseDef.id).position;cMin.min(q);cMax.max(q);}
 const cCenter=cMin.clone().add(cMax).multiplyScalar(.5),cSpan=Math.max(cMax.x-cMin.x,cMax.z-cMin.z)/2;
 const featureT=courseDef.bridges.length?courseDef.bridges[0].startT-.03:courseDef.tunnels.length?courseDef.tunnels[0].startT-.05:courseDef.jumps.length?courseDef.jumps[0].t-.06:.3;
 const gridT=courseDef.kind==='sprint'?.02:0;
 const smooth=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 /** Camera pose while the race hasn't started; null = hand over to the chase cam. */
 function cinematicPose(time:number,p:Player,i:number):{pos:T.Vector3;look:T.Vector3;fov:number}|null{
  if(time>=-.3)return null;
  if(time<-3){
   const u=Math.max(0,Math.min(1,(time+3+CIRCUIT_INTRO)/CIRCUIT_INTRO));
   if(u<.42){ // 1: high crane orbit over the whole course
    const k=smooth(u/.42),a=-.9+k*1.25;
    return {pos:cCenter.clone().add(new T.Vector3(Math.cos(a)*cSpan*1.18,105-38*k,Math.sin(a)*cSpan*1.18)),look:cCenter.clone().add(new T.Vector3(0,-6,0)),fov:50};
   }
   if(u<.74){ // 2: low, fast fly-through along the road toward the course's showpiece
    const k=(u-.42)/.32,t=featureT-.05+k*.11;
    const f=trackFrame(t,Math.sin(k*3.1)*30,courseDef.id),la=trackFrame(t+.025,0,courseDef.id);
    return {pos:f.position.clone().addScaledVector(f.normal,5.5+Math.sin(k*Math.PI)*5),look:la.position.clone().addScaledVector(la.normal,2),fov:64};
   }
   // 3: sweeping crane past the start grid and gantry
   const k=smooth((u-.74)/.26),g=trackFrame(gridT-.012,0,courseDef.id),a=-1.15+k*1.6;
   const off=g.right.clone().multiplyScalar(Math.cos(a)*30).addScaledVector(g.tangent,Math.sin(a)*30);
   return {pos:g.position.clone().add(off).addScaledVector(g.normal,13-k*6),look:g.position.clone().addScaledVector(g.normal,1.6),fov:46};
  }
  // countdown: drone drops from a wide aerial into this player's chase position
  const k=smooth((time+3)/2.7);
  const f=trackFrame(p.progress,0,courseDef.id);
  const chase=trackFrame(p.progress-7.6/L,Math.max(-54,Math.min(54,p.lane-2.2)),courseDef.id);
  const end=chase.position.clone().addScaledVector(chase.normal,2.45);
  const lk=trackFrame(p.progress+19/L,p.lane*.92,courseDef.id);
  const endLook=lk.position.clone().addScaledVector(lk.normal,2.55);
  const side=i%2?-1:1;
  const start=f.position.clone().addScaledVector(f.tangent,-62).addScaledVector(f.normal,58).addScaledVector(f.right,side*44);
  const ctrl=f.position.clone().addScaledVector(f.tangent,-26).addScaledVector(f.normal,30).addScaledVector(f.right,side*30);
  const a1=start.clone().lerp(ctrl,k),a2=ctrl.clone().lerp(end,k);
  const look=f.position.clone().addScaledVector(f.normal,1.2).lerp(endLook,smooth((k-.35)/.65));
  return {pos:a1.lerp(a2,k),look,fov:44+12*k};
 }
 const contactShadowTex=makeContactShadowTexture();
 const mixers:T.AnimationMixer[]=[];let disposed=false;
 let cameraMode:'hero'|'wide'='hero';

 // Initialize Karts with Blender karts.glb + 3D Drivers + Contact AO Shadow + FIA Harvest LED
 const karts=initial.players.map((p)=>{
  const c=characterById(p.character),root=new T.Group(),{body,wheels,exhaustPorts,updateRig}=makeKart(c);
  root.add(body);scene.add(root);
  const driver=makeCreature(c);driver.position.set(0,.78,-.18);driver.scale.setScalar(.9);body.add(driver);

  if(p.character==='rello'||p.character==='chora'){
   kithGltfLoader().load(`/kith-party/models/${p.character}.glb`,gltf=>{
    if(disposed){disposeTree(gltf.scene);return;}
    const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const wrapper=new T.Group();const scale=2.05/size.y; // hero-sized: big head over the cowl, legs sunk into the cockpit
    gltf.scene.position.set(-center.x,-bounds.min.y,-center.z);
    wrapper.add(gltf.scene);wrapper.scale.setScalar(scale);wrapper.position.set(0,.42,-.22);
    gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    body.remove(driver);disposeTree(driver);body.add(wrapper);wrapper.name='kith-driver';
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

  // Hot-rod dragster afterburners on every exhaust stack (colours from the Kith type)
  const kk=kithKart(p.character);
  const ports=exhaustPorts&&exhaustPorts.length?exhaustPorts:[new T.Vector3(-.36,.48,-1.50),new T.Vector3(.36,.48,-1.50)];
  const burners:Afterburner[]=ports.map((pos,pi)=>{
   const ab=createAfterburner({core:kk.flameCore,outer:kk.flameOuter,scale:.9,light:pi===0&&p.human});
   ab.group.position.copy(pos);body.add(ab.group);return ab;
  });
  upgradeKartPaint(body);

  // Ability / state visuals
  const shieldMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{uTime:{value:0},uColor:{value:new T.Color('#7ee8ff')}},
   vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
   fragmentShader:'uniform float uTime;uniform vec3 uColor;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(vN,vV)),2.2);float hex=step(.92,fract(vN.y*14.+uTime*.6))*.35;gl_FragColor=vec4(uColor*(f*1.6+hex),f*.9+hex*.4);}'});
  const shield=new T.Mesh(new T.SphereGeometry(2.5,28,20),shieldMat);shield.position.y=1;shield.visible=false;root.add(shield);
  const gears=new T.Group();gears.visible=false;root.add(gears);
  const gearMat=new T.MeshStandardMaterial({color:'#e08a3a',metalness:.9,roughness:.28,emissive:'#5a2a00',emissiveIntensity:.4});
  for(let g=0;g<3;g++){const gear=new T.Mesh(new T.CylinderGeometry(.55,.55,.16,12),gearMat);gear.rotation.x=Math.PI/2;for(let k=0;k<8;k++){const tooth=new T.Mesh(new T.BoxGeometry(.22,.16,.22),gearMat);const a=k/8*Math.PI*2;tooth.position.set(Math.cos(a)*.62,0,Math.sin(a)*.62);gear.add(tooth);}gears.add(gear);}
  const boulder=new T.Mesh(new T.IcosahedronGeometry(2.3,1),new T.MeshStandardMaterial({color:'#9a6a48',roughness:.95,flatShading:true}));boulder.position.y=1.1;boulder.visible=false;boulder.castShadow=true;root.add(boulder);
  const iceBlock=new T.Mesh(new RoundedIce(),new T.MeshPhysicalMaterial({color:'#bfefff',roughness:.05,transparent:true,opacity:.55,clearcoat:1,envMapIntensity:2}));iceBlock.position.y=1;iceBlock.visible=false;root.add(iceBlock);
  const drone=makeDrone();drone.visible=false;root.add(drone);
  const itemHeld=new T.Sprite(new T.SpriteMaterial({map:null,transparent:true,depthWrite:false}));itemHeld.visible=false;itemHeld.position.set(0,2.9,-1.6);itemHeld.scale.setScalar(.9);root.add(itemHeld);

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

  return {root,body,wheels,updateRig,burners,sparkMeshes,glowMat,fiaLedMat,shield,shieldMat,gears,boulder,iceBlock,drone,itemHeld,kk,boostTint:null as null|[string,string],lastBoost:0};
 });


 // ---- Projectiles & traps: pooled meshes keyed by sim id ----
 const actorMeshes=new Map<number,T.Object3D>();
 const actorMat={
  seed:new T.MeshStandardMaterial({color:'#7ee05a',emissive:'#3a9a1a',emissiveIntensity:1.2,roughness:.3}),
  hornet:new T.MeshStandardMaterial({color:'#ffcc33',emissive:'#7a5a00',emissiveIntensity:.6,roughness:.35,metalness:.2}),
  stripe:new T.MeshStandardMaterial({color:'#1a1420',roughness:.5}),
  wing:new T.MeshBasicMaterial({color:'#e8f6ff',transparent:true,opacity:.55,side:T.DoubleSide}),
  wave:new T.MeshPhysicalMaterial({color:'#38c8ff',transparent:true,opacity:.62,roughness:.05,clearcoat:1,emissive:'#0a4a7a',emissiveIntensity:.6,side:T.DoubleSide}),
  goo:new T.MeshStandardMaterial({color:'#b45cff',emissive:'#5a10a0',emissiveIntensity:.8,roughness:.2}),
  thorn:new T.MeshStandardMaterial({color:'#5a7a2a',roughness:.8}),
  ice:new T.MeshPhysicalMaterial({color:'#bfefff',roughness:.02,transparent:true,opacity:.6,clearcoat:1}),
 };
 function makeActor(kind:string):T.Object3D{
  const g=new T.Group();
  if(kind==='seed-bolt'){const m=new T.Mesh(new T.SphereGeometry(.55,14,10),actorMat.seed);m.scale.set(1,1,1.4);g.add(m);const leaf=new T.Mesh(new T.ConeGeometry(.3,.9,6),actorMat.thorn);leaf.position.set(0,.5,-.2);leaf.rotation.x=-.6;g.add(leaf);}
  else if(kind==='homing-hornet'){const m=new T.Mesh(new T.CapsuleGeometry(.42,1.1,6,12),actorMat.hornet);m.rotation.x=Math.PI/2;g.add(m);for(let k=-1;k<=1;k++){const st=new T.Mesh(new T.TorusGeometry(.43,.07,6,16),actorMat.stripe);st.position.z=k*.35;g.add(st);}for(const sd of [-1,1]){const w=new T.Mesh(new T.PlaneGeometry(1.1,.55),actorMat.wing);w.position.set(sd*.7,.35,0);w.rotation.z=sd*.4;w.name='wing';g.add(w);}}
  else if(kind==='riptide'){const geo=new T.CylinderGeometry(3.2,3.2,22,24,1,true,0,Math.PI);const m=new T.Mesh(geo,actorMat.wave);m.rotation.z=Math.PI/2;m.rotation.y=Math.PI/2;m.position.y=1.2;g.add(m);}
  else if(kind==='goo-mine'){const m=new T.Mesh(new T.SphereGeometry(.8,16,10),actorMat.goo);m.scale.y=.55;m.position.y=.4;g.add(m);const light=new T.Mesh(new T.SphereGeometry(.16,8,6),new T.MeshBasicMaterial({color:'#ff3df0'}));light.position.y=.85;light.name='blink';g.add(light);}
  else if(kind==='bramble'){for(let k=0;k<26;k++){const c=new T.Mesh(new T.ConeGeometry(.22,1.1+Math.random()*.8,5),actorMat.thorn);c.position.set((Math.random()-.5)*5.2,.5,(Math.random()-.5)*2.4);c.rotation.set((Math.random()-.5)*.8,0,(Math.random()-.5)*.8);g.add(c);}}
  else if(kind==='ice-slick'){const m=new T.Mesh(new T.CircleGeometry(2.4,24),actorMat.ice);m.rotation.x=-Math.PI/2;m.position.y=.05;m.scale.set(1.6,1,1);g.add(m);}
  scene.add(g);return g;
 }
 const tmpV=new T.Vector3(),tmpV2=new T.Vector3();
 let lastEventId=0;
 const bolts:{line:T.Line;life:number}[]=[];
 const boltMat=new T.LineBasicMaterial({color:'#fff58a',transparent:true,opacity:1,blending:T.AdditiveBlending});
 const rings:{mesh:T.Mesh;life:number}[]=[];
 function lightning(a:T.Vector3,b:T.Vector3){
  const pts:T.Vector3[]=[];
  for(let k=0;k<=12;k++){const q=a.clone().lerp(b,k/12);if(k>0&&k<12)q.add(new T.Vector3((Math.random()-.5)*1.6,(Math.random()-.5)*1.6,(Math.random()-.5)*1.6));pts.push(q);}
  const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),boltMat);scene.add(line);bolts.push({line,life:.28});
 }
 function eventPos(s:State,e:RaceEvent,who:number){
  const p=s.players[who];
  if(p)return racerFrame(p,courseDef.id).position.clone().add(new T.Vector3(0,1,0));
  return worldPoint(e.progress,e.lane,1,courseDef.id);
 }
 let soundOn=false,audioReady=false;
 function handleEvents(s:State){
  const ev=s.race?.events||[];
  for(const e of ev){
   if(e.id<=lastEventId)continue;
   lastEventId=e.id;
   const who=e.player>=0?e.player:e.target;
   const pos=eventPos(s,e,who);
   if(soundOn&&audioReady){
    const human=e.kind==='morph'||(e.player>=0&&!!s.players[e.player]?.human)||(e.target>=0&&!!s.players[e.target]?.human);
    gameAudio.race?.event(e.kind,e.data,pos,human,s.time);
   }
   const up=new T.Vector3(0,1,0);
   switch(e.kind){
    case 'explode':fx.emit('explosion',pos,up.clone().multiplyScalar(2),1,e.data==='mine'?'#c070ff':'#ffb347',2.2);break;
    case 'hit':fx.emit('spark',pos,up.clone().multiplyScalar(6),30,'#ffd27a',1);fx.emit('smoke',pos,up.clone().multiplyScalar(2),10);break;
    case 'block':fx.emit('spark',pos,up.clone().multiplyScalar(5),26,e.data==='gear'||e.data==='reflect'?'#ffb347':'#7ee8ff',1.2);break;
    case 'land':fx.emit('dust',pos.clone().add(new T.Vector3(0,-.8,0)),up.clone().multiplyScalar(3),Math.min(40,10+Number(e.data)*6),courseDef.terrainColorB,1.6);break;
    case 'launch':fx.emit('spark',pos,up.clone().multiplyScalar(4),14,courseDef.stripeColor,.8);break;
    case 'bump':fx.emit('spark',pos,up.clone().multiplyScalar(5),18,'#fff2c0',.8);break;
    case 'wall':fx.emit('spark',pos,up.clone().multiplyScalar(4),22,'#ffcf7a',.9);break;
    case 'zap':{
     const t=s.players[e.target];
     if(t){
      const tp=racerFrame(t,courseDef.id).position.clone().add(new T.Vector3(0,1,0));
      const from=e.data==='crown'?tp.clone().add(new T.Vector3(0,30,0)):eventPos(s,e,e.player);
      lightning(from,tp);fx.emit('electric',tp,up,30,'#fff58a',1.2);
     }
     break;
    }
    case 'freeze':{const t=s.players[e.target];if(t)fx.emit('ice',racerFrame(t,courseDef.id).position,up.clone().multiplyScalar(4),40,'#bfefff',1.2);break;}
    case 'shock':{
     const m=new T.Mesh(new T.TorusGeometry(1,.25,8,48),new T.MeshBasicMaterial({color:'#ff5ad0',transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));
     m.position.copy(pos);m.rotation.x=Math.PI/2;scene.add(m);rings.push({mesh:m,life:.6});break;
    }
    case 'confetti':fx.emit('confetti',pos.clone().add(new T.Vector3(0,2,0)),up.clone().multiplyScalar(8),160,undefined,1.2);break;
    case 'warp':fx.emit('electric',pos,up.clone().multiplyScalar(3),50,'#b8a6ff',1.4);break;
    case 'pickup':fx.emit('spark',pos,up.clone().multiplyScalar(4),16,courseDef.accent,.9);break;
    case 'fall':fx.emit(courseDef.id==='ember-ridge'?'flame':'splash',pos.clone().add(new T.Vector3(0,-9,0)),up.clone().multiplyScalar(8),60,courseDef.id==='ember-ridge'?'#ff5a1a':'#bfefff',2);break;
    case 'special':{const sp=kithKart(s.players[e.player].character).special;fx.emit('spark',pos,up.clone().multiplyScalar(6),50,sp.color,1.4);break;}
    default:break;
   }
  }
 }
 function updateActors(s:State,dt:number){
  const x=s.race;if(!x)return;
  const live=new Set<number>();
  for(const pr of x.projectiles){
   live.add(pr.id);
   let m=actorMeshes.get(pr.id);if(!m){m=makeActor(pr.kind);actorMeshes.set(pr.id,m);}
   const f=trackFrame(pr.progress,pr.kind==='riptide'?0:pr.lane,courseDef.id);
   m.position.copy(f.position).addScaledVector(f.normal,pr.kind==='riptide'?0:1.1);
   basisHelper.makeBasis(f.right,f.normal,f.tangent);m.quaternion.setFromRotationMatrix(basisHelper);
   if(pr.kind==='seed-bolt'){m.children[0].rotation.z+=dt*20;if(Math.random()<.6)fx.emit('leaf',m.position,f.tangent.clone().multiplyScalar(-4),1,'#9df07a',.6);}
   if(pr.kind==='homing-hornet'){m.children.forEach(c=>{if(c.name==='wing')c.rotation.x=Math.sin(s.time*80)*.6;});fx.emit('spark',m.position,f.tangent.clone().multiplyScalar(-3),1,'#ffe27a',.5);}
   if(pr.kind==='riptide'){m.scale.setScalar(1+Math.sin(s.time*8)*.06);fx.emit('splash',m.position.clone().addScaledVector(f.normal,3),f.normal.clone().multiplyScalar(4),4,'#cff4ff',1.2);}
  }
  for(const tr of x.traps){
   live.add(tr.id);
   if(tr.kind==='fire-trail'){
    if(Math.random()<.5){const f=trackFrame(tr.progress,tr.lane,courseDef.id);fx.emit('flame',f.position.clone().addScaledVector(f.normal,.3),f.normal.clone().multiplyScalar(3),1,'#ff6a1a',1.4);}
    continue;
   }
   let m=actorMeshes.get(tr.id);if(!m){m=makeActor(tr.kind);actorMeshes.set(tr.id,m);}
   const f=trackFrame(tr.progress,tr.lane,courseDef.id);
   m.position.copy(f.position);basisHelper.makeBasis(f.right,f.normal,f.tangent);m.quaternion.setFromRotationMatrix(basisHelper);
   const blink=m.getObjectByName('blink');if(blink)blink.visible=Math.floor(s.time*4)%2===0;
   if(tr.kind==='bramble')m.scale.setScalar(Math.min(1,tr.life*2));
  }
  for(const [id,m] of actorMeshes){
   if(live.has(id))continue;
   scene.remove(m);actorMeshes.delete(id);
   m.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});
  }
  for(let k=bolts.length-1;k>=0;k--){const b=bolts[k];b.life-=dt;(b.line.material as T.LineBasicMaterial).opacity=Math.max(0,b.life/.28);if(b.life<=0){scene.remove(b.line);b.line.geometry.dispose();bolts.splice(k,1);}}
  for(let k=rings.length-1;k>=0;k--){const r=rings[k];r.life-=dt;const u=1-r.life/.6;r.mesh.scale.setScalar(1+u*22);(r.mesh.material as T.MeshBasicMaterial).opacity=Math.max(0,1-u);if(r.life<=0){scene.remove(r.mesh);r.mesh.geometry.dispose();(r.mesh.material as T.Material).dispose();rings.splice(k,1);}}
 }
 const humans=initial.players.filter(p=>p.human);
 const cameras=humans.map(()=>new T.PerspectiveCamera(58,960/560,.1,620));
 const cameraTargets=humans.map(()=>new T.Vector3());
 const cameraUps=humans.map(()=>new T.Vector3(0,1,0));
 const kartBasis=new T.Matrix4();
 let initialized=false;
 const camRight=new T.Vector3();
 function updateRaceAudio(s:State,dt:number){
  const race=soundOn&&audioReady?gameAudio.race:null;
  if(!race){if(!soundOn)gameAudio.race?.silence();return;}
  // race over, paused, or still in the flyover: no engines (otherwise the last engine note drones on forever)
  if(s.phase==='finished'||dt<=0||s.time<-3){race.silence();return;}
  const cam=cameras[0];if(!cam)return;
  camRight.setFromMatrixColumn(cam.matrixWorld,0).normalize();
  race.update(s.players.map((p,i)=>{const r=karts[i].root.position;return {
   index:i,human:p.human,character:p.character,mps:p.mps,speedNorm:Math.min(1.5,Math.abs(p.speedNorm||0)),boost:p.boost,superBoost:!!p.superBoost,
   drift:p.drift,driftStage:p.driftStage||0,burnout:p.burnout||0,braking:!!p.braking,reversing:!!p.reversing,steer:p.steerAngle||0,slip:p.slip||0,
   surface:p.surface,airborne:(p.hopY||0)>.35||p.respawn>0,inLoop:!!p.inLoop,x:r.x,y:r.y,z:r.z,
  };}),{x:cam.position.x,y:cam.position.y,z:cam.position.z,rx:camRight.x,ry:camRight.y,rz:camRight.z},s.time,dt);
 }

 // dev-only inspection hook (local dev hosts only)
 if(typeof location!=='undefined'&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname))(window as unknown as {__kithKarts?:unknown}).__kithKarts=karts;
 const bulletMix=[0,0],bulletAngle=[0,0];
 const gliderWings:(T.Group|undefined)[]=[];
 /** Fold-out glider: two swept wings with glowing trim and a tail fin, parented to a kart body. */
 function makeGliderWings(accent:string){
  const g=new T.Group();g.position.set(0,1.45,-.15);g.scale.setScalar(1.55);
  const skin=new T.MeshStandardMaterial({color:'#fff6ec',roughness:.4,metalness:.1,side:T.DoubleSide,transparent:true,opacity:.95});
  const trim=new T.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:1.8,roughness:.3});
  for(const side of [-1,1]){
   const shape=new T.Shape();shape.moveTo(0,.55);shape.lineTo(2.9,.05);shape.lineTo(2.7,-.45);shape.lineTo(0,-.6);shape.closePath();
   const wing=new T.Mesh(new T.ShapeGeometry(shape),skin);wing.rotation.x=-Math.PI/2;wing.scale.x=side;wing.position.x=side*.35;wing.rotation.y=side*.08;g.add(wing);
   const edge=new T.Mesh(new T.BoxGeometry(2.9,.06,.12),trim);edge.position.set(side*(.35+1.45),.02,-.25);edge.rotation.y=side*.17;g.add(edge);
  }
  const fin=new T.Mesh(new T.BoxGeometry(.06,.6,.8),trim);fin.position.set(0,.3,-1.1);g.add(fin);
  return g;
 }
 return {
  setCameraMode(mode:'hero'|'wide'){cameraMode=mode;},
  getCameraMode(){return cameraMode;},
  render(s:State,dt:number,audioCtx?:AudioContext|null,soundEnabled?:boolean){
   const realDt=dt;dt*=s.timeScale??1; // bullet time: the world slows, the camera below keeps real time
   garden.update(dt,Math.max(0,s.time));
   for(const m of mixers)m.update(dt);

   const leadHuman=s.players[0];
   if(leadHuman){
    gameAudio.updateRaceTelemetry({
     speedNorm:Math.min(1.5,Math.abs(leadHuman.speedNorm||0)),
     driftStage:leadHuman.driftStage||0,
     boostActive:leadHuman.boost>0,
     inLoop:!!leadHuman.inLoop,
     lap:courseDef.kind==='sprint'?Math.min(3,1+Math.floor(leadHuman.progress*3)):Math.min(courseDef.laps,Math.max(1,Math.floor(leadHuman.progress)+1)),
     finalLap:courseDef.kind==='sprint'?leadHuman.progress>.66:Math.floor(leadHuman.progress)+1>=courseDef.laps,
    });
   }

   // track morphs: re-lay reshaped sections, pulse the compression field / energy rails
   if(morphZones.length){
    refreshMorphs();
    const st=morphState(courseDef.id);
    for(const fx of morphFx){
     const m=st[fx.zi].m,moving=Math.abs(m-(fx.mats[0].userData.lastM??0))>1e-4;fx.mats[0].userData.lastM=m;
     const short=st[fx.zi].kind==='short';
     fx.mats[0].opacity=m*(short?.55:.25)+(moving?.25+Math.sin(s.time*30)*.15:0);
     fx.mats[0].color.set(short?'#7dffb0':courseDef.accent);
     fx.tex.offset.y-=dt*(short?3.2:1.2);
     fx.mats[1].opacity=.3+m*.45+(moving?Math.sin(s.time*24)*.25:0);
    }
   }
   fanSpinners.forEach(r=>{r.rotation.y+=dt*22;});
   fanColumns.forEach((c,k)=>{if(c.geometry.type==='ConeGeometry'){c.position.y=1.6+((s.time*2.4)%1)*3.2;}else{c.position.y=2.9+Math.sin(s.time*7+k*1.7)*.5;c.scale.y=.8+Math.sin(s.time*5+k)*.2;}});
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

   features.update(s.time,dt,s.race?.boxes,fx);
   soundOn=!!soundEnabled;audioReady=!!audioCtx&&audioCtx.state==='running';
   handleEvents(s);
   updateActors(s,dt);
   const tmpWheel=new T.Vector3();

   s.players.forEach((p,i)=>{
    const kart=karts[i];
    const rescuing=p.respawn>0;
    const frame=rescuing?trackFrame(p.respawnTo,0,courseDef.id):racerFrame(p,courseDef.id);
    const lift=rescuing?Math.max(0,p.respawn-.4)*7:0;
    kart.root.position.copy(frame.position).addScaledVector(frame.normal,(p.hopY||0)+lift);
    kartBasis.makeBasis(frame.right,frame.normal,frame.tangent);
    kart.root.quaternion.setFromRotationMatrix(kartBasis);

    const driftDir=p.driftDir!==0?p.driftDir:(p.steerAngle<0?-1:1);
    // body yaw = the kart's real heading on the road, plus drift slip angle
    // kart-local +X is the track's `right` (screen-left), so steering toward screen-right yaws the nose negative
    let yaw=-((p.heading||0)+(p.drift>0&&p.human?driftDir*(.22+p.drift*.1)-p.steerAngle*.06:0));
    if(p.spin>0)yaw+=(p.spinDir||1)*(1.05-p.spin)*Math.PI*2.6;
    kart.body.position.y=(p.jounce||0)*.45;
    kart.body.rotation.set(p.pitch,yaw,p.roll);
    if(p.trickSpin>0){const u=1-p.trickSpin/.5;kart.body.rotation.z+=(i%2?1:-1)*u*Math.PI*2;}
    // twist-kicker stunt: barrel roll (3-arrow combo) or front flip (4) once the combo is in; wobble while it isn't
    const st=p.stunt;
    if(st&&st.state==='done'&&st.doneAt>=0){const u=Math.min(1,Math.max(0,(s.time-st.doneAt)/.62)),e=u<.5?2*u*u:1-2*(1-u)*(1-u);
     if(st.seq.length>3)kart.body.rotation.x-=e*Math.PI*2;else kart.body.rotation.z+=st.dir*e*Math.PI*2;}
    else if(st&&st.state==='fail')kart.body.rotation.z+=Math.sin(s.time*22)*.35;
    else if(st)kart.body.rotation.z+=st.dir*.18;
    // glider wings unfold on very high air
    const gl=p.glide||0;let wings=gliderWings[i];
    if(gl>.01&&!wings){wings=gliderWings[i]=makeGliderWings(courseDef.accent);kart.body.add(wings);}
    if(wings){wings.visible=gl>.01;wings.scale.set(Math.max(.01,gl)*1.55,1.55,1.55);if(gl>.01){kart.body.rotation.z+=-(p.steerAngle||0)*.5*gl;kart.body.rotation.x+=.05*gl;}}
    if(p.stun>0&&p.frozen<=0)kart.body.rotation.z+=Math.sin(s.time*60)*.06;
    if(p.slowTime>0)kart.body.rotation.z+=Math.sin(s.time*18)*.05;

    const wheelTravels=[p.suspensionRL||0,p.suspensionRR||0,p.suspensionFL||0,p.suspensionFR||0];
    kart.wheels.forEach((w,wIdx)=>{
     const baseY=typeof w.userData.baseY==='number'?w.userData.baseY:.46;
     const load=wheelTravels[wIdx];
     w.position.y=baseY-load*.55;
     if(wIdx>=2)w.rotation.y=-((p.wheelAngle||0)*1.25-(p.drift>0&&p.human?driftDir*.25:0));
     const spinRate=p.burnout>.5&&wIdx<2&&p.mps<12?60:(p.mps||0)*2.2;
     w.rotation.x-=spinRate*dt;
     const squish=Math.max(-.12,Math.min(.14,load*.65+(p.slip||0)*.06));
     w.scale.set(1+squish*.85,1-squish*.55,1+squish*.35);
    });
    kart.updateRig?.();

    kart.fiaLedMat.color.set(p.braking?'#ff2a3a':(Math.floor(s.time*12)%2===0||p.boost>0)?'#ff1e38':'#4a0610');

    // afterburners: idle pilot -> cruise -> boost -> super boost; mini-turbo colours by drift tier
    if(p.boost>0&&kart.lastBoost<=0){
     const recent=(s.race?.events||[]).slice(-8).reverse().find(e=>e.player===i&&e.kind==='boost');
     const tint:[string,string]|null=recent?.data==='drift1'?['#e6fbff','#2a8cff']:recent?.data==='drift2'?['#fff3c4','#ff7a1a']:recent?.data==='drift3'?['#fbe6ff','#b23cff']:null;
     kart.boostTint=tint;
     const c=tint||[kart.kk.flameCore,kart.kk.flameOuter];
     kart.burners.forEach(b=>b.setColors(c[0],c[1]));
    }
    if(p.boost<=0&&kart.lastBoost>0){kart.burners.forEach(b=>b.setColors(kart.kk.flameCore,kart.kk.flameOuter));kart.boostTint=null;}
    kart.lastBoost=p.boost;
    const intensity=p.boost>0?(p.superBoost?1.7:1.15):p.driftStage>0&&p.human?.45+p.driftStage*.08:Math.max(.06,Math.abs(p.speedNorm||0)*.38);
    tmpV.copy(frame.tangent).multiplyScalar(p.mps||0);
    kart.burners.forEach(b=>b.update(dt,s.time,rescuing?0:intensity,tmpV,fx));

    // drift spark fountains by tier
    const isDrift=p.driftStage>0;
    kart.sparkMeshes.forEach((spark,sIdx)=>{
     const tierIdx=sIdx%3;
     spark.visible=isDrift&&(tierIdx===p.driftStage-1||p.driftStage===3);
     if(spark.visible){spark.position.x=(sIdx<3?-1.08:1.08)+Math.sin(s.time*60+sIdx)*.08;spark.position.y=.38+Math.cos(s.time*70+sIdx)*.06;}
    });
    // rubber: skid marks + tyre smoke off both rear wheels; dirt dust on shortcuts; drift sparks
    for(let w=0;w<2;w++){
     kart.wheels[w].getWorldPosition(tmpWheel);
     const contact=tmpWheel.clone().addScaledVector(frame.normal,-.42);
     const onGround=p.hopY<.15&&!rescuing;
     const burn=onGround&&p.cut<0?p.burnout:0;
     skid.add(i*2+w,contact,frame.normal,frame.right,burn>.18?Math.min(1,burn):0);
     if(burn>.25&&Math.random()<burn*.9)fx.emit('tireSmoke',contact,tmpV2.copy(frame.tangent).multiplyScalar(-2).addScaledVector(frame.normal,1.2),1,'#d8d4dc',.8+burn*.8);
     if(onGround&&p.cut>=0&&p.mps>8&&Math.random()<.5)fx.emit('dust',contact,frame.normal.clone().multiplyScalar(2),1,courseDef.terrainColorB,1.2);
     if(isDrift&&p.human&&Math.random()<.5)fx.emit('spark',contact,tmpV2.copy(frame.right).multiplyScalar((w?1:-1)*3).addScaledVector(frame.normal,2),1,p.driftStage===3?'#d070ff':p.driftStage===2?'#ff9a2e':'#5ac8ff',.6);
    }
    kart.glowMat.opacity=p.boost>0?.72+Math.sin(s.time*26)*.12:.38+Math.abs(p.speedNorm||0)*.3;

    // ability / state visuals
    const special=kart.kk.special.id;
    kart.shield.visible=p.shield>0;kart.shieldMat.uniforms.uTime.value=s.time;
    kart.gears.visible=p.gearHits>0;
    if(kart.gears.visible)kart.gears.children.forEach((g,gi)=>{const a=s.time*3+gi*Math.PI*2/3;g.position.set(Math.cos(a)*2.3,1.1+Math.sin(s.time*4+gi)*.2,Math.sin(a)*2.3);g.rotation.z=s.time*6;g.visible=gi<p.gearHits+1;});
    kart.boulder.visible=p.specialTime>0&&special==='boulder-bash';
    if(kart.boulder.visible)kart.boulder.rotation.x-=(p.mps||0)*dt/2.3;
    kart.iceBlock.visible=p.frozen>0;
    kart.drone.visible=rescuing;
    const showItem=!!p.item||p.itemRoll>0;
    kart.itemHeld.visible=showItem&&p.human;
    if(showItem&&p.human){const ids=Object.keys(ITEMS);const shown=p.itemRoll>0?ids[Math.floor(s.time*14)%ids.length]:p.item!;const sm=kart.itemHeld.material as T.SpriteMaterial;const tex=itemTexture(shown);if(sm.map!==tex){sm.map=tex;sm.needsUpdate=true;}}
    if(p.stun>0&&Math.random()<.4)fx.emit('electric',kart.root.position.clone().addScaledVector(frame.normal,1),frame.normal,2,'#fff58a',.8);
    if(p.specialTime>0&&special==='moon-warp'&&Math.random()<.6)fx.emit('electric',kart.root.position,frame.normal,2,'#b8a6ff',1);
    if((p.slipTime||0)>.2&&Math.random()<.65){
     const side=Math.random()<.5?-1.1:1.1;
     const sp=kart.root.position.clone().addScaledVector(frame.right,side).addScaledVector(frame.normal,.75);
     fx.emit('spark',sp,tmpV2.copy(frame.tangent).multiplyScalar(-8),1,'#96f5ff',.55);
    }
    // invulnerability blink after being hit (not during protective specials)
    kart.body.visible=!(p.invincible>0&&p.spin<=0&&p.specialTime<=0&&!rescuing&&p.invincible<1.6&&Math.floor(s.time*16)%2===0);
   });

   skid.update(dt);

   // Speed streaks follow the lead human
   const humanP=s.players[0];
   const speedFactor=humanP?Math.max(0,((humanP.speedNorm||0)-.85)/.5):0;
   streakMat.opacity=humanP?.boost>0?.65:speedFactor*.35;
   if(humanP&&streakMat.opacity>0){
    speedStreaks.position.copy(cameras[0].position);
    speedStreaks.rotation.copy(cameras[0].rotation);
    const attr=streakGeo.getAttribute('position') as T.BufferAttribute;
    const arr=attr.array as Float32Array;
    for(let k=0;k<speedStreakCount;k++){arr[k*3+2]+=dt*(60+(humanP.boost>0?45:0));if(arr[k*3+2]>5)arr[k*3+2]=-35;}
    attr.needsUpdate=true;
   }

   // Keep the sun's shadow box centred on the lead human so shadows stay crisp
   if(humanP){
    const c=karts[0].root.position;
    sun.target.position.copy(c);sun.position.copy(c).add(sunOffset);sun.target.updateMatrixWorld();
   }

   const rect=canvas.getBoundingClientRect();
   const w=Math.max(320,Math.round(rect.width)),h=Math.max(190,Math.round(rect.height));
   const size=renderer.getSize(new T.Vector2());
   if(size.x!==w||size.y!==h){renderer.setSize(w,h,false);post.setSize(w,h);}

   const views:{camera:T.Camera;x:number;y:number;w:number;h:number;speedBlur:number;boostTint:number}[]=[];
   cameras.forEach((camera,i)=>{
    const dt=realDt;
    const p=s.players[i];
    const rescuing=p.respawn>0;
    const frame=rescuing?trackFrame(p.respawnTo,0,courseDef.id):racerFrame(p,courseDef.id);
    const isHero=cameraMode==='hero';
    const back=(isHero?7.6:11.5)+(p.boost>0?1.8:Math.max(0,p.speedNorm||0)*2.2);
    const camHeight=(isHero?2.45:4.35)+(p.boost>0?-.22:0)+(p.hopY>1?p.hopY*.4:0);
    const driftShift=p.drift>0&&p.human?(p.steerAngle<0?1:-1)*1.1:p.steerAngle*-.35;
    let desired:T.Vector3,lookTarget:T.Vector3,up:T.Vector3;
    if(p.cut>=0&&!rescuing){
     const len=Math.max(30,shortcutLens[p.cut]||60);
     const cf=shortcutFrame(courseDef.id,p.cut,p.cutU-back/len,p.lane);
     desired=cf.position.clone().addScaledVector(cf.normal,camHeight).addScaledVector(cf.right,driftShift);
     const lf=shortcutFrame(courseDef.id,p.cut,p.cutU+12/len,p.lane*.9);
     lookTarget=lf.position.clone().addScaledVector(lf.normal,isHero?2.2:1.6);up=cf.normal;
    } else {
     const prog=rescuing?p.respawnTo:p.progress;
     const camLane=Math.max(-54,Math.min(54,p.lane+(isHero?-2.2:0)+driftShift/.18));
     const cf=trackFrame(prog-back/L,camLane,courseDef.id);
     desired=cf.position.clone().addScaledVector(cf.normal,camHeight);
     const lf=trackFrame(prog+(isHero?19:15)/L,Math.max(-54,Math.min(54,p.lane*.92)),courseDef.id);
     lookTarget=lf.position.clone().addScaledVector(lf.normal,isHero?2.55:1.65);up=frame.normal;
     if(!rescuing){
      // chase from behind the kart's real heading, so steering reads as the kart turning rather than sliding
      const h=p.heading||0,fwd=frame.tangent.clone().multiplyScalar(Math.cos(h)).addScaledVector(frame.right,-Math.sin(h)).normalize();
      const kp=frame.position;
      const kDesired=kp.clone().addScaledVector(fwd,-back).addScaledVector(frame.normal,camHeight);
      const kLook=kp.clone().addScaledVector(fwd,isHero?19:15).addScaledVector(frame.normal,isHero?2.55:1.65);
      desired.lerp(kDesired,.75);lookTarget.lerp(kLook,.55);
     }
    }
    const shake=p.wallHit>0?.14:p.surface==='curb'?.09:p.boost>0?.06:(p.speedNorm||0)>1?.025:0;
    if(shake){desired.x+=Math.sin(s.time*85)*shake;desired.y+=Math.cos(s.time*95)*shake;}
    // Voca Word Boost bullet time: the world freezes and the camera swings around the kart
    const wantBullet=(p.vocaCue??-1)>=0&&p.human?1:0;
    bulletMix[i]+=(wantBullet-bulletMix[i])*Math.min(1,dt*(wantBullet?5:3));
    if(bulletMix[i]>.002){
     if(wantBullet&&bulletMix[i]<.05)bulletAngle[i]=Math.PI*.85;
     bulletAngle[i]+=dt*.75*bulletMix[i];
     const kf=frame,c=kf.position.clone().addScaledVector(kf.normal,(p.hopY||0)+1.05);
     const h=p.heading||0,fwd=kf.tangent.clone().multiplyScalar(Math.cos(h)).addScaledVector(kf.right,-Math.sin(h)).normalize();
     const side=new T.Vector3().crossVectors(kf.normal,fwd).normalize(),a=bulletAngle[i];
     const orbit=c.clone().addScaledVector(fwd,Math.cos(a)*6.2).addScaledVector(side,Math.sin(a)*6.2).addScaledVector(kf.normal,1.5+Math.sin(a*.7)*.6);
     const k=bulletMix[i]*bulletMix[i]*(3-2*bulletMix[i]);
     desired.lerp(orbit,k);lookTarget.lerp(c,k);up=up.clone().lerp(kf.normal,k).normalize();
    }
    const cine=s.game==='circuit'?cinematicPose(s.time,p,i):null;
    if(cine){camera.position.copy(cine.pos);cameraTargets[i].copy(cine.look);cameraUps[i].set(0,1,0);}
    else if(!initialized){camera.position.copy(desired);cameraTargets[i].copy(lookTarget);cameraUps[i].copy(up);}
    else if(bulletMix[i]>.002){const k=bulletMix[i]>.9?1:1-Math.exp(-dt*(11+bulletMix[i]*30));camera.position.lerp(desired,k);cameraTargets[i].lerp(lookTarget,k);cameraUps[i].lerp(up,1-Math.exp(-dt*10)).normalize();}
    else{camera.position.lerp(desired,1-Math.exp(-dt*11));cameraTargets[i].lerp(lookTarget,1-Math.exp(-dt*14));cameraUps[i].lerp(up,1-Math.exp(-dt*10)).normalize();}
    camera.up.copy(cameraUps[i]);
    camera.lookAt(cameraTargets[i]);
    camera.rotation.z+=frame.bankAngle*.38;
    const vh=humans.length>1?h/2:h;
    const bottom=humans.length>1?(1-i)*vh:0;
    camera.aspect=w/vh;
    const baseFov=isHero?56:62;
    const slipFov=(p.slipTime||0)>0.2?Math.min(8,(p.slipTime||0)*6.5):0;
    const driftFov=(p.driftStage||0)>0?(p.driftStage||0)*2.5:0;
    const targetFov=(p.boost>0?baseFov+(p.superBoost?23:16):baseFov+Math.max(0,p.speedNorm||0)*10)+slipFov+driftFov;
    if(cine)camera.fov=cine.fov;else camera.fov+=((targetFov+(48-targetFov)*bulletMix[i])-camera.fov)*Math.min(1,dt*10);
    camera.updateProjectionMatrix();
    const slipBlur=(p.slipTime||0)>0.2?0.26:0;
    views.push({camera,x:0,y:bottom,w,h:vh,speedBlur:(1-bulletMix[i])*Math.min(1,(p.boost>0?(p.superBoost?.95:.72):Math.max(0,((p.speedNorm||0)-.86)*1.25))+slipBlur),boostTint:p.boost>0?(p.superBoost?1:.55):((p.slipTime||0)>0.25?0.22:0)});
   });
   // shader/texture warm-up, spread over the intro flyover so nothing stalls mid-race the first time it's seen:
   // the visible scene compiles in the background (parallel compile), hidden props (shields, ice, drone…) one
   // material-kind at a time, and textures upload a few per frame
   if(!warmed&&cameras[0]){
    warmed=true;
    void renderer.compileAsync(scene,cameras[0]).then(()=>{compiled=true;},()=>{compiled=true;});
    const seenKind=new Set<string>(),seenTex=new Set<T.Texture>();
    const kindOf=(m:T.Material)=>{const a=m as T.MeshStandardMaterial;return `${m.type}|${a.map?1:0}|${m.transparent?1:0}|${a.flatShading?1:0}|${m.vertexColors?1:0}|${a.envMap?1:0}`;};
    scene.traverse(o=>{
     const mats=(o as T.Mesh).material?([] as T.Material[]).concat((o as T.Mesh).material as T.Material|T.Material[]):[];
     for(const m of mats)for(const v of Object.values(m))if(v instanceof T.Texture&&!seenTex.has(v)){seenTex.add(v);warmTex.push(v);}
     if(!o.visible&&o.parent?.visible!==false){
      let fresh=false;o.traverse(c=>{const mm=(c as T.Mesh).material;if(mm)for(const m of ([] as T.Material[]).concat(mm)){const k=kindOf(m);if(!seenKind.has(k)){seenKind.add(k);fresh=true;}}});
      if(fresh)warmHidden.push(o);
     }
    });
   }
   // once shaders are ready: one tiny off-screen pass with culling off uploads every mesh buffer (merged scenery
   // batches are big — uploading them the first time they swing into view caused 200–400 ms hitches)
   if(compiled&&!uploaded&&cameras[0]){
    uploaded=true;const culled:T.Object3D[]=[];
    scene.traverse(o=>{if(o.frustumCulled){o.frustumCulled=false;culled.push(o);}});
    const auto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
    const vp=new T.Vector4();renderer.getViewport(vp);renderer.setViewport(0,0,1,1);
    try{renderer.render(scene,cameras[0]);}catch{/* best effort */}
    renderer.setViewport(vp);renderer.shadowMap.autoUpdate=auto;
    for(const o of culled)o.frustumCulled=true;
   }
   if(cameras[0]&&(warmHidden.length||warmTex.length)){
    for(let n=0;n<2&&warmHidden.length;n++){const o=warmHidden.pop()!;o.visible=true;try{renderer.compile(o,cameras[0],scene);}catch{/* best effort */}o.visible=false;}
    for(let n=0;n<6&&warmTex.length;n++){try{renderer.initTexture(warmTex.pop()!);}catch{/* best effort */}}
   }
   // adaptive resolution: drop render scale while frames run slow, creep back up once they're smooth again
   if(dt>0){
    if(dt>1/47){slowFor+=dt;fastFor=0;}else if(dt<1/57){fastFor+=dt;slowFor=Math.max(0,slowFor-dt);}
    const pr=renderer.getPixelRatio();
    let next=pr;
    if(slowFor>1.2&&pr>.7){next=Math.max(.7,pr-.2);slowFor=0;}
    else if(fastFor>8&&pr<maxPixelRatio){next=Math.min(maxPixelRatio,pr+.15);fastFor=0;}
    if(next!==pr){renderer.setPixelRatio(next);renderer.setSize(w,h,false);post.setSize(w,h);}
   }
   if(cameras[0])fx.update(dt,cameras[0]);
   post.render(scene,views);
   updateRaceAudio(s,dt);

   initialized=true;
   canvas.dataset.drawCalls=String(renderer.info.render.calls);
  },
  dispose(){
   disposed=true;
   mixers.forEach(m=>m.stopAllAction());
   gameAudio.endRace();
   karts.forEach(k=>k.burners.forEach(b=>b.dispose()));
   features.dispose();fx.dispose();skid.dispose();post.dispose();
   disposeTree(scene);
   envRT.dispose();
   renderer.dispose();
   renderer.forceContextLoss();
   delete canvas.dataset.renderer;
  },
 };
}

export function disposeTree(root:T.Object3D){
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

/** Rounded ice cube for the Glacier Wake freeze. */
class RoundedIce extends T.BoxGeometry{constructor(){super(3.2,2.2,4.4,2,2,2);}}

/** Little rescue drone that lifts karts back after a missed jump. */
function makeDrone():T.Group{
 const g=new T.Group();
 const body=new T.Mesh(new T.SphereGeometry(.6,16,12),new T.MeshStandardMaterial({color:'#f4f0e6',roughness:.3,metalness:.2}));body.scale.set(1.4,.6,1.4);g.add(body);
 const eye=new T.Mesh(new T.SphereGeometry(.18,10,8),new T.MeshBasicMaterial({color:'#3df5ff'}));eye.position.set(0,0,.75);g.add(eye);
 const rotorMat=new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.35});
 for(const [x,z] of [[1,1],[-1,1],[1,-1],[-1,-1]]){const arm=new T.Mesh(new T.BoxGeometry(.1,.08,1.1),new T.MeshStandardMaterial({color:'#333'}));arm.position.set(x*.55,0,z*.55);arm.rotation.y=Math.atan2(x,z);g.add(arm);const rotor=new T.Mesh(new T.CircleGeometry(.5,16),rotorMat);rotor.rotation.x=-Math.PI/2;rotor.position.set(x*.95,.12,z*.95);g.add(rotor);}
 const cable=new T.Mesh(new T.CylinderGeometry(.03,.03,2.4,4),new T.MeshStandardMaterial({color:'#222'}));cable.position.y=-1.3;g.add(cable);
 g.position.y=4.2;
 return g;
}

const itemTexCache=new Map<string,T.CanvasTexture>();
function itemTexture(id:string):T.CanvasTexture{
 let t=itemTexCache.get(id);if(t)return t;
 const def=(ITEMS as any)[id];
 const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d')!;
 x.fillStyle='rgba(20,12,30,.75)';x.beginPath();x.arc(64,64,58,0,7);x.fill();
 x.strokeStyle=def?.color||'#fff';x.lineWidth=7;x.stroke();
 x.font='900 58px Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle=def?.color||'#fff';x.fillText((def?.icon||'?').slice(0,2),64,68);
 t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;itemTexCache.set(id,t);return t;
}
