import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameRequests} from '../services/mediaEngine/frameRequests';
import {PlatformAudioRuntime} from '../services/mediaEngine/audioRuntime';

test('decode demand is bounded and a seek discards and closes the previous frame', () => {
  const sent: number[][]=[], shown:number[]=[]; let closed=0;
  const queue=new FrameRequests((id,t)=>sent.push([id,t]),(_,t)=>shown.push(t));
  queue.request(1); for(let i=2;i<=100;i++)queue.request(i);
  assert.deepEqual(sent,[[1,1]]);
  queue.request(0,true); queue.receive(1,{close(){closed++;}});
  assert.deepEqual(shown,[]); assert.deepEqual(sent,[[1,1],[2,0]]);
  queue.receive(2,{close(){closed++;}});
  assert.deepEqual(shown,[0]); assert.equal(closed,2);
  queue.request(4); queue.dispose(); queue.receive(3,{close(){closed++;}});
  assert.deepEqual(shown,[0]); assert.equal(closed,3);
});

test('presentation failure still releases the transferred frame', () => {
  let closed=false;
  const queue=new FrameRequests(()=>{},()=>{throw new Error('surface lost');});
  queue.request(0);
  assert.throws(()=>queue.receive(1,{close(){closed=true;}}),/surface lost/);
  assert.equal(closed,true);
});

test('product teardown leaves other product buses and the audio device alive', () => {
  let created=0; const nodes:any[]=[];
  const context={state:'running',sampleRate:48000,destination:{},createGain(){const n={disconnected:false,connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;}};
  const runtime=new PlatformAudioRuntime(()=>{created++;return context as any;});
  const fabula=runtime.output('fabula'), melos=runtime.output('melos');
  assert.equal(runtime.getContext(),context);assert.equal(created,1);
  assert.notEqual(fabula,melos);assert.equal(runtime.output('fabula'),fabula);
  runtime.releaseOutput('melos');
  assert.equal(nodes[0].disconnected,false);assert.equal(nodes[1].disconnected,true);
  assert.deepEqual(runtime.diagnostics().products,['fabula']);
  assert.equal(runtime.getContext().state,'running');
});
