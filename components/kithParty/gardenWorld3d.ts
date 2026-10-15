import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {crestGeometry} from './karts3d';
import {type CourseId, courseById, trackFrame, ensureOffTrackXZ, isSupportPillarSafe} from './course3d';

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
    roughness:isCrystal?.12:.54,
    metalness:isCrystal?.18:.08,
    clearcoat:isCrystal?1:.22,
    envMapIntensity:isCrystal?1.75:1.25,
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

/**
 * Generates a high-detail Mowed Botanical Lawn / Biome Strata texture with subtle micro-grain
 * and alternating ground-keeper stripes (inspired by high-end Three.js sim-racing environments,
 * styled for Kith Party's storybook palette).
 */
function makeTerrainStripeTexture(colA:string,colB:string):T.CanvasTexture{
 const c=document.createElement('canvas');c.width=256;c.height=256;
 const x=c.getContext('2d')!;
 x.fillStyle=colA;x.fillRect(0,0,256,256);
 x.fillStyle=colB;
 for(let i=0;i<8;i++){
  if(i%2===0) x.fillRect(i*32,0,32,256);
 }
 for(let i=0;i<3200;i++){
  x.fillStyle=i%2?'rgba(255,255,255,0.045)':'rgba(0,0,0,0.055)';
  x.fillRect((i*53)%256,(i*97)%256,2,2);
 }
 const t=new T.CanvasTexture(c);
 t.wrapS=t.wrapT=T.RepeatWrapping;
 t.repeat.set(22,22);
 t.colorSpace=T.SRGBColorSpace;
 return t;
}

/**
 * Builds a continuous sculpted rolling valley terrain bowl beneath & around the circuit.
 * The terrain is automatically depressed below the track corridor so it NEVER pokes through the road,
 * while rising into rolling hills around the perimeter and infield!
 */
function buildSculptedValleyTerrain(scene:T.Scene,courseId:CourseId){
 const def=courseById(courseId);
 const geo=new T.PlaneGeometry(680,680,88,88);
 geo.rotateX(-Math.PI/2);
 const pos=geo.getAttribute('position') as T.BufferAttribute;

 // Pre-sample track points for fast elevation depression under the track
 const trackSamples:T.Vector3[]=[];
 for(let i=0;i<120;i++) trackSamples.push(trackFrame(i/120,0,courseId).position);

 const baseFloor=courseId==='abyssal-trench'?-34:courseId==='dune-canyon'?-8:-10;
 for(let i=0;i<pos.count;i++){
  const vx=pos.getX(i), vz=pos.getZ(i);
  let minD=Infinity, nearestY=0;
  for(let s=0;s<trackSamples.length;s++){
   const sp=trackSamples[s];
   const d=Math.hypot(vx-sp.x,vz-sp.z);
   if(d<minD){minD=d;nearestY=sp.y;}
  }
  const r=Math.hypot(vx,vz);
  const hillWave=
   Math.sin(vx*0.024)*Math.cos(vz*0.024)*9.5+
   Math.sin(vx*0.055+1.3)*Math.sin(vz*0.048)*4.2+
   Math.max(0,(r-175)*0.18);
  // Smoothly depress terrain under the road corridor (within 24m of centerline)
  const corridorBlend=Math.min(1,Math.max(0,(minD-18)/28));
  const safeRoadUnder=Math.min(baseFloor,nearestY-5.5);
  const naturalY=baseFloor+hillWave;
  const finalY=safeRoadUnder*(1-corridorBlend)+naturalY*corridorBlend;
  pos.setY(i,finalY);
 }
 geo.computeVertexNormals();
 const tex=makeTerrainStripeTexture(def.terrainColorA,def.terrainColorB);
 const mat=new T.MeshStandardMaterial({
  map:tex,
  roughness:courseId==='polar-vortex'?0.32:0.78,
  metalness:courseId==='polar-vortex'?0.15:0.04,
  envMapIntensity:0.85,
 });
 const mesh=new T.Mesh(geo,mat);
 mesh.receiveShadow=true;
 scene.add(mesh);
}

/**
 * Adds 160 GPU-instanced trees / biome spires across the rolling hills outside the track corridor
 * (costs only 2 draw calls total, just like high-end Three.js sim-racing tracks!).
 */
