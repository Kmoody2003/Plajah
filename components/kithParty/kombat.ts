/**
 * Kart Kombat — free-roam battle-royale arena for Kith Party.
 * Deterministic fixed-step rules, no DOM / three.js. 8 karts, 3 lives each, a shrinking storm,
 * scattered item crates, and every Kith type's signature special adapted to open-arena fighting.
 */
import {kithKart,kartPhysics,rollItem,BOOST_SPEED_BONUS,SPECIAL_FILL_SECONDS,type ItemId,type SpecialId} from './abilities';

export interface KombatInput { x:number; y:number; action:boolean; item:boolean; special:boolean; }
export const emptyKombatInput=():KombatInput=>({x:0,y:0,action:false,item:false,special:false});

export const ARENA_RADIUS=150;
export const PLATFORM_RADIUS=22;
export const PLATFORM_HEIGHT=4;
export const KART_RADIUS=1.6;
export const MATCH_SECONDS=210;
export const MAX_HP=100;
export const START_LIVES=3;
const GRAVITY=22;

export interface CoverBox { x:number; z:number; hw:number; hd:number; h:number; kind:'block'|'wall'|'crate-stack'; }
export interface Pillar { x:number; z:number; r:number; h:number; }
/** A wedge: rises from 0 at the foot to `height` at the lip, along direction `angle` (forward = (sin,cos)). */
export interface Ramp { x:number; z:number; angle:number; length:number; width:number; height:number; base:number; kind:'jump'|'platform'; }
export interface BoostPad { x:number; z:number; angle:number; }
export interface Crate { id:number; x:number; z:number; gold:boolean; active:boolean; respawn:number; y:number; }

export interface Arena { radius:number; cover:CoverBox[]; pillars:Pillar[]; ramps:Ramp[]; pads:BoostPad[]; }

export type ProjectileKind='seed-bolt'|'homing-hornet'|'riptide';
export interface Projectile { id:number; kind:ProjectileKind; owner:number; x:number; z:number; y:number; vx:number; vz:number; life:number; bounces:number; target:number; hit:number[]; }

export type TrapKind='goo-mine'|'bramble'|'ice-slick'|'fire';
export interface Trap { id:number; kind:TrapKind; owner:number; x:number; z:number; r:number; life:number; }

export type KombatEventType='spawn'|'drop'|'hit'|'block'|'ko'|'eliminated'|'explode'|'pickup'|'item'|'special'|'boost'|'storm'|'win'|'reflect';
export interface KombatEvent { t:number; type:KombatEventType; kart:number; by:number; x:number; z:number; y:number; item?:ItemId; special?:SpecialId; targets?:number[]; amount?:number; }

export interface KombatKart {
 index:number; character:string; human:boolean;
 x:number; z:number; y:number; vy:number; heading:number; vx:number; vz:number;
 speed:number; steer:number; grounded:boolean; airTime:number;
 drift:number; driftDir:number; driftStage:number; boost:number; padCooldown:number;
 pitch:number; roll:number; jounce:number; jounceVel:number;
 hp:number; lives:number; shield:number; reflect:number; invuln:number;
 spin:number; stun:number; frozen:number; slow:number; blind:number; flash:number;
 item:ItemId|null; itemUses:number; roulette:number; pendingItem:ItemId|null;
 special:number; specialActive:number; specialId:SpecialId; fireTrail:number;
 kos:number; deaths:number; eliminated:boolean; placement:number; respawn:number; lastHitBy:number; lastHitAt:number;
 lastAction:boolean; lastItem:boolean; lastSpecial:boolean;
 ai:{tx:number;tz:number;target:number;timer:number;driftHold:number;think:number};
}

export interface Storm { cx:number; cz:number; r:number; fromCx:number; fromCz:number; fromR:number; toCx:number; toCz:number; toR:number; phase:number; timer:number; shrinking:boolean; dps:number; }

export interface KombatState {
 time:number; phase:'countdown'|'playing'|'finished'; seed:number; nextId:number;
 arena:Arena; karts:KombatKart[]; projectiles:Projectile[]; traps:Trap[]; crates:Crate[];
 storm:Storm; events:KombatEvent[]; winner:number|null; eliminatedOrder:number[];
}

/** wait seconds, shrink seconds, target radius, damage per second outside */
export const STORM_PHASES:[number,number,number,number][]=[
 [30,20,100,4],
 [25,20,60,6],
 [20,18,32,9],
 [15,15,12,14],
];
const FINAL_DPS=20;

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const wrapAngle=(a:number)=>{while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;};
function rnd(s:KombatState){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
export const forwardOf=(h:number)=>({x:Math.sin(h),z:Math.cos(h)});
/** Screen-right when viewed from behind the kart. Steering right decreases heading. */
export const rightOf=(h:number)=>({x:-Math.cos(h),z:Math.sin(h)});

export function buildArena():Arena {
 const cover:CoverBox[]=[];
 const pillars:Pillar[]=[];
 const ramps:Ramp[]=[];
 const pads:BoostPad[]=[];
 // Ring of cover blocks at mid radius, offset so lanes stay open
 for(let i=0;i<8;i++){
  const a=i/8*Math.PI*2+Math.PI/8;
  const r=72;
  const along=i%2===0;
  cover.push({x:Math.sin(a)*r,z:Math.cos(a)*r,hw:along?7:2.2,hd:along?2.2:7,h:3.2,kind:i%2?'wall':'block'});
 }
 // Outer crate stacks
 for(let i=0;i<6;i++){
  const a=i/6*Math.PI*2+.31;
  cover.push({x:Math.sin(a)*112,z:Math.cos(a)*112,hw:3,hd:3,h:2.6,kind:'crate-stack'});
 }
 // Inner pillars around the platform
 for(let i=0;i<6;i++){
  const a=i/6*Math.PI*2+Math.PI/6;
  pillars.push({x:Math.sin(a)*42,z:Math.cos(a)*42,r:2.4,h:9});
 }
 // Four platform ramps, rising toward the centre (lip meets the platform edge)
 for(let i=0;i<4;i++){
  const a=i/4*Math.PI*2;
  const len=16;
  const foot=PLATFORM_RADIUS+len;
  // ramp forward direction points toward centre
  const angle=a+Math.PI;
  ramps.push({x:Math.sin(a)*foot,z:Math.cos(a)*foot,angle,length:len,width:9,height:PLATFORM_HEIGHT,base:0,kind:'platform'});
 }
 // Four jump ramps out in the field, pointing tangentially
 for(let i=0;i<4;i++){
  const a=i/4*Math.PI*2+Math.PI/4;
  const r=96;
  const angle=a+Math.PI/2;
  ramps.push({x:Math.sin(a)*r,z:Math.cos(a)*r,angle,length:13,width:8,height:3.2,base:0,kind:'jump'});
 }
 // Boost pads on the spokes between ramps
 for(let i=0;i<8;i++){
  const a=i/8*Math.PI*2;
  const r=i%2?128:58;
  pads.push({x:Math.sin(a)*r,z:Math.cos(a)*r,angle:a+(i%2?Math.PI/2:Math.PI)});
 }
 return {radius:ARENA_RADIUS,cover,pillars,ramps,pads};
}

/** Local ramp coordinates: u along the ramp from foot (0) to lip (length), v across. */
function rampLocal(r:Ramp,x:number,z:number){
 const f=forwardOf(r.angle),rt=rightOf(r.angle);
 const dx=x-r.x,dz=z-r.z;
 return {u:dx*f.x+dz*f.z,v:dx*rt.x+dz*rt.z};
}

export function groundAt(arena:Arena,x:number,z:number):number {
 let g=0;
 if(Math.hypot(x,z)<=PLATFORM_RADIUS) g=PLATFORM_HEIGHT;
 for(const r of arena.ramps){
  const {u,v}=rampLocal(r,x,z);
  if(u>=0&&u<=r.length&&Math.abs(v)<=r.width/2){
   g=Math.max(g,r.base+(u/r.length)*r.height);
  }
 }
 return g;
}

function crateLayout(s:KombatState){
 let id=0;
 const ring=(n:number,r:number,off:number,gold=false)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2+off;s.crates.push({id:id++,x:Math.sin(a)*r,z:Math.cos(a)*r,gold,active:true,respawn:0,y:0});}};
 ring(10,132,0);
 ring(8,88,.2);
 ring(6,52,.5);
 // rare gold crates on the platform
 ring(3,9,0,true);
 for(const c of s.crates)c.y=groundAt(s.arena,c.x,c.z);
}

