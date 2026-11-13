import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,emptyInput,step,standings,type State} from '../components/kithParty/engine';
import {ALL_GAMES,CHARACTERS,GAMES} from '../components/kithParty/catalog';
import {COURSES,trackFrame,worldPoint,courseMinimapPath,ensureOffTrackXZ,courseLength,courseShortcuts,finishProgress,normT,obstacleState} from '../components/kithParty/course3d';
import {KITH_KARTS,SPECIALS} from '../components/kithParty/abilities';
import {lyriaMusic} from '../components/kithParty/lyriaMusic';

const go={...emptyInput(),y:-1};
/** A started race (countdown over) with racer 0 parked at progress t, lane 0. */
function raceAt(course:State['course'],t:number,chars=['rello']){const s=createState('circuit',chars,421,course);s.time=0;s.phase='playing';const p=s.players[0];p.progress=t;p.lane=0;return s;}

test('ten Kith with a kart + Type Special each, four cup games plus Kart Kombat, six courses',()=>{
 assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,10);
 for(const c of CHARACTERS)assert.ok(KITH_KARTS[c.id],`${c.id} has a kart`);
 assert.equal(new Set(Object.values(KITH_KARTS).map(k=>k.special.id)).size,10);
 assert.equal(GAMES.length,4);assert.ok(ALL_GAMES.some(g=>g.id==='kombat'));
 assert.equal(COURSES.length,6);
 assert.ok(COURSES.some(c=>c.kind==='sprint'));
 for(const c of COURSES){assert.ok(c.obstacles.length>0&&c.itemRows.length>0&&c.jumps.length>0,`${c.id} has obstacles, item boxes and jumps`);assert.ok(c.tunnels.length+c.bridges.length>0,`${c.id} has a tunnel or bridge`);}
 assert.ok(COURSES.filter(c=>c.loops.length).length>=2);
 assert.ok(COURSES.filter(c=>courseShortcuts(c.id).length).length>=3);
});

test('countdown prevents movement; an idle player with auto-gas off does not win',()=>{
 const s=createState('circuit',['rello']);s.autoAccelerate=false;const p=s.players[0].progress;
 step(s,[emptyInput()],.05);assert.equal(s.players[0].progress,p);
 for(let i=0;i<120*80;i++)step(s,[emptyInput()],1/120);
 assert.equal(s.players[0].finish,null);assert.notEqual(standings(s)[0].character,'rello');
});

test('holding the gas finishes a three-lap circuit and a one-run sprint',()=>{
 for(const course of ['crestfall-gardens','ember-ridge'] as const){
  const s=createState('circuit',['rello'],421,course);
  for(let i=0;i<120*240&&s.phase!=='finished';i++)step(s,[go],1/120);
  assert.equal(s.phase,'finished',course);assert.ok(s.players[0].finish,course);
  assert.ok(s.players[0].progress>=finishProgress(course));
 }
});

test('throttle accelerates, brakes dive the nose and stop the kart, then it reverses',()=>{
 const s=raceAt('crestfall-gardens',.05);const p=s.players[0];
 for(let i=0;i<240;i++)step(s,[go],1/120);
 assert.ok(p.mps>30,`up to speed (${p.mps})`);
 for(let i=0;i<20;i++)step(s,[{...emptyInput(),y:1}],1/120);
 assert.ok(p.braking&&p.pitch>.05,'brake dive');
 for(let i=0;i<240;i++)step(s,[{...emptyInput(),y:1}],1/120);
 assert.ok(p.mps<0&&p.reversing,'reversing');
 s.autoAccelerate=false;p.mps=0;p.reversing=false;step(s,[emptyInput()],.05);assert.equal(p.mps,0);
 step(s,[go],.05);assert.ok(p.mps>0);
});

test('Kith type stats shape the kart: Volt launches harder, Terra has the higher top speed',()=>{
 const s=createState('circuit',['zippi','bram']);s.time=0;
 for(let i=0;i<60;i++)step(s,[go,go],1/120);
 assert.ok(s.players[0].mps>s.players[1].mps);
 for(let i=0;i<120*12;i++)step(s,[go,go],1/120);
 const top=(id:string)=>36+KITH_KARTS[id].stats.speed*1.6;
 assert.ok(top('bram')>top('zippi'));
});

