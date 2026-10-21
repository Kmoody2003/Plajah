import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnsemblePlan, validateEnsemblePlan } from '../services/melos/generation/ensemblePlan';
import { runHolisticEnsemblePipeline, type EnsembleRuntime } from '../services/melos/generation/holisticEnsemblePipeline';
import { validateGenerationRequest, type GenerationRequest } from '../services/melos/generation/types';
import { ensembleVoicePatch, instrumentGrounding, selectEnsembleVoices } from '../services/melos/generation/instrumentKnowledge';

const input = { prompt: 'Sparse soulful jazz with a recurring flute motif', bpm: 120,
  keySignature: 'D Minor', startBeats: 12, regionBeats: 36, seed: 42 };

test('form covers odd bar counts exactly and ends in a functional minor cadence', () => {
  for (let bars = 5; bars <= 128; bars++) {
    const plan = buildEnsemblePlan({ ...input, regionBeats: bars * 4, bpm: 120 });
    assert.equal(plan.sections.reduce((n, s) => n + s.bars, 0), bars);
    for (let i = 1; i < plan.sections.length; i++) assert.equal(plan.sections[i].startBar,
      plan.sections[i - 1].startBar + plan.sections[i - 1].bars);
    assert.deepEqual(plan.chords.slice(-2), ['A7', 'Dm']);
  }
  for (const patch of [{ regionBeats: NaN }, { regionBeats: 17 }, { regionBeats: 4 }, { bpm: 0 },
    { keySignature: 'nonsense' }, { regionBeats: 1024 }, { startBeats: -1 }]) {
    assert.throws(() => buildEnsemblePlan({ ...input, ...patch }));
  }
});

function fixture() {
  const requests: GenerationRequest[] = [];
  let running = 0;
  const runtime: EnsembleRuntime = {
    engines: async () => ['ace-step', 'qwen-score'].map(id => ({ id, name: id,
      runtimeConnected: true, access: { allowed: true } })),
    generate: async request => {
      validateGenerationRequest(request);
      assert.equal(++running, 1, 'inference must be sequential');
      requests.push(request);
      await Promise.resolve();
      running--;
      if (request.purpose === 'arrangement-plan') return { result: { plan: buildEnsemblePlan({
        ...input, regionBeats: request.bars * 4, allowShort: true }) } };
      return request.kind === 'midi'
        ? { result: { notes: [{ startBeats: 0, lengthBeats: 1, key: 62, vel: 90 }] } }
        : { result: { audioAvailable: true }, audio: new Blob(['fixture audio'], { type: 'audio/wav' }) };
    },
  };
  return { requests, runtime };
}

test('actual engine calls share a brief, produce bounded MIDI, and report only executed models', async () => {
  const { runtime, requests } = fixture();
  const result = await runHolisticEnsemblePipeline(input, runtime);
  assert.deepEqual(result.modelsUsed, ['qwen-score', 'ace-step']);
  assert.equal(result.midiTracks.length, 3);
  assert.equal(result.audioStems.length, 1);
  assert.match(result.audioStems[0].name, /Complementary audio/);
  assert.equal(requests.at(-1)?.kind, 'audio');
  assert.equal(requests[0].purpose, 'arrangement-plan');
  assert.ok(requests.filter(r => !r.purpose).every(r => r.prompt.includes('Shared arrangement:')));
  assert.ok(requests.filter(r => r.kind === 'midi' && !r.purpose).every(r => r.bars <= 4));
  assert.ok(result.midiTracks.every(t => t.notes.every(n => n.startBeats + n.lengthBeats <= input.regionBeats)));
  assert.equal(result.sectionCues[0].startBeats, input.startBeats);
  assert.ok(requests.at(-1)?.prompt.includes('Leave those roles out'));
  assert.ok(result.midiTracks.every(t => t.presetId && t.presetName && t.gainDb < 0));
});

test('missing engines, inference errors, invalid notes and cancellation never synthesize a substitute', async () => {
  const { runtime } = fixture();
  await assert.rejects(runHolisticEnsemblePipeline(input, { ...runtime, engines: async () => [] }), /Connect and authorize/);
  await assert.rejects(runHolisticEnsemblePipeline(input, { ...runtime, generate: async () => { throw new Error('offline'); } }), /offline/);
  await assert.rejects(runHolisticEnsemblePipeline(input, { ...runtime, generate: async (req, signal) =>
    req.purpose ? runtime.generate(req, signal) : { result: { notes: [] } } }), /no usable notes/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runHolisticEnsemblePipeline({ ...input, signal: controller.signal }, runtime));
});

test('director output cannot insert overlapping, missing or malformed musical sections', () => {
  const base = buildEnsemblePlan(input);
  const raw = { ...base, concept: 'A flute hook develops over rising harmonic tension.' };
  assert.deepEqual(validateEnsemblePlan(raw, base).chords, base.chords);
  assert.throws(() => validateEnsemblePlan({ ...raw, chords: ['Dm'] }, base), /chord map/);
  assert.throws(() => validateEnsemblePlan({ ...raw, sections: [{ ...raw.sections[0], startBar: 1 }] }, base), /cover each bar/);
  assert.throws(() => validateEnsemblePlan({ ...raw, sections: raw.sections.slice(0, 1) }, base), /unplanned/);
});

test('reference-only mode does not require or claim Qwen', async () => {
  const { runtime, requests } = fixture();
  const result = await runHolisticEnsemblePipeline({ ...input, includeMidi: false }, runtime);
  assert.equal(requests.length, 1);
  assert.deepEqual(result.modelsUsed, ['ace-step']);
  assert.deepEqual(result.midiTracks, []);
});

test('maximum-length briefs and arrangements stay within the local request budget', async () => {
  const { runtime } = fixture();
  const result = await runHolisticEnsemblePipeline({ ...input, prompt: 'cinematic dubstep vocals '.repeat(160).slice(0, 4000), regionBeats: 512 }, runtime);
  assert.equal(result.plan.bars, 128);
});

test('one-bar MIDI parts target a real synth preset and never run audio inference', async () => {
  const { runtime, requests } = fixture();
  const result = await runHolisticEnsemblePipeline({ ...input, regionBeats: 4, includeAudio: false, midiInstrument: 'onda' }, runtime);
  assert.equal(result.audioStems.length, 0);
  assert.equal(result.midiTracks.length, 1);
  assert.equal(result.midiTracks[0].instrument, 'onda');
  assert.ok(requests.every(r => r.engine === 'qwen-score' && r.prompt.includes(result.midiTracks[0].presetName)));
});

test('every supported synth resolves the factory preset described to the composer', () => {
  for (const instrument of ['onda', 'aura', 'bajo', 'vela', 'cantus', 'ison', 'pneuma'] as const) {
    const [voice] = selectEnsembleVoices('cinematic dubstep hip hop expressive choir', instrument);
    const patch = ensembleVoicePatch(voice);
    assert.ok(patch.params);
    assert.equal(voice.instrument, instrument);
    assert.ok(voice.description.length > 10);
  }
  assert.match(instrumentGrounding(), /not a lyric singer/);
  assert.throws(() => selectEnsembleVoices('orchestra', 'kera'), /No factory preset/);
});
