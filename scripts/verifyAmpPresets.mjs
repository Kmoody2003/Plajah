import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {presetsForFx} from './services/melos/beats/fx/presets';
  import {AMP_MODELS,CAB_MODELS,MIC_MODELS,PEDAL_MODELS} from './services/melos/beats/fx/ampModels';
  globalThis.X={presetsForFx,n:{amp:AMP_MODELS.length,cab:CAB_MODELS.length,mic:MIC_MODELS.length,pedal:PEDAL_MODELS.length}};`},bundle:true,write:false,format:'iife'});
const ctx={console,Math};ctx.globalThis=ctx;runInNewContext(r.outputFiles[0].text,ctx);
const {presetsForFx,n}=ctx.X;
const rig=presetsForFx('amprig');
console.log('amprig presets:',rig.length,'| model counts',JSON.stringify(n));
assert.ok(rig.length>=20,'amp rack has a real stock library (20+)');
for(const p of rig){
  assert.ok(p.name&&p.description,'named + described: '+p.id);
  const q=p.params;
  assert.ok(q.amp>=0&&q.amp<n.amp,'amp index valid: '+p.id);
  assert.ok(q.cab>=0&&q.cab<n.cab,'cab index valid: '+p.id);
  assert.ok(q.mic>=0&&q.mic<n.mic,'mic index valid: '+p.id);
  assert.ok(q.pedal1>=0&&q.pedal1<n.pedal&&q.pedal2>=0&&q.pedal2<n.pedal,'pedal index valid: '+p.id);
  for(const k of ['gain','bass','mid','treble','presence','master']) assert.ok(q[k]>=0&&q[k]<=1,k+' in 0..1: '+p.id);
}
for(const t of ['gluecomp','multiband','upexp','stutter']){ assert.ok(presetsForFx(t).length>=3,t+' has presets'); }
console.log('PASS - amp rack '+rig.length+' presets (all valid model indices + param ranges) + gluecomp/multiband/upexp/stutter banks');
