import {build} from 'esbuild';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// ---- Part 1: buildPictureProxy downscales a real large image (needs a browser) ----
const picBundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {buildPictureProxy} from './services/fabula/proxyBuilder';
  window.testPic=async()=>{
    const c=document.createElement('canvas');c.width=4000;c.height=3000;
    const x=c.getContext('2d');
    const img=x.createImageData(4000,3000);const d=img.data;
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*256)|0; // per-pixel noise → PNG > 3MB (defeats compression)
    x.putImageData(img,0,0);
    const src=await new Promise(r=>c.toBlob(r,'image/png'));
    const proxy=await buildPictureProxy(src,2048);
    if(!proxy)return {ok:false,srcSize:src.size};
    const bmp=await createImageBitmap(proxy);
    return {ok:true,srcSize:src.size,proxySize:proxy.size,type:proxy.type,w:bmp.width,h:bmp.height};
  };`},bundle:true,write:false,format:'iife'});
const b=await chromium.launch({headless:true});
let picRes;
try{const p=await b.newPage();await p.route('http://localhost:9911/**',r=>r.fulfill({body:'<div></div>',contentType:'text/html'}));await p.goto('http://localhost:9911/');await p.addScriptTag({content:picBundle.outputFiles[0].text});
  picRes=await p.evaluate(()=>window.testPic());
}finally{await b.close();}
console.log('PICTURE',JSON.stringify(picRes));
assert.ok(picRes.ok,'picture proxy built');
assert.equal(picRes.type,'image/webp','proxy is webp');
assert.ok(Math.max(picRes.w,picRes.h)<=2048,'long edge downscaled to <=2048');
assert.ok(picRes.proxySize<picRes.srcSize,'proxy smaller than original');

// ---- Part 2: resolveMediaSource audio-proxy preference (pure logic, node VM + stubs) ----
const memPlugin={name:'mem',setup(bd){
  bd.onResolve({filter:/mediaStore$/},()=>({path:'ms',namespace:'mem'}));
  bd.onResolve({filter:/syncFolders$/},()=>({path:'sf',namespace:'mem'}));
  bd.onResolve({filter:/^idb-keyval$/},()=>({path:'idb',namespace:'mem'}));
  bd.onLoad({filter:/.*/,namespace:'mem'},args=>{
    if(args.path==='ms')return{contents:`export const getBytes=async k=>globalThis.__proxy.get(k)||null;`,loader:'js'};
    if(args.path==='sf')return{contents:`export const getFileFromFolder=async()=>null;`,loader:'js'};
    return{contents:`export const get=async()=>undefined;`,loader:'js'};
  });
}};
const msBundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {resolveMediaSource,setAudioProxyPreference} from './services/fabula/mediaSource';
  globalThis.MS={resolveMediaSource,setAudioProxyPreference};
`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const {runInNewContext}=await import('node:vm');
const proxyStore=new Map();
proxyStore.set('studio:proxy:aud1',{size:4096}); // a proxy exists for aud1
const urls=[];
const ctx={console,__proxy:proxyStore};ctx.globalThis=ctx;
ctx.URL={createObjectURL:b=>{const u='blob:'+(urls.push(b));return u;},revokeObjectURL(){}};
ctx.fetch=async()=>{throw new Error('no net in test');};
runInNewContext(msBundle.outputFiles[0].text,ctx);
const asset={id:'aud1',type:'audio',url:'https://cdn.test/big.wav',cloudUrl:'https://cdn.test/big.wav'};
ctx.MS.setAudioProxyPreference(false);
const off=await ctx.MS.resolveMediaSource(asset,false,false);
ctx.MS.setAudioProxyPreference(true);
const on=await ctx.MS.resolveMediaSource(asset,false,false);
console.log('AUDIO pref off→',off.origin,' on→',on.origin);
assert.equal(off.origin,'cloud','pref OFF → audio streams original (cloud)');
assert.equal(on.origin,'proxy','pref ON → audio resolves the local AAC proxy');
assert.equal(on.local,true,'proxy source is local');
console.log('PASS — picture proxy downscales to webp; audio-proxy preference gates on/off');
