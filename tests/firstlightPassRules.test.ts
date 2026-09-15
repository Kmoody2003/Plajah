import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveCatch} from '../components/sports/firstlight/game/PassRules';
test('a catch requires an inbounds receiver within reach of the ball',()=>{
  assert.equal(resolveCatch({x:0,y:1.7,z:20},{x:0,z:20},[],53.333),'COMPLETE');
  assert.equal(resolveCatch({x:0,y:1.7,z:20},{x:0,z:25},[],53.333),'INCOMPLETE');
  assert.equal(resolveCatch({x:26.6,y:1.7,z:20},{x:26.6,z:20},[],53.333),'INCOMPLETE');
  assert.equal(resolveCatch({x:0,y:0,z:20},{x:0,z:20},[],53.333),'INCOMPLETE');
});
test('only a defender near the catch point can intercept',()=>{
  assert.equal(resolveCatch({x:0,y:1.7,z:20},{x:0,z:22},[{x:0,z:20}],53.333),'INTERCEPTION');
  assert.equal(resolveCatch({x:0,y:1.7,z:20},{x:0,z:20},[{x:8,z:20}],53.333),'COMPLETE');
});