export function createKombatState(characters:string[],seed=777):KombatState {
 const roster=['moki','zippi','nori','pippa','bram','luma','tavi','fenn','rello','chora'];
 const ids=[...characters,...roster.filter(c=>!characters.includes(c))].slice(0,8);
 const arena=buildArena();
 const s:KombatState={
  time:-3,phase:'countdown',seed:seed>>>0||1,nextId:1,arena,karts:[],projectiles:[],traps:[],crates:[],
  storm:{cx:0,cz:0,r:ARENA_RADIUS+10,fromCx:0,fromCz:0,fromR:ARENA_RADIUS+10,toCx:0,toCz:0,toR:STORM_PHASES[0][2],phase:0,timer:STORM_PHASES[0][0],shrinking:false,dps:STORM_PHASES[0][3]},
  events:[],winner:null,eliminatedOrder:[],
 };
 ids.forEach((character,i)=>{
  const a=i/ids.length*Math.PI*2;
  const r=118;
  const x=Math.sin(a)*r,z=Math.cos(a)*r;
  s.karts.push({
   index:i,character,human:i<characters.length,
   x,z,y:0,vy:0,heading:a+Math.PI,vx:0,vz:0,speed:0,steer:0,grounded:true,airTime:0,
   drift:0,driftDir:0,driftStage:0,boost:0,padCooldown:0,
   pitch:0,roll:0,jounce:0,jounceVel:0,
   hp:MAX_HP,lives:START_LIVES,shield:0,reflect:0,invuln:0,
   spin:0,stun:0,frozen:0,slow:0,blind:0,flash:0,
   item:null,itemUses:0,roulette:0,pendingItem:null,
   special:.25,specialActive:0,specialId:kithKart(character).special.id,fireTrail:0,
   kos:0,deaths:0,eliminated:false,placement:0,respawn:0,lastHitBy:-1,lastHitAt:-99,
   lastAction:false,lastItem:false,lastSpecial:false,
   ai:{tx:0,tz:0,target:-1,timer:0,driftHold:0,think:0},
  });
 });
 crateLayout(s);
 return s;
}

function emit(s:KombatState,e:Omit<KombatEvent,'t'|'y'>&{y?:number}){
 s.events.push({t:s.time,y:0,...e});
 if(s.events.length>160) s.events.splice(0,s.events.length-160);
}

export const isActive=(k:KombatKart)=>!k.eliminated&&k.respawn<=0;
export const aliveKarts=(s:KombatState)=>s.karts.filter(k=>!k.eliminated);

/** Place 0-based among the living by KOs then HP — used for item weighting. */
function placeOf(s:KombatState,k:KombatKart){
 const sorted=[...s.karts].sort((a,b)=>(b.kos*1000+b.lives*200+b.hp)-(a.kos*1000+a.lives*200+a.hp));
 return sorted.indexOf(k);
}

// ---------------- damage, KO, respawn ----------------

export function damage(s:KombatState,k:KombatKart,amount:number,by:number,opts:{spin?:number;stun?:number;knock?:{x:number;z:number};blockable?:boolean}={}):boolean {
 if(!isActive(k)||k.invuln>0) return false;
 if(k.specialActive>0&&k.specialId==='boulder-bash') {emit(s,{type:'block',kart:k.index,by,x:k.x,z:k.z});return false;}
 if(k.shield>0&&opts.blockable!==false){
  k.shield--;k.invuln=.35;
  emit(s,{type:'block',kart:k.index,by,x:k.x,z:k.z});
  return false;
 }
 k.hp-=amount;k.flash=.35;
 if(by>=0&&by!==k.index){k.lastHitBy=by;k.lastHitAt=s.time;const att=s.karts[by];if(att)att.special=Math.min(1,att.special+.12);}
 if(opts.spin) {k.spin=Math.max(k.spin,opts.spin);k.drift=0;k.driftStage=0;k.driftDir=0;}
 if(opts.stun) k.stun=Math.max(k.stun,opts.stun);
 if(opts.knock){k.vx+=opts.knock.x;k.vz+=opts.knock.z;}
 k.jounceVel=-1.6;
 emit(s,{type:'hit',kart:k.index,by,x:k.x,z:k.z,y:k.y,amount});
 if(k.hp<=0) knockOut(s,k,by);
 return true;
}

