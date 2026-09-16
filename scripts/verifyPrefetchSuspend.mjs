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
  import {prefetchAssets,setPrefetchSuspended,prefetchStatus} from './services/fabula/prefetch';
  globalThis.API={prefetchAssets,setPrefetchSuspended,prefetchStatus};`},
  bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const store=new Map();const fetched=[];
const ctx={console,setTimeout,clearTimeout,AbortController,location:{origin:'https://app.test'},__store:store};
ctx.globalThis=ctx;
ctx.fetch=async(u)=>{fetched.push(u);return {ok:true,headers:{get:()=>'1048576'},blob:async()=>({size:1048576})};};
runInNewContext(r.outputFiles[0].text,ctx);
// Suspended BEFORE queueing → nothing should fetch
ctx.API.setPrefetchSuspended(true);
ctx.API.prefetchAssets([{id:'a',url:'https://cdn.test/a.mp4'}]);
await new Promise(r=>setTimeout(r,150));
const whileSuspended=[...fetched];
// Resume → it should drain now
ctx.API.setPrefetchSuspended(false);
await new Promise(r=>setTimeout(r,200));
console.log(JSON.stringify({whileSuspended,afterResume:fetched}));
assert.equal(whileSuspended.length,0,'nothing fetched while suspended (playback/scrub protected)');
assert.ok(fetched.some(u=>/a\.mp4/.test(u)),'queue drains after resume (idle)');
console.log('PASS — prefetch suspends during playback/scrub, resumes on idle');
