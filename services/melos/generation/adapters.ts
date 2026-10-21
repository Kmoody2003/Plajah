// Server only. Engine URLs and Python paths come from operator configuration, never requests.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { MusicEngineId } from '../../musicEnginePolicy';
import { validateGeneratedNotes, type GenerationRequest, type GenerationResult } from './types';
import { buildEnsemblePlan, validateEnsemblePlan } from './ensemblePlan';

export interface AdapterResult extends GenerationResult { audio?: Buffer }
export interface EngineConfig { url?: string; token?: string; python?: string; model?: string; aceThinking?: boolean }
export type EngineConfigs = Partial<Record<MusicEngineId, EngineConfig>>;
export function generationConfigs(env: NodeJS.ProcessEnv = process.env): EngineConfigs {
  return {
    ...(env.MELOS_ACE_URL ? { 'ace-step-2.5': { url: env.MELOS_ACE_URL, token: env.MELOS_ACE_TOKEN, aceThinking: env.MELOS_ACE_THINKING === 'true' } } : {}),
    'ace-step': { url: env.MELOS_ACE_URL, token: env.MELOS_ACE_TOKEN, aceThinking: env.MELOS_ACE_THINKING === 'true' },
    'qwen-score': env.MELOS_OLLAMA_URL
      ? { url: env.MELOS_OLLAMA_URL, model: env.MELOS_QWEN_MODEL || 'qwen3:8b', token: env.MELOS_OLLAMA_TOKEN }
      : { python: env.MELOS_QWEN_PYTHON, model: env.MELOS_QWEN_GGUF },
    heartmula: { python: env.MELOS_HEARTMULA_PYTHON, model: env.MELOS_HEARTMULA_MODEL },
    yue2: { python: env.MELOS_YUE2_PYTHON, model: env.MELOS_YUE2_MODEL },
    sheetsage2: { python: env.MELOS_SHEETSAGE2_PYTHON, model: env.MELOS_SHEETSAGE2_MODEL },
  };
}
export function runtimeConfigured(config?: EngineConfig) {
  return !!(config?.url || (config?.python && config?.model));
}
async function boundedBytes(response: Response, max: number): Promise<Buffer> {
  if (!response.ok) throw new Error(`Engine request failed (HTTP ${response.status})`);
  if (!response.body) throw new Error('Engine returned an empty response');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > max) throw new Error('Engine output exceeded the evaluation size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
export async function runGeneration(request: GenerationRequest, config: EngineConfig, signal: AbortSignal, progress: (text: string) => void): Promise<AdapterResult> {
  const headers = { 'Content-Type': 'application/json', ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) };
  const post = async (route: string, data: unknown) => {
    const response = await fetch(new URL(route, config.url), { method: 'POST', headers, body: JSON.stringify(data), signal, redirect: 'error' });
    const result = JSON.parse((await boundedBytes(response, 2000000)).toString('utf8'));
    if (result.error || (typeof result.code === 'number' && result.code !== 200)) throw new Error('Engine rejected the request; inspect its local log');
    return result;
  };
  if (request.engine === 'qwen-score') {
    const chat = async (payload: unknown) => {
      if (config.url) return post('/api/chat', payload);
      if (!config.python || !config.model) throw new Error('Configure Ollama or a local GGUF score runtime');
      const dir = await mkdtemp(path.join(tmpdir(), 'melos-score-'));
      try {
        await writeFile(path.join(dir, 'request.json'), JSON.stringify({ model: config.model, payload }));
        await new Promise<void>((resolve, reject) => {
          const child = spawn(config.python!, [fileURLToPath(new URL('../../../scripts/music_score_worker.py', import.meta.url)), dir],
            { shell: false, windowsHide: true, signal, stdio: ['ignore', 'ignore', 'pipe'],
              env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } });
          child.stderr?.on('data', () => {});
          child.once('error', reject);
          child.once('close', code => code === 0 ? resolve() : reject(new Error('Local score worker failed; inspect the Python environment and GPU memory')));
        });
        signal.throwIfAborted();
        const resultPath = path.join(dir, 'result.json');
        if ((await stat(resultPath)).size > 2000000) throw new Error('Score output exceeded its size limit');
        return JSON.parse(await readFile(resultPath, 'utf8'));
      } finally { await rm(dir, { recursive: true, force: true }); }
    };
    if (request.purpose === 'arrangement-plan') {
      progress('Planning form, harmonic motion, motif development and instrument roles…');
      const base = buildEnsemblePlan({ prompt: request.prompt, bpm: request.bpm, keySignature: request.key,
        startBeats: 0, regionBeats: request.bars * 4, allowShort: true });
      const reply = await chat({
        model: config.model, stream: false, think: false, keep_alive: 0,
        options: { seed: request.seed, num_ctx: 8192, num_predict: 4096, temperature: 0.65 },
        format: { type: 'object', properties: {
          concept: { type: 'string' }, chords: { type: 'array', items: { type: 'string' }, minItems: request.bars, maxItems: request.bars },
          sections: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', properties: {
            title: { type: 'string' }, startBar: { type: 'integer' }, bars: { type: 'integer' },
            direction: { type: 'string' }, dynamic: { type: 'string' },
          }, required: ['title', 'startBar', 'bars', 'direction', 'dynamic'] } },
        }, required: ['concept', 'chords', 'sections'] },
        messages: [
          { role: 'system', content: `You are the local music director. Plan EXACTLY ${request.bars} bars in 4/4, ${request.bpm} BPM, ${request.key}. Return the required JSON. Chords: one named chord per bar (Dm, A7, Fmaj7 etc.). Sections use zero-based startBar, cover all bars once without gaps/overlap, at most 8 sections. Plan a memorable motif, phrase lengths, voice-leading, harmonic tension and release, purposeful groove and production contrast. The requested genre and instrumentation take precedence over generic pop form. Direction must specify what the platform synths play and what is left for generated audio. Do not invent sample libraries or lyric singing capabilities for synths. Dynamics p/mp/mf/f. /no_think` },
          { role: 'user', content: request.prompt },
        ],
      });
      return { plan: validateEnsemblePlan(JSON.parse(reply.message?.content || '{}'), base) };
    }
    progress('Composing editable notes…');
    const reply = await chat({
      model: config.model, stream: false, think: false, keep_alive: 0,
      options: { seed: request.seed, num_ctx: 4096, num_predict: 4096, temperature: 0.7 },
      format: { type: 'object', properties: { notes: { type: 'array', items: { type: 'object', properties: {
        startBeats: { type: 'number' }, lengthBeats: { type: 'number' }, key: { type: 'integer' }, vel: { type: 'integer' },
      }, required: ['startBeats', 'lengthBeats', 'key', 'vel'] } } }, required: ['notes'] },
      messages: [
        { role: 'system', content: `Compose one playable musical part. Return JSON notes with startBeats and lengthBeats in quarter-note beats, key as MIDI 0-127, vel 1-127. All notes must fit within ${request.bars * 4} beats. Tempo ${request.bpm}, key ${request.key}. No prose. /no_think` },
        { role: 'user', content: request.prompt },
      ],
    });
    const raw = JSON.parse(reply.message?.content || '{}');
    return { notes: validateGeneratedNotes(raw.notes, request.bars * 4) };
  }
  if (request.engine === 'ace-step' || request.engine === 'ace-step-2.5') {
    progress('Submitting audio generation…');
    const isFullSong = request.kind === 'audio';
    const isUltraEngine = request.engine === 'ace-step-2.5';
    const defaultInstrumentalArrangement = isFullSong
      ? '[Instrumental]\n[Intro - Atmospheric Motif & Texture]\n[Verse - Tight Pocket Groove & Bassline]\n[Chorus - Full Harmonic Lift & Layered Arrangement]\n[Bridge - Dynamic Breakdown]\n[Outro - Warm Fade]'
      : '[Instrumental]';
    const studioPrompt = request.kind === 'sample'
      ? `${request.prompt}. Isolated musical sample, no vocals.`
      : `${request.prompt}. Studio master quality, wide stereo separation, crisp transient definition, rich harmonic arrangement.`;
    const reply = await post('/release_task', {
      prompt: studioPrompt,
      lyrics: request.lyrics || defaultInstrumentalArrangement, audio_duration: Math.max(10, request.seconds),
      bpm: Math.round(request.bpm), key_scale: request.key, time_signature: '4',
      seed: request.seed, use_random_seed: false, batch_size: 1, audio_format: 'wav',
      thinking: isFullSong && !!config.aceThinking, use_cot_caption: false, use_cot_language: false, use_format: false,
      inference_steps: isUltraEngine ? 16 : 8, infer_method: 'ode', shift: 3.0,
      // Omit dcw_enabled: this runtime resolves it by checkpoint. Forcing it on
      // incompatible checkpoints can distort audio (upstream issue #1259).
      task_type: 'text2music',
    });
    const taskId = reply.data?.task_id;
    if (typeof taskId !== 'string' || !taskId) throw new Error('ACE-Step did not return a task ID');
    progress('Generating audio on ACE-Step…');
    for (;;) {
      await delay(1500, undefined, { signal });
      const poll = await post('/query_result', { task_id_list: [taskId] });
      const job = poll.data?.find((item: any) => item.task_id === taskId);
      if (Number(job?.status) === 2) throw new Error('ACE-Step generation failed; inspect its local log');
      if (Number(job?.status) !== 1) continue;
      const items = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
      const file = items?.[0]?.file;
      if (typeof file !== 'string') throw new Error('ACE-Step returned no audio');
      const url = new URL(file, config.url);
      if (url.origin !== new URL(config.url!).origin || url.pathname !== '/v1/audio') throw new Error('ACE-Step returned an unexpected audio location');
      progress('Receiving generated audio…');
      const audio = await boundedBytes(await fetch(url, { headers, signal, redirect: 'error' }), 50000000);
      return { audio, mime: 'audio/wav', warning: request.kind === 'sample' ? 'ACE-Step generates at least 10 seconds. Choose a region from the preview for your sample.' : undefined };
    }
  }
  if (!config.python || !config.model) throw new Error('Python runtime and local model directory are required');
  const dir = await mkdtemp(path.join(tmpdir(), 'melos-generation-'));
  try {
    await writeFile(path.join(dir, 'request.json'), JSON.stringify({ ...request, model: config.model }));
    const script = fileURLToPath(new URL('../../../scripts/music_lab_worker.py', import.meta.url));
    progress(`Running ${request.engine}…`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(config.python!, [script, dir], {
        shell: false, windowsHide: true, signal,
        env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      // Consume stderr without forwarding model logs or filesystem paths to clients.
      child.stderr?.on('data', () => {});
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(`${request.engine} worker failed. Check its Python environment, model files and GPU memory.`)));
    });
    signal.throwIfAborted();
    const metadata = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'));
    const result: AdapterResult = {};
    if (metadata.notes) result.notes = validateGeneratedNotes(metadata.notes);
    if (typeof metadata.abc === 'string' && metadata.abc.length <= 100000) result.abc = metadata.abc;
    if (typeof metadata.warning === 'string') result.warning = metadata.warning.slice(0, 500);
    if (metadata.audio) {
      // Never consume an arbitrary worker-provided path.
      if (!['audio.wav', 'audio.mp3'].includes(metadata.audio)) throw new Error('Unexpected audio artifact');
      const filename = path.join(dir, metadata.audio);
      if ((await stat(filename)).size > 50000000) throw new Error('Generated audio exceeds 50 MB');
      result.audio = await readFile(filename);
      result.mime = metadata.audio.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
    }
    if (!result.audio && !result.notes?.length && !result.abc) throw new Error('Worker returned no musical output');
    return result;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
