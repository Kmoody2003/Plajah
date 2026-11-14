import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestState,stepQuest,emptyQuestInput,floorRow,MOVE,MAX_HP,type QuestState,type QuestInput} from '../components/kithParty/quest/sim';
import {LEVELS,LEVEL_INFO,TILE,T} from '../components/kithParty/quest/level';
import {runBot} from './kithQuestBot';

const DT=1/120;
const settle=(s:QuestState,sec=2.2)=>{for(let i=0;i<sec*120;i++)stepQuest(s,emptyQuestInput(),DT);};
const run=(s:QuestState,sec:number,inp:(i:number)=>Partial<QuestInput>)=>{for(let i=0;i<sec*120;i++)stepQuest(s,{...emptyQuestInput(),...inp(i)},DT);};
/** Flat test pad: strip enemies so mechanics are measured in isolation. */
const pad=(lv=0)=>{const s=createQuestState('rello',lv);s.ents=s.ents.filter(e=>e.kind==='mote'||e.kind==='sign');settle(s);return s;};

test('five stages with a start, a goal (or boss) and three Star Seeds each',()=>{
 assert.equal(LEVELS.length,5);
 assert.equal(LEVEL_INFO.length,5);
 for(let i=0;i<LEVELS.length;i++){
  const L=LEVELS[i]();
  const seeds=L.ents.filter(e=>e.kind==='seed').length+Object.values(L.boxes).filter(p=>p==='seed').length;
  assert.equal(seeds,3,`${L.name} seeds`);
  assert.ok(L.ents.some(e=>e.kind==='goal')||L.ents.some(e=>e.kind==='boss'),`${L.name} has an exit`);
  assert.ok(L.ents.filter(e=>e.kind==='checkpoint').length>=2,`${L.name} checkpoints`);
  const c=Math.floor(L.start.x/TILE),r=Math.floor(L.start.y/TILE);
  assert.equal(L.tiles[r*L.w+c],T.SOLID,`${L.name} starts on ground`);
 }
});

test('jump envelope: variable height, double jump, glide',()=>{
 const held=pad(),y0=held.player.y;let top=y0;run(held,1,()=>({jump:true}));
 for(let i=0;i<0;i++);
 const s1=pad();let m1=s1.player.y;for(let i=0;i<120;i++){stepQuest(s1,{...emptyQuestInput(),jump:true},DT);m1=Math.min(m1,s1.player.y);}
 const single=y0-m1;
 assert.ok(single>95&&single<118,`single ${single}`);
 const s2=pad();let m2=s2.player.y;for(let i=0;i<120;i++){stepQuest(s2,{...emptyQuestInput(),jump:i<8},DT);m2=Math.min(m2,s2.player.y);}
 assert.ok(y0-m2<single*.7,`tap jump ${y0-m2} should be well below held ${single}`);
 const s3=pad();let m3=s3.player.y;for(let i=0;i<160;i++){stepQuest(s3,{...emptyQuestInput(),jump:!(i>=40&&i<42)},DT);m3=Math.min(m3,s3.player.y);}
 assert.ok(y0-m3>170,`double ${y0-m3}`);
 // glide caps fall speed once the double jump is spent
 const s4=pad();for(let i=0;i<150;i++)stepQuest(s4,{...emptyQuestInput(),jump:!(i>=40&&i<42)},DT);
 if(!s4.player.onGround){assert.ok(s4.player.vy<=MOVE.GLIDE_FALL+1);assert.equal(s4.player.anim,'glide');}
 void top;
});

test('momentum: top speed only after sustained running; roll keeps speed',()=>{
 const s=pad();run(s,.4,()=>({x:1}));
 assert.ok(s.player.vx<=MOVE.RUN+1&&!s.player.topSpeed);
 run(s,1.2,()=>({x:1}));
 assert.ok(s.player.topSpeed&&s.player.vx>MOVE.RUN+50,`vx ${s.player.vx}`);
 run(s,.05,()=>({x:1,y:1}));
 assert.equal(s.player.rolling,true);
 assert.equal(s.player.h,MOVE.H_ROLL);
});

