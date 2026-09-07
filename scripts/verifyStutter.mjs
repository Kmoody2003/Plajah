import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {deviceByType,newInstance} from './services/melos/beats/fx/devices';
  window.t=async()=>{
    const inst=newInstance('stutter');
    const N=12000, ctx=new OfflineAudioContext(2,N,48000);
    const buf=ctx.createBuffer(2,N,48000);
    for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<N;i++)d[i]=(Math.random()*2-1)*0.3;}
    const src=ctx.createBufferSource();src.buffer=buf;
    const dev=deviceByType('stutter').create(ctx); dev.setTempo(120); dev.setParams({on:0,pattern:0,division:2,gate:100});
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const rb=await ctx.startRendering();
    const rms=(a)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*a[i];return Math.sqrt(s/a.length);};
    return { hasInst: !!(inst&&inst.type==='stutter'), defaultPattern: inst?inst.params.pattern:null, inR:rms(buf.getChannelData(0)), outR:rms(rb.getChannelData(0)) };
  };`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9955/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9955/');await p.addScriptTag({content:bundle.outputFiles[0].text});
  const r=await p.evaluate(()=>window.t());
  console.log(JSON.stringify(r));
  assert.ok(r.hasInst,'stutter registered in the catalog (newInstance works)');
  assert.equal(r.defaultPattern,0,'default pattern is empty');
  assert.ok(Math.abs(r.outR/r.inR-1)<0.05,'off/empty → clean dry passthrough (out≈in); the pattern re-trigger is real-time');
  console.log('PASS - Stutter FX registered + clean passthrough (pattern re-trigger is control-rate/real-time, like Beatmasher)');
}finally{await b.close();}