function buildInstancedHillForest(scene:T.Scene,courseId:CourseId){
 const count=160;
 const trunkGeo=new T.CylinderGeometry(0.28,0.48,3.6,6);
 const crownGeo=courseId==='polar-vortex'||courseId==='abyssal-trench'
  ?new T.ConeGeometry(2.1,5.6,6)
  :new T.DodecahedronGeometry(2.3,1);
 const trunkColor=courseId==='crestfall-gardens'?'#5c4566':courseId==='amazon-canopy'?'#4d331f':courseId==='dune-canyon'?'#8c4a27':'#2b4c66';
 const crownColor=courseId==='crestfall-gardens'?'#f28bc2':courseId==='amazon-canopy'?'#2e8540':courseId==='dune-canyon'?'#d97e38':courseId==='polar-vortex'?'#9ceeff':'#00e5ff';
 const trunkMat=new T.MeshStandardMaterial({color:trunkColor,roughness:0.75});
 const crownMat=new T.MeshStandardMaterial({
  color:crownColor,
  roughness:0.42,
  emissive:courseId==='abyssal-trench'||courseId==='crestfall-gardens'?crownColor:'#000000',
  emissiveIntensity:courseId==='abyssal-trench'?0.55:courseId==='crestfall-gardens'?0.18:0,
 });
 const trunks=new T.InstancedMesh(trunkGeo,trunkMat,count);
 const crowns=new T.InstancedMesh(crownGeo,crownMat,count);
 trunks.castShadow=true;trunks.receiveShadow=true;
 crowns.castShadow=true;crowns.receiveShadow=true;

 const dummy=new T.Object3D();
 const baseFloor=courseId==='abyssal-trench'?-30:courseId==='dune-canyon'?-6:-8;
 for(let i=0;i<count;i++){
  const a=i*2.39996, rad=45+(i%11)*22;
  const rawX=Math.cos(a)*rad, rawZ=Math.sin(a)*rad;
  const safe=ensureOffTrackXZ(rawX,rawZ,6.5,courseId);
  const r=Math.hypot(safe.x,safe.z);
  const y=baseFloor+Math.sin(safe.x*0.024)*Math.cos(safe.z*0.024)*9.5+Math.max(0,(r-175)*0.18);
  const sc=0.85+(i%5)*0.24;

  dummy.position.set(safe.x,y+1.6*sc,safe.z);
  dummy.scale.setScalar(sc);
  dummy.rotation.set(0,i*1.1,0);
  dummy.updateMatrix();
  trunks.setMatrixAt(i,dummy.matrix);

  dummy.position.set(safe.x,y+4.2*sc,safe.z);
  dummy.scale.set(sc*1.15,sc*(courseId==='polar-vortex'?1.35:0.95),sc*1.15);
  dummy.updateMatrix();
  crowns.setMatrixAt(i,dummy.matrix);
 }
 trunks.instanceMatrix.needsUpdate=true;
 crowns.instanceMatrix.needsUpdate=true;
 scene.add(trunks);
 scene.add(crowns);
}

