// Verify the shared MeterAnalyser: correlation (identical/inverted/decorrelated),
// true-peak of a known amplitude, and finite LUFS/spectrum from live audio.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {MeterAnalyser} from './services/shared/meterAnalyser';
window.testMeter=async(mode)=>{
  const ctx=new AudioContext(); const sr=ctx.sampleRate;
  const buf=ctx.createBuffer(2,sr,sr); const L=buf.getChannelData(0),R=buf.getChannelData(1);
  for(let i=0;i<L.length;i++){const s=Math.sin(2*Math.PI*220*i/sr)*0.5; L[i]=s; R[i]= mode==='inv'?-s : mode==='decorr'?Math.sin(2*Math.PI*337*i/sr)*0.5 : s;}
  const src=ctx.createBufferSource(); src.buffer=buf; src.loop=true;
  const g=ctx.createGain(); src.connect(g); g.connect(ctx.destination);
  const meter=new MeterAnalyser(ctx,g);
  await ctx.resume(); src.start();
  let f; for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,50)); f=meter.read();}
  src.stop(); meter.dispose();
  return {corr:+f.corr.toFixed(3), tpL:+f.tpL.toFixed(2), lufsM:+f.lufsM.toFixed(1), rms:+f.rms.toFixed(1), specMax:+Math.max(...f.spectrum).toFixed(1)};
};`},bundle:true,write:false,format:'iife'});

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();
 await page.route('http://localhost:9885/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));
 await page.goto('http://localhost:9885/'); await page.addScriptTag({content:bundle.outputFiles[0].text});
 const same=await page.evaluate(()=>window.testMeter('same'));
 const inv=await page.evaluate(()=>window.testMeter('inv'));
 const dec=await page.evaluate(()=>window.testMeter('decorr'));
 console.log('same  ',JSON.stringify(same));
 console.log('invert',JSON.stringify(inv));
 console.log('decorr',JSON.stringify(dec));
 assert.ok(same.corr>0.9,'identical L/R -> correlation ~ +1');
 assert.ok(inv.corr<-0.9,'inverted L/R -> correlation ~ -1');
 assert.ok(Math.abs(dec.corr)<0.4,'decorrelated -> correlation near 0');
 assert.ok(same.tpL>-8 && same.tpL<-4,'0.5-amplitude sine -> ~-6 dBTP');
 assert.ok(same.lufsM<0 && same.lufsM>-40,'LUFS finite and sane');
 assert.ok(same.specMax>-60,'spectrum has energy');
 console.log('PASS — MeterAnalyser correlation/true-peak/LUFS/spectrum all sane');
}finally{await browser.close();}
