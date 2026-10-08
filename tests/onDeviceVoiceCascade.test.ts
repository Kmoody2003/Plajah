import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onDeviceVoiceEngine, KOKORO_VOICES } from '../services/voice/onDeviceVoiceEngine';

test('KOKORO_VOICES roster integrity', () => {
  assert.ok(Array.isArray(KOKORO_VOICES));
  assert.ok(KOKORO_VOICES.length >= 5);

  const ariaVoice = KOKORO_VOICES.find(v => v.id === 'af_heart');
  assert.ok(ariaVoice);
  assert.equal(ariaVoice.gender, 'female');
  assert.match(ariaVoice.name, /Aria/i);

  for (const v of KOKORO_VOICES) {
    assert.ok(v.id);
    assert.ok(v.name);
    assert.ok(['female', 'male'].includes(v.gender));
    assert.ok(['american', 'british'].includes(v.accent));
    assert.ok(v.styleDescription.length > 5);
  }
});

test('onDeviceVoiceEngine synthesizes speech to valid WAV blob', async () => {
  const result = await onDeviceVoiceEngine.synthesize({
    text: 'Welcome to Plajah Studio. Aria is ready to assist your creative flow.',
    voiceId: 'af_heart',
    speed: 1.0,
  });

  assert.ok(result);
  assert.ok(result.audioBlob instanceof Blob);
  assert.equal(result.audioBlob.type, 'audio/wav');
  assert.ok(result.durationSeconds > 1.0);
  assert.equal(result.sampleRate, 24000);
  assert.equal(result.voiceId, 'af_heart');
  assert.ok(result.audioBlob.size > 1000);
});

test('onDeviceVoiceEngine rejects empty text prompt', async () => {
  await assert.rejects(
    async () => {
      await onDeviceVoiceEngine.synthesize({ text: '   ' });
    },
    /cannot be empty/i
  );
});

test('onDeviceVoiceEngine transcribes audio into timecoded cues and SRT/VTT sidecars', async () => {
  const sampleRate = 16000;
  const numSamples = sampleRate * 6.0; // 6 seconds
  const pcm = new Float32Array(numSamples);

  // Generate synthetic dialogue burst
  for (let i = 0; i < numSamples; i++) {
    pcm[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.2;
  }

  const result = await onDeviceVoiceEngine.transcribe(pcm, sampleRate);

  assert.ok(result);
  assert.ok(Array.isArray(result.cues));
  assert.ok(result.cues.length >= 1);
  assert.ok(result.srt.includes('-->'));
  assert.ok(result.vtt.startsWith('WEBVTT'));
  assert.ok(result.confidence > 0.8);
  assert.equal(Math.round(result.durationSeconds), 6);
});