test('coyote time lets a jump start just after leaving a ledge',()=>{
 const s=pad();
 const p=s.player;p.onGround=false;p.coyote=MOVE.COYOTE;p.vy=10;
 stepQuest(s,{...emptyQuestInput(),jump:true},DT);
 assert.ok(p.vy< -500,`vy ${p.vy}`);
});

test('stomping a Thistlebug pops it and bounces the Kith',()=>{
 const s=pad();const p=s.player;
 const s0=createQuestState('rello',0);const w=s0.ents.find(e=>e.kind==='walker')!;
 w.x=p.x;w.y=p.y+p.h-w.h;w.vx=0;w.id=999;s.ents.push({...w});
 p.y-=60;p.vy=300;p.onGround=false;
 for(let i=0;i<20;i++)stepQuest(s,emptyQuestInput(),DT);
 assert.equal(s.ents.find(e=>e.id===999)!.alive,false);
 assert.ok(s.events.some(e=>e.type==='stomp'));
 assert.equal(p.hp,MAX_HP);
});

test('bash: freezes near a lantern node, launches along the aim and refreshes air moves',()=>{
 const s=pad(1);const p=s.player;
 s.ents.push({id:777,kind:'bashNode',x:p.x+30,y:p.y-60,w:28,h:28,vx:0,vy:0,alive:true,hp:1,t:0,dir:1,data:0,onGround:false,ox:0,oy:0,hurt:0,state:'idle',stateT:0});
 p.y-=50;p.onGround=false;p.airJumps=0;p.canDash=false;
 stepQuest(s,{...emptyQuestInput(),dash:true,x:1,y:-1},DT);
 assert.ok(p.bash,'bash started');
 for(let i=0;i<40&&p.bash;i++)stepQuest(s,{...emptyQuestInput(),dash:true,x:1,y:-1},DT);
 stepQuest(s,{...emptyQuestInput(),x:1,y:-1},DT);
 assert.equal(p.bash,null);
 assert.ok(p.vx>300&&p.vy< -300,`launch ${p.vx},${p.vy}`);
 assert.equal(p.airJumps,p.traits.airJumps);assert.equal(p.canDash,true);
});

test('lash parries an enemy shot back as a friendly projectile',()=>{
 const s=pad();const p=s.player;
 s.shots.push({id:555,x:p.x+p.w+30,y:p.y+p.h*.35,vx:-200,vy:0,r:10,friendly:false,kind:'spore',t:0,alive:true,dmg:1});
 run(s,.15,i=>({attack:i===0}));
 const sh=s.shots.find(x=>x.id===555);
 assert.ok(sh&&sh.friendly&&sh.vx>0,'reflected');
 assert.equal(p.hp,MAX_HP);
});

test('falling into a pit costs one petal and respawns on safe ground',()=>{
 const s=pad();const p=s.player;
 run(s,.6,()=>({x:1}));
 const safe={...p.safe};
 p.x=-500;p.y=s.level.h*TILE+80;
 stepQuest(s,emptyQuestInput(),DT);
 assert.equal(p.hp,MAX_HP-1);
 assert.ok(Math.abs(p.x+p.w/2-safe.x)<1&&Math.abs(p.y+p.h-safe.y)<1);
});

test('same inputs give the same run (deterministic sim)',()=>{
 const a=runBot(0,30),b=runBot(0,30);
 assert.equal(a.s.player.x,b.s.player.x);assert.equal(a.s.player.score,b.s.player.score);assert.equal(a.s.time,b.s.time);
});

test('every stage is traversable: the bot clears 1 and 2 and reaches the Warden in 3',()=>{
 for(const lv of [0,1]){const {s}=runBot(lv,240);assert.equal(s.phase,'clear',`${s.level.name} col ${Math.floor(s.player.x/TILE)}`);assert.ok(s.result&&s.result.time>0);}
 const {s}=runBot(2,240);
 assert.ok(s.arenaLocked||s.boss!.state!=='dormant',`reached arena (col ${Math.floor(s.player.x/TILE)})`);
});

