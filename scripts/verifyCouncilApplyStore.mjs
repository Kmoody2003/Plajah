import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/geminiService$/},()=>({path:'g',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`export const callGemini=async()=>'';`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {localAdvice} from './services/melos/council/musicCouncilService';
  import {saveSession,markUsed,leadCounts,listSessions,clearCouncilHistory} from './services/melos/council/musicCouncilStore';
  globalThis.C={localAdvice,saveSession,markUsed,leadCounts,listSessions,clearCouncilHistory};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const mem=new Map();
const ctx={console,Math,JSON,Object,Array,String,Number,Date,localStorage:{getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)}};
ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const C=ctx.C; C.clearCouncilHistory();
// apply actions in localAdvice
const del=C.localAdvice({ask:'too loud + harsh?',genre:'pop',platform:'Spotify'},{lufsIntegrated:-8,truePeakDb:-0.5,plr:9,tone:{sub:0.6,low:0.7,lowMid:0.55,mid:0.7,highMid:0.98,high:0.8}});
const allMoves=del.proposals.flatMap(p=>p.moves);
const loud=allMoves.find(m=>m.apply&&m.apply.kind==='loudness');
const eq=allMoves.find(m=>m.apply&&m.apply.kind==='eq');
console.log('loudness apply',JSON.stringify(loud.apply),'| eq apply',JSON.stringify(eq.apply));
assert.ok(loud&&loud.apply.trimDb<0,'over-loud → loudness trim negative');
assert.ok(eq&&eq.apply.freq===3500&&eq.apply.gainDb<0,'harsh presence → eq cut at 3500');
assert.ok(del.proposals.find(p=>p.personaId==='MASTER').moves[0].personaId==='MASTER','moves tagged with persona');
// store: save + markUsed → lead count
const s1=C.saveSession({ask:'q1',genre:'pop'},del);
assert.ok(s1.id&&s1.leadPersona,'session saved with lead');
assert.equal(C.listSessions().length,1,'one session');
C.markUsed(s1.id);
const counts=C.leadCounts();
console.log('lead counts',JSON.stringify(counts));
assert.equal(counts[s1.leadPersona],1,'markUsed increments the lead persona');
C.markUsed(s1.id); // idempotent
assert.equal(C.leadCounts()[s1.leadPersona],1,'markUsed idempotent');
console.log('PASS — council apply actions (eq/loudness) + persistence (save, markUsed lead counts, idempotent)');
