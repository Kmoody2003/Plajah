import assert from 'node:assert/strict';
import test from 'node:test';
import { fluxSpectrumForces,estimateFluxHarmony } from '../services/fabula/fluxMusic';
import { driveFluxAudio,newFluxAudioState,SILENT_AUDIO } from '../services/fabula/fluxNode';

test('sixteen force bands detect energy throughout the physical spectrum',()=>{
  for(const rate of [44100,48000,96000])for(let band=0;band<16;band++){
    const freq=new Uint8Array(8192),hz=30*Math.pow(16000/30,(band+.5)/16);
    freq[Math.round(hz/(rate/2)*freq.length)]=255;
    const forces=fluxSpectrumForces(freq,rate);
    assert.equal(forces.length,16);assert.ok(forces[band]>.35,`${rate} Hz / band ${band}`);
    for(let j=0;j<16;j++)if(Math.abs(j-band)>1)assert.equal(forces[j],0);
  }
  assert.deepEqual(fluxSpectrumForces(new Uint8Array(2048)),Array(16).fill(0));
});
test('local spectral impacts attack quickly, decay, and clear on seeking',()=>{
  const state=newFluxAudioState(),spectrum=Array(16).fill(0);
  driveFluxAudio(state,SILENT_AUDIO,0,1);spectrum[8]=1;
  const hit=driveFluxAudio(state,{...SILENT_AUDIO,spectrum},1/60,1);
  assert.ok(hit.spectrum![8]>.4);assert.ok(hit.spectralImpulse![8]>1);
  const peak=hit.spectralImpulse![8];
  const released=driveFluxAudio(state,SILENT_AUDIO,2/60,1);
  assert.ok(released.spectralImpulse![8]<peak);
  const seek=driveFluxAudio(state,SILENT_AUDIO,10,1);
  assert.deepEqual(seek.spectrum,Array(16).fill(0));assert.deepEqual(seek.spectralImpulse,Array(16).fill(0));
});
test('kick attacks punch immediately and decay under sustained bass',()=>{
  const state=newFluxAudioState();driveFluxAudio(state,SILENT_AUDIO,0,1);
  const bass={...SILENT_AUDIO,bass:.75,level:.4};
  assert.ok(driveFluxAudio(state,bass,1/60,1).kickOnset!>.9);
  for(let i=2;i<=40;i++)driveFluxAudio(state,bass,i/60,1);
  assert.ok(state.kickOnset!<.015,'steady bass must not keep retriggering punches');
  driveFluxAudio(state,SILENT_AUDIO,41/60,1);
  assert.ok(driveFluxAudio(state,bass,42/60,1).kickOnset!>.9);
});
test('harmony estimate responds to pitched peaks and rejects flat noise',()=>{
  const freq=new Uint8Array(8192);
  for(const hz of [440,554.37,659.25])freq[Math.round(hz/24000*freq.length)]=220;
  assert.ok(estimateFluxHarmony(freq,48000).harmony>.5);
  assert.equal(estimateFluxHarmony(new Uint8Array(8192).fill(180),48000).harmony,0);
  assert.equal(estimateFluxHarmony(new Uint8Array(8192),48000).harmony,0);
});
