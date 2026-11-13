import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {createFxSystem,createAfterburner,createSkidMarks,createPostFx,type PostView} from '../../components/kithParty/fx3d';
import {makeKart} from '../../components/kithParty/karts3d';
import {characterById} from '../../components/kithParty/catalog';
import {makeGardenWorld} from '../../components/kithParty/gardenWorld3d';
import {trackFrame,worldPoint,setActiveCourse,courseById,type CourseId} from '../../components/kithParty/course3d';

/**
 * Kith FX lab. Query params:
 *   ?split=1          two viewports (split-screen post pipeline)
 *   ?world=<courseId> render that course's world + a road ribbon and drive the kart along the track
 *   ?kart=<id>        driver/kart
 *   ?quality=low
 * Keys: 1/2 = views, B = hold boost, Q = toggle quality.
 */
const qs=new URLSearchParams(location.search);
let split=qs.get('split')==='1';
const worldId=qs.get('world') as CourseId|null;
const canvas=document.getElementById('c') as HTMLCanvasElement;
const hud=document.getElementById('hud')!;
const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();
const pm=new T.PMREMGenerator(renderer);
scene.environment=pm.fromScene(new RoomEnvironment(),.04).texture;
const sun=new T.DirectionalLight('#ffe8cc',3.2);sun.position.set(40,60,-20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60,far:200});scene.add(sun,sun.target);
scene.add(new T.HemisphereLight('#cfe4ff','#6a5a50',1.4));