test('the Hollow Warden: phases, defeat, Lantern Gate and stage clear',()=>{
 const s=createQuestState('rello',2);settle(s);
 const A=s.level.arena!;const p=s.player;
 p.x=(A.c0+8)*TILE;p.y=floorRow(s,A.c0+8)*TILE-p.h;p.vy=0;
 for(let i=0;i<2;i++)stepQuest(s,emptyQuestInput(),DT);
 assert.equal(s.arenaLocked,true);assert.equal(s.boss!.state,'intro');
 const phases=new Set<number>();
 for(let i=0;i<120*90&&(s.boss!.state as string)!=='dead';i++){
  p.invuln=10;p.hp=MAX_HP;
  // stay under the boss and lash upward; sparks keep flying
  const B=s.boss!;const bx=B.x+B.w/2;
  stepQuest(s,{...emptyQuestInput(),x:Math.abs(bx-(p.x+p.w/2))>20?Math.sign(bx-(p.x+p.w/2)):0,y:-1,jump:i%40<20,attack:i%16===0,special:i%60===0},DT);
  phases.add(B.phase);p.sparks=9;
 }
 assert.equal(s.boss!.state,'dead');
 assert.deepEqual([...phases].sort(),[0,1,2]);
 assert.equal(s.arenaLocked,false);
 const gate=s.ents.find(e=>e.kind==='goal'&&e.alive)!;assert.ok(gate);
 p.invuln=0;p.x=gate.x;p.y=gate.y+gate.h-p.h;stepQuest(s,emptyQuestInput(),DT);
 assert.equal(s.phase,'clear');
});

test('new enemy archetypes: beetle armor/roll crack, wisp bolt, briar snap, sentinel crystal fan & spark drop',()=>{
 const s3=createQuestState('rello',3),s4=createQuestState('rello',4);
 // 1. Mossback Beetle resists stomp (1 dmg + bonk) and shatters under Roll
 {
  const s=pad();const p=s.player;const x0=p.x,y0=p.y;
  const tpl=s3.ents.find(e=>e.kind==='beetle')!;
  const b={...tpl,id:901,x:x0,y:y0+p.h-tpl.h,vx:0,vy:0,alive:true,hp:2};
  s.ents.push(b);
  p.y-=60;p.vy=300;p.onGround=false;p.invuln=10;
  const evs:string[]=[];
  for(let i=0;i<30;i++){stepQuest(s,emptyQuestInput(),DT);evs.push(...s.events.map(e=>e.type));}
  const ent=s.ents.find(e=>e.id===901)!;
  assert.equal(ent.alive,true,'beetle survives armored stomp');
  assert.equal(ent.hp,1,'beetle takes 1 stomp damage');
  assert.ok(evs.includes('bonk'),'stomp emits metallic bonk');
  // Now spin up momentum on the spot and roll cleanly through it
  settle(s,.5);
  p.x=x0-20;p.y=y0;p.vx=320;p.onGround=true;
  ent.x=x0+42;ent.y=y0+p.h-ent.h;ent.vx=0;
  for(let i=0;i<35&&ent.alive;i++)stepQuest(s,{...emptyQuestInput(),x:1,y:1},DT);
  assert.equal(p.rolling,true);
  assert.equal(ent.alive,false,'roll cracks beetle shell');
 }
 // 2. Lantern Wisp floats and casts wispCast projectiles
 {
  const s=pad();const p=s.player;
  const tpl=s3.ents.find(e=>e.kind==='wisp')!;
  const w={...tpl,id:902,x:p.x+160,ox:p.x+160,y:p.y-24,oy:p.y-24,vx:0,vy:0,alive:true,stateT:2.0};
  s.ents.push(w);
  const evs:string[]=[];
  let sawShot=false;
  for(let i=0;i<180;i++){p.invuln=10;stepQuest(s,emptyQuestInput(),DT);evs.push(...s.events.map(e=>e.type));if(s.shots.some(sh=>!sh.friendly))sawShot=true;}
  assert.ok(evs.includes('wispCast'),'wisp casts projectile');
  assert.equal(sawShot,true,'wisp fires active shot');
 }
 // 3. Briar Mimic ambushes and snaps when player approaches
 {
  const s=pad();const p=s.player;
  const tpl=s3.ents.find(e=>e.kind==='briar')!;
  const br={...tpl,id:903,x:p.x+72,ox:p.x+72,y:p.y+p.h-tpl.h,oy:p.y+p.h-tpl.h,vx:0,vy:0,alive:true,state:'idle' as const,stateT:0};
  s.ents.push(br);
  const evs:string[]=[];
  for(let i=0;i<120;i++){p.invuln=10;stepQuest(s,emptyQuestInput(),DT);evs.push(...s.events.map(e=>e.type));}
  assert.ok(evs.includes('briarSnap'),'briar snaps out of ambush');
 }
 // 4. Astral Sentinel fires crystal fan and drops a Spark on defeat
 {
  const s=pad();const p=s.player;
  const tpl=s4.ents.find(e=>e.kind==='sentinel')!;
  const sn={...tpl,id:904,x:p.x+56,ox:p.x+56,y:p.y-10,oy:p.y-10,vx:0,vy:0,alive:true,hp:4,stateT:2.0};
  s.ents.push(sn);
  let sawEnemyShots=false;
  for(let i=0;i<300&&sn.alive;i++){
   p.invuln=10;p.hp=MAX_HP;p.sparks=9;
   const dx=sn.x-p.x;
   stepQuest(s,{...emptyQuestInput(),x:Math.abs(dx)>44?Math.sign(dx):0,attack:i%14===0,special:i%35===0},DT);
   if(s.shots.some(sh=>!sh.friendly))sawEnemyShots=true;
  }
  assert.equal(sawEnemyShots,true,'sentinel fires crystal bolts');
  assert.equal(sn.alive,false,'sentinel can be defeated');
  assert.ok(s.ents.some(e=>e.kind==='spark'&&e.alive),'sentinel drops a spark');
 }
});

