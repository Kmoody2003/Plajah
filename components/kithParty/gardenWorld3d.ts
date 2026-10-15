import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {crestGeometry} from './karts3d';
import {type CourseId, courseById, trackFrame} from './course3d';

/** Shared cached loader for Blender-sculpted monuments.glb */
let monumentsGlbPromise:Promise<T.Group>|null=null;
function loadMonumentsGlb():Promise<T.Group>{
 if(!monumentsGlbPromise){
  monumentsGlbPromise=new Promise((resolve,reject)=>{
   if(typeof window==='undefined'){reject(new Error('no-window'));return;}
   new GLTFLoader().load('/kith-party/models/monuments.glb',gltf=>resolve(gltf.scene),undefined,err=>reject(err));
  });
 }
 return monumentsGlbPromise;
}

function enhanceMonument(root:T.Object3D){
 root.traverse(o=>{
  if(o instanceof T.Mesh){
   o.castShadow=true;o.receiveShadow=true;
   const hasVcol=o.geometry.hasAttribute('color');
   const m=o.material as T.MeshStandardMaterial;
   const isCrystal=m?.name?.includes('Crystal')||o.name.includes('Crystal')||o.name.includes('Blade');
   const upgraded=new T.MeshPhysicalMaterial({
    color:hasVcol?'#ffffff':(m?.color||'#e8dac8'),
    vertexColors:hasVcol,
    roughness:isCrystal?.12:.62,
    metalness:isCrystal?.18:.06,
    clearcoat:isCrystal?1:.15,
    envMapIntensity:isCrystal?1.65:1.1,
    flatShading:isCrystal,
    emissive:isCrystal?new T.Color('#ffffff'):new T.Color('#000000'),
    emissiveIntensity:isCrystal?.78:0,
   });
   if(isCrystal&&hasVcol){
    upgraded.onBeforeCompile=shader=>{
     shader.fragmentShader=shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'
     );
    };
   }
   o.material=upgraded;
  }
 });
}

/** Creates a soft organic cherry-blossom petal texture so PointsMaterial renders real petals instead of squares. */
function makePetalTexture():T.CanvasTexture{
 const c=document.createElement('canvas');c.width=64;c.height=64;
 const ctx=c.getContext('2d')!;
 ctx.clearRect(0,0,64,64);
 ctx.save();
 ctx.translate(32,32);
 ctx.rotate(-0.35);
 const g=ctx.createRadialGradient(0,-4,2,0,0,26);
 g.addColorStop(0,'rgba(255,245,250,1)');
 g.addColorStop(0.55,'rgba(255,182,219,0.95)');
 g.addColorStop(0.88,'rgba(244,122,182,0.6)');
 g.addColorStop(1,'rgba(244,122,182,0)');
 ctx.fillStyle=g;
 ctx.beginPath();
 ctx.moveTo(0,22);
 ctx.bezierCurveTo(-20,12,-22,-16,-6,-22);
 ctx.bezierCurveTo(-1,-16,1,-16,6,-22);
 ctx.bezierCurveTo(22,-16,20,12,0,22);
 ctx.closePath();
 ctx.fill();
 ctx.restore();
 const t=new T.CanvasTexture(c);
 t.colorSpace=T.SRGBColorSpace;
 return t;
}

function makeRadialDiscTexture(inner:string,outer:string):T.CanvasTexture{
 const c=document.createElement('canvas');c.width=64;c.height=64;
 const x=c.getContext('2d')!;
 const g=x.createRadialGradient(32,32,2,32,32,30);
 g.addColorStop(0,inner);
 g.addColorStop(1,outer);
 x.fillStyle=g;x.fillRect(0,0,64,64);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}

