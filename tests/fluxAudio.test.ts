import assert from 'node:assert/strict';
import test from 'node:test';
import { fluxBandsFromFreq, SILENT_AUDIO } from '../services/fabula/fluxNode';
import { createFluxTestWav } from '../services/fabula/fluxTestGroove';

test('a narrow kick is not diluted by the old broad arithmetic-average bucket',()=>{
  const spectrum=new Uint8Array(1024);spectrum[2]=120;spectrum[3]=250;spectrum[4]=120;
  const a=fluxBandsFromFreq(spectrum,48000);
  assert.ok(a.bass>.5,'kick must drive visible motion');assert.equal(a.mid,0);assert.equal(a.treble,0);
});
test('physical frequency bands follow the actual analyser sample rate',()=>{
  for(const rate of [44100,48000,96000])for(const bins of [512,1024,2048]){
    for(const [hz,expected] of [[90,'bass'],[900,'mid'],[5000,'treble']] as const){
      const spectrum=new Uint8Array(bins),index=Math.round(hz/(rate/2)*bins);
      spectrum[index]=255;const result=fluxBandsFromFreq(spectrum,rate);
      assert.ok(result[expected]>.2,`${rate}/${bins}/${hz} drives ${expected}`);
      for(const other of ['bass','mid','treble'] as const)if(other!==expected)assert.equal(result[other],0);
    }
  }
});
test('silence and missing spectra cannot manufacture a visual beat',()=>{
  assert.deepEqual(fluxBandsFromFreq(undefined),SILENT_AUDIO);
  assert.deepEqual(fluxBandsFromFreq(new Uint8Array(2048)),SILENT_AUDIO);
});
test('audible proof has PCM music and quiet lead-in, not fake band values',()=>{
  const v=new DataView(createFluxTestWav());assert.equal(v.getUint32(24,true),24000);
  let lead=0,music=0;
  for(let i=0;i<24000;i++)lead+=Math.abs(v.getInt16(44+i*2,true));
  for(let i=24000;i<48000;i++)music+=Math.abs(v.getInt16(44+i*2,true));
  assert.equal(lead,0);assert.ok(music>1_000_000);
});
