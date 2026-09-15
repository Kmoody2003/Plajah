import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementVelocity,movementHeading} from '../components/sports/firstlight/game/Movement';
test('diagonal input cannot exceed running speed',()=>{
  let v={vx:0,vz:0};for(let i=0;i<120;i++)v=movementVelocity(v.vx,v.vz,1,1,10,1/120);
  assert.ok(Math.hypot(v.vx,v.vz)<=10);assert.ok(Math.hypot(v.vx,v.vz)>9.9);
});
test('movement response matches across frame rates and brakes on release',()=>{
  for(const fps of [30,60,120,144]){
    let v={vx:0,vz:0};for(let i=0;i<fps;i++)v=movementVelocity(v.vx,v.vz,1,0,10,1/fps);
    assert.ok(Math.abs(v.vx-10*(1-Math.exp(-14)))<1e-8);
    for(let i=0;i<Math.ceil(fps*.25);i++)v=movementVelocity(v.vx,v.vz,0,0,10,1/fps);
    assert.ok(Math.hypot(v.vx,v.vz)<.03);
  }
});
test('heading takes the short path across the angle wrap and holds at rest',()=>{
  const h=movementHeading(Math.PI-.05,-.05,-1,1/120);
  assert.ok(h>Math.PI-.05 && h<Math.PI+.05);
  assert.equal(movementHeading(1,0,0,1/60),1);
});
