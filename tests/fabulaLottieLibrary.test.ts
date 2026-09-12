import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { FABULA_LOTTIE_LIBRARY } from '../services/fabulaLottieLibrary';
import { telaDocumentToHtml } from '../services/telaHtmlExport';
import type { TelaDoc, TelaImageDevice } from '../types';

test('Fabula ships 24 unique, public-domain dotLottie motion systems', async () => {
  assert.equal(FABULA_LOTTIE_LIBRARY.length, 24);
  assert.equal(new Set(FABULA_LOTTIE_LIBRARY.map(item => item.id)).size, 24);
  assert.deepEqual(
    Object.fromEntries(['LOWER_THIRD','FULL_PAGE','DATA_VIZ','TRANSITION'].map(category => [category, FABULA_LOTTIE_LIBRARY.filter(item => item.category === category).length])),
    { LOWER_THIRD:6, FULL_PAGE:6, DATA_VIZ:6, TRANSITION:6 },
  );

  const shapes = new Map<string, string>();
  for (const item of FABULA_LOTTIE_LIBRARY) {
    assert.equal(item.license, 'CC0-1.0');
    const bytes = await readFile(join(process.cwd(), 'public', 'fabula', 'lottie', `${item.id}.lottie`));
    const files = unzipSync(new Uint8Array(bytes));
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    const animation = JSON.parse(strFromU8(files[`animations/${item.id}.json`]));
    assert.equal(manifest.activeAnimationId, item.id);
    assert.equal(manifest.custom.license, 'CC0-1.0');
    assert.equal(manifest.custom.motif, item.motif, `${item.id} manifest motif drifted from the library`);
    assert.equal(animation.nm, item.name);
    assert.equal(animation.w, item.width);
    assert.equal(animation.h, item.height);
    assert.equal(Math.round((animation.op / animation.fr) * 100) / 100, item.duration, `${item.id} duration drifted`);
    // A ground plus a motif. Fewer than four layers is not a composition.
    assert.ok(animation.layers.length >= 4, `${item.id} has only ${animation.layers.length} layers`);
    // The SHAPE of the piece, independent of colour: layer names and geometry, no fills.
    shapes.set(item.id, JSON.stringify(animation.layers.map((l: any) => [l.nm, l.shapes?.[0]?.it?.length ?? 0])));
  }

  // Every piece must be its own composition. The first foundry drove layout from the array index,
  // so all six lower thirds were the same three bars and all six transitions the same rounded
  // square — eighteen of the twenty-four differed from a sibling by palette alone.
  const byStructure = new Map<string, string[]>();
  for (const [id, sig] of shapes) byStructure.set(sig, [...(byStructure.get(sig) || []), id]);
  const clones = [...byStructure.values()].filter(group => group.length > 1);
  assert.deepEqual(clones, [], `these pieces are the same composition recoloured: ${clones.map(g => g.join(' = ')).join('; ')}`);
  assert.equal(new Set(FABULA_LOTTIE_LIBRARY.map(i => i.motif)).size, 24, 'every piece should carry its own motif');
});

test('Tela standalone HTML preserves animated Lottie and video layers', () => {
  const image: TelaImageDevice = {
    id:'image', type:'IMAGE', width:960, height:540,
    layers:[{
      id:'motion', name:'Motion', src:'/fabula/lottie/prism-bars.lottie', mediaKind:'LOTTIE', intrinsicWidth:960, intrinsicHeight:540,
      x:0,y:0,scale:1,opacity:1,blend:'normal',visible:true,
      adjust:{brightness:1,contrast:1,saturate:1,exposure:0,blur:0},
    }],
  };
  const doc: TelaDoc = { id:'doc', ownerId:'test', title:'Motion document', frames:[{id:'frame',kind:'SCREEN',preset:'FREE',x:0,y:0,w:960,h:540,deviceIds:['image']}], devices:{image}, bindings:[], createdAt:0, updatedAt:0 };
  const html = telaDocumentToHtml(doc);
  assert.match(html, /class="tela-lottie"/);
  assert.match(html, /@lottiefiles\/dotlottie-web@0\.55\.0/);
  assert.match(html, /prism-bars\.lottie/);
});
