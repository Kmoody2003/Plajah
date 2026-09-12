import test from 'node:test';
import assert from 'node:assert/strict';
import { instantiateStyleEraDocument, TELA_STYLE_CATEGORIES, TELA_STYLE_ERAS } from '../services/telaStyleEraLibrary';

test('design-history atlas is broad, categorized, and historically described', () => {
  assert.ok(TELA_STYLE_ERAS.length >= 40);
  assert.equal(new Set(TELA_STYLE_ERAS.map(style => style.id)).size, TELA_STYLE_ERAS.length);
  for (const category of TELA_STYLE_CATEGORIES) assert.ok(TELA_STYLE_ERAS.some(style => style.category === category), category);
  for (const name of ['Gothic Cathedral','Art Deco','Punk DIY','Bauhaus','Afrofuturist Imagination']) {
    const entry = TELA_STYLE_ERAS.find(style => style.name === name);
    assert.ok(entry, name); assert.ok(entry!.period); assert.ok(entry!.region); assert.ok(entry!.museumPath);
  }
});

test('every historical style builds a substantial editable document', () => {
  for (const entry of TELA_STYLE_ERAS) {
    const objects = instantiateStyleEraDocument(entry);
    assert.ok(objects.length >= 10, entry.name);
    assert.ok(objects.every(object => ['TEXT','RECT','ELLIPSE','LINE','PATH','IMAGE'].includes(object.kind)));
    assert.ok(objects.some(object => object.objectLabel === 'Historical context'));
    assert.ok(objects.some(object => object.objectLabel === 'Museum path'));
  }
});

test('major movements have materially different geometry, not palette swaps', () => {
  const ids=['gothic','art-deco','art-nouveau','bauhaus','constructivist','de-stijl','swiss','psychedelic','punk','memphis','grunge','brutalist','vaporwave','y2k','solarpunk','islamic-geometry','ukiyoe'];
  const signatures=ids.map(id=>{
    const entry=TELA_STYLE_ERAS.find(style=>style.id===id)!;
    return instantiateStyleEraDocument(entry).map(({kind,x,y,w,h,rotation,strokeWidth})=>[kind,Math.round(x),Math.round(y),Math.round(w),Math.round(h),rotation,strokeWidth].join(':')).join('|');
  });
  assert.equal(new Set(signatures).size,ids.length);
});

test('image-led styles contain editable image regions with provenance or replacement guidance', () => {
  const ukiyoe=instantiateStyleEraDocument(TELA_STYLE_ERAS.find(style=>style.id==='ukiyoe')!);
  const artwork=ukiyoe.find(object=>object.kind==='IMAGE');
  assert.ok(artwork?.sourceImageSrc?.includes('metmuseum.org'));
  assert.match(artwork?.objectLabel||'',/CC0.*Hokusai.*Metropolitan/i);
  const punk=instantiateStyleEraDocument(TELA_STYLE_ERAS.find(style=>style.id==='punk')!);
  assert.ok(punk.some(object=>/image well/i.test(object.objectLabel||'')));
});

test('living cultural traditions carry use-context safeguards', () => {
  for (const id of ['afrofuturist','ukiyoe','islamic-geometry','mughal','mexican-modern','tropical-modern','indigenous-contemporary']) {
    assert.ok(TELA_STYLE_ERAS.find(style => style.id === id)?.culturalNote, id);
  }
});