function knockOut(s:KombatState,k:KombatKart,by:number){
 const credit=by>=0&&by!==k.index?by:(s.time-k.lastHitAt<6?k.lastHitBy:-1);
 if(credit>=0&&s.karts[credit]) s.karts[credit].kos++;
 k.hp=0;k.lives--;k.deaths++;
 k.item=null;k.roulette=0;k.pendingItem=null;k.itemUses=0;k.shield=0;k.boost=0;k.specialActive=0;
 emit(s,{type:'explode',kart:k.index,by:credit,x:k.x,z:k.z,y:k.y});
 emit(s,{type:'ko',kart:k.index,by:credit,x:k.x,z:k.z,y:k.y});
 if(k.lives<=0){
  k.eliminated=true;
  s.eliminatedOrder.push(k.index);
  const alive=aliveKarts(s).length;
  k.placement=alive+1;
  emit(s,{type:'eliminated',kart:k.index,by:credit,x:k.x,z:k.z});
 } else {
  k.respawn=2.4;
 }
}

function pointInStorm(s:KombatState,margin:number){
 const st=s.storm;
 const r=Math.max(2,Math.min(st.toR,st.r)-margin);
 for(let tries=0;tries<30;tries++){
  const a=rnd(s)*Math.PI*2,d=Math.sqrt(rnd(s))*r;
  const x=st.toR<st.r?st.toCx+Math.sin(a)*d:st.cx+Math.sin(a)*d;
  const z=st.toR<st.r?st.toCz+Math.cos(a)*d:st.cz+Math.cos(a)*d;
  if(Math.hypot(x,z)>ARENA_RADIUS-6) continue;
  if(blockedAt(s.arena,x,z,KART_RADIUS+1)) continue;
  return {x,z};
 }
 return {x:st.cx,z:st.cz};
}

function respawnKart(s:KombatState,k:KombatKart){
 const p=pointInStorm(s,6);
 k.x=p.x;k.z=p.z;k.y=groundAt(s.arena,p.x,p.z)+26;k.vy=-6;k.vx=0;k.vz=0;k.grounded=false;
 k.heading=Math.atan2(-p.x,-p.z);
 k.hp=MAX_HP;k.invuln=2.6;k.spin=0;k.stun=0;k.frozen=0;k.slow=0;k.blind=0;k.drift=0;k.driftStage=0;k.driftDir=0;
 emit(s,{type:'drop',kart:k.index,by:-1,x:k.x,z:k.z,y:k.y});
}

// ---------------- collision helpers ----------------

function blockedAt(a:Arena,x:number,z:number,r:number):boolean {
 if(Math.hypot(x,z)>a.radius-r) return true;
 for(const c of a.cover) if(Math.abs(x-c.x)<c.hw+r&&Math.abs(z-c.z)<c.hd+r) return true;
 for(const p of a.pillars) if(Math.hypot(x-p.x,z-p.z)<p.r+r) return true;
 return false;
}

/** Push a circle out of walls/cover; returns surface normal if a collision occurred. */
function resolveStatic(a:Arena,o:{x:number;z:number;y:number},r:number):{nx:number;nz:number}|null {
 let hit:{nx:number;nz:number}|null=null;
 const d=Math.hypot(o.x,o.z);
 if(d>a.radius-r){const nx=-o.x/d,nz=-o.z/d;o.x=-nx*(a.radius-r);o.z=-nz*(a.radius-r);hit={nx,nz};}
 for(const c of a.cover){
  if(o.y>c.h-.2) continue;
  const cx=clamp(o.x,c.x-c.hw,c.x+c.hw),cz=clamp(o.z,c.z-c.hd,c.z+c.hd);
  let dx=o.x-cx,dz=o.z-cz;const dd=Math.hypot(dx,dz);
  if(dd<r){
   if(dd<1e-4){ // centre inside the box: push out along shortest axis
    const px=c.hw-Math.abs(o.x-c.x),pz=c.hd-Math.abs(o.z-c.z);
    if(px<pz){dx=Math.sign(o.x-c.x)||1;dz=0;o.x=c.x+dx*(c.hw+r);}else{dz=Math.sign(o.z-c.z)||1;dx=0;o.z=c.z+dz*(c.hd+r);}
    hit={nx:dx,nz:dz};
   } else {
    const nx=dx/dd,nz=dz/dd;o.x=cx+nx*r;o.z=cz+nz*r;hit={nx,nz};
   }
  }
 }
 for(const p of a.pillars){
  if(o.y>p.h) continue;
  const dx=o.x-p.x,dz=o.z-p.z,dd=Math.hypot(dx,dz);
  if(dd<p.r+r&&dd>1e-4){const nx=dx/dd,nz=dz/dd;o.x=p.x+nx*(p.r+r);o.z=p.z+nz*(p.r+r);hit={nx,nz};}
 }
 return hit;
}

// ---------------- items & specials ----------------

function inFront(k:KombatKart,o:KombatKart,cone:number,range:number){
 const f=forwardOf(k.heading);const dx=o.x-k.x,dz=o.z-k.z,d=Math.hypot(dx,dz);
 if(d>range||d<.01) return false;
 return (dx*f.x+dz*f.z)/d>=cone;
}

function nearestTarget(s:KombatState,k:KombatKart,cone:number,range:number,exclude:number[]=[]):KombatKart|null {
 let best:KombatKart|null=null,bd=Infinity;
 for(const o of s.karts){
  if(o===k||!isActive(o)||exclude.includes(o.index)) continue;
  if(cone>-1&&!inFront(k,o,cone,range)) continue;
  const d=Math.hypot(o.x-k.x,o.z-k.z);
  if(d<=range&&d<bd){bd=d;best=o;}
 }
 return best;
}

function addTrap(s:KombatState,kind:TrapKind,owner:number,x:number,z:number,r:number,life:number){
 s.traps.push({id:s.nextId++,kind,owner,x,z,r,life});
 if(s.traps.length>60) s.traps.splice(0,s.traps.length-60);
}

function fire(s:KombatState,k:KombatKart,kind:ProjectileKind,speed:number,life:number,target=-1){
 const f=forwardOf(k.heading);
 const fwdSpeed=Math.max(0,k.vx*f.x+k.vz*f.z);
 s.projectiles.push({id:s.nextId++,kind,owner:k.index,x:k.x+f.x*2.6,z:k.z+f.z*2.6,y:k.y+.8,vx:f.x*(speed+fwdSpeed*.5),vz:f.z*(speed+fwdSpeed*.5),life,bounces:kind==='seed-bolt'?4:0,target,hit:[]});
}

