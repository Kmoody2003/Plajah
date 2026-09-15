import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FootballPhysics } from '../components/sports/firstlight/game/FootballPhysics';

test('passes reach the same catch point at 30, 60 and 144 fps',()=> {
  for(const fps of [30,60,144]) for(const bullet of [true,false]) {
    const ball = new THREE.Mesh(); const physics = new FootballPhysics(ball);
    const target = new THREE.Vector3(12,2,30);
    physics.launchPass(new THREE.Vector3(0,2,-20),target,bullet);
    let arrived=false;
    for(let i=0;i<fps*10;i++) {
      const result=physics.update(1/fps);
      assert.equal(result.hitGround,false);
      if(result.arrived){arrived=true;break;}
    }
    assert.ok(arrived); assert.ok(ball.position.distanceTo(target)<1e-8);
  }
});
