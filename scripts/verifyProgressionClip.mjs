import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {progressionToClip,progressionChords} from './services/melos/composition/progressionToClip';
  globalThis.P={progressionToClip,progressionChords};`},bundle:true,write:false,format:'iife'});
const ctx={console,Math,crypto:{getRandomValues:(a)=>{for(let i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);return a;}}};ctx.globalThis=ctx;
runInNewContext(r.outputFiles[0].text,ctx);
const P=ctx.P;
// pop = [1,5,6,4] → 4 bars in C major (rootPc 0), triads
const clip=P.progressionToClip('pop',0,{seventh:false});
assert.ok(clip,'clip built for pop');
assert.equal(clip.lengthBeats,16,'4 chords × 4 beats = 16');
assert.ok(clip.notes.length>=12,'at least 3 notes per chord × 4');
// first chord = C major triad near baseMidi 48 → 48,52,55
const bar0=clip.notes.filter(n=>n.startBeats===0).map(n=>n.key).sort((a,b)=>a-b);
console.log('bar0 notes',JSON.stringify(bar0));
assert.equal(JSON.stringify(bar0),JSON.stringify([48,52,55]),'I chord in C = C E G (48,52,55)');
// seventh option adds a 4th note
const clip7=P.progressionToClip('ii-v-i',0,{seventh:true});
const first7=clip7.notes.filter(n=>n.startBeats===0);
assert.ok(first7.length===4,'7th chord has 4 notes');
// unknown id → null
assert.equal(P.progressionToClip('nope',0),null,'unknown progression → null');
// chords preview
const chords=P.progressionChords('pop',0);
assert.equal(chords.length,4,'4 chord symbols');
assert.ok(chords[0].symbol,'chord has a symbol');
console.log('chords',chords.map(c=>c.symbol).join(' '));
console.log('PASS — progressionToClip: bars, voicing (C=48/52/55), 7ths, unknown→null, chord preview');
