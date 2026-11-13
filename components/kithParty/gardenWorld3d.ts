import * as T from 'three';
import {kithGltfLoader} from './kithGltf';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {crestGeometry} from './karts3d';
import {type CourseId, courseById, trackFrame, worldPoint, ensureOffTrackXZ, isSupportPillarSafe} from './course3d';
import {buildKitScenery, type KitForest} from './sanctuaryKit3d';

/** Shared cached loader for Blender-sculpted monuments.glb */
let monumentsGlbPromise:Promise<T.Group>|null=null;
function loadMonumentsGlb():Promise<T.Group>{
 if(!monumentsGlbPromise){
  monumentsGlbPromise=new Promise((resolve,reject)=>{
   if(typeof window==='undefined'){reject(new Error('no-window'));return;}
   kithGltfLoader().load('/kith-party/models/monuments.glb',gltf=>resolve(gltf.scene),undefined,err=>reject(err));
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
 const mountain=isMountainWorld(courseId);
 const SIZE=680,SEG=mountain?136:88;
 const geo=new T.PlaneGeometry(SIZE,SIZE,SEG,SEG);
 geo.rotateX(-Math.PI/2);
 const pos=geo.getAttribute('position') as T.BufferAttribute;

 // Pre-sample track points for fast elevation depression under the track
 const trackSamples:T.Vector3[]=[];
 for(let i=0;i<120;i++) trackSamples.push(trackFrame(i/120,0,courseId).position);

 const baseFloor=terrainBaseFloor(courseId);
 if(mountain){
  // Mountain mode (descending sprint courses): the ground follows the road down the slope instead of
  // sitting in a flat bowl, falls away into chasms under bridges and gap jumps, and drops below sea level
  // far from the road. Lava channels are carved across each chasm.
  const M=mountainModel(courseId);
  for(let i=0;i<pos.count;i++) pos.setY(i,M.height(pos.getX(i),pos.getZ(i)));
  geo.computeVertexNormals();
  return finishTerrain(scene,courseId,geo,SIZE,SEG,baseFloor,M.seaLevel);
 }
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
   Math.sin(vx*0.13+.7)*Math.cos(vz*0.11-.4)*1.1+
   Math.max(0,(r-175)*0.18);
  // Smoothly depress terrain under the road corridor (within 24m of centerline)
  const corridorBlend=Math.min(1,Math.max(0,(minD-18)/28));
  const safeRoadUnder=Math.min(baseFloor,nearestY-5.5);
  const naturalY=baseFloor+hillWave;
  const finalY=safeRoadUnder*(1-corridorBlend)+naturalY*corridorBlend;
  pos.setY(i,finalY);
 }
 geo.computeVertexNormals();
 return finishTerrain(scene,courseId,geo,SIZE,SEG,baseFloor,null);
}

function finishTerrain(scene:T.Scene,courseId:CourseId,geo:T.BufferGeometry,SIZE:number,SEG:number,baseFloor:number,seaLevel:number|null){
 const def=courseById(courseId);
 const pos=geo.getAttribute('position') as T.BufferAttribute;
 // Vertex-colour biome blend: two grass tones broken by low-frequency noise, damp soil in the
 // hollows, sun-bleached crests, rock on steep slopes, snow caps where the world calls for it.
 const pal=worldPalette(courseId);
 const nrm=geo.getAttribute('normal') as T.BufferAttribute;
 const cols=new Float32Array(pos.count*3);
 const gA=new T.Color(def.terrainColorA),gB=new T.Color(def.terrainColorB),rock=new T.Color(pal.rock),crest=new T.Color(pal.crest),damp=new T.Color(pal.damp),snow=new T.Color('#f4fbff'),blackSand=new T.Color('#1b1719'),c=new T.Color();
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  const n=Math.sin(x*.045+Math.cos(z*.031)*2)*.5+Math.sin(z*.052-x*.017)*.5;
  c.copy(gA).lerp(gB,T.MathUtils.clamp(.5+n*.6,0,1));
  const h=y-baseFloor;
  if(seaLevel===null){
   c.lerp(damp,T.MathUtils.clamp((1-h)/7,0,.65));
   c.lerp(crest,T.MathUtils.clamp((h-9)/14,0,.55));
  } else {
   // mountain: ash dusting in drifts rather than by absolute height
   const ashN=Math.sin(x*.021+z*.013)*.5+Math.sin(z*.037-x*.029)*.5;
   c.lerp(crest,T.MathUtils.clamp(ashN*.6,0,.35));
  }
  c.lerp(rock,T.MathUtils.smoothstep(1-nrm.getY(i),.16,.4));
  if(pal.snowAbove!==undefined) c.lerp(snow,T.MathUtils.clamp((y-pal.snowAbove)/6,0,.9));
  if(seaLevel!==null){
   // black-sand beach just above the waterline, wet and darker below it
   const sand=T.MathUtils.clamp(1-(y-seaLevel)/3.2,0,1);
   c.lerp(blackSand,sand*.9);
   if(y<seaLevel) c.multiplyScalar(.7);
  }
  if(pal.volcanic) c.multiplyScalar(.62);
  cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b;
 }
 geo.setAttribute('color',new T.BufferAttribute(cols,3));
 const mat=new T.MeshStandardMaterial({
  map:makeTerrainDetailTexture(),
  vertexColors:true,
  roughness:courseId==='polar-vortex'?0.36:0.88,
  metalness:courseId==='polar-vortex'?0.12:0.0,
  envMapIntensity:0.8,
 });
 // second, much larger-scale sample of the detail map hides tiling
 mat.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   #ifdef USE_MAP
    vec4 kpD1=texture2D(map,vMapUv);
    vec4 kpD2=texture2D(map,vMapUv*0.11+vec2(0.37,0.21));
    diffuseColor.rgb*=mix(vec3(1.0),kpD1.rgb*1.9,0.55)*mix(vec3(1.0),kpD2.rgb*1.9,0.35);
   #endif`);
 };
 const mesh=new T.Mesh(geo,mat);
 mesh.receiveShadow=true;
 scene.add(mesh);

 const step=SIZE/SEG,row=SEG+1;
 const heightAt=(x:number,z:number)=>{
  const fx=T.MathUtils.clamp((x+SIZE/2)/step,0,SEG-1e-4),fz=T.MathUtils.clamp((z+SIZE/2)/step,0,SEG-1e-4);
  const ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz;
  const h00=pos.getY(iz*row+ix),h10=pos.getY(iz*row+ix+1),h01=pos.getY((iz+1)*row+ix),h11=pos.getY((iz+1)*row+ix+1);
  return (h00*(1-tx)+h10*tx)*(1-tz)+(h01*(1-tx)+h11*tx)*tz;
 };
 return {mesh,heightAt,baseFloor};
}

/**
 * Adds 160 GPU-instanced trees / biome spires across the rolling hills outside the track corridor
 * (costs only 2 draw calls total, just like high-end Three.js sim-racing tracks!).
 */
function buildInstancedHillForest(scene:T.Scene,courseId:CourseId,heightAt?:(x:number,z:number)=>number,wind?:{value:number}){
 const count=220;
 const wp=worldPalette(courseId);
 const trunkGeo=new T.CylinderGeometry(0.28,0.48,3.6,6);
 const crownGeo=wp.conifer
  ?new T.ConeGeometry(2.1,5.6,8)
  :new T.IcosahedronGeometry(2.3,2);
 if(!wp.conifer){
  // lumpy, cloud-like canopy instead of a faceted ball
  const cp=crownGeo.getAttribute('position') as T.BufferAttribute;
  for(let i=0;i<cp.count;i++){
   const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i);
   const k=1+Math.sin(x*2.1+y*1.3)*.09+Math.sin(z*2.7-y*1.9)*.08;
   cp.setXYZ(i,x*k,y*k*.92,z*k);
  }
  crownGeo.computeVertexNormals();
 }
 const trunkColor=wp.trunk;
 const crownColor=wp.crown;
 const trunkMat=new T.MeshStandardMaterial({color:trunkColor,roughness:0.75});
 const crownMat=new T.MeshStandardMaterial({
  color:crownColor,
  roughness:0.55,
  emissive:wp.crownEmissive>0?crownColor:'#000000',
  emissiveIntensity:wp.crownEmissive,
 });
 if(wind) addWindSway(crownMat,wind,.32,true);
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
  const y=heightAt?heightAt(safe.x,safe.z)-.4:baseFloor+Math.sin(safe.x*0.024)*Math.cos(safe.z*0.024)*9.5+Math.max(0,(r-175)*0.18);
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

