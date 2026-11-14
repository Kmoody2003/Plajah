import { type GameId } from './catalog';
import { type CourseId, courseMinimapPoint, getActiveCourse, gridProgress, setActiveCourse } from './course3d';
import type {ItemId} from './abilities';
import {createRaceExtras, racerDefaults, raceCountdown, stepRace, type RaceExtras} from './race';
import { buildChoraRhythmChart, type ChoraDifficulty } from './choraRhythm';

/** y < 0 accelerate, y > 0 brake / reverse. `item` fires the held item, `special` the Kith Type Special. */
export interface Input { x:number; y:number; action:boolean; lanes:boolean[]; item:boolean; special:boolean;  /** Arrow presses since the last frame, in order (0 ← 1 ↓ 2 ↑ 3 →) — key-down events, so a quick tap is never lost. */
 taps?:number[];
}
export const emptyInput = ():Input => ({x:0,y:0,action:false,lanes:[false,false,false,false],item:false,special:false});

export interface Player {
 character:string; human:boolean; x:number; y:number; progress:number; lane:number; speed:number;
 score:number; combo:number; bestCombo:number; boost:number; drift:number; cooldown:number; invincible:number;
 feedback:string; feedbackTime:number; finish:number|null; lastAction:boolean; lastLanes:boolean[];
 rpm:number; gear:number; steerAngle:number; pitch:number; roll:number;
 suspensionFront:number; suspensionRear:number;
 suspensionFL:number; suspensionFR:number; suspensionRL:number; suspensionRR:number;
 hopY:number; hopVy:number; driftDir:number; jounce:number; jounceVel:number;
 inLoop:boolean; loopAngle:number;
 swingTimer:number; shotPower:number;
 driftStage:number; surface:'asphalt'|'curb'|'offroad'; lateralG:number; slip:number;
 /** kart yaw relative to the road tangent (rad), front-wheel angle (rad), yaw rate (rad/s) */
 heading:number; wheelAngle:number; yawRate:number;
 // ---- Kith Racing (circuit) ----
 /** metres / second (negative while reversing); `speed` stays progress/second for older consumers */
 mps:number; speedNorm:number; braking:boolean; reversing:boolean;
 item:ItemId|null; itemCount:number; itemRoll:number;
 /** Type Special meter 0..1 and active timer */
 special:number; specialTime:number;
 spin:number; spinDir?:number; stun:number; slowTime:number; blind:number; frozen:number;
 shield:number; shieldTime:number; gearHits:number;
 airTime:number; trick:boolean; trickSpin:number; onRamp:boolean; launched?:boolean;
 /** shortcut index (-1 = on the road), progress along it 0..1 */
 cut:number; cutU:number; cutBase:number;
 respawn:number; respawnTo:number;
 /** 0..1 rubber burn: skid marks + tyre smoke */
 burnout:number; place:number; wallHit:number;
 chargeStart:number|null; lastItem:boolean; lastSpecial:boolean;
 trailTimer:number; botThink:number; botLane:number; superBoost:boolean; slipTime?:number; lastBump?:number;
 /** Voca Word Boost: race time the open word challenge started (-1 = none), challenges used this race */
 vocaCue?:number; vocaUsed?:number; vocaAt?:number;
 /** Twist-kicker stunt: arrow combo to enter in the air (0 ← 1 ↓ 2 ↑ 3 →); landed clean or crashed. */
 stunt?:{seq:number[]; idx:number; state:'active'|'done'|'fail'; dir:1|-1; at:number; doneAt:number}|null;
 stuntPrev?:number;
 /** 0..1 glider wings out (very high air) */
 glide?:number;
}

export interface Note { time:number; lane:number; judged:boolean[]; accent?:boolean; }

export interface TennisBall {
 x:number; y:number; z:number;
 vx:number; vy:number; vz:number;
 lastHitter:number;
 bounces:number;
 rally:number;
 bestRally:number;
 shotType:'normal'|'topspin'|'smash'|'lob';
 serveTimer:number;
 server:number;
 bounceX:number;
 bounceY:number;
 bounceTime:number;
 trail:{x:number;y:number;z:number}[];
}

export interface State {
 game:GameId;
 course:CourseId;
 time:number;
 duration:number;
 autoAccelerate:boolean;
 /** Voca Word Boost: on a jump or item box, Voca says a word; say it back for a super boost (≤2 per race). UI turns it on. */
 vocaWords?:boolean;
 /** UI-only bullet time: how fast the world moves vs the wall clock (1 = normal). The camera keeps real time. */
 timeScale?:number;
 phase:'countdown'|'playing'|'finished';
 players:Player[];
 crystals:{x:number;y:number;active:boolean;respawn:number}[];
 notes:Note[];
 tennis:TennisBall;
 seed:number;
 /** projectiles, traps, item boxes and race events — circuit only */
 race?:RaceExtras;
 rhythmSongId?:string;
 rhythmSongTitle?:string;
 rhythmDifficulty?:ChoraDifficulty;
 rhythmBpm?:number;
 rhythmAudioUrl?:string;
 rhythmLeadIn?:number;
 rhythmAccent?:string;
}

