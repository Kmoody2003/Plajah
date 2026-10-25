import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {GoogleGenAI} from '@google/genai';
import {createCouncil,type CouncilStore} from '../../services/council/councilRoutes';
import type {CouncilBrief} from '../../services/council/councilTypes';
const output='docs/kith-party/council';mkdirSync(output,{recursive:true});
for(const line of readFileSync('.env.local','utf8').split(/\r?\n/)){const m=/^(ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_AI_API_KEY|COUNCIL_GEMINI_MODEL|COUNCIL_CLAUDE_MODEL)=(.*)$/.exec(line);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^"|"$/g,'');}
// Match the platform's Claude deliberation lane. Gemini is an explicit fallback,
// never an automatic transfer of private references after a provider failure.
const lane=process.env.COUNCIL_LANE||'gemini'; // Gemini by default since 2026-10-25 (cost)
if(!['claude','gemini'].includes(lane))throw new Error('COUNCIL_LANE must be claude or gemini.');
const key=lane==='claude'?process.env.ANTHROPIC_API_KEY:process.env.GEMINI_API_KEY||process.env.GOOGLE_AI_API_KEY;
if(!key)throw new Error(`Council ${lane} credential is not configured.`);
const genai=lane==='gemini'?new GoogleGenAI({apiKey:key}):null;
const dbFile=path.join(output,'local-review-store.json');const db:Record<string,any>=existsSync(dbFile)?JSON.parse(readFileSync(dbFile,'utf8')):{};
const store:CouncilStore={get:async key=>db[key]||null,set:async(key,value)=>{db[key]=value;writeFileSync(dbFile,JSON.stringify(db,null,2));return true;},list:async key=>Object.entries(db).filter(([k])=>k.startsWith(key+'/')).map(([,v])=>v)};
const images=['artifacts/kith-party/v2/species-desktop.png','docs/kaiju-fidelity/reference_labs_two_shot.png'].map(p=>({inlineData:{mimeType:'image/png',data:readFileSync(p).toString('base64')}}));
let requests=0;
async function model(system:string,user:string,maxTokens=2400){
 const id=++requests;console.log(`Council model call ${id} started`);
 for(let attempt=0;attempt<3;attempt++){
  try {
   let text:string;
   if(lane==='claude'){
    const response=await fetch('https://api.anthropic.com/v1/messages',{
     method:'POST',headers:{'Content-Type':'application/json','x-api-key':key!,'anthropic-version':'2023-06-01'},
     body:JSON.stringify({model:process.env.COUNCIL_CLAUDE_MODEL||'claude-sonnet-4-6',max_tokens:Math.max(8192,maxTokens),temperature:.8,system,messages:[{role:'user',content:[...images.map(image=>({type:'image',source:{type:'base64',media_type:image.inlineData.mimeType,data:image.inlineData.data}})),{type:'text',text:user}]}]}),signal:AbortSignal.timeout(90000)
    });
    if(!response.ok)throw new Error(`Anthropic returned HTTP ${response.status}; no automatic provider fallback.`);
    const data=await response.json();text=(data.content||[]).filter((block:any)=>block.type==='text').map((block:any)=>block.text).join('\n');
   }else{
    const r=await genai!.models.generateContent({model:process.env.COUNCIL_GEMINI_MODEL||'gemini-3.5-flash',contents:[{role:'user',parts:[{text:user},...images]}],config:{systemInstruction:system,maxOutputTokens:Math.max(8192,maxTokens*3),temperature:.8,httpOptions:{timeout:90000}}});text=r.text||'';
   }
   writeFileSync(path.join(output,`response-${id}.txt`),text);console.log(`Council ${lane} call ${id} complete`);return text;
  }
  catch(e){if(attempt===2)throw new Error(`Council model request ${id} failed after retries (${e instanceof Error?e.name:'provider error'}).`);await new Promise(r=>setTimeout(r,2000*(attempt+1)));}
 }
 return '';
}
const brief:CouncilBrief={
 ask:'Art-direct the EIGHT NEW Kith Party creatures as a collectible original creature roster. The user says FENN, MOKI, ZIPPI, PIPPA are GOOD FOUNDATIONS requiring REFINEMENT; NORI, BRAM, LUMA, TAVI need TOTAL REDESIGNS because some are blobs. RELLO and CHORA ARE PERFECT: absolutely NO changes to their design, colors, forms or assets. Critique the attached current roster and canonical mascot reference. Specify anatomy, silhouette, expressive face, proportions, intentional negative space, species and elemental TYPE for EACH of the eight, and the restrained material/detail signature that makes them production quality. For the rejected four propose genuinely new animal/creature archetypes, not retouching a ray, rock oval, droplet ghost or armored oval. Make eight recognizably different original beings that still belong with Rello and Chora. The inspiration is creature-roster diversity, never copying Pokemon characters. The keep-four must stay recognizable. In your geometry/imageLogic/motion fields cover all eight by name. Aria synthesis must make eight concrete implementation decisions, with refinement versus redesign explicit.',
 surface:'Kith Party roster portraits, small gameplay sprites, and fully 3D kart drivers',domain:'creature character design',audience:'Plajah players, families, fans collecting favorite Kith',feeling:'Mischievous, premium creature-toy personality, not generic cute blobs',
 constraints:['Rello and Chora are immutable reference anchors. Do not redesign them.','Preserve the seed concepts of Fenn (snow gryphon), Moki (antler sprout), Zippi (electric hare), Pippa (petal moth); refine their construction.','Nori, Bram, Luma, Tavi: total redesign, with new readable species/body plans and distinct faces. Keep names. Types may be revised if supported by clear design logic.','Shared world: soft sculptural volumes, pale face openings, expressive dark eyes with angular brow/patch language, selective colored fins/crests, saturated palettes and controlled speckle material. These are lineage cues, not mandatory identical bodies.','Design must read in silhouette at 64px, in a 150px roster card, and from behind a kart. Limbs must attach plausibly; wings must have roots; horns grow from skull; every tail has an anatomical origin.','Do not present raw ellipses, featureless blobs, decorative icon symbols instead of anatomy, or arbitrary piles of geometric shapes as finished art.','Game implementation may use generated original raster portraits and authored 3D forms. No commissioned physical production.','Each response should make concrete buildable choices. No endless alternatives or request for further approval.'],
 references:['Image 1 is the existing roster: names label each portrait. The user has reviewed it.','Image 2 is the canonical Rello/Chora material and expression reference, preserved exactly.']
};
writeFileSync(path.join(output,'brief.json'),JSON.stringify(brief,null,2));
const council=createCouncil({authMiddleware:null,apiLimiter:null,firestoreAuthHeaders:async()=>({}),store,model});
const result=await council.deliberate('kith-party-local-review',brief,{depth:'FULL'});
writeFileSync(path.join(output,'deliberation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({status:result.status,proposals:result.proposals.length,disputes:result.disputes.length,lead:result.synthesis?.lead,error:result.error}));
if(result.status!=='DONE')process.exitCode=1;
