import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc.ts';
import { insertGeneratedAudio, insertGeneratedNotes } from '../services/melos/generation/insert.ts';
import {
  validateGenerationRequest,
  validateGeneratedNotes,
  vocalRegenToAceRepaintRequest,
  vocalRegenToSoulxRequest,
  type GenerationRequest,
} from '../services/melos/generation/types.ts';
import { MusicGenerationJobs } from '../services/melos/generation/jobs.ts';
import { runGeneration } from '../services/melos/generation/adapters.ts';
import { parseSongPrompt } from '../services/melos/direct/songPrompt.ts';
import { compileSongBrief } from '../services/melos/direct/songBrief.ts';
import { layoutVocal, markRendered, regenRequest, retextPhrase, staleRegions } from '../services/melos/direct/vocalScore.ts';
import './melosEnsemble.test';

const request: GenerationRequest = { engine: 'qwen-score', kind: 'midi', prompt: 'piano melody', lyrics: '', bpm: 120, bars: 4, seconds: 10, key: 'C Major', seed: 42 };
const notes = [{ startBeats: 0, lengthBeats: 1, key: 60, vel: 90 }, { startBeats: 1, lengthBeats: 2, key: 67, vel: 100 }];
const target = { destination: 'timeline' as const, startBeats: 8, instrument: 'onda' as const, name: 'Piano idea' };
const fixtureWavB64 = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ').toString('base64');

