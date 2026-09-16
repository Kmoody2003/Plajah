import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const worker=await build({entryPoints:['services/mediaEngine/indexedVideo.worker.ts'],bundle:true,write:false,format:'esm'});
const client=await build({stdin:{contents:`
import {Output,BufferTarget,WebMOutputFormat,VideoSampleSource,VideoSample} from 'mediabunny';
import {IndexedVideo,indexedVideoDiagnostics} from './services/mediaEngine/indexedVideo';
import React from 'react';
import {createRoot} from 'react-dom/client';
import IndexedVideoCanvas from './components/Fabula/IndexedVideoCanvas';
window.run=async()=>{
 const target=new BufferTarget(); const output=new Output({format:new WebMOutputFormat(),target});
 const source=new VideoSampleSource({codec:'vp8',bitrate:1000000});output.addVideoTrack(source);await output.start();
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');
 for(let i=0;i<12;i++){ctx.fillStyle=i<6?'red':'blue';ctx.fillRect(0,0,64,64);const sample=new VideoSample(canvas,{timestamp:i/12,duration:1/12});await source.add(sample);sample.close();}
 await output.finalize();const blob=new Blob([target.buffer],{type:'video/webm'});
 let resolve,reject;const frames=[];
 const decoder=new IndexedVideo({blob},(frame,time)=>{ctx.drawImage(frame,0,0);const rgb=[...ctx.getImageData(32,32,1,1).data];frames.push({time,rgb,timestamp:frame.timestamp});resolve();},error=>reject(error),()=>new Worker('/worker.js',{type:'module'}));
 const at=time=>new Promise((res,rej)=>{resolve=res;reject=rej;decoder.request(time,true);});
 await at(.1);await at(.7);await at(.2);decoder.dispose();
 let fail;const invalid=new Promise(res=>fail=res);
 new IndexedVideo({blob:new Blob(['invalid'])},()=>{},()=>fail(true),()=>new Worker('/worker.js',{type:'module'}));
 await invalid;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const ref={current:null};const url=URL.createObjectURL(blob);
 let canvasPixel;
 try {
  await new Promise((res,rej)=>root.render(React.createElement(IndexedVideoCanvas,{url,sourceRef:ref,playing:false,active:true,time:.7,offset:0,clipStart:0,fps:12,hidden:false,onError:rej,onReady:()=>{canvasPixel=[...ref.current.getContext('2d').getImageData(32,32,1,1).data];res();}})));
 } finally {root.unmount();URL.revokeObjectURL(url);host.remove();}
 return {frames,canvasPixel,diagnostics:indexedVideoDiagnostics()};
};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm'});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.route('http://localhost:9877/**',route=>{const isWorker=/worker\.(js|ts)$/.test(route.request().url());return route.fulfill({contentType:isWorker?'application/javascript':'text/html',body:isWorker?worker.outputFiles[0].text:'<body></body>'});});
 await page.goto('http://localhost:9877/');await page.addScriptTag({type:'module',content:client.outputFiles[0].text});
 const result=await page.evaluate(()=>Promise.race([window.run(),new Promise((_,reject)=>setTimeout(()=>reject(Error('test timeout')),30000))]));
 assert.equal(result.frames.length,3);
 assert.ok(result.frames[0].rgb[0]>200 && result.frames[0].rgb[2]<30,'first seek red');
 assert.ok(result.frames[1].rgb[2]>200 && result.frames[1].rgb[0]<30,'forward seek blue');
 assert.ok(result.frames[2].rgb[0]>200 && result.frames[2].rgb[2]<30,'backward seek red');
 assert.ok(Math.abs(result.frames[0].timestamp-83333)<1000,'floor frame at 0.1 seconds (WebM millisecond timebase)');
 assert.equal(result.diagnostics.activeWorkers,0);
 assert.ok(result.canvasPixel[2]>200 && result.canvasPixel[0]<30,'React canvas adapter presents requested frame');
 console.log('PASS: actual VP8 encode, worker demux/decode, frame timestamp selection, forward/backward seeks, invalid-media fallback and worker cleanup',JSON.stringify(result));
} finally {await browser.close();}
