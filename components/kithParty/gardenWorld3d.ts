import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {crestGeometry} from './karts3d';

/** Batched solid scenery: thousands of authored forms, a few material draw calls. */
export function makeGardenWorld(scene:T.Scene,point:(t:number,lane?:number)=>T.Vector3){
 const surface=document.createElement('canvas');surface.width=surface.height=128;
 const surfaceCtx=surface.getContext('2d')!;surfaceCtx.fillStyle='#b8b8b8';surfaceCtx.fillRect(0,0,128,128);
 for(let i=0;i<1800;i++){const value=110+(i*37)%115;surfaceCtx.fillStyle=`rgb(${value},${value},${value})`;surfaceCtx.fillRect((i*43)%128,(i*79+Math.floor(i/128)*13)%128,1+i%3,1+i%4);}
 const grain=new T.CanvasTexture(surface);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(4,4);
 const batches=new Map<T.Material,T.BufferGeometry[]>(),palette=new Map<string,T.MeshStandardMaterial>();
 const material=(color:string,glow=0)=>{const key=color+glow;if(!palette.has(key))palette.set(key,new T.MeshStandardMaterial({color,roughness:.72,metalness:.08,emissive:color,emissiveIntensity:glow,bumpMap:grain,bumpScale:.07}));return palette.get(key)!;};
 const matrix=new T.Matrix4(),quat=new T.Quaternion();
 function shape(g:T.BufferGeometry,m:T.Material,p:T.Vector3,s:T.Vector3=new T.Vector3(1,1,1),r=new T.Euler()){
  g.applyMatrix4(matrix.compose(p,quat.setFromEuler(r),s));
  if(g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}
  // All world geometries use position/normal/uv for safe merging.
  const list=batches.get(m)||[];list.push(g);batches.set(m,list);
 }
 const vec=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
 const ell=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string)=>shape(new T.SphereGeometry(1,10,7),material(color),vec(x,y,z),vec(sx,sy,sz));
 const stem=(a:T.Vector3,b:T.Vector3,r:number,color:string)=>{
  const d=b.clone().sub(a);shape(new T.CylinderGeometry(r*.7,r,d.length(),7),material(color),a.clone().add(b).multiplyScalar(.5),vec(1,1,1),new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(vec(0,1,0),d.normalize())));
 };
 function tree(x:number,y:number,z:number,size:number,seed:number){
  stem(vec(x,y,z),vec(x+.22*size,y+2.5*size,z),.2*size,'#776382');
  for(let j=0;j<5;j++){
   const a=j*2.4+seed,cx=x+Math.cos(a)*size,cz=z+Math.sin(a)*size,cy=y+(2.5+(j%2)*.45)*size;
   stem(vec(x,y+1.2*size,z),vec(cx,cy,cz),.095*size,'#776382');
   ell(cx,cy,cz,1.05*size,.61*size,.93*size,j%2?'#d86faa':'#f19acb');
   ell(cx-.22*size,cy+.25*size,cz,.65*size,.32*size,.68*size,'#ffb8dc');
   for(let k=0;k<6;k++){const a2=k*2.4+j;ell(cx+Math.cos(a2)*size*.72,cy+.22*size+(k%2)*.25*size,cz+Math.sin(a2)*size*.64,.33*size,.25*size,.34*size,k%2?'#f48fbd':'#ffc8dd');}
  }
 }
 const falls:T.Mesh[]=[];
 const waterCanvas=document.createElement('canvas');waterCanvas.width=64;waterCanvas.height=128;
 const ctx=waterCanvas.getContext('2d')!;ctx.fillStyle='#24bbdd';ctx.fillRect(0,0,64,128);
 for(let i=0;i<40;i++){ctx.fillStyle=i%3?'rgba(226,255,255,.45)':'rgba(72,210,255,.7)';ctx.fillRect((i*17)%64,(i*37)%128,1+i%3,10+i%21);}
 const waterMap=new T.CanvasTexture(waterCanvas);waterMap.wrapS=waterMap.wrapT=T.RepeatWrapping;waterMap.repeat.set(2,3);waterMap.colorSpace=T.SRGBColorSpace;
 const water=new T.MeshStandardMaterial({map:waterMap,color:'#a5f6ff',emissive:'#18aacd',emissiveIntensity:.35,roughness:.28,metalness:.15,side:T.DoubleSide});
 function island(x:number,z:number,r:number,y:number,seed:number,waterfall=false){
  const rock=new T.CylinderGeometry(r,r*.32,r*1.7,28,8),vertices=rock.getAttribute('position');
  for(let i=0;i<vertices.count;i++){
   const px=vertices.getX(i),py=vertices.getY(i),pz=vertices.getZ(i),a=Math.atan2(pz,px);
   const warp=1+Math.sin(a*7+seed)*.065+Math.cos(a*11+py*.4)*.05;
   vertices.setXYZ(i,px*warp,py+Math.sin(a*8+seed)*.36,pz*warp);
  }rock.computeVertexNormals();shape(rock,material('#9a85a4'),vec(x,y-r*.85,z));
  // Exposed column strata and pale weathered rims.
  for(let j=0;j<12;j++){const a=j*Math.PI/6,h=r*(.45+(j%4)*.18);shape(new T.CylinderGeometry(r*.18,r*.1,h,5),material(j%2?'#b0a3b7':'#9a88a7'),vec(x+Math.cos(a)*r*.81,y-h/2,z+Math.sin(a)*r*.81));}
  shape(new T.CylinderGeometry(r*.99,r,1,18),material('#638b69'),vec(x,y+.1,z));
  ell(x,y+.35,z,r*.9,.65,r*.89,'#8baa74');
  for(let j=0;j<9;j++){const a=j*2.399+seed,rr=r*(.35+(j%3)*.19),tx=x+Math.cos(a)*rr,tz=z+Math.sin(a)*rr;tree(tx,y+.5,tz,.6+r*.034,j+seed);}
  for(let j=0;j<48;j++){const a=j*2.399,rr=r*(.85+(j%3)*.035);ell(x+Math.cos(a)*rr,y+.2-(j%5)*.14,z+Math.sin(a)*rr,1.2,.55,1,j%3?'#668359':'#b2bf75');}
  if(waterfall){
   const h=r*2+12;
   const fall=new T.Mesh(new T.PlaneGeometry(r*.42,h,2,1),water);fall.position.set(x,y-h/2,z+r*.95);scene.add(fall);falls.push(fall);
   ell(x,y-h,z+r, r*.4,.3,r*.25,'#cef9ff');
  }
 }
 // Central sanctuary and outer mountain islands
 island(0,0,22,-4,3,true);
 for(let i=0;i<14;i++){
  const a=i*Math.PI*2/14,r=96+(i%3)*15;
  island(Math.cos(a)*r,Math.sin(a)*r,13+i%4*3,2+(i%4)*7,i,i%2===0);
 }
 for(let i=0;i<11;i++){
  const a=i*Math.PI*2/11+.2,r=172+i%3*16;
  island(Math.cos(a)*r,Math.sin(a)*r,11+i%3*4,28+i%4*7,i,true);
 }

 // Floating Sky Islands suspended in midair with dangling waterfall streams & crystals
 const skyIslands=[
  {x:45,y:42,z:25,r:9},
  {x:-42,y:38,z:40,r:11},
  {x:15,y:48,z:-35,r:8},
  {x:-58,y:35,z:-22,r:10},
  {x:68,y:44,z:-10,r:9}
 ];
 for(let i=0;i<skyIslands.length;i++){
  const isl=skyIslands[i];
  const cone=new T.ConeGeometry(isl.r,isl.r*1.6,12);cone.rotateX(Math.PI);
  shape(cone,material('#8c7996'),vec(isl.x,isl.y-isl.r*.7,isl.z));
  ell(isl.x,isl.y,isl.z,isl.r*.95,.6,isl.r*.95,'#769e60');
  tree(isl.x,isl.y+.5,isl.z,1.2,i*7);
  const fallH=isl.r*1.8;
  const skyFall=new T.Mesh(new T.PlaneGeometry(isl.r*.32,fallH,1,1),water);
  skyFall.position.set(isl.x,isl.y-fallH/2,isl.z+isl.r*.8);
  scene.add(skyFall);falls.push(skyFall);
  shape(crestGeometry(),material(i%2?'#ff8c00':'#00daf3',.8),vec(isl.x+isl.r*.4,isl.y+1.2,isl.z),vec(1.8,2.4,1.8),new T.Euler(0,i*.9,.15));
 }

 // Purple mountains framing the horizon
 for(let i=0;i<26;i++){
  const a=i*Math.PI*2/26,r=238,h=34+(i*13)%45;
  shape(new T.ConeGeometry(20+i%4*4,h,6),material(i%2?'#b9a4cf':'#9d8cbe'),vec(Math.cos(a)*r,h/2-10,Math.sin(a)*r),vec(1,1,1),new T.Euler(0,i*.7,.08));
 }

 // Continuously connected low guardrails with inset golden fins
 for(const side of [-1,1]){
  const curve=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*64).add(vec(0,1.1,0))));
  shape(new T.TubeGeometry(curve,360,.15,6,false),material('#f2e4cc'),vec(0,0,0));
  const lower=new T.CatmullRomCurve3(Array.from({length:241},(_,i)=>point(i/240,side*64).add(vec(0,.28,0))));
  shape(new T.TubeGeometry(lower,360,.2,6,false),material('#9b85a1'),vec(0,0,0));
  for(let i=0;i<100;i++){
   const t=i/100,p=point(t,side*64),q=point(t+.001,side*64),yaw=Math.atan2(q.x-p.x,q.z-p.z);
   shape(new T.BoxGeometry(.15,.82,.18),material('#c3add1'),p.clone().add(vec(0,.65,0)));
   shape(crestGeometry(),material('#ffad43',.38),p.clone().add(vec(0,.32,0)),vec(.44,.34,.5),new T.Euler(0,yaw+Math.PI/2,-.5));
  }
 }

 // Roadside gardens, glowing seed lamps, purple/gold pennant banners, and crystal obelisks
 for(let i=0;i<48;i++){
  const t=i/48,side=i%2?1:-1,p=point(t,side*88),q=point(t+.001),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  ell(p.x,p.y-1,p.z,3.2,1.3,2.6,'#799863');
  if(i%2===0)tree(p.x,p.y-.2,p.z,1.15,i);
  else for(let j=0;j<5;j++){const a=j*2.4;ell(p.x+Math.cos(a)*1.4,p.y+.1,p.z+Math.sin(a)*1.4,.55,.48,.53,j%2?'#d868a8':'#f6b3d8');}
  const lamp=point(t,side*68);stem(lamp,lamp.clone().add(vec(0,2.3,0)),.075,'#766580');
  shape(crestGeometry(),material('#ffd77e',.8),lamp.clone().add(vec(0,2.1,0)),vec(.45,.5,.85),new T.Euler(0,yaw,0));
  if(i%4===0){
   stem(p,p.clone().add(vec(0,5.5,0)),.09,'#e5d9c5');
   shape(new T.BoxGeometry(1.4,2.2,.07),material('#58117a'),p.clone().add(vec(0,4,0)),vec(1,1,1),new T.Euler(0,yaw,0));
   shape(crestGeometry(),material('#ffad33',.6),p.clone().add(vec(Math.sin(yaw)*.06,3.3,Math.cos(yaw)*.06)),vec(.72,.68,.5),new T.Euler(0,yaw,0));
  }
 }

 for(const t of [.105,.35,.59,.83])for(const side of [-1,1]){
  const p=point(t,side*80),q=point(t+.001),yaw=Math.atan2(q.x-point(t).x,q.z-point(t).z);
  shape(crestGeometry(),material(side>0?'#ff8c00':'#dc388f',.6),p,vec(5.2,side>0?7.5:5.5,4.2),new T.Euler(0,yaw,-side*.2));
  shape(crestGeometry(),material('#fff0d8'),p.clone().add(vec(0,-.3,0)),vec(5.8,2.2,5.2),new T.Euler(0,yaw,-side*.2));
  shape(crestGeometry(),material('#ffd24d',.5),p.clone().add(vec(side*3,1,1)),vec(3.2,4.5,2.8),new T.Euler(0,yaw+side*.4,-side*.15));
 }

 // COLOSSAL MOUNTAIN GUARDIAN FACE (Concept Art Centerpiece)
 const guardian=point(.3,190);guardian.y=18;
 ell(guardian.x,guardian.y+12,guardian.z,11,12,7,'#9d8ea8');
 ell(guardian.x,guardian.y+10,guardian.z+4.2,9,7,2.5,'#ede0ce');
 ell(guardian.x,guardian.y+6.8,guardian.z+6.4,4.8,3.2,2.2,'#dfcebd');
 for(const side of [-1,1]){
  const brow=new T.BoxGeometry(5.8,1.1,1.5);
  shape(brow,material('#5b4f68'),guardian.clone().add(vec(side*3.8,13.8,6)),vec(1,1,1),new T.Euler(0,0,side*.32));
  ell(guardian.x+side*3.6,guardian.y+11,guardian.z+5.8,1.1,1.5,.6,'#685572');
  ell(guardian.x+side*3.6,guardian.y+11,guardian.z+6.1,.6,.8,.3,'#ff9d00');
  for(let j=0;j<4;j++){
   const crestColor=j%2?'#e6288b':'#ff7700';
   shape(crestGeometry(),material(crestColor,.75),guardian.clone().add(vec(side*(6.5+j*2),16.5-j*2.2,.5)),vec(5,5.5,4),new T.Euler(0,0,-side*(.25+j*.32)));
  }
 }
 shape(crestGeometry(),material('#ffab2e',.8),guardian.clone().add(vec(0,21.5,1.5)),vec(4,4.2,5));

 // Monumental Double-Deck Stone Viaduct Arches underneath the road
 for(let i=0;i<22;i++){
  const p=point(i/22),q=point(i/22+.001),yaw=Math.atan2(q.x-p.x,q.z-p.z);
  shape(new T.TorusGeometry(8.5,1.1,6,22,Math.PI),material('#a691a8'),p.clone().add(vec(0,-9.5,0)),vec(1,1,1),new T.Euler(0,yaw,0));
  if(i%2===0){
   shape(new T.TorusGeometry(14,1.8,6,24,Math.PI),material('#8e7b91'),p.clone().add(vec(0,-21,0)),vec(1,1,1),new T.Euler(0,yaw,0));
  }
 }

 for(const [m,geometries] of batches){
  const combined=mergeGeometries(geometries,false);
  geometries.forEach(g=>g.dispose());
  if(!combined)throw new Error('Garden geometry could not be merged');
  const mesh=new T.Mesh(combined,m);
  mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
 }

 // Active atmospheric cherry blossom blizzard: 450 dynamic 3D petals swirling in the air
 const petalCount=450;
 const petalPos=new Float32Array(petalCount*3);
 for(let i=0;i<petalCount;i++){
  petalPos[i*3]=Math.sin(i*19)*110;
  petalPos[i*3+1]=3+(i*7)%32;
  petalPos[i*3+2]=Math.cos(i*13)*95;
 }
 const petalGeo=new T.BufferGeometry();
 petalGeo.setAttribute('position',new T.BufferAttribute(petalPos,3));
 const petalMat=new T.PointsMaterial({color:'#ffc4df',size:.22,sizeAttenuation:true,transparent:true,opacity:.85});
 const petals=new T.Points(petalGeo,petalMat);
 scene.add(petals);

 return {
  update(dt:number,time:number){
   waterMap.offset.y+=dt*.38;
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
  },
  stats:{islands:31,kartDesigns:10,waterfalls:falls.length,skyIslands:skyIslands.length}
 };
}
