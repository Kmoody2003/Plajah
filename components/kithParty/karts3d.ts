import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {Character} from './catalog';

export const KART_NAMES:Record<string,string>={
 rello:'Ember Fang',
 chora:'Petal Pulse',
 moki:'Grove Runner',
 zippi:'Volt Dart',
 nori:'Reef Skimmer',
 pippa:'Bloom Bug',
 bram:'Cairn Crawler',
 luma:'Lunar Comet',
 tavi:'Copper Wasp',
 fenn:'Frostwing'
};

/** Shared cached loader for Blender-authored karts.glb so all karts reuse a single fetch. */
let kartsGlbPromise:Promise<T.Group>|null=null;
function loadKartsGlb():Promise<T.Group>{
 if(!kartsGlbPromise){
  kartsGlbPromise=new Promise((resolve,reject)=>{
   if(typeof window==='undefined'){reject(new Error('no-window'));return;}
   new GLTFLoader().load('/kith-party/models/karts.glb',gltf=>resolve(gltf.scene),undefined,err=>reject(err));
  });
 }
 return kartsGlbPromise;
}

/** Solid, bevelled crest used by fairings, wheel hubs, and track monuments. */
export function crestGeometry(){
 const shape=new T.Shape();
 shape.moveTo(-.48,0);
 shape.quadraticCurveTo(-.64,.62,-.25,1.8);
 shape.quadraticCurveTo(.14,1.36,.52,.28);
 shape.quadraticCurveTo(.3,-.08,-.48,0);
 const g=new T.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.05,bevelThickness:.04,curveSegments:8});
 g.translate(0,0,-.065);
 return g;
}

