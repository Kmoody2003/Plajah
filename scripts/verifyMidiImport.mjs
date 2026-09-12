import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
const r=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
  import {parseMidiFile,midiFileToClip} from './services/melos/composition/midiFileImport';
  globalThis.M={parseMidiFile,midiFileToClip};`},bundle:true,write:false,format:'iife'});
const ctx={console,Math,DataView,Uint8Array,ArrayBuffer,String,Map,crypto:{getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(Math.random()*256)|0;return a;}}};ctx.globalThis=ctx;
runInNewContext(r.outputFiles[0].text,ctx);
// Build a tiny SMF format-0: tempo 120, C4 (beat0,len1), E4 (beat1,len2)
const bytes=[
  0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, 0x01,0xE0,          // MThd len6 fmt0 ntrks1 div480
  0x4D,0x54,0x72,0x6B, 0,0,0,29,                               // MTrk len29
  0x00,0xFF,0x51,0x03,0x07,0xA1,0x20,                          // tempo 500000us=120bpm
  0x00,0x90,0x3C,0x64,                                          // note-on C4 v100
  0x83,0x60,0x80,0x3C,0x00,                                     // +480 note-off C4
  0x00,0x90,0x40,0x64,                                          // note-on E4 v100
  0x87,0x40,0x80,0x40,0x00,                                     // +960 note-off E4
  0x00,0xFF,0x2F,0x00,                                          // end of track
];
const buf=new Uint8Array(bytes).buffer;
const res=ctx.M.parseMidiFile(buf);
console.log(JSON.stringify({bpm:res.bpm,tpb:res.ticksPerBeat,notes:res.notes.map(n=>({k:n.key,s:n.startBeats,l:n.lengthBeats,v:n.vel}))}));
assert.equal(res.bpm,120,'tempo → 120 bpm');
assert.equal(res.ticksPerBeat,480,'division');
assert.equal(res.notes.length,2,'two notes');
const c4=res.notes.find(n=>n.key===60), e4=res.notes.find(n=>n.key===64);
assert.ok(c4&&Math.abs(c4.startBeats-0)<1e-9&&Math.abs(c4.lengthBeats-1)<1e-9,'C4 beat0 len1');
assert.ok(e4&&Math.abs(e4.startBeats-1)<1e-9&&Math.abs(e4.lengthBeats-2)<1e-9,'E4 beat1 len2');
assert.equal(c4.vel,100,'velocity preserved');
const clip=ctx.M.midiFileToClip(buf,0);
assert.ok(clip&&clip.lengthBeats===4,'clip rounds up to 4 beats (E4 ends at beat 3 → 1 bar)');
console.log('PASS — SMF parse: tempo, division, note pairing, beats, velocity, clip');