/** Batched solid scenery + Blender hero monuments for the 5 original Kith Circuit courses. */
function makeLegacyWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 courseId:CourseId='crestfall-gardens',
 forest?:KitForest
){

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
  if(forest){forest.add(x,y-.2,z,size*.82,seed);return;}
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

 // Balustrade, lantern pillars, pennants (trackFeatures3d road dressing) and crystal shrines + overhanging
 // sakura (sanctuaryKit3d) replace the old tube rails, crest lamps and monoliths.
 const monolithAnchors:{group:T.Group;side:number}[]=[];
 void crestGeometry;

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
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,12+(i%4)*4+3,'abyssal-trench');
  if(!safe.safe)continue;
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
  const dsx=26+(i%3)*6,dsz=22+(i%2)*6;
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,Math.max(dsx,dsz)+3,'dune-canyon');
  if(safe.safe)ell(safe.x,-4+(i%3)*3,safe.z,dsx,8+(i%4)*3.5,dsz,i%2?'#e09145':'#cf7932');
  if(i%2===0){
   const mr=225+(i%3)*24;
   const msafe=ensureOffTrackXZ(Math.cos(a)*mr,Math.sin(a)*mr,24+(i%4)*5+3,'dune-canyon');
   const mh=44+(i%4)*16;
   if(msafe.safe)shape(new T.CylinderGeometry(10+(i%3)*4,24+(i%4)*5,mh,7),material(i%4===0?'#b5482a':'#9c3b24'),vec(msafe.x,mh/2-12,msafe.z));
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
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,14+(i%3)*4+3,'polar-vortex');
  if(!safe.safe)continue;
  const h=28+(i%4)*14;
  shape(new T.ConeGeometry(14+(i%3)*4,h,6),material(i%2?'#9cc8ea':'#5f95c4'),vec(safe.x,h/2-10,safe.z));
  shape(crestGeometry(),crystal('#42f5ff',.6),vec(safe.x,h-8,safe.z),vec(4.2,7.5,4.2),new T.Euler(0,i*0.8,0.15));
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
  shape(crestGeometry(),crystal(i%2?'#00e5ff':'#9fdcff',.65),p,vec(2.8,6.2+(i%3)*2.5,2.8),new T.Euler(0,yaw,-side*0.24));
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
  const safe=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,16+(i%3)*5+3,'amazon-canopy');
  if(!safe.safe)continue;
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

// ============================================================================
// GRAPHICS PASS: shared world layers for every course (wind foliage, water/lava, festival start)
// ============================================================================

const KNOWN_WORLDS:CourseId[]=['crestfall-gardens','abyssal-trench','dune-canyon','polar-vortex','amazon-canopy'];

function terrainBaseFloor(courseId:CourseId){
 return courseId==='abyssal-trench'?-34:courseId==='dune-canyon'?-8:-10;
}

interface WorldPalette {
 rock:string; crest:string; damp:string; snowAbove?:number;
 grass:[string,string]; flowers:string[]; flowerDensity:number; tuftScale:number; tuftDensity:number; tuftEmissive:number;
 trunk:string; crown:string; crownEmissive:number; conifer:boolean;
 water?:{deep:string;shallow:string;sky:string;lava?:boolean;ice?:boolean;level:number};
 flags:string[]; volcanic?:boolean;
}

/** Per-world art direction; new courses get a palette derived from their CourseDef. */
function worldPalette(courseId:CourseId):WorldPalette{
 const def=courseById(courseId);
 switch(courseId){
  case 'crestfall-gardens':return {rock:'#8e7a9a',crest:'#b9d98a',damp:'#3f6a45',grass:['#4f8f3f','#a6d96a'],flowers:['#ff8fc8','#fff1f8','#ffd25a','#c49bff'],flowerDensity:.35,tuftScale:1,tuftDensity:1,tuftEmissive:0,trunk:'#5c4566',crown:'#f28bc2',crownEmissive:.18,conifer:false,water:{deep:'#13607a',shallow:'#3fd2e0',sky:'#ffe2f0',level:-7},flags:['#ff8c00','#ff388f','#fff4e6']};
  case 'amazon-canopy':return {rock:'#5a5040',crest:'#5f9a3c',damp:'#1f3d22',grass:['#2f7a36','#77c24a'],flowers:['#ff5a3c','#ffd23f','#ff7ad1'],flowerDensity:.18,tuftScale:1.5,tuftDensity:1.25,tuftEmissive:0,trunk:'#4d331f',crown:'#2e8540',crownEmissive:0,conifer:false,water:{deep:'#1b4a33',shallow:'#5fae7e',sky:'#d9f296',level:-7},flags:['#9dff2e','#ffe866','#ff7a2a']};
  case 'dune-canyon':return {rock:'#a8552e',crest:'#f2c27e',damp:'#b8642e',grass:['#c9a04a','#e8c070'],flowers:['#ff6a3d','#ffd27a'],flowerDensity:.06,tuftScale:.8,tuftDensity:.45,tuftEmissive:0,trunk:'#8c4a27',crown:'#d97e38',crownEmissive:0,conifer:false,flags:['#ff6a00','#ffaa00','#3d1536']};
  case 'polar-vortex':return {rock:'#4f7391',crest:'#d9ecf8',damp:'#5f8fb3',snowAbove:4,grass:['#b8d6ea','#e8f5fc'],flowers:['#9fe8ff','#e0f7ff'],flowerDensity:.08,tuftScale:.7,tuftDensity:.4,tuftEmissive:.05,trunk:'#2b4c66',crown:'#9ceeff',crownEmissive:.04,conifer:true,water:{deep:'#0b2e4a',shallow:'#4fb7d8',sky:'#6ef2d8',ice:true,level:-6},flags:['#3df5ff','#ffffff','#7a5cff']};
  case 'ember-ridge':return {rock:'#2b2426',crest:'#6e6462',damp:'#1e1416',grass:['#3a2c28','#5e4232'],flowers:['#ff6a1a','#ffb02e','#ff3d00'],flowerDensity:.14,tuftScale:.8,tuftDensity:.3,tuftEmissive:.5,trunk:'#1c1416',crown:'#3a2a26',crownEmissive:0,conifer:true,water:{deep:'#0a2230',shallow:'#2f7f8f',sky:'#ff9a5a',level:1},flags:['#ff5a1a','#ffb02e','#2a1a16'],volcanic:true};
  case 'abyssal-trench':return {rock:'#1a2f4a',crest:'#2a5a7a',damp:'#0a1a30',grass:['#0e6b6b','#1ec8b0'],flowers:['#ff2e93','#00f0ff','#b36bff'],flowerDensity:.2,tuftScale:2.2,tuftDensity:.8,tuftEmissive:.55,trunk:'#2b4c66',crown:'#00e5ff',crownEmissive:.55,conifer:true,flags:['#00f0ff','#ff2e93','#ffffff']};
  default:{
   const hsl=new T.Color(def.terrainColorA).getHSL({h:0,s:0,l:0});
   const volcanic=hsl.l<.22||/ember|lava|volcan|ash|magma/i.test(courseId+' '+def.name);
   return {rock:volcanic?'#2a2024':'#6b6070',crest:def.terrainColorB,damp:new T.Color(def.terrainColorA).multiplyScalar(.6).getStyle(),
    grass:volcanic?['#3a2c28','#6b4a36']:[def.terrainColorA,def.terrainColorB],flowers:volcanic?['#ff6a1a','#ffb02e']:[def.accent,'#ffffff'],flowerDensity:volcanic?.12:.2,
    tuftScale:volcanic?.8:1,tuftDensity:volcanic?.35:.8,tuftEmissive:volcanic?.5:0,trunk:volcanic?'#1c1416':'#5c4a3a',crown:volcanic?'#3a2a26':def.terrainColorB,crownEmissive:0,conifer:volcanic,
    water:volcanic?{deep:'#5a0c00',shallow:'#ff7a1a',sky:'#ffb04a',lava:true,level:-9}:{deep:'#13607a',shallow:'#3fd2e0',sky:def.skyHorizon,level:-7},
    flags:[def.accent,def.stripeColor,'#ffffff'],volcanic};
  }
 }
}

