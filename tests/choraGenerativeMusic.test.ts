import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choraGenerativeMusicEngine,
  ChoraMusicStem,
} from '../services/chora/choraGenerativeMusicEngine';

test('Chora Generative Music Engine: Parses root pitch class and mode accurately', () => {
  assert.deepEqual(choraGenerativeMusicEngine.parseRootPitchClass('C Major'), { rootPc: 0, mode: 'major' });
  assert.deepEqual(choraGenerativeMusicEngine.parseRootPitchClass('D Minor'), { rootPc: 2, mode: 'minor' });
  assert.deepEqual(choraGenerativeMusicEngine.parseRootPitchClass('A Minor'), { rootPc: 9, mode: 'minor' });
  assert.deepEqual(choraGenerativeMusicEngine.parseRootPitchClass('F# Minor'), { rootPc: 6, mode: 'minor' });
  assert.deepEqual(choraGenerativeMusicEngine.parseRootPitchClass('Bb Major'), { rootPc: 10, mode: 'major' });
});

test('Chora Generative Music Engine: Generates BPM-quantized Chord Progression MIDI stem', () => {
  const stem = choraGenerativeMusicEngine.generateChordProgressionStem({
    progressionId: 'epic-minor',
    rootKey: 'D Minor',
    bpm: 120,
    instrumentPreset: 'synth_pad',
  });

  assert.equal(stem.stemType, 'CHORD_PAD');
  assert.equal(stem.bpm, 120);
  assert.equal(stem.key, 'D Minor');
  assert.ok(stem.barCount >= 4, 'Must have at least 4 bars for epic minor');
  assert.equal(stem.quantizedBeats, stem.barCount * 4);
  // At 120 BPM, 1 beat = 0.5s -> 16 beats = 8.0s
  assert.equal(stem.durationSeconds, stem.quantizedBeats * 0.5);

  // Check MIDI clip
  assert.ok(stem.midiClip, 'MIDI clip must be generated');
  assert.ok(stem.midiClip.notes.length >= 12, 'Must have multi-voice chord notes');
  assert.ok(stem.audioBlob, 'Must synthesize audio WAV preview');
});

test('Chora Generative Music Engine: Generates Sub Bassline stem with lower register octaves', () => {
  const bassStem = choraGenerativeMusicEngine.generateChordProgressionStem({
    progressionId: 'epic-minor',
    rootKey: 'A Minor',
    bpm: 128,
    instrumentPreset: 'sub_bass',
  });

  assert.equal(bassStem.stemType, 'SUB_BASS');
  assert.equal(bassStem.color, '#FF8C00');
  assert.ok(bassStem.midiClip, 'Bass MIDI clip must exist');

  // Verify notes sit in bass octave (< 50 MIDI note number)
  for (const n of bassStem.midiClip.notes) {
    assert.ok(n.key < 55, `Bass note ${n.key} should sit in low register`);
  }
});

test('Chora Generative Music Engine: Generates AI Vocal Drop stem quantized to beats', async () => {
  const vocalStem = await choraGenerativeMusicEngine.generateVocalDropStem({
    prompt: 'Drop the sub bass now',
    bpm: 124,
    key: 'D Minor',
    engine: 'fish_speech',
  });

  assert.equal(vocalStem.stemType, 'VOCAL_DROP');
  assert.equal(vocalStem.bpm, 124);
  assert.ok(vocalStem.quantizedBeats >= 1);
  assert.ok(vocalStem.audioBlob);
  assert.equal(vocalStem.color, '#D40055');
});

test('Chora Generative Music Engine: Generates BPM-synced Foley Riser stem', () => {
  const riserStem = choraGenerativeMusicEngine.generateFoleyRiserStem({
    presetId: 'cinematic_riser',
    bpm: 120,
    beatBars: 2,
  });

  assert.equal(riserStem.stemType, 'FOLEY_RISER');
  assert.equal(riserStem.bpm, 120);
  assert.equal(riserStem.barCount, 2);
  assert.equal(riserStem.quantizedBeats, 8);
  // At 120 BPM, 8 beats = 4.0s
  assert.equal(riserStem.durationSeconds, 4.0);
  assert.ok(riserStem.audioBlob);
});

test('Chora Generative Music Engine: Converts stems to MixerTrackStrip for DAW timeline', () => {
  const chordStem: ChoraMusicStem = {
    stemId: 'stem_test_chords',
    stemName: 'CHORDS (Epic Minor)',
    stemType: 'CHORD_PAD',
    bpm: 120,
    key: 'D Minor',
    barCount: 4,
    durationSeconds: 8.0,
    quantizedBeats: 16,
    audioBlob: new Blob(),
    color: '#00DAF3',
  };

  const track = choraGenerativeMusicEngine.convertStemToMixerTrack(chordStem);

  assert.equal(track.name, 'CHORDS (Epic Minor)');
  assert.equal(track.color, '#00DAF3');
  assert.equal(track.armed, true);
  assert.equal(track.volumeGain, 0.9);
  assert.equal(track.send1Gain, 0.2);
});