/** Batched solid scenery + Blender hero monuments for all 5 Kith Circuit courses. */
export function makeGardenWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 courseId:CourseId='crestfall-gardens'
){
 buildSculptedValleyTerrain(scene,courseId);
 buildInstancedHillForest(scene,courseId);

 const surface=document.createElement('canvas');surface.width=surface.height=128;
 const surfaceCtx=surface.getContext('2d')!;surfaceCtx.fillStyle='#b8b8b8';surfaceCtx.fillRect(0,0,128,128);
 for(let i=0;i<1800;i++){const value=110+(i*37)%115;surfaceCtx.fillStyle=`rgb(${value},${value},${value})`;surfaceCtx.fillRect((i*43)%128,(i*79+Math.floor(i/128)*13)%128,1+i%3,1+i%4);}
 const grain=new T.CanvasTexture(surface);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(4,4);
 const batches=new Map<T.Material,T.BufferGeometry[]>(),palette=new Map<string,T.MeshStandardMaterial>();
 const material=(color:string,glow=0)=>{const key=color+glow;if(!palette.has(key))palette.set(key,new T.MeshStandardMaterial({color,roughness:glow?.35:.62,metalness:glow?.22:.08,emissive:color,emissiveIntensity:glow,bumpMap:grain,bumpScale:.06}));return palette.get(key)!;};
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

 // Dispatch to the specialized 3D world builder for each of the 4 additional courses
 if(courseId==='abyssal-trench') return buildAbyssalWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);
 if(courseId==='dune-canyon') return buildDuneWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);
 if(courseId==='polar-vortex') return buildPolarWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);
 if(courseId==='amazon-canopy') return buildAmazonWorld(scene,point,batches,material,crystal,shape,vec,ell,stem);

 // ============================================================================
 // COURSE 1: CRESTFALL GARDENS (Concept Art Kith Sanctuary — Zero Track Obstructions)
 // ============================================================================
 function tree(x:number,y:number,z:number,size:number,seed:number,leanX=0,leanZ=0){
  const topX=x+(.22+leanX)*size, topY=y+2.6*size, topZ=z+leanZ*size;
  stem(vec(x,y,z),vec(topX,topY,topZ),.22*size,'#5e4968');
  for(let j=0;j<5;j++){
   const a=j*2.4+seed,cx=topX+Math.cos(a)*size*1.05,cz=topZ+Math.sin(a)*size*1.05,cy=y+(2.45+(j%2)*.45)*size;
   stem(vec(x+leanX*size*.4,y+1.25*size,z+leanZ*size*.4),vec(cx,cy,cz),.1*size,'#5e4968');
   ell(cx,cy,cz,1.15*size,.64*size,1.02*size,j%2?'#e27bb5':'#f7a4d2',.28);
   ell(cx-.22*size,cy+.28*size,cz,.72*size,.36*size,.74*size,'#ffc4e4',.34);
  }
 }

 const falls:T.Mesh[]=[];
 const waterCanvas=document.createElement('canvas');waterCanvas.width=64;waterCanvas.height=128;
 const ctx=waterCanvas.getContext('2d')!;ctx.fillStyle='#24c5e6';ctx.fillRect(0,0,64,128);
 for(let i=0;i<48;i++){ctx.fillStyle=i%3?'rgba(240,255,255,.78)':'rgba(110,235,255,.94)';ctx.fillRect((i*17)%64,(i*37)%128,1+i%3,12+i%22);}
 const waterMap=new T.CanvasTexture(waterCanvas);waterMap.wrapS=waterMap.wrapT=T.RepeatWrapping;waterMap.repeat.set(2,3);waterMap.colorSpace=T.SRGBColorSpace;
 const water=new T.MeshStandardMaterial({map:waterMap,color:'#c8fcff',emissive:'#28bfe6',emissiveIntensity:.95,roughness:.12,metalness:.12,envMapIntensity:1.3,side:T.DoubleSide,transparent:true,opacity:.94});

 function addWaterfall(rawX:number,topY:number,rawZ:number,width:number,height:number,rotY=0){
  const safe=ensureOffTrackXZ(rawX,rawZ,width+4,'crestfall-gardens');
  const fall=new T.Mesh(new T.PlaneGeometry(width,height,2,1),water);
  fall.position.set(safe.x,topY-height/2,safe.z);
  fall.rotation.y=rotY;
  scene.add(fall);falls.push(fall);
  ell(safe.x,topY-height+.3,safe.z,width*.65,.42,width*.55,'#dcfbff',.45);
 }

 function island(rawX:number,rawZ:number,r:number,y:number,seed:number,waterfall=false){
  const safe=ensureOffTrackXZ(rawX,rawZ,r+5,'crestfall-gardens');
  const x=safe.x, z=safe.z;
  const rock=new T.CylinderGeometry(r,r*.38,r*1.65,20,5),vertices=rock.getAttribute('position');
  for(let i=0;i<vertices.count;i++){
   const px=vertices.getX(i),py=vertices.getY(i),pz=vertices.getZ(i),a=Math.atan2(pz,px);
   const warp=1+Math.sin(a*6+seed)*.08+Math.cos(a*9+py*.4)*.06;
   vertices.setXYZ(i,px*warp,py+Math.sin(a*7+seed)*.35,pz*warp);
  }
  rock.computeVertexNormals();shape(rock,material('#8e7a9a'),vec(x,y-r*.82,z));
  shape(new T.CylinderGeometry(r*1.01,r,.95,16),material('#6a9662'),vec(x,y+.12,z));
  ell(x,y+.38,z,r*.92,.65,r*.9,'#88b06c');
  for(let j=0;j<6;j++){const a=j*2.399+seed,rr=r*(.35+(j%3)*.19);tree(x+Math.cos(a)*rr,y+.5,z+Math.sin(a)*rr,.62+r*.034,j+seed);}
  if(waterfall){
   const h=r*1.8+10;
   const angleToCenter=Math.atan2(-x,-z);
   addWaterfall(x+Math.sin(angleToCenter)*r*.94,y,z+Math.cos(angleToCenter)*r*.94,r*.42,h,angleToCenter);
  }
 }

 // Central Sanctuary Lake Island (well inside the Grand Crescent loop)
 island(0,-18,20,-2,3,true);
 // Outer perimeter floating botanical islands (all verified off-track)
 for(let i=0;i<14;i++){
  const a=i*Math.PI*2/14,r=188+(i%3)*18;
  island(Math.cos(a)*r,Math.sin(a)*r,13+i%4*3,6+(i%4)*7,i,i%2===0);
 }
 for(let i=0;i<10;i++){
  const a=i*Math.PI*2/10+.2,r=245+i%3*18;
  island(Math.cos(a)*r,Math.sin(a)*r,12+i%3*4,28+i%4*7,i,true);
 }

 const skyIslands=[
  {x:185,y:42,z:-35,r:10.5},
  {x:45,y:44,z:-155,r:9.5},
  {x:195,y:46,z:55,r:11.0},
  {x:-65,y:44,z:145,r:11.0},
  {x:35,y:50,z:135,r:9.5},
  {x:-185,y:40,z:-25,r:10.5},
 ];
 const mesaAnchors:T.Group[]=[];
 for(let i=0;i<skyIslands.length;i++){
  const isl=skyIslands[i];
  const safe=ensureOffTrackXZ(isl.x,isl.z,isl.r+8,'crestfall-gardens');
  isl.x=safe.x;isl.z=safe.z;
  const anchor=new T.Group();
  anchor.position.set(isl.x,isl.y,isl.z);
  scene.add(anchor);
  mesaAnchors.push(anchor);
  const fallbackRock=new T.Group();fallbackRock.name='fallback_mesa';
  const m1=new T.Mesh(new T.CylinderGeometry(isl.r,isl.r*.72,isl.r*.65,9),material('#8c7999'));
  m1.position.y=-isl.r*.3;fallbackRock.add(m1);
  const cap=new T.Mesh(new T.CylinderGeometry(isl.r*1.02,isl.r,.8,12),material('#739e62'));
  cap.position.y=.2;fallbackRock.add(cap);
  anchor.add(fallbackRock);
  tree(isl.x,isl.y+.5,isl.z,1.15,i*7);
  const faceAngle=Math.atan2(-isl.x,-isl.z);
  addWaterfall(isl.x+Math.sin(faceAngle)*isl.r*.82,isl.y,isl.z+Math.cos(faceAngle)*isl.r*.82,isl.r*.34,isl.r*2.0,faceAngle);
  shape(crestGeometry(),crystal(i%2?'#ff8c00':'#ff388f'),vec(isl.x+isl.r*.42,isl.y+1.2,isl.z),vec(1.8,2.5,1.8),new T.Euler(0,i*.9,.18));
 }

 // Continuous Trackside Balustrade Guardrails (strictly outside road coping at lane ±67)
 const triUpGeo=new T.ConeGeometry(.24,.36,3);triUpGeo.rotateY(Math.PI/2);
 const triDownGeo=new T.ConeGeometry(.24,.36,3);triDownGeo.rotateY(Math.PI/2);triDownGeo.rotateZ(Math.PI);
 const amberGlowMat=crystal('#ff9419',1.35);

 for(const side of [-1,1]){
  const upperCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67,1.08)),true);
  shape(new T.TubeGeometry(upperCurve,280,.18,6,true),material('#efe2d0'),vec(0,0,0));
  const midCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67.5,0.62)),true);
  shape(new T.TubeGeometry(midCurve,280,.26,6,true),material('#3c2d4d'),vec(0,0,0));
  const lowerCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67,0.22)),true);
  shape(new T.TubeGeometry(lowerCurve,280,.24,6,true),material('#a995b5'),vec(0,0,0));

  for(let i=0;i<140;i++){
   const t=i/140,p=point(t,side*66.2,0.62),q=point(t+.002,side*66.2,0.62),yaw=Math.atan2(q.x-p.x,q.z-p.z);
   const tri=i%2===0?triUpGeo.clone():triDownGeo.clone();
   shape(tri,amberGlowMat,p,vec(1,1,1),new T.Euler(0,yaw,0));
  }
 }

 // Trackside Sakura Trees, Lanterns & Banners (verified off-track so inner loops never collide)
 for(let i=0;i<56;i++){
  const t=i/56,side=i%2?1:-1;
  const q=point(t+.002),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  const rawTree=point(t,side*98);
  const safeTree=ensureOffTrackXZ(rawTree.x,rawTree.z,4.5,'crestfall-gardens');
  if(i%2===0){
   tree(safeTree.x,rawTree.y-.2,safeTree.z,1.35,i);
  }
  const lampBase=point(t,side*70.5);
  stem(lampBase,lampBase.clone().add(vec(0,2.65,0)),.09,'#d8c7b4');
  shape(crestGeometry(),crystal('#ffcf54',1.4),lampBase.clone().add(vec(0,2.82,0)),vec(.48,.52,.88),new T.Euler(0,yaw,0));
 }

 // Flanking Crystal Monoliths (verified off-track)
 const monolithProgress=[.05,.14,.26,.38,.52,.66,.78,.90];
 const monolithAnchors:{group:T.Group;side:number}[]=[];
 for(const t of monolithProgress)for(const side of [-1,1]){
  const rawP=point(t,side*115),q=point(t+.002),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  const safe=ensureOffTrackXZ(rawP.x,rawP.z,7.5,'crestfall-gardens');
  const p=vec(safe.x,rawP.y,safe.z);
  const anchor=new T.Group();
  anchor.position.copy(p);
  anchor.rotation.y=yaw;
  scene.add(anchor);
  monolithAnchors.push({group:anchor,side});
  shape(crestGeometry(),crystal(side>0?'#ff8000':'#e62e8a',1.1),p,vec(4.8,side>0?7.2:5.8,3.8),new T.Euler(0,yaw,-side*.22));
 }

 // Colossal Kith Guardians overlooking the circuit from safe vista plateaus
 const guardianAnchors:T.Group[]=[];
 const guardianSpots=[
  {pos:vec(178,18,-18),lookAt:vec(60,8,-60),scale:1.2},
  {pos:vec(-35,24,148),lookAt:vec(20,16,50),scale:1.1},
 ];
 for(const spot of guardianSpots){
  const safe=ensureOffTrackXZ(spot.pos.x,spot.pos.z,18,'crestfall-gardens');
  const gGroup=new T.Group();
  gGroup.position.set(safe.x,spot.pos.y,safe.z);
  gGroup.scale.setScalar(spot.scale);
  gGroup.lookAt(spot.lookAt.x,spot.pos.y,spot.lookAt.z);
  scene.add(gGroup);
  guardianAnchors.push(gGroup);

  const fallback=new T.Group();fallback.name='fallback_guardian';
  const headMesh=new T.Mesh(new T.SphereGeometry(8.5,16,14),material('#e8dac8'));
  headMesh.scale.set(1.15,1.05,.85);headMesh.position.set(0,10,0);fallback.add(headMesh);
  gGroup.add(fallback);
 }

 const sanctuaryAnchor=new T.Group();
 sanctuaryAnchor.position.set(68,14,-158);
 sanctuaryAnchor.scale.setScalar(1.2);
 sanctuaryAnchor.lookAt(20,5,-95);
 scene.add(sanctuaryAnchor);
 addWaterfall(58,22,-154,3.8,22,0.35);
 addWaterfall(78,22,-154,3.8,22,0.35);

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

 const petalCount=520;
 const petalPos=new Float32Array(petalCount*3);
 for(let i=0;i<petalCount;i++){
  petalPos[i*3]=Math.sin(i*19)*160;
  petalPos[i*3+1]=2.5+(i*7)%36;
  petalPos[i*3+2]=Math.cos(i*13)*150;
 }
 const petalGeo=new T.BufferGeometry();
 petalGeo.setAttribute('position',new T.BufferAttribute(petalPos,3));
 const petalMat=new T.PointsMaterial({map:makePetalTexture(),color:'#ffd0e8',size:.72,sizeAttenuation:true,transparent:true,opacity:.92,alphaTest:.05,depthWrite:false});
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
    if(arr[i*3+1]<1){arr[i*3+1]=36;arr[i*3]=Math.sin(i*19+time)*150;arr[i*3+2]=Math.cos(i*13+time)*140;}
   }
   attr.needsUpdate=true;
  },
  stats:{islands:25,kartDesigns:10,waterfalls:falls.length,skyIslands:skyIslands.length}
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

