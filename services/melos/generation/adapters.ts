// Server only. Engine URLs and Python paths come from operator configuration, never requests.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { MusicEngineId } from '../../musicEnginePolicy';
import {
  ACE_BASE_ONLY_TASKS,
  AdapterUserError,
  validateGeneratedNotes,
  type AceTaskType,
  type GenerationRequest,
  type GenerationResult,
} from './types';
import { buildEnsemblePlan, validateEnsemblePlan } from './ensemblePlan';
import { aceStepAudioUrl } from './aceStepProtocol';

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
    'heartmula-rl-3b': { python: env.MELOS_HEARTMULA_RL_PYTHON || env.MELOS_HEARTMULA_PYTHON, model: env.MELOS_HEARTMULA_RL_MODEL },
    'soulx-singer': { python: env.MELOS_SOULX_SINGER_PYTHON, model: env.MELOS_SOULX_SINGER_MODEL },
    yue2: { python: env.MELOS_YUE2_PYTHON, model: env.MELOS_YUE2_MODEL },
    sheetsage2: { python: env.MELOS_SHEETSAGE2_PYTHON, model: env.MELOS_SHEETSAGE2_MODEL },
  };
}
export function runtimeConfigured(config?: EngineConfig) {
  return !!(config?.url || (config?.python && config?.model));
}
function resolveWorkerScript(scriptName: string): string {
  const candidates = [
    fileURLToPath(new URL(`../../../scripts/${scriptName}`, import.meta.url)),
    fileURLToPath(new URL(`../../scripts/${scriptName}`, import.meta.url)),
    path.resolve(process.cwd(), 'scripts', scriptName),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0];
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

function classifyAceCheckpoint(name: string): 'base' | 'turbo' | 'sft' | 'unknown' {
  const lower = name.toLowerCase();
  if (lower.includes('turbo')) return 'turbo';
  if (/(^|[-_/])sft($|[-_/])/.test(lower)) return 'sft';
  if (/(^|[-_/])base($|[-_/])/.test(lower)) return 'base';
  return 'unknown';
}

function sanitizeModelLabel(raw: unknown): string {
  if (typeof raw !== 'string') return 'unknown';
  const base = raw.split(/[\\/]/).pop() || raw;
  return base.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'unknown';
}

/**
 * ACE-Step `lego`, `extract`, and `complete` require the pure `base` checkpoint (`acestep/constants.py`).
 * Query `/v1/models` and refuse before `/release_task` when the connected runtime only has `turbo` or `sft`.
 */
async function resolveAceBaseCheckpoint(
  baseUrl: string,
  authHeaders: Record<string, string>,
  task: AceTaskType,
  signal: AbortSignal,
): Promise<string | undefined> {
  let payload: any;
  try {
    const response = await fetch(new URL('/v1/models', baseUrl), { headers: authHeaders, signal, redirect: 'error' });
    payload = JSON.parse((await boundedBytes(response, 500000)).toString('utf8'));
  } catch {
    throw new AdapterUserError(
      409,
      `ACE-Step '${task}' requires a base checkpoint (such as acestep-v15-base), and the connected server could not confirm its loaded checkpoint via /v1/models.`,
    );
  }
  const data = payload?.data ?? {};
  const defaultModel = typeof data.default_model === 'string' ? data.default_model : '';
  const models: any[] = Array.isArray(data.models) ? data.models : [];
  const loaded = models.filter(m => m && typeof m.name === 'string' && m.is_loaded !== false);
  const candidates = loaded.length ? loaded : (defaultModel ? [{ name: defaultModel, is_default: true }] : []);

  const baseCandidate = candidates.find(m => {
    if (classifyAceCheckpoint(m.name) !== 'base') return false;
    if (Array.isArray(m.supported_task_types) && !m.supported_task_types.includes(task)) return false;
    return true;
  });
  if (baseCandidate) {
    return baseCandidate.name === defaultModel ? undefined : String(baseCandidate.name);
  }

  const primaryName = sanitizeModelLabel(defaultModel || candidates[0]?.name || 'unidentified');
  const variant = classifyAceCheckpoint(primaryName);
  const variantDesc = variant === 'turbo' ? 'turbo' : variant === 'sft' ? 'sft' : 'non-base';
  throw new AdapterUserError(
    409,
    `ACE-Step '${task}' requires the base checkpoint (e.g. acestep-v15-base), but the connected checkpoint is ${variantDesc} (${primaryName}). Load acestep-v15-base to run '${task}'.`,
  );
}

function sniffAudioUpload(buf: Buffer, prefix: string): { mime: string; filename: string } {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'fLaC') return { mime: 'audio/flac', filename: `${prefix}.flac` };
  if (buf.length >= 4 && buf.subarray(0, 4).toString('ascii') === 'OggS') return { mime: 'audio/ogg', filename: `${prefix}.ogg` };
  if ((buf.length >= 3 && buf.subarray(0, 3).toString('ascii') === 'ID3') ||
    (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    return { mime: 'audio/mpeg', filename: `${prefix}.mp3` };
  }
  return { mime: 'audio/wav', filename: `${prefix}.wav` };
}

export async function runGeneration(request: GenerationRequest, config: EngineConfig, signal: AbortSignal, progress: (text: string) => void): Promise<AdapterResult> {
  const authHeaders: Record<string, string> = config.token ? { Authorization: `Bearer ${config.token}` } : {};
  const headers = { 'Content-Type': 'application/json', ...authHeaders };
  const post = async (route: string, data: unknown) => {
    const response = await fetch(new URL(route, config.url), { method: 'POST', headers, body: JSON.stringify(data), signal, redirect: 'error' });
    const result = JSON.parse((await boundedBytes(response, 2000000)).toString('utf8'));
    if (result.error || (typeof result.code === 'number' && result.code !== 200)) throw new Error('Engine rejected the request; inspect its local log');
    return result;
  };
  const postMultipart = async (route: string, fields: Record<string, unknown>, files: Record<string, Buffer>) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) form.append(key, String(item));
      } else {
        form.append(key, String(value));
      }
    }
    for (const [field, buf] of Object.entries(files)) {
      const { mime, filename } = sniffAudioUpload(buf, field);
      form.append(field, new Blob([new Uint8Array(buf)], { type: mime }), filename);
    }
    const response = await fetch(new URL(route, config.url), { method: 'POST', headers: authHeaders, body: form, signal, redirect: 'error' });
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
          const child = spawn(config.python!, [resolveWorkerScript('music_score_worker.py'), dir],
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
    const task: AceTaskType = request.task ?? 'text2music';
    const isBaseOnlyTask = ACE_BASE_ONLY_TASKS.includes(task);
    const selectedBaseModel = isBaseOnlyTask
      ? await resolveAceBaseCheckpoint(config.url!, authHeaders, task, signal)
      : undefined;

    progress('Submitting audio generation…');
    const isFullSong = request.kind === 'audio';
    const isUltraEngine = request.engine === 'ace-step-2.5';
    const hasUploadedAudio = Boolean(request.sourceAudio || request.referenceAudio);

    let reply: any;
    if (task === 'text2music' && !hasUploadedAudio) {
      // Unchanged text2music JSON path.
      const defaultInstrumentalArrangement = isFullSong
        ? '[Instrumental]\n[Intro - Atmospheric Motif & Texture]\n[Verse - Tight Pocket Groove & Bassline]\n[Chorus - Full Harmonic Lift & Layered Arrangement]\n[Bridge - Dynamic Breakdown]\n[Outro - Warm Fade]'
        : '[Instrumental]';
      const studioPrompt = request.kind === 'sample'
        ? `${request.prompt}. Isolated musical sample, no vocals.`
        : `${request.prompt}. Studio master quality, wide stereo separation, crisp transient definition, rich harmonic arrangement.`;
      reply = await post('/release_task', {
        prompt: studioPrompt,
        lyrics: request.lyrics || defaultInstrumentalArrangement, audio_duration: Math.max(10, request.seconds),
        bpm: Math.round(request.bpm), key_scale: request.key, time_signature: '4',
        seed: request.seed, use_random_seed: false, batch_size: 1, audio_format: 'wav',
        thinking: isFullSong && !!config.aceThinking, use_cot_caption: false, use_cot_language: false, use_format: false,
        inference_steps: isUltraEngine ? 16 : 8, infer_method: 'ode', shift: 3.0,
        // Omit dcw_enabled: this runtime resolves it by checkpoint. Forcing it on
        // incompatible checkpoints can distort audio (upstream issue #1259).
        task_type: 'text2music',
        ...(request.vocalLanguage ? { vocal_language: request.vocalLanguage } : {}),
      });
    } else {
      // ACE-Step 1.5 documented edit / reference-audio modes (`docs/en/API.md` & `INFERENCE.md`).
      // Note: LM thinking is automatically ignored by ACE-Step for cover, repaint, and extract.
      const supportsThinking = task === 'text2music' || task === 'lego' || task === 'complete';
      const steps = isBaseOnlyTask ? (isUltraEngine ? 64 : 32) : (isUltraEngine ? 16 : 8);
      const fields: Record<string, unknown> = {
        prompt: task === 'text2music'
          ? (request.kind === 'sample'
            ? `${request.prompt}. Isolated musical sample, no vocals.`
            : `${request.prompt}. Studio master quality, wide stereo separation, crisp transient definition, rich harmonic arrangement.`)
          : request.prompt,
        lyrics: request.lyrics || (task === 'extract' ? '' : '[Instrumental]'),
        audio_duration: Math.max(10, request.seconds),
        bpm: Math.round(request.bpm),
        key_scale: request.key,
        time_signature: '4',
        seed: request.seed,
        use_random_seed: false,
        batch_size: 1,
        audio_format: 'wav',
        thinking: supportsThinking && isFullSong && !!config.aceThinking,
        use_cot_caption: false,
        use_cot_language: false,
        use_format: false,
        inference_steps: steps,
        infer_method: 'ode',
        shift: isBaseOnlyTask ? 1.0 : 3.0,
        task_type: task,
      };
      if (request.vocalLanguage) fields.vocal_language = request.vocalLanguage;
      if (selectedBaseModel) fields.model = selectedBaseModel;

      if (task === 'repaint') {
        fields.repainting_start = request.windowStartSec!;
        fields.repainting_end = request.windowEndSec!;
        fields.chunk_mask_mode = 'explicit';
      } else if (task === 'cover') {
        fields.audio_cover_strength = request.coverStrength ?? 1.0;
      } else if (task === 'text2music' && request.referenceAudio) {
        fields.audio_cover_strength = request.coverStrength ?? 0.2;
      } else if (task === 'lego') {
        fields.track_name = request.trackName!;
        fields.instruction = `Generate the ${request.trackName!.toUpperCase()} track based on the audio context:`;
        if (request.globalCaption) fields.global_caption = request.globalCaption;
        if (request.windowStartSec !== undefined) fields.repainting_start = request.windowStartSec;
        if (request.windowEndSec !== undefined) fields.repainting_end = request.windowEndSec;
      } else if (task === 'extract') {
        fields.track_name = request.trackName!;
        fields.instruction = `Extract the ${request.trackName!.toUpperCase()} track from the audio:`;
      } else if (task === 'complete') {
        if (request.trackClasses?.length) {
          fields.track_classes = request.trackClasses;
          fields.instruction = `Complete the input track with ${request.trackClasses.map(t => t.toUpperCase()).join(' | ')}:`;
        }
      }

      const files: Record<string, Buffer> = {};
      if (request.sourceAudio) files.src_audio = Buffer.from(request.sourceAudio, 'base64');
      if (request.referenceAudio) files.reference_audio = Buffer.from(request.referenceAudio, 'base64');
      reply = await postMultipart('/release_task', fields, files);
    }

    const taskId = reply.data?.task_id;
    if (typeof taskId !== 'string' || !taskId) throw new Error('ACE-Step did not return a task ID');
    progress('Generating audio on ACE-Step…');
    for (;;) {
      await delay(1500, undefined, { signal });
      const url = aceStepAudioUrl(await post('/query_result', { task_id_list: [taskId] }), taskId, config.url!);
      if (!url) continue;
      progress('Receiving generated audio…');
      const audio = await boundedBytes(await fetch(url, { headers, signal, redirect: 'error' }), 50000000);
      return { audio, mime: 'audio/wav', warning: request.kind === 'sample' ? 'ACE-Step generates at least 10 seconds. Choose a region from the preview for your sample.' : undefined };
    }
  }
  if (!config.python || !config.model) throw new Error('Python runtime and local model directory are required');
  const dir = await mkdtemp(path.join(tmpdir(), 'melos-generation-'));
  try {
    await writeFile(path.join(dir, 'request.json'), JSON.stringify({ ...request, model: config.model }));
    const script = resolveWorkerScript('music_lab_worker.py');
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
