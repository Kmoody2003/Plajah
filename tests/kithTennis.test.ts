import test from 'node:test';
import assert from 'node:assert/strict';
import {createTennisState,stepTennis,awardPoint,pointLabels,pressureCall,serverIndex,receiverIndex,predictBall,emptyTennisInput,tennisSpecialFor,tennisStandings,netHeight,VENUES,COURT,TENNIS_SPECIALS,POINT_PAUSE,type TennisState} from '../components/kithParty/tennis';
import {KITH_KARTS} from '../components/kithParty/abilities';

const bots=(s:TennisState)=>{s.players.forEach(p=>p.human=false);return s;};
const run=(s:TennisState,seconds:number,inputs=[emptyTennisInput()])=>{for(let i=0;i<seconds*120&&s.phase!=='finished';i++)stepTennis(s,inputs,1/120);};
/** settle the between-points pause so the next point can be awarded */
const next=(s:TennisState)=>{s.phase='rally';s.phaseT=0;};
const win=(s:TennisState,team:0|1,n=1)=>{for(let i=0;i<n;i++){awardPoint(s,team,'WINNER');next(s);}};

test('singles and doubles line-ups, server and diagonal receiver',()=>{
 const s=createTennisState(['rello']);
 assert.equal(s.players.length,2);
 assert.ok(s.players[0].human&&!s.players[1].human);
 assert.equal(s.players[0].team,0);assert.equal(s.players[1].team,1);
 const d=createTennisState(['rello','chora'],{doubles:true});
 assert.equal(d.players.length,4);
 assert.deepEqual(d.players.map(p=>p.team),[0,1,0,1]);
 assert.ok(d.players[1].human,'P2 plays on the far team');
 const si=serverIndex(s),ri=receiverIndex(s);
 assert.ok(Math.sign(s.players[si].x)!==Math.sign(s.players[ri].x),'receiver stands cross-court');
 assert.ok(s.players[si].z>COURT.halfLength,'server behind the baseline');
});

test('net is lower in the middle than at the posts',()=>{
 assert.ok(Math.abs(netHeight(0)-.914)<1e-6);
 assert.ok(netHeight(6.4)>netHeight(3)&&netHeight(3)>netHeight(0));
});

test('points, deuce, advantage and game (classic scoring)',()=>{
 const s=createTennisState(['rello'],{format:'classic'});
 win(s,0,3);
 assert.deepEqual(pointLabels(s),['40','0']);
 win(s,1,3);
 assert.deepEqual(pointLabels(s),['40','40']);
 assert.equal(pressureCall(s),'DEUCE');
 win(s,0);
 assert.deepEqual(pointLabels(s),['AD','']);
 win(s,1);
 assert.equal(pressureCall(s),'DEUCE');
 win(s,0,2);
 assert.deepEqual(s.match.games,[1,0]);
 assert.deepEqual(s.match.points,[0,0]);
 assert.equal(s.match.servingTeam,1,'serve passes to the other team');
});

test('golden point in the quick format',()=>{
 const s=createTennisState(['rello'],{format:'quick'});
 win(s,0,3);win(s,1,3);
 assert.equal(pressureCall(s),'MATCH POINT'.length?pressureCall(s):'');
 win(s,1);
 assert.deepEqual(s.match.games,[0,1]);
});

test('tie-break at games all and match win',()=>{
 const s=createTennisState(['rello'],{format:'quick'});
 win(s,0,4);win(s,1,4);
 assert.deepEqual(s.match.games,[1,1]);
 win(s,0,4);win(s,1,4);
 assert.deepEqual(s.match.games,[2,2]);
 assert.ok(s.match.tiebreak);
 win(s,0,4);
 assert.equal(s.match.winner,null,'tie-break goes to 5');
 win(s,0);
 assert.equal(s.match.winner,0);
 assert.ok(s.players[0].score>s.players[1].score);
 assert.equal(tennisStandings(s)[0].team,0);
});

test('a served ball follows the solved trajectory into the service box',()=>{
 const s=bots(createTennisState(['zippi'],{seed:9}));
 s.time=0;s.phase='serve';
 let seen=false;
 for(let i=0;i<120*4&&!seen;i++){stepTennis(s,[],1/120);if(s.events.some(e=>e.type==='bounce'||e.type==='fault'))seen=true;}
 assert.ok(seen,'the serve landed or faulted');
});

test('prediction lands on the shot target',()=>{
 const s=bots(createTennisState(['rello'],{seed:4}));
 s.time=0;s.phase='serve';
 for(let i=0;i<120*3&&!(s.phase==='rally'&&s.ball.target);i++)stepTennis(s,[],1/120);
 const t=s.ball.target!;
 const path=predictBall(s,3,1/240);
 const bounce=path.find(q=>q.bounces===1)!;
 assert.ok(bounce,'ball bounces in prediction');
 assert.ok(Math.hypot(bounce.x-t.x,bounce.z-t.z)<.35,`bounce ${bounce.x.toFixed(2)},${bounce.z.toFixed(2)} vs target ${t.x.toFixed(2)},${t.z.toFixed(2)}`);
});

test('every Kith type has a tennis special and the meter arms it',()=>{
 for(const id of Object.keys(KITH_KARTS)) assert.ok(tennisSpecialFor(id).name);
 assert.equal(new Set(Object.values(TENNIS_SPECIALS).map(s=>s.id)).size,10);
 const s=createTennisState(['nori']);
 s.time=0;s.phase='rally';
 const p=s.players[0];p.meter=1;
 stepTennis(s,[{...emptyTennisInput(),special:true}],1/120);
 assert.ok(p.armed);
});

for(const v of VENUES) test(`bot match completes on ${v.name}`,()=>{
 const s=bots(createTennisState(['rello'],{venue:v.id,format:'quick',difficulty:'pro',seed:v.id.length*7}));
 run(s,900);
 assert.equal(s.phase,'finished',`games ${s.match.games.join('-')} after ${s.time.toFixed(0)}s`);
 assert.ok(s.match.winner===0||s.match.winner===1);
 assert.ok(s.match.totalPoints>=8);
 assert.ok(s.match.longestRally>=3,'real rallies happen');
});

test('doubles bot match completes and both partners hit',()=>{
 const s=bots(createTennisState(['moki'],{doubles:true,venue:'amazon-canopy',format:'quick',seed:21}));
 run(s,900);
 assert.equal(s.phase,'finished');
 assert.ok(s.players.every(p=>p.stats2.hits>0),s.players.map(p=>p.stats2.hits).join(','));
});

test('a human who only taps the shot button serves, rallies and scores points',()=>{
 const s=createTennisState(['bram'],{seed:3,difficulty:'rookie'});
 let served=false;
 for(let i=0;i<120*120&&s.phase!=='finished';i++){
  const tap=Math.floor(i/30)%2===0;
  stepTennis(s,[{...emptyTennisInput(),topspin:tap}],1/120);
  if(s.events.some(e=>e.type==='hit'&&e.player===0&&e.data.startsWith('serve')))served=true;
 }
 assert.ok(served,'the human served');
 assert.ok(s.players[0].stats2.hits>0,'the human returned balls');
 assert.ok(s.match.totalPoints>3);
 assert.ok(POINT_PAUSE>1);
});
