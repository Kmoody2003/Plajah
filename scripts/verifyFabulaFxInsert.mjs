// Proves Melos's shared FX devices process a Fabula track through the new
// per-track insert seam: a1 carries a -60 dB "trim" insert, a2 carries none.
// a1's mixer meter must collapse relative to a2's.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {putBytes} from './services/fabula/mediaStore';
import {getAudioCtx,meterRegistry} from './services/fabula/audioGraph';
import {startPlayback,stopPlayback,engineStats} from './services/fabula/playbackEngine';
window.testFx=async()=>{
 const sr=48000;
 const wav=(freq)=>{const bytes=new ArrayBuffer(44+sr*8*2),d=new DataView(bytes);const str=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');d.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes.byteLength-44,true);
  for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*freq*2*Math.PI/sr)*12000,true);return new Blob([bytes],{type:'audio/wav'});};
 for(const [id,f] of [['fx1',330],['fx2',440]]) await putBytes('studio:blob:'+id, wav(f));
 const mediaPool=[{id:'fx1',url:'https://invalid.example/fx1.wav',type:'audio',name:'fx1'},{id:'fx2',url:'https://invalid.example/fx2.wav',type:'audio',name:'fx2'}];
 const clips=[{id:'c1',assetId:'fx1',trackId:'a1',start:0,duration:8},{id:'c2',assetId:'fx2',trackId:'a2',start:0,duration:8}];
 // a1 gets a -60 dB Melos "trim" insert; a2 gets none.
 const trackSettings={ a1:{ inserts:[{id:'i1',type:'trim',on:true,params:{gain:-60}}] } };
 await getAudioCtx().resume();
 startPlayback({clips,mediaPool,trackSettings,t0:0});
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,250));if(engineStats().scheduled>=2)break;}
 await new Promise(r=>setTimeout(r,400));
 return {a1:meterRegistry.get('a1')?.()||0,a2:meterRegistry.get('a2')?.()||0,scheduled:engineStats().scheduled};
};`},bundle:true,write:false,format:'iife'});

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();
 await page.route('http://localhost:9883/**',route=>route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
 await page.goto('http://localhost:9883/');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>window.testFx());
 console.log('RESULT',JSON.stringify(r));
 assert.ok(r.a2>.1,'a2 (no insert) should have full signal');
 assert.ok(r.a1<r.a2*0.05,'a1 (-60 dB trim insert) must be heavily attenuated vs a2');
 console.log('PASS — Melos FX insert processes a Fabula track (a1 collapsed, a2 intact)');
}finally{await browser.close();}
