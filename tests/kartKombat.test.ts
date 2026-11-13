import test from 'node:test';
import assert from 'node:assert/strict';
import {createKombatState,stepKombat,kombatStandings,emptyKombatInput,useSpecial,damage,STORM_PHASES,MAX_HP,START_LIVES,groundAt,PLATFORM_HEIGHT,type KombatState} from '../components/kithParty/kombat';
import {SPECIALS,type SpecialId} from '../components/kithParty/abilities';

const run=(s:KombatState,seconds:number,inputs=[emptyKombatInput()])=>{for(let i=0;i<seconds*120&&s.phase!=='finished';i++)stepKombat(s,inputs,1/120);};

test('eight karts with HP, lives and the arena platform',()=>{
 const s=createKombatState(['rello']);
 assert.equal(s.karts.length,8);
 assert.ok(s.karts.every(k=>k.hp===MAX_HP&&k.lives===START_LIVES));
 assert.equal(groundAt(s.arena,0,0),PLATFORM_HEIGHT);
 assert.equal(s.karts[0].human,true);assert.equal(s.karts[1].human,false);
});

test('storm shrinks in phases and damages karts outside it',()=>{
 const s=createKombatState(['rello'],5);
 s.time=0;
 const startR=s.storm.r;
 const [wait,shrink,target]=STORM_PHASES[0];
 // keep everybody inside and safe while we watch the storm
 for(let i=0;i<(wait+shrink+1)*120;i++){for(const k of s.karts){k.hp=MAX_HP;k.x=s.storm.cx;k.z=s.storm.cz;k.invuln=1;}stepKombat(s,[],1/120);}
 assert.ok(s.storm.r<startR);
 assert.ok(Math.abs(s.storm.r-target)<.01,`radius ${s.storm.r}`);
 assert.equal(s.storm.phase,1);
 const k=s.karts[0];
 k.x=s.storm.cx+s.storm.r+20;k.z=s.storm.cz;k.hp=MAX_HP;k.vx=0;k.vz=0;
 stepKombat(s,[emptyKombatInput()],.05);
 assert.ok(k.hp<MAX_HP);
});

test('crate pickup starts a roulette that resolves into an item',()=>{
 const s=createKombatState(['rello'],9);s.time=0;
 const k=s.karts[0];const c=s.crates.find(c=>!c.gold)!;
 k.x=c.x;k.z=c.z;k.y=c.y;
 stepKombat(s,[emptyKombatInput()],1/120);
 assert.equal(c.active,false);
 assert.ok(k.roulette>0);assert.equal(k.item,null);
 run(s,1.4);
 assert.ok(k.item!==null||k.lives<START_LIVES);
});

test('a seed bolt hit reduces HP',()=>{
 const s=createKombatState(['rello','chora'],3);s.time=0;
 for(const k of s.karts.slice(2)){k.x=120;k.z=0;k.eliminated=true;}
 const a=s.karts[0],b=s.karts[1];
 a.x=0;a.z=-100;a.heading=0;a.y=0;b.x=0;b.z=-80;b.y=0;b.heading=0;
 a.item='seed-bolt';a.itemUses=1;
 stepKombat(s,[{...emptyKombatInput(),item:true},emptyKombatInput()],1/120);
 assert.equal(s.projectiles.length,1);
 for(let i=0;i<60;i++)stepKombat(s,[emptyKombatInput(),emptyKombatInput()],1/120);
 assert.ok(b.hp<MAX_HP,`hp ${b.hp}`);
 assert.ok(b.spin>0);
});

test('a KO costs a life, credits the attacker, and the kart drops back in',()=>{
 const s=createKombatState(['rello','chora'],4);s.time=0;
 const a=s.karts[0],b=s.karts[1];
 damage(s,b,500,a.index);
 assert.equal(b.lives,START_LIVES-1);
 assert.equal(a.kos,1);
 assert.ok(b.respawn>0);
 assert.ok(s.events.some(e=>e.type==='ko'&&e.kart===b.index));
 run(s,2.6,[emptyKombatInput(),emptyKombatInput()]);
 assert.equal(b.respawn,0);assert.equal(b.hp,MAX_HP);assert.ok(b.invuln>0||b.y>0);
});

test('last kart standing ends the match',()=>{
 const s=createKombatState(['rello'],6);s.time=0;
 for(const k of s.karts.slice(1)){k.lives=1;damage(s,k,999,0);}
 stepKombat(s,[emptyKombatInput()],1/120);
 assert.equal(s.phase,'finished');
 assert.equal(s.winner,0);
 assert.equal(kombatStandings(s)[0].index,0);
 assert.equal(s.karts[0].kos,7);
});

test('every Kith special does something measurable',()=>{
 for(const id of Object.keys(SPECIALS) as SpecialId[]){
  const s=createKombatState(['rello','chora'],11);s.time=0;
  for(const k of s.karts.slice(3)) k.eliminated=true;
  const a=s.karts[0],b=s.karts[1],c=s.karts[2];
  a.specialId=id;a.special=1;a.x=0;a.z=-90;a.heading=0;a.vx=0;a.vz=20;
  b.x=0;b.z=-75;b.heading=0;c.x=3;c.z=-100;c.heading=0;
  const before={hp:b.hp+c.hp,ax:a.x,az:a.z,traps:s.traps.length,proj:s.projectiles.length};
  useSpecial(s,a);
  for(let i=0;i<30;i++)stepKombat(s,[emptyKombatInput(),emptyKombatInput()],1/120);
  const effects=[
   b.hp+c.hp<before.hp,
   s.traps.length>before.traps,
   s.projectiles.length>before.proj,
   a.shield>0,a.boost>0,a.specialActive>0,
   b.blind>0||c.blind>0,b.frozen>0||b.stun>0||c.stun>0,
   Math.hypot(a.x-before.ax,a.z-before.az)>15,
  ];
  assert.ok(effects.some(Boolean),`special ${id} had no effect`);
  assert.equal(a.special<1,true,`special ${id} did not spend the meter`);
 }
});

test('same seed gives the same match',()=>{
 const a=createKombatState(['rello'],1234),b=createKombatState(['rello'],1234);
 const inp=[{...emptyKombatInput(),y:-1,x:.3}];
 run(a,20,inp);run(b,20,inp);
 assert.deepEqual(a.karts.map(k=>[k.x.toFixed(4),k.z.toFixed(4),k.hp.toFixed(3),k.kos]),b.karts.map(k=>[k.x.toFixed(4),k.z.toFixed(4),k.hp.toFixed(3),k.kos]));
});

test('bots fight: a long match produces hits and finishes with a winner',()=>{
 const s=createKombatState(['rello'],42);
 let hits=0;
 for(let i=0;i<220*120&&s.phase!=='finished';i++){stepKombat(s,[{...emptyKombatInput(),y:-1}],1/120);hits+=s.events.filter(e=>e.type==='hit'&&e.t===s.time).length;}
 assert.equal(s.phase,'finished');
 assert.ok(hits>5,`only ${hits} hits`);
 assert.ok(s.winner!==null);
});
