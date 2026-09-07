import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {breakdownToTracks} from './services/melos/composition/breakdownToTracks';
  globalThis.B=breakdownToTracks;`},bundle:true,write:false,format:'iife'});
const ctx={console,Math,Number,crypto:{getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(Math.random()*256)|0;return a;}}};ctx.globalThis=ctx;
runInNewContext(r.outputFiles[0].text,ctx);
const bd={theory:{tempo:128,key:'C',notes:[
  {role:'MELODY',midi:72,beat:0},{role:'MELODY',midi:74,beat:1},{role:'MELODY',midi:76,beat:2},
  {role:'BASS',midi:36,beat:0},{role:'BASS',midi:36,beat:4},
  {role:'HARMONY',midi:60,beat:0},{role:'HARMONY',midi:64,beat:0},{role:'HARMONY',midi:67,beat:0}, // chord stacked at beat0
  {role:'HARMONY',midi:65,beat:2},
]}};
const res=ctx.B(bd);
console.log(JSON.stringify({tempo:res.tempo,tracks:res.tracks.map(t=>({r:t.role,inst:t.instrumentType,n:t.notes.length}))}));
assert.equal(res.tempo,128,'tempo carried');
assert.equal(res.tracks.length,3,'melody/bass/harmony (no accent)');
const bass=res.tracks.find(t=>t.role==='BASS'); assert.equal(bass.instrumentType,'bajo','bass → BAJO');
const mel=res.tracks.find(t=>t.role==='MELODY'); assert.equal(mel.instrumentType,'onda','melody → ONDA');
// harmony chord stacked at beat0 → all 3 sustain to the next change (beat 2) → length 2
const harm=res.tracks.find(t=>t.role==='HARMONY');
const stack=harm.notes.filter(n=>n.startBeats===0);
console.log('harmony stack lens',stack.map(n=>n.lengthBeats));
assert.ok(stack.length===3 && stack.every(n=>n.lengthBeats===2),'stacked chord notes sustain to next change (2 beats)');
// bass beat4 → last note default length 2
const b2=bass.notes.find(n=>n.startBeats===4); assert.equal(b2.lengthBeats,2,'last note default 2');
console.log('PASS — breakdownToTracks: per-role split, instrument map, chord sustain, defaults');
