import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proceduralFoley, FOLEY_PRESETS } from '../services/audio/proceduralFoleyEngine';
import { fishSpeechProvider } from '../services/voice/aria/providers/fishSpeech';
import { plajahAudioCore, ARIA_DEFAULT_PROFILE } from '../services/voice/plajahAudioCore';

test('Procedural Foley Engine: synthesizes valid WAV audio for all presets', () => {
  for (const preset of FOLEY_PRESETS) {
    const res = proceduralFoley.renderFoley({ presetId: preset.id });
    assert.equal(res.presetId, preset.id);
    assert.ok(res.durationSeconds > 0, `Preset ${preset.id} duration should be > 0`);
    assert.ok(res.pcmFloat32.length > 0, `PCM samples should exist for ${preset.id}`);
    assert.ok(res.wavBlob.size > 44, `WAV blob should have valid header size for ${preset.id}`);
  }
});

test('Procedural Foley Engine: computes BPM-synced riser duration accurately', () => {
  // At 120 BPM, 1 bar = 4 beats = 2.0 seconds. 2 bars = 4.0 seconds.
  const res = proceduralFoley.renderFoley({ presetId: 'riser', bpm: 120, beatBars: 2 });
  assert.equal(res.durationSeconds, 4.0);
  assert.equal(res.pcmFloat32.length, 4.0 * 44100);
});

test('Fish Speech Provider: handles fallback synthesis and estimates marks cleanly', async () => {
  const result = await fishSpeechProvider.synth(
    'Welcome to the observatory, Aria.',
    ARIA_DEFAULT_PROFILE,
    { speed: 1.0 }
  );

  assert.ok(result.durationMs > 500, 'Duration should be estimated');
  assert.ok(result.audio, 'Audio blob should be generated');
  assert.ok(result.marks.length > 0, 'Word marks should be generated for speech tracking');
  assert.equal(result.marks[0].text, 'Welcome');
});

test('PlajahAudioCore (Fabula Expression): generates dialogue take with video scene snap metadata', async () => {
  const take = await plajahAudioCore.synthesizeFabulaDialogue({
    text: 'If the transmitter goes down tonight, none of our signals reach the dock.',
    speakerName: 'Aria',
    emotion: 'urgent',
    sceneId: 'SCENE_12',
    takeIndex: 2,
    engine: 'fish_speech',
  });

  assert.equal(take.speakerName, 'Aria');
  assert.ok(take.durationSeconds > 1.0);
  assert.ok(take.sceneSnapSeconds > take.durationSeconds, 'Scene snap duration should cradle vocal delivery');
  assert.ok(take.takeId.includes('take_'));
  assert.ok(take.audioBlob.size > 0);
});

test('PlajahAudioCore (Chora Expression): calculates BPM quantization and stem targeting', async () => {
  const drop = await plajahAudioCore.synthesizeChoraVocalDrop({
    text: 'Drop the low pass filter into the break.',
    bpm: 124,
    key: 'D Minor',
  });

  assert.equal(drop.bpm, 124);
  assert.equal(drop.key, 'D Minor');
  assert.equal(drop.stemTarget, 'VOCAL_LEAD');
  assert.ok(drop.quantizedBeats >= 1);
  assert.ok(drop.audioBlob.size > 0);
});

test('PlajahAudioCore (Tela Expression): automatically detects character dialogue quotes in manuscripts', async () => {
  const manuscriptParagraph = 'She touched the ancient copper binding. "Every word here was paid for in silence," she whispered calmly.';
  
  const segments = await plajahAudioCore.synthesizeTelaAudiobook({
    text: manuscriptParagraph,
    detectQuotes: true,
  });

  assert.ok(segments.length >= 2, 'Should split narration from quoted character speech');
  
  const quoteSeg = segments.find(s => s.speakerType === 'CHARACTER_QUOTE');
  assert.ok(quoteSeg, 'Should identify character quote segment');
  assert.equal(quoteSeg.text, 'Every word here was paid for in silence,');
  
  const narrSeg = segments.find(s => s.speakerType === 'NARRATOR');
  assert.ok(narrSeg, 'Should identify narrator segment');
  assert.equal(narrSeg.speakerName, 'Aria (Narrator)');
});
