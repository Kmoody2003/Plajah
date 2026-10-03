import fs from 'node:fs';
import path from 'node:path';
import { EVENT_REVIEW_TEMPLATES, buildEventTemplateDocument } from '../services/tela/eventTemplateCollection';
import { REVIEW_PROMO_SUITES, PROMO_FORMATS } from '../services/chora/promoTypes';
import { createPromoRecipe } from '../services/chora/promoGeneratorService';
import { createPromoScene, promoTelaDocument, promoReviewMotion } from '../services/chora/promoPresets';
import { objectToSvg } from '../services/tela/telaSvg';
import type { TelaVectorObject } from '../types';

const out = path.resolve('public/template-review-assets');
fs.mkdirSync(out, { recursive: true });
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const svg = (objects: TelaVectorObject[], width:number,height:number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img">${objects.map(o => `<g data-layer="${esc(o.id)}">${objectToSvg(o)}</g>`).join('')}</svg>`;
const records:any[] = EVENT_REVIEW_TEMPLATES.map(t => {
  const doc = buildEventTemplateDocument(t.id, 'local-review');
  fs.writeFileSync(path.join(out, t.id + '.tela'), JSON.stringify({ ...doc, templatePreset: { schemaVersion:1, templateId:t.id, status:'review', motion:t.motion, audio:t.audio } }, null, 2));
  return { id:t.id,name:t.name,kind:t.kind,description:t.description,council:t.council,motion:t.motion,audio:t.audio,variants:[{name:'Design',svg:svg(t.build(),t.width,t.height)}] };
});
const cover='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#21163b"/><stop offset="1" stop-color="#db5e59"/></linearGradient></defs><path fill="url(#a)" d="M0 0h600v600H0z"/><circle cx="310" cy="250" r="165" fill="#f7c998"/><path fill="#362b52" d="M0 390 350 190 600 350v250H0z"/><path fill="#171628" d="M0 470 390 285 600 390v210H0z"/><text x="38" y="67" fill="#fff1d5" font-family="Georgia" font-size="35">AFTER THE LIGHT</text><text x="40" y="554" fill="#fff1d5" font-family="Arial" letter-spacing="8" font-size="18">MIRA SOL</text></svg>';
const release = { id:'review-release', title:'After the light', artist:'Mira Sol', coverImage:'data:image/svg+xml;base64,'+Buffer.from(cover).toString('base64'), tracks:[] };
const recipe = createPromoRecipe(release);
for(const t of REVIEW_PROMO_SUITES){
  const scenes = Object.keys(PROMO_FORMATS).map(format => createPromoScene(release,recipe,t.id,format as keyof typeof PROMO_FORMATS,'https://example.com/release/review'));
  const motion=promoReviewMotion(scenes[0]);
  fs.writeFileSync(path.join(out,t.id+'.tela'),JSON.stringify({...promoTelaDocument(release,scenes,t.id),templatePreset:{schemaVersion:1,templateId:t.id,status:'review',motion,audio:{notes:[48,55,60,64],tempo:80}}},null,2));
  records.push({id:t.id,name:t.name,kind:'promo',description:t.description,council:{lead:'Art + motion council',counterpoint:'Legibility',editor:'Conversion clarity',rationale:'Four composed formats. Plajah Chora remains the primary destination; sample artwork and link are for review.'},motion,audio:{notes:[48,55,60,64],tempo:80},variants:scenes.map(s=>({name:PROMO_FORMATS[s.format].label,svg:svg(s.objects,s.width,s.height),motion:promoReviewMotion(s)}))});
}
const shell = fs.readFileSync('scripts/templateReviewShell.html','utf8');
const html = shell.replace('/*__REVIEW_DATA__*/', JSON.stringify(records).replace(/</g,'\\u003c'));
fs.writeFileSync('public/template-review.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tela · The invitation collection</title>'+html+'</html>');
const inlinePath=process.argv[2];
if(inlinePath) { fs.mkdirSync(path.dirname(inlinePath),{recursive:true}); const compact=records.map(r=>({...r,variants:r.variants.slice(0,1)})); const fragment=shell.replace('/*__REVIEW_DATA__*/',JSON.stringify(compact).replace(/</g,'\\u003c')); if(Buffer.byteLength(fragment)>1000000)throw Error('Inline review exceeds 1MB'); fs.writeFileSync(inlinePath,fragment); }
console.log(`Built ${records.length} designs, ${records.reduce((n,r)=>n+r.variants.length,0)} artboards; ${Buffer.byteLength(html)} bytes.`);
