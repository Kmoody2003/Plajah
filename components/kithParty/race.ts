/**
 * Kith Racing — race simulation (the 'circuit' game).
 * Deterministic fixed-step rules, no DOM / three rendering: throttle, brakes and reverse, kart stats per Kith
 * type, hop-drift mini-turbos, rubber burn, suspension reaction, ramps / gap jumps / tricks, loops, shortcuts,
 * moving obstacles, item boxes, items, Type Specials, spin-outs, kart-to-kart bumps, rocket starts and bots.
 */
import type {Input, Player, State} from './engine';
import {
 courseById, courseLength, courseShortcuts, finishProgress, isGapAt, itemBoxSlots, jumpLipAt, loopPitchAt,
 normT, roadCurvature, twistLipAt, hazardSolid, windFans, LANE_M, FAN_RADIUS, obstacleState, rampHeightAt, tDelta, trackPoint2D, courseMorphs, resetMorphs, setMorph, morphSpeedFactor,
 type MorphKind,
} from './course3d';
import {BOOST_SPEED_BONUS, ITEMS, SPECIAL_FILL_SECONDS, kartPhysics, kithKart, rollItem, type ItemId} from './abilities';

export type ProjectileKind = 'seed-bolt'|'homing-hornet'|'riptide';
export interface Projectile { id:number; kind:ProjectileKind; owner:number; progress:number; lane:number; vLane:number; mps:number; life:number; target:number; hits:number[]; }
export type TrapKind = 'goo-mine'|'bramble'|'ice-slick'|'fire-trail';
export interface Trap { id:number; kind:TrapKind; owner:number; progress:number; lane:number; width:number; life:number; }
export interface ItemBox { t:number; lane:number; respawn:number; }
export type RaceEventKind = 'hit'|'block'|'pickup'|'item'|'special'|'zap'|'launch'|'land'|'fall'|'bump'|'wall'|'boost'|'trick'|'warp'|'freeze'|'shock'|'confetti'|'explode'|'morph'|'voca';
export interface RaceEvent { id:number; kind:RaceEventKind; player:number; target:number; progress:number; lane:number; time:number; data:string; }

/** Live state of one track-morph zone: m eases toward target; hold = seconds left fully morphed; cool = re-arm delay. */
export interface MorphRun { m:number; target:number; hold:number; cool:number; kind:MorphKind; side:number; lastLeadT:number; }
export interface RaceExtras { projectiles:Projectile[]; traps:Trap[]; boxes:ItemBox[]; events:RaceEvent[]; nextId:number; morphs:MorphRun[]; }

