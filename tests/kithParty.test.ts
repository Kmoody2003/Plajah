import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,emptyInput,step,standings} from '../components/kithParty/engine';
import {CHARACTERS,GAMES} from '../components/kithParty/catalog';
import {COURSES,trackFrame} from '../components/kithParty/course3d';
test('ten unique playable Kith, four games, and five 3D courses',()=>{assert.equal(new Set(CHARACTERS.map(c=>c.id)).size,10);assert.equal(GAMES.length,4);assert.equal(COURSES.length,5);});
test('countdown prevents movement; an idle player does not win a race',()=>{const s=createState('circuit',['rello']);s.autoAccelerate=false;const p=s.players[0].progress;step(s,[emptyInput()],.05);assert.equal(s.players[0].progress,p);for(let i=0;i<15000;i++)step(s,[emptyInput()],1/120);assert.equal(s.phase,'finished');assert.equal(s.players[0].finish,null);assert.notEqual(standings(s)[0].character,'rello');});
test('accelerating completes three laps and ends a solo race',()=>{const s=createState('circuit',['rello']);const input={...emptyInput(),y:-1};for(let i=0;i<13000&&s.phase!=='finished';i++)step(s,[input],1/120);assert.equal(s.phase,'finished');assert.ok(s.players[0].finish);assert.ok(s.players[0].progress>=3);});
test('drift release gives boost; off-track lane slows movement',()=>{const s=createState('circuit',['rello']);s.time=0;const p=s.players[0];p.speed=.06;p.lane=0;for(let i=0;i<70;i++)step(s,[{...emptyInput(),x:.3,y:-1,action:true}],1/120);step(s,[{...emptyInput(),y:-1}],1/120);assert.ok(p.boost>1);p.lane=90;p.boost=0;for(let i=0;i<300;i++)step(s,[{...emptyInput(),y:-1}],1/120);assert.ok(p.speed<.033);});
test('mario kart hop-drift, 4-wheel suspension, and amazon 360 loop boost',()=>{
 const s=createState('circuit',['rello'],421,'amazon-canopy');s.time=0;const p=s.players[0];p.speed=.065;
 step(s,[{...emptyInput(),x:.5,action:true}],1/120);
 assert.ok(p.hopVy>0);assert.equal(p.driftDir,1);
 for(let i=0;i<25;i++)step(s,[{...emptyInput(),x:.5,action:true}],1/120);
 assert.notEqual(p.suspensionFL,p.suspensionFR);
 // Verify Amazon Canopy Loop inverts track normal at loop apex (centerT = 0.215)
 const apexFrame=trackFrame(0.215,0,'amazon-canopy');
 assert.equal(apexFrame.inLoop,true);
 assert.ok(apexFrame.normal.y<-0.5);
 // Verify Loop Power Boost pad at t=0.178 grants high-power loop boost
 p.progress=0.177;p.cooldown=0;p.lane=0;
 step(s,[emptyInput()],1/120);
 assert.ok(p.boost>=1.8);
});
test('kith tennis rally returns ball and awards smash & point scores',()=>{
 const s=createState('tennis',['rello','chora']);s.time=0;
 const p1=s.players[0];
 s.tennis.x=p1.x;s.tennis.y=p1.y-10;s.tennis.z=20;s.tennis.vy=220;s.tennis.serveTimer=0;
 step(s,[{...emptyInput(),x:.4,action:true},emptyInput()],1/120);
 assert.ok(p1.score>=35);assert.ok(s.tennis.vy<0);assert.equal(s.tennis.shotType,'smash');
});
test('two player race waits for both players, finishes freeze simulation',()=>{const s=createState('circuit',['rello','chora']);s.time=0;s.players[0].progress=2.9999;s.players[0].speed=.08;step(s,[{...emptyInput(),y:-1},emptyInput()],.05);assert.ok(s.players[0].finish);assert.equal(s.phase,'playing');s.time=120;step(s,[],.01);const t=s.time;step(s,[],.05);assert.equal(s.time,t);});
test('crystals collect once and respawn; dashing respects cooldown',()=>{const s=createState('crystals',['rello']);s.time=0;const p=s.players[0];s.crystals=[{x:p.x,y:p.y,active:true,respawn:0}];step(s,[{...emptyInput(),action:true}],.01);assert.equal(p.score,1);assert.ok(p.cooldown>1);assert.equal(s.crystals[0].active,false);step(s,[emptyInput()],.01);const cooldown=p.cooldown;step(s,[{...emptyInput(),action:true}],.01);assert.ok(p.cooldown<cooldown);for(let i=0;i<300;i++)step(s,[],1/120);assert.equal(s.crystals[0].active,true);});
test('rhythm awards edge-triggered hits independently for each player',()=>{const s=createState('rhythm',['rello','chora']);s.time=1.999;s.notes=[{time:2,lane:0,judged:[false,false]}];const hit={...emptyInput(),lanes:[true,false,false,false]};step(s,[hit,emptyInput()],.001);assert.equal(s.players[0].score,102);assert.equal(s.players[1].score,0);step(s,[hit,hit],.01);assert.equal(s.players[0].score,102);assert.equal(s.players[1].score,102);});
test('missed notes break combo and completed rhythm is ranked only among humans',()=>{const s=createState('rhythm',['chora']);s.time=2;s.players[0].combo=5;s.notes=[{time:1,lane:1,judged:[false,false]}];step(s,[],.01);assert.equal(s.players[0].combo,0);assert.equal(standings(s).length,1);s.time=45;step(s,[],.01);assert.equal(s.phase,'finished');});
test('seeded arena simulations reproduce the same result',()=>{const a=createState('crystals',['rello'],13),b=createState('crystals',['rello'],13);for(let i=0;i<1000;i++){step(a,[],1/120);step(b,[],1/120);}assert.deepEqual(a,b);});
test('auto-acceleration gives the human the same launch curve as bots',()=>{const s=createState('circuit',['rello']);s.time=0;for(let i=0;i<90;i++)step(s,[],1/120);assert.ok(s.players[0].speed>0);for(const bot of s.players.slice(1))assert.ok(Math.abs(bot.speed-s.players[0].speed)<1e-9);});
test('braking overrides auto-acceleration and manual mode requires throttle',()=>{const s=createState('circuit',['rello']);s.time=0;for(let i=0;i<120;i++)step(s,[],1/120);const speed=s.players[0].speed;for(let i=0;i<120;i++)step(s,[{...emptyInput(),y:1}],1/120);assert.ok(s.players[0].speed<speed*.02);s.autoAccelerate=false;s.players[0].speed=0;step(s,[],.05);assert.equal(s.players[0].speed,0);step(s,[{...emptyInput(),y:-1}],.05);assert.ok(s.players[0].speed>0);});
test('right input steers inward for the clockwise chase-camera course',()=>{const s=createState('circuit',['rello']);s.time=0;const lane=s.players[0].lane;step(s,[{...emptyInput(),x:1}],.05);assert.ok(s.players[0].lane<lane);});

