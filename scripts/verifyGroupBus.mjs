// P4: two tracks routed to group A; a -60 dB insert on group A collapses the whole
// group at the master, while the pre-group per-track meters stay full and the group
// meter shows the summed signal.
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'js',contents:`
import {putBytes} from './services/fabula/mediaStore';
import {getAudioCtx,meterRegistry,setGroupInserts} from './services/fabula/audioGraph';
import {startPlayback,stopPlayback,engineStats} from './services/fabula/playbackEngine';
window.t=async()=>{
 const sr=48000;
 const wav=(f)=>{const b=new ArrayBuffer(44+sr*8*2),d=new DataView(b);const s=(o,x)=>[...x].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  s(0,'RIFF');d.setUint32(4,b.byteLength-8,true);s(8,'WAVE');s(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);s(36,'data');d.setUint32(40,b.byteLength-44,true);
  for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*f*2*Math.PI/sr)*8000,true);return new Blob([b],{type:'audio/wav'});};
 for(const [id,f] of [['g1',330],['g2',440]]) await putBytes('studio:blob:'+id, wav(f));
 const pool=[{id:'g1',url:'https://invalid.example/g1.wav',type:'audio'},{id:'g2',url:'https://invalid.example/g2.wav',type:'audio'}];
 const clips=[{id:'c1',assetId:'g1',trackId:'a1',start:0,duration:8},{id:'c2',assetId:'g2',trackId:'a2',start:0,duration:8}];
 const trackSettings={ a1:{group:'A'}, a2:{group:'A'} };
 await getAudioCtx().resume();
 startPlayback({clips,mediaPool:pool,trackSettings,t0:0});
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,250));if(engineStats().scheduled>=2)break;}
 await new Promise(r=>setTimeout(r,300));
 const before={master:meterRegistry.get('master')?.()||0, groupA:meterRegistry.get('group:A')?.()||0, a1:meterRegistry.get('a1')?.()||0};
 setGroupInserts(0,[{id:'x',type:'trim',on:true,params:{gain:-60}}]);
 await new Promise(r=>setTimeout(r,500));
 const after={master:meterRegistry.get('master')?.()||0, a1:meterRegistry.get('a1')?.()||0};
 stopPlayback();
 return {before,after};
};`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const p=await b.newPage();await p.route('http://localhost:9887/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9887/');await p.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await p.evaluate(()=>window.t());console.log('RESULT',JSON.stringify(r));
 assert.ok(r.before.groupA>.1,'group A bus carries the routed tracks');
 assert.ok(r.before.master>.1,'master has signal via the group');
 assert.ok(r.after.master<r.before.master*0.1,'a -60 dB group insert collapses the group at the master');
 assert.ok(r.after.a1>.05,'per-track meter (pre-group) stays full');
 console.log('PASS — tracks route through group A; group insert processes the submix');
}finally{await b.close();}
