// Master FX suite (Melos devices on the whole mix): a -60 dB "trim" on the master
// must collapse the MASTER meter while the per-track meters (pre-master) stay full.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {putBytes} from './services/fabula/mediaStore';
import {getAudioCtx,meterRegistry,setMasterInserts} from './services/fabula/audioGraph';
import {startPlayback,stopPlayback,engineStats} from './services/fabula/playbackEngine';
window.testMaster=async()=>{
 const sr=48000;
 const wav=(freq)=>{const bytes=new ArrayBuffer(44+sr*8*2),d=new DataView(bytes);const str=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');d.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes.byteLength-44,true);
  for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*freq*2*Math.PI/sr)*9000,true);return new Blob([bytes],{type:'audio/wav'});};
 for(const [id,f] of [['m1',330],['m2',440]]) await putBytes('studio:blob:'+id, wav(f));
 const mediaPool=[{id:'m1',url:'https://invalid.example/m1.wav',type:'audio'},{id:'m2',url:'https://invalid.example/m2.wav',type:'audio'}];
 const clips=[{id:'c1',assetId:'m1',trackId:'a1',start:0,duration:8},{id:'c2',assetId:'m2',trackId:'a2',start:0,duration:8}];
 await getAudioCtx().resume();
 startPlayback({clips,mediaPool,t0:0});
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,250));if(engineStats().scheduled>=2)break;}
 await new Promise(r=>setTimeout(r,300));
 const before={a1:meterRegistry.get('a1')?.()||0,a2:meterRegistry.get('a2')?.()||0,master:meterRegistry.get('master')?.()||0};
 setMasterInserts([{id:'m',type:'trim',on:true,params:{gain:-60}}]);
 await new Promise(r=>setTimeout(r,400));
 const after={a1:meterRegistry.get('a1')?.()||0,a2:meterRegistry.get('a2')?.()||0,master:meterRegistry.get('master')?.()||0};
 stopPlayback();
 return {before,after};
};`},bundle:true,write:false,format:'iife'});

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();
 await page.route('http://localhost:9884/**',route=>route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
 await page.goto('http://localhost:9884/');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>window.testMaster());
 console.log('RESULT',JSON.stringify(r));
 assert.ok(r.before.master>.1,'master had signal before');
 assert.ok(r.after.master<r.before.master*0.1,'master FX (-60 dB) must collapse the master meter');
 assert.ok(r.after.a1>.05 && r.after.a2>.05,'per-track meters (pre-master) stay full');
 console.log('PASS — master FX suite processes the summed mix; per-track meters unaffected');
}finally{await browser.close();}
