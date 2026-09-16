import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
// meterAnalyser is only used as a TYPE import; stub the module so esbuild resolves it.
const memPlugin={name:'mem',setup(b){b.onResolve({filter:/meterAnalyser$/},()=>({path:'m',namespace:'mem'}));b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:'export {};',loader:'js'}));}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {frameToMeasured} from './services/melos/council/meterToMeasured';
  globalThis.F=frameToMeasured;`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const ctx={console,Math,Number,Float32Array,Array,Infinity};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
// spectrum: 12 bins, loud in the last 2 (bright/harsh), quiet elsewhere (dB)
const spec=new Float32Array([-40,-40,-38,-38,-36,-36,-34,-34,-30,-30,-6,-6]);
const m=ctx.F({lufsI:-8,tpL:-0.5,tpR:0.3,corr:0.4,spectrum:spec,lra:6,rms:-12,silent:false,lufsM:-8,lufsS:-8});
console.log(JSON.stringify(m));
assert.equal(m.lufsIntegrated,-8,'lufs carried');
assert.ok(Math.abs(m.truePeakDb-0.3)<1e-9,'true peak = max(L,R)=0.3');
assert.ok(Math.abs(m.plr-8.3)<1e-9,'plr = tp - lufs');
assert.equal(m.corr,0.4,'corr');
assert.equal(m.tone.high,1,'brightest band normalized to 1 (high)');
assert.ok(m.tone.sub<0.2,'sub much lower');
// silence-ish integrated (< -70) dropped
const q=ctx.F({lufsI:-120,tpL:-80,tpR:-80,corr:1,spectrum:new Float32Array(0),lra:0,rms:-120,silent:true,lufsM:-120,lufsS:-120});
assert.equal(q.lufsIntegrated,undefined,'silent integrated dropped');
assert.equal(q.tone,undefined,'no spectrum → no tone');
console.log('PASS — frameToMeasured: lufs/truepeak/plr/corr + spectrum → 6 normalized tonal bands');