test('new bosses: Gale Sovereign (Stage 4) and Umbra Weaver (Stage 5) phases, blink, and clear',()=>{
 for(const [lv,wantKind,wantName] of [[3,'sovereign','THE GALE SOVEREIGN'],[4,'weaver','THE UMBRA WEAVER']] as const){
  const s=createQuestState('rello',lv);settle(s);
  const A=s.level.arena!;const p=s.player;
  p.x=(A.c0+8)*TILE;p.y=floorRow(s,A.c0+8)*TILE-p.h;p.vy=0;
  for(let i=0;i<2;i++)stepQuest(s,emptyQuestInput(),DT);
  assert.equal(s.arenaLocked,true,`${wantName} locks arena`);
  assert.equal(s.boss!.kind,wantKind);
  assert.equal(s.boss!.name,wantName);
  assert.equal(s.boss!.state,'intro');
  const phases=new Set<number>();
  let sawBlink=false;
  for(let i=0;i<120*140&&(s.boss!.state as string)!=='dead';i++){
   p.invuln=10;p.hp=MAX_HP;
   const B=s.boss!;const bx=B.x+B.w/2;
   const waitBlink=wantKind==='weaver'&&!sawBlink&&i<120*22;
   stepQuest(s,waitBlink?emptyQuestInput():{...emptyQuestInput(),x:Math.abs(bx-(p.x+p.w/2))>20?Math.sign(bx-(p.x+p.w/2)):0,y:-1,jump:i%40<20,attack:i%16===0,special:i%60===0},DT);
   if(s.events.some(e=>e.type==='bossBlink')||B.state==='blink')sawBlink=true;
   phases.add(B.phase);p.sparks=9;
  }
  if(wantKind==='weaver')assert.equal(sawBlink,true,'Umbra Weaver uses blink teleport');
  assert.equal(s.boss!.state,'dead',`${wantName} defeated`);
  assert.deepEqual([...phases].sort(),[0,1,2],`${wantName} cycles all 3 phases`);
  assert.equal(s.arenaLocked,false);
  const gate=s.ents.find(e=>e.kind==='goal'&&e.alive)!;assert.ok(gate,`${wantName} spawns goal`);
  p.invuln=0;p.x=gate.x;p.y=gate.y+gate.h-p.h;stepQuest(s,emptyQuestInput(),DT);
  assert.equal(s.phase,'clear');
 }
});

