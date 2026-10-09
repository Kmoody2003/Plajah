// verifyMotionRoster — the Studio Roster behind the Motion Council: shape, coverage of guilds/eras,
// tensions written both ways, deterministic crew casting, and crew-aware localAdvice.
// Run: node scripts/verifyMotionRoster.mjs
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const memPlugin={name:'mem',setup(b){
  b.onResolve({filter:/geminiService$/},()=>({path:'g',namespace:'mem'}));
  b.onLoad({filter:/.*/,namespace:'mem'},()=>({contents:`export const callGemini=async()=>'';`,loader:'js'}));
}};
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as R from './services/motion/council/motionRoster';
  import {localAdvice,speakerName} from './services/motion/council/motionCouncilService';
  import {MOTION_PERSONA_IDS} from './services/motion/council/motionCouncilTypes';
  import {COUNCIL_DIRECTOR_IDS} from './services/council/councilTypes';
  globalThis.C={...R,localAdvice,speakerName,MOTION_PERSONA_IDS,COUNCIL_DIRECTOR_IDS};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const ctx={console,Math,JSON,Object,Array,String,Number,Set,Map};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const C=ctx.C;
const MEDIA=['title','lower-third','transition','mograph','vj-loop','background','logo-sting','character','vfx-shot','shader','generator'];
const EASES=['ease-out','ease-in','ease-in-out','overshoot','linear','anticipation'];

// ── shape ──
const ids=new Set();
for(const m of C.MOTION_ROSTER){
  assert.ok(!ids.has(m.id),`unique id ${m.id}`);ids.add(m.id);
  for(const k of ['name','background','lineage','ethos','protects','challenges','voice','texture']) assert.ok(typeof m[k]==='string'&&m[k].length>8,`${m.id}.${k}`);
  assert.ok(m.signature.length>=4,`${m.id} signature`);
  assert.ok(m.questions.length>=3&&m.researchBeats.length>=3,`${m.id} questions/research`);
  assert.ok(m.styles.length>=5,`${m.id} styles`);
  assert.ok(m.media.length>=2&&m.media.every(x=>MEDIA.includes(x)),`${m.id} media valid`);
  assert.ok(C.MOTION_PERSONA_IDS.includes(m.seat),`${m.id} seat is a council director`);
  assert.ok(C.COUNCIL_DIRECTOR_IDS.includes(m.artLens),`${m.id} artLens is an art council lens`);
  assert.ok(EASES.includes(m.timing.ease),`${m.id} ease preset`);
  assert.ok([1,2,3,'mixed'].includes(m.timing.on),`${m.id} stepping`);
  assert.ok(m.eras[0]<=m.eras[1]&&m.eras[0]>=1900&&m.eras[1]<=2020,`${m.id} eras`);
  if(m.guild==='WORLD') assert.ok(m.culturalNote,`${m.id} world member carries a cultural note`);
}
assert.ok(C.MOTION_ROSTER.length>=48,`roster size ${C.MOTION_ROSTER.length}`);

// ── coverage: every guild staffed, every seat & art lens used, eras from the 1910s to the 2020s ──
for(const g of C.ROSTER_GUILDS) assert.ok(C.rosterByGuild(g.id).length>=6,`guild ${g.id} has ≥6`);
for(const s of C.MOTION_PERSONA_IDS) assert.ok(C.MOTION_ROSTER.some(m=>m.seat===s),`seat ${s} used`);
for(const a of C.COUNCIL_DIRECTOR_IDS) assert.ok(C.MOTION_ROSTER.filter(m=>m.artLens===a).length>=3,`art lens ${a} used ≥3`);
const eras=C.eraFacets();
assert.equal(eras[0],1900,'earliest decade 1900s');assert.equal(eras[eras.length-1],2020,'latest 2020s');
for(let d=1900;d<=2020;d+=10) assert.ok(C.rosterByEra(d).length>=(d<1920?1:3),`members alive in the ${d}s`);

// ── tensions both ways, between real members ──
for(const [a,b,as,bs] of C.ROSTER_TENSIONS){
  assert.ok(ids.has(a)&&ids.has(b)&&a!==b,`tension ${a}/${b} ids`);
  assert.ok(as.length>20&&bs.length>20,`tension ${a}/${b} written both ways`);
  assert.ok(C.rosterTension(a,b).includes(as)&&C.rosterTension(b,a).includes(bs),`rosterTension ${a}/${b} directional`);
}
assert.ok(C.ROSTER_TENSIONS.length>=20,'≥20 standing arguments');

