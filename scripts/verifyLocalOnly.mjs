import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(bd){
  bd.onResolve({filter:/mediaStore$/},()=>({path:'ms',namespace:'mem'}));
  bd.onResolve({filter:/syncFolders$/},()=>({path:'sf',namespace:'mem'}));
  bd.onResolve({filter:/^idb-keyval$/},()=>({path:'idb',namespace:'mem'}));
  bd.onLoad({filter:/.*/,namespace:'mem'},a=>{
    if(a.path==='ms')return{contents:`export const getBytes=async()=>null;`,loader:'js'};
    if(a.path==='sf')return{contents:`export const getFileFromFolder=async()=>null;`,loader:'js'};
    return{contents:`export const get=async()=>undefined;`,loader:'js'};});
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {resolveMediaSource,setLocalOnly} from './services/fabula/mediaSource';
  globalThis.MS={resolveMediaSource,setLocalOnly};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const ctx={console};ctx.globalThis=ctx;ctx.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};ctx.fetch=async()=>{throw new Error('no net');};
runInNewContext(r.outputFiles[0].text,ctx);
const cloudAsset={id:'c1',type:'video',url:'https://cdn.test/x.mp4'};
// local-only OFF → cloud fallback allowed
ctx.MS.setLocalOnly(false);
const off=await ctx.MS.resolveMediaSource(cloudAsset,false,false);
assert.equal(off.origin,'cloud','local-only OFF streams cloud as fallback');
// local-only ON → no local source → must THROW, never return cloud
ctx.MS.setLocalOnly(true);
let threw=null;
try{ await ctx.MS.resolveMediaSource(cloudAsset,false,false); }catch(e){ threw=e.message; }
console.log('OFF origin=',off.origin,'| ON threw=',threw);
assert.ok(threw && /LOCAL-ONLY/.test(threw),'local-only ON refuses cloud and reports offline');
console.log('PASS — Switch to Local blocks cloud fallback; default allows it');