test('lullaby score: three original 16-bar themes in 3/4 whose melodies fill every bar',async()=>{
 const {QUEST_THEMES}=await import('../components/kithParty/quest/score');
 assert.equal(QUEST_THEMES.length,3);
 for(const th of QUEST_THEMES){
  assert.equal(th.beats,3);assert.ok(th.bpm>=56&&th.bpm<=76,'slow lullaby tempo');
  assert.equal(th.chords.length,16);assert.equal(th.melody.length,16);
  th.melody.forEach((bar,i)=>assert.equal(bar.reduce((a,[,b])=>a+b,0),3,`bar ${i+1}`));
 }
});

test('adaptive score: every stage has energy and danger zones; danger + battle pieces are well-formed',async()=>{
 const {moodAt}=await import('../components/kithParty/quest/level');
 const {QUEST_DANGER,QUEST_BATTLE}=await import('../components/kithParty/quest/score');
 for(let i=0;i<LEVELS.length;i++){
  const L=LEVELS[i]();const kinds=new Set(L.moods.map(m=>m.mood));
  assert.ok(kinds.has('energy')&&kinds.has('danger')&&kinds.has('calm'),`${L.name} moods ${[...kinds]}`);
  assert.equal(moodAt(L,L.start.x),'calm',`${L.name} starts calm`);
  assert.ok(L.moods.every((m,k)=>k===0||m.c>=L.moods[k-1].c),`${L.name} zones in order`);
 }
 assert.equal(QUEST_DANGER.chords.length,8);
 QUEST_DANGER.melody.forEach((bar,i)=>assert.equal(bar.reduce((a,[,b])=>a+b,0),3,`danger bar ${i+1}`));
 assert.equal(QUEST_BATTLE.chords.length,16);
 QUEST_BATTLE.melody.forEach((bar,i)=>assert.equal(bar.reduce((a,[,b])=>a+b,0),3,`battle bar ${i+1}`));
});

/* ── the Chora score: one project per cue ── */
import {QUEST_CUES,lineBeats,parseLine,barVoicings} from '../data/gameScores/kithQuest';
import {buildKithQuestGrooveDoc,kithQuestProjects,isKithQuestProjectId,KITH_QUEST_TAIL_BARS,divisiLines} from '../services/melos/kithQuestChoraProjects';
import {KITH_QUEST_MIX} from '../data/gameScores/kithQuestMix';

test('every cue is written in whole bars and its parts stay inside the body',()=>{
 assert.equal(QUEST_CUES.length,12);
 for(const c of QUEST_CUES){
  const bars=c.chords.length,want=bars*c.beats;
  c.chords.forEach(f=>assert.ok(barVoicings(f).every(v=>v.length>=3),`${c.id} chord ${f}`));
  const lines:[string,string|undefined][]=[['melody',c.melody],['counter',c.counter],['bass',c.bass],...c.parts.filter(p=>p.src==='line').map(p=>[p.key,p.line] as [string,string|undefined])];
  for(const [n,l] of lines) if(l){ parseLine(l); assert.ok(Math.abs(lineBeats(l)-want)<1e-6,`${c.id} ${n}: ${lineBeats(l)} beats, want ${want}`); }
  for(const p of c.parts) for(const [a,z] of p.bars??[]) assert.ok(a>=0&&z<=bars&&a<z,`${c.id} ${p.key} bars`);
 }
});