/** Batched solid scenery + Blender hero monuments for all 5 Kith Circuit courses. */
export function makeGardenWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 courseId:CourseId='crestfall-gardens'
){
 const surface=document.createElement('canvas');surface.width=surface.height=128;
 const surfaceCtx=surface.getContext('2d')!;surfaceCtx.fillStyle='#b8b8b8';surfaceCtx.fillRect(0,0,128,128);
 for(let i=0;i<1800;i++){const value=110+(i*37)%115;surfaceCtx.fillStyle=`rgb(${value},${value},${value})`;surfaceCtx.fillRect((i*43)%128,(i*79+Math.floor(i/128)*13)%128,1+i%3,1+i%4);}
 const grain=new T.CanvasTexture(surface);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(4,4);
 const batches=new Map<T.Material,T.BufferGeometry[]>(),palette=new Map<string,T.MeshStandardMaterial>();
 const material=(color:string,glow=0)=>{const key=color+glow;if(!palette.has(key))palette.set(key,new T.MeshStandardMaterial({color,roughness:glow?.35:.68,metalness:glow?.22:.08,emissive:color,emissiveIntensity:glow,bumpMap:grain,bumpScale:.06}));return palette.get(key)!;};
 const crystal=(color:string,glow=0.85)=>{
  const key='crystal'+color+glow;
  if(!palette.has(key))palette.set(key,new T.MeshPhysicalMaterial({color,roughness:.08,metalness:.12,clearcoat:1,clearcoatRoughness:.06,emissive:color,emissiveIntensity:glow,envMapIntensity:1.65,flatShading:true}));
  return palette.get(key)!;
 };
 const matrix=new T.Matrix4(),quat=new T.Quaternion();
 function shape(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s:T.Vector3=new T.Vector3(1,1,1),r=new T.Euler()){
  g.applyMatrix4(matrix.compose(p,quat.setFromEuler(r),s));
  if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}
  const list=batches.get(m)||[];list.push(g);batches.set(m,list);
 }
 const vec=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
 const ell=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,glow=0)=>shape(new T.SphereGeometry(1,10,8),material(color,glow),vec(x,y,z),vec(sx,sy,sz));
 const stem=(a:T.Vector3,b:T.Vector3,r:number,color:string,glow=0)=>{
  const d=b.clone().sub(a);shape(new T.CylinderGeometry(r*.72,r,d.length(),7),material(color,glow),a.clone().add(b).multiplyScalar(.5),vec(1,1,1),new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(vec(0,1,0),d.normalize())));
 };

 // Dispatch to the specialized 3D world builder for each of the 4 new courses
 if(courseId==='abyssal-trench') return buildAbyssalWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);
 if(courseId==='dune-canyon') return buildDuneWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);
 if(courseId==='polar-vortex') return buildPolarWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);
 if(courseId==='amazon-canopy') return buildAmazonWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);

 // ============================================================================
 // COURSE 1: CRESTFALL GARDENS (Concept Art Kith Sanctuary)
 // ============================================================================
 function tree(x:number,y:number,z:number,size:number,seed:number,leanX=0,leanZ=0){
  const topX=x+(.22+leanX)*size, topY=y+2.6*size, topZ=z+leanZ*size;
  stem(vec(x,y,z),vec(topX,topY,topZ),.22*size,'#5e4968');
  for(let j=0;j<5;j++){
   const a=j*2.4+seed,cx=topX+Math.cos(a)*size*1.05,cz=topZ+Math.sin(a)*size*1.05,cy=y+(2.45+(j%2)*.45)*size;
   stem(vec(x+leanX*size*.4,y+1.25*size,z+leanZ*size*.4),vec(cx,cy,cz),.1*size,'#5e4968');
   ell(cx,cy,cz,1.15*size,.64*size,1.02*size,j%2?'#e27bb5':'#f7a4d2',.28);
   ell(cx-.22*size,cy+.28*size,cz,.72*size,.36*size,.74*size,'#ffc4e4',.34);
   for(let k=0;k<5;k++){const a2=k*2.4+j;ell(cx+Math.cos(a2)*size*.74,cy+.2*size+(k%2)*.24*size,cz+Math.sin(a2)*size*.66,.36*size,.26*size,.36*size,k%2?'#f48fbd':'#ffd2e6',.28);}
  }
 }

 const falls:T.Mesh[]=[];
 const waterCanvas=document.createElement('canvas');waterCanvas.width=64;waterCanvas.height=128;
 const ctx=waterCanvas.getContext('2d')!;ctx.fillStyle='#24c5e6';ctx.fillRect(0,0,64,128);
 for(let i=0;i<48;i++){ctx.fillStyle=i%3?'rgba(240,255,255,.78)':'rgba(110,235,255,.94)';ctx.fillRect((i*17)%64,(i*37)%128,1+i%3,12+i%22);}
 for(let i=0;i<28;i++){ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect((i*29)%64,(i*53)%128,2,3);}
 const waterMap=new T.CanvasTexture(waterCanvas);waterMap.wrapS=waterMap.wrapT=T.RepeatWrapping;waterMap.repeat.set(2,3);waterMap.colorSpace=T.SRGBColorSpace;
 const water=new T.MeshStandardMaterial({map:waterMap,color:'#c8fcff',emissive:'#28bfe6',emissiveIntensity:.95,roughness:.12,metalness:.12,envMapIntensity:1.3,side:T.DoubleSide,transparent:true,opacity:.94});

 function addWaterfall(x:number,topY:number,z:number,width:number,height:number,rotY=0){
  const fall=new T.Mesh(new T.PlaneGeometry(width,height,2,1),water);
  fall.position.set(x,topY-height/2,z);
  fall.rotation.y=rotY;
  scene.add(fall);falls.push(fall);
  ell(x,topY-height+.3,z,width*.65,.42,width*.55,'#dcfbff',.45);
 }

 function island(x:number,z:number,r:number,y:number,seed:number,waterfall=false){
  const rock=new T.CylinderGeometry(r,r*.38,r*1.65,24,6),vertices=rock.getAttribute('position');
  for(let i=0;i<vertices.count;i++){
   const px=vertices.getX(i),py=vertices.getY(i),pz=vertices.getZ(i),a=Math.atan2(pz,px);
   const warp=1+Math.sin(a*6+seed)*.08+Math.cos(a*9+py*.4)*.06;
   vertices.setXYZ(i,px*warp,py+Math.sin(a*7+seed)*.35,pz*warp);
  }
  rock.computeVertexNormals();shape(rock,material('#8e7a9a'),vec(x,y-r*.82,z));
  for(let j=0;j<10;j++){const a=j*Math.PI/5,h=r*(.48+(j%4)*.18);shape(new T.CylinderGeometry(r*.19,r*.11,h,6),material(j%2?'#a896b3':'#8c7a98'),vec(x+Math.cos(a)*r*.8,y-h/2,z+Math.sin(a)*r*.8));}
  shape(new T.CylinderGeometry(r*1.01,r,.95,18),material('#6a9662'),vec(x,y+.12,z));
  ell(x,y+.38,z,r*.92,.65,r*.9,'#88b06c');
  for(let j=0;j<8;j++){const a=j*2.399+seed,rr=r*(.35+(j%3)*.19),tx=x+Math.cos(a)*rr,tz=z+Math.sin(a)*rr;tree(tx,y+.5,tz,.62+r*.034,j+seed);}
  for(let j=0;j<36;j++){const a=j*2.399,rr=r*(.86+(j%3)*.035);ell(x+Math.cos(a)*rr,y+.22-(j%5)*.14,z+Math.sin(a)*rr,1.2,.55,1,j%3?'#6b9259':'#a8be6e');}
  if(waterfall){
   const h=r*1.9+12;
   const angleToCenter=Math.atan2(-x,-z);
   addWaterfall(x+Math.sin(angleToCenter)*r*.94,y,z+Math.cos(angleToCenter)*r*.94,r*.42,h,angleToCenter);
  }
 }

 island(0,0,22,-4,3,true);
 for(let i=0;i<14;i++){
  const a=i*Math.PI*2/14,r=96+(i%3)*15;
  island(Math.cos(a)*r,Math.sin(a)*r,13+i%4*3,2+(i%4)*7,i,i%2===0);
 }
 for(let i=0;i<11;i++){
  const a=i*Math.PI*2/11+.2,r=172+i%3*16;
  island(Math.cos(a)*r,Math.sin(a)*r,11+i%3*4,28+i%4*7,i,true);
 }

 const skyIslands=[
  {x:58,y:34,z:-18,r:9.5},
  {x:22,y:38,z:-78,r:8.5},
  {x:82,y:40,z:18,r:10.5},
  {x:-42,y:38,z:40,r:11},
  {x:15,y:46,z:48,r:8.5},
  {x:-58,y:34,z:-22,r:10},
 ];
 const mesaAnchors:T.Group[]=[];
 for(let i=0;i<skyIslands.length;i++){
  const isl=skyIslands[i];
  const anchor=new T.Group();
  anchor.position.set(isl.x,isl.y,isl.z);
  scene.add(anchor);
  mesaAnchors.push(anchor);
  const fallbackRock=new T.Group();fallbackRock.name='fallback_mesa';
  const topMat=material('#739e62');
  const rockMat=material('#8c7999');
  const m1=new T.Mesh(new T.CylinderGeometry(isl.r,isl.r*.72,isl.r*.65,9),rockMat);
  m1.position.y=-isl.r*.3;fallbackRock.add(m1);
  const m2=new T.Mesh(new T.CylinderGeometry(isl.r*.72,isl.r*.32,isl.r*.85,8),rockMat);
  m2.position.y=-isl.r*.9;fallbackRock.add(m2);
  const cap=new T.Mesh(new T.CylinderGeometry(isl.r*1.02,isl.r,.8,12),topMat);
  cap.position.y=.2;fallbackRock.add(cap);
  anchor.add(fallbackRock);

  tree(isl.x,isl.y+.5,isl.z,1.15,i*7);
  const fallH=isl.r*2.1;
  const faceAngle=Math.atan2(-isl.x,-isl.z);
  addWaterfall(isl.x+Math.sin(faceAngle)*isl.r*.82,isl.y,isl.z+Math.cos(faceAngle)*isl.r*.82,isl.r*.34,fallH,faceAngle);
  shape(crestGeometry(),crystal(i%2?'#ff8c00':'#ff388f'),vec(isl.x+isl.r*.42,isl.y+1.2,isl.z),vec(1.8,2.5,1.8),new T.Euler(0,i*.9,.18));
 }

 for(let i=0;i<26;i++){
  const a=i*Math.PI*2/26,r=242,h=36+(i*13)%48;
  shape(new T.ConeGeometry(22+i%4*4,h,6),material(i%2?'#b9a4cf':'#9d8cbe'),vec(Math.cos(a)*r,h/2-10,Math.sin(a)*r),vec(1,1,1),new T.Euler(0,i*.7,.08));
 }

 const triUpGeo=new T.ConeGeometry(.24,.36,3);triUpGeo.rotateY(Math.PI/2);
 const triDownGeo=new T.ConeGeometry(.24,.36,3);triDownGeo.rotateY(Math.PI/2);triDownGeo.rotateZ(Math.PI);
 const amberGlowMat=crystal('#ff9419',1.35);

 for(const side of [-1,1]){
  const upperCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67).add(vec(0,1.08,0))),true);
  shape(new T.TubeGeometry(upperCurve,320,.18,6,true),material('#efe2d0'),vec(0,0,0));
  const midCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67.5).add(vec(0,.62,0))),true);
  shape(new T.TubeGeometry(midCurve,320,.26,6,true),material('#3c2d4d'),vec(0,0,0));
  const lowerCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67).add(vec(0,.22,0))),true);
  shape(new T.TubeGeometry(lowerCurve,320,.24,6,true),material('#a995b5'),vec(0,0,0));

  for(let i=0;i<180;i++){
   const t=i/180,p=point(t,side*65.8),q=point(t+.001,side*65.8),yaw=Math.atan2(q.x-p.x,q.z-p.z);
   const tri=i%2===0?triUpGeo.clone():triDownGeo.clone();
   shape(tri,amberGlowMat,p.clone().add(vec(0,.62,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   if(i%3===0){
    const pilasterPos=point(t,side*67.5);
    shape(new T.BoxGeometry(.38,1.18,.42),material('#e5d6c3'),pilasterPos.clone().add(vec(0,.58,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   }
  }
 }

 for(let i=0;i<60;i++){
  const t=i/60,side=i%2?1:-1;
  const q=point(t+.001),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  const bushEdge=point(t,side*74);
  ell(bushEdge.x,bushEdge.y+.35,bushEdge.z,1.8,.85,1.6,'#6f995c');
  for(let k=0;k<4;k++){
   const a=k*1.6+i;
   ell(bushEdge.x+Math.cos(a)*.9,bushEdge.y+.65,bushEdge.z+Math.sin(a)*.9,.52,.42,.52,k%2?'#f47ab7':'#ffb8de',.35);
  }
  if(i%2===0){
   const treePos=point(t,side*92);
   const inwardX=-Math.cos(yaw)*side*.45;
   const inwardZ=Math.sin(yaw)*side*.45;
   tree(treePos.x,treePos.y-.2,treePos.z,1.35,i,inwardX,inwardZ);
  }
  const lampBase=point(t,side*69.5);
  stem(lampBase,lampBase.clone().add(vec(0,2.65,0)),.09,'#d8c7b4');
  shape(new T.CylinderGeometry(.26,.16,.22,8),material('#e8b948',.3),lampBase.clone().add(vec(0,2.65,0)));
  shape(crestGeometry(),crystal('#ffcf54',1.4),lampBase.clone().add(vec(0,2.82,0)),vec(.48,.52,.88),new T.Euler(0,yaw,0));

  if(i%3===0){
   const bannerPos=point(t,side*78);
   stem(bannerPos,bannerPos.clone().add(vec(0,6.2,0)),.11,'#efe2cf');
   shape(new T.BoxGeometry(1.75,.14,.14),material('#f0be42',.25),bannerPos.clone().add(vec(0,5.85,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   shape(new T.BoxGeometry(1.48,2.65,.08),material('#541675',.15),bannerPos.clone().add(vec(0,4.45,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   shape(new T.BoxGeometry(1.56,2.75,.05),material('#eab63e',.35),bannerPos.clone().add(vec(0,4.45,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   shape(crestGeometry(),crystal('#ffbe3b',1.1),bannerPos.clone().add(vec(0,4.3,0)),vec(.68,.65,.45),new T.Euler(0,yaw,0));
  }
 }

 const monolithProgress=[.04,.095,.16,.25,.35,.48,.60,.74,.88];
 const monolithAnchors:{group:T.Group;side:number}[]=[];
 for(const t of monolithProgress)for(const side of [-1,1]){
  const p=point(t,side*108),q=point(t+.001),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  const anchor=new T.Group();
  anchor.position.copy(p);
  anchor.rotation.y=yaw;
  scene.add(anchor);
  monolithAnchors.push({group:anchor,side});

  shape(crestGeometry(),crystal(side>0?'#ff8000':'#e62e8a',1.1),p,vec(4.8,side>0?7.2:5.8,3.8),new T.Euler(0,yaw,-side*.22));
  shape(crestGeometry(),material('#f7ead9'),p.clone().add(vec(0,-.2,0)),vec(5.4,2.1,4.6),new T.Euler(0,yaw,-side*.18));
  shape(crestGeometry(),crystal('#ffbf36',1.15),p.clone().add(vec(side*2.4,.8,.8)),vec(3.0,4.4,2.6),new T.Euler(0,yaw+side*.35,-side*.14));
 }

 const vistaStart=vec(42,6,-82), vistaEnd=vec(112,10,24);
 const vistaSpans=9;
 for(let i=0;i<=vistaSpans;i++){
  const u=i/vistaSpans;
  const px=vistaStart.x+(vistaEnd.x-vistaStart.x)*u;
  const py=vistaStart.y+(vistaEnd.y-vistaStart.y)*u;
  const pz=vistaStart.z+(vistaEnd.z-vistaStart.z)*u;
  const bridgeYaw=Math.atan2(vistaEnd.x-vistaStart.x,vistaEnd.z-vistaStart.z);
  shape(new T.BoxGeometry(3.2,26,3.6),material('#dfd0be'),vec(px,py-4,pz),vec(1,1,1),new T.Euler(0,bridgeYaw,0));
  if(i<vistaSpans){
   const mx=px+(vistaEnd.x-vistaStart.x)*(.5/vistaSpans);
   const my=py+(vistaEnd.y-vistaStart.y)*(.5/vistaSpans);
   const mz=pz+(vistaEnd.z-vistaStart.z)*(.5/vistaSpans);
   shape(new T.BoxGeometry(2.8,2.2,14.5),material('#efe2d2'),vec(mx,my+8.5,mz),vec(1,1,1),new T.Euler(0,bridgeYaw,0));
   shape(new T.BoxGeometry(3.1,1.8,14.5),material('#c7b5c9'),vec(mx,my+1.2,mz),vec(1,1,1),new T.Euler(0,bridgeYaw,0));
   shape(new T.TorusGeometry(4.8,.95,6,18,Math.PI),material('#e6d8c5'),vec(mx,my+3.2,mz),vec(1,1,.35),new T.Euler(0,bridgeYaw+Math.PI/2,0));
   if(i%2===1){
    addWaterfall(mx,my+7.8,mz,4.6,22,bridgeYaw+Math.PI/2);
   }
  }
 }

 for(let i=0;i<24;i++){
  const p=point(i/24),q=point(i/24+.001),yaw=Math.atan2(q.x-p.x,q.z-p.z);
  shape(new T.TorusGeometry(8.5,1.1,6,22,Math.PI),material('#cbb9cc'),p.clone().add(vec(0,-9.5,0)),vec(1,1,1),new T.Euler(0,yaw,0));
  if(i%2===0){
   shape(new T.TorusGeometry(14,1.8,6,24,Math.PI),material('#a692ad'),p.clone().add(vec(0,-21,0)),vec(1,1,1),new T.Euler(0,yaw,0));
  }
 }

 const guardianAnchors:T.Group[]=[];
 const guardianSpots=[
  {pos:vec(108,14,-14),lookAt:vec(18,4,-56),scale:1.15},
  {pos:vec(-22,20,98),lookAt:vec(25,18,45),scale:1.05},
 ];
 for(const spot of guardianSpots){
  const gGroup=new T.Group();
  gGroup.position.copy(spot.pos);
  gGroup.scale.setScalar(spot.scale);
  gGroup.lookAt(spot.lookAt.x,spot.pos.y,spot.lookAt.z);
  scene.add(gGroup);
  guardianAnchors.push(gGroup);

  const fallback=new T.Group();fallback.name='fallback_guardian';
  const headMesh=new T.Mesh(new T.SphereGeometry(8.5,16,14),material('#e8dac8'));
  headMesh.scale.set(1.15,1.05,.85);headMesh.position.set(0,10,0);fallback.add(headMesh);
  for(const s of [-1,1]){
   for(let j=0;j<4;j++){
    const blade=new T.Mesh(crestGeometry(),crystal(j%2?'#e6288b':'#ff7700',1.2));
    blade.position.set(s*(5.2+j*2.4),15.5-j*1.8,-1);
    blade.scale.set(4.2,4.8,3.2);blade.rotation.z=-s*(.25+j*.28);
    fallback.add(blade);
   }
  }
  const centerCrown=new T.Mesh(crestGeometry(),crystal('#ff9d00',1.35));
  centerCrown.position.set(0,18.5,-.5);centerCrown.scale.set(4.2,5.2,3.5);fallback.add(centerCrown);
  gGroup.add(fallback);
 }

 const sanctuaryAnchor=new T.Group();
 sanctuaryAnchor.position.set(52,9,-82);
 sanctuaryAnchor.scale.setScalar(1.15);
 sanctuaryAnchor.lookAt(20,5,-54);
 scene.add(sanctuaryAnchor);
 addWaterfall(45,18,-79,3.4,20,0.45);
 addWaterfall(59,18,-79,3.4,20,0.45);

 loadMonumentsGlb().then(glb=>{
  const guardianTemplate=glb.getObjectByName('GuardianMonument');
  if(guardianTemplate){
   for(const anchor of guardianAnchors){
    const fb=anchor.getObjectByName('fallback_guardian');
    if(fb) anchor.remove(fb);
    const clone=guardianTemplate.clone(true);
    clone.position.set(0,0,0);
    enhanceMonument(clone);
    anchor.add(clone);
   }
  }
  const sanctuaryTemplate=glb.getObjectByName('SanctuaryMask');
  if(sanctuaryTemplate){
   const clone=sanctuaryTemplate.clone(true);
   clone.position.set(0,0,0);
   enhanceMonument(clone);
   sanctuaryAnchor.add(clone);
  }
  const monolithTemplate=glb.getObjectByName('CrystalMonolith');
  if(monolithTemplate){
   for(const {group,side} of monolithAnchors){
    const clone=monolithTemplate.clone(true);
    clone.position.set(0,-0.4,0);
    clone.scale.set(side*.52,.55,.52);
    clone.rotation.z=-side*0.14;
    enhanceMonument(clone);
    group.add(clone);
   }
  }
  const mesaTemplate=glb.getObjectByName('FloatingMesa');
  if(mesaTemplate){
   mesaAnchors.forEach((anchor,idx)=>{
    const fb=anchor.getObjectByName('fallback_mesa');
    if(fb) anchor.remove(fb);
    const clone=mesaTemplate.clone(true);
    const rScale=skyIslands[idx].r/9.5;
    clone.position.set(0,0,0);
    clone.scale.setScalar(rScale);
    clone.rotation.y=idx*1.1;
    enhanceMonument(clone);
    anchor.add(clone);
   });
  }
 }).catch(()=>{});

 flushBatches(scene,batches);

 const mistTex=makeRadialDiscTexture('rgba(255,255,255,0.78)','rgba(255,255,255,0)');
 const mistCount=falls.length*4;
 const mistPos=new Float32Array(mistCount*3),mistBase=new Float32Array(mistCount),mistSeed=new Float32Array(mistCount);
 for(let i=0;i<mistCount;i++){
  const f=falls[(i/4)|0],gp=(f.geometry as T.PlaneGeometry).parameters;
  const bx=f.position.x+(Math.random()-.5)*gp.width,by=f.position.y-gp.height/2+Math.random()*2;
  mistPos[i*3]=bx;mistPos[i*3+1]=by;mistPos[i*3+2]=f.position.z+(Math.random()-.5)*2;
  mistBase[i]=by;mistSeed[i]=Math.random()*10;
 }
 const mistGeo=new T.BufferGeometry();
 mistGeo.setAttribute('position',new T.BufferAttribute(mistPos,3));
 const mistMat=new T.PointsMaterial({map:mistTex,color:'#eafcff',size:5.2,transparent:true,opacity:.55,depthWrite:false});
 const mist=new T.Points(mistGeo,mistMat);scene.add(mist);

 const petalCount=520;
 const petalPos=new Float32Array(petalCount*3);
 for(let i=0;i<petalCount;i++){
  petalPos[i*3]=Math.sin(i*19)*110;
  petalPos[i*3+1]=2.5+(i*7)%30;
  petalPos[i*3+2]=Math.cos(i*13)*95;
 }
 const petalGeo=new T.BufferGeometry();
 petalGeo.setAttribute('position',new T.BufferAttribute(petalPos,3));
 const petalMat=new T.PointsMaterial({map:makePetalTexture(),color:'#ffd0e8',size:.68,sizeAttenuation:true,transparent:true,opacity:.92,alphaTest:.05,depthWrite:false});
 const petals=new T.Points(petalGeo,petalMat);
 scene.add(petals);

 return {
  update(dt:number,time:number){
   waterMap.offset.y+=dt*.42;
   petals.rotation.y=Math.sin(time*.04)*.25;
   const attr=petalGeo.getAttribute('position') as T.BufferAttribute;
   const arr=attr.array as Float32Array;
   for(let i=0;i<petalCount;i++){
    arr[i*3+1]-=dt*(1.2+(i%4)*.5);
    arr[i*3]+=Math.sin(time*2+i)*dt*1.5;
    arr[i*3+2]+=Math.cos(time*2+i)*dt*1.5;
    if(arr[i*3+1]<1){arr[i*3+1]=32;arr[i*3]=Math.sin(i*19+time)*100;arr[i*3+2]=Math.cos(i*13+time)*90;}
   }
   attr.needsUpdate=true;
   const mstAttr=mistGeo.getAttribute('position') as T.BufferAttribute;
   const mstArr=mstAttr.array as Float32Array;
   for(let i=0;i<mistCount;i++){
    mstArr[i*3+1]+=dt*1.1;
    mstArr[i*3]+=Math.sin(time*1.8+mistSeed[i])*dt*.8;
    if(mstArr[i*3+1]>mistBase[i]+5){mstArr[i*3+1]=mistBase[i];}
   }
   mstAttr.needsUpdate=true;
   mistMat.opacity=.44+Math.sin(time*1.3)*.1;
  },
  stats:{islands:31,kartDesigns:10,waterfalls:falls.length,skyIslands:skyIslands.length}
 };
}

function flushBatches(scene:T.Scene,batches:Map<T.Material,T.BufferGeometry[]>){
 for(const [m,geometries] of batches){
  if(!geometries.length) continue;
  const combined=mergeGeometries(geometries,false);
  geometries.forEach(g=>g.dispose());
  if(!combined) continue;
  const mesh=new T.Mesh(combined,m);
  mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
 }
}

// ============================================================================
// COURSE 2: ABYSSAL GLASS TRENCH (Underwater Glass Tunnels & Bioluminescent Life)
// ============================================================================
function buildAbyssalWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 batches:Map<T.Material,T.BufferGeometry[]>,
 material:(c:string,g?:number)=>T.MeshStandardMaterial,
 crystal:(c:string,g?:number)=>T.MeshStandardMaterial,
 shape:(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s?:T.Vector3,r?:T.Euler)=>void,
 vec:(x:number,y:number,z:number)=>T.Vector3,
 ell:(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,g?:number)=>void,
 stem:(a:T.Vector3,b:T.Vector3,r:number,c:string,g?:number)=>void
){
 // 1. Continuous Transparent Underwater Glass Tunnel Tube encasing the entire track!
 const tunnelPts=Array.from({length:260},(_,i)=>point(i/260,0,4.2));
 const tunnelCurve=new T.CatmullRomCurve3(tunnelPts,true);
 const glassMat=new T.MeshPhysicalMaterial({
  color:'#5ce6ff',
  emissive:'#084b7a',
  emissiveIntensity:0.35,
  roughness:0.08,
  metalness:0.05,
  transmission:0.0,
  transparent:true,
  opacity:0.24,
  clearcoat:1.0,
  side:T.DoubleSide,
  depthWrite:false,
 });
 const glassTube=new T.Mesh(new T.TubeGeometry(tunnelCurve,280,14.2,20,true),glassMat);
 scene.add(glassTube);

 // Glowing structural glass-tunnel ribs & neon longitudinal rails
 for(let i=0;i<72;i++){
  const t=i/72;
  const f=trackFrame(t,0,'abyssal-trench');
  const yaw=Math.atan2(f.tangent.x,f.tangent.z);
  const pitch=-Math.asin(f.tangent.y);
  const ribCol=i%3===0?'#ff2e93':'#00f0ff';
  shape(new T.TorusGeometry(14.0,0.28,8,24,Math.PI*1.35),crystal(ribCol,1.3),f.position.clone().add(vec(0,1.2,0)),vec(1,1,1),new T.Euler(pitch,yaw,Math.PI*0.175+f.bankAngle));
 }

 // 2. Deep Abyssal Seamounts, Hydrothermal Vents & Bioluminescent Coral Reefs outside the glass tube
 const coralColors=['#00f5ff','#ff2a9d','#9d4edd','#38ff9c','#ffb703'];
 for(let i=0;i<52;i++){
  const a=i*2.399, r=68+(i%5)*26;
  const x=Math.cos(a)*r, z=Math.sin(a)*r, y=-28+(i%6)*6;
  // Seamount rock spire
  shape(new T.ConeGeometry(12+(i%4)*4,28+(i%3)*12,7),material('#0c213d'),vec(x,y,z));
  // Glowing giant coral branches & sea anemones on top of the seamount
  const cCol=coralColors[i%coralColors.length];
  ell(x,y+12,z,5.5,2.2,5.5,cCol,0.95);
  for(let b=0;b<4;b++){
   const ba=b*1.57+i;
   const bx=x+Math.cos(ba)*3.5, bz=z+Math.sin(ba)*3.5;
   stem(vec(x,y+11,z),vec(bx,y+18+(b%2)*3,bz),0.65,cCol,1.1);
   ell(bx,y+18+(b%2)*3,bz,1.6,1.1,1.6,coralColors[(i+b)%coralColors.length],1.3);
  }
 }

 // Roadside Coral Gardens & Glowing Sea Kelp right outside the glass tunnel walls
 for(let i=0;i<85;i++){
  const t=i/85, side=i%2?1:-1;
  const p=point(t,side*96,-4);
  const cCol=coralColors[i%coralColors.length];
  shape(crestGeometry(),crystal(cCol,1.25),p,vec(3.4,5.5+(i%3)*2.2,3.4),new T.Euler(0,i*0.9,side*0.18));
  ell(p.x,p.y+0.8,p.z,3.2,1.2,3.2,'#0d3359',0.2);
 }

 // 3. Animated Bioluminescent Sea Creatures Swimming Outside the Glass Tunnel!
 // (A) 2 Colossal Bioluminescent Leviathans (Blender AbyssalLeviathan + fallback)
 const leviathans:T.Group[]=[];
 for(let i=0;i<2;i++){
  const g=new T.Group();
  const fb=new T.Group();fb.name='fallback_leviathan';
  const bodyMesh=new T.Mesh(new T.SphereGeometry(4.5,14,10),crystal(i===0?'#00f0ff':'#ff2e93',1.1));
  bodyMesh.scale.set(1.0,0.8,3.6);fb.add(bodyMesh);
  for(const s of [-1,1]){
   const wing=new T.Mesh(crestGeometry(),crystal('#00ffff',1.4));
   wing.scale.set(8.5,1.2,3.5);wing.position.set(s*4.5,0,1.5);wing.rotation.z=s*0.4;
   fb.add(wing);
  }
  g.add(fb);
  scene.add(g);
  leviathans.push(g);
 }

 // (B) 12 Glowing Manta Rays (Blender BiolumManta + fallback) gliding around the glass tube
 const mantas:{group:T.Group;baseT:number;side:number;speed:number;height:number}[]=[];
 for(let i=0;i<12;i++){
  const g=new T.Group();
  const fb=new T.Group();fb.name='fallback_manta';
  const mCore=new T.Mesh(new T.ConeGeometry(2.8,5.5,5),crystal(i%2?'#00e5ff':'#d938ff',1.25));
  mCore.rotation.x=Math.PI/2;mCore.scale.set(2.2,1,0.35);fb.add(mCore);
  g.add(fb);
  scene.add(g);
  mantas.push({group:g,baseT:i/12,side:i%2?1:-1,speed:0.032+(i%3)*0.008,height:10+(i%4)*4});
 }

 // (C) 22 Pulsing Bioluminescent Jellyfish outside the tunnel
 const jellies:{group:T.Group;x:number;baseY:number;z:number;phase:number}[]=[];
 for(let i=0;i<22;i++){
  const t=i/22, side=i%2?1:-1;
  const p=point(t,side*(88+(i%3)*18),6+(i%4)*5);
  const jg=new T.Group();
  jg.position.copy(p);
  const jCol=i%3===0?'#ff2e93':i%3===1?'#00f5ff':'#b54cff';
  const bell=new T.Mesh(new T.SphereGeometry(2.6,12,8,0,Math.PI*2,0,Math.PI*0.62),crystal(jCol,1.4));
  jg.add(bell);
  for(let k=0;k<4;k++){
   const tent=new T.Mesh(new T.CylinderGeometry(0.08,0.03,4.8,5),crystal(jCol,1.2));
   tent.position.set(Math.cos(k*1.57)*1.1,-2.4,Math.sin(k*1.57)*1.1);
   jg.add(tent);
  }
  scene.add(jg);
  jellies.push({group:jg,x:p.x,baseY:p.y,z:p.z,phase:i*1.3});
 }

 loadMonumentsGlb().then(glb=>{
  const levTemplate=glb.getObjectByName('AbyssalLeviathan');
  if(levTemplate){
   leviathans.forEach((g,idx)=>{
    const fb=g.getObjectByName('fallback_leviathan');
    if(fb) g.remove(fb);
    const clone=levTemplate.clone(true);
    clone.scale.setScalar(idx===0?1.35:1.15);
    enhanceMonument(clone);
    g.add(clone);
   });
  }
  const mantaTemplate=glb.getObjectByName('BiolumManta');
  if(mantaTemplate){
   mantas.forEach(m=>{
    const fb=m.group.getObjectByName('fallback_manta');
    if(fb) m.group.remove(fb);
    const clone=mantaTemplate.clone(true);
    clone.scale.setScalar(0.95);
    enhanceMonument(clone);
    m.group.add(clone);
   });
  }
 }).catch(()=>{});

 flushBatches(scene,batches);

 // 600 Rising Underwater Bubbles & Bioluminescent Plankton
 const bubbleCount=600;
 const bubblePos=new Float32Array(bubbleCount*3);
 for(let i=0;i<bubbleCount;i++){
  bubblePos[i*3]=(Math.random()-.5)*210;
  bubblePos[i*3+1]=-25+Math.random()*65;
  bubblePos[i*3+2]=(Math.random()-.5)*210;
 }
 const bubbleGeo=new T.BufferGeometry();
 bubbleGeo.setAttribute('position',new T.BufferAttribute(bubblePos,3));
 const bubbleMat=new T.PointsMaterial({
  map:makeRadialDiscTexture('rgba(180,255,255,0.95)','rgba(0,220,255,0)'),
  color:'#70f8ff',size:0.95,transparent:true,opacity:0.85,blending:T.AdditiveBlending,depthWrite:false
 });
 const bubbles=new T.Points(bubbleGeo,bubbleMat);
 scene.add(bubbles);

 return {
  update(dt:number,time:number){
   // Animate Colossal Leviathans swimming outside the glass tube
   leviathans.forEach((lev,idx)=>{
    const a=time*0.22+idx*Math.PI;
    const nextA=a+0.05;
    const r=92+Math.sin(time*0.4+idx)*18;
    const x=Math.cos(a)*r, z=Math.sin(a)*r, y=6+Math.sin(time*0.65+idx*2)*16;
    const nx=Math.cos(nextA)*r, nz=Math.sin(nextA)*r, ny=6+Math.sin((time+0.2)*0.65+idx*2)*16;
    lev.position.set(x,y,z);
    lev.lookAt(nx,ny,nz);
    lev.rotation.z=Math.sin(time*1.8+idx)*0.22;
   });
   // Animate Manta Rays gliding along outside the glass tunnel
   mantas.forEach((m,idx)=>{
    const t=((m.baseT+time*m.speed)%1+1)%1;
    const p=point(t,m.side*(85+Math.sin(time+idx)*16),m.height+Math.sin(time*1.6+idx)*3.5);
    const q=point((t+0.008)%1,m.side*(85+Math.sin(time+idx)*16),m.height+Math.sin(time*1.6+idx)*3.5);
    m.group.position.copy(p);
    m.group.lookAt(q);
    m.group.rotation.z=Math.sin(time*3.2+idx)*0.28;
   });
   // Animate Pulsing Jellyfish
   jellies.forEach(j=>{
    const pulse=Math.sin(time*2.6+j.phase);
    j.group.position.y=j.baseY+pulse*2.8;
    const s=1+pulse*0.14;
    j.group.scale.set(s,1/s,s);
   });
   // Animate Rising Bubbles
   const attr=bubbleGeo.getAttribute('position') as T.BufferAttribute;
   const arr=attr.array as Float32Array;
   for(let i=0;i<bubbleCount;i++){
    arr[i*3+1]+=dt*(2.6+(i%4)*0.8);
    arr[i*3]+=Math.sin(time*2+i)*dt*0.9;
    if(arr[i*3+1]>42) arr[i*3+1]=-26;
   }
   attr.needsUpdate=true;
  },
  stats:{islands:52,kartDesigns:10,waterfalls:12,skyIslands:12}
 };
}

// ============================================================================
// COURSE 3: DUNE WORM CANYON (Sandstone Mountains, Sand Dunes & Giant Sandworms)
// ============================================================================
function buildDuneWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 batches:Map<T.Material,T.BufferGeometry[]>,
 material:(c:string,g?:number)=>T.MeshStandardMaterial,
 crystal:(c:string,g?:number)=>T.MeshStandardMaterial,
 shape:(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s?:T.Vector3,r?:T.Euler)=>void,
 vec:(x:number,y:number,z:number)=>T.Vector3,
 ell:(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,g?:number)=>void,
 stem:(a:T.Vector3,b:T.Vector3,r:number,c:string,g?:number)=>void
){
 // 1. Sweeping Golden Sand Dunes & Red-Rock Sandstone Canyon Mountains
 for(let i=0;i<44;i++){
  const a=i*Math.PI*2/44, r=105+(i%4)*24;
  const x=Math.cos(a)*r, z=Math.sin(a)*r;
  // Sweeping sand dune mound
  ell(x,-4+(i%3)*3,z,28+(i%3)*8,8+(i%4)*3.5,24+(i%2)*8,i%2?'#e09145':'#cf7932');
  // Jagged sandstone mountain mesa behind the dunes
  if(i%2===0){
   const mr=175+(i%3)*22, mx=Math.cos(a)*mr, mz=Math.sin(a)*mr, mh=42+(i%4)*16;
   shape(new T.CylinderGeometry(10+(i%3)*4,24+(i%4)*5,mh,7),material(i%4===0?'#b5482a':'#9c3b24'),vec(mx,mh/2-12,mz));
  }
 }

 // Roadside sandstone guardrails, desert obelisks & giant rib-arch bones spanning the track
 for(const side of [-1,1]){
  const railCurve=new T.CatmullRomCurve3(Array.from({length:200},(_,i)=>point(i/200,side*67,0.45)),true);
  shape(new T.TubeGeometry(railCurve,240,0.34,6,true),material('#d99b5e'),vec(0,0,0));
 }
 for(let i=0;i<36;i++){
  const t=i/36, side=i%2?1:-1;
  const p=point(t,side*82), q=point(t+0.002), yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  shape(crestGeometry(),material('#c97236'),p,vec(3.5,7.5+(i%3)*3,3.5),new T.Euler(0,yaw,-side*0.15));
  shape(crestGeometry(),crystal('#ff9500',1.2),p.clone().add(vec(0,4.5,0)),vec(1.6,3.2,1.6),new T.Euler(0,yaw,0));
  if(i%6===0){
   // Natural sandstone canyon arch spanning over the road
   const center=point(t,0);
   shape(new T.TorusGeometry(14.5,1.8,7,20,Math.PI),material('#b85d32'),center.clone().add(vec(0,-1,0)),vec(1,1.15,0.6),new T.Euler(0,yaw,0));
  }
 }

 // 2. Animated Colossal Sandworms Racing & Breaching in the Background!
 // 3 Giant Sandworms, each with a Blender-sculpted toothed maw + 9 articulated body segments!
 const worms:{
  segments:T.Group[];
  centerX:number;
  centerZ:number;
  radiusX:number;
  radiusZ:number;
  speed:number;
  phase:number;
 }[]=[
  {segments:[],centerX:15,centerZ:-5,radiusX:42,radiusZ:34,speed:0.55,phase:0},
  {segments:[],centerX:115,centerZ:18,radiusX:55,radiusZ:68,speed:0.46,phase:2.1},
  {segments:[],centerX:-112,centerZ:-12,radiusX:52,radiusZ:64,speed:0.50,phase:4.2},
 ];

 for(const w of worms){
  for(let s=0;s<9;s++){
   const segGroup=new T.Group();
   const r=Math.max(2.2,6.8-s*0.52);
   const fb=new T.Group();fb.name='fallback_worm';
   const torus=new T.Mesh(new T.TorusGeometry(r,1.6,10,18),material(s%2?'#b85d28':'#d9823b'));
   fb.add(torus);
   if(s===0){
    // Ring of glowing crystalline teeth on the head segment
    for(let k=0;k<10;k++){
     const ka=k*Math.PI*2/10;
     const tooth=new T.Mesh(crestGeometry(),crystal('#ffd266',1.1));
     tooth.position.set(Math.cos(ka)*r*0.82,Math.sin(ka)*r*0.82,1.2);
     tooth.scale.set(0.9,1.8,0.9);
     fb.add(tooth);
    }
   }
   segGroup.add(fb);
   scene.add(segGroup);
   w.segments.push(segGroup);
  }
 }

 loadMonumentsGlb().then(glb=>{
  const wormTemplate=glb.getObjectByName('ColossalSandworm');
  if(wormTemplate){
   for(const w of worms){
    const head=w.segments[0];
    const fb=head.getObjectByName('fallback_worm');
    if(fb) head.remove(fb);
    const clone=wormTemplate.clone(true);
    clone.scale.setScalar(1.1);
    enhanceMonument(clone);
    head.add(clone);
   }
  }
 }).catch(()=>{});

 flushBatches(scene,batches);

 // 550 Swirling Sandstorm Dust Particles
 const sandCount=550;
 const sandPos=new Float32Array(sandCount*3);
 for(let i=0;i<sandCount;i++){
  sandPos[i*3]=(Math.random()-.5)*220;
  sandPos[i*3+1]=1+Math.random()*38;
  sandPos[i*3+2]=(Math.random()-.5)*220;
 }
 const sandGeo=new T.BufferGeometry();
 sandGeo.setAttribute('position',new T.BufferAttribute(sandPos,3));
 const sandMat=new T.PointsMaterial({
  map:makeRadialDiscTexture('rgba(255,210,145,0.85)','rgba(255,160,80,0)'),
  color:'#ffbe78',size:1.8,transparent:true,opacity:0.62,depthWrite:false
 });
 const sand=new T.Points(sandGeo,sandMat);
 scene.add(sand);

 return {
  update(dt:number,time:number){
   // Animate the 3 Colossal Sandworms breaching & arcing through the desert dunes!
   worms.forEach(w=>{
    w.segments.forEach((seg,sIdx)=>{
     const u=time*w.speed+w.phase-sIdx*0.16;
     const nextU=u+0.05;
     const x=w.centerX+Math.cos(u)*w.radiusX;
     const z=w.centerZ+Math.sin(u*1.3)*w.radiusZ;
     const y=6+Math.sin(u*2.0)*24;
     const nx=w.centerX+Math.cos(nextU)*w.radiusX;
     const nz=w.centerZ+Math.sin(nextU*1.3)*w.radiusZ;
     const ny=6+Math.sin(nextU*2.0)*24;
     seg.position.set(x,y,z);
     seg.lookAt(nx,ny,nz);
     seg.rotation.z=time*1.5+sIdx*0.3;
    });
   });
   const attr=sandGeo.getAttribute('position') as T.BufferAttribute;
   const arr=attr.array as Float32Array;
   for(let i=0;i<sandCount;i++){
    arr[i*3]+=dt*18;
    arr[i*3+1]+=Math.sin(time*3+i)*dt*1.2;
    if(arr[i*3]>110) arr[i*3]=-110;
   }
   attr.needsUpdate=true;
  },
  stats:{islands:44,kartDesigns:10,waterfalls:3,skyIslands:6}
 };
}

// ============================================================================
// COURSE 4: POLAR VORTEX CITADEL (North Pole Cyclone, Glaciers & Aurora Borealis)
// ============================================================================
function buildPolarWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 batches:Map<T.Material,T.BufferGeometry[]>,
 material:(c:string,g?:number)=>T.MeshStandardMaterial,
 crystal:(c:string,g?:number)=>T.MeshStandardMaterial,
 shape:(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s?:T.Vector3,r?:T.Euler)=>void,
 vec:(x:number,y:number,z:number)=>T.Vector3,
 ell:(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,g?:number)=>void,
 stem:(a:T.Vector3,b:T.Vector3,r:number,c:string,g?:number)=>void
){
 // 1. Swirling North Pole Polar Vortex Funnel Cloud & Aurora Ribbons in the center/sky!
 const vortexRings:T.Mesh[]=[];
 for(let i=0;i<14;i++){
  const r=12+i*7.5, y=6+i*6.5;
  const ringMat=crystal(i%3===0?'#3df5ff':i%3===1?'#70ffba':'#b866ff',1.25);
  const ring=new T.Mesh(new T.TorusGeometry(r,0.85+i*0.08,8,32,Math.PI*1.65),ringMat);
  ring.position.set(0,y,0);
  ring.rotation.x=Math.PI/2+Math.sin(i)*0.12;
  ring.rotation.z=i*0.6;
  scene.add(ring);
  vortexRings.push(ring);
 }

 // 2. Crystalline Ice Citadel Spires (Blender PolarIceCitadel) & Glacier Mountains
 const citadelAnchors:T.Group[]=[];
 const citadelPositions=[
  vec(0,2,0),
  vec(96,12,-24),
  vec(-92,10,28),
  vec(28,18,98),
 ];
 for(const pos of citadelPositions){
  const g=new T.Group();
  g.position.copy(pos);
  scene.add(g);
  citadelAnchors.push(g);
  const fb=new T.Group();fb.name='fallback_citadel';
  const spire=new T.Mesh(crestGeometry(),crystal('#3df5ff',1.3));
  spire.scale.set(6.5,18,6.5);fb.add(spire);
  g.add(fb);
 }

 loadMonumentsGlb().then(glb=>{
  const iceTemplate=glb.getObjectByName('PolarIceCitadel');
  if(iceTemplate){
   citadelAnchors.forEach((g,idx)=>{
    const fb=g.getObjectByName('fallback_citadel');
    if(fb) g.remove(fb);
    const clone=iceTemplate.clone(true);
    clone.scale.setScalar(idx===0?1.35:1.05);
    enhanceMonument(clone);
    g.add(clone);
   });
  }
 }).catch(()=>{});

 // Surrounding Arctic Glaciers, Snow Pines & Crystalline Ice Cavern Arches over the track
 for(let i=0;i<36;i++){
  const a=i*Math.PI*2/36, r=112+(i%3)*26;
  const x=Math.cos(a)*r, z=Math.sin(a)*r, h=28+(i%4)*14;
  shape(new T.ConeGeometry(14+(i%3)*4,h,6),material(i%2?'#bce6ff':'#7ab8e6'),vec(x,h/2-10,z));
  shape(crestGeometry(),crystal('#42f5ff',1.1),vec(x,h-8,z),vec(4.2,7.5,4.2),new T.Euler(0,i*0.8,0.15));
 }

 for(const side of [-1,1]){
  const iceRail=new T.CatmullRomCurve3(Array.from({length:200},(_,i)=>point(i/200,side*67,0.45)),true);
  shape(new T.TubeGeometry(iceRail,240,0.32,6,true),crystal('#70f8ff',0.95),vec(0,0,0));
 }
 for(let i=0;i<48;i++){
  const t=i/48, side=i%2?1:-1;
  const p=point(t,side*78), q=point(t+0.002), yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  shape(crestGeometry(),crystal(i%2?'#00e5ff':'#e0ffff',1.2),p,vec(2.8,6.2+(i%3)*2.5,2.8),new T.Euler(0,yaw,-side*0.24));
  if(i%4===0){
   // Ice Cavern Crystal Rib Arch spanning over the road
   const center=point(t,0);
   shape(new T.TorusGeometry(13.5,0.95,6,20,Math.PI),crystal('#42f5ff',1.15),center,vec(1,1.1,1),new T.Euler(0,yaw,0));
  }
 }

 flushBatches(scene,batches);

 // 650 Swirling Arctic Vortex Blizzard Snowflakes
 const snowCount=650;
 const snowPos=new Float32Array(snowCount*3);
 for(let i=0;i<snowCount;i++){
  const a=Math.random()*Math.PI*2, r=15+Math.random()*115;
  snowPos[i*3]=Math.cos(a)*r;
  snowPos[i*3+1]=1+Math.random()*46;
  snowPos[i*3+2]=Math.sin(a)*r;
 }
 const snowGeo=new T.BufferGeometry();
 snowGeo.setAttribute('position',new T.BufferAttribute(snowPos,3));
 const snowMat=new T.PointsMaterial({
  map:makeRadialDiscTexture('rgba(255,255,255,1)','rgba(160,245,255,0)'),
  color:'#ffffff',size:1.05,transparent:true,opacity:0.9,depthWrite:false
 });
 const snow=new T.Points(snowGeo,snowMat);
 scene.add(snow);

 return {
  update(dt:number,time:number){
   // Spin the towering Polar Vortex funnel cloud rings!
   vortexRings.forEach((ring,idx)=>{
    ring.rotation.z=time*(1.2+idx*0.08)+idx;
    ring.position.x=Math.sin(time*1.5+idx*0.4)*3.5;
    ring.position.z=Math.cos(time*1.5+idx*0.4)*3.5;
   });
   // Swirl blizzard snow around the Polar Vortex
   snow.rotation.y=time*0.45;
   const attr=snowGeo.getAttribute('position') as T.BufferAttribute;
   const arr=attr.array as Float32Array;
   for(let i=0;i<snowCount;i++){
    arr[i*3+1]-=dt*(4.5+(i%4)*1.5);
    if(arr[i*3+1]<0) arr[i*3+1]=46;
   }
   attr.needsUpdate=true;
  },
  stats:{islands:36,kartDesigns:10,waterfalls:14,skyIslands:4}
 };
}

// ============================================================================
// COURSE 5: AMAZON CANOPY LOOP (Rainforest Mountainside, Bridges, Tunnels & 360° Loops)
// ============================================================================
function buildAmazonWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 batches:Map<T.Material,T.BufferGeometry[]>,
 material:(c:string,g?:number)=>T.MeshStandardMaterial,
 crystal:(c:string,g?:number)=>T.MeshStandardMaterial,
 shape:(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s?:T.Vector3,r?:T.Euler)=>void,
 vec:(x:number,y:number,z:number)=>T.Vector3,
 ell:(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,g?:number)=>void,
 stem:(a:T.Vector3,b:T.Vector3,r:number,c:string,g?:number)=>void
){
 const def=courseById('amazon-canopy');

 // Giant Amazon Kapok / Banyan Jungle Trees with hanging glowing vines
 function jungleTree(x:number,y:number,z:number,scale:number,seed:number){
  stem(vec(x,y,z),vec(x,y+8.5*scale,z),0.85*scale,'#4d331f');
  ell(x,y+9.2*scale,z,5.2*scale,2.4*scale,5.2*scale,'#246b35');
  ell(x+1.5*scale,y+10.5*scale,z-1.2*scale,3.8*scale,1.8*scale,3.8*scale,'#3ca349',0.15);
  for(let v=0;v<3;v++){
   const va=v*2.1+seed;
   const vx=x+Math.cos(va)*3.2*scale, vz=z+Math.sin(va)*3.2*scale;
   stem(vec(vx,y+8.8*scale,vz),vec(vx,y+3.2*scale,vz),0.12*scale,'#80e629',0.65);
  }
 }

 // 1. Lush Rainforest Mountainside Peaks & Kapok Canopy
 for(let i=0;i<38;i++){
  const a=i*Math.PI*2/38, r=104+(i%4)*22;
  const x=Math.cos(a)*r, z=Math.sin(a)*r, y=-6+(i%5)*6;
  shape(new T.ConeGeometry(16+(i%3)*5,34+(i%4)*12,7),material(i%2?'#295939':'#1e472c'),vec(x,y+8,z));
  jungleTree(x,y+18,z,1.3+(i%3)*0.35,i);
 }

 // 2. Wooden Rope Suspension Bridge Rails & Posts along the mountainside track
 for(const side of [-1,1]){
  const ropePts=Array.from({length:260},(_,i)=>point(i/260,side*67,0.85));
  const ropeCurve=new T.CatmullRomCurve3(ropePts,true);
  shape(new T.TubeGeometry(ropeCurve,280,0.22,6,true),material('#8c5a2b'),vec(0,0,0));
 }
 for(let i=0;i<72;i++){
  const t=i/72;
  const f=trackFrame(t,0,'amazon-canopy');
  if(!f.inLoop&&i%2===0){
   const yaw=Math.atan2(f.tangent.x,f.tangent.z);
   for(const side of [-1,1]){
    const postPos=point(t,side*68);
    stem(postPos,postPos.clone().addScaledVector(f.normal,2.8),0.26,'#5c3a1e');
    // Glowing jungle lantern on bridge post
    ell(postPos.x+f.normal.x*3.0,postPos.y+f.normal.y*3.0,postPos.z+f.normal.z*3.0,0.45,0.55,0.45,'#a8ff2e',1.35);
   }
   if(i%4===0){
    const treePos=point(t,(i%8===0?1:-1)*96);
    jungleTree(treePos.x,treePos.y-2,treePos.z,1.25,i);
   }
   void yaw;
  }
 }

 // 3. Overgrown Stone Temple Tunnels (Blender AmazonTempleGate) & Glowing 360° Loop-the-Loop Portals!
 const templeAnchors:T.Group[]=[];
 const tunnelTs=[0.06, 0.34, 0.44, 0.64, 0.92];
 for(const t of tunnelTs){
  const f=trackFrame(t,0,'amazon-canopy');
  const g=new T.Group();
  g.position.copy(f.position);
  g.lookAt(f.position.clone().add(f.tangent));
  scene.add(g);
  templeAnchors.push(g);
  const fb=new T.Group();fb.name='fallback_temple';
  const arch=new T.Mesh(new T.TorusGeometry(13.5,1.8,6,18,Math.PI),material('#5e704c'));
  fb.add(arch);
  g.add(fb);
 }

 // Giant Glowing Power Rings framing each of the 3 vertical 360-degree Loop-the-Loops!
 const loopRings:T.Mesh[]=[];
 for(const loop of def.loops){
  // Place a Temple Gate right at the Power Boost entrance to each vertical loop!
  const entryF=trackFrame(loop.boostPadT,0,'amazon-canopy');
  const gate=new T.Group();
  gate.position.copy(entryF.position);
  gate.lookAt(entryF.position.clone().add(entryF.tangent));
  scene.add(gate);
  templeAnchors.push(gate);

  // Add glowing neon-lime & gold energy hoops along the 360° loop trajectory
  for(let k=0;k<=8;k++){
   const lt=loop.centerT-loop.halfWidth+(k/8)*(loop.halfWidth*2);
   const lf=trackFrame(lt,0,'amazon-canopy');
   const hoop=new T.Mesh(
    new T.TorusGeometry(13.2,0.38,8,24),
    crystal(k%2===0?'#a8ff2e':'#ffae00',1.45)
   );
   hoop.position.copy(lf.position);
   const m=new T.Matrix4().makeBasis(lf.right,lf.normal,lf.tangent);
   hoop.quaternion.setFromRotationMatrix(m);
   scene.add(hoop);
   loopRings.push(hoop);
  }
 }

 loadMonumentsGlb().then(glb=>{
  const amzTemplate=glb.getObjectByName('AmazonTempleGate');
  if(amzTemplate){
   templeAnchors.forEach(g=>{
    const fb=g.getObjectByName('fallback_temple');
    if(fb) g.remove(fb);
    const clone=amzTemplate.clone(true);
    clone.scale.setScalar(1.18);
    enhanceMonument(clone);
    g.add(clone);
   });
  }
 }).catch(()=>{});

 flushBatches(scene,batches);

 // 500 Glowing Jungle Fireflies & Canopy Spores
 const flyCount=500;
 const flyPos=new Float32Array(flyCount*3);
 for(let i=0;i<flyCount;i++){
  flyPos[i*3]=(Math.random()-.5)*210;
  flyPos[i*3+1]=2+Math.random()*54;
  flyPos[i*3+2]=(Math.random()-.5)*210;
 }
 const flyGeo=new T.BufferGeometry();
 flyGeo.setAttribute('position',new T.BufferAttribute(flyPos,3));
 const flyMat=new T.PointsMaterial({
  map:makeRadialDiscTexture('rgba(210,255,100,1)','rgba(120,255,0,0)'),
  color:'#c8ff4d',size:1.15,transparent:true,opacity:0.88,blending:T.AdditiveBlending,depthWrite:false
 });
 const fireflies=new T.Points(flyGeo,flyMat);
 scene.add(fireflies);

 return {
  update(dt:number,time:number){
   loopRings.forEach((hoop,idx)=>{
    const s=1+Math.sin(time*6+idx)*0.05;
    hoop.scale.set(s,s,1);
   });
   const attr=flyGeo.getAttribute('position') as T.BufferAttribute;
   const arr=attr.array as Float32Array;
   for(let i=0;i<flyCount;i++){
    arr[i*3]+=Math.sin(time*2.2+i)*dt*1.8;
    arr[i*3+1]+=Math.cos(time*1.9+i)*dt*1.4;
    arr[i*3+2]+=Math.sin(time*1.7+i*2)*dt*1.8;
   }
   attr.needsUpdate=true;
  },
  stats:{islands:38,kartDesigns:10,waterfalls:8,skyIslands:6}
 };
}
