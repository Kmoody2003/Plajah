import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {SpectraEQ} from './services/melos/beats/fx/spectraEq';
  window.run=async()=>{
    const N=48000, ctx=new OfflineAudioContext(2,N,48000);
    const imp=ctx.createBuffer(2,N,48000); imp.getChannelData(0)[0]=1; imp.getChannelData(1)[0]=1;
    const src=ctx.createBufferSource(); src.buffer=imp;
    const eq=new SpectraEQ(ctx);
    eq.setState({on:true,mode:5,linearPhase:true,bands:[{id:'b1',freq:1000,gain:6,q:1,type:'bell',on:true}]});
    src.connect(eq.input); eq.output.connect(ctx.destination); src.start();
    const rb=await ctx.startRendering(); const h=rb.getChannelData(0);
    // find peak
    let peak=0,pi=0; for(let i=0;i<h.length;i++){const a=Math.abs(h[i]); if(a>peak){peak=a;pi=i;}}
    // symmetry around the peak (linear phase)
    let maxAsym=0; for(let i=0;i<8192;i++){ const a=Math.abs(h[i]-h[8191-i]); if(a>maxAsym)maxAsym=a; }
    return { latency: eq.latencySamples, peakIdx: pi, symErr: maxAsym/peak };
  };`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9933/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9933/');await p.addScriptTag({content:bundle.outputFiles[0].text});
  const r=await p.evaluate(()=>window.run());
  console.log('RESULT',JSON.stringify(r));
  assert.equal(r.latency,4095.5,'reports FIR latency (8191/2 samples)');
  assert.ok(Math.abs(r.peakIdx-4095)<=2,'impulse response centered at the FIR delay');
  assert.ok(r.symErr < 1e-4,'response is symmetric about its peak => genuinely linear phase through the ConvolverNode');
  console.log('PASS - linear-phase EQ end-to-end: FIR convolver, centered impulse, symmetric (linear phase), latency reported');
}finally{await b.close();}
