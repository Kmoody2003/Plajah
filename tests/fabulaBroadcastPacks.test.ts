import assert from 'node:assert/strict';
import test from 'node:test';
import { FABULA_BROADCAST_PACKS, FABULA_COUNTERCULTURE_PACKS, FABULA_GLOBAL_PACKS, FABULA_IMAGE_MATTE_PACKS, FABULA_SPORTS_PACKS } from '../services/fabula/broadcastPacks';
import { systemBoardSvg } from '../services/fabula/systemBoardSvg';
import { FABULA_BROADCAST_TEMPLATES, renderBroadcastTemplateSvg, motifFor } from '../services/fabula/broadcastTemplateFactory';
import { DATA_VIZ_ART_DIRECTIONS } from '../services/fabula/dataVizArtDirection';

test('broadcast expansion has complete, distinct production stacks',()=>{
  assert.equal(FABULA_SPORTS_PACKS.length,18);
  assert.equal(FABULA_IMAGE_MATTE_PACKS.length,18);
  assert.equal(FABULA_COUNTERCULTURE_PACKS.length,18);
  assert.equal(FABULA_GLOBAL_PACKS.length,20);
  assert.equal(new Set(FABULA_BROADCAST_PACKS.map(pack=>pack.id)).size,FABULA_BROADCAST_PACKS.length);
  for(const pack of FABULA_BROADCAST_PACKS){
    assert.equal(pack.assets.length,9,`${pack.name} is missing part of its broadcast stack`);
    assert.ok(pack.motionGrammar.length>20);
    assert.ok(pack.typography.length>10);
  }
});

test('living Indigenous systems require named collaboration and permission',()=>{
  const living=FABULA_GLOBAL_PACKS.filter(pack=>pack.tags.includes('indigenous'));
  assert.ok(living.length>=2);
  for(const pack of living){assert.equal(pack.collaborationRequired,true);assert.match(pack.guardrail||'',/permission|authorization/i);}
});

test('every identity generates its own authored SVG board',()=>{
  const boards=FABULA_BROADCAST_PACKS.map(systemBoardSvg);
  assert.equal(new Set(boards).size,FABULA_BROADCAST_PACKS.length);
  for(const [i,board] of boards.entries()){
    assert.match(board,/<svg/);
    assert.ok(board.includes(FABULA_BROADCAST_PACKS[i].name.replaceAll('&','&amp;')));
  }
  const structuralVocabulary=new Set(boards.map(board=>board.includes('stroke-dasharray')?'rhythmic':board.includes('<ellipse')?'orbital':board.includes('<polygon')?'faceted':board.includes('<path')?'drawn':'grid'));
  assert.ok(structuralVocabulary.size>=4);
});

test('all 74 identities ship a complete nine-format editable motion stack',()=>{
  assert.equal(FABULA_BROADCAST_PACKS.length,74);
  assert.equal(FABULA_BROADCAST_TEMPLATES.length,666);
  const ids=new Set(FABULA_BROADCAST_TEMPLATES.map(t=>t.id));
  assert.equal(ids.size,666);
  for(const pack of FABULA_BROADCAST_PACKS){
    const stack=FABULA_BROADCAST_TEMPLATES.filter(t=>t.packId===pack.id);
    assert.deepEqual(new Set(stack.map(t=>t.kind)),new Set(pack.assets));
    assert.ok(stack.every(t=>t.layers.length===7));
  }
  const rendered=FABULA_BROADCAST_TEMPLATES.map(renderBroadcastTemplateSvg);
  assert.equal(new Set(rendered).size,666);
  assert.ok(rendered.every(svg=>svg.includes('<svg')&&svg.includes('id="surface"')));
});

test('the council actually drives structure, rather than a hash',()=>{
  // The factory used to pick its geometry with `hash(pack.id) % 8` while carrying a comment that
  // described a council mapping, and gave all 74 identities one hard-coded grain filter. These
  // assertions are about that: a pack's structure has to follow its own art direction.
  for(const pack of FABULA_BROADCAST_PACKS){
    const ad=DATA_VIZ_ART_DIRECTIONS[pack.councilStyle];
    assert.ok(ad,`${pack.id} names a council member that does not exist`);
    const template=FABULA_BROADCAST_TEMPLATES.find(t=>t.packId===pack.id)!;
    assert.equal(template.structure.motif,motifFor(ad),`${pack.id} does not use its council's motif`);
    assert.equal(template.structure.texture,ad.texture);
    assert.equal(template.structure.lineWidth,ad.lineWidth);
  }
  // Two packs sharing an art director share a structural vocabulary; packs under different
  // directors must not all collapse onto one primitive.
  const motifs=new Set(FABULA_BROADCAST_PACKS.map(p=>motifFor(DATA_VIZ_ART_DIRECTIONS[p.councilStyle])));
  assert.ok(motifs.size>=6,`only ${motifs.size} distinct motifs across 74 identities`);

  // Every declared texture has to produce a different surface, or the mapping is decorative.
  const surfaces=new Set(FABULA_BROADCAST_PACKS.map(pack=>{
    const t=FABULA_BROADCAST_TEMPLATES.find(x=>x.packId===pack.id)!;
    return (renderBroadcastTemplateSvg(t).match(/<filter id="surface"[\s\S]*?<\/filter>/)||[''])[0];
  }));
  assert.ok(surfaces.size>=8,`only ${surfaces.size} distinct surfaces for 8 declared textures`);

  // GLASS refracts the artwork itself; the rest are laid over it. A displacement map applied as
  // an overlay rect would do nothing at all, which is the kind of silent no-op worth pinning.
  const glass=FABULA_BROADCAST_PACKS.filter(p=>DATA_VIZ_ART_DIRECTIONS[p.councilStyle].texture==='GLASS');
  assert.ok(glass.length>0);
  for(const pack of glass){
    const svg=renderBroadcastTemplateSvg(FABULA_BROADCAST_TEMPLATES.find(t=>t.packId===pack.id)!);
    assert.match(svg,/feDisplacementMap/,`${pack.id} declares GLASS but never refracts`);
    assert.ok(!/<rect[^>]*filter="url\(#surface\)"/.test(svg),`${pack.id} applies a displacement map as a flat overlay`);
  }
});