// ── search & casting ──
assert.equal(C.searchRoster('claymation')[0].id,'CLAY','search claymation');
assert.equal(C.searchRoster('papel picado')[0].id,'FOLK_GRAPHIC','search papel picado');
const anime=C.castCrew({ask:'an anime fight scene with huge impacts',medium:'character'});
assert.equal(anime[0].id,'SAKUGA','anime fight → sakuga leads');
assert.equal(anime.length,4,'default crew of 4');
assert.ok(anime.filter(m=>m.guild==='ANIME').length<=2,'guild cap without explicit guild');
assert.ok(C.crewTensions(anime.map(m=>m.id)).length>=1,'crew carries a standing argument');
const animeOnly=C.castCrew({ask:'anything',guilds:['ANIME'],size:5});
assert.ok(animeOnly.every(m=>m.guild==='ANIME'),'guild filter → all anime');
const retro=C.castCrew({ask:'logo reveal',medium:'logo-sting',era:1985,size:3});
assert.ok(retro.some(m=>m.id==='CHROME_80S'),'1985 logo sting casts the chrome designer');
const pinned=C.castCrew({ask:'ink wash title',pinned:['PIXEL_ART'],size:3});
assert.equal(pinned[0].id,'PIXEL_ART','pinned member leads');
assert.ok(pinned.some(m=>m.id==='INK_WASH'),'ink wash cast from ask');
assert.deepEqual(C.castCrew({ask:'a 1930s jazz cartoon',size:4}).map(m=>m.id),C.castCrew({ask:'a 1930s jazz cartoon',size:4}).map(m=>m.id),'deterministic');
assert.equal(C.castCrew({ask:'a 1930s jazz cartoon',size:4})[0].id,'RUBBER_HOSE','1930s jazz cartoon → rubber hose');

// ── crew-aware localAdvice ──
const crew=['SAKUGA','PASTORAL','SATSUEI'];
const d=C.localAdvice({ask:'how should the hero land?',medium:'character',crew},{fps:24,tempo:120,delivery:'cinema'});
assert.deepEqual([...d.crew],crew,'deliberation records crew');
assert.ok(crew.every(id=>d.proposals.some(p=>p.personaId===id)),'every crew member proposes');
assert.ok(d.intro.includes('the Sakuga Key Animator'),'intro names the crew');
const sak=d.proposals.find(p=>p.personaId==='SAKUGA');
assert.ok(sak.moves.some(m=>m.apply&&m.apply.kind==='stepping'),'crew timing is one-click (stepping)');
assert.ok(sak.moves.some(m=>m.apply&&m.apply.kind==='ease'&&m.apply.preset==='anticipation'),'crew ease is one-click');
assert.ok(d.tensions.some(t=>t.includes('Pastoral Naturalist')&&t.includes('Sakuga')),'crew tension surfaced');
assert.ok(d.plan[0].text.startsWith('Lead, The Sakuga Key Animator'),'plan leads with the crew lead');
assert.ok(d.plan.some(m=>m.where==='counterpoint'&&m.personaId==='PASTORAL'),'counterpoint is the rival');
assert.ok(d.plan.some(m=>m.apply&&m.apply.kind==='shutter'),'editor: spec-anchored council move still in the plan');
const p2=C.localAdvice({ask:'x',crew:['PASTORAL']},{fps:30}).proposals[0];
assert.ok(p2.moves[0].text.includes('on twos')&&p2.moves[0].text.includes('30 fps'),'on twos delivered at a different fps');
const w=C.localAdvice({ask:'x',crew:['AFRO_PATTERN']},{}).proposals[0];
assert.ok(w.moves.some(m=>m.where==='collaboration'),'cultural note surfaces as a move');
assert.equal(C.speakerName('INK_WASH'),'The Ink-Wash Animator','speakerName roster');
assert.equal(C.speakerName('KINETIC'),'The Kinetic Typographer','speakerName council');
// no crew → unchanged behaviour
const plain=C.localAdvice({ask:'how should this logo enter?',medium:'logo-sting'},{fps:30,tempo:120,delivery:'web'});
assert.ok(plain.intro.startsWith('I took this to the room — kinetic'),'no-crew intro unchanged');
assert.equal(plain.crew.length,0,'no crew');

