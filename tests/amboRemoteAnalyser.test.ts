// Output windows get the studio's spectrum as a stand-in analyser. Flux generators read
// `analyser.context.sampleRate`; when the stand-in lacked `context` that threw inside the
// generator's frame() and dropped every Flux visual to the fallback card on second displays.
// Run: npx tsx --test tests/amboRemoteAnalyser.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).window = globalThis;

test('remote analyser looks like an AnalyserNode to Flux/Typo consumers', async () => {
  const { installRemoteAmboAnalyser, AMBO_AUDIO_CHANNEL } = await import('../services/ambo/amboAudioEngine') as any;
  const off = installRemoteAmboAnalyser();
  const an = (globalThis as any).getAmboMasterAnalyser();
  assert.ok(an, 'analyser installed');
  assert.equal(typeof an.context.sampleRate, 'number');
  assert.equal(an.context.sampleRate, 48000);

  // the studio's real rate is adopted once a spectrum frame arrives
  const tx = new BroadcastChannel(AMBO_AUDIO_CHANNEL ?? 'ambo-audio-v1');
  tx.postMessage({ t: 'spectrum', freq: new Uint8Array(256), wave: new Uint8Array(256), sr: 44100 });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(an.context.sampleRate, 44100);
  tx.close(); off();
});
