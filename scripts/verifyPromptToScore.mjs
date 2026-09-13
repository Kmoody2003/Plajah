import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
// stub geminiService (network) so we can test the pure parse/snap
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/geminiService$/},()=>({path:'g',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`export const callGemini=async()=>'';`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {parseScoreJson,toNoteEvents,nameToMidi,buildComposePrompt} from './services/melos/composition/promptToScore';
  globalThis.P={parseScoreJson,toNoteEvents,nameToMidi,buildComposePrompt};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const ctx={console,Math,Number,JSON,String,crypto:{getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(Math.random()*256)|0;return a;}}};ctx.globalThis=ctx;
runInNewContext(r.outputFiles[0].text,ctx);
const P=ctx.P;
// nameToMidi
assert.equal(P.nameToMidi('C4'),60,'C4=60');
assert.equal(P.nameToMidi('A4'),69,'A4=69');
assert.equal(P.nameToMidi('F#3'),54,'F#3=54');
// parse with prose + code fence
const resp='Here you go!\n```json\n{"key":"C","mode":"major","notes":[{"midi":61,"start":0,"len":1,"vel":100},{"note":"E4","start":1,"len":2}]}\n```\nEnjoy';
const parsed=P.parseScoreJson(resp);
assert.equal(parsed.key,'C'); assert.equal(parsed.notes.length,2,'2 notes parsed through fence+prose');
// toNoteEvents snaps C#(61) into C major → 60 or 62 (nearest in-key); E4(64) stays
const evs=P.toNoteEvents(parsed.notes,0,'major',true);
console.log('events',JSON.stringify(evs.map(e=>({k:e.key,s:e.startBeats,l:e.lengthBeats,v:e.vel}))));
assert.equal(evs.length,2);
assert.ok(evs[0].key===60||evs[0].key===62,'C# snapped into C-major scale');
assert.equal(evs.find(e=>e.startBeats===1).key,64,'E4 in-key stays 64');
assert.equal(evs.find(e=>e.startBeats===1).vel,90,'default vel 90 when omitted');
// garbage → empty
assert.equal(P.parseScoreJson('no json here').notes.length,0,'garbage → no notes');
// prompt contains key + progression
assert.ok(P.buildComposePrompt('warm pad',{key:'A',mode:'minor',bars:8,progression:'i VI III VII'}).includes('i VI III VII'),'prompt carries progression');
console.log('PASS — promptToScore: name→midi, tolerant JSON parse, in-key snap, defaults, prompt build');
