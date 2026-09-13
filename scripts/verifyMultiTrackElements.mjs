// Do MULTIPLE element-fallback AudioLayers (the path used when the engine can't
// decode a source) each produce signal through the mixer? Renders 3 AudioLayers
// on a1/a2/a3 WITHOUT starting the engine, so each plays via its <audio> element.
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
import {engineRunning,engineClock,engineIsDead} from './services/fabula/playbackEngine';
import {putBytes} from './services/fabula/mediaStore';
${component}
window.testEls=async()=>{
 const sr=48000;
 const wav=(freq)=>{const bytes=new ArrayBuffer(44+sr*8*2),d=new DataView(bytes);const str=(o,s)=>[...s].forEach((c,i)=>d.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');d.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,sr,true);d.setUint32(28,sr*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,bytes.byteLength-44,true);
  for(let i=0;i<sr*8;i++)d.setInt16(44+2*i,Math.sin(i*freq*2*Math.PI/sr)*12000,true);return new Blob([bytes],{type:'audio/wav'});};
 const assets=[['e1',330],['e2',440],['e3',550]];
 for(const [id,f] of assets) await putBytes('studio:blob:'+id, wav(f));
 const pool=assets.map(([id])=>({id,url:'https://invalid.example/'+id+'.wav',type:'audio',name:id}));
 await getAudioCtx().resume();
 const root=createRoot(document.getElementById('root'));
 root.render(React.createElement('div',null, assets.map(([id],i)=>
   React.createElement(AudioLayer,{key:id,clip:{id:'c'+i,assetId:id,start:0,srcIn:0,duration:8},prod:{mediaPool:pool},playhead:0,playing:true,active:true,trackId:'a'+(i+1),track:{vol:1}}))));
 const peaks=[];for(let k=0;k<12;k++){await new Promise(r=>setTimeout(r,250));peaks.push({a1:meterRegistry.get('a1')?.()||0,a2:meterRegistry.get('a2')?.()||0,a3:meterRegistry.get('a3')?.()||0});}
 return {last:peaks[peaks.length-1],audios:[...document.querySelectorAll('audio')].map(a=>({paused:a.paused,t:+a.currentTime.toFixed(2),err:a.error?.code}))};
};`},bundle:true,write:false,format:'iife'});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();
 await page.route('http://localhost:9882/**',route=>route.fulfill({body:'<div id="root"></div>',contentType:'text/html'}));
 await page.goto('http://localhost:9882/');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const r=await page.evaluate(()=>window.testEls());
 console.log('RESULT',JSON.stringify(r,null,1));
 assert.ok(r.last.a1>.05,'a1 element should have signal');
 assert.ok(r.last.a2>.05,'a2 element should have signal — REGRESSION if 0');
 assert.ok(r.last.a3>.05,'a3 element should have signal — REGRESSION if 0');
 console.log('PASS — all three element tracks produce signal');
}finally{await browser.close();}