test('hop-drift charges blue, orange then ultra mini-turbos; suspension reacts per wheel',()=>{
 const s=raceAt('crestfall-gardens',.05);const p=s.players[0];p.mps=38;
 step(s,[{...go,x:.6,action:true}],1/120);
 assert.ok(p.hopVy>0);assert.equal(p.driftDir,1);
 for(let i=0;i<200;i++)step(s,[{...go,x:.6,action:true}],1/120);
 assert.equal(p.driftStage,3);assert.notEqual(p.suspensionFL,p.suspensionFR);assert.ok(p.burnout>.5,'burning rubber');
 step(s,[go],1/120);
 assert.ok(p.boost>=2,'ultra mini-turbo');
});

test('loop boost pad and 360° loop invert the track normal',()=>{
 const apex=trackFrame(.2,0,'amazon-canopy');assert.equal(apex.inLoop,true);assert.ok(apex.normal.y<-.5);
 const polar=trackFrame(.32,0,'polar-vortex');assert.equal(polar.inLoop,true);assert.ok(polar.normal.y<-.5);
 const s=raceAt('amazon-canopy',.1645);const p=s.players[0];p.mps=30;p.cooldown=0;
 step(s,[go],1/120);assert.ok(p.boost>=1.8);
});

test('ramps launch karts; slow karts fall in the gap and get rescued; a mid-air trick pays a boost',()=>{
 const course='crestfall-gardens',jump=COURSES[0].jumps[0],L=courseLength(course);
 let s=raceAt(course,jump.t-jump.rampLen-.002);let p=s.players[0];p.mps=40;
 let air=false;for(let i=0;i<120&&!air;i++){step(s,[go],1/120);air=!!p.launched&&p.hopY>1;}
 assert.ok(air,'launched off the lip');
 step(s,[{...go,action:true}],1/120);assert.ok(p.trick,'trick registered');
 for(let i=0;i<240&&p.hopY>0;i++)step(s,[go],1/120);
 for(let i=0;i<4;i++)step(s,[go],1/120);
 assert.ok(p.boost>0,'trick boost on landing');
 s=raceAt(course,jump.t+.002);p=s.players[0];p.mps=6;s.autoAccelerate=false;
 let rescued=false;for(let i=0;i<600&&!rescued;i++){step(s,[emptyInput()],1/120);rescued=p.respawn>0;}
 assert.ok(rescued,'fell into the gap');
 for(let i=0;i<300;i++)step(s,[emptyInput()],1/120);
 assert.ok(normT(p.progress,course)>jump.t+jump.gap,'dropped back past the gap');
 void L;
});

test('item boxes roll an item; a seed bolt spins out the kart ahead; a bubble shield blocks it',()=>{
 const course='crestfall-gardens',row=COURSES[0].itemRows[0];
 const s=raceAt(course,row-.004,['rello','chora']);const p=s.players[0];p.mps=30;p.lane=0;
 for(let i=0;i<60;i++)step(s,[go,emptyInput()],1/120);
 assert.ok(p.item&&p.itemRoll>0,'rolling');
 for(let i=0;i<160;i++)step(s,[go,emptyInput()],1/120);
 assert.equal(p.itemRoll,0);
 const L=courseLength(course);
 p.item='seed-bolt';p.itemCount=1;p.lane=0;p.steerAngle=0;
 const t=s.players[1];t.progress=p.progress+18/L;t.lane=0;t.mps=0;t.invincible=0;t.shield=0;
 step(s,[{...go,item:true},emptyInput()],1/120);
 for(let i=0;i<120&&t.spin<=0;i++)step(s,[go,emptyInput()],1/120);
 assert.ok(t.spin>0,'target spun out');
 t.spin=0;t.invincible=0;t.shield=1;t.shieldTime=10;t.progress=p.progress+18/L;t.lane=p.lane;
 p.item='seed-bolt';p.itemCount=1;p.lastItem=false;
 step(s,[{...go,item:true},emptyInput()],1/120);
 for(let i=0;i<120&&t.shield>0;i++)step(s,[go,emptyInput()],1/120);
 assert.equal(t.shield,0);assert.equal(t.spin,0,'shield took the hit');
});

