import * as T from 'three';
import {kithGltfLoader} from './kithGltf';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {characterById} from './catalog';
import {makeCreature} from './creatures3d';
import {makeKart} from './karts3d';
import {kithKart,SPECIALS} from './abilities';
import {ARENA_RADIUS,PLATFORM_RADIUS,PLATFORM_HEIGHT,forwardOf,isActive,kombatStandings,groundAt,type KombatState,type KombatKart,type Ramp,type KombatEvent} from './kombat';

// ---------------------------------------------------------------- textures

function canvasTex(w:number,h:number,draw:(x:CanvasRenderingContext2D)=>void,repeat=false):T.CanvasTexture{
 const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d')!);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;
 if(repeat){t.wrapS=t.wrapT=T.RepeatWrapping;}
 return t;
}
const glowTexture=()=>canvasTex(128,128,x=>{const g=x.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);});
const shadowTexture=()=>canvasTex(128,128,x=>{const g=x.createRadialGradient(64,64,6,64,64,60);g.addColorStop(0,'rgba(5,4,12,.85)');g.addColorStop(.6,'rgba(5,4,12,.4)');g.addColorStop(1,'rgba(5,4,12,0)');x.fillStyle=g;x.fillRect(0,0,128,128);});

function floorTexture():T.CanvasTexture{
 return canvasTex(2048,2048,x=>{
  const c=1024;
  // turf base with mow rings
  for(let r=1024;r>0;r-=32){x.fillStyle=(r/32)%2?'#3f7d3a':'#478a41';x.beginPath();x.arc(c,c,r,0,7);x.fill();}
  // dirt combat ring
  const g=x.createRadialGradient(c,c,180,c,c,760);g.addColorStop(0,'rgba(196,140,92,.0)');g.addColorStop(.25,'rgba(186,128,82,.95)');g.addColorStop(.8,'rgba(170,112,70,.9)');g.addColorStop(1,'rgba(170,112,70,0)');
  x.fillStyle=g;x.beginPath();x.arc(c,c,760,0,7);x.fill();
  // grit
  for(let i=0;i<26000;i++){const a=Math.random()*7,r=Math.random()*1000;x.fillStyle=Math.random()>.5?'rgba(255,240,210,.06)':'rgba(30,18,10,.12)';x.fillRect(c+Math.cos(a)*r,c+Math.sin(a)*r,2+Math.random()*3,2);}
  // tyre marks
  x.strokeStyle='rgba(20,14,10,.18)';x.lineWidth=7;
  for(let i=0;i<40;i++){x.beginPath();const a=Math.random()*7,r=250+Math.random()*600;x.arc(c,c,r,a,a+.3+Math.random()*.8);x.stroke();}
  // painted lines
  x.strokeStyle='rgba(255,250,235,.75)';x.lineWidth=10;
  for(const r of [300,560,960]){x.beginPath();x.arc(c,c,r,0,7);x.stroke();}
  x.setLineDash([40,30]);x.lineWidth=6;
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;x.beginPath();x.moveTo(c+Math.cos(a)*330,c+Math.sin(a)*330);x.lineTo(c+Math.cos(a)*940,c+Math.sin(a)*940);x.stroke();}
  x.setLineDash([]);
  // big star mark around the platform
  x.fillStyle='rgba(255,140,40,.55)';x.beginPath();
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2-Math.PI/2,r=i%2?190:290;x[i?'lineTo':'moveTo'](c+Math.cos(a)*r,c+Math.sin(a)*r);}x.fill();
 });
}

function stripeTexture(a:string,b:string,n=8):T.CanvasTexture{
 return canvasTex(256,256,x=>{x.fillStyle=a;x.fillRect(0,0,256,256);x.fillStyle=b;for(let i=-n;i<n*2;i++){x.beginPath();x.moveTo(i*256/n,0);x.lineTo(i*256/n+128/n,0);x.lineTo(i*256/n+128/n-256,256);x.lineTo(i*256/n-256,256);x.fill();}},true);
}

function chevronTexture(color:string):T.CanvasTexture{
 return canvasTex(256,512,x=>{x.fillStyle='rgba(0,0,0,0)';x.clearRect(0,0,256,512);x.fillStyle=color;
  for(let i=0;i<4;i++){const y=40+i*120;x.beginPath();x.moveTo(30,y+70);x.lineTo(128,y);x.lineTo(226,y+70);x.lineTo(226,y+110);x.lineTo(128,y+40);x.lineTo(30,y+110);x.fill();}},true);
}

function crateTexture(gold:boolean):T.CanvasTexture{
 return canvasTex(256,256,x=>{
  const g=x.createLinearGradient(0,0,256,256);
  if(gold){g.addColorStop(0,'#fff2a8');g.addColorStop(.5,'#ffc62e');g.addColorStop(1,'#d98a00');}else{g.addColorStop(0,'#9ef2ff');g.addColorStop(.5,'#5a7bff');g.addColorStop(1,'#c25bff');}
  x.fillStyle=g;x.fillRect(0,0,256,256);
  x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=14;x.strokeRect(10,10,236,236);
  x.fillStyle='#fff';x.font='900 170px Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';
  x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=12;x.fillText(gold?'★':'?',128,140);
 });
}

function wallTexture():T.CanvasTexture{
 return canvasTex(2048,128,x=>{
  x.fillStyle='#1b1430';x.fillRect(0,0,2048,128);
  const cols=['#ff7a1a','#ff2e93','#3df5ff','#9dff2e','#ffd400','#8f7bff'];
  for(let i=0;i<8;i++){x.fillStyle=cols[i%cols.length];x.fillRect(i*256+8,18,240,92);
   x.fillStyle='#14102a';x.font='900 46px Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(i%2?'KART KOMBAT':'KITH ARENA',i*256+128,66);}
  x.fillStyle='#fff6e8';x.fillRect(0,0,2048,8);x.fillRect(0,120,2048,8);
 },true);
}

// ---------------------------------------------------------------- particles

class Particles {
 points:T.Points; private pos:Float32Array; private col:Float32Array; private size:Float32Array; private alpha:Float32Array;
 private vel:Float32Array; private life:Float32Array; private maxLife:Float32Array; private grow:Float32Array; private drag:Float32Array; private grav:Float32Array;
 private next=0;
 constructor(scene:T.Scene,private max:number,tex:T.Texture,additive:boolean){
  this.pos=new Float32Array(max*3);this.col=new Float32Array(max*3);this.size=new Float32Array(max);this.alpha=new Float32Array(max);
  this.vel=new Float32Array(max*3);this.life=new Float32Array(max);this.maxLife=new Float32Array(max);this.grow=new Float32Array(max);this.drag=new Float32Array(max);this.grav=new Float32Array(max);
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(this.pos,3));g.setAttribute('color',new T.BufferAttribute(this.col,3));
  g.setAttribute('size',new T.BufferAttribute(this.size,1));g.setAttribute('alpha',new T.BufferAttribute(this.alpha,1));
  const m=new T.ShaderMaterial({
   uniforms:{map:{value:tex},scale:{value:420}},
   vertexShader:`attribute float size;attribute float alpha;attribute vec3 color;varying vec3 vC;varying float vA;uniform float scale;
    void main(){vC=color;vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=size*scale/max(.1,-mv.z);gl_Position=projectionMatrix*mv;}`,
   fragmentShader:`uniform sampler2D map;varying vec3 vC;varying float vA;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC*t.rgb,t.a*vA);if(gl_FragColor.a<.01)discard;}`,
   transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending,
  });
  this.points=new T.Points(g,m);this.points.frustumCulled=false;scene.add(this.points);
 }
 emit(x:number,y:number,z:number,vx:number,vy:number,vz:number,color:T.Color,size:number,life:number,opts:{grow?:number;drag?:number;gravity?:number}={}){
  const i=this.next;this.next=(this.next+1)%this.max;
  this.pos[i*3]=x;this.pos[i*3+1]=y;this.pos[i*3+2]=z;this.vel[i*3]=vx;this.vel[i*3+1]=vy;this.vel[i*3+2]=vz;
  this.col[i*3]=color.r;this.col[i*3+1]=color.g;this.col[i*3+2]=color.b;
  this.size[i]=size;this.life[i]=life;this.maxLife[i]=life;this.grow[i]=opts.grow??0;this.drag[i]=opts.drag??1.5;this.grav[i]=opts.gravity??0;this.alpha[i]=1;
 }
 burst(x:number,y:number,z:number,n:number,color:T.Color,speed:number,size:number,life:number,opts:{grow?:number;drag?:number;gravity?:number;up?:number}={}){
  for(let k=0;k<n;k++){
   const a=Math.random()*Math.PI*2,e=Math.random()*2-1,sp=speed*(.4+Math.random()*.6);
   const r=Math.sqrt(1-e*e);
   this.emit(x,y,z,Math.cos(a)*r*sp,Math.abs(e)*sp+(opts.up??0),Math.sin(a)*r*sp,color,size*(.6+Math.random()*.8),life*(.6+Math.random()*.6),opts);
  }
 }
 update(dt:number){
  for(let i=0;i<this.max;i++){
   if(this.life[i]<=0){if(this.alpha[i]!==0){this.alpha[i]=0;}continue;}
   this.life[i]-=dt;
   const d=Math.exp(-this.drag[i]*dt);
   this.vel[i*3]*=d;this.vel[i*3+1]=this.vel[i*3+1]*d-this.grav[i]*dt;this.vel[i*3+2]*=d;
   this.pos[i*3]+=this.vel[i*3]*dt;this.pos[i*3+1]+=this.vel[i*3+1]*dt;this.pos[i*3+2]+=this.vel[i*3+2]*dt;
   this.size[i]+=this.grow[i]*dt;
   const u=Math.max(0,this.life[i]/this.maxLife[i]);
   this.alpha[i]=u<.7?u/.7:1;
  }
  const g=this.points.geometry;
  (g.getAttribute('position') as T.BufferAttribute).needsUpdate=true;(g.getAttribute('size') as T.BufferAttribute).needsUpdate=true;
  (g.getAttribute('alpha') as T.BufferAttribute).needsUpdate=true;(g.getAttribute('color') as T.BufferAttribute).needsUpdate=true;
 }
}

