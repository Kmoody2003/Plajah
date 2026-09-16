import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import * as R from './services/melos/progressionRepo';
  globalThis.R=R;`},bundle:true,write:false,format:'iife'});
const ctx={console,Math};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const R=ctx.R;
// 1) coverage: every progression tagged
const untagged=R.untaggedProgressionIds();
console.log('untagged:',JSON.stringify(untagged));
assert.equal(untagged.length,0,'every progression carries a genre tag');
// 2) facets sorted desc with counts
const facets=R.genreFacets();
assert.ok(facets.length>0 && facets.every(f=>f.count>0),'facets have positive counts');
assert.ok(facets[0].count>=facets[facets.length-1].count,'facets sorted desc');
// 3) by genre
const jazz=R.progressionsByGenre('jazz').map(p=>p.id);
assert.ok(jazz.includes('ii-v-i')&&jazz.includes('bossa'),'jazz includes ii-v-i + bossa');
// 4) search
assert.ok(R.searchProgressions('drill').some(p=>p.id==='drill'),'search finds drill');
assert.ok(R.searchProgressions('trailer').some(p=>p.id==='cinematic-min'),'search hits heardIn text');
// 5) realise
const chords=R.realiseById('pop',0,false); // C major four chords
assert.ok(Array.isArray(chords)&&chords.length===4,'realise pop → 4 chords');
// 6) deterministic pick
const a=R.pickProgression({genre:'electronic',seed:42});
const b=R.pickProgression({genre:'electronic',seed:42});
assert.equal(a.id,b.id,'same seed → same progression');
assert.ok(R.tagsFor(a.id).includes('electronic'),'picked is in-genre');
console.log('facets:',facets.map(f=>f.genre+':'+f.count).join(' '));
console.log('PASS — progression repository: coverage, facets, byGenre, search, realise, deterministic pick');