test('every Kith Type Special does something on the track',()=>{
 const L=courseLength('crestfall-gardens');
 for(const [id,kart] of Object.entries(KITH_KARTS)){
  const s=raceAt('crestfall-gardens',.06,[id,id==='rello'?'chora':'rello']);
  const p=s.players[0];p.mps=36;p.special=1;
  const rival=s.players[1];
  // put a rival just ahead for forward attacks, just behind for rear attacks
  const rear=['confetti-storm','bramble-snare','inferno-afterburner'].includes(kart.special.id);
  rival.progress=p.progress+(rear?-10:14)/L;rival.lane=0;rival.invincible=0;
  const before={progress:p.progress,traps:s.race!.traps.length,proj:s.race!.projectiles.length};
  step(s,[{...go,special:true},emptyInput()],1/120);
  for(let i=0;i<120;i++)step(s,[go,emptyInput()],1/120);
  const did=p.boost>0||p.gearHits>0||p.invincible>0||s.race!.traps.length>before.traps||s.race!.projectiles.length>before.proj
   ||rival.spin>0||rival.stun>0||rival.slowTime>0||rival.frozen>0||rival.blind>0||p.progress-before.progress>40/L;
  assert.ok(did,`${kart.special.id} had an effect`);
  assert.ok(s.race!.events.some(e=>e.kind==='special'&&e.data===kart.special.id));
 }
 assert.equal(Object.keys(SPECIALS).length,10);
});

test('moving obstacles spin out karts that drive into them',()=>{
 const course='crestfall-gardens';const o=COURSES[0].obstacles.find(x=>x.kind==='crusher')!;
 const s=raceAt(course,o.t-.003);const p=s.players[0];p.lane=o.lane;p.mps=25;
 let tm=0;while(!obstacleState(o,tm).active)tm+=.01;
 s.time=tm-.05;
 for(let i=0;i<60&&p.spin<=0;i++)step(s,[{...go,x:0}],1/120);
 assert.ok(p.spin>0);
});

test('hugging the inside of a hairpin takes the shortcut and saves track distance',()=>{
 const course='dune-canyon';const sc=courseShortcuts(course)[0];assert.ok(sc);
 const s=raceAt(course,sc.fromT-.0005);const p=s.players[0];p.lane=sc.side*50;p.mps=40;p.boost=5;
 step(s,[go],1/120);step(s,[go],1/120);
 assert.equal(p.cut,0,'on the shortcut');
 const start=p.progress;let steps=0;
 while(p.cut>=0&&steps<600){step(s,[go],1/120);steps++;}
 const travelled=steps/120*45;
 assert.ok((p.progress-start)*courseLength(course)>travelled*1.15,'arc skipped is longer than distance driven');
});

test('rocket start for gas held in the sweet spot; standings rank finishers by time',()=>{
 const s=createState('circuit',['rello']);
 while(s.time<-.8)step(s,[emptyInput()],1/120);
 while(s.time<.02)step(s,[go],1/120);
 assert.ok(s.players[0].boost>0);
 assert.ok(s.race!.events.some(e=>e.data==='rocket'&&e.player===0));
});

test('all six courses have tear-free road edges, minimaps, and off-track clearance',()=>{
 const paths=new Set(COURSES.map(c=>courseMinimapPath(c.id)));
 assert.equal(paths.size,6);
 for(const c of COURSES){
  const N=320;
  for(let i=0;i<N;i++){
   if(c.kind==='sprint'&&i===N-1)continue;
   const t0=i/N,t1=((i+1)%N)/N;
   const f0=trackFrame(t0,0,c.id);
   const pL0=worldPoint(t0,-74,0,c.id),pL1=worldPoint(t1,-74,0,c.id);
   const pR0=worldPoint(t0,74,0,c.id),pR1=worldPoint(t1,74,0,c.id);
   assert.ok(pL1.clone().sub(pL0).dot(f0.tangent)>0.15,`Left edge tear on ${c.id} at t=${t0}`);
   assert.ok(pR1.clone().sub(pR0).dot(f0.tangent)>0.15,`Right edge tear on ${c.id} at t=${t0}`);
  }
  const onRoad=worldPoint(0.25,0,0,c.id);
  const pushed=ensureOffTrackXZ(onRoad.x,onRoad.z,8,c.id);
  assert.ok(Math.hypot(pushed.x-onRoad.x,pushed.z-onRoad.z)>=20);
 }
});

