import { type GameId } from './catalog';
import { type CourseId, courseById, jumpFactorAt, loopPitchAt, courseMinimapPoint, getActiveCourse } from './course3d';

export interface Input { x:number; y:number; action:boolean; lanes:boolean[]; }
export const emptyInput = ():Input => ({x:0,y:0,action:false,lanes:[false,false,false,false]});

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
}

export interface Note { time:number; lane:number; judged:boolean[]; }

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
 phase:'countdown'|'playing'|'finished';
 players:Player[];
 crystals:{x:number;y:number;active:boolean;respawn:number}[];
 notes:Note[];
 tennis:TennisBall;
 seed:number;
}

export const TAU=Math.PI*2;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function random(s:State) {s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296;}

export function trackPoint(t:number,lane=0,course:CourseId=getActiveCourse()) {
 const mp=courseMinimapPoint(t,lane,course);
 return {x:480+(mp.x-60)*7.2,y:280+(mp.y-42)*5.8};
}

export function createState(game:GameId,characters:string[],seed=421,course:CourseId='crestfall-gardens'):State {
 const ids=[...characters,...['moki','zippi','nori','pippa'].filter(c=>!characters.includes(c))].slice(0,4);
 const s:State={
  game,
  course,
  time:-3,
  duration:game==='circuit'?120:game==='crystals'||game==='tennis'?60:45,
  autoAccelerate:true,
  phase:'countdown',
  seed,
  crystals:[],
  notes:[],
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
   progress:-i*.009,
   lane:(i-1.5)*19,
   speed:0,score:0,combo:0,bestCombo:0,boost:0,drift:0,cooldown:0,invincible:0,
   feedback:'',feedbackTime:0,finish:null,lastAction:false,lastLanes:[false,false,false,false],
   rpm:1200,gear:1,steerAngle:0,pitch:0,roll:0,
   suspensionFront:0,suspensionRear:0,
   suspensionFL:0,suspensionFR:0,suspensionRL:0,suspensionRR:0,
   hopY:0,hopVy:0,driftDir:0,jounce:0,jounceVel:0,
   inLoop:false,loopAngle:0,
   swingTimer:0,shotPower:0,
   driftStage:0,surface:'asphalt',lateralG:0,slip:0
  }))
 };
 for(let i=0;i<18;i++) s.crystals.push({x:100+random(s)*760,y:100+random(s)*350,active:true,respawn:0});
 for(let i=0;i<78;i++) s.notes.push({time:2+i*.54,lane:Math.floor(random(s)*4),judged:[false,false]});
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

