import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {crestGeometry} from './karts3d';

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

/** Batched solid scenery + Blender hero monuments matching the Kith Party concept art. */
export function makeGardenWorld(scene:T.Scene,point:(t:number,lane?:number)=>T.Vector3){
 const surface=document.createElement('canvas');surface.width=surface.height=128;
 const surfaceCtx=surface.getContext('2d')!;surfaceCtx.fillStyle='#b8b8b8';surfaceCtx.fillRect(0,0,128,128);
 for(let i=0;i<1800;i++){const value=110+(i*37)%115;surfaceCtx.fillStyle=`rgb(${value},${value},${value})`;surfaceCtx.fillRect((i*43)%128,(i*79+Math.floor(i/128)*13)%128,1+i%3,1+i%4);}
 const grain=new T.CanvasTexture(surface);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(4,4);
 const batches=new Map<T.Material,T.BufferGeometry[]>(),palette=new Map<string,T.MeshStandardMaterial>();
 const material=(color:string,glow=0)=>{const key=color+glow;if(!palette.has(key))palette.set(key,new T.MeshStandardMaterial({color,roughness:glow?.35:.68,metalness:glow?.22:.08,emissive:color,emissiveIntensity:glow,bumpMap:grain,bumpScale:.06}));return palette.get(key)!;};
 /** Faceted gem material for crystals & monuments: mirror-smooth, glowing, catches the sky env. */
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
 const stem=(a:T.Vector3,b:T.Vector3,r:number,color:string)=>{
  const d=b.clone().sub(a);shape(new T.CylinderGeometry(r*.72,r,d.length(),7),material(color),a.clone().add(b).multiplyScalar(.5),vec(1,1,1),new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(vec(0,1,0),d.normalize())));
 };

 // Lush Cherry Blossom Trees with gnarled dark-plum trunks and layered pink blossom clouds
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

 // Central sanctuary island and outer ring of mountain islands
 island(0,0,22,-4,3,true);
 for(let i=0;i<14;i++){
  const a=i*Math.PI*2/14,r=96+(i%3)*15;
  island(Math.cos(a)*r,Math.sin(a)*r,13+i%4*3,2+(i%4)*7,i,i%2===0);
 }
 for(let i=0;i<11;i++){
  const a=i*Math.PI*2/11+.2,r=172+i%3*16;
  island(Math.cos(a)*r,Math.sin(a)*r,11+i%3*4,28+i%4*7,i,true);
 }

 // Craggy Stepped Floating Sky Mesas suspended in midair with cascading waterfalls & crystals (Concept Art)
 const skyIslands=[
  {x:58,y:34,z:-18,r:9.5},  // Right-center vista above opening turn
  {x:22,y:38,z:-78,r:8.5},  // Left-front vista above sanctuary cliff
  {x:82,y:40,z:18,r:10.5},  // Far right vista
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
  // Procedural stepped mesa rock strata (replaced/augmented by Blender FloatingMesa)
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

 // Distant lavender-purple mountain peaks framing the horizon
 for(let i=0;i<26;i++){
  const a=i*Math.PI*2/26,r=242,h=36+(i*13)%48;
  shape(new T.ConeGeometry(22+i%4*4,h,6),material(i%2?'#b9a4cf':'#9d8cbe'),vec(Math.cos(a)*r,h/2-10,Math.sin(a)*r),vec(1,1,1),new T.Euler(0,i*.7,.08));
 }

 // ============================================================================
 // CONCEPT ART BALUSTRADE GUARDRAILS WITH GLOWING AMBER TRIANGULAR CUTOUTS (▲ ▼)
 // ============================================================================
 const triUpGeo=new T.ConeGeometry(.24,.36,3);triUpGeo.rotateY(Math.PI/2);
 const triDownGeo=new T.ConeGeometry(.24,.36,3);triDownGeo.rotateY(Math.PI/2);triDownGeo.rotateZ(Math.PI);
 const amberGlowMat=crystal('#ff9419',1.35);

 for(const side of [-1,1]){
  // Upper carved cream-stone coping rail
  const upperCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67).add(vec(0,1.08,0))),true);
  shape(new T.TubeGeometry(upperCurve,320,.18,6,true),material('#efe2d0'),vec(0,0,0));
  // Middle dark-plum recessed frieze channel (houses the glowing triangles)
  const midCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67.5).add(vec(0,.62,0))),true);
  shape(new T.TubeGeometry(midCurve,320,.26,6,true),material('#3c2d4d'),vec(0,0,0));
  // Lower carved stone plinth base
  const lowerCurve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*67).add(vec(0,.22,0))),true);
  shape(new T.TubeGeometry(lowerCurve,320,.24,6,true),material('#a995b5'),vec(0,0,0));

  // Alternating glowing amber triangular crystal cutouts (▲ ▼ ▲ ▼) + stone pilasters
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

 // ============================================================================
 // ROADSIDE LUSH FLOWER GARDENS, GOLDEN LOTUS STREETLAMPS & ROYAL BANNERS
 // ============================================================================
 for(let i=0;i<60;i++){
  const t=i/60,side=i%2?1:-1;
  const p=point(t,side*88),q=point(t+.001),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);

  // Lush green foliage mounds and pink flower bushes spilling over the balustrade edge
  const bushEdge=point(t,side*74);
  ell(bushEdge.x,bushEdge.y+.35,bushEdge.z,1.8,.85,1.6,'#6f995c');
  for(let k=0;k<4;k++){
   const a=k*1.6+i;
   ell(bushEdge.x+Math.cos(a)*.9,bushEdge.y+.65,bushEdge.z+Math.sin(a)*.9,.52,.42,.52,k%2?'#f47ab7':'#ffb8de',.35);
  }

  // Overhanging cherry blossom trees framing the road (leaning inward over the guardrails like the concept art)
  if(i%2===0){
   const treePos=point(t,side*92);
   const inwardX=-Math.cos(yaw)*side*.45;
   const inwardZ=Math.sin(yaw)*side*.45;
   tree(treePos.x,treePos.y-.2,treePos.z,1.35,i,inwardX,inwardZ);
  }

  // Golden Lotus-Bud Streetlamps mounted on carved stone posts along the balustrade
  const lampBase=point(t,side*69.5);
  stem(lampBase,lampBase.clone().add(vec(0,2.65,0)),.09,'#d8c7b4');
  shape(new T.CylinderGeometry(.26,.16,.22,8),material('#e8b948',.3),lampBase.clone().add(vec(0,2.65,0)));
  shape(crestGeometry(),crystal('#ffcf54',1.4),lampBase.clone().add(vec(0,2.82,0)),vec(.48,.52,.88),new T.Euler(0,yaw,0));

  // Royal-Purple & Gold Ceremonial Pennant Banners (Concept Art)
  if(i%3===0){
   const bannerPos=point(t,side*78);
   stem(bannerPos,bannerPos.clone().add(vec(0,6.2,0)),.11,'#efe2cf');
   // Crossbar finial
   shape(new T.BoxGeometry(1.75,.14,.14),material('#f0be42',.25),bannerPos.clone().add(vec(0,5.85,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   // Royal purple banner cloth with gold trim and glowing emblem
   shape(new T.BoxGeometry(1.48,2.65,.08),material('#541675',.15),bannerPos.clone().add(vec(0,4.45,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   shape(new T.BoxGeometry(1.56,2.75,.05),material('#eab63e',.35),bannerPos.clone().add(vec(0,4.45,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   shape(crestGeometry(),crystal('#ffbe3b',1.1),bannerPos.clone().add(vec(0,4.3,0)),vec(.68,.65,.45),new T.Euler(0,yaw,0));
  }
 }

 // ============================================================================
 // SWEPT FACETED ORANGE-TO-MAGENTA CRYSTAL MONOLITH FINS ALONG THE TRACK
 // ============================================================================
 const monolithProgress=[.04,.095,.16,.25,.35,.48,.60,.74,.88];
 const monolithAnchors:{group:T.Group;side:number}[]=[];
 for(const t of monolithProgress)for(const side of [-1,1]){
  const p=point(t,side*108),q=point(t+.001),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  const anchor=new T.Group();
  anchor.position.copy(p);
  anchor.rotation.y=yaw;
  scene.add(anchor);
  monolithAnchors.push({group:anchor,side});

  // Procedural faceted monolith cluster
  shape(crestGeometry(),crystal(side>0?'#ff8000':'#e62e8a',1.1),p,vec(4.8,side>0?7.2:5.8,3.8),new T.Euler(0,yaw,-side*.22));
  shape(crestGeometry(),material('#f7ead9'),p.clone().add(vec(0,-.2,0)),vec(5.4,2.1,4.6),new T.Euler(0,yaw,-side*.18));
  shape(crestGeometry(),crystal('#ffbf36',1.15),p.clone().add(vec(side*2.4,.8,.8)),vec(3.0,4.4,2.6),new T.Euler(0,yaw+side*.35,-side*.14));
 }

 // ============================================================================
 // MULTI-TIERED ROMANESQUE STONE VIADUCT BRIDGES WITH WATERFALLS (CONCEPT ART)
 // ============================================================================
 // 1. Vista Viaduct Bridge spanning across the valley behind the first turn (visible right in front of the player!)
 const vistaStart=vec(42,6,-82), vistaEnd=vec(112,10,24);
 const vistaSpans=9;
 for(let i=0;i<=vistaSpans;i++){
  const u=i/vistaSpans;
  const px=vistaStart.x+(vistaEnd.x-vistaStart.x)*u;
  const py=vistaStart.y+(vistaEnd.y-vistaStart.y)*u;
  const pz=vistaStart.z+(vistaEnd.z-vistaStart.z)*u;
  const bridgeYaw=Math.atan2(vistaEnd.x-vistaStart.x,vistaEnd.z-vistaStart.z);
  // Tall stone pier column
  shape(new T.BoxGeometry(3.2,26,3.6),material('#dfd0be'),vec(px,py-4,pz),vec(1,1,1),new T.Euler(0,bridgeYaw,0));
  // Upper and lower arch rings + waterfalls pouring through the arches
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

 // 2. Under-track Double-Deck Stone Viaduct Arches supporting the circuit
 for(let i=0;i<24;i++){
  const p=point(i/24),q=point(i/24+.001),yaw=Math.atan2(q.x-p.x,q.z-p.z);
  shape(new T.TorusGeometry(8.5,1.1,6,22,Math.PI),material('#cbb9cc'),p.clone().add(vec(0,-9.5,0)),vec(1,1,1),new T.Euler(0,yaw,0));
  if(i%2===0){
   shape(new T.TorusGeometry(14,1.8,6,24,Math.PI),material('#a692ad'),p.clone().add(vec(0,-21,0)),vec(1,1,1),new T.Euler(0,yaw,0));
  }
 }

 // ============================================================================
 // COLOSSAL GUARDIAN HEAD MONUMENT & CLIFFSIDE KITH MASK SANCTUARY
 // ============================================================================
 // Placed directly in the upper-center background vista of the opening straight + Turn 1!
 const guardianAnchors:T.Group[]=[];
 const guardianSpots=[
  {pos:vec(108,14,-14),lookAt:vec(18,4,-56),scale:1.15}, // Main concept-art vista centerpiece
  {pos:vec(-22,20,98),lookAt:vec(25,18,45),scale:1.05},  // Second guardian overlooking upper crest
 ];
 for(const spot of guardianSpots){
  const gGroup=new T.Group();
  gGroup.position.copy(spot.pos);
  gGroup.scale.setScalar(spot.scale);
  gGroup.lookAt(spot.lookAt.x,spot.pos.y,spot.lookAt.z);
  scene.add(gGroup);
  guardianAnchors.push(gGroup);

  // Synchronous fallback Guardian Monument (gets replaced by high-res Blender GuardianMonument when monuments.glb resolves)
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

 // Cliffside White-Stone Kith Mask Sanctuary on the left vista (Concept Art left cliffside)
 const sanctuaryAnchor=new T.Group();
 sanctuaryAnchor.position.set(52,9,-82);
 sanctuaryAnchor.scale.setScalar(1.15);
 sanctuaryAnchor.lookAt(20,5,-54);
 scene.add(sanctuaryAnchor);
 // Twin turquoise waterfalls flanking the cliffside sanctuary mask
 addWaterfall(45,18,-79,3.4,20,0.45);
 addWaterfall(59,18,-79,3.4,20,0.45);

 // Load Blender-sculpted monuments.glb to populate GuardianMonument, SanctuaryMask, CrystalMonolith & FloatingMesa
 loadMonumentsGlb().then(glb=>{
  const enhanceMonument=(root:T.Object3D)=>{
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
      emissiveIntensity:isCrystal?.68:0,
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
  };

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

 for(const [m,geometries] of batches){
  const combined=mergeGeometries(geometries,false);
  geometries.forEach(g=>g.dispose());
  if(!combined)throw new Error('Garden geometry could not be merged');
  const mesh=new T.Mesh(combined,m);
  mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
 }

 // Cool mist breathing at every waterfall base
 const mistTex=(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d')!;const g=x.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(255,255,255,0.78)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;})();
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

 // Active atmospheric cherry blossom blizzard: 520 soft-textured 3D petals swirling in the air
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

