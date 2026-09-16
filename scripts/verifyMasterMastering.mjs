// P6b: the master mastering chain processes the whole mix. Apply a mastering state
// with a 150 Hz low-pass and a 440 Hz tone should collapse on the master meter.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {putBytes} from './services/fabula/mediaStore';
import {getAudioCtx,meterRegistry,setMasterMastering} from './services/fabula/audioGraph';
import {defaultMastering} from './services/fabula/audioFx';
import {startPlayback,stopPlayback,engineStats} from './services/fabula/playbackEngine';
window.t=async()=>{
 const sr=48000; const bytes=new ArrayBuffer(44+sr*8*2),d=new DataView(bytes);const s=(o,x)=>[...x].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
 s(0,'RIFF');d.setUint32(4,bytes.byteLength-8,true);s(8,'WAVE');s(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);s(36,'data');d.setUint32(40,bytes.byteLength-44,true);
 for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*440*2*Math.PI/sr)*9000,true);
 await putBytes('studio:blob:m1',new Blob([bytes],{type:'audio/wav'}));
 const pool=[{id:'m1',url:'https://invalid.example/m1.wav',type:'audio'}];
 await getAudioCtx().resume();
 startPlayback({clips:[{id:'c1',assetId:'m1',trackId:'a1',start:0,duration:8}],mediaPool:pool,t0:0});
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,250));if(engineStats().scheduled>=1)break;}
 await new Promise(r=>setTimeout(r,300));
 const before=meterRegistry.get('master')?.()||0;
 setMasterMastering({...defaultMastering(), on:true, lpHz:150, hpHz:20});
 await new Promise(r=>setTimeout(r,400));
 const after=meterRegistry.get('master')?.()||0; stopPlayback();
 return {before:+before.toFixed(3), after:+after.toFixed(3)};
};`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9886/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9886/');await p.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await p.evaluate(()=>window.t());console.log('RESULT',JSON.stringify(r));
 assert.ok(r.before>.1,'master had signal');assert.ok(r.after<r.before*0.5,'150Hz LP mastering must collapse a 440Hz tone on the master');
 console.log('PASS — master mastering chain processes the whole mix');
}finally{await b.close();}