/**
 * Helper to build a continuous arched glass dome over the road ribbon using exact `trackFrame`
 * coordinates so it NEVER intersects banked turns or steep drops!
 */
function buildFrameAlignedGlassCanopy(scene:T.Scene,courseId:CourseId){
 const steps=280, arcSegs=12;
 const positions:number[]=[], uvs:number[]=[], indices:number[]=[];
 const radius=13.2; // Road coping is at ±67 * 0.18 = ±12.06m, so radius 13.2m arches cleanly outside the road!
 for(let i=0;i<=steps;i++){
  const f=trackFrame(i/steps,0,courseId);
  for(let j=0;j<=arcSegs;j++){
   const theta=(j/arcSegs)*Math.PI; // 0 (right edge) -> PI (left edge)
   const cx=Math.cos(theta)*radius;
   const cy=Math.sin(theta)*radius*0.88;
   const p=f.position.clone()
    .addScaledVector(f.right,cx)
    .addScaledVector(f.normal,cy);
   positions.push(p.x,p.y,p.z);
   uvs.push(j/arcSegs,i/10);
  }
  if(i<steps){
   const row=arcSegs+1;
   const b=i*row;
   for(let j=0;j<arcSegs;j++){
    indices.push(b+j,b+row+j,b+j+1,b+j+1,b+row+j,b+row+j+1);
   }
  }
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
 geo.setIndex(indices);
 geo.computeVertexNormals();
 const glassMat=new T.MeshPhysicalMaterial({
  color:'#5ce6ff',
  emissive:'#07426b',
  emissiveIntensity:0.28,
  roughness:0.06,
  metalness:0.05,
  transparent:true,
  opacity:0.22,
  clearcoat:1.0,
  side:T.DoubleSide,
  depthWrite:false,
 });
 const mesh=new T.Mesh(geo,glassMat);
 scene.add(mesh);
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
 // 1. Frame-Aligned Transparent Underwater Glass Canopy Dome encasing the track!
 buildFrameAlignedGlassCanopy(scene,'abyssal-trench');

 // Glowing structural glass-tunnel ribs & neon rails oriented with exact 3D basis
 const basisMat=new T.Matrix4(), ribEuler=new T.Euler();
 for(let i=0;i<76;i++){
  const t=i/76;
  const f=trackFrame(t,0,'abyssal-trench');
  basisMat.makeBasis(f.right,f.normal,f.tangent);
  ribEuler.setFromRotationMatrix(basisMat);
  const ribCol=i%3===0?'#ff2e93':'#00f0ff';
  shape(new T.TorusGeometry(13.3,0.24,8,24,Math.PI),crystal(ribCol,1.3),f.position,vec(1,0.88,1),ribEuler);
 }

 // 2. Deep Abyssal Seamounts & Bioluminescent Coral Reefs safely outside the glass tunnel
 const coralColors=['#00f5ff','#ff2a9d','#9d4edd','#38ff9c','#ffb703'];
 for(let i=0;i<52;i++){
  const a=i*2.399, r=95+(i%5)*35;
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,18,'abyssal-trench');
  const x=safe.x, z=safe.z, y=-28+(i%6)*5;
  shape(new T.ConeGeometry(12+(i%4)*4,28+(i%3)*12,7),material('#0c213d'),vec(x,y,z));
  const cCol=coralColors[i%coralColors.length];
  ell(x,y+12,z,5.5,2.2,5.5,cCol,0.95);
  for(let b=0;b<4;b++){
   const ba=b*1.57+i;
   const bx=x+Math.cos(ba)*3.5, bz=z+Math.sin(ba)*3.5;
   stem(vec(x,y+11,z),vec(bx,y+18+(b%2)*3,bz),0.65,cCol,1.1);
   ell(bx,y+18+(b%2)*3,bz,1.6,1.1,1.6,coralColors[(i+b)%coralColors.length],1.3);
  }
 }

 // Roadside Coral Gardens safely outside the glass tunnel walls
 for(let i=0;i<72;i++){
  const t=i/72, side=i%2?1:-1;
  const rawP=point(t,side*108,-3);
  const safe=ensureOffTrackXZ(rawP.x,rawP.z,6,'abyssal-trench');
  const p=vec(safe.x,rawP.y,safe.z);
  const cCol=coralColors[i%coralColors.length];
  shape(crestGeometry(),crystal(cCol,1.25),p,vec(3.4,5.5+(i%3)*2.2,3.4),new T.Euler(0,i*0.9,side*0.18));
 }

 // 3. Animated Bioluminescent Sea Creatures Swimming Outside the Glass Tunnel
 const leviathans:T.Group[]=[];
 for(let i=0;i<2;i++){
  const g=new T.Group();
  const fb=new T.Group();fb.name='fallback_leviathan';
  const bodyMesh=new T.Mesh(new T.SphereGeometry(4.5,14,10),crystal(i===0?'#00f0ff':'#ff2e93',1.1));
  bodyMesh.scale.set(1.0,0.8,3.6);fb.add(bodyMesh);
  g.add(fb);scene.add(g);leviathans.push(g);
 }

 const mantas:{group:T.Group;baseT:number;side:number;speed:number;height:number}[]=[];
 for(let i=0;i<12;i++){
  const g=new T.Group();
  const fb=new T.Group();fb.name='fallback_manta';
  const mCore=new T.Mesh(new T.ConeGeometry(2.8,5.5,5),crystal(i%2?'#00e5ff':'#d938ff',1.25));
  mCore.rotation.x=Math.PI/2;mCore.scale.set(2.2,1,0.35);fb.add(mCore);
  g.add(fb);scene.add(g);
  mantas.push({group:g,baseT:i/12,side:i%2?1:-1,speed:0.028+(i%3)*0.007,height:15+(i%4)*4});
 }

 const jellies:{group:T.Group;x:number;baseY:number;z:number;phase:number}[]=[];
 for(let i=0;i<22;i++){
  const t=i/22, side=i%2?1:-1;
  const rawP=point(t,side*(104+(i%3)*18),8+(i%4)*5);
  const safe=ensureOffTrackXZ(rawP.x,rawP.z,6,'abyssal-trench');
  const jg=new T.Group();
  jg.position.set(safe.x,rawP.y,safe.z);
  const jCol=i%3===0?'#ff2e93':i%3===1?'#00f5ff':'#b54cff';
  const bell=new T.Mesh(new T.SphereGeometry(2.6,12,8,0,Math.PI*2,0,Math.PI*0.62),crystal(jCol,1.4));
  jg.add(bell);
  for(let k=0;k<4;k++){
   const tent=new T.Mesh(new T.CylinderGeometry(0.08,0.03,4.8,5),crystal(jCol,1.2));
   tent.position.set(Math.cos(k*1.57)*1.1,-2.4,Math.sin(k*1.57)*1.1);
   jg.add(tent);
  }
  scene.add(jg);
  jellies.push({group:jg,x:safe.x,baseY:rawP.y,z:safe.z,phase:i*1.3});
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

 const bubbleCount=600;
 const bubblePos=new Float32Array(bubbleCount*3);
 for(let i=0;i<bubbleCount;i++){
  bubblePos[i*3]=(Math.random()-.5)*280;
  bubblePos[i*3+1]=-28+Math.random()*70;
  bubblePos[i*3+2]=(Math.random()-.5)*280;
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
   leviathans.forEach((lev,idx)=>{
    const a=time*0.18+idx*Math.PI;
    const nextA=a+0.05;
    const r=185+Math.sin(time*0.4+idx)*18;
    const x=Math.cos(a)*r, z=Math.sin(a)*r, y=14+Math.sin(time*0.65+idx*2)*14;
    const nx=Math.cos(nextA)*r, nz=Math.sin(nextA)*r, ny=14+Math.sin((time+0.2)*0.65+idx*2)*14;
    lev.position.set(x,y,z);
    lev.lookAt(nx,ny,nz);
    lev.rotation.z=Math.sin(time*1.8+idx)*0.22;
   });
   mantas.forEach((m,idx)=>{
    const t=((m.baseT+time*m.speed)%1+1)%1;
    const p=point(t,m.side*(105+Math.sin(time+idx)*14),m.height+Math.sin(time*1.6+idx)*3.5);
    const q=point((t+0.008)%1,m.side*(105+Math.sin(time+idx)*14),m.height+Math.sin(time*1.6+idx)*3.5);
    m.group.position.copy(p);
    m.group.lookAt(q);
    m.group.rotation.z=Math.sin(time*3.2+idx)*0.28;
   });
   jellies.forEach(j=>{
    const pulse=Math.sin(time*2.6+j.phase);
    j.group.position.y=j.baseY+pulse*2.8;
    const s=1+pulse*0.14;
    j.group.scale.set(s,1/s,s);
   });
   const attr=bubbleGeo.getAttribute('position') as T.BufferAttribute;
   const arr=attr.array as Float32Array;
   for(let i=0;i<bubbleCount;i++){
    arr[i*3+1]+=dt*(2.6+(i%4)*0.8);
    arr[i*3]+=Math.sin(time*2+i)*dt*0.9;
    if(arr[i*3+1]>42) arr[i*3+1]=-28;
   }
   attr.needsUpdate=true;
  },
  stats:{islands:52,kartDesigns:10,waterfalls:12,skyIslands:12}
 };
}

