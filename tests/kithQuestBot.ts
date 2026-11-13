/** Simple right-running bot used by tests/kithQuest.test.ts to prove each stage is traversable. */
import {createQuestState,stepQuest,emptyQuestInput,groundBelow,type QuestState} from '../components/kithParty/quest/sim';
import {TILE,tileAt} from '../components/kithParty/quest/level';
export function botInput(s:QuestState,mem:{hold:number;dashed:boolean;wj:number}){
 const p=s.player,inp=emptyQuestInput();inp.x=1;
 const cx=p.x+p.w/2,feet=p.y+p.h;
 const aheadG=groundBelow(s,p.x+p.w+18,feet-4);
 const wallAhead=[1,2,3].some(k=>{const c=Math.floor((p.x+p.w+6)/TILE),r=Math.floor((feet-1-k*14)/TILE);const v=tileAt(s.level,c,r);return v===1||v===5||v===6||v===7;})||(p.vx<5&&s.time>.3&&p.onGround);
 if(p.wallSliding||(p.wallDir&&!p.onGround&&p.vy>0)){ if(mem.wj<=0){inp.jump=true;mem.wj=14;} }
 if(mem.wj>0){mem.wj--;inp.jump=mem.wj>4;inp.x=mem.wj>4?-1:1; if(mem.wj<=0&&p.wallDir)inp.x=p.wallDir;}
 if(p.onGround){mem.dashed=false;
  if(mem.hold<=0&&(aheadG-feet>8||wallAhead)){mem.hold=38;}
 }
 if(mem.hold>0){inp.jump=true;mem.hold--;}
 if(!p.onGround&&p.vy>-60&&wallAhead&&p.airJumps>0&&!p.wallDir){inp.jump=!s.prev.jump;if(inp.jump)mem.hold=30;}
 else if(!p.onGround&&p.vy>40&&groundBelow(s,cx+40,feet)===Infinity){
  if(p.airJumps>0){inp.jump=!s.prev.jump; if(inp.jump)mem.hold=30;}
  else if(!mem.dashed&&p.canDash){inp.dash=true;mem.dashed=true;}
  else inp.jump=true;
 }
 inp.attack=s.player.attackCd<=0&&!s.prev.attack;
 return inp;
}
export function runBot(lv:number,maxSec=300,char='rello'){
 const s=createQuestState(char,lv);const mem={hold:0,dashed:false,wj:0};
 let lastX=0,stuck=0,deaths:string[]=[];let lastLives=s.player.lives,lastHp=s.player.hp;
 for(let i=0;i<120*maxSec&&s.phase!=='clear'&&s.phase!=='over';i++){
  stepQuest(s,botInput(s,mem),1/120);
  const p=s.player;
  if(p.hp<lastHp||p.lives<lastLives)deaths.push(`${Math.floor((p.x+12)/TILE)}`);lastHp=p.hp;lastLives=p.lives;
  if(i%360===0){if(Math.abs(p.x-lastX)<8)stuck++;else stuck=0;lastX=p.x;if(stuck>3)break;}
 }
 return {s,deaths,stuckCol:stuck>3?Math.floor((s.player.x+12)/TILE):-1};
}