export function step(s:State,inputs:Input[],dt:number) {
 if(s.phase==='finished') return;
 dt=clamp(dt,0,.05);s.time+=dt;
 if(s.time<0) return;
 s.phase='playing';
 const courseDef=courseById(s.course);

 s.players.forEach((p,i)=>{
  p.boost=Math.max(0,p.boost-dt);
  p.cooldown=Math.max(0,p.cooldown-dt);
  p.invincible=Math.max(0,p.invincible-dt);
  p.feedbackTime=Math.max(0,p.feedbackTime-dt);
  p.swingTimer=Math.max(0,p.swingTimer-dt);
  const input=inputs[i]||emptyInput();

  if(s.game==='circuit') {
   if(p.finish!==null)return;
   const steer=p.human?input.x:Math.sin(s.time*.8+i)*.15;
   const throttle=p.human?(input.y>0?-1:s.autoAccelerate||input.y<0?1:0):1;
   p.steerAngle+=(steer-p.steerAngle)*Math.min(1,dt*16);

   // Mario Kart Hop-into-Drift Initiation
   if(p.human&&input.action&&!p.lastAction&&p.hopY<=0.01&&p.speed>.02){
    p.hopVy=2.35;
    p.jounce=-0.10;
    if(Math.abs(steer)>.12) p.driftDir=steer>0?1:-1;
   }
   if(p.human&&input.action&&p.driftDir===0&&Math.abs(steer)>.18){
    p.driftDir=steer>0?1:-1;
   }
   if(!input.action){
    p.driftDir=0;
   }

   // Counter-steer drift line modulation (steer into driftDir tightens arc; opposite widens line)
   const effectiveSteer=p.human&&input.action&&p.driftDir!==0
    ?(p.driftDir*0.18+steer*0.82)
    :steer;
   p.lane=clamp(p.lane-effectiveSteer*(input.action?34:52)*dt,-55,55);

   if(!p.human){
    // Bots steer toward boost pads before vertical loops and weave around single-lane hazards
    const frac=((p.progress%1)+1)%1;
    const approachingLoop=courseDef.loops.some(l=>frac>=l.boostPadT-0.04&&frac<=l.centerT+l.halfWidth);
    const nearHazard=courseDef.hazards.find(h=>frac>=h.t-0.035&&frac<=h.t+0.01);
    const desiredLane=approachingLoop?0:nearHazard?(nearHazard.lane>0?-22:22):Math.sin(s.time*.35+i)*25;
    p.lane+=(desiredLane-p.lane)*dt*(approachingLoop||nearHazard?3.5:1);
   }

   const absLane=Math.abs(p.lane);
   const offroad=absLane>51;
   p.surface=offroad?'offroad':absLane>47?'curb':'asphalt';

   const drifting=p.human&&input.action&&(Math.abs(steer)>.2||p.driftDir!==0)&&p.speed>.025;
   if(drifting){
    // Carving deeper into the turn charges Mini-Turbo sparks slightly faster
    const intoTurn=p.driftDir!==0&&steer*p.driftDir>0?1.12:1.0;
    p.drift=Math.min(1.6,p.drift+dt*intoTurn);
   }
   // Multi-tier drift charging: 1=Blue sparks, 2=Orange flame, 3=Ultra purple
   p.driftStage=p.drift>=1.35?3:p.drift>=.85?2:p.drift>=.35?1:0;
   if(p.lastAction&&!input.action&&p.drift>.35) {
    p.boost=p.drift>=1.35?2.4:p.drift>=.85?1.7:1+p.drift;
    p.pitch=-0.12; // Punchy wheelie nose-lift on Mini-Turbo release
    p.jounceVel=1.4;
    feedback(p,p.drift>=1.35?'ULTRA TURBO!':p.drift>=.85?'SUPER TURBO!':'DRIFT BOOST!');
    p.drift=0;p.driftStage=0;p.driftDir=0;
   }
   if(!input.action){p.drift=0;p.driftStage=0;}
   if(!p.human&&s.time>1.2&&Math.abs(steer)>.12){p.driftStage=Math.abs(steer)>.14?2:1;}
   p.lastAction=input.action;

   // Vertical 360-degree Loop-the-Loop physics (Amazon Canopy Loop)
   const lp=loopPitchAt(p.progress,s.course);
   p.inLoop=lp.inLoop;
   p.loopAngle=lp.theta;
   let loopSpeedMult=1.0;
   if(lp.inLoop){
    if(p.boost>0||p.speed>=.064){
     loopSpeedMult=1.12; // Centrifugal loop sling
    } else if(lp.theta>0.45&&lp.theta<2.55){
     // Entering vertical climb without hitting the Power Boost pad slows the kart
     loopSpeedMult=0.62;
     if(p.human&&p.feedbackTime<=0) feedback(p,'HIT BOOST FOR LOOP!');
    }
   }

   const target=throttle>0?(offroad?.028:p.boost>0?.106*loopSpeedMult:drifting?.058:.070*loopSpeedMult):0;
   const accelRate=throttle<0?6.2:(p.speed<.035?2.4:1.8);
   p.speed+=(target-p.speed)*Math.min(1,dt*accelRate);

   // Vertical Hop & Course Jump Ramp Air Physics
   const rampHeight=p.progress>0.08&&p.speed>.042?jumpFactorAt(p.progress,s.course)*0.38:0;
   const wasAirborne=p.hopY>0.05;
   if(p.hopVy!==0||p.hopY>rampHeight){
    p.hopY+=p.hopVy*dt;
    p.hopVy-=16.5*dt;
    if(p.hopY<=rampHeight){
     p.hopY=rampHeight;
     if(p.hopVy<-0.8){
      // Landed from hop or jump ramp: compress suspension & award Trick Boost on big ramps!
      p.jounceVel=-Math.min(2.6,Math.abs(p.hopVy)*0.65);
      if(wasAirborne&&rampHeight>0.15&&p.boost<=0){
       p.boost=0.85;
       feedback(p,'TRICK BOOST!');
      }
     }
     p.hopVy=0;
    }
   } else {
    p.hopY=rampHeight;
   }

   // Spring-damper chassis jounce oscillator
   p.jounceVel+=(-p.jounce*72-p.jounceVel*11.5)*dt;
   p.jounce=clamp(p.jounce+p.jounceVel*dt,-0.16,0.16);

   // Chassis & 4-wheel independent suspension physics
   const speedNorm=clamp(p.speed/.070,0,1.6);
   const driftSign=p.driftDir!==0?p.driftDir:(steer<0?-1:1);
   p.lateralG=speedNorm*(steer*1.4+(drifting?driftSign*.85:0));
   const targetRoll=-p.lateralG*(drifting?-.17:.13);
   p.roll+=(targetRoll-p.roll)*Math.min(1,dt*12);
   const airPitch=p.hopY>0.12?clamp(p.hopVy*0.06,-0.22,0.22):0;
   const targetPitch=airPitch+(throttle<0?.18:(p.speed<target?-(target-p.speed)*1.6:.0));
   p.pitch+=(targetPitch-p.pitch)*Math.min(1,dt*10);
   p.slip=drifting?1:offroad?.7:Math.min(1,Math.abs(p.lateralG)*.6);

   const chatterL=p.surface==='curb'?Math.sin(s.time*72)*.045:offroad?Math.sin(s.time*36)*.065:0;
   const chatterR=p.surface==='curb'?Math.cos(s.time*72)*.045:offroad?Math.cos(s.time*36)*.065:0;
   p.suspensionFL=clamp(p.pitch*.48-p.roll*.45+p.jounce+chatterL,-.18,.18);
   p.suspensionFR=clamp(p.pitch*.48+p.roll*.45+p.jounce+chatterR,-.18,.18);
   p.suspensionRL=clamp(-p.pitch*.48-p.roll*.45+p.jounce+chatterR,-.18,.18);
   p.suspensionRR=clamp(-p.pitch*.48+p.roll*.45+p.jounce+chatterL,-.18,.18);
   p.suspensionFront=(p.suspensionFL+p.suspensionFR)*.5;
   p.suspensionRear=(p.suspensionRL+p.suspensionRR)*.5;

   // Engine RPM and gear simulation
   const norm=clamp(p.speed/.070,0,1.5);
   p.gear=norm>.9?4:norm>.6?3:norm>.3?2:1;
   const gearRanges=[[0,.3],[.3,.6],[.6,.9],[.9,1.5]];
   const curRange=gearRanges[p.gear-1];
   const gearRatio=clamp((norm-curRange[0])/(curRange[1]-curRange[0]),0,1);
   p.rpm=Math.round(p.boost>0?9600+Math.sin(s.time*50)*400:1200+gearRatio*6800);

   const before=p.progress;p.progress+=p.speed*dt;
   const fraction=((p.progress%1)+1)%1;
   const isLoopPad=courseDef.loops.some(l=>Math.abs(fraction-l.boostPadT)<.016);
   if(!offroad&&p.cooldown===0&&courseDef.boostPads.some(t=>Math.abs(fraction-t)<.014)&&Math.abs(p.lane)<(isLoopPad?36:25)){
    p.boost=isLoopPad?1.95:1.4;
    p.cooldown=isLoopPad?1.4:2;
    p.jounceVel=1.2;
    feedback(p,isLoopPad?'LOOP POWER BOOST!':'TURBO PAD!');
   }
   // Small single-lane avoidable surface hazards (can also be hopped over!)
   if(p.hopY<0.2&&p.boost<=0&&p.invincible<=0){
    const hitHaz=courseDef.hazards.find(h=>Math.abs(fraction-h.t)<.007&&Math.abs(p.lane-h.lane)<7.5);
    if(hitHaz){
     p.speed*=.74;
     p.jounceVel=-1.5;
     p.invincible=.85;
     feedback(p,`${hitHaz.label}!`);
    }
   }
   if(p.human&&s.time>1.2&&!offroad&&p.boost===0&&p.cooldown===0&&Math.abs(steer)>.05){
    const leader=s.players.find((other,oi)=>oi!==i&&other.progress>p.progress&&other.progress-p.progress<.028&&Math.abs(other.lane-p.lane)<14);
    if(leader){p.boost=.95;p.cooldown=2.4;feedback(p,'SLIPSTREAM!');}
   }
   if(p.progress>=3){p.finish=s.time;p.score=10000-Math.round(s.time*50);feedback(p,'FINISH!');}
   if(Math.floor(before)<Math.floor(p.progress)&&p.progress>=1&&p.progress<3)feedback(p,`LAP ${Math.floor(p.progress)+1}`);
   const pt=trackPoint(p.progress,p.lane,s.course);p.x=pt.x;p.y=pt.y;
  } else if(s.game==='crystals') {
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
     if(note&&error<=.19){note.judged[i]=true;p.combo++;p.bestCombo=Math.max(p.bestCombo,p.combo);p.score+=(error<.075?100:60)+Math.min(50,p.combo*2);feedback(p,error<.075?'PERFECT':'NICE');}
     else {p.combo=0;feedback(p,'EARLY / LATE');}
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
 if(s.time>=s.duration||(s.game==='circuit'&&s.players.filter(p=>p.human).every(p=>p.finish!==null))) s.phase='finished';
}

export function standings(s:State) {
 return s.players
  .filter(p=>s.game!=='rhythm'||p.human)
  .map((p,index)=>({...p,index}))
  .sort((a,b)=>s.game==='circuit'
   ? (a.finish??Infinity)-(b.finish??Infinity)||b.progress-a.progress
   : b.score-a.score);
}