// ============================================================================
// COURSE 3: DUNE WORM CANYON (Figure-8 Overpass, Sand Dunes & Giant Sandworms)
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
 _stem:(a:T.Vector3,b:T.Vector3,r:number,c:string,g?:number)=>void
){
 // 1. Sweeping Golden Sand Dunes & Red-Rock Sandstone Canyon Mesas (all verified off-track!)
 for(let i=0;i<44;i++){
  const a=i*Math.PI*2/44, r=175+(i%4)*26;
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,30,'dune-canyon');
  ell(safe.x,-4+(i%3)*3,safe.z,26+(i%3)*6,8+(i%4)*3.5,22+(i%2)*6,i%2?'#e09145':'#cf7932');
  if(i%2===0){
   const mr=225+(i%3)*24;
   const msafe=ensureOffTrackXZ(Math.cos(a)*mr,Math.sin(a)*mr,28,'dune-canyon');
   const mh=44+(i%4)*16;
   shape(new T.CylinderGeometry(10+(i%3)*4,24+(i%4)*5,mh,7),material(i%4===0?'#b5482a':'#9c3b24'),vec(msafe.x,mh/2-12,msafe.z));
  }
 }

 // Continuous sandstone guardrails along the road coping (lane ±67)
 for(const side of [-1,1]){
  const railCurve=new T.CatmullRomCurve3(Array.from({length:240},(_,i)=>point(i/240,side*67,0.45)),true);
  shape(new T.TubeGeometry(railCurve,260,0.34,6,true),material('#d99b5e'),vec(0,0,0));
 }

 const basisMat=new T.Matrix4(), archEuler=new T.Euler();
 for(let i=0;i<36;i++){
  const t=i/36, side=i%2?1:-1;
  const rawP=point(t,side*96);
  const safe=ensureOffTrackXZ(rawP.x,rawP.z,6,'dune-canyon');
  const p=vec(safe.x,rawP.y,safe.z);
  const f=trackFrame(t,0,'dune-canyon');
  const yaw=Math.atan2(f.tangent.x,f.tangent.z);
  shape(crestGeometry(),material('#c97236'),p,vec(3.5,7.5+(i%3)*3,3.5),new T.Euler(0,yaw,-side*0.15));
  shape(crestGeometry(),crystal('#ff9500',1.2),p.clone().add(vec(0,4.5,0)),vec(1.6,3.2,1.6),new T.Euler(0,yaw,0));
  if(i%6===0&&isSupportPillarSafe(t,'dune-canyon')){
   // Wide Sandstone Canyon Arch spanning cleanly outside the ±12m road at 16.8m radius
   basisMat.makeBasis(f.right,f.normal,f.tangent);
   archEuler.setFromRotationMatrix(basisMat);
   shape(new T.TorusGeometry(16.8,1.3,7,22,Math.PI),material('#b85d32'),f.position,vec(1,1.1,0.6),archEuler);
  }
 }

 // 2. Animated Colossal Sandworms Breaching in Safe Desert Basins Outside the Figure-8!
 const worms:{
  segments:T.Group[];
  centerX:number;
  centerZ:number;
  radiusX:number;
  radiusZ:number;
  speed:number;
  phase:number;
 }[]=[
  {segments:[],centerX:0,centerZ:-138,radiusX:48,radiusZ:24,speed:0.52,phase:0},
  {segments:[],centerX:195,centerZ:18,radiusX:36,radiusZ:58,speed:0.46,phase:2.1},
  {segments:[],centerX:-195,centerZ:-12,radiusX:36,radiusZ:58,speed:0.50,phase:4.2},
 ];

 for(const w of worms){
  for(let s=0;s<9;s++){
   const segGroup=new T.Group();
   const r=Math.max(2.2,6.8-s*0.52);
   const fb=new T.Group();fb.name='fallback_worm';
   const torus=new T.Mesh(new T.TorusGeometry(r,1.6,10,18),material(s%2?'#b85d28':'#d9823b'));
   fb.add(torus);
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

 const sandCount=550;
 const sandPos=new Float32Array(sandCount*3);
 for(let i=0;i<sandCount;i++){
  sandPos[i*3]=(Math.random()-.5)*280;
  sandPos[i*3+1]=1+Math.random()*38;
  sandPos[i*3+2]=(Math.random()-.5)*280;
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
    if(arr[i*3]>140) arr[i*3]=-140;
   }
   attr.needsUpdate=true;
  },
  stats:{islands:44,kartDesigns:10,waterfalls:3,skyIslands:6}
 };
}