function useItem(s:KombatState,k:KombatKart){
 const item=k.item;if(!item) return;
 const f=forwardOf(k.heading);
 emit(s,{type:'item',kart:k.index,by:k.index,x:k.x,z:k.z,item});
 switch(item){
  case 'seed-bolt': fire(s,k,'seed-bolt',70,4); break;
  case 'homing-hornet': {const t=nearestTarget(s,k,.2,110)||nearestTarget(s,k,-1,160);fire(s,k,'homing-hornet',52,6,t?t.index:-1);break;}
  case 'goo-mine': addTrap(s,'goo-mine',k.index,k.x-f.x*3.4,k.z-f.z*3.4,2.6,25); break;
  case 'nitro': case 'triple-nitro': k.boost=Math.max(k.boost,1.35);emit(s,{type:'boost',kart:k.index,by:k.index,x:k.x,z:k.z});break;
  case 'bubble-shield': k.shield=Math.max(k.shield,1); break;
  case 'thunder-crown':
   for(const o of s.karts){if(o!==k&&isActive(o)){damage(s,o,20,k.index,{stun:1.1});o.slow=Math.max(o.slow,2.5);}}
   break;
 }
 if(item==='triple-nitro'){
  k.itemUses--;
  if(k.itemUses>0) return;
 }
 k.item=null;k.itemUses=0;
}

export function useSpecial(s:KombatState,k:KombatKart){
 const id=k.specialId;
 const f=forwardOf(k.heading),rt=rightOf(k.heading);
 const def=kithKart(k.character).special;
 k.special=0;
 k.specialActive=def.duration;
 const targets:number[]=[];
 switch(id){
  case 'inferno-afterburner':
   k.boost=Math.max(k.boost,2.6);k.fireTrail=2.6;break;
  case 'bass-drop':
   for(const o of s.karts){if(o===k||!isActive(o))continue;const dx=o.x-k.x,dz=o.z-k.z,d=Math.hypot(dx,dz);
    if(d<24){const n=d>.01?{x:dx/d,z:dz/d}:{x:f.x,z:f.z};damage(s,o,15,k.index,{knock:{x:n.x*22,z:n.z*22}});o.slow=Math.max(o.slow,1.6);targets.push(o.index);}}
   break;
  case 'bramble-snare':
   addTrap(s,'bramble',k.index,k.x-f.x*5,k.z-f.z*5,6,def.duration);break;
  case 'chain-lightning': {
   const first=nearestTarget(s,k,.25,70)||nearestTarget(s,k,-1,45);
   if(first){targets.push(first.index);damage(s,first,18,k.index,{stun:1});
    const second=nearestTarget(s,first,-1,40,[k.index,first.index]);
    if(second){targets.push(second.index);damage(s,second,14,k.index,{stun:.8});}}
   break;}
  case 'riptide-wave':
   s.projectiles.push({id:s.nextId++,kind:'riptide',owner:k.index,x:k.x+f.x*3,z:k.z+f.z*3,y:k.y,vx:f.x*34,vz:f.z*34,life:def.duration,bounces:0,target:-1,hit:[]});
   break;
  case 'confetti-storm':
   for(const o of s.karts){if(o===k||!isActive(o))continue;const dx=o.x-k.x,dz=o.z-k.z,d=Math.hypot(dx,dz);
    const behind=(dx*f.x+dz*f.z)<0;
    if((behind&&d<45)||d<28){o.blind=Math.max(o.blind,3);o.slow=Math.max(o.slow,2);damage(s,o,6,k.index,{});targets.push(o.index);}}
   break;
  case 'boulder-bash':
   k.invuln=0;k.boost=Math.max(k.boost,.8);break;
  case 'moon-warp': {
   let d=18;
   while(d>0){const nx=k.x+f.x*d,nz=k.z+f.z*d;if(!blockedAt(s.arena,nx,nz,KART_RADIUS)){k.x=nx;k.z=nz;break;}d-=2;}
   const g=groundAt(s.arena,k.x,k.z);if(k.y<g)k.y=g;
   k.invuln=Math.max(k.invuln,1.2);k.boost=Math.max(k.boost,.6);break;}
  case 'gear-shield':
   k.shield=Math.max(k.shield,2);k.reflect=def.duration;break;
  case 'glacier-wake': {
   const t=nearestTarget(s,k,.3,60)||nearestTarget(s,k,-1,30);
   if(t){targets.push(t.index);if(damage(s,t,14,k.index,{}))t.frozen=Math.max(t.frozen,1.6);}
   for(let i=1;i<=3;i++) addTrap(s,'ice-slick',k.index,k.x-f.x*(3+i*4)+rt.x*0,k.z-f.z*(3+i*4),3.4,10);
   break;}
 }
 emit(s,{type:'special',kart:k.index,by:k.index,x:k.x,z:k.z,y:k.y,special:id,targets});
}

// ---------------- bots ----------------