function makeTerrainDetailTexture():T.CanvasTexture{
 // neutral mid-grey micro detail (multiplied x1.9 in the shader): grass grain, pebbles, soft blotches
 const c=document.createElement('canvas');c.width=c.height=256;
 const x=c.getContext('2d')!;
 x.fillStyle='rgb(134,134,134)';x.fillRect(0,0,256,256);
 for(let i=0;i<60;i++){
  const cx=(i*71)%256,cy=(i*113)%256;
  const g=x.createRadialGradient(cx,cy,0,cx,cy,18+(i%5)*10);
  const v=i%2?150:118;
  g.addColorStop(0,`rgba(${v},${v},${v},.5)`);g.addColorStop(1,`rgba(${v},${v},${v},0)`);
  x.fillStyle=g;x.fillRect(0,0,256,256);
 }
 for(let i=0;i<9000;i++){
  const v=100+((i*37)%70);
  x.fillStyle=`rgba(${v},${v},${v},.55)`;
  x.fillRect((i*53+(i>>7)*11)%256,(i*97+(i>>5)*7)%256,1,1+(i%3));
 }
 const t=new T.CanvasTexture(c);
 t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(48,48);t.anisotropy=8;
 return t;
}

/** Vertex wind sway (object space, before the instance transform). baseY/heightNorm map local height to sway weight. */
function addWindSway(mat:T.Material,wind:{value:number},amount:number,instanced:boolean,baseY=2.5,heightNorm=5){
 const prev=mat.onBeforeCompile;
 mat.onBeforeCompile=(shader,r)=>{
  prev?.call(mat,shader,r);
  shader.uniforms.uWind=wind;
  shader.vertexShader='uniform float uWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   {
    vec2 kpP=${instanced?'vec2(instanceMatrix[3][0],instanceMatrix[3][2])':'vec2(0.0)'};
    float kpW=clamp((position.y+${baseY.toFixed(3)})/${heightNorm.toFixed(3)},0.0,1.6);kpW*=kpW;
    float kpS=sin(uWind*1.7+kpP.x*0.07+kpP.y*0.05)+0.45*sin(uWind*3.9+kpP.x*0.21-kpP.y*0.13);
    transformed.x+=kpS*${amount.toFixed(3)}*kpW;
    transformed.z+=cos(uWind*1.3+kpP.y*0.06+kpP.x*0.03)*${(amount*.6).toFixed(3)}*kpW;
   }`);
 };
 mat.customProgramCacheKey=()=>`kp-wind-${amount}-${baseY}-${heightNorm}-${instanced?1:0}`;
}

function makeBladeTexture(kind:'grass'|'flower'|'kelp'):T.CanvasTexture{
 const c=document.createElement('canvas');c.width=128;c.height=128;
 const x=c.getContext('2d')!;
 x.clearRect(0,0,128,128);
 if(kind==='flower'){
  // stem + bloom head, white so instance colour tints the petals
  x.strokeStyle='rgba(90,150,70,1)';x.lineWidth=4;x.beginPath();x.moveTo(64,128);x.quadraticCurveTo(60,80,64,44);x.stroke();
  for(let i=0;i<6;i++){const a=i*Math.PI/3;x.fillStyle='rgba(255,255,255,1)';x.beginPath();x.ellipse(64+Math.cos(a)*12,34+Math.sin(a)*12,11,7,a,0,7);x.fill();}
  x.fillStyle='rgba(255,214,90,1)';x.beginPath();x.arc(64,34,7,0,7);x.fill();
 } else {
  const blades=kind==='kelp'?5:14;
  for(let i=0;i<blades;i++){
   const bx=10+(i*97)%108, lean=((i*37)%30-15)*(kind==='kelp'?.6:1), top=kind==='kelp'?4:6+((i*53)%40);
   const w=kind==='kelp'?9:3+(i%3);
   const g=x.createLinearGradient(0,128,0,top);
   g.addColorStop(0,'rgba(150,150,150,1)');g.addColorStop(1,'rgba(255,255,255,1)');
   x.fillStyle=g;
   x.beginPath();x.moveTo(bx-w,128);x.quadraticCurveTo(bx+lean*.4,70,bx+lean,top);x.quadraticCurveTo(bx+lean*.4+w*.4,70,bx+w,128);x.closePath();x.fill();
  }
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
 return t;
}

/** three crossed vertical quads, base at y=0, normals pointing up for soft foliage lighting */
function crossedQuadGeometry(w:number,h:number){
 const parts:T.BufferGeometry[]=[];
 for(let k=0;k<3;k++){
  const g=new T.PlaneGeometry(w,h,1,2);g.translate(0,h/2,0);g.rotateY(k*Math.PI/3);parts.push(g);
 }
 const merged=mergeGeometries(parts,false)!;
 parts.forEach(p=>p.dispose());
 const n=merged.getAttribute('normal') as T.BufferAttribute;
 for(let i=0;i<n.count;i++)n.setXYZ(i,0,1,0);
 return merged;
}

function trackSampleXZ(courseId:CourseId,n=300){
 const pts:{x:number;y:number;z:number;tx:number;tz:number}[]=[];
 for(let i=0;i<n;i++){
  const f=trackFrame(i/n,0,courseId);
  pts.push({x:f.position.x,y:f.position.y,z:f.position.z,tx:f.tangent.x,tz:f.tangent.z});
 }
 return pts;
}
function minTrackDist(samples:{x:number;z:number}[],x:number,z:number){
 let m=Infinity;
 for(const s of samples){const d=(s.x-x)*(s.x-x)+(s.z-z)*(s.z-z);if(d<m)m=d;}
 return Math.sqrt(m);
}

/** Thousands of instanced, wind-swept grass/kelp tufts and flowers hugging the terrain off the corridor. */
function buildFoliage(scene:T.Scene,courseId:CourseId,pal:WorldPalette,heightAt:(x:number,z:number)=>number,wind:{value:number},waterLevel:number|null){
 const samples=trackSampleXZ(courseId);
 const isKelp=courseId==='abyssal-trench';
 const tuftCount=Math.round(6500*pal.tuftDensity);
 const flowerCount=Math.round(tuftCount*pal.flowerDensity);
 const rnd=(()=>{let s=1337+courseId.length*97;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};})();
 const place=(n:number,minD:number,maxD:number)=>{
  const out:{x:number;y:number;z:number}[]=[];
  let guard=n*4;
  while(out.length<n&&guard-->0){
   const s=samples[(rnd()*samples.length)|0];
   const side=rnd()<.5?-1:1;
   const d=minD+Math.pow(rnd(),1.7)*(maxD-minD);
   const nx=s.tz,nz=-s.tx;
   const x=s.x+nx*side*d+(rnd()-.5)*6,z=s.z+nz*side*d+(rnd()-.5)*6;
   if(Math.abs(x)>330||Math.abs(z)>330) continue;
   if(minTrackDist(samples,x,z)<17.5) continue;
   const y=heightAt(x,z);
   if(waterLevel!==null&&y<waterLevel+.15) continue;
   out.push({x,y,z});
  }
  return out;
 };
 const dummy=new T.Object3D(),col=new T.Color();
 const meshes:T.InstancedMesh[]=[];
 const glow=isKelp?pal.grass[1]:pal.volcanic?'#ff5a12':pal.grass[1];
 const mk=(geo:T.BufferGeometry,tex:T.Texture,pts:{x:number;y:number;z:number}[],colors:string[],scale:number,emissive:number,sway:number,h:number)=>{
  const mat=new T.MeshStandardMaterial({map:tex,alphaTest:.45,side:T.DoubleSide,roughness:.8,metalness:0,emissive:emissive>0?glow:'#000000',emissiveIntensity:emissive});
  if(emissive>0) mat.emissiveMap=tex;
  addWindSway(mat,wind,sway,true,0,h);
  const im=new T.InstancedMesh(geo,mat,Math.max(1,pts.length));
  im.receiveShadow=true;im.castShadow=false;
  pts.forEach((p,i)=>{
   const s=scale*(.7+rnd()*.7);
   dummy.position.set(p.x,p.y-.05,p.z);dummy.rotation.set(0,rnd()*Math.PI*2,0);dummy.scale.set(s,s*(.8+rnd()*.5),s);
   dummy.updateMatrix();im.setMatrixAt(i,dummy.matrix);
   col.set(colors[(rnd()*colors.length)|0]).offsetHSL((rnd()-.5)*.03,(rnd()-.5)*.1,(rnd()-.5)*.12);
   im.setColorAt(i,col);
  });
  im.count=pts.length;
  im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
  im.computeBoundingSphere();
  scene.add(im);meshes.push(im);
 };
 const tuftH=isKelp?3.2:1.1;
 mk(crossedQuadGeometry(isKelp?1.4:1.3,tuftH),makeBladeTexture(isKelp?'kelp':'grass'),place(tuftCount,17.5,150),pal.grass,pal.tuftScale,pal.tuftEmissive,isKelp?.55:.16,tuftH);
 if(flowerCount>0) mk(crossedQuadGeometry(.7,.9),makeBladeTexture('flower'),place(flowerCount,18,110),pal.flowers,1,isKelp||pal.volcanic?.6:.08,.12,.9);
 return {count:tuftCount+flowerCount,meshes};
}

/** Stylised water (or lava) plane: procedural wave normals, fresnel sky reflection, sun glint, ice floes. */
function buildWater(scene:T.Scene,pal:WorldPalette,level:number){
 const w=pal.water!;
 const mat=new T.ShaderMaterial({
  fog:true,
  uniforms:{
   uTime:{value:0},
   uDeep:{value:new T.Color(w.deep)},uShallow:{value:new T.Color(w.shallow)},uSky:{value:new T.Color(w.sky)},
   uSun:{value:new T.Vector3(55,82,-24).normalize()},
   uLava:{value:w.lava?1:0},uIce:{value:w.ice?1:0},
   ...T.UniformsLib.fog,
  },
  vertexShader:`varying vec3 vWorld;
   #include <fog_pars_vertex>
   void main(){vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
   #include <fog_vertex>
   }`,
  fragmentShader:`uniform float uTime;uniform vec3 uDeep;uniform vec3 uShallow;uniform vec3 uSky;uniform vec3 uSun;uniform float uLava;uniform float uIce;
   varying vec3 vWorld;
   #include <fog_pars_fragment>
   float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
   vec2 wave(vec2 p,vec2 d,float f,float s,float a){float ph=dot(d,p)*f+uTime*s;return d*cos(ph)*a*f;}
   void main(){
    vec2 p=vWorld.xz;
    if(uLava>0.5){
     vec2 q=p*0.045+vec2(uTime*0.02,uTime*0.013);
     float n=noise(q*3.0)*0.55+noise(q*7.0+uTime*0.05)*0.3+noise(q*15.0)*0.15;
     float veins=smoothstep(0.42,0.58,n);
     vec3 crust=uDeep*0.35;
     vec3 hot=mix(uDeep*2.2,uShallow*2.6,smoothstep(0.55,0.85,n))*(0.85+0.15*sin(uTime*2.0+n*12.0));
     vec3 col=mix(crust,hot,veins);
     gl_FragColor=vec4(col,1.0);
    } else {
     vec2 g=vec2(0.0);
     g+=wave(p,normalize(vec2(1.0,0.3)),0.11,1.3,0.55);
     g+=wave(p,normalize(vec2(-0.4,1.0)),0.23,1.9,0.3);
     g+=wave(p,normalize(vec2(0.7,-0.8)),0.47,2.7,0.16);
     g+=wave(p,normalize(vec2(-0.9,-0.2)),0.93,3.6,0.08);
     g+=(vec2(noise(p*0.8+uTime*0.3),noise(p*0.8-uTime*0.27))-0.5)*0.35;
     vec3 N=normalize(vec3(-g.x,1.0,-g.y));
     vec3 V=normalize(cameraPosition-vWorld);
     float fres=0.03+0.97*pow(1.0-max(dot(N,V),0.0),5.0);
     float tint=0.35+0.3*noise(p*0.02)+0.2*noise(p*0.06);
     vec3 body=mix(uDeep,uShallow,tint);
     vec3 col=mix(body,uSky,clamp(fres*0.9,0.0,1.0));
     float spec=pow(max(dot(reflect(-V,N),uSun),0.0),220.0)*3.0+pow(max(dot(reflect(-V,N),uSun),0.0),30.0)*0.12;
     col+=vec3(1.0,0.95,0.85)*spec;
     if(uIce>0.5){
      float floe=smoothstep(0.62,0.66,noise(p*0.05)*0.7+noise(p*0.2)*0.3);
      col=mix(col,vec3(0.86,0.95,1.0),floe*0.9);
     }
     gl_FragColor=vec4(col,1.0);
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
   }`,
 });
 const mesh=new T.Mesh(new T.PlaneGeometry(900,900,1,1),mat);
 mesh.rotation.x=-Math.PI/2;mesh.position.y=level;
 mesh.receiveShadow=false;
 scene.add(mesh);
 return {mesh,update(time:number){mat.uniforms.uTime.value=time;}};
}

/** Grandstands with a cheering instanced crowd, waving course flags and string lights around the start. */
function buildStartFestival(scene:T.Scene,courseId:CourseId,pal:WorldPalette,heightAt:(x:number,z:number)=>number,wind:{value:number}){
 const def=courseById(courseId);
 const standMat=new T.MeshStandardMaterial({color:'#efe6da',roughness:.7});
 const seatMat=new T.MeshStandardMaterial({color:def.accent,roughness:.5,metalness:.1});
 const roofMat=new T.MeshPhysicalMaterial({color:pal.flags[1]??def.accent,roughness:.35,clearcoat:.6});
 const glowMat=new T.MeshBasicMaterial({color:def.accent});
 const steelMat=new T.MeshStandardMaterial({color:'#b8c0cc',metalness:.85,roughness:.3});
 const standBatches=new Map<T.Material,T.BufferGeometry[]>();
 const addBox=(m:T.Material,w:number,h:number,d:number,mtx:T.Matrix4,x:number,y:number,z:number)=>{
  const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);g.applyMatrix4(mtx);
  const list=standBatches.get(m)||[];list.push(g);standBatches.set(m,list);
 };
 const crowdSpots:{p:T.Vector3;yaw:number}[]=[];
 const placements=[{t:.012,side:1},{t:.012,side:-1},{t:.955,side:1}];
 for(const {t,side} of placements){
  const f=trackFrame(t,0,courseId);
  const raw=f.position.clone().addScaledVector(f.right,side*24);
  const safe=ensureOffTrackXZ(raw.x,raw.z,12,courseId);
  if(!safe.safe) continue;
  const ground=heightAt(safe.x,safe.z);
  const deck=Math.max(ground,f.position.y-1.5);
  if(deck-ground>32) continue; // track is a very high viaduct here; a stand would be a tower
  const yaw=Math.atan2(f.position.x-safe.x,f.position.z-safe.z);
  const mtx=new T.Matrix4().compose(new T.Vector3(safe.x,deck,safe.z),new T.Quaternion().setFromEuler(new T.Euler(0,yaw,0)),new T.Vector3(1,1,1));
  const W=24,tiers=5;
  if(deck-ground>.3){ for(const lx of [-W/2+1,0,W/2-1])for(const lz of [0,-tiers*2]) addBox(steelMat,.5,deck-ground+.5,.5,mtx,lx,-(deck-ground)/2,lz); }
  for(let k=0;k<tiers;k++){
   addBox(standMat,W,1.1*(k+1),2,mtx,0,1.1*(k+1)/2,-k*2);
   addBox(seatMat,W-.4,.18,.5,mtx,0,1.1*(k+1)+.09,-k*2+.55);
   for(let s=0;s<20;s++){
    const lx=-W/2+1.2+s*((W-2.4)/19)+(Math.sin(s*7.3+k)*.18);
    const v=new T.Vector3(lx,1.1*(k+1)+.1,-k*2+.15).applyMatrix4(mtx);
    crowdSpots.push({p:v,yaw});
   }
  }
  // roof canopy on two masts + glowing fascia strip
  addBox(steelMat,.35,8.5,.35,mtx,-W/2+.5,1.1*tiers+4.2,-tiers*2+.5);
  addBox(steelMat,.35,8.5,.35,mtx,W/2-.5,1.1*tiers+4.2,-tiers*2+.5);
  addBox(roofMat,W+1.5,.3,tiers*2+2.5,mtx,0,1.1*tiers+8.4,-tiers+.6);
  addBox(glowMat,W+1.5,.22,.12,mtx,0,1.1*tiers+8.1,1.9);
 }
 for(const [m,list] of standBatches){
  const merged=mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g),false);
  list.forEach(g=>g.dispose());
  if(!merged) continue;
  const mesh=new T.Mesh(merged,m);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
 }

 // Crowd: one instanced draw, bobbing/jumping in the vertex shader with per-fan phase
 const body=new T.CapsuleGeometry(.26,.42,3,8);body.translate(0,.48,0);
 const head=new T.SphereGeometry(.22,10,8);head.translate(0,1.06,0);
 const armL=new T.CapsuleGeometry(.07,.42,2,6);armL.rotateZ(.5);armL.translate(-.32,1.05,0);
 const armR=new T.CapsuleGeometry(.07,.42,2,6);armR.rotateZ(-.5);armR.translate(.32,1.05,0);
 const fanGeo=mergeGeometries([body,head,armL,armR].map(g=>g.toNonIndexed()),false)!;
 [body,head,armL,armR].forEach(g=>g.dispose());
 const fanMat=new T.MeshStandardMaterial({roughness:.6});
 fanMat.onBeforeCompile=shader=>{
  shader.uniforms.uWind=wind;
  shader.vertexShader='uniform float uWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   {
    float ph=fract(sin(dot(vec2(instanceMatrix[3][0],instanceMatrix[3][2]),vec2(12.9898,78.233)))*43758.5453)*6.2831;
    float hype=0.6+0.4*sin(uWind*0.35+ph*0.2);
    transformed.y+=abs(sin(uWind*5.5+ph))*0.28*hype;
    if(position.y>0.85&&abs(position.x)>0.2){transformed.y+=abs(sin(uWind*7.0+ph))*0.25;transformed.x*=1.0+0.25*sin(uWind*7.0+ph);}
   }`);
 };
 fanMat.customProgramCacheKey=()=>'kp-crowd';
 const crowd=new T.InstancedMesh(fanGeo,fanMat,Math.max(1,crowdSpots.length));
 const shirt=[...pal.flags,'#ffffff','#2b2f4a','#ffcf54','#5ad1ff','#ff6a6a'];
 const dummy=new T.Object3D(),col=new T.Color();
 crowdSpots.forEach((c,i)=>{
  dummy.position.copy(c.p);dummy.rotation.set(0,c.yaw+(Math.sin(i*3.1)*.3),0);const s=.9+((i*37)%10)/40;dummy.scale.setScalar(s);dummy.updateMatrix();
  crowd.setMatrixAt(i,dummy.matrix);
  col.set(shirt[(i*7+(i>>3))%shirt.length]);crowd.setColorAt(i,col);
 });
 crowd.count=crowdSpots.length;
 crowd.castShadow=true;crowd.receiveShadow=true;
 crowd.computeBoundingSphere();
 if(crowdSpots.length) scene.add(crowd);

 // Flags: poles + waving banners around the start straight and sparsely round the lap
 const zones:[number,number][]=[
  ...(def.tunnels??[]).map(z=>[z.startT-.01,z.endT+.01] as [number,number]),
  ...(def.bridges??[]).map(z=>[z.startT-.01,z.endT+.01] as [number,number]),
  ...(def.jumps??[]).map(j=>[j.t-j.rampLen-.01,j.t+j.gap+.012] as [number,number]),
  ...(def.loops??[]).map(l=>[l.centerT-l.halfWidth*1.8,l.centerT+l.halfWidth*1.8] as [number,number]),
  ...(def.obstacles??[]).map(o=>[o.t-.012,o.t+.012] as [number,number]),
 ];
 const blocked=(t:number)=>zones.some(([a,b])=>t>=a&&t<=b);
 const flagTs:number[]=[];
 for(let t=-.06;t<=.06;t+=.012){const u=def.kind==='sprint'?(t<0?.99+t*.15:t+.012):(t+1)%1;flagTs.push(u);}
 for(let t=.1;t<.92;t+=.045) flagTs.push(t);
 const polePts:{base:T.Vector3;top:T.Vector3;yaw:number;color:string}[]=[];
 flagTs.forEach((t,i)=>{
  for(const side of [-1,1]){
   if(t>.08&&t<.92&&(i+(side>0?1:0))%2) continue;
   if(blocked(t)) continue;
   const f=trackFrame(t,0,courseId);
   if(f.inLoop) continue;
   // poles stand on the road deck shoulder (outside the kart lanes, inside the deck edge) so they work
   // on viaducts as well as on the ground
   const base=worldPoint(t,side*71,0,courseId);
   const top=base.clone().addScaledVector(f.normal,6.5);
   polePts.push({base,top,yaw:Math.atan2(f.tangent.x,f.tangent.z),color:pal.flags[(i+(side>0?1:0))%pal.flags.length]});
  }
 });
 const poleGeo=new T.CylinderGeometry(.07,.09,1,6);poleGeo.translate(0,.5,0);
 const poles=new T.InstancedMesh(poleGeo,steelMat,Math.max(1,polePts.length));
 const bannerGeo=new T.PlaneGeometry(2.2,1.3,10,3);bannerGeo.translate(1.1,-.65,0);
 const bannerMat=new T.MeshStandardMaterial({side:T.DoubleSide,roughness:.65,emissive:'#ffffff',emissiveIntensity:.08});
 bannerMat.onBeforeCompile=shader=>{
  shader.uniforms.uWind=wind;
  shader.vertexShader='uniform float uWind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   {
    float ph=instanceMatrix[3][0]*0.13+instanceMatrix[3][2]*0.07;
    float k=position.x/2.2;
    transformed.z+=sin(position.x*2.6-uWind*7.0+ph)*0.22*k+sin(position.x*5.1-uWind*11.0+ph)*0.06*k;
    transformed.y+=sin(position.x*1.7-uWind*5.0+ph)*0.08*k;
   }`);
 };
 bannerMat.customProgramCacheKey=()=>'kp-banner';
 const banners=new T.InstancedMesh(bannerGeo,bannerMat,Math.max(1,polePts.length));
 polePts.forEach((pp,i)=>{
  dummy.position.copy(pp.base);dummy.rotation.set(0,0,0);dummy.scale.set(1,pp.top.distanceTo(pp.base),1);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);
  dummy.position.copy(pp.top);dummy.rotation.set(0,pp.yaw+Math.PI/2,0);dummy.scale.setScalar(1);dummy.updateMatrix();banners.setMatrixAt(i,dummy.matrix);
  col.set(pp.color);banners.setColorAt(i,col);
 });
 poles.count=banners.count=polePts.length;
 poles.castShadow=banners.castShadow=true;
 poles.computeBoundingSphere();banners.computeBoundingSphere();
 if(polePts.length){scene.add(poles);scene.add(banners);}

 // String lights between neighbouring start-area poles (bloom makes them sparkle)
 const bulbs:T.Vector3[]=[];
 const startPoles=polePts.filter(p=>p.base.distanceTo(trackFrame(0,0,courseId).position)<90);
 for(let i=0;i+2<startPoles.length;i++){
  const a=startPoles[i].top.clone().add(new T.Vector3(0,-.3,0)),b=startPoles[i+2].top.clone().add(new T.Vector3(0,-.3,0));
  if(a.distanceTo(b)>22) continue;
  for(let k=1;k<12;k++){const u=k/12;const p=a.clone().lerp(b,u);p.y-=Math.sin(u*Math.PI)*1.2;bulbs.push(p);}
 }
 const bulbMesh=new T.InstancedMesh(new T.SphereGeometry(.11,6,5),new T.MeshBasicMaterial({color:'#ffffff'}),Math.max(1,bulbs.length));
 const warm=['#ffd27a','#ff9a4a','#fff2c8',def.accent];
 bulbs.forEach((b,i)=>{dummy.position.copy(b);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();bulbMesh.setMatrixAt(i,dummy.matrix);col.set(warm[i%warm.length]).multiplyScalar(2.2);bulbMesh.setColorAt(i,col);});
 bulbMesh.count=bulbs.length;bulbMesh.computeBoundingSphere();
 if(bulbs.length) scene.add(bulbMesh);

 return {crowd:crowdSpots.length,flags:polePts.length,bulbs:bulbs.length};
}

/** Scenery for courses without a bespoke legacy builder (e.g. new sprint courses): boulders, spires, drifting motes. */
function buildGenericWorld(scene:T.Scene,courseId:CourseId,pal:WorldPalette,heightAt:(x:number,z:number)=>number){
 const def=courseById(courseId);
 const samples=trackSampleXZ(courseId,240);
 const rockGeo=new T.DodecahedronGeometry(1,1);
 const rp=rockGeo.getAttribute('position') as T.BufferAttribute;
 for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i);const k=1+Math.sin(x*3.1+z*2.3)*.12;rp.setXYZ(i,x*k,y*k*.75,z*k);}
 rockGeo.computeVertexNormals();
 const rocks=new T.InstancedMesh(rockGeo,new T.MeshStandardMaterial({color:pal.rock,roughness:.85,flatShading:true}),140);
 const spireGeo=new T.ConeGeometry(1,1,5);spireGeo.translate(0,.5,0);
 const spireMat=new T.MeshPhysicalMaterial({color:pal.volcanic?'#2a1a16':def.accent,roughness:.2,clearcoat:1,emissive:pal.volcanic?'#ff5a12':def.accent,emissiveIntensity:pal.volcanic?.35:.25,flatShading:true});
 const spires=new T.InstancedMesh(spireGeo,spireMat,48);
 const dummy=new T.Object3D();
 let r=0,sp=0;
 for(let i=0;i<400&&(r<140||sp<48);i++){
  const a=i*2.39996,rad=30+(i%17)*16;
  const x=Math.cos(a)*rad,z=Math.sin(a)*rad;
  if(minTrackDist(samples,x,z)<20) continue;
  const y=heightAt(x,z);
  if(r<140&&i%3!==0){
   const s=1.2+((i*31)%10)/2.5;
   dummy.position.set(x,y+s*.25,z);dummy.rotation.set(i,i*1.7,i*.3);dummy.scale.setScalar(s);dummy.updateMatrix();rocks.setMatrixAt(r++,dummy.matrix);
  } else if(sp<48){
   const h=6+((i*13)%12);
   dummy.position.set(x,y-.5,z);dummy.rotation.set((i%5-2)*.06,i,(i%3-1)*.08);dummy.scale.set(1.2+(i%4)*.4,h,1.2+(i%4)*.4);dummy.updateMatrix();spires.setMatrixAt(sp++,dummy.matrix);
  }
 }
 rocks.count=r;spires.count=sp;
 rocks.castShadow=rocks.receiveShadow=spires.castShadow=true;
 rocks.computeBoundingSphere();spires.computeBoundingSphere();
 scene.add(rocks,spires);
 // drifting embers / motes
 const n=600;const pos=new Float32Array(n*3);
 for(let i=0;i<n;i++){pos[i*3]=(Math.sin(i*12.9)*.5)*320;pos[i*3+1]=Math.abs(Math.sin(i*3.7))*40-6;pos[i*3+2]=(Math.cos(i*7.3)*.5)*320;}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));
 const m=new T.PointsMaterial({color:pal.volcanic?'#ff8a2a':'#ffffff',size:pal.volcanic?.35:.25,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false});
 const motes=new T.Points(g,m);scene.add(motes);
 return {
  update(dt:number,time:number){
   const arr=(g.getAttribute('position') as T.BufferAttribute).array as Float32Array;
   for(let i=0;i<n;i++){arr[i*3+1]+=dt*(pal.volcanic?2.2:.6);arr[i*3]+=Math.sin(time+i)*dt*.8;if(arr[i*3+1]>40)arr[i*3+1]=-6;}
   (g.getAttribute('position') as T.BufferAttribute).needsUpdate=true;
  },
  stats:{islands:0,kartDesigns:10,waterfalls:0,skyIslands:0,rocks:r,spires:sp},
 };
}

// ---------------------------------------------------------------------------------------------
// Mountain worlds (point-to-point descents such as Ember Ridge Run)
// ---------------------------------------------------------------------------------------------

function isMountainWorld(courseId:CourseId){
 if(KNOWN_WORLDS.includes(courseId)) return false;
 let lo=Infinity,hi=-Infinity;
 for(let i=0;i<=40;i++){const y=trackFrame(i/40*.999,0,courseId).position.y;lo=Math.min(lo,y);hi=Math.max(hi,y);}
 return hi-lo>30;
}

interface Channel {a:T.Vector2;b:T.Vector2;bedY:number;t:number}
const mountainCache=new Map<CourseId,ReturnType<typeof buildMountainModel>>();
function mountainModel(courseId:CourseId){
 let m=mountainCache.get(courseId);
 if(!m){m=buildMountainModel(courseId);mountainCache.set(courseId,m);}
 return m;
}

function buildMountainModel(courseId:CourseId){
 const def=courseById(courseId);
 const N=320;
 const deepRanges:[number,number][]=[
  ...(def.bridges??[]).map(b=>[b.startT,b.endT] as [number,number]),
  ...(def.jumps??[]).filter(j=>j.gap>0).map(j=>[j.t,j.t+j.gap] as [number,number]),
 ];
 const S:{x:number;z:number;y:number;edgeY:number;deep:boolean}[]=[];
 for(let i=0;i<N;i++){
  const t=i/(N-1)*.999;
  const c=worldPoint(t,0,0,courseId),l=worldPoint(t,-74,0,courseId),r=worldPoint(t,74,0,courseId);
  const deep=deepRanges.some(([a,b])=>t>=a-.006&&t<=b+.006);
  S.push({x:c.x,z:c.z,y:c.y,edgeY:Math.min(c.y,l.y,r.y),deep});
 }
 const minEdge=Math.min(...S.map(s=>s.edgeY));
 const seaLevel=Math.min(courseById(courseId).id==='ember-ridge'?1:worldPalette(courseId).water?.level??1,minEdge-3);
 // Lava channels cut across every chasm (perpendicular to the road), bed well below the deck
 const channels:Channel[]=deepRanges.map(([a,b])=>{
  const tc=(a+b)/2;
  const f=trackFrame(tc,0,courseId);
  const rx=f.right.x,rz=f.right.z,len=Math.hypot(rx,rz)||1;
  const p=f.position;
  return {a:new T.Vector2(p.x-rx/len*150,p.z-rz/len*150),b:new T.Vector2(p.x+rx/len*150,p.z+rz/len*150),bedY:p.y-15,t:tc};
 });
 // Crater behind the start line
 const s0=trackFrame(0,0,courseId);
 const craterC=new T.Vector2(s0.position.x-s0.tangent.x*70,s0.position.z-s0.tangent.z*70);
 const craterTop=s0.position.y+9;
 const segDist=(px:number,pz:number,c:Channel)=>{
  const abx=c.b.x-c.a.x,abz=c.b.y-c.a.y;
  const u=T.MathUtils.clamp(((px-c.a.x)*abx+(pz-c.a.y)*abz)/(abx*abx+abz*abz),0,1);
  return Math.hypot(px-(c.a.x+abx*u),pz-(c.a.y+abz*u));
 };
 const crater=(x:number,z:number)=>{
  const d=Math.hypot(x-craterC.x,z-craterC.y);
  if(d>95) return null;
  // rim at r=48, bowl down to craterTop-18 at the centre
  const rim=craterTop-Math.pow(Math.abs(d-48)/47,1.6)*26;
  const bowl=craterTop-18+Math.pow(d/48,2)*18;
  return d<48?Math.min(rim,bowl):rim;
 };
 function height(x:number,z:number){
  let minD=Infinity,edgeY=0,deep=false,wy=0,ws=0;
  for(const s of S){
   const d2=(x-s.x)*(x-s.x)+(z-s.z)*(z-s.z);
   if(d2<minD){minD=d2;edgeY=s.edgeY;deep=s.deep;}
   const w=1/(d2+900);
   wy+=w*s.y;ws+=w;
  }
  minD=Math.sqrt(minD);
  const idw=wy/ws;
  const hill=Math.sin(x*0.031)*Math.cos(z*0.027)*5+Math.sin(x*0.08+1.3)*Math.sin(z*0.07)*2.2+Math.sin(x*.19)*Math.cos(z*.17)*.7;
  let natural=idw-1.5+hill*(.4+Math.min(1,minD/80)*.6)-Math.max(0,minD-28)*.13;
  const cr=crater(x,z);
  if(cr!==null){const d=Math.hypot(x-craterC.x,z-craterC.y);const k=T.MathUtils.smoothstep(95-d,0,30);natural=natural*(1-k)+Math.max(natural,cr)*k;if(d<48)natural=Math.min(natural,cr);}
  // carve lava channels
  for(const c of channels){
   const d=segDist(x,z,c);
   if(d<18){const bed=c.bedY+Math.pow(Math.max(0,d-6.5)/11.5,2)*14;natural=Math.min(natural,bed);}
  }
  const under=deep?edgeY-16:edgeY-1.15;
  const blend=T.MathUtils.clamp((minD-14)/(deep?36:22),0,1);
  return under*(1-blend)+natural*blend;
 }
 return {height,seaLevel,channels,craterC,craterTop,samples:S};
}

const LAVA_FRAG=`uniform float uTime;uniform float uRibbon;varying vec2 vUv;varying vec3 vWorld;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 #include <fog_pars_fragment>
 void main(){
  vec2 q=uRibbon>0.5?vec2(vUv.x*1.6,vUv.y*0.12-uTime*0.35):vWorld.xz*0.06+vec2(uTime*0.03,uTime*0.02);
  float n=noise(q*3.0)*0.55+noise(q*7.0+uTime*0.08)*0.3+noise(q*15.0)*0.15;
  float crust=smoothstep(0.5,0.62,n);
  float edge=uRibbon>0.5?smoothstep(0.0,0.18,vUv.x)*smoothstep(1.0,0.82,vUv.x):1.0;
  vec3 hot=mix(vec3(1.9,0.35,0.04),vec3(3.2,1.5,0.35),smoothstep(0.2,0.5,n))*(0.85+0.15*sin(uTime*2.3+n*10.0));
  vec3 col=mix(hot,vec3(0.07,0.03,0.03),crust*0.85);
  col=mix(vec3(0.05,0.03,0.03),col,edge);
  gl_FragColor=vec4(col,1.0);
  #include <fog_fragment>
 }`;
function makeLavaMaterial(ribbon:boolean,time:{value:number}){
 return new T.ShaderMaterial({
  fog:true,side:T.DoubleSide,
  uniforms:{uTime:time,uRibbon:{value:ribbon?1:0},...T.UniformsLib.fog},
  vertexShader:`varying vec2 vUv;varying vec3 vWorld;
   #include <fog_pars_vertex>
   void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
   #include <fog_vertex>
   }`,
  fragmentShader:LAVA_FRAG,
 });
}

/** Ember Ridge: crater lava lake, lava rivers and chasm flows, basalt column clusters, smoking vents, falling ash. */
function buildEmberWorld(scene:T.Scene,courseId:CourseId,heightAt:(x:number,z:number)=>number){
 const M=mountainModel(courseId);
 const time={value:0};
 const samples=trackSampleXZ(courseId,260);
 const ribbonMat=makeLavaMaterial(true,time),poolMat=makeLavaMaterial(false,time);
 // ribbons: a list of polyline points (x,z) draped on the terrain (or held flat at y)
 const ribbon=(pts:{x:number;z:number;y?:number}[],width:number)=>{
  if(pts.length<2) return;
  const P:number[]=[],UV:number[]=[],I:number[]=[];
  let acc=0;
  for(let i=0;i<pts.length;i++){
   const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
   let dx=b.x-a.x,dz=b.z-a.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
   const nx=-dz,nz=dx;
   if(i>0) acc+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);
   for(const side of [-1,1]){
    const x=pts[i].x+nx*side*width/2,z=pts[i].z+nz*side*width/2;
    const y=pts[i].y!==undefined?pts[i].y!:heightAt(x,z)+.3;
    P.push(x,y,z);UV.push(side<0?0:1,acc);
   }
   if(i<pts.length-1){const j=i*2;I.push(j,j+2,j+1,j+1,j+2,j+3);}
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('uv',new T.Float32BufferAttribute(UV,2));g.setIndex(I);
  const mesh=new T.Mesh(g,ribbonMat);scene.add(mesh);
 };
 // 1. lava rivers alongside the descent (break wherever they would approach any part of the road)
 const flows:[number,number,number][]=[[.03,.27,1],[.33,.52,-1],[.64,.77,1],[.82,.97,-1]];
 for(const [a,b,side] of flows){
  let run:{x:number;z:number}[]=[];
  for(let t=a;t<=b;t+=.004){
   const f=trackFrame(t,0,courseId);
   const off=40+Math.sin(t*40)*6;
   const x=f.position.x+f.right.x*side*off,z=f.position.z+f.right.z*side*off;
   const len=Math.hypot(f.right.x,f.right.z)||1;void len;
   if(minTrackDist(samples,x,z)<26||Math.abs(x)>330||Math.abs(z)>330){ribbon(run,5.5);run=[];continue;}
   run.push({x,z});
  }
  ribbon(run,5.5);
 }
 // 2. lava streams along each carved chasm channel (flat at the bed)
 for(const c of M.channels){
  const pts:{x:number;z:number;y:number}[]=[];
  for(let k=0;k<=60;k++){
   const u=k/60;const x=c.a.x+(c.b.x-c.a.x)*u,z=c.a.y+(c.b.y-c.a.y)*u;
   if(heightAt(x,z)<c.bedY-.5) continue;
   pts.push({x,z,y:c.bedY+.45});
  }
  ribbon(pts,11);
 }
 // 3. crater lava lake + scattered pools (draped discs)
 const pool=(cx:number,cz:number,r:number,y?:number)=>{
  const g=new T.CircleGeometry(r,40,0,Math.PI*2);g.rotateX(-Math.PI/2);
  const p=g.getAttribute('position') as T.BufferAttribute;
  for(let i=0;i<p.count;i++){const x=p.getX(i)+cx,z=p.getZ(i)+cz;p.setXYZ(i,x,y!==undefined?y:heightAt(x,z)+.25,z);}
  const m=new T.Mesh(g,poolMat);scene.add(m);
 };
 pool(M.craterC.x,M.craterC.y,34,M.craterTop-15);
 let pools=0;
 for(let i=0;i<120&&pools<6;i++){
  const a=i*2.39996,rad=60+(i%13)*20;
  const x=Math.cos(a)*rad,z=Math.sin(a)*rad;
  if(Math.abs(x)>300||Math.abs(z)>300||minTrackDist(samples,x,z)<34) continue;
  const h=heightAt(x,z);
  if(h<M.seaLevel+3) continue;
  const slope=Math.abs(heightAt(x+4,z)-heightAt(x-4,z))+Math.abs(heightAt(x,z+4)-heightAt(x,z-4));
  if(slope>2.2) continue;
  pool(x,z,5+(i%4)*2.2);pools++;
 }
 // 4. basalt column clusters (hex prisms, one instanced draw)
 const colGeo=new T.CylinderGeometry(1,1,1,6);colGeo.translate(0,.5,0);
 const basaltMat=new T.MeshStandardMaterial({color:'#2a2527',roughness:.82,metalness:.05,flatShading:true});
 const cols=new T.InstancedMesh(colGeo,basaltMat,520);
 const dummy=new T.Object3D();
 let n=0;
 for(let c=0;c<70&&n<500;c++){
  const a=c*2.39996+.7,rad=34+(c%19)*14;
  const cx=Math.cos(a)*rad+(c%3)*12,cz=Math.sin(a)*rad;
  if(Math.abs(cx)>320||Math.abs(cz)>320||minTrackDist(samples,cx,cz)<24) continue;
  const g0=heightAt(cx,cz);
  if(g0<M.seaLevel-1) continue;
  const k=6+(c%7);
  for(let j=0;j<k&&n<520;j++){
   const ang=j*1.05,rr=j===0?0:1.7+(j%3)*.5;
   const x=cx+Math.cos(ang)*rr,z=cz+Math.sin(ang)*rr;
   if(minTrackDist(samples,x,z)<20) continue;
   const h=2+((c*7+j*13)%9)*.9*(j===0?1.4:1);
   dummy.position.set(x,heightAt(x,z)-.6,z);dummy.rotation.set(0,(c+j)*.4,0);dummy.scale.set(.85,h,.85);dummy.updateMatrix();
   cols.setMatrixAt(n++,dummy.matrix);
  }
 }
 cols.count=n;cols.castShadow=cols.receiveShadow=true;cols.computeBoundingSphere();scene.add(cols);
 // 5. smoking vents: rock cones with an ember throat + rising smoke plumes
 const vents:T.Vector3[]=[];
 for(let i=0;i<200&&vents.length<9;i++){
  const a=i*1.913,rad=50+(i%11)*22;
  const x=Math.cos(a)*rad,z=Math.sin(a)*rad;
  if(Math.abs(x)>300||Math.abs(z)>300||minTrackDist(samples,x,z)<28) continue;
  const y=heightAt(x,z);if(y<M.seaLevel+4) continue;
  vents.push(new T.Vector3(x,y,z));
 }
 vents.push(new T.Vector3(M.craterC.x,M.craterTop-14,M.craterC.y));
 const coneGeo=new T.ConeGeometry(5,4.5,9,1,true);coneGeo.translate(0,2,0);
 const cones=new T.InstancedMesh(coneGeo,new T.MeshStandardMaterial({color:'#3a2c2a',roughness:.9,flatShading:true,side:T.DoubleSide}),vents.length);
 const throats=new T.InstancedMesh(new T.CircleGeometry(1.6,12).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:new T.Color('#ff7a1a').multiplyScalar(2.5)}),vents.length);
 vents.forEach((v,i)=>{
  dummy.position.copy(v).add(new T.Vector3(0,-.5,0));dummy.rotation.set(0,i,0);dummy.scale.setScalar(i===vents.length-1?0:1);dummy.updateMatrix();cones.setMatrixAt(i,dummy.matrix);
  dummy.position.copy(v).add(new T.Vector3(0,3.4,0));dummy.updateMatrix();throats.setMatrixAt(i,dummy.matrix);
 });
 cones.computeBoundingSphere();throats.computeBoundingSphere();scene.add(cones,throats);
 const PER=46,plumeN=PER*vents.length;
 const ppos=new Float32Array(plumeN*3),page=new Float32Array(plumeN);
 for(let i=0;i<plumeN;i++){page[i]=(i%PER)/PER*6;}
 const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(ppos,3));
 const puff=document.createElement('canvas');puff.width=puff.height=64;
 {const x=puff.getContext('2d')!;const gr=x.createRadialGradient(32,32,2,32,32,30);gr.addColorStop(0,'rgba(255,255,255,.8)');gr.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gr;x.fillRect(0,0,64,64);}
 const puffTex=new T.CanvasTexture(puff);
 const plumeMat=new T.PointsMaterial({map:puffTex,color:'#5c5052',size:9,sizeAttenuation:true,transparent:true,opacity:.42,depthWrite:false});
 const plumes=new T.Points(pg,plumeMat);plumes.frustumCulled=false;scene.add(plumes);
 // 6. falling ash + rising embers
 const ashN=1400;const apos=new Float32Array(ashN*3);
 for(let i=0;i<ashN;i++){apos[i*3]=Math.sin(i*12.9898)*330;apos[i*3+1]=Math.abs(Math.sin(i*3.7))*95;apos[i*3+2]=Math.cos(i*7.233)*330;}
 const ag=new T.BufferGeometry();ag.setAttribute('position',new T.BufferAttribute(apos,3));
 const ash=new T.Points(ag,new T.PointsMaterial({color:'#bdb3ae',size:.32,transparent:true,opacity:.75,depthWrite:false}));ash.frustumCulled=false;scene.add(ash);
 const emN=500;const epos=new Float32Array(emN*3);
 for(let i=0;i<emN;i++){epos[i*3]=Math.sin(i*4.1)*300;epos[i*3+1]=Math.abs(Math.cos(i*1.7))*80;epos[i*3+2]=Math.cos(i*2.9)*300;}
 const eg=new T.BufferGeometry();eg.setAttribute('position',new T.BufferAttribute(epos,3));
 const embers=new T.Points(eg,new T.PointsMaterial({color:new T.Color('#ff8a2a').multiplyScalar(2),size:.4,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false}));embers.frustumCulled=false;scene.add(embers);
 return {
  update(dt:number,t:number){
   time.value=t;
   for(let i=0;i<plumeN;i++){
    page[i]+=dt;if(page[i]>6)page[i]-=6;
    const v=vents[(i/PER)|0],a=page[i];
    ppos[i*3]=v.x+Math.sin(i*1.7+a*.8)*(.6+a*.9)+a*1.4;ppos[i*3+1]=v.y+3.5+a*4.2;ppos[i*3+2]=v.z+Math.cos(i*2.3+a*.7)*(.6+a*.9);
   }
   (pg.getAttribute('position') as T.BufferAttribute).needsUpdate=true;
   for(let i=0;i<ashN;i++){apos[i*3+1]-=dt*(1.1+(i%5)*.3);apos[i*3]+=Math.sin(t*.7+i)*dt*.9;if(apos[i*3+1]<-4)apos[i*3+1]=95;}
   (ag.getAttribute('position') as T.BufferAttribute).needsUpdate=true;
   for(let i=0;i<emN;i++){epos[i*3+1]+=dt*(2+(i%4)*.6);epos[i*3]+=Math.sin(t*2+i)*dt*.7;if(epos[i*3+1]>85)epos[i*3+1]=0;}
   (eg.getAttribute('position') as T.BufferAttribute).needsUpdate=true;
  },
  stats:{islands:0,kartDesigns:10,waterfalls:0,skyIslands:0,basalt:n,vents:vents.length,lavaPools:pools+1},
 };
}

/** Crestfall's hillsides: the same scatter as the instanced hill forest, but as sculpted sakura. */
function sakuraHills(forest:KitForest,courseId:CourseId,heightAt:(x:number,z:number)=>number){
 for(let i=0;i<190;i++){
  const a=i*2.39996, rad=45+(i%11)*22;
  const safe=ensureOffTrackXZ(Math.cos(a)*rad,Math.sin(a)*rad,6.5,courseId);
  forest.add(safe.x,heightAt(safe.x,safe.z)-.3,safe.z,.85+(i%5)*.16,i);
 }
}

/** Scenery for every Kith Circuit course: terrain, wind-swept forest + foliage, water/lava, festival start, bespoke set pieces. */
export function makeGardenWorld(
 scene:T.Scene,
 point:(t:number,lane?:number,offset?:number)=>T.Vector3,
 courseId:CourseId='crestfall-gardens'
){
 const wind={value:0};
 const pal=worldPalette(courseId);
 const terrain=buildSculptedValleyTerrain(scene,courseId);
 const mountain=isMountainWorld(courseId);
 const kit=buildKitScenery(scene,courseId,terrain.heightAt,{mountain});
 const base=KNOWN_WORLDS.includes(courseId)?makeLegacyWorld(scene,point,courseId,courseId==='crestfall-gardens'?kit.forest:undefined)
  :courseId==='ember-ridge'||(mountain&&pal.volcanic)?buildEmberWorld(scene,courseId,terrain.heightAt)
  :buildGenericWorld(scene,courseId,pal,terrain.heightAt);
 let minTrackY=Infinity;
 for(let i=0;i<200;i++) minTrackY=Math.min(minTrackY,trackFrame(i/200*.999,0,courseId).position.y);
 // mountain worlds get a sea at the bottom of the descent; bowl worlds keep water well under the road
 const waterLevel=mountain?mountainModel(courseId).seaLevel:pal.water?Math.min(pal.water.level,minTrackY-6):null;
 if(mountain&&pal.water?.lava) pal.water={deep:'#0a2230',shallow:'#2f7f8f',sky:courseById(courseId).skyHorizon,level:waterLevel!};
 const water=pal.water&&waterLevel!==null?buildWater(scene,pal,waterLevel):null;
 const foliage=buildFoliage(scene,courseId,pal,terrain.heightAt,wind,waterLevel);
 const fest=buildStartFestival(scene,courseId,pal,terrain.heightAt,wind);
 if(courseId==='crestfall-gardens') sakuraHills(kit.forest,courseId,terrain.heightAt);
 else buildInstancedHillForest(scene,courseId,terrain.heightAt,wind);
 kit.flushForest();
 return {
  update(dt:number,time:number){
   wind.value=time;
   base.update(dt,time);
   kit.update(dt,time);
   water?.update(time);
  },
  heightAt:terrain.heightAt,
  stats:{...base.stats,...kit.stats,foliage:foliage.count,crowd:fest.crowd,flags:fest.flags,water:water?(pal.water!.lava?'lava':'water'):'none'},
 };
}