test('the lantern motif (sol · do – re – mi) opens the title theme and closes every lullaby answer',()=>{
 const intervals=(line:string,n:number)=>{const k=parseLine(line).slice(0,n).map(e=>e.keys[0]);return k.slice(1).map((x,i)=>x-k[i]);};
 assert.deepEqual(intervals(QUEST_CUES.find(c=>c.id==='title')!.melody,4),[5,2,2]);
 for(const id of ['calm-glowmoss','calm-cascade']){
  const ev=parseLine(QUEST_CUES.find(c=>c.id===id)!.counter!), last=ev.slice(-4).map(e=>e.keys[0]);
  assert.deepEqual(last.slice(1).map((x,i)=>x-last[i]),[5,2,2],id);
 }
});

test('each cue builds a Chora project: instrument tracks, a loop region, a ring-out tail, ARP on the generative parts',()=>{
 const infos=kithQuestProjects();
 assert.equal(infos.length,12);
 for(const p of infos){
  assert.ok(isKithQuestProjectId(p.id));
  const c=QUEST_CUES.find(x=>x.id===p.cueId)!, d=buildKithQuestGrooveDoc(p.id);
  const body=c.chords.length*c.beats;
  assert.equal(d.bpm,c.bpm);
  assert.ok(d.arrangement.length>=6&&d.arrangement.every(t=>t.kind==='instrument'&&t.instrument),p.id);
  assert.equal(Math.max(...d.arrangement.flatMap(t=>t.clips.map(k=>k.startBeats+k.lengthBeats))),body+KITH_QUEST_TAIL_BARS*c.beats,p.id);
  if(c.loop) assert.deepEqual([d.loop?.startBeats,d.loop?.endBeats],[0,body]);
  if(c.beats===3) assert.equal(d.meter?.[0].num,3);
  for(const part of c.parts.filter(x=>x.src==='arp')) assert.ok(d.arrangement.some(t=>t.instrument?.arp&&t.name.startsWith(part.label)),`${p.id} ${part.key} arp`);
  assert.deepEqual(d.mixer.sendBuses?.map(b=>b.inserts?.[0]?.type),['spaces','delay']);
 }
 // deterministic: same cue, same notes
 const a=buildKithQuestGrooveDoc('kithquest-battle'),b=buildKithQuestGrooveDoc('kithquest-battle');
 assert.deepEqual(a.arrangement.map(t=>t.clips.map(k=>k.notes)),b.arrangement.map(t=>t.clips.map(k=>k.notes)));
});

test('the council orchestration: a voice-led string section, TONOS in every loop, no bells, mix trims name real parts',()=>{
 const BELLS=/celesta|bells|vitreous|glass|himalayan|ferrous|deep-wash|cimbalom|santur|yangqin/;
 for(const c of QUEST_CUES){
  assert.ok(!c.parts.some(p=>BELLS.test(p.preset)),`${c.id}: bell-type voice`);
  assert.ok(!c.parts.some(p=>p.src==='pad'),`${c.id}: block pad`);
  if(c.loop) assert.ok(c.parts.some(p=>p.inst==='tonos'),`${c.id}: no TONOS`);
  const keys=new Set(c.parts.map(p=>p.key));
  assert.equal(keys.size,c.parts.length,`${c.id}: duplicate part keys`);
  for(const k of Object.keys(KITH_QUEST_MIX[c.id]??{})) assert.ok(keys.has(k),`${c.id}: mix trim for missing part ${k}`);
 }
 // the string choir: four lines, no crossed voices, each section inside its range, motion mostly by step
 for(const id of ['title','calm-glowmoss','battle']){
  const c=QUEST_CUES.find(x=>x.id===id)!, L=divisiLines(c);
  assert.equal(L.length,4);
  const at=(v:number,t:number)=>L[v].find(n=>t>=n.t-1e-6&&t<n.t+n.d-1e-6)?.key;
  for(let t=0;t<c.chords.length*c.beats;t+=c.beats){const ks=[0,1,2,3].map(v=>at(v,t)!);for(let i=0;i<3;i++)assert.ok(ks[i]>ks[i+1],`${id} beat ${t}: crossed ${ks}`);}
  for(const line of L){let leaps=0;for(let i=1;i<line.length;i++)if(Math.abs(line[i].key-line[i-1].key)>4)leaps++;assert.ok(leaps/line.length<0.25,`${id}: too many leaps`);}
 }
});