function botInput(s:KombatState,k:KombatKart,dt:number):KombatInput {
 const inp=emptyKombatInput();
 const ai=k.ai;ai.timer-=dt;ai.think-=dt;
 const st=s.storm;
 const distToStorm=Math.hypot(k.x-st.cx,k.z-st.cz);
 let gx=ai.tx,gz=ai.tz;
 const target=nearestTarget(s,k,-1,75);
 ai.target=target?target.index:-1;
 if(distToStorm>st.r-10){gx=st.toR<st.r?st.toCx:st.cx;gz=st.toR<st.r?st.toCz:st.cz;}
 else if(!k.item&&k.roulette<=0){
  let best:Crate|null=null,bd=Infinity;
  for(const c of s.crates){if(!c.active)continue;const d=Math.hypot(c.x-k.x,c.z-k.z);if(Math.hypot(c.x-st.cx,c.z-st.cz)>st.r-4)continue;if(d<bd){bd=d;best=c;}}
  if(best&&bd<90){gx=best.x;gz=best.z;}
  else if(target){gx=target.x;gz=target.z;}
  else if(ai.timer<=0){const p=pointInStorm(s,12);ai.tx=p.x;ai.tz=p.z;ai.timer=4+rnd(s)*3;gx=p.x;gz=p.z;}
 } else if(target){gx=target.x;gz=target.z;}
 else if(ai.timer<=0||Math.hypot(ai.tx-k.x,ai.tz-k.z)<8){const p=pointInStorm(s,12);ai.tx=p.x;ai.tz=p.z;ai.timer=4+rnd(s)*3;gx=p.x;gz=p.z;}

 const desired=Math.atan2(gx-k.x,gz-k.z);
 let diff=wrapAngle(desired-k.heading);
 // obstacle feeler
 const f=forwardOf(k.heading);
 const ahead=10+Math.abs(k.speed)*.25;
 if(blockedAt(s.arena,k.x+f.x*ahead,k.z+f.z*ahead,KART_RADIUS+.5)){
  const lh=k.heading+.7,rh=k.heading-.7;
  const lf=forwardOf(lh),rf=forwardOf(rh);
  const lb=blockedAt(s.arena,k.x+lf.x*ahead,k.z+lf.z*ahead,KART_RADIUS+.5);
  const rb=blockedAt(s.arena,k.x+rf.x*ahead,k.z+rf.z*ahead,KART_RADIUS+.5);
  diff=!lb&&rb?1.2:lb&&!rb?-1.2:diff>=0?1.2:-1.2;
 }
 if(k.blind>0) diff+=Math.sin(s.time*3+k.index)*.6;
 // steering right decreases heading → positive diff means steer left (x<0)
 inp.x=clamp(-diff*1.8,-1,1);
 inp.y=Math.abs(diff)>2.3&&k.speed>10?0:-1;
 // drift on wide turns
 if(ai.driftHold>0){ai.driftHold-=dt;inp.action=true;if(Math.abs(diff)<.25)ai.driftHold=0;}
 else if(Math.abs(diff)>.7&&k.speed>20&&k.grounded&&!k.lastAction){ai.driftHold=.6+rnd(s)*1.4;inp.action=true;}

 if(ai.think<=0){
  ai.think=.25;
  if(k.item&&k.roulette<=0){
   const it=k.item;
   const front=nearestTarget(s,k,.9,65);
   const behind=s.karts.some(o=>o!==k&&isActive(o)&&Math.hypot(o.x-k.x,o.z-k.z)<22&&((o.x-k.x)*f.x+(o.z-k.z)*f.z)<0);
   if(it==='seed-bolt'&&front) inp.item=true;
   else if(it==='homing-hornet'&&nearestTarget(s,k,.2,100)) inp.item=true;
   else if(it==='goo-mine'&&behind) inp.item=true;
   else if((it==='nitro'||it==='triple-nitro')&&Math.abs(diff)<.2) inp.item=true;
   else if(it==='bubble-shield'||it==='thunder-crown') inp.item=true;
  }
  if(k.special>=1){
   const id=k.specialId;
   const near=nearestTarget(s,k,-1,24);
   const front=nearestTarget(s,k,.3,60);
   if((id==='bass-drop'&&near)||(id==='chain-lightning'&&(front||near))||(id==='glacier-wake'&&front)||(id==='riptide-wave'&&nearestTarget(s,k,.8,50))||
      (id==='confetti-storm'&&near)||(id==='boulder-bash'&&near)||(id==='gear-shield'&&k.hp<75)||(id==='bramble-snare'&&s.karts.some(o=>o!==k&&isActive(o)&&Math.hypot(o.x-k.x,o.z-k.z)<30))||
      (id==='inferno-afterburner'&&Math.abs(diff)<.25)||(id==='moon-warp'&&(distToStorm>st.r-14||k.hp<50)))
    inp.special=true;
  }
 }
 // edge-trigger protection: bots release buttons on alternate thinks
 if(inp.item&&k.lastItem) inp.item=false;
 if(inp.special&&k.lastSpecial) inp.special=false;
 return inp;
}

// ---------------- main step ----------------

function stepStorm(s:KombatState,dt:number){
 const st=s.storm;
 if(st.phase>=STORM_PHASES.length){st.dps=FINAL_DPS;return;}
 st.timer-=dt;
 if(!st.shrinking){
  if(st.timer<=0){
   st.shrinking=true;st.timer=STORM_PHASES[st.phase][1];
   st.fromCx=st.cx;st.fromCz=st.cz;st.fromR=st.r;
   emit(s,{type:'storm',kart:-1,by:-1,x:st.toCx,z:st.toCz,amount:st.toR});
  }
 } else {
  const dur=STORM_PHASES[st.phase][1];
  const u=clamp(1-st.timer/dur,0,1);
  st.cx=st.fromCx+(st.toCx-st.fromCx)*u;st.cz=st.fromCz+(st.toCz-st.fromCz)*u;st.r=st.fromR+(st.toR-st.fromR)*u;
  st.dps=STORM_PHASES[st.phase][3];
  if(st.timer<=0){
   st.shrinking=false;st.phase++;
   st.cx=st.toCx;st.cz=st.toCz;st.r=st.toR;
   if(st.phase<STORM_PHASES.length){
    const [wait,,nr,dps]=STORM_PHASES[st.phase];
    st.timer=wait;st.dps=dps;
    const slack=Math.max(0,st.r-nr);
    const a=rnd(s)*Math.PI*2,d=rnd(s)*slack*.85;
    let ncx=st.cx+Math.sin(a)*d,ncz=st.cz+Math.cos(a)*d;
    const lim=ARENA_RADIUS-nr-4;const dl=Math.hypot(ncx,ncz);if(dl>lim&&dl>0){ncx*=lim/dl;ncz*=lim/dl;}
    st.toCx=ncx;st.toCz=ncz;st.toR=nr;
   } else {st.dps=FINAL_DPS;}
  }
 }
}

