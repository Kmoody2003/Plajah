import assert from 'node:assert/strict';
import test from 'node:test';
import { decoChoreography } from '../services/fabula/decoChoreography';
import { estimateFluxVoice } from '../services/fabula/fluxMusic';
test('layout transitions remain continuous across every phrase and cycle',()=>{
  for(let beat=0;beat<130;beat+=.125){
    const a=decoChoreography(beat,.5,0);
    assert.ok(Math.abs(a.weights.reduce((x,y)=>x+y,0)-1)<1e-10);
    const b=decoChoreography(beat+.0001,.5,0);
    assert.ok(a.weights.every((v,i)=>Math.abs(v-b.weights[i])<.0001));
  }
  assert.notDeepEqual(decoChoreography(8*90/60,.5,0).weights,decoChoreography(8*150/60,.5,0).weights);
});
test('intensity and vocal response are independent controls',()=>{
  const quiet=decoChoreography(8,0,0),strong=decoChoreography(8,1,0),voice=decoChoreography(8,0,1);
  assert.ok(strong.expansion>quiet.expansion);assert.equal(strong.voiceLift,0);
  assert.ok(voice.voiceLift>quiet.voiceLift);assert.equal(voice.expansion,quiet.expansion);
});
test('vocal estimate rejects silence, broadband noise and an isolated tone',()=>{
  const spectrum=new Uint8Array(1024);
  assert.equal(estimateFluxVoice(spectrum,48000),0);
  spectrum.fill(140);assert.equal(estimateFluxVoice(spectrum,48000),0);
  spectrum.fill(0);spectrum[30]=255;assert.equal(estimateFluxVoice(spectrum,48000),0);
  spectrum.fill(10);
  for(let h=2;h<=18;h++){const i=Math.round(180*h/ (48000/2048));spectrum[i]=230;spectrum[i-1]=100;spectrum[i+1]=100;}
  assert.ok(estimateFluxVoice(spectrum,48000)>.2,'a voiced harmonic spectrum is detected');
});
