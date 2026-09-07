import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placeMenu} from '../components/ui/menuPosition';

test('menus stay inside offset visual viewports across edges and oversized content', () => {
  for (const v of [{left:0,top:0,width:280,height:220},{left:50,top:120,width:360,height:400}]) {
    for (const width of [120,320,900]) for (const height of [80,500,1200]) {
      for (const x of [-50,100,500]) for (const y of [-80,100,700]) {
        for (const side of ['below','beside','point'] as const) {
          const p = placeMenu({left:x,right:x+40,top:y,bottom:y+30},width,height,v,side);
          assert.ok(p.x>=v.left+8 && p.y>=v.top+8);
          assert.ok(p.x+Math.min(width,v.width-16)<=v.left+v.width-8);
          assert.ok(p.y+Math.min(height,v.height-16)<=v.top+v.height-8);
        }
      }
    }
  }
});

test('a submenu aligns to its row and flips left at the right edge', () => {
  const p=placeMenu({left:650,right:820,top:350,bottom:380},210,150,{left:0,top:0,width:900,height:650},'beside');
  assert.deepEqual(p,{x:442,y:350});
});
