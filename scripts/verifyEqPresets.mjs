import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import {SPECTRA_PRESETS} from './services/melos/beats/fx/spectraPresets';globalThis.P=SPECTRA_PRESETS;`},bundle:true,write:false,format:'iife'});
const ctx={console,Math,crypto:{getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(Math.random()*256)|0;return a;}}};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const P=ctx.P;
console.log('preset count:',P.length);
assert.ok(P.length>=35,'library expanded to 35+');
const cats={}; for(const p of P){ cats[p.category]=(cats[p.category]||0)+1;
  assert.ok(p.name&&p.description&&p.description.length>20,'has name + teaching description: '+p.name);
  const bands=p.bands();
  assert.ok(Array.isArray(bands)&&bands.length>0,'has bands: '+p.name);
  for(const b of bands){ assert.ok(b.freq>=20&&b.freq<=20000,'freq in range: '+p.name); assert.ok(b.gain>=-24&&b.gain<=24,'gain sane'); assert.ok(b.q>=0.1&&b.q<=24,'q sane'); assert.ok(b.id,'band id'); }
}
console.log('by category:',JSON.stringify(cats));
console.log('PASS - '+P.length+' EQ presets, all valid (freq/gain/q in range, ids, teaching descriptions)');