export const TAU=Math.PI*2;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function random(s:State) {s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296;}

export function trackPoint(t:number,lane=0,course:CourseId=getActiveCourse()):{x:number;y:number} {
 const mp=courseMinimapPoint(t,lane,course);
 return {x:480+(mp.x-60)*7.2,y:280+(mp.y-42)*5.8};
}

export function createState(game:GameId,characters:string[],seed=421,course:CourseId='crestfall-gardens',rhythm?:{songId?:string;difficulty?:ChoraDifficulty}):State {
 const ids=[...characters,...['moki','zippi','nori','pippa'].filter(c=>!characters.includes(c))].slice(0,4);
 const chart=game==='rhythm'?buildChoraRhythmChart(rhythm?.songId,rhythm?.difficulty??'groove'):null;
 const s:State={
  game,
  course,
  time:-3,
  duration:game==='circuit'?240:game==='crystals'||game==='tennis'?60:chart?chart.song.durationSec:45,
  autoAccelerate:false, // the player governs speed: ↑ / RT is the gas
  phase:'countdown',
  seed,
  crystals:[],
  notes:[],
  rhythmSongId:chart?.song.id,
  rhythmSongTitle:chart?.song.title,
  rhythmDifficulty:chart?.difficulty,
  rhythmBpm:chart?.song.bpm,
  rhythmAudioUrl:chart?.song.audioUrl,
  rhythmLeadIn:chart?.song.audioLeadInSec,
  rhythmAccent:chart?.song.accent,
  tennis:{
   x:480,y:420,z:28,
   vx:45,vy:-275,vz:175,
   lastHitter:0,bounces:0,rally:0,bestRally:0,
   shotType:'normal',serveTimer:0,server:0,
   bounceX:480,bounceY:180,bounceTime:0,
   trail:[],
  },
  players:ids.map((character,i)=>({
   character,
   human:i<characters.length,
   x:game==='tennis'?(i===0?480:i===1?480:i===2?310:650):250+i*150,
   y:game==='tennis'?(i===0?455:i===1?125:i===2?410:170):280,
   progress:game==='circuit'?gridProgress(i,course):-i*.009,
   lane:(i-1.5)*19,
   speed:0,score:0,combo:0,bestCombo:0,boost:0,drift:0,cooldown:0,invincible:0,
   feedback:'',feedbackTime:0,finish:null,lastAction:false,lastLanes:[false,false,false,false],
   rpm:1200,gear:1,steerAngle:0,pitch:0,roll:0,
   suspensionFront:0,suspensionRear:0,
   suspensionFL:0,suspensionFR:0,suspensionRL:0,suspensionRR:0,
   hopY:0,hopVy:0,driftDir:0,jounce:0,jounceVel:0,
   inLoop:false,loopAngle:0,
   swingTimer:0,shotPower:0,
   driftStage:0,surface:'asphalt',lateralG:0,slip:0,heading:0,wheelAngle:0,yawRate:0,
   ...(racerDefaults() as any),
  }))
 };
 if(game==='circuit'){setActiveCourse(course);s.race=createRaceExtras(course);}
 for(let i=0;i<18;i++) s.crystals.push({x:100+random(s)*760,y:100+random(s)*350,active:true,respawn:0});
 if(chart&&chart.notes.length){
  for(const n of chart.notes) s.notes.push({time:n.time,lane:n.lane,accent:!!n.accent,judged:[false,false]});
 } else {
  for(let i=0;i<78;i++) s.notes.push({time:2+i*.54,lane:Math.floor(random(s)*4),judged:[false,false]});
 }
 return s;
}

export function bumpers(time:number) {
 return Array.from({length:4},(_,i)=>({x:480+Math.sin(time*.7+i*1.7)*320,y:280+Math.cos(time*.9+i*2)*160}));
}

function feedback(p:Player,text:string) {p.feedback=text;p.feedbackTime=.75;}

function resetTennisPoint(s:State,serverIdx:number){
 const b=s.tennis;
 b.server=serverIdx%2;
 b.lastHitter=b.server;
 b.bounces=0;
 b.rally=0;
 b.shotType='normal';
 b.serveTimer=0.45;
 const serverPlayer=s.players[b.server];
 b.x=clamp(serverPlayer?.x||480,260,700);
 b.y=b.server===0?430:140;
 b.z=32;
 const aimDir=b.server===0?-1:1;
 b.vx=(random(s)-.5)*150;
 b.vy=aimDir*295;
 b.vz=185;
 b.trail=[];
}

