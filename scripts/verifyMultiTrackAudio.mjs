// Reproduction test: do audio tracks BESIDE the first produce signal through the
// Fabula playback engine's mixer? Schedules one clip each on a1/a2/a3 (distinct
// assets/frequencies) and reads each track bus meter.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {putBytes} from './services/fabula/mediaStore';
import {getAudioCtx,meterRegistry} from './services/fabula/audioGraph';
import {startPlayback,stopPlayback,engineStats} from './services/fabula/playbackEngine';
window.testMulti=async()=>{
 const sr=48000;
 const wav=(freq)=>{const bytes=new ArrayBuffer(44+sr*8*2),d=new DataView(bytes);const str=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');d.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes.byteLength-44,true);
  for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*freq*2*Math.PI/sr)*12000,true);return new Blob([bytes],{type:'audio/wav'});};
 const assets=[['score1',330],['score2',440],['score3',550]];
 for(const [id,f] of assets) await putBytes('studio:blob:'+id, wav(f));
 const mediaPool=assets.map(([id])=>({id,url:'https://invalid.example/'+id+'.wav',type:'audio',name:id}));
 const clips=assets.map(([id],i)=>({id:'clip'+i,assetId:id,trackId:'a'+(i+1),start:0,duration:8,audio:{clean:{hum:0,hpf:0,lpf:0,trim:0}}}));
 await getAudioCtx().resume();
 startPlayback({clips,mediaPool,t0:0});
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,250));if(engineStats().scheduled>=3)break;}
 await new Promise(r=>setTimeout(r,400));
 const peaks={a1:meterRegistry.get('a1')?.()||0,a2:meterRegistry.get('a2')?.()||0,a3:meterRegistry.get('a3')?.()||0};
 const stats=engineStats();stopPlayback();
 return {peaks,scheduled:stats.scheduled,planned:stats.planned,unplayable:stats.unplayable,reasons:stats.reasons};
};`},bundle:true,write:false,format:'iife'});

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();
 await page.route('http://localhost:9881/**',route=>route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
 await page.goto('http://localhost:9881/');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>window.testMulti());
 console.log('RESULT',JSON.stringify(r,null,1));
 assert.ok(r.peaks.a1>.1,'a1 (first track) should have signal');
 assert.ok(r.peaks.a2>.1,'a2 (second track) should have signal — REGRESSION if 0');
 assert.ok(r.peaks.a3>.1,'a3 (third track) should have signal — REGRESSION if 0');
 console.log('PASS — all three tracks produce signal');
}finally{await browser.close();}
