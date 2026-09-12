import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/geminiService$/},()=>({path:'g',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`export const callGemini=async()=>'';`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {localAdvice} from './services/melos/council/musicCouncilService';
  import {knowledgeGrounding,loudnessTarget,genreProfile,techniquesFor} from './services/melos/council/musicKnowledge';
  globalThis.C={localAdvice,knowledgeGrounding,loudnessTarget,genreProfile,techniquesFor};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const ctx={console,Math,JSON,Object,Array,String,Number};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const C=ctx.C;
// knowledge
assert.equal(C.loudnessTarget('Spotify').lufs,-14,'spotify -14');
assert.ok(C.genreProfile('edm').lufs[0]===-9,'edm norm');
assert.ok(C.knowledgeGrounding('edm','Spotify').includes('-14 LUFS'),'grounding cites target');
assert.ok(C.techniquesFor('muddy').length>=1,'technique lookup');
// localAdvice: too loud + true-peak over + tonal imbalance
const del=C.localAdvice({ask:'why does my mix sound harsh and small?',genre:'pop',platform:'Spotify'},{
  lufsIntegrated:-8, truePeakDb:0.4, plr:5, corr:-0.1,
  tone:{sub:0.6,low:0.7,lowMid:0.55,mid:0.7,highMid:0.98,high:0.8} // highMid way over (harsh)
});
const master=del.proposals.find(p=>p.personaId==='MASTER');
const mix=del.proposals.find(p=>p.personaId==='MIX');
console.log('MASTER moves:',master.moves.map(m=>m.text.slice(0,40)));
console.log('MIX moves:',mix.moves.map(m=>m.where+': '+m.text.slice(0,30)));
assert.ok(master.moves.some(m=>/over the Spotify target/.test(m.text)),'master flags too-loud');
assert.ok(master.moves.some(m=>/dBTP exceeds/.test(m.text)),'master flags true-peak over');
assert.ok(mix.moves.some(m=>/Too much presence/.test(m.text)),'mix flags harsh presence');
assert.ok(mix.moves.some(m=>/phase|mono/.test(m.text)),'mix flags negative correlation');
assert.equal(del.proposals.length,5,'all 5 personas present');
assert.ok(del.grounded===true && del.plan.length>0,'grounded + has a plan');
// no measurements → not grounded, points to Meter Bridge
const bare=C.localAdvice({ask:'make it better'});
assert.equal(bare.grounded,false,'no measurements → not grounded');
assert.ok(bare.plan[0].text.includes('Meter Bridge'),'bare → route through Meter Bridge');
console.log('PASS — music council: knowledge base + deterministic localAdvice (loudness/peak/tonal/phase, 5 personas)');