function stepKart(s:KombatState,k:KombatKart,input:KombatInput,dt:number){
 const kk=kithKart(k.character);
 const phys=kartPhysics(kk.stats);
 // timers
 k.boost=Math.max(0,k.boost-dt);k.padCooldown=Math.max(0,k.padCooldown-dt);
 k.invuln=Math.max(0,k.invuln-dt);k.spin=Math.max(0,k.spin-dt);k.stun=Math.max(0,k.stun-dt);
 k.frozen=Math.max(0,k.frozen-dt);k.slow=Math.max(0,k.slow-dt);k.blind=Math.max(0,k.blind-dt);
 k.flash=Math.max(0,k.flash-dt);k.reflect=Math.max(0,k.reflect-dt);k.specialActive=Math.max(0,k.specialActive-dt);
 k.special=Math.min(1,k.special+dt/SPECIAL_FILL_SECONDS);
 if(k.roulette>0){k.roulette-=dt;if(k.roulette<=0){k.roulette=0;k.item=k.pendingItem;k.itemUses=k.item==='triple-nitro'?3:1;k.pendingItem=null;}}

 const disabled=k.spin>0||k.stun>0||k.frozen>0;
 const f=forwardOf(k.heading),rt=rightOf(k.heading);
 let vf=k.vx*f.x+k.vz*f.z;
 let vl=k.vx*rt.x+k.vz*rt.z;
 const steerIn=disabled?0:clamp(input.x,-1,1);
 k.steer+=(steerIn-k.steer)*Math.min(1,dt*14);

 // hop-drift (edge triggered)
 const pressed=input.action&&!k.lastAction;
 if(!disabled&&pressed&&k.grounded&&Math.abs(vf)>6){k.vy=4.2;k.grounded=false;k.jounce=-.08;k.driftDir=Math.abs(steerIn)>.15?(steerIn>0?1:-1):0;}
 if(!disabled&&input.action&&k.driftDir===0&&Math.abs(steerIn)>.2&&vf>10) k.driftDir=steerIn>0?1:-1;
 const drifting=!disabled&&input.action&&k.driftDir!==0&&vf>10&&k.grounded;
 if(drifting){
  const into=steerIn*k.driftDir>0?1.15:.9;
  k.drift+=dt*into;
  k.driftStage=k.drift>=2.1?3:k.drift>=1.3?2:k.drift>=.6?1:0;
 }
 if(!input.action&&k.lastAction){
  if(k.driftStage>0){
   k.boost=Math.max(k.boost,[0,.7,1.2,1.9][k.driftStage]);
   k.special=Math.min(1,k.special+.06*k.driftStage);
   emit(s,{type:'boost',kart:k.index,by:k.index,x:k.x,z:k.z});
   k.pitch=-.12;
  }
  k.drift=0;k.driftStage=0;k.driftDir=0;
 }
 if(!input.action){k.drift=0;k.driftStage=0;k.driftDir=0;}
 k.lastAction=input.action;

 // items & specials (edge triggered)
 if(!disabled&&input.item&&!k.lastItem&&k.item&&k.roulette<=0) useItem(s,k);
 k.lastItem=input.item;
 if(!disabled&&input.special&&!k.lastSpecial&&k.special>=1) useSpecial(s,k);
 k.lastSpecial=input.special;

 // longitudinal
 const boulder=k.specialActive>0&&k.specialId==='boulder-bash';
 let top=phys.topSpeed*(k.slow>0?.6:1)+(k.boost>0?BOOST_SPEED_BONUS:0)+(boulder?4:0);
 if(drifting) top*=.94;
 const throttle=!disabled&&input.y<-.1;
 const brake=!disabled&&input.y>.1;
 if(k.grounded){
  if(k.boost>0) vf+=(top-vf)*Math.min(1,dt*4.5);
  else if(throttle) vf+=phys.accel*Math.max(0,1-vf/top)*dt*(vf<0?2.5:1);
  else if(brake){ if(vf>.5) vf-=phys.brake*dt; else vf=Math.max(-12,vf-14*dt); }
  vf-=vf*(throttle||k.boost>0?.12:.8)*dt;
  if(vf>top) vf+=(top-vf)*Math.min(1,dt*2);
  // lateral grip
  const grip=drifting?2.4:k.spin>0?.8:9;
  vl*=Math.exp(-grip*dt);
 } else {
  vf-=vf*.05*dt;
 }
 if(k.frozen>0){vf*=Math.exp(-6*dt);vl*=Math.exp(-6*dt);}

 // steering / yaw
 if(k.spin>0) k.heading+=12*dt*(k.index%2?1:-1);
 else if(!disabled){
  const speedFactor=clamp(Math.abs(vf)/9,0,1)*(vf<0?-1:1);
  let yaw:number;
  if(drifting) yaw=-(k.driftDir*1.15+steerIn*.65)*phys.turnRate*1.05;
  else yaw=-steerIn*phys.turnRate*1.9*(1-clamp(vf/80,0,.35));
  if(!k.grounded) yaw*=.45;
  k.heading=wrapAngle(k.heading+yaw*speedFactor*dt);
 }
 // rebuild velocity in new frame (keeps momentum along old axes for slide)
 const nf=forwardOf(k.heading),nr=rightOf(k.heading);
 if(k.grounded&&!drifting&&k.spin<=0){
  // velocity re-aligns with heading (grip)
  k.vx=nf.x*vf+nr.x*vl;k.vz=nf.z*vf+nr.z*vl;
 } else {
  // in drift/air: blend
  const bx=nf.x*vf+nr.x*vl,bz=nf.z*vf+nr.z*vl;
  const ox=f.x*vf+rt.x*vl,oz=f.z*vf+rt.z*vl;
  const m=k.grounded?.55:.08;
  k.vx=ox+(bx-ox)*m;k.vz=oz+(bz-oz)*m;
 }

 // integrate position with step-up / collision
 const prevX=k.x,prevZ=k.z;
 const gPrev=groundAt(s.arena,k.x,k.z);
 k.x+=k.vx*dt;k.z+=k.vz*dt;
 const gNew=groundAt(s.arena,k.x,k.z);
 if(gNew-k.y>.9){ // ledge too tall: treat as wall
  k.x=prevX;k.z=prevZ;
  const sp=Math.hypot(k.vx,k.vz);k.vx*=-.3;k.vz*=-.3;
  if(sp>14) k.jounceVel=-1.2;
 }
 const n=resolveStatic(s.arena,k,KART_RADIUS);
 if(n){
  const vn=k.vx*n.nx+k.vz*n.nz;
  if(vn<0){k.vx-=vn*1.45*n.nx;k.vz-=vn*1.45*n.nz;if(vn<-16){k.jounceVel=-1.4;}}
 }

 // vertical
 const g=groundAt(s.arena,k.x,k.z);
 if(k.grounded){
  if(g<k.y-.05){ // ground dropped away: launch with ramp slope velocity
   k.grounded=false;k.airTime=0;
  } else {
   const slopeVy=(g-gPrev)/Math.max(dt,1e-4);
   k.vy=slopeVy;k.y=g;
  }
 }
 if(!k.grounded){
  k.airTime+=dt;
  k.vy-=GRAVITY*dt;k.y+=k.vy*dt;
  if(k.y<=g){
   const impact=-k.vy;
   k.y=g;k.grounded=true;
   if(impact>3) k.jounceVel=-Math.min(2.6,impact*.22);
   if(impact>6&&k.airTime>.5&&!disabled){k.boost=Math.max(k.boost,.7);emit(s,{type:'boost',kart:k.index,by:k.index,x:k.x,z:k.z});}
   // drop-in from respawn: landing shock
   k.vy=0;k.airTime=0;
  }
 }

 // pads
 if(k.grounded&&k.padCooldown<=0){
  for(const p of s.arena.pads){if(Math.hypot(k.x-p.x,k.z-p.z)<3.6){k.boost=Math.max(k.boost,1.1);k.padCooldown=1;emit(s,{type:'boost',kart:k.index,by:k.index,x:k.x,z:k.z});break;}}
 }
 // crates
 if(!k.item&&k.roulette<=0){
  for(const c of s.crates){
   if(!c.active) continue;
   if(Math.hypot(k.x-c.x,k.z-c.z)<2.8&&Math.abs(k.y-c.y)<2.5){
    c.active=false;c.respawn=s.time+(c.gold?20:8);
    const r=rnd(s);
    k.pendingItem=c.gold?(['homing-hornet','triple-nitro','thunder-crown','bubble-shield'] as ItemId[])[Math.floor(r*4)]:rollItem(placeOf(s,k),s.karts.length,r);
    k.roulette=1.2;
    if(c.gold) k.special=Math.min(1,k.special+.25);
    emit(s,{type:'pickup',kart:k.index,by:k.index,x:c.x,z:c.z,item:k.pendingItem});
    break;
   }
  }
 }
 // fire trail from inferno
 if(k.fireTrail>0){
  k.fireTrail-=dt;
  if(Math.floor(k.fireTrail*8)!==Math.floor((k.fireTrail+dt)*8)) addTrap(s,'fire',k.index,k.x-nf.x*3,k.z-nf.z*3,2.4,1.6);
 }

 // suspension / body motion for the renderer
 vf=k.vx*nf.x+k.vz*nf.z;
 k.speed=vf;
 const speedNorm=clamp(Math.abs(vf)/40,0,1.5);
 const targetRoll=-(drifting?k.driftDir*-.16:k.steer*.12)*speedNorm;
 k.roll+=(targetRoll-k.roll)*Math.min(1,dt*10);
 const targetPitch=(!k.grounded?clamp(-k.vy*.03,-.25,.25):0)+(brake&&vf>2?.12:throttle&&vf<top*.6?-.06:0);
 k.pitch+=(targetPitch-k.pitch)*Math.min(1,dt*8);
 k.jounceVel+=(-k.jounce*72-k.jounceVel*11)*dt;
 k.jounce=clamp(k.jounce+k.jounceVel*dt,-.18,.18);
}

