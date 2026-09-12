import {build} from 'esbuild';
import assert from 'node:assert/strict';
// alias idb-keyval → in-memory Map so we can stash method-bearing handle stubs
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/^idb-keyval$/},()=>({path:'idb-keyval',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`
    const m=new Map();
    export const get=async k=>m.get(k);
    export const set=async(k,v)=>{m.set(k,v);};
    export const del=async k=>{m.delete(k);};
    export const keys=async()=>[...m.keys()];
    globalThis.__mem=m;`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {folderPermission,foldersNeedingAuth,reconnectFolders} from './services/fabula/syncFolders';
  const g=globalThis;
  g.run=async()=>{
    const m=g.__mem;
    m.set('fabula:syncFolders:P',[{id:'f1',name:'A'},{id:'f2',name:'B'},{id:'f3',name:'C'}]);
    let f2req=false;
    m.set('fabula:syncHandle:f1',{queryPermission:async()=>'granted'});
    m.set('fabula:syncHandle:f2',{queryPermission:async()=>f2req?'granted':'prompt',requestPermission:async()=>{f2req=true;return 'granted';}});
    // f3 handle missing entirely
    const p1=await folderPermission('f1'), p2=await folderPermission('f2'), p3=await folderPermission('f3');
    const need=(await foldersNeedingAuth('P')).map(f=>f.id);
    const rc=await reconnectFolders('P');
    const p2after=await folderPermission('f2');
    return {p1,p2,p3,need,rc,p2after};
  };
`},bundle:true,write:false,format:'iife',globalName:'B',plugins:[memPlugin]});
const {runInNewContext}=await import('node:vm');
const ctx={console};ctx.globalThis=ctx;
runInNewContext(r.outputFiles[0].text,ctx);
const out=await ctx.run();
console.log(JSON.stringify(out));
assert.equal(out.p1,'granted');assert.equal(out.p2,'prompt');assert.equal(out.p3,'missing');
assert.equal(JSON.stringify(out.need),JSON.stringify(['f2']),'only f2 needs re-grant');
assert.equal(JSON.stringify(out.rc),JSON.stringify({granted:2,failed:0,missing:1}),'f1 granted + f2 re-granted = 2; f3 missing');
assert.equal(out.p2after,'granted','f2 is granted after reconnect');
console.log('PASS — permission introspection + one-gesture reconnect logic');
