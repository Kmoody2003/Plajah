import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/mediaStore$/},()=>({path:'ms',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`
    const store=globalThis.__store;
    export const hasBytes=async k=>store.has(k);
    export const putBytes=async(k,b)=>{store.set(k,{size:b.size});return true;};`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {prefetchAssets,onPrefetched,prefetchStatus} from './services/fabula/prefetch';
  globalThis.API={prefetchAssets,onPrefetched,prefetchStatus};
`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const store=new Map();
store.set('studio:blob:localAsset',{size:100}); // already local → must be skipped
const fetched=[];
const ctx={console,setTimeout,clearTimeout,AbortController,location:{origin:'https://app.test'},__store:store};
ctx.globalThis=ctx;
ctx.fetch=async(url)=>{
  fetched.push(url);
  // huge.mp4 → oversized (content-length over cap); others → small blob
  const big=/huge/.test(url);
  return {ok:true,headers:{get:h=>h==='content-length'?(big?String(800*1024*1024):'1048576'):null},blob:async()=>({size:big?800*1024*1024:1048576})};
};
runInNewContext(r.outputFiles[0].text,ctx);
const notified=[];
ctx.API.onPrefetched(id=>notified.push(id));
ctx.API.prefetchAssets([
  {id:'cloudA',url:'https://cdn.test/a.mp4'},
  {id:'cloudA',url:'https://cdn.test/a.mp4'},   // dup → single
  {id:'localAsset',url:'https://cdn.test/l.mp4'}, // already local → skip (no fetch)
  {id:'blobAsset',url:'blob:xyz'},               // non-http → ignored
  {id:'huge',url:'https://cdn.test/huge.mp4'},   // oversized → fetched then rejected, no store
]);
await new Promise(r=>setTimeout(r,300));
const st=ctx.API.prefetchStatus();
console.log(JSON.stringify({fetched,notified,stored:[...store.keys()],st}));
assert.ok(store.has('studio:blob:cloudA'),'cloudA pulled to local');
assert.ok(!store.has('studio:blob:huge'),'oversized NOT stored');
assert.equal(notified.filter(x=>x==='cloudA').length,1,'notified once for cloudA');
assert.ok(!fetched.some(u=>/l\.mp4/.test(u)),'already-local asset never fetched');
assert.ok(!fetched.some(u=>/blob:/.test(u)),'non-http never fetched');
assert.ok(fetched.some(u=>/huge/.test(u)),'oversized was attempted (then capped)');
console.log('PASS — prefetch: dedup, skip-local, skip-nonhttp, size-cap, store + notify');
