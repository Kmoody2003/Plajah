// verifyMotionBuild — the Motion Council BUILDS: grammar ids are real Fabula catalog ids, every roster member can
// build, options are beat-timed and well-formed, and recipes become real Fabula clips through the Forge factories.
// Run: node scripts/verifyMotionBuild.mjs
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/geminiService$/},()=>({path:'g',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`export const callGemini=async()=>{throw new Error('offline')};`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as B from './services/motion/council/motionBuild';
  import * as MT from './services/motion/council/motionTemplates';
  import {BUILD_GRAMMAR,DIRECTOR_GRAMMAR} from './services/motion/council/motionBuildGrammar';
  import {MOTION_ROSTER} from './services/motion/council/motionRoster';
  import {FX_EFFECTS} from './components/plajahPixels/engine/fx/effects';
  import {FORGE_TRANSITIONS,createForgeTransition} from './services/fabula/forgeTransitions';
  import {FORGE_LOOKS,instantiateLook} from './services/fabula/forgeLooks';
  import {createEffectInstance} from './services/fabula/forgeEffects';
  import {LOWER_THIRDS} from './services/fabula/lowerThirdRegistry';
  import {FABULA_BROADCAST_PACKS} from './services/fabula/broadcastPacks';
  globalThis.T={...B,MT,BUILD_GRAMMAR,DIRECTOR_GRAMMAR,MOTION_ROSTER,LOWER_THIRDS,PACKS:FABULA_BROADCAST_PACKS,
    FX:FX_EFFECTS.map(e=>e.id),TR:FORGE_TRANSITIONS.map(t=>t.id),LOOKS:FORGE_LOOKS.map(l=>l.id),
    deps:{uid:(()=>{let n=0;return()=>'u'+(++n)})(),mkEffect:createEffectInstance,mkTransition:createForgeTransition,lookStack:(id)=>{const l=FORGE_LOOKS.find(x=>x.id===id);return l?instantiateLook(l):[]}}};`},bundle:true,write:false,format:'iife',plugins:[memPlugin],logLevel:'error'});
const mem={};
const ctx={console,Math,JSON,Object,Array,String,Number,Set,Map,Float32Array,Uint8Array,Error,Date,
  localStorage:{getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]}}};
ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const T=ctx.T; const J=x=>JSON.parse(JSON.stringify(x));
const cat={effects:T.FX,transitions:T.TR,looks:T.LOOKS};

// ── grammar: every member + director can build, every id is a real catalog id ──
for(const m of T.MOTION_ROSTER) assert.ok(T.BUILD_GRAMMAR[m.id],`grammar for ${m.id}`);
const allG={...T.BUILD_GRAMMAR,...T.DIRECTOR_GRAMMAR};
for(const [id,g] of Object.entries(allG)){
  for(const e of g.effects) assert.ok(T.FX.includes(e),`${id}: effect ${e} exists`);
  assert.ok(g.trans==='cut'||T.TR.includes(g.trans),`${id}: transition ${g.trans} exists`);
  if(g.look) assert.ok(T.LOOKS.includes(g.look),`${id}: look ${g.look} exists`);
}
const distinct=new Set(Object.values(T.BUILD_GRAMMAR).map(g=>JSON.stringify([g.pace,g.move,g.look,g.effects,g.trans,g.title])));
assert.equal(distinct.size,Object.keys(T.BUILD_GRAMMAR).length,'every roster member builds differently');

// ── parsing ──
assert.equal(T.parseTitleText('an opener for "NIGHT MARKET" with the clips'),'NIGHT MARKET');
assert.equal(T.parseTitleText('title: Summer Tour 2026, punchy'),'Summer Tour 2026');
assert.equal(T.parseTargetSec('a 15 second promo',120),15);assert.equal(T.parseTargetSec('8 bars',120),16);assert.equal(T.parseTargetSec('1 minute',120),60);

// ── assembling ──
const assets=[{id:'v1',name:'Crowd',type:'video',duration:20},{id:'i1',name:'Poster',type:'image'},{id:'v2',name:'Stage',type:'video',duration:3}];
const brief={ask:'a 16 second anime fight opener "NEON RONIN"',assets,fps:24,tempo:120};
const opts=T.localBuildOptions(brief);
assert.equal(opts.length,3,'three options');
assert.equal(new Set(opts.map(o=>o.leadId)).size,3,'three different leads');
assert.equal(opts[0].leadId,'SAKUGA','anime fight → Sakuga leads');
for(const o of opts){
  const R=o.recipe, pics=R.clips.filter(c=>c.role==='picture');
  assert.equal(R.duration,16,`${o.leadId}: 16s (whole bars)`);
  assert.ok(pics.length>=2,`${o.leadId}: cuts`);
  let t=0; for(const c of pics){ assert.ok(Math.abs(c.start-t)<1e-3,`${o.leadId}: contiguous cuts`); t+=c.duration; assert.ok(c.duration>=0.34-1e-9,'no cut under 0.34s'); assert.ok(Math.abs(c.start*24-Math.round(c.start*24))<1e-3,'cut on a frame'); }
  assert.ok(Math.abs(t-R.duration)<1e-3,`${o.leadId}: cuts fill the build`);
  const title=R.clips.find(c=>c.role==='title'); assert.ok(title&&title.title.text==='NEON RONIN',`${o.leadId}: title from the quote`);
  assert.ok(R.markers.length===9&&R.markers[1]===2,'bar markers at 120 BPM');
  assert.ok(pics.filter(c=>c.counterpoint).length<=1,'counterpoint used at most once');
  assert.ok(o.summary.length>=4&&o.rationale.length>20,'summary + rationale');
  const audio=R.clips.filter(c=>c.role==='sourceAudio'); assert.ok(audio.every(a=>assets.filter(x=>x.type!=='audio')[a.slot].type==='video'),'source audio only under video cuts');
}
const sak=opts[0], sakPics=sak.recipe.clips.filter(c=>c.role==='picture');
assert.ok(sakPics.every(c=>Math.abs(c.duration-1)<1e-3),'Sakuga cuts every 2 beats = 1s at 120');
assert.ok(sakPics.some(c=>c.counterpoint),'Sakuga gets its rival once');
const crowd=sakPics.filter(c=>c.slot===0).map(c=>c.srcIn); assert.ok(crowd[1]>crowd[0],'video in-point advances on reuse');
// on-twos member → stepped (hold) keys
const clay=T.assembleOption({ask:'x',assets,fps:24,tempo:120},'CLAY',undefined);
const ck=clay.recipe.clips.find(c=>c.role==='picture');
assert.ok(Object.values(ck.kf).every(tr=>tr.slice(0,-1).every(k=>k.ease==='hold')),'Clay (on twos) keys are held');
const sk=T.assembleOption({ask:'x',assets,fps:24,tempo:120},'SAKUGA',undefined); assert.ok(sk.recipe.clips.find(c=>c.role==='picture').kf.sc,'snap move keyframes scale');
// music bed sets the length; no source audio when a bed exists
const withMusic=T.assembleOption({ask:'promo',assets:[...assets,{id:'a1',name:'Beat',type:'audio',duration:9}],fps:30,tempo:100},'PASTORAL','SAKUGA');
assert.ok(withMusic.recipe.clips.some(c=>c.role==='music'),'music bed');
assert.ok(!withMusic.recipe.clips.some(c=>c.role==='sourceAudio'),'no source audio under a bed');
assert.ok(Math.abs(withMusic.recipe.duration-9.6)<1e-3,'9s bed → 4 bars at 100 BPM (9.6s)');
// polyrhythm pattern
const afro=T.assembleOption({ask:'x',assets,fps:24,tempo:120,targetSec:16},'AFRO_PATTERN',undefined).recipe.clips.filter(c=>c.role==='picture').map(c=>c.duration);
assert.equal(J(afro.slice(0,3)).join(','),'1.5,1.5,1','3-3-2 pattern');
// structural / pixilation floor
const pix=T.assembleOption({ask:'x',assets,fps:24,tempo:200},'STRUCTURAL',undefined).recipe.clips.filter(c=>c.role==='picture');
assert.ok(pix.every(c=>c.duration>=0.34-1e-9),'≤3 cuts a second even at 200 BPM');
// lower third placement
const lt=T.assembleOption({ask:'lower third for "Dr. Ada Obi"',assets,fps:30,tempo:120},'EXPLAINER',undefined).recipe.clips.find(c=>c.role==='title');
assert.ok(lt.title.ty===82&&lt.start===2,'lower third sits low and enters on bar 2');
// no visuals → no options
assert.equal(T.localBuildOptions({ask:'x',assets:[{id:'a',name:'a',type:'audio'}],fps:24}).length,0);
// explicit crew + count
assert.equal(J(T.localBuildOptions({...brief,crew:['INK_WASH','CHROME_80S'],optionCount:2}).map(o=>o.leadId)).join(),'INK_WASH,CHROME_80S');

// ── model choices are validated ──
const s=T.sanitizeOverrides({pace:[3,3,2],move:'teleport',look:'not-a-look',effects:['cineglow','fake'],trans:'whip',title:'dropIn',titleText:'  Hi  '},cat);
assert.equal(J(s.pace).join(),'3,3,2');assert.ok(!s.move,'bad move dropped');assert.ok(!('look' in s),'bad look dropped');
assert.equal(J(s.effects).join(),'cineglow');assert.equal(s.trans,'whip');assert.equal(s.titleText,'Hi');
assert.equal(T.sanitizeOverrides({pace:99},cat).pace,undefined,'absurd pace dropped');
// planBuild falls back to local when the model is down
const planned=await T.planBuild(brief,cat); assert.equal(planned.length,3);assert.equal(planned[0].source,'local');

// ── recipe → Fabula clips with the real Forge factories ──
const fab=T.recipeToFabulaClips(sak.recipe,assets.filter(a=>a.type!=='audio'),[],10,{picture:'v1',overlay:'v2',music:'a1',sourceAudio:'a2'},T.deps,'b1');
const fpics=fab.filter(c=>c.trackId==='v1');
assert.equal(fpics.length,sakPics.length,'one Fabula clip per cut');
assert.ok(fpics.every(c=>c.start>=10&&c.councilBuild==='b1'&&c.kind==='media'),'placed at 10s, tagged with the build');
assert.ok(fpics[0].fx.stack.length>=2&&fpics[0].fx.stack.every(i=>i.effectId&&i.params),'look + effects instantiated as Forge stack');
assert.ok(fpics.some(c=>c.trans&&c.trans.type==='forge'&&c.trans.forgeId==='camera-shake'),'Forge transition instantiated');
assert.ok(fab.find(c=>c.kind==='title'&&c.trackId==='v2'&&c.tAnim.type==='dropIn'),'title clip with animation');
const a2=fab.filter(c=>c.trackId==='a2'); assert.ok(a2.length&&a2.every(c=>fpics.some(p=>p.linkId===c.linkId&&p.av)),'source audio linked to picture');
assert.equal(new Set(fab.map(c=>c.id)).size,fab.length,'unique clip ids');
const ids=T.recipeIds(sak.recipe); assert.ok(ids.effects.every(e=>T.FX.includes(e))&&ids.looks.every(l=>T.LOOKS.includes(l)));
console.log(`✓ motion build: ${Object.keys(T.BUILD_GRAMMAR).length}+${Object.keys(T.DIRECTOR_GRAMMAR).length} grammars valid · options beat-timed · recipes → Fabula clips via Forge factories`);

// ── recipe templates (motionTemplates) ──
const MT=T.MT;
const lib=MT.councilRecipeTemplates();
assert.equal(lib.length,T.MOTION_ROSTER.length+6,'one built-in recipe per roster member + director');
assert.ok(lib.every(t=>t.origin==='council'&&t.council.lead&&t.council.editor&&t.tags.length),'built-ins carry council attribution + tags');
const saved=MT.templateFromOption(sak,'Neon Ronin opener',brief);
assert.equal(saved.leadId,'SAKUGA');assert.equal(saved.counterId,sak.counterId);assert.ok(saved.council.counterpoint.startsWith('The '),'counterpoint named');assert.equal(saved.origin,'user');
MT.saveRecipeTemplate(saved);
assert.ok(MT.listSavedRecipeTemplates().some(t=>t.id===saved.id),'saved to the user library');
const rebuilt=MT.buildFromTemplate(saved,{ask:'reuse it',assets:[{id:'x',name:'New clip',type:'video',duration:30}],fps:30,tempo:90});
assert.equal(rebuilt.leadId,'SAKUGA');assert.ok(rebuilt.recipe.clips.filter(c=>c.role==='picture').every(c=>c.slot===0),'rebuilt on new assets');
assert.equal(rebuilt.recipe.clips.find(c=>c.role==='title').title.text,'NEON RONIN','template keeps its title text');
MT.deleteRecipeTemplate(saved.id); assert.ok(!MT.listSavedRecipeTemplates().some(t=>t.id===saved.id),'deleted');
assert.ok(MT.searchRecipeTemplates('claymation')[0].leadId==='CLAY','search the recipe library');
console.log('✓ recipe templates: built-in council library, save / rebuild / delete');

// ── council direction for platform templates ──
const dir=MT.platformTemplateDirections(T.LOWER_THIRDS,T.PACKS);
assert.equal(dir.length,T.LOWER_THIRDS.length+T.PACKS.length,'every lower third + broadcast pack directed');
for(const d of dir){
  assert.ok(T.BUILD_GRAMMAR[d.lead]||T.DIRECTOR_GRAMMAR[d.lead],`${d.templateId}: lead can build`);
  assert.ok(d.editor&&d.timing&&d.timing.ease&&d.notes.length>=2,`${d.templateId}: direction complete`);
  assert.notEqual(d.lead,d.counterpoint,`${d.templateId}: counterpoint is someone else`);
}
const y2k=dir.find(d=>d.templateId==='lt-y2k'); if(y2k) assert.equal(y2k.lead,'Y2K','the Y2K lower third is led by the Y2K Futurist');
const afroLt=dir.find(d=>d.templateId==='lt-afrofuturist'); if(afroLt) assert.equal(afroLt.lead,'AFRO_PATTERN','afrofuturist lower third → Afrofuturist Pattern Animator');
const leads=new Set(dir.map(d=>d.lead)); assert.ok(leads.size>=20,`direction spreads across the roster (${leads.size} leads)`);
console.log(`✓ platform template direction: ${dir.length} templates, ${leads.size} different leads`);
