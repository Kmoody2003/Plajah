import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {nextShuttleRate} from './services/fabula/shuttle';
  globalThis.next=nextShuttleRate;`},bundle:true,write:false,format:'iife'});
const ctx={};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const next=ctx.next;
// Simulate a state machine: rate + playing, applying L/J/K.
let rate=1, playing=false;
const L=()=>{rate=next(rate,playing,1);playing=true;};
const J=()=>{rate=next(rate,playing,-1);playing=true;};
const K=()=>{rate=1;playing=false;};
const seq=[];
L();seq.push(rate); // 1  (first L → 1x forward, with audio)
L();seq.push(rate); // 2
L();seq.push(rate); // 4
L();seq.push(rate); // 8
L();seq.push(rate); // 8 (capped)
J();seq.push(rate); // -1 (reverse restarts at 1x)
J();seq.push(rate); // -2
K();                // stop, rate→1
L();seq.push(rate); // 1 (fresh 1x after stop)
console.log('SEQ',JSON.stringify(seq));
assert.deepEqual(JSON.parse(JSON.stringify(seq)),[1,2,4,8,8,-1,-2,1],'JKL ladder: 1→2→4→8 cap, J reverses to 1x then steps, K resets to 1x');
console.log('PASS — JKL shuttle ladder (1x with audio first, accelerate on repeat, K resets)');