test('seeded races replay identically',()=>{
 const a=createState('circuit',['rello'],77,'polar-vortex'),b=createState('circuit',['rello'],77,'polar-vortex');
 for(let i=0;i<120*20;i++){const inp={...go,x:Math.sin(i/90),action:i%300<120,item:i%400===0,special:i%900===0};step(a,[inp],1/120);step(b,[inp],1/120);}
 assert.deepEqual(a.players.map(p=>[p.progress,p.lane,p.item,p.special]),b.players.map(p=>[p.progress,p.lane,p.item,p.special]));
});

test('two player race waits for both players, finishes freeze simulation',()=>{const s=createState('circuit',['rello','chora']);s.time=0;s.players[0].progress=2.9999;s.players[0].mps=40;step(s,[go,emptyInput()],.05);assert.ok(s.players[0].finish);assert.equal(s.phase,'playing');s.time=s.duration;step(s,[],.01);const t=s.time;step(s,[],.05);assert.equal(s.time,t);});
test('right input steers toward negative lanes',()=>{const s=raceAt('crestfall-gardens',.05);s.players[0].mps=30;const lane=s.players[0].lane;step(s,[{...go,x:1}],.05);assert.ok(s.players[0].lane<lane);});

test('note-driven Lyria controller responds to game music note events and race telemetry',()=>{
 lyriaMusic.onNoteStep({
  track:'race',
  courseId:'polar-vortex',
  step:0,
  bar:1,
  bpm:142,
  midiNote:84, // C6
  bassNote:29, // F1
  chordNotes:[53,56,60,63],
  scaleName:'F_MINOR',
  intensity:0.85,
  speedNorm:1.2,
  driftStage:3,
  boostActive:true,
  inLoop:false,
  lap:3,
 },0,0.1);
 const st=lyriaMusic.getStatus();
 assert.equal(st.lastNoteName,'C6');
 assert.equal(st.currentScale,'F_MINOR');
 assert.equal(st.bpm,142);
 assert.ok(st.density>0.8);
 assert.ok(st.brightness>0.8);
});
test('kith tennis rally returns ball and awards smash & point scores',()=>{
 const s=createState('tennis',['rello','chora']);s.time=0;
 const p1=s.players[0];
 s.tennis.x=p1.x;s.tennis.y=p1.y-10;s.tennis.z=20;s.tennis.vy=220;s.tennis.serveTimer=0;
 step(s,[{...emptyInput(),x:.4,action:true},emptyInput()],1/120);
 assert.ok(p1.score>=35);assert.ok(s.tennis.vy<0);assert.equal(s.tennis.shotType,'smash');
});
test('crystals collect once and respawn; dashing respects cooldown',()=>{const s=createState('crystals',['rello']);s.time=0;const p=s.players[0];s.crystals=[{x:p.x,y:p.y,active:true,respawn:0}];step(s,[{...emptyInput(),action:true}],.01);assert.equal(p.score,1);assert.ok(p.cooldown>1);assert.equal(s.crystals[0].active,false);step(s,[emptyInput()],.01);const cooldown=p.cooldown;step(s,[{...emptyInput(),action:true}],.01);assert.ok(p.cooldown<cooldown);for(let i=0;i<300;i++)step(s,[],1/120);assert.equal(s.crystals[0].active,true);});
test('rhythm awards edge-triggered hits independently for each player',()=>{const s=createState('rhythm',['rello','chora']);s.time=1.999;s.notes=[{time:2,lane:0,judged:[false,false]}];const hit={...emptyInput(),lanes:[true,false,false,false]};step(s,[hit,emptyInput()],.001);assert.equal(s.players[0].score,102);assert.equal(s.players[1].score,0);step(s,[hit,hit],.01);assert.equal(s.players[0].score,102);assert.equal(s.players[1].score,102);});
test('missed notes break combo and completed rhythm is ranked only among humans',()=>{const s=createState('rhythm',['chora']);s.time=2;s.players[0].combo=5;s.notes=[{time:1,lane:1,judged:[false,false]}];step(s,[],.01);assert.equal(s.players[0].combo,0);assert.equal(standings(s).length,1);s.time=45;step(s,[],.01);assert.equal(s.phase,'finished');});
test('seeded arena simulations reproduce the same result',()=>{const a=createState('crystals',['rello'],13),b=createState('crystals',['rello'],13);for(let i=0;i<1000;i++){step(a,[],1/120);step(b,[],1/120);}assert.deepEqual(a,b);});

