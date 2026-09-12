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
  import {conformNow} from './services/fabula/prefetch';
  globalThis.conformNow=conformNow;`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const store=new Map();
store.set('studio:blob:already',{size:10}); // one is already local
const fetched=[];
const ctx={console,setTimeout,clearTimeout,AbortController,location:{origin:'https://app.test'},__store:store};ctx.globalThis=ctx;
ctx.fetch=async(u)=>{fetched.push(u);const big=/huge/.test(u);return {ok:true,headers:{get:h=>h==='content-length'?(big?String(800*1024*1024):'2048'):null},blob:async()=>({size:big?800*1024*1024:2048})};};
runInNewContext(r.outputFiles[0].text,ctx);
const prog=[];
const res=await ctx.conformNow([
  {id:'already',url:'https://cdn/a.wav'},   // already local → counts, no fetch
  {id:'c1',url:'https://cdn/c1.wav'},        // pulled
  {id:'c2',url:'https://cdn/c2.mp4'},        // pulled
  {id:'huge',url:'https://cdn/huge.mp4'},    // too big → failed
  {id:'skip',url:'blob:xyz'},                // non-http → filtered out (not in total)
],(done,total)=>prog.push(done+'/'+total));
console.log(JSON.stringify({res,fetched,stored:[...store.keys()],lastProgress:prog[prog.length-1]}));
assert.equal(res.total,4,'non-http filtered from total');
assert.equal(res.pulled,3,'already + c1 + c2 pulled');
assert.equal(res.failed,1,'huge failed (too big)');
assert.ok(store.has('studio:blob:c1')&&store.has('studio:blob:c2'),'c1/c2 on disk');
assert.ok(!store.has('studio:blob:huge'),'huge not stored');
assert.ok(!fetched.some(u=>/a\.wav/.test(u)),'already-local not re-fetched');
assert.equal(prog[prog.length-1],'4/4','progress completes');
console.log('PASS — conformNow: skip-local, pull cloud, size-cap, filter non-http, progress');