export const ROAD_HALF_LANES=58;     // barrier
const CURB_LANES=51;
const CUT_HALF_LANES=20;
const GRAVITY=20;

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function rand(s:State){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function say(p:Player,text:string,time=.9){p.feedback=text;p.feedbackTime=time;}

export function createRaceExtras(courseId:State['course']):RaceExtras {
 resetMorphs(courseId);
 return {projectiles:[],traps:[],boxes:itemBoxSlots(courseId).map(b=>({...b,respawn:0})),events:[],nextId:1,
  morphs:courseMorphs(courseId).map(()=>({m:0,target:0,hold:0,cool:0,kind:'long' as MorphKind,side:1,lastLeadT:-1}))};
}

export function racerDefaults():Partial<Player> {
 return {
  mps:0,speedNorm:0,braking:false,reversing:false,item:null,itemCount:0,itemRoll:0,special:0,specialTime:0,
  spin:0,stun:0,slowTime:0,blind:0,frozen:0,shield:0,shieldTime:0,gearHits:0,airTime:0,trick:false,trickSpin:0,onRamp:false,
  cut:-1,cutU:0,cutBase:0,respawn:0,respawnTo:0,burnout:0,place:0,wallHit:0,chargeStart:null,lastItem:false,lastSpecial:false,
  trailTimer:0,botThink:0,botLane:0,superBoost:false,vocaCue:-1,vocaUsed:0,vocaAt:-99,
 };
}

// ---- Voca Word Boost ----
/** Most word challenges per racer per race, how long the player has to say the word, and the reward. */
export const VOCA_MAX=2, VOCA_WINDOW=9, VOCA_BOOST=4.2;
/** Seconds (wall clock) the player gets to say the word once Voca has said it — one try. The world is in bullet time meanwhile. */
export const VOCA_REACT=3;
/** Fraction of the race each challenge may open from (1st, 2nd), and the minimum gap between them (s). */
const VOCA_FROM=[.12,.5], VOCA_GAP=20;
/** On a launch into the air (ramp lip, twist kicker, wind fan): maybe open a word challenge for this human racer. */
function maybeVocaCue(s:State,i:number){
 const p=s.players[i];if(!s.vocaWords||!p.human||p.finish!==null||s.time<=0)return;
 if((p.vocaCue??-1)>=0||s.players.some(o=>o!==p&&(o.vocaCue??-1)>=0))return; // one challenge on screen at a time (one mic)
 const used=p.vocaUsed??0;if(used>=VOCA_MAX)return;
 const frac=p.progress/Math.max(1e-6,finishProgress(s.course));
 if(frac<VOCA_FROM[used]||frac>.94||s.time-(p.vocaAt??-99)<VOCA_GAP)return;
 p.vocaCue=s.time;p.vocaAt=s.time;p.vocaUsed=used+1;event(s,'voca',i,-1,'cue');
}
/** The UI heard the word (ok=true) or the window closed / the player skipped (ok=false). */
export function vocaAnswer(s:State,i:number,ok:boolean){
 const p=s.players[i];if(!p||(p.vocaCue??-1)<0)return;
 p.vocaCue=-1;
 if(ok){giveBoost(p,VOCA_BOOST,'WORD BOOST!');p.superBoost=true;p.invincible=Math.max(p.invincible,VOCA_BOOST*.6);p.special=Math.min(1,p.special+.35);event(s,'voca',i,-1,'boost');event(s,'boost',i);}
 else event(s,'voca',i,-1,'miss');
}

// ---- Twist-kicker stunts & glider ----
/** Height (m) above which a falling kart deploys its glider wings. */
export const GLIDE_HEIGHT=5;
/** Combo length for a stunt: 3 arrows, 4 when launched fast. */
export function startStunt(s:State,i:number,dir:1|-1){
 const p=s.players[i],n=p.mps>40?4:3,seq:number[]=[];
 for(let k=0;k<n;k++){let a=Math.floor(rand(s)*4);if(k>0&&a===seq[k-1])a=(a+1+Math.floor(rand(s)*3))%4;seq.push(a);}
 p.stunt={seq,idx:0,state:'active',dir,at:s.time,doneAt:-1};
 p.stuntPrev=0xf; // every arrow must be released and pressed fresh (the gas key is held at launch)
 if(!p.human){const ok=rand(s)<.72;if(ok){p.stunt.idx=n;p.stunt.state='done';p.stunt.doneAt=s.time+.25;}}
 if(p.human)say(p,'STUNT! ENTER THE COMBO',.9);
}
/** Rising edges of the four arrows feed the combo; a wrong arrow fails it (one try). */
function stuntInput(s:State,i:number,input:Input){
 const p=s.players[i],st=p.stunt;
 // the UI hands over key-down taps (never lost, even in bullet time); without them (tests, bots) use held-arrow edges
 let presses:number[];
 if(input.taps){presses=input.taps.slice();input.taps.length=0;}
 else{const bits=(input.lanes?.[0]?1:0)|(input.lanes?.[1]?2:0)|(input.lanes?.[2]?4:0)|(input.lanes?.[3]?8:0);
  const prev=p.stuntPrev??0;p.stuntPrev=bits;presses=[0,1,2,3].filter(n=>bits&~prev&(1<<n));}
 if(!st||st.state!=='active'||!p.human)return;
 for(const n of presses){
  if(st.state!=='active')break;
  if(n===st.seq[st.idx]){st.idx++;if(st.idx>=st.seq.length){st.state='done';st.doneAt=s.time;say(p,st.seq.length>3?'FRONT FLIP!':'BARREL ROLL!',.8);event(s,'trick',i,-1,'stunt');}}
  else{st.state='fail';say(p,'COMBO MISSED!',.8);event(s,'trick',i,-1,'fail');}
 }
}
/** Landing: a finished combo lands clean for a boost; anything else crashes. */
function landStunt(s:State,i:number){
 const p=s.players[i],st=p.stunt!;p.stunt=null;
 if(st.state==='done'){giveBoost(p,1.7,'STUNT LANDED!');p.special=Math.min(1,p.special+.18);event(s,'boost',i,-1,'stunt');}
 else{p.spin=Math.max(p.spin,1.3);p.spinDir=st.dir;p.mps*=.3;p.drift=0;p.driftDir=0;p.jounceVel=-3;say(p,'CRASH!',1.2);event(s,'hit',i,-1,'CRASH');}
}

function event(s:State,kind:RaceEventKind,player:number,target=-1,data=''){
 const x=s.race!;const p=s.players[player>=0?player:Math.max(0,target)];
 x.events.push({id:x.nextId++,kind,player,target,progress:p?.progress??0,lane:p?.lane??0,time:s.time,data});
 if(x.events.length>80)x.events.splice(0,x.events.length-80);
}

/**
 * Track morphs: when the race leader passes a zone's trigger (a jump lip or a bridge) the zone may activate
 * (seeded chance roll). It reshapes over ~1.4 s into a shorter chord or a longer humped arc, holds, then settles back.
 */
function stepMorphs(s:State,dt:number){
 const x=s.race!;if(!x.morphs?.length)return;
 const zones=courseMorphs(s.course);
 const racing=s.players.filter(p=>p.finish===null);
 if(!racing.length)return;
 const lead=racing.reduce((a,b)=>b.progress>a.progress?b:a);
 const leadT=normT(lead.progress,s.course);
 x.morphs.forEach((r,i)=>{
  const z=zones[i];
  r.cool=Math.max(0,r.cool-dt);
  const crossed=r.lastLeadT>=0&&r.lastLeadT<z.triggerT&&leadT>=z.triggerT&&leadT-r.lastLeadT<.1;
  const timed=z.trigger==='timer'&&r.target===0&&r.m===0&&r.cool===0&&rand(s)<dt/9;
  r.lastLeadT=leadT;
  if((crossed||timed)&&r.target===0&&r.m===0&&r.cool===0){
   if(rand(s)<z.chance){
    r.kind=z.allowShort&&rand(s)<.55?'short':'long';
    r.side=rand(s)<.5?-1:1;
    r.target=1;r.hold=6+rand(s)*6;
    event(s,'morph',s.players.indexOf(lead),-1,r.kind);
    for(const p of s.players)if(p.human&&p.finish===null)say(p,r.kind==='short'?'TRACK SHIFT · SHORTER ROUTE!':'TRACK SHIFT · LONG WAY ROUND!',1.6);
   } else r.cool=4;
  }
  if(r.target>0&&r.m>=1){r.hold-=dt;if(r.hold<=0){r.target=0;r.cool=5;}}
  const rate=dt/1.4;
  r.m=r.target>r.m?Math.min(r.target,r.m+rate):Math.max(r.target,r.m-rate);
  const eased=r.m*r.m*(3-2*r.m);
  setMorph(s.course,i,eased,r.kind,r.side);
 });
}

/** Live race order, 0 = leader. */
function places(s:State){
 const order=s.players.map((p,i)=>({i,v:p.finish!==null?1e6-p.finish:p.progress})).sort((a,b)=>b.v-a.v);
 order.forEach((o,place)=>{s.players[o.i].place=place;});
}

function isProtected(p:Player){return p.invincible>0||p.respawn>0||(p.specialTime>0&&kithKart(p.character).special.id==='boulder-bash');}

/** Apply a hit. Returns true if it landed. */
function hitKart(s:State,ti:number,ai:number,label:string,kind:'spin'|'stun'|'freeze'|'shove'|'slow'='spin'):boolean{
 const t=s.players[ti];
 if(t.finish!==null||isProtected(t))return false;
 if(t.shield>0){t.shield=0;t.shieldTime=0;event(s,'block',ti,ai,'bubble');say(t,'SHIELD BLOCK!');return false;}
 if(t.gearHits>0){t.gearHits--;event(s,'block',ti,ai,'gear');say(t,'GEAR BLOCK!');if(t.gearHits===0)t.specialTime=0;return false;}
 if(kind==='spin'){t.spin=1.05;t.spinDir=rand(s)<.5?-1:1;t.mps*=.32;t.drift=0;t.driftStage=0;t.driftDir=0;t.jounceVel=-1.6;}
 else if(kind==='stun'){t.stun=1.1;t.mps*=.5;t.jounceVel=-1.2;}
 else if(kind==='freeze'){t.frozen=1.4;t.stun=1.4;t.mps*=.4;}
 else if(kind==='slow'){t.slowTime=Math.max(t.slowTime,1.6);t.jounceVel=-1.4;}
 t.invincible=Math.max(t.invincible,kind==='slow'?.6:1.9);
 say(t,label+'!');
 event(s,'hit',ti,ai,label);
 if(ai>=0&&ai!==ti){const a=s.players[ai];a.special=Math.min(1,a.special+.15);if(a.human)say(a,'DIRECT HIT!',.7);}
 return true;
}

function giveBoost(p:Player,seconds:number,label?:string){p.boost=Math.max(p.boost,seconds);p.jounceVel=Math.max(p.jounceVel,1.3);p.pitch=-.1;if(label)say(p,label);}

function distM(s:State,a:Player,b:Player){return tDelta(a.progress,b.progress,s.course)*courseLength(s.course);}

function useItem(s:State,i:number){
 const p=s.players[i],x=s.race!,L=courseLength(s.course);
 const id=p.item as ItemId;
 event(s,'item',i,-1,id);
 const consume=()=>{if(id==='triple-nitro'&&p.itemCount>1){p.itemCount--;}else{p.item=null;p.itemCount=0;}};
 switch(id){
  case 'seed-bolt':x.projectiles.push({id:x.nextId++,kind:'seed-bolt',owner:i,progress:p.progress+3/L,lane:p.lane,vLane:-p.steerAngle*22,mps:Math.max(p.mps,10)+32,life:4,target:-1,hits:[]});break;
  case 'homing-hornet':{
   const ahead=s.players.findIndex(o=>o.place===p.place-1);
   x.projectiles.push({id:x.nextId++,kind:'homing-hornet',owner:i,progress:p.progress+3/L,lane:p.lane,vLane:0,mps:Math.max(p.mps,10)+24,life:8,target:ahead,hits:[]});break;
  }
  case 'goo-mine':x.traps.push({id:x.nextId++,kind:'goo-mine',owner:i,progress:p.progress-5/L,lane:p.lane,width:9,life:30});break;
  case 'nitro':case 'triple-nitro':giveBoost(p,1.35,'NITRO!');break;
  case 'bubble-shield':p.shield=1;p.shieldTime=14;say(p,'BUBBLE SHIELD');break;
  case 'thunder-crown':
   s.players.forEach((o,oi)=>{if(oi!==i&&o.place<p.place&&o.finish===null){event(s,'zap',i,oi,'crown');hitKart(s,oi,i,'THUNDERSTRUCK','spin');}});
   say(p,'THUNDER CROWN!');break;
 }
 consume();
}

function useSpecial(s:State,i:number){
 const p=s.players[i],x=s.race!,L=courseLength(s.course),sp=kithKart(p.character).special;
 p.special=0;p.specialTime=sp.duration;
 event(s,'special',i,-1,sp.id);
 say(p,sp.name.toUpperCase()+'!',1.2);
 const others=s.players.map((o,oi)=>({o,oi})).filter(({oi,o})=>oi!==i&&o.finish===null);
 switch(sp.id){
  case 'inferno-afterburner':giveBoost(p,2.6);p.superBoost=true;break;
  case 'bass-drop':event(s,'shock',i);for(const {o,oi} of others)if(Math.abs(distM(s,p,o))<20&&Math.abs(o.lane-p.lane)<40)hitKart(s,oi,i,'BASS DROP','slow');break;
  case 'bramble-snare':x.traps.push({id:x.nextId++,kind:'bramble',owner:i,progress:p.progress-8/L,lane:p.lane,width:30,life:9});break;
  case 'chain-lightning':{
   const ahead=others.filter(({o})=>{const d=distM(s,p,o);return d>0&&d<130;}).sort((a,b)=>distM(s,p,a.o)-distM(s,p,b.o)).slice(0,2);
   let from=i;for(const {oi} of ahead){event(s,'zap',from,oi,'chain');hitKart(s,oi,i,'CHAIN LIGHTNING','stun');from=oi;}
   break;
  }
  case 'riptide-wave':x.projectiles.push({id:x.nextId++,kind:'riptide',owner:i,progress:p.progress+2/L,lane:0,vLane:0,mps:Math.max(p.mps,12)+18,life:2.4,target:-1,hits:[]});break;
  case 'confetti-storm':event(s,'confetti',i);for(const {o,oi} of others){const d=distM(s,p,o);if(d<0&&d>-90){o.blind=3;hitKart(s,oi,i,'CONFETTI','slow');}}break;
  case 'boulder-bash':p.invincible=Math.max(p.invincible,sp.duration);break;
  case 'moon-warp':{
   const jump=46/L;let target=p.progress+jump;
   if(isGapAt(target,s.course))target+=6/L;
   if(courseById(s.course).kind==='sprint')target=Math.min(target,finishProgress(s.course)-.001);
   p.progress=target;p.invincible=Math.max(p.invincible,1.3);p.hopY=0;p.hopVy=0;p.cut=-1;event(s,'warp',i);
   break;
  }
  case 'gear-shield':p.gearHits=2;break;
  case 'glacier-wake':{
   const ahead=others.filter(({o})=>{const d=distM(s,p,o);return d>0&&d<110;}).sort((a,b)=>distM(s,p,a.o)-distM(s,p,b.o))[0];
   if(ahead){event(s,'freeze',i,ahead.oi);hitKart(s,ahead.oi,i,'FROZEN SOLID','freeze');}
   x.traps.push({id:x.nextId++,kind:'ice-slick',owner:i,progress:p.progress-6/L,lane:p.lane,width:22,life:10});
   break;
  }
 }
}

/** How much of each bend the driver must steer through themselves (1 = all of it, like a real car). */
const ROAD_PULL=.85;

/** Bot brain: picks a lane, decides items/specials/drift. Returns a synthetic input. */
function botInput(s:State,i:number):Input{
 const p=s.players[i],def=courseById(s.course),L=courseLength(s.course);
 const frac=normT(p.progress,s.course);
 const look=(m:number)=>normT(p.progress+m/L,s.course);
 const within=(t:number,m:number)=>{const d=tDelta(frac,t,s.course)*L;return d>0&&d<m;};
 p.botThink-=1/120;
 let want=p.botLane;
 if(p.botThink<=0){
  p.botThink=.6+rand(s)*.8;
  p.botLane=Math.sin(s.time*.35+i*1.7)*26;
  want=p.botLane;
 }
 // loops need the centre boost pad
 const loop=def.loops.find(l=>within(l.boostPadT,70)||(frac>=l.boostPadT&&frac<=l.centerT+l.halfWidth));
 if(loop)want=0;
 else{
  // item boxes when empty-handed
  if(!p.item&&p.itemRoll<=0){const box=s.race!.boxes.find(b=>b.respawn<=s.time&&within(b.t,45));if(box)want=box.lane;}
  // boost pads
  const pad=def.boostPads.find(t=>within(t,40));if(pad!==undefined)want=0;
 }
 // dodge obstacles, hazards and traps
 const danger:number[]=[];
 for(const o of def.obstacles)if(within(o.t,40)){const st=obstacleState(o,s.time+(tDelta(frac,o.t,s.course)*L)/Math.max(8,p.mps));if(st.active||o.kind!=='crusher')danger.push(st.lane);}
 for(const h of def.hazards)if(within(h.t,35))danger.push(h.lane);
 for(const t of s.race!.traps)if(t.owner!==i&&within(normT(t.progress,s.course),30))danger.push(t.lane);
 for(const d of danger)if(Math.abs(want-d)<16)want=d>0?d-24:d+24;
 want=clamp(want,-46,46);
 // PD on lane error: heading already carries the kart sideways, so damp with it to stop weaving
 // + feed-forward: hold the wheel angle the bend needs (the road no longer steers the kart for you)
 const lockB=.55-.27*Math.min(1,Math.abs(p.speedNorm||0));
 const steer=clamp((p.lane-want)/14-(p.heading||0)*Math.max(8,p.mps)/(.18*34)+Math.atan(roadCurvature(p.progress,s.course)*1.55*ROAD_PULL)/lockB,-1,1);
 // items
 let item=false;
 if(p.item&&p.itemRoll<=0&&rand(s)<.02){
  const kind=ITEMS[p.item].kind;
  const ahead=s.players.some((o,oi)=>oi!==i&&o.finish===null&&(()=>{const d=distM(s,p,o);return d>4&&d<70&&Math.abs(o.lane-p.lane)<14;})());
  const behind=s.players.some((o,oi)=>oi!==i&&(()=>{const d=distM(s,p,o);return d<-3&&d>-35;})());
  if(kind==='boost'&&!loop)item=true;
  else if(kind==='defend')item=true;
  else if(p.item==='homing-hornet'||p.item==='thunder-crown')item=p.place>0;
  else if(p.item==='seed-bolt')item=ahead;
  else if(p.item==='goo-mine')item=behind||rand(s)<.05;
 }
 const special=p.special>=1&&rand(s)<.012;
 // occasional drift through bends: purely a visual + small boost reward handled in step
 void look;
 return {x:steer,y:-1,action:false,lanes:[false,false,false,false],item,special};
}

export function stepRace(s:State,inputs:Input[],dt:number){
 const def=courseById(s.course),x=s.race!,L=courseLength(s.course),finishAt=finishProgress(s.course);
 places(s);
 // lead human for rubber-banding
 const humans=s.players.filter(p=>p.human&&p.finish===null);
 const leadHuman=humans.sort((a,b)=>b.progress-a.progress)[0];
 stepMorphs(s,dt);

 s.players.forEach((p,i)=>{
  if(p.finish!==null){p.mps*=Math.max(0,1-dt*1.2);p.speed=p.mps/L;p.speedNorm=p.mps/40;return;}
  const kk=kithKart(p.character),phys=kartPhysics(kk.stats);
  const input:Input=p.human?(inputs[i]||{x:0,y:0,action:false,lanes:[false,false,false,false],item:false,special:false}):botInput(s,i);

  // timers
  for(const k of ['boost','cooldown','invincible','feedbackTime','spin','stun','slowTime','blind','frozen','wallHit','trickSpin'] as const)(p as any)[k]=Math.max(0,(p as any)[k]-dt);
  if(p.boost<=0)p.superBoost=false;
  if((p.vocaCue??-1)>=0&&(s.time-(p.vocaCue??0)>VOCA_WINDOW+1||p.finish!==null))vocaAnswer(s,i,false); // safety: UI never answered
  if(p.itemRoll>0){p.itemRoll=Math.max(0,p.itemRoll-dt);if(p.itemRoll===0&&p.item&&p.human)say(p,ITEMS[p.item].name.toUpperCase(),.8);}
  if(p.shieldTime>0){p.shieldTime=Math.max(0,p.shieldTime-dt);if(p.shieldTime===0)p.shield=0;}
  if(p.specialTime>0){p.specialTime=Math.max(0,p.specialTime-dt);if(p.specialTime===0&&kk.special.id==='gear-shield')p.gearHits=0;}
  else if(p.special<1)p.special=Math.min(1,p.special+dt/SPECIAL_FILL_SECONDS);

  // fall rescue: drone carries the kart back to the road
  if(p.respawn>0){
   p.respawn=Math.max(0,p.respawn-dt);p.mps=0;p.speed=0;
   if(p.respawn===0){p.progress=p.respawnTo;p.hopY=0;p.hopVy=0;p.lane=0;p.mps=10;p.invincible=1.6;p.cut=-1;p.heading=0;p.wheelAngle=0;}
   return;
  }

  const controllable=p.spin<=0&&p.stun<=0;
  const steerIn=controllable?clamp(input.x,-1,1):0;
  const airborneNow=p.hopY>.35&&p.launched;
  const brakeIn=input.y>0;
  const throttle=controllable?(brakeIn?-1:(s.autoAccelerate||input.y<0||!p.human)?1:0):0;
  p.braking=brakeIn&&p.mps>1;
  p.steerAngle+=(steerIn-p.steerAngle)*Math.min(1,dt*14);

  // ---- surface ----
  const onCut=p.cut>=0;
  const absLane=Math.abs(p.lane);
  p.surface=onCut?'offroad':absLane>CURB_LANES?'curb':'asphalt';

  // ---- hop & drift ----
  const grounded=p.hopY<=.02&&p.hopVy<=0;
  const actionEdge=input.action&&!p.lastAction;
  if(p.human&&actionEdge&&grounded&&p.mps>8&&controllable){p.hopVy=3.4;p.jounce=-.1;if(Math.abs(steerIn)>.12)p.driftDir=steerIn>0?1:-1;}
  else if(p.human&&actionEdge&&!grounded&&p.airTime<.55&&p.airTime>0&&!p.trick&&p.hopVy!==0&&p.onRamp===false&&p.launched){p.trick=true;p.trickSpin=.5;event(s,'trick',i);say(p,'TRICK!',.6);}
  // Space + a direction = drift: lock the drift side as soon as both are held (during the hop or on the ground)
  if(p.human&&input.action&&p.driftDir===0&&Math.abs(steerIn)>.18&&p.mps>6)p.driftDir=steerIn>0?1:-1;
  if(!input.action)p.driftDir=0;
  const drifting=p.human&&controllable&&input.action&&p.driftDir!==0&&p.mps>8;
  if(drifting){const intoTurn=steerIn*p.driftDir>0?1.15:.9;p.drift=Math.min(1.6,p.drift+dt*intoTurn*(p.surface==='curb'?.7:1));}
  p.driftStage=p.drift>=1.35?3:p.drift>=.85?2:p.drift>=.35?1:0;
  if(p.lastAction&&!input.action&&p.drift>.35&&controllable){
   const tier=p.driftStage;
   giveBoost(p,tier===3?2.1:tier===2?1.4:.8,tier===3?'ULTRA MINI-TURBO!':tier===2?'SUPER MINI-TURBO!':'MINI-TURBO!');
   p.special=Math.min(1,p.special+.04*tier);event(s,'boost',i,-1,'drift'+tier);
  }
  if(!input.action||!drifting){if(!input.action){p.drift=0;p.driftStage=0;}}
  if(!p.human){
   // bots: tier visuals through bends and an occasional earned mini-turbo
   const bend=Math.abs(steerIn)>.35&&p.mps>20;
   p.drift=bend?Math.min(1.2,p.drift+dt):Math.max(0,p.drift-dt*2);
   p.driftStage=p.drift>=.85?2:p.drift>=.35?1:0;
   if(!bend&&p.drift>.5&&rand(s)<.5){giveBoost(p,.7);p.drift=0;}
  }
  p.lastAction=input.action;

  // ---- items & specials ----
  if(input.item&&!p.lastItem&&p.item&&p.itemRoll<=0&&controllable)useItem(s,i);
  if(input.special&&!p.lastSpecial&&p.special>=1&&p.specialTime<=0&&controllable)useSpecial(s,i);
  p.lastItem=input.item;p.lastSpecial=input.special;

  // ---- loops ----
  const lp=loopPitchAt(p.progress,s.course);
  p.inLoop=lp.inLoop&&!onCut;p.loopAngle=lp.theta;
  let loopMul=1;
  if(p.inLoop){if(p.boost>0||p.mps>=phys.topSpeed*.9)loopMul=1.08;else if(lp.theta>.45&&lp.theta<2.55){loopMul=.62;if(p.human&&p.feedbackTime<=0)say(p,'HIT BOOST FOR LOOP!');}}

  // ---- speed ----
  let top=phys.topSpeed*loopMul;
  if(onCut&&p.boost<=0)top*=phys.offroadMul;
  if(p.surface==='curb')top*=.93;
  if(drifting)top*=.97;
  if(p.slowTime>0)top*=.62;
  if(p.specialTime>0&&kk.special.id==='boulder-bash')top+=6;
  if(!p.human&&leadHuman){const gap=tDelta(leadHuman.progress,p.progress,s.course)*L;top*=gap<-60?1.07:gap>60?.94:1;}
  if(p.boost>0)top+=BOOST_SPEED_BONUS*(p.superBoost?1.3:1);
  if(p.spin>0){p.mps=Math.max(0,p.mps-30*dt);}
  else if(throttle>0){
   if(p.reversing){p.mps=Math.min(0,p.mps+phys.brake*dt);if(p.mps>=0)p.reversing=false;}
   else if(p.mps<top){const a=phys.accel*Math.max(.1,1-p.mps/top)*(p.boost>0?2.2:1);p.mps=Math.min(top,p.mps+a*dt);}
   else p.mps=Math.max(top,p.mps-(p.mps-top)*2.4*dt);
  } else if(throttle<0){
   if(p.mps>0){p.mps=Math.max(0,p.mps-phys.brake*dt);}
   else {p.reversing=true;p.mps=Math.max(-9,p.mps-10*dt);}
  } else {
   const drag=3+Math.abs(p.mps)*.07;
   p.mps=p.mps>0?Math.max(0,p.mps-drag*dt):Math.min(0,p.mps+drag*dt);
   if(p.mps>top)p.mps=Math.max(top,p.mps-(p.mps-top)*2*dt);
  }
  p.speedNorm=p.mps/40;
  p.speed=p.mps/L;

  // ---- steering: front wheels turn, the kart yaws, the heading carries it across the road ----
  // Bicycle model: yaw rate = v·tan(δ)/wheelbase, capped by tyre grip; lock shrinks with speed; tyres self-align
  // when the wheel is centred. Heading is relative to the road tangent (same sign as steer: + moves to lower lanes).
  const steerUse=drifting?(p.driftDir*.42+steerIn*.58):steerIn;
  const v=Math.abs(p.mps), dirSign=p.mps<0?-1:1;
  const lock=(.55-.27*Math.min(1,p.speedNorm))*(drifting?1.2:1);
  p.wheelAngle+=((p.human?steerUse:steerIn)*lock-p.wheelAngle)*Math.min(1,dt*(p.human?16:10));
  const grip=(1.75+(phys.turnRate-.9)*1.1)*(drifting?1.3:1)*(p.surface==='curb'?.9:onCut?.8:1)*(airborneNow?0:1);
  let yawRate=clamp(v*Math.tan(p.wheelAngle)/1.55,-grip,grip)*dirSign*clamp(v/5,0,1);
  if(drifting){const want=p.driftDir*.42+steerIn*.22;yawRate+=(want-p.heading)*2.6;}
  p.heading+=yawRate*dt;
  // the road bends away under a kart that isn't steering: heading relative to the road drifts by κ·v
  if(!airborneNow&&!onCut&&!p.inLoop)p.heading+=roadCurvature(p.progress,s.course)*p.mps*dt*ROAD_PULL;
  if(!drifting){const centred=Math.abs(steerIn)<.08;p.heading-=p.heading*Math.min(1,dt*(centred?.9:.5));}
  const maxH=drifting?.78:.6;p.heading=clamp(p.heading,-maxH,maxH);
  p.yawRate=yawRate;
  p.lane-=p.mps*Math.sin(p.heading)/.18*dt*1.05;
  const limit=onCut?CUT_HALF_LANES:ROAD_HALF_LANES;
  if(Math.abs(p.lane)>limit){
   const hard=Math.abs(Math.sin(p.heading))*Math.abs(p.mps)*4;
   p.lane=Math.sign(p.lane)*limit;
   if(-Math.sign(p.lane)*p.heading<0)p.heading*=-.25; // glance off the rail instead of grinding along it
   if(hard>14&&p.wallHit<=0){p.mps*=.88;p.wallHit=.35;p.jounceVel=-.9;p.roll+=.08*Math.sign(p.lane);event(s,'wall',i,-1,String(Math.sign(p.lane)));}
  }

  // ---- rubber: burnout intensity for skid marks + tyre smoke ----
  const latAccel=Math.abs(p.mps*(p.yawRate||0));
  const hardTurn=latAccel>34||(Math.abs(p.steerAngle)>.8&&p.speedNorm>.7);
  const hardBrake=p.braking&&p.mps>14;
  const wheelspin=throttle>0&&p.mps<10&&p.mps>=0&&p.spin<=0;
  // grip turns don't smoke or squeal: only a real drift, a lock-up, a spin or wheelspin lays rubber
  void hardTurn;
  const target=p.spin>0?1:drifting?.75+p.driftStage*.08:hardBrake?.85:wheelspin?.6:0;
  p.burnout+=(target-p.burnout)*Math.min(1,dt*10);
  if(p.hopY>.3)p.burnout=0;

  // ---- advance along track / shortcut ----
  const before=p.progress;
  if(onCut){
   const sc=courseShortcuts(s.course)[p.cut];
   p.cutU+=p.mps*dt/sc.length;
   p.progress=p.cutBase+(sc.toT-sc.fromT)*clamp(p.cutU,0,1);
   if(p.cutU>=1){p.cut=-1;p.lane=sc.side*46;}
   else if(p.cutU<0){p.cut=-1;p.lane=sc.side*46;}
  } else {
   p.progress+=p.mps*dt/L*morphSpeedFactor(p.progress,s.course);
   const frac=normT(p.progress,s.course);
   courseShortcuts(s.course).forEach((sc,si)=>{
    if(p.cut<0&&p.mps>4&&p.hopY<.5&&p.lane*sc.side>44){const d=tDelta(sc.fromT,frac,s.course);if(d>=0&&d<.006){p.cut=si;p.cutU=0;p.cutBase=p.progress-d;p.lane=0;if(p.human)say(p,'SHORTCUT!',.7);}}
   });
  }
  if(courseById(s.course).kind==='sprint')p.progress=Math.max(0,p.progress);

  // ---- ramps, gap jumps, air & landing ----
  const ground=onCut?0:rampHeightAt(p.progress,s.course);
  const gap=!onCut&&isGapAt(p.progress,s.course);
  if(!onCut&&p.onRamp&&ground===0){
   const lip=jumpLipAt(p.progress,Math.abs(p.mps*dt/L)*2+.002,s.course);
   if(lip&&p.mps>4){p.hopVy=2.6+p.mps*.18*(lip.height/1.5);p.launched=true;p.airTime=0;event(s,'launch',i,-1,lip.label);maybeVocaCue(s,i);}
   const tw=lip?null:twistLipAt(p.progress,Math.abs(p.mps*dt/L)*2+.002,s.course);
   if(tw&&p.mps>6){p.hopVy=5.6+p.mps*.165;p.launched=true;p.airTime=0;p.trick=false;event(s,'launch',i,-1,tw.label);maybeVocaCue(s,i);if((p.vocaCue??-1)<0)startStunt(s,i,tw.dir);}
  }
  p.onRamp=ground>0;
  const airborne=p.hopVy>0||p.hopY>ground+.02||gap||(!!p.launched&&p.hopVy<0); // a falling kart always runs the landing below
  if(airborne){
   p.airTime+=dt;
   stuntInput(s,i,input);
   // glider: launched really high, wings come out on the way down — ↓ pulls up (floats), ↑ dives (faster)
   const gliding=p.launched&&!gap&&(p.glide??0)>0||(p.launched&&p.hopY>GLIDE_HEIGHT&&p.hopVy<0);
   p.glide=gliding?Math.min(1,(p.glide??0)+dt*3.5):Math.max(0,(p.glide??0)-dt*5);
   const gl=p.glide??0;
   let grav=GRAVITY;
   if(gl>0){
    const pull=input.y>0?1:0,dive=input.y<0&&p.human?1:0;
    grav=GRAVITY*(1-gl*(pull?.82:dive?.35:.68));
    if(p.hopVy<-(dive?11:pull?2.4:4.2))p.hopVy+=(-(dive?11:pull?2.4:4.2)-p.hopVy)*Math.min(1,dt*3*gl); // terminal sink rate
    if(dive)p.mps=Math.min(p.mps+dt*5*gl,top+6);
    p.lane=clamp(p.lane-steerIn*dt*26*gl,-58,58);           // bank the glider across the road
    p.heading=clamp(p.heading-p.heading*Math.min(1,dt*1.5*gl),-1,1);
    if(!p.human){const want=clamp(-p.lane/30,-1,1);p.lane+=want*dt*14*gl;}
   } else if(p.launched&&p.hopY>.6){
    // air control: a little yaw from the stick, and the kart self-rights toward the direction of travel
    p.heading=clamp(p.heading+steerIn*dt*.35-p.heading*dt*.6,-1,1);
   }
   p.hopY+=p.hopVy*dt;p.hopVy-=grav*dt;
   if(!gap&&p.hopY<=ground){
    const impact=Math.abs(p.hopVy);
    p.hopY=ground;
    if(impact>1.2){
     p.jounceVel=-Math.min(3,impact*.32);
     if(p.launched){
      event(s,'land',i,-1,impact.toFixed(1));
      if(p.trick&&!p.stunt){giveBoost(p,1.15,'TRICK BOOST!');p.special=Math.min(1,p.special+.08);}
      else if(impact>2.4&&!p.stunt&&(p.glide??0)<.15){giveBoost(p,.75,'APEX LANDING!');p.special=Math.min(1,p.special+.05);}
     }
    }
    if(p.launched&&p.stunt)landStunt(s,i);
    if((p.glide??0)>.3&&p.launched&&p.human&&!p.stunt)say(p,'SMOOTH GLIDE!',.7);
    p.hopVy=0;p.launched=false;p.trick=false;p.airTime=0;p.glide=0;
   } else if(gap&&p.hopY<-5){
    // missed the jump
    const jump=def.jumps.find(j=>j.gap>0&&normT(p.progress,s.course)>j.t&&normT(p.progress,s.course)<j.t+j.gap+.01);
    const lapBase=p.progress-normT(p.progress,s.course);
    p.respawnTo=lapBase+(jump?jump.t+jump.gap+.006:normT(p.progress,s.course)+.01);
    p.respawn=1.5;p.hopY=0;p.hopVy=0;p.launched=false;p.trick=false;p.drift=0;p.driftDir=0;
    event(s,'fall',i);say(p,'TOO SLOW · LIFT!',1.4);
    return;
   }
  } else {p.hopY=ground;p.airTime=0;}

  // ---- suspension: spring-damper + load transfer ----
  p.jounceVel+=(-p.jounce*72-p.jounceVel*11)*dt;
  p.jounce=clamp(p.jounce+p.jounceVel*dt,-.18,.18);
  const sn=clamp(p.speedNorm,0,1.6);
  const driftSign=p.driftDir!==0?p.driftDir:(steerIn<0?-1:1);
  p.lateralG=clamp(p.mps*(p.yawRate||0)/30,-1.6,1.6)+(drifting?driftSign*.85*sn:0);
  p.roll+=((-p.lateralG*(drifting?-.17:.13))-p.roll)*Math.min(1,dt*12);
  const accelPitch=throttle>0&&p.mps<top-1?-.05*(1-p.mps/Math.max(1,top)):0;
  const brakeDive=p.braking?.16:0;
  const airPitch=p.hopY>.12?((p.glide??0)>.1?.06*(p.glide??0):clamp(-Math.atan2(p.hopVy,Math.max(10,Math.abs(p.mps)))*1.05,-.42,.42)):0;
  const targetPitch=airPitch+brakeDive+accelPitch+(p.boost>0?-.05:0);
  p.pitch+=(targetPitch-p.pitch)*Math.min(1,dt*9);
  p.slip=p.spin>0?1:drifting?1:onCut?.5:0;
  const chatter=p.surface==='curb'?.045:onCut?.07:0;
  const chatterL=chatter*Math.sin(s.time*(onCut?38:72));
  const chatterR=chatter*Math.cos(s.time*(onCut?38:72));
  p.suspensionFL=clamp(p.pitch*.48-p.roll*.45+p.jounce+chatterL,-.18,.18);
  p.suspensionFR=clamp(p.pitch*.48+p.roll*.45+p.jounce+chatterR,-.18,.18);
  p.suspensionRL=clamp(-p.pitch*.48-p.roll*.45+p.jounce+chatterR,-.18,.18);
  p.suspensionRR=clamp(-p.pitch*.48+p.roll*.45+p.jounce+chatterL,-.18,.18);
  p.suspensionFront=(p.suspensionFL+p.suspensionFR)*.5;
  p.suspensionRear=(p.suspensionRL+p.suspensionRR)*.5;

  // ---- engine note ----
  const norm=clamp(Math.abs(p.speedNorm),0,1.5);
  p.gear=p.reversing?1:norm>.9?5:norm>.68?4:norm>.45?3:norm>.22?2:1;
  const ranges=[[0,.22],[.22,.45],[.45,.68],[.68,.9],[.9,1.5]];
  const r=ranges[p.gear-1];
  p.rpm=Math.round(p.boost>0?9600+Math.sin(s.time*50)*400:wheelspin?7800+Math.sin(s.time*30)*600:1200+clamp((norm-r[0])/(r[1]-r[0]),0,1)*6800);

  const frac=normT(p.progress,s.course);
  const near=(t:number,m:number)=>Math.abs(tDelta(frac,t,s.course))*L<m;
  const low=p.hopY<1.1;

  // ---- boost pads ----
  if(!onCut&&low&&p.cooldown===0){
   const isLoopPad=def.loops.some(l=>near(l.boostPadT,9));
   if(def.boostPads.some(t=>near(t,8))&&Math.abs(p.lane)<(isLoopPad?36:25)){giveBoost(p,isLoopPad?1.95:1.4,isLoopPad?'LOOP POWER BOOST!':'TURBO PAD!');p.cooldown=isLoopPad?1.4:1.6;event(s,'boost',i,-1,'pad');}
  }

  if(!onCut&&low&&!isProtected(p)){
   // small fixed hazards
   const haz=def.hazards.find(h=>!hazardSolid(h)&&near(h.t,4.5)&&Math.abs(p.lane-h.lane)<8);
   if(haz){p.mps*=.72;p.jounceVel=-1.5;p.invincible=.85;say(p,haz.label+'!');event(s,'hit',i,-1,haz.label);}
   // moving obstacles
   for(const o of def.obstacles){
    if(!near(o.t,4.5))continue;
    const st=obstacleState(o,s.time);
    if(st.active&&Math.abs(p.lane-st.lane)<o.width/2+3){hitKart(s,i,-1,o.label,o.kind==='slick'?'spin':'spin');break;}
   }
  }

  // ---- solid hazards (sand piles, shards): you bounce off them, never through — unless you're above them ----
  if(!onCut&&p.respawn===0){
   for(const h of def.hazards){
    const sol=hazardSolid(h);if(!sol||p.hopY>sol.height)continue;
    const ds=tDelta(frac,h.t,s.course)*L;            // + = the hazard is ahead of the kart (metres)
    if(Math.abs(ds)>sol.radius+3)continue;
    const dl=(p.lane-h.lane)*LANE_M,reach=sol.radius+.95;  // kart half-width ~0.95 m
    const d=Math.hypot(ds,dl);if(d>=reach)continue;
    // push the kart out to the rim, mostly sideways if it's off-centre, and kill / bounce the speed into it
    const nx=d>1e-3?-ds/d:-1,ny=d>1e-3?dl/d:(p.lane>=h.lane?1:-1);
    p.progress+=((nx*reach)-(-ds))/L;p.lane=h.lane+(ny*reach)/LANE_M;
    const into=-nx; // moving forward into it when the hazard was ahead
    if(into>.35&&p.mps>0){const hit=p.mps;p.mps=-Math.min(6,hit*.18);p.wallHit=.45;p.jounceVel=-2.2;p.heading+=(ny>=0?-1:1)*.25;
     if(hit>8&&p.feedbackTime<=0){say(p,h.kind==='sand-pocket'?'SAND PILE!':'SOLID SHARD!',.8);}event(s,'wall',i,-1,h.label);}
    else p.mps*=.94;
   }
  }
  // ---- wind fans: blow the kart up and over the sand pile ahead ----
  if(!onCut&&grounded&&p.respawn===0&&p.mps>3){
   for(const fan of windFans(s.course)){
    if(Math.abs(tDelta(frac,fan.t,s.course)*L)>2.2||Math.abs((p.lane-fan.lane)*LANE_M)>FAN_RADIUS)continue;
    p.hopVy=12.5+Math.min(4,p.mps*.06);p.launched=true;p.airTime=0;p.onRamp=false;
    say(p,'WIND FAN!',.7);event(s,'launch',i,-1,fan.label);maybeVocaCue(s,i);break;
   }
  }

  // ---- item boxes ----
  if(!onCut&&p.hopY<2.5){
   for(const b of x.boxes){
    if(b.respawn>s.time||!near(b.t,3)||Math.abs(p.lane-b.lane)>8)continue;
    b.respawn=s.time+2.4;event(s,'pickup',i);
    p.special=Math.min(1,p.special+.04);
    if(!p.item&&p.itemRoll<=0){p.item=rollItem(p.place,s.players.length,rand(s));p.itemCount=p.item==='triple-nitro'?3:1;p.itemRoll=p.human?1.1:.6;}
    break;
   }
  }

  // ---- special upkeep: fire trail, boulder ramming ----
  if(p.specialTime>0&&kk.special.id==='inferno-afterburner'){
   p.trailTimer-=dt;
   if(p.trailTimer<=0){p.trailTimer=.09;x.traps.push({id:x.nextId++,kind:'fire-trail',owner:i,progress:p.progress-3/L,lane:p.lane,width:8,life:2.4});}
  }
  if(p.specialTime>0&&kk.special.id==='boulder-bash'){
   s.players.forEach((o,oi)=>{if(oi!==i&&Math.abs(distM(s,p,o))<3.6&&Math.abs(o.lane-p.lane)<12){if(hitKart(s,oi,i,'FLATTENED','spin'))o.lane=clamp(o.lane+(o.lane>=p.lane?1:-1)*22,-ROAD_HALF_LANES,ROAD_HALF_LANES);}});
  }

  // ---- slipstream: continuous aerodynamic pull while tucked behind a rival + burst at completion ----
  if(p.human&&s.time>1.2&&!onCut&&p.boost===0&&p.cooldown===0&&p.mps>phys.topSpeed*.74){
   const leader=s.players.find((o,oi)=>oi!==i&&(()=>{const d=distM(s,p,o);return d>1.8&&d<24;})()&&Math.abs(o.lane-p.lane)<14);
   if(leader){
    p.slipTime=(p.slipTime||0)+dt;
    const pull=Math.min(1,p.slipTime/.85);
    p.mps=Math.min(phys.topSpeed*1.16,p.mps+dt*5.4*pull);
    p.special=Math.min(1,p.special+dt*.085);
    if(p.slipTime>1.05){giveBoost(p,1.15,'SLIPSTREAM!');p.special=Math.min(1,p.special+.12);p.cooldown=2.0;p.slipTime=0;}
   } else p.slipTime=Math.max(0,(p.slipTime||0)-dt*2);
  } else if(p.slipTime) p.slipTime=0;

  // ---- laps / finish ----
  if(p.progress>=finishAt){p.finish=s.time;p.score=10000-Math.round(s.time*50);say(p,'FINISH!',2);if((p.vocaCue??-1)>=0)vocaAnswer(s,i,false);}
  else if(def.kind==='circuit'&&Math.floor(before)<Math.floor(p.progress)&&p.progress>=1){say(p,p.progress>=def.laps-1?'FINAL LAP!':`LAP ${Math.floor(p.progress)+1}`,1.2);}
  const pt=trackPoint2D(p.progress,p.lane,s.course);p.x=pt.x;p.y=pt.y;
 });

 // ---- kart-to-kart bumps (weight decides who gets shoved) ----
 for(let a=0;a<s.players.length;a++)for(let b=a+1;b<s.players.length;b++){
  const A=s.players[a],B=s.players[b];
  if(A.respawn>0||B.respawn>0||(A.cut<0)!==(B.cut<0)||A.finish!==null||B.finish!==null)continue;
  if(Math.abs(A.hopY-B.hopY)>1.2)continue;
  const dz=distM(s,A,B),dl=(B.lane-A.lane)*.18;
  if(Math.abs(dz)<2.6&&Math.abs(dl)<1.7){
   const wa=kartPhysics(kithKart(A.character).stats).weight,wb=kartPhysics(kithKart(B.character).stats).weight;
   const push=(1.7-Math.abs(dl))/.18*.6,dir=dl>=0?1:-1;
   A.lane-=dir*push*(wb/(wa+wb));B.lane+=dir*push*(wa/(wa+wb));
   A.jounceVel-=.4;B.jounceVel-=.4;
   if(s.time-(A.lastBump||0)>.4){A.lastBump=s.time;event(s,'bump',a,b);}
  }
 }

 // ---- projectiles ----
 for(const pr of x.projectiles){
  pr.life-=dt;
  if(pr.kind==='homing-hornet'&&pr.target>=0){
   const t=s.players[pr.target];
   if(t&&t.finish===null){pr.vLane=clamp((t.lane-pr.lane)*3,-60,60);const d=tDelta(pr.progress,t.progress,s.course)*L;if(d<0)pr.mps=Math.max(10,t.mps-6);}
  }
  pr.progress+=pr.mps*dt/L;
  pr.lane+=pr.vLane*dt;
  if(Math.abs(pr.lane)>ROAD_HALF_LANES){pr.lane=Math.sign(pr.lane)*ROAD_HALF_LANES;pr.vLane*=-1;}
  for(const tr of x.traps){if(tr.kind==='goo-mine'&&pr.kind!=='riptide'&&tr.life>0&&Math.abs(tDelta(pr.progress,tr.progress,s.course)*L)<2&&Math.abs(pr.lane-tr.lane)<8){tr.life=0;pr.life=0;event(s,'explode',-1,-1,'mine');}}
  if(pr.life<=0)continue;
  s.players.forEach((t,ti)=>{
   if(pr.life<=0||ti===pr.owner&&pr.life>(pr.kind==='seed-bolt'?3.7:7.6))return;
   if(pr.kind==='riptide'){
    if(ti===pr.owner)return;
    if(Math.abs(tDelta(pr.progress,t.progress,s.course)*L)<3.5&&!isProtected(t)&&!pr.hits.includes(ti)){
     pr.hits.push(ti);
     if(hitKart(s,ti,pr.owner,'RIPTIDE','slow'))t.lane=clamp(t.lane+(t.lane>=0?1:-1)*30,-ROAD_HALF_LANES,ROAD_HALF_LANES);
    }
    return;
   }
   if(Math.abs(tDelta(pr.progress,t.progress,s.course)*L)<2.2&&Math.abs(pr.lane-t.lane)<9&&t.hopY<1.5){
    // gear shield reflects
    if(t.gearHits>0&&!isProtected(t)){t.gearHits--;pr.owner=ti;pr.mps=-Math.abs(pr.mps)*.8;pr.target=-1;event(s,'block',ti,-1,'reflect');return;}
    pr.life=0;event(s,'explode',ti,-1,pr.kind);hitKart(s,ti,pr.owner,pr.kind==='homing-hornet'?'HORNET STING':'SEED BOLT','spin');
   }
  });
 }
 x.projectiles=x.projectiles.filter(p=>p.life>0&&(def.kind==='circuit'||(p.progress>0&&p.progress<1)));

 // ---- traps ----
 for(const tr of x.traps){
  tr.life-=dt;if(tr.life<=0)continue;
  s.players.forEach((t,ti)=>{
   if(tr.life<=0||t.hopY>1||t.cut>=0)return;
   if(ti===tr.owner&&tr.kind!=='goo-mine')return;
   if(ti===tr.owner&&tr.life>28.5)return;
   if(Math.abs(tDelta(t.progress,tr.progress,s.course)*L)<2.4&&Math.abs(t.lane-tr.lane)<tr.width/2+3){
    if(tr.kind==='goo-mine'){tr.life=0;event(s,'explode',ti,-1,'mine');hitKart(s,ti,tr.owner,'GOO MINE','spin');}
    else if(tr.kind==='bramble'){if(hitKart(s,ti,tr.owner,'BRAMBLE SNARE','slow'))t.mps*=.55;}
    else if(tr.kind==='ice-slick'){if(!isProtected(t)){t.spin=Math.max(t.spin,.55);t.invincible=Math.max(t.invincible,.9);say(t,'ICE SLICK!');event(s,'hit',ti,tr.owner,'ICE SLICK');}}
    else if(tr.kind==='fire-trail'){hitKart(s,ti,tr.owner,'SCORCHED','spin');}
   }
  });
 }
 x.traps=x.traps.filter(t=>t.life>0);
}

/** Countdown handling: rocket start for anyone who presses accelerate in the sweet spot, wheelspin if too early. */
export function raceCountdown(s:State,inputs:Input[],dtBefore:number){
 s.players.forEach((p,i)=>{
  const input=inputs[i];
  if(p.human&&input){
   const pressing=input.y<0;
   if(pressing&&p.chargeStart===null)p.chargeStart=s.time;
   if(!pressing)p.chargeStart=null;
  } else if(!p.human&&p.chargeStart===null){
   p.chargeStart=-1-((i*37)%7)/10; // bots: mixed starts
  }
  if(s.time>=0&&s.time-dtBefore<0){
   const c=p.chargeStart;
   if(c!==null&&c>=-1.15&&c<=-.35){giveBoost(p,1.3,'ROCKET START!');p.mps=18;event(s,'boost',i,-1,'rocket');}
   else if(c!==null&&c<-1.6&&p.human){p.spin=.0;p.stun=.6;say(p,'WHEELSPIN!');}
  }
 });
}
