import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {designLinearPhaseFir,fft} from './services/melos/beats/fx/firEq';
  import {curveMagnitudeDb} from './services/melos/beats/fx/spectraEq';
  globalThis.F={designLinearPhaseFir,fft,curveMagnitudeDb};`},bundle:true,write:false,format:'iife'});
const ctx={console,Math,Float64Array,Float32Array,Array};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const {designLinearPhaseFir,fft,curveMagnitudeDb}=ctx.F;
const SR=48000,N=8192;
const bands=[{id:'b1',freq:1000,gain:6,q:1,type:'bell',on:true},{id:'b2',freq:120,gain:-4,q:0.8,type:'bell',on:true}];
const h=designLinearPhaseFir(bands,SR,N);
let maxAsym=0,peak=0; for(let n=0;n<N;n++){peak=Math.max(peak,Math.abs(h[n]));} 
for(let n=0;n<N;n++){const a=Math.abs(h[n]-h[N-1-n]); if(a>maxAsym)maxAsym=a;}
console.log('symmetry maxAsym/peak =',(maxAsym/peak).toExponential(2));
assert.ok(maxAsym/peak < 1e-6,'FIR is symmetric => exactly linear phase');
const re=new Float64Array(N),im=new Float64Array(N); for(let n=0;n<N;n++)re[n]=h[n];
fft(re,im,false);
const dbAt=(f)=>{const k=Math.round(f*N/SR); return 20*Math.log10(Math.hypot(re[k],im[k]));};
for(const f of [120,1000,4000,8000]){
  const got=dbAt(f), want=curveMagnitudeDb(bands,f,SR);
  console.log('  '+f+'Hz: FIR '+got.toFixed(2)+'dB vs target '+want.toFixed(2)+'dB');
  assert.ok(Math.abs(got-want)<1.2,'magnitude matches within 1.2dB @ '+f+'Hz');
}
console.log('PASS - linear-phase FIR: symmetric (linear phase) + magnitude tracks the EQ curve within ~1dB');
