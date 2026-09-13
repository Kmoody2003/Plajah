import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDrive, snap, throwPass, stepDrive, nextPlay } from '../services/firstlightGame';
test('input cannot throw before snap or twice in flight',()=>{
  const s=newDrive();throwPass(s,0);assert.equal(s.phase,'ready');snap(s);throwPass(s,0);const f=s.flight;throwPass(s,2);assert.equal(s.flight,f);
});
test('timeouts lose yards and four failed downs end the drive',()=>{
  let s=newDrive();for(let d=1;d<=4;d++){snap(s);for(let i=0;i<145;i++)stepDrive(s,.05,0);assert.equal(s.phase,'result');s=nextPlay(s);}assert.equal(s.phase,'over');assert.equal(s.score,0);
});
test('first downs reset attempts and touchdown ends drive',()=>{
  let s=newDrive();s.phase='result';s.down=3;s.resultSpot=34;s=nextPlay(s);assert.equal(s.down,1);assert.equal(s.target,44);
  s.phase='result';s.resultSpot=100;s=nextPlay(s);assert.equal(s.phase,'over');assert.equal(s.score,6);
});
test('throw resolves and simulation clamps long frame gaps',()=>{
  const s=newDrive();snap(s);stepDrive(s,30,1);assert.equal(s.time,.05);throwPass(s,0);for(let i=0;i<20;i++)stepDrive(s,.05,0);assert.equal(s.phase,'result');assert.ok(Number.isFinite(s.resultSpot));
});