test('track morphs: every course has zones; short is shorter, long is longer, road stays continuous', async () => {
 const {courseMorphs,morphState,setMorph}=await import('../components/kithParty/course3d');
 for(const c of COURSES){
  const zones=courseMorphs(c.id);
  assert.ok(zones.length>=1,`${c.id} has a morph zone`);
  zones.forEach((z,i)=>{
   setMorph(c.id,i,0,'long',1);const base=morphState(c.id)[i].len;
   setMorph(c.id,i,1,'short',1);const short=morphState(c.id)[i].len;
   let prev=trackFrame(z.startT-.004,0,c.id).position,maxStep=0;
   for(let k=0;k<=80;k++){const q=trackFrame(z.startT-.003+(z.endT-z.startT+.006)*k/80,0,c.id).position;assert.ok(Number.isFinite(q.x+q.y+q.z));maxStep=Math.max(maxStep,q.distanceTo(prev));prev=q;}
   setMorph(c.id,i,1,'long',1);const long=morphState(c.id)[i].len;
   setMorph(c.id,i,0,'long',1);
   assert.ok(short<base*.9,`${c.id}#${i} short ${short.toFixed(1)} < base ${base.toFixed(1)}`);
   assert.ok(long>base,`${c.id}#${i} long ${long.toFixed(1)} > base ${base.toFixed(1)}`);
   assert.ok(maxStep<3,`${c.id}#${i} no tear (max step ${maxStep.toFixed(2)} m)`);
  });
 }
});

test('steering: the kart yaws with the front wheels and heading carries it across the road', () => {
 const s=raceAt('crestfall-gardens',.88);
 const p=s.players[0];
 for(let k=0;k<60;k++)step(s,[go],1/120);
 const lane0=p.lane;
 for(let k=0;k<36;k++)step(s,[{...go,x:1}],1/120);
 assert.ok(p.wheelAngle>.05,'front wheels turned');
 assert.ok(p.heading>.05,'kart body yawed');
 assert.ok(p.lane<lane0-3,'heading moved the kart toward lower lanes');
 for(let k=0;k<240;k++)step(s,[go],1/120);
 assert.ok(Math.abs(p.heading)<.05,'tyres self-align when the wheel is centred');
});

test('steering: bends pull an unsteered kart wide; bots steer through them on their own', () => {
 const s=createState('circuit',['rello'],421,'crestfall-gardens');s.time=-3;s.autoAccelerate=true; // gas held, hands off the wheel
 const walls=s.players.map(()=>0);let seen=0;
 for(let i=0;i<120*40;i++){step(s,[emptyInput()],1/120);for(const e of s.race!.events)if(e.id>seen){seen=e.id;if(e.kind==='wall')walls[e.player]++;}}
 assert.ok(walls[0]>5,`hands-off kart should run wide into the rail (got ${walls[0]})`);
 assert.ok(walls.slice(1).every(w=>w<=3),`bots should hold their line (got ${walls.slice(1).join(',')})`);
});

test('Voca Word Boost: off by default in the sim; on, a jump opens a word challenge, at most twice a race', async () => {
 const {vocaAnswer,VOCA_MAX,VOCA_WINDOW}=await import('../components/kithParty/race');
 const course='crestfall-gardens',jump=COURSES[0].jumps[0];
 const launchAt=(s:State,lap:number)=>{const p=s.players[0];p.progress=lap+jump.t-jump.rampLen-.002;p.lane=0;p.mps=40;p.hopY=0;p.hopVy=0;p.launched=false;
  for(let i=0;i<120&&!p.launched;i++)step(s,[go],1/120);assert.ok(p.launched,'launched');for(let i=0;i<400&&p.hopY>0;i++)step(s,[go],1/120);};
 let s=raceAt(course,0);launchAt(s,1);assert.equal(s.players[0].vocaCue,-1,'no challenge unless the UI turns Word Boost on');
 s=raceAt(course,0);s.vocaWords=true;const p=s.players[0];
 launchAt(s,0);if(jump.t/3<.12)assert.equal(p.vocaCue,-1,'never in the opening seconds of the race');
 p.vocaCue=-1;p.vocaUsed=0;p.vocaAt=-99;
 // lap 2 jump: Voca cues a word
 p.progress=1+jump.t-jump.rampLen-.002;p.mps=40;let cued=false;for(let i=0;i<120&&!cued;i++){step(s,[go],1/120);cued=(p.vocaCue??-1)>=0;}
 assert.ok(cued,'a jump in lap 2 opens a word challenge');assert.equal(p.vocaUsed,1);
 assert.ok(s.race!.events.some(e=>e.kind==='voca'&&e.data==='cue'));
 vocaAnswer(s,0,true);assert.equal(p.vocaCue,-1);assert.ok(p.superBoost&&p.boost>3.5,'saying the word gives a super boost');
 // second chance later in the race (after the gap); a third never comes
 s.time+=25;launchAt(s,2);assert.ok((p.vocaCue??-1)>=0,'second challenge');assert.equal(p.vocaUsed,2);
 p.progress=1.5;for(let i=0;i<120*(VOCA_WINDOW+1.5);i++){if(p.progress>2.6)p.progress=1.5;step(s,[go],1/120);}
 assert.equal(p.vocaCue,-1,'an unanswered challenge closes on its own');assert.ok(s.race!.events.some(e=>e.kind==='voca'&&e.data==='miss'));
 s.time+=25;p.finish=null;launchAt(s,2);assert.equal(p.vocaCue,-1,`no more than ${VOCA_MAX} a race`);
});

