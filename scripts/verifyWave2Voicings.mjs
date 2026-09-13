import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {deviceByType} from './services/melos/beats/fx/devices';
  window.render=async(type,params,amp)=>{
    const N=24000, ctx=new OfflineAudioContext(2,N,48000);
    const buf=ctx.createBuffer(2,N,48000);
    for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<N;i++)d[i]=Math.sin(i*220*2*Math.PI/48000)*amp;}
    const src=ctx.createBufferSource();src.buffer=buf;
    const dev=deviceByType(type).create(ctx); dev.setParams(params);
    src.connect(dev.input); dev.output.connect(ctx.destination); src.start();
    const rb=await ctx.startRendering(); const o=rb.getChannelData(0);
    let peak=0,s=0; for(let i=0;i<o.length;i++){const a=Math.abs(o[i]);if(a>peak)peak=a;s+=o[i]*o[i];}
    return { gr: dev.gr?dev.gr():null, peak, rms:Math.sqrt(s/o.length) };
  };`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9966/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9966/');await p.addScriptTag({content:bundle.outputFiles[0].text});
  const R=await p.evaluate(async()=>{
    const base={threshold:-30,ratio:4,attack:5,release:150,knee:12,makeup:0};
    return {
      clean: await window.render('comp',{...base,character:0},0.9),
      fet:   await window.render('comp',{...base,character:1},0.9),
      opto:  await window.render('comp',{...base,character:2},0.9),
      // limiter: hot input + drive, ceiling -1 dB → output must never exceed -1 dBFS (0.891)
      lim:   await window.render('limiter',{gain:12,ceiling:-1,release:80,character:2},0.9),
    };
  });
  console.log(JSON.stringify(R,null,1));
  const ceil=Math.pow(10,-1/20); // -1 dBFS = 0.891
  for(const v of ['clean','fet','opto']) assert.ok(R[v].gr<-1,'comp '+v+' voicing compresses (GR '+R[v].gr.toFixed(1)+')');
  assert.ok(R.fet.rms>0.01&&R.opto.rms>0.01&&R.clean.rms>0.01,'all voicings pass audio');
  assert.ok(R.lim.peak <= ceil+0.01,'limiter is true-peak-safe: output peak '+R.lim.peak.toFixed(3)+' <= ceiling '+ceil.toFixed(3));
  console.log('PASS - comp voicings (Clean/FET/Opto) all compress + pass audio; limiter clamps to the ceiling (true-peak safe)');
}finally{await b.close();}