/** Seconds of course flyover before the 3-2-1 countdown (the UI sets s.time=-3-CIRCUIT_INTRO; sims/tests start at -3). */
export const CIRCUIT_INTRO=8;

export function step(s:State,inputs:Input[],dt:number) {
 if(s.phase==='finished') return;
 dt=clamp(dt,0,.05);s.time+=dt;
 if(s.game==='circuit')raceCountdown(s,inputs,dt);
 if(s.time<0) return;
 s.phase='playing';
 if(s.game==='circuit'){
  stepRace(s,inputs,dt);
  if(s.time>=s.duration||s.players.filter(p=>p.human).every(p=>p.finish!==null)) s.phase='finished';
  return;
 }

 s.players.forEach((p,i)=>{
  p.boost=Math.max(0,p.boost-dt);
  p.cooldown=Math.max(0,p.cooldown-dt);
  p.invincible=Math.max(0,p.invincible-dt);
  p.feedbackTime=Math.max(0,p.feedbackTime-dt);
  p.swingTimer=Math.max(0,p.swingTimer-dt);
  const input=inputs[i]||emptyInput();

  if(s.game==='crystals') {
   let dx=input.x,dy=input.y,action=input.action;
   if(!p.human) {
    const target=s.crystals.filter(c=>c.active).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    dx=target?target.x-p.x:0;dy=target?target.y-p.y:0;action=false;
   }
   const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
   if(action&&!p.lastAction&&p.cooldown===0){p.boost=.23;p.invincible=.55;p.cooldown=1.7;}
   p.lastAction=action;
   const speed=p.boost>0?490:p.human?180:125;
   p.x=clamp(p.x+dx*speed*dt,55,905);p.y=clamp(p.y+dy*speed*dt,75,500);
   s.crystals.forEach(c=>{if(c.active&&Math.hypot(c.x-p.x,c.y-p.y)<28){c.active=false;c.respawn=s.time+2;p.score++;feedback(p,'+1');}});
   bumpers(s.time).forEach(b=>{if(p.invincible===0&&Math.hypot(b.x-p.x,b.y-p.y)<36){p.score=Math.max(0,p.score-2);p.invincible=1.1;feedback(p,'−2');}});
  } else if(s.game==='tennis') {
   // Kith Tennis: Team 0 (Players 0 & 2 on Bottom Court y:295..515) vs Team 1 (Players 1 & 3 on Top Court y:75..255)
   const isBottom=i%2===0;
   const minY=isBottom?292:72, maxY=isBottom?515:255;
   const minX=150, maxX=810;
   let dx=input.x, dy=input.y, action=input.action;
   const ball=s.tennis;
   if(!p.human){
    // Intelligent Court AI: primary defender tracks ball, doubles partner covers cross-court
    const ballComingToSide=(isBottom&&ball.vy>0)||(!isBottom&&ball.vy<0);
    const isFrontPartner=i>=2;
    const homeX=isFrontPartner?(i===2?320:640):480;
    const homeY=isBottom?(isFrontPartner?355:455):(isFrontPartner?195:115);
    const targetX=ballComingToSide?clamp(ball.x+(isFrontPartner?(homeX-480)*0.35:0),minX+20,maxX-20):homeX;
    const targetY=ballComingToSide?clamp(ball.y+(isBottom?28:-28),minY+15,maxY-15):homeY;
    dx=clamp((targetX-p.x)/45,-1,1);
    dy=clamp((targetY-p.y)/45,-1,1);
    action=ballComingToSide&&Math.hypot(ball.x-p.x,ball.y-p.y)<64&&ball.z<52;
   }
   const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
   // Diving lunge on Action press when ball is slightly out of reach
   if(action&&!p.lastAction&&p.cooldown===0){
    p.boost=0.22;
    p.cooldown=0.65;
    p.swingTimer=0.32;
    p.shotPower=1.35;
   } else if(action){
    p.shotPower=Math.min(1.5,p.shotPower+dt*0.9);
   } else {
    p.shotPower=Math.max(1.0,p.shotPower-dt*1.5);
   }
   p.lastAction=action;
   const moveSpeed=(p.boost>0?430:p.human?255:210);
   p.x=clamp(p.x+dx*moveSpeed*dt,minX,maxX);
   p.y=clamp(p.y+dy*moveSpeed*dt,minY,maxY);
  } else if(p.human) {
   input.lanes.forEach((pressed,lane)=>{
    if(pressed&&!p.lastLanes[lane]) {
     const note=s.notes.filter(n=>!n.judged[i]&&n.lane===lane).sort((a,b)=>Math.abs(a.time-s.time)-Math.abs(b.time-s.time))[0];
     const error=note?Math.abs(note.time-s.time):Infinity;
     if(note&&error<=.19){
      note.judged[i]=true;p.combo++;p.bestCombo=Math.max(p.bestCombo,p.combo);
      const mult=p.combo>=24?2:p.combo>=12?1.5:1;
      const base=(error<.075?100:60)+(note.accent?45:0)+Math.min(50,p.combo*2);
      p.score+=Math.round(base*mult);
      feedback(p,note.accent&&error<.085?'CHORA STAR!':error<.075?'PERFECT':'NICE');
     } else {p.combo=0;feedback(p,'EARLY / LATE');}
    }
   });
   s.notes.forEach(n=>{if(!n.judged[i]&&s.time-n.time>.19){n.judged[i]=true;p.combo=0;feedback(p,'MISS');}});
   p.lastLanes=[...input.lanes];
  }
 });

 // Step Kith Tennis 3D ball physics, racket returns, and rally scoring
 if(s.game==='tennis'){
  const b=s.tennis;
  if(b.serveTimer>0){
   b.serveTimer=Math.max(0,b.serveTimer-dt);
  } else {
   b.x+=b.vx*dt;
   b.y+=b.vy*dt;
   b.z+=b.vz*dt;
   b.vz-=490*dt; // Court gravity
   if(s.time*60%2<1){
    b.trail.push({x:b.x,y:b.y,z:b.z});
    if(b.trail.length>12) b.trail.shift();
   }

   // Bounce on court surface
   if(b.z<=0){
    b.z=0;
    b.vz=Math.abs(b.vz)*0.68;
    b.bounces++;
    b.bounceX=b.x;b.bounceY=b.y;b.bounceTime=0.35;
   }
   b.bounceTime=Math.max(0,b.bounceTime-dt);

   // Check player racket hits
   s.players.forEach((p,idx)=>{
    const isBottom=idx%2===0;
    const team=isBottom?0:1;
    // Only return ball if it is travelling toward this team's court
    const incoming=(isBottom&&b.vy>0&&b.y>268)||(!isBottom&&b.vy<0&&b.y<282);
    if(!incoming) return;
    const dist=Math.hypot(b.x-p.x,b.y-p.y);
    const reach=p.boost>0?76:58;
    if(dist<reach&&b.z<68){
     const inp=inputs[idx]||emptyInput();
     const isSmash=inp.action||p.swingTimer>0||(b.z>28&&p.human);
     const isDive=dist>54&&p.boost>0;
     b.lastHitter=idx;
     b.bounces=0;
     b.rally++;
     b.bestRally=Math.max(b.bestRally,b.rally);
     p.swingTimer=0.28;
     p.combo++;
     p.bestCombo=Math.max(p.bestCombo,p.combo);

     // Aim return across the net into the opposite court
     const dirY=isBottom?-1:1;
     const aimX=p.human&&Math.abs(inp.x)>0.1
      ?clamp(480+inp.x*235,205,755)
      :clamp(480+Math.sin(s.time*3.7+idx)*210,215,745);
     const targetY=isBottom?(isSmash?118:155):(isSmash?442:405);
     const flightTime=isSmash?0.62:0.84;
     b.vx=(aimX-b.x)/flightTime;
     b.vy=(targetY-b.y)/flightTime;
     b.vz=isSmash?175:235;
     b.z=Math.max(14,b.z);
     b.shotType=isSmash?'smash':inp.y<0?'topspin':inp.y>0?'lob':'normal';
     void dirY;
     void team;

     const pts=(isSmash?35:20)+Math.min(40,b.rally*4);
     p.score+=pts;
     feedback(p,isDive?'DIVE SAVE!':isSmash?'POWER SMASH!':b.rally>=5?`RALLY ×${b.rally}!`:'+20');
    }
   });

   // Point scored if ball bounces twice or passes far past baseline
   const outBottom=b.y>548||(b.y>275&&b.bounces>=2);
   const outTop=b.y<25||(b.y<=275&&b.bounces>=2);
   if(outBottom||outTop){
    const winningTeam=outBottom?1:0;
    s.players.forEach((p,idx)=>{
     if(idx%2===winningTeam){
      p.score+=120;
      if(idx===b.lastHitter) feedback(p,b.rally<=1?'ACE WINNER! +120':'POINT WINNER! +120');
     } else {
      p.combo=0;
     }
    });
    resetTennisPoint(s,winningTeam);
   }
  }
 }

 if(s.game==='crystals') s.crystals.forEach(c=>{if(!c.active&&s.time>=c.respawn){c.x=80+random(s)*800;c.y=90+random(s)*390;c.active=true;}});
 if(s.time>=s.duration) s.phase='finished';
}

export function standings(s:State) {
 return s.players
  .filter(p=>s.game!=='rhythm'||p.human)
  .map((p,index)=>({...p,index}))
  .sort((a,b)=>s.game==='circuit'
   ? (a.finish??Infinity)-(b.finish??Infinity)||b.progress-a.progress
   : b.score-a.score);
}