test('invalid generation and model output cannot reach a project', () => {
  for (const patch of [{ engine: '__proto__' }, { kind: 'sample' }, { bars: NaN }, { seed: -1 }, { seconds: 999 }, { prompt: '' }]) {
    assert.throws(() => validateGenerationRequest({ ...request, ...patch }));
  }
  // ACE-Step edit task validation
  const aceBase = { engine: 'ace-step', kind: 'audio', prompt: 'warm vocal', lyrics: 'hello', bpm: 120, bars: 8, seconds: 16, key: 'F minor', seed: 7 };
  assert.throws(() => validateGenerationRequest({ ...aceBase, task: 'extend', sourceAudio: fixtureWavB64 }), /Unsupported ACE-Step task/);
  assert.throws(() => validateGenerationRequest({ ...aceBase, task: 'repaint' }), /Source audio is required/);
  assert.throws(() => validateGenerationRequest({ ...aceBase, task: 'repaint', sourceAudio: fixtureWavB64, windowStartSec: 12, windowEndSec: 8 }), /windowEndSec/);
  assert.throws(() => validateGenerationRequest({ ...aceBase, task: 'lego', sourceAudio: fixtureWavB64, trackName: 'kazoo' }), /trackName/);
  assert.throws(() => validateGenerationRequest({ ...aceBase, task: 'extract', sourceAudio: fixtureWavB64 }), /trackName/);
  assert.throws(() => validateGenerationRequest({ ...aceBase, sourceAudio: fixtureWavB64 }), /Source audio requires an ACE-Step edit task/);
  assert.throws(() => validateGenerationRequest({ ...aceBase, engine: 'soulx-singer' }), /vocalNotes/);

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

test('cancelling either ACE identifier keeps its GPU slot until the submitted task ends', async () => {
  for (const engine of ['ace-step', 'ace-step-2.5'] as const) {
    let finish!: (value: any) => void;
    let workerSignal!: AbortSignal;
    const jobs = new MusicGenerationJobs({ [engine]: { url: 'http://127.0.0.1:1' } }, () => undefined,
      async (_req, _config, signal) => { workerSignal = signal; return new Promise(resolve => { finish = resolve; }); });
    const job = jobs.start('admin', { ...request, engine, kind: 'audio' });
    jobs.cancel('admin', job.id);
    assert.equal(workerSignal.aborted, false);
    assert.throws(() => jobs.start('admin', { ...request, engine, kind: 'audio' }), /Another generation/);
    finish({ audio: Buffer.from('fixture'), mime: 'audio/wav' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(jobs.get('admin', job.id).result, undefined);
  }
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
    assert.equal(submitted.task_type, 'text2music');
    assert.equal(submitted.dcw_enabled, undefined, 'checkpoint must decide DCW compatibility');
    assert.equal(submitted.sampler_mode, undefined, 'do not send an unsupported sampler control');
    assert.equal(result.audio!.toString(), 'test-audio'); assert.match(result.warning!, /10 seconds/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('VocalRegenRequest repaint, cover and reference-audio round-trip through ACE-Step multipart fixture server', async () => {
  const brief = compileSongBrief(parseSongPrompt(`deep house, 120 bpm, F minor, female vocal

[Verse 1]
City lights are calling out my name
Shadows dancing through the summer rain
Hold me closer till the morning breaks`));
  let layer = layoutVocal(brief);
  layer = markRendered(layer, layer.phrases.map(p => p.id), { sampleKey: 'take-1', engine: 'ace-step', seed: 11 });
  // Edit middle phrase only so it has before and after context phrases.
  layer = retextPhrase(layer, layer.phrases[1].id, 'Neon rivers running through my veins');
  const regions = staleRegions(layer);
  assert.equal(regions.length, 1);
  const regen = regenRequest(layer, regions[0], brief);
  assert.ok(regen.lyricsBefore.includes('City lights'));
  assert.ok(regen.lyrics.includes('Neon rivers'));
  assert.ok(regen.lyricsAfter.includes('Hold me closer'));

  const app = express();
  let lastForm: FormData | undefined;
  app.post('/release_task', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    const ct = req.headers['content-type'] || '';
    assert.match(ct, /multipart\/form-data/);
    lastForm = await new Response(req.body as Buffer, { headers: { 'content-type': ct } }).formData();
    res.json({ code: 200, data: { task_id: 'repaint-job' } });
  });
  app.post('/query_result', express.json(), (_req, res) => {
    res.json({ code: 200, data: [{ task_id: 'repaint-job', status: 1, result: JSON.stringify([{ file: '/v1/audio?path=repainted.wav' }]) }] });
  });
  app.get('/v1/audio', (_req, res) => res.type('audio/wav').send(Buffer.from('repainted-vocal-wav')));

  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const repaintReq = vocalRegenToAceRepaintRequest(regen, {
      sourceAudio: fixtureWavB64,
      referenceAudio: fixtureWavB64,
      totalSeconds: 24,
      seed: 99,
    });
    const out = await runGeneration(repaintReq, { url, aceThinking: true }, new AbortController().signal, () => {});
    assert.equal(out.audio!.toString(), 'repainted-vocal-wav');
    assert.ok(lastForm);
    assert.equal(lastForm.get('task_type'), 'repaint');
    assert.equal(Number(lastForm.get('repainting_start')), regen.startSec);
    assert.equal(Number(lastForm.get('repainting_end')), regen.endSec);
    assert.equal(lastForm.get('chunk_mask_mode'), 'explicit');
    assert.equal(lastForm.get('thinking'), 'false', 'ACE-Step ignores LM thinking on repaint');
    assert.equal(lastForm.get('vocal_language'), 'en');
    const lyricsSent = String(lastForm.get('lyrics'));
    assert.ok(lyricsSent.includes('City lights') && lyricsSent.includes('Neon rivers') && lyricsSent.includes('Hold me closer'));
    const uploadedSrc = lastForm.get('src_audio') as File;
    const uploadedRef = lastForm.get('reference_audio') as File;
    assert.equal(Buffer.from(await uploadedSrc.arrayBuffer()).toString('base64'), fixtureWavB64);
    assert.equal(Buffer.from(await uploadedRef.arrayBuffer()).toString('base64'), fixtureWavB64);

    // Cover mode + reference-audio style transfer
    const coverReq = validateGenerationRequest({
      engine: 'ace-step', kind: 'audio', task: 'cover', prompt: 'acoustic jazz cover', lyrics: '[Instrumental]',
      sourceAudio: fixtureWavB64, coverStrength: 0.75, bpm: 120, bars: 8, seconds: 16, key: 'F minor', seed: 5,
    });
    await runGeneration(coverReq, { url, aceThinking: true }, new AbortController().signal, () => {});
    assert.equal(lastForm!.get('task_type'), 'cover');
    assert.equal(lastForm!.get('audio_cover_strength'), '0.75');
    assert.equal(lastForm!.get('thinking'), 'false');

    const refStyleReq = validateGenerationRequest({
      engine: 'ace-step', kind: 'audio', task: 'text2music', prompt: 'warm synthwave groove', lyrics: '[Instrumental]',
      referenceAudio: fixtureWavB64, bpm: 118, bars: 8, seconds: 16, key: 'A minor', seed: 6,
    });
    await runGeneration(refStyleReq, { url }, new AbortController().signal, () => {});
    assert.equal(lastForm!.get('task_type'), 'text2music');
    assert.equal(lastForm!.get('audio_cover_strength'), '0.2');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('ACE-Step lego and extract refuse turbo and sft checkpoints clearly and succeed on base', async () => {
  let inventory: any = {
    models: [{ name: 'acestep-v15-turbo', is_default: true, is_loaded: true }],
    default_model: 'acestep-v15-turbo',
  };
  let releaseCalls = 0;
  let lastForm: FormData | undefined;

  const app = express();
  app.get('/v1/models', (_req, res) => res.json({ code: 200, data: inventory }));
  app.post('/release_task', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    releaseCalls++;
    const ct = req.headers['content-type'] || '';
    lastForm = await new Response(req.body as Buffer, { headers: { 'content-type': ct } }).formData();
    res.json({ code: 200, data: { task_id: 'stem-job' } });
  });
  app.post('/query_result', express.json(), (_req, res) => {
    res.json({ code: 200, data: [{ task_id: 'stem-job', status: 1, result: JSON.stringify([{ file: '/v1/audio?path=stem.wav' }]) }] });
  });
  app.get('/v1/audio', (_req, res) => res.type('audio/wav').send(Buffer.from('base-stem-audio')));

  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    const legoReq = validateGenerationRequest({
      engine: 'ace-step', kind: 'audio', task: 'lego', trackName: 'vocals',
      prompt: 'intimate female lead vocal', globalCaption: 'deep house in F minor',
      lyrics: 'Neon rivers running through my veins', sourceAudio: fixtureWavB64,
      bpm: 120, bars: 8, seconds: 16, key: 'F minor', seed: 12,
    });
    const extractReq = validateGenerationRequest({
      engine: 'ace-step', kind: 'audio', task: 'extract', trackName: 'vocals',
      prompt: '', lyrics: '', sourceAudio: fixtureWavB64,
      bpm: 120, bars: 8, seconds: 16, key: 'F minor', seed: 12,
    });

    // 1. Turbo checkpoint refused before /release_task, surfaced both directly and through MusicGenerationJobs.
    await assert.rejects(
      runGeneration(legoReq, { url }, new AbortController().signal, () => {}),
      /requires the base checkpoint.*turbo \(acestep-v15-turbo\)/,
    );
    assert.equal(releaseCalls, 0);

    const jobs = new MusicGenerationJobs({ 'ace-step': { url } }, () => undefined);
    const failedJob = jobs.start('admin', extractReq);
    for (let i = 0; i < 40 && jobs.get('admin', failedJob.id).status === 'running'; i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    assert.equal(jobs.get('admin', failedJob.id).status, 'failed');
    assert.match(jobs.get('admin', failedJob.id).message, /requires the base checkpoint.*turbo/);
    assert.equal(releaseCalls, 0);

    // 2. SFT checkpoint also refused clearly.
    inventory = {
      models: [{ name: 'acestep-v15-sft', is_default: true, is_loaded: true }],
      default_model: 'acestep-v15-sft',
    };
    await assert.rejects(
      runGeneration(extractReq, { url }, new AbortController().signal, () => {}),
      /requires the base checkpoint.*sft \(acestep-v15-sft\)/,
    );
    assert.equal(releaseCalls, 0);

    // 3. Base checkpoint loaded alongside turbo selects acestep-v15-base and runs lego + extract.
    inventory = {
      models: [
        { name: 'acestep-v15-turbo', is_default: true, is_loaded: true },
        { name: 'acestep-v15-base', is_default: false, is_loaded: true },
      ],
      default_model: 'acestep-v15-turbo',
    };
    const legoOut = await runGeneration(legoReq, { url, aceThinking: true }, new AbortController().signal, () => {});
    assert.equal(legoOut.audio!.toString(), 'base-stem-audio');
    assert.equal(releaseCalls, 1);
    assert.equal(lastForm!.get('task_type'), 'lego');
    assert.equal(lastForm!.get('track_name'), 'vocals');
    assert.equal(lastForm!.get('model'), 'acestep-v15-base');
    assert.equal(lastForm!.get('instruction'), 'Generate the VOCALS track based on the audio context:');
    assert.equal(lastForm!.get('global_caption'), 'deep house in F minor');
    assert.equal(lastForm!.get('inference_steps'), '32');

    const extractOut = await runGeneration(extractReq, { url, aceThinking: true }, new AbortController().signal, () => {});
    assert.equal(extractOut.audio!.toString(), 'base-stem-audio');
    assert.equal(releaseCalls, 2);
    assert.equal(lastForm!.get('task_type'), 'extract');
    assert.equal(lastForm!.get('track_name'), 'vocals');
    assert.equal(lastForm!.get('instruction'), 'Extract the VOCALS track from the audio:');
    assert.equal(lastForm!.get('thinking'), 'false');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('SoulX-Singer worker formats VocalRegenRequest notes and invokes documented cli.inference entry point', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'melos-soulx-fixture-'));
  const prevPerm = process.env.SOULX_SINGER_EVALUATION_PERMISSION_REF;
  const prevPyPath = process.env.PYTHONPATH;
  try {
    // Build fake SoulX-Singer repo + minimal torch stub so music_lab_worker.py runs offline with zero weights/GPU.
    await mkdir(path.join(fixtureRoot, 'pretrained_models', 'SoulX-Singer'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'soulxsinger', 'config'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'soulxsinger', 'utils', 'phoneme'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'cli'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'preprocess', 'tools'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'py_stubs'), { recursive: true });

    await writeFile(path.join(fixtureRoot, 'pretrained_models', 'SoulX-Singer', 'model.pt'), 'stub-ckpt');
    await writeFile(path.join(fixtureRoot, 'soulxsinger', 'config', 'soulxsinger.yaml'), 'audio: { sample_rate: 24000 }');
    await writeFile(path.join(fixtureRoot, 'soulxsinger', 'utils', 'phoneme', 'phone_set.json'), '["<PAD>", "<SP>"]');

    const capturedPath = path.join(fixtureRoot, 'captured_call.json');
    await writeFile(path.join(fixtureRoot, 'py_stubs', 'torch.py'), `
class cuda:
    @staticmethod
    def is_available():
        return False
    @staticmethod
    def empty_cache():
        pass
def manual_seed(_s):
    pass
`);
    await writeFile(path.join(fixtureRoot, 'soulxsinger', '__init__.py'), '');
    await writeFile(path.join(fixtureRoot, 'soulxsinger', 'utils', '__init__.py'), '');
    await writeFile(path.join(fixtureRoot, 'soulxsinger', 'utils', 'file_utils.py'), `
def load_config(config_path):
    return {"loaded_from": config_path}
`);
    await writeFile(path.join(fixtureRoot, 'preprocess', '__init__.py'), '');
    await writeFile(path.join(fixtureRoot, 'preprocess', 'tools', '__init__.py'), '');
    await writeFile(path.join(fixtureRoot, 'preprocess', 'tools', 'midi_parser.py'), `
import json
from dataclasses import dataclass, asdict

SILENCE_THRESHOLD_SEC = 0.2

@dataclass
class Note:
    start_s: float
    note_dur: float
    note_text: str
    note_pitch: int
    note_type: int

def notes2meta(notes, meta_path, vocal_file=None, language="Mandarin", pitch_extractor=None):
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"language": language, "notes": [asdict(n) for n in notes]}, f)
`);
    await writeFile(path.join(fixtureRoot, 'preprocess', 'pipeline.py'), `
import json, os

class PreprocessPipeline:
    def __init__(self, device, language, save_dir, vocal_sep, max_merge_duration):
        self.save_dir = save_dir
        self.language = language
    def run(self, audio_path, vocal_sep, max_merge_duration, language):
        os.makedirs(self.save_dir, exist_ok=True)
        with open(os.path.join(self.save_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump([{"language": language, "audio_path": audio_path}], f)
`);
    await writeFile(path.join(fixtureRoot, 'cli', '__init__.py'), '');
    await writeFile(path.join(fixtureRoot, 'cli', 'inference.py'), `
import json, os

def build_model(model_path, config, device="cuda", use_fp16=False):
    return {"model_path": model_path, "config": config, "device": device, "use_fp16": use_fp16}

def process(args, config, model):
    with open(args.target_metadata_path, "r", encoding="utf-8") as f:
        target_meta = json.load(f)
    with open(${JSON.stringify(capturedPath)}, "w", encoding="utf-8") as f:
        json.dump({
            "args": vars(args),
            "model": model,
            "target_meta": target_meta,
        }, f)
    os.makedirs(args.save_dir, exist_ok=True)
    with open(os.path.join(args.save_dir, "generated.wav"), "wb") as f:
        f.write(b"RIFF\\x24\\x00\\x00\\x00WAVEfmt soulx-fixture")
`);

    const brief = compileSongBrief(parseSongPrompt(`soul ballad, 90 bpm, C major, female vocal\n\n[Verse 1]\nHold~ me-e now`));
    const layer = layoutVocal(brief);
    const regen = regenRequest(layer, staleRegions(layer)[0], brief);
    const soulxReq = vocalRegenToSoulxRequest(regen, { referenceAudio: fixtureWavB64, seed: 7, autoShift: true, pitchShift: -2 });

    process.env.SOULX_SINGER_EVALUATION_PERMISSION_REF = 'fixture-eval';
    process.env.PYTHONPATH = [path.join(fixtureRoot, 'py_stubs'), prevPyPath].filter(Boolean).join(path.delimiter);

    const out = await runGeneration(soulxReq, { python: 'python', model: fixtureRoot }, new AbortController().signal, () => {});
    assert.match(out.audio!.toString('utf8'), /soulx-fixture/);

    const captured = JSON.parse(await readFile(capturedPath, 'utf8'));
    assert.equal(captured.args.control, 'score');
    assert.equal(captured.args.auto_shift, true);
    assert.equal(captured.args.pitch_shift, -2);
    assert.ok(captured.args.model_path.endsWith(path.join('pretrained_models', 'SoulX-Singer', 'model.pt')));
    assert.ok(captured.args.config.endsWith(path.join('soulxsinger', 'config', 'soulxsinger.yaml')));
    assert.ok(captured.args.phoneset_path.endsWith(path.join('soulxsinger', 'utils', 'phoneme', 'phone_set.json')));
    assert.equal(captured.target_meta.language, 'English');
    // Melisma syllable ("e" continuation or empty) and lyric syllables map to documented note_type 2 / 3.
    const sungNotes = captured.target_meta.notes.filter((n: any) => n.note_type !== 1);
    assert.ok(sungNotes.length >= 3);
    assert.equal(sungNotes[0].note_type, 2);
  } finally {
    if (prevPerm === undefined) delete process.env.SOULX_SINGER_EVALUATION_PERMISSION_REF;
    else process.env.SOULX_SINGER_EVALUATION_PERMISSION_REF = prevPerm;
    if (prevPyPath === undefined) delete process.env.PYTHONPATH;
    else process.env.PYTHONPATH = prevPyPath;
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Qwen adapter requests structured notes and rejects out-of-range composition', async () => {
  const app = express(); app.use(express.json()); let invalid = false;
  app.post('/api/chat', (req, res) => {
    assert.equal(req.body.keep_alive, 0); assert.equal(req.body.format.type, 'object');
    if (req.body.format.properties.chords) return void res.json({ message: { content: JSON.stringify({
      concept: 'A restrained piano hook grows into a full cadence.', chords: ['C', 'Am', 'G7', 'C'],
      sections: [{ title: 'Theme', startBar: 0, bars: invalid ? 3 : 4, direction: 'Develop the piano hook with bass responses.', dynamic: 'mf' }],
    }) } });
    res.json({ message: { content: JSON.stringify({ notes: invalid ? [{ ...notes[0], lengthBeats: 1000 }] : notes }) } });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const config = { url: `http://127.0.0.1:${(server.address() as any).port}`, model: 'qwen3:8b' };
    assert.deepEqual((await runGeneration(request, config, new AbortController().signal, () => {})).notes, notes);
    assert.equal((await runGeneration({ ...request, key: 'C Major', purpose: 'arrangement-plan' }, config,
      new AbortController().signal, () => {})).plan?.chords.length, 4);
    invalid = true;
    await assert.rejects(runGeneration(request, config, new AbortController().signal, () => {}), /invalid note/);
    await assert.rejects(runGeneration({ ...request, key: 'C Major', purpose: 'arrangement-plan' }, config,
      new AbortController().signal, () => {}), /unplanned/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