let course=worldId?courseById(worldId):null;
let world:ReturnType<typeof makeGardenWorld>|null=null;
if(course){
 setActiveCourse(course.id);
 // mirror circuit3d's course-tinted PMREM environment + light rig
 const env=new T.Scene();
 env.add(new T.Mesh(new T.SphereGeometry(50,16,12),new T.MeshBasicMaterial({side:T.BackSide,color:course.skyMid})));
 const eg=new T.Mesh(new T.CircleGeometry(45,16),new T.MeshBasicMaterial({color:course.terrainColorA}));eg.rotation.x=-Math.PI/2;eg.position.y=-4;env.add(eg);
 const es=new T.Mesh(new T.SphereGeometry(7,12,10),new T.MeshBasicMaterial({color:'#fff6dc'}));es.position.set(28,32,-12);env.add(es);
 scene.environment=pm.fromScene(env,.035).texture;scene.environmentIntensity=.92;
 sun.intensity=3.7;sun.color.set('#ffebd2');
 scene.background=new T.Color(course.skyMid);
 scene.fog=new T.FogExp2(course.fogColor,course.fogDensity);
 world=makeGardenWorld(scene,(t,l=0,o=0)=>worldPoint(t,l,o,course!.id),course.id);
 // simple road ribbon so the corridor is visible
 const P:number[]=[],I:number[]=[];const N=600;
 for(let i=0;i<=N;i++){for(const lane of [-63,63]){const p=worldPoint(i/N*.999,lane,0,course.id);P.push(p.x,p.y,p.z);}if(i<N){const j=i*2;I.push(j,j+2,j+1,j+1,j+2,j+3);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setIndex(I);g.computeVertexNormals();
 const road=new T.Mesh(g,new T.MeshStandardMaterial({color:course.roadColor,roughness:.5,side:T.DoubleSide}));road.receiveShadow=true;scene.add(road);
} else {
 scene.background=new T.Color('#6aa0d8');
 scene.fog=new T.Fog('#6aa0d8',60,220);
 const ground=new T.Mesh(new T.CircleGeometry(120,64),new T.MeshStandardMaterial({color:'#2a2c38',roughness:.55}));
 ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 for(let i=0;i<24;i++){const b=new T.Mesh(new T.BoxGeometry(2,1+i%4,2),new T.MeshStandardMaterial({color:i%2?'#ff8c00':'#f7ead8'}));const a=i/24*Math.PI*2;b.position.set(Math.cos(a)*32,.5,Math.sin(a)*32);b.castShadow=true;scene.add(b);}
}

const fx=createFxSystem(scene,{maxParticles:6000});
const skids=createSkidMarks(scene);
const char=characterById(qs.get('kart')||'rello');
const kart=makeKart(char);
const root=new T.Group();root.add(kart.body);scene.add(root);
const burners=kart.exhaustPorts.map(p=>{const ab=createAfterburner({core:'#fff3c4',outer:'#ff4a12'});ab.group.position.copy(p);kart.body.add(ab.group);return ab;});
const post=createPostFx(renderer);
if(qs.get('quality')==='low') post.setQuality('low');
let quality:'high'|'low'=qs.get('quality')==='low'?'low':'high';

const camA=new T.PerspectiveCamera(60,1,.1,900),camB=new T.PerspectiveCamera(50,1,.1,900);
const keys=new Set<string>();
addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Digit1')split=false;if(e.code==='Digit2')split=true;if(e.code==='KeyQ'){quality=quality==='high'?'low':'high';post.setQuality(quality);}});
addEventListener('keyup',e=>keys.delete(e.code));

const clock=new T.Clock();
let t=0,progress=qs.has('t')?Number(qs.get('t')):.01,prevPos=new T.Vector3(),frames=0,fpsT=0,fps=0;
const vel=new T.Vector3(),wheelWorld=new T.Vector3(),up=new T.Vector3(),right=new T.Vector3();
function frame(){
 const dt=Math.min(.05,clock.getDelta());t+=dt;
 // intensity script: idle -> cruise -> boost -> ultra, repeating every 8 s (B forces boost)
 const ph=t%8;
 let intensity=ph<1.5?0:ph<4?.4:ph<6?1:1.45;
 if(keys.has('KeyB')) intensity=1.2;
 if(qs.has('i')) intensity=Number(qs.get('i'));
 const speed=intensity<.05?6:12+intensity*16;
 let drifting=false;
 if(course){
  progress=(progress+speed*dt/900)%0.995;
  const f=trackFrame(progress,Math.sin(t*.6)*30,course.id);
  root.position.copy(f.position);
  const m=new T.Matrix4().makeBasis(f.right,f.normal,f.tangent);root.quaternion.setFromRotationMatrix(m);
  drifting=ph>3&&ph<6;
  kart.body.rotation.y=drifting?.35:0;
 } else {
  const a=t*speed/18;
  root.position.set(Math.cos(a)*18,0,Math.sin(a)*18);
  root.rotation.y=-a; // tangent direction
  drifting=intensity>=.4;
  kart.body.rotation.y=drifting?-.42:0;
 }
 vel.copy(root.position).sub(prevPos).divideScalar(Math.max(dt,1e-3));prevPos.copy(root.position);
 kart.wheels.forEach((w,i)=>{w.rotation.x-=speed*dt/.5;w.position.y=(w.userData.baseY??.5)+Math.sin(t*9+i)*.03;});
 (kart as any).updateRig?.();
 for(const b of burners) b.update(dt,t,intensity,vel,fx);
 // rear wheels: burn rubber while drifting/boosting
 root.updateMatrixWorld(true);
 up.set(0,1,0).applyQuaternion(root.quaternion);
 right.set(1,0,0).applyQuaternion(kart.body.getWorldQuaternion(new T.Quaternion()));
 kart.wheels.slice(0,2).forEach((w,i)=>{
  w.getWorldPosition(wheelWorld);
  const ground=wheelWorld.clone().addScaledVector(up,-(w.userData.baseY??.5));
  skids.add(i,ground,up,right,drifting?.9:0);
  if(drifting&&Math.random()<.7) fx.emit('tireSmoke',ground,vel.clone().multiplyScalar(.2).add(new T.Vector3(0,1,0)),1,undefined,1.1);
  if(drifting&&intensity>1&&Math.random()<.4) fx.emit('spark',ground,vel.clone().multiplyScalar(.3),2,'#c08cff');
 });
 if(Math.floor(t*2)%16===0&&Math.random()<.05) fx.emit('explosion',root.position.clone().add(new T.Vector3(6,1,0)),new T.Vector3(),20);
 skids.update(dt);world?.update(dt,t);

 // cameras: A = chase, B = side orbit
 const back=new T.Vector3(0,0,-1).applyQuaternion(root.quaternion);
 camA.position.copy(root.position).addScaledVector(back,7.5).addScaledVector(up,2.6);
 camA.up.copy(up);camA.lookAt(root.position.clone().addScaledVector(up,1.2).addScaledVector(back,-4));
 const far=qs.get('cam')==='b';
 camB.position.copy(root.position).add(new T.Vector3(Math.cos(t*.15)*(far?70:9),far?38:3.5,Math.sin(t*.15)*(far?70:9)));camB.lookAt(root.position);
 fx.update(dt,camA);

 const w=canvas.clientWidth,h=canvas.clientHeight;
 renderer.setSize(w,h,false);
 const views:PostView[]=split
  ?[{camera:camA,x:0,y:h/2,w,h:h/2,speedBlur:intensity>=1?.9:intensity*.4,boostTint:intensity>=1?1:0},{camera:camB,x:0,y:0,w,h:h/2,speedBlur:0,boostTint:0}]
  :[{camera:qs.get('cam')==='b'?camB:camA,x:0,y:0,w,h,speedBlur:intensity>=1?.9:intensity*.4,boostTint:intensity>=1?1:0}];
 for(const v of views){(v.camera as T.PerspectiveCamera).aspect=v.w/v.h;(v.camera as T.PerspectiveCamera).fov=v.camera===camA?60+(intensity>=1?14:0):50;(v.camera as T.PerspectiveCamera).updateProjectionMatrix();}
 if(qs.get('nopost')==='1'){
  renderer.setScissorTest(true);
  for(const v of views){renderer.setViewport(v.x,v.y,v.w,v.h);renderer.setScissor(v.x,v.y,v.w,v.h);renderer.render(scene,v.camera);}
  renderer.setScissorTest(false);
 } else post.render(scene,views);

 frames++;fpsT+=dt;if(fpsT>.5){fps=frames/fpsT;frames=0;fpsT=0;}
 hud.textContent=`Kith FX lab ${course?'· '+course.name:''}\nintensity ${intensity.toFixed(2)}  ${split?'2 views':'1 view'}  ${quality}\nfps ${fps.toFixed(0)}  calls ${renderer.info.render.calls}  tris ${renderer.info.render.triangles}\n1/2 views · B boost · Q quality`;
 (window as any).__lab={fps,calls:renderer.info.render.calls,intensity,split,stats:world?.stats};
 requestAnimationFrame(frame);
}
frame();
