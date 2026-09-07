import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(bd){
  bd.onResolve({filter:/mediaStore$/},()=>({path:'ms',namespace:'mem'}));
  bd.onResolve({filter:/syncFolders$/},()=>({path:'sf',namespace:'mem'}));
  bd.onResolve({filter:/^idb-keyval$/},()=>({path:'idb',namespace:'mem'}));
  bd.onLoad({filter:/.*/,namespace:'mem'},a=>{
    if(a.path==='ms')return{contents:`export const getBytes=async k=>globalThis.__store.get(k)||null;`,loader:'js'};
    if(a.path==='sf')return{contents:`export const getFileFromFolder=async()=>null;`,loader:'js'};
    return{contents:`export const get=async()=>undefined;`,loader:'js'};});
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {resolveMediaSource,setLocalOnly} from './services/fabula/mediaSource';
  globalThis.MS={resolveMediaSource,setLocalOnly};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const store=new Map();
store.set('studio:proxy:v1',{size:2048}); // a proxy exists on disk
const ctx={console,__store:store};ctx.globalThis=ctx;ctx.URL={createObjectURL:()=>'blob:p',revokeObjectURL(){}};ctx.fetch=async()=>{throw new Error('no net');};
runInNewContext(r.outputFiles[0].text,ctx);
// PROXIES OFF (no previewProxy flag) + a cloud url + a proxy on disk → must use the LOCAL proxy, not cloud
ctx.MS.setLocalOnly(false);
const res=await ctx.MS.resolveMediaSource({id:'v1',type:'video',url:'https://cdn.test/v.mp4'},false,false);
console.log('proxies-off resolve →',res.origin,'local=',res.local);
assert.equal(res.origin,'proxy','proxies off still falls back to the local proxy before cloud');
assert.equal(res.local,true,'that fallback is a local source');
console.log('PASS — proxies-off falls back to the on-device proxy instead of streaming cloud');
