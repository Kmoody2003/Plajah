import test from 'node:test';
import assert from 'node:assert/strict';
import { FluxCinematicDirector } from '../components/plajahPixels/engine/core/fluxDirector';
import type { FluxDriven } from '../services/fabula/fluxNode';
const audio=(energy:number,snare=0,kick=0):FluxDriven=>({bass:energy,mid:energy,tre:energy,kick,kickOnset:kick,snare,energy,intensity:energy,voice:0,beat:kick,bpm:120,tempoConfidence:0});

test('rising energy cuts on snare attacks and a bass impact resolves the build',()=>{
  const director=new FluxCinematicDirector(),cuts:Array<{t:number;kind:string;event:string}>=[];
  let lastCut=0;
  for(let frame=0;frame<=360;frame++){
    const t=frame/60,e=.12+.76*Math.min(1,t/6);
    const snare=frame%20===0?1:0;
    const shot=director.update(audio(e,snare),t);
    if(shot.cutIndex!==lastCut){cuts.push({t,kind:shot.kind!,event:shot.event!});lastCut=shot.cutIndex!;}
  }
  const builds=cuts.filter(c=>c.event==='build');
  assert.ok(builds.length>=5);assert.ok(new Set(builds.map(c=>c.kind)).size>=4);
  assert.ok(builds.some((c,i)=>i>0&&c.t-builds[i-1].t<.4),'rapid snare cuts');
  const drop=director.update(audio(.95,0,1),361/60);
  assert.equal(drop.event,'drop');assert.ok(['flythrough','establishing'].includes(drop.kind!));
  let breakdown=false;
  for(let i=362;i<720;i++){
    const shot=director.update(audio(.03),i/60);
    if(shot.event==='breakdown'){breakdown=true;assert.equal(shot.kind,'landscape');assert.ok(shot.radiusMul>1.5);}
  }
  assert.ok(breakdown,'falling energy must get a wide reset');
});
test('phrase coverage includes rack focus, extreme close-up, wide and spatial moves',()=>{
  const director=new FluxCinematicDirector(),kinds=new Set<string>();let rackMin=1,rackMax=0;
  for(let i=0;i<4200;i++){
    const s=director.update(audio(.15),i/60);kinds.add(s.kind!);
    assert.ok(Object.values(s).filter(v=>typeof v==='number').every(Number.isFinite));
    if(s.kind==='rack'){rackMin=Math.min(rackMin,s.focusMul!);rackMax=Math.max(rackMax,s.focusMul!);}
    if(s.kind==='macro')assert.ok(s.radiusMul<.4);
  }
  assert.equal(kinds.size,9);assert.ok(rackMax-rackMin>.45);
  const sought=director.update(audio(.15),0);assert.equal(sought.kind,'establishing');assert.equal(sought.cutIndex,0);
});
