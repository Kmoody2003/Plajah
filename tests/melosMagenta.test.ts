import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc.ts';
import { validateGenerationRequest, ENGINE_KINDS } from '../services/melos/generation/types.ts';
import { buildPianorollRuns, validateMagentaOptions, MAGENTA_FRAME_RATE } from '../services/melos/generation/magentaRt.ts';
import { magentaGuideNotes, magentaGuideTracks } from '../services/melos/generation/magentaGuide.ts';
import { runGeneration, generationConfigs, runtimeConfigured } from '../services/melos/generation/adapters.ts';
import { MUSIC_ENGINES } from '../services/musicEnginePolicy.ts';

const base = { engine: 'magenta-rt2', kind: 'audio', prompt: 'warm neo-soul keys and brushed drums', lyrics: '', bpm: 120, bars: 8, seconds: 8, key: 'C Major', seed: 7 };
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(60)]);

test('Magenta RT 2 is registered as an open-weights engine with audio and sample output', () => {
  const engine = MUSIC_ENGINES.find(e => e.id === 'magenta-rt2');
  assert.ok(engine);
  assert.equal(engine.permissionRequired, false);
  assert.match(engine.license, /CC-BY 4\.0/);
  assert.deepEqual([...ENGINE_KINDS['magenta-rt2']], ['audio', 'sample']);
  assert.equal(runtimeConfigured(generationConfigs({ MELOS_MAGENTA_URL: 'http://127.0.0.1:8765' } as any)['magenta-rt2']), true);
  assert.equal(runtimeConfigured(generationConfigs({} as any)['magenta-rt2']), false);
});

test('Magenta request validation', () => {
  const ok = validateGenerationRequest({ ...base, magenta: { drums: 'off', autoStrum: false, cfgStyle: 4, temperature: 1.1, topK: 40, styles: [{ text: 'lo-fi tape', weight: 0.4 }] } });
  assert.equal(ok.magenta!.drums, 'off');
  assert.equal(ok.magenta!.styles![0].text, 'lo-fi tape');
  for (const magenta of [{ drums: 'loud' }, { cfgStyle: 9 }, { temperature: 0 }, { topK: 2.5 }, { styles: [{ text: '', weight: 1 }] },
    { styles: Array(5).fill({ text: 'x', weight: 1 }) }, { guideNotes: [{ startSec: 99, lengthSec: 1, key: 60 }] }]) {
    assert.throws(() => validateGenerationRequest({ ...base, magenta }), undefined, JSON.stringify(magenta));
  }
  assert.throws(() => validateGenerationRequest({ ...base, seconds: 121 }), /120 seconds/);
  assert.throws(() => validateGenerationRequest({ ...base, kind: 'midi' }));
  assert.throws(() => validateGenerationRequest({ ...base, engine: 'ace-step', magenta: {} }), /only supported on Magenta/);
  // Style-only takes (no prompt) are allowed when a style or reference audio is given.
  assert.throws(() => validateGenerationRequest({ ...base, prompt: '' }), /Describe/);
  assert.ok(validateGenerationRequest({ ...base, prompt: '', magenta: { styles: [{ text: 'ambient choir pad', weight: 1 }] } }));
  // Guide notes running past the window are trimmed to it.
  const trimmed = validateMagentaOptions({ guideNotes: [{ startSec: 7, lengthSec: 5, key: 60.4 }] }, 8);
  assert.deepEqual(trimmed.guideNotes, [{ startSec: 7, lengthSec: 1, key: 60 }]);
});

test('pianoroll runs cover every frame, collapse repeats and isolate onsets', () => {
  assert.deepEqual(buildPianorollRuns(undefined, 4), []);
  const notes = [{ startSec: 0, lengthSec: 1, key: 60 }, { startSec: 0, lengthSec: 1, key: 64 }, { startSec: 1, lengthSec: 1, key: 67 }];
  const strum = buildPianorollRuns(notes, 3, true);
  assert.equal(strum.reduce((n, r) => n + r.frames, 0), 3 * MAGENTA_FRAME_RATE);
  assert.deepEqual(strum, [
    { frames: 25, held: [60, 64], onset: [] },
    { frames: 25, held: [67], onset: [] },
    { frames: 25, held: [], onset: [] },
  ]);
  const exact = buildPianorollRuns(notes, 3, false);
  assert.equal(exact.reduce((n, r) => n + r.frames, 0), 75);
  assert.deepEqual(exact.slice(0, 2), [{ frames: 1, held: [], onset: [60, 64] }, { frames: 24, held: [60, 64], onset: [] }]);
  assert.deepEqual(exact[2], { frames: 1, held: [], onset: [67] });
  // Same pitch struck twice back to back keeps two separate onsets.
  const repeat = buildPianorollRuns([{ startSec: 0, lengthSec: 0.5, key: 48 }, { startSec: 0.5, lengthSec: 0.5, key: 48 }], 1, false);
  assert.deepEqual(repeat.filter(r => r.onset.length).length, 2);
});

