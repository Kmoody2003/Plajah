import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const fabula=readFileSync('components/Fabula/Fabula.jsx','utf8');
const component=fabula.slice(fabula.indexOf('function AudioLayer('),fabula.indexOf('/* ---------- Resolve-style per-track'));
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
import React,{useRef,useState,useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {resolveMediaSource} from './services/fabula/mediaSource';
import {reportMediaHealth} from './services/fabula/mediaHealth';
import {getAudioCtx,resumeAudioCtx,attachAudioGraph,needsCors,meterRegistry} from './services/fabula/audioGraph';
import {engineRunning,engineClock,engineIsDead,startPlayback,stopPlayback} from './services/fabula/playbackEngine';
import {putBytes} from './services/fabula/mediaStore';
${component}
window.testAudio=async()=>{
 const sr=48000,bytes=new ArrayBuffer(44+sr*8*2),d=new DataView(bytes);const str=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
 str(0,'RIFF');d.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes.byteLength-44,true);for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*440*2*Math.PI/sr)*12000,true);
 await putBytes('studio:blob:score',new Blob([bytes],{type:'audio/wav'}));
 await putBytes('studio:proxy:score',new Blob(['proxy bytes']));
 const asset={id:'score',url:'https://invalid.example/score.wav',type:'audio',name:'Score',previewProxy:true};
 const original=await resolveMediaSource(asset);const proxy=await resolveMediaSource(asset,false,true);
 const identities={original:original.origin,proxy:proxy.origin};original.release();proxy.release();
 await getAudioCtx().resume();const root=createRoot(document.getElementById('root'));
 root.render(<AudioLayer clip={{id:'music',assetId:'score',start:0,srcIn:0,duration:8}} prod={{mediaPool:[asset]}} playhead={0} playing={true} active={true} trackId="music" track={{vol:1}}/>);
 const peaks=[];for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,250));peaks.push(meterRegistry.get('music')?.()||0);}
 const audio=document.querySelector('audio');const result={identities,peaks,time:audio.currentTime,paused:audio.paused,error:audio.error?.message};root.unmount();
 startPlayback({clips:[{id:'scheduled',assetId:'score',trackId:'a1',start:0,duration:8,audio:{clean:{hum:0,hpf:0,lpf:0,trim:0}}}],mediaPool:[asset],t0:0});
 await new Promise(r=>setTimeout(r,400));result.scheduledPeak=meterRegistry.get('a1')?.()||0;stopPlayback();return result;
};`},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{const page=await browser.newPage();await page.route('http://localhost:9880/**',route=>route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));await page.goto('http://localhost:9880/');await page.addScriptTag({content:bundle.outputFiles[0].text});const result=await page.evaluate(()=>window.testAudio());
 assert.ok(result.scheduledPeak>.1,'scheduled audio cleanup bypass must preserve signal');assert.equal(result.identities.original,'cache');assert.equal(result.identities.proxy,'proxy');assert.equal(result.paused,false);assert.ok(result.time>2);assert.ok(result.peaks.slice(-4).every(p=>p>.01),'standalone WAV must keep producing signal through the real mixer');console.log('PASS',JSON.stringify(result));
}finally{await browser.close();}