test('Voca Word Boost words: level-sized, safe, review words first, forgiving ears', async () => {
 const {wordsForLevel,pickRaceWord,heardIt}=await import('../components/kithParty/vocaBoost');
 const easy=wordsForLevel(1),hard=wordsForLevel(8);
 assert.ok(easy.length>=10&&hard.length>=10,`word pools (${easy.length}, ${hard.length})`);
 assert.ok(easy.every(w=>w.word.length>=3&&w.word.length<=5&&/^[a-z]+$/.test(w.word)));
 assert.ok(hard.every(w=>w.word.length>=6));
 const used=new Set<string>();
 assert.deepEqual(pickRaceWord({level:3,review:['garden'],used,rand:()=>0}).word,'garden');
 const fresh=pickRaceWord({level:3,review:[],used,rand:()=>.5});assert.equal(fresh.review,false);assert.ok(fresh.syllables.length>=1);
 assert.ok(heardIt('rocket',['rocket'],3));assert.ok(heardIt('rocket',['the','rockets'],3));assert.ok(heardIt('lantern',['lanterm'],5));
 assert.ok(!heardIt('rocket',['banana','go'],3));
});

test('sand piles are solid: a kart that drives into one never passes through; the wind fan blows it over', async () => {
 const {hazardSolid,windFans,LANE_M,FAN_LEAD}=await import('../components/kithParty/course3d');
 const course='dune-canyon',L=courseLength(course);
 const pile=COURSES.find(c=>c.id===course)!.hazards.find(h=>h.kind==='sand-pocket')!;
 assert.ok(hazardSolid(pile),'sand piles are solid');assert.equal(windFans(course).length,2,'one fan per pile');
 // straight at the pile, skipping the fan (start between fan and pile)
 let s=raceAt(course,pile.t-9/L);let p=s.players[0];p.lane=pile.lane;p.mps=30;
 let maxAhead=-1e9;for(let i=0;i<240;i++){step(s,[{...go,x:0}],1/120);maxAhead=Math.max(maxAhead,(normT(p.progress,course)-pile.t)*L);const dl=Math.abs(p.lane-pile.lane)*LANE_M;if(dl<.5)assert.ok((normT(p.progress,course)-pile.t)*L< -1.5,'never inside the pile');}
 assert.ok(s.race!.events.some(e=>e.kind==='wall'&&e.data===pile.label),'bonked the pile');
 // over the fan at speed: launched high enough and lands beyond the pile
 s=raceAt(course,pile.t-(FAN_LEAD+5)/L);p=s.players[0];p.lane=pile.lane;p.mps=38;
 let launched=false,peak=0,bonk=false,seen=0;
 for(let i=0;i<120*3;i++){step(s,[go],1/120);launched||=!!p.launched;peak=Math.max(peak,p.hopY);for(const e of s.race!.events)if(e.id>seen){seen=e.id;if(e.kind==='wall'&&e.data===pile.label)bonk=true;}}
 assert.ok(launched&&peak>hazardSolid(pile)!.height,`fan launch clears the pile (peak ${peak.toFixed(2)} m)`);
 assert.ok(!bonk,'flew over without hitting it');assert.ok((normT(p.progress,course)-pile.t)*L>10,'landed past the pile');
});