function stepProjectiles(s:KombatState,dt:number){
 for(const p of s.projectiles){
  p.life-=dt;
  if(p.kind==='homing-hornet'){
   let t=p.target>=0?s.karts[p.target]:null;
   if(!t||!isActive(t)){
    let best:KombatKart|null=null,bd=Infinity;
    for(const o of s.karts){if(o.index===p.owner||!isActive(o))continue;const d=Math.hypot(o.x-p.x,o.z-p.z);if(d<bd){bd=d;best=o;}}
    t=best;p.target=best?best.index:-1;
   }
   if(t){
    const sp=Math.hypot(p.vx,p.vz)||1;
    const want=Math.atan2(t.x-p.x,t.z-p.z),cur=Math.atan2(p.vx,p.vz);
    const turn=clamp(wrapAngle(want-cur),-3.2*dt,3.2*dt);
    const na=cur+turn,ns=Math.min(64,sp+8*dt);
    p.vx=Math.sin(na)*ns;p.vz=Math.cos(na)*ns;
    p.y+=((t.y+.8)-p.y)*Math.min(1,dt*4);
   }
  }
  p.x+=p.vx*dt;p.z+=p.vz*dt;
  if(p.kind!=='riptide'){
   const g=groundAt(s.arena,p.x,p.z);
   if(p.y<g+.6) p.y=g+.6; else p.y+=(g+.8-p.y)*Math.min(1,dt*3);
   const n=resolveStatic(s.arena,p,.5);
   if(n){
    if(p.kind==='seed-bolt'&&p.bounces>0){const vn=p.vx*n.nx+p.vz*n.nz;p.vx-=2*vn*n.nx;p.vz-=2*vn*n.nz;p.bounces--;}
    else {p.life=0;emit(s,{type:'explode',kart:-1,by:p.owner,x:p.x,z:p.z,y:p.y});continue;}
   }
  } else {
   p.y=groundAt(s.arena,p.x,p.z);
   if(Math.hypot(p.x,p.z)>ARENA_RADIUS-3) p.life=0;
  }
  // hits
  for(const k of s.karts){
   if(!isActive(k)||p.life<=0) continue;
   if(p.kind==='riptide'){
    if(k.index===p.owner||p.hit.includes(k.index)) continue;
    const sp=Math.hypot(p.vx,p.vz)||1;const fx=p.vx/sp,fz=p.vz/sp;
    const dx=k.x-p.x,dz=k.z-p.z;const along=dx*fx+dz*fz,across=dx*fz-dz*fx;
    if(Math.abs(along)<3.5&&Math.abs(across)<7){
     p.hit.push(k.index);
     const side=across>=0?1:-1;
     damage(s,k,12,p.owner,{knock:{x:fx*20+fz*side*24,z:fz*20-fx*side*24}});
    }
    continue;
   }
   if(k.index===p.owner&&p.life>(p.kind==='seed-bolt'?3.7:5.7)) continue; // grace period after firing
   if(Math.hypot(k.x-p.x,k.z-p.z)<KART_RADIUS+.9&&Math.abs(k.y+.8-p.y)<2.2){
    if(k.reflect>0&&k.index!==p.owner){
     p.vx=-p.vx;p.vz=-p.vz;const old=p.owner;p.owner=k.index;p.target=old;p.life=Math.max(p.life,2.5);
     k.shield=Math.max(0,k.shield-1);
     emit(s,{type:'reflect',kart:k.index,by:old,x:p.x,z:p.z,y:p.y});
     continue;
    }
    const dmg=p.kind==='homing-hornet'?30:20;
    damage(s,k,dmg,p.owner,{spin:p.kind==='homing-hornet'?1.2:.9});
    emit(s,{type:'explode',kart:k.index,by:p.owner,x:p.x,z:p.z,y:p.y});
    if(p.kind==='homing-hornet'){
     for(const o of s.karts){if(o!==k&&isActive(o)&&o.index!==p.owner&&Math.hypot(o.x-p.x,o.z-p.z)<5)damage(s,o,12,p.owner,{spin:.6});}
    }
    p.life=0;
   }
  }
 }
 s.projectiles=s.projectiles.filter(p=>p.life>0);
}

