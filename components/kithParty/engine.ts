import { type GameId } from './catalog';
export interface Input { x:number; y:number; action:boolean; lanes:boolean[]; }
export const emptyInput = ():Input => ({x:0,y:0,action:false,lanes:[false,false,false,false]});
export interface Player { character:string; human:boolean; x:number; y:number; progress:number; lane:number; speed:number; score:number; combo:number; bestCombo:number; boost:number; drift:number; cooldown:number; invincible:number; feedback:string; feedbackTime:number; finish:number|null; lastAction:boolean; lastLanes:boolean[]; rpm:number; gear:number; steerAngle:number; pitch:number; roll:number; suspensionFront:number; suspensionRear:number; driftStage:number; surface:'asphalt'|'curb'|'offroad'; lateralG:number; slip:number; }
export interface Note { time:number; lane:number; judged:boolean[]; }
export interface State { game:GameId; time:number; duration:number; autoAccelerate:boolean; phase:'countdown'|'playing'|'finished'; players:Player[]; crystals:{x:number;y:number;active:boolean;respawn:number}[]; notes:Note[]; seed:number; }
export const TAU=Math.PI*2;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
function random(s:State) {s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0; return s.seed/4294967296;}
export function trackPoint(t:number,lane=0) {const a=t*TAU-Math.PI/2; const r=1+.075*Math.sin(a*3); return {x:480+Math.cos(a)*(333*r+lane),y:280+Math.sin(a)*(183*r+lane*.7)};}
export function createState(game:GameId,characters:string[],seed=421):State {
 const ids=[...characters,...['moki','zippi','nori','pippa'].filter(c=>!characters.includes(c))].slice(0,4);
 const s:State={game,time:-3,duration:game==='circuit'?120:game==='crystals'?60:45,autoAccelerate:true,phase:'countdown',seed,crystals:[],notes:[],players:ids.map((character,i)=>({character,human:i<characters.length,x:250+i*150,y:280,progress:-i*.009,lane:(i-1.5)*19,speed:0,score:0,combo:0,bestCombo:0,boost:0,drift:0,cooldown:0,invincible:0,feedback:'',feedbackTime:0,finish:null,lastAction:false,lastLanes:[false,false,false,false],rpm:1200,gear:1,steerAngle:0,pitch:0,roll:0,suspensionFront:0,suspensionRear:0,driftStage:0,surface:'asphalt',lateralG:0,slip:0}))};
 for(let i=0;i<18;i++) s.crystals.push({x:100+random(s)*760,y:100+random(s)*350,active:true,respawn:0});
 for(let i=0;i<78;i++) s.notes.push({time:2+i*.54,lane:Math.floor(random(s)*4),judged:[false,false]});
 return s;
}
export function bumpers(time:number) {return Array.from({length:4},(_,i)=>({x:480+Math.sin(time*.7+i*1.7)*320,y:280+Math.cos(time*.9+i*2)*160}));}
function feedback(p:Player,text:string) {p.feedback=text;p.feedbackTime=.7;}
export function step(s:State,inputs:Input[],dt:number) {
 if(s.phase==='finished') return;
 dt=clamp(dt,0,.05);s.time+=dt;
 if(s.time<0) return;
 s.phase='playing';
 s.players.forEach((p,i)=>{
  p.boost=Math.max(0,p.boost-dt);p.cooldown=Math.max(0,p.cooldown-dt);p.invincible=Math.max(0,p.invincible-dt);p.feedbackTime=Math.max(0,p.feedbackTime-dt);
  const input=inputs[i]||emptyInput();
  if(s.game==='circuit') {
   if(p.finish!==null)return;
   const steer=p.human?input.x:Math.sin(s.time*.8+i)*.15;
   const throttle=p.human?(input.y>0?-1:s.autoAccelerate||input.y<0?1:0):1;
   // The circuit runs clockwise: inward is the driver's right.
   p.steerAngle+=(steer-p.steerAngle)*Math.min(1,dt*16);
   p.lane=clamp(p.lane-steer*(input.action?34:52)*dt,-55,55);
   if(!p.human) p.lane+=(Math.sin(s.time*.35+i)*25-p.lane)*dt;
   const absLane=Math.abs(p.lane);
   const offroad=absLane>51;
   p.surface=offroad?'offroad':absLane>47?'curb':'asphalt';
   const drifting=p.human&&input.action&&Math.abs(steer)>.2&&p.speed>.025;
   if(drifting) p.drift=Math.min(1.6,p.drift+dt);
   // Multi-tier drift charging: 1=Blue sparks, 2=Orange flame, 3=Ultra purple
   p.driftStage=p.drift>=1.35?3:p.drift>=.85?2:p.drift>=.35?1:0;
   if(p.lastAction&&!input.action&&p.drift>.35) {
    p.boost=p.drift>=1.35?2.4:p.drift>=.85?1.7:1+p.drift;
    feedback(p,p.drift>=1.35?'ULTRA TURBO!':p.drift>=.85?'SUPER TURBO!':'DRIFT BOOST!');
    p.drift=0;p.driftStage=0;
   }
   if(!input.action){p.drift=0;p.driftStage=0;}
   p.lastAction=input.action;
   const target=throttle>0?(offroad?.028:p.boost>0?.106:drifting?.058:.070):0;
   // Punchy low-end takeoff torque transitioning to aero drag curve; rapid disc braking
   const accelRate=throttle<0?6.2:(p.speed<.035?2.4:1.8);
   p.speed+=(target-p.speed)*Math.min(1,dt*accelRate);
   // Chassis & suspension physics calculations
   const speedNorm=clamp(p.speed/.070,0,1.6);
   p.lateralG=speedNorm*(steer*1.4+(drifting?(steer<0?-1:1)*.8:0));
   const targetRoll=-p.lateralG*(drifting?-.16:.12);
   p.roll+=(targetRoll-p.roll)*Math.min(1,dt*12);
   const targetPitch=throttle<0?.18:(p.speed<target?-(target-p.speed)*1.6:.0);
   p.pitch+=(targetPitch-p.pitch)*Math.min(1,dt*10);
   p.slip=drifting?1:offroad?.7:Math.min(1,Math.abs(p.lateralG)*.6);
   const chatter=p.surface==='curb'?Math.sin(s.time*70)*.04:offroad?Math.sin(s.time*35)*.06:0;
   p.suspensionFront=clamp(p.pitch*.5+chatter,-.15,.15);
   p.suspensionRear=clamp(-p.pitch*.5+chatter,-.15,.15);
   // Engine RPM and gear simulation
   const norm=clamp(p.speed/.070,0,1.5);
   p.gear=norm>.9?4:norm>.6?3:norm>.3?2:1;
   const gearRanges=[[0,.3],[.3,.6],[.6,.9],[.9,1.5]];
   const curRange=gearRanges[p.gear-1];
   const gearRatio=clamp((norm-curRange[0])/(curRange[1]-curRange[0]),0,1);
   p.rpm=Math.round(p.boost>0?9600+Math.sin(s.time*50)*400:1200+gearRatio*6800);
   const before=p.progress;p.progress+=p.speed*dt;
   const fraction=((p.progress%1)+1)%1;
   if(!offroad&&p.cooldown===0&&[.17,.49,.78].some(t=>Math.abs(fraction-t)<.012)&&Math.abs(p.lane)<25){p.boost=1.4;p.cooldown=2;feedback(p,'TURBO PAD!');}
   if(p.progress>=3){p.finish=s.time;p.score=10000-Math.round(s.time*50);feedback(p,'FINISH!');}
   if(Math.floor(before)<Math.floor(p.progress)&&p.progress>=1&&p.progress<3)feedback(p,`LAP ${Math.floor(p.progress)+1}`);
   const pt=trackPoint(p.progress,p.lane);p.x=pt.x;p.y=pt.y;
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
 if(s.game==='crystals') s.crystals.forEach(c=>{if(!c.active&&s.time>=c.respawn){c.x=80+random(s)*800;c.y=90+random(s)*390;c.active=true;}});
 if(s.time>=s.duration||(s.game==='circuit'&&s.players.filter(p=>p.human).every(p=>p.finish!==null))) s.phase='finished';
}
export function standings(s:State) {return s.players.filter(p=>s.game!=='rhythm'||p.human).map((p,index)=>({...p,index})).sort((a,b)=>s.game==='circuit' ? (a.finish??Infinity)-(b.finish??Infinity)||b.progress-a.progress : b.score-a.score);}
