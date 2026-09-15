import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderedTargets,RouteOverlay} from '../components/sports/firstlight/game/RouteOverlay';
import type {Player3D} from '../components/sports/firstlight/types';
test('target keys, routes, and keyboard indexes agree even when RB is first in the roster',()=>{
  const players=[4,1,2,3].map(key=>({id:`p${key}`,x:key,z:0,route:{targetKey:String(key),waypoints:[{x:key,z:10}]}} as Player3D));
  assert.deepEqual(orderedTargets(players).map(p=>p.route!.targetKey),['1','2','3','4']);
  const overlay=new RouteOverlay();overlay.build(players);assert.equal(overlay.group.children.length,8);
  overlay.update('p2',true);assert.ok(overlay.group.visible);
  overlay.update(undefined,false);assert.equal(overlay.group.visible,false);
  overlay.build(players);assert.equal(overlay.group.children.length,8,'changing plays replaces old routes');
});
