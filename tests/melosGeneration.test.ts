import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc.ts';
import { insertGeneratedAudio, insertGeneratedNotes } from '../services/melos/generation/insert.ts';
import { validateGenerationRequest, validateGeneratedNotes, type GenerationRequest } from '../services/melos/generation/types.ts';
import { MusicGenerationJobs } from '../services/melos/generation/jobs.ts';
import { runGeneration } from '../services/melos/generation/adapters.ts';

const request: GenerationRequest = { engine: 'qwen-score', kind: 'midi', prompt: 'piano melody', lyrics: '', bpm: 120, bars: 4, seconds: 10, key: 'C Major', seed: 42 };
const notes = [{ startBeats: 0, lengthBeats: 1, key: 60, vel: 90 }, { startBeats: 1, lengthBeats: 2, key: 67, vel: 100 }];
const target = { destination: 'timeline' as const, startBeats: 8, instrument: 'onda' as const, name: 'Piano idea' };

test('invalid generation and model output cannot reach a project', () => {
  for (const patch of [{ engine: '__proto__' }, { kind: 'sample' }, { bars: NaN }, { seed: -1 }, { seconds: 999 }, { prompt: '' }]) {
    assert.throws(() => validateGenerationRequest({ ...request, ...patch }));
  }
  assert.throws(() => validateGeneratedNotes([{ ...notes[0], lengthBeats: Infinity }]));
  assert.throws(() => validateGeneratedNotes([{ ...notes[0], key: 999 }]));
  assert.throws(() => validateGeneratedNotes([]));
});
test('MIDI inserts at the requested beat, preserving existing tracks and note duration', () => {
  const doc = newGrooveDoc('admin');
  const before = JSON.stringify(doc.arrangement[0].clips);
  const added = insertGeneratedNotes(doc, notes, target);
  const track = doc.arrangement.find(track => track.id === added.trackId)!;
  assert.equal(track.kind, 'instrument'); assert.equal(track.clips[0].startBeats, 8);
  assert.equal(track.clips[0].notes![1].lengthBeats, 2);
  assert.equal(JSON.stringify(doc.arrangement[0].clips), before);
  insertGeneratedNotes(doc, notes, { ...target, trackId: track.id, startBeats: 16 });
  assert.equal(track.clips.length, 2); assert.equal(doc.arrangement.length, 2);
});
test('MEKA and Glass receive playable pitch patterns without replacing existing patterns', () => {
  for (const destination of ['meka', 'glass'] as const) {
    const doc = newGrooveDoc('admin'); const original = JSON.stringify(doc.patterns[0]);
    const added = insertGeneratedNotes(doc, notes, { ...target, destination });
    assert.ok('padIdx' in added); const padIdx = added.padIdx!;
    const pad = doc.kit[padIdx]; const pattern = doc.patterns[1];
    assert.equal(pad.source, 'instrument');
    assert.equal(pattern.melo![padIdx][0][0].semi + pad.instrumentNote!, 60);
    assert.equal(pattern.melo![padIdx][4][0].len, 8);
    assert.equal(JSON.stringify(doc.patterns[0]), original);
    const snapshot = JSON.stringify(doc);
    assert.throws(() => insertGeneratedNotes(doc, [{ ...notes[0], lengthBeats: 32 }], { ...target, destination }));
    assert.equal(JSON.stringify(doc), snapshot);
  }
});
test('audio duration follows project tempo and sample creation preserves occupied pads', () => {
  const doc = newGrooveDoc('admin'); const sample = { key: 'private/sample', name: 'idea', durationSec: 3 };
  const existing = JSON.stringify(doc.kit);
  insertGeneratedAudio(doc, sample, target, false);
  assert.equal(doc.arrangement[1].kind, 'audio'); assert.equal(doc.arrangement[1].clips[0].lengthBeats, 6);
  const added = insertGeneratedAudio(doc, sample, target, true);
  assert.ok('padIdx' in added); assert.equal(JSON.stringify(doc.kit.slice(0, 16)), existing);
  assert.equal(doc.kit[added.padIdx!].sample?.key, sample.key);
  assert.throws(() => insertGeneratedAudio(doc, sample, { ...target, startBeats: NaN }, false));
});
test('jobs enforce ownership, serialize GPU work and suppress cancelled results', async () => {
  let finish!: (value: any) => void;
  const jobs = new MusicGenerationJobs({ 'qwen-score': { url: 'http://127.0.0.1:1' } }, () => undefined,
    async () => new Promise(resolve => { finish = resolve; }));
  const job = jobs.start('admin-a', request);
  assert.throws(() => jobs.get('admin-b', job.id), /not found/);
  assert.throws(() => jobs.audio('admin-b', job.id), /not found/);
  assert.throws(() => jobs.cancel('admin-b', job.id), /not found/);
  assert.throws(() => jobs.start('admin-a', request), /Another generation/);
  jobs.cancel('admin-a', job.id); finish({ notes });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(jobs.get('admin-a', job.id).status, 'cancelled');
  assert.equal(jobs.get('admin-a', job.id).result, undefined);
});
test('a configured YuE2 runtime still cannot run without evaluation permission', () => {
  let invoked = false;
  const jobs = new MusicGenerationJobs({ yue2: { python: 'python', model: 'models' } }, () => undefined,
    async () => { invoked = true; return { notes }; });
  assert.throws(() => jobs.start('admin', { ...request, engine: 'yue2' }), /permission pending/);
  assert.equal(invoked, false);
});
test('ACE adapter follows the documented job API with one low-memory candidate', async () => {
  const app = express(); app.use(express.json()); let submitted: any;
  app.post('/release_task', (req, res) => { submitted = req.body; res.json({ code: 200, data: { task_id: 'ace-job' } }); });
  app.post('/query_result', (req, res) => {
    assert.deepEqual(req.body.task_id_list, ['ace-job']);
    res.json({ code: 200, data: [{ task_id: 'ace-job', status: 1, result: JSON.stringify([{ file: '/v1/audio?path=result.wav' }]) }] });
  });
  app.get('/v1/audio', (_req, res) => res.type('audio/wav').send(Buffer.from('test-audio')));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const result = await runGeneration({ ...request, engine: 'ace-step', kind: 'sample', seconds: 2 }, { url }, new AbortController().signal, () => {});
    assert.equal(submitted.audio_duration, 10); assert.equal(submitted.batch_size, 1); assert.equal(submitted.thinking, false);
    assert.equal(result.audio!.toString(), 'test-audio'); assert.match(result.warning!, /10 seconds/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('Qwen adapter requests structured notes and rejects out-of-range composition', async () => {
  const app = express(); app.use(express.json()); let invalid = false;
  app.post('/api/chat', (req, res) => {
    assert.equal(req.body.keep_alive, 0); assert.equal(req.body.format.type, 'object');
    res.json({ message: { content: JSON.stringify({ notes: invalid ? [{ ...notes[0], lengthBeats: 1000 }] : notes }) } });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const config = { url: `http://127.0.0.1:${(server.address() as any).port}`, model: 'qwen3:8b' };
    assert.deepEqual((await runGeneration(request, config, new AbortController().signal, () => {})).notes, notes);
    invalid = true;
    await assert.rejects(runGeneration(request, config, new AbortController().signal, () => {}), /invalid note/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