/** Generates procedural texture decals for kart flanks (star speckles, musical notes, leaf emblems). */
function createKartFlankTexture(type:'stars'|'note'|'leaf'|'crest', baseColor:string, accentColor:string):T.CanvasTexture{
 const c=document.createElement('canvas');c.width=256;c.height=128;
 const ctx=c.getContext('2d')!;
 ctx.fillStyle=baseColor;ctx.fillRect(0,0,256,128);
 if(type==='stars'){
  for(let i=0;i<140;i++){
   const x=(i*37)%256, y=(i*59)%128, r=0.8+(i%3)*0.75;
   ctx.fillStyle=i%4===0?'#ffae42':i%3===0?'#ffa07a':'#ffffff';
   ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
 } else if(type==='note'){
  ctx.fillStyle=accentColor;
  ctx.font='bold 72px Arial, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('♫',128,64);
 } else if(type==='leaf'){
  ctx.fillStyle=accentColor;
  ctx.font='bold 68px Arial, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('❧',128,64);
 } else {
  ctx.fillStyle=accentColor;
  ctx.font='bold 68px Arial, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('✦',128,64);
 }
 const tex=new T.CanvasTexture(c);
 tex.colorSpace=T.SRGBColorSpace;
 return tex;
}

export function makeKart(c:Character){
 const body=new T.Group();body.name=KART_NAMES[c.id];
 const chassisGroup=new T.Group();chassisGroup.name=`${c.id}_chassis_holder`;
 body.add(chassisGroup);

 const isRello=c.id==='rello', isChora=c.id==='chora', isMoki=c.id==='moki', isFenn=c.id==='fenn';
 const rugged=['moki','bram','tavi'].includes(c.id);
 const sleek=['fenn','zippi','nori','luma'].includes(c.id);

 // Materials faithfully matching concept art
 const paintColor=isRello?'#121328':c.color;
 const paint=new T.MeshPhysicalMaterial({
  color:paintColor,
  metalness:isRello?.52:.30,
  roughness:isRello?.18:.24,
  clearcoat:1,
  clearcoatRoughness:.12,
  envMapIntensity:1.4
 });
 const accent=new T.MeshPhysicalMaterial({
  color:c.accent,
  metalness:.32,
  roughness:.22,
  clearcoat:1,
  emissive:isRello?'#ff6200':isChora?'#e8258b':c.accent,
  emissiveIntensity:isRello?.42:isChora?.3:.18,
  envMapIntensity:1.35
 });
 const fin=new T.MeshPhysicalMaterial({
  color:isRello?'#ff7b00':c.fin,
  metalness:.15,
  roughness:.14,
  clearcoat:1,
  emissive:isRello?'#ff5900':c.fin,
  emissiveIntensity:isRello?.58:.42,
  envMapIntensity:1.45,
  iridescence:.35,
  iridescenceIOR:1.3
 });
 const ivory=new T.MeshStandardMaterial({color:'#f7efe2',roughness:.32,metalness:.1});
 const dark=new T.MeshStandardMaterial({color:'#11131e',roughness:.55,metalness:.25});
 const rubber=new T.MeshStandardMaterial({color:'#12131a',roughness:.35,metalness:.08});
 const metal=new T.MeshStandardMaterial({color:'#a8b3c4',metalness:.85,roughness:.22});
 const gold=new T.MeshStandardMaterial({color:'#f4c542',metalness:.88,roughness:.22,emissive:'#d49b20',emissiveIntensity:.3});
 const lamp=new T.MeshStandardMaterial({color:'#fff1b4',emissive:'#ff7711',emissiveIntensity:2.2});
 const wood=new T.MeshStandardMaterial({color:'#5c3d26',roughness:.82});

 const add=(g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0,parent:T.Object3D=chassisGroup)=>{
  const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 };
 const rounded=(sx:number,sy:number,sz:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=chassisGroup)=>add(new RoundedBoxGeometry(sx,sy,sz,2,.1),m,x,y,z,parent);
 const oval=(sx:number,sy:number,sz:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=chassisGroup)=>{
  const o=add(new T.SphereGeometry(1,16,12),m,x,y,z,parent);o.scale.set(sx,sy,sz);return o;
 };
 const crest=(x:number,y:number,z:number,sx:number,sy:number,angle:number,m:T.Material=fin,parent:T.Object3D=chassisGroup)=>{
  const o=add(crestGeometry(),m,x,y,z,parent);o.scale.set(sx,sy,1);o.rotation.z=angle;return o;
 };
 const tube=(points:number[][],radius:number,m:T.Material,parent:T.Object3D=chassisGroup)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p as [number,number,number]))),16,radius,6,false),m,0,0,0,parent);

 // Low-slung V-wedge Chassis & Sculpted Rear Haunches
 rounded(1.62,.24,2.82,dark,0,.38,0);
 const mainBody=oval(.86,.36,sleek?1.68:1.45,paint,0,.64,.05);
 const starTex=isRello?createKartFlankTexture('stars','#111328','#ff9d00'):null;
 if(starTex){
  mainBody.material=new T.MeshPhysicalMaterial({map:starTex,metalness:.48,roughness:.18,clearcoat:1,envMapIntensity:1.35});
 }
 // Low sloped front nose cone
 const noseCone=rounded(1.28,.22,1.15,mainBody.material as T.Material,0,.52,.98);
 noseCone.rotation.x=.16;

 // Cockpit, padded bucket seat & sport steering wheel
 rounded(.92,.18,1.08,dark,0,.62,-.28);
 rounded(.84,.76,.24,dark,0,.98,-.68);
 rounded(.68,.58,.05,accent,0,1.02,-.81);
 const steering=add(new T.TorusGeometry(.22,.038,8,18),dark,0,.94,.36);
 steering.rotation.x=-.55;
 tube([[0,.62,.46],[0,.92,.36]],.038,metal);

 // Front fanged jaw bumper & rear sculpted ivory diffuser bumper (Concept Art)
 const frontJaw=rounded(1.64,.26,.3,ivory,0,.38,1.48);
 frontJaw.rotation.x=-.12;
 const rearDiffuser=rounded(1.52,.28,.26,ivory,0,.36,-1.44);
 rearDiffuser.rotation.x=.08;
 for(const side of [-1,1]){
  // Front fang vents
  const fVent=rounded(.22,.1,.08,dark,side*.42,.36,1.62);fVent.rotation.z=side*.38;
  // Rear diffuser fang cutouts
  const rVent=rounded(.24,.11,.08,dark,side*.38,.34,-1.56);rVent.rotation.z=-side*.42;
  // Side aerodynamic pod haunches
  oval(.42,.28,.92,mainBody.material as T.Material,side*.76,.68,-.15);
 }

 // Dual Rocket Exhaust Nozzles in Rear + Central Reactor Core Taillight
 const exhaustPorts:T.Vector3[]=[];
 // Central dark housing + glowing orange trapezoid reactor taillight above nozzles
 rounded(1.06,.34,.22,dark,0,.52,-1.42);
 rounded(.12,.28,.24,dark,0,.48,-1.48);
 rounded(.34,.15,.16,lamp,0,.69,-1.44);
 for(const side of [-1,1]){
  const exX=side*(isRello?.36:.44);
  const exY=.48;
  const exZ=-1.50;
  exhaustPorts.push(new T.Vector3(exX,exY,exZ));
  const barrel=add(new T.CylinderGeometry(.22,.24,.38,20),dark,exX,exY,exZ+.08);
  barrel.rotation.x=Math.PI/2;
  const rimNozzle=add(new T.TorusGeometry(.20,.052,10,22),accent,exX,exY,exZ-.08);
  rimNozzle.rotation.y=Math.PI;
  const chamber=add(new T.CylinderGeometry(.14,.14,.18,14),lamp,exX,exY,exZ-.02);
  chamber.rotation.x=Math.PI/2;
 }

 // Wheels: Ordered strictly [RL, RR, FL, FR] so wheels.slice(2,4) are the front steering wheels!
 const wheels:T.Group[]=[];
 const wheelConfigs=[
  {name:'rl',side:-1,z:-.92,isRear:true},
  {name:'rr',side:1,z:-.92,isRear:true},
  {name:'fl',side:-1,z:.95,isRear:false},
  {name:'fr',side:1,z:.95,isRear:false},
 ];
 for(const cfg of wheelConfigs){
  const {side,z,isRear}=cfg;
  const radius=rugged?(isRear?.52:.46):(isRear?.50:.42);
  const width=isRear?.46:.36;
  const wheelX=side*(isRear?1.08:1.02);
  const wheel=new T.Group();
  wheel.rotation.order='YXZ';
  wheel.position.set(wheelX,radius,z);
  body.add(wheel);wheels.push(wheel);

  const tire=add(new T.CylinderGeometry(radius,radius,width,24),rubber,0,0,0,wheel);
  tire.rotation.z=Math.PI/2;
  const rim=add(new T.CylinderGeometry(radius*.64,radius*.64,width+.02,18),dark,0,0,0,wheel);
  rim.rotation.z=Math.PI/2;
  const bandColor=isRello?'#ff7300':isChora?'#e8258b':isMoki?'#bee16f':isFenn?'#54e1ff':c.accent;
  const bandMat=new T.MeshStandardMaterial({color:bandColor,emissive:bandColor,emissiveIntensity:1.35});
  const ring=add(new T.TorusGeometry(radius*.76,.032,8,24),bandMat,side*(width*.5+.01),0,0,wheel);
  ring.rotation.y=Math.PI/2;
  const hub=add(new T.CylinderGeometry(.13,.13,width+.05,14),accent,0,0,0,wheel);
  hub.rotation.z=Math.PI/2;

  if(rugged){
   for(let j=0;j<12;j++){
    const a=j*Math.PI/6;
    const tread=add(new T.BoxGeometry(width+.02,.04,.12),rubber,0,Math.cos(a)*radius,Math.sin(a)*radius,wheel);
    tread.rotation.x=a;
   }
  }
  // Exposed Coilover Suspension Springs
  const springColor=isRello?'#ff6a00':isMoki?'#78ba5e':c.accent;
  const springMat=new T.MeshStandardMaterial({color:springColor,metalness:.65,roughness:.25,emissive:springColor,emissiveIntensity:.4});
  const springPoints=Array.from({length:40},(_,i)=>new T.Vector3(side*.75+Math.cos(i*Math.PI/3)*.07,.38+i*.008,z+Math.sin(i*Math.PI/3)*.07));
  add(new T.TubeGeometry(new T.CatmullRomCurve3(springPoints),36,.024,6,false),springMat);
 }

 // Hero Customizations for Fallback Karts
 switch(c.id){
  case 'rello':{
   for(const s of [-1,1]){
    crest(s*.54,1.08,-.98,.68,.88,-s*.22,fin);
    crest(s*.88,.82,-.42,.62,.58,-s*.52,fin);
    crest(s*.82,.72,.28,.48,.44,-s*.68,fin);
   }
   break;
  }
  case 'chora':{
   // Gold ♫ emblem on front hood + magenta crystal wings
   const noteDecal=add(new T.PlaneGeometry(.62,.42),new T.MeshBasicMaterial({map:createKartFlankTexture('note','#6b1452','#ffd447'),transparent:true,side:T.DoubleSide}),0,.66,.95);
   noteDecal.rotation.x=-Math.PI/2+.2;
   for(const s of [-1,1]){
    for(let j=0;j<3;j++){
     crest(s*(.56+j*.12),.88,-.92+j*.55,.58,.56+j*.05,-s*(.32+j*.22),fin);
    }
    const speaker=add(new T.TorusGeometry(.18,.06,8,16),gold,s*.44,.52,-1.52);
    speaker.rotation.y=Math.PI;
   }
   break;
  }
  case 'moki':{
   tube([[-.72,.68,-.75],[-.78,1.55,-.72],[-.45,1.88,-.45],[.45,1.88,-.45],[.78,1.55,-.72],[.72,.68,-.75]],.075,wood);
   for(const s of [-1,1]){
    crest(s*.82,1.45,-.65,.42,.38,-s*.65,fin);
    crest(s*.84,.78,-.2,.52,.48,-s*.5,fin);
   }
   add(new T.ConeGeometry(.12,.26,10),lamp,.86,1.35,.22);
   break;
  }
  case 'fenn':{
   for(const s of [-1,1])for(let j=0;j<3;j++){
    const feather=crest(s*(.54+j*.18),.88+j*.04,-.92+j*.36,.44,.72-j*.08,-s*(.35+j*.22),j%2?ivory:fin);
    feather.rotation.x=-.28;
   }
   break;
  }
  default:{
   for(const s of [-1,1]){
    crest(s*.58,.96,-.92,.55,.68,-s*.28,fin);
    crest(s*.84,.78,-.25,.48,.45,-s*.55,accent);
   }
   break;
  }
 }

 // Upgrade asynchronously with Blender-sculpted karts.glb meshes (preserving vertex-painted gradients & cosmic speckles)
 const applyBlenderKartMaterial=(o:T.Object3D)=>{
  o.traverse(node=>{
   if(node instanceof T.Mesh){
    node.castShadow=true;node.receiveShadow=true;
    const hasVcol=node.geometry.hasAttribute('color');
    const oldMat=node.material as T.MeshStandardMaterial;
    const isGlow=oldMat?.name?.includes('Glow')||false;
    const upgraded=new T.MeshPhysicalMaterial({
     color:hasVcol?'#ffffff':(oldMat?.color||paintColor),
     vertexColors:hasVcol,
     metalness:isGlow?.18:.38,
     roughness:isGlow?.14:.20,
     clearcoat:1,
     clearcoatRoughness:.1,
     envMapIntensity:1.5,
     emissive:isGlow?new T.Color('#ffffff'):new T.Color('#000000'),
     emissiveIntensity:isGlow?.52:0,
    });
    if(isGlow&&hasVcol){
     upgraded.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace(
       'vec3 totalEmissiveRadiance = emissive;',
       'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'
      );
     };
    }
    node.material=upgraded;
   }
  });
 };

 loadKartsGlb().then(glbRoot=>{
  const template=glbRoot.getObjectByName(`kart_${c.id}`);
  if(!template) return;
  const glbChassis=template.getObjectByName(`${c.id}_chassis`);
  if(glbChassis){
   const clonedChassis=glbChassis.clone(true);
   clonedChassis.position.set(0,0,0);
   applyBlenderKartMaterial(clonedChassis);
   while(chassisGroup.children.length>0) chassisGroup.remove(chassisGroup.children[0]);
   chassisGroup.add(clonedChassis);
  }
  const wheelNames=['rl','rr','fl','fr'];
  wheelNames.forEach((wn,idx)=>{
   const glbWheel=template.getObjectByName(`${c.id}_wheel_${wn}`);
   const targetWheel=wheels[idx];
   if(glbWheel&&targetWheel){
    const clonedWheel=glbWheel.clone(true);
    const wBox=new T.Box3().setFromObject(clonedWheel);
    const wCenter=wBox.getCenter(new T.Vector3());
    targetWheel.position.copy(wCenter);
    clonedWheel.position.sub(wCenter);
    while(targetWheel.children.length>0) targetWheel.remove(targetWheel.children[0]);
    applyBlenderKartMaterial(clonedWheel);
    targetWheel.add(clonedWheel);
   }
  });
 }).catch(()=>{});

 return {body,wheels,exhaustPorts};
}