// ---------------------------------------------------------------- geometry helpers

function wedgeGeometry(r:Ramp):T.BufferGeometry{
 const w=r.width/2,h=r.height,L=r.length;
 const v=(x:number,y:number,z:number)=>[x,y,z];
 const fl=v(-w,0,0),fr=v(w,0,0),tl=v(-w,h,L),tr=v(w,h,L),bl=v(-w,0,L),br=v(w,0,L);
 const tris=[fl,tl,tr, fl,tr,fr, tl,bl,br, tl,br,tr, fl,bl,tl, fr,tr,br];
 const uvs=[0,0,0,1,1,1, 0,0,1,1,1,0, 0,0,0,1,1,1, 0,0,1,1,1,0, 0,0,1,0,1,1, 0,0,1,1,1,0];
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(tris.flat(),3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
 g.computeVertexNormals();
 return g;
}

function standsGeometry(inner:number,steps:number,stepW:number,stepH:number):T.LatheGeometry{
 const pts:T.Vector2[]=[new T.Vector2(inner,0)];
 for(let i=0;i<steps;i++){const r=inner+i*stepW;const y=6+i*stepH;pts.push(new T.Vector2(r,y),new T.Vector2(r+stepW,y));}
 pts.push(new T.Vector2(inner+steps*stepW,0));
 return new T.LatheGeometry(pts,128);
}

let driversGlbPromise:Promise<T.Group>|null=null;
function loadDriversGlb():Promise<T.Group>{
 if(!driversGlbPromise){
  driversGlbPromise=new Promise((resolve,reject)=>{
   if(typeof window==='undefined'){reject(new Error('no-window'));return;}
   kithGltfLoader().load('/kith-party/models/drivers.glb',gltf=>resolve(gltf.scene),undefined,err=>reject(err));
  });
 }
 return driversGlbPromise;
}

function disposeTree(root:T.Object3D){
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 root.traverse(o=>{
  if(o instanceof T.Mesh||o instanceof T.Points||o instanceof T.Line||o instanceof T.Sprite){
   if((o as T.Mesh).geometry) geometries.add((o as T.Mesh).geometry);
   const m=(o as T.Mesh).material;(Array.isArray(m)?m:[m]).forEach(mm=>{if(!mm)return;materials.add(mm);Object.values(mm).forEach(v=>{if(v instanceof T.Texture)textures.add(v);});
    const u=(mm as T.ShaderMaterial).uniforms;if(u)Object.values(u).forEach(x=>{if(x&&x.value instanceof T.Texture)textures.add(x.value);});});
  }
 });
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}

// ---------------------------------------------------------------- renderer

interface KartView {
 root:T.Group; body:T.Group; wheels:T.Group[]; flames:T.Mesh[]; flameMat:T.MeshBasicMaterial;
 shield:T.Mesh; gears:T.Group; boulder:T.Mesh; ice:T.Mesh; stunRing:T.Mesh; shadow:T.Mesh; glowMat:T.MeshBasicMaterial;
 hpSprite:T.Sprite; hpCanvas:HTMLCanvasElement; hpTex:T.CanvasTexture; lastHp:number; lastShield:number;
 flashing:boolean;
}

export function createKombat3D(canvas:HTMLCanvasElement,initial:KombatState){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setSize(960,560,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 canvas.dataset.renderer='three-webgl';canvas.dataset.mode='kombat';

 const scene=new T.Scene();
 scene.fog=new T.FogExp2('#3a2a55',.0016);

 // sky
 const sky=new T.Mesh(new T.SphereGeometry(700,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
  uniforms:{sun:{value:new T.Vector3(-.4,.35,.6).normalize()}},
  vertexShader:`varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec3 d;uniform vec3 sun;void main(){float h=d.y;vec3 zen=vec3(.10,.08,.32),mid=vec3(.55,.28,.62),hor=vec3(1.,.62,.42);
   vec3 c=h>0.?mix(mix(hor,mid,smoothstep(0.,.25,h)),zen,smoothstep(.2,.8,h)):hor*.7;float s=max(dot(d,sun),0.);c+=vec3(1.,.8,.55)*pow(s,300.)*2.+vec3(1.,.55,.35)*pow(s,6.)*.35;
   float n=sin(d.x*9.+1.3)*sin(d.z*7.-.4)*sin((d.x+d.z)*5.);c=mix(c,vec3(1.,.82,.9),smoothstep(.2,.9,n)*smoothstep(.05,.15,h)*smoothstep(.6,.25,h)*.35);gl_FragColor=vec4(c,1.);}`}));
 sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);

 // environment map for reflections
 const pmrem=new T.PMREMGenerator(renderer);
 const envScene=new T.Scene();
 envScene.add(new T.Mesh(new T.SphereGeometry(50,16,12),new T.MeshBasicMaterial({side:T.BackSide,color:'#7a4a8a'})));
 const envSun=new T.Mesh(new T.SphereGeometry(8,12,8),new T.MeshBasicMaterial({color:'#fff1d0'}));envSun.position.set(-20,18,30);envScene.add(envSun);
 const envA=new T.Mesh(new T.SphereGeometry(9,10,8),new T.MeshBasicMaterial({color:'#ff7a3a'}));envA.position.set(25,6,-20);envScene.add(envA);
 const envB=new T.Mesh(new T.SphereGeometry(9,10,8),new T.MeshBasicMaterial({color:'#3df5ff'}));envB.position.set(-25,8,-25);envScene.add(envB);
 const envRT=pmrem.fromScene(envScene,.04);pmrem.dispose();disposeTree(envScene);
 scene.environment=envRT.texture;scene.environmentIntensity=.9;

 const hemi=new T.HemisphereLight('#ffe9ff','#4a3a30',1.9);scene.add(hemi);
 const sun=new T.DirectionalLight('#ffe4c4',3.4);
 sun.position.set(-60,90,80);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:1,far:320});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;
 scene.add(sun);scene.add(sun.target);
 const rim=new T.DirectionalLight('#7fdcff',1.1);rim.position.set(70,40,-60);scene.add(rim);

 const glowTex=glowTexture();
 const mat=(color:string,opts:Partial<T.MeshStandardMaterialParameters>={})=>new T.MeshStandardMaterial({color,roughness:.6,metalness:.05,...opts});

 // floor
 const floorTex=floorTexture();
 const floor=new T.Mesh(new T.CircleGeometry(ARENA_RADIUS,128),new T.MeshStandardMaterial({map:floorTex,roughness:.88,metalness:0}));
 floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const outerGround=new T.Mesh(new T.RingGeometry(ARENA_RADIUS,700,64),mat('#2c4a2a',{roughness:1}));
 outerGround.rotation.x=-Math.PI/2;outerGround.position.y=-.05;scene.add(outerGround);

 // arena wall with banners
 const wallTex=wallTexture();wallTex.repeat.set(-3,1); // seen from inside the bowl
 const wall=new T.Mesh(new T.CylinderGeometry(ARENA_RADIUS+.6,ARENA_RADIUS+.6,6,128,1,true),new T.MeshStandardMaterial({map:wallTex,side:T.DoubleSide,roughness:.5,emissive:'#ffffff',emissiveMap:wallTex,emissiveIntensity:.35}));
 wall.position.y=3;wall.receiveShadow=true;scene.add(wall);
 const wallCap=new T.Mesh(new T.TorusGeometry(ARENA_RADIUS+.6,.45,8,160),mat('#ffd9a8',{emissive:'#ff8a2a',emissiveIntensity:.6}));
 wallCap.rotation.x=Math.PI/2;wallCap.position.y=6.1;scene.add(wallCap);

 // stands + crowd
 const stands=new T.Mesh(standsGeometry(ARENA_RADIUS+2,10,2.6,1.6),mat('#3a3150',{roughness:.8,side:T.DoubleSide}));
 stands.receiveShadow=true;scene.add(stands);
 const crowdCount=1400;
 const crowdGeo=new T.CapsuleGeometry(.42,.7,3,6);
 const crowd=new T.InstancedMesh(crowdGeo,new T.MeshStandardMaterial({roughness:.7}),crowdCount);
 const crowdBase:{x:number;y:number;z:number;ph:number}[]=[];
 const dummy=new T.Object3D();const crowdCols=['#ff7a1a','#ff2e93','#3df5ff','#9dff2e','#ffd400','#8f7bff','#ffffff','#f28a36','#7961b6'];
 for(let i=0;i<crowdCount;i++){
  const row=i%10;const a=Math.random()*Math.PI*2;
  const r=ARENA_RADIUS+2+row*2.6+1.3;const y=6+row*1.6+.75;
  crowdBase.push({x:Math.cos(a)*r,y,z:Math.sin(a)*r,ph:Math.random()*6});
  dummy.position.set(Math.cos(a)*r,y,Math.sin(a)*r);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);
  crowd.setColorAt(i,new T.Color(crowdCols[i%crowdCols.length]));
 }
 crowd.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(crowd);

 // light towers
 const towerGlows:T.Sprite[]=[];
 for(let i=0;i<6;i++){
  const a=i/6*Math.PI*2+.26,r=ARENA_RADIUS+32;
  const pole=new T.Mesh(new T.CylinderGeometry(.6,1,42,10),mat('#c9c2d8',{metalness:.6,roughness:.35}));
  pole.position.set(Math.cos(a)*r,21,Math.sin(a)*r);pole.castShadow=true;scene.add(pole);
  const bank=new T.Mesh(new T.BoxGeometry(9,4,1),mat('#fff8e8',{emissive:'#fff1d0',emissiveIntensity:2.2}));
  bank.position.set(Math.cos(a)*r,43,Math.sin(a)*r);bank.lookAt(0,10,0);scene.add(bank);
  const g=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:'#fff0d0',transparent:true,opacity:.75,blending:T.AdditiveBlending,depthWrite:false}));
  g.position.copy(bank.position);g.scale.setScalar(26);scene.add(g);towerGlows.push(g);
  // flag
  const flag=new T.Mesh(new T.PlaneGeometry(6,3.2),mat(crowdCols[i],{side:T.DoubleSide,emissive:crowdCols[i],emissiveIntensity:.25}));
  flag.position.set(Math.cos(a)*r,38,Math.sin(a)*r);flag.rotation.y=-a;scene.add(flag);
 }
 // hanging banners with Kith colours
 initial.karts.forEach((k,i)=>{
  const c=characterById(k.character);const a=i/initial.karts.length*Math.PI*2+.1;const r=ARENA_RADIUS+14;
  const tex=canvasTex(128,256,x=>{x.fillStyle=c.color;x.fillRect(0,0,128,256);x.fillStyle=c.accent;x.fillRect(0,200,128,56);x.fillStyle='#fff';x.font='900 80px Arial, sans-serif';x.textAlign='center';x.fillText(c.mark,64,130);x.font='800 22px Arial, sans-serif';x.fillText(c.name.toUpperCase(),64,236);});
  const b=new T.Mesh(new T.PlaneGeometry(5,10),new T.MeshStandardMaterial({map:tex,side:T.DoubleSide,roughness:.7}));
  b.position.set(Math.cos(a)*r,22,Math.sin(a)*r);b.lookAt(0,22,0);scene.add(b);
 });

 // cover
 const hazardTex=stripeTexture('#ffb31a','#1c1426',6);
 const crateWood=canvasTex(128,128,x=>{x.fillStyle='#a8743f';x.fillRect(0,0,128,128);x.strokeStyle='#6b4423';x.lineWidth=8;x.strokeRect(4,4,120,120);x.beginPath();x.moveTo(4,4);x.lineTo(124,124);x.stroke();for(let i=0;i<40;i++){x.fillStyle='rgba(60,30,10,.2)';x.fillRect(Math.random()*128,Math.random()*128,30,2);}});
 for(const c of initial.arena.cover){
  if(c.kind==='crate-stack'){
   const m=new T.MeshStandardMaterial({map:crateWood,roughness:.8});
   for(const [ox,oz,oy] of [[-.75,-.75,0],[.75,-.75,0],[-.75,.75,0],[.75,.75,0],[0,0,1]] as [number,number,number][]){
    const s=c.hw;const b=new T.Mesh(new T.BoxGeometry(s,c.h/2+.01,s),m);b.position.set(c.x+ox*s*.66,c.h/4+oy*c.h/2,c.z+oz*s*.66);b.castShadow=b.receiveShadow=true;scene.add(b);
   }
  } else {
   const body=new T.Mesh(new T.BoxGeometry(c.hw*2,c.h,c.hd*2),c.kind==='block'?new T.MeshStandardMaterial({map:hazardTex,roughness:.55}):mat('#8a8aa6',{roughness:.7}));
   body.position.set(c.x,c.h/2,c.z);body.castShadow=body.receiveShadow=true;scene.add(body);
   const strip=new T.Mesh(new T.BoxGeometry(c.hw*2+.1,.22,c.hd*2+.1),mat('#3df5ff',{emissive:'#3df5ff',emissiveIntensity:1.6}));
   strip.position.set(c.x,c.h+.05,c.z);scene.add(strip);
  }
 }
 const ringMats:T.MeshStandardMaterial[]=[];
 for(const p of initial.arena.pillars){
  const col=new T.Mesh(new T.CylinderGeometry(p.r,p.r*1.15,p.h,20),mat('#d9cfe6',{roughness:.45,metalness:.2}));
  col.position.set(p.x,p.h/2,p.z);col.castShadow=col.receiveShadow=true;scene.add(col);
  for(const y of [2.2,5.4,8.4]){const rm=mat('#ff2e93',{emissive:'#ff2e93',emissiveIntensity:1.4});ringMats.push(rm);const ring=new T.Mesh(new T.TorusGeometry(p.r+.12,.14,6,24),rm);ring.rotation.x=Math.PI/2;ring.position.set(p.x,y,p.z);scene.add(ring);}
 }
 // ramps
 const chevOrange=chevronTexture('#ffd27a');
 for(const r of initial.arena.ramps){
  const g=wedgeGeometry(r);
  const m=new T.Mesh(g,mat(r.kind==='jump'?'#ff8a2a':'#8f7bff',{roughness:.45,metalness:.1,side:T.DoubleSide}));
  m.position.set(r.x,r.base+.01,r.z);m.rotation.y=r.angle;m.castShadow=m.receiveShadow=true;scene.add(m);
  // chevrons along the top surface
  const top=new T.Mesh(new T.PlaneGeometry(r.width*.6,Math.hypot(r.length,r.height)),new T.MeshBasicMaterial({map:chevOrange,transparent:true,depthWrite:false,opacity:.9}));
  const slope=Math.atan2(r.height,r.length);
  const holder=new T.Group();holder.position.set(r.x,r.base,r.z);holder.rotation.y=r.angle;scene.add(holder);
  top.rotation.x=-Math.PI/2+slope;top.position.set(0,r.height/2+.06,r.length/2);holder.add(top);
 }
 // centre platform
 const platTex=canvasTex(512,512,x=>{x.fillStyle='#2a2140';x.fillRect(0,0,512,512);x.strokeStyle='#ffb347';x.lineWidth=10;for(const r of [80,160,240]){x.beginPath();x.arc(256,256,r,0,7);x.stroke();}x.fillStyle='#ffb347';x.font='900 120px Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('✳',256,262);});
 const plat=new T.Mesh(new T.CylinderGeometry(PLATFORM_RADIUS,PLATFORM_RADIUS+.8,PLATFORM_HEIGHT,64),[mat('#5b4a7a',{roughness:.5}),new T.MeshStandardMaterial({map:platTex,roughness:.5}),mat('#2a2140')]);
 plat.position.y=PLATFORM_HEIGHT/2;plat.castShadow=plat.receiveShadow=true;scene.add(plat);
 const platRingMat=mat('#ffb347',{emissive:'#ff8a1a',emissiveIntensity:1.8});
 const platRing=new T.Mesh(new T.TorusGeometry(PLATFORM_RADIUS,.25,8,96),platRingMat);platRing.rotation.x=Math.PI/2;platRing.position.y=PLATFORM_HEIGHT+.05;scene.add(platRing);
 // boost pads
 const chevBoost=chevronTexture('#ffffff');
 const padMats:T.MeshBasicMaterial[]=[];
 for(const p of initial.arena.pads){
  const pm=new T.MeshBasicMaterial({map:chevBoost.clone(),color:'#ff9a2a',transparent:true,blending:T.AdditiveBlending,depthWrite:false});
  pm.map!.needsUpdate=true;padMats.push(pm);
  const m=new T.Mesh(new T.PlaneGeometry(5,7),pm);m.rotation.x=-Math.PI/2;m.rotation.z=-p.angle+Math.PI;m.position.set(p.x,.04,p.z);scene.add(m);
  const base=new T.Mesh(new T.PlaneGeometry(5.6,7.6),new T.MeshStandardMaterial({color:'#1c1426',roughness:.4}));base.rotation.copy(m.rotation);base.position.set(p.x,.02,p.z);base.receiveShadow=true;scene.add(base);
 }
 // crates
 const crateMats={normal:new T.MeshStandardMaterial({map:crateTexture(false),emissive:'#6a7bff',emissiveIntensity:.55,roughness:.25,metalness:.1,transparent:true,opacity:.92}),
  gold:new T.MeshStandardMaterial({map:crateTexture(true),emissive:'#ffb000',emissiveIntensity:.8,roughness:.2,metalness:.5})};
 const crateGeo=new T.BoxGeometry(1.8,1.8,1.8);
 const crates=initial.crates.map(c=>{const m=new T.Mesh(crateGeo,c.gold?crateMats.gold:crateMats.normal);m.position.set(c.x,c.y+1.6,c.z);m.castShadow=true;scene.add(m);
  const g=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:c.gold?'#ffd24a':'#8fa0ff',transparent:true,opacity:.6,blending:T.AdditiveBlending,depthWrite:false}));g.scale.setScalar(5);m.add(g);return m;});

 // storm wall
 const stormMat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
  uniforms:{time:{value:0}},
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vW;void main(){vUv=uv;vN=normalize(normalMatrix*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vW;uniform float time;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
   float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
   void main(){vec2 p=vec2(vUv.x*60.,vUv.y*6.);float sw=fbm(p+vec2(time*.6,-time*.9))*.7+fbm(p*2.3-vec2(time*1.1,time*.4))*.3;
    vec3 view=normalize(cameraPosition-vW);float fres=pow(1.-abs(dot(view,vN)),1.6);
    vec3 col=mix(vec3(.45,.12,.85),vec3(.15,.95,.9),smoothstep(.35,.75,sw));
    float bands=smoothstep(.0,.08,vUv.y)*(1.-smoothstep(.7,1.,vUv.y));
    float a=(.28+sw*.45+fres*.35)*bands;float edge=smoothstep(.0,.04,vUv.y)*(1.-smoothstep(.04,.12,vUv.y));col+=vec3(.8,.5,1.)*edge*1.5;
    gl_FragColor=vec4(col*(1.2+sw),clamp(a+edge*.5,0.,.85));}`});
 const storm=new T.Mesh(new T.CylinderGeometry(1,1,1,128,1,true),stormMat);storm.renderOrder=5;scene.add(storm);
 const stormEdge=new T.Mesh(new T.RingGeometry(.985,1,128),new T.MeshBasicMaterial({color:'#c77dff',transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false}));
 stormEdge.rotation.x=-Math.PI/2;stormEdge.position.y=.08;scene.add(stormEdge);
 const nextRing=new T.Mesh(new T.RingGeometry(.99,1,128),new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}));
 nextRing.rotation.x=-Math.PI/2;nextRing.position.y=.1;scene.add(nextRing);

 // particles
 const fxAdd=new Particles(scene,2400,glowTex,true);
 const smokeTex=canvasTex(128,128,x=>{for(let i=0;i<8;i++){const px=40+Math.random()*48,py=40+Math.random()*48,r=20+Math.random()*22;const g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,7);x.fill();}});
 const fxSmoke=new Particles(scene,1400,smokeTex,false);

 // reusable shockwave rings / beams / lightning
 const transient:{obj:T.Object3D;life:number;max:number;update:(u:number,o:T.Object3D)=>void}[]=[];
 const addTransient=(obj:T.Object3D,life:number,update:(u:number,o:T.Object3D)=>void)=>{scene.add(obj);transient.push({obj,life,max:life,update});};
 const ringGeo=new T.RingGeometry(.85,1,64);
 const shockwave=(x:number,y:number,z:number,color:string,radius:number,life=.5)=>{
  const m=new T.Mesh(ringGeo,new T.MeshBasicMaterial({color,transparent:true,blending:T.AdditiveBlending,side:T.DoubleSide,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.set(x,y+.2,z);
  addTransient(m,life,(u,o)=>{const mm=o as T.Mesh;const s=.5+(1-u)*radius;mm.scale.set(s,s,s);(mm.material as T.MeshBasicMaterial).opacity=u;});
 };
 const beamGeo=new T.CylinderGeometry(1,1,1,16,1,true);
 const beam=(x:number,y:number,z:number,color:string,height:number,width:number,life:number)=>{
  const m=new T.Mesh(beamGeo,new T.MeshBasicMaterial({color,transparent:true,blending:T.AdditiveBlending,side:T.DoubleSide,depthWrite:false}));
  m.position.set(x,y+height/2,z);m.scale.set(width,height,width);
  addTransient(m,life,(u,o)=>{const mm=o as T.Mesh;(mm.material as T.MeshBasicMaterial).opacity=u*.85;mm.scale.x=mm.scale.z=width*(.3+u*.7);});
 };
 const lightning=(a:T.Vector3,b:T.Vector3,color:string,life=.35)=>{
  const pts:T.Vector3[]=[];const seg=12;
  for(let i=0;i<=seg;i++){const p=a.clone().lerp(b,i/seg);if(i>0&&i<seg)p.add(new T.Vector3((Math.random()-.5)*2.2,(Math.random()-.5)*2.2,(Math.random()-.5)*2.2));pts.push(p);}
  const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));
  addTransient(line,life,(u,o)=>{((o as T.Line).material as T.LineBasicMaterial).opacity=u;});
  // thicker glow core using a thin tube
  const curve=new T.CatmullRomCurve3(pts);
  const tube=new T.Mesh(new T.TubeGeometry(curve,24,.14,5,false),new T.MeshBasicMaterial({color,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));
  addTransient(tube,life,(u,o)=>{((o as T.Mesh).material as T.MeshBasicMaterial).opacity=u;});
 };

 // karts
 const shadowTex=shadowTexture();
 const mixers:T.AnimationMixer[]=[];let disposed=false;
 const shieldGeo=new T.SphereGeometry(2.3,24,16);
 const gearGeo=new T.TorusGeometry(.45,.16,6,10);
 const boulderGeo=new T.IcosahedronGeometry(2.1,1);
 const karts:KartView[]=initial.karts.map(k=>{
  const c=characterById(k.character);const kk=kithKart(k.character);
  const root=new T.Group();scene.add(root);
  const {body,wheels,exhaustPorts}=makeKart(c);root.add(body);
  const driver=makeCreature(c);driver.position.set(0,.78,-.18);driver.scale.setScalar(.9);body.add(driver);
  if(k.character==='rello'||k.character==='chora'){
   kithGltfLoader().load(`/kith-party/models/${k.character}.glb`,gltf=>{
    if(disposed){disposeTree(gltf.scene);return;}
    const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const wrapper=new T.Group();gltf.scene.position.set(-center.x,-bounds.min.y,-center.z);wrapper.add(gltf.scene);wrapper.scale.setScalar(2.05/size.y);wrapper.position.set(0,.42,-.22);
    gltf.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    body.remove(driver);disposeTree(driver);body.add(wrapper);
    const idle=gltf.animations.find(a=>a.name==='idle');if(idle){const mixer=new T.AnimationMixer(gltf.scene);mixer.clipAction(idle).play();mixers.push(mixer);}
   },undefined,()=>{canvas.dataset.modelFallback='true';});
  } else {
   loadDriversGlb().then(root2=>{
    if(disposed) return;const template=root2.getObjectByName(`driver_${k.character}`);if(!template) return;
    const d=template.clone(true);d.position.set(0,.56,-.18);d.scale.setScalar(.95);
    d.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;const hv=o.geometry.hasAttribute('color');o.material=new T.MeshPhysicalMaterial({color:hv?'#ffffff':c.color,vertexColors:hv,roughness:.34,metalness:.06,clearcoat:.45,envMapIntensity:1.25});}});
    body.remove(driver);disposeTree(driver);body.add(d);
   }).catch(()=>{});
  }
  const flameMat=new T.MeshBasicMaterial({color:kk.flameOuter,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false});
  const flames:T.Mesh[]=[];
  (exhaustPorts.length?exhaustPorts:[new T.Vector3(-.36,.48,-1.5),new T.Vector3(.36,.48,-1.5)]).forEach(pos=>{
   const fl=new T.Mesh(new T.ConeGeometry(.2,1.5,12,1,true),flameMat);fl.rotation.x=-Math.PI/2;fl.position.set(pos.x,pos.y,pos.z-.75);fl.visible=false;body.add(fl);flames.push(fl);
   const core=new T.Mesh(new T.ConeGeometry(.1,1,10,1,true),new T.MeshBasicMaterial({color:kk.flameCore,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));core.position.y=.15;fl.add(core);
  });
  const shield=new T.Mesh(shieldGeo,new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.FrontSide,uniforms:{color:{value:new T.Color('#7ee8ff')},time:{value:0}},
   vertexShader:`varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
   fragmentShader:`uniform vec3 color;uniform float time;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(vN,vV)),2.2);float hex=.5+.5*sin(vN.x*30.+time*3.)*sin(vN.y*30.-time*2.);gl_FragColor=vec4(color*(f*1.6+hex*.12),f*.9+.06);}`}));
  shield.position.y=.9;shield.visible=false;root.add(shield);
  const gears=new T.Group();gears.position.y=.9;
  for(let i=0;i<3;i++){const g=new T.Mesh(gearGeo,mat('#ffb347',{metalness:.85,roughness:.25,emissive:'#ff7a1a',emissiveIntensity:.4}));const a=i/3*Math.PI*2;g.position.set(Math.cos(a)*2.4,0,Math.sin(a)*2.4);g.rotation.x=Math.PI/2;gears.add(g);}
  gears.visible=false;root.add(gears);
  const boulder=new T.Mesh(boulderGeo,mat('#9a6a48',{roughness:.95,flatShading:true}));boulder.position.y=1.2;boulder.visible=false;boulder.castShadow=true;root.add(boulder);
  const ice=new T.Mesh(new T.BoxGeometry(3.2,2.4,4.4),new T.MeshPhysicalMaterial({color:'#bff4ff',roughness:.05,transmission:.6,thickness:1,transparent:true,opacity:.75}));ice.position.y=1;ice.visible=false;root.add(ice);
  const stunRing=new T.Mesh(new T.TorusGeometry(.8,.08,6,24),new T.MeshBasicMaterial({color:'#ffe14a',transparent:true,blending:T.AdditiveBlending}));stunRing.rotation.x=Math.PI/2;stunRing.position.y=2.6;stunRing.visible=false;root.add(stunRing);
  const shadow=new T.Mesh(new T.PlaneGeometry(3.2,4.4),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.85}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const glowMat=new T.MeshBasicMaterial({map:glowTex,color:c.accent,transparent:true,opacity:.45,blending:T.AdditiveBlending,depthWrite:false});
  const glow=new T.Mesh(new T.PlaneGeometry(3.8,4.8),glowMat);glow.rotation.x=-Math.PI/2;glow.position.y=.05;body.add(glow);
  const hpCanvas=document.createElement('canvas');hpCanvas.width=128;hpCanvas.height=28;
  const hpTex=new T.CanvasTexture(hpCanvas);hpTex.colorSpace=T.SRGBColorSpace;
  const hpSprite=new T.Sprite(new T.SpriteMaterial({map:hpTex,depthWrite:false,transparent:true}));hpSprite.scale.set(3.2,.7,1);hpSprite.position.y=3.4;root.add(hpSprite);
  return {root,body,wheels,flames,flameMat,shield,gears,boulder,ice,stunRing,shadow,glowMat,hpSprite,hpCanvas,hpTex,lastHp:-1,lastShield:-1,flashing:false};
 });

 const drawHp=(v:KartView,k:KombatKart)=>{
  const hp=Math.max(0,Math.round(k.hp));if(hp===v.lastHp&&k.shield===v.lastShield)return;v.lastHp=hp;v.lastShield=k.shield;
  const x=v.hpCanvas.getContext('2d')!;x.clearRect(0,0,128,28);
  x.fillStyle='rgba(12,8,24,.75)';x.fillRect(0,6,128,16);
  x.fillStyle=hp>60?'#7dff5a':hp>30?'#ffd24a':'#ff4a4a';x.fillRect(2,8,124*hp/100,12);
  for(let i=0;i<k.lives;i++){x.fillStyle='#fff';x.beginPath();x.arc(8+i*12,3.5,3.2,0,7);x.fill();}
  if(k.shield>0){x.strokeStyle='#7ee8ff';x.lineWidth=3;x.strokeRect(1,7,126,14);}
  v.hpTex.needsUpdate=true;
 };

 // projectiles / traps (pooled by id)
 const projViews=new Map<number,T.Object3D>();
 const trapViews=new Map<number,T.Object3D>();
 const seedGeo=new T.SphereGeometry(.45,14,10);
 const makeProjectile=(kind:string):T.Object3D=>{
  if(kind==='seed-bolt'){const m=new T.Mesh(seedGeo,mat('#7ee05a',{emissive:'#7ee05a',emissiveIntensity:2}));const g=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:'#9dff7a',blending:T.AdditiveBlending,transparent:true,depthWrite:false}));g.scale.setScalar(2.6);m.add(g);return m;}
  if(kind==='homing-hornet'){
   const g=new T.Group();
   const b=new T.Mesh(new T.CapsuleGeometry(.32,.9,4,10),mat('#ffcc33',{emissive:'#ff9a00',emissiveIntensity:.8}));b.rotation.x=Math.PI/2;g.add(b);
   const stripe=new T.Mesh(new T.CylinderGeometry(.34,.34,.18,12),mat('#1a1420'));stripe.rotation.x=Math.PI/2;g.add(stripe);
   for(const s of [-1,1]){const w=new T.Mesh(new T.PlaneGeometry(.9,.45),new T.MeshBasicMaterial({color:'#e8fbff',transparent:true,opacity:.7,side:T.DoubleSide}));w.position.set(s*.55,.3,0);w.name='wing';g.add(w);}
   const glow=new T.Sprite(new T.SpriteMaterial({map:glowTex,color:'#ffcc33',blending:T.AdditiveBlending,transparent:true,depthWrite:false}));glow.scale.setScalar(3);g.add(glow);
   return g;
  }
  // riptide wave
  const w=new T.Mesh(new T.TorusGeometry(7,1.4,10,32,Math.PI),new T.MeshPhysicalMaterial({color:'#38c8ff',emissive:'#1a7fff',emissiveIntensity:.5,roughness:.1,transmission:.4,transparent:true,opacity:.8}));
  w.rotation.y=Math.PI/2;
  const holder=new T.Group();holder.add(w);return holder;
 };
 const makeTrap=(kind:string,r:number):T.Object3D=>{
  if(kind==='goo-mine'){const g=new T.Group();const d=new T.Mesh(new T.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI/2),mat('#b45cff',{emissive:'#7a1aff',emissiveIntensity:.7,roughness:.15}));d.scale.set(r*.75,r*.45,r*.75);g.add(d);
   const blink=new T.Mesh(new T.SphereGeometry(.22,8,6),new T.MeshBasicMaterial({color:'#ff3a6a'}));blink.position.y=r*.48;blink.name='blink';g.add(blink);return g;}
  if(kind==='bramble'){const g=new T.Group();const m=mat('#4f9a2e',{roughness:.7});const t=mat('#c8ff6a',{emissive:'#7ccf4a',emissiveIntensity:.5});
   for(let i=0;i<26;i++){const a=Math.random()*7,d=Math.sqrt(Math.random())*r;const s=new T.Mesh(new T.ConeGeometry(.22,1.2+Math.random(),5),i%3?m:t);s.position.set(Math.cos(a)*d,.5,Math.sin(a)*d);s.rotation.set((Math.random()-.5),0,(Math.random()-.5));g.add(s);}
   const disc=new T.Mesh(new T.CircleGeometry(r,24),new T.MeshBasicMaterial({color:'#2a5a1a',transparent:true,opacity:.6,depthWrite:false}));disc.rotation.x=-Math.PI/2;disc.position.y=.05;g.add(disc);return g;}
  if(kind==='ice-slick'){const d=new T.Mesh(new T.CircleGeometry(r,28),new T.MeshPhysicalMaterial({color:'#c8f6ff',roughness:.02,metalness:.1,clearcoat:1,transparent:true,opacity:.75}));d.rotation.x=-Math.PI/2;d.position.y=.06;const g=new T.Group();g.add(d);return g;}
  // fire
  const g=new T.Group();g.name='fire';return g;
 };

 const humans=initial.karts.filter(k=>k.human);
 const cameras=humans.map(()=>new T.PerspectiveCamera(62,960/560,.1,1600));
 const camTargets=humans.map(()=>new T.Vector3());
 let initialized=false;let lastEventT=-999;const seenEvents=new Set<KombatEvent>();
 const tmpV=new T.Vector3(),tmpV2=new T.Vector3();
 const colorOf=(hex:string)=>new T.Color(hex);
 const white=new T.Color('#ffffff'),orange=new T.Color('#ff8a2a'),dark=new T.Color('#3a3540'),dust=new T.Color('#c9a27a');
 let time=0;

 const handleEvent=(s:KombatState,e:KombatEvent)=>{
  const k=e.kart>=0?s.karts[e.kart]:null;
  const y=(e.y||0)+1;
  switch(e.type){
   case 'hit': fxAdd.burst(e.x,y,e.z,26,orange,14,.7,.45,{drag:3});fxAdd.burst(e.x,y,e.z,10,white,8,1,.25,{drag:4});break;
   case 'block': fxAdd.burst(e.x,y,e.z,30,colorOf('#7ee8ff'),12,.6,.4,{drag:3});shockwave(e.x,e.y||0,e.z,'#7ee8ff',4,.35);break;
   case 'reflect': fxAdd.burst(e.x,y,e.z,30,colorOf('#ffb347'),14,.6,.4,{drag:3});break;
   case 'explode':
    fxAdd.burst(e.x,y,e.z,60,orange,20,1.3,.7,{drag:2.4,up:2});fxAdd.burst(e.x,y,e.z,30,colorOf('#fff2a0'),12,1.6,.35,{drag:3});
    fxSmoke.burst(e.x,y,e.z,26,dark,7,2.6,1.6,{grow:3,drag:1.2,up:2});shockwave(e.x,e.y||0,e.z,'#ffb347',9,.55);break;
   case 'ko':
    if(k)beam(e.x,e.y||0,e.z,characterById(k.character).accent,60,2.2,1.1);
    fxAdd.burst(e.x,y,e.z,80,colorOf('#ffffff'),26,1.4,.9,{drag:2,up:4});break;
   case 'drop': beam(e.x,0,e.z,'#9fe8ff',40,1.4,1.4);break;
   case 'pickup': fxAdd.burst(e.x,1.6,e.z,30,colorOf('#b8c4ff'),10,.7,.5,{drag:3,up:3});break;
   case 'boost': if(k){const f=forwardOf(k.heading);fxAdd.burst(k.x-f.x*2,k.y+.6,k.z-f.z*2,14,colorOf(kithKart(k.character).flameOuter),6,.8,.35,{drag:3});}break;
   case 'storm': break;
   case 'win': if(k)for(let i=0;i<4;i++)fxAdd.burst(k.x,k.y+3+i,k.z,60,colorOf(['#ff7a1a','#ff2e93','#3df5ff','#ffd400'][i]),20,1,1.6,{gravity:9,drag:1,up:6});break;
   case 'special': {
    if(!k||!e.special) break;
    const sp=SPECIALS[e.special];const col=colorOf(sp.color);
    const from=tmpV.set(k.x,k.y+1.2,k.z);
    switch(e.special){
     case 'bass-drop': shockwave(k.x,k.y,k.z,sp.color,26,.7);shockwave(k.x,k.y,k.z,'#ffffff',20,.5);fxAdd.burst(k.x,k.y+1,k.z,50,col,22,.8,.5,{drag:2});break;
     case 'chain-lightning': {let a=from.clone();for(const ti of e.targets||[]){const t=s.karts[ti];const b=tmpV2.set(t.x,t.y+1.2,t.z).clone();lightning(a,b,sp.color);lightning(a,b,'#ffffff',.2);fxAdd.burst(b.x,b.y,b.z,30,col,12,.7,.4);a=b;}if(!(e.targets||[]).length)fxAdd.burst(k.x,k.y+2,k.z,30,col,12,.7,.4);break;}
     case 'glacier-wake': {for(const ti of e.targets||[]){const t=s.karts[ti];lightning(from.clone(),new T.Vector3(t.x,t.y+1.2,t.z),sp.color,.5);fxAdd.burst(t.x,t.y+1,t.z,40,colorOf('#e6fbff'),10,.8,.6);}fxSmoke.burst(k.x,k.y+.5,k.z,20,colorOf('#dff8ff'),5,2,1.2,{grow:2});break;}
     case 'confetti-storm': for(const c of ['#ff6ac1','#ffd400','#3df5ff','#9dff2e','#ffffff'])fxAdd.burst(k.x,k.y+2,k.z,40,colorOf(c),24,.55,1.6,{gravity:6,drag:1.4,up:6});break;
     case 'moon-warp': beam(k.x,k.y,k.z,sp.color,14,2,.6);fxAdd.burst(k.x,k.y+1,k.z,60,col,16,.8,.6);shockwave(k.x,k.y,k.z,sp.color,8,.4);break;
     case 'inferno-afterburner': fxAdd.burst(k.x,k.y+1,k.z,60,colorOf('#ff5a1a'),18,1.2,.6,{up:3});shockwave(k.x,k.y,k.z,'#ff8a2a',10,.45);break;
     case 'boulder-bash': fxSmoke.burst(k.x,k.y+.5,k.z,40,dust,10,2.4,1.2,{grow:3});shockwave(k.x,k.y,k.z,'#c98a5a',8,.5);break;
     case 'gear-shield': fxAdd.burst(k.x,k.y+1,k.z,40,col,10,.6,.5);break;
     case 'bramble-snare': fxAdd.burst(k.x,k.y+1,k.z,30,col,8,.7,.6,{gravity:4});break;
     case 'riptide-wave': fxAdd.burst(k.x,k.y+1,k.z,40,col,12,.8,.5);break;
    }
    break;}
  }
 };

 return {
  render(s:KombatState,dt:number,_audioCtx?:AudioContext|null,_sound?:boolean){
   time+=dt;
   for(const m of mixers)m.update(dt);
   // events
   for(const e of s.events){if(e.t<lastEventT-0.001||seenEvents.has(e))continue;seenEvents.add(e);handleEvent(s,e);}
   if(s.events.length)lastEventT=s.events[s.events.length-1].t;
   if(seenEvents.size>400){const keep=new Set(s.events);for(const e of seenEvents)if(!keep.has(e))seenEvents.delete(e);}

   // crowd bob (cheering harder in the final circles)
   const cheer=.18+s.storm.phase*.08;
   for(let i=0;i<crowdCount;i++){const b=crowdBase[i];dummy.position.set(b.x,b.y+Math.max(0,Math.sin(time*6+b.ph))*cheer,b.z);dummy.updateMatrix();crowd.setMatrixAt(i,dummy.matrix);}
   crowd.instanceMatrix.needsUpdate=true;
   towerGlows.forEach((g,i)=>{(g.material as T.SpriteMaterial).opacity=.6+Math.sin(time*2+i)*.1;});
   ringMats.forEach((m,i)=>{m.emissiveIntensity=1+Math.sin(time*4+i*.7)*.6;});
   platRingMat.emissiveIntensity=1.5+Math.sin(time*3)*.5;
   padMats.forEach(p=>{p.map!.offset.y=-(time*1.6)%1;});

   // crates
   s.crates.forEach((c,i)=>{const m=crates[i];m.visible=c.active;if(c.active){m.rotation.y=time*1.4+i;m.rotation.x=Math.sin(time+i)*.25;m.position.y=c.y+1.6+Math.sin(time*2.4+i)*.25;}});

   // storm
   const st=s.storm;
   stormMat.uniforms.time.value=time;
   storm.position.set(st.cx,40,st.cz);storm.scale.set(st.r,80,st.r);
   stormEdge.position.set(st.cx,.08,st.cz);stormEdge.scale.set(st.r,st.r,1);
   const showNext=st.toR<st.r-.5;nextRing.visible=showNext;
   if(showNext){nextRing.position.set(st.toCx,.1,st.toCz);nextRing.scale.set(st.toR,st.toR,1);}

   // karts
   s.karts.forEach((k,i)=>{
    const v=karts[i];const visible=!k.eliminated&&k.respawn<=0;
    v.root.visible=visible;v.shadow.visible=visible;
    if(!visible)return;
    v.root.position.set(k.x,k.y,k.z);
    v.root.rotation.y=k.heading;
    v.body.rotation.set(k.pitch,k.driftDir!==0&&k.driftStage>=0&&k.drift>0?-k.driftDir*.32:-k.steer*.08,k.roll);
    v.body.position.y=k.jounce*.45;
    v.wheels.forEach((w,wi)=>{if(wi>=2)w.rotation.y=-k.steer*.38;w.rotation.x+=k.speed*dt*1.6;});
    // ground shadow
    v.shadow.position.set(k.x,groundAt(s.arena,k.x,k.z)+.03,k.z);(v.shadow.material as T.MeshBasicMaterial).opacity=.85*Math.max(.15,1-(k.y-groundAt(s.arena,k.x,k.z))/14);
    v.shadow.rotation.z=k.heading;
    // flames
    const boosting=k.boost>0;
    v.flames.forEach((f,fi)=>{f.visible=boosting||k.speed>18;f.scale.set(boosting?1.5:1,boosting?2.6+Math.sin(time*50+fi)*.35:.5+k.speed*.02,boosting?1.5:1);});
    if(boosting&&Math.random()<.6){const f=forwardOf(k.heading);if(Math.random()<.5)fxSmoke.emit(k.x-f.x*2.2,k.y+.6,k.z-f.z*2.2,(Math.random()-.5)*2,1.8,(Math.random()-.5)*2,colorOf('#9a909c'),.8,.6,{grow:1.4,drag:1.5});
     fxAdd.emit(k.x-f.x*2.4,k.y+.6,k.z-f.z*2.4,-f.x*8,1,-f.z*8,colorOf(kithKart(k.character).flameOuter),.9,.25,{drag:2});}
    // drift sparks + tyre smoke
    if(k.driftStage>0&&k.grounded){const f=forwardOf(k.heading);const cols=['#5ad8ff','#ff9a2a','#e040fb'];for(const sd of [-1,1]){const rx=-Math.cos(k.heading)*sd,rz=Math.sin(k.heading)*sd;
     fxAdd.emit(k.x-f.x*1.2+rx*1.1,k.y+.3,k.z-f.z*1.2+rz*1.1,(Math.random()-.5)*4,2+Math.random()*3,(Math.random()-.5)*4,colorOf(cols[k.driftStage-1]),.45,.3,{gravity:12,drag:1});}}
    if(k.drift>0&&k.grounded&&Math.random()<.5){const f=forwardOf(k.heading);fxSmoke.emit(k.x-f.x*1.4,k.y+.3,k.z-f.z*1.4,0,.8,0,colorOf('#d8d4dc'),1,1,{grow:2,drag:1});}
    if(k.grounded&&Math.abs(k.speed)>20&&k.y<.2&&Math.random()<.15){const f=forwardOf(k.heading);fxSmoke.emit(k.x-f.x*1.6,.3,k.z-f.z*1.6,0,.6,0,dust,.9,.8,{grow:1.6,drag:1.2});}
    v.glowMat.opacity=boosting?.75:.35;
    // status visuals
    const boulder=k.specialActive>0&&k.specialId==='boulder-bash';
    v.boulder.visible=boulder;if(boulder){v.boulder.rotation.x+=k.speed*dt*.5;}
    v.shield.visible=k.shield>0;((v.shield.material as T.ShaderMaterial).uniforms.time.value=time);
    ((v.shield.material as T.ShaderMaterial).uniforms.color.value as T.Color).set(k.reflect>0?'#ffb347':'#7ee8ff');
    v.gears.visible=k.reflect>0;v.gears.rotation.y=time*4;
    v.ice.visible=k.frozen>0;
    v.stunRing.visible=k.stun>0||k.spin>0;v.stunRing.rotation.z=time*6;
    const blink=k.invuln>0&&Math.floor(time*16)%2===0;
    v.body.visible=!boulder&&!blink;
    const flash=k.flash>0;
    if(flash||v.flashing){
     v.body.traverse(o=>{if(!(o instanceof T.Mesh))return;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(!(m instanceof T.MeshStandardMaterial))continue;
      if(m.userData.kkEm===undefined){m.userData.kkEm=m.emissive.getHex();m.userData.kkEi=m.emissiveIntensity;}
      if(flash){m.emissive.set('#ff3030');m.emissiveIntensity=k.flash*3;}else{m.emissive.setHex(m.userData.kkEm);m.emissiveIntensity=m.userData.kkEi;}}});
     v.flashing=flash;
    }
    v.hpSprite.visible=!k.human||humans.length>1;
    drawHp(v,k);
    // fire trail particles from inferno
    if(k.specialActive>0&&k.specialId==='inferno-afterburner'){const f=forwardOf(k.heading);for(let n=0;n<3;n++)fxAdd.emit(k.x-f.x*2.5+(Math.random()-.5),k.y+.5,k.z-f.z*2.5+(Math.random()-.5),(Math.random()-.5)*3,2+Math.random()*3,(Math.random()-.5)*3,colorOf(n%2?'#ff5a1a':'#ffd27a'),1.4,.5,{drag:1.5});}
   });

   // projectiles
   const liveP=new Set<number>();
   for(const p of s.projectiles){
    liveP.add(p.id);let o=projViews.get(p.id);
    if(!o){o=makeProjectile(p.kind);scene.add(o);projViews.set(p.id,o);}
    o.position.set(p.x,p.y,p.z);o.rotation.y=Math.atan2(p.vx,p.vz);
    if(p.kind==='homing-hornet'){o.children.forEach(c=>{if(c.name==='wing')c.rotation.z=Math.sin(time*80)*.6;});fxAdd.emit(p.x,p.y,p.z,0,0,0,colorOf('#ffcc33'),.6,.25);}
    else if(p.kind==='seed-bolt'){fxAdd.emit(p.x,p.y,p.z,0,0,0,colorOf('#7ee05a'),.7,.3);}
    else {fxSmoke.emit(p.x+(Math.random()-.5)*12,p.y+.5,p.z+(Math.random()-.5)*2,0,3,0,colorOf('#e6fbff'),1.4,.6,{grow:2});}
   }
   for(const [id,o] of projViews) if(!liveP.has(id)){scene.remove(o);disposeTree(o);projViews.delete(id);}
   // traps
   const liveT=new Set<number>();
   for(const t of s.traps){
    liveT.add(t.id);let o=trapViews.get(t.id);
    if(!o){o=makeTrap(t.kind,t.r);o.position.set(t.x,0,t.z);o.position.y=0;scene.add(o);trapViews.set(t.id,o);}
    if(t.kind==='fire'){if(Math.random()<.9)fxAdd.emit(t.x+(Math.random()-.5)*t.r,.4,t.z+(Math.random()-.5)*t.r,0,3+Math.random()*3,0,colorOf(Math.random()<.5?'#ff5a1a':'#ffb347'),1.2,.45,{drag:1});}
    if(t.kind==='goo-mine'){const b=o.getObjectByName('blink');if(b)b.visible=Math.floor(time*4)%2===0;}
    if(t.life<1)o.scale.setScalar(Math.max(.01,t.life));
   }
   for(const [id,o] of trapViews) if(!liveT.has(id)){scene.remove(o);disposeTree(o);trapViews.delete(id);}

   // transients
   for(let i=transient.length-1;i>=0;i--){const tr=transient[i];tr.life-=dt;if(tr.life<=0){scene.remove(tr.obj);disposeTree(tr.obj);transient.splice(i,1);continue;}tr.update(tr.life/tr.max,tr.obj);}
   fxAdd.update(dt);fxSmoke.update(dt);

   // viewport & cameras
   const rect=canvas.getBoundingClientRect();
   const w=Math.max(320,Math.round(rect.width)),h=Math.max(190,Math.round(rect.height));
   const size=renderer.getSize(new T.Vector2());if(size.x!==w||size.y!==h)renderer.setSize(w,h,false);
   renderer.setScissorTest(true);
   const leader=kombatStandings(s).find(isActive)||s.karts[0];
   cameras.forEach((cam,i)=>{
    const human=s.karts[humans[i].index];
    const subject=isActive(human)?human:human.respawn>0&&!human.eliminated?null:leader;
    let desired:T.Vector3,look:T.Vector3;
    if(subject){
     const f=forwardOf(subject.heading);
     const back=8.5+Math.max(0,subject.speed)*.04+(subject.boost>0?1.2:0);
     desired=new T.Vector3(subject.x-f.x*back,subject.y+3.6+(subject.boost>0?-.2:0),subject.z-f.z*back);
     look=new T.Vector3(subject.x+f.x*6,subject.y+1.2,subject.z+f.z*6);
     if(subject.flash>0){desired.x+=Math.sin(time*90)*.25;desired.y+=Math.cos(time*80)*.2;}
    } else { // respawning: overhead view of the storm circle
     desired=new T.Vector3(st.cx,60,st.cz-60);look=new T.Vector3(st.cx,0,st.cz);
    }
    if(!initialized){cam.position.copy(desired);camTargets[i].copy(look);}
    else{cam.position.lerp(desired,1-Math.exp(-dt*14));camTargets[i].lerp(look,1-Math.exp(-dt*18));}
    // keep the camera inside the bowl wall
    const cd=Math.hypot(cam.position.x,cam.position.z);if(cd>ARENA_RADIUS-2){cam.position.x*=(ARENA_RADIUS-2)/cd;cam.position.z*=(ARENA_RADIUS-2)/cd;cam.position.y=Math.max(cam.position.y,7);}
    cam.position.y=Math.max(cam.position.y,1.2);
    cam.lookAt(camTargets[i]);
    const vh=humans.length>1?h/2:h;const bottom=humans.length>1?(1-i)*vh:0;
    cam.aspect=w/vh;
    const targetFov=subject&&subject.boost>0?78:62+Math.min(10,Math.max(0,(subject?.speed||0)-25)*.4);
    cam.fov+=(targetFov-cam.fov)*Math.min(1,dt*6);cam.updateProjectionMatrix();
    // shadow camera follows the first human for crisp shadows
    if(i===0){const fx=subject?subject.x:st.cx,fz=subject?subject.z:st.cz;sun.position.set(fx-60,90,fz+80);sun.target.position.set(fx,0,fz);}
    renderer.setViewport(0,bottom,w,vh);renderer.setScissor(0,bottom,w,vh);
    renderer.render(scene,cam);
   });
   initialized=true;
   canvas.dataset.drawCalls=String(renderer.info.render.calls);
  },
  dispose(){
   disposed=true;
   mixers.forEach(m=>m.stopAllAction());
   disposeTree(scene);envRT.dispose();renderer.dispose();renderer.forceContextLoss();
   delete canvas.dataset.renderer;delete canvas.dataset.mode;
  },
 };
}
