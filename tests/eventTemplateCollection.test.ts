import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EVENT_REVIEW_TEMPLATES, buildEventTemplateDocument, buildEventTemplateBundle } from '../services/tela/eventTemplateCollection';
import { objectToSvg } from '../services/tela/telaSvg';
import { measureText } from '../services/tela/telaText';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TelaEventTemplateArtwork from '../components/tela/TelaEventTemplateArtwork';

describe('event collection review masters',()=>{
 it('binds actual event fields, escapes external text, and removes fictional preview claims',()=>{
  const markup=renderToStaticMarkup(React.createElement(TelaEventTemplateArtwork,{templateId:EVENT_REVIEW_TEMPLATES[0].id,eventTitle:'Real <script>alert(1)</script> event',date:'1 MAY 2030',time:'8 PM',venue:'REAL HALL',mode:'print'}));
  assert.ok(markup.includes('REAL HALL'));
  assert.ok(markup.includes('1 MAY 2030'));
  assert.ok(!markup.includes('<script>'));
  assert.ok(!markup.includes('NOT VALID FOR ENTRY'));
  assert.ok(!markup.includes('SAMPLE CITY'));
  assert.equal(renderToStaticMarkup(React.createElement(TelaEventTemplateArtwork,{templateId:'unknown',eventTitle:'Unknown',date:'',time:'',venue:'',mode:'digital'})),'');
 });
 it('delivers the requested counts with independently constructed compositions',()=>{
  assert.equal(EVENT_REVIEW_TEMPLATES.filter(t=>t.kind==='ticket').length,12);
  assert.equal(EVENT_REVIEW_TEMPLATES.filter(t=>t.kind==='evite').length,24);
  assert.equal(new Set(EVENT_REVIEW_TEMPLATES.map(t=>t.id)).size,36);
  const geometry=new Set<string>();
  for(const t of EVENT_REVIEW_TEMPLATES){
   const objects=t.build();
   assert.equal(new Set(objects.map(o=>o.id)).size,objects.length,t.id);
   assert.ok(objects.every(o=>o.id.startsWith(t.id)),t.id);
   geometry.add(JSON.stringify(objects.filter(o=>o.kind!=='TEXT').map(o=>[o.kind,o.x,o.y,o.w,o.h,o.points])));
   for(const field of ['title','date','venue','sample'])assert.ok(objects.some(o=>o.id===`${t.id}-${field}`),`${t.id} ${field}`);
   for(const o of objects){assert.ok([o.x,o.y,o.w,o.h,o.opacity,o.rotation].every(Number.isFinite),o.id);assert.ok(!objectToSvg(o).includes('NaN'),o.id);if(o.kind==='TEXT')assert.ok(measureText(o.text||'',o)<=o.w,`overflow ${o.id}`);}
   for(const track of t.motion.tracks){assert.ok(objects.some(o=>o.id===track.objectId),track.objectId);assert.ok(track.duration>0);assert.ok(track.duration+track.delay<=t.motion.duration);assert.ok(!objects.find(o=>o.id===track.objectId)?.text,'motion must preserve reading');}
   assert.ok(t.motion.tracks.length>0,t.id);
   assert.ok(t.audio.notes.every(n=>n>=0&&n<=127));
  }
  assert.equal(geometry.size,36,'no composition may be a palette swap');
 });
 it('makes independent editable review copies and preserves companion motion/audio metadata',()=>{
  for(const t of EVENT_REVIEW_TEMPLATES){
   const a=buildEventTemplateDocument(t.id,'test'),b=buildEventTemplateDocument(t.id,'test');
   assert.notEqual(a.id,b.id);
   const device=Object.values(a.devices)[0];
   assert.equal(device.type,'VECTOR');
   if(device.type==='VECTOR'){device.objects[0].fill='#bad';assert.notEqual(t.build()[0].fill,'#bad');}
   const bundle=buildEventTemplateBundle(t.id,'test');
   assert.equal(bundle.status,'REVIEW');assert.deepEqual(bundle.motion,t.motion);
   bundle.audio.notes[0]=0;assert.notEqual(t.audio.notes[0],0);
  }
  assert.throws(()=>buildEventTemplateDocument('missing','test'),/Unknown/);
 });
});