test('big scenery is placed clear of the road on every course', async () => {
 const {ensureOffTrackXZ,worldPoint:wp}=await import('../components/kithParty/course3d');
 for(const c of COURSES){
  const samples=Array.from({length:600},(_,i)=>wp(i/600,0,0,c.id));
  for(let i=0;i<60;i++){const a=i*2.4,r=60+(i%7)*25,rad=10+(i%4)*8;const q=ensureOffTrackXZ(Math.cos(a)*r,Math.sin(a)*r,rad,c.id);if(!q.safe)continue;
   const d=Math.min(...samples.map(p=>Math.hypot(p.x-q.x,p.z-q.z)));
   assert.ok(d>rad+11,`${c.id}: object of radius ${rad} sits ${d.toFixed(1)} m from the road centre`);}
 }
});

test('twist kickers launch karts into a stunt: the right combo lands clean with a boost, a wrong one crashes', async () => {
 const {courseTwists}=await import('../components/kithParty/course3d');
 const course='dune-canyon',L=courseLength(course),tw=courseTwists(course)[0];assert.ok(tw,'dune canyon has a twist kicker');
 const fly=(press:(seq:number[],k:number)=>number|null)=>{
  const s=raceAt(course,tw.t-30/L);const p=s.players[0];p.lane=0;p.mps=36;
  let launched=false;for(let i=0;i<240&&!launched;i++){step(s,[go],1/120);launched=!!p.stunt;}
  assert.ok(launched&&p.launched,'the kicker launched the kart into a stunt');
  const seq=[...p.stunt!.seq];let k=0;
  for(let i=0;i<600&&p.launched;i++){const n=press(seq,k);const lanes=[false,false,false,false];if(n!==null&&i%10<4){lanes[n]=true;}if(n!==null&&i%10===4)k++;step(s,[{...go,lanes}],1/120);}
  return {s,p,seq};
 };
 let r=fly((seq,k)=>k<seq.length?seq[k]:null);
 assert.ok(r.p.boost>0&&r.p.spin===0,'combo hit → clean landing with a boost');
 assert.ok(r.s.race!.events.some(e=>e.kind==='trick'&&e.data==='stunt'));
 r=fly((seq,k)=>k===0?(seq[0]+1)%4:null);
 assert.ok(r.p.spin>0,'wrong arrow → crash on landing');
 r=fly(()=>null);
 assert.ok(r.p.spin>0,'no combo → crash on landing');
});

test('very high air deploys the glider; holding ↓ floats it down longer', async () => {
 const {windFans,FAN_LEAD}=await import('../components/kithParty/course3d');void windFans;
 const course='dune-canyon',L=courseLength(course);
 const pile=COURSES.find(c=>c.id===course)!.hazards.find(h=>h.kind==='sand-pocket')!;
 const air=(y:number)=>{const s=raceAt(course,pile.t-(FAN_LEAD+5)/L);const p=s.players[0];p.lane=pile.lane;p.mps=38;let t=0,glide=0,up=false;
  for(let i=0;i<120*5;i++){step(s,[{...go,y}],1/120);if(p.launched){up=true;t+=1/120;glide=Math.max(glide,p.glide??0);}else if(up)break;}return {t,glide};};
 const dive=air(-1),float=air(1);
 assert.ok(dive.glide>.5,'wings came out');
 assert.ok(float.t>dive.t+.3,`↓ floats longer (${float.t.toFixed(2)} s vs ${dive.t.toFixed(2)} s)`);
});

test('stunt combo via queued key taps: never lost, even when several arrive in one frame or no step runs', async () => {
 const {courseTwists}=await import('../components/kithParty/course3d');
 const course='dune-canyon',L=courseLength(course),tw=courseTwists(course)[0];
 const s=raceAt(course,tw.t-30/L);const p=s.players[0];p.lane=0;p.mps=36;
 const q:number[]=[];
 for(let i=0;i<240&&!p.stunt;i++)step(s,[{...go,taps:q}],1/120);
 assert.ok(p.stunt&&p.launched,'in the air with a combo');
 // the whole combo tapped within a single frame, while the gas (↑) is still held
 q.push(...p.stunt!.seq);
 step(s,[{...go,taps:q}],1/120);
 assert.equal(p.stunt!.state,'done','all taps counted, in order');assert.equal(q.length,0,'taps consumed once');
 for(let i=0;i<600&&p.launched;i++)step(s,[{...go,taps:q}],1/120);
 assert.ok(p.boost>0&&p.spin===0,'landed clean');
});
