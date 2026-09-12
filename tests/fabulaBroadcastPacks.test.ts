import assert from 'node:assert/strict';
import test from 'node:test';
import { FABULA_BROADCAST_PACKS, FABULA_COUNTERCULTURE_PACKS, FABULA_GLOBAL_PACKS, FABULA_IMAGE_MATTE_PACKS, FABULA_SPORTS_PACKS } from '../services/fabula/broadcastPacks';
import { systemBoardSvg } from '../services/fabula/systemBoardSvg';
import { FABULA_BROADCAST_TEMPLATES, renderBroadcastTemplateSvg, motifFor, emphasisFor } from '../services/fabula/broadcastTemplateFactory';
import { DATA_VIZ_ART_DIRECTIONS } from '../services/fabula/dataVizArtDirection';
import { BROADCAST_DESIGNS } from '../services/fabula/broadcastDesigns';
import { FONTS } from '../services/tela/telaFonts';
import { stillBroadcastSvg } from '../services/fabula/broadcastTemplateFactory';

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
  // The board is the identity's own opener held still: no animation left in it, no zero-width wipe clips.
  for(const board of boards){ assert.ok(!/<animate/.test(board)); assert.ok(!/<clipPath id="w\d+"><rect[^>]*width="0"/.test(board)); }
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

test('the pack\'s own subject drives a second composition axis', () => {
  const packs = FABULA_BROADCAST_PACKS;
  const tally = new Map<string, number>();
  for (const p of packs) tally.set(emphasisFor(p), (tally.get(emphasisFor(p)) ?? 0) + 1);

  // All four arrangements have to be reachable, or the axis is decoration.
  for (const e of ['INSET', 'PORTRAIT', 'PANORAMA', 'COMPARISON']) {
    assert.ok((tally.get(e) ?? 0) > 0, `no identity uses the ${e} arrangement`);
  }

  // The trap this axis was born from: an unanchored /table/ matches the word "editable", which
  // appears in nearly every imageTreatment, and it swept two thirds of the library into a single
  // arrangement while looking like it was reading the copy. No arrangement may dominate.
  for (const [e, n] of tally) {
    assert.ok(n <= packs.length * 0.7, `${e} claims ${n}/${packs.length} identities — check for a substring match`);
  }

  // Packs that share a council motif must still be separable, since motif alone cannot tell
  // Arena Carbon from Tale of the Tape.
  const byMotif = new Map<string, Set<string>>();
  for (const p of packs) {
    const m = motifFor(DATA_VIZ_ART_DIRECTIONS[p.councilStyle]);
    if (!byMotif.has(m)) byMotif.set(m, new Set());
    byMotif.get(m)!.add(emphasisFor(p));
  }
  const combinations = [...byMotif.values()].reduce((n, set) => n + set.size, 0);
  assert.ok(combinations >= 18, `only ${combinations} motif x arrangement combinations`);

  // Spot-check the reading against packs whose subject is unambiguous in their own copy.
  assert.equal(emphasisFor(packs.find(p => p.id === 'tale-of-tape')!), 'COMPARISON');
  assert.equal(emphasisFor(packs.find(p => p.id === 'arena-carbon')!), 'PANORAMA');
  assert.equal(emphasisFor(packs.find(p => p.id === 'prism-portrait')!), 'PORTRAIT');

  // And the arrangement must actually reach the artwork, not just the metadata.
  const opener = (id: string) =>
    renderBroadcastTemplateSvg(FABULA_BROADCAST_TEMPLATES.find(t => t.packId === id && t.kind === 'OPENER')!);
  assert.notEqual(opener('tale-of-tape'), opener('arena-carbon'));
});

test('every identity is hand-authored: its own idea, type pairing, composition and marks', () => {
  const packs = FABULA_BROADCAST_PACKS;
  // No pack may fall through to the parametric fallback.
  for (const p of packs) assert.ok(BROADCAST_DESIGNS[p.id], `${p.id} has no hand-authored design`);

  // The brief: "Nothing that could be produced by swapping colours on a neighbour." The opener
  // markup with every colour removed must still be unique per identity.
  const strip = (svg: string) => svg.replace(/#[0-9a-fA-F]{6}/g, '#').replace(/rgba?\([^)]*\)/g, 'c').replace(/id="[^"]+"/g, '').replace(/url\(#[^)]+\)/g, 'u');
  const openers = packs.map(p => strip(stillBroadcastSvg(renderBroadcastTemplateSvg(FABULA_BROADCAST_TEMPLATES.find(t => t.packId === p.id && t.kind === 'OPENER')!))));
  assert.equal(new Set(openers).size, packs.length, 'two identities share an opener composition');

  // Real type, by FontKey, from the open-licensed library — never a raw system stack.
  const trios = new Set<string>();
  for (const p of packs) {
    const d = BROADCAST_DESIGNS[p.id];
    for (const k of Object.values(d.type)) assert.ok(k in FONTS, `${p.id} names an unknown face ${k}`);
    assert.ok(d.idea.length > 40, `${p.id} has no idea worth a sentence`);
    trios.add(`${d.type.display}/${d.type.text}`);
  }
  assert.ok(trios.size >= packs.length * .8, `only ${trios.size} distinct display/text pairings across ${packs.length} identities`);
  const displays = new Set(packs.map(p => BROADCAST_DESIGNS[p.id].type.display));
  assert.ok(displays.size >= 45, `only ${displays.size} distinct display faces`);

  // Every rendered format carries the identity's own faces, not the previous Arial/Georgia/Impact set.
  const svgs = FABULA_BROADCAST_TEMPLATES.map(renderBroadcastTemplateSvg);
  const system = svgs.filter(svg => /font-family=['"](Arial|Georgia|Impact|Courier New)/.test(svg));
  assert.equal(system.length, 0, `${system.length} formats still set a system face`);
  for (const t of FABULA_BROADCAST_TEMPLATES) {
    if (t.kind === 'TRANSITION') continue; // a transition is mark and field only; it carries no type
    const d = BROADCAST_DESIGNS[t.packId]; const svg = renderBroadcastTemplateSvg(t);
    assert.ok(svg.includes(FONTS[d.type.display].family) || svg.includes(FONTS[d.type.text].family) || svg.includes(FONTS[d.type.utility].family), `${t.id} does not use its own type`);
  }
});