console.log(`✓ motion roster: ${C.MOTION_ROSTER.length} members · ${C.ROSTER_GUILDS.length} guilds · ${eras.length} decades · ${C.ROSTER_TENSIONS.length} tensions · casting + crew advice OK`);
// search precision: multi-word queries keep only members matching every word
assert.equal(JSON.stringify(C.searchRoster('ink wash').map(m=>m.id)),'["INK_WASH"]','ink wash → only ink wash');
assert.ok(C.searchRoster('stop motion').length>=3&&C.searchRoster('stop motion').every(m=>m.styles.join(' ').includes('stop motion')||m.guild==='STOP_MOTION'||/stop/.test(m.lineage+m.background)),'stop motion search');
assert.ok(C.searchRoster('1980s').length>=5,'era search');
console.log('✓ search precision');

// ── host apply translation (services/motion/council/motionApply) ──
const r2=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as A from './services/motion/council/motionApply';
  import {localAdvice} from './services/motion/council/motionCouncilService';
  globalThis.A={...A,localAdvice};`},bundle:true,write:false,format:'iife',plugins:[memPlugin]});
const ctx2={console,Math,JSON,Object,Array,String,Number,Set,Map};ctx2.globalThis=ctx2;runInNewContext(r2.outputFiles[0].text,ctx2);
const A=ctx2.A;
assert.equal(A.easeToKeyframe('ease-in-out'),'smooth');assert.equal(A.easeToKeyframe('overshoot'),'out');assert.equal(A.easeToKeyframe('anticipation'),'in');
const kf={x:[{t:0,v:0,ease:'linear'},{t:1,v:24,ease:'linear'}],op:[{t:0,v:1,ease:'hold'},{t:.5,v:0}]};
const eased=A.setKeyframeEase(kf,'out');
assert.equal(eased.x[0].ease,'out');assert.equal(eased.op[0].ease,'hold','hold keys stay held');assert.equal(kf.x[0].ease,'linear','input not mutated');
const st=A.stepKeyframes(kf,2,24);
assert.equal(st.x.length,13,'1s on twos at 24 fps → 12 steps + final key');
assert.ok(st.x.slice(0,-1).every(k=>k.ease==='hold'),'stepped keys hold');
assert.ok(Math.abs(st.x[1].t-2/24)<1e-6&&Math.abs(st.x[1].v-2)<1e-3,'second step at frame 2 with the linear value');
assert.equal(st.x[12].t,1);assert.equal(st.x[12].v,24,'last key exact');
assert.equal(A.stepKeyframes({x:[{t:0,v:1}]},2,24).x.length,1,'single key untouched');
assert.ok(A.hasAnyKeyframes(kf)&&!A.hasAnyKeyframes({})&&!A.hasAnyKeyframes(undefined));
const bg=A.beatGridTimes(120,4);assert.equal(bg.length,9,'120 BPM over 4s → beats 0..4s');assert.equal(bg[1],0.5);
assert.equal(A.beatGridTimes(120,4,8).length,17,'eighths');
const long=A.beatGridTimes(120,600);assert.ok(long.length<=400&&Math.abs(long[1]-2)<1e-9,'dense grid falls back to bars');
const merged=A.mergeMarkerTimes([{id:'a',t:0.5}],[0,0.5,1],24,t=>({id:'n',t}));
assert.equal(merged.length,3,'no duplicate marker at 0.5');assert.equal(merged[0].t,0,'sorted');
assert.equal(A.nearestFps(24,[23.976,24,25,29.97,30]),24);assert.equal(A.nearestFps(48,[23.976,24,25,29.97,30,50,59.94,60]),50);
assert.equal(A.pixelsTargetFrameRate(24),30);assert.equal(A.pixelsTargetFrameRate(60),60);
assert.equal(A.deliveryFor(24,'2.39:1'),'cinema');assert.equal(A.deliveryFor(30,'9:16'),'social-vertical');assert.equal(A.deliveryFor(60),'web');
// every host-supported kind is actually emitted by the council somewhere
const del2=A.localAdvice({ask:'set',medium:'vj-loop',crew:['PASTORAL']},{delivery:'led-wall',fps:60,tempo:128});
const kinds=new Set(del2.proposals.flatMap(p=>p.moves.map(m=>m.apply&&m.apply.kind).filter(Boolean)));
for(const k of A.PIXELS_APPLY_KINDS) assert.ok(kinds.has(k),`council emits Pixels kind ${k}`);
const del3=A.localAdvice({ask:'title',medium:'title',crew:['SAKUGA']},{delivery:'cinema',fps:24,tempo:120});
const kinds3=new Set(del3.proposals.flatMap(p=>p.moves.map(m=>m.apply&&m.apply.kind).filter(Boolean)));
for(const k of ['fps','beatGrid','ease','stepping']) assert.ok(kinds3.has(k),`council emits Fabula kind ${k}`);
console.log('✓ host apply translation (Fabula + Pixels)');
