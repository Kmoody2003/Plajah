import * as T from 'three';
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
  for(let i=0;i<120;i++){
   const x=(i*37)%256, y=(i*59)%128, r=0.8+(i%3)*0.7;
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
 const isRello=c.id==='rello', isChora=c.id==='chora', isMoki=c.id==='moki', isFenn=c.id==='fenn';
 const rugged=['moki','bram','tavi'].includes(c.id);
 const sleek=['fenn','zippi','nori','luma'].includes(c.id);

 // Materials faithfully matching concept art
 const paintColor=isRello?'#141424':c.color;
 const paint=new T.MeshPhysicalMaterial({
  color:paintColor,
  metalness:isRello?.55:.32,
  roughness:isRello?.22:.30,
  clearcoat:1,
  clearcoatRoughness:.15
 });
 const accent=new T.MeshPhysicalMaterial({
  color:c.accent,
  metalness:.3,
  roughness:.25,
  clearcoat:1,
  emissive:isRello?'#ff6200':isChora?'#e8258b':c.accent,
  emissiveIntensity:isRello?.32:isChora?.25:.12
 });
 const fin=new T.MeshPhysicalMaterial({
  color:isRello?'#ff7b00':c.fin,
  metalness:.15,
  roughness:.18,
  clearcoat:1,
  emissive:isRello?'#ff5900':c.fin,
  emissiveIntensity:isRello?.5:.35
 });
 const ivory=new T.MeshStandardMaterial({color:'#fff9ed',roughness:.35,metalness:.12});
 const dark=new T.MeshStandardMaterial({color:'#11131e',roughness:.65});
 const rubber=new T.MeshStandardMaterial({color:'#14141c',roughness:.92});
 const metal=new T.MeshStandardMaterial({color:'#a8b3c4',metalness:.85,roughness:.22});
 const gold=new T.MeshStandardMaterial({color:'#f4c542',metalness:.88,roughness:.25,emissive:'#d49b20',emissiveIntensity:.25});
 const lamp=new T.MeshStandardMaterial({color:'#fff1b4',emissive:'#ffaa33',emissiveIntensity:2});
 const wood=new T.MeshStandardMaterial({color:'#5c3d26',roughness:.85,bumpScale:.08});

 const add=(g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0,parent:T.Object3D=body)=>{
  const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
 };
 const rounded=(sx:number,sy:number,sz:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=body)=>add(new RoundedBoxGeometry(sx,sy,sz,2,.12),m,x,y,z,parent);
 const oval=(sx:number,sy:number,sz:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=body)=>{
  const o=add(new T.SphereGeometry(1,16,10),m,x,y,z,parent);o.scale.set(sx,sy,sz);return o;
 };
 const crest=(x:number,y:number,z:number,sx:number,sy:number,angle:number,m:T.Material=fin,parent:T.Object3D=body)=>{
  const o=add(crestGeometry(),m,x,y,z,parent);o.scale.set(sx,sy,1);o.rotation.z=angle;return o;
 };
 const tube=(points:number[][],radius:number,m:T.Material,parent:T.Object3D=body)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p as [number,number,number]))),16,radius,6,false),m,0,0,0,parent);

 // Main Chassis Bed & Underbody Floor
 rounded(1.65,.28,2.75,dark,0,.55,0);
 const mainBody=oval(.84,.4,sleek?1.65:1.35,paint,0,.78,.1);
 if(isRello){
  const micaTex=createKartFlankTexture('stars','#121222','#ff9d00');
  mainBody.material=new T.MeshPhysicalMaterial({map:micaTex,metalness:.5,roughness:.2,clearcoat:1});
 }

 // Cockpit, padded bucket seat & sport steering wheel
 rounded(.96,.18,1.15,dark,0,.96,-.3);
 rounded(.88,.8,.24,dark,0,1.24,-.78);
 rounded(.7,.62,.04,accent,0,1.26,-.93);
 const steering=add(new T.TorusGeometry(.24,.04,6,18),dark,0,1.22,.44);
 steering.rotation.x=-.55;
 tube([[0,.82,.5],[0,1.16,.43]],.04,metal);

 // Front bumper & jaw splitter
 if(isRello){
  // Angular white jaw splitter with geometric triangular teeth vents matching concept art
  const jaw=rounded(1.72,.34,.32,ivory,0,.58,1.44);
  jaw.rotation.x=-.18;
  for(const side of [-1,1]){
   // Triangular intake cuts in jaw
   const tooth1=rounded(.2,.12,.08,dark,side*.45,.57,1.59);tooth1.rotation.z=side*.4;
   const tooth2=rounded(.16,.1,.08,dark,side*.22,.54,1.59);tooth2.rotation.z=-side*.3;
   // Headlamp lenses angled like predatory eyes
   const eye=oval(.32,.09,.11,lamp,side*.52,.96,1.26);eye.rotation.z=-side*.28;
  }
 } else if(isMoki){
  // Organic wooden nose mask with leafy crest
  const mask=rounded(1.6,.36,.3,wood,0,.6,1.42);mask.rotation.x=-.15;
  crest(0,.98,1.38,.6,.55,0,fin);
  for(const side of [-1,1]){
   oval(.26,.1,.1,lamp,side*.48,.92,1.22);
  }
 } else {
  const bumper=rounded(1.65,.32,.25,ivory,0,.58,1.4);bumper.rotation.x=-.15;
  for(const side of [-1,1]){
   const light=oval(.29,.085,.09,lamp,side*.51,.94,1.25);light.rotation.z=-side*.25;
   rounded(.26,.105,.045,dark,side*.49,.59,1.54).rotation.z=side*.35;
  }
 }

 // Dual Rocket Exhaust Nozzles in Rear (Prominent on all karts, massive on Ember Fang)
 const exhaustPorts:T.Vector3[]=[];
 for(const side of [-1,1]){
  const exX=side*(isRello?.58:.65);
  const exY=.64;
  const exZ=-1.52;
  exhaustPorts.push(new T.Vector3(exX,exY,exZ));
  // Exhaust housing barrel
  const barrel=add(new T.CylinderGeometry(.22,.22,.48,16),metal,exX,exY,exZ+.12);
  barrel.rotation.x=Math.PI/2;
  // Outer nozzle ring with accent/fin glow
  const rimNozzle=add(new T.TorusGeometry(.21,.045,8,18),accent,exX,exY,exZ-.12);
  rimNozzle.rotation.y=Math.PI;
  // Inner turbine flame chamber (glowing core)
  const chamber=add(new T.CylinderGeometry(.14,.14,.22,12),lamp,exX,exY,exZ-.02);
  chamber.rotation.x=Math.PI/2;
  // Side aerodynamic fairing pod
  oval(.44,.28,.84,paint,side*.8,.81,0);
 }

 // Wheels, Heavy-duty Coilover Springs, and Thematic Rims
 const wheels:T.Group[]=[];
 for(const side of [-1,1])for(const z of [-.87,.91]){
  const wheel=new T.Group();
  wheel.position.set(side*1.05,.46,z);
  body.add(wheel);wheels.push(wheel);
  const radius=rugged?.49:.44;
  // Thick racing rubber tire
  const tire=add(new T.CylinderGeometry(radius,radius,.38,22),rubber,0,0,0,wheel);
  tire.rotation.z=Math.PI/2;
  // Deep-dish alloy rim
  const rim=add(new T.CylinderGeometry(radius*.66,radius*.66,.4,18),metal,0,0,0,wheel);
  rim.rotation.z=Math.PI/2;
  // Glowing colored outer rim band
  const bandColor=isRello?'#ff7300':isChora?'#e8258b':isMoki?'#bee16f':isFenn?'#54e1ff':c.accent;
  const bandMat=new T.MeshStandardMaterial({color:bandColor,emissive:bandColor,emissiveIntensity:1.2});
  const ring=add(new T.TorusGeometry(radius*.78,.032,6,22),bandMat,side*.201,0,0,wheel);
  ring.rotation.y=Math.PI/2;
  // Central hub with crest
  const hub=add(new T.CylinderGeometry(.14,.14,.44,14),accent,0,0,0,wheel);
  hub.rotation.z=Math.PI/2;

  // Thematic rim spokes:
  if(isChora){
   // Swirl rim design
   for(let j=0;j<5;j++){
    const a=j*Math.PI*2/5;
    const spoke=add(new RoundedBoxGeometry(.032,.08,.44,1,.015),accent,side*.21,Math.cos(a)*radius*.35,Math.sin(a)*radius*.35,wheel);
    spoke.rotation.x=a+Math.PI/6;
   }
  } else {
   // Heavy star alloy spokes
   for(let j=0;j<6;j++){
    const spoke=add(new RoundedBoxGeometry(.035,.07,.49,1,.015),paint,side*.21,0,0,wheel);
    spoke.rotation.x=j*Math.PI/3;
   }
  }
  // High-grip tire treads
  for(let j=0;j<14;j++){
   const a=j*Math.PI/7;
   const tread=add(new T.BoxGeometry(.39,.03,rugged?.14:.07),rubber,0,Math.cos(a)*radius,Math.sin(a)*radius,wheel);
   tread.rotation.x=a;
  }
  // Exposed Coilover Suspension Springs outside the fairings
  const springColor=isRello?'#ff6a00':isMoki?'#78ba5e':c.accent;
  const springMat=new T.MeshStandardMaterial({color:springColor,metalness:.7,roughness:.28,emissive:springColor,emissiveIntensity:.35});
  const springPoints=Array.from({length:52},(_,i)=>new T.Vector3(side*.8+Math.cos(i*Math.PI/4)*.075,.46+i*.008,z+Math.sin(i*Math.PI/4)*.075));
  add(new T.TubeGeometry(new T.CatmullRomCurve3(springPoints),50,.024,6,false),springMat);
 }

 // Hero Customizations for Specific Kith Karts (Concept Art Alignment)
 switch(c.id){
  case 'rello':{
   // Ember Fang: Sharp glowing orange crystal spikes along flanks, dorsal hood, and rear spoiler
   for(const s of [-1,1]){
    crest(s*.88,.94,-.92,.75,.7,-s*.37,fin);
    crest(s*.9,.94,.38,.5,.45,-s*.65,fin);
    crest(s*.44,1.06,-1.05,.45,.62,-s*.18,fin);
    crest(s*.95,.95,-.35,.55,.5,-s*.45,fin);
   }
   // Center dorsal spine crystal
   crest(0,1.25,-1.15,.55,.7,0,fin);
   break;
  }
  case 'chora':{
   // Petal Pulse: Musical note "♫" decal on flank, swept magenta crystal wings
   for(const s of [-1,1]){
    const flankDecal=add(new T.PlaneGeometry(.6,.35),new T.MeshBasicMaterial({map:createKartFlankTexture('note','#823485','#ffd154'),transparent:true,side:T.DoubleSide}),s*.96,.84,-.2);
    flankDecal.rotation.y=s*Math.PI/2;
    for(let j=0;j<3;j++){
     crest(s*(.62+j*.11),.86,-.9+j*.66,.62,.48+j*.04,-s*(.45+j*.25),fin);
    }
    const speaker=add(new T.TorusGeometry(.19,.07,8,16),gold,s*.65,1.04,-1.03);
    speaker.rotation.y=Math.PI;
    oval(.14,.14,.06,dark,s*.65,1.04,-1.06);
   }
   break;
  }
  case 'moki':{
   // Grove Runner: Living gnarly branch roll cage, leafy green crystal wings, hanging lantern
   tube([[-.82,.85,-.85],[-.88,1.8,-.88],[-.5,2.15,-.9],[.5,2.15,-.9],[.88,1.8,-.88],[.82,.85,-.85]],.08,wood);
   tube([[0,2.15,-.9],[0,1.7,.4]],.065,wood);
   for(const s of [-1,1]){
    crest(s*.92,1.7,-.92,.42,.35,-s*.8,fin);
    crest(s*.85,.94,.7,.48,.42,-s*.8,fin);
    crest(s*.9,.92,-.2,.52,.48,-s*.5,fin);
   }
   // Hanging warm amber lantern
   const lanternPost=tube([[.65,1.9,-.88],[.78,1.98,-.75]],.03,metal);
   const lanternBody=add(new T.CylinderGeometry(.08,.1,.22,8),lamp,.78,1.8,-.75);
   const lanternCap=add(new T.ConeGeometry(.12,.08,8),gold,.78,1.94,-.75);
   break;
  }
  case 'fenn':{
   // Frostwing: Sweeping multi-layered feathered ice-crystal wings
   for(const s of [-1,1])for(let j=0;j<4;j++){
    const feather=crest(s*(.6+j*.18),.9+j*.04,-.95+j*.32,.42,.68-j*.08,-s*(.52+j*.22),j%2?ivory:fin);
    feather.rotation.x=-.35;
   }
   oval(.52,.2,.92,fin,0,1.02,.8);
   break;
  }
  case 'zippi':{
   for(const s of [-1,1]){
    crest(s*.55,1,-1,.27,.8,-s*.21,accent);
    rounded(.16,.14,1.7,fin,s*.73,.93,.2);
   }
   oval(.38,.23,.8,accent,0,1.01,.8);
   break;
  }
  case 'nori':{
   for(const s of [-1,1]){
    const wing=oval(.65,.13,.86,accent,s*.92,.88,.1);
    wing.rotation.z=s*.17;
    crest(s*.7,.87,-.95,.5,.45,-s*.8);
   }
   tube([[-.5,1.02,.7],[0,1.17,1.5],[.5,1.02,.7]],.055,ivory);
   break;
  }
  case 'pippa':{
   for(const s of [-1,1])for(let j=0;j<3;j++){
    const wing=crest(s*.83,1,-.87+j*.5,.88,.48,-s*(.95+j*.22));
    wing.rotation.y=s*.3;
   }
   oval(.52,.22,.54,accent,0,1.04,.91);
   break;
  }
  case 'bram':{
   for(const s of [-1,1]){
    rounded(.62,.39,1.98,paint,s*.86,.96,0);
    crest(s*.62,1.1,-.85,.57,.43,-s*.2,ivory);
   }
   rounded(1.76,.2,.33,metal,0,.63,1.54);
   break;
  }
  case 'luma':{
   const halo=add(new T.TorusGeometry(.65,.08,8,28,Math.PI*1.65),fin,0,1.55,-1.03);
   halo.rotation.z=.5;
   for(const s of [-1,1])crest(s*.86,.88,.1,.49,.48,-s*1.05,accent);
   break;
  }
  case 'tavi':{
   for(const s of [-1,1]){
    const turbine=add(new T.CylinderGeometry(.27,.27,.83,16),metal,s*.78,1.03,-.82);
    turbine.rotation.x=Math.PI/2;
    const ring=add(new T.TorusGeometry(.22,.06,6,18),fin,s*.78,1.03,-1.26);
    ring.rotation.y=Math.PI;
   }
   rounded(1.83,.11,.42,accent,0,1.47,-1.05);
   break;
  }
 }

 return {body,wheels,exhaustPorts};
}
