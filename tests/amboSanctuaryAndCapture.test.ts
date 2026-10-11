import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCaptureState,
  startCapture,
  stopCapture,
  markCaptureIn,
  markCaptureOut,
  clearCaptureMarks,
  clearCapture,
  capturedLines,
} from '../services/ambo/songFollower';
import { vizEnergy, VIZ_ENERGIES } from '../services/ambo/vizEnergy';
import { SANCTUARY_WORKS } from '../components/plajahPixels/engine/presets/sanctuaryShaders';

test('Series VIII · Sanctuary Light — 24 works integrity', () => {
  assert.equal(SANCTUARY_WORKS.length, 24, 'must have exactly 24 visualizers');

  const ids = new Set<string>();
  const directors = new Set<string>();
  const energyCounts: Record<string, number> = {};

  for (const w of SANCTUARY_WORKS) {
    assert.ok(w.id.startsWith('sanct-'), `id ${w.id} must start with sanct-`);
    assert.ok(!ids.has(w.id), `duplicate id ${w.id}`);
    ids.add(w.id);

    directors.add(w.director);
    energyCounts[w.energy] = (energyCounts[w.energy] || 0) + 1;

    // Check shader source is well-formed
    assert.ok(w.src.includes('sanctFinish'), `${w.id} must conclude with sanctFinish`);
    assert.ok(w.src.includes('mainImage'), `${w.id} must define mainImage`);
    assert.equal(w.series, 'VIII');
    assert.equal(w.setTitle, 'Sanctuary Light');
    assert.equal(w.params.length, 4, 'must provide 4 Director params');
  }

  // Check 6 directors, 4 works each
  assert.equal(directors.size, 6, 'must have 6 directors');
  for (const d of directors) {
    const worksByDirector = SANCTUARY_WORKS.filter(w => w.director === d);
    assert.equal(worksByDirector.length, 4, `${d} must have 4 works`);
  }

  // Energy distribution: sanctuary is church-tailored (calm, tranquil, with tasteful medium, zero chaotic)
  assert.ok(energyCounts['tranquil'] >= 6, 'tranquil visualizers present');
  assert.ok(energyCounts['calm'] >= 8, 'calm visualizers present');
  assert.ok((energyCounts['chaotic'] || 0) === 0, 'sanctuary light has zero chaotic visualizers');
});

test('vizEnergy classifications and house rules', () => {
  // Sanctuary works inherit declared energy
  const rose = SANCTUARY_WORKS.find(w => w.id === 'sanct-rose-window')!;
  assert.equal(vizEnergy({ name: rose.name, energy: rose.energy }), 'calm');

  const clerestory = SANCTUARY_WORKS.find(w => w.id === 'sanct-clerestory')!;
  assert.equal(vizEnergy({ name: clerestory.name, energy: clerestory.energy }), 'tranquil');

  // Chaotic rules: Milkdrop, strobe, dubstep, hyper never classified as tranquil/calm
  assert.equal(vizEnergy({ name: 'Milkdrop Audio Reactivity', tags: ['milkdrop'] }), 'high');
  assert.equal(vizEnergy({ name: 'Strobe Storm', tags: ['abstract'] }), 'chaotic');

  // Verify all 5 energy levels are defined
  assert.deepEqual(VIZ_ENERGIES.map(e => e.id), ['tranquil', 'calm', 'medium', 'high', 'chaotic']);
});

test('Song Follower — live transcribe and song capture workflow', async () => {
  // Reset follower state
  clearCapture();
  assert.equal(getCaptureState().on, false);
  assert.equal(getCaptureState().lines.length, 0);

  // Turn capture ON
  await startCapture();
  assert.equal(getCaptureState().on, true);

  // Directly populate capture lines to simulate live speech transcription
  const now = Date.now();
  getCaptureState().lines = [
    { text: 'Prelude instrumental talk', at: now - 10000 },
    { text: 'Amazing grace how sweet the sound', at: now - 8000 },
    { text: 'That saved a wretch like me', at: now - 6000 },
    { text: 'I once was lost but now am found', at: now - 4000 },
    { text: 'Postlude pastor prayer', at: now - 1000 },
  ];

  // Mark IN at line 1 ('Amazing grace...') and OUT at line 3 ('I once was lost...')
  markCaptureIn(1);
  markCaptureOut(3);
  assert.equal(getCaptureState().inIdx, 1);
  assert.equal(getCaptureState().outIdx, 3);

  // Extract lines inside IN/OUT range
  const lines = capturedLines();
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Amazing grace how sweet the sound');
  assert.equal(lines[1], 'That saved a wretch like me');
  assert.equal(lines[2], 'I once was lost but now am found');

  // Verify preamble and postlude excluded
  assert.ok(!lines.includes('Prelude instrumental talk'));
  assert.ok(!lines.includes('Postlude pastor prayer'));

  // Clear marks
  clearCaptureMarks();
  assert.equal(getCaptureState().inIdx, null);
  assert.equal(getCaptureState().outIdx, null);

  // Stop capture
  stopCapture();
  assert.equal(getCaptureState().on, false);
});