test('guide notes come from a timeline MIDI track with the tempo applied', () => {
  const doc = newGrooveDoc('u1', 'Magenta guide');
  doc.bpm = 120;
  (doc as any).tempoMap = undefined;
  doc.arrangement.push({ id: 'keys', kind: 'instrument', name: 'Keys', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0,
    clips: [{ id: 'c1', startBeats: 4, lengthBeats: 8, notes: [
      { id: 'n1', startBeats: 0, lengthBeats: 2, key: 60, vel: 90 },
      { id: 'n2', startBeats: 6, lengthBeats: 4, key: 67, vel: 90 },
    ] }] } as any);
  assert.deepEqual(magentaGuideTracks(doc).map(t => t.id), ['keys']);
  // Render from beat 4 for 4 s (= 8 beats at 120 bpm): n1 at 0 s for 1 s, n2 at 3 s clipped by the clip end then the window.
  const notes = magentaGuideNotes(doc, 'keys', 4, 4);
  assert.equal(notes.length, 2);
  assert.deepEqual(notes[0], { startSec: 0, lengthSec: 1, key: 60 });
  assert.equal(notes[1].startSec, 3);
  assert.equal(notes[1].lengthSec, 1);
  assert.deepEqual(magentaGuideNotes(doc, 'missing', 0, 4), []);
});

test('Magenta adapter sends style, runs and controls to the sidecar and returns its WAV', async () => {
  const app = express(); app.use(express.json({ limit: '5mb' }));
  let body: any; let auth = '';
  app.post('/generate', (req, res) => { body = req.body; auth = req.headers.authorization || ''; res.type('audio/wav').send(wav); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const req = validateGenerationRequest({ ...base, seconds: 2, referenceAudio: Buffer.from('fake').toString('base64'),
      magenta: { drums: 'on', autoStrum: false, cfgStyle: 4, cfgNotes: 2, audioStyleWeight: 0.6, guideNotes: [{ startSec: 0, lengthSec: 1, key: 62 }] } });
    const progress: string[] = [];
    const out = await runGeneration(req, { url, token: 'sek' }, new AbortController().signal, text => progress.push(text));
    assert.equal(auth, 'Bearer sek');
    assert.equal(body.seconds, 2);
    assert.equal(body.prompt, base.prompt);
    assert.equal(body.drums, 'on');
    assert.equal(body.autoStrum, false);
    assert.deepEqual(body.cfg, { musiccoca: 4, notes: 2 });
    assert.equal(body.audioStyleWeight, 0.6);
    assert.ok(body.styleAudio);
    assert.equal(body.runs.reduce((n: number, r: any) => n + r.frames, 0), 50);
    assert.deepEqual(body.runs[0], { frames: 1, held: [], onset: [62] });
    assert.equal(out.mime, 'audio/wav');
    assert.equal(out.audio!.subarray(0, 4).toString(), 'RIFF');
    assert.match(out.warning!, /CC-BY 4\.0/);
    assert.match(progress[0], /1 guide notes/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Magenta adapter surfaces busy and refused sidecar replies without leaking internals', async () => {
  let status = 409;
  const app = express();
  app.post('/generate', (_req, res) => { res.status(status).json({ error: status === 400 ? 'seconds must be in (0, 120]' : 'busy' }); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const req = validateGenerationRequest(base);
    await assert.rejects(runGeneration(req, { url }, new AbortController().signal, () => {}), /busy with another render/);
    status = 400;
    await assert.rejects(runGeneration(req, { url }, new AbortController().signal, () => {}), /refused the request: seconds must be/);
    status = 500;
    await assert.rejects(runGeneration(req, { url }, new AbortController().signal, () => {}), /HTTP 500/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