function stepTraps(s:KombatState,dt:number){
 for(const t of s.traps){
  t.life-=dt;
  for(const k of s.karts){
   if(!isActive(k)||t.life<=0||!k.grounded) continue;
   if(Math.hypot(k.x-t.x,k.z-t.z)>t.r+KART_RADIUS*.6) continue;
   switch(t.kind){
    case 'goo-mine': if(k.index===t.owner&&t.life>24)break;damage(s,k,22,t.owner,{spin:1.1});emit(s,{type:'explode',kart:k.index,by:t.owner,x:t.x,z:t.z});t.life=0;break;
    case 'bramble': if(k.index===t.owner||k.invuln>0)break;if(damage(s,k,10,t.owner,{spin:.7}))k.slow=Math.max(k.slow,1.5);k.invuln=Math.max(k.invuln,.6);break;
    case 'ice-slick': if(k.index===t.owner)break;if(k.spin<=0&&k.invuln<=0){k.spin=.6;k.drift=0;}break;
    case 'fire': if(k.index===t.owner||k.invuln>0)break;damage(s,k,12,t.owner,{spin:.8});k.invuln=Math.max(k.invuln,.5);break;
   }
  }
 }
 s.traps=s.traps.filter(t=>t.life>0);
}

function kartContacts(s:KombatState){
 const ks=s.karts.filter(isActive);
 for(let i=0;i<ks.length;i++)for(let j=i+1;j<ks.length;j++){
  const a=ks[i],b=ks[j];
  if(Math.abs(a.y-b.y)>1.6) continue;
  const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
  if(d>=KART_RADIUS*2||d<1e-4) continue;
  const nx=dx/d,nz=dz/d;
  const wa=kartPhysics(kithKart(a.character).stats).weight*(a.specialActive>0&&a.specialId==='boulder-bash'?4:1);
  const wb=kartPhysics(kithKart(b.character).stats).weight*(b.specialActive>0&&b.specialId==='boulder-bash'?4:1);
  const overlap=KART_RADIUS*2-d;
  a.x-=nx*overlap*wb/(wa+wb);a.z-=nz*overlap*wb/(wa+wb);
  b.x+=nx*overlap*wa/(wa+wb);b.z+=nz*overlap*wa/(wa+wb);
  const rv=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
  if(rv<0){
   const imp=-1.6*rv/(1/wa+1/wb);
   a.vx-=imp/wa*nx;a.vz-=imp/wa*nz;b.vx+=imp/wb*nx;b.vz+=imp/wb*nz;
   a.jounceVel-=.6;b.jounceVel-=.6;
  }
  const aB=a.specialActive>0&&a.specialId==='boulder-bash',bB=b.specialActive>0&&b.specialId==='boulder-bash';
  if(aB&&!bB) damage(s,b,25,a.index,{spin:1,knock:{x:nx*26,z:nz*26}});
  if(bB&&!aB) damage(s,a,25,b.index,{spin:1,knock:{x:-nx*26,z:-nz*26}});
  // boosting rams chip a little damage
  if(!aB&&!bB&&Math.abs(rv)>22){
   if(a.boost>0&&b.boost<=0) damage(s,b,6,a.index,{});
   if(b.boost>0&&a.boost<=0) damage(s,a,6,b.index,{});
  }
 }
}

export function stepKombat(s:KombatState,inputs:KombatInput[],dt:number){
 if(s.phase==='finished') return;
 dt=clamp(dt,0,.05);
 s.time+=dt;
 if(s.time<0) return;
 if(s.phase==='countdown'){s.phase='playing';for(const k of s.karts)emit(s,{type:'spawn',kart:k.index,by:-1,x:k.x,z:k.z});}

 stepStorm(s,dt);

 for(const c of s.crates) if(!c.active&&s.time>=c.respawn) c.active=true;

 for(const k of s.karts){
  if(k.eliminated) continue;
  if(k.respawn>0){k.respawn-=dt;if(k.respawn<=0){k.respawn=0;respawnKart(s,k);}continue;}
  const input=k.human?(inputs[k.index]||emptyKombatInput()):botInput(s,k,dt);
  stepKart(s,k,input,dt);
  // storm damage
  const st=s.storm;
  if(Math.hypot(k.x-st.cx,k.z-st.cz)>st.r){
   k.hp-=st.dps*dt;k.flash=Math.max(k.flash,.08);
   if(k.hp<=0) knockOut(s,k,-1);
  }
 }
 kartContacts(s);
 stepProjectiles(s,dt);
 stepTraps(s,dt);

 const alive=aliveKarts(s);
 if(alive.length<=1||s.time>=MATCH_SECONDS){
  s.phase='finished';
  const ranked=kombatStandings(s);
  s.winner=ranked[0]?.index??null;
  ranked.forEach((k,i)=>{if(!k.eliminated)s.karts[k.index].placement=i+1;});
  if(s.winner!==null){const w=s.karts[s.winner];emit(s,{type:'win',kart:w.index,by:-1,x:w.x,z:w.z});}
 }
 // trim events older than 4s
 if(s.events.length&&s.events[0].t<s.time-4) s.events=s.events.filter(e=>e.t>=s.time-4);
}

export function kombatStandings(s:KombatState):KombatKart[] {
 return [...s.karts].sort((a,b)=>{
  if(a.eliminated!==b.eliminated) return a.eliminated?1:-1;
  if(a.eliminated&&b.eliminated) return a.placement-b.placement;
  return (b.kos-a.kos)||(b.lives-a.lives)||(b.hp-a.hp)||a.index-b.index;
 });
}