// ============================================================================
// COURSE 4: POLAR VORTEX CITADEL (Arctic 4-Star Circuit, Glaciers & Aurora)
// ============================================================================
function buildPolarWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 batches:Map<T.Material,T.BufferGeometry[]>,
 material:(c:string,g?:number)=>T.MeshStandardMaterial,
 crystal:(c:string,g?:number)=>T.MeshStandardMaterial,
 shape:(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s?:T.Vector3,r?:T.Euler)=>void,
 vec:(x:number,y:number,z:number)=>T.Vector3,
 _ell:(x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string,g?:number)=>void,
 _stem:(a:T.Vector3,b:T.Vector3,r:number,c:string,g?:number)=>void
){
 // 1. Swirling North Pole Polar Vortex Funnel Cloud in the center of the 4-Star Circuit (0, y, 0)!
 const vortexRings:T.Mesh[]=[];
 for(let i=0;i<14;i++){
  const r=10+i*5.5, y=8+i*6.5;
  const ringMat=crystal(i%3===0?'#3df5ff':i%3===1?'#70ffba':'#b866ff',1.25);
  const ring=new T.Mesh(new T.TorusGeometry(r,0.85+i*0.08,8,32,Math.PI*1.65),ringMat);
  ring.position.set(0,y,0);
  ring.rotation.x=Math.PI/2+Math.sin(i)*0.12;
  ring.rotation.z=i*0.6;
  scene.add(ring);
  vortexRings.push(ring);
 }

 // 2. Crystalline Ice Citadel Spires (all verified off-track!)
 const citadelAnchors:T.Group[]=[];
 const citadelPositions=[
  vec(0,2,0),
  vec(178,12,-48),
  vec(-178,10,48),
  vec(48,18,178),
 ];
 for(const pos of citadelPositions){
  const safe=ensureOffTrackXZ(pos.x,pos.z,16,'polar-vortex');
  const g=new T.Group();
  g.position.set(safe.x,pos.y,safe.z);
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

 for(let i=0;i<36;i++){
  const a=i*Math.PI*2/36, r=178+(i%3)*26;
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,18,'polar-vortex');
  const h=28+(i%4)*14;
  shape(new T.ConeGeometry(14+(i%3)*4,h,6),material(i%2?'#bce6ff':'#7ab8e6'),vec(safe.x,h/2-10,safe.z));
  shape(crestGeometry(),crystal('#42f5ff',1.1),vec(safe.x,h-8,safe.z),vec(4.2,7.5,4.2),new T.Euler(0,i*0.8,0.15));
 }

 for(const side of [-1,1]){
  const iceRail=new T.CatmullRomCurve3(Array.from({length:240},(_,i)=>point(i/240,side*67,0.45)),true);
  shape(new T.TubeGeometry(iceRail,260,0.32,6,true),crystal('#70f8ff',0.95),vec(0,0,0));
 }
 const basisMat=new T.Matrix4(), archEuler=new T.Euler();
 for(let i=0;i<44;i++){
  const t=i/44, side=i%2?1:-1;
  const rawP=point(t,side*92);
  const safe=ensureOffTrackXZ(rawP.x,rawP.z,5,'polar-vortex');
  const p=vec(safe.x,rawP.y,safe.z);
  const f=trackFrame(t,0,'polar-vortex');
  const yaw=Math.atan2(f.tangent.x,f.tangent.z);
  shape(crestGeometry(),crystal(i%2?'#00e5ff':'#e0ffff',1.2),p,vec(2.8,6.2+(i%3)*2.5,2.8),new T.Euler(0,yaw,-side*0.24));
  if(i%4===0){
   // Wide Ice Cavern Crystal Rib Arch spanning cleanly outside the ±12m road at 16.5m radius
   basisMat.makeBasis(f.right,f.normal,f.tangent);
   archEuler.setFromRotationMatrix(basisMat);
   shape(new T.TorusGeometry(16.5,0.85,6,22,Math.PI),crystal('#42f5ff',1.15),f.position,vec(1,1.05,1),archEuler);
  }
 }

 flushBatches(scene,batches);

 const snowCount=650;
 const snowPos=new Float32Array(snowCount*3);
 for(let i=0;i<snowCount;i++){
  const a=Math.random()*Math.PI*2, r=15+Math.random()*165;
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
   vortexRings.forEach((ring,idx)=>{
    ring.rotation.z=time*(1.2+idx*0.08)+idx;
    ring.position.x=Math.sin(time*1.5+idx*0.4)*3.5;
    ring.position.z=Math.cos(time*1.5+idx*0.4)*3.5;
   });
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
// COURSE 5: AMAZON CANOPY LOOP (Rainforest Mountainside, Bridges & 360° Loops)
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

 function jungleTree(rawX:number,y:number,rawZ:number,scale:number,seed:number){
  const safe=ensureOffTrackXZ(rawX,rawZ,6*scale,'amazon-canopy');
  const x=safe.x, z=safe.z;
  stem(vec(x,y,z),vec(x,y+8.5*scale,z),0.85*scale,'#4d331f');
  ell(x,y+9.2*scale,z,5.2*scale,2.4*scale,5.2*scale,'#246b35');
  ell(x+1.5*scale,y+10.5*scale,z-1.2*scale,3.8*scale,1.8*scale,3.8*scale,'#3ca349',0.15);
  for(let v=0;v<3;v++){
   const va=v*2.1+seed;
   const vx=x+Math.cos(va)*3.2*scale, vz=z+Math.sin(va)*3.2*scale;
   stem(vec(vx,y+8.8*scale,vz),vec(vx,y+3.2*scale,vz),0.12*scale,'#80e629',0.65);
  }
 }

 // 1. Lush Rainforest Mountainside Peaks & Kapok Canopy (all verified off-track!)
 for(let i=0;i<38;i++){
  const a=i*Math.PI*2/38, r=175+(i%4)*24;
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,20,'amazon-canopy');
  const y=-6+(i%5)*6;
  shape(new T.ConeGeometry(16+(i%3)*5,34+(i%4)*12,7),material(i%2?'#295939':'#1e472c'),vec(safe.x,y+8,safe.z));
  jungleTree(safe.x,y+18,safe.z,1.3+(i%3)*0.35,i);
 }

 // 2. Wooden Rope Suspension Bridge Rails & Posts outside the road coping (lane ±68)
 for(const side of [-1,1]){
  const ropePts=Array.from({length:260},(_,i)=>point(i/260,side*67,0.85));
  const ropeCurve=new T.CatmullRomCurve3(ropePts,true);
  shape(new T.TubeGeometry(ropeCurve,280,0.22,6,true),material('#8c5a2b'),vec(0,0,0));
 }
 for(let i=0;i<72;i++){
  const t=i/72;
  const f=trackFrame(t,0,'amazon-canopy');
  if(!f.inLoop&&i%2===0){
   for(const side of [-1,1]){
    const postPos=point(t,side*68);
    stem(postPos,postPos.clone().addScaledVector(f.normal,2.8),0.26,'#5c3a1e');
    ell(postPos.x+f.normal.x*3.0,postPos.y+f.normal.y*3.0,postPos.z+f.normal.z*3.0,0.45,0.55,0.45,'#a8ff2e',1.35);
   }
   if(i%4===0){
    const treePos=point(t,(i%8===0?1:-1)*108);
    jungleTree(treePos.x,treePos.y-2,treePos.z,1.25,i);
   }
  }
 }

 // 3. Wide Temple Archways & Flanking Sanctuary Towers (placed strictly outside the ±12m road!)
 const templeAnchors:T.Group[]=[];
 const basisMat=new T.Matrix4(), archEuler=new T.Euler();
 const tunnelTs=[0.06, 0.34, 0.64, 0.92];
 for(const t of tunnelTs){
  const f=trackFrame(t,0,'amazon-canopy');
  basisMat.makeBasis(f.right,f.normal,f.tangent);
  archEuler.setFromRotationMatrix(basisMat);
  // Wide ceremonial archway spanning 17m radius (34m across, 100% clear of the 22.6m road!)
  shape(new T.TorusGeometry(17.0,1.15,6,22,Math.PI),material('#5e704c'),f.position,vec(1,1.05,1),archEuler);
  shape(new T.TorusGeometry(16.6,0.32,6,22,Math.PI),crystal('#a8ff2e',1.35),f.position,vec(1,1.05,1),archEuler);
  // Place flanking temple monuments safely outside the road at lane ±98
  for(const side of [-1,1]){
   const rawP=point(t,side*98);
   const safe=ensureOffTrackXZ(rawP.x,rawP.z,7,'amazon-canopy');
   const g=new T.Group();
   g.position.set(safe.x,rawP.y,safe.z);
   g.lookAt(f.position);
   scene.add(g);
   templeAnchors.push(g);
  }
 }

 // Giant Glowing Power Rings framing each of the 3 vertical 360-degree Loop-the-Loops!
 const loopRings:T.Mesh[]=[];
 for(const loop of def.loops){
  for(let k=0;k<=8;k++){
   const lt=loop.centerT-loop.halfWidth+(k/8)*(loop.halfWidth*2);
   const lf=trackFrame(lt,0,'amazon-canopy');
   const hoop=new T.Mesh(
    new T.TorusGeometry(16.5,0.38,8,24),
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
    const clone=amzTemplate.clone(true);
    clone.scale.setScalar(0.65);
    enhanceMonument(clone);
    g.add(clone);
   });
  }
 }).catch(()=>{});

 flushBatches(scene,batches);

 const flyCount=500;
 const flyPos=new Float32Array(flyCount*3);
 for(let i=0;i<flyCount;i++){
  flyPos[i*3]=(Math.random()-.5)*280;
  flyPos[i*3+1]=2+Math.random()*54;
  flyPos[i*3+2]=(Math.random()-.5)*280;
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
